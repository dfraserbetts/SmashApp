import { rollDice, type Rng } from "./dice";
import {
  getAttributeModifier,
  getLivingActors,
  getOppositeSide,
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
    ongoingDamageApplied: 0,
    counterUses: 0,
    counterDamage: 0,
    counterMitigation: 0,
    passiveDefenceContribution: 0,
    positionalAbstractionsUsed: 0,
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

function addMetrics(target: CombatResolutionMetrics, source: Partial<CombatResolutionMetrics>) {
  for (const key of Object.keys(source) as Array<keyof CombatResolutionMetrics>) {
    target[key] += source[key] ?? 0;
  }
}

function resolveTargets(state: CombatState, actor: CombatActor, action: CombatAction, primaryTarget: CombatActor): CombatActor[] {
  if (action.targetPolicy === "allAllies") return getLivingActors(state, actor.side);
  if (action.targetPolicy === "allEnemies") return getLivingActors(state, getOppositeSide(actor.side));
  const candidates = getLivingActors(
    state,
    action.targetPolicy === "enemy" ? getOppositeSide(actor.side) : action.targetPolicy === "ally" ? actor.side : undefined,
  ).filter((candidate) => candidate.id !== primaryTarget.id);
  return [
    primaryTarget,
    ...candidates.slice(0, Math.max(1, action.targetCount ?? 1) - 1),
  ];
}

function resistCancels(target: CombatActor, action: CombatAction, successes: number, rng: Rng): number {
  if (!action.resistAttribute || successes <= 0) return 0;
  const resistDice = Math.max(0, target.resist[action.resistAttribute] ?? 0);
  if (resistDice <= 0) return 0;
  const resistRoll = rollDice(resistDice, "D8", rng);
  return resistRoll.successes >= successes ? successes : 0;
}

function passiveDefenceAmount(target: CombatActor, pool: "physical" | "mental") {
  return target.actions
    .filter((action) => action.passive && action.kind === "defence" && (action.pool ?? pool) === pool)
    .reduce((sum, action) => sum + Math.max(1, action.protection ?? action.potency), 0);
}

function resolveCounterDefences(state: CombatState, target: CombatActor, attacker: CombatActor, pool: "physical" | "mental", rng: Rng) {
  let mitigation = 0;
  const availableCounters = target.actions.filter(
    (action) =>
      action.counterMode &&
      action.kind === "defence" &&
      !state.counterUses[`${state.round}:${target.id}:${action.id}`] &&
      !state.cooldowns[`${target.id}:${action.id}`] &&
      (action.pool ?? pool) === pool,
  );
  for (const action of availableCounters.slice(0, 1)) {
    state.counterUses[`${state.round}:${target.id}:${action.id}`] = 1;
    const roll = rollDice(Math.max(1, action.diceCount), getActorDie(target, action), rng);
    mitigation += Math.max(1, roll.successes * Math.max(1, action.protection ?? action.potency));
    if (action.cooldownRounds > 0) state.cooldowns[`${target.id}:${action.id}`] = action.cooldownRounds;
    state.log.push({
      round: state.round,
      actorId: target.id,
      actorName: target.name,
      actionId: action.id,
      actionName: action.name,
      targetId: attacker.id,
      targetName: attacker.name,
      message: `${target.name} used counter ${action.name}; counter economy simplified to once per round.`,
      metrics: { counterUses: 1, counterMitigation: mitigation },
    });
  }
  return mitigation;
}

function resolveCounterAttacks(state: CombatState, target: CombatActor, attacker: CombatActor, rng: Rng) {
  let damage = 0;
  const action = target.actions.find(
    (candidate) =>
      candidate.counterMode &&
      candidate.kind === "attack" &&
      !state.counterUses[`${state.round}:${target.id}:${candidate.id}`] &&
      !state.cooldowns[`${target.id}:${candidate.id}`],
  );
  if (!action) return { damage, uses: 0 };
  state.counterUses[`${state.round}:${target.id}:${action.id}`] = 1;
  const roll = rollDice(Math.max(1, action.diceCount), getActorDie(target, action), rng);
  const raw = roll.successes * action.potency;
  const pool = action.pool ?? "physical";
  const prevented = Math.min(raw, pool === "physical" ? attacker.physicalProtection : attacker.mentalProtection);
  damage = Math.max(0, raw - prevented);
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
    message: `${target.name} used counter ${action.name}; counter economy simplified to once per round.`,
    metrics: { counterUses: 1, counterDamage: damage, netWounds: damage },
  });
  return { damage, uses: 1 };
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
    } else if (effect.kind === "ongoingDamage") {
      const overkill = applyWounds(actor, effect.pool ?? "physical", effect.amount);
      metrics.netWounds += effect.amount;
      metrics.ongoingDamageApplied += effect.amount;
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
  const diceCount = Math.max(0, action.diceCount + actorAttributeModifier);
  const roll = rollDice(diceCount, getActorDie(actor, action), rng);
  metrics.rawSuccesses = roll.successes;

  if ((action.kind === "attack" || action.kind === "control" || action.kind === "movement") && resistCancels(target, action, roll.successes, rng) > 0) {
    metrics.resistCancelled = roll.successes;
    return metrics;
  }

  if (action.kind === "attack") {
    const pool = action.pool ?? "physical";
    const rawWounds = roll.successes * action.potency;
    const avoidedSuccesses = dodgeSuccesses(target, roll.successes, rng);
    const activeSuccesses = Math.max(0, roll.successes - avoidedSuccesses);
    const activeRawWounds = activeSuccesses * action.potency;
    const passiveDefence = passiveDefenceAmount(target, pool);
    const counterMitigation = resolveCounterDefences(state, target, actor, pool, rng);
    const protection =
      (pool === "physical" ? target.physicalProtection : target.mentalProtection) +
      getProtectionModifier(state, target.id, pool) +
      passiveDefence +
      counterMitigation;
    const prevented = Math.min(activeRawWounds, Math.max(0, protection));
    const netWounds = Math.max(0, activeRawWounds - prevented);
    const overkill = applyWounds(target, pool, netWounds);
    const counterAttack = params.fromSecondary ? { damage: 0, uses: 0 } : resolveCounterAttacks(state, target, actor, rng);

    metrics.rawWounds = rawWounds;
    metrics.dodgeSuccesses = avoidedSuccesses;
    metrics.woundsAvoidedByDodge = avoidedSuccesses * action.potency;
    metrics.protectionPrevented = prevented;
    metrics.passiveDefenceContribution = Math.min(activeRawWounds, passiveDefence);
    metrics.counterMitigation = counterMitigation;
    metrics.counterUses = counterAttack.uses + (counterMitigation > 0 ? 1 : 0);
    metrics.counterDamage = counterAttack.damage;
    metrics.netWounds = netWounds;
    metrics.overkill = overkill;
    if (action.recurring?.kind === "ongoingDamage" && activeSuccesses > 0) {
      state.statusEffects.push({
        id: `${state.round}:${actor.id}:${action.id}:${target.id}:ongoing`,
        sourceActorId: actor.id,
        targetActorId: target.id,
        kind: "ongoingDamage",
        amount: Math.max(1, action.potency),
        pool,
        sourceActionName: action.name,
        remainingRounds: action.recurring.durationRounds,
      });
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
    const removable = state.statusEffects.find(
      (effect) =>
        effect.targetActorId === target.id &&
        effect.sourceActorId !== actor.id &&
        (effect.kind === "ongoingDamage" || effect.kind === "debuff" || effect.kind === "mainActionDenied"),
    );
    if (removable) {
      state.statusEffects = state.statusEffects.filter((effect) => effect.id !== removable.id);
      metrics.mitigationApplied = removable.amount;
    } else {
      metrics.wastedActions = 1;
    }
  }

  if ((action.kind === "control" || action.kind === "movement") && metrics.resistCancelled === 0) {
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
