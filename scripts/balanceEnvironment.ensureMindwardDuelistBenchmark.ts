import { spawnSync } from "node:child_process";

import { loadEnvConfig } from "@next/env";

import {
  cleanBuilderTraits,
  defaultBuilderData,
  normalizeBuilderData,
  validateBuilderData,
  type CharacterBuilderData,
  type PlayerTraitDefinition,
} from "../lib/characterBuilder/core";
import {
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  normalizeCharacterPower,
  powerPointPool,
  summarizeCharacterPowers,
  validateCharacterPowers,
  type CharacterPower,
} from "../lib/characterBuilder/powers";
import {
  DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  normalizeCharacterPowerSpendScalar,
} from "../lib/config/characterBuilderTuningShared";
import {
  DEFAULT_POWER_TUNING_VALUES,
  normalizePowerTuningValues,
  type PowerTuningSnapshot,
} from "../lib/config/powerTuningShared";
import { normalizeCombatTuning, normalizeCombatTuningFlatValues } from "../lib/config/combatTuningShared";
import { adaptCampaignCharacterToCombatActor } from "../lib/combat-lab/liveAdapters";
import type {
  CoreAttribute,
  EffectDurationType,
  EffectPacketApplyTo,
  PowerIntention,
  RangeCategory,
  WoundChannel,
} from "../lib/summoning/types";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const CHARACTER_NAME = "BALANCE_Mindward Duelist";
const LEVEL = 3;

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];
type CharacterRow = Parameters<typeof adaptCampaignCharacterToCombatActor>[0];

type PowerSpec = {
  id: string;
  name: string;
  description: string;
  intention: PowerIntention;
  diceCount: number;
  potency: number;
  rangeCategory: "SELF" | RangeCategory;
  rangeValue: number;
  rangeExtra?: Record<string, unknown>;
  applyTo?: EffectPacketApplyTo;
  durationType?: EffectDurationType;
  durationTurns?: number | null;
  attackMode?: WoundChannel;
  damageTypes?: string[];
  defenceMode?: "Block" | "Dodge" | "Resist";
  resistedAttribute?: CoreAttribute;
};

const MINDWARD_ATTRIBUTES = {
  Attack: 10,
  Guard: 8,
  Fortitude: 6,
  Intellect: 10,
  Synergy: 10,
  Bravery: 12,
} as const;

const MINDWARD_RESIST = {
  Attack: 0,
  Guard: 0,
  Fortitude: 0,
  Intellect: 2,
  Synergy: 0,
  Bravery: 2,
} as const;

const MINDWARD_POWERS: PowerSpec[] = [
  {
    id: "balance-mindward-duelist-measured-cut",
    name: "Measured Cut",
    description: "A steady physical strike for medium Level 3 threat without alpha-spike behaviour.",
    intention: "ATTACK",
    diceCount: 3,
    potency: 2,
    rangeCategory: "MELEE",
    rangeValue: 1,
    rangeExtra: { targets: 1 },
    attackMode: "PHYSICAL",
    damageTypes: ["Slashing"],
  },
  {
    id: "balance-mindward-duelist-resolute-lunge",
    name: "Resolute Lunge",
    description: "A slightly heavier physical follow-up with normal cooldown friction.",
    intention: "ATTACK",
    diceCount: 2,
    potency: 3,
    rangeCategory: "MELEE",
    rangeValue: 1,
    rangeExtra: { targets: 1 },
    attackMode: "PHYSICAL",
    damageTypes: ["Slashing"],
  },
  {
    id: "balance-mindward-duelist-quiet-mind-guard",
    name: "Quiet Mind Guard",
    description: "A self-focused Mental Block stance for resisting fear, hexes, and control pressure.",
    intention: "DEFENCE",
    diceCount: 2,
    potency: 2,
    rangeCategory: "SELF",
    rangeValue: 0,
    rangeExtra: {},
    applyTo: "SELF",
    durationType: "TURNS",
    durationTurns: 2,
    attackMode: "MENTAL",
    defenceMode: "Block",
  },
];

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "UNKNOWN";
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function toPowerTuningSnapshot(set: {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: Date;
  entries: Array<{ configKey: string; value: number }>;
}): PowerTuningSnapshot {
  return {
    setId: set.id,
    name: set.name,
    slug: set.slug,
    status: set.status === "DRAFT" || set.status === "ARCHIVED" ? set.status : "ACTIVE",
    updatedAt: set.updatedAt.toISOString(),
    values: normalizePowerTuningValues(entriesToRecord(set.entries)),
  };
}

