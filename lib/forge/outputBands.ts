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
  perTargetClassification: ForgeOutputBandClassification;
  totalPressureClassification: ForgeOutputBandClassification;
  classification: ForgeOutputBandClassification;
  greaterSuccessEffectCount: number;
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
    featureWeightTotal: number;
    featureWeightBudget: number;
    featureWeightRatio: number;
    featureStatusSource: "forge_values_weighted";
    featureWeightDrivers: ForgeFeatureWeightDriver[];
    missingFeatureWeightDrivers: ForgeMissingFeatureWeightDriver[];
    costSource: "forge_values" | "fallback";
    fallbackUsed: boolean;
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

export type ForgeFeatureWeightContext = {
  costs: ForgeFeatureWeightCostRow[];
  fallbackWeight: number;
};

type FeatureWeightState = {
  total: number;
  score: number;
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
  return {
    costs: costs ?? [],
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
): ForgeWeaponProfileBandComparison {
  const { thresholds } = weaponBand;
  const perTargetWounds = profile.totalWoundsPerSuccess;
  const totalPressure = profile.totalWoundsPerSuccess * profile.targetCount;
  const perTargetClassification = classifyValue(perTargetWounds, thresholds);
  const totalPressureClassification = classifyValue(totalPressure, thresholds);
  const classification = maxClassification([perTargetClassification, totalPressureClassification]);
  const debugNotes: string[] = [...weaponBand.debugNotes];

  if (profile.damageTypeCount > 1) {
    debugNotes.push("multiple simultaneous damage types consume core output budget");
  }
  if (profile.targetCount > 1) {
    debugNotes.push("multi-target pressure is reported separately from per-target wounds");
  }
  if (profile.aoe) {
    debugNotes.push("AoE geometry is feature/breadth pressure and remains report-only");
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
    perTargetClassification,
    totalPressureClassification,
    classification,
    greaterSuccessEffectCount: profile.greaterSuccessEffectCount,
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

function getFeatureWeightBudget(profile: ForgeOutputProfile): number {
  const level = normalizeLevel(profile.common.level);
  const levelBump = Math.floor((level - 1) / 5) * 2;
  const rarity = String(profile.common.rarity ?? "").trim().toUpperCase();
  if (rarity === "MYTHIC") return 40 + levelBump;
  if (rarity === "LEGENDARY") return 30 + levelBump;
  if (rarity === "RARE") return 22 + levelBump;
  if (rarity === "UNCOMMON") return 14 + levelBump;
  return 10 + levelBump;
}

function statusFromFeatureWeightRatio(ratio: number, overloaded: boolean): ForgeLaneStatus {
  if (overloaded) return "likely overloaded";
  if (ratio >= 2) return "heavy";
  if (ratio >= 1.5) return "broad";
  if (ratio >= 1) return "moderate";
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

function createFeatureWeightState(context: ForgeFeatureWeightContext | null | undefined): FeatureWeightState {
  return {
    total: 0,
    score: 0,
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
    if (weight !== null && weight > 0) {
      state.total += weight;
      state.score += weight;
      state.drivers.push({
        label,
        source: `${lookup.category}/${[lookup.selector1, lookup.selector2, lookup.selector3]
          .filter((entry) => entry !== undefined && entry !== null && String(entry).trim())
          .join("/")}`,
        weight,
        fallbackUsed: false,
      });
      return;
    }
  }

  const fallbackWeight = context?.fallbackWeight ?? DEFAULT_FEATURE_FALLBACK_WEIGHT;
  state.total += fallbackWeight;
  state.score += fallbackWeight;
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
  if (detail.pricingWeight !== null && detail.pricingWeight > 0) {
    state.total += detail.pricingWeight;
    state.score += detail.pricingWeight;
    state.drivers.push({
      label: `${labelPrefix}: ${detail.name}`,
      source: `attribute_scalar/${detail.pricingMode ?? "UNKNOWN"}`,
      weight: detail.pricingWeight,
      fallbackUsed: false,
      note:
        detail.pricingScalar !== null && detail.pricingMagnitude !== null
          ? `${detail.pricingScalar} x ${detail.pricingMagnitude}`
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
        `${enabledWeaponProfiles.length} attack profiles`,
        "extra_profile",
        [{ category: "RangeCategory", selector1: itemTypeLabel, selector2: rangeLabel }],
        "extra profile breadth has no direct Forge-Values feature row",
      );
    }

    if (weaponProfile.damageTypeCount > 1) {
      addFeatureWeight(
        state,
        context,
        `${rangeLabel} ${weaponProfile.damageTypeCount} damage types`,
        "damage_type_flexibility",
        [{
          category: "DmgType_Count",
          selector1: itemTypeLabel,
          selector2: rangeLabel,
          selector3: weaponProfile.damageTypeCount,
        }],
        "simultaneous damage type breadth has no matching Forge-Values row",
      );
    }

    if (weaponProfile.targetCount > 1) {
      addFeatureWeight(
        state,
        context,
        `${rangeLabel} ${weaponProfile.targetCount} targets`,
        "target_count",
        [{
          category: weaponProfile.rangeCategory === "RANGED" ? "RangedTargets" : "MeleeTargets",
          selector1: itemTypeLabel,
          selector2: String(weaponProfile.targetCount),
        }],
        "multi-target breadth has no matching Forge-Values row",
      );
    }

    if (weaponProfile.hasAoe) {
      addFeatureWeight(
        state,
        context,
        "AoE geometry",
        "aoe_geometry",
        [],
        "AoE geometry has no single direct Forge-Values row",
      );
    }
  }

  const enabledRangeLabels = new Set(enabledWeaponProfiles.map((entry) => formatRangeLabel(entry.rangeCategory)));
  if (enabledRangeLabels.has("Melee") && enabledRangeLabels.has("Ranged")) {
    addFeatureWeight(
      state,
      context,
      "mixed melee/ranged access",
      "mixed_profile_access",
      [],
      "mixed melee/ranged access has no direct Forge-Values row",
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
  const featureWeightBudget = getFeatureWeightBudget(profile);
  const featureWeightRatio =
    featureWeightBudget > 0 ? featureWeightState.total / featureWeightBudget : 0;
  let coreScore = 0;
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
    if (isExtremeOrMore(primaryWeaponProfile.classification)) {
      coreWarnings.push("weapon throughput is extreme-or-higher for item level");
    }
  }

  const ppvClass = bandComparison.defensive.ppv.classification;
  const mpvClass = bandComparison.defensive.mpv.classification;
  if (profile.defensiveProfile.ppv > 0) {
    coreScore += Math.max(1, CLASSIFICATION_RANK[ppvClass]);
    coreStatusFloor = maxLaneStatus(coreStatusFloor, coreStatusFloorForBand(ppvClass));
    coreDrivers.push(`PPV ${profile.defensiveProfile.ppv} (${ppvClass})`);
  }
  if (profile.defensiveProfile.mpv > 0) {
    coreScore += Math.max(1, CLASSIFICATION_RANK[mpvClass]);
    coreStatusFloor = maxLaneStatus(coreStatusFloor, coreStatusFloorForBand(mpvClass));
    coreDrivers.push(`MPV ${profile.defensiveProfile.mpv} (${mpvClass})`);
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

  if (profile.common.rarity === "COMMON" && featureWeightRatio >= 1) {
    featureWarnings.push("Common item carries moderate-or-broader feature load");
    rarityNotes.push("Common should usually remain narrow unless deliberately flagged");
  }
  if (featureWeightState.fallbackUsed) {
    featureWarnings.push("Some feature weights are using fallback diagnostic values");
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

  const scoredCoreStatus = statusFromScore(
    coreScore,
    coreStatusFloor === "likely overloaded" || coreWarnings.some((entry) => entry.includes("over-band")),
  );

  return {
    coreFunctionality: {
      status: maxLaneStatus(scoredCoreStatus, coreStatusFloor),
      mainDrivers: coreDrivers,
      warnings: coreWarnings,
    },
    featuresVersatility: {
      status: statusFromFeatureWeightRatio(featureWeightRatio, featureWarnings.length > 2),
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
      featureWeightTotal: featureWeightState.total,
      featureWeightBudget,
      featureWeightRatio,
      featureStatusSource: "forge_values_weighted",
      featureWeightDrivers: featureWeightState.drivers,
      missingFeatureWeightDrivers: featureWeightState.missing,
      costSource: featureWeightState.hasForgeValues ? "forge_values" : "fallback",
      fallbackUsed: featureWeightState.fallbackUsed,
    },
  };
}

export function compareForgeOutputToBands(
  profile: ForgeOutputProfile,
  featureWeightContext?: ForgeFeatureWeightContext | null,
): ForgeOutputBandComparison {
  const weaponBand = getWeaponBand(profile.common.level, profile.common.normalizedSize);
  const ppvThresholds = getBand("ppv", profile.common.level);
  const mpvThresholds = getBand("mpv", profile.common.level);
  const weaponProfiles = profile.attackProfiles
    .filter((entry) => entry.enabled)
    .map((entry) => compareWeaponProfile(entry, weaponBand));
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
        "armour slot weighting is deferred",
      ],
    },
  };

  return {
    ...comparisonCore,
    lanes: classifyForgeOutputLanes(profile, comparisonCore, featureWeightContext),
  };
}
