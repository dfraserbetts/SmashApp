import assert from "node:assert/strict";

import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import { DEFAULT_COMBAT_TUNING_VALUES } from "../lib/config/combatTuningShared";
import {
  computeMonsterOutcomes,
  type DefensiveProfileSource,
  type WeaponAttackSource,
} from "../lib/calculators/monsterOutcomeCalculator";
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

function getNonPowerPhysicalSurvivability(
  result: ReturnType<typeof computeMonsterOutcomes>,
): number {
  const debug = result.debug as {
    nonPowerContribution?: { axisVector?: { physicalSurvivability?: number } };
  };
  return Number(debug.nonPowerContribution?.axisVector?.physicalSurvivability ?? 0);
}

function getNonPowerMentalSurvivability(
  result: ReturnType<typeof computeMonsterOutcomes>,
): number {
  const debug = result.debug as {
    nonPowerContribution?: { axisVector?: { mentalSurvivability?: number } };
  };
  return Number(debug.nonPowerContribution?.axisVector?.mentalSurvivability ?? 0);
}

function getAtWillProfiles(result: ReturnType<typeof computeMonsterOutcomes>) {
  const debug = result.debug as {
    nonPowerContribution?: { sources?: { atWillProfiles?: unknown[] } };
  };
  return debug.nonPowerContribution?.sources?.atWillProfiles ?? [];
}

function getDefensiveProfiles(result: ReturnType<typeof computeMonsterOutcomes>) {
  const debug = result.debug as {
    nonPowerContribution?: { sources?: { defensiveProfiles?: unknown[] } };
  };
  return debug.nonPowerContribution?.sources?.defensiveProfiles ?? [];
}

function getDefensiveProfileContribution(result: ReturnType<typeof computeMonsterOutcomes>) {
  const debug = result.debug as {
    nonPowerContribution?: {
      sources?: {
        defensiveProfileContribution?: {
          physicalSurvivability?: number;
          mentalSurvivability?: number;
        };
      };
    };
  };
  return {
    physical: Number(
      debug.nonPowerContribution?.sources?.defensiveProfileContribution?.physicalSurvivability ?? 0,
    ),
    mental: Number(
      debug.nonPowerContribution?.sources?.defensiveProfileContribution?.mentalSurvivability ?? 0,
    ),
  };
}

function getDefensiveSharedDodgeContribution(result: ReturnType<typeof computeMonsterOutcomes>) {
  const debug = result.debug as {
    nonPowerContribution?: {
      sources?: {
        defensiveSharedDodgeContribution?: {
          physicalSurvivability?: number;
          mentalSurvivability?: number;
        };
      };
    };
  };
  return {
    physical: Number(
      debug.nonPowerContribution?.sources?.defensiveSharedDodgeContribution?.physicalSurvivability ??
        0,
    ),
    mental: Number(
      debug.nonPowerContribution?.sources?.defensiveSharedDodgeContribution?.mentalSurvivability ??
        0,
    ),
  };
}

function getDefensiveProfileTotals(result: ReturnType<typeof computeMonsterOutcomes>) {
  const debug = result.debug as {
    nonPowerContribution?: {
      sources?: {
        defensiveProfileTotals?: {
          physicalDodgeRawBonus?: number;
          mentalDodgeRawBonus?: number;
          physicalBlockPerSuccess?: number;
          mentalBlockPerSuccess?: number;
        };
      };
    };
  };
  return {
    physicalDodge: Number(
      debug.nonPowerContribution?.sources?.defensiveProfileTotals?.physicalDodgeRawBonus ?? 0,
    ),
    mentalDodge: Number(
      debug.nonPowerContribution?.sources?.defensiveProfileTotals?.mentalDodgeRawBonus ?? 0,
    ),
    physicalBlockPerSuccess: Number(
      debug.nonPowerContribution?.sources?.defensiveProfileTotals?.physicalBlockPerSuccess ?? 0,
    ),
    mentalBlockPerSuccess: Number(
      debug.nonPowerContribution?.sources?.defensiveProfileTotals?.mentalBlockPerSuccess ?? 0,
    ),
  };
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

const duplicatedNaturalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attacks: [createNaturalAttack(slashAttackConfig)],
    naturalAttack: {
      attackName: "Slash",
      attackConfig: slashAttackConfig,
    },
  },
  calculatorConfig,
);

const equippedClub = computeMonsterOutcomes(createBaseMonster(), calculatorConfig, {
  equippedWeaponSources: [clubWeaponSource],
});

assert.equal(naturalSlash.sustainedPhysical, equippedClub.sustainedPhysical);
assert.equal(getNonPowerPhysicalThreat(naturalSlash), getNonPowerPhysicalThreat(equippedClub));
assert.equal(getAtWillProfiles(naturalSlash).length, 1);
assert.equal(getAtWillProfiles(duplicatedNaturalSlash).length, 1);
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

function createDefensiveParityCase(
  source: DefensiveProfileSource | null,
  protection: { physicalProtection: number; mentalProtection: number },
) {
  return computeMonsterOutcomes(
    {
      ...createBaseMonster(),
      physicalProtection: protection.physicalProtection,
      mentalProtection: protection.mentalProtection,
      naturalPhysicalProtection:
        source?.sourceKind === "natural" ? protection.physicalProtection : 0,
      naturalMentalProtection: source?.sourceKind === "natural" ? protection.mentalProtection : 0,
    },
    calculatorConfig,
    {
      defensiveProfileSources: source ? [source] : [],
      defensiveProfileContext: {
        dodgeDice: 1,
        armorSkillDice: 2,
        willpowerDice: 2,
        totalPhysicalProtection: protection.physicalProtection,
        totalMentalProtection: protection.mentalProtection,
      },
      protectionTuning: DEFAULT_COMBAT_TUNING_VALUES,
    },
  );
}

