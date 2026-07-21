import { adaptPowerToCombatActions } from "@/lib/combat-lab/powerAdapter";
import type { CombatAction, CombatAttributeName } from "@/lib/combat-lab/types";
import {
  createSuccessDistribution,
  getModifierSeverity,
  type IncarnateDieSides,
} from "@/lib/summoning/augmentDebuffEconomics";
import type {
  EffectPacket,
  MonsterTier,
  Power,
  PowerCooldownAuthorityResult,
} from "@/lib/summoning/types";
import { estimatePowerPacketExpectedTargets } from "@/lib/powers/expectedTargetEstimation";

export const SEMANTIC_SYNERGY_DIAGNOSTIC = {
  legacy: "LEGACY_SYNERGY_MODEL",
  mixed: "MIXED_SEMANTIC_LEGACY_SYNERGY_UNSUPPORTED",
  unscoredNonPowerLegacy: "UNSCORED_NON_POWER_LEGACY_SYNERGY",
  unsupportedLevel: "UNSUPPORTED_SEMANTIC_SYNERGY_LEVEL",
  missingIdentity: "SEMANTIC_SYNERGY_MISSING_IDENTITY",
  missingCooldown: "SEMANTIC_SYNERGY_MISSING_COOLDOWN_AUTHORITY",
  unsupportedRuntime: "SEMANTIC_SYNERGY_RUNTIME_UNSUPPORTED",
  unsupportedTargeting: "SEMANTIC_SYNERGY_TARGETING_UNSUPPORTED",
  unsupportedDie: "SEMANTIC_SYNERGY_SOURCE_DIE_UNSUPPORTED",
  unsupportedDependency: "SEMANTIC_SYNERGY_DEPENDENCY_UNSUPPORTED",
  preparedActiveReference: "PASSIVE_SYNERGY_PREPARED_ACTIVE_REFERENCE",
} as const;

export type SemanticSynergyDiagnosticCode =
  (typeof SEMANTIC_SYNERGY_DIAGNOSTIC)[keyof typeof SEMANTIC_SYNERGY_DIAGNOSTIC];

export type SemanticSynergyTier = Exclude<MonsterTier, "LEGENDARY">;

export type SemanticSynergyTierTuning = {
  tierScale: number;
  midpointRawSupport: number;
  activeCapacity: 1 | 2;
};

export type SemanticSynergyTuning = {
  supportedLevel: 3;
  horizonTurns: 5;
  passiveContributionTurns: 4;
  coefficient: 4;
  clampMaximum: 5;
  tiers: Record<SemanticSynergyTier, SemanticSynergyTierTuning>;
};

export const LEVEL_3_SEMANTIC_SYNERGY_TUNING: SemanticSynergyTuning = {
  supportedLevel: 3,
  horizonTurns: 5,
  passiveContributionTurns: 4,
  coefficient: 4,
  clampMaximum: 5,
  tiers: {
    MINION: {
      tierScale: 0.903490017,
      midpointRawSupport: 2.25,
      activeCapacity: 1,
    },
    SOLDIER: {
      tierScale: 6.08600914,
      midpointRawSupport: 15.15625,
      activeCapacity: 1,
    },
    ELITE: {
      tierScale: 9.377021719,
      midpointRawSupport: 23.352,
      activeCapacity: 1,
    },
    BOSS: {
      tierScale: 18.754043438,
      midpointRawSupport: 46.704,
      activeCapacity: 2,
    },
  },
};

type SemanticSynergyPowerEntry = {
  id?: string | null;
  name?: string | null;
  axisVector?: { synergy?: number | null } | null;
  authoredPower?: Power | null;
  cooldownAuthority?: PowerCooldownAuthorityResult | null;
};

export type SemanticSynergyMonsterInput = {
  level: number;
  tier: MonsterTier;
  legendary?: boolean | null;
  attackDie: unknown;
  guardDie: unknown;
  fortitudeDie: unknown;
  intellectDie: unknown;
  synergyDie: unknown;
  braveryDie: unknown;
  powers?: Power[] | null;
};

export type SemanticSynergyInput = {
  monster: SemanticSynergyMonsterInput;
  powers?: SemanticSynergyPowerEntry[] | null;
  legacyRawSynergy: number;
  legacyNonPowerSynergy: number;
  legacyNonPowerSynergySources?: LegacyNonPowerSynergySource[];
  tuning?: SemanticSynergyTuning;
  passiveState?: SemanticSynergyPassiveState;
};

export type LegacyNonPowerSynergySource = {
  sourceType: "TRAIT" | "EQUIPMENT" | "NATURAL_ATTACK" | "LIMIT_BREAK" | "OTHER";
  name: string;
  amount: number;
};

export type SemanticSynergyPassiveState = "PREPARED_ACTIVE" | "INACTIVE";

type PacketModel = {
  packetId: string;
  powerId: string;
  attribute: CombatAttributeName;
  targetBucket: string;
  expectedTargetCount: number;
  potency: number;
  modifier: 1 | 2 | 3 | 4 | 5;
  durationTurns: number;
  passive: boolean;
  recurring: boolean;
  rollGroupId: string;
};

type RollGroupModel = {
  id: string;
  distribution: number[];
  packets: PacketModel[];
  recurringPackets: PacketModel[];
};

type PowerModel = {
  id: string;
  name: string;
  cooldownTurns: number;
  passive: boolean;
  packets: PacketModel[];
  rollGroups: RollGroupModel[];
};

type StatusState = {
  packetId: string;
  stacks: number;
  remainingDuration: number;
};

