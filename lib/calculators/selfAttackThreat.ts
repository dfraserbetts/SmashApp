import { successCountForRoll } from "@/lib/combat-lab/dice";
import { strengthToTableWoundsPerSuccess } from "@/lib/forge/outputProfile";
import type {
  EffectPacket,
  MonsterTier,
  Power,
  PowerCooldownAuthorityResult,
} from "@/lib/summoning/types";

export const SELF_ATTACK_THREAT_DIAGNOSTIC = {
  bossActionEconomyUnresolved: "SELF_ATTACK_THREAT_BOSS_ACTION_ECONOMY_UNRESOLVED",
  unsupportedRecurrence: "UNSUPPORTED_SELF_ATTACK_AUGMENT_RECURRENCE",
  unsupportedOrdering: "SELF_ATTACK_THREAT_UNSUPPORTED_ORDERING",
  mixedSemanticLegacy: "MIXED_SEMANTIC_LEGACY_SELF_ATTACK_THREAT",
  missingIdentity: "SELF_ATTACK_THREAT_MISSING_IDENTITY",
  missingCooldownAuthority: "SELF_ATTACK_THREAT_MISSING_COOLDOWN_AUTHORITY",
  unsupportedLevel: "SELF_ATTACK_THREAT_UNSUPPORTED_LEVEL",
  noBaselineAttack: "SELF_ATTACK_THREAT_NO_BASELINE_ATTACK",
  activeSnapshotMissingSuccesses: "SELF_ATTACK_THREAT_ACTIVE_SNAPSHOT_MISSING_SUCCESSES",
  activeSnapshotInvalidSuccesses: "SELF_ATTACK_THREAT_ACTIVE_SNAPSHOT_INVALID_SUCCESSES",
} as const;

export type SelfAttackThreatDiagnosticCode =
  (typeof SELF_ATTACK_THREAT_DIAGNOSTIC)[keyof typeof SELF_ATTACK_THREAT_DIAGNOSTIC];

export type SelfAttackThreatDiagnostic = {
  code: SelfAttackThreatDiagnosticCode;
  message: string;
  powerId?: string | null;
  packetId?: string | null;
};

export type SelfAttackThreatHarmSegment = {
  lane: "PHYSICAL" | "MENTAL";
  diceCount: number;
  dieSides: number;
  woundsPerSuccess: number;
  targetMultiplier: number;
  damageTypeCount: number;
  reliabilityMultiplier?: number;
};

export type SelfAttackThreatMainAction = {
  id: string;
  label: string;
  segments: SelfAttackThreatHarmSegment[];
};

export type SelfAttackThreatPowerEntry = {
  id?: string | null;
  name?: string | null;
  authoredPower?: Power | null;
  cooldownAuthority?: PowerCooldownAuthorityResult | null;
};

export type SelfAttackThreatPassiveState = "PREPARED_ACTIVE" | "INACTIVE" | "ACTIVE_SNAPSHOT";

export type SelfAttackThreatActiveSnapshots = Readonly<Record<string, number>>;

export type SelfAttackThreatResult = {
  mode: "NONE" | "SEMANTIC" | "FAIL_CLOSED";
  scoreOverride: number | null;
  eligiblePowerIds: string[];
  fiveTurnHarmWithout: number;
  fiveTurnHarmWith: number;
  fiveTurnDelta: number;
  fiveTurnPhysicalDelta: number;
  fiveTurnMentalDelta: number;
  sustainedMarginalHarm: number;
  rawThreatIncrement: number;
  physicalThreatIncrement: number;
  mentalThreatIncrement: number;
  diagnostics: SelfAttackThreatDiagnostic[];
  policy: {
    level: number;
    tier: MonsterTier;
    horizonTurns: 5;
    mainLanesPerTurn: 1;
    powerLanesPerTurn: 1;
    laneOrder: "MAIN_THEN_POWER";
    passiveState: SelfAttackThreatPassiveState;
    nextLegalTurnFormula: "activationTurn + cooldown + 1";
    atWillThreatAxisMultiplier: number;
  };
  performance: {
    runtimeMs: number;
    statesVisited: number;
    memoizedStateCount: number;
    memoHits: number;
    transitionBranches: number;
    choiceCount: number;
  };
};

type StatusState = {
  packetId: string;
  stacks: number;
  remainingDuration: number;
  modifier: number;
  passive: boolean;
};

type BuffPacketModel = {
  packetId: string;
  potency: number;
  modifier: number;
  duration: number;
  passive: boolean;
};

type PowerModel = {
  id: string;
  packetTieId: string;
  diceCount: number;
  cooldownTurns: number;
  passive: boolean;
  buffPackets: BuffPacketModel[];
  attackSegments: SelfAttackThreatHarmSegment[];
};

type OptimizerState = {
  turn: number;
  nextLegalTurns: Record<string, number>;
  statuses: StatusState[];
  activePassivePowerIds: string[];
};

type HarmVector = { physical: number; mental: number };

