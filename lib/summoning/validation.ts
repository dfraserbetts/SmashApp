import type {
  CoreAttribute,
  DiceSize,
  EffectDurationType,
  EffectPacket,
  LimitBreakTier,
  MonsterAttack,
  MonsterNaturalAttackConfig,
  MonsterTier,
  MonsterUpsertInput,
  Power,
  PowerIntention,
  PowerLifespanType,
  PrimaryDefenceGate,
  PrimaryDefenceGateResult,
  ResistTheme,
  ReserveReleaseBehaviour,
  TriggerConditionKey,
} from "@/lib/summoning/types";
import {
  LEGACY_TRIGGER_CONDITION_TEXT_KEY as LEGACY_TRIGGER_CONDITION_TEXT_KEY_VALUE,
  MAX_POWER_PACKET_DAMAGE_TYPES,
  RESERVE_RELEASE_BEHAVIOUR_OPTIONS,
  RESIST_THEME_VALUES,
  TRIGGER_CONDITION_KEYS,
} from "@/lib/summoning/types";

const DICE_SET = new Set<DiceSize>(["D4", "D6", "D8", "D10", "D12"]);
const TIER_SET = new Set<MonsterTier>(["MINION", "SOLDIER", "ELITE", "BOSS"]);
const LIMIT_BREAK_TIER_SET = new Set<LimitBreakTier>(["PUSH", "BREAK", "TRANSCEND"]);
const CORE_ATTRIBUTE_SET = new Set<CoreAttribute>([
  "ATTACK",
  "DEFENCE",
  "FORTITUDE",
  "INTELLECT",
  "SUPPORT",
  "BRAVERY",
]);
const EFFECT_DURATION_SET = new Set<EffectDurationType>([
  "INSTANT",
  "TURNS",
  "PASSIVE",
  "UNTIL_TARGET_NEXT_TURN",
]);
const PRIMARY_GATE_SET = new Set<PrimaryDefenceGateResult>([
  "NONE",
  "DODGE",
  "PROTECTION",
  "DODGE_OR_PROTECTION",
  "RESIST",
]);
const LIFESPAN_SET = new Set<PowerLifespanType>(["NONE", "TURNS", "PASSIVE"]);
const COUNTER_MODE_SET = new Set<NonNullable<Power["counterMode"]>>(["NO", "YES"]);
const COMMITMENT_MODIFIER_SET = new Set<NonNullable<Power["commitmentModifier"]>>([
  "STANDARD",
  "CHANNEL",
  "CHARGE",
]);
const CHARGE_TYPE_SET = new Set(["DELAYED_RELEASE", "BUILD_POWER"]);
const TRIGGER_METHOD_SET = new Set(["ARM_AND_THEN_TARGET", "TARGET_AND_THEN_ARM"]);
const RESIST_THEME_SET = new Set<ResistTheme>(RESIST_THEME_VALUES);
const RESERVE_RELEASE_BEHAVIOUR_SET = new Set<ReserveReleaseBehaviour>(RESERVE_RELEASE_BEHAVIOUR_OPTIONS);
const LEGACY_TRIGGER_CONDITION_KEY: typeof LEGACY_TRIGGER_CONDITION_TEXT_KEY_VALUE =
  LEGACY_TRIGGER_CONDITION_TEXT_KEY_VALUE;
const TRIGGER_CONDITION_SET = new Set<TriggerConditionKey>(TRIGGER_CONDITION_KEYS);
const TRIGGER_AREA_PRESENCE_KEYS = new Set<TriggerConditionKey>([
  "AREA_ENTERS",
  "AREA_LEAVES",
  "AREA_STARTS_TURN",
  "AREA_ENDS_TURN",
]);
const ATTACHED_HOST_ANCHOR_TYPE_SET = new Set(["TARGET", "OBJECT", "WEAPON", "ARMOR", "SELF", "AREA"]);
const EFFECT_PACKET_APPLY_TO_SET = new Set(["PRIMARY_TARGET", "ALLIES", "SELF"]);
const EFFECT_TIMING_SET = new Set<string>([
  "ON_CAST",
  "ON_TRIGGER",
  "ON_ATTACH",
  "START_OF_TURN",
  "END_OF_TURN",
  "START_OF_TURN_WHILST_CHANNELLED",
  "END_OF_TURN_WHILST_CHANNELLED",
  "ON_RELEASE",
  "ON_EXPIRY",
]);
const INTENTION_SET = new Set<PowerIntention>([
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
]);

function asInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNullableString(value: unknown): string | null {
  const normalized = asString(value, "");
  return normalized.length > 0 ? normalized : null;
}

function normalizeTriggerConditionKey(
  value: unknown,
): TriggerConditionKey | null {
  return TRIGGER_CONDITION_SET.has(value as TriggerConditionKey)
    ? (value as TriggerConditionKey)
    : null;
}

function mapLegacyTriggerConditionTextToKey(
  value: unknown,
): TriggerConditionKey | null {
  const normalized = asString(value, "").toLowerCase();
  if (!normalized) return null;
  if (
    /(crosses?|enters?)\b/.test(normalized) &&
    /\b(area|warded space|targeted space)\b/.test(normalized)
  ) {
    return "AREA_ENTERS";
  }
  if (/\bleaves?\b/.test(normalized) && /\b(area|warded space|targeted space)\b/.test(normalized)) {
    return "AREA_LEAVES";
  }
  if (
    /\bstarts?\b/.test(normalized) &&
    /\bturn\b/.test(normalized) &&
    /\b(area|warded space|targeted space)\b/.test(normalized)
  ) {
    return "AREA_STARTS_TURN";
  }
  if (
    /\bends?\b/.test(normalized) &&
    /\bturn\b/.test(normalized) &&
    /\b(area|warded space|targeted space)\b/.test(normalized)
  ) {
    return "AREA_ENDS_TURN";
  }
  if (/\bmoves?\b/.test(normalized)) return "MOVES";
  if (/\bmakes? an attack\b|\bweapon attack\b|\battacks?\b/.test(normalized)) return "MAKES_ATTACK";
  if (/\bactivates? a power\b|\buses? a power\b|\bcasts? a power\b/.test(normalized)) {
    return "ACTIVATES_POWER";
  }
  if (/\bsuffers? wounds\b|\btakes? wounds\b/.test(normalized)) return "SUFFERS_WOUNDS";
  if (/\bheals? wounds\b|\brecovers? wounds\b|\bregains? wounds\b/.test(normalized)) {
    return "HEALS_WOUNDS";
  }
  if (/\bsuffers? an effect\b|\bis affected\b/.test(normalized)) return "SUFFERS_EFFECT";
  if (/\bgains? an effect\b|\breceives? an effect\b/.test(normalized)) return "GAINS_EFFECT";
  if (/\buses? an item\b|\buses? item\b/.test(normalized)) return "USES_ITEM";
  if (/\bdefence roll\b|\bdodge roll\b/.test(normalized)) return "MAKES_DEFENCE_ROLL";
  if (/\bresist roll\b|\bresistance roll\b/.test(normalized)) return "MAKES_RESIST_ROLL";
  return null;
}

function readTriggerConditionKey(
  value: unknown,
): TriggerConditionKey | null {
  return normalizeTriggerConditionKey(value) ?? mapLegacyTriggerConditionTextToKey(value);
}

function asDice(value: unknown, fallback: DiceSize = "D6"): DiceSize {
  const str = asString(value, fallback) as DiceSize;
  return DICE_SET.has(str) ? str : fallback;
}

function normalizeCoreAttribute(value: unknown): CoreAttribute | null {
  const normalized = asString(value, "") as CoreAttribute;
  return CORE_ATTRIBUTE_SET.has(normalized) ? normalized : null;
}

const LEGACY_CONTROL_MODE_MAP = new Map<string, string>([
  ["Force specific action", "Force specific main action"],
  ["Force no action", "Force no main action"],
  ["Force specific power", "Force specific power action"],
]);
const CONTROL_MODE_SET = new Set<string>([
  "Force move",
  "Force no move",
  "Force specific main action",
  "Force no main action",
  "Force specific power action",
]);
const CONTROL_THEME_TO_RESIST_ATTRIBUTE = new Map<string, CoreAttribute>([
  ["BODY_ENDURANCE", "FORTITUDE"],
  ["MIND_COGNITION", "INTELLECT"],
  ["COURAGE_RESOLVE", "BRAVERY"],
  ["TRUST_BELONGING", "SUPPORT"],
  ["OFFENSIVE_EXECUTION", "ATTACK"],
  ["DEFENSIVE_COORDINATION", "DEFENCE"],
]);

function normalizeControlMode(value: unknown): string {
  const raw = asString(value, "");
  if (!raw) return "";
  return LEGACY_CONTROL_MODE_MAP.get(raw) ?? raw;
}

function controlModeNeedsTheme(controlMode: string): boolean {
  return CONTROL_MODE_SET.has(normalizeControlMode(controlMode));
}

function normalizeControlTheme(value: unknown, controlMode: string): string | null {
  if (!controlModeNeedsTheme(controlMode)) return null;
  const normalized = asString(value, "").toUpperCase();
  return CONTROL_THEME_TO_RESIST_ATTRIBUTE.has(normalized) ? normalized : null;
}