type RecurrenceState = {
  groupId: string;
  attemptsRemaining: number;
};

type OptimizerState = {
  turn: number;
  nextLegalTurns: number[];
  statuses: StatusState[];
  recurrences: RecurrenceState[];
  passiveEstablished: boolean;
  activePassivePowerIds: string[];
};

type OptimizerCounters = {
  statesVisited: number;
  memoizedStateCount: number;
  memoHits: number;
  transitionBranches: number;
  choiceCount: number;
  passiveActivationChoices: number;
  passiveActivationBranches: number;
  passiveActivationFailureBranches: number;
};

type Extraction = {
  detectedSemanticPacketCount: number;
  routedElsewherePacketCount: number;
  powers: PowerModel[];
  packetModels: Map<string, PacketModel>;
  rollGroups: Map<string, RollGroupModel>;
  diagnostics: Array<{ code: SemanticSynergyDiagnosticCode; message: string }>;
  adapterWarnings: string[];
  duplicatePacketIdsRemoved: string[];
  legacyPowerSupport: boolean;
  semanticPowerIds: string[];
};

export type SemanticSynergyResult = {
  mode:
    | "NONE"
    | "LEVEL_3_SEMANTIC"
    | "LEVEL_3_SEMANTIC_WITH_EXCLUSIONS"
    | "LEGACY_ONLY"
    | "MIXED_UNSUPPORTED"
    | "SEMANTIC_UNSUPPORTED";
  scoreOverride: number | null;
  rawSemanticSupport: number;
  legacyRawSynergy: number;
  tierScale: number | null;
  midpointRawSupport: number | null;
  horizonTurns: number;
  activeCapacity: number | null;
  diagnostics: Array<{ code: SemanticSynergyDiagnosticCode; message: string }>;
  excludedLegacySynergySources: LegacyNonPowerSynergySource[];
  detectedSemanticPacketCount: number;
  semanticPowerIds: string[];
  duplicatePacketIdsRemoved: string[];
  legalActivationTurns: Array<{
    powerId: string;
    powerName: string;
    passive: boolean;
    cooldownTurns: number;
    turns: number[];
  }>;
  optimizer: {
    exact: true;
    algorithm: "FINITE_HORIZON_MEMOIZED_STATE_ENUMERATION";
    statesVisited: number;
    memoizedStateCount: number;
    memoHits: number;
    transitionBranches: number;
    choiceCount: number;
    passiveActivationChoices: number;
    passiveActivationBranches: number;
    passiveActivationFailureBranches: number;
    runtimeMs: number;
  } | null;
  policy: {
    actualRelevantDice: true;
    cooldownCadence: "NEXT_LEGAL_USE_T_PLUS_C_PLUS_1";
    passiveContributionTurns: number;
    passiveState: SemanticSynergyPassiveState;
    passiveConsumesCapacity: boolean;
    activeCapacityIsThroughputCeiling: true;
    sameAttributeClamp: number;
    linkedApplication: "INHERIT_TARGET_LOCAL_PRIMARY";
    sameSourceReapplication: "MAX_AND_REFRESH";
    legacyCombination:
      "SEMANTIC_POWER_AUTHORITY_EXCLUDES_NON_POWER_LEGACY;_MIXED_POWER_MODELS_FAIL_CLOSED";
  };
  adapterWarnings: string[];
};

const EPSILON = 1e-12;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedIntention(packet: EffectPacket): string {
  return String(packet.intention ?? packet.type ?? "").trim().toUpperCase();
}

function packetsForPower(power: Power): EffectPacket[] {
  return power.effectPackets?.length ? power.effectPackets : power.intentions;
}

function isSelfPacket(packet: EffectPacket): boolean {
  const details = asRecord(packet.detailsJson);
  return (
    String(packet.applyTo ?? details.applyTo ?? "").trim().toUpperCase() === "SELF" ||
    String(details.rangeCategory ?? "").trim().toUpperCase() === "SELF"
  );
}

function isAlliedSemanticCandidate(packet: EffectPacket): boolean {
  return (
    normalizedIntention(packet) === "AUGMENT" &&
    packet.modifier !== null &&
    packet.modifier !== undefined &&
    !isSelfPacket(packet)
  );
}

function hasLegacyPowerSupport(power: Power): boolean {
  return packetsForPower(power).some((packet) => {
    const intention = normalizedIntention(packet);
    if (intention === "SUPPORT") return true;
    return (
      intention === "AUGMENT" &&
      (packet.modifier === null || packet.modifier === undefined) &&
      !isSelfPacket(packet)
    );
  });
}

function dieSides(value: unknown): IncarnateDieSides | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "D4") return 4;
  if (normalized === "D6") return 6;
  if (normalized === "D8") return 8;
  if (normalized === "D10") return 10;
  if (normalized === "D12") return 12;
  return null;
}

function relevantDie(
  monster: SemanticSynergyMonsterInput,
  attribute: CombatAttributeName,
): IncarnateDieSides | null {
  const value =
    attribute === "Attack"
      ? monster.attackDie
      : attribute === "Guard"
        ? monster.guardDie
        : attribute === "Fortitude"
          ? monster.fortitudeDie
          : attribute === "Intellect"
            ? monster.intellectDie
            : attribute === "Synergy"
              ? monster.synergyDie
              : monster.braveryDie;
  return dieSides(value);
}

