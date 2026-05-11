import type {
  CoreAttribute,
  DescriptorChassisType,
  EffectDurationType,
  EffectPacket,
  EffectPacketApplyTo,
  EffectTimingType,
  HostileEntryPattern,
  Power,
  PowerIntention,
  PrimaryDefenceGate,
  RangeCategory,
  ResistTheme,
  TriggerConditionKey,
} from "@/lib/summoning/types";
import {
  RESIST_THEME_VALUES,
  TRIGGER_CONDITION_KEYS,
  MAX_POWER_PACKET_DAMAGE_TYPES as MAX_DAMAGE_TYPES,
} from "@/lib/summoning/types";
import type { PowerTuningSnapshot } from "@/lib/config/powerTuningShared";
import {
  calculateCharacterPlayerPowerSpend,
  DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  normalizeCharacterPowerSpendScalar,
} from "@/lib/config/characterBuilderTuningShared";
import { renderPowerDescriptorLines } from "@/lib/summoning/render";
import { resolvePowerCosts } from "@/lib/summoning/powerCostResolver";

export type CharacterPower = Power & {
  sparkDiscountPercent?: 0;
  restrictionDiscountPercent?: 0;
};

export type CharacterPowerSummary = {
  power: CharacterPower;
  descriptorLines: string[];
  basePowerValue: number | null;
  spend: number | null;
  playerPowerSpendScalar: number;
  derivedCooldownTurns: number | null;
  costValid: boolean;
  invalidCostReason: string | null;
  errors: string[];
  warnings: string[];
};

export type CharacterPowerBudget = {
  powerPool: number;
  playerPowerSpendScalar: number;
  totalSpent: number;
  remaining: number;
  overspent: boolean;
  powers: CharacterPowerSummary[];
};

const DESCRIPTOR_CHASSIS: DescriptorChassisType[] = [
  "IMMEDIATE",
  "FIELD",
  "ATTACHED",
  "TRIGGER",
  "RESERVE",
];
const POWER_INTENTIONS: PowerIntention[] = [
  "ATTACK",
  "DEFENCE",
  "HEALING",
  "CLEANSE",
  "CONTROL",
  "MOVEMENT",
  "SUPPORT",
  "AUGMENT",
  "DEBUFF",
];
const EFFECT_TIMINGS: EffectTimingType[] = [
  "ON_CAST",
  "ON_HIT",
  "ON_TRIGGER",
  "ON_ATTACH",
  "START_OF_TURN",
  "END_OF_TURN",
  "START_OF_TURN_WHILST_CHANNELLED",
  "END_OF_TURN_WHILST_CHANNELLED",
  "ON_RELEASE",
  "ON_EXPIRY",
];
const EFFECT_DURATIONS: EffectDurationType[] = [
  "INSTANT",
  "TURNS",
  "PASSIVE",
  "UNTIL_TARGET_NEXT_TURN",
];
const RANGE_CATEGORIES: RangeCategory[] = ["MELEE", "RANGED", "AOE"];
const ATTACK_MODES = ["PHYSICAL", "MENTAL"] as const;
const APPLY_TO_OPTIONS: EffectPacketApplyTo[] = ["PRIMARY_TARGET", "ALLIES", "SELF"];
const CORE_ATTRIBUTES: CoreAttribute[] = [
  "ATTACK",
  "GUARD",
  "FORTITUDE",
  "INTELLECT",
  "SYNERGY",
  "BRAVERY",
];
const ATTRIBUTE_LABELS: Record<CoreAttribute, string> = {
  ATTACK: "Attack",
  GUARD: "Guard",
  FORTITUDE: "Fortitude",
  INTELLECT: "Intellect",
  SYNERGY: "Synergy",
  BRAVERY: "Bravery",
};
const ATTRIBUTE_LABEL_OPTIONS = Object.values(ATTRIBUTE_LABELS);
const CONTROL_MODES = [
  "Force move",
  "Force no move",
  "Force specific main action",
  "Force no main action",
  "Force specific power action",
] as const;
const CLEANSE_EFFECTS = [
  "Active Power",
  "Effect over time",
  "Damage over time",
  "Channelled Power",
] as const;
const MOVEMENT_MODES = [
  "Force Push",
  "Force Teleport",
  "Force Fly",
  "Run",
  "Fly",
  "Teleport",
] as const;
const CONTROL_THEME_OPTIONS = [
  { value: "BODY_ENDURANCE", label: "Body / endurance" },
  { value: "MIND_COGNITION", label: "Mind / cognition / perception" },
  { value: "COURAGE_RESOLVE", label: "Courage / resolve / panic" },
  { value: "TRUST_BELONGING", label: "Trust / belonging / anchoring" },
  { value: "OFFENSIVE_EXECUTION", label: "Offensive execution" },
  { value: "DEFENSIVE_COORDINATION", label: "Defensive coordination / balance" },
] as const;
const CONTROL_THEME_TO_RESIST_ATTRIBUTE: Record<ResistTheme, CoreAttribute> = {
  BODY_ENDURANCE: "FORTITUDE",
  MIND_COGNITION: "INTELLECT",
  COURAGE_RESOLVE: "BRAVERY",
  TRUST_BELONGING: "SYNERGY",
  OFFENSIVE_EXECUTION: "ATTACK",
  DEFENSIVE_COORDINATION: "GUARD",
};
export const CHARACTER_POWER_ATTACK_MODES = ATTACK_MODES;
export const CHARACTER_POWER_CONTROL_MODES = CONTROL_MODES;
export const CHARACTER_POWER_CLEANSE_EFFECTS = CLEANSE_EFFECTS;
export const CHARACTER_POWER_MOVEMENT_MODES = MOVEMENT_MODES;
export const CHARACTER_POWER_CONTROL_THEME_OPTIONS = CONTROL_THEME_OPTIONS;
export const CHARACTER_POWER_ATTRIBUTE_OPTIONS = ATTRIBUTE_LABEL_OPTIONS;
export const CHARACTER_POWER_TRIGGER_CONDITION_OPTIONS = TRIGGER_CONDITION_KEYS;
export const CHARACTER_POWER_MAX_DAMAGE_TYPES: typeof MAX_DAMAGE_TYPES = MAX_DAMAGE_TYPES;
export const CHARACTER_POWER_MAX_DICE_COUNT = 20;
export const CHARACTER_POWER_MAX_POTENCY = 20;
export const CHARACTER_POWER_FALLBACK_DAMAGE_TYPES = [
  { id: -101, name: "Slash", attackMode: "PHYSICAL" as const },
  { id: -102, name: "Pierce", attackMode: "PHYSICAL" as const },
  { id: -103, name: "Bludgeon", attackMode: "PHYSICAL" as const },
  { id: -201, name: "Psychic", attackMode: "MENTAL" as const },
  { id: -202, name: "Corruption", attackMode: "MENTAL" as const },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function uniqueStrings(values: unknown, limit = 100): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const label = typeof value === "string" ? value.trim() : "";
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    next.push(label);
    if (next.length >= limit) break;
  }
  return next;
}

