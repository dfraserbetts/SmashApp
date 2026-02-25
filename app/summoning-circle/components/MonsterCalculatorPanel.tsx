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
};

const ARCHETYPE_OPTIONS: MonsterCalculatorArchetype[] = [
  "BALANCED",
  "GLASS_CANNON",
  "TANK",
  "CONTROLLER",
];

const ARCHETYPE_TARGETS: Record<
  MonsterCalculatorArchetype,
  RadarAxes
> = {
  BALANCED: {
    physicalThreat: 5,
    mentalThreat: 5,
    survivability: 5,
    manipulation: 5,
    synergy: 5,
    mobility: 5,
    presence: 5,
  },
  GLASS_CANNON: {
    physicalThreat: 9,
    mentalThreat: 7,
    survivability: 2,
    manipulation: 3,
    synergy: 2,
    mobility: 6,
    presence: 8,
  },
  TANK: {
    physicalThreat: 4,
    mentalThreat: 2,
    survivability: 9,
    manipulation: 3,
    synergy: 2,
    mobility: 3,
    presence: 7,
  },
  CONTROLLER: {
    physicalThreat: 3,
    mentalThreat: 4,
    survivability: 5,
    manipulation: 9,
    synergy: 4,
    mobility: 5,
    presence: 6,
  },
};

function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

export function MonsterCalculatorPanel({ profile, archetype, onArchetypeChangeAction }: Props) {
  return (
    <section className="rounded border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Outcome Calculator</h3>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-zinc-400">Archetype</span>
          <select
            value={archetype}
            onChange={(event) =>
              onArchetypeChangeAction(event.target.value as MonsterCalculatorArchetype)
            }
            className="rounded border border-zinc-700 bg-zinc-950/40 px-2 py-1 text-xs"
          >
            {ARCHETYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!profile && <p className="text-xs text-zinc-500">No preview monster selected.</p>}

      {profile && (
        <>
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
    </section>
  );
}
