import type {
  DescriptorChassisType,
  EffectDurationType,
  EffectPacket,
  EffectTimingType,
  HostileEntryPattern,
  Power,
  PowerIntention,
  RangeCategory,
  TriggerConditionKey,
} from "@/lib/summoning/types";
import { TRIGGER_CONDITION_KEYS } from "@/lib/summoning/types";

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

const COMMITMENT_MODIFIERS = ["STANDARD", "CHANNEL", "CHARGE"] as const;
const COUNTER_MODES = ["NO", "YES"] as const;
const POWER_LIFESPAN_OPTIONS = ["NONE", "TURNS", "PASSIVE"] as const;
export const POWER_TRIGGER_AREA_PRESENCE_KEYS = new Set<TriggerConditionKey>([
  "AREA_ENTERS",
  "AREA_LEAVES",
  "AREA_STARTS_TURN",
  "AREA_ENDS_TURN",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

export function getPowerAllowedTriggerConditionOptions(params: {
  triggerMethod?: Power["triggerMethod"] | null;
  rangeCategory?: PowerRangeAuthoringCategory | null;
}): TriggerConditionKey[] {
  if (params.rangeCategory !== "AOE") {
    return TRIGGER_CONDITION_KEYS.filter((key) => !POWER_TRIGGER_AREA_PRESENCE_KEYS.has(key));
  }
  return [...TRIGGER_CONDITION_KEYS];
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
