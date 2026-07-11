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
      protectionTuning: {
        ...DEFAULT_COMBAT_TUNING_VALUES,
        protectionK: 100,
      },
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

function getControlPressureAxisDebug(result: ReturnType<typeof computeMonsterOutcomes>) {
  const debug = result.debug as {
    normalizationBreakdown?: {
      controlPressureAxisBaselineModel?: {
        mode?: string;
        baselinePackageId?: string | null;
        semanticPackagesConsidered?: Array<{
          effectFamily?: string;
          runtimeSemanticMode?: string;
          affectedAttribute?: string | null;
          targetBreadth?: number;
          durationKind?: string;
          durationTurns?: number;
          recurrence?: boolean;
          cooldownTurns?: number | null;
          availabilityBand?: string;
          effectSeverity?: number;
          supportedStackImpact?: number;
          resistibility?: string;
          reliabilityContribution?: number;
          linked?: boolean;
          linkedContribution?: number;
          unsupportedAuthoringDistinctions?: string[];
          functionalSignature?: string;
        }>;
        functionalSignatures?: string[];
        duplicateOverlapHandling?: {
          exactDuplicatesRemoved?: string[];
          overlapDiminishingReturns?: Array<{ signature?: string; factor?: number }>;
        };
        unsupportedAuthoringWarnings?: string[];
        rawActualControlPressureProxy?: number;
        rawBaselineControlPressureProxy?: number | null;
        ratioToBaseline?: number | null;
        uncappedScore?: number | null;
        finalScore?: number | null;
      };
    };
  };
  return debug.normalizationBreakdown?.controlPressureAxisBaselineModel;
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

function computeRuntimeProtectionFixture(params: {
  authoredProtection: number;
  tableProtection: number;
  armourDice: number;
  dodgeDice?: number;
  staticRuntimeShare?: number;
}) {
  const config =
    params.staticRuntimeShare === undefined
      ? calculatorConfig
      : {
          ...calculatorConfig,
          durabilityAxisTuning: {
            ...calculatorConfig.durabilityAxisTuning,
            authoredProtectionStaticRuntimeShare: params.staticRuntimeShare,
          },
        };
  return computeMonsterOutcomes(
    {
      ...createBaseMonster(),
      level: 3,
      tier: "ELITE",
      guardDie: "D6",
      fortitudeDie: "D4",
      intellectDie: "D4",
      physicalResilienceMax: 34,
      mentalPerseveranceMax: 20,
      physicalProtection: params.authoredProtection,
      naturalPhysicalProtection: params.authoredProtection,
      mentalProtection: 0,
      naturalMentalProtection: 0,
      armorSkillValue: params.armourDice,
    },
    config,
    {
      protectionTuning: DEFAULT_COMBAT_TUNING_VALUES,
      defensiveProfileSources: [
        {
          sourceKind: "natural",
          sourceLabel: "Exact table-facing package",
          physicalProtection: params.tableProtection,
          mentalProtection: 0,
        },
      ],
      defensiveProfileContext: {
        totalPhysicalProtection: params.tableProtection,
        totalMentalProtection: 0,
        armorSkillDice: params.armourDice,
        willpowerDice: 1,
        dodgeDice: params.dodgeDice ?? 1,
        unarmoredDodgeDice: params.dodgeDice ?? 1,
      },
    },
  );
}

function physicalDurabilityDebug(result: ReturnType<typeof computeMonsterOutcomes>) {
  return (
    result.debug as {
      normalizationBreakdown: {
        durabilityAxisBaselineModel: {
          physicalSurvivability: {
            hydratedStaticProtectionExpectedAtRuntime: number;
            standaloneProtectionCreditApplied: boolean;
            standaloneProtectionPolicyReason: string;
          };
        };
      };
    }
  ).normalizationBreakdown.durabilityAxisBaselineModel.physicalSurvivability;
}

const runtimeProtectionPackage = computeRuntimeProtectionFixture({
  authoredProtection: 10,
  tableProtection: 10,
  armourDice: 2,
});
const redundantAuthoredProtectionPackage = computeRuntimeProtectionFixture({
  authoredProtection: 30,
  tableProtection: 10,
  armourDice: 2,
});
const higherBlockPackage = computeRuntimeProtectionFixture({
  authoredProtection: 15,
  tableProtection: 15,
  armourDice: 2,
});
const higherDefenceDicePackage = computeRuntimeProtectionFixture({
  authoredProtection: 10,
  tableProtection: 10,
  armourDice: 3,
});
const explicitStaticRuntimePackage = computeRuntimeProtectionFixture({
  authoredProtection: 10,
  tableProtection: 10,
  armourDice: 2,
  staticRuntimeShare: 1,
});
const runtimeProtectionDebug = physicalDurabilityDebug(runtimeProtectionPackage);
const explicitStaticDebug = physicalDurabilityDebug(explicitStaticRuntimePackage);
assert.equal(runtimeProtectionDebug.hydratedStaticProtectionExpectedAtRuntime, 0);
assert.equal(runtimeProtectionDebug.standaloneProtectionCreditApplied, false);
assert.equal(
  runtimeProtectionDebug.standaloneProtectionPolicyReason,
  "DERIVED_DEFENCE_STRING_NO_STATIC_LAYER",
);
assertApprox(
  runtimeProtectionPackage.radarAxes.physicalSurvivability,
  redundantAuthoredProtectionPackage.radarAxes.physicalSurvivability,
  0.000001,
  "redundant authored Protection must not alter an identical table-facing package",
);
assert.ok(
  higherBlockPackage.radarAxes.physicalSurvivability >
    runtimeProtectionPackage.radarAxes.physicalSurvivability,
);
assert.ok(
  higherDefenceDicePackage.radarAxes.physicalSurvivability >
    runtimeProtectionPackage.radarAxes.physicalSurvivability,
);
assert.equal(explicitStaticDebug.standaloneProtectionCreditApplied, true);
assert.equal(explicitStaticDebug.standaloneProtectionPolicyReason, "EXPLICIT_RUNTIME_STATIC_PROTECTION");
assert.ok(
  explicitStaticRuntimePackage.radarAxes.physicalSurvivability >
    runtimeProtectionPackage.radarAxes.physicalSurvivability,
);
for (const axis of [
  "physicalThreat",
  "mentalThreat",
  "mentalSurvivability",
  "manipulation",
  "synergy",
  "mobility",
  "presence",
] as const) {
  assertApprox(
    runtimeProtectionPackage.radarAxes[axis],
    redundantAuthoredProtectionPackage.radarAxes[axis],
    0.000001,
    `${axis} raw Protection independence`,
  );
}
for (const baseline of calculatorConfig.durabilityAxisTuning.baselines) {
  const anchor = computeDurabilityBaselineAnchor(baseline.id);
  assertApprox(anchor.radarAxes.physicalSurvivability, 5, 0.000001, `${baseline.id} physical`);
  assertApprox(anchor.radarAxes.mentalSurvivability, 5, 0.000001, `${baseline.id} mental`);
}

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

type FixturePower = MonsterUpsertInput["powers"][number];
type FixtureEffectPacket = FixturePower["intentions"][number];

function createPressurePower(options: PressurePowerOptions): MonsterUpsertInput["powers"][number] {
  const intention = options.intention ?? "ATTACK";
  const range = options.range ?? "MELEE";
  const targets = options.targets ?? 1;
  const duration = options.duration ?? "INSTANT";
  const packet: FixtureEffectPacket = {
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
  const packets: FixtureEffectPacket[] = options.linked
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

type ControlPressurePowerOptions = {
  name: string;
  intention: "CONTROL" | "DEBUFF" | "MOVEMENT";
  targets?: number;
  cooldown?: number;
  potency?: number;
  duration?: "INSTANT" | "TURNS" | "PASSIVE" | "UNTIL_TARGET_NEXT_TURN";
  durationTurns?: number;
  timing?: "ON_CAST" | "START_OF_TURN" | "START_OF_TURN_WHILST_CHANNELLED";
  controlMode?: string;
  statTarget?: string;
  movementMode?: string;
  resistAttribute?: "FORTITUDE" | "INTELLECT" | "BRAVERY" | null;
  linkedDamageWs?: number;
};

function createControlPressurePower(
  options: ControlPressurePowerOptions,
): MonsterUpsertInput["powers"][number] {
  const potency = options.potency ?? 1;
  const duration = options.duration ?? "INSTANT";
  const detailsJson =
    options.intention === "CONTROL"
      ? { controlMode: options.controlMode ?? "Force no main action" }
      : options.intention === "DEBUFF"
        ? { statTarget: options.statTarget ?? "Attack" }
        : { movementMode: options.movementMode ?? "Force Push" };
  const packet: FixtureEffectPacket = {
    packetIndex: 0,
    sortOrder: 0,
    hostility: "HOSTILE" as const,
    intention: options.intention,
    type: options.intention,
    diceCount: 1,
    potency,
    effectTimingType: options.timing ?? "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: duration,
    effectDurationTurns: options.durationTurns ?? null,
    dealsWounds: false,
    woundChannel: null,
    detailsJson,
  };
  const packets: FixtureEffectPacket[] = [packet];
  if (options.linkedDamageWs !== undefined) {
    packets.push({
      packetIndex: 1,
      sortOrder: 1,
      hostility: "HOSTILE",
      intention: "ATTACK",
      type: "ATTACK",
      diceCount: 0,
      potency: options.linkedDamageWs,
      effectTimingType: "ON_CAST",
      effectTimingTurns: null,
      effectDurationType: "INSTANT",
      effectDurationTurns: null,
      dealsWounds: true,
      woundChannel: "MENTAL",
      secondaryDependencyMode: "LINKED_TO_PRIMARY",
      detailsJson: { attackMode: "MENTAL" },
    });
  }
  return {
    id: options.name.toLowerCase().replace(/\s+/g, "-"),
    sortOrder: 0,
    name: options.name,
    description: null,
    descriptorChassis: "IMMEDIATE",
    cooldownTurns: options.cooldown ?? 2,
    cooldownReduction: 0,
    counterMode: "NO",
    rangeCategories: ["RANGED"],
    meleeTargets: 1,
    rangedTargets: options.targets ?? 1,
    rangedDistanceFeet: 30,
    aoeCount: 1,
    aoeCenterRangeFeet: null,
    primaryDefenceGate:
      options.resistAttribute === undefined || options.resistAttribute === null
        ? null
        : {
            sourcePacketIndex: 0,
            gateResult: "RESIST",
            protectionChannel: null,
            resistAttribute: options.resistAttribute,
            hostileEntryPattern: "DIRECT",
            resolutionSource: "EXPLICIT",
          },
    effectDurationType: duration,
    effectDurationTurns: options.durationTurns ?? null,
    durationType: duration,
    durationTurns: options.durationTurns ?? null,
    effectPackets: packets,
    intentions: packets,
    diceCount: 1,
    potency,
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
  powers?: MonsterUpsertInput["powers"];
  genericPresence?: number;
  genericManipulation?: number;
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
    powers.length > 0 || options.genericPresence !== undefined || options.genericManipulation !== undefined
      ? {
          powerContribution: {
            axisVector: {
              presence: options.genericPresence ?? 0,
              manipulation: options.genericManipulation ?? 0,
            },
            powerCount: powers.length,
            powers: powers.map((power) => ({
              id: power.id,
              name: power.name,
              axisVector: {
                presence: options.genericPresence ?? 0,
                manipulation: options.genericManipulation ?? 0,
              },
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

const controlPressureNoPackage = computePressureFixture({});
assert.equal(controlPressureNoPackage.radarAxes.manipulation, 0);

const controlPressureLightDebuff = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Light Attack Debuff",
      intention: "DEBUFF",
      potency: 1,
      duration: "TURNS",
      durationTurns: 1,
      cooldown: 2,
    }),
  ],
});
assert.ok(controlPressureLightDebuff.radarAxes.manipulation > 0);

const controlPressureLightMovement = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Light Forced Movement",
      intention: "MOVEMENT",
      cooldown: 2,
      resistAttribute: "FORTITUDE",
    }),
  ],
});
const controlPressureMainActionDenial = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Main Action Denial",
      intention: "CONTROL",
      duration: "TURNS",
      durationTurns: 1,
      cooldown: 2,
      resistAttribute: "FORTITUDE",
    }),
  ],
});
assert.ok(
  controlPressureMainActionDenial.radarAxes.manipulation >
    controlPressureLightMovement.radarAxes.manipulation,
);

