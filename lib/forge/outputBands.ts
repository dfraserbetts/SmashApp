import type {
  ForgeAttributePricingOutput,
  ForgeAttackProfileOutput,
  ForgeOutputProfile,
} from "./outputProfile";
import type { WeaponSize } from "./types";

export type ForgeOutputBandClassification =
  | "below"
  | "low"
  | "standard"
  | "high"
  | "extreme"
  | "over-band";

export type ForgeBandMetric = "weaponWoundsPerSuccess" | "ppv" | "mpv";

export type ForgeBandThresholds = {
  level: number;
  lowMax: number;
  standardMax: number;
  highMax: number;
  extremeMin: number;
  overBandMin: number;
};

export type ForgeRangedDistancePressure = {
  distanceFeet: number;
  tier: "none" | "watch" | "moderate" | "heavy";
  score: number;
  ratio: number;
  note: string;
};

export type ForgeWeaponProfileBandComparison = {
  profileKind: ForgeAttackProfileOutput["profileKind"];
  enabled: boolean;
  bandSize: WeaponSize;
  bandSizeSource: "item_size" | "default_one_handed";
  rangeCategory: ForgeAttackProfileOutput["rangeCategory"];
  totalWoundsPerSuccess: number;
  perTargetWounds: number;
  targetCount: number;
  totalPressure: number;
  damageTypeCount: number;
  damageTypeNames: string[];
  hasAoe: boolean;
  rangedDistanceFeet: number | null;
  rangedDistancePressure: ForgeRangedDistancePressure | null;
  aoe: ForgeAttackProfileOutput["aoe"];
  profileRangeMode: "MELEE" | "RANGED" | "AOE";
  rangeModeCoreMultiplier: number;
  rangeModeAdjustedExpectedValue: number;
  perTargetClassification: ForgeOutputBandClassification;
  totalPressureClassification: ForgeOutputBandClassification;
  classification: ForgeOutputBandClassification;
  greaterSuccessEffectCount: number;
  thresholds: ForgeBandThresholds;
  debugNotes: string[];
};

export type ForgeDefensiveBandComparison = {
  ppv: {
    value: number;
    classification: ForgeOutputBandClassification;
    thresholds: ForgeBandThresholds;
  };
  mpv: {
    value: number;
    classification: ForgeOutputBandClassification;
    thresholds: ForgeBandThresholds;
  };
  debugNote: "package/per-piece context deferred";
};

export type ForgeShieldSplitWarningLevel = "none" | "watch" | "likelyOverloaded";

export type ForgeShieldBandComparison = {
  hasAttackAndDefence: boolean;
  shieldSplitWarningLevel: ForgeShieldSplitWarningLevel;
  notes: string[];
};

export type ForgeLaneStatus = "narrow" | "moderate" | "broad" | "heavy" | "likely overloaded";
export type ForgeRarityRole =
  | "Common should usually be narrow"
  | "Uncommon may have modest breadth"
  | "Rare may have meaningful breadth, riders, or alternate profiles"
  | "Legendary/Mythic may have broad tactical features";

export type ForgeOutputLaneSummary = {
  status: ForgeLaneStatus;
  mainDrivers: string[];
  warnings: string[];
};

export type ForgeFeatureWeightDriver = {
  label: string;
  source: string;
  weight: number;
  fallbackUsed: boolean;
  note?: string;
};

export type ForgeMissingFeatureWeightDriver = {
  label: string;
  source: string;
  note: string;
};

export type ForgeRarityPressureSummary = {
  expectedRarityRole: ForgeRarityRole;
  notes: string[];
};

export type ForgeOutputLaneComparison = {
  coreFunctionality: ForgeOutputLaneSummary;
  featuresVersatility: ForgeOutputLaneSummary;
  rarityPressure: ForgeRarityPressureSummary;
  debug: {
    source: "forge_output_lanes_v1";
    reportOnly: true;
    coreActualValue: number;
    coreExpectedValue: number;
    corePressureRatio: number;
    coreExpectationSource: "forge_expectation_config" | "default";
    secondaryProfileCoreContribution: number;
    secondaryProfileCoreDrivers: string[];
    secondaryProfileCoreMultiplier: number;
    rangePressureScore: number;
    rangePressureDrivers: string[];
    featureWeightTotal: number;
    featureWeightTotalRaw: number;
    featureWeightTotalClamped: number;
    expectedFeatureBudget: number;
    featurePressureRatio: number;
    featureStatusSource: "forge_values_weighted";
    featureBudgetSource: "forge_expectation_config" | "default";
    featureWeightDrivers: ForgeFeatureWeightDriver[];
    missingFeatureWeightDrivers: ForgeMissingFeatureWeightDriver[];
    costSource: "forge_values" | "fallback";
    fallbackUsed: boolean;
    expectationFallbackUsed: boolean;
  };
};

export type ForgeOutputBandComparisonCore = {
  common: ForgeOutputProfile["common"];
  weaponProfiles: ForgeWeaponProfileBandComparison[];
  defensive: ForgeDefensiveBandComparison;
  shield: ForgeShieldBandComparison;
  debug: {
    source: "forge_output_bands_v1";
    bandSet: "natural_baseline_v1";
    reportOnly: true;
    noSaveBlocking: true;
    notes: string[];
  };
};

export type ForgeOutputBandComparison = ForgeOutputBandComparisonCore & {
  lanes: ForgeOutputLaneComparison;
};

type SourceBandRow = {
  level: number;
  lowMax: number;
  standardMax: number;
  highMax: number;
  extremeMin: number;
};

export type ForgeFeatureWeightCostRow = {
  category?: string | null;
  selector1?: string | null;
  selector2?: string | null;
  selector3?: string | number | null;
  value?: number | null;
  notes?: string | null;
};

export type ForgeExpectationConfigRow = {
  category?: string | null;
  selector1?: string | null;
  selector2?: string | null;
  value?: number | null;
};

export type ForgeFeatureWeightContext = {
  costs: ForgeFeatureWeightCostRow[];
  config: ForgeExpectationConfigRow[];
  fallbackWeight: number;
};

type ForgeExpectationValue = {
  value: number;
  source: "forge_expectation_config" | "default";
};

type ForgeExpectationContextDebug = {
  fallbackUsed: boolean;
};

type ForgeFeatureStatusThresholds = {
  moderate: ForgeExpectationValue;
  broad: ForgeExpectationValue;
  heavy: ForgeExpectationValue;
};

type CorePressureCandidate = {
  actual: number;
  expected: number;
  ratio: number;
  source: "forge_expectation_config" | "default";
  label: string;
};

type FeatureWeightState = {
  totalRaw: number;
  drivers: ForgeFeatureWeightDriver[];
  missing: ForgeMissingFeatureWeightDriver[];
  fallbackUsed: boolean;
  hasForgeValues: boolean;
};

