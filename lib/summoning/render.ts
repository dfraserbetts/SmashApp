import { buildDescriptorResult } from "@/lib/descriptors/descriptorEngine";
import { renderForgeResult } from "@/lib/descriptors/renderers/forgeRenderer";
import {
  LEGACY_TRIGGER_CONDITION_TEXT_KEY,
  MAX_POWER_PACKET_DAMAGE_TYPES,
  RESERVE_RELEASE_BEHAVIOUR_OPTIONS,
  RESIST_THEME_VALUES,
  TRIGGER_CONDITION_KEYS,
  type TriggerConditionKey,
  type EffectPacket,
  type MonsterNaturalAttackConfig,
  type Power,
  type PrimaryDefenceGate,
  type ResistTheme,
  type ReserveReleaseBehaviour,
} from "@/lib/summoning/types";
function clampEffectiveModifier(raw: number): number {
  return Math.max(-5, Math.min(5, raw));
}

export function formatModifierWithEffective(raw: number): string {
  const effective = clampEffectiveModifier(raw);
  const signedRaw = raw >= 0 ? `+${raw}` : `${raw}`;
  const signedEffective = effective >= 0 ? `+${effective}` : `${effective}`;

  if (raw === effective) return signedRaw;
  return `${signedRaw} (effective ${signedEffective})`;
}

export function effectiveCooldownTurns(power: Pick<Power, "cooldownTurns" | "cooldownReduction">): number {
  return Math.max(1, power.cooldownTurns - power.cooldownReduction);
}

function signedPotency(potency: number): string {
  return potency >= 0 ? `+${potency}` : `${potency}`;
}

function plural(count: number, singular: string, pluralOverride?: string): string {
  return count === 1 ? singular : (pluralOverride ?? `${singular}s`);
}

function joinWithCommasAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function getDetailsString(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  return typeof value === "string" ? value : "";
}

