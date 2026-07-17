import { successCountForRoll } from "@/lib/combat-lab/dice";
import type { CalculatorConfig } from "@/lib/calculators/calculatorConfig";
import type {
  EffectPacket,
  MonsterTier,
  Power,
  PowerCooldownAuthorityResult,
} from "@/lib/summoning/types";

export const SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC = {
  missingIdentity: "SELF_DEFENCE_SURVIVABILITY_MISSING_IDENTITY",
  missingCooldownAuthority: "SELF_DEFENCE_SURVIVABILITY_MISSING_COOLDOWN_AUTHORITY",
  unsupportedLevel: "SELF_DEFENCE_SURVIVABILITY_UNSUPPORTED_LEVEL",
  bossActionEconomyUnresolved: "SELF_DEFENCE_SURVIVABILITY_BOSS_ACTION_ECONOMY_UNRESOLVED",
  unsupportedRecurrence: "SELF_DEFENCE_SURVIVABILITY_UNSUPPORTED_RECURRENCE",
  mixedSemanticLegacy: "SELF_DEFENCE_SURVIVABILITY_MIXED_SEMANTIC_LEGACY",
  unsupportedOrdering: "SELF_DEFENCE_SURVIVABILITY_UNSUPPORTED_ORDERING",
  noReferenceAttack: "SELF_DEFENCE_SURVIVABILITY_NO_REFERENCE_ATTACK",
  activeSnapshotMissingSuccesses: "SELF_DEFENCE_SURVIVABILITY_ACTIVE_SNAPSHOT_MISSING_SUCCESSES",
  activeSnapshotInvalidSuccesses: "SELF_DEFENCE_SURVIVABILITY_ACTIVE_SNAPSHOT_INVALID_SUCCESSES",
  fortitudeNoGenericIncomingHarmEffect: "SELF_FORTITUDE_NO_GENERIC_INCOMING_HARM_EFFECT",
} as const;

export type SelfGuardSurvivabilityDiagnosticCode =
  (typeof SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC)[keyof typeof SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC];

export type SelfGuardSurvivabilityDiagnostic = {
  code: SelfGuardSurvivabilityDiagnosticCode;
  message: string;
  powerId?: string | null;
  packetId?: string | null;
};

export type SelfGuardSurvivabilityPowerEntry = {
  id?: string | null;
  name?: string | null;
  authoredPower?: Power | null;
  cooldownAuthority?: PowerCooldownAuthorityResult | null;
};

export type SelfGuardSurvivabilityPassiveState =
  | "PREPARED_ACTIVE"
  | "INACTIVE"
  | "ACTIVE_SNAPSHOT";

export type SelfGuardSurvivabilityActiveSnapshots = Readonly<Record<string, number>>;

