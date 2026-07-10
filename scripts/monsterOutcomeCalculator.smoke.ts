import assert from "node:assert/strict";

import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import { DEFAULT_COMBAT_TUNING_VALUES } from "../lib/config/combatTuningShared";
import {
  computeMonsterOutcomes,
  expectedTieredSuccesses,
  expectedTieredSuccessesPerDie,
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

function assertApprox(actual: number, expected: number, epsilon: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

function dieFromSides(sides: number): "D4" | "D6" | "D8" | "D10" | "D12" {
  if (sides >= 12) return "D12";
  if (sides >= 10) return "D10";
  if (sides >= 8) return "D8";
  if (sides >= 6) return "D6";
  return "D4";
}

function computeDurabilityBaselineAnchor(baselineId: string) {
  const baseline = calculatorConfig.durabilityAxisTuning.baselines.find(
    (candidate) => candidate.id === baselineId,
  );
  assert.ok(baseline, `Missing durability baseline ${baselineId}`);
  const physical = baseline.physical;
  const mental = baseline.mental;
  return computeMonsterOutcomes(
    {
      ...createBaseMonster(),
      level: baseline.level,
      tier: baseline.tier,
      legendary: baseline.legendary,
      attackDie: dieFromSides(physical.representativeInjuryDieSides),
      guardDie: dieFromSides(physical.expectedDefenceDieSides),
      fortitudeDie: "D4",
      intellectDie: dieFromSides(mental.representativeInjuryDieSides),
      synergyDie: "D4",
      braveryDie: dieFromSides(mental.expectedDefenceDieSides),
      physicalResilienceMax: physical.expectedHp,
      mentalPerseveranceMax: mental.expectedHp,
      physicalProtection: physical.expectedProtection,
      mentalProtection: mental.expectedProtection,
      naturalPhysicalProtection: physical.expectedProtection,
      naturalMentalProtection: mental.expectedProtection,
      armorSkillValue: physical.expectedDefenceDice,
    },
    calculatorConfig,
    {
      protectionTuning: DEFAULT_COMBAT_TUNING_VALUES,
      defensiveProfileSources: [
        {
          sourceKind: "natural",
          sourceLabel: baseline.id,
          physicalProtection: physical.expectedProtection,
          mentalProtection: mental.expectedProtection,
        },
      ],
      defensiveProfileContext: {
        totalPhysicalProtection: physical.expectedProtection,
        totalMentalProtection: mental.expectedProtection,
        armorSkillDice: physical.expectedDefenceDice,
        willpowerDice: mental.expectedDefenceDice,
        dodgeDice: physical.expectedDodgeDice,
        unarmoredDodgeDice: physical.expectedDodgeDice,
      },
    },
  );
}

assertApprox(expectedTieredSuccessesPerDie(4), 0.25, 0.000001, "D4 expected successes");
assertApprox(expectedTieredSuccessesPerDie(6), 0.5, 0.000001, "D6 expected successes");
assertApprox(expectedTieredSuccessesPerDie(8), 0.625, 0.000001, "D8 expected successes");
assertApprox(expectedTieredSuccessesPerDie(10), 0.8, 0.000001, "D10 expected successes");
assertApprox(expectedTieredSuccessesPerDie(12), 1, 0.000001, "D12 expected successes");
assert.equal(expectedTieredSuccesses({ dieSides: 8, diceCount: 3 }), 1.875);
assertApprox(expectedTieredSuccesses({ dieSides: 12, diceCount: 4 }), 4, 0.000001, "4 x D12 expected successes");
assert.ok(
  expectedTieredSuccesses({ dieSides: 8, diceCount: 3, rerollFailedDiceOnce: true }) >
    expectedTieredSuccesses({ dieSides: 8, diceCount: 3 }),
);

function getNonPowerPhysicalThreat(result: ReturnType<typeof computeMonsterOutcomes>): number {
  const debug = result.debug as {
    nonPowerContribution?: { axisVector?: { physicalThreat?: number } };
  };
  return Number(debug.nonPowerContribution?.axisVector?.physicalThreat ?? 0);
}

function getNonPowerMentalThreat(result: ReturnType<typeof computeMonsterOutcomes>): number {
  const debug = result.debug as {
    nonPowerContribution?: { axisVector?: { mentalThreat?: number } };
  };
  return Number(debug.nonPowerContribution?.axisVector?.mentalThreat ?? 0);
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

function getSuppressedOffensiveResistContributions(
  result: ReturnType<typeof computeMonsterOutcomes>,
) {
  const debug = result.debug as {
    nonPowerContribution?: {
      sources?: {
        suppressedOffensiveResistContributions?: {
          attackResistContribution?: number;
          intellectResistContribution?: number;
          supportResistContribution?: number;
          braveryResistContribution?: number;
        };
      };
    };
  };
  return debug.nonPowerContribution?.sources?.suppressedOffensiveResistContributions ?? {};
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

function getDefensivePackageDiagnostics(result: ReturnType<typeof computeMonsterOutcomes>) {
  const debug = result.debug as {
    nonPowerContribution?: {
      sources?: {
        defensivePackageDiagnostics?: {
          source?: string;
          physical?: {
            naturalPackage?: { value?: number; classification?: string; packageBand?: { standardMax?: number } };
            equippedArmourPackage?: { value?: number; classification?: string; packageBand?: { standardMax?: number } };
            shieldOverlay?: { value?: number; classification?: string };
            combinedEquipped?: { value?: number; classification?: string };
          };
          mental?: {
            naturalPackage?: { value?: number; classification?: string; packageBand?: { standardMax?: number } };
            equippedArmourPackage?: { value?: number; classification?: string; packageBand?: { standardMax?: number } };
            shieldOverlay?: { value?: number; classification?: string };
            combinedEquipped?: { value?: number; classification?: string };
          };
          armourPackageSlots?: Record<
            string,
            { physicalProtection?: number; mentalProtection?: number; sources?: unknown[] }
          >;
          shieldExpected?: {
            share?: number;
            physicalStandardMax?: number;
            mentalStandardMax?: number;
          };
        };
      };
    };
  };
  return debug.nonPowerContribution?.sources?.defensivePackageDiagnostics;
}

function getRawDefensivePackage(result: ReturnType<typeof computeMonsterOutcomes>) {
  const direct = getDefensiveProfileContribution(result);
  const dodge = getDefensiveSharedDodgeContribution(result);
  return {
    physical: direct.physical + dodge.physical,
    mental: direct.mental + dodge.mental,
    direct,
    dodge,
  };
}

function getOutcomePowerDebug(result: ReturnType<typeof computeMonsterOutcomes>) {
  const debug = result.debug as {
    powerContribution?: {
      axisVector?: { mobility?: number };
      canonicalPowerAxisVector?: { mobility?: number };
      effectivePowerAxisVector?: { mobility?: number };
      expectedAttackOutput?: {
        source?: string;
        packetCount?: number;
        axisVector?: { physicalThreat?: number; mentalThreat?: number };
      };
      availabilityFactor?: number | null;
      effectivePowerFactor?: number | null;
      factorFormulaLabel?: string;
      basePowerValue?: number | null;
      perPowerAvailability?: Array<{
        availabilityFactor?: number;
        effectivePowerFactor?: number;
        threatEffectivePowerFactor?: number;
        utilityEffectivePowerFactor?: number;
        utilityEffectivePowerExponent?: number | null;
        utilityFactorFormulaLabel?: string;
        axisEffectivePowerFactors?: { mobility?: number; physicalThreat?: number };
        tableCooldownAvailabilityFactor?: number;
        radarLoadExpressionFactor?: number;
        radarCooldownLoadExponent?: number | null;
        derivedCooldownLoadClamped?: number | null;
        factorFormulaLabel?: string;
        cooldownTurns?: number | null;
        canonicalPowerAxisVector?: { mobility?: number };
        effectivePowerAxisVector?: { mobility?: number };
      }>;
    };
    finalPreNormalizationAxes?: { mobility?: number };
  };
  return debug.powerContribution ?? {};
}

function getPressureAxisDebug(result: ReturnType<typeof computeMonsterOutcomes>) {
  const debug = result.debug as {
    normalizationBreakdown?: {
      pressureAxisBaselineModel?: {
        mode?: string;
        baselinePackageId?: string | null;
        meaningfulActionCount?: number;
        components?: Record<string, number>;
        deduplicatedFunctionalSignatures?: string[];
        unsupportedPackageWarnings?: string[];
        rawActualPressureProxy?: number;
        rawBaselinePressureProxy?: number | null;
        ratioToBaseline?: number | null;
        finalScore?: number | null;
      };
    };
  };
  return debug.normalizationBreakdown?.pressureAxisBaselineModel;
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

const mentalSlashAttackConfig = {
  melee: {
    enabled: true,
    targets: 1,
    physicalStrength: 0,
    mentalStrength: 1,
    damageTypes: [{ name: "Psychic", mode: "MENTAL" as const }],
    attackEffects: [],
  },
};

const twoTargetSlashAttackConfig = {
  melee: {
    enabled: true,
    targets: 2,
    physicalStrength: 1,
    mentalStrength: 0,
    damageTypes: [{ name: "Slashing", mode: "PHYSICAL" as const }],
    attackEffects: [],
  },
};

const aoeSlashAttackConfig = {
  aoe: {
    enabled: true,
    count: 3,
    centerRange: 30,
    shape: "SPHERE" as const,
    sphereRadiusFeet: 10,
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

const lowAttackPhysicalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D6",
    braveryDie: "D6",
    weaponSkillValue: 1,
    attacks: [createNaturalAttack(slashAttackConfig)],
  },
  calculatorConfig,
);

const highAttackPhysicalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D12",
    braveryDie: "D6",
    weaponSkillValue: 1,
    attacks: [createNaturalAttack(slashAttackConfig)],
  },
  calculatorConfig,
);

const lowAttackMentalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D6",
    intellectDie: "D12",
    braveryDie: "D6",
    weaponSkillValue: 1,
    attacks: [createNaturalAttack(mentalSlashAttackConfig)],
  },
  calculatorConfig,
);

const highAttackMentalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D12",
    intellectDie: "D6",
    braveryDie: "D6",
    weaponSkillValue: 1,
    attacks: [createNaturalAttack(mentalSlashAttackConfig)],
  },
  calculatorConfig,
);

const highIntellectOnlyMentalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D6",
    intellectDie: "D12",
    braveryDie: "D6",
    weaponSkillValue: 1,
    attacks: [createNaturalAttack(mentalSlashAttackConfig)],
  },
  calculatorConfig,
);

const oneDiePhysicalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D8",
    braveryDie: "D8",
    weaponSkillValue: 1,
    attacks: [createNaturalAttack(slashAttackConfig)],
  },
  calculatorConfig,
);

const threeDicePhysicalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D8",
    braveryDie: "D8",
    weaponSkillValue: 3,
    attacks: [createNaturalAttack(slashAttackConfig)],
  },
  calculatorConfig,
);

const strengthOnePhysicalSlash = oneDiePhysicalSlash;
const strengthTwoPhysicalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D8",
    braveryDie: "D8",
    weaponSkillValue: 1,
    attacks: [createNaturalAttack({
      melee: {
        ...slashAttackConfig.melee,
        physicalStrength: 2,
      },
    })],
  },
  calculatorConfig,
);
const strengthThreePhysicalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D8",
    braveryDie: "D8",
    weaponSkillValue: 1,
    attacks: [createNaturalAttack({
      melee: {
        ...slashAttackConfig.melee,
        physicalStrength: 3,
      },
    })],
  },
  calculatorConfig,
);
const targetOnePhysicalSlash = oneDiePhysicalSlash;
const targetTwoPhysicalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D8",
    braveryDie: "D8",
    weaponSkillValue: 1,
    attacks: [createNaturalAttack(twoTargetSlashAttackConfig)],
  },
  calculatorConfig,
);
const aoePhysicalSlash = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D8",
    braveryDie: "D8",
    weaponSkillValue: 1,
    attacks: [createNaturalAttack(aoeSlashAttackConfig)],
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

const highIntellectResistNakedMonster = {
  ...createBaseMonster(),
  tier: "MINION" as const,
  physicalResilienceCurrent: 8,
  physicalResilienceMax: 8,
  mentalPerseveranceCurrent: 8,
  mentalPerseveranceMax: 8,
  intellectResistDie: 5,
  attacks: [],
  naturalAttack: null,
  powers: [],
  traits: [],
};
const highIntellectResistNaked = computeMonsterOutcomes(
  highIntellectResistNakedMonster,
  calculatorConfig,
);
const highIntellectResistSuppressed =
  getSuppressedOffensiveResistContributions(highIntellectResistNaked);

assert.equal(highIntellectResistNaked.sustainedPhysical, 0);
assert.equal(highIntellectResistNaked.sustainedMental, 0);
assert.equal(getNonPowerPhysicalThreat(highIntellectResistNaked), 0);
assert.equal(getNonPowerMentalThreat(highIntellectResistNaked), 0);
assert.equal(getAtWillProfiles(highIntellectResistNaked).length, 0);
assert.ok(Number(highIntellectResistSuppressed.intellectResistContribution ?? 0) > 0);

assert.ok(
  getNonPowerPhysicalThreat(highAttackPhysicalSlash) >
    getNonPowerPhysicalThreat(lowAttackPhysicalSlash),
);
assert.ok(
  getNonPowerMentalThreat(highAttackMentalSlash) >
    getNonPowerMentalThreat(lowAttackMentalSlash),
);
assert.equal(
  getNonPowerMentalThreat(lowAttackMentalSlash),
  getNonPowerMentalThreat(highIntellectOnlyMentalSlash),
);
assert.ok(
  getNonPowerPhysicalThreat(threeDicePhysicalSlash) >
    getNonPowerPhysicalThreat(oneDiePhysicalSlash),
);
assert.ok(
  getNonPowerPhysicalThreat(strengthTwoPhysicalSlash) >
    getNonPowerPhysicalThreat(strengthOnePhysicalSlash),
);
assert.ok(
  getNonPowerPhysicalThreat(strengthThreePhysicalSlash) >
    getNonPowerPhysicalThreat(strengthTwoPhysicalSlash),
);
assert.ok(
  getNonPowerPhysicalThreat(targetTwoPhysicalSlash) >
    getNonPowerPhysicalThreat(targetOnePhysicalSlash),
);
assert.ok(
  getNonPowerPhysicalThreat(aoePhysicalSlash) >
    getNonPowerPhysicalThreat(targetOnePhysicalSlash),
);
assert.equal((getAtWillProfiles(threeDicePhysicalSlash)[0] as { segments?: Array<{ diceCount?: number }> }).segments?.[0]?.diceCount, 3);

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
  tuningOverrides?: Partial<typeof DEFAULT_COMBAT_TUNING_VALUES>,
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
      protectionTuning: {
        ...DEFAULT_COMBAT_TUNING_VALUES,
        ...tuningOverrides,
      },
    },
  );
}

