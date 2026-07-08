import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { loadEnvConfig } from "@next/env";
import { normalizeBuilderData } from "../lib/characterBuilder/core";
import {
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  powerPointPool,
  signatureMovePointPool,
  summarizeCharacterPowers,
  validateCharacterPowers,
  type CharacterPower,
} from "../lib/characterBuilder/powers";
import {
  DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  normalizeCharacterPowerSpendScalar,
} from "../lib/config/characterBuilderTuningShared";
import { normalizePowerTuningValues, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import { normalizeCombatTuning, normalizeCombatTuningFlatValues } from "../lib/config/combatTuningShared";
import {
  normalizeOutcomeNormalizationValues,
  outcomeNormalizationValuesToCalculatorConfig,
} from "../lib/config/outcomeNormalizationShared";
import {
  computeMonsterOutcomes,
} from "../lib/calculators/monsterOutcomeCalculator";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import {
  adaptCampaignCharacterToCombatActor,
  adaptMonsterToCombatLabActor,
} from "../lib/combat-lab/liveAdapters";
import { buildForgeOutputProfile, type ForgeOutputProfileInput } from "../lib/forge/outputProfile";
import { compareForgeOutputToBands } from "../lib/forge/outputBands";
import { evaluateAttributeBalancingGuide } from "../lib/summoning/attributeBalancingGuide";
import type { EffectPacket, MonsterCalculatorArchetype, MonsterTier } from "../lib/summoning/types";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const CHARACTER_BUILDER_TUNING_ID = "default";

loadEnvConfig(process.cwd());

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];

let prisma: PrismaClientInstance | null = null;

function db(): PrismaClientInstance {
  if (!prisma) throw new Error("Prisma client was not loaded.");
  return prisma;
}

const CHARACTER_NAMES = [
  "BALANCE_Arcane Sage",
  "BALANCE_Ranger Commander",
  "BALANCE_Stoneguard",
  "BALANCE_Hawkshot Archer",
];

const MONSTER_NAMES = [
  "BALANCE_Physical Striker",
  "BALANCE_Mental Wailer",
  "BALANCE_Control Hexer",
  "BALANCE_Dodge Pressure Skirmisher",
  "BALANCE_Durable Soldier",
];

type CliOptions = {
  json: boolean;
  out: string | null;
};

type TuningSnapshot = {
  setId: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: string;
  values: Record<string, number>;
};

type MonsterOutcomeInput = Parameters<typeof computeMonsterOutcomes>[0];
type CombatTuningValues = ReturnType<typeof normalizeCombatTuning>;

type FormulaPowerExample = {
  key: string;
  name: string;
  descriptorSummary: string;
  basePowerValue: number | null;
  playerPowerSpend: number | null;
  derivedCooldownTurns: number | null;
  validationErrors: string[];
  warnings: string[];
  keyVariables: Record<string, unknown>;
  breakdown: {
    sharedContextCost: number | null;
    accessCost: number | null;
    packetCountComplexityCost: number | null;
    crossPacketSynergyCost: number | null;
    runtimeOngoingDamageCost: number | null;
  };
};

type RatioRow = {
  label: string;
  numeratorKey: string;
  denominatorKey: string;
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  note: string;
};

type Report = {
  provenance: Record<string, unknown>;
  characterPowerExamples: FormulaPowerExample[];
  formulaRatios: RatioRow[];
  monsterOutcomeExamples: Array<Record<string, unknown>>;
  forgeExamples: Array<Record<string, unknown>>;
  balanceEnvironment: {
    campaignId: string;
    campaignName: string;
    warning: string;
    characters: Array<Record<string, unknown>>;
    monsters: Array<Record<string, unknown>>;
  };
  redFlags: string[];
};

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = { json: false, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--out") {
      const next = argv[index + 1];
      if (!next) throw new Error("--out requires a path.");
      options.out = next;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: npx --yes tsx scripts/formulaArchitecture.examples.ts [--json] [--out <path>]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function runGit(args: string[]) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  return result.status === 0 ? result.stdout.trim() : "UNKNOWN";
}

