import {
  buildForgeOutputProfile,
  type ForgeOutputProfileInput,
} from "../lib/forge/outputProfile";
import {
  buildForgeFeatureWeightContext,
  compareForgeOutputToBands,
  type ForgeOutputBandClassification,
  type ForgeOutputBandComparison,
  type ForgeLaneStatus,
} from "../lib/forge/outputBands";
import type { WeaponSize } from "../lib/forge/types";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "LEGENDARY" | "MYTHIC";

const SIZES: WeaponSize[] = ["SMALL", "ONE_HANDED", "TWO_HANDED"];
const RARITIES: Rarity[] = ["COMMON", "UNCOMMON", "RARE", "LEGENDARY", "MYTHIC"];
const REPRESENTATIVE_LEVELS = [1, 5, 10, 15, 20];
const STATUS_RANK: Record<ForgeLaneStatus, number> = {
  narrow: 0,
  moderate: 1,
  broad: 2,
  heavy: 3,
  "likely overloaded": 4,
};
const BAND_RANK: Record<ForgeOutputBandClassification, number> = {
  below: 0,
  low: 1,
  standard: 2,
  high: 3,
  extreme: 4,
  "over-band": 5,
};

const FEATURE_CONTEXT = buildForgeFeatureWeightContext([
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.COMMON", value: 10 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.UNCOMMON", value: 14 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.RARE", value: 22 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.LEGENDARY", value: 30 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.MYTHIC", value: 40 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.levelScale.perLevel", value: 0 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.levelScale.perFiveLevels", value: 2 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.status.moderateRatio", value: 0.36 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.status.broadRatio", value: 0.61 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.status.heavyRatio", value: 0.8 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.extraProfile", value: 2 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.mixedAccess.meleeRanged", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.mixedAccess.meleeAoe", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.mixedAccess.rangedAoe", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.mixedAccess.allThree", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.targetCount.extraTarget", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.damageType.extraType", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.rangedDistance.31to60", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.rangedDistance.61to120", value: 2 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.rangedDistance.121plus", value: 3 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.aoe.access", value: 5 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.aoe.extraCount", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.aoe.centerRange", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.aoe.geometry", value: 1 },
  { category: "RangedDistanceFt", selector1: "Weapon", selector2: "30", value: 0 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Parry", value: 1 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Quick", value: 2 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Thrown", value: -10 },
], 1);

function damageTypes(count: number) {
  const names = ["Slashing", "Fire", "Poison", "Cold", "Lightning"];
  return names.slice(0, count).map((name) => ({ damageType: { name, attackMode: "PHYSICAL" } }));
}

function compare(input: ForgeOutputProfileInput): ForgeOutputBandComparison {
  return compareForgeOutputToBands(buildForgeOutputProfile(input), FEATURE_CONTEXT);
}

function weaponBand(input: ForgeOutputProfileInput) {
  return compare(input).weaponProfiles.find((entry) => entry.enabled);
}

function meleeInput(level: number, size: WeaponSize, strength: number, extra: Partial<ForgeOutputProfileInput> = {}): ForgeOutputProfileInput {
  return {
    level,
    rarity: "COMMON",
    type: "WEAPON",
    size,
    rangeCategories: ["MELEE"],
    meleePhysicalStrength: strength,
    meleeDamageTypes: damageTypes(1),
    meleeTargets: 1,
    ...extra,
  };
}

function rangedInput(level: number, strength: number, distanceFeet: number, extra: Partial<ForgeOutputProfileInput> = {}): ForgeOutputProfileInput {
  return {
    level,
    rarity: "COMMON",
    type: "WEAPON",
    size: "ONE_HANDED",
    rangeCategories: ["RANGED"],
    rangedPhysicalStrength: strength,
    rangedDamageTypes: damageTypes(1),
    rangedTargets: 1,
    rangedDistanceFeet: distanceFeet,
    ...extra,
  };
}

function standardishStrength(level: number, size: WeaponSize): number {
  for (let strength = 0; strength <= 10; strength += 1) {
    if (weaponBand(meleeInput(level, size, strength))?.classification === "standard") return strength;
  }
  const sample = weaponBand(meleeInput(level, size, 1));
  return Math.max(0, Math.min(10, Math.round((sample?.thresholds.standardMax ?? 4) / 2)));
}

