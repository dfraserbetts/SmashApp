import assert from "node:assert/strict";

import {
  buildForgeOutputProfile,
  type ForgeOutputProfile,
  type ForgeOutputProfileInput,
} from "../lib/forge/outputProfile";
import {
  buildForgeExpectationContext,
  buildForgeFeatureWeightContext,
  compareForgeOutputToBands,
} from "../lib/forge/outputBands";

function getProfile(profile: ForgeOutputProfile, kind: "melee" | "ranged" | "aoe") {
  const found = profile.attackProfiles.find((entry) => entry.profileKind === kind);
  assert.ok(found, `Missing ${kind} profile`);
  return found;
}

const BAND_RANK = {
  below: 0,
  low: 1,
  standard: 2,
  high: 3,
  extreme: 4,
  "over-band": 5,
} as const;

const LANE_STATUS_PERCENT = {
  narrow: 25,
  moderate: 50,
  broad: 75,
  heavy: 100,
  "likely overloaded": 100,
} as const;

const FEATURE_WEIGHT_CONTEXT = buildForgeFeatureWeightContext([
  { category: "GS_AttackEffects", selector1: "Weapon", selector2: "Melee", selector3: "Stagger", value: 15 },
  { category: "Attribute", selector1: "Weapon", selector2: "Attack", selector3: "2", value: 20 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Parry", value: 1 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Quick", value: 2 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Returning", value: 12 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Expensive", value: 25 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Thrown", value: -10 },
  { category: "RangeCategory", selector1: "Weapon", selector2: "Ranged", value: 2 },
  { category: "RangeCategory", selector1: "Weapon", selector2: "AoE", value: 5 },
  { category: "RangedDistanceFt", selector1: "Weapon", selector2: "30", value: 0 },
  { category: "RangedDistanceFt", selector1: "Weapon", selector2: "60", value: 1 },
  { category: "RangedDistanceFt", selector1: "Weapon", selector2: "120", value: 2 },
  { category: "AoECount", selector1: "Weapon", selector2: "3", value: 3 },
  { category: "AoECenterRangeFt", selector1: "Weapon", selector2: "30", value: 1 },
  { category: "SphereSizeFt", selector1: "Weapon", selector2: "10", value: 2.25 },
], 1);

const RARE_LENIENT_EXPECTATION_CONTEXT = buildForgeExpectationContext([
  ...FEATURE_WEIGHT_CONTEXT.costs,
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.RARE", value: 40 },
], undefined, 1);

const COMMON_HIGH_BUDGET_CONTEXT = buildForgeExpectationContext([
  ...FEATURE_WEIGHT_CONTEXT.costs,
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.COMMON", value: 50 },
], undefined, 1);

const COMMON_LOW_MODERATE_THRESHOLD_CONTEXT = buildForgeExpectationContext([
  ...FEATURE_WEIGHT_CONTEXT.costs,
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.status.moderateRatio", value: 0.25 },
], undefined, 1);

const COMMON_LOW_BROAD_THRESHOLD_CONTEXT = buildForgeExpectationContext([
  ...FEATURE_WEIGHT_CONTEXT.costs,
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.status.moderateRatio", value: 0.1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.status.broadRatio", value: 0.25 },
], undefined, 1);

const COMMON_LOW_HEAVY_THRESHOLD_CONTEXT = buildForgeExpectationContext([
  ...FEATURE_WEIGHT_CONTEXT.costs,
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.status.moderateRatio", value: 0.1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.status.broadRatio", value: 0.2 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.status.heavyRatio", value: 0.25 },
], undefined, 1);

const CORE_MULTIPLIER_CONTEXT = buildForgeExpectationContext([
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "core.weapon.size.SMALL.multiplier", value: 2 },
], undefined, 1);

function runCase(name: string, input: ForgeOutputProfileInput): ForgeOutputProfile {
  const profile = buildForgeOutputProfile(input);
  assert.equal(profile.debug.source, "forge_output_profile_v1", `${name}: debug source`);
  assert.equal(
    profile.debug.strengthRule,
    "Strength x 2 table-facing wounds per success",
    `${name}: strength rule`,
  );
  assert.equal(profile.debug.noBandComparisonYet, true, `${name}: no band comparison flag`);
  return profile;
}

