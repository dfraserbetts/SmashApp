import type {
  CombatAction,
  CombatActor,
  CombatAggregateMetrics,
  CombatCooldownTrace,
  CombatSide,
  CombatState,
  CombatTranscriptEvent,
  UnsupportedPowerSummary,
} from "./types";

const MAX_TRANSCRIPT_LINES = 1200;

function cloneAction(action: CombatAction): CombatAction {
  return {
    ...action,
    unsupportedReasons: [...action.unsupportedReasons],
    damageTypes: action.damageTypes ? [...action.damageTypes] : undefined,
    secondaryActions: action.secondaryActions?.map(cloneAction),
    abstractionNotes: action.abstractionNotes ? [...action.abstractionNotes] : undefined,
    durationRounds: action.durationRounds,
    modifier: action.modifier ? { ...action.modifier } : undefined,
    control: action.control ? { ...action.control } : undefined,
    recurring: action.recurring ? { ...action.recurring } : undefined,
    damageApplicationTiming: action.damageApplicationTiming,
    source: action.source ? { ...action.source } : undefined,
  };
}

export function cloneActor(actor: CombatActor): CombatActor {
  return {
    ...actor,
    attributes: { ...actor.attributes },
    attributeDice: { ...actor.attributeDice },
    resist: { ...actor.resist },
    actions: actor.actions.map(cloneAction),
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

export function createActorInstances(actor: CombatActor, quantity: number): CombatActor[] {
  return Array.from({ length: Math.max(1, Math.trunc(quantity)) }, (_, index) => {
    const instanceIndex = index + 1;
    const clone = cloneActor(actor);
    return {
      ...clone,
      id: quantity === 1 ? actor.id : `${actor.id}:instance:${instanceIndex}`,
      baseActorId: actor.baseActorId ?? actor.id,
      instanceIndex,
      displayGroupName: actor.displayGroupName ?? actor.name,
      name: quantity === 1 ? actor.name : `${actor.name} #${instanceIndex}`,
      defeated: false,
      physicalHpCurrent: actor.physicalHpMax,
      mentalHpCurrent: actor.mentalHpMax,
    };
  });
}

export function createCombatState(
  players: CombatActor[],
  monsters: CombatActor[],
  options: { captureTranscript?: boolean } = {},
): CombatState {
  const actors = [...players, ...monsters].map((actor) => ({
    ...cloneActor(actor),
    defeated: false,
    physicalHpCurrent: actor.physicalHpMax,
    mentalHpCurrent: actor.mentalHpMax,
  }));
  return {
    round: 1,
    actors,
    cooldowns: {},
    currentTurnActorId: null,
    cooldownTrace: {},
    counterUses: {},
    incomingActionsByTargetThisRound: {},
    responsesRemaining: Object.fromEntries(actors.filter((actor) => !actor.defeated).map((actor) => [actor.id, 2])),
    defenceDegradation: {},
    statusEffects: [],
    captureTranscript: Boolean(options.captureTranscript),
    transcriptEvents: [],
    transcriptLines: [],
    transcriptTruncated: false,
    transcriptEventSeq: 0,
    log: [],
  };
}

export function emitCombatStartResponses(state: CombatState) {
  for (const actor of state.actors) {
    if (actor.defeated) continue;
    const responsesRemaining = state.responsesRemaining[actor.id] ?? 0;
    emitTranscriptEvent(state, {
      type: "responsesRefresh",
      actorId: actor.id,
      actorName: actor.name,
      lane: "combatStart",
      message: `Combat start: ${actor.name} starts with ${responsesRemaining} responses.`,
      details: { responsesRemaining },
    });
  }
}

export function emitTranscriptEvent(
  state: CombatState,
  event: Omit<CombatTranscriptEvent, "id" | "round"> & { round?: number },
) {
  if (!state.captureTranscript) return;
  if (state.transcriptLines.length >= MAX_TRANSCRIPT_LINES) {
    if (!state.transcriptTruncated) {
      state.transcriptTruncated = true;
      const truncatedEvent: CombatTranscriptEvent = {
        id: `transcript-${state.transcriptEventSeq + 1}`,
        type: "roundEnd",
        round: state.round,
        message: `Transcript truncated after ${MAX_TRANSCRIPT_LINES} lines.`,
      };
      state.transcriptEventSeq += 1;
      state.transcriptEvents.push(truncatedEvent);
      state.transcriptLines.push(truncatedEvent.message);
    }
    return;
  }

  state.transcriptEventSeq += 1;
  const entry: CombatTranscriptEvent = {
    ...event,
    id: `transcript-${state.transcriptEventSeq}`,
    round: event.round ?? state.round,
  };
  state.transcriptEvents.push(entry);
  state.transcriptLines.push(entry.message);
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
      emitTranscriptEvent(state, {
        type: "actorDefeated",
        actorId: actor.id,
        actorName: actor.name,
        message: `Defeat: ${actor.name} is defeated.`,
        details: {
          physicalHpCurrent: actor.physicalHpCurrent,
          mentalHpCurrent: actor.mentalHpCurrent,
        },
      });
      cleanupDefeatedActorRuntime(state, actor);
    }
  }
  return defeated;
}

