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
import {
  attachPowerCooldownAuthority,
  resolvePowerCooldownAuthority,
} from "../lib/summoning/resolvePowerCooldownAuthority";

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];

const CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const CAMPAIGN_NAME = "Balance Environment";
const DIRE_WOLF_ID = "cmp4eqtg10000ccwckt66hvbi";
const TERRIFYING_GAZE_ID = "cmrjjdipd0008x8wc1q7ccoza";
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
    const movementDenied = mode.toLowerCase() === "force no move";
    return {
      family: "control",
      authoredEffect: mode,
      runtimeEffect: movementDenied ? "movementDenied" : "mainActionDenied",
      runtimeSupport:
        movementDenied || mode === "Force no main action"
          ? "direct"
          : "abstracted: unsupported Control modes remain collapsed to mainActionDenied",
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

function summarizeSemanticPackage(value: unknown) {
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
}

function summarizeMonster(
  monster: MonsterRow,
  tuning: Awaited<ReturnType<typeof loadActiveTuning>>,
) {
  const rawCalculatorInput = buildCalculatorInput(monster);
  const cooldownAuthority = rawCalculatorInput.powers.map((power) => {
    const resolution = resolvePowerCooldownAuthority({
      power: power as unknown as Parameters<typeof resolvePowerCooldownAuthority>[0]["power"],
      mode: "ACTIVE_CURRENT_BALANCE",
      tuningSnapshot: tuning.powerSnapshot,
      context: { level: monster.level, tier: monster.tier },
    });
    return {
      powerId: power.id ?? null,
      powerName: power.name,
      resolution,
      power: attachPowerCooldownAuthority(
        power as unknown as Parameters<typeof attachPowerCooldownAuthority>[0],
        resolution,
      ),
    };
  });
  const calculatorInput = {
    ...rawCalculatorInput,
    powers: cooldownAuthority.map((entry) => entry.power),
  };
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
          cooldownAuthority:
            calculatorInput.powers.find(
              (authored) => authored.id === power.powerId || authored.name === power.name,
            )?.cooldownAuthority ?? null,
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
    ? controlPressureModel.semanticPackagesConsidered.map(summarizeSemanticPackage)
    : [];
  const candidatePackages = Array.isArray(controlPressureModel.candidateSemanticPackages)
    ? controlPressureModel.candidateSemanticPackages.map(summarizeSemanticPackage)
    : [];
  const remainingAcceptedSignatures = new Map<string, number>();
  for (const controlPackage of semanticPackages) {
    remainingAcceptedSignatures.set(
      controlPackage.functionalSignature,
      (remainingAcceptedSignatures.get(controlPackage.functionalSignature) ?? 0) + 1,
    );
  }
  const candidatePackageDecisions = candidatePackages.map((controlPackage) => {
    const remaining = remainingAcceptedSignatures.get(controlPackage.functionalSignature) ?? 0;
    if (remaining > 0) {
      remainingAcceptedSignatures.set(controlPackage.functionalSignature, remaining - 1);
      return { ...controlPackage, decision: "ACCEPTED" as const, rejectionReason: null };
    }
    return {
      ...controlPackage,
      decision: "REJECTED" as const,
      rejectionReason: "EXACT_FUNCTIONAL_DUPLICATE",
    };
  });
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
      const targeting = getPowerTargeting(
        power as unknown as ReturnType<typeof buildCalculatorInput>["powers"][number],
      );
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
    radarAxes: Object.fromEntries(
      Object.entries(outcome.radarAxes).map(([axis, value]) => [axis, round(value, 6)]),
    ),
    cooldownAuthority: {
      mode: "ACTIVE_CURRENT_BALANCE",
      tuningSetId: tuning.powerSnapshot.setId,
      resolved: cooldownAuthority
        .filter((entry) => entry.resolution.ok)
        .map((entry) => ({
          powerId: entry.powerId,
          powerName: entry.powerName,
          effectiveCooldownTurns: entry.resolution.ok
            ? entry.resolution.result.effectiveCooldownTurns
            : null,
          source: entry.resolution.ok ? entry.resolution.result.source : null,
          warnings: entry.resolution.ok ? entry.resolution.result.warnings : [],
        })),
      unresolved: cooldownAuthority
        .filter((entry) => !entry.resolution.ok)
        .map((entry) => ({
          powerId: entry.powerId,
          powerName: entry.powerName,
          errorCode: entry.resolution.ok ? null : entry.resolution.errorCode,
          message: entry.resolution.ok ? null : entry.resolution.message,
        })),
    },
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
        candidatePackages: candidatePackageDecisions,
        acceptedPackages: candidatePackageDecisions.filter(
          (controlPackage) => controlPackage.decision === "ACCEPTED",
        ),
        rejectedPackages: candidatePackageDecisions.filter(
          (controlPackage) => controlPackage.decision === "REJECTED",
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
    where: {
      OR: [
        { campaignId: CAMPAIGN_ID, name: { in: [...SAMPLE_NAMES] } },
        { id: DIRE_WOLF_ID },
      ],
    },
    orderBy: { name: "asc" },
    include: {
      naturalAttack: true,
      attacks: { orderBy: { sortOrder: "asc" } },
      traits: { include: { trait: true }, orderBy: { sortOrder: "asc" } },
      powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
    },
  });
}

