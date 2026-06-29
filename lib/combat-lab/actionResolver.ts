import { diceSides, expectedSuccesses, rollDice, successCountForRoll, type Rng } from "./dice";
import {
  applyActionCooldown,
  emitTranscriptEvent,
  getAttributeModifier,
  getLivingActors,
  getOppositeSide,
  getProtectionModifier,
  isActionOnCooldown,
  markDefeatedActors,
  createEmptyDefensivePoolMetrics,
  createEmptyDefensivePoolSideTotals,
  createEmptyOngoingPressureMetrics,
  createEmptyOngoingPressureSideTotals,
  recordActionUse,
  recordCooldownPreventedUse,
  removeStatusEffectById,
  spendActorResponse,
} from "./combatState";
import type {
  CombatAction,
  CombatActionLane,
  CombatActor,
  CombatAttributeName,
  CombatAssistMode,
  CombatAssistPressureLane,
  CombatAssistTriggerType,
  CombatDefensivePool,
  CombatDefensivePoolActionMetrics,
  CombatDefensivePoolMetrics,
  CombatDefensivePoolSideTotals,
  CombatDefensivePoolType,
  CombatRollSummary,
  CombatResolutionMetrics,
  CombatOngoingPressureActionMetrics,
  CombatOngoingPressureMetrics,
  CombatOngoingPressureSideTotals,
  CombatState,
} from "./types";
import type { CoreAttribute, PowerIntention } from "@/lib/summoning/types";

const CORE_TO_COMBAT_ATTRIBUTE: Record<string, CombatAttributeName> = {
  ATTACK: "Attack",
  GUARD: "Guard",
  FORTITUDE: "Fortitude",
  INTELLECT: "Intellect",
  SYNERGY: "Synergy",
  BRAVERY: "Bravery",
};

const COMBAT_TO_CORE_ATTRIBUTE: Record<CombatAttributeName, keyof CombatActor["resist"]> = {
  Attack: "ATTACK",
  Guard: "GUARD",
  Fortitude: "FORTITUDE",
  Intellect: "INTELLECT",
  Synergy: "SYNERGY",
  Bravery: "BRAVERY",
};

export type ManualAssistDeclarationParams = {
  state: CombatState;
  assistingActor: CombatActor;
  triggeringAlly: CombatActor;
  triggeringAction: CombatAction;
  assistingAction: CombatAction;
  targetActor?: CombatActor | null;
  triggerId?: string;
  triggerType?: CombatAssistTriggerType;
  chosenAssistIntention?: PowerIntention;
  occupiedIntentions?: PowerIntention[];
  mode?: CombatAssistMode;
  pressureLane: CombatAssistPressureLane;
  resistedAttribute?: CoreAttribute | null;
  generatedPressure?: number;
  rng?: Rng;
};

function emptyResolution(): CombatResolutionMetrics {
  return {
    rawSuccesses: 0,
    rawWounds: 0,
    dodgeSuccesses: 0,
    dodgeRolls: 0,
    dodgeChosen: 0,
    dodgeDegradationApplied: 0,
    woundsAvoidedByDodge: 0,
    physicalDefenceRolls: 0,
    physicalDefenceChosen: 0,
    physicalDefenceDegradationApplied: 0,
    mentalDefenceRolls: 0,
    mentalDefenceChosen: 0,
    mentalDefenceDegradationApplied: 0,
    defenceChoiceExpectedValue: 0,
    degradedDefenceRolls: 0,
    defenceStringBlocked: 0,
    staticProtectionPrevented: 0,
    protectionPrevented: 0,
    resistCancelled: 0,
    resistRolls: 0,
    resistSuccesses: 0,
    hostileSuccessesBeforeResist: 0,
    hostileSuccessesAfterResist: 0,
    hostileSuccessesCancelledByResist: 0,
    netWounds: 0,
    healingDone: 0,
    mitigationApplied: 0,
    buffDebuffApplied: 0,
    overkill: 0,
    wastedActions: 0,
    controlTurnsApplied: 0,
    actionsDenied: 0,
    forcedMovementApplied: 0,
    buffApplications: 0,
    buffUptime: 0,
    buffedActions: 0,
    buffedDefenceRolls: 0,
    buffedResistRolls: 0,
    debuffApplications: 0,
    debuffUptime: 0,
    debuffedActions: 0,
    debuffedDefenceRolls: 0,
    debuffedResistRolls: 0,
    healingOverTimeApplied: 0,
    healingTicks: 0,
    ongoingDamageApplied: 0,
    ongoingDamageUnitsApplied: 0,
    ongoingDamageTicks: 0,
    ongoingDamagePreventedOrCleansed: 0,
    counterUses: 0,
    counterChosen: 0,
    counterDamage: 0,
    counterMitigation: 0,
    responsesUsed: 0,
    responsesWastedOrUnavailable: 0,
    assistDeclared: 0,
    assistRejected: 0,
    assistPressureGenerated: 0,
    assistPressureSpent: 0,
    assistPressureWasted: 0,
    passiveDefenceContribution: 0,
    stacksApplied: 0,
    stacksExpired: 0,
    stacksCleansed: 0,
    aoeActionUses: 0,
    aoePotentialTargets: 0,
    aoeActualTargets: 0,
    positionalAbstractionsUsed: 0,
    ongoingPressure: createEmptyOngoingPressureMetrics(),
    defensivePools: createEmptyDefensivePoolMetrics(),
  };
}

function assistTriggerId(params: {
  state: CombatState;
  triggeringAlly: CombatActor;
  triggeringAction: CombatAction;
  targetActor?: CombatActor | null;
}) {
  return [
    params.state.round,
    params.triggeringAlly.id,
    params.triggeringAction.id,
    params.targetActor?.id ?? "none",
  ].join(":");
}

function intentionForAction(action: CombatAction): PowerIntention {
  const sourceIntention = action.source?.packet?.intention;
  if (sourceIntention) return sourceIntention;
  if (action.kind === "attack") return "ATTACK";
  if (action.kind === "defence") return "DEFENCE";
  if (action.kind === "healing") return "HEALING";
  if (action.kind === "cleanse") return "CLEANSE";
  if (action.kind === "control") return "CONTROL";
  if (action.kind === "movement") return "MOVEMENT";
  if (action.kind === "buff") return "AUGMENT";
  if (action.kind === "debuff") return "DEBUFF";
  return "SUPPORT";
}

function calculateAssistPressure(params: ManualAssistDeclarationParams): {
  amount: number;
  rollSummary?: CombatRollSummary;
} {
  if (params.generatedPressure !== undefined) {
    return { amount: Math.max(0, Math.trunc(params.generatedPressure)) };
  }
  if (!params.rng) return { amount: 0 };
  const target = params.targetActor ?? params.triggeringAlly;
  const attribute = effectiveAccuracyAttribute(params.assistingActor, target, params.assistingAction);
  const modifier = getAttributeModifier(params.state, params.assistingActor.id, attribute);
  const roll = rollDice(Math.max(0, params.assistingAction.diceCount), getActorDie(params.assistingActor, attribute), params.rng, modifier);
  const rollSummary = summarizeRoll({
    actor: params.assistingActor,
    reason: `${params.assistingAction.name} Assist`,
    attribute,
    roll,
  });
  return { amount: roll.successes * Math.max(1, params.assistingAction.potency), rollSummary };
}

export function declareManualAssistPressure(params: ManualAssistDeclarationParams): CombatResolutionMetrics {
  const metrics = emptyResolution();
  const triggerId = params.triggerId ?? assistTriggerId(params);
  const chosenAssistIntention = params.chosenAssistIntention ?? intentionForAction(params.assistingAction);
  const occupiedIntentions = params.occupiedIntentions?.length
    ? params.occupiedIntentions
    : [chosenAssistIntention];
  const mode = params.mode ?? "improvised";
  const duplicate = mode !== "explicitSpecial" && params.state.assistDeclarations.some(
    (assist) =>
      assist.legal &&
      assist.mode !== "explicitSpecial" &&
      assist.triggerId === triggerId &&
      assist.occupiedIntentions.some((intention) => occupiedIntentions.includes(intention)),
  );

  const reject = (reason: string) => {
    const declaration = {
      id: `${triggerId}:assist:${params.assistingActor.id}:${params.assistingAction.id}:${params.state.assistDeclarations.length + 1}`,
      triggerId,
      triggerType: params.triggerType ?? "allyAction",
      assistingActorId: params.assistingActor.id,
      triggeringAllyId: params.triggeringAlly.id,
      triggeringActionId: params.triggeringAction.id,
      assistingActionId: params.assistingAction.id,
      targetActorId: params.targetActor?.id ?? null,
      chosenAssistIntention,
      occupiedIntentions,
      mode,
      pressureLane: params.pressureLane,
      resistedAttribute: params.resistedAttribute ?? null,
      responseCost: 1 as const,
      legal: false,
      rejectionReason: reason,
    };
    params.state.assistDeclarations.push(declaration);
    metrics.assistRejected = 1;
    emitTranscriptEvent(params.state, {
      type: "assistDeclared",
      actorId: params.assistingActor.id,
      actorName: params.assistingActor.name,
      targetId: params.targetActor?.id ?? params.triggeringAlly.id,
      targetName: params.targetActor?.name ?? params.triggeringAlly.name,
      actionId: params.assistingAction.id,
      actionName: params.assistingAction.name,
      lane: "response",
      message: `Assist rejected: ${params.assistingActor.name}'s ${params.assistingAction.name} cannot assist ${params.triggeringAction.name}. ${reason}.`,
      details: {
        triggerId,
        chosenAssistIntention,
        pressureLane: params.pressureLane,
        reason,
      },
    });
    return metrics;
  };

  if (duplicate) return reject(`duplicate generic ${chosenAssistIntention} Assist on this trigger`);
  if ((params.state.responsesRemaining[params.assistingActor.id] ?? 0) < 1) {
    metrics.responsesWastedOrUnavailable = 1;
    return reject("no Response available");
  }
  if (isActionOnCooldown(params.state, params.assistingActor.id, params.assistingAction.id)) {
    recordCooldownPreventedUse(params.state, params.assistingActor, params.assistingAction);
    return reject("assisting power is on cooldown");
  }

  const declarationId = `${triggerId}:assist:${params.assistingActor.id}:${params.assistingAction.id}:${params.state.assistDeclarations.length + 1}`;
  const { amount, rollSummary } = calculateAssistPressure(params);
  params.state.assistDeclarations.push({
    id: declarationId,
    triggerId,
    triggerType: params.triggerType ?? "allyAction",
    assistingActorId: params.assistingActor.id,
    triggeringAllyId: params.triggeringAlly.id,
    triggeringActionId: params.triggeringAction.id,
    assistingActionId: params.assistingAction.id,
    targetActorId: params.targetActor?.id ?? null,
    chosenAssistIntention,
    occupiedIntentions,
    mode,
    pressureLane: params.pressureLane,
    resistedAttribute: params.resistedAttribute ?? null,
    responseCost: 1,
    legal: true,
    rejectionReason: null,
  });
  if (amount > 0) {
    params.state.assistPressures.push({
      triggerId,
      sourceAssistId: declarationId,
      sourceActorId: params.assistingActor.id,
      sourceActionId: params.assistingAction.id,
      chosenAssistIntention,
      lane: params.pressureLane,
      resistedAttribute: params.resistedAttribute ?? null,
      amountGenerated: amount,
      amountSpent: 0,
      amountWasted: 0,
    });
  }
  spendActorResponse(params.state, params.assistingActor.id);
  recordActionUse(params.state, params.assistingActor, params.assistingAction);
  applyActionCooldown(params.state, params.assistingActor, params.assistingAction);
  metrics.assistDeclared = 1;
  metrics.assistPressureGenerated = amount;
  metrics.responsesUsed = 1;
  emitTranscriptEvent(params.state, {
    type: "assistDeclared",
    actorId: params.assistingActor.id,
    actorName: params.assistingActor.name,
    targetId: params.targetActor?.id ?? params.triggeringAlly.id,
    targetName: params.targetActor?.name ?? params.triggeringAlly.name,
    actionId: params.assistingAction.id,
    actionName: params.assistingAction.name,
    lane: "response",
    message: `Assist declared: ${params.assistingActor.name} uses ${params.assistingAction.name} as a ${chosenAssistIntention} Assist for ${params.triggeringAlly.name}'s ${params.triggeringAction.name}; generated ${amount} ${params.pressureLane} Assist pressure.`,
    roll: rollSummary,
    details: {
      triggerId,
      chosenAssistIntention,
      pressureLane: params.pressureLane,
      generatedPressure: amount,
      responseCost: 1,
      resistedAttribute: params.resistedAttribute ?? null,
    },
  });
  return metrics;
}

function consumeAssistPressure(params: {
  state: CombatState;
  metrics: CombatResolutionMetrics;
  triggerId?: string | null;
  lane: CombatAssistPressureLane;
  maxReduction: number;
  resistedAttribute?: CoreAttribute | null;
}): { spent: number; wasted: number } {
  if (!params.triggerId || params.maxReduction <= 0) return { spent: 0, wasted: 0 };
  let remainingReduction = Math.max(0, params.maxReduction);
  let spent = 0;
  let wasted = 0;
  for (const pressure of params.state.assistPressures) {
    if (pressure.triggerId !== params.triggerId || pressure.lane !== params.lane) continue;
    if (
      params.lane === "resist" &&
      pressure.resistedAttribute &&
      params.resistedAttribute &&
      pressure.resistedAttribute !== params.resistedAttribute
    ) {
      continue;
    }
    const available = Math.max(0, pressure.amountGenerated - pressure.amountSpent - pressure.amountWasted);
    if (available <= 0) continue;
    const use = Math.min(available, remainingReduction);
    pressure.amountSpent += use;
    spent += use;
    remainingReduction -= use;
    const excess = available - use;
    if (excess > 0) {
      pressure.amountWasted += excess;
      wasted += excess;
    }
    if (remainingReduction <= 0) {
      continue;
    }
  }
  params.metrics.assistPressureSpent += spent;
  params.metrics.assistPressureWasted += wasted;
  if (spent > 0 || wasted > 0) {
    emitTranscriptEvent(params.state, {
      type: "assistPressure",
      lane: "response",
      message: `Assist pressure: ${params.lane} pressure spent ${spent}, wasted ${wasted}; opposition cannot be reduced below 0 and no pressure becomes payload.`,
      details: {
        triggerId: params.triggerId,
        lane: params.lane,
        spent,
        wasted,
        maxReduction: params.maxReduction,
        resistedAttribute: params.resistedAttribute ?? null,
      },
    });
  }
  return { spent, wasted };
}

function effectiveAccuracyAttribute(actor: CombatActor, target: CombatActor, action: CombatAction): CombatAttributeName {
  if (actor.id === target.id && action.contextualAccuracyAttributes?.self) {
    return action.contextualAccuracyAttributes.self;
  }
  if (actor.side === target.side && actor.id !== target.id && action.contextualAccuracyAttributes?.ally) {
    return action.contextualAccuracyAttributes.ally;
  }
  if (actor.side !== target.side && action.contextualAccuracyAttributes?.enemy) {
    return action.contextualAccuracyAttributes.enemy;
  }
  return action.accuracyAttribute;
}

function getActorDie(actor: CombatActor, attribute: CombatAttributeName) {
  return actor.attributeDice[attribute] ?? "D8";
}

type CombatDiceRoll = ReturnType<typeof rollDice> & { modifier: number };

function formatResults(results: number[]) {
  return results.length > 0 ? results.join(", ") : "none";
}

function summarizeRoll(params: {
  actor: CombatActor;
  reason: string;
  attribute: CombatAttributeName | string;
  roll: CombatDiceRoll;
}): CombatRollSummary {
  return {
    rollerId: params.actor.id,
    rollerName: params.actor.name,
    reason: params.reason,
    attribute: params.attribute,
    diceCount: params.roll.diceCount,
    dieSize: params.roll.dieSize,
    rawResults: params.roll.rawResults,
    modifiedResults: params.roll.modifiedResults,
    perDieSuccesses: params.roll.perDieSuccesses,
    modifier: params.roll.modifier,
    successes: params.roll.successes,
  };
}

function rollText(roll: CombatRollSummary) {
  const modified =
    roll.modifier !== 0 ? `, modified results ${formatResults(roll.modifiedResults)}` : "";
  return `${roll.rollerName} rolled ${roll.diceCount} x ${roll.dieSize} using ${roll.attribute} for ${roll.reason}: raw results ${formatResults(roll.rawResults)}${modified}; per-die successes ${formatResults(roll.perDieSuccesses)}; total ${roll.successes} successes.`;
}

function rollEventType(action: CombatAction): "attackRoll" | "healingRoll" | "buffRoll" | "debuffRoll" | "controlRoll" | "movementRoll" | "cleanseRoll" {
  if (action.kind === "healing") return "healingRoll";
  if (action.kind === "buff") return "buffRoll";
  if (action.kind === "debuff") return "debuffRoll";
  if (action.kind === "control") return "controlRoll";
  if (action.kind === "movement") return "movementRoll";
  if (action.kind === "cleanse") return "cleanseRoll";
  return "attackRoll";
}

function damageApplicationTimingForAction(action: CombatAction): NonNullable<CombatAction["damageApplicationTiming"]> {
  if (action.damageApplicationTiming) return action.damageApplicationTiming;
  const packet = action.source?.packet;
  if (action.kind === "attack" && (packet?.effectDurationType ?? "INSTANT") === "TURNS") {
    const timing = packet?.effectTimingType ?? "ON_CAST";
    if (
      timing === "ON_CAST" ||
      timing === "START_OF_TURN" ||
      timing === "START_OF_TURN_WHILST_CHANNELLED"
    ) {
      return "startOfTurn";
    }
    if (timing === "END_OF_TURN" || timing === "END_OF_TURN_WHILST_CHANNELLED") {
      return "endOfTurn";
    }
  }
  return "immediate";
}

function actionDamageLabel(action: CombatAction, pool: "physical" | "mental") {
  const details =
    action.source?.packet?.detailsJson &&
    typeof action.source.packet.detailsJson === "object" &&
    !Array.isArray(action.source.packet.detailsJson)
      ? (action.source.packet.detailsJson as Record<string, unknown>)
      : {};
  const damageTypes = Array.isArray(action.damageTypes)
    ? action.damageTypes.map((entry) => String(entry).trim()).filter(Boolean)
    : Array.isArray(details.damageTypes)
    ? details.damageTypes.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  if (damageTypes.length === 0) return pool;
  if (damageTypes.length === 1) return `${pool} ${damageTypes[0]}`;
  return `${pool} ${damageTypes.join("/")}`;
}

function protectionBreakdown(
  state: CombatState,
  actor: CombatActor,
  pool: "physical" | "mental",
  cap: number,
): Array<{ name: string; prevented: number }> {
  let remaining = Math.max(0, cap);
  if (remaining <= 0) return [];
  const entries: Array<{ name: string; amount: number }> = [];
  const baseStatic = pool === "physical" ? actor.physicalProtection : actor.mentalProtection;
  if (baseStatic > 0) entries.push({ name: `${actor.name}'s base ${pool} protection`, amount: baseStatic });
  for (const effect of state.statusEffects) {
    if (
      effect.targetActorId !== actor.id ||
      effect.kind !== "protection" ||
      effect.pool !== pool ||
      effect.amount <= 0
    ) {
      continue;
    }
    entries.push({ name: effect.sourceActionName ?? "passive/static effect", amount: effect.amount });
  }
  const passiveDefence = passiveDefenceAmount(actor, pool);
  if (passiveDefence > 0) entries.push({ name: `${actor.name}'s passive defence`, amount: passiveDefence });
  const capped: Array<{ name: string; prevented: number }> = [];
  for (const entry of entries) {
    if (remaining <= 0) break;
    const prevented = Math.min(remaining, Math.max(0, entry.amount));
    if (prevented > 0) {
      capped.push({ name: entry.name, prevented });
      remaining -= prevented;
    }
  }
  return capped;
}

function formatProtectionBreakdown(entries: Array<{ name: string; prevented: number }>, pool: "physical" | "mental") {
  return entries.map((entry) => `${entry.name} blocked ${entry.prevented} ${pool} wounds`).join("; ");
}

function takeDefenceDegradation(state: CombatState, actorId: string, type: "dodge" | "physical" | "mental") {
  state.defenceDegradation[actorId] ??= { dodge: 0, physical: 0, mental: 0 };
  const previousRolls = state.defenceDegradation[actorId][type];
  state.defenceDegradation[actorId][type] += 1;
  return previousRolls;
}

function peekDefenceDegradation(state: CombatState, actorId: string, type: "dodge" | "physical" | "mental") {
  return state.defenceDegradation[actorId]?.[type] ?? 0;
}

function takeActiveResistDegradation(
  state: CombatState,
  actorId: string,
  resistedAttribute: NonNullable<CombatAction["resistAttribute"]>,
) {
  state.defenceDegradation[actorId] ??= { dodge: 0, physical: 0, mental: 0 };
  const resist = state.defenceDegradation[actorId].resist ??= {};
  const previousRolls = resist[resistedAttribute] ?? 0;
  resist[resistedAttribute] = previousRolls + 1;
  return previousRolls;
}

function peekActiveResistDegradation(
  state: CombatState,
  actorId: string,
  resistedAttribute: NonNullable<CombatAction["resistAttribute"]>,
) {
  return state.defenceDegradation[actorId]?.resist?.[resistedAttribute] ?? 0;
}

