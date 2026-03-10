"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PROTECTION_K,
  DEFAULT_PROTECTION_S,
  normalizeProtectionTuning,
  type ProtectionTuningValues,
} from "@/lib/config/combatTuningShared";

const DEFAULT_TUNING: ProtectionTuningValues = {
  protectionK: DEFAULT_PROTECTION_K,
  protectionS: DEFAULT_PROTECTION_S,
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
        const data = (await res.json().catch(() => ({}))) as {
          protectionK?: unknown;
          protectionS?: unknown;
        };
        if (cancelled) return;
        setTuning(normalizeProtectionTuning(data.protectionK, data.protectionS));
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