function syntheticDireWolfFixture(
  direWolf: MonsterRow,
  fixture: "EDITOR_EQUIVALENT" | "MAIN_ACTION_DENIAL" | "FORCED_MOVEMENT",
): MonsterRow {
  const fixtureSlug = fixture.toLowerCase().replace(/_/g, "-");
  const powers = direWolf.powers.map((power) => {
    if (power.id !== TERRIFYING_GAZE_ID) return power;
    const effectPackets = power.effectPackets.map((packet) => {
      if (packet.packetIndex !== 0) return packet;
      const details = asRecord(packet.detailsJson);
      if (fixture === "FORCED_MOVEMENT") {
        return {
          ...packet,
          intention: "MOVEMENT" as const,
          type: "MOVEMENT" as const,
          detailsJson: {
            ...details,
            movementMode: "Force Push",
          },
        };
      }
      return {
        ...packet,
        intention: "CONTROL" as const,
        type: "CONTROL" as const,
        detailsJson: {
          ...details,
          controlMode:
            fixture === "MAIN_ACTION_DENIAL" ? "Force no main action" : "Force no move",
        },
      };
    });
    return {
      ...power,
      id: `synthetic-${fixtureSlug}-${power.id}`,
      effectPackets,
    };
  });
  return {
    ...direWolf,
    id: `synthetic-${fixtureSlug}-${direWolf.id}`,
    name: `Dire Wolf [${fixture.replace(/_/g, " ")}]`,
    powers,
  } as MonsterRow;
}

function acceptancePackage(
  summary: ReturnType<typeof summarizeMonster>,
) {
  return summary.controlPressure.semanticModel.semanticPackages.find(
    (controlPackage) => controlPackage.sourcePowerName === "Terrifying Gaze",
  ) ?? null;
}