const simpleMelee = runCase("simple melee", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
});
const simpleMeleeProfile = getProfile(simpleMelee, "melee");
assert.equal(simpleMeleeProfile.physicalWoundsPerSuccess, 6, "Strength 3 should render as 6 wounds");
assert.equal(simpleMeleeProfile.totalPhysicalWoundsPerSuccess, 6);
assert.equal(simpleMeleeProfile.totalWoundsPerSuccess, 6);
assert.equal(simpleMeleeProfile.targetCount, 1);
assert.deepEqual(simpleMelee.attackAccess.enabledRangeCategories, ["MELEE"]);
assert.deepEqual(simpleMelee.attackAccess.activeProfileKinds, ["melee"]);
assert.equal(simpleMelee.attackAccess.extraProfileCount, 0);
const simpleMeleeBands = compareForgeOutputToBands(simpleMelee);
const simpleMeleeBand = simpleMeleeBands.weaponProfiles.find((entry) => entry.profileKind === "melee");
assert.equal(simpleMeleeBands.debug.source, "forge_output_bands_v1");
assert.equal(simpleMeleeBands.debug.bandSet, "natural_baseline_v1");
assert.equal(simpleMeleeBands.debug.reportOnly, true);
assert.equal(simpleMeleeBands.debug.noSaveBlocking, true);
assert.equal(simpleMeleeBand?.bandSize, "ONE_HANDED");
assert.equal(simpleMeleeBand?.bandSizeSource, "item_size");
assert.equal(simpleMeleeBand?.classification, "standard");
assert.equal(simpleMeleeBands.lanes.debug.source, "forge_output_lanes_v1");
assert.equal(simpleMeleeBands.lanes.debug.reportOnly, true);
assert.equal(simpleMeleeBands.lanes.coreFunctionality.status, "moderate");
assert.equal(simpleMeleeBands.lanes.featuresVersatility.status, "narrow");
assert.ok(
  simpleMeleeBands.lanes.coreFunctionality.mainDrivers.some((entry) => entry.includes("weapon throughput")),
  "simple melee should read as core-focused",
);
const weightedSimpleMeleeBands = compareForgeOutputToBands(simpleMelee, FEATURE_WEIGHT_CONTEXT);
assert.equal(
  weightedSimpleMeleeBands.weaponProfiles.find((entry) => entry.profileKind === "melee")?.classification,
  simpleMeleeBand?.classification,
  "Feature weights must not change Core Functionality weapon bands",
);
assert.equal(weightedSimpleMeleeBands.lanes.coreFunctionality.status, simpleMeleeBands.lanes.coreFunctionality.status);
assert.equal(weightedSimpleMeleeBands.lanes.featuresVersatility.status, "narrow");
const simpleMeleeFeatureRatio = weightedSimpleMeleeBands.lanes.debug.featurePressureRatio;
assert.equal(weightedSimpleMeleeBands.lanes.debug.featureWeightTotal, 0);
assert.equal(weightedSimpleMeleeBands.lanes.debug.featureStatusSource, "forge_values_weighted");
assert.equal(weightedSimpleMeleeBands.lanes.debug.expectedFeatureBudget, 10);
assert.equal(weightedSimpleMeleeBands.lanes.debug.featurePressureRatio, 0);
assert.equal(weightedSimpleMeleeBands.lanes.debug.featureBudgetSource, "default");
assert.equal(weightedSimpleMeleeBands.lanes.debug.coreExpectationSource, "default");
assert.equal(weightedSimpleMeleeBands.lanes.debug.expectationFallbackUsed, true);

const cheapParryAttribute = runCase("cheap parry attribute", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Parry"],
});
const cheapParryBands = compareForgeOutputToBands(cheapParryAttribute, FEATURE_WEIGHT_CONTEXT);
assert.equal(cheapParryBands.lanes.debug.featureWeightTotal, 1);
assert.equal(cheapParryBands.lanes.featuresVersatility.status, "narrow");

const expensiveSingleAttribute = runCase("expensive single attribute", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Expensive"],
});
const expensiveSingleAttributeBands = compareForgeOutputToBands(expensiveSingleAttribute, FEATURE_WEIGHT_CONTEXT);
assert.equal(expensiveSingleAttributeBands.lanes.debug.featureWeightTotal, 25);
assert.ok(
  LANE_STATUS_PERCENT[expensiveSingleAttributeBands.lanes.featuresVersatility.status] >= 75,
  "A single expensive attribute should move Features & Versatility by saved weight",
);

const expensiveRareAttribute = runCase("expensive rare attribute", {
  level: 1,
  rarity: "RARE",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Expensive"],
});
const expensiveRareBands = compareForgeOutputToBands(expensiveRareAttribute, RARE_LENIENT_EXPECTATION_CONTEXT);
assert.equal(expensiveRareBands.lanes.debug.featureWeightTotal, 25);
assert.equal(expensiveRareBands.lanes.debug.expectedFeatureBudget, 40);
assert.ok(
  expensiveSingleAttributeBands.lanes.debug.featurePressureRatio > expensiveRareBands.lanes.debug.featurePressureRatio,
  "Same feature weight should read as higher pressure on Common than Rare",
);
assert.ok(
  LANE_STATUS_PERCENT[expensiveSingleAttributeBands.lanes.featuresVersatility.status] >
    LANE_STATUS_PERCENT[expensiveRareBands.lanes.featuresVersatility.status],
  "Common feature pressure should classify higher than Rare for the same weight",
);

const expensiveHighBudgetCommonBands = compareForgeOutputToBands(expensiveSingleAttribute, COMMON_HIGH_BUDGET_CONTEXT);
assert.ok(
  COMMON_HIGH_BUDGET_CONTEXT.costs.some((row) =>
    row.category === "ItemModifiers" &&
    row.selector1 === "ForgeOutputExpectation" &&
    row.selector2 === "features.budget.COMMON" &&
    row.value === 50,
  ),
  "Forge Output Expectation rows should use the same ItemModifiers/ForgeOutputExpectation shape as Admin Forge Values",
);
assert.equal(expensiveHighBudgetCommonBands.lanes.debug.expectedFeatureBudget, 50);
assert.equal(expensiveHighBudgetCommonBands.lanes.debug.featureBudgetSource, "forge_expectation_config");
assert.ok(
  expensiveHighBudgetCommonBands.lanes.debug.featurePressureRatio <
    expensiveSingleAttributeBands.lanes.debug.featurePressureRatio,
  "Raising expectedFeatureBudget should lower featurePressureRatio",
);
assert.ok(
  LANE_STATUS_PERCENT[expensiveHighBudgetCommonBands.lanes.featuresVersatility.status] <
    LANE_STATUS_PERCENT[expensiveSingleAttributeBands.lanes.featuresVersatility.status],
  "Feature status should respond when fake Forge-Values budget changes",
);