function durationForAction(action: CombatAction): { turns: number; passive: boolean } | null {
  if (action.passive && action.passiveDuration && action.durationKind === "passive") {
    return { turns: 5, passive: true };
  }
  if (action.durationKind === "passive") return null;
  const turns = Math.trunc(action.durationRounds ?? action.modifier?.durationRounds ?? 1);
  if (!Number.isInteger(turns) || turns < 1 || turns > 4) return null;
  return { turns, passive: false };
}

function expectedTargets(power: Power, packet: EffectPacket): number | null {
  const estimated = estimatePowerPacketExpectedTargets({ power, packet });
  if (estimated.calculationMode === "NON_AOE_AUTHORED_TARGETS") {
    return estimated.expectedTargets;
  }
  const explicit = Number(asRecord(packet.detailsJson).expectedTargetCount);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return estimated.expectedTargets;
}

function flattenActions(action: CombatAction): CombatAction[] {
  return [action, ...(action.secondaryActions ?? []).flatMap(flattenActions)];
}

function diagnostic(
  code: SemanticSynergyDiagnosticCode,
  message: string,
): { code: SemanticSynergyDiagnosticCode; message: string } {
  return { code, message };
}

function extractSemanticPowers(params: SemanticSynergyInput): Extraction {
  const entries: SemanticSynergyPowerEntry[] = params.powers?.length
    ? params.powers
    : (params.monster.powers ?? []).map((power) => ({
        id: power.id ?? null,
        name: power.name,
        authoredPower: power,
        cooldownAuthority: power.cooldownAuthority ?? null,
      }));
  const diagnostics: Extraction["diagnostics"] = [];
  const adapterWarnings: string[] = [];
  const duplicatePacketIdsRemoved = new Set<string>();
  const seenPacketIds = new Set<string>();
  const packetModels = new Map<string, PacketModel>();
  const rollGroups = new Map<string, RollGroupModel>();
  const powerModels = new Map<string, PowerModel>();
  let detectedSemanticPacketCount = 0;
  let routedElsewherePacketCount = 0;
  let legacyPowerSupport = false;

  for (const entry of entries) {
    const power = entry.authoredPower;
    if (!power) {
      if (Number(entry.axisVector?.synergy ?? 0) > EPSILON) legacyPowerSupport = true;
      continue;
    }
    legacyPowerSupport = legacyPowerSupport || hasLegacyPowerSupport(power);
    routedElsewherePacketCount += packetsForPower(power).filter(
      (packet) =>
        normalizedIntention(packet) === "AUGMENT" &&
        packet.modifier !== null &&
        packet.modifier !== undefined &&
        isSelfPacket(packet),
    ).length;
    const semanticPackets = packetsForPower(power).filter(isAlliedSemanticCandidate);
    if (semanticPackets.length === 0) continue;
    detectedSemanticPacketCount += semanticPackets.length;

    if (power.counterMode === "YES") {
      diagnostics.push(
        diagnostic(
          SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedRuntime,
          `Power ${power.name} uses Response support, which has no approved semantic Synergy trigger-frequency model.`,
        ),
      );
      continue;
    }

    const powerId = String(power.id ?? entry.id ?? "").trim();
    if (!powerId || semanticPackets.some((packet) => !String(packet.id ?? "").trim())) {
      diagnostics.push(
        diagnostic(
          SEMANTIC_SYNERGY_DIAGNOSTIC.missingIdentity,
          `Power ${power.name} requires stable power and packet identities for semantic Synergy.`,
        ),
      );
      continue;
    }
    const cooldownAuthority = power.cooldownAuthority ?? entry.cooldownAuthority ?? null;
    if (!cooldownAuthority) {
      diagnostics.push(
        diagnostic(
          SEMANTIC_SYNERGY_DIAGNOSTIC.missingCooldown,
          `Power ${power.name} has no authoritative cooldown for semantic Synergy.`,
        ),
      );
      continue;
    }
    const hydratedPower = power.cooldownAuthority
      ? power
      : { ...power, cooldownAuthority };
    const adaptation = adaptPowerToCombatActions(hydratedPower);
    adapterWarnings.push(...adaptation.warnings);
    const allActions = adaptation.actions.flatMap(flattenActions);
    const eligibleActions = allActions.filter(
      (action) =>
        action.kind === "buff" &&
        action.modifier?.semanticFormat === "augmentDebuffThreeFieldV1" &&
        (action.targetPolicy === "ally" || action.targetPolicy === "allAllies"),
    );
    const eligiblePacketIds = new Set(
      eligibleActions.map((action) => String(action.sourcePacketId ?? "")).filter(Boolean),
    );
    const missingRuntimePackets = semanticPackets.filter(
      (packet) => !eligiblePacketIds.has(String(packet.id)),
    );
    if (missingRuntimePackets.length > 0) {
      diagnostics.push(
        diagnostic(
          SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedRuntime,
          `Power ${power.name} has semantic Augment packets that current runtime hydration cannot support: ${missingRuntimePackets.map((packet) => packet.id).join(", ")}.`,
        ),
      );
      continue;
    }

    const rootActions = adaptation.actions.filter((action) =>
      eligibleActions.some((candidate) => candidate === action),
    );
    const rootBySecondaryId = new Map<string, CombatAction>();
    for (const root of adaptation.actions) {
      for (const secondary of root.secondaryActions ?? []) {
        if (secondary.sourcePacketId) rootBySecondaryId.set(secondary.sourcePacketId, root);
      }
    }
    const currentPackets: PacketModel[] = [];
    let rejected = false;
    for (const action of eligibleActions) {
      const packetId = String(action.sourcePacketId ?? "");
      if (
        seenPacketIds.has(packetId) ||
        currentPackets.some((packet) => packet.packetId === packetId)
      ) {
        duplicatePacketIdsRemoved.add(packetId);
        continue;
      }
      const sourcePacket = action.source?.packet ?? semanticPackets.find((packet) => packet.id === packetId);
      if (!sourcePacket || !action.modifier) {
        rejected = true;
        diagnostics.push(
          diagnostic(
            SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedRuntime,
            `Power ${power.name} packet ${packetId} lost its hydrated semantic source.`,
          ),
        );
        continue;
      }
      const modifier = Number(action.modifier.modifierMagnitude ?? action.modifier.amount);
      if (!Number.isInteger(modifier) || modifier < 1 || modifier > 5) {
        rejected = true;
        diagnostics.push(
          diagnostic(
            SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedRuntime,
            `Power ${power.name} packet ${packetId} has unsupported Modifier ${modifier}.`,
          ),
        );
        continue;
      }
      const duration = durationForAction(action);
      if (!duration) {
        rejected = true;
        diagnostics.push(
          diagnostic(
            SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedRuntime,
            `Power ${power.name} packet ${packetId} has unsupported timing or duration.`,
          ),
        );
        continue;
      }
      const breadth = expectedTargets(hydratedPower, sourcePacket);
      if (breadth === null || !Number.isFinite(breadth) || breadth <= 0) {
        rejected = true;
        diagnostics.push(
          diagnostic(
            SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedTargeting,
            `Power ${power.name} packet ${packetId} has no authoritative expected target count.`,
          ),
        );
        continue;
      }
      const root = rootBySecondaryId.get(packetId) ?? rootActions.find((candidate) => candidate === action) ?? action;
      const rollGroupId = action.linkedToPrimary
        ? String(root.sourcePacketId ?? "")
        : packetId;
      if (!rollGroupId) {
        rejected = true;
        diagnostics.push(
          diagnostic(
            SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedDependency,
            `Power ${power.name} packet ${packetId} has an unresolved linked dependency.`,
          ),
        );
        continue;
      }
      const timing = String(sourcePacket.effectTimingType ?? "ON_CAST").toUpperCase();
      const recurring = timing === "START_OF_TURN" || timing === "START_OF_TURN_WHILST_CHANNELLED";
      const packetModel: PacketModel = {
        packetId,
        powerId,
        attribute: action.modifier.attribute,
        targetBucket: `${String(sourcePacket.applyTo ?? "ALLIES").toUpperCase()}:TARGETS=${breadth}`,
        expectedTargetCount: breadth,
        potency: Math.max(1, Math.trunc(action.potency)),
        modifier: modifier as PacketModel["modifier"],
        durationTurns: duration.turns,
        passive: duration.passive,
        recurring,
        rollGroupId,
      };
      currentPackets.push(packetModel);
    }
    if (rejected || currentPackets.length === 0) continue;
    if (new Set(currentPackets.map((packet) => packet.passive)).size > 1) {
      diagnostics.push(
        diagnostic(
          SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedRuntime,
          `Power ${power.name} mixes Passive and active semantic support packets in one power.`,
        ),
      );
      continue;
    }

    const currentGroups = new Map<string, RollGroupModel>();
    for (const packet of currentPackets) {
      const existing = currentGroups.get(packet.rollGroupId);
      if (existing) {
        existing.packets.push(packet);
        if (packet.recurring) existing.recurringPackets.push(packet);
        continue;
      }
      const rollAction = eligibleActions.find(
        (action) => String(action.sourcePacketId ?? "") === packet.rollGroupId,
      );
      if (!rollAction) {
        rejected = true;
        diagnostics.push(
          diagnostic(
            SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedDependency,
            `Power ${power.name} roll group ${packet.rollGroupId} has no independent primary action.`,
          ),
        );
        continue;
      }
      const sourceDie = relevantDie(params.monster, "Synergy");
      if (sourceDie === null) {
        rejected = true;
        diagnostics.push(
          diagnostic(
            SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedDie,
            `Power ${power.name} requires an unsupported Synergy die for allied support delivery.`,
          ),
        );
        continue;
      }
      currentGroups.set(packet.rollGroupId, {
        id: packet.rollGroupId,
        distribution: createSuccessDistribution({
          dieSides: sourceDie,
          diceCount: Math.max(1, Math.trunc(rollAction.diceCount)),
        }),
        packets: [packet],
        recurringPackets: packet.recurring ? [packet] : [],
      });
    }
    if (rejected) continue;
    for (const packet of currentPackets) {
      seenPacketIds.add(packet.packetId);
      packetModels.set(packet.packetId, packet);
    }
    for (const group of currentGroups.values()) rollGroups.set(group.id, group);
    const passive = adaptation.actions.some((action) => action.passive === true);
    const existingPower = powerModels.get(powerId);
    if (existingPower) {
      existingPower.packets.push(...currentPackets);
      for (const group of currentGroups.values()) {
        if (!existingPower.rollGroups.some((candidate) => candidate.id === group.id)) {
          existingPower.rollGroups.push(group);
        }
      }
      existingPower.passive = existingPower.passive || passive;
    } else {
      powerModels.set(powerId, {
        id: powerId,
        name: power.name,
        cooldownTurns: cooldownAuthority.effectiveCooldownTurns,
        passive,
        packets: currentPackets,
        rollGroups: [...currentGroups.values()],
      });
    }
  }

  const powers = [...powerModels.values()].sort((left, right) => left.id.localeCompare(right.id));
  return {
    detectedSemanticPacketCount,
    routedElsewherePacketCount,
    powers,
    packetModels,
    rollGroups,
    diagnostics,
    adapterWarnings: [...new Set(adapterWarnings)],
    duplicatePacketIdsRemoved: [...duplicatePacketIdsRemoved].sort(),
    legacyPowerSupport,
    semanticPowerIds: powers.map((power) => power.id),
  };
}

