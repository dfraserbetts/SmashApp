import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { normalizePowerTuningValues } from "../lib/config/powerTuningShared";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import type {
  DiceSize,
  EffectPacket,
  MonsterTier,
  Power,
  PowerIntention,
} from "../lib/summoning/types";

const ACTIVE_POWER_TUNING_PATH =
  "scripts/fixtures/tuning/active-power-tuning.json";
const LEVEL = 5;
const TIER = "SOLDIER" satisfies MonsterTier;
const RUNS_PER_MATCHUP = 200;
const MAX_ROUNDS = 20;
const SUCCESS_THRESHOLD = 4;
const BASE_SEED = 0x5a17c0de;

type SnapshotPayload = {
  name: string | null;
  values: Record<string, unknown>;
};

type ActionType = "basicAttack" | "powerAttack" | "controlPower";
type ActionLifecycle = "basic" | "immediate" | "lifespan" | "passive";

type ActionDefinition = {
  id: string;
  name: string;
  type: ActionType;
  lifecycle: ActionLifecycle;
  lifecycleLabel: string;
  diceCount: number;
  dieSize: DiceSize;
  potency: number;
  controlTurns: number;
  lifespanTurns: number | null;
  power?: Power;
};

type ResolvedAction = ActionDefinition & {
  derivedCooldownTurns: number | null;
  cooldownSource: "none" | "derived";
  basePowerValue: number | null;
};

type ActionRuntimeState = {
  cooldownDie: number | null;
  cooldownPlacedThisOwnerTurn: boolean;
  activeRemainingOwnerTurns: number;
  activeStartedThisOwnerTurn: boolean;
  awaitingFinalResolutionWindow: boolean;
  uses: number;
  blockedByActiveState: number;
  blockedByCooldown: number;
  usageAttempts: number;
};

type SmokeMonsterFixture = {
  id: string;
  name: string;
  role: string;
  level: number;
  tier: MonsterTier;
  legendary: boolean;
  physicalHp: number;
  physicalProtection: number;
  dodgeChance: number;
  actions: ActionDefinition[];
};

type CombatantRuntime = {
  fixture: SmokeMonsterFixture;
  currentHp: number;
  deniedTurns: number;
  actions: ResolvedAction[];
  actionStates: Record<string, ActionRuntimeState>;
  stats: CombatantStats;
};

type CombatantStats = {
  woundsDealt: number;
  largestSpike: number;
  actionUses: Record<string, number>;
  powerUses: Record<string, number>;
  controlAttempts: number;
  controlSuccesses: number;
  controlInflicted: number;
  controlSuffered: number;
  dodgesAttempted: number;
  dodgesSucceeded: number;
  protectionPrevented: number;
  blockedByActiveState: number;
  blockedByCooldown: number;
  cooldownViolations: number;
};

type RunResult = {
  winnerId: string | null;
  rounds: number;
  timedOut: boolean;
  first: CombatantStats;
  second: CombatantStats;
};

type MatchupAggregate = {
  first: SmokeMonsterFixture;
  second: SmokeMonsterFixture;
  runs: number;
  firstWins: number;
  secondWins: number;
  draws: number;
  averageRounds: number;
  firstAverageWounds: number;
  secondAverageWounds: number;
  firstAverageWoundsPerRound: number;
  secondAverageWoundsPerRound: number;
  largestSingleTurnSpike: number;
  firstActionUses: Record<string, number>;
  secondActionUses: Record<string, number>;
  firstPowerUses: Record<string, number>;
  secondPowerUses: Record<string, number>;
  firstMostUsedAction: string | null;
  secondMostUsedAction: string | null;
  firstControlAttempts: number;
  secondControlAttempts: number;
  firstControlSuccesses: number;
  secondControlSuccesses: number;
  firstControlInflicted: number;
  secondControlInflicted: number;
  firstControlSuffered: number;
  secondControlSuffered: number;
  firstDefensiveSuccessRate: number | null;
  secondDefensiveSuccessRate: number | null;
  firstActiveBlocked: number;
  secondActiveBlocked: number;
  firstCooldownBlocked: number;
  secondCooldownBlocked: number;
  firstCooldownViolations: number;
  secondCooldownViolations: number;
  warnings: string[];
};

class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  intInclusive(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSnapshot(relativePath: string): SnapshotPayload {
  const absolutePath = join(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing active tuning snapshot: ${relativePath}`);
  }

  const parsed = JSON.parse(
    readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, ""),
  ) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Active tuning snapshot must be an object: ${relativePath}`);
  }

  return {
    name:
      typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : null,
    values: isRecord(parsed.values) ? parsed.values : parsed,
  };
}

function diceSides(dieSize: DiceSize): number {
  return Number(dieSize.slice(1));
}

