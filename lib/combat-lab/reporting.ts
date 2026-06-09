import { runCombatScenario } from "./autoSimulator";
import type {
  CombatActorContribution,
  CombatCounterCandidateDiagnostic,
  CombatDefensiveContribution,
  CombatAggregateMetrics,
  CombatCooldownTrace,
  CombatMonsterGroupContribution,
  CombatRunResult,
  CombatScenario,
  CombatHydrationIntegrity,
  CombatOngoingPressureActionMetrics,
  CombatOngoingPressureActionReport,
  CombatOngoingPressureReport,
  CombatOngoingPressureSideReport,
  CombatOngoingPressureSideTotals,
  CombatSide,
  CombatSuiteReport,
  CombatStoppedByBreakdown,
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

function averageSideRatio(
  runs: CombatRunResult[],
  numerator: (metrics: CombatAggregateMetrics) => Record<CombatSide, number>,
  denominator: (metrics: CombatAggregateMetrics) => Record<CombatSide, number>,
) {
  const totals = sumBySide(runs, numerator);
  const divisors = sumBySide(runs, denominator);
  return {
    players: totals.players / Math.max(1, divisors.players),
    monsters: totals.monsters / Math.max(1, divisors.monsters),
  };
}

export function calculateOutcomeSummary(
  runs: Array<Pick<CombatRunResult, "winner" | "stoppedBy">>,
): {
  playerWinRate: number;
  monsterWinRate: number;
  stalemateRate: number;
  stoppedByBreakdown: CombatStoppedByBreakdown;
} {
  const divisor = Math.max(1, runs.length);
  return {
    playerWinRate: runs.filter((run) => run.winner === "players").length / divisor,
    monsterWinRate: runs.filter((run) => run.winner === "monsters").length / divisor,
    stalemateRate: runs.filter((run) => run.winner === "stalemate").length / divisor,
    stoppedByBreakdown: {
      playersDefeated: runs.filter((run) => run.stoppedBy === "playersDefeated").length / divisor,
      monstersDefeated: runs.filter((run) => run.stoppedBy === "monstersDefeated").length / divisor,
      maxRounds: runs.filter((run) => run.stoppedBy === "maxRounds").length / divisor,
      stalemate: runs.filter((run) => run.stoppedBy === "stalemate").length / divisor,
    },
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
    realMonsterCount: new Set(
      scenario.monsters
        .filter((actor) => actor.hydration.source === "campaignMonster")
        .map((actor) => actor.baseActorId ?? actor.id),
    ).size,
    monsterInstanceCount: scenario.monsters.filter((actor) => actor.hydration.source === "campaignMonster").length,
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
      actor.actionsUsed += contribution.actionsUsed / divisor;
      actor.damage += contribution.damage / divisor;
      actor.healing += contribution.healing / divisor;
      actor.healingOverTimeApplied += contribution.healingOverTimeApplied / divisor;
      actor.healingTicks += contribution.healingTicks / divisor;
      actor.mitigation += contribution.mitigation / divisor;
      actor.counterUses += contribution.counterUses / divisor;
      actor.counterDamage += contribution.counterDamage / divisor;
      actor.counterMitigation += contribution.counterMitigation / divisor;
      actor.buffApplications += contribution.buffApplications / divisor;
      actor.buffUptime += contribution.buffUptime / divisor;
      actor.debuffApplications += contribution.debuffApplications / divisor;
      actor.debuffUptime += contribution.debuffUptime / divisor;
      actor.controlTurnsApplied += contribution.controlTurnsApplied / divisor;
      actor.actionsDenied += contribution.actionsDenied / divisor;
      actor.ongoingDamageApplied += contribution.ongoingDamageApplied / divisor;
      actor.ongoingDamageTicks += contribution.ongoingDamageTicks / divisor;

      for (const actionContribution of contribution.actionContributions) {
        let action = actor.actionContributions.find((entry) => entry.actionId === actionContribution.actionId);
        if (!action) {
          action = { ...actionContribution, uses: 0, damage: 0, healing: 0, healingOverTimeApplied: 0, healingTicks: 0, mitigation: 0, counterUses: 0, counterDamage: 0, counterMitigation: 0, buffApplications: 0, buffUptime: 0, debuffApplications: 0, debuffUptime: 0, controlTurnsApplied: 0, actionsDenied: 0, ongoingDamageApplied: 0, ongoingDamageTicks: 0 };
          actor.actionContributions.push(action);
        }
        action.uses += actionContribution.uses / divisor;
        action.damage += actionContribution.damage / divisor;
        action.healing += actionContribution.healing / divisor;
        action.healingOverTimeApplied += actionContribution.healingOverTimeApplied / divisor;
        action.healingTicks += actionContribution.healingTicks / divisor;
        action.mitigation += actionContribution.mitigation / divisor;
        action.counterUses += actionContribution.counterUses / divisor;
        action.counterDamage += actionContribution.counterDamage / divisor;
        action.counterMitigation += actionContribution.counterMitigation / divisor;
        action.buffApplications += actionContribution.buffApplications / divisor;
        action.buffUptime += actionContribution.buffUptime / divisor;
        action.debuffApplications += actionContribution.debuffApplications / divisor;
        action.debuffUptime += actionContribution.debuffUptime / divisor;
        action.controlTurnsApplied += actionContribution.controlTurnsApplied / divisor;
        action.actionsDenied += actionContribution.actionsDenied / divisor;
        action.ongoingDamageApplied += actionContribution.ongoingDamageApplied / divisor;
        action.ongoingDamageTicks += actionContribution.ongoingDamageTicks / divisor;
      }

      actor.actionContributions.sort((a, b) =>
        (b.damage + b.healing + b.healingOverTimeApplied + b.mitigation + b.buffApplications + b.buffUptime + b.debuffApplications + b.debuffUptime + b.controlTurnsApplied + b.ongoingDamageApplied) -
        (a.damage + a.healing + a.healingOverTimeApplied + a.mitigation + a.buffApplications + a.buffUptime + a.debuffApplications + a.debuffUptime + a.controlTurnsApplied + a.ongoingDamageApplied),
      );
      actor.topActionName = actor.actionContributions[0]?.actionName ?? null;
      merged.set(contribution.actorId, actor);
    }
  }
  return [...merged.values()].sort((a, b) =>
    a.side.localeCompare(b.side) ||
    (b.damage + b.healing + b.healingOverTimeApplied + b.mitigation + b.buffApplications + b.buffUptime + b.debuffApplications + b.debuffUptime + b.controlTurnsApplied + b.ongoingDamageApplied) -
      (a.damage + a.healing + a.healingOverTimeApplied + a.mitigation + a.buffApplications + a.buffUptime + a.debuffApplications + a.debuffUptime + a.controlTurnsApplied + a.ongoingDamageApplied),
  );
}