export type SelfGuardSurvivabilityResult = {
  mode: "NONE" | "SEMANTIC" | "FAIL_CLOSED";
  scoreOverride: number | null;
  eligiblePowerIds: string[];
  eligibleGuardPowerIds: string[];
  eligibleFortitudePowerIds: string[];
  fiveTurnHarmWithout: number;
  fiveTurnHarmWith: number;
  preventedHarm: number;
  sustainedPrevention: number;
  semanticDurabilityRatio: number;
  semanticSupplementalRatio: number;
  diagnostics: SelfGuardSurvivabilityDiagnostic[];
  policy: {
    level: number;
    tier: MonsterTier;
    horizonTurns: 5;
    powerLanesPerTurn: 1;
    incomingAttackTiming: "AFTER_CREATURE_END_OF_TURN";
    incomingDiceCount: number;
    incomingDieSides: number;
    incomingWoundsPerSuccess: number;
    passiveState: SelfGuardSurvivabilityPassiveState;
    nextLegalTurnFormula: "activationTurn + cooldown + 1";
    sameAttributeModifierClamp: 5;
    supplementalContributionMaxRatio: number;
    majorInjuryContribution: 0;
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

type DefensiveAttribute = "GUARD" | "FORTITUDE";

type StatusState = {
  packetId: string;
  stacks: number;
  remainingDuration: number;
  modifier: number;
  passive: boolean;
};

type GuardPacketModel = {
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
  activationAttribute: DefensiveAttribute;
  activationDieSides: number;
  cooldownTurns: number;
  passive: boolean;
  guardPackets: GuardPacketModel[];
};

type OptimizerState = {
  turn: number;
  nextLegalTurns: Record<string, number>;
  statuses: StatusState[];
  activePassivePowerIds: string[];
};

type OptimizerValue = {
  harm: number;
  activations: number;
  powerActions: number;
};

type OptimizerChoice = {
  id: string;
  packetTieId: string;
  power: PowerModel | null;
};

type OptimizerCounters = SelfGuardSurvivabilityResult["performance"];

type ExtractedModels = {
  mode: SelfGuardSurvivabilityResult["mode"];
  powers: PowerModel[];
  eligiblePowerIds: string[];
  eligibleGuardPowerIds: string[];
  eligibleFortitudePowerIds: string[];
  diagnostics: SelfGuardSurvivabilityDiagnostic[];
};

type ReferenceDefence = {
  guardDieSides: number;
  physicalDefenceDice: number;
  dodgeDice: number;
  blockPerSuccess: number;
  protection: number;
  resistCoverage: number;
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
  const packets = Array.isArray(power.effectPackets) && power.effectPackets.length > 0
    ? power.effectPackets
    : (power.intentions ?? []);
  return [...packets].sort(
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

function defensiveAttribute(packet: EffectPacket): DefensiveAttribute | null {
  const details = readRecord(packet.detailsJson);
  const attribute = upper(packet.targetedAttribute ?? details.statTarget ?? details.targetedAttribute);
  if (attribute === "GUARD") return "GUARD";
  if (attribute === "FORTITUDE") return "FORTITUDE";
  return null;
}

function isSelfDefensiveAugment(power: Power, packet: EffectPacket): boolean {
  return (
    upper(packet.intention ?? packet.type) === "AUGMENT" &&
    defensiveAttribute(packet) !== null &&
    isSelfPacket(power, packet)
  );
}

function isSemanticPacket(packet: EffectPacket): boolean {
  const modifier = Number(packet.modifier);
  return (
    packet.modifier !== null &&
    packet.modifier !== undefined &&
    Number.isInteger(modifier) &&
    modifier > 0
  );
}

function recurringTiming(packet: EffectPacket): boolean {
  const timing = upper(packet.effectTimingType);
  return timing === "START_OF_TURN" || timing === "START_OF_TURN_WHILST_CHANNELLED";
}

function durationForPacket(
  packet: EffectPacket,
  primary: EffectPacket,
): { duration: number; passive: boolean } | null {
  const ownDuration = upper(packet.effectDurationType);
  const primaryDuration = upper(primary.effectDurationType);
  const durationType =
    packet !== primary && (ownDuration === "" || ownDuration === "INSTANT")
      ? primaryDuration
      : ownDuration;
  if (durationType === "PASSIVE") {
    return { duration: PASSIVE_DURATION_SENTINEL, passive: true };
  }
  if (durationType === "UNTIL_TARGET_NEXT_TURN") {
    return { duration: 1, passive: false };
  }
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

function addDiagnostic(
  diagnostics: SelfGuardSurvivabilityDiagnostic[],
  code: SelfGuardSurvivabilityDiagnosticCode,
  message: string,
  powerId?: string | null,
  packetId?: string | null,
): void {
  diagnostics.push({ code, message, powerId, packetId });
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function extractModels(params: {
  level: number;
  tier: MonsterTier;
  guardDieSides: number;
  fortitudeDieSides: number;
  powers: SelfGuardSurvivabilityPowerEntry[];
}): ExtractedModels {
  const diagnostics: SelfGuardSurvivabilityDiagnostic[] = [];
  const entries = params.powers.flatMap((entry) => {
    const power = entry.authoredPower;
    return power ? [{ entry, power, packets: packetsForPower(power) }] : [];
  });
  const semanticCandidates = entries.flatMap(({ entry, power, packets }) =>
    packets
      .filter((packet) => isSelfDefensiveAugment(power, packet) && isSemanticPacket(packet))
      .map((packet) => ({ entry, power, packet })),
  );
  if (semanticCandidates.length === 0) {
    return {
      mode: "NONE",
      powers: [],
      eligiblePowerIds: [],
      eligibleGuardPowerIds: [],
      eligibleFortitudePowerIds: [],
      diagnostics,
    };
  }
  if (params.level !== 3) {
    addDiagnostic(
      diagnostics,
      SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedLevel,
      `Semantic SELF defence Survivability is calibrated only for Level 3, not Level ${params.level}.`,
    );
  }
  if (params.tier === "BOSS") {
    addDiagnostic(
      diagnostics,
      SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.bossActionEconomyUnresolved,
      "Boss Power-lane action economy is outside the bounded SELF defence Survivability model.",
    );
  }

  const candidatePowerIds = new Set<string>();
  const guardPowerIds = new Set<string>();
  const fortitudePowerIds = new Set<string>();
  const models: PowerModel[] = [];
  for (const { entry, power, packets } of entries) {
    const candidates = packets.filter(
      (packet) => isSelfDefensiveAugment(power, packet) && isSemanticPacket(packet),
    );
    if (candidates.length === 0) continue;
    const powerId = power.id?.trim() || entry.id?.trim();
    if (powerId) candidatePowerIds.add(powerId);
    const legacyDefensivePackets = packets.filter(
      (packet) => isSelfDefensiveAugment(power, packet) && !isSemanticPacket(packet),
    );
    if (legacyDefensivePackets.length > 0) {
      addDiagnostic(
        diagnostics,
        SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.mixedSemanticLegacy,
        `SELF defensive Power ${power.name} mixes semantic and legacy Guard/Fortitude packets.`,
        powerId ?? null,
        legacyDefensivePackets[0]?.id ?? null,
      );
      continue;
    }
    const primary = packets[0];
    if (!powerId || !primary?.id?.trim() || candidates.some((packet) => !packet.id?.trim())) {
      addDiagnostic(
        diagnostics,
        SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.missingIdentity,
        `SELF defensive Augment ${power.name} requires stable power and packet identities.`,
        powerId ?? null,
      );
      continue;
    }
    if (!candidates.includes(primary)) {
      addDiagnostic(
        diagnostics,
        SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
        `SELF defensive Augment ${power.name} must use its semantic Guard/Fortitude packet as the primary application roll.`,
        powerId,
        primary.id ?? null,
      );
      continue;
    }
    if (!entry.cooldownAuthority) {
      addDiagnostic(
        diagnostics,
        SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.missingCooldownAuthority,
        `SELF defensive Augment ${power.name} lacks authoritative cooldown.`,
        powerId,
      );
      continue;
    }
    if (upper(power.descriptorChassis ?? "IMMEDIATE") !== "IMMEDIATE") {
      addDiagnostic(
        diagnostics,
        SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
        `SELF defensive Augment ${power.name} uses unsupported chassis ${String(power.descriptorChassis)}.`,
        powerId,
      );
      continue;
    }
    if (upper(power.counterMode ?? "NO") === "YES") {
      addDiagnostic(
        diagnostics,
        SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
        `Response SELF defensive Augment ${power.name} is outside the one-Power-lane contract.`,
        powerId,
      );
      continue;
    }
    if (candidates.some(recurringTiming)) {
      addDiagnostic(
        diagnostics,
        SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedRecurrence,
        `Recurring SELF defensive Augment ${power.name} is authorable but lacks supported recurring buff runtime.`,
        powerId,
      );
      continue;
    }
    if (candidates.some((packet) => upper(packet.effectTimingType ?? "ON_CAST") !== "ON_CAST")) {
      addDiagnostic(
        diagnostics,
        SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
        `SELF defensive Augment ${power.name} uses unsupported application timing.`,
        powerId,
      );
      continue;
    }
    if (packets.some((packet) => !candidates.includes(packet))) {
      addDiagnostic(
        diagnostics,
        SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
        `SELF defensive Augment ${power.name} mixes context-dependent payload with its defensive setup.`,
        powerId,
      );
      continue;
    }
    if (
      candidates.some(
        (packet) =>
          packet !== primary &&
          upper(packet.secondaryDependencyMode ?? "LINKED_TO_PRIMARY") !== "LINKED_TO_PRIMARY",
      )
    ) {
      addDiagnostic(
        diagnostics,
        SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
        `SELF defensive Augment ${power.name} has an independent or conditional semantic secondary roll.`,
        powerId,
      );
      continue;
    }

    const distinctCandidates = candidates.filter(
      (packet, index, all) => all.findIndex((candidate) => candidate.id === packet.id) === index,
    );
    const guardPackets: GuardPacketModel[] = [];
    let invalidDuration = false;
    let passive: boolean | null = null;
    for (const packet of distinctCandidates) {
      const duration = durationForPacket(packet, primary);
      if (!duration) {
        invalidDuration = true;
        addDiagnostic(
          diagnostics,
          SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
          `SELF defensive Augment packet ${packet.id} has unsupported or empty duration.`,
          powerId,
          packet.id ?? null,
        );
        break;
      }
      if (passive !== null && passive !== duration.passive) {
        invalidDuration = true;
        addDiagnostic(
          diagnostics,
          SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
          `SELF defensive Augment ${power.name} mixes Passive and finite modifiers.`,
          powerId,
          packet.id ?? null,
        );
        break;
      }
      passive = duration.passive;
      const attribute = defensiveAttribute(packet);
      if (attribute === "GUARD") {
        guardPowerIds.add(powerId);
        guardPackets.push({
          packetId: packet.id!,
          potency: Math.max(1, Math.trunc(Number(packet.potency ?? power.potency ?? 1))),
          modifier: Math.max(1, Math.min(5, Math.trunc(Number(packet.modifier)))),
          duration: duration.duration,
          passive: duration.passive,
        });
      } else if (attribute === "FORTITUDE") {
        fortitudePowerIds.add(powerId);
      }
    }
    if (invalidDuration) continue;
    const primaryAttribute = defensiveAttribute(primary)!;
    models.push({
      id: powerId,
      packetTieId: primary.id!,
      diceCount: Math.max(0, Math.trunc(Number(primary.diceCount ?? power.diceCount ?? 0))),
      activationAttribute: primaryAttribute,
      activationDieSides:
        primaryAttribute === "GUARD" ? params.guardDieSides : params.fortitudeDieSides,
      cooldownTurns: Math.max(1, Math.trunc(entry.cooldownAuthority.effectiveCooldownTurns)),
      passive: passive ?? false,
      guardPackets,
    });
  }

  const eligiblePowerIds = uniqueSorted(candidatePowerIds);
  if (diagnostics.length > 0) {
    return {
      mode: "FAIL_CLOSED",
      powers: [],
      eligiblePowerIds,
      eligibleGuardPowerIds: uniqueSorted(guardPowerIds),
      eligibleFortitudePowerIds: uniqueSorted(fortitudePowerIds),
      diagnostics,
    };
  }
  for (const powerId of fortitudePowerIds) {
    addDiagnostic(
      diagnostics,
      SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.fortitudeNoGenericIncomingHarmEffect,
      "Temporary SELF Fortitude does not change the generic incoming physical attack reference and is not routed to mental Survivability.",
      powerId,
    );
  }
  return {
    mode: "SEMANTIC",
    powers: models,
    eligiblePowerIds,
    eligibleGuardPowerIds: uniqueSorted(guardPowerIds),
    eligibleFortitudePowerIds: uniqueSorted(fortitudePowerIds),
    diagnostics,
  };
}

function successDistribution(diceCount: number, dieSides: number, modifier = 0): number[] {
  let distribution = [1];
  const sides = Math.max(1, Math.trunc(dieSides));
  for (let die = 0; die < Math.max(0, Math.trunc(diceCount)); die += 1) {
    const next: number[] = [];
    for (let successes = 0; successes < distribution.length; successes += 1) {
      for (let face = 1; face <= sides; face += 1) {
        const result = successes + successCountForRoll(face, modifier);
        next[result] = (next[result] ?? 0) + distribution[successes]! / sides;
      }
    }
    distribution = next;
  }
  return distribution;
}

function normalizeStatuses(statuses: StatusState[]): StatusState[] {
  return statuses
    .filter((status) => status.stacks > 0 && status.remainingDuration > 0)
    .sort((left, right) => left.packetId.localeCompare(right.packetId));
}

function applyGuard(power: PowerModel, statuses: StatusState[], successes: number): StatusState[] {
  if (successes <= 0) return statuses.map((status) => ({ ...status }));
  const next = statuses.map((status) => ({ ...status }));
  for (const packet of power.guardPackets) {
    const stacks = successes * packet.potency;
    const existing = next.find((status) => status.packetId === packet.packetId);
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

function activeGuardModifier(statuses: StatusState[]): number {
  return Math.max(
    0,
    Math.min(
      5,
      statuses.reduce(
        (sum, status) =>
          sum + (status.stacks > 0 && status.remainingDuration > 0 ? status.modifier : 0),
        0,
      ),
    ),
  );
}

function expectedIncomingHarm(params: {
  reference: ReferenceDefence;
  modifier: number;
  tuning: CalculatorConfig["durabilityAxisTuning"];
}): number {
  const { reference, tuning } = params;
  const incoming = successDistribution(
    tuning.referenceIncomingDiceCount,
    tuning.referenceIncomingDieSides,
  );
  const defence = successDistribution(
    Math.max(1, Math.trunc(reference.physicalDefenceDice)),
    reference.guardDieSides,
    params.modifier,
  );
  const dodge = reference.dodgeDice > 0
    ? successDistribution(
        Math.max(1, Math.trunc(reference.dodgeDice)),
        reference.guardDieSides,
        params.modifier,
      )
    : [];
  let activeExpectedHarm = 0;
  let expectedIncomingWounds = 0;
  for (let incomingSuccesses = 0; incomingSuccesses < incoming.length; incomingSuccesses += 1) {
    const incomingProbability = incoming[incomingSuccesses] ?? 0;
    const wounds = incomingSuccesses * tuning.referenceWoundsPerSuccess;
    expectedIncomingWounds += wounds * incomingProbability;
    if (wounds <= 0 || incomingProbability <= 0) continue;
    const defencePrevention = defence.reduce(
      (sum, probability, successes) =>
        sum + (probability ?? 0) * Math.min(wounds, successes * reference.blockPerSuccess),
      0,
    );
    const dodgePrevention = dodge.reduce(
      (sum, probability, successes) =>
        sum + (successes >= incomingSuccesses ? (probability ?? 0) * wounds : 0),
      0,
    );
    activeExpectedHarm +=
      (wounds - Math.max(defencePrevention, dodgePrevention)) * incomingProbability;
  }
  const hydratedStaticProtection =
    Math.max(0, reference.protection) * Math.max(0, tuning.authoredProtectionStaticRuntimeShare);
  const protectionPrevention = Math.min(
    activeExpectedHarm,
    hydratedStaticProtection * tuning.protectionPreventionPerPoint,
  );
  const resistPrevention = Math.min(
    Math.max(0, activeExpectedHarm - protectionPrevention),
    expectedIncomingWounds * tuning.resistPreventionMaxShare,
    Math.max(0, reference.resistCoverage) * tuning.resistPreventionPerCoveragePoint,
  );
  return Math.max(0.001, activeExpectedHarm - protectionPrevention - resistPrevention);
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

function betterChoice(
  candidate: OptimizerValue,
  candidateChoice: OptimizerChoice,
  best: OptimizerValue | null,
  bestChoice: OptimizerChoice | null,
): boolean {
  if (!best || !bestChoice) return true;
  if (candidate.harm < best.harm - EPSILON) return true;
  if (Math.abs(candidate.harm - best.harm) > EPSILON) return false;
  if (candidate.activations < best.activations - EPSILON) return true;
  if (Math.abs(candidate.activations - best.activations) > EPSILON) return false;
  if (candidate.powerActions < best.powerActions - EPSILON) return true;
  if (Math.abs(candidate.powerActions - best.powerActions) > EPSILON) return false;
  if (candidateChoice.id !== bestChoice.id) return candidateChoice.id < bestChoice.id;
  return candidateChoice.packetTieId < bestChoice.packetTieId;
}

function optimize(params: {
  powers: PowerModel[];
  includeGuard: boolean;
  passiveState: SelfGuardSurvivabilityPassiveState;
  passiveActivationSourceSuccessesByPowerId: SelfGuardSurvivabilityActiveSnapshots;
  reference: ReferenceDefence;
  tuning: CalculatorConfig["durabilityAxisTuning"];
  counters: OptimizerCounters;
}): OptimizerValue {
  const memo = new Map<string, OptimizerValue>();
  const relevantPowers = params.powers.filter((power) => power.guardPackets.length > 0);
  const passivePowers = relevantPowers.filter((power) => power.passive);
  const activePowers = relevantPowers.filter((power) => !power.passive);

  const solve = (state: OptimizerState): OptimizerValue => {
    if (state.turn > HORIZON_TURNS) return { harm: 0, activations: 0, powerActions: 0 };
    const key = stateKey(state);
    const cached = memo.get(key);
    if (cached) {
      params.counters.memoHits += 1;
      return cached;
    }
    params.counters.statesVisited += 1;
    const choices: OptimizerChoice[] = [{ id: "~none", packetTieId: "~none", power: null }];
    if (params.includeGuard) {
      for (const power of activePowers) {
        if ((state.nextLegalTurns[power.id] ?? 1) <= state.turn) {
          choices.push({ id: power.id, packetTieId: power.packetTieId, power });
        }
      }
      if (params.passiveState === "INACTIVE") {
        for (const power of passivePowers) {
          if (!state.activePassivePowerIds.includes(power.id)) {
            choices.push({ id: power.id, packetTieId: power.packetTieId, power });
          }
        }
      }
    }
    choices.sort((left, right) => left.id.localeCompare(right.id) || left.packetTieId.localeCompare(right.packetTieId));

    let best: OptimizerValue | null = null;
    let bestChoice: OptimizerChoice | null = null;
    for (const choice of choices) {
      params.counters.choiceCount += 1;
      const power = choice.power;
      const currentModifier = activeGuardModifier(state.statuses);
      const distribution = power
        ? successDistribution(
            power.diceCount,
            power.activationDieSides,
            power.activationAttribute === "GUARD" ? currentModifier : 0,
          )
        : [1];
      let value: OptimizerValue = {
        harm: 0,
        activations: power ? 1 : 0,
        powerActions: power ? 1 : 0,
      };
      for (let successes = 0; successes < distribution.length; successes += 1) {
        const probability = distribution[successes] ?? 0;
        if (!(probability > 0)) continue;
        params.counters.transitionBranches += 1;
        const passiveSuccess = Boolean(power?.passive && successes > 0);
        const appliedStatuses = power
          ? applyGuard(power, state.statuses, successes)
          : state.statuses;
        // Combat Lab ticks target-turn semantic stacks and hard duration at the
        // creature's end of turn. The locked incoming reference follows that
        // boundary, so a one-turn M1 effect expires before this attack.
        const attackStatuses = advanceStatuses(appliedStatuses);
        const immediateHarm = expectedIncomingHarm({
          reference: params.reference,
          modifier: activeGuardModifier(attackStatuses),
          tuning: params.tuning,
        });
        const nextLegalTurns = power && !power.passive
          ? { ...state.nextLegalTurns, [power.id]: state.turn + power.cooldownTurns + 1 }
          : state.nextLegalTurns;
        const future = solve({
          turn: state.turn + 1,
          nextLegalTurns,
          statuses: attackStatuses,
          activePassivePowerIds: passiveSuccess
            ? uniqueSorted([...state.activePassivePowerIds, power!.id])
            : state.activePassivePowerIds,
        });
        value = {
          harm: value.harm + probability * (immediateHarm + future.harm),
          activations: value.activations + probability * future.activations,
          powerActions: value.powerActions + probability * future.powerActions,
        };
      }
      if (betterChoice(value, choice, best, bestChoice)) {
        best = value;
        bestChoice = choice;
      }
    }
    const resolved = best ?? { harm: 0, activations: 0, powerActions: 0 };
    memo.set(key, resolved);
    params.counters.memoizedStateCount = Math.max(params.counters.memoizedStateCount, memo.size);
    return resolved;
  };

  let initialBranches: Array<{ probability: number; statuses: StatusState[] }> = [
    { probability: 1, statuses: [] },
  ];
  if (params.includeGuard && params.passiveState === "PREPARED_ACTIVE") {
    for (const power of passivePowers) {
      initialBranches = initialBranches.flatMap((branch) =>
        successDistribution(
          power.diceCount,
          power.activationDieSides,
          power.activationAttribute === "GUARD" ? activeGuardModifier(branch.statuses) : 0,
        ).flatMap((probability, successes) =>
          probability > 0
            ? [{
                probability: branch.probability * probability,
                statuses: applyGuard(power, branch.statuses, successes),
              }]
            : [],
        ),
      );
    }
  } else if (params.includeGuard && params.passiveState === "ACTIVE_SNAPSHOT") {
    initialBranches = [{
      probability: 1,
      statuses: passivePowers.reduce(
        (statuses, power) =>
          applyGuard(
            power,
            statuses,
            params.passiveActivationSourceSuccessesByPowerId[power.id]!,
          ),
        [] as StatusState[],
      ),
    }];
  }
  let total: OptimizerValue = { harm: 0, activations: 0, powerActions: 0 };
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
    total = {
      harm: total.harm + branch.probability * result.harm,
      activations: total.activations + branch.probability * result.activations,
      powerActions: total.powerActions + branch.probability * result.powerActions,
    };
  }
  return total;
}

function emptyResult(params: {
  startedAt: number;
  mode: SelfGuardSurvivabilityResult["mode"];
  level: number;
  tier: MonsterTier;
  passiveState: SelfGuardSurvivabilityPassiveState;
  tuning: CalculatorConfig["durabilityAxisTuning"];
  extracted?: ExtractedModels;
}): SelfGuardSurvivabilityResult {
  return {
    mode: params.mode,
    scoreOverride: params.mode === "SEMANTIC" ? 0 : null,
    eligiblePowerIds: params.extracted?.eligiblePowerIds ?? [],
    eligibleGuardPowerIds: params.extracted?.eligibleGuardPowerIds ?? [],
    eligibleFortitudePowerIds: params.extracted?.eligibleFortitudePowerIds ?? [],
    fiveTurnHarmWithout: 0,
    fiveTurnHarmWith: 0,
    preventedHarm: 0,
    sustainedPrevention: 0,
    semanticDurabilityRatio: 1,
    semanticSupplementalRatio: 0,
    diagnostics: params.extracted?.diagnostics ?? [],
    policy: {
      level: params.level,
      tier: params.tier,
      horizonTurns: HORIZON_TURNS,
      powerLanesPerTurn: 1,
      incomingAttackTiming: "AFTER_CREATURE_END_OF_TURN",
      incomingDiceCount: params.tuning.referenceIncomingDiceCount,
      incomingDieSides: params.tuning.referenceIncomingDieSides,
      incomingWoundsPerSuccess: params.tuning.referenceWoundsPerSuccess,
      passiveState: params.passiveState,
      nextLegalTurnFormula: "activationTurn + cooldown + 1",
      sameAttributeModifierClamp: 5,
      supplementalContributionMaxRatio: params.tuning.supplementalContributionMaxRatio,
      majorInjuryContribution: 0,
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

export function computeLevel3SelfGuardSurvivability(params: {
  level: number;
  tier: MonsterTier;
  guardDieSides: number;
  fortitudeDieSides: number;
  physicalDefenceDice: number;
  dodgeDice: number;
  blockPerSuccess: number;
  protection?: number;
  resistCoverage?: number;
  powers: SelfGuardSurvivabilityPowerEntry[];
  tuning: CalculatorConfig["durabilityAxisTuning"];
  passiveState?: SelfGuardSurvivabilityPassiveState;
  passiveActivationSourceSuccessesByPowerId?: SelfGuardSurvivabilityActiveSnapshots;
}): SelfGuardSurvivabilityResult {
  const startedAt = performance.now();
  const passiveState = params.passiveState ?? "PREPARED_ACTIVE";
  const extracted = extractModels(params);
  if (extracted.mode === "NONE") {
    const result = emptyResult({
      startedAt,
      mode: "NONE",
      level: params.level,
      tier: params.tier,
      passiveState,
      tuning: params.tuning,
    });
    const validControlReference =
      Number.isFinite(params.guardDieSides) && params.guardDieSides >= 4 &&
      Number.isFinite(params.physicalDefenceDice) && params.physicalDefenceDice >= 1 &&
      Number.isFinite(params.dodgeDice) && params.dodgeDice >= 0 &&
      Number.isFinite(params.blockPerSuccess) && params.blockPerSuccess >= 0 &&
      params.tuning.referenceIncomingDiceCount > 0 &&
      params.tuning.referenceIncomingDieSides > 0 &&
      params.tuning.referenceWoundsPerSuccess > 0;
    if (!validControlReference) return result;
    const perAttack = expectedIncomingHarm({
      reference: {
        guardDieSides: Math.trunc(params.guardDieSides),
        physicalDefenceDice: Math.trunc(params.physicalDefenceDice),
        dodgeDice: Math.trunc(params.dodgeDice),
        blockPerSuccess: Math.max(0, params.blockPerSuccess),
        protection: Math.max(0, params.protection ?? 0),
        resistCoverage: Math.max(0, params.resistCoverage ?? 0),
      },
      modifier: 0,
      tuning: params.tuning,
    });
    return {
      ...result,
      fiveTurnHarmWithout: perAttack * HORIZON_TURNS,
      fiveTurnHarmWith: perAttack * HORIZON_TURNS,
    };
  }
  const validReference =
    Number.isFinite(params.guardDieSides) && params.guardDieSides >= 4 &&
    Number.isFinite(params.physicalDefenceDice) && params.physicalDefenceDice >= 1 &&
    Number.isFinite(params.dodgeDice) && params.dodgeDice >= 0 &&
    Number.isFinite(params.blockPerSuccess) && params.blockPerSuccess >= 0 &&
    Number.isFinite(params.tuning.referenceIncomingDiceCount) &&
    params.tuning.referenceIncomingDiceCount > 0 &&
    Number.isFinite(params.tuning.referenceIncomingDieSides) &&
    params.tuning.referenceIncomingDieSides > 0 &&
    Number.isFinite(params.tuning.referenceWoundsPerSuccess) &&
    params.tuning.referenceWoundsPerSuccess > 0;
  if (!validReference) {
    addDiagnostic(
      extracted.diagnostics,
      SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.noReferenceAttack,
      "Semantic SELF defence Survivability requires a valid physical 4D8/WPS2-style incoming reference and defence package.",
    );
  }
  const activeSnapshots = params.passiveActivationSourceSuccessesByPowerId ?? {};
  if (passiveState === "ACTIVE_SNAPSHOT" && extracted.mode === "SEMANTIC") {
    for (const power of extracted.powers.filter((candidate) => candidate.passive)) {
      if (!Object.prototype.hasOwnProperty.call(activeSnapshots, power.id)) {
        addDiagnostic(
          extracted.diagnostics,
          SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.activeSnapshotMissingSuccesses,
          `Active Passive SELF defensive Augment ${power.id} lacks stored activation source successes.`,
          power.id,
        );
        continue;
      }
      const stored = activeSnapshots[power.id];
      if (!Number.isFinite(stored) || !Number.isInteger(stored) || stored < 0) {
        addDiagnostic(
          extracted.diagnostics,
          SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.activeSnapshotInvalidSuccesses,
          `Active Passive SELF defensive Augment ${power.id} has invalid stored activation source successes.`,
          power.id,
        );
      }
    }
  }
  const blockingDiagnostics = extracted.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code !==
      SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.fortitudeNoGenericIncomingHarmEffect,
  );
  if (extracted.mode === "FAIL_CLOSED" || blockingDiagnostics.length > 0) {
    return emptyResult({
      startedAt,
      mode: "FAIL_CLOSED",
      level: params.level,
      tier: params.tier,
      passiveState,
      tuning: params.tuning,
      extracted,
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
  const reference: ReferenceDefence = {
    guardDieSides: Math.trunc(params.guardDieSides),
    physicalDefenceDice: Math.trunc(params.physicalDefenceDice),
    dodgeDice: Math.trunc(params.dodgeDice),
    blockPerSuccess: Math.max(0, params.blockPerSuccess),
    protection: Math.max(0, params.protection ?? 0),
    resistCoverage: Math.max(0, params.resistCoverage ?? 0),
  };
  const without = optimize({
    powers: extracted.powers,
    includeGuard: false,
    passiveState,
    passiveActivationSourceSuccessesByPowerId: activeSnapshots,
    reference,
    tuning: params.tuning,
    counters,
  });
  const withGuard = optimize({
    powers: extracted.powers,
    includeGuard: true,
    passiveState,
    passiveActivationSourceSuccessesByPowerId: activeSnapshots,
    reference,
    tuning: params.tuning,
    counters,
  });
  const preventedHarm = Math.max(0, without.harm - withGuard.harm);
  const semanticDurabilityRatio = withGuard.harm > EPSILON
    ? without.harm / withGuard.harm
    : Number.POSITIVE_INFINITY;
  const maximumRatio = Math.max(0, params.tuning.supplementalContributionMaxRatio);
  const semanticSupplementalRatio = Number.isFinite(semanticDurabilityRatio)
    ? Math.max(0, Math.min(maximumRatio, semanticDurabilityRatio - 1))
    : maximumRatio;
  counters.runtimeMs = performance.now() - startedAt;
  return {
    mode: "SEMANTIC",
    scoreOverride: semanticSupplementalRatio,
    eligiblePowerIds: extracted.eligiblePowerIds,
    eligibleGuardPowerIds: extracted.eligibleGuardPowerIds,
    eligibleFortitudePowerIds: extracted.eligibleFortitudePowerIds,
    fiveTurnHarmWithout: without.harm,
    fiveTurnHarmWith: withGuard.harm,
    preventedHarm,
    sustainedPrevention: preventedHarm / HORIZON_TURNS,
    semanticDurabilityRatio,
    semanticSupplementalRatio,
    diagnostics: extracted.diagnostics,
    policy: {
      level: params.level,
      tier: params.tier,
      horizonTurns: HORIZON_TURNS,
      powerLanesPerTurn: 1,
      incomingAttackTiming: "AFTER_CREATURE_END_OF_TURN",
      incomingDiceCount: params.tuning.referenceIncomingDiceCount,
      incomingDieSides: params.tuning.referenceIncomingDieSides,
      incomingWoundsPerSuccess: params.tuning.referenceWoundsPerSuccess,
      passiveState,
      nextLegalTurnFormula: "activationTurn + cooldown + 1",
      sameAttributeModifierClamp: 5,
      supplementalContributionMaxRatio: maximumRatio,
      majorInjuryContribution: 0,
    },
    performance: counters,
  };
}
