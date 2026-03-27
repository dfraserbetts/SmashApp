import { buildDescriptorResult } from "@/lib/descriptors/descriptorEngine";
import { renderForgeResult } from "@/lib/descriptors/renderers/forgeRenderer";
import type {
  EffectPacket,
  MonsterNaturalAttackConfig,
  Power,
  PrimaryDefenceGate,
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

function readApplyTo(details: Record<string, unknown> | undefined): "PRIMARY_TARGET" | "SELF" {
  const v = details?.applyTo;
  return v === "SELF" ? "SELF" : "PRIMARY_TARGET";
}

function applyToEntity(applyTo: "PRIMARY_TARGET" | "SELF"): string {
  return applyTo === "SELF" ? "the user" : "the target";
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

function capitalizeSentenceStart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function readPacketTriggerText(effectPacket: EffectPacket | undefined): string {
  const details =
    effectPacket?.detailsJson && typeof effectPacket.detailsJson === "object" && !Array.isArray(effectPacket.detailsJson)
      ? (effectPacket.detailsJson as Record<string, unknown>)
      : {};
  return getDetailsString(details, "effectTriggerText").trim();
}

function readSecondaryScalingMode(details: Record<string, unknown>): "PER_SUCCESS" | "PRIMARY_APPLIED_SUCCESSES" | "PRIMARY_WOUND_BANDS" {
  const value = getDetailsString(details, "secondaryScalingMode").trim().toUpperCase();
  if (value === "PRIMARY_APPLIED_SUCCESSES") return "PRIMARY_APPLIED_SUCCESSES";
  if (value === "PRIMARY_WOUND_BANDS") return "PRIMARY_WOUND_BANDS";
  return "PER_SUCCESS";
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

function normalizeChargeDescriptorConfig(
  descriptorChassisConfig: Record<string, unknown>,
  commitmentModifier: Power["commitmentModifier"] | undefined,
): {
  chargeType: "DELAYED_RELEASE" | "BUILD_POWER";
  chargeTurns: number;
  chargeBonusDicePerTurn: number | null;
} | null {
  if (commitmentModifier !== "CHARGE") return null;
  const chargeType = normalizeChargeType(descriptorChassisConfig.chargeType);
  return {
    chargeType,
    chargeTurns: readPositiveWholeNumber(descriptorChassisConfig.chargeTurns) ?? 1,
    chargeBonusDicePerTurn:
      chargeType === "BUILD_POWER"
        ? readPositiveWholeNumber(descriptorChassisConfig.chargeBonusDicePerTurn) ?? 1
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

function shouldDefineReleaseBehaviour(
  descriptorChassisConfig: Record<string, unknown>,
): boolean {
  const value = descriptorChassisConfig.defineReleaseBehaviour;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return readDescriptorConfigText(descriptorChassisConfig, "releaseBehaviourText").length > 0;
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
  applyTo: "PRIMARY_TARGET" | "SELF",
  powerPotency: number,
): string {
  const entity = applyToEntity(applyTo);

  // Intention-specific grammar for secondary intentions:
  if (intentionType === "DEFENCE") {
    const mode = getDetailsString(details, "attackMode").trim().toUpperCase() === "MENTAL" ? "mental" : "physical";
    return `blocks ${powerPotency} ${mode} wounds suffered by ${entity}`;
  }

  if (intentionType === "HEALING") {
    const mode = getDetailsString(details, "healingMode").trim().toUpperCase() === "MENTAL" ? "mental" : "physical";
    return `heals ${entity} for ${powerPotency} ${mode} wounds`;
  }

  if (intentionType === "CLEANSE") {
    const cleanseEffectType = getDetailsString(details, "cleanseEffectType");

    if (cleanseEffectType === "Effect over time") {
      return `removes ${powerPotency} stacks of the chosen effect from ${entity}`;
    }

    if (cleanseEffectType === "Damage over time") {
      return `removes ${powerPotency} stacks of the chosen damage from ${entity}`;
    }

    if (cleanseEffectType === "Active Power" || cleanseEffectType === "Channelled Power") {
      return `removes ${powerPotency} successes from the chosen power affecting ${entity}`;
    }

    // Fallback: keep it sensible and non-redundant.
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
  return `${baseClause}${applyTo === "SELF" ? " to the user" : " to the target"}`;
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
    checkLabel = "Resist";
  } else if (intention.intention === "DEBUFF") {
    const statTarget = normalizeCoreDefenceStat(readStatTarget(details));
    checkLabel = statTarget ? `${statTarget} Resist` : "Resist";
  } else if (intention.intention === "CLEANSE") {
    const cleanseEffectType = getDetailsString(details, "cleanseEffectType");
    if (cleanseEffectType === "Effect over time" || cleanseEffectType === "Damage over time") {
      checkLabel = "Fortitude Resist";
    } else {
      checkLabel = "Resist";
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
    return `Choose ${meleeTargets} adjacent ${plural(meleeTargets, "target")}.`;
  }
  if (rangeCategory === "RANGED") {
    return `Choose ${rangedTargets} ${plural(rangedTargets, "target")} within ${rangeValue ?? "?"} ft.`;
  }
  if (rangeCategory === "AOE") {
    const sphereRadius = readNumber(rangeExtra, "sphereRadiusFeet");
    const coneLength = readNumber(rangeExtra, "coneLengthFeet");
    const lineWidth = readNumber(rangeExtra, "lineWidthFeet");
    const lineLength = readNumber(rangeExtra, "lineLengthFeet");
    const castRangePhrase = rangeValue === 0 ? "centred on self" : `within ${rangeValue ?? "?"} ft`;

    if (aoeShape === "SPHERE") {
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
): string {
  const defendedTiming =
    hostileEntryPattern === "ON_ATTACH"
      ? "ON_ATTACH"
      : hostileEntryPattern === "ON_PAYLOAD"
        ? (effectTimingType ?? "ON_TRIGGER")
        : (effectTimingType ?? "ON_CAST");

  if (defendedTiming === "ON_CAST") return "as soon as the power is declared";
  if (defendedTiming === "ON_TRIGGER") return "when triggered";
  if (defendedTiming === "ON_ATTACH") return `when ${powerName} attaches`;
  if (defendedTiming === "START_OF_TURN") return "at the start of each turn";
  if (defendedTiming === "END_OF_TURN") return "at the end of each turn";
  if (defendedTiming === "START_OF_TURN_WHILST_CHANNELLED") return "at the start of each turn";
  if (defendedTiming === "END_OF_TURN_WHILST_CHANNELLED") return "at the end of each turn";
  if (defendedTiming === "ON_RELEASE") return "when the power is released";
  if (defendedTiming === "ON_EXPIRY") return `when ${powerName} ends`;
  return "as soon as the power is declared";
}

function renderPacketTimingPrefix(params: {
  descriptorChassis: Power["descriptorChassis"];
  hostileEntryPattern: PrimaryDefenceGate["hostileEntryPattern"] | null | undefined;
  effectTimingType: EffectPacket["effectTimingType"] | undefined;
  isPrimary: boolean;
  triggerText?: string | null;
}): string | null {
  const { descriptorChassis, hostileEntryPattern, effectTimingType, isPrimary } = params;
  const timing = effectTimingType ?? "ON_CAST";
  const triggerText = stripTrailingPeriod(params.triggerText ?? "");

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
      return "When the trigger is sprung,";
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
  commitmentModifier?: Power["commitmentModifier"] | null;
  hasMultipleTimingGroups?: boolean;
}): string | null {
  const timing = params.effectTimingType ?? "ON_CAST";
  const basePrefix = renderPacketTimingPrefix({
    descriptorChassis: params.descriptorChassis,
    hostileEntryPattern: params.hostileEntryPattern,
    effectTimingType: params.effectTimingType,
    isPrimary: params.isPrimary,
    triggerText: params.triggerText,
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
      return `removes ${formatCountedUnit(packetPotency, "stack")} of the chosen damage`;
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
  power: Pick<Power, "potency">;
}): string | null {
  const { effectPacket, power } = params;
  const details = (effectPacket.detailsJson ?? {}) as Record<string, unknown>;
  const applyTo = readApplyTo(details);
  const baseClause = formatSecondaryClause(
    effectPacket.intention,
    renderPacketBaseClause(effectPacket, power),
    details,
    applyTo,
    getPacketPotency(effectPacket, power),
  );
  const durationSuffix = renderPacketEffectDurationSuffix(effectPacket);
  const scalingMode = readSecondaryScalingMode(details);

  if (scalingMode === "PER_SUCCESS") {
    return `it also ${baseClause} per success${durationSuffix ? ` ${durationSuffix}` : ""}.`;
  }

  if (scalingMode === "PRIMARY_APPLIED_SUCCESSES") {
    return `it also ${baseClause} for each applied success from the primary effect${durationSuffix ? ` ${durationSuffix}` : ""}.`;
  }

  const woundsPerSuccess = readPositiveWholeNumber(details.woundsPerSuccess);
  if (!woundsPerSuccess) return null;
  return `for every ${woundsPerSuccess} wounds inflicted, rounded up into wound bands, it also ${baseClause}${durationSuffix ? ` ${durationSuffix}` : ""}.`;
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
    | "commitmentModifier"
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
  );
  const defineReleaseBehaviour = shouldDefineReleaseBehaviour(descriptorChassisConfig);
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
  const genericRangeLead = buildRangeLead(rangeCategory, rangeValue, rangeExtra);
  const rangeLead =
    power.descriptorChassis === "FIELD"
      ? genericRangeLead.replace(/^Choose\b/i, "Create")
      : genericRangeLead;
  const payloadTriggerText = readDescriptorConfigText(descriptorChassisConfig, "payloadTriggerText");
  const triggerPayloadText =
    readDescriptorConfigText(descriptorChassisConfig, "triggerConditionText") || payloadTriggerText;
  const primaryPacketTriggerText = readPacketTriggerText(primaryPacket);
  const attachedPayloadTriggerText = primaryPacketTriggerText || payloadTriggerText;
  const fieldInteractionText = readDescriptorConfigText(descriptorChassisConfig, "fieldInteractionText");
  const timingGroupKeys = Array.from(
    new Set(effectPackets.map((effectPacket) => getPacketTimingKey(effectPacket))),
  );
  const hasMultipleTimingGroups = timingGroupKeys.length > 1;
  const primaryTimingPrefix = renderDescriptorTimingPrefix({
    descriptorChassis: power.descriptorChassis,
    hostileEntryPattern: power.primaryDefenceGate?.hostileEntryPattern,
    effectTimingType: primaryPacket?.effectTimingType,
    isPrimary: true,
    triggerText:
      power.descriptorChassis === "TRIGGER"
        ? (triggerPayloadText || primaryPacketTriggerText)
        : primaryPacketTriggerText,
    commitmentModifier: power.commitmentModifier,
    hasMultipleTimingGroups,
  });
  const primaryBaseClause = primaryPacket
    ? renderPacketBaseClause(primaryPacket, power)
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
      const releaseBehaviourText = defineReleaseBehaviour
        ? readDescriptorConfigText(descriptorChassisConfig, "releaseBehaviourText")
        : "";

      if (chargeConfig.chargeType === "BUILD_POWER") {
        return [
          `Charge ${power.name} for up to ${formatCountedUnit(chargeConfig.chargeTurns, "turn")}, gaining +${formatDieCount(chargeConfig.chargeBonusDicePerTurn ?? 1)} per turn before release.`,
          `Once charged, it may be held in reserve${reserveHoldClause}.`,
          releaseBehaviourText ? `${stripTrailingPeriod(releaseBehaviourText)}.` : null,
        ]
          .filter((segment): segment is string => Boolean(segment))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      }

      return [
        `After ${power.name} has been charged for ${chargeConfig.chargeTurns} ${plural(chargeConfig.chargeTurns, "turn")} it may be held in reserve${reserveHoldClause}.`,
        releaseBehaviourText ? `${stripTrailingPeriod(releaseBehaviourText)}.` : null,
      ]
        .filter((segment): segment is string => Boolean(segment))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (chargeConfig.chargeType === "BUILD_POWER") {
      return `Charge ${power.name} for up to ${formatCountedUnit(chargeConfig.chargeTurns, "turn")}, gaining +${formatDieCount(chargeConfig.chargeBonusDicePerTurn ?? 1)} per turn before release.`;
    }

    return `After ${power.name} has been charged for ${chargeConfig.chargeTurns} ${plural(chargeConfig.chargeTurns, "turn")} it is released at the start of the next turn.`;
  })();
  const chassisLine = (() => {
    if (power.descriptorChassis === "TRIGGER") {
      return null;
    }
    if (power.descriptorChassis === "RESERVE") {
      if (chargeConfig) {
        return null;
      }
      const releaseBehaviourText = defineReleaseBehaviour
        ? readDescriptorConfigText(descriptorChassisConfig, "releaseBehaviourText")
        : "";
      const reserveLifespanText = buildReserveHoldClause(power);
      if (releaseBehaviourText) {
        return `Hold this power in reserve${reserveLifespanText}. ${stripTrailingPeriod(releaseBehaviourText)}.`;
      }
      return `Hold this power in reserve${reserveLifespanText}.`;
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
  const primaryTimingKey = getPacketTimingKey(primaryPacket);
  const shouldExplainReestablishChannel =
    power.commitmentModifier === "CHANNEL" &&
    power.descriptorChassis === "ATTACHED" &&
    effectPackets.some((effectPacket) => isWhilstChannelledTiming(getPacketTimingKey(effectPacket)));
  const reestablishChannelSentence =
    "If the channel is broken, a response or power action can be spent to re-establish the channel.";
  const sameTimingSecondaryClauses = effectPackets
    .slice(1)
    .filter((effectPacket) => getPacketTimingKey(effectPacket) === primaryTimingKey)
    .map((effectPacket) => renderSecondaryPacketClause({ effectPacket, power }))
    .filter((clause): clause is string => Boolean(clause));
  const primaryLine = (() => {
    const rollClause = primaryTimingPrefix
      ? `${primaryTimingPrefix} roll ${getPacketDiceCount(primaryPacket, power)} dice.`
      : `Roll ${getPacketDiceCount(primaryPacket, power)} dice.`;

    if (power.descriptorChassis === "ATTACHED") {
      const anchorText = readDescriptorConfigText(descriptorChassisConfig, "anchorText");
      const targetPhrase = anchorText || "the chosen host";
      const attachedLifespanText =
        power.lifespanType === "TURNS"
          ? ` for up to ${formatCountedUnit(power.lifespanTurns, "turn")}`
          : power.lifespanType === "PASSIVE"
            ? " until it ends or is removed"
            : "";
      const attachLine =
        `${stripTrailingPeriod(genericRangeLead)} and attach ${power.name} to ${targetPhrase}${attachedLifespanText}.`;
      if (power.primaryDefenceGate?.hostileEntryPattern === "ON_PAYLOAD") {
        const triggerLead = renderDescriptorTimingPrefix({
          descriptorChassis: power.descriptorChassis,
          hostileEntryPattern: power.primaryDefenceGate?.hostileEntryPattern,
          effectTimingType: primaryPacket?.effectTimingType,
          isPrimary: true,
          triggerText: attachedPayloadTriggerText,
          commitmentModifier: power.commitmentModifier,
          hasMultipleTimingGroups,
        }) ?? "While attached, when its stored effect is triggered,";
        return [
          attachLine,
          `${triggerLead} roll ${getPacketDiceCount(primaryPacket, power)} dice.`,
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
        primaryPacket?.effectTimingType,
      );
      const fieldRollClause = primaryTimingPrefix
        ? `${primaryTimingPrefix} roll ${getPacketDiceCount(primaryPacket, power)} dice.`
        : `Roll ${getPacketDiceCount(primaryPacket, power)} dice.`;
      const fieldEffectClause = `${fieldRollClause} ${power.name} ${primaryBaseClause} per success${primaryEffectDuration ? ` ${primaryEffectDuration}` : ""}${primaryTimingPrefix ? "" : fieldTimingSuffix ? ` ${fieldTimingSuffix}` : ""}${fieldInteractionText ? ` ${fieldInteractionText}` : ""}.`;
      return [
        rangeLead,
        fieldEffectClause,
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
        ? `${primaryTimingPrefix} ${releaseRangeLead.toLowerCase()} and roll ${getPacketDiceCount(primaryPacket, power)} dice.`
        : `${releaseRangeLead} and roll ${getPacketDiceCount(primaryPacket, power)} dice.`;
      return [
        capitalizeSentenceStart(reserveReleaseLead),
        `${power.name} ${primaryBaseClause} per success${primaryEffectDuration ? ` ${primaryEffectDuration}` : ""}.`,
        ...sameTimingSecondaryClauses,
      ]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (power.descriptorChassis === "TRIGGER") {
      const triggerLifespanSentence =
        power.lifespanType === "TURNS"
          ? `It persists for ${formatCountedUnit(power.lifespanTurns, "turn")}.`
          : power.lifespanType === "PASSIVE"
            ? "It persists until it ends or is removed."
            : null;
      return [
        rangeLead,
        triggerLifespanSentence,
        `${rollClause} ${power.name} ${primaryBaseClause} per success${primaryEffectDuration ? ` ${primaryEffectDuration}` : ""}.`,
        ...sameTimingSecondaryClauses,
      ]
        .filter((segment): segment is string => Boolean(segment))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    return [
      rangeLead,
      rollClause,
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
      if (timingKey === primaryTimingKey) return groups;
      const existingGroup = groups.find((group) => group.timingKey === timingKey);
      if (existingGroup) {
        existingGroup.packets.push(effectPacket);
        return groups;
      }
      groups.push({
        timingKey,
        packets: [effectPacket],
      });
      return groups;
    },
    [] as Array<{ timingKey: EffectPacket["effectTimingType"]; packets: EffectPacket[] }>,
  );
  let hasAppendedReestablishChannelSentence =
    !shouldExplainReestablishChannel || isWhilstChannelledTiming(primaryTimingKey);
  const secondaryLines = groupedSecondaryPackets.map(({ packets }) => {
    const leadPacket = packets[0];
    const packetTriggerText = readPacketTriggerText(leadPacket);
    const timingPrefix = renderDescriptorTimingPrefix({
      descriptorChassis: power.descriptorChassis,
      hostileEntryPattern: power.primaryDefenceGate?.hostileEntryPattern,
      effectTimingType: leadPacket?.effectTimingType,
      isPrimary: false,
      triggerText: packetTriggerText,
      commitmentModifier: power.commitmentModifier,
      hasMultipleTimingGroups,
    });
    const contingentPrefix = timingPrefix ?? "After the primary effect,";
    const contingentBodies = packets
      .map((effectPacket) => renderSecondaryPacketClause({ effectPacket, power }))
      .filter((clause): clause is string => Boolean(clause));
    const shouldAppendReestablishChannelSentence =
      !hasAppendedReestablishChannelSentence && isWhilstChannelledTiming(getPacketTimingKey(leadPacket));
    if (shouldAppendReestablishChannelSentence) {
      hasAppendedReestablishChannelSentence = true;
    }
    return [
      `${contingentPrefix} ${contingentBodies.join(" ") || "it also resolves an additional effect."}`,
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
  if (primaryDefenceCheck) {
    const defenceTimingText = renderDefenceTimingDescriptor(
      power.name,
      primaryPacket?.effectTimingType,
      power.primaryDefenceGate?.hostileEntryPattern,
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

function getLevelWoundBonus(level?: number): number {
  const parsed = typeof level === "number" ? level : Number(level ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed / 3);
}

export function renderAttackActionLines(
  attackConfig: MonsterNaturalAttackConfig,
  weaponSkillValue: number,
  options?: { applyWeaponSkillOverride?: boolean; strengthMultiplier?: number; level?: number },
): string[] {
  const strengthMultiplier =
    typeof options?.strengthMultiplier === "number" && Number.isFinite(options.strengthMultiplier)
      ? options.strengthMultiplier
      : 1;
  const scaleStrength = (value: unknown): number => {
    const baseAmount = Number(value ?? 0) * strengthMultiplier;
    if (!(baseAmount > 0)) return baseAmount;
    return baseAmount + getLevelWoundBonus(options?.level);
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