// First-pass diagnostic constants copied from docs/07 and docs/08.
// These are output-band readout helpers, not final tuning law or save validation.
const WEAPON_WOUNDS_PER_SUCCESS_BANDS_BY_SIZE: Record<WeaponSize, SourceBandRow[]> = {
  SMALL: [
    { level: 1, lowMax: 0, standardMax: 2, highMax: 4, extremeMin: 6 },
    { level: 2, lowMax: 0, standardMax: 2, highMax: 4, extremeMin: 6 },
    { level: 3, lowMax: 2, standardMax: 4, highMax: 4, extremeMin: 8 },
    { level: 4, lowMax: 2, standardMax: 4, highMax: 6, extremeMin: 8 },
    { level: 5, lowMax: 2, standardMax: 4, highMax: 8, extremeMin: 8 },
    { level: 6, lowMax: 2, standardMax: 4, highMax: 8, extremeMin: 10 },
    { level: 7, lowMax: 2, standardMax: 6, highMax: 8, extremeMin: 12 },
    { level: 8, lowMax: 4, standardMax: 6, highMax: 10, extremeMin: 14 },
    { level: 9, lowMax: 4, standardMax: 8, highMax: 10, extremeMin: 14 },
    { level: 10, lowMax: 4, standardMax: 8, highMax: 10, extremeMin: 16 },
    { level: 11, lowMax: 4, standardMax: 8, highMax: 12, extremeMin: 16 },
    { level: 12, lowMax: 4, standardMax: 8, highMax: 14, extremeMin: 18 },
    { level: 13, lowMax: 4, standardMax: 10, highMax: 14, extremeMin: 20 },
    { level: 14, lowMax: 6, standardMax: 10, highMax: 14, extremeMin: 20 },
    { level: 15, lowMax: 6, standardMax: 10, highMax: 16, extremeMin: 22 },
    { level: 16, lowMax: 6, standardMax: 10, highMax: 18, extremeMin: 22 },
    { level: 17, lowMax: 8, standardMax: 12, highMax: 18, extremeMin: 24 },
    { level: 18, lowMax: 8, standardMax: 12, highMax: 18, extremeMin: 26 },
    { level: 19, lowMax: 8, standardMax: 14, highMax: 20, extremeMin: 26 },
    { level: 20, lowMax: 8, standardMax: 14, highMax: 20, extremeMin: 28 },
  ],
  ONE_HANDED: [
  { level: 1, lowMax: 2, standardMax: 4, highMax: 6, extremeMin: 8 },
  { level: 2, lowMax: 2, standardMax: 4, highMax: 8, extremeMin: 10 },
  { level: 3, lowMax: 2, standardMax: 6, highMax: 8, extremeMin: 12 },
  { level: 4, lowMax: 4, standardMax: 6, highMax: 10, extremeMin: 14 },
  { level: 5, lowMax: 4, standardMax: 8, highMax: 12, extremeMin: 14 },
  { level: 6, lowMax: 4, standardMax: 8, highMax: 12, extremeMin: 18 },
  { level: 7, lowMax: 4, standardMax: 10, highMax: 14, extremeMin: 20 },
  { level: 8, lowMax: 6, standardMax: 10, highMax: 16, extremeMin: 22 },
  { level: 9, lowMax: 6, standardMax: 12, highMax: 18, extremeMin: 24 },
  { level: 10, lowMax: 6, standardMax: 12, highMax: 18, extremeMin: 26 },
  { level: 11, lowMax: 8, standardMax: 14, highMax: 20, extremeMin: 28 },
  { level: 12, lowMax: 8, standardMax: 14, highMax: 22, extremeMin: 30 },
  { level: 13, lowMax: 8, standardMax: 16, highMax: 24, extremeMin: 32 },
  { level: 14, lowMax: 10, standardMax: 16, highMax: 24, extremeMin: 34 },
  { level: 15, lowMax: 10, standardMax: 18, highMax: 26, extremeMin: 36 },
  { level: 16, lowMax: 10, standardMax: 18, highMax: 28, extremeMin: 38 },
  { level: 17, lowMax: 12, standardMax: 20, highMax: 30, extremeMin: 40 },
  { level: 18, lowMax: 12, standardMax: 20, highMax: 30, extremeMin: 42 },
  { level: 19, lowMax: 12, standardMax: 22, highMax: 32, extremeMin: 44 },
  { level: 20, lowMax: 14, standardMax: 22, highMax: 34, extremeMin: 46 },
  ],
  TWO_HANDED: [
    { level: 1, lowMax: 4, standardMax: 6, highMax: 8, extremeMin: 10 },
    { level: 2, lowMax: 4, standardMax: 6, highMax: 10, extremeMin: 14 },
    { level: 3, lowMax: 4, standardMax: 8, highMax: 10, extremeMin: 16 },
    { level: 4, lowMax: 6, standardMax: 8, highMax: 14, extremeMin: 18 },
    { level: 5, lowMax: 6, standardMax: 10, highMax: 16, extremeMin: 18 },
    { level: 6, lowMax: 6, standardMax: 10, highMax: 16, extremeMin: 24 },
    { level: 7, lowMax: 6, standardMax: 14, highMax: 18, extremeMin: 26 },
    { level: 8, lowMax: 8, standardMax: 14, highMax: 20, extremeMin: 28 },
    { level: 9, lowMax: 8, standardMax: 16, highMax: 24, extremeMin: 32 },
    { level: 10, lowMax: 8, standardMax: 16, highMax: 24, extremeMin: 34 },
    { level: 11, lowMax: 10, standardMax: 18, highMax: 26, extremeMin: 36 },
    { level: 12, lowMax: 10, standardMax: 18, highMax: 28, extremeMin: 40 },
    { level: 13, lowMax: 10, standardMax: 20, highMax: 32, extremeMin: 42 },
    { level: 14, lowMax: 14, standardMax: 20, highMax: 32, extremeMin: 44 },
    { level: 15, lowMax: 14, standardMax: 24, highMax: 34, extremeMin: 46 },
    { level: 16, lowMax: 14, standardMax: 24, highMax: 36, extremeMin: 50 },
    { level: 17, lowMax: 16, standardMax: 26, highMax: 40, extremeMin: 52 },
    { level: 18, lowMax: 16, standardMax: 26, highMax: 40, extremeMin: 54 },
    { level: 19, lowMax: 16, standardMax: 28, highMax: 42, extremeMin: 58 },
    { level: 20, lowMax: 18, standardMax: 28, highMax: 44, extremeMin: 60 },
  ],
};

const PPV_BANDS: SourceBandRow[] = [
  { level: 1, lowMax: 2, standardMax: 4, highMax: 6, extremeMin: 8 },
  { level: 2, lowMax: 2, standardMax: 4, highMax: 8, extremeMin: 10 },
  { level: 3, lowMax: 2, standardMax: 6, highMax: 10, extremeMin: 12 },
  { level: 4, lowMax: 4, standardMax: 8, highMax: 12, extremeMin: 14 },
  { level: 5, lowMax: 4, standardMax: 10, highMax: 16, extremeMin: 18 },
  { level: 6, lowMax: 4, standardMax: 10, highMax: 16, extremeMin: 20 },
  { level: 7, lowMax: 6, standardMax: 12, highMax: 18, extremeMin: 22 },
  { level: 8, lowMax: 6, standardMax: 12, highMax: 20, extremeMin: 24 },
  { level: 9, lowMax: 6, standardMax: 14, highMax: 22, extremeMin: 26 },
  { level: 10, lowMax: 8, standardMax: 14, highMax: 24, extremeMin: 28 },
  { level: 11, lowMax: 8, standardMax: 16, highMax: 26, extremeMin: 30 },
  { level: 12, lowMax: 8, standardMax: 16, highMax: 28, extremeMin: 32 },
  { level: 13, lowMax: 10, standardMax: 18, highMax: 30, extremeMin: 34 },
  { level: 14, lowMax: 10, standardMax: 18, highMax: 32, extremeMin: 36 },
  { level: 15, lowMax: 10, standardMax: 20, highMax: 34, extremeMin: 38 },
  { level: 16, lowMax: 12, standardMax: 20, highMax: 36, extremeMin: 40 },
  { level: 17, lowMax: 12, standardMax: 22, highMax: 38, extremeMin: 42 },
  { level: 18, lowMax: 12, standardMax: 22, highMax: 40, extremeMin: 44 },
  { level: 19, lowMax: 14, standardMax: 24, highMax: 42, extremeMin: 46 },
  { level: 20, lowMax: 14, standardMax: 24, highMax: 44, extremeMin: 48 },
];

const MPV_BANDS: SourceBandRow[] = [
  { level: 1, lowMax: 2, standardMax: 4, highMax: 6, extremeMin: 8 },
  { level: 2, lowMax: 2, standardMax: 4, highMax: 6, extremeMin: 8 },
  { level: 3, lowMax: 2, standardMax: 6, highMax: 8, extremeMin: 10 },
  { level: 4, lowMax: 4, standardMax: 6, highMax: 10, extremeMin: 12 },
  { level: 5, lowMax: 4, standardMax: 8, highMax: 12, extremeMin: 14 },
  { level: 6, lowMax: 4, standardMax: 8, highMax: 12, extremeMin: 16 },
  { level: 7, lowMax: 4, standardMax: 10, highMax: 14, extremeMin: 18 },
  { level: 8, lowMax: 6, standardMax: 10, highMax: 16, extremeMin: 20 },
  { level: 9, lowMax: 6, standardMax: 12, highMax: 18, extremeMin: 22 },
  { level: 10, lowMax: 6, standardMax: 12, highMax: 20, extremeMin: 24 },
  { level: 11, lowMax: 8, standardMax: 14, highMax: 22, extremeMin: 26 },
  { level: 12, lowMax: 8, standardMax: 14, highMax: 24, extremeMin: 28 },
  { level: 13, lowMax: 8, standardMax: 16, highMax: 26, extremeMin: 30 },
  { level: 14, lowMax: 10, standardMax: 16, highMax: 28, extremeMin: 32 },
  { level: 15, lowMax: 10, standardMax: 18, highMax: 30, extremeMin: 34 },
  { level: 16, lowMax: 10, standardMax: 18, highMax: 32, extremeMin: 36 },
  { level: 17, lowMax: 12, standardMax: 20, highMax: 34, extremeMin: 38 },
  { level: 18, lowMax: 12, standardMax: 20, highMax: 36, extremeMin: 40 },
  { level: 19, lowMax: 12, standardMax: 22, highMax: 38, extremeMin: 42 },
  { level: 20, lowMax: 14, standardMax: 22, highMax: 40, extremeMin: 44 },
];

const CLASSIFICATION_RANK: Record<ForgeOutputBandClassification, number> = {
  below: 0,
  low: 1,
  standard: 2,
  high: 3,
  extreme: 4,
  "over-band": 5,
};

const DEFAULT_FEATURE_FALLBACK_WEIGHT = 1;
const SECONDARY_PROFILE_CORE_MULTIPLIER = 0.35;
const RANGED_DISTANCE_CORE_SCORE_MULTIPLIER = 0.25;
const RANGED_PROFILE_CORE_MULTIPLIER_KEY = "core.weapon.rangeMode.RANGED.multiplier";
const DEFAULT_RANGED_PROFILE_CORE_MULTIPLIER = 0.8;

const FEATURE_WEIGHT_EXPECTATION_KEYS = {
  extraProfile: "features.weight.extraProfile",
  mixedAccessMeleeRanged: "features.weight.mixedAccess.meleeRanged",
  mixedAccessMeleeAoe: "features.weight.mixedAccess.meleeAoe",
  mixedAccessRangedAoe: "features.weight.mixedAccess.rangedAoe",
  mixedAccessAllThree: "features.weight.mixedAccess.allThree",
  targetCountExtraTarget: "features.weight.targetCount.extraTarget",
  damageTypeExtraType: "features.weight.damageType.extraType",
  rangedDistance31To60: "features.weight.rangedDistance.31to60",
  rangedDistance61To120: "features.weight.rangedDistance.61to120",
  rangedDistance121Plus: "features.weight.rangedDistance.121plus",
  aoeAccess: "features.weight.aoe.access",
  aoeExtraCount: "features.weight.aoe.extraCount",
  aoeCenterRange: "features.weight.aoe.centerRange",
  aoeGeometry: "features.weight.aoe.geometry",
  shieldSplitAttackDefence: "features.weight.shieldSplit.attackDefence",
} as const;

const LANE_STATUS_RANK: Record<ForgeLaneStatus, number> = {
  narrow: 0,
  moderate: 1,
  broad: 2,
  heavy: 3,
  "likely overloaded": 4,
};