function getControlThemeResistAttribute(details: Record<string, unknown>): CoreAttribute | null {
  const controlMode = normalizeControlMode(details.controlMode);
  const controlTheme = normalizeControlTheme(details.controlTheme, controlMode);
  return controlTheme ? (CONTROL_THEME_TO_RESIST_ATTRIBUTE.get(controlTheme) ?? null) : null;
}

function cleanseEffectNeedsTheme(cleanseEffectType: string): boolean {
  return cleanseEffectType === "Active Power" || cleanseEffectType === "Channelled Power";
}

function normalizeCleanseTheme(value: unknown, cleanseEffectType: string): string | null {
  if (!cleanseEffectNeedsTheme(cleanseEffectType)) return null;
  const normalized = asString(value, "").toUpperCase();
  return CONTROL_THEME_TO_RESIST_ATTRIBUTE.has(normalized) ? normalized : null;
}

function getCleanseThemeResistAttribute(details: Record<string, unknown>): CoreAttribute | null {
  const cleanseEffectType = asString(details.cleanseEffectType, "");
  const cleanseTheme = normalizeCleanseTheme(details.cleanseTheme, cleanseEffectType);
  return cleanseTheme ? (CONTROL_THEME_TO_RESIST_ATTRIBUTE.get(cleanseTheme) ?? null) : null;
}

function normalizeMovementTheme(value: unknown): ResistTheme | null {
  const normalized = asString(value, "").toUpperCase();
  return RESIST_THEME_SET.has(normalized as ResistTheme)
    ? (normalized as ResistTheme)
    : null;
}

function mapLegacyApplicationModeKeyToMovementTheme(
  value: unknown,
): ResistTheme | null {
  const normalized = asString(value, "").toUpperCase();
  if (!normalized) return null;
  if (RESIST_THEME_SET.has(normalized as ResistTheme)) return normalized as ResistTheme;
  if (normalized === "FORTITUDE" || normalized === "BODY" || normalized === "BODY / ENDURANCE") {
    return "BODY_ENDURANCE";
  }
  if (normalized === "INTELLECT" || normalized === "MIND" || normalized === "MIND / COGNITION / PERCEPTION") {
    return "MIND_COGNITION";
  }
  if (normalized === "BRAVERY" || normalized === "COURAGE" || normalized === "COURAGE / RESOLVE / PANIC") {
    return "COURAGE_RESOLVE";
  }
  if (normalized === "SUPPORT" || normalized === "TRUST" || normalized === "TRUST / BELONGING / ANCHORING") {
    return "TRUST_BELONGING";
  }
  if (normalized === "ATTACK" || normalized === "OFFENSIVE" || normalized === "OFFENSIVE EXECUTION") {
    return "OFFENSIVE_EXECUTION";
  }
  if (
    normalized === "DEFENCE" ||
    normalized === "DEFENSE" ||
    normalized === "DEFENSIVE" ||
    normalized === "DEFENSIVE COORDINATION / BALANCE"
  ) {
    return "DEFENSIVE_COORDINATION";
  }
  return null;
}

function getMovementThemeResistAttribute(details: Record<string, unknown>): CoreAttribute | null {
  const movementTheme = normalizeMovementTheme(details.movementTheme);
  return movementTheme ? (CONTROL_THEME_TO_RESIST_ATTRIBUTE.get(movementTheme) ?? null) : null;
}

function normalizePacketDetailsForIntention(
  intention: PowerIntention,
  details: Record<string, unknown>,
): Record<string, unknown> {
  if (intention === "CONTROL") {
    const controlMode = normalizeControlMode(details.controlMode) || "Force move";
    const controlTheme = normalizeControlTheme(details.controlTheme, controlMode);
    const nextDetails: Record<string, unknown> = {
      ...details,
      controlMode,
    };
    if (controlTheme) {
      nextDetails.controlTheme = controlTheme;
    } else {
      delete nextDetails.controlTheme;
    }
    return nextDetails;
  }
  if (intention === "CLEANSE") {
    const cleanseEffectType = asString(details.cleanseEffectType, "Active Power");
    const cleanseTheme = normalizeCleanseTheme(details.cleanseTheme, cleanseEffectType);
    const nextDetails: Record<string, unknown> = {
      ...details,
      cleanseEffectType,
    };
    if (cleanseTheme) {
      nextDetails.cleanseTheme = cleanseTheme;
    } else {
      delete nextDetails.cleanseTheme;
    }
    return nextDetails;
  }
  if (intention === "MOVEMENT") {
    const movementMode = asString(details.movementMode, "Force Push");
    const movementTheme = normalizeMovementTheme(details.movementTheme);
    const nextDetails: Record<string, unknown> = {
      ...details,
      movementMode,
    };
    if (movementTheme) {
      nextDetails.movementTheme = movementTheme;
    } else {
      delete nextDetails.movementTheme;
    }
    return nextDetails;
  }
  return details;
}

function normalizeEffectPacketApplyTo(
  value: unknown,
): "PRIMARY_TARGET" | "ALLIES" | "SELF" {
  return EFFECT_PACKET_APPLY_TO_SET.has(asString(value, "PRIMARY_TARGET"))
    ? (asString(value, "PRIMARY_TARGET") as "PRIMARY_TARGET" | "ALLIES" | "SELF")
    : "PRIMARY_TARGET";
}

function readPacketApplyTo(
  packet:
    | Pick<EffectPacket, "applyTo" | "detailsJson">
    | undefined,
): "PRIMARY_TARGET" | "ALLIES" | "SELF" {
  const details =
    packet?.detailsJson && typeof packet.detailsJson === "object" && !Array.isArray(packet.detailsJson)
      ? (packet.detailsJson as Record<string, unknown>)
      : undefined;
  return normalizeEffectPacketApplyTo(packet?.applyTo ?? details?.applyTo);
}

function readPacketTriggerConditionText(
  packet:
    | Pick<EffectPacket, "triggerConditionText" | "detailsJson">
    | undefined,
): string | null {
  const details =
    packet?.detailsJson && typeof packet.detailsJson === "object" && !Array.isArray(packet.detailsJson)
      ? (packet.detailsJson as Record<string, unknown>)
      : undefined;
  return asNullableString(
    packet?.triggerConditionText ??
      details?.triggerConditionText ??
      details?.[LEGACY_TRIGGER_CONDITION_KEY],
  );
}

function normalizeAttachedHostAnchorType(
  value: unknown,
): Power["attachedHostAnchorType"] {
  const normalized = asString(value, "").toUpperCase();
  return ATTACHED_HOST_ANCHOR_TYPE_SET.has(normalized)
    ? (normalized as NonNullable<Power["attachedHostAnchorType"]>)
    : null;
}

function readLegacyAttachedHostAnchorType(
  descriptorChassisConfig: Record<string, unknown>,
): Power["attachedHostAnchorType"] {
  const normalized = asString(descriptorChassisConfig.anchorText, "").toLowerCase();
  if (!normalized) return null;
  if (
    normalized === "target" ||
    normalized === "the target" ||
    normalized === "marked target" ||
    normalized === "the marked target" ||
    normalized === "chosen target" ||
    normalized === "the chosen target" ||
    normalized === "host" ||
    normalized === "the host"
  ) {
    return "TARGET";
  }
  if (normalized === "object" || normalized === "the object") return "OBJECT";
  if (
    normalized === "weapon" ||
    normalized === "the weapon" ||
    normalized === "your weapon" ||
    normalized === "bound weapon" ||
    normalized === "the bound weapon"
  ) {
    return "WEAPON";
  }
  if (
    normalized === "armor" ||
    normalized === "armour" ||
    normalized === "the armor" ||
    normalized === "the armour" ||
    normalized === "your armor" ||
    normalized === "your armour"
  ) {
    return "ARMOR";
  }
  if (normalized === "self" || normalized === "yourself") return "SELF";
  if (normalized === "area" || normalized === "the area") return "AREA";
  return null;
}

function sanitizePacketDetails(details: Record<string, unknown>): Record<string, unknown> {
  const nextDetails = { ...details };
  delete nextDetails.applyTo;
  delete nextDetails.triggerConditionText;
  delete nextDetails[LEGACY_TRIGGER_CONDITION_KEY];
  return nextDetails;
}

function countSelectedAttackDamageTypes(details: Record<string, unknown>): number {
  if (!Array.isArray(details.damageTypes)) return 0;
  const seen = new Set<string>();
  for (const entry of details.damageTypes) {
    const normalized = asString(entry, "").trim().toLowerCase();
    if (!normalized) continue;
    seen.add(normalized);
  }
  return seen.size;
}