function rowsByStrength(level: number, size: WeaponSize) {
  return Array.from({ length: 11 }, (_, strength) => {
    const bands = compare(meleeInput(level, size, strength));
    const band = bands.weaponProfiles[0];
    return {
      strength,
      wounds: strength * 2,
      band: band.classification,
      perTargetBand: band.perTargetClassification,
      totalBand: band.totalPressureClassification,
      core: bands.lanes.coreFunctionality.status,
      ratio: Number(bands.lanes.debug.corePressureRatio.toFixed(3)),
      expected: bands.lanes.debug.coreExpectedValue,
      warnings: bands.lanes.coreFunctionality.warnings,
      thresholds: band.thresholds,
    };
  });
}

function transitionSummary(rows: Array<{ strength: number; wounds: number; band: ForgeOutputBandClassification }>) {
  const firsts = new Map<string, string>();
  for (const row of rows) {
    if (!firsts.has(row.band)) firsts.set(row.band, `S${row.strength}/W${row.wounds}`);
  }
  return Array.from(firsts.entries()).map(([band, at]) => `${band}@${at}`).join(", ");
}

function statusAtFeatureWeight(level: number, rarity: Rarity, weight: number) {
  const attr = weight === 0 ? [] : [{ name: `Diagnostic ${weight}`, pricingMode: "FIXED", pricingScalar: weight, pricingMagnitude: 1 }];
  const result = compare(meleeInput(level, "ONE_HANDED", standardishStrength(level, "ONE_HANDED"), {
    rarity,
    weaponAttributes: attr,
  }));
  return {
    level,
    rarity,
    weight,
    budget: result.lanes.debug.expectedFeatureBudget,
    ratio: Number(result.lanes.debug.featurePressureRatio.toFixed(3)),
    status: result.lanes.featuresVersatility.status,
  };
}

function printSection(title: string, rows: unknown) {
  console.log(`\n## ${title}`);
  console.log(JSON.stringify(rows, null, 2));
}

function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = key(row);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

const weaponFindings = SIZES.flatMap((size) =>
  Array.from({ length: 20 }, (_, index) => {
    const level = index + 1;
    const rows = rowsByStrength(level, size);
    const standardStrengths = rows.filter((row) => row.band === "standard").map((row) => row.strength);
    const jumpWarnings = rows.slice(1).filter((row, i) => BAND_RANK[row.band] - BAND_RANK[rows[i].band] > 1);
    return {
      level,
      size,
      transitions: transitionSummary(rows),
      standardStrengths,
      standardCount: standardStrengths.length,
      jumpWarnings: jumpWarnings.map((row) => `S${row.strength}:${rows[row.strength - 1]?.band}->${row.band}`),
      thresholds: rows[1]?.thresholds,
    };
  }),
);

const noStandardWeaponRows = weaponFindings.filter((row) => row.standardCount === 0);
const narrowStandardRows = weaponFindings.filter((row) => row.standardCount === 1);
const hardJumpRows = weaponFindings.filter((row) => row.jumpWarnings.length > 0);

const damageTypeFindings = REPRESENTATIVE_LEVELS.flatMap((level) =>
  SIZES.flatMap((size) => {
    const strength = standardishStrength(level, size);
    return [1, 2, 3].map((count) => {
      const result = compare(meleeInput(level, size, strength, { meleeDamageTypes: damageTypes(count) }));
      const band = result.weaponProfiles[0];
      return {
        level,
        size,
        strength,
        damageTypes: count,
        wounds: band.totalWoundsPerSuccess,
        band: band.classification,
        core: result.lanes.coreFunctionality.status,
        features: result.lanes.featuresVersatility.status,
        featureWeight: result.lanes.debug.featureWeightTotal,
        warnings: [...result.lanes.coreFunctionality.warnings, ...result.lanes.featuresVersatility.warnings],
      };
    });
  }),
);

const targetFindings = REPRESENTATIVE_LEVELS.flatMap((level) =>
  SIZES.flatMap((size) => {
    const strength = standardishStrength(level, size);
    return [1, 2, 3, 4, 5].map((targets) => {
      const result = compare(meleeInput(level, size, strength, { meleeTargets: targets }));
      const band = result.weaponProfiles[0];
      return {
        level,
        size,
        strength,
        targets,
        perTarget: band.totalWoundsPerSuccess,
        totalPressure: band.totalPressure,
        band: band.classification,
        core: result.lanes.coreFunctionality.status,
        features: result.lanes.featuresVersatility.status,
        featureWeight: result.lanes.debug.featureWeightTotal,
      };
    });
  }),
);

