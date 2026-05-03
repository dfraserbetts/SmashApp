import {
  buildForgeOutputProfile,
  type ForgeOutputProfileInput,
} from "../lib/forge/outputProfile";
import {
  buildForgeFeatureWeightContext,
  compareForgeOutputToBands,
  type ForgeOutputBandClassification,
  type ForgeOutputBandComparison,
  type ForgeFeatureWeightDriver,
  type ForgeLaneStatus,
} from "../lib/forge/outputBands";
import type { WeaponSize } from "../lib/forge/types";

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "LEGENDARY" | "MYTHIC";
type Archetype = "SUPER_SIMPLE" | "COMPROMISE" | "MIN_MAX";
type ProfileKind =
  | "melee single profile"
  | "ranged single profile"
  | "AoE profile"
  | "melee + ranged"
  | "ranged + AoE"
  | "melee + ranged + AoE";
type Verdict = "legal" | "watch" | "likely exploit" | "over-band";

const LEVELS = [1, 5, 10, 15, 20];
const RARITIES: Rarity[] = ["COMMON", "UNCOMMON", "RARE", "LEGENDARY", "MYTHIC"];
const SIZES: WeaponSize[] = ["SMALL", "ONE_HANDED", "TWO_HANDED"];
const PROFILES: ProfileKind[] = [
  "melee single profile",
  "ranged single profile",
  "AoE profile",
  "melee + ranged",
  "ranged + AoE",
  "melee + ranged + AoE",
];
const ARCHETYPES: Archetype[] = ["SUPER_SIMPLE", "COMPROMISE", "MIN_MAX"];

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

const VERDICT_RANK: Record<Verdict, number> = {
  legal: 0,
  watch: 1,
  "likely exploit": 2,
  "over-band": 3,
};

const FEATURE_CONTEXT = buildForgeFeatureWeightContext([
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.COMMON", value: 10 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.UNCOMMON", value: 14 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.RARE", value: 22 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.LEGENDARY", value: 30 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.MYTHIC", value: 40 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.levelScale.perLevel", value: 0 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.levelScale.perFiveLevels", value: 2 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.size.SMALL.multiplier", value: 0.75 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.size.ONE_HANDED.multiplier", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.size.TWO_HANDED.multiplier", value: 1.25 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.status.moderateRatio", value: 0.36 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.status.broadRatio", value: 0.61 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.status.heavyRatio", value: 0.8 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.featureCount.each", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.extraProfile", value: 2 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.mixedAccess.meleeRanged", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.mixedAccess.meleeAoe", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.mixedAccess.rangedAoe", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.mixedAccess.allThree", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.targetCount.extraTarget", value: 2 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.damageType.extraType", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.rangedDistance.31to60", value: 3 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.rangedDistance.61to120", value: 6 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.rangedDistance.121plus", value: 10 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.aoe.access", value: 5 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.aoe.extraCount", value: 3 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.aoe.centerRange", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.aoe.geometry", value: 3 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.shieldSplit.attackDefence", value: 10 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "core.weapon.rangeMode.RANGED.multiplier", value: 0.8 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Parry", value: 1 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Quick", value: 2 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Returning", value: 12 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Expensive", value: 25 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Thrown", value: -10 },
  { category: "GS_AttackEffects", selector1: "Weapon", selector2: "Melee", selector3: "Stagger", value: 15 },
  { category: "GS_AttackEffects", selector1: "Weapon", selector2: "Ranged", selector3: "Stagger", value: 15 },
  { category: "GS_AttackEffects", selector1: "Weapon", selector2: "AoE", selector3: "Stagger", value: 15 },
  { category: "Attribute", selector1: "Weapon", selector2: "Attack", selector3: "1", value: 8 },
  { category: "Attribute", selector1: "Weapon", selector2: "Attack", selector3: "2", value: 20 },
  { category: "RangedDistanceFt", selector1: "Weapon", selector2: "30", value: 0 },
  { category: "RangedDistanceFt", selector1: "Weapon", selector2: "60", value: 1 },
  { category: "RangedDistanceFt", selector1: "Weapon", selector2: "120", value: 2 },
  { category: "RangedDistanceFt", selector1: "Weapon", selector2: "200", value: 3 },
  { category: "SphereSizeFt", selector1: "Weapon", selector2: "10", value: 2.25 },
], 1);

