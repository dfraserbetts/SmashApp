import { resolveCombatAction, resolveStartOfTurnEffects } from "./actionResolver";
import {
  collectUnsupportedSummary,
  createCombatState,
  createEmptyMetrics,
  getLivingActors,
  refreshActorResponses,
  resetRoundDefenceDegradation,
  sampleActorCooldownAvailability,
  tickActorCooldowns,
  tickTargetTurnEffects,
} from "./combatState";
import { createSeededRng } from "./dice";
import {
  createFixtureActor,
  makeFixturePower,
} from "./powerAdapter";
import { chooseAction, chooseTarget } from "./targetingPolicies";
import type {
  CombatAggregateMetrics,
  CombatAction,
  CombatActor,
  CombatActorContribution,
  CombatRunResult,
  CombatScenario,
  CombatSide,
  CombatTurnOrder,
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
  options: { defensiveSide?: CombatSide } = {},
) {
  const defensiveSide = options.defensiveSide ?? side;
  metrics.damageDealt[side] += resolution.netWounds;
  metrics.healingDone[side] += resolution.healingDone;
  metrics.protectionPrevented[defensiveSide] += resolution.protectionPrevented;
  metrics.woundsAvoidedByDodge[defensiveSide] += resolution.woundsAvoidedByDodge;
  metrics.dodgeRolls[defensiveSide] += resolution.dodgeRolls;
  metrics.dodgeChosen[defensiveSide] += resolution.dodgeChosen;
  metrics.dodgeDegradationApplied[defensiveSide] += resolution.dodgeDegradationApplied;
  metrics.physicalDefenceRolls[defensiveSide] += resolution.physicalDefenceRolls;
  metrics.physicalDefenceChosen[defensiveSide] += resolution.physicalDefenceChosen;
  metrics.physicalDefenceDegradationApplied[defensiveSide] += resolution.physicalDefenceDegradationApplied;
  metrics.mentalDefenceRolls[defensiveSide] += resolution.mentalDefenceRolls;
  metrics.mentalDefenceChosen[defensiveSide] += resolution.mentalDefenceChosen;
  metrics.mentalDefenceDegradationApplied[defensiveSide] += resolution.mentalDefenceDegradationApplied;
  metrics.defenceChoiceExpectedValue[defensiveSide] += resolution.defenceChoiceExpectedValue;
  metrics.degradedDefenceRolls[defensiveSide] += resolution.degradedDefenceRolls;
  metrics.defenceStringBlocked[defensiveSide] += resolution.defenceStringBlocked;
  metrics.staticProtectionPrevented[defensiveSide] += resolution.staticProtectionPrevented;
  metrics.resistCancelled[defensiveSide] += resolution.resistCancelled;
  metrics.resistRolls[defensiveSide] += resolution.resistRolls;
  metrics.resistSuccesses[defensiveSide] += resolution.resistSuccesses;
  metrics.hostileSuccessesCancelledByResist[defensiveSide] += resolution.hostileSuccessesCancelledByResist;
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
  metrics.healingTicks[side] += resolution.healingTicks;
  metrics.ongoingDamageApplied[side] += resolution.ongoingDamageApplied;
  metrics.ongoingDamageUnitsApplied[side] += resolution.ongoingDamageUnitsApplied;
  metrics.ongoingDamageTicks[side] += resolution.ongoingDamageTicks;
  metrics.ongoingDamagePreventedOrCleansed[side] += resolution.ongoingDamagePreventedOrCleansed;
  metrics.counterUses[defensiveSide] += resolution.counterUses;
  metrics.counterChosen[defensiveSide] += resolution.counterChosen;
  metrics.counterDamage[defensiveSide] += resolution.counterDamage;
  metrics.counterMitigation[defensiveSide] += resolution.counterMitigation;
  metrics.responsesUsed[defensiveSide] += resolution.responsesUsed;
  metrics.responsesWastedOrUnavailable[defensiveSide] += resolution.responsesWastedOrUnavailable;
  metrics.passiveDefenceContribution[defensiveSide] += resolution.passiveDefenceContribution;
  metrics.stacksApplied[side] += resolution.stacksApplied;
  metrics.stacksExpired[side] += resolution.stacksExpired;
  metrics.stacksCleansed[side] += resolution.stacksCleansed;
  metrics.aoeActionUses[side] += resolution.aoeActionUses;
  metrics.aoePotentialTargets[side] += resolution.aoePotentialTargets;
  metrics.aoeActualTargets[side] += resolution.aoeActualTargets;
  metrics.positionalAbstractionsUsed[side] += resolution.positionalAbstractionsUsed;
}

