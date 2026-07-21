"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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
    invalidPowerCount?: number;
    axisVector: RadarAxes;
    perPower: Array<{
      name: string;
      basePowerValue: number;
      derivedCooldownTurns: number;
      cooldownCapacity: number;
      cooldownLoad: number;
      cooldownBracket: string;
    }>;
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
  TANK: "Aims for very high physical and mental survivability over raw offensive output.",
  CONTROLLER:
    "Aims for disruption, manipulation, and encounter-shaping value over direct damage.",
  SCRAPPER:
    "Aims for high physical threat and pressure with average mobility and physical survivability, while leaving mental lanes and synergy intentionally low.",
};

const ARCHETYPE_TARGETS: Record<MonsterCalculatorArchetype, RadarAxes> = {
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
  const [isOutcomeCalculatorOpen, setIsOutcomeCalculatorOpen] = useState(true);
  const OutcomeCalculatorChevron = isOutcomeCalculatorOpen
    ? ChevronDown
    : ChevronRight;
  const semanticSynergyModel = asRecord(profile?.debug?.semanticSynergyAxisModel);
  const excludedLegacySynergySources = Array.isArray(
    semanticSynergyModel.excludedLegacySynergySources,
  )
    ? semanticSynergyModel.excludedLegacySynergySources
        .map(asRecord)
        .filter((source) => Number(source.amount) > 0)
    : [];
  const controlPressureModel = asRecord(
    profile?.debug?.controlPressureAxisBaselineModel,
  );
  const legacyControlDelivery = asRecord(controlPressureModel.legacyControlDelivery);
  const legacyControlPackages = Array.isArray(legacyControlDelivery.packages)
    ? legacyControlDelivery.packages.map(asRecord)
    : [];
  const levelRelativeControlStrength = Number(
    legacyControlDelivery.levelRelativeControlStrength,
  );
  const controlRadarDisplayScore = Number(legacyControlDelivery.radarDisplayScore);
  const controlReferenceRatio = Number(controlPressureModel.ratioToBaseline);
  const controlLevel = Number(legacyControlDelivery.level);
  const controlExceedsLevelEnvelope =
    Number.isFinite(levelRelativeControlStrength) &&
    levelRelativeControlStrength > 10;

  return (
    <section className="sticky top-12 lg:top-0 z-20 max-h-[calc(100vh-3rem)] lg:max-h-screen overflow-y-auto rounded border border-zinc-800 bg-zinc-900/95 p-4 space-y-3 shadow">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="rounded p-0.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
            aria-controls="outcome-calculator-body"
            aria-expanded={isOutcomeCalculatorOpen}
            title={
              isOutcomeCalculatorOpen
                ? "Hide Outcome Calculator"
                : "Show Outcome Calculator"
            }
            onClick={() => setIsOutcomeCalculatorOpen((isOpen) => !isOpen)}
          >
            <OutcomeCalculatorChevron className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">
              {isOutcomeCalculatorOpen
                ? "Hide Outcome Calculator"
                : "Show Outcome Calculator"}
            </span>
          </button>
          <h3 className="font-semibold">Outcome Calculator</h3>
        </div>
        {isOutcomeCalculatorOpen && (
          <label className="flex items-center gap-2 text-xs">
            <span className="text-zinc-400">Archetype</span>
            <select
              value={archetype}
              title={ARCHETYPE_TOOLTIPS[archetype]}
              onChange={(event) =>
                onArchetypeChangeAction(
                  event.target.value as MonsterCalculatorArchetype,
                )
              }
              className="rounded border border-zinc-700 bg-zinc-950/40 px-2 py-1 text-xs"
            >
              {ARCHETYPE_OPTIONS.map((option) => (
                <option
                  key={option}
                  value={option}
                  title={ARCHETYPE_TOOLTIPS[option]}
                >
                  {ARCHETYPE_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {isOutcomeCalculatorOpen && (
        <div id="outcome-calculator-body" className="space-y-3">
          {!profile && (
            <p className="text-xs text-zinc-500">
              No preview monster selected.
            </p>
          )}

          {profile && (
            <>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Final Outcome</h4>
                <p className="text-[11px] text-zinc-500">
                  Combined monster radar after non-power contributors, effective
                  power availability, and outcome normalization.
                </p>
                <p className="text-[11px] text-zinc-500">
                  Threat and survivability scores are baseline-relative 0-10
                  ratings. Survivability includes health, Protection, defence,
                  Dodge or resist coverage, powers, traits, equipment, and
                  Legendary injury persistence where supported.
                </p>
                <p className="text-[11px] text-zinc-500">
                  Survivability is relative, not a literal HP or attacks-to-defeat
                  value.
                </p>
                <p className="text-[11px] text-zinc-500">
                  Pressure is encounter coverage and cadence, not raw damage. It
                  reflects target breadth, reach, area coverage, recurring effects,
                  repeatability, linked actions, and supported action economy.
                </p>
                <p className="text-[11px] text-zinc-500">
                  Control Pressure reflects Level-relative per-use control strength,
                  including severity, targets, duration, and opposed-success
                  penetration. Authoritative cooldown and encounter cadence are
                  reported separately.
                </p>
                <p className="text-[11px] text-zinc-500">
                  A Control Pressure score of 0 means the creature has no supported
                  control package. Other scores are relative to the expected
                  control-capable package for its level and tier.
                </p>
              </div>
              <OutcomeRadar
                axes={profile.radarAxes}
                backgroundAxes={ARCHETYPE_TARGETS[archetype]}
              />

              {excludedLegacySynergySources.length > 0 && (
                <div
                  role="status"
                  className="rounded border border-amber-700/70 bg-amber-950/30 p-2 text-xs text-amber-100"
                >
                  <p className="font-medium">Synergy excludes unsupported legacy weights</p>
                  <p className="mt-1 text-amber-200/90">
                    Semantic Power Synergy was calculated. The following legacy
                    sources lack a supported semantic runtime model and were not
                    scored: {excludedLegacySynergySources.map((source) =>
                      `${String(source.name)} (${formatDecimal(Number(source.amount))})`
                    ).join(", ")}.
                  </p>
                </div>
              )}

              {legacyControlPackages.length > 0 && (
                <div className="rounded border border-sky-800/70 bg-sky-950/25 p-2 text-xs text-sky-100">
                  <p className="font-medium">Control Strength and Encounter Availability</p>
                  <p className="mt-1 text-sky-200/80">
                    Level-relative per-use Control Strength {formatDecimal(
                      levelRelativeControlStrength,
                    )}
                    {" · "}Radar display {controlExceedsLevelEnvelope
                      ? "10+ (plotted at 10)"
                      : formatDecimal(controlRadarDisplayScore)}
                    {" · "}Level reference ratio {formatDecimal(controlReferenceRatio)}×
                  </p>
                  {controlExceedsLevelEnvelope && (
                    <div
                      role="alert"
                      className="mt-2 rounded border border-red-700/80 bg-red-950/40 p-2 text-red-100"
                    >
                      <p className="font-semibold">
                        Exceeds the Level {Number.isFinite(controlLevel) ? controlLevel : "current"} control envelope.
                      </p>
                      <p className="mt-1 text-red-200/90">
                        This Power has substantially more opposed-success penetration
                        than the expected Level {Number.isFinite(controlLevel) ? controlLevel : "current"} package.
                        It is highly resistant to cancellation by stronger defence,
                        Resist Powers and assistance. BPV and cooldown continue to rise.
                      </p>
                    </div>
                  )}
                  <div className="mt-2 space-y-2">
                    {legacyControlPackages.map((controlPackage, index) => {
                      const robustness = asRecord(
                        controlPackage.robustnessProbabilities,
                      );
                      return (
                        <div
                          key={`${String(controlPackage.sourcePowerId)}:${String(controlPackage.packetIndex)}:${index}`}
                          className="rounded border border-sky-900/70 bg-zinc-950/30 p-2"
                        >
                          <p className="text-sky-100">
                            {String(controlPackage.sourcePowerName)}
                          </p>
                          <p className="mt-1 text-sky-200/80">
                            Application {formatDecimal(Number(controlPackage.applicationProbability) * 100)}%
                            {" · "}Expected positive net successes {formatDecimal(Number(controlPackage.expectedPositiveNetSuccesses))}
                            {" · "}Expected excess net successes {formatDecimal(Number(controlPackage.expectedExcessNetSuccesses))}
                            {" · "}Active target-turns {formatDecimal(Number(controlPackage.expectedActiveTargetTurns))}
                          </p>
                          <p className="mt-1 text-sky-200/80">
                            Retains ≥1 net {formatDecimal(Number(robustness.atLeastOne) * 100)}%
                            {" · "}≥2 {formatDecimal(Number(robustness.atLeastTwo) * 100)}%
                            {" · "}≥3 {formatDecimal(Number(robustness.atLeastThree) * 100)}%
                            {" · "}≥5 {formatDecimal(Number(robustness.atLeastFive) * 100)}%
                          </p>
                          <p className="mt-1 text-sky-200/80">
                            Per-use penetration {formatDecimal(Number(controlPackage.perUseControlProxy))}
                            {" · "}BPV {formatDecimal(Number(controlPackage.basePowerValue))}
                            {" · "}Authoritative cooldown {String(controlPackage.cooldownTurns)}
                            {" · "}Encounter Availability {formatDecimal(Number(controlPackage.availability))}
                            {" · "}Encounter Control {formatDecimal(Number(controlPackage.encounterControlProxy))}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {legacyControlDelivery.cadenceTradeoffApplied === true && (
                    <p className="mt-2 text-amber-200">
                      The encounter contribution is lower than per-use strength
                      because authoritative cooldown cadence reduces availability.
                      Increasing Dice Count can strengthen each use while lowering
                      encounter contribution when it crosses a cooldown threshold.
                    </p>
                  )}
                </div>
              )}

              <details className="rounded border border-zinc-800 bg-zinc-950/30 p-2 text-[10px] text-zinc-400">
                <summary className="cursor-pointer select-none text-zinc-500">
                  Debug
                </summary>
                <p className="mt-2 text-zinc-500">
                  Raw defensive output is compared with the accepted package for
                  the creature&apos;s level, tier, lane, and Legendary state before
                  being converted to a 0-10 score.
                </p>
                <p className="mt-2 text-zinc-500">
                  Pressure compares the creature&apos;s encounter coverage and cadence
                  with the expected package for its level, tier, and Legendary state
                  before conversion to a 0-10 score.
                </p>
                <p className="mt-2 text-zinc-500">
                  Supported control packages are compared with the expected package
                  for the creature&apos;s level, tier, and Legendary state before
                  conversion to an uncapped Level-relative Control Strength score.
                  The radar polygon is displayed on a 0-10 scale.
                </p>
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
              Net Success Multiplier:{" "}
              {formatDecimal(profile.netSuccessMultiplier)}
            </p>
          )}

          <details className="rounded border border-zinc-800 bg-zinc-950/30 p-3 text-xs">
            <summary className="cursor-pointer select-none text-zinc-300">
              Power Contribution
            </summary>

            <div className="mt-3 space-y-3">
              <p className="text-[11px] text-zinc-500">
                Canonical Phase 6 per-use power vector. Final outcome debug
                shows the effective availability-adjusted contribution used by
                the monster radar. Final Pressure is calculated separately from
                authored encounter coverage and cadence, not the generic power
                vector. Final Control Pressure is also calculated separately from
                supported table-facing control packages, not power cost or damage.
              </p>

              {!powerCostPreview && (
                <p className="text-xs text-zinc-500">
                  No power preview available.
                </p>
              )}

              {powerCostPreview && (
                <>
                  <dl className="grid gap-2 text-xs sm:grid-cols-3">
                    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
                      <dt className="text-zinc-500">Tuning Set</dt>
                      <dd className="mt-1 text-zinc-200">
                        {powerCostPreview.tuningSetName ??
                          "Default values (loading or fallback)"}
                      </dd>
                    </div>
                    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
                      <dt className="text-zinc-500">Powers</dt>
                      <dd className="mt-1 text-zinc-200">
                        {powerCostPreview.powerCount}
                        {powerCostPreview.invalidPowerCount ? (
                          <span className="ml-2 text-amber-300">
                            ({powerCostPreview.invalidPowerCount} invalid excluded)
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
                      <dt className="text-zinc-500">Total Base Power Value</dt>
                      <dd className="mt-1 text-zinc-200">
                        {formatDecimal(powerCostPreview.totalBasePowerValue)}
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-2">
                    <h5 className="text-xs font-medium text-zinc-300">
                      Canonical Power Axis Vector
                    </h5>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      {POWER_AXIS_ROWS.map((axis) => (
                        <div
                          key={axis.key}
                          className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1"
                        >
                          <span className="text-zinc-500">{axis.label}</span>
                          <span className="text-zinc-200">
                            {formatDecimal(
                              powerCostPreview.axisVector[axis.key] ?? 0,
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h5 className="text-xs font-medium text-zinc-300">
                      Per Power
                    </h5>
                    <div className="space-y-1">
                      {powerCostPreview.perPower.length === 0 && (
                        <p className="text-xs text-zinc-500">
                          No powers authored yet.
                        </p>
                      )}
                      {powerCostPreview.perPower.map((power, index) => (
                        <div
                          key={`${power.name}-${index}`}
                          className="grid gap-1 rounded border border-zinc-800 bg-zinc-900/40 px-2 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto]"
                        >
                          <span className="truncate text-zinc-300">
                            {power.name || `Power ${index + 1}`}
                          </span>
                          <span className="text-zinc-200 sm:text-right">
                            BPV {formatDecimal(power.basePowerValue)}
                          </span>
                          <span className="text-[11px] text-zinc-500 sm:col-span-2">
                            Derived Cooldown: {power.derivedCooldownTurns}{" "}
                            {power.derivedCooldownTurns === 1
                              ? "turn"
                              : "turns"}{" "}
                            | Capacity {formatDecimal(power.cooldownCapacity)} |
                            Load {formatDecimal(power.cooldownLoad)} (
                            {power.cooldownBracket})
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
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
