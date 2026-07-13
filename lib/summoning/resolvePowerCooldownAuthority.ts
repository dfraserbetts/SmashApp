import {
  DEFAULT_POWER_TUNING_VALUES,
  type PowerTuningSnapshot,
} from "@/lib/config/powerTuningShared";
import {
  resolvePowerCosts,
  type PowerCostContext,
} from "@/lib/summoning/powerCostResolver";
import type {
  Power,
  PowerCooldownAuthorityMode,
  PowerCooldownAuthorityResolution,
  PowerCooldownAuthorityResult,
} from "@/lib/summoning/types";

function readStoredCooldown(power: Pick<Power, "cooldownTurns" | "cooldownReduction">): number | null {
  const rawCooldown = Number(power.cooldownTurns);
  if (!Number.isFinite(rawCooldown) || rawCooldown < 1) return null;
  const rawReduction = Number(power.cooldownReduction);
  const reduction = Number.isFinite(rawReduction) ? Math.max(0, Math.trunc(rawReduction)) : 0;
  return Math.max(1, Math.trunc(rawCooldown) - reduction);
}

export function resolvePowerCooldownAuthority(params: {
  power: Power;
  mode: PowerCooldownAuthorityMode;
  tuningSnapshot?: PowerTuningSnapshot | null;
  context?: PowerCostContext;
  minimumCooldownTurns?: number | null;
}): PowerCooldownAuthorityResolution {
  const storedCooldownTurns = readStoredCooldown(params.power);
  if (params.mode === "ACTIVE_CURRENT_BALANCE" && !params.tuningSnapshot) {
    return {
      ok: false,
      errorCode: "ACTIVE_TUNING_REQUIRED",
      message: `Power "${params.power.name}" requires the active power-tuning snapshot before its gameplay cooldown can be resolved.`,
      storedCooldownTurns,
    };
  }

  try {
    const source =
      params.mode === "ACTIVE_CURRENT_BALANCE" ? "ACTIVE_TUNING" : "BUILTIN_DEFAULTS";
    const tuningSnapshot =
      params.mode === "ACTIVE_CURRENT_BALANCE"
        ? params.tuningSnapshot!
        : {
            setId: null,
            name: "Built-in power tuning defaults",
            values: DEFAULT_POWER_TUNING_VALUES,
          };
    const resolved = resolvePowerCosts([params.power], tuningSnapshot, params.context).powers[0];
    if (!resolved) throw new Error("Resolver returned no power result.");
    const minimumCooldownTurns =
      typeof params.minimumCooldownTurns === "number" && Number.isFinite(params.minimumCooldownTurns)
        ? Math.max(1, Math.trunc(params.minimumCooldownTurns))
        : 1;
    const effectiveCooldownTurns = Math.max(
      Math.max(1, Math.trunc(resolved.derivedCooldownTurns)),
      minimumCooldownTurns,
    );
    const mismatch =
      storedCooldownTurns !== null && storedCooldownTurns !== effectiveCooldownTurns;
    const warnings: string[] = [];
    if (mismatch) {
      warnings.push(
        `Power "${params.power.name}" stored cooldown ${storedCooldownTurns} differs from authoritative ${source === "ACTIVE_TUNING" ? "active-tuning" : "built-in preview"} cooldown ${effectiveCooldownTurns}; the stored value was ignored.`,
      );
    }
    if (source === "BUILTIN_DEFAULTS") {
      warnings.push(
        `Power "${params.power.name}" cooldown was resolved in explicit built-in preview mode and is not current-balance gameplay authority.`,
      );
    }
    return {
      ok: true,
      result: {
        effectiveCooldownTurns,
        source,
        tuningSetId: source === "ACTIVE_TUNING" ? params.tuningSnapshot!.setId : null,
        tuningUpdatedAt:
          source === "ACTIVE_TUNING" ? params.tuningSnapshot!.updatedAt : null,
        storedCooldownTurns,
        mismatch,
        warnings,
        basePowerValue: resolved.breakdown.basePowerValue,
        cooldownLoad: resolved.derivedCooldown.cooldownLoad,
      },
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "COOLDOWN_DERIVATION_FAILED",
      message: `Power "${params.power.name}" cooldown derivation failed: ${
        error instanceof Error ? error.message : "unknown resolver error"
      }`,
      storedCooldownTurns,
    };
  }
}

export function attachPowerCooldownAuthority(
  power: Power,
  resolution: PowerCooldownAuthorityResolution,
): Power {
  if (!resolution.ok) return { ...power, cooldownAuthority: null };
  return {
    ...power,
    cooldownTurns: resolution.result.effectiveCooldownTurns,
    cooldownReduction: 0,
    cooldownAuthority: resolution.result,
  };
}

export function makeResolvedPowerCooldownAuthority(params: {
  effectiveCooldownTurns: number;
  source: PowerCooldownAuthorityResult["source"];
  tuningSetId?: string | null;
  tuningUpdatedAt?: string | null;
  storedCooldownTurns?: number | null;
  basePowerValue?: number;
  cooldownLoad?: number;
  warnings?: string[];
}): PowerCooldownAuthorityResult {
  const effectiveCooldownTurns = Math.max(1, Math.trunc(params.effectiveCooldownTurns));
  const storedCooldownTurns = params.storedCooldownTurns ?? null;
  return {
    effectiveCooldownTurns,
    source: params.source,
    tuningSetId: params.tuningSetId ?? null,
    tuningUpdatedAt: params.tuningUpdatedAt ?? null,
    storedCooldownTurns,
    mismatch:
      storedCooldownTurns !== null && storedCooldownTurns !== effectiveCooldownTurns,
    warnings: params.warnings ?? [],
    basePowerValue: params.basePowerValue ?? 0,
    cooldownLoad: params.cooldownLoad ?? 0,
  };
}