function pSuccess(dieSize: DiceSize): number {
  const sides = diceSides(dieSize);
  if (!Number.isFinite(sides) || sides <= 0) return 0;
  const winningFaces = Math.max(0, sides - SUCCESS_THRESHOLD + 1);
  return Math.min(1, winningFaces / sides);
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percent(value: number): string {
  return `${round(value * 100, 1)}%`;
}

function createPacket(
  intention: PowerIntention,
  overrides: Partial<EffectPacket> = {},
): EffectPacket {
  return {
    sortOrder: 0,
    packetIndex: 0,
    hostility:
      intention === "ATTACK" ||
      intention === "CONTROL" ||
      intention === "DEBUFF"
        ? "HOSTILE"
        : "NON_HOSTILE",
    intention,
    type: intention,
    diceCount: 2,
    potency: 2,
    effectTimingType: "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: "INSTANT",
    effectDurationTurns: null,
    applyTo: "PRIMARY_TARGET",
    triggerConditionText: null,
    detailsJson: {},
    ...overrides,
  };
}

function createPower(config: {
  sortOrder: number;
  name: string;
  intention: PowerIntention;
  diceCount: number;
  potency: number;
  detailsJson: Record<string, unknown>;
  lifecycle: Exclude<ActionLifecycle, "basic">;
  lifespanTurns?: number | null;
}): Power {
  const isLifespan = config.lifecycle === "lifespan";
  const packet = createPacket(config.intention, {
    diceCount: config.diceCount,
    potency: config.potency,
    effectDurationType: isLifespan ? "TURNS" : "INSTANT",
    effectDurationTurns: isLifespan ? (config.lifespanTurns ?? 1) : null,
    detailsJson: config.detailsJson,
  });

  return {
    sortOrder: config.sortOrder,
    name: config.name,
    description: null,
    descriptorChassis: isLifespan ? "ATTACHED" : "IMMEDIATE",
    descriptorChassisConfig: {},
    cooldownTurns: 1,
    cooldownReduction: 0,
    counterMode: "NO",
    commitmentModifier: "STANDARD",
    lifespanType: isLifespan ? "TURNS" : "NONE",
    lifespanTurns: isLifespan ? (config.lifespanTurns ?? 1) : null,
    rangeCategories: ["RANGED"],
    rangedDistanceFeet: 60,
    rangedTargets: 1,
    aoeCenterRangeFeet: null,
    aoeCount: null,
    aoeShape: null,
    aoeSphereRadiusFeet: null,
    effectPackets: [packet],
    intentions: [packet],
    diceCount: config.diceCount,
    potency: config.potency,
    effectDurationType: packet.effectDurationType,
    effectDurationTurns: packet.effectDurationTurns,
    durationType: packet.effectDurationType,
    durationTurns: packet.effectDurationTurns,
    defenceRequirement: "NONE",
  };
}

function emptyStats(): CombatantStats {
  return {
    woundsDealt: 0,
    largestSpike: 0,
    actionUses: {},
    powerUses: {},
    controlAttempts: 0,
    controlSuccesses: 0,
    controlInflicted: 0,
    controlSuffered: 0,
    dodgesAttempted: 0,
    dodgesSucceeded: 0,
    protectionPrevented: 0,
    blockedByActiveState: 0,
    blockedByCooldown: 0,
    cooldownViolations: 0,
  };
}

function emptyActionState(): ActionRuntimeState {
  return {
    cooldownDie: null,
    cooldownPlacedThisOwnerTurn: false,
    activeRemainingOwnerTurns: 0,
    activeStartedThisOwnerTurn: false,
    awaitingFinalResolutionWindow: false,
    uses: 0,
    blockedByActiveState: 0,
    blockedByCooldown: 0,
    usageAttempts: 0,
  };
}

function addStatMap(
  target: Record<string, number>,
  source: Record<string, number>,
): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function topEntry(input: Record<string, number>): string | null {
  let best: { key: string; value: number } | null = null;
  for (const [key, value] of Object.entries(input)) {
    if (!best || value > best.value) {
      best = { key, value };
    }
  }
  return best ? `${best.key} (${best.value})` : null;
}

function expectedUnmitigatedWounds(action: ResolvedAction): number {
  return action.diceCount * pSuccess(action.dieSize) * action.potency;
}

function expectedControlTurns(action: ResolvedAction): number {
  return action.controlTurns * pSuccess(action.dieSize);
}

function expectedActionScore(action: ResolvedAction): number {
  return expectedUnmitigatedWounds(action) + expectedControlTurns(action) * 2;
}

function expectedDamage(action: ResolvedAction, target: CombatantRuntime): number {
  const raw = expectedUnmitigatedWounds(action);
  const afterDodge = raw * (1 - target.fixture.dodgeChance);
  return Math.max(0, afterDodge - target.fixture.physicalProtection);
}

function isActiveBlocked(state: ActionRuntimeState): boolean {
  return (
    state.activeRemainingOwnerTurns > 0 ||
    state.activeStartedThisOwnerTurn ||
    state.awaitingFinalResolutionWindow
  );
}

function isCooling(state: ActionRuntimeState): boolean {
  return state.cooldownDie !== null;
}

function isActionAvailable(
  action: ResolvedAction,
  actor: CombatantRuntime,
): boolean {
  if (action.lifecycle === "basic") return true;
  const state = actor.actionStates[action.id];
  return state ? !isActiveBlocked(state) && !isCooling(state) : true;
}

function recordBlockedActions(actor: CombatantRuntime): void {
  for (const action of actor.actions) {
    if (action.lifecycle === "basic") continue;
    const state = actor.actionStates[action.id];
    if (!state) continue;
    if (isActiveBlocked(state)) {
      state.blockedByActiveState += 1;
      actor.stats.blockedByActiveState += 1;
    } else if (isCooling(state)) {
      state.blockedByCooldown += 1;
      actor.stats.blockedByCooldown += 1;
    }
  }
}

function chooseAction(
  actor: CombatantRuntime,
  target: CombatantRuntime,
): ResolvedAction {
  recordBlockedActions(actor);
  const available = actor.actions.filter((action) =>
    isActionAvailable(action, actor),
  );
  const legalActions = available.length > 0 ? available : actor.actions;

  const targetHp = target.currentHp;
  const ranked = legalActions.map((action, index) => {
    const expectedWounds = expectedDamage(action, target);
    const expectedControl = expectedControlTurns(action);
    const lethal = expectedWounds >= targetHp ? 1000 : 0;
    const score = lethal + expectedWounds + expectedControl * 2;
    return { action, index, score };
  });

  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0]?.action ?? actor.actions[0];
}

