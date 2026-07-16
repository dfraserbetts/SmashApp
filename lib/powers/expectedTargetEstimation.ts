import type { EffectPacket, Power } from "@/lib/summoning/types";

export const EXPECTED_TARGET_STANDARD_TEAM_SIZE = 4;
export const EXPECTED_TARGET_HOSTILE_CAP = 6;

export const NATURAL_AOE_SPHERE_CAPACITY_BY_RADIUS: Readonly<Record<number, number>> = {
  10: 3,
  20: 6,
  30: 9,
};

export const NATURAL_AOE_CONE_CAPACITY_BY_LENGTH: Readonly<Record<number, number>> = {
  15: 3,
  30: 8,
  60: 14,
};

export const NATURAL_AOE_LINE_CAPACITY_BY_WIDTH_AND_LENGTH: Readonly<
  Record<number, Readonly<Record<number, number>>>
> = {
  5: { 30: 3, 60: 6, 90: 9, 120: 12 },
  10: { 30: 4, 60: 8, 90: 12, 120: 16 },
  15: { 30: 5, 60: 10, 90: 15, 120: 20 },
  20: { 30: 6, 60: 12, 90: 18, 120: 24 },
};

export type ExpectedTargetCalculationMode =
  | "NON_AOE_AUTHORED_TARGETS"
  | "BENEFICIAL_AOE_60_PERCENT"
  | "HOSTILE_AOE_40_PERCENT_CAPPED_6"
  | "SELF_ONLY_CAPACITY_1"
  | "UNSUPPORTED_GEOMETRY";

export type ExpectedTargetTeamSizeSource =
  | "ACTUAL_TEAM_CONTEXT"
  | "FALLBACK_STANDARD_TEAM_SIZE_4"
  | "SELF_ONLY_CAPACITY_1"
  | "HOSTILE_AREA_OCCUPANCY";

export type ExpectedTargetEstimation = {
  expectedTargets: number | null;
  effectiveAreaCapacity: number | null;
  calculationMode: ExpectedTargetCalculationMode;
  teamSizeSource: ExpectedTargetTeamSizeSource;
  eligibleTeamSize: number | null;
  areaCount: number;
  warnings: string[];
  unsupportedReason: string | null;
};

export type ExpectedTargetTeamContext = {
  totalTeamSize?: number | null;
  source?: "ACTUAL_TEAM_CONTEXT" | "FALLBACK_STANDARD_TEAM_SIZE_4";
};

export type ExpectedTargetGeometryInput = {
  rangeCategory?: unknown;
  shape?: unknown;
  sphereRadiusFeet?: unknown;
  coneLengthFeet?: unknown;
  lineWidthFeet?: unknown;
  lineLengthFeet?: unknown;
  areaCount?: unknown;
};

export type ExpectedTargetEstimationInput = ExpectedTargetGeometryInput & {
  intention?: unknown;
  hostility?: unknown;
  recipient?: unknown;
  authoredTargetCount?: unknown;
  teamContext?: ExpectedTargetTeamContext | null;
};

function positiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizedShape(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizedRangeCategory(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

export function getNaturalAoeOneAreaCapacity(input: ExpectedTargetGeometryInput): number | null {
  const shape = normalizedShape(input.shape);
  if (shape === "SPHERE") {
    return NATURAL_AOE_SPHERE_CAPACITY_BY_RADIUS[positiveInteger(input.sphereRadiusFeet, 0)] ?? null;
  }
  if (shape === "CONE") {
    return NATURAL_AOE_CONE_CAPACITY_BY_LENGTH[positiveInteger(input.coneLengthFeet, 0)] ?? null;
  }
  if (shape === "LINE") {
    const width = positiveInteger(input.lineWidthFeet, 0);
    const length = positiveInteger(input.lineLengthFeet, 0);
    return NATURAL_AOE_LINE_CAPACITY_BY_WIDTH_AND_LENGTH[width]?.[length] ?? null;
  }
  return null;
}

function unsupportedGeometryReason(input: ExpectedTargetGeometryInput): string {
  const shape = normalizedShape(input.shape);
  if (shape === "SPHERE") return `Unsupported sphere radius: ${String(input.sphereRadiusFeet ?? "missing")}.`;
  if (shape === "CONE") return `Unsupported cone length: ${String(input.coneLengthFeet ?? "missing")}.`;
  if (shape === "LINE") {
    return `Unsupported line geometry: ${String(input.lineWidthFeet ?? "missing")} ft x ${String(input.lineLengthFeet ?? "missing")} ft.`;
  }
  return `Unsupported AoE shape: ${shape || "missing"}.`;
}

export function calculateExpectedTargetsForEffectiveAreaCapacity(input: {
  effectiveAreaCapacity: number;
  intention?: unknown;
  hostility?: unknown;
  recipient?: unknown;
  areaCount?: number;
  teamContext?: ExpectedTargetTeamContext | null;
}): ExpectedTargetEstimation {
  const effectiveAreaCapacity = positiveInteger(input.effectiveAreaCapacity, 1);
  const areaCount = positiveInteger(input.areaCount, 1);
  const intention = String(input.intention ?? "").trim().toUpperCase();
  const hostility = String(input.hostility ?? "").trim().toUpperCase();
  const recipient = String(input.recipient ?? "PRIMARY_TARGET").trim().toUpperCase();
  const hostile = hostility === "HOSTILE" || intention === "DEBUFF";
  if (hostile) {
    return {
      expectedTargets: Math.min(
        EXPECTED_TARGET_HOSTILE_CAP,
        Math.max(1, Math.ceil(effectiveAreaCapacity * 0.4)),
      ),
      effectiveAreaCapacity,
      calculationMode: "HOSTILE_AOE_40_PERCENT_CAPPED_6",
      teamSizeSource: "HOSTILE_AREA_OCCUPANCY",
      eligibleTeamSize: null,
      areaCount,
      warnings: [],
      unsupportedReason: null,
    };
  }

  if (recipient === "SELF") {
    return {
      expectedTargets: 1,
      effectiveAreaCapacity,
      calculationMode: "SELF_ONLY_CAPACITY_1",
      teamSizeSource: "SELF_ONLY_CAPACITY_1",
      eligibleTeamSize: 1,
      areaCount,
      warnings: [],
      unsupportedReason: null,
    };
  }

  const suppliedTeamSize = Number(input.teamContext?.totalTeamSize);
  const hasActualTeamSize =
    input.teamContext?.source === "ACTUAL_TEAM_CONTEXT" &&
    Number.isInteger(suppliedTeamSize) &&
    suppliedTeamSize >= 1;
  const totalTeamSize = hasActualTeamSize ? suppliedTeamSize : EXPECTED_TARGET_STANDARD_TEAM_SIZE;
  const teamSizeSource: ExpectedTargetTeamSizeSource = hasActualTeamSize
    ? "ACTUAL_TEAM_CONTEXT"
    : "FALLBACK_STANDARD_TEAM_SIZE_4";
  const eligibleTeamSize = Math.max(1, recipient === "ALLIES" ? totalTeamSize - 1 : totalTeamSize);
  const eligibleCapacity = Math.min(effectiveAreaCapacity, eligibleTeamSize);
  return {
    expectedTargets: Math.max(1, Math.ceil(eligibleCapacity * 0.6)),
    effectiveAreaCapacity,
    calculationMode: "BENEFICIAL_AOE_60_PERCENT",
    teamSizeSource,
    eligibleTeamSize,
    areaCount,
    warnings: hasActualTeamSize ? [] : ["Eligible team size unavailable; using standard team size 4."],
    unsupportedReason: null,
  };
}

export function estimateExpectedTargets(input: ExpectedTargetEstimationInput): ExpectedTargetEstimation {
  const areaCount = positiveInteger(input.areaCount, 1);
  if (normalizedRangeCategory(input.rangeCategory) !== "AOE") {
    const authored = positiveInteger(input.authoredTargetCount, 1);
    return {
      expectedTargets: authored,
      effectiveAreaCapacity: null,
      calculationMode: "NON_AOE_AUTHORED_TARGETS",
      teamSizeSource: input.teamContext?.source ?? "FALLBACK_STANDARD_TEAM_SIZE_4",
      eligibleTeamSize: null,
      areaCount,
      warnings: [],
      unsupportedReason: null,
    };
  }

  const oneAreaCapacity = getNaturalAoeOneAreaCapacity(input);
  if (oneAreaCapacity === null) {
    const unsupportedReason = unsupportedGeometryReason(input);
    return {
      expectedTargets: null,
      effectiveAreaCapacity: null,
      calculationMode: "UNSUPPORTED_GEOMETRY",
      teamSizeSource: input.teamContext?.source ?? "FALLBACK_STANDARD_TEAM_SIZE_4",
      eligibleTeamSize: null,
      areaCount,
      warnings: [unsupportedReason],
      unsupportedReason,
    };
  }

  return calculateExpectedTargetsForEffectiveAreaCapacity({
    effectiveAreaCapacity: oneAreaCapacity * areaCount,
    intention: input.intention,
    hostility: input.hostility,
    recipient: input.recipient,
    areaCount,
    teamContext: input.teamContext,
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function packetRangeCategory(power: Power, packet: EffectPacket): string {
  const details = asRecord(packet.detailsJson);
  const primaryDetails = asRecord(power.effectPackets[0]?.detailsJson);
  return normalizedRangeCategory(
    packet.localTargetingOverride?.aoeShape
      ? "AOE"
      : details.rangeCategory ??
        primaryDetails.rangeCategory ??
        power.rangeCategories?.[0] ??
        (power.aoeShape ? "AOE" : ""),
  );
}

export function estimatePowerPacketExpectedTargets(params: {
  power: Power;
  packet: EffectPacket;
  teamContext?: ExpectedTargetTeamContext | null;
}): ExpectedTargetEstimation {
  const { power, packet } = params;
  const primaryDetails = asRecord(power.effectPackets[0]?.detailsJson);
  const rangeExtra = asRecord(primaryDetails.rangeExtra);
  const local = packet.localTargetingOverride;
  return estimateExpectedTargets({
    rangeCategory: packetRangeCategory(power, packet),
    shape: local?.aoeShape ?? power.aoeShape ?? rangeExtra.shape,
    sphereRadiusFeet: local?.aoeSphereRadiusFeet ?? power.aoeSphereRadiusFeet ?? rangeExtra.sphereRadiusFeet,
    coneLengthFeet: local?.aoeConeLengthFeet ?? power.aoeConeLengthFeet ?? rangeExtra.coneLengthFeet,
    lineWidthFeet: local?.aoeLineWidthFeet ?? power.aoeLineWidthFeet ?? rangeExtra.lineWidthFeet,
    lineLengthFeet: local?.aoeLineLengthFeet ?? power.aoeLineLengthFeet ?? rangeExtra.lineLengthFeet,
    areaCount: local?.aoeCount ?? power.aoeCount ?? rangeExtra.count,
    intention: packet.intention,
    hostility: packet.hostility,
    recipient: packet.applyTo ?? asRecord(packet.detailsJson).applyTo,
    authoredTargetCount: asRecord(packet.detailsJson).expectedTargetCount,
    teamContext: params.teamContext,
  });
}

function isSemanticAugmentDebuff(packet: EffectPacket): boolean {
  return (packet.intention === "AUGMENT" || packet.intention === "DEBUFF") && packet.modifier != null;
}

export function applyAutomaticExpectedTargetsToPower<T extends Power>(
  power: T,
  teamContext?: ExpectedTargetTeamContext | null,
): T {
  const effectPackets = power.effectPackets.map((packet) => {
    if (!isSemanticAugmentDebuff(packet) || packetRangeCategory(power, packet) !== "AOE") return packet;
    const estimation = estimatePowerPacketExpectedTargets({ power, packet, teamContext });
    const detailsJson = { ...asRecord(packet.detailsJson) };
    if (estimation.expectedTargets === null) delete detailsJson.expectedTargetCount;
    else detailsJson.expectedTargetCount = estimation.expectedTargets;
    return { ...packet, detailsJson };
  });
  if (effectPackets.every((packet, index) => packet === power.effectPackets[index])) return power;
  return {
    ...power,
    effectPackets,
    intentions: effectPackets.map((packet, index) => ({
      ...packet,
      sortOrder: packet.sortOrder ?? index,
      packetIndex: packet.packetIndex ?? index,
    })),
  };
}

export function applyAutomaticExpectedTargetsToPowers<T extends Power>(
  powers: readonly T[],
  teamContext?: ExpectedTargetTeamContext | null,
): T[] {
  return powers.map((power) => applyAutomaticExpectedTargetsToPower(power, teamContext));
}
