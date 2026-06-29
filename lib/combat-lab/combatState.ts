import type {
  CombatAction,
  CombatActor,
  CombatAggregateMetrics,
  CombatActionLane,
  CombatAssistDiagnostics,
  CombatCooldownTrace,
  CombatDefensivePoolMetrics,
  CombatDefensivePoolSideTotals,
  CombatDefeatModel,
  CombatInjuryChannel,
  CombatMajorInjuryDiagnostics,
  CombatMajorInjuryOutcome,
  CombatOngoingPressureMetrics,
  CombatOngoingPressureSideTotals,
  CombatSide,
  CombatState,
  CombatTranscriptEvent,
  UnsupportedPowerSummary,
} from "./types";

const MAX_TRANSCRIPT_LINES = 1200;
const MAJOR_INJURIES_TO_DEFEAT = 3;

type DefeatProcessingContext = {
  sourceActorId?: string | null;
  sourceActionId?: string | null;
  sourceActionName?: string | null;
  triggerId?: string | null;
  lane?: CombatActionLane;
};

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
    durationKind: action.durationKind,
    durationSource: action.durationSource,
    passiveDuration: action.passiveDuration,
    cooldownActionId: action.cooldownActionId,
    source: action.source ? { ...action.source } : undefined,
  };
}

function cloneDefensivePool(pool: CombatState["defensivePools"][number]) {
  return { ...pool };
}

function defaultDefeatModel(actor: Pick<CombatActor, "side"> & { defeatModel?: CombatDefeatModel }): CombatDefeatModel {
  return actor.defeatModel ?? (actor.side === "players" ? "PLAYER_CHARACTER" : "NORMAL_MONSTER");
}

function normalizeActorRuntimeState(actor: CombatActor): CombatActor {
  return {
    ...actor,
    defeatModel: defaultDefeatModel(actor),
    physicalMajorInjuries: actor.physicalMajorInjuries ?? 0,
    mentalMajorInjuries: actor.mentalMajorInjuries ?? 0,
    physicalMinorInjuries: actor.physicalMinorInjuries ?? 0,
    mentalMinorInjuries: actor.mentalMinorInjuries ?? 0,
    physicalInjuryResolvedAtZero: actor.physicalInjuryResolvedAtZero ?? false,
    mentalInjuryResolvedAtZero: actor.mentalInjuryResolvedAtZero ?? false,
    forcedMajorInjuryOutcomes: actor.forcedMajorInjuryOutcomes
      ? {
          PHYSICAL: actor.forcedMajorInjuryOutcomes.PHYSICAL ? [...actor.forcedMajorInjuryOutcomes.PHYSICAL] : undefined,
          MENTAL: actor.forcedMajorInjuryOutcomes.MENTAL ? [...actor.forcedMajorInjuryOutcomes.MENTAL] : undefined,
        }
      : undefined,
  };
}

