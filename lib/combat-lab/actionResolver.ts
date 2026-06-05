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
  removeStatusEffectById,
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
    message: `${rollText(rollSummary)} ${pool === "physical" ? "Physical Defence" : "Mental Defence"} blocked ${blocked} of ${wounds} ${context.ongoingPerTick ? "ongoing " : ""}${pool} wounds${context.ongoingPerTick ? " per tick" : ""} (${blockPerSuccess} block per success). Degradation ${degradation}, final dice ${diceCount}.`,
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
  ongoingPerTick?: boolean;
}): CombatResolutionMetrics {
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

type DeclaredCounter = {
  action: CombatAction;
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

function counterDefencePackets(action: CombatAction, pool: "physical" | "mental") {
  return actionAndSecondaries(action).filter(
    (entry) => entry.kind === "defence" && (entry.pool ?? pool) === pool,
  );
}

function counterPriority(action: CombatAction, pool: "physical" | "mental") {
  const hasAttackPacket = counterAttackPackets(action).length > 0;
  const hasDefencePacket = counterDefencePackets(action, pool).length > 0;
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
  const counterCandidates = target.actions
    .filter((action) => action.counterMode && !state.counterUses[`${state.round}:${target.id}:${action.id}`])
    .filter((action) => counterPriority(action, pool) < 3)
    .sort((left, right) => counterPriority(left, pool) - counterPriority(right, pool));

  for (const candidate of counterCandidates.filter((action) => isActionOnCooldown(state, target.id, action.id))) {
    recordCooldownPreventedUse(state, target, candidate);
  }

  const action = counterCandidates.find((candidate) => !isActionOnCooldown(state, target.id, candidate.id));
  if (!action) return { declared: null, metrics };
  if ((state.responsesRemaining[target.id] ?? 0) <= 0) {
    metrics.responsesWastedOrUnavailable = 1;
    return { declared: null, metrics };
  }

  const hasAttackPacket = counterAttackPackets(action).length > 0;
  const hasDefencePacket = counterDefencePackets(action, pool).length > 0;
  const forfeitsNormalDefence = hasAttackPacket && !hasDefencePacket;
  const declared: DeclaredCounter = { action, hasAttackPacket, hasDefencePacket, forfeitsNormalDefence };

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
      hasAttackPacket,
      hasDefencePacket,
      forfeitsNormalDefence,
    },
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
      message: `Counter tradeoff: ${action.name} includes an Attack packet and no Defence packet, so ${target.name} forfeits normal defence against ${incomingAction.name}.`,
      details: { forfeitsNormalDefence: true },
    });
  } else if (hasAttackPacket && hasDefencePacket) {
    emitTranscriptEvent(state, {
      type: "counterDeclared",
      actorId: target.id,
      actorName: target.name,
      targetId: attacker.id,
      targetName: attacker.name,
      actionId: action.id,
      actionName: action.name,
      lane: "response",
      message: `Counter tradeoff: ${action.name} includes Defence, so its authored defensive packet applies against ${incomingAction.name}.`,
      details: { forfeitsNormalDefence: false },
    });
  }

  spendActorResponse(state, target.id);
  state.counterUses[`${state.round}:${target.id}:${action.id}`] = 1;
  recordActionUse(state, target, action);
  applyActionCooldown(state, target, action);
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
  const roll = rollDice(
    Math.max(1, action.diceCount),
    getActorDie(target, action),
    rng,
    getAttributeModifier(state, target.id, action.accuracyAttribute),
  );
  const rollSummary = summarizeRoll({ actor: target, reason: action.name, attribute: action.accuracyAttribute, roll });
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
    details: { responsesRemaining: state.responsesRemaining[target.id] ?? 0 },
  });
  return { declared, successes: roll.successes, rollSummary };
}