function addActorContribution(
  metrics: CombatAggregateMetrics,
  actor: CombatActor,
  action: CombatAction | null,
  resolution: ReturnType<typeof resolveCombatAction>,
) {
  if (!action) return;
  const actorContribution = metrics.actorContributions[actor.id] ??= {
    actorId: actor.id,
    actorName: actor.name,
    side: actor.side,
    role: actor.role,
    actionsUsed: 0,
    damage: 0,
    healing: 0,
    healingOverTimeApplied: 0,
    healingTicks: 0,
    mitigation: 0,
    counterUses: 0,
    counterDamage: 0,
    counterMitigation: 0,
    buffApplications: 0,
    buffUptime: 0,
    debuffApplications: 0,
    debuffUptime: 0,
    controlTurnsApplied: 0,
    actionsDenied: 0,
    ongoingDamageApplied: 0,
    ongoingDamageTicks: 0,
    topActionName: null,
    actionContributions: [],
  };
  let actionContribution = actorContribution.actionContributions.find((entry) => entry.actionId === action.id);
  if (!actionContribution) {
    actionContribution = {
      actionId: action.id,
      actionName: action.name,
      sourcePowerId: action.sourcePowerId,
      sourceType: action.sourceType,
      kind: action.kind,
      uses: 0,
      damage: 0,
      healing: 0,
      healingOverTimeApplied: 0,
      healingTicks: 0,
      mitigation: 0,
      counterUses: 0,
      counterDamage: 0,
      counterMitigation: 0,
      buffApplications: 0,
      buffUptime: 0,
      debuffApplications: 0,
      debuffUptime: 0,
      controlTurnsApplied: 0,
      actionsDenied: 0,
      ongoingDamageApplied: 0,
      ongoingDamageTicks: 0,
      linkedActionCount: action.secondaryActions?.length ?? 0,
    };
    actorContribution.actionContributions.push(actionContribution);
  }

  const mitigation = resolution.mitigationApplied;
  actorContribution.actionsUsed += 1;
  actorContribution.damage += resolution.netWounds;
  actorContribution.healing += resolution.healingDone;
  actorContribution.healingOverTimeApplied += resolution.healingOverTimeApplied;
  actorContribution.healingTicks += resolution.healingTicks;
  actorContribution.mitigation += mitigation;
  actorContribution.buffApplications += resolution.buffApplications;
  actorContribution.buffUptime += resolution.buffUptime;
  actorContribution.debuffApplications += resolution.debuffApplications;
  actorContribution.debuffUptime += resolution.debuffUptime;
  actorContribution.controlTurnsApplied += resolution.controlTurnsApplied;
  actorContribution.actionsDenied += resolution.actionsDenied;
  actorContribution.ongoingDamageApplied += resolution.ongoingDamageApplied;
  actorContribution.ongoingDamageTicks += resolution.ongoingDamageTicks;

  actionContribution.uses += 1;
  actionContribution.damage += resolution.netWounds;
  actionContribution.healing += resolution.healingDone;
  actionContribution.healingOverTimeApplied += resolution.healingOverTimeApplied;
  actionContribution.healingTicks += resolution.healingTicks;
  actionContribution.mitigation += mitigation;
  actionContribution.buffApplications += resolution.buffApplications;
  actionContribution.buffUptime += resolution.buffUptime;
  actionContribution.debuffApplications += resolution.debuffApplications;
  actionContribution.debuffUptime += resolution.debuffUptime;
  actionContribution.controlTurnsApplied += resolution.controlTurnsApplied;
  actionContribution.actionsDenied += resolution.actionsDenied;
  actionContribution.ongoingDamageApplied += resolution.ongoingDamageApplied;
  actionContribution.ongoingDamageTicks += resolution.ongoingDamageTicks;

  actorContribution.topActionName =
    [...actorContribution.actionContributions].sort((a, b) =>
      (b.damage + b.healing + b.healingOverTimeApplied + b.mitigation + b.buffApplications + b.buffUptime + b.debuffApplications + b.debuffUptime + b.controlTurnsApplied + b.ongoingDamageApplied) -
      (a.damage + a.healing + a.healingOverTimeApplied + a.mitigation + a.buffApplications + a.buffUptime + a.debuffApplications + a.debuffUptime + a.controlTurnsApplied + a.ongoingDamageApplied),
    )[0]?.actionName ?? null;
}

