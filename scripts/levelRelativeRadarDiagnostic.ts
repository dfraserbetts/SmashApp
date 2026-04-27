import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inspect } from "node:util";

import {
  computeMonsterOutcomes,
  type CanonicalPowerContribution,
  type MonsterOutcomeProfile,
  type RadarAxes,
} from "../lib/calculators/monsterOutcomeCalculator";
import { applyCombatTuningToCalculatorConfig } from "../lib/config/combatTuningShared";
import { outcomeNormalizationValuesToCalculatorConfig } from "../lib/config/outcomeNormalizationShared";
import { normalizePowerTuningValues } from "../lib/config/powerTuningShared";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import type {
  EffectPacket,
  MonsterAttack,
  MonsterTier,
  MonsterUpsertInput,
  Power,
  RangeCategory,
} from "../lib/summoning/types";

const TUNING_SNAPSHOT_PATHS = {
  power: "scripts/fixtures/tuning/active-power-tuning.json",
  combat: "scripts/fixtures/tuning/active-combat-tuning.json",
  outcome: "scripts/fixtures/tuning/active-outcome-normalization.json",
} as const;

const AXES = [
  "physicalThreat",
  "mentalThreat",
  "physicalSurvivability",
  "mentalSurvivability",
  "manipulation",
  "synergy",
  "mobility",
  "presence",
] as const satisfies readonly (keyof RadarAxes)[];

const TIER_ORDER = [
  "MINION",
  "SOLDIER",
  "ELITE",
  "BOSS",
] as const satisfies readonly MonsterTier[];
const EPSILON = 0.0001;

type AxisKey = (typeof AXES)[number];
type SweepName =
  | "level sweep"
  | "tier sweep"
  | "legendary sweep"
  | "floor/ceiling";

type SnapshotPayload = {
  name: string | null;
  values: Record<string, unknown>;
};

type VariantSpec = {
  label: string;
  level: number;
  tier: MonsterTier;
  legendary: boolean;
};

type NormalizationAxisDebug = {
  curveMin: number;
  curveMax: number;
  tierMultiplier: number;
  targetMax: number;
};

type Evaluation = VariantSpec & {
  monsterName: string;
  finalRadar: RadarAxes;
  rawAxes: RadarAxes;
  nonPowerAxes: RadarAxes;
  effectivePowerAxes: RadarAxes;
  normalizationTargets: Record<AxisKey, NormalizationAxisDebug>;
  rawBudgetTargets: Partial<RadarAxes>;
  poolHealthBreakdown: unknown;
  majorContributors: {
    nonPowerTotal: number;
    effectivePowerTotal: number;
    rawTotal: number;
  };
};

