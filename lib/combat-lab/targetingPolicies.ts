import { getLivingActors, getOppositeSide } from "./combatState";
import type { CombatAction, CombatActor, CombatState } from "./types";

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

export function chooseAction(actor: CombatActor, state: CombatState): CombatAction | null {
  const available = actor.actions.filter((action) => {
    if (!action.supported) return false;
    return !state.cooldowns[`${actor.id}:${action.id}`];
  });
  if (available.length === 0) return null;

  const allies = getLivingActors(state, actor.side);
  const enemies = getLivingActors(state, getOppositeSide(actor.side));
  const woundedAlly = allies
    .filter((ally) => hpPercent(ally) < 0.65)
    .sort((a, b) => hpPercent(a) - hpPercent(b))[0];

  if (actor.role === "Support") {
    const heal = available.find((action) => action.kind === "healing");
    if (heal && woundedAlly) return heal;
    const field = available.find((action) => action.kind === "debuff" && action.targetPolicy === "allEnemies");
    if (field && enemies.length >= 2) return field;
    const buff = available.find(
      (action) =>
        action.kind === "buff" &&
        !state.statusEffects.some((effect) => effect.sourceActorId === actor.id && effect.kind === "buff"),
    );
    if (buff && enemies.length > 0) return buff;
    const cleanse = available.find((action) => action.kind === "cleanse");
    if (cleanse && state.statusEffects.some((effect) => effect.sourceActorId !== actor.id && effect.targetActorId !== actor.id)) return cleanse;
    const debuff = available.find((action) => action.kind === "debuff");
    if (debuff && enemies.length > 0) return debuff;
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
    if (defenceAction && allies.some((ally) => hpPercent(ally) < 0.5)) return defenceAction;
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
    return [...candidates].sort((a, b) => defence(a) - defence(b) || hpPercent(a) - hpPercent(b))[0] ?? null;
  }
  return candidates[0] ?? null;
}
