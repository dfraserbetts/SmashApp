import { getLivingActors, getOppositeSide, isActionOnCooldown } from "./combatState";
import type { CombatAction, CombatActor, CombatPool, CombatState } from "./types";

function hpPercent(actor: CombatActor): number {
  const physical = actor.physicalHpMax > 0 ? actor.physicalHpCurrent / actor.physicalHpMax : 1;
  const mental = actor.mentalHpMax > 0 ? actor.mentalHpCurrent / actor.mentalHpMax : 1;
  return Math.min(physical, mental);
}

function threat(actor: CombatActor): number {
  return actor.attributes.Attack + actor.actions.reduce((sum, action) => sum + action.diceCount * action.potency, 0);
}

function defence(actor: CombatActor): number {
  return actor.dodgeValue + actor.physicalProtection + actor.mentalProtection;
}

function actionAlreadyApplied(actor: CombatActor, action: CombatAction, state: CombatState): boolean {
  return state.statusEffects.some(
    (effect) =>
      effect.sourceActorId === actor.id &&
      effect.sourceActionName === action.name &&
      effect.remainingRounds > 0,
  );
}

function targetHasEquivalentEffect(target: CombatActor, action: CombatAction, state: CombatState): boolean {
  return state.statusEffects.some(
    (effect) =>
      effect.targetActorId === target.id &&
      effect.sourceActionName === action.name &&
      effect.remainingRounds > 0,
  );
}

function hasActiveSelfProtection(actor: CombatActor, action: CombatAction, state: CombatState): boolean {
  return state.statusEffects.some(
    (effect) =>
      effect.targetActorId === actor.id &&
      effect.kind === "protection" &&
      effect.sourceActionName === action.name &&
      effect.remainingRounds > 0,
  );
}

function hasActiveSelfSetup(actor: CombatActor, action: CombatAction, state: CombatState): boolean {
  return state.statusEffects.some(
    (effect) =>
      effect.targetActorId === actor.id &&
      effect.sourceActorId === actor.id &&
      effect.sourceActionName === action.name &&
      effect.remainingRounds > 0,
  );
}

function hasWoundedAlly(actor: CombatActor, state: CombatState): boolean {
  return getLivingActors(state, actor.side).some((ally) => hpPercent(ally) < 0.8);
}

function hasRemovableHostileEffect(actor: CombatActor, state: CombatState): boolean {
  const allyIds = new Set(getLivingActors(state, actor.side).map((ally) => ally.id));
  return state.statusEffects.some(
    (effect) =>
      allyIds.has(effect.targetActorId) &&
      effect.sourceActorId !== actor.id &&
      (effect.kind === "ongoingDamage" || effect.kind === "debuff" || effect.kind === "mainActionDenied"),
  );
}

function collectAttackPools(action: CombatAction, pools: Set<CombatPool>) {
  if (action.kind === "attack") {
    pools.add(action.pool ?? "physical");
  }
  for (const secondary of action.secondaryActions ?? []) {
    collectAttackPools(secondary, pools);
  }
}

function expectedEnemyAttackPools(actor: CombatActor, state: CombatState): Set<CombatPool> {
  const pools = new Set<CombatPool>();
  for (const enemy of getLivingActors(state, getOppositeSide(actor.side))) {
    for (const action of enemy.actions) {
      if (!action.supported || action.passive) continue;
      collectAttackPools(action, pools);
    }
  }
  return pools;
}

function isDefencePowerUseful(actor: CombatActor, action: CombatAction, state: CombatState): boolean {
  if (action.counterMode) return false;
  const protectedPool = action.pool ?? "physical";
  const enemyPools = expectedEnemyAttackPools(actor, state);
  if (!enemyPools.has(protectedPool)) return false;
  if (action.targetPolicy === "self") return !hasActiveSelfProtection(actor, action, state);
  if (action.targetPolicy === "allAllies") return !hasActiveSelfProtection(actor, action, state);
  if (action.targetPolicy === "ally") {
    const allies = getLivingActors(state, actor.side);
    return allies.length > 1 || hpPercent(actor) < 0.98;
  }
  return false;
}

function shouldPrioritizeSelfDefence(actor: CombatActor, action: CombatAction, state: CombatState): boolean {
  if (action.kind !== "defence" || action.targetPolicy !== "self") return false;
  if (hasActiveSelfProtection(actor, action, state)) return false;
  if (state.round <= 1) return true;
  const enemies = getLivingActors(state, getOppositeSide(actor.side));
  const protectedPool = action.pool ?? "physical";
  const highestExpectedBurst = enemies.reduce((max, enemy) => {
    const enemyBurst = enemy.actions
      .filter((candidate) => candidate.kind === "attack" && (candidate.pool ?? "physical") === protectedPool)
      .reduce((sum, candidate) => Math.max(sum, candidate.diceCount * Math.max(1, candidate.potency)), 0);
    return Math.max(max, enemyBurst);
  }, 0);
  return highestExpectedBurst >= Math.max(8, actor.physicalHpMax * 0.15);
}