const twoCheapAttributes = runCase("two cheap attributes", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Parry", "Quick"],
});
const twoCheapAttributeBands = compareForgeOutputToBands(twoCheapAttributes, FEATURE_WEIGHT_CONTEXT);
assert.equal(twoCheapAttributeBands.lanes.debug.featureWeightTotal, 3);
assert.equal(twoCheapAttributeBands.lanes.debug.featureWeightTotalRaw, 3);
assert.equal(
  twoCheapAttributeBands.lanes.featuresVersatility.status,
  "narrow",
  "Two cheap attributes should not automatically become Moderate by count",
);
assert.ok(
  twoCheapAttributeBands.lanes.debug.featureWeightDrivers.some((entry) =>
    entry.label.includes("Parry") && entry.weight === 1,
  ),
  "Parry should expose its saved Forge-Values weight",
);
assert.ok(
  twoCheapAttributeBands.lanes.debug.featureWeightDrivers.some((entry) =>
    entry.label.includes("Quick") && entry.weight === 2,
  ),
  "Quick should expose its saved Forge-Values weight",
);
assert.ok(
  LANE_STATUS_PERCENT[expensiveSingleAttributeBands.lanes.featuresVersatility.status] >
    LANE_STATUS_PERCENT[twoCheapAttributeBands.lanes.featuresVersatility.status],
  "One expensive attribute should push Features higher than two cheap attributes",
);
assert.equal(
  compareForgeOutputToBands(twoCheapAttributes, COMMON_LOW_MODERATE_THRESHOLD_CONTEXT).lanes.featuresVersatility.status,
  "moderate",
  "Lowering features.status.moderateRatio should move the same feature ratio to Moderate",
);
assert.equal(
  compareForgeOutputToBands(twoCheapAttributes, COMMON_LOW_BROAD_THRESHOLD_CONTEXT).lanes.featuresVersatility.status,
  "broad",
  "Lowering features.status.broadRatio should move the same feature ratio to Broad",
);
assert.equal(
  compareForgeOutputToBands(twoCheapAttributes, COMMON_LOW_HEAVY_THRESHOLD_CONTEXT).lanes.featuresVersatility.status,
  "heavy",
  "Lowering features.status.heavyRatio should move the same feature ratio to Heavy",
);

const positiveAndNegativeAttributes = runCase("positive and negative attributes", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Parry", "Quick", "Thrown"],
});
const positiveAndNegativeAttributeBands = compareForgeOutputToBands(
  positiveAndNegativeAttributes,
  FEATURE_WEIGHT_CONTEXT,
);
assert.equal(
  positiveAndNegativeAttributeBands.lanes.debug.featureWeightTotalRaw,
  -7,
  "A mapped negative feature should reduce signed featureWeightTotalRaw",
);
assert.equal(
  positiveAndNegativeAttributeBands.lanes.debug.featureWeightTotal,
  0,
  "A negative signed total should clamp the display featureWeightTotal to zero",
);
assert.equal(positiveAndNegativeAttributeBands.lanes.debug.featureWeightTotalClamped, 0);
assert.equal(
  positiveAndNegativeAttributeBands.lanes.debug.featurePressureRatio,
  0,
  "Feature pressure ratio should use the clamped total, not abs(raw)",
);
assert.equal(
  positiveAndNegativeAttributeBands.lanes.featuresVersatility.status,
  "narrow",
  "A clamped zero feature total should stay low/narrow",
);
assert.ok(
  positiveAndNegativeAttributeBands.lanes.debug.featureWeightDrivers.some((entry) =>
    entry.label.includes("Thrown") &&
    entry.weight === -10 &&
    !entry.fallbackUsed &&
    entry.note?.includes("Negative Forge-Values"),
  ),
  "Mapped -10 feature should remain signed and should not become +10 or fallback +1",
);
assert.ok(
  !positiveAndNegativeAttributeBands.lanes.debug.missingFeatureWeightDrivers.some((entry) =>
    entry.label.includes("Thrown"),
  ),
  "Mapped negative feature should not be reported as missing",
);
assert.ok(
  positiveAndNegativeAttributeBands.lanes.debug.featureWeightTotalRaw <
    twoCheapAttributeBands.lanes.debug.featureWeightTotalRaw,
  "Negative feature should decrease raw feature weight below positive-only features",
);
assert.equal(
  positiveAndNegativeAttributeBands.lanes.coreFunctionality.status,
  twoCheapAttributeBands.lanes.coreFunctionality.status,
  "Negative feature weights must not reduce Core Functionality",
);

const greaterSuccessFeature = runCase("weighted greater success", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  attackEffectsMelee: [{ attackEffect: { name: "Stagger" } }],
});
const greaterSuccessWeighted = compareForgeOutputToBands(greaterSuccessFeature, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  greaterSuccessWeighted.lanes.debug.featureWeightTotal >= 15,
  "Greater Success effect should use Forge-Values weight",
);
assert.ok(
  greaterSuccessWeighted.lanes.debug.featureWeightDrivers.some((entry) =>
    entry.label.includes("Stagger") && entry.weight === 15 && !entry.fallbackUsed,
  ),
  "Greater Success driver should expose Forge-Values weight",
);

const globalAttackModifier = runCase("weighted global attack modifier", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  globalAttributeModifiers: [{ attribute: "Attack", amount: 2 }],
});
const globalAttackWeighted = compareForgeOutputToBands(globalAttackModifier, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  globalAttackWeighted.lanes.debug.featureWeightDrivers.some((entry) =>
    entry.label.includes("Attack +2") && entry.weight === 20 && !entry.fallbackUsed,
  ),
  "Global Attack modifier should use Forge-Values weight",
);

