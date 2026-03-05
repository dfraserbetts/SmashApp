// SC_COMBAT_ENGINE_V01_MODELS

// SC_ENGINE_DICE_SIZE: keep consistent with lib/summoning/types DiceSize ("D4"..."D12")
export type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
export type Domain = "physical" | "mental";
export type Intent = "attack" | "defence" | "support" | "control";

export interface PowerModel {
  id: string;
  name: string;
  intent: Intent;
  domain: Domain;

  // Output structure (not "damage knob"):
  diceCount: number; // number of dice rolled
  potency: number; // wounds per success
}

export interface CombatantDefence {
  pp: number; // physical protection
  mp: number; // mental protection
  dodge: number; // 0..1 probability to dodge (v0.1)
}

export interface CombatantOffence {
  // Accuracy is proficiency die-size from core attribute (Option 1)
  accuracyDie: DiceSize; // d4..d12
  actionsPerTurn: number; // integer
}

export interface CombatantHP {
  physical: number;
  mental: number;
}

export interface CombatantModel {
  id: string;
  name: string;
  level: number;

  hp: CombatantHP;
  offence: CombatantOffence;
  defence: CombatantDefence;

  powers: PowerModel[];
}

export interface SimOptions {
  // Your global rule: success on 4+ by default
  successThreshold?: 2 | 3 | 4 | 5 | 6;
}

export interface PowerExpectedStats {
  pSuccessPerDie: number;
  expectedSuccesses: number;
  stdDevSuccesses: number;
  pZeroSuccesses: number;

  expectedRawWounds: number; // successes * potency
  expectedNetWounds: number; // after dodge + protection (v0.1 model)
}

export interface CombatantExpected {
  combatantId: string;

  perPower: Array<{
    powerId: string;
    stats: PowerExpectedStats;
  }>;

  expectedNetWoundsPerAction: number;
  expectedNetWoundsPerTurn: number;

  // convenience: combined HP pools (v0.1)
  totalHP: number;
}

export interface DuelExpectedResult {
  attacker: CombatantExpected;
  defender: CombatantExpected;

  expectedTurnsToDefeatDefender: number; // defenderHP / attackerDPR
}