function normalizeLevel(level: number | null): number {
  if (typeof level !== "number" || !Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(20, Math.round(level)));
}

function normalizeCostKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function toFiniteCost(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function buildForgeFeatureWeightContext(
  costs: ForgeFeatureWeightCostRow[] | null | undefined,
  fallbackWeight = DEFAULT_FEATURE_FALLBACK_WEIGHT,
): ForgeFeatureWeightContext {
  return buildForgeExpectationContext(costs, undefined, fallbackWeight);
}

export function buildForgeExpectationContext(
  costs: ForgeFeatureWeightCostRow[] | null | undefined,
  config?: ForgeExpectationConfigRow[] | null,
  fallbackWeight = DEFAULT_FEATURE_FALLBACK_WEIGHT,
): ForgeFeatureWeightContext {
  return {
    costs: costs ?? [],
    config: config ?? [],
    fallbackWeight,
  };
}

function findFeatureWeight(
  context: ForgeFeatureWeightContext | null | undefined,
  category: string,
  selector1?: string | null,
  selector2?: string | null,
  selector3?: string | number | null,
): number | null {
  if (!context) return null;
  const categoryKey = normalizeCostKey(category);
  const s1Key = normalizeCostKey(selector1);
  const s2Key = normalizeCostKey(selector2);
  const s3Key = selector3 === undefined ? "" : normalizeCostKey(selector3);

  const found = context.costs.find((row) => {
    if (normalizeCostKey(row.category) !== categoryKey) return false;
    if (selector1 !== undefined && normalizeCostKey(row.selector1) !== s1Key) return false;
    if (selector2 !== undefined && normalizeCostKey(row.selector2) !== s2Key) return false;
    if (selector3 !== undefined && normalizeCostKey(row.selector3) !== s3Key) return false;
    return true;
  });

  return toFiniteCost(found?.value);
}

function findExpectationCost(
  context: ForgeFeatureWeightContext | null | undefined,
  key: string,
): number | null {
  if (!context) return null;
  const keyValue = normalizeCostKey(key);
  const found = context.costs.find((row) => {
    if (normalizeCostKey(row.category) !== "itemmodifiers") return false;
    const selector1 = normalizeCostKey(row.selector1);
    const selector2 = normalizeCostKey(row.selector2);
    const selector3 = normalizeCostKey(row.selector3);
    return (
      (selector1 === "forgeoutputexpectation" && selector2 === keyValue) ||
      selector1 === `forgeoutputexpectation.${keyValue}` ||
      selector1 === keyValue ||
      selector2 === keyValue ||
      selector3 === keyValue
    );
  });

  return toFiniteCost(found?.value);
}

function findExpectationConfig(
  context: ForgeFeatureWeightContext | null | undefined,
  category: string,
  selector1: string,
  selector2?: string | null,
): number | null {
  if (!context) return null;
  const categoryKey = normalizeCostKey(category);
  const selector1Key = normalizeCostKey(selector1);
  const selector2Key = selector2 === undefined ? "" : normalizeCostKey(selector2);
  const found = context.config.find((row) => {
    if (normalizeCostKey(row.category) !== categoryKey) return false;
    if (normalizeCostKey(row.selector1) !== selector1Key) return false;
    if (selector2 !== undefined && normalizeCostKey(row.selector2) !== selector2Key) return false;
    return true;
  });

  return toFiniteCost(found?.value);
}

function getExpectationValue(
  context: ForgeFeatureWeightContext | null | undefined,
  debug: ForgeExpectationContextDebug,
  key: string,
  fallback: number,
  configLookups: Array<{ category: string; selector1: string; selector2?: string | null }> = [],
): ForgeExpectationValue {
  const costValue = findExpectationCost(context, key);
  if (costValue !== null && costValue > 0) {
    return { value: costValue, source: "forge_expectation_config" };
  }

  for (const lookup of configLookups) {
    const configValue = findExpectationConfig(context, lookup.category, lookup.selector1, lookup.selector2);
    if (configValue !== null && configValue > 0) {
      return { value: configValue, source: "forge_expectation_config" };
    }
  }

  debug.fallbackUsed = true;
  return { value: fallback, source: "default" };
}

function getItemTypeLabel(profile: ForgeOutputProfile): "Weapon" | "Armor" | "Shield" | "Item" {
  const normalized = String(profile.common.type ?? "").trim().toUpperCase();
  if (normalized === "ARMOR") return "Armor";
  if (normalized === "SHIELD") return "Shield";
  if (normalized === "ITEM" || normalized === "CONSUMABLE") return "Item";
  return "Weapon";
}

function formatRangeLabel(rangeCategory: string): "Melee" | "Ranged" | "AoE" {
  const normalized = String(rangeCategory ?? "").trim().toUpperCase();
  if (normalized === "RANGED") return "Ranged";
  if (normalized === "AOE") return "AoE";
  return "Melee";
}

function formatEnabledRangeLabels(profile: ForgeOutputProfile): Set<"Melee" | "Ranged" | "AoE"> {
  return new Set(profile.attackAccess.enabledRangeCategories.map((entry) => formatRangeLabel(entry)));
}

function getRangedDistancePressure(distanceFeet: number | null): ForgeRangedDistancePressure | null {
  if (!distanceFeet || distanceFeet <= 0) return null;
  if (distanceFeet <= 30) {
    return {
      distanceFeet,
      tier: "none",
      score: 0,
      ratio: 0,
      note: `${distanceFeet} ft ranged distance is baseline reach`,
    };
  }
  if (distanceFeet <= 60) {
    return {
      distanceFeet,
      tier: "watch",
      score: 1,
      ratio: 0.1,
      note: `${distanceFeet} ft ranged distance adds watch-level reach pressure`,
    };
  }
  if (distanceFeet <= 120) {
    return {
      distanceFeet,
      tier: "moderate",
      score: 2,
      ratio: 0.2,
      note: `${distanceFeet} ft ranged distance adds moderate reach pressure`,
    };
  }
  return {
    distanceFeet,
    tier: "heavy",
    score: 3,
    ratio: 0.3,
    note: `${distanceFeet} ft ranged distance adds heavy reach pressure`,
  };
}

function parseMagnitudeLabel(label: string): { baseName: string; magnitude: number | null } {
  const match = label.trim().match(/^(.*\D)\s+(-?\d+)$/);
  if (!match) return { baseName: label.trim(), magnitude: null };
  return { baseName: match[1].trim(), magnitude: Number(match[2]) };
}

function parseGlobalAttributeSummary(label: string): { attribute: string; magnitude: number | null } {
  const match = label.trim().match(/^(.*?)\s+([+-]?\d+)$/);
  if (!match) return { attribute: label.trim(), magnitude: null };
  return { attribute: match[1].trim(), magnitude: Math.abs(Number(match[2])) };
}

function withOverBand(row: SourceBandRow): ForgeBandThresholds {
  const overBandOffset = Math.max(4, Math.ceil(row.extremeMin * 0.25));
  return {
    ...row,
    overBandMin: row.extremeMin + overBandOffset,
  };
}

function scaledBand(row: ForgeBandThresholds, multiplier: number): ForgeBandThresholds {
  if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier === 1) return row;
  return {
    level: row.level,
    lowMax: Math.max(0, Math.round(row.lowMax * multiplier)),
    standardMax: Math.max(0, Math.round(row.standardMax * multiplier)),
    highMax: Math.max(0, Math.round(row.highMax * multiplier)),
    extremeMin: Math.max(0, Math.round(row.extremeMin * multiplier)),
    overBandMin: Math.max(0, Math.round(row.overBandMin * multiplier)),
  };
}

function resolveWeaponBandSize(size: WeaponSize | null): {
  bandSize: WeaponSize;
  bandSizeSource: "item_size" | "default_one_handed";
  debugNotes: string[];
} {
  if (size === "SMALL" || size === "ONE_HANDED" || size === "TWO_HANDED") {
    return { bandSize: size, bandSizeSource: "item_size", debugNotes: [] };
  }

  return {
    bandSize: "ONE_HANDED",
    bandSizeSource: "default_one_handed",
    debugNotes: ["missing size, defaulted to one-handed band"],
  };
}

function getWeaponBand(level: number | null, size: WeaponSize | null): {
  thresholds: ForgeBandThresholds;
  bandSize: WeaponSize;
  bandSizeSource: "item_size" | "default_one_handed";
  debugNotes: string[];
} {
  const normalizedLevel = normalizeLevel(level);
  const resolvedSize = resolveWeaponBandSize(size);
  const rows = WEAPON_WOUNDS_PER_SUCCESS_BANDS_BY_SIZE[resolvedSize.bandSize];
  const row = rows.find((entry) => entry.level === normalizedLevel) ?? rows[0];
  return {
    ...resolvedSize,
    thresholds: withOverBand(row),
  };
}

function getBand(metric: ForgeBandMetric, level: number | null): ForgeBandThresholds {
  const normalizedLevel = normalizeLevel(level);
  const rows =
    metric === "weaponWoundsPerSuccess"
      ? WEAPON_WOUNDS_PER_SUCCESS_BANDS_BY_SIZE.ONE_HANDED
      : metric === "ppv"
        ? PPV_BANDS
        : MPV_BANDS;
  const row = rows.find((entry) => entry.level === normalizedLevel) ?? rows[0];
  return withOverBand(row);
}

function getSizeExpectationLabel(size: WeaponSize): string {
  if (size === "SMALL") return "SMALL";
  if (size === "TWO_HANDED") return "TWO_HANDED";
  return "ONE_HANDED";
}