function buildAcceptance(
  direWolf: MonsterRow,
  tuning: Awaited<ReturnType<typeof loadActiveTuning>>,
) {
  const saved = summarizeMonster(direWolf, tuning);
  const editorEquivalent = summarizeMonster(
    syntheticDireWolfFixture(direWolf, "EDITOR_EQUIVALENT"),
    tuning,
  );
  const mainActionDenial = summarizeMonster(
    syntheticDireWolfFixture(direWolf, "MAIN_ACTION_DENIAL"),
    tuning,
  );
  const forcedMovement = summarizeMonster(
    syntheticDireWolfFixture(direWolf, "FORCED_MOVEMENT"),
    tuning,
  );
  const fixtures = { saved, editorEquivalent, mainActionDenial, forcedMovement };
  const savedPackage = acceptancePackage(saved);
  const otherAxisNames = Object.keys(saved.radarAxes).filter((axis) => axis !== "manipulation");
  const checks = {
    savedAuthorityResolved: saved.cooldownAuthority.unresolved.length === 0,
    syntheticAuthorityResolved: [editorEquivalent, mainActionDenial, forcedMovement].every(
      (summary) => summary.cooldownAuthority.unresolved.length === 0,
    ),
    savedAboveZero: saved.controlPressure.final > 0,
    savedMovementDenial: savedPackage?.effectFamily === "MOVEMENT_DENIAL" &&
      savedPackage.runtimeSemanticMode === "movementDenied",
    savedEditorParity:
      Math.abs(saved.controlPressure.final - editorEquivalent.controlPressure.final) < 0.000001,
    matchedOrdering:
      forcedMovement.controlPressure.final < saved.controlPressure.final &&
      saved.controlPressure.final < mainActionDenial.controlPressure.final,
    otherAxesUnchanged: otherAxisNames.every(
      (axis) => saved.radarAxes[axis] === editorEquivalent.radarAxes[axis],
    ),
  };
  return {
    powerId: TERRIFYING_GAZE_ID,
    monsterId: DIRE_WOLF_ID,
    fixtures,
    packages: {
      saved: savedPackage,
      editorEquivalent: acceptancePackage(editorEquivalent),
      mainActionDenial: acceptancePackage(mainActionDenial),
      forcedMovement: acceptancePackage(forcedMovement),
    },
    scores: {
      saved: saved.controlPressure.final,
      editorEquivalent: editorEquivalent.controlPressure.final,
      mainActionDenial: mainActionDenial.controlPressure.final,
      forcedMovement: forcedMovement.controlPressure.final,
    },
    otherAxes: {
      saved: Object.fromEntries(otherAxisNames.map((axis) => [axis, saved.radarAxes[axis]])),
      editorEquivalent: Object.fromEntries(
        otherAxisNames.map((axis) => [axis, editorEquivalent.radarAxes[axis]]),
      ),
    },
    checks,
    passed: Object.values(checks).every(Boolean),
  };
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
    for (const candidate of model.candidatePackages) {
      console.log(
        `  candidate decision=${candidate.decision} rejection=${candidate.rejectionReason ?? "none"} power=${candidate.sourcePowerName} packet=${candidate.packetIndex} family=${candidate.effectFamily} signature=${candidate.functionalSignature}`,
      );
    }
    for (const unresolved of sample.cooldownAuthority.unresolved) {
      console.log(
        `  unresolvedAuthority power=${unresolved.powerName} code=${unresolved.errorCode} message=${unresolved.message}`,
      );
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
  const acceptance = payload.acceptance;
  console.log("");
  console.log(
    `Terrifying Gaze acceptance=${acceptance.passed ? "PASS" : "FAIL"} saved/editor/forced/main=${acceptance.scores.saved}/${acceptance.scores.editorEquivalent}/${acceptance.scores.forcedMovement}/${acceptance.scores.mainActionDenial}`,
  );
  console.log(`checks=${JSON.stringify(acceptance.checks)}`);
  console.log(`savedSignature=${acceptance.packages.saved?.functionalSignature ?? "missing"}`);
  for (const warning of acceptance.fixtures.saved.controlPressure.semanticModel.unsupportedAuthoringWarnings) {
    console.log(`savedWarning=${warning}`);
  }
}

async function buildPayload() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");
  try {
    const [tuning, monsters] = await Promise.all([loadActiveTuning(prisma), loadMonsters(prisma)]);
    const found = new Set(monsters.map((monster) => monster.name));
    const direWolf = monsters.find((monster) => monster.id === DIRE_WOLF_ID);
    if (!direWolf) throw new Error(`Saved Dire Wolf ${DIRE_WOLF_ID} was not found.`);
    const acceptance = buildAcceptance(direWolf, tuning);
    if (!acceptance.passed) {
      throw new Error(`Terrifying Gaze acceptance failed: ${JSON.stringify(acceptance.checks)}.`);
    }
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
        "Uses production Outcome Calculator, canonical power-cost resolver, and ACTIVE_CURRENT_BALANCE cooldown authority. Current editor-only equipment and named greater-success adapters are not reusable here, so those optional non-power bonuses are reported as zero for sampled assets.",
      missingSamples: SAMPLE_NAMES.filter((name) => !found.has(name)),
      samples: monsters.map((monster) => summarizeMonster(monster, tuning)),
      acceptance,
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
