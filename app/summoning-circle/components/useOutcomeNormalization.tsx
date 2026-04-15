"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalculatorConfig } from "@/lib/calculators/calculatorConfig";
import {
  DEFAULT_OUTCOME_NORMALIZATION_VALUES,
  normalizeOutcomeNormalizationValues,
  outcomeNormalizationValuesToCalculatorConfig,
  type OutcomeNormalizationFlatValues,
  type OutcomeNormalizationSnapshot,
} from "@/lib/config/outcomeNormalizationShared";

type UseOutcomeNormalizationResult = {
  loading: boolean;
  snapshot: OutcomeNormalizationSnapshot | null;
  values: OutcomeNormalizationFlatValues;
  calculatorConfig: CalculatorConfig;
};

export function useOutcomeNormalization(): UseOutcomeNormalizationResult {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<OutcomeNormalizationSnapshot | null>(null);
  const [values, setValues] = useState<OutcomeNormalizationFlatValues>(
    DEFAULT_OUTCOME_NORMALIZATION_VALUES,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOutcomeNormalization() {
      try {
        const response = await fetch("/api/config/outcome-normalization", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load outcome normalization");

        const data = (await response.json().catch(() => null)) as
          | OutcomeNormalizationSnapshot
          | null;
        if (!data || cancelled) return;

        const normalizedValues = normalizeOutcomeNormalizationValues(data.values);
        setSnapshot({ ...data, values: normalizedValues });
        setValues(normalizedValues);
      } catch {
        if (!cancelled) {
          setSnapshot(null);
          setValues(DEFAULT_OUTCOME_NORMALIZATION_VALUES);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOutcomeNormalization();

    return () => {
      cancelled = true;
    };
  }, []);

  const calculatorConfig = useMemo(
    () => outcomeNormalizationValuesToCalculatorConfig(values),
    [values],
  );

  return { loading, snapshot, values, calculatorConfig };
}
