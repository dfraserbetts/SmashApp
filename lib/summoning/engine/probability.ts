// SC_COMBAT_ENGINE_V01_PROBABILITY

import { DiceSize } from "./models";

// SC_ENGINE_DICE_SIDES
function diceSides(die: DiceSize): number {
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
    default:
      return 6;
  }
}

/**
 * Success probability per die under "success on threshold+".
 * Example: d12, threshold 4 => outcomes 4..12 are successes => 9/12 = 0.75
 */
export function pSuccessPerDie(die: DiceSize, threshold: 2 | 3 | 4 | 5 | 6): number {
  const sides = diceSides(die);
  const successes = Math.max(0, sides - threshold + 1);
  return successes / sides;
}

export function expectedSuccesses(n: number, p: number): number {
  return n * p;
}

export function varianceSuccesses(n: number, p: number): number {
  return n * p * (1 - p);
}

export function stdDevSuccesses(n: number, p: number): number {
  return Math.sqrt(varianceSuccesses(n, p));
}

export function pZeroSuccesses(n: number, p: number): number {
  // (1-p)^n
  return Math.pow(1 - p, n);
}
