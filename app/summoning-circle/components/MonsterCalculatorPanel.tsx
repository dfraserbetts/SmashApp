"use client";

import type {
  MonsterCalculatorArchetype,
  MonsterOutcomeProfile,
  RadarAxes,
} from "@/lib/calculators/monsterOutcomeCalculator";
import { OutcomeRadar } from "@/app/summoning-circle/components/OutcomeRadar";

type Props = {
  profile: MonsterOutcomeProfile | null;
  archetype: MonsterCalculatorArchetype;
  onArchetypeChangeAction: (value: MonsterCalculatorArchetype) => void;
  powerCostPreview?: {
    tuningSetId: string | null;
    tuningSetName: string | null;
    totalBasePowerValue: number;
    powerCount: number;
    axisVector: RadarAxes;
    perPower: Array<{ name: string; basePowerValue: number }>;
    debug?: Record<string, unknown>;
  } | null;
};

const ARCHETYPE_OPTIONS: MonsterCalculatorArchetype[] = [
  "BALANCED",
  "GLASS_CANNON",
  "TANK",
  "CONTROLLER",
  "SCRAPPER",
];
const ARCHETYPE_LABELS: Record<MonsterCalculatorArchetype, string> = {
  BALANCED: "Balanced",
  GLASS_CANNON: "Glass Cannon",
  TANK: "Tank",
  CONTROLLER: "Controller",
  SCRAPPER: "Scrapper",
};
const ARCHETYPE_TOOLTIPS: Record<MonsterCalculatorArchetype, string> = {
  BALANCED:
    "Aims for an even spread across offence, both survivability lanes, control, mobility, and presence.",
  GLASS_CANNON:
    "Aims for high threat and burst pressure with intentionally low physical and mental survivability.",
  TANK:
    "Aims for very high physical and mental survivability over raw offensive output.",
  CONTROLLER:
    "Aims for disruption, manipulation, and encounter-shaping value over direct damage.",
  SCRAPPER:
    "Aims for high physical threat and pressure with average mobility and physical survivability, while leaving mental lanes and synergy intentionally low.",
};

const ARCHETYPE_TARGETS: Record<
  MonsterCalculatorArchetype,
  RadarAxes
> = {
  BALANCED: {
    physicalThreat: 5,
    mentalThreat: 5,
    physicalSurvivability: 5,
    mentalSurvivability: 5,
    manipulation: 5,
    synergy: 5,
    mobility: 5,
    presence: 5,
  },
  GLASS_CANNON: {
    physicalThreat: 9,
    mentalThreat: 7,
    physicalSurvivability: 2,
    mentalSurvivability: 2,
    manipulation: 3,
    synergy: 2,
    mobility: 6,
    presence: 8,
  },
  TANK: {
    physicalThreat: 4,
    mentalThreat: 2,
    physicalSurvivability: 9,
    mentalSurvivability: 8,
    manipulation: 3,
    synergy: 2,
    mobility: 3,
    presence: 7,
  },
  CONTROLLER: {
    physicalThreat: 3,
    mentalThreat: 4,
    physicalSurvivability: 4,
    mentalSurvivability: 6,
    manipulation: 9,
    synergy: 4,
    mobility: 5,
    presence: 6,
  },
  SCRAPPER: {
    physicalThreat: 9,
    mentalThreat: 0,
    physicalSurvivability: 5,
    mentalSurvivability: 0,
    manipulation: 0,
    synergy: 0,
    mobility: 5,
    presence: 3,
  },
};

function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

const POWER_AXIS_ROWS: Array<{ key: keyof RadarAxes; label: string }> = [
  { key: "physicalSurvivability", label: "Physical Survivability" },
  { key: "physicalThreat", label: "Physical Threat" },
  { key: "mentalThreat", label: "Mental Threat" },
  { key: "mentalSurvivability", label: "Mental Survivability" },
  { key: "manipulation", label: "Control Pressure" },
  { key: "synergy", label: "Synergy" },
  { key: "mobility", label: "Mobility" },
  { key: "presence", label: "Pressure" },
];