function actionMitigatesPhysicalThreat(action: CombatAction): boolean {
  if (action.pool && action.pool !== "physical") return false;
  if (action.kind === "defence" && action.protection && action.protection > 0) return true;
  return Boolean(action.secondaryActions?.some(actionMitigatesPhysicalThreat));
}

function actionMitigatesAnyThreat(action: CombatAction): boolean {
  if (action.kind === "defence" && (action.protection ?? 0) > 0) return true;
  if (action.kind === "buff" && action.modifier) return true;
  return Boolean(action.secondaryActions?.some(actionMitigatesAnyThreat));
}

function enemyPhysicalBurstOrCounterThreat(actor: CombatActor, state: CombatState): { present: boolean; reason: string } {
  const enemies = getLivingActors(state, getOppositeSide(actor.side));
  const physicalBurst = enemies.reduce((max, enemy) => {
    const burst = enemy.actions
      .filter((action) => action.kind === "attack" && !action.passive && (action.pool ?? "physical") === "physical")
      .reduce((best, action) => Math.max(best, action.diceCount * Math.max(1, action.potency)), 0);
    return Math.max(max, burst);
  }, 0);
  const counter = enemies
    .flatMap((enemy) => enemy.actions.map((action) => ({ enemy, action })))
    .filter(({ action }) => action.counterMode && action.kind === "attack" && (action.pool ?? "physical") === "physical")
    .sort((left, right) => right.action.diceCount * Math.max(1, right.action.potency) - left.action.diceCount * Math.max(1, left.action.potency))[0];

  if (counter) {
    return {
      present: true,
      reason: `${counter.enemy.name} presents high physical counter threat`,
    };
  }
  if (physicalBurst >= Math.max(8, actor.physicalHpMax * 0.15)) {
    return {
      present: true,
      reason: `enemy physical burst ${physicalBurst} can meaningfully threaten ${actor.name}`,
    };
  }
  return { present: false, reason: "no high physical burst or counter threat detected" };
}

export function isDefensiveSetupPower(actor: CombatActor, action: CombatAction, state: CombatState): boolean {
  if (action.sourceType !== "power" || action.counterMode || action.passive || action.targetPolicy !== "self") return false;
  if (!hasLegalTarget(actor, action, state)) return false;
  if (isActionOnCooldown(state, actor.id, action.id)) return false;
  if (hasActiveSelfSetup(actor, action, state)) return false;
  return actionMitigatesAnyThreat(action);
}

export function defensiveSetupBeforeMainReason(
  actor: CombatActor,
  action: CombatAction,
  state: CombatState,
): string | null {
  if (!isDefensiveSetupPower(actor, action, state)) return null;
  if (!actionMitigatesPhysicalThreat(action)) return null;
  const threat = enemyPhysicalBurstOrCounterThreat(actor, state);
  if (!threat.present) return null;
  if (state.round > 1 && !shouldPrioritizeSelfDefence(actor, action, state)) return null;
  return `${actor.name} uses defensive Power Action before Main Action because ${threat.reason}.`;
}

export function chooseActionLaneOrder(
  actor: CombatActor,
  state: CombatState,
  mainActionDenied: boolean,
): { lanes: Array<"main" | "power">; reason: string | null; setupActionId: string | null } {
  if (mainActionDenied) return { lanes: ["main", "power"], reason: null, setupActionId: null };
  const powerAction = chooseTurnAction(actor, state, "power");
  if (!powerAction) return { lanes: ["main", "power"], reason: null, setupActionId: null };
  const reason = defensiveSetupBeforeMainReason(actor, powerAction, state);
  if (!reason) return { lanes: ["main", "power"], reason: null, setupActionId: null };
  return { lanes: ["power", "main"], reason, setupActionId: powerAction.id };
}

function isSupportLike(actor: CombatActor, actions: CombatAction[]): boolean {
  const role = String(actor.role).toLowerCase();
  if (role.includes("support") || actor.name.toLowerCase().includes("support")) return true;
  return actions.some((action) => action.kind === "healing" || action.kind === "buff" || action.kind === "cleanse");
}

export function chooseAction(actor: CombatActor, state: CombatState): CombatAction | null {
  return chooseTurnAction(actor, state, "main");
}

