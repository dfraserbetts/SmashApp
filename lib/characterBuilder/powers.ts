import type {
  CoreAttribute,
  DescriptorChassisType,
  EffectDurationType,
  EffectPacket,
  EffectPacketApplyTo,
  EffectTimingType,
  Power,
  PowerCooldownAuthorityMode,
  PowerCooldownAuthorityResolution,
  PowerCooldownAuthorityResult,
  PowerIntention,
  PrimaryDefenceGate,
  RangeCategory,
  ResistTheme,
  SecondaryDependencyMode,
} from "@/lib/summoning/types";
import { resolvePowerCooldownAuthority } from "@/lib/summoning/resolvePowerCooldownAuthority";
import {
  applyResolvedPowerCooldownCache,
  type PowerCooldownCacheSynchronizationFailure,
} from "@/lib/summoning/powerCooldownCacheSynchronization";
import type { CombatDieSize } from "@/lib/combat-lab/types";
import {
  RESIST_THEME_VALUES,
  TRIGGER_CONDITION_KEYS,
  MAX_POWER_PACKET_DAMAGE_TYPES as MAX_DAMAGE_TYPES,
} from "@/lib/summoning/types";
import {
  CHARACTER_BUILDER_V1_POWER_INTENTIONS,
  POWER_AUTHORING_MAX_PACKET_DURATION_TURNS,
  POWER_RANGE_AOE_CENTER_RANGE_OPTIONS,
  POWER_RANGE_AOE_CONE_LENGTH_OPTIONS,
  POWER_RANGE_AOE_LINE_LENGTH_OPTIONS,
  POWER_RANGE_AOE_LINE_WIDTH_OPTIONS,
  POWER_RANGE_AOE_SHAPES,
  POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS,
  POWER_RANGE_RANGED_DISTANCE_OPTIONS,
  POWER_RANGE_TARGET_OPTIONS,
  POWER_DEFENCE_MODE_OPTIONS,
  POWER_DEFENCE_RESISTED_ATTRIBUTE_OPTIONS,
  POWER_RESERVE_RELEASE_BEHAVIOUR_OPTIONS,
  POWER_TRIGGER_AREA_PRESENCE_KEYS,
  getPowerAllowedCommitmentOptions,
  getPowerAllowedCounterOptions,
  getPowerAllowedDurationOptions,
  getPowerAllowedLifespanOptions,
  getPowerAllowedRangeCategories,
  getPowerAllowedTimingOptions,
  getPowerAllowedTriggerConditionOptions,
  getPowerPrimaryTimingForDescriptorChassis,
  isPowerAttachedHostileEntryReady,
  isPowerPacketTimingAuthorable,
  isPowerReserveReleaseBehaviourReady,
  isCharacterBuilderV1PowerIntention,
  isPowerAreaTriggerCondition,
  isPowerSecondaryDiceAuthored,
  normalizePowerCommitmentModifier,
  readPowerAttachedHostileEntryPattern,
  readPowerReserveReleaseBehaviour,
  readPowerTriggerCondition,
  validateThreeFieldAugmentDebuffPacket,
} from "@/lib/powers/authoringRules";
import {
  createSemanticAugmentDebuffPacket,
  getModifierAuthoringPacketErrors,
  getSemanticRuntimeSupportError,
  isAugmentDebuffIntention,
} from "@/lib/powers/modifierAuthoring";
import {
  applyAutomaticExpectedTargetsToPower,
  type ExpectedTargetTeamContext,
} from "@/lib/powers/expectedTargetEstimation";
import type { PowerTuningSnapshot } from "@/lib/config/powerTuningShared";
import {
  calculateCharacterPlayerPowerSpend,
  DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  normalizeCharacterPowerSpendScalar,
} from "@/lib/config/characterBuilderTuningShared";
import { renderPowerDescriptorLines } from "@/lib/summoning/render";
import {
  resolvePowerCosts,
  type PowerCostContext,
  type PowerCostPacketBreakdown,
} from "@/lib/summoning/powerCostResolver";
import {
  analyzeOffencePressure,
  type OffencePressureAnalysis,
} from "@/lib/summoning/offencePressure";
import type { AbilityRestrictionDefinitionV1 } from "@/lib/restrictions";
import {
  normalizePersistedRestriction,
  type PersistedRestrictionNormalizationResult,
} from "@/lib/restrictions/persistence";

export type CharacterPower = Power & {
  restriction?: AbilityRestrictionDefinitionV1 | null;
  sparkDiscountPercent?: 0;
  restrictionDiscountPercent?: 0;
};

export function normalizeCharacterPowerRestriction(
  input: unknown,
): PersistedRestrictionNormalizationResult {
  const record = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return normalizePersistedRestriction(record.restriction);
}

export type CharacterPowerPoolKind = "normal" | "signature";

export type CharacterPowerBudgetCooldownPressure = {
  poolKind: CharacterPowerPoolKind;
  poolSize: number;
  spend: number;
  budgetShare: number;
  budgetSharePercent: number;
  baseCooldownTurns: number;
  budgetCooldownFloor: number;
  finalCooldownTurns: number;
  raisedByBudgetShare: boolean;
};

export type CharacterPowerSummary = {
  power: CharacterPower;
  descriptorLines: string[];
  basePowerValue: number | null;
  spend: number | null;
  playerPowerSpendScalar: number;
  derivedCooldownTurns: number | null;
  baseDerivedCooldownTurns: number | null;
  budgetCooldownPressure: CharacterPowerBudgetCooldownPressure | null;
  costValid: boolean;
  invalidCostReason: string | null;
  errors: string[];
  warnings: string[];
  cooldownAuthority: PowerCooldownAuthorityResolution;
};

export type CharacterPowerBudget = {
  powerPool: number;
  playerPowerSpendScalar: number;
  totalSpent: number;
  remaining: number;
  overspent: boolean;
  powers: CharacterPowerSummary[];
  cooldownAuthorityMode: PowerCooldownAuthorityMode;
};

