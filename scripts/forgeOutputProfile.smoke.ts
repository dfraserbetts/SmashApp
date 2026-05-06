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
  getForgeLanePressureState,
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

assert.equal(getForgeLanePressureState("narrow"), "lowPressure");
assert.equal(getForgeLanePressureState("low"), "lowPressure");
assert.equal(getForgeLanePressureState("moderate"), "healthy");
assert.equal(getForgeLanePressureState("standard"), "healthy");
assert.equal(getForgeLanePressureState("broad"), "watch");
assert.equal(getForgeLanePressureState("high"), "watch");
assert.equal(getForgeLanePressureState("heavy"), "overloaded");
assert.equal(getForgeLanePressureState("extreme"), "overloaded");
assert.notEqual(
  getForgeLanePressureState("moderate"),
  getForgeLanePressureState("heavy"),
  "A red/heavy bar cannot display a Moderate label when both share the lane status mapping",
);

const FORGE_OUTPUT_BREADTH_WEIGHT_ROWS = [
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.featureCount.each", value: 1 },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.extraProfile", value: 2 },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.mixedAccess.meleeRanged",
    value: 1,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.mixedAccess.meleeAoe",
    value: 1,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.mixedAccess.rangedAoe",
    value: 1,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.mixedAccess.allThree",
    value: 1,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.targetCount.extraTarget",
    value: 1,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.damageType.extraType",
    value: 1,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.rangedDistance.31to60",
    value: 3,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.rangedDistance.61to120",
    value: 6,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.rangedDistance.121plus",
    value: 10,
  },
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.weight.aoe.access", value: 5 },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.aoe.extraCount",
    value: 3,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.aoe.centerRange",
    value: 1,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.aoe.geometry",
    value: 3,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.defence.dualPpvMpv",
    value: 3,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "features.weight.shieldSplit.attackDefence",
    value: 10,
  },
  {
    category: "ItemModifiers",
    selector1: "ForgeOutputExpectation",
    selector2: "core.weapon.rangeMode.RANGED.multiplier",
    value: 0.8,
  },
] as const;

const FEATURE_WEIGHT_CONTEXT = buildForgeFeatureWeightContext([
  ...FORGE_OUTPUT_BREADTH_WEIGHT_ROWS,
  { category: "GS_AttackEffects", selector1: "Weapon", selector2: "Melee", selector3: "Stagger", value: 15 },
  { category: "Attribute", selector1: "Weapon", selector2: "Attack", selector3: "2", value: 20 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Parry", value: 1 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Quick", value: 2 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Returning", value: 12 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Expensive", value: 25 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Thrown", value: -10 },
  { category: "WeaponAttributes", selector1: "Weapon", selector2: "Reload", selector3: "1", value: -12 },
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

const LEGACY_ONLY_RANGE_CONTEXT = buildForgeExpectationContext(
  FEATURE_WEIGHT_CONTEXT.costs.filter((row) =>
    !(
      row.category === "ItemModifiers" &&
      row.selector1 === "ForgeOutputExpectation" &&
      (
        row.selector2 === "features.weight.rangedDistance.31to60" ||
        row.selector2 === "features.weight.rangedDistance.61to120" ||
        row.selector2 === "features.weight.rangedDistance.121plus"
      )
    )
  ),
  undefined,
  1,
);

const FALLBACK_ONLY_RANGE_CONTEXT = buildForgeExpectationContext(
  FEATURE_WEIGHT_CONTEXT.costs.filter((row) =>
    !(
      (row.category === "ItemModifiers" &&
        row.selector1 === "ForgeOutputExpectation" &&
        (
          row.selector2 === "features.weight.rangedDistance.31to60" ||
          row.selector2 === "features.weight.rangedDistance.61to120" ||
          row.selector2 === "features.weight.rangedDistance.121plus"
        )) ||
      row.category === "RangedDistanceFt"
    )
  ),
  undefined,
  1,
);

const SHIELD_SPLIT_MISSING_CONTEXT = buildForgeExpectationContext(
  FEATURE_WEIGHT_CONTEXT.costs.filter((row) =>
    !(
      row.category === "ItemModifiers" &&
      row.selector1 === "ForgeOutputExpectation" &&
      row.selector2 === "features.weight.shieldSplit.attackDefence"
    )
  ),
  undefined,
  1,
);

const CORE_MULTIPLIER_CONTEXT = buildForgeExpectationContext([
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "core.weapon.size.SMALL.multiplier", value: 2 },
], undefined, 1);

function withFeatureWeightOverride(key: string, value: number) {
  let replaced = false;
  const costs = FEATURE_WEIGHT_CONTEXT.costs.map((row) => {
    const matches =
      row.category === "ItemModifiers" &&
      row.selector1 === "ForgeOutputExpectation" &&
      row.selector2 === key;
    if (!matches) return row;
    replaced = true;
    return { ...row, value };
  });
  if (!replaced) {
    costs.push({ category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: key, value });
  }
  return buildForgeExpectationContext(
    costs,
    undefined,
    1,
  );
}

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

function assertFeatureDriver(
  profileName: string,
  bands: ReturnType<typeof compareForgeOutputToBands>,
  labelPart: string,
  expectedWeight: number,
  expectedKey: string,
) {
  assert.ok(
    bands.lanes.debug.featureWeightDrivers.some((entry) =>
      entry.label.includes(labelPart) &&
      entry.weight === expectedWeight &&
      !entry.fallbackUsed &&
      entry.source.includes(`ForgeOutputExpectation/${expectedKey}`),
    ),
    `${profileName} should read ${labelPart} weight from ${expectedKey}`,
  );
}

function findFeatureDriver(
  bands: ReturnType<typeof compareForgeOutputToBands>,
  labelPart: string,
) {
  return bands.lanes.debug.featureWeightDrivers.find((entry) => entry.label.includes(labelPart)) ?? null;
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

const halfStepMelee = runCase("half-step melee strength", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 2.5,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
});
const halfStepMeleeProfile = getProfile(halfStepMelee, "melee");
assert.equal(halfStepMeleeProfile.physicalStrength, 2.5);
assert.equal(halfStepMeleeProfile.physicalWoundsPerSuccess, 5);
assert.equal(halfStepMeleeProfile.totalPhysicalWoundsPerSuccess, 5);

const physicalOnlyStrengthOne = runCase("physical-only strength one", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
});
const physicalPlusMentalStrengthOne = runCase("physical plus mental strength one", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeMentalStrength: 1,
  meleeDamageTypes: [
    { damageType: { name: "Slashing", attackMode: "PHYSICAL" } },
    { damageType: { name: "Psychic", attackMode: "MENTAL" } },
  ],
  meleeTargets: 1,
});
const physicalOnlyStrengthOneBands = compareForgeOutputToBands(physicalOnlyStrengthOne, FEATURE_WEIGHT_CONTEXT);
const physicalPlusMentalStrengthOneBands = compareForgeOutputToBands(physicalPlusMentalStrengthOne, FEATURE_WEIGHT_CONTEXT);
assert.equal(getProfile(physicalOnlyStrengthOne, "melee").totalWoundsPerSuccess, 2);
assert.equal(getProfile(physicalPlusMentalStrengthOne, "melee").totalWoundsPerSuccess, 4);
assert.ok(
  physicalPlusMentalStrengthOneBands.lanes.debug.coreActualValue >=
    physicalOnlyStrengthOneBands.lanes.debug.coreActualValue,
  "Adding positive mental damage output must not reduce Core actual value",
);
assert.ok(
  physicalPlusMentalStrengthOneBands.lanes.debug.corePressureRatio >=
    physicalOnlyStrengthOneBands.lanes.debug.corePressureRatio,
  "Adding positive mental damage output must not reduce Core pressure ratio",
);
assert.ok(
  LANE_STATUS_PERCENT[physicalPlusMentalStrengthOneBands.lanes.coreFunctionality.status] >=
    LANE_STATUS_PERCENT[physicalOnlyStrengthOneBands.lanes.coreFunctionality.status],
  "Adding positive mental damage output must not lower Core status",
);

const oneDamageTypeStrengthTwo = runCase("one damage type strength two", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 2,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
});
const threeDamageTypesStrengthTwo = runCase("three damage types strength two", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 2,
  meleeDamageTypes: [
    { damageType: { name: "Slashing", attackMode: "PHYSICAL" } },
    { damageType: { name: "Fire", attackMode: "PHYSICAL" } },
    { damageType: { name: "Ice", attackMode: "PHYSICAL" } },
  ],
  meleeTargets: 1,
});
const oneDamageTypeStrengthTwoBands = compareForgeOutputToBands(oneDamageTypeStrengthTwo, FEATURE_WEIGHT_CONTEXT);
const threeDamageTypesStrengthTwoBands = compareForgeOutputToBands(threeDamageTypesStrengthTwo, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  threeDamageTypesStrengthTwoBands.lanes.debug.coreActualValue >=
    oneDamageTypeStrengthTwoBands.lanes.debug.coreActualValue,
  "Adding simultaneous damage types must not reduce Core actual value",
);
assert.ok(
  threeDamageTypesStrengthTwoBands.lanes.debug.corePressureRatio >=
    oneDamageTypeStrengthTwoBands.lanes.debug.corePressureRatio,
  "Adding simultaneous damage types must not reduce Core pressure ratio",
);

let previousTargetCoreRatio = -Infinity;
let previousTargetCoreActual = -Infinity;
for (const targets of [1, 2, 3, 4, 5]) {
  const targetedMelee = runCase(`target monotonic melee ${targets}`, {
    level: 5,
    rarity: "COMMON",
    type: "WEAPON",
    size: "ONE_HANDED",
    rangeCategories: ["MELEE"],
    meleePhysicalStrength: 2,
    meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
    meleeTargets: targets,
  });
  const targetedMeleeBands = compareForgeOutputToBands(targetedMelee, FEATURE_WEIGHT_CONTEXT);
  assert.ok(
    targetedMeleeBands.lanes.debug.coreActualValue >= previousTargetCoreActual,
    `Increasing targets to ${targets} must not reduce Core actual value`,
  );
  assert.ok(
    targetedMeleeBands.lanes.debug.corePressureRatio >= previousTargetCoreRatio,
    `Increasing targets to ${targets} must not reduce Core pressure ratio`,
  );
  previousTargetCoreActual = targetedMeleeBands.lanes.debug.coreActualValue;
  previousTargetCoreRatio = targetedMeleeBands.lanes.debug.corePressureRatio;
}