function rollSuccesses(action: ResolvedAction, rng: SeededRng): number {
  let successes = 0;
  const sides = diceSides(action.dieSize);
  for (let i = 0; i < action.diceCount; i += 1) {
    if (rng.intInclusive(1, sides) >= SUCCESS_THRESHOLD) successes += 1;
  }
  return successes;
}

function placeCooldown(
  state: ActionRuntimeState,
  action: ResolvedAction,
  placedDuringOwnerTurn: boolean,
): void {
  if (!action.derivedCooldownTurns || action.derivedCooldownTurns <= 0) return;
  state.cooldownDie = action.derivedCooldownTurns;
  state.cooldownPlacedThisOwnerTurn = placedDuringOwnerTurn;
}

function tickOwnerCooldowns(owner: CombatantRuntime): void {
  for (const action of owner.actions) {
    if (action.lifecycle === "basic") continue;
    const state = owner.actionStates[action.id];
    if (!state || state.cooldownDie === null) continue;
    if (state.cooldownPlacedThisOwnerTurn) {
      state.cooldownPlacedThisOwnerTurn = false;
      continue;
    }
    if (state.cooldownDie > 1) {
      state.cooldownDie -= 1;
    } else {
      state.cooldownDie = null;
    }
  }
}

function advanceOwnerActiveLifespans(owner: CombatantRuntime): void {
  for (const action of owner.actions) {
    if (action.lifecycle !== "lifespan") continue;
    const state = owner.actionStates[action.id];
    if (!state) continue;
    if (state.activeStartedThisOwnerTurn) {
      state.activeStartedThisOwnerTurn = false;
      continue;
    }
    if (state.activeRemainingOwnerTurns <= 0) continue;
    state.activeRemainingOwnerTurns -= 1;
    if (state.activeRemainingOwnerTurns === 0) {
      state.awaitingFinalResolutionWindow = true;
    }
  }
}

function closeOpponentFinalResolutionWindows(
  justFinished: CombatantRuntime,
  opponent: CombatantRuntime,
): void {
  void justFinished;
  for (const action of opponent.actions) {
    if (action.lifecycle !== "lifespan") continue;
    const state = opponent.actionStates[action.id];
    if (!state?.awaitingFinalResolutionWindow) continue;
    state.awaitingFinalResolutionWindow = false;
    placeCooldown(state, action, false);
  }
}

function endTurnLifecycle(
  owner: CombatantRuntime,
  opponent: CombatantRuntime,
): void {
  advanceOwnerActiveLifespans(owner);
  tickOwnerCooldowns(owner);
  closeOpponentFinalResolutionWindows(owner, opponent);
}

function useAction(
  actor: CombatantRuntime,
  target: CombatantRuntime,
  action: ResolvedAction,
  rng: SeededRng,
): void {
  const state = actor.actionStates[action.id];
  if (state) {
    state.usageAttempts += 1;
    if (isActiveBlocked(state) || isCooling(state)) {
      actor.stats.cooldownViolations += 1;
    }
    state.uses += 1;
  }

  actor.stats.actionUses[action.name] =
    (actor.stats.actionUses[action.name] ?? 0) + 1;
  if (action.lifecycle !== "basic") {
    actor.stats.powerUses[action.name] =
      (actor.stats.powerUses[action.name] ?? 0) + 1;
  }

  const successes = rollSuccesses(action, rng);
  if (action.type === "controlPower") {
    actor.stats.controlAttempts += 1;
  }

  let wounds = successes * action.potency;
  if (wounds > 0) {
    target.stats.dodgesAttempted += 1;
    if (rng.next() < target.fixture.dodgeChance) {
      target.stats.dodgesSucceeded += 1;
      wounds = 0;
    }
  }

  if (wounds > 0) {
    const beforeProtection = wounds;
    wounds = Math.max(0, wounds - target.fixture.physicalProtection);
    target.stats.protectionPrevented += beforeProtection - wounds;
  }

  if (wounds > 0) {
    target.currentHp = Math.max(0, target.currentHp - wounds);
    actor.stats.woundsDealt += wounds;
    actor.stats.largestSpike = Math.max(actor.stats.largestSpike, wounds);
  }

  if (action.type === "controlPower" && successes > 0 && action.controlTurns > 0) {
    target.deniedTurns += action.controlTurns;
    actor.stats.controlSuccesses += 1;
    actor.stats.controlInflicted += action.controlTurns;
  }

  if (!state) return;
  if (action.lifecycle === "immediate") {
    placeCooldown(state, action, true);
  } else if (action.lifecycle === "lifespan") {
    state.activeRemainingOwnerTurns = Math.max(1, action.lifespanTurns ?? 1);
    state.activeStartedThisOwnerTurn = true;
    state.awaitingFinalResolutionWindow = false;
  } else if (action.lifecycle === "passive") {
    state.activeRemainingOwnerTurns = Number.POSITIVE_INFINITY;
    state.activeStartedThisOwnerTurn = true;
  }
}

