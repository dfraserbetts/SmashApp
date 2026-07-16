import type {
  DescriptorChassisType,
  EffectDurationType,
  EffectPacket,
  EffectTimingType,
  Power,
  PowerIntention,
} from "@/lib/summoning/types";

export const MODIFIER_AUTHORING_VALUES = [1, 2, 3, 4, 5] as const;
export const SEMANTIC_AUGMENT_DEBUFF_DEFAULT_DURATION: EffectDurationType =
  "UNTIL_TARGET_NEXT_TURN";
export const SEMANTIC_RUNTIME_UNSUPPORTED_CHASSIS =
  "SEMANTIC_RUNTIME_UNSUPPORTED_CHASSIS";
export const SEMANTIC_RUNTIME_UNSUPPORTED_TIMING =
  "SEMANTIC_RUNTIME_UNSUPPORTED_TIMING";

export type ModifierConversionDraft = {
  potency: number | null;
  modifier: number | null;
  effectDurationType: Exclude<EffectDurationType, "INSTANT"> | null;
  effectDurationTurns: number | null;
};

export function isAugmentDebuffIntention(value: unknown): value is "AUGMENT" | "DEBUFF" {
  return value === "AUGMENT" || value === "DEBUFF";
}

export function isLegacyAugmentDebuffPacket(packet: Pick<EffectPacket, "intention" | "modifier">) {
  return isAugmentDebuffIntention(packet.intention) && packet.modifier == null;
}

export function isSemanticAugmentDebuffPacket(packet: Pick<EffectPacket, "intention" | "modifier">) {
  return isAugmentDebuffIntention(packet.intention) && packet.modifier != null;
}

export function powerHasSemanticAugmentDebuffPacket(
  power: Pick<Power, "effectPackets">,
) {
  return power.effectPackets.some(isSemanticAugmentDebuffPacket);
}

export function isSemanticRuntimeSupportedChassis(
  descriptorChassis: DescriptorChassisType | undefined,
) {
  const chassis = descriptorChassis ?? "IMMEDIATE";
  return chassis === "IMMEDIATE" || chassis === "FIELD";
}

export function isSemanticRuntimeSupportedTimingOption(
  descriptorChassis: DescriptorChassisType | undefined,
  timing: EffectTimingType | undefined,
) {
  const chassis = descriptorChassis ?? "IMMEDIATE";
  if (chassis === "IMMEDIATE") {
    return timing === "ON_CAST" ||
      timing === "START_OF_TURN" ||
      timing === "START_OF_TURN_WHILST_CHANNELLED";
  }
  return chassis === "FIELD" && timing === "START_OF_TURN";
}

export function getSemanticRuntimeSupportError(params: {
  descriptorChassis: DescriptorChassisType | undefined;
  packet: EffectPacket;
  packetIndex: number;
  primaryPacket?: EffectPacket;
}): string | null {
  if (!isSemanticAugmentDebuffPacket(params.packet)) return null;
  const chassis = params.descriptorChassis ?? "IMMEDIATE";
  const timing = params.packet.effectTimingType ?? "ON_CAST";
  const label = `Packet ${params.packetIndex + 1}`;
  if (!isSemanticRuntimeSupportedChassis(chassis)) {
    return `${SEMANTIC_RUNTIME_UNSUPPORTED_CHASSIS}: ${label} semantic Modifier authoring is not runtime-supported for ${chassis} powers.`;
  }
  const recurringTimingSupported =
    params.packet.effectDurationType === "TURNS" &&
    (timing === "START_OF_TURN" ||
      timing === "START_OF_TURN_WHILST_CHANNELLED");
  const fieldTimingSupported = chassis === "FIELD" && timing === "START_OF_TURN";
  if (timing !== "ON_CAST" && !recurringTimingSupported && !fieldTimingSupported) {
    return `${SEMANTIC_RUNTIME_UNSUPPORTED_TIMING}: ${label} semantic Modifier timing ${timing} is not runtime-supported for ${chassis} powers.`;
  }
  const dependencyMode = params.packet.secondaryDependencyMode ?? "LINKED_TO_PRIMARY";
  if (params.packetIndex > 0 && dependencyMode !== "INDEPENDENT" && params.primaryPacket) {
    const primaryTiming = params.primaryPacket.effectTimingType ?? "ON_CAST";
    const primarySupportError = getSemanticRuntimeSupportError({
      descriptorChassis: chassis,
      packet: {
        ...params.primaryPacket,
        intention: "AUGMENT",
        type: "AUGMENT",
        modifier: 1,
      },
      packetIndex: 0,
    });
    if (primarySupportError) {
      return `${SEMANTIC_RUNTIME_UNSUPPORTED_TIMING}: ${label} linked semantic packet depends on runtime-unsupported Packet 1 timing ${primaryTiming}.`;
    }
  }
  return null;
}

