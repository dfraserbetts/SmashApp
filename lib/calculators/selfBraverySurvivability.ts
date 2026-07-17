import { successCountForRoll } from "@/lib/combat-lab/dice";
import type { CalculatorConfig } from "@/lib/calculators/calculatorConfig";
import type {
  EffectPacket,
  MonsterTier,
  Power,
  PowerCooldownAuthorityResult,
} from "@/lib/summoning/types";

export const SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC = {
  missingIdentity: "SELF_BRAVERY_SURVIVABILITY_MISSING_IDENTITY",
  missingCooldownAuthority: "SELF_BRAVERY_SURVIVABILITY_MISSING_COOLDOWN_AUTHORITY",
  unsupportedLevel: "SELF_BRAVERY_SURVIVABILITY_UNSUPPORTED_LEVEL",
  bossActionEconomyUnresolved: "SELF_BRAVERY_SURVIVABILITY_BOSS_ACTION_ECONOMY_UNRESOLVED",
  unsupportedRecurrence: "SELF_BRAVERY_SURVIVABILITY_UNSUPPORTED_RECURRENCE",
  mixedSemanticLegacy: "SELF_BRAVERY_SURVIVABILITY_MIXED_SEMANTIC_LEGACY",
  unsupportedOrdering: "SELF_BRAVERY_SURVIVABILITY_UNSUPPORTED_ORDERING",
  noReferenceAttack: "SELF_BRAVERY_SURVIVABILITY_NO_REFERENCE_ATTACK",
  activeSnapshotMissingSuccesses:
    "SELF_BRAVERY_SURVIVABILITY_ACTIVE_SNAPSHOT_MISSING_SUCCESSES",
  activeSnapshotInvalidSuccesses:
    "SELF_BRAVERY_SURVIVABILITY_ACTIVE_SNAPSHOT_INVALID_SUCCESSES",
  intellectNoApprovedManipulationReference:
    "SELF_INTELLECT_NO_APPROVED_MANIPULATION_REFERENCE",
} as const;

export type SelfBraverySurvivabilityDiagnosticCode =
  (typeof SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC)[keyof typeof SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC];

export type SelfBraverySurvivabilityDiagnostic = {
  code: SelfBraverySurvivabilityDiagnosticCode;
  message: string;
  powerId?: string | null;
  packetId?: string | null;
};

export type SelfBraverySurvivabilityPowerEntry = {
  id?: string | null;
  name?: string | null;
  authoredPower?: Power | null;
  cooldownAuthority?: PowerCooldownAuthorityResult | null;
};

export type SelfBraverySurvivabilityPassiveState =
  | "PREPARED_ACTIVE"
  | "INACTIVE"
  | "ACTIVE_SNAPSHOT";

export type SelfBraverySurvivabilityActiveSnapshots = Readonly<Record<string, number>>;