function loadTraitCatalog(rows: PlayerTraitDefinition[]): PlayerTraitDefinition[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    descriptor: row.descriptor,
    classification: row.classification,
    pointValue: row.pointValue,
    isActive: row.isActive,
  }));
}

function packetDetails(spec: PowerSpec) {
  const details: Record<string, unknown> = {
    rangeCategory: spec.rangeCategory,
    rangeValue: spec.rangeValue,
    rangeExtra: spec.rangeExtra ?? {},
  };
  if (spec.intention === "ATTACK") {
    details.attackMode = spec.attackMode ?? "PHYSICAL";
    details.damageTypes = spec.damageTypes ?? ["Blunt"];
  }
  if (spec.intention === "DEFENCE") {
    details.attackMode = spec.attackMode ?? "PHYSICAL";
    details.defenceMode = spec.defenceMode ?? "Block";
    if (spec.defenceMode === "Resist" && spec.resistedAttribute) {
      details.resistedAttribute = spec.resistedAttribute;
    }
  }
  return details;
}

function buildPower(spec: PowerSpec, sortOrder: number): CharacterPower {
  const packet = {
    ...createDefaultCharacterPowerPacket(spec.intention, 0),
    id: `${spec.id}:packet-1`,
    diceCount: spec.diceCount,
    potency: spec.potency,
    effectDurationType: spec.durationType ?? "INSTANT",
    effectDurationTurns: spec.durationType === "TURNS" ? spec.durationTurns ?? 1 : null,
    woundChannel:
      spec.intention === "ATTACK" || spec.intention === "DEFENCE"
        ? spec.attackMode ?? "PHYSICAL"
        : null,
    applyTo: spec.applyTo ?? (spec.rangeCategory === "SELF" ? "SELF" : "PRIMARY_TARGET"),
    detailsJson: packetDetails(spec),
  };
  const power = {
    ...createDefaultCharacterPower(sortOrder),
    id: spec.id,
    sortOrder,
    name: spec.name,
    description: spec.description,
    diceCount: spec.diceCount,
    potency: spec.potency,
    effectDurationType: spec.durationType ?? "INSTANT",
    effectDurationTurns: spec.durationType === "TURNS" ? spec.durationTurns ?? 1 : null,
    durationType: spec.durationType ?? "INSTANT",
    durationTurns: spec.durationType === "TURNS" ? spec.durationTurns ?? 1 : null,
    effectPackets: [packet],
    intentions: [packet],
  };
  return normalizeCharacterPower(power, sortOrder);
}

function narrativeNotes() {
  return [
    "BALANCE_STATUS: Experimental",
    "BALANCE_SOURCE: Balance Environment calibration",
    "BALANCE_ROLE: Mental-resistant combatant comparator",
    "BALANCE_PHASE: First-pass Mindward diagnostic",
    "BALANCE_NOTES: Built to resist mental pressure and threaten back without becoming Stoneguard-level physical defence.",
  ].join("\n");
}

async function loadActiveTuning(prisma: PrismaClientInstance) {
  const [powerSet, combatSet, characterBuilderTuning] = await Promise.all([
    prisma.powerTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
    prisma.combatTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
    prisma.characterBuilderTuning.findUnique({
      where: { id: "default" },
      select: { playerPowerSpendScalar: true },
    }),
  ]);
  if (!combatSet) throw new Error("Missing ACTIVE Combat tuning set.");
  return {
    powerSnapshot: powerSet
      ? toPowerTuningSnapshot(powerSet)
      : {
          setId: "script-default",
          name: "Script default power tuning",
          slug: "script-default-power-tuning",
          status: "ACTIVE" as const,
          updatedAt: new Date(0).toISOString(),
          values: DEFAULT_POWER_TUNING_VALUES,
        },
    combatValues: normalizeCombatTuning(normalizeCombatTuningFlatValues(entriesToRecord(combatSet.entries))),
    playerPowerSpendScalar: normalizeCharacterPowerSpendScalar(
      characterBuilderTuning?.playerPowerSpendScalar ?? DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
    ),
  };
}