export function isValidUnsignedModifier(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function formatModifierForIntention(
  intention: "AUGMENT" | "DEBUFF",
  modifier: number,
) {
  return `${intention === "AUGMENT" ? "+" : "−"}${modifier}`;
}

export function readExpectedTargetCount(packet: Pick<EffectPacket, "detailsJson">): number | null {
  const value = packet.detailsJson?.expectedTargetCount;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6
    ? value
    : null;
}

export function withExpectedTargetCount(packet: EffectPacket, value: number | null): EffectPacket {
  const detailsJson = { ...(packet.detailsJson ?? {}) };
  if (value == null) delete detailsJson.expectedTargetCount;
  else detailsJson.expectedTargetCount = value;
  return { ...packet, detailsJson };
}

export function isSupportedSemanticDuration(packet: Pick<EffectPacket, "effectDurationType" | "effectDurationTurns">) {
  if (packet.effectDurationType === "UNTIL_TARGET_NEXT_TURN" || packet.effectDurationType === "PASSIVE") {
    return true;
  }
  return packet.effectDurationType === "TURNS" &&
    Number.isInteger(packet.effectDurationTurns) &&
    Number(packet.effectDurationTurns) >= 1 &&
    Number(packet.effectDurationTurns) <= 4;
}

export function createSemanticAugmentDebuffPacket(packet: EffectPacket): EffectPacket {
  if (!isAugmentDebuffIntention(packet.intention)) return packet;
  return {
    ...packet,
    potency: 1,
    modifier: 1,
    effectDurationType: SEMANTIC_AUGMENT_DEBUFF_DEFAULT_DURATION,
    effectDurationTurns: null,
  };
}

export function switchModifierAuthoringIntention(
  packet: EffectPacket,
  nextIntention: PowerIntention,
  nextDetailsJson: Record<string, unknown>,
): EffectPacket {
  const wasAugmentDebuff = isAugmentDebuffIntention(packet.intention);
  const willBeAugmentDebuff = isAugmentDebuffIntention(nextIntention);
  const switched = {
    ...packet,
    intention: nextIntention,
    type: nextIntention,
    hostility: ["ATTACK", "CONTROL", "DEBUFF", "MOVEMENT"].includes(nextIntention)
      ? "HOSTILE" as const
      : "NON_HOSTILE" as const,
    detailsJson: nextDetailsJson,
  };
  if (wasAugmentDebuff && willBeAugmentDebuff) return switched;
  if (!wasAugmentDebuff && willBeAugmentDebuff) {
    return createSemanticAugmentDebuffPacket(switched);
  }
  if (wasAugmentDebuff && !willBeAugmentDebuff) {
    return { ...switched, modifier: null, targetedAttribute: null };
  }
  return switched;
}

export function createModifierConversionDraft(packet: EffectPacket): ModifierConversionDraft {
  const supportedDuration = isSupportedSemanticDuration(packet);
  return {
    potency: null,
    modifier: null,
    effectDurationType: supportedDuration
      ? packet.effectDurationType as Exclude<EffectDurationType, "INSTANT">
      : null,
    effectDurationTurns: supportedDuration && packet.effectDurationType === "TURNS"
      ? packet.effectDurationTurns
      : null,
  };
}

export function getModifierAuthoringPacketErrors(params: {
  packet: EffectPacket;
  packetIndex: number;
  requiresExpectedTargets: boolean;
}): string[] {
  const { packet, packetIndex } = params;
  if (!isSemanticAugmentDebuffPacket(packet)) return [];
  const label = `Packet ${packetIndex + 1}`;
  const errors: string[] = [];
  if (!isValidUnsignedModifier(packet.modifier)) {
    errors.push(`${label} Modifier must be a whole number from 1 through 5.`);
  }
  if (!Number.isInteger(packet.potency) || Number(packet.potency) < 1) {
    errors.push(`${label} Potency must be a positive whole number.`);
  }
  if (!isSupportedSemanticDuration(packet)) {
    errors.push(`${label} requires a supported semantic duration.`);
  }
  return errors;
}

export function confirmModifierConversion(params: {
  packet: EffectPacket;
  draft: ModifierConversionDraft;
  packetIndex: number;
  requiresExpectedTargets: boolean;
}): { packet: EffectPacket | null; errors: string[] } {
  const { packet, draft, packetIndex, requiresExpectedTargets } = params;
  if (!isLegacyAugmentDebuffPacket(packet)) {
    return { packet: null, errors: [`Packet ${packetIndex + 1} is not a legacy Augment or Debuff packet.`] };
  }
  let converted: EffectPacket = {
    ...packet,
    potency: draft.potency ?? undefined,
    modifier: draft.modifier,
    effectDurationType: draft.effectDurationType ?? "INSTANT",
    effectDurationTurns: draft.effectDurationType === "TURNS" ? draft.effectDurationTurns : null,
  };
  if (requiresExpectedTargets) converted = withExpectedTargetCount(converted, null);
  const errors = getModifierAuthoringPacketErrors({
    packet: converted,
    packetIndex,
    requiresExpectedTargets,
  });
  return errors.length > 0 ? { packet: null, errors } : { packet: converted, errors: [] };
}
