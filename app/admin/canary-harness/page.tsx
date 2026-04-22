"use client";

import { useEffect, useMemo, useState } from "react";
import { OutcomeRadar } from "@/app/summoning-circle/components/OutcomeRadar";
import {
  computeMonsterOutcomes,
  type MonsterOutcomeProfile,
  type RadarAxes,
} from "@/lib/calculators/monsterOutcomeCalculator";
import {
  outcomeNormalizationValuesToCalculatorConfig,
  type OutcomeNormalizationConfigStatus,
  type OutcomeNormalizationSnapshot,
} from "@/lib/config/outcomeNormalizationShared";
import {
  applyCombatTuningToCalculatorConfig,
  normalizeCombatTuning,
  type CombatTuningConfigStatus,
  type CombatTuningSnapshot,
} from "@/lib/config/combatTuningShared";
import type { PowerTuningConfigStatus, PowerTuningSnapshot } from "@/lib/config/powerTuningShared";
import {
  APPROVED_CANARY_POWERS,
  APPROVED_CANARY_SCENARIOS,
  buildApprovedCanaryScenarioPowers,
  getApprovedCanaryEntry,
  type ApprovedCanaryPowerEntry,
  type ApprovedCanaryScenario,
  type ApprovedCanaryScenarioCategory,
  type ApprovedCanaryScenarioId,
} from "@/lib/summoning/canaryCatalog";
import { renderPowerDescriptorLines } from "@/lib/summoning/render";
import { resolvePowerCosts } from "@/lib/summoning/powerCostResolver";
import {
  buildStrippedSummoningCircleBaseline,
  type StrippedSummoningCircleBaseline,
} from "@/lib/summoning/summoningCircleBaseline";
import type { MonsterTier } from "@/lib/summoning/types";

type PowerTuningSetListItem = {
  id: string;
  name: string;
  slug: string;
  status: PowerTuningConfigStatus;
  notes: string | null;
  updatedAt: string;
  activatedAt: string | null;
};

type OutcomeNormalizationSetListItem = {
  id: string;
  name: string;
  slug: string;
  status: OutcomeNormalizationConfigStatus;
  notes: string | null;
  updatedAt: string;
  activatedAt: string | null;
};

type AdminPowerTuningResponse = {
  activeSetId: string;
  sets: PowerTuningSetListItem[];
  selectedSet: PowerTuningSnapshot;
};

type AdminOutcomeNormalizationResponse = {
  activeSetId: string;
  sets: OutcomeNormalizationSetListItem[];
  selectedSet: OutcomeNormalizationSnapshot;
};

type CombatTuningSetListItem = {
  id: string;
  name: string;
  slug: string;
  status: CombatTuningConfigStatus;
  notes: string | null;
  updatedAt: string;
  activatedAt: string | null;
};

type AdminCombatTuningResponse = {
  activeSetId: string;
  sets: CombatTuningSetListItem[];
  selectedSet: CombatTuningSnapshot;
};

type HarnessSideResult = {
  powerSetName: string;
  outcomeSetName: string;
  combatSetName: string;
  powerOnly: ReturnType<typeof resolvePowerCosts>;
  profile: MonsterOutcomeProfile;
  baselineScaffoldSummary: StrippedSummoningCircleBaseline["summary"];
};

const SCENARIO_CATEGORIES: ApprovedCanaryScenarioCategory[] = ["solo", "pair", "stress"];
const TIER_OPTIONS: MonsterTier[] = ["MINION", "SOLDIER", "ELITE", "BOSS"];
const AXIS_KEYS: Array<keyof RadarAxes> = [
  "physicalThreat",
  "mentalThreat",
  "physicalSurvivability",
  "mentalSurvivability",
  "manipulation",
  "synergy",
  "mobility",
  "presence",
];