function damageTypes(count: number) {
  const names = ["Slashing", "Fire", "Poison", "Cold", "Lightning"];
  return names.slice(0, count).map((name) => ({ damageType: { name, attackMode: "PHYSICAL" } }));
}

function run(input: ForgeOutputProfileInput): ForgeOutputBandComparison {
  return compareForgeOutputToBands(buildForgeOutputProfile(input), FEATURE_CONTEXT);
}

function getPrimaryBand(result: ForgeOutputBandComparison) {
  return result.weaponProfiles.find((entry) => entry.enabled) ?? null;
}

function standardishStrength(level: number, size: WeaponSize, profileKind: ProfileKind): number {
  const attempts = Array.from({ length: 10 }, (_, index) => index + 1);
  for (const strength of attempts) {
    const band = getPrimaryBand(run(baseInput(level, "COMMON", size, profileKind, strength)));
    if (band?.classification === "standard") return strength;
  }
  return 3;
}

function baseInput(
  level: number,
  rarity: Rarity,
  size: WeaponSize,
  profileKind: ProfileKind,
  strengthOverride?: number,
): ForgeOutputProfileInput {
  const strength = strengthOverride ?? 3;
  const base: ForgeOutputProfileInput = {
    level,
    rarity,
    type: "WEAPON",
    size,
  };

  if (profileKind === "melee single profile") {
    return {
      ...base,
      rangeCategories: ["MELEE"],
      meleePhysicalStrength: strength,
      meleeDamageTypes: damageTypes(1),
      meleeTargets: 1,
    };
  }
  if (profileKind === "ranged single profile") {
    return {
      ...base,
      rangeCategories: ["RANGED"],
      rangedPhysicalStrength: strength,
      rangedDamageTypes: damageTypes(1),
      rangedTargets: 1,
      rangedDistanceFeet: 120,
    };
  }
  if (profileKind === "AoE profile") {
    return {
      ...base,
      rangeCategories: ["AOE"],
      aoePhysicalStrength: strength,
      aoeDamageTypes: damageTypes(1),
      aoeCount: 1,
      aoeCenterRangeFeet: 30,
      aoeShape: "SPHERE",
      aoeSphereRadiusFeet: 5,
    };
  }
  if (profileKind === "melee + ranged") {
    return {
      ...base,
      rangeCategories: ["MELEE", "RANGED"],
      meleePhysicalStrength: strength,
      meleeDamageTypes: damageTypes(1),
      meleeTargets: 1,
      rangedPhysicalStrength: Math.max(1, strength - 1),
      rangedDamageTypes: damageTypes(1),
      rangedTargets: 1,
      rangedDistanceFeet: 60,
    };
  }
  if (profileKind === "ranged + AoE") {
    return {
      ...base,
      rangeCategories: ["RANGED", "AOE"],
      rangedPhysicalStrength: strength,
      rangedDamageTypes: damageTypes(1),
      rangedTargets: 1,
      rangedDistanceFeet: 120,
      aoePhysicalStrength: Math.max(1, strength - 1),
      aoeDamageTypes: damageTypes(1),
      aoeCount: 2,
      aoeCenterRangeFeet: 30,
      aoeShape: "SPHERE",
      aoeSphereRadiusFeet: 10,
    };
  }
  return {
    ...base,
    rangeCategories: ["MELEE", "RANGED", "AOE"],
    meleePhysicalStrength: strength,
    meleeDamageTypes: damageTypes(1),
    meleeTargets: 1,
    rangedPhysicalStrength: Math.max(1, strength - 1),
    rangedDamageTypes: damageTypes(1),
    rangedTargets: 1,
    rangedDistanceFeet: 60,
    aoePhysicalStrength: Math.max(1, strength - 1),
    aoeDamageTypes: damageTypes(1),
    aoeCount: 2,
    aoeCenterRangeFeet: 30,
    aoeShape: "SPHERE",
    aoeSphereRadiusFeet: 10,
  };
}