type ResolvedOffencePressure = OffencePressureAnalysis & {
  applicationMode?: string;
  appliedBasePowerValueSurcharge?: number;
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
  "SUMMONING",
  "TRANSFORMATION",
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
export const SECONDARY_DEPENDENCY_MODE_OPTIONS: SecondaryDependencyMode[] = [
  "INDEPENDENT",
  "LINKED_TO_PRIMARY",
  "DEPENDENT_SEQUENTIAL",
  "TRIGGERED_CONDITIONAL",
];

export const SECONDARY_DEPENDENCY_MODE_LABELS: Record<SecondaryDependencyMode, string> = {
  INDEPENDENT: "Independent simultaneous",
  LINKED_TO_PRIMARY: "Linked to Primary",
  DEPENDENT_SEQUENTIAL: "Dependent sequential",
  TRIGGERED_CONDITIONAL: "Triggered / conditional",
};

function normalizeSecondaryDependencyMode(
  value: unknown,
  sortOrder: number,
): SecondaryDependencyMode | null {
  if (sortOrder <= 0) return null;
  return oneOf(value, SECONDARY_DEPENDENCY_MODE_OPTIONS, "LINKED_TO_PRIMARY");
}
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
  "Force no response",
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
const DEFENCE_MODES = POWER_DEFENCE_MODE_OPTIONS;
const DEFENCE_RESISTED_ATTRIBUTES = POWER_DEFENCE_RESISTED_ATTRIBUTE_OPTIONS;
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
export const CHARACTER_POWER_DEFENCE_MODES = DEFENCE_MODES;
export const CHARACTER_POWER_DEFENCE_RESISTED_ATTRIBUTES = DEFENCE_RESISTED_ATTRIBUTES;
export const CHARACTER_POWER_CONTROL_THEME_OPTIONS = CONTROL_THEME_OPTIONS;
export const CHARACTER_POWER_ATTRIBUTE_OPTIONS = ATTRIBUTE_LABEL_OPTIONS;
export const CHARACTER_POWER_TRIGGER_CONDITION_OPTIONS = TRIGGER_CONDITION_KEYS;
export const CHARACTER_POWER_INTENTION_OPTIONS = CHARACTER_BUILDER_V1_POWER_INTENTIONS;
export const CHARACTER_POWER_MAX_DAMAGE_TYPES: typeof MAX_DAMAGE_TYPES = MAX_DAMAGE_TYPES;
export const CHARACTER_POWER_MAX_DICE_COUNT = 20;
export const CHARACTER_POWER_MAX_POTENCY = 20;
export const CHARACTER_POWER_MAX_PACKET_DURATION_TURNS = POWER_AUTHORING_MAX_PACKET_DURATION_TURNS;
export const CHARACTER_POWER_RANGE_TARGET_OPTIONS = POWER_RANGE_TARGET_OPTIONS;
export const CHARACTER_POWER_RANGE_RANGED_DISTANCE_OPTIONS = POWER_RANGE_RANGED_DISTANCE_OPTIONS;
export const CHARACTER_POWER_RANGE_AOE_CENTER_RANGE_OPTIONS = POWER_RANGE_AOE_CENTER_RANGE_OPTIONS;
export const CHARACTER_POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS = POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS;
export const CHARACTER_POWER_RANGE_AOE_CONE_LENGTH_OPTIONS = POWER_RANGE_AOE_CONE_LENGTH_OPTIONS;
export const CHARACTER_POWER_RANGE_AOE_LINE_WIDTH_OPTIONS = POWER_RANGE_AOE_LINE_WIDTH_OPTIONS;
export const CHARACTER_POWER_RANGE_AOE_LINE_LENGTH_OPTIONS = POWER_RANGE_AOE_LINE_LENGTH_OPTIONS;
export const CHARACTER_POWER_RANGE_AOE_SHAPES = POWER_RANGE_AOE_SHAPES;
export const CHARACTER_POWER_RESERVE_RELEASE_BEHAVIOUR_OPTIONS = POWER_RESERVE_RELEASE_BEHAVIOUR_OPTIONS;
export const getCharacterPowerAllowedCommitmentOptions = getPowerAllowedCommitmentOptions;
export const getCharacterPowerAllowedCounterOptions = getPowerAllowedCounterOptions;
export const getCharacterPowerAllowedLifespanOptions = getPowerAllowedLifespanOptions;
export const isCharacterPowerSecondaryDiceAuthored = isPowerSecondaryDiceAuthored;
export const isCharacterPowerAttachedHostileEntryReady = isPowerAttachedHostileEntryReady;
export const isCharacterPowerPacketTimingAuthorable = isPowerPacketTimingAuthorable;
export const readCharacterPowerAttachedHostileEntryPattern = readPowerAttachedHostileEntryPattern;
export const getCharacterPowerAllowedRangeCategories = getPowerAllowedRangeCategories;
export const getCharacterPowerAllowedTriggerConditionOptions = getPowerAllowedTriggerConditionOptions;
export const getCharacterPowerAllowedTimingOptions = getPowerAllowedTimingOptions;
export const getCharacterPowerAllowedDurationOptions = getPowerAllowedDurationOptions;
export const CHARACTER_POWER_FALLBACK_DAMAGE_TYPES = [
  { id: -101, name: "Slash", attackMode: "PHYSICAL" as const },
  { id: -102, name: "Pierce", attackMode: "PHYSICAL" as const },
  { id: -103, name: "Bludgeon", attackMode: "PHYSICAL" as const },
  { id: -201, name: "Psychic", attackMode: "MENTAL" as const },
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

function normalizeWoundChannelValue(value: unknown): EffectPacket["woundChannel"] {
  return ATTACK_MODES.includes(value as (typeof ATTACK_MODES)[number])
    ? (value as (typeof ATTACK_MODES)[number])
    : null;
}

function normalizePacketWoundChannel(
  intention: PowerIntention,
  details: Record<string, unknown>,
  raw: Record<string, unknown>,
): EffectPacket["woundChannel"] {
  if (intention === "ATTACK") {
    return oneOf(details.attackMode, ATTACK_MODES, "PHYSICAL");
  }
  if (intention === "HEALING") {
    return oneOf(details.healingMode, ATTACK_MODES, "PHYSICAL");
  }
  return normalizeWoundChannelValue(raw.woundChannel);
}

function isNumberOption(value: unknown, options: readonly number[]) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && options.includes(numeric);
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

function normalizeCommitmentModifier(value: unknown) {
  return normalizePowerCommitmentModifier(value);
}

function normalizeLifespanType(
  value: unknown,
  descriptorChassis: DescriptorChassisType,
  commitmentModifier?: Power["commitmentModifier"],
): NonNullable<Power["lifespanType"]> {
  const allowedOptions = getCharacterPowerAllowedLifespanOptions(descriptorChassis, commitmentModifier);
  return allowedOptions.includes(value as NonNullable<Power["lifespanType"]>)
    ? (value as NonNullable<Power["lifespanType"]>)
    : allowedOptions[0] ?? "NONE";
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

export function getCharacterPowerAllowedApplyToOptions(power: CharacterPower, packet: EffectPacket): EffectPacketApplyTo[] {
  if (packet.localTargetingOverride) return APPLY_TO_OPTIONS;
  const primaryPacket = power.effectPackets[0] ?? power.intentions?.[0] ?? null;
  const primaryDetails = asRecord(primaryPacket?.detailsJson);
  const range = normalizeRangeDetails(primaryDetails);
  const category = range.rangeCategory ?? power.rangeCategories?.[0] ?? "MELEE";
  if (!category) return ["SELF"];
  const meleeTargets = category === "MELEE"
    ? Math.max(1, range.rangeValue || power.meleeTargets || 1)
    : 1;
  const rangedTargets = category === "RANGED"
    ? asInteger(asRecord(range.rangeExtra).targets ?? power.rangedTargets, 1, 1, 20)
    : 1;
  if (category === "MELEE" && meleeTargets <= 1) return ["PRIMARY_TARGET", "SELF"];
  if (category === "RANGED" && rangedTargets <= 1) return ["PRIMARY_TARGET", "SELF"];
  return APPLY_TO_OPTIONS;
}

function defaultDetailsForIntention(intention: PowerIntention): Record<string, unknown> {
  switch (intention) {
    case "ATTACK":
      return { attackMode: "PHYSICAL", damageTypes: [] };
    case "DEFENCE":
      return { attackMode: "PHYSICAL", defenceMode: "Block" };
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
    const defenceMode = oneOf(details.defenceMode, DEFENCE_MODES, "Block");
    const resistedAttribute =
      defenceMode === "Resist"
        ? DEFENCE_RESISTED_ATTRIBUTES.includes(details.resistedAttribute as (typeof DEFENCE_RESISTED_ATTRIBUTES)[number])
          ? (details.resistedAttribute as (typeof DEFENCE_RESISTED_ATTRIBUTES)[number])
          : null
        : null;
    const nextDetails: Record<string, unknown> = {
      ...details,
      attackMode: oneOf(details.attackMode, ATTACK_MODES, "PHYSICAL"),
      defenceMode,
    };
    delete nextDetails.defenceCleanupTarget;
    if (resistedAttribute) {
      nextDetails.resistedAttribute = resistedAttribute;
    } else {
      delete nextDetails.resistedAttribute;
    }
    return nextDetails;
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

function readCharacterPowerOpaqueId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return id.length > 0 && id.length <= 200 ? id : undefined;
}

function createCharacterPowerOpaqueId(): string {
  return globalThis.crypto.randomUUID();
}

export function createDefaultCharacterPower(
  sortOrder = 0,
  options: { generateIds?: boolean } = {},
): CharacterPower {
  const generateIds = options.generateIds !== false;
  const packet = createDefaultCharacterPowerPacket("ATTACK", 0, { generateId: generateIds });
  return {
    ...(generateIds ? { id: createCharacterPowerOpaqueId() } : {}),
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
    restriction: null,
    sparkDiscountPercent: 0,
    restrictionDiscountPercent: 0,
  };
}

export function createDefaultCharacterPowerPacket(
  intention: PowerIntention,
  sortOrder = 0,
  options: { generateId?: boolean } = {},
): EffectPacket {
  const generateId = options.generateId !== false;
  const packet: EffectPacket = {
    ...(generateId ? { id: createCharacterPowerOpaqueId() } : {}),
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
    woundChannel: intention === "ATTACK" || intention === "HEALING" ? "PHYSICAL" : null,
    targetedAttribute: null,
    applicationModeKey: null,
    resolutionOrigin: "CASTER",
    applyTo: "PRIMARY_TARGET",
    secondaryDependencyMode: normalizeSecondaryDependencyMode(null, sortOrder),
    triggerConditionText: null,
    detailsJson: {
      ...defaultDetailsForIntention(intention),
      rangeCategory: "MELEE",
      rangeValue: 1,
      rangeExtra: {},
    },
    localTargetingOverride: null,
  };
  return isAugmentDebuffIntention(intention)
    ? createSemanticAugmentDebuffPacket(packet)
    : packet;
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
  const threeFieldValidationError = validateThreeFieldAugmentDebuffPacket(raw);
  if (threeFieldValidationError) throw new Error(threeFieldValidationError);
  const intention = oneOf(raw.intention ?? raw.type, POWER_INTENTIONS, "ATTACK");
  const baseDetails = {
    ...defaultDetailsForIntention(intention),
    ...asRecord(raw.detailsJson),
  };
  const rangeDetails = normalizeRangeDetails(baseDetails);
  const allowedTimingProbe: CharacterPower = {
    ...createDefaultCharacterPower(0, { generateIds: false }),
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
    getPowerPrimaryTimingForDescriptorChassis(
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
    ...createDefaultCharacterPowerPacket(intention, sortOrder, { generateId: false }),
    id: readCharacterPowerOpaqueId(raw.id),
    sortOrder,
    packetIndex: sortOrder,
    hostility: oneOf(raw.hostility, ["NON_HOSTILE", "HOSTILE"] as const, hostileDefault),
    intention,
    type: intention,
    specific: asString(raw.specific, "") || null,
    diceCount: asInteger(
      raw.diceCount,
      1,
      1,
      CHARACTER_POWER_MAX_DICE_COUNT,
    ),
    potency: asInteger(raw.potency, 1, 1, CHARACTER_POWER_MAX_POTENCY),
    modifier: raw.modifier == null ? null : Number(raw.modifier),
    effectTimingType: normalizedEffectTimingType,
    effectTimingTurns:
      normalizedEffectTimingType === "ON_TRIGGER" ? asInteger(raw.effectTimingTurns, 1, 1, 20) : null,
    effectDurationType: normalizedEffectDurationType,
    effectDurationTurns:
      normalizedEffectDurationType === "TURNS"
        ? asInteger(raw.effectDurationTurns, 1, 1, Number.MAX_SAFE_INTEGER)
        : null,
    dealsWounds: Boolean(raw.dealsWounds ?? intention === "ATTACK"),
    woundChannel: normalizePacketWoundChannel(intention, details, raw),
    targetedAttribute: normalizeCoreAttribute(raw.targetedAttribute ?? details.statTarget),
    applicationModeKey: asString(raw.applicationModeKey, "") || null,
    resolutionOrigin: oneOf(
      raw.resolutionOrigin,
      ["CASTER", "PRIMARY_TARGET", "ATTACHED_HOST", "FIELD_ORIGIN", "PACKET_LOCAL"] as const,
      "CASTER",
    ),
    applyTo,
    secondaryDependencyMode: normalizeSecondaryDependencyMode(raw.secondaryDependencyMode, sortOrder),
    triggerConditionText: asString(raw.triggerConditionText, "") || null,
    detailsJson: details,
    localTargetingOverride: raw.localTargetingOverride && typeof raw.localTargetingOverride === "object"
      ? (raw.localTargetingOverride as EffectPacket["localTargetingOverride"])
      : null,
  };
}

export function normalizeCharacterPower(
  value: unknown,
  sortOrder: number,
  expectedTargetTeamContext?: ExpectedTargetTeamContext | null,
): CharacterPower {
  const raw = asRecord(value);
  const descriptorChassis = oneOf(raw.descriptorChassis, DESCRIPTOR_CHASSIS, "IMMEDIATE");
  const commitmentModifier = normalizeCommitmentModifier(raw.commitmentModifier);
  const rawDescriptorChassisConfig = asRecord(raw.descriptorChassisConfig);
  const rawTriggerCondition = readPowerTriggerCondition(rawDescriptorChassisConfig.triggerConditionText);
  const rawAttachedHostileEntryPattern =
    asRecord(raw.primaryDefenceGate).hostileEntryPattern === "ON_ATTACH" ||
    asRecord(raw.primaryDefenceGate).hostileEntryPattern === "ON_PAYLOAD"
      ? asRecord(raw.primaryDefenceGate).hostileEntryPattern
      : rawDescriptorChassisConfig.hostileEntryPattern === "ON_ATTACH" ||
          rawDescriptorChassisConfig.hostileEntryPattern === "ON_PAYLOAD"
        ? rawDescriptorChassisConfig.hostileEntryPattern
        : null;
  const rawReserveReleaseBehaviour = readPowerReserveReleaseBehaviour(rawDescriptorChassisConfig.releaseBehaviour);
  const descriptorChassisConfig: Record<string, unknown> = {
    ...rawDescriptorChassisConfig,
    ...(descriptorChassis === "TRIGGER" && rawTriggerCondition
      ? {
          triggerConditionText: rawTriggerCondition,
        }
      : {}),
    ...(descriptorChassis === "ATTACHED"
      ? {
          ...(rawAttachedHostileEntryPattern ? { hostileEntryPattern: rawAttachedHostileEntryPattern } : {}),
          anchorText: asString(rawDescriptorChassisConfig.anchorText, "") || asString(raw.attachedHostAnchorType, "TARGET").toLowerCase(),
        }
      : {}),
    ...(descriptorChassis === "RESERVE" && rawReserveReleaseBehaviour
      ? {
          releaseBehaviour: rawReserveReleaseBehaviour,
        }
      : {}),
  };
  const packetsRaw = Array.isArray(raw.effectPackets)
    ? raw.effectPackets
    : Array.isArray(raw.intentions)
      ? raw.intentions
      : [];
  const packets: EffectPacket[] = [];
  const packetInputs = packetsRaw.length > 0
    ? packetsRaw.slice(0, 4)
    : [createDefaultCharacterPowerPacket("ATTACK", 0, { generateId: false })];
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
  const primaryPacket = packets[0] ?? createDefaultCharacterPowerPacket("ATTACK", 0, { generateId: false });
  const primaryDetails = asRecord(primaryPacket.detailsJson);
  const range = normalizeRangeDetails(primaryDetails);
  const rangeCategories =
    range.rangeCategory === "SELF" ? [] : [range.rangeCategory as RangeCategory];
  const effectDurationType = oneOf(raw.effectDurationType ?? raw.durationType, EFFECT_DURATIONS, "INSTANT");
  const lifespanType = normalizeLifespanType(raw.lifespanType, descriptorChassis, commitmentModifier);
  const primaryDefenceGate = derivePrimaryDefenceGateForPower(
    descriptorChassis,
    descriptorChassisConfig,
    packets,
  );
  const gateResult = primaryDefenceGate?.gateResult ?? "NONE";
  const cooldownTurns = asInteger(raw.cooldownTurns, 1, 1, Number.MAX_SAFE_INTEGER);
  const cooldownReduction = asInteger(
    raw.cooldownReduction,
    0,
    0,
    Math.max(0, cooldownTurns - 1),
  );

  const normalized: CharacterPower = {
    ...createDefaultCharacterPower(sortOrder, { generateIds: false }),
    id: readCharacterPowerOpaqueId(raw.id),
    sortOrder,
    name: asString(raw.name, "").slice(0, 120),
    description: asString(raw.description, "").slice(0, 1000) || null,
    descriptorChassis,
    descriptorChassisConfig,
    cooldownTurns,
    cooldownReduction,
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
        ? asInteger(raw.chargeBonusDicePerTurn, 1, 1, 10)
        : null,
    lifespanType,
    lifespanTurns:
      lifespanType === "TURNS" ? asInteger(raw.lifespanTurns, 1, 1, 10) : null,
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
      effectDurationType === "TURNS"
        ? asInteger(raw.effectDurationTurns, 1, 1, CHARACTER_POWER_MAX_PACKET_DURATION_TURNS)
        : null,
    durationType: effectDurationType,
    durationTurns:
      effectDurationType === "TURNS"
        ? asInteger(raw.effectDurationTurns, 1, 1, CHARACTER_POWER_MAX_PACKET_DURATION_TURNS)
        : null,
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
    restriction: normalizeCharacterPowerRestriction(raw).definition,
    sparkDiscountPercent: 0,
    restrictionDiscountPercent: 0,
  };
  return applyAutomaticExpectedTargetsToPower(normalized, expectedTargetTeamContext);
}

export function normalizeCharacterPowers(
  value: unknown,
  expectedTargetTeamContext?: ExpectedTargetTeamContext | null,
): CharacterPower[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((power, index) =>
    normalizeCharacterPower(power, index, expectedTargetTeamContext));
}

function prepareCharacterPowerIdForPersistence(power: CharacterPower): CharacterPower {
  const effectPackets = power.effectPackets.map((packet) => ({
    ...packet,
    id: readCharacterPowerOpaqueId(packet.id) ?? createCharacterPowerOpaqueId(),
  }));
  return {
    ...power,
    id: readCharacterPowerOpaqueId(power.id) ?? createCharacterPowerOpaqueId(),
    effectPackets,
    intentions: effectPackets,
  };
}

export function prepareCharacterPowerIdsForPersistence(params: {
  powers: readonly CharacterPower[];
  signatureMove: CharacterPower | null;
}): { powers: CharacterPower[]; signatureMove: CharacterPower | null } {
  return {
    powers: params.powers.map(prepareCharacterPowerIdForPersistence),
    signatureMove: params.signatureMove
      ? prepareCharacterPowerIdForPersistence(params.signatureMove)
      : null,
  };
}

export function powerPointPool(level: number) {
  return Math.max(1, Math.trunc(level || 1)) * 50;
}

export function signatureMovePointPool(level: number) {
  return Math.max(1, Math.trunc(level || 1)) * 20;
}

function budgetShareCooldownFloor(budgetShare: number): number {
  if (budgetShare <= 0.25) return 1;
  if (budgetShare <= 0.5) return 2;
  if (budgetShare <= 0.75) return 3;
  if (budgetShare <= 1) return 4;
  return 5;
}

export function deriveCharacterPowerBudgetCooldownPressure(params: {
  spend: number | null;
  powerPool: number;
  poolKind: CharacterPowerPoolKind;
  baseCooldownTurns: number | null;
  maxCooldownTurns?: number | null;
}): CharacterPowerBudgetCooldownPressure | null {
  if (
    typeof params.spend !== "number" ||
    !Number.isFinite(params.spend) ||
    params.spend < 0 ||
    !Number.isFinite(params.powerPool) ||
    params.powerPool <= 0 ||
    typeof params.baseCooldownTurns !== "number" ||
    !Number.isFinite(params.baseCooldownTurns) ||
    params.baseCooldownTurns < 1
  ) {
    return null;
  }
  const poolSize = Math.max(1, Math.trunc(params.powerPool));
  const baseCooldownTurns = Math.max(1, Math.trunc(params.baseCooldownTurns));
  const maxCooldownTurns =
    typeof params.maxCooldownTurns === "number" && Number.isFinite(params.maxCooldownTurns)
      ? Math.max(1, Math.trunc(params.maxCooldownTurns))
      : 5;
  const budgetShare = Math.max(0, params.spend) / poolSize;
  const budgetCooldownFloor = Math.min(maxCooldownTurns, budgetShareCooldownFloor(budgetShare));
  const finalCooldownTurns = Math.max(baseCooldownTurns, budgetCooldownFloor);
  return {
    poolKind: params.poolKind,
    poolSize,
    spend: Math.round(params.spend * 100) / 100,
    budgetShare: Math.round(budgetShare * 10000) / 10000,
    budgetSharePercent: Math.round(budgetShare * 10000) / 100,
    baseCooldownTurns,
    budgetCooldownFloor,
    finalCooldownTurns,
    raisedByBudgetShare: finalCooldownTurns > baseCooldownTurns,
  };
}

function readPacketOffencePressure(packet: PowerCostPacketBreakdown): ResolvedOffencePressure | null {
  const magnitude = packet.debug.magnitude;
  if (!magnitude || typeof magnitude !== "object") return null;
  const pressure = (magnitude as { offencePressure?: unknown }).offencePressure;
  if (!pressure || typeof pressure !== "object") return null;
  return pressure as ResolvedOffencePressure;
}

function collectOffencePressureWarnings(params: {
  resolvedPower: { breakdown?: { packetCosts?: PowerCostPacketBreakdown[]; basePowerValue?: number } } | undefined;
  playerPowerSpendScalar: number;
  powerPool: number;
  offencePressureMode: PowerCostContext["offencePressureMode"];
  offencePressureDie?: CombatDieSize | null;
}): string[] {
  const packetPressures =
    params.resolvedPower?.breakdown?.packetCosts?.flatMap((packet) => {
      const pressure = readPacketOffencePressure(packet);
      return pressure ? [pressure] : [];
    }) ?? [];
  if (packetPressures.length === 0) return [];

  const warnings: string[] = [];
  const reviewOnlySurcharge = packetPressures.reduce(
    (sum, pressure) => sum + Math.max(0, pressure.basePowerValueSurcharge ?? 0),
    0,
  );
  for (const pressure of packetPressures) {
    const displayPressure = params.offencePressureDie
      ? analyzeOffencePressure({
          diceCount: pressure.diceCount,
          woundsPerSuccess: pressure.woundsPerSuccess,
          die: params.offencePressureDie,
        })
      : pressure;
    if (displayPressure.warningLevel === "none" && pressure.basePowerValueSurcharge <= 0) continue;
    const costText = pressure.appliedBasePowerValueSurcharge && pressure.appliedBasePowerValueSurcharge > 0
      ? ` Offence pressure added +${pressure.appliedBasePowerValueSurcharge} BasePowerValue.`
      : "";
    const reviewOnlyText = params.offencePressureMode === "reviewOnly"
      ? " Signature review-only: this warning does not hard-block saving by itself."
      : "";
    if (displayPressure.warningLevel === "extremeP20Review") {
      const subject = params.offencePressureMode === "reviewOnly" ? "this Signature Move" : "this power";
      warnings.push(
        `Extreme burst review: ${subject} can exceed major durability thresholds. GD/Architect review recommended.${reviewOnlyText}`,
      );
    } else if (displayPressure.warningLevel === "burstWarning") {
      warnings.push(
        `Burst warning: this power can heavily pressure Soldier/Elite durability.${costText}${reviewOnlyText}`,
      );
    } else {
      warnings.push(`High offence pressure: review damage output.${costText}${reviewOnlyText}`);
    }
  }
  if (params.offencePressureMode === "reviewOnly" && reviewOnlySurcharge > 0) {
    const basePowerValue = params.resolvedPower?.breakdown?.basePowerValue ?? 0;
    const projectedSpend = calculateCharacterPlayerPowerSpend(
      basePowerValue + reviewOnlySurcharge,
      params.playerPowerSpendScalar,
    );
    warnings.push(
      projectedSpend > params.powerPool
        ? `Signature Move offence review: projected hybrid spend ${projectedSpend} would exceed pool ${params.powerPool}; first production pass records this as review-only.`
        : `Signature Move offence review: projected hybrid spend ${projectedSpend} against pool ${params.powerPool}; first production pass records this as review-only.`,
    );
  }
  return Array.from(new Set(warnings));
}

function collectCharacterPowerValidationErrors(power: CharacterPower) {
  const errors: string[] = [];
  const primaryPacket = power.effectPackets[0];
  const primaryDetails = asRecord(primaryPacket?.detailsJson);
  const primaryRangeCategory = oneOf(
    primaryDetails.rangeCategory,
    ["SELF", ...RANGE_CATEGORIES] as const,
    power.rangeCategories?.[0] ?? "MELEE",
  );
  const primaryRangeExtra = asRecord(primaryDetails.rangeExtra);
  const allowedCommitments = getCharacterPowerAllowedCommitmentOptions(power.descriptorChassis ?? "IMMEDIATE");
  const allowedCounters = getCharacterPowerAllowedCounterOptions({
    descriptorChassis: power.descriptorChassis ?? "IMMEDIATE",
    commitmentModifier: power.commitmentModifier,
    chargeType: power.chargeType,
  });
  const allowedLifespans = getCharacterPowerAllowedLifespanOptions(
    power.descriptorChassis ?? "IMMEDIATE",
    power.commitmentModifier,
  );
  const allowedRangeCategories = getCharacterPowerAllowedRangeCategories({
    descriptorChassis: power.descriptorChassis ?? "IMMEDIATE",
    attachedHostAnchorType: power.attachedHostAnchorType,
  });

  if (!power.name.trim()) errors.push("Power name is required.");
  if ((power.sparkDiscountPercent ?? 0) !== 0) {
    errors.push("Spark discounts are not implemented yet.");
  }
  if ((power.restrictionDiscountPercent ?? 0) !== 0) {
    errors.push("Restriction discounts are not implemented yet.");
  }
  if (!allowedCommitments.includes((power.commitmentModifier ?? "STANDARD") as NonNullable<Power["commitmentModifier"]>)) {
    errors.push(`${power.commitmentModifier} commitment is not legal for ${power.descriptorChassis} powers.`);
  }
  if (!allowedCounters.includes((power.counterMode ?? "NO") as NonNullable<Power["counterMode"]>)) {
    errors.push("Counter is not legal for this chassis/commitment combination.");
  }
  if (!allowedLifespans.includes((power.lifespanType ?? "NONE") as NonNullable<Power["lifespanType"]>)) {
    errors.push("Lifespan is not legal for this chassis/commitment combination.");
  }
  if (!allowedRangeCategories.includes(primaryRangeCategory)) {
    errors.push("Range category is not legal for this attached host/anchor.");
  }
  if (primaryRangeCategory === "MELEE" && !isNumberOption(primaryDetails.rangeValue ?? power.meleeTargets, POWER_RANGE_TARGET_OPTIONS)) {
    errors.push("Melee target count must use the shared Summoning Circle target options.");
  }
  if (primaryRangeCategory === "RANGED") {
    if (!isNumberOption(primaryDetails.rangeValue ?? power.rangedDistanceFeet, POWER_RANGE_RANGED_DISTANCE_OPTIONS)) {
      errors.push("Ranged distance must use the shared Summoning Circle distance options.");
    }
    if (!isNumberOption(primaryRangeExtra.targets ?? power.rangedTargets, POWER_RANGE_TARGET_OPTIONS)) {
      errors.push("Ranged target count must use the shared Summoning Circle target options.");
    }
  }
  if (primaryRangeCategory === "AOE") {
    const aoeShape = oneOf(primaryRangeExtra.shape, ["SPHERE", "CONE", "LINE"] as const, "SPHERE");
    if (!isNumberOption(primaryDetails.rangeValue ?? power.aoeCenterRangeFeet, POWER_RANGE_AOE_CENTER_RANGE_OPTIONS)) {
      errors.push("AoE cast range must use the shared Summoning Circle range options.");
    }
    if (!isNumberOption(primaryRangeExtra.count ?? power.aoeCount, POWER_RANGE_TARGET_OPTIONS)) {
      errors.push("AoE count must use the shared Summoning Circle count options.");
    }
    if (!POWER_RANGE_AOE_SHAPES.includes(aoeShape)) {
      errors.push("AoE shape must use the shared Summoning Circle shape options.");
    }
    if (
      aoeShape === "SPHERE" &&
      !isNumberOption(primaryRangeExtra.sphereRadiusFeet ?? power.aoeSphereRadiusFeet, POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS)
    ) {
      errors.push("AoE sphere radius must use the shared Summoning Circle radius options.");
    }
    if (
      aoeShape === "CONE" &&
      !isNumberOption(primaryRangeExtra.coneLengthFeet ?? power.aoeConeLengthFeet, POWER_RANGE_AOE_CONE_LENGTH_OPTIONS)
    ) {
      errors.push("AoE cone length must use the shared Summoning Circle length options.");
    }
    if (aoeShape === "LINE") {
      if (!isNumberOption(primaryRangeExtra.lineWidthFeet ?? power.aoeLineWidthFeet, POWER_RANGE_AOE_LINE_WIDTH_OPTIONS)) {
        errors.push("AoE line width must use the shared Summoning Circle width options.");
      }
      if (!isNumberOption(primaryRangeExtra.lineLengthFeet ?? power.aoeLineLengthFeet, POWER_RANGE_AOE_LINE_LENGTH_OPTIONS)) {
        errors.push("AoE line length must use the shared Summoning Circle length options.");
      }
    }
  }
  if ((power.descriptorChassis ?? "IMMEDIATE") === "FIELD") {
    if (primaryRangeCategory !== "AOE") {
      errors.push("Field powers must use AoE range.");
    }
    const aoeShape = oneOf(primaryRangeExtra.shape, ["SPHERE", "CONE", "LINE"] as const, "SPHERE");
    const hasAoeCount = Number(primaryRangeExtra.count ?? power.aoeCount) >= 1;
    const hasGeometry =
      aoeShape === "SPHERE"
        ? Number(primaryRangeExtra.sphereRadiusFeet ?? power.aoeSphereRadiusFeet) >= 0
        : aoeShape === "CONE"
          ? Number(primaryRangeExtra.coneLengthFeet ?? power.aoeConeLengthFeet) >= 0
          : Number(primaryRangeExtra.lineWidthFeet ?? power.aoeLineWidthFeet) >= 0 &&
            Number(primaryRangeExtra.lineLengthFeet ?? power.aoeLineLengthFeet) >= 0;
    if (!hasAoeCount || !hasGeometry) {
      errors.push("Field powers require AoE count, shape, and geometry.");
    }
  }
  if ((power.descriptorChassis ?? "IMMEDIATE") === "TRIGGER") {
    const triggerCondition = readPowerTriggerCondition(
      primaryPacket?.triggerConditionText ?? asRecord(power.descriptorChassisConfig).triggerConditionText,
    );
    if (!triggerCondition) {
      errors.push("Trigger powers require a trigger condition.");
    } else if (
      power.triggerMethod === "TARGET_AND_THEN_ARM" &&
      primaryRangeCategory !== "AOE" &&
      POWER_TRIGGER_AREA_PRESENCE_KEYS.has(triggerCondition)
    ) {
      errors.push("Area trigger conditions require AoE range when using Target and then arm.");
    }
  }
  if ((power.descriptorChassis ?? "IMMEDIATE") === "RESERVE" && !isPowerReserveReleaseBehaviourReady(power)) {
    errors.push("Reserve powers require a Release Behaviour selection.");
  }
  if ((power.descriptorChassis ?? "IMMEDIATE") === "ATTACHED" && !isPowerAttachedHostileEntryReady(power)) {
    errors.push("Attached hostile powers require an Attached Hostile Entry selection.");
  }

  for (const [packetIndex, packet] of power.effectPackets.entries()) {
    const packetLabel = `Packet ${packetIndex + 1}`;
    if (!isCharacterBuilderV1PowerIntention(packet.intention)) {
      errors.push(`${packetLabel} ${packet.intention} is not supported by the Character Builder power authoring surface.`);
    }
    if (packetIndex > 0 && (packet.diceCount ?? 1) !== 1) {
      errors.push(`${packetLabel} secondary packet dice are derived by the shared power authoring surface and cannot be independently authored.`);
    }
    if (packetIndex > 0 && packet.secondaryDependencyMode === "TRIGGERED_CONDITIONAL" && !asString(packet.triggerConditionText, "")) {
      errors.push(`${packetLabel} triggered / conditional dependency requires a trigger condition.`);
    }
    const allowedTimings = getCharacterPowerAllowedTimingOptions(power, packetIndex);
    if (!isPowerPacketTimingAuthorable(power, packetIndex)) {
      errors.push(`${packetLabel} timing requires an Attached Hostile Entry selection.`);
    }
    if (!allowedTimings.includes((packet.effectTimingType ?? "ON_CAST") as EffectTimingType)) {
      errors.push(`${packetLabel} timing is not legal for this chassis.`);
    }
    const allowedDurations = getCharacterPowerAllowedDurationOptions(packet.effectTimingType);
    if (!allowedDurations.includes((packet.effectDurationType ?? "INSTANT") as EffectDurationType)) {
      errors.push(`${packetLabel} duration is not legal for this timing.`);
    }
    if (
      (packet.effectDurationType ?? "INSTANT") === "TURNS" &&
      (packet.effectDurationTurns ?? 1) > CHARACTER_POWER_MAX_PACKET_DURATION_TURNS
    ) {
      errors.push(`${packetLabel} duration turns cannot exceed ${CHARACTER_POWER_MAX_PACKET_DURATION_TURNS}.`);
    }
    const details = asRecord(packet.detailsJson);
    errors.push(...getModifierAuthoringPacketErrors({
      packet,
      packetIndex,
      requiresExpectedTargets: primaryRangeCategory === "AOE",
    }));
    const semanticRuntimeSupportError = getSemanticRuntimeSupportError({
      descriptorChassis: power.descriptorChassis,
      packet,
      packetIndex,
      primaryPacket: power.effectPackets[0],
    });
    if (semanticRuntimeSupportError) errors.push(semanticRuntimeSupportError);
    if (packet.intention === "ATTACK") {
      const damageTypes = uniqueStrings(details.damageTypes, MAX_DAMAGE_TYPES);
      if (damageTypes.length === 0) {
        errors.push(`${packetLabel} Attack requires at least one damage type.`);
      }
      if (damageTypes.length > MAX_DAMAGE_TYPES) {
        errors.push(`${packetLabel} Attack can select at most ${MAX_DAMAGE_TYPES} damage types.`);
      }
    }
    if (packet.intention === "DEFENCE") {
      const defenceMode = oneOf(details.defenceMode, DEFENCE_MODES, "Block");
      if (!DEFENCE_MODES.includes(defenceMode)) {
        errors.push(`${packetLabel} Defence requires a supported Defence Type.`);
      }
      if (
        defenceMode === "Resist" &&
        !DEFENCE_RESISTED_ATTRIBUTES.includes(details.resistedAttribute as (typeof DEFENCE_RESISTED_ATTRIBUTES)[number])
      ) {
        errors.push(`${packetLabel} Resist requires a resisted attribute.`);
      }
    }
    if ((packet.intention === "AUGMENT" || packet.intention === "DEBUFF") && !normalizeCoreAttribute(details.statTarget)) {
      errors.push(`${packetLabel} ${packet.intention === "AUGMENT" ? "Augment" : "Debuff"} requires a stat.`);
    }
    if (packet.effectTimingType === "ON_TRIGGER") {
      const triggerCondition = asString(packet.triggerConditionText, "");
      if (!triggerCondition) {
        errors.push(`${packetLabel} On Trigger timing requires a trigger condition.`);
      } else if (!readPowerTriggerCondition(triggerCondition)) {
        errors.push(`${packetLabel} trigger condition is not supported.`);
      } else if (isPowerAreaTriggerCondition(triggerCondition) && primaryRangeCategory !== "AOE") {
        errors.push(`${packetLabel} area trigger condition requires an AoE range.`);
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
  powerPool?: number | null;
  powerPoolKind?: CharacterPowerPoolKind;
  offencePressureMode?: PowerCostContext["offencePressureMode"];
  offencePressureDie?: CombatDieSize | null;
  cooldownAuthorityMode?: PowerCooldownAuthorityMode;
  expectedTargetTeamContext?: ExpectedTargetTeamContext | null;
}): CharacterPowerBudget {
  const playerPowerSpendScalar = normalizeCharacterPowerSpendScalar(
    params.playerPowerSpendScalar ?? DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  );
  const powerPool = params.powerPool ?? powerPointPool(params.level);
  const powerPoolKind = params.powerPoolKind ?? "normal";
  const offencePressureMode = params.offencePressureMode === "reviewOnly" ? "reviewOnly" : "costing";
  const cooldownAuthorityMode =
    params.cooldownAuthorityMode ?? "ACTIVE_CURRENT_BALANCE";
  const normalizedPowers = params.powers.map((power, index) =>
    normalizeCharacterPower(power, index, params.expectedTargetTeamContext),
  );
  const hasAuthorityTuning =
    cooldownAuthorityMode === "EXPLICIT_BUILTIN_PREVIEW" || Boolean(params.tuningSnapshot);
  const authoringErrors = normalizedPowers.map(collectCharacterPowerValidationErrors);
  const economicErrors = normalizedPowers.map(() => [] as string[]);
  const resolvedPowers = normalizedPowers.map((power, index) => {
    if (!hasAuthorityTuning) {
      economicErrors[index].push(
        "Active power tuning is required to resolve current-balance power cost and cooldown.",
      );
      return null;
    }
    try {
      return resolvePowerCosts(
        [power],
        cooldownAuthorityMode === "ACTIVE_CURRENT_BALANCE"
          ? params.tuningSnapshot!
          : { values: undefined },
        {
          level: params.level,
          tier: "SOLDIER",
          offencePressureMode,
        },
      ).powers[0] ?? null;
    } catch (error) {
      economicErrors[index].push(
        error instanceof Error ? error.message : "Power cost resolution failed.",
      );
      return null;
    }
  });
  const summaries = normalizedPowers.map((power, index) => {
    const resolvedPower = resolvedPowers[index] ?? undefined;
    const descriptorLines = renderPowerDescriptorLines(power);
    const errors = [...authoringErrors[index], ...economicErrors[index]];
    const warnings: string[] = [];
    if (descriptorLines.length === 0) warnings.push("Power descriptor is empty.");
    const costValid = Boolean(resolvedPower);
    const basePowerValue = costValid ? (resolvedPower?.breakdown.basePowerValue ?? null) : null;
    const spend =
      basePowerValue === null
        ? null
        : calculateCharacterPlayerPowerSpend(basePowerValue, playerPowerSpendScalar);
    const baseDerivedCooldownTurns = costValid ? (resolvedPower?.derivedCooldownTurns ?? null) : null;
    const budgetCooldownPressure = deriveCharacterPowerBudgetCooldownPressure({
      spend,
      powerPool,
      poolKind: powerPoolKind,
      baseCooldownTurns: baseDerivedCooldownTurns,
      maxCooldownTurns: resolvedPower?.derivedCooldown?.maxTurns ?? null,
    });
    warnings.push(...collectOffencePressureWarnings({
      resolvedPower,
      playerPowerSpendScalar,
      powerPool,
      offencePressureMode,
      offencePressureDie: params.offencePressureDie,
    }));
    if (budgetCooldownPressure?.raisedByBudgetShare) {
      warnings.push(
        `${powerPoolKind === "signature" ? "Signature Move" : "Power"} budget pressure raised derived cooldown from ${budgetCooldownPressure.baseCooldownTurns} to ${budgetCooldownPressure.finalCooldownTurns} (${budgetCooldownPressure.budgetSharePercent}% of pool ${budgetCooldownPressure.poolSize}).`,
      );
    }
    const cooldownAuthority = resolvePowerCooldownAuthority({
      power,
      mode: cooldownAuthorityMode,
      tuningSnapshot: params.tuningSnapshot,
      context: {
        level: params.level,
        tier: "SOLDIER",
        offencePressureMode,
      },
      minimumCooldownTurns: budgetCooldownPressure?.finalCooldownTurns ?? null,
    });
    if (!cooldownAuthority.ok) {
      warnings.push(cooldownAuthority.message);
    } else {
      warnings.push(...cooldownAuthority.result.warnings);
    }
    return {
      power,
      descriptorLines,
      basePowerValue,
      spend,
      playerPowerSpendScalar,
      derivedCooldownTurns: budgetCooldownPressure?.finalCooldownTurns ?? baseDerivedCooldownTurns,
      baseDerivedCooldownTurns,
      budgetCooldownPressure,
      costValid,
      invalidCostReason: costValid
        ? null
        : economicErrors[index][0] ?? "Power cost resolution failed.",
      errors,
      warnings,
      cooldownAuthority,
    };
  });
  const totalSpent = Math.round(summaries.reduce((sum, row) => sum + (row.spend ?? 0), 0) * 100) / 100;
  return {
    powerPool,
    playerPowerSpendScalar,
    totalSpent,
    remaining: Math.round((powerPool - totalSpent) * 100) / 100,
    overspent: totalSpent > powerPool,
    powers: summaries,
    cooldownAuthorityMode,
  };
}

export type CharacterPowerCooldownCacheSynchronizationResult =
  | {
      ok: true;
      powers: CharacterPower[];
      signatureMove: CharacterPower | null;
      normalAuthorities: PowerCooldownAuthorityResult[];
      signatureAuthority: PowerCooldownAuthorityResult | null;
    }
  | (PowerCooldownCacheSynchronizationFailure & {
      scope: "power" | "signature";
      powerIndex: number;
      powerName: string;
    });

export function synchronizeCharacterPowerCooldownCaches(params: {
  level: number;
  powers: readonly CharacterPower[];
  signatureMove: CharacterPower | null;
  tuningSnapshot?: PowerTuningSnapshot | null;
  playerPowerSpendScalar?: number;
  expectedTargetTeamContext?: ExpectedTargetTeamContext | null;
}): CharacterPowerCooldownCacheSynchronizationResult {
  const normalSummary = summarizeCharacterPowers({
    level: params.level,
    powers: [...params.powers],
    tuningSnapshot: params.tuningSnapshot,
    playerPowerSpendScalar: params.playerPowerSpendScalar,
    cooldownAuthorityMode: "ACTIVE_CURRENT_BALANCE",
    expectedTargetTeamContext: params.expectedTargetTeamContext,
  });
  const powers: CharacterPower[] = [];
  const normalAuthorities: PowerCooldownAuthorityResult[] = [];
  for (const [powerIndex, submittedPower] of params.powers.entries()) {
    const power = normalSummary.powers[powerIndex]?.power ??
      normalizeCharacterPower(submittedPower, powerIndex, params.expectedTargetTeamContext);
    const resolution = normalSummary.powers[powerIndex]?.cooldownAuthority;
    if (!resolution) {
      return {
        ok: false,
        errorCode: "COOLDOWN_DERIVATION_FAILED",
        message: `Power "${power.name}" cooldown derivation returned no summary result.`,
        storedCooldownTurns: null,
        scope: "power",
        powerIndex,
        powerName: power.name,
      };
    }
    const synchronized = applyResolvedPowerCooldownCache(power, resolution);
    if (!synchronized.ok) {
      return {
        ...synchronized,
        scope: "power",
        powerIndex,
        powerName: power.name,
      };
    }
    powers.push(synchronized.power as CharacterPower);
    normalAuthorities.push(synchronized.authority);
  }

  if (!params.signatureMove) {
    return {
      ok: true,
      powers,
      signatureMove: null,
      normalAuthorities,
      signatureAuthority: null,
    };
  }

  const signatureSummary = summarizeCharacterPowers({
    level: params.level,
    powers: [params.signatureMove],
    tuningSnapshot: params.tuningSnapshot,
    playerPowerSpendScalar: params.playerPowerSpendScalar,
    powerPool: signatureMovePointPool(params.level),
    powerPoolKind: "signature",
    offencePressureMode: "reviewOnly",
    cooldownAuthorityMode: "ACTIVE_CURRENT_BALANCE",
    expectedTargetTeamContext: params.expectedTargetTeamContext,
  });
  const signatureResolution = signatureSummary.powers[0]?.cooldownAuthority;
  if (!signatureResolution) {
    return {
      ok: false,
      errorCode: "COOLDOWN_DERIVATION_FAILED",
      message: `Signature Move "${params.signatureMove.name}" cooldown derivation returned no summary result.`,
      storedCooldownTurns: null,
      scope: "signature",
      powerIndex: 0,
      powerName: params.signatureMove.name,
    };
  }
  const synchronizedSignature = applyResolvedPowerCooldownCache(
    signatureSummary.powers[0]?.power ??
      normalizeCharacterPower(params.signatureMove, 0, params.expectedTargetTeamContext),
    signatureResolution,
  );
  if (!synchronizedSignature.ok) {
    return {
      ...synchronizedSignature,
      scope: "signature",
      powerIndex: 0,
      powerName: params.signatureMove.name,
    };
  }
  return {
    ok: true,
    powers,
    signatureMove: synchronizedSignature.power as CharacterPower,
    normalAuthorities,
    signatureAuthority: synchronizedSignature.authority,
  };
}

export function validateCharacterPowers(params: {
  level: number;
  powers: CharacterPower[];
  tuningSnapshot?: PowerTuningSnapshot | null;
  playerPowerSpendScalar?: number | null;
  powerPool?: number | null;
  powerPoolKind?: CharacterPowerPoolKind;
  powerLabel?: string;
  poolDescription?: string;
  offencePressureMode?: PowerCostContext["offencePressureMode"];
  cooldownAuthorityMode?: PowerCooldownAuthorityMode;
  expectedTargetTeamContext?: ExpectedTargetTeamContext | null;
}) {
  const summary = summarizeCharacterPowers(params);
  const powerLabel = params.powerLabel ?? "Power";
  const errors = summary.powers.flatMap((row, index) =>
    row.errors.map((error) => `${powerLabel} ${index + 1}: ${error}`),
  );
  if (summary.overspent) {
    errors.push(`Total ${powerLabel} Point spend cannot exceed ${params.poolDescription ?? "Character Level x 50"}.`);
  }
  return Array.from(new Set(errors));
}
