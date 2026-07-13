import type { PowerTuningSnapshot } from "@/lib/config/powerTuningShared";
import {
  attachPowerCooldownAuthority,
  resolvePowerCooldownAuthority,
} from "@/lib/summoning/resolvePowerCooldownAuthority";
import type { PowerCostContext } from "@/lib/summoning/powerCostResolver";
import type {
  Power,
  PowerCooldownAuthorityResolution,
  PowerCooldownAuthorityResult,
} from "@/lib/summoning/types";

export type PowerCooldownCacheSynchronizationSuccess = {
  ok: true;
  power: Power;
  authority: PowerCooldownAuthorityResult;
};

export type PowerCooldownCacheSynchronizationFailure = Extract<
  PowerCooldownAuthorityResolution,
  { ok: false }
>;

export type PowerCooldownCacheSynchronizationResult =
  | PowerCooldownCacheSynchronizationSuccess
  | PowerCooldownCacheSynchronizationFailure;

export type PowerCooldownCacheBatchSynchronizationResult =
  | {
      ok: true;
      powers: Power[];
      authorities: PowerCooldownAuthorityResult[];
    }
  | (PowerCooldownCacheSynchronizationFailure & {
      powerIndex: number;
      powerName: string;
    });

export function applyResolvedPowerCooldownCache(
  power: Power,
  resolution: PowerCooldownAuthorityResolution,
): PowerCooldownCacheSynchronizationResult {
  if (!resolution.ok) return resolution;
  return {
    ok: true,
    power: attachPowerCooldownAuthority(power, resolution),
    authority: resolution.result,
  };
}

export function synchronizePowerCooldownCache(params: {
  power: Power;
  tuningSnapshot?: PowerTuningSnapshot | null;
  context?: PowerCostContext;
  minimumCooldownTurns?: number | null;
}): PowerCooldownCacheSynchronizationResult {
  const resolution = resolvePowerCooldownAuthority({
    power: params.power,
    mode: "ACTIVE_CURRENT_BALANCE",
    tuningSnapshot: params.tuningSnapshot,
    context: params.context,
    minimumCooldownTurns: params.minimumCooldownTurns,
  });
  return applyResolvedPowerCooldownCache(params.power, resolution);
}

export function synchronizePowerCooldownCacheBatch(params: {
  powers: readonly Power[];
  tuningSnapshot?: PowerTuningSnapshot | null;
  context?: PowerCostContext;
  minimumCooldownTurns?: readonly (number | null | undefined)[];
}): PowerCooldownCacheBatchSynchronizationResult {
  const powers: Power[] = [];
  const authorities: PowerCooldownAuthorityResult[] = [];

  for (const [powerIndex, power] of params.powers.entries()) {
    const synchronized = synchronizePowerCooldownCache({
      power,
      tuningSnapshot: params.tuningSnapshot,
      context: params.context,
      minimumCooldownTurns: params.minimumCooldownTurns?.[powerIndex],
    });
    if (!synchronized.ok) {
      return {
        ...synchronized,
        powerIndex,
        powerName: power.name,
      };
    }
    powers.push(synchronized.power);
    authorities.push(synchronized.authority);
  }

  return { ok: true, powers, authorities };
}