const rangedFindings = REPRESENTATIVE_LEVELS.flatMap((level) => {
  const strength = standardishStrength(level, "ONE_HANDED");
  return [30, 60, 120, 180, 300].map((distance) => {
    const result = compare(rangedInput(level, strength, distance));
    return {
      level,
      strength,
      distance,
      core: result.lanes.coreFunctionality.status,
      features: result.lanes.featuresVersatility.status,
      coreRatio: Number(result.lanes.debug.corePressureRatio.toFixed(3)),
      featureWeight: result.lanes.debug.featureWeightTotal,
      rangePressureScore: result.lanes.debug.rangePressureScore,
      rangePressureDrivers: result.lanes.debug.rangePressureDrivers,
    };
  });
});

function mixedInput(level: number, kind: string): ForgeOutputProfileInput {
  const strength = standardishStrength(level, "ONE_HANDED");
  const base = meleeInput(level, "ONE_HANDED", strength);
  if (kind === "melee") return base;
  if (kind === "ranged") return rangedInput(level, strength, 60);
  if (kind === "aoe") return { ...base, rangeCategories: ["AOE"], meleePhysicalStrength: 0, aoePhysicalStrength: Math.max(1, strength - 1), aoeDamageTypes: damageTypes(1), aoeCount: 2, aoeCenterRangeFeet: 30, aoeShape: "SPHERE", aoeSphereRadiusFeet: 5 };
  if (kind === "melee+ranged access") return { ...base, rangeCategories: ["MELEE", "RANGED"], rangedDistanceFeet: 30 };
  if (kind === "melee+ranged output") return { ...base, rangeCategories: ["MELEE", "RANGED"], rangedPhysicalStrength: Math.max(1, strength - 1), rangedDamageTypes: damageTypes(1), rangedDistanceFeet: 30 };
  if (kind === "melee+aoe output") return { ...base, rangeCategories: ["MELEE", "AOE"], aoePhysicalStrength: Math.max(1, strength - 1), aoeDamageTypes: damageTypes(1), aoeCount: 2, aoeCenterRangeFeet: 30, aoeShape: "SPHERE", aoeSphereRadiusFeet: 5 };
  if (kind === "ranged+aoe output") return { ...base, rangeCategories: ["RANGED", "AOE"], meleePhysicalStrength: 0, rangedPhysicalStrength: strength, rangedDamageTypes: damageTypes(1), rangedDistanceFeet: 60, aoePhysicalStrength: Math.max(1, strength - 1), aoeDamageTypes: damageTypes(1), aoeCount: 2, aoeCenterRangeFeet: 30, aoeShape: "SPHERE", aoeSphereRadiusFeet: 5 };
  return { ...base, rangeCategories: ["MELEE", "RANGED", "AOE"], rangedPhysicalStrength: Math.max(1, strength - 1), rangedDamageTypes: damageTypes(1), rangedDistanceFeet: 60, aoePhysicalStrength: Math.max(1, strength - 1), aoeDamageTypes: damageTypes(1), aoeCount: 2, aoeCenterRangeFeet: 30, aoeShape: "SPHERE", aoeSphereRadiusFeet: 5 };
}

const mixedKinds = ["melee", "ranged", "aoe", "melee+ranged access", "melee+ranged output", "melee+aoe output", "ranged+aoe output", "all three output"];
const mixedFindings = REPRESENTATIVE_LEVELS.flatMap((level) =>
  mixedKinds.map((kind) => {
    const profile = buildForgeOutputProfile(mixedInput(level, kind));
    const result = compareForgeOutputToBands(profile, FEATURE_CONTEXT);
    return {
      level,
      kind,
      active: profile.attackAccess.activeProfileKinds,
      extraProfiles: profile.attackAccess.extraProfileCount,
      core: result.lanes.coreFunctionality.status,
      coreRatio: Number(result.lanes.debug.corePressureRatio.toFixed(3)),
      secondaryCore: Number(result.lanes.debug.secondaryProfileCoreContribution.toFixed(3)),
      features: result.lanes.featuresVersatility.status,
      featureWeight: result.lanes.debug.featureWeightTotal,
      mixedDrivers: result.lanes.featuresVersatility.mainDrivers.filter((entry) => /mixed|attack access|AoE/.test(entry)),
    };
  }),
);

