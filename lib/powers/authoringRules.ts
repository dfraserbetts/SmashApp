import type {
  DescriptorChassisType,
  EffectDurationType,
  EffectPacket,
  EffectTimingType,
  HostileEntryPattern,
  Power,
  PowerIntention,
  ReserveReleaseBehaviour,
  RangeCategory,
  TriggerConditionKey,
} from "@/lib/summoning/types";
import { CORE_ATTRIBUTE_ORDER, TRIGGER_CONDITION_KEYS } from "@/lib/summoning/types";

export type PowerRangeAuthoringCategory = "SELF" | RangeCategory;

export const CHARACTER_BUILDER_V1_POWER_INTENTIONS: PowerIntention[] = [
  "ATTACK",
  "DEFENCE",
  "HEALING",
  "CLEANSE",
  "CONTROL",
  "MOVEMENT",
  "AUGMENT",
  "DEBUFF",
];

export const POWER_AUTHORING_MAX_PACKET_DURATION_TURNS = 4;
export const POWER_RANGE_TARGET_OPTIONS = [1, 2, 3, 4, 5] as const;
export const POWER_RANGE_RANGED_DISTANCE_OPTIONS = [30, 60, 120, 200] as const;
export const POWER_RANGE_AOE_CENTER_RANGE_OPTIONS = [0, 30, 60, 120, 200] as const;
export const POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS = [10, 20, 30] as const;
export const POWER_RANGE_AOE_CONE_LENGTH_OPTIONS = [15, 30, 60] as const;
export const POWER_RANGE_AOE_LINE_WIDTH_OPTIONS = [5, 10, 15, 20] as const;
export const POWER_RANGE_AOE_LINE_LENGTH_OPTIONS = [30, 60, 90, 120] as const;
export const POWER_RANGE_AOE_SHAPES = ["SPHERE", "CONE", "LINE"] as const;
export const POWER_RESERVE_RELEASE_BEHAVIOUR_OPTIONS = [
  "ACTION_OR_RESPONSE",
  "ACTION_ONLY",
  "RESPONSE_ONLY",
  "ON_EXPIRY",
] as const satisfies readonly ReserveReleaseBehaviour[];
export const POWER_DEFENCE_MODE_OPTIONS = [
  "Block",
  "Dodge",
  "Resist",
] as const;
export type PowerDefenceMode = (typeof POWER_DEFENCE_MODE_OPTIONS)[number];
export const POWER_DEFENCE_RESISTED_ATTRIBUTE_OPTIONS = CORE_ATTRIBUTE_ORDER;
export type PowerDefenceResistedAttribute = (typeof POWER_DEFENCE_RESISTED_ATTRIBUTE_OPTIONS)[number];

export const THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_ENABLED = false;
export const THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR =
  "THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED: Modifier authoring is not available in Phase 1.";
export const UNEXPECTED_THREE_FIELD_AUGMENT_DEBUFF_READ_DIAGNOSTIC =
  "UNEXPECTED_THREE_FIELD_AUGMENT_DEBUFF_DATA_READ";

const THREE_FIELD_SUPPORTED_ATTRIBUTES = new Set<string>(
  CORE_ATTRIBUTE_ORDER.map((attribute) => attribute.toUpperCase()),
);

function packetsFromUnknownPowers(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const power = asRecord(entry);
    const packets = Array.isArray(power.effectPackets)
      ? power.effectPackets
      : Array.isArray(power.intentions)
        ? power.intentions
        : [];
    return packets.map(asRecord);
  });
}

export function hasAuthoredThreeFieldAugmentDebuffModifier(value: unknown): boolean {
  return packetsFromUnknownPowers(value).some(
    (packet) => packet.modifier !== null && packet.modifier !== undefined,
  );
}

export function getThreeFieldAugmentDebuffPublicWriteError(value: unknown): string | null {
  if (THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_ENABLED) return null;
  return hasAuthoredThreeFieldAugmentDebuffModifier(value)
    ? THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR
    : null;
}