function getCoreMultiplier(
  context: ForgeFeatureWeightContext | null | undefined,
  debug: ForgeExpectationContextDebug,
  key: string,
  fallback: number,
  configLookups: Array<{ category: string; selector1: string; selector2?: string | null }> = [],
): ForgeExpectationValue {
  return getExpectationValue(context, debug, key, fallback, configLookups);
}

function classifyValue(value: number, thresholds: ForgeBandThresholds): ForgeOutputBandClassification {
  if (!Number.isFinite(value) || value <= 0) return "below";
  if (value >= thresholds.overBandMin) return "over-band";
  if (value >= thresholds.extremeMin) return "extreme";
  if (value <= thresholds.lowMax) return "low";
  if (value <= thresholds.standardMax) return "standard";
  if (value <= thresholds.highMax) return "high";
  return "extreme";
}

function maxClassification(
  classifications: ForgeOutputBandClassification[],
): ForgeOutputBandClassification {
  return classifications.reduce<ForgeOutputBandClassification>((highest, current) =>
    CLASSIFICATION_RANK[current] > CLASSIFICATION_RANK[highest] ? current : highest,
  "below");
}

function compareWeaponProfile(
  profile: ForgeAttackProfileOutput,
  weaponBand: {
    thresholds: ForgeBandThresholds;
    bandSize: WeaponSize;
    bandSizeSource: "item_size" | "default_one_handed";
    debugNotes: string[];
  },
  rangeModeMultiplier: ForgeExpectationValue,
): ForgeWeaponProfileBandComparison {
  const thresholds = scaledBand(weaponBand.thresholds, rangeModeMultiplier.value);
  const perTargetWounds = profile.totalWoundsPerSuccess;
  const totalPressure = profile.totalWoundsPerSuccess * profile.targetCount;
  const perTargetClassification = classifyValue(perTargetWounds, thresholds);
  const totalPressureClassification = classifyValue(totalPressure, thresholds);
  const classification = maxClassification([perTargetClassification, totalPressureClassification]);
  const debugNotes: string[] = [...weaponBand.debugNotes];
  const rangedDistancePressure =
    profile.profileKind === "ranged" ? getRangedDistancePressure(profile.rangedDistanceFeet) : null;

  if (profile.damageTypeCount > 1) {
    debugNotes.push("multiple simultaneous damage types consume core output budget");
  }
  if (profile.targetCount > 1) {
    debugNotes.push("multi-target pressure is reported separately from per-target wounds");
  }
  if (profile.aoe) {
    debugNotes.push("AoE geometry is feature/breadth pressure and remains report-only");
  }
  if (rangedDistancePressure) {
    debugNotes.push(rangedDistancePressure.note);
  }
  if (rangeModeMultiplier.value !== 1) {
    debugNotes.push(
      `range mode core multiplier ${rangeModeMultiplier.value} adjusted expected standard to ${thresholds.standardMax}`,
    );
  }

  return {
    profileKind: profile.profileKind,
    enabled: profile.enabled,
    bandSize: weaponBand.bandSize,
    bandSizeSource: weaponBand.bandSizeSource,
    rangeCategory: profile.rangeCategory,
    totalWoundsPerSuccess: profile.totalWoundsPerSuccess,
    perTargetWounds,
    targetCount: profile.targetCount,
    totalPressure,
    damageTypeCount: profile.damageTypeCount,
    damageTypeNames: profile.damageTypeNames,
    hasAoe: Boolean(profile.aoe),
    rangedDistanceFeet: profile.rangedDistanceFeet,
    rangedDistancePressure,
    aoe: profile.aoe,
    profileRangeMode: profile.rangeCategory,
    rangeModeCoreMultiplier: rangeModeMultiplier.value,
    rangeModeAdjustedExpectedValue: thresholds.standardMax,
    perTargetClassification,
    totalPressureClassification,
    classification,
    greaterSuccessEffectCount: profile.greaterSuccessEffectCount,
    thresholds,
    debugNotes,
  };
}

function resolveShieldWarning(
  profile: ForgeOutputProfile,
  weaponComparisons: ForgeWeaponProfileBandComparison[],
  ppvClassification: ForgeOutputBandClassification,
  mpvClassification: ForgeOutputBandClassification,
): ForgeShieldBandComparison {
  const hasAttackAndDefence = profile.shieldCoPresence.hasAttackAndDefence;
  const notes: string[] = [];

  if (!hasAttackAndDefence) {
    return { hasAttackAndDefence, shieldSplitWarningLevel: "none", notes };
  }

  const attackRank = Math.max(
    ...weaponComparisons
      .filter((entry) => entry.enabled)
      .map((entry) => CLASSIFICATION_RANK[entry.classification]),
    0,
  );
  const defenceRank = Math.max(CLASSIFICATION_RANK[ppvClassification], CLASSIFICATION_RANK[mpvClassification]);

  if (attackRank >= CLASSIFICATION_RANK.high && defenceRank >= CLASSIFICATION_RANK.high) {
    notes.push("shield combines high-or-better attack and defence output");
    return { hasAttackAndDefence, shieldSplitWarningLevel: "likelyOverloaded", notes };
  }

  if (attackRank >= CLASSIFICATION_RANK.standard && defenceRank >= CLASSIFICATION_RANK.standard) {
    notes.push("shield combines standard-or-better attack and defence output");
    return { hasAttackAndDefence, shieldSplitWarningLevel: "watch", notes };
  }

  notes.push("shield has both attack and defence output, but one side is modest");
  return { hasAttackAndDefence, shieldSplitWarningLevel: "watch", notes };
}

function getRarityRole(rarity: string | null): ForgeRarityRole {
  const normalized = String(rarity ?? "").trim().toUpperCase();
  if (normalized === "UNCOMMON") return "Uncommon may have modest breadth";
  if (normalized === "RARE") return "Rare may have meaningful breadth, riders, or alternate profiles";
  if (normalized === "LEGENDARY" || normalized === "MYTHIC") {
    return "Legendary/Mythic may have broad tactical features";
  }
  return "Common should usually be narrow";
}

function statusFromScore(score: number, overloaded: boolean): ForgeLaneStatus {
  if (overloaded) return "likely overloaded";
  if (score >= 6) return "heavy";
  if (score >= 4) return "broad";
  if (score >= 2) return "moderate";
  return "narrow";
}

function getFeatureWeightBudget(
  profile: ForgeOutputProfile,
  context: ForgeFeatureWeightContext | null | undefined,
  debug: ForgeExpectationContextDebug,
): ForgeExpectationValue {
  const level = normalizeLevel(profile.common.level);
  const rarity = String(profile.common.rarity ?? "").trim().toUpperCase();
  const baseFallback =
    rarity === "MYTHIC" ? 40 :
    rarity === "LEGENDARY" ? 30 :
    rarity === "RARE" ? 22 :
    rarity === "UNCOMMON" ? 14 :
    10;
  const base = getExpectationValue(
    context,
    debug,
    `features.budget.${rarity || "COMMON"}`,
    baseFallback,
    [{ category: "RARITY", selector1: "features.budget", selector2: rarity || "COMMON" }],
  );
  const perLevel = getExpectationValue(
    context,
    debug,
    "features.levelScale.perLevel",
    0,
    [{ category: "RARITY", selector1: "features.levelScale", selector2: "perLevel" }],
  );
  const perFiveLevels = getExpectationValue(
    context,
    debug,
    "features.levelScale.perFiveLevels",
    2,
    [{ category: "RARITY", selector1: "features.levelScale", selector2: "perFiveLevels" }],
  );
  const levelBump =
    perLevel.source === "forge_expectation_config" && perLevel.value > 0
      ? (level - 1) * perLevel.value
      : Math.floor((level - 1) / 5) * perFiveLevels.value;

  return {
    value: Math.max(1, base.value + levelBump),
    source:
      base.source === "forge_expectation_config" ||
      perLevel.source === "forge_expectation_config" ||
      perFiveLevels.source === "forge_expectation_config"
        ? "forge_expectation_config"
        : "default",
  };
}

function getFeatureStatusThresholds(
  context: ForgeFeatureWeightContext | null | undefined,
  debug: ForgeExpectationContextDebug,
): ForgeFeatureStatusThresholds {
  return {
    moderate: getExpectationValue(
      context,
      debug,
      "features.status.moderateRatio",
      0.36,
      [{ category: "RARITY", selector1: "features.status", selector2: "moderateRatio" }],
    ),
    broad: getExpectationValue(
      context,
      debug,
      "features.status.broadRatio",
      0.61,
      [{ category: "RARITY", selector1: "features.status", selector2: "broadRatio" }],
    ),
    heavy: getExpectationValue(
      context,
      debug,
      "features.status.heavyRatio",
      0.8,
      [{ category: "RARITY", selector1: "features.status", selector2: "heavyRatio" }],
    ),
  };
}

function statusFromFeatureWeightRatio(
  ratio: number,
  thresholds: ForgeFeatureStatusThresholds,
  overloaded: boolean,
): ForgeLaneStatus {
  if (overloaded) return "likely overloaded";
  if (ratio >= thresholds.heavy.value) return "heavy";
  if (ratio >= thresholds.broad.value) return "broad";
  if (ratio >= thresholds.moderate.value) return "moderate";
  return "narrow";
}

function coreStatusFloorForBand(classification: ForgeOutputBandClassification): ForgeLaneStatus {
  if (classification === "over-band") return "likely overloaded";
  if (classification === "extreme") return "heavy";
  if (classification === "high") return "broad";
  if (classification === "standard") return "moderate";
  return "narrow";
}

function maxLaneStatus(...statuses: ForgeLaneStatus[]): ForgeLaneStatus {
  return statuses.reduce<ForgeLaneStatus>((highest, current) =>
    LANE_STATUS_RANK[current] > LANE_STATUS_RANK[highest] ? current : highest,
  "narrow");
}