function formatAxisLabel(key: keyof RadarAxes): string {
  const labels: Record<keyof RadarAxes, string> = {
    physicalThreat: "Physical Threat",
    mentalThreat: "Mental Threat",
    physicalSurvivability: "Physical Survivability",
    mentalSurvivability: "Mental Survivability",
    manipulation: "Control Pressure",
    synergy: "Synergy",
    mobility: "Mobility",
    presence: "Pressure",
  };
  return labels[key];
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function formatDelta(value: number, baseline?: number): string | null {
  if (baseline === undefined) return null;
  const delta = value - baseline;
  if (Math.abs(delta) < 0.005) return "0.00";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`;
}

async function fetchAdminPowerTuning(setId?: string | null): Promise<AdminPowerTuningResponse> {
  const query = setId ? `?setId=${encodeURIComponent(setId)}` : "";
  const response = await fetch(`/api/admin/power-tuning${query}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | (AdminPowerTuningResponse & { error?: string })
    | null;
  if (!response.ok || !payload?.selectedSet) {
    throw new Error(payload?.error ?? "Failed to load power tuning sets");
  }
  return payload;
}

async function fetchAdminOutcomeNormalization(
  setId?: string | null,
): Promise<AdminOutcomeNormalizationResponse> {
  const query = setId ? `?setId=${encodeURIComponent(setId)}` : "";
  const response = await fetch(`/api/admin/outcome-normalization${query}`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | (AdminOutcomeNormalizationResponse & { error?: string })
    | null;
  if (!response.ok || !payload?.selectedSet) {
    throw new Error(payload?.error ?? "Failed to load outcome normalization sets");
  }
  return payload;
}

async function fetchAdminCombatTuning(setId?: string | null): Promise<AdminCombatTuningResponse> {
  const query = setId ? `?setId=${encodeURIComponent(setId)}` : "";
  const response = await fetch(`/api/admin/combat-tuning${query}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | (AdminCombatTuningResponse & { error?: string })
    | null;
  if (!response.ok || !payload?.selectedSet) {
    throw new Error(payload?.error ?? "Failed to load combat tuning sets");
  }
  return payload;
}

function computeHarnessSide(params: {
  scenarioId: ApprovedCanaryScenarioId;
  level: number;
  tier: MonsterTier;
  powerSnapshot: PowerTuningSnapshot;
  outcomeSnapshot: OutcomeNormalizationSnapshot;
  combatSnapshot: CombatTuningSnapshot;
}): HarnessSideResult {
  const powers = buildApprovedCanaryScenarioPowers(params.scenarioId).map((power, index) => ({
    ...power,
    sortOrder: index,
  }));
  const powerOnly = resolvePowerCosts(powers, {
    setId: params.powerSnapshot.setId,
    name: params.powerSnapshot.name,
    values: params.powerSnapshot.values,
  });
  const calculatorConfigForSide = applyCombatTuningToCalculatorConfig(
    outcomeNormalizationValuesToCalculatorConfig(params.outcomeSnapshot.values),
    params.combatSnapshot.values,
  );
  const combatTuningValues = normalizeCombatTuning(params.combatSnapshot.values);
  const baseline = buildStrippedSummoningCircleBaseline({
    level: params.level,
    tier: params.tier,
    powers,
    protectionTuning: combatTuningValues,
    calculatorConfig: calculatorConfigForSide,
  });
  const profile = computeMonsterOutcomes(baseline.monster, calculatorConfigForSide, {
    equipmentModifierAxisBonuses: baseline.equipmentModifierAxisBonuses,
    powerContribution: {
      axisVector: powerOnly.totals.axisVector,
      basePowerValue: powerOnly.totals.basePowerValue,
      powerCount: powerOnly.powers.length,
      debug: powerOnly,
    },
  });
  const profileWithScaffoldDebug: MonsterOutcomeProfile = {
    ...profile,
    debug: {
      ...(profile.debug ?? {}),
      combatTuningSet: {
        setId: params.combatSnapshot.setId,
        name: params.combatSnapshot.name,
        status: params.combatSnapshot.status,
      },
      baselineScaffoldSource: baseline.summary.baselineScaffoldSource,
      baselineScaffoldSummary: baseline.summary,
    },
  };

  return {
    powerSetName: params.powerSnapshot.name,
    outcomeSetName: params.outcomeSnapshot.name,
    combatSetName: params.combatSnapshot.name,
    powerOnly,
    profile: profileWithScaffoldDebug,
    baselineScaffoldSummary: baseline.summary,
  };
}

function TuningSetSelect(props: {
  label: string;
  value: string | null;
  activeSetId: string | null;
  sets: Array<{
    id: string;
    name: string;
    status: PowerTuningConfigStatus | OutcomeNormalizationConfigStatus | CombatTuningConfigStatus;
  }>;
  onChangeAction: (setId: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{props.label}</span>
      <select
        value={props.value ?? ""}
        onChange={(event) => props.onChangeAction(event.target.value)}
        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100"
      >
        {props.sets.map((set) => (
          <option key={set.id} value={set.id}>
            {set.name} ({set.status}
            {set.id === props.activeSetId ? ", active" : ""})
          </option>
        ))}
      </select>
    </label>
  );
}

function AxisRows(props: { axes: RadarAxes; baseline?: RadarAxes }) {
  return (
    <div className="grid gap-1 text-xs">
      {AXIS_KEYS.map((key) => {
        const delta = formatDelta(props.axes[key], props.baseline?.[key]);
        return (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-zinc-400">{formatAxisLabel(key)}</span>
            <span className="font-mono text-zinc-100">
              {formatNumber(props.axes[key])}
              {delta && delta !== "0.00" ? (
                <span className={delta.startsWith("+") ? "ml-2 text-emerald-300" : "ml-2 text-rose-300"}>
                  {delta}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MetricRow(props: { label: string; value: number; baseline?: number }) {
  const delta = formatDelta(props.value, props.baseline);
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-zinc-400">{props.label}</span>
      <span className="font-mono text-zinc-100">
        {formatNumber(props.value)}
        {delta && delta !== "0.00" ? (
          <span className={delta.startsWith("+") ? "ml-2 text-emerald-300" : "ml-2 text-rose-300"}>
            {delta}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function HarnessSideCard(props: {
  title: string;
  result: HarnessSideResult | null;
  baseline?: HarnessSideResult | null;
}) {
  const result = props.result;
  if (!result) {
    return (
      <section className="rounded border border-zinc-800 bg-zinc-950/60 p-4">
        <h2 className="text-sm font-medium text-zinc-100">{props.title}</h2>
        <p className="mt-2 text-sm text-zinc-500">Waiting for tuning data...</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded border border-zinc-800 bg-zinc-950/60 p-4">
      <div>
        <h2 className="text-sm font-medium text-zinc-100">{props.title}</h2>
        <p className="mt-1 text-xs text-zinc-500">Power: {result.powerSetName}</p>
        <p className="text-xs text-zinc-500">Outcome: {result.outcomeSetName}</p>
        <p className="text-xs text-zinc-500">Combat: {result.combatSetName}</p>
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
        <h3 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Power Contribution Totals</h3>
        <MetricRow
          label="Base Power Value"
          value={result.powerOnly.totals.basePowerValue}
          baseline={props.baseline?.powerOnly.totals.basePowerValue}
        />
        <MetricRow
          label="Shared Context"
          value={result.powerOnly.totals.sharedContextCost}
          baseline={props.baseline?.powerOnly.totals.sharedContextCost}
        />
        <MetricRow
          label="Structural"
          value={result.powerOnly.totals.structuralCost}
          baseline={props.baseline?.powerOnly.totals.structuralCost}
        />
        <MetricRow
          label="Access"
          value={result.powerOnly.totals.accessCost}
          baseline={props.baseline?.powerOnly.totals.accessCost}
        />
        <MetricRow
          label="Packet Count Complexity"
          value={result.powerOnly.totals.packetCountComplexityCost}
          baseline={props.baseline?.powerOnly.totals.packetCountComplexityCost}
        />
        <MetricRow
          label="Cross-Packet Interaction"
          value={result.powerOnly.totals.crossPacketSynergyCost}
          baseline={props.baseline?.powerOnly.totals.crossPacketSynergyCost}
        />
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
        <h3 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Canonical Power Axis Vector</h3>
        <AxisRows
          axes={result.powerOnly.totals.axisVector}
          baseline={props.baseline?.powerOnly.totals.axisVector}
        />
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
        <h3 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Stripped Baseline Scaffold</h3>
        <p className="mb-2 text-xs text-zinc-500">{result.baselineScaffoldSummary.note}</p>
        <MetricRow
          label="Physical Resilience Max"
          value={result.baselineScaffoldSummary.physicalResilienceMax}
          baseline={props.baseline?.baselineScaffoldSummary.physicalResilienceMax}
        />
        <MetricRow
          label="Mental Perseverance Max"
          value={result.baselineScaffoldSummary.mentalPerseveranceMax}
          baseline={props.baseline?.baselineScaffoldSummary.mentalPerseveranceMax}
        />
        <MetricRow
          label="Dodge Dice"
          value={result.baselineScaffoldSummary.dodgeDice}
          baseline={props.baseline?.baselineScaffoldSummary.dodgeDice}
        />
        <MetricRow
          label="Physical Survivability Raw Bonus"
          value={result.baselineScaffoldSummary.physicalDefencePackageRawBonus}
          baseline={props.baseline?.baselineScaffoldSummary.physicalDefencePackageRawBonus}
        />
        <MetricRow
          label="Mental Survivability Raw Bonus"
          value={result.baselineScaffoldSummary.mentalDefencePackageRawBonus}
          baseline={props.baseline?.baselineScaffoldSummary.mentalDefencePackageRawBonus}
        />
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
        <h3 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Per Power</h3>
        <div className="space-y-1">
          {result.powerOnly.powers.map((power) => (
            <div key={power.name} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-zinc-400">{power.name}</span>
              <span className="font-mono text-zinc-100">
                {formatNumber(power.breakdown.basePowerValue)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
        <h3 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Final Monster Outcome</h3>
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <OutcomeRadar axes={result.profile.radarAxes} size={220} />
          <div className="space-y-3">
            <div className="space-y-1">
              <MetricRow
                label="Sustained Physical"
                value={result.profile.sustainedPhysical}
                baseline={props.baseline?.profile.sustainedPhysical}
              />
              <MetricRow
                label="Sustained Mental"
                value={result.profile.sustainedMental}
                baseline={props.baseline?.profile.sustainedMental}
              />
              <MetricRow
                label="Sustained Total"
                value={result.profile.sustainedTotal}
                baseline={props.baseline?.profile.sustainedTotal}
              />
              <MetricRow
                label="Spike"
                value={result.profile.spike}
                baseline={props.baseline?.profile.spike}
              />
              <MetricRow
                label="SEU / Round"
                value={result.profile.seuPerRound}
                baseline={props.baseline?.profile.seuPerRound}
              />
              <MetricRow
                label="TSU / Round"
                value={result.profile.tsuPerRound}
                baseline={props.baseline?.profile.tsuPerRound}
              />
            </div>
            <AxisRows axes={result.profile.radarAxes} baseline={props.baseline?.profile.radarAxes} />
          </div>
        </div>
      </div>

      <details className="rounded border border-zinc-800 bg-zinc-950 p-3">
        <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500">
          Debug Payload
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-zinc-400">
          {JSON.stringify(
            {
              powerOnly: result.powerOnly,
              combatSetName: result.combatSetName,
              baselineScaffoldSource: result.baselineScaffoldSummary.baselineScaffoldSource,
              baselineScaffoldSummary: result.baselineScaffoldSummary,
              monsterOutcomeDebug: result.profile.debug ?? null,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}

function ScenarioSummary(props: { scenario: ApprovedCanaryScenario }) {
  const powers = props.scenario.powerIds
    .map((id) => getApprovedCanaryEntry(id))
    .filter((entry): entry is ApprovedCanaryPowerEntry => Boolean(entry));

  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-zinc-100">{props.scenario.label}</h2>
          <p className="mt-1 text-sm text-zinc-400">{props.scenario.purpose}</p>
        </div>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs uppercase text-zinc-400">
          {props.scenario.category} / {props.scenario.powerIds.length} powers
        </span>
      </div>
      <div className="mt-4">
        <div>
          <h3 className="text-xs uppercase tracking-wide text-zinc-500">Included Powers</h3>
          <ul className="mt-2 space-y-3 text-sm text-zinc-300">
            {powers.map((entry) => (
              <li key={entry.id} className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <p className="font-medium text-zinc-100">{entry.label}</p>
                <p className="mt-1 text-xs text-zinc-500">{entry.purpose}</p>
                <div className="mt-2 space-y-1 border-l border-zinc-700 pl-3">
                  {renderPowerDescriptorLines(entry.power).map((line, index) => (
                    <p key={`${entry.id}-${index}`} className="text-xs text-zinc-400">
                      {line}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default function PowerRadarComparisonAdminPage() {
  const [category, setCategory] = useState<ApprovedCanaryScenarioCategory>("solo");
  const [selectedScenarioId, setSelectedScenarioId] = useState<ApprovedCanaryScenarioId>(
    APPROVED_CANARY_SCENARIOS[0]?.id ?? "simple_melee_attack",
  );
  const [level, setLevel] = useState(1);
  const [tier, setTier] = useState<MonsterTier>("MINION");
  const [powerData, setPowerData] = useState<AdminPowerTuningResponse | null>(null);
  const [outcomeData, setOutcomeData] = useState<AdminOutcomeNormalizationResponse | null>(null);
  const [combatData, setCombatData] = useState<AdminCombatTuningResponse | null>(null);
  const [baselinePowerSnapshot, setBaselinePowerSnapshot] = useState<PowerTuningSnapshot | null>(null);
  const [baselineOutcomeSnapshot, setBaselineOutcomeSnapshot] =
    useState<OutcomeNormalizationSnapshot | null>(null);
  const [baselineCombatSnapshot, setBaselineCombatSnapshot] = useState<CombatTuningSnapshot | null>(null);
  const [candidatePowerSetId, setCandidatePowerSetId] = useState<string | null>(null);
  const [candidateOutcomeSetId, setCandidateOutcomeSetId] = useState<string | null>(null);
  const [candidateCombatSetId, setCandidateCombatSetId] = useState<string | null>(null);
  const [candidatePowerSnapshot, setCandidatePowerSnapshot] = useState<PowerTuningSnapshot | null>(null);
  const [candidateOutcomeSnapshot, setCandidateOutcomeSnapshot] =
    useState<OutcomeNormalizationSnapshot | null>(null);
  const [candidateCombatSnapshot, setCandidateCombatSnapshot] = useState<CombatTuningSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scenariosInCategory = useMemo(
    () => APPROVED_CANARY_SCENARIOS.filter((scenario) => scenario.category === category),
    [category],
  );
  const selectedScenario =
    APPROVED_CANARY_SCENARIOS.find((scenario) => scenario.id === selectedScenarioId) ??
    APPROVED_CANARY_SCENARIOS[0];

  useEffect(() => {
    if (!scenariosInCategory.some((scenario) => scenario.id === selectedScenarioId)) {
      setSelectedScenarioId(scenariosInCategory[0]?.id ?? "simple_melee_attack");
    }
  }, [scenariosInCategory, selectedScenarioId]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      setLoading(true);
      setError(null);

      try {
        const [nextPowerData, nextOutcomeData, nextCombatData] = await Promise.all([
          fetchAdminPowerTuning(),
          fetchAdminOutcomeNormalization(),
          fetchAdminCombatTuning(),
        ]);

        if (cancelled) return;
        setPowerData(nextPowerData);
        setOutcomeData(nextOutcomeData);
        setCombatData(nextCombatData);
        setBaselinePowerSnapshot(nextPowerData.selectedSet);
        setBaselineOutcomeSnapshot(nextOutcomeData.selectedSet);
        setBaselineCombatSnapshot(nextCombatData.selectedSet);
        setCandidatePowerSetId(nextPowerData.activeSetId);
        setCandidateOutcomeSetId(nextOutcomeData.activeSetId);
        setCandidateCombatSetId(nextCombatData.activeSetId);
        setCandidatePowerSnapshot(nextPowerData.selectedSet);
        setCandidateOutcomeSnapshot(nextOutcomeData.selectedSet);
        setCandidateCombatSnapshot(nextCombatData.selectedSet);
      } catch (loadError) {
        if (!cancelled) {
          setError(String((loadError as { message?: unknown })?.message ?? loadError));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!candidatePowerSetId || candidatePowerSetId === candidatePowerSnapshot?.setId) return;
    let cancelled = false;
    fetchAdminPowerTuning(candidatePowerSetId)
      .then((payload) => {
        if (!cancelled) setCandidatePowerSnapshot(payload.selectedSet);
      })
      .catch((loadError) => {
        if (!cancelled) setError(String((loadError as { message?: unknown })?.message ?? loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [candidatePowerSetId, candidatePowerSnapshot?.setId]);

  useEffect(() => {
    if (!candidateOutcomeSetId || candidateOutcomeSetId === candidateOutcomeSnapshot?.setId) return;
    let cancelled = false;
    fetchAdminOutcomeNormalization(candidateOutcomeSetId)
      .then((payload) => {
        if (!cancelled) setCandidateOutcomeSnapshot(payload.selectedSet);
      })
      .catch((loadError) => {
        if (!cancelled) setError(String((loadError as { message?: unknown })?.message ?? loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [candidateOutcomeSetId, candidateOutcomeSnapshot?.setId]);

  useEffect(() => {
    if (!candidateCombatSetId || candidateCombatSetId === candidateCombatSnapshot?.setId) return;
    let cancelled = false;
    fetchAdminCombatTuning(candidateCombatSetId)
      .then((payload) => {
        if (!cancelled) setCandidateCombatSnapshot(payload.selectedSet);
      })
      .catch((loadError) => {
        if (!cancelled) setError(String((loadError as { message?: unknown })?.message ?? loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [candidateCombatSetId, candidateCombatSnapshot?.setId]);

  async function reloadTuningSnapshots() {
    setLoading(true);
    setError(null);

    try {
      const powerSetIdToReload = candidatePowerSetId ?? powerData?.activeSetId ?? null;
      const outcomeSetIdToReload = candidateOutcomeSetId ?? outcomeData?.activeSetId ?? null;
      const combatSetIdToReload = candidateCombatSetId ?? combatData?.activeSetId ?? null;
      const [
        nextActivePowerData,
        nextActiveOutcomeData,
        nextActiveCombatData,
        nextCandidatePowerData,
        nextCandidateOutcomeData,
        nextCandidateCombatData,
      ] = await Promise.all([
        fetchAdminPowerTuning(),
        fetchAdminOutcomeNormalization(),
        fetchAdminCombatTuning(),
        fetchAdminPowerTuning(powerSetIdToReload),
        fetchAdminOutcomeNormalization(outcomeSetIdToReload),
        fetchAdminCombatTuning(combatSetIdToReload),
      ]);

      setPowerData(nextCandidatePowerData);
      setOutcomeData(nextCandidateOutcomeData);
      setCombatData(nextCandidateCombatData);
      setBaselinePowerSnapshot(nextActivePowerData.selectedSet);
      setBaselineOutcomeSnapshot(nextActiveOutcomeData.selectedSet);
      setBaselineCombatSnapshot(nextActiveCombatData.selectedSet);
      setCandidatePowerSetId(nextCandidatePowerData.selectedSet.setId);
      setCandidateOutcomeSetId(nextCandidateOutcomeData.selectedSet.setId);
      setCandidateCombatSetId(nextCandidateCombatData.selectedSet.setId);
      setCandidatePowerSnapshot(nextCandidatePowerData.selectedSet);
      setCandidateOutcomeSnapshot(nextCandidateOutcomeData.selectedSet);
      setCandidateCombatSnapshot(nextCandidateCombatData.selectedSet);
    } catch (loadError) {
      setError(String((loadError as { message?: unknown })?.message ?? loadError));
    } finally {
      setLoading(false);
    }
  }

  const baselineResult = useMemo(() => {
    if (!selectedScenario || !baselinePowerSnapshot || !baselineOutcomeSnapshot || !baselineCombatSnapshot) {
      return null;
    }
    return computeHarnessSide({
      scenarioId: selectedScenario.id,
      level,
      tier,
      powerSnapshot: baselinePowerSnapshot,
      outcomeSnapshot: baselineOutcomeSnapshot,
      combatSnapshot: baselineCombatSnapshot,
    });
  }, [baselineCombatSnapshot, baselineOutcomeSnapshot, baselinePowerSnapshot, level, selectedScenario, tier]);

  const candidateResult = useMemo(() => {
    if (!selectedScenario || !candidatePowerSnapshot || !candidateOutcomeSnapshot || !candidateCombatSnapshot) {
      return null;
    }
    return computeHarnessSide({
      scenarioId: selectedScenario.id,
      level,
      tier,
      powerSnapshot: candidatePowerSnapshot,
      outcomeSnapshot: candidateOutcomeSnapshot,
      combatSnapshot: candidateCombatSnapshot,
    });
  }, [candidateCombatSnapshot, candidateOutcomeSnapshot, candidatePowerSnapshot, level, selectedScenario, tier]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8 text-zinc-100">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Game Ops</p>
        <h1 className="text-2xl font-semibold">Power Radar Comparison</h1>
        <p className="max-w-3xl text-sm text-zinc-400">
          Curated radar comparisons for approved Phase 6 power scenarios. Baseline always uses the current active
          Power Tuning, Outcome Normalization, and Combat Tuning sets; Candidate can point at drafts or
          archives.
        </p>
      </header>

      {error ? (
        <div className="rounded border border-red-700 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="rounded border border-zinc-800 bg-zinc-950/60 p-4">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {SCENARIO_CATEGORIES.map((nextCategory) => (
                <button
                  key={nextCategory}
                  type="button"
                  onClick={() => setCategory(nextCategory)}
                  className={`rounded border px-3 py-1 text-xs uppercase tracking-wide ${
                    category === nextCategory
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                      : "border-zinc-700 text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  {nextCategory}
                </button>
              ))}
            </div>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Approved Scenario</span>
              <select
                value={selectedScenario?.id ?? ""}
                onChange={(event) =>
                  setSelectedScenarioId(event.target.value as ApprovedCanaryScenarioId)
                }
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100"
              >
                {scenariosInCategory.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-zinc-500">
              Catalog: {APPROVED_CANARY_POWERS.length} approved powers,{" "}
              {APPROVED_CANARY_SCENARIOS.length} approved scenarios.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Neutral Level</span>
              <select
                value={level}
                onChange={(event) => setLevel(Number(event.target.value))}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100"
              >
                {Array.from({ length: 20 }, (_, index) => index + 1).map((nextLevel) => (
                  <option key={nextLevel} value={nextLevel}>
                    Level {nextLevel}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Neutral Tier</span>
              <select
                value={tier}
                onChange={(event) => setTier(event.target.value as MonsterTier)}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100"
              >
                {TIER_OPTIONS.map((nextTier) => (
                  <option key={nextTier} value={nextTier}>
                    {nextTier}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void reloadTuningSnapshots()}
              disabled={loading}
              className="w-full rounded border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
            >
              {loading ? "Reloading..." : "Reload"}
            </button>
            <TuningSetSelect
              label="Candidate Power Tuning"
              value={candidatePowerSetId}
              activeSetId={powerData?.activeSetId ?? null}
              sets={powerData?.sets ?? []}
              onChangeAction={setCandidatePowerSetId}
            />
            <TuningSetSelect
              label="Candidate Outcome Normalization"
              value={candidateOutcomeSetId}
              activeSetId={outcomeData?.activeSetId ?? null}
              sets={outcomeData?.sets ?? []}
              onChangeAction={setCandidateOutcomeSetId}
            />
            <TuningSetSelect
              label="Candidate Combat Tuning"
              value={candidateCombatSetId}
              activeSetId={combatData?.activeSetId ?? null}
              sets={combatData?.sets ?? []}
              onChangeAction={setCandidateCombatSetId}
            />
          </div>
        </div>
      </section>

      {selectedScenario ? <ScenarioSummary scenario={selectedScenario} /> : null}

      {loading ? (
        <section className="rounded border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400">
          Loading tuning snapshots...
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <HarnessSideCard title="Baseline: Active / Active" result={baselineResult} />
        <HarnessSideCard
          title="Candidate"
          result={candidateResult}
          baseline={baselineResult}
        />
      </div>

      <section className="rounded border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-500">
        <p>
          Neutral scaffold: no traits, no gear, no natural attacks, no limit breaks, D6 base
          attributes, and scenario powers only. Resilience, derived skills, dodge, and defensive
          baseline lanes are derived from the selected Combat Tuning set using the same stripped
          Summoning Circle baseline path.
        </p>
        <p className="mt-2">Scenario composition stays curated; no freestyle scenario builder is enabled.</p>
      </section>
    </main>
  );
}