type OptimizerValue = HarmVector & {
  total: number;
  activations: number;
  powerActions: number;
};

type OptimizerCounters = SelfAttackThreatResult["performance"];

type TransitionBranch = {
  probability: number;
  state: OptimizerState;
  immediatePowerHarm: HarmVector;
};

type OptimizerChoice = {
  id: string;
  packetTieId: string;
  power: PowerModel | null;
};

type ExtractedModels = {
  mode: SelfAttackThreatResult["mode"];
  powers: PowerModel[];
  eligiblePowerIds: string[];
  diagnostics: SelfAttackThreatDiagnostic[];
};

const HORIZON_TURNS = 5 as const;
const EPSILON = 1e-10;
const PASSIVE_DURATION_SENTINEL = Number.MAX_SAFE_INTEGER;

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function upper(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function packetsForPower(power: Power): EffectPacket[] {
  if (Array.isArray(power.effectPackets) && power.effectPackets.length > 0) {
    return [...power.effectPackets].sort(
      (left, right) =>
        Number(left.packetIndex ?? left.sortOrder ?? 0) -
        Number(right.packetIndex ?? right.sortOrder ?? 0),
    );
  }
  return [...(power.intentions ?? [])].sort(
    (left, right) =>
      Number(left.packetIndex ?? left.sortOrder ?? 0) -
      Number(right.packetIndex ?? right.sortOrder ?? 0),
  );
}

function isSelfPacket(power: Power, packet: EffectPacket): boolean {
  const details = readRecord(packet.detailsJson);
  return (
    upper(packet.applyTo) === "SELF" ||
    upper(details.applyTo) === "SELF" ||
    upper(details.rangeCategory) === "SELF" ||
    (power.rangeCategories ?? []).some((range) => upper(range) === "SELF")
  );
}

function isAttackAugment(power: Power, packet: EffectPacket): boolean {
  const details = readRecord(packet.detailsJson);
  return (
    upper(packet.intention ?? packet.type) === "AUGMENT" &&
    upper(packet.targetedAttribute ?? details.statTarget ?? details.targetedAttribute) === "ATTACK" &&
    isSelfPacket(power, packet)
  );
}

function isSemanticPacket(packet: EffectPacket): boolean {
  const modifier = Number(packet.modifier);
  return packet.modifier !== null && packet.modifier !== undefined && Number.isInteger(modifier) && modifier > 0;
}

function recurringTiming(packet: EffectPacket): boolean {
  const timing = upper(packet.effectTimingType);
  return timing === "START_OF_TURN" || timing === "START_OF_TURN_WHILST_CHANNELLED";
}

function durationForPacket(packet: EffectPacket, primary: EffectPacket): { duration: number; passive: boolean } | null {
  const ownDuration = upper(packet.effectDurationType);
  const primaryDuration = upper(primary.effectDurationType);
  const durationType =
    packet !== primary && (ownDuration === "" || ownDuration === "INSTANT")
      ? primaryDuration
      : ownDuration;
  if (durationType === "PASSIVE") {
    return { duration: PASSIVE_DURATION_SENTINEL, passive: true };
  }
  if (durationType === "UNTIL_TARGET_NEXT_TURN") return { duration: 1, passive: false };
  if (durationType === "TURNS") {
    const turns = Number(
      packet !== primary && (ownDuration === "" || ownDuration === "INSTANT")
        ? primary.effectDurationTurns
        : packet.effectDurationTurns,
    );
    if (!Number.isFinite(turns) || turns < 1) return null;
    return { duration: Math.max(1, Math.trunc(turns)), passive: false };
  }
  return null;
}

function getPowerRangeCategory(power: Power): "MELEE" | "RANGED" | "AOE" | null {
  const ranges = power.rangeCategories ?? [];
  if (ranges.includes("AOE")) return "AOE";
  if (ranges.includes("RANGED")) return "RANGED";
  if (ranges.includes("MELEE")) return "MELEE";
  return null;
}

function getPowerTargetMultiplier(power: Power, aoeMultiplier: number): number {
  const range = getPowerRangeCategory(power);
  if (range === "AOE") return Math.max(1, Number(power.aoeCount ?? 1)) * Math.max(0, aoeMultiplier);
  if (range === "RANGED") return Math.max(1, Number(power.rangedTargets ?? 1));
  if (range === "MELEE") return Math.max(1, Number(power.meleeTargets ?? 1));
  return 1;
}

function damageTypeCount(packet: EffectPacket): number {
  const details = readRecord(packet.detailsJson);
  return Math.max(1, Array.isArray(details.damageTypes) ? details.damageTypes.length : 0);
}

function attackSegmentsForPower(
  power: Power,
  dieSides: number,
  netSuccessMultiplier: number,
  aoeMultiplier: number,
): SelfAttackThreatHarmSegment[] {
  const packets = packetsForPower(power);
  const primary = packets[0];
  const targetMultiplier = getPowerTargetMultiplier(power, aoeMultiplier);
  return packets.flatMap((packet) => {
    if (upper(packet.intention ?? packet.type) !== "ATTACK") return [];
    const details = readRecord(packet.detailsJson);
    const dependency = upper(packet.secondaryDependencyMode ?? "INDEPENDENT");
    const diceCount =
      dependency === "LINKED_TO_PRIMARY" && primary
        ? Math.max(0, Math.trunc(Number(primary.diceCount ?? power.diceCount ?? 0)))
        : Math.max(0, Math.trunc(Number(packet.diceCount ?? power.diceCount ?? 0)));
    if (diceCount <= 0) return [];
    const potency = Math.max(1, Number(packet.potency ?? power.potency ?? 1));
    const lane = upper(packet.woundChannel ?? details.attackMode) === "MENTAL" ? "MENTAL" : "PHYSICAL";
    return [{
      lane,
      diceCount,
      dieSides,
      woundsPerSuccess: strengthToTableWoundsPerSuccess(potency),
      targetMultiplier,
      damageTypeCount: damageTypeCount(packet),
      reliabilityMultiplier: netSuccessMultiplier,
    } satisfies SelfAttackThreatHarmSegment];
  });
}

function failClosed(
  diagnostics: SelfAttackThreatDiagnostic[],
  code: SelfAttackThreatDiagnosticCode,
  message: string,
  powerId?: string | null,
  packetId?: string | null,
): void {
  diagnostics.push({ code, message, powerId, packetId });
}

function extractModels(params: {
  level: number;
  tier: MonsterTier;
  dieSides: number;
  netSuccessMultiplier: number;
  aoeMultiplier: number;
  powers: SelfAttackThreatPowerEntry[];
}): ExtractedModels {
  const diagnostics: SelfAttackThreatDiagnostic[] = [];
  const entries = params.powers.flatMap((entry) => {
    const power = entry.authoredPower;
    return power ? [{ entry, power, packets: packetsForPower(power) }] : [];
  });
  const semanticCandidates = entries.flatMap(({ entry, power, packets }) =>
    packets
      .filter((packet) => isAttackAugment(power, packet) && isSemanticPacket(packet))
      .map((packet) => ({ entry, power, packet })),
  );
  const legacyCandidates = entries.flatMap(({ entry, power, packets }) =>
    packets
      .filter((packet) => isAttackAugment(power, packet) && !isSemanticPacket(packet))
      .map((packet) => ({ entry, power, packet })),
  );
  if (semanticCandidates.length === 0) {
    return { mode: "NONE", powers: [], eligiblePowerIds: [], diagnostics };
  }
  if (legacyCandidates.length > 0) {
    failClosed(
      diagnostics,
      SELF_ATTACK_THREAT_DIAGNOSTIC.mixedSemanticLegacy,
      "Semantic and legacy SELF Attack Augments cannot be combined honestly in one Threat delta.",
    );
  }
  if (params.level !== 3) {
    failClosed(
      diagnostics,
      SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedLevel,
      `Semantic SELF Attack Threat is calibrated only for Level 3, not Level ${params.level}.`,
    );
  }
  if (params.tier === "BOSS") {
    failClosed(
      diagnostics,
      SELF_ATTACK_THREAT_DIAGNOSTIC.bossActionEconomyUnresolved,
      "Boss actionsPerTurn does not yet define an approved SELF Attack Threat lane count.",
    );
  }

  const candidatePowerIds = new Set(
    semanticCandidates
      .map(({ entry, power }) => power.id?.trim() || entry.id?.trim())
      .filter((id): id is string => Boolean(id)),
  );
  const models: PowerModel[] = [];
  for (const { entry, power, packets } of entries) {
    const candidates = packets.filter((packet) => isAttackAugment(power, packet) && isSemanticPacket(packet));
    const attackSegments = attackSegmentsForPower(
      power,
      params.dieSides,
      params.netSuccessMultiplier,
      params.aoeMultiplier,
    );
    if (candidates.length === 0) {
      if (attackSegments.length === 0) continue;
      const powerId = power.id?.trim() || entry.id?.trim();
      if (!powerId || packets.some((packet) => !packet.id?.trim())) {
        failClosed(
          diagnostics,
          SELF_ATTACK_THREAT_DIAGNOSTIC.missingIdentity,
          `Threatening Power ${power.name} requires stable power and packet identities for lane competition.`,
          powerId ?? null,
        );
        continue;
      }
      if (!entry.cooldownAuthority) {
        failClosed(
          diagnostics,
          SELF_ATTACK_THREAT_DIAGNOSTIC.missingCooldownAuthority,
          `Threatening Power ${power.name} lacks authoritative cooldown for lane competition.`,
          powerId,
        );
        continue;
      }
      if (
        upper(power.descriptorChassis ?? "IMMEDIATE") !== "IMMEDIATE" ||
        upper(power.counterMode ?? "NO") === "YES" ||
        packets.some((packet) => upper(packet.effectTimingType ?? "ON_CAST") !== "ON_CAST")
      ) {
        failClosed(
          diagnostics,
          SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedOrdering,
          `Threatening Power ${power.name} has timing or chassis outside the bounded Main-then-Power model.`,
          powerId,
        );
        continue;
      }
      models.push({
        id: powerId,
        packetTieId: packets[0]!.id!,
        diceCount: 0,
        cooldownTurns: entry.cooldownAuthority.effectiveCooldownTurns,
        passive: false,
        buffPackets: [],
        attackSegments,
      });
      continue;
    }

    const powerId = power.id?.trim() || entry.id?.trim();
    const primary = packets[0];
    if (!powerId || !primary?.id?.trim() || candidates.some((packet) => !packet.id?.trim())) {
      failClosed(
        diagnostics,
        SELF_ATTACK_THREAT_DIAGNOSTIC.missingIdentity,
        `SELF Attack Augment ${power.name} requires stable power and packet identities.`,
        powerId ?? null,
      );
      continue;
    }
    if (!isAttackAugment(power, primary) || !isSemanticPacket(primary)) {
      failClosed(
        diagnostics,
        SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedOrdering,
        `SELF Attack Augment ${power.name} must use its semantic Attack packet as the primary application roll.`,
        powerId,
        primary.id ?? null,
      );
      continue;
    }
    if (!entry.cooldownAuthority) {
      failClosed(
        diagnostics,
        SELF_ATTACK_THREAT_DIAGNOSTIC.missingCooldownAuthority,
        `SELF Attack Augment ${power.name} lacks authoritative cooldown.`,
        powerId,
      );
      continue;
    }
    if (upper(power.descriptorChassis ?? "IMMEDIATE") !== "IMMEDIATE") {
      failClosed(
        diagnostics,
        SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedOrdering,
        `SELF Attack Augment ${power.name} uses unsupported chassis ${String(power.descriptorChassis)}.`,
        powerId,
      );
      continue;
    }
    if (upper(power.counterMode ?? "NO") === "YES") {
      failClosed(
        diagnostics,
        SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedOrdering,
        `Response SELF Attack Augment ${power.name} is outside the Main-then-Power contract.`,
        powerId,
      );
      continue;
    }
    if (packets.some((packet) => upper(packet.intention ?? packet.type) === "DEFENCE")) {
      failClosed(
        diagnostics,
        SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedOrdering,
        `SELF Attack Augment ${power.name} contains Defence setup that can change lane ordering.`,
        powerId,
      );
      continue;
    }
    if (candidates.some(recurringTiming)) {
      failClosed(
        diagnostics,
        SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedRecurrence,
        `Recurring SELF Attack Augment ${power.name} is authorable but is not executable as recurring buff runtime.`,
        powerId,
      );
      continue;
    }
    if (candidates.some((packet) => upper(packet.effectTimingType ?? "ON_CAST") !== "ON_CAST")) {
      failClosed(
        diagnostics,
        SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedOrdering,
        `SELF Attack Augment ${power.name} uses unsupported application timing.`,
        powerId,
      );
      continue;
    }
    if (
      candidates.some(
        (packet) =>
          packet !== primary && upper(packet.secondaryDependencyMode ?? "LINKED_TO_PRIMARY") !== "LINKED_TO_PRIMARY",
      )
    ) {
      failClosed(
        diagnostics,
        SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedOrdering,
        `SELF Attack Augment ${power.name} has an independent or conditional semantic secondary roll.`,
        powerId,
      );
      continue;
    }
    if (attackSegments.length > 0) {
      failClosed(
        diagnostics,
        SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedOrdering,
        `SELF Attack Augment ${power.name} mixes Attack payload with buff application in one Power Action.`,
        powerId,
      );
      continue;
    }
    const buffPackets: BuffPacketModel[] = [];
    let invalidDuration = false;
    for (const packet of candidates) {
      const duration = durationForPacket(packet, primary);
      if (!duration) {
        invalidDuration = true;
        failClosed(
          diagnostics,
          SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedOrdering,
          `SELF Attack Augment packet ${packet.id} has unsupported or empty duration.`,
          powerId,
          packet.id ?? null,
        );
        break;
      }
      buffPackets.push({
        packetId: packet.id!,
        potency: Math.max(1, Math.trunc(Number(packet.potency ?? power.potency ?? 1))),
        modifier: Math.max(1, Math.min(5, Math.trunc(Number(packet.modifier)))),
        duration: duration.duration,
        passive: duration.passive,
      });
    }
    if (invalidDuration) continue;
    const passive = buffPackets.some((packet) => packet.passive);
    if (passive && !buffPackets.every((packet) => packet.passive)) {
      failClosed(
        diagnostics,
        SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedOrdering,
        `SELF Attack Augment ${power.name} mixes Passive and finite Attack modifiers.`,
        powerId,
      );
      continue;
    }
    models.push({
      id: powerId,
      packetTieId: primary.id!,
      diceCount: Math.max(0, Math.trunc(Number(primary.diceCount ?? power.diceCount ?? 0))),
      cooldownTurns: Math.max(1, Math.trunc(entry.cooldownAuthority.effectiveCooldownTurns)),
      passive,
      buffPackets,
      attackSegments: [],
    });
  }

  if (diagnostics.length > 0) {
    return {
      mode: "FAIL_CLOSED",
      powers: [],
      eligiblePowerIds: [...candidatePowerIds].sort(),
      diagnostics,
    };
  }
  const eligiblePowerIds = models
    .filter((power) => power.buffPackets.length > 0)
    .map((power) => power.id)
    .sort();
  return { mode: "SEMANTIC", powers: models, eligiblePowerIds, diagnostics };
}

function successDistribution(diceCount: number, dieSides: number, modifier: number): number[] {
  let distribution = [1];
  for (let die = 0; die < Math.max(0, Math.trunc(diceCount)); die += 1) {
    const next: number[] = [];
    for (let successes = 0; successes < distribution.length; successes += 1) {
      for (let face = 1; face <= dieSides; face += 1) {
        const result = successes + successCountForRoll(face, modifier);
        next[result] = (next[result] ?? 0) + distribution[successes]! / dieSides;
      }
    }
    distribution = next;
  }
  return distribution;
}

function expectedSuccesses(diceCount: number, dieSides: number, modifier: number): number {
  return successDistribution(diceCount, dieSides, modifier).reduce(
    (sum, probability, successes) => sum + probability * successes,
    0,
  );
}

function activeModifier(statuses: StatusState[]): number {
  const total = statuses
    .filter((status) => status.stacks > 0 && status.remainingDuration > 0)
    .reduce((sum, status) => sum + status.modifier, 0);
  return Math.max(-5, Math.min(5, total));
}

function harmForSegments(segments: SelfAttackThreatHarmSegment[], modifier: number): HarmVector {
  const result: HarmVector = { physical: 0, mental: 0 };
  for (const segment of segments) {
    const contribution =
      expectedSuccesses(segment.diceCount, segment.dieSides, modifier) *
      Math.max(0, segment.woundsPerSuccess) *
      Math.max(0, segment.targetMultiplier) *
      Math.max(1, segment.damageTypeCount) *
      Math.max(0, segment.reliabilityMultiplier ?? 1);
    if (segment.lane === "MENTAL") result.mental += contribution;
    else result.physical += contribution;
  }
  return result;
}

function bestMainHarm(actions: SelfAttackThreatMainAction[], modifier: number): HarmVector {
  let best: { id: string; harm: HarmVector } | null = null;
  for (const action of actions) {
    const harm = harmForSegments(action.segments, modifier);
    const total = harm.physical + harm.mental;
    const bestTotal = best ? best.harm.physical + best.harm.mental : Number.NEGATIVE_INFINITY;
    if (total > bestTotal + EPSILON || (Math.abs(total - bestTotal) <= EPSILON && action.id < (best?.id ?? ""))) {
      best = { id: action.id, harm };
    }
  }
  return best?.harm ?? { physical: 0, mental: 0 };
}

function applyBuff(power: PowerModel, statuses: StatusState[], successes: number): StatusState[] {
  if (successes <= 0) return statuses.map((status) => ({ ...status }));
  const next = statuses.map((status) => ({ ...status }));
  for (const packet of power.buffPackets) {
    const existing = next.find((status) => status.packetId === packet.packetId);
    const stacks = successes * packet.potency;
    if (existing) {
      existing.stacks = Math.max(existing.stacks, stacks);
      existing.remainingDuration = packet.duration;
      existing.modifier = packet.modifier;
      existing.passive = packet.passive;
    } else {
      next.push({
        packetId: packet.packetId,
        stacks,
        remainingDuration: packet.duration,
        modifier: packet.modifier,
        passive: packet.passive,
      });
    }
  }
  return normalizeStatuses(next);
}

function normalizeStatuses(statuses: StatusState[]): StatusState[] {
  return statuses
    .filter((status) => status.stacks > 0 && status.remainingDuration > 0)
    .sort((left, right) => left.packetId.localeCompare(right.packetId));
}

function advanceStatuses(statuses: StatusState[]): StatusState[] {
  return normalizeStatuses(
    statuses.map((status) => ({
      ...status,
      stacks: Math.max(0, status.stacks - 1),
      remainingDuration: status.passive
        ? status.remainingDuration
        : Math.max(0, status.remainingDuration - 1),
    })),
  );
}

function stateKey(state: OptimizerState): string {
  return [
    state.turn,
    Object.entries(state.nextLegalTurns)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, turn]) => `${id}:${turn}`)
      .join(","),
    state.statuses
      .map((status) => `${status.packetId}:${status.stacks}:${status.remainingDuration}`)
      .join(","),
    [...state.activePassivePowerIds].sort().join(","),
  ].join("|");
}