function getAllowedPacketApplyToOptions(params: {
  rangeCategory: "SELF" | "MELEE" | "RANGED" | "AOE" | null;
  meleeTargets: number;
  rangedTargets: number;
  localTargetingOverride: EffectPacket["localTargetingOverride"] | null | undefined;
}): Array<"PRIMARY_TARGET" | "ALLIES" | "SELF"> {
  if (params.localTargetingOverride) {
    return ["PRIMARY_TARGET", "ALLIES", "SELF"];
  }
  if (params.rangeCategory === "SELF") {
    return ["SELF"];
  }
  if (params.rangeCategory === "MELEE" && params.meleeTargets <= 1) {
    return ["PRIMARY_TARGET", "SELF"];
  }
  if (params.rangeCategory === "RANGED" && params.rangedTargets <= 1) {
    return ["PRIMARY_TARGET", "SELF"];
  }
  return ["PRIMARY_TARGET", "ALLIES", "SELF"];
}

function normalizePacketApplyToForCastContext(
  value: "PRIMARY_TARGET" | "ALLIES" | "SELF",
  params: {
    rangeCategory: "SELF" | "MELEE" | "RANGED" | "AOE" | null;
    meleeTargets: number;
    rangedTargets: number;
    localTargetingOverride: EffectPacket["localTargetingOverride"] | null | undefined;
  },
): "PRIMARY_TARGET" | "ALLIES" | "SELF" {
  const allowed = getAllowedPacketApplyToOptions(params);
  if (allowed.includes(value)) return value;
  if (allowed.includes("PRIMARY_TARGET")) return "PRIMARY_TARGET";
  return allowed[0] ?? "PRIMARY_TARGET";
}

function readSharedCastContextForPacketApplyTo(params: {
  powerRangeCategory: "SELF" | "MELEE" | "RANGED" | "AOE" | null;
  rangeValue: number;
  packetRangeExtra: Record<string, unknown>;
}): {
  rangeCategory: "SELF" | "MELEE" | "RANGED" | "AOE" | null;
  meleeTargets: number;
  rangedTargets: number;
} {
  return {
    rangeCategory: params.powerRangeCategory,
    meleeTargets: params.powerRangeCategory === "MELEE" ? Math.max(1, params.rangeValue || 1) : 1,
    rangedTargets:
      params.powerRangeCategory === "RANGED"
        ? Math.max(1, asInt(params.packetRangeExtra.targets, 1))
        : 1,
  };
}

function normalizeDescriptorChassis(value: unknown): Power["descriptorChassis"] {
  return value === "IMMEDIATE" ||
    value === "FIELD" ||
    value === "ATTACHED" ||
    value === "TRIGGER" ||
    value === "RESERVE"
    ? value
    : "IMMEDIATE";
}

function normalizeChargeType(value: unknown): "DELAYED_RELEASE" | "BUILD_POWER" {
  const normalized = asString(value, "DELAYED_RELEASE");
  return CHARGE_TYPE_SET.has(normalized) ? (normalized as "DELAYED_RELEASE" | "BUILD_POWER") : "DELAYED_RELEASE";
}

function getAllowedChargeTypesForChassis(): Array<"DELAYED_RELEASE" | "BUILD_POWER"> {
  return ["DELAYED_RELEASE", "BUILD_POWER"];
}

function normalizeChargeTurns(value: unknown): number {
  return Math.max(1, Math.min(8, asInt(value, 1)));
}

function normalizeChargeBonusDicePerTurn(value: unknown): number {
  return Math.max(1, Math.min(10, asInt(value, 1)));
}

function coerceReserveReleaseBehaviour(
  value: unknown,
): ReserveReleaseBehaviour | null {
  const normalized = asString(value, "");
  return RESERVE_RELEASE_BEHAVIOUR_SET.has(normalized as ReserveReleaseBehaviour)
    ? (normalized as ReserveReleaseBehaviour)
    : null;
}

function mapLegacyReleaseBehaviourTextToKey(
  value: unknown,
): ReserveReleaseBehaviour | null {
  const normalized = asString(value, "").toLowerCase();
  if (!normalized) return null;
  if (/\b(expiry|expire|expires|expired)\b/.test(normalized)) return "ON_EXPIRY";
  if (/\bresponse only\b/.test(normalized)) return "RESPONSE_ONLY";
  if (/\bpower action only\b/.test(normalized)) return "ACTION_ONLY";
  if (/\bpower action\b/.test(normalized) && /\bresponse\b/.test(normalized)) {
    return "ACTION_OR_RESPONSE";
  }
  if (/\bresponse\b/.test(normalized)) return "RESPONSE_ONLY";
  if (/\bpower action\b/.test(normalized) || /\baction\b/.test(normalized)) return "ACTION_ONLY";
  return null;
}

function readReserveReleaseBehaviour(
  descriptorChassisConfig: Record<string, unknown>,
): ReserveReleaseBehaviour {
  return coerceReserveReleaseBehaviour(descriptorChassisConfig.releaseBehaviour) ??
    mapLegacyReleaseBehaviourTextToKey(descriptorChassisConfig.releaseBehaviourText) ??
    "ACTION_OR_RESPONSE";
}

function normalizeTriggerMethod(value: unknown): string {
  const normalized = asString(value, "ARM_AND_THEN_TARGET");
  return TRIGGER_METHOD_SET.has(normalized) ? normalized : "ARM_AND_THEN_TARGET";
}

function normalizePowerDescriptorChassisConfig(
  value: unknown,
  commitmentModifier: NonNullable<Power["commitmentModifier"]>,
  descriptorChassis: Power["descriptorChassis"],
): Record<string, unknown> {
  const descriptorChassisConfig =
    value && typeof value === "object" && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  const rawConfig =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  delete descriptorChassisConfig.defineReleaseBehaviour;
  delete descriptorChassisConfig.releaseBehaviourText;
  delete descriptorChassisConfig.chargeType;
  delete descriptorChassisConfig.chargeTurns;
  delete descriptorChassisConfig.chargeBonusDicePerTurn;
  delete descriptorChassisConfig.triggerMethod;
  delete descriptorChassisConfig.triggerConditionText;
  delete descriptorChassisConfig.anchorText;
  delete descriptorChassisConfig.payloadTriggerText;
  delete descriptorChassisConfig.fieldInteractionText;

  if (descriptorChassis === "RESERVE") {
    descriptorChassisConfig.releaseBehaviour = readReserveReleaseBehaviour(rawConfig);
  } else {
    delete descriptorChassisConfig.releaseBehaviour;
  }

  return descriptorChassisConfig;
}

function normalizeCounterMode(
  value: unknown,
  descriptorChassis: Power["descriptorChassis"],
  commitmentModifier: NonNullable<Power["commitmentModifier"]>,
  chargeType: Power["chargeType"],
): NonNullable<Power["counterMode"]> {
  if (descriptorChassis === "TRIGGER") return "NO";
  if (
    commitmentModifier === "CHARGE" &&
    normalizeChargeType(chargeType) === "DELAYED_RELEASE"
  ) {
    return "NO";
  }
  return value === "YES" ? "YES" : "NO";
}

function normalizeEffectTimingType(value: unknown): EffectPacket["effectTimingType"] {
  const raw = asString(value, "ON_CAST");
  const normalized = raw === "ON_HIT" ? "ON_TRIGGER" : raw;
  return (EFFECT_TIMING_SET.has(normalized) ? normalized : "ON_CAST") as EffectPacket["effectTimingType"];
}

function doesPacketCreateBeyondTurnCarrier(
  effectPacket: EffectPacket | undefined,
): boolean {
  if (!effectPacket) return false;
  const durationType = effectPacket.effectDurationType ?? "INSTANT";
  return durationType === "TURNS" || durationType === "PASSIVE" || durationType === "UNTIL_TARGET_NEXT_TURN";
}

function restrictImmediateSecondaryTimingsByPrimaryDuration(
  allowedTimings: EffectPacket["effectTimingType"][],
  primaryPacket: EffectPacket | undefined,
): EffectPacket["effectTimingType"][] {
  const primaryDurationType = primaryPacket?.effectDurationType ?? "INSTANT";
  if (primaryDurationType !== "INSTANT" && primaryDurationType !== "UNTIL_TARGET_NEXT_TURN") {
    return allowedTimings;
  }
  return allowedTimings.filter((timing) =>
    timing === "ON_CAST" || timing === "ON_TRIGGER" || timing === "ON_EXPIRY",
  );
}

function getAllowedAttachedEffectTimingsForHostileEntry(
  packetIndex: number,
  hostileEntryPattern: "ON_ATTACH" | "ON_PAYLOAD" | null | undefined,
): EffectPacket["effectTimingType"][] {
  if (packetIndex > 0) {
    return ["ON_TRIGGER", "START_OF_TURN", "END_OF_TURN", "ON_EXPIRY"];
  }
  if (hostileEntryPattern === "ON_ATTACH") {
    return ["ON_ATTACH"];
  }
  if (hostileEntryPattern === "ON_PAYLOAD") {
    return ["ON_TRIGGER", "START_OF_TURN", "END_OF_TURN", "ON_EXPIRY"];
  }
  return ["ON_ATTACH", "ON_TRIGGER", "START_OF_TURN", "END_OF_TURN", "ON_EXPIRY"];
}