function validateMindwardBuilderData(params: {
  builderData: CharacterBuilderData;
  traitCatalog: PlayerTraitDefinition[];
  tuning: Awaited<ReturnType<typeof loadActiveTuning>>;
}) {
  return [
    ...validateBuilderData(params.builderData, LEVEL, params.traitCatalog),
    ...validateCharacterPowers({
      level: LEVEL,
      powers: params.builderData.powers,
      tuningSnapshot: params.tuning.powerSnapshot,
      playerPowerSpendScalar: params.tuning.playerPowerSpendScalar,
    }),
  ];
}

async function main() {
  loadEnvConfig(process.cwd());
  const prisma = (await import("../prisma/client")).prisma;
  const beforeCounts = await Promise.all([
    prisma.campaignCharacter.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
    prisma.monster.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
    prisma.itemTemplate.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
  ]);

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: BALANCE_CAMPAIGN_ID },
      select: { id: true, name: true },
    });
    if (!campaign) throw new Error(`Campaign not found: ${BALANCE_CAMPAIGN_ID}`);
    if (campaign.name !== BALANCE_CAMPAIGN_NAME) {
      throw new Error(`Campaign name mismatch: expected ${BALANCE_CAMPAIGN_NAME}, found ${campaign.name}.`);
    }

    const existingRows = await prisma.campaignCharacter.findMany({
      where: { campaignId: BALANCE_CAMPAIGN_ID, name: CHARACTER_NAME },
      select: { id: true, name: true, level: true, builderData: true, archivedAt: true },
    });
    if (existingRows.length > 1) {
      throw new Error(`Refusing to continue: found ${existingRows.length} rows named ${CHARACTER_NAME}.`);
    }

    const [traitRows, tuning] = await Promise.all([
      prisma.playerTrait.findMany({
        where: { isActive: true },
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          descriptor: true,
          classification: true,
          pointValue: true,
          isActive: true,
        },
      }),
      loadActiveTuning(prisma),
    ]);
    const traitCatalog = loadTraitCatalog(traitRows);
    const baseBuilderData = existingRows[0]
      ? normalizeBuilderData(existingRows[0].builderData)
      : defaultBuilderData();
    const cleaned = cleanBuilderTraits(baseBuilderData, traitCatalog);
    const powers = MINDWARD_POWERS.map((spec, index) => buildPower(spec, index));
    const nextBuilderData: CharacterBuilderData = {
      ...cleaned,
      narrativeNotes: narrativeNotes(),
      attributeMethod: "ROLLED",
      attributes: { ...MINDWARD_ATTRIBUTES },
      resistPoints: { ...MINDWARD_RESIST },
      selectedTraitKeys: [],
      characteristics: [],
      equippedSlots: {},
      signatureMove: null,
      powers,
    };

    const validationErrors = validateMindwardBuilderData({ builderData: nextBuilderData, traitCatalog, tuning });
    if (validationErrors.length > 0) throw new Error(validationErrors.join("\n"));

    const summary = summarizeCharacterPowers({
      level: LEVEL,
      powers,
      tuningSnapshot: tuning.powerSnapshot,
      playerPowerSpendScalar: tuning.playerPowerSpendScalar,
    });
    if (summary.overspent) {
      throw new Error(`${CHARACTER_NAME}: power spend ${summary.totalSpent} exceeds pool ${summary.powerPool}.`);
    }

    const operation = existingRows[0] ? "updated" : "created";
    const row = existingRows[0]
      ? await prisma.campaignCharacter.update({
          where: { id: existingRows[0].id },
          data: {
            level: LEVEL,
            builderData: JSON.parse(JSON.stringify(nextBuilderData)),
            description: narrativeNotes(),
            archivedAt: null,
            archivedByUserId: null,
            archiveReason: null,
          },
          include: { backpackItems: true },
        })
      : await prisma.campaignCharacter.create({
          data: {
            campaignId: BALANCE_CAMPAIGN_ID,
            name: CHARACTER_NAME,
            level: LEVEL,
            builderData: JSON.parse(JSON.stringify(nextBuilderData)),
            description: narrativeNotes(),
          },
          include: { backpackItems: true },
        });

    if (row.backpackItems.length > 0) {
      throw new Error(`${CHARACTER_NAME}: expected no backpack items for this character-only benchmark, found ${row.backpackItems.length}.`);
    }

    const adapted = adaptCampaignCharacterToCombatActor(
      { ...row, backpackItems: [] } as unknown as CharacterRow,
      tuning.combatValues,
      tuning.powerSnapshot,
      tuning.playerPowerSpendScalar,
    );
    const actor = adapted.actor;
    if (actor.unsupportedPowers.length > 0) {
      throw new Error(
        `${CHARACTER_NAME}: unsupported powers detected: ${actor.unsupportedPowers.map((power) => `${power.powerName}: ${power.reason}`).join(" | ")}`,
      );
    }
    const fallbackActions = actor.actions.filter((action) => action.sourceType === "fallback");
    if (fallbackActions.length > 0) {
      throw new Error(`${CHARACTER_NAME}: fallback action hydrated: ${fallbackActions.map((action) => action.name).join(", ")}`);
    }

    const afterCounts = await Promise.all([
      prisma.campaignCharacter.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
      prisma.monster.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
      prisma.itemTemplate.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
    ]);
    const characterDelta = afterCounts[0] - beforeCounts[0];
    const monsterDelta = afterCounts[1] - beforeCounts[1];
    const itemDelta = afterCounts[2] - beforeCounts[2];
    if (characterDelta > 1 || monsterDelta !== 0 || itemDelta !== 0) {
      throw new Error(`Unexpected Balance Environment count delta: characters ${characterDelta}, monsters ${monsterDelta}, items ${itemDelta}.`);
    }

    console.log(JSON.stringify({
      result: operation,
      campaignId: BALANCE_CAMPAIGN_ID,
      campaignName: BALANCE_CAMPAIGN_NAME,
      repoHead: runGit(["rev-parse", "HEAD"]),
      gitStatus: runGit(["status", "--short", "--untracked-files=all"]),
      asset: {
        id: row.id,
        name: row.name,
        level: row.level,
        role: "mental-resistant combatant comparator",
        physicalHp: actor.physicalHpMax,
        mentalHp: actor.mentalHpMax,
        physicalDefenceDice: actor.physicalDefenceDice,
        mentalDefenceDice: actor.mentalDefenceDice,
        physicalProtection: actor.physicalProtection,
        mentalProtection: actor.mentalProtection,
        physicalBlockPerSuccess: actor.physicalBlockPerSuccess,
        mentalBlockPerSuccess: actor.mentalBlockPerSuccess,
        resist: actor.resist,
        attributes: actor.attributeDice,
        powerPool: powerPointPool(LEVEL),
        powerSpent: summary.totalSpent,
        powerRemaining: summary.remaining,
        powers: summary.powers.map((entry) => ({
          name: entry.power.name,
          spend: entry.spend,
          basePowerValue: entry.basePowerValue,
          derivedCooldownTurns: entry.derivedCooldownTurns,
          warnings: entry.warnings,
        })),
        combatActions: actor.actions.map((action) => ({
          name: action.name,
          kind: action.kind,
          sourceType: action.sourceType,
          pool: action.pool,
          diceCount: action.diceCount,
          potency: action.potency,
          cooldownRounds: action.cooldownRounds,
          durationRounds: action.durationRounds,
          supported: action.supported,
        })),
        hydrationWarnings: adapted.warnings.map((warning) => warning.message),
        unsupportedPowers: actor.unsupportedPowers,
      },
      deltas: {
        balanceCampaignCharacters: characterDelta,
        balanceCampaignMonsters: monsterDelta,
        balanceCampaignItems: itemDelta,
      },
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
