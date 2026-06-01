import type { CombatDieSize } from "./types";

export type Rng = () => number;

export function createSeededRng(seed: number): Rng {
  let state = Math.trunc(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function diceSides(die: CombatDieSize): number {
  switch (die) {
    case "D4":
      return 4;
    case "D6":
      return 6;
    case "D8":
      return 8;
    case "D10":
      return 10;
    case "D12":
      return 12;
  }
}

export function successCountForRoll(roll: number, modifier = 0): number {
  const modifiedRoll = roll + modifier;
  if (modifiedRoll >= 11) return 3;
  if (modifiedRoll >= 8) return 2;
  if (modifiedRoll >= 4) return 1;
  return 0;
}

export function rollDie(die: CombatDieSize, rng: Rng, modifier = 0): { roll: number; modifiedRoll: number; successes: number } {
  const roll = Math.floor(rng() * diceSides(die)) + 1;
  return { roll, modifiedRoll: roll + modifier, successes: successCountForRoll(roll, modifier) };
}

export function rollDice(count: number, die: CombatDieSize, rng: Rng, modifier = 0) {
  const rolls = Array.from({ length: Math.max(0, Math.trunc(count)) }, () => rollDie(die, rng, modifier));
  return {
    rolls,
    successes: rolls.reduce((sum, roll) => sum + roll.successes, 0),
  };
}

export function expectedSuccessesPerDie(die: CombatDieSize): number {
  const sides = diceSides(die);
  let total = 0;
  for (let roll = 1; roll <= sides; roll += 1) {
    total += successCountForRoll(roll);
  }
  return total / sides;
}

export function expectedSuccesses(count: number, die: CombatDieSize): number {
  return Math.max(0, Math.trunc(count)) * expectedSuccessesPerDie(die);
}