function cleanupDefeatedActorRuntime(state: CombatState, actor: CombatActor) {
  let clearedCooldowns = 0;
  for (const key of Object.keys(state.cooldowns)) {
    if (!key.startsWith(`${actor.id}:`)) continue;
    delete state.cooldowns[key];
    clearedCooldowns += 1;
  }

  const hadResponses = Object.prototype.hasOwnProperty.call(state.responsesRemaining, actor.id);
  delete state.responsesRemaining[actor.id];
  delete state.defenceDegradation[actor.id];
  delete state.incomingActionsByTargetThisRound[actor.id];

  const beforeStatusCount = state.statusEffects.length;
  state.statusEffects = state.statusEffects.filter(
    (effect) => effect.targetActorId !== actor.id && effect.sourceActorId !== actor.id,
  );
  const clearedStatuses = beforeStatusCount - state.statusEffects.length;

  emitTranscriptEvent(state, {
    type: "defeatCleanup",
    actorId: actor.id,
    actorName: actor.name,
    message:
      `Defeat cleanup: ${actor.name} leaves active combat; cleared ${clearedCooldowns} cooldown${clearedCooldowns === 1 ? "" : "s"} and ${clearedStatuses} active status${clearedStatuses === 1 ? "" : "es"}.` +
      (hadResponses ? " Cleared refreshed responses." : ""),
    details: {
      clearedCooldowns,
      clearedStatuses,
      clearedResponses: hadResponses ? 1 : 0,
      sourceOwnedEffectsEndOnDefeat: true,
    },
  });
}

export function resetRoundDefenceDegradation(state: CombatState) {
  state.defenceDegradation = {};
}

export function resetRoundTargetingPressure(state: CombatState) {
  state.incomingActionsByTargetThisRound = {};
}

export function recordIncomingActionPressure(state: CombatState, targetId: string) {
  state.incomingActionsByTargetThisRound[targetId] = (state.incomingActionsByTargetThisRound[targetId] ?? 0) + 1;
}

export function refreshActorResponses(state: CombatState, actorId: string) {
  const actor = state.actors.find((entry) => entry.id === actorId);
  if (actor?.defeated) return;
  state.responsesRemaining[actorId] = 2;
  emitTranscriptEvent(state, {
    type: "responsesRefresh",
    actorId,
    actorName: actor?.name,
    lane: "startOfTurn",
    message: `Responses: ${actor?.name ?? actorId} refreshes to 2 responses.`,
    details: { responsesRemaining: 2 },
  });
}

export function spendActorResponse(state: CombatState, actorId: string): boolean {
  const actor = state.actors.find((entry) => entry.id === actorId);
  if (actor?.defeated) return false;
  const remaining = state.responsesRemaining[actorId] ?? 0;
  if (remaining <= 0) return false;
  state.responsesRemaining[actorId] = remaining - 1;
  emitTranscriptEvent(state, {
    type: "responseAction",
    actorId,
    actorName: actor?.name,
    lane: "response",
    message: `Response spent: ${actor?.name ?? actorId} spends 1 response (${state.responsesRemaining[actorId]} remaining).`,
    details: { responsesRemaining: state.responsesRemaining[actorId] },
  });
  return true;
}

