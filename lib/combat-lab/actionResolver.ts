import { rollDice, type Rng } from "./dice";
import {
  getAttributeModifier,
  getProtectionModifier,
  markDefeatedActors,
} from "./combatState";
import type {
  CombatAction,
  CombatActor,
  CombatResolutionMetrics,
  CombatState,
} from "./types";

function emptyResolution(): CombatResolutionMetrics {
  return {
    rawSuccesses: 0,
    rawWounds: 0,
    dodgeSuccesses: 0,
    woundsAvoidedByDodge: 0,
    protectionPrevented: 0,
    resistCancelled: 0,
    netWounds: 0,
    healingDone: 0,
    mitigationApplied: 0,
    buffDebuffApplied: 0,
    overkill: 0,
    wastedActions: 0,
  };
}

function getActorDie(actor: CombatActor, action: CombatAction) {
  return actor.attributeDice[action.accuracyAttribute] ?? "D8";
}

function dodgeSuccesses(target: CombatActor, incomingSuccesses: number, rng: Rng): number {
  if (incomingSuccesses <= 0 || target.dodgeValue <= 0) return 0;
  const dodgeRoll = Math.floor(rng() * 12) + 1;
  return dodgeRoll >= Math.max(1, target.dodgeValue) ? incomingSuccesses : 0;
}

function applyWounds(target: CombatActor, pool: "physical" | "mental", wounds: number): number {
  if (wounds <= 0) return 0;
  const key = pool === "physical" ? "physicalHpCurrent" : "mentalHpCurrent";
  const before = target[key];
  target[key] = before - wounds;
  return Math.max(0, wounds - Math.max(0, before));
}

function healWounds(target: CombatActor, pool: "physical" | "mental", healing: number): number {
  if (healing <= 0) return 0;
  const currentKey = pool === "physical" ? "physicalHpCurrent" : "mentalHpCurrent";
  const maxKey = pool === "physical" ? "physicalHpMax" : "mentalHpMax";
  const before = target[currentKey];
  target[currentKey] = Math.min(target[maxKey], before + healing);
  return target[currentKey] - before;
}

export function resolveCombatAction(params: {
  state: CombatState;
  actor: CombatActor;
  action: CombatAction | null;
  target: CombatActor | null;
  rng: Rng;
}): CombatResolutionMetrics {
  const { state, actor, action, target, rng } = params;
  const metrics = emptyResolution();
  if (!action || !target || actor.defeated) {
    metrics.wastedActions = 1;
    return metrics;
  }

  const actorAttributeModifier = getAttributeModifier(state, actor.id, action.accuracyAttribute);
  const diceCount = Math.max(0, action.diceCount + actorAttributeModifier);
  const roll = rollDice(diceCount, getActorDie(actor, action), rng);
  metrics.rawSuccesses = roll.successes;

  if (action.kind === "attack") {
    const pool = action.pool ?? "physical";
    const rawWounds = roll.successes * action.potency;
    const avoidedSuccesses = dodgeSuccesses(target, roll.successes, rng);
    const activeSuccesses = Math.max(0, roll.successes - avoidedSuccesses);
    const activeRawWounds = activeSuccesses * action.potency;
    const protection =
      (pool === "physical" ? target.physicalProtection : target.mentalProtection) +
      getProtectionModifier(state, target.id, pool);
    const prevented = Math.min(activeRawWounds, Math.max(0, protection));
    const netWounds = Math.max(0, activeRawWounds - prevented);
    const overkill = applyWounds(target, pool, netWounds);

    metrics.rawWounds = rawWounds;
    metrics.dodgeSuccesses = avoidedSuccesses;
    metrics.woundsAvoidedByDodge = avoidedSuccesses * action.potency;
    metrics.protectionPrevented = prevented;
    metrics.netWounds = netWounds;
    metrics.overkill = overkill;
  } else if (action.kind === "healing") {
    const healing = roll.successes * action.potency;
    metrics.healingDone = healWounds(target, action.pool ?? "physical", healing);
  } else if (action.kind === "buff" || action.kind === "debuff") {
    if (action.modifier) {
      state.statusEffects.push({
        id: `${state.round}:${actor.id}:${action.id}:${target.id}`,
        sourceActorId: actor.id,
        targetActorId: target.id,
        kind: action.kind,
        attribute: action.modifier.attribute,
        amount: action.modifier.amount,
        remainingRounds: action.modifier.durationRounds,
      });
      metrics.buffDebuffApplied = action.modifier.amount;
    }
  } else if (action.kind === "defence") {
    const amount = Math.max(1, roll.successes * Math.max(1, action.protection ?? action.potency));
    state.statusEffects.push({
      id: `${state.round}:${actor.id}:${action.id}:${target.id}`,
      sourceActorId: actor.id,
      targetActorId: target.id,
      kind: "protection",
      pool: action.pool ?? "physical",
      amount,
      remainingRounds: action.modifier?.durationRounds ?? 1,
    });
    metrics.mitigationApplied = amount;
  }

  if (action.cooldownRounds > 0) {
    state.cooldowns[`${actor.id}:${action.id}`] = action.cooldownRounds;
  }

  const defeated = markDefeatedActors(state);
  state.log.push({
    round: state.round,
    actorId: actor.id,
    actorName: actor.name,
    actionId: action.id,
    actionName: action.name,
    targetId: target.id,
    targetName: target.name,
    message: `${actor.name} used ${action.name} on ${target.name}${defeated.includes(target.id) ? " and defeated them" : ""}.`,
    metrics,
  });

  return metrics;
}