const meleeRangedMonotonicAccessOnly = runCase("secondary monotonic access only", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE", "RANGED"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  rangedDistanceFeet: 30,
});
const meleeRangedMonotonicLow = runCase("secondary monotonic low output", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE", "RANGED"],
  meleePhysicalStrength: 3,
  rangedPhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  rangedDamageTypes: [{ damageType: { name: "Lightning", attackMode: "PHYSICAL" } }],
  rangedDistanceFeet: 30,
});
const meleeRangedMonotonicHigh = runCase("secondary monotonic high output", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE", "RANGED"],
  meleePhysicalStrength: 3,
  rangedPhysicalStrength: 4,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  rangedDamageTypes: [{ damageType: { name: "Lightning", attackMode: "PHYSICAL" } }],
  rangedDistanceFeet: 30,
});
const meleeRangedMonotonicAccessOnlyBands = compareForgeOutputToBands(meleeRangedMonotonicAccessOnly, FEATURE_WEIGHT_CONTEXT);
const meleeRangedMonotonicLowBands = compareForgeOutputToBands(meleeRangedMonotonicLow, FEATURE_WEIGHT_CONTEXT);
const meleeRangedMonotonicHighBands = compareForgeOutputToBands(meleeRangedMonotonicHigh, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  meleeRangedMonotonicLowBands.lanes.debug.corePressureRatio >=
    meleeRangedMonotonicAccessOnlyBands.lanes.debug.corePressureRatio,
  "Adding real secondary output must not reduce Core pressure ratio",
);
assert.ok(
  meleeRangedMonotonicHighBands.lanes.debug.corePressureRatio >=
    meleeRangedMonotonicLowBands.lanes.debug.corePressureRatio,
  "Increasing secondary output must not reduce Core pressure ratio",
);

const warningRichModerateFeatureContext = buildForgeExpectationContext([
  ...FEATURE_WEIGHT_CONTEXT.costs,
  { category: "ItemModifiers", selector1: "ForgeOutputExpectation", selector2: "features.budget.COMMON", value: 42 },
], undefined, 1);
const warningRichModerateFeatureLoad = runCase("warning-rich moderate feature load", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 3,
  meleeDamageTypes: [
    { damageType: { name: "Slashing", attackMode: "PHYSICAL" } },
    { damageType: { name: "Fire", attackMode: "PHYSICAL" } },
  ],
  meleeTargets: 1,
  weaponAttributeNames: ["Expensive", "Thrown"],
  customWeaponAttributes: "one unmapped feature",
});
const warningRichModerateFeatureBands = compareForgeOutputToBands(
  warningRichModerateFeatureLoad,
  warningRichModerateFeatureContext,
);
assert.ok(
  warningRichModerateFeatureBands.lanes.debug.featurePressureRatio > 0.45 &&
    warningRichModerateFeatureBands.lanes.debug.featurePressureRatio < 0.5,
  "Warning-rich fixture should sit around a moderate feature ratio",
);
assert.ok(
  warningRichModerateFeatureBands.lanes.featuresVersatility.warnings.length > 2,
  "Warning-rich fixture should have enough warnings to prove warnings do not override status",
);
assert.equal(
  warningRichModerateFeatureBands.lanes.featuresVersatility.status,
  "moderate",
  "Feature warnings must not force Likely Overloaded when ratio is moderate",
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
assert.equal(weightedSimpleMeleeBands.lanes.debug.featureWeightTotalRaw, 0);
assert.equal(weightedSimpleMeleeBands.lanes.debug.featureWeightTotalClamped, 0);
assert.equal(weightedSimpleMeleeBands.lanes.debug.featureCount, 0);
assert.equal(weightedSimpleMeleeBands.lanes.debug.featureCountComplexityTotal, 0);
assert.equal(weightedSimpleMeleeBands.lanes.debug.breadthGeometryRangeProfileWeightTotal, 0);
assert.equal(weightedSimpleMeleeBands.lanes.debug.featureValueAndBreadthTotalRaw, 0);
assert.equal(weightedSimpleMeleeBands.lanes.debug.featureValueAndBreadthTotalClamped, 0);
assert.equal(weightedSimpleMeleeBands.lanes.debug.featurePressureTotal, 0);
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
assert.equal(cheapParryBands.lanes.debug.featureWeightTotalRaw, 1);
assert.equal(cheapParryBands.lanes.debug.featureWeightTotalClamped, 1);
assert.equal(cheapParryBands.lanes.debug.featureCount, 1);
assert.equal(cheapParryBands.lanes.debug.featureCountComplexityWeight, 1);
assert.equal(cheapParryBands.lanes.debug.featureCountComplexityTotal, 1);
assert.equal(cheapParryBands.lanes.debug.featureWeightTotal, 2);
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
assert.equal(expensiveSingleAttributeBands.lanes.debug.featureWeightTotalRaw, 25);
assert.equal(expensiveSingleAttributeBands.lanes.debug.featureCount, 1);
assert.equal(expensiveSingleAttributeBands.lanes.debug.featureCountComplexityTotal, 1);
assert.equal(expensiveSingleAttributeBands.lanes.debug.featureWeightTotal, 26);
assert.equal(expensiveSingleAttributeBands.lanes.debug.featureBudgetBeforeSizeMultiplier, 10);
assert.equal(expensiveSingleAttributeBands.lanes.debug.featureBudgetSizeMultiplier, 0.75);
assert.equal(expensiveSingleAttributeBands.lanes.debug.featureBudgetSizeMultiplierSource, "default");
assert.equal(expensiveSingleAttributeBands.lanes.debug.expectedFeatureBudget, 7.5);
assert.ok(
  LANE_STATUS_PERCENT[expensiveSingleAttributeBands.lanes.featuresVersatility.status] >= 75,
  "A single expensive attribute should move Features & Versatility by saved weight",
);

const expensiveOneHandedAttribute = runCase("expensive one-handed attribute", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Expensive"],
});
const expensiveTwoHandedAttribute = runCase("expensive two-handed attribute", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  size: "TWO_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Expensive"],
});
const expensiveOneHandedAttributeBands = compareForgeOutputToBands(expensiveOneHandedAttribute, FEATURE_WEIGHT_CONTEXT);
const expensiveTwoHandedAttributeBands = compareForgeOutputToBands(expensiveTwoHandedAttribute, FEATURE_WEIGHT_CONTEXT);
assert.equal(expensiveOneHandedAttributeBands.lanes.debug.featureBudgetSizeMultiplier, 1);
assert.equal(expensiveTwoHandedAttributeBands.lanes.debug.featureBudgetSizeMultiplier, 1.25);
assert.ok(
  expensiveSingleAttributeBands.lanes.debug.featurePressureRatio >
    expensiveOneHandedAttributeBands.lanes.debug.featurePressureRatio,
  "Same feature load should read as higher pressure on Small than One-Handed",
);
assert.ok(
  expensiveTwoHandedAttributeBands.lanes.debug.featurePressureRatio <
    expensiveOneHandedAttributeBands.lanes.debug.featurePressureRatio,
  "Same feature load should read as lower pressure on Two-Handed than One-Handed",
);
const smallFeatureBudgetOverrideBands = compareForgeOutputToBands(
  expensiveSingleAttribute,
  withFeatureWeightOverride("features.budget.size.SMALL.multiplier", 2),
);
assert.equal(smallFeatureBudgetOverrideBands.lanes.debug.featureBudgetSizeMultiplier, 2);
assert.equal(smallFeatureBudgetOverrideBands.lanes.debug.featureBudgetSizeMultiplierSource, "forge_expectation_config");
assert.equal(
  smallFeatureBudgetOverrideBands.lanes.coreFunctionality.status,
  expensiveSingleAttributeBands.lanes.coreFunctionality.status,
  "Feature budget size multiplier must not change Core Functionality",
);
assert.equal(
  smallFeatureBudgetOverrideBands.weaponProfiles.find((entry) => entry.profileKind === "melee")?.classification,
  expensiveSingleAttributeBands.weaponProfiles.find((entry) => entry.profileKind === "melee")?.classification,
  "Feature budget size multiplier must not change size-aware Core wound bands",
);

const missingSizeFeatureBudget = runCase("missing size feature budget fallback", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  weaponAttributeNames: ["Expensive"],
});
const missingSizeFeatureBudgetBands = compareForgeOutputToBands(missingSizeFeatureBudget, FEATURE_WEIGHT_CONTEXT);
assert.equal(missingSizeFeatureBudget.common.normalizedSize, null);
assert.equal(missingSizeFeatureBudgetBands.lanes.debug.featureBudgetSizeMultiplier, 1);
assert.equal(missingSizeFeatureBudgetBands.lanes.debug.expectedFeatureBudget, 10);
assert.ok(
  missingSizeFeatureBudgetBands.lanes.debug.featureBudgetSizeDebugNotes.some((entry) =>
    entry.includes("defaulted Features budget multiplier to one-handed"),
  ),
  "Missing weapon size should report one-handed feature budget multiplier fallback",
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
assert.equal(expensiveRareBands.lanes.debug.featureWeightTotalRaw, 25);
assert.equal(expensiveRareBands.lanes.debug.featureWeightTotal, 26);
assert.equal(expensiveRareBands.lanes.debug.featureBudgetBeforeSizeMultiplier, 40);
assert.equal(expensiveRareBands.lanes.debug.expectedFeatureBudget, 30);
assert.ok(
  expensiveSingleAttributeBands.lanes.debug.featurePressureRatio > expensiveRareBands.lanes.debug.featurePressureRatio,
  "Same feature weight should read as higher pressure on Common than Rare",
);
assert.ok(
  LANE_STATUS_PERCENT[expensiveSingleAttributeBands.lanes.featuresVersatility.status] >=
    LANE_STATUS_PERCENT[expensiveRareBands.lanes.featuresVersatility.status],
  "Common feature pressure should not classify lower than Rare for the same weight",
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
assert.ok(
  FEATURE_WEIGHT_CONTEXT.costs.some((row) =>
    row.category === "ItemModifiers" &&
    row.selector1 === "ForgeOutputExpectation" &&
    row.selector2 === "features.weight.rangedDistance.61to120" &&
    row.selector3 === undefined,
  ),
  "Expectation-row fixtures should use the same admin create shape for ranged distance keys",
);
assert.equal(expensiveHighBudgetCommonBands.lanes.debug.featureBudgetBeforeSizeMultiplier, 50);
assert.equal(expensiveHighBudgetCommonBands.lanes.debug.expectedFeatureBudget, 37.5);
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
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Parry", "Quick"],
});
const twoCheapAttributeBands = compareForgeOutputToBands(twoCheapAttributes, FEATURE_WEIGHT_CONTEXT);
assert.equal(twoCheapAttributeBands.lanes.debug.featureWeightTotal, 5);
assert.equal(twoCheapAttributeBands.lanes.debug.featureWeightTotalRaw, 3);
assert.equal(twoCheapAttributeBands.lanes.debug.featureCount, 2);
assert.equal(twoCheapAttributeBands.lanes.debug.featureCountComplexityTotal, 2);
assert.equal(
  twoCheapAttributeBands.lanes.featuresVersatility.status,
  "moderate",
  "Two cheap attributes should include count complexity in their Features pressure",
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
  3,
  "Positive and negative features should still carry count-complexity pressure even when signed value cancels below zero",
);
assert.equal(positiveAndNegativeAttributeBands.lanes.debug.featureWeightTotalClamped, 0);
assert.equal(positiveAndNegativeAttributeBands.lanes.debug.featureCount, 3);
assert.equal(positiveAndNegativeAttributeBands.lanes.debug.featureCountComplexityTotal, 3);
assert.equal(
  positiveAndNegativeAttributeBands.lanes.debug.featurePressureRatio,
  0.4,
  "Feature pressure ratio should include feature-count complexity after the signed-value clamp",
);
assert.equal(
  positiveAndNegativeAttributeBands.lanes.featuresVersatility.status,
  "moderate",
  "Many cancelling features should still create visible complexity pressure",
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
  cheapParryBands.lanes.coreFunctionality.status,
  "Negative feature weights must not reduce Core Functionality",
);
assert.ok(
  positiveAndNegativeAttributeBands.lanes.featuresVersatility.mainDrivers.some((entry) =>
    entry.includes("Feature count complexity: 3 features x 1 = +3"),
  ),
  "Feature count complexity should be surfaced in feature drivers",
);

