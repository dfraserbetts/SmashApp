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

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function roundNullable(value: unknown, digits = 3): number | null {
  const numeric = asNullableNumber(value);
  return numeric === null ? null : round(numeric, digits);
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
  const controlPressureModel = asRecord(normalization.controlPressureAxisBaselineModel);
  const duplicateHandling = asRecord(controlPressureModel.duplicateOverlapHandling);
  const resistibilityContribution = asRecord(controlPressureModel.resistibilityContribution);
  const semanticPackages = Array.isArray(controlPressureModel.semanticPackagesConsidered)
    ? controlPressureModel.semanticPackagesConsidered.map((value) => {
        const controlPackage = asRecord(value);
        return {
          sourcePowerId: controlPackage.sourcePowerId ?? null,
          sourcePowerName: String(controlPackage.sourcePowerName ?? "unknown"),
          packetIndex: asNumber(controlPackage.packetIndex),
          effectFamily: String(controlPackage.effectFamily ?? "UNKNOWN"),
          runtimeSemanticMode: String(controlPackage.runtimeSemanticMode ?? "unknown"),
          affectedAttribute: controlPackage.affectedAttribute ?? null,
          targetCount: asNumber(controlPackage.targetCount),
          targetBreadth: round(asNumber(controlPackage.targetBreadth)),
          duration: {
            kind: String(controlPackage.durationKind ?? "UNKNOWN"),
            turns: asNumber(controlPackage.durationTurns),
            contribution: round(asNumber(controlPackage.durationContribution)),
          },
          recurrence: {
            active: Boolean(controlPackage.recurrence),
            contribution: round(asNumber(controlPackage.recurrenceContribution)),
          },
          cooldownAvailability: {
            cooldownTurns: asNullableNumber(controlPackage.cooldownTurns),
            band: String(controlPackage.availabilityBand ?? "UNKNOWN"),
            contribution: round(asNumber(controlPackage.availabilityContribution)),
          },
          effectSeverity: round(asNumber(controlPackage.effectSeverity)),
          supportedStackImpact: round(asNumber(controlPackage.supportedStackImpact)),
          resistibility: {
            status: String(controlPackage.resistibility ?? "UNKNOWN"),
            gateCategory: controlPackage.resistGateCategory ?? null,
            contribution: round(asNumber(controlPackage.reliabilityContribution)),
          },
          linkedPackage: {
            linked: Boolean(controlPackage.linked),
            dependencyMode: String(controlPackage.dependencyMode ?? "UNKNOWN"),
            contribution: round(asNumber(controlPackage.linkedContribution)),
          },
          functionalSignature: String(controlPackage.functionalSignature ?? ""),
          unsupportedAuthoringDistinctions: asStringArray(
            controlPackage.unsupportedAuthoringDistinctions,
          ),
        };
      })
    : [];
  const overlapDiminishingReturns = Array.isArray(duplicateHandling.overlapDiminishingReturns)
    ? duplicateHandling.overlapDiminishingReturns.map((value) => {
        const overlap = asRecord(value);
        return {
          signature: String(overlap.signature ?? ""),
          factor: round(asNumber(overlap.factor)),
        };
      })
    : [];

  const legacyResolverPackages = calculatorInput.powers
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
      semanticModel: {
        policy: String(controlPressureModel.policy ?? "unknown"),
        mode: String(controlPressureModel.mode ?? "unknown"),
        calibrated: Boolean(controlPressureModel.calibrated),
        fallback: Boolean(controlPressureModel.fallback),
        fallbackPolicy: controlPressureModel.fallbackPolicy ?? null,
        baselinePackageId: controlPressureModel.baselinePackageId ?? null,
        semanticRawProxy: round(asNumber(controlPressureModel.rawActualControlPressureProxy)),
        baselineRawProxy: roundNullable(controlPressureModel.rawBaselineControlPressureProxy),
        ratioToBaseline: roundNullable(controlPressureModel.ratioToBaseline),
        uncappedScore: roundNullable(controlPressureModel.uncappedScore),
        finalScore: roundNullable(controlPressureModel.finalScore),
        capped: Boolean(controlPressureModel.capped),
        capReason: controlPressureModel.capReason ?? null,
        components: asRecord(controlPressureModel.components),
        effectSeverity: round(asNumber(controlPressureModel.effectSeverity)),
        targetBreadth: round(asNumber(controlPressureModel.targetBreadth)),
        duration: round(asNumber(controlPressureModel.duration)),
        recurrence: round(asNumber(controlPressureModel.recurrence)),
        cooldownAvailability: round(asNumber(controlPressureModel.cooldownAvailability)),
        actionEconomyContribution: round(
          asNumber(controlPressureModel.actionEconomyContribution),
        ),
        resistibility: {
          contribution: round(asNumber(resistibilityContribution.value)),
          policy: String(resistibilityContribution.policy ?? "unknown"),
          reliabilityValues: asRecord(resistibilityContribution.reliabilityValues),
        },
        linkedPackageContribution: round(
          asNumber(controlPressureModel.linkedPackageContribution),
        ),
        traitEquipmentContribution: asRecord(
          controlPressureModel.traitEquipmentContribution,
        ),
        functionalSignatures: asStringArray(controlPressureModel.functionalSignatures),
        duplicateHandling: {
          exactDuplicatesRemoved: asStringArray(duplicateHandling.exactDuplicatesRemoved),
          overlapDiminishingReturns,
        },
        unsupportedAuthoringWarnings: asStringArray(
          controlPressureModel.unsupportedAuthoringWarnings,
        ),
        semanticPackages,
      },
      legacyResolverComparison: {
        label: "Comparison only; excluded from calibrated Level 3 Control Pressure",
        finalPreNormalizationManipulation: round(asNumber(finalPre.manipulation)),
        nonPowerManipulation: round(asNumber(nonPower.manipulation)),
        canonicalResolverManipulation: round(asNumber(canonicalPower.manipulation)),
        effectiveResolverManipulation: round(asNumber(effectivePower.manipulation)),
        legacyCurve: {
          min: round(asNumber(curve.min)),
          max: round(asNumber(curve.max)),
          tierMultiplier,
          tierAdjustedMax: round(asNumber(curve.max) * tierMultiplier),
        },
        authoredPackages: legacyResolverPackages,
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
  console.log(
    "Name | tier/L | final | semantic raw/baseline | ratio | baseline package | mode | uncapped | cap",
  );
  for (const sample of payload.samples) {
    const score = sample.controlPressure;
    const model = score.semanticModel;
    console.log(
      `${sample.name} | ${sample.tier}${sample.legendary ? "+LEG" : ""}/L${sample.level} | ${score.final} | ${model.semanticRawProxy}/${model.baselineRawProxy ?? "n/a"} | ${model.ratioToBaseline ?? "n/a"} | ${model.baselinePackageId ?? "n/a"} | ${model.mode} | ${model.uncappedScore ?? "n/a"} | ${model.capped ? model.capReason ?? "capped" : "none"}`,
    );
    console.log(
      `  components severity=${model.effectSeverity} targets=${model.targetBreadth} duration=${model.duration} recurrence=${model.recurrence} availability=${model.cooldownAvailability} actions=${model.actionEconomyContribution} linked=${model.linkedPackageContribution}`,
    );
    console.log(
      `  resistibility contribution=${model.resistibility.contribution} policy=${model.resistibility.policy}`,
    );
    console.log(
      `  traits/equipment=${JSON.stringify(model.traitEquipmentContribution)} exactDuplicates=${JSON.stringify(model.duplicateHandling.exactDuplicatesRemoved)} overlaps=${JSON.stringify(model.duplicateHandling.overlapDiminishingReturns)}`,
    );
    for (const controlPackage of model.semanticPackages) {
      console.log(
        `  semanticPackage power=${controlPackage.sourcePowerName} packet=${controlPackage.packetIndex} family=${controlPackage.effectFamily} runtime=${controlPackage.runtimeSemanticMode} attribute=${controlPackage.affectedAttribute ?? "none"} targets=${controlPackage.targetCount}/${controlPackage.targetBreadth} duration=${controlPackage.duration.kind}:${controlPackage.duration.turns}/${controlPackage.duration.contribution} recurrence=${controlPackage.recurrence.active}/${controlPackage.recurrence.contribution} cooldown=${controlPackage.cooldownAvailability.cooldownTurns ?? "unknown"}/${controlPackage.cooldownAvailability.band}/${controlPackage.cooldownAvailability.contribution} severity=${controlPackage.effectSeverity} stack=${controlPackage.supportedStackImpact} resist=${controlPackage.resistibility.status}:${controlPackage.resistibility.gateCategory ?? "none"}/${controlPackage.resistibility.contribution} linked=${controlPackage.linkedPackage.linked}/${controlPackage.linkedPackage.contribution}`,
      );
      console.log(`    signature=${controlPackage.functionalSignature}`);
      if (controlPackage.unsupportedAuthoringDistinctions.length > 0) {
        console.log(
          `    unsupportedDistinctions=${controlPackage.unsupportedAuthoringDistinctions.join(" | ")}`,
        );
      }
    }
    for (const warning of model.unsupportedAuthoringWarnings) {
      console.log(`  warning=${warning}`);
    }
    const legacy = score.legacyResolverComparison;
    console.log(
      `  legacyComparison label=${legacy.label} finalPre=${legacy.finalPreNormalizationManipulation} nonPower=${legacy.nonPowerManipulation} canonical/effective=${legacy.canonicalResolverManipulation}/${legacy.effectiveResolverManipulation} curveTarget=${legacy.legacyCurve.tierAdjustedMax}`,
    );
    for (const power of legacy.authoredPackages) {
      console.log(
        `    legacyPower=${power.name} BPV=${power.basePowerValue} canonical/effectiveManipulation=${power.canonicalManipulation}/${power.effectiveManipulation}`,
      );
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