const weightedWeaponAttribute = runCase("weighted weapon attribute", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Returning"],
});
const weightedWeaponAttributeBands = compareForgeOutputToBands(weightedWeaponAttribute, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  weightedWeaponAttributeBands.lanes.debug.featureWeightDrivers.some((entry) =>
    entry.label.includes("Returning") && entry.weight === 12 && !entry.fallbackUsed,
  ),
  "Weapon attribute should use Forge-Values weight",
);

const scalarWeaponAttribute = runCase("scalar weapon attribute", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributes: [{
    name: "Scalar Bite",
    pricingMode: "MELEE_PHYSICAL_STRENGTH",
    pricingScalar: 3,
    pricingMagnitude: 3,
  }],
});
const scalarWeaponAttributeBands = compareForgeOutputToBands(scalarWeaponAttribute, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  scalarWeaponAttributeBands.lanes.debug.featureWeightDrivers.some((entry) =>
    entry.label.includes("Scalar Bite") &&
    entry.source === "attribute_scalar/MELEE_PHYSICAL_STRENGTH" &&
    entry.weight === 9 &&
    !entry.fallbackUsed,
  ),
  "Scalar-priced weapon attribute should use pricingScalar x resolved magnitude",
);
assert.equal(scalarWeaponAttributeBands.lanes.debug.featureWeightTotal, 9);

const scalarNegativeWeaponAttribute = runCase("negative scalar weapon attribute", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributes: [{
    name: "Restrictive Grip",
    pricingMode: "MELEE_PHYSICAL_STRENGTH",
    pricingScalar: -3,
    pricingMagnitude: 3,
  }],
});
const scalarNegativeWeaponAttributeBands = compareForgeOutputToBands(
  scalarNegativeWeaponAttribute,
  FEATURE_WEIGHT_CONTEXT,
);
assert.ok(
  scalarNegativeWeaponAttributeBands.lanes.debug.featureWeightDrivers.some((entry) =>
    entry.label.includes("Restrictive Grip") &&
    entry.source === "attribute_scalar/MELEE_PHYSICAL_STRENGTH" &&
    entry.weight === -9 &&
    !entry.fallbackUsed,
  ),
  "Negative scalar-priced weapon attribute should preserve pricingScalar x magnitude",
);
assert.equal(scalarNegativeWeaponAttributeBands.lanes.debug.featureWeightTotalRaw, -9);
assert.equal(scalarNegativeWeaponAttributeBands.lanes.debug.featureWeightTotal, 0);
assert.equal(scalarNegativeWeaponAttributeBands.lanes.debug.featurePressureRatio, 0);

const missingWeightedFeature = runCase("missing weighted feature", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Unmapped Feature"],
});
const missingWeightedFeatureBands = compareForgeOutputToBands(missingWeightedFeature, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  missingWeightedFeatureBands.lanes.debug.missingFeatureWeightDrivers.some((entry) =>
    entry.label.includes("Unmapped Feature"),
  ),
  "Missing Forge-Values cost should be exposed in missingFeatureWeightDrivers",
);
assert.equal(missingWeightedFeatureBands.lanes.debug.featureWeightTotal, 1);
assert.equal(missingWeightedFeatureBands.lanes.featuresVersatility.status, "narrow");

const expensiveCommonFeature = runCase("expensive common feature", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Expensive"],
});
const expensiveCommonFeatureBands = compareForgeOutputToBands(expensiveCommonFeature, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  LANE_STATUS_PERCENT[expensiveCommonFeatureBands.lanes.featuresVersatility.status] >= 75,
  "Expensive Common feature should escalate Features & Versatility pressure",
);
assert.ok(
  expensiveCommonFeatureBands.lanes.rarityPressure.notes.some((entry) => entry.includes("Common should usually")),
  "Expensive Common feature load should affect Rarity Pressure notes",
);

const smallLevelOneMelee = runCase("small level 1 melee", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
});
const smallLevelOneMeleeBand = compareForgeOutputToBands(smallLevelOneMelee).weaponProfiles.find(
  (entry) => entry.profileKind === "melee",
);
assert.equal(getProfile(smallLevelOneMelee, "melee").totalWoundsPerSuccess, 2);
assert.equal(
  smallLevelOneMeleeBand?.classification,
  "standard",
  "Level 1 Small Strength 1 should classify 2 wounds as standard",
);
const smallLevelOneRareBand = compareForgeOutputToBands({
  ...smallLevelOneMelee,
  common: {
    ...smallLevelOneMelee.common,
    rarity: "RARE",
  },
}).weaponProfiles.find((entry) => entry.profileKind === "melee");
assert.equal(
  smallLevelOneRareBand?.classification,
  smallLevelOneMeleeBand?.classification,
  "Core Functionality damage band should not increase by rarity alone",
);
const smallLevelOneConfiguredBand = compareForgeOutputToBands(
  smallLevelOneMelee,
  CORE_MULTIPLIER_CONTEXT,
).weaponProfiles.find((entry) => entry.profileKind === "melee");
assert.ok(
  smallLevelOneConfiguredBand?.debugNotes.some((entry) => entry.includes("expectation config multiplier")),
  "Core Functionality damage band should expose tunable size expectation multiplier",
);
const smallLevelOneConfiguredBands = compareForgeOutputToBands(smallLevelOneMelee, CORE_MULTIPLIER_CONTEXT);
assert.equal(smallLevelOneConfiguredBands.lanes.debug.coreExpectationSource, "forge_expectation_config");
assert.equal(smallLevelOneConfiguredBands.lanes.debug.coreExpectedValue, 4);
assert.ok(
  smallLevelOneConfiguredBands.lanes.debug.corePressureRatio <
    compareForgeOutputToBands(smallLevelOneMelee).lanes.debug.corePressureRatio,
  "Core pressure ratio should fall when expected core output is raised",
);