function mergeMonsterGroupContributions(scenario: CombatScenario, runs: CombatRunResult[]): CombatMonsterGroupContribution[] {
  const divisor = Math.max(1, runs.length);
  const groups = new Map<string, CombatMonsterGroupContribution>();
  for (const monster of scenario.monsters) {
    const baseActorId = monster.baseActorId ?? monster.id;
    const group = groups.get(baseActorId) ?? {
      baseActorId,
      displayGroupName: monster.displayGroupName ?? monster.name,
      quantity: 0,
      survivors: 0,
      defeated: 0,
      actionsUsed: 0,
      damage: 0,
      healing: 0,
      mitigation: 0,
      controlTurnsApplied: 0,
      ongoingDamageApplied: 0,
      averageDamagePerInstance: 0,
    };
    group.quantity += 1;
    groups.set(baseActorId, group);
  }

  for (const run of runs) {
    for (const contribution of Object.values(run.metrics.actorContributions)) {
      if (contribution.side !== "monsters") continue;
      const baseActorId = contribution.baseActorId ?? contribution.actorId;
      const group = groups.get(baseActorId);
      if (!group) continue;
      group.actionsUsed += contribution.actionsUsed / divisor;
      group.damage += contribution.damage / divisor;
      group.healing += contribution.healing / divisor;
      group.mitigation += contribution.mitigation / divisor;
      group.controlTurnsApplied += contribution.controlTurnsApplied / divisor;
      group.ongoingDamageApplied += contribution.ongoingDamageApplied / divisor;
    }
  }

  const survivorTotals = new Map<string, number>();
  for (const run of runs) {
    const survivingMonsterIds = new Set(run.survivorActorIds.monsters);
    for (const actor of scenario.monsters) {
      if (!survivingMonsterIds.has(actor.id)) continue;
      const baseActorId = actor.baseActorId ?? actor.id;
      survivorTotals.set(baseActorId, (survivorTotals.get(baseActorId) ?? 0) + 1 / divisor);
    }
  }

  for (const group of groups.values()) {
    group.survivors = survivorTotals.get(group.baseActorId) ?? 0;
    group.defeated = Math.max(0, group.quantity - group.survivors);
    group.averageDamagePerInstance = group.damage / Math.max(1, group.quantity);
  }

  return [...groups.values()].sort((a, b) => b.quantity - a.quantity || a.displayGroupName.localeCompare(b.displayGroupName));
}