export type SelfBraverySurvivabilityResult = {
  mode: "NONE" | "SEMANTIC" | "FAIL_CLOSED";
  scoreOverride: number | null;
  eligiblePowerIds: string[];
  eligibleBraveryPowerIds: string[];
  eligibleIntellectPowerIds: string[];
  fiveTurnHarmWithout: number;
  fiveTurnHarmWith: number;
  preventedHarm: number;
  sustainedPrevention: number;
  semanticDurabilityRatio: number;
  semanticSupplementalRatio: number;
  expectedActivations: number;
  expectedPowerActions: number;
  diagnostics: SelfBraverySurvivabilityDiagnostic[];
  policy: {
    level: number;
    tier: MonsterTier;
    horizonTurns: 5;
    powerLanesPerTurn: 1;
    incomingAttackTiming: "AFTER_CREATURE_END_OF_TURN";
    incomingDiceCount: number;
    incomingDieSides: number;
    incomingWoundsPerSuccess: number;
    hydratedMentalDefenceDice: number;
    braveryDieSides: number;
    passiveState: SelfBraverySurvivabilityPassiveState;
    nextLegalTurnFormula: "activationTurn + cooldown + 1";
    sameAttributeModifierClamp: 5;
    supplementalContributionMaxRatio: number;
    dodgeContribution: 0;
    cleanupContribution: 0;
    resistContribution: 0;
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

type SupportedAttribute = "BRAVERY" | "INTELLECT";

type StatusState = {
  packetId: string;
  stacks: number;
  remainingDuration: number;
  modifier: number;
  passive: boolean;
};

type BraveryPacketModel = {
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
  activationAttribute: SupportedAttribute;
  activationDieSides: number;
  cooldownTurns: number;
  passive: boolean;
  braveryPackets: BraveryPacketModel[];
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

type OptimizerCounters = SelfBraverySurvivabilityResult["performance"];

type ExtractedModels = {
  mode: SelfBraverySurvivabilityResult["mode"];
  powers: PowerModel[];
  eligiblePowerIds: string[];
  eligibleBraveryPowerIds: string[];
  eligibleIntellectPowerIds: string[];
  diagnostics: SelfBraverySurvivabilityDiagnostic[];
};

type MentalReference = {
  braveryDieSides: number;
  mentalDefenceDice: number;
  blockPerSuccess: number;
  protection: number;
  resistCoverage: number;
};

const HORIZON_TURNS = 5 as const;
const EPSILON = 1e-10;
const PASSIVE_DURATION_SENTINEL = Number.MAX_SAFE_INTEGER;
const REFERENCE_INCOMING_DICE_COUNT = 4 as const;
const REFERENCE_INCOMING_DIE_SIDES = 8 as const;
const REFERENCE_INCOMING_WOUNDS_PER_SUCCESS = 2 as const;

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function upper(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function packetsForPower(power: Power): EffectPacket[] {
  const packets =
    Array.isArray(power.effectPackets) && power.effectPackets.length > 0
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

function supportedAttribute(packet: EffectPacket): SupportedAttribute | null {
  const details = readRecord(packet.detailsJson);
  const attribute = upper(packet.targetedAttribute ?? details.statTarget ?? details.targetedAttribute);
  if (attribute === "BRAVERY") return "BRAVERY";
  if (attribute === "INTELLECT") return "INTELLECT";
  return null;
}

function isRelevantSelfAugment(power: Power, packet: EffectPacket): boolean {
  return (
    upper(packet.intention ?? packet.type) === "AUGMENT" &&
    supportedAttribute(packet) !== null &&
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
  diagnostics: SelfBraverySurvivabilityDiagnostic[],
  code: SelfBraverySurvivabilityDiagnosticCode,
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
  braveryDieSides: number;
  intellectDieSides: number;
  powers: SelfBraverySurvivabilityPowerEntry[];
}): ExtractedModels {
  const diagnostics: SelfBraverySurvivabilityDiagnostic[] = [];
  const entries = params.powers.flatMap((entry) => {
    const power = entry.authoredPower;
    return power ? [{ entry, power, packets: packetsForPower(power) }] : [];
  });
  const semanticCandidates = entries.flatMap(({ entry, power, packets }) =>
    packets
      .filter((packet) => isRelevantSelfAugment(power, packet) && isSemanticPacket(packet))
      .map((packet) => ({ entry, power, packet })),
  );
  if (semanticCandidates.length === 0) {
    return {
      mode: "NONE",
      powers: [],
      eligiblePowerIds: [],
      eligibleBraveryPowerIds: [],
      eligibleIntellectPowerIds: [],
      diagnostics,
    };
  }
  if (params.level !== 3) {
    addDiagnostic(
      diagnostics,
      SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedLevel,
      `Semantic SELF Bravery/Intellect handling is calibrated only for Level 3, not Level ${params.level}.`,
    );
  }
  if (params.tier === "BOSS") {
    addDiagnostic(
      diagnostics,
      SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.bossActionEconomyUnresolved,
      "Boss Power-lane action economy is outside the bounded SELF Bravery Survivability model.",
    );
  }

  const candidatePowerIds = new Set<string>();
  const braveryPowerIds = new Set<string>();
  const intellectPowerIds = new Set<string>();
  const models: PowerModel[] = [];
  const processedPowerIds = new Set<string>();
  for (const { entry, power, packets } of entries) {
    const candidates = packets.filter(
      (packet) => isRelevantSelfAugment(power, packet) && isSemanticPacket(packet),
    );
    if (candidates.length === 0) continue;
    const powerId = power.id?.trim() || entry.id?.trim();
    if (powerId) candidatePowerIds.add(powerId);
    if (powerId && processedPowerIds.has(powerId)) continue;
    if (powerId) processedPowerIds.add(powerId);
    const legacyRelevantPackets = packets.filter(
      (packet) => isRelevantSelfAugment(power, packet) && !isSemanticPacket(packet),
    );
    if (legacyRelevantPackets.length > 0) {
      addDiagnostic(
        diagnostics,
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.mixedSemanticLegacy,
        `SELF Bravery/Intellect Power ${power.name} mixes semantic and legacy packets.`,
        powerId ?? null,
        legacyRelevantPackets[0]?.id ?? null,
      );
      continue;
    }
    const primary = packets[0];
    if (!powerId || !primary?.id?.trim() || candidates.some((packet) => !packet.id?.trim())) {
      addDiagnostic(
        diagnostics,
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.missingIdentity,
        `SELF Bravery/Intellect Augment ${power.name} requires stable power and packet identities.`,
        powerId ?? null,
      );
      continue;
    }
    if (!candidates.includes(primary)) {
      addDiagnostic(
        diagnostics,
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
        `SELF Bravery/Intellect Augment ${power.name} must use a semantic packet as its primary application roll.`,
        powerId,
        primary.id ?? null,
      );
      continue;
    }
    if (!entry.cooldownAuthority) {
      addDiagnostic(
        diagnostics,
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.missingCooldownAuthority,
        `SELF Bravery/Intellect Augment ${power.name} lacks authoritative cooldown.`,
        powerId,
      );
      continue;
    }
    if (upper(power.descriptorChassis ?? "IMMEDIATE") !== "IMMEDIATE") {
      addDiagnostic(
        diagnostics,
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
        `SELF Bravery/Intellect Augment ${power.name} uses unsupported chassis ${String(power.descriptorChassis)}.`,
        powerId,
      );
      continue;
    }
    if (upper(power.counterMode ?? "NO") === "YES") {
      addDiagnostic(
        diagnostics,
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
        `Response SELF Bravery/Intellect Augment ${power.name} is outside the one-Power-lane contract.`,
        powerId,
      );
      continue;
    }
    if (candidates.some(recurringTiming)) {
      addDiagnostic(
        diagnostics,
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedRecurrence,
        `Recurring SELF Bravery/Intellect Augment ${power.name} lacks supported recurring buff runtime.`,
        powerId,
      );
      continue;
    }
    if (candidates.some((packet) => upper(packet.effectTimingType ?? "ON_CAST") !== "ON_CAST")) {
      addDiagnostic(
        diagnostics,
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
        `SELF Bravery/Intellect Augment ${power.name} uses unsupported application timing.`,
        powerId,
      );
      continue;
    }
    if (packets.some((packet) => !candidates.includes(packet))) {
      addDiagnostic(
        diagnostics,
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
        `SELF Bravery/Intellect Augment ${power.name} mixes context-dependent payload with its setup.`,
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
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
        `SELF Bravery/Intellect Augment ${power.name} has an independent or conditional secondary roll.`,
        powerId,
      );
      continue;
    }

    const distinctCandidates = candidates.filter(
      (packet, index, all) => all.findIndex((candidate) => candidate.id === packet.id) === index,
    );
    const braveryPackets: BraveryPacketModel[] = [];
    let invalidDuration = false;
    let passive: boolean | null = null;
    for (const packet of distinctCandidates) {
      const duration = durationForPacket(packet, primary);
      if (!duration) {
        invalidDuration = true;
        addDiagnostic(
          diagnostics,
          SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
          `SELF Bravery/Intellect Augment packet ${packet.id} has unsupported or empty duration.`,
          powerId,
          packet.id ?? null,
        );
        break;
      }
      if (passive !== null && passive !== duration.passive) {
        invalidDuration = true;
        addDiagnostic(
          diagnostics,
          SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
          `SELF Bravery/Intellect Augment ${power.name} mixes Passive and finite modifiers.`,
          powerId,
          packet.id ?? null,
        );
        break;
      }
      passive = duration.passive;
      const attribute = supportedAttribute(packet)!;
      if (attribute === "BRAVERY") {
        braveryPowerIds.add(powerId);
        braveryPackets.push({
          packetId: packet.id!,
          potency: Math.max(1, Math.trunc(Number(packet.potency ?? power.potency ?? 1))),
          modifier: Math.max(1, Math.min(5, Math.trunc(Number(packet.modifier)))),
          duration: duration.duration,
          passive: duration.passive,
        });
      } else {
        intellectPowerIds.add(powerId);
      }
    }
    if (invalidDuration) continue;
    const primaryAttribute = supportedAttribute(primary)!;
    models.push({
      id: powerId,
      packetTieId: primary.id!,
      diceCount: Math.max(0, Math.trunc(Number(primary.diceCount ?? power.diceCount ?? 0))),
      activationAttribute: primaryAttribute,
      activationDieSides:
        primaryAttribute === "BRAVERY" ? params.braveryDieSides : params.intellectDieSides,
      cooldownTurns: Math.max(1, Math.trunc(entry.cooldownAuthority.effectiveCooldownTurns)),
      passive: passive ?? false,
      braveryPackets,
    });
  }

  const eligiblePowerIds = uniqueSorted(candidatePowerIds);
  if (diagnostics.length > 0) {
    return {
      mode: "FAIL_CLOSED",
      powers: [],
      eligiblePowerIds,
      eligibleBraveryPowerIds: uniqueSorted(braveryPowerIds),
      eligibleIntellectPowerIds: uniqueSorted(intellectPowerIds),
      diagnostics,
    };
  }
  for (const powerId of intellectPowerIds) {
    addDiagnostic(
      diagnostics,
      SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.intellectNoApprovedManipulationReference,
      "Temporary SELF Intellect has no approved Level 3 Manipulation reference and receives zero semantic radar credit.",
      powerId,
    );
  }
  return {
    mode: "SEMANTIC",
    powers: models,
    eligiblePowerIds,
    eligibleBraveryPowerIds: uniqueSorted(braveryPowerIds),
    eligibleIntellectPowerIds: uniqueSorted(intellectPowerIds),
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

function applyBravery(power: PowerModel, statuses: StatusState[], successes: number): StatusState[] {
  if (successes <= 0) return statuses.map((status) => ({ ...status }));
  const next = statuses.map((status) => ({ ...status }));
  for (const packet of power.braveryPackets) {
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

function activeBraveryModifier(statuses: StatusState[]): number {
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

function expectedIncomingMentalHarm(params: {
  reference: MentalReference;
  modifier: number;
  tuning: CalculatorConfig["durabilityAxisTuning"];
}): number {
  const { reference, tuning } = params;
  const incoming = successDistribution(
    REFERENCE_INCOMING_DICE_COUNT,
    REFERENCE_INCOMING_DIE_SIDES,
  );
  const defence = successDistribution(
    Math.max(1, Math.trunc(reference.mentalDefenceDice)),
    reference.braveryDieSides,
    params.modifier,
  );
  let activeExpectedHarm = 0;
  let expectedIncomingWounds = 0;
  for (let incomingSuccesses = 0; incomingSuccesses < incoming.length; incomingSuccesses += 1) {
    const incomingProbability = incoming[incomingSuccesses] ?? 0;
    const wounds = incomingSuccesses * REFERENCE_INCOMING_WOUNDS_PER_SUCCESS;
    expectedIncomingWounds += wounds * incomingProbability;
    if (wounds <= 0 || incomingProbability <= 0) continue;
    const defencePrevention = defence.reduce(
      (sum, probability, successes) =>
        sum + (probability ?? 0) * Math.min(wounds, successes * reference.blockPerSuccess),
      0,
    );
    activeExpectedHarm += (wounds - defencePrevention) * incomingProbability;
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
  return Math.max(0, activeExpectedHarm - protectionPrevention - resistPrevention);
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
  includeBravery: boolean;
  passiveState: SelfBraverySurvivabilityPassiveState;
  passiveActivationSourceSuccessesByPowerId: SelfBraverySurvivabilityActiveSnapshots;
  reference: MentalReference;
  tuning: CalculatorConfig["durabilityAxisTuning"];
  counters: OptimizerCounters;
}): OptimizerValue {
  const memo = new Map<string, OptimizerValue>();
  const passivePowers = params.powers.filter((power) => power.passive);
  const activePowers = params.powers.filter((power) => !power.passive);

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
    choices.sort(
      (left, right) => left.id.localeCompare(right.id) || left.packetTieId.localeCompare(right.packetTieId),
    );

    let best: OptimizerValue | null = null;
    let bestChoice: OptimizerChoice | null = null;
    for (const choice of choices) {
      params.counters.choiceCount += 1;
      const power = choice.power;
      const currentModifier = activeBraveryModifier(state.statuses);
      const distribution = power
        ? successDistribution(
            power.diceCount,
            power.activationDieSides,
            power.activationAttribute === "BRAVERY" ? currentModifier : 0,
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
        const appliedStatuses =
          power && params.includeBravery
            ? applyBravery(power, state.statuses, successes)
            : state.statuses;
        // The locked reference attack occurs after the creature's end-turn
        // stack and duration boundary. A one-turn semantic effect expires first.
        const attackStatuses = advanceStatuses(appliedStatuses);
        const immediateHarm = expectedIncomingMentalHarm({
          reference: params.reference,
          modifier: activeBraveryModifier(attackStatuses),
          tuning: params.tuning,
        });
        const nextLegalTurns =
          power && !power.passive
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
  if (params.includeBravery && params.passiveState === "PREPARED_ACTIVE") {
    for (const power of passivePowers) {
      initialBranches = initialBranches.flatMap((branch) =>
        successDistribution(
          power.diceCount,
          power.activationDieSides,
          power.activationAttribute === "BRAVERY" ? activeBraveryModifier(branch.statuses) : 0,
        ).flatMap((probability, successes) =>
          probability > 0
            ? [
                {
                  probability: branch.probability * probability,
                  statuses: applyBravery(power, branch.statuses, successes),
                },
              ]
            : [],
        ),
      );
    }
  } else if (params.includeBravery && params.passiveState === "ACTIVE_SNAPSHOT") {
    initialBranches = [
      {
        probability: 1,
        statuses: passivePowers.reduce(
          (statuses, power) =>
            applyBravery(
              power,
              statuses,
              params.passiveActivationSourceSuccessesByPowerId[power.id]!,
            ),
          [] as StatusState[],
        ),
      },
    ];
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
  mode: SelfBraverySurvivabilityResult["mode"];
  level: number;
  tier: MonsterTier;
  passiveState: SelfBraverySurvivabilityPassiveState;
  tuning: CalculatorConfig["durabilityAxisTuning"];
  mentalDefenceDice?: number;
  braveryDieSides?: number;
  extracted?: ExtractedModels;
}): SelfBraverySurvivabilityResult {
  return {
    mode: params.mode,
    scoreOverride: params.mode === "SEMANTIC" ? 0 : null,
    eligiblePowerIds: params.extracted?.eligiblePowerIds ?? [],
    eligibleBraveryPowerIds: params.extracted?.eligibleBraveryPowerIds ?? [],
    eligibleIntellectPowerIds: params.extracted?.eligibleIntellectPowerIds ?? [],
    fiveTurnHarmWithout: 0,
    fiveTurnHarmWith: 0,
    preventedHarm: 0,
    sustainedPrevention: 0,
    semanticDurabilityRatio: 1,
    semanticSupplementalRatio: 0,
    expectedActivations: 0,
    expectedPowerActions: 0,
    diagnostics: params.extracted?.diagnostics ?? [],
    policy: {
      level: params.level,
      tier: params.tier,
      horizonTurns: HORIZON_TURNS,
      powerLanesPerTurn: 1,
      incomingAttackTiming: "AFTER_CREATURE_END_OF_TURN",
      incomingDiceCount: REFERENCE_INCOMING_DICE_COUNT,
      incomingDieSides: REFERENCE_INCOMING_DIE_SIDES,
      incomingWoundsPerSuccess: REFERENCE_INCOMING_WOUNDS_PER_SUCCESS,
      hydratedMentalDefenceDice: Math.max(0, Math.trunc(params.mentalDefenceDice ?? 0)),
      braveryDieSides: Math.max(0, Math.trunc(params.braveryDieSides ?? 0)),
      passiveState: params.passiveState,
      nextLegalTurnFormula: "activationTurn + cooldown + 1",
      sameAttributeModifierClamp: 5,
      supplementalContributionMaxRatio: params.tuning.supplementalContributionMaxRatio,
      dodgeContribution: 0,
      cleanupContribution: 0,
      resistContribution: 0,
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

export function computeLevel3SelfBraverySurvivability(params: {
  level: number;
  tier: MonsterTier;
  braveryDieSides: number;
  intellectDieSides: number;
  mentalDefenceDice: number;
  blockPerSuccess: number;
  protection?: number;
  resistCoverage?: number;
  hasReferenceAttack?: boolean;
  powers: SelfBraverySurvivabilityPowerEntry[];
  tuning: CalculatorConfig["durabilityAxisTuning"];
  passiveState?: SelfBraverySurvivabilityPassiveState;
  passiveActivationSourceSuccessesByPowerId?: SelfBraverySurvivabilityActiveSnapshots;
}): SelfBraverySurvivabilityResult {
  const startedAt = performance.now();
  const passiveState = params.passiveState ?? "PREPARED_ACTIVE";
  const extracted = extractModels(params);
  const validReference =
    params.hasReferenceAttack !== false &&
    Number.isFinite(params.braveryDieSides) &&
    params.braveryDieSides >= 4 &&
    Number.isFinite(params.intellectDieSides) &&
    params.intellectDieSides >= 4 &&
    Number.isFinite(params.mentalDefenceDice) &&
    params.mentalDefenceDice >= 1 &&
    Number.isFinite(params.blockPerSuccess) &&
    params.blockPerSuccess >= 0 &&
    params.tuning.referenceIncomingDiceCount === REFERENCE_INCOMING_DICE_COUNT &&
    params.tuning.referenceIncomingDieSides === REFERENCE_INCOMING_DIE_SIDES &&
    params.tuning.referenceWoundsPerSuccess === REFERENCE_INCOMING_WOUNDS_PER_SUCCESS;

  if (extracted.mode === "NONE") {
    const result = emptyResult({
      startedAt,
      mode: "NONE",
      level: params.level,
      tier: params.tier,
      passiveState,
      tuning: params.tuning,
      mentalDefenceDice: params.mentalDefenceDice,
      braveryDieSides: params.braveryDieSides,
    });
    if (!validReference) return result;
    const perAttack = expectedIncomingMentalHarm({
      reference: {
        braveryDieSides: Math.trunc(params.braveryDieSides),
        mentalDefenceDice: Math.trunc(params.mentalDefenceDice),
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
  if (!validReference && extracted.eligibleBraveryPowerIds.length > 0) {
    addDiagnostic(
      extracted.diagnostics,
      SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.noReferenceAttack,
      "Semantic SELF Bravery Survivability requires a valid mental 4D8/WPS2-style incoming reference and Mental Defence package.",
    );
  }
  const activeSnapshots = params.passiveActivationSourceSuccessesByPowerId ?? {};
  if (passiveState === "ACTIVE_SNAPSHOT" && extracted.mode === "SEMANTIC") {
    for (const power of extracted.powers.filter(
      (candidate) => candidate.passive && candidate.braveryPackets.length > 0,
    )) {
      if (!Object.prototype.hasOwnProperty.call(activeSnapshots, power.id)) {
        addDiagnostic(
          extracted.diagnostics,
          SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.activeSnapshotMissingSuccesses,
          `Active Passive SELF Bravery Augment ${power.id} lacks stored activation source successes.`,
          power.id,
        );
        continue;
      }
      const stored = activeSnapshots[power.id];
      if (!Number.isFinite(stored) || !Number.isInteger(stored) || stored < 0) {
        addDiagnostic(
          extracted.diagnostics,
          SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.activeSnapshotInvalidSuccesses,
          `Active Passive SELF Bravery Augment ${power.id} has invalid stored activation source successes.`,
          power.id,
        );
      }
    }
  }
  const blockingDiagnostics = extracted.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code !==
      SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.intellectNoApprovedManipulationReference,
  );
  if (extracted.mode === "FAIL_CLOSED" || blockingDiagnostics.length > 0) {
    return emptyResult({
      startedAt,
      mode: "FAIL_CLOSED",
      level: params.level,
      tier: params.tier,
      passiveState,
      tuning: params.tuning,
      mentalDefenceDice: params.mentalDefenceDice,
      braveryDieSides: params.braveryDieSides,
      extracted,
    });
  }
  if (!validReference) {
    return emptyResult({
      startedAt,
      mode: "SEMANTIC",
      level: params.level,
      tier: params.tier,
      passiveState,
      tuning: params.tuning,
      mentalDefenceDice: params.mentalDefenceDice,
      braveryDieSides: params.braveryDieSides,
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
  const reference: MentalReference = {
    braveryDieSides: Math.trunc(params.braveryDieSides),
    mentalDefenceDice: Math.trunc(params.mentalDefenceDice),
    blockPerSuccess: Math.max(0, params.blockPerSuccess),
    protection: Math.max(0, params.protection ?? 0),
    resistCoverage: Math.max(0, params.resistCoverage ?? 0),
  };
  const without = optimize({
    powers: extracted.powers,
    includeBravery: false,
    passiveState,
    passiveActivationSourceSuccessesByPowerId: activeSnapshots,
    reference,
    tuning: params.tuning,
    counters,
  });
  const withBravery = optimize({
    powers: extracted.powers,
    includeBravery: true,
    passiveState,
    passiveActivationSourceSuccessesByPowerId: activeSnapshots,
    reference,
    tuning: params.tuning,
    counters,
  });
  const preventedHarm = Math.max(0, without.harm - withBravery.harm);
  const semanticDurabilityRatio =
    withBravery.harm > EPSILON
      ? without.harm / withBravery.harm
      : without.harm > EPSILON
        ? Number.POSITIVE_INFINITY
        : 1;
  const maximumRatio = Math.max(0, params.tuning.supplementalContributionMaxRatio);
  const semanticSupplementalRatio = Number.isFinite(semanticDurabilityRatio)
    ? Math.max(0, Math.min(maximumRatio, semanticDurabilityRatio - 1))
    : maximumRatio;
  counters.runtimeMs = performance.now() - startedAt;
  return {
    mode: "SEMANTIC",
    scoreOverride: semanticSupplementalRatio,
    eligiblePowerIds: extracted.eligiblePowerIds,
    eligibleBraveryPowerIds: extracted.eligibleBraveryPowerIds,
    eligibleIntellectPowerIds: extracted.eligibleIntellectPowerIds,
    fiveTurnHarmWithout: without.harm,
    fiveTurnHarmWith: withBravery.harm,
    preventedHarm,
    sustainedPrevention: preventedHarm / HORIZON_TURNS,
    semanticDurabilityRatio,
    semanticSupplementalRatio,
    expectedActivations: withBravery.activations,
    expectedPowerActions: withBravery.powerActions,
    diagnostics: extracted.diagnostics,
    policy: {
      level: params.level,
      tier: params.tier,
      horizonTurns: HORIZON_TURNS,
      powerLanesPerTurn: 1,
      incomingAttackTiming: "AFTER_CREATURE_END_OF_TURN",
      incomingDiceCount: REFERENCE_INCOMING_DICE_COUNT,
      incomingDieSides: REFERENCE_INCOMING_DIE_SIDES,
      incomingWoundsPerSuccess: REFERENCE_INCOMING_WOUNDS_PER_SUCCESS,
      hydratedMentalDefenceDice: Math.trunc(params.mentalDefenceDice),
      braveryDieSides: Math.trunc(params.braveryDieSides),
      passiveState,
      nextLegalTurnFormula: "activationTurn + cooldown + 1",
      sameAttributeModifierClamp: 5,
      supplementalContributionMaxRatio: maximumRatio,
      dodgeContribution: 0,
      cleanupContribution: 0,
      resistContribution: 0,
      majorInjuryContribution: 0,
    },
    performance: counters,
  };
}
