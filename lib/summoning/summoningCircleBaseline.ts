import type { CalculatorConfig, LevelCurvePoint } from "@/lib/calculators/calculatorConfig";
import type { RadarAxes } from "@/lib/calculators/monsterOutcomeCalculator";
import type { ProtectionTuningValues } from "@/lib/config/combatTuningShared";
import {
  calculateMonsterResilienceValues,
  getArmorSkillDiceCountFromAttributes,
  getDodgeValue,
  getWeaponSkillDiceCountFromAttributes,
  getWillpowerDiceCountFromAttributes,
} from "@/lib/summoning/attributes";
import type { MonsterTier, MonsterUpsertInput } from "@/lib/summoning/types";

type DodgeExpectedAttackCurveRow = {
  minLevel: number;
  maxLevel: number;
  typical: number;
};

const DODGE_EXPECTED_INCOMING_ATTACK_DICE_BY_TIER: Record<
  MonsterTier,
  DodgeExpectedAttackCurveRow[]
> = {
  MINION: [
    { minLevel: 1, maxLevel: 8, typical: 2 },
    { minLevel: 9, maxLevel: 15, typical: 3 },
    { minLevel: 16, maxLevel: 20, typical: 4 },
  ],
  SOLDIER: [
    { minLevel: 1, maxLevel: 4, typical: 2 },
    { minLevel: 5, maxLevel: 11, typical: 3 },
    { minLevel: 12, maxLevel: 15, typical: 4 },
    { minLevel: 16, maxLevel: 20, typical: 5 },
  ],
  ELITE: [
    { minLevel: 1, maxLevel: 4, typical: 3 },
    { minLevel: 5, maxLevel: 11, typical: 4 },
    { minLevel: 12, maxLevel: 15, typical: 5 },
    { minLevel: 16, maxLevel: 20, typical: 6 },
  ],
  BOSS: [
    { minLevel: 1, maxLevel: 4, typical: 4 },
    { minLevel: 5, maxLevel: 11, typical: 5 },
    { minLevel: 12, maxLevel: 15, typical: 6 },
    { minLevel: 16, maxLevel: 20, typical: 7 },
  ],
};

function createEmptyAxisBonuses(): RadarAxes {
  return {
    physicalThreat: 0,
    mentalThreat: 0,
    survivability: 0,
    manipulation: 0,
    synergy: 0,
    mobility: 0,
    presence: 0,
  };
}

function getCurvePointForLevel(curve: LevelCurvePoint[], level: number): LevelCurvePoint {
  if (curve.length === 0) return { level: 1, min: 0, max: 1 };
  const sorted = [...curve].sort((a, b) => a.level - b.level);
  const minLevel = sorted[0].level;
  const maxLevel = sorted[sorted.length - 1].level;
  const normalizedLevel = Math.max(minLevel, Math.min(maxLevel, Math.trunc(level || minLevel)));
  const exact = sorted.find((point) => point.level === normalizedLevel);
  if (exact) return exact;
  if (normalizedLevel < minLevel) return sorted[0];
  return sorted[sorted.length - 1];
}

function getTierAdjustedAxisBudgetTarget(curvePoint: LevelCurvePoint, tierMultiplier: number): number {
  return curvePoint.max * Math.max(0, tierMultiplier);
}

function getCalculatorTierMultiplier(
  monster: Pick<MonsterUpsertInput, "tier" | "legendary">,
  config: CalculatorConfig,
): number {
  const tierKey = monster.legendary ? "LEGENDARY" : monster.tier;
  return config.tierMultipliers[tierKey] ?? config.tierMultipliers.ELITE;
}

function getExpectedIncomingAttackDiceForDodge(
  level: number,
  tier: MonsterTier | null | undefined,
): number {
  const normalizedLevel = Math.max(1, Math.trunc(level || 1));
  const normalizedTier = tier ?? "ELITE";
  const rows =
    DODGE_EXPECTED_INCOMING_ATTACK_DICE_BY_TIER[normalizedTier] ??
    DODGE_EXPECTED_INCOMING_ATTACK_DICE_BY_TIER.ELITE;
  const match = rows.find(
    (row) => normalizedLevel >= row.minLevel && normalizedLevel <= row.maxLevel,
  );
  if (match) return match.typical;
  if (normalizedLevel < rows[0].minLevel) return rows[0].typical;
  return rows[rows.length - 1].typical;
}

function getSmoothShare(rawValue: number, scale: number, maxShare: number): number {
  const normalized = Math.max(0, Number.isFinite(rawValue) ? rawValue : 0);
  const safeScale = Math.max(0.001, scale);
  const safeMax = Math.max(0, maxShare);
  return safeMax * (1 - Math.exp(-normalized / safeScale));
}

