import type {
  DiceSize,
  MonsterAttackMode,
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
const ATTACK_MODE_SET = new Set<MonsterAttackMode>([
  "EQUIPPED_WEAPON",
  "NATURAL_WEAPON",
]);
const DURATION_SET = new Set<MonsterPowerDurationType>([
  "INSTANT",
  "TURNS",
  "PASSIVE",
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

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
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

  const attackMode = asString(raw.attackMode, "") as MonsterAttackMode;
  if (!ATTACK_MODE_SET.has(attackMode)) {
    return { ok: false, error: "attackMode must be EQUIPPED_WEAPON or NATURAL_WEAPON" };
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

  const naturalAttackRaw =
    raw.naturalAttack && typeof raw.naturalAttack === "object"
      ? (raw.naturalAttack as Record<string, unknown>)
      : null;

  const data: MonsterUpsertInput = {
    name,
    level: Math.max(1, asInt(raw.level, 1)),
    tier,
    legendary: asBool(raw.legendary, false),
    attackMode,
    equippedWeaponId:
      asString(raw.equippedWeaponId, "") || null,
    customNotes: asString(raw.customNotes, "") || null,
    physicalResilienceCurrent: Math.max(0, asInt(raw.physicalResilienceCurrent, 0)),
    physicalResilienceMax: Math.max(0, asInt(raw.physicalResilienceMax, 0)),
    mentalPerseveranceCurrent: Math.max(0, asInt(raw.mentalPerseveranceCurrent, 0)),
    mentalPerseveranceMax: Math.max(0, asInt(raw.mentalPerseveranceMax, 0)),
    physicalProtection: Math.max(0, asInt(raw.physicalProtection, 0)),
    mentalProtection: Math.max(0, asInt(raw.mentalProtection, 0)),
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
    traits: traitsRaw
      .map((entry, index) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        const text = asString(row.text, "");
        return {
          sortOrder: asInt(row.sortOrder, index),
          text,
        };
      })
      .filter((trait) => trait.text.length > 0),
    naturalAttack:
      naturalAttackRaw && asString(naturalAttackRaw.attackName, "")
        ? {
            attackName: asString(naturalAttackRaw.attackName, ""),
            attackConfig: normalizeAttackConfig(naturalAttackRaw.attackConfig),
          }
        : null,
    powers: normalizedPowers,
  };

  return { ok: true, data };
}