function mergeDefensiveContributions(runs: CombatRunResult[]): CombatDefensiveContribution[] {
  const merged = new Map<string, CombatDefensiveContribution>();
  const divisor = Math.max(1, runs.length);
  for (const run of runs) {
    for (const contribution of Object.values(run.metrics.defensiveContributions)) {
      const actor = merged.get(contribution.actorId) ?? {
        ...contribution,
        attacksDefended: 0,
        woundsDodged: 0,
        defenceStringBlocked: 0,
        staticProtectionPrevented: 0,
        buffedDefenceRolls: 0,
        debuffedDefenceRolls: 0,
        buffedResistRolls: 0,
        debuffedResistRolls: 0,
        counterUses: 0,
        counterDamage: 0,
        counterMitigation: 0,
        responsesUsed: 0,
        netDamageTaken: 0,
      };
      actor.attacksDefended += contribution.attacksDefended / divisor;
      actor.woundsDodged += contribution.woundsDodged / divisor;
      actor.defenceStringBlocked += contribution.defenceStringBlocked / divisor;
      actor.staticProtectionPrevented += contribution.staticProtectionPrevented / divisor;
      actor.buffedDefenceRolls += contribution.buffedDefenceRolls / divisor;
      actor.debuffedDefenceRolls += contribution.debuffedDefenceRolls / divisor;
      actor.buffedResistRolls += contribution.buffedResistRolls / divisor;
      actor.debuffedResistRolls += contribution.debuffedResistRolls / divisor;
      actor.counterUses += contribution.counterUses / divisor;
      actor.counterDamage += contribution.counterDamage / divisor;
      actor.counterMitigation += contribution.counterMitigation / divisor;
      actor.responsesUsed += contribution.responsesUsed / divisor;
      actor.netDamageTaken += contribution.netDamageTaken / divisor;
      merged.set(contribution.actorId, actor);
    }
  }
  return [...merged.values()].sort((a, b) =>
    a.side.localeCompare(b.side) ||
    (b.woundsDodged + b.defenceStringBlocked + b.staticProtectionPrevented + b.counterMitigation + b.counterDamage) -
      (a.woundsDodged + a.defenceStringBlocked + a.staticProtectionPrevented + a.counterMitigation + a.counterDamage),
  );
}