function normalizeAttachedEffectPacketTimings(
  effectPackets: EffectPacket[],
  hostileEntryPattern: "ON_ATTACH" | "ON_PAYLOAD" | null | undefined,
): EffectPacket[] {
  return effectPackets.map((effectPacket, index) => {
    const allowedTimings = getAllowedAttachedEffectTimingsForHostileEntry(index, hostileEntryPattern);
    const timingCandidate = effectPacket.effectTimingType ?? (index === 0 ? "ON_ATTACH" : "ON_TRIGGER");
    const normalizedTiming = allowedTimings.includes(timingCandidate)
      ? timingCandidate
      : allowedTimings[0];
    return {
      ...effectPacket,
      effectTimingType: normalizedTiming,
      effectTimingTurns:
        normalizedTiming === "ON_TRIGGER"
          ? Math.max(1, asInt(effectPacket.effectTimingTurns, 1))
          : null,
    };
  });
}

function deriveSecondaryScalingModeFromPrimaryPacket(
  primaryPacket: EffectPacket | undefined,
): "PRIMARY_APPLIED_SUCCESSES" | "PRIMARY_WOUND_BANDS" {
  if (!primaryPacket) return "PRIMARY_APPLIED_SUCCESSES";
  return primaryPacket.intention === "ATTACK" && primaryPacket.dealsWounds !== false
    ? "PRIMARY_WOUND_BANDS"
    : "PRIMARY_APPLIED_SUCCESSES";
}

function deriveWoundsPerSuccessFromPrimaryPacket(
  primaryPacket: EffectPacket | undefined,
): number | null {
  if (!primaryPacket) return null;
  if (primaryPacket.intention !== "ATTACK" || primaryPacket.dealsWounds === false) return null;
  const details =
    primaryPacket.detailsJson && typeof primaryPacket.detailsJson === "object"
      ? (primaryPacket.detailsJson as Record<string, unknown>)
      : {};
  const selectedDamageTypeCount = countSelectedAttackDamageTypes(details);
  const potency = Math.max(1, asInt(primaryPacket.potency, 1));
  const effectiveDamageTypeCount = Math.max(
    1,
    Math.min(MAX_POWER_PACKET_DAMAGE_TYPES, selectedDamageTypeCount),
  );
  return potency * 2 * effectiveDamageTypeCount;
}

function normalizeImmediateEffectPacketTimings(
  effectPackets: EffectPacket[],
  commitmentModifier: NonNullable<Power["commitmentModifier"]>,
): EffectPacket[] {
  if (effectPackets.length === 0) return effectPackets;
  const primaryPacket = effectPackets[0];
  const immediatePrimaryAllowed =
    commitmentModifier === "STANDARD"
      ? ["ON_CAST"]
      : [
          "ON_CAST",
          "ON_TRIGGER",
          "START_OF_TURN",
          "END_OF_TURN",
          ...(commitmentModifier === "CHANNEL"
            ? (["START_OF_TURN_WHILST_CHANNELLED", "END_OF_TURN_WHILST_CHANNELLED"] as const)
            : []),
          "ON_EXPIRY",
        ];
  const primaryTimingCandidate = primaryPacket.effectTimingType ?? "ON_CAST";
  const normalizedPrimaryTiming = immediatePrimaryAllowed.includes(primaryTimingCandidate)
    ? primaryTimingCandidate
    : "ON_CAST";
  const normalizedPrimaryPacket =
    primaryPacket.effectTimingType === normalizedPrimaryTiming
      ? primaryPacket
      : {
          ...primaryPacket,
          effectTimingType: normalizedPrimaryTiming,
          effectTimingTurns: normalizedPrimaryTiming === "ON_TRIGGER"
            ? Math.max(1, asInt(primaryPacket.effectTimingTurns, 1))
            : null,
        };
  const primarySupportsLaterTimings =
    normalizedPrimaryTiming !== "ON_CAST" || doesPacketCreateBeyondTurnCarrier(normalizedPrimaryPacket);
  const immediateSecondaryTimings: EffectPacket["effectTimingType"][] = primarySupportsLaterTimings
    ? [
        "ON_CAST",
        "ON_TRIGGER",
        "START_OF_TURN",
        "END_OF_TURN",
        ...(commitmentModifier === "CHANNEL"
          ? (["START_OF_TURN_WHILST_CHANNELLED", "END_OF_TURN_WHILST_CHANNELLED"] as const)
          : []),
        "ON_EXPIRY",
      ]
    : ["ON_CAST"];
  const allowedSecondaryTimings = restrictImmediateSecondaryTimingsByPrimaryDuration(
    immediateSecondaryTimings,
    normalizedPrimaryPacket,
  );
  return effectPackets.map((effectPacket, index) => {
    if (index === 0) return normalizedPrimaryPacket;
    const timingCandidate = effectPacket.effectTimingType ?? "ON_CAST";
    const normalizedTiming = allowedSecondaryTimings.includes(timingCandidate)
      ? timingCandidate
      : "ON_CAST";
    return {
      ...effectPacket,
      effectTimingType: normalizedTiming,
      effectTimingTurns:
        normalizedTiming === "ON_TRIGGER"
          ? Math.max(1, asInt(effectPacket.effectTimingTurns, 1))
          : null,
    };
  });
}

function normalizeDerivedSecondaryScaling(effectPackets: EffectPacket[]): EffectPacket[] {
  if (effectPackets.length <= 1) return effectPackets;
  const primaryPacket = effectPackets[0];
  return effectPackets.map((effectPacket, index) => {
    if (index === 0) return effectPacket;
    const details =
      effectPacket.detailsJson && typeof effectPacket.detailsJson === "object"
        ? { ...(effectPacket.detailsJson as Record<string, unknown>) }
        : {};
    const scalingMode = deriveSecondaryScalingModeFromPrimaryPacket(primaryPacket);
    const woundsPerSuccess =
      scalingMode === "PRIMARY_WOUND_BANDS"
        ? deriveWoundsPerSuccessFromPrimaryPacket(primaryPacket)
        : null;
    return {
      ...effectPacket,
      detailsJson: {
        ...details,
        secondaryScalingMode: scalingMode,
        ...(scalingMode === "PRIMARY_WOUND_BANDS"
          ? { woundsPerSuccess }
          : { woundsPerSuccess: null }),
      },
    };
  });
}

function getAllowedEffectDurationTypes(
  effectTimingType: EffectPacket["effectTimingType"] | undefined,
): EffectDurationType[] {
  const timing = effectTimingType ?? "ON_CAST";
  if (timing === "START_OF_TURN" || timing === "END_OF_TURN") {
    return ["INSTANT", "TURNS", "PASSIVE"];
  }
  return ["INSTANT", "TURNS", "PASSIVE", "UNTIL_TARGET_NEXT_TURN"];
}

function normalizeEffectDurationTypeForTiming(
  value: unknown,
  effectTimingType: EffectPacket["effectTimingType"] | undefined,
  fallback: EffectDurationType,
): EffectDurationType {
  const normalized = EFFECT_DURATION_SET.has(value as EffectDurationType)
    ? (value as EffectDurationType)
    : fallback;
  const allowed = getAllowedEffectDurationTypes(effectTimingType);
  return allowed.includes(normalized) ? normalized : "INSTANT";
}

function normalizePowerLifespan(
  descriptorChassis: Power["descriptorChassis"],
  commitmentModifier: NonNullable<Power["commitmentModifier"]>,
  lifespanType: unknown,
  lifespanTurns: unknown,
): Pick<Power, "lifespanType" | "lifespanTurns"> {
  const normalizedLifespanTypeRaw = asString(lifespanType, "NONE");
  const normalizedLifespanType = LIFESPAN_SET.has(normalizedLifespanTypeRaw as PowerLifespanType)
    ? (normalizedLifespanTypeRaw as PowerLifespanType)
    : "NONE";

  if (descriptorChassis === "IMMEDIATE" && commitmentModifier === "STANDARD") {
    return {
      lifespanType: "NONE",
      lifespanTurns: null,
    };
  }

  if (commitmentModifier === "CHANNEL") {
    if (normalizedLifespanType === "PASSIVE") {
      return {
        lifespanType: "PASSIVE",
        lifespanTurns: null,
      };
    }

    return {
      lifespanType: "TURNS",
      lifespanTurns: Math.max(2, asInt(lifespanTurns, 2)),
    };
  }

  if (descriptorChassis !== "IMMEDIATE") {
    return {
      lifespanType: normalizedLifespanType === "PASSIVE" ? "PASSIVE" : "TURNS",
      lifespanTurns:
        normalizedLifespanType === "PASSIVE"
          ? null
          : Math.max(1, asInt(lifespanTurns, 1)),
    };
  }

  if (normalizedLifespanType === "TURNS") {
    return {
      lifespanType: "TURNS",
      lifespanTurns: Math.max(1, asInt(lifespanTurns, 1)),
    };
  }

  if (normalizedLifespanType === "PASSIVE") {
    return {
      lifespanType: "PASSIVE",
      lifespanTurns: null,
    };
  }

  return {
    lifespanType: "NONE",
    lifespanTurns: null,
  };
}

