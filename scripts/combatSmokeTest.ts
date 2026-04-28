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
const BASE_SEED = 0x5a17c0de;

type SnapshotPayload = {
  name: string | null;
  values: Record<string, unknown>;
};

type ActionType = "basicAttack" | "powerAttack" | "controlPower";
type ActionLifecycle = "basic" | "immediate" | "lifespan" | "passive";
type ActionSlot = "main" | "power";
type ControlEffectType =
  | "forceMove"
  | "forceNoMove"
  | "forceSpecificMainAction"
  | "forceNoMainAction"
  | "forceSpecificPowerAction"
  | "forceNoPowerAction";

type ControlRestrictions = {
  noMainActionTurns: number;
  noPowerActionTurns: number;
  noMoveTurns: number;
};

type ActionAttributionType =
  | "main weapon"
  | "Power Action weapon fallback"
  | "power attack"
  | "control power";

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
  controlEffectType: ControlEffectType | null;
  controlTheme: string | null;
  controlResistAttribute: string | null;
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
  dodgeDice: number;
  dodgeDieSize: DiceSize;
  guardDice: number;
  guardDieSize: DiceSize;
  physicalDefenceStringValue: number;
  willpowerDice: number;
  willpowerDieSize: DiceSize;
  mentalDefenceStringValue: number;
  controlResistDice: number;
  controlResistDieSize: DiceSize;
  controlResistAttribute: string;
  powerActionWeaponAttackId: string | null;
  actions: ActionDefinition[];
};

type DefenceChoice = "dodge" | "defend";

type RoundDefenceState = {
  dodgeDegradation: number;
  defendDegradation: number;
  mentalDefenceDegradation: number;
};

type CombatantRuntime = {
  fixture: SmokeMonsterFixture;
  currentHp: number;
  controlRestrictions: ControlRestrictions;
  roundDefenceState: RoundDefenceState;
  actions: ResolvedAction[];
  powerActionWeaponAttack: ResolvedAction | null;
  actionStates: Record<string, ActionRuntimeState>;
  stats: CombatantStats;
};

type CombatantStats = {
  woundsDealt: number;
  largestSpike: number;
  actionUses: Record<string, number>;
  actionSpikeStats: Record<string, ActionSpikeStats>;
  powerUses: Record<string, number>;
  controlAttempts: number;
  controlResisted: number;
  controlLanded: number;
  controlMainActionsBlocked: number;
  controlPowerActionsBlocked: number;
  controlMoveBlocked: number;
  dodgesAttempted: number;
  dodgesSucceeded: number;
  dodgesFailed: number;
  defendAttempts: number;
  defendWoundsPrevented: number;
  dodgeDegradationUses: number;
  defendDegradationUses: number;
  mentalDefenceAttempts: number;
  mentalDefenceWoundsPrevented: number;
  mentalDefenceDegradationUses: number;
  blockedByActiveState: number;
  blockedByCooldown: number;
  powerActionWeaponFallbackUses: number;
  cooldownViolations: number;
};

type ActionSpikeStats = {
  actionName: string;
  actionType: ActionAttributionType;
  uses: number;
  totalWounds: number;
  maxWounds: number;
  spike25PercentHpUses: number;
  spike50PercentHpUses: number;
  spike75PercentHpUses: number;
  lethalHits: number;
};

type RunResult = {
  winnerId: string | null;
  rounds: number;
  timedOut: boolean;
  first: CombatantStats;
  second: CombatantStats;
};

type RoundLengthStats = {
  totalFights: number;
  averageRounds: number;
  medianRounds: number;
  minRounds: number;
  maxRounds: number;
  timeoutCount: number;
  timeoutPercent: number;
  rounds1To2Percent: number;
  rounds3To5Percent: number;
  rounds6To8Percent: number;
  rounds9To12Percent: number;
  rounds13PlusPercent: number;
};

type MatchupExpectationClassification =
  | "representative"
  | "expected-role-friction"
  | "party-dependent-edge-case";

type MatchupExpectation = {
  classification: MatchupExpectationClassification;
  reason: string;
};