function takeTurn(
  actor: CombatantRuntime,
  target: CombatantRuntime,
  rng: SeededRng,
): void {
  if (actor.deniedTurns > 0) {
    actor.deniedTurns -= 1;
    actor.stats.controlSuffered += 1;
    recordBlockedActions(actor);
    endTurnLifecycle(actor, target);
    return;
  }

  const action = chooseAction(actor, target);
  useAction(actor, target, action, rng);
  endTurnLifecycle(actor, target);
}

function makeRuntime(
  fixture: SmokeMonsterFixture,
  resolvedActions: ResolvedAction[],
): CombatantRuntime {
  const actionStates = Object.fromEntries(
    resolvedActions
      .filter((action) => action.lifecycle !== "basic")
      .map((action) => [action.id, emptyActionState()]),
  );
  return {
    fixture,
    currentHp: fixture.physicalHp,
    deniedTurns: 0,
    actions: resolvedActions,
    actionStates,
    stats: emptyStats(),
  };
}

function simulateRun(
  first: SmokeMonsterFixture,
  second: SmokeMonsterFixture,
  resolved: Map<string, ResolvedAction[]>,
  seed: number,
): RunResult {
  const rng = new SeededRng(seed);
  const firstRuntime = makeRuntime(first, resolved.get(first.id) ?? []);
  const secondRuntime = makeRuntime(second, resolved.get(second.id) ?? []);
  let rounds = 0;

  for (rounds = 1; rounds <= MAX_ROUNDS; rounds += 1) {
    takeTurn(firstRuntime, secondRuntime, rng);
    if (secondRuntime.currentHp <= 0) {
      return {
        winnerId: first.id,
        rounds,
        timedOut: false,
        first: firstRuntime.stats,
        second: secondRuntime.stats,
      };
    }

    takeTurn(secondRuntime, firstRuntime, rng);
    if (firstRuntime.currentHp <= 0) {
      return {
        winnerId: second.id,
        rounds,
        timedOut: false,
        first: firstRuntime.stats,
        second: secondRuntime.stats,
      };
    }
  }

  return {
    winnerId: null,
    rounds: MAX_ROUNDS,
    timedOut: true,
    first: firstRuntime.stats,
    second: secondRuntime.stats,
  };
}

function resolveFixtureActions(
  fixture: SmokeMonsterFixture,
  powerTuning: SnapshotPayload,
): ResolvedAction[] {
  const powerActions = fixture.actions.filter((action) => action.power);
  const resolved = resolvePowerCosts(
    powerActions.map((action) => action.power as Power),
    {
      setId: "active-power-tuning",
      name: powerTuning.name,
      values: normalizePowerTuningValues(powerTuning.values),
    },
    { level: fixture.level, tier: fixture.tier },
  );

  let powerIndex = 0;
  return fixture.actions.map((action) => {
    if (!action.power) {
      return {
        ...action,
        derivedCooldownTurns: null,
        cooldownSource: "none",
        basePowerValue: null,
      };
    }

    const resolvedPower = resolved.powers[powerIndex];
    powerIndex += 1;
    return {
      ...action,
      derivedCooldownTurns: resolvedPower?.derivedCooldownTurns ?? null,
      cooldownSource: "derived",
      basePowerValue: resolvedPower?.breakdown.basePowerValue ?? null,
    };
  });
}