function applyArchetype(
  base: ForgeOutputProfileInput,
  archetype: Archetype,
  profileKind: ProfileKind,
): ForgeOutputProfileInput {
  const rangedActive = (base.rangeCategories ?? []).includes("RANGED");
  const aoeActive = (base.rangeCategories ?? []).includes("AOE");
  const meleeActive = (base.rangeCategories ?? []).includes("MELEE");

  if (archetype === "SUPER_SIMPLE") {
    if (profileKind === "melee single profile" || profileKind === "ranged single profile") {
      return { ...base, weaponAttributeNames: ["Parry"] };
    }
    return { ...base };
  }

  if (archetype === "COMPROMISE") {
    return {
      ...base,
      weaponAttributeNames: ["Parry", "Quick", "Thrown"],
      ...(meleeActive ? { attackEffectMeleeNames: ["Stagger"] } : {}),
      ...(rangedActive ? { attackEffectRangedNames: ["Stagger"] } : {}),
      ...(aoeActive ? { attackEffectAoENames: ["Stagger"] } : {}),
    };
  }

  return {
    ...base,
    weaponAttributeNames: ["Expensive", "Returning", "Quick", "Parry", "Thrown"],
    globalAttributeModifiers: [{ attribute: "Attack", amount: 2 }],
    customItemAttributes: "volatile channels",
    ...(meleeActive ? { attackEffectMeleeNames: ["Stagger"] } : {}),
    ...(rangedActive ? { attackEffectRangedNames: ["Stagger"] } : {}),
    ...(aoeActive ? { attackEffectAoENames: ["Stagger"] } : {}),
  };
}

function isBreadthDriver(driver: ForgeFeatureWeightDriver): boolean {
  return (
    driver.label.includes("Ranged distance") ||
    driver.label.includes("AoE") ||
    driver.label.includes("mixed ") ||
    driver.label.includes("attack access") ||
    driver.label.includes("all three attack modes") ||
    driver.label.includes("damage types") ||
    driver.label.includes("targets") ||
    driver.label.includes("shield attack + defence split")
  );
}

function deriveVerdict(result: ForgeOutputBandComparison): Verdict {
  if (
    result.weaponProfiles.some((entry) => entry.classification === "over-band") ||
    result.lanes.coreFunctionality.status === "likely overloaded"
  ) {
    return "over-band";
  }

  const negativeDriverCount = result.lanes.debug.featureWeightDrivers.filter((entry) => entry.weight < 0).length;
  if (
    negativeDriverCount > 0 &&
    result.lanes.debug.featureWeightTotalRaw <= 0 &&
    result.lanes.debug.featureCount >= 4
  ) {
    return "likely exploit";
  }

  if (
    negativeDriverCount >= 2 &&
    STATUS_RANK[result.lanes.featuresVersatility.status] >= STATUS_RANK.broad &&
    result.lanes.debug.featureCount >= 5
  ) {
    return "likely exploit";
  }

  if (
    negativeDriverCount > 0 &&
    result.lanes.debug.featureCount >= 8 &&
    STATUS_RANK[result.lanes.featuresVersatility.status] >= STATUS_RANK.heavy
  ) {
    return "likely exploit";
  }

  if (
    result.lanes.coreFunctionality.warnings.length > 0 ||
    result.lanes.featuresVersatility.warnings.length > 0 ||
    STATUS_RANK[result.lanes.coreFunctionality.status] >= STATUS_RANK.broad ||
    STATUS_RANK[result.lanes.featuresVersatility.status] >= STATUS_RANK.broad
  ) {
    return "watch";
  }

  return "legal";
}

