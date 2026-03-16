export const DEFAULT_PROTECTION_K = 2;
export const DEFAULT_PROTECTION_S = 6;
export const DEFAULT_ATTACK_WEIGHT = 1;
export const DEFAULT_DEFENCE_WEIGHT = 1;
export const DEFAULT_FORTITUDE_WEIGHT = 1;
export const DEFAULT_INTELLECT_WEIGHT = 1;
export const DEFAULT_SUPPORT_WEIGHT = 1;
export const DEFAULT_BRAVERY_WEIGHT = 1;
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

export type ProtectionTuningValues = {
  protectionK: number;
  protectionS: number;
  attackWeight: number;
  defenceWeight: number;
  fortitudeWeight: number;
  intellectWeight: number;
  supportWeight: number;
  braveryWeight: number;
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
};

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
  };
}

export function normalizeProtectionTuning(
  protectionK: unknown,
  protectionS: unknown,
): ProtectionTuningValues {
  return normalizeCombatTuning({ protectionK, protectionS });
}