function normalizeCoreAttribute(value: unknown): CoreAttribute | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "DEFENCE" || normalized === "DEFENSE") return "GUARD";
  if (normalized === "SUPPORT") return "SYNERGY";
  return CORE_ATTRIBUTES.includes(normalized as CoreAttribute)
    ? (normalized as CoreAttribute)
    : null;
}

function normalizeStatTarget(value: unknown): string {
  const attribute = normalizeCoreAttribute(value);
  return attribute ? ATTRIBUTE_LABELS[attribute] : "Attack";
}

function normalizeResistTheme(value: unknown): ResistTheme | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return RESIST_THEME_VALUES.includes(normalized as ResistTheme) ? (normalized as ResistTheme) : null;
}

function getThemeResistAttribute(value: unknown): CoreAttribute | null {
  const theme = normalizeResistTheme(value);
  return theme ? CONTROL_THEME_TO_RESIST_ATTRIBUTE[theme] : null;
}

function isChannelAllowedForChassis(descriptorChassis: DescriptorChassisType) {
  return descriptorChassis === "IMMEDIATE" ||
    descriptorChassis === "FIELD" ||
    descriptorChassis === "ATTACHED";
}

function normalizeCommitmentModifier(value: unknown, descriptorChassis: DescriptorChassisType) {
  const normalized = oneOf(value, ["STANDARD", "CHANNEL", "CHARGE"] as const, "STANDARD");
  return normalized === "CHANNEL" && !isChannelAllowedForChassis(descriptorChassis)
    ? "STANDARD"
    : normalized;
}

function normalizeControlMode(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "Force specific action") return "Force specific main action";
  if (raw === "Force no action") return "Force no main action";
  if (raw === "Force specific power") return "Force specific power action";
  return CONTROL_MODES.includes(raw as (typeof CONTROL_MODES)[number]) ? raw : "Force move";
}

function cleanseEffectNeedsTheme(cleanseEffectType: string) {
  return cleanseEffectType === "Active Power" || cleanseEffectType === "Channelled Power";
}