function getDodgeParityProgress(
  currentDodgeDice: number,
  expectedIncomingAttackDice: number,
): number {
  const current = Math.max(0, Number.isFinite(currentDodgeDice) ? currentDodgeDice : 0);
  const expected = Math.max(
    1,
    Number.isFinite(expectedIncomingAttackDice) ? expectedIncomingAttackDice : 1,
  );
  return Math.min(1, current / expected);
}

export type StrippedSummoningCircleBaseline = {
  monster: MonsterUpsertInput;
  equipmentModifierAxisBonuses: RadarAxes;
  summary: {
    baselineScaffoldSource: string;
    level: number;
    tier: MonsterTier;
    physicalResilienceMax: number;
    mentalPerseveranceMax: number;
    dodgeValue: number;
    dodgeDice: number;
    armorSkillValue: number;
    willpowerValue: number;
    physicalBlockPerSuccess: number;
    mentalBlockPerSuccess: number;
    defencePackageRawBonus: number;
    defencePackageTuning: {
      defenceStringProtectionOutputMaxShare: number;
      defenceStringProtectionOutputScale: number;
      dodgeBaselineMaxShare: number;
      dodgeBaselineScale: number;
      dodgeParityMaxShare: number;
      dodgeParityScale: number;
      dodgeAboveExpectedMaxShare: number;
      dodgeAboveExpectedScale: number;
      dodgeExtremeAboveExpectedMaxShare: number;
      dodgeExtremeAboveExpectedScale: number;
      dodgeTotalMaxShare: number;
    };
    note: string;
  };
};