function addValue(left: OptimizerValue, right: OptimizerValue, factor = 1): OptimizerValue {
  return {
    physical: left.physical + right.physical * factor,
    mental: left.mental + right.mental * factor,
    total: left.total + right.total * factor,
    activations: left.activations + right.activations * factor,
    powerActions: left.powerActions + right.powerActions * factor,
  };
}

function betterChoice(
  candidate: OptimizerValue,
  candidateChoice: OptimizerChoice,
  best: OptimizerValue | null,
  bestChoice: OptimizerChoice | null,
): boolean {
  if (!best || !bestChoice) return true;
  if (candidate.total > best.total + EPSILON) return true;
  if (Math.abs(candidate.total - best.total) > EPSILON) return false;
  if (candidate.activations < best.activations - EPSILON) return true;
  if (Math.abs(candidate.activations - best.activations) > EPSILON) return false;
  if (candidate.powerActions < best.powerActions - EPSILON) return true;
  if (Math.abs(candidate.powerActions - best.powerActions) > EPSILON) return false;
  if (candidateChoice.id !== bestChoice.id) return candidateChoice.id < bestChoice.id;
  return candidateChoice.packetTieId < bestChoice.packetTieId;
}

function optimize(params: {
  mainActions: SelfAttackThreatMainAction[];
  powers: PowerModel[];
  dieSides: number;
  includeBuffs: boolean;
  passiveState: SelfAttackThreatPassiveState;
  passiveActivationSourceSuccessesByPowerId: SelfAttackThreatActiveSnapshots;
  counters: OptimizerCounters;
}): OptimizerValue {
  const memo = new Map<string, OptimizerValue>();
  const passivePowers = params.powers.filter((power) => power.passive && power.buffPackets.length > 0);
  const activePowers = params.powers.filter((power) => !power.passive || power.attackSegments.length > 0);

  const solve = (state: OptimizerState): OptimizerValue => {
    if (state.turn > HORIZON_TURNS) {
      return { physical: 0, mental: 0, total: 0, activations: 0, powerActions: 0 };
    }
    const key = stateKey(state);
    const cached = memo.get(key);
    if (cached) {
      params.counters.memoHits += 1;
      return cached;
    }
    params.counters.statesVisited += 1;
    const modifier = activeModifier(state.statuses);
    const mainHarm = bestMainHarm(params.mainActions, modifier);
    const choices: OptimizerChoice[] = [{ id: "~none", packetTieId: "~none", power: null }];
    for (const power of activePowers) {
      const buffAvailable = params.includeBuffs && power.buffPackets.length > 0;
      const attackAvailable = power.attackSegments.length > 0;
      if (!buffAvailable && !attackAvailable) continue;
      if ((state.nextLegalTurns[power.id] ?? 1) <= state.turn) {
        choices.push({ id: power.id, packetTieId: power.packetTieId, power });
      }
    }
    if (params.includeBuffs && params.passiveState === "INACTIVE") {
      for (const power of passivePowers) {
        if (!state.activePassivePowerIds.includes(power.id)) {
          choices.push({ id: power.id, packetTieId: power.packetTieId, power });
        }
      }
    }
    choices.sort((left, right) => left.id.localeCompare(right.id) || left.packetTieId.localeCompare(right.packetTieId));

    let best: OptimizerValue | null = null;
    let bestChoice: OptimizerChoice | null = null;
    for (const choice of choices) {
      params.counters.choiceCount += 1;
      const power = choice.power;
      const immediatePowerHarm = power
        ? harmForSegments(power.attackSegments, modifier)
        : { physical: 0, mental: 0 };
      let branches: TransitionBranch[];
      if (!power || !params.includeBuffs || power.buffPackets.length === 0) {
        const nextLegalTurns = power
          ? { ...state.nextLegalTurns, [power.id]: state.turn + power.cooldownTurns + 1 }
          : state.nextLegalTurns;
        branches = [{
          probability: 1,
          immediatePowerHarm,
          state: {
            turn: state.turn + 1,
            nextLegalTurns,
            statuses: advanceStatuses(state.statuses),
            activePassivePowerIds: state.activePassivePowerIds,
          },
        }];
      } else {
        const distribution = successDistribution(power.diceCount, params.dieSides, modifier);
        branches = distribution.flatMap((probability, successes) => {
          if (!(probability > 0)) return [];
          const passiveSuccess = power.passive && successes > 0;
          const nextLegalTurns = power.passive
            ? state.nextLegalTurns
            : { ...state.nextLegalTurns, [power.id]: state.turn + power.cooldownTurns + 1 };
          return [{
            probability,
            immediatePowerHarm,
            state: {
              turn: state.turn + 1,
              nextLegalTurns,
              statuses: advanceStatuses(applyBuff(power, state.statuses, successes)),
              activePassivePowerIds: passiveSuccess
                ? [...state.activePassivePowerIds, power.id].sort()
                : state.activePassivePowerIds,
            },
          }];
        });
      }
      params.counters.transitionBranches += branches.length;
      let value: OptimizerValue = {
        physical: mainHarm.physical,
        mental: mainHarm.mental,
        total: mainHarm.physical + mainHarm.mental,
        activations: power?.buffPackets.length ? 1 : 0,
        powerActions: power ? 1 : 0,
      };
      for (const branch of branches) {
        const future = solve(branch.state);
        const branchValue: OptimizerValue = {
          physical: branch.immediatePowerHarm.physical + future.physical,
          mental: branch.immediatePowerHarm.mental + future.mental,
          total:
            branch.immediatePowerHarm.physical +
            branch.immediatePowerHarm.mental +
            future.total,
          activations: future.activations,
          powerActions: future.powerActions,
        };
        value = addValue(value, branchValue, branch.probability);
      }
      if (betterChoice(value, choice, best, bestChoice)) {
        best = value;
        bestChoice = choice;
      }
    }
    const resolved = best ?? { physical: 0, mental: 0, total: 0, activations: 0, powerActions: 0 };
    memo.set(key, resolved);
    params.counters.memoizedStateCount = Math.max(params.counters.memoizedStateCount, memo.size);
    return resolved;
  };

  let initialBranches: Array<{ probability: number; statuses: StatusState[] }> = [
    { probability: 1, statuses: [] },
  ];
  if (params.includeBuffs && params.passiveState === "PREPARED_ACTIVE") {
    for (const power of passivePowers) {
      initialBranches = initialBranches.flatMap((branch) =>
        successDistribution(power.diceCount, params.dieSides, activeModifier(branch.statuses)).flatMap(
          (probability, successes) =>
            probability > 0
              ? [{
                  probability: branch.probability * probability,
                  statuses: applyBuff(power, branch.statuses, successes),
                }]
              : [],
        ),
      );
    }
  } else if (params.includeBuffs && params.passiveState === "ACTIVE_SNAPSHOT") {
    initialBranches = [{
      probability: 1,
      statuses: passivePowers.reduce(
        (statuses, power) =>
          applyBuff(
            power,
            statuses,
            params.passiveActivationSourceSuccessesByPowerId[power.id]!,
          ),
        [] as StatusState[],
      ),
    }];
  }
  let total: OptimizerValue = { physical: 0, mental: 0, total: 0, activations: 0, powerActions: 0 };
  for (const branch of initialBranches) {
    const result = solve({
      turn: 1,
      nextLegalTurns: {},
      statuses: branch.statuses,
      activePassivePowerIds:
        params.passiveState === "PREPARED_ACTIVE" || params.passiveState === "ACTIVE_SNAPSHOT"
          ? passivePowers.map((power) => power.id).sort()
          : [],
    });
    total = addValue(total, result, branch.probability);
  }
  return total;
}