function aggregateMatchup(
  first: SmokeMonsterFixture,
  second: SmokeMonsterFixture,
  resolved: Map<string, ResolvedAction[]>,
  matchupIndex: number,
): MatchupAggregate {
  let firstWins = 0;
  let secondWins = 0;
  let draws = 0;
  let rounds = 0;
  let firstWounds = 0;
  let secondWounds = 0;
  let largestSingleTurnSpike = 0;
  let firstControlAttempts = 0;
  let secondControlAttempts = 0;
  let firstControlSuccesses = 0;
  let secondControlSuccesses = 0;
  let firstControlInflicted = 0;
  let secondControlInflicted = 0;
  let firstControlSuffered = 0;
  let secondControlSuffered = 0;
  let firstActiveBlocked = 0;
  let secondActiveBlocked = 0;
  let firstCooldownBlocked = 0;
  let secondCooldownBlocked = 0;
  let firstCooldownViolations = 0;
  let secondCooldownViolations = 0;
  let firstDodgesAttempted = 0;
  let firstDodgesSucceeded = 0;
  let secondDodgesAttempted = 0;
  let secondDodgesSucceeded = 0;
  const firstActionUses: Record<string, number> = {};
  const secondActionUses: Record<string, number> = {};
  const firstPowerUses: Record<string, number> = {};
  const secondPowerUses: Record<string, number> = {};

  for (let run = 0; run < RUNS_PER_MATCHUP; run += 1) {
    const firstActsFirst = run % 2 === 0;
    const left = firstActsFirst ? first : second;
    const right = firstActsFirst ? second : first;
    const result = simulateRun(
      left,
      right,
      resolved,
      BASE_SEED + matchupIndex * 10_000 + run,
    );

    const firstStats = firstActsFirst ? result.first : result.second;
    const secondStats = firstActsFirst ? result.second : result.first;

    if (result.winnerId === first.id) firstWins += 1;
    else if (result.winnerId === second.id) secondWins += 1;
    else draws += 1;

    rounds += result.rounds;
    firstWounds += firstStats.woundsDealt;
    secondWounds += secondStats.woundsDealt;
    largestSingleTurnSpike = Math.max(
      largestSingleTurnSpike,
      firstStats.largestSpike,
      secondStats.largestSpike,
    );
    firstControlAttempts += firstStats.controlAttempts;
    secondControlAttempts += secondStats.controlAttempts;
    firstControlSuccesses += firstStats.controlSuccesses;
    secondControlSuccesses += secondStats.controlSuccesses;
    firstControlInflicted += firstStats.controlInflicted;
    secondControlInflicted += secondStats.controlInflicted;
    firstControlSuffered += firstStats.controlSuffered;
    secondControlSuffered += secondStats.controlSuffered;
    firstActiveBlocked += firstStats.blockedByActiveState;
    secondActiveBlocked += secondStats.blockedByActiveState;
    firstCooldownBlocked += firstStats.blockedByCooldown;
    secondCooldownBlocked += secondStats.blockedByCooldown;
    firstCooldownViolations += firstStats.cooldownViolations;
    secondCooldownViolations += secondStats.cooldownViolations;
    firstDodgesAttempted += firstStats.dodgesAttempted;
    firstDodgesSucceeded += firstStats.dodgesSucceeded;
    secondDodgesAttempted += secondStats.dodgesAttempted;
    secondDodgesSucceeded += secondStats.dodgesSucceeded;
    addStatMap(firstActionUses, firstStats.actionUses);
    addStatMap(secondActionUses, secondStats.actionUses);
    addStatMap(firstPowerUses, firstStats.powerUses);
    addStatMap(secondPowerUses, secondStats.powerUses);
  }

  const averageRounds = rounds / RUNS_PER_MATCHUP;
  const firstAverageWounds = firstWounds / RUNS_PER_MATCHUP;
  const secondAverageWounds = secondWounds / RUNS_PER_MATCHUP;
  const firstAverageWoundsPerRound = firstWounds / Math.max(1, rounds);
  const secondAverageWoundsPerRound = secondWounds / Math.max(1, rounds);
  const firstDefensiveSuccessRate =
    firstDodgesAttempted > 0 ? firstDodgesSucceeded / firstDodgesAttempted : null;
  const secondDefensiveSuccessRate =
    secondDodgesAttempted > 0
      ? secondDodgesSucceeded / secondDodgesAttempted
      : null;

  const aggregate: MatchupAggregate = {
    first,
    second,
    runs: RUNS_PER_MATCHUP,
    firstWins,
    secondWins,
    draws,
    averageRounds,
    firstAverageWounds,
    secondAverageWounds,
    firstAverageWoundsPerRound,
    secondAverageWoundsPerRound,
    largestSingleTurnSpike,
    firstActionUses,
    secondActionUses,
    firstPowerUses,
    secondPowerUses,
    firstMostUsedAction: topEntry(firstActionUses),
    secondMostUsedAction: topEntry(secondActionUses),
    firstControlAttempts,
    secondControlAttempts,
    firstControlSuccesses,
    secondControlSuccesses,
    firstControlInflicted,
    secondControlInflicted,
    firstControlSuffered,
    secondControlSuffered,
    firstDefensiveSuccessRate,
    secondDefensiveSuccessRate,
    firstActiveBlocked,
    secondActiveBlocked,
    firstCooldownBlocked,
    secondCooldownBlocked,
    firstCooldownViolations,
    secondCooldownViolations,
    warnings: [],
  };
  aggregate.warnings = buildWarnings(aggregate);
  return aggregate;
}

function totalActions(actions: Record<string, number>): number {
  return Object.values(actions).reduce((sum, value) => sum + value, 0);
}

function highestActionShare(actions: Record<string, number>): number {
  const total = totalActions(actions);
  if (total <= 0) return 0;
  return Math.max(...Object.values(actions)) / total;
}

function actionUsePercentages(actions: Record<string, number>): Record<string, string> {
  const total = totalActions(actions);
  if (total <= 0) return {};
  return Object.fromEntries(
    Object.entries(actions).map(([name, count]) => [name, percent(count / total)]),
  );
}

