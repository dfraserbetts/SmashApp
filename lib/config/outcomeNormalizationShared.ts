import {
  calculatorConfig,
  resolveCalculatorConfig,
  type CalculatorConfig,
  type LevelCurvePoint,
} from "@/lib/calculators/calculatorConfig";

export type OutcomeNormalizationConfigStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type OutcomeNormalizationFlatValues = Record<string, number>;
export type OutcomeNormalizationSnapshot = {
  setId: string;
  name: string;
  slug: string;
  status: OutcomeNormalizationConfigStatus;
  updatedAt: string;
  values: OutcomeNormalizationFlatValues;
};

const SCORING_CURVE_AXES = [
  "physicalThreat",
  "mentalThreat",
  "physicalSurvivability",
  "mentalSurvivability",
  "manipulation",
  "synergy",
  "mobility",
  "presence",
] as const;

type ScoringCurveAxis = (typeof SCORING_CURVE_AXES)[number];

function curveDefaults(axis: ScoringCurveAxis) {
  return Object.fromEntries(
    calculatorConfig.scoringCurves[axis].map((point) => [
      String(point.level),
      { min: point.min, max: point.max },
    ]),
  );
}

export const OUTCOME_NORMALIZATION_DEFAULTS_NESTED = {
  tierMultipliers: {
    ...calculatorConfig.tierMultipliers,
  },
  baselineParty: {
    ...calculatorConfig.baselineParty,
  },
  manipulationTuning: {
    rangeCategoryMultiplier: {
      ...calculatorConfig.manipulationTuning.rangeCategoryMultiplier,
    },
    rangedDistanceScalarPer30ft: calculatorConfig.manipulationTuning.rangedDistanceScalarPer30ft,
    aoeCastRangeScalarPer30ft: calculatorConfig.manipulationTuning.aoeCastRangeScalarPer30ft,
    maxDistanceScalarBonus: calculatorConfig.manipulationTuning.maxDistanceScalarBonus,
    meleeTargetExponent: calculatorConfig.manipulationTuning.meleeTargetExponent,
    rangedTargetExponent: calculatorConfig.manipulationTuning.rangedTargetExponent,
    aoeGridSquareFeet: calculatorConfig.manipulationTuning.aoeGridSquareFeet,
    aoeMaxExpectedTargets: calculatorConfig.manipulationTuning.aoeMaxExpectedTargets,
    aoeCountExponent: calculatorConfig.manipulationTuning.aoeCountExponent,
    sphereRadiusScalarPer10ft: calculatorConfig.manipulationTuning.sphereRadiusScalarPer10ft,
    coneLengthScalarPer30ft: calculatorConfig.manipulationTuning.coneLengthScalarPer30ft,
    lineLengthScalarPer30ft: calculatorConfig.manipulationTuning.lineLengthScalarPer30ft,
    lineWidthScalarPer5ft: calculatorConfig.manipulationTuning.lineWidthScalarPer5ft,
    maxGeometryScalarBonus: calculatorConfig.manipulationTuning.maxGeometryScalarBonus,
  },
  seuFallbacks: {
    ...calculatorConfig.seuFallbacks,
  },
  naturalAttackTuning: {
    ...calculatorConfig.naturalAttackTuning,
  },
  scoringCurves: Object.fromEntries(
    SCORING_CURVE_AXES.map((axis) => [axis, curveDefaults(axis)]),
  ),
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNonNegativeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

export function flattenNestedOutcomeNormalizationDefaults(
  input: Record<string, unknown>,
): OutcomeNormalizationFlatValues {
  const flattened: OutcomeNormalizationFlatValues = {};

  function visit(node: Record<string, unknown>, prefix: string) {
    for (const [key, value] of Object.entries(node)) {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "number" && Number.isFinite(value)) {
        flattened[nextKey] = value;
        continue;
      }
      if (isRecord(value)) {
        visit(value, nextKey);
      }
    }
  }

  visit(input, "");
  return flattened;
}

export const DEFAULT_OUTCOME_NORMALIZATION_VALUES: OutcomeNormalizationFlatValues =
  flattenNestedOutcomeNormalizationDefaults(OUTCOME_NORMALIZATION_DEFAULTS_NESTED);

export const OUTCOME_NORMALIZATION_KEY_ORDER: string[] = Object.keys(
  DEFAULT_OUTCOME_NORMALIZATION_VALUES,
);

export function normalizeOutcomeNormalizationValues(
  input?: Record<string, unknown> | null,
): OutcomeNormalizationFlatValues {
  const normalized: OutcomeNormalizationFlatValues = {};
  for (const key of OUTCOME_NORMALIZATION_KEY_ORDER) {
    const legacySurvivabilityKey = key.replace(
      "physicalSurvivability",
      "survivability",
    ).replace("mentalSurvivability", "survivability");
    normalized[key] = toNonNegativeNumber(
      input?.[key] ?? input?.[legacySurvivabilityKey],
      DEFAULT_OUTCOME_NORMALIZATION_VALUES[key],
    );
  }
  return normalized;
}