function emptyResult(params: {
  startedAt: number;
  mode: SelfAttackThreatResult["mode"];
  level: number;
  tier: MonsterTier;
  passiveState: SelfAttackThreatPassiveState;
  atWillThreatAxisMultiplier: number;
  diagnostics?: SelfAttackThreatDiagnostic[];
  eligiblePowerIds?: string[];
}): SelfAttackThreatResult {
  return {
    mode: params.mode,
    scoreOverride: params.mode === "SEMANTIC" ? 0 : null,
    eligiblePowerIds: params.eligiblePowerIds ?? [],
    fiveTurnHarmWithout: 0,
    fiveTurnHarmWith: 0,
    fiveTurnDelta: 0,
    fiveTurnPhysicalDelta: 0,
    fiveTurnMentalDelta: 0,
    sustainedMarginalHarm: 0,
    rawThreatIncrement: 0,
    physicalThreatIncrement: 0,
    mentalThreatIncrement: 0,
    diagnostics: params.diagnostics ?? [],
    policy: {
      level: params.level,
      tier: params.tier,
      horizonTurns: HORIZON_TURNS,
      mainLanesPerTurn: 1,
      powerLanesPerTurn: 1,
      laneOrder: "MAIN_THEN_POWER",
      passiveState: params.passiveState,
      nextLegalTurnFormula: "activationTurn + cooldown + 1",
      atWillThreatAxisMultiplier: params.atWillThreatAxisMultiplier,
    },
    performance: {
      runtimeMs: performance.now() - params.startedAt,
      statesVisited: 0,
      memoizedStateCount: 0,
      memoHits: 0,
      transitionBranches: 0,
      choiceCount: 0,
    },
  };
}