type MatrixRow = {
  archetype: Archetype;
  level: number;
  rarity: Rarity;
  size: WeaponSize;
  profile: ProfileKind;
  coreStatus: ForgeLaneStatus;
  coreRatio: number;
  featuresStatus: ForgeLaneStatus;
  featuresRatio: number;
  featureWeightTotalRaw: number;
  featureWeightTotalClamped: number;
  featureCount: number;
  featureCountComplexityTotal: number;
  expectedFeatureBudget: number;
  positiveDrivers: string[];
  negativeDrivers: string[];
  breadthDrivers: string[];
  warnings: string[];
  verdict: Verdict;
};

const rows: MatrixRow[] = [];

for (const archetype of ARCHETYPES) {
  for (const level of LEVELS) {
    for (const rarity of RARITIES) {
      for (const size of SIZES) {
        for (const profile of PROFILES) {
          const strength = standardishStrength(level, size, profile);
          const result = run(applyArchetype(baseInput(level, rarity, size, profile, strength), archetype, profile));
          rows.push({
            archetype,
            level,
            rarity,
            size,
            profile,
            coreStatus: result.lanes.coreFunctionality.status,
            coreRatio: Number(result.lanes.debug.corePressureRatio.toFixed(3)),
            featuresStatus: result.lanes.featuresVersatility.status,
            featuresRatio: Number(result.lanes.debug.featurePressureRatio.toFixed(3)),
            featureWeightTotalRaw: result.lanes.debug.featureWeightTotalRaw,
            featureWeightTotalClamped: result.lanes.debug.featureWeightTotalClamped,
            featureCount: result.lanes.debug.featureCount,
            featureCountComplexityTotal: result.lanes.debug.featureCountComplexityTotal,
            expectedFeatureBudget: Number(result.lanes.debug.expectedFeatureBudget.toFixed(3)),
            positiveDrivers: result.lanes.debug.featureWeightDrivers
              .filter((entry) => entry.weight > 0 && !isBreadthDriver(entry))
              .map((entry) => `${entry.label} (${entry.weight})`),
            negativeDrivers: result.lanes.debug.featureWeightDrivers
              .filter((entry) => entry.weight < 0)
              .map((entry) => `${entry.label} (${entry.weight})`),
            breadthDrivers: result.lanes.debug.featureWeightDrivers
              .filter((entry) => isBreadthDriver(entry))
              .map((entry) => `${entry.label} (${entry.weight})`),
            warnings: [...result.lanes.coreFunctionality.warnings, ...result.lanes.featuresVersatility.warnings],
            verdict: deriveVerdict(result),
          });
        }
      }
    }
  }
}

const verdictCounts = rows.reduce<Record<string, number>>((acc, row) => {
  const key = `${row.archetype}:${row.verdict}`;
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

const topLoopholes = [...rows]
  .filter((row) => row.verdict === "likely exploit" || row.verdict === "over-band")
  .sort((a, b) => {
    const verdictDelta = VERDICT_RANK[b.verdict] - VERDICT_RANK[a.verdict];
    if (verdictDelta !== 0) return verdictDelta;
    const ratioDelta = b.featuresRatio - a.featuresRatio;
    if (ratioDelta !== 0) return ratioDelta;
    return b.featureCount - a.featureCount;
  })
  .slice(0, 12);

const matrixSummary = {
  generatedAt: new Date().toISOString(),
  rowCount: rows.length,
  verdictCounts,
  examples: {
    superSimple: rows.filter((row) => row.archetype === "SUPER_SIMPLE").slice(0, 6),
    compromise: rows.filter((row) => row.archetype === "COMPROMISE").slice(0, 6),
    minMax: rows.filter((row) => row.archetype === "MIN_MAX").slice(0, 6),
  },
  topLoopholes,
};

console.log(JSON.stringify(matrixSummary, null, 2));
