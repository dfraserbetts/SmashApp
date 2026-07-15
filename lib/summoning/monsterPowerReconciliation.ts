import type { EffectPacket, Power } from "@/lib/summoning/types";

export const SUMMONING_OPAQUE_ID_MAX_LENGTH = 200;

export function readSummoningOpaqueId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return id.length > 0 && id.length <= SUMMONING_OPAQUE_ID_MAX_LENGTH ? id : undefined;
}

export function createSummoningOpaqueId(): string {
  return globalThis.crypto.randomUUID();
}

export function assignSummoningPowerIdentities(
  power: Power,
  options: {
    forceNew?: boolean;
    createId?: () => string;
  } = {},
): Power {
  const createId = options.createId ?? createSummoningOpaqueId;
  const forceNew = options.forceNew === true;
  const effectPackets = power.effectPackets.map((packet) => ({
    ...packet,
    id: forceNew ? createId() : readSummoningOpaqueId(packet.id) ?? createId(),
  }));
  return {
    ...power,
    id: forceNew ? createId() : readSummoningOpaqueId(power.id) ?? createId(),
    effectPackets,
    intentions: effectPackets.map((packet) => ({ ...packet })),
  };
}

export type SubmittedPowerIdentity = {
  id?: string;
  packets: Array<{ id?: string }>;
};

export type ExistingPowerIdentity = {
  id: string;
  monsterId: string | null;
  packets: Array<{ id: string }>;
};

export type OccupiedPowerIdentity = {
  id: string;
  monsterId: string | null;
};

export type OccupiedPacketIdentity = {
  id: string;
  powerId: string;
  monsterId: string | null;
};

export type MonsterPowerReconciliationPlan = {
  createPowers: Array<{ submittedPowerIndex: number; suppliedId?: string }>;
  updatePowers: Array<{
    submittedPowerIndex: number;
    powerId: string;
    createPackets: Array<{ submittedPacketIndex: number; suppliedId?: string }>;
    updatePackets: Array<{ submittedPacketIndex: number; packetId: string }>;
    deletePacketIds: string[];
  }>;
  deletePowerIds: string[];
};

export type MonsterPowerIdentityErrorCode =
  | "DUPLICATE_POWER_ID"
  | "DUPLICATE_PACKET_ID"
  | "POWER_ID_OWNED_BY_ANOTHER_MONSTER"
  | "PACKET_ID_OWNED_BY_ANOTHER_MONSTER"
  | "PACKET_ID_OWNED_BY_ANOTHER_POWER"
  | "POWER_ID_OWNERSHIP_UNRESOLVED"
  | "PACKET_ID_OWNERSHIP_UNRESOLVED";

export class MonsterPowerIdentityError extends Error {
  readonly code: MonsterPowerIdentityErrorCode;

  constructor(code: MonsterPowerIdentityErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "MonsterPowerIdentityError";
    this.code = code;
  }
}

function assertUniqueSubmittedIds(submittedPowers: readonly SubmittedPowerIdentity[]) {
  const powerIds = new Set<string>();
  const packetIds = new Set<string>();
  for (const power of submittedPowers) {
    if (power.id) {
      if (powerIds.has(power.id)) {
        throw new MonsterPowerIdentityError(
          "DUPLICATE_POWER_ID",
          "A submitted power identity is duplicated.",
        );
      }
      powerIds.add(power.id);
    }
    for (const packet of power.packets) {
      if (!packet.id) continue;
      if (packetIds.has(packet.id)) {
        throw new MonsterPowerIdentityError(
          "DUPLICATE_PACKET_ID",
          "A submitted packet identity is duplicated.",
        );
      }
      packetIds.add(packet.id);
    }
  }
}

export function collectSubmittedPowerIdentityIds(
  submittedPowers: readonly SubmittedPowerIdentity[],
): { powerIds: string[]; packetIds: string[] } {
  return {
    powerIds: submittedPowers.flatMap((power) => (power.id ? [power.id] : [])),
    packetIds: submittedPowers.flatMap((power) =>
      power.packets.flatMap((packet) => (packet.id ? [packet.id] : [])),
    ),
  };
}