function getDetailsStringArray(details: Record<string, unknown>, key: string): string[] {
  const value = details[key];
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function readStatTarget(details: Record<string, unknown>): string {
  const value = details.statTarget ?? details.statChoice ?? "Stat";
  return typeof value === "string" ? value : "Stat";
}

const LEGACY_CONTROL_MODE_MAP = new Map<string, string>([
  ["Force specific action", "Force specific main action"],
  ["Force no action", "Force no main action"],
  ["Force specific power", "Force specific power action"],
]);
const CONTROL_THEME_TO_RESIST_ATTRIBUTE = new Map<string, string>([
  ["BODY_ENDURANCE", "FORTITUDE"],
  ["MIND_COGNITION", "INTELLECT"],
  ["COURAGE_RESOLVE", "BRAVERY"],
  ["TRUST_BELONGING", "SUPPORT"],
  ["OFFENSIVE_EXECUTION", "ATTACK"],
  ["DEFENSIVE_COORDINATION", "DEFENCE"],
]);
const TRIGGER_CONDITION_SET = new Set<TriggerConditionKey>(TRIGGER_CONDITION_KEYS);
const TRIGGER_AREA_PRESENCE_KEYS = new Set<TriggerConditionKey>([
  "AREA_ENTERS",
  "AREA_LEAVES",
  "AREA_STARTS_TURN",
  "AREA_ENDS_TURN",
]);
const RESIST_THEME_SET = new Set<ResistTheme>(RESIST_THEME_VALUES);

function normalizeControlMode(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  return LEGACY_CONTROL_MODE_MAP.get(raw) ?? raw;
}

function getControlThemeResistAttribute(details: Record<string, unknown>): string | null {
  const controlMode = normalizeControlMode(details.controlMode);
  if (!controlMode) return null;
  const controlTheme =
    typeof details.controlTheme === "string" ? details.controlTheme.trim().toUpperCase() : "";
  return CONTROL_THEME_TO_RESIST_ATTRIBUTE.get(controlTheme) ?? null;
}

function cleanseEffectNeedsTheme(cleanseEffectType: string): boolean {
  return cleanseEffectType === "Active Power" || cleanseEffectType === "Channelled Power";
}

function getCleanseThemeResistAttribute(details: Record<string, unknown>): string | null {
  const cleanseEffectType = getDetailsString(details, "cleanseEffectType");
  if (!cleanseEffectNeedsTheme(cleanseEffectType)) return null;
  const cleanseTheme =
    typeof details.cleanseTheme === "string" ? details.cleanseTheme.trim().toUpperCase() : "";
  return CONTROL_THEME_TO_RESIST_ATTRIBUTE.get(cleanseTheme) ?? null;
}

function getMovementThemeResistAttribute(details: Record<string, unknown>): string | null {
  const movementTheme =
    typeof details.movementTheme === "string" ? details.movementTheme.trim().toUpperCase() : "";
  return RESIST_THEME_SET.has(movementTheme as ResistTheme)
    ? (CONTROL_THEME_TO_RESIST_ATTRIBUTE.get(movementTheme) ?? null)
    : null;
}

function readPacketApplyTo(
  effectPacket: Pick<EffectPacket, "applyTo" | "detailsJson"> | undefined,
): "PRIMARY_TARGET" | "ALLIES" | "SELF" {
  const details =
    effectPacket?.detailsJson && typeof effectPacket.detailsJson === "object" && !Array.isArray(effectPacket.detailsJson)
      ? (effectPacket.detailsJson as Record<string, unknown>)
      : {};
  const value = effectPacket?.applyTo ?? details.applyTo;
  if (value === "ALLIES") return "ALLIES";
  return value === "SELF" ? "SELF" : "PRIMARY_TARGET";
}

function getPrimaryRangeCategory(
  power: Pick<Power, "rangeCategories">,
): "MELEE" | "RANGED" | "AOE" | null {
  if ((power.rangeCategories ?? []).includes("AOE")) return "AOE";
  if ((power.rangeCategories ?? []).includes("RANGED")) return "RANGED";
  if ((power.rangeCategories ?? []).includes("MELEE")) return "MELEE";
  return null;
}

function renderFieldAlliesPhrase(
  effectTimingType: EffectPacket["effectTimingType"] | undefined,
): string {
  const timing = effectTimingType ?? "ON_CAST";
  if (timing === "START_OF_TURN" || timing === "START_OF_TURN_WHILST_CHANNELLED") {
    return "allies that start their turn inside the field";
  }
  if (timing === "END_OF_TURN" || timing === "END_OF_TURN_WHILST_CHANNELLED") {
    return "allies that end their turn inside the field";
  }
  if (timing === "ON_EXPIRY") {
    return "allies inside the field when it ends";
  }
  return "allies inside the field";
}

function applyToEntity(
  applyTo: "PRIMARY_TARGET" | "ALLIES" | "SELF",
  power: Pick<Power, "descriptorChassis" | "descriptorChassisConfig" | "rangeCategories">,
  effectPacket: Pick<EffectPacket, "effectTimingType">,
): string {
  if (applyTo === "SELF") return "the user";
  if (applyTo === "PRIMARY_TARGET") {
    const primaryRangeCategory = getPrimaryRangeCategory(power);
    if (primaryRangeCategory === "AOE") return "targets within the area";
    return "the target";
  }

  if (power.descriptorChassis === "FIELD") {
    return renderFieldAlliesPhrase(effectPacket.effectTimingType);
  }
  if (power.descriptorChassis === "ATTACHED") {
    return "allies within range of the attached host";
  }

  const primaryRangeCategory = getPrimaryRangeCategory(power);
  if (primaryRangeCategory === "AOE") return "allies within the area";
  if (primaryRangeCategory === "RANGED") return "allies within range";
  if (primaryRangeCategory === "MELEE") return "adjacent allies";
  return "allies";
}

function formatPrimaryBaseClauseForRange(
  effectPacket: EffectPacket | undefined,
  baseClause: string,
  rangeCategory: string,
): string {
  if (!effectPacket || rangeCategory !== "AOE") return baseClause;

  if (effectPacket.intention === "MOVEMENT") {
    const replaced = baseClause.replace(/\bthe target\b/gi, "targets within the area");
    return replaced === baseClause ? `${baseClause} for targets within the area` : replaced;
  }

  if (effectPacket.intention === "CLEANSE") {
    return `${baseClause} from targets within the area`;
  }

  return `${baseClause} to targets within the area`;
}

function getSortedEffectPackets(
  power: Pick<Power, "effectPackets" | "intentions">,
): EffectPacket[] {
  const rawPackets = Array.isArray(power.effectPackets)
    ? power.effectPackets
    : Array.isArray(power.intentions)
      ? power.intentions
      : [];
  return [...rawPackets]
    .map((packet, index) => ({
      ...packet,
      packetIndex: packet.packetIndex ?? packet.sortOrder ?? index,
      intention: packet.intention ?? packet.type ?? "ATTACK",
    }))
    .sort((a, b) => (a.packetIndex ?? 0) - (b.packetIndex ?? 0));
}

function getPacketDiceCount(
  effectPacket: Pick<EffectPacket, "diceCount"> | undefined,
  power: Pick<Power, "diceCount">,
): number {
  return effectPacket?.diceCount ?? power.diceCount;
}

function getPacketPotency(
  effectPacket: Pick<EffectPacket, "potency"> | undefined,
  power: Pick<Power, "potency">,
): number {
  return effectPacket?.potency ?? power.potency;
}

function getPrimaryRangeDetails(
  power: Pick<
    Power,
    | "rangeCategories"
    | "meleeTargets"
    | "rangedTargets"
    | "rangedDistanceFeet"
    | "aoeCenterRangeFeet"
    | "aoeCount"
    | "aoeShape"
    | "aoeSphereRadiusFeet"
    | "aoeConeLengthFeet"
    | "aoeLineWidthFeet"
    | "aoeLineLengthFeet"
  >,
  fallbackDetails: Record<string, unknown>,
): Record<string, unknown> {
  if ((power.rangeCategories ?? []).includes("AOE")) {
    return {
      rangeCategory: "AOE",
      rangeValue: power.aoeCenterRangeFeet ?? 0,
      rangeExtra: {
        count: power.aoeCount ?? 1,
        shape: power.aoeShape ?? "SPHERE",
        sphereRadiusFeet: power.aoeSphereRadiusFeet ?? undefined,
        coneLengthFeet: power.aoeConeLengthFeet ?? undefined,
        lineWidthFeet: power.aoeLineWidthFeet ?? undefined,
        lineLengthFeet: power.aoeLineLengthFeet ?? undefined,
      },
    };
  }
  if ((power.rangeCategories ?? []).includes("RANGED")) {
    return {
      rangeCategory: "RANGED",
      rangeValue: power.rangedDistanceFeet ?? 30,
      rangeExtra: {
        targets: power.rangedTargets ?? 1,
      },
    };
  }
  if ((power.rangeCategories ?? []).includes("MELEE")) {
    return {
      rangeCategory: "MELEE",
      rangeValue: power.meleeTargets ?? 1,
      rangeExtra: {},
    };
  }
  return fallbackDetails;
}

function readDescriptorConfigText(
  config: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = config?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function stripTrailingPeriod(value: string): string {
  return value.trim().replace(/[.]+$/, "");
}

function stripTrailingComma(value: string): string {
  return value.trim().replace(/[,]+$/, "");
}

function capitalizeSentenceStart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function lowercaseSentenceStart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

function readPacketTriggerConditionText(effectPacket: EffectPacket | undefined): string {
  const details =
    effectPacket?.detailsJson && typeof effectPacket.detailsJson === "object" && !Array.isArray(effectPacket.detailsJson)
      ? (effectPacket.detailsJson as Record<string, unknown>)
      : {};
  return String(
    effectPacket?.triggerConditionText ??
      getDetailsString(details, "triggerConditionText") ??
      getDetailsString(details, LEGACY_TRIGGER_CONDITION_TEXT_KEY),
  ).trim();
}

function normalizeTriggerConditionKey(value: unknown): TriggerConditionKey | null {
  return TRIGGER_CONDITION_SET.has(value as TriggerConditionKey)
    ? (value as TriggerConditionKey)
    : null;
}

function mapLegacyTriggerConditionTextToKey(value: unknown): TriggerConditionKey | null {
  const normalized = String(value ?? "").trim().toLowerCase();
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

function readTriggerConditionKey(value: unknown): TriggerConditionKey | null {
  return normalizeTriggerConditionKey(value) ?? mapLegacyTriggerConditionTextToKey(value);
}

function readSecondaryScalingMode(details: Record<string, unknown>): "PER_SUCCESS" | "PRIMARY_APPLIED_SUCCESSES" | "PRIMARY_WOUND_BANDS" {
  const value = getDetailsString(details, "secondaryScalingMode").trim().toUpperCase();
  if (value === "PRIMARY_APPLIED_SUCCESSES") return "PRIMARY_APPLIED_SUCCESSES";
  if (value === "PRIMARY_WOUND_BANDS") return "PRIMARY_WOUND_BANDS";
  return "PER_SUCCESS";
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
    primaryPacket.detailsJson && typeof primaryPacket.detailsJson === "object" && !Array.isArray(primaryPacket.detailsJson)
      ? (primaryPacket.detailsJson as Record<string, unknown>)
      : {};
  const selectedDamageTypeCount = getDetailsStringArray(details, "damageTypes")
    .map((entry) => entry.trim())
    .filter(Boolean).length;
  const potency = Math.max(1, Number(primaryPacket.potency ?? 1));
  const effectiveDamageTypeCount = Math.max(
    1,
    Math.min(MAX_POWER_PACKET_DAMAGE_TYPES, selectedDamageTypeCount),
  );
  return potency * 2 * effectiveDamageTypeCount;
}

function readPositiveWholeNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : null;
  if (parsed === null || !Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function normalizeChargeType(value: unknown): "DELAYED_RELEASE" | "BUILD_POWER" {
  return value === "BUILD_POWER" ? "BUILD_POWER" : "DELAYED_RELEASE";
}

function getAllowedChargeTypesForChassis(): Array<"DELAYED_RELEASE" | "BUILD_POWER"> {
  return ["DELAYED_RELEASE", "BUILD_POWER"];
}

function normalizeChargeDescriptorConfig(
  descriptorChassisConfig: Record<string, unknown>,
  commitmentModifier: Power["commitmentModifier"] | undefined,
  descriptorChassis: Power["descriptorChassis"],
  chargeTypeValue?: Power["chargeType"],
  chargeTurnsValue?: Power["chargeTurns"],
  chargeBonusDicePerTurnValue?: Power["chargeBonusDicePerTurn"],
): {
  chargeType: "DELAYED_RELEASE" | "BUILD_POWER";
  chargeTurns: number;
  chargeBonusDicePerTurn: number | null;
} | null {
  if (commitmentModifier !== "CHARGE") return null;
  const rawChargeType = normalizeChargeType(chargeTypeValue ?? descriptorChassisConfig.chargeType);
  const allowedChargeTypes = getAllowedChargeTypesForChassis();
  const chargeType = allowedChargeTypes.includes(rawChargeType)
    ? rawChargeType
    : allowedChargeTypes[0];
  return {
    chargeType,
    chargeTurns: readPositiveWholeNumber(chargeTurnsValue ?? descriptorChassisConfig.chargeTurns) ?? 1,
    chargeBonusDicePerTurn:
      chargeType === "BUILD_POWER"
        ? readPositiveWholeNumber(chargeBonusDicePerTurnValue ?? descriptorChassisConfig.chargeBonusDicePerTurn) ?? 1
        : null,
  };
}

function formatDieCount(count: number): string {
  return `${count} ${count === 1 ? "die" : "dice"}`;
}

function formatCountedUnit(
  count: number | string | null | undefined,
  singular: string,
  pluralOverride?: string,
): string {
  const parsedCount =
    typeof count === "number" && Number.isFinite(count)
      ? count
      : typeof count === "string" && count.trim().length > 0 && Number.isFinite(Number(count))
        ? Number(count)
        : null;
  const noun = parsedCount === null ? (pluralOverride ?? `${singular}s`) : plural(parsedCount, singular, pluralOverride);
  return `${count ?? "?"} ${noun}`;
}

const RESERVE_RELEASE_BEHAVIOUR_SET = new Set<ReserveReleaseBehaviour>(RESERVE_RELEASE_BEHAVIOUR_OPTIONS);

function coerceReserveReleaseBehaviour(
  value: unknown,
): ReserveReleaseBehaviour | null {
  return RESERVE_RELEASE_BEHAVIOUR_SET.has(value as ReserveReleaseBehaviour)
    ? (value as ReserveReleaseBehaviour)
    : null;
}

function mapLegacyReleaseBehaviourTextToKey(
  value: unknown,
): ReserveReleaseBehaviour | null {
  const normalized = String(value ?? "").trim().toLowerCase();
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

function renderReserveReleaseBehaviourSentence(
  releaseBehaviour: ReserveReleaseBehaviour,
): string {
  switch (releaseBehaviour) {
    case "ACTION_ONLY":
      return "It may be released with a Power Action on your turn only.";
    case "RESPONSE_ONLY":
      return "It may be released as a Response only.";
    case "ON_EXPIRY":
      return "It releases automatically when it expires.";
    default:
      return "It may be released with a Power Action on your turn or as a Response.";
  }
}

function normalizeTriggerMethod(value: unknown): "ARM_AND_THEN_TARGET" | "TARGET_AND_THEN_ARM" {
  return value === "TARGET_AND_THEN_ARM" ? "TARGET_AND_THEN_ARM" : "ARM_AND_THEN_TARGET";
}

function buildReserveHoldClause(
  power: Pick<Power, "lifespanType" | "lifespanTurns">,
): string {
  if (power.lifespanType === "TURNS") {
    return ` for up to ${formatCountedUnit(power.lifespanTurns, "turn")}`;
  }
  if (power.lifespanType === "PASSIVE") {
    return " until it ends or is removed";
  }
  return "";
}

function shouldUseNonReserveChargeCastWording(
  descriptorChassis: Power["descriptorChassis"],
  chargeConfig:
    | {
        chargeType: "DELAYED_RELEASE" | "BUILD_POWER";
        chargeTurns: number;
        chargeBonusDicePerTurn: number | null;
      }
    | null,
): boolean {
  return descriptorChassis !== "RESERVE" && !!chargeConfig;
}

function shouldUseNonReserveDelayedCastPrefix(
  descriptorChassis: Power["descriptorChassis"],
  chargeConfig:
    | {
        chargeType: "DELAYED_RELEASE" | "BUILD_POWER";
        chargeTurns: number;
        chargeBonusDicePerTurn: number | null;
      }
    | null,
): boolean {
  return descriptorChassis !== "RESERVE" && chargeConfig?.chargeType === "DELAYED_RELEASE";
}

function getPrimaryDisplayTimingType(
  descriptorChassis: Power["descriptorChassis"],
  effectTimingType: EffectPacket["effectTimingType"] | undefined,
  chargeConfig:
    | {
        chargeType: "DELAYED_RELEASE" | "BUILD_POWER";
        chargeTurns: number;
        chargeBonusDicePerTurn: number | null;
      }
    | null,
): EffectPacket["effectTimingType"] {
  const timing = (effectTimingType ?? "ON_CAST") as EffectPacket["effectTimingType"];
  if (!chargeConfig) return timing;
  if (chargeConfig.chargeType === "DELAYED_RELEASE") {
    return descriptorChassis === "RESERVE" ? "ON_RELEASE" : timing;
  }
  if (chargeConfig.chargeType === "BUILD_POWER" && timing === "ON_CAST") return "ON_RELEASE";
  return timing;
}

function getSecondaryDisplayTimingType(
  descriptorChassis: Power["descriptorChassis"],
  effectTimingType: EffectPacket["effectTimingType"] | undefined,
  chargeConfig:
    | {
        chargeType: "DELAYED_RELEASE" | "BUILD_POWER";
        chargeTurns: number;
        chargeBonusDicePerTurn: number | null;
      }
    | null,
): EffectPacket["effectTimingType"] {
  const timing = (effectTimingType ?? "ON_CAST") as EffectPacket["effectTimingType"];
  if (!chargeConfig) return timing;
  if (chargeConfig.chargeType === "DELAYED_RELEASE") {
    return descriptorChassis === "RESERVE" && timing === "ON_CAST" ? "ON_RELEASE" : timing;
  }
  if (timing === "ON_CAST") return "ON_RELEASE";
  return timing;
}

function buildPrimaryRollClause(params: {
  baseDiceCount: number;
  timingPrefix: string | null;
  chargeConfig:
    | {
        chargeType: "DELAYED_RELEASE" | "BUILD_POWER";
        chargeTurns: number;
        chargeBonusDicePerTurn: number | null;
      }
    | null;
}): string {
  const { baseDiceCount, timingPrefix, chargeConfig } = params;
  if (chargeConfig?.chargeType === "BUILD_POWER") {
    const rollText = `roll ${formatDieCount(baseDiceCount)} plus ${formatDieCount(chargeConfig.chargeBonusDicePerTurn ?? 1)} per turn charged`;
    return timingPrefix ? `${timingPrefix} ${rollText}.` : `${capitalizeSentenceStart(rollText)}.`;
  }
  return timingPrefix
    ? `${timingPrefix} roll ${formatDieCount(baseDiceCount)}.`
    : `Roll ${formatDieCount(baseDiceCount)}.`;
}

function derivePrimaryDefenceCheckFromGate(
  gate: PrimaryDefenceGate | null | undefined,
  effectPacket: EffectPacket | undefined,
  isMultiTarget: boolean,
): { checkLabel: string; isMultiTarget: boolean } | null {
  if (!gate) return null;
  if (gate.gateResult === "NONE") return null;
  if (gate.gateResult === "DODGE") return { checkLabel: "Dodge", isMultiTarget };
  if (gate.gateResult === "DODGE_OR_PROTECTION") {
    return { checkLabel: "Dodge or Protection", isMultiTarget };
  }
  if (gate.gateResult === "PROTECTION") {
    const label = gate.protectionChannel === "MENTAL" ? "Mental Defence" : "Physical Defence";
    return { checkLabel: label, isMultiTarget };
  }
  if (gate.gateResult === "RESIST") {
    const label = gate.resistAttribute ? `${humanizeLabel(gate.resistAttribute)} Resist` : "Resist";
    return { checkLabel: label, isMultiTarget };
  }
  return derivePrimaryDefenceCheck(effectPacket, "SELF", 1, 1);
}

function formatSecondaryClause(
  intentionType: EffectPacket["intention"],
  baseClause: string,
  details: Record<string, unknown>,
  applyTo: "PRIMARY_TARGET" | "ALLIES" | "SELF",
  powerPotency: number,
  power: Pick<Power, "descriptorChassis" | "descriptorChassisConfig" | "rangeCategories">,
  effectPacket: Pick<EffectPacket, "effectTimingType">,
  omitRecipientContext?: boolean,
): string {
  const entity = applyToEntity(applyTo, power, effectPacket);

  // Intention-specific grammar for secondary intentions:
  if (intentionType === "DEFENCE") {
    const mode = getDetailsString(details, "attackMode").trim().toUpperCase() === "MENTAL" ? "mental" : "physical";
    if (omitRecipientContext) {
      return `blocks ${powerPotency} ${mode} wounds suffered`;
    }
    return `blocks ${powerPotency} ${mode} wounds suffered by ${entity}`;
  }

  if (intentionType === "HEALING") {
    const mode = getDetailsString(details, "healingMode").trim().toUpperCase() === "MENTAL" ? "mental" : "physical";
    if (omitRecipientContext) {
      return `heals for ${powerPotency} ${mode} wounds`;
    }
    return `heals ${entity} for ${powerPotency} ${mode} wounds`;
  }

  if (intentionType === "CLEANSE") {
    const cleanseEffectType = getDetailsString(details, "cleanseEffectType");

    if (cleanseEffectType === "Effect over time") {
      if (omitRecipientContext) {
        return `removes ${powerPotency} stacks of the chosen effect`;
      }
      return `removes ${powerPotency} stacks of the chosen effect from ${entity}`;
    }

    if (cleanseEffectType === "Damage over time") {
      if (omitRecipientContext) {
        return `removes ${powerPotency} ongoing damage`;
      }
      return `removes ${powerPotency} ongoing damage from ${entity}`;
    }

    if (cleanseEffectType === "Active Power" || cleanseEffectType === "Channelled Power") {
      if (omitRecipientContext) {
        return `removes ${powerPotency} successes from the chosen power`;
      }
      return `removes ${powerPotency} successes from the chosen power affecting ${entity}`;
    }

    // Fallback: keep it sensible and non-redundant.
    if (omitRecipientContext) {
      return `removes ${powerPotency} stacks of the chosen effect`;
    }
    return `removes ${powerPotency} stacks of the chosen effect from ${entity}`;
  }

  if (intentionType === "MOVEMENT") {
    const movementMode = humanizeLabel(getDetailsString(details, "movementMode")) || "Move";
    const feet = powerPotency * 5;

    if (/force/i.test(movementMode)) {
      // "Force Push/Fly/Teleport" -> "pushes/flies/teleports the target X ft"
      if (/teleport/i.test(movementMode)) return `teleports ${entity} ${feet} ft`;
      if (/fly/i.test(movementMode)) return `flies ${entity} ${feet} ft`;
      return `pushes ${entity} ${feet} ft`;
    }

    // Non-force movement should not mention entity here for secondary;
    // the designer intent is that self-move is handled by the non-force version.
    if (/teleport/i.test(movementMode)) return `teleports ${feet} ft`;
    if (/fly/i.test(movementMode)) return `moves ${feet} ft by flying`;
    return `moves ${feet} ft`;
  }

  // Default: preserve existing clause and append a minimal target phrase
  // (Attack stays acceptable with "to the user/target", control/augment/debuff already read fine).
  if (omitRecipientContext) {
    return baseClause;
  }
  return `${baseClause} to ${entity}`;
}

function humanizeLabel(value: string): string {
  const normalized = String(value ?? "").trim().replace(/_/g, " ");
  if (!normalized) return "";
  return normalized
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readNumber(details: Record<string, unknown> | null | undefined, key: string): number | null {
  const v = details?.[key];
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function normalizeCoreDefenceStat(statTarget: string): string | null {
  const normalized = statTarget.trim().toLowerCase();
  if (normalized === "attack") return "Attack";
  if (normalized === "defence") return "Defence";
  if (normalized === "fortitude") return "Fortitude";
  if (normalized === "intellect") return "Intellect";
  if (normalized === "support") return "Support";
  if (normalized === "bravery") return "Bravery";
  return null;
}

function derivePrimaryDefenceCheck(
  intention: EffectPacket | undefined,
  rangeCategory: string,
  meleeTargets: number,
  rangedTargets: number,
): { checkLabel: string; isMultiTarget: boolean } | null {
  if (!intention) return null;

  const details = (intention.detailsJson ?? {}) as Record<string, unknown>;
  let checkLabel: string | null = null;

  if (intention.intention === "ATTACK") {
    const mode = getDetailsString(details, "attackMode").trim().toUpperCase();
    checkLabel = mode === "MENTAL" ? "Mental Defence" : "Physical Defence";
  } else if (intention.intention === "CONTROL") {
    const resistAttribute = getControlThemeResistAttribute(details);
    checkLabel = resistAttribute ? `${humanizeLabel(resistAttribute)} Resist` : "Resist";
  } else if (intention.intention === "MOVEMENT") {
    const resistAttribute = getMovementThemeResistAttribute(details);
    checkLabel = resistAttribute ? `${humanizeLabel(resistAttribute)} Resist` : "Resist";
  } else if (intention.intention === "DEBUFF") {
    const statTarget = normalizeCoreDefenceStat(readStatTarget(details));
    checkLabel = statTarget ? `${statTarget} Resist` : "Resist";
  } else if (intention.intention === "CLEANSE") {
    const cleanseEffectType = getDetailsString(details, "cleanseEffectType");
    if (cleanseEffectType === "Effect over time" || cleanseEffectType === "Damage over time") {
      checkLabel = "Fortitude Resist";
    } else {
      const resistAttribute = getCleanseThemeResistAttribute(details);
      checkLabel = resistAttribute ? `${humanizeLabel(resistAttribute)} Resist` : "Resist";
    }
  }

  if (!checkLabel) return null;

  const isMultiTarget =
    rangeCategory === "AOE" ||
    (rangeCategory === "MELEE" && meleeTargets > 1) ||
    (rangeCategory === "RANGED" && rangedTargets > 1);

  return { checkLabel, isMultiTarget };
}

function renderEffectPacketDetail(
  effectPacket: EffectPacket,
  potency: number,
): string {
  const details = effectPacket.detailsJson ?? {};

  switch (effectPacket.intention) {
    case "ATTACK":
      return `inflict ${potency * 2} wounds`;
    case "HEALING":
      return `restore ${potency} wound${potency === 1 ? "" : "s"}`;
    case "DEFENCE":
      return `block ${potency} wound${potency === 1 ? "" : "s"}`;
    case "AUGMENT": {
      const stat = String(details.statChoice ?? "Stat");
      return `gain 1 stack of ${signedPotency(potency)} ${stat}`;
    }
    case "DEBUFF": {
      const stat = String(details.statChoice ?? "Stat");
      return `apply 1 stack of -${potency} ${stat}`;
    }
    case "CONTROL": {
      const mode = String(details.controlMode ?? "APPLY_PRESSURE");
      if (mode === "REMOVE_PROGRESS") {
        return `remove ${potency} successes from the targeted effect`;
      }
      const controlEffect = String(details.controlEffect ?? "Control Effect");
      return `apply ${potency} stacks of ${controlEffect}`;
    }
    case "CLEANSE": {
      const effectType = String(details.cleanseEffectType ?? "selected effect type");
      return `remove ${potency} from ${effectType}`;
    }
    case "MOVEMENT":
      return `move the target ${potency * 5} feet`;
    case "SUMMONING":
      return "resolve summon effect (V2 tooling)";
    case "TRANSFORMATION":
      return "resolve transformation effect (V2 tooling)";
    default:
      return "resolve effect";
  }
}

function buildRangeLead(
  descriptorChassis: Power["descriptorChassis"] | undefined,
  rangeCategory: string,
  rangeValue: number | null,
  rangeExtra: Record<string, unknown>,
): string {
  const meleeTargets = asNumber(rangeValue) ?? 1;
  const rangedTargets = asNumber(rangeExtra.targets) ?? 1;
  const aoeCount = asNumber(rangeExtra.count) ?? 1;
  const aoeShape = getDetailsString(rangeExtra, "shape").trim().toUpperCase() || "SPHERE";

  if (rangeCategory === "SELF") {
    return "Target self.";
  }
  if (rangeCategory === "MELEE") {
    if (meleeTargets > 1) {
      return `Choose up to ${meleeTargets} adjacent ${plural(meleeTargets, "target")}.`;
    }
    return `Choose ${meleeTargets} adjacent ${plural(meleeTargets, "target")}.`;
  }
  if (rangeCategory === "RANGED") {
    if (rangedTargets > 1) {
      return `Choose up to ${rangedTargets} ${plural(rangedTargets, "target")} within ${rangeValue ?? "?"} ft.`;
    }
    return `Choose ${rangedTargets} ${plural(rangedTargets, "target")} within ${rangeValue ?? "?"} ft.`;
  }
  if (rangeCategory === "AOE") {
    const sphereRadius = readNumber(rangeExtra, "sphereRadiusFeet");
    const coneLength = readNumber(rangeExtra, "coneLengthFeet");
    const lineWidth = readNumber(rangeExtra, "lineWidthFeet");
    const lineLength = readNumber(rangeExtra, "lineLengthFeet");
    const isSelfOriginSphere = rangeValue === 0 && aoeShape === "SPHERE";
    const castRangePhrase =
      rangeValue === 0
        ? (aoeShape === "SPHERE" ? "centered on your current space" : "emanating from self")
        : `within ${rangeValue ?? "?"} ft`;

    if (aoeShape === "SPHERE") {
      if (isSelfOriginSphere) {
        if (descriptorChassis === "ATTACHED") {
          if (aoeCount > 1) {
            return `Create ${aoeCount} spheres, each with a ${sphereRadius ?? "?"} ft radius, attached to yourself.`;
          }
          return `Create a ${sphereRadius ?? "?"} ft radius sphere attached to yourself.`;
        }
        if (aoeCount > 1) {
          return `Create ${aoeCount} spheres, each with a ${sphereRadius ?? "?"} ft radius, centered on your current space.`;
        }
        return `Create a ${sphereRadius ?? "?"} ft radius sphere centered on your current space.`;
      }
      return `Choose ${aoeCount} ${plural(aoeCount, "sphere")} with a ${sphereRadius ?? "?"} ft radius ${castRangePhrase}.`;
    }
    if (aoeShape === "CONE") {
      return `Choose ${aoeCount} ${plural(aoeCount, "cone")} ${coneLength ?? "?"} ft long ${castRangePhrase}.`;
    }
    if (aoeShape === "LINE") {
      return `Choose ${aoeCount} ${plural(aoeCount, "line")} ${lineWidth ?? "?"} ft wide and ${lineLength ?? "?"} ft long ${castRangePhrase}.`;
    }

    const shapeLabel = humanizeLabel(aoeShape) || "area";
    return `Choose ${aoeCount} ${shapeLabel}${plural(aoeCount, "", "s")} ${castRangePhrase}.`;
  }

  return "Choose 1 target.";
}

function isSelfOriginSphereRange(
  rangeCategory: string,
  rangeValue: number | null,
  rangeExtra: Record<string, unknown>,
): boolean {
  const aoeShape = getDetailsString(rangeExtra, "shape").trim().toUpperCase() || "SPHERE";
  return rangeCategory === "AOE" && rangeValue === 0 && aoeShape === "SPHERE";
}

function normalizeAttachedHostAnchorType(value: unknown): Power["attachedHostAnchorType"] {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (
    normalized === "TARGET" ||
    normalized === "OBJECT" ||
    normalized === "WEAPON" ||
    normalized === "ARMOR" ||
    normalized === "SELF" ||
    normalized === "AREA"
  ) {
    return normalized as NonNullable<Power["attachedHostAnchorType"]>;
  }
  return null;
}

function readLegacyAttachedAnchorText(
  descriptorChassisConfig: Record<string, unknown>,
): string {
  return readDescriptorConfigText(descriptorChassisConfig, "anchorText");
}

function renderAttachedAnchorText(
  anchorType: Power["attachedHostAnchorType"],
  legacyAnchorText: string,
): string {
  if (anchorType === "TARGET") return "the target";
  if (anchorType === "OBJECT") return "the object";
  if (anchorType === "WEAPON") return "your weapon";
  if (anchorType === "ARMOR") return "your armor";
  if (anchorType === "SELF") return "self";
  if (anchorType === "AREA") return "the area";
  return legacyAnchorText || "the chosen host";
}

function isAttachedSelfHost(
  anchorType: Power["attachedHostAnchorType"],
  anchorText: string,
): boolean {
  return anchorType === "SELF" || /^(self|yourself)$/i.test(anchorText.trim());
}

function renderAttachedSelfHostPhrase(anchorText: string): string {
  const trimmed = anchorText.trim();
  if (!trimmed) return "yourself";
  if (/^(self|yourself)$/i.test(trimmed)) return "yourself";
  if (/^(your|the|a|an)\b/i.test(trimmed)) return trimmed;
  return `your ${trimmed}`;
}

function buildAttachedSelfOriginSphereLine(params: {
  rangeExtra: Record<string, unknown>;
  anchorText: string;
  lifespanType: Power["lifespanType"];
  lifespanTurns: number | null | undefined;
}): string {
  const sphereRadius = readNumber(params.rangeExtra, "sphereRadiusFeet");
  const aoeCount = asNumber(params.rangeExtra.count) ?? 1;
  const hostPhrase = renderAttachedSelfHostPhrase(params.anchorText);
  const lifespanText =
    params.lifespanType === "TURNS"
      ? ` for up to ${formatCountedUnit(params.lifespanTurns, "turn")}`
      : params.lifespanType === "PASSIVE"
        ? " until it ends or is removed"
        : "";

  if (aoeCount > 1) {
    return `Create ${aoeCount} spheres, each with a ${sphereRadius ?? "?"} ft radius, attached to ${hostPhrase}${lifespanText}.`;
  }

  return `Create a ${sphereRadius ?? "?"} ft radius sphere attached to ${hostPhrase}${lifespanText}.`;
}

function renderPacketEffectDurationSuffix(
  effectPacket: Pick<EffectPacket, "effectDurationType" | "effectDurationTurns">,
): string | null {
  const durationType = effectPacket.effectDurationType ?? "INSTANT";
  if (durationType === "INSTANT") return null;
  if (durationType === "UNTIL_TARGET_NEXT_TURN") {
    return "until the start of the target's next turn";
  }
  if (durationType === "TURNS") {
    return `for ${formatCountedUnit(effectPacket.effectDurationTurns, "turn")}`;
  }
  if (durationType === "PASSIVE") {
    return "until it ends or is removed";
  }
  return null;
}

function renderRepeatingDirectEffectSuffix(
  effectPacket: Pick<EffectPacket, "effectDurationType" | "effectDurationTurns">,
): string | null {
  if ((effectPacket.effectDurationType ?? "INSTANT") !== "TURNS") return null;
  return `at the start of their next ${formatCountedUnit(effectPacket.effectDurationTurns, "turn")}`;
}

function combineRangeLeadWithRollClause(
  rangeLead: string,
  rollClause: string,
  rangeCategory: string,
  isMultiTarget: boolean,
): string {
  const loweredRollClause = lowercaseSentenceStart(rollClause);
  const strippedLead = stripTrailingPeriod(rangeLead);
  const canCombineWithChooseLead =
    /^(choose|create)\b/i.test(strippedLead) ||
    rangeCategory === "MELEE" ||
    rangeCategory === "RANGED" ||
    isMultiTarget;
  if (
    canCombineWithChooseLead &&
    /^on cast,\s+roll\b/i.test(loweredRollClause)
  ) {
    const rollOnlyClause = loweredRollClause.replace(/^on cast,\s+/i, "");
    return `On cast, ${lowercaseSentenceStart(strippedLead)} and ${rollOnlyClause}`;
  }
  if (
    canCombineWithChooseLead &&
    /^roll\b/i.test(loweredRollClause)
  ) {
    return `${strippedLead} and ${loweredRollClause}`;
  }
  return `${rangeLead} ${rollClause}`.replace(/\s+/g, " ").trim();
}

function renderFieldEffectTimingSuffix(
  powerName: string,
  effectTimingType: EffectPacket["effectTimingType"] | undefined,
): string | null {
  const timing = effectTimingType ?? "ON_CAST";
  if (timing === "START_OF_TURN") return "at the start of the target's turn";
  if (timing === "END_OF_TURN") return "at the end of the target's turn";
  if (timing === "START_OF_TURN_WHILST_CHANNELLED") return "at the start of the target's turn";
  if (timing === "END_OF_TURN_WHILST_CHANNELLED") return "at the end of the target's turn";
  if (timing === "ON_EXPIRY") return `when ${powerName} ends`;
  return null;
}

function renderFieldAffectedTargetQualifier(
  effectTimingType: EffectPacket["effectTimingType"] | undefined,
): string | null {
  const timing = effectTimingType ?? "ON_CAST";
  if (timing === "START_OF_TURN" || timing === "START_OF_TURN_WHILST_CHANNELLED") {
    return "to targets that start their turn inside the field";
  }
  if (timing === "END_OF_TURN" || timing === "END_OF_TURN_WHILST_CHANNELLED") {
    return "to targets that end their turn inside the field";
  }
  if (timing === "ON_EXPIRY") {
    return "to targets inside the field when it ends";
  }
  return null;
}

function renderFieldRepeatingDirectEffectSentence(
  effectPacket: EffectPacket | undefined,
): string | null {
  if (!effectPacket) return null;
  if (effectPacket.intention !== "ATTACK") return null;
  if ((effectPacket.effectDurationType ?? "INSTANT") !== "TURNS") return null;
  return `Any damage inflicted this way is repeated at the start of the target's next ${formatCountedUnit(effectPacket.effectDurationTurns, "turn")}.`;
}

function renderTriggerArmedDurationText(
  power: Pick<Power, "lifespanType" | "lifespanTurns">,
): string {
  if (power.lifespanType === "TURNS") {
    return `for ${formatCountedUnit(power.lifespanTurns, "turn")}`;
  }
  if (power.lifespanType === "PASSIVE") {
    return "until it ends or is removed";
  }
  return "until it ends";
}

function renderTriggerWatchTargetPhrase(
  rangeCategory: string,
  rangeValue: number | null,
  rangeExtra: Record<string, unknown>,
): string {
  const meleeTargets = asNumber(rangeValue) ?? 1;
  const rangedTargets = asNumber(rangeExtra.targets) ?? 1;
  const aoeCount = asNumber(rangeExtra.count) ?? 1;
  if (rangeCategory === "MELEE") {
    return meleeTargets > 1
      ? `up to ${meleeTargets} adjacent ${plural(meleeTargets, "target")}`
      : "an adjacent target";
  }
  if (rangeCategory === "RANGED") {
    return rangedTargets > 1
      ? `up to ${rangedTargets} ${plural(rangedTargets, "target")} within ${rangeValue ?? "?"} ft.`
      : `a target within ${rangeValue ?? "?"} ft.`;
  }
  if (rangeCategory === "AOE") {
    return aoeCount > 1 ? `targets within the chosen areas` : "targets within the chosen area";
  }
  if (rangeCategory === "SELF") return "self";
  return "a target";
}

function renderTriggerArmedSubject(
  rangeCategory: string,
  rangeValue: number | null,
  rangeExtra: Record<string, unknown>,
): string {
  const meleeTargets = asNumber(rangeValue) ?? 1;
  const rangedTargets = asNumber(rangeExtra.targets) ?? 1;
  const aoeCount = asNumber(rangeExtra.count) ?? 1;
  if (rangeCategory === "MELEE") {
    return meleeTargets > 1 ? "those targets" : "that target";
  }
  if (rangeCategory === "RANGED") {
    return rangedTargets > 1 ? "those targets" : "that target";
  }
  if (rangeCategory === "AOE") {
    return aoeCount > 1 ? "those areas" : "that area";
  }
  if (rangeCategory === "SELF") return "self";
  return "that target";
}

function renderTriggerSelectionPhrase(
  rangeCategory: string,
  rangeValue: number | null,
  rangeExtra: Record<string, unknown>,
): string {
  return lowercaseSentenceStart(stripTrailingPeriod(buildRangeLead(undefined, rangeCategory, rangeValue, rangeExtra)));
}

function renderTargetLockedTriggerSubject(
  triggerConditionKey: TriggerConditionKey,
  rangeCategory: string,
  rangeValue: number | null,
  rangeExtra: Record<string, unknown>,
): string {
  const meleeTargets = asNumber(rangeValue) ?? 1;
  const rangedTargets = asNumber(rangeExtra.targets) ?? 1;
  if (rangeCategory === "SELF") return "you";
  if (rangeCategory === "MELEE") return meleeTargets > 1 ? "a target" : "the target";
  if (rangeCategory === "RANGED") return rangedTargets > 1 ? "a target" : "the target";
  if (rangeCategory === "AOE") {
    return TRIGGER_AREA_PRESENCE_KEYS.has(triggerConditionKey) ? "a target" : "a target in the area";
  }
  return "the target";
}

function renderArmFirstTriggerSubject(
  triggerConditionKey: TriggerConditionKey,
  rangeCategory: string,
  rangeValue: number | null,
  rangeExtra: Record<string, unknown>,
): string {
  if (rangeCategory === "SELF") return "you";
  if (rangeCategory === "AOE") {
    if (TRIGGER_AREA_PRESENCE_KEYS.has(triggerConditionKey)) return "a target";
    if ((rangeValue ?? 0) > 0) return `a target within ${rangeValue ?? "?"} ft`;
    const aoeShape = getDetailsString(rangeExtra, "shape").trim().toUpperCase() || "SPHERE";
    const sphereRadius = readNumber(rangeExtra, "sphereRadiusFeet");
    const coneLength = readNumber(rangeExtra, "coneLengthFeet");
    const lineLength = readNumber(rangeExtra, "lineLengthFeet");
    if (aoeShape === "SPHERE") return `a target within ${sphereRadius ?? "?"} ft`;
    if (aoeShape === "CONE") return `a target within ${coneLength ?? "?"} ft`;
    if (aoeShape === "LINE") return `a target within ${lineLength ?? "?"} ft`;
    return "a target in range";
  }
  return "a target in range";
}

function renderArmFirstTriggerResolutionClause(
  rangeCategory: string,
  rangeValue: number | null,
  rangeExtra: Record<string, unknown>,
): string | null {
  const meleeTargets = asNumber(rangeValue) ?? 1;
  const rangedTargets = asNumber(rangeExtra.targets) ?? 1;
  const aoeCount = asNumber(rangeExtra.count) ?? 1;
  const aoeShape = getDetailsString(rangeExtra, "shape").trim().toUpperCase() || "SPHERE";
  const sphereRadius = readNumber(rangeExtra, "sphereRadiusFeet");
  const coneLength = readNumber(rangeExtra, "coneLengthFeet");
  const lineWidth = readNumber(rangeExtra, "lineWidthFeet");
  const lineLength = readNumber(rangeExtra, "lineLengthFeet");

  if (rangeCategory === "MELEE") {
    return meleeTargets > 1
      ? `choose up to ${meleeTargets} adjacent targets`
      : "choose 1 adjacent target";
  }

  if (rangeCategory === "RANGED") {
    return rangedTargets > 1
      ? `choose up to ${rangedTargets} targets within ${rangeValue ?? "?"} ft`
      : `choose 1 target within ${rangeValue ?? "?"} ft`;
  }

  if (rangeCategory !== "AOE") return null;

  if ((rangeValue ?? 0) === 0) {
    if (aoeShape === "SPHERE") {
      return aoeCount > 1
        ? `create ${aoeCount} ${sphereRadius ?? "?"} ft radius spheres centered on your current space`
        : `create a ${sphereRadius ?? "?"} ft radius sphere centered on your current space`;
    }
    if (aoeShape === "CONE") {
      return aoeCount > 1
        ? `create ${aoeCount} ${coneLength ?? "?"} ft cones emanating from self`
        : `create a ${coneLength ?? "?"} ft cone emanating from self`;
    }
    if (aoeShape === "LINE") {
      return aoeCount > 1
        ? `create ${aoeCount} ${lineWidth ?? "?"} ft wide and ${lineLength ?? "?"} ft long lines emanating from self`
        : `create a ${lineWidth ?? "?"} ft wide and ${lineLength ?? "?"} ft long line emanating from self`;
    }
  }

  if (aoeShape === "SPHERE") {
    return aoeCount > 1
      ? `choose up to ${aoeCount} ${sphereRadius ?? "?"} ft radius spheres within ${rangeValue ?? "?"} ft`
      : `choose 1 ${sphereRadius ?? "?"} ft radius sphere within ${rangeValue ?? "?"} ft`;
  }
  if (aoeShape === "CONE") {
    return aoeCount > 1
      ? `choose up to ${aoeCount} ${coneLength ?? "?"} ft cones within ${rangeValue ?? "?"} ft`
      : `choose 1 ${coneLength ?? "?"} ft cone within ${rangeValue ?? "?"} ft`;
  }
  if (aoeShape === "LINE") {
    return aoeCount > 1
      ? `choose up to ${aoeCount} ${lineWidth ?? "?"} ft wide and ${lineLength ?? "?"} ft long lines within ${rangeValue ?? "?"} ft`
      : `choose 1 ${lineWidth ?? "?"} ft wide and ${lineLength ?? "?"} ft long line within ${rangeValue ?? "?"} ft`;
  }

  return null;
}

function pluralizeTriggerAoeAreaPhrases(
  value: string,
  rangeCategory: string,
  rangeExtra: Record<string, unknown>,
): string {
  if (rangeCategory !== "AOE") return value;
  const aoeCount = asNumber(rangeExtra.count) ?? 1;
  if (aoeCount <= 1) return value;
  return value.replace(/\bwithin the area\b/gi, "within the areas");
}

function renderSelfTriggerPrimaryClause(
  effectPacket: EffectPacket,
  baseClause: string,
): string {
  if (effectPacket.intention === "HEALING") {
    return `You ${baseClause.replace(/^heals\b/i, "heal")}`;
  }
  if (effectPacket.intention === "DEFENCE") {
    return `You ${baseClause.replace(/^blocks\b/i, "block")}`;
  }
  if (effectPacket.intention === "CLEANSE") {
    return `You ${baseClause.replace(/^removes\b/i, "remove")}`;
  }
  if (effectPacket.intention === "AUGMENT") {
    return `You ${baseClause.replace(/^applies\b/i, "gain")}`;
  }
  if (effectPacket.intention === "DEBUFF" || effectPacket.intention === "CONTROL") {
    return `You ${baseClause.replace(/^applies\b/i, "suffer")}`;
  }
  if (effectPacket.intention === "MOVEMENT") {
    if (/^teleports\b/i.test(baseClause)) return `You ${baseClause.replace(/^teleports\b/i, "teleport")}`;
    if (/^flies\b/i.test(baseClause)) return `You ${baseClause.replace(/^flies\b/i, "fly")}`;
    if (/^pushes\b/i.test(baseClause)) return `You are ${baseClause.replace(/^pushes\b/i, "pushed")}`;
    return `You ${baseClause.replace(/^moves\b/i, "move")}`;
  }
  if (effectPacket.intention === "ATTACK") {
    return `You ${baseClause.replace(/^inflicts\b/i, "inflict")}`;
  }
  return `You ${baseClause}`;
}

function renderTriggerEventClause(
  triggerConditionKey: TriggerConditionKey,
  subject: string,
): string {
  const isYou = subject === "you";
  switch (triggerConditionKey) {
    case "AREA_ENTERS":
      return isYou ? "you enter the area" : `${subject} enters the area`;
    case "AREA_LEAVES":
      return isYou ? "you leave the area" : `${subject} leaves the area`;
    case "AREA_STARTS_TURN":
      return isYou ? "you start your turn in the area" : `${subject} starts its turn in the area`;
    case "AREA_ENDS_TURN":
      return isYou ? "you end your turn in the area" : `${subject} ends its turn in the area`;
    case "MOVES":
      return isYou ? "you move" : `${subject} moves`;
    case "MAKES_ATTACK":
      return isYou ? "you make an attack" : `${subject} makes an attack`;
    case "ACTIVATES_POWER":
      return isYou ? "you activate a power" : `${subject} activates a power`;
    case "SUFFERS_WOUNDS":
      return isYou ? "you suffer wounds" : `${subject} suffers wounds`;
    case "HEALS_WOUNDS":
      return isYou ? "you heal wounds" : `${subject} heals wounds`;
    case "SUFFERS_EFFECT":
      return isYou ? "you suffer an effect" : `${subject} suffers an effect`;
    case "GAINS_EFFECT":
      return isYou ? "you gain an effect" : `${subject} gains an effect`;
    case "USES_ITEM":
      return isYou ? "you use an item" : `${subject} uses an item`;
    case "MAKES_DEFENCE_ROLL":
      return isYou ? "you make a Defence roll" : `${subject} makes a Defence roll`;
    case "MAKES_RESIST_ROLL":
      return isYou ? "you make a Resist roll" : `${subject} makes a Resist roll`;
  }
}

function renderPacketTriggerSubject(
  power: Pick<Power, "descriptorChassis" | "descriptorChassisConfig" | "rangeCategories">,
  effectPacket: Pick<EffectPacket, "applyTo" | "detailsJson" | "effectTimingType"> | undefined,
): string {
  const applyTo = readPacketApplyTo(effectPacket);
  if (applyTo === "SELF") return "you";
  if (applyTo === "ALLIES") return "an ally";
  return "the target";
}

function renderPacketTriggerText(
  triggerText: string,
  power: Pick<Power, "descriptorChassis" | "descriptorChassisConfig" | "rangeCategories"> | undefined,
  effectPacket: Pick<EffectPacket, "applyTo" | "detailsJson" | "effectTimingType"> | undefined,
): string {
  const triggerConditionKey = readTriggerConditionKey(triggerText);
  if (!triggerConditionKey || !power) return triggerText;
  return renderTriggerEventClause(triggerConditionKey, renderPacketTriggerSubject(power, effectPacket));
}

function stripLeadingWhenOrIf(value: string): string {
  return stripTrailingPeriod(value).replace(/^(when|if)\s+/i, "").trim();
}

function startsWithTriggerVerbPhrase(value: string): boolean {
  return /^(makes?|takes?|ends?|starts?|enters?|leaves?|moves?|uses?|attacks?|casts?|would|attempts?|suffers?|is|are|becomes?|rolls?)\b/i.test(value.trim());
}

function renderTriggerActivationSentence(params: {
  triggerMethod: "ARM_AND_THEN_TARGET" | "TARGET_AND_THEN_ARM";
  triggerText: string;
  rangeCategory: string;
  rangeValue: number | null;
  rangeExtra: Record<string, unknown>;
  rollClause: string;
}): string | null {
  const {
    triggerMethod,
    triggerText,
    rangeCategory,
    rangeValue,
    rangeExtra,
    rollClause,
  } = params;
  const triggerConditionKey = readTriggerConditionKey(triggerText);
  const cleanTriggerText = stripLeadingWhenOrIf(triggerText);
  const rollOnlyClause = stripTrailingPeriod(rollClause).toLowerCase();
  const selectionPhrase = renderTriggerSelectionPhrase(rangeCategory, rangeValue, rangeExtra);
  const armFirstResolutionClause =
    triggerMethod === "ARM_AND_THEN_TARGET"
      ? renderArmFirstTriggerResolutionClause(rangeCategory, rangeValue, rangeExtra)
      : null;

  if (triggerConditionKey) {
    const subject =
      triggerMethod === "ARM_AND_THEN_TARGET"
        ? renderArmFirstTriggerSubject(triggerConditionKey, rangeCategory, rangeValue, rangeExtra)
        : renderTargetLockedTriggerSubject(triggerConditionKey, rangeCategory, rangeValue, rangeExtra);
    const conditionClause = renderTriggerEventClause(triggerConditionKey, subject);
    return `When ${conditionClause}, ${armFirstResolutionClause ? `${armFirstResolutionClause} and ${rollOnlyClause}` : rollOnlyClause}.`;
  }

  if (!cleanTriggerText) {
    return null;
  }

  if (triggerMethod === "ARM_AND_THEN_TARGET") {
    const triggerTargetPhrase = renderTriggerWatchTargetPhrase(rangeCategory, rangeValue, rangeExtra);
    if (startsWithTriggerVerbPhrase(cleanTriggerText)) {
      return `When ${triggerTargetPhrase} ${cleanTriggerText}, ${armFirstResolutionClause ? `${armFirstResolutionClause} and ${rollOnlyClause}` : rollOnlyClause}.`;
    }
    return `When ${cleanTriggerText}, ${selectionPhrase} and ${rollOnlyClause}.`;
  }

  const armedSubject = renderTriggerArmedSubject(rangeCategory, rangeValue, rangeExtra);
  if (startsWithTriggerVerbPhrase(cleanTriggerText)) {
    return `When ${armedSubject} ${cleanTriggerText}, ${rollOnlyClause}.`;
  }
  return `When ${cleanTriggerText}, ${rollOnlyClause}.`;
}

function isArmFirstEstablishedAreaTriggerCase(params: {
  descriptorChassis: Power["descriptorChassis"];
  triggerMethod: "ARM_AND_THEN_TARGET" | "TARGET_AND_THEN_ARM";
  primaryTimingType: EffectPacket["effectTimingType"] | undefined;
  triggerConditionKey: TriggerConditionKey | null;
  rangeCategory: string;
  rangeValue: number | null;
  rangeExtra: Record<string, unknown>;
}): boolean {
  const aoeShape = getDetailsString(params.rangeExtra, "shape").trim().toUpperCase() || "SPHERE";
  return params.descriptorChassis === "TRIGGER" &&
    params.triggerMethod === "ARM_AND_THEN_TARGET" &&
    (params.primaryTimingType ?? "ON_TRIGGER") === "ON_TRIGGER" &&
    params.triggerConditionKey !== null &&
    TRIGGER_AREA_PRESENCE_KEYS.has(params.triggerConditionKey) &&
    params.rangeCategory === "AOE" &&
    aoeShape === "SPHERE" &&
    (params.rangeValue ?? 0) === 0;
}

function renderEstablishedArmFirstAreaText(
  rangeExtra: Record<string, unknown>,
): string | null {
  const aoeCount = asNumber(rangeExtra.count) ?? 1;
  const sphereRadius = readNumber(rangeExtra, "sphereRadiusFeet");
  if (aoeCount > 1) {
    return `${aoeCount} spheres, each with a ${sphereRadius ?? "?"} ft radius, centered on your current space`;
  }
  return `a ${sphereRadius ?? "?"} ft radius sphere centered on your current space`;
}

function renderEstablishedAreaTriggerSentence(
  triggerConditionKey: TriggerConditionKey,
  rangeExtra: Record<string, unknown>,
  rollClause: string,
): string {
  const aoeCount = asNumber(rangeExtra.count) ?? 1;
  const areaRef = aoeCount > 1 ? "those areas" : "that area";
  const rollOnlyClause = stripTrailingPeriod(rollClause).toLowerCase();

  switch (triggerConditionKey) {
    case "AREA_ENTERS":
      return `When a target enters ${areaRef}, ${rollOnlyClause}.`;
    case "AREA_LEAVES":
      return `When a target leaves ${areaRef}, ${rollOnlyClause}.`;
    case "AREA_STARTS_TURN":
      return `When a target starts its turn in ${areaRef}, ${rollOnlyClause}.`;
    case "AREA_ENDS_TURN":
      return `When a target ends its turn in ${areaRef}, ${rollOnlyClause}.`;
    default:
      return `When triggered, ${rollOnlyClause}.`;
  }
}

function renderAttachedDefenceTimingText(
  powerName: string,
  hostileEntryPattern: PrimaryDefenceGate["hostileEntryPattern"] | null | undefined,
  effectTimingType: EffectPacket["effectTimingType"] | undefined,
): string | null {
  if (hostileEntryPattern === "ON_ATTACH") return "when it attaches";

  if (hostileEntryPattern === "ON_PAYLOAD") {
    const timing = effectTimingType ?? "ON_TRIGGER";
    if (timing === "ON_TRIGGER") return "when triggered";
    if (timing === "ON_EXPIRY") return `when ${powerName} ends`;
    if (timing === "START_OF_TURN") return "at the start of the target's turn";
    if (timing === "END_OF_TURN") return "at the end of the target's turn";
    if (timing === "START_OF_TURN_WHILST_CHANNELLED") return "at the start of the target's turn";
    if (timing === "END_OF_TURN_WHILST_CHANNELLED") return "at the end of the target's turn";
    if (timing === "ON_ATTACH") return "when it attaches";
    if (timing === "ON_RELEASE") return "when released";
    if (timing === "ON_HIT") return "on hit";
    return "when it takes effect";
  }

  return null;
}

function renderDefenceTimingDescriptor(
  powerName: string,
  effectTimingType: EffectPacket["effectTimingType"] | undefined,
  hostileEntryPattern?: PrimaryDefenceGate["hostileEntryPattern"] | null,
  useCastWordingForRelease?: boolean,
  useCastWordingForOnCast?: boolean,
): string {
  const defendedTiming =
    hostileEntryPattern === "ON_ATTACH"
      ? "ON_ATTACH"
      : hostileEntryPattern === "ON_PAYLOAD"
        ? (effectTimingType ?? "ON_TRIGGER")
        : (effectTimingType ?? "ON_CAST");

  if (defendedTiming === "ON_CAST") {
    return useCastWordingForOnCast ? "when the power is cast" : "as soon as the power is declared";
  }
  if (defendedTiming === "ON_TRIGGER") return "when triggered";
  if (defendedTiming === "ON_ATTACH") return `when ${powerName} attaches`;
  if (defendedTiming === "START_OF_TURN") return "at the start of each turn";
  if (defendedTiming === "END_OF_TURN") return "at the end of each turn";
  if (defendedTiming === "START_OF_TURN_WHILST_CHANNELLED") return "at the start of each turn";
  if (defendedTiming === "END_OF_TURN_WHILST_CHANNELLED") return "at the end of each turn";
  if (defendedTiming === "ON_RELEASE") {
    return useCastWordingForRelease ? "when the power is cast" : "when the power is released";
  }
  if (defendedTiming === "ON_EXPIRY") return `when ${powerName} ends`;
  return "as soon as the power is declared";
}

function renderPacketTimingPrefix(params: {
  descriptorChassis: Power["descriptorChassis"];
  hostileEntryPattern: PrimaryDefenceGate["hostileEntryPattern"] | null | undefined;
  effectTimingType: EffectPacket["effectTimingType"] | undefined;
  isPrimary: boolean;
  triggerText?: string | null;
  power?: Pick<Power, "descriptorChassis" | "descriptorChassisConfig" | "rangeCategories">;
  effectPacket?: Pick<EffectPacket, "applyTo" | "detailsJson" | "effectTimingType"> | undefined;
}): string | null {
  const { descriptorChassis, hostileEntryPattern, effectTimingType, isPrimary } = params;
  const timing = effectTimingType ?? "ON_CAST";
  const triggerText = stripTrailingPeriod(
    renderPacketTriggerText(params.triggerText ?? "", params.power, params.effectPacket),
  );

  if (timing === "ON_CAST") {
    if (descriptorChassis === "FIELD" && isPrimary) return "When this field is created,";
    return null;
  }
  if (timing === "ON_ATTACH") return "As it attaches,";
  if (timing === "ON_TRIGGER") {
    if (triggerText) {
      if (descriptorChassis === "ATTACHED" && hostileEntryPattern === "ON_PAYLOAD" && isPrimary) {
        const attachedTriggerText =
          /\bwhile attached\b/i.test(triggerText) ? triggerText : `${triggerText} while attached`;
        if (/^(if|when)\b/i.test(attachedTriggerText)) {
          return `${capitalizeSentenceStart(attachedTriggerText)},`;
        }
        return `If ${attachedTriggerText},`;
      }
      if (/^(if|when)\b/i.test(triggerText)) {
        return `${capitalizeSentenceStart(triggerText)},`;
      }
      return `When ${triggerText},`;
    }
    if (descriptorChassis === "ATTACHED" && hostileEntryPattern === "ON_PAYLOAD" && isPrimary) {
      return "While attached, when its stored effect is triggered,";
    }
    if (descriptorChassis === "TRIGGER" && isPrimary) {
      return null;
    }
    return "When triggered,";
  }
  if (timing === "START_OF_TURN") return "At the start of each turn,";
  if (timing === "END_OF_TURN") return "At the end of each turn,";
  if (timing === "START_OF_TURN_WHILST_CHANNELLED") {
    return "While you maintain the channel, at the start of each turn,";
  }
  if (timing === "END_OF_TURN_WHILST_CHANNELLED") {
    return "While you maintain the channel, at the end of each turn,";
  }
  if (timing === "ON_RELEASE") {
    if (descriptorChassis === "RESERVE" && isPrimary) return "When released,";
    return "On release,";
  }
  if (timing === "ON_EXPIRY") {
    if (descriptorChassis === "FIELD" && isPrimary) return "When this field ends,";
    if (descriptorChassis === "ATTACHED" && isPrimary) return "When this attachment ends,";
    return "When this effect ends,";
  }
  return null;
}

function renderDescriptorTimingPrefix(params: {
  descriptorChassis: Power["descriptorChassis"];
  hostileEntryPattern: PrimaryDefenceGate["hostileEntryPattern"] | null | undefined;
  effectTimingType: EffectPacket["effectTimingType"] | undefined;
  isPrimary: boolean;
  triggerText?: string | null;
  power?: Pick<Power, "descriptorChassis" | "descriptorChassisConfig" | "rangeCategories">;
  effectPacket?: Pick<EffectPacket, "applyTo" | "detailsJson" | "effectTimingType"> | undefined;
  commitmentModifier?: Power["commitmentModifier"] | null;
  hasMultipleTimingGroups?: boolean;
  useCastWordingForRelease?: boolean;
  useCastWordingForOnCast?: boolean;
}): string | null {
  const timing = params.effectTimingType ?? "ON_CAST";
  if (timing === "ON_CAST" && params.useCastWordingForOnCast) return "On cast,";
  if (
    timing === "ON_CAST" &&
    params.isPrimary &&
    params.descriptorChassis === "IMMEDIATE" &&
    params.commitmentModifier === "STANDARD"
  ) {
    return "On cast,";
  }
  if (timing === "ON_RELEASE" && params.useCastWordingForRelease) return "On cast,";
  const basePrefix = renderPacketTimingPrefix({
    descriptorChassis: params.descriptorChassis,
    hostileEntryPattern: params.hostileEntryPattern,
    effectTimingType: params.effectTimingType,
    isPrimary: params.isPrimary,
    triggerText: params.triggerText,
    power: params.power,
    effectPacket: params.effectPacket,
  });
  if (basePrefix) return basePrefix;
  if (timing === "ON_CAST" && params.hasMultipleTimingGroups) return "On cast,";
  return null;
}

function getPacketTimingKey(effectPacket: EffectPacket | undefined): EffectPacket["effectTimingType"] {
  return (effectPacket?.effectTimingType ?? "ON_CAST") as EffectPacket["effectTimingType"];
}

function isWhilstChannelledTiming(
  effectTimingType: EffectPacket["effectTimingType"] | undefined,
): boolean {
  return effectTimingType === "START_OF_TURN_WHILST_CHANNELLED" ||
    effectTimingType === "END_OF_TURN_WHILST_CHANNELLED";
}

function renderPacketBaseClause(
  effectPacket: EffectPacket,
  power: Pick<Power, "potency">,
): string {
  const details = (effectPacket.detailsJson ?? {}) as Record<string, unknown>;
  const packetPotency = getPacketPotency(effectPacket, power);

  if (effectPacket.intention === "ATTACK") {
    const mode =
      getDetailsString(details, "attackMode").trim().toUpperCase() === "MENTAL" ? "mental" : "physical";
    const damageTypes = getDetailsStringArray(details, "damageTypes")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (damageTypes.length === 0) {
      return `inflicts ${packetPotency * 2} ${mode} wounds`;
    }
    const first = `${packetPotency * 2} ${mode} ${damageTypes[0]} wounds`;
    if (damageTypes.length === 1) {
      return `inflicts ${first}`;
    }
    const remaining = damageTypes
      .slice(1)
      .map((damageType) => `${packetPotency * 2} ${mode} ${damageType} wounds`);
    return `inflicts ${joinWithCommasAnd([first, ...remaining])}`;
  }

  if (effectPacket.intention === "DEFENCE") {
    const mode =
      getDetailsString(details, "attackMode").trim().toUpperCase() === "MENTAL" ? "mental" : "physical";
    return `blocks ${packetPotency} ${mode} wounds`;
  }

  if (effectPacket.intention === "HEALING") {
    const mode =
      getDetailsString(details, "healingMode").trim().toUpperCase() === "MENTAL" ? "mental" : "physical";
    return `heals ${packetPotency} ${mode} wounds`;
  }

  if (effectPacket.intention === "CLEANSE") {
    const cleanseEffectType = getDetailsString(details, "cleanseEffectType");
    if (cleanseEffectType === "Effect over time") {
      return `removes ${formatCountedUnit(packetPotency, "stack")} of the chosen effect`;
    }
    if (cleanseEffectType === "Damage over time") {
      return `removes ${packetPotency} ongoing damage`;
    }
    if (cleanseEffectType === "Active Power" || cleanseEffectType === "Channelled Power") {
      return `removes ${packetPotency} successes from the chosen power`;
    }
    return `removes ${formatCountedUnit(packetPotency, "stack")} of the chosen effect`;
  }

  if (effectPacket.intention === "CONTROL") {
    const controlSpecific = humanizeLabel(normalizeControlMode(getDetailsString(details, "controlMode"))) || "Control";
    return `applies ${formatCountedUnit(packetPotency, "stack")} of ${controlSpecific}`;
  }

  if (effectPacket.intention === "MOVEMENT") {
    const movementMode = humanizeLabel(getDetailsString(details, "movementMode")) || "Move";
    const feet = packetPotency * 5;
    if (/force/i.test(movementMode)) {
      if (/teleport/i.test(movementMode)) return `teleports the target ${feet} ft`;
      if (/fly/i.test(movementMode)) return `flies the target ${feet} ft`;
      return `pushes the target ${feet} ft`;
    }
    if (/teleport/i.test(movementMode)) return `teleports ${feet} ft`;
    if (/fly/i.test(movementMode)) return `moves ${feet} ft by flying`;
    return `moves ${feet} ft`;
  }

  if (effectPacket.intention === "AUGMENT") {
    return `applies ${formatCountedUnit(1, "stack")} of +${packetPotency} ${readStatTarget(details)}`;
  }

  if (effectPacket.intention === "DEBUFF") {
    return `applies ${formatCountedUnit(1, "stack")} of -${packetPotency} ${readStatTarget(details)}`;
  }

  if (effectPacket.intention === "SUMMONING") return "resolves the summon effect";
  if (effectPacket.intention === "TRANSFORMATION") return "resolves the transformation effect";
  return "resolves the effect";
}

function renderSecondaryPacketClause(params: {
  effectPacket: EffectPacket;
  power: Pick<
    Power,
    | "potency"
    | "effectPackets"
    | "intentions"
    | "descriptorChassis"
    | "descriptorChassisConfig"
    | "commitmentModifier"
    | "rangeCategories"
  >;
}): string | null {
  const scalingLead = renderSecondaryScalingLead(params.power);
  const body = renderSecondaryPacketBody(params);
  if (!scalingLead || !body) return null;
  return `${scalingLead} ${body}.`;
}

function isRepeatingDirectImmediateSecondary(params: {
  effectPacket: EffectPacket;
  power: Pick<Power, "descriptorChassis" | "commitmentModifier">;
}): boolean {
  const { effectPacket, power } = params;
  return (
    power.descriptorChassis === "IMMEDIATE" &&
    power.commitmentModifier === "STANDARD" &&
    (effectPacket.effectTimingType ?? "ON_CAST") === "ON_CAST" &&
    (effectPacket.effectDurationType ?? "INSTANT") === "TURNS" &&
    (
      effectPacket.intention === "ATTACK" ||
      effectPacket.intention === "HEALING" ||
      effectPacket.intention === "DEFENCE"
    )
  );
}

function renderSecondaryScalingLead(
  power: Pick<Power, "potency" | "effectPackets" | "intentions">,
): string | null {
  const primaryPacket = getSortedEffectPackets(power)[0];
  const scalingMode = deriveSecondaryScalingModeFromPrimaryPacket(primaryPacket);
  if (scalingMode === "PRIMARY_APPLIED_SUCCESSES") {
    return "For each applied success from the primary effect, it also";
  }
  const woundsPerSuccess = deriveWoundsPerSuccessFromPrimaryPacket(primaryPacket);
  if (!woundsPerSuccess) return null;
  return `For every ${woundsPerSuccess} wounds inflicted, rounding up, it also`;
}

type SecondaryRenderPower = Pick<
  Power,
  | "potency"
  | "effectPackets"
  | "intentions"
  | "descriptorChassis"
  | "descriptorChassisConfig"
  | "commitmentModifier"
  | "rangeCategories"
>;

function renderSecondaryPacketPayload(params: {
  effectPacket: EffectPacket;
  power: SecondaryRenderPower;
  omitPrimaryRecipientContext?: boolean;
}): string | null {
  const { effectPacket, power } = params;
  const details = (effectPacket.detailsJson ?? {}) as Record<string, unknown>;
  const applyTo = readPacketApplyTo(effectPacket);
  const omitRecipientContext =
    Boolean(params.omitPrimaryRecipientContext) &&
    applyTo === "PRIMARY_TARGET" &&
    effectPacket.intention !== "MOVEMENT";
  const baseClause = formatSecondaryClause(
    effectPacket.intention,
    renderPacketBaseClause(effectPacket, power),
    details,
    applyTo,
    getPacketPotency(effectPacket, power),
    power,
    effectPacket,
    omitRecipientContext,
  );
  return baseClause;
}

function renderSecondaryPacketBody(params: {
  effectPacket: EffectPacket;
  power: SecondaryRenderPower;
  suppressRecurringCadence?: boolean;
  omitPrimaryRecipientContext?: boolean;
}): string | null {
  const baseClause = renderSecondaryPacketPayload(params);
  if (!baseClause) return null;
  const durationSuffix = renderPacketEffectDurationSuffix(params.effectPacket);
  const repeatingDirectEffectSuffix = renderRepeatingDirectEffectSuffix(params.effectPacket);
  if (isRepeatingDirectImmediateSecondary(params) && repeatingDirectEffectSuffix) {
    if (params.suppressRecurringCadence) return baseClause;
    return `${baseClause} ${repeatingDirectEffectSuffix}`;
  }
  return `${baseClause}${durationSuffix ? ` ${durationSuffix}` : ""}`;
}

type CleanupLane = {
  subject: string;
  actionWindow: string;
  resistAttribute: string;
  removalText: string;
};

function buildStackResistRemovalLane(params: {
  effectPacket: EffectPacket | undefined;
  isMultiTarget: boolean;
}): CleanupLane | null {
  const { effectPacket, isMultiTarget } = params;
  if (!effectPacket) return null;
  const details =
    effectPacket.detailsJson && typeof effectPacket.detailsJson === "object" && !Array.isArray(effectPacket.detailsJson)
      ? (effectPacket.detailsJson as Record<string, unknown>)
      : {};
  if (readPacketApplyTo(effectPacket) === "SELF") return null;
  if (effectPacket.intention === "CONTROL") {
    const resistAttribute = getControlThemeResistAttribute(details);
    if (!resistAttribute) return null;
    const controlSpecific = humanizeLabel(normalizeControlMode(getDetailsString(details, "controlMode"))) || "Control";
    return {
      subject: isMultiTarget ? "Each target" : "The target",
      actionWindow: "a main action on their turn",
      resistAttribute: humanizeLabel(resistAttribute),
      removalText: `remove 1 stack of ${controlSpecific} per success`,
    };
  }
  if (effectPacket.intention === "DEBUFF") {
    const statTarget = normalizeCoreDefenceStat(readStatTarget(details));
    if (!statTarget) return null;
    const potency = Math.max(1, effectPacket.potency ?? 1);
    return {
      subject: isMultiTarget ? "Each target" : "The target",
      actionWindow: "a main action on their turn",
      resistAttribute: statTarget,
      removalText: `remove 1 stack of -${potency} ${readStatTarget(details)} per success`,
    };
  }
  return null;
}

function buildOngoingDamageCleanupLane(params: {
  effectPacket: EffectPacket | undefined;
  isMultiTarget: boolean;
}): CleanupLane | null {
  const { effectPacket, isMultiTarget } = params;
  if (!effectPacket) return null;
  if (effectPacket.intention !== "ATTACK") return null;
  if ((effectPacket.effectDurationType ?? "INSTANT") !== "TURNS") return null;
  const details =
    effectPacket.detailsJson && typeof effectPacket.detailsJson === "object" && !Array.isArray(effectPacket.detailsJson)
      ? (effectPacket.detailsJson as Record<string, unknown>)
      : {};
  if (readPacketApplyTo(effectPacket) === "SELF") return null;
  const resistAttribute =
    getDetailsString(details, "attackMode").trim().toUpperCase() === "MENTAL" ? "Bravery" : "Fortitude";
  return {
    subject: isMultiTarget ? "Each target" : "The target",
    actionWindow: "a main action on their turn",
    resistAttribute,
    removalText: "remove 1 ongoing damage from one chosen effect per success",
  };
}

function renderCleanupLine(lane: CleanupLane): string {
  return `${lane.subject} may use a resist action to attempt a ${lane.resistAttribute} Resist roll to ${lane.removalText}.`;
}

function stripPerSuccess(text: string): string {
  return text.replace(/\s+per success\.?$/i, "").trim();
}

function joinWithOr(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

function renderCleanupLines(lanes: Array<CleanupLane | null | undefined>): string[] {
  const filtered = lanes.filter((lane): lane is CleanupLane => Boolean(lane));
  if (filtered.length <= 1) return filtered.map(renderCleanupLine);
  const [first] = filtered;
  if (
    filtered.some(
      (lane) => lane.subject !== first.subject || lane.actionWindow !== first.actionWindow,
    )
  ) {
    return filtered.map(renderCleanupLine);
  }

  const groupedByResist = filtered.reduce(
    (groups, lane) => {
      const existing = groups.find((group) => group.resistAttribute === lane.resistAttribute);
      if (existing) {
        existing.lanes.push(lane);
        return groups;
      }
      groups.push({ resistAttribute: lane.resistAttribute, lanes: [lane] });
      return groups;
    },
    [] as Array<{ resistAttribute: string; lanes: CleanupLane[] }>,
  );

  const actionLines = groupedByResist.map(({ resistAttribute, lanes: groupLanes }) => {
    if (groupLanes.length === 1) {
      return `- ${resistAttribute} Resist roll to ${groupLanes[0].removalText}.`;
    }
    const removalOptions = groupLanes.map((lane) => stripPerSuccess(lane.removalText));
    return `- ${resistAttribute} Resist roll to either ${joinWithOr(removalOptions)} per success.`;
  });

  if (actionLines.length > 0) {
    return ["Resist Actions:", ...actionLines];
  }

  return filtered.map(renderCleanupLine);
}

function renderSecondaryBulletLine(timingPrefix: string, mergedBody: string): string {
  const cleanTiming = stripTrailingComma(timingPrefix);
  const cleanBody = stripTrailingPeriod(mergedBody);
  if (!cleanTiming) return `- ${capitalizeSentenceStart(cleanBody)}.`;
  const durationSuffix = [
    "until the start of the target's next turn",
    "until it ends or is removed",
  ].find((suffix) => cleanBody.endsWith(` ${suffix}`)) ??
    (/ for \d+ turns?$/.exec(cleanBody)?.[0].trim() ?? null);
  if (durationSuffix) {
    const baseWithoutDuration = cleanBody.slice(0, -(` ${durationSuffix}`).length);
    return `- ${capitalizeSentenceStart(baseWithoutDuration)} ${lowercaseSentenceStart(cleanTiming)} ${durationSuffix}.`;
  }
  return `- ${capitalizeSentenceStart(cleanBody)} ${lowercaseSentenceStart(cleanTiming)}.`;
}

type SecondaryRenderEntry = {
  effectPacket: EffectPacket;
  authoringIndex: number;
  displayTimingKey: EffectPacket["effectTimingType"];
  timingPrefix: string;
  inlineClause: string;
  body: string;
};

function getSecondaryMergeContextKey(
  entry: SecondaryRenderEntry,
  power: SecondaryRenderPower,
): string {
  const applyTo = readPacketApplyTo(entry.effectPacket);
  const durationType = entry.effectPacket.effectDurationType ?? "INSTANT";
  const durationTurns = durationType === "TURNS" ? (entry.effectPacket.effectDurationTurns ?? 1) : null;
  const entity = applyToEntity(applyTo, power, entry.effectPacket);
  return [
    entry.displayTimingKey,
    entry.timingPrefix,
    applyTo,
    entity,
    durationType,
    durationTurns,
    power.descriptorChassis ?? "",
  ].join("|");
}

function renderMergedSecondaryContextBody(
  entries: SecondaryRenderEntry[],
  power: SecondaryRenderPower,
): string | null {
  if (entries.length === 0) return null;
  if (entries.length === 1) return entries[0].body;

  const payloads = entries
    .map((entry) =>
      renderSecondaryPacketPayload({
        effectPacket: entry.effectPacket,
        power,
        omitPrimaryRecipientContext: true,
      }),
    )
    .filter((payload): payload is string => Boolean(payload));
  if (payloads.length !== entries.length || payloads.some((payload) => !/^applies\b/i.test(payload))) {
    return null;
  }

  const firstPacket = entries[0].effectPacket;
  const applyTo = readPacketApplyTo(firstPacket);
  const entity = applyToEntity(applyTo, power, firstPacket);
  const durationSuffix = renderPacketEffectDurationSuffix(firstPacket);
  const mergedPayload = [
    payloads[0],
    ...payloads.slice(1).map((payload) => payload.replace(/^applies\s+/i, "")),
  ];

  return `${joinWithCommasAnd(mergedPayload)} to ${entity}${durationSuffix ? ` ${durationSuffix}` : ""}`;
}

function buildSecondaryContextBodies(
  entries: SecondaryRenderEntry[],
  power: SecondaryRenderPower,
): string[] {
  const groups = entries.reduce(
    (acc, entry) => {
      const key = getSecondaryMergeContextKey(entry, power);
      const existing = acc.find((group) => group.key === key);
      if (existing) {
        existing.entries.push(entry);
        return acc;
      }
      acc.push({ key, entries: [entry] });
      return acc;
    },
    [] as Array<{ key: string; entries: SecondaryRenderEntry[] }>,
  );

  return groups.flatMap((group) => {
    const merged = renderMergedSecondaryContextBody(group.entries, power);
    if (merged) return [merged];
    return group.entries.map((entry) => entry.body);
  });
}

function renderSecondaryMergedBodyWithInlineTiming(
  entries: SecondaryRenderEntry[],
  power: SecondaryRenderPower,
  timingPrefix: string,
): string[] {
  const cleanTiming = lowercaseSentenceStart(stripTrailingComma(timingPrefix));
  return buildSecondaryContextBodies(entries, power).map((body) => {
    if (!cleanTiming) return body;
    const cleanBody = stripTrailingPeriod(body);
    const durationSuffix = renderPacketEffectDurationSuffix(entries[0]?.effectPacket);
    if (durationSuffix && cleanBody.endsWith(` ${durationSuffix}`)) {
      const baseWithoutDuration = cleanBody.slice(0, -(` ${durationSuffix}`).length);
      return `${baseWithoutDuration} ${cleanTiming} ${durationSuffix}`;
    }
    return `${cleanBody} ${cleanTiming}`;
  });
}

export function renderPowerSuccessClause(power: Pick<Power, "potency" | "effectPackets" | "intentions">): string {
  const sorted = getSortedEffectPackets(power);
  const details = sorted.map((packet) => renderEffectPacketDetail(packet, getPacketPotency(packet, power)));
  const joined =
    details.length <= 1
      ? details[0] ?? "resolve effect"
      : `${details.slice(0, -1).join("; ")}; and ${details[details.length - 1]}`;
  return `For each success, ${joined}.`;
}

export function renderPowerDescriptorLines(
  power: Pick<
    Power,
    | "name"
    | "descriptorChassis"
    | "descriptorChassisConfig"
    | "chargeType"
    | "chargeTurns"
    | "chargeBonusDicePerTurn"
    | "commitmentModifier"
    | "triggerMethod"
    | "attachedHostAnchorType"
    | "lifespanType"
    | "lifespanTurns"
    | "diceCount"
    | "potency"
    | "effectPackets"
    | "intentions"
    | "effectDurationType"
    | "effectDurationTurns"
    | "durationType"
    | "durationTurns"
    | "primaryDefenceGate"
    | "rangeCategories"
    | "meleeTargets"
    | "rangedTargets"
    | "rangedDistanceFeet"
    | "aoeCenterRangeFeet"
    | "aoeCount"
    | "aoeShape"
    | "aoeSphereRadiusFeet"
    | "aoeConeLengthFeet"
    | "aoeLineWidthFeet"
    | "aoeLineLengthFeet"
  >,
): string[] {
  const effectPackets = getSortedEffectPackets(power);
  const primaryDetails = getPrimaryRangeDetails(
    power,
    (effectPackets[0]?.detailsJson ?? {}) as Record<string, unknown>,
  );
  const primaryPacket = effectPackets[0];
  const descriptorChassisConfig =
    power.descriptorChassisConfig &&
    typeof power.descriptorChassisConfig === "object" &&
    !Array.isArray(power.descriptorChassisConfig)
      ? (power.descriptorChassisConfig as Record<string, unknown>)
      : {};
  const chargeConfig = normalizeChargeDescriptorConfig(
    descriptorChassisConfig,
    power.commitmentModifier,
    power.descriptorChassis,
    power.chargeType,
    power.chargeTurns,
    power.chargeBonusDicePerTurn,
  );
  const reserveReleaseBehaviour = readReserveReleaseBehaviour(descriptorChassisConfig);
  const triggerMethod = normalizeTriggerMethod(power.triggerMethod ?? descriptorChassisConfig.triggerMethod);
  const rangeCategory = getDetailsString(primaryDetails, "rangeCategory").trim().toUpperCase();
  const rangeValue = asNumber(primaryDetails.rangeValue);
  const rangeExtra =
    primaryDetails.rangeExtra &&
    typeof primaryDetails.rangeExtra === "object" &&
    !Array.isArray(primaryDetails.rangeExtra)
      ? (primaryDetails.rangeExtra as Record<string, unknown>)
      : {};
  const meleeTargets = asNumber(rangeValue) ?? 1;
  const rangedTargets = asNumber(rangeExtra.targets) ?? 1;
  const genericRangeLead = buildRangeLead(power.descriptorChassis, rangeCategory, rangeValue, rangeExtra);
  const rangeLead =
    power.descriptorChassis === "FIELD"
      ? genericRangeLead.replace(/^Choose\b/i, "Create")
      : genericRangeLead;
  const triggerConditionKey =
    power.descriptorChassis === "TRIGGER"
      ? readTriggerConditionKey(
          primaryPacket?.triggerConditionText ??
            readDescriptorConfigText(descriptorChassisConfig, "triggerConditionText"),
        )
      : null;
  const triggerPayloadText =
    triggerConditionKey ??
    readDescriptorConfigText(descriptorChassisConfig, "triggerConditionText");
  const primaryPacketTriggerConditionText =
    readPacketTriggerConditionText(primaryPacket) ||
    readDescriptorConfigText(descriptorChassisConfig, "payloadTriggerText");
  const attachedPayloadTriggerText = primaryPacketTriggerConditionText;
  const timingGroupKeys = Array.from(
    new Set(
      effectPackets.map((effectPacket, index) =>
        index === 0
          ? getPrimaryDisplayTimingType(
              power.descriptorChassis,
              getPacketTimingKey(effectPacket),
              chargeConfig,
            )
          : getSecondaryDisplayTimingType(
              power.descriptorChassis,
              getPacketTimingKey(effectPacket),
              chargeConfig,
            ),
      ),
    ),
  );
  const hasMultipleTimingGroups = timingGroupKeys.length > 1;
  const primaryDisplayTimingType = getPrimaryDisplayTimingType(
    power.descriptorChassis,
    primaryPacket?.effectTimingType,
    chargeConfig,
  );
  const useNonReserveChargeCastWording = shouldUseNonReserveChargeCastWording(
    power.descriptorChassis,
    chargeConfig,
  );
  const useNonReserveDelayedCastPrefix = shouldUseNonReserveDelayedCastPrefix(
    power.descriptorChassis,
    chargeConfig,
  );
  const primaryTimingPrefix = renderDescriptorTimingPrefix({
    descriptorChassis: power.descriptorChassis,
    hostileEntryPattern: power.primaryDefenceGate?.hostileEntryPattern,
    effectTimingType: primaryDisplayTimingType,
    isPrimary: true,
    triggerText:
      power.descriptorChassis === "TRIGGER"
        ? (triggerPayloadText || primaryPacketTriggerConditionText)
        : primaryPacketTriggerConditionText,
    power,
    effectPacket: primaryPacket,
    commitmentModifier: power.commitmentModifier,
    hasMultipleTimingGroups,
    useCastWordingForRelease: useNonReserveChargeCastWording,
    useCastWordingForOnCast: useNonReserveDelayedCastPrefix,
  });
  const primaryBaseClause = primaryPacket
    ? formatPrimaryBaseClauseForRange(
        primaryPacket,
        renderPacketBaseClause(primaryPacket, power),
        rangeCategory,
      )
    : "resolves the effect";
  const primaryEffectDuration = primaryPacket ? renderPacketEffectDurationSuffix(primaryPacket) : null;

  const isMultiTarget =
    rangeCategory === "AOE" ||
    (rangeCategory === "MELEE" && meleeTargets > 1) ||
    (rangeCategory === "RANGED" && rangedTargets > 1);
  const primaryDefenceCheck =
    derivePrimaryDefenceCheckFromGate(power.primaryDefenceGate, primaryPacket, isMultiTarget) ??
    derivePrimaryDefenceCheck(primaryPacket, rangeCategory, meleeTargets, rangedTargets);
  const channelLine = (() => {
    if (power.commitmentModifier !== "CHANNEL") return null;
    if (power.lifespanType === "PASSIVE") {
      return `${power.name} can be channeled, requiring a Power Action each of your turns to maintain.`;
    }
    if (power.lifespanType === "TURNS") {
      return `${power.name} can be channeled, requiring a Power Action each of your turns to maintain until it expires after ${formatCountedUnit(power.lifespanTurns, "turn")}.`;
    }
    return null;
  })();
  const chargeLine = (() => {
    if (!chargeConfig) return null;

    if (power.descriptorChassis === "RESERVE") {
      const reserveHoldClause = buildReserveHoldClause(power);
      const releaseBehaviourSentence = renderReserveReleaseBehaviourSentence(reserveReleaseBehaviour);

      if (chargeConfig.chargeType === "BUILD_POWER") {
        return [
          `Charge ${power.name} for up to ${formatCountedUnit(chargeConfig.chargeTurns, "turn")}, gaining +${formatDieCount(chargeConfig.chargeBonusDicePerTurn ?? 1)} per turn before release.`,
          `Once charged, it may be held in reserve${reserveHoldClause}.`,
          releaseBehaviourSentence,
        ]
          .filter((segment): segment is string => Boolean(segment))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      }

      return [
        `After ${power.name} has been charged for ${formatCountedUnit(chargeConfig.chargeTurns, "turn")}, it becomes primed.`,
        `Once primed, it can be held in reserve${reserveHoldClause}.`,
        releaseBehaviourSentence,
      ]
        .filter((segment): segment is string => Boolean(segment))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (chargeConfig.chargeType === "BUILD_POWER") {
      return `Charge ${power.name} for up to ${formatCountedUnit(chargeConfig.chargeTurns, "turn")}, gaining +${formatDieCount(chargeConfig.chargeBonusDicePerTurn ?? 1)} per turn before cast.`;
    }

    if (power.descriptorChassis !== "TRIGGER") {
      return [
        `After ${power.name} has been charged for ${formatCountedUnit(chargeConfig.chargeTurns, "turn")}, it becomes primed.`,
        "Once primed, it must be cast with a Power Action before the end of your next turn.",
        "If it is not cast, it is lost and goes on cooldown.",
      ]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    return [
      `After ${power.name} has been charged for ${formatCountedUnit(chargeConfig.chargeTurns, "turn")} it becomes primed.`,
      "Once primed, it may be released with a Power Action on your turn.",
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  })();
  const chassisLine = (() => {
    if (power.descriptorChassis === "TRIGGER") {
      return null;
    }
    if (power.descriptorChassis === "RESERVE") {
      if (chargeConfig) {
        return null;
      }
      const reserveLifespanText = buildReserveHoldClause(power);
      return [
        `Hold this power in reserve${reserveLifespanText}.`,
        renderReserveReleaseBehaviourSentence(reserveReleaseBehaviour),
      ]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }
    return null;
  })();
  const lifespanLine = (() => {
    if (!power.descriptorChassis || power.descriptorChassis === "IMMEDIATE") return null;
    if (power.commitmentModifier === "CHANNEL") return null;
    if (power.descriptorChassis === "ATTACHED") {
      return null;
    }
    if (power.descriptorChassis === "TRIGGER") {
      return null;
    }
    if (power.descriptorChassis === "RESERVE") {
      return null;
    }
    if (power.descriptorChassis === "FIELD") {
      if (power.lifespanType === "TURNS") {
        return `${power.name} remains in place for up to ${formatCountedUnit(power.lifespanTurns, "turn")}.`;
      }
      if (power.lifespanType === "PASSIVE") {
        return `${power.name} remains in place until it ends or is removed.`;
      }
      return null;
    }
    if (power.lifespanType === "TURNS") {
      return `This ${humanizeLabel(power.descriptorChassis).toLowerCase()} lasts for ${formatCountedUnit(power.lifespanTurns, "turn")}.`;
    }
    if (power.lifespanType === "PASSIVE") {
      return `This ${humanizeLabel(power.descriptorChassis).toLowerCase()} remains active until it ends or is removed.`;
    }
    return null;
  })();
  const primaryTimingKey = primaryDisplayTimingType;
  const shouldExplainReestablishChannel =
    power.commitmentModifier === "CHANNEL" &&
    power.descriptorChassis === "ATTACHED" &&
    effectPackets.some((effectPacket) => isWhilstChannelledTiming(getPacketTimingKey(effectPacket)));
  const reestablishChannelSentence =
    "If the channel is broken, a response or power action can be spent to re-establish the channel.";
  const contingentSecondaryEntries = effectPackets
    .slice(1)
    .map((effectPacket, index) => {
      const displayTimingKey = getSecondaryDisplayTimingType(
        power.descriptorChassis,
        getPacketTimingKey(effectPacket),
        chargeConfig,
      );
      const inlineClause = renderSecondaryPacketClause({ effectPacket, power });
      const repeatingDirectEffectSuffix = renderRepeatingDirectEffectSuffix(effectPacket);
      const usesRecurringCadenceHeader =
        isRepeatingDirectImmediateSecondary({ effectPacket, power }) && Boolean(repeatingDirectEffectSuffix);
      const body = renderSecondaryPacketBody({
        effectPacket,
        power,
        suppressRecurringCadence: usesRecurringCadenceHeader,
      });
      if (!inlineClause || !body) return null;
      const timingPrefix = usesRecurringCadenceHeader && repeatingDirectEffectSuffix
        ? `${capitalizeSentenceStart(repeatingDirectEffectSuffix)},`
        : displayTimingKey === "ON_CAST"
          ? "On cast,"
          : (renderDescriptorTimingPrefix({
          descriptorChassis: power.descriptorChassis,
          hostileEntryPattern: power.primaryDefenceGate?.hostileEntryPattern,
          effectTimingType: displayTimingKey,
          isPrimary: false,
          triggerText: readPacketTriggerConditionText(effectPacket),
          power,
          effectPacket,
          commitmentModifier: power.commitmentModifier,
          hasMultipleTimingGroups,
          useCastWordingForRelease: useNonReserveChargeCastWording,
          useCastWordingForOnCast: useNonReserveDelayedCastPrefix,
        }) ?? "After the primary effect,");
      return {
        effectPacket,
        authoringIndex: index,
        displayTimingKey,
        timingPrefix,
        inlineClause,
        body,
      };
    })
    .filter(
      (
        entry,
      ): entry is SecondaryRenderEntry => Boolean(entry),
    );
  const distinctSecondaryTimingBuckets = Array.from(
    new Set(contingentSecondaryEntries.map((entry) => entry.timingPrefix)),
  );
  const hasSplitSecondaryMergeContexts =
    contingentSecondaryEntries.length > 1 &&
    (() => {
      const timingBuckets = contingentSecondaryEntries.reduce(
        (groups, entry) => {
          const existing = groups.find((group) => group.timingPrefix === entry.timingPrefix);
          if (existing) {
            existing.entries.push(entry);
            return groups;
          }
          groups.push({ timingPrefix: entry.timingPrefix, entries: [entry] });
          return groups;
        },
        [] as Array<{ timingPrefix: string; entries: SecondaryRenderEntry[] }>,
      );
      return timingBuckets.some(
        ({ entries }) =>
          new Set(entries.map((entry) => getSecondaryMergeContextKey(entry, power))).size > 1,
      );
    })();
  const shouldUseSecondaryBulletBlock =
    contingentSecondaryEntries.length >= 3 ||
    distinctSecondaryTimingBuckets.length >= 2 ||
    hasSplitSecondaryMergeContexts;
  const sameTimingSecondaryClauses = shouldUseSecondaryBulletBlock
    ? []
    : (() => {
        const sameTimingEntries = contingentSecondaryEntries.filter(
          (entry) => entry.displayTimingKey === primaryTimingKey,
        );
        if (sameTimingEntries.length === 0) return [] as string[];
        const sharedScalingLead = renderSecondaryScalingLead(power);
        const sameTimingBodies = buildSecondaryContextBodies(
          sameTimingEntries.map((entry) => ({
            ...entry,
            body:
              renderSecondaryPacketBody({
                effectPacket: entry.effectPacket,
                power,
                omitPrimaryRecipientContext: true,
              }) ?? entry.body,
          })),
          power,
        );
        if (!sharedScalingLead) {
          return sameTimingEntries.map((entry) => entry.inlineClause);
        }
        return [`${sharedScalingLead} ${joinWithCommasAnd(sameTimingBodies)}.`];
      })();
  const sameTimingSecondaryResistLines = effectPackets
    .slice(1)
    .filter(
      (effectPacket) =>
        getSecondaryDisplayTimingType(
          power.descriptorChassis,
          getPacketTimingKey(effectPacket),
          chargeConfig,
        ) === primaryTimingKey,
    )
    .map((effectPacket) =>
      buildStackResistRemovalLane({
        effectPacket,
        isMultiTarget,
      }))
    .filter((lane): lane is CleanupLane => Boolean(lane));
  const sameTimingSecondaryOngoingDamageCleanupLines = effectPackets
    .slice(1)
    .filter(
      (effectPacket) =>
        getSecondaryDisplayTimingType(
          power.descriptorChassis,
          getPacketTimingKey(effectPacket),
          chargeConfig,
        ) === primaryTimingKey,
    )
    .map((effectPacket) =>
      buildOngoingDamageCleanupLane({
        effectPacket,
        isMultiTarget,
      }))
    .filter((lane): lane is CleanupLane => Boolean(lane));
  const primaryLine = (() => {
    const rollClause = buildPrimaryRollClause({
      baseDiceCount: getPacketDiceCount(primaryPacket, power),
      timingPrefix: primaryTimingPrefix,
      chargeConfig,
    });

    if (power.descriptorChassis === "ATTACHED") {
      const attachedHostAnchorType = normalizeAttachedHostAnchorType(power.attachedHostAnchorType);
      const anchorText = renderAttachedAnchorText(
        attachedHostAnchorType,
        readLegacyAttachedAnchorText(descriptorChassisConfig),
      );
      const targetPhrase = anchorText || "the chosen host";
      const attachedLifespanText =
        power.lifespanType === "TURNS"
          ? ` for up to ${formatCountedUnit(power.lifespanTurns, "turn")}`
          : power.lifespanType === "PASSIVE"
            ? " until it ends or is removed"
            : "";
      const attachLine = (() => {
        if (isSelfOriginSphereRange(rangeCategory, rangeValue, rangeExtra)) {
          return buildAttachedSelfOriginSphereLine({
            rangeExtra,
            anchorText,
            lifespanType: power.lifespanType,
            lifespanTurns: power.lifespanTurns,
          });
        }

        if (rangeCategory === "SELF" && isAttachedSelfHost(attachedHostAnchorType, anchorText)) {
          return `Attach ${power.name} to ${targetPhrase}${attachedLifespanText}.`;
        }

        return `${stripTrailingPeriod(genericRangeLead)} and attach ${power.name} to ${targetPhrase}${attachedLifespanText}.`;
      })();
      if (power.primaryDefenceGate?.hostileEntryPattern === "ON_PAYLOAD") {
        const triggerLead = renderDescriptorTimingPrefix({
          descriptorChassis: power.descriptorChassis,
          hostileEntryPattern: power.primaryDefenceGate?.hostileEntryPattern,
          effectTimingType: primaryDisplayTimingType,
          isPrimary: true,
          triggerText: attachedPayloadTriggerText,
          power,
          effectPacket: primaryPacket,
          commitmentModifier: power.commitmentModifier,
          hasMultipleTimingGroups,
          useCastWordingForRelease: useNonReserveChargeCastWording,
          useCastWordingForOnCast: useNonReserveDelayedCastPrefix,
        }) ?? "While attached, when its stored effect is triggered,";
        return [
          attachLine,
          `${triggerLead} ${buildPrimaryRollClause({
            baseDiceCount: getPacketDiceCount(primaryPacket, power),
            timingPrefix: null,
            chargeConfig,
          }).replace(/\.$/, "").toLowerCase()}.`,
          `${power.name} ${primaryBaseClause} per success${primaryEffectDuration ? ` ${primaryEffectDuration}` : ""}.`,
          ...sameTimingSecondaryClauses,
          shouldExplainReestablishChannel && isWhilstChannelledTiming(primaryTimingKey)
            ? reestablishChannelSentence
            : null,
        ]
          .filter((segment): segment is string => Boolean(segment))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      }
      return [
        attachLine,
        `${rollClause} ${power.name} ${primaryBaseClause} per success${primaryEffectDuration ? ` ${primaryEffectDuration}` : ""}.`,
        ...sameTimingSecondaryClauses,
        shouldExplainReestablishChannel && isWhilstChannelledTiming(primaryTimingKey)
          ? reestablishChannelSentence
          : null,
      ]
        .filter((segment): segment is string => Boolean(segment))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (power.descriptorChassis === "FIELD") {
      const fieldTimingSuffix = renderFieldEffectTimingSuffix(
        power.name,
        primaryDisplayTimingType,
      );
      const fieldAffectedTargetQualifier = renderFieldAffectedTargetQualifier(
        primaryDisplayTimingType,
      );
      const fieldRollClause = primaryTimingPrefix
        ? buildPrimaryRollClause({
            baseDiceCount: getPacketDiceCount(primaryPacket, power),
            timingPrefix: primaryTimingPrefix,
            chargeConfig,
          })
        : buildPrimaryRollClause({
            baseDiceCount: getPacketDiceCount(primaryPacket, power),
            timingPrefix: null,
            chargeConfig,
          });
      const fieldRepeatingDirectSentence = renderFieldRepeatingDirectEffectSentence(primaryPacket);
      const fieldEffectClause = `${fieldRollClause} ${power.name} ${primaryBaseClause} per success${fieldAffectedTargetQualifier ? ` ${fieldAffectedTargetQualifier}` : ""}${fieldRepeatingDirectSentence ? "" : primaryEffectDuration ? ` ${primaryEffectDuration}` : ""}${primaryTimingPrefix ? "" : fieldTimingSuffix ? ` ${fieldTimingSuffix}` : ""}.`;
      return [
        rangeLead,
        fieldEffectClause,
        fieldRepeatingDirectSentence,
        ...sameTimingSecondaryClauses,
      ]
        .filter((segment): segment is string => Boolean(segment))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (power.descriptorChassis === "RESERVE") {
      const releaseRangeLead = stripTrailingPeriod(genericRangeLead);
      const reserveReleaseLead = primaryTimingPrefix
        ? `${primaryTimingPrefix} ${releaseRangeLead.toLowerCase()} and ${buildPrimaryRollClause({
            baseDiceCount: getPacketDiceCount(primaryPacket, power),
            timingPrefix: null,
            chargeConfig,
          }).replace(/\.$/, "").toLowerCase()}`
        : `${releaseRangeLead} and ${buildPrimaryRollClause({
            baseDiceCount: getPacketDiceCount(primaryPacket, power),
            timingPrefix: null,
            chargeConfig,
          }).replace(/\.$/, "").toLowerCase()}`;
      return [
        `${capitalizeSentenceStart(reserveReleaseLead).replace(/\s+$/, "")}.`,
        `${power.name} ${primaryBaseClause} per success${primaryEffectDuration ? ` ${primaryEffectDuration}` : ""}.`,
        ...sameTimingSecondaryClauses,
      ]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (power.descriptorChassis === "TRIGGER") {
      const isSelfTrigger = rangeCategory === "SELF";
      const usesEstablishedAreaTriggerWording = isArmFirstEstablishedAreaTriggerCase({
        descriptorChassis: power.descriptorChassis,
        triggerMethod,
        primaryTimingType: primaryPacket?.effectTimingType,
        triggerConditionKey,
        rangeCategory,
        rangeValue,
        rangeExtra,
      });
      const triggerPrimaryBaseClause =
        primaryPacket && isSelfTrigger
          ? renderSelfTriggerPrimaryClause(primaryPacket, primaryBaseClause)
          : pluralizeTriggerAoeAreaPhrases(primaryBaseClause, rangeCategory, rangeExtra);
      const triggerArmedSentence =
        isSelfTrigger
          ? `Once cast, ${power.name} remains armed ${renderTriggerArmedDurationText(power)}.`
          : triggerMethod === "TARGET_AND_THEN_ARM"
          ? `Once cast, ${power.name} remains armed against ${renderTriggerArmedSubject(rangeCategory, rangeValue, rangeExtra)} ${renderTriggerArmedDurationText(power)}.`
          : usesEstablishedAreaTriggerWording
          ? `Once cast, ${power.name} remains armed ${renderTriggerArmedDurationText(power)} as ${renderEstablishedArmFirstAreaText(rangeExtra) ?? "an armed area"}.`
          : `Once cast, ${power.name} remains armed ${renderTriggerArmedDurationText(power)}.`;
      const triggerActivationSentence = renderTriggerActivationSentence({
        triggerMethod,
        triggerText: triggerPayloadText || primaryPacketTriggerConditionText,
        rangeCategory,
        rangeValue,
        rangeExtra,
        rollClause: buildPrimaryRollClause({
          baseDiceCount: getPacketDiceCount(primaryPacket, power),
          timingPrefix: null,
          chargeConfig,
        }),
      });
      const triggerRollSentence =
        usesEstablishedAreaTriggerWording && triggerConditionKey
          ? renderEstablishedAreaTriggerSentence(
              triggerConditionKey,
              rangeExtra,
              buildPrimaryRollClause({
                baseDiceCount: getPacketDiceCount(primaryPacket, power),
                timingPrefix: null,
                chargeConfig,
              }),
            )
          : triggerActivationSentence;
      const triggerResolutionSentence = triggerActivationSentence
        ? `${triggerRollSentence} ${isSelfTrigger ? triggerPrimaryBaseClause : `${power.name} ${triggerPrimaryBaseClause}`} per success${primaryEffectDuration ? ` ${primaryEffectDuration}` : ""}.`
        : `${power.name} cannot resolve until a Trigger Condition is selected.`;
      return [
        triggerMethod === "TARGET_AND_THEN_ARM" && !isSelfTrigger ? rangeLead : null,
        triggerArmedSentence,
        triggerResolutionSentence,
        ...sameTimingSecondaryClauses,
      ]
        .filter((segment): segment is string => Boolean(segment))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const leadWithRoll = combineRangeLeadWithRollClause(
      rangeLead,
      rollClause,
      rangeCategory,
      isMultiTarget,
    );
    return [
      leadWithRoll,
      `${power.name} ${primaryBaseClause} per success${primaryEffectDuration ? ` ${primaryEffectDuration}` : ""}.`,
      ...sameTimingSecondaryClauses,
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  })();
  const groupedSecondaryPackets = effectPackets.slice(1).reduce(
    (groups, effectPacket) => {
      const timingKey = getPacketTimingKey(effectPacket);
      const displayedTimingKey = getSecondaryDisplayTimingType(
        power.descriptorChassis,
        timingKey,
        chargeConfig,
      );
      if (displayedTimingKey === primaryTimingKey) return groups;
      const existingGroup = groups.find((group) => group.timingKey === displayedTimingKey);
      if (existingGroup) {
        existingGroup.packets.push(effectPacket);
        return groups;
      }
      groups.push({
        timingKey: displayedTimingKey,
        packets: [effectPacket],
      });
      return groups;
    },
    [] as Array<{ timingKey: EffectPacket["effectTimingType"]; packets: EffectPacket[] }>,
  );
  const groupedSecondaryResistLines = groupedSecondaryPackets.flatMap(({ packets }) =>
    packets
      .map((effectPacket) =>
        buildStackResistRemovalLane({
          effectPacket,
          isMultiTarget,
        }))
      .filter((lane): lane is CleanupLane => Boolean(lane)),
  );
  const groupedSecondaryOngoingDamageCleanupLines = groupedSecondaryPackets.flatMap(({ packets }) =>
    packets
      .map((effectPacket) =>
        buildOngoingDamageCleanupLane({
          effectPacket,
          isMultiTarget,
        }))
      .filter((lane): lane is CleanupLane => Boolean(lane)),
  );
  let hasAppendedReestablishChannelSentence =
    !shouldExplainReestablishChannel || isWhilstChannelledTiming(primaryTimingKey);
  const secondaryLines = shouldUseSecondaryBulletBlock
    ? (() => {
        const sharedScalingLead = renderSecondaryScalingLead(power);
        if (!sharedScalingLead) return [] as string[];
        const bucketedEntries = contingentSecondaryEntries.reduce(
          (groups, entry) => {
            const existingGroup = groups.find((group) => group.timingPrefix === entry.timingPrefix);
            if (existingGroup) {
              existingGroup.entries.push(entry);
              return groups;
            }
            groups.push({
              timingPrefix: entry.timingPrefix,
              entries: [entry],
            });
            return groups;
          },
          [] as Array<{
            timingPrefix: string;
            entries: typeof contingentSecondaryEntries;
          }>,
        );
        const bulletLines = bucketedEntries.flatMap(({ timingPrefix, entries }) =>
          buildSecondaryContextBodies(entries, power).map((mergedBody) =>
            renderSecondaryBulletLine(timingPrefix, mergedBody),
          ),
        );
        if (!hasAppendedReestablishChannelSentence) {
          const hasWhilstChannelledBullet = bucketedEntries.some(({ entries }) =>
            entries.some((entry) => isWhilstChannelledTiming(getPacketTimingKey(entry.effectPacket))),
          );
          if (hasWhilstChannelledBullet) {
            hasAppendedReestablishChannelSentence = true;
            bulletLines.push(reestablishChannelSentence);
          }
        }
        return [`${sharedScalingLead}:`, ...bulletLines];
      })()
    : groupedSecondaryPackets.map(({ packets }) => {
    const leadPacket = packets[0];
    const packetTriggerText = readPacketTriggerConditionText(leadPacket);
    const timingPrefix = renderDescriptorTimingPrefix({
      descriptorChassis: power.descriptorChassis,
      hostileEntryPattern: power.primaryDefenceGate?.hostileEntryPattern,
      effectTimingType: getSecondaryDisplayTimingType(
        power.descriptorChassis,
        leadPacket?.effectTimingType,
        chargeConfig,
      ),
      isPrimary: false,
      triggerText: packetTriggerText,
      power,
      effectPacket: leadPacket,
      commitmentModifier: power.commitmentModifier,
      hasMultipleTimingGroups,
      useCastWordingForRelease: useNonReserveChargeCastWording,
      useCastWordingForOnCast: useNonReserveDelayedCastPrefix,
    });
    const sharedScalingLead = renderSecondaryScalingLead(power);
    const contingentBodies =
      timingPrefix && sharedScalingLead
        ? renderSecondaryMergedBodyWithInlineTiming(
            packets
              .map((effectPacket, authoringIndex) => {
                const body = renderSecondaryPacketBody({
                  effectPacket,
                  power,
                });
                if (!body) return null;
                return {
                  effectPacket,
                  authoringIndex,
                  displayTimingKey: getSecondaryDisplayTimingType(
                    power.descriptorChassis,
                    effectPacket?.effectTimingType,
                    chargeConfig,
                  ),
                  timingPrefix,
                  inlineClause: renderSecondaryPacketClause({ effectPacket, power }) ?? "",
                  body,
                };
              })
              .filter((entry): entry is SecondaryRenderEntry => Boolean(entry)),
            power,
            timingPrefix,
          )
        : [];
    const shouldAppendReestablishChannelSentence =
      !hasAppendedReestablishChannelSentence && isWhilstChannelledTiming(getPacketTimingKey(leadPacket));
    if (shouldAppendReestablishChannelSentence) {
      hasAppendedReestablishChannelSentence = true;
    }
    if (timingPrefix && sharedScalingLead) {
      return [
        `${sharedScalingLead} ${joinWithCommasAnd(contingentBodies) || "it also resolves an additional effect"}.`,
        shouldAppendReestablishChannelSentence ? reestablishChannelSentence : null,
      ]
        .filter((segment): segment is string => Boolean(segment))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }
    const contingentPrefix = timingPrefix ?? "After the primary effect,";
    const contingentClauses = packets
      .map((effectPacket) => renderSecondaryPacketClause({ effectPacket, power }))
      .filter((clause): clause is string => Boolean(clause));
    return [
      `${contingentPrefix} ${contingentClauses.join(" ") || "it also resolves an additional effect."}`,
      shouldAppendReestablishChannelSentence ? reestablishChannelSentence : null,
    ]
      .filter((segment): segment is string => Boolean(segment))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  });
  const lines = [channelLine, chargeLine, chassisLine, primaryLine, ...secondaryLines, lifespanLine].filter(
    (line): line is string => Boolean(line),
  );
  if (primaryDefenceCheck && rangeCategory !== "SELF") {
    const defenceTimingText = renderDefenceTimingDescriptor(
      power.name,
      primaryDisplayTimingType,
      power.primaryDefenceGate?.hostileEntryPattern,
      useNonReserveChargeCastWording,
      useNonReserveDelayedCastPrefix,
    );
    if (primaryDefenceCheck.isMultiTarget) {
      lines.push(
        `Each target may attempt a ${primaryDefenceCheck.checkLabel} roll against ${power.name} ${defenceTimingText}.`,
      );
    } else {
      lines.push(
        `The target may attempt a ${primaryDefenceCheck.checkLabel} roll against ${power.name} ${defenceTimingText}.`,
      );
    }
  }
  const primaryStackResistLine = buildStackResistRemovalLane({
    effectPacket: primaryPacket,
    isMultiTarget,
  });
  const primaryOngoingDamageCleanupLine = buildOngoingDamageCleanupLane({
    effectPacket: primaryPacket,
    isMultiTarget,
  });
  lines.push(
    ...renderCleanupLines([
      primaryStackResistLine,
      primaryOngoingDamageCleanupLine,
      ...sameTimingSecondaryResistLines,
      ...sameTimingSecondaryOngoingDamageCleanupLines,
      ...groupedSecondaryResistLines,
      ...groupedSecondaryOngoingDamageCleanupLines,
    ]),
  );
  return lines;
}

export function renderPowerDurationText(
  power: Pick<Power, "effectDurationType" | "effectDurationTurns">,
): string | null {
  const durationType = power.effectDurationType ?? "INSTANT";
  if (durationType === "INSTANT") return null;
  if (durationType === "TURNS") {
    return `Repeat this effect at the start of the target's turn until the target completes ${formatCountedUnit(power.effectDurationTurns, "turn")}.`;
  }
  return "Repeat this effect at the start of the target's turn until removed.";
}

export function renderPowerDurationLine(
  power: Pick<Power, "effectDurationType" | "effectDurationTurns">,
): string | null {
  const durationType = power.effectDurationType ?? "INSTANT";
  if (durationType === "INSTANT") return null;

  if (durationType === "UNTIL_TARGET_NEXT_TURN") {
    return "This effect persists until the start of the target’s next turn.";
  }

  if (durationType === "TURNS") {
    const durationTurns = power.effectDurationTurns ?? 1;
    if (durationTurns <= 1) {
      return "Repeat this effect at the start of the user’s next turn.";
    }
    return `Repeat this effect at the start of the user’s next ${durationTurns} turns.`;
  }

  if (durationType === "PASSIVE") {
    return "Repeat this effect at the start of the user’s turns until removed or the user is slain.";
  }

  return null;
}

export function renderPowerStackCleanupText(): string | null {
  // System rule; not printed on the card.
  return null;
}

function getLevelWoundBonus(level?: number, divisor = 3): number {
  const parsed = typeof level === "number" ? level : Number(level ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  const resolvedDivisor = Number.isFinite(divisor) && divisor > 0 ? divisor : 3;
  return Math.floor(parsed / resolvedDivisor);
}

export function renderAttackActionLines(
  attackConfig: MonsterNaturalAttackConfig,
  weaponSkillValue: number,
  options?: {
    applyWeaponSkillOverride?: boolean;
    strengthMultiplier?: number;
    level?: number;
    levelWoundBonusDivisor?: number;
  },
): string[] {
  const strengthMultiplier =
    typeof options?.strengthMultiplier === "number" && Number.isFinite(options.strengthMultiplier)
      ? options.strengthMultiplier
      : 2;
  const scaleStrength = (value: unknown): number => {
    const woundAmount = Number(value ?? 0) * strengthMultiplier;
    if (!(woundAmount > 0)) return woundAmount;
    // The descriptor engine renders attack damage as strength * 2, so pass the
    // half-wound unit needed to display the already-scaled wound amount once.
    return (
      woundAmount + getLevelWoundBonus(options?.level, options?.levelWoundBonusDivisor)
    ) / 2;
  };

  const descriptorInput = {
    itemType: "WEAPON",
    melee: attackConfig.melee
      ? {
          enabled: attackConfig.melee.enabled,
          damageTypes: attackConfig.melee.damageTypes as unknown as string[],
          targets: attackConfig.melee.targets,
          physicalStrength: scaleStrength(attackConfig.melee.physicalStrength),
          mentalStrength: scaleStrength(attackConfig.melee.mentalStrength),
          gsAttackEffects: attackConfig.melee.attackEffects,
        }
      : undefined,
    ranged: attackConfig.ranged
      ? {
          enabled: attackConfig.ranged.enabled,
          damageTypes: attackConfig.ranged.damageTypes as unknown as string[],
          targets: attackConfig.ranged.targets,
          distance: attackConfig.ranged.distance,
          physicalStrength: scaleStrength(attackConfig.ranged.physicalStrength),
          mentalStrength: scaleStrength(attackConfig.ranged.mentalStrength),
          gsAttackEffects: attackConfig.ranged.attackEffects,
        }
      : undefined,
    aoe: attackConfig.aoe
      ? {
          enabled: attackConfig.aoe.enabled,
          damageTypes: attackConfig.aoe.damageTypes as unknown as string[],
          count: attackConfig.aoe.count,
          centerRange: attackConfig.aoe.centerRange,
          shape: attackConfig.aoe.shape,
          geometry: {
            radius: attackConfig.aoe.sphereRadiusFeet ?? undefined,
            length:
              attackConfig.aoe.shape === "CONE"
                ? attackConfig.aoe.coneLengthFeet ?? undefined
                : attackConfig.aoe.lineLengthFeet ?? undefined,
            width: attackConfig.aoe.lineWidthFeet ?? undefined,
          },
          physicalStrength: scaleStrength(attackConfig.aoe.physicalStrength),
          mentalStrength: scaleStrength(attackConfig.aoe.mentalStrength),
          gsAttackEffects: attackConfig.aoe.attackEffects,
        }
      : undefined,
  };

  const descriptor = buildDescriptorResult(
    descriptorInput as unknown as Parameters<typeof buildDescriptorResult>[0],
  );

  const sections = renderForgeResult(
    descriptor,
    options?.applyWeaponSkillOverride ? { weaponSkillDiceOverride: weaponSkillValue } : undefined,
  );
  const attack = sections.find((s) => s.title === "Attack Actions");
  if (!attack) return [];

  return attack.lines;
}