function buildWarnings(matchup: MatchupAggregate): string[] {
  const warnings: string[] = [];
  const firstWinRate = matchup.firstWins / matchup.runs;
  const secondWinRate = matchup.secondWins / matchup.runs;
  const firstSpikeShare = matchup.largestSingleTurnSpike / matchup.second.physicalHp;
  const secondSpikeShare = matchup.largestSingleTurnSpike / matchup.first.physicalHp;
  const firstActionShare = highestActionShare(matchup.firstActionUses);
  const secondActionShare = highestActionShare(matchup.secondActionUses);
  const totalDeniedTurns =
    matchup.firstControlInflicted + matchup.secondControlInflicted;
  const defenderInvolved =
    matchup.first.id === "defender" || matchup.second.id === "defender";

  if (firstWinRate > 0.7) {
    warnings.push(`${matchup.first.name} win rate exceeds 70%`);
  }
  if (secondWinRate > 0.7) {
    warnings.push(`${matchup.second.name} win rate exceeds 70%`);
  }
  if (matchup.averageRounds < 2) {
    warnings.push("average fight length is under 2 rounds");
  }
  if (matchup.averageRounds > 12) {
    warnings.push("average fight length exceeds 12 rounds");
  }
  if (firstSpikeShare > 0.5 || secondSpikeShare > 0.5) {
    warnings.push("largest single-turn spike exceeds 50% of a target HP pool");
  }
  if (firstActionShare > 0.8) {
    warnings.push(`${matchup.first.name} has one action above 80% usage`);
  }
  if (secondActionShare > 0.8) {
    warnings.push(`${matchup.second.name} has one action above 80% usage`);
  }
  if (totalDeniedTurns / matchup.runs > 4) {
    warnings.push("controller-style denial exceeds 4 denied turns per run");
  }
  if (
    defenderInvolved &&
    matchup.averageRounds > 10 &&
    matchup.firstAverageWoundsPerRound + matchup.secondAverageWoundsPerRound < 4
  ) {
    warnings.push("defender matchup is a very long low-damage fight");
  }
  if (matchup.firstCooldownViolations + matchup.secondCooldownViolations > 0) {
    warnings.push("a power was used while active or cooling");
  }

  return warnings;
}

function powerAction(config: {
  id: string;
  name: string;
  type: Exclude<ActionType, "basicAttack">;
  lifecycle: Exclude<ActionLifecycle, "basic">;
  lifecycleLabel: string;
  diceCount: number;
  dieSize: DiceSize;
  potency: number;
  controlTurns?: number;
  lifespanTurns?: number | null;
  intention: PowerIntention;
  detailsJson: Record<string, unknown>;
  sortOrder: number;
}): ActionDefinition {
  return {
    id: config.id,
    name: config.name,
    type: config.type,
    lifecycle: config.lifecycle,
    lifecycleLabel: config.lifecycleLabel,
    diceCount: config.diceCount,
    dieSize: config.dieSize,
    potency: config.potency,
    controlTurns: config.controlTurns ?? 0,
    lifespanTurns: config.lifecycle === "lifespan" ? (config.lifespanTurns ?? 1) : null,
    power: createPower({
      sortOrder: config.sortOrder,
      name: config.name,
      intention: config.intention,
      diceCount: config.diceCount,
      potency: config.potency,
      lifecycle: config.lifecycle,
      lifespanTurns: config.lifespanTurns ?? null,
      detailsJson: config.detailsJson,
    }),
  };
}

function basicAttack(config: {
  id: string;
  name: string;
  diceCount: number;
  dieSize: DiceSize;
  potency: number;
}): ActionDefinition {
  return {
    ...config,
    type: "basicAttack",
    lifecycle: "basic",
    lifecycleLabel: "At-will basic action",
    controlTurns: 0,
    lifespanTurns: null,
  };
}

function createFixtures(): SmokeMonsterFixture[] {
  return [
    {
      id: "bruiser",
      name: "Bruiser",
      role: "Reliable physical threat with moderate durability",
      level: LEVEL,
      tier: TIER,
      legendary: false,
      physicalHp: 34,
      physicalProtection: 1,
      dodgeChance: 0.15,
      actions: [
        basicAttack({
          id: "bruiser-basic",
          name: "Heavy Maul",
          diceCount: 3,
          dieSize: "D8",
          potency: 2,
        }),
        powerAction({
          id: "bruiser-power",
          name: "Crushing Rush",
          type: "powerAttack",
          lifecycle: "immediate",
          lifecycleLabel: "Immediate",
          diceCount: 4,
          dieSize: "D8",
          potency: 3,
          intention: "ATTACK",
          sortOrder: 0,
          detailsJson: {
            attackMode: "PHYSICAL",
            damageTypes: ["Bludgeoning"],
            rangeCategory: "MELEE",
          },
        }),
      ],
    },
    {
      id: "glass-cannon",
      name: "Glass Cannon",
      role: "High offence with a thin physical pool",
      level: LEVEL,
      tier: TIER,
      legendary: false,
      physicalHp: 28,
      physicalProtection: 0,
      dodgeChance: 0.1,
      actions: [
        basicAttack({
          id: "glass-basic",
          name: "Volatile Strike",
          diceCount: 3,
          dieSize: "D10",
          potency: 3,
        }),
        powerAction({
          id: "glass-power",
          name: "Focused Ruin",
          type: "powerAttack",
          lifecycle: "immediate",
          lifecycleLabel: "Immediate",
          diceCount: 5,
          dieSize: "D10",
          potency: 4,
          intention: "ATTACK",
          sortOrder: 0,
          detailsJson: {
            attackMode: "PHYSICAL",
            damageTypes: ["Fire", "Piercing"],
            rangeCategory: "RANGED",
          },
        }),
      ],
    },
    {
      id: "defender",
      name: "Defender",
      role: "High survivability with lower offence",
      level: LEVEL,
      tier: TIER,
      legendary: false,
      physicalHp: 46,
      physicalProtection: 3,
      dodgeChance: 0.2,
      actions: [
        basicAttack({
          id: "defender-basic",
          name: "Shield Bash",
          diceCount: 2,
          dieSize: "D8",
          potency: 2,
        }),
        powerAction({
          id: "defender-power",
          name: "Guarded Counterblow",
          type: "powerAttack",
          lifecycle: "immediate",
          lifecycleLabel: "Immediate",
          diceCount: 3,
          dieSize: "D8",
          potency: 2,
          intention: "ATTACK",
          sortOrder: 0,
          detailsJson: {
            attackMode: "PHYSICAL",
            damageTypes: ["Bludgeoning"],
            rangeCategory: "MELEE",
          },
        }),
      ],
    },
    {
      id: "controller",
      name: "Controller",
      role: "Lower damage with a denial power",
      level: LEVEL,
      tier: TIER,
      legendary: false,
      physicalHp: 34,
      physicalProtection: 1,
      dodgeChance: 0.15,
      actions: [
        basicAttack({
          id: "controller-basic",
          name: "Staff Jab",
          diceCount: 2,
          dieSize: "D8",
          potency: 2,
        }),
        powerAction({
          id: "controller-lock",
          name: "Lockdown",
          type: "controlPower",
          lifecycle: "lifespan",
          lifecycleLabel: "Attached-style Lifespan Turns",
          diceCount: 3,
          dieSize: "D10",
          potency: 0,
          controlTurns: 1,
          lifespanTurns: 1,
          intention: "CONTROL",
          sortOrder: 0,
          detailsJson: {
            controlMode: "LOCKDOWN",
            rangeCategory: "RANGED",
          },
        }),
        powerAction({
          id: "controller-pulse",
          name: "Punishing Pulse",
          type: "powerAttack",
          lifecycle: "immediate",
          lifecycleLabel: "Immediate",
          diceCount: 4,
          dieSize: "D8",
          potency: 3,
          intention: "ATTACK",
          sortOrder: 1,
          detailsJson: {
            attackMode: "PHYSICAL",
            damageTypes: ["Force"],
            rangeCategory: "RANGED",
          },
        }),
      ],
    },
  ];
}