function readyActions(actor: CombatActor, state: CombatState): CombatAction[] {
  const available = actor.actions.filter((action) => {
    if (!action.supported) return false;
    return !isActionOnCooldown(state, actor.id, action.id);
  });
  return available.filter((action) => !action.counterMode && !action.passive);
}

function hasLegalTarget(actor: CombatActor, action: CombatAction, state: CombatState): boolean {
  if (action.targetPolicy === "self" || action.targetPolicy === "allAllies") return true;
  if (action.targetPolicy === "allEnemies") return getLivingActors(state, getOppositeSide(actor.side)).length > 0;
  const side = action.targetPolicy === "enemy" ? getOppositeSide(actor.side) : actor.side;
  return getLivingActors(state, side).length > 0;
}

function isContextuallyUsefulPower(actor: CombatActor, action: CombatAction, state: CombatState): boolean {
  if (!hasLegalTarget(actor, action, state)) return false;
  const allies = getLivingActors(state, actor.side);
  const enemies = getLivingActors(state, getOppositeSide(actor.side));
  if (action.kind === "healing") return allies.some((ally) => hpPercent(ally) < 0.98);
  if (action.kind === "cleanse") return hasRemovableHostileEffect(actor, state);
  if (action.kind === "buff") {
    if (action.targetPolicy === "ally" && allies.length <= 1) return false;
    return !actionAlreadyApplied(actor, action, state);
  }
  if (action.kind === "debuff") {
    if (enemies.length === 0) return false;
    return enemies.some((enemy) => !targetHasEquivalentEffect(enemy, action, state));
  }
  if (action.kind === "defence") return isDefencePowerUseful(actor, action, state);
  return action.kind === "attack" || action.kind === "control" || action.kind === "movement" || action.kind === "defence";
}

function actionScore(action: CombatAction): number {
  const kindScore: Record<string, number> = {
    debuff: 80,
    control: 75,
    buff: 70,
    healing: 65,
    attack: 60,
    defence: 55,
    cleanse: 50,
    movement: 30,
  };
  return (kindScore[action.kind] ?? 0) + action.diceCount * Math.max(1, action.potency) + (action.targetCount ?? 1);
}

function weaponAttackActions(actions: CombatAction[]): CombatAction[] {
  return actions.filter(
    (action) =>
      action.kind === "attack" &&
      (action.sourceType === "naturalAttack" ||
        action.sourceType === "equippedWeapon" ||
        action.sourceType === "fallback"),
  );
}