function createDefensivePackageCase(
  sources: DefensiveProfileSource[],
  protection: { physicalProtection: number; mentalProtection: number },
) {
  const naturalPhysicalProtection = sources.reduce(
    (sum, source) => sum + (source.sourceKind === "natural" ? Number(source.physicalProtection ?? 0) : 0),
    0,
  );
  const naturalMentalProtection = sources.reduce(
    (sum, source) => sum + (source.sourceKind === "natural" ? Number(source.mentalProtection ?? 0) : 0),
    0,
  );
  return computeMonsterOutcomes(
    {
      ...createBaseMonster(),
      level: 5,
      tier: "SOLDIER",
      physicalProtection: protection.physicalProtection,
      mentalProtection: protection.mentalProtection,
      naturalPhysicalProtection,
      naturalMentalProtection,
    },
    calculatorConfig,
    {
      defensiveProfileSources: sources,
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

function buildProtectionLadder(
  lane: "physical" | "mental",
  values: number[],
  tuningOverrides?: Partial<typeof DEFAULT_COMBAT_TUNING_VALUES>,
) {
  return values.map((value) => {
    const result = createDefensiveParityCase(
      {
        sourceKind: "natural",
        sourceId: `${lane}-${value}`,
        sourceLabel: `${lane}-${value}`,
        physicalProtection: lane === "physical" ? value : 0,
        mentalProtection: lane === "mental" ? value : 0,
      },
      {
        physicalProtection: lane === "physical" ? value : 0,
        mentalProtection: lane === "mental" ? value : 0,
      },
      tuningOverrides,
    );
    const rawPackage = getRawDefensivePackage(result);
    return {
      value,
      total: lane === "physical" ? rawPackage.physical : rawPackage.mental,
      direct:
        lane === "physical" ? rawPackage.direct.physical : rawPackage.direct.mental,
      dodge: lane === "physical" ? rawPackage.dodge.physical : rawPackage.dodge.mental,
    };
  });
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

const tunedMentalProtectionOverrides = {
  mentalDefenceStringProtectionOutputMaxShare: 0.7,
  mentalDefenceStringProtectionOutputScale: 8,
} as const;

const tunedNaturalMentalDefence = createDefensiveParityCase(
  {
    sourceKind: "natural",
    sourceId: "ward-tuned",
    sourceLabel: "Ward Tuned",
    physicalProtection: 0,
    mentalProtection: 3,
  },
  { physicalProtection: 0, mentalProtection: 3 },
  tunedMentalProtectionOverrides,
);

const tunedEquippedMentalDefence = createDefensiveParityCase(
  {
    sourceKind: "equipped",
    sourceId: "mantle-tuned",
    sourceLabel: "Mantle Tuned",
    physicalProtection: 0,
    mentalProtection: 3,
  },
  { physicalProtection: 0, mentalProtection: 3 },
  tunedMentalProtectionOverrides,
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
assert.equal(
  getNonPowerMentalSurvivability(tunedNaturalMentalDefence),
  getNonPowerMentalSurvivability(tunedEquippedMentalDefence),
);

const naturalPpvPackage = createDefensivePackageCase(
  [
    {
      sourceKind: "natural",
      sourceId: "natural-ppv-10",
      sourceLabel: "Natural PPV Package",
      physicalProtection: 10,
      mentalProtection: 0,
    },
  ],
  { physicalProtection: 10, mentalProtection: 0 },
);
const armourPpvPackageSources: DefensiveProfileSource[] = [
  ["HEAD", 1],
  ["SHOULDERS", 2],
  ["TORSO", 4],
  ["LEGS", 2],
  ["FEET", 1],
].map(([armorLocation, physicalProtection]) => ({
  sourceKind: "equipped",
  sourceId: `ppv-${armorLocation}`,
  sourceLabel: `${armorLocation} PPV`,
  physicalProtection: Number(physicalProtection),
  mentalProtection: 0,
  equippedItemType: "ARMOR",
  armorLocation: String(armorLocation),
}));
const equippedPpvPackage = createDefensivePackageCase(
  armourPpvPackageSources,
  { physicalProtection: 10, mentalProtection: 0 },
);
const equippedPpvPackageWithShield = createDefensivePackageCase(
  [
    ...armourPpvPackageSources,
    {
      sourceKind: "equipped",
      sourceId: "shield-ppv-2",
      sourceLabel: "Shield PPV",
      physicalProtection: 2,
      mentalProtection: 0,
      equippedItemType: "SHIELD",
      armorLocation: null,
    },
  ],
  { physicalProtection: 12, mentalProtection: 0 },
);
const naturalMpvPackage = createDefensivePackageCase(
  [
    {
      sourceKind: "natural",
      sourceId: "natural-mpv-8",
      sourceLabel: "Natural MPV Package",
      physicalProtection: 0,
      mentalProtection: 8,
    },
  ],
  { physicalProtection: 0, mentalProtection: 8 },
);
const armourMpvPackageSources: DefensiveProfileSource[] = [
  ["HEAD", 1],
  ["SHOULDERS", 2],
  ["TORSO", 2],
  ["LEGS", 2],
  ["FEET", 1],
].map(([armorLocation, mentalProtection]) => ({
  sourceKind: "equipped",
  sourceId: `mpv-${armorLocation}`,
  sourceLabel: `${armorLocation} MPV`,
  physicalProtection: 0,
  mentalProtection: Number(mentalProtection),
  equippedItemType: "ARMOR",
  armorLocation: String(armorLocation),
}));
const equippedMpvPackage = createDefensivePackageCase(
  armourMpvPackageSources,
  { physicalProtection: 0, mentalProtection: 8 },
);
const equippedMpvPackageWithShield = createDefensivePackageCase(
  [
    ...armourMpvPackageSources,
    {
      sourceKind: "equipped",
      sourceId: "shield-mpv-2",
      sourceLabel: "Shield MPV",
      physicalProtection: 0,
      mentalProtection: 2,
      equippedItemType: "SHIELD",
      armorLocation: null,
    },
  ],
  { physicalProtection: 0, mentalProtection: 10 },
);
const naturalPpvDiagnostics = getDefensivePackageDiagnostics(naturalPpvPackage);
const equippedPpvDiagnostics = getDefensivePackageDiagnostics(equippedPpvPackage);
const equippedPpvShieldDiagnostics = getDefensivePackageDiagnostics(equippedPpvPackageWithShield);
const naturalMpvDiagnostics = getDefensivePackageDiagnostics(naturalMpvPackage);
const equippedMpvDiagnostics = getDefensivePackageDiagnostics(equippedMpvPackage);
const equippedMpvShieldDiagnostics = getDefensivePackageDiagnostics(equippedMpvPackageWithShield);
assert.equal(naturalPpvDiagnostics?.source, "defensive_package_parity_v1");
assert.equal(naturalPpvDiagnostics?.physical?.naturalPackage?.value, 10);
assert.equal(naturalPpvDiagnostics?.physical?.naturalPackage?.classification, "standard");
assert.equal(naturalPpvDiagnostics?.physical?.naturalPackage?.packageBand?.standardMax, 10);
assert.equal(equippedPpvDiagnostics?.physical?.equippedArmourPackage?.value, 10);
assert.equal(equippedPpvDiagnostics?.physical?.equippedArmourPackage?.classification, "standard");
assert.equal(equippedPpvDiagnostics?.armourPackageSlots?.HEAD?.physicalProtection, 1);
assert.equal(equippedPpvDiagnostics?.armourPackageSlots?.TORSO?.physicalProtection, 4);
assert.equal(equippedPpvShieldDiagnostics?.physical?.shieldOverlay?.value, 2);
assert.equal(equippedPpvShieldDiagnostics?.physical?.combinedEquipped?.value, 12);
assert.equal(equippedPpvShieldDiagnostics?.physical?.combinedEquipped?.classification, "high");
assert.equal(equippedPpvShieldDiagnostics?.shieldExpected?.share, 0.2);
assert.equal(equippedPpvShieldDiagnostics?.shieldExpected?.physicalStandardMax, 2);
assert.equal(naturalMpvDiagnostics?.mental?.naturalPackage?.value, 8);
assert.equal(naturalMpvDiagnostics?.mental?.naturalPackage?.classification, "standard");
assert.equal(naturalMpvDiagnostics?.mental?.naturalPackage?.packageBand?.standardMax, 8);
assert.equal(equippedMpvDiagnostics?.mental?.equippedArmourPackage?.value, 8);
assert.equal(equippedMpvDiagnostics?.mental?.equippedArmourPackage?.classification, "standard");
assert.equal(equippedMpvDiagnostics?.armourPackageSlots?.HEAD?.mentalProtection, 1);
assert.equal(equippedMpvDiagnostics?.armourPackageSlots?.TORSO?.mentalProtection, 2);
assert.equal(equippedMpvShieldDiagnostics?.mental?.shieldOverlay?.value, 2);
assert.equal(equippedMpvShieldDiagnostics?.mental?.combinedEquipped?.value, 10);
assert.equal(equippedMpvShieldDiagnostics?.mental?.combinedEquipped?.classification, "high");
assert.equal(equippedMpvShieldDiagnostics?.shieldExpected?.mentalStandardMax, 1.6);
assert.equal(
  getNonPowerPhysicalSurvivability(naturalPpvPackage),
  getNonPowerPhysicalSurvivability(equippedPpvPackage),
);
assert.equal(
  getNonPowerMentalSurvivability(naturalMpvPackage),
  getNonPowerMentalSurvivability(equippedMpvPackage),
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
const protectionLadderValues = [0, 1, 3, 4, 7, 15];
const ppvLadder = buildProtectionLadder("physical", protectionLadderValues);
const mpvLadderBefore = buildProtectionLadder("mental", protectionLadderValues);
const mpvLadderAfter = buildProtectionLadder(
  "mental",
  protectionLadderValues,
  tunedMentalProtectionOverrides,
);
const physicalProtectionMonotonicity = [0, 2, 4].map((protection) =>
  getNonPowerPhysicalSurvivability(
    computeMonsterOutcomes(
      {
        ...createBaseMonster(),
        physicalProtection: protection,
        naturalPhysicalProtection: protection,
      },
      calculatorConfig,
    ),
  ),
);
const standardEliteDurabilityAnchor = computeDurabilityBaselineAnchor("l3-elite-standard-v1");
const standardLegendaryEliteDurabilityAnchor = computeDurabilityBaselineAnchor(
  "l3-legendary-elite-standard-v1",
);
const legendaryDurabilityDebug = (
  standardLegendaryEliteDurabilityAnchor.debug as {
    normalizationBreakdown?: {
      durabilityAxisBaselineModel?: {
        policy?: string;
        fallback?: boolean;
        baselinePackage?: { id?: string; legendary?: boolean };
        physicalSurvivability?: {
          lane?: string;
          baselinePackageId?: string;
          calibration?: string;
          rawActualDurabilityProxy?: number;
          rawBaselineDurabilityProxy?: number;
          majorInjuryProbabilityAssumptions?: {
            active?: boolean;
            diceCount?: number;
            additionalPostZeroEvents?: number;
            blazeCredit?: number;
          };
        };
        mentalSurvivability?: {
          lane?: string;
          baselinePackageId?: string;
          calibration?: string;
          rawActualDurabilityProxy?: number;
          rawBaselineDurabilityProxy?: number;
          majorInjuryProbabilityAssumptions?: {
            active?: boolean;
            diceCount?: number;
            additionalPostZeroEvents?: number;
            blazeCredit?: number;
          };
        };
      };
    };
    nonPowerContribution?: {
      sources?: {
        c14LegendaryDurabilityBonus?: {
          physicalSurvivability?: number;
          mentalSurvivability?: number;
          policy?: string;
        };
      };
    };
  }
).normalizationBreakdown?.durabilityAxisBaselineModel;
const legendaryC14Debug = (
  standardLegendaryEliteDurabilityAnchor.debug as {
    nonPowerContribution?: {
      sources?: {
        c14LegendaryDurabilityBonus?: {
          physicalSurvivability?: number;
          mentalSurvivability?: number;
          policy?: string;
        };
      };
    };
  }
).nonPowerContribution?.sources?.c14LegendaryDurabilityBonus;
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
assert.ok(
  mpvLadderAfter[mpvLadderAfter.length - 1].total > mpvLadderBefore[mpvLadderBefore.length - 1].total,
);
assert.ok(physicalProtectionMonotonicity[1] >= physicalProtectionMonotonicity[0]);
assert.ok(physicalProtectionMonotonicity[2] >= physicalProtectionMonotonicity[1]);
for (const [label, score] of Object.entries({
  standardElitePhysical: standardEliteDurabilityAnchor.radarAxes.physicalSurvivability,
  standardEliteMental: standardEliteDurabilityAnchor.radarAxes.mentalSurvivability,
  standardLegendaryElitePhysical:
    standardLegendaryEliteDurabilityAnchor.radarAxes.physicalSurvivability,
  standardLegendaryEliteMental:
    standardLegendaryEliteDurabilityAnchor.radarAxes.mentalSurvivability,
})) {
  assert.ok(Number.isFinite(score), `${label} must be finite`);
  assert.ok(score >= 0 && score <= 10, `${label} must remain within 0-10`);
}
assertApprox(
  standardLegendaryEliteDurabilityAnchor.radarAxes.physicalSurvivability,
  5,
  0.000001,
  "standard Legendary Elite physical accepted-package midpoint",
);
assertApprox(
  standardLegendaryEliteDurabilityAnchor.radarAxes.mentalSurvivability,
  5,
  0.000001,
  "standard Legendary Elite mental accepted-package midpoint",
);
assert.equal(legendaryDurabilityDebug?.fallback, false);
assert.equal(legendaryDurabilityDebug?.baselinePackage?.id, "l3-legendary-elite-standard-v1");
assert.equal(legendaryDurabilityDebug?.baselinePackage?.legendary, true);
assert.match(legendaryDurabilityDebug?.policy ?? "", /cross-tier ordering is not required/i);
const legendaryPhysicalDurability = legendaryDurabilityDebug?.physicalSurvivability;
const legendaryMentalDurability = legendaryDurabilityDebug?.mentalSurvivability;
assert.equal(legendaryPhysicalDurability?.lane, "physical");
assert.equal(legendaryMentalDurability?.lane, "mental");
assert.notEqual(legendaryPhysicalDurability, legendaryMentalDurability);
for (const lane of [legendaryPhysicalDurability, legendaryMentalDurability]) {
  assert.equal(lane?.baselinePackageId, "l3-legendary-elite-standard-v1");
  assert.equal(lane?.calibration, "LEVEL_3_CALIBRATED");
  assert.ok(Number(lane?.rawActualDurabilityProxy) > 0);
  assert.ok(Number(lane?.rawBaselineDurabilityProxy) > 0);
  assert.equal(lane?.majorInjuryProbabilityAssumptions?.active, true);
  assert.equal(lane?.majorInjuryProbabilityAssumptions?.diceCount, 3);
  assert.ok(Number(lane?.majorInjuryProbabilityAssumptions?.additionalPostZeroEvents) > 0);
  assert.equal(lane?.majorInjuryProbabilityAssumptions?.blazeCredit, 0);
}
assert.equal(legendaryC14Debug?.physicalSurvivability, 0);
assert.equal(legendaryC14Debug?.mentalSurvivability, 0);
assert.match(legendaryC14Debug?.policy ?? "", /disabled for Level 3 calibrated packages/i);

const canonicalMobilityPower = {
  mobility: 4,
};
const cooldownOnePowerOutcome = computeMonsterOutcomes(createBaseMonster(), calculatorConfig, {
  powerContribution: {
    axisVector: canonicalMobilityPower,
    basePowerValue: 10,
    powerCount: 1,
    powers: [
      {
        name: "Cooldown 1 Movement",
        axisVector: canonicalMobilityPower,
        basePowerValue: 10,
        cooldownTurns: 1,
        cooldownReduction: 0,
      },
    ],
  },
});
const cooldownThreePowerOutcome = computeMonsterOutcomes(createBaseMonster(), calculatorConfig, {
  powerContribution: {
    axisVector: canonicalMobilityPower,
    basePowerValue: 10,
    powerCount: 1,
    powers: [
      {
        name: "Cooldown 3 Movement",
        axisVector: canonicalMobilityPower,
        basePowerValue: 10,
        cooldownTurns: 3,
        cooldownReduction: 0,
      },
    ],
  },
});
const derivedCooldownPowerOutcome = computeMonsterOutcomes(createBaseMonster(), calculatorConfig, {
  powerContribution: {
    axisVector: canonicalMobilityPower,
    basePowerValue: 10,
    powerCount: 1,
    powers: [
      {
        name: "Derived Cooldown Movement",
        axisVector: canonicalMobilityPower,
        basePowerValue: 10,
        derivedCooldownTurns: 1,
        derivedCooldownLoad: 0.25,
        cooldownTurns: 3,
        cooldownReduction: 0,
      },
    ],
  },
});
const authoredAttackPower = {
  id: "authored-attack-power",
  name: "Authored Attack Power",
  diceCount: 1,
  potency: 1,
  rangeCategories: ["MELEE"],
  meleeTargets: 1,
  rangedTargets: 1,
  aoeCount: 1,
  intentions: [
    {
      packetIndex: 0,
      sortOrder: 0,
      intention: "ATTACK",
      type: "ATTACK",
      diceCount: 1,
      potency: 1,
      detailsJson: {
        attackMode: "PHYSICAL",
        damageTypes: [{ name: "Slashing", mode: "PHYSICAL" }],
      },
    },
  ],
};
const lowAttackPowerOutcome = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D6",
  },
  calculatorConfig,
  {
    powerContribution: {
      axisVector: { physicalThreat: 1 },
      powerCount: 1,
      powers: [
        {
          id: "authored-attack-power",
          name: "Authored Attack Power",
          axisVector: { physicalThreat: 1 },
          authoredPower: authoredAttackPower as never,
          derivedCooldownTurns: 0,
          derivedCooldownLoad: 0,
        },
      ],
    },
  },
);
const highAttackPowerOutcome = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    attackDie: "D12",
  },
  calculatorConfig,
  {
    powerContribution: {
      axisVector: { physicalThreat: 1 },
      powerCount: 1,
      powers: [
        {
          id: "authored-attack-power",
          name: "Authored Attack Power",
          axisVector: { physicalThreat: 1 },
          authoredPower: authoredAttackPower as never,
          derivedCooldownTurns: 0,
          derivedCooldownLoad: 0,
        },
      ],
    },
  },
);
const cooldownOneDebug = getOutcomePowerDebug(cooldownOnePowerOutcome);
const cooldownThreeDebug = getOutcomePowerDebug(cooldownThreePowerOutcome);
const derivedCooldownDebug = getOutcomePowerDebug(derivedCooldownPowerOutcome);
const lowAttackPowerDebug = getOutcomePowerDebug(lowAttackPowerOutcome);
const highAttackPowerDebug = getOutcomePowerDebug(highAttackPowerOutcome);
const cooldownOneFinalDebug = cooldownOnePowerOutcome.debug as {
  finalPreNormalizationAxes?: { mobility?: number };
};
const cooldownThreeFinalDebug = cooldownThreePowerOutcome.debug as {
  finalPreNormalizationAxes?: { mobility?: number };
};
const derivedCooldownFinalDebug = derivedCooldownPowerOutcome.debug as {
  finalPreNormalizationAxes?: { mobility?: number };
};

assert.equal(cooldownOneDebug.axisVector?.mobility, 4);
assert.equal(cooldownOneDebug.canonicalPowerAxisVector?.mobility, 4);
assert.equal(cooldownOneDebug.effectivePowerAxisVector?.mobility, 3);
assert.equal(cooldownOneDebug.availabilityFactor, 0.75);
assert.equal(cooldownOneDebug.effectivePowerFactor, 0.75);
assert.equal(cooldownOneDebug.basePowerValue, 10);
assert.equal(cooldownOneDebug.perPowerAvailability?.[0]?.cooldownTurns, 1);
assert.equal(cooldownOneDebug.perPowerAvailability?.[0]?.canonicalPowerAxisVector?.mobility, 4);
assert.equal(cooldownOneDebug.perPowerAvailability?.[0]?.effectivePowerAxisVector?.mobility, 3);
assert.equal(cooldownOneDebug.perPowerAvailability?.[0]?.availabilityFactor, 0.75);
assert.equal(cooldownOneDebug.perPowerAvailability?.[0]?.effectivePowerFactor, 0.75);
assert.equal(cooldownOneDebug.perPowerAvailability?.[0]?.tableCooldownAvailabilityFactor, 0.75);
assert.equal(cooldownOneDebug.perPowerAvailability?.[0]?.radarLoadExpressionFactor, 1);
assert.equal(cooldownOneDebug.perPowerAvailability?.[0]?.radarCooldownLoadExponent, null);
assert.equal(cooldownOneDebug.perPowerAvailability?.[0]?.derivedCooldownLoadClamped, null);
assert.equal(cooldownOneFinalDebug.finalPreNormalizationAxes?.mobility, 3);
assert.equal(cooldownThreeDebug.effectivePowerAxisVector?.mobility, 1.6);
assert.equal(cooldownThreeDebug.availabilityFactor, 0.4);
assert.equal(cooldownThreeDebug.effectivePowerFactor, 0.4);
assert.equal(cooldownThreeDebug.basePowerValue, 10);
assert.equal(cooldownThreeDebug.perPowerAvailability?.[0]?.cooldownTurns, 3);
assert.equal(cooldownThreeFinalDebug.finalPreNormalizationAxes?.mobility, 1.6);
const expectedDerivedCooldownFactor = 0.3;
const expectedDerivedUtilityFactor = Math.pow(expectedDerivedCooldownFactor, 0.75);
assert.equal(derivedCooldownDebug.perPowerAvailability?.[0]?.cooldownTurns, 1);
assert.equal(
  derivedCooldownDebug.perPowerAvailability?.[0]?.tableCooldownAvailabilityFactor,
  0.75,
);
assert.equal(
  derivedCooldownDebug.perPowerAvailability?.[0]?.radarLoadExpressionFactor,
  Math.pow(0.25, 1.2),
);
assert.equal(derivedCooldownDebug.perPowerAvailability?.[0]?.radarCooldownLoadExponent, 1.2);
assert.equal(derivedCooldownDebug.perPowerAvailability?.[0]?.derivedCooldownLoadClamped, 0.25);
assert.equal(derivedCooldownDebug.perPowerAvailability?.[0]?.availabilityFactor, expectedDerivedCooldownFactor);
assert.equal(
  derivedCooldownDebug.perPowerAvailability?.[0]?.effectivePowerFactor,
  expectedDerivedCooldownFactor,
);
assert.equal(derivedCooldownDebug.availabilityFactor, expectedDerivedCooldownFactor);
assert.equal(derivedCooldownDebug.perPowerAvailability?.[0]?.threatEffectivePowerFactor, expectedDerivedCooldownFactor);
assert.equal(derivedCooldownDebug.perPowerAvailability?.[0]?.utilityEffectivePowerFactor, expectedDerivedUtilityFactor);
assert.equal(derivedCooldownDebug.perPowerAvailability?.[0]?.utilityEffectivePowerExponent, 0.75);
assert.equal(
  derivedCooldownDebug.perPowerAvailability?.[0]?.utilityFactorFormulaLabel,
  "pow(threatEffectivePowerFactor, utilityEffectivePowerExponent)",
);
assert.equal(
  derivedCooldownDebug.perPowerAvailability?.[0]?.axisEffectivePowerFactors?.physicalThreat,
  expectedDerivedCooldownFactor,
);
assert.equal(
  derivedCooldownDebug.perPowerAvailability?.[0]?.axisEffectivePowerFactors?.mobility,
  expectedDerivedUtilityFactor,
);
assert.equal(derivedCooldownDebug.effectivePowerFactor, expectedDerivedUtilityFactor);
assert.equal(
  derivedCooldownDebug.factorFormulaLabel,
  "per-power resolver-derived threat axes use resolverDerivedPowerRadarAvailabilityFactor; utility axes use pow(threatEffectivePowerFactor, utilityEffectivePowerExponent)",
);
assert.equal(
  derivedCooldownDebug.perPowerAvailability?.[0]?.factorFormulaLabel,
  "threat axes: resolverDerivedPowerRadarAvailabilityFactor; utility axes: pow(threatEffectivePowerFactor, utilityEffectivePowerExponent)",
);
assert.equal(
  derivedCooldownFinalDebug.finalPreNormalizationAxes?.mobility,
  4 * expectedDerivedUtilityFactor,
);
assert.ok(
  Number(cooldownOneDebug.effectivePowerAxisVector?.mobility ?? 0) >
    Number(cooldownThreeDebug.effectivePowerAxisVector?.mobility ?? 0),
);
assert.equal(lowAttackPowerDebug.expectedAttackOutput?.source, "authored_power_packets");
assert.equal(lowAttackPowerDebug.expectedAttackOutput?.packetCount, 1);
assert.ok(
  Number(highAttackPowerDebug.expectedAttackOutput?.axisVector?.physicalThreat ?? 0) >
    Number(lowAttackPowerDebug.expectedAttackOutput?.axisVector?.physicalThreat ?? 0),
);

type PressurePowerOptions = {
  name: string;
  intention?: "ATTACK" | "CONTROL" | "DEBUFF" | "SUMMONING" | "TRANSFORMATION";
  range?: "MELEE" | "RANGED" | "AOE";
  targets?: number;
  cooldown?: number;
  chassis?: "IMMEDIATE" | "FIELD";
  duration?: "INSTANT" | "TURNS" | "PASSIVE";
  durationTurns?: number;
  recurring?: boolean;
  linked?: boolean;
};

function createPressurePower(options: PressurePowerOptions) {
  const intention = options.intention ?? "ATTACK";
  const range = options.range ?? "MELEE";
  const targets = options.targets ?? 1;
  const duration = options.duration ?? "INSTANT";
  const packet = {
    packetIndex: 0,
    sortOrder: 0,
    hostility: "HOSTILE",
    intention,
    type: intention,
    diceCount: 1,
    potency: 1,
    effectTimingType: options.recurring ? "START_OF_TURN" : "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: duration,
    effectDurationTurns: options.durationTurns ?? null,
    detailsJson: {},
  };
  const packets = options.linked
    ? [
        packet,
        {
          ...packet,
          packetIndex: 1,
          sortOrder: 1,
          intention: "DEBUFF",
          type: "DEBUFF",
          secondaryDependencyMode: "LINKED_TO_PRIMARY",
        },
      ]
    : [packet];
  return {
    id: options.name.toLowerCase().replace(/\s+/g, "-"),
    sortOrder: 0,
    name: options.name,
    description: null,
    descriptorChassis: options.chassis ?? "IMMEDIATE",
    cooldownTurns: options.cooldown ?? 0,
    cooldownReduction: 0,
    counterMode: "NO",
    rangeCategories: [range],
    meleeTargets: range === "MELEE" ? targets : 1,
    rangedTargets: range === "RANGED" ? targets : 1,
    rangedDistanceFeet: range === "RANGED" ? 30 : null,
    aoeCount: range === "AOE" ? targets : 1,
    aoeCenterRangeFeet: range === "AOE" ? 30 : null,
    effectDurationType: duration,
    effectDurationTurns: options.durationTurns ?? null,
    effectPackets: packets,
    intentions: packets,
    diceCount: 1,
    potency: 1,
  };
}

function createPressureNaturalAttack(
  range: "MELEE" | "RANGED" | "AOE",
  targets: number,
  strength = 1,
): MonsterAttack {
  const attackConfig =
    range === "AOE"
      ? {
          aoe: {
            enabled: true,
            count: targets,
            centerRange: 30,
            shape: "SPHERE" as const,
            sphereRadiusFeet: 10,
            physicalStrength: strength,
            mentalStrength: 0,
            damageTypes: [{ name: "Blunt", mode: "PHYSICAL" as const }],
            attackEffects: [],
          },
        }
      : range === "RANGED"
        ? {
            ranged: {
              enabled: true,
              targets,
              distance: 30,
              physicalStrength: strength,
              mentalStrength: 0,
              damageTypes: [{ name: "Blunt", mode: "PHYSICAL" as const }],
              attackEffects: [],
            },
          }
        : {
            melee: {
              enabled: true,
              targets,
              physicalStrength: strength,
              mentalStrength: 0,
              damageTypes: [{ name: "Blunt", mode: "PHYSICAL" as const }],
              attackEffects: [],
            },
          };
  return createNaturalAttack(attackConfig);
}

function computePressureFixture(options: {
  tier?: "MINION" | "SOLDIER" | "ELITE" | "BOSS";
  legendary?: boolean;
  naturalRange?: "MELEE" | "RANGED" | "AOE";
  naturalTargets?: number;
  naturalStrength?: number;
  powers?: ReturnType<typeof createPressurePower>[];
  genericPresence?: number;
}) {
  const powers = options.powers ?? [];
  return computeMonsterOutcomes(
    {
      ...createBaseMonster(),
      level: 3,
      tier: options.tier ?? "SOLDIER",
      legendary: options.legendary ?? false,
      attacks: [
        createPressureNaturalAttack(
          options.naturalRange ?? "MELEE",
          options.naturalTargets ?? 1,
          options.naturalStrength ?? 1,
        ),
      ],
    },
    calculatorConfig,
    powers.length > 0 || options.genericPresence !== undefined
      ? {
          powerContribution: {
            axisVector: { presence: options.genericPresence ?? 0 },
            powerCount: powers.length,
            powers: powers.map((power) => ({
              id: power.id,
              name: power.name,
              axisVector: { presence: options.genericPresence ?? 0 },
              authoredPower: power as never,
              derivedCooldownTurns: power.cooldownTurns,
              cooldownTurns: power.cooldownTurns,
              cooldownReduction: 0,
            })),
          },
        }
      : undefined,
  );
}

const pressureWs2 = computePressureFixture({ naturalStrength: 1 });
const pressureWs8 = computePressureFixture({ naturalStrength: 4 });
assertApprox(pressureWs2.radarAxes.presence, pressureWs8.radarAxes.presence, 0.000001, "Pressure W/S independence");
assert.notEqual(pressureWs2.radarAxes.physicalThreat, pressureWs8.radarAxes.physicalThreat);

const pressureOneTarget = computePressureFixture({ naturalTargets: 1 });
const pressureTwoTargets = computePressureFixture({ naturalTargets: 2 });
const pressureRanged = computePressureFixture({ naturalRange: "RANGED" });
const pressureAoe = computePressureFixture({ naturalRange: "AOE", naturalTargets: 3 });
assert.ok(pressureTwoTargets.radarAxes.presence > pressureOneTarget.radarAxes.presence);
assert.ok(pressureRanged.radarAxes.presence > pressureOneTarget.radarAxes.presence);
assert.ok(pressureRanged.radarAxes.presence - pressureOneTarget.radarAxes.presence < 1);
assert.ok(pressureAoe.radarAxes.presence > pressureTwoTargets.radarAxes.presence);

const immediatePressurePower = createPressurePower({ name: "Immediate Control", intention: "CONTROL", cooldown: 1 });
const fieldPressurePower = createPressurePower({
  name: "Recurring Field",
  intention: "CONTROL",
  range: "AOE",
  targets: 2,
  cooldown: 1,
  chassis: "FIELD",
  duration: "TURNS",
  durationTurns: 2,
  recurring: true,
});
const immediatePressure = computePressureFixture({ powers: [immediatePressurePower] });
const fieldPressure = computePressureFixture({ powers: [fieldPressurePower] });
assert.ok(fieldPressure.radarAxes.presence > immediatePressure.radarAxes.presence);

const shortCooldownPressure = computePressureFixture({
  powers: [createPressurePower({ name: "Short Cooldown", intention: "CONTROL", cooldown: 1 })],
});
const longCooldownPressure = computePressureFixture({
  powers: [createPressurePower({ name: "Long Cooldown", intention: "CONTROL", cooldown: 4 })],
});
assert.ok(shortCooldownPressure.radarAxes.presence > longCooldownPressure.radarAxes.presence);

const duplicatePowerA = createPressurePower({ name: "Duplicate A", intention: "CONTROL", cooldown: 2 });
const duplicatePowerB = createPressurePower({ name: "Duplicate B", intention: "CONTROL", cooldown: 2 });
const onePressurePower = computePressureFixture({ powers: [duplicatePowerA] });
const duplicatePressurePowers = computePressureFixture({ powers: [duplicatePowerA, duplicatePowerB] });
assertApprox(onePressurePower.radarAxes.presence, duplicatePressurePowers.radarAxes.presence, 0.000001, "Duplicate Pressure actions");
assert.equal(getPressureAxisDebug(duplicatePressurePowers)?.meaningfulActionCount, 2);

const linkedPressure = computePressureFixture({
  powers: [createPressurePower({ name: "Linked Threat", intention: "CONTROL", cooldown: 2, linked: true })],
});
assert.ok(linkedPressure.radarAxes.presence > onePressurePower.radarAxes.presence);

const unsupportedPressure = computePressureFixture({
  powers: [
    createPressurePower({ name: "Unsupported Summon", intention: "SUMMONING", cooldown: 1 }),
    createPressurePower({ name: "Unsupported Transform", intention: "TRANSFORMATION", cooldown: 1 }),
  ],
});
assertApprox(unsupportedPressure.radarAxes.presence, pressureOneTarget.radarAxes.presence, 0.000001, "Unsupported Pressure omission");
assert.ok(
  getPressureAxisDebug(unsupportedPressure)?.unsupportedPackageWarnings?.some((warning) =>
    warning.includes("SUMMONING"),
  ),
);
assert.ok(
  getPressureAxisDebug(unsupportedPressure)?.unsupportedPackageWarnings?.some((warning) =>
    warning.includes("TRANSFORMATION"),
  ),
);

const genericPresenceZero = computePressureFixture({ powers: [immediatePressurePower], genericPresence: 0 });
const genericPresenceHuge = computePressureFixture({ powers: [immediatePressurePower], genericPresence: 999 });
assertApprox(genericPresenceZero.radarAxes.presence, genericPresenceHuge.radarAxes.presence, 0.000001, "Generic resolver Presence omission");
for (const axis of [
  "physicalThreat",
  "mentalThreat",
  "physicalSurvivability",
  "mentalSurvivability",
  "manipulation",
  "synergy",
  "mobility",
] as const) {
  assertApprox(genericPresenceZero.radarAxes[axis], genericPresenceHuge.radarAxes[axis], 0.000001, `${axis} regression`);
}

const pressureAnchors = [
  computePressureFixture({ tier: "MINION" }),
  computePressureFixture({
    tier: "SOLDIER",
    powers: [createPressurePower({ name: "Soldier Option", cooldown: 1 })],
  }),
  computePressureFixture({
    tier: "ELITE",
    naturalRange: "RANGED",
    powers: [createPressurePower({ name: "Elite Option", intention: "CONTROL", range: "RANGED", cooldown: 1 })],
  }),
  computePressureFixture({
    tier: "ELITE",
    legendary: true,
    powers: [
      createPressurePower({ name: "Legendary Option A", intention: "CONTROL", cooldown: 3, duration: "TURNS", durationTurns: 1, linked: true }),
      createPressurePower({ name: "Legendary Option B", intention: "DEBUFF", cooldown: 4, duration: "TURNS", durationTurns: 1, linked: true }),
    ],
  }),
  computePressureFixture({ tier: "BOSS", naturalTargets: 2 }),
  computePressureFixture({
    tier: "BOSS",
    legendary: true,
    naturalRange: "RANGED",
    naturalTargets: 2,
    powers: [createPressurePower({ name: "Legendary Boss Option", range: "RANGED", targets: 2, cooldown: 1 })],
  }),
];
for (const [index, anchor] of pressureAnchors.entries()) {
  assertApprox(anchor.radarAxes.presence, 5, 0.35, `Pressure baseline anchor ${index + 1}`);
  assert.equal(getPressureAxisDebug(anchor)?.mode, "LEVEL_3_BASELINE_RELATIVE");
}
const nonLevelThreePressureFallback = computeMonsterOutcomes(
  {
    ...createBaseMonster(),
    level: 4,
    tier: "SOLDIER",
    attacks: [createPressureNaturalAttack("MELEE", 1)],
  },
  calculatorConfig,
);
assert.equal(
  getPressureAxisDebug(nonLevelThreePressureFallback)?.mode,
  "LEGACY_DAMAGE_DUPLICATING_CURVE",
);

console.log(
  JSON.stringify(
    {
      expectedTieredSuccesses: {
        d4: expectedTieredSuccessesPerDie(4),
        d6: expectedTieredSuccessesPerDie(6),
        d8: expectedTieredSuccessesPerDie(8),
        d10: expectedTieredSuccessesPerDie(10),
        d12: expectedTieredSuccessesPerDie(12),
      },
      clubVsSlash: {
        after: {
          naturalSlashPhysicalThreat: getNonPowerPhysicalThreat(naturalSlash),
          equippedClubPhysicalThreat: getNonPowerPhysicalThreat(equippedClub),
        },
      },
      attackAttributeImpact: {
        physicalNaturalAttackD6: getNonPowerPhysicalThreat(lowAttackPhysicalSlash),
        physicalNaturalAttackD12: getNonPowerPhysicalThreat(highAttackPhysicalSlash),
        mentalNaturalAttackAttackD6: getNonPowerMentalThreat(lowAttackMentalSlash),
        mentalNaturalAttackAttackD12: getNonPowerMentalThreat(highAttackMentalSlash),
        mentalNaturalAttackHighIntellectOnly: getNonPowerMentalThreat(highIntellectOnlyMentalSlash),
      },
      weaponSkillDiceCount: {
        oneDie: getNonPowerPhysicalThreat(oneDiePhysicalSlash),
        threeDice: getNonPowerPhysicalThreat(threeDicePhysicalSlash),
      },
      attackDeliveryScaling: {
        strengthOne: getNonPowerPhysicalThreat(strengthOnePhysicalSlash),
        strengthTwo: getNonPowerPhysicalThreat(strengthTwoPhysicalSlash),
        strengthThree: getNonPowerPhysicalThreat(strengthThreePhysicalSlash),
        targetOne: getNonPowerPhysicalThreat(targetOnePhysicalSlash),
        targetTwo: getNonPowerPhysicalThreat(targetTwoPhysicalSlash),
        aoeThree: getNonPowerPhysicalThreat(aoePhysicalSlash),
      },
      duplicateNaturalIngress: {
        naturalProfileCount: getAtWillProfiles(duplicatedNaturalSlash).length,
        naturalPhysicalThreat: getNonPowerPhysicalThreat(duplicatedNaturalSlash),
      },
      highIntellectResistNaked: {
        sustainedPhysical: highIntellectResistNaked.sustainedPhysical,
        sustainedMental: highIntellectResistNaked.sustainedMental,
        physicalThreat: getNonPowerPhysicalThreat(highIntellectResistNaked),
        mentalThreat: getNonPowerMentalThreat(highIntellectResistNaked),
        atWillProfiles: getAtWillProfiles(highIntellectResistNaked).length,
        suppressedIntellectResistContribution:
          highIntellectResistSuppressed.intellectResistContribution,
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
      defensivePackageParity: {
        naturalPpvPackage: naturalPpvDiagnostics?.physical?.naturalPackage,
        equippedPpvPackage: equippedPpvDiagnostics?.physical?.equippedArmourPackage,
        equippedPpvWithShield: equippedPpvShieldDiagnostics?.physical?.combinedEquipped,
        naturalMpvPackage: naturalMpvDiagnostics?.mental?.naturalPackage,
        equippedMpvPackage: equippedMpvDiagnostics?.mental?.equippedArmourPackage,
        equippedMpvWithShield: equippedMpvShieldDiagnostics?.mental?.combinedEquipped,
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
      protectionLadders: {
        ppvRawPhysicalTotals: ppvLadder,
        mpvRawMentalTotalsBefore: mpvLadderBefore,
        mpvRawMentalTotalsAfter: mpvLadderAfter,
        physicalSurvivabilityRadarZeroTwoFour: physicalProtectionMonotonicity,
      },
      c14LegendaryDurability: {
        normalPhysicalSurvivability:
          standardEliteDurabilityAnchor.radarAxes.physicalSurvivability,
        legendaryPhysicalSurvivability:
          standardLegendaryEliteDurabilityAnchor.radarAxes.physicalSurvivability,
        legendaryPhysicalRawProxy: legendaryPhysicalDurability?.rawActualDurabilityProxy,
        legendaryMentalRawProxy: legendaryMentalDurability?.rawActualDurabilityProxy,
      },
      authoredAttackPowerExpectedOutput: {
        source: lowAttackPowerDebug.expectedAttackOutput?.source,
        d6PhysicalThreat:
          lowAttackPowerDebug.expectedAttackOutput?.axisVector?.physicalThreat,
        d12PhysicalThreat:
          highAttackPowerDebug.expectedAttackOutput?.axisVector?.physicalThreat,
      },
      powerAvailability: {
        cooldownOne: {
          canonicalMobility: cooldownOneDebug.canonicalPowerAxisVector?.mobility,
          effectiveMobility: cooldownOneDebug.effectivePowerAxisVector?.mobility,
          finalPreNormalizationMobility:
            cooldownOneFinalDebug.finalPreNormalizationAxes?.mobility,
          availabilityFactor: cooldownOneDebug.availabilityFactor,
        },
        cooldownThree: {
          canonicalMobility: cooldownThreeDebug.canonicalPowerAxisVector?.mobility,
          effectiveMobility: cooldownThreeDebug.effectivePowerAxisVector?.mobility,
          finalPreNormalizationMobility:
            cooldownThreeFinalDebug.finalPreNormalizationAxes?.mobility,
          availabilityFactor: cooldownThreeDebug.availabilityFactor,
        },
      },
      pressureAxis: {
        wsIndependence: {
          ws2: pressureWs2.radarAxes.presence,
          ws8: pressureWs8.radarAxes.presence,
        },
        coverage: {
          oneTarget: pressureOneTarget.radarAxes.presence,
          twoTargets: pressureTwoTargets.radarAxes.presence,
          ranged: pressureRanged.radarAxes.presence,
          aoe: pressureAoe.radarAxes.presence,
          field: fieldPressure.radarAxes.presence,
        },
        cadence: {
          shortCooldown: shortCooldownPressure.radarAxes.presence,
          longCooldown: longCooldownPressure.radarAxes.presence,
        },
        duplicate: {
          one: onePressurePower.radarAxes.presence,
          duplicated: duplicatePressurePowers.radarAxes.presence,
        },
        linked: linkedPressure.radarAxes.presence,
        unsupportedWarnings:
          getPressureAxisDebug(unsupportedPressure)?.unsupportedPackageWarnings ?? [],
        anchors: pressureAnchors.map((anchor) => anchor.radarAxes.presence),
        nonLevelThreeFallback: getPressureAxisDebug(nonLevelThreePressureFallback)?.mode,
      },
    },
    null,
    2,
  ),
);

console.log("monsterOutcomeCalculator.smoke.ts passed");
