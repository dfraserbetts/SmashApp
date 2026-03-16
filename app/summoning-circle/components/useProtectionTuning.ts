"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_ATTACK_WEIGHT,
  DEFAULT_BOSS_TIER_MULTIPLIER,
  DEFAULT_BRAVERY_WEIGHT,
  DEFAULT_DEFENCE_WEIGHT,
  DEFAULT_ELITE_TIER_MULTIPLIER,
  DEFAULT_EXPECTED_MENTAL_PERSEVERANCE_AT_1,
  DEFAULT_EXPECTED_MENTAL_PERSEVERANCE_PER_LEVEL,
  DEFAULT_EXPECTED_PHYSICAL_RESILIENCE_AT_1,
  DEFAULT_EXPECTED_PHYSICAL_RESILIENCE_PER_LEVEL,
  DEFAULT_EXPECTED_POOL_BOSS_MULTIPLIER,
  DEFAULT_EXPECTED_POOL_ELITE_MULTIPLIER,
  DEFAULT_EXPECTED_POOL_MINION_MULTIPLIER,
  DEFAULT_EXPECTED_POOL_SOLDIER_MULTIPLIER,
  DEFAULT_FORTITUDE_WEIGHT,
  DEFAULT_INTELLECT_WEIGHT,
  DEFAULT_MINION_TIER_MULTIPLIER,
  DEFAULT_PROTECTION_K,
  DEFAULT_PROTECTION_S,
  DEFAULT_POOL_ABOVE_EXPECTED_MAX_BONUS_SHARE,
  DEFAULT_POOL_ABOVE_EXPECTED_SCALE,
  DEFAULT_POOL_AVERAGE_WEIGHT,
  DEFAULT_POOL_BELOW_EXPECTED_MAX_PENALTY_SHARE,
  DEFAULT_POOL_BELOW_EXPECTED_SCALE,
  DEFAULT_POOL_WEAKER_SIDE_WEIGHT,
  DEFAULT_SOLDIER_TIER_MULTIPLIER,
  DEFAULT_SUPPORT_WEIGHT,
  normalizeCombatTuning,
  type ProtectionTuningValues,
} from "@/lib/config/combatTuningShared";

const DEFAULT_TUNING: ProtectionTuningValues = {
  protectionK: DEFAULT_PROTECTION_K,
  protectionS: DEFAULT_PROTECTION_S,
  attackWeight: DEFAULT_ATTACK_WEIGHT,
  defenceWeight: DEFAULT_DEFENCE_WEIGHT,
  fortitudeWeight: DEFAULT_FORTITUDE_WEIGHT,
  intellectWeight: DEFAULT_INTELLECT_WEIGHT,
  supportWeight: DEFAULT_SUPPORT_WEIGHT,
  braveryWeight: DEFAULT_BRAVERY_WEIGHT,
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
};

export function useProtectionTuning(): ProtectionTuningValues {
  const [tuning, setTuning] = useState<ProtectionTuningValues>(DEFAULT_TUNING);

  useEffect(() => {
    let cancelled = false;

    // PROTECTION_TUNING_SOURCE
    async function loadTuning() {
      try {
        const res = await fetch("/api/config/combat-tuning", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as Partial<
          Record<keyof ProtectionTuningValues, unknown>
        >;
        if (cancelled) return;
        setTuning(normalizeCombatTuning(data));
      } catch {
        if (!cancelled) setTuning(DEFAULT_TUNING);
      }
    }

    void loadTuning();

    return () => {
      cancelled = true;
    };
  }, []);

  return tuning;
}
