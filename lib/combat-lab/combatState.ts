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
      ignoredTraits: [...(actor.hydration.ignoredTraits ?? [])],
      unsupportedCombatTraits: [...(actor.hydration.unsupportedCombatTraits ?? [])],
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
    counterUses: {},
    responsesRemaining: {},
    defenceDegradation: {},
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

export function resetRoundDefenceDegradation(state: CombatState) {
  state.defenceDegradation = {};
}

export function refreshActorResponses(state: CombatState, actorId: string) {
  state.responsesRemaining[actorId] = 2;
}

export function spendActorResponse(state: CombatState, actorId: string): boolean {
  const remaining = state.responsesRemaining[actorId] ?? 0;
  if (remaining <= 0) return false;
  state.responsesRemaining[actorId] = remaining - 1;
  return true;
}

export function tickActorCooldowns(state: CombatState, actorId: string) {
  for (const key of Object.keys(state.cooldowns)) {
    if (!key.startsWith(`${actorId}:`)) continue;
    state.cooldowns[key] = Math.max(0, state.cooldowns[key] - 1);
    if (state.cooldowns[key] === 0) delete state.cooldowns[key];
  }
}

export function tickTargetTurnEffects(state: CombatState, actorId: string): number {
  let expired = 0;
  state.statusEffects = state.statusEffects
    .map((effect) =>
      effect.targetActorId === actorId ? { ...effect, remainingRounds: effect.remainingRounds - 1 } : effect,
    )
    .filter((effect) => {
      const keep = effect.remainingRounds > 0;
      if (!keep) expired += 1;
      return keep;
    });
  return expired;
}

export function decrementRoundEffects(state: CombatState) {
  state.statusEffects = state.statusEffects
    .map((effect) => ({ ...effect, remainingRounds: effect.remainingRounds - 1 }))
    .filter((effect) => effect.remainingRounds > 0);
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
    dodgeRolls: { players: 0, monsters: 0 },
    dodgeChosen: { players: 0, monsters: 0 },
    dodgeDegradationApplied: { players: 0, monsters: 0 },
    physicalDefenceRolls: { players: 0, monsters: 0 },
    physicalDefenceChosen: { players: 0, monsters: 0 },
    physicalDefenceDegradationApplied: { players: 0, monsters: 0 },
    mentalDefenceRolls: { players: 0, monsters: 0 },
    mentalDefenceChosen: { players: 0, monsters: 0 },
    mentalDefenceDegradationApplied: { players: 0, monsters: 0 },
    defenceChoiceExpectedValue: { players: 0, monsters: 0 },
    degradedDefenceRolls: { players: 0, monsters: 0 },
    defenceStringBlocked: { players: 0, monsters: 0 },
    staticProtectionPrevented: { players: 0, monsters: 0 },
    resistCancelled: { players: 0, monsters: 0 },
    resistRolls: { players: 0, monsters: 0 },
    resistSuccesses: { players: 0, monsters: 0 },
    hostileSuccessesCancelledByResist: { players: 0, monsters: 0 },
    overkill: { players: 0, monsters: 0 },
    oneRoundDownEvents: { players: 0, monsters: 0 },
    actionsUsed: { players: 0, monsters: 0 },
    wastedActions: { players: 0, monsters: 0 },
    actorsDefeatedBeforeActing: { players: 0, monsters: 0 },
    activeEnemiesByRound: [],
    roleContribution: {},
    controlTurnsApplied: { players: 0, monsters: 0 },
    actionsDenied: { players: 0, monsters: 0 },
    forcedMovementApplied: { players: 0, monsters: 0 },
    buffApplications: { players: 0, monsters: 0 },
    buffUptime: { players: 0, monsters: 0 },
    buffedActions: { players: 0, monsters: 0 },
    debuffApplications: { players: 0, monsters: 0 },
    debuffUptime: { players: 0, monsters: 0 },
    debuffedActions: { players: 0, monsters: 0 },
    healingOverTimeApplied: { players: 0, monsters: 0 },
    healingTicks: { players: 0, monsters: 0 },
    ongoingDamageApplied: { players: 0, monsters: 0 },
    ongoingDamageUnitsApplied: { players: 0, monsters: 0 },
    ongoingDamageTicks: { players: 0, monsters: 0 },
    ongoingDamagePreventedOrCleansed: { players: 0, monsters: 0 },
    counterUses: { players: 0, monsters: 0 },
    counterChosen: { players: 0, monsters: 0 },
    counterDamage: { players: 0, monsters: 0 },
    counterMitigation: { players: 0, monsters: 0 },
    responsesUsed: { players: 0, monsters: 0 },
    responsesWastedOrUnavailable: { players: 0, monsters: 0 },
    passiveDefenceContribution: { players: 0, monsters: 0 },
    stacksApplied: { players: 0, monsters: 0 },
    stacksExpired: { players: 0, monsters: 0 },
    stacksCleansed: { players: 0, monsters: 0 },
    aoePotentialTargets: { players: 0, monsters: 0 },
    aoeActualTargets: { players: 0, monsters: 0 },
    positionalAbstractionsUsed: { players: 0, monsters: 0 },
    actorContributions: {},
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