const smallLevelOneMultiTargetMelee = runCase("small level 1 multi-target melee", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 2,
});
const smallLevelOneMultiTargetBands = compareForgeOutputToBands(smallLevelOneMultiTargetMelee);
const smallLevelOneMultiTargetBand = smallLevelOneMultiTargetBands.weaponProfiles.find(
  (entry) => entry.profileKind === "melee",
);
assert.equal(getProfile(smallLevelOneMultiTargetMelee, "melee").totalWoundsPerSuccess, 2);
assert.equal(smallLevelOneMultiTargetBand?.totalPressure, 4);
assert.equal(smallLevelOneMultiTargetBand?.classification, "high");
assert.equal(
  smallLevelOneMultiTargetBands.lanes.coreFunctionality.status,
  "broad",
  "High weapon output should floor Core Functionality at broad",
);
assert.notEqual(
  smallLevelOneMultiTargetBands.lanes.coreFunctionality.status,
  "moderate",
  "High weapon output must not leave Core Functionality moderate",
);
assert.ok(
  LANE_STATUS_PERCENT[smallLevelOneMultiTargetBands.lanes.coreFunctionality.status] >= 75,
  "High weapon output should map to at least 75% Core Functionality fill",
);

const smallMelee = runCase("small melee", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Piercing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
});
const smallMeleeBand = compareForgeOutputToBands(smallMelee).weaponProfiles.find(
  (entry) => entry.profileKind === "melee",
);
assert.equal(getProfile(smallMelee, "melee").totalWoundsPerSuccess, 6);
assert.equal(smallMeleeBand?.bandSize, "SMALL");
assert.equal(smallMeleeBand?.classification, "high");
assert.ok(
  BAND_RANK[smallMeleeBand?.classification ?? "below"] >
    BAND_RANK[simpleMeleeBand?.classification ?? "below"],
  "Level 5 Small total 6 should classify higher than the same One-Handed output",
);

const twoHandedMelee = runCase("two-handed melee", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "TWO_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
});
const twoHandedMeleeBand = compareForgeOutputToBands(twoHandedMelee).weaponProfiles.find(
  (entry) => entry.profileKind === "melee",
);
assert.equal(getProfile(twoHandedMelee, "melee").totalWoundsPerSuccess, 6);
assert.equal(twoHandedMeleeBand?.bandSize, "TWO_HANDED");
assert.equal(twoHandedMeleeBand?.classification, "low");

const twoHandedStandardMelee = runCase("two-handed standard melee", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "TWO_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 5,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
});
const twoHandedStandardBand = compareForgeOutputToBands(twoHandedStandardMelee).weaponProfiles.find(
  (entry) => entry.profileKind === "melee",
);
assert.equal(getProfile(twoHandedStandardMelee, "melee").totalWoundsPerSuccess, 10);
assert.equal(twoHandedStandardBand?.classification, "standard");

const missingSizeMelee = runCase("missing size melee", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
});
const missingSizeBand = compareForgeOutputToBands(missingSizeMelee).weaponProfiles.find(
  (entry) => entry.profileKind === "melee",
);
assert.equal(missingSizeBand?.bandSize, "ONE_HANDED");
assert.equal(missingSizeBand?.bandSizeSource, "default_one_handed");
assert.ok(
  missingSizeBand?.debugNotes.includes("missing size, defaulted to one-handed band"),
  "missing size should report one-handed fallback debug note",
);

const dualDamageMelee = runCase("dual damage melee", {
  level: 5,
  rarity: "UNCOMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [
    { damageType: { name: "Slashing", attackMode: "PHYSICAL" } },
    { damageType: { name: "Fire", attackMode: "PHYSICAL" } },
  ],
  meleeTargets: 1,
});
const dualDamageMeleeProfile = getProfile(dualDamageMelee, "melee");
assert.equal(dualDamageMeleeProfile.damageTypeCount, 2);
assert.equal(dualDamageMeleeProfile.totalPhysicalWoundsPerSuccess, 12);
assert.equal(dualDamageMeleeProfile.totalWoundsPerSuccess, 12);
const dualDamageMeleeBand = compareForgeOutputToBands(dualDamageMelee).weaponProfiles.find(
  (entry) => entry.profileKind === "melee",
);
assert.equal(dualDamageMeleeBand?.classification, "high");
assert.ok(
  (dualDamageMeleeBand?.totalPressure ?? 0) > (simpleMeleeBand?.totalPressure ?? 0),
  "dual damage type pressure should exceed one-type melee pressure",
);
const dualDamageMeleeBands = compareForgeOutputToBands(dualDamageMelee);
assert.ok(
  dualDamageMeleeBands.lanes.featuresVersatility.mainDrivers.some((entry) =>
    entry.includes("damage type"),
  ),
  "dual damage type item should report damage type flexibility/pressure",
);
assert.ok(
  dualDamageMeleeBands.lanes.featuresVersatility.warnings.some((entry) =>
    entry.includes("damage type"),
  ),
  "dual damage type item should warn that simultaneous damage types add pressure",
);

const smallDualDamageMelee = runCase("small dual damage melee", {
  level: 5,
  rarity: "UNCOMMON",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [
    { damageType: { name: "Piercing", attackMode: "PHYSICAL" } },
    { damageType: { name: "Poison", attackMode: "PHYSICAL" } },
  ],
  meleeTargets: 1,
});
const smallDualDamageBand = compareForgeOutputToBands(smallDualDamageMelee).weaponProfiles.find(
  (entry) => entry.profileKind === "melee",
);
assert.equal(getProfile(smallDualDamageMelee, "melee").totalWoundsPerSuccess, 12);
assert.ok(
  smallDualDamageBand?.classification === "extreme" || smallDualDamageBand?.classification === "over-band",
  "Level 5 Small dual-type Strength 3 should classify as extreme or over-band",
);

