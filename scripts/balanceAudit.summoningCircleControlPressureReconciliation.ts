import { loadEnvConfig } from "@next/env";
import { execSync } from "node:child_process";

import {
  computeMonsterOutcomes,
  computeTraitAxisBonuses,
  type TraitAxisWeightDefinition,
} from "../lib/calculators/monsterOutcomeCalculator";
import {
  applyCombatTuningToCalculatorConfig,
  normalizeCombatTuning,
  normalizeCombatTuningFlatValues,
} from "../lib/config/combatTuningShared";
import {
  normalizeOutcomeNormalizationValues,
  outcomeNormalizationValuesToCalculatorConfig,
} from "../lib/config/outcomeNormalizationShared";
import {
  normalizePowerTuningValues,
  type PowerTuningSnapshot,
} from "../lib/config/powerTuningShared";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];

const CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const CAMPAIGN_NAME = "Balance Environment";
const SAMPLE_NAMES = [
  "BALANCE_Physical Striker",
  "BALANCE_Durable Soldier",
  "BALANCE_Dodge Pressure Skirmisher",
  "BALANCE_Control Hexer",
  "BALANCE_Support Candidate Pressure Striker",
  "BALANCE_Support Candidate Guard Anchor",
  "BALANCE_Support Candidate Suppression Hexer",
  "BALANCE_Legendary Elite Duelist",
  "BALANCE_Legendary Elite Hexer",
  "BALANCE_Legendary Elite True Hexer",
  "BALANCE_Legendary Elite Breaker Controller Rotation",
  "BALANCE_Boss Warlord",
  "BALANCE_Boss Hexlord",
  "BALANCE_Boss Behemoth",
  "BALANCE_Legendary Dragon",
  "BALANCE_Legendary Lich",
] as const;

const POWER_INCLUDE = {
  rangeCategories: { orderBy: { rangeCategory: "asc" as const } },
  primaryDefenceGate: true,
  effectPackets: {
    orderBy: { packetIndex: "asc" as const },
    include: { localTargetingOverride: true },
  },
};

