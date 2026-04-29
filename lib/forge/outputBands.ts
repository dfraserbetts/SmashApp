import type {
  ForgeAttackProfileOutput,
  ForgeOutputProfile,
} from "./outputProfile";

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

export type ForgeOutputBandComparison = {
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

type SourceBandRow = {
  level: number;
  lowMax: number;
  standardMax: number;
  highMax: number;
  extremeMin: number;
};

// First-pass diagnostic constants copied from docs/07 and docs/08.
// These are output-band readout helpers, not final tuning law or save validation.
const WEAPON_WOUNDS_PER_SUCCESS_BANDS: SourceBandRow[] = [
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
];

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

function getBand(metric: ForgeBandMetric, level: number | null): ForgeBandThresholds {
  const normalizedLevel = normalizeLevel(level);
  const rows =
    metric === "weaponWoundsPerSuccess"
      ? WEAPON_WOUNDS_PER_SUCCESS_BANDS
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
  thresholds: ForgeBandThresholds,
): ForgeWeaponProfileBandComparison {
  const perTargetWounds = profile.totalWoundsPerSuccess;
  const totalPressure = profile.totalWoundsPerSuccess * profile.targetCount;
  const perTargetClassification = classifyValue(perTargetWounds, thresholds);
  const totalPressureClassification = classifyValue(totalPressure, thresholds);
  const classification = maxClassification([perTargetClassification, totalPressureClassification]);
  const debugNotes: string[] = [];

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

export function compareForgeOutputToBands(profile: ForgeOutputProfile): ForgeOutputBandComparison {
  const weaponThresholds = getBand("weaponWoundsPerSuccess", profile.common.level);
  const ppvThresholds = getBand("ppv", profile.common.level);
  const mpvThresholds = getBand("mpv", profile.common.level);
  const weaponProfiles = profile.attackProfiles
    .filter((entry) => entry.enabled)
    .map((entry) => compareWeaponProfile(entry, weaponThresholds));
  const ppvClassification = classifyValue(profile.defensiveProfile.ppv, ppvThresholds);
  const mpvClassification = classifyValue(profile.defensiveProfile.mpv, mpvThresholds);

  return {
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
        "rarity does not increase raw damage bands in this comparator",
        "armour slot weighting is deferred",
      ],
    },
  };
}
