import { rollDice, type Rng } from "./dice";
import {
  getAttributeModifier,
  getLivingActors,
  getOppositeSide,
  getProtectionModifier,
  markDefeatedActors,
  spendActorResponse,
} from "./combatState";
import type {
  CombatAction,
  CombatActor,
  CombatAttributeName,
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
    dodgeDegradationApplied: 0,
    woundsAvoidedByDodge: 0,
    physicalDefenceRolls: 0,
    physicalDefenceDegradationApplied: 0,
    mentalDefenceRolls: 0,
    mentalDefenceDegradationApplied: 0,
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
    debuffApplications: 0,
    debuffUptime: 0,
    debuffedActions: 0,
    healingOverTimeApplied: 0,
    healingTicks: 0,
    ongoingDamageApplied: 0,
    ongoingDamageUnitsApplied: 0,
    ongoingDamageTicks: 0,
    ongoingDamagePreventedOrCleansed: 0,
    counterUses: 0,
    counterDamage: 0,
    counterMitigation: 0,
    responsesUsed: 0,
    responsesWastedOrUnavailable: 0,
    passiveDefenceContribution: 0,
    stacksApplied: 0,
    stacksExpired: 0,
    stacksCleansed: 0,
    aoePotentialTargets: 0,
    aoeActualTargets: 0,
    positionalAbstractionsUsed: 0,
  };
}

function getActorDie(actor: CombatActor, action: CombatAction) {
  return actor.attributeDice[action.accuracyAttribute] ?? "D8";
}

function takeDefenceDegradation(state: CombatState, actorId: string, type: "dodge" | "physical" | "mental") {
  state.defenceDegradation[actorId] ??= { dodge: 0, physical: 0, mental: 0 };
  const previousRolls = state.defenceDegradation[actorId][type];
  state.defenceDegradation[actorId][type] += 1;
  return previousRolls;
}

function rollAttributeDice(params: {
  state: CombatState;
  actor: CombatActor;
  attribute: keyof CombatActor["attributeDice"];
  diceCount: number;
  rng: Rng;
}) {
  const modifier = getAttributeModifier(params.state, params.actor.id, String(params.attribute));
  return rollDice(params.diceCount, params.actor.attributeDice[params.attribute] ?? "D8", params.rng, modifier);
}

function resolveDodge(state: CombatState, target: CombatActor, incomingSuccesses: number, rng: Rng): CombatResolutionMetrics {
  const metrics = emptyResolution();
  if (incomingSuccesses <= 0) return metrics;
  const degradation = takeDefenceDegradation(state, target.id, "dodge");
  const baseDice = Math.max(1, Math.trunc(target.dodgeDice ?? target.dodgeValue ?? 1));
  const diceCount = Math.max(1, baseDice - degradation);
  const roll = rollAttributeDice({ state, actor: target, attribute: "Guard", diceCount, rng });
  metrics.dodgeRolls = 1;
  metrics.dodgeDegradationApplied = degradation;
  metrics.degradedDefenceRolls = degradation > 0 ? 1 : 0;
  metrics.dodgeSuccesses = roll.successes;
  if (roll.successes >= incomingSuccesses) {
    metrics.woundsAvoidedByDodge = incomingSuccesses;
  }
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
  const blocked = Math.min(wounds, roll.successes * blockPerSuccess);
  metrics.defenceStringBlocked = blocked;
  metrics.protectionPrevented = blocked;
  if (pool === "physical") {
    metrics.physicalDefenceRolls = 1;
    metrics.physicalDefenceDegradationApplied = degradation;
  } else {
    metrics.mentalDefenceRolls = 1;
    metrics.mentalDefenceDegradationApplied = degradation;
  }
  metrics.degradedDefenceRolls = degradation > 0 ? 1 : 0;
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
  const cancelled = Math.min(successes, resistRoll.successes);
  metrics.resistRolls = 1;
  metrics.resistSuccesses = resistRoll.successes;
  metrics.resistCancelled = cancelled;
  metrics.hostileSuccessesCancelledByResist = cancelled;
  metrics.hostileSuccessesAfterResist = Math.max(0, successes - cancelled);
  return metrics;
}

function passiveDefenceAmount(target: CombatActor, pool: "physical" | "mental") {
  return target.actions
    .filter((action) => action.passive && action.kind === "defence" && (action.pool ?? pool) === pool)
    .reduce((sum, action) => sum + Math.max(1, action.protection ?? action.potency), 0);
}