function mergeCooldownTrace(runs: CombatRunResult[]): CombatCooldownTrace[] {
  const merged = new Map<string, CombatCooldownTrace>();
  const divisor = Math.max(1, runs.length);
  for (const run of runs) {
    for (const trace of Object.values(run.metrics.cooldownTrace)) {
      const entry = merged.get(`${trace.actorId}:${trace.actionId}`) ?? {
        ...trace,
        uses: 0,
        attemptedUsesWhileOnCooldown: 0,
        preventedByCooldown: 0,
        cooldownApplied: 0,
        cooldownTicks: 0,
        availableTurns: 0,
        unavailableTurns: 0,
      };
      entry.cooldownRounds = Math.max(entry.cooldownRounds, trace.cooldownRounds);
      entry.isCounter = entry.isCounter || trace.isCounter;
      entry.uses += trace.uses / divisor;
      entry.attemptedUsesWhileOnCooldown += trace.attemptedUsesWhileOnCooldown / divisor;
      entry.preventedByCooldown += trace.preventedByCooldown / divisor;
      entry.cooldownApplied += trace.cooldownApplied / divisor;
      entry.cooldownTicks += trace.cooldownTicks / divisor;
      entry.availableTurns += trace.availableTurns / divisor;
      entry.unavailableTurns += trace.unavailableTurns / divisor;
      merged.set(`${trace.actorId}:${trace.actionId}`, entry);
    }
  }
  return [...merged.values()].sort((a, b) =>
    a.side.localeCompare(b.side) ||
    Number(b.isCounter) - Number(a.isCounter) ||
    (b.preventedByCooldown + b.uses + b.cooldownTicks) - (a.preventedByCooldown + a.uses + a.cooldownTicks),
  );
}

function mergeCounterCandidateDiagnostics(runs: CombatRunResult[]): CombatCounterCandidateDiagnostic[] {
  const merged = new Map<string, CombatCounterCandidateDiagnostic>();
  const divisor = Math.max(1, runs.length);
  for (const run of runs) {
    for (const diagnostic of Object.values(run.metrics.counterCandidateDiagnostics)) {
      const entry = merged.get(`${diagnostic.actorId}:${diagnostic.actionId}`) ?? {
        ...diagnostic,
        considered: 0,
        selected: 0,
        skippedNormalDefenceBetter: 0,
        skippedNoResponse: 0,
        skippedCooldown: 0,
        skippedUnsupported: 0,
        skippedNonAvoidable: 0,
        skippedNonApplicable: 0,
        totalExpectedCounterPrevention: 0,
        totalExpectedNormalPrevention: 0,
        expectedSamples: 0,
      };
      entry.considered += diagnostic.considered / divisor;
      entry.selected += diagnostic.selected / divisor;
      entry.skippedNormalDefenceBetter += diagnostic.skippedNormalDefenceBetter / divisor;
      entry.skippedNoResponse += diagnostic.skippedNoResponse / divisor;
      entry.skippedCooldown += diagnostic.skippedCooldown / divisor;
      entry.skippedUnsupported += diagnostic.skippedUnsupported / divisor;
      entry.skippedNonAvoidable += diagnostic.skippedNonAvoidable / divisor;
      entry.skippedNonApplicable += diagnostic.skippedNonApplicable / divisor;
      entry.totalExpectedCounterPrevention += diagnostic.totalExpectedCounterPrevention / divisor;
      entry.totalExpectedNormalPrevention += diagnostic.totalExpectedNormalPrevention / divisor;
      entry.expectedSamples += diagnostic.expectedSamples / divisor;
      entry.lastReason = diagnostic.lastReason ?? entry.lastReason;
      merged.set(`${diagnostic.actorId}:${diagnostic.actionId}`, entry);
    }
  }
  return [...merged.values()].sort((a, b) =>
    a.side.localeCompare(b.side) ||
    (b.considered - b.selected) - (a.considered - a.selected) ||
    a.actorName.localeCompare(b.actorName) ||
    a.actionName.localeCompare(b.actionName),
  );
}

function emptyOngoingSideReport(): CombatOngoingPressureSideReport {
  return {
    statusesCreated: 0,
    storedTickAverage: 0,
    storedTickMax: 0,
    firstTicksApplied: 0,
    firstTickDamageAverage: 0,
    firstTickLethalCount: 0,
    firstTickLethalRate: 0,
    firstTickBeforeCleanup: 0,
    cleanupAttempts: 0,
    cleanupSuccesses: 0,
    cleanupUnitsRemoved: 0,
    cleanupWoundsRemoved: 0,
    cleanupPreventedWoundsEstimate: null,
  };
}