type MatchupAggregate = {
  first: SmokeMonsterFixture;
  second: SmokeMonsterFixture;
  expectation: MatchupExpectation;
  runs: number;
  firstWins: number;
  secondWins: number;
  draws: number;
  averageRounds: number;
  roundLengths: number[];
  roundLengthStats: RoundLengthStats;
  firstAverageWounds: number;
  secondAverageWounds: number;
  firstAverageWoundsPerRound: number;
  secondAverageWoundsPerRound: number;
  largestSingleTurnSpike: number;
  firstActionUses: Record<string, number>;
  secondActionUses: Record<string, number>;
  firstActionSpikeStats: Record<string, ActionSpikeStats>;
  secondActionSpikeStats: Record<string, ActionSpikeStats>;
  firstPowerUses: Record<string, number>;
  secondPowerUses: Record<string, number>;
  firstMostUsedAction: string | null;
  secondMostUsedAction: string | null;
  firstControlAttempts: number;
  secondControlAttempts: number;
  firstControlResisted: number;
  secondControlResisted: number;
  firstControlLanded: number;
  secondControlLanded: number;
  firstMainActionsBlocked: number;
  secondMainActionsBlocked: number;
  firstPowerActionsBlocked: number;
  secondPowerActionsBlocked: number;
  firstMoveBlocked: number;
  secondMoveBlocked: number;
  firstDodgeSuccessRate: number | null;
  secondDodgeSuccessRate: number | null;
  firstDodgeAttempts: number;
  secondDodgeAttempts: number;
  firstDodgeSuccesses: number;
  secondDodgeSuccesses: number;
  firstDodgeFailures: number;
  secondDodgeFailures: number;
  firstDefendAttempts: number;
  secondDefendAttempts: number;
  firstDefendWoundsPrevented: number;
  secondDefendWoundsPrevented: number;
  firstDodgeDegradationUses: number;
  secondDodgeDegradationUses: number;
  firstDefendDegradationUses: number;
  secondDefendDegradationUses: number;
  firstActiveBlocked: number;
  secondActiveBlocked: number;
  firstCooldownBlocked: number;
  secondCooldownBlocked: number;
  firstPowerActionWeaponFallbackUses: number;
  secondPowerActionWeaponFallbackUses: number;
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

function successesForRoll(value: number): number {
  if (value >= 11) return 3;
  if (value >= 8) return 2;
  if (value >= 4) return 1;
  return 0;
}

function pSuccess(dieSize: DiceSize): number {
  const sides = diceSides(dieSize);
  if (!Number.isFinite(sides) || sides <= 0) return 0;
  let totalSuccesses = 0;
  for (let value = 1; value <= sides; value += 1) {
    totalSuccesses += successesForRoll(value);
  }
  return totalSuccesses / sides;
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percent(value: number): string {
  return `${round(value * 100, 1)}%`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint];
  return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function computeRoundLengthStats(
  roundLengths: number[],
  timeoutCount: number,
): RoundLengthStats {
  const totalFights = roundLengths.length;
  const denominator = Math.max(1, totalFights);
  const countInRange = (min: number, max: number) =>
    roundLengths.filter((rounds) => rounds >= min && rounds <= max).length;

  return {
    totalFights,
    averageRounds:
      roundLengths.reduce((sum, rounds) => sum + rounds, 0) / denominator,
    medianRounds: median(roundLengths),
    minRounds: totalFights > 0 ? Math.min(...roundLengths) : 0,
    maxRounds: totalFights > 0 ? Math.max(...roundLengths) : 0,
    timeoutCount,
    timeoutPercent: timeoutCount / denominator,
    rounds1To2Percent: countInRange(1, 2) / denominator,
    rounds3To5Percent: countInRange(3, 5) / denominator,
    rounds6To8Percent: countInRange(6, 8) / denominator,
    rounds9To12Percent: countInRange(9, 12) / denominator,
    rounds13PlusPercent:
      roundLengths.filter((rounds) => rounds >= 13).length / denominator,
  };
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
    actionSpikeStats: {},
    powerUses: {},
    controlAttempts: 0,
    controlResisted: 0,
    controlLanded: 0,
    controlMainActionsBlocked: 0,
    controlPowerActionsBlocked: 0,
    controlMoveBlocked: 0,
    dodgesAttempted: 0,
    dodgesSucceeded: 0,
    dodgesFailed: 0,
    defendAttempts: 0,
    defendWoundsPrevented: 0,
    dodgeDegradationUses: 0,
    defendDegradationUses: 0,
    mentalDefenceAttempts: 0,
    mentalDefenceWoundsPrevented: 0,
    mentalDefenceDegradationUses: 0,
    blockedByActiveState: 0,
    blockedByCooldown: 0,
    powerActionWeaponFallbackUses: 0,
    cooldownViolations: 0,
  };
}

function emptyActionSpikeStats(
  actionName: string,
  actionType: ActionAttributionType,
): ActionSpikeStats {
  return {
    actionName,
    actionType,
    uses: 0,
    totalWounds: 0,
    maxWounds: 0,
    spike25PercentHpUses: 0,
    spike50PercentHpUses: 0,
    spike75PercentHpUses: 0,
    lethalHits: 0,
  };
}

function emptyRoundDefenceState(): RoundDefenceState {
  return {
    dodgeDegradation: 0,
    defendDegradation: 0,
    mentalDefenceDegradation: 0,
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

function emptyControlRestrictions(): ControlRestrictions {
  return {
    noMainActionTurns: 0,
    noPowerActionTurns: 0,
    noMoveTurns: 0,
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

function addActionSpikeStats(
  target: Record<string, ActionSpikeStats>,
  source: Record<string, ActionSpikeStats>,
): void {
  for (const [key, value] of Object.entries(source)) {
    const existing =
      target[key] ?? emptyActionSpikeStats(value.actionName, value.actionType);
    existing.uses += value.uses;
    existing.totalWounds += value.totalWounds;
    existing.maxWounds = Math.max(existing.maxWounds, value.maxWounds);
    existing.spike25PercentHpUses += value.spike25PercentHpUses;
    existing.spike50PercentHpUses += value.spike50PercentHpUses;
    existing.spike75PercentHpUses += value.spike75PercentHpUses;
    existing.lethalHits += value.lethalHits;
    target[key] = existing;
  }
}

function prefixedActionSpikeStats(
  fixture: SmokeMonsterFixture,
  source: Record<string, ActionSpikeStats>,
): Record<string, ActionSpikeStats> {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      `${fixture.name}: ${key}`,
      {
        ...value,
        actionName: `${fixture.name}: ${value.actionName}`,
      },
    ]),
  );
}

function actionAttributionType(
  action: ResolvedAction,
  slot: ActionSlot,
): ActionAttributionType {
  if (action.type === "controlPower") return "control power";
  if (action.type === "powerAttack") return "power attack";
  if (slot === "power") return "Power Action weapon fallback";
  return "main weapon";
}

function recordActionSpikeStats(
  stats: Record<string, ActionSpikeStats>,
  actionName: string,
  actionType: ActionAttributionType,
  wounds: number,
  targetMaxHp: number,
  lethalHit: boolean,
): void {
  const entry =
    stats[actionName] ?? emptyActionSpikeStats(actionName, actionType);
  entry.uses += 1;
  entry.totalWounds += wounds;
  entry.maxWounds = Math.max(entry.maxWounds, wounds);
  if (targetMaxHp > 0 && wounds >= targetMaxHp * 0.25) {
    entry.spike25PercentHpUses += 1;
  }
  if (targetMaxHp > 0 && wounds >= targetMaxHp * 0.5) {
    entry.spike50PercentHpUses += 1;
  }
  if (targetMaxHp > 0 && wounds >= targetMaxHp * 0.75) {
    entry.spike75PercentHpUses += 1;
  }
  if (lethalHit) {
    entry.lethalHits += 1;
  }
  stats[actionName] = entry;
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

function expectedControlTurns(
  action: ResolvedAction,
  target?: CombatantRuntime,
): number {
  if (action.type !== "controlPower" || action.controlTurns <= 0) return 0;
  const attackerMean = action.diceCount * pSuccess(action.dieSize);
  const defenderMean = target
    ? target.fixture.controlResistDice *
      pSuccess(target.fixture.controlResistDieSize)
    : 0;
  return Math.max(0, attackerMean - defenderMean) * action.controlTurns;
}

function expectedActionScore(action: ResolvedAction): number {
  return expectedUnmitigatedWounds(action) + expectedControlTurns(action) * 2;
}

function expectedDamage(action: ResolvedAction, target: CombatantRuntime): number {
  const expectedAttackSuccesses = action.diceCount * pSuccess(action.dieSize);
  const raw = expectedAttackSuccesses * action.potency;
  const effectiveDodgeDice = effectiveDefenceDice(
    target.fixture.dodgeDice,
    target.roundDefenceState.dodgeDegradation,
  );
  const effectiveDefendDice = effectiveDefenceDice(
    target.fixture.guardDice,
    target.roundDefenceState.defendDegradation,
  );
  const dodgeAvoidChance = chanceToMatchOrExceed(
    effectiveDodgeDice,
    target.fixture.dodgeDieSize,
    Math.ceil(expectedAttackSuccesses),
  );
  const expectedDodgePrevention = raw * dodgeAvoidChance;
  const expectedDefendPrevention = Math.min(
    raw,
    effectiveDefendDice *
      pSuccess(target.fixture.guardDieSize) *
      target.fixture.physicalDefenceStringValue,
  );
  return Math.max(0, raw - Math.max(expectedDodgePrevention, expectedDefendPrevention));
}

function effectiveDefenceDice(baseDice: number, degradation: number): number {
  return Math.max(1, baseDice - degradation);
}

function singleDieSuccessDistribution(dieSize: DiceSize): Map<number, number> {
  const sides = diceSides(dieSize);
  const distribution = new Map<number, number>();
  for (let value = 1; value <= sides; value += 1) {
    const successes = successesForRoll(value);
    distribution.set(successes, (distribution.get(successes) ?? 0) + 1 / sides);
  }
  return distribution;
}

function successDistribution(diceCount: number, dieSize: DiceSize): Map<number, number> {
  let distribution = new Map<number, number>([[0, 1]]);
  const dieDistribution = singleDieSuccessDistribution(dieSize);
  for (let die = 0; die < diceCount; die += 1) {
    const next = new Map<number, number>();
    for (const [currentSuccesses, currentProbability] of distribution) {
      for (const [dieSuccesses, dieProbability] of dieDistribution) {
        const totalSuccesses = currentSuccesses + dieSuccesses;
        next.set(
          totalSuccesses,
          (next.get(totalSuccesses) ?? 0) +
            currentProbability * dieProbability,
        );
      }
    }
    distribution = next;
  }
  return distribution;
}

function chanceToMatchOrExceed(
  diceCount: number,
  dieSize: DiceSize,
  targetSuccesses: number,
): number {
  if (targetSuccesses <= 0) return 1;
  let chance = 0;
  for (const [successes, probability] of successDistribution(diceCount, dieSize)) {
    if (successes >= targetSuccesses) chance += probability;
  }
  return chance;
}

function choosePhysicalDefence(
  target: CombatantRuntime,
  attackSuccesses: number,
  incomingWounds: number,
): DefenceChoice {
  const effectiveDodgeDice = effectiveDefenceDice(
    target.fixture.dodgeDice,
    target.roundDefenceState.dodgeDegradation,
  );
  const effectiveDefendDice = effectiveDefenceDice(
    target.fixture.guardDice,
    target.roundDefenceState.defendDegradation,
  );
  const expectedDodgePrevention =
    incomingWounds *
    chanceToMatchOrExceed(
      effectiveDodgeDice,
      target.fixture.dodgeDieSize,
      attackSuccesses,
    );
  const expectedDefendPrevention = Math.min(
    incomingWounds,
    effectiveDefendDice *
      pSuccess(target.fixture.guardDieSize) *
      target.fixture.physicalDefenceStringValue,
  );
  return expectedDodgePrevention > expectedDefendPrevention ? "dodge" : "defend";
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

function actionUseName(action: ResolvedAction, slot: ActionSlot): string {
  if (slot === "power" && action.lifecycle === "basic") {
    return `${action.name} (Power Action weapon)`;
  }
  return action.name;
}

function chooseAction(
  actor: CombatantRuntime,
  target: CombatantRuntime,
  candidateActions: ResolvedAction[],
): ResolvedAction | null {
  const available = candidateActions.filter((action) =>
    isActionAvailable(action, actor),
  );
  if (available.length === 0) return null;

  const targetHp = target.currentHp;
  const ranked = available.map((action, index) => {
    const expectedWounds = expectedDamage(action, target);
    const expectedControl = expectedControlTurns(action, target);
    const lethal = expectedWounds >= targetHp ? 1000 : 0;
    const score = lethal + expectedWounds + expectedControl * 2;
    return { action, index, score };
  });

  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0]?.action ?? null;
}

function rollDiceSuccesses(
  diceCount: number,
  dieSize: DiceSize,
  rng: SeededRng,
): number {
  let successes = 0;
  const sides = diceSides(dieSize);
  for (let i = 0; i < diceCount; i += 1) {
    successes += successesForRoll(rng.intInclusive(1, sides));
  }
  return successes;
}

function rollSuccesses(action: ResolvedAction, rng: SeededRng): number {
  return rollDiceSuccesses(action.diceCount, action.dieSize, rng);
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

function applyControlRestriction(
  target: CombatantRuntime,
  action: ResolvedAction,
): void {
  const duration = Math.max(1, action.controlTurns);
  switch (action.controlEffectType) {
    case "forceNoMainAction":
      target.controlRestrictions.noMainActionTurns = Math.max(
        target.controlRestrictions.noMainActionTurns,
        duration,
      );
      break;
    case "forceNoPowerAction":
      target.controlRestrictions.noPowerActionTurns = Math.max(
        target.controlRestrictions.noPowerActionTurns,
        duration,
      );
      break;
    case "forceNoMove":
      target.controlRestrictions.noMoveTurns = Math.max(
        target.controlRestrictions.noMoveTurns,
        duration,
      );
      break;
    case "forceMove":
    case "forceSpecificMainAction":
    case "forceSpecificPowerAction":
    case null:
      break;
  }
}

function expireControlRestrictions(target: CombatantRuntime): void {
  target.controlRestrictions.noMainActionTurns = Math.max(
    0,
    target.controlRestrictions.noMainActionTurns - 1,
  );
  target.controlRestrictions.noPowerActionTurns = Math.max(
    0,
    target.controlRestrictions.noPowerActionTurns - 1,
  );
  target.controlRestrictions.noMoveTurns = Math.max(
    0,
    target.controlRestrictions.noMoveTurns - 1,
  );
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
  slot: ActionSlot,
): void {
  const state = actor.actionStates[action.id];
  if (state) {
    state.usageAttempts += 1;
    if (isActiveBlocked(state) || isCooling(state)) {
      actor.stats.cooldownViolations += 1;
    }
    state.uses += 1;
  }

  const actionName = actionUseName(action, slot);
  actor.stats.actionUses[actionName] =
    (actor.stats.actionUses[actionName] ?? 0) + 1;
  if (action.lifecycle !== "basic") {
    actor.stats.powerUses[action.name] =
      (actor.stats.powerUses[action.name] ?? 0) + 1;
  } else if (slot === "power") {
    actor.stats.powerActionWeaponFallbackUses += 1;
  }

  const successes = rollSuccesses(action, rng);
  if (action.type === "controlPower") {
    actor.stats.controlAttempts += 1;
  }

  let wounds = successes * action.potency;
  if (wounds > 0) {
    const defenceChoice = choosePhysicalDefence(target, successes, wounds);
    if (defenceChoice === "dodge") {
      target.stats.dodgesAttempted += 1;
      const dodgeDice = effectiveDefenceDice(
        target.fixture.dodgeDice,
        target.roundDefenceState.dodgeDegradation,
      );
      const dodgeSuccesses = rollDiceSuccesses(
        dodgeDice,
        target.fixture.dodgeDieSize,
        rng,
      );
      target.roundDefenceState.dodgeDegradation += 1;
      target.stats.dodgeDegradationUses += 1;
      if (dodgeSuccesses >= successes) {
        target.stats.dodgesSucceeded += 1;
        wounds = 0;
      } else {
        target.stats.dodgesFailed += 1;
      }
    } else {
      target.stats.defendAttempts += 1;
      const defendDice = effectiveDefenceDice(
        target.fixture.guardDice,
        target.roundDefenceState.defendDegradation,
      );
      const defenceSuccesses = rollDiceSuccesses(
        defendDice,
        target.fixture.guardDieSize,
        rng,
      );
      target.roundDefenceState.defendDegradation += 1;
      target.stats.defendDegradationUses += 1;
      const beforeDefend = wounds;
      wounds = Math.max(
        0,
        wounds - defenceSuccesses * target.fixture.physicalDefenceStringValue,
      );
      target.stats.defendWoundsPrevented += beforeDefend - wounds;
    }
  }

  if (wounds > 0) {
    const lethalHit = wounds >= target.currentHp;
    recordActionSpikeStats(
      actor.stats.actionSpikeStats,
      actionName,
      actionAttributionType(action, slot),
      wounds,
      target.fixture.physicalHp,
      lethalHit,
    );
    target.currentHp = Math.max(0, target.currentHp - wounds);
    actor.stats.woundsDealt += wounds;
    actor.stats.largestSpike = Math.max(actor.stats.largestSpike, wounds);
  } else {
    recordActionSpikeStats(
      actor.stats.actionSpikeStats,
      actionName,
      actionAttributionType(action, slot),
      0,
      target.fixture.physicalHp,
      false,
    );
  }

  if (action.type === "controlPower" && successes > 0 && action.controlTurns > 0) {
    const resistSuccesses = rollDiceSuccesses(
      target.fixture.controlResistDice,
      target.fixture.controlResistDieSize,
      rng,
    );
    const netControlSuccesses = successes - resistSuccesses;
    if (netControlSuccesses <= 0) {
      actor.stats.controlResisted += 1;
    } else {
      actor.stats.controlLanded += 1;
      applyControlRestriction(target, action);
    }
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
  if (actor.controlRestrictions.noMoveTurns > 0) {
    actor.stats.controlMoveBlocked += 1;
  }

  if (actor.controlRestrictions.noMainActionTurns > 0) {
    actor.stats.controlMainActionsBlocked += 1;
  } else {
    const mainAction = chooseAction(
      actor,
      target,
      actor.actions.filter((action) => action.lifecycle === "basic"),
    );
    if (mainAction) useAction(actor, target, mainAction, rng, "main");
  }

  if (target.currentHp > 0) {
    if (actor.controlRestrictions.noPowerActionTurns > 0) {
      actor.stats.controlPowerActionsBlocked += 1;
    } else {
      recordBlockedActions(actor);
      const powerActionChoice = chooseAction(
        actor,
        target,
        [
          ...actor.actions.filter((action) => action.lifecycle !== "basic"),
          ...(actor.powerActionWeaponAttack
            ? [actor.powerActionWeaponAttack]
            : []),
        ],
      );
      if (powerActionChoice) {
        useAction(actor, target, powerActionChoice, rng, "power");
      }
    }
  }

  expireControlRestrictions(actor);
  endTurnLifecycle(actor, target);
}

function makeRuntime(
  fixture: SmokeMonsterFixture,
  resolvedActions: ResolvedAction[],
): CombatantRuntime {
  const powerActionWeaponAttack = fixture.powerActionWeaponAttackId
    ? (resolvedActions.find(
        (action) => action.id === fixture.powerActionWeaponAttackId,
      ) ?? null)
    : null;
  const actionStates = Object.fromEntries(
    resolvedActions
      .filter((action) => action.lifecycle !== "basic")
      .map((action) => [action.id, emptyActionState()]),
  );
  return {
    fixture,
    currentHp: fixture.physicalHp,
    controlRestrictions: emptyControlRestrictions(),
    roundDefenceState: emptyRoundDefenceState(),
    actions: resolvedActions,
    powerActionWeaponAttack,
    actionStates,
    stats: emptyStats(),
  };
}

function resetRoundDefenceState(combatant: CombatantRuntime): void {
  combatant.roundDefenceState = emptyRoundDefenceState();
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
    resetRoundDefenceState(firstRuntime);
    resetRoundDefenceState(secondRuntime);

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
  let timeoutCount = 0;
  let firstWounds = 0;
  let secondWounds = 0;
  let largestSingleTurnSpike = 0;
  let firstControlAttempts = 0;
  let secondControlAttempts = 0;
  let firstControlResisted = 0;
  let secondControlResisted = 0;
  let firstControlLanded = 0;
  let secondControlLanded = 0;
  let firstMainActionsBlocked = 0;
  let secondMainActionsBlocked = 0;
  let firstPowerActionsBlocked = 0;
  let secondPowerActionsBlocked = 0;
  let firstMoveBlocked = 0;
  let secondMoveBlocked = 0;
  let firstActiveBlocked = 0;
  let secondActiveBlocked = 0;
  let firstCooldownBlocked = 0;
  let secondCooldownBlocked = 0;
  let firstPowerActionWeaponFallbackUses = 0;
  let secondPowerActionWeaponFallbackUses = 0;
  let firstCooldownViolations = 0;
  let secondCooldownViolations = 0;
  let firstDodgesAttempted = 0;
  let firstDodgesSucceeded = 0;
  let firstDodgesFailed = 0;
  let secondDodgesAttempted = 0;
  let secondDodgesSucceeded = 0;
  let secondDodgesFailed = 0;
  let firstDefendAttempts = 0;
  let secondDefendAttempts = 0;
  let firstDefendWoundsPrevented = 0;
  let secondDefendWoundsPrevented = 0;
  let firstDodgeDegradationUses = 0;
  let secondDodgeDegradationUses = 0;
  let firstDefendDegradationUses = 0;
  let secondDefendDegradationUses = 0;
  const firstActionUses: Record<string, number> = {};
  const secondActionUses: Record<string, number> = {};
  const firstActionSpikeStats: Record<string, ActionSpikeStats> = {};
  const secondActionSpikeStats: Record<string, ActionSpikeStats> = {};
  const firstPowerUses: Record<string, number> = {};
  const secondPowerUses: Record<string, number> = {};
  const roundLengths: number[] = [];

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
    roundLengths.push(result.rounds);
    if (result.timedOut) timeoutCount += 1;
    firstWounds += firstStats.woundsDealt;
    secondWounds += secondStats.woundsDealt;
    largestSingleTurnSpike = Math.max(
      largestSingleTurnSpike,
      firstStats.largestSpike,
      secondStats.largestSpike,
    );
    firstControlAttempts += firstStats.controlAttempts;
    secondControlAttempts += secondStats.controlAttempts;
    firstControlResisted += firstStats.controlResisted;
    secondControlResisted += secondStats.controlResisted;
    firstControlLanded += firstStats.controlLanded;
    secondControlLanded += secondStats.controlLanded;
    firstMainActionsBlocked += firstStats.controlMainActionsBlocked;
    secondMainActionsBlocked += secondStats.controlMainActionsBlocked;
    firstPowerActionsBlocked += firstStats.controlPowerActionsBlocked;
    secondPowerActionsBlocked += secondStats.controlPowerActionsBlocked;
    firstMoveBlocked += firstStats.controlMoveBlocked;
    secondMoveBlocked += secondStats.controlMoveBlocked;
    firstActiveBlocked += firstStats.blockedByActiveState;
    secondActiveBlocked += secondStats.blockedByActiveState;
    firstCooldownBlocked += firstStats.blockedByCooldown;
    secondCooldownBlocked += secondStats.blockedByCooldown;
    firstPowerActionWeaponFallbackUses +=
      firstStats.powerActionWeaponFallbackUses;
    secondPowerActionWeaponFallbackUses +=
      secondStats.powerActionWeaponFallbackUses;
    firstCooldownViolations += firstStats.cooldownViolations;
    secondCooldownViolations += secondStats.cooldownViolations;
    firstDodgesAttempted += firstStats.dodgesAttempted;
    firstDodgesSucceeded += firstStats.dodgesSucceeded;
    firstDodgesFailed += firstStats.dodgesFailed;
    secondDodgesAttempted += secondStats.dodgesAttempted;
    secondDodgesSucceeded += secondStats.dodgesSucceeded;
    secondDodgesFailed += secondStats.dodgesFailed;
    firstDefendAttempts += firstStats.defendAttempts;
    secondDefendAttempts += secondStats.defendAttempts;
    firstDefendWoundsPrevented += firstStats.defendWoundsPrevented;
    secondDefendWoundsPrevented += secondStats.defendWoundsPrevented;
    firstDodgeDegradationUses += firstStats.dodgeDegradationUses;
    secondDodgeDegradationUses += secondStats.dodgeDegradationUses;
    firstDefendDegradationUses += firstStats.defendDegradationUses;
    secondDefendDegradationUses += secondStats.defendDegradationUses;
    addStatMap(firstActionUses, firstStats.actionUses);
    addStatMap(secondActionUses, secondStats.actionUses);
    addActionSpikeStats(firstActionSpikeStats, firstStats.actionSpikeStats);
    addActionSpikeStats(secondActionSpikeStats, secondStats.actionSpikeStats);
    addStatMap(firstPowerUses, firstStats.powerUses);
    addStatMap(secondPowerUses, secondStats.powerUses);
  }

  const averageRounds = rounds / RUNS_PER_MATCHUP;
  const roundLengthStats = computeRoundLengthStats(roundLengths, timeoutCount);
  const firstAverageWounds = firstWounds / RUNS_PER_MATCHUP;
  const secondAverageWounds = secondWounds / RUNS_PER_MATCHUP;
  const firstAverageWoundsPerRound = firstWounds / Math.max(1, rounds);
  const secondAverageWoundsPerRound = secondWounds / Math.max(1, rounds);
  const firstDodgeSuccessRate =
    firstDodgesAttempted > 0 ? firstDodgesSucceeded / firstDodgesAttempted : null;
  const secondDodgeSuccessRate =
    secondDodgesAttempted > 0
      ? secondDodgesSucceeded / secondDodgesAttempted
      : null;

  const aggregate: MatchupAggregate = {
    first,
    second,
    expectation: getMatchupExpectation(first, second),
    runs: RUNS_PER_MATCHUP,
    firstWins,
    secondWins,
    draws,
    averageRounds,
    roundLengths,
    roundLengthStats,
    firstAverageWounds,
    secondAverageWounds,
    firstAverageWoundsPerRound,
    secondAverageWoundsPerRound,
    largestSingleTurnSpike,
    firstActionUses,
    secondActionUses,
    firstActionSpikeStats,
    secondActionSpikeStats,
    firstPowerUses,
    secondPowerUses,
    firstMostUsedAction: topEntry(firstActionUses),
    secondMostUsedAction: topEntry(secondActionUses),
    firstControlAttempts,
    secondControlAttempts,
    firstControlResisted,
    secondControlResisted,
    firstControlLanded,
    secondControlLanded,
    firstMainActionsBlocked,
    secondMainActionsBlocked,
    firstPowerActionsBlocked,
    secondPowerActionsBlocked,
    firstMoveBlocked,
    secondMoveBlocked,
    firstDodgeSuccessRate,
    secondDodgeSuccessRate,
    firstDodgeAttempts: firstDodgesAttempted,
    secondDodgeAttempts: secondDodgesAttempted,
    firstDodgeSuccesses: firstDodgesSucceeded,
    secondDodgeSuccesses: secondDodgesSucceeded,
    firstDodgeFailures: firstDodgesFailed,
    secondDodgeFailures: secondDodgesFailed,
    firstDefendAttempts,
    secondDefendAttempts,
    firstDefendWoundsPrevented,
    secondDefendWoundsPrevented,
    firstDodgeDegradationUses,
    secondDodgeDegradationUses,
    firstDefendDegradationUses,
    secondDefendDegradationUses,
    firstActiveBlocked,
    secondActiveBlocked,
    firstCooldownBlocked,
    secondCooldownBlocked,
    firstPowerActionWeaponFallbackUses,
    secondPowerActionWeaponFallbackUses,
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

function averageWoundsPerUse(action: ActionSpikeStats): number {
  return action.uses > 0 ? action.totalWounds / action.uses : 0;
}

function actionSpikeSummary(action: ActionSpikeStats): string {
  return [
    `${action.actionName} [${action.actionType}]`,
    `uses ${action.uses}`,
    `avg ${round(averageWoundsPerUse(action))}`,
    `max ${round(action.maxWounds)}`,
    `>=25% ${action.spike25PercentHpUses}`,
    `>=50% ${action.spike50PercentHpUses}`,
    `>=75% ${action.spike75PercentHpUses}`,
    `lethal ${action.lethalHits}`,
  ].join(" | ");
}

function combinedMatchupActionSpikes(
  aggregate: MatchupAggregate,
): ActionSpikeStats[] {
  const combined: Record<string, ActionSpikeStats> = {};
  addActionSpikeStats(
    combined,
    prefixedActionSpikeStats(aggregate.first, aggregate.firstActionSpikeStats),
  );
  addActionSpikeStats(
    combined,
    prefixedActionSpikeStats(aggregate.second, aggregate.secondActionSpikeStats),
  );
  return Object.values(combined);
}

function topActionSpikesByMax(
  actions: ActionSpikeStats[],
  limit: number,
): ActionSpikeStats[] {
  return [...actions]
    .sort(
      (a, b) =>
        b.maxWounds - a.maxWounds ||
        b.spike50PercentHpUses - a.spike50PercentHpUses ||
        averageWoundsPerUse(b) - averageWoundsPerUse(a),
    )
    .slice(0, limit);
}

function topActionSpikesByAverage(
  actions: ActionSpikeStats[],
  limit: number,
  minUses = 1,
): ActionSpikeStats[] {
  return [...actions]
    .filter((action) => action.uses >= minUses)
    .sort(
      (a, b) =>
        averageWoundsPerUse(b) - averageWoundsPerUse(a) ||
        b.maxWounds - a.maxWounds ||
        b.uses - a.uses,
    )
    .slice(0, limit);
}

function topActionSpikesByFiftyPercentCount(
  actions: ActionSpikeStats[],
  limit: number,
): ActionSpikeStats[] {
  return [...actions]
    .sort(
      (a, b) =>
        b.spike50PercentHpUses - a.spike50PercentHpUses ||
        b.maxWounds - a.maxWounds ||
        averageWoundsPerUse(b) - averageWoundsPerUse(a),
    )
    .slice(0, limit);
}

function printActionSpikeList(
  label: string,
  actions: ActionSpikeStats[],
): void {
  console.log(label);
  if (actions.length === 0) {
    console.log("- none");
    return;
  }
  for (const action of actions) {
    console.log(`- ${actionSpikeSummary(action)}`);
  }
}

function formatFiftyPercentSpikeCounts(
  actions: ActionSpikeStats[],
): string {
  const entries = actions
    .filter((action) => action.spike50PercentHpUses > 0)
    .sort(
      (a, b) =>
        b.spike50PercentHpUses - a.spike50PercentHpUses ||
        b.maxWounds - a.maxWounds,
    )
    .map((action) => `${action.actionName}: ${action.spike50PercentHpUses}`);
  return entries.length > 0 ? entries.join(", ") : "none";
}

function formatRoundDistribution(stats: RoundLengthStats): string {
  return [
    `1-2 ${percent(stats.rounds1To2Percent)}`,
    `3-5 ${percent(stats.rounds3To5Percent)}`,
    `6-8 ${percent(stats.rounds6To8Percent)}`,
    `9-12 ${percent(stats.rounds9To12Percent)}`,
    `13+ ${percent(stats.rounds13PlusPercent)}`,
    `timeouts ${stats.timeoutCount}/${stats.totalFights} (${percent(stats.timeoutPercent)})`,
  ].join(" | ");
}

function pacingLabel(stats: RoundLengthStats): string {
  if (stats.medianRounds > 10 || stats.rounds13PlusPercent > 0.2) {
    return "slog-risk";
  }
  if (stats.medianRounds >= 8) return "long";
  if (stats.medianRounds >= 5) return "normal";
  return "explosive";
}

function isDefenderRole(fixture: SmokeMonsterFixture): boolean {
  return fixture.id === "defender" || fixture.id === "bulwark-defender";
}

function getMatchupExpectation(
  first: SmokeMonsterFixture,
  second: SmokeMonsterFixture,
): MatchupExpectation {
  const matchupKey = [first.id, second.id].sort().join("|");

  switch (matchupKey) {
    case "bruiser|glass-cannon":
      return {
        classification: "representative",
        reason:
          "Sustained physical pressure versus fragile burst threat should produce a clear lethality signal.",
      };
    case "bruiser|defender":
      return {
        classification: "expected-role-friction",
        reason:
          "Sustained damage dealer versus sustained survivor is expected to run longer.",
      };
    case "bruiser|controller":
      return {
        classification: "representative",
        reason:
          "Control should disrupt but still needs enough follow-through to survive pressure.",
      };
    case "bruiser|precision-striker":
      return {
        classification: "representative",
        reason:
          "Sustained pressure versus consistent striker checks whether offence pacing stays readable.",
      };
    case "bruiser|bulwark-defender":
      return {
        classification: "expected-role-friction",
        reason:
          "Sustained damage dealer versus high-pool survivor is expected to run longer.",
      };
    case "defender|glass-cannon":
      return {
        classification: "representative",
        reason:
          "Fragile burst into a durable target is a useful check for whether burst can threaten defence.",
      };
    case "bulwark-defender|glass-cannon":
      return {
        classification: "representative",
        reason:
          "Fragile burst into an alternate defender profile helps separate fixture artifact from defender-wide pressure.",
      };
    case "glass-cannon|precision-striker":
      return {
        classification: "representative",
        reason:
          "Fragile spike versus steadier offence checks whether burst ceiling beats consistency.",
      };
    case "controller|glass-cannon":
      return {
        classification: "representative",
        reason:
          "Burst versus disruption is a useful pacing and pressure check.",
      };
    case "defender|precision-striker":
      return {
        classification: "representative",
        reason:
          "Consistent burst/offence into the original defender checks whether Glass Cannon was uniquely fragile.",
      };
    case "bulwark-defender|precision-striker":
      return {
        classification: "representative",
        reason:
          "Consistent burst/offence into the alternate defender checks whether defender profiles broadly suppress offence.",
      };
    case "controller|precision-striker":
      return {
        classification: "representative",
        reason:
          "Consistent striker versus disruption checks whether the new offence profile handles control pressure.",
      };
    case "controller|defender":
      return {
        classification: "party-dependent-edge-case",
        reason:
          "Controller is often a party-enabling role and may not be expected to solo-kill a Defender efficiently.",
      };
    case "bulwark-defender|controller":
      return {
        classification: "party-dependent-edge-case",
        reason:
          "Controller is often party-enabling and may not solo-kill a high-pool defender efficiently.",
      };
    case "bulwark-defender|defender":
      return {
        classification: "expected-role-friction",
        reason:
          "Two defender profiles fighting each other are expected to produce slow pressure checks.",
      };
    default:
      return {
        classification: "representative",
        reason: "No special role-friction expectation is registered.",
      };
  }
}

function pacingWarning(
  matchup: MatchupAggregate,
  warning: string,
  escalateEdgeCase = false,
): string {
  switch (matchup.expectation.classification) {
    case "expected-role-friction":
      return `expected friction monitor: ${warning}`;
    case "party-dependent-edge-case":
      if (escalateEdgeCase) {
        return `edge-case warning: ${warning}`;
      }
      return `edge-case context (do not tune from this 1v1 alone): ${warning}`;
    case "representative":
    default:
      return warning;
  }
}

function buildWarnings(matchup: MatchupAggregate): string[] {
  const warnings: string[] = [];
  const firstWinRate = matchup.firstWins / matchup.runs;
  const secondWinRate = matchup.secondWins / matchup.runs;
  const firstSpikeShare = matchup.largestSingleTurnSpike / matchup.second.physicalHp;
  const secondSpikeShare = matchup.largestSingleTurnSpike / matchup.first.physicalHp;
  const firstActionShare = highestActionShare(matchup.firstActionUses);
  const secondActionShare = highestActionShare(matchup.secondActionUses);
  const totalSlotBlocks =
    matchup.firstMainActionsBlocked +
    matchup.secondMainActionsBlocked +
    matchup.firstPowerActionsBlocked +
    matchup.secondPowerActionsBlocked +
    matchup.firstMoveBlocked +
    matchup.secondMoveBlocked;
  const defenderInvolved =
    isDefenderRole(matchup.first) || isDefenderRole(matchup.second);

  if (firstWinRate > 0.7) {
    warnings.push(`${matchup.first.name} win rate exceeds 70%`);
  }
  if (secondWinRate > 0.7) {
    warnings.push(`${matchup.second.name} win rate exceeds 70%`);
  }
  if (matchup.averageRounds < 2) {
    warnings.push(pacingWarning(matchup, "average fight length is under 2 rounds"));
  }
  if (matchup.averageRounds > 12) {
    warnings.push(pacingWarning(matchup, "average fight length exceeds 12 rounds"));
  }
  if (matchup.roundLengthStats.medianRounds > 8) {
    warnings.push(pacingWarning(matchup, "median fight length exceeds 8 rounds"));
  }
  if (matchup.roundLengthStats.averageRounds > 10) {
    warnings.push(pacingWarning(matchup, "average fight length exceeds 10 rounds"));
  }
  if (matchup.roundLengthStats.rounds13PlusPercent > 0.2) {
    warnings.push(
      pacingWarning(matchup, "more than 20% of matchup runs reach 13+ rounds"),
    );
  }
  if (matchup.roundLengthStats.timeoutPercent > 0.05) {
    warnings.push(
      pacingWarning(
        matchup,
        "more than 5% of matchup runs hit max-round timeout",
        true,
      ),
    );
  }
  if (matchup.roundLengthStats.rounds1To2Percent > 0.4) {
    warnings.push(
      pacingWarning(matchup, "more than 40% of matchup runs end in 1-2 rounds"),
    );
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
  if (totalSlotBlocks / matchup.runs > 4) {
    warnings.push("control slot blocks exceed 4 blocked slots per run");
  }
  if (
    defenderInvolved &&
    matchup.averageRounds > 10 &&
    matchup.firstAverageWoundsPerRound + matchup.secondAverageWoundsPerRound < 4
  ) {
    warnings.push(
      pacingWarning(matchup, "defender matchup is a very long low-damage fight"),
    );
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
  controlEffectType?: ControlEffectType | null;
  controlTheme?: string | null;
  controlResistAttribute?: string | null;
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
    controlEffectType: config.controlEffectType ?? null,
    controlTheme: config.controlTheme ?? null,
    controlResistAttribute: config.controlResistAttribute ?? null,
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
    controlEffectType: null,
    controlTheme: null,
    controlResistAttribute: null,
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
      dodgeDice: 1,
      dodgeDieSize: "D8",
      guardDice: 1,
      guardDieSize: "D8",
      physicalDefenceStringValue: 1,
      willpowerDice: 1,
      willpowerDieSize: "D8",
      mentalDefenceStringValue: 1,
      controlResistDice: 1,
      controlResistDieSize: "D8",
      controlResistAttribute: "Fortitude",
      powerActionWeaponAttackId: "bruiser-shoulder-check",
      actions: [
        basicAttack({
          id: "bruiser-basic",
          name: "Heavy Maul",
          diceCount: 3,
          dieSize: "D8",
          potency: 2,
        }),
        basicAttack({
          id: "bruiser-shoulder-check",
          name: "Shoulder Check",
          diceCount: 2,
          dieSize: "D8",
          potency: 1,
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
      dodgeDice: 1,
      dodgeDieSize: "D6",
      guardDice: 1,
      guardDieSize: "D6",
      physicalDefenceStringValue: 0,
      willpowerDice: 1,
      willpowerDieSize: "D6",
      mentalDefenceStringValue: 0,
      controlResistDice: 1,
      controlResistDieSize: "D6",
      controlResistAttribute: "Fortitude",
      powerActionWeaponAttackId: null,
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
      dodgeDice: 2,
      dodgeDieSize: "D8",
      guardDice: 2,
      guardDieSize: "D8",
      physicalDefenceStringValue: 3,
      willpowerDice: 2,
      willpowerDieSize: "D8",
      mentalDefenceStringValue: 3,
      controlResistDice: 2,
      controlResistDieSize: "D8",
      controlResistAttribute: "Fortitude",
      powerActionWeaponAttackId: "defender-basic",
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
      id: "precision-striker",
      name: "Precision Striker",
      role:
        "Second offence profile with moderate durability, lower spike ceiling, and steadier damage",
      level: LEVEL,
      tier: TIER,
      legendary: false,
      physicalHp: 34,
      dodgeDice: 2,
      dodgeDieSize: "D8",
      guardDice: 1,
      guardDieSize: "D8",
      physicalDefenceStringValue: 1,
      willpowerDice: 1,
      willpowerDieSize: "D8",
      mentalDefenceStringValue: 1,
      controlResistDice: 1,
      controlResistDieSize: "D8",
      controlResistAttribute: "Fortitude",
      powerActionWeaponAttackId: "precision-basic",
      actions: [
        basicAttack({
          id: "precision-basic",
          name: "Measured Cut",
          diceCount: 3,
          dieSize: "D8",
          potency: 3,
        }),
        powerAction({
          id: "precision-power",
          name: "Exploit Opening",
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
            damageTypes: ["Piercing"],
            rangeCategory: "MELEE",
          },
        }),
      ],
    },
    {
      id: "bulwark-defender",
      name: "Bulwark Defender",
      role:
        "Second defender profile with high HP, lower protection, and modest offence",
      level: LEVEL,
      tier: TIER,
      legendary: false,
      physicalHp: 50,
      dodgeDice: 1,
      dodgeDieSize: "D6",
      guardDice: 2,
      guardDieSize: "D8",
      physicalDefenceStringValue: 1,
      willpowerDice: 2,
      willpowerDieSize: "D8",
      mentalDefenceStringValue: 1,
      controlResistDice: 2,
      controlResistDieSize: "D8",
      controlResistAttribute: "Fortitude",
      powerActionWeaponAttackId: "bulwark-basic",
      actions: [
        basicAttack({
          id: "bulwark-basic",
          name: "Weighty Guard Strike",
          diceCount: 2,
          dieSize: "D8",
          potency: 2,
        }),
        powerAction({
          id: "bulwark-power",
          name: "Brace and Shove",
          type: "powerAttack",
          lifecycle: "immediate",
          lifecycleLabel: "Immediate",
          diceCount: 3,
          dieSize: "D6",
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
      role: "Lower damage with a slot-control power",
      level: LEVEL,
      tier: TIER,
      legendary: false,
      physicalHp: 34,
      dodgeDice: 1,
      dodgeDieSize: "D8",
      guardDice: 1,
      guardDieSize: "D8",
      physicalDefenceStringValue: 1,
      willpowerDice: 1,
      willpowerDieSize: "D8",
      mentalDefenceStringValue: 1,
      controlResistDice: 1,
      controlResistDieSize: "D8",
      controlResistAttribute: "Fortitude",
      powerActionWeaponAttackId: null,
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
          controlEffectType: "forceNoPowerAction",
          controlTheme: "Lockdown",
          controlResistAttribute: "Fortitude",
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
  console.log("- Control powers use legal action-slot restrictions and a smoke Resist gate; they do not skip an entire turn.");
  console.log("- All success rolls use SMASH tiers: 1-3 = 0, 4-7 = 1, 8-10 = 2, 11+ = 3.");
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
  console.log("- physical defence chooses Dodge or Defend deterministically by expected prevention");
  console.log("- Dodge/Defend dice degrade after use for the rest of the round, minimum 1 die");
  console.log("- mental defence fields exist on fixtures but no mental wound packets are exercised yet");
  console.log("- no full ongoing effect engine");
  console.log("- legal action-slot control only; no full control engine");
  console.log("- no Cleanse, ally intervention, immunity windows, or diminishing returns yet");
  console.log("- Force Move and Force Specific action control options are not exercised by these fixtures");
  console.log("- Power Action weapon fallback is modeled explicitly per fixture; it is not automatic");
  console.log("- v0.1 does not model complex weapon restrictions, Slow traits, hand occupancy, reload, ammo, or multiweapon legality beyond fixture metadata");
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
      `- ${fixture.name}: L${fixture.level} ${fixture.tier}, HP ${fixture.physicalHp}, dodge ${fixture.dodgeDice}${fixture.dodgeDieSize}, defend ${fixture.guardDice}${fixture.guardDieSize} x DSV ${fixture.physicalDefenceStringValue}, mental defence ${fixture.willpowerDice}${fixture.willpowerDieSize} x DSV ${fixture.mentalDefenceStringValue}, control resist ${fixture.controlResistDice}${fixture.controlResistDieSize} ${fixture.controlResistAttribute}`,
    );
    console.log(`  role: ${fixture.role}`);
    const fallbackAction = fixture.powerActionWeaponAttackId
      ? actions.find((action) => action.id === fixture.powerActionWeaponAttackId)
      : null;
    if (fallbackAction) {
      console.log(
        `  Power Action weapon fallback: ${fallbackAction.name}, ${fallbackAction.diceCount}${fallbackAction.dieSize} x ${fallbackAction.potency} wounds/success, expected wounds ${round(expectedUnmitigatedWounds(fallbackAction))}`,
      );
    } else {
      console.log("  Power Action weapon fallback: unavailable");
    }
    for (const action of actions) {
      const cooldown =
        action.cooldownSource === "derived"
          ? `${action.derivedCooldownTurns} turn(s), derived from BPV ${action.basePowerValue}`
          : "none";
      const control =
        action.controlTurns > 0
          ? `, control ${action.controlEffectType ?? "unsupported"} ${action.controlTurns} turn(s), theme ${action.controlTheme ?? "n/a"}, resist ${action.controlResistAttribute ?? "n/a"}`
          : "";
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
    `rounds median ${round(aggregate.roundLengthStats.medianRounds)} | min ${aggregate.roundLengthStats.minRounds} | max ${aggregate.roundLengthStats.maxRounds} | draws/timeouts ${aggregate.draws}/${aggregate.roundLengthStats.timeoutCount} (${percent(aggregate.roundLengthStats.timeoutPercent)})`,
  );
  console.log(`pacing label ${pacingLabel(aggregate.roundLengthStats)}`);
  console.log(
    `matchup classification ${aggregate.expectation.classification} | ${aggregate.expectation.reason}`,
  );
  console.log(`round distribution ${formatRoundDistribution(aggregate.roundLengthStats)}`);
  console.log(
    `avg wounds/round ${aggregate.first.name} ${round(aggregate.firstAverageWoundsPerRound)} / ${aggregate.second.name} ${round(aggregate.secondAverageWoundsPerRound)} | largest spike ${aggregate.largestSingleTurnSpike}`,
  );
  console.log(
    `action uses ${aggregate.first.name}: ${JSON.stringify(aggregate.firstActionUses)} | ${aggregate.second.name}: ${JSON.stringify(aggregate.secondActionUses)}`,
  );
  console.log(
    `action use % ${aggregate.first.name}: ${JSON.stringify(actionUsePercentages(aggregate.firstActionUses))} | ${aggregate.second.name}: ${JSON.stringify(actionUsePercentages(aggregate.secondActionUses))}`,
  );
  const matchupActionSpikes = combinedMatchupActionSpikes(aggregate);
  printActionSpikeList(
    "top spike actions by max single-use wounds",
    topActionSpikesByMax(matchupActionSpikes, 3),
  );
  printActionSpikeList(
    "top spike actions by average wounds/use",
    topActionSpikesByAverage(matchupActionSpikes, 3),
  );
  console.log(
    `>50% HP spike counts by action ${formatFiftyPercentSpikeCounts(matchupActionSpikes)}`,
  );
  console.log(
    `most-used action ${aggregate.first.name}: ${aggregate.firstMostUsedAction ?? "none"} | ${aggregate.second.name}: ${aggregate.secondMostUsedAction ?? "none"}`,
  );
  console.log(
    `power uses ${aggregate.first.name}: ${JSON.stringify(aggregate.firstPowerUses)} | ${aggregate.second.name}: ${JSON.stringify(aggregate.secondPowerUses)}`,
  );
  console.log(
    `Power Action weapon fallback uses ${aggregate.first.name}: ${aggregate.firstPowerActionWeaponFallbackUses} | ${aggregate.second.name}: ${aggregate.secondPowerActionWeaponFallbackUses}`,
  );
  console.log(
    `control attempts/resisted/landed ${aggregate.first.name}: ${aggregate.firstControlAttempts}/${aggregate.firstControlResisted}/${aggregate.firstControlLanded} | ${aggregate.second.name}: ${aggregate.secondControlAttempts}/${aggregate.secondControlResisted}/${aggregate.secondControlLanded}`,
  );
  console.log(
    `control main slot blocks ${aggregate.first.name}: ${aggregate.firstMainActionsBlocked} | ${aggregate.second.name}: ${aggregate.secondMainActionsBlocked}`,
  );
  console.log(
    `control power slot blocks ${aggregate.first.name}: ${aggregate.firstPowerActionsBlocked} | ${aggregate.second.name}: ${aggregate.secondPowerActionsBlocked}`,
  );
  console.log(
    `control move blocks ${aggregate.first.name}: ${aggregate.firstMoveBlocked} | ${aggregate.second.name}: ${aggregate.secondMoveBlocked}`,
  );
  console.log(
    `blocked by active state ${aggregate.first.name}: ${aggregate.firstActiveBlocked} | ${aggregate.second.name}: ${aggregate.secondActiveBlocked}`,
  );
  console.log(
    `blocked by cooldown ${aggregate.first.name}: ${aggregate.firstCooldownBlocked} | ${aggregate.second.name}: ${aggregate.secondCooldownBlocked}`,
  );
  console.log(
    `dodge attempts/success/fail ${aggregate.first.name}: ${aggregate.firstDodgeAttempts}/${aggregate.firstDodgeSuccesses}/${aggregate.firstDodgeFailures} (${formatRate(aggregate.firstDodgeSuccessRate)}) | ${aggregate.second.name}: ${aggregate.secondDodgeAttempts}/${aggregate.secondDodgeSuccesses}/${aggregate.secondDodgeFailures} (${formatRate(aggregate.secondDodgeSuccessRate)})`,
  );
  console.log(
    `defend attempts/wounds prevented ${aggregate.first.name}: ${aggregate.firstDefendAttempts}/${round(aggregate.firstDefendWoundsPrevented)} | ${aggregate.second.name}: ${aggregate.secondDefendAttempts}/${round(aggregate.secondDefendWoundsPrevented)}`,
  );
  console.log(
    `defence degradation uses dodge/defend ${aggregate.first.name}: ${aggregate.firstDodgeDegradationUses}/${aggregate.firstDefendDegradationUses} | ${aggregate.second.name}: ${aggregate.secondDodgeDegradationUses}/${aggregate.secondDefendDegradationUses}`,
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

function buildLethalityWarnings(
  stats: RoundLengthStats,
  scopeLabel = "overall",
): string[] {
  const warnings: string[] = [];
  if (stats.medianRounds > 6) {
    warnings.push(`${scopeLabel} median rounds exceeds 6`);
  }
  if (stats.averageRounds > 8) {
    warnings.push(`${scopeLabel} average rounds exceeds 8`);
  }
  if (stats.rounds13PlusPercent > 0.1) {
    warnings.push(`${scopeLabel}: more than 10% of fights reach 13+ rounds`);
  }
  if (stats.timeoutPercent > 0.03) {
    warnings.push(`${scopeLabel}: more than 3% of fights hit max-round timeout`);
  }
  if (stats.rounds1To2Percent > 0.3) {
    warnings.push(`${scopeLabel}: more than 30% of fights end in 1-2 rounds`);
  }
  return warnings;
}

function matchupLabel(aggregate: MatchupAggregate): string {
  return `${aggregate.first.name} vs ${aggregate.second.name}`;
}

function printLongTailAttribution(aggregates: MatchupAggregate[]): void {
  const sorted = [...aggregates].sort(
    (a, b) =>
      b.roundLengthStats.rounds13PlusPercent -
        a.roundLengthStats.rounds13PlusPercent ||
      b.roundLengthStats.timeoutPercent - a.roundLengthStats.timeoutPercent ||
      b.roundLengthStats.medianRounds - a.roundLengthStats.medianRounds ||
      b.roundLengthStats.averageRounds - a.roundLengthStats.averageRounds,
  );

  console.log("\n## Long-Tail Attribution");
  for (const aggregate of sorted) {
    const stats = aggregate.roundLengthStats;
    console.log(
      `- ${matchupLabel(aggregate)}: 13+ ${percent(stats.rounds13PlusPercent)} | timeouts ${percent(stats.timeoutPercent)} | median ${round(stats.medianRounds)} | average ${round(stats.averageRounds)} | ${pacingLabel(stats)}`,
    );
    console.log(
      `  classification ${aggregate.expectation.classification}: ${aggregate.expectation.reason}`,
    );
  }
}

function findMatchup(
  aggregates: MatchupAggregate[],
  firstId: string,
  secondId: string,
): MatchupAggregate | null {
  return (
    aggregates.find(
      (aggregate) =>
        (aggregate.first.id === firstId && aggregate.second.id === secondId) ||
        (aggregate.first.id === secondId && aggregate.second.id === firstId),
    ) ?? null
  );
}

function fixtureNameInMatchup(aggregate: MatchupAggregate, fixtureId: string): string {
  if (aggregate.first.id === fixtureId) return aggregate.first.name;
  if (aggregate.second.id === fixtureId) return aggregate.second.name;
  return fixtureId;
}

function winRateForFixture(aggregate: MatchupAggregate, fixtureId: string): number {
  if (aggregate.first.id === fixtureId) return aggregate.firstWins / aggregate.runs;
  if (aggregate.second.id === fixtureId) return aggregate.secondWins / aggregate.runs;
  return 0;
}

function printBurstVsDefenderProbeSummary(
  aggregates: MatchupAggregate[],
): void {
  const probePairs = [
    {
      offenseId: "glass-cannon",
      defenderId: "defender",
      label: "Glass Cannon vs Defender",
    },
    {
      offenseId: "glass-cannon",
      defenderId: "bulwark-defender",
      label: "Glass Cannon vs Bulwark Defender",
    },
    {
      offenseId: "precision-striker",
      defenderId: "defender",
      label: "Precision Striker vs Defender",
    },
    {
      offenseId: "precision-striker",
      defenderId: "bulwark-defender",
      label: "Precision Striker vs Bulwark Defender",
    },
  ];

  console.log("\n## Burst vs Defender Probe Summary");
  console.log(
    "Probe purpose: compare fragile spike and steadier offence into two defender profiles before treating any one pairing as a tuning signal.",
  );
  for (const pair of probePairs) {
    const aggregate = findMatchup(aggregates, pair.offenseId, pair.defenderId);
    if (!aggregate) {
      console.log(`- ${pair.label}: missing from smoke suite`);
      continue;
    }

    const offenseName = fixtureNameInMatchup(aggregate, pair.offenseId);
    const defenderName = fixtureNameInMatchup(aggregate, pair.defenderId);
    console.log(
      `- ${pair.label}: ${offenseName} win ${percent(winRateForFixture(aggregate, pair.offenseId))} | ${defenderName} win ${percent(winRateForFixture(aggregate, pair.defenderId))} | avg ${round(aggregate.roundLengthStats.averageRounds)} | median ${round(aggregate.roundLengthStats.medianRounds)} | 13+ ${percent(aggregate.roundLengthStats.rounds13PlusPercent)} | largest spike ${aggregate.largestSingleTurnSpike}`,
    );
  }
}

function allActionSpikeStats(
  aggregates: MatchupAggregate[],
): ActionSpikeStats[] {
  const combined: Record<string, ActionSpikeStats> = {};
  for (const aggregate of aggregates) {
    addActionSpikeStats(
      combined,
      prefixedActionSpikeStats(aggregate.first, aggregate.firstActionSpikeStats),
    );
    addActionSpikeStats(
      combined,
      prefixedActionSpikeStats(aggregate.second, aggregate.secondActionSpikeStats),
    );
  }
  return Object.values(combined);
}

function printOverallActionSpikeAttribution(
  aggregates: MatchupAggregate[],
): void {
  const actions = allActionSpikeStats(aggregates);
  console.log("\n## Action Spike Attribution");
  printActionSpikeList(
    "Top 10 by max single-use wounds",
    topActionSpikesByMax(actions, 10),
  );
  printActionSpikeList(
    "Top 10 by >50% target HP spike count",
    topActionSpikesByFiftyPercentCount(actions, 10),
  );
  printActionSpikeList(
    "Top 10 by average wounds/use (minimum 10 uses)",
    topActionSpikesByAverage(actions, 10, 10),
  );
}

function computeAggregateRoundLengthStats(
  aggregates: MatchupAggregate[],
): RoundLengthStats {
  const roundLengths = aggregates.flatMap((aggregate) => aggregate.roundLengths);
  const timeoutCount = aggregates.reduce(
    (sum, aggregate) => sum + aggregate.roundLengthStats.timeoutCount,
    0,
  );
  return computeRoundLengthStats(roundLengths, timeoutCount);
}

function printRoundSummaryBlock(
  label: string,
  aggregates: MatchupAggregate[],
): string[] {
  const stats = computeAggregateRoundLengthStats(aggregates);
  const warnings = buildLethalityWarnings(stats, label.toLowerCase());

  console.log(`\n### ${label}`);
  console.log(`total fights ${stats.totalFights}`);
  console.log(
    `average rounds ${round(stats.averageRounds)} | median ${round(stats.medianRounds)} | min ${stats.minRounds} | max ${stats.maxRounds}`,
  );
  console.log(`round distribution ${formatRoundDistribution(stats)}`);
  if (warnings.length > 0) {
    console.log("lethality warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  } else {
    console.log("lethality warnings: none");
  }

  return warnings;
}

function printOverallRoundSummary(aggregates: MatchupAggregate[]): string[] {
  const representativeAggregates = aggregates.filter(
    (aggregate) => aggregate.expectation.classification === "representative",
  );
  const frictionAggregates = aggregates.filter(
    (aggregate) => aggregate.expectation.classification !== "representative",
  );

  console.log("\n## Overall Round-Length / Lethality Summary");
  const warnings = printRoundSummaryBlock("All matchups", aggregates);
  printRoundSummaryBlock("Representative matchups only", representativeAggregates);
  printRoundSummaryBlock(
    "Expected-friction / edge-case matchups",
    frictionAggregates,
  );
  console.log(
    "Long fights in expected role-friction or party-dependent 1v1s are diagnostic context, not direct tuning instructions.",
  );

  printLongTailAttribution(aggregates);
  printBurstVsDefenderProbeSummary(aggregates);
  printOverallActionSpikeAttribution(aggregates);

  return warnings;
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

  const lethalityWarnings = printOverallRoundSummary(aggregates);
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
  console.log(`Lethality warnings: ${lethalityWarnings.length}`);
  if (lethalityWarnings.length > 0) {
    for (const warning of lethalityWarnings) {
      console.log(`- ${warning}`);
    }
  }
  console.log("Exit status: 0 (report-only smoke diagnostic).");
}

main();
