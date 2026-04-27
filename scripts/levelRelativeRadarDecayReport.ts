import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

const LEVELS = [1, 3, 5, 10, 15, 20] as const;
const FIXED_TIER: MonsterTier = "SOLDIER";
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

type AxisKey = (typeof AXES)[number];

type SnapshotPayload = {
  name: string | null;
  values: Record<string, unknown>;
};

type NormalizationAxisDebug = {
  curveMin: number;
  curveMax: number;
  tierMultiplier: number;
  targetMax: number;
};

type LoadoutDefinition = {
  id: string;
  name: string;
  focus: string;
  baselineLevel: number;
  monsterPatch: Partial<MonsterUpsertInput>;
  attacks?: MonsterAttack[];
  powers?: Power[];
  traitAxisBonuses?: Partial<RadarAxes>;
};

type Evaluation = {
  loadoutId: string;
  loadoutName: string;
  level: number;
  tier: MonsterTier;
  legendary: boolean;
  finalRadar: RadarAxes;
  rawAxes: RadarAxes;
  effectivePowerAxes: RadarAxes;
  nonPowerAxes: RadarAxes;
  normalizationTargets: Record<AxisKey, NormalizationAxisDebug>;
};

type DecayMetric = {
  loadoutId: string;
  loadoutName: string;
  axis: AxisKey;
  baselineLevel: number;
  baselineValue: number;
  level: number;
  levelValue: number;
  absoluteDrop: number;
  ratioRemaining: number;
  percentDrop: number;
  rawBaselineValue: number;
  rawLevelValue: number;
  rawRatioRemaining: number;
  targetBaselineMax: number;
  targetLevelMax: number;
  targetRatio: number;
  nearSaturation: boolean;
};