const rangedMental = runCase("ranged mental", {
  level: 5,
  rarity: "RARE",
  type: "WEAPON",
  size: "TWO_HANDED",
  rangeCategories: ["RANGED"],
  rangedMentalStrength: 4,
  rangedDamageTypes: [{ damageType: { name: "Psychic", attackMode: "MENTAL" } }],
  rangedTargets: 2,
  rangedDistanceFeet: 60,
});
const rangedMentalProfile = getProfile(rangedMental, "ranged");
assert.equal(rangedMentalProfile.mentalWoundsPerSuccess, 8);
assert.equal(rangedMentalProfile.totalMentalWoundsPerSuccess, 8);
assert.equal(rangedMentalProfile.totalWoundsPerSuccess, 8);
assert.equal(rangedMentalProfile.targetCount, 2);
assert.equal(rangedMentalProfile.rangedDistanceFeet, 60);
const rangedMentalBand = compareForgeOutputToBands(rangedMental).weaponProfiles.find(
  (entry) => entry.profileKind === "ranged",
);
assert.equal(rangedMentalBand?.perTargetClassification, "standard");
assert.equal(rangedMentalBand?.totalPressureClassification, "high");
assert.equal(rangedMentalBand?.totalPressure, 16);

const aoeProfile = runCase("aoe", {
  level: 5,
  rarity: "RARE",
  type: "WEAPON",
  rangeCategories: ["AOE"],
  aoePhysicalStrength: 2,
  aoeDamageTypes: [{ damageType: { name: "Force", attackMode: "PHYSICAL" } }],
  aoeCount: 3,
  aoeCenterRangeFeet: 30,
  aoeShape: "SPHERE",
  aoeSphereRadiusFeet: 10,
  attackEffectsAoE: [{ attackEffect: { name: "Knockdown" } }],
});
const aoeAttack = getProfile(aoeProfile, "aoe");
assert.equal(aoeAttack.totalWoundsPerSuccess, 4);
assert.equal(aoeAttack.targetCount, 3);
assert.equal(aoeAttack.aoe?.shape, "SPHERE");
assert.equal(aoeAttack.aoe?.sphereRadiusFeet, 10);
assert.equal(aoeAttack.greaterSuccessEffectCount, 1);
assert.equal(aoeProfile.attackAccess.hasAoeAccess, true);
assert.deepEqual(aoeProfile.attackAccess.activeProfileKinds, ["aoe"]);
assert.equal(aoeProfile.attackAccess.aoe?.shape, "SPHERE");
assert.equal(aoeProfile.attackAccess.aoe?.centerRangeFeet, 30);
const aoeBands = compareForgeOutputToBands(aoeProfile, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  aoeBands.lanes.featuresVersatility.mainDrivers.includes("AoE attack access"),
  "AoE access should contribute to feature pressure even when it is the primary attack mode",
);
assert.ok(
  aoeBands.lanes.featuresVersatility.mainDrivers.includes("AoE geometry"),
  "AoE item should report AoE geometry as feature breadth",
);
assert.ok(
  aoeBands.lanes.featuresVersatility.mainDrivers.includes("AoE center range 30 ft"),
  "AoE center range should use Forge-Values feature rows when present",
);
assert.ok(
  aoeBands.lanes.featuresVersatility.mainDrivers.includes("AoE sphere radius 10 ft"),
  "AoE shape dimensions should use Forge-Values feature rows when present",
);
assert.ok(
  aoeBands.lanes.coreFunctionality.mainDrivers.some((entry) =>
    entry.includes("aoe") && entry.includes("weapon throughput"),
  ),
  "AoE output should contribute to Core when wounds exist",
);
assert.ok(
  aoeBands.lanes.featuresVersatility.mainDrivers.some((entry) =>
    entry.includes("Greater Success"),
  ),
  "Greater Success effects should contribute to Features & Versatility",
);

const armour = runCase("armour", {
  level: 5,
  rarity: "COMMON",
  type: "ARMOR",
  ppv: 2,
  mpv: 1,
  armorAttributes: [{ armorAttribute: { name: "Reinforced" } }],
  defEffects: [{ defEffect: { name: "Brace" } }],
  vrpEntries: [{ effectKind: "PROTECTION", magnitude: 1, damageType: { name: "Fire" } }],
});
assert.equal(armour.defensiveProfile.ppv, 2);
assert.equal(armour.defensiveProfile.mpv, 1);
assert.equal(armour.defensiveProfile.armourAttributeCount, 1);
assert.equal(armour.defensiveProfile.defensiveEffectCount, 1);
assert.equal(armour.defensiveProfile.vrpCount, 1);
const armourBands = compareForgeOutputToBands(armour);
assert.equal(armourBands.defensive.ppv.classification, "low");
assert.equal(armourBands.defensive.mpv.classification, "low");
assert.equal(armourBands.defensive.debugNote, "package/per-piece context deferred");
assert.ok(
  armourBands.lanes.coreFunctionality.mainDrivers.some((entry) => entry.includes("PPV")),
  "armour should report PPV as core defensive functionality",
);
assert.ok(
  armourBands.lanes.coreFunctionality.mainDrivers.some((entry) => entry.includes("MPV")),
  "armour should report MPV as core defensive functionality",
);
assert.ok(
  armourBands.lanes.featuresVersatility.mainDrivers.includes("defensive effects"),
  "defensive effects should contribute to Features & Versatility",
);