export function planMonsterPowerReconciliation(params: {
  mode: "CREATE" | "UPDATE";
  monsterId: string | null;
  submittedPowers: readonly SubmittedPowerIdentity[];
  existingPowers: readonly ExistingPowerIdentity[];
  occupiedPowers: readonly OccupiedPowerIdentity[];
  occupiedPackets: readonly OccupiedPacketIdentity[];
}): MonsterPowerReconciliationPlan {
  assertUniqueSubmittedIds(params.submittedPowers);
  const existingPowerById = new Map(params.existingPowers.map((power) => [power.id, power]));
  const occupiedPowerById = new Map(params.occupiedPowers.map((power) => [power.id, power]));
  const occupiedPacketById = new Map(params.occupiedPackets.map((packet) => [packet.id, packet]));
  const retainedPowerIds = new Set<string>();
  const createPowers: MonsterPowerReconciliationPlan["createPowers"] = [];
  const updatePowers: MonsterPowerReconciliationPlan["updatePowers"] = [];

  params.submittedPowers.forEach((submittedPower, submittedPowerIndex) => {
    const occupiedPower = submittedPower.id
      ? occupiedPowerById.get(submittedPower.id)
      : undefined;
    const existingPower = submittedPower.id
      ? existingPowerById.get(submittedPower.id)
      : undefined;

    if (occupiedPower) {
      if (params.mode === "CREATE" || occupiedPower.monsterId !== params.monsterId) {
        throw new MonsterPowerIdentityError(
          "POWER_ID_OWNED_BY_ANOTHER_MONSTER",
          "A submitted power identity is already in use.",
        );
      }
      if (!existingPower) {
        throw new MonsterPowerIdentityError(
          "POWER_ID_OWNERSHIP_UNRESOLVED",
          "A submitted power identity is not part of the editable monster.",
        );
      }
    }

    if (!existingPower) {
      for (const packet of submittedPower.packets) {
        if (!packet.id) continue;
        const occupiedPacket = occupiedPacketById.get(packet.id);
        if (!occupiedPacket) continue;
        throw new MonsterPowerIdentityError(
          occupiedPacket.monsterId !== params.monsterId
            ? "PACKET_ID_OWNED_BY_ANOTHER_MONSTER"
            : "PACKET_ID_OWNED_BY_ANOTHER_POWER",
          "A submitted packet identity is already in use.",
        );
      }
      createPowers.push({
        submittedPowerIndex,
        ...(submittedPower.id ? { suppliedId: submittedPower.id } : {}),
      });
      return;
    }

    retainedPowerIds.add(existingPower.id);
    const existingPacketIds = new Set(existingPower.packets.map((packet) => packet.id));
    const retainedPacketIds = new Set<string>();
    const createPackets: Array<{ submittedPacketIndex: number; suppliedId?: string }> = [];
    const updatePackets: Array<{ submittedPacketIndex: number; packetId: string }> = [];

    submittedPower.packets.forEach((submittedPacket, submittedPacketIndex) => {
      if (!submittedPacket.id) {
        createPackets.push({ submittedPacketIndex });
        return;
      }
      const occupiedPacket = occupiedPacketById.get(submittedPacket.id);
      if (occupiedPacket) {
        if (occupiedPacket.monsterId !== params.monsterId) {
          throw new MonsterPowerIdentityError(
            "PACKET_ID_OWNED_BY_ANOTHER_MONSTER",
            "A submitted packet identity is already in use.",
          );
        }
        if (occupiedPacket.powerId !== existingPower.id) {
          throw new MonsterPowerIdentityError(
            "PACKET_ID_OWNED_BY_ANOTHER_POWER",
            "A submitted packet identity belongs to a different power.",
          );
        }
      }
      if (existingPacketIds.has(submittedPacket.id)) {
        retainedPacketIds.add(submittedPacket.id);
        updatePackets.push({ submittedPacketIndex, packetId: submittedPacket.id });
        return;
      }
      if (occupiedPacket) {
        throw new MonsterPowerIdentityError(
          "PACKET_ID_OWNERSHIP_UNRESOLVED",
          "A submitted packet identity is not part of its parent power.",
        );
      }
      createPackets.push({
        submittedPacketIndex,
        suppliedId: submittedPacket.id,
      });
    });

    updatePowers.push({
      submittedPowerIndex,
      powerId: existingPower.id,
      createPackets,
      updatePackets,
      deletePacketIds: existingPower.packets
        .map((packet) => packet.id)
        .filter((packetId) => !retainedPacketIds.has(packetId)),
    });
  });

  return {
    createPowers,
    updatePowers,
    deletePowerIds: params.existingPowers
      .map((power) => power.id)
      .filter((powerId) => !retainedPowerIds.has(powerId)),
  };
}