type TimedStatusContribution = {
  sourceActorId: string;
  sourceActionId?: string;
  sourceActionName?: string;
  damage: number;
  healing: number;
  healingTicks: number;
  ongoingDamageApplied: number;
  ongoingDamageTicks: number;
  buffUptime: number;
  debuffUptime: number;
};

function collectStartOfTurnStatusContributions(
  state: ReturnType<typeof createCombatState>,
  target: CombatActor,
): TimedStatusContribution[] {
  const contributions: TimedStatusContribution[] = [];
  let physicalCurrent = target.physicalHpCurrent;
  let mentalCurrent = target.mentalHpCurrent;
  for (const effect of state.statusEffects.filter((entry) => entry.targetActorId === target.id)) {
    if (effect.kind !== "healingOverTime" && effect.kind !== "ongoingDamage") continue;
    let healing = 0;
    let damage = 0;
    if (effect.kind === "healingOverTime") {
      const pool = effect.pool ?? "physical";
      const current = pool === "physical" ? physicalCurrent : mentalCurrent;
      const max = pool === "physical" ? target.physicalHpMax : target.mentalHpMax;
      healing = Math.min(Math.max(0, max - current), Math.max(0, effect.amount));
      if (pool === "physical") {
        physicalCurrent = Math.min(max, physicalCurrent + healing);
      } else {
        mentalCurrent = Math.min(max, mentalCurrent + healing);
      }
    } else {
      damage = Math.max(0, effect.amount);
    }
    contributions.push({
      sourceActorId: effect.sourceActorId,
      sourceActionId: effect.sourceActionId,
      sourceActionName: effect.sourceActionName,
      damage,
      healing,
      healingTicks: effect.kind === "healingOverTime" ? 1 : 0,
      ongoingDamageApplied: damage,
      ongoingDamageTicks: effect.kind === "ongoingDamage" ? 1 : 0,
      buffUptime: 0,
      debuffUptime: 0,
    });
  }
  return contributions;
}

function ensureActorContribution(metrics: CombatAggregateMetrics, actor: CombatActor): CombatActorContribution {
  return metrics.actorContributions[actor.id] ??= {
    actorId: actor.id,
    actorName: actor.name,
    side: actor.side,
    role: actor.role,
    actionsUsed: 0,
    damage: 0,
    healing: 0,
    healingOverTimeApplied: 0,
    healingTicks: 0,
    mitigation: 0,
    counterUses: 0,
    counterDamage: 0,
    counterMitigation: 0,
    buffApplications: 0,
    buffUptime: 0,
    debuffApplications: 0,
    debuffUptime: 0,
    controlTurnsApplied: 0,
    actionsDenied: 0,
    ongoingDamageApplied: 0,
    ongoingDamageTicks: 0,
    topActionName: null,
    actionContributions: [],
  };
}

function findSourceAction(sourceActor: CombatActor, contribution: Pick<TimedStatusContribution, "sourceActionId" | "sourceActionName">) {
  return sourceActor.actions.find((action) =>
    contribution.sourceActionId
      ? action.id === contribution.sourceActionId
      : action.name === contribution.sourceActionName,
  );
}