function combinations(indexes: number[], maximum: number): number[][] {
  const output: number[][] = [[]];
  const visit = (start: number, chosen: number[]) => {
    if (chosen.length >= maximum) return;
    for (let index = start; index < indexes.length; index += 1) {
      const next = [...chosen, indexes[index]];
      output.push(next);
      visit(index + 1, next);
    }
  };
  visit(0, []);
  return output;
}

function statusKey(statuses: StatusState[]): string {
  return statuses
    .map((status) => `${status.packetId}:${status.stacks}:${status.remainingDuration}`)
    .join("|");
}

function recurrenceKey(recurrences: RecurrenceState[]): string {
  return recurrences
    .map((recurrence) => `${recurrence.groupId}:${recurrence.attemptsRemaining}`)
    .join("|");
}

function normalizeStatuses(statuses: StatusState[]): StatusState[] {
  return statuses
    .filter((status) => status.stacks > 0 && status.remainingDuration > 0)
    .sort((left, right) => left.packetId.localeCompare(right.packetId));
}

function normalizeRecurrences(recurrences: RecurrenceState[]): RecurrenceState[] {
  return recurrences
    .filter((recurrence) => recurrence.attemptsRemaining > 0)
    .sort((left, right) => left.groupId.localeCompare(right.groupId));
}