const SEMANTIC_ATTRIBUTES = new Set([
  "ATTACK",
  "GUARD",
  "FORTITUDE",
  "INTELLECT",
  "SYNERGY",
  "BRAVERY",
]);

function packetIntention(packet: EffectPacket): string {
  return String(packet.intention ?? packet.type ?? "").toUpperCase();
}

function packetDetails(packet: EffectPacket): Record<string, unknown> {
  return packet.detailsJson && typeof packet.detailsJson === "object"
    ? packet.detailsJson
    : {};
}

function isSemanticModifierPacket(packet: EffectPacket): boolean {
  const intention = packetIntention(packet);
  return (intention === "AUGMENT" || intention === "DEBUFF") && packet.modifier != null;
}

export function getSummoningSemanticPreviewDiagnostics(power: Power): string[] {
  const semanticPackets = power.effectPackets.filter(isSemanticModifierPacket);
  if (semanticPackets.length === 0) return [];
  const diagnostics: string[] = [];
  if (!readSummoningOpaqueId(power.id)) {
    diagnostics.push("SEMANTIC_POWER_MISSING_STABLE_ID: This semantic power needs a stable identity before preview.");
  }
  const packetIds = new Set<string>();
  for (const [packetIndex, packet] of power.effectPackets.entries()) {
    const packetId = readSummoningOpaqueId(packet.id);
    if (packetId && packetIds.has(packetId)) {
      diagnostics.push(`SEMANTIC_PACKET_${packetIndex + 1}_DUPLICATE_ID: Packet identities must be unique.`);
    }
    if (packetId) packetIds.add(packetId);
    if (!isSemanticModifierPacket(packet)) continue;
    if (!packetId) {
      diagnostics.push(`SEMANTIC_PACKET_${packetIndex + 1}_MISSING_STABLE_ID: This packet needs a stable identity before preview.`);
    }
    if (
      typeof packet.modifier !== "number" ||
      !Number.isInteger(packet.modifier) ||
      packet.modifier < 1 ||
      packet.modifier > 5
    ) {
      diagnostics.push(`SEMANTIC_PACKET_${packetIndex + 1}_MODIFIER_INVALID: Modifier must be an integer from 1 through 5.`);
    }
    const duration = packet.effectDurationType ?? "INSTANT";
    if (duration === "INSTANT") {
      diagnostics.push(`SEMANTIC_PACKET_${packetIndex + 1}_DURATION_INSTANT_UNSUPPORTED: Semantic Augment/Debuff needs a persistent duration.`);
    } else if (
      duration !== "PASSIVE" &&
      duration !== "UNTIL_TARGET_NEXT_TURN" &&
      !(duration === "TURNS" && Number.isInteger(packet.effectDurationTurns) && (packet.effectDurationTurns ?? 0) >= 1 && (packet.effectDurationTurns ?? 0) <= 4)
    ) {
      diagnostics.push(`SEMANTIC_PACKET_${packetIndex + 1}_DURATION_UNSUPPORTED: Select a supported semantic duration.`);
    }
    const details = packetDetails(packet);
    const attribute = String(
      packet.targetedAttribute ?? details.statTarget ?? details.statChoice ?? "",
    ).toUpperCase();
    if (!SEMANTIC_ATTRIBUTES.has(attribute)) {
      diagnostics.push(`SEMANTIC_PACKET_${packetIndex + 1}_TARGETED_ATTRIBUTE_UNRESOLVED: Select a supported core attribute.`);
    }
    const range = String(
      power.rangeCategories?.[0] ?? packetDetails(power.effectPackets[0] ?? packet).rangeCategory ?? "",
    ).toUpperCase();
    if (range === "AOE") {
      const expectedTargetCount = details.expectedTargetCount;
      if (
        typeof expectedTargetCount !== "number" ||
        !Number.isFinite(expectedTargetCount) ||
        expectedTargetCount <= 0
      ) {
        diagnostics.push(`SEMANTIC_PACKET_${packetIndex + 1}_EXPECTED_TARGET_COUNT_UNRESOLVED: AoE semantic pricing requires an explicit positive expected target count.`);
      }
    }
    const dependencyMode = packetIndex === 0
      ? "INDEPENDENT"
      : packet.secondaryDependencyMode ?? "LINKED_TO_PRIMARY";
    if (dependencyMode === "LINKED_TO_PRIMARY") {
      const primary = power.effectPackets[0];
      if (!primary || primary === packet || !readSummoningOpaqueId(primary.id)) {
        diagnostics.push(`SEMANTIC_PACKET_${packetIndex + 1}_LINKED_DEPENDENCY_MISSING: Linked semantic packets require an identified primary packet.`);
      }
    } else if (dependencyMode !== "INDEPENDENT") {
      diagnostics.push(`SEMANTIC_PACKET_${packetIndex + 1}_DEPENDENCY_UNSUPPORTED: This dependency mode cannot use semantic pricing.`);
    }
    if (packetIntention(packet) === "DEBUFF" && dependencyMode === "INDEPENDENT") {
      if (
        power.primaryDefenceGate?.sourcePacketIndex !== packetIndex ||
        power.primaryDefenceGate.gateResult !== "RESIST" ||
        !power.primaryDefenceGate.resistAttribute
      ) {
        diagnostics.push(`SEMANTIC_PACKET_${packetIndex + 1}_DEBUFF_RESIST_GATE_UNRESOLVED: Independent semantic Debuff requires a matching Resist gate.`);
      }
    }
  }

  const hasLegacyModifierPackets = power.effectPackets.some((packet) => {
    const intention = packetIntention(packet);
    return (intention === "AUGMENT" || intention === "DEBUFF") && packet.modifier == null;
  });
  const hasNonModifierPackets = power.effectPackets.some((packet) => {
    const intention = packetIntention(packet);
    return intention !== "AUGMENT" && intention !== "DEBUFF";
  });
  if (
    (hasLegacyModifierPackets || hasNonModifierPackets) &&
    semanticPackets.some((packet) => packet.localTargetingOverride != null)
  ) {
    diagnostics.push("SEMANTIC_MIXED_TARGETING_ALLOCATION_UNRESOLVED: Mixed semantic and legacy/non-modifier packets cannot use packet-local targeting.");
  }
  if (
    (hasLegacyModifierPackets || hasNonModifierPackets) &&
    power.rangeCategories?.includes("AOE") &&
    (power.aoeCount ?? 1) > 1
  ) {
    diagnostics.push("SEMANTIC_MIXED_AOE_ALLOCATION_UNRESOLVED: Mixed semantic breadth cannot allocate overlapping AoE areas safely.");
  }
  if (
    hasNonModifierPackets &&
    power.effectPackets.some((packet) => packetIntention(packet) === "ATTACK") &&
    (power.rangeCategories?.includes("AOE") ||
      (power.rangeCategories?.includes("RANGED") && (power.rangedDistanceFeet ?? 30) > 30))
  ) {
    diagnostics.push("SEMANTIC_MIXED_ACCESS_ALLOCATION_UNRESOLVED: Mixed Attack and semantic modifier packets cannot allocate this shared access safely.");
  }
  return [...new Set(diagnostics)];
}

