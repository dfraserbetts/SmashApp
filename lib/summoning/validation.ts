import type {
  CoreAttribute,
  DiceSize,
  LimitBreakTier,
  MonsterAttack,
  MonsterNaturalAttackConfig,
  MonsterPower,
  MonsterPowerDefenceRequirement,
  MonsterPowerDurationType,
  MonsterPowerIntention,
  MonsterPowerIntentionType,
  MonsterTier,
  MonsterUpsertInput,
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
const DURATION_SET = new Set<MonsterPowerDurationType>([
  "INSTANT",
  "TURNS",
  "PASSIVE",
  "UNTIL_TARGET_NEXT_TURN",
]);
const DEFENCE_REQ_SET = new Set<MonsterPowerDefenceRequirement>([
  "PROTECTION",
  "RESIST",
  "NONE",
]);
const INTENTION_SET = new Set<MonsterPowerIntentionType>([
  "ATTACK",
  "DEFENCE",
  "HEALING",
  "CLEANSE",
  "CONTROL",
  "MOVEMENT",
  "AUGMENT",
  "DEBUFF",
  "SUMMON",
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

function asDice(value: unknown, fallback: DiceSize = "D6"): DiceSize {
  const str = asString(value, fallback) as DiceSize;
  return DICE_SET.has(str) ? str : fallback;
}

function normalizeIntention(
  value: unknown,
  sortOrder: number,
): MonsterPowerIntention {
  const raw = (value ?? {}) as Record<string, unknown>;
  const type = asString(raw.type, "ATTACK") as MonsterPowerIntentionType;
  const details =
    raw.detailsJson && typeof raw.detailsJson === "object"
      ? (raw.detailsJson as Record<string, unknown>)
      : {};
  return {
    sortOrder,
    type: INTENTION_SET.has(type) ? type : "ATTACK",
    detailsJson: details,
  };
}

function normalizePower(value: unknown, sortOrder: number): MonsterPower {
  const raw = (value ?? {}) as Record<string, unknown>;
  const durationType = asString(raw.durationType, "INSTANT") as MonsterPowerDurationType;
  const cooldownTurns = Math.max(1, asInt(raw.cooldownTurns, 1));
  const rawReduction = Math.max(0, asInt(raw.cooldownReduction, 0));
  const cooldownReduction = Math.min(rawReduction, cooldownTurns - 1);
  const intentionsRaw = Array.isArray(raw.intentions) ? raw.intentions : [];
  const normalizedIntentions = intentionsRaw
    .slice(0, 4)
    .map((entry, index) => normalizeIntention(entry, index));

  return {
    sortOrder,
    name: asString(raw.name, ""),
    description: asString(raw.description, "") || null,
    diceCount: Math.max(1, Math.min(20, asInt(raw.diceCount, 1))),
    potency: Math.max(1, Math.min(5, asInt(raw.potency, 1))),
    durationType: DURATION_SET.has(durationType) ? durationType : "INSTANT",
    durationTurns:
      durationType === "TURNS"
        ? Math.max(1, Math.min(4, asInt(raw.durationTurns, 1)))
        : null,
    defenceRequirement: DEFENCE_REQ_SET.has(
      asString(raw.defenceRequirement, "NONE") as MonsterPowerDefenceRequirement,
    )
      ? (asString(raw.defenceRequirement, "NONE") as MonsterPowerDefenceRequirement)
      : "NONE",
    cooldownTurns,
    cooldownReduction,
    responseRequired: asBool(raw.responseRequired, false),
    intentions: normalizedIntentions.length > 0 ? normalizedIntentions : [normalizeIntention({}, 0)],
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
    if (power.intentions.length < 1 || power.intentions.length > 4) {
      return { ok: false, error: "Each power requires 1 to 4 intentions" };
    }
    if (power.durationType !== "TURNS" && power.durationTurns !== null) {
      return { ok: false, error: "durationTurns is only allowed when durationType is TURNS" };
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
