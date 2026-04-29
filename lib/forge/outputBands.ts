import type {
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

function normalizeLevel(level: number | null): number {
  if (typeof level !== "number" || !Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(20, Math.round(level)));
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

function isHighOrMore(classification: ForgeOutputBandClassification): boolean {
  return CLASSIFICATION_RANK[classification] >= CLASSIFICATION_RANK.high;
}

function isExtremeOrMore(classification: ForgeOutputBandClassification): boolean {
  return CLASSIFICATION_RANK[classification] >= CLASSIFICATION_RANK.extreme;
}

function isStandardOrMore(classification: ForgeOutputBandClassification): boolean {
  return CLASSIFICATION_RANK[classification] >= CLASSIFICATION_RANK.standard;
}

export function classifyForgeOutputLanes(
  profile: ForgeOutputProfile,
  bandComparison: ForgeOutputBandComparisonCore,
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
  const featureDrivers: string[] = [];
  const featureWarnings: string[] = [];
  const coreDrivers: string[] = [];
  const coreWarnings: string[] = [];
  let featureScore = 0;
  let coreScore = 0;

  if (primaryWeaponProfile) {
    coreScore += Math.max(1, CLASSIFICATION_RANK[primaryWeaponProfile.classification]);
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

  if (enabledWeaponProfiles.length > 1) {
    featureScore += enabledWeaponProfiles.length;
    featureDrivers.push(`${enabledWeaponProfiles.length} attack profiles`);
    const rangeKinds = new Set(enabledWeaponProfiles.map((entry) => entry.rangeCategory));
    if (rangeKinds.has("MELEE") && rangeKinds.has("RANGED")) {
      featureScore += 1;
      featureDrivers.push("mixed melee/ranged access");
    }
  }

  for (const weaponProfile of enabledWeaponProfiles) {
    if (weaponProfile.damageTypeCount > 1) {
      featureScore += weaponProfile.damageTypeCount - 1;
      featureDrivers.push(`${weaponProfile.profileKind} simultaneous damage type flexibility`);
    }
    if (weaponProfile.greaterSuccessEffectCount > 0) {
      featureScore += weaponProfile.greaterSuccessEffectCount;
      featureDrivers.push(`${weaponProfile.profileKind} Greater Success effects`);
    }
    if (weaponProfile.hasAoe) {
      featureScore += 2;
      featureDrivers.push("AoE geometry");
    }
    if (weaponProfile.targetCount > 1) {
      featureScore += weaponProfile.targetCount - 1;
      featureDrivers.push(`${weaponProfile.profileKind} multi-target access`);
    }
  }

  const ppvClass = bandComparison.defensive.ppv.classification;
  const mpvClass = bandComparison.defensive.mpv.classification;
  if (profile.defensiveProfile.ppv > 0) {
    coreScore += Math.max(1, CLASSIFICATION_RANK[ppvClass]);
    coreDrivers.push(`PPV ${profile.defensiveProfile.ppv} (${ppvClass})`);
  }
  if (profile.defensiveProfile.mpv > 0) {
    coreScore += Math.max(1, CLASSIFICATION_RANK[mpvClass]);
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

  if (profile.defensiveProfile.defensiveEffectCount > 0) {
    featureScore += profile.defensiveProfile.defensiveEffectCount;
    featureDrivers.push("defensive effects");
  }
  if (profile.defensiveProfile.armourAttributeCount > 0) {
    featureScore += profile.defensiveProfile.armourAttributeCount;
    featureDrivers.push("armour attributes");
  }
  if (profile.defensiveProfile.shieldAttributeCount > 0) {
    featureScore += profile.defensiveProfile.shieldAttributeCount;
    featureDrivers.push("shield attributes");
  }
  if (profile.defensiveProfile.vrpCount > 0) {
    featureScore += profile.defensiveProfile.vrpCount;
    featureDrivers.push("VRP entries");
  }
  if (profile.featureProfile.weaponAttributeCount > 0) {
    featureScore += profile.featureProfile.weaponAttributeCount;
    featureDrivers.push("weapon attributes");
  }
  if (profile.featureProfile.customTextLabels.length > 0) {
    featureScore += profile.featureProfile.customTextLabels.length;
    featureDrivers.push(...profile.featureProfile.customTextLabels);
  }
  if (profile.featureProfile.globalAttributeModifierCount > 0) {
    featureScore += profile.featureProfile.globalAttributeModifierCount;
    featureDrivers.push("global attribute modifiers");
  }
  if (profile.featureProfile.tagCount > 0) {
    featureScore += 1;
    featureDrivers.push("tags/special properties");
  }

  if (bandComparison.shield.hasAttackAndDefence) {
    coreScore += 1;
    coreDrivers.push("shield split attack/defence output");
    coreWarnings.push(`shield split-function ${bandComparison.shield.shieldSplitWarningLevel}`);
  }

  const rarityRole = getRarityRole(profile.common.rarity);
  const rarityNotes = [
    "rarity is interpretive context only and does not increase raw damage allowance",
  ];

  if (profile.common.rarity === "COMMON" && featureScore >= 3) {
    featureWarnings.push("Common item carries moderate-or-broader feature load");
    rarityNotes.push("Common should usually remain narrow unless deliberately flagged");
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

  return {
    coreFunctionality: {
      status: statusFromScore(coreScore, coreWarnings.some((entry) => entry.includes("over-band"))),
      mainDrivers: coreDrivers,
      warnings: coreWarnings,
    },
    featuresVersatility: {
      status: statusFromScore(featureScore, featureWarnings.length > 2),
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
    },
  };
}

export function compareForgeOutputToBands(profile: ForgeOutputProfile): ForgeOutputBandComparison {
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
    lanes: classifyForgeOutputLanes(profile, comparisonCore),
  };
}