function entriesToRecord(entries: Array<{ key?: string; configKey?: string; value: unknown }>) {
  return Object.fromEntries(entries.map((entry) => [entry.key ?? entry.configKey ?? "", Number(entry.value)]));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function round(value: number | null | undefined, digits = 3): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function readActiveSnapshot<T extends { id: string; name: string; slug: string; status: string; updatedAt: Date; entries: Array<{ key?: string; configKey?: string; value: unknown }> }>(
  set: T | null,
  normalize: (values: Record<string, number>) => Record<string, number>,
): TuningSnapshot | null {
  if (!set) return null;
  return {
    setId: set.id,
    name: set.name,
    slug: set.slug,
    status: set.status,
    updatedAt: set.updatedAt.toISOString(),
    values: normalize(entriesToRecord(set.entries)),
  };
}

function attackPacket(params: {
  packetIndex?: number;
  diceCount?: number;
  potency?: number;
  damageTypes?: string[];
  effectDurationType?: EffectPacket["effectDurationType"];
  effectDurationTurns?: number | null;
  secondaryDependencyMode?: EffectPacket["secondaryDependencyMode"];
  applyTo?: "PRIMARY_TARGET" | "ALLIES" | "SELF";
} = {}) {
  const packet = {
    ...createDefaultCharacterPowerPacket("ATTACK", params.packetIndex ?? 0),
    diceCount: params.diceCount ?? 2,
    potency: params.potency ?? 2,
    hostility: "HOSTILE" as const,
    dealsWounds: true,
    effectTimingType: "ON_CAST" as const,
    effectDurationType: params.effectDurationType ?? "INSTANT",
    effectDurationTurns: params.effectDurationTurns ?? null,
    secondaryDependencyMode: params.secondaryDependencyMode,
    applyTo: params.applyTo,
    detailsJson: {
      attackMode: "PHYSICAL",
      dealsWounds: true,
      damageTypes: params.damageTypes ?? ["Slashing"],
      applyTo: params.applyTo ?? "PRIMARY_TARGET",
    },
  };
  return packet;
}

function healingPacket(params: {
  packetIndex: number;
  potency?: number;
  secondaryDependencyMode?: EffectPacket["secondaryDependencyMode"];
  applyTo?: "PRIMARY_TARGET" | "ALLIES" | "SELF";
}) {
  return {
    ...createDefaultCharacterPowerPacket("HEALING", params.packetIndex),
    diceCount: 1,
    potency: params.potency ?? 2,
    hostility: "NON_HOSTILE" as const,
    effectTimingType: "ON_CAST" as const,
    effectDurationType: "INSTANT" as const,
    secondaryDependencyMode: params.secondaryDependencyMode,
    applyTo: params.applyTo ?? "SELF",
    detailsJson: {
      applyTo: params.applyTo ?? "SELF",
    },
  };
}

function defencePacket(params: {
  mode: "Block" | "Dodge" | "Resist";
  pool?: "physical" | "mental";
  resistedAttribute?: string;
  potency?: number;
}) {
  return {
    ...createDefaultCharacterPowerPacket("DEFENCE", 0),
    diceCount: 2,
    potency: params.potency ?? 2,
    hostility: "NON_HOSTILE" as const,
    effectTimingType: "ON_CAST" as const,
    effectDurationType: "TURNS" as const,
    effectDurationTurns: 2,
    detailsJson: {
      defenceMode: params.mode,
      pool: params.pool ?? "physical",
      resistedAttribute: params.resistedAttribute,
      rangeCategory: "MELEE",
      rangeValue: 1,
      rangeExtra: {},
      applyTo: "SELF",
    },
  };
}

function debuffPacket() {
  return {
    ...createDefaultCharacterPowerPacket("DEBUFF", 0),
    diceCount: 2,
    potency: 2,
    hostility: "HOSTILE" as const,
    effectTimingType: "ON_CAST" as const,
    effectDurationType: "TURNS" as const,
    effectDurationTurns: 1,
    detailsJson: {
      statTarget: "Attack",
      resistAttribute: "ATTACK",
      rangeCategory: "RANGED",
      rangeValue: 60,
      rangeExtra: { targets: 1 },
    },
  };
}

function controlPacket() {
  return {
    ...createDefaultCharacterPowerPacket("CONTROL", 0),
    diceCount: 2,
    potency: 1,
    hostility: "HOSTILE" as const,
    effectTimingType: "ON_CAST" as const,
    effectDurationType: "TURNS" as const,
    effectDurationTurns: 1,
    detailsJson: {
      controlMode: "Force no main action",
      controlTheme: "MIND_COGNITION",
      resistAttribute: "INTELLECT",
      rangeCategory: "RANGED",
      rangeValue: 60,
      rangeExtra: { targets: 1 },
    },
  };
}

function makeCharacterPower(params: {
  key: string;
  name: string;
  range: "MELEE" | "RANGED" | "AOE";
  meleeTargets?: number;
  rangedTargets?: number;
  rangedDistanceFeet?: number;
  aoeCount?: number;
  aoeCenterRangeFeet?: number;
  aoeSphereRadiusFeet?: number;
  packets: EffectPacket[];
}): CharacterPower & { exampleKey: string } {
  const rangeDetails =
    params.range === "MELEE"
      ? {
          rangeCategory: "MELEE",
          rangeValue: params.meleeTargets ?? 1,
          rangeExtra: {},
        }
      : params.range === "RANGED"
        ? {
            rangeCategory: "RANGED",
            rangeValue: params.rangedDistanceFeet ?? 60,
            rangeExtra: { targets: params.rangedTargets ?? 1 },
          }
        : {
            rangeCategory: "AOE",
            rangeValue: params.aoeCenterRangeFeet ?? 30,
            rangeExtra: {
              count: params.aoeCount ?? 1,
              shape: "SPHERE",
              sphereRadiusFeet: params.aoeSphereRadiusFeet ?? 10,
            },
          };
  const power = {
    ...createDefaultCharacterPower(0),
    id: params.key,
    name: params.name,
    descriptorChassis: "IMMEDIATE" as const,
    commitmentModifier: "STANDARD" as const,
    counterMode: "NO" as const,
    rangeCategories: [params.range],
    meleeTargets: params.range === "MELEE" ? params.meleeTargets ?? 1 : null,
    rangedTargets: params.range === "RANGED" ? params.rangedTargets ?? 1 : null,
    rangedDistanceFeet: params.range === "RANGED" ? params.rangedDistanceFeet ?? 60 : null,
    aoeCenterRangeFeet: params.range === "AOE" ? params.aoeCenterRangeFeet ?? 30 : null,
    aoeCount: params.range === "AOE" ? params.aoeCount ?? 1 : null,
    aoeShape: params.range === "AOE" ? "SPHERE" as const : null,
    aoeSphereRadiusFeet: params.range === "AOE" ? params.aoeSphereRadiusFeet ?? 10 : null,
    effectPackets: params.packets.map((packet, index) => ({
      ...packet,
      packetIndex: index,
      detailsJson: {
        ...asRecord(packet.detailsJson),
        ...rangeDetails,
      },
    })),
    intentions: [] as EffectPacket[],
    exampleKey: params.key,
  };
  power.intentions = power.effectPackets;
  return power;
}

function descriptorSummary(lines: string[]) {
  const compact = lines.join(" | ").replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function summarizePowerExamples(params: {
  powers: Array<CharacterPower & { exampleKey: string }>;
  level: number;
  powerTuning: PowerTuningSnapshot | null;
  playerPowerSpendScalar: number;
  signatureMoveKeys?: Set<string>;
}) {
  return params.powers.map((power) => {
    const summary = summarizeCharacterPowers({
      level: params.level,
      powers: [power],
      tuningSnapshot: params.powerTuning,
      playerPowerSpendScalar: params.playerPowerSpendScalar,
      powerPool: params.signatureMoveKeys?.has(power.exampleKey)
        ? signatureMovePointPool(params.level)
        : powerPointPool(params.level),
    });
    const row = summary.powers[0];
    const breakdown = row?.costValid
      ? row.basePowerValue !== null
        ? row
        : null
      : null;
    const resolvedBreakdown = row?.costValid
      ? row
      : null;
    const validationErrors = validateCharacterPowers({
      level: params.level,
      powers: [power],
      tuningSnapshot: params.powerTuning,
      playerPowerSpendScalar: params.playerPowerSpendScalar,
      powerPool: params.signatureMoveKeys?.has(power.exampleKey)
        ? signatureMovePointPool(params.level)
        : powerPointPool(params.level),
      powerLabel: params.signatureMoveKeys?.has(power.exampleKey) ? "Signature Move" : "Power",
      poolDescription: params.signatureMoveKeys?.has(power.exampleKey)
        ? "Character Level x 20"
        : "Character Level x 50",
    });
    const resolverBreakdown = row?.costValid
      ? summary.powers[0]?.basePowerValue
      : null;
    const packet = power.effectPackets[0];
    const details = packet?.detailsJson && typeof packet.detailsJson === "object"
      ? packet.detailsJson as Record<string, unknown>
      : {};
    const costBreakdown = row?.costValid
      ? row.power
      : null;

    return {
      key: power.exampleKey,
      name: power.name,
      descriptorSummary: descriptorSummary(row?.descriptorLines ?? []),
      basePowerValue: row?.basePowerValue ?? null,
      playerPowerSpend: row?.spend ?? null,
      derivedCooldownTurns: row?.derivedCooldownTurns ?? null,
      validationErrors,
      warnings: row?.warnings ?? [],
      keyVariables: {
        range: power.rangeCategories?.[0] ?? "SELF",
        meleeTargets: power.meleeTargets,
        rangedTargets: power.rangedTargets,
        rangedDistanceFeet: power.rangedDistanceFeet,
        aoeCount: power.aoeCount,
        aoeShape: power.aoeShape,
        diceCount: packet?.diceCount,
        potency: packet?.potency,
        damageTypes: details.damageTypes,
        packetCount: power.effectPackets.length,
        duration: packet?.effectDurationType,
        durationTurns: packet?.effectDurationTurns,
        secondaryDependencyMode: power.effectPackets[1]?.secondaryDependencyMode ?? null,
        signatureMovePool: params.signatureMoveKeys?.has(power.exampleKey)
          ? signatureMovePointPool(params.level)
          : null,
      },
      breakdown: {
        sharedContextCost: breakdown ? null : null,
        accessCost: resolvedBreakdown ? null : null,
        packetCountComplexityCost: costBreakdown ? null : null,
        crossPacketSynergyCost: resolverBreakdown ? null : null,
        runtimeOngoingDamageCost: null,
      },
    } satisfies FormulaPowerExample;
  });
}

function addResolverBreakdowns(
  rows: FormulaPowerExample[],
  powers: Array<CharacterPower & { exampleKey: string }>,
  powerTuning: PowerTuningSnapshot | null,
) {
  const resolverRows = resolvePowerCosts(powers, powerTuning ?? undefined, { level: 3, tier: "SOLDIER" });
  for (const [index, row] of rows.entries()) {
    const breakdown = resolverRows.powers[index]?.breakdown;
    row.breakdown = {
      sharedContextCost: breakdown?.sharedContextCost ?? null,
      accessCost: breakdown?.accessCost ?? null,
      packetCountComplexityCost: breakdown?.packetCountComplexityCost ?? null,
      crossPacketSynergyCost: breakdown?.crossPacketSynergyCost ?? null,
      runtimeOngoingDamageCost: breakdown?.runtimeOngoingDamageCost ?? null,
    };
  }
}

function ratio(label: string, rows: Map<string, FormulaPowerExample>, numeratorKey: string, denominatorKey: string, note: string): RatioRow {
  const numerator = rows.get(numeratorKey)?.basePowerValue ?? null;
  const denominator = rows.get(denominatorKey)?.basePowerValue ?? null;
  return {
    label,
    numeratorKey,
    denominatorKey,
    ratio: numerator !== null && denominator !== null && denominator !== 0 ? round(numerator / denominator) : null,
    numerator,
    denominator,
    note,
  };
}

function requireRatioBand(
  rows: RatioRow[],
  label: string,
  minInclusive: number,
  maxInclusive: number,
) {
  const row = rows.find((entry) => entry.label === label);
  if (!row || row.ratio === null) {
    throw new Error(`Missing Formula Architecture ratio assertion row: ${label}`);
  }
  if (row.ratio < minInclusive || row.ratio > maxInclusive) {
    throw new Error(
      `Formula Architecture ratio ${label} expected ${minInclusive}-${maxInclusive}, got ${row.ratio}.`,
    );
  }
}

function assertPhase1AttackFormulaRatios(rows: RatioRow[]) {
  requireRatioBand(rows, "melee 2 / melee 1", 1.35, 1.8);
  requireRatioBand(rows, "ranged 2 targets / ranged 1 target", 1.35, 1.85);
  requireRatioBand(rows, "AoE count 3 / AoE count 1", 1.8, 2.35);
  // High W/S pressure now intentionally raises extreme packet economics above the old linear-ish band.
  requireRatioBand(rows, "potency 4 / potency 1", 5, 5.4);
  requireRatioBand(rows, "dice 4 / dice 1", 2.4, 3.4);
  requireRatioBand(rows, "two damage types / one damage type", 1.1, 1.45);
}

function createCharacterPowerExamples() {
  const baseline = makeCharacterPower({
    key: "baseline-melee-1",
    name: "A. Baseline Melee Attack",
    range: "MELEE",
    meleeTargets: 1,
    packets: [attackPacket({ diceCount: 2, potency: 2, damageTypes: ["Slashing"] })],
  });

  const examples: Array<CharacterPower & { exampleKey: string }> = [
    baseline,
    makeCharacterPower({
      key: "melee-2",
      name: "B. Same Payload Melee 2 Targets",
      range: "MELEE",
      meleeTargets: 2,
      packets: [attackPacket({ diceCount: 2, potency: 2, damageTypes: ["Slashing"] })],
    }),
    makeCharacterPower({
      key: "ranged-60-1",
      name: "C. Same Payload Ranged 60 ft, 1 Target",
      range: "RANGED",
      rangedDistanceFeet: 60,
      rangedTargets: 1,
      packets: [attackPacket({ diceCount: 2, potency: 2, damageTypes: ["Slashing"] })],
    }),
    makeCharacterPower({
      key: "ranged-60-2",
      name: "D. Same Payload Ranged 60 ft, 2 Targets",
      range: "RANGED",
      rangedDistanceFeet: 60,
      rangedTargets: 2,
      packets: [attackPacket({ diceCount: 2, potency: 2, damageTypes: ["Slashing"] })],
    }),
    makeCharacterPower({
      key: "aoe-count-1",
      name: "E. Same Payload AoE Sphere Count 1",
      range: "AOE",
      aoeCount: 1,
      aoeCenterRangeFeet: 30,
      aoeSphereRadiusFeet: 10,
      packets: [attackPacket({ diceCount: 2, potency: 2, damageTypes: ["Slashing"] })],
    }),
    makeCharacterPower({
      key: "aoe-count-3",
      name: "F. Same Payload AoE Sphere Count 3",
      range: "AOE",
      aoeCount: 3,
      aoeCenterRangeFeet: 30,
      aoeSphereRadiusFeet: 10,
      packets: [attackPacket({ diceCount: 2, potency: 2, damageTypes: ["Slashing"] })],
    }),
    ...[1, 2, 4, 8].map((potency) =>
      makeCharacterPower({
        key: `potency-${potency}`,
        name: `G. Potency ${potency}`,
        range: "MELEE",
        meleeTargets: 1,
        packets: [attackPacket({ diceCount: 2, potency, damageTypes: ["Slashing"] })],
      }),
    ),
    ...[1, 2, 4, 8].map((diceCount) =>
      makeCharacterPower({
        key: `dice-${diceCount}`,
        name: `H. Dice ${diceCount}`,
        range: "MELEE",
        meleeTargets: 1,
        packets: [attackPacket({ diceCount, potency: 2, damageTypes: ["Slashing"] })],
      }),
    ),
    makeCharacterPower({
      key: "damage-types-1",
      name: "I. One Damage Type",
      range: "MELEE",
      meleeTargets: 1,
      packets: [attackPacket({ diceCount: 2, potency: 2, damageTypes: ["Slashing"] })],
    }),
    makeCharacterPower({
      key: "damage-types-2",
      name: "I. Two Damage Types",
      range: "MELEE",
      meleeTargets: 1,
      packets: [attackPacket({ diceCount: 2, potency: 2, damageTypes: ["Slashing", "Psychic"] })],
    }),
    makeCharacterPower({
      key: "duration-instant",
      name: "J. Instant Direct Attack",
      range: "MELEE",
      meleeTargets: 1,
      packets: [attackPacket({ diceCount: 2, potency: 2, damageTypes: ["Slashing"] })],
    }),
    makeCharacterPower({
      key: "duration-ongoing-2",
      name: "J. Ongoing Attack 2 Turns",
      range: "MELEE",
      meleeTargets: 1,
      packets: [
        attackPacket({
          diceCount: 2,
          potency: 2,
          damageTypes: ["Slashing"],
          effectDurationType: "TURNS",
          effectDurationTurns: 2,
        }),
      ],
    }),
    makeCharacterPower({
      key: "secondary-independent",
      name: "K. Independent Secondary Attack + Heal",
      range: "MELEE",
      meleeTargets: 1,
      packets: [
        attackPacket({ diceCount: 2, potency: 2, damageTypes: ["Slashing"] }),
        healingPacket({ packetIndex: 1, potency: 2, secondaryDependencyMode: "INDEPENDENT", applyTo: "SELF" }),
      ],
    }),
    makeCharacterPower({
      key: "secondary-linked",
      name: "K. Linked Secondary Attack + Heal",
      range: "MELEE",
      meleeTargets: 1,
      packets: [
        attackPacket({ diceCount: 2, potency: 2, damageTypes: ["Slashing"] }),
        healingPacket({ packetIndex: 1, potency: 2, secondaryDependencyMode: "LINKED_TO_PRIMARY", applyTo: "SELF" }),
      ],
    }),
    makeCharacterPower({
      key: "defence-physical-block",
      name: "L. Physical Block Pool",
      range: "MELEE",
      meleeTargets: 1,
      packets: [defencePacket({ mode: "Block", pool: "physical", potency: 2 })],
    }),
    makeCharacterPower({
      key: "defence-dodge",
      name: "L. Dodge Pool",
      range: "MELEE",
      meleeTargets: 1,
      packets: [defencePacket({ mode: "Dodge", potency: 2 })],
    }),
    makeCharacterPower({
      key: "defence-resist",
      name: "L. Resist Pool",
      range: "MELEE",
      meleeTargets: 1,
      packets: [defencePacket({ mode: "Resist", resistedAttribute: "Attack", potency: 2 })],
    }),
    makeCharacterPower({
      key: "debuff-attack",
      name: "M. Simple Attack Debuff",
      range: "RANGED",
      rangedDistanceFeet: 60,
      rangedTargets: 1,
      packets: [debuffPacket()],
    }),
    makeCharacterPower({
      key: "control-no-main",
      name: "M. Simple Control",
      range: "RANGED",
      rangedDistanceFeet: 60,
      rangedTargets: 1,
      packets: [controlPacket()],
    }),
    makeCharacterPower({
      key: "signature-baseline",
      name: "N. Signature Move Baseline Attack",
      range: "MELEE",
      meleeTargets: 1,
      packets: [attackPacket({ diceCount: 2, potency: 2, damageTypes: ["Slashing"] })],
    }),
  ];
  return examples;
}

const physicalSlashDamage = [{ name: "Slashing", mode: "PHYSICAL" as const }];

function disabledMeleeAttackConfig() {
  return {
    enabled: false,
    targets: 0,
    physicalStrength: 0,
    mentalStrength: 0,
    damageTypes: [],
    attackEffects: [],
  };
}

function disabledRangedAttackConfig() {
  return {
    enabled: false,
    targets: 0,
    distance: 0,
    physicalStrength: 0,
    mentalStrength: 0,
    damageTypes: [],
    attackEffects: [],
  };
}

function disabledAoeAttackConfig() {
  return {
    enabled: false,
    count: 0,
    centerRange: 0,
    shape: "SPHERE" as const,
    sphereRadiusFeet: 0,
    physicalStrength: 0,
    mentalStrength: 0,
    damageTypes: [],
    attackEffects: [],
  };
}

function createMonsterBase(overrides: Partial<MonsterOutcomeInput> = {}): MonsterOutcomeInput {
  return {
    id: "synthetic-monster",
    name: "Synthetic Monster",
    level: 3,
    tier: "SOLDIER",
    legendary: false,
    attackDie: "D8",
    guardDie: "D8",
    fortitudeDie: "D8",
    intellectDie: "D8",
    synergyDie: "D8",
    braveryDie: "D8",
    attackResistDie: 0,
    guardResistDie: 0,
    fortitudeResistDie: 0,
    intellectResistDie: 0,
    synergyResistDie: 0,
    braveryResistDie: 0,
    physicalResilienceMax: 32,
    mentalPerseveranceMax: 28,
    physicalProtection: 0,
    mentalProtection: 0,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 0,
    attacks: [
      {
        id: "synthetic-natural-attack",
        attackName: "Synthetic Strike",
        attackMode: "NATURAL",
        attackConfig: {
          melee: {
            enabled: true,
            targets: 1,
            physicalStrength: 2,
            mentalStrength: 0,
            damageTypes: physicalSlashDamage,
            attackEffects: [],
          },
          ranged: disabledRangedAttackConfig(),
          aoe: disabledAoeAttackConfig(),
        },
      },
    ],
    ...overrides,
  } as MonsterOutcomeInput;
}

function createMonsterOutcomeExamples(calculatorConfig: Parameters<typeof computeMonsterOutcomes>[1]) {
  const rows = [
    {
      key: "attack-d6",
      name: "A. Same Attack, Attack D6",
      monster: createMonsterBase({ attackDie: "D6" }),
      notes: "Same natural attack profile, lower Attack die.",
    },
    {
      key: "attack-d12",
      name: "A. Same Attack, Attack D12",
      monster: createMonsterBase({ attackDie: "D12" }),
      notes: "Same natural attack profile, higher Attack die.",
    },
    ...[1, 2, 3].map((strength) => ({
      key: `strength-${strength}`,
      name: `B. Physical Strength ${strength}`,
      monster: createMonsterBase({
        attacks: [
          {
            id: `strength-${strength}`,
            sortOrder: 0,
            attackName: `Strength ${strength} Strike`,
            attackMode: "NATURAL",
            attackConfig: {
              melee: {
                enabled: true,
                targets: 1,
                physicalStrength: strength,
                mentalStrength: 0,
                damageTypes: physicalSlashDamage,
                attackEffects: [],
              },
              ranged: disabledRangedAttackConfig(),
              aoe: disabledAoeAttackConfig(),
            },
          },
        ],
      }),
      notes: "Same monster body, varied natural attack strength.",
    })),
    {
      key: "multi-target",
      name: "C. Same Attack, 3 Melee Targets",
      monster: createMonsterBase({
        attacks: [
          {
            id: "multi-target",
            sortOrder: 0,
            attackName: "Cleave",
            attackMode: "NATURAL",
            attackConfig: {
              melee: {
                enabled: true,
                targets: 3,
                physicalStrength: 2,
                mentalStrength: 0,
                damageTypes: physicalSlashDamage,
                attackEffects: [],
              },
              ranged: disabledRangedAttackConfig(),
              aoe: disabledAoeAttackConfig(),
            },
          },
        ],
      }),
      notes: "Current calculator applies target multiplier to at-will contribution.",
    },
    {
      key: "aoe-count-3",
      name: "C. Same Attack, AoE Count 3",
      monster: createMonsterBase({
        attacks: [
          {
            id: "aoe-count-3",
            sortOrder: 0,
            attackName: "Burst",
            attackMode: "NATURAL",
            attackConfig: {
              melee: disabledMeleeAttackConfig(),
              ranged: disabledRangedAttackConfig(),
              aoe: {
                enabled: true,
                count: 3,
                centerRange: 30,
                shape: "SPHERE",
                sphereRadiusFeet: 10,
                physicalStrength: 2,
                mentalStrength: 0,
                damageTypes: physicalSlashDamage,
                attackEffects: [],
              },
            },
          },
        ],
      }),
      notes: "Current calculator uses AoE multiplier x count.",
    },
    ...[0, 2, 4].map((protection) => ({
      key: `protection-${protection}`,
      name: `D. Physical Protection ${protection}`,
      monster: createMonsterBase({
        physicalProtection: protection,
        naturalPhysicalProtection: protection,
        guardDie: "D8",
        fortitudeDie: "D8",
      }),
      notes: "Same HP, varied physical protection.",
    })),
    {
      key: "control-low-intellect",
      name: "E. Low Intellect Control Body",
      monster: createMonsterBase({ intellectDie: "D6" }),
      notes: "No explicit control packet in outcome model; shows body-only effect.",
    },
    {
      key: "control-high-intellect",
      name: "E. High Intellect Control Body",
      monster: createMonsterBase({ intellectDie: "D12" }),
      notes: "No explicit control packet in outcome model; shows body-only effect.",
    },
  ];

  return rows.map((row) => {
    const profile = computeMonsterOutcomes(row.monster, calculatorConfig);
    return {
      key: row.key,
      name: row.name,
      notes: row.notes,
      physicalThreat: round(profile.radarAxes.physicalThreat),
      mentalThreat: round(profile.radarAxes.mentalThreat),
      physicalSurvivability: round(profile.radarAxes.physicalSurvivability),
      mentalSurvivability: round(profile.radarAxes.mentalSurvivability),
      manipulation: round(profile.radarAxes.manipulation),
      synergy: round(profile.radarAxes.synergy),
      mobility: round(profile.radarAxes.mobility),
      presence: round(profile.radarAxes.presence),
      unsupportedOrMissing: row.key.startsWith("control")
        ? "Control/debuff authored packet contribution is not represented in this synthetic example."
        : row.key.includes("reroll")
          ? "Reroll/trait contribution not modeled here."
          : null,
    };
  });
}

function createForgeExamples() {
  const rows: Array<{ key: string; name: string; input: ForgeOutputProfileInput }> = [
    ...[1, 2, 3].map((strength) => ({
      key: `one-hand-melee-${strength}`,
      name: `A. One-Handed Melee Strength ${strength}`,
      input: {
        level: 3,
        rarity: "COMMON",
        type: "WEAPON",
        size: "ONE_HANDED",
        rangeCategories: ["MELEE"],
        meleePhysicalStrength: strength,
        meleeTargets: 1,
        meleeDamageTypeNames: ["Slashing"],
      } satisfies ForgeOutputProfileInput,
    })),
    ...[1, 2, 3].map((strength) => ({
      key: `ranged-${strength}`,
      name: `B. Ranged Strength ${strength}`,
      input: {
        level: 3,
        rarity: "COMMON",
        type: "WEAPON",
        size: "ONE_HANDED",
        rangeCategories: ["RANGED"],
        rangedPhysicalStrength: strength,
        rangedTargets: 1,
        rangedDistanceFeet: 60,
        rangedDamageTypeNames: ["Piercing"],
      } satisfies ForgeOutputProfileInput,
    })),
    ...[1, 2, 3].map((ppv) => ({
      key: `armour-ppv-${ppv}`,
      name: `C. Armour PPV ${ppv}`,
      input: {
        level: 3,
        rarity: "COMMON",
        type: "ARMOR",
        armorLocation: "TORSO",
        ppv,
        mpv: 0,
      } satisfies ForgeOutputProfileInput,
    })),
    ...[1, 2, 3].map((mpv) => ({
      key: `armour-mpv-${mpv}`,
      name: `D. Armour MPV ${mpv}`,
      input: {
        level: 3,
        rarity: "COMMON",
        type: "ARMOR",
        armorLocation: "TORSO",
        ppv: 0,
        mpv,
      } satisfies ForgeOutputProfileInput,
    })),
    {
      key: "shield-ppv2-mpv1",
      name: "E. Shield Protection Item",
      input: {
        level: 3,
        rarity: "COMMON",
        type: "SHIELD",
        size: "SMALL",
        ppv: 2,
        mpv: 1,
        shieldHasAttack: false,
      },
    },
    {
      key: "multi-target-weapon",
      name: "F. Multi-Target Weapon Profile",
      input: {
        level: 3,
        rarity: "COMMON",
        type: "WEAPON",
        size: "ONE_HANDED",
        rangeCategories: ["MELEE"],
        meleePhysicalStrength: 2,
        meleeTargets: 2,
        meleeDamageTypeNames: ["Slashing"],
      },
    },
    {
      key: "aoe-weapon",
      name: "F. AoE Weapon Profile",
      input: {
        level: 3,
        rarity: "RARE",
        type: "WEAPON",
        size: "ONE_HANDED",
        rangeCategories: ["AOE"],
        aoePhysicalStrength: 2,
        aoeCount: 3,
        aoeCenterRangeFeet: 30,
        aoeShape: "SPHERE",
        aoeSphereRadiusFeet: 10,
        aoeDamageTypeNames: ["Slashing"],
      },
    },
  ];

  return rows.map((row) => {
    const profile = buildForgeOutputProfile(row.input);
    const bands = compareForgeOutputToBands(profile);
    return {
      key: row.key,
      name: row.name,
      level: profile.common.level,
      rarity: profile.common.rarity,
      type: profile.common.type,
      attackOutput: profile.attackProfiles
        .filter((entry) => entry.enabled)
        .map((entry) => ({
          profileKind: entry.profileKind,
          totalWoundsPerSuccess: entry.totalWoundsPerSuccess,
          targetCount: entry.targetCount,
          totalPressure: entry.totalWoundsPerSuccess * entry.targetCount,
          damageTypes: entry.damageTypeNames,
        })),
      defenceOutput: profile.defensiveProfile,
      outputBand: {
        coreFunctionality: bands.lanes.coreFunctionality.status,
        featuresVersatility: bands.lanes.featuresVersatility.status,
        weaponProfiles: bands.weaponProfiles.map((entry) => ({
          profileKind: entry.profileKind,
          classification: entry.classification,
          totalPressureClassification: entry.totalPressureClassification,
        })),
        ppv: bands.defensive.ppv.classification,
        mpv: bands.defensive.mpv.classification,
      },
      saveBlocking: bands.debug.noSaveBlocking ? "noSaveBlocking/reportOnly" : "unknown",
      combatLabInterpretation: profile.debug.strengthRule,
    };
  });
}

async function createBalanceEnvironmentSummary(
  powerTuning: PowerTuningSnapshot | null,
  combatValues: CombatTuningValues | undefined,
  playerPowerSpendScalar: number,
) {
  const characters = await db().campaignCharacter.findMany({
    where: { campaignId: BALANCE_CAMPAIGN_ID, name: { in: CHARACTER_NAMES } },
    select: {
      id: true,
      name: true,
      level: true,
      builderData: true,
      backpackItems: { include: { partyInventoryItem: { include: { itemTemplate: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const monsters = await db().monster.findMany({
    where: { campaignId: BALANCE_CAMPAIGN_ID, name: { in: MONSTER_NAMES } },
    include: {
      powers: {
        include: { rangeCategories: true, effectPackets: true, primaryDefenceGate: true },
        orderBy: { sortOrder: "asc" },
      },
      attacks: true,
      traits: { include: { trait: true } },
      tags: true,
    },
    orderBy: { name: "asc" },
  });

  const characterRows = characters.map((row) => {
    const builderData = normalizeBuilderData(row.builderData);
    const normalSummary = summarizeCharacterPowers({
      level: row.level,
      powers: builderData.powers,
      tuningSnapshot: powerTuning,
      playerPowerSpendScalar,
    });
    const signatureSummary = summarizeCharacterPowers({
      level: row.level,
      powers: builderData.signatureMove ? [builderData.signatureMove] : [],
      tuningSnapshot: powerTuning,
      playerPowerSpendScalar,
      powerPool: signatureMovePointPool(row.level),
      powerPoolKind: "signature",
      offencePressureMode: "reviewOnly",
    });
    const hydration = adaptCampaignCharacterToCombatActor(row, combatValues, powerTuning, playerPowerSpendScalar);
    return {
      id: row.id,
      name: row.name,
      level: row.level,
      normalPowerSpend: `${normalSummary.totalSpent} / ${normalSummary.powerPool}`,
      signatureMoveSpend: `${signatureSummary.totalSpent} / ${signatureSummary.powerPool}`,
      equippedAttackSources: hydration.actor.actions
        .filter((action) => action.sourceType === "equippedWeapon")
        .map((action) => action.name),
      equippedDefence: {
        physicalProtection: hydration.actor.physicalProtection,
        mentalProtection: hydration.actor.mentalProtection,
        physicalBlockPerSuccess: hydration.actor.physicalBlockPerSuccess,
        mentalBlockPerSuccess: hydration.actor.mentalBlockPerSuccess,
      },
      warningsCount: hydration.warnings.length,
      fallbackCount: hydration.actor.actions.filter((action) => action.id.includes("fallback-basic-attack")).length,
    };
  });

  const monsterRows = monsters.map((row) => {
    const attributeGuide = evaluateAttributeBalancingGuide({
      level: row.level,
      tier: row.tier as MonsterTier,
      archetype: (row.calculatorArchetype ?? "BALANCED") as MonsterCalculatorArchetype,
      attributes: {
        attackDie: row.attackDie,
        guardDie: row.guardDie,
        fortitudeDie: row.fortitudeDie,
        intellectDie: row.intellectDie,
        synergyDie: row.synergyDie,
        braveryDie: row.braveryDie,
      },
    });
    const hydration = adaptMonsterToCombatLabActor(row, new Map(), combatValues ?? normalizeCombatTuning({}), powerTuning);
    return {
      id: row.id,
      name: row.name,
      level: row.level,
      tier: row.tier,
      naturalAttackOutput: row.attacks.map((attack) => ({
        name: attack.attackName,
        config: attack.attackConfig,
      })),
      powerOutput: row.powers.map((power) => power.name),
      attributeBudgetStatus: `${attributeGuide.currentTotal} / ${attributeGuide.expectedTotal} (${attributeGuide.budgetStatus})`,
      warningsCount: hydration.warnings.length,
      fallbackCount: hydration.actor.actions.filter((action) => action.id.includes("fallback-basic-attack")).length,
    };
  });

  return {
    campaignId: BALANCE_CAMPAIGN_ID,
    campaignName: BALANCE_CAMPAIGN_NAME,
    warning: "Hydratable data-path assets only. Not final balance evidence until formula correction/repricing is complete.",
    characters: characterRows,
    monsters: monsterRows,
  };
}

function printHuman(report: Report) {
  console.log("Formula Architecture Examples");
  console.log("=============================");
  console.log(`Commit: ${report.provenance.commitSha}`);
  console.log(`Git status: ${report.provenance.gitStatusShort || "clean"}`);
  console.log(`Power tuning: ${JSON.stringify(report.provenance.activeTuningNames)}`);
  console.log(`Character Builder tuning: ${JSON.stringify(report.provenance.characterBuilderTuning)}`);
  console.log("");

  console.log("Character Builder Power Cost Examples");
  console.table(report.characterPowerExamples.map((entry) => ({
    key: entry.key,
    base: entry.basePowerValue,
    spend: entry.playerPowerSpend,
    cooldown: entry.derivedCooldownTurns,
    errors: entry.validationErrors.length,
    range: entry.keyVariables.range,
    targets: entry.keyVariables.meleeTargets ?? entry.keyVariables.rangedTargets ?? entry.keyVariables.aoeCount,
    dice: entry.keyVariables.diceCount,
    potency: entry.keyVariables.potency,
  })));

  console.log("Formula Ratios");
  console.table(report.formulaRatios);

  console.log("Monster Outcome Calculator Examples");
  console.table(report.monsterOutcomeExamples.map((entry) => ({
    key: entry.key,
    physicalThreat: entry.physicalThreat,
    mentalThreat: entry.mentalThreat,
    physicalSurvivability: entry.physicalSurvivability,
    mentalSurvivability: entry.mentalSurvivability,
    note: entry.unsupportedOrMissing ?? "",
  })));

  console.log("Forge Output Examples");
  console.table(report.forgeExamples.map((entry) => ({
    key: entry.key,
    type: entry.type,
    core: (entry.outputBand as { coreFunctionality?: string }).coreFunctionality,
    feature: (entry.outputBand as { featuresVersatility?: string }).featuresVersatility,
    saveBlocking: entry.saveBlocking,
  })));

  console.log("Balance Environment Read-Only Summary");
  console.table(report.balanceEnvironment.characters.map((entry) => ({
    name: entry.name,
    normalPowerSpend: entry.normalPowerSpend,
    signatureMoveSpend: entry.signatureMoveSpend,
    warnings: entry.warningsCount,
    fallback: entry.fallbackCount,
  })));
  console.table(report.balanceEnvironment.monsters.map((entry) => ({
    name: entry.name,
    attributeBudgetStatus: entry.attributeBudgetStatus,
    warnings: entry.warningsCount,
    fallback: entry.fallbackCount,
  })));

  console.log("Red Flag Summary");
  for (const flag of report.redFlags) console.log(`- ${flag}`);
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  prisma = (await import("../prisma/client")).prisma;
  const [powerSet, combatSet, outcomeSet, characterBuilderTuning] = await Promise.all([
    db().powerTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      include: { entries: true },
      orderBy: { updatedAt: "desc" },
    }),
    db().combatTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      include: { entries: true },
      orderBy: { updatedAt: "desc" },
    }),
    db().outcomeNormalizationConfigSet.findFirst({
      where: { status: "ACTIVE" },
      include: { entries: true },
      orderBy: { updatedAt: "desc" },
    }),
    db().characterBuilderTuning.findUnique({
      where: { id: CHARACTER_BUILDER_TUNING_ID },
      select: { id: true, playerPowerSpendScalar: true, updatedAt: true },
    }).catch(() => null),
  ]);

  const powerTuning = readActiveSnapshot(powerSet, normalizePowerTuningValues) as PowerTuningSnapshot | null;
  const combatSnapshot = readActiveSnapshot(combatSet, normalizeCombatTuningFlatValues);
  const outcomeSnapshot = readActiveSnapshot(outcomeSet, normalizeOutcomeNormalizationValues);
  const combatValues = combatSnapshot ? normalizeCombatTuning(combatSnapshot.values) : undefined;
  const calculatorConfig = outcomeNormalizationValuesToCalculatorConfig(outcomeSnapshot?.values ?? {});
  const playerPowerSpendScalar = normalizeCharacterPowerSpendScalar(
    characterBuilderTuning?.playerPowerSpendScalar ?? DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  );
  const characterBuilderTuningProvenance = {
    id: characterBuilderTuning?.id ?? CHARACTER_BUILDER_TUNING_ID,
    source: characterBuilderTuning ? "characterBuilderTuning.default" : "code-default-fallback",
    playerPowerSpendScalar,
    fallbackUsed: !characterBuilderTuning,
    fallbackScalar: DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
    updatedAt: characterBuilderTuning?.updatedAt?.toISOString() ?? null,
  };

  const syntheticPowers = createCharacterPowerExamples();
  const signatureMoveKeys = new Set(["signature-baseline"]);
  const characterPowerExamples = summarizePowerExamples({
    powers: syntheticPowers,
    level: 3,
    powerTuning,
    playerPowerSpendScalar,
    signatureMoveKeys,
  });
  addResolverBreakdowns(characterPowerExamples, syntheticPowers, powerTuning);

  const byKey = new Map(characterPowerExamples.map((entry) => [entry.key, entry]));
  const formulaRatios = [
    ratio("melee 2 / melee 1", byKey, "melee-2", "baseline-melee-1", "Exposes current target-count pricing."),
    ratio("ranged 2 targets / ranged 1 target", byKey, "ranged-60-2", "ranged-60-1", "Exposes ranged target-count pricing."),
    ratio("AoE count 3 / AoE count 1", byKey, "aoe-count-3", "aoe-count-1", "Exposes AoE expected-target pricing."),
    ratio("potency 4 / potency 1", byKey, "potency-4", "potency-1", "Exposes potency scaling shape."),
    ratio("dice 4 / dice 1", byKey, "dice-4", "dice-1", "Exposes dice scaling shape."),
    ratio("two damage types / one damage type", byKey, "damage-types-2", "damage-types-1", "Exposes multi-damage-type pricing."),
  ];
  assertPhase1AttackFormulaRatios(formulaRatios);

  const monsterOutcomeExamples = createMonsterOutcomeExamples(calculatorConfig);
  const forgeExamples = createForgeExamples();
  const balanceEnvironment = await createBalanceEnvironmentSummary(
    powerTuning,
    combatValues,
    playerPowerSpendScalar,
  );

  const redFlags = [
    "Character Builder and Signature Move ATTACK pricing now uses Phase 1 expected-output delivery scaling; constants still need campaign calibration.",
    "Additional damage types are treated as coverage premium rather than full duplicated payload.",
    "Secondary ATTACK packets use Phase 1 packet-local payload/delivery pricing, but full Secondary Packet formula architecture remains deferred.",
    "Cooldown is derived from BasePowerValue; player spend is not frequency-normalized in this harness.",
    "Monster Outcome Calculator remains a radar/heuristic model, not Combat Lab parity.",
    "Forge output bands are report-only/no-save-blocking diagnostics.",
    "Unsupported Movement remains excluded from automated balance evidence until Movement Abstraction V1 exists.",
  ];

  const report: Report = {
    provenance: {
      commitSha: runGit(["rev-parse", "--short", "HEAD"]),
      gitStatusShort: runGit(["status", "--short"]),
      formulaSourceLabels: {
        characterBuilder: "lib/characterBuilder/powers.ts",
        powerCostResolver: "lib/summoning/powerCostResolver.ts",
        monsterOutcomeCalculator: "lib/calculators/monsterOutcomeCalculator.ts",
        forgeProfile: "lib/forge/outputProfile.ts",
        forgeBands: "lib/forge/outputBands.ts",
      },
      activeTuningNames: {
        powerTuning: powerTuning?.name ?? null,
        combatTuning: combatSnapshot?.name ?? null,
        outcomeNormalization: outcomeSnapshot?.name ?? null,
        playerPowerSpendScalar,
      },
      characterBuilderTuning: characterBuilderTuningProvenance,
      campaignId: BALANCE_CAMPAIGN_ID,
      campaignName: BALANCE_CAMPAIGN_NAME,
      assetSource: {
        examples: "synthetic-in-memory",
        balanceEnvironment: "balance-campaign-authored/read-only",
      },
    },
    characterPowerExamples,
    formulaRatios,
    monsterOutcomeExamples,
    forgeExamples,
    balanceEnvironment,
    redFlags,
  };

  if (options.out) {
    const outputPath = resolve(options.out);
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  await db().$disconnect();
}

main().catch(async (error: unknown) => {
  await prisma?.$disconnect().catch(() => undefined);
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
