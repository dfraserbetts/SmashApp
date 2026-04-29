import assert from "node:assert/strict";

import {
  buildForgeOutputProfile,
  type ForgeOutputProfile,
  type ForgeOutputProfileInput,
} from "../lib/forge/outputProfile";
import { compareForgeOutputToBands } from "../lib/forge/outputBands";

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
  aoeCenterRangeFeet: 40,
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
const aoeBands = compareForgeOutputToBands(aoeProfile);
assert.ok(
  aoeBands.lanes.featuresVersatility.mainDrivers.includes("AoE geometry"),
  "AoE item should report AoE geometry as feature breadth",
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
const mixedMeleeRangedBands = compareForgeOutputToBands(mixedMeleeRanged);
assert.ok(
  mixedMeleeRangedBands.lanes.featuresVersatility.mainDrivers.includes("2 attack profiles"),
  "mixed item should report extra attack profile breadth",
);
assert.ok(
  mixedMeleeRangedBands.lanes.featuresVersatility.mainDrivers.includes("mixed melee/ranged access"),
  "mixed item should report mixed melee/ranged versatility",
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