function addOngoingTotals(
  target: CombatOngoingPressureSideTotals,
  source: CombatOngoingPressureSideTotals,
) {
  target.statusesCreated += source.statusesCreated;
  target.storedTickTotal += source.storedTickTotal;
  target.storedTickMax = Math.max(target.storedTickMax, source.storedTickMax);
  target.firstTicksApplied += source.firstTicksApplied;
  target.firstTickDamageTotal += source.firstTickDamageTotal;
  target.firstTickLethal += source.firstTickLethal;
  target.firstTickBeforeCleanup += source.firstTickBeforeCleanup;
  target.ticksAppliedTotal += source.ticksAppliedTotal;
  target.totalOngoingDamage += source.totalOngoingDamage;
  target.cleanupAttempts += source.cleanupAttempts;
  target.cleanupSuccesses += source.cleanupSuccesses;
  target.cleanupUnitsRemoved += source.cleanupUnitsRemoved;
  target.cleanupWoundsRemoved += source.cleanupWoundsRemoved;
  target.cleanupRemainingTicksTotal += source.cleanupRemainingTicksTotal;
  target.cleanupStoredTickRemovedTotal += source.cleanupStoredTickRemovedTotal;
  target.cleanupPreventedWoundsEstimate += source.cleanupPreventedWoundsEstimate;
}

function emptyOngoingTotals(): CombatOngoingPressureSideTotals {
  return {
    statusesCreated: 0,
    storedTickTotal: 0,
    storedTickMax: 0,
    firstTicksApplied: 0,
    firstTickDamageTotal: 0,
    firstTickLethal: 0,
    firstTickBeforeCleanup: 0,
    ticksAppliedTotal: 0,
    totalOngoingDamage: 0,
    cleanupAttempts: 0,
    cleanupSuccesses: 0,
    cleanupUnitsRemoved: 0,
    cleanupWoundsRemoved: 0,
    cleanupRemainingTicksTotal: 0,
    cleanupStoredTickRemovedTotal: 0,
    cleanupPreventedWoundsEstimate: 0,
  };
}

function sideReportFromTotals(
  totals: CombatOngoingPressureSideTotals,
  runCount: number,
): CombatOngoingPressureSideReport {
  const divisor = Math.max(1, runCount);
  return {
    statusesCreated: totals.statusesCreated / divisor,
    storedTickAverage: totals.storedTickTotal / Math.max(1, totals.statusesCreated),
    storedTickMax: totals.storedTickMax,
    firstTicksApplied: totals.firstTicksApplied / divisor,
    firstTickDamageAverage: totals.firstTickDamageTotal / Math.max(1, totals.firstTicksApplied),
    firstTickLethalCount: totals.firstTickLethal / divisor,
    firstTickLethalRate: totals.firstTickLethal / Math.max(1, totals.firstTicksApplied),
    firstTickBeforeCleanup: totals.firstTickBeforeCleanup / divisor,
    cleanupAttempts: totals.cleanupAttempts / divisor,
    cleanupSuccesses: totals.cleanupSuccesses / divisor,
    cleanupUnitsRemoved: totals.cleanupUnitsRemoved / divisor,
    cleanupWoundsRemoved: totals.cleanupWoundsRemoved / divisor,
    cleanupPreventedWoundsEstimate:
      totals.cleanupAttempts > 0 ? totals.cleanupPreventedWoundsEstimate / divisor : null,
  };
}

function actionReportFromTotals(
  totals: CombatOngoingPressureActionMetrics,
  runCount: number,
): CombatOngoingPressureActionReport {
  const divisor = Math.max(1, runCount);
  return {
    sourceActorId: totals.sourceActorId,
    sourceActorName: totals.sourceActorName,
    sourceSide: totals.sourceSide,
    sourceActionId: totals.sourceActionId,
    sourceActionName: totals.sourceActionName,
    statusesCreated: totals.statusesCreated / divisor,
    averageStoredTick: totals.storedTickTotal / Math.max(1, totals.statusesCreated),
    maxStoredTick: totals.storedTickMax,
    firstTicksApplied: totals.firstTicksApplied / divisor,
    averageFirstTickDamage: totals.firstTickDamageTotal / Math.max(1, totals.firstTicksApplied),
    firstTickLethalCount: totals.firstTickLethal / divisor,
    firstTickLethalRate: totals.firstTickLethal / Math.max(1, totals.firstTicksApplied),
    ticksAppliedTotal: totals.ticksAppliedTotal / divisor,
    totalOngoingDamage: totals.totalOngoingDamage / divisor,
    cleanupAttempts: totals.cleanupAttempts / divisor,
    cleanupSuccesses: totals.cleanupSuccesses / divisor,
    cleanupUnitsRemoved: totals.cleanupUnitsRemoved / divisor,
    averageRemainingTicksAtCleanup: totals.cleanupRemainingTicksTotal / Math.max(1, totals.cleanupAttempts),
    averageStoredTickRemoved: totals.cleanupStoredTickRemovedTotal / Math.max(1, totals.cleanupSuccesses),
    cleanupPreventedWoundsEstimate:
      totals.cleanupAttempts > 0 ? totals.cleanupPreventedWoundsEstimate / divisor : null,
  };
}