const shield = runCase("shield", {
  level: 5,
  rarity: "UNCOMMON",
  type: "SHIELD",
  size: "SMALL",
  shieldHasAttack: true,
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Bludgeoning", attackMode: "PHYSICAL" } }],
  ppv: 1,
  mpv: 1,
  shieldAttributes: [{ shieldAttribute: { name: "Bulwark" } }],
});
assert.equal(getProfile(shield, "melee").totalWoundsPerSuccess, 6);
assert.equal(shield.shieldCoPresence.hasShieldAttack, true);
assert.equal(shield.shieldCoPresence.hasDefenceOutput, true);
assert.equal(shield.shieldCoPresence.hasAttackAndDefence, true);
const shieldBands = compareForgeOutputToBands(shield);
const shieldWeaponBand = shieldBands.weaponProfiles.find((entry) => entry.profileKind === "melee");
assert.equal(shieldWeaponBand?.bandSize, "SMALL");
assert.equal(shieldWeaponBand?.classification, "high");
assert.equal(shieldBands.shield.hasAttackAndDefence, true);
assert.equal(shieldBands.shield.shieldSplitWarningLevel, "watch");
assert.ok(
  shieldBands.lanes.coreFunctionality.mainDrivers.includes("shield split attack/defence output"),
  "shield should report split-function core output",
);
assert.ok(
  shieldBands.lanes.coreFunctionality.warnings.some((entry) => entry.includes("shield split-function")),
  "shield with attack and defence should report split-function watch",
);

const meleeRangedAccessOnly = runCase("melee/ranged access without ranged output", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE", "RANGED"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  rangedDistanceFeet: 30,
});
assert.deepEqual(meleeRangedAccessOnly.attackAccess.enabledRangeCategories, ["MELEE", "RANGED"]);
assert.deepEqual(meleeRangedAccessOnly.attackAccess.activeProfileKinds, ["melee"]);
assert.equal(meleeRangedAccessOnly.attackAccess.extraProfileCount, 1);
assert.equal(meleeRangedAccessOnly.attackAccess.hasMixedMeleeRangedAccess, true);
const meleeRangedAccessOnlyBands = compareForgeOutputToBands(meleeRangedAccessOnly, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  meleeRangedAccessOnlyBands.lanes.debug.featurePressureRatio > simpleMeleeFeatureRatio,
  "Melee + Ranged access without ranged output should still increase feature pressure",
);
assert.equal(
  meleeRangedAccessOnlyBands.lanes.coreFunctionality.status,
  weightedSimpleMeleeBands.lanes.coreFunctionality.status,
  "Ranged access alone should not increase Core when no ranged output exists",
);
assert.ok(
  meleeRangedAccessOnlyBands.lanes.featuresVersatility.mainDrivers.some((entry) =>
    entry.includes("Ranged attack access") || entry.includes("mixed melee/ranged access"),
  ),
  "Melee + Ranged access should expose feature drivers",
);