const singleNegativeFeature = runCase("single negative feature", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributes: [{ name: "Cursed", pricingMode: "FIXED", pricingScalar: -4, pricingMagnitude: 1 }],
});
const singleNegativeFeatureBands = compareForgeOutputToBands(singleNegativeFeature, FEATURE_WEIGHT_CONTEXT);
assert.equal(singleNegativeFeatureBands.lanes.debug.featureWeightTotalRaw, -4);
assert.equal(singleNegativeFeatureBands.lanes.debug.featureWeightTotalClamped, 0);
assert.equal(singleNegativeFeatureBands.lanes.debug.featureCount, 1);
assert.equal(singleNegativeFeatureBands.lanes.debug.featureCountComplexityTotal, 1);
assert.equal(singleNegativeFeatureBands.lanes.debug.featureWeightTotal, 1);

const reloadOneFeature = runCase("reload one feature", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Reload 1"],
});
const reloadOneFeatureBands = compareForgeOutputToBands(reloadOneFeature, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  reloadOneFeatureBands.lanes.debug.featureWeightDrivers.some((entry) =>
    entry.label.includes("Reload 1") &&
    entry.source === "WeaponAttributes/Weapon/Reload/1" &&
    entry.weight === -12 &&
    !entry.fallbackUsed,
  ),
  "Reload 1 should use the saved WeaponAttributes/Weapon/Reload/1 = -12 row",
);
assert.equal(reloadOneFeatureBands.lanes.debug.featureWeightTotalRaw, -12);
assert.equal(reloadOneFeatureBands.lanes.debug.featureCount, 1);
assert.equal(reloadOneFeatureBands.lanes.debug.featureCountComplexityTotal, 1);
assert.equal(
  reloadOneFeatureBands.lanes.debug.featureWeightTotal,
  1,
  "Reload 1 should apply -12 to signed value while still adding +1 feature-count complexity",
);

const expensiveWithReloadOneFeature = runCase("expensive with reload one feature", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  size: "SMALL",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributeNames: ["Expensive", "Reload 1"],
});
const expensiveWithReloadOneFeatureBands = compareForgeOutputToBands(
  expensiveWithReloadOneFeature,
  FEATURE_WEIGHT_CONTEXT,
);
assert.equal(expensiveWithReloadOneFeatureBands.lanes.debug.featureWeightTotalRaw, 13);
assert.equal(expensiveWithReloadOneFeatureBands.lanes.debug.featureCount, 2);
assert.equal(expensiveWithReloadOneFeatureBands.lanes.debug.featureCountComplexityTotal, 2);
assert.equal(
  expensiveWithReloadOneFeatureBands.lanes.debug.featureWeightTotal,
  15,
  "Reload 1 should reduce the expensive attribute by 12 while both selected features add count complexity",
);
assert.ok(
  expensiveWithReloadOneFeatureBands.lanes.debug.featureWeightTotal <
    expensiveSingleAttributeBands.lanes.debug.featureWeightTotal,
  "Adding Reload 1 to a positive feature load should reduce final Features pressure",
);

const cancellingFeaturePile = runCase("cancelling feature pile", {
  level: 1,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributes: [
    { name: "Burst Rune", pricingMode: "FIXED", pricingScalar: 5, pricingMagnitude: 1 },
    { name: "Hooked Edge", pricingMode: "FIXED", pricingScalar: 5, pricingMagnitude: 1 },
    { name: "Self-Binding", pricingMode: "FIXED", pricingScalar: -5, pricingMagnitude: 1 },
    { name: "Fragile Grip", pricingMode: "FIXED", pricingScalar: -5, pricingMagnitude: 1 },
  ],
});
const cancellingFeaturePileBands = compareForgeOutputToBands(cancellingFeaturePile, FEATURE_WEIGHT_CONTEXT);
assert.equal(cancellingFeaturePileBands.lanes.debug.featureWeightTotalRaw, 0);
assert.equal(cancellingFeaturePileBands.lanes.debug.featureWeightTotalClamped, 0);
assert.equal(cancellingFeaturePileBands.lanes.debug.featureCount, 4);
assert.equal(cancellingFeaturePileBands.lanes.debug.featureCountComplexityTotal, 4);
assert.equal(cancellingFeaturePileBands.lanes.debug.featureWeightTotal, 4);
assert.ok(
  cancellingFeaturePileBands.lanes.debug.featurePressureRatio > 0,
  "Many positive and negative features should not cancel Features pressure to zero",
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
  greaterSuccessWeighted.lanes.debug.featureWeightTotal >= 16,
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
const scalarWeaponAttributeDriver = findFeatureDriver(scalarWeaponAttributeBands, "Scalar Bite");
assert.ok(
  scalarWeaponAttributeDriver &&
    scalarWeaponAttributeDriver.source === "attribute_scalar/MELEE_PHYSICAL_STRENGTH" &&
    scalarWeaponAttributeDriver.weight === 9 &&
    !scalarWeaponAttributeDriver.fallbackUsed &&
    scalarWeaponAttributeDriver.pricingMode === "MELEE_PHYSICAL_STRENGTH" &&
    scalarWeaponAttributeDriver.pricingScalar === 3 &&
    scalarWeaponAttributeDriver.pricingMagnitude === 3 &&
    scalarWeaponAttributeDriver.pricingWeight === 9 &&
    scalarWeaponAttributeDriver.scalarBasisKind === "raw_primary_strength" &&
    scalarWeaponAttributeDriver.scalarBasisLabel === "raw melee physical Strength" &&
    scalarWeaponAttributeDriver.scalarFormulaLabel === "3 x raw melee physical Strength 3 = 9",
  "Scalar-priced weapon attribute should use pricingScalar x resolved magnitude",
);
assert.ok(
  scalarWeaponAttributeBands.lanes.featuresVersatility.mainDrivers.some((entry) =>
    entry.includes("Scalar Bite") &&
    entry.includes("3 x raw melee physical Strength 3 = 9"),
  ),
  "Scalar-priced weapon attribute driver text should show the scalar basis",
);
assert.equal(scalarWeaponAttributeBands.lanes.debug.featureWeightTotalRaw, 9);
assert.equal(scalarWeaponAttributeBands.lanes.debug.featureCount, 1);
assert.equal(scalarWeaponAttributeBands.lanes.debug.featureCountComplexityTotal, 1);
assert.equal(scalarWeaponAttributeBands.lanes.debug.featureWeightTotal, 10);

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
    entry.weight === -3 &&
    entry.pricingWeight === -9 &&
    entry.note?.includes("negative scalar discount capped to base scalar -3") &&
    !entry.fallbackUsed,
  ),
  "Negative scalar-priced weapon attribute should cap Features discount to base scalar",
);
assert.equal(scalarNegativeWeaponAttributeBands.lanes.debug.featureWeightTotalRaw, -3);
assert.equal(scalarNegativeWeaponAttributeBands.lanes.debug.featureCount, 1);
assert.equal(scalarNegativeWeaponAttributeBands.lanes.debug.featureWeightTotal, 1);
assert.equal(scalarNegativeWeaponAttributeBands.lanes.debug.featurePressureRatio, 0.1);

const negativeScalarLowOutput = runCase("negative scalar low output", {
  level: 10,
  rarity: "RARE",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["RANGED"],
  rangedPhysicalStrength: 1,
  rangedDamageTypes: [{ damageType: { name: "Piercing", attackMode: "PHYSICAL" } }],
  rangedTargets: 1,
  rangedDistanceFeet: 120,
  weaponAttributes: [{
    name: "Unstable Draw",
    pricingMode: "RANGED_PHYSICAL_STRENGTH",
    pricingScalar: -5,
    pricingMagnitude: 1,
  }],
});
const negativeScalarHighOutput = runCase("negative scalar high output", {
  level: 10,
  rarity: "RARE",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["RANGED"],
  rangedPhysicalStrength: 6,
  rangedDamageTypes: [{ damageType: { name: "Piercing", attackMode: "PHYSICAL" } }],
  rangedTargets: 1,
  rangedDistanceFeet: 120,
  weaponAttributes: [{
    name: "Unstable Draw",
    pricingMode: "RANGED_PHYSICAL_STRENGTH",
    pricingScalar: -5,
    pricingMagnitude: 6,
  }],
});
const negativeScalarLowOutputBands = compareForgeOutputToBands(negativeScalarLowOutput, FEATURE_WEIGHT_CONTEXT);
const negativeScalarHighOutputBands = compareForgeOutputToBands(negativeScalarHighOutput, FEATURE_WEIGHT_CONTEXT);
const negativeScalarLowDriver = findFeatureDriver(negativeScalarLowOutputBands, "Unstable Draw");
const negativeScalarHighDriver = findFeatureDriver(negativeScalarHighOutputBands, "Unstable Draw");
assert.equal(negativeScalarLowDriver?.weight, -5);
assert.equal(negativeScalarLowDriver?.pricingWeight, -5);
assert.equal(negativeScalarHighDriver?.weight, -5);
assert.equal(negativeScalarHighDriver?.pricingWeight, -30);
assert.ok(
  negativeScalarHighDriver?.note?.includes("raw scalar would be -30"),
  "Negative scalar driver should expose the uncapped raw scalar for debug",
);
assert.equal(
  negativeScalarHighOutputBands.lanes.debug.featureWeightTotalRaw,
  negativeScalarLowOutputBands.lanes.debug.featureWeightTotalRaw,
  "Negative scalar feature should not become a larger Features discount when output magnitude increases",
);