export function buildStrippedSummoningCircleBaseline(params: {
  level: number;
  tier: MonsterTier;
  powers: MonsterUpsertInput["powers"];
  protectionTuning: ProtectionTuningValues;
  calculatorConfig: CalculatorConfig;
}): StrippedSummoningCircleBaseline {
  const level = Math.max(1, Math.min(20, Math.trunc(params.level || 1)));
  const tier = params.tier;
  const baseMonster = {
    level,
    tier,
    legendary: false,
    attackDie: "D6",
    defenceDie: "D6",
    fortitudeDie: "D6",
    intellectDie: "D6",
    supportDie: "D6",
    braveryDie: "D6",
  } as const;
  const resilienceValues = calculateMonsterResilienceValues(baseMonster, params.protectionTuning);
  const weaponSkillValue = getWeaponSkillDiceCountFromAttributes(
    baseMonster.attackDie,
    baseMonster.braveryDie,
    params.protectionTuning,
  );
  const armorSkillValue = getArmorSkillDiceCountFromAttributes(
    baseMonster.defenceDie,
    baseMonster.fortitudeDie,
    params.protectionTuning,
  );
  const willpowerValue = getWillpowerDiceCountFromAttributes(
    baseMonster.supportDie,
    baseMonster.braveryDie,
    params.protectionTuning,
  );
  const totalPhysicalProtection = 0;
  const totalMentalProtection = 0;
  const dodgeValue = getDodgeValue(
    baseMonster.defenceDie,
    baseMonster.intellectDie,
    level,
    totalPhysicalProtection,
    params.protectionTuning,
  );
  const dodgeDice = Math.max(0, Math.ceil(dodgeValue / 6));
  const physicalBlockPerSuccess = 0;
  const mentalBlockPerSuccess = 0;

  const tierMultiplier = getCalculatorTierMultiplier(baseMonster, params.calculatorConfig);
  const survivabilityAxisBudgetTarget = getTierAdjustedAxisBudgetTarget(
    getCurvePointForLevel(params.calculatorConfig.scoringCurves.survivability, level),
    tierMultiplier,
  );
  const expectedIncomingAttackDice = getExpectedIncomingAttackDiceForDodge(level, tier);
  const baselineDodgeShare = getSmoothShare(
    dodgeDice,
    params.protectionTuning.dodgeBaselineScale,
    params.protectionTuning.dodgeBaselineMaxShare,
  );
  const dodgeParityProgress = getDodgeParityProgress(dodgeDice, expectedIncomingAttackDice);
  const parityDodgeShare = getSmoothShare(
    dodgeParityProgress,
    params.protectionTuning.dodgeParityScale,
    params.protectionTuning.dodgeParityMaxShare,
  );
  const dodgeAboveExpectedDice = Math.max(0, dodgeDice - expectedIncomingAttackDice);
  const aboveExpectedDodgeShare = getSmoothShare(
    Math.min(1, dodgeAboveExpectedDice),
    params.protectionTuning.dodgeAboveExpectedScale,
    params.protectionTuning.dodgeAboveExpectedMaxShare,
  );
  const extremeAboveExpectedDice = Math.max(0, dodgeAboveExpectedDice - 1);
  const extremeAboveExpectedDodgeShare = getSmoothShare(
    extremeAboveExpectedDice,
    params.protectionTuning.dodgeExtremeAboveExpectedScale,
    params.protectionTuning.dodgeExtremeAboveExpectedMaxShare,
  );
  const totalDodgeShare = Math.min(
    params.protectionTuning.dodgeTotalMaxShare,
    baselineDodgeShare +
      parityDodgeShare +
      aboveExpectedDodgeShare +
      extremeAboveExpectedDodgeShare,
  );
  const physicalDefenceSurvivabilityShare = getSmoothShare(
    armorSkillValue * physicalBlockPerSuccess,
    params.protectionTuning.defenceStringProtectionOutputScale,
    params.protectionTuning.defenceStringProtectionOutputMaxShare,
  );
  const mentalDefenceSurvivabilityShare = getSmoothShare(
    willpowerValue * mentalBlockPerSuccess,
    params.protectionTuning.defenceStringProtectionOutputScale,
    params.protectionTuning.defenceStringProtectionOutputMaxShare,
  );
  const defencePackageShareTotal =
    totalDodgeShare +
    physicalDefenceSurvivabilityShare +
    mentalDefenceSurvivabilityShare;
  const defencePackageRawBonus = survivabilityAxisBudgetTarget * defencePackageShareTotal;
  const equipmentModifierAxisBonuses = createEmptyAxisBonuses();
  equipmentModifierAxisBonuses.survivability = defencePackageRawBonus;

  const monster: MonsterUpsertInput = {
    name: "Power Radar Comparison Neutral",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level,
    tier,
    legendary: false,
    customNotes: null,
    physicalResilienceCurrent: resilienceValues.physicalResilienceMax,
    physicalResilienceMax: resilienceValues.physicalResilienceMax,
    mentalPerseveranceCurrent: resilienceValues.mentalPerseveranceMax,
    mentalPerseveranceMax: resilienceValues.mentalPerseveranceMax,
    physicalProtection: totalPhysicalProtection,
    mentalProtection: totalMentalProtection,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 0,
    attackDie: baseMonster.attackDie,
    attackResistDie: 0,
    attackModifier: 0,
    defenceDie: baseMonster.defenceDie,
    defenceResistDie: 0,
    defenceModifier: 0,
    fortitudeDie: baseMonster.fortitudeDie,
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: baseMonster.intellectDie,
    intellectResistDie: 0,
    intellectModifier: 0,
    supportDie: baseMonster.supportDie,
    supportResistDie: 0,
    supportModifier: 0,
    braveryDie: baseMonster.braveryDie,
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue,
    weaponSkillModifier: 0,
    armorSkillValue,
    armorSkillModifier: 0,
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
    tags: [],
    traits: [],
    attacks: [],
    naturalAttack: null,
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
    powers: params.powers,
  };

  return {
    monster,
    equipmentModifierAxisBonuses,
    summary: {
      baselineScaffoldSource: "shared_stripped_summoning_circle_baseline",
      level,
      tier,
      physicalResilienceMax: resilienceValues.physicalResilienceMax,
      mentalPerseveranceMax: resilienceValues.mentalPerseveranceMax,
      dodgeValue,
      dodgeDice,
      armorSkillValue,
      willpowerValue,
      physicalBlockPerSuccess,
      mentalBlockPerSuccess,
      defencePackageRawBonus,
      defencePackageTuning: {
        defenceStringProtectionOutputMaxShare:
          params.protectionTuning.defenceStringProtectionOutputMaxShare,
        defenceStringProtectionOutputScale:
          params.protectionTuning.defenceStringProtectionOutputScale,
        dodgeBaselineMaxShare: params.protectionTuning.dodgeBaselineMaxShare,
        dodgeBaselineScale: params.protectionTuning.dodgeBaselineScale,
        dodgeParityMaxShare: params.protectionTuning.dodgeParityMaxShare,
        dodgeParityScale: params.protectionTuning.dodgeParityScale,
        dodgeAboveExpectedMaxShare: params.protectionTuning.dodgeAboveExpectedMaxShare,
        dodgeAboveExpectedScale: params.protectionTuning.dodgeAboveExpectedScale,
        dodgeExtremeAboveExpectedMaxShare:
          params.protectionTuning.dodgeExtremeAboveExpectedMaxShare,
        dodgeExtremeAboveExpectedScale:
          params.protectionTuning.dodgeExtremeAboveExpectedScale,
        dodgeTotalMaxShare: params.protectionTuning.dodgeTotalMaxShare,
      },
      note:
        "Derived from the stripped Summoning Circle live baseline: D6 attributes, combat-tuned resilience/skills, no traits, no gear, no natural attacks, no limit breaks.",
    },
  };
}
