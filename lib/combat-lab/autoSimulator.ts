import { resolveCombatAction, resolveStartOfTurnEffects } from "./actionResolver";
import {
  collectUnsupportedSummary,
  createCombatState,
  createEmptyMetrics,
  decrementRoundEffects,
  getLivingActors,
} from "./combatState";
import { createSeededRng } from "./dice";
import {
  createFixtureActor,
  makeFixturePower,
} from "./powerAdapter";
import { chooseAction, chooseTarget } from "./targetingPolicies";
import type {
  CombatAggregateMetrics,
  CombatRunResult,
  CombatScenario,
  CombatSide,
} from "./types";

function addRoleContribution(metrics: CombatAggregateMetrics, actorRole: string, actionKind: string, values: {
  damage: number;
  healing: number;
  mitigation: number;
  buffDebuff: number;
}) {
  metrics.roleContribution[actorRole] ??= {
    damage: 0,
    healing: 0,
    mitigation: 0,
    buffDebuff: 0,
    actions: { attack: 0, healing: 0, buff: 0, debuff: 0, defence: 0, control: 0, movement: 0, cleanse: 0 },
  };
  const role = metrics.roleContribution[actorRole];
  role.damage += values.damage;
  role.healing += values.healing;
  role.mitigation += values.mitigation;
  role.buffDebuff += values.buffDebuff;
  if (actionKind in role.actions) {
    role.actions[actionKind as keyof typeof role.actions] += 1;
  }
}

function addResolutionToAggregate(
  metrics: CombatAggregateMetrics,
  side: CombatSide,
  resolution: ReturnType<typeof resolveCombatAction>,
) {
  metrics.damageDealt[side] += resolution.netWounds;
  metrics.healingDone[side] += resolution.healingDone;
  metrics.protectionPrevented[side] += resolution.protectionPrevented;
  metrics.woundsAvoidedByDodge[side] += resolution.woundsAvoidedByDodge;
  metrics.resistCancelled[side] += resolution.resistCancelled;
  metrics.overkill[side] += resolution.overkill;
  metrics.wastedActions[side] += resolution.wastedActions;
  metrics.controlTurnsApplied[side] += resolution.controlTurnsApplied;
  metrics.actionsDenied[side] += resolution.actionsDenied;
  metrics.forcedMovementApplied[side] += resolution.forcedMovementApplied;
  metrics.buffApplications[side] += resolution.buffApplications;
  metrics.buffUptime[side] += resolution.buffUptime;
  metrics.buffedActions[side] += resolution.buffedActions;
  metrics.debuffApplications[side] += resolution.debuffApplications;
  metrics.debuffUptime[side] += resolution.debuffUptime;
  metrics.debuffedActions[side] += resolution.debuffedActions;
  metrics.healingOverTimeApplied[side] += resolution.healingOverTimeApplied;
  metrics.ongoingDamageApplied[side] += resolution.ongoingDamageApplied;
  metrics.counterUses[side] += resolution.counterUses;
  metrics.counterDamage[side] += resolution.counterDamage;
  metrics.counterMitigation[side] += resolution.counterMitigation;
  metrics.passiveDefenceContribution[side] += resolution.passiveDefenceContribution;
  metrics.positionalAbstractionsUsed[side] += resolution.positionalAbstractionsUsed;
}

function survivorHealthPercent(stateSide: CombatSide, resultStateActors: ReturnType<typeof getLivingActors>): number {
  const survivors = resultStateActors.filter((actor) => actor.side === stateSide);
  if (survivors.length === 0) return 0;
  const totalCurrent = survivors.reduce(
    (sum, actor) => sum + Math.max(0, actor.physicalHpCurrent) + Math.max(0, actor.mentalHpCurrent),
    0,
  );
  const totalMax = survivors.reduce((sum, actor) => sum + actor.physicalHpMax + actor.mentalHpMax, 0);
  return totalMax > 0 ? totalCurrent / totalMax : 0;
}

function addStatusUptimeMetrics(metrics: CombatAggregateMetrics, state: ReturnType<typeof createCombatState>) {
  for (const effect of state.statusEffects) {
    const target = state.actors.find((actor) => actor.id === effect.targetActorId);
    if (!target) continue;
    if (effect.kind === "buff") metrics.buffUptime[target.side] += 1;
    if (effect.kind === "debuff" || effect.kind === "field") metrics.debuffUptime[target.side] += 1;
  }
}

