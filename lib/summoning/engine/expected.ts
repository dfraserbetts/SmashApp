// SC_COMBAT_ENGINE_V01_EXPECTED

import {
  CombatantExpected,
  CombatantModel,
  DuelExpectedResult,
  PowerExpectedStats,
  SimOptions,
} from "./models";
import { expectedSuccesses, pSuccessPerDie, pZeroSuccesses, stdDevSuccesses } from "./probability";

function applyMitigation(rawWounds: number, dodge: number, protection: number): number {
  // v0.1 mitigation model:
  // - dodge is chance to negate the whole packet (simple)
  // - protection subtracts from wounds after dodge
  const afterDodge = rawWounds * (1 - clamp01(dodge));
  return Math.max(0, afterDodge - Math.max(0, protection));
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function expectedForCombatant(
  attacker: CombatantModel,
  defender: CombatantModel,
  options: SimOptions = {},
): CombatantExpected {
  const threshold = options.successThreshold ?? 4;

  const perPower = attacker.powers.map(({ id: powerId, domain, diceCount, potency }) => {
    const p = pSuccessPerDie(attacker.offence.accuracyDie, threshold);
    const expSucc = expectedSuccesses(diceCount, p);
    const sd = stdDevSuccesses(diceCount, p);
    const p0 = pZeroSuccesses(diceCount, p);

    const expectedRawWounds = expSucc * potency;

    const protection = domain === "physical" ? defender.defence.pp : defender.defence.mp;
    const expectedNetWounds = applyMitigation(expectedRawWounds, defender.defence.dodge, protection);

    const stats: PowerExpectedStats = {
      pSuccessPerDie: p,
      expectedSuccesses: expSucc,
      stdDevSuccesses: sd,
      pZeroSuccesses: p0,
      expectedRawWounds,
      expectedNetWounds,
    };

    return { powerId, stats };
  });

  const expectedNetWoundsPerAction =
    perPower.length === 0
      ? 0
      : perPower.reduce((sum, p) => sum + p.stats.expectedNetWounds, 0) / perPower.length;

  const expectedNetWoundsPerTurn = expectedNetWoundsPerAction * Math.max(1, attacker.offence.actionsPerTurn);

  return {
    combatantId: attacker.id,
    perPower,
    expectedNetWoundsPerAction,
    expectedNetWoundsPerTurn,
    totalHP: Math.max(0, attacker.hp.physical) + Math.max(0, attacker.hp.mental),
  };
}

export function expectedDuel(
  attacker: CombatantModel,
  defender: CombatantModel,
  options: SimOptions = {},
): DuelExpectedResult {
  const atk = expectedForCombatant(attacker, defender, options);
  const def = expectedForCombatant(defender, attacker, options);

  const expectedTurnsToDefeatDefender =
    atk.expectedNetWoundsPerTurn <= 0 ? Number.POSITIVE_INFINITY : def.totalHP / atk.expectedNetWoundsPerTurn;

  return { attacker: atk, defender: def, expectedTurnsToDefeatDefender };
}