export function cooldownKey(actorId: string, actionId: string) {
  return `${actorId}:${actionId}`;
}

function ensureCooldownTrace(state: CombatState, actor: CombatActor, action: CombatAction): CombatCooldownTrace {
  const key = cooldownKey(actor.id, action.id);
  return state.cooldownTrace[key] ??= {
    actorId: actor.id,
    actorName: actor.name,
    side: actor.side,
    actionId: action.id,
    actionName: action.name,
    sourceType: action.sourceType,
    isCounter: Boolean(action.counterMode),
    cooldownRounds: action.cooldownRounds,
    uses: 0,
    attemptedUsesWhileOnCooldown: 0,
    preventedByCooldown: 0,
    cooldownApplied: 0,
    cooldownTicks: 0,
    availableTurns: 0,
    unavailableTurns: 0,
  };
}

export function getActionCooldownRemaining(state: CombatState, actorId: string, actionId: string) {
  return state.cooldowns[cooldownKey(actorId, actionId)]?.remaining ?? 0;
}

export function isActionOnCooldown(state: CombatState, actorId: string, actionId: string) {
  return getActionCooldownRemaining(state, actorId, actionId) > 0;
}

export function recordActionUse(state: CombatState, actor: CombatActor, action: CombatAction) {
  if (action.cooldownRounds <= 0 && !action.counterMode) return;
  ensureCooldownTrace(state, actor, action).uses += 1;
}

export function recordCooldownPreventedUse(state: CombatState, actor: CombatActor, action: CombatAction) {
  const trace = ensureCooldownTrace(state, actor, action);
  trace.attemptedUsesWhileOnCooldown += 1;
  trace.preventedByCooldown += 1;
}

export function applyActionCooldown(state: CombatState, actor: CombatActor, action: CombatAction) {
  if (action.cooldownRounds <= 0) return;
  const appliedTurnActorId = state.currentTurnActorId ?? null;
  state.cooldowns[cooldownKey(actor.id, action.id)] = {
    remaining: action.cooldownRounds,
    appliedRound: state.round,
    appliedTurnActorId,
    appliedOnOwnerTurn: appliedTurnActorId === actor.id,
  };
  ensureCooldownTrace(state, actor, action).cooldownApplied += 1;
  emitTranscriptEvent(state, {
    type: "cooldownApplied",
    actorId: actor.id,
    actorName: actor.name,
    actionId: action.id,
    actionName: action.name,
    lane: action.counterMode ? "response" : undefined,
    message: `Cooldown: ${action.name} enters cooldown ${action.cooldownRounds}.`,
    details: { cooldownRounds: action.cooldownRounds },
  });
}

export function sampleActorCooldownAvailability(state: CombatState, actor: CombatActor) {
  for (const action of actor.actions) {
    if (action.cooldownRounds <= 0) continue;
    const trace = ensureCooldownTrace(state, actor, action);
    if (isActionOnCooldown(state, actor.id, action.id)) {
      trace.unavailableTurns += 1;
    } else {
      trace.availableTurns += 1;
    }
  }
}

