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
  recordActionUse,
  recordCooldownPreventedUse,
  spendActorResponse,
} from "./combatState";
import type {
  CombatAction,
  CombatActionLane,
  CombatActor,
  CombatAttributeName,
  CombatRollSummary,
  CombatResolutionMetrics,
  CombatState,
} from "./types";

const CORE_TO_COMBAT_ATTRIBUTE: Record<string, CombatAttributeName> = {
  ATTACK: "Attack",
  GUARD: "Guard",
  FORTITUDE: "Fortitude",
  INTELLECT: "Intellect",
  SYNERGY: "Synergy",
  BRAVERY: "Bravery",
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
    passiveDefenceContribution: 0,
    stacksApplied: 0,
    stacksExpired: 0,
    stacksCleansed: 0,
    aoeActionUses: 0,
    aoePotentialTargets: 0,
    aoeActualTargets: 0,
    positionalAbstractionsUsed: 0,
  };
}

function getActorDie(actor: CombatActor, action: CombatAction) {
  return actor.attributeDice[action.accuracyAttribute] ?? "D8";
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

function takeDefenceDegradation(state: CombatState, actorId: string, type: "dodge" | "physical" | "mental") {
  state.defenceDegradation[actorId] ??= { dodge: 0, physical: 0, mental: 0 };
  const previousRolls = state.defenceDegradation[actorId][type];
  state.defenceDegradation[actorId][type] += 1;
  return previousRolls;
}

function peekDefenceDegradation(state: CombatState, actorId: string, type: "dodge" | "physical" | "mental") {
  return state.defenceDegradation[actorId]?.[type] ?? 0;
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

function resolveDodge(state: CombatState, target: CombatActor, incomingSuccesses: number, rng: Rng): CombatResolutionMetrics {
  const metrics = emptyResolution();
  if (incomingSuccesses <= 0) return metrics;
  const degradation = takeDefenceDegradation(state, target.id, "dodge");
  const baseDice = Math.max(1, Math.trunc(target.dodgeDice ?? target.dodgeValue ?? 1));
  const diceCount = Math.max(1, baseDice - degradation);
  const roll = rollAttributeDice({ state, actor: target, attribute: "Guard", diceCount, rng });
  const rollSummary = summarizeRoll({ actor: target, reason: "Dodge", attribute: "Guard", roll });
  metrics.dodgeRolls = 1;
  metrics.dodgeChosen = 1;
  metrics.dodgeDegradationApplied = degradation;
  metrics.degradedDefenceRolls = degradation > 0 ? 1 : 0;
  metrics.dodgeSuccesses = roll.successes;
  recordModifiedDefenceRoll(metrics, roll.modifier);
  if (roll.successes >= incomingSuccesses) {
    metrics.woundsAvoidedByDodge = incomingSuccesses;
  }
  emitTranscriptEvent(state, {
    type: "dodgeRoll",
    actorId: target.id,
    actorName: target.name,
    lane: "response",
    message: `${rollText(rollSummary)} Dodge ${roll.successes >= incomingSuccesses ? "succeeded" : "failed"} against ${incomingSuccesses} incoming successes. Degradation ${degradation}, final dice ${diceCount}.`,
    roll: rollSummary,
    details: {
      incomingSuccesses,
      originalDice: baseDice,
      degradation,
      finalDice: diceCount,
      dodgeSucceeded: roll.successes >= incomingSuccesses,
    },
  });
  return metrics;
}

function resolveDefenceString(state: CombatState, target: CombatActor, pool: "physical" | "mental", wounds: number, rng: Rng): CombatResolutionMetrics {
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
  if (blockPerSuccess <= 0) return metrics;
  const degradation = takeDefenceDegradation(state, target.id, type);
  const diceCount = Math.max(1, baseDice - degradation);
  const roll = rollAttributeDice({ state, actor: target, attribute, diceCount, rng });
  const rollSummary = summarizeRoll({ actor: target, reason: `${pool} defence`, attribute, roll });
  const blocked = Math.min(wounds, roll.successes * blockPerSuccess);
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
    message: `${rollText(rollSummary)} ${pool === "physical" ? "Physical Defence" : "Mental Defence"} blocked ${blocked} of ${wounds} ${pool} wounds (${blockPerSuccess} block per success). Degradation ${degradation}, final dice ${diceCount}.`,
    roll: rollSummary,
    details: {
      pool,
      incomingWounds: wounds,
      blocked,
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
  return probabilitySuccessesAtLeast({
    diceCount,
    die: target.attributeDice.Guard ?? "D8",
    modifier,
    threshold: incomingSuccesses,
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
  if (blockPerSuccess <= 0) return 0;
  const expectedBlocked = expectedSuccesses(
    diceCount,
    target.attributeDice[attribute] ?? "D8",
    getAttributeModifier(state, target.id, attribute),
  ) * blockPerSuccess;
  return Math.min(rawWounds, expectedBlocked);
}

function resolveBestNormalDefence(params: {
  state: CombatState;
  target: CombatActor;
  pool: "physical" | "mental";
  incomingSuccesses: number;
  rawWounds: number;
  rng: Rng;
}): CombatResolutionMetrics {
  const dodgeValue = estimateDodgeValue(params.state, params.target, params.incomingSuccesses, params.rawWounds);
  const defenceStringValue = estimateDefenceStringValue(params.state, params.target, params.pool, params.rawWounds);
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
      ? resolveDefenceString(params.state, params.target, params.pool, params.rawWounds, params.rng)
      : resolveDodge(params.state, params.target, params.incomingSuccesses, params.rng);
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

function addMetrics(target: CombatResolutionMetrics, source: Partial<CombatResolutionMetrics>) {
  for (const key of Object.keys(source) as Array<keyof CombatResolutionMetrics>) {
    target[key] += source[key] ?? 0;
  }
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

function resolveResist(state: CombatState, target: CombatActor, action: CombatAction, successes: number, rng: Rng): CombatResolutionMetrics {
  const metrics = emptyResolution();
  metrics.hostileSuccessesBeforeResist = successes;
  metrics.hostileSuccessesAfterResist = successes;
  if (!action.resistAttribute || successes <= 0) return metrics;
  const resistDice = Math.max(1, 3 + (target.resist[action.resistAttribute] ?? 0));
  const attribute = CORE_TO_COMBAT_ATTRIBUTE[action.resistAttribute] ?? "Guard";
  const resistRoll = rollAttributeDice({ state, actor: target, attribute, diceCount: resistDice, rng });
  const rollSummary = summarizeRoll({ actor: target, reason: `${action.name} resist`, attribute, roll: resistRoll });
  const cancelled = Math.min(successes, resistRoll.successes);
  metrics.resistRolls = 1;
  metrics.resistSuccesses = resistRoll.successes;
  metrics.resistCancelled = cancelled;
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
    message: `${rollText(rollSummary)} Resist formula 3 + ${action.resistAttribute} resist value = ${resistDice} dice; cancelled ${cancelled} of ${successes} hostile successes.`,
    roll: rollSummary,
    details: {
      resistAttribute: action.resistAttribute,
      resistDice,
      incomingSuccesses: successes,
      cancelled,
      remainingSuccesses: metrics.hostileSuccessesAfterResist,
    },
  });
  return metrics;
}

function passiveDefenceAmount(target: CombatActor, pool: "physical" | "mental") {
  return target.actions
    .filter((action) => action.passive && action.kind === "defence" && (action.pool ?? pool) === pool)
    .reduce((sum, action) => sum + Math.max(1, action.protection ?? action.potency), 0);
}

function resolveCounterDefences(state: CombatState, target: CombatActor, attacker: CombatActor, pool: "physical" | "mental", rng: Rng) {
  const metrics = emptyResolution();
  const counterCandidates = target.actions.filter(
    (action) =>
      action.counterMode &&
      action.kind === "defence" &&
      !state.counterUses[`${state.round}:${target.id}:${action.id}`] &&
      (action.pool ?? pool) === pool,
  );
  for (const action of counterCandidates.filter((candidate) => isActionOnCooldown(state, target.id, candidate.id))) {
    recordCooldownPreventedUse(state, target, action);
  }
  const availableCounters = counterCandidates.filter((action) => !isActionOnCooldown(state, target.id, action.id));
  for (const action of availableCounters.slice(0, 1)) {
    if (!spendActorResponse(state, target.id)) {
      metrics.responsesWastedOrUnavailable = 1;
      return metrics;
    }
    state.counterUses[`${state.round}:${target.id}:${action.id}`] = 1;
    recordActionUse(state, target, action);
    const roll = rollDice(
      Math.max(1, action.diceCount),
      getActorDie(target, action),
      rng,
      getAttributeModifier(state, target.id, action.accuracyAttribute),
    );
    const rollSummary = summarizeRoll({ actor: target, reason: action.name, attribute: action.accuracyAttribute, roll });
    metrics.counterMitigation += Math.max(1, roll.successes * Math.max(1, action.protection ?? action.potency));
    metrics.counterUses += 1;
    metrics.counterChosen += 1;
    metrics.responsesUsed += 1;
    applyActionCooldown(state, target, action);
    emitTranscriptEvent(state, {
      type: "counterRoll",
      actorId: target.id,
      actorName: target.name,
      targetId: attacker.id,
      targetName: attacker.name,
      actionId: action.id,
      actionName: action.name,
      lane: "response",
      message: `Response: ${target.name} uses ${action.name}. ${rollText(rollSummary)} Counter mitigation ${metrics.counterMitigation}.`,
      roll: rollSummary,
      details: { counterMitigation: metrics.counterMitigation, responsesRemaining: state.responsesRemaining[target.id] ?? 0 },
    });
    state.log.push({
      round: state.round,
      actorId: target.id,
      actorName: target.name,
      actionId: action.id,
      actionName: action.name,
      targetId: attacker.id,
      targetName: attacker.name,
      message: `${target.name} used counter ${action.name}; counter economy uses Responses and is limited to one reaction per incoming action.`,
      metrics: { counterUses: 1, counterMitigation: metrics.counterMitigation, responsesUsed: 1 },
    });
  }
  return metrics;
}

function resolveCounterAttacks(state: CombatState, target: CombatActor, attacker: CombatActor, rng: Rng) {
  const metrics = emptyResolution();
  const counterCandidates = target.actions.filter(
    (candidate) =>
      candidate.counterMode &&
      candidate.kind === "attack" &&
      !state.counterUses[`${state.round}:${target.id}:${candidate.id}`],
  );
  for (const candidate of counterCandidates.filter((action) => isActionOnCooldown(state, target.id, action.id))) {
    recordCooldownPreventedUse(state, target, candidate);
  }
  const action = counterCandidates.find((candidate) => !isActionOnCooldown(state, target.id, candidate.id));
  if (!action) return metrics;
  if (!spendActorResponse(state, target.id)) {
    metrics.responsesWastedOrUnavailable = 1;
    return metrics;
  }
  state.counterUses[`${state.round}:${target.id}:${action.id}`] = 1;
  recordActionUse(state, target, action);
  const roll = rollDice(
    Math.max(1, action.diceCount),
    getActorDie(target, action),
    rng,
    getAttributeModifier(state, target.id, action.accuracyAttribute),
  );
  const rollSummary = summarizeRoll({ actor: target, reason: action.name, attribute: action.accuracyAttribute, roll });
  const raw = roll.successes * action.potency;
  const pool = action.pool ?? "physical";
  const prevented = Math.min(raw, pool === "physical" ? attacker.physicalProtection : attacker.mentalProtection);
  const damage = Math.max(0, raw - prevented);
  metrics.counterDamage = damage;
  metrics.counterUses = 1;
  metrics.counterChosen = 1;
  metrics.responsesUsed = 1;
  applyWounds(attacker, pool, damage);
  applyActionCooldown(state, target, action);
  emitTranscriptEvent(state, {
    type: "counterRoll",
    actorId: target.id,
    actorName: target.name,
    targetId: attacker.id,
    targetName: attacker.name,
    actionId: action.id,
    actionName: action.name,
    lane: "response",
    message: `Response: ${target.name} uses ${action.name}. ${rollText(rollSummary)} Counter deals ${damage} ${pool} wounds after ${prevented} protection.`,
    roll: rollSummary,
    details: { rawWounds: raw, prevented, netWounds: damage, pool, responsesRemaining: state.responsesRemaining[target.id] ?? 0 },
  });
  state.log.push({
    round: state.round,
    actorId: target.id,
    actorName: target.name,
    actionId: action.id,
    actionName: action.name,
    targetId: attacker.id,
    targetName: attacker.name,
    message: `${target.name} used counter ${action.name}; counter economy uses Responses and is limited to one reaction per incoming action.`,
    metrics: { counterUses: 1, counterDamage: damage, responsesUsed: 1 },
  });
  return metrics;
}

export function resolveStartOfTurnEffects(state: CombatState, actor: CombatActor): CombatResolutionMetrics {
  const metrics = emptyResolution();
  const actorEffects = state.statusEffects.filter((entry) => entry.targetActorId === actor.id);
  const actionDeniedEffects = actorEffects.filter((effect) => effect.kind === "mainActionDenied");
  if (actionDeniedEffects.length > 0) {
    const primaryDenial = actionDeniedEffects[0];
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
          ? `Start of Turn: ${actor.name}'s main action is denied by ${primaryDenial?.sourceActionName ?? "a control effect"}. ${actionDeniedEffects.length} denial effects were present, consolidated to one denied main action.`
          : `Start of Turn: ${actor.name}'s main action is denied by ${primaryDenial?.sourceActionName ?? "a control effect"}. ${primaryDenial?.remainingRounds ?? 0} ticks remaining.`,
      details: {
        effect: "mainActionDenied",
        amount: 1,
        consolidatedEffects: actionDeniedEffects.length,
        remainingRounds: primaryDenial?.remainingRounds,
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
      const overkill = applyWounds(actor, effect.pool ?? "physical", effect.amount);
      metrics.netWounds += effect.amount;
      metrics.ongoingDamageApplied += effect.amount;
      metrics.ongoingDamageTicks += 1;
      metrics.overkill += overkill;
      emitTranscriptEvent(state, {
        type: "statusTick",
        actorId: actor.id,
        actorName: actor.name,
        actionId: effect.sourceActionId,
        actionName: effect.sourceActionName,
        lane: "startOfTurn",
        message: `Start of Turn: ${actor.name} suffers ${effect.amount} ${effect.pool ?? "physical"} wounds from ${effect.sourceActionName ?? "ongoing damage"}. ${effect.remainingRounds} ticks remaining.`,
        details: { effect: effect.kind, wounds: effect.amount, pool: effect.pool ?? "physical", overkill, remainingRounds: effect.remainingRounds },
      });
    }
  }
  markDefeatedActors(state);
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
}): CombatResolutionMetrics {
  const { state, actor, action, target, rng, lane } = params;
  const gateAlreadyResolved = Boolean(params.gateAlreadyResolved || params.fromSecondary);
  const metrics = emptyResolution();
  const actorAttributeModifier = getAttributeModifier(state, actor.id, action.accuracyAttribute);
  if (actorAttributeModifier > 0) metrics.buffedActions = 1;
  if (actorAttributeModifier < 0) metrics.debuffedActions = 1;
  const diceCount = Math.max(0, action.diceCount);
  const roll = rollDice(diceCount, getActorDie(actor, action), rng, actorAttributeModifier);
  const rollSummary = summarizeRoll({ actor, reason: action.name, attribute: action.accuracyAttribute, roll });
  metrics.rawSuccesses = roll.successes;
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

  if (gateAlreadyResolved) {
    emitTranscriptEvent(state, {
      type: "statusCreated",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Linked effect: ${action.name} rides the primary defence result; no second Dodge, Protection, or Resist gate is rolled.`,
      details: { gateAlreadyResolved: true, fromSecondary: Boolean(params.fromSecondary) },
    });
  } else if (action.kind === "attack" || action.kind === "control" || action.kind === "movement") {
    const resistMetrics = resolveResist(state, target, action, roll.successes, rng);
    addMetrics(metrics, resistMetrics);
    if (action.resistAttribute && resistMetrics.hostileSuccessesAfterResist <= 0) {
      return metrics;
    }
  }

  if (action.kind === "attack") {
    const pool = action.pool ?? "physical";
    const activeHostileSuccesses =
      !gateAlreadyResolved && action.resistAttribute ? metrics.hostileSuccessesAfterResist : roll.successes;
    const rawWounds = activeHostileSuccesses * action.potency;
    emitTranscriptEvent(state, {
      type: "damageApplied",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Declared damage: ${action.name} has ${activeHostileSuccesses} active successes x ${action.potency} = ${rawWounds} ${pool} wounds before defence.`,
      details: { activeSuccesses: activeHostileSuccesses, potency: action.potency, rawWounds, pool },
    });
    const normalDefenceMetrics = gateAlreadyResolved
      ? emptyResolution()
      : resolveBestNormalDefence({
          state,
          target,
          pool,
          incomingSuccesses: activeHostileSuccesses,
          rawWounds,
          rng,
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
        message: `Attack result: ${target.name} dodged ${action.name}; 0 net wounds.`,
        details: { rawWounds, netWounds: 0, pool },
      });
      return metrics;
    }
    const activeSuccesses = activeHostileSuccesses;
    const activeRawWounds = activeSuccesses * action.potency;
    const passiveDefence = gateAlreadyResolved ? 0 : passiveDefenceAmount(target, pool);
    const normalDefenceBlocked = normalDefenceMetrics.defenceStringBlocked;
    const counterDefenceMetrics =
      !gateAlreadyResolved && activeRawWounds - normalDefenceBlocked > 0
        ? resolveCounterDefences(state, target, actor, pool, rng)
        : emptyResolution();
    addMetrics(metrics, counterDefenceMetrics);
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
    const prevented = normalDefenceBlocked + counterDefenceMetrics.counterMitigation + staticPrevented;
    const netWounds = Math.max(0, activeRawWounds - prevented);
    const overkill = applyWounds(target, pool, netWounds);
    const counterAttackMetrics =
      gateAlreadyResolved || counterDefenceMetrics.counterChosen > 0
        ? emptyResolution()
        : resolveCounterAttacks(state, target, actor, rng);
    addMetrics(metrics, counterAttackMetrics);

    metrics.rawWounds = rawWounds;
    metrics.protectionPrevented = prevented;
    metrics.staticProtectionPrevented = staticPrevented;
    metrics.passiveDefenceContribution = Math.min(activeRawWounds, passiveDefence);
    metrics.netWounds = netWounds;
    metrics.overkill = overkill;
    emitTranscriptEvent(state, {
      type: "damageApplied",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Attack result: ${target.name} suffers ${netWounds} ${pool} wounds from ${action.name}. Prevented ${prevented} (${normalDefenceBlocked} defence, ${counterDefenceMetrics.counterMitigation} counter, ${staticPrevented} static/passive).`,
      details: { rawWounds: activeRawWounds, prevented, netWounds, overkill, pool },
    });
    if (action.recurring?.kind === "ongoingDamage" && netWounds > 0) {
      const units = Math.max(1, Math.ceil(netWounds / Math.max(1, action.potency)));
      state.statusEffects.push({
        id: `${state.round}:${actor.id}:${action.id}:${target.id}:ongoing`,
        sourceActorId: actor.id,
        targetActorId: target.id,
        kind: "ongoingDamage",
        amount: Math.max(1, action.potency) * units,
        pool,
        sourceActionId: action.id,
        sourceActionName: action.name,
        remainingRounds: action.recurring.durationRounds,
      });
      metrics.ongoingDamageUnitsApplied += units;
      metrics.stacksApplied += units;
      emitTranscriptEvent(state, {
        type: "statusCreated",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Status created: ${action.name} ongoing damage on ${target.name}, ${action.recurring.durationRounds} ticks remaining, ${Math.max(1, action.potency) * units} ${pool} wounds per tick.`,
        details: { effect: "ongoingDamage", amount: Math.max(1, action.potency) * units, units, durationRounds: action.recurring.durationRounds, pool },
      });
    }
  } else if (action.kind === "healing") {
    if (action.recurring?.kind === "healingOverTime") {
      const amount = Math.max(1, roll.successes * action.potency);
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
      const healing = roll.successes * action.potency;
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
        message: `Healing: ${action.name} heals ${metrics.healingDone} ${action.pool ?? "physical"} wounds on ${target.name} (${roll.successes} successes x ${action.potency}).`,
        details: { healingRolled: healing, healingApplied: metrics.healingDone, pool: action.pool ?? "physical" },
      });
    }
  } else if (action.kind === "buff" || action.kind === "debuff") {
    if (action.modifier) {
      state.statusEffects.push({
        id: `${state.round}:${actor.id}:${action.id}:${target.id}`,
        sourceActorId: actor.id,
        targetActorId: target.id,
        kind: action.kind,
        attribute: action.modifier.attribute,
        amount: action.modifier.amount,
        sourceActionId: action.id,
        sourceActionName: action.name,
        remainingRounds: action.modifier.durationRounds,
        positionalAbstraction: action.targetPolicy === "allAllies"
          ? "AOE ally buff abstracted to all living allies."
          : action.targetPolicy === "allEnemies"
            ? "Field positioning abstracted: affected all enemy actors."
            : undefined,
      });
      metrics.buffDebuffApplied = action.modifier.amount;
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
        message: `${action.kind === "buff" ? "Buff" : "Debuff"}: ${action.name} applies ${action.kind === "buff" ? "+" : "-"}${action.modifier.amount} ${action.modifier.attribute} to ${target.name} for ${action.modifier.durationRounds} turns.`,
        details: { modifierAttribute: action.modifier.attribute, amount: action.modifier.amount, durationRounds: action.modifier.durationRounds },
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
        message: `Status created: ${action.name} on ${target.name}, ${action.modifier.durationRounds} ticks remaining.`,
        details: { effect: action.kind, durationRounds: action.modifier.durationRounds },
      });
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
      sourceActionId: action.id,
      sourceActionName: action.name,
      remainingRounds: action.modifier?.durationRounds ?? 1,
    });
    metrics.mitigationApplied = amount;
    emitTranscriptEvent(state, {
      type: "statusCreated",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Defence power: ${action.name} gives ${target.name} ${amount} ${action.pool ?? "physical"} protection for ${action.modifier?.durationRounds ?? 1} turns.`,
      details: { effect: "protection", amount, pool: action.pool ?? "physical", durationRounds: action.modifier?.durationRounds ?? 1 },
    });
  } else if (action.kind === "control") {
    state.statusEffects.push({
      id: `${state.round}:${actor.id}:${action.id}:${target.id}:control`,
      sourceActorId: actor.id,
      targetActorId: target.id,
      kind: "mainActionDenied",
      amount: 1,
      sourceActionId: action.id,
      sourceActionName: action.name,
      remainingRounds: 1,
    });
    metrics.controlTurnsApplied = 1;
    emitTranscriptEvent(state, {
      type: "statusCreated",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: `Control: ${action.name} denies ${target.name}'s main action for 1 turn.`,
      details: { effect: "mainActionDenied", durationRounds: 1 },
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
    const cleanseUnits = Math.max(1, roll.successes * Math.max(1, action.potency));
    const removable = state.statusEffects.find(
      (effect) =>
        effect.targetActorId === target.id &&
        effect.sourceActorId !== actor.id &&
        (effect.kind === "ongoingDamage" || effect.kind === "debuff" || effect.kind === "mainActionDenied"),
    );
    if (removable) {
      const cleansed = Math.min(removable.amount, cleanseUnits);
      removable.amount = Math.max(0, removable.amount - cleanseUnits);
      metrics.mitigationApplied = cleansed;
      metrics.ongoingDamagePreventedOrCleansed = removable.kind === "ongoingDamage" ? cleansed : 0;
      metrics.stacksCleansed = cleansed;
      if (removable.amount <= 0) {
        state.statusEffects = state.statusEffects.filter((effect) => effect.id !== removable.id);
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
        message: `Cleanse: ${action.name} removes ${cleansed} from ${removable.sourceActionName ?? removable.kind} on ${target.name}.`,
        details: { cleansed, effect: removable.kind, remainingAmount: removable.amount },
      });
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

  const primaryLanded = metrics.rawSuccesses > 0 && (!action.resistAttribute || metrics.hostileSuccessesAfterResist > 0);
  if (!params.fromSecondary && primaryLanded) {
    for (const secondaryAction of action.secondaryActions ?? []) {
      addMetrics(metrics, resolveSingleTargetAction({
        state,
        actor,
        action: secondaryAction,
        target,
        rng,
        lane,
        fromSecondary: true,
        gateAlreadyResolved: true,
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
  recordActionUse(state, actor, action);

  const targets = resolveTargets(state, actor, action, target);
  emitTranscriptEvent(state, {
    type: lane === "power" ? "powerAction" : lane === "response" ? "responseAction" : "mainAction",
    actorId: actor.id,
    actorName: actor.name,
    targetId: target.id,
    targetName: targets.map((entry) => entry.name).join(", "),
    actionId: action.id,
    actionName: action.name,
    lane,
    message: `${lane === "power" ? "Power Action" : lane === "response" ? "Response" : "Main Action"}: ${actor.name} uses ${action.name} on ${targets.map((entry) => entry.name).join(", ")}.`,
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

  applyActionCooldown(state, actor, action);

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