function stateKey(state: OptimizerState): string {
  return [
    state.turn,
    state.passiveEstablished ? 1 : 0,
    state.activePassivePowerIds.join(","),
    state.nextLegalTurns.join(","),
    statusKey(state.statuses),
    recurrenceKey(state.recurrences),
  ].join(";");
}

function applyPacketSuccesses(
  statuses: StatusState[],
  packet: PacketModel,
  successes: number,
): StatusState[] {
  if (successes <= 0) return statuses;
  const next = statuses.map((status) => ({ ...status }));
  const existing = next.find((status) => status.packetId === packet.packetId);
  const stacks = successes * packet.potency;
  if (existing) {
    existing.stacks = Math.max(existing.stacks, stacks);
    existing.remainingDuration = packet.passive ? 5 : packet.durationTurns;
  } else {
    next.push({
      packetId: packet.packetId,
      stacks,
      remainingDuration: packet.passive ? 5 : packet.durationTurns,
    });
  }
  return normalizeStatuses(next);
}

type TransitionBranch = {
  probability: number;
  statuses: StatusState[];
  recurrences: RecurrenceState[];
  activePassivePowerIds: string[];
};

function mergeBranches(branches: TransitionBranch[]): TransitionBranch[] {
  const merged = new Map<string, TransitionBranch>();
  for (const branch of branches) {
    if (branch.probability <= EPSILON) continue;
    const key = `${branch.activePassivePowerIds.join(",")};${statusKey(branch.statuses)};${recurrenceKey(branch.recurrences)}`;
    const existing = merged.get(key);
    if (existing) existing.probability += branch.probability;
    else merged.set(key, { ...branch });
  }
  return [...merged.values()];
}

function applyRollGroup(
  branches: TransitionBranch[],
  group: RollGroupModel,
  packets: PacketModel[],
): TransitionBranch[] {
  const next: TransitionBranch[] = [];
  for (const branch of branches) {
    group.distribution.forEach((probability, successes) => {
      if (probability <= EPSILON) return;
      let statuses = branch.statuses;
      for (const packet of packets) statuses = applyPacketSuccesses(statuses, packet, successes);
      next.push({
        probability: branch.probability * probability,
        statuses,
        recurrences: branch.recurrences,
        activePassivePowerIds: branch.activePassivePowerIds,
      });
    });
  }
  return mergeBranches(next);
}

function applyRecurrences(
  state: OptimizerState,
  extraction: Extraction,
): TransitionBranch[] {
  let branches: TransitionBranch[] = [{
    probability: 1,
    statuses: state.statuses,
    recurrences: state.recurrences.map((recurrence) => ({ ...recurrence })),
    activePassivePowerIds: state.activePassivePowerIds,
  }];
  for (const recurrence of state.recurrences) {
    const group = extraction.rollGroups.get(recurrence.groupId);
    if (!group || group.recurringPackets.length === 0) continue;
    branches = applyRollGroup(branches, group, group.recurringPackets).map((branch) => ({
      ...branch,
      recurrences: normalizeRecurrences(
        branch.recurrences.map((candidate) =>
          candidate.groupId === recurrence.groupId
            ? { ...candidate, attemptsRemaining: candidate.attemptsRemaining - 1 }
            : candidate,
        ),
      ),
    }));
  }
  return mergeBranches(branches);
}

function applyPowers(
  branches: TransitionBranch[],
  powers: PowerModel[],
  tuning: SemanticSynergyTuning,
): TransitionBranch[] {
  let output = branches;
  for (const power of powers) {
    for (const group of power.rollGroups) {
      output = applyRollGroup(output, group, group.packets);
      if (group.recurringPackets.length > 0) {
        output = output.map((branch) => {
          const recurrences = branch.recurrences.map((recurrence) => ({ ...recurrence }));
          const existing = recurrences.find((recurrence) => recurrence.groupId === group.id);
          const remaining = tuning.horizonTurns - 1;
          if (existing) existing.attemptsRemaining = Math.max(existing.attemptsRemaining, remaining);
          else recurrences.push({ groupId: group.id, attemptsRemaining: remaining });
          return { ...branch, recurrences: normalizeRecurrences(recurrences) };
        });
      }
    }
  }
  return mergeBranches(output);
}