export function getCharacterBuilderThreeFieldAugmentDebuffPublicWriteError(
  builderData: unknown,
): string | null {
  const raw = asRecord(builderData);
  const powers = Array.isArray(raw.powers) ? [...raw.powers] : [];
  if (raw.signatureMove && typeof raw.signatureMove === "object") {
    powers.push(raw.signatureMove);
  }
  return getThreeFieldAugmentDebuffPublicWriteError(powers);
}

export function getThreeFieldAugmentDebuffReadDiagnostics(value: unknown): string[] {
  return hasAuthoredThreeFieldAugmentDebuffModifier(value)
    ? [UNEXPECTED_THREE_FIELD_AUGMENT_DEBUFF_READ_DIAGNOSTIC]
    : [];
}

function normalizeThreeFieldAttribute(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "DEFENCE" || normalized === "DEFENSE") return "GUARD";
  if (normalized === "SUPPORT") return "SYNERGY";
  return THREE_FIELD_SUPPORTED_ATTRIBUTES.has(normalized) ? normalized : null;
}

export function validateThreeFieldAugmentDebuffPacket(value: unknown): string | null {
  const packet = asRecord(value);
  const details = asRecord(packet.detailsJson);
  if (Object.prototype.hasOwnProperty.call(details, "modifier")) {
    return "detailsJson.modifier is not allowed; EffectPacket.modifier is the only Modifier authority.";
  }
  if (packet.modifier === null || packet.modifier === undefined) return null;
  if (typeof packet.modifier !== "number" || !Number.isInteger(packet.modifier)) {
    return "EffectPacket.modifier must be an integer from 1 through 5.";
  }
  if (packet.modifier < 1 || packet.modifier > 5) {
    return "EffectPacket.modifier must be an integer from 1 through 5.";
  }
  const intention = String(packet.intention ?? packet.type ?? "").toUpperCase();
  if (intention !== "AUGMENT" && intention !== "DEBUFF") {
    return "EffectPacket.modifier is valid only for AUGMENT or DEBUFF packets.";
  }
  const targetedAttribute = normalizeThreeFieldAttribute(
    packet.targetedAttribute ?? details.statTarget ?? details.statChoice,
  );
  if (!targetedAttribute) {
    return "Three-field AUGMENT and DEBUFF packets require one supported core targetedAttribute.";
  }
  return null;
}

export function validateThreeFieldAugmentDebuffPowers(value: unknown): string | null {
  for (const packet of packetsFromUnknownPowers(value)) {
    const error = validateThreeFieldAugmentDebuffPacket(packet);
    if (error) return error;
  }
  return null;
}

