import assert from "node:assert/strict";

import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import { computeMonsterOutcomes, type WeaponAttackSource } from "../lib/calculators/monsterOutcomeCalculator";
import type { MonsterAttack, MonsterUpsertInput } from "../lib/summoning/types";

function createBaseMonster(): MonsterUpsertInput {
  return {
    name: "Parity Smoke",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: 1,
    tier: "ELITE",
    legendary: false,
    mainHandItemId: null,
    offHandItemId: null,
    smallItemId: null,
    headArmorItemId: null,
    shoulderArmorItemId: null,
    torsoArmorItemId: null,
    legsArmorItemId: null,
    feetArmorItemId: null,
    headItemId: null,
    neckItemId: null,
    armsItemId: null,
    beltItemId: null,
    customNotes: null,
    limitBreakName: null,
    limitBreakTier: null,
    limitBreakTriggerText: null,
    limitBreakAttribute: null,
    limitBreakThresholdSuccesses: null,
    limitBreakCostText: null,
    limitBreakEffectText: null,
    limitBreak2Name: null,
    limitBreak2Tier: null,
    limitBreak2TriggerText: null,
    limitBreak2Attribute: null,
    limitBreak2ThresholdSuccesses: null,
    limitBreak2CostText: null,
    limitBreak2EffectText: null,
    physicalResilienceCurrent: 20,
    physicalResilienceMax: 20,
    mentalPerseveranceCurrent: 20,
    mentalPerseveranceMax: 20,
    physicalProtection: 0,
    mentalProtection: 0,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 0,
    attackDie: "D8",
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: "D8",
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D8",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D8",
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: "D8",
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: "D8",
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: 0,
    weaponSkillModifier: 0,
    armorSkillValue: 0,
    armorSkillModifier: 0,
    tags: [],
    traits: [],
    attacks: [],
    naturalAttack: null,
    powers: [],
  };
}

function createNaturalAttack(attack: MonsterAttack["attackConfig"]): MonsterAttack {
  return {
    sortOrder: 0,
    attackMode: "NATURAL",
    attackName: "Slash",
    attackConfig: attack,
  };
}

function getNonPowerPhysicalThreat(result: ReturnType<typeof computeMonsterOutcomes>): number {
  const debug = result.debug as {
    nonPowerContribution?: { axisVector?: { physicalThreat?: number } };
  };
  return Number(debug.nonPowerContribution?.axisVector?.physicalThreat ?? 0);
}

function getAtWillProfiles(result: ReturnType<typeof computeMonsterOutcomes>) {
  const debug = result.debug as {
    nonPowerContribution?: { sources?: { atWillProfiles?: unknown[] } };
  };
  return debug.nonPowerContribution?.sources?.atWillProfiles ?? [];
}

const slashAttackConfig = {
  melee: {
    enabled: true,
    targets: 1,
    physicalStrength: 1,
    mentalStrength: 0,
    damageTypes: [{ name: "Slashing", mode: "PHYSICAL" as const }],
    attackEffects: [],
  },
};

const clubWeaponSource: WeaponAttackSource = {
  id: "club",
  label: "Main Hand: Club",
  attackConfig: {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: 1,
      mentalStrength: 0,
      damageTypes: [{ name: "Blunt", mode: "PHYSICAL" as const }],
    },
  },
};

const naturalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attacks: [createNaturalAttack(slashAttackConfig)],
  },
  calculatorConfig,
);

const equippedClub = computeMonsterOutcomes(createBaseMonster(), calculatorConfig, {
  equippedWeaponSources: [clubWeaponSource],
});

assert.equal(naturalSlash.sustainedPhysical, equippedClub.sustainedPhysical);
assert.equal(getNonPowerPhysicalThreat(naturalSlash), getNonPowerPhysicalThreat(equippedClub));
assert.equal(getAtWillProfiles(naturalSlash).length, 1);
assert.equal(getAtWillProfiles(equippedClub).length, 1);

const rangedAttackConfig = {
  ranged: {
    enabled: true,
    targets: 1,
    distance: 30,
    physicalStrength: 2,
    mentalStrength: 0,
    damageTypes: [{ name: "Piercing", mode: "PHYSICAL" as const }],
    attackEffects: [],
  },
};

const bowWeaponSource: WeaponAttackSource = {
  id: "bow",
  label: "Main Hand: Bow",
  attackConfig: {
    ranged: {
      enabled: true,
      targets: 1,
      distance: 30,
      physicalStrength: 2,
      mentalStrength: 0,
      damageTypes: [{ name: "Piercing", mode: "PHYSICAL" as const }],
    },
  },
};

const naturalRanged = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attacks: [createNaturalAttack(rangedAttackConfig)],
  },
  calculatorConfig,
);

const equippedRanged = computeMonsterOutcomes(createBaseMonster(), calculatorConfig, {
  equippedWeaponSources: [bowWeaponSource],
});

assert.equal(naturalRanged.sustainedPhysical, equippedRanged.sustainedPhysical);
assert.equal(getNonPowerPhysicalThreat(naturalRanged), getNonPowerPhysicalThreat(equippedRanged));

const legacyNaturalSlashPhysicalThreat =
  1 *
  ((8 - 3) / 8) *
  calculatorConfig.baselineParty.netSuccessMultiplier *
  1 *
  2;

console.log(
  JSON.stringify(
    {
      clubVsSlash: {
        before: {
          naturalSlashPhysicalThreat: legacyNaturalSlashPhysicalThreat,
          equippedClubPhysicalThreat: getNonPowerPhysicalThreat(equippedClub),
        },
        after: {
          naturalSlashPhysicalThreat: getNonPowerPhysicalThreat(naturalSlash),
          equippedClubPhysicalThreat: getNonPowerPhysicalThreat(equippedClub),
        },
      },
      rangedParity: {
        natural: getNonPowerPhysicalThreat(naturalRanged),
        equipped: getNonPowerPhysicalThreat(equippedRanged),
      },
    },
    null,
    2,
  ),
);

console.log("monsterOutcomeCalculator.smoke.ts passed");
