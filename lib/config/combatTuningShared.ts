import type { CalculatorConfig } from "@/lib/calculators/calculatorConfig";

export const DEFAULT_PROTECTION_K = 2;
export const DEFAULT_PROTECTION_S = 6;
export const DEFAULT_ATTACK_WEIGHT = 1;
export const DEFAULT_DEFENCE_WEIGHT = 1;
export const DEFAULT_FORTITUDE_WEIGHT = 1;
export const DEFAULT_INTELLECT_WEIGHT = 1;
export const DEFAULT_SUPPORT_WEIGHT = 1;
export const DEFAULT_BRAVERY_WEIGHT = 1;
export const DEFAULT_WEAPON_SKILL_BRAVERY_WEIGHT = 2;
export const DEFAULT_WEAPON_SKILL_ATTACK_WEIGHT = 1;
export const DEFAULT_WEAPON_SKILL_BASELINE_OFFSET = 1;
export const DEFAULT_WEAPON_SKILL_SCALE = 1;
export const DEFAULT_ARMOR_SKILL_FORTITUDE_WEIGHT = 2;
export const DEFAULT_ARMOR_SKILL_DEFENCE_WEIGHT = 1;
export const DEFAULT_ARMOR_SKILL_BASELINE_OFFSET = 1;
export const DEFAULT_ARMOR_SKILL_SCALE = 1;
export const DEFAULT_WILLPOWER_SUPPORT_WEIGHT = 2;
export const DEFAULT_WILLPOWER_BRAVERY_WEIGHT = 1;
export const DEFAULT_WILLPOWER_BASELINE_OFFSET = 1;
export const DEFAULT_WILLPOWER_SCALE = 1;
export const DEFAULT_DODGE_INTELLECT_WEIGHT = 2;
export const DEFAULT_DODGE_DEFENCE_WEIGHT = 1;
export const DEFAULT_DODGE_ATTRIBUTE_DIVISOR = 2;
export const DEFAULT_DODGE_PROTECTION_PENALTY_WEIGHT = 1;
export const DEFAULT_NATURAL_ATTACK_STRENGTH_WOUND_MULTIPLIER = 2;
export const DEFAULT_NATURAL_ATTACK_LEVEL_WOUND_BONUS_DIVISOR = 3;
export const DEFAULT_MINION_TIER_MULTIPLIER = 1;
export const DEFAULT_SOLDIER_TIER_MULTIPLIER = 1.5;
export const DEFAULT_ELITE_TIER_MULTIPLIER = 2;
export const DEFAULT_BOSS_TIER_MULTIPLIER = 3;
export const DEFAULT_EXPECTED_PHYSICAL_RESILIENCE_AT_1 = 19;
export const DEFAULT_EXPECTED_PHYSICAL_RESILIENCE_PER_LEVEL = 1.5;
export const DEFAULT_EXPECTED_MENTAL_PERSEVERANCE_AT_1 = 19;
export const DEFAULT_EXPECTED_MENTAL_PERSEVERANCE_PER_LEVEL = 1.5;

export const DEFAULT_EXPECTED_POOL_MINION_MULTIPLIER = 1;
export const DEFAULT_EXPECTED_POOL_SOLDIER_MULTIPLIER = 1.5;
export const DEFAULT_EXPECTED_POOL_ELITE_MULTIPLIER = 2;
export const DEFAULT_EXPECTED_POOL_BOSS_MULTIPLIER = 3;

export const DEFAULT_POOL_WEAKER_SIDE_WEIGHT = 0.75;
export const DEFAULT_POOL_AVERAGE_WEIGHT = 0.25;