function addTimedStatusContributions(
  metrics: CombatAggregateMetrics,
  state: ReturnType<typeof createCombatState>,
  contributions: TimedStatusContribution[],
) {
  for (const contribution of contributions) {
    const sourceActor = state.actors.find((actor) => actor.id === contribution.sourceActorId);
    if (!sourceActor) continue;
    const sourceAction = findSourceAction(sourceActor, contribution);
    const actorContribution = ensureActorContribution(metrics, sourceActor);
    actorContribution.damage += contribution.damage;
    actorContribution.healing += contribution.healing;
    actorContribution.healingTicks += contribution.healingTicks;
    actorContribution.ongoingDamageApplied += contribution.ongoingDamageApplied;
    actorContribution.ongoingDamageTicks += contribution.ongoingDamageTicks;
    actorContribution.buffUptime += contribution.buffUptime;
    actorContribution.debuffUptime += contribution.debuffUptime;
    if (!sourceAction) continue;
    let actionContribution = actorContribution.actionContributions.find((entry) => entry.actionId === sourceAction.id);
    if (!actionContribution) {
      actionContribution = {
        actionId: sourceAction.id,
        actionName: sourceAction.name,
        sourcePowerId: sourceAction.sourcePowerId,
        sourceType: sourceAction.sourceType,
        kind: sourceAction.kind,
        uses: 0,
        damage: 0,
        healing: 0,
        healingOverTimeApplied: 0,
        healingTicks: 0,
        mitigation: 0,
        counterUses: 0,
        counterDamage: 0,
        counterMitigation: 0,
        buffApplications: 0,
        buffUptime: 0,
        debuffApplications: 0,
        debuffUptime: 0,
        controlTurnsApplied: 0,
        actionsDenied: 0,
        ongoingDamageApplied: 0,
        ongoingDamageTicks: 0,
        linkedActionCount: sourceAction.secondaryActions?.length ?? 0,
      };
      actorContribution.actionContributions.push(actionContribution);
    }
    actionContribution.damage += contribution.damage;
    actionContribution.healing += contribution.healing;
    actionContribution.healingTicks += contribution.healingTicks;
    actionContribution.ongoingDamageApplied += contribution.ongoingDamageApplied;
    actionContribution.ongoingDamageTicks += contribution.ongoingDamageTicks;
    actionContribution.buffUptime += contribution.buffUptime;
    actionContribution.debuffUptime += contribution.debuffUptime;
    actorContribution.topActionName =
      [...actorContribution.actionContributions].sort((a, b) =>
        (b.damage + b.healing + b.healingOverTimeApplied + b.mitigation + b.buffApplications + b.buffUptime + b.debuffApplications + b.debuffUptime + b.controlTurnsApplied + b.ongoingDamageApplied) -
        (a.damage + a.healing + a.healingOverTimeApplied + a.mitigation + a.buffApplications + a.buffUptime + a.debuffApplications + a.debuffUptime + a.controlTurnsApplied + a.ongoingDamageApplied),
      )[0]?.actionName ?? null;
  }
}

function addDefensiveContribution(
  metrics: CombatAggregateMetrics,
  defender: CombatActor | null,
  resolution: ReturnType<typeof resolveCombatAction>,
) {
  if (!defender) return;
  if (resolution.aoeActualTargets > 1) return;
  const defended =
    resolution.dodgeChosen +
    resolution.physicalDefenceChosen +
    resolution.mentalDefenceChosen +
    resolution.counterChosen +
    resolution.responsesUsed +
    resolution.protectionPrevented;
  if (defended <= 0 && resolution.netWounds <= 0) return;

  const contribution = metrics.defensiveContributions[defender.id] ??= {
    actorId: defender.id,
    actorName: defender.name,
    side: defender.side,
    role: defender.role,
    attacksDefended: 0,
    woundsDodged: 0,
    defenceStringBlocked: 0,
    staticProtectionPrevented: 0,
    counterUses: 0,
    counterDamage: 0,
    counterMitigation: 0,
    responsesUsed: 0,
    netDamageTaken: 0,
  };

  contribution.attacksDefended += defended > 0 ? 1 : 0;
  contribution.woundsDodged += resolution.woundsAvoidedByDodge;
  contribution.defenceStringBlocked += resolution.defenceStringBlocked;
  contribution.staticProtectionPrevented += resolution.staticProtectionPrevented;
  contribution.counterUses += resolution.counterUses;
  contribution.counterDamage += resolution.counterDamage;
  contribution.counterMitigation += resolution.counterMitigation;
  contribution.responsesUsed += resolution.responsesUsed;
  contribution.netDamageTaken += resolution.netWounds;
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
  const sourceContributions: TimedStatusContribution[] = [];
  for (const effect of state.statusEffects) {
    const target = state.actors.find((actor) => actor.id === effect.targetActorId);
    if (!target) continue;
    if (effect.kind === "buff") {
      metrics.buffUptime[target.side] += 1;
      sourceContributions.push({
        sourceActorId: effect.sourceActorId,
        sourceActionId: effect.sourceActionId,
        sourceActionName: effect.sourceActionName,
        damage: 0,
        healing: 0,
        healingTicks: 0,
        ongoingDamageApplied: 0,
        ongoingDamageTicks: 0,
        buffUptime: 1,
        debuffUptime: 0,
      });
    }
    if (effect.kind === "debuff" || effect.kind === "field") {
      metrics.debuffUptime[target.side] += 1;
      sourceContributions.push({
        sourceActorId: effect.sourceActorId,
        sourceActionId: effect.sourceActionId,
        sourceActionName: effect.sourceActionName,
        damage: 0,
        healing: 0,
        healingTicks: 0,
        ongoingDamageApplied: 0,
        ongoingDamageTicks: 0,
        buffUptime: 0,
        debuffUptime: 1,
      });
    }
  }
  addTimedStatusContributions(metrics, state, sourceContributions);
}