export function chooseTurnAction(
  actor: CombatActor,
  state: CombatState,
  lane: "main" | "power",
): CombatAction | null {
  const available = readyActions(actor, state).filter((action) => hasLegalTarget(actor, action, state));
  if (available.length === 0) return null;

  if (lane === "main") {
    const weapon = weaponAttackActions(available).sort((a, b) => actionScore(b) - actionScore(a))[0];
    if (weapon) return weapon;
    const nonPowerAttack = available
      .filter((action) => action.kind === "attack" && action.sourceType !== "power")
      .sort((a, b) => actionScore(b) - actionScore(a))[0];
    if (nonPowerAttack) return nonPowerAttack;
  }

  if (lane === "power") {
    const powerPool = available.filter(
      (action) => action.sourceType === "power" && isContextuallyUsefulPower(actor, action, state),
    );
    const selfDefence = powerPool
      .filter((action) => shouldPrioritizeSelfDefence(actor, action, state))
      .sort((a, b) => actionScore(b) - actionScore(a))[0];
    if (selfDefence) return selfDefence;
    if (isSupportLike(actor, powerPool)) {
      const allies = getLivingActors(state, actor.side);
      const woundedAlly = allies
        .filter((ally) => hpPercent(ally) < 0.8)
        .sort((a, b) => hpPercent(a) - hpPercent(b))[0];
      const heal = powerPool.find((action) => action.kind === "healing");
      if (heal && woundedAlly) return heal;
      const buff = powerPool.find(
        (action) =>
          action.kind === "buff" &&
          allies.length > 1 &&
          !actionAlreadyApplied(actor, action, state),
      );
      if (buff) return buff;
      const field = powerPool.find((action) => action.kind === "debuff" && action.targetPolicy === "allEnemies");
      if (field) return field;
      const debuff = powerPool.find((action) => action.kind === "debuff");
      if (debuff) return debuff;
    }
    const usefulPowers = powerPool.sort((a, b) => actionScore(b) - actionScore(a));
    if (usefulPowers[0]) return usefulPowers[0];
    const secondWeapon = weaponAttackActions(available).sort((a, b) => actionScore(b) - actionScore(a))[0];
    return secondWeapon ?? null;
  }

  const allies = getLivingActors(state, actor.side);
  const enemies = getLivingActors(state, getOppositeSide(actor.side));
  const woundedAlly = allies
    .filter((ally) => hpPercent(ally) < 0.8)
    .sort((a, b) => hpPercent(a) - hpPercent(b))[0];

  if (isSupportLike(actor, available)) {
    const heal = available.find((action) => action.kind === "healing");
    if (heal && woundedAlly) return heal;
    const buff = available.find(
      (action) =>
        action.kind === "buff" &&
        allies.length > 1 &&
        !actionAlreadyApplied(actor, action, state),
    );
    if (buff && enemies.length > 0) return buff;
    const field = available.find((action) => action.kind === "debuff" && action.targetPolicy === "allEnemies");
    if (field && enemies.length >= 2 && !actionAlreadyApplied(actor, field, state)) return field;
    const debuff = available.find((action) => action.kind === "debuff" && !actionAlreadyApplied(actor, action, state));
    if (debuff && enemies.length > 0) return debuff;
    const cleanse = available.find((action) => action.kind === "cleanse");
    if (cleanse && state.statusEffects.some((effect) => effect.sourceActorId !== actor.id && effect.targetActorId !== actor.id)) return cleanse;
  }

  if (actor.role === "Bruiser") {
    const hasLongFight = enemies.length > 1 || enemies.some((enemy) => hpPercent(enemy) > 0.6);
    const buff = available.find((action) => action.kind === "buff" && action.targetPolicy === "self");
    if (buff && hasLongFight && !state.statusEffects.some((effect) => effect.sourceActorId === actor.id && effect.kind === "buff")) {
      return buff;
    }
  }

  if (actor.role === "Tank") {
    const defenceAction = available.find((action) => action.kind === "defence" || action.kind === "buff");
    if (defenceAction && hasWoundedAlly(actor, state)) return defenceAction;
  }

  return available.find((action) => action.kind === "attack") ?? available[0] ?? null;
}

export function chooseTarget(actor: CombatActor, action: CombatAction, state: CombatState): CombatActor | null {
  if (action.targetPolicy === "self") return actor;
  if (action.targetPolicy === "allAllies") return actor;
  if (action.targetPolicy === "allEnemies") {
    return getLivingActors(state, getOppositeSide(actor.side))[0] ?? null;
  }
  const candidates = getLivingActors(
    state,
    action.targetPolicy === "enemy" ? getOppositeSide(actor.side) : actor.side,
  );
  if (candidates.length === 0) return null;

  if (action.kind === "healing") {
    return [...candidates].sort((a, b) => hpPercent(a) - hpPercent(b))[0] ?? null;
  }
  if (action.kind === "cleanse") {
    return [...candidates].find((candidate) =>
      state.statusEffects.some((effect) => effect.targetActorId === candidate.id && effect.sourceActorId !== actor.id),
    ) ?? null;
  }
  if (action.kind === "debuff") {
    const withFreshTargets = candidates.filter((candidate) => !targetHasEquivalentEffect(candidate, action, state));
    const pool = withFreshTargets.length > 0 ? withFreshTargets : candidates;
    return [...pool].sort((a, b) =>
      (state.incomingActionsByTargetThisRound[a.id] ?? 0) - (state.incomingActionsByTargetThisRound[b.id] ?? 0) ||
      hpPercent(a) - hpPercent(b),
    )[0] ?? null;
  }
  if (action.kind === "buff" || action.kind === "defence") {
    return [...candidates].sort((a, b) => threat(b) - threat(a))[0] ?? null;
  }
  if (actor.role === "Glass Cannon" || actor.role === "Elite" || actor.role === "Boss") {
    return [...candidates].sort((a, b) => threat(b) - threat(a) || hpPercent(a) - hpPercent(b))[0] ?? null;
  }
  if (actor.role === "Bruiser" || actor.role === "Soldier") {
    return [...candidates].sort((a, b) => hpPercent(a) - hpPercent(b) || threat(b) - threat(a))[0] ?? null;
  }
  if (actor.role === "Tank" || actor.role === "Minion") {
    return [...candidates].sort((a, b) =>
      (state.incomingActionsByTargetThisRound[a.id] ?? 0) - (state.incomingActionsByTargetThisRound[b.id] ?? 0) ||
      hpPercent(a) - hpPercent(b) ||
      defence(a) - defence(b),
    )[0] ?? null;
  }
  return candidates[0] ?? null;
}