const mixedMeleeRanged = runCase("mixed melee/ranged", {
  level: 5,
  rarity: "RARE",
  type: "WEAPON",
  size: "TWO_HANDED",
  rangeCategories: [{ rangeCategory: "MELEE" }, { rangeCategory: "RANGED" }],
  meleePhysicalStrength: 3,
  rangedPhysicalStrength: 2,
  meleeDamageTypeNames: ["Piercing"],
  rangedDamageTypes: [{ damageType: { name: "Lightning", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  rangedTargets: 2,
  rangedDistanceFeet: 45,
});
assert.equal(getProfile(mixedMeleeRanged, "melee").totalWoundsPerSuccess, 6);
assert.equal(getProfile(mixedMeleeRanged, "ranged").totalWoundsPerSuccess, 4);
assert.equal(getProfile(mixedMeleeRanged, "ranged").targetCount, 2);
assert.deepEqual(mixedMeleeRanged.attackAccess.activeProfileKinds, ["melee", "ranged"]);
assert.equal(mixedMeleeRanged.attackAccess.rangedDistanceFeet, 45);
const mixedMeleeRangedBands = compareForgeOutputToBands(mixedMeleeRanged, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  mixedMeleeRangedBands.lanes.featuresVersatility.mainDrivers.some((entry) =>
    entry.includes("Ranged attack access"),
  ),
  "mixed item should report extra attack profile breadth",
);
assert.ok(
  mixedMeleeRangedBands.lanes.featuresVersatility.mainDrivers.includes("mixed melee/ranged access"),
  "mixed item should report mixed melee/ranged versatility",
);
assert.ok(
  mixedMeleeRangedBands.lanes.coreFunctionality.mainDrivers.some((entry) =>
    entry.includes("secondary weapon throughput"),
  ),
  "mixed item with ranged output should report secondary Core throughput",
);
assert.ok(
  mixedMeleeRangedBands.lanes.debug.missingFeatureWeightDrivers.some((entry) =>
    entry.label.includes("mixed melee/ranged access"),
  ),
  "unmapped mixed access should be listed as a fallback feature driver",
);

const rangedThirtyFeet = runCase("ranged 30 ft", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["RANGED"],
  rangedPhysicalStrength: 3,
  rangedDamageTypes: [{ damageType: { name: "Piercing", attackMode: "PHYSICAL" } }],
  rangedDistanceFeet: 30,
});
const rangedOneTwentyFeet = runCase("ranged 120 ft", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["RANGED"],
  rangedPhysicalStrength: 3,
  rangedDamageTypes: [{ damageType: { name: "Piercing", attackMode: "PHYSICAL" } }],
  rangedDistanceFeet: 120,
});
const rangedThirtyFeetBands = compareForgeOutputToBands(rangedThirtyFeet, FEATURE_WEIGHT_CONTEXT);
const rangedOneTwentyFeetBands = compareForgeOutputToBands(rangedOneTwentyFeet, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  rangedOneTwentyFeetBands.lanes.debug.rangePressureScore > rangedThirtyFeetBands.lanes.debug.rangePressureScore,
  "120 ft ranged output should carry more Core range pressure than 30 ft",
);
assert.ok(
  rangedOneTwentyFeetBands.lanes.debug.featureWeightTotalRaw > rangedThirtyFeetBands.lanes.debug.featureWeightTotalRaw,
  "120 ft ranged output should carry more feature weight than 30 ft when Forge-Values rows exist",
);
assert.ok(
  rangedOneTwentyFeetBands.lanes.coreFunctionality.mainDrivers.some((entry) =>
    entry.includes("ranged distance 120 ft"),
  ),
  "ranged distance should be visible in Core drivers",
);

const overBudgetWeapon = runCase("over-budget level 5 weapon", {
  level: 5,
  rarity: "LEGENDARY",
  type: "WEAPON",
  size: "TWO_HANDED",
  rangeCategories: ["RANGED"],
  rangedPhysicalStrength: 4,
  rangedDamageTypes: [
    { damageType: { name: "Slashing", attackMode: "PHYSICAL" } },
    { damageType: { name: "Fire", attackMode: "PHYSICAL" } },
  ],
  rangedTargets: 2,
  rangedDistanceFeet: 90,
  attackEffectsRanged: [{ attackEffect: { name: "Stagger" } }],
});
const overBudgetBand = compareForgeOutputToBands(overBudgetWeapon).weaponProfiles.find(
  (entry) => entry.profileKind === "ranged",
);
assert.equal(getProfile(overBudgetWeapon, "ranged").totalWoundsPerSuccess, 16);
assert.equal(overBudgetBand?.totalPressure, 32);
assert.equal(overBudgetBand?.classification, "over-band");
const overBudgetBands = compareForgeOutputToBands(overBudgetWeapon);
assert.equal(overBudgetBands.lanes.coreFunctionality.status, "likely overloaded");
assert.ok(
  overBudgetBands.lanes.coreFunctionality.warnings.some((entry) =>
    entry.includes("regardless of rarity"),
  ),
  "over-band output should not be excused by rarity alone",
);
const overBudgetWithNegativeFeature = runCase("over-budget with negative feature", {
  level: 1,
  rarity: "LEGENDARY",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 10,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Thrown"],
});
const overBudgetWithNegativeFeatureBands = compareForgeOutputToBands(
  overBudgetWithNegativeFeature,
  FEATURE_WEIGHT_CONTEXT,
);
assert.equal(overBudgetWithNegativeFeatureBands.lanes.debug.featureWeightTotalRaw, -10);
assert.equal(overBudgetWithNegativeFeatureBands.lanes.debug.featureWeightTotal, 0);
assert.equal(
  overBudgetWithNegativeFeatureBands.lanes.coreFunctionality.status,
  "likely overloaded",
  "Negative features must not excuse over-band Core output",
);

const summary = [
  ["simple melee", getProfile(simpleMelee, "melee").totalWoundsPerSuccess],
  ["small level 1 Strength 1 band", smallLevelOneMeleeBand?.classification ?? "missing"],
  ["small level 1 multi-target core lane", smallLevelOneMultiTargetBands.lanes.coreFunctionality.status],
  ["small melee band", smallMeleeBand?.classification ?? "missing"],
  ["two-handed melee band", twoHandedMeleeBand?.classification ?? "missing"],
  ["two-handed Strength 5 band", twoHandedStandardBand?.classification ?? "missing"],
  ["missing size fallback", missingSizeBand?.bandSizeSource ?? "missing"],
  ["dual damage melee", getProfile(dualDamageMelee, "melee").totalWoundsPerSuccess],
  ["small dual damage melee band", smallDualDamageBand?.classification ?? "missing"],
  ["ranged mental", getProfile(rangedMental, "ranged").totalWoundsPerSuccess],
  ["aoe", getProfile(aoeProfile, "aoe").totalWoundsPerSuccess],
  ["shield attack+defence", shield.shieldCoPresence.hasAttackAndDefence ? "yes" : "no"],
  ["shield size-aware attack band", shieldWeaponBand?.classification ?? "missing"],
  ["mixed melee", getProfile(mixedMeleeRanged, "melee").totalWoundsPerSuccess],
  ["mixed ranged", getProfile(mixedMeleeRanged, "ranged").totalWoundsPerSuccess],
  ["simple melee band", simpleMeleeBand?.classification ?? "missing"],
  ["dual damage melee band", dualDamageMeleeBand?.classification ?? "missing"],
  ["ranged mental pressure band", rangedMentalBand?.totalPressureClassification ?? "missing"],
  ["over-budget ranged band", overBudgetBand?.classification ?? "missing"],
  ["shield split warning", shieldBands.shield.shieldSplitWarningLevel],
  ["simple melee core lane", simpleMeleeBands.lanes.coreFunctionality.status],
  ["mixed item feature lane", mixedMeleeRangedBands.lanes.featuresVersatility.status],
  ["over-budget core lane", overBudgetBands.lanes.coreFunctionality.status],
];

console.log("Forge output profile smoke passed.");
for (const [label, value] of summary) {
  console.log(`- ${label}: ${value}`);
}