export function getOutcomeNormalizationValue(
  values: OutcomeNormalizationFlatValues,
  key: string,
  fallback = 0,
): number {
  const value = values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function curveFromValues(
  values: OutcomeNormalizationFlatValues,
  axis: ScoringCurveAxis,
): LevelCurvePoint[] {
  const curve = calculatorConfig.scoringCurves[axis].map((point) => ({
    level: point.level,
    min: getOutcomeNormalizationValue(
      values,
      `scoringCurves.${axis}.${point.level}.min`,
      point.min,
    ),
    max: getOutcomeNormalizationValue(
      values,
      `scoringCurves.${axis}.${point.level}.max`,
      point.max,
    ),
  }));

  return enforceMonotonicCurveBounds(curve);
}

function enforceMonotonicCurveBounds(curve: LevelCurvePoint[]): LevelCurvePoint[] {
  let runningMin = 0;
  let runningMax = 0;
  return curve.map((point, index) => {
    runningMin = index === 0 ? point.min : Math.max(runningMin, point.min);
    runningMax = index === 0 ? point.max : Math.max(runningMax, point.max, runningMin);
    return { ...point, min: runningMin, max: runningMax };
  });
}

export function outcomeNormalizationValuesToCalculatorConfig(
  input?: Record<string, unknown> | null,
): CalculatorConfig {
  const values = normalizeOutcomeNormalizationValues(input);

  return resolveCalculatorConfig({
    tierMultipliers: {
      MINION: values["tierMultipliers.MINION"],
      SOLDIER: values["tierMultipliers.SOLDIER"],
      ELITE: values["tierMultipliers.ELITE"],
      BOSS: values["tierMultipliers.BOSS"],
      LEGENDARY: values["tierMultipliers.LEGENDARY"],
    },
    baselineParty: {
      size: values["baselineParty.size"],
      focusedWPR: values["baselineParty.focusedWPR"],
      typicalWPR: values["baselineParty.typicalWPR"],
      aoeMultiplier: values["baselineParty.aoeMultiplier"],
      netSuccessMultiplier: values["baselineParty.netSuccessMultiplier"],
      combatHorizonRounds: values["baselineParty.combatHorizonRounds"],
    },
    manipulationTuning: {
      rangeCategoryMultiplier: {
        SELF: values["manipulationTuning.rangeCategoryMultiplier.SELF"],
        MELEE: values["manipulationTuning.rangeCategoryMultiplier.MELEE"],
        RANGED: values["manipulationTuning.rangeCategoryMultiplier.RANGED"],
        AOE: values["manipulationTuning.rangeCategoryMultiplier.AOE"],
      },
      rangedDistanceScalarPer30ft: values["manipulationTuning.rangedDistanceScalarPer30ft"],
      aoeCastRangeScalarPer30ft: values["manipulationTuning.aoeCastRangeScalarPer30ft"],
      maxDistanceScalarBonus: values["manipulationTuning.maxDistanceScalarBonus"],
      meleeTargetExponent: values["manipulationTuning.meleeTargetExponent"],
      rangedTargetExponent: values["manipulationTuning.rangedTargetExponent"],
      aoeGridSquareFeet: values["manipulationTuning.aoeGridSquareFeet"],
      aoeMaxExpectedTargets: values["manipulationTuning.aoeMaxExpectedTargets"],
      aoeCountExponent: values["manipulationTuning.aoeCountExponent"],
      sphereRadiusScalarPer10ft: values["manipulationTuning.sphereRadiusScalarPer10ft"],
      coneLengthScalarPer30ft: values["manipulationTuning.coneLengthScalarPer30ft"],
      lineLengthScalarPer30ft: values["manipulationTuning.lineLengthScalarPer30ft"],
      lineWidthScalarPer5ft: values["manipulationTuning.lineWidthScalarPer5ft"],
      maxGeometryScalarBonus: values["manipulationTuning.maxGeometryScalarBonus"],
    },
    seuFallbacks: {
      augmentSeuPerSuccess: values["seuFallbacks.augmentSeuPerSuccess"],
      augmentSeuPerStack: values["seuFallbacks.augmentSeuPerStack"],
      debuffSeuPerSuccess: values["seuFallbacks.debuffSeuPerSuccess"],
      debuffSeuPerStack: values["seuFallbacks.debuffSeuPerStack"],
      cleanseSeuPerSuccess: values["seuFallbacks.cleanseSeuPerSuccess"],
      cleanseSeuPerStack: values["seuFallbacks.cleanseSeuPerStack"],
    },
    naturalAttackTuning: {
      damageOutputWeight: values["naturalAttackTuning.damageOutputWeight"],
      greaterSuccessEffectWeight: values["naturalAttackTuning.greaterSuccessEffectWeight"],
      rangeEffectWeight: values["naturalAttackTuning.rangeEffectWeight"],
    },
    scoringCurves: {
      physicalThreat: curveFromValues(values, "physicalThreat"),
      mentalThreat: curveFromValues(values, "mentalThreat"),
      physicalSurvivability: curveFromValues(values, "physicalSurvivability"),
      mentalSurvivability: curveFromValues(values, "mentalSurvivability"),
      manipulation: curveFromValues(values, "manipulation"),
      synergy: curveFromValues(values, "synergy"),
      mobility: curveFromValues(values, "mobility"),
      presence: curveFromValues(values, "presence"),
    },
  });
}