function isHighOrMore(classification: ForgeOutputBandClassification): boolean {
  return CLASSIFICATION_RANK[classification] >= CLASSIFICATION_RANK.high;
}

function isExtremeOrMore(classification: ForgeOutputBandClassification): boolean {
  return CLASSIFICATION_RANK[classification] >= CLASSIFICATION_RANK.extreme;
}

function isStandardOrMore(classification: ForgeOutputBandClassification): boolean {
  return CLASSIFICATION_RANK[classification] >= CLASSIFICATION_RANK.standard;
}

function getCorePressureCandidate(
  label: string,
  actual: number,
  expected: number,
  source: "forge_expectation_config" | "default",
): CorePressureCandidate {
  const safeExpected = expected > 0 ? expected : 1;
  return {
    label,
    actual,
    expected: safeExpected,
    ratio: actual / safeExpected,
    source,
  };
}

function getHighestCorePressureCandidate(candidates: CorePressureCandidate[]): CorePressureCandidate {
  return candidates.reduce<CorePressureCandidate>(
    (highest, current) => (current.ratio > highest.ratio ? current : highest),
    getCorePressureCandidate("no core output", 0, 1, "default"),
  );
}

function formatPressureValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function coreStatusFromPressureRatio(ratio: number): ForgeLaneStatus {
  if (ratio >= 1.5) return "heavy";
  if (ratio >= 0.85) return "broad";
  if (ratio >= 0.5) return "moderate";
  return "narrow";
}

function createFeatureWeightState(context: ForgeFeatureWeightContext | null | undefined): FeatureWeightState {
  return {
    totalRaw: 0,
    drivers: [],
    missing: [],
    fallbackUsed: false,
    hasForgeValues: Boolean(context && context.costs.length > 0),
  };
}

function addFeatureWeight(
  state: FeatureWeightState,
  context: ForgeFeatureWeightContext | null | undefined,
  label: string,
  source: string,
  lookups: Array<{
    category: string;
    selector1?: string | null;
    selector2?: string | null;
    selector3?: string | number | null;
    multiplier?: number;
  }>,
  fallbackNote: string,
): void {
  for (const lookup of lookups) {
    const weight = findFeatureWeight(
      context,
      lookup.category,
      lookup.selector1,
      lookup.selector2,
      lookup.selector3,
    );
    if (weight !== null) {
      const multiplier = getPositiveMultiplier(lookup.multiplier);
      const weightedValue = weight * multiplier;
      state.totalRaw += weightedValue;
      state.drivers.push({
        label,
        source: `${lookup.category}/${[lookup.selector1, lookup.selector2, lookup.selector3]
          .filter((entry) => entry !== undefined && entry !== null && String(entry).trim())
          .join("/")}`,
        weight: weightedValue,
        fallbackUsed: false,
        note:
          weight < 0
            ? "Negative Forge-Values contribution reduces feature pressure"
            : multiplier > 1
              ? `${weight} x ${multiplier}`
              : undefined,
      });
      return;
    }
  }

  const fallbackWeight = context?.fallbackWeight ?? DEFAULT_FEATURE_FALLBACK_WEIGHT;
  state.totalRaw += fallbackWeight;
  state.fallbackUsed = true;
  state.drivers.push({
    label,
    source,
    weight: fallbackWeight,
    fallbackUsed: true,
    note: fallbackNote,
  });
  state.missing.push({
    label,
    source,
    note: "No matching Forge-Values cost row found; fallback diagnostic weight used",
  });
}

function getPositiveMultiplier(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(1, value);
}

function forgeOutputExpectationLookup(
  key: string,
  multiplier?: number,
): {
  category: string;
  selector1: string;
  selector2: string;
  multiplier?: number;
} {
  return {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: key,
    multiplier,
  };
}

function getRangedDistanceFeatureExpectationKey(distanceFeet: number): string | null {
  if (distanceFeet <= 30) return null;
  if (distanceFeet <= 60) return FEATURE_WEIGHT_EXPECTATION_KEYS.rangedDistance31To60;
  if (distanceFeet <= 120) return FEATURE_WEIGHT_EXPECTATION_KEYS.rangedDistance61To120;
  return FEATURE_WEIGHT_EXPECTATION_KEYS.rangedDistance121Plus;
}

function getAoeCenterRangeMultiplier(distanceFeet: number): number {
  if (distanceFeet <= 30) return 1;
  if (distanceFeet <= 60) return 2;
  if (distanceFeet <= 120) return 3;
  return 5;
}

function getAoeShapeGeometryMultiplier(shape: string | null | undefined): number {
  if (shape === "CONE" || shape === "LINE") return 2;
  return 1;
}

function getAoeDimensionMultiplier(kind: "sphereRadius" | "coneLength" | "lineWidth" | "lineLength", value: number): number {
  if (kind === "sphereRadius") {
    if (value <= 10) return 1;
    if (value <= 20) return 2;
    return 3;
  }
  if (kind === "coneLength") {
    if (value <= 15) return 1;
    if (value <= 30) return 2;
    return 3;
  }
  if (kind === "lineWidth") {
    if (value <= 5) return 1;
    if (value <= 10) return 2;
    return 3;
  }
  if (value <= 30) return 1;
  if (value <= 60) return 2;
  return 3;
}

function addAttributeFeatureWeight(
  state: FeatureWeightState,
  context: ForgeFeatureWeightContext | null | undefined,
  detail: ForgeAttributePricingOutput,
  labelPrefix: string,
  source: string,
  lookups: Array<{
    category: string;
    selector1?: string | null;
    selector2?: string | null;
    selector3?: string | number | null;
  }>,
  fallbackNote: string,
): void {
  if (detail.pricingWeight !== null) {
    state.totalRaw += detail.pricingWeight;
    state.drivers.push({
      label: `${labelPrefix}: ${detail.name}`,
      source: `attribute_scalar/${detail.pricingMode ?? "UNKNOWN"}`,
      weight: detail.pricingWeight,
      fallbackUsed: false,
      note:
        detail.pricingScalar !== null && detail.pricingMagnitude !== null
          ? `${detail.pricingScalar} x ${detail.pricingMagnitude}${
              detail.pricingWeight < 0 ? "; negative contribution reduces feature pressure" : ""
            }`
          : undefined,
    });
    return;
  }

  addFeatureWeight(
    state,
    context,
    `${labelPrefix}: ${detail.name}`,
    source,
    lookups,
    fallbackNote,
  );
}