type Violation = {
  monsterName: string;
  sweepName: SweepName;
  axis: AxisKey;
  previousVariant: string;
  currentVariant: string;
  previousValue: number;
  currentValue: number;
  expectedDirection: string;
  delta: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSnapshot(relativePath: string): SnapshotPayload {
  const absolutePath = join(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing active tuning snapshot: ${relativePath}`);
  }

  const parsed = JSON.parse(
    readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""),
  ) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(
      `Active tuning snapshot must be a JSON object: ${relativePath}`,
    );
  }

  return {
    name:
      typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : null,
    values: isRecord(parsed.values) ? parsed.values : parsed,
  };
}

function round(value: unknown, digits = 4): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundAxes(input?: Partial<RadarAxes> | null): RadarAxes {
  return AXES.reduce((axes, axis) => {
    axes[axis] = round(input?.[axis]);
    return axes;
  }, {} as RadarAxes);
}

function sumAxes(input: RadarAxes): number {
  return AXES.reduce((sum, axis) => sum + input[axis], 0);
}

function axisRow(
  evaluation: Evaluation,
): Record<string, number | string | boolean> {
  return {
    variant: evaluation.label,
    level: evaluation.level,
    tier: evaluation.tier,
    legendary: evaluation.legendary,
    physicalThreat: evaluation.finalRadar.physicalThreat,
    mentalThreat: evaluation.finalRadar.mentalThreat,
    physicalSurvivability: evaluation.finalRadar.physicalSurvivability,
    mentalSurvivability: evaluation.finalRadar.mentalSurvivability,
    manipulation: evaluation.finalRadar.manipulation,
    synergy: evaluation.finalRadar.synergy,
    mobility: evaluation.finalRadar.mobility,
    presence: evaluation.finalRadar.presence,
  };
}

function rawAxisRow(
  evaluation: Evaluation,
): Record<string, number | string | boolean> {
  return {
    variant: evaluation.label,
    level: evaluation.level,
    tier: evaluation.tier,
    legendary: evaluation.legendary,
    physicalThreat: evaluation.rawAxes.physicalThreat,
    mentalThreat: evaluation.rawAxes.mentalThreat,
    physicalSurvivability: evaluation.rawAxes.physicalSurvivability,
    mentalSurvivability: evaluation.rawAxes.mentalSurvivability,
    manipulation: evaluation.rawAxes.manipulation,
    synergy: evaluation.rawAxes.synergy,
    mobility: evaluation.rawAxes.mobility,
    presence: evaluation.rawAxes.presence,
  };
}

function targetRow(
  evaluation: Evaluation,
): Record<string, number | string | boolean> {
  return {
    variant: evaluation.label,
    level: evaluation.level,
    tier: evaluation.tier,
    legendary: evaluation.legendary,
    physicalThreat: evaluation.normalizationTargets.physicalThreat.targetMax,
    mentalThreat: evaluation.normalizationTargets.mentalThreat.targetMax,
    physicalSurvivability:
      evaluation.normalizationTargets.physicalSurvivability.targetMax,
    mentalSurvivability:
      evaluation.normalizationTargets.mentalSurvivability.targetMax,
    manipulation: evaluation.normalizationTargets.manipulation.targetMax,
    synergy: evaluation.normalizationTargets.synergy.targetMax,
    mobility: evaluation.normalizationTargets.mobility.targetMax,
    presence: evaluation.normalizationTargets.presence.targetMax,
  };
}

function createPacket(
  intention: EffectPacket["intention"],
  overrides: Partial<EffectPacket> = {},
): EffectPacket {
  return {
    sortOrder: 0,
    packetIndex: 0,
    hostility:
      intention === "ATTACK" ||
      intention === "CONTROL" ||
      intention === "DEBUFF"
        ? "HOSTILE"
        : "NON_HOSTILE",
    intention,
    type: intention,
    diceCount: 2,
    potency: 2,
    effectTimingType: "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: "INSTANT",
    effectDurationTurns: null,
    applyTo: "PRIMARY_TARGET",
    triggerConditionText: null,
    detailsJson: {},
    ...overrides,
  };
}

function createPower(config: {
  sortOrder: number;
  name: string;
  rangeCategories?: RangeCategory[];
  rangedDistanceFeet?: number | null;
  rangedTargets?: number | null;
  aoeCenterRangeFeet?: number | null;
  aoeCount?: number | null;
  aoeShape?: "SPHERE" | "CONE" | "LINE" | null;
  aoeSphereRadiusFeet?: number | null;
  packet: EffectPacket;
}): Power {
  return {
    sortOrder: config.sortOrder,
    name: config.name,
    description: null,
    descriptorChassis: "IMMEDIATE",
    descriptorChassisConfig: {},
    cooldownTurns: 1,
    cooldownReduction: 0,
    counterMode: "NO",
    commitmentModifier: "STANDARD",
    lifespanType: "NONE",
    lifespanTurns: null,
    rangeCategories: config.rangeCategories ?? [],
    rangedDistanceFeet: config.rangedDistanceFeet ?? null,
    rangedTargets: config.rangedTargets ?? null,
    aoeCenterRangeFeet: config.aoeCenterRangeFeet ?? null,
    aoeCount: config.aoeCount ?? null,
    aoeShape: config.aoeShape ?? null,
    aoeSphereRadiusFeet: config.aoeSphereRadiusFeet ?? null,
    effectPackets: [config.packet],
    intentions: [config.packet],
    diceCount: Number(config.packet.diceCount ?? 1),
    potency: Number(config.packet.potency ?? 1),
    effectDurationType: config.packet.effectDurationType ?? "INSTANT",
    effectDurationTurns: config.packet.effectDurationTurns ?? null,
    durationType: config.packet.effectDurationType ?? "INSTANT",
    durationTurns: config.packet.effectDurationTurns ?? null,
    defenceRequirement: "NONE",
  };
}

function createNaturalAttack(): MonsterAttack {
  return {
    sortOrder: 0,
    attackMode: "NATURAL",
    attackName: "Diagnostic Split Strike",
    attackConfig: {
      melee: {
        enabled: true,
        targets: 1,
        physicalStrength: 2,
        mentalStrength: 1,
        damageTypes: [
          { name: "Slashing", mode: "PHYSICAL" },
          { name: "Psychic", mode: "MENTAL" },
        ],
        attackEffects: [],
      },
      ranged: {
        enabled: true,
        targets: 2,
        distance: 60,
        physicalStrength: 1,
        mentalStrength: 2,
        damageTypes: [
          { name: "Piercing", mode: "PHYSICAL" },
          { name: "Psychic", mode: "MENTAL" },
        ],
        attackEffects: [],
      },
    },
  };
}

function createDiagnosticPowers(): Power[] {
  return [
    createPower({
      sortOrder: 0,
      name: "Diagnostic Ruin",
      rangeCategories: ["RANGED"],
      rangedDistanceFeet: 60,
      rangedTargets: 1,
      packet: createPacket("ATTACK", {
        diceCount: 3,
        potency: 3,
        detailsJson: {
          attackMode: "PHYSICAL",
          damageTypes: ["Fire", "Piercing"],
          rangeCategory: "RANGED",
        },
      }),
    }),
    createPower({
      sortOrder: 1,
      name: "Diagnostic Lock",
      rangeCategories: ["AOE"],
      aoeCenterRangeFeet: 60,
      aoeCount: 2,
      aoeShape: "SPHERE",
      aoeSphereRadiusFeet: 20,
      packet: createPacket("CONTROL", {
        diceCount: 3,
        potency: 3,
        effectDurationType: "TURNS",
        effectDurationTurns: 1,
        detailsJson: {
          controlMode: "LOCKDOWN",
          rangeCategory: "AOE",
        },
      }),
    }),
    createPower({
      sortOrder: 2,
      name: "Diagnostic Rally",
      rangeCategories: ["RANGED"],
      rangedDistanceFeet: 60,
      rangedTargets: 3,
      packet: createPacket("AUGMENT", {
        applyTo: "ALLIES",
        diceCount: 2,
        potency: 3,
        effectDurationType: "TURNS",
        effectDurationTurns: 1,
        detailsJson: {
          statTarget: "Bravery",
          rangeCategory: "RANGED",
        },
      }),
    }),
    createPower({
      sortOrder: 3,
      name: "Diagnostic Step",
      packet: createPacket("MOVEMENT", {
        applyTo: "SELF",
        diceCount: 2,
        potency: 2,
        detailsJson: {
          movementMode: "MOVE",
          rangeCategory: "SELF",
        },
      }),
    }),
  ];
}

function createDiagnosticMonster(variant: VariantSpec): MonsterUpsertInput {
  return {
    name: "Level-Relative Radar Diagnostic",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: variant.level,
    tier: variant.tier,
    legendary: variant.legendary,
    mainHandItemId: null,
    offHandItemId: null,
    smallItemId: null,
    headArmorItemId: null,
    shoulderArmorItemId: null,
    torsoArmorItemId: null,
    legsArmorItemId: null,
    feetArmorItemId: null,
    headItemId: null,
    neckItemId: null,
    armsItemId: null,
    beltItemId: null,
    customNotes: null,
    limitBreakName: null,
    limitBreakTier: null,
    limitBreakTriggerText: null,
    limitBreakAttribute: null,
    limitBreakThresholdSuccesses: null,
    limitBreakCostText: null,
    limitBreakEffectText: null,
    limitBreak2Name: null,
    limitBreak2Tier: null,
    limitBreak2TriggerText: null,
    limitBreak2Attribute: null,
    limitBreak2ThresholdSuccesses: null,
    limitBreak2CostText: null,
    limitBreak2EffectText: null,
    physicalResilienceCurrent: 42,
    physicalResilienceMax: 42,
    mentalPerseveranceCurrent: 40,
    mentalPerseveranceMax: 40,
    physicalProtection: 3,
    mentalProtection: 2,
    naturalPhysicalProtection: 3,
    naturalMentalProtection: 2,
    attackDie: "D10",
    attackResistDie: 1,
    attackModifier: 0,
    guardDie: "D10",
    guardResistDie: 1,
    guardModifier: 0,
    fortitudeDie: "D10",
    fortitudeResistDie: 1,
    fortitudeModifier: 0,
    intellectDie: "D10",
    intellectResistDie: 1,
    intellectModifier: 0,
    synergyDie: "D10",
    synergyResistDie: 1,
    synergyModifier: 0,
    braveryDie: "D10",
    braveryResistDie: 1,
    braveryModifier: 0,
    weaponSkillValue: 2,
    weaponSkillModifier: 0,
    armorSkillValue: 2,
    armorSkillModifier: 0,
    tags: [],
    traits: [],
    attacks: [createNaturalAttack()],
    naturalAttack: null,
    powers: createDiagnosticPowers(),
  };
}

function buildPowerContribution(
  monster: MonsterUpsertInput,
  powerTuning: SnapshotPayload,
): CanonicalPowerContribution {
  const resolved = resolvePowerCosts(
    monster.powers,
    {
      setId: "active-power-tuning",
      name: powerTuning.name,
      values: normalizePowerTuningValues(powerTuning.values),
    },
    { level: monster.level, tier: monster.tier },
  );

  return {
    axisVector: resolved.totals.axisVector,
    basePowerValue: resolved.totals.basePowerValue,
    powerCount: resolved.powers.length,
    powers: resolved.powers.map((power) => ({
      id: power.powerId ?? null,
      name: power.name,
      axisVector: power.breakdown.axisVector,
      basePowerValue: power.breakdown.basePowerValue,
      derivedCooldownTurns: power.derivedCooldownTurns,
      cooldownTurns: power.cooldownTurns,
      cooldownReduction: power.cooldownReduction,
    })),
    debug: {
      totals: resolved.totals,
      powers: resolved.powers.map((power) => ({
        name: power.name,
        basePowerValue: power.breakdown.basePowerValue,
        derivedCooldownTurns: power.derivedCooldownTurns,
        derivedCooldown: power.derivedCooldown,
        axisVector: power.breakdown.axisVector,
      })),
    },
  };
}

function readDebugAxes(
  result: MonsterOutcomeProfile,
  path:
    | "finalPreNormalizationAxes"
    | "nonPowerContribution"
    | "powerContribution",
): RadarAxes {
  const debug = result.debug;
  if (path === "finalPreNormalizationAxes") {
    return roundAxes(
      isRecord(debug)
        ? (debug.finalPreNormalizationAxes as Partial<RadarAxes>)
        : null,
    );
  }
  if (path === "nonPowerContribution") {
    const nonPower = isRecord(debug?.nonPowerContribution)
      ? debug.nonPowerContribution
      : null;
    return roundAxes(nonPower?.axisVector as Partial<RadarAxes> | null);
  }
  const power = isRecord(debug?.powerContribution)
    ? debug.powerContribution
    : null;
  return roundAxes(
    power?.effectivePowerAxisVector as Partial<RadarAxes> | null,
  );
}

function readNormalizationTargets(
  result: MonsterOutcomeProfile,
): Record<AxisKey, NormalizationAxisDebug> {
  const debug = result.debug;
  const normalization = isRecord(debug?.normalizationBreakdown)
    ? debug.normalizationBreakdown
    : {};
  const tierMultiplier = round(normalization.tierMultiplier, 6);
  const curvePoints = isRecord(normalization.curvePoints)
    ? normalization.curvePoints
    : {};

  return AXES.reduce(
    (targets, axis) => {
      const point = isRecord(curvePoints[axis]) ? curvePoints[axis] : {};
      const curveMin = round(point.min, 6);
      const curveMax = round(point.max, 6);
      targets[axis] = {
        curveMin,
        curveMax,
        tierMultiplier,
        targetMax: round(curveMax * tierMultiplier, 6),
      };
      return targets;
    },
    {} as Record<AxisKey, NormalizationAxisDebug>,
  );
}

function evaluateVariant(
  variant: VariantSpec,
  tuning: {
    power: SnapshotPayload;
    combatValues: Record<string, unknown>;
    runtimeCalculatorConfig: ReturnType<
      typeof outcomeNormalizationValuesToCalculatorConfig
    >;
  },
): Evaluation {
  const monster = createDiagnosticMonster(variant);
  const powerContribution = buildPowerContribution(monster, tuning.power);
  const result = computeMonsterOutcomes(
    monster,
    tuning.runtimeCalculatorConfig,
    {
      protectionTuning: tuning.combatValues,
      powerContribution,
      traitAxisBonuses: {
        physicalThreat: 1,
        mentalThreat: 1,
        physicalSurvivability: 1,
        mentalSurvivability: 1,
        manipulation: 1.5,
        synergy: 1.5,
        mobility: 1.5,
        presence: 1.5,
      },
    },
  );
  const debug = result.debug;
  const nonPowerAxes = readDebugAxes(result, "nonPowerContribution");
  const effectivePowerAxes = readDebugAxes(result, "powerContribution");
  const rawAxes = readDebugAxes(result, "finalPreNormalizationAxes");
  const nonPower = isRecord(debug?.nonPowerContribution)
    ? debug.nonPowerContribution
    : {};
  const nonPowerSources = isRecord(nonPower.sources) ? nonPower.sources : {};

  return {
    ...variant,
    monsterName: monster.name,
    finalRadar: roundAxes(result.radarAxes),
    rawAxes,
    nonPowerAxes,
    effectivePowerAxes,
    normalizationTargets: readNormalizationTargets(result),
    rawBudgetTargets: roundAxes(
      isRecord(nonPowerSources.rawSurvivabilityBudgetTargets)
        ? (nonPowerSources.rawSurvivabilityBudgetTargets as Partial<RadarAxes>)
        : null,
    ),
    poolHealthBreakdown: isRecord(debug) ? debug.poolHealthBreakdown : null,
    majorContributors: {
      nonPowerTotal: round(sumAxes(nonPowerAxes)),
      effectivePowerTotal: round(sumAxes(effectivePowerAxes)),
      rawTotal: round(sumAxes(rawAxes)),
    },
  };
}

function checkNonIncreasing(
  sweepName: SweepName,
  evaluations: Evaluation[],
  valueForAxis: (evaluation: Evaluation, axis: AxisKey) => number,
  expectedDirection: string,
): Violation[] {
  const violations: Violation[] = [];

  for (const axis of AXES) {
    for (let index = 1; index < evaluations.length; index += 1) {
      const previous = evaluations[index - 1];
      const current = evaluations[index];
      const previousValue = valueForAxis(previous, axis);
      const currentValue = valueForAxis(current, axis);
      const delta = currentValue - previousValue;

      if (delta > EPSILON) {
        violations.push({
          monsterName: current.monsterName,
          sweepName,
          axis,
          previousVariant: previous.label,
          currentVariant: current.label,
          previousValue,
          currentValue,
          expectedDirection,
          delta: round(delta),
        });
      }
    }
  }

  return violations;
}

function checkTargetNonDecreasing(
  sweepName: SweepName,
  evaluations: Evaluation[],
): Violation[] {
  const violations: Violation[] = [];

  for (const axis of AXES) {
    for (let index = 1; index < evaluations.length; index += 1) {
      const previous = evaluations[index - 1];
      const current = evaluations[index];
      const previousValue = previous.normalizationTargets[axis].targetMax;
      const currentValue = current.normalizationTargets[axis].targetMax;
      const delta = currentValue - previousValue;

      if (delta < -EPSILON) {
        violations.push({
          monsterName: current.monsterName,
          sweepName,
          axis,
          previousVariant: previous.label,
          currentVariant: current.label,
          previousValue,
          currentValue,
          expectedDirection:
            "normalization target should be non-decreasing as expectation rises",
          delta: round(delta),
        });
      }
    }
  }

  return violations;
}

function printSweep(title: string, evaluations: Evaluation[]) {
  console.log(`\n## ${title}`);
  console.log("\nFinal normalized radar axes");
  console.table(evaluations.map(axisRow));
  console.log("\nRaw/pre-normalization axes");
  console.table(evaluations.map(rawAxisRow));
  console.log(
    "\nNormalization target max by axis (curve max * tier multiplier)",
  );
  console.table(evaluations.map(targetRow));
  console.log("\nMajor contributor totals");
  console.table(
    evaluations.map((evaluation) => ({
      variant: evaluation.label,
      nonPowerTotal: evaluation.majorContributors.nonPowerTotal,
      effectivePowerTotal: evaluation.majorContributors.effectivePowerTotal,
      rawTotal: evaluation.majorContributors.rawTotal,
    })),
  );
}

function printViolations(title: string, violations: Violation[], limit = 20) {
  console.log(`\n${title}: ${violations.length}`);
  if (violations.length > 0) {
    console.table(
      violations.slice(0, limit).map((violation) => ({
        sweep: violation.sweepName,
        axis: violation.axis,
        previous: violation.previousVariant,
        current: violation.currentVariant,
        previousValue: violation.previousValue,
        currentValue: violation.currentValue,
        delta: violation.delta,
        expected: violation.expectedDirection,
      })),
    );
  }
}

const powerSnapshot = readSnapshot(TUNING_SNAPSHOT_PATHS.power);
const combatSnapshot = readSnapshot(TUNING_SNAPSHOT_PATHS.combat);
const outcomeSnapshot = readSnapshot(TUNING_SNAPSHOT_PATHS.outcome);
const runtimeCalculatorConfig = applyCombatTuningToCalculatorConfig(
  outcomeNormalizationValuesToCalculatorConfig(outcomeSnapshot.values),
  combatSnapshot.values,
);
const tuning = {
  power: powerSnapshot,
  combatValues: combatSnapshot.values,
  runtimeCalculatorConfig,
};

console.log("Level-Relative Radar Diagnostic");
console.log("Uses active tuning snapshots only:");
console.log(
  `- Power Tuning: ${TUNING_SNAPSHOT_PATHS.power} (${powerSnapshot.name ?? "unnamed"})`,
);
console.log(
  `- Combat Tuning: ${TUNING_SNAPSHOT_PATHS.combat} (${combatSnapshot.name ?? "unnamed"})`,
);
console.log(
  `- Outcome Normalization: ${TUNING_SNAPSHOT_PATHS.outcome} (${outcomeSnapshot.name ?? "unnamed"})`,
);
console.log(`Epsilon: ${EPSILON}`);
console.log(
  "Diagnostic monster source: synthetic in-script authored monster with natural attack, fixed pools/protection/attributes, fixed powers, and fixed trait axis bonuses.",
);

const levelSweep = Array.from({ length: 20 }, (_, index) => {
  const level = index + 1;
  return evaluateVariant(
    {
      label: `L${level} SOLDIER`,
      level,
      tier: "SOLDIER",
      legendary: false,
    },
    tuning,
  );
});

const tierSweep = TIER_ORDER.map((tier) =>
  evaluateVariant(
    {
      label: `L5 ${tier}`,
      level: 5,
      tier,
      legendary: false,
    },
    tuning,
  ),
);

const legendarySweep = [
  evaluateVariant(
    {
      label: "L5 BOSS",
      level: 5,
      tier: "BOSS",
      legendary: false,
    },
    tuning,
  ),
  evaluateVariant(
    {
      label: "L5 LEGENDARY BOSS",
      level: 5,
      tier: "BOSS",
      legendary: true,
    },
    tuning,
  ),
];

const floorCeilingSweep = [
  evaluateVariant(
    {
      label: "L1 MINION",
      level: 1,
      tier: "MINION",
      legendary: false,
    },
    tuning,
  ),
  evaluateVariant(
    {
      label: "L20 LEGENDARY BOSS",
      level: 20,
      tier: "BOSS",
      legendary: true,
    },
    tuning,
  ),
];

printSweep("A. Level sweep (tier SOLDIER, non-legendary)", levelSweep);
printSweep("B. Tier sweep (level 5, non-legendary)", tierSweep);
printSweep("C. Legendary sweep (level 5, BOSS)", legendarySweep);
printSweep("D. Floor / ceiling sanity check", floorCeilingSweep);

const contractViolations = [
  ...checkNonIncreasing(
    "level sweep",
    levelSweep,
    (evaluation, axis) => evaluation.finalRadar[axis],
    "final radar should be non-increasing as level rises",
  ),
  ...checkNonIncreasing(
    "tier sweep",
    tierSweep,
    (evaluation, axis) => evaluation.finalRadar[axis],
    "final radar should be non-increasing as tier rises",
  ),
  ...checkNonIncreasing(
    "legendary sweep",
    legendarySweep,
    (evaluation, axis) => evaluation.finalRadar[axis],
    "final radar should not increase when Legendary is added",
  ),
  ...checkNonIncreasing(
    "floor/ceiling",
    floorCeilingSweep,
    (evaluation, axis) => evaluation.finalRadar[axis],
    "Level 20 Legendary Boss should be <= Level 1 Minion",
  ),
];

const rawLevelIncreases = checkNonIncreasing(
  "level sweep",
  levelSweep,
  (evaluation, axis) => evaluation.rawAxes[axis],
  "raw axes should not increase if authored loadout is truly level-neutral",
);
const expectationTargetDrops = [
  ...checkTargetNonDecreasing("level sweep", levelSweep),
  ...checkTargetNonDecreasing("tier sweep", tierSweep),
  ...checkTargetNonDecreasing("legendary sweep", legendarySweep),
  ...checkTargetNonDecreasing("floor/ceiling", floorCeilingSweep),
];

printViolations("Contract violations", contractViolations, 40);
printViolations("Raw/pre-normalization level increases", rawLevelIncreases);
printViolations(
  "Normalization expectation target drops",
  expectationTargetDrops,
);

console.log("\nRepresentative debug slices");
console.log(
  inspect(
    {
      level1Soldier: {
        normalizationTargets: levelSweep[0].normalizationTargets,
        rawBudgetTargets: levelSweep[0].rawBudgetTargets,
        poolHealthBreakdown: levelSweep[0].poolHealthBreakdown,
      },
      level20Soldier: {
        normalizationTargets:
          levelSweep[levelSweep.length - 1].normalizationTargets,
        rawBudgetTargets: levelSweep[levelSweep.length - 1].rawBudgetTargets,
        poolHealthBreakdown:
          levelSweep[levelSweep.length - 1].poolHealthBreakdown,
      },
    },
    { depth: 8, colors: false, compact: false, sorted: true },
  ),
);

const passed = contractViolations.length === 0;
console.log(
  `\nSUMMARY: ${passed ? "PASS" : "FAIL"} - ${contractViolations.length} level-relative radar contract violation(s).`,
);
console.log(
  `Raw axes increased with level: ${rawLevelIncreases.length > 0 ? "YES" : "NO"} (${rawLevelIncreases.length} event(s)).`,
);
console.log(
  `Normalization expectations shrink/jump downward: ${
    expectationTargetDrops.length > 0 ? "YES" : "NO"
  } (${expectationTargetDrops.length} event(s)).`,
);

if (!passed) {
  process.exitCode = 1;
}
