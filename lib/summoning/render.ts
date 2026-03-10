import { buildDescriptorResult } from "@/lib/descriptors/descriptorEngine";
import { renderForgeResult } from "@/lib/descriptors/renderers/forgeRenderer";
import type {
  MonsterNaturalAttackConfig,
  MonsterPower,
  MonsterPowerIntention,
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

export function effectiveCooldownTurns(power: Pick<MonsterPower, "cooldownTurns" | "cooldownReduction">): number {
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

function readApplyTo(details: Record<string, unknown> | undefined): "PRIMARY_TARGET" | "SELF" {
  const v = details?.applyTo;
  return v === "SELF" ? "SELF" : "PRIMARY_TARGET";
}

function applyToEntity(applyTo: "PRIMARY_TARGET" | "SELF"): string {
  return applyTo === "SELF" ? "the user" : "the target";
}

function formatSecondaryClause(
  intentionType: MonsterPowerIntention["type"],
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

function readNumber(details: any, key: string): number | null {
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
  intention: MonsterPowerIntention | undefined,
  rangeCategory: string,
  meleeTargets: number,
  rangedTargets: number,
): { checkLabel: string; isMultiTarget: boolean } | null {
  if (!intention) return null;

  const details = (intention.detailsJson ?? {}) as Record<string, unknown>;
  let checkLabel: string | null = null;

  if (intention.type === "ATTACK") {
    const mode = getDetailsString(details, "attackMode").trim().toUpperCase();
    checkLabel = mode === "MENTAL" ? "Mental Defence" : "Physical Defence";
  } else if (intention.type === "CONTROL") {
    checkLabel = "Resist";
  } else if (intention.type === "MOVEMENT") {
    checkLabel = "Resist";
  } else if (intention.type === "DEBUFF") {
    const statTarget = normalizeCoreDefenceStat(readStatTarget(details));
    checkLabel = statTarget ? `${statTarget} Resist` : "Resist";
  } else if (intention.type === "CLEANSE") {
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

function renderIntentionDetail(
  intention: MonsterPowerIntention,
  potency: number,
): string {
  const details = intention.detailsJson ?? {};

  switch (intention.type) {
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
    case "SUMMON":
      return "resolve summon effect (V2 tooling)";
    case "TRANSFORMATION":
      return "resolve transformation effect (V2 tooling)";
    default:
      return "resolve effect";
  }
}

export function renderPowerSuccessClause(power: Pick<MonsterPower, "potency" | "intentions">): string {
  const sorted = [...power.intentions].sort((a, b) => a.sortOrder - b.sortOrder);
  const details = sorted.map((i) => renderIntentionDetail(i, power.potency));
  const joined =
    details.length <= 1
      ? details[0] ?? "resolve effect"
      : `${details.slice(0, -1).join("; ")}; and ${details[details.length - 1]}`;
  return `For each success, ${joined}.`;
}

export function renderPowerDescriptorLines(
  power: Pick<MonsterPower, "name" | "diceCount" | "potency" | "intentions" | "durationType" | "durationTurns">,
): string[] {
  const intentions = [...power.intentions].sort((a, b) => a.sortOrder - b.sortOrder);
  const primaryDetails = (intentions[0]?.detailsJson ?? {}) as Record<string, unknown>;
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
  const aoeCount = asNumber(rangeExtra.count) ?? 1;
  const aoeShape = getDetailsString(rangeExtra, "shape").trim().toUpperCase() || "SPHERE";

  let targetingLine = "Choose 1 target and";
  if (rangeCategory === "MELEE") {
    targetingLine = `Choose ${meleeTargets} adjacent ${plural(meleeTargets, "target")} and`;
  } else if (rangeCategory === "RANGED") {
    targetingLine = `Choose ${rangedTargets} ${plural(rangedTargets, "target")} and`;
  } else if (rangeCategory === "AOE") {
    const sphereRadius = readNumber(rangeExtra, "sphereRadiusFeet");
    const coneLength = readNumber(rangeExtra, "coneLengthFeet");
    const lineWidth = readNumber(rangeExtra, "lineWidthFeet");
    const lineLength = readNumber(rangeExtra, "lineLengthFeet");
    const castRange = rangeValue;
    const castRangePhrase = castRange === 0 ? " centred on self" : ` within ${castRange ?? "?"} ft`;

    if (aoeShape === "SPHERE") {
      targetingLine = `Choose ${aoeCount} x ${sphereRadius ?? "?"} ft radius Spheres${castRangePhrase} and`;
    } else if (aoeShape === "CONE") {
      targetingLine = `Choose ${aoeCount} x ${coneLength ?? "?"} ft long Cones${castRangePhrase} and`;
    } else if (aoeShape === "LINE") {
      targetingLine = `Choose ${aoeCount} Lines, ${lineWidth ?? "?"} ft wide ${lineLength ?? "?"} ft long${castRangePhrase} and`;
    } else {
      const shapeLabel = humanizeLabel(aoeShape) || "Area";
      targetingLine = `Choose ${aoeCount} ${shapeLabel}${plural(aoeCount, "", "s")}${castRangePhrase} and`;
    }
  }

  const diceLine = `roll ${power.diceCount} dice. ${power.name}`;

  const intentionClauses = intentions.map((intention, intentionIndex) => {
    const details = (intention.detailsJson ?? {}) as Record<string, unknown>;
    let clause = "resolve effect";

    if (intention.type === "ATTACK") {
      const mode = getDetailsString(details, "attackMode").trim().toUpperCase() === "MENTAL" ? "mental" : "physical";
      const damageTypes = getDetailsStringArray(details, "damageTypes")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (damageTypes.length === 0) {
        clause = `inflicts ${power.potency * 2} ${mode} wounds`;
      } else {
        const first = `${power.potency * 2} ${mode} ${damageTypes[0]} wounds`;
        if (damageTypes.length === 1) {
          clause = `inflicts ${first}`;
        } else {
          const remaining = damageTypes
            .slice(1)
            .map((damageType) => `${power.potency * 2} ${mode} ${damageType} wounds`);
          clause = `inflicts ${joinWithCommasAnd([first, ...remaining])}`;
        }
      }
    } else if (intention.type === "DEFENCE") {
      const mode = getDetailsString(details, "attackMode").trim().toUpperCase() === "MENTAL" ? "mental" : "physical";
      clause = `blocks ${power.potency} ${mode} wounds`;
    } else if (intention.type === "HEALING") {
      const mode = getDetailsString(details, "healingMode").trim().toUpperCase() === "MENTAL" ? "mental" : "physical";
      clause = `heals ${power.potency} ${mode} wounds`;
    } else if (intention.type === "CLEANSE") {
      const cleanseEffectType = getDetailsString(details, "cleanseEffectType");
      if (cleanseEffectType === "Effect over time") {
        clause = `removes ${power.potency} stacks of the chosen effect`;
      } else if (cleanseEffectType === "Damage over time") {
        clause = `removes ${power.potency} stacks of the chosen damage`;
      } else if (cleanseEffectType === "Active Power" || cleanseEffectType === "Channelled Power") {
        clause = `removes ${power.potency} successes from the chosen power`;
      } else {
        clause = `removes ${power.potency} stacks of the chosen effect`;
      }
    } else if (intention.type === "CONTROL") {
      const controlSpecific = humanizeLabel(getDetailsString(details, "controlMode")) || "Control";
      clause = `applies ${power.potency} stacks of ${controlSpecific}`;
    } else if (intention.type === "MOVEMENT") {
      const movementMode = humanizeLabel(getDetailsString(details, "movementMode")) || "Move";
      const feet = power.potency * 5;
      if (/force/i.test(movementMode)) {
        if (/teleport/i.test(movementMode)) clause = `teleports the target ${feet} ft`;
        else if (/fly/i.test(movementMode)) clause = `flies the target ${feet} ft`;
        else clause = `pushes the target ${feet} ft`;
      } else if (/teleport/i.test(movementMode)) {
        clause = `teleports ${feet} ft`;
      } else if (/fly/i.test(movementMode)) {
        clause = `moves ${feet} ft by flying`;
      } else {
        clause = `moves ${feet} ft`;
      }
    } else if (intention.type === "AUGMENT") {
      clause = `applies 1 stack of +${power.potency} ${readStatTarget(details)}`;
    } else if (intention.type === "DEBUFF") {
      clause = `inflicts 1 stack of -${power.potency} ${readStatTarget(details)}`;
    } else if (intention.type === "SUMMON") {
      clause = "resolve summon effect (V2)";
    } else if (intention.type === "TRANSFORMATION") {
      clause = "resolve transformation effect (V2)";
    }

    if (intentions.length > 1 && intentionIndex > 0) {
      const applyTo = readApplyTo(details);
      clause = formatSecondaryClause(intention.type, clause, details, applyTo, power.potency);
    }
    return clause;
  });

  const joinedIntentions = joinWithCommasAnd(intentionClauses);
  const intentionsClause = joinedIntentions || "resolve effect";

  const primaryDefenceCheck = derivePrimaryDefenceCheck(
    intentions[0],
    rangeCategory,
    meleeTargets,
    rangedTargets,
  );

  const combinedLine = `${targetingLine} ${diceLine} ${intentionsClause} per success.`
    .replace(/\s+/g, " ")
    .trim();
  const durationInline = renderPowerDurationLine(power as any);
  const combinedWithDuration = durationInline
    ? `${combinedLine} ${durationInline}`
    : combinedLine;
  const lines = [combinedWithDuration];
  if (primaryDefenceCheck) {
    if (primaryDefenceCheck.isMultiTarget) {
      lines.push(`Each target may attempt a ${primaryDefenceCheck.checkLabel} roll against ${power.name}.`);
    } else {
      lines.push(`The target may attempt a ${primaryDefenceCheck.checkLabel} roll against ${power.name}.`);
    }
  }
  return lines;
}

export function renderPowerDurationText(
  power: Pick<MonsterPower, "durationType" | "durationTurns">,
): string | null {
  if (power.durationType === "INSTANT") return null;
  if (power.durationType === "TURNS") {
    return `Repeat this effect at the start of the target's turn until the target completes ${power.durationTurns} turn(s).`;
  }
  return "Repeat this effect at the start of the target's turn until removed.";
}

export function renderPowerDurationLine(power: MonsterPower): string | null {
  if (power.durationType === "INSTANT") return null;

  if (power.durationType === "UNTIL_TARGET_NEXT_TURN") {
    return "This effect persists until the start of the target’s next turn.";
  }

  if (power.durationType === "TURNS") {
    const durationTurns = power.durationTurns ?? 1;
    if (durationTurns <= 1) {
      return "Repeat this effect at the start of the user’s next turn.";
    }
    return `Repeat this effect at the start of the user’s next ${durationTurns} turns.`;
  }

  if (power.durationType === "PASSIVE") {
    return "Repeat this effect at the start of the user’s turns until removed or the user is slain.";
  }

  return null;
}

export function renderPowerStackCleanupText(
  _power: Pick<MonsterPower, "durationType">,
): string | null {
  // System rule; not printed on the card.
  return null;
}

// SC_LEVEL_WOUND_SCALER_V1
function getLevelWoundBonus(level?: number): number {
  const parsed = typeof level === "number" ? level : Number(level ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed / 3));
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