function collectFeatureWeights(
  profile: ForgeOutputProfile,
  enabledWeaponProfiles: ForgeWeaponProfileBandComparison[],
  context: ForgeFeatureWeightContext | null | undefined,
): FeatureWeightState {
  const state = createFeatureWeightState(context);
  const itemTypeLabel = getItemTypeLabel(profile);

  const primaryProfileKind = enabledWeaponProfiles[0]?.profileKind ?? null;
  for (const weaponProfile of enabledWeaponProfiles) {
    const rangeLabel = formatRangeLabel(weaponProfile.rangeCategory);
    if (primaryProfileKind && weaponProfile.profileKind !== primaryProfileKind) {
      addFeatureWeight(
        state,
        context,
        `${rangeLabel} attack access (${enabledWeaponProfiles.length} attack profiles)`,
        "extra_profile",
        [
          forgeOutputExpectationLookup(
            rangeLabel === "AoE"
              ? FEATURE_WEIGHT_EXPECTATION_KEYS.aoeAccess
              : FEATURE_WEIGHT_EXPECTATION_KEYS.extraProfile,
          ),
          { category: "RangeCategory", selector1: itemTypeLabel, selector2: rangeLabel },
        ],
        "extra profile breadth has no direct Forge-Values feature row",
      );
    }

    if (weaponProfile.damageTypeCount > 1) {
      const extraDamageTypeCount = Math.max(1, weaponProfile.damageTypeCount - 1);
      addFeatureWeight(
        state,
        context,
        `${rangeLabel} ${weaponProfile.damageTypeCount} damage types`,
        "damage_type_flexibility",
        [
          forgeOutputExpectationLookup(FEATURE_WEIGHT_EXPECTATION_KEYS.damageTypeExtraType, extraDamageTypeCount),
          {
            category: "DmgType_Count",
            selector1: itemTypeLabel,
            selector2: rangeLabel,
            selector3: weaponProfile.damageTypeCount,
          },
        ],
        "simultaneous damage type breadth has no matching Forge-Values row",
      );
    }

    if (weaponProfile.targetCount > 1) {
      const extraTargetCount = Math.max(1, weaponProfile.targetCount - 1);
      addFeatureWeight(
        state,
        context,
        `${rangeLabel} ${weaponProfile.targetCount} targets`,
        "target_count",
        [
          forgeOutputExpectationLookup(
            weaponProfile.rangeCategory === "AOE"
              ? FEATURE_WEIGHT_EXPECTATION_KEYS.aoeExtraCount
              : FEATURE_WEIGHT_EXPECTATION_KEYS.targetCountExtraTarget,
            extraTargetCount,
          ),
          {
            category:
              weaponProfile.rangeCategory === "RANGED"
                ? "RangedTargets"
                : weaponProfile.rangeCategory === "AOE"
                  ? "AoECount"
                  : "MeleeTargets",
            selector1: itemTypeLabel,
            selector2: String(weaponProfile.targetCount),
          },
        ],
        "multi-target breadth has no matching Forge-Values row",
      );
    }

    if (weaponProfile.rangedDistanceFeet) {
      const rangedDistanceExpectationKey = getRangedDistanceFeatureExpectationKey(weaponProfile.rangedDistanceFeet);
      addFeatureWeight(
        state,
        context,
        `Ranged distance ${weaponProfile.rangedDistanceFeet} ft`,
        "ranged_distance",
        [
          ...(rangedDistanceExpectationKey ? [forgeOutputExpectationLookup(rangedDistanceExpectationKey)] : []),
          {
            category: "RangedDistanceFt",
            selector1: itemTypeLabel,
            selector2: String(weaponProfile.rangedDistanceFeet),
          },
        ],
        "ranged distance has no matching Forge-Values row",
      );
    }

    if (weaponProfile.hasAoe) {
      if (weaponProfile.profileKind === primaryProfileKind) {
        addFeatureWeight(
          state,
          context,
          "AoE attack access",
          "aoe_access",
          [
            forgeOutputExpectationLookup(FEATURE_WEIGHT_EXPECTATION_KEYS.aoeAccess),
            { category: "RangeCategory", selector1: itemTypeLabel, selector2: "AoE" },
          ],
          "AoE access has no direct Forge-Values feature row",
        );
      }
      addFeatureWeight(
        state,
        context,
        weaponProfile.aoe?.shape ? `AoE geometry (${weaponProfile.aoe.shape.toLowerCase()})` : "AoE geometry",
        "aoe_geometry",
        [
          forgeOutputExpectationLookup(
            FEATURE_WEIGHT_EXPECTATION_KEYS.aoeGeometry,
            getAoeShapeGeometryMultiplier(weaponProfile.aoe?.shape),
          ),
        ],
        "AoE geometry has no single direct Forge-Values row",
      );
      if (weaponProfile.aoe?.centerRangeFeet) {
        addFeatureWeight(
          state,
          context,
          `AoE center range ${weaponProfile.aoe.centerRangeFeet} ft`,
          "aoe_center_range",
          [
            forgeOutputExpectationLookup(
              FEATURE_WEIGHT_EXPECTATION_KEYS.aoeCenterRange,
              getAoeCenterRangeMultiplier(weaponProfile.aoe.centerRangeFeet),
            ),
            {
              category: "AoECenterRangeFt",
              selector1: itemTypeLabel,
              selector2: String(weaponProfile.aoe.centerRangeFeet),
            },
          ],
          "AoE center range has no matching Forge-Values row",
        );
      }
      if (weaponProfile.aoe?.shape === "SPHERE" && weaponProfile.aoe.sphereRadiusFeet) {
        addFeatureWeight(
          state,
          context,
          `AoE sphere radius ${weaponProfile.aoe.sphereRadiusFeet} ft`,
          "aoe_shape_size",
          [
            forgeOutputExpectationLookup(
              FEATURE_WEIGHT_EXPECTATION_KEYS.aoeGeometry,
              getAoeDimensionMultiplier("sphereRadius", weaponProfile.aoe.sphereRadiusFeet),
            ),
            {
              category: "SphereSizeFt",
              selector1: itemTypeLabel,
              selector2: String(weaponProfile.aoe.sphereRadiusFeet),
            },
          ],
          "AoE sphere size has no matching Forge-Values row",
        );
      }
      if (weaponProfile.aoe?.shape === "CONE" && weaponProfile.aoe.coneLengthFeet) {
        addFeatureWeight(
          state,
          context,
          `AoE cone length ${weaponProfile.aoe.coneLengthFeet} ft`,
          "aoe_shape_size",
          [
            forgeOutputExpectationLookup(
              FEATURE_WEIGHT_EXPECTATION_KEYS.aoeGeometry,
              getAoeDimensionMultiplier("coneLength", weaponProfile.aoe.coneLengthFeet),
            ),
            {
              category: "ConeLengthFt",
              selector1: itemTypeLabel,
              selector2: String(weaponProfile.aoe.coneLengthFeet),
            },
          ],
          "AoE cone size has no matching Forge-Values row",
        );
      }
      if (weaponProfile.aoe?.shape === "LINE") {
        if (weaponProfile.aoe.lineWidthFeet) {
          addFeatureWeight(
            state,
            context,
            `AoE line width ${weaponProfile.aoe.lineWidthFeet} ft`,
            "aoe_shape_size",
            [
              forgeOutputExpectationLookup(
                FEATURE_WEIGHT_EXPECTATION_KEYS.aoeGeometry,
                getAoeDimensionMultiplier("lineWidth", weaponProfile.aoe.lineWidthFeet),
              ),
              {
                category: "LineWidthFt",
                selector1: itemTypeLabel,
                selector2: String(weaponProfile.aoe.lineWidthFeet),
              },
            ],
            "AoE line width has no matching Forge-Values row",
          );
        }
        if (weaponProfile.aoe.lineLengthFeet) {
          addFeatureWeight(
            state,
            context,
            `AoE line length ${weaponProfile.aoe.lineLengthFeet} ft`,
            "aoe_shape_size",
            [
              forgeOutputExpectationLookup(
                FEATURE_WEIGHT_EXPECTATION_KEYS.aoeGeometry,
                getAoeDimensionMultiplier("lineLength", weaponProfile.aoe.lineLengthFeet),
              ),
              {
                category: "LineLengthFt",
                selector1: itemTypeLabel,
                selector2: String(weaponProfile.aoe.lineLengthFeet),
              },
            ],
            "AoE line length has no matching Forge-Values row",
          );
        }
      }
    }
  }

  const enabledRangeLabels = formatEnabledRangeLabels(profile);
  if (enabledRangeLabels.has("Melee") && enabledRangeLabels.has("Ranged")) {
    addFeatureWeight(
      state,
      context,
      "mixed melee/ranged access",
      "mixed_profile_access",
      [forgeOutputExpectationLookup(FEATURE_WEIGHT_EXPECTATION_KEYS.mixedAccessMeleeRanged)],
      "mixed melee/ranged access has no direct Forge-Values row",
    );
  }
  if (enabledRangeLabels.has("Melee") && enabledRangeLabels.has("AoE")) {
    addFeatureWeight(
      state,
      context,
      "mixed melee/AoE access",
      "mixed_profile_access",
      [forgeOutputExpectationLookup(FEATURE_WEIGHT_EXPECTATION_KEYS.mixedAccessMeleeAoe)],
      "mixed melee/AoE access has no direct Forge-Values row",
    );
  }
  if (enabledRangeLabels.has("Ranged") && enabledRangeLabels.has("AoE")) {
    addFeatureWeight(
      state,
      context,
      "mixed ranged/AoE access",
      "mixed_profile_access",
      [forgeOutputExpectationLookup(FEATURE_WEIGHT_EXPECTATION_KEYS.mixedAccessRangedAoe)],
      "mixed ranged/AoE access has no direct Forge-Values row",
    );
  }
  if (enabledRangeLabels.has("Melee") && enabledRangeLabels.has("Ranged") && enabledRangeLabels.has("AoE")) {
    addFeatureWeight(
      state,
      context,
      "all three attack modes",
      "mixed_profile_access",
      [forgeOutputExpectationLookup(FEATURE_WEIGHT_EXPECTATION_KEYS.mixedAccessAllThree)],
      "all three attack modes have no direct Forge-Values row",
    );
  }

  if (profile.shieldCoPresence.hasAttackAndDefence) {
    addFeatureWeight(
      state,
      context,
      "shield attack + defence split",
      "shield_split",
      [forgeOutputExpectationLookup(FEATURE_WEIGHT_EXPECTATION_KEYS.shieldSplitAttackDefence)],
      "shield attack/defence split has no direct Forge-Values row",
    );
  }

  for (const attackProfile of profile.attackProfiles.filter((entry) => entry.enabled)) {
    const rangeLabel = formatRangeLabel(attackProfile.rangeCategory);
    for (const label of attackProfile.greaterSuccessEffectLabels) {
      addFeatureWeight(
        state,
        context,
        `${rangeLabel} Greater Success: ${label}`,
        "greater_success_attack_effect",
        [{ category: "GS_AttackEffects", selector1: itemTypeLabel, selector2: rangeLabel, selector3: label }],
        "Greater Success attack effect has no matching Forge-Values row",
      );
    }
  }

  for (const detail of profile.featureProfile.weaponAttributeDetails) {
    const parsed = parseMagnitudeLabel(detail.name);
    addAttributeFeatureWeight(
      state,
      context,
      detail,
      "Weapon attribute",
      "weapon_attribute",
      [
        {
          category: "WeaponAttributes",
          selector1: "Weapon",
          selector2: parsed.baseName,
          selector3: parsed.magnitude ?? undefined,
        },
        { category: "WeaponAttributes", selector1: "Weapon", selector2: detail.name },
      ],
      "weapon attribute has no matching Forge-Values row",
    );
  }

  for (const detail of profile.defensiveProfile.armourAttributeDetails) {
    addAttributeFeatureWeight(
      state,
      context,
      detail,
      "Armour attribute",
      "armour_attribute",
      [{ category: "ArmorAttributes", selector1: "Armor", selector2: detail.name }],
      "armour attribute has no matching Forge-Values row",
    );
  }

  for (const detail of profile.defensiveProfile.shieldAttributeDetails) {
    addAttributeFeatureWeight(
      state,
      context,
      detail,
      "Shield attribute",
      "shield_attribute",
      [{ category: "ShieldAttributes", selector1: "Shield", selector2: detail.name }],
      "shield attribute has no matching Forge-Values row",
    );
  }

  for (const label of profile.defensiveProfile.defensiveEffectLabels) {
    addFeatureWeight(
      state,
      context,
      "defensive effects",
      "greater_success_defensive_effect",
      [{ category: "GS_DefEffects", selector1: itemTypeLabel, selector2: label }],
      "defensive Greater Success effect has no matching Forge-Values row",
    );
  }

  for (const label of profile.defensiveProfile.vrpSummary) {
    addFeatureWeight(
      state,
      context,
      `VRP: ${label}`,
      "vrp",
      [{ category: "VRPOptions", selector1: itemTypeLabel, selector2: label }],
      "VRP entry has no matching Forge-Values row",
    );
  }

  for (const label of profile.featureProfile.globalAttributeModifierSummary) {
    const parsed = parseGlobalAttributeSummary(label);
    addFeatureWeight(
      state,
      context,
      `Global modifier: ${label}`,
      "global_attribute_modifier",
      [
        {
          category: "Attribute",
          selector1: itemTypeLabel,
          selector2: parsed.attribute,
          selector3: parsed.magnitude ?? undefined,
        },
        {
          category: "Attribute",
          selector1: parsed.attribute,
          selector2: itemTypeLabel,
          selector3: parsed.magnitude ?? undefined,
        },
        { category: "Attribute", selector1: itemTypeLabel, selector2: parsed.attribute },
        { category: "Attribute", selector1: parsed.attribute, selector2: itemTypeLabel },
      ],
      "global attribute modifier has no matching Forge-Values row",
    );
  }

  for (const label of profile.featureProfile.customTextLabels) {
    addFeatureWeight(
      state,
      context,
      label,
      "custom_text_feature",
      [],
      "custom text feature has no direct Forge-Values row",
    );
  }

  return state;
}