type WeakDecayWarning = DecayMetric & {
  diagnosticTargetRatio: number;
  suggestedOwner: string;
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
    throw new Error(`Active tuning snapshot must be a JSON object: ${relativePath}`);
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

function ratio(numerator: number, denominator: number): number {
  if (!(denominator > 0)) return 0;
  return round(numerator / denominator, 4);
}

function roundAxes(input?: Partial<RadarAxes> | null): RadarAxes {
  return AXES.reduce((axes, axis) => {
    axes[axis] = round(input?.[axis]);
    return axes;
  }, {} as RadarAxes);
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

function createNaturalAttack(config: {
  name: string;
  physicalStrength?: number;
  mentalStrength?: number;
  targets?: number;
  ranged?: boolean;
  effects?: string[];
}): MonsterAttack {
  const physicalStrength = config.physicalStrength ?? 0;
  const mentalStrength = config.mentalStrength ?? 0;
  const targets = config.targets ?? 1;
  return {
    sortOrder: 0,
    attackMode: "NATURAL",
    attackName: config.name,
    attackConfig: {
      melee: {
        enabled: true,
        targets,
        physicalStrength,
        mentalStrength,
        damageTypes: [
          ...(physicalStrength > 0 ? [{ name: "Slashing", mode: "PHYSICAL" as const }] : []),
          ...(mentalStrength > 0 ? [{ name: "Psychic", mode: "MENTAL" as const }] : []),
        ],
        attackEffects: config.effects ?? [],
      },
      ranged: {
        enabled: Boolean(config.ranged),
        targets,
        distance: 60,
        physicalStrength,
        mentalStrength,
        damageTypes: [
          ...(physicalStrength > 0 ? [{ name: "Piercing", mode: "PHYSICAL" as const }] : []),
          ...(mentalStrength > 0 ? [{ name: "Psychic", mode: "MENTAL" as const }] : []),
        ],
        attackEffects: config.effects ?? [],
      },
    },
  };
}

function baseMonster(
  loadout: LoadoutDefinition,
  level: number,
): MonsterUpsertInput {
  const base: MonsterUpsertInput = {
    name: loadout.name,
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level,
    tier: FIXED_TIER,
    legendary: false,
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
    physicalResilienceCurrent: 16,
    physicalResilienceMax: 16,
    mentalPerseveranceCurrent: 16,
    mentalPerseveranceMax: 16,
    physicalProtection: 0,
    mentalProtection: 0,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 0,
    attackDie: "D8",
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: "D8",
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D8",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D8",
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: "D8",
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: "D8",
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: 2,
    weaponSkillModifier: 0,
    armorSkillValue: 2,
    armorSkillModifier: 0,
    tags: [],
    traits: [],
    attacks: loadout.attacks ?? [],
    naturalAttack: null,
    powers: loadout.powers ?? [],
  };

  return {
    ...base,
    ...loadout.monsterPatch,
    level,
    tier: FIXED_TIER,
    legendary: false,
    attacks: loadout.attacks ?? loadout.monsterPatch.attacks ?? base.attacks,
    powers: loadout.powers ?? loadout.monsterPatch.powers ?? base.powers,
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
  path: "finalPreNormalizationAxes" | "nonPowerContribution" | "powerContribution",
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
  return roundAxes(power?.effectivePowerAxisVector as Partial<RadarAxes> | null);
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

function evaluateLoadout(
  loadout: LoadoutDefinition,
  level: number,
  tuning: {
    power: SnapshotPayload;
    combatValues: Record<string, unknown>;
    runtimeCalculatorConfig: ReturnType<typeof outcomeNormalizationValuesToCalculatorConfig>;
  },
): Evaluation {
  const monster = baseMonster(loadout, level);
  const powerContribution = buildPowerContribution(monster, tuning.power);
  const result = computeMonsterOutcomes(monster, tuning.runtimeCalculatorConfig, {
    protectionTuning: tuning.combatValues,
    powerContribution,
    traitAxisBonuses: loadout.traitAxisBonuses,
  });

  return {
    loadoutId: loadout.id,
    loadoutName: loadout.name,
    level,
    tier: FIXED_TIER,
    legendary: false,
    finalRadar: roundAxes(result.radarAxes),
    rawAxes: readDebugAxes(result, "finalPreNormalizationAxes"),
    effectivePowerAxes: readDebugAxes(result, "powerContribution"),
    nonPowerAxes: readDebugAxes(result, "nonPowerContribution"),
    normalizationTargets: readNormalizationTargets(result),
  };
}

function finalAxisRow(evaluation: Evaluation): Record<string, number | string | boolean> {
  return {
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

function rawAxisRow(evaluation: Evaluation): Record<string, number | string | boolean> {
  return {
    level: evaluation.level,
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

function targetAxisRow(evaluation: Evaluation): Record<string, number | string | boolean> {
  return {
    level: evaluation.level,
    physicalThreat: evaluation.normalizationTargets.physicalThreat.targetMax,
    mentalThreat: evaluation.normalizationTargets.mentalThreat.targetMax,
    physicalSurvivability: evaluation.normalizationTargets.physicalSurvivability.targetMax,
    mentalSurvivability: evaluation.normalizationTargets.mentalSurvivability.targetMax,
    manipulation: evaluation.normalizationTargets.manipulation.targetMax,
    synergy: evaluation.normalizationTargets.synergy.targetMax,
    mobility: evaluation.normalizationTargets.mobility.targetMax,
    presence: evaluation.normalizationTargets.presence.targetMax,
  };
}

function getDiagnosticTargetRatio(level: number): number | null {
  if (level >= 20) return 0.25;
  if (level >= 15) return 0.4;
  if (level >= 10) return 0.6;
  return null;
}

function suggestOwner(metric: DecayMetric): string {
  if (metric.nearSaturation) return "axis-specific saturation/clamping issue";
  if (metric.rawRatioRemaining >= 0.9 && metric.targetRatio <= 1.5) {
    return "Outcome Normalization expectation growth too weak";
  }
  if (metric.rawRatioRemaining >= 0.9) return "raw contributor still level-insensitive";
  if (metric.targetRatio <= 1.5) return "Outcome Normalization expectation growth too weak";
  return "mixed / needs fixture";
}

function computeDecayMetrics(evaluations: Evaluation[], baselineLevel: number): DecayMetric[] {
  const baseline = evaluations.find((evaluation) => evaluation.level === baselineLevel);
  if (!baseline) throw new Error(`Missing baseline level ${baselineLevel}`);

  const metrics: DecayMetric[] = [];
  for (const axis of AXES) {
    const baselineValue = baseline.finalRadar[axis];
    const rawBaselineValue = baseline.rawAxes[axis];
    const targetBaselineMax = baseline.normalizationTargets[axis].targetMax;
    for (const evaluation of evaluations) {
      if (evaluation.level === baselineLevel) continue;
      const levelValue = evaluation.finalRadar[axis];
      const rawLevelValue = evaluation.rawAxes[axis];
      const targetLevelMax = evaluation.normalizationTargets[axis].targetMax;
      metrics.push({
        loadoutId: evaluation.loadoutId,
        loadoutName: evaluation.loadoutName,
        axis,
        baselineLevel,
        baselineValue,
        level: evaluation.level,
        levelValue,
        absoluteDrop: round(baselineValue - levelValue),
        ratioRemaining: ratio(levelValue, baselineValue),
        percentDrop: round(1 - ratio(levelValue, baselineValue)),
        rawBaselineValue,
        rawLevelValue,
        rawRatioRemaining: ratio(rawLevelValue, rawBaselineValue),
        targetBaselineMax,
        targetLevelMax,
        targetRatio: ratio(targetLevelMax, targetBaselineMax),
        nearSaturation: baselineValue >= 9.75 || levelValue >= 9.75,
      });
    }
  }
  return metrics;
}

function findWeakDecayWarnings(metrics: DecayMetric[]): WeakDecayWarning[] {
  return metrics.flatMap((metric) => {
    const diagnosticTargetRatio = getDiagnosticTargetRatio(metric.level);
    if (
      diagnosticTargetRatio === null ||
      metric.baselineValue < 8 ||
      metric.ratioRemaining <= diagnosticTargetRatio
    ) {
      return [];
    }
    return [
      {
        ...metric,
        diagnosticTargetRatio,
        suggestedOwner: suggestOwner(metric),
      },
    ];
  });
}

function printLoadoutDefinition(loadout: LoadoutDefinition) {
  console.log(`- ${loadout.name} (${loadout.id})`);
  console.log(`  focus: ${loadout.focus}`);
  console.log(`  baselineLevel: ${loadout.baselineLevel}`);
  console.log(
    `  authored content: ${loadout.attacks?.length ?? 0} natural attack(s), ${
      loadout.powers?.length ?? 0
    } power(s), trait axis bonuses ${loadout.traitAxisBonuses ? "yes" : "no"}`,
  );
}

function printLoadoutReport(loadout: LoadoutDefinition, evaluations: Evaluation[]) {
  const metrics = computeDecayMetrics(evaluations, loadout.baselineLevel);
  const baselineMetrics = metrics.filter((metric) =>
    [3, 5, 10, 15, 20].includes(metric.level),
  );
  console.log(`\n## ${loadout.name}`);
  console.log(`Focus: ${loadout.focus}`);
  console.log(`Baseline level: ${loadout.baselineLevel}`);
  console.log("\nFinal normalized radar axes");
  console.table(evaluations.map(finalAxisRow));
  console.log("\nRaw/pre-normalization axes");
  console.table(evaluations.map(rawAxisRow));
  console.log("\nNormalization target max (curve max * tier multiplier)");
  console.table(evaluations.map(targetAxisRow));
  console.log("\nDecay ratios from baseline");
  console.table(
    baselineMetrics
      .filter((metric) => metric.baselineValue >= 1)
      .map((metric) => ({
        axis: metric.axis,
        baselineLevel: metric.baselineLevel,
        baselineValue: metric.baselineValue,
        level: metric.level,
        levelValue: metric.levelValue,
        absoluteDrop: metric.absoluteDrop,
        ratioRemaining: metric.ratioRemaining,
        percentDrop: metric.percentDrop,
        rawRatioRemaining: metric.rawRatioRemaining,
        targetRatio: metric.targetRatio,
        nearSaturation: metric.nearSaturation,
      })),
  );
}

const loadouts: LoadoutDefinition[] = [
  {
    id: "control-court-mage-style",
    name: "Control Court Mage Style",
    focus: "high manipulation/control pressure from lockdown/debuff powers",
    baselineLevel: 3,
    monsterPatch: {
      intellectDie: "D10",
      braveryDie: "D10",
      mentalPerseveranceMax: 18,
      mentalPerseveranceCurrent: 18,
    },
    powers: [
      createPower({
        sortOrder: 0,
        name: "Court Lockdown",
        rangeCategories: ["AOE"],
        aoeCenterRangeFeet: 60,
        aoeCount: 2,
        aoeShape: "SPHERE",
        aoeSphereRadiusFeet: 20,
        packet: createPacket("CONTROL", {
          diceCount: 4,
          potency: 4,
          effectDurationType: "TURNS",
          effectDurationTurns: 1,
          detailsJson: {
            controlMode: "LOCKDOWN",
            rangeCategory: "AOE",
          },
        }),
      }),
      createPower({
        sortOrder: 1,
        name: "Court Debilitation",
        rangeCategories: ["RANGED"],
        rangedDistanceFeet: 60,
        rangedTargets: 2,
        packet: createPacket("DEBUFF", {
          diceCount: 3,
          potency: 3,
          effectDurationType: "TURNS",
          effectDurationTurns: 1,
          detailsJson: {
            statTarget: "Bravery",
            rangeCategory: "RANGED",
          },
        }),
      }),
    ],
    traitAxisBonuses: { manipulation: 1 },
  },
  {
    id: "physical-threat-brute",
    name: "Physical Threat Brute",
    focus: "high physical threat from authored natural attack and attack power",
    baselineLevel: 1,
    monsterPatch: {
      attackDie: "D12",
      physicalResilienceMax: 20,
      physicalResilienceCurrent: 20,
      weaponSkillValue: 3,
    },
    attacks: [
      createNaturalAttack({
        name: "Heavy Cleaver",
        physicalStrength: 4,
        targets: 2,
        ranged: false,
        effects: ["Bleed"],
      }),
    ],
    powers: [
      createPower({
        sortOrder: 0,
        name: "Brutal Slam",
        rangeCategories: ["RANGED"],
        rangedDistanceFeet: 30,
        rangedTargets: 1,
        packet: createPacket("ATTACK", {
          diceCount: 4,
          potency: 4,
          detailsJson: {
            attackMode: "PHYSICAL",
            damageTypes: ["Bludgeoning"],
            rangeCategory: "RANGED",
          },
        }),
      }),
    ],
  },
  {
    id: "physical-survivability-warden",
    name: "Physical Survivability Warden",
    focus: "high physical survivability from pools, PPV, defence, and self augment",
    baselineLevel: 1,
    monsterPatch: {
      guardDie: "D12",
      fortitudeDie: "D12",
      physicalResilienceMax: 34,
      physicalResilienceCurrent: 34,
      physicalProtection: 5,
      naturalPhysicalProtection: 5,
      armorSkillValue: 4,
      guardResistDie: 2,
      fortitudeResistDie: 2,
    },
    powers: [
      createPower({
        sortOrder: 0,
        name: "Stone Guard",
        packet: createPacket("AUGMENT", {
          applyTo: "SELF",
          diceCount: 3,
          potency: 3,
          effectDurationType: "TURNS",
          effectDurationTurns: 1,
          detailsJson: {
            statTarget: "Guard",
            rangeCategory: "SELF",
          },
        }),
      }),
    ],
    traitAxisBonuses: { physicalSurvivability: 2 },
  },
  {
    id: "mobility-skirmisher",
    name: "Mobility Skirmisher",
    focus: "high mobility from movement powers and ranged pressure",
    baselineLevel: 1,
    monsterPatch: {
      attackDie: "D10",
      intellectDie: "D10",
      physicalResilienceMax: 18,
      physicalResilienceCurrent: 18,
    },
    attacks: [
      createNaturalAttack({
        name: "Vaulting Shot",
        physicalStrength: 2,
        targets: 1,
        ranged: true,
      }),
    ],
    powers: [
      createPower({
        sortOrder: 0,
        name: "Blink Step",
        packet: createPacket("MOVEMENT", {
          applyTo: "SELF",
          diceCount: 4,
          potency: 4,
          detailsJson: {
            movementMode: "MOVE",
            rangeCategory: "SELF",
          },
        }),
      }),
      createPower({
        sortOrder: 1,
        name: "Shove Through",
        rangeCategories: ["RANGED"],
        rangedDistanceFeet: 30,
        rangedTargets: 1,
        packet: createPacket("MOVEMENT", {
          applyTo: "PRIMARY_TARGET",
          diceCount: 3,
          potency: 3,
          detailsJson: {
            movementMode: "FORCED_MOVEMENT",
            rangeCategory: "RANGED",
          },
        }),
      }),
    ],
  },
  {
    id: "mental-synergy-oracle",
    name: "Mental Synergy Oracle",
    focus: "optional mental threat, mental survivability, and ally synergy signal",
    baselineLevel: 1,
    monsterPatch: {
      intellectDie: "D12",
      synergyDie: "D12",
      braveryDie: "D12",
      mentalPerseveranceMax: 34,
      mentalPerseveranceCurrent: 34,
      mentalProtection: 4,
      naturalMentalProtection: 4,
      intellectResistDie: 2,
      synergyResistDie: 2,
      braveryResistDie: 2,
    },
    attacks: [
      createNaturalAttack({
        name: "Mind Lance",
        mentalStrength: 4,
        targets: 2,
        ranged: true,
      }),
    ],
    powers: [
      createPower({
        sortOrder: 0,
        name: "Mind Rend",
        rangeCategories: ["RANGED"],
        rangedDistanceFeet: 60,
        rangedTargets: 1,
        packet: createPacket("ATTACK", {
          diceCount: 4,
          potency: 4,
          detailsJson: {
            attackMode: "MENTAL",
            damageTypes: ["Psychic"],
            rangeCategory: "RANGED",
          },
        }),
      }),
      createPower({
        sortOrder: 1,
        name: "Rally Minds",
        rangeCategories: ["RANGED"],
        rangedDistanceFeet: 60,
        rangedTargets: 3,
        packet: createPacket("AUGMENT", {
          applyTo: "ALLIES",
          diceCount: 3,
          potency: 3,
          effectDurationType: "TURNS",
          effectDurationTurns: 1,
          detailsJson: {
            statTarget: "Bravery",
            rangeCategory: "RANGED",
          },
        }),
      }),
    ],
    traitAxisBonuses: { mentalThreat: 1, mentalSurvivability: 1, synergy: 1 },
  },
];

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

console.log("Level-Relative Radar Decay Report");
console.log("Uses active tuning snapshots only:");
console.log(`- Power Tuning: ${TUNING_SNAPSHOT_PATHS.power} (${powerSnapshot.name ?? "unnamed"})`);
console.log(`- Combat Tuning: ${TUNING_SNAPSHOT_PATHS.combat} (${combatSnapshot.name ?? "unnamed"})`);
console.log(`- Outcome Normalization: ${TUNING_SNAPSHOT_PATHS.outcome} (${outcomeSnapshot.name ?? "unnamed"})`);
console.log("Report-only diagnostic. Weak-decay thresholds are sensitivity warnings, not balance law.");
console.log("Fixed sweep: tier SOLDIER, legendary false, levels 1/3/5/10/15/20.");

console.log("\n## Synthetic Loadout Definitions");
for (const loadout of loadouts) {
  printLoadoutDefinition(loadout);
}

const evaluationsByLoadout = new Map<string, Evaluation[]>();
const allMetrics: DecayMetric[] = [];
const allWarnings: WeakDecayWarning[] = [];

for (const loadout of loadouts) {
  const evaluations = LEVELS.map((level) => evaluateLoadout(loadout, level, tuning));
  evaluationsByLoadout.set(loadout.id, evaluations);
  printLoadoutReport(loadout, evaluations);
  const metrics = computeDecayMetrics(evaluations, loadout.baselineLevel);
  const warnings = findWeakDecayWarnings(metrics);
  allMetrics.push(...metrics);
  allWarnings.push(...warnings);
}

console.log("\n## Weak Decay Warnings");
if (allWarnings.length === 0) {
  console.log("No weak-decay warnings for axes with baseline value >= 8.");
} else {
  console.table(
    allWarnings.map((warning) => ({
      loadout: warning.loadoutName,
      axis: warning.axis,
      baseline: `L${warning.baselineLevel}`,
      baselineValue: warning.baselineValue,
      level: warning.level,
      levelValue: warning.levelValue,
      ratioRemaining: warning.ratioRemaining,
      diagnosticTargetRatio: warning.diagnosticTargetRatio,
      percentDrop: warning.percentDrop,
      rawRatioRemaining: warning.rawRatioRemaining,
      targetRatio: warning.targetRatio,
      nearSaturation: warning.nearSaturation,
      suggestedOwner: warning.suggestedOwner,
    })),
  );
}

console.log("\n## Weakest Decay Ranking To Level 20");
const level20Ranking = allMetrics
  .filter((metric) => metric.level === 20 && metric.baselineValue >= 1)
  .sort((left, right) => right.ratioRemaining - left.ratioRemaining)
  .slice(0, 25);
console.table(
  level20Ranking.map((metric) => ({
    loadout: metric.loadoutName,
    axis: metric.axis,
    baseline: `L${metric.baselineLevel}`,
    baselineValue: metric.baselineValue,
    level20Value: metric.levelValue,
    ratioRemaining: metric.ratioRemaining,
    percentDrop: metric.percentDrop,
    rawRatioRemaining: metric.rawRatioRemaining,
    targetRatio: metric.targetRatio,
    nearSaturation: metric.nearSaturation,
    suggestedOwner: suggestOwner(metric),
  })),
);

console.log("\n## Summary");
console.log(`Loadouts evaluated: ${loadouts.length}`);
console.log(`Weak-decay warnings: ${allWarnings.length}`);
console.log("Exit status: 0 (report-only diagnostic).");