function printCooldownLifecycleSemantics(): void {
  console.log("\n## Cooldown Lifecycle Semantics");
  console.log("- Cooldown value is the number placed on the cooldown die once cooldown begins.");
  console.log("- Cooldown begins only after a power has completely resolved.");
  console.log("- Immediate powers enter cooldown after immediate resolution.");
  console.log("- Lifespan powers stay active first and enter cooldown after the final resolution window closes.");
  console.log("- Cooldown dice tick at the end of each subsequent owner turn.");
  console.log("- If a cooldown die showing 1 would tick, it is removed; the power is ready on the owner's next turn or legal Response window.");
  console.log("- Therefore cooldown 1 does not mean available on the next own turn in this smoke model.");
  console.log("- v0.1 approximates 1v1 final-resolution-window closure after the opponent completes the relevant turn in the final lifespan round.");
  console.log("- Passive powers are not exercised; they do not enter cooldown from time passing.");
  console.log("- Counters/Assists follow the same lifecycle but Response simulation is out of scope.");
  console.log("- Charge is front-loaded and out of scope for these fixtures.");
}

function printSimplifications(): void {
  console.log("\n## Known v0.1 Simplifications");
  console.log("- physical HP only");
  console.log("- no Major Injury");
  console.log("- no terrain, range, objectives, or party logic");
  console.log("- no response economy");
  console.log("- no defence degradation");
  console.log("- no full ongoing effect engine");
  console.log("- simplified control and no Cleanse/Resist ending active effects yet");
  console.log("- deterministic expected-value AI with seeded stochastic resolution");
  console.log("- synthetic smoke dummies, not final balance exemplars");
  console.log("- final-resolution-window handling is an explicit 1v1 approximation");
}

function printFixtureSummary(
  fixtures: SmokeMonsterFixture[],
  resolved: Map<string, ResolvedAction[]>,
): void {
  console.log("\n## Synthetic Fixture Summary");
  for (const fixture of fixtures) {
    const actions = resolved.get(fixture.id) ?? [];
    console.log(
      `- ${fixture.name}: L${fixture.level} ${fixture.tier}, HP ${fixture.physicalHp}, PP ${fixture.physicalProtection}, dodge ${round(fixture.dodgeChance * 100, 1)}%`,
    );
    console.log(`  role: ${fixture.role}`);
    for (const action of actions) {
      const cooldown =
        action.cooldownSource === "derived"
          ? `${action.derivedCooldownTurns} turn(s), derived from BPV ${action.basePowerValue}`
          : "none";
      const control =
        action.controlTurns > 0 ? `, control ${action.controlTurns} turn(s)` : "";
      const lifespan =
        action.lifecycle === "lifespan"
          ? `, lifespan ${action.lifespanTurns} turn(s)`
          : "";
      console.log(
        `  action: ${action.name} [${action.type}], lifecycle ${action.lifecycleLabel}${lifespan}, ${action.diceCount}${action.dieSize} x ${action.potency} wounds/success${control}, cooldown ${cooldown}, expected wounds ${round(expectedUnmitigatedWounds(action))}, expected score ${round(expectedActionScore(action))}`,
      );
    }
  }
}