function resolveDeclaredCounterDefence(params: {
  state: CombatState;
  target: CombatActor;
  attacker: CombatActor;
  counterRoll: DeclaredCounterRoll | null;
  pool: "physical" | "mental";
  remainingWounds: number;
}): CombatResolutionMetrics {
  const { state, target, attacker, counterRoll, pool, remainingWounds } = params;
  const metrics = emptyResolution();
  if (!counterRoll || remainingWounds <= 0) return metrics;
  const defencePackets = counterDefencePackets(counterRoll.declared.action, pool);
  if (defencePackets.length === 0) return metrics;
  const mitigationPerSuccess = defencePackets.reduce(
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
    const passiveDefence = passiveDefenceAmount(attacker, pool);
    const staticProtection =
      (pool === "physical" ? attacker.physicalProtection : attacker.mentalProtection) +
      getProtectionModifier(state, attacker.id, pool) +
      passiveDefence;
    const prevented = Math.min(raw, Math.max(0, staticProtection));
    const damage = Math.max(0, raw - prevented);
    applyWounds(attacker, pool, damage);
    metrics.counterDamage += damage;
    metrics.staticProtectionPrevented += prevented;
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
      message: `Counter result: ${attacker.name} suffers ${damage} ${pool} wounds from ${counterRoll.declared.action.name}. Prevented ${prevented} passive/static.`,
      details: { rawWounds: raw, prevented, netWounds: damage, pool },
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
      const overkill = applyWounds(actor, effect.pool ?? "physical", effect.amount);
      const remainingAfterTick = Math.max(0, effect.remainingRounds - 1);
      const woundLabel = effect.damageLabel ?? effect.pool ?? "physical";
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
        message: `Start of Turn: ${actor.name} suffers ${effect.amount} ${woundLabel} wounds from ${effect.sourceActionName ?? "ongoing damage"}. Ticks remaining after this: ${remainingAfterTick}.`,
        details: { effect: effect.kind, wounds: effect.amount, pool: effect.pool ?? "physical", overkill, remainingRounds: effect.remainingRounds, remainingAfterTick },
      });
      if (actor.physicalHpCurrent <= 0 || actor.mentalHpCurrent <= 0) {
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
  const actorAttributeModifier = getAttributeModifier(state, actor.id, action.accuracyAttribute);
  if (actorAttributeModifier > 0) metrics.buffedActions = 1;
  if (actorAttributeModifier < 0) metrics.debuffedActions = 1;
  const inheritedPrimaryAppliedSuccesses = Math.max(0, Math.trunc(params.primaryAppliedSuccesses ?? 0));
  const skipOwnRoll = Boolean(params.fromSecondary && (action.skipOwnRoll || action.usesPrimaryAppliedSuccesses));
  const poolForCounterDeclaration = action.pool ?? "physical";
  const counterDeclaration =
    !gateAlreadyResolved && !params.fromSecondary && action.kind === "attack"
      ? declareCounter({ state, target, attacker: actor, incomingAction: action, pool: poolForCounterDeclaration })
      : { declared: null, metrics: emptyResolution() };
  addMetrics(metrics, counterDeclaration.metrics);
  const diceCount = Math.max(0, action.diceCount);
  const roll = skipOwnRoll
    ? null
    : rollDice(diceCount, getActorDie(actor, action), rng, actorAttributeModifier);
  const rollSummary = roll
    ? summarizeRoll({ actor, reason: action.name, attribute: action.accuracyAttribute, roll })
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
  const counterRoll = rollDeclaredCounter(state, target, actor, counterDeclaration.declared, rng);

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
    (action.kind === "attack" || action.kind === "control" || action.kind === "movement") &&
    !counterDeclaration.declared?.forfeitsNormalDefence
  ) {
    const resistMetrics = resolveResist(state, target, action, metrics.rawSuccesses, rng);
    addMetrics(metrics, resistMetrics);
  }

  const activeAppliedSuccesses =
    gateAlreadyResolved && action.usesPrimaryAppliedSuccesses
      ? inheritedPrimaryAppliedSuccesses
      : !gateAlreadyResolved && action.resistAttribute && !counterDeclaration.declared?.forfeitsNormalDefence
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
    const normalDefenceMetrics = gateAlreadyResolved || counterDeclaration.declared?.forfeitsNormalDefence
      ? emptyResolution()
      : resolveBestNormalDefence({
          state,
          target,
          pool,
          incomingSuccesses: activeHostileSuccesses,
          rawWounds,
          rng,
          ongoingPerTick: isPureOngoingDamage,
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
            pool,
            remainingWounds: activeRawWounds - normalDefenceBlocked,
          })
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
    const staticBreakdown = gateAlreadyResolved
      ? []
      : protectionBreakdown(
          state,
          target,
          pool,
          Math.max(0, activeRawWounds - normalDefenceBlocked - counterDefenceMetrics.counterMitigation),
        );
    const prevented = normalDefenceBlocked + counterDefenceMetrics.counterMitigation + staticPrevented;
    const netWounds = isPureOngoingDamage ? 0 : Math.max(0, activeRawWounds - prevented);
    const storedOngoingWounds = isPureOngoingDamage ? Math.max(0, activeRawWounds - prevented) : 0;
    const overkill = isPureOngoingDamage ? 0 : applyWounds(target, pool, netWounds);

    metrics.rawWounds = rawWounds;
    metrics.protectionPrevented = prevented;
    metrics.staticProtectionPrevented = staticPrevented;
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
          message: `Application result: ${target.name}'s declaration defence fully prevents ${action.name}; no ongoing damage status is created. Prevented ${prevented} (${normalDefenceBlocked} defence, ${counterDefenceMetrics.counterMitigation} counter, ${staticPrevented} static/passive).`,
          details: { rawWounds: activeRawWounds, prevented, storedOngoingWounds: 0, pool },
        });
      } else if (action.recurring?.kind === "ongoingDamage") {
        const units = Math.max(1, Math.ceil(storedOngoingWounds / Math.max(1, effectPerSuccess)));
        state.statusEffects.push({
          id: `${state.round}:${actor.id}:${action.id}:${target.id}:ongoing`,
          sourceActorId: actor.id,
          targetActorId: target.id,
          kind: "ongoingDamage",
          amount: storedOngoingWounds,
          pool,
          damageLabel: woundLabel,
          sourceActionId: action.id,
          sourceActionName: action.name,
          remainingRounds: action.recurring.durationRounds,
        });
        metrics.ongoingDamageUnitsApplied += units;
        metrics.stacksApplied += units;
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
            durationRounds: action.recurring.durationRounds,
            pool,
            prevented,
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
        message: `${counterDeclaration.declared ? "Incoming result" : "Attack result"}: ${target.name} suffers ${netWounds} ${pool} wounds from ${action.name}. Prevented ${prevented} (${normalDefenceBlocked} defence, ${counterDefenceMetrics.counterMitigation} counter, ${staticPrevented} static/passive).`,
        details: { rawWounds: activeRawWounds, prevented, netWounds, overkill, pool },
      });
    }
    if (!isPureOngoingDamage && action.recurring?.kind === "ongoingDamage" && netWounds > 0) {
      const units = Math.max(1, Math.ceil(netWounds / Math.max(1, action.potency)));
      state.statusEffects.push({
        id: `${state.round}:${actor.id}:${action.id}:${target.id}:ongoing`,
        sourceActorId: actor.id,
        targetActorId: target.id,
        kind: "ongoingDamage",
        amount: Math.max(1, action.potency) * units,
        pool,
        damageLabel: actionDamageLabel(action, pool),
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
  } else if (action.kind === "defence") {
    const blockPerSuccess = Math.max(1, action.protection ?? action.potency);
    const amount = Math.max(1, activeAppliedSuccesses * blockPerSuccess);
    const durationRounds = Math.max(1, action.durationRounds ?? action.modifier?.durationRounds ?? 1);
    const isPassiveDuration = Boolean(action.passiveDuration);
    state.statusEffects.push({
      id: `${state.round}:${actor.id}:${action.id}:${target.id}`,
      sourceActorId: actor.id,
      targetActorId: target.id,
      kind: "protection",
      pool: action.pool ?? "physical",
      amount,
      sourceActionId: action.id,
      sourceActionName: action.name,
      sourceCooldownActionId: action.cooldownActionId ?? action.id,
      durationKind: action.durationKind,
      durationSource: action.durationSource,
      passiveDuration: isPassiveDuration,
      remainingRounds: durationRounds,
    });
    metrics.mitigationApplied = amount;
    metrics.passiveDefenceContribution = amount;
    emitTranscriptEvent(state, {
      type: "statusCreated",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      targetName: target.name,
      actionId: action.id,
      actionName: action.name,
      lane,
      message: isPassiveDuration
        ? `Passive defence: ${action.name} grants ${target.name} ${activeAppliedSuccesses} x ${blockPerSuccess} = ${amount} passive ${action.pool ?? "physical"} wound blocking until it ends or is removed.`
        : `Defence power: ${action.name} gives ${target.name} ${amount} ${action.pool ?? "physical"} protection for ${durationRounds} turns.`,
      details: { effect: "protection", amount, blockPerSuccess, appliedSuccesses: activeAppliedSuccesses, pool: action.pool ?? "physical", durationRounds, durationSource: action.durationSource, passiveDuration: isPassiveDuration },
    });
    if (isPassiveDuration) {
      emitTranscriptEvent(state, {
        type: "statusCreated",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        targetName: target.name,
        actionId: action.id,
        actionName: action.name,
        lane,
        message: `Status created: ${action.name} remains active until ended or removed.`,
        details: { effect: "protection", durationRounds, durationSource: action.durationSource, passiveDuration: true },
      });
    }
  } else if (action.kind === "control") {
    const controlStacks = Math.max(1, activeAppliedSuccesses * Math.max(1, action.potency));
    const durationRounds = Math.max(1, Math.trunc(action.control?.durationRounds ?? 1));
    state.statusEffects.push({
      id: `${state.round}:${actor.id}:${action.id}:${target.id}:control`,
      sourceActorId: actor.id,
      targetActorId: target.id,
      kind: "mainActionDenied",
      amount: controlStacks,
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
      const cleansed = Math.min(removable.amount, cleanseUnits);
      removable.amount = Math.max(0, removable.amount - cleanseUnits);
      metrics.mitigationApplied = cleansed;
      metrics.ongoingDamagePreventedOrCleansed = removable.kind === "ongoingDamage" ? cleansed : 0;
      metrics.stacksCleansed = cleansed;
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

  if (!params.fromSecondary) {
    for (const secondaryAction of action.secondaryActions ?? []) {
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