export function classifyForgeOutputLanes(
  profile: ForgeOutputProfile,
  bandComparison: ForgeOutputBandComparisonCore,
  featureWeightContext?: ForgeFeatureWeightContext | null,
  expectationDebug: ForgeExpectationContextDebug = { fallbackUsed: false },
): ForgeOutputLaneComparison {
  const enabledWeaponProfiles = bandComparison.weaponProfiles.filter((entry) => entry.enabled);
  const primaryWeaponProfile = enabledWeaponProfiles.reduce<ForgeWeaponProfileBandComparison | null>(
    (highest, current) => {
      if (!highest) return current;
      return CLASSIFICATION_RANK[current.classification] > CLASSIFICATION_RANK[highest.classification]
        ? current
        : highest;
    },
    null,
  );
  const featureWeightState = collectFeatureWeights(profile, enabledWeaponProfiles, featureWeightContext);
  const featureDrivers = featureWeightState.drivers.map((entry) => entry.label);
  const featureWarnings: string[] = [];
  const coreDrivers: string[] = [];
  const coreWarnings: string[] = [];
  const featureWeightBudget = getFeatureWeightBudget(profile, featureWeightContext, expectationDebug);
  const featureStatusThresholds = getFeatureStatusThresholds(featureWeightContext, expectationDebug);
  const featureWeightTotalRaw = featureWeightState.totalRaw;
  const featureWeightTotalClamped = Math.max(0, featureWeightTotalRaw);
  const featureWeightRatio =
    featureWeightBudget.value > 0 ? featureWeightTotalClamped / featureWeightBudget.value : 0;
  const corePressureCandidates: CorePressureCandidate[] = [];
  const rangePressureDrivers: string[] = [];
  const secondaryProfileCoreDrivers: string[] = [];
  let coreScore = 0;
  let rangePressureScore = 0;
  let secondaryProfileCoreContribution = 0;
  let secondaryAggregateStatus: ForgeLaneStatus = "narrow";
  let coreStatusFloor: ForgeLaneStatus = "narrow";

  if (primaryWeaponProfile) {
    coreScore += Math.max(1, CLASSIFICATION_RANK[primaryWeaponProfile.classification]);
    coreStatusFloor = maxLaneStatus(coreStatusFloor, coreStatusFloorForBand(primaryWeaponProfile.classification));
    coreDrivers.push(
      `${primaryWeaponProfile.profileKind} ${primaryWeaponProfile.classification} weapon throughput`,
    );
    coreDrivers.push(`${primaryWeaponProfile.totalWoundsPerSuccess} wounds/success`);
    if (primaryWeaponProfile.targetCount > 1) {
      coreDrivers.push(`${primaryWeaponProfile.totalPressure} total pressure across ${primaryWeaponProfile.targetCount} targets`);
    }
    corePressureCandidates.push(
      getCorePressureCandidate(
        `${primaryWeaponProfile.profileKind} weapon throughput`,
        primaryWeaponProfile.totalWoundsPerSuccess,
        primaryWeaponProfile.thresholds.standardMax,
        primaryWeaponProfile.debugNotes.some((entry) => entry.includes("expectation config"))
          ? "forge_expectation_config"
          : "default",
      ),
    );
    if (isExtremeOrMore(primaryWeaponProfile.classification)) {
      coreWarnings.push("weapon throughput is extreme-or-higher for item level");
    }
  }

  for (const secondaryWeaponProfile of enabledWeaponProfiles) {
    if (!primaryWeaponProfile || secondaryWeaponProfile.profileKind === primaryWeaponProfile.profileKind) continue;
    if (secondaryWeaponProfile.totalWoundsPerSuccess <= 0) continue;

    const secondaryContribution =
      secondaryWeaponProfile.totalWoundsPerSuccess * SECONDARY_PROFILE_CORE_MULTIPLIER;
    secondaryProfileCoreContribution += secondaryContribution;
    coreScore += Math.max(
      SECONDARY_PROFILE_CORE_MULTIPLIER,
      CLASSIFICATION_RANK[secondaryWeaponProfile.classification] * SECONDARY_PROFILE_CORE_MULTIPLIER,
    );
    coreStatusFloor = maxLaneStatus(coreStatusFloor, coreStatusFloorForBand(secondaryWeaponProfile.classification));
    coreDrivers.push(
      `${secondaryWeaponProfile.profileKind} ${secondaryWeaponProfile.classification} secondary weapon throughput`,
    );
    secondaryProfileCoreDrivers.push(
      `${secondaryWeaponProfile.profileKind} ${formatPressureValue(secondaryContribution)} weighted core pressure`,
    );
    if (secondaryWeaponProfile.targetCount > 1) {
      coreDrivers.push(
        `${secondaryWeaponProfile.profileKind} ${secondaryWeaponProfile.totalPressure} total pressure across ${secondaryWeaponProfile.targetCount} targets`,
      );
    }
    if (secondaryWeaponProfile.classification === "over-band") {
      corePressureCandidates.push(
        getCorePressureCandidate(
          `${secondaryWeaponProfile.profileKind} secondary weapon throughput`,
          secondaryWeaponProfile.totalWoundsPerSuccess,
          secondaryWeaponProfile.thresholds.standardMax,
          secondaryWeaponProfile.debugNotes.some((entry) => entry.includes("expectation config"))
            ? "forge_expectation_config"
            : "default",
        ),
      );
    }
    if (isExtremeOrMore(secondaryWeaponProfile.classification)) {
      coreWarnings.push(`${secondaryWeaponProfile.profileKind} secondary weapon throughput is extreme-or-higher for item level`);
    }
  }

  if (primaryWeaponProfile && secondaryProfileCoreContribution > 0) {
    const primaryCoreSource = primaryWeaponProfile.debugNotes.some((entry) => entry.includes("expectation config"))
      ? "forge_expectation_config"
      : "default";
    const combinedActual = primaryWeaponProfile.totalWoundsPerSuccess + secondaryProfileCoreContribution;
    const combinedCandidate = getCorePressureCandidate(
      "primary + secondary weapon throughput",
      combinedActual,
      primaryWeaponProfile.thresholds.standardMax,
      primaryCoreSource,
    );
    corePressureCandidates.push(combinedCandidate);
    secondaryAggregateStatus = coreStatusFromPressureRatio(combinedCandidate.ratio);
    coreDrivers.push(
      `secondary profiles add ${formatPressureValue(secondaryProfileCoreContribution)} weighted core pressure (${SECONDARY_PROFILE_CORE_MULTIPLIER}x)`,
    );
  }

  for (const weaponProfile of enabledWeaponProfiles) {
    const pressure = weaponProfile.rangedDistancePressure;
    if (!pressure || pressure.score <= 0 || weaponProfile.totalWoundsPerSuccess <= 0) continue;

    const coreContribution = pressure.score * RANGED_DISTANCE_CORE_SCORE_MULTIPLIER;
    coreScore += coreContribution;
    rangePressureScore += pressure.score;
    rangePressureDrivers.push(`ranged distance ${pressure.distanceFeet} ft (${pressure.tier})`);
    coreDrivers.push(
      `ranged distance ${pressure.distanceFeet} ft (${pressure.tier} reach pressure, ${formatPressureValue(coreContribution)} core)`,
    );
  }

  const ppvClass = bandComparison.defensive.ppv.classification;
  const mpvClass = bandComparison.defensive.mpv.classification;
  if (profile.defensiveProfile.ppv > 0) {
    coreScore += Math.max(1, CLASSIFICATION_RANK[ppvClass]);
    coreStatusFloor = maxLaneStatus(coreStatusFloor, coreStatusFloorForBand(ppvClass));
    coreDrivers.push(`PPV ${profile.defensiveProfile.ppv} (${ppvClass})`);
    corePressureCandidates.push(
      getCorePressureCandidate(
        "PPV defensive output",
        profile.defensiveProfile.ppv,
        bandComparison.defensive.ppv.thresholds.standardMax,
        bandComparison.debug.notes.some((entry) => entry.includes("PPV core expectation multiplier"))
          ? "forge_expectation_config"
          : "default",
      ),
    );
  }
  if (profile.defensiveProfile.mpv > 0) {
    coreScore += Math.max(1, CLASSIFICATION_RANK[mpvClass]);
    coreStatusFloor = maxLaneStatus(coreStatusFloor, coreStatusFloorForBand(mpvClass));
    coreDrivers.push(`MPV ${profile.defensiveProfile.mpv} (${mpvClass})`);
    corePressureCandidates.push(
      getCorePressureCandidate(
        "MPV defensive output",
        profile.defensiveProfile.mpv,
        bandComparison.defensive.mpv.thresholds.standardMax,
        bandComparison.debug.notes.some((entry) => entry.includes("MPV core expectation multiplier"))
          ? "forge_expectation_config"
          : "default",
      ),
    );
  }
  if (profile.defensiveProfile.auraPhysical) {
    coreScore += 1;
    coreDrivers.push(`physical aura ${profile.defensiveProfile.auraPhysical}`);
  }
  if (profile.defensiveProfile.auraMental) {
    coreScore += 1;
    coreDrivers.push(`mental aura ${profile.defensiveProfile.auraMental}`);
  }

  if (bandComparison.shield.hasAttackAndDefence) {
    coreScore += 1;
    coreDrivers.push("shield split attack/defence output");
    coreWarnings.push(`shield split-function ${bandComparison.shield.shieldSplitWarningLevel}`);
    if (bandComparison.shield.shieldSplitWarningLevel === "likelyOverloaded") {
      coreStatusFloor = "likely overloaded";
    }
  }

  const rarityRole = getRarityRole(profile.common.rarity);
  const rarityNotes = [
    "rarity is interpretive context only and does not increase raw damage allowance",
  ];

  if (profile.common.rarity === "COMMON" && featureWeightRatio >= featureStatusThresholds.moderate.value) {
    featureWarnings.push("Common item carries moderate-or-broader feature load");
    rarityNotes.push("Common should usually remain narrow unless deliberately flagged");
  }
  if (featureWeightState.fallbackUsed) {
    featureWarnings.push("Some feature weights are using fallback diagnostic values");
  }
  if (featureWeightState.drivers.some((entry) => entry.weight < 0)) {
    featureWarnings.push("Negative Forge-Values reduce feature pressure");
  }
  if ((profile.common.rarity === "COMMON" || profile.common.rarity === "UNCOMMON") && coreScore >= 6) {
    coreWarnings.push("core output is heavy for a low-rarity item; rarity does not excuse raw throughput");
  }
  if (enabledWeaponProfiles.some((entry) => entry.classification === "over-band")) {
    coreWarnings.push("over-band weapon output remains over-band regardless of rarity");
  }
  if (enabledWeaponProfiles.some((entry) => isHighOrMore(entry.totalPressureClassification) && entry.targetCount > 1)) {
    coreWarnings.push("multi-target total pressure should spend breadth/feature budget");
  }
  if (enabledWeaponProfiles.some((entry) => entry.damageTypeCount > 1 && isStandardOrMore(entry.classification))) {
    featureWarnings.push("simultaneous damage type count is contributing to core pressure");
  }
  const corePressure = getHighestCorePressureCandidate(corePressureCandidates);
  if (corePressure.actual > 0) {
    coreDrivers.push(`${corePressure.label} ${corePressure.actual}/${corePressure.expected} expected`);
  }
  featureDrivers.unshift(
    `feature load ${featureWeightTotalClamped}/${featureWeightBudget.value} expected`,
  );
  if (featureWeightTotalRaw < featureWeightTotalClamped) {
    featureDrivers.push(`signed feature load ${featureWeightTotalRaw} before display clamp`);
  }

  const scoredCoreStatus = statusFromScore(
    coreScore,
    coreStatusFloor === "likely overloaded" || coreWarnings.some((entry) => entry.includes("over-band")),
  );
  const coreStatus = maxLaneStatus(scoredCoreStatus, coreStatusFloor, secondaryAggregateStatus);

  return {
    coreFunctionality: {
      status: coreStatus,
      mainDrivers: coreDrivers,
      warnings: coreWarnings,
    },
    featuresVersatility: {
      status: statusFromFeatureWeightRatio(
        featureWeightRatio,
        featureStatusThresholds,
        featureWarnings.length > 2,
      ),
      mainDrivers: featureDrivers,
      warnings: featureWarnings,
    },
    rarityPressure: {
      expectedRarityRole: rarityRole,
      notes: rarityNotes,
    },
    debug: {
      source: "forge_output_lanes_v1",
      reportOnly: true,
      coreActualValue: corePressure.actual,
      coreExpectedValue: corePressure.expected,
      corePressureRatio: corePressure.ratio,
      coreExpectationSource: corePressure.source,
      secondaryProfileCoreContribution,
      secondaryProfileCoreDrivers,
      secondaryProfileCoreMultiplier: SECONDARY_PROFILE_CORE_MULTIPLIER,
      rangePressureScore,
      rangePressureDrivers,
      featureWeightTotal: featureWeightTotalClamped,
      featureWeightTotalRaw,
      featureWeightTotalClamped,
      expectedFeatureBudget: featureWeightBudget.value,
      featurePressureRatio: featureWeightRatio,
      featureStatusSource: "forge_values_weighted",
      featureBudgetSource: featureWeightBudget.source,
      featureWeightDrivers: featureWeightState.drivers,
      missingFeatureWeightDrivers: featureWeightState.missing,
      costSource: featureWeightState.hasForgeValues ? "forge_values" : "fallback",
      fallbackUsed: featureWeightState.fallbackUsed,
      expectationFallbackUsed: expectationDebug.fallbackUsed,
    },
  };
}

