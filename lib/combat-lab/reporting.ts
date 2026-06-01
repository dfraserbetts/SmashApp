import { runCombatScenario } from "./autoSimulator";
import type {
  CombatActorContribution,
  CombatAggregateMetrics,
  CombatRunResult,
  CombatScenario,
  CombatHydrationIntegrity,
  CombatSide,
  CombatSuiteReport,
  UnsupportedPowerSummary,
} from "./types";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index] ?? 0;
}

function avg(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sumBySide(runs: CombatRunResult[], selector: (metrics: CombatAggregateMetrics) => Record<CombatSide, number>) {
  return runs.reduce(
    (totals, run) => ({
      players: totals.players + selector(run.metrics).players,
      monsters: totals.monsters + selector(run.metrics).monsters,
    }),
    { players: 0, monsters: 0 },
  );
}

function averageSideTotals(runs: CombatRunResult[], selector: (metrics: CombatAggregateMetrics) => Record<CombatSide, number>) {
  const totals = sumBySide(runs, selector);
  return {
    players: totals.players / Math.max(1, runs.length),
    monsters: totals.monsters / Math.max(1, runs.length),
  };
}

function mergeUnsupported(runs: CombatRunResult[]): UnsupportedPowerSummary {
  const reasons = runs.flatMap((run) => run.unsupported.reasons);
  const reasonKeys = new Set<string>();
  const uniqueReasons = reasons.filter((reason) => {
    const key = `${reason.powerName}:${reason.reason}:${reason.packetIndex ?? ""}`;
    if (reasonKeys.has(key)) return false;
    reasonKeys.add(key);
    return true;
  });
  const names = Array.from(new Set(uniqueReasons.map((reason) => reason.powerName)));
  return {
    unsupportedPowerCount: names.length,
    unsupportedPowerNames: names,
    unsupportedEffectCount: uniqueReasons.length,
    reasons: uniqueReasons,
  };
}

export function collectHydrationIntegrity(scenario: Pick<CombatScenario, "players" | "monsters">): CombatHydrationIntegrity {
  const actors = [...scenario.players, ...scenario.monsters];
  const actorReports = actors.map((actor) => ({
    id: actor.id,
    name: actor.name,
    source: actor.hydration.source,
    actionCount: actor.actions.length,
    actions: actor.actions.map((action) => ({
      id: action.id,
      name: action.name,
      sourceType: action.sourceType,
      supported: action.supported,
      unsupportedReasons: action.unsupportedReasons,
      targetCount: action.targetCount,
      rangeCategory: action.rangeCategory,
    })),
    fallbackActions: actor.hydration.fallbackActions,
    unsupportedPowers: actor.unsupportedPowers,
    unsupportedEquipment: actor.hydration.unsupportedEquipment,
    unsupportedTraits: actor.hydration.unsupportedTraits,
    ignoredTraits: actor.hydration.ignoredTraits ?? [],
    unsupportedCombatTraits: actor.hydration.unsupportedCombatTraits ?? [],
    warnings: actor.hydration.warnings,
  }));
  return {
    realCharacterCount: scenario.players.filter((actor) => actor.hydration.source === "campaignCharacter").length,
    realMonsterCount: scenario.monsters.filter((actor) => actor.hydration.source === "campaignMonster").length,
    fallbackActionCount: actors.reduce(
      (sum, actor) => sum + actor.actions.filter((action) => action.sourceType === "fallback").length,
      0,
    ),
    unsupportedActionCount: actors.reduce(
      (sum, actor) => sum + actor.actions.filter((action) => !action.supported).length,
      0,
    ),
    unsupportedPowerCount: Array.from(
      new Set(actors.flatMap((actor) => actor.unsupportedPowers.map((power) => power.powerName))),
    ).length,
    unsupportedEquipmentCount: actors.reduce(
      (sum, actor) => sum + actor.hydration.unsupportedEquipment.length,
      0,
    ),
    unsupportedTraitCount: actors.reduce(
      (sum, actor) => sum + actor.hydration.unsupportedTraits.length,
      0,
    ),
    ignoredTraitCount: actors.reduce(
      (sum, actor) => sum + (actor.hydration.ignoredTraits?.length ?? 0),
      0,
    ),
    unsupportedCombatTraitCount: actors.reduce(
      (sum, actor) => sum + (actor.hydration.unsupportedCombatTraits?.length ?? 0),
      0,
    ),
    hydrationWarnings: Array.from(new Set(actors.flatMap((actor) => actor.hydration.warnings))),
    actors: actorReports,
  };
}

function mergeActorContributions(runs: CombatRunResult[]): CombatActorContribution[] {
  const merged = new Map<string, CombatActorContribution>();
  const divisor = Math.max(1, runs.length);
  for (const run of runs) {
    for (const contribution of Object.values(run.metrics.actorContributions)) {
      const actor = merged.get(contribution.actorId) ?? {
        ...contribution,
        actionsUsed: 0,
        damage: 0,
        healing: 0,
        mitigation: 0,
        counterUses: 0,
        counterDamage: 0,
        counterMitigation: 0,
        buffApplications: 0,
        debuffApplications: 0,
        controlTurnsApplied: 0,
        actionsDenied: 0,
        ongoingDamageApplied: 0,
        topActionName: null,
        actionContributions: [],
      };
      actor.actionsUsed += contribution.actionsUsed / divisor;
      actor.damage += contribution.damage / divisor;
      actor.healing += contribution.healing / divisor;
      actor.mitigation += contribution.mitigation / divisor;
      actor.counterUses += contribution.counterUses / divisor;
      actor.counterDamage += contribution.counterDamage / divisor;
      actor.counterMitigation += contribution.counterMitigation / divisor;
      actor.buffApplications += contribution.buffApplications / divisor;
      actor.debuffApplications += contribution.debuffApplications / divisor;
      actor.controlTurnsApplied += contribution.controlTurnsApplied / divisor;
      actor.actionsDenied += contribution.actionsDenied / divisor;
      actor.ongoingDamageApplied += contribution.ongoingDamageApplied / divisor;

      for (const actionContribution of contribution.actionContributions) {
        let action = actor.actionContributions.find((entry) => entry.actionId === actionContribution.actionId);
        if (!action) {
          action = { ...actionContribution, uses: 0, damage: 0, healing: 0, mitigation: 0, counterUses: 0, counterDamage: 0, counterMitigation: 0, buffApplications: 0, debuffApplications: 0, controlTurnsApplied: 0, actionsDenied: 0, ongoingDamageApplied: 0 };
          actor.actionContributions.push(action);
        }
        action.uses += actionContribution.uses / divisor;
        action.damage += actionContribution.damage / divisor;
        action.healing += actionContribution.healing / divisor;
        action.mitigation += actionContribution.mitigation / divisor;
        action.counterUses += actionContribution.counterUses / divisor;
        action.counterDamage += actionContribution.counterDamage / divisor;
        action.counterMitigation += actionContribution.counterMitigation / divisor;
        action.buffApplications += actionContribution.buffApplications / divisor;
        action.debuffApplications += actionContribution.debuffApplications / divisor;
        action.controlTurnsApplied += actionContribution.controlTurnsApplied / divisor;
        action.actionsDenied += actionContribution.actionsDenied / divisor;
        action.ongoingDamageApplied += actionContribution.ongoingDamageApplied / divisor;
      }

      actor.actionContributions.sort((a, b) =>
        (b.damage + b.healing + b.mitigation + b.buffApplications + b.debuffApplications + b.controlTurnsApplied) -
        (a.damage + a.healing + a.mitigation + a.buffApplications + a.debuffApplications + a.controlTurnsApplied),
      );
      actor.topActionName = actor.actionContributions[0]?.actionName ?? null;
      merged.set(contribution.actorId, actor);
    }
  }
  return [...merged.values()].sort((a, b) =>
    a.side.localeCompare(b.side) ||
    (b.damage + b.healing + b.mitigation + b.buffApplications + b.debuffApplications + b.controlTurnsApplied) -
      (a.damage + a.healing + a.mitigation + a.buffApplications + a.debuffApplications + a.controlTurnsApplied),
  );
}

function mergeRoleContribution(runs: CombatRunResult[]): CombatAggregateMetrics["roleContribution"] {
  const out: CombatAggregateMetrics["roleContribution"] = {};
  for (const run of runs) {
    for (const [role, contribution] of Object.entries(run.metrics.roleContribution)) {
      out[role] ??= {
        damage: 0,
        healing: 0,
        mitigation: 0,
        buffDebuff: 0,
        actions: { attack: 0, healing: 0, buff: 0, debuff: 0, defence: 0, control: 0, movement: 0, cleanse: 0 },
      };
      out[role].damage += contribution.damage / Math.max(1, runs.length);
      out[role].healing += contribution.healing / Math.max(1, runs.length);
      out[role].mitigation += contribution.mitigation / Math.max(1, runs.length);
      out[role].buffDebuff += contribution.buffDebuff / Math.max(1, runs.length);
      for (const kind of Object.keys(out[role].actions) as Array<keyof typeof out[typeof role]["actions"]>) {
        out[role].actions[kind] += contribution.actions[kind] / Math.max(1, runs.length);
      }
    }
  }
  return out;
}

function verdict(report: Omit<CombatSuiteReport, "verdict">): string {
  if (report.unsupported.unsupportedPowerCount > 0) return "unsupported powers make verdict incomplete";
  if (report.stalemateRate > 0.25) return "likely stalemate";
  if (report.scenarioName.includes("Support") && report.playerWinRate < 0.4) {
    return "support solo weakness expected";
  }
  if (report.playerWinRate > 0.8) return "player too lethal";
  if (report.monsterWinRate > 0.8) return "monsters too lethal";
  if (report.p90Rounds - report.p10Rounds >= 8) return "too swingy";
  return "expected";
}

export function runScenarioSuite(scenario: CombatScenario): CombatSuiteReport {
  const runs = Array.from({ length: scenario.runs }, (_, index) => runCombatScenario(scenario, index));
  const rounds = runs.map((run) => run.rounds);
  const totalRounds = Math.max(1, rounds.reduce((sum, value) => sum + value, 0));
  const damage = sumBySide(runs, (metrics) => metrics.damageDealt);
  const reportWithoutVerdict = {
    scenarioName: scenario.name,
    runs: scenario.runs,
    playerWinRate: runs.filter((run) => run.winner === "players").length / Math.max(1, runs.length),
    monsterWinRate: runs.filter((run) => run.winner === "monsters").length / Math.max(1, runs.length),
    stalemateRate: runs.filter((run) => run.winner === "stalemate").length / Math.max(1, runs.length),
    averageRounds: avg(rounds),
    medianRounds: percentile(rounds, 0.5),
    p10Rounds: percentile(rounds, 0.1),
    p90Rounds: percentile(rounds, 0.9),
    averageWinnerHealthRemainingPercent: avg(runs.map((run) => run.winnerHealthRemainingPercent)),
    averageDamagePerRound: {
      players: damage.players / totalRounds,
      monsters: damage.monsters / totalRounds,
    },
    averageDamageTakenPerRound: {
      players: damage.monsters / totalRounds,
      monsters: damage.players / totalRounds,
    },
    averageProtectionPrevented: averageSideTotals(runs, (metrics) => metrics.protectionPrevented),
    averageDodgeAvoided: averageSideTotals(runs, (metrics) => metrics.woundsAvoidedByDodge),
    averageResistCancelled: averageSideTotals(runs, (metrics) => metrics.resistCancelled),
    averageOverkill: averageSideTotals(runs, (metrics) => metrics.overkill),
    averageActionsUsed: averageSideTotals(runs, (metrics) => metrics.actionsUsed),
    averageWastedActions: averageSideTotals(runs, (metrics) => metrics.wastedActions),
    averageMechanics: {
      controlTurnsApplied: averageSideTotals(runs, (metrics) => metrics.controlTurnsApplied),
      actionsDenied: averageSideTotals(runs, (metrics) => metrics.actionsDenied),
      forcedMovementApplied: averageSideTotals(runs, (metrics) => metrics.forcedMovementApplied),
      dodgeRolls: averageSideTotals(runs, (metrics) => metrics.dodgeRolls),
      dodgeChosen: averageSideTotals(runs, (metrics) => metrics.dodgeChosen),
      dodgeDegradationApplied: averageSideTotals(runs, (metrics) => metrics.dodgeDegradationApplied),
      physicalDefenceRolls: averageSideTotals(runs, (metrics) => metrics.physicalDefenceRolls),
      physicalDefenceChosen: averageSideTotals(runs, (metrics) => metrics.physicalDefenceChosen),
      physicalDefenceDegradationApplied: averageSideTotals(runs, (metrics) => metrics.physicalDefenceDegradationApplied),
      mentalDefenceRolls: averageSideTotals(runs, (metrics) => metrics.mentalDefenceRolls),
      mentalDefenceChosen: averageSideTotals(runs, (metrics) => metrics.mentalDefenceChosen),
      mentalDefenceDegradationApplied: averageSideTotals(runs, (metrics) => metrics.mentalDefenceDegradationApplied),
      defenceChoiceExpectedValue: averageSideTotals(runs, (metrics) => metrics.defenceChoiceExpectedValue),
      defenceStringBlocked: averageSideTotals(runs, (metrics) => metrics.defenceStringBlocked),
      staticProtectionPrevented: averageSideTotals(runs, (metrics) => metrics.staticProtectionPrevented),
      resistRolls: averageSideTotals(runs, (metrics) => metrics.resistRolls),
      resistSuccesses: averageSideTotals(runs, (metrics) => metrics.resistSuccesses),
      hostileSuccessesCancelledByResist: averageSideTotals(runs, (metrics) => metrics.hostileSuccessesCancelledByResist),
      buffApplications: averageSideTotals(runs, (metrics) => metrics.buffApplications),
      buffUptime: averageSideTotals(runs, (metrics) => metrics.buffUptime),
      buffedActions: averageSideTotals(runs, (metrics) => metrics.buffedActions),
      debuffApplications: averageSideTotals(runs, (metrics) => metrics.debuffApplications),
      debuffUptime: averageSideTotals(runs, (metrics) => metrics.debuffUptime),
      debuffedActions: averageSideTotals(runs, (metrics) => metrics.debuffedActions),
      healingOverTimeApplied: averageSideTotals(runs, (metrics) => metrics.healingOverTimeApplied),
      healingTicks: averageSideTotals(runs, (metrics) => metrics.healingTicks),
      ongoingDamageApplied: averageSideTotals(runs, (metrics) => metrics.ongoingDamageApplied),
      ongoingDamageUnitsApplied: averageSideTotals(runs, (metrics) => metrics.ongoingDamageUnitsApplied),
      ongoingDamageTicks: averageSideTotals(runs, (metrics) => metrics.ongoingDamageTicks),
      ongoingDamagePreventedOrCleansed: averageSideTotals(runs, (metrics) => metrics.ongoingDamagePreventedOrCleansed),
      counterUses: averageSideTotals(runs, (metrics) => metrics.counterUses),
      counterChosen: averageSideTotals(runs, (metrics) => metrics.counterChosen),
      counterDamage: averageSideTotals(runs, (metrics) => metrics.counterDamage),
      counterMitigation: averageSideTotals(runs, (metrics) => metrics.counterMitigation),
      responsesUsed: averageSideTotals(runs, (metrics) => metrics.responsesUsed),
      responsesWastedOrUnavailable: averageSideTotals(runs, (metrics) => metrics.responsesWastedOrUnavailable),
      passiveDefenceContribution: averageSideTotals(runs, (metrics) => metrics.passiveDefenceContribution),
      stacksApplied: averageSideTotals(runs, (metrics) => metrics.stacksApplied),
      stacksExpired: averageSideTotals(runs, (metrics) => metrics.stacksExpired),
      stacksCleansed: averageSideTotals(runs, (metrics) => metrics.stacksCleansed),
      aoePotentialTargets: averageSideTotals(runs, (metrics) => metrics.aoePotentialTargets),
      aoeActualTargets: averageSideTotals(runs, (metrics) => metrics.aoeActualTargets),
      positionalAbstractionsUsed: averageSideTotals(runs, (metrics) => metrics.positionalAbstractionsUsed),
    },
    roleContribution: mergeRoleContribution(runs),
    actorContributions: mergeActorContributions(runs),
    unsupported: mergeUnsupported(runs),
    hydrationIntegrity: collectHydrationIntegrity(scenario),
  };
  return {
    ...reportWithoutVerdict,
    verdict: verdict(reportWithoutVerdict),
  };
}

function pct(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatSuiteReport(report: CombatSuiteReport): string {
  const unsupported = report.unsupported.unsupportedPowerCount > 0
    ? `Unsupported: ${report.unsupported.unsupportedPowerNames.join(", ")}`
    : "Unsupported: none";
  return [
    `Scenario: ${report.scenarioName}`,
    `Runs: ${report.runs}`,
    `Win rates: players ${pct(report.playerWinRate)}, monsters ${pct(report.monsterWinRate)}, stalemate ${pct(report.stalemateRate)}`,
    `Rounds: avg ${num(report.averageRounds)}, median ${num(report.medianRounds)}, p10/p90 ${num(report.p10Rounds)}/${num(report.p90Rounds)}`,
    `Health remaining: ${pct(report.averageWinnerHealthRemainingPercent)}`,
    `Damage/round: players ${num(report.averageDamagePerRound.players)}, monsters ${num(report.averageDamagePerRound.monsters)}`,
    `Defence: protection prevented P/M ${num(report.averageProtectionPrevented.players)}/${num(report.averageProtectionPrevented.monsters)}, dodge avoided P/M ${num(report.averageDodgeAvoided.players)}/${num(report.averageDodgeAvoided.monsters)}`,
    `Mechanics: control ${num(report.averageMechanics.controlTurnsApplied.players)}/${num(report.averageMechanics.controlTurnsApplied.monsters)}, denied ${num(report.averageMechanics.actionsDenied.players)}/${num(report.averageMechanics.actionsDenied.monsters)}, dodge choices ${num(report.averageMechanics.dodgeChosen.players)}/${num(report.averageMechanics.dodgeChosen.monsters)}, physical defence choices ${num(report.averageMechanics.physicalDefenceChosen.players)}/${num(report.averageMechanics.physicalDefenceChosen.monsters)}, mental defence choices ${num(report.averageMechanics.mentalDefenceChosen.players)}/${num(report.averageMechanics.mentalDefenceChosen.monsters)}, defence blocked ${num(report.averageMechanics.defenceStringBlocked.players)}/${num(report.averageMechanics.defenceStringBlocked.monsters)}, resist successes ${num(report.averageMechanics.resistSuccesses.players)}/${num(report.averageMechanics.resistSuccesses.monsters)}, responses ${num(report.averageMechanics.responsesUsed.players)}/${num(report.averageMechanics.responsesUsed.monsters)}, HoT ticks ${num(report.averageMechanics.healingTicks.players)}/${num(report.averageMechanics.healingTicks.monsters)}, ongoing ticks ${num(report.averageMechanics.ongoingDamageTicks.players)}/${num(report.averageMechanics.ongoingDamageTicks.monsters)}, counters ${num(report.averageMechanics.counterUses.players)}/${num(report.averageMechanics.counterUses.monsters)}, AOE actual/potential ${num(report.averageMechanics.aoeActualTargets.players)}/${num(report.averageMechanics.aoePotentialTargets.players)} vs ${num(report.averageMechanics.aoeActualTargets.monsters)}/${num(report.averageMechanics.aoePotentialTargets.monsters)}`,
    unsupported,
    `Balance verdict: ${report.verdict}`,
  ].join("\n");
}