function successDistribution(diceCount: number, die: CombatActor["attributeDice"][CombatAttributeName], modifier: number): number[] {
  const count = Math.max(0, Math.trunc(diceCount));
  let distribution = [1];
  const sides = diceSides(die);
  for (let dieIndex = 0; dieIndex < count; dieIndex += 1) {
    const next = Array.from({ length: distribution.length + 3 }, () => 0);
    for (let existing = 0; existing < distribution.length; existing += 1) {
      for (let roll = 1; roll <= sides; roll += 1) {
        const successes = successCountForRoll(roll, modifier);
        next[existing + successes] += distribution[existing] / sides;
      }
    }
    distribution = next;
  }
  return distribution;
}

function probabilitySuccessesAtLeast(params: {
  diceCount: number;
  die: CombatActor["attributeDice"][CombatAttributeName];
  modifier: number;
  threshold: number;
}) {
  const threshold = Math.max(0, Math.trunc(params.threshold));
  if (threshold <= 0) return 1;
  return successDistribution(params.diceCount, params.die, params.modifier)
    .slice(threshold)
    .reduce((sum, probability) => sum + probability, 0);
}

function rollAttributeDice(params: {
  state: CombatState;
  actor: CombatActor;
  attribute: keyof CombatActor["attributeDice"];
  diceCount: number;
  rng: Rng;
}) {
  const modifier = getAttributeModifier(params.state, params.actor.id, String(params.attribute));
  return {
    ...rollDice(params.diceCount, params.actor.attributeDice[params.attribute] ?? "D8", params.rng, modifier),
    modifier,
  };
}

function recordModifiedDefenceRoll(metrics: CombatResolutionMetrics, modifier: number) {
  if (modifier > 0) metrics.buffedDefenceRolls += 1;
  if (modifier < 0) metrics.debuffedDefenceRolls += 1;
}

function recordModifiedResistRoll(metrics: CombatResolutionMetrics, modifier: number) {
  if (modifier > 0) metrics.buffedResistRolls += 1;
  if (modifier < 0) metrics.debuffedResistRolls += 1;
}

function resolveDodge(state: CombatState, target: CombatActor, incomingSuccesses: number, rng: Rng, assistTriggerId?: string | null): CombatResolutionMetrics {
  const metrics = emptyResolution();
  if (incomingSuccesses <= 0) return metrics;
  const requestedPoolCommit = estimatePoolCommit(state, target, "DODGE", { incomingSuccesses });
  const poolCommit = commitDefensivePool({
    state,
    metrics,
    target,
    poolType: "DODGE",
    requested: requestedPoolCommit,
  });
  const degradation = takeDefenceDegradation(state, target.id, "dodge");
  const baseDice = Math.max(1, Math.trunc(target.dodgeDice ?? target.dodgeValue ?? 1));
  const diceCount = Math.max(1, baseDice - degradation);
  const roll = rollAttributeDice({ state, actor: target, attribute: "Guard", diceCount, rng });
  const rollSummary = summarizeRoll({ actor: target, reason: "Dodge", attribute: "Guard", roll });
  const poolSuccesses = poolCommit?.committed ?? 0;
  const totalDodgeSuccesses = roll.successes + poolSuccesses;
  const assistPressure = consumeAssistPressure({
    state,
    metrics,
    triggerId: assistTriggerId,
    lane: "dodge",
    maxReduction: totalDodgeSuccesses,
  });
  const effectiveDodgeSuccesses = Math.max(0, totalDodgeSuccesses - assistPressure.spent);
  metrics.dodgeRolls = 1;
  metrics.dodgeChosen = 1;
  metrics.dodgeDegradationApplied = degradation;
  metrics.degradedDefenceRolls = degradation > 0 ? 1 : 0;
  metrics.dodgeSuccesses = effectiveDodgeSuccesses;
  recordModifiedDefenceRoll(metrics, roll.modifier);
  if (effectiveDodgeSuccesses >= incomingSuccesses) {
    metrics.woundsAvoidedByDodge = incomingSuccesses;
  }
  if (poolCommit) {
    finishDefensivePoolCommit({
      metrics,
      pool: poolCommit.pool,
      committed: poolCommit.committed,
      effective: effectiveDodgeSuccesses >= incomingSuccesses
        ? Math.min(poolCommit.committed, Math.max(0, incomingSuccesses - roll.successes))
        : 0,
      result: "dodge",
    });
    if (poolCommit.pool.remainingPoints <= 0) {
      state.defensivePools = state.defensivePools.filter((pool) => pool.id !== poolCommit.pool.id);
    }
  }
  emitTranscriptEvent(state, {
    type: "dodgeRoll",
    actorId: target.id,
    actorName: target.name,
    lane: "response",
    message: `${rollText(rollSummary)}${poolSuccesses > 0 ? ` Defensive Dodge pool adds ${poolSuccesses} success${poolSuccesses === 1 ? "" : "es"}.` : ""}${assistPressure.spent > 0 ? ` Assist pressure reduces Dodge opposition by ${assistPressure.spent}.` : ""} Dodge ${effectiveDodgeSuccesses >= incomingSuccesses ? "succeeded" : "failed"} against ${incomingSuccesses} incoming successes. Degradation ${degradation}, final dice ${diceCount}.`,
    roll: rollSummary,
    details: {
      incomingSuccesses,
      originalDice: baseDice,
      degradation,
      finalDice: diceCount,
      poolSuccesses,
      totalDodgeSuccesses,
      assistPressureSpent: assistPressure.spent,
      assistPressureWasted: assistPressure.wasted,
      effectiveDodgeSuccesses,
      dodgeSucceeded: effectiveDodgeSuccesses >= incomingSuccesses,
    },
  });
  return metrics;
}

function resolveDefenceString(
  state: CombatState,
  target: CombatActor,
  pool: "physical" | "mental",
  wounds: number,
  rng: Rng,
  context: { ongoingPerTick?: boolean } = {},
): CombatResolutionMetrics {
  const metrics = emptyResolution();
  if (wounds <= 0) return metrics;
  const type = pool === "physical" ? "physical" : "mental";
  const attribute = pool === "physical" ? "Guard" : "Bravery";
  const baseDice = Math.max(1, Math.trunc(pool === "physical" ? target.physicalDefenceDice ?? 1 : target.mentalDefenceDice ?? 1));
  const blockPerSuccess = Math.max(
    0,
    Math.trunc(
      pool === "physical"
        ? target.physicalBlockPerSuccess ?? target.physicalDefenceBlock ?? 0
        : target.mentalBlockPerSuccess ?? target.mentalDefenceBlock ?? 0,
    ),
  );
  const degradation = takeDefenceDegradation(state, target.id, type);
  const requestedPoolCommit = estimatePoolCommit(state, target, pool === "physical" ? "PHYSICAL_BLOCK" : "MENTAL_BLOCK", {
    woundChannel: pool,
    incomingWounds: wounds,
  });
  const poolCommit = commitDefensivePool({
    state,
    metrics,
    target,
    poolType: pool === "physical" ? "PHYSICAL_BLOCK" : "MENTAL_BLOCK",
    requested: requestedPoolCommit,
    woundChannel: pool,
  });
  const diceCount = Math.max(1, baseDice - degradation);
  const roll = rollAttributeDice({ state, actor: target, attribute, diceCount, rng });
  const rollSummary = summarizeRoll({ actor: target, reason: `${pool} defence`, attribute, roll });
  const rollBlocked = Math.min(wounds, roll.successes * blockPerSuccess);
  const poolBlocked = Math.min(Math.max(0, wounds - rollBlocked), poolCommit?.committed ?? 0);
  const blocked = Math.min(wounds, rollBlocked + poolBlocked);
  if (poolCommit) {
    finishDefensivePoolCommit({
      metrics,
      pool: poolCommit.pool,
      committed: poolCommit.committed,
      effective: poolBlocked,
      result: "block",
    });
    if (poolCommit.pool.remainingPoints <= 0) {
      state.defensivePools = state.defensivePools.filter((entry) => entry.id !== poolCommit.pool.id);
    }
  }
  metrics.defenceStringBlocked = blocked;
  metrics.protectionPrevented = blocked;
  recordModifiedDefenceRoll(metrics, roll.modifier);
  if (pool === "physical") {
    metrics.physicalDefenceRolls = 1;
    metrics.physicalDefenceChosen = 1;
    metrics.physicalDefenceDegradationApplied = degradation;
  } else {
    metrics.mentalDefenceRolls = 1;
    metrics.mentalDefenceChosen = 1;
    metrics.mentalDefenceDegradationApplied = degradation;
  }
  metrics.degradedDefenceRolls = degradation > 0 ? 1 : 0;
  emitTranscriptEvent(state, {
    type: pool === "physical" ? "physicalDefenceRoll" : "mentalDefenceRoll",
    actorId: target.id,
    actorName: target.name,
    lane: "response",
    message: `${rollText(rollSummary)} ${pool === "physical" ? "Physical Defence" : "Mental Defence"} blocked ${blocked} of ${wounds} ${context.ongoingPerTick ? "ongoing " : ""}${pool} wounds${context.ongoingPerTick ? " per tick" : ""} (${blockPerSuccess} block per success${poolCommit ? `, ${poolCommit.committed} defensive pool point${poolCommit.committed === 1 ? "" : "s"} committed` : ""}). Degradation ${degradation}, final dice ${diceCount}.`,
    roll: rollSummary,
    details: {
      pool,
      incomingWounds: wounds,
      blocked,
      rollBlocked,
      poolBlocked,
      blockPerSuccess,
      originalDice: baseDice,
      degradation,
      finalDice: diceCount,
    },
  });
  return metrics;
}

function estimateDodgeValue(state: CombatState, target: CombatActor, incomingSuccesses: number, rawWounds: number): number {
  if (incomingSuccesses <= 0 || rawWounds <= 0) return 0;
  const modifier = getAttributeModifier(state, target.id, "Guard");
  const degradation = peekDefenceDegradation(state, target.id, "dodge");
  const baseDice = Math.max(1, Math.trunc(target.dodgeDice ?? target.dodgeValue ?? 1));
  const diceCount = Math.max(1, baseDice - degradation);
  const poolCommit = estimatePoolCommit(state, target, "DODGE", { incomingSuccesses });
  return probabilitySuccessesAtLeast({
    diceCount,
    die: target.attributeDice.Guard ?? "D8",
    modifier,
    threshold: Math.max(0, incomingSuccesses - poolCommit),
  }) * rawWounds;
}

function estimateDefenceStringValue(state: CombatState, target: CombatActor, pool: "physical" | "mental", rawWounds: number): number {
  if (rawWounds <= 0) return 0;
  const type = pool === "physical" ? "physical" : "mental";
  const attribute = pool === "physical" ? "Guard" : "Bravery";
  const baseDice = Math.max(1, Math.trunc(pool === "physical" ? target.physicalDefenceDice ?? 1 : target.mentalDefenceDice ?? 1));
  const degradation = peekDefenceDegradation(state, target.id, type);
  const diceCount = Math.max(1, baseDice - degradation);
  const blockPerSuccess = Math.max(
    0,
    Math.trunc(
      pool === "physical"
        ? target.physicalBlockPerSuccess ?? target.physicalDefenceBlock ?? 0
        : target.mentalBlockPerSuccess ?? target.mentalDefenceBlock ?? 0,
    ),
  );
  const poolCommit = estimatePoolCommit(state, target, pool === "physical" ? "PHYSICAL_BLOCK" : "MENTAL_BLOCK", {
    woundChannel: pool,
    incomingWounds: rawWounds,
  });
  if (blockPerSuccess <= 0) return Math.min(rawWounds, poolCommit);
  const expectedBlocked = expectedSuccesses(
    diceCount,
    target.attributeDice[attribute] ?? "D8",
    getAttributeModifier(state, target.id, attribute),
  ) * blockPerSuccess + poolCommit;
  return Math.min(rawWounds, expectedBlocked);
}

function estimatePoolOnlyCommit(
  state: CombatState,
  target: CombatActor,
  poolType: CombatDefensivePoolType,
  options: {
    incomingSuccesses?: number;
    incomingWounds?: number;
    woundChannel?: "physical" | "mental";
    resistedAttribute?: CombatAction["defenceResistedAttribute"];
  },
): number {
  const pool = state.defensivePools.find((entry) =>
    poolMatches({ pool: entry, target, poolType, woundChannel: options.woundChannel, resistedAttribute: options.resistedAttribute }),
  );
  if (!pool) return 0;
  if (poolType === "DODGE" || poolType === "RESIST") {
    const incomingSuccesses = Math.max(0, Math.trunc(options.incomingSuccesses ?? 0));
    return Math.min(pool.remainingPoints, pool.perTriggerCap, incomingSuccesses);
  }
  const incomingWounds = Math.max(0, Math.trunc(options.incomingWounds ?? 0));
  return Math.min(pool.remainingPoints, pool.perTriggerCap, incomingWounds);
}

function estimateDodgePoolOnlyValue(state: CombatState, target: CombatActor, incomingSuccesses: number, rawWounds: number): number {
  if (incomingSuccesses <= 0 || rawWounds <= 0) return 0;
  const poolCommit = estimatePoolOnlyCommit(state, target, "DODGE", { incomingSuccesses });
  return poolCommit >= incomingSuccesses ? rawWounds : 0;
}

function estimateBlockPoolOnlyValue(state: CombatState, target: CombatActor, pool: "physical" | "mental", rawWounds: number): number {
  if (rawWounds <= 0) return 0;
  const poolCommit = estimatePoolOnlyCommit(state, target, pool === "physical" ? "PHYSICAL_BLOCK" : "MENTAL_BLOCK", {
    woundChannel: pool,
    incomingWounds: rawWounds,
  });
  return Math.min(rawWounds, poolCommit);
}