function applyInactivePassiveActivation(
  branches: TransitionBranch[],
  power: PowerModel,
  tuning: SemanticSynergyTuning,
  counters: OptimizerCounters,
): TransitionBranch[] {
  const [activationGroup, ...remainingGroups] = power.rollGroups;
  if (!activationGroup) return branches;
  const activated: TransitionBranch[] = [];
  const failed: TransitionBranch[] = [];
  for (const branch of branches) {
    activationGroup.distribution.forEach((probability, successes) => {
      if (probability <= EPSILON) return;
      let statuses = branch.statuses;
      for (const packet of activationGroup.packets) {
        statuses = applyPacketSuccesses(statuses, packet, successes);
      }
      const next: TransitionBranch = {
        probability: branch.probability * probability,
        statuses,
        recurrences: branch.recurrences,
        activePassivePowerIds: successes > 0
          ? [...new Set([...branch.activePassivePowerIds, power.id])].sort()
          : branch.activePassivePowerIds,
      };
      if (successes > 0) activated.push(next);
      else failed.push(next);
    });
  }
  counters.passiveActivationBranches += activated.length + failed.length;
  counters.passiveActivationFailureBranches += failed.length;
  let successful = mergeBranches(activated);
  if (activationGroup.recurringPackets.length > 0) {
    successful = successful.map((branch) => ({
      ...branch,
      recurrences: normalizeRecurrences([
        ...branch.recurrences.filter((entry) => entry.groupId !== activationGroup.id),
        { groupId: activationGroup.id, attemptsRemaining: tuning.horizonTurns - 1 },
      ]),
    }));
  }
  if (remainingGroups.length > 0) {
    successful = applyPowers(successful, [{ ...power, rollGroups: remainingGroups }], tuning);
  }
  return mergeBranches([...failed, ...successful]);
}

function rewardForStatuses(
  statuses: StatusState[],
  packetModels: ReadonlyMap<string, PacketModel>,
  turn: number,
  tuning: SemanticSynergyTuning,
): number {
  const groups = new Map<string, { modifier: number; expectedTargets: number }>();
  for (const status of statuses) {
    const packet = packetModels.get(status.packetId);
    if (!packet || status.stacks <= 0 || status.remainingDuration <= 0) continue;
    if (packet.passive && turn > tuning.passiveContributionTurns) continue;
    const key = `${packet.targetBucket}\u0000${packet.attribute}`;
    const group = groups.get(key) ?? { modifier: 0, expectedTargets: packet.expectedTargetCount };
    group.modifier += packet.modifier;
    groups.set(key, group);
  }
  let reward = 0;
  for (const group of groups.values()) {
    const modifier = Math.min(tuning.clampMaximum, group.modifier) as 1 | 2 | 3 | 4 | 5;
    if (modifier > 0) {
      reward += getModifierSeverity("AUGMENT", modifier) * group.expectedTargets;
    }
  }
  return reward;
}

function advanceStatuses(
  statuses: StatusState[],
  packetModels: ReadonlyMap<string, PacketModel>,
): StatusState[] {
  return normalizeStatuses(
    statuses.map((status) => {
      const packet = packetModels.get(status.packetId);
      if (!packet) return { ...status, stacks: 0, remainingDuration: 0 };
      return {
        ...status,
        stacks: Math.max(0, status.stacks - 1),
        remainingDuration: packet.passive
          ? status.remainingDuration
          : Math.max(0, status.remainingDuration - 1),
      };
    }),
  );
}