const controlPressureOneTarget = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "One Target Denial",
      intention: "CONTROL",
      targets: 1,
      cooldown: 2,
    }),
  ],
});
const controlPressureTwoTargets = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Two Target Denial",
      intention: "CONTROL",
      targets: 2,
      cooldown: 2,
    }),
  ],
});
assert.ok(
  controlPressureTwoTargets.radarAxes.manipulation >
    controlPressureOneTarget.radarAxes.manipulation,
);

const controlPressureShortDuration = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "One Turn Debuff",
      intention: "DEBUFF",
      duration: "TURNS",
      durationTurns: 1,
      cooldown: 2,
    }),
  ],
});
const controlPressureLongDuration = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Three Turn Debuff",
      intention: "DEBUFF",
      duration: "TURNS",
      durationTurns: 3,
      cooldown: 2,
    }),
  ],
});
assert.ok(
  controlPressureLongDuration.radarAxes.manipulation >
    controlPressureShortDuration.radarAxes.manipulation,
);

const controlPressureOneShot = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "One Shot Debuff",
      intention: "DEBUFF",
      duration: "TURNS",
      durationTurns: 2,
      timing: "ON_CAST",
      cooldown: 2,
    }),
  ],
});
const controlPressureRecurring = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Recurring Debuff",
      intention: "DEBUFF",
      duration: "TURNS",
      durationTurns: 2,
      timing: "START_OF_TURN",
      cooldown: 2,
    }),
  ],
});
assert.ok(
  controlPressureRecurring.radarAxes.manipulation >
    controlPressureOneShot.radarAxes.manipulation,
);