export function getSummoningCollectionIdentityDiagnostics(
  powers: readonly Power[],
): Map<number, string[]> {
  const diagnostics = new Map<number, string[]>();
  const powerOwner = new Map<string, number>();
  const packetOwner = new Map<string, number>();
  powers.forEach((power, powerIndex) => {
    const powerId = readSummoningOpaqueId(power.id);
    if (powerId) {
      const prior = powerOwner.get(powerId);
      if (prior !== undefined) {
        diagnostics.set(prior, [...(diagnostics.get(prior) ?? []), "DUPLICATE_POWER_ID: Power identity is duplicated in this draft."]);
        diagnostics.set(powerIndex, [...(diagnostics.get(powerIndex) ?? []), "DUPLICATE_POWER_ID: Power identity is duplicated in this draft."]);
      } else {
        powerOwner.set(powerId, powerIndex);
      }
    }
    for (const packet of power.effectPackets) {
      const packetId = readSummoningOpaqueId(packet.id);
      if (!packetId) continue;
      const prior = packetOwner.get(packetId);
      if (prior !== undefined) {
        diagnostics.set(prior, [...(diagnostics.get(prior) ?? []), "DUPLICATE_PACKET_ID: Packet identity is duplicated in this draft."]);
        diagnostics.set(powerIndex, [...(diagnostics.get(powerIndex) ?? []), "DUPLICATE_PACKET_ID: Packet identity is duplicated in this draft."]);
      } else {
        packetOwner.set(packetId, powerIndex);
      }
    }
  });
  return diagnostics;
}