function optimizeSemanticSynergy(
  extraction: Extraction,
  tuning: SemanticSynergyTuning,
  tier: SemanticSynergyTier,
  passiveState: SemanticSynergyPassiveState,
): { rawSupport: number; counters: OptimizerCounters; runtimeMs: number } {
  const started = performance.now();
  const powers = extraction.powers;
  const activePowerIndexes = powers
    .map((power, index) => ({ power, index }))
    .filter(({ power }) => !power.passive)
    .map(({ index }) => index);
  const passivePowers = powers.filter((power) => power.passive);
  const passivePowerIndexes = powers
    .map((power, index) => ({ power, index }))
    .filter(({ power }) => power.passive)
    .map(({ index }) => index);
  const capacity = tuning.tiers[tier].activeCapacity;
  const memo = new Map<string, number>();
  const counters: OptimizerCounters = {
    statesVisited: 0,
    memoizedStateCount: 0,
    memoHits: 0,
    transitionBranches: 0,
    choiceCount: 0,
    passiveActivationChoices: 0,
    passiveActivationBranches: 0,
    passiveActivationFailureBranches: 0,
  };

  const solve = (state: OptimizerState): number => {
    if (state.turn > tuning.horizonTurns) return 0;
    const key = stateKey(state);
    const cached = memo.get(key);
    if (cached !== undefined) {
      counters.memoHits += 1;
      return cached;
    }
    counters.statesVisited += 1;
    const legal = [
      ...activePowerIndexes.filter((index) => state.nextLegalTurns[index] <= state.turn),
      ...(passiveState === "INACTIVE"
        ? passivePowerIndexes.filter((index) => !state.activePassivePowerIds.includes(powers[index].id))
        : []),
    ].sort((left, right) => powers[left].id.localeCompare(powers[right].id));
    const choices = combinations(legal, capacity).sort((left, right) => {
      const leftKey = left.map((index) => powers[index].id).join("|");
      const rightKey = right.map((index) => powers[index].id).join("|");
      return leftKey.localeCompare(rightKey);
    });
    let best = Number.NEGATIVE_INFINITY;
    for (const choice of choices) {
      counters.choiceCount += 1;
      let branches = applyRecurrences(state, extraction);
      if (passiveState === "PREPARED_ACTIVE" && !state.passiveEstablished) {
        branches = applyPowers(branches, passivePowers, tuning);
      }
      for (const index of choice) {
        const power = powers[index];
        if (power.passive) {
          counters.passiveActivationChoices += 1;
          branches = applyInactivePassiveActivation(branches, power, tuning, counters);
        } else {
          branches = applyPowers(branches, [power], tuning);
        }
      }
      counters.transitionBranches += branches.length;
      const nextLegalTurns = [...state.nextLegalTurns];
      for (const index of choice) {
        nextLegalTurns[index] = state.turn + powers[index].cooldownTurns + 1;
      }
      let expected = 0;
      for (const branch of branches) {
        const reward = rewardForStatuses(
          branch.statuses,
          extraction.packetModels,
          state.turn,
          tuning,
        );
        const future = solve({
          turn: state.turn + 1,
          nextLegalTurns,
          statuses: advanceStatuses(branch.statuses, extraction.packetModels),
          recurrences: branch.recurrences,
          passiveEstablished: passiveState === "PREPARED_ACTIVE",
          activePassivePowerIds: branch.activePassivePowerIds,
        });
        expected += branch.probability * (reward + future);
      }
      if (expected > best + EPSILON) best = expected;
    }
    const resolved = Number.isFinite(best) ? best : 0;
    memo.set(key, resolved);
    counters.memoizedStateCount = memo.size;
    return resolved;
  };

  const rawSupport = solve({
    turn: 1,
    nextLegalTurns: powers.map(() => 1),
    statuses: [],
    recurrences: [],
    passiveEstablished: false,
    activePassivePowerIds: [],
  });
  return { rawSupport, counters, runtimeMs: performance.now() - started };
}

export function normalizeLevel3SemanticSynergy(
  rawSupport: number,
  tierScale: number,
  coefficient = 4,
): number {
  if (!(rawSupport > 0)) return 0;
  return Math.min(10, coefficient * Math.log1p(rawSupport / tierScale));
}

function legalActivationTurns(
  power: PowerModel,
  tuning: SemanticSynergyTuning,
  passiveState: SemanticSynergyPassiveState,
): number[] {
  if (power.passive) {
    return passiveState === "PREPARED_ACTIVE"
      ? [1]
      : Array.from({ length: tuning.horizonTurns }, (_, index) => index + 1);
  }
  const turns: number[] = [];
  for (let turn = 1; turn <= tuning.horizonTurns; turn += power.cooldownTurns + 1) {
    turns.push(turn);
  }
  return turns;
}