export function computeLevel3SelfAttackThreat(params: {
  level: number;
  tier: MonsterTier;
  dieSides: number;
  mainActions: SelfAttackThreatMainAction[];
  powers: SelfAttackThreatPowerEntry[];
  netSuccessMultiplier: number;
  aoeMultiplier: number;
  atWillThreatAxisMultiplier: number;
  passiveState?: SelfAttackThreatPassiveState;
  passiveActivationSourceSuccessesByPowerId?: SelfAttackThreatActiveSnapshots;
}): SelfAttackThreatResult {
  const startedAt = performance.now();
  const passiveState = params.passiveState ?? "PREPARED_ACTIVE";
  const extracted = extractModels(params);
  if (extracted.mode === "NONE") {
    return emptyResult({
      startedAt,
      mode: "NONE",
      level: params.level,
      tier: params.tier,
      passiveState,
      atWillThreatAxisMultiplier: params.atWillThreatAxisMultiplier,
    });
  }
  if (params.mainActions.length === 0 || params.mainActions.every((action) => action.segments.length === 0)) {
    failClosed(
      extracted.diagnostics,
      SELF_ATTACK_THREAT_DIAGNOSTIC.noBaselineAttack,
      "Semantic SELF Attack Threat requires a usable natural or equipped baseline attack.",
    );
  }
  const passiveActivationSourceSuccessesByPowerId =
    params.passiveActivationSourceSuccessesByPowerId ?? {};
  if (passiveState === "ACTIVE_SNAPSHOT" && extracted.mode === "SEMANTIC") {
    for (const power of extracted.powers.filter(
      (candidate) => candidate.passive && candidate.buffPackets.length > 0,
    )) {
      if (!Object.prototype.hasOwnProperty.call(passiveActivationSourceSuccessesByPowerId, power.id)) {
        failClosed(
          extracted.diagnostics,
          SELF_ATTACK_THREAT_DIAGNOSTIC.activeSnapshotMissingSuccesses,
          `Active Passive SELF Attack Augment ${power.id} lacks stored activation source successes.`,
          power.id,
        );
        continue;
      }
      const storedSuccesses = passiveActivationSourceSuccessesByPowerId[power.id];
      if (
        !Number.isFinite(storedSuccesses) ||
        !Number.isInteger(storedSuccesses) ||
        storedSuccesses < 0
      ) {
        failClosed(
          extracted.diagnostics,
          SELF_ATTACK_THREAT_DIAGNOSTIC.activeSnapshotInvalidSuccesses,
          `Active Passive SELF Attack Augment ${power.id} has invalid stored activation source successes.`,
          power.id,
        );
      }
    }
  }
  if (extracted.mode === "FAIL_CLOSED" || extracted.diagnostics.length > 0) {
    return emptyResult({
      startedAt,
      mode: "FAIL_CLOSED",
      level: params.level,
      tier: params.tier,
      passiveState,
      atWillThreatAxisMultiplier: params.atWillThreatAxisMultiplier,
      diagnostics: extracted.diagnostics,
      eligiblePowerIds: extracted.eligiblePowerIds,
    });
  }

  const counters: OptimizerCounters = {
    runtimeMs: 0,
    statesVisited: 0,
    memoizedStateCount: 0,
    memoHits: 0,
    transitionBranches: 0,
    choiceCount: 0,
  };
  const without = optimize({
    mainActions: params.mainActions,
    powers: extracted.powers,
    dieSides: params.dieSides,
    includeBuffs: false,
    passiveState,
    passiveActivationSourceSuccessesByPowerId,
    counters,
  });
  const withBuffs = optimize({
    mainActions: params.mainActions,
    powers: extracted.powers,
    dieSides: params.dieSides,
    includeBuffs: true,
    passiveState,
    passiveActivationSourceSuccessesByPowerId,
    counters,
  });
  const rawPhysicalDifference = withBuffs.physical - without.physical;
  const rawMentalDifference = withBuffs.mental - without.mental;
  const fiveTurnDelta = Math.max(0, withBuffs.total - without.total);
  const positiveLaneDifference =
    Math.max(0, rawPhysicalDifference) + Math.max(0, rawMentalDifference);
  const fiveTurnPhysicalDelta =
    positiveLaneDifference > 0
      ? fiveTurnDelta * (Math.max(0, rawPhysicalDifference) / positiveLaneDifference)
      : 0;
  const fiveTurnMentalDelta = Math.max(0, fiveTurnDelta - fiveTurnPhysicalDelta);
  const sustainedMarginalHarm = fiveTurnDelta / HORIZON_TURNS;
  const multiplier = Math.max(0, params.atWillThreatAxisMultiplier);
  counters.runtimeMs = performance.now() - startedAt;

  return {
    mode: "SEMANTIC",
    scoreOverride: fiveTurnDelta,
    eligiblePowerIds: extracted.eligiblePowerIds,
    fiveTurnHarmWithout: without.total,
    fiveTurnHarmWith: withBuffs.total,
    fiveTurnDelta,
    fiveTurnPhysicalDelta,
    fiveTurnMentalDelta,
    sustainedMarginalHarm,
    rawThreatIncrement: sustainedMarginalHarm * multiplier,
    physicalThreatIncrement: (fiveTurnPhysicalDelta / HORIZON_TURNS) * multiplier,
    mentalThreatIncrement: (fiveTurnMentalDelta / HORIZON_TURNS) * multiplier,
    diagnostics: [],
    policy: {
      level: params.level,
      tier: params.tier,
      horizonTurns: HORIZON_TURNS,
      mainLanesPerTurn: 1,
      powerLanesPerTurn: 1,
      laneOrder: "MAIN_THEN_POWER",
      passiveState,
      nextLegalTurnFormula: "activationTurn + cooldown + 1",
      atWillThreatAxisMultiplier: multiplier,
    },
    performance: counters,
  };
}