const controlPressureShortCooldown = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Short Cooldown Denial",
      intention: "CONTROL",
      cooldown: 1,
    }),
  ],
});
const controlPressureLongCooldown = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Long Cooldown Denial",
      intention: "CONTROL",
      cooldown: 5,
    }),
  ],
});
assert.ok(
  controlPressureShortCooldown.radarAxes.manipulation >
    controlPressureLongCooldown.radarAxes.manipulation,
);

const duplicateControlDenialA = createControlPressurePower({
  name: "Duplicate Control Denial A",
  intention: "CONTROL",
  cooldown: 2,
});
const duplicateControlDenialB = createControlPressurePower({
  name: "Duplicate Control Denial B",
  intention: "CONTROL",
  cooldown: 2,
});
const controlPressureOneDenial = computePressureFixture({ powers: [duplicateControlDenialA] });
const controlPressureDuplicateDenial = computePressureFixture({
  powers: [duplicateControlDenialA, duplicateControlDenialB],
});
assertApprox(
  controlPressureDuplicateDenial.radarAxes.manipulation,
  controlPressureOneDenial.radarAxes.manipulation,
  0.000001,
  "Control Pressure exact duplicate denial",
);
assert.equal(
  getControlPressureAxisDebug(controlPressureDuplicateDenial)?.duplicateOverlapHandling
    ?.exactDuplicatesRemoved?.length,
  1,
);