function normalizePacketIntention(
  value: unknown,
  packetIndex: number,
  fallbackDiceCount: number,
  fallbackPotency: number,
  fallbackDurationType: EffectDurationType,
  fallbackDurationTurns: number | null,
): EffectPacket {
  const raw = (value ?? {}) as Record<string, unknown>;
  const rawIntention = asString(raw.intention ?? raw.type, "ATTACK");
  const normalizedIntention = rawIntention === "SUMMON" ? "SUMMONING" : rawIntention;
  const intention = INTENTION_SET.has(normalizedIntention as PowerIntention)
    ? (normalizedIntention as PowerIntention)
    : "ATTACK";
  const rawDetails =
    raw.detailsJson && typeof raw.detailsJson === "object"
      ? (raw.detailsJson as Record<string, unknown>)
      : {};
  const details = sanitizePacketDetails(
    normalizePacketDetailsForIntention(
      intention,
      intention === "MOVEMENT"
        ? {
            ...rawDetails,
            movementTheme:
              rawDetails.movementTheme ?? mapLegacyApplicationModeKeyToMovementTheme(raw.applicationModeKey),
          }
        : rawDetails,
    ),
  );
  const attackMode = asString(details.attackMode, "PHYSICAL").toUpperCase();
  const targetedAttribute = normalizeCoreAttribute(
    raw.targetedAttribute ?? details.statTarget ?? details.statChoice,
  );
  const diceCount = Math.max(1, Math.min(20, asInt(raw.diceCount, fallbackDiceCount)));
  const potency = Math.max(1, Math.min(5, asInt(raw.potency, fallbackPotency)));
  const effectDurationTypeRaw = asString(
    raw.effectDurationType ?? raw.durationType,
    fallbackDurationType,
  );
  const effectTimingType = normalizeEffectTimingType(raw.effectTimingType);
  const effectDurationType = normalizeEffectDurationTypeForTiming(
    effectDurationTypeRaw,
    effectTimingType,
    fallbackDurationType,
  );
  const effectDurationTurns =
    effectDurationType === "TURNS"
      ? Math.max(1, Math.min(4, asInt(raw.effectDurationTurns ?? raw.durationTurns, fallbackDurationTurns ?? 1)))
      : null;
  const hostilityRaw = asString(raw.hostility, "");
  const hostility =
    hostilityRaw === "HOSTILE" || hostilityRaw === "NON_HOSTILE"
      ? hostilityRaw
      : intention === "ATTACK" || intention === "CONTROL" || intention === "DEBUFF" || intention === "MOVEMENT"
        ? "HOSTILE"
        : "NON_HOSTILE";
  const applyTo = normalizeEffectPacketApplyTo(raw.applyTo ?? rawDetails.applyTo);
  const triggerConditionText = asNullableString(
    raw.triggerConditionText ??
      raw[LEGACY_TRIGGER_CONDITION_KEY] ??
      rawDetails.triggerConditionText ??
      rawDetails[LEGACY_TRIGGER_CONDITION_KEY],
  );
  const woundChannelRaw = asString(raw.woundChannel, "");
  const woundChannel =
    woundChannelRaw === "PHYSICAL" || woundChannelRaw === "MENTAL"
      ? woundChannelRaw
      : intention === "ATTACK" && attackMode === "MENTAL"
        ? "MENTAL"
        : intention === "ATTACK"
          ? "PHYSICAL"
          : null;
  return {
    sortOrder: packetIndex,
    // Keep packet indices 0-based for now to match the current array-backed
    // Summoning Circle editor bridge and avoid a risky UI/data off-by-one change
    // during the destructive migration cutover.
    packetIndex,
    hostility,
    intention,
    type: intention,
    specific: asNullableString(
      raw.specific ??
        details.controlMode ??
        details.cleanseEffectType ??
        details.movementMode ??
        details.healingMode ??
        details.attackMode ??
        details.statTarget ??
        details.statChoice,
    ),
    diceCount,
    potency,
    effectTimingType,
    effectTimingTurns:
      effectTimingType === "ON_TRIGGER"
        ? Math.max(1, asInt(raw.effectTimingTurns, 1))
        : null,
    effectDurationType,
    effectDurationTurns,
    dealsWounds: asBool(raw.dealsWounds, intention === "ATTACK"),
    woundChannel,
    targetedAttribute,
    applicationModeKey: null,
    resolutionOrigin:
      asString(raw.resolutionOrigin, "CASTER") as EffectPacket["resolutionOrigin"],
    applyTo,
    triggerConditionText,
    detailsJson: details,
    localTargetingOverride:
      raw.localTargetingOverride && typeof raw.localTargetingOverride === "object"
        ? {
            meleeTargets: asInt((raw.localTargetingOverride as Record<string, unknown>).meleeTargets, 0) || null,
            rangedTargets: asInt((raw.localTargetingOverride as Record<string, unknown>).rangedTargets, 0) || null,
            rangedDistanceFeet:
              asInt((raw.localTargetingOverride as Record<string, unknown>).rangedDistanceFeet, 0) || null,
            aoeCenterRangeFeet:
              asInt((raw.localTargetingOverride as Record<string, unknown>).aoeCenterRangeFeet, 0) || null,
            aoeCount: asInt((raw.localTargetingOverride as Record<string, unknown>).aoeCount, 0) || null,
            aoeShape: asNullableString((raw.localTargetingOverride as Record<string, unknown>).aoeShape) as
              | "SPHERE"
              | "CONE"
              | "LINE"
              | null,
            aoeSphereRadiusFeet:
              asInt((raw.localTargetingOverride as Record<string, unknown>).aoeSphereRadiusFeet, 0) || null,
            aoeConeLengthFeet:
              asInt((raw.localTargetingOverride as Record<string, unknown>).aoeConeLengthFeet, 0) || null,
            aoeLineWidthFeet:
              asInt((raw.localTargetingOverride as Record<string, unknown>).aoeLineWidthFeet, 0) || null,
            aoeLineLengthFeet:
              asInt((raw.localTargetingOverride as Record<string, unknown>).aoeLineLengthFeet, 0) || null,
          }
        : null,
  };
}

function derivePrimaryDefenceGate(
  raw: Record<string, unknown>,
  effectPackets: EffectPacket[],
): PrimaryDefenceGate | null {
  const explicit = raw.primaryDefenceGate;
  if (explicit && typeof explicit === "object") {
    const gate = explicit as Record<string, unknown>;
    const gateResultRaw = asString(gate.gateResult, "NONE");
    return {
      // Keep sourcePacketIndex 0-based in this cleanup pass for consistency with
      // packetIndex and the current editor payload ordering.
      sourcePacketIndex: Math.max(0, asInt(gate.sourcePacketIndex, 0)),
      gateResult: PRIMARY_GATE_SET.has(gateResultRaw as PrimaryDefenceGateResult)
        ? (gateResultRaw as PrimaryDefenceGateResult)
        : "NONE",
      protectionChannel: asNullableString(gate.protectionChannel) as "PHYSICAL" | "MENTAL" | null,
      resistAttribute: normalizeCoreAttribute(gate.resistAttribute),
      hostileEntryPattern: asNullableString(gate.hostileEntryPattern) as
        | "DIRECT"
        | "ON_ATTACH"
        | "ON_PAYLOAD"
        | null,
      resolutionSource: asString(gate.resolutionSource, "INFERRED") as PrimaryDefenceGate["resolutionSource"],
    };
  }

  const legacyDefenceRequirement = asString(raw.defenceRequirement, "NONE");
  const firstPacket = effectPackets[0];
  if (!firstPacket) return null;
  if (legacyDefenceRequirement === "PROTECTION") {
    return {
      sourcePacketIndex: 0,
      gateResult: "PROTECTION",
      protectionChannel: firstPacket.woundChannel ?? null,
      resistAttribute: null,
      hostileEntryPattern: null,
      resolutionSource: "INFERRED",
    };
  }
  if (legacyDefenceRequirement === "RESIST") {
    return {
      sourcePacketIndex: 0,
      gateResult: "RESIST",
      protectionChannel: null,
      resistAttribute: firstPacket.targetedAttribute ?? null,
      hostileEntryPattern: null,
      resolutionSource: "INFERRED",
    };
  }
  if (firstPacket.hostility === "HOSTILE" && firstPacket.intention === "ATTACK") {
    return {
      sourcePacketIndex: 0,
      gateResult: "DODGE_OR_PROTECTION",
      protectionChannel: firstPacket.woundChannel ?? null,
      resistAttribute: null,
      hostileEntryPattern: null,
      resolutionSource: "INFERRED",
    };
  }
  if (firstPacket.hostility === "HOSTILE" && firstPacket.intention === "CONTROL") {
    return {
      sourcePacketIndex: 0,
      gateResult: "RESIST",
      protectionChannel: null,
      resistAttribute: getControlThemeResistAttribute(firstPacket.detailsJson ?? {}),
      hostileEntryPattern: null,
      resolutionSource: "INFERRED",
    };
  }
  if (firstPacket.hostility === "HOSTILE" && firstPacket.intention === "MOVEMENT") {
    const details =
      firstPacket.detailsJson && typeof firstPacket.detailsJson === "object" && !Array.isArray(firstPacket.detailsJson)
        ? (firstPacket.detailsJson as Record<string, unknown>)
        : {};
    return {
      sourcePacketIndex: 0,
      gateResult: "RESIST",
      protectionChannel: null,
      resistAttribute: getMovementThemeResistAttribute(details),
      hostileEntryPattern: null,
      resolutionSource: "INFERRED",
    };
  }
  if (firstPacket.hostility === "HOSTILE" && firstPacket.intention === "CLEANSE") {
    const details =
      firstPacket.detailsJson && typeof firstPacket.detailsJson === "object" && !Array.isArray(firstPacket.detailsJson)
        ? (firstPacket.detailsJson as Record<string, unknown>)
        : {};
    const cleanseEffectType = asString(details.cleanseEffectType, "");
    return {
      sourcePacketIndex: 0,
      gateResult: "RESIST",
      protectionChannel: null,
      resistAttribute:
        cleanseEffectType === "Effect over time" || cleanseEffectType === "Damage over time"
          ? "FORTITUDE"
          : getCleanseThemeResistAttribute(details),
      hostileEntryPattern: null,
      resolutionSource: "INFERRED",
    };
  }
  return {
    sourcePacketIndex: 0,
    gateResult: "NONE",
    protectionChannel: null,
    resistAttribute: null,
    hostileEntryPattern: null,
    resolutionSource: "INFERRED",
  };
}