const aoeCases = [
  { name: "small sphere", aoeCount: 2, aoeCenterRangeFeet: 30, aoeShape: "SPHERE", aoeSphereRadiusFeet: 5 },
  { name: "medium sphere", aoeCount: 3, aoeCenterRangeFeet: 30, aoeShape: "SPHERE", aoeSphereRadiusFeet: 10 },
  { name: "large sphere", aoeCount: 5, aoeCenterRangeFeet: 120, aoeShape: "SPHERE", aoeSphereRadiusFeet: 20 },
  { name: "cone", aoeCount: 3, aoeCenterRangeFeet: 30, aoeShape: "CONE", aoeConeLengthFeet: 30 },
  { name: "line", aoeCount: 3, aoeCenterRangeFeet: 30, aoeShape: "LINE", aoeLineWidthFeet: 10, aoeLineLengthFeet: 60 },
] as const;
const aoeFindings = REPRESENTATIVE_LEVELS.flatMap((level) =>
  aoeCases.map((aoeCase) => {
    const strength = Math.max(1, standardishStrength(level, "ONE_HANDED") - 1);
    const result = compare({
      level,
      rarity: "COMMON",
      type: "WEAPON",
      rangeCategories: ["AOE"],
      aoePhysicalStrength: strength,
      aoeDamageTypes: damageTypes(1),
      ...aoeCase,
    });
    const band = result.weaponProfiles[0];
    return {
      level,
      case: aoeCase.name,
      strength,
      wounds: band.totalWoundsPerSuccess,
      targets: band.targetCount,
      totalPressure: band.totalPressure,
      band: band.classification,
      core: result.lanes.coreFunctionality.status,
      features: result.lanes.featuresVersatility.status,
      featureWeight: result.lanes.debug.featureWeightTotal,
      aoeDrivers: result.lanes.debug.featureWeightDrivers.filter((entry) => /AoE/.test(entry.label)).map((entry) => `${entry.label}:${entry.weight}`),
    };
  }),
);

function defenceRows(metric: "ppv" | "mpv", level: number) {
  return Array.from({ length: 31 }, (_, value) => {
    const result = compare({ level, rarity: "COMMON", type: "ARMOR", [metric]: value });
    const band = result.defensive[metric];
    return {
      value,
      band: band.classification,
      core: result.lanes.coreFunctionality.status,
      ratio: Number(result.lanes.debug.corePressureRatio.toFixed(3)),
      expected: result.lanes.debug.coreExpectedValue,
      thresholds: band.thresholds,
    };
  });
}

const defenceFindings = Array.from({ length: 20 }, (_, index) => index + 1).flatMap((level) =>
  (["ppv", "mpv"] as const).map((metric) => {
    const rows = defenceRows(metric, level);
    return {
      level,
      metric,
      transitions: transitionSummary(rows.map((row) => ({ ...row, strength: row.value, wounds: row.value, warnings: [] }))),
      standardValues: rows.filter((row) => row.band === "standard").map((row) => row.value),
      thresholds: rows[1]?.thresholds,
    };
  }),
);

const shieldFindings = REPRESENTATIVE_LEVELS.flatMap((level) => {
  const standard = standardishStrength(level, "SMALL");
  const cases: Array<[string, ForgeOutputProfileInput]> = [
    ["defence only", { level, rarity: "COMMON", type: "SHIELD", size: "SMALL", ppv: 2, mpv: 1 }],
    ["low attack + defence", { ...meleeInput(level, "SMALL", Math.max(1, standard - 1)), type: "SHIELD", shieldHasAttack: true, ppv: 1, mpv: 1 }],
    ["standard attack + defence", { ...meleeInput(level, "SMALL", standard), type: "SHIELD", shieldHasAttack: true, ppv: 2, mpv: 1 }],
    ["high attack + defence", { ...meleeInput(level, "SMALL", Math.min(10, standard + 2)), type: "SHIELD", shieldHasAttack: true, ppv: 4, mpv: 3 }],
    ["attack only", { ...meleeInput(level, "SMALL", standard), type: "SHIELD", shieldHasAttack: true }],
    ["PPV-heavy", { level, rarity: "COMMON", type: "SHIELD", size: "SMALL", ppv: 10, mpv: 0 }],
    ["MPV-heavy", { level, rarity: "COMMON", type: "SHIELD", size: "SMALL", ppv: 0, mpv: 10 }],
    ["mixed PPV/MPV", { level, rarity: "COMMON", type: "SHIELD", size: "SMALL", ppv: 6, mpv: 6 }],
  ];
  return cases.map(([name, input]) => {
    const result = compare(input);
    return {
      level,
      case: name,
      warning: result.shield.shieldSplitWarningLevel,
      core: result.lanes.coreFunctionality.status,
      features: result.lanes.featuresVersatility.status,
      notes: result.shield.notes,
      coreWarnings: result.lanes.coreFunctionality.warnings,
    };
  });
});

