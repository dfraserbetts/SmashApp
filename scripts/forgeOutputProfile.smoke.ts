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
assert.equal(simpleMeleeBand?.classification, "standard");

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

const shield = runCase("shield", {
  level: 5,
  rarity: "UNCOMMON",
  type: "SHIELD",
  size: "ONE_HANDED",
  shieldHasAttack: true,
  rangeCategories: ["MELEE"],
  meleePhysicalStrength: 2,
  meleeDamageTypes: [{ damageType: { name: "Bludgeoning", attackMode: "PHYSICAL" } }],
  ppv: 1,
  mpv: 1,
  shieldAttributes: [{ shieldAttribute: { name: "Bulwark" } }],
});
assert.equal(getProfile(shield, "melee").totalWoundsPerSuccess, 4);
assert.equal(shield.shieldCoPresence.hasShieldAttack, true);
assert.equal(shield.shieldCoPresence.hasDefenceOutput, true);
assert.equal(shield.shieldCoPresence.hasAttackAndDefence, true);
const shieldBands = compareForgeOutputToBands(shield);
assert.equal(shieldBands.shield.hasAttackAndDefence, true);
assert.equal(shieldBands.shield.shieldSplitWarningLevel, "watch");

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

const summary = [
  ["simple melee", getProfile(simpleMelee, "melee").totalWoundsPerSuccess],
  ["dual damage melee", getProfile(dualDamageMelee, "melee").totalWoundsPerSuccess],
  ["ranged mental", getProfile(rangedMental, "ranged").totalWoundsPerSuccess],
  ["aoe", getProfile(aoeProfile, "aoe").totalWoundsPerSuccess],
  ["shield attack+defence", shield.shieldCoPresence.hasAttackAndDefence ? "yes" : "no"],
  ["mixed melee", getProfile(mixedMeleeRanged, "melee").totalWoundsPerSuccess],
  ["mixed ranged", getProfile(mixedMeleeRanged, "ranged").totalWoundsPerSuccess],
  ["simple melee band", simpleMeleeBand?.classification ?? "missing"],
  ["dual damage melee band", dualDamageMeleeBand?.classification ?? "missing"],
  ["ranged mental pressure band", rangedMentalBand?.totalPressureClassification ?? "missing"],
  ["over-budget ranged band", overBudgetBand?.classification ?? "missing"],
  ["shield split warning", shieldBands.shield.shieldSplitWarningLevel],
];

console.log("Forge output profile smoke passed.");
for (const [label, value] of summary) {
  console.log(`- ${label}: ${value}`);
}