const COMMITMENT_MODIFIERS = ["STANDARD", "CHANNEL", "CHARGE"] as const;
const COUNTER_MODES = ["NO", "YES"] as const;
const POWER_LIFESPAN_OPTIONS = ["NONE", "TURNS", "PASSIVE"] as const;
export const POWER_TRIGGER_AREA_PRESENCE_KEYS = new Set<TriggerConditionKey>([
  "AREA_ENTERS",
  "AREA_LEAVES",
  "AREA_STARTS_TURN",
  "AREA_ENDS_TURN",
]);
export const POWER_TRIGGER_AREA_TURN_KEYS = new Set<TriggerConditionKey>([
  "AREA_STARTS_TURN",
  "AREA_ENDS_TURN",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getFirstEffectPacket(
  power: Pick<Power, "effectPackets">,
): EffectPacket | undefined {
  return power.effectPackets[0];
}

function isPowerPacketHostile(effectPacket: EffectPacket | undefined) {
  if (!effectPacket) return false;
  if (effectPacket.hostility === "HOSTILE") return true;
  if (effectPacket.hostility === "NON_HOSTILE") return false;
  const intention = effectPacket.intention ?? effectPacket.type;
  return intention === "ATTACK" ||
    intention === "CONTROL" ||
    intention === "DEBUFF" ||
    intention === "MOVEMENT";
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function isPowerChannelAllowedForChassis(descriptorChassis: DescriptorChassisType) {
  return descriptorChassis === "IMMEDIATE" ||
    descriptorChassis === "FIELD" ||
    descriptorChassis === "ATTACHED";
}

export function normalizePowerCommitmentModifier(value: unknown) {
  return oneOf(value, COMMITMENT_MODIFIERS, "STANDARD");
}

export function getPowerAllowedCommitmentOptions(
  descriptorChassis: DescriptorChassisType,
): Array<NonNullable<Power["commitmentModifier"]>> {
  return isPowerChannelAllowedForChassis(descriptorChassis)
    ? ["STANDARD", "CHANNEL", "CHARGE"]
    : ["STANDARD", "CHARGE"];
}

export function getPowerAllowedCounterOptions(params: {
  descriptorChassis: DescriptorChassisType;
  commitmentModifier?: Power["commitmentModifier"];
  chargeType?: Power["chargeType"];
}): Array<NonNullable<Power["counterMode"]>> {
  if (params.descriptorChassis === "TRIGGER") return ["NO"];
  if (
    params.commitmentModifier === "CHARGE" &&
    (params.chargeType ?? "DELAYED_RELEASE") === "DELAYED_RELEASE"
  ) {
    return ["NO"];
  }
  return [...COUNTER_MODES];
}

export function getPowerAllowedLifespanOptions(
  descriptorChassis: DescriptorChassisType,
  commitmentModifier?: Power["commitmentModifier"],
): Array<NonNullable<Power["lifespanType"]>> {
  if (descriptorChassis !== "IMMEDIATE") return ["TURNS", "PASSIVE"];
  if (commitmentModifier === "CHANNEL") return ["TURNS", "PASSIVE"];
  return [...POWER_LIFESPAN_OPTIONS];
}

export function isPowerSecondaryDiceAuthored(packetIndex: number) {
  return packetIndex === 0;
}

export function getPowerAllowedRangeCategories(params: {
  descriptorChassis: DescriptorChassisType;
  attachedHostAnchorType?: Power["attachedHostAnchorType"] | null;
}): PowerRangeAuthoringCategory[] {
  if (params.descriptorChassis === "FIELD") return ["AOE"];
  if (params.descriptorChassis !== "ATTACHED") return ["SELF", "MELEE", "RANGED", "AOE"];
  if (params.attachedHostAnchorType === "SELF") return ["SELF"];
  if (params.attachedHostAnchorType === "TARGET") return ["MELEE", "RANGED", "AOE"];
  if (params.attachedHostAnchorType === "AREA") return ["AOE"];
  return ["SELF", "MELEE", "RANGED", "AOE"];
}

export function readPowerTriggerCondition(value: unknown): TriggerConditionKey | null {
  return TRIGGER_CONDITION_KEYS.includes(value as TriggerConditionKey)
    ? (value as TriggerConditionKey)
    : null;
}

export function isPowerAreaTriggerCondition(value: unknown) {
  const key = readPowerTriggerCondition(value);
  return key ? POWER_TRIGGER_AREA_PRESENCE_KEYS.has(key) : false;
}

export function isPowerAreaTurnTriggerCondition(value: unknown) {
  const key = readPowerTriggerCondition(value);
  return key ? POWER_TRIGGER_AREA_TURN_KEYS.has(key) : false;
}

export function getPowerAllowedTriggerConditionOptions(params: {
  triggerMethod?: Power["triggerMethod"] | null;
  rangeCategory?: PowerRangeAuthoringCategory | null;
}): TriggerConditionKey[] {
  return TRIGGER_CONDITION_KEYS.filter((key) => {
    if (params.rangeCategory !== "AOE" && POWER_TRIGGER_AREA_PRESENCE_KEYS.has(key)) {
      return false;
    }
    return true;
  });
}

function doesPacketCreateBeyondTurnCarrier(effectPacket: EffectPacket | undefined) {
  const durationType = effectPacket?.effectDurationType ?? "INSTANT";
  return durationType === "TURNS" ||
    durationType === "PASSIVE" ||
    durationType === "UNTIL_TARGET_NEXT_TURN";
}

function restrictSecondaryTimingOptionsByPrimaryDuration(
  allowedOptions: EffectTimingType[],
  primaryEffectPacket: EffectPacket | undefined,
) {
  const primaryDurationType = primaryEffectPacket?.effectDurationType ?? "INSTANT";
  if (primaryDurationType !== "INSTANT" && primaryDurationType !== "UNTIL_TARGET_NEXT_TURN") {
    return allowedOptions;
  }
  const narrowedOptions = allowedOptions.filter((option) =>
    option === "ON_CAST" ||
    option === "ON_ATTACH" ||
    option === "ON_TRIGGER" ||
    option === "ON_EXPIRY" ||
    option === "ON_RELEASE",
  );
  return narrowedOptions.length > 0 ? narrowedOptions : allowedOptions;
}

export function getPowerHostileEntryPattern(
  power: Pick<Power, "primaryDefenceGate" | "descriptorChassisConfig">,
) {
  const config = asRecord(power.descriptorChassisConfig);
  return oneOf(
    power.primaryDefenceGate?.hostileEntryPattern ?? config.hostileEntryPattern,
    ["DIRECT", "ON_ATTACH", "ON_PAYLOAD"] as const,
    "DIRECT",
  ) as HostileEntryPattern;
}

export function readPowerAttachedHostileEntryPattern(
  power: Pick<Power, "primaryDefenceGate" | "descriptorChassisConfig">,
) {
  const config = asRecord(power.descriptorChassisConfig);
  const value = power.primaryDefenceGate?.hostileEntryPattern ?? config.hostileEntryPattern;
  return value === "ON_ATTACH" || value === "ON_PAYLOAD" ? value : null;
}

export function isPowerAttachedHostileEntryRequired(
  power: Pick<Power, "descriptorChassis" | "effectPackets">,
) {
  return (power.descriptorChassis ?? "IMMEDIATE") === "ATTACHED" &&
    isPowerPacketHostile(getFirstEffectPacket(power));
}

export function isPowerAttachedHostileEntryReady(
  power: Pick<Power, "descriptorChassis" | "effectPackets" | "primaryDefenceGate" | "descriptorChassisConfig">,
) {
  return !isPowerAttachedHostileEntryRequired(power) ||
    readPowerAttachedHostileEntryPattern(power) !== null;
}

export function isPowerPacketTimingAuthorable(
  power: Pick<Power, "descriptorChassis" | "effectPackets" | "primaryDefenceGate" | "descriptorChassisConfig">,
  packetIndex: number,
) {
  if (packetIndex !== 0) return true;
  return isPowerAttachedHostileEntryReady(power);
}

export function readPowerReserveReleaseBehaviour(value: unknown): ReserveReleaseBehaviour | null {
  return POWER_RESERVE_RELEASE_BEHAVIOUR_OPTIONS.includes(value as ReserveReleaseBehaviour)
    ? (value as ReserveReleaseBehaviour)
    : null;
}

export function isPowerReserveReleaseBehaviourReady(
  power: Pick<Power, "descriptorChassis" | "descriptorChassisConfig">,
) {
  if ((power.descriptorChassis ?? "IMMEDIATE") !== "RESERVE") return true;
  return readPowerReserveReleaseBehaviour(asRecord(power.descriptorChassisConfig).releaseBehaviour) !== null;
}

export function getPowerPrimaryTimingForDescriptorChassis(
  descriptorChassis: DescriptorChassisType,
  hostileEntryPattern: HostileEntryPattern | null,
): EffectTimingType {
  if (descriptorChassis === "TRIGGER") return "ON_TRIGGER";
  if (descriptorChassis === "RESERVE") return "ON_RELEASE";
  if (descriptorChassis === "ATTACHED") {
    return hostileEntryPattern === "ON_PAYLOAD" ? "ON_TRIGGER" : "ON_ATTACH";
  }
  if (descriptorChassis === "FIELD") return "START_OF_TURN";
  return "ON_CAST";
}

export function getPowerAllowedTimingOptions(
  power: Pick<Power, "descriptorChassis" | "commitmentModifier" | "primaryDefenceGate" | "descriptorChassisConfig" | "effectPackets">,
  packetIndex: number,
): EffectTimingType[] {
  const descriptorChassis = power.descriptorChassis ?? "IMMEDIATE";
  const commitmentModifier = normalizePowerCommitmentModifier(power.commitmentModifier);
  const hostileEntryPattern = getPowerHostileEntryPattern(power);
  const primaryEffectPacket = power.effectPackets[0];
  const channelRecurringOptions =
    commitmentModifier === "CHANNEL" && isPowerChannelAllowedForChassis(descriptorChassis)
      ? (["START_OF_TURN_WHILST_CHANNELLED", "END_OF_TURN_WHILST_CHANNELLED"] as EffectTimingType[])
      : [];
  const immediateRecurringOptions = [
    "ON_CAST",
    "ON_TRIGGER",
    "START_OF_TURN",
    "END_OF_TURN",
    ...channelRecurringOptions,
    "ON_EXPIRY",
  ] as EffectTimingType[];

  if (packetIndex > 0) {
    let secondaryTimingOptions: EffectTimingType[];
    if (descriptorChassis === "IMMEDIATE") {
      const primaryTimingType = primaryEffectPacket?.effectTimingType ?? "ON_CAST";
      if (primaryTimingType === "ON_CAST" && !doesPacketCreateBeyondTurnCarrier(primaryEffectPacket)) {
        return ["ON_CAST"];
      }
      secondaryTimingOptions = [...immediateRecurringOptions];
    } else if (descriptorChassis === "RESERVE") {
      secondaryTimingOptions = ["ON_RELEASE"];
    } else if (descriptorChassis === "ATTACHED") {
      const primaryTimingType = primaryEffectPacket?.effectTimingType;
      const primaryResolvesOnAttach =
        hostileEntryPattern === "ON_ATTACH" || primaryTimingType === "ON_ATTACH";
      secondaryTimingOptions = [
        ...(primaryResolvesOnAttach ? (["ON_ATTACH"] as EffectTimingType[]) : []),
        "ON_TRIGGER",
        "START_OF_TURN",
        "END_OF_TURN",
        ...channelRecurringOptions,
        "ON_EXPIRY",
      ];
    } else {
      secondaryTimingOptions = [
        "ON_TRIGGER",
        "START_OF_TURN",
        "END_OF_TURN",
        ...channelRecurringOptions,
        "ON_EXPIRY",
      ];
    }
    return restrictSecondaryTimingOptionsByPrimaryDuration(secondaryTimingOptions, primaryEffectPacket);
  }

  if (descriptorChassis === "IMMEDIATE" && commitmentModifier === "STANDARD") return ["ON_CAST"];
  if (descriptorChassis === "FIELD") {
    return ["ON_TRIGGER", "START_OF_TURN", "END_OF_TURN", ...channelRecurringOptions, "ON_EXPIRY"];
  }
  if (descriptorChassis === "ATTACHED") {
    if (hostileEntryPattern === "ON_ATTACH") return ["ON_ATTACH"];
    if (hostileEntryPattern === "ON_PAYLOAD") {
      return ["ON_TRIGGER", "START_OF_TURN", "END_OF_TURN", ...channelRecurringOptions, "ON_EXPIRY"];
    }
    return ["ON_ATTACH", "ON_TRIGGER", "START_OF_TURN", "END_OF_TURN", ...channelRecurringOptions, "ON_EXPIRY"];
  }
  if (descriptorChassis === "TRIGGER") return ["ON_TRIGGER"];
  if (descriptorChassis === "RESERVE") return ["ON_RELEASE"];
  return [...immediateRecurringOptions];
}

export function getPowerAllowedDurationOptions(effectTimingType: EffectTimingType | undefined) {
  const timing = effectTimingType ?? "ON_CAST";
  if (timing === "START_OF_TURN" || timing === "END_OF_TURN") {
    return ["INSTANT", "TURNS", "PASSIVE"] as EffectDurationType[];
  }
  return ["INSTANT", "UNTIL_TARGET_NEXT_TURN", "TURNS", "PASSIVE"] as EffectDurationType[];
}

export function isCharacterBuilderV1PowerIntention(intention: PowerIntention) {
  return CHARACTER_BUILDER_V1_POWER_INTENTIONS.includes(intention);
}
