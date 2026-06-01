import { runCombatScenario } from "./autoSimulator";
import type {
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
    hydrationWarnings: Array.from(new Set(actors.flatMap((actor) => actor.hydration.warnings))),
    actors: actorReports,
  };
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
      buffApplications: averageSideTotals(runs, (metrics) => metrics.buffApplications),
      buffUptime: averageSideTotals(runs, (metrics) => metrics.buffUptime),
      buffedActions: averageSideTotals(runs, (metrics) => metrics.buffedActions),
      debuffApplications: averageSideTotals(runs, (metrics) => metrics.debuffApplications),
      debuffUptime: averageSideTotals(runs, (metrics) => metrics.debuffUptime),
      debuffedActions: averageSideTotals(runs, (metrics) => metrics.debuffedActions),
      healingOverTimeApplied: averageSideTotals(runs, (metrics) => metrics.healingOverTimeApplied),
      ongoingDamageApplied: averageSideTotals(runs, (metrics) => metrics.ongoingDamageApplied),
      counterUses: averageSideTotals(runs, (metrics) => metrics.counterUses),
      counterDamage: averageSideTotals(runs, (metrics) => metrics.counterDamage),
      counterMitigation: averageSideTotals(runs, (metrics) => metrics.counterMitigation),
      passiveDefenceContribution: averageSideTotals(runs, (metrics) => metrics.passiveDefenceContribution),
      positionalAbstractionsUsed: averageSideTotals(runs, (metrics) => metrics.positionalAbstractionsUsed),
    },
    roleContribution: mergeRoleContribution(runs),
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
    `Mechanics: control ${num(report.averageMechanics.controlTurnsApplied.players)}/${num(report.averageMechanics.controlTurnsApplied.monsters)}, denied ${num(report.averageMechanics.actionsDenied.players)}/${num(report.averageMechanics.actionsDenied.monsters)}, forced move ${num(report.averageMechanics.forcedMovementApplied.players)}/${num(report.averageMechanics.forcedMovementApplied.monsters)}, buffs ${num(report.averageMechanics.buffApplications.players)}/${num(report.averageMechanics.buffApplications.monsters)}, debuffs ${num(report.averageMechanics.debuffApplications.players)}/${num(report.averageMechanics.debuffApplications.monsters)}, HoT ${num(report.averageMechanics.healingOverTimeApplied.players)}/${num(report.averageMechanics.healingOverTimeApplied.monsters)}, ongoing ${num(report.averageMechanics.ongoingDamageApplied.players)}/${num(report.averageMechanics.ongoingDamageApplied.monsters)}, counters ${num(report.averageMechanics.counterUses.players)}/${num(report.averageMechanics.counterUses.monsters)}, abstractions ${num(report.averageMechanics.positionalAbstractionsUsed.players)}/${num(report.averageMechanics.positionalAbstractionsUsed.monsters)}`,
    unsupported,
    `Balance verdict: ${report.verdict}`,
  ].join("\n");
}