function normalizePower(value: unknown, sortOrder: number): Power {
  const raw = (value ?? {}) as Record<string, unknown>;
  const descriptorChassis = normalizeDescriptorChassis(raw.descriptorChassis);
  const rawDescriptorChassisConfig =
    raw.descriptorChassisConfig && typeof raw.descriptorChassisConfig === "object" && !Array.isArray(raw.descriptorChassisConfig)
      ? (raw.descriptorChassisConfig as Record<string, unknown>)
      : {};
  const effectDurationTypeRaw = asString(
    raw.effectDurationType ?? raw.durationType,
    "INSTANT",
  ) as EffectDurationType;
  const effectDurationType = EFFECT_DURATION_SET.has(effectDurationTypeRaw)
    ? effectDurationTypeRaw
    : "INSTANT";
  const cooldownTurns = Math.max(1, asInt(raw.cooldownTurns, 1));
  const rawReduction = Math.max(0, asInt(raw.cooldownReduction, 0));
  const cooldownReduction = Math.min(rawReduction, cooldownTurns - 1);
  const diceCount = Math.max(1, Math.min(20, asInt(raw.diceCount, 1)));
  const potency = Math.max(1, Math.min(5, asInt(raw.potency, 1)));
  const effectDurationTurns =
    effectDurationType === "TURNS"
      ? Math.max(1, Math.min(4, asInt(raw.effectDurationTurns ?? raw.durationTurns, 1)))
      : null;
  const effectPacketsRaw = Array.isArray(raw.effectPackets)
    ? raw.effectPackets
    : Array.isArray(raw.intentions)
      ? raw.intentions
      : [];
  const commitmentModifierRaw = asString(
    raw.commitmentModifier,
    "STANDARD",
  ) as NonNullable<Power["commitmentModifier"]>;
  const commitmentModifier = COMMITMENT_MODIFIER_SET.has(commitmentModifierRaw)
    ? commitmentModifierRaw
    : "STANDARD";
  const normalizedEffectPackets = effectPacketsRaw
    .slice(0, 4)
    .map((entry, index) =>
      normalizePacketIntention(entry, index, diceCount, potency, effectDurationType, effectDurationTurns),
    );
  const fallbackPacket =
    normalizedEffectPackets.length > 0
      ? normalizedEffectPackets[0]
      : normalizePacketIntention({}, 0, diceCount, potency, effectDurationType, effectDurationTurns);
  const effectPackets =
    normalizedEffectPackets.length > 0 ? normalizedEffectPackets : [fallbackPacket];
  const normalizedImmediateEffectPackets =
    descriptorChassis === "IMMEDIATE"
      ? normalizeImmediateEffectPacketTimings(effectPackets, commitmentModifier)
      : effectPackets;
  const explicitHostileEntryPattern =
    raw.primaryDefenceGate && typeof raw.primaryDefenceGate === "object"
      ? (asNullableString((raw.primaryDefenceGate as Record<string, unknown>).hostileEntryPattern) as
          | "ON_ATTACH"
          | "ON_PAYLOAD"
          | null)
      : null;
  const normalizedAttachedEffectPackets =
    descriptorChassis === "ATTACHED"
      ? normalizeAttachedEffectPacketTimings(normalizedImmediateEffectPackets, explicitHostileEntryPattern)
      : normalizedImmediateEffectPackets;
  const normalizedScaledEffectPackets = normalizeDerivedSecondaryScaling(normalizedAttachedEffectPackets);
  const triggerMethod =
    descriptorChassis === "TRIGGER"
      ? (normalizeTriggerMethod(raw.triggerMethod ?? rawDescriptorChassisConfig.triggerMethod) as Power["triggerMethod"])
      : null;
  const legacyAttachedPayloadTriggerText =
    descriptorChassis === "ATTACHED" && explicitHostileEntryPattern === "ON_PAYLOAD"
      ? asNullableString(rawDescriptorChassisConfig.payloadTriggerText)
      : null;
  const legacyTriggerConditionKey =
    descriptorChassis === "TRIGGER"
      ? readTriggerConditionKey(rawDescriptorChassisConfig.triggerConditionText)
      : null;
  const primaryPacketDetails = (normalizedScaledEffectPackets[0]?.detailsJson ?? {}) as Record<string, unknown>;
  const explicitRangeCategories = Array.isArray(raw.rangeCategories)
    ? raw.rangeCategories
        .map((entry) => asString(entry, "").toUpperCase())
        .filter((entry): entry is "MELEE" | "RANGED" | "AOE" =>
          entry === "MELEE" || entry === "RANGED" || entry === "AOE",
        )
    : [];
  const rawRangeCategory = asString(primaryPacketDetails.rangeCategory, "").toUpperCase();
  const powerRangeCategory =
    explicitRangeCategories[0] ??
    (raw.aoeCenterRangeFeet !== undefined || raw.aoeCount !== undefined || raw.aoeShape !== undefined
      ? "AOE"
      : raw.rangedDistanceFeet !== undefined || raw.rangedTargets !== undefined
        ? "RANGED"
        : raw.meleeTargets !== undefined
          ? "MELEE"
          : rawRangeCategory === "MELEE" || rawRangeCategory === "RANGED" || rawRangeCategory === "AOE"
            ? rawRangeCategory
            : null);
  const packetRangeExtra =
    primaryPacketDetails.rangeExtra &&
    typeof primaryPacketDetails.rangeExtra === "object" &&
    !Array.isArray(primaryPacketDetails.rangeExtra)
      ? (primaryPacketDetails.rangeExtra as Record<string, unknown>)
      : {};
  const rangeValue =
    powerRangeCategory === "MELEE"
      ? asInt(raw.meleeTargets ?? primaryPacketDetails.rangeValue, 1)
      : powerRangeCategory === "RANGED"
        ? asInt(raw.rangedDistanceFeet ?? primaryPacketDetails.rangeValue, 0)
        : powerRangeCategory === "AOE"
          ? asInt(raw.aoeCenterRangeFeet ?? primaryPacketDetails.rangeValue, 0)
          : 0;
  const packetApplyToCastContext = readSharedCastContextForPacketApplyTo({
    powerRangeCategory,
    rangeValue,
    packetRangeExtra: {
      ...packetRangeExtra,
      targets: raw.rangedTargets ?? packetRangeExtra.targets,
    },
  });
  const finalEffectPackets = normalizedScaledEffectPackets.map((packet) => {
    const details =
      packet.detailsJson && typeof packet.detailsJson === "object" && !Array.isArray(packet.detailsJson)
        ? sanitizePacketDetails(packet.detailsJson as Record<string, unknown>)
        : {};
    const triggerConditionText =
      descriptorChassis === "TRIGGER" && packet.packetIndex === 0
        ? (() => {
            const nextTriggerCondition =
              readTriggerConditionKey(packet.triggerConditionText) ?? legacyTriggerConditionKey;
            return triggerMethod === "TARGET_AND_THEN_ARM" &&
                powerRangeCategory !== "AOE" &&
                nextTriggerCondition &&
                TRIGGER_AREA_PRESENCE_KEYS.has(nextTriggerCondition)
              ? null
              : nextTriggerCondition;
          })()
        : readPacketTriggerConditionText(packet) ??
          (packet.effectTimingType === "ON_TRIGGER" ? legacyAttachedPayloadTriggerText : null);
    return {
      ...packet,
      applyTo: normalizePacketApplyToForCastContext(readPacketApplyTo(packet), {
        rangeCategory: packetApplyToCastContext.rangeCategory,
        meleeTargets: packetApplyToCastContext.meleeTargets,
        rangedTargets: packetApplyToCastContext.rangedTargets,
        localTargetingOverride: packet.localTargetingOverride,
      }),
      triggerConditionText,
      detailsJson: details,
    };
  });
  const counterModeRaw = asString(raw.counterMode, "") as NonNullable<Power["counterMode"]>;
  const counterMode = COUNTER_MODE_SET.has(counterModeRaw)
    ? counterModeRaw
    : asBool(raw.responseRequired, false)
      ? "YES"
      : "NO";
  const normalizedLifespan = normalizePowerLifespan(
    descriptorChassis,
    commitmentModifier,
    raw.lifespanType,
    raw.lifespanTurns,
  );
  const chargeType =
    commitmentModifier === "CHARGE"
      ? (() => {
          const allowedChargeTypes = getAllowedChargeTypesForChassis();
          const candidate = normalizeChargeType(raw.chargeType ?? rawDescriptorChassisConfig.chargeType);
          return allowedChargeTypes.includes(candidate) ? candidate : allowedChargeTypes[0];
        })()
      : null;
  const chargeTurns =
    commitmentModifier === "CHARGE"
      ? normalizeChargeTurns(raw.chargeTurns ?? rawDescriptorChassisConfig.chargeTurns)
      : null;
  const chargeBonusDicePerTurn =
    commitmentModifier === "CHARGE" && chargeType === "BUILD_POWER"
      ? normalizeChargeBonusDicePerTurn(
          raw.chargeBonusDicePerTurn ?? rawDescriptorChassisConfig.chargeBonusDicePerTurn,
        )
      : null;
  const attachedHostAnchorType =
    descriptorChassis === "ATTACHED"
      ? normalizeAttachedHostAnchorType(raw.attachedHostAnchorType) ??
        readLegacyAttachedHostAnchorType(rawDescriptorChassisConfig)
      : null;
  const descriptorChassisConfig = normalizePowerDescriptorChassisConfig(
    raw.descriptorChassisConfig,
    commitmentModifier,
    descriptorChassis,
  );

  return {
    sortOrder,
    name: asString(raw.name, ""),
    description: asString(raw.description, "") || null,
    schemaVersion: Math.max(1, asInt(raw.schemaVersion, 1)),
    rulesVersion: asString(raw.rulesVersion, "v1") || "v1",
    contentRevision: Math.max(1, asInt(raw.contentRevision, 1)),
    previewRendererVersion: Math.max(1, asInt(raw.previewRendererVersion, 1)),
    status: asString(raw.status, "ACTIVE") as Power["status"],
    descriptorChassis,
    descriptorChassisConfig,
    chargeType,
    chargeTurns,
    chargeBonusDicePerTurn,
    cooldownTurns,
    cooldownReduction,
    counterMode: normalizeCounterMode(
      counterMode,
      descriptorChassis,
      commitmentModifier,
      chargeType,
    ),
    commitmentModifier,
    triggerMethod,
    attachedHostAnchorType,
    ...normalizedLifespan,
    previewSummaryOverride: asNullableString(raw.previewSummaryOverride),
    rangeCategories: explicitRangeCategories.length > 0 ? explicitRangeCategories : powerRangeCategory === null ? [] : [powerRangeCategory],
    meleeTargets: powerRangeCategory === "MELEE" ? Math.max(1, rangeValue || 1) : null,
    rangedTargets:
      powerRangeCategory === "RANGED"
        ? Math.max(1, asInt(raw.rangedTargets ?? packetRangeExtra.targets, 1))
        : null,
    rangedDistanceFeet: powerRangeCategory === "RANGED" ? Math.max(0, rangeValue) : null,
    aoeCenterRangeFeet: powerRangeCategory === "AOE" ? Math.max(0, rangeValue) : null,
    aoeCount:
      powerRangeCategory === "AOE" ? Math.max(1, asInt(raw.aoeCount ?? packetRangeExtra.count, 1)) : null,
    aoeShape:
      powerRangeCategory === "AOE"
        ? (asString(raw.aoeShape ?? packetRangeExtra.shape, "SPHERE").toUpperCase() as "SPHERE" | "CONE" | "LINE")
        : null,
    aoeSphereRadiusFeet:
      powerRangeCategory === "AOE" ? asInt(raw.aoeSphereRadiusFeet ?? packetRangeExtra.sphereRadiusFeet, 0) || null : null,
    aoeConeLengthFeet:
      powerRangeCategory === "AOE" ? asInt(raw.aoeConeLengthFeet ?? packetRangeExtra.coneLengthFeet, 0) || null : null,
    aoeLineWidthFeet:
      powerRangeCategory === "AOE" ? asInt(raw.aoeLineWidthFeet ?? packetRangeExtra.lineWidthFeet, 0) || null : null,
    aoeLineLengthFeet:
      powerRangeCategory === "AOE" ? asInt(raw.aoeLineLengthFeet ?? packetRangeExtra.lineLengthFeet, 0) || null : null,
    primaryDefenceGate: derivePrimaryDefenceGate(raw, finalEffectPackets),
    effectPackets: finalEffectPackets,
    intentions: finalEffectPackets.map((packet, index) => ({
      ...packet,
      sortOrder: packet.sortOrder ?? index,
      packetIndex: packet.packetIndex ?? index,
      type: packet.type ?? packet.intention,
      intention: packet.intention ?? packet.type,
    })),
    diceCount,
    potency,
    effectDurationType,
    effectDurationTurns,
    durationType: effectDurationType,
    durationTurns: effectDurationTurns,
    defenceRequirement: derivePrimaryDefenceGate(raw, effectPackets)?.gateResult ?? "NONE",
  };
}