const rarityFindings = RARITIES.flatMap((rarity) =>
  REPRESENTATIVE_LEVELS.flatMap((level) =>
    [0, 5, 10, 15, 25, 40, 60].map((weight) => statusAtFeatureWeight(level, rarity, weight)),
  ),
);

const drawbackCases: Array<[string, ForgeOutputProfileInput]> = [
  ["positive feature", meleeInput(5, "ONE_HANDED", 3, { weaponAttributeNames: ["Quick"] })],
  ["negative feature", meleeInput(5, "ONE_HANDED", 3, { weaponAttributeNames: ["Thrown"] })],
  ["positive + negative", meleeInput(5, "ONE_HANDED", 3, { weaponAttributeNames: ["Parry", "Quick", "Thrown"] })],
  ["multiple negatives", meleeInput(5, "ONE_HANDED", 3, { weaponAttributes: [{ name: "Drawback A", pricingMode: "FIXED", pricingScalar: -10, pricingMagnitude: 1 }, { name: "Drawback B", pricingMode: "FIXED", pricingScalar: -5, pricingMagnitude: 1 }] })],
  ["negative on over-band core", meleeInput(1, "SMALL", 10, { weaponAttributeNames: ["Thrown"] })],
];
const drawbackFindings = drawbackCases.map(([name, input]) => {
  const result = compare(input);
  return {
    case: name,
    raw: result.lanes.debug.featureWeightTotalRaw,
    clamped: result.lanes.debug.featureWeightTotal,
    features: result.lanes.featuresVersatility.status,
    core: result.lanes.coreFunctionality.status,
    warnings: [...result.lanes.coreFunctionality.warnings, ...result.lanes.featuresVersatility.warnings],
  };
});

const mismatches = [
  {
    severity: "high",
    class: "Ranged/AoE geometry issue",
    evidence: "AoE feature totals are heavy even for moderate/large examples, but shape size currently uses one flat geometry expectation per dimension instead of scaling from seeded area rows.",
    affected: "AoE geometry sweep, especially large sphere/cone/line across representative levels.",
    nextAction: "tune admin value or add more granular ForgeOutputExpectation rows if flat geometry proves too blunt",
  },
  {
    severity: "medium",
    class: "Features budget issue",
    evidence: "Common reaches moderate around feature weight 10-12 by level; Rare/Legendary/Mythic leave considerable headroom because per-five-level scaling is modest.",
    affected: "Rarity budget sweep across L1/L5/L10/L15/L20.",
    nextAction: "tune admin value after deciding intended rarity breadth ceiling",
  },
  {
    severity: "medium",
    class: "Shield split issue",
    evidence: "Attack+defence shields mostly produce watch unless both sides reach high-or-better; high attack plus low/moderate defence can still be heavy Core but not likelyOverloaded.",
    affected: "Shield attack+defence at representative levels.",
    nextAction: "leave as acceptable v1 or adjust code constant/rule if shields should be stricter",
  },
  {
    severity: "medium",
    class: "Target count issue",
    evidence: "Core rises sharply from total pressure while Features adds only +1 per extra target; multi-target may be priced mostly by Core today.",
    affected: "Targets 2-5 across sizes and representative levels.",
    nextAction: "tune admin value for targetCount.extraTarget if feature pressure should carry more of the burden",
  },
  {
    severity: "low",
    class: "Level scaling issue",
    evidence: "Strength is integer and wounds move in steps of 2, so several levels have one-strength-wide Standard windows.",
    affected: narrowStandardRows.slice(0, 12).map((row) => `L${row.level} ${row.size}`).join(", "),
    nextAction: "leave as acceptable v1 unless authoring needs smoother level-by-level steps",
  },
  {
    severity: "low",
    class: "test coverage gap",
    evidence: "The smoke script covers representatives, not the full 1-20 matrix.",
    affected: "Regression coverage for level/size sweeps.",
    nextAction: "keep this report script and optionally add a thin CI diagnostic later",
  },
];