export function runCombatScenario(scenario: CombatScenario, runIndex = 0): CombatRunResult {
  const rng = createSeededRng(scenario.seed + runIndex * 9973);
  const maxRounds = scenario.maxRounds ?? 20;
  const state = createCombatState(scenario.players, scenario.monsters);
  const metrics = createEmptyMetrics();
  let stoppedBy: CombatRunResult["stoppedBy"] = "maxRounds";
  let roundsWithoutDamage = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    state.round = round;
    const damageAtRoundStart = metrics.damageDealt.players + metrics.damageDealt.monsters;
    metrics.activeEnemiesByRound.push(getLivingActors(state, "monsters").length);

    for (const actor of [...state.actors]) {
      const currentActor = state.actors.find((candidate) => candidate.id === actor.id);
      if (!currentActor || currentActor.defeated) continue;
      const startTurnResolution = resolveStartOfTurnEffects(state, currentActor);
      addResolutionToAggregate(metrics, currentActor.side, startTurnResolution);
      if (startTurnResolution.actionsDenied > 0 || currentActor.defeated) {
        if (startTurnResolution.actionsDenied > 0) {
          state.log.push({
            round: state.round,
            actorId: currentActor.id,
            actorName: currentActor.name,
            actionId: "start-turn",
            actionName: "Start of Turn",
            message: `${currentActor.name}'s main action was denied by a control effect.`,
            metrics: startTurnResolution,
          });
        }
        continue;
      }

      for (let actionCount = 0; actionCount < currentActor.actionsPerTurn; actionCount += 1) {
        const action = chooseAction(currentActor, state);
        const target = action ? chooseTarget(currentActor, action, state) : null;
        const resolution = resolveCombatAction({
          state,
          actor: currentActor,
          action,
          target,
          rng,
        });
        metrics.actionsUsed[currentActor.side] += action ? 1 : 0;
        addResolutionToAggregate(metrics, currentActor.side, resolution);
        addRoleContribution(metrics, currentActor.role, action?.kind ?? "attack", {
          damage: resolution.netWounds,
          healing: resolution.healingDone,
          mitigation: resolution.protectionPrevented + resolution.mitigationApplied,
          buffDebuff: resolution.buffDebuffApplied,
        });

        if (getLivingActors(state, "players").length === 0) {
          stoppedBy = "playersDefeated";
          break;
        }
        if (getLivingActors(state, "monsters").length === 0) {
          stoppedBy = "monstersDefeated";
          break;
        }
      }
      if (stoppedBy !== "maxRounds") break;
    }

    if (stoppedBy !== "maxRounds") break;
    const damageAfterRound = metrics.damageDealt.players + metrics.damageDealt.monsters;
    roundsWithoutDamage = damageAfterRound === damageAtRoundStart ? roundsWithoutDamage + 1 : 0;
    if (roundsWithoutDamage >= 4) {
      stoppedBy = "stalemate";
      break;
    }
    addStatusUptimeMetrics(metrics, state);
    decrementRoundEffects(state);
  }

  const livingPlayers = getLivingActors(state, "players");
  const livingMonsters = getLivingActors(state, "monsters");
  const winner: CombatRunResult["winner"] =
    stoppedBy === "monstersDefeated"
      ? "players"
      : stoppedBy === "playersDefeated"
        ? "monsters"
        : "stalemate";

  return {
    scenarioName: scenario.name,
    winner,
    rounds: state.round,
    stoppedBy,
    survivors: { players: livingPlayers.length, monsters: livingMonsters.length },
    winnerHealthRemainingPercent: winner === "stalemate" ? 0 : survivorHealthPercent(winner, getLivingActors(state)),
    metrics,
    unsupported: collectUnsupportedSummary(state.actors),
    log: state.log,
  };
}

function player(role: "Glass Cannon" | "Bruiser" | "Tank" | "Support", index: number) {
  const shared = { level: 5, side: "players" as const, actionsPerTurn: 1 };
  if (role === "Glass Cannon") {
    return createFixtureActor({
      ...shared,
      id: `player-glass-${index}`,
      name: "Glass Cannon",
      role,
      physicalHp: 22,
      mentalHp: 16,
      physicalProtection: 1,
      mentalProtection: 1,
      dodgeValue: 8,
      attack: 5,
      guard: 2,
      fortitude: 2,
      intellect: 3,
      synergy: 1,
      bravery: 2,
      basicAttack: { diceCount: 4, potency: 3, pool: "physical" },
      powers: [makeFixturePower({ id: "glass-power", name: "Focused Burst", intention: "ATTACK", pool: "physical", diceCount: 5, potency: 3 })],
    });
  }
  if (role === "Tank") {
    return createFixtureActor({
      ...shared,
      id: `player-tank-${index}`,
      name: "Tank",
      role,
      physicalHp: 38,
      mentalHp: 24,
      physicalProtection: 4,
      mentalProtection: 2,
      dodgeValue: 7,
      attack: 2,
      guard: 5,
      fortitude: 5,
      intellect: 2,
      synergy: 2,
      bravery: 4,
      basicAttack: { diceCount: 3, potency: 2 },
      powers: [makeFixturePower({ id: "tank-guard", name: "Guarded Stance", intention: "DEFENCE", pool: "physical", diceCount: 3, potency: 2, applyTo: "ALLIES", durationTurns: 1 })],
    });
  }
  if (role === "Support") {
    return createFixtureActor({
      ...shared,
      id: `player-support-${index}`,
      name: "Support",
      role,
      physicalHp: 24,
      mentalHp: 24,
      physicalProtection: 1,
      mentalProtection: 2,
      dodgeValue: 8,
      attack: 1,
      guard: 2,
      fortitude: 2,
      intellect: 3,
      synergy: 5,
      bravery: 3,
      basicAttack: { diceCount: 2, potency: 1 },
      powers: [
        makeFixturePower({ id: "support-heal", name: "Mend Wounds", intention: "HEALING", pool: "physical", diceCount: 4, potency: 2, applyTo: "ALLIES" }),
        makeFixturePower({ id: "support-buff", name: "Battle Rhythm", intention: "AUGMENT", diceCount: 3, potency: 1, applyTo: "ALLIES", statTarget: "Attack", durationTurns: 2 }),
      ],
    });
  }
  return createFixtureActor({
    ...shared,
    id: `player-bruiser-${index}`,
    name: "Bruiser",
    role,
    physicalHp: 30,
    mentalHp: 20,
    physicalProtection: 2,
    mentalProtection: 2,
    dodgeValue: 8,
    attack: 4,
    guard: 3,
    fortitude: 4,
    intellect: 2,
    synergy: 2,
    bravery: 3,
    basicAttack: { diceCount: 4, potency: 2 },
    powers: [makeFixturePower({ id: "bruiser-debuff", name: "Crushing Feint", intention: "DEBUFF", diceCount: 3, potency: 1, statTarget: "Guard", durationTurns: 1 })],
  });
}