function resolveBestNormalDefence(params: {
  state: CombatState;
  target: CombatActor;
  pool: "physical" | "mental";
  incomingSuccesses: number;
  rawWounds: number;
  rng: Rng;
  ongoingPerTick?: boolean;
  assistTriggerId?: string | null;
}): CombatResolutionMetrics {
  if (params.target.defensivePoolCommitmentMode === "poolOnly") {
    const blockPoolOnlyCommit = estimatePoolOnlyCommit(params.state, params.target, params.pool === "physical" ? "PHYSICAL_BLOCK" : "MENTAL_BLOCK", {
      woundChannel: params.pool,
      incomingWounds: params.rawWounds,
    });
    const dodgePoolOnlyCommit = params.pool === "physical"
      ? estimatePoolOnlyCommit(params.state, params.target, "DODGE", { incomingSuccesses: params.incomingSuccesses })
      : 0;
    const blockPoolOnlyValue = estimateBlockPoolOnlyValue(params.state, params.target, params.pool, params.rawWounds);
    const dodgePoolOnlyValue = params.pool === "physical"
      ? estimateDodgePoolOnlyValue(params.state, params.target, params.incomingSuccesses, params.rawWounds)
      : 0;
    const useBlockPoolOnly = blockPoolOnlyValue > dodgePoolOnlyValue ||
      (blockPoolOnlyValue === dodgePoolOnlyValue && blockPoolOnlyCommit >= dodgePoolOnlyCommit);
    const poolOnlyChosen = useBlockPoolOnly ? `${params.pool} pool-only defence` : "dodge pool-only defence";
    if (Math.max(blockPoolOnlyCommit, dodgePoolOnlyCommit) > 0) {
      emitTranscriptEvent(params.state, {
        type: "defenceChoice",
        actorId: params.target.id,
        actorName: params.target.name,
        lane: "response",
        message: `Defence choice: ${params.target.name} chooses ${poolOnlyChosen}. Expected prevention: dodge pool ${dodgePoolOnlyValue.toFixed(2)}, ${params.pool} pool ${blockPoolOnlyValue.toFixed(2)}.`,
        details: {
          dodgePoolOnlyExpectedValue: dodgePoolOnlyValue,
          blockPoolOnlyExpectedValue: blockPoolOnlyValue,
          chosen: poolOnlyChosen,
          normalDefenceSkipped: true,
        },
      });
      const metrics =
        useBlockPoolOnly
          ? resolveBlockPoolOnly(params.state, params.target, params.pool, params.rawWounds, { ongoingPerTick: params.ongoingPerTick })
          : resolveDodgePoolOnly(params.state, params.target, params.incomingSuccesses);
      metrics.defenceChoiceExpectedValue = Math.max(blockPoolOnlyValue, dodgePoolOnlyValue);
      return metrics;
    }
  }

  const defenceStringValue = estimateDefenceStringValue(params.state, params.target, params.pool, params.rawWounds);
  if (params.pool === "mental") {
    emitTranscriptEvent(params.state, {
      type: "defenceChoice",
      actorId: params.target.id,
      actorName: params.target.name,
      lane: "response",
      message: `Defence choice: ${params.target.name} chooses mental defence. Expected prevention: mental defence ${defenceStringValue.toFixed(2)}.`,
      details: { defenceStringExpectedValue: defenceStringValue, chosen: "mental defence", dodgeLegal: false },
    });
    const metrics = resolveDefenceString(params.state, params.target, params.pool, params.rawWounds, params.rng, {
      ongoingPerTick: params.ongoingPerTick,
    });
    metrics.defenceChoiceExpectedValue = defenceStringValue;
    return metrics;
  }

  const dodgeValue = estimateDodgeValue(params.state, params.target, params.incomingSuccesses, params.rawWounds);
  const chosen = defenceStringValue > dodgeValue ? `${params.pool} defence` : "dodge";
  emitTranscriptEvent(params.state, {
    type: "defenceChoice",
    actorId: params.target.id,
    actorName: params.target.name,
    lane: "response",
    message: `Defence choice: ${params.target.name} chooses ${chosen}. Expected prevention: dodge ${dodgeValue.toFixed(2)}, ${params.pool} defence ${defenceStringValue.toFixed(2)}.`,
    details: { dodgeExpectedValue: dodgeValue, defenceStringExpectedValue: defenceStringValue, chosen },
  });
  const metrics =
    defenceStringValue > dodgeValue
      ? resolveDefenceString(params.state, params.target, params.pool, params.rawWounds, params.rng, {
          ongoingPerTick: params.ongoingPerTick,
        })
      : resolveDodge(params.state, params.target, params.incomingSuccesses, params.rng, params.assistTriggerId);
  metrics.defenceChoiceExpectedValue = Math.max(dodgeValue, defenceStringValue);
  return metrics;
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

function addOngoingPressureSideTotals(
  target: CombatOngoingPressureSideTotals,
  source: CombatOngoingPressureSideTotals,
) {
  target.statusesCreated += source.statusesCreated;
  target.storedTickTotal += source.storedTickTotal;
  target.storedTickMax = Math.max(target.storedTickMax, source.storedTickMax);
  target.firstTicksApplied += source.firstTicksApplied;
  target.firstTickDamageTotal += source.firstTickDamageTotal;
  target.firstTickLethal += source.firstTickLethal;
  target.firstTickBeforeCleanup += source.firstTickBeforeCleanup;
  target.ticksAppliedTotal += source.ticksAppliedTotal;
  target.totalOngoingDamage += source.totalOngoingDamage;
  target.cleanupAttempts += source.cleanupAttempts;
  target.cleanupSuccesses += source.cleanupSuccesses;
  target.cleanupUnitsRemoved += source.cleanupUnitsRemoved;
  target.cleanupWoundsRemoved += source.cleanupWoundsRemoved;
  target.cleanupRemainingTicksTotal += source.cleanupRemainingTicksTotal;
  target.cleanupStoredTickRemovedTotal += source.cleanupStoredTickRemovedTotal;
  target.cleanupPreventedWoundsEstimate += source.cleanupPreventedWoundsEstimate;
}

function addOngoingPressureMetrics(
  target: CombatOngoingPressureMetrics,
  source: CombatOngoingPressureMetrics,
) {
  addOngoingPressureSideTotals(target.bySourceSide.players, source.bySourceSide.players);
  addOngoingPressureSideTotals(target.bySourceSide.monsters, source.bySourceSide.monsters);
  for (const [key, sourceAction] of Object.entries(source.bySourceAction)) {
    const targetAction = target.bySourceAction[key] ??= {
      ...sourceAction,
      ...createEmptyOngoingPressureSideTotals(),
    };
    addOngoingPressureSideTotals(targetAction, sourceAction);
  }
}

function addDefensivePoolSideTotals(
  target: CombatDefensivePoolSideTotals,
  source: CombatDefensivePoolSideTotals,
) {
  target.poolsCreated += source.poolsCreated;
  target.generatedPoints += source.generatedPoints;
  target.refreshReplaceEvents += source.refreshReplaceEvents;
  target.committedPoints += source.committedPoints;
  target.spentPoints += source.spentPoints;
  target.wastedPoints += source.wastedPoints;
  target.remainingAtExpiry += source.remainingAtExpiry;
  target.expiredEmpty += source.expiredEmpty;
  target.expiredDuration += source.expiredDuration;
  target.expiredFieldExit += source.expiredFieldExit;
  target.expiredAttachmentEnd += source.expiredAttachmentEnd;
  target.expiredChannelEnd += source.expiredChannelEnd;
  target.expiredCleanse += source.expiredCleanse;
  target.expiredDefeatCleanup += source.expiredDefeatCleanup;
  target.dodgeAvoids += source.dodgeAvoids;
  target.blockWoundsPrevented += source.blockWoundsPrevented;
  target.resistUnitsCancelled += source.resistUnitsCancelled;
}

function addDefensivePoolMetrics(
  target: CombatDefensivePoolMetrics,
  source: CombatDefensivePoolMetrics,
) {
  addDefensivePoolSideTotals(target.bySourceSide.players, source.bySourceSide.players);
  addDefensivePoolSideTotals(target.bySourceSide.monsters, source.bySourceSide.monsters);
  for (const [key, sourceAction] of Object.entries(source.bySourceAction)) {
    const targetAction = target.bySourceAction[key] ??= {
      ...sourceAction,
      ...createEmptyDefensivePoolSideTotals(),
    };
    addDefensivePoolSideTotals(targetAction, sourceAction);
  }
}

function addMetrics(target: CombatResolutionMetrics, source: Partial<CombatResolutionMetrics>) {
  for (const key of Object.keys(source) as Array<keyof CombatResolutionMetrics>) {
    if (key === "ongoingPressure") {
      if (source.ongoingPressure) addOngoingPressureMetrics(target.ongoingPressure, source.ongoingPressure);
      continue;
    }
    if (key === "defensivePools") {
      if (source.defensivePools) addDefensivePoolMetrics(target.defensivePools, source.defensivePools);
      continue;
    }
    const targetValue = target[key];
    const sourceValue = source[key];
    if (typeof targetValue === "number" && typeof sourceValue === "number") {
      target[key] = (targetValue + sourceValue) as never;
    }
  }
}

function sourceActorForEffect(state: CombatState, effect: CombatState["statusEffects"][number]) {
  return state.actors.find((actor) => actor.id === effect.sourceActorId) ?? null;
}

function ensureOngoingPressureAction(
  metrics: CombatOngoingPressureMetrics,
  sourceActor: CombatActor,
  actionId: string,
  actionName: string,
): CombatOngoingPressureActionMetrics {
  const key = `${sourceActor.id}:${actionId}`;
  return metrics.bySourceAction[key] ??= {
    ...createEmptyOngoingPressureSideTotals(),
    sourceActorId: sourceActor.id,
    sourceActorName: sourceActor.name,
    sourceSide: sourceActor.side,
    sourceActionId: actionId,
    sourceActionName: actionName,
  };
}

function recordOngoingPressure(
  metrics: CombatResolutionMetrics,
  sourceActor: CombatActor,
  actionId: string,
  actionName: string,
  mutate: (totals: CombatOngoingPressureSideTotals) => void,
) {
  mutate(metrics.ongoingPressure.bySourceSide[sourceActor.side]);
  mutate(ensureOngoingPressureAction(metrics.ongoingPressure, sourceActor, actionId, actionName));
}

function recordOngoingStatusCreated(params: {
  metrics: CombatResolutionMetrics;
  sourceActor: CombatActor;
  action: CombatAction;
  storedTick: number;
}) {
  recordOngoingPressure(
    params.metrics,
    params.sourceActor,
    params.action.id,
    params.action.name,
    (totals) => {
      totals.statusesCreated += 1;
      totals.storedTickTotal += params.storedTick;
      totals.storedTickMax = Math.max(totals.storedTickMax, params.storedTick);
    },
  );
}

function defensivePoolTypeForAction(action: CombatAction): CombatDefensivePoolType | null {
  const mode = action.defenceMode ?? "Block";
  if (mode === "Dodge") return "DODGE";
  if (mode === "Resist") return "RESIST";
  if ((action.pool ?? "physical") === "mental") return "MENTAL_BLOCK";
  return "PHYSICAL_BLOCK";
}

function sourceChassisForAction(action: CombatAction): CombatDefensivePool["sourceChassis"] {
  const chassis = String(action.source?.power?.descriptorChassis ?? "").toUpperCase();
  if (chassis === "IMMEDIATE") return "IMMEDIATE";
  if (chassis === "FIELD") return "FIELD";
  if (chassis === "ATTACHED") return "ATTACHED";
  if (chassis === "TRIGGER") return "TRIGGER";
  if (chassis === "RESERVE") return "RESERVE";
  return "UNKNOWN";
}

function sourceCommitmentModifierForAction(action: CombatAction): CombatDefensivePool["sourceCommitmentModifier"] {
  const modifier = String(action.source?.power?.commitmentModifier ?? "").toUpperCase();
  if (modifier === "STANDARD") return "STANDARD";
  if (modifier === "CHANNEL") return "CHANNEL";
  if (modifier === "CHARGE") return "CHARGE";
  return "UNKNOWN";
}

function sourcePacketIdForAction(action: CombatAction): string | null {
  const packet = action.source?.packet as { id?: unknown; packetIndex?: unknown } | undefined;
  if (!packet) return null;
  if (packet.id !== undefined && packet.id !== null) return String(packet.id);
  if (packet.packetIndex !== undefined && packet.packetIndex !== null) return String(packet.packetIndex);
  return null;
}

function ensureDefensivePoolAction(
  metrics: CombatDefensivePoolMetrics,
  pool: Pick<CombatDefensivePool, "sourceActorId" | "sourceActorName" | "sourceSide" | "sourceActionId" | "sourceActionName" | "poolType">,
): CombatDefensivePoolActionMetrics {
  const key = `${pool.sourceActorId}:${pool.sourceActionId}:${pool.poolType}`;
  return metrics.bySourceAction[key] ??= {
    ...createEmptyDefensivePoolSideTotals(),
    sourceActorId: pool.sourceActorId,
    sourceActorName: pool.sourceActorName,
    sourceSide: pool.sourceSide,
    sourceActionId: pool.sourceActionId,
    sourceActionName: pool.sourceActionName,
    poolType: pool.poolType,
  };
}

function recordDefensivePool(
  metrics: CombatResolutionMetrics,
  pool: Pick<CombatDefensivePool, "sourceActorId" | "sourceActorName" | "sourceSide" | "sourceActionId" | "sourceActionName" | "poolType">,
  mutate: (totals: CombatDefensivePoolSideTotals) => void,
) {
  mutate(metrics.defensivePools.bySourceSide[pool.sourceSide]);
  mutate(ensureDefensivePoolAction(metrics.defensivePools, pool));
}

function recordDefensivePoolExpiry(
  metrics: CombatResolutionMetrics,
  pool: CombatDefensivePool,
  reason: "empty" | "durationEnd" | "fieldExit" | "attachmentEnd" | "channelEnd" | "cleanse" | "defeatCleanup",
) {
  recordDefensivePool(metrics, pool, (totals) => {
    totals.remainingAtExpiry += Math.max(0, pool.remainingPoints);
    if (reason === "empty") totals.expiredEmpty += 1;
    if (reason === "durationEnd") totals.expiredDuration += 1;
    if (reason === "fieldExit") totals.expiredFieldExit += 1;
    if (reason === "attachmentEnd") totals.expiredAttachmentEnd += 1;
    if (reason === "channelEnd") totals.expiredChannelEnd += 1;
    if (reason === "cleanse") totals.expiredCleanse += 1;
    if (reason === "defeatCleanup") totals.expiredDefeatCleanup += 1;
  });
}

function createOrRefreshDefensivePool(params: {
  state: CombatState;
  metrics: CombatResolutionMetrics;
  actor: CombatActor;
  action: CombatAction;
  target: CombatActor;
  generatedPoints: number;
  durationRounds: number;
  lane?: CombatActionLane;
}) {
  const poolType = defensivePoolTypeForAction(params.action);
  if (!poolType || params.generatedPoints <= 0) return;
  const woundChannel =
    poolType === "PHYSICAL_BLOCK"
      ? "physical"
      : poolType === "MENTAL_BLOCK"
        ? "mental"
        : params.action.pool ?? null;
  const resistedAttribute = poolType === "RESIST" ? params.action.defenceResistedAttribute ?? null : null;
  const sourcePacketId = sourcePacketIdForAction(params.action);
  const reapplyKey = [
    params.actor.id,
    params.action.sourcePowerId ?? params.action.id,
    sourcePacketId ?? params.action.id,
    params.target.id,
    poolType,
    resistedAttribute ?? woundChannel ?? "none",
  ].join(":");
  const existing = params.state.defensivePools.find((pool) => pool.reapplyKey === reapplyKey);
  const basePool = existing ?? {
    id: `${params.state.round}:${reapplyKey}`,
    sourceActorId: params.actor.id,
    sourceActorName: params.actor.name,
    sourceSide: params.actor.side,
    sourceActionId: params.action.id,
    sourceActionName: params.action.name,
    sourcePowerId: params.action.sourcePowerId ?? params.action.id,
    sourcePacketId,
    protectedActorId: params.target.id,
    protectedActorName: params.target.name,
    poolType,
    woundChannel,
    resistedAttribute,
    remainingPoints: 0,
    initialPoints: 0,
    perTriggerCap: Math.max(1, params.action.potency),
    remainingRounds: 0,
    durationKind: params.action.durationKind ?? "turns",
    sourceChassis: sourceChassisForAction(params.action),
    sourceCommitmentModifier: sourceCommitmentModifierForAction(params.action),
    createdRound: params.state.round,
    createdTurnActorId: params.state.currentTurnActorId ?? null,
    reapplyKey,
  };
  const nextPoints = existing
    ? Math.max(existing.remainingPoints, params.generatedPoints)
    : params.generatedPoints;
  const nextPool: CombatDefensivePool = {
    ...basePool,
    remainingPoints: nextPoints,
    initialPoints: Math.max(basePool.initialPoints, params.generatedPoints),
    perTriggerCap: Math.max(1, params.action.potency),
    remainingRounds: Math.max(1, params.durationRounds),
    durationKind: params.action.durationKind ?? "turns",
    sourceCommitmentModifier: sourceCommitmentModifierForAction(params.action),
    createdRound: existing?.createdRound ?? params.state.round,
    createdTurnActorId: existing?.createdTurnActorId ?? params.state.currentTurnActorId ?? null,
  };
  if (existing) {
    Object.assign(existing, nextPool);
  } else {
    params.state.defensivePools.push(nextPool);
  }
  if (params.action.passiveDuration) {
    const carrierExists = params.state.statusEffects.some(
      (effect) =>
        effect.passiveDuration &&
        effect.kind === "protection" &&
        effect.amount === 0 &&
        effect.sourceActorId === params.actor.id &&
        effect.targetActorId === params.target.id &&
        effect.sourceActionId === params.action.id,
    );
    if (!carrierExists) {
      params.state.statusEffects.push({
        id: `${params.state.round}:${params.actor.id}:${params.action.id}:${params.target.id}:defensive-pool-carrier`,
        sourceActorId: params.actor.id,
        targetActorId: params.target.id,
        kind: "protection",
        amount: 0,
        pool: woundChannel ?? "physical",
        sourceActionId: params.action.id,
        sourceActionName: params.action.name,
        sourceCooldownActionId: params.action.cooldownActionId ?? params.action.id,
        durationKind: "passive",
        durationSource: params.action.durationSource,
        passiveDuration: true,
        modifiesRollResults: false,
        remainingRounds: Number.MAX_SAFE_INTEGER,
      });
    }
  }
  recordDefensivePool(params.metrics, nextPool, (totals) => {
    if (existing) {
      totals.refreshReplaceEvents += 1;
    } else {
      totals.poolsCreated += 1;
    }
    totals.generatedPoints += params.generatedPoints;
  });
  emitTranscriptEvent(params.state, {
    type: "defensivePool",
    actorId: params.actor.id,
    actorName: params.actor.name,
    targetId: params.target.id,
    targetName: params.target.name,
    actionId: params.action.id,
    actionName: params.action.name,
    lane: params.lane,
    message: existing
      ? `Defensive pool refreshed: ${params.action.name} keeps ${params.target.name}'s ${poolType} pool at ${nextPool.remainingPoints} point${nextPool.remainingPoints === 1 ? "" : "s"} for ${nextPool.remainingRounds} turn${nextPool.remainingRounds === 1 ? "" : "s"}; repeated applications replace rather than add.`
      : `Defensive pool created: ${params.action.name} gives ${params.target.name} ${params.generatedPoints} ${poolType} point${params.generatedPoints === 1 ? "" : "s"} for ${nextPool.remainingRounds} turn${nextPool.remainingRounds === 1 ? "" : "s"}; per-trigger cap ${nextPool.perTriggerCap}.`,
    details: {
      poolType,
      generatedPoints: params.generatedPoints,
      remainingPoints: nextPool.remainingPoints,
      perTriggerCap: nextPool.perTriggerCap,
      durationRounds: nextPool.remainingRounds,
      sourceChassis: nextPool.sourceChassis,
      sourceCommitmentModifier: nextPool.sourceCommitmentModifier,
      refreshed: Boolean(existing),
    },
  });
}

function isDefensivePoolSetupAction(action: CombatAction): boolean {
  if (action.kind !== "defence") return false;
  const durationKind = action.durationKind ?? "instant";
  const durationRounds = Math.max(0, Math.trunc(action.durationRounds ?? action.modifier?.durationRounds ?? 0));
  return durationKind !== "instant" || action.passiveDuration === true || durationRounds > 1;
}

function poolMatches(params: {
  pool: CombatDefensivePool;
  target: CombatActor;
  poolType: CombatDefensivePoolType;
  woundChannel?: "physical" | "mental";
  resistedAttribute?: CombatAction["defenceResistedAttribute"];
}) {
  if (params.pool.protectedActorId !== params.target.id) return false;
  if (params.pool.remainingPoints <= 0 || params.pool.remainingRounds <= 0) return false;
  if (params.pool.poolType !== params.poolType) return false;
  if (params.poolType === "PHYSICAL_BLOCK" && params.pool.woundChannel !== "physical") return false;
  if (params.poolType === "MENTAL_BLOCK" && params.pool.woundChannel !== "mental") return false;
  if (params.poolType === "RESIST" && params.pool.resistedAttribute !== params.resistedAttribute) return false;
  return true;
}

function estimatePoolCommit(
  state: CombatState,
  target: CombatActor,
  poolType: CombatDefensivePoolType,
  options: {
    incomingSuccesses?: number;
    incomingWounds?: number;
    woundChannel?: "physical" | "mental";
    resistedAttribute?: CombatAction["defenceResistedAttribute"];
  },
): number {
  const pool = state.defensivePools.find((entry) =>
    poolMatches({ pool: entry, target, poolType, woundChannel: options.woundChannel, resistedAttribute: options.resistedAttribute }),
  );
  if (!pool) return 0;
  if (poolType === "DODGE") {
    const degradation = peekDefenceDegradation(state, target.id, "dodge");
    const baseDice = Math.max(1, Math.trunc(target.dodgeDice ?? target.dodgeValue ?? 1));
    const diceCount = Math.max(1, baseDice - degradation);
    const expected = expectedSuccesses(
      diceCount,
      target.attributeDice.Guard ?? "D8",
      getAttributeModifier(state, target.id, "Guard"),
    );
    const needed = Math.max(0, Math.ceil((options.incomingSuccesses ?? 0) - expected));
    if (needed <= 0) return 0;
    return Math.min(pool.remainingPoints, pool.perTriggerCap, needed);
  }
  if (poolType === "PHYSICAL_BLOCK" || poolType === "MENTAL_BLOCK") {
    const woundChannel = poolType === "PHYSICAL_BLOCK" ? "physical" : "mental";
    const incomingWounds = Math.max(0, Math.trunc(options.incomingWounds ?? 0));
    if (incomingWounds <= 0) return 0;
    const defenceType = woundChannel;
    const attribute = woundChannel === "physical" ? "Guard" : "Bravery";
    const baseDice = Math.max(1, Math.trunc(woundChannel === "physical" ? target.physicalDefenceDice ?? 1 : target.mentalDefenceDice ?? 1));
    const degradation = peekDefenceDegradation(state, target.id, defenceType);
    const diceCount = Math.max(1, baseDice - degradation);
    const blockPerSuccess = Math.max(
      0,
      Math.trunc(
        woundChannel === "physical"
          ? target.physicalBlockPerSuccess ?? target.physicalDefenceBlock ?? 0
          : target.mentalBlockPerSuccess ?? target.mentalDefenceBlock ?? 0,
      ),
    );
    const expectedBlocked = expectedSuccesses(
      diceCount,
      target.attributeDice[attribute] ?? "D8",
      getAttributeModifier(state, target.id, attribute),
    ) * blockPerSuccess;
    const needed = Math.max(0, Math.ceil(incomingWounds - expectedBlocked));
    return Math.min(pool.remainingPoints, pool.perTriggerCap, needed);
  }
  if (poolType === "RESIST") {
    const incomingSuccesses = Math.max(0, Math.trunc(options.incomingSuccesses ?? 0));
    if (!options.resistedAttribute || incomingSuccesses <= 0) return 0;
    const baseResistDice = Math.max(1, 3 + (target.resist[options.resistedAttribute] ?? 0));
    const degradation = peekActiveResistDegradation(state, target.id, options.resistedAttribute);
    const resistDice = Math.max(1, baseResistDice - degradation);
    const attribute = CORE_TO_COMBAT_ATTRIBUTE[options.resistedAttribute] ?? "Guard";
    const expectedCancelled = expectedSuccesses(
      resistDice,
      target.attributeDice[attribute] ?? "D8",
      getAttributeModifier(state, target.id, attribute),
    );
    const needed = Math.max(0, Math.ceil(incomingSuccesses - expectedCancelled));
    return Math.min(pool.remainingPoints, pool.perTriggerCap, needed);
  }
  return 0;
}

function commitDefensivePool(params: {
  state: CombatState;
  metrics: CombatResolutionMetrics;
  target: CombatActor;
  poolType: CombatDefensivePoolType;
  requested: number;
  woundChannel?: "physical" | "mental";
  resistedAttribute?: CombatAction["defenceResistedAttribute"];
}) {
  const pool = params.state.defensivePools
    .filter((entry) =>
      poolMatches({
        pool: entry,
        target: params.target,
        poolType: params.poolType,
        woundChannel: params.woundChannel,
        resistedAttribute: params.resistedAttribute,
      }),
    )
    .sort((left, right) => right.remainingPoints - left.remainingPoints)[0];
  if (!pool || params.requested <= 0) return null;
  const committed = Math.min(pool.remainingPoints, pool.perTriggerCap, Math.max(0, Math.trunc(params.requested)));
  if (committed <= 0) return null;
  pool.remainingPoints -= committed;
  recordDefensivePool(params.metrics, pool, (totals) => {
    totals.committedPoints += committed;
    totals.spentPoints += committed;
  });
  emitTranscriptEvent(params.state, {
    type: "defensivePool",
    actorId: params.target.id,
    actorName: params.target.name,
    actionId: pool.sourceActionId,
    actionName: pool.sourceActionName,
    lane: "response",
    message: `Defensive pool commit: ${params.target.name} commits ${committed} point${committed === 1 ? "" : "s"} from ${pool.sourceActionName} ${pool.poolType}; ${pool.remainingPoints} remain.`,
    details: {
      poolType: pool.poolType,
      committed,
      remainingPoints: pool.remainingPoints,
      perTriggerCap: pool.perTriggerCap,
    },
  });
  return { pool, committed };
}

function finishDefensivePoolCommit(params: {
  metrics: CombatResolutionMetrics;
  pool: CombatDefensivePool;
  committed: number;
  effective: number;
  result: "dodge" | "block" | "resist";
}) {
  const effective = Math.min(params.committed, Math.max(0, params.effective));
  recordDefensivePool(params.metrics, params.pool, (totals) => {
    totals.wastedPoints += Math.max(0, params.committed - effective);
    if (params.result === "dodge" && effective > 0) totals.dodgeAvoids += 1;
    if (params.result === "block") totals.blockWoundsPrevented += effective;
    if (params.result === "resist") totals.resistUnitsCancelled += effective;
  });
  if (params.pool.remainingPoints <= 0) {
    recordDefensivePoolExpiry(params.metrics, params.pool, "empty");
  }
}

function removeEmptyDefensivePool(state: CombatState, pool: CombatDefensivePool) {
  if (pool.remainingPoints <= 0) {
    state.defensivePools = state.defensivePools.filter((entry) => entry.id !== pool.id);
  }
}

function resolveDodgePoolOnly(state: CombatState, target: CombatActor, incomingSuccesses: number): CombatResolutionMetrics {
  const metrics = emptyResolution();
  if (incomingSuccesses <= 0) return metrics;
  const poolCommit = commitDefensivePool({
    state,
    metrics,
    target,
    poolType: "DODGE",
    requested: estimatePoolOnlyCommit(state, target, "DODGE", { incomingSuccesses }),
  });
  if (!poolCommit) return metrics;
  const dodgeSucceeded = poolCommit.committed >= incomingSuccesses;
  metrics.dodgeSuccesses = poolCommit.committed;
  if (dodgeSucceeded) {
    metrics.woundsAvoidedByDodge = incomingSuccesses;
  }
  finishDefensivePoolCommit({
    metrics,
    pool: poolCommit.pool,
    committed: poolCommit.committed,
    effective: dodgeSucceeded ? Math.min(poolCommit.committed, incomingSuccesses) : 0,
    result: "dodge",
  });
  removeEmptyDefensivePool(state, poolCommit.pool);
  emitTranscriptEvent(state, {
    type: "defensivePool",
    actorId: target.id,
    actorName: target.name,
    lane: "response",
    actionId: poolCommit.pool.sourceActionId,
    actionName: poolCommit.pool.sourceActionName,
    message: `Defensive pool-only Dodge: ${target.name} spends ${poolCommit.committed} ${poolCommit.pool.sourceActionName} point${poolCommit.committed === 1 ? "" : "s"} against ${incomingSuccesses} incoming success${incomingSuccesses === 1 ? "" : "es"}; normal Dodge is not rolled and Dodge degradation is not applied. Dodge ${dodgeSucceeded ? "succeeds" : "fails"}.`,
    details: {
      poolType: "DODGE",
      committed: poolCommit.committed,
      incomingSuccesses,
      dodgeSucceeded,
      normalDefenceSkipped: true,
    },
  });
  return metrics;
}

function resolveBlockPoolOnly(
  state: CombatState,
  target: CombatActor,
  pool: "physical" | "mental",
  wounds: number,
  context: { ongoingPerTick?: boolean } = {},
): CombatResolutionMetrics {
  const metrics = emptyResolution();
  if (wounds <= 0) return metrics;
  const poolType = pool === "physical" ? "PHYSICAL_BLOCK" : "MENTAL_BLOCK";
  const poolCommit = commitDefensivePool({
    state,
    metrics,
    target,
    poolType,
    requested: estimatePoolOnlyCommit(state, target, poolType, {
      woundChannel: pool,
      incomingWounds: wounds,
    }),
    woundChannel: pool,
  });
  if (!poolCommit) return metrics;
  const blocked = Math.min(wounds, poolCommit.committed);
  metrics.defenceStringBlocked = blocked;
  metrics.protectionPrevented = blocked;
  finishDefensivePoolCommit({
    metrics,
    pool: poolCommit.pool,
    committed: poolCommit.committed,
    effective: blocked,
    result: "block",
  });
  removeEmptyDefensivePool(state, poolCommit.pool);
  emitTranscriptEvent(state, {
    type: "defensivePool",
    actorId: target.id,
    actorName: target.name,
    lane: "response",
    actionId: poolCommit.pool.sourceActionId,
    actionName: poolCommit.pool.sourceActionName,
    message: `Defensive pool-only Block: ${target.name} spends ${poolCommit.committed} ${poolCommit.pool.sourceActionName} point${poolCommit.committed === 1 ? "" : "s"} to prevent ${blocked} of ${wounds} ${context.ongoingPerTick ? "ongoing " : ""}${pool} wound${wounds === 1 ? "" : "s"}; normal ${pool} defence is not rolled and defence degradation is not applied.`,
    details: {
      poolType,
      pool,
      committed: poolCommit.committed,
      blocked,
      incomingWounds: wounds,
      normalDefenceSkipped: true,
    },
  });
  return metrics;
}

function resolveResistPoolOnly(
  state: CombatState,
  target: CombatActor,
  action: CombatAction,
  successes: number,
): CombatResolutionMetrics {
  const metrics = emptyResolution();
  metrics.hostileSuccessesBeforeResist = successes;
  metrics.hostileSuccessesAfterResist = successes;
  if (!action.resistAttribute || successes <= 0) return metrics;
  const poolCommit = commitDefensivePool({
    state,
    metrics,
    target,
    poolType: "RESIST",
    requested: estimatePoolOnlyCommit(state, target, "RESIST", {
      resistedAttribute: action.resistAttribute,
      incomingSuccesses: successes,
    }),
    resistedAttribute: action.resistAttribute,
  });
  if (!poolCommit) return metrics;
  const cancelled = Math.min(successes, poolCommit.committed);
  finishDefensivePoolCommit({
    metrics,
    pool: poolCommit.pool,
    committed: poolCommit.committed,
    effective: cancelled,
    result: "resist",
  });
  removeEmptyDefensivePool(state, poolCommit.pool);
  metrics.resistSuccesses = poolCommit.committed;
  metrics.resistCancelled = cancelled;
  metrics.hostileSuccessesCancelledByResist = cancelled;
  metrics.hostileSuccessesAfterResist = Math.max(0, successes - cancelled);
  emitTranscriptEvent(state, {
    type: "defensivePool",
    actorId: target.id,
    actorName: target.name,
    lane: "response",
    actionId: poolCommit.pool.sourceActionId,
    actionName: poolCommit.pool.sourceActionName,
    message: `Defensive pool-only Resist: ${target.name} spends ${poolCommit.committed} ${poolCommit.pool.sourceActionName} point${poolCommit.committed === 1 ? "" : "s"} against ${successes} ${action.resistAttribute} hostile success${successes === 1 ? "" : "es"}; normal active Resist is not rolled and active Resist degradation is not applied. Cancelled ${cancelled}.`,
    details: {
      poolType: "RESIST",
      resistedAttribute: action.resistAttribute,
      committed: poolCommit.committed,
      cancelled,
      incomingSuccesses: successes,
      remainingSuccesses: metrics.hostileSuccessesAfterResist,
      normalDefenceSkipped: true,
    },
  });
  return metrics;
}

function recordOngoingFirstTick(params: {
  metrics: CombatResolutionMetrics;
  state: CombatState;
  effect: CombatState["statusEffects"][number];
  damage: number;
  firstTickBeforeCleanup: boolean;
  lethal: boolean;
}) {
  const sourceActor = sourceActorForEffect(params.state, params.effect);
  if (!sourceActor) return;
  recordOngoingPressure(
    params.metrics,
    sourceActor,
    params.effect.sourceActionId ?? params.effect.sourceActionName ?? "unknown-ongoing-action",
    params.effect.sourceActionName ?? "Ongoing Damage",
    (totals) => {
      totals.ticksAppliedTotal += 1;
      totals.totalOngoingDamage += params.damage;
      if (!params.effect.firstTickApplied) {
        totals.firstTicksApplied += 1;
        totals.firstTickDamageTotal += params.damage;
        totals.firstTickBeforeCleanup += params.firstTickBeforeCleanup ? 1 : 0;
        totals.firstTickLethal += params.lethal ? 1 : 0;
      }
    },
  );
}

function recordOngoingCleanup(params: {
  metrics: CombatResolutionMetrics;
  state: CombatState;
  effect: CombatState["statusEffects"][number];
  removedWounds: number;
  cleanupUnitsRemoved: number;
  amountBefore: number;
  remainingTicksAtCleanup: number;
}) {
  const sourceActor = sourceActorForEffect(params.state, params.effect);
  if (!sourceActor) return;
  recordOngoingPressure(
    params.metrics,
    sourceActor,
    params.effect.sourceActionId ?? params.effect.sourceActionName ?? "unknown-ongoing-action",
    params.effect.sourceActionName ?? "Ongoing Damage",
    (totals) => {
      totals.cleanupAttempts += 1;
      totals.cleanupSuccesses += params.removedWounds > 0 ? 1 : 0;
      totals.cleanupUnitsRemoved += params.cleanupUnitsRemoved;
      totals.cleanupWoundsRemoved += params.removedWounds;
      totals.cleanupRemainingTicksTotal += params.remainingTicksAtCleanup;
      totals.cleanupStoredTickRemovedTotal += Math.min(params.amountBefore, params.removedWounds);
      totals.cleanupPreventedWoundsEstimate += params.removedWounds * params.remainingTicksAtCleanup;
    },
  );
}

function resolveTargets(state: CombatState, actor: CombatActor, action: CombatAction, primaryTarget: CombatActor): CombatActor[] {
  if (action.targetPolicy === "allAllies" || action.targetPolicy === "allEnemies") {
    const legalTargets = getLivingActors(state, action.targetPolicy === "allAllies" ? actor.side : getOppositeSide(actor.side));
    const potentialTargets = Math.max(1, action.targetCount ?? (action.rangeCategory === "AOE" ? 4 : legalTargets.length));
    const actualCount = Math.min(legalTargets.length, Math.max(1, Math.round(0.6 * potentialTargets)));
    return legalTargets.slice(0, actualCount);
  }
  if (action.rangeCategory === "AOE") {
    const candidates = getLivingActors(
      state,
      action.targetPolicy === "ally" ? actor.side : getOppositeSide(actor.side),
    );
    const orderedCandidates = [
      primaryTarget,
      ...candidates.filter((candidate) => candidate.id !== primaryTarget.id),
    ];
    const potentialTargets = aoePotentialTargetCount(action);
    const actualCount = Math.min(orderedCandidates.length, Math.max(1, Math.round(0.6 * potentialTargets)));
    return orderedCandidates.slice(0, actualCount);
  }
  const candidates = getLivingActors(
    state,
    action.targetPolicy === "enemy" ? getOppositeSide(actor.side) : action.targetPolicy === "ally" ? actor.side : undefined,
  ).filter((candidate) => candidate.id !== primaryTarget.id);
  return [
    primaryTarget,
    ...candidates.slice(0, Math.max(1, action.targetCount ?? 1) - 1),
  ];
}

function actionUsesAoeAbstraction(action: CombatAction): boolean {
  return action.targetPolicy === "allAllies" || action.targetPolicy === "allEnemies" || action.rangeCategory === "AOE";
}

function aoePotentialTargetCount(action: CombatAction): number {
  return Math.max(1, action.targetCount ?? 4);
}

function resolveResist(state: CombatState, target: CombatActor, action: CombatAction, successes: number, rng: Rng, assistTriggerId?: string | null): CombatResolutionMetrics {
  const metrics = emptyResolution();
  metrics.hostileSuccessesBeforeResist = successes;
  metrics.hostileSuccessesAfterResist = successes;
  if (!action.resistAttribute || successes <= 0) return metrics;
  if (target.defensivePoolCommitmentMode === "poolOnly") {
    const poolOnlyMetrics = resolveResistPoolOnly(state, target, action, successes);
    if (poolOnlyMetrics.defensivePools.bySourceSide[target.side].committedPoints > 0) {
      return poolOnlyMetrics;
    }
  }
  const requestedPoolCommit = estimatePoolCommit(state, target, "RESIST", {
    resistedAttribute: action.resistAttribute,
    incomingSuccesses: successes,
  });
  const poolCommit = commitDefensivePool({
    state,
    metrics,
    target,
    poolType: "RESIST",
    requested: requestedPoolCommit,
    resistedAttribute: action.resistAttribute,
  });
  const degradation = takeActiveResistDegradation(state, target.id, action.resistAttribute);
  const baseResistDice = Math.max(1, 3 + (target.resist[action.resistAttribute] ?? 0));
  const resistDice = Math.max(1, baseResistDice - degradation);
  const attribute = CORE_TO_COMBAT_ATTRIBUTE[action.resistAttribute] ?? "Guard";
  const resistRoll = rollAttributeDice({ state, actor: target, attribute, diceCount: resistDice, rng });
  const rollSummary = summarizeRoll({ actor: target, reason: `${action.name} resist`, attribute, roll: resistRoll });
  const poolCancelled = Math.min(Math.max(0, successes - resistRoll.successes), poolCommit?.committed ?? 0);
  const cancelledBeforeAssist = Math.min(successes, resistRoll.successes + poolCancelled);
  const assistPressure = consumeAssistPressure({
    state,
    metrics,
    triggerId: assistTriggerId,
    lane: "resist",
    maxReduction: cancelledBeforeAssist,
    resistedAttribute: action.resistAttribute,
  });
  const cancelled = Math.max(0, cancelledBeforeAssist - assistPressure.spent);
  if (poolCommit) {
    finishDefensivePoolCommit({
      metrics,
      pool: poolCommit.pool,
      committed: poolCommit.committed,
      effective: poolCancelled,
      result: "resist",
    });
    if (poolCommit.pool.remainingPoints <= 0) {
      state.defensivePools = state.defensivePools.filter((entry) => entry.id !== poolCommit.pool.id);
    }
  }
  metrics.resistRolls = 1;
  metrics.resistSuccesses = Math.max(0, resistRoll.successes + (poolCommit?.committed ?? 0) - assistPressure.spent);
  metrics.resistCancelled = cancelled;
  metrics.degradedDefenceRolls = degradation > 0 ? 1 : 0;
  recordModifiedResistRoll(metrics, resistRoll.modifier);
  metrics.hostileSuccessesCancelledByResist = cancelled;
  metrics.hostileSuccessesAfterResist = Math.max(0, successes - cancelled);
  emitTranscriptEvent(state, {
    type: "resistRoll",
    actorId: target.id,
    actorName: target.name,
    actionId: action.id,
    actionName: action.name,
    lane: "response",
    message: `${rollText(rollSummary)}${poolCommit ? ` Resist pool adds ${poolCommit.committed} cancellation unit${poolCommit.committed === 1 ? "" : "s"}.` : ""}${assistPressure.spent > 0 ? ` Assist pressure reduces Resist cancellation by ${assistPressure.spent}.` : ""} Resist formula 3 + ${action.resistAttribute} resist value = ${baseResistDice} dice; degradation ${degradation}, final dice ${resistDice}; cancelled ${cancelled} of ${successes} hostile successes.`,
    roll: rollSummary,
    details: {
      resistAttribute: action.resistAttribute,
      baseResistDice,
      degradation,
      resistDice,
      incomingSuccesses: successes,
      cancelled,
      poolCancelled,
      cancelledBeforeAssist,
      assistPressureSpent: assistPressure.spent,
      assistPressureWasted: assistPressure.wasted,
      remainingSuccesses: metrics.hostileSuccessesAfterResist,
    },
  });
  return metrics;
}

function cleanupAttributeForEffect(effect: CombatState["statusEffects"][number]): CombatAttributeName {
  if (effect.cleanupAttribute) return effect.cleanupAttribute;
  if (effect.kind === "ongoingDamage") return (effect.pool ?? "physical") === "mental" ? "Bravery" : "Fortitude";
  if (effect.attribute) return effect.attribute;
  return "Fortitude";
}

function cleanupUnitWoundsForEffect(effect: CombatState["statusEffects"][number]): number {
  return Math.max(1, Math.trunc(effect.cleanupUnitWounds ?? 1));
}

function cleanableHostileEffects(state: CombatState, actor: CombatActor) {
  return state.statusEffects
    .filter((effect) =>
      effect.targetActorId === actor.id &&
      effect.sourceActorId !== actor.id &&
      effect.amount > 0 &&
      effect.remainingRounds > 0 &&
      (effect.kind === "ongoingDamage" || effect.kind === "mainActionDenied" || effect.kind === "debuff"),
    )
    .sort((left, right) => {
      const leftUrgency = left.kind === "ongoingDamage"
        ? left.amount * Math.max(1, left.remainingRounds - 1)
        : left.amount;
      const rightUrgency = right.kind === "ongoingDamage"
        ? right.amount * Math.max(1, right.remainingRounds - 1)
        : right.amount;
      return rightUrgency - leftUrgency;
    });
}

function resolveUniversalCleanupAction(params: {
  state: CombatState;
  actor: CombatActor;
  action: CombatAction;
  rng: Rng;
  lane?: CombatActionLane;
}): CombatResolutionMetrics {
  const { state, actor, action, rng, lane } = params;
  const metrics = emptyResolution();
  const removable = cleanableHostileEffects(state, actor)[0];
  if (!removable) {
    metrics.wastedActions = 1;
    emitTranscriptEvent(state, {
      type: "actionSkipped",
      actorId: actor.id,
      actorName: actor.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Main Action: ${actor.name} has no hostile ongoing damage or stack effect to clean up.`,
      details: { reason: "noCleanableHostileEffect" },
    });
    return metrics;
  }

  const attribute = cleanupAttributeForEffect(removable);
  const coreAttribute = COMBAT_TO_CORE_ATTRIBUTE[attribute];
  const resistDice = Math.max(1, 3 + (actor.resist[coreAttribute] ?? 0));
  const roll = rollAttributeDice({ state, actor, attribute, diceCount: resistDice, rng });
  const rollSummary = summarizeRoll({
    actor,
    reason: `clean up ${removable.sourceActionName ?? removable.kind}`,
    attribute,
    roll,
  });
  const before = Math.max(0, removable.amount);
  const cleanupUnits = removable.kind === "ongoingDamage" ? roll.successes : Math.min(before, roll.successes);
  const unitWounds = removable.kind === "ongoingDamage" ? cleanupUnitWoundsForEffect(removable) : 1;
  const removed = removable.kind === "ongoingDamage"
    ? Math.min(before, cleanupUnits * unitWounds)
    : Math.min(before, cleanupUnits);
  const cleanupUnitsRemoved =
    removable.kind === "ongoingDamage" && removed > 0
      ? Math.min(cleanupUnits, Math.max(1, Math.ceil(removed / unitWounds)))
      : 0;
  if (removable.kind === "ongoingDamage") {
    removable.cleanupAttempted = true;
    recordOngoingCleanup({
      metrics,
      state,
      effect: removable,
      removedWounds: removed,
      cleanupUnitsRemoved,
      amountBefore: before,
      remainingTicksAtCleanup: Math.max(0, removable.remainingRounds),
    });
  }
  removable.amount = Math.max(0, before - removed);

  metrics.resistRolls = 1;
  metrics.resistSuccesses = roll.successes;
  metrics.mitigationApplied = removed;
  recordModifiedResistRoll(metrics, roll.modifier);
  if (removable.kind === "ongoingDamage") {
    metrics.ongoingDamagePreventedOrCleansed = removed;
  } else {
    metrics.stacksCleansed = removed;
  }
  if (removable.amount <= 0) {
    removeStatusEffectById(state, removable.id);
  }

  emitTranscriptEvent(state, {
    type: "mainAction",
    actorId: actor.id,
    actorName: actor.name,
    actionId: action.id,
    actionName: action.name,
    targetId: actor.id,
    targetName: actor.name,
    lane,
    message: `Main Action: ${actor.name} attempts to resist ${removable.sourceActionName ?? removable.kind} ${removable.kind === "ongoingDamage" ? "ongoing damage" : "stacks"}.`,
    details: {
      effect: removable.kind,
      sourceActionName: removable.sourceActionName,
      cleanupAttribute: attribute,
      amountBefore: before,
      cleanupUnitWounds: removable.kind === "ongoingDamage" ? unitWounds : undefined,
    },
  });
  if (removable.kind === "ongoingDamage") {
    emitTranscriptEvent(state, {
      type: "cleanseRoll",
      actorId: actor.id,
      actorName: actor.name,
      actionId: action.id,
      actionName: action.name,
      targetId: actor.id,
      targetName: actor.name,
      lane,
      message: `Cleanup Resist: ${actor.name} attempts to remove ${removable.sourceActionName ?? "ongoing damage"} ongoing damage.`,
      details: {
        effect: "ongoingDamage",
        sourceActionName: removable.sourceActionName,
        amountBefore: before,
      },
    });
  }
  emitTranscriptEvent(state, {
    type: "cleanseRoll",
    actorId: actor.id,
    actorName: actor.name,
    actionId: action.id,
    actionName: action.name,
    targetId: actor.id,
    targetName: actor.name,
    lane,
    message: `Roll: ${rollText(rollSummary)} Resist formula 3 + ${coreAttribute} resist value = ${resistDice} dice.`,
    roll: rollSummary,
    details: {
      effect: removable.kind,
      cleanupAttribute: attribute,
      resistAttribute: coreAttribute,
      resistDice,
      successes: roll.successes,
      cleanupUnits,
      cleanupUnitWounds: removable.kind === "ongoingDamage" ? unitWounds : undefined,
    },
  });
  if (removable.kind === "ongoingDamage") {
    const woundLabel = removable.damageLabel ?? removable.pool ?? "physical";
    emitTranscriptEvent(state, {
      type: "stackChanged",
      actorId: actor.id,
      actorName: actor.name,
      actionId: action.id,
      actionName: action.name,
      targetId: actor.id,
      targetName: actor.name,
      lane,
      message: `Cleanup result: removed ${cleanupUnitsRemoved} ongoing unit${cleanupUnitsRemoved === 1 ? "" : "s"} from ${removable.sourceActionName ?? "ongoing damage"}.`,
      details: {
        effect: "ongoingDamage",
        cleanupUnitsRemoved,
        removedWounds: removed,
        amountBefore: before,
        amountAfter: removable.amount,
      },
    });
    emitTranscriptEvent(state, {
      type: "stackChanged",
      actorId: actor.id,
      actorName: actor.name,
      actionId: action.id,
      actionName: action.name,
      targetId: actor.id,
      targetName: actor.name,
      lane,
      message:
        removable.amount > 0
          ? `Cleanup: ${actor.name} removes ${cleanupUnits} ongoing unit${cleanupUnits === 1 ? "" : "s"} from ${removable.sourceActionName ?? "ongoing damage"} (${cleanupUnits} x ${unitWounds} = ${cleanupUnits * unitWounds}), reducing it from ${before} to ${removable.amount} ${woundLabel} wounds per tick.`
          : `Cleanup: ${actor.name} removes ${cleanupUnits} ongoing unit${cleanupUnits === 1 ? "" : "s"} from ${removable.sourceActionName ?? "ongoing damage"} (${cleanupUnits} x ${unitWounds} = ${cleanupUnits * unitWounds}), reducing it from ${before} to 0 ${woundLabel} wounds per tick.`,
      details: { effect: "ongoingDamage", removed, cleanupUnits, cleanupUnitWounds: unitWounds, amountBefore: before, amountAfter: removable.amount },
    });
    if (removable.amount <= 0) {
      emitTranscriptEvent(state, {
        type: "stackChanged",
        actorId: actor.id,
        actorName: actor.name,
        actionId: action.id,
        actionName: action.name,
        targetId: actor.id,
        targetName: actor.name,
        lane,
        message: `Cleanup: ${removable.sourceActionName ?? "ongoing damage"} ongoing damage is removed from ${actor.name}.`,
        details: { effect: "ongoingDamage", removed: true },
      });
    }
  } else {
    emitTranscriptEvent(state, {
      type: "stackChanged",
      actorId: actor.id,
      actorName: actor.name,
      actionId: action.id,
      actionName: action.name,
      targetId: actor.id,
      targetName: actor.name,
      lane,
      message:
        removable.amount > 0
          ? `Cleanup: ${actor.name} removes ${removed} stack${removed === 1 ? "" : "s"} from ${removable.sourceActionName ?? removable.kind}, reducing it from ${before} to ${removable.amount}.`
          : `Cleanup: ${actor.name} removes ${removed} stack${removed === 1 ? "" : "s"} from ${removable.sourceActionName ?? removable.kind}; ${removable.sourceActionName ?? removable.kind} is removed.`,
      details: { effect: removable.kind, removed, amountBefore: before, amountAfter: removable.amount },
    });
  }

  return metrics;
}

function cleanableHostileEffectsForTarget(state: CombatState, actor: CombatActor, target: CombatActor) {
  return state.statusEffects
    .filter((effect) =>
      effect.targetActorId === target.id &&
      effect.sourceActorId !== actor.id &&
      effect.amount > 0 &&
      effect.remainingRounds > 0 &&
      (effect.kind === "ongoingDamage" || effect.kind === "mainActionDenied" || effect.kind === "debuff"),
    )
    .sort((left, right) => {
      const leftUrgency = left.kind === "ongoingDamage"
        ? left.amount * Math.max(1, left.remainingRounds - 1)
        : left.amount;
      const rightUrgency = right.kind === "ongoingDamage"
        ? right.amount * Math.max(1, right.remainingRounds - 1)
        : right.amount;
      return rightUrgency - leftUrgency;
    });
}

function resolveAuthoredResistCleanupAction(params: {
  state: CombatState;
  actor: CombatActor;
  action: CombatAction;
  target: CombatActor;
  appliedSuccesses: number;
  rollSummary: CombatRollSummary | null;
  lane?: CombatActionLane;
}): CombatResolutionMetrics {
  const { state, actor, action, target, appliedSuccesses, rollSummary, lane } = params;
  const metrics = emptyResolution();
  const resistedAttribute = action.defenceResistedAttribute;
  if (!resistedAttribute) {
    metrics.wastedActions = 1;
    emitTranscriptEvent(state, {
      type: "actionSkipped",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Resist: ${action.name} has no authored resisted attribute; Combat Lab cannot match it to a hostile effect.`,
      details: { reason: "missingDefenceResistedAttribute" },
    });
    return metrics;
  }

  const matching = cleanableHostileEffectsForTarget(state, actor, target).find(
    (effect) => COMBAT_TO_CORE_ATTRIBUTE[cleanupAttributeForEffect(effect)] === resistedAttribute,
  );
  if (!matching) {
    metrics.wastedActions = 1;
    emitTranscriptEvent(state, {
      type: "actionSkipped",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Resist: ${action.name} found no matching ${resistedAttribute} hostile effect on ${target.name}.`,
      details: { resistedAttribute, reason: "noMatchingHostileEffect" },
    });
    return metrics;
  }

  const before = Math.max(0, matching.amount);
  const totalResists = Math.max(0, appliedSuccesses * Math.max(1, action.potency));
  const unitWounds = matching.kind === "ongoingDamage" ? cleanupUnitWoundsForEffect(matching) : 1;
  const removed = matching.kind === "ongoingDamage"
    ? Math.min(before, totalResists * unitWounds)
    : Math.min(before, totalResists);
  const cleanupUnitsRemoved =
    matching.kind === "ongoingDamage" && removed > 0
      ? Math.min(totalResists, Math.max(1, Math.ceil(removed / unitWounds)))
      : 0;
  if (matching.kind === "ongoingDamage") {
    matching.cleanupAttempted = true;
    recordOngoingCleanup({
      metrics,
      state,
      effect: matching,
      removedWounds: removed,
      cleanupUnitsRemoved,
      amountBefore: before,
      remainingTicksAtCleanup: Math.max(0, matching.remainingRounds),
    });
  }
  matching.amount = Math.max(0, before - removed);
  metrics.resistRolls = 1;
  metrics.resistSuccesses = totalResists;
  metrics.mitigationApplied = removed;
  if (matching.kind === "ongoingDamage") {
    metrics.ongoingDamagePreventedOrCleansed = removed;
  } else {
    metrics.stacksCleansed = removed;
  }
  if (matching.amount <= 0) {
    removeStatusEffectById(state, matching.id);
  }

  emitTranscriptEvent(state, {
    type: "resistRoll",
    actorId: actor.id,
    actorName: actor.name,
    targetId: target.id,
    targetName: target.name,
    actionId: action.id,
    actionName: action.name,
    lane,
    message: `Resist: ${action.name} rolls ${appliedSuccesses} success${appliedSuccesses === 1 ? "" : "es"} x ${Math.max(1, action.potency)} = ${totalResists} ${resistedAttribute} Resists against ${matching.sourceActionName ?? matching.kind}.`,
    roll: rollSummary ?? undefined,
    details: {
      resistedAttribute,
      totalResists,
      appliedSuccesses,
      effect: matching.kind,
      amountBefore: before,
    },
  });
  if (matching.kind === "ongoingDamage") {
    emitTranscriptEvent(state, {
      type: "cleanseRoll",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Cleanup Resist: ${target.name} attempts to remove ${matching.sourceActionName ?? "ongoing damage"} ongoing damage.`,
      details: {
        effect: "ongoingDamage",
        sourceActionName: matching.sourceActionName,
        amountBefore: before,
      },
    });
  }

  const woundLabel = matching.damageLabel ?? matching.pool ?? "physical";
  if (matching.kind === "ongoingDamage") {
    emitTranscriptEvent(state, {
      type: "stackChanged",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Cleanup result: removed ${cleanupUnitsRemoved} ongoing unit${cleanupUnitsRemoved === 1 ? "" : "s"} from ${matching.sourceActionName ?? "ongoing damage"}.`,
      details: {
        effect: "ongoingDamage",
        cleanupUnitsRemoved,
        removedWounds: removed,
        amountBefore: before,
        amountAfter: matching.amount,
      },
    });
  }
  emitTranscriptEvent(state, {
    type: "stackChanged",
    actorId: actor.id,
    actorName: actor.name,
    targetId: target.id,
    targetName: target.name,
    actionId: action.id,
    actionName: action.name,
    lane,
    message: matching.kind === "ongoingDamage"
      ? matching.amount > 0
        ? `Resist cleanup: ${action.name} removes ${removed} ${woundLabel} wounds per tick from ${matching.sourceActionName ?? "ongoing damage"}, reducing it from ${before} to ${matching.amount}.`
        : `Resist cleanup: ${action.name} removes ${matching.sourceActionName ?? "ongoing damage"} from ${target.name}.`
      : matching.amount > 0
        ? `Resist cleanup: ${action.name} removes ${removed} stack${removed === 1 ? "" : "s"} from ${matching.sourceActionName ?? matching.kind}, reducing it from ${before} to ${matching.amount}.`
        : `Resist cleanup: ${action.name} removes ${matching.sourceActionName ?? matching.kind} from ${target.name}.`,
    details: {
      effect: matching.kind,
      removed,
      amountBefore: before,
      amountAfter: matching.amount,
      cleanupUnitWounds: matching.kind === "ongoingDamage" ? unitWounds : undefined,
    },
  });

  return metrics;
}

function passiveDefenceAmount(target: CombatActor, pool: "physical" | "mental") {
  return target.actions
    .filter((action) => action.passive && action.kind === "defence" && (action.pool ?? pool) === pool)
    .reduce((sum, action) => sum + Math.max(1, action.protection ?? action.potency), 0);
}

function expectedIncomingAttack(params: {
  state: CombatState;
  attacker: CombatActor;
  target: CombatActor;
  incomingAction: CombatAction;
  pool: "physical" | "mental";
}) {
  const accuracyAttribute = effectiveAccuracyAttribute(params.attacker, params.target, params.incomingAction);
  const incomingSuccesses = expectedSuccesses(
    Math.max(0, params.incomingAction.diceCount),
    getActorDie(params.attacker, accuracyAttribute),
    getAttributeModifier(params.state, params.attacker.id, accuracyAttribute),
  );
  const effectPerSuccess = Math.max(1, params.incomingAction.effectPerPrimarySuccess ?? params.incomingAction.potency);
  const rawWounds = incomingSuccesses * effectPerSuccess;
  return { incomingSuccesses, rawWounds };
}

function estimateNormalDefenceTotalValue(params: {
  state: CombatState;
  target: CombatActor;
  pool: "physical" | "mental";
  incomingSuccesses: number;
  rawWounds: number;
}) {
  const activeDefenceValue = params.pool === "physical"
    ? Math.max(
        estimateDodgeValue(params.state, params.target, params.incomingSuccesses, params.rawWounds),
        estimateDefenceStringValue(params.state, params.target, params.pool, params.rawWounds),
      )
    : estimateDefenceStringValue(params.state, params.target, params.pool, params.rawWounds);
  const passiveDefence = passiveDefenceAmount(params.target, params.pool);
  const staticProtection =
    (params.pool === "physical" ? params.target.physicalProtection : params.target.mentalProtection) +
    getProtectionModifier(params.state, params.target.id, params.pool) +
    passiveDefence;
  return activeDefenceValue + Math.min(Math.max(0, params.rawWounds - activeDefenceValue), Math.max(0, staticProtection));
}

function estimateDodgeCounterValue(params: {
  state: CombatState;
  target: CombatActor;
  attacker: CombatActor;
  incomingAction: CombatAction;
  counterAction: CombatAction;
  pool: "physical" | "mental";
}) {
  const dodgePackets = actionAndSecondaries(params.counterAction).filter(
    (entry) => counterDefencePacketIsLegal(entry, params.pool, params.incomingAction) && (entry.defenceMode ?? "Block") === "Dodge",
  );
  if (dodgePackets.length === 0) return null;
  const { incomingSuccesses, rawWounds } = expectedIncomingAttack(params);
  if (incomingSuccesses <= 0 || rawWounds <= 0) {
    return {
      counterExpectedValue: 0,
      normalExpectedValue: 0,
      incomingSuccesses,
      rawWounds,
      dodgeThreshold: 1,
      dodgePotency: Math.max(1, dodgePackets[0]?.potency ?? 1),
      skipReason: "incoming action has no expected successful wound pressure",
    };
  }
  const protectedActor = params.target;
  const accuracyAttribute = effectiveAccuracyAttribute(params.target, protectedActor, params.counterAction);
  const totalPotency = dodgePackets.reduce((sum, entry) => sum + Math.max(1, entry.potency), 0);
  const dodgeThreshold = Math.max(1, Math.ceil(incomingSuccesses / Math.max(1, totalPotency)));
  const avoidProbability = probabilitySuccessesAtLeast({
    diceCount: Math.max(1, params.counterAction.diceCount),
    die: getActorDie(params.target, accuracyAttribute),
    modifier: getAttributeModifier(params.state, params.target.id, accuracyAttribute),
    threshold: dodgeThreshold,
  });
  const passiveDefence = passiveDefenceAmount(params.target, params.pool);
  const staticProtection =
    (params.pool === "physical" ? params.target.physicalProtection : params.target.mentalProtection) +
    getProtectionModifier(params.state, params.target.id, params.pool) +
    passiveDefence;
  const staticOnlyPrevention = Math.min(rawWounds, Math.max(0, staticProtection));
  const counterExpectedValue = avoidProbability * rawWounds + (1 - avoidProbability) * staticOnlyPrevention;
  const normalExpectedValue = estimateNormalDefenceTotalValue({
    state: params.state,
    target: params.target,
    pool: params.pool,
    incomingSuccesses,
    rawWounds,
  });
  const normalClearlyBetter = normalExpectedValue > counterExpectedValue + 0.5 && counterExpectedValue < normalExpectedValue * 0.9;
  return {
    counterExpectedValue,
    normalExpectedValue,
    incomingSuccesses,
    rawWounds,
    dodgeThreshold,
    dodgePotency: totalPotency,
    skipReason: normalClearlyBetter
      ? "normal defence plus static/passive mitigation has better expected prevention"
      : null,
  };
}

type CounterCandidateDiagnosticReason =
  | "selected"
  | "normalDefenceBetter"
  | "noResponse"
  | "cooldown"
  | "unsupported"
  | "nonAvoidable"
  | "nonApplicable";

function recordCounterCandidateDiagnostic(params: {
  state: CombatState;
  actor: CombatActor;
  action: CombatAction;
  reason: CounterCandidateDiagnosticReason;
  expectedCounterPrevention?: number | null;
  expectedNormalPrevention?: number | null;
  message?: string | null;
}) {
  const { state, actor, action, reason } = params;
  const key = `${actor.id}:${action.id}`;
  const entry = state.counterCandidateDiagnostics[key] ??= {
    actorId: actor.id,
    actorName: actor.name,
    side: actor.side,
    actionId: action.id,
    actionName: action.name,
    sourceType: action.sourceType,
    considered: 0,
    selected: 0,
    skippedNormalDefenceBetter: 0,
    skippedNoResponse: 0,
    skippedCooldown: 0,
    skippedUnsupported: 0,
    skippedNonAvoidable: 0,
    skippedNonApplicable: 0,
    totalExpectedCounterPrevention: 0,
    totalExpectedNormalPrevention: 0,
    expectedSamples: 0,
    lastReason: null,
  };
  entry.considered += 1;
  if (reason === "selected") entry.selected += 1;
  if (reason === "normalDefenceBetter") entry.skippedNormalDefenceBetter += 1;
  if (reason === "noResponse") entry.skippedNoResponse += 1;
  if (reason === "cooldown") entry.skippedCooldown += 1;
  if (reason === "unsupported") entry.skippedUnsupported += 1;
  if (reason === "nonAvoidable") entry.skippedNonAvoidable += 1;
  if (reason === "nonApplicable") entry.skippedNonApplicable += 1;
  if (
    typeof params.expectedCounterPrevention === "number" &&
    Number.isFinite(params.expectedCounterPrevention) &&
    typeof params.expectedNormalPrevention === "number" &&
    Number.isFinite(params.expectedNormalPrevention)
  ) {
    entry.totalExpectedCounterPrevention += params.expectedCounterPrevention;
    entry.totalExpectedNormalPrevention += params.expectedNormalPrevention;
    entry.expectedSamples += 1;
  }
  entry.lastReason = params.message ?? reason;
}

type DeclaredCounter = {
  action: CombatAction;
  counteringActorId: string;
  protectedActorId: string;
  triggeringAttackerId: string;
  hasAttackPacket: boolean;
  hasDefencePacket: boolean;
  forfeitsNormalDefence: boolean;
};

type DeclaredCounterRoll = {
  declared: DeclaredCounter;
  successes: number;
  rollSummary: CombatRollSummary;
};

function actionAndSecondaries(action: CombatAction): CombatAction[] {
  return [action, ...(action.secondaryActions ?? [])];
}

function counterAttackPackets(action: CombatAction) {
  return actionAndSecondaries(action).filter((entry) => entry.kind === "attack");
}

function incomingActionExplicitlyAllowsDodge(action: CombatAction) {
  const gateResult = action.source?.power?.primaryDefenceGate?.gateResult;
  return gateResult === "DODGE" || gateResult === "DODGE_OR_PROTECTION";
}

function isDodgeableIncomingAction(action: CombatAction, pool: "physical" | "mental") {
  if (action.kind !== "attack") return false;
  if (incomingActionExplicitlyAllowsDodge(action)) return true;
  return action.kind === "attack" && pool === "physical" && !action.resistAttribute;
}

function counterDefencePacketIsLegal(
  entry: CombatAction,
  pool: "physical" | "mental",
  incomingAction: CombatAction,
) {
  if (entry.kind !== "defence") return false;
  const mode = entry.defenceMode ?? "Block";
  if (mode === "Block") return (entry.pool ?? pool) === pool;
  if (mode === "Dodge") return isDodgeableIncomingAction(incomingAction, pool);
  if (mode === "Resist") {
    return Boolean(entry.defenceResistedAttribute && incomingAction.resistAttribute === entry.defenceResistedAttribute);
  }
  return false;
}

function counterDefencePackets(action: CombatAction, pool: "physical" | "mental", incomingAction: CombatAction) {
  return actionAndSecondaries(action).filter(
    (entry) => counterDefencePacketIsLegal(entry, pool, incomingAction),
  );
}

function counterPriority(action: CombatAction, pool: "physical" | "mental", incomingAction: CombatAction) {
  const hasAttackPacket = counterAttackPackets(action).length > 0;
  const hasDefencePacket = counterDefencePackets(action, pool, incomingAction).length > 0;
  if (hasDefencePacket && !hasAttackPacket) return 0;
  if (hasDefencePacket && hasAttackPacket) return 1;
  if (hasAttackPacket) return 2;
  return 3;
}

function declareCounter(params: {
  state: CombatState;
  target: CombatActor;
  attacker: CombatActor;
  incomingAction: CombatAction;
  pool: "physical" | "mental";
}): { declared: DeclaredCounter | null; metrics: CombatResolutionMetrics } {
  const { state, target, attacker, incomingAction, pool } = params;
  const metrics = emptyResolution();
  const allCounterCandidates = target.actions
    .filter((action) => action.counterMode && !state.counterUses[`${state.round}:${target.id}:${action.id}`]);

  for (const candidate of allCounterCandidates) {
    if (!candidate.supported) {
      recordCounterCandidateDiagnostic({
        state,
        actor: target,
        action: candidate,
        reason: "unsupported",
        message: "counter action is marked unsupported",
      });
      continue;
    }
    if (counterPriority(candidate, pool, incomingAction) >= 3) {
      const hasDodgePacket = actionAndSecondaries(candidate).some(
        (entry) => entry.kind === "defence" && (entry.defenceMode ?? "Block") === "Dodge",
      );
      recordCounterCandidateDiagnostic({
        state,
        actor: target,
        action: candidate,
        reason: hasDodgePacket ? "nonAvoidable" : "nonApplicable",
        message: hasDodgePacket
          ? `${incomingAction.name} is non-physical and has no Dodge defence option for ${candidate.name}`
          : `${candidate.name} has no legal counter packet for ${incomingAction.name}`,
      });
    }
  }

  const legalCounterCandidates = allCounterCandidates
    .filter((action) => action.supported)
    .filter((action) => counterPriority(action, pool, incomingAction) < 3)
    .sort((left, right) => counterPriority(left, pool, incomingAction) - counterPriority(right, pool, incomingAction));

  const offCooldownCandidates = legalCounterCandidates.filter((candidate) => {
    if (!isActionOnCooldown(state, target.id, candidate.id)) return true;
    recordCooldownPreventedUse(state, target, candidate);
    recordCounterCandidateDiagnostic({
      state,
      actor: target,
      action: candidate,
      reason: "cooldown",
      message: `${candidate.name} is on cooldown`,
    });
    return false;
  });

  if (offCooldownCandidates.length > 0 && (state.responsesRemaining[target.id] ?? 0) <= 0) {
    for (const candidate of offCooldownCandidates) {
      recordCounterCandidateDiagnostic({
        state,
        actor: target,
        action: candidate,
        reason: "noResponse",
        message: `${target.name} has no response available for ${candidate.name}`,
      });
    }
    metrics.responsesWastedOrUnavailable = 1;
    return { declared: null, metrics };
  }

  const counterCandidates = offCooldownCandidates.filter((candidate) => {
    const dodgeCounterEstimate = estimateDodgeCounterValue({
      state,
      target,
      attacker,
      incomingAction,
      counterAction: candidate,
      pool,
    });
    if (!dodgeCounterEstimate?.skipReason) return true;
    recordCounterCandidateDiagnostic({
      state,
      actor: target,
      action: candidate,
      reason: "normalDefenceBetter",
      expectedCounterPrevention: dodgeCounterEstimate.counterExpectedValue,
      expectedNormalPrevention: dodgeCounterEstimate.normalExpectedValue,
      message: dodgeCounterEstimate.skipReason,
    });
    emitTranscriptEvent(state, {
      type: "counterDeclared",
      actorId: target.id,
      actorName: target.name,
      targetId: attacker.id,
      targetName: attacker.name,
      actionId: candidate.id,
      actionName: candidate.name,
      lane: "response",
      message: `Counter skipped: ${target.name} keeps normal defence instead of ${candidate.name}. ${dodgeCounterEstimate.skipReason}. Expected prevention: counter ${dodgeCounterEstimate.counterExpectedValue.toFixed(2)}, normal ${dodgeCounterEstimate.normalExpectedValue.toFixed(2)}.`,
      details: {
        reason: "normalDefenceBetter",
        counterExpectedValue: Number(dodgeCounterEstimate.counterExpectedValue.toFixed(4)),
        normalExpectedValue: Number(dodgeCounterEstimate.normalExpectedValue.toFixed(4)),
        expectedIncomingSuccesses: Number(dodgeCounterEstimate.incomingSuccesses.toFixed(4)),
        expectedRawWounds: Number(dodgeCounterEstimate.rawWounds.toFixed(4)),
        dodgeThreshold: dodgeCounterEstimate.dodgeThreshold,
        dodgePotency: dodgeCounterEstimate.dodgePotency,
      },
    });
    return false;
  });

  const action = counterCandidates[0];
  if (!action) return { declared: null, metrics };

  const hasAttackPacket = counterAttackPackets(action).length > 0;
  const hasDefencePacket = counterDefencePackets(action, pool, incomingAction).length > 0;
  const forfeitsNormalDefence = true;
  const declared: DeclaredCounter = {
    action,
    counteringActorId: target.id,
    protectedActorId: target.id,
    triggeringAttackerId: attacker.id,
    hasAttackPacket,
    hasDefencePacket,
    forfeitsNormalDefence,
  };

  emitTranscriptEvent(state, {
    type: "counterDeclared",
    actorId: target.id,
    actorName: target.name,
    targetId: attacker.id,
    targetName: attacker.name,
    actionId: action.id,
    actionName: action.name,
    lane: "response",
    message: `Counter declared: ${target.name} will use ${action.name} against ${incomingAction.name}.`,
    details: {
      incomingActionId: incomingAction.id,
      incomingActionName: incomingAction.name,
      counteringActorId: target.id,
      protectedActorId: target.id,
      triggeringAttackerId: attacker.id,
      hasAttackPacket,
      hasDefencePacket,
      forfeitsNormalDefence,
    },
  });
  emitTranscriptEvent(state, {
    type: "counterDeclared",
    actorId: target.id,
    actorName: target.name,
    targetId: attacker.id,
    targetName: attacker.name,
    actionId: action.id,
    actionName: action.name,
    lane: "response",
    message: `Counter replacement: ${action.name} replaces normal Dodge, Physical Defence, Mental Defence, or Resist for this trigger.`,
    details: { forfeitsNormalDefence: true },
  });
  if (forfeitsNormalDefence) {
    emitTranscriptEvent(state, {
      type: "counterDeclared",
      actorId: target.id,
      actorName: target.name,
      targetId: attacker.id,
      targetName: attacker.name,
      actionId: action.id,
      actionName: action.name,
      lane: "response",
      message: hasAttackPacket && !hasDefencePacket
        ? `Counter tradeoff: ${action.name} includes an Attack packet and no Defence packet, so it provides no incoming mitigation beyond already-active passive/static effects.`
        : hasDefencePacket
          ? `Counter tradeoff: ${action.name} uses its authored defensive packet instead of normal active defence against ${incomingAction.name}.`
          : `Counter tradeoff: ${action.name} has no hydrated Attack or Defence packet; normal active defence is still replaced, so any benefit must come from its supported Counter effect.`,
      details: { forfeitsNormalDefence: true },
    });
  }

  spendActorResponse(state, target.id);
  state.counterUses[`${state.round}:${target.id}:${action.id}`] = 1;
  recordActionUse(state, target, action);
  applyActionCooldown(state, target, action);
  recordCounterCandidateDiagnostic({
    state,
    actor: target,
    action,
    reason: "selected",
    message: `${action.name} selected against ${incomingAction.name}`,
  });
  metrics.counterUses = 1;
  metrics.counterChosen = 1;
  metrics.responsesUsed = 1;
  return { declared, metrics };
}

function rollDeclaredCounter(
  state: CombatState,
  target: CombatActor,
  attacker: CombatActor,
  declared: DeclaredCounter | null,
  rng: Rng,
): DeclaredCounterRoll | null {
  if (!declared) return null;
  const action = declared.action;
  const protectedActor = state.actors.find((actor) => actor.id === declared.protectedActorId) ?? target;
  const accuracyAttribute = effectiveAccuracyAttribute(target, protectedActor, action);
  const roll = rollDice(
    Math.max(1, action.diceCount),
    getActorDie(target, accuracyAttribute),
    rng,
    getAttributeModifier(state, target.id, accuracyAttribute),
  );
  const rollSummary = summarizeRoll({ actor: target, reason: action.name, attribute: accuracyAttribute, roll });
  emitTranscriptEvent(state, {
    type: "counterRoll",
    actorId: target.id,
    actorName: target.name,
    targetId: attacker.id,
    targetName: attacker.name,
    actionId: action.id,
    actionName: action.name,
    lane: "response",
    message: `Roll: ${rollText(rollSummary)} Counter roll declared before ${attacker.name}'s result is applied.`,
    roll: rollSummary,
    details: {
      responsesRemaining: state.responsesRemaining[target.id] ?? 0,
      counteringActorId: declared.counteringActorId,
      protectedActorId: declared.protectedActorId,
      triggeringAttackerId: declared.triggeringAttackerId,
      resolvedAccuracyAttribute: accuracyAttribute,
    },
  });
  return { declared, successes: roll.successes, rollSummary };
}

function resolveDeclaredCounterSuccessGate(params: {
  state: CombatState;
  target: CombatActor;
  attacker: CombatActor;
  counterRoll: DeclaredCounterRoll | null;
  incomingAction: CombatAction;
  incomingSuccesses: number;
  pool: "physical" | "mental";
}): CombatResolutionMetrics {
  const { state, target, attacker, counterRoll, incomingAction, incomingSuccesses, pool } = params;
  const metrics = emptyResolution();
  metrics.hostileSuccessesBeforeResist = incomingSuccesses;
  metrics.hostileSuccessesAfterResist = incomingSuccesses;
  if (!counterRoll || incomingSuccesses <= 0) return metrics;
  const resistPackets = counterDefencePackets(counterRoll.declared.action, pool, incomingAction).filter(
    (entry) => (entry.defenceMode ?? "Block") === "Resist",
  );
  if (resistPackets.length === 0) return metrics;

  const matchingPackets = resistPackets.filter(
    (entry) => entry.defenceResistedAttribute && entry.defenceResistedAttribute === incomingAction.resistAttribute,
  );
  if (matchingPackets.length === 0) {
    emitTranscriptEvent(state, {
      type: "counterRoll",
      actorId: target.id,
      actorName: target.name,
      targetId: attacker.id,
      targetName: attacker.name,
      actionId: counterRoll.declared.action.id,
      actionName: counterRoll.declared.action.name,
      lane: "response",
      message: `Resist Counter: ${counterRoll.declared.action.name} has no matching resisted attribute for ${incomingAction.name}; no hostile successes are cancelled.`,
      roll: counterRoll.rollSummary,
      details: {
        incomingResistAttribute: incomingAction.resistAttribute ?? null,
        cancelled: 0,
        remainingSuccesses: incomingSuccesses,
      },
    });
    return metrics;
  }

  const totalResists = matchingPackets.reduce(
    (sum, entry) => sum + counterRoll.successes * Math.max(1, entry.potency),
    0,
  );
  const cancelled = Math.min(incomingSuccesses, totalResists);
  metrics.resistRolls = 1;
  metrics.resistSuccesses = totalResists;
  metrics.resistCancelled = cancelled;
  metrics.hostileSuccessesCancelledByResist = cancelled;
  metrics.hostileSuccessesAfterResist = Math.max(0, incomingSuccesses - cancelled);
  emitTranscriptEvent(state, {
    type: "resistRoll",
    actorId: target.id,
    actorName: target.name,
    targetId: attacker.id,
    targetName: attacker.name,
    actionId: counterRoll.declared.action.id,
    actionName: counterRoll.declared.action.name,
    lane: "response",
    message: `Resist Counter: ${target.name}'s ${counterRoll.declared.action.name} rolls ${counterRoll.successes} success${counterRoll.successes === 1 ? "" : "es"} x ${matchingPackets.map((entry) => Math.max(1, entry.potency)).join(" + ")} = ${totalResists} ${incomingAction.resistAttribute} Resists; cancelled ${cancelled} of ${incomingSuccesses} hostile successes from ${incomingAction.name}.`,
    roll: counterRoll.rollSummary,
    details: {
      resistedAttribute: incomingAction.resistAttribute ?? null,
      totalResists,
      incomingSuccesses,
      cancelled,
      remainingSuccesses: metrics.hostileSuccessesAfterResist,
    },
  });
  return metrics;
}

function resolveDeclaredCounterDefence(params: {
  state: CombatState;
  target: CombatActor;
  attacker: CombatActor;
  counterRoll: DeclaredCounterRoll | null;
  incomingAction: CombatAction;
  incomingSuccesses: number;
  pool: "physical" | "mental";
  remainingWounds: number;
}): CombatResolutionMetrics {
  const { state, target, attacker, counterRoll, incomingAction, incomingSuccesses, pool, remainingWounds } = params;
  const metrics = emptyResolution();
  if (!counterRoll || remainingWounds <= 0) return metrics;
  const defencePackets = counterDefencePackets(counterRoll.declared.action, pool, incomingAction);
  if (defencePackets.length === 0) return metrics;

  const dodgePackets = defencePackets.filter((entry) => (entry.defenceMode ?? "Block") === "Dodge");
  if (dodgePackets.length > 0) {
    const totalDodge = dodgePackets.reduce(
      (sum, action) => sum + counterRoll.successes * Math.max(1, action.potency),
      0,
    );
    metrics.dodgeRolls = 1;
    metrics.dodgeChosen = 1;
    metrics.dodgeSuccesses = counterRoll.successes;
    if (totalDodge >= incomingSuccesses) {
      metrics.woundsAvoidedByDodge = remainingWounds;
    }
    emitTranscriptEvent(state, {
      type: "dodgeRoll",
      actorId: target.id,
      actorName: target.name,
      targetId: attacker.id,
      targetName: attacker.name,
      actionId: counterRoll.declared.action.id,
      actionName: counterRoll.declared.action.name,
      lane: "response",
      message: `Dodge Counter: ${target.name}'s ${counterRoll.declared.action.name} rolls ${counterRoll.successes} success${counterRoll.successes === 1 ? "" : "es"} x ${dodgePackets.map((entry) => Math.max(1, entry.potency)).join(" + ")} = ${totalDodge} Dodge against ${incomingSuccesses} incoming successes; ${totalDodge >= incomingSuccesses ? "the attack is avoided" : "the attack is not avoided"}.`,
      roll: counterRoll.rollSummary,
      details: {
        totalDodge,
        incomingSuccesses,
        dodgeSucceeded: totalDodge >= incomingSuccesses,
        remainingWounds,
      },
    });
    return metrics;
  }

  const blockPackets = defencePackets.filter((entry) => (entry.defenceMode ?? "Block") === "Block");
  if (blockPackets.length === 0) return metrics;
  const mitigationPerSuccess = blockPackets.reduce(
    (sum, action) => sum + Math.max(1, action.protection ?? action.potency),
    0,
  );
  const rawMitigation = Math.max(1, counterRoll.successes * mitigationPerSuccess);
  const mitigation = Math.min(remainingWounds, rawMitigation);
  metrics.counterMitigation = mitigation;
  emitTranscriptEvent(state, {
    type: "counterRoll",
    actorId: target.id,
    actorName: target.name,
    targetId: attacker.id,
    targetName: attacker.name,
    actionId: counterRoll.declared.action.id,
    actionName: counterRoll.declared.action.name,
    lane: "response",
    message: `Counter mitigation: ${target.name}'s ${counterRoll.declared.action.name} prevents ${mitigation} ${pool} wounds from ${attacker.name}'s attack.`,
    roll: counterRoll.rollSummary,
    details: { counterMitigation: mitigation, rawMitigation, mitigationPerSuccess, pool },
  });
  return metrics;
}

function resolveDeclaredCounterAttack(params: {
  state: CombatState;
  target: CombatActor;
  attacker: CombatActor;
  counterRoll: DeclaredCounterRoll | null;
}): CombatResolutionMetrics {
  const { state, target, attacker, counterRoll } = params;
  const metrics = emptyResolution();
  if (!counterRoll) return metrics;
  for (const action of counterAttackPackets(counterRoll.declared.action)) {
    const pool = action.pool ?? "physical";
    const raw = counterRoll.successes * Math.max(1, action.potency);
    const poolCommit = commitDefensivePool({
      state,
      metrics,
      target: attacker,
      poolType: pool === "physical" ? "PHYSICAL_BLOCK" : "MENTAL_BLOCK",
      requested: estimatePoolCommit(state, attacker, pool === "physical" ? "PHYSICAL_BLOCK" : "MENTAL_BLOCK", {
        woundChannel: pool,
        incomingWounds: raw,
      }),
      woundChannel: pool,
    });
    const poolPrevented = Math.min(raw, poolCommit?.committed ?? 0);
    if (poolCommit) {
      finishDefensivePoolCommit({
        metrics,
        pool: poolCommit.pool,
        committed: poolCommit.committed,
        effective: poolPrevented,
        result: "block",
      });
      if (poolCommit.pool.remainingPoints <= 0) {
        state.defensivePools = state.defensivePools.filter((entry) => entry.id !== poolCommit.pool.id);
      }
    }
    const passiveDefence = passiveDefenceAmount(attacker, pool);
    const staticProtection =
      (pool === "physical" ? attacker.physicalProtection : attacker.mentalProtection) +
      getProtectionModifier(state, attacker.id, pool) +
      passiveDefence;
    const prevented = poolPrevented + Math.min(Math.max(0, raw - poolPrevented), Math.max(0, staticProtection));
    const damage = Math.max(0, raw - prevented);
    applyWounds(attacker, pool, damage);
    metrics.counterDamage += damage;
    metrics.staticProtectionPrevented += Math.max(0, prevented - poolPrevented);
    metrics.protectionPrevented += prevented;
    metrics.passiveDefenceContribution += Math.min(raw, passiveDefence);
    emitTranscriptEvent(state, {
      type: "damageApplied",
      actorId: target.id,
      actorName: target.name,
      targetId: attacker.id,
      targetName: attacker.name,
      actionId: counterRoll.declared.action.id,
      actionName: counterRoll.declared.action.name,
      lane: "response",
      message: `Counter result: ${attacker.name} suffers ${damage} ${pool} wounds from ${counterRoll.declared.action.name}. Prevented ${prevented} (${poolPrevented} defensive pool, ${Math.max(0, prevented - poolPrevented)} passive/static).`,
      details: { rawWounds: raw, prevented, poolPrevented, netWounds: damage, pool },
    });
  }
  return metrics;
}

export function resolveStartOfTurnEffects(state: CombatState, actor: CombatActor): CombatResolutionMetrics {
  const metrics = emptyResolution();
  const actorEffects = state.statusEffects.filter((entry) => entry.targetActorId === actor.id);
  const actionDeniedEffects = actorEffects.filter(
    (effect) => effect.kind === "mainActionDenied" && effect.amount > 0 && effect.remainingRounds > 0,
  );
  if (actionDeniedEffects.length > 0) {
    const primaryDenial = actionDeniedEffects[0];
    const activeStacks = Math.max(
      1,
      Math.trunc(primaryDenial?.amount ?? 1),
    );
    const remainingRounds = Math.max(
      1,
      Math.trunc(primaryDenial?.remainingRounds ?? 1),
    );
    metrics.actionsDenied = 1;
    emitTranscriptEvent(state, {
      type: "startOfTurnEffect",
      actorId: actor.id,
      actorName: actor.name,
      actionId: primaryDenial?.sourceActionId,
      actionName: primaryDenial?.sourceActionName,
      lane: "startOfTurn",
      message:
        actionDeniedEffects.length > 1
          ? `Start of Turn: ${actor.name} has ${activeStacks} stack${activeStacks === 1 ? "" : "s"} of Force No Main Action from ${primaryDenial?.sourceActionName ?? "a control effect"}, ${remainingRounds} turn${remainingRounds === 1 ? "" : "s"} remaining. ${actionDeniedEffects.length} denial effects were present, consolidated to one denied main action.`
          : `Start of Turn: ${actor.name} has ${activeStacks} stack${activeStacks === 1 ? "" : "s"} of Force No Main Action from ${primaryDenial?.sourceActionName ?? "a control effect"}, ${remainingRounds} turn${remainingRounds === 1 ? "" : "s"} remaining.`,
      details: {
        effect: "mainActionDenied",
        amount: 1,
        consolidatedEffects: actionDeniedEffects.length,
        activeStacks,
        remainingRounds,
      },
    });
  }
  for (const effect of actorEffects) {
    if (effect.kind === "mainActionDenied") {
      continue;
    }
    if (effect.kind === "healingOverTime") {
      const healed = healWounds(actor, effect.pool ?? "physical", effect.amount);
      emitTranscriptEvent(state, {
        type: "statusTick",
        actorId: actor.id,
        actorName: actor.name,
        actionId: effect.sourceActionId,
        actionName: effect.sourceActionName,
        lane: "startOfTurn",
        message: `Start of Turn: ${actor.name} heals ${healed} ${effect.pool ?? "physical"} wounds from ${effect.sourceActionName ?? "healing-over-time"}. ${effect.remainingRounds} ticks remaining.`,
        details: { effect: effect.kind, healing: healed, pool: effect.pool ?? "physical", remainingRounds: effect.remainingRounds },
      });
      metrics.healingDone += healed;
      metrics.healingOverTimeApplied += healed;
      metrics.healingTicks += 1;
    } else if (effect.kind === "ongoingDamage") {
      const firstTick = !effect.firstTickApplied;
      const firstTickBeforeCleanup = firstTick && !effect.cleanupAttempted;
      const overkill = applyWounds(actor, effect.pool ?? "physical", effect.amount);
      const remainingAfterTick = Math.max(0, effect.remainingRounds - 1);
      const woundLabel = effect.damageLabel ?? effect.pool ?? "physical";
      const lethal = actor.physicalHpCurrent <= 0 || actor.mentalHpCurrent <= 0;
      metrics.netWounds += effect.amount;
      metrics.ongoingDamageApplied += effect.amount;
      metrics.ongoingDamageTicks += 1;
      metrics.overkill += overkill;
      recordOngoingFirstTick({
        metrics,
        state,
        effect,
        damage: effect.amount,
        firstTickBeforeCleanup,
        lethal,
      });
      effect.firstTickApplied = true;
      if (firstTick) {
        emitTranscriptEvent(state, {
          type: "statusTick",
          actorId: actor.id,
          actorName: actor.name,
          actionId: effect.sourceActionId,
          actionName: effect.sourceActionName,
          lane: "startOfTurn",
          message: firstTickBeforeCleanup
            ? `First tick: ${effect.sourceActionName ?? "ongoing damage"} deals ${effect.amount} ${woundLabel} wounds to ${actor.name} before cleanup opportunity.`
            : `First tick: ${effect.sourceActionName ?? "ongoing damage"} deals ${effect.amount} ${woundLabel} wounds to ${actor.name}.`,
          details: {
            effect: effect.kind,
            wounds: effect.amount,
            pool: effect.pool ?? "physical",
            firstTickBeforeCleanup,
          },
        });
      }
      emitTranscriptEvent(state, {
        type: "statusTick",
        actorId: actor.id,
        actorName: actor.name,
        actionId: effect.sourceActionId,
        actionName: effect.sourceActionName,
        lane: "startOfTurn",
        message: `Start of Turn: ${actor.name} suffers ${effect.amount} ${woundLabel} wounds from ${effect.sourceActionName ?? "ongoing damage"}. Ticks remaining after this: ${remainingAfterTick}.`,
        details: { effect: effect.kind, wounds: effect.amount, pool: effect.pool ?? "physical", overkill, remainingRounds: effect.remainingRounds, remainingAfterTick },
      });
      if (lethal) {
        if (firstTick && firstTickBeforeCleanup) {
          emitTranscriptEvent(state, {
            type: "actorDefeated",
            actorId: actor.id,
            actorName: actor.name,
            actionId: effect.sourceActionId,
            actionName: effect.sourceActionName,
            lane: "startOfTurn",
            message: `First-tick lethal: ${actor.name} is defeated by ${effect.sourceActionName ?? "ongoing damage"} before they can attempt cleanup.`,
            details: {
              effect: effect.kind,
              wounds: effect.amount,
              firstTickBeforeCleanup,
            },
          });
        }
        markDefeatedActors(state);
        return metrics;
      }
    }
  }
  markDefeatedActors(state);
  return metrics;
}

type LinkedPrimaryContext = {
  scalingMode: NonNullable<CombatAction["linkedScalingMode"]>;
  primaryActionName: string;
  primaryAppliedSuccesses: number;
  linkedUnits: number;
  netPrimaryWounds?: number;
  primaryWoundsPerSuccess?: number;
};

type SecondaryBundleDelta = {
  target: CombatActor;
  pool: "physical" | "mental";
  damage: number;
  healing: number;
};

function isIndependentBundleSecondary(action: CombatAction): boolean {
  if (action.secondaryDependencyMode && action.secondaryDependencyMode !== "INDEPENDENT") return false;
  if (action.linkedToPrimary || action.usesPrimaryAppliedSuccesses || action.skipOwnRoll || action.skipOwnDefenceGate) {
    return false;
  }
  if (action.secondaryActions?.length) return false;
  if (action.resistAttribute || action.runtimeCleanup) return false;
  if (action.kind !== "attack" && action.kind !== "healing") return false;
  if (action.recurring) return false;
  if (action.kind === "attack" && damageApplicationTimingForAction(action) !== "immediate") return false;
  return true;
}

function resolveIndependentSecondaryTargets(
  state: CombatState,
  actor: CombatActor,
  action: CombatAction,
  primaryTarget: CombatActor,
): CombatActor[] {
  if (action.targetPolicy === "self") return [actor].filter((target) => !target.defeated);
  if (action.targetPolicy === "ally") {
    if (primaryTarget.side === actor.side && !primaryTarget.defeated) return [primaryTarget];
    return getLivingActors(state, actor.side).slice(0, Math.max(1, action.targetCount ?? 1));
  }
  if (action.targetPolicy === "enemy") {
    if (primaryTarget.side !== actor.side && !primaryTarget.defeated) return [primaryTarget];
    return getLivingActors(state, getOppositeSide(actor.side)).slice(0, Math.max(1, action.targetCount ?? 1));
  }
  return resolveTargets(state, actor, action, primaryTarget);
}

function resolveIndependentSecondaryBundle(params: {
  state: CombatState;
  actor: CombatActor;
  primaryAction: CombatAction;
  primaryTarget: CombatActor;
  secondaryActions: CombatAction[];
  rng: Rng;
  lane?: CombatActionLane;
}): CombatResolutionMetrics {
  const metrics = emptyResolution();
  const deltas = new Map<string, SecondaryBundleDelta>();

  for (const action of params.secondaryActions) {
    const targets = resolveIndependentSecondaryTargets(params.state, params.actor, action, params.primaryTarget);
    const accuracyAttribute = effectiveAccuracyAttribute(params.actor, params.primaryTarget, action);
    const modifier = getAttributeModifier(params.state, params.actor.id, accuracyAttribute);
    if (modifier > 0) metrics.buffedActions += 1;
    if (modifier < 0) metrics.debuffedActions += 1;

    for (const target of targets) {
      const roll = rollDice(Math.max(0, action.diceCount), getActorDie(params.actor, accuracyAttribute), params.rng, modifier);
      const rollSummary = summarizeRoll({ actor: params.actor, reason: action.name, attribute: accuracyAttribute, roll });
      metrics.rawSuccesses += roll.successes;
      emitTranscriptEvent(params.state, {
        type: rollEventType(action),
        actorId: params.actor.id,
        actorName: params.actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane: params.lane,
        message: `Secondary bundle roll: ${rollText(rollSummary)}`,
        roll: rollSummary,
        details: {
          actionKind: action.kind,
          potency: action.potency,
          pool: action.pool ?? null,
          independentSecondaryBundle: true,
          primaryActionId: params.primaryAction.id,
        },
      });

      const pool = action.pool ?? "physical";
      const amount = roll.successes * Math.max(1, action.effectPerPrimarySuccess ?? action.potency);
      const key = `${target.id}:${pool}`;
      const delta = deltas.get(key) ?? { target, pool, damage: 0, healing: 0 };
      if (action.kind === "attack") {
        delta.damage += amount;
        metrics.rawWounds += amount;
      } else {
        delta.healing += amount;
      }
      deltas.set(key, delta);

      emitTranscriptEvent(params.state, {
        type: action.kind === "attack" ? "damageApplied" : "healingApplied",
        actorId: params.actor.id,
        actorName: params.actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane: params.lane,
        message: `Secondary bundle pending: ${action.name} contributes ${amount} ${pool} ${action.kind === "attack" ? "damage" : "healing"} to ${target.name}; final same-target/same-lane state changes apply after the bundle is netted.`,
        details: {
          amount,
          pool,
          actionKind: action.kind,
          independentSecondaryBundle: true,
          targetId: target.id,
        },
      });
    }
  }

  for (const delta of deltas.values()) {
    const net = delta.damage - delta.healing;
    if (net > 0) {
      const overkill = applyWounds(delta.target, delta.pool, net);
      metrics.netWounds += net;
      metrics.overkill += overkill;
    } else if (net < 0) {
      metrics.healingDone += healWounds(delta.target, delta.pool, -net);
    }
    emitTranscriptEvent(params.state, {
      type: net > 0 ? "damageApplied" : net < 0 ? "healingApplied" : "statusCreated",
      actorId: params.actor.id,
      actorName: params.actor.name,
      targetId: delta.target.id,
      targetName: delta.target.name,
      actionId: params.primaryAction.id,
      actionName: params.primaryAction.name,
      lane: params.lane,
      message: `Secondary bundle result: ${delta.target.name} ${delta.pool} lane nets ${delta.damage} damage and ${delta.healing} healing into ${Math.abs(net)} ${net > 0 ? "damage" : net < 0 ? "healing" : "net change"}.`,
      details: {
        targetId: delta.target.id,
        pool: delta.pool,
        damage: delta.damage,
        healing: delta.healing,
        net,
        independentSecondaryBundle: true,
      },
    });
  }

  return metrics;
}

function resolveSingleTargetAction(params: {
  state: CombatState;
  actor: CombatActor;
  action: CombatAction;
  target: CombatActor;
  rng: Rng;
  lane?: CombatActionLane;
  fromSecondary?: boolean;
  gateAlreadyResolved?: boolean;
  primaryAppliedSuccesses?: number;
  linkedPrimaryContext?: LinkedPrimaryContext;
}): CombatResolutionMetrics {
  const { state, actor, action, target, rng, lane } = params;
  const gateAlreadyResolved = Boolean(params.gateAlreadyResolved || params.fromSecondary);
  const metrics = emptyResolution();
  let linkedWoundBandContext: LinkedPrimaryContext | null = null;
  const accuracyAttribute = effectiveAccuracyAttribute(actor, target, action);
  const actorAttributeModifier = getAttributeModifier(state, actor.id, accuracyAttribute);
  if (actorAttributeModifier > 0) metrics.buffedActions = 1;
  if (actorAttributeModifier < 0) metrics.debuffedActions = 1;
  const inheritedPrimaryAppliedSuccesses = Math.max(0, Math.trunc(params.primaryAppliedSuccesses ?? 0));
  const skipOwnRoll = Boolean(params.fromSecondary && (action.skipOwnRoll || action.usesPrimaryAppliedSuccesses));
  const poolForCounterDeclaration = action.pool ?? "physical";
  const currentAssistTriggerId = assistTriggerId({ state, triggeringAlly: actor, triggeringAction: action, targetActor: target });
  const counterDeclaration =
    !gateAlreadyResolved &&
    !params.fromSecondary &&
    (action.kind === "attack" || action.kind === "debuff" || action.kind === "control" || action.kind === "movement")
      ? declareCounter({ state, target, attacker: actor, incomingAction: action, pool: poolForCounterDeclaration })
      : { declared: null, metrics: emptyResolution() };
  addMetrics(metrics, counterDeclaration.metrics);
  const counterRoll = rollDeclaredCounter(state, target, actor, counterDeclaration.declared, rng);
  const diceCount = Math.max(0, action.diceCount);
  const roll = skipOwnRoll
    ? null
    : rollDice(diceCount, getActorDie(actor, accuracyAttribute), rng, actorAttributeModifier);
  const rollSummary = roll
    ? summarizeRoll({ actor, reason: action.name, attribute: accuracyAttribute, roll })
    : null;
  metrics.rawSuccesses = skipOwnRoll ? inheritedPrimaryAppliedSuccesses : (roll?.successes ?? 0);
  if (roll && rollSummary) {
    emitTranscriptEvent(state, {
      type: rollEventType(action),
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Roll: ${rollText(rollSummary)}`,
      roll: rollSummary,
      details: { actionKind: action.kind, potency: action.potency, pool: action.pool ?? null },
    });
  }

  const counterGateMetrics =
    !gateAlreadyResolved && !params.fromSecondary && counterRoll
      ? resolveDeclaredCounterSuccessGate({
          state,
          target,
          attacker: actor,
          counterRoll,
          incomingAction: action,
          incomingSuccesses: metrics.rawSuccesses,
          pool: poolForCounterDeclaration,
        })
      : emptyResolution();
  addMetrics(metrics, counterGateMetrics);

  if (gateAlreadyResolved) {
    const linkedContext = params.linkedPrimaryContext;
    const linkedMessage =
      action.usesPrimaryAppliedSuccesses && linkedContext?.scalingMode === "primaryWoundBands"
        ? `Linked effect: ${action.name} rides ${linkedContext.netPrimaryWounds ?? 0} net primary wounds from ${linkedContext.primaryActionName}. Applied wound bands: ceil(${linkedContext.netPrimaryWounds ?? 0} / ${linkedContext.primaryWoundsPerSuccess ?? 1}) = ${linkedContext.linkedUnits}. No secondary roll is made. No second Dodge, Protection, or Resist gate is rolled.`
        : action.usesPrimaryAppliedSuccesses
          ? `Linked effect: ${action.name} rides ${inheritedPrimaryAppliedSuccesses} applied primary successes. No secondary roll is made. No second Dodge, Protection, or Resist gate is rolled.`
          : `Linked effect: ${action.name} rides the primary defence result; no second Dodge, Protection, or Resist gate is rolled.`;
    emitTranscriptEvent(state, {
      type: "statusCreated",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: linkedMessage,
      details: {
        gateAlreadyResolved: true,
        fromSecondary: Boolean(params.fromSecondary),
        appliedPrimarySuccesses: inheritedPrimaryAppliedSuccesses,
        linkedScalingMode: linkedContext?.scalingMode,
        netPrimaryWounds: linkedContext?.netPrimaryWounds,
        primaryWoundsPerSuccess: linkedContext?.primaryWoundsPerSuccess,
        linkedUnits: linkedContext?.linkedUnits,
        skipOwnRoll,
      },
    });
  } else if (
    (action.kind === "attack" || action.kind === "debuff" || action.kind === "control" || action.kind === "movement") &&
    !counterDeclaration.declared
  ) {
    const resistMetrics = resolveResist(state, target, action, metrics.rawSuccesses, rng, currentAssistTriggerId);
    addMetrics(metrics, resistMetrics);
  }

  const activeAppliedSuccesses =
    gateAlreadyResolved && action.usesPrimaryAppliedSuccesses
      ? inheritedPrimaryAppliedSuccesses
      : counterGateMetrics.hostileSuccessesCancelledByResist > 0
        ? counterGateMetrics.hostileSuccessesAfterResist
      : !gateAlreadyResolved && action.resistAttribute && !counterDeclaration.declared
        ? metrics.hostileSuccessesAfterResist
        : metrics.rawSuccesses;

  if (!params.fromSecondary) {
    emitTranscriptEvent(state, {
      type: "statusCreated",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Applied primary successes: ${activeAppliedSuccesses}.`,
      details: { appliedPrimarySuccesses: activeAppliedSuccesses },
    });
  }

  if (
    activeAppliedSuccesses <= 0 &&
    (Boolean(action.resistAttribute) || Boolean(action.usesPrimaryAppliedSuccesses)) &&
    !counterDeclaration.declared?.hasAttackPacket
  ) {
    if (action.kind === "debuff") {
      emitTranscriptEvent(state, {
        type: "debuffApplied",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Debuff result: ${target.name} resists ${action.name}; no debuff is applied.`,
        details: { appliedPrimarySuccesses: activeAppliedSuccesses, resisted: true },
      });
    } else if (action.kind === "control") {
      emitTranscriptEvent(state, {
        type: "statusCreated",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Control result: ${target.name} resists ${action.name}; no control effect is applied.`,
        details: { appliedPrimarySuccesses: activeAppliedSuccesses, resisted: true },
      });
    } else if (action.kind === "movement") {
      emitTranscriptEvent(state, {
        type: "statusCreated",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Movement result: ${target.name} resists ${action.name}; no forced movement is applied.`,
        details: { appliedPrimarySuccesses: activeAppliedSuccesses, resisted: true },
      });
    }
    return metrics;
  }

  if (action.kind === "attack") {
    const pool = action.pool ?? "physical";
    const activeHostileSuccesses = activeAppliedSuccesses;
    const effectPerSuccess = Math.max(1, action.effectPerPrimarySuccess ?? action.potency);
    const rawWounds = activeHostileSuccesses * effectPerSuccess;
    const woundLabel = actionDamageLabel(action, pool);
    const damageApplicationTiming = damageApplicationTimingForAction(action);
    const isPureOngoingDamage =
      action.recurring?.kind === "ongoingDamage" && damageApplicationTiming !== "immediate";
    const linkedUnitLabel =
      params.linkedPrimaryContext?.scalingMode === "primaryWoundBands"
        ? `wound band${activeHostileSuccesses === 1 ? "" : "s"}`
        : "active successes";
    emitTranscriptEvent(state, {
      type: "damageApplied",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: isPureOngoingDamage
        ? `Ongoing declaration: ${action.name} has ${activeHostileSuccesses} ${linkedUnitLabel} x ${effectPerSuccess} = ${rawWounds} ${woundLabel} wounds per tick${gateAlreadyResolved ? "." : " before declaration defence."}`
        : action.usesPrimaryAppliedSuccesses
          ? `Declared damage: ${activeHostileSuccesses} ${params.linkedPrimaryContext?.scalingMode === "primaryWoundBands" ? linkedUnitLabel : "applied primary successes"} x ${effectPerSuccess} = ${rawWounds} ${woundLabel} wounds.`
          : `Declared damage: ${action.name} has ${activeHostileSuccesses} active successes x ${effectPerSuccess} = ${rawWounds} ${woundLabel} wounds before defence.`,
      details: { activeSuccesses: activeHostileSuccesses, potency: effectPerSuccess, rawWounds, pool, damageApplicationTiming },
    });
    const normalDefenceMetrics = gateAlreadyResolved || counterDeclaration.declared
      ? emptyResolution()
      : resolveBestNormalDefence({
          state,
          target,
          pool,
          incomingSuccesses: activeHostileSuccesses,
          rawWounds,
          rng,
          ongoingPerTick: isPureOngoingDamage,
          assistTriggerId: currentAssistTriggerId,
        });
    addMetrics(metrics, normalDefenceMetrics);
    if (normalDefenceMetrics.woundsAvoidedByDodge > 0) {
      metrics.rawWounds = rawWounds;
      metrics.woundsAvoidedByDodge = rawWounds;
      emitTranscriptEvent(state, {
        type: "damageApplied",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: isPureOngoingDamage
          ? `Application result: ${target.name} avoids ${action.name}; no ongoing damage status is created.`
          : `Attack result: ${target.name} dodged ${action.name}; 0 net wounds.`,
        details: { rawWounds, netWounds: 0, pool },
      });
      const counterAttackMetrics =
        gateAlreadyResolved ? emptyResolution() : resolveDeclaredCounterAttack({ state, target, attacker: actor, counterRoll });
      addMetrics(metrics, counterAttackMetrics);
      return metrics;
    }
    const activeSuccesses = activeHostileSuccesses;
    const activeRawWounds = activeSuccesses * effectPerSuccess;
    const passiveDefence = gateAlreadyResolved ? 0 : passiveDefenceAmount(target, pool);
    const normalDefenceBlocked = normalDefenceMetrics.defenceStringBlocked;
    const counterDefenceMetrics =
      !gateAlreadyResolved && activeRawWounds - normalDefenceBlocked > 0
        ? resolveDeclaredCounterDefence({
            state,
            target,
            attacker: actor,
            counterRoll,
            incomingAction: action,
            incomingSuccesses: activeHostileSuccesses,
            pool,
            remainingWounds: activeRawWounds - normalDefenceBlocked,
          })
        : emptyResolution();
    addMetrics(metrics, counterDefenceMetrics);
    if (counterDefenceMetrics.woundsAvoidedByDodge > 0) {
      metrics.rawWounds = rawWounds;
      metrics.woundsAvoidedByDodge = rawWounds;
      emitTranscriptEvent(state, {
        type: "damageApplied",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: isPureOngoingDamage
          ? `Application result: ${target.name}'s Dodge Counter avoids ${action.name}; no ongoing damage status is created.`
          : `Incoming result: ${target.name}'s Dodge Counter avoids ${action.name}; 0 net wounds.`,
        details: { rawWounds, netWounds: 0, pool },
      });
      const counterAttackMetrics =
        gateAlreadyResolved ? emptyResolution() : resolveDeclaredCounterAttack({ state, target, attacker: actor, counterRoll });
      addMetrics(metrics, counterAttackMetrics);
      return metrics;
    }
    const protection =
      gateAlreadyResolved
        ? 0
        : (pool === "physical" ? target.physicalProtection : target.mentalProtection) +
          getProtectionModifier(state, target.id, pool) +
          passiveDefence;
    const staticPrevented = Math.min(
      Math.max(0, activeRawWounds - normalDefenceBlocked - counterDefenceMetrics.counterMitigation),
      Math.max(0, protection),
    );
    const staticBreakdown = gateAlreadyResolved
      ? []
      : protectionBreakdown(
          state,
          target,
          pool,
          Math.max(0, activeRawWounds - normalDefenceBlocked - counterDefenceMetrics.counterMitigation),
        );
    const preventedBeforeAssist = normalDefenceBlocked + counterDefenceMetrics.counterMitigation + staticPrevented;
    const preventionAssistPressure = consumeAssistPressure({
      state,
      metrics,
      triggerId: currentAssistTriggerId,
      lane: pool === "physical" ? "physicalBlock" : "mentalBlock",
      maxReduction: preventedBeforeAssist,
    });
    const prevented = Math.max(0, preventedBeforeAssist - preventionAssistPressure.spent);
    const netWounds = isPureOngoingDamage ? 0 : Math.max(0, activeRawWounds - prevented);
    const storedOngoingWounds = isPureOngoingDamage ? Math.max(0, activeRawWounds - prevented) : 0;
    const overkill = isPureOngoingDamage ? 0 : applyWounds(target, pool, netWounds);

    metrics.rawWounds = rawWounds;
    metrics.protectionPrevented = prevented;
    metrics.staticProtectionPrevented = Math.max(0, staticPrevented - preventionAssistPressure.spent);
    metrics.passiveDefenceContribution = Math.min(activeRawWounds, passiveDefence);
    metrics.netWounds = netWounds;
    metrics.overkill = overkill;

    if (!params.fromSecondary && !isPureOngoingDamage && netWounds > 0) {
      const primaryWoundsPerSuccess = Math.max(1, effectPerSuccess);
      linkedWoundBandContext = {
        scalingMode: "primaryWoundBands",
        primaryActionName: action.name,
        primaryAppliedSuccesses: activeAppliedSuccesses,
        linkedUnits: Math.max(1, Math.ceil(netWounds / primaryWoundsPerSuccess)),
        netPrimaryWounds: netWounds,
        primaryWoundsPerSuccess,
      };
    }

    if (staticPrevented > 0 && staticBreakdown.length > 0) {
      emitTranscriptEvent(state, {
        type: "damageApplied",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Passive/static prevention: ${formatProtectionBreakdown(staticBreakdown, pool)}.`,
        details: { pool, staticPrevented },
      });
    }

    if (isPureOngoingDamage) {
      if (storedOngoingWounds <= 0) {
        emitTranscriptEvent(state, {
          type: "damageApplied",
          actorId: actor.id,
          actorName: actor.name,
          targetId: target.id,
          targetName: target.name,
          actionId: action.id,
          actionName: action.name,
          lane,
          message: `Application result: ${target.name}'s declaration defence fully prevents ${action.name}; no ongoing damage status is created. Prevented ${prevented} (${normalDefenceBlocked} defence, ${counterDefenceMetrics.counterMitigation} counter, ${staticPrevented} static/passive${preventionAssistPressure.spent > 0 ? `, ${preventionAssistPressure.spent} Assist pressure occupied prevention` : ""}).`,
          details: { rawWounds: activeRawWounds, prevented, preventedBeforeAssist, assistPressureSpent: preventionAssistPressure.spent, assistPressureWasted: preventionAssistPressure.wasted, storedOngoingWounds: 0, pool },
        });
      } else if (action.recurring?.kind === "ongoingDamage") {
        const units = Math.max(1, Math.ceil(storedOngoingWounds / Math.max(1, effectPerSuccess)));
        state.statusEffects.push({
          id: `${state.round}:${actor.id}:${action.id}:${target.id}:ongoing`,
          sourceActorId: actor.id,
          targetActorId: target.id,
          kind: "ongoingDamage",
          amount: storedOngoingWounds,
          initialAmount: storedOngoingWounds,
          firstTickApplied: false,
          cleanupAttempted: false,
          pool,
          damageLabel: woundLabel,
          cleanupAttribute: pool === "mental" ? "Bravery" : "Fortitude",
          cleanupUnitWounds: effectPerSuccess,
          sourceActionId: action.id,
          sourceActionName: action.name,
          remainingRounds: action.recurring.durationRounds,
        });
        metrics.ongoingDamageUnitsApplied += units;
        metrics.stacksApplied += units;
        recordOngoingStatusCreated({ metrics, sourceActor: actor, action, storedTick: storedOngoingWounds });
        emitTranscriptEvent(state, {
          type: "damageApplied",
          actorId: actor.id,
          actorName: actor.name,
          targetId: target.id,
          targetName: target.name,
          actionId: action.id,
          actionName: action.name,
          lane,
          message: `Ongoing result: ${action.name} stores ${storedOngoingWounds} ${woundLabel} wounds per tick on ${target.name} for ${action.recurring.durationRounds} ticks. Prevented ${prevented}.`,
          details: {
            effect: "ongoingDamage",
            storedOngoingWounds,
            prevented,
            preventedBeforeAssist,
            assistPressureSpent: preventionAssistPressure.spent,
            assistPressureWasted: preventionAssistPressure.wasted,
            rawWounds: activeRawWounds,
            durationRounds: action.recurring.durationRounds,
          },
        });
        emitTranscriptEvent(state, {
          type: "statusCreated",
          actorId: actor.id,
          actorName: actor.name,
          targetId: target.id,
          targetName: target.name,
          actionId: action.id,
          actionName: action.name,
          lane,
          message: `Status created: ${action.name} ongoing damage on ${target.name}, ${action.recurring.durationRounds} ticks remaining, ${storedOngoingWounds} ${woundLabel} wounds per tick. Declaration prevention ${prevented} reduced the stored tick value from ${activeRawWounds} to ${storedOngoingWounds}.`,
          details: {
            effect: "ongoingDamage",
            amount: storedOngoingWounds,
            units,
            cleanupUnitWounds: effectPerSuccess,
            durationRounds: action.recurring.durationRounds,
            pool,
            prevented,
            preventedBeforeAssist,
            assistPressureSpent: preventionAssistPressure.spent,
            assistPressureWasted: preventionAssistPressure.wasted,
            rawWounds: activeRawWounds,
            damageApplicationTiming,
          },
        });
      }
    } else {
      emitTranscriptEvent(state, {
        type: "damageApplied",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `${counterDeclaration.declared ? "Incoming result" : "Attack result"}: ${target.name} suffers ${netWounds} ${pool} wounds from ${action.name}. Prevented ${prevented} (${normalDefenceBlocked} defence, ${counterDefenceMetrics.counterMitigation} counter, ${staticPrevented} static/passive${preventionAssistPressure.spent > 0 ? `, ${preventionAssistPressure.spent} Assist pressure occupied prevention` : ""}).`,
        details: { rawWounds: activeRawWounds, prevented, preventedBeforeAssist, assistPressureSpent: preventionAssistPressure.spent, assistPressureWasted: preventionAssistPressure.wasted, netWounds, overkill, pool },
      });
    }
    if (!isPureOngoingDamage && action.recurring?.kind === "ongoingDamage" && netWounds > 0) {
      const units = Math.max(1, Math.ceil(netWounds / Math.max(1, action.potency)));
      state.statusEffects.push({
        id: `${state.round}:${actor.id}:${action.id}:${target.id}:ongoing`,
        sourceActorId: actor.id,
        targetActorId: target.id,
        kind: "ongoingDamage",
        amount: effectPerSuccess * units,
        initialAmount: effectPerSuccess * units,
        firstTickApplied: false,
        cleanupAttempted: false,
        pool,
        damageLabel: actionDamageLabel(action, pool),
        cleanupAttribute: pool === "mental" ? "Bravery" : "Fortitude",
        cleanupUnitWounds: effectPerSuccess,
        sourceActionId: action.id,
        sourceActionName: action.name,
        remainingRounds: action.recurring.durationRounds,
      });
      metrics.ongoingDamageUnitsApplied += units;
      metrics.stacksApplied += units;
      recordOngoingStatusCreated({ metrics, sourceActor: actor, action, storedTick: effectPerSuccess * units });
      emitTranscriptEvent(state, {
        type: "statusCreated",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Status created: ${action.name} ongoing damage on ${target.name}, ${action.recurring.durationRounds} ticks remaining, ${effectPerSuccess * units} ${pool} wounds per tick.`,
        details: { effect: "ongoingDamage", amount: effectPerSuccess * units, units, cleanupUnitWounds: effectPerSuccess, durationRounds: action.recurring.durationRounds, pool },
      });
    }
    const counterAttackMetrics =
      gateAlreadyResolved ? emptyResolution() : resolveDeclaredCounterAttack({ state, target, attacker: actor, counterRoll });
    addMetrics(metrics, counterAttackMetrics);
  } else if (action.kind === "healing") {
    if (action.recurring?.kind === "healingOverTime") {
      const amount = Math.max(1, activeAppliedSuccesses * action.potency);
      state.statusEffects.push({
        id: `${state.round}:${actor.id}:${action.id}:${target.id}:hot`,
        sourceActorId: actor.id,
        targetActorId: target.id,
        kind: "healingOverTime",
        amount,
        pool: action.pool ?? "physical",
        sourceActionId: action.id,
        sourceActionName: action.name,
        remainingRounds: action.recurring.durationRounds,
      });
      metrics.healingOverTimeApplied = 1;
      emitTranscriptEvent(state, {
        type: "statusCreated",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Effect: ${action.name} applies healing-over-time to ${target.name}: ${amount} ${action.pool ?? "physical"} healing per tick for ${action.recurring.durationRounds} ticks.`,
        details: { effect: "healingOverTime", amount, pool: action.pool ?? "physical", durationRounds: action.recurring.durationRounds },
      });
      emitTranscriptEvent(state, {
        type: "statusCreated",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Status created: ${action.name} on ${target.name}, ${action.recurring.durationRounds} ticks remaining.`,
        details: { effect: "healingOverTime", durationRounds: action.recurring.durationRounds },
      });
    } else {
      const healing = activeAppliedSuccesses * action.potency;
      metrics.healingDone = healWounds(target, action.pool ?? "physical", healing);
      emitTranscriptEvent(state, {
        type: "healingApplied",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Healing: ${action.name} heals ${metrics.healingDone} ${action.pool ?? "physical"} wounds on ${target.name} (${activeAppliedSuccesses} successes x ${action.potency}).`,
        details: { healingRolled: healing, healingApplied: metrics.healingDone, pool: action.pool ?? "physical" },
      });
    }
  } else if (action.kind === "buff" || action.kind === "debuff") {
    if (action.modifier) {
      const linkedStacks = action.usesPrimaryAppliedSuccesses ? Math.max(1, activeAppliedSuccesses) : 1;
      const appliedAmount = Math.max(1, action.modifier.amount) * linkedStacks;
      const durationRounds = action.durationRounds ?? action.modifier.durationRounds;
      const passiveDuration = Boolean(action.passiveDuration);
      const modifiesRollResults = action.modifier.modifiesRollResults !== false;
      state.statusEffects.push({
        id: `${state.round}:${actor.id}:${action.id}:${target.id}`,
        sourceActorId: actor.id,
        targetActorId: target.id,
        kind: action.kind,
        attribute: action.modifier.attribute,
        amount: appliedAmount,
        sourceActionId: action.id,
        sourceActionName: action.name,
        sourceCooldownActionId: action.cooldownActionId ?? action.id,
        durationKind: action.durationKind,
        durationSource: action.durationSource,
        passiveDuration,
        modifiesRollResults,
        remainingRounds: durationRounds,
        positionalAbstraction: action.targetPolicy === "allAllies"
          ? "AOE ally buff abstracted to all living allies."
          : action.targetPolicy === "allEnemies"
            ? "Field positioning abstracted: affected all enemy actors."
            : undefined,
      });
      metrics.buffDebuffApplied = appliedAmount;
      if (action.kind === "buff") metrics.buffApplications = 1;
      if (action.kind === "debuff") metrics.debuffApplications = 1;
      if (action.targetPolicy === "allAllies" || action.targetPolicy === "allEnemies") metrics.positionalAbstractionsUsed = 1;
      emitTranscriptEvent(state, {
        type: action.kind === "buff" ? "buffApplied" : "debuffApplied",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: passiveDuration
          ? (
              action.usesPrimaryAppliedSuccesses
                ? `${action.kind === "buff" ? "Buff/status created" : "Debuff/status created"}: ${action.name} grants ${linkedStacks} stack${linkedStacks === 1 ? "" : "s"} of ${action.kind === "buff" ? "+" : "-"}${action.modifier.amount} ${action.modifier.attribute} to ${target.name} (${action.kind === "buff" ? "+" : "-"}${appliedAmount} total) until ended or removed${modifiesRollResults ? "." : "; it does not modify roll results."}`
                : `${action.kind === "buff" ? "Buff" : "Debuff"}: ${action.name} applies ${action.kind === "buff" ? "+" : "-"}${appliedAmount} ${action.modifier.attribute} to ${target.name} until ended or removed.`
            )
          : (
              action.usesPrimaryAppliedSuccesses
                ? `${action.kind === "buff" ? "Buff/status created" : "Debuff/status created"}: ${action.name} grants ${linkedStacks} stack${linkedStacks === 1 ? "" : "s"} of ${action.kind === "buff" ? "+" : "-"}${action.modifier.amount} ${action.modifier.attribute} to ${target.name} (${action.kind === "buff" ? "+" : "-"}${appliedAmount} total) for ${durationRounds} turns.`
                : `${action.kind === "buff" ? "Buff" : "Debuff"}: ${action.name} applies ${action.kind === "buff" ? "+" : "-"}${appliedAmount} ${action.modifier.attribute} to ${target.name} for ${durationRounds} turns.`
            ),
        details: { modifierAttribute: action.modifier.attribute, amount: appliedAmount, stackAmount: action.modifier.amount, stacks: linkedStacks, durationRounds, durationSource: action.durationSource, passiveDuration, modifiesRollResults },
      });
      emitTranscriptEvent(state, {
        type: "statusCreated",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: passiveDuration
          ? `Status created: ${action.name} remains active until ended or removed.`
          : `Status created: ${action.name} on ${target.name}, ${durationRounds} ticks remaining.`,
        details: { effect: action.kind, durationRounds, durationSource: action.durationSource, passiveDuration },
      });
    }
  } else if (action.kind === "defence" && isDefensivePoolSetupAction(action)) {
    const mode = action.defenceMode ?? "Block";
    const poolType = defensivePoolTypeForAction(action);
    const generatedPoints = Math.max(0, activeAppliedSuccesses * Math.max(1, action.potency));
    const durationRounds = action.passiveDuration
      ? Number.MAX_SAFE_INTEGER
      : Math.max(1, action.durationRounds ?? action.modifier?.durationRounds ?? 1);
    if (mode === "Resist" && !action.defenceResistedAttribute) {
      metrics.wastedActions = 1;
      emitTranscriptEvent(state, {
        type: "actionSkipped",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Defensive pool skipped: ${action.name} is a Resist setup but has no resisted attribute, so Combat Lab cannot create a legal Resist pool.`,
        details: { defenceMode: mode, reason: "missingResistedAttribute" },
      });
    } else if (generatedPoints <= 0) {
      metrics.wastedActions = 1;
      emitTranscriptEvent(state, {
        type: "actionSkipped",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Defensive pool skipped: ${action.name} rolled no successes, so no ${poolType ?? "defensive"} pool is created.`,
        details: { defenceMode: mode, generatedPoints },
      });
    } else {
      createOrRefreshDefensivePool({
        state,
        metrics,
        actor,
        action,
        target,
        generatedPoints,
        durationRounds,
        lane,
      });
    }
  } else if (action.kind === "defence" && (action.defenceMode ?? "Block") === "Resist") {
    addMetrics(metrics, resolveAuthoredResistCleanupAction({
      state,
      actor,
      action,
      target,
      appliedSuccesses: activeAppliedSuccesses,
      rollSummary,
      lane,
    }));
  } else if (action.kind === "defence" && (action.defenceMode ?? "Block") === "Dodge") {
    metrics.wastedActions = 1;
    emitTranscriptEvent(state, {
      type: "actionSkipped",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Dodge: ${action.name} is resolved as an instant Counter against an incoming avoidable physical attack; normal use creates no persistent Dodge pool unless the power has authored duration.`,
      details: { defenceMode: "Dodge", reason: "counterOnlyDodgeDefence" },
    });
  } else if (action.kind === "defence") {
    const blockPerSuccess = Math.max(1, action.protection ?? action.potency);
    const amount = Math.max(1, activeAppliedSuccesses * blockPerSuccess);
    metrics.mitigationApplied = 0;
    emitTranscriptEvent(state, {
      type: "actionSkipped",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Defence power: ${action.name} has instant Block output (${activeAppliedSuccesses} x ${blockPerSuccess} = ${amount}) but Combat Lab V1 only spends Block as a duration defensive pool or Counter mitigation; no static protection status is created.`,
      details: { defenceMode: action.defenceMode ?? "Block", amount, blockPerSuccess, appliedSuccesses: activeAppliedSuccesses, pool: action.pool ?? "physical", reason: "instantBlockNoPersistentPool" },
    });
  } else if (action.kind === "control") {
    const controlStacks = Math.max(1, activeAppliedSuccesses * Math.max(1, action.potency));
    const durationRounds = Math.max(1, Math.trunc(action.control?.durationRounds ?? 1));
    state.statusEffects.push({
      id: `${state.round}:${actor.id}:${action.id}:${target.id}:control`,
      sourceActorId: actor.id,
      targetActorId: target.id,
      kind: "mainActionDenied",
      amount: controlStacks,
      cleanupAttribute: action.resistAttribute
        ? CORE_TO_COMBAT_ATTRIBUTE[action.resistAttribute] ?? "Fortitude"
        : "Fortitude",
      sourceActionId: action.id,
      sourceActionName: action.name,
      remainingRounds: durationRounds,
    });
    metrics.controlTurnsApplied = durationRounds;
    metrics.stacksApplied = controlStacks;
    emitTranscriptEvent(state, {
      type: "statusCreated",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Control: ${action.name} applies ${controlStacks} stack${controlStacks === 1 ? "" : "s"} of Force No Main Action to ${target.name} for ${durationRounds} turn${durationRounds === 1 ? "" : "s"}.`,
      details: { effect: "mainActionDenied", amount: controlStacks, durationRounds },
    });
  } else if (action.kind === "movement") {
    metrics.forcedMovementApplied = 1;
    metrics.positionalAbstractionsUsed = 1;
    emitTranscriptEvent(state, {
      type: "movementRoll",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Movement: ${action.name} forces movement; positioning is abstracted.`,
      details: { positionalAbstraction: true },
    });
  } else if (action.kind === "cleanse") {
    const cleanseUnits = Math.max(1, activeAppliedSuccesses * Math.max(1, action.potency));
    const removable = state.statusEffects.find(
      (effect) =>
        effect.targetActorId === target.id &&
        effect.sourceActorId !== actor.id &&
        (effect.kind === "ongoingDamage" ||
          effect.kind === "debuff" ||
          effect.kind === "mainActionDenied" ||
          effect.kind === "protection" ||
          effect.kind === "buff"),
    );
    if (removable) {
      const cleanupUnitWounds = removable.kind === "ongoingDamage" ? cleanupUnitWoundsForEffect(removable) : 1;
      const cleansed = removable.kind === "ongoingDamage"
        ? Math.min(removable.amount, cleanseUnits * cleanupUnitWounds)
        : Math.min(removable.amount, cleanseUnits);
      const cleanupUnitsRemoved =
        removable.kind === "ongoingDamage" && cleansed > 0
          ? Math.min(cleanseUnits, Math.max(1, Math.ceil(cleansed / cleanupUnitWounds)))
          : 0;
      const before = Math.max(0, removable.amount);
      if (removable.kind === "ongoingDamage") {
        removable.cleanupAttempted = true;
        recordOngoingCleanup({
          metrics,
          state,
          effect: removable,
          removedWounds: cleansed,
          cleanupUnitsRemoved,
          amountBefore: before,
          remainingTicksAtCleanup: Math.max(0, removable.remainingRounds),
        });
      }
      removable.amount = Math.max(0, removable.amount - cleansed);
      metrics.mitigationApplied = cleansed;
      metrics.ongoingDamagePreventedOrCleansed = removable.kind === "ongoingDamage" ? cleansed : 0;
      metrics.stacksCleansed = removable.kind === "ongoingDamage" ? 0 : cleansed;
      if (removable.amount <= 0) {
        removeStatusEffectById(state, removable.id);
      }
      emitTranscriptEvent(state, {
        type: "stackChanged",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: removable.kind === "ongoingDamage"
          ? `Cleanse: ${action.name} removes ${cleanseUnits} ongoing unit${cleanseUnits === 1 ? "" : "s"} from ${removable.sourceActionName ?? removable.kind} on ${target.name} (${cleanseUnits} x ${cleanupUnitWounds} = ${cleanseUnits * cleanupUnitWounds}); ${Math.max(0, removable.amount)} wounds per tick remain.`
          : `Cleanse: ${action.name} removes ${cleansed} from ${removable.sourceActionName ?? removable.kind} on ${target.name}.`,
        details: { cleansed, cleanseUnits, cleanupUnitsRemoved, cleanupUnitWounds: removable.kind === "ongoingDamage" ? cleanupUnitWounds : undefined, effect: removable.kind, remainingAmount: removable.amount },
      });
      if (removable.kind === "ongoingDamage") {
        emitTranscriptEvent(state, {
          type: "stackChanged",
          actorId: actor.id,
          actorName: actor.name,
          targetId: target.id,
          targetName: target.name,
          actionId: action.id,
          actionName: action.name,
          lane,
          message: `Cleanup result: removed ${cleanupUnitsRemoved} ongoing unit${cleanupUnitsRemoved === 1 ? "" : "s"} from ${removable.sourceActionName ?? "ongoing damage"}.`,
          details: {
            effect: "ongoingDamage",
            cleanupUnitsRemoved,
            removedWounds: cleansed,
            amountBefore: before,
            amountAfter: removable.amount,
          },
        });
      }
    } else {
      metrics.wastedActions = 1;
      emitTranscriptEvent(state, {
        type: "actionSkipped",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Action wasted: ${action.name} found no removable hostile effect on ${target.name}.`,
      });
    }
  }

  if (!params.fromSecondary) {
    const independentBundleActions = (action.secondaryActions ?? []).filter(isIndependentBundleSecondary);
    const dependentSecondaryActions = (action.secondaryActions ?? []).filter((secondaryAction) => !isIndependentBundleSecondary(secondaryAction));

    if (independentBundleActions.length > 0) {
      addMetrics(metrics, resolveIndependentSecondaryBundle({
        state,
        actor,
        primaryAction: action,
        primaryTarget: target,
        secondaryActions: independentBundleActions,
        rng,
        lane,
      }));
    }

    for (const secondaryAction of dependentSecondaryActions) {
      const scalingMode = secondaryAction.linkedScalingMode ?? (action.kind === "attack" ? "primaryWoundBands" : "primaryAppliedSuccesses");
      const linkedPrimaryContext: LinkedPrimaryContext | null =
        scalingMode === "primaryWoundBands"
          ? (
              linkedWoundBandContext?.netPrimaryWounds
                ? (() => {
                    const primaryWoundsPerSuccess = Math.max(
                      1,
                      secondaryAction.primaryWoundsPerSuccess ?? linkedWoundBandContext.primaryWoundsPerSuccess ?? 1,
                    );
                    return {
                      ...linkedWoundBandContext,
                      primaryWoundsPerSuccess,
                      linkedUnits: Math.max(1, Math.ceil(linkedWoundBandContext.netPrimaryWounds / primaryWoundsPerSuccess)),
                    };
                  })()
                : null
            )
          : activeAppliedSuccesses > 0
            ? {
                scalingMode: "primaryAppliedSuccesses",
                primaryActionName: action.name,
                primaryAppliedSuccesses: activeAppliedSuccesses,
                linkedUnits: activeAppliedSuccesses,
              }
            : null;

      if (!linkedPrimaryContext || linkedPrimaryContext.linkedUnits <= 0) {
        if (scalingMode === "primaryWoundBands") {
          emitTranscriptEvent(state, {
            type: "statusCreated",
            actorId: actor.id,
            actorName: actor.name,
            targetId: target.id,
            targetName: target.name,
            actionId: secondaryAction.id,
            actionName: secondaryAction.name,
            lane,
            message: `Linked effect: ${secondaryAction.name} does not apply because ${action.name} inflicted 0 net wounds.`,
            details: {
              scalingMode,
              primaryActionId: action.id,
              primaryActionName: action.name,
              netPrimaryWounds: 0,
            },
          });
        }
        continue;
      }
      addMetrics(metrics, resolveSingleTargetAction({
        state,
        actor,
        action: secondaryAction,
        target,
        rng,
        lane,
        fromSecondary: true,
        gateAlreadyResolved: true,
        primaryAppliedSuccesses: linkedPrimaryContext.linkedUnits,
        linkedPrimaryContext,
      }));
    }
  }

  return metrics;
}

export function resolveCombatAction(params: {
  state: CombatState;
  actor: CombatActor;
  action: CombatAction | null;
  target: CombatActor | null;
  rng: Rng;
  lane?: CombatActionLane;
}): CombatResolutionMetrics {
  const { state, actor, action, target, rng, lane } = params;
  const metrics = emptyResolution();
  if (!action || !target || actor.defeated) {
    metrics.wastedActions = 1;
    emitTranscriptEvent(state, {
      type: "actionSkipped",
      actorId: actor.id,
      actorName: actor.name,
      lane,
      message: `${actor.name} has no ${lane ?? "action"} action target and skips.`,
    });
    return metrics;
  }
  if (isActionOnCooldown(state, actor.id, action.id)) {
    recordCooldownPreventedUse(state, actor, action);
    metrics.wastedActions = 1;
    emitTranscriptEvent(state, {
      type: "actionSkipped",
      actorId: actor.id,
      actorName: actor.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `${actor.name} considers ${action.name}, but it is on cooldown and cannot be used.`,
    });
    return metrics;
  }
  if (action.runtimeCleanup) {
    return resolveUniversalCleanupAction({ state, actor, action, rng, lane });
  }
  recordActionUse(state, actor, action);

  const targets = resolveTargets(state, actor, action, target);
  const laneLabel = lane === "power" ? "Power Action" : lane === "response" ? "Response" : "Main Action";
  const actionVerb = action.kind === "attack" || action.kind === "control" || action.kind === "movement" ? "declares" : "uses";
  emitTranscriptEvent(state, {
    type: lane === "power" ? "powerAction" : lane === "response" ? "responseAction" : "mainAction",
    actorId: actor.id,
    actorName: actor.name,
    targetId: target.id,
    targetName: targets.map((entry) => entry.name).join(", "),
    actionId: action.id,
    actionName: action.name,
    lane,
    message: `${laneLabel}: ${actor.name} ${actionVerb} ${action.name} on ${targets.map((entry) => entry.name).join(", ")}.`,
    details: { targetCount: targets.length, actionKind: action.kind, cooldownRounds: action.cooldownRounds },
  });
  if (actionUsesAoeAbstraction(action)) {
    metrics.aoeActionUses += 1;
    metrics.aoePotentialTargets += aoePotentialTargetCount(action);
    metrics.aoeActualTargets += targets.length;
    metrics.positionalAbstractionsUsed += 1;
  }
  for (const resolvedTarget of targets) {
    addMetrics(metrics, resolveSingleTargetAction({ state, actor, action, target: resolvedTarget, rng, lane }));
  }

  if (!action.passiveDuration) {
    applyActionCooldown(state, actor, action);
  }

  const defeated = markDefeatedActors(state);
  state.log.push({
    round: state.round,
    actorId: actor.id,
    actorName: actor.name,
    actionId: action.id,
    actionName: action.name,
    targetId: target.id,
    targetName: targets.map((entry) => entry.name).join(", "),
    message: `${actor.name} used ${action.name} on ${targets.map((entry) => entry.name).join(", ")}${defeated.some((id) => targets.some((entry) => entry.id === id)) ? " and defeated a target" : ""}.`,
    metrics,
  });

  return metrics;
}