printSection("Executive Summary", {
  weapon: {
    noStandardRows: noStandardWeaponRows.length,
    oneStrengthStandardRows: narrowStandardRows.length,
    hardJumpRows: hardJumpRows.length,
    representativeTransitions: weaponFindings
      .filter((row) => REPRESENTATIVE_LEVELS.includes(row.level))
      .map((row) => `${row.size} L${row.level}: ${row.transitions}`),
  },
  damageTypes: {
    coreByDamageTypeCount: countBy(damageTypeFindings, (row) => `${row.damageTypes}:${row.core}`),
    featureWeightsByDamageTypeCount: Array.from(new Set(damageTypeFindings.map((row) => `${row.damageTypes}->${row.featureWeight}`))),
  },
  targetCounts: {
    coreByTargetCount: countBy(targetFindings, (row) => `${row.targets}:${row.core}`),
    featureWeightsByTargetCount: Array.from(new Set(targetFindings.map((row) => `${row.targets}->${row.featureWeight}`))),
  },
  rangedDistance: {
    coreByDistance: countBy(rangedFindings, (row) => `${row.distance}:${row.core}`),
    featureWeightsByDistance: Array.from(new Set(rangedFindings.map((row) => `${row.distance}->${row.featureWeight}`))),
    rangeScoresByDistance: Array.from(new Set(rangedFindings.map((row) => `${row.distance}->${row.rangePressureScore}`))),
  },
  mixedAccess: mixedFindings
    .filter((row) => row.level === 5)
    .map((row) => ({
      kind: row.kind,
      active: row.active,
      extraProfiles: row.extraProfiles,
      core: row.core,
      coreRatio: row.coreRatio,
      secondaryCore: row.secondaryCore,
      features: row.features,
      featureWeight: row.featureWeight,
    })),
  aoe: {
    coreByCase: countBy(aoeFindings, (row) => `${row.case}:${row.core}`),
    featuresByCase: countBy(aoeFindings, (row) => `${row.case}:${row.features}`),
    featureWeightRange: {
      min: Math.min(...aoeFindings.map((row) => row.featureWeight)),
      max: Math.max(...aoeFindings.map((row) => row.featureWeight)),
    },
  },
  defence: defenceFindings
    .filter((row) => REPRESENTATIVE_LEVELS.includes(row.level))
    .map((row) => ({
      level: row.level,
      metric: row.metric,
      transitions: row.transitions,
      standardValues: row.standardValues,
    })),
  shield: {
    warnings: countBy(shieldFindings, (row) => `${row.case}:${row.warning}`),
    core: countBy(shieldFindings, (row) => `${row.case}:${row.core}`),
  },
  rarityBudgets: RARITIES.flatMap((rarity) =>
    REPRESENTATIVE_LEVELS.map((level) => {
      const rows = rarityFindings.filter((row) => row.rarity === rarity && row.level === level);
      return {
        rarity,
        level,
        budget: rows[0]?.budget,
        firstModerate: rows.find((row) => row.status === "moderate")?.weight ?? null,
        firstBroad: rows.find((row) => row.status === "broad")?.weight ?? null,
        firstHeavy: rows.find((row) => row.status === "heavy")?.weight ?? null,
      };
    }),
  ),
  drawbacks: drawbackFindings,
});

printSection("Repo-Free Diagnostic Context", {
  note: "Report-only matrix generated from buildForgeOutputProfile + compareForgeOutputToBands. No DB access.",
  levels: "1-20",
  sizes: SIZES,
  representativeLevels: REPRESENTATIVE_LEVELS,
  rarities: RARITIES,
});
printSection("Weapon Core Sweep Summary", {
  noStandardWeaponRows,
  narrowStandardRows: narrowStandardRows.slice(0, 20),
  hardJumpRows: hardJumpRows.slice(0, 20),
  samples: weaponFindings.filter((row) => REPRESENTATIVE_LEVELS.includes(row.level)),
});
printSection("Damage Type Sweep", damageTypeFindings);
printSection("Target Count Sweep", targetFindings);
printSection("Ranged Distance Sweep", rangedFindings);
printSection("Mixed Access/Profile Sweep", mixedFindings);
printSection("AoE Geometry Sweep", aoeFindings);
printSection("Armour Defence Sweep Summary", {
  samples: defenceFindings.filter((row) => REPRESENTATIVE_LEVELS.includes(row.level)),
});
printSection("Shield Split Sweep", shieldFindings);
printSection("Rarity Features Budget Sweep", rarityFindings);
printSection("Negative Drawback Sweep", drawbackFindings);
printSection("Ranked Candidate Mismatches", mismatches);