function resolveCounterDefences(state: CombatState, target: CombatActor, attacker: CombatActor, pool: "physical" | "mental", rng: Rng) {
  const metrics = emptyResolution();
  const availableCounters = target.actions.filter(
    (action) =>
      action.counterMode &&
      action.kind === "defence" &&
      !state.counterUses[`${state.round}:${target.id}:${action.id}`] &&
      !state.cooldowns[`${target.id}:${action.id}`] &&
      (action.pool ?? pool) === pool,
  );
  for (const action of availableCounters.slice(0, 1)) {
    if (!spendActorResponse(state, target.id)) {
      metrics.responsesWastedOrUnavailable = 1;
      return metrics;
    }
    state.counterUses[`${state.round}:${target.id}:${action.id}`] = 1;
    const roll = rollDice(
      Math.max(1, action.diceCount),
      getActorDie(target, action),
      rng,
      getAttributeModifier(state, target.id, action.accuracyAttribute),
    );
    metrics.counterMitigation += Math.max(1, roll.successes * Math.max(1, action.protection ?? action.potency));
    metrics.counterUses += 1;
    metrics.responsesUsed += 1;
    if (action.cooldownRounds > 0) state.cooldowns[`${target.id}:${action.id}`] = action.cooldownRounds;
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
  const action = target.actions.find(
    (candidate) =>
      candidate.counterMode &&
      candidate.kind === "attack" &&
      !state.counterUses[`${state.round}:${target.id}:${candidate.id}`] &&
      !state.cooldowns[`${target.id}:${candidate.id}`],
  );
  if (!action) return metrics;
  if (!spendActorResponse(state, target.id)) {
    metrics.responsesWastedOrUnavailable = 1;
    return metrics;
  }
  state.counterUses[`${state.round}:${target.id}:${action.id}`] = 1;
  const roll = rollDice(
    Math.max(1, action.diceCount),
    getActorDie(target, action),
    rng,
    getAttributeModifier(state, target.id, action.accuracyAttribute),
  );
  const raw = roll.successes * action.potency;
  const pool = action.pool ?? "physical";
  const prevented = Math.min(raw, pool === "physical" ? attacker.physicalProtection : attacker.mentalProtection);
  const damage = Math.max(0, raw - prevented);
  metrics.counterDamage = damage;
  metrics.counterUses = 1;
  metrics.responsesUsed = 1;
  applyWounds(attacker, pool, damage);
  if (action.cooldownRounds > 0) state.cooldowns[`${target.id}:${action.id}`] = action.cooldownRounds;
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
  for (const effect of state.statusEffects.filter((entry) => entry.targetActorId === actor.id)) {
    if (effect.kind === "mainActionDenied") {
      metrics.actionsDenied += effect.amount;
    } else if (effect.kind === "healingOverTime") {
      const healed = healWounds(actor, effect.pool ?? "physical", effect.amount);
      metrics.healingDone += healed;
      metrics.healingOverTimeApplied += healed;
      metrics.healingTicks += 1;
    } else if (effect.kind === "ongoingDamage") {
      const overkill = applyWounds(actor, effect.pool ?? "physical", effect.amount);
      metrics.netWounds += effect.amount;
      metrics.ongoingDamageApplied += effect.amount;
      metrics.ongoingDamageTicks += 1;
      metrics.overkill += overkill;
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
  fromSecondary?: boolean;
}): CombatResolutionMetrics {
  const { state, actor, action, target, rng } = params;
  const metrics = emptyResolution();
  const actorAttributeModifier = getAttributeModifier(state, actor.id, action.accuracyAttribute);
  if (actorAttributeModifier > 0) metrics.buffedActions = 1;
  if (actorAttributeModifier < 0) metrics.debuffedActions = 1;
  const diceCount = Math.max(0, action.diceCount);
  const roll = rollDice(diceCount, getActorDie(actor, action), rng, actorAttributeModifier);
  metrics.rawSuccesses = roll.successes;

  if (action.kind === "attack" || action.kind === "control" || action.kind === "movement") {
    const resistMetrics = resolveResist(state, target, action, roll.successes, rng);
    addMetrics(metrics, resistMetrics);
    if (action.resistAttribute && resistMetrics.hostileSuccessesAfterResist <= 0) {
      return metrics;
    }
  }

  if (action.kind === "attack") {
    const pool = action.pool ?? "physical";
    const activeHostileSuccesses = action.resistAttribute ? metrics.hostileSuccessesAfterResist : roll.successes;
    const rawWounds = activeHostileSuccesses * action.potency;
    const dodgeMetrics = resolveDodge(state, target, activeHostileSuccesses, rng);
    addMetrics(metrics, dodgeMetrics);
    if (dodgeMetrics.woundsAvoidedByDodge > 0) {
      metrics.rawWounds = rawWounds;
      metrics.woundsAvoidedByDodge = rawWounds;
      return metrics;
    }
    const activeSuccesses = activeHostileSuccesses;
    const activeRawWounds = activeSuccesses * action.potency;
    const passiveDefence = passiveDefenceAmount(target, pool);
    const counterDefenceMetrics = resolveCounterDefences(state, target, actor, pool, rng);
    addMetrics(metrics, counterDefenceMetrics);
    const defenceStringMetrics = resolveDefenceString(state, target, pool, activeRawWounds, rng);
    addMetrics(metrics, defenceStringMetrics);
    const protection =
      (pool === "physical" ? target.physicalProtection : target.mentalProtection) +
      getProtectionModifier(state, target.id, pool) +
      passiveDefence;
    const staticPrevented = Math.min(
      Math.max(0, activeRawWounds - defenceStringMetrics.defenceStringBlocked - counterDefenceMetrics.counterMitigation),
      Math.max(0, protection),
    );
    const prevented = defenceStringMetrics.defenceStringBlocked + counterDefenceMetrics.counterMitigation + staticPrevented;
    const netWounds = Math.max(0, activeRawWounds - prevented);
    const overkill = applyWounds(target, pool, netWounds);
    const counterAttackMetrics = params.fromSecondary ? emptyResolution() : resolveCounterAttacks(state, target, actor, rng);
    addMetrics(metrics, counterAttackMetrics);

    metrics.rawWounds = rawWounds;
    metrics.protectionPrevented = prevented;
    metrics.staticProtectionPrevented = staticPrevented;
    metrics.passiveDefenceContribution = Math.min(activeRawWounds, passiveDefence);
    metrics.netWounds = netWounds;
    metrics.overkill = overkill;
    if (action.recurring?.kind === "ongoingDamage" && netWounds > 0) {
      const units = Math.max(1, Math.ceil(netWounds / Math.max(1, action.potency)));
      state.statusEffects.push({
        id: `${state.round}:${actor.id}:${action.id}:${target.id}:ongoing`,
        sourceActorId: actor.id,
        targetActorId: target.id,
        kind: "ongoingDamage",
        amount: Math.max(1, action.potency) * units,
        pool,
        sourceActionName: action.name,
        remainingRounds: action.recurring.durationRounds,
      });
      metrics.ongoingDamageUnitsApplied += units;
      metrics.stacksApplied += units;
    }
  } else if (action.kind === "healing") {
    if (action.recurring?.kind === "healingOverTime") {
      state.statusEffects.push({
        id: `${state.round}:${actor.id}:${action.id}:${target.id}:hot`,
        sourceActorId: actor.id,
        targetActorId: target.id,
        kind: "healingOverTime",
        amount: Math.max(1, roll.successes * action.potency),
        pool: action.pool ?? "physical",
        sourceActionName: action.name,
        remainingRounds: action.recurring.durationRounds,
      });
      metrics.healingOverTimeApplied = 1;
    } else {
      const healing = roll.successes * action.potency;
      metrics.healingDone = healWounds(target, action.pool ?? "physical", healing);
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
  } else if (action.kind === "control") {
    state.statusEffects.push({
      id: `${state.round}:${actor.id}:${action.id}:${target.id}:control`,
      sourceActorId: actor.id,
      targetActorId: target.id,
      kind: "mainActionDenied",
      amount: 1,
      sourceActionName: action.name,
      remainingRounds: 1,
    });
    metrics.controlTurnsApplied = 1;
  } else if (action.kind === "movement") {
    metrics.forcedMovementApplied = 1;
    metrics.positionalAbstractionsUsed = 1;
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
    } else {
      metrics.wastedActions = 1;
    }
  }

  if (
    (action.kind === "control" || action.kind === "movement") &&
    (!action.resistAttribute || metrics.hostileSuccessesAfterResist > 0)
  ) {
    for (const secondaryAction of action.secondaryActions ?? []) {
      addMetrics(metrics, resolveSingleTargetAction({
        state,
        actor,
        action: secondaryAction,
        target,
        rng,
        fromSecondary: true,
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
}): CombatResolutionMetrics {
  const { state, actor, action, target, rng } = params;
  const metrics = emptyResolution();
  if (!action || !target || actor.defeated) {
    metrics.wastedActions = 1;
    return metrics;
  }

  const targets = resolveTargets(state, actor, action, target);
  if (actionUsesAoeAbstraction(action)) {
    metrics.aoePotentialTargets += aoePotentialTargetCount(action);
    metrics.aoeActualTargets += targets.length;
    metrics.positionalAbstractionsUsed += 1;
  }
  for (const resolvedTarget of targets) {
    addMetrics(metrics, resolveSingleTargetAction({ state, actor, action, target: resolvedTarget, rng }));
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
    targetName: targets.map((entry) => entry.name).join(", "),
    message: `${actor.name} used ${action.name} on ${targets.map((entry) => entry.name).join(", ")}${defeated.some((id) => targets.some((entry) => entry.id === id)) ? " and defeated a target" : ""}.`,
    metrics,
  });

  return metrics;
}