const controlPressureDistinctPackages = computePressureFixture({
  powers: [
    duplicateControlDenialA,
    createControlPressurePower({
      name: "Distinct Attack Debuff",
      intention: "DEBUFF",
      cooldown: 2,
      statTarget: "Attack",
    }),
  ],
});
assert.ok(
  controlPressureDistinctPackages.radarAxes.manipulation >
    controlPressureOneDenial.radarAxes.manipulation,
);

const controlPressureNoLinkedDamage = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Denial Without Rider",
      intention: "CONTROL",
      cooldown: 2,
    }),
  ],
});
const controlPressureLinkedWs2 = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Denial With W S 2 Rider",
      intention: "CONTROL",
      cooldown: 2,
      linkedDamageWs: 2,
    }),
  ],
});
const controlPressureLinkedWs8 = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Denial With W S 8 Rider",
      intention: "CONTROL",
      cooldown: 2,
      linkedDamageWs: 8,
    }),
  ],
});
assertApprox(
  controlPressureNoLinkedDamage.radarAxes.manipulation,
  controlPressureLinkedWs2.radarAxes.manipulation,
  0.000001,
  "Control Pressure linked damage independence",
);
assertApprox(
  controlPressureLinkedWs2.radarAxes.manipulation,
  controlPressureLinkedWs8.radarAxes.manipulation,
  0.000001,
  "Control Pressure linked W/S independence",
);