export function tickActorCooldowns(state: CombatState, actorId: string) {
  const actor = state.actors.find((entry) => entry.id === actorId);
  if (actor?.defeated) return;
  for (const key of Object.keys(state.cooldowns)) {
    if (!key.startsWith(`${actorId}:`)) continue;
    const entry = state.cooldowns[key];
    if (!entry) continue;
    const trace = state.cooldownTrace[key];

    if (
      entry.appliedOnOwnerTurn &&
      entry.appliedRound === state.round &&
      entry.appliedTurnActorId === actorId
    ) {
      if (trace) {
        emitTranscriptEvent(state, {
          type: "cooldownTicked",
          actorId: trace.actorId,
          actorName: trace.actorName,
          actionId: trace.actionId,
          actionName: trace.actionName,
          lane: "endOfTurn",
          message: `Cooldown tick skipped: ${trace.actionName} entered cooldown this turn.`,
          details: { remainingCooldown: entry.remaining },
        });
      }
      continue;
    }

    const previous = entry.remaining;
    entry.remaining = Math.max(0, entry.remaining - 1);
    if (previous > 0 && trace) {
      trace.cooldownTicks += 1;
      emitTranscriptEvent(state, {
        type: "cooldownTicked",
        actorId: trace.actorId,
        actorName: trace.actorName,
        actionId: trace.actionId,
        actionName: trace.actionName,
        lane: "endOfTurn",
        message: `Cooldown tick: ${trace.actionName} ${previous} -> ${entry.remaining}.`,
        details: { previousCooldown: previous, remainingCooldown: entry.remaining },
      });
    }
    if (entry.remaining === 0) {
      delete state.cooldowns[key];
      if (trace) {
        emitTranscriptEvent(state, {
          type: "cooldownTicked",
          actorId: trace.actorId,
          actorName: trace.actorName,
          actionId: trace.actionId,
          actionName: trace.actionName,
          lane: "endOfTurn",
          message: `Cooldown ready: ${trace.actionName} is ready next turn.`,
          details: { remainingCooldown: 0 },
        });
      }
    }
  }
}

export function tickTargetTurnEffects(state: CombatState, actorId: string): number {
  let expired = 0;
  const actor = state.actors.find((entry) => entry.id === actorId);
  state.statusEffects = state.statusEffects
    .map((effect) => {
      if (effect.targetActorId !== actorId) return effect;
      const previous = effect.remainingRounds;
      const remainingRounds = previous - 1;
      if (effect.kind === "mainActionDenied" && actor) {
        emitTranscriptEvent(state, {
          type: "stackChanged",
          actorId: actor.id,
          actorName: actor.name,
          actionId: effect.sourceActionId,
          actionName: effect.sourceActionName,
          lane: "endOfTurn",
          message:
            remainingRounds <= 0
              ? `End of Turn: Force No Main Action from ${effect.sourceActionName ?? "a control effect"} expires; removed ${effect.amount} remaining stack${effect.amount === 1 ? "" : "s"}.`
              : `End of Turn: Force No Main Action from ${effect.sourceActionName ?? "a control effect"} duration ticks down from ${previous} to ${remainingRounds}; ${effect.amount} stack${effect.amount === 1 ? "" : "s"} remain active.`,
          details: {
            effect: "mainActionDenied",
            previousDurationRounds: previous,
            remainingDurationRounds: Math.max(0, remainingRounds),
            removedStacks: remainingRounds <= 0 ? effect.amount : 0,
            remainingStacks: remainingRounds <= 0 ? 0 : effect.amount,
            expired: remainingRounds <= 0,
          },
        });
      }
      return { ...effect, remainingRounds };
    })
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
    mainActionsUsed: { players: 0, monsters: 0 },
    powerActionsUsed: { players: 0, monsters: 0 },
    secondWeaponAttacksUsed: { players: 0, monsters: 0 },
    skippedPowerActions: { players: 0, monsters: 0 },
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
    buffedDefenceRolls: { players: 0, monsters: 0 },
    buffedResistRolls: { players: 0, monsters: 0 },
    debuffApplications: { players: 0, monsters: 0 },
    debuffUptime: { players: 0, monsters: 0 },
    debuffedActions: { players: 0, monsters: 0 },
    debuffedDefenceRolls: { players: 0, monsters: 0 },
    debuffedResistRolls: { players: 0, monsters: 0 },
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
    aoeActionUses: { players: 0, monsters: 0 },
    aoePotentialTargets: { players: 0, monsters: 0 },
    aoeActualTargets: { players: 0, monsters: 0 },
    positionalAbstractionsUsed: { players: 0, monsters: 0 },
    actorContributions: {},
    defensiveContributions: {},
    cooldownTrace: {},
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