const minMaxReducedLowOutput = runCase("reduced min-max low output", {
  level: 10,
  rarity: "RARE",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["RANGED"],
  rangedPhysicalStrength: 2,
  rangedDamageTypes: [{ damageType: { name: "Piercing", attackMode: "PHYSICAL" } }],
  rangedTargets: 1,
  rangedDistanceFeet: 120,
  weaponAttributes: [
    { name: "Parry", pricingMode: "RANGED_PHYSICAL_STRENGTH", pricingScalar: 4, pricingMagnitude: 2 },
    { name: "Unstable Draw", pricingMode: "RANGED_PHYSICAL_STRENGTH", pricingScalar: -5, pricingMagnitude: 2 },
    { name: "Quick", pricingMode: "FIXED", pricingScalar: 2, pricingMagnitude: 1 },
  ],
});
const minMaxReducedHighOutput = runCase("reduced min-max high output", {
  level: 10,
  rarity: "RARE",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["RANGED"],
  rangedPhysicalStrength: 6,
  rangedDamageTypes: [
    { damageType: { name: "Piercing", attackMode: "PHYSICAL" } },
    { damageType: { name: "Fire", attackMode: "PHYSICAL" } },
  ],
  rangedTargets: 1,
  rangedDistanceFeet: 120,
  weaponAttributes: [
    { name: "Parry", pricingMode: "RANGED_PHYSICAL_STRENGTH", pricingScalar: 4, pricingMagnitude: 6 },
    { name: "Unstable Draw", pricingMode: "RANGED_PHYSICAL_STRENGTH", pricingScalar: -5, pricingMagnitude: 6 },
    { name: "Quick", pricingMode: "FIXED", pricingScalar: 2, pricingMagnitude: 1 },
  ],
});
const minMaxReducedLowOutputBands = compareForgeOutputToBands(minMaxReducedLowOutput, FEATURE_WEIGHT_CONTEXT);
const minMaxReducedHighOutputBands = compareForgeOutputToBands(minMaxReducedHighOutput, FEATURE_WEIGHT_CONTEXT);
const minMaxLowNegativeDriver = findFeatureDriver(minMaxReducedLowOutputBands, "Unstable Draw");
const minMaxHighNegativeDriver = findFeatureDriver(minMaxReducedHighOutputBands, "Unstable Draw");
assert.equal(minMaxLowNegativeDriver?.weight, -5);
assert.equal(minMaxHighNegativeDriver?.weight, -5);
assert.ok(
  minMaxReducedHighOutputBands.lanes.debug.breadthGeometryRangeProfileWeightTotal >
    minMaxReducedLowOutputBands.lanes.debug.breadthGeometryRangeProfileWeightTotal,
  "Extra damage type breadth should still increase breadth pressure",
);
assert.ok(
  minMaxReducedHighOutputBands.lanes.debug.featurePressureTotal >=
    minMaxReducedLowOutputBands.lanes.debug.featurePressureTotal,
  "Same features plus higher output/breadth must not reduce Features pressure through negative scalar scaling",
);
const parryRawSixOneType = runCase("parry raw strength six one type", {
  level: 10,
  rarity: "RARE",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 6,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  weaponAttributes: [{
    name: "Parry",
    pricingMode: "MELEE_PHYSICAL_STRENGTH",
    pricingScalar: 7,
    pricingMagnitude: 6,
  }],
});
const parryRawTwoThreeTypes = runCase("parry raw strength two three types", {
  level: 10,
  rarity: "RARE",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 2,
  meleeDamageTypes: [
    { damageType: { name: "Slashing", attackMode: "PHYSICAL" } },
    { damageType: { name: "Fire", attackMode: "PHYSICAL" } },
    { damageType: { name: "Ice", attackMode: "PHYSICAL" } },
  ],
  meleeTargets: 1,
  weaponAttributes: [{
    name: "Parry",
    pricingMode: "MELEE_PHYSICAL_STRENGTH",
    pricingScalar: 7,
    pricingMagnitude: 2,
  }],
});
const parryRawSixOneTypeBands = compareForgeOutputToBands(parryRawSixOneType, FEATURE_WEIGHT_CONTEXT);
const parryRawTwoThreeTypesBands = compareForgeOutputToBands(parryRawTwoThreeTypes, FEATURE_WEIGHT_CONTEXT);
const parryRawSixDriver = findFeatureDriver(parryRawSixOneTypeBands, "Parry");
const parryRawTwoDriver = findFeatureDriver(parryRawTwoThreeTypesBands, "Parry");
assert.equal(getProfile(parryRawSixOneType, "melee").totalWoundsPerSuccess, 12);
assert.equal(getProfile(parryRawTwoThreeTypes, "melee").totalWoundsPerSuccess, 12);
assert.equal(parryRawSixDriver?.weight, 42);
assert.equal(parryRawTwoDriver?.weight, 14);
assert.equal(parryRawSixDriver?.scalarBasisLabel, "raw melee physical Strength");
assert.equal(parryRawTwoDriver?.scalarBasisLabel, "raw melee physical Strength");
assert.ok(
  parryRawSixOneTypeBands.lanes.debug.featureWeightTotalRaw >
    parryRawTwoThreeTypesBands.lanes.debug.featureWeightTotalRaw,
  "Parry should currently scale from raw melee physical Strength, not total table-facing wound output",
);

const rivitedShieldAttribute = runCase("rivited shield attribute scalar", {
  level: 5,
  rarity: "UNCOMMON",
  type: "SHIELD",
  size: "SMALL",
  ppv: 8,
  mpv: 0,
  shieldAttributes: [{
    shieldAttribute: {
      name: "Rivited",
      pricingMode: "PPV",
      pricingScalar: 2,
      pricingMagnitude: 8,
    },
  }],
});
const rivitedShieldBands = compareForgeOutputToBands(rivitedShieldAttribute, FEATURE_WEIGHT_CONTEXT);
const rivitedDriver = findFeatureDriver(rivitedShieldBands, "Rivited");
assert.equal(rivitedDriver?.weight, 16);
assert.equal(rivitedDriver?.scalarBasisKind, "ppv");
assert.equal(rivitedDriver?.scalarBasisLabel, "PPV");
assert.equal(rivitedDriver?.scalarFormulaLabel, "2 x PPV 8 = 16");

const resonatingArmourAttribute = runCase("resonating armour attribute scalar", {
  level: 5,
  rarity: "UNCOMMON",
  type: "ARMOR",
  ppv: 0,
  mpv: 4,
  armorAttributes: [{
    armorAttribute: {
      name: "Resonating",
      pricingMode: "MPV",
      pricingScalar: 5,
      pricingMagnitude: 4,
    },
  }],
});
const resonatingArmourBands = compareForgeOutputToBands(resonatingArmourAttribute, FEATURE_WEIGHT_CONTEXT);
const resonatingDriver = findFeatureDriver(resonatingArmourBands, "Resonating");
assert.equal(resonatingDriver?.weight, 20);
assert.equal(resonatingDriver?.scalarBasisKind, "mpv");
assert.equal(resonatingDriver?.scalarBasisLabel, "MPV");
assert.equal(resonatingDriver?.scalarFormulaLabel, "5 x MPV 4 = 20");

const auraArmourAttributes = runCase("aura armour attribute scalars", {
  level: 5,
  rarity: "UNCOMMON",
  type: "ARMOR",
  ppv: 0,
  mpv: 1,
  auraPhysical: 2,
  auraMental: 2,
  armorAttributes: [
    {
      armorAttribute: {
        name: "Aura (Physical)",
        pricingMode: "AURA_PHYSICAL",
        pricingScalar: 5,
        pricingMagnitude: 2,
      },
    },
    {
      armorAttribute: {
        name: "Aura (Mental)",
        pricingMode: "AURA_MENTAL",
        pricingScalar: 5,
        pricingMagnitude: 2,
      },
    },
  ],
});
const auraArmourBands = compareForgeOutputToBands(auraArmourAttributes, FEATURE_WEIGHT_CONTEXT);
const auraPhysicalDriver = findFeatureDriver(auraArmourBands, "Aura (Physical)");
const auraMentalDriver = findFeatureDriver(auraArmourBands, "Aura (Mental)");
assert.equal(auraPhysicalDriver?.weight, 10);
assert.equal(auraPhysicalDriver?.scalarBasisKind, "aura");
assert.equal(auraPhysicalDriver?.scalarBasisLabel, "Aura Physical");
assert.equal(auraPhysicalDriver?.scalarFormulaLabel, "5 x Aura Physical 2 = 10");
assert.equal(auraMentalDriver?.weight, 10);
assert.equal(auraMentalDriver?.scalarBasisKind, "aura");
assert.equal(auraMentalDriver?.scalarBasisLabel, "Aura Mental");
assert.equal(auraMentalDriver?.scalarFormulaLabel, "5 x Aura Mental 2 = 10");