function printMatchup(aggregate: MatchupAggregate): void {
  const firstWinRate = round((aggregate.firstWins / aggregate.runs) * 100, 1);
  const secondWinRate = round((aggregate.secondWins / aggregate.runs) * 100, 1);
  const drawRate = round((aggregate.draws / aggregate.runs) * 100, 1);

  console.log(`\n## ${aggregate.first.name} vs ${aggregate.second.name}`);
  console.log(
    `runs ${aggregate.runs} | win rate ${aggregate.first.name} ${firstWinRate}% / ${aggregate.second.name} ${secondWinRate}% / draw ${drawRate}%`,
  );
  console.log(
    `avg rounds ${round(aggregate.averageRounds)} | avg wounds ${aggregate.first.name} ${round(aggregate.firstAverageWounds)} / ${aggregate.second.name} ${round(aggregate.secondAverageWounds)}`,
  );
  console.log(
    `avg wounds/round ${aggregate.first.name} ${round(aggregate.firstAverageWoundsPerRound)} / ${aggregate.second.name} ${round(aggregate.secondAverageWoundsPerRound)} | largest spike ${aggregate.largestSingleTurnSpike}`,
  );
  console.log(
    `action uses ${aggregate.first.name}: ${JSON.stringify(aggregate.firstActionUses)} | ${aggregate.second.name}: ${JSON.stringify(aggregate.secondActionUses)}`,
  );
  console.log(
    `action use % ${aggregate.first.name}: ${JSON.stringify(actionUsePercentages(aggregate.firstActionUses))} | ${aggregate.second.name}: ${JSON.stringify(actionUsePercentages(aggregate.secondActionUses))}`,
  );
  console.log(
    `most-used action ${aggregate.first.name}: ${aggregate.firstMostUsedAction ?? "none"} | ${aggregate.second.name}: ${aggregate.secondMostUsedAction ?? "none"}`,
  );
  console.log(
    `power uses ${aggregate.first.name}: ${JSON.stringify(aggregate.firstPowerUses)} | ${aggregate.second.name}: ${JSON.stringify(aggregate.secondPowerUses)}`,
  );
  console.log(
    `control attempts/successes ${aggregate.first.name}: ${aggregate.firstControlAttempts}/${aggregate.firstControlSuccesses} | ${aggregate.second.name}: ${aggregate.secondControlAttempts}/${aggregate.secondControlSuccesses}`,
  );
  console.log(
    `control denied turns inflicted ${aggregate.first.name}: ${aggregate.firstControlInflicted} | ${aggregate.second.name}: ${aggregate.secondControlInflicted}`,
  );
  console.log(
    `blocked by active state ${aggregate.first.name}: ${aggregate.firstActiveBlocked} | ${aggregate.second.name}: ${aggregate.secondActiveBlocked}`,
  );
  console.log(
    `blocked by cooldown ${aggregate.first.name}: ${aggregate.firstCooldownBlocked} | ${aggregate.second.name}: ${aggregate.secondCooldownBlocked}`,
  );
  console.log(
    `defensive dodge success ${aggregate.first.name}: ${formatRate(aggregate.firstDefensiveSuccessRate)} | ${aggregate.second.name}: ${formatRate(aggregate.secondDefensiveSuccessRate)}`,
  );
  console.log(
    `cooldown violations ${aggregate.first.name}: ${aggregate.firstCooldownViolations} | ${aggregate.second.name}: ${aggregate.secondCooldownViolations}`,
  );
  if (aggregate.warnings.length > 0) {
    console.log("warnings:");
    for (const warning of aggregate.warnings) {
      console.log(`- ${warning}`);
    }
  } else {
    console.log("warnings: none");
  }
}

function formatRate(value: number | null): string {
  return value === null ? "n/a" : percent(value);
}

function main(): void {
  const powerTuning = readSnapshot(ACTIVE_POWER_TUNING_PATH);
  const fixtures = createFixtures();
  const resolved = new Map(
    fixtures.map((fixture) => [
      fixture.id,
      resolveFixtureActions(fixture, powerTuning),
    ]),
  );

  console.log("Combat Smoke Test v0.1");
  console.log("Read-only diagnostic using synthetic fixtures.");
  console.log(`Active Power Tuning: ${ACTIVE_POWER_TUNING_PATH} (${powerTuning.name ?? "unnamed"})`);
  console.log(
    `Scope: 1v1, level ${LEVEL}, tier ${TIER}, non-legendary, flat arena, ${RUNS_PER_MATCHUP} seeded simulations per matchup, max ${MAX_ROUNDS} rounds.`,
  );

  printCooldownLifecycleSemantics();
  printSimplifications();
  printFixtureSummary(fixtures, resolved);

  const aggregates: MatchupAggregate[] = [];
  let matchupIndex = 0;
  for (let i = 0; i < fixtures.length; i += 1) {
    for (let j = i + 1; j < fixtures.length; j += 1) {
      const aggregate = aggregateMatchup(
        fixtures[i],
        fixtures[j],
        resolved,
        matchupIndex,
      );
      aggregates.push(aggregate);
      printMatchup(aggregate);
      matchupIndex += 1;
    }
  }

  const warnings = aggregates.flatMap((aggregate) =>
    aggregate.warnings.map(
      (warning) => `${aggregate.first.name} vs ${aggregate.second.name}: ${warning}`,
    ),
  );

  console.log("\n## Summary");
  console.log(`Matchups: ${aggregates.length}`);
  console.log(`Runs per matchup: ${RUNS_PER_MATCHUP}`);
  console.log(`Outlier warnings: ${warnings.length}`);
  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }
  console.log("Exit status: 0 (report-only smoke diagnostic).");
}

main();