function normalizeAttackConfig(value: unknown): MonsterNaturalAttackConfig {
  if (!value || typeof value !== "object") return {};
  return value as MonsterNaturalAttackConfig;
}

function normalizeAttack(
  value: unknown,
  sortOrder: number,
): MonsterAttack {
  const raw = (value ?? {}) as Record<string, unknown>;
  const attackName = asString(raw.attackName, "");

  return {
    sortOrder,
    attackMode: "NATURAL",
    attackName: attackName || "Natural Weapon",
    attackConfig: normalizeAttackConfig(raw.attackConfig),
  };
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    ordered.push(tag);
  }
  return ordered;
}

function clampImagePosition(value: unknown, fallback: number): number {
  const n = asNumber(value, fallback);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

export function normalizeMonsterUpsertInput(body: unknown): {
  ok: true;
  data: MonsterUpsertInput;
} | {
  ok: false;
  error: string;
} {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }

  const raw = body as Record<string, unknown>;
  const name = asString(raw.name, "");
  if (!name) return { ok: false, error: "name is required" };

  const tier = asString(raw.tier, "") as MonsterTier;
  if (!TIER_SET.has(tier)) {
    return { ok: false, error: "tier must be one of MINION, SOLDIER, ELITE, BOSS" };
  }

  const limitBreakTierRaw = asNullableString(raw.limitBreakTier);
  if (
    limitBreakTierRaw &&
    !LIMIT_BREAK_TIER_SET.has(limitBreakTierRaw as LimitBreakTier)
  ) {
    return { ok: false, error: "limitBreakTier must be one of PUSH, BREAK, TRANSCEND" };
  }
  const limitBreakTier = limitBreakTierRaw as LimitBreakTier | null;
  const limitBreakAttributeRaw = asNullableString(raw.limitBreakAttribute);
  if (
    limitBreakAttributeRaw &&
    !CORE_ATTRIBUTE_SET.has(limitBreakAttributeRaw as CoreAttribute)
  ) {
    return {
      ok: false,
      error: "limitBreakAttribute must be one of ATTACK, DEFENCE, FORTITUDE, INTELLECT, SUPPORT, BRAVERY",
    };
  }
  const limitBreakAttribute = limitBreakAttributeRaw as CoreAttribute | null;

  let limitBreakThresholdSuccesses: number | null = null;
  const thresholdRaw = raw.limitBreakThresholdSuccesses;
  if (
    thresholdRaw !== null &&
    thresholdRaw !== undefined &&
    !(typeof thresholdRaw === "string" && thresholdRaw.trim().length === 0)
  ) {
    const parsedThreshold = asInt(thresholdRaw, Number.NaN);
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 1) {
      return { ok: false, error: "limitBreakThresholdSuccesses must be an integer >= 1" };
    }
    limitBreakThresholdSuccesses = parsedThreshold;
  }

  const limitBreak2TierRaw = asNullableString(raw.limitBreak2Tier);
  if (
    limitBreak2TierRaw &&
    !LIMIT_BREAK_TIER_SET.has(limitBreak2TierRaw as LimitBreakTier)
  ) {
    return { ok: false, error: "limitBreak2Tier must be one of PUSH, BREAK, TRANSCEND" };
  }
  const limitBreak2Tier = limitBreak2TierRaw as LimitBreakTier | null;
  const limitBreak2AttributeRaw = asNullableString(raw.limitBreak2Attribute);
  if (
    limitBreak2AttributeRaw &&
    !CORE_ATTRIBUTE_SET.has(limitBreak2AttributeRaw as CoreAttribute)
  ) {
    return {
      ok: false,
      error: "limitBreak2Attribute must be one of ATTACK, DEFENCE, FORTITUDE, INTELLECT, SUPPORT, BRAVERY",
    };
  }
  const limitBreak2Attribute = limitBreak2AttributeRaw as CoreAttribute | null;

  let limitBreak2ThresholdSuccesses: number | null = null;
  const threshold2Raw = raw.limitBreak2ThresholdSuccesses;
  if (
    threshold2Raw !== null &&
    threshold2Raw !== undefined &&
    !(typeof threshold2Raw === "string" && threshold2Raw.trim().length === 0)
  ) {
    const parsedThreshold = asInt(threshold2Raw, Number.NaN);
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 1) {
      return { ok: false, error: "limitBreak2ThresholdSuccesses must be an integer >= 1" };
    }
    limitBreak2ThresholdSuccesses = parsedThreshold;
  }

  const powersRaw = Array.isArray(raw.powers) ? raw.powers : [];
  const normalizedPowers = powersRaw.map((entry, index) => normalizePower(entry, index));

  for (const power of normalizedPowers) {
    if (!power.name.trim()) return { ok: false, error: "Each power requires a name" };
    if (power.effectPackets.length < 1 || power.effectPackets.length > 4) {
      return { ok: false, error: "Each power requires 1 to 4 effect packets" };
    }
    if (power.effectDurationType !== "TURNS" && power.effectDurationTurns !== null) {
      return { ok: false, error: "effectDurationTurns is only allowed when effectDurationType is TURNS" };
    }
    for (const packet of power.effectPackets) {
      if ((packet.intention ?? packet.type ?? "ATTACK") !== "ATTACK") continue;
      const details =
        packet.detailsJson && typeof packet.detailsJson === "object" && !Array.isArray(packet.detailsJson)
          ? (packet.detailsJson as Record<string, unknown>)
          : {};
      if (countSelectedAttackDamageTypes(details) > MAX_POWER_PACKET_DAMAGE_TYPES) {
        return {
          ok: false,
          error: `Attack packets can select at most ${MAX_POWER_PACKET_DAMAGE_TYPES} damage types`,
        };
      }
    }
  }

  const tagsRaw = Array.isArray(raw.tags) ? raw.tags : [];
  const traitsRaw = Array.isArray(raw.traits) ? raw.traits : [];

  let attacks: MonsterAttack[] = [];
  if (raw.attacks != null) {
    if (!Array.isArray(raw.attacks)) {
      return { ok: false, error: "attacks must be an array" };
    }
    if (raw.attacks.length > 3) {
      return { ok: false, error: "A monster can have at most 3 attacks" };
    }
    attacks = raw.attacks.map((entry, idx) => normalizeAttack(entry, idx));
  }

  for (const attack of attacks) {
    if (attack.attackMode !== "NATURAL") {
      return {
        ok: false,
        error:
          "Equipped attacks are not supported in payload; weapon attacks are derived from equipped hand items",
      };
    }
    if (!attack.attackName?.trim()) {
      return { ok: false, error: "Each natural attack requires a name" };
    }
    if (!attack.attackConfig || typeof attack.attackConfig !== "object") {
      return { ok: false, error: "Each natural attack requires attackConfig" };
    }
  }

  const seenTraitDefinitionIds = new Set<string>();
  const normalizedTraits = traitsRaw
    .map((entry, index) => {
      if (typeof entry === "string") {
        const traitDefinitionId = asString(entry, "");
        return {
          sortOrder: index,
          traitDefinitionId,
          name: null as string | null,
          effectText: null as string | null,
        };
      }
      const row = (entry ?? {}) as Record<string, unknown>;
      const traitDefinitionId = asString(row.traitDefinitionId, "");
      const nestedTrait =
        row.trait && typeof row.trait === "object"
          ? (row.trait as Record<string, unknown>)
          : null;
      const name = asString(
        nestedTrait?.name ?? row.name ?? row.text,
        "",
      );
      const effectText = asString(
        nestedTrait?.effectText ?? row.effectText,
        "",
      );
      return {
        sortOrder: asInt(row.sortOrder, index),
        traitDefinitionId,
        name: name || null,
        effectText: effectText || null,
      };
    })
    .filter((trait) => trait.traitDefinitionId.length > 0)
    .filter((trait) => {
      if (seenTraitDefinitionIds.has(trait.traitDefinitionId)) return false;
      seenTraitDefinitionIds.add(trait.traitDefinitionId);
      return true;
    })
    .map((trait, index) => ({
      sortOrder: index,
      traitDefinitionId: trait.traitDefinitionId,
      name: trait.name ?? null,
      effectText: trait.effectText ?? null,
    }));

  const data: MonsterUpsertInput = {
    name,
    imageUrl: asNullableString(raw.imageUrl),
    imagePosX: clampImagePosition(raw.imagePosX, 50),
    imagePosY: clampImagePosition(raw.imagePosY, 35),
    level: Math.max(1, asInt(raw.level, 1)),
    tier,
    legendary: asBool(raw.legendary, false),
    mainHandItemId: asNullableString(raw.mainHandItemId),
    offHandItemId: asNullableString(raw.offHandItemId),
    smallItemId: asNullableString(raw.smallItemId),
    headArmorItemId: asNullableString(raw.headArmorItemId),
    shoulderArmorItemId: asNullableString(raw.shoulderArmorItemId),
    torsoArmorItemId: asNullableString(raw.torsoArmorItemId),
    legsArmorItemId: asNullableString(raw.legsArmorItemId),
    feetArmorItemId: asNullableString(raw.feetArmorItemId),
    headItemId: asNullableString(raw.headItemId),
    neckItemId: asNullableString(raw.neckItemId),
    armsItemId: asNullableString(raw.armsItemId),
    beltItemId: asNullableString(raw.beltItemId),
    customNotes: asString(raw.customNotes, "") || null,
    limitBreakName: asNullableString(raw.limitBreakName),
    limitBreakTier,
    limitBreakTriggerText: asNullableString(raw.limitBreakTriggerText),
    limitBreakAttribute,
    limitBreakThresholdSuccesses,
    limitBreakCostText: asNullableString(raw.limitBreakCostText),
    limitBreakEffectText: asNullableString(raw.limitBreakEffectText),
    limitBreak2Name: asNullableString(raw.limitBreak2Name),
    limitBreak2Tier,
    limitBreak2TriggerText: asNullableString(raw.limitBreak2TriggerText),
    limitBreak2Attribute,
    limitBreak2ThresholdSuccesses,
    limitBreak2CostText: asNullableString(raw.limitBreak2CostText),
    limitBreak2EffectText: asNullableString(raw.limitBreak2EffectText),
    physicalResilienceCurrent: Math.max(0, asInt(raw.physicalResilienceCurrent, 0)),
    physicalResilienceMax: Math.max(0, asInt(raw.physicalResilienceMax, 0)),
    mentalPerseveranceCurrent: Math.max(0, asInt(raw.mentalPerseveranceCurrent, 0)),
    mentalPerseveranceMax: Math.max(0, asInt(raw.mentalPerseveranceMax, 0)),
    physicalProtection: Math.max(0, asInt(raw.physicalProtection, 0)),
    mentalProtection: Math.max(0, asInt(raw.mentalProtection, 0)),
    naturalPhysicalProtection: Math.max(
      0,
      Math.min(30, asInt(raw.naturalPhysicalProtection, 0)),
    ),
    naturalMentalProtection: Math.max(
      0,
      Math.min(30, asInt(raw.naturalMentalProtection, 0)),
    ),
    attackDie: asDice(raw.attackDie, "D6"),
    attackResistDie: Math.max(0, asInt(raw.attackResistDie, 0)),
    attackModifier: asInt(raw.attackModifier, 0),
    defenceDie: asDice(raw.defenceDie, "D6"),
    defenceResistDie: Math.max(0, asInt(raw.defenceResistDie, 0)),
    defenceModifier: asInt(raw.defenceModifier, 0),
    fortitudeDie: asDice(raw.fortitudeDie, "D6"),
    fortitudeResistDie: Math.max(0, asInt(raw.fortitudeResistDie, 0)),
    fortitudeModifier: asInt(raw.fortitudeModifier, 0),
    intellectDie: asDice(raw.intellectDie, "D6"),
    intellectResistDie: Math.max(0, asInt(raw.intellectResistDie, 0)),
    intellectModifier: asInt(raw.intellectModifier, 0),
    supportDie: asDice(raw.supportDie, "D6"),
    supportResistDie: Math.max(0, asInt(raw.supportResistDie, 0)),
    supportModifier: asInt(raw.supportModifier, 0),
    braveryDie: asDice(raw.braveryDie, "D6"),
    braveryResistDie: Math.max(0, asInt(raw.braveryResistDie, 0)),
    braveryModifier: asInt(raw.braveryModifier, 0),
    weaponSkillValue: Math.max(1, asInt(raw.weaponSkillValue, 1)),
    weaponSkillModifier: asInt(raw.weaponSkillModifier, 0),
    armorSkillValue: Math.max(1, asInt(raw.armorSkillValue, 1)),
    armorSkillModifier: asInt(raw.armorSkillModifier, 0),
    tags: dedupeTags(tagsRaw.map((tag) => asString(tag, ""))),
    traits: normalizedTraits,
    naturalAttack:
      attacks.length > 0
        ? {
            attackName: attacks[0].attackName ?? "Natural Weapon",
            attackConfig: attacks[0].attackConfig ?? {},
          }
        : null,
    attacks,
    powers: normalizedPowers,
  };

  return { ok: true, data };
}