const controlPressureGateScores = (["FORTITUDE", "INTELLECT", "BRAVERY"] as const).map(
  (resistAttribute) =>
    computePressureFixture({
      powers: [
        createControlPressurePower({
          name: `${resistAttribute} Gate Denial`,
          intention: "CONTROL",
          cooldown: 2,
          resistAttribute,
        }),
      ],
    }),
);
assertApprox(
  controlPressureGateScores[0].radarAxes.manipulation,
  controlPressureGateScores[1].radarAxes.manipulation,
  0.000001,
  "Control Pressure Fortitude/Intellect gate neutrality",
);
assertApprox(
  controlPressureGateScores[1].radarAxes.manipulation,
  controlPressureGateScores[2].radarAxes.manipulation,
  0.000001,
  "Control Pressure Intellect/Bravery gate neutrality",
);

const controlPressureSpecificAction = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Specific Action Denial",
      intention: "CONTROL",
      controlMode: "Force specific main action",
      cooldown: 2,
      resistAttribute: "FORTITUDE",
    }),
  ],
});
const controlPressureResponseDenial = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Response Denial",
      intention: "CONTROL",
      controlMode: "Force no response",
      cooldown: 2,
      resistAttribute: "FORTITUDE",
    }),
  ],
});
assertApprox(
  controlPressureMainActionDenial.radarAxes.manipulation,
  controlPressureSpecificAction.radarAxes.manipulation,
  0.000001,
  "Control Pressure specific-action runtime collapse",
);
assertApprox(
  controlPressureSpecificAction.radarAxes.manipulation,
  controlPressureResponseDenial.radarAxes.manipulation,
  0.000001,
  "Control Pressure response-denial runtime collapse",
);
for (const result of [controlPressureSpecificAction, controlPressureResponseDenial]) {
  assert.ok(
    getControlPressureAxisDebug(result)?.unsupportedAuthoringWarnings?.some((warning) =>
      warning.includes("collapses to the same runtime mainActionDenied behaviour"),
    ),
  );
}

const controlPressureAnchors = [
  computePressureFixture({
    tier: "MINION",
    powers: [
      createControlPressurePower({
        name: "Minion Standard Forced Movement",
        intention: "MOVEMENT",
        cooldown: 1,
        resistAttribute: "FORTITUDE",
      }),
    ],
  }),
  computePressureFixture({
    tier: "SOLDIER",
    powers: [
      createControlPressurePower({
        name: "Soldier Standard Denial",
        intention: "CONTROL",
        cooldown: 2,
      }),
    ],
  }),
  computePressureFixture({
    tier: "ELITE",
    powers: [
      createControlPressurePower({
        name: "Elite Standard Denial",
        intention: "CONTROL",
        cooldown: 2,
      }),
      createControlPressurePower({
        name: "Elite Standard Forced Movement",
        intention: "MOVEMENT",
        cooldown: 2,
      }),
    ],
  }),
  computePressureFixture({
    tier: "ELITE",
    legendary: true,
    powers: [
      createControlPressurePower({
        name: "Legendary Elite Standard Denial",
        intention: "CONTROL",
        cooldown: 2,
      }),
      createControlPressurePower({
        name: "Legendary Elite Standard Debuff",
        intention: "DEBUFF",
        cooldown: 3,
      }),
    ],
  }),
  computePressureFixture({
    tier: "BOSS",
    powers: [
      createControlPressurePower({
        name: "Boss Standard Two Target Denial",
        intention: "CONTROL",
        targets: 2,
        cooldown: 1,
      }),
      createControlPressurePower({
        name: "Boss Standard Debuff",
        intention: "DEBUFF",
        cooldown: 2,
      }),
    ],
  }),
  computePressureFixture({
    tier: "BOSS",
    legendary: true,
    powers: [
      createControlPressurePower({
        name: "Legendary Boss Recurring Denial",
        intention: "CONTROL",
        targets: 2,
        cooldown: 1,
        duration: "TURNS",
        durationTurns: 2,
        timing: "START_OF_TURN",
      }),
      createControlPressurePower({
        name: "Legendary Boss Attack Debuff",
        intention: "DEBUFF",
        targets: 2,
        cooldown: 1,
        statTarget: "Attack",
      }),
      createControlPressurePower({
        name: "Legendary Boss Defence Debuff",
        intention: "DEBUFF",
        targets: 2,
        cooldown: 2,
        statTarget: "Guard",
      }),
    ],
  }),
];
for (const [index, anchor] of controlPressureAnchors.entries()) {
  assertApprox(anchor.radarAxes.manipulation, 5, 0.05, `Control Pressure baseline anchor ${index + 1}`);
  assert.equal(getControlPressureAxisDebug(anchor)?.mode, "LEVEL_3_BASELINE_RELATIVE");
}