const scalarWithoutPricingModeAttribute = runCase("scalar without pricing mode", {
  level: 5,
  rarity: "COMMON",
  type: "ARMOR",
  ppv: 1,
  mpv: 0,
  armorAttributes: [{
    armorAttribute: {
      name: "Stealthy",
      pricingScalar: 15,
    },
  }],
});
const scalarWithoutPricingModeBands = compareForgeOutputToBands(
  scalarWithoutPricingModeAttribute,
  FEATURE_WEIGHT_CONTEXT,
);
const scalarIgnoredDriver = findFeatureDriver(scalarWithoutPricingModeBands, "Stealthy scalar ignored");
assert.ok(
  scalarIgnoredDriver &&
    scalarIgnoredDriver.weight === 0 &&
    scalarIgnoredDriver.pricingScalar === 15 &&
    scalarIgnoredDriver.pricingMode === null &&
    scalarIgnoredDriver.note?.includes("pricingScalar 15 present but no pricingMode; scalar ignored"),
  "Attribute with pricingScalar but no pricingMode should warn that scalar is ignored",
);
assert.ok(
  !scalarWithoutPricingModeBands.lanes.debug.featureWeightDrivers.some((entry) =>
    entry.label.includes("Stealthy") &&
    entry.source === "attribute_scalar/UNKNOWN" &&
    entry.weight === 15,
  ),
  "Attribute with pricingScalar but no pricingMode should not silently apply scalar pricing",
);

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
assert.equal(missingWeightedFeatureBands.lanes.debug.featureCount, 1);
assert.equal(missingWeightedFeatureBands.lanes.debug.featureWeightTotal, 2);
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
const smallLevelOneCommonBands = compareForgeOutputToBands(smallLevelOneMelee);
const smallLevelOneRareBands = compareForgeOutputToBands({
  ...smallLevelOneMelee,
  common: {
    ...smallLevelOneMelee.common,
    rarity: "RARE",
  },
});
assert.equal(
  smallLevelOneRareBand?.classification,
  smallLevelOneMeleeBand?.classification,
  "Core Functionality damage band should not increase by rarity alone",
);
assert.equal(
  smallLevelOneRareBands.lanes.debug.coreExpectedValue,
  smallLevelOneCommonBands.lanes.debug.coreExpectedValue,
  "Rarity should not increase Core raw damage allowance",
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
const weightedSmallLevelOneMultiTargetBands = compareForgeOutputToBands(
  smallLevelOneMultiTargetMelee,
  FEATURE_WEIGHT_CONTEXT,
);
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
assertFeatureDriver(
  "small level 1 multi-target melee",
  weightedSmallLevelOneMultiTargetBands,
  "Melee 2 targets",
  1,
  "features.weight.targetCount.extraTarget",
);
const tunedSmallLevelOneMultiTargetBands = compareForgeOutputToBands(
  smallLevelOneMultiTargetMelee,
  withFeatureWeightOverride("features.weight.targetCount.extraTarget", 4),
);
assert.ok(
  tunedSmallLevelOneMultiTargetBands.lanes.debug.featureWeightTotal >
    weightedSmallLevelOneMultiTargetBands.lanes.debug.featureWeightTotal,
  "Changing target count expectation weight should change featureWeightTotal",
);
assert.ok(
  tunedSmallLevelOneMultiTargetBands.lanes.debug.featurePressureRatio >
    weightedSmallLevelOneMultiTargetBands.lanes.debug.featurePressureRatio,
  "Changing target count expectation weight should change featurePressureRatio",
);
const missingBreadthRowsMultiTargetBands = compareForgeOutputToBands(
  smallLevelOneMultiTargetMelee,
  buildForgeFeatureWeightContext([], 1),
);
assert.ok(
  missingBreadthRowsMultiTargetBands.lanes.debug.featureWeightDrivers.some((entry) =>
    entry.label.includes("Melee 2 targets") && entry.fallbackUsed,
  ),
  "Missing target count expectation row should fall back with debug",
);
assert.ok(
  missingBreadthRowsMultiTargetBands.lanes.debug.missingFeatureWeightDrivers.some((entry) =>
    entry.label.includes("Melee 2 targets"),
  ),
  "Missing target count expectation row should be listed in missingFeatureWeightDrivers",
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
const weightedDualDamageMeleeBands = compareForgeOutputToBands(dualDamageMelee, FEATURE_WEIGHT_CONTEXT);
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
assertFeatureDriver(
  "dual damage melee",
  weightedDualDamageMeleeBands,
  "Melee 2 damage types",
  1,
  "features.weight.damageType.extraType",
);
const tunedDualDamageMeleeBands = compareForgeOutputToBands(
  dualDamageMelee,
  withFeatureWeightOverride("features.weight.damageType.extraType", 5),
);
assert.ok(
  tunedDualDamageMeleeBands.lanes.debug.featureWeightTotal >
    weightedDualDamageMeleeBands.lanes.debug.featureWeightTotal,
  "Changing damage type expectation weight should change featureWeightTotal",
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
assert.equal(rangedMentalBand?.totalPressureClassification, "extreme");
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
  aoeBands.lanes.featuresVersatility.mainDrivers.some((entry) => entry.startsWith("AoE attack access")),
  "AoE access should contribute to feature pressure even when it is the primary attack mode",
);
assert.ok(
  aoeBands.lanes.featuresVersatility.mainDrivers.some((entry) => entry.startsWith("AoE geometry")),
  "AoE item should report AoE geometry as feature breadth",
);
assert.ok(
  aoeBands.lanes.featuresVersatility.mainDrivers.some((entry) => entry.startsWith("AoE center range 30 ft")),
  "AoE center range should use Forge-Values feature rows when present",
);
assert.ok(
  aoeBands.lanes.featuresVersatility.mainDrivers.some((entry) => entry.startsWith("AoE sphere radius 10 ft")),
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
assertFeatureDriver("aoe", aoeBands, "AoE 3 targets", 6, "features.weight.aoe.extraCount");
assertFeatureDriver("aoe", aoeBands, "AoE attack access", 5, "features.weight.aoe.access");
assertFeatureDriver("aoe", aoeBands, "AoE geometry", 3, "features.weight.aoe.geometry");
assertFeatureDriver("aoe", aoeBands, "AoE center range 30 ft", 1, "features.weight.aoe.centerRange");
assertFeatureDriver("aoe", aoeBands, "AoE sphere radius 10 ft", 3, "features.weight.aoe.geometry");

const aoeWithReloadOneProfile = runCase("aoe with reload one", {
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
  weaponAttributeNames: ["Reload 1"],
});
const aoeWithReloadOneBands = compareForgeOutputToBands(aoeWithReloadOneProfile, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  aoeWithReloadOneBands.lanes.debug.featureWeightDrivers.some((entry) =>
    entry.label.includes("Reload 1") &&
    entry.source === "WeaponAttributes/Weapon/Reload/1" &&
    entry.weight === -12 &&
    !entry.fallbackUsed,
  ),
  "Reload 1 should still use the saved -12 row when breadth pressure is present",
);
assert.equal(
  aoeWithReloadOneBands.lanes.debug.featureValueAndBreadthTotalRaw,
  aoeBands.lanes.debug.featureValueAndBreadthTotalRaw - 12,
  "Negative attributes should reduce the combined feature-value and breadth subtotal",
);
assert.equal(
  aoeWithReloadOneBands.lanes.debug.featureCount,
  aoeBands.lanes.debug.featureCount + 1,
  "Negative attributes should still add feature-count complexity",
);
assert.equal(
  aoeWithReloadOneBands.lanes.debug.featurePressureTotal,
  aoeBands.lanes.debug.featurePressureTotal - 11,
  "Reload 1 should reduce AoE Features pressure by 12, then add 1 unavoidable count complexity",
);

const largeAoeProfile = runCase("large AoE geometry", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["AOE"],
  aoePhysicalStrength: 2,
  aoeDamageTypes: [{ damageType: { name: "Force", attackMode: "PHYSICAL" } }],
  aoeCount: 3,
  aoeCenterRangeFeet: 30,
  aoeShape: "SPHERE",
  aoeSphereRadiusFeet: 20,
  attackEffectsAoE: [{ attackEffect: { name: "Knockdown" } }],
});
const largeAoeBands = compareForgeOutputToBands(largeAoeProfile, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  largeAoeBands.lanes.debug.featureWeightTotal > aoeBands.lanes.debug.featureWeightTotal,
  "Changing AoE shape dimensions should change Features pressure",
);
assertFeatureDriver(
  "large aoe",
  largeAoeBands,
  "AoE sphere radius 20 ft",
  6,
  "features.weight.aoe.geometry",
);
const coneFifteen = runCase("cone 15 ft", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["AOE"],
  aoePhysicalStrength: 2,
  aoeDamageTypes: [{ damageType: { name: "Force", attackMode: "PHYSICAL" } }],
  aoeCount: 1,
  aoeCenterRangeFeet: 30,
  aoeShape: "CONE",
  aoeConeLengthFeet: 15,
});
const coneThirty = runCase("cone 30 ft", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["AOE"],
  aoePhysicalStrength: 2,
  aoeDamageTypes: [{ damageType: { name: "Force", attackMode: "PHYSICAL" } }],
  aoeCount: 1,
  aoeCenterRangeFeet: 30,
  aoeShape: "CONE",
  aoeConeLengthFeet: 30,
});
const coneSixty = runCase("cone 60 ft", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["AOE"],
  aoePhysicalStrength: 2,
  aoeDamageTypes: [{ damageType: { name: "Force", attackMode: "PHYSICAL" } }],
  aoeCount: 1,
  aoeCenterRangeFeet: 30,
  aoeShape: "CONE",
  aoeConeLengthFeet: 60,
});
const coneFifteenBands = compareForgeOutputToBands(coneFifteen, FEATURE_WEIGHT_CONTEXT);
const coneThirtyBands = compareForgeOutputToBands(coneThirty, FEATURE_WEIGHT_CONTEXT);
const coneSixtyBands = compareForgeOutputToBands(coneSixty, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  coneFifteenBands.lanes.debug.featureWeightTotal <
    coneThirtyBands.lanes.debug.featureWeightTotal &&
    coneThirtyBands.lanes.debug.featureWeightTotal < coneSixtyBands.lanes.debug.featureWeightTotal,
  "Cone 15/30/60 ft should scale Features pressure upward",
);
const aoeCountOne = runCase("AoE count 1", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["AOE"],
  aoePhysicalStrength: 2,
  aoeDamageTypes: [{ damageType: { name: "Force", attackMode: "PHYSICAL" } }],
  aoeCount: 1,
  aoeCenterRangeFeet: 30,
  aoeShape: "SPHERE",
  aoeSphereRadiusFeet: 10,
});
const aoeCountFive = runCase("AoE count 5", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["AOE"],
  aoePhysicalStrength: 2,
  aoeDamageTypes: [{ damageType: { name: "Force", attackMode: "PHYSICAL" } }],
  aoeCount: 5,
  aoeCenterRangeFeet: 30,
  aoeShape: "SPHERE",
  aoeSphereRadiusFeet: 10,
});
const aoeCountOneBands = compareForgeOutputToBands(aoeCountOne, FEATURE_WEIGHT_CONTEXT);
const aoeCountFiveBands = compareForgeOutputToBands(aoeCountFive, FEATURE_WEIGHT_CONTEXT);
assert.ok(
  aoeCountOneBands.lanes.debug.featureWeightTotal <
    aoeBands.lanes.debug.featureWeightTotal &&
    aoeBands.lanes.debug.featureWeightTotal < aoeCountFiveBands.lanes.debug.featureWeightTotal,
  "AoE count 1/3/5 should scale Features pressure upward",
);
const tunedAoeAccessBands = compareForgeOutputToBands(
  aoeProfile,
  withFeatureWeightOverride("features.weight.aoe.access", 8),
);
assert.ok(
  tunedAoeAccessBands.lanes.debug.featureWeightTotal > aoeBands.lanes.debug.featureWeightTotal,
  "Changing AoE access expectation weight should change featureWeightTotal",
);
const tunedAoeGeometryBands = compareForgeOutputToBands(
  aoeProfile,
  withFeatureWeightOverride("features.weight.aoe.geometry", 5),
);
assert.ok(
  tunedAoeGeometryBands.lanes.debug.featurePressureRatio > aoeBands.lanes.debug.featurePressureRatio,
  "Changing AoE geometry expectation weight should change featurePressureRatio",
);