export const DEFAULT_POOL_BELOW_EXPECTED_MAX_PENALTY_SHARE = 0.35;
export const DEFAULT_POOL_BELOW_EXPECTED_SCALE = 0.25;
export const DEFAULT_POOL_ABOVE_EXPECTED_MAX_BONUS_SHARE = 0.25;
export const DEFAULT_POOL_ABOVE_EXPECTED_SCALE = 0.4;
export const DEFAULT_DEFENCE_STRING_PROTECTION_OUTPUT_MAX_SHARE = 0.4;
export const DEFAULT_DEFENCE_STRING_PROTECTION_OUTPUT_SCALE = 12;
export const DEFAULT_DODGE_BASELINE_MAX_SHARE = 0.2;
export const DEFAULT_DODGE_BASELINE_SCALE = 1.25;
export const DEFAULT_DODGE_PARITY_MAX_SHARE = 0.32;
export const DEFAULT_DODGE_PARITY_SCALE = 0.38;
export const DEFAULT_DODGE_ABOVE_EXPECTED_MAX_SHARE = 0.2;
export const DEFAULT_DODGE_ABOVE_EXPECTED_SCALE = 0.85;
export const DEFAULT_DODGE_EXTREME_ABOVE_EXPECTED_MAX_SHARE = 0.28;
export const DEFAULT_DODGE_EXTREME_ABOVE_EXPECTED_SCALE = 0.6;
export const DEFAULT_DODGE_TOTAL_MAX_SHARE = 1.02;