export function computeLevel3SemanticSynergy(input: SemanticSynergyInput): SemanticSynergyResult {
  const tuning = input.tuning ?? LEVEL_3_SEMANTIC_SYNERGY_TUNING;
  const passiveState = input.passiveState ?? "PREPARED_ACTIVE";
  const extraction = extractSemanticPowers(input);
  const tier = String(input.monster.tier ?? "ELITE").toUpperCase() as SemanticSynergyTier;
  const tierTuning = tuning.tiers[tier] ?? null;
  const namedLegacySources = (input.legacyNonPowerSynergySources ?? [])
    .map((source) => ({
      sourceType: source.sourceType,
      name: source.name.trim() || "Unnamed non-power source",
      amount: Number(source.amount),
    }))
    .filter((source) => Number.isFinite(source.amount) && source.amount > EPSILON)
    .sort((left, right) =>
      left.sourceType.localeCompare(right.sourceType) || left.name.localeCompare(right.name),
    );
  const namedLegacyTotal = namedLegacySources.reduce((sum, source) => sum + source.amount, 0);
  const unnamedLegacyRemainder = Math.max(0, input.legacyNonPowerSynergy - namedLegacyTotal);
  const excludedLegacySynergySources = input.legacyNonPowerSynergy > EPSILON
    ? [
        ...namedLegacySources,
        ...(unnamedLegacyRemainder > EPSILON
          ? [{
              sourceType: "OTHER" as const,
              name: "Other non-power legacy Synergy",
              amount: unnamedLegacyRemainder,
            }]
          : []),
      ]
    : [];
  const base = {
    legacyRawSynergy: input.legacyRawSynergy,
    horizonTurns: tuning.horizonTurns,
    diagnostics: extraction.diagnostics,
    excludedLegacySynergySources: [],
    detectedSemanticPacketCount: extraction.detectedSemanticPacketCount,
    semanticPowerIds: extraction.semanticPowerIds,
    duplicatePacketIdsRemoved: extraction.duplicatePacketIdsRemoved,
    legalActivationTurns: extraction.powers.map((power) => ({
      powerId: power.id,
      powerName: power.name,
      passive: power.passive,
      cooldownTurns: power.cooldownTurns,
      turns: legalActivationTurns(power, tuning, passiveState),
    })),
    policy: {
      actualRelevantDice: true as const,
      cooldownCadence: "NEXT_LEGAL_USE_T_PLUS_C_PLUS_1" as const,
      passiveContributionTurns: tuning.passiveContributionTurns,
      passiveState,
      passiveConsumesCapacity: passiveState === "INACTIVE",
      activeCapacityIsThroughputCeiling: true as const,
      sameAttributeClamp: tuning.clampMaximum,
      linkedApplication: "INHERIT_TARGET_LOCAL_PRIMARY" as const,
      sameSourceReapplication: "MAX_AND_REFRESH" as const,
      legacyCombination:
        "SEMANTIC_POWER_AUTHORITY_EXCLUDES_NON_POWER_LEGACY;_MIXED_POWER_MODELS_FAIL_CLOSED" as const,
    },
    adapterWarnings: extraction.adapterWarnings,
  };
  const legacyExists =
    extraction.legacyPowerSupport ||
    input.legacyNonPowerSynergy > EPSILON ||
    (extraction.detectedSemanticPacketCount === 0 && input.legacyRawSynergy > EPSILON);
  if (extraction.detectedSemanticPacketCount === 0) {
    const routedElsewhereOnly =
      extraction.routedElsewherePacketCount > 0 &&
      !extraction.legacyPowerSupport &&
      input.legacyNonPowerSynergy <= EPSILON;
    return {
      ...base,
      mode: routedElsewhereOnly ? "NONE" : legacyExists ? "LEGACY_ONLY" : "NONE",
      scoreOverride: routedElsewhereOnly ? 0 : null,
      rawSemanticSupport: 0,
      tierScale: tierTuning?.tierScale ?? null,
      midpointRawSupport: tierTuning?.midpointRawSupport ?? null,
      activeCapacity: tierTuning?.activeCapacity ?? null,
      diagnostics: legacyExists && !routedElsewhereOnly
        ? [
            ...base.diagnostics,
            diagnostic(
              SEMANTIC_SYNERGY_DIAGNOSTIC.legacy,
              "No supported semantic Augment is present; existing legacy Synergy remains active.",
            ),
          ]
        : base.diagnostics,
      optimizer: null,
    };
  }
  if (extraction.legacyPowerSupport) {
    return {
      ...base,
      mode: "MIXED_UNSUPPORTED",
      scoreOverride: 0,
      rawSemanticSupport: 0,
      tierScale: tierTuning?.tierScale ?? null,
      midpointRawSupport: tierTuning?.midpointRawSupport ?? null,
      activeCapacity: tierTuning?.activeCapacity ?? null,
      diagnostics: [
        ...base.diagnostics,
        diagnostic(
          SEMANTIC_SYNERGY_DIAGNOSTIC.mixed,
          "Semantic and legacy power support cannot be combined; Synergy failed closed.",
        ),
      ],
      optimizer: null,
    };
  }
  if (Math.trunc(input.monster.level) !== tuning.supportedLevel || !tierTuning) {
    return {
      ...base,
      mode: "SEMANTIC_UNSUPPORTED",
      scoreOverride: 0,
      rawSemanticSupport: 0,
      tierScale: tierTuning?.tierScale ?? null,
      midpointRawSupport: tierTuning?.midpointRawSupport ?? null,
      activeCapacity: tierTuning?.activeCapacity ?? null,
      diagnostics: [
        ...base.diagnostics,
        diagnostic(
          SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedLevel,
          `Semantic Synergy supports Level ${tuning.supportedLevel} only; received Level ${input.monster.level}.`,
        ),
      ],
      optimizer: null,
    };
  }
  if (extraction.diagnostics.length > 0 || extraction.powers.length === 0) {
    return {
      ...base,
      mode: "SEMANTIC_UNSUPPORTED",
      scoreOverride: 0,
      rawSemanticSupport: 0,
      tierScale: tierTuning.tierScale,
      midpointRawSupport: tierTuning.midpointRawSupport,
      activeCapacity: tierTuning.activeCapacity,
      optimizer: null,
    };
  }
  const optimized = optimizeSemanticSynergy(extraction, tuning, tier, passiveState);
  const hasPassive = extraction.powers.some((power) => power.passive);
  const exclusionDiagnostics = excludedLegacySynergySources.map((source) =>
    diagnostic(
      SEMANTIC_SYNERGY_DIAGNOSTIC.unscoredNonPowerLegacy,
      `${source.name} contributes ${source.amount.toFixed(3)} legacy Synergy but has no supported semantic runtime model; its Synergy weight was not scored.`,
    ),
  );
  return {
    ...base,
    mode: excludedLegacySynergySources.length > 0
      ? "LEVEL_3_SEMANTIC_WITH_EXCLUSIONS"
      : "LEVEL_3_SEMANTIC",
    excludedLegacySynergySources,
    scoreOverride: normalizeLevel3SemanticSynergy(
      optimized.rawSupport,
      tierTuning.tierScale,
      tuning.coefficient,
    ),
    rawSemanticSupport: optimized.rawSupport,
    tierScale: tierTuning.tierScale,
    midpointRawSupport: tierTuning.midpointRawSupport,
    activeCapacity: tierTuning.activeCapacity,
    diagnostics: hasPassive && passiveState === "PREPARED_ACTIVE"
      ? [
          ...base.diagnostics,
          ...exclusionDiagnostics,
          diagnostic(
            SEMANTIC_SYNERGY_DIAGNOSTIC.preparedActiveReference,
            "Passive Synergy uses the canonical PREPARED_ACTIVE authored-creature reference; it does not assert current campaign state.",
          ),
        ]
      : [...base.diagnostics, ...exclusionDiagnostics],
    optimizer: {
      exact: true,
      algorithm: "FINITE_HORIZON_MEMOIZED_STATE_ENUMERATION",
      ...optimized.counters,
      runtimeMs: optimized.runtimeMs,
    },
  };
}
