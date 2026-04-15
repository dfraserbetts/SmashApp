"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_COMBAT_TUNING_VALUES,
  normalizeCombatTuning,
  type ProtectionTuningValues,
} from "@/lib/config/combatTuningShared";

const DEFAULT_TUNING: ProtectionTuningValues = DEFAULT_COMBAT_TUNING_VALUES;

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
