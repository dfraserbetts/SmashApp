// SC_COMBAT_LAB_PLAYER_TYPES

import type { DiceSize } from "../types";

export interface PlayerLabPower {
  id: string;
  name: string;

  // Throughput model (probabilistic)
  diceCount: number;
  potency: number;

  // v0.1: domain is chosen explicitly for now
  domain: "physical" | "mental";
  intent: "attack" | "defence" | "support" | "control";
}

export interface PlayerLabState {
  id: string;
  name: string;
  level: number;

  // Core proficiency / accuracy driver (your Option 1)
  attackDie: DiceSize;

  // Defensive dice needed for dodge derivation (same pattern as monster)
  defenceDie: DiceSize;
  intellectDie: DiceSize;

  // HP pools
  physicalHPMax: number;
  mentalHPMax: number;

  // Protection
  physicalProtection: number;
  mentalProtection: number;

  // Actions
  actionsPerTurn: number;

  // Powers
  powers: PlayerLabPower[];
}