function shuffled<T>(items: T[], rng: ReturnType<typeof createSeededRng>): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex] as T, out[index] as T];
  }
  return out;
}

function roundTurnOrder(
  state: ReturnType<typeof createCombatState>,
  rng: ReturnType<typeof createSeededRng>,
  turnOrder: CombatTurnOrder,
  round: number,
) {
  const players = getLivingActors(state, "players");
  const monsters = getLivingActors(state, "monsters");
  const playerOrder = shuffled(players, rng);
  const monsterOrder = shuffled(monsters, rng);
  const playersLead =
    turnOrder === "playersFirst" ||
    (turnOrder === "alternatingByRound" && round % 2 === 1) ||
    (turnOrder === "randomSeeded" && rng() < 0.5);
  if (turnOrder === "monstersFirst" || !playersLead) {
    return [...monsterOrder, ...playerOrder];
  }
  return [...playerOrder, ...monsterOrder];
}

export function runCombatScenario(scenario: CombatScenario, runIndex = 0): CombatRunResult {
  const rng = createSeededRng(scenario.seed + runIndex * 9973);
  const maxRounds = scenario.maxRounds ?? 20;
  const turnOrder = scenario.turnOrder ?? "alternatingByRound";
  const state = createCombatState(scenario.players, scenario.monsters);
  const metrics = createEmptyMetrics();
  let stoppedBy: CombatRunResult["stoppedBy"] = "maxRounds";
  let roundsWithoutDamage = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    state.round = round;
    const damageAtRoundStart = metrics.damageDealt.players + metrics.damageDealt.monsters;
    metrics.activeEnemiesByRound.push(getLivingActors(state, "monsters").length);

    for (const actor of roundTurnOrder(state, rng, turnOrder, round)) {
      const currentActor = state.actors.find((candidate) => candidate.id === actor.id);
      if (!currentActor || currentActor.defeated) continue;
      refreshActorResponses(state, currentActor.id);
      sampleActorCooldownAvailability(state, currentActor);
      const timedStatusContributions = collectStartOfTurnStatusContributions(state, currentActor);
      const startTurnResolution = resolveStartOfTurnEffects(state, currentActor);
      addResolutionToAggregate(metrics, currentActor.side, startTurnResolution);
      addTimedStatusContributions(metrics, state, timedStatusContributions);
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
        tickActorCooldowns(state, currentActor.id);
        const expired = tickTargetTurnEffects(state, currentActor.id);
        if (expired > 0) metrics.stacksExpired[currentActor.side] += expired;
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
        addResolutionToAggregate(metrics, currentActor.side, resolution, { defensiveSide: target?.side });
        addActorContribution(metrics, currentActor, action, resolution);
        addDefensiveContribution(metrics, target, resolution);
        addRoleContribution(metrics, currentActor.role, action?.kind ?? "attack", {
          damage: resolution.netWounds,
          healing: resolution.healingDone,
          mitigation: resolution.mitigationApplied,
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
      tickActorCooldowns(state, currentActor.id);
      const expired = tickTargetTurnEffects(state, currentActor.id);
      if (expired > 0) metrics.stacksExpired[currentActor.side] += expired;
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
    resetRoundDefenceDegradation(state);
  }

  const livingPlayers = getLivingActors(state, "players");
  const livingMonsters = getLivingActors(state, "monsters");
  metrics.cooldownTrace = state.cooldownTrace;
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