const controlPressureRegressionA = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Regression Denial A",
      intention: "CONTROL",
      cooldown: 2,
    }),
  ],
  genericManipulation: 0,
});
const controlPressureRegressionB = computePressureFixture({
  powers: [
    createControlPressurePower({
      name: "Renamed Regression Denial B",
      intention: "CONTROL",
      cooldown: 2,
    }),
  ],
  genericManipulation: 999,
});
assertApprox(
  controlPressureRegressionA.radarAxes.manipulation,
  controlPressureRegressionB.radarAxes.manipulation,
  0.000001,
  "Control Pressure resolver Manipulation and naming independence",
);
for (const axis of [
  "physicalThreat",
  "mentalThreat",
  "physicalSurvivability",
  "mentalSurvivability",
  "presence",
  "synergy",
  "mobility",
] as const) {
  assertApprox(
    controlPressureRegressionA.radarAxes[axis],
    controlPressureRegressionB.radarAxes[axis],
    0.000001,
    `Control Pressure ${axis} isolation`,
  );
}

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
      controlPressureAxis: {
        noControl: controlPressureNoPackage.radarAxes.manipulation,
        lightDebuff: controlPressureLightDebuff.radarAxes.manipulation,
        severity: {
          forcedMovement: controlPressureLightMovement.radarAxes.manipulation,
          mainActionDenial: controlPressureMainActionDenial.radarAxes.manipulation,
        },
        breadth: {
          oneTarget: controlPressureOneTarget.radarAxes.manipulation,
          twoTargets: controlPressureTwoTargets.radarAxes.manipulation,
        },
        duration: {
          oneTurn: controlPressureShortDuration.radarAxes.manipulation,
          threeTurns: controlPressureLongDuration.radarAxes.manipulation,
        },
        recurrence: {
          oneShot: controlPressureOneShot.radarAxes.manipulation,
          recurring: controlPressureRecurring.radarAxes.manipulation,
        },
        availability: {
          shortCooldown: controlPressureShortCooldown.radarAxes.manipulation,
          longCooldown: controlPressureLongCooldown.radarAxes.manipulation,
        },
        duplicate: {
          one: controlPressureOneDenial.radarAxes.manipulation,
          duplicated: controlPressureDuplicateDenial.radarAxes.manipulation,
        },
        distinctPackages: controlPressureDistinctPackages.radarAxes.manipulation,
        linkedDamage: {
          none: controlPressureNoLinkedDamage.radarAxes.manipulation,
          ws2: controlPressureLinkedWs2.radarAxes.manipulation,
          ws8: controlPressureLinkedWs8.radarAxes.manipulation,
        },
        gateNeutrality: controlPressureGateScores.map(
          (result) => result.radarAxes.manipulation,
        ),
        unsupportedRuntimeCollapse: {
          mainAction: controlPressureMainActionDenial.radarAxes.manipulation,
          specificAction: controlPressureSpecificAction.radarAxes.manipulation,
          response: controlPressureResponseDenial.radarAxes.manipulation,
          warnings:
            getControlPressureAxisDebug(controlPressureSpecificAction)
              ?.unsupportedAuthoringWarnings ?? [],
        },
        anchors: controlPressureAnchors.map((anchor) => anchor.radarAxes.manipulation),
        resolverManipulationIndependence: [
          controlPressureRegressionA.radarAxes.manipulation,
          controlPressureRegressionB.radarAxes.manipulation,
        ],
      },
    },
    null,
    2,
  ),
);

console.log("monsterOutcomeCalculator.smoke.ts passed");