const armour = runCase("armour", {
  level: 5,
  rarity: "COMMON",
  type: "ARMOR",
  armorLocation: "TORSO",
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
assert.equal(armourBands.defensive.ppv.classification, "standard");
assert.equal(armourBands.defensive.mpv.classification, "low");
assert.equal(armourBands.defensive.debugNote, "slot-weighted armour package expectation");
assert.ok(
  armourBands.lanes.coreFunctionality.mainDrivers.some((entry) => entry.includes("PPV")),
  "armour should report PPV as core defensive functionality",
);
assert.ok(
  armourBands.lanes.coreFunctionality.mainDrivers.some((entry) => entry.includes("MPV")),
  "armour should report MPV as core defensive functionality",
);
assert.ok(
  armourBands.lanes.featuresVersatility.mainDrivers.some((entry) => entry.startsWith("defensive effects")),
  "defensive effects should contribute to Features & Versatility",
);

const armourTorsoStandard = runCase("armour torso standard slot weighting", {
  level: 5,
  rarity: "COMMON",
  type: "ARMOR",
  armorLocation: "TORSO",
  ppv: 3,
  mpv: 2,
});
const armourTorsoStandardBands = compareForgeOutputToBands(armourTorsoStandard);
assert.equal(armourTorsoStandardBands.defensive.ppv.armourSlotWeight, 0.35);
assert.equal(armourTorsoStandardBands.defensive.ppv.classification, "standard");
assert.equal(armourTorsoStandardBands.defensive.mpv.classification, "standard");
assert.notEqual(armourTorsoStandardBands.lanes.coreFunctionality.status, "heavy");
assert.notEqual(armourTorsoStandardBands.lanes.coreFunctionality.status, "likely overloaded");
assert.ok(
  armourTorsoStandardBands.lanes.coreFunctionality.mainDrivers.some((entry) =>
    entry.includes("PPV 3 vs Torso expected 2-4 from package band 6-10 x 35% (raw 2.1-3.5)"),
  ),
  "Torso PPV driver should show slot-weighted package expectation math",
);
assert.ok(
  armourTorsoStandardBands.lanes.coreFunctionality.mainDrivers.some((entry) =>
    entry.includes("MPV 2 vs Torso expected 2-3 from package band 6-8 x 35% (raw 2.1-2.8)"),
  ),
  "Torso MPV driver should show MPV package band math",
);

const armourTorsoPpvFour = runCase("armour torso ppv four", {
  level: 5,
  rarity: "COMMON",
  type: "ARMOR",
  armorLocation: "TORSO",
  ppv: 4,
});
const armourHeadOverbuilt = runCase("armour head overbuilt", {
  level: 5,
  rarity: "COMMON",
  type: "ARMOR",
  armorLocation: "HEAD",
  ppv: 4,
});
const armourTorsoPpvFourBands = compareForgeOutputToBands(armourTorsoPpvFour);
const armourHeadOverbuiltBands = compareForgeOutputToBands(armourHeadOverbuilt);
assert.ok(
  BAND_RANK[armourHeadOverbuiltBands.defensive.ppv.classification] >
    BAND_RANK[armourTorsoPpvFourBands.defensive.ppv.classification],
  "The same PPV should be heavier on Head than Torso because Head has a smaller slot budget",
);
assert.ok(
  armourHeadOverbuiltBands.lanes.debug.corePressureRatio >
    armourTorsoPpvFourBands.lanes.debug.corePressureRatio,
  "Head PPV 4 should create higher Core pressure than Torso PPV 4",
);

const packageShareCases = [
  { location: "HEAD", ppv: 1 },
  { location: "SHOULDERS", ppv: 2 },
  { location: "TORSO", ppv: 4 },
  { location: "LEGS", ppv: 2 },
  { location: "FEET", ppv: 1 },
] as const;
const packageShareBands = packageShareCases.map((entry) =>
  compareForgeOutputToBands(
    runCase(`armour package share ${entry.location}`, {
      level: 5,
      rarity: "COMMON",
      type: "ARMOR",
      armorLocation: entry.location,
      ppv: entry.ppv,
    }),
  ),
);
assert.equal(packageShareCases.reduce((sum, entry) => sum + entry.ppv, 0), 10);
assert.equal(
  packageShareBands.reduce((sum, entry) => sum + entry.defensive.ppv.rawThresholds.standardMax, 0),
  10,
  "Raw slot standard maxima should add back to the Level 5 PPV package standard maximum",
);

const armourHeadMpv = runCase("armour head mpv slot weighting", {
  level: 5,
  rarity: "COMMON",
  type: "ARMOR",
  armorLocation: "HEAD",
  mpv: 1,
});
const armourHeadMpvBands = compareForgeOutputToBands(armourHeadMpv);
assert.equal(armourHeadMpvBands.defensive.mpv.classification, "standard");
assert.equal(armourHeadMpvBands.defensive.mpv.thresholds.standardMax, 1);
assert.equal(
  armourHeadMpvBands.defensive.ppv.thresholds.standardMax,
  2,
  "MPV should compare against MPV package bands, not PPV package bands",
);

const armourDualLane = runCase("armour torso dual defensive lane", {
  level: 5,
  rarity: "COMMON",
  type: "ARMOR",
  armorLocation: "TORSO",
  ppv: 3,
  mpv: 3,
});
const armourDualLaneBands = compareForgeOutputToBands(armourDualLane);
const weightedArmourDualLaneBands = compareForgeOutputToBands(armourDualLane, FEATURE_WEIGHT_CONTEXT);
assert.equal(armourDualLaneBands.defensive.ppv.classification, "standard");
assert.equal(armourDualLaneBands.defensive.mpv.classification, "standard");
assert.ok(
  armourDualLaneBands.lanes.coreFunctionality.mainDrivers.some((entry) => entry.startsWith("PPV 3 vs Torso")),
  "Dual-lane armour should show PPV driver",
);
assert.ok(
  armourDualLaneBands.lanes.coreFunctionality.mainDrivers.some((entry) => entry.startsWith("MPV 3 vs Torso")),
  "Dual-lane armour should show MPV driver",
);
assert.equal(armourDualLaneBands.lanes.debug.coreActualValue, 3);
assert.equal(armourDualLaneBands.lanes.debug.coreExpectedValue, 3);
assertFeatureDriver(
  "armour torso dual defensive lane",
  weightedArmourDualLaneBands,
  "dual PPV/MPV defensive coverage",
  3,
  "features.weight.defence.dualPpvMpv",
);

const pureDefensiveShield = runCase("pure defensive shield", {
  level: 5,
  rarity: "COMMON",
  type: "SHIELD",
  size: "SMALL",
  ppv: 2,
});
const pureDefensiveShieldBands = compareForgeOutputToBands(pureDefensiveShield);
assert.equal(pureDefensiveShieldBands.defensive.debugNote, "shield overlay expectation");
assert.equal(pureDefensiveShieldBands.defensive.ppv.armourSlotWeight, 0.2);
assert.equal(pureDefensiveShieldBands.defensive.ppv.classification, "standard");
assert.equal(pureDefensiveShieldBands.lanes.coreFunctionality.status, "moderate");
assert.ok(
  pureDefensiveShieldBands.lanes.coreFunctionality.mainDrivers.some((entry) =>
    entry.includes("PPV 2 vs Shield expected 1-2 from package band 6-10 x 20% (raw 1.2-2)"),
  ),
  "Shield PPV should compare against the optional Shield 20% overlay expectation",
);
assert.ok(
  !pureDefensiveShieldBands.lanes.coreFunctionality.mainDrivers.some((entry) =>
    entry.includes("PPV 2 vs package expected 6-10"),
  ),
  "Shield PPV should no longer compare against the full package expectation",
);

const strongDefensiveShield = runCase("strong defensive shield", {
  level: 5,
  rarity: "COMMON",
  type: "SHIELD",
  size: "SMALL",
  ppv: 4,
});
const strongDefensiveShieldBands = compareForgeOutputToBands(strongDefensiveShield);
assert.equal(strongDefensiveShieldBands.defensive.ppv.classification, "extreme");
assert.equal(strongDefensiveShieldBands.lanes.coreFunctionality.status, "heavy");

const overbuiltDefensiveShield = runCase("overbuilt defensive shield", {
  level: 5,
  rarity: "COMMON",
  type: "SHIELD",
  size: "SMALL",
  ppv: 6,
});
const overbuiltDefensiveShieldBands = compareForgeOutputToBands(overbuiltDefensiveShield);
assert.equal(overbuiltDefensiveShieldBands.defensive.ppv.classification, "over-band");
assert.equal(overbuiltDefensiveShieldBands.lanes.coreFunctionality.status, "likely overloaded");

const mentalDefensiveShield = runCase("mental defensive shield", {
  level: 5,
  rarity: "COMMON",
  type: "SHIELD",
  size: "SMALL",
  mpv: 2,
});
const mentalDefensiveShieldBands = compareForgeOutputToBands(mentalDefensiveShield);
assert.equal(mentalDefensiveShieldBands.defensive.mpv.armourSlotWeight, 0.2);
assert.equal(mentalDefensiveShieldBands.defensive.mpv.classification, "standard");
assert.equal(mentalDefensiveShieldBands.lanes.coreFunctionality.status, "moderate");
assert.ok(
  mentalDefensiveShieldBands.lanes.coreFunctionality.mainDrivers.some((entry) =>
    entry.includes("MPV 2 vs Shield expected 1-2 from package band 6-8 x 20% (raw 1.2-1.6)"),
  ),
  "Shield MPV should compare against the optional Shield 20% overlay expectation",
);

const dualLaneDefensiveShield = runCase("dual lane defensive shield", {
  level: 5,
  rarity: "COMMON",
  type: "SHIELD",
  size: "SMALL",
  ppv: 2,
  mpv: 2,
});
const dualLaneDefensiveShieldBands = compareForgeOutputToBands(dualLaneDefensiveShield, FEATURE_WEIGHT_CONTEXT);
assert.equal(dualLaneDefensiveShieldBands.defensive.ppv.classification, "standard");
assert.equal(dualLaneDefensiveShieldBands.defensive.mpv.classification, "standard");
assert.equal(dualLaneDefensiveShieldBands.lanes.coreFunctionality.status, "broad");
assert.ok(
  dualLaneDefensiveShieldBands.lanes.coreFunctionality.mainDrivers.some((entry) => entry.startsWith("PPV 2 vs Shield")),
  "Dual-lane shield should show PPV shield overlay driver",
);
assert.ok(
  dualLaneDefensiveShieldBands.lanes.coreFunctionality.mainDrivers.some((entry) => entry.startsWith("MPV 2 vs Shield")),
  "Dual-lane shield should show MPV shield overlay driver",
);
assertFeatureDriver(
  "dual lane defensive shield",
  dualLaneDefensiveShieldBands,
  "dual PPV/MPV defensive coverage",
  3,
  "features.weight.defence.dualPpvMpv",
);
assert.equal(dualLaneDefensiveShieldBands.lanes.featuresVersatility.status, "moderate");

const headDualLaneAbuse = runCase("head dual lane defensive abuse", {
  level: 5,
  rarity: "COMMON",
  type: "ARMOR",
  armorLocation: "HEAD",
  ppv: 2,
  mpv: 2,
});
const headDualLaneAbuseBands = compareForgeOutputToBands(headDualLaneAbuse, FEATURE_WEIGHT_CONTEXT);
assert.equal(headDualLaneAbuseBands.defensive.ppv.classification, "standard");
assert.equal(headDualLaneAbuseBands.defensive.mpv.classification, "extreme");
assert.equal(headDualLaneAbuseBands.lanes.coreFunctionality.status, "heavy");
assertFeatureDriver(
  "head dual lane defensive abuse",
  headDualLaneAbuseBands,
  "dual PPV/MPV defensive coverage",
  3,
  "features.weight.defence.dualPpvMpv",
);

const attackDefenceShield = runCase("attack defence shield weighted output", {
  level: 5,
  rarity: "COMMON",
  type: "SHIELD",
  size: "SMALL",
  shieldHasAttack: true,
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 2,
  meleeDamageTypes: [{ damageType: { name: "Bludgeoning", attackMode: "PHYSICAL" } }],
  ppv: 4,
});
const attackDefenceShieldBands = compareForgeOutputToBands(attackDefenceShield, FEATURE_WEIGHT_CONTEXT);
const attackDefenceShieldWeaponBand = attackDefenceShieldBands.weaponProfiles.find((entry) => entry.profileKind === "melee");
assert.equal(attackDefenceShieldBands.defensive.ppv.classification, "extreme");
assert.equal(attackDefenceShieldWeaponBand?.shieldAttackCoreMultiplier, 0.6);
assert.ok(
  attackDefenceShieldWeaponBand?.debugNotes.some((entry) => entry.includes("shield attack core multiplier 0.6")),
  "Shield attack should expose the 60% same-size weapon expectation multiplier",
);
assert.ok(
  attackDefenceShieldBands.lanes.coreFunctionality.mainDrivers.some((entry) =>
    entry.includes("PPV 4 vs Shield expected 1-2 from package band 6-10 x 20% (raw 1.2-2)"),
  ),
  "Attack + defence shield should keep Shield 20% defensive driver",
);
assertFeatureDriver(
  "attack defence shield",
  attackDefenceShieldBands,
  "shield attack + defence split",
  10,
  "features.weight.shieldSplit.attackDefence",
);
assert.equal(attackDefenceShieldBands.shield.shieldSplitWarningLevel, "likelyOverloaded");

const weakHybridShield = runCase("weak attack defence shield", {
  level: 5,
  rarity: "COMMON",
  type: "SHIELD",
  size: "SMALL",
  shieldHasAttack: true,
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Bludgeoning", attackMode: "PHYSICAL" } }],
  ppv: 1,
});
const weakHybridShieldBands = compareForgeOutputToBands(weakHybridShield, FEATURE_WEIGHT_CONTEXT);
assert.equal(weakHybridShieldBands.weaponProfiles[0]?.classification, "low");
assert.equal(weakHybridShieldBands.defensive.ppv.classification, "standard");
assert.equal(weakHybridShieldBands.shield.shieldSplitWarningLevel, "none");
assert.equal(weakHybridShieldBands.lanes.coreFunctionality.status, "moderate");
assert.ok(
  !weakHybridShieldBands.lanes.coreFunctionality.warnings.some((entry) => entry.includes("shield split-function")),
  "Weak hybrid shield should not emit a severe shield split warning",
);
assertFeatureDriver(
  "weak attack defence shield",
  weakHybridShieldBands,
  "shield attack + defence split",
  2,
  "features.weight.shieldSplit.attackDefence",
);
assert.equal(weakHybridShieldBands.lanes.featuresVersatility.status, "narrow");

const standardHybridShield = runCase("standard attack defence shield", {
  level: 5,
  rarity: "COMMON",
  type: "SHIELD",
  size: "SMALL",
  shieldHasAttack: true,
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 2,
  meleeDamageTypes: [{ damageType: { name: "Bludgeoning", attackMode: "PHYSICAL" } }],
  ppv: 2,
});
const standardHybridShieldBands = compareForgeOutputToBands(standardHybridShield, FEATURE_WEIGHT_CONTEXT);
assert.equal(standardHybridShieldBands.shield.shieldSplitWarningLevel, "watch");
assert.ok(
  standardHybridShieldBands.lanes.coreFunctionality.warnings.some((entry) => entry.includes("shield split-function watch")),
  "Meaningful hybrid shield should emit a watch-level shield split warning",
);
assert.ok(
  findFeatureDriver(standardHybridShieldBands, "shield attack + defence split")?.weight ?? 0 >= 5,
  "Standard-or-better hybrid shield should apply scaled shield split feature pressure",
);

const strongDefenceHybridShield = runCase("strong defence hybrid shield", {
  level: 5,
  rarity: "COMMON",
  type: "SHIELD",
  size: "SMALL",
  shieldHasAttack: true,
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 1,
  meleeDamageTypes: [{ damageType: { name: "Bludgeoning", attackMode: "PHYSICAL" } }],
  ppv: 4,
});
const strongDefenceHybridShieldBands = compareForgeOutputToBands(strongDefenceHybridShield, FEATURE_WEIGHT_CONTEXT);
assert.equal(strongDefenceHybridShieldBands.defensive.ppv.classification, "extreme");
assert.equal(strongDefenceHybridShieldBands.lanes.coreFunctionality.status, "heavy");
assert.equal(strongDefenceHybridShieldBands.shield.shieldSplitWarningLevel, "watch");
assert.ok(
  findFeatureDriver(strongDefenceHybridShieldBands, "shield attack + defence split")?.weight ?? 0 >= 5,
  "Strong-defence hybrid shield should keep visible split feature pressure",
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
const weightedShieldBands = compareForgeOutputToBands(shield, FEATURE_WEIGHT_CONTEXT);
const missingShieldSplitBands = compareForgeOutputToBands(shield, SHIELD_SPLIT_MISSING_CONTEXT);
const shieldWeaponBand = shieldBands.weaponProfiles.find((entry) => entry.profileKind === "melee");
assert.equal(shieldWeaponBand?.bandSize, "SMALL");
assert.equal(shieldWeaponBand?.classification, "extreme");
assert.equal(shieldWeaponBand?.shieldAttackCoreMultiplier, 0.6);
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
assertFeatureDriver(
  "shield",
  weightedShieldBands,
  "shield attack + defence split",
  3,
  "features.weight.shieldSplit.attackDefence",
);
assert.ok(
  weightedShieldBands.lanes.debug.featureWeightTotal >=
    shieldBands.lanes.debug.featureWeightTotal + 2,
  "Configured shield attack + defence split weight should visibly increase Features pressure after severity scaling",
);
assert.ok(
  weightedShieldBands.lanes.featuresVersatility.mainDrivers.some((entry) =>
    entry.includes("shield attack + defence split") &&
    entry.includes("ForgeOutputExpectation features.weight.shieldSplit.attackDefence = 10") &&
    entry.includes("10 x 0.3"),
  ),
  "Shield split feature driver should show the configured ForgeOutputExpectation source and severity multiplier",
);
const missingShieldSplitDriver = findFeatureDriver(missingShieldSplitBands, "shield attack + defence split");
assert.ok(
  missingShieldSplitDriver?.fallbackUsed &&
    missingShieldSplitDriver.sourceKind === "fallback" &&
    missingShieldSplitDriver.sourceValue === 0.3,
  "Missing shield split expectation should report fallback source",
);
assert.ok(
  missingShieldSplitBands.lanes.debug.missingFeatureWeightDrivers.some((entry) =>
    entry.label.includes("shield attack + defence split"),
  ),
  "Missing shield split expectation should be listed as missing",
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
assert.equal(
  meleeRangedAccessOnlyBands.lanes.debug.corePressureRatio,
  weightedSimpleMeleeBands.lanes.debug.corePressureRatio,
  "Ranged access alone should not increase Core pressure ratio when no ranged output exists",
);
assert.equal(
  meleeRangedAccessOnlyBands.lanes.debug.secondaryProfileCoreContribution,
  0,
  "Ranged access alone should not add secondary Core contribution",
);
assert.ok(
  meleeRangedAccessOnlyBands.lanes.featuresVersatility.mainDrivers.some((entry) =>
    entry.includes("Ranged attack access") || entry.includes("mixed melee/ranged access"),
  ),
  "Melee + Ranged access should expose feature drivers",
);

const meleeRangedLowSecondary = runCase("melee/ranged low secondary output", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE", "RANGED"],
  meleePhysicalStrength: 3,
  rangedPhysicalStrength: 2,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  rangedDamageTypes: [{ damageType: { name: "Lightning", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  rangedTargets: 1,
  rangedDistanceFeet: 30,
});
const meleeRangedLowSecondaryBands = compareForgeOutputToBands(meleeRangedLowSecondary, FEATURE_WEIGHT_CONTEXT);
assert.equal(getProfile(meleeRangedLowSecondary, "ranged").totalWoundsPerSuccess, 4);
assert.equal(meleeRangedLowSecondaryBands.lanes.debug.secondaryProfileCoreMultiplier, 0.35);
assert.equal(meleeRangedLowSecondaryBands.lanes.debug.secondaryProfileCoreContribution, 1.4);
assert.ok(
  meleeRangedLowSecondaryBands.lanes.debug.secondaryProfileCoreDrivers.some((entry) =>
    entry.includes("ranged") && entry.includes("weighted core pressure"),
  ),
  "real secondary output should expose secondary Core contribution debug",
);
assert.ok(
  meleeRangedLowSecondaryBands.lanes.coreFunctionality.mainDrivers.some((entry) =>
    entry.includes("secondary profiles add 1.4 weighted core pressure"),
  ),
  "real secondary output should be visible in Core drivers",
);
assert.ok(
  meleeRangedLowSecondaryBands.lanes.debug.corePressureRatio >
    meleeRangedAccessOnlyBands.lanes.debug.corePressureRatio,
  "Real secondary output should increase Core pressure ratio above access-only",
);
assert.equal(
  meleeRangedLowSecondaryBands.lanes.coreFunctionality.status,
  "broad",
  "Low secondary output should visibly increase Core by one band",
);
assert.notEqual(
  meleeRangedLowSecondaryBands.lanes.coreFunctionality.status,
  "likely overloaded",
  "Low secondary output should not explode Core to likely overloaded",
);
assert.ok(
  meleeRangedLowSecondaryBands.lanes.debug.featurePressureRatio >
    simpleMeleeFeatureRatio,
  "Mixed access Features pressure should still increase independently of Core contribution",
);

const meleeRangedOverBandSecondary = runCase("melee/ranged over-band secondary output", {
  level: 5,
  rarity: "COMMON",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["MELEE", "RANGED"],
  meleePhysicalStrength: 10,
  rangedPhysicalStrength: 10,
  meleeDamageTypes: [{ damageType: { name: "Slashing", attackMode: "PHYSICAL" } }],
  rangedDamageTypes: [{ damageType: { name: "Lightning", attackMode: "PHYSICAL" } }],
  meleeTargets: 1,
  rangedTargets: 1,
  rangedDistanceFeet: 30,
});
const meleeRangedOverBandSecondaryBands = compareForgeOutputToBands(
  meleeRangedOverBandSecondary,
  FEATURE_WEIGHT_CONTEXT,
);
assert.equal(
  meleeRangedOverBandSecondaryBands.lanes.coreFunctionality.status,
  "likely overloaded",
  "Over-band secondary output should still trip the overloaded floor",
);
assert.ok(
  meleeRangedOverBandSecondaryBands.lanes.coreFunctionality.warnings.some((entry) =>
    entry.includes("ranged secondary weapon throughput is extreme-or-higher"),
  ),
  "Over-band secondary output should keep a secondary throughput warning",
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
  mixedMeleeRangedBands.lanes.featuresVersatility.mainDrivers.some((entry) => entry.startsWith("mixed melee/ranged access")),
  "mixed item should report mixed melee/ranged versatility",
);
assert.ok(
  mixedMeleeRangedBands.lanes.coreFunctionality.mainDrivers.some((entry) =>
    entry.includes("secondary weapon throughput"),
  ),
  "mixed item with ranged output should report secondary Core throughput",
);
assertFeatureDriver(
  "mixed melee/ranged",
  mixedMeleeRangedBands,
  "mixed melee/ranged access",
  1,
  "features.weight.mixedAccess.meleeRanged",
);
assert.ok(
  !mixedMeleeRangedBands.lanes.debug.missingFeatureWeightDrivers.some((entry) =>
    entry.label.includes("mixed melee/ranged access"),
  ),
  "mapped mixed access should not be listed as a fallback feature driver",
);
const tunedMixedMeleeRangedBands = compareForgeOutputToBands(
  mixedMeleeRanged,
  withFeatureWeightOverride("features.weight.mixedAccess.meleeRanged", 6),
);
assert.ok(
  tunedMixedMeleeRangedBands.lanes.debug.featureWeightTotal >
    mixedMeleeRangedBands.lanes.debug.featureWeightTotal,
  "Changing mixed melee/ranged expectation weight should change featureWeightTotal",
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
const rangedOneTwentyFeetLegacyOnlyBands = compareForgeOutputToBands(rangedOneTwentyFeet, LEGACY_ONLY_RANGE_CONTEXT);
const rangedOneTwentyFeetFallbackOnlyBands = compareForgeOutputToBands(rangedOneTwentyFeet, FALLBACK_ONLY_RANGE_CONTEXT);
const sameWoundsMeleeBands = compareForgeOutputToBands(simpleMelee, FEATURE_WEIGHT_CONTEXT);
const sameWoundsMeleeBand = sameWoundsMeleeBands.weaponProfiles.find((entry) => entry.profileKind === "melee");
const sameWoundsRangedBand = rangedThirtyFeetBands.weaponProfiles.find((entry) => entry.profileKind === "ranged");
assert.equal(sameWoundsRangedBand?.rangeModeCoreMultiplier, 0.8);
for (const [label, band] of [
  ["melee", sameWoundsMeleeBand],
  ["ranged", sameWoundsRangedBand],
] as const) {
  assert.ok(band, `${label} band should exist`);
  for (const [thresholdName, value] of Object.entries(band.thresholds)) {
    if (thresholdName === "level") continue;
    assert.equal(value % 2, 0, `${label} ${thresholdName} should be a legal even wound threshold`);
    assert.equal(Number.isInteger(value), true, `${label} ${thresholdName} should not be fractional`);
  }
}
assert.ok(
  (sameWoundsRangedBand?.rangeModeAdjustedExpectedValue ?? 0) <
    (sameWoundsMeleeBand?.rangeModeAdjustedExpectedValue ?? Number.POSITIVE_INFINITY),
  "Ranged profile should have a lower adjusted Core wound expectation than same-size melee",
);
assert.ok(
  rangedThirtyFeetBands.lanes.debug.corePressureRatio > sameWoundsMeleeBands.lanes.debug.corePressureRatio,
  "Same wounds and size should create higher Core pressure for ranged profiles than melee",
);
assert.ok(
  rangedOneTwentyFeetBands.lanes.debug.rangePressureScore > rangedThirtyFeetBands.lanes.debug.rangePressureScore,
  "120 ft ranged output should carry more Core range pressure than 30 ft",
);
assert.ok(
  rangedOneTwentyFeetBands.lanes.debug.featureWeightTotal > rangedThirtyFeetBands.lanes.debug.featureWeightTotal,
  "120 ft ranged output should carry more feature weight than 30 ft when Forge-Values rows exist",
);
assert.ok(
  rangedOneTwentyFeetBands.lanes.coreFunctionality.mainDrivers.some((entry) =>
    entry.includes("ranged distance 120 ft"),
  ),
  "ranged distance should be visible in Core drivers",
);
assertFeatureDriver(
  "ranged 120 ft",
  rangedOneTwentyFeetBands,
  "Ranged distance 120 ft",
  6,
  "features.weight.rangedDistance.61to120",
);
const rangedOneTwentyExpectationDriver = findFeatureDriver(rangedOneTwentyFeetBands, "Ranged distance 120 ft");
assert.ok(
  rangedOneTwentyExpectationDriver?.sourceKind === "forge_output_expectation" &&
    rangedOneTwentyExpectationDriver.sourceLabel === "features.weight.rangedDistance.61to120" &&
    rangedOneTwentyExpectationDriver.sourceValue === 6,
  "Present expectation row should report ForgeOutputExpectation source for 120 ft",
);
assert.ok(
  rangedOneTwentyFeetBands.lanes.featuresVersatility.mainDrivers.some((entry) =>
    entry.includes("Ranged distance 120 ft") &&
    entry.includes("ForgeOutputExpectation features.weight.rangedDistance.61to120 = 6"),
  ),
  "Ranged distance driver should show the applied 120 ft feature weight",
);
const rangedOneTwentyLegacyDriver = findFeatureDriver(rangedOneTwentyFeetLegacyOnlyBands, "Ranged distance 120 ft");
assert.ok(
  rangedOneTwentyLegacyDriver?.sourceKind === "legacy" &&
    rangedOneTwentyLegacyDriver.sourceLabel === "RangedDistanceFt/Weapon/120" &&
    rangedOneTwentyLegacyDriver.sourceValue === 2,
  "Legacy row should be used only when 120 ft expectation row is missing",
);
assert.ok(
  rangedOneTwentyFeetLegacyOnlyBands.lanes.featuresVersatility.mainDrivers.some((entry) =>
    entry.includes("legacy RangedDistanceFt/Weapon/120 = 2"),
  ),
  "Legacy driver text should be visible when expectation row is missing",
);
const rangedOneTwentyFallbackDriver = findFeatureDriver(rangedOneTwentyFeetFallbackOnlyBands, "Ranged distance 120 ft");
assert.ok(
  rangedOneTwentyFallbackDriver?.fallbackUsed &&
    rangedOneTwentyFallbackDriver.sourceKind === "fallback" &&
    rangedOneTwentyFallbackDriver.sourceValue === 1,
  "Missing expectation and legacy rows should report fallback source for 120 ft",
);
assert.ok(
  rangedOneTwentyFeetFallbackOnlyBands.lanes.debug.missingFeatureWeightDrivers.some((entry) =>
    entry.label.includes("Ranged distance 120 ft"),
  ),
  "Missing 120 ft expectation should be listed in missing feature drivers",
);
const tunedRangedOneTwentyFeetBands = compareForgeOutputToBands(
  rangedOneTwentyFeet,
  withFeatureWeightOverride("features.weight.rangedDistance.61to120", 8),
);
assert.ok(
  tunedRangedOneTwentyFeetBands.lanes.debug.featureWeightTotal >
    rangedOneTwentyFeetBands.lanes.debug.featureWeightTotal,
  "Changing ranged distance expectation weight should change featureWeightTotal",
);
const rangedTwoHundredFeetLowDamage = runCase("ranged 200 ft low damage", {
  level: 10,
  rarity: "RARE",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["RANGED"],
  rangedPhysicalStrength: 1,
  rangedDamageTypes: [{ damageType: { name: "Piercing", attackMode: "PHYSICAL" } }],
  rangedDistanceFeet: 200,
});
const rangedTwoHundredFeetLowDamageBands = compareForgeOutputToBands(
  rangedTwoHundredFeetLowDamage,
  FEATURE_WEIGHT_CONTEXT,
);
const rangedTwoHundredFeetLowDamageBand = rangedTwoHundredFeetLowDamageBands.weaponProfiles.find(
  (entry) => entry.profileKind === "ranged",
);
assert.equal(
  rangedTwoHundredFeetLowDamageBand?.rangeModeAdjustedExpectedValue,
  10,
  "Level 10 ranged standard expectation should normalize 9.6 to legal even 10",
);
assert.equal(
  (rangedTwoHundredFeetLowDamageBand?.rangeModeAdjustedExpectedValue ?? 0) % 2,
  0,
  "200 ft ranged expected value must be even",
);
assert.equal(
  Number.isInteger(rangedTwoHundredFeetLowDamageBand?.rangeModeAdjustedExpectedValue ?? 0),
  true,
  "200 ft ranged expected value must not be fractional",
);
assert.ok(
  rangedTwoHundredFeetLowDamageBand?.debugNotes.some((entry) =>
    entry.includes("range mode core expectation normalized standardMax"),
  ),
  "Adjusted ranged expectation should explain legal-even normalization in debug notes",
);
const rangedTwoHundredFeetOddExpectation = runCase("ranged 200 ft old odd expectation guard", {
  level: 13,
  rarity: "RARE",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["RANGED"],
  rangedPhysicalStrength: 1,
  rangedDamageTypes: [{ damageType: { name: "Piercing", attackMode: "PHYSICAL" } }],
  rangedDistanceFeet: 200,
});
const rangedTwoHundredFeetOddExpectationBand = compareForgeOutputToBands(
  rangedTwoHundredFeetOddExpectation,
  FEATURE_WEIGHT_CONTEXT,
).weaponProfiles.find((entry) => entry.profileKind === "ranged");
assert.equal(
  rangedTwoHundredFeetOddExpectationBand?.rangeModeAdjustedExpectedValue,
  12,
  "Old 16 x 0.8 => 12.8 => 13 case should normalize to legal even 12",
);
assert.equal(
  (rangedTwoHundredFeetOddExpectationBand?.rangeModeAdjustedExpectedValue ?? 0) % 2,
  0,
  "Old odd ranged expectation guard must remain even",
);
assert.ok(
  ["narrow", "moderate"].includes(rangedTwoHundredFeetLowDamageBands.lanes.coreFunctionality.status),
  "200 ft floor-damage ranged output should not become Broad Core from range alone",
);
assert.ok(
  rangedTwoHundredFeetLowDamageBands.lanes.debug.rangePressureScore >
    rangedOneTwentyFeetBands.lanes.debug.rangePressureScore,
  "200 ft should remain distinguishable as the practical extreme range bucket",
);
assert.ok(
  rangedTwoHundredFeetLowDamageBands.lanes.debug.featureWeightTotal >
    rangedOneTwentyFeetBands.lanes.debug.featureWeightTotal,
  "200 ft should carry more Features pressure than 120 ft in the 121+ bucket",
);
assertFeatureDriver(
  "ranged 200 ft",
  rangedTwoHundredFeetLowDamageBands,
  "Ranged distance 200 ft",
  10,
  "features.weight.rangedDistance.121plus",
);
assert.ok(
  rangedTwoHundredFeetLowDamageBands.lanes.featuresVersatility.mainDrivers.some((entry) =>
    entry.includes("Ranged distance 200 ft") &&
    entry.includes("ForgeOutputExpectation features.weight.rangedDistance.121plus = 10"),
  ),
  "Ranged distance driver should show the applied 200 ft feature weight",
);
const rangedTwoHundredFeetHighDamage = runCase("ranged 200 ft high damage", {
  level: 10,
  rarity: "RARE",
  type: "WEAPON",
  size: "ONE_HANDED",
  rangeCategories: ["RANGED"],
  rangedPhysicalStrength: 6,
  rangedDamageTypes: [{ damageType: { name: "Piercing", attackMode: "PHYSICAL" } }],
  rangedDistanceFeet: 200,
});
const rangedTwoHundredFeetHighDamageBands = compareForgeOutputToBands(
  rangedTwoHundredFeetHighDamage,
  FEATURE_WEIGHT_CONTEXT,
);
assert.ok(
  ["broad", "heavy", "likely overloaded"].includes(
    rangedTwoHundredFeetHighDamageBands.lanes.coreFunctionality.status,
  ),
  "Level 10 Rare 200 ft high-damage ranged output should not read as under-pressured",
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
assert.equal(overBudgetWithNegativeFeatureBands.lanes.debug.featureCount, 1);
assert.equal(overBudgetWithNegativeFeatureBands.lanes.debug.featureWeightTotal, 1);
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