function monster(tier: "MINION" | "SOLDIER" | "ELITE" | "BOSS", index: number) {
  const scale = tier === "BOSS" ? 4 : tier === "ELITE" ? 2.3 : tier === "SOLDIER" ? 1.35 : 0.75;
  return createFixtureActor({
    id: `monster-${tier.toLowerCase()}-${index}`,
    side: "monsters",
    name: `${tier} ${index}`,
    role: tier[0] + tier.slice(1).toLowerCase(),
    tier,
    level: 5,
    physicalHp: Math.round(18 * scale),
    mentalHp: Math.round(12 * scale),
    physicalProtection: tier === "BOSS" ? 4 : tier === "ELITE" ? 3 : tier === "SOLDIER" ? 2 : 1,
    mentalProtection: tier === "BOSS" ? 3 : tier === "ELITE" ? 2 : 1,
    dodgeValue: tier === "MINION" ? 9 : 8,
    attack: tier === "BOSS" ? 6 : tier === "ELITE" ? 5 : tier === "SOLDIER" ? 4 : 3,
    guard: tier === "BOSS" ? 5 : tier === "ELITE" ? 4 : 3,
    fortitude: tier === "BOSS" ? 5 : tier === "ELITE" ? 4 : 3,
    intellect: tier === "BOSS" ? 4 : 3,
    synergy: 2,
    bravery: tier === "BOSS" ? 5 : 3,
    actionsPerTurn: tier === "BOSS" ? 2 : 1,
    basicAttack: { diceCount: tier === "MINION" ? 2 : tier === "SOLDIER" ? 3 : 4, potency: tier === "BOSS" ? 3 : 2 },
    powers: [
      makeFixturePower({ id: `monster-${tier}-power`, name: `${tier} Power Strike`, intention: "ATTACK", diceCount: tier === "BOSS" ? 5 : 3, potency: tier === "MINION" ? 1 : 2 }),
    ],
  });
}

export function buildCombatLabSmokeScenarios(): CombatScenario[] {
  const soloRoles = ["Glass Cannon", "Bruiser", "Tank", "Support"] as const;
  const tiers = ["MINION", "SOLDIER", "ELITE", "BOSS"] as const;
  const scenarios: CombatScenario[] = [];
  let seed = 1000;
  for (const role of soloRoles) {
    for (const tier of tiers) {
      scenarios.push({
        name: `1v1 ${role} vs ${tier.toLowerCase()}`,
        players: [player(role, 1)],
        monsters: [monster(tier, 1)],
        runs: 80,
        seed: seed += 17,
      });
    }
  }
  scenarios.push(
    { name: "4-player party vs 12 minions", players: [player("Glass Cannon", 1), player("Bruiser", 2), player("Tank", 3), player("Support", 4)], monsters: Array.from({ length: 12 }, (_, index) => monster("MINION", index + 1)), runs: 80, seed: 2001 },
    { name: "4-player party vs 7 soldiers", players: [player("Glass Cannon", 1), player("Bruiser", 2), player("Tank", 3), player("Support", 4)], monsters: Array.from({ length: 7 }, (_, index) => monster("SOLDIER", index + 1)), runs: 80, seed: 2002 },
    { name: "4-player party vs 4 elites", players: [player("Glass Cannon", 1), player("Bruiser", 2), player("Tank", 3), player("Support", 4)], monsters: Array.from({ length: 4 }, (_, index) => monster("ELITE", index + 1)), runs: 80, seed: 2003 },
    { name: "4-player party vs 1 boss", players: [player("Glass Cannon", 1), player("Bruiser", 2), player("Tank", 3), player("Support", 4)], monsters: [monster("BOSS", 1)], runs: 80, seed: 2004 },
  );
  return scenarios;
}
