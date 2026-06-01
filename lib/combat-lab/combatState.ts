import type {
  CombatActor,
  CombatAggregateMetrics,
  CombatSide,
  CombatState,
  UnsupportedPowerSummary,
} from "./types";

export function cloneActor(actor: CombatActor): CombatActor {
  return {
    ...actor,
    attributes: { ...actor.attributes },
    attributeDice: { ...actor.attributeDice },
    resist: { ...actor.resist },
    actions: actor.actions.map((action) => ({ ...action })),
    unsupportedPowers: actor.unsupportedPowers.map((reason) => ({ ...reason })),
    hydration: {
      ...actor.hydration,
      warnings: [...actor.hydration.warnings],
      unsupportedEquipment: [...actor.hydration.unsupportedEquipment],
      unsupportedTraits: [...actor.hydration.unsupportedTraits],
      fallbackActions: [...actor.hydration.fallbackActions],
    },
  };
}

export function createCombatState(players: CombatActor[], monsters: CombatActor[]): CombatState {
  return {
    round: 1,
    actors: [...players, ...monsters].map((actor) => ({
      ...cloneActor(actor),
      defeated: false,
      physicalHpCurrent: actor.physicalHpMax,
      mentalHpCurrent: actor.mentalHpMax,
    })),
    cooldowns: {},
    statusEffects: [],
    log: [],
  };
}

export function getLivingActors(state: CombatState, side?: CombatSide): CombatActor[] {
  return state.actors.filter((actor) => !actor.defeated && (!side || actor.side === side));
}

export function getOppositeSide(side: CombatSide): CombatSide {
  return side === "players" ? "monsters" : "players";
}

export function markDefeatedActors(state: CombatState): string[] {
  const defeated: string[] = [];
  for (const actor of state.actors) {
    if (actor.defeated) continue;
    if (actor.physicalHpCurrent <= 0 || actor.mentalHpCurrent <= 0) {
      actor.defeated = true;
      defeated.push(actor.id);
    }
  }
  return defeated;
}

export function decrementRoundEffects(state: CombatState) {
  state.statusEffects = state.statusEffects
    .map((effect) => ({ ...effect, remainingRounds: effect.remainingRounds - 1 }))
    .filter((effect) => effect.remainingRounds > 0);
  for (const key of Object.keys(state.cooldowns)) {
    state.cooldowns[key] = Math.max(0, state.cooldowns[key] - 1);
    if (state.cooldowns[key] === 0) delete state.cooldowns[key];
  }
}

export function getAttributeModifier(state: CombatState, actorId: string, attribute: string): number {
  return state.statusEffects
    .filter((effect) => effect.targetActorId === actorId && effect.attribute === attribute)
    .reduce((sum, effect) => {
      if (effect.kind === "debuff") return sum - effect.amount;
      return sum + effect.amount;
    }, 0);
}

export function getProtectionModifier(state: CombatState, actorId: string, pool: "physical" | "mental"): number {
  return state.statusEffects
    .filter((effect) => effect.targetActorId === actorId && effect.kind === "protection" && effect.pool === pool)
    .reduce((sum, effect) => sum + effect.amount, 0);
}

export function createEmptyMetrics(): CombatAggregateMetrics {
  return {
    damageDealt: { players: 0, monsters: 0 },
    healingDone: { players: 0, monsters: 0 },
    protectionPrevented: { players: 0, monsters: 0 },
    woundsAvoidedByDodge: { players: 0, monsters: 0 },
    resistCancelled: { players: 0, monsters: 0 },
    overkill: { players: 0, monsters: 0 },
    oneRoundDownEvents: { players: 0, monsters: 0 },
    actionsUsed: { players: 0, monsters: 0 },
    wastedActions: { players: 0, monsters: 0 },
    actorsDefeatedBeforeActing: { players: 0, monsters: 0 },
    activeEnemiesByRound: [],
    roleContribution: {},
  };
}

export function collectUnsupportedSummary(actors: CombatActor[]): UnsupportedPowerSummary {
  const reasons = actors.flatMap((actor) => actor.unsupportedPowers);
  const names = Array.from(new Set(reasons.map((reason) => reason.powerName)));
  return {
    unsupportedPowerCount: names.length,
    unsupportedPowerNames: names,
    unsupportedEffectCount: reasons.length,
    reasons,
  };
}
