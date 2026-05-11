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
const cooldownOneDebug = getOutcomePowerDebug(cooldownOnePowerOutcome);
const cooldownThreeDebug = getOutcomePowerDebug(cooldownThreePowerOutcome);
const derivedCooldownDebug = getOutcomePowerDebug(derivedCooldownPowerOutcome);
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
    },
    null,
    2,
  ),
);

console.log("monsterOutcomeCalculator.smoke.ts passed");