export function compareForgeOutputToBands(
  profile: ForgeOutputProfile,
  featureWeightContext?: ForgeFeatureWeightContext | null,
): ForgeOutputBandComparison {
  const expectationDebug: ForgeExpectationContextDebug = { fallbackUsed: false };
  const baseWeaponBand = getWeaponBand(profile.common.level, profile.common.normalizedSize);
  const weaponSizeLabel = getSizeExpectationLabel(baseWeaponBand.bandSize);
  const weaponMultiplier = getCoreMultiplier(
    featureWeightContext,
    expectationDebug,
    `core.weapon.size.${weaponSizeLabel}.multiplier`,
    1,
    [{ category: "SIZE", selector1: "core.weapon.size", selector2: weaponSizeLabel }],
  );
  const weaponBand = {
    ...baseWeaponBand,
    thresholds: scaledBand(baseWeaponBand.thresholds, weaponMultiplier.value),
    debugNotes:
      weaponMultiplier.source === "forge_expectation_config"
        ? [...baseWeaponBand.debugNotes, `weapon expectation config multiplier ${weaponMultiplier.value}`]
        : baseWeaponBand.debugNotes,
  };
  const ppvMultiplier = getCoreMultiplier(
    featureWeightContext,
    expectationDebug,
    "core.defence.ppv.multiplier",
    1,
    [{ category: "SIZE", selector1: "core.defence", selector2: "PPV" }],
  );
  const mpvMultiplier = getCoreMultiplier(
    featureWeightContext,
    expectationDebug,
    "core.defence.mpv.multiplier",
    1,
    [{ category: "SIZE", selector1: "core.defence", selector2: "MPV" }],
  );
  const ppvThresholds = scaledBand(getBand("ppv", profile.common.level), ppvMultiplier.value);
  const mpvThresholds = scaledBand(getBand("mpv", profile.common.level), mpvMultiplier.value);
  const weaponProfiles = profile.attackProfiles
    .filter((entry) => entry.enabled)
    .map((entry) => {
      const rangeModeMultiplier =
        entry.rangeCategory === "RANGED"
          ? getCoreMultiplier(
              featureWeightContext,
              expectationDebug,
              RANGED_PROFILE_CORE_MULTIPLIER_KEY,
              DEFAULT_RANGED_PROFILE_CORE_MULTIPLIER,
              [{ category: "SIZE", selector1: "core.weapon.rangeMode", selector2: "RANGED" }],
            )
          : { value: 1, source: "default" as const };
      return compareWeaponProfile(entry, weaponBand, rangeModeMultiplier);
    });
  const ppvClassification = classifyValue(profile.defensiveProfile.ppv, ppvThresholds);
  const mpvClassification = classifyValue(profile.defensiveProfile.mpv, mpvThresholds);

  const comparisonCore: ForgeOutputBandComparisonCore = {
    common: profile.common,
    weaponProfiles,
    defensive: {
      ppv: {
        value: profile.defensiveProfile.ppv,
        classification: ppvClassification,
        thresholds: ppvThresholds,
      },
      mpv: {
        value: profile.defensiveProfile.mpv,
        classification: mpvClassification,
        thresholds: mpvThresholds,
      },
      debugNote: "package/per-piece context deferred",
    },
    shield: resolveShieldWarning(profile, weaponProfiles, ppvClassification, mpvClassification),
    debug: {
      source: "forge_output_bands_v1",
      bandSet: "natural_baseline_v1",
      reportOnly: true,
      noSaveBlocking: true,
      notes: [
        "v1 constants are copied from docs/07 and docs/08 as diagnostic readout bands",
        "weapon and shield attack wound bands are size-aware; missing size defaults to one-handed",
        "rarity does not increase raw damage bands in this comparator",
        "ranged profiles use a lower core damage allowance than melee because melee accepts tactical risk",
        "armour slot weighting is deferred",
        weaponMultiplier.source === "forge_expectation_config"
          ? `weapon core expectation multiplier ${weaponMultiplier.value}`
          : "weapon core expectation default multiplier 1",
        ppvMultiplier.source === "forge_expectation_config"
          ? `PPV core expectation multiplier ${ppvMultiplier.value}`
          : "PPV core expectation default multiplier 1",
        mpvMultiplier.source === "forge_expectation_config"
          ? `MPV core expectation multiplier ${mpvMultiplier.value}`
          : "MPV core expectation default multiplier 1",
      ],
    },
  };

  return {
    ...comparisonCore,
    lanes: classifyForgeOutputLanes(profile, comparisonCore, featureWeightContext, expectationDebug),
  };
}