export function cloneActor(actor: CombatActor): CombatActor {
  return normalizeActorRuntimeState({
    ...actor,
    attributes: { ...actor.attributes },
    attributeDice: { ...actor.attributeDice },
    resist: { ...actor.resist },
    actions: actor.actions.map(cloneAction),
    vrp: actor.vrp?.map((entry) => ({ ...entry })),
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
  });
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
      physicalInjuryResolvedAtZero: false,
      mentalInjuryResolvedAtZero: false,
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
    physicalInjuryResolvedAtZero: false,
    mentalInjuryResolvedAtZero: false,
  }));
  return {
    round: 1,
    actors,
    cooldowns: {},
    currentTurnActorId: null,
    cooldownTrace: {},
    counterCandidateDiagnostics: {},
    counterUses: {},
    assistDeclarations: [],
    assistPressures: [],
    pendingMajorInjuryEvents: [],
    incomingActionsByTargetThisRound: {},
    responsesRemaining: Object.fromEntries(actors.filter((actor) => !actor.defeated).map((actor) => [actor.id, 2])),
    defenceDegradation: {},
    statusEffects: [],
    defensivePools: [],
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

function usesMajorInjuryFlow(actor: CombatActor): boolean {
  return actor.defeatModel === "PLAYER_CHARACTER" || actor.defeatModel === "LEGENDARY_MONSTER";
}

function injuryCount(actor: CombatActor, channel: CombatInjuryChannel): number {
  return channel === "PHYSICAL" ? actor.physicalMajorInjuries : actor.mentalMajorInjuries;
}

function minorInjuryCount(actor: CombatActor, channel: CombatInjuryChannel): number {
  return channel === "PHYSICAL" ? actor.physicalMinorInjuries : actor.mentalMinorInjuries;
}

function setMajorInjuryCount(actor: CombatActor, channel: CombatInjuryChannel, value: number) {
  if (channel === "PHYSICAL") {
    actor.physicalMajorInjuries = value;
  } else {
    actor.mentalMajorInjuries = value;
  }
}

function setMinorInjuryCount(actor: CombatActor, channel: CombatInjuryChannel, value: number) {
  if (channel === "PHYSICAL") {
    actor.physicalMinorInjuries = value;
  } else {
    actor.mentalMinorInjuries = value;
  }
}

function injuryResolvedAtZero(actor: CombatActor, channel: CombatInjuryChannel): boolean {
  return channel === "PHYSICAL" ? actor.physicalInjuryResolvedAtZero : actor.mentalInjuryResolvedAtZero;
}

function setInjuryResolvedAtZero(actor: CombatActor, channel: CombatInjuryChannel, value: boolean) {
  if (channel === "PHYSICAL") {
    actor.physicalInjuryResolvedAtZero = value;
  } else {
    actor.mentalInjuryResolvedAtZero = value;
  }
}

function hpCurrentForInjuryChannel(actor: CombatActor, channel: CombatInjuryChannel): number {
  return channel === "PHYSICAL" ? actor.physicalHpCurrent : actor.mentalHpCurrent;
}

function forcedInjuryOutcome(actor: CombatActor, channel: CombatInjuryChannel): CombatMajorInjuryOutcome {
  const queue = actor.forcedMajorInjuryOutcomes?.[channel];
  return queue && queue.length > 0 ? queue.shift() ?? "MAJOR_INJURY" : "MAJOR_INJURY";
}

function processMajorInjuryEvent(
  state: CombatState,
  actor: CombatActor,
  channel: CombatInjuryChannel,
  context: DefeatProcessingContext,
): boolean {
  const hpCurrent = hpCurrentForInjuryChannel(actor, channel);
  const overflow = Math.max(0, -hpCurrent);
  const severityModifier = -Math.floor(overflow / Math.max(1, actor.level));
  const forcedOutcome = forcedInjuryOutcome(actor, channel);
  const event = {
    id: `${state.round}:${actor.id}:${channel}:${state.pendingMajorInjuryEvents.length + 1}`,
    actorId: actor.id,
    actorName: actor.name,
    channel,
    overflow,
    severityModifier,
    sourceActorId: context.sourceActorId ?? null,
    sourceActionId: context.sourceActionId ?? null,
    sourceActionName: context.sourceActionName ?? null,
    triggerId: context.triggerId ?? null,
    forcedOutcome,
    blazeAvailable: true,
    blazeDeclared: false,
    status: "resolved" as const,
  };
  state.pendingMajorInjuryEvents.push(event);
  setInjuryResolvedAtZero(actor, channel, true);

  if (forcedOutcome === "MAJOR_INJURY") {
    const nextCount = injuryCount(actor, channel) + 1;
    setMajorInjuryCount(actor, channel, nextCount);
    emitTranscriptEvent(state, {
      type: "majorInjury",
      actorId: actor.id,
      actorName: actor.name,
      actionId: context.sourceActionId ?? undefined,
      actionName: context.sourceActionName ?? undefined,
      lane: context.lane,
      message:
        `Major Injury: ${actor.name} suffers a ${channel === "PHYSICAL" ? "Physical" : "Mental"} Major Injury ` +
        `(${nextCount}/${MAJOR_INJURIES_TO_DEFEAT}). Severity modifier ${severityModifier}. Blaze available but not used by auto-sim.`,
      details: event,
    });
    return nextCount >= MAJOR_INJURIES_TO_DEFEAT;
  }

  if (forcedOutcome === "MINOR_INJURY") {
    const nextCount = minorInjuryCount(actor, channel) + 1;
    setMinorInjuryCount(actor, channel, nextCount);
    emitTranscriptEvent(state, {
      type: "majorInjury",
      actorId: actor.id,
      actorName: actor.name,
      actionId: context.sourceActionId ?? undefined,
      actionName: context.sourceActionName ?? undefined,
      lane: context.lane,
      message:
        `Minor Injury: ${actor.name} suffers a ${channel === "PHYSICAL" ? "Physical" : "Mental"} Minor Injury ` +
        `(${nextCount} total). Severity modifier ${severityModifier}. Blaze available but not used by auto-sim.`,
      details: event,
    });
    return false;
  }

  emitTranscriptEvent(state, {
    type: "majorInjury",
    actorId: actor.id,
    actorName: actor.name,
    actionId: context.sourceActionId ?? undefined,
    actionName: context.sourceActionName ?? undefined,
    lane: context.lane,
    message:
      `No Injury: ${actor.name} avoids a ${channel === "PHYSICAL" ? "Physical" : "Mental"} injury. ` +
      `Severity modifier ${severityModifier}. Blaze available but not used by auto-sim.`,
    details: event,
  });
  return false;
}

export function markDefeatedActors(state: CombatState, context: DefeatProcessingContext = {}): string[] {
  const defeated: string[] = [];
  for (const actor of state.actors) {
    if (actor.defeated) continue;
    let shouldDefeat = false;
    if (actor.physicalHpCurrent <= 0 || actor.mentalHpCurrent <= 0) {
      if (usesMajorInjuryFlow(actor)) {
        const pendingChannels: CombatInjuryChannel[] = [];
        if (actor.mentalHpCurrent <= 0 && !injuryResolvedAtZero(actor, "MENTAL")) pendingChannels.push("MENTAL");
        if (actor.physicalHpCurrent <= 0 && !injuryResolvedAtZero(actor, "PHYSICAL")) pendingChannels.push("PHYSICAL");
        for (const channel of pendingChannels) {
          shouldDefeat = processMajorInjuryEvent(state, actor, channel, context) || shouldDefeat;
        }
      } else {
        shouldDefeat = true;
      }
    }
    if (shouldDefeat) {
      actor.defeated = true;
      defeated.push(actor.id);
      emitTranscriptEvent(state, {
        type: "actorDefeated",
        actorId: actor.id,
        actorName: actor.name,
        actionId: context.sourceActionId ?? undefined,
        actionName: context.sourceActionName ?? undefined,
        lane: context.lane,
        message: `Defeat: ${actor.name} is defeated.`,
        details: {
          physicalHpCurrent: actor.physicalHpCurrent,
          mentalHpCurrent: actor.mentalHpCurrent,
          physicalMajorInjuries: actor.physicalMajorInjuries,
          mentalMajorInjuries: actor.mentalMajorInjuries,
          defeatModel: actor.defeatModel,
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
  const beforePoolCount = state.defensivePools.length;
  state.defensivePools = state.defensivePools.filter(
    (pool) => pool.protectedActorId !== actor.id && pool.sourceActorId !== actor.id,
  );
  const clearedPools = beforePoolCount - state.defensivePools.length;

  emitTranscriptEvent(state, {
    type: "defeatCleanup",
    actorId: actor.id,
    actorName: actor.name,
    message:
      `Defeat cleanup: ${actor.name} leaves active combat; cleared ${clearedCooldowns} cooldown${clearedCooldowns === 1 ? "" : "s"} and ${clearedStatuses} active status${clearedStatuses === 1 ? "" : "es"}.` +
      (clearedPools > 0 ? ` Cleared ${clearedPools} defensive pool${clearedPools === 1 ? "" : "s"}.` : "") +
      (hadResponses ? " Cleared refreshed responses." : ""),
    details: {
      clearedCooldowns,
      clearedStatuses,
      clearedDefensivePools: clearedPools,
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

function applyPassiveStatusRemovalCooldown(state: CombatState, effect: CombatState["statusEffects"][number]) {
  if (!effect.passiveDuration) return;
  const sourceActor = state.actors.find((actor) => actor.id === effect.sourceActorId);
  if (!sourceActor || sourceActor.defeated) return;
  const cooldownActionId = effect.sourceCooldownActionId ?? effect.sourceActionId;
  if (!cooldownActionId) return;
  const sourceAction = sourceActor.actions.find((action) => action.id === cooldownActionId);
  if (!sourceAction || sourceAction.cooldownRounds <= 0) return;
  if (isActionOnCooldown(state, sourceActor.id, sourceAction.id)) return;
  applyActionCooldown(state, sourceActor, sourceAction);
}

export function removeStatusEffectById(state: CombatState, effectId: string): boolean {
  const effect = state.statusEffects.find((entry) => entry.id === effectId);
  if (!effect) return false;
  const linkedPassiveEffects = effect.passiveDuration
    ? state.statusEffects.filter(
        (entry) =>
          entry.passiveDuration &&
          entry.sourceActorId === effect.sourceActorId &&
          entry.targetActorId === effect.targetActorId &&
          (entry.sourceCooldownActionId ?? entry.sourceActionId) === (effect.sourceCooldownActionId ?? effect.sourceActionId),
      )
    : [effect];
  const linkedIds = new Set(linkedPassiveEffects.map((entry) => entry.id));
  state.statusEffects = state.statusEffects.filter((entry) => !linkedIds.has(entry.id));
  state.defensivePools = state.defensivePools.filter(
    (pool) =>
      !linkedPassiveEffects.some((entry) => {
        if (entry.sourceActorId !== pool.sourceActorId || entry.targetActorId !== pool.protectedActorId) {
          return false;
        }
        const effectActionId = entry.sourceActionId;
        const effectCooldownActionId = entry.sourceCooldownActionId;
        return (
          (Boolean(effectActionId) && pool.sourceActionId === effectActionId) ||
          (Boolean(effectCooldownActionId) && pool.sourceActionId === effectCooldownActionId)
        );
      }),
  );
  for (const removed of linkedPassiveEffects) {
    applyPassiveStatusRemovalCooldown(state, removed);
  }
  return true;
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
      if (effect.passiveDuration) return effect;
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

export function tickTargetDefensivePools(state: CombatState, actorId: string): CombatState["defensivePools"] {
  const actor = state.actors.find((entry) => entry.id === actorId);
  const expired: CombatState["defensivePools"] = [];
  state.defensivePools = state.defensivePools
    .map((pool) => {
      if (pool.protectedActorId !== actorId || pool.durationKind === "passive") return pool;
      if (pool.createdRound === state.round && pool.createdTurnActorId === actorId) {
        emitTranscriptEvent(state, {
          type: "defensivePool",
          actorId,
          actorName: actor?.name,
          actionId: pool.sourceActionId,
          actionName: pool.sourceActionName,
          lane: "endOfTurn",
          message: `End of Turn: ${pool.sourceActionName} ${pool.poolType} pool on ${actor?.name ?? pool.protectedActorName} does not tick on its creation turn; ${pool.remainingRounds} turn${pool.remainingRounds === 1 ? "" : "s"} remain.`,
          details: {
            poolType: pool.poolType,
            remainingDurationRounds: pool.remainingRounds,
            remainingPoints: pool.remainingPoints,
            creationTurnTickSkipped: true,
          },
        });
        return pool;
      }
      const previous = pool.remainingRounds;
      const remainingRounds = previous - 1;
      emitTranscriptEvent(state, {
        type: "defensivePool",
        actorId,
        actorName: actor?.name,
        actionId: pool.sourceActionId,
        actionName: pool.sourceActionName,
        lane: "endOfTurn",
        message:
          remainingRounds <= 0
            ? `End of Turn: ${pool.sourceActionName} ${pool.poolType} pool on ${actor?.name ?? pool.protectedActorName} expires with ${pool.remainingPoints} point${pool.remainingPoints === 1 ? "" : "s"} remaining.`
            : `End of Turn: ${pool.sourceActionName} ${pool.poolType} pool on ${actor?.name ?? pool.protectedActorName} duration ticks down from ${previous} to ${remainingRounds}; ${pool.remainingPoints} point${pool.remainingPoints === 1 ? "" : "s"} remain.`,
        details: {
          poolType: pool.poolType,
          previousDurationRounds: previous,
          remainingDurationRounds: Math.max(0, remainingRounds),
          remainingPoints: pool.remainingPoints,
          expired: remainingRounds <= 0,
        },
      });
      return { ...pool, remainingRounds };
    })
    .filter((pool) => {
      const keep = pool.remainingRounds > 0 && pool.remainingPoints > 0;
      if (!keep) expired.push(cloneDefensivePool(pool));
      return keep;
    });
  return expired;
}

export function decrementRoundEffects(state: CombatState) {
  state.statusEffects = state.statusEffects
    .map((effect) => effect.passiveDuration ? effect : { ...effect, remainingRounds: effect.remainingRounds - 1 })
    .filter((effect) => effect.remainingRounds > 0);
}

export function getAttributeModifier(state: CombatState, actorId: string, attribute: string): number {
  return state.statusEffects
    .filter((effect) =>
      effect.targetActorId === actorId &&
      effect.attribute === attribute &&
      effect.modifiesRollResults !== false
    )
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

export function createEmptyOngoingPressureSideTotals(): CombatOngoingPressureSideTotals {
  return {
    statusesCreated: 0,
    storedTickTotal: 0,
    storedTickMax: 0,
    firstTicksApplied: 0,
    firstTickDamageTotal: 0,
    firstTickLethal: 0,
    firstTickBeforeCleanup: 0,
    ticksAppliedTotal: 0,
    totalOngoingDamage: 0,
    cleanupAttempts: 0,
    cleanupSuccesses: 0,
    cleanupUnitsRemoved: 0,
    cleanupWoundsRemoved: 0,
    cleanupRemainingTicksTotal: 0,
    cleanupStoredTickRemovedTotal: 0,
    cleanupPreventedWoundsEstimate: 0,
  };
}

export function createEmptyOngoingPressureMetrics(): CombatOngoingPressureMetrics {
  return {
    bySourceSide: {
      players: createEmptyOngoingPressureSideTotals(),
      monsters: createEmptyOngoingPressureSideTotals(),
    },
    bySourceAction: {},
  };
}

export function createEmptyDefensivePoolSideTotals(): CombatDefensivePoolSideTotals {
  return {
    poolsCreated: 0,
    generatedPoints: 0,
    refreshReplaceEvents: 0,
    committedPoints: 0,
    spentPoints: 0,
    wastedPoints: 0,
    remainingAtExpiry: 0,
    expiredEmpty: 0,
    expiredDuration: 0,
    expiredFieldExit: 0,
    expiredAttachmentEnd: 0,
    expiredChannelEnd: 0,
    expiredCleanse: 0,
    expiredDefeatCleanup: 0,
    dodgeAvoids: 0,
    blockWoundsPrevented: 0,
    resistUnitsCancelled: 0,
  };
}

export function createEmptyDefensivePoolMetrics(): CombatDefensivePoolMetrics {
  return {
    bySourceSide: {
      players: createEmptyDefensivePoolSideTotals(),
      monsters: createEmptyDefensivePoolSideTotals(),
    },
    bySourceAction: {},
  };
}

export function createEmptyMajorInjuryDiagnostics(): CombatMajorInjuryDiagnostics {
  return {
    majorInjuryEvents: 0,
    minorInjuryEvents: 0,
    noInjuryEvents: 0,
    physicalMajorInjuries: 0,
    mentalMajorInjuries: 0,
    physicalMinorInjuries: 0,
    mentalMinorInjuries: 0,
    blazeAvailable: 0,
    blazeDeclared: 0,
    injuryDefeats: 0,
    normalMonsterDefeats: 0,
    playerCharacterInjuryFlowCount: 0,
    legendaryMonsterInjuryFlowCount: 0,
    pendingInjuryEventsResolved: 0,
    noAutoBlazeEvents: 0,
  };
}

export function createEmptyAssistDiagnostics(): CombatAssistDiagnostics {
  return {
    assistDeclared: 0,
    assistRejected: 0,
    assistPressureGenerated: 0,
    assistPressureSpent: 0,
    assistPressureWasted: 0,
    assistDuplicateIntentRejected: 0,
    assistResponseSpent: 0,
    assistIndependentDamageApplied: 0,
    assistPressureByLane: {},
    assistPressureByIntention: {},
  };
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
    assistDeclared: { players: 0, monsters: 0 },
    assistRejected: { players: 0, monsters: 0 },
    assistPressureGenerated: { players: 0, monsters: 0 },
    assistPressureSpent: { players: 0, monsters: 0 },
    assistPressureWasted: { players: 0, monsters: 0 },
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
    counterCandidateDiagnostics: {},
    ongoingPressure: createEmptyOngoingPressureMetrics(),
    defensivePools: createEmptyDefensivePoolMetrics(),
    majorInjuryDiagnostics: createEmptyMajorInjuryDiagnostics(),
    assistDiagnostics: createEmptyAssistDiagnostics(),
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