export function MonsterCalculatorPanel({
  profile,
  archetype,
  onArchetypeChangeAction,
  powerCostPreview = null,
}: Props) {
  return (
    <section className="rounded border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Outcome Calculator</h3>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-zinc-400">Archetype</span>
          <select
            value={archetype}
            title={ARCHETYPE_TOOLTIPS[archetype]}
            onChange={(event) =>
              onArchetypeChangeAction(event.target.value as MonsterCalculatorArchetype)
            }
            className="rounded border border-zinc-700 bg-zinc-950/40 px-2 py-1 text-xs"
          >
            {ARCHETYPE_OPTIONS.map((option) => (
              <option key={option} value={option} title={ARCHETYPE_TOOLTIPS[option]}>
                {ARCHETYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!profile && <p className="text-xs text-zinc-500">No preview monster selected.</p>}

      {profile && (
        <>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Final Outcome</h4>
          <p className="text-[11px] text-zinc-500">
            Combined monster radar after non-power contributors, effective power availability,
            and outcome normalization.
            </p>
          </div>
          <OutcomeRadar
            axes={profile.radarAxes}
            backgroundAxes={ARCHETYPE_TARGETS[archetype]}
          />

          <details className="rounded border border-zinc-800 bg-zinc-950/30 p-2 text-[10px] text-zinc-400">
            <summary className="cursor-pointer select-none text-zinc-500">Debug</summary>
            <pre className="mt-2 overflow-auto">
              {JSON.stringify(
                {
                  sustainedPhysical: profile.sustainedPhysical,
                  sustainedMental: profile.sustainedMental,
                  sustainedTotal: profile.sustainedTotal,
                  spike: profile.spike,
                  seuPerRound: profile.seuPerRound,
                  tsuPerRound: profile.tsuPerRound,
                  radarAxes: profile.radarAxes,
                  debug: profile.debug ?? null,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      )}

      {profile && (
        <p className="text-[11px] text-zinc-500">
          Net Success Multiplier: {formatDecimal(profile.netSuccessMultiplier)}
        </p>
      )}

      <section className="rounded border border-zinc-800 bg-zinc-950/30 p-3 space-y-3">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">Power Contribution</h4>
          <p className="text-[11px] text-zinc-500">
            Canonical Phase 6 per-use power vector. Final outcome debug shows the effective
            availability-adjusted contribution used by the monster radar.
          </p>
        </div>

        {!powerCostPreview && (
          <p className="text-xs text-zinc-500">No power preview available.</p>
        )}

        {powerCostPreview && (
          <>
            <dl className="grid gap-2 text-xs sm:grid-cols-3">
              <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
                <dt className="text-zinc-500">Tuning Set</dt>
                <dd className="mt-1 text-zinc-200">
                  {powerCostPreview.tuningSetName ?? "Default values (loading or fallback)"}
                </dd>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
                <dt className="text-zinc-500">Powers</dt>
                <dd className="mt-1 text-zinc-200">{powerCostPreview.powerCount}</dd>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
                <dt className="text-zinc-500">Total Base Power Value</dt>
                <dd className="mt-1 text-zinc-200">
                  {formatDecimal(powerCostPreview.totalBasePowerValue)}
                </dd>
              </div>
            </dl>

            <div className="space-y-2">
              <h5 className="text-xs font-medium text-zinc-300">Canonical Power Axis Vector</h5>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                {POWER_AXIS_ROWS.map((axis) => (
                  <div
                    key={axis.key}
                    className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1"
                  >
                    <span className="text-zinc-500">{axis.label}</span>
                    <span className="text-zinc-200">
                      {formatDecimal(powerCostPreview.axisVector[axis.key] ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="text-xs font-medium text-zinc-300">Per Power</h5>
              <div className="space-y-1">
                {powerCostPreview.perPower.length === 0 && (
                  <p className="text-xs text-zinc-500">No powers authored yet.</p>
                )}
                {powerCostPreview.perPower.map((power, index) => (
                  <div
                    key={`${power.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1 text-xs"
                  >
                    <span className="truncate text-zinc-300">{power.name || `Power ${index + 1}`}</span>
                    <span className="shrink-0 text-zinc-200">
                      {formatDecimal(power.basePowerValue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <details className="rounded border border-zinc-800 bg-zinc-950/30 p-2 text-[10px] text-zinc-400">
              <summary className="cursor-pointer select-none text-zinc-500">
                Power Cost Debug
              </summary>
              <pre className="mt-2 overflow-auto">
                {JSON.stringify(powerCostPreview.debug ?? null, null, 2)}
              </pre>
            </details>
          </>
        )}
      </section>
    </section>
  );
}