function mergeOngoingPressure(runs: CombatRunResult[]): CombatOngoingPressureReport {
  const players = emptyOngoingTotals();
  const monsters = emptyOngoingTotals();
  const byAction = new Map<string, CombatOngoingPressureActionMetrics>();

  for (const run of runs) {
    addOngoingTotals(players, run.metrics.ongoingPressure.bySourceSide.players);
    addOngoingTotals(monsters, run.metrics.ongoingPressure.bySourceSide.monsters);
    for (const [key, action] of Object.entries(run.metrics.ongoingPressure.bySourceAction)) {
      const current = byAction.get(key) ?? {
        ...action,
        ...emptyOngoingTotals(),
      };
      addOngoingTotals(current, action);
      byAction.set(key, current);
    }
  }

  return {
    convention: "Ongoing pressure is grouped by source side: players/monsters means the side that created or dealt the ongoing damage.",
    bySourceSide: {
      players: runs.length > 0 ? sideReportFromTotals(players, runs.length) : emptyOngoingSideReport(),
      monsters: runs.length > 0 ? sideReportFromTotals(monsters, runs.length) : emptyOngoingSideReport(),
    },
    bySourceAction: Array.from(byAction.values())
      .map((entry) => actionReportFromTotals(entry, runs.length))
      .sort((left, right) =>
        right.totalOngoingDamage - left.totalOngoingDamage ||
        right.statusesCreated - left.statusesCreated ||
        left.sourceSide.localeCompare(right.sourceSide) ||
        left.sourceActorName.localeCompare(right.sourceActorName) ||
        left.sourceActionName.localeCompare(right.sourceActionName),
      ),
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
  const hasTank =
    Object.keys(report.roleContribution).some((role) => role.toLowerCase().includes("tank")) ||
    report.actorContributions.some(
      (actor) =>
        actor.side === "players" &&
        `${actor.actorName} ${actor.role}`.toLowerCase().includes("tank"),
    );
  if (
    report.playerWinRate > 0.8 &&
    hasTank &&
    report.averageRounds >= 5 &&
    report.averageDamagePerRound.players <= 4
  ) {
    return "expected tank attrition win";
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
  const outcomeSummary = calculateOutcomeSummary(runs);
  const reportWithoutVerdict = {
    scenarioName: scenario.name,
    runs: scenario.runs,
    ...outcomeSummary,
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
      buffedDefenceRolls: averageSideTotals(runs, (metrics) => metrics.buffedDefenceRolls),
      buffedResistRolls: averageSideTotals(runs, (metrics) => metrics.buffedResistRolls),
      debuffApplications: averageSideTotals(runs, (metrics) => metrics.debuffApplications),
      debuffUptime: averageSideTotals(runs, (metrics) => metrics.debuffUptime),
      debuffedActions: averageSideTotals(runs, (metrics) => metrics.debuffedActions),
      debuffedDefenceRolls: averageSideTotals(runs, (metrics) => metrics.debuffedDefenceRolls),
      debuffedResistRolls: averageSideTotals(runs, (metrics) => metrics.debuffedResistRolls),
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
      aoeActionUses: averageSideTotals(runs, (metrics) => metrics.aoeActionUses),
      aoePotentialTargets: averageSideRatio(
        runs,
        (metrics) => metrics.aoePotentialTargets,
        (metrics) => metrics.aoeActionUses,
      ),
      aoeActualTargets: averageSideRatio(
        runs,
        (metrics) => metrics.aoeActualTargets,
        (metrics) => metrics.aoeActionUses,
      ),
      positionalAbstractionsUsed: averageSideTotals(runs, (metrics) => metrics.positionalAbstractionsUsed),
      mainActionsUsed: averageSideTotals(runs, (metrics) => metrics.mainActionsUsed),
      powerActionsUsed: averageSideTotals(runs, (metrics) => metrics.powerActionsUsed),
      secondWeaponAttacksUsed: averageSideTotals(runs, (metrics) => metrics.secondWeaponAttacksUsed),
      skippedPowerActions: averageSideTotals(runs, (metrics) => metrics.skippedPowerActions),
    },
    roleContribution: mergeRoleContribution(runs),
    actorContributions: mergeActorContributions(runs),
    monsterGroupContributions: mergeMonsterGroupContributions(scenario, runs),
    defensiveContributions: mergeDefensiveContributions(runs),
    ongoingPressure: mergeOngoingPressure(runs),
    cooldownTrace: mergeCooldownTrace(runs),
    counterCandidateDiagnostics: mergeCounterCandidateDiagnostics(runs),
    firstRunTranscript: runs[0]?.firstRunTranscript,
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
    `Mechanics: main ${num(report.averageMechanics.mainActionsUsed.players)}/${num(report.averageMechanics.mainActionsUsed.monsters)}, power ${num(report.averageMechanics.powerActionsUsed.players)}/${num(report.averageMechanics.powerActionsUsed.monsters)}, second weapon ${num(report.averageMechanics.secondWeaponAttacksUsed.players)}/${num(report.averageMechanics.secondWeaponAttacksUsed.monsters)}, skipped power ${num(report.averageMechanics.skippedPowerActions.players)}/${num(report.averageMechanics.skippedPowerActions.monsters)}, control ${num(report.averageMechanics.controlTurnsApplied.players)}/${num(report.averageMechanics.controlTurnsApplied.monsters)}, denied ${num(report.averageMechanics.actionsDenied.players)}/${num(report.averageMechanics.actionsDenied.monsters)}, dodge choices ${num(report.averageMechanics.dodgeChosen.players)}/${num(report.averageMechanics.dodgeChosen.monsters)}, physical defence choices ${num(report.averageMechanics.physicalDefenceChosen.players)}/${num(report.averageMechanics.physicalDefenceChosen.monsters)}, mental defence choices ${num(report.averageMechanics.mentalDefenceChosen.players)}/${num(report.averageMechanics.mentalDefenceChosen.monsters)}, defence blocked ${num(report.averageMechanics.defenceStringBlocked.players)}/${num(report.averageMechanics.defenceStringBlocked.monsters)}, debuffed defence rolls ${num(report.averageMechanics.debuffedDefenceRolls.players)}/${num(report.averageMechanics.debuffedDefenceRolls.monsters)}, debuffed resist rolls ${num(report.averageMechanics.debuffedResistRolls.players)}/${num(report.averageMechanics.debuffedResistRolls.monsters)}, resist successes ${num(report.averageMechanics.resistSuccesses.players)}/${num(report.averageMechanics.resistSuccesses.monsters)}, responses ${num(report.averageMechanics.responsesUsed.players)}/${num(report.averageMechanics.responsesUsed.monsters)}, HoT ticks ${num(report.averageMechanics.healingTicks.players)}/${num(report.averageMechanics.healingTicks.monsters)}, ongoing ticks ${num(report.averageMechanics.ongoingDamageTicks.players)}/${num(report.averageMechanics.ongoingDamageTicks.monsters)}, counters ${num(report.averageMechanics.counterUses.players)}/${num(report.averageMechanics.counterUses.monsters)}, AOE targets/action ${num(report.averageMechanics.aoeActualTargets.players)}/${num(report.averageMechanics.aoePotentialTargets.players)} vs ${num(report.averageMechanics.aoeActualTargets.monsters)}/${num(report.averageMechanics.aoePotentialTargets.monsters)}`,
    unsupported,
    `Balance verdict: ${report.verdict}`,
  ].join("\n");
}