function controlModeNeedsTheme(controlMode: string) {
  return CONTROL_MODES.includes(controlMode as (typeof CONTROL_MODES)[number]);
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

function getHostileEntryPattern(power: Pick<CharacterPower, "primaryDefenceGate" | "descriptorChassisConfig">) {
  const config = asRecord(power.descriptorChassisConfig);
  return oneOf(
    power.primaryDefenceGate?.hostileEntryPattern ?? config.hostileEntryPattern,
    ["DIRECT", "ON_ATTACH", "ON_PAYLOAD"] as const,
    "DIRECT",
  ) as HostileEntryPattern;
}

function getPrimaryTimingForDescriptorChassis(
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

export function getCharacterPowerAllowedTimingOptions(
  power: Pick<CharacterPower, "descriptorChassis" | "commitmentModifier" | "primaryDefenceGate" | "descriptorChassisConfig" | "effectPackets">,
  packetIndex: number,
): EffectTimingType[] {
  const descriptorChassis = power.descriptorChassis ?? "IMMEDIATE";
  const commitmentModifier = normalizeCommitmentModifier(power.commitmentModifier, descriptorChassis);
  const hostileEntryPattern = getHostileEntryPattern(power);
  const primaryEffectPacket = power.effectPackets[0];
  const channelRecurringOptions =
    commitmentModifier === "CHANNEL" && isChannelAllowedForChassis(descriptorChassis)
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

export function getCharacterPowerAllowedDurationOptions(effectTimingType: EffectTimingType | undefined) {
  const timing = effectTimingType ?? "ON_CAST";
  if (timing === "START_OF_TURN" || timing === "END_OF_TURN") {
    return ["INSTANT", "TURNS", "PASSIVE"] as EffectDurationType[];
  }
  return ["INSTANT", "UNTIL_TARGET_NEXT_TURN", "TURNS", "PASSIVE"] as EffectDurationType[];
}

export function getCharacterPowerAllowedApplyToOptions(power: CharacterPower, packet: EffectPacket): EffectPacketApplyTo[] {
  if (packet.localTargetingOverride) return APPLY_TO_OPTIONS;
  const category = power.rangeCategories?.[0] ?? "MELEE";
  if (!category) return ["SELF"];
  if (category === "MELEE" && (power.meleeTargets ?? 1) <= 1) return ["PRIMARY_TARGET", "SELF"];
  if (category === "RANGED" && (power.rangedTargets ?? 1) <= 1) return ["PRIMARY_TARGET", "SELF"];
  return APPLY_TO_OPTIONS;
}

function defaultDetailsForIntention(intention: PowerIntention): Record<string, unknown> {
  switch (intention) {
    case "ATTACK":
      return { attackMode: "PHYSICAL", damageTypes: [] };
    case "DEFENCE":
      return { attackMode: "PHYSICAL" };
    case "CONTROL":
      return { controlMode: "Force move" };
    case "CLEANSE":
      return { cleanseEffectType: "Active Power" };
    case "MOVEMENT":
      return { movementMode: "Force Push" };
    case "AUGMENT":
    case "DEBUFF":
      return { statTarget: "Attack" };
    case "HEALING":
      return { healingMode: "PHYSICAL" };
    default:
      return {};
  }
}

function normalizePacketDetailsForIntention(
  intention: PowerIntention,
  details: Record<string, unknown>,
): Record<string, unknown> {
  if (intention === "ATTACK") {
    const attackMode = oneOf(details.attackMode, ATTACK_MODES, "PHYSICAL");
    return {
      ...details,
      attackMode,
      damageTypes: uniqueStrings(details.damageTypes, MAX_DAMAGE_TYPES),
    };
  }
  if (intention === "DEFENCE") {
    return { ...details, attackMode: oneOf(details.attackMode, ATTACK_MODES, "PHYSICAL") };
  }
  if (intention === "CONTROL") {
    const controlMode = normalizeControlMode(details.controlMode);
    const controlTheme = getThemeResistAttribute(details.controlTheme) ? details.controlTheme : null;
    return {
      ...details,
      controlMode,
      ...(controlModeNeedsTheme(controlMode) && controlTheme ? { controlTheme } : { controlTheme: null }),
    };
  }
  if (intention === "CLEANSE") {
    const cleanseEffectType = oneOf(details.cleanseEffectType, CLEANSE_EFFECTS, "Active Power");
    const cleanseTheme = getThemeResistAttribute(details.cleanseTheme) ? details.cleanseTheme : null;
    return {
      ...details,
      cleanseEffectType,
      ...(cleanseEffectNeedsTheme(cleanseEffectType) && cleanseTheme ? { cleanseTheme } : { cleanseTheme: null }),
    };
  }
  if (intention === "MOVEMENT") {
    const movementMode = oneOf(details.movementMode, MOVEMENT_MODES, "Force Push");
    const movementTheme = getThemeResistAttribute(details.movementTheme) ? details.movementTheme : null;
    return {
      ...details,
      movementMode,
      ...(movementTheme ? { movementTheme } : { movementTheme: null }),
    };
  }
  if (intention === "AUGMENT" || intention === "DEBUFF") {
    return { ...details, statTarget: normalizeStatTarget(details.statTarget ?? details.statChoice) };
  }
  if (intention === "HEALING") {
    return { ...details, healingMode: oneOf(details.healingMode, ATTACK_MODES, "PHYSICAL") };
  }
  return details;
}

function normalizeRangeDetails(raw: Record<string, unknown>) {
  const rangeCategory = oneOf(raw.rangeCategory, ["SELF", ...RANGE_CATEGORIES] as const, "MELEE");
  const rangeValue =
    rangeCategory === "SELF"
      ? 0
      : asInteger(raw.rangeValue, rangeCategory === "MELEE" ? 1 : 30, 0, 500);
  const rawRangeExtra = asRecord(raw.rangeExtra);
  const rangeExtra =
    rangeCategory === "AOE"
      ? {
          count: asInteger(rawRangeExtra.count, 1, 1, 20),
          shape: oneOf(rawRangeExtra.shape, ["SPHERE", "CONE", "LINE"] as const, "SPHERE"),
          sphereRadiusFeet: asInteger(rawRangeExtra.sphereRadiusFeet, 10, 0, 500),
          coneLengthFeet: asInteger(rawRangeExtra.coneLengthFeet, 15, 0, 500),
          lineWidthFeet: asInteger(rawRangeExtra.lineWidthFeet, 5, 0, 500),
          lineLengthFeet: asInteger(rawRangeExtra.lineLengthFeet, 30, 0, 500),
        }
      : rangeCategory === "RANGED"
        ? { targets: asInteger(rawRangeExtra.targets, 1, 1, 20) }
        : {};

  return { rangeCategory, rangeValue, rangeExtra };
}

function getPacketApplyTo(effectPacket: Pick<EffectPacket, "applyTo" | "detailsJson">): EffectPacketApplyTo {
  const details = asRecord(effectPacket.detailsJson);
  return oneOf(effectPacket.applyTo ?? details.applyTo, APPLY_TO_OPTIONS, "PRIMARY_TARGET");
}

function isSelfTargetedBeneficialMovement(effectPacket: EffectPacket | undefined) {
  return effectPacket?.intention === "MOVEMENT" && getPacketApplyTo(effectPacket) === "SELF";
}

function getControlThemeResistAttribute(details: Record<string, unknown>) {
  return getThemeResistAttribute(details.controlTheme);
}

function getMovementThemeResistAttribute(details: Record<string, unknown>) {
  return getThemeResistAttribute(details.movementTheme);
}

function getCleanseThemeResistAttribute(details: Record<string, unknown>) {
  const cleanseEffectType = asString(details.cleanseEffectType, "");
  return cleanseEffectNeedsTheme(cleanseEffectType) ? getThemeResistAttribute(details.cleanseTheme) : null;
}

function derivePrimaryDefenceGateForPower(
  descriptorChassis: DescriptorChassisType,
  descriptorChassisConfig: Record<string, unknown>,
  effectPackets: EffectPacket[],
): PrimaryDefenceGate | null {
  const firstPacket = effectPackets[0];
  if (!firstPacket || isSelfTargetedBeneficialMovement(firstPacket)) {
    return null;
  }

  const details = asRecord(firstPacket.detailsJson);
  const hostileEntryPattern =
    descriptorChassis === "ATTACHED"
      ? oneOf(descriptorChassisConfig.hostileEntryPattern, ["DIRECT", "ON_ATTACH", "ON_PAYLOAD"] as const, "DIRECT")
      : null;
  if (firstPacket.hostility === "HOSTILE" && firstPacket.intention === "ATTACK") {
    return {
      sourcePacketIndex: 0,
      gateResult: "DODGE_OR_PROTECTION",
      protectionChannel: oneOf(details.attackMode, ATTACK_MODES, "PHYSICAL"),
      resistAttribute: null,
      hostileEntryPattern,
      resolutionSource: "INFERRED",
    };
  }
  if (firstPacket.hostility === "HOSTILE" && firstPacket.intention === "CONTROL") {
    return {
      sourcePacketIndex: 0,
      gateResult: "RESIST",
      protectionChannel: null,
      resistAttribute: getControlThemeResistAttribute(details),
      hostileEntryPattern,
      resolutionSource: "INFERRED",
    };
  }
  if (firstPacket.hostility === "HOSTILE" && firstPacket.intention === "MOVEMENT") {
    return {
      sourcePacketIndex: 0,
      gateResult: "RESIST",
      protectionChannel: null,
      resistAttribute: getMovementThemeResistAttribute(details),
      hostileEntryPattern,
      resolutionSource: "INFERRED",
    };
  }
  if (firstPacket.hostility === "HOSTILE" && firstPacket.intention === "DEBUFF") {
    return {
      sourcePacketIndex: 0,
      gateResult: "RESIST",
      protectionChannel: null,
      resistAttribute: normalizeCoreAttribute(details.statTarget ?? details.statChoice),
      hostileEntryPattern,
      resolutionSource: "INFERRED",
    };
  }
  if (firstPacket.hostility === "HOSTILE" && firstPacket.intention === "CLEANSE") {
    const cleanseEffectType = asString(details.cleanseEffectType, "");
    return {
      sourcePacketIndex: 0,
      gateResult: "RESIST",
      protectionChannel: null,
      resistAttribute:
        cleanseEffectType === "Effect over time" || cleanseEffectType === "Damage over time"
          ? "FORTITUDE"
          : getCleanseThemeResistAttribute(details),
      hostileEntryPattern,
      resolutionSource: "INFERRED",
    };
  }
  return null;
}

export function getCharacterPowerPrimaryDefenceLabel(power: CharacterPower) {
  const gate =
    power.primaryDefenceGate ??
    derivePrimaryDefenceGateForPower(
      power.descriptorChassis ?? "IMMEDIATE",
      asRecord(power.descriptorChassisConfig),
      power.effectPackets,
    );
  if (!gate || gate.gateResult === "NONE") return "None";
  if (gate.gateResult === "DODGE") return "Dodge";
  if (gate.gateResult === "DODGE_OR_PROTECTION") return "Dodge or Protection";
  if (gate.gateResult === "PROTECTION") {
    return gate.protectionChannel === "MENTAL" ? "Mental Defence" : "Physical Defence";
  }
  if (gate.gateResult === "RESIST") {
    return gate.resistAttribute ? `${ATTRIBUTE_LABELS[gate.resistAttribute]} Resist` : "Resist";
  }
  return "None";
}

export function createDefaultCharacterPower(sortOrder = 0): CharacterPower {
  const packet = createDefaultCharacterPowerPacket("ATTACK", 0);
  return {
    sortOrder,
    name: "",
    description: null,
    schemaVersion: 1,
    rulesVersion: "v1",
    contentRevision: 1,
    previewRendererVersion: 1,
    status: "ACTIVE",
    descriptorChassis: "IMMEDIATE",
    descriptorChassisConfig: {},
    chargeType: null,
    chargeTurns: null,
    chargeBonusDicePerTurn: null,
    cooldownTurns: 1,
    cooldownReduction: 0,
    counterMode: "NO",
    commitmentModifier: "STANDARD",
    triggerMethod: null,
    attachedHostAnchorType: null,
    lifespanType: "NONE",
    lifespanTurns: null,
    previewSummaryOverride: null,
    rangeCategories: ["MELEE"],
    meleeTargets: 1,
    rangedTargets: null,
    rangedDistanceFeet: null,
    aoeCenterRangeFeet: null,
    aoeCount: null,
    aoeShape: null,
    aoeSphereRadiusFeet: null,
    aoeConeLengthFeet: null,
    aoeLineWidthFeet: null,
    aoeLineLengthFeet: null,
    primaryDefenceGate: null,
    diceCount: 1,
    potency: 1,
    effectDurationType: "INSTANT",
    effectDurationTurns: null,
    durationType: "INSTANT",
    durationTurns: null,
    defenceRequirement: "NONE",
    effectPackets: [packet],
    intentions: [packet],
    sparkDiscountPercent: 0,
    restrictionDiscountPercent: 0,
  };
}

export function createDefaultCharacterPowerPacket(
  intention: PowerIntention,
  sortOrder = 0,
): EffectPacket {
  return {
    sortOrder,
    packetIndex: sortOrder,
    hostility: ["ATTACK", "CONTROL", "DEBUFF", "MOVEMENT"].includes(intention)
      ? "HOSTILE"
      : "NON_HOSTILE",
    intention,
    type: intention,
    diceCount: 1,
    potency: 1,
    effectTimingType: "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: "INSTANT",
    effectDurationTurns: null,
    dealsWounds: intention === "ATTACK",
    woundChannel: intention === "ATTACK" ? "PHYSICAL" : null,
    targetedAttribute: null,
    applicationModeKey: null,
    resolutionOrigin: "CASTER",
    applyTo: "PRIMARY_TARGET",
    triggerConditionText: null,
    detailsJson: {
      ...defaultDetailsForIntention(intention),
      rangeCategory: "MELEE",
      rangeValue: 1,
      rangeExtra: {},
    },
    localTargetingOverride: null,
  };
}

function normalizePacket(
  value: unknown,
  sortOrder: number,
  context: {
    descriptorChassis: DescriptorChassisType;
    commitmentModifier: NonNullable<Power["commitmentModifier"]>;
    descriptorChassisConfig: Record<string, unknown>;
    primaryEffectPacket?: EffectPacket;
  },
): EffectPacket {
  const raw = asRecord(value);
  const intention = oneOf(raw.intention ?? raw.type, POWER_INTENTIONS, "ATTACK");
  const baseDetails = {
    ...defaultDetailsForIntention(intention),
    ...asRecord(raw.detailsJson),
  };
  const rangeDetails = normalizeRangeDetails(baseDetails);
  const allowedTimingProbe: CharacterPower = {
    ...createDefaultCharacterPower(),
    descriptorChassis: context.descriptorChassis,
    descriptorChassisConfig: context.descriptorChassisConfig,
    commitmentModifier: context.commitmentModifier,
    primaryDefenceGate: {
      sourcePacketIndex: 0,
      gateResult: "NONE",
      protectionChannel: null,
      resistAttribute: null,
      hostileEntryPattern: oneOf(context.descriptorChassisConfig.hostileEntryPattern, ["DIRECT", "ON_ATTACH", "ON_PAYLOAD"] as const, "DIRECT"),
      resolutionSource: "INFERRED",
    },
    effectPackets: context.primaryEffectPacket ? [context.primaryEffectPacket] : [],
    intentions: context.primaryEffectPacket ? [context.primaryEffectPacket] : [],
  };
  const effectTimingType = oneOf(
    raw.effectTimingType === "ON_HIT" ? "ON_TRIGGER" : raw.effectTimingType,
    EFFECT_TIMINGS,
    getPrimaryTimingForDescriptorChassis(
      context.descriptorChassis,
      oneOf(context.descriptorChassisConfig.hostileEntryPattern, ["DIRECT", "ON_ATTACH", "ON_PAYLOAD"] as const, "DIRECT"),
    ),
  );
  const allowedTimingOptions = getCharacterPowerAllowedTimingOptions(allowedTimingProbe, sortOrder);
  const normalizedEffectTimingType = allowedTimingOptions.includes(effectTimingType)
    ? effectTimingType
    : effectTimingType;
  const allowedDurations = getCharacterPowerAllowedDurationOptions(normalizedEffectTimingType);
  const effectDurationType = oneOf(raw.effectDurationType, EFFECT_DURATIONS, "INSTANT");
  const normalizedEffectDurationType = allowedDurations.includes(effectDurationType)
    ? effectDurationType
    : "INSTANT";
  const details = normalizePacketDetailsForIntention(intention, {
    ...baseDetails,
    ...rangeDetails,
  });
  const applyTo = oneOf(raw.applyTo ?? details.applyTo, APPLY_TO_OPTIONS, "PRIMARY_TARGET");
  const hostileDefault = ["ATTACK", "CONTROL", "DEBUFF", "MOVEMENT"].includes(intention) &&
    !(intention === "MOVEMENT" && applyTo === "SELF")
      ? "HOSTILE"
      : "NON_HOSTILE";
  return {
    ...createDefaultCharacterPowerPacket(intention, sortOrder),
    sortOrder,
    packetIndex: sortOrder,
    hostility: oneOf(raw.hostility, ["NON_HOSTILE", "HOSTILE"] as const, hostileDefault),
    intention,
    type: intention,
    specific: asString(raw.specific, "") || null,
    diceCount: asInteger(raw.diceCount, 1, 1, CHARACTER_POWER_MAX_DICE_COUNT),
    potency: asInteger(raw.potency, 1, 1, CHARACTER_POWER_MAX_POTENCY),
    effectTimingType: normalizedEffectTimingType,
    effectTimingTurns:
      normalizedEffectTimingType === "ON_TRIGGER" ? asInteger(raw.effectTimingTurns, 1, 1, 20) : null,
    effectDurationType: normalizedEffectDurationType,
    effectDurationTurns:
      normalizedEffectDurationType === "TURNS" ? asInteger(raw.effectDurationTurns, 1, 1, 20) : null,
    dealsWounds: Boolean(raw.dealsWounds ?? intention === "ATTACK"),
    woundChannel: oneOf(raw.woundChannel ?? details.attackMode ?? details.healingMode, ATTACK_MODES, "PHYSICAL"),
    targetedAttribute: normalizeCoreAttribute(raw.targetedAttribute ?? details.statTarget),
    applicationModeKey: asString(raw.applicationModeKey, "") || null,
    resolutionOrigin: oneOf(
      raw.resolutionOrigin,
      ["CASTER", "PRIMARY_TARGET", "ATTACHED_HOST", "FIELD_ORIGIN", "PACKET_LOCAL"] as const,
      "CASTER",
    ),
    applyTo,
    triggerConditionText: asString(raw.triggerConditionText, "") || null,
    detailsJson: details,
    localTargetingOverride: raw.localTargetingOverride && typeof raw.localTargetingOverride === "object"
      ? (raw.localTargetingOverride as EffectPacket["localTargetingOverride"])
      : null,
  };
}

export function normalizeCharacterPower(value: unknown, sortOrder: number): CharacterPower {
  const raw = asRecord(value);
  const descriptorChassis = oneOf(raw.descriptorChassis, DESCRIPTOR_CHASSIS, "IMMEDIATE");
  const commitmentModifier = normalizeCommitmentModifier(raw.commitmentModifier, descriptorChassis);
  const rawDescriptorChassisConfig = asRecord(raw.descriptorChassisConfig);
  const descriptorChassisConfig: Record<string, unknown> = {
    ...rawDescriptorChassisConfig,
    ...(descriptorChassis === "TRIGGER"
      ? {
          triggerConditionText:
            asString(rawDescriptorChassisConfig.triggerConditionText, "") ||
            oneOf(rawDescriptorChassisConfig.triggerConditionText, TRIGGER_CONDITION_KEYS, "MOVES"),
        }
      : {}),
    ...(descriptorChassis === "ATTACHED"
      ? {
          hostileEntryPattern: oneOf(
            asRecord(raw.primaryDefenceGate).hostileEntryPattern ?? rawDescriptorChassisConfig.hostileEntryPattern,
            ["DIRECT", "ON_ATTACH", "ON_PAYLOAD"] as const,
            "DIRECT",
          ),
          anchorText: asString(rawDescriptorChassisConfig.anchorText, "") || asString(raw.attachedHostAnchorType, "TARGET").toLowerCase(),
        }
      : {}),
    ...(descriptorChassis === "RESERVE"
      ? {
          releaseBehaviour: oneOf(
            rawDescriptorChassisConfig.releaseBehaviour,
            ["ACTION_OR_RESPONSE", "ACTION_ONLY", "RESPONSE_ONLY", "ON_EXPIRY"] as const,
            "ACTION_OR_RESPONSE",
          ),
        }
      : {}),
  };
  const packetsRaw = Array.isArray(raw.effectPackets)
    ? raw.effectPackets
    : Array.isArray(raw.intentions)
      ? raw.intentions
      : [];
  const packets: EffectPacket[] = [];
  const packetInputs = packetsRaw.length > 0 ? packetsRaw.slice(0, 4) : [createDefaultCharacterPowerPacket("ATTACK", 0)];
  for (const [index, packetInput] of packetInputs.entries()) {
    packets.push(
      normalizePacket(packetInput, index, {
        descriptorChassis,
        commitmentModifier,
        descriptorChassisConfig,
        primaryEffectPacket: packets[0],
      }),
    );
  }
  const primaryPacket = packets[0] ?? createDefaultCharacterPowerPacket("ATTACK", 0);
  const primaryDetails = asRecord(primaryPacket.detailsJson);
  const range = normalizeRangeDetails(primaryDetails);
  const rangeCategories =
    range.rangeCategory === "SELF" ? [] : [range.rangeCategory as RangeCategory];
  const effectDurationType = oneOf(raw.effectDurationType ?? raw.durationType, EFFECT_DURATIONS, "INSTANT");
  const primaryDefenceGate = derivePrimaryDefenceGateForPower(
    descriptorChassis,
    descriptorChassisConfig,
    packets,
  );
  const gateResult = primaryDefenceGate?.gateResult ?? "NONE";

  return {
    ...createDefaultCharacterPower(sortOrder),
    sortOrder,
    name: asString(raw.name, "").slice(0, 120),
    description: asString(raw.description, "").slice(0, 1000) || null,
    descriptorChassis,
    descriptorChassisConfig,
    cooldownTurns: 1,
    cooldownReduction: 0,
    counterMode: oneOf(raw.counterMode, ["NO", "YES"] as const, "NO"),
    commitmentModifier,
    triggerMethod:
      descriptorChassis === "TRIGGER"
        ? oneOf(raw.triggerMethod, ["ARM_AND_THEN_TARGET", "TARGET_AND_THEN_ARM"] as const, "ARM_AND_THEN_TARGET")
        : null,
    attachedHostAnchorType:
      descriptorChassis === "ATTACHED"
        ? oneOf(raw.attachedHostAnchorType, ["TARGET", "OBJECT", "WEAPON", "ARMOR", "SELF", "AREA"] as const, "TARGET")
        : null,
    chargeType:
      commitmentModifier === "CHARGE"
        ? oneOf(raw.chargeType, ["DELAYED_RELEASE", "BUILD_POWER"] as const, "DELAYED_RELEASE")
        : null,
    chargeTurns:
      commitmentModifier === "CHARGE" ? asInteger(raw.chargeTurns, 1, 1, 5) : null,
    chargeBonusDicePerTurn:
      commitmentModifier === "CHARGE" && raw.chargeType === "BUILD_POWER"
        ? asInteger(raw.chargeBonusDicePerTurn, 1, 1, 5)
        : null,
    lifespanType:
      descriptorChassis !== "IMMEDIATE" || commitmentModifier === "CHANNEL"
        ? oneOf(raw.lifespanType, ["TURNS", "PASSIVE"] as const, "TURNS")
        : oneOf(raw.lifespanType, ["NONE", "TURNS", "PASSIVE"] as const, "NONE"),
    lifespanTurns:
      raw.lifespanType === "TURNS" ? asInteger(raw.lifespanTurns, 1, 1, 10) : null,
    primaryDefenceGate,
    defenceRequirement: gateResult,
    diceCount: asInteger(
      raw.diceCount ?? primaryPacket.diceCount,
      1,
      1,
      CHARACTER_POWER_MAX_DICE_COUNT,
    ),
    potency: asInteger(
      raw.potency ?? primaryPacket.potency,
      1,
      1,
      CHARACTER_POWER_MAX_POTENCY,
    ),
    effectDurationType,
    effectDurationTurns:
      effectDurationType === "TURNS" ? asInteger(raw.effectDurationTurns, 1, 1, 20) : null,
    durationType: effectDurationType,
    durationTurns:
      effectDurationType === "TURNS" ? asInteger(raw.effectDurationTurns, 1, 1, 20) : null,
    rangeCategories,
    meleeTargets: range.rangeCategory === "MELEE" ? Math.max(1, range.rangeValue) : null,
    rangedTargets:
      range.rangeCategory === "RANGED"
        ? asInteger(asRecord(range.rangeExtra).targets, 1, 1, 20)
        : null,
    rangedDistanceFeet: range.rangeCategory === "RANGED" ? Math.max(0, range.rangeValue) : null,
    aoeCenterRangeFeet: range.rangeCategory === "AOE" ? Math.max(0, range.rangeValue) : null,
    aoeCount:
      range.rangeCategory === "AOE" ? asInteger(asRecord(range.rangeExtra).count, 1, 1, 20) : null,
    aoeShape:
      range.rangeCategory === "AOE"
        ? oneOf(asRecord(range.rangeExtra).shape, ["SPHERE", "CONE", "LINE"] as const, "SPHERE")
        : null,
    aoeSphereRadiusFeet:
      range.rangeCategory === "AOE"
        ? asInteger(asRecord(range.rangeExtra).sphereRadiusFeet, 10, 0, 500)
        : null,
    aoeConeLengthFeet:
      range.rangeCategory === "AOE"
        ? asInteger(asRecord(range.rangeExtra).coneLengthFeet, 15, 0, 500)
        : null,
    aoeLineWidthFeet:
      range.rangeCategory === "AOE"
        ? asInteger(asRecord(range.rangeExtra).lineWidthFeet, 5, 0, 500)
        : null,
    aoeLineLengthFeet:
      range.rangeCategory === "AOE"
        ? asInteger(asRecord(range.rangeExtra).lineLengthFeet, 30, 0, 500)
        : null,
    effectPackets: packets,
    intentions: packets,
    sparkDiscountPercent: 0,
    restrictionDiscountPercent: 0,
  };
}

export function normalizeCharacterPowers(value: unknown): CharacterPower[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((power, index) => normalizeCharacterPower(power, index));
}

export function powerPointPool(level: number) {
  return Math.max(1, Math.trunc(level || 1)) * 50;
}

function collectCharacterPowerValidationErrors(power: CharacterPower) {
  const errors: string[] = [];

  if (!power.name.trim()) errors.push("Power name is required.");
  if ((power.sparkDiscountPercent ?? 0) !== 0) {
    errors.push("Spark discounts are not implemented yet.");
  }
  if ((power.restrictionDiscountPercent ?? 0) !== 0) {
    errors.push("Restriction discounts are not implemented yet.");
  }

  for (const [packetIndex, packet] of power.effectPackets.entries()) {
    const packetLabel = `Packet ${packetIndex + 1}`;
    const allowedTimings = getCharacterPowerAllowedTimingOptions(power, packetIndex);
    if (!allowedTimings.includes((packet.effectTimingType ?? "ON_CAST") as EffectTimingType)) {
      errors.push(`${packetLabel} timing is not legal for this chassis.`);
    }
    const allowedDurations = getCharacterPowerAllowedDurationOptions(packet.effectTimingType);
    if (!allowedDurations.includes((packet.effectDurationType ?? "INSTANT") as EffectDurationType)) {
      errors.push(`${packetLabel} duration is not legal for this timing.`);
    }
    const details = asRecord(packet.detailsJson);
    if (packet.intention === "ATTACK") {
      const damageTypes = uniqueStrings(details.damageTypes, MAX_DAMAGE_TYPES);
      if (damageTypes.length === 0) {
        errors.push(`${packetLabel} Attack requires at least one damage type.`);
      }
      if (damageTypes.length > MAX_DAMAGE_TYPES) {
        errors.push(`${packetLabel} Attack can select at most ${MAX_DAMAGE_TYPES} damage types.`);
      }
    }
    if ((packet.intention === "AUGMENT" || packet.intention === "DEBUFF") && !normalizeCoreAttribute(details.statTarget)) {
      errors.push(`${packetLabel} ${packet.intention === "AUGMENT" ? "Augment" : "Debuff"} requires a stat.`);
    }
    if (packet.effectTimingType === "ON_TRIGGER") {
      const triggerCondition = asString(packet.triggerConditionText, "");
      if (triggerCondition && !TRIGGER_CONDITION_KEYS.includes(triggerCondition as TriggerConditionKey)) {
        errors.push(`${packetLabel} trigger condition is not supported.`);
      }
    }
  }

  return errors;
}

export function summarizeCharacterPowers(params: {
  level: number;
  powers: CharacterPower[];
  tuningSnapshot?: PowerTuningSnapshot | null;
  playerPowerSpendScalar?: number | null;
}): CharacterPowerBudget {
  const playerPowerSpendScalar = normalizeCharacterPowerSpendScalar(
    params.playerPowerSpendScalar ?? DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  );
  const normalizedPowers = params.powers.map((power, index) =>
    normalizeCharacterPower(power, index),
  );
  const resolved = resolvePowerCosts(normalizedPowers, params.tuningSnapshot ?? undefined, {
    level: params.level,
    tier: "SOLDIER",
  });
  const summaries = normalizedPowers.map((power, index) => {
    const resolvedPower = resolved.powers[index];
    const descriptorLines = renderPowerDescriptorLines(power);
    const errors = collectCharacterPowerValidationErrors(power);
    const warnings: string[] = [];
    if (descriptorLines.length === 0) warnings.push("Power descriptor is empty.");
    const costValid = errors.length === 0;
    const basePowerValue = costValid ? (resolvedPower?.breakdown.basePowerValue ?? 0) : null;
    const spend =
      basePowerValue === null
        ? null
        : calculateCharacterPlayerPowerSpend(basePowerValue, playerPowerSpendScalar);
    return {
      power,
      descriptorLines,
      basePowerValue,
      spend,
      playerPowerSpendScalar,
      derivedCooldownTurns: costValid ? (resolvedPower?.derivedCooldownTurns ?? 1) : null,
      costValid,
      invalidCostReason: costValid ? null : errors[0] ?? "Power is invalid.",
      errors,
      warnings,
    };
  });
  const totalSpent = Math.round(summaries.reduce((sum, row) => sum + (row.spend ?? 0), 0) * 100) / 100;
  const pool = powerPointPool(params.level);
  return {
    powerPool: pool,
    playerPowerSpendScalar,
    totalSpent,
    remaining: Math.round((pool - totalSpent) * 100) / 100,
    overspent: totalSpent > pool,
    powers: summaries,
  };
}

export function validateCharacterPowers(params: {
  level: number;
  powers: CharacterPower[];
  tuningSnapshot?: PowerTuningSnapshot | null;
  playerPowerSpendScalar?: number | null;
}) {
  const summary = summarizeCharacterPowers(params);
  const errors = summary.powers.flatMap((row, index) =>
    row.errors.map((error) => `Power ${index + 1}: ${error}`),
  );
  if (summary.overspent) {
    errors.push("Total Power Point spend cannot exceed Character Level x 50.");
  }
  return Array.from(new Set(errors));
}
