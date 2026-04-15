"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_POWER_TUNING_VALUES,
  normalizePowerTuningValues,
  type PowerTuningFlatValues,
  type PowerTuningSnapshot,
} from "@/lib/config/powerTuningShared";

type UsePowerTuningResult = {
  loading: boolean;
  snapshot: PowerTuningSnapshot | null;
  values: PowerTuningFlatValues;
};

export function usePowerTuning(): UsePowerTuningResult {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<PowerTuningSnapshot | null>(null);
  const [values, setValues] = useState<PowerTuningFlatValues>(DEFAULT_POWER_TUNING_VALUES);

  useEffect(() => {
    let cancelled = false;

    async function loadPowerTuning() {
      try {
        const response = await fetch("/api/config/power-tuning", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load power tuning");

        const data = (await response.json().catch(() => null)) as PowerTuningSnapshot | null;
        if (!data || cancelled) return;

        const normalizedValues = normalizePowerTuningValues(data.values);
        setSnapshot({ ...data, values: normalizedValues });
        setValues(normalizedValues);
      } catch {
        if (!cancelled) {
          setSnapshot(null);
          setValues(DEFAULT_POWER_TUNING_VALUES);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPowerTuning();

    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, snapshot, values };
}