type MonsterRow = Awaited<ReturnType<typeof loadMonsters>>[number];
type TuningSet = {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: Date;
  entries: Array<{ configKey: string; value: number }>;
};

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>) {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function tuningMetadata(set: TuningSet) {
  return {
    setId: set.id,
    name: set.name,
    slug: set.slug,
    status: set.status,
    updatedAt: set.updatedAt.toISOString(),
  };
}

function buildCalculatorInput(monster: MonsterRow) {
  return {
    ...monster,
    attacks: monster.attacks.map((attack) => ({
      id: attack.id,
      attackMode: attack.attackMode,
      attackName: attack.attackName,
      attackConfig: attack.attackConfig,
    })),
    naturalAttack: monster.naturalAttack
      ? {
          attackName: monster.naturalAttack.attackName,
          attackConfig: monster.naturalAttack.attackConfig,
        }
      : null,
    powers: monster.powers.map((power) => ({
      ...power,
      rangeCategories: power.rangeCategories.map((range) => range.rangeCategory),
      intentions: power.effectPackets.map((packet) => ({
        ...packet,
        detailsJson: packet.detailsJson,
        localTargetingOverride: packet.localTargetingOverride,
      })),
    })),
  };
}

function traitDefinitions(monster: MonsterRow): TraitAxisWeightDefinition[] {
  return monster.traits.map(({ trait }) => ({
    band: trait.band,
    physicalThreatWeight: trait.physicalThreatWeight,
    mentalThreatWeight: trait.mentalThreatWeight,
    physicalSurvivabilityWeight: trait.physicalSurvivabilityWeight,
    mentalSurvivabilityWeight: trait.mentalSurvivabilityWeight,
    survivabilityWeight: trait.survivabilityWeight,
    manipulationWeight: trait.manipulationWeight,
    synergyWeight: trait.synergyWeight,
    mobilityWeight: trait.mobilityWeight,
    presenceWeight: trait.presenceWeight,
  }));
}

function getPowerTargeting(power: ReturnType<typeof buildCalculatorInput>["powers"][number]) {
  const ranges = power.rangeCategories;
  let range = ranges.includes("AOE") ? "AOE" : ranges.includes("RANGED") ? "RANGED" : "MELEE";
  let targets =
    range === "AOE"
      ? Math.max(1, power.aoeCount ?? 1)
      : range === "RANGED"
        ? Math.max(1, power.rangedTargets ?? 1)
        : Math.max(1, power.meleeTargets ?? 1);
  for (const packet of power.intentions) {
    const local = packet.localTargetingOverride;
    if (!local) continue;
    if ((local.aoeCount ?? 0) > 0) {
      range = "AOE";
      targets = Math.max(targets, local.aoeCount ?? 1);
    } else if ((local.rangedTargets ?? 0) > 0 || (local.rangedDistanceFeet ?? 0) > 0) {
      if (range !== "AOE") range = "RANGED";
      targets = Math.max(targets, local.rangedTargets ?? 1);
    } else {
      targets = Math.max(targets, local.meleeTargets ?? 1);
    }
  }
  return { range, targets };
}

function classifyTableEffect(intention: string, details: Record<string, unknown>) {
  if (intention === "CONTROL") {
    const mode = String(details.controlMode ?? "unspecified");
    return {
      family: "control",
      authoredEffect: mode,
      runtimeEffect: "mainActionDenied",
      runtimeSupport:
        mode === "Force no main action"
          ? "direct"
          : "abstracted: Combat Lab currently maps every Control mode to mainActionDenied",
    };
  }
  if (intention === "DEBUFF") {
    return {
      family: "debuff",
      authoredEffect: `reduce ${String(details.statTarget ?? details.statChoice ?? "unspecified attribute")}`,
      runtimeEffect: "attributeModifier",
      runtimeSupport: "direct where the targeted attribute maps to a Combat Lab attribute",
    };
  }
  if (intention === "MOVEMENT") {
    return {
      family: "forcedMovement",
      authoredEffect: String(details.movementMode ?? "unspecified movement"),
      runtimeEffect: "forcedMovementApplied",
      runtimeSupport: "abstracted: positioning is not simulated",
    };
  }
  if (intention === "ATTACK") {
    return {
      family: "damageRider",
      authoredEffect: String(details.attackMode ?? "PHYSICAL"),
      runtimeEffect: "damage",
      runtimeSupport: "direct; belongs on Threat rather than Control Pressure",
    };
  }
  return {
    family: "other",
    authoredEffect: intention,
    runtimeEffect: null,
    runtimeSupport: "not a Control Pressure package",
  };
}

function summarizeMonster(
  monster: MonsterRow,
  tuning: Awaited<ReturnType<typeof loadActiveTuning>>,
) {
  const calculatorInput = buildCalculatorInput(monster);
  const powerCosts = resolvePowerCosts(
    calculatorInput.powers as unknown as Parameters<typeof resolvePowerCosts>[0],
    tuning.powerSnapshot,
    { level: monster.level, tier: monster.tier },
  );
  const traitAxisBonuses = computeTraitAxisBonuses(traitDefinitions(monster), monster.level);
  const outcome = computeMonsterOutcomes(
    calculatorInput as unknown as Parameters<typeof computeMonsterOutcomes>[0],
    tuning.calculatorConfig,
    {
      protectionTuning: tuning.combatValues,
      traitAxisBonuses,
      powerContribution: {
        axisVector: powerCosts.totals.axisVector,
        basePowerValue: powerCosts.totals.basePowerValue,
        powerCount: powerCosts.powers.length,
        powers: powerCosts.powers.map((power) => ({
          id: power.powerId ?? null,
          name: power.name,
          axisVector: power.breakdown.axisVector,
          basePowerValue: power.breakdown.basePowerValue,
          authoredPower:
            (calculatorInput.powers.find(
              (authored) => authored.id === power.powerId || authored.name === power.name,
            ) ?? null) as unknown as Parameters<typeof resolvePowerCosts>[0][number] | null,
          derivedCooldownTurns: power.derivedCooldownTurns,
          derivedCooldownLoad: power.derivedCooldown.cooldownLoad,
          cooldownTurns: power.cooldownTurns,
          cooldownReduction: power.cooldownReduction,
        })),
        debug: powerCosts,
      },
    },
  );
  const debug = asRecord(outcome.debug);
  const finalPre = asRecord(debug.finalPreNormalizationAxes);
  const nonPower = asRecord(asRecord(debug.nonPowerContribution).axisVector);
  const nonPowerSources = asRecord(asRecord(debug.nonPowerContribution).sources);
  const powerDebug = asRecord(debug.powerContribution);
  const canonicalPower = asRecord(powerDebug.canonicalPowerAxisVector);
  const effectivePower = asRecord(powerDebug.effectivePowerAxisVector);
  const perPowerAvailability = Array.isArray(powerDebug.perPowerAvailability)
    ? powerDebug.perPowerAvailability.map(asRecord)
    : [];
  const normalization = asRecord(debug.normalizationBreakdown);
  const curve = asRecord(asRecord(normalization.curvePoints).manipulation);
  const tierMultiplier = asNumber(normalization.tierMultiplier);

  const packages = calculatorInput.powers
    .map((power) => {
      const resolved = powerCosts.powers.find(
        (entry) => entry.powerId === power.id || entry.name === power.name,
      );
      const effective = perPowerAvailability.find(
        (entry) => entry.id === power.id || entry.name === power.name,
      );
      const targeting = getPowerTargeting(power);
      const packets = power.intentions.map((packet) => {
        const details = asRecord(packet.detailsJson);
        const intention = String(packet.intention).toUpperCase();
        return {
          index: packet.packetIndex,
          intention,
          ...classifyTableEffect(intention, details),
          potency: packet.potency,
          diceCount: packet.diceCount,
          targets: targeting.targets,
          range: targeting.range,
          durationType: packet.effectDurationType,
          durationTurns: packet.effectDurationTurns,
          timing: packet.effectTimingType,
          applyTo: packet.applyTo,
          hostility: packet.hostility,
          secondaryDependencyMode: packet.secondaryDependencyMode,
          controlTheme: details.controlTheme ?? null,
          debuffAttribute: details.statTarget ?? details.statChoice ?? null,
        };
      });
      const controlPackets = packets.filter((packet) =>
        ["CONTROL", "DEBUFF", "MOVEMENT"].includes(packet.intention),
      );
      if (controlPackets.length === 0) return null;
      return {
        id: power.id,
        name: power.name,
        descriptorChassis: power.descriptorChassis,
        counterMode: power.counterMode,
        range: targeting.range,
        targets: targeting.targets,
        authoredCooldown: power.cooldownTurns,
        derivedCooldown: resolved?.derivedCooldownTurns ?? null,
        basePowerValue: round(resolved?.breakdown.basePowerValue ?? 0),
        canonicalManipulation: round(resolved?.breakdown.axisVector.manipulation ?? 0),
        effectiveManipulation: round(
          asNumber(asRecord(effective?.effectivePowerAxisVector).manipulation),
        ),
        primaryGate: power.primaryDefenceGate
          ? {
              gateResult: power.primaryDefenceGate.gateResult,
              resistAttribute: power.primaryDefenceGate.resistAttribute,
              protectionChannel: power.primaryDefenceGate.protectionChannel,
              hostileEntryPattern: power.primaryDefenceGate.hostileEntryPattern,
            }
          : null,
        linkedPacketCount: packets.filter(
          (packet) =>
            packet.secondaryDependencyMode != null &&
            packet.secondaryDependencyMode !== "INDEPENDENT",
        ).length,
        packets,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    id: monster.id,
    name: monster.name,
    level: monster.level,
    tier: monster.tier,
    legendary: monster.legendary,
    controlPressure: {
      final: round(outcome.radarAxes.manipulation),
      raw: round(asNumber(finalPre.manipulation)),
      nonPower: round(asNumber(nonPower.manipulation)),
      canonicalPower: round(asNumber(canonicalPower.manipulation)),
      effectivePower: round(asNumber(effectivePower.manipulation)),
      curve: {
        min: round(asNumber(curve.min)),
        max: round(asNumber(curve.max)),
        tierMultiplier,
        tierAdjustedMax: round(asNumber(curve.max) * tierMultiplier),
      },
    },
    nonPowerContributors: {
      equipment: round(asNumber(asRecord(nonPowerSources.equipmentModifierAxisBonuses).manipulation)),
      naturalAttackGreaterSuccess: round(
        asNumber(asRecord(nonPowerSources.naturalAttackGsAxisBonuses).manipulation),
      ),
      traits: round(asNumber(asRecord(nonPowerSources.traitAxisBonuses).manipulation)),
      limitBreaks: round(asNumber(asRecord(nonPowerSources.customLimitBreakAxisBonuses).manipulation)),
    },
    packages,
  };
}

async function loadActiveTuning(prisma: PrismaClientInstance) {
  const [powerSet, combatSet, outcomeSet] = await Promise.all([
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
    prisma.outcomeNormalizationConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
  ]);
  if (!powerSet || !combatSet || !outcomeSet) {
    throw new Error("Missing ACTIVE Power, Combat, or Outcome Normalization tuning set.");
  }
  const powerSnapshot: PowerTuningSnapshot = {
    setId: powerSet.id,
    name: powerSet.name,
    slug: powerSet.slug,
    status: powerSet.status,
    updatedAt: powerSet.updatedAt.toISOString(),
    values: normalizePowerTuningValues(entriesToRecord(powerSet.entries)),
  };
  const combatValues = normalizeCombatTuning(
    normalizeCombatTuningFlatValues(entriesToRecord(combatSet.entries)),
  );
  const outcomeValues = normalizeOutcomeNormalizationValues(entriesToRecord(outcomeSet.entries));
  return {
    powerSnapshot,
    combatValues,
    calculatorConfig: applyCombatTuningToCalculatorConfig(
      outcomeNormalizationValuesToCalculatorConfig(outcomeValues),
      combatValues,
    ),
    metadata: {
      power: tuningMetadata(powerSet),
      combat: tuningMetadata(combatSet),
      outcomeNormalization: tuningMetadata(outcomeSet),
    },
  };
}

async function loadMonsters(prisma: PrismaClientInstance) {
  return prisma.monster.findMany({
    where: { campaignId: CAMPAIGN_ID, name: { in: [...SAMPLE_NAMES] } },
    orderBy: { name: "asc" },
    include: {
      naturalAttack: true,
      attacks: { orderBy: { sortOrder: "asc" } },
      traits: { include: { trait: true }, orderBy: { sortOrder: "asc" } },
      powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
    },
  });
}

function printHuman(payload: Awaited<ReturnType<typeof buildPayload>>) {
  console.log(payload.title);
  console.log(`campaignId=${payload.provenance.campaignId}`);
  console.log(`campaignName=${payload.provenance.campaignName}`);
  console.log(`repoHead=${payload.provenance.repoHead}`);
  console.log(`gitStatus=${payload.provenance.gitStatus}`);
  console.log("databaseAccess=read-only; mutation=none");
  console.log(`samples=${payload.samples.length}; missing=${payload.missingSamples.join(",") || "none"}`);
  console.log(`caveat=${payload.caveat}`);
  console.log("");
  console.log("Name | tier/L | Control Pressure final/raw | nonPower | canonical/effective power | curve target");
  for (const sample of payload.samples) {
    const score = sample.controlPressure;
    console.log(
      `${sample.name} | ${sample.tier}${sample.legendary ? "+LEG" : ""}/L${sample.level} | ${score.final}/${score.raw} | ${score.nonPower} | ${score.canonicalPower}/${score.effectivePower} | ${score.curve.tierAdjustedMax}`,
    );
    for (const power of sample.packages) {
      console.log(
        `  power=${power.name} range=${power.range} targets=${power.targets} cd=${power.derivedCooldown} BPV=${power.basePowerValue} manip=${power.canonicalManipulation}/${power.effectiveManipulation} gate=${JSON.stringify(power.primaryGate)} linked=${power.linkedPacketCount}`,
      );
      for (const packet of power.packets) {
        console.log(
          `    packet=${packet.index} ${packet.intention} effect=${packet.authoredEffect} runtime=${packet.runtimeEffect} support=${packet.runtimeSupport} dice=${packet.diceCount} potency=${packet.potency} duration=${packet.durationType}:${packet.durationTurns ?? 0} timing=${packet.timing} dependency=${packet.secondaryDependencyMode ?? "PRIMARY"}`,
        );
      }
    }
  }
}

async function buildPayload() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");
  try {
    const [tuning, monsters] = await Promise.all([loadActiveTuning(prisma), loadMonsters(prisma)]);
    const found = new Set(monsters.map((monster) => monster.name));
    return {
      title: "Summoning Circle Control Pressure reconciliation",
      provenance: {
        campaignId: CAMPAIGN_ID,
        campaignName: CAMPAIGN_NAME,
        repoHead: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
        gitStatus:
          execSync("git status --short --untracked-files=all", { encoding: "utf8" }).trim() ||
          "clean",
        activeTuning: tuning.metadata,
      },
      caveat:
        "Uses production Outcome Calculator and canonical power-cost resolver. Current editor-only equipment and named greater-success adapters are not reusable here, so those optional non-power bonuses are reported as zero for sampled assets.",
      missingSamples: SAMPLE_NAMES.filter((name) => !found.has(name)),
      samples: monsters.map((monster) => summarizeMonster(monster, tuning)),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const payload = await buildPayload();
  if (process.argv.includes("--json")) console.log(JSON.stringify(payload, null, 2));
  else printHuman(payload);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