export type ProtectionTuningValues = {
  protectionK: number;
  protectionS: number;
  attackWeight: number;
  defenceWeight: number;
  fortitudeWeight: number;
  intellectWeight: number;
  supportWeight: number;
  braveryWeight: number;
  weaponSkillBraveryWeight: number;
  weaponSkillAttackWeight: number;
  weaponSkillBaselineOffset: number;
  weaponSkillScale: number;
  armorSkillFortitudeWeight: number;
  armorSkillDefenceWeight: number;
  armorSkillBaselineOffset: number;
  armorSkillScale: number;
  willpowerSupportWeight: number;
  willpowerBraveryWeight: number;
  willpowerBaselineOffset: number;
  willpowerScale: number;
  dodgeIntellectWeight: number;
  dodgeDefenceWeight: number;
  dodgeAttributeDivisor: number;
  dodgeProtectionPenaltyWeight: number;
  naturalAttackStrengthWoundMultiplier: number;
  naturalAttackLevelWoundBonusDivisor: number;
  minionTierMultiplier: number;
  soldierTierMultiplier: number;
  eliteTierMultiplier: number;
  bossTierMultiplier: number;
  expectedPhysicalResilienceAt1: number;
  expectedPhysicalResiliencePerLevel: number;
  expectedMentalPerseveranceAt1: number;
  expectedMentalPerseverancePerLevel: number;

  expectedPoolMinionMultiplier: number;
  expectedPoolSoldierMultiplier: number;
  expectedPoolEliteMultiplier: number;
  expectedPoolBossMultiplier: number;

  poolWeakerSideWeight: number;
  poolAverageWeight: number;

  poolBelowExpectedMaxPenaltyShare: number;
  poolBelowExpectedScale: number;
  poolAboveExpectedMaxBonusShare: number;
  poolAboveExpectedScale: number;
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

export type CombatTuningConfigStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type CombatTuningFlatValues = Record<string, number>;
export type CombatTuningSnapshot = {
  setId: string;
  name: string;
  slug: string;
  status: CombatTuningConfigStatus;
  updatedAt: string;
  values: CombatTuningFlatValues;
};

export const DEFAULT_COMBAT_TUNING_VALUES: ProtectionTuningValues = {
  protectionK: DEFAULT_PROTECTION_K,
  protectionS: DEFAULT_PROTECTION_S,
  attackWeight: DEFAULT_ATTACK_WEIGHT,
  defenceWeight: DEFAULT_DEFENCE_WEIGHT,
  fortitudeWeight: DEFAULT_FORTITUDE_WEIGHT,
  intellectWeight: DEFAULT_INTELLECT_WEIGHT,
  supportWeight: DEFAULT_SUPPORT_WEIGHT,
  braveryWeight: DEFAULT_BRAVERY_WEIGHT,
  weaponSkillBraveryWeight: DEFAULT_WEAPON_SKILL_BRAVERY_WEIGHT,
  weaponSkillAttackWeight: DEFAULT_WEAPON_SKILL_ATTACK_WEIGHT,
  weaponSkillBaselineOffset: DEFAULT_WEAPON_SKILL_BASELINE_OFFSET,
  weaponSkillScale: DEFAULT_WEAPON_SKILL_SCALE,
  armorSkillFortitudeWeight: DEFAULT_ARMOR_SKILL_FORTITUDE_WEIGHT,
  armorSkillDefenceWeight: DEFAULT_ARMOR_SKILL_DEFENCE_WEIGHT,
  armorSkillBaselineOffset: DEFAULT_ARMOR_SKILL_BASELINE_OFFSET,
  armorSkillScale: DEFAULT_ARMOR_SKILL_SCALE,
  willpowerSupportWeight: DEFAULT_WILLPOWER_SUPPORT_WEIGHT,
  willpowerBraveryWeight: DEFAULT_WILLPOWER_BRAVERY_WEIGHT,
  willpowerBaselineOffset: DEFAULT_WILLPOWER_BASELINE_OFFSET,
  willpowerScale: DEFAULT_WILLPOWER_SCALE,
  dodgeIntellectWeight: DEFAULT_DODGE_INTELLECT_WEIGHT,
  dodgeDefenceWeight: DEFAULT_DODGE_DEFENCE_WEIGHT,
  dodgeAttributeDivisor: DEFAULT_DODGE_ATTRIBUTE_DIVISOR,
  dodgeProtectionPenaltyWeight: DEFAULT_DODGE_PROTECTION_PENALTY_WEIGHT,
  naturalAttackStrengthWoundMultiplier: DEFAULT_NATURAL_ATTACK_STRENGTH_WOUND_MULTIPLIER,
  naturalAttackLevelWoundBonusDivisor: DEFAULT_NATURAL_ATTACK_LEVEL_WOUND_BONUS_DIVISOR,
  minionTierMultiplier: DEFAULT_MINION_TIER_MULTIPLIER,
  soldierTierMultiplier: DEFAULT_SOLDIER_TIER_MULTIPLIER,
  eliteTierMultiplier: DEFAULT_ELITE_TIER_MULTIPLIER,
  bossTierMultiplier: DEFAULT_BOSS_TIER_MULTIPLIER,
  expectedPhysicalResilienceAt1: DEFAULT_EXPECTED_PHYSICAL_RESILIENCE_AT_1,
  expectedPhysicalResiliencePerLevel: DEFAULT_EXPECTED_PHYSICAL_RESILIENCE_PER_LEVEL,
  expectedMentalPerseveranceAt1: DEFAULT_EXPECTED_MENTAL_PERSEVERANCE_AT_1,
  expectedMentalPerseverancePerLevel: DEFAULT_EXPECTED_MENTAL_PERSEVERANCE_PER_LEVEL,
  expectedPoolMinionMultiplier: DEFAULT_EXPECTED_POOL_MINION_MULTIPLIER,
  expectedPoolSoldierMultiplier: DEFAULT_EXPECTED_POOL_SOLDIER_MULTIPLIER,
  expectedPoolEliteMultiplier: DEFAULT_EXPECTED_POOL_ELITE_MULTIPLIER,
  expectedPoolBossMultiplier: DEFAULT_EXPECTED_POOL_BOSS_MULTIPLIER,
  poolWeakerSideWeight: DEFAULT_POOL_WEAKER_SIDE_WEIGHT,
  poolAverageWeight: DEFAULT_POOL_AVERAGE_WEIGHT,
  poolBelowExpectedMaxPenaltyShare: DEFAULT_POOL_BELOW_EXPECTED_MAX_PENALTY_SHARE,
  poolBelowExpectedScale: DEFAULT_POOL_BELOW_EXPECTED_SCALE,
  poolAboveExpectedMaxBonusShare: DEFAULT_POOL_ABOVE_EXPECTED_MAX_BONUS_SHARE,
  poolAboveExpectedScale: DEFAULT_POOL_ABOVE_EXPECTED_SCALE,
  defenceStringProtectionOutputMaxShare: DEFAULT_DEFENCE_STRING_PROTECTION_OUTPUT_MAX_SHARE,
  defenceStringProtectionOutputScale: DEFAULT_DEFENCE_STRING_PROTECTION_OUTPUT_SCALE,
  dodgeBaselineMaxShare: DEFAULT_DODGE_BASELINE_MAX_SHARE,
  dodgeBaselineScale: DEFAULT_DODGE_BASELINE_SCALE,
  dodgeParityMaxShare: DEFAULT_DODGE_PARITY_MAX_SHARE,
  dodgeParityScale: DEFAULT_DODGE_PARITY_SCALE,
  dodgeAboveExpectedMaxShare: DEFAULT_DODGE_ABOVE_EXPECTED_MAX_SHARE,
  dodgeAboveExpectedScale: DEFAULT_DODGE_ABOVE_EXPECTED_SCALE,
  dodgeExtremeAboveExpectedMaxShare: DEFAULT_DODGE_EXTREME_ABOVE_EXPECTED_MAX_SHARE,
  dodgeExtremeAboveExpectedScale: DEFAULT_DODGE_EXTREME_ABOVE_EXPECTED_SCALE,
  dodgeTotalMaxShare: DEFAULT_DODGE_TOTAL_MAX_SHARE,
};

export const COMBAT_TUNING_CONFIG_KEY_ORDER = Object.keys(DEFAULT_COMBAT_TUNING_VALUES);

export function combatTuningValuesToFlat(values: ProtectionTuningValues): CombatTuningFlatValues {
  return { ...values };
}

export function normalizeCombatTuningFlatValues(
  input?: Record<string, unknown> | null,
): CombatTuningFlatValues {
  return combatTuningValuesToFlat(normalizeCombatTuning(input));
}

function toPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

export function normalizeCombatTuning(input?: Partial<Record<keyof ProtectionTuningValues, unknown>> | null): ProtectionTuningValues {
  return {
    protectionK: toPositiveNumber(input?.protectionK, DEFAULT_PROTECTION_K),
    protectionS: toPositiveNumber(input?.protectionS, DEFAULT_PROTECTION_S),
    attackWeight: toPositiveNumber(input?.attackWeight, DEFAULT_ATTACK_WEIGHT),
    defenceWeight: toPositiveNumber(input?.defenceWeight, DEFAULT_DEFENCE_WEIGHT),
    fortitudeWeight: toPositiveNumber(input?.fortitudeWeight, DEFAULT_FORTITUDE_WEIGHT),
    intellectWeight: toPositiveNumber(input?.intellectWeight, DEFAULT_INTELLECT_WEIGHT),
    supportWeight: toPositiveNumber(input?.supportWeight, DEFAULT_SUPPORT_WEIGHT),
    braveryWeight: toPositiveNumber(input?.braveryWeight, DEFAULT_BRAVERY_WEIGHT),
    weaponSkillBraveryWeight: toPositiveNumber(
      input?.weaponSkillBraveryWeight,
      DEFAULT_WEAPON_SKILL_BRAVERY_WEIGHT,
    ),
    weaponSkillAttackWeight: toPositiveNumber(
      input?.weaponSkillAttackWeight,
      DEFAULT_WEAPON_SKILL_ATTACK_WEIGHT,
    ),
    weaponSkillBaselineOffset: toPositiveNumber(
      input?.weaponSkillBaselineOffset,
      DEFAULT_WEAPON_SKILL_BASELINE_OFFSET,
    ),
    weaponSkillScale: toPositiveNumber(input?.weaponSkillScale, DEFAULT_WEAPON_SKILL_SCALE),
    armorSkillFortitudeWeight: toPositiveNumber(
      input?.armorSkillFortitudeWeight,
      DEFAULT_ARMOR_SKILL_FORTITUDE_WEIGHT,
    ),
    armorSkillDefenceWeight: toPositiveNumber(
      input?.armorSkillDefenceWeight,
      DEFAULT_ARMOR_SKILL_DEFENCE_WEIGHT,
    ),
    armorSkillBaselineOffset: toPositiveNumber(
      input?.armorSkillBaselineOffset,
      DEFAULT_ARMOR_SKILL_BASELINE_OFFSET,
    ),
    armorSkillScale: toPositiveNumber(input?.armorSkillScale, DEFAULT_ARMOR_SKILL_SCALE),
    willpowerSupportWeight: toPositiveNumber(
      input?.willpowerSupportWeight,
      DEFAULT_WILLPOWER_SUPPORT_WEIGHT,
    ),
    willpowerBraveryWeight: toPositiveNumber(
      input?.willpowerBraveryWeight,
      DEFAULT_WILLPOWER_BRAVERY_WEIGHT,
    ),
    willpowerBaselineOffset: toPositiveNumber(
      input?.willpowerBaselineOffset,
      DEFAULT_WILLPOWER_BASELINE_OFFSET,
    ),
    willpowerScale: toPositiveNumber(input?.willpowerScale, DEFAULT_WILLPOWER_SCALE),
    dodgeIntellectWeight: toPositiveNumber(
      input?.dodgeIntellectWeight,
      DEFAULT_DODGE_INTELLECT_WEIGHT,
    ),
    dodgeDefenceWeight: toPositiveNumber(
      input?.dodgeDefenceWeight,
      DEFAULT_DODGE_DEFENCE_WEIGHT,
    ),
    dodgeAttributeDivisor: toPositiveNumber(
      input?.dodgeAttributeDivisor,
      DEFAULT_DODGE_ATTRIBUTE_DIVISOR,
    ),
    dodgeProtectionPenaltyWeight: toPositiveNumber(
      input?.dodgeProtectionPenaltyWeight,
      DEFAULT_DODGE_PROTECTION_PENALTY_WEIGHT,
    ),
    naturalAttackStrengthWoundMultiplier: toPositiveNumber(
      input?.naturalAttackStrengthWoundMultiplier,
      DEFAULT_NATURAL_ATTACK_STRENGTH_WOUND_MULTIPLIER,
    ),
    naturalAttackLevelWoundBonusDivisor: toPositiveNumber(
      input?.naturalAttackLevelWoundBonusDivisor,
      DEFAULT_NATURAL_ATTACK_LEVEL_WOUND_BONUS_DIVISOR,
    ),
    minionTierMultiplier: toPositiveNumber(
      input?.minionTierMultiplier,
      DEFAULT_MINION_TIER_MULTIPLIER,
    ),
    soldierTierMultiplier: toPositiveNumber(
      input?.soldierTierMultiplier,
      DEFAULT_SOLDIER_TIER_MULTIPLIER,
    ),
    eliteTierMultiplier: toPositiveNumber(
      input?.eliteTierMultiplier,
      DEFAULT_ELITE_TIER_MULTIPLIER,
    ),
    bossTierMultiplier: toPositiveNumber(
      input?.bossTierMultiplier,
      DEFAULT_BOSS_TIER_MULTIPLIER,
    ),
    expectedPhysicalResilienceAt1: toPositiveNumber(
      input?.expectedPhysicalResilienceAt1,
      DEFAULT_EXPECTED_PHYSICAL_RESILIENCE_AT_1,
    ),
    expectedPhysicalResiliencePerLevel: toPositiveNumber(
      input?.expectedPhysicalResiliencePerLevel,
      DEFAULT_EXPECTED_PHYSICAL_RESILIENCE_PER_LEVEL,
    ),
    expectedMentalPerseveranceAt1: toPositiveNumber(
      input?.expectedMentalPerseveranceAt1,
      DEFAULT_EXPECTED_MENTAL_PERSEVERANCE_AT_1,
    ),
    expectedMentalPerseverancePerLevel: toPositiveNumber(
      input?.expectedMentalPerseverancePerLevel,
      DEFAULT_EXPECTED_MENTAL_PERSEVERANCE_PER_LEVEL,
    ),
    expectedPoolMinionMultiplier: toPositiveNumber(
      input?.expectedPoolMinionMultiplier,
      DEFAULT_EXPECTED_POOL_MINION_MULTIPLIER,
    ),
    expectedPoolSoldierMultiplier: toPositiveNumber(
      input?.expectedPoolSoldierMultiplier,
      DEFAULT_EXPECTED_POOL_SOLDIER_MULTIPLIER,
    ),
    expectedPoolEliteMultiplier: toPositiveNumber(
      input?.expectedPoolEliteMultiplier,
      DEFAULT_EXPECTED_POOL_ELITE_MULTIPLIER,
    ),
    expectedPoolBossMultiplier: toPositiveNumber(
      input?.expectedPoolBossMultiplier,
      DEFAULT_EXPECTED_POOL_BOSS_MULTIPLIER,
    ),
    poolWeakerSideWeight: toPositiveNumber(
      input?.poolWeakerSideWeight,
      DEFAULT_POOL_WEAKER_SIDE_WEIGHT,
    ),
    poolAverageWeight: toPositiveNumber(
      input?.poolAverageWeight,
      DEFAULT_POOL_AVERAGE_WEIGHT,
    ),
    poolBelowExpectedMaxPenaltyShare: toPositiveNumber(
      input?.poolBelowExpectedMaxPenaltyShare,
      DEFAULT_POOL_BELOW_EXPECTED_MAX_PENALTY_SHARE,
    ),
    poolBelowExpectedScale: toPositiveNumber(
      input?.poolBelowExpectedScale,
      DEFAULT_POOL_BELOW_EXPECTED_SCALE,
    ),
    poolAboveExpectedMaxBonusShare: toPositiveNumber(
      input?.poolAboveExpectedMaxBonusShare,
      DEFAULT_POOL_ABOVE_EXPECTED_MAX_BONUS_SHARE,
    ),
    poolAboveExpectedScale: toPositiveNumber(
      input?.poolAboveExpectedScale,
      DEFAULT_POOL_ABOVE_EXPECTED_SCALE,
    ),
    defenceStringProtectionOutputMaxShare: toPositiveNumber(
      input?.defenceStringProtectionOutputMaxShare,
      DEFAULT_DEFENCE_STRING_PROTECTION_OUTPUT_MAX_SHARE,
    ),
    defenceStringProtectionOutputScale: toPositiveNumber(
      input?.defenceStringProtectionOutputScale,
      DEFAULT_DEFENCE_STRING_PROTECTION_OUTPUT_SCALE,
    ),
    dodgeBaselineMaxShare: toPositiveNumber(
      input?.dodgeBaselineMaxShare,
      DEFAULT_DODGE_BASELINE_MAX_SHARE,
    ),
    dodgeBaselineScale: toPositiveNumber(input?.dodgeBaselineScale, DEFAULT_DODGE_BASELINE_SCALE),
    dodgeParityMaxShare: toPositiveNumber(
      input?.dodgeParityMaxShare,
      DEFAULT_DODGE_PARITY_MAX_SHARE,
    ),
    dodgeParityScale: toPositiveNumber(input?.dodgeParityScale, DEFAULT_DODGE_PARITY_SCALE),
    dodgeAboveExpectedMaxShare: toPositiveNumber(
      input?.dodgeAboveExpectedMaxShare,
      DEFAULT_DODGE_ABOVE_EXPECTED_MAX_SHARE,
    ),
    dodgeAboveExpectedScale: toPositiveNumber(
      input?.dodgeAboveExpectedScale,
      DEFAULT_DODGE_ABOVE_EXPECTED_SCALE,
    ),
    dodgeExtremeAboveExpectedMaxShare: toPositiveNumber(
      input?.dodgeExtremeAboveExpectedMaxShare,
      DEFAULT_DODGE_EXTREME_ABOVE_EXPECTED_MAX_SHARE,
    ),
    dodgeExtremeAboveExpectedScale: toPositiveNumber(
      input?.dodgeExtremeAboveExpectedScale,
      DEFAULT_DODGE_EXTREME_ABOVE_EXPECTED_SCALE,
    ),
    dodgeTotalMaxShare: toPositiveNumber(input?.dodgeTotalMaxShare, DEFAULT_DODGE_TOTAL_MAX_SHARE),
  };
}

export function normalizeProtectionTuning(
  protectionK: unknown,
  protectionS: unknown,
): ProtectionTuningValues {
  return normalizeCombatTuning({ protectionK, protectionS });
}

export function applyCombatTuningToCalculatorConfig(
  config: CalculatorConfig,
  input?: Record<string, unknown> | null,
): CalculatorConfig {
  const tuning = normalizeCombatTuning(input);
  return {
    ...config,
    healthPoolTuning: {
      expectedPhysicalResilienceAt1: tuning.expectedPhysicalResilienceAt1,
      expectedPhysicalResiliencePerLevel: tuning.expectedPhysicalResiliencePerLevel,
      expectedMentalPerseveranceAt1: tuning.expectedMentalPerseveranceAt1,
      expectedMentalPerseverancePerLevel: tuning.expectedMentalPerseverancePerLevel,
      expectedPoolTierMultipliers: {
        MINION: tuning.expectedPoolMinionMultiplier,
        SOLDIER: tuning.expectedPoolSoldierMultiplier,
        ELITE: tuning.expectedPoolEliteMultiplier,
        BOSS: tuning.expectedPoolBossMultiplier,
      },
      weakerSideWeight: tuning.poolWeakerSideWeight,
      averageWeight: tuning.poolAverageWeight,
      belowExpectedMaxPenaltyShare: tuning.poolBelowExpectedMaxPenaltyShare,
      belowExpectedScale: tuning.poolBelowExpectedScale,
      aboveExpectedMaxBonusShare: tuning.poolAboveExpectedMaxBonusShare,
      aboveExpectedScale: tuning.poolAboveExpectedScale,
    },
  };
}