const baselineDefence = createDefensiveParityCase(null, {
  physicalProtection: 0,
  mentalProtection: 0,
});

const naturalPhysicalDefence = createDefensiveParityCase(
  {
    sourceKind: "natural",
    sourceId: "hide",
    sourceLabel: "Hide",
    physicalProtection: 2,
    mentalProtection: 0,
  },
  { physicalProtection: 2, mentalProtection: 0 },
);

const equippedPhysicalDefence = createDefensiveParityCase(
  {
    sourceKind: "equipped",
    sourceId: "shield",
    sourceLabel: "Shield",
    physicalProtection: 2,
    mentalProtection: 0,
  },
  { physicalProtection: 2, mentalProtection: 0 },
);

const naturalMentalDefence = createDefensiveParityCase(
  {
    sourceKind: "natural",
    sourceId: "ward",
    sourceLabel: "Ward",
    physicalProtection: 0,
    mentalProtection: 3,
  },
  { physicalProtection: 0, mentalProtection: 3 },
);

const equippedMentalDefence = createDefensiveParityCase(
  {
    sourceKind: "equipped",
    sourceId: "mantle",
    sourceLabel: "Mantle",
    physicalProtection: 0,
    mentalProtection: 3,
  },
  { physicalProtection: 0, mentalProtection: 3 },
);

assert.equal(
  getNonPowerPhysicalSurvivability(naturalPhysicalDefence),
  getNonPowerPhysicalSurvivability(equippedPhysicalDefence),
);
assert.equal(getDefensiveProfiles(naturalPhysicalDefence).length, 1);
assert.equal(getDefensiveProfiles(equippedPhysicalDefence).length, 1);
assert.equal(
  getNonPowerMentalSurvivability(naturalMentalDefence),
  getNonPowerMentalSurvivability(equippedMentalDefence),
);

const ppvOnlyContribution = getDefensiveProfileContribution(naturalPhysicalDefence);
const mpvOnlyContribution = getDefensiveProfileContribution(naturalMentalDefence);
const baselineDodgeContribution = getDefensiveSharedDodgeContribution(baselineDefence);
const ppvOnlyDodgeContribution = getDefensiveSharedDodgeContribution(naturalPhysicalDefence);
const mpvOnlyDodgeContribution = getDefensiveSharedDodgeContribution(naturalMentalDefence);
const baselineDefenceTotals = getDefensiveProfileTotals(baselineDefence);
const ppvOnlyDefenceTotals = getDefensiveProfileTotals(naturalPhysicalDefence);
const ppvThreeDefence = createDefensiveParityCase(
  {
    sourceKind: "natural",
    sourceId: "plate",
    sourceLabel: "Plate",
    physicalProtection: 3,
    mentalProtection: 0,
  },
  { physicalProtection: 3, mentalProtection: 0 },
);
const ppvThreeDodgeContribution = getDefensiveSharedDodgeContribution(ppvThreeDefence);
assert.equal(ppvOnlyContribution.mental, 0);
assert.ok(ppvOnlyContribution.physical > 0);
assert.equal(mpvOnlyContribution.physical, 0);
assert.ok(mpvOnlyContribution.mental > 0);
assert.ok(baselineDodgeContribution.physical > 0);
assert.equal(baselineDodgeContribution.mental, 0);
assert.equal(baselineDodgeContribution.physical, baselineDefenceTotals.physicalDodge);
assert.equal(baselineDodgeContribution.mental, baselineDefenceTotals.mentalDodge);
assert.ok(ppvOnlyDodgeContribution.physical > 0);
assert.equal(ppvOnlyDodgeContribution.mental, 0);
assert.ok(mpvOnlyDodgeContribution.physical > 0);
assert.equal(mpvOnlyDodgeContribution.mental, 0);
assert.equal(mpvOnlyDodgeContribution.physical, baselineDodgeContribution.physical);
assert.equal(mpvOnlyDodgeContribution.mental, baselineDodgeContribution.mental);
assert.equal(ppvOnlyDodgeContribution.physical, ppvOnlyDefenceTotals.physicalDodge);
assert.equal(ppvOnlyDodgeContribution.mental, ppvOnlyDefenceTotals.mentalDodge);

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
      duplicateNaturalIngress: {
        naturalProfileCount: getAtWillProfiles(duplicatedNaturalSlash).length,
        naturalPhysicalThreat: getNonPowerPhysicalThreat(duplicatedNaturalSlash),
      },
      rangedParity: {
        natural: getNonPowerPhysicalThreat(naturalRanged),
        equipped: getNonPowerPhysicalThreat(equippedRanged),
      },
      defensiveParity: {
        physical: {
          natural: getNonPowerPhysicalSurvivability(naturalPhysicalDefence),
          equipped: getNonPowerPhysicalSurvivability(equippedPhysicalDefence),
        },
        mental: {
          natural: getNonPowerMentalSurvivability(naturalMentalDefence),
          equipped: getNonPowerMentalSurvivability(equippedMentalDefence),
        },
      },
      defensiveProfileRouting: {
        ppvOnly: ppvOnlyContribution,
        mpvOnly: mpvOnlyContribution,
      },
      defensiveDodgeRouting: {
        baseline: baselineDodgeContribution,
        ppvOnly: ppvOnlyDodgeContribution,
        ppvThree: ppvThreeDodgeContribution,
        mpvOnly: mpvOnlyDodgeContribution,
      },
      defensiveDodgeTotals: {
        baseline: baselineDefenceTotals,
        ppvOnly: ppvOnlyDefenceTotals,
      },
    },
    null,
    2,
  ),
);

console.log("monsterOutcomeCalculator.smoke.ts passed");
