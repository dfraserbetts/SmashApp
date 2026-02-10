"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type {
  DiceSize,
  MonsterAttack,
  MonsterTraitDefinitionSummary,
  MonsterNaturalAttackConfig,
  MonsterPower,
  MonsterPowerIntentionType,
  MonsterSource,
  MonsterSummary,
  MonsterTier,
  MonsterUpsertInput,
} from "@/lib/summoning/types";
import {
  getArmorSkillDiceCountFromAttributes,
  getDodgeValue,
  getAttributeNumericValue,
  getWeaponSkillDiceCountFromAttributes,
  getWillpowerDiceCountFromAttributes,
} from "@/lib/summoning/attributes";
import {
  getHighestItemModifiers,
  getProtectionTotalsFromItems,
  isTwoHanded,
  isValidBodyItemForSlot,
  isValidHandItemForSlot,
  type SummoningEquipmentItem,
} from "@/lib/summoning/equipment";
import { renderAttackActionLines } from "@/lib/summoning/render";
import { MonsterBlockCard, type WeaponProjection } from "@/app/summoning-circle/components/MonsterBlockCard";

type Props = { campaignId: string };

type EditableMonster = MonsterUpsertInput & {
  id?: string;
  source?: MonsterSource;
  isReadOnly?: boolean;
};

type Picklists = {
  damageTypes: Array<{ id: number; name: string; attackMode?: "PHYSICAL" | "MENTAL" }>;
  attackEffects: Array<{ id: number; name: string }>;
};

type TagSuggestion = {
  value: string;
  source: "global" | "campaign";
};

const HAND_SLOTS = [
  { key: "mainHandItemId", label: "Main Hand" },
  { key: "offHandItemId", label: "Off Hand" },
  { key: "smallItemId", label: "Small Slot" },
] as const;

const BODY_SLOTS = [
  { key: "headItemId", label: "Head" },
  { key: "shoulderItemId", label: "Shoulder" },
  { key: "torsoItemId", label: "Torso" },
  { key: "legsItemId", label: "Legs" },
  { key: "feetItemId", label: "Feet" },
] as const;
const BODY_SLOT_ROWS = [
  [BODY_SLOTS[0]],
  [BODY_SLOTS[1], BODY_SLOTS[2]],
  [BODY_SLOTS[3], BODY_SLOTS[4]],
] as const;
const PICKER_LEVEL_OPTIONS = Array.from({ length: 20 }, (_, idx) => idx + 1);
const MONSTER_TIER_OPTIONS: MonsterTier[] = ["MINION", "SOLDIER", "ELITE", "BOSS"];
const MONSTER_TIER_LABELS: Record<MonsterTier, string> = {
  MINION: "Minion",
  SOLDIER: "Soldier",
  ELITE: "Elite",
  BOSS: "Boss",
};
const MAX_RECENT_PICKER_ITEMS = 5;

const DICE: DiceSize[] = ["D4", "D6", "D8", "D10", "D12"];
const INTENTIONS: MonsterPowerIntentionType[] = [
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
];
const ATTACK_MODES = ["PHYSICAL", "MENTAL"] as const;

const CONTROL_MODES = [
  "Force move",
  "Force no move",
  "Force specific action",
  "Force no action",
  "Force specific power",
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

const AUGMENT_DEBUFF_STATS = [
  "Attack",
  "Defence",
  "Fortitude",
  "Intellect",
  "Support",
  "Bravery",
  "Movement",
  "Weapon Skill",
  "Armor Skill",
  "Dodge",
  "Willpower",
] as const;

function getDetailsString(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  return typeof value === "string" ? value : "";
}

function getDetailsStringArray(details: Record<string, unknown>, key: string): string[] {
  const value = details[key];
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function setPowerIntentionDetails(
  setEditor: Dispatch<SetStateAction<EditableMonster | null>>,
  powerIndex: number,
  intentionIndex: number,
  patch: Record<string, unknown>,
) {
  setEditor((prev) => {
    if (!prev) return prev;
    const powers = prev.powers.map((power, pi) => {
      if (pi !== powerIndex) return power;
      const intentions = power.intentions.map((intention, ii) => {
        if (ii !== intentionIndex) return intention;
        const current = (intention.detailsJson ?? {}) as Record<string, unknown>;
        return { ...intention, detailsJson: { ...current, ...patch } };
      });
      return { ...power, intentions };
    });
    return { ...prev, powers };
  });
}

function toggleStringInArray(arr: string[], value: string): string[] {
  const key = value.toLowerCase();
  const exists = arr.some((entry) => String(entry).toLowerCase() === key);
  return exists
    ? arr.filter((entry) => String(entry).toLowerCase() !== key)
    : [...arr, value];
}

const ATTR_ROWS = [
  ["Attack", "attackDie", "attackResistDie", "attackModifier"],
  ["Defence", "defenceDie", "defenceResistDie", "defenceModifier"],
  ["Fortitude", "fortitudeDie", "fortitudeResistDie", "fortitudeModifier"],
  ["Intellect", "intellectDie", "intellectResistDie", "intellectModifier"],
  ["Support", "supportDie", "supportResistDie", "supportModifier"],
  ["Bravery", "braveryDie", "braveryResistDie", "braveryModifier"],
] as const;
const ATTRIBUTE_TOOLTIPS: Record<(typeof ATTR_ROWS)[number][0], string> = {
  Attack: "Affects Physical Resilience, Weapon Skill, and physical attack dice.",
  Defence: "Affects Physical Resilience, Armor Skill, Dodge, and physical defence dice.",
  Fortitude: "Affects Physical Resilience and Armor Skill.",
  Intellect: "Affects Mental Perseverance, Dodge, and mental attack dice.",
  Support: "Affects Mental Perseverance, Willpower, and all Ally Assist rolls.",
  Bravery: "Affects Mental Perseverance, Weapon Skill, and Willpower.",
};
const DERIVED_STAT_TOOLTIPS = {
  weaponSkill:
    "Derived from Attack + Bravery. Sets attack dice count for weapon/natural attacks.",
  armorSkill:
    "Derived from Defence + Fortitude. Sets dice count for Physical Protection defence.",
  dodge:
    "Derived from Defence + Intellect + Level − Weight. Sets dice count for Dodge defence.",
  willpower:
    "Derived from Support + Bravery. Sets dice count for Mental Protection defence.",
} as const;

const TIER_MULTIPLIER: Record<MonsterTier, number> = {
  MINION: 1,
  SOLDIER: 1.5,
  ELITE: 2,
  BOSS: 3,
};

const LEGENDARY_BONUS_BY_TIER: Record<MonsterTier, number> = {
  MINION: 0.25,
  SOLDIER: 0.5,
  ELITE: 0.75,
  BOSS: 1,
};
const TRAIT_POINTS_PLACEHOLDER = 5;

function dieLabel(value: DiceSize | null | undefined): string {
  if (!value) return "-";
  return `d${value.replace("D", "")}`;
}

function calculateResilienceValues(
  monster: Pick<
    EditableMonster,
    | "level"
    | "tier"
    | "legendary"
    | "attackDie"
    | "defenceDie"
    | "fortitudeDie"
    | "intellectDie"
    | "supportDie"
    | "braveryDie"
  >,
): {
  physicalResilienceMax: number;
  mentalPerseveranceMax: number;
} {
  const tierMultiplier = TIER_MULTIPLIER[monster.tier];
  const legendaryBonus = monster.legendary ? LEGENDARY_BONUS_BY_TIER[monster.tier] : 0;

  const prBase =
    monster.level +
    (getAttributeNumericValue(monster.attackDie) +
      getAttributeNumericValue(monster.defenceDie) +
      getAttributeNumericValue(monster.fortitudeDie));
  const mpBase =
    monster.level +
    (getAttributeNumericValue(monster.intellectDie) +
      getAttributeNumericValue(monster.supportDie) +
      getAttributeNumericValue(monster.braveryDie));

  const physicalResilienceMax = Math.round(prBase * tierMultiplier + prBase * legendaryBonus);
  const mentalPerseveranceMax = Math.round(mpBase * tierMultiplier + mpBase * legendaryBonus);

  return { physicalResilienceMax, mentalPerseveranceMax };
}

function defaultNaturalConfig(): MonsterNaturalAttackConfig {
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: 1,
      mentalStrength: 0,
      damageTypes: [],
      attackEffects: [],
    },
    ranged: {
      enabled: false,
      targets: 1,
      distance: 30,
      physicalStrength: 0,
      mentalStrength: 0,
      damageTypes: [],
      attackEffects: [],
    },
    aoe: {
      enabled: false,
      count: 1,
      centerRange: 0,
      shape: "SPHERE",
      sphereRadiusFeet: 5,
      physicalStrength: 0,
      mentalStrength: 0,
      damageTypes: [],
      attackEffects: [],
    },
  };
}

function defaultNaturalAttackEntry(sortOrder = 0): MonsterAttack {
  return {
    sortOrder,
    attackMode: "NATURAL",
    attackName: "Natural Weapon",
    attackConfig: defaultNaturalConfig(),
  };
}

function normalizeAttackEntry(
  value: unknown,
  sortOrder: number,
): MonsterAttack {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    sortOrder,
    attackMode: "NATURAL",
    attackName: String(raw.attackName ?? "Natural Weapon"),
    attackConfig: (raw.attackConfig ?? defaultNaturalConfig()) as MonsterNaturalAttackConfig,
  };
}

function defaultMonster(): EditableMonster {
  return {
    name: "New Monster",
    imageUrl: null,
    level: 1,
    tier: "MINION",
    legendary: false,
    customNotes: null,
    physicalResilienceCurrent: 10,
    physicalResilienceMax: 10,
    mentalPerseveranceCurrent: 10,
    mentalPerseveranceMax: 10,
    physicalProtection: 0,
    mentalProtection: 0,
    attackDie: "D6",
    attackResistDie: 0,
    attackModifier: 0,
    defenceDie: "D6",
    defenceResistDie: 0,
    defenceModifier: 0,
    fortitudeDie: "D6",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D6",
    intellectResistDie: 0,
    intellectModifier: 0,
    supportDie: "D6",
    supportResistDie: 0,
    supportModifier: 0,
    braveryDie: "D6",
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: 3,
    weaponSkillModifier: 0,
    armorSkillValue: 3,
    armorSkillModifier: 0,
    mainHandItemId: null,
    offHandItemId: null,
    smallItemId: null,
    headItemId: null,
    shoulderItemId: null,
    torsoItemId: null,
    legsItemId: null,
    feetItemId: null,
    tags: [],
    traits: [],
    attacks: [defaultNaturalAttackEntry(0)],
    naturalAttack: { attackName: "Natural Weapon", attackConfig: defaultNaturalConfig() },
    powers: [],
  };
}

function toEditable(raw: Record<string, unknown>): EditableMonster {
  const tagsRaw = Array.isArray(raw.tags)
    ? raw.tags.map((entry) => String((entry as { tag?: unknown }).tag ?? ""))
    : [];
  const tags: string[] = [];
  const tagSeen = new Set<string>();
  for (const rawTag of tagsRaw) {
    const tag = rawTag.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (tagSeen.has(key)) continue;
    tagSeen.add(key);
    tags.push(tag);
  }
  const traits = Array.isArray(raw.traits)
    ? raw.traits
        .map((entry, i) => {
          const row = entry as {
            sortOrder?: unknown;
            traitDefinitionId?: unknown;
            name?: unknown;
            effectText?: unknown;
            text?: unknown;
            trait?: { id?: unknown; name?: unknown; effectText?: unknown } | null;
          };
          const traitDefinitionId =
            typeof row.traitDefinitionId === "string" && row.traitDefinitionId.trim().length > 0
              ? row.traitDefinitionId.trim()
              : typeof row.trait?.id === "string" && row.trait.id.trim().length > 0
                ? row.trait.id.trim()
                : "";
          const name =
            typeof row.trait?.name === "string"
              ? row.trait.name
              : typeof row.name === "string"
                ? row.name
                : typeof row.text === "string"
                  ? row.text
                  : null;
          const effectText =
            typeof row.trait?.effectText === "string"
              ? row.trait.effectText
              : typeof row.effectText === "string"
                ? row.effectText
                : null;
          return {
            sortOrder: i,
            traitDefinitionId,
            name: name?.trim() || null,
            effectText: effectText?.trim() || null,
          };
        })
        .filter((trait) => trait.traitDefinitionId.length > 0)
    : [];
  const powers = Array.isArray(raw.powers)
    ? raw.powers.map((entry, i) => {
        const p = entry as Record<string, unknown>;
        return {
          sortOrder: i,
          name: String(p.name ?? ""),
          description: p.description ? String(p.description) : null,
          diceCount: Number(p.diceCount ?? 1),
          potency: Number(p.potency ?? 1),
          durationType: p.durationType as MonsterPower["durationType"],
          durationTurns: p.durationType === "TURNS" ? Number(p.durationTurns ?? 1) : null,
          defenceRequirement: p.defenceRequirement as MonsterPower["defenceRequirement"],
          cooldownTurns: Number(p.cooldownTurns ?? 1),
          cooldownReduction: Number(p.cooldownReduction ?? 0),
          responseRequired: !!p.responseRequired,
          intentions: Array.isArray(p.intentions)
            ? p.intentions.map((intention, j) => {
                const it = intention as Record<string, unknown>;
                return {
                  sortOrder: j,
                  type: it.type as MonsterPowerIntentionType,
                  detailsJson:
                    it.detailsJson && typeof it.detailsJson === "object"
                      ? (it.detailsJson as Record<string, unknown>)
                      : {},
                };
              })
            : [],
        };
      })
    : [];

  const naturalAttackRaw =
    raw.naturalAttack && typeof raw.naturalAttack === "object"
      ? (raw.naturalAttack as Record<string, unknown>)
      : null;
  const attacksRaw = Array.isArray(raw.attacks) ? raw.attacks : [];
  const normalizedAttacks: MonsterAttack[] = attacksRaw
    .slice(0, 3)
    .map((entry, index) => normalizeAttackEntry(entry, index));
  const attacks = (normalizedAttacks.length > 0
    ? normalizedAttacks
    : naturalAttackRaw
      ? [
          {
            sortOrder: 0,
            attackMode: "NATURAL" as const,
            attackName: String(naturalAttackRaw.attackName ?? "Natural Weapon"),
            attackConfig: (naturalAttackRaw.attackConfig ??
              defaultNaturalConfig()) as MonsterNaturalAttackConfig,
          },
        ]
      : []
  ).map((attack, index) => ({ ...attack, sortOrder: index }));

  const rawMainHandItemId = typeof raw.mainHandItemId === "string" ? raw.mainHandItemId : null;
  const mainHandItemId =
    rawMainHandItemId && rawMainHandItemId.trim().length > 0 ? rawMainHandItemId.trim() : null;

  return {
    ...defaultMonster(),
    ...raw,
    attackResistDie: Number(raw.attackResistDie ?? 0),
    defenceResistDie: Number(raw.defenceResistDie ?? 0),
    fortitudeResistDie: Number(raw.fortitudeResistDie ?? 0),
    intellectResistDie: Number(raw.intellectResistDie ?? 0),
    supportResistDie: Number(raw.supportResistDie ?? 0),
    braveryResistDie: Number(raw.braveryResistDie ?? 0),
    id: typeof raw.id === "string" ? raw.id : undefined,
    source:
      raw.source === "CORE" || raw.source === "CAMPAIGN"
        ? (raw.source as MonsterSource)
        : undefined,
    isReadOnly: !!raw.isReadOnly,
    imageUrl:
      typeof raw.imageUrl === "string" && raw.imageUrl.trim().length > 0
        ? raw.imageUrl.trim()
        : null,
    mainHandItemId,
    offHandItemId:
      typeof raw.offHandItemId === "string" && raw.offHandItemId.trim().length > 0
        ? raw.offHandItemId.trim()
        : null,
    smallItemId:
      typeof raw.smallItemId === "string" && raw.smallItemId.trim().length > 0
        ? raw.smallItemId.trim()
        : null,
    headItemId:
      typeof raw.headItemId === "string" && raw.headItemId.trim().length > 0
        ? raw.headItemId.trim()
        : null,
    shoulderItemId:
      typeof raw.shoulderItemId === "string" && raw.shoulderItemId.trim().length > 0
        ? raw.shoulderItemId.trim()
        : null,
    torsoItemId:
      typeof raw.torsoItemId === "string" && raw.torsoItemId.trim().length > 0
        ? raw.torsoItemId.trim()
        : null,
    legsItemId:
      typeof raw.legsItemId === "string" && raw.legsItemId.trim().length > 0
        ? raw.legsItemId.trim()
        : null,
    feetItemId:
      typeof raw.feetItemId === "string" && raw.feetItemId.trim().length > 0
        ? raw.feetItemId.trim()
        : null,
    tags,
    traits,
    attacks,
    naturalAttack: naturalAttackRaw
      ? {
          attackName: String(naturalAttackRaw.attackName ?? "Natural Weapon"),
          attackConfig: (naturalAttackRaw.attackConfig ??
            defaultNaturalConfig()) as MonsterNaturalAttackConfig,
        }
      : null,
    powers,
  };
}

function toPayload(monster: EditableMonster): MonsterUpsertInput {
  const normalizedAttacks = monster.attacks
    .slice(0, 3)
    .map((attack, index) => ({
      ...attack,
      sortOrder: index,
      attackMode: "NATURAL" as const,
      attackName: attack.attackName ?? "Natural Weapon",
      attackConfig: attack.attackConfig ?? defaultNaturalConfig(),
    }));
  const primaryAttack = normalizedAttacks[0];

  return {
    ...monster,
    naturalAttack: primaryAttack
      ? {
          attackName: primaryAttack.attackName ?? "Natural Weapon",
          attackConfig: primaryAttack.attackConfig ?? defaultNaturalConfig(),
        }
      : null,
    tags: [...monster.tags],
    traits: monster.traits.map((trait, i) => ({
      sortOrder: i,
      traitDefinitionId: trait.traitDefinitionId,
    })),
    attacks: normalizedAttacks,
    powers: monster.powers.map((p, i) => ({
      ...p,
      sortOrder: i,
      intentions: p.intentions.map((it, j) => ({ ...it, sortOrder: j })),
    })),
  };
}

function defaultPower(): MonsterPower {
  return {
    sortOrder: 0,
    name: "New Power",
    description: null,
    diceCount: 1,
    potency: 1,
    durationType: "INSTANT",
    durationTurns: null,
    defenceRequirement: "NONE",
    cooldownTurns: 1,
    cooldownReduction: 0,
    responseRequired: false,
    intentions: [{ sortOrder: 0, type: "ATTACK", detailsJson: {} }],
  };
}

function listFromCsv(value: string): string[] {
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function canonicalizeTag(
  raw: string,
  universe: TagSuggestion[],
  existing: string[],
): string | null {
  const tag = raw.trim();
  if (!tag) return null;

  const key = tag.toLowerCase();
  if (existing.some((entry) => entry.toLowerCase() === key)) {
    return null;
  }

  const canonical = universe.find((entry) => entry.value.toLowerCase() === key);
  if (canonical) return canonical.value;

  return tag;
}

function tokenFromTagInput(value: string): string {
  const parts = value.split(",");
  return parts[parts.length - 1]?.trim() ?? "";
}

function formatNumberRanges(values: number[]): string {
  if (values.length === 0) return "";
  const sorted = [...values].sort((a, b) => a - b);
  const ranges: Array<{ start: number; end: number }> = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    if (current === end + 1) {
      end = current;
      continue;
    }
    ranges.push({ start, end });
    start = current;
    end = current;
  }
  ranges.push({ start, end });

  return ranges
    .map((range) => (range.start === range.end ? String(range.start) : `${range.start}-${range.end}`))
    .join(", ");
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function monsterMatches(row: MonsterSummary, q: string): boolean {
  const query = normalizeSearch(q);
  if (!query) return true;

  const name = String((row as { name?: unknown }).name ?? "").toLowerCase();
  if (name.includes(query)) return true;

  const tags = getMonsterTags(row);

  return tags.some((tag) => String(tag).toLowerCase().includes(query));
}

function isLegendaryMonster(row: MonsterSummary): boolean {
  const candidate = row as unknown as { legendary?: unknown; rarity?: unknown };
  if (typeof candidate.legendary === "boolean") {
    return candidate.legendary;
  }
  return String(candidate.rarity ?? "").trim().toLowerCase() === "legendary";
}

function getMonsterTags(row: MonsterSummary): string[] {
  const candidate = row as unknown as { tags?: unknown };
  return Array.isArray(candidate.tags) ? (candidate.tags as string[]) : [];
}

function asNullableId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asNullableText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function damageTypesFromCsv(
  value: string,
  picklists: Picklists,
): Array<{ name: string; mode: "PHYSICAL" | "MENTAL" }> {
  const names = listFromCsv(value);
  return names.map((name) => {
    const match = picklists.damageTypes.find((row) => row.name.toLowerCase() === name.toLowerCase());
    return {
      name,
      mode: match?.attackMode ?? "PHYSICAL",
    };
  });
}

function getWeaponSourceAttackLines(
  item: Pick<WeaponProjection, "type" | "melee" | "ranged" | "aoe"> | null | undefined,
  weaponSkillValue: number,
): string[] {
  if (!item) return [];
  if (item.type !== "WEAPON" && item.type !== "SHIELD") return [];
  return renderAttackActionLines(
    {
      melee: item.melee,
      ranged: item.ranged,
      aoe: item.aoe,
    } as MonsterNaturalAttackConfig,
    weaponSkillValue,
    { applyWeaponSkillOverride: true },
  );
}

function HoverTooltipLabel({
  label,
  tooltip,
  className,
}: {
  label: string;
  tooltip: string;
  className?: string;
}) {
  return (
    <span className="group relative inline-flex items-center">
      <span
        tabIndex={0}
        className={[
          "cursor-help rounded-sm border-b border-dotted border-zinc-500 outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
          className ?? "text-sm",
        ].join(" ")}
      >
        {label}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 w-64 -translate-x-1/2 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {tooltip}
      </span>
    </span>
  );
}

export function SummoningCircleEditor({ campaignId }: Props) {
  const [summaries, setSummaries] = useState<MonsterSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditableMonster | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [activeTagIndex, setActiveTagIndex] = useState<number>(-1);
  const [tagsFocused, setTagsFocused] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [weapons, setWeapons] = useState<WeaponProjection[]>([]);
  const [picklists, setPicklists] = useState<Picklists>({ damageTypes: [], attackEffects: [] });
  const [traitDefinitions, setTraitDefinitions] = useState<MonsterTraitDefinitionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [equipmentCapHint, setEquipmentCapHint] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"editor" | "preview">("editor");
  const [monsterPickerOpen, setMonsterPickerOpen] = useState(false);
  const [monsterPickerQuery, setMonsterPickerQuery] = useState("");
  const [monsterFiltersOpen, setMonsterFiltersOpen] = useState(false);
  const [monsterLevelSelected, setMonsterLevelSelected] = useState<number[]>([]);
  const [monsterTierSelected, setMonsterTierSelected] = useState<MonsterTier[]>([]);
  const [monsterExcludeLegendary, setMonsterExcludeLegendary] = useState(false);
  const [recentMonsterIds, setRecentMonsterIds] = useState<string[]>([]);
  const hasDraftRef = useRef(false);
  const monsterPickerRef = useRef<HTMLDivElement | null>(null);
  const monsterFiltersRef = useRef<HTMLDivElement | null>(null);

  const readOnly = !!editor && (editor.source === "CORE" || editor.isReadOnly);
  const resilienceValues = useMemo(
    () =>
      editor
        ? calculateResilienceValues(editor)
        : { physicalResilienceMax: 0, mentalPerseveranceMax: 0 },
    [editor],
  );
  const computedWeaponSkillValue = useMemo(
    () =>
      editor
        ? getWeaponSkillDiceCountFromAttributes(editor.attackDie, editor.braveryDie)
        : 1,
    [editor?.attackDie, editor?.braveryDie],
  );
  const computedArmorSkillValue = useMemo(
    () =>
      editor
        ? getArmorSkillDiceCountFromAttributes(editor.defenceDie, editor.fortitudeDie)
        : 1,
    [editor?.defenceDie, editor?.fortitudeDie],
  );
  const queryFilteredSummaries = useMemo(
    () => summaries.filter((summary) => monsterMatches(summary, monsterPickerQuery)),
    [summaries, monsterPickerQuery],
  );
  const filteredSummaries = useMemo(
    () =>
      queryFilteredSummaries.filter((summary) => {
        if (monsterLevelSelected.length > 0 && !monsterLevelSelected.includes(summary.level)) {
          return false;
        }
        if (monsterTierSelected.length > 0 && !monsterTierSelected.includes(summary.tier)) {
          return false;
        }
        if (monsterExcludeLegendary && isLegendaryMonster(summary)) {
          return false;
        }
        return true;
      }),
    [queryFilteredSummaries, monsterExcludeLegendary, monsterLevelSelected, monsterTierSelected],
  );
  const recentMonsterStorageKey = useMemo(
    () => `sc.recentMonsters.${campaignId}`,
    [campaignId],
  );
  const summariesById = useMemo(() => {
    const map: Record<string, MonsterSummary> = {};
    for (const row of summaries) {
      map[row.id] = row;
    }
    return map;
  }, [summaries]);
  const hasMonsterSearchQuery = monsterPickerQuery.trim().length > 0;
  const hasMonsterFilters =
    monsterLevelSelected.length > 0 ||
    monsterTierSelected.length > 0 ||
    monsterExcludeLegendary;
  const monsterPickerTotalCount = summaries.length;
  const monsterPickerFilteredCount = filteredSummaries.length;
  const activeMonsterFilterPills = useMemo(() => {
    const pills: Array<{ id: "level" | "tier" | "noLegendary"; label: string }> = [];
    if (monsterLevelSelected.length > 0) {
      pills.push({
        id: "level",
        label: `Level: ${formatNumberRanges(monsterLevelSelected)}`,
      });
    }
    if (monsterTierSelected.length > 0) {
      pills.push({
        id: "tier",
        label: `Tier: ${monsterTierSelected.map((tier) => MONSTER_TIER_LABELS[tier]).join(", ")}`,
      });
    }
    if (monsterExcludeLegendary) {
      pills.push({ id: "noLegendary", label: "No Legendary" });
    }
    return pills;
  }, [monsterExcludeLegendary, monsterLevelSelected, monsterTierSelected]);
  const recentMonsterRows = useMemo(() => {
    if (hasMonsterSearchQuery) return [] as MonsterSummary[];
    const allowedIds = new Set(filteredSummaries.map((row) => row.id));
    const rows: MonsterSummary[] = [];
    for (const id of recentMonsterIds) {
      const row = summariesById[id];
      if (!row) continue;
      if (!allowedIds.has(row.id)) continue;
      rows.push(row);
    }
    return rows;
  }, [filteredSummaries, hasMonsterSearchQuery, recentMonsterIds, summariesById]);
  const recentMonsterIdSet = useMemo(
    () => new Set(recentMonsterRows.map((row) => row.id)),
    [recentMonsterRows],
  );
  const filteredSummariesWithoutRecent = useMemo(
    () => filteredSummaries.filter((row) => !recentMonsterIdSet.has(row.id)),
    [filteredSummaries, recentMonsterIdSet],
  );

  const refreshSummaries = useCallback(async () => {
    const res = await fetch(
      `/api/summoning-circle/monsters?campaignId=${encodeURIComponent(campaignId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error("Failed to load monsters");
    const json = await res.json();
    const list = Array.isArray(json.monsters) ? (json.monsters as MonsterSummary[]) : [];
    setSummaries(list);
    setSelectedId((current) => {
      if (current) {
        return list.some((m) => m.id === current) ? current : (list[0]?.id ?? null);
      }
      return hasDraftRef.current ? null : (list[0]?.id ?? null);
    });
  }, [campaignId]);

  const refreshStatic = useCallback(async () => {
    const [weaponRes, pickRes, traitRes] = await Promise.all([
      fetch(`/api/summoning-circle/weapons?campaignId=${encodeURIComponent(campaignId)}`, {
        cache: "no-store",
      }),
      fetch("/api/forge/picklists", { cache: "no-store" }),
      fetch("/api/summoning-circle/traits", { cache: "no-store" }),
    ]);

    if (weaponRes.ok) {
      const json = await weaponRes.json();
      setWeapons(Array.isArray(json.weapons) ? json.weapons : []);
    }
    if (pickRes.ok) {
      const json = await pickRes.json();
      setPicklists({
        damageTypes: Array.isArray(json.damageTypes) ? json.damageTypes : [],
        attackEffects: Array.isArray(json.attackEffects) ? json.attackEffects : [],
      });
    }
    if (traitRes.ok) {
      const json = await traitRes.json();
      setTraitDefinitions(
        Array.isArray(json.rows)
          ? json.rows.map((row: unknown) => {
              const candidate = row as {
                id?: unknown;
                name?: unknown;
                effectText?: unknown;
              };
              return {
                id: String(candidate.id ?? ""),
                name: String(candidate.name ?? ""),
                effectText:
                  typeof candidate.effectText === "string"
                    ? candidate.effectText
                    : null,
              };
            })
          : [],
      );
    }
  }, [campaignId]);

  const refreshSelected = useCallback(
    async (id: string) => {
      const res = await fetch(
        `/api/summoning-circle/monsters/${id}?campaignId=${encodeURIComponent(campaignId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to load monster");
      const json = await res.json();
      setEditor(toEditable(json));
    },
    [campaignId],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([refreshSummaries(), refreshStatic()]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [refreshSummaries, refreshStatic]);

  useEffect(() => {
    if (!selectedId) return;
    const monsterId = selectedId;
    let cancelled = false;
    async function load() {
      try {
        await refreshSelected(monsterId);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load monster");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [refreshSelected, selectedId]);

  useEffect(() => {
    if (!editor) {
      setTagInput("");
      setTagSuggestions([]);
      setActiveTagIndex(-1);
      setEquipmentCapHint(null);
      return;
    }
    setTagInput("");
    setTagSuggestions([]);
    setActiveTagIndex(-1);
    setEquipmentCapHint(null);
  }, [editor?.id, selectedId]);

  useEffect(() => {
    setMonsterPickerOpen(false);
    setMonsterPickerQuery("");
  }, [selectedId]);

  useEffect(() => {
    setMonsterFiltersOpen(false);
    setMonsterLevelSelected([]);
    setMonsterTierSelected([]);
    setMonsterExcludeLegendary(false);
  }, [campaignId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setRecentMonsterIds([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(recentMonsterStorageKey);
      if (!raw) {
        setRecentMonsterIds([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setRecentMonsterIds([]);
        return;
      }
      const sanitized = parsed
        .map((value) => String(value))
        .filter((value) => value.trim().length > 0)
        .slice(0, MAX_RECENT_PICKER_ITEMS);
      setRecentMonsterIds(sanitized);
    } catch {
      setRecentMonsterIds([]);
    }
  }, [recentMonsterStorageKey]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (monsterPickerRef.current && !monsterPickerRef.current.contains(target)) {
        setMonsterPickerOpen(false);
      }
      if (monsterFiltersRef.current && !monsterFiltersRef.current.contains(target)) {
        setMonsterFiltersOpen(false);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (monsterFiltersOpen) {
        setMonsterFiltersOpen(false);
        return;
      }
      if (monsterPickerOpen) {
        setMonsterPickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [monsterFiltersOpen, monsterPickerOpen]);

  const persistRecentMonsterIds = useCallback(
    (ids: string[]) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(
          recentMonsterStorageKey,
          JSON.stringify(ids.slice(0, MAX_RECENT_PICKER_ITEMS)),
        );
      } catch {
        // no-op: localStorage unavailable
      }
    },
    [recentMonsterStorageKey],
  );

  useEffect(() => {
    if (summaries.length === 0) return;
    const validIds = new Set(summaries.map((row) => row.id));
    setRecentMonsterIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      if (next.length !== prev.length) {
        persistRecentMonsterIds(next);
      }
      return next;
    });
  }, [persistRecentMonsterIds, summaries]);

  const markMonsterAsRecent = useCallback(
    (monsterId: string) => {
      setRecentMonsterIds((prev) => {
        const next = [monsterId, ...prev.filter((id) => id !== monsterId)].slice(
          0,
          MAX_RECENT_PICKER_ITEMS,
        );
        persistRecentMonsterIds(next);
        return next;
      });
    },
    [persistRecentMonsterIds],
  );

  const currentTagToken = useMemo(() => tokenFromTagInput(tagInput), [tagInput]);

  const filteredTagSuggestions = useMemo(() => {
    if (!editor) return [];
    const existing = new Set(editor.tags.map((tag) => tag.toLowerCase()));
    return tagSuggestions.filter((suggestion) => !existing.has(suggestion.value.toLowerCase()));
  }, [editor, tagSuggestions]);

  useEffect(() => {
    if (!editor || readOnly) return;
    if (currentTagToken.length < 2) {
      setTagSuggestions([]);
      setActiveTagIndex(-1);
      setTagsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setTagsLoading(true);
      try {
        const res = await fetch(
          `/api/summoning-circle/tags?campaignId=${encodeURIComponent(campaignId)}&s=${encodeURIComponent(currentTagToken)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!res.ok) throw new Error("Failed to load tag suggestions");
        const json = (await res.json()) as { suggestions?: TagSuggestion[] };
        setTagSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") {
          setTagSuggestions([]);
          setActiveTagIndex(-1);
        }
      } finally {
        setTagsLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [campaignId, currentTagToken, editor, readOnly]);

  const isTagDropdownOpen = tagsFocused && currentTagToken.length >= 2;

  useEffect(() => {
    if (!isTagDropdownOpen || filteredTagSuggestions.length === 0) {
      setActiveTagIndex(-1);
      return;
    }
    setActiveTagIndex(-1);
  }, [filteredTagSuggestions, isTagDropdownOpen]);

  const commitTagInput = useCallback(
    (rawValue?: string) => {
      const valueToCommit = rawValue ?? tagInput;
      const parsed = listFromCsv(valueToCommit);

      if (parsed.length > 0) {
        setEditor((prev) =>
          prev
            ? (() => {
                const nextTags = [...prev.tags];
                for (const part of parsed) {
                  const canonical = canonicalizeTag(part, tagSuggestions, nextTags);
                  if (!canonical) continue;
                  nextTags.push(canonical);
                }
                return { ...prev, tags: nextTags };
              })()
            : prev,
        );
      }

      setTagInput("");
      setTagSuggestions([]);
      setActiveTagIndex(-1);
    },
    [tagInput, tagSuggestions],
  );

  const weaponById = useMemo(() => {
    const map: Record<string, WeaponProjection> = {};
    for (const weapon of weapons) {
      map[weapon.id] = weapon;
    }
    return map;
  }, [weapons]);
  const traitById = useMemo(() => {
    const map: Record<string, MonsterTraitDefinitionSummary> = {};
    for (const trait of traitDefinitions) {
      map[trait.id] = trait;
    }
    return map;
  }, [traitDefinitions]);

  useEffect(() => {
    setEditor((prev) => {
      if (!prev) return prev;

      const next = { ...prev };
      let changed = false;

      const main = next.mainHandItemId ? weaponById[next.mainHandItemId] ?? null : null;
      if (isTwoHanded(main) && next.offHandItemId) {
        next.offHandItemId = null;
        changed = true;
      }

      const handSlots: Array<"mainHandItemId" | "offHandItemId" | "smallItemId"> = [
        "mainHandItemId",
        "offHandItemId",
        "smallItemId",
      ];
      for (const slot of handSlots) {
        const itemId = next[slot];
        if (!itemId) continue;
        const item = weaponById[itemId] ?? null;
        if (!item || !isValidHandItemForSlot(slot, item) || (slot === "offHandItemId" && isTwoHanded(main))) {
          next[slot] = null;
          changed = true;
        }
      }

      const bodySlots: Array<"headItemId" | "shoulderItemId" | "torsoItemId" | "legsItemId" | "feetItemId"> = [
        "headItemId",
        "shoulderItemId",
        "torsoItemId",
        "legsItemId",
        "feetItemId",
      ];
      for (const slot of bodySlots) {
        const itemId = next[slot];
        if (!itemId) continue;
        const item = weaponById[itemId] ?? null;
        if (!item || !isValidBodyItemForSlot(slot, item)) {
          next[slot] = null;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [weaponById]);

  const equippedItems = useMemo(() => {
    if (!editor) return [] as Array<SummoningEquipmentItem | null>;
    return [
      editor.mainHandItemId ? weaponById[editor.mainHandItemId] ?? null : null,
      editor.offHandItemId ? weaponById[editor.offHandItemId] ?? null : null,
      editor.smallItemId ? weaponById[editor.smallItemId] ?? null : null,
      editor.headItemId ? weaponById[editor.headItemId] ?? null : null,
      editor.shoulderItemId ? weaponById[editor.shoulderItemId] ?? null : null,
      editor.torsoItemId ? weaponById[editor.torsoItemId] ?? null : null,
      editor.legsItemId ? weaponById[editor.legsItemId] ?? null : null,
      editor.feetItemId ? weaponById[editor.feetItemId] ?? null : null,
    ];
  }, [editor, weaponById]);

  const itemModifierValues = useMemo(() => getHighestItemModifiers(equippedItems), [equippedItems]);
  const itemProtectionValues = useMemo(
    () => getProtectionTotalsFromItems(equippedItems),
    [equippedItems],
  );
  const dodgeValue = useMemo(
    () =>
      Math.max(
        0,
        editor
          ? getDodgeValue(
              editor.defenceDie,
              editor.intellectDie,
              editor.level,
              itemProtectionValues.physicalProtection,
            )
          : 0,
      ),
    [
      editor?.defenceDie,
      editor?.intellectDie,
      editor?.level,
      itemProtectionValues.physicalProtection,
    ],
  );
  const willpowerValue = useMemo(
    () =>
      editor
        ? getWillpowerDiceCountFromAttributes(editor.supportDie, editor.braveryDie)
        : 0,
    [editor?.supportDie, editor?.braveryDie],
  );
  const dodgeDice = useMemo(
    () => Math.max(0, Math.ceil(dodgeValue / 6)),
    [dodgeValue],
  );
  const armorSkillForDefenceCalc = Math.max(1, computedArmorSkillValue);
  const physicalBlockPerSuccess = useMemo(
    () =>
      Math.ceil(
        itemProtectionValues.physicalProtection / armorSkillForDefenceCalc +
          armorSkillForDefenceCalc,
      ),
    [itemProtectionValues.physicalProtection, armorSkillForDefenceCalc],
  );
  const willpowerDice = Math.max(0, willpowerValue);
  const willpowerForDefenceCalc = Math.max(1, willpowerValue);
  const mentalBlockPerSuccess = useMemo(
    () =>
      Math.ceil(
        itemProtectionValues.mentalProtection / willpowerForDefenceCalc +
          willpowerForDefenceCalc,
      ),
    [itemProtectionValues.mentalProtection, willpowerForDefenceCalc],
  );
  const defenceStrings = useMemo(
    () => [
      `Physical Protection: Roll ${computedArmorSkillValue} dice, block ${physicalBlockPerSuccess} wounds per success.`,
      `Dodge: Roll ${dodgeDice} dice. If successes exceed the attacker's successes, take 0 damage. Otherwise take full damage.`,
      `Mental Protection: Roll ${willpowerDice} dice, block ${mentalBlockPerSuccess} wounds per success.`,
    ],
    [
      computedArmorSkillValue,
      dodgeDice,
      mentalBlockPerSuccess,
      physicalBlockPerSuccess,
      willpowerDice,
    ],
  );

  const equippedWeaponAttackPreview = useMemo(() => {
    if (!editor) return [] as Array<{ label: string; lines: string[] }>;
    const slotItems: Array<{ label: string; id: string | null }> = [
      { label: "Main Hand", id: editor.mainHandItemId },
      { label: "Off Hand", id: editor.offHandItemId },
      { label: "Small Slot", id: editor.smallItemId },
    ];

    const rows: Array<{ label: string; lines: string[] }> = [];

    for (const slot of slotItems) {
      if (!slot.id) continue;
      const item = weaponById[slot.id];
      const lines = getWeaponSourceAttackLines(item, computedWeaponSkillValue);
      if (lines.length === 0) continue;
      rows.push({ label: `${slot.label}: ${item?.name ?? "(Referenced item missing)"}`, lines });
    }

    return rows;
  }, [
    editor?.mainHandItemId,
    editor?.offHandItemId,
    editor?.smallItemId,
    computedWeaponSkillValue,
    weaponById,
  ]);
  const naturalAttackPreviewLines = useMemo(() => {
    if (!editor) return [] as string[][];
    return editor.attacks.map((attack) =>
      renderAttackActionLines(
        (attack.attackConfig ?? defaultNaturalConfig()) as MonsterNaturalAttackConfig,
        computedWeaponSkillValue,
        { applyWeaponSkillOverride: true },
      ),
    );
  }, [editor?.attacks, computedWeaponSkillValue]);

  const weaponAttackStringCount = equippedWeaponAttackPreview.reduce(
    (total, row) => total + row.lines.length,
    0,
  );
  const equippedWeaponSourceCount = equippedWeaponAttackPreview.length;
  const naturalWeaponSourceCount = editor?.attacks.length ?? 0;
  const totalWeaponSources = equippedWeaponSourceCount + naturalWeaponSourceCount;
  const naturalAttacksLocked = totalWeaponSources >= 3;
  const naturalSourceCapHint =
    "Natural weapons are disabled because this monster already has 3 weapon sources (equipped + natural). Unequip a weapon or remove a natural weapon to add another.";
  const equipBlockedHint =
    "Cannot equip this weapon: this monster already has 3 weapon sources (equipped + natural). Remove a natural weapon or unequip a weapon to equip another.";
  const mainHandItem = editor?.mainHandItemId ? weaponById[editor.mainHandItemId] ?? null : null;
  const offHandDisabled = isTwoHanded(mainHandItem);
  const countEquippedWeaponSourcesForState = useCallback(
    (
      state: Pick<
        EditableMonster,
        "mainHandItemId" | "offHandItemId" | "smallItemId" | "attackDie" | "braveryDie"
      >,
    ) => {
      const slotIds = [state.mainHandItemId, state.offHandItemId, state.smallItemId];
      const weaponSkillValue = getWeaponSkillDiceCountFromAttributes(
        state.attackDie,
        state.braveryDie,
      );
      let count = 0;
      for (const itemId of slotIds) {
        if (!itemId) continue;
        const lines = getWeaponSourceAttackLines(weaponById[itemId] ?? null, weaponSkillValue);
        if (lines.length > 0) count += 1;
      }
      return count;
    },
    [weaponById],
  );
  useEffect(() => {
    if (totalWeaponSources < 3) {
      setEquipmentCapHint(null);
    }
  }, [totalWeaponSources]);
  const previewMonster = useMemo(
    () =>
      editor
        ? {
            ...editor,
            physicalResilienceMax: resilienceValues.physicalResilienceMax,
            physicalResilienceCurrent: resilienceValues.physicalResilienceMax,
            mentalPerseveranceMax: resilienceValues.mentalPerseveranceMax,
            mentalPerseveranceCurrent: resilienceValues.mentalPerseveranceMax,
            physicalProtection: itemProtectionValues.physicalProtection,
            mentalProtection: itemProtectionValues.mentalProtection,
            attackModifier: itemModifierValues.attackModifier,
            defenceModifier: itemModifierValues.defenceModifier,
            fortitudeModifier: itemModifierValues.fortitudeModifier,
            intellectModifier: itemModifierValues.intellectModifier,
            supportModifier: itemModifierValues.supportModifier,
            braveryModifier: itemModifierValues.braveryModifier,
            weaponSkillModifier: 0,
            armorSkillModifier: 0,
            weaponSkillValue: computedWeaponSkillValue,
            armorSkillValue: computedArmorSkillValue,
            attacks: editor.attacks,
          }
        : null,
    [
      computedArmorSkillValue,
      computedWeaponSkillValue,
      editor,
      itemModifierValues,
      itemProtectionValues,
      resilienceValues,
    ],
  );

  const saveMonster = useCallback(async () => {
    if (!editor || readOnly) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const normalizedTags = [...editor.tags];
      for (const part of listFromCsv(tagInput)) {
        const canonical = canonicalizeTag(part, tagSuggestions, normalizedTags);
        if (!canonical) continue;
        normalizedTags.push(canonical);
      }
      const normalizedEditor: EditableMonster = {
        ...editor,
        imageUrl: asNullableText(editor.imageUrl),
        tags: normalizedTags,
        physicalResilienceMax: resilienceValues.physicalResilienceMax,
        physicalResilienceCurrent: resilienceValues.physicalResilienceMax,
        mentalPerseveranceMax: resilienceValues.mentalPerseveranceMax,
        mentalPerseveranceCurrent: resilienceValues.mentalPerseveranceMax,
        physicalProtection: itemProtectionValues.physicalProtection,
        mentalProtection: itemProtectionValues.mentalProtection,
        attackModifier: itemModifierValues.attackModifier,
        defenceModifier: itemModifierValues.defenceModifier,
        fortitudeModifier: itemModifierValues.fortitudeModifier,
        intellectModifier: itemModifierValues.intellectModifier,
        supportModifier: itemModifierValues.supportModifier,
        braveryModifier: itemModifierValues.braveryModifier,
        weaponSkillModifier: 0,
        armorSkillModifier: 0,
        weaponSkillValue: computedWeaponSkillValue,
        armorSkillValue: computedArmorSkillValue,
        mainHandItemId: asNullableId(editor.mainHandItemId),
        offHandItemId: asNullableId(editor.offHandItemId),
        smallItemId: asNullableId(editor.smallItemId),
        headItemId: asNullableId(editor.headItemId),
        shoulderItemId: asNullableId(editor.shoulderItemId),
        torsoItemId: asNullableId(editor.torsoItemId),
        legsItemId: asNullableId(editor.legsItemId),
        feetItemId: asNullableId(editor.feetItemId),
        attacks: editor.attacks.map((attack, index) => ({ ...attack, sortOrder: index })),
      };
      const isUpdate = !!editor.id;
      const res = await fetch(
        isUpdate
          ? `/api/summoning-circle/monsters/${editor.id}?campaignId=${encodeURIComponent(campaignId)}`
          : `/api/summoning-circle/monsters?campaignId=${encodeURIComponent(campaignId)}`,
        {
          method: isUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(normalizedEditor)),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      hasDraftRef.current = false;
      setTagInput("");
      setTagSuggestions([]);
      setActiveTagIndex(-1);
      await refreshSummaries();
      setSelectedId(String(json.id));
      await refreshSelected(String(json.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }, [
    campaignId,
    editor,
    readOnly,
    refreshSelected,
    refreshSummaries,
    resilienceValues,
    itemProtectionValues,
    itemModifierValues,
    computedWeaponSkillValue,
    computedArmorSkillValue,
    tagInput,
    tagSuggestions,
  ]);

  const deleteMonster = useCallback(async () => {
    if (!editor?.id || readOnly) return;
    if (!window.confirm("Delete this monster?")) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/summoning-circle/monsters/${editor.id}?campaignId=${encodeURIComponent(campaignId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(await res.text());
      hasDraftRef.current = false;
      setEditor(null);
      setSelectedId(null);
      await refreshSummaries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }, [campaignId, editor?.id, readOnly, refreshSummaries]);

  const copyMonster = useCallback(async () => {
    if (!editor?.id) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/summoning-circle/monsters/${editor.id}/copy?campaignId=${encodeURIComponent(campaignId)}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      hasDraftRef.current = false;
      await refreshSummaries();
      setSelectedId(String(json.id));
      setSuccess("Monster copied.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to copy");
    } finally {
      setBusy(false);
    }
  }, [campaignId, editor?.id, refreshSummaries]);

  const newMonster = useCallback(() => {
    hasDraftRef.current = true;
    setSuccess(null);
    setMonsterPickerOpen(false);
    setMonsterPickerQuery("");
    setSelectedId(null);
    setEditor(defaultMonster());
  }, []);

  const moveAttack = useCallback((fromIndex: number, toIndex: number) => {
    setEditor((prev) => {
      if (!prev) return prev;
      if (toIndex < 0 || toIndex >= prev.attacks.length) return prev;

      const next = [...prev.attacks];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);

      return {
        ...prev,
        attacks: next.map((attack, index) => ({ ...attack, sortOrder: index })),
      };
    });
  }, []);

  const updateAttackRange = useCallback(
    (attackIndex: number, range: "melee" | "ranged" | "aoe", patch: Record<string, unknown>) => {
      setEditor((prev) => {
        if (!prev) return prev;
        const currentAttack = prev.attacks[attackIndex];
        if (!currentAttack) return prev;
        const currentConfig = currentAttack.attackConfig ?? defaultNaturalConfig();
        const currentRange = (currentConfig as Record<string, unknown>)[range] ?? {};
        return {
          ...prev,
          attacks: prev.attacks.map((attack, index) =>
            index === attackIndex
              ? {
                  ...attack,
                  attackConfig: {
                    ...currentConfig,
                    [range]: { ...currentRange, ...patch },
                  },
                }
              : attack,
          ),
        };
      });
    },
    [],
  );

  if (loading) return <p className="text-sm text-zinc-400">Loading Summoning Circle...</p>;

  if (!editor) {
    return (
      <div className="space-y-4">
        <button
          onClick={newMonster}
          className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
        >
          Create Monster
        </button>
        <div className="rounded border border-zinc-800 p-4 text-sm text-zinc-400">
          Select a monster from the list, or create a new one.
        </div>
      </div>
    );
  }

  const editorMobileVisibility = mobileView === "editor" ? "block" : "hidden";
  const previewMobileVisibility = mobileView === "preview" ? "block" : "hidden";
  const renderSlotImagePreview = (
    slotLabel: string,
    selectedItemId: string | null | undefined,
  ) => {
    const selectedItem = selectedItemId ? weaponById[selectedItemId] ?? null : null;
    const selectedImageUrl =
      selectedItem && isHttpUrl(selectedItem.imageUrl) ? selectedItem.imageUrl.trim() : null;
    if (!selectedImageUrl) return null;

    return (
      <div className="h-[200px] w-full rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden flex items-center justify-center p-2">
        <img
          src={selectedImageUrl}
          alt={`${slotLabel} item preview`}
          className="max-h-full max-w-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  };
  const renderHandSlot = (slot: (typeof HAND_SLOTS)[number]) => {
    const selectedValue = editor[slot.key] ?? "";
    const options = weapons.filter((item) => {
      if (slot.key === "offHandItemId" && offHandDisabled) return false;
      return isValidHandItemForSlot(slot.key, item);
    });
    const offHandLocked = slot.key === "offHandItemId" && offHandDisabled;
    const disabled = readOnly || offHandLocked;

    return (
      <label
        key={slot.key}
        className={`space-y-1 ${offHandLocked ? "opacity-60" : ""}`}
      >
        <span className="text-[11px] text-zinc-500">{slot.label}</span>
        {renderSlotImagePreview(slot.label, selectedValue)}
        <div className="flex gap-2">
          <select
            disabled={disabled}
            aria-disabled={disabled}
            value={selectedValue}
            onChange={(e) => {
              const itemId = asNullableId(e.target.value);
              let blockedBySourceCap = false;
              setEditor((prev) => {
                if (!prev) return prev;
                const next: EditableMonster = { ...prev, [slot.key]: itemId };
                if (slot.key === "mainHandItemId") {
                  const selectedItem = itemId ? weaponById[itemId] ?? null : null;
                  if (isTwoHanded(selectedItem)) {
                    next.offHandItemId = null;
                  }
                }
                const nextEquippedSourceCount = countEquippedWeaponSourcesForState(next);
                const nextTotalWeaponSources = nextEquippedSourceCount + next.attacks.length;
                if (nextTotalWeaponSources > 3) {
                  blockedBySourceCap = true;
                  return prev;
                }
                return next;
              });
              setEquipmentCapHint(blockedBySourceCap ? equipBlockedHint : null);
            }}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">None</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled || !selectedValue}
            onClick={() => {
              setEquipmentCapHint(null);
              setEditor((prev) => (prev ? { ...prev, [slot.key]: null } : prev));
            }}
            className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </label>
    );
  };
  const renderBodySlot = (slot: (typeof BODY_SLOTS)[number]) => {
    const selectedValue = editor[slot.key] ?? "";
    const options = weapons.filter((item) => isValidBodyItemForSlot(slot.key, item));

    return (
      <label key={slot.key} className="space-y-1">
        <span className="text-[11px] text-zinc-500">{slot.label}</span>
        {renderSlotImagePreview(slot.label, selectedValue)}
        <div className="flex gap-2">
          <select
            disabled={readOnly}
            value={selectedValue}
            onChange={(e) =>
              setEditor((prev) =>
                prev ? { ...prev, [slot.key]: asNullableId(e.target.value) } : prev,
              )
            }
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
          >
            <option value="">None</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={readOnly || !selectedValue}
            onClick={() =>
              setEditor((prev) => (prev ? { ...prev, [slot.key]: null } : prev))
            }
            className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </label>
    );
  };

  const toggleMonsterLevel = (level: number) => {
    setMonsterLevelSelected((prev) =>
      prev.includes(level)
        ? prev.filter((entry) => entry !== level)
        : [...prev, level].sort((a, b) => a - b),
    );
  };

  const toggleMonsterTier = (tier: MonsterTier) => {
    setMonsterTierSelected((prev) =>
      prev.includes(tier)
        ? prev.filter((entry) => entry !== tier)
        : [...prev, tier],
    );
  };

  const setMonsterLevelRange = (min: number, max: number) => {
    setMonsterLevelSelected(
      PICKER_LEVEL_OPTIONS.filter((level) => level >= min && level <= max),
    );
  };

  const clearMonsterFilters = () => {
    setMonsterLevelSelected([]);
    setMonsterTierSelected([]);
    setMonsterExcludeLegendary(false);
  };

  const removeMonsterFilterPill = (pillId: "level" | "tier" | "noLegendary") => {
    if (pillId === "level") {
      setMonsterLevelSelected([]);
      return;
    }
    if (pillId === "tier") {
      setMonsterTierSelected([]);
      return;
    }
    setMonsterExcludeLegendary(false);
  };

  return (
    <div className="space-y-5">
      <section className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="flex flex-col sm:flex-row sm:items-start gap-2">
          <div className="flex flex-1 items-start gap-2">
            <div ref={monsterPickerRef} className="flex-1 space-y-2 relative">
              <div className="relative">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                >
                  <path
                    d="M10.5 3a7.5 7.5 0 1 0 4.73 13.32l4.22 4.21 1.06-1.06-4.21-4.22A7.5 7.5 0 0 0 10.5 3Zm0 1.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"
                    fill="currentColor"
                  />
                </svg>
                <input
                  value={monsterPickerQuery}
                  onFocus={() => setMonsterPickerOpen(true)}
                  onClick={() => setMonsterPickerOpen(true)}
                  onChange={(e) => {
                    setMonsterPickerQuery(e.target.value);
                    setMonsterPickerOpen(true);
                  }}
                  placeholder="Click to search monsters"
                  className="w-full rounded border border-zinc-800 bg-zinc-900/30 pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {activeMonsterFilterPills.map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => removeMonsterFilterPill(pill.id)}
                      className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                    >
                      <span>{pill.label}</span>
                      <span aria-hidden="true">x</span>
                    </button>
                  ))}
                </div>
                <p className="pt-1 text-right text-[11px] text-zinc-500">
                  {hasMonsterSearchQuery || hasMonsterFilters
                    ? `Showing ${monsterPickerFilteredCount} of ${monsterPickerTotalCount}`
                    : `Showing ${monsterPickerTotalCount}`}
                </p>
              </div>

              {monsterPickerOpen && (
                <div className="absolute z-30 mt-1 w-full rounded border border-zinc-800 bg-zinc-950/95 p-2 space-y-2 shadow-lg">
                  <div className="max-h-80 overflow-auto space-y-1">
                    {recentMonsterRows.length === 0 &&
                    filteredSummariesWithoutRecent.length === 0 ? (
                      <p className="px-2 py-2 text-sm text-zinc-500">No matches.</p>
                    ) : (
                      <>
                        {!hasMonsterSearchQuery && recentMonsterRows.length > 0 && (
                          <>
                            <p className="px-2 pt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                              Recently used
                            </p>
                            {recentMonsterRows.map((row) => {
                              const tags = getMonsterTags(row);
                              return (
                                <button
                                  key={`recent-${row.id}`}
                                  type="button"
                                  onClick={() => {
                                    hasDraftRef.current = false;
                                    setSuccess(null);
                                    setSelectedId(row.id);
                                    markMonsterAsRecent(row.id);
                                    setMonsterPickerOpen(false);
                                    setMonsterPickerQuery("");
                                  }}
                                  className={`w-full text-left rounded border px-2 py-2 ${
                                    selectedId === row.id
                                      ? "border-emerald-500 bg-emerald-950/20"
                                      : "border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-medium">{row.name}</p>
                                      <p className="text-xs text-zinc-500">
                                        L{row.level} {row.tier} {row.source === "CORE" ? "- Core" : ""}
                                      </p>
                                    </div>
                                  </div>
                                  {tags.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {tags.slice(0, 6).map((tag) => (
                                        <span
                                          key={`recent-${row.id}-${tag}`}
                                          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-[2px] text-[10px] text-zinc-300"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                            <div className="my-1 border-t border-zinc-800" />
                          </>
                        )}
                        {filteredSummariesWithoutRecent.map((row) => {
                          const tags = getMonsterTags(row);
                          return (
                            <button
                              key={row.id}
                              type="button"
                              onClick={() => {
                                hasDraftRef.current = false;
                                setSuccess(null);
                                setSelectedId(row.id);
                                markMonsterAsRecent(row.id);
                                setMonsterPickerOpen(false);
                                setMonsterPickerQuery("");
                              }}
                              className={`w-full text-left rounded border px-2 py-2 ${
                                selectedId === row.id
                                  ? "border-emerald-500 bg-emerald-950/20"
                                  : "border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium">{row.name}</p>
                                  <p className="text-xs text-zinc-500">
                                    L{row.level} {row.tier} {row.source === "CORE" ? "- Core" : ""}
                                  </p>
                                </div>
                              </div>
                              {tags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {tags.slice(0, 6).map((tag) => (
                                    <span
                                      key={`${row.id}-${tag}`}
                                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-[2px] text-[10px] text-zinc-300"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div ref={monsterFiltersRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMonsterFiltersOpen((prev) => !prev)}
                className={`rounded border px-3 py-2 text-sm ${
                  monsterFiltersOpen
                    ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                    : "border-zinc-700 hover:bg-zinc-800"
                }`}
              >
                Filters
              </button>

              {monsterFiltersOpen && (
                <div className="absolute right-0 z-40 mt-1 w-80 max-w-[90vw] rounded border border-zinc-800 bg-zinc-950/95 p-3 shadow-lg space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Monster Level</p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setMonsterLevelSelected([])}
                        className={`rounded border px-2 py-1 text-xs ${
                          monsterLevelSelected.length === 0
                            ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                            : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                        }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonsterLevelRange(1, 5)}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        1-5
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonsterLevelRange(6, 10)}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        6-10
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonsterLevelRange(11, 15)}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        11-15
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonsterLevelRange(16, 20)}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        16-20
                      </button>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {PICKER_LEVEL_OPTIONS.map((level) => {
                        const active = monsterLevelSelected.includes(level);
                        return (
                          <button
                            key={level}
                            type="button"
                            onClick={() => toggleMonsterLevel(level)}
                            className={`rounded border px-2 py-1 text-xs ${
                              active
                                ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                                : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                            }`}
                          >
                            {level}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Tier</p>
                    <div className="flex flex-wrap gap-1">
                      {MONSTER_TIER_OPTIONS.map((tier) => {
                        const active = monsterTierSelected.includes(tier);
                        return (
                          <button
                            key={tier}
                            type="button"
                            onClick={() => toggleMonsterTier(tier)}
                            className={`rounded border px-2 py-1 text-xs ${
                              active
                                ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                                : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                            }`}
                          >
                            {MONSTER_TIER_LABELS[tier]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={monsterExcludeLegendary}
                      onChange={(e) => setMonsterExcludeLegendary(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Exclude Legendary
                  </label>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={clearMonsterFilters}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={newMonster}
            className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
          >
            Summon new monster
          </button>
        </div>
      </section>

        {error && (
          <div className="rounded border border-red-700/40 bg-red-950/20 p-2 text-sm text-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded border border-emerald-700/40 bg-emerald-950/20 p-2 text-sm text-emerald-200">
            {success}
          </div>
        )}

        <div className="lg:hidden rounded border border-zinc-800 overflow-hidden bg-zinc-900/40">
          <div className="grid grid-cols-2">
            <button
              type="button"
              aria-pressed={mobileView === "editor"}
              onClick={() => setMobileView("editor")}
              className={`text-xs font-semibold px-3 py-2 ${
                mobileView === "editor"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Editor
            </button>
            <button
              type="button"
              aria-pressed={mobileView === "preview"}
              onClick={() => setMobileView("preview")}
              className={`text-xs font-semibold px-3 py-2 ${
                mobileView === "preview"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Preview
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className={`${editorMobileVisibility} lg:block space-y-5`}>
        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Monster Editor</h2>
            {readOnly && (
              <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                Core monster (read-only)
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {editor.id && (
                <button
                  onClick={copyMonster}
                  disabled={busy}
                  className="rounded border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800 disabled:opacity-60"
                >
                  Copy
                </button>
              )}
              {!readOnly && (
                <>
                  <button
                    onClick={deleteMonster}
                    disabled={busy || !editor.id}
                    className="rounded border border-red-700 px-3 py-1 text-sm text-red-200 hover:bg-red-950/20 disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button
                    onClick={saveMonster}
                    disabled={busy}
                    className="rounded bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {busy ? "Saving..." : "Save"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              disabled={readOnly}
              value={editor.name}
              onChange={(e) => setEditor((p) => (p ? { ...p, name: e.target.value } : p))}
              placeholder="Name"
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            />
            <input
              disabled={readOnly}
              type="number"
              min={1}
              value={editor.level}
              onChange={(e) =>
                setEditor((p) => (p ? { ...p, level: Number(e.target.value || 1) } : p))
              }
              placeholder="Level"
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            />
            <select
              disabled={readOnly}
              value={editor.tier}
              onChange={(e) =>
                setEditor((p) => (p ? { ...p, tier: e.target.value as EditableMonster["tier"] } : p))
              }
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            >
              <option value="MINION">Minion</option>
              <option value="SOLDIER">Soldier</option>
              <option value="ELITE">Elite</option>
              <option value="BOSS">Boss</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                disabled={readOnly}
                type="checkbox"
                checked={editor.legendary}
                onChange={(e) =>
                  setEditor((p) => (p ? { ...p, legendary: e.target.checked } : p))
                }
              />
              Legendary
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {editor.tags.map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                >
                  {tag}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditor((p) =>
                          p
                            ? { ...p, tags: p.tags.filter((_tag, idx) => idx !== index) }
                            : p,
                        )
                      }
                      className="text-zinc-400 hover:text-zinc-200"
                      aria-label={`Remove tag ${tag}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
            {!readOnly && (
              <div className="relative">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onFocus={() => setTagsFocused(true)}
                  onBlur={() => {
                    setTagsFocused(false);
                    commitTagInput();
                  }}
                  onKeyDown={(e) => {
                    if (isTagDropdownOpen && filteredTagSuggestions.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActiveTagIndex((prev) =>
                          Math.min(
                            filteredTagSuggestions.length - 1,
                            prev < 0 ? 0 : prev + 1,
                          ),
                        );
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActiveTagIndex((prev) => Math.max(0, prev <= 0 ? 0 : prev - 1));
                        return;
                      }
                      if (e.key === "Enter") {
                        if (activeTagIndex >= 0) {
                          e.preventDefault();
                          const pick = filteredTagSuggestions[activeTagIndex];
                          if (pick) {
                            commitTagInput(pick.value);
                          }
                          return;
                        }
                        e.preventDefault();
                        commitTagInput();
                        return;
                      }
                      if (e.key === "Tab") {
                        const pickIndex = activeTagIndex >= 0 ? activeTagIndex : 0;
                        const pick = filteredTagSuggestions[pickIndex];
                        if (pick) {
                          e.preventDefault();
                          commitTagInput(pick.value);
                        }
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setTagSuggestions([]);
                        setActiveTagIndex(-1);
                        return;
                      }
                    }

                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      commitTagInput();
                      return;
                    }
                    if (e.key === "Backspace" && tagInput.trim().length === 0) {
                      setEditor((p) =>
                        p && p.tags.length > 0 ? { ...p, tags: p.tags.slice(0, -1) } : p,
                      );
                    }
                  }}
                  placeholder="Add tag (Enter or comma)"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
                {isTagDropdownOpen && (
                  <div className="absolute z-20 mt-1 w-full rounded border border-zinc-700 bg-zinc-950 shadow-lg">
                    {tagsLoading ? (
                      <p className="px-2 py-1 text-xs text-zinc-400">Loading...</p>
                    ) : filteredTagSuggestions.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-zinc-500">No suggestions</p>
                    ) : (
                      <ul className="max-h-56 overflow-auto py-1">
                        {filteredTagSuggestions.map((suggestion, idx) => (
                          <li key={`${suggestion.source}-${suggestion.value}`}>
                            <button
                              type="button"
                              onMouseEnter={() => setActiveTagIndex(idx)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                commitTagInput(suggestion.value);
                              }}
                              className={`flex w-full items-center justify-between px-2 py-1 text-left text-sm hover:bg-zinc-800 ${
                                idx === activeTagIndex ? "bg-zinc-800" : ""
                              }`}
                            >
                              <span>{suggestion.value}</span>
                              <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                                {suggestion.source}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium">Monster Image URL</label>
            <input
              disabled={readOnly}
              value={editor.imageUrl ?? ""}
              onChange={(e) =>
                setEditor((p) =>
                  p
                    ? {
                        ...p,
                        imageUrl: asNullableText(e.target.value),
                      }
                    : p,
                )
              }
              placeholder="Paste an image URL..."
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            />
            <p className="text-[11px] text-zinc-500">
              Must be a direct URL. Hotlinks can break if the host blocks them.
            </p>
          </div>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Survivability & Defence</h3>
          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[11px] text-zinc-500">Physical Resilience</span>
              <input
                readOnly
                type="number"
                value={resilienceValues.physicalResilienceMax}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-zinc-500">Mental Perseverance</span>
              <input
                readOnly
                type="number"
                value={resilienceValues.mentalPerseveranceMax}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
              />
            </label>
          </div>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3 overflow-x-hidden">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Attributes</h3>
          <div className="space-y-2 min-w-0">
            <div className="mb-2 grid grid-cols-4 gap-2 items-center min-w-0 text-xs text-zinc-400 uppercase tracking-wide">
              <div aria-hidden="true" />
              <div className="text-center">Attributes</div>
              <div className="text-center">Resist</div>
              <div className="text-center">Modifiers</div>
            </div>
            {ATTR_ROWS.map(([label, dieKey, resistKey, modKey]) => (
              <div
                key={label}
                className="grid grid-cols-4 gap-2 items-center min-w-0"
              >
                <p className="self-center min-w-0 truncate text-center">
                  <HoverTooltipLabel label={label} tooltip={ATTRIBUTE_TOOLTIPS[label]} />
                </p>
                <select
                  disabled={readOnly}
                  value={String(editor[dieKey])}
                  onChange={(e) =>
                    setEditor((p) => (p ? { ...p, [dieKey]: e.target.value as DiceSize } : p))
                  }
                  className="min-w-0 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-center"
                >
                  {DICE.map((die) => (
                    <option key={die} value={die}>
                      {dieLabel(die)}
                    </option>
                  ))}
                </select>
                <input
                  disabled={readOnly}
                  type="number"
                  min={0}
                  value={Number(editor[resistKey])}
                  onChange={(e) =>
                    setEditor((p) =>
                      p ? { ...p, [resistKey]: Math.max(0, Number(e.target.value || 0)) } : p,
                    )
                  }
                  className="min-w-0 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-center"
                />
                <input
                  readOnly
                  type="number"
                  value={itemModifierValues[modKey]}
                  className="min-w-0 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-center opacity-80"
                />
              </div>
            ))}
          </div>

        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Traits</h3>
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 items-center">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Trait Points</p>
            <input
              readOnly
              type="number"
              value={TRAIT_POINTS_PLACEHOLDER}
              className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-center opacity-80"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Selected Traits</p>
            {editor.traits.length === 0 ? (
              <p className="text-sm text-zinc-500">None</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {editor.traits.map((trait, index) => {
                  const resolved = traitById[trait.traitDefinitionId];
                  const label = trait.name ?? resolved?.name ?? trait.traitDefinitionId;
                  const effect = trait.effectText ?? resolved?.effectText ?? "No description";
                  return (
                    <span
                      key={`${trait.traitDefinitionId}-${index}`}
                      title={effect}
                      className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                    >
                      {label}
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    traits: p.traits
                                      .filter((_, idx) => idx !== index)
                                      .map((entry, idx) => ({ ...entry, sortOrder: idx })),
                                  }
                                : p,
                            )
                          }
                          className="text-zinc-400 hover:text-zinc-200"
                          aria-label={`Remove trait ${label}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Available CORE Traits</p>
            <div className="flex flex-wrap gap-2">
              {traitDefinitions
                .filter(
                  (trait) =>
                    !editor.traits.some((selected) => selected.traitDefinitionId === trait.id),
                )
                .map((trait) => (
                  <button
                    key={trait.id}
                    type="button"
                    title={trait.effectText ?? "No description"}
                    disabled={readOnly}
                    onClick={() =>
                      setEditor((p) =>
                        p
                          ? {
                              ...p,
                              traits: p.traits.some(
                                (selected) => selected.traitDefinitionId === trait.id,
                              )
                                ? p.traits
                                : [
                                    ...p.traits,
                                    {
                                      sortOrder: p.traits.length,
                                      traitDefinitionId: trait.id,
                                      name: trait.name,
                                      effectText: trait.effectText,
                                    },
                                  ],
                            }
                          : p,
                      )
                    }
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-60"
                  >
                    {trait.name}
                  </button>
                ))}
              {traitDefinitions.length === 0 && (
                <p className="text-sm text-zinc-500">No CORE traits available.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Equipped Gear</h3>

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500">Hands</p>
            <div className="space-y-3">
              {offHandDisabled ? (
                <>
                  {renderHandSlot(HAND_SLOTS[0])}
                  {renderHandSlot(HAND_SLOTS[2])}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {renderHandSlot(HAND_SLOTS[0])}
                    {renderHandSlot(HAND_SLOTS[1])}
                  </div>
                  {renderHandSlot(HAND_SLOTS[2])}
                </>
              )}
            </div>
            {offHandDisabled && (
              <p className="text-xs text-zinc-500">
                Off Hand is disabled while Main Hand has a two-handed item.
              </p>
            )}
            {equipmentCapHint && <p className="text-xs text-zinc-500">{equipmentCapHint}</p>}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500">Body</p>
            <div className="space-y-3">
              {BODY_SLOT_ROWS.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className={row.length === 1 ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}
                >
                  {row.map((slot) => renderBodySlot(slot))}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500">Derived from Gear & Attributes</p>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] text-zinc-500">Physical Protection and Weight</span>
                <input
                  readOnly
                  type="number"
                  value={itemProtectionValues.physicalProtection}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-zinc-500">
                  <HoverTooltipLabel
                    label="Armor Skill"
                    tooltip={DERIVED_STAT_TOOLTIPS.armorSkill}
                    className="text-[11px]"
                  />
                </span>
                <input
                  readOnly
                  type="number"
                  value={computedArmorSkillValue}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-zinc-500">
                  <HoverTooltipLabel
                    label="Dodge"
                    tooltip={DERIVED_STAT_TOOLTIPS.dodge}
                    className="text-[11px]"
                  />
                </span>
                <input
                  readOnly
                  type="number"
                  value={dodgeValue}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-zinc-500">Mental Protection</span>
                <input
                  readOnly
                  type="number"
                  value={itemProtectionValues.mentalProtection}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-zinc-500">
                  <HoverTooltipLabel
                    label="Willpower"
                    tooltip={DERIVED_STAT_TOOLTIPS.willpower}
                    className="text-[11px]"
                  />
                </span>
                <input
                  readOnly
                  type="number"
                  value={willpowerValue}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
                />
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500">Defence Strings</p>
            <div className="rounded border border-zinc-800 bg-zinc-900 p-2 space-y-1">
              {defenceStrings.map((line, index) => (
                <p key={index} className="text-xs text-zinc-300 whitespace-pre-wrap">
                  {line}
                </p>
              ))}
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            Weapon sources: {totalWeaponSources}/3 (equipped {equippedWeaponSourceCount}, natural{" "}
            {naturalWeaponSourceCount}) - Attack strings: {weaponAttackStringCount}
          </p>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wide text-zinc-400">Attacks</h3>
            {!readOnly && (
              <button
                onClick={() =>
                  setEditor((p) =>
                    p && p.attacks.length < 3
                      ? {
                          ...p,
                          attacks: [...p.attacks, defaultNaturalAttackEntry(p.attacks.length)],
                        }
                      : p,
                  )
                }
                disabled={editor.attacks.length >= 3 || naturalAttacksLocked}
                className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
              >
                Add attack
              </button>
            )}
          </div>

          <label className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500">
              <HoverTooltipLabel
                label="Weapon Skill"
                tooltip={DERIVED_STAT_TOOLTIPS.weaponSkill}
                className="text-[11px]"
              />
            </span>
            <input
              readOnly
              type="number"
              value={computedWeaponSkillValue}
              className="w-12 text-center rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
            />
          </label>

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500">From Equipped Gear</p>
            {equippedWeaponAttackPreview.length === 0 ? (
              <p className="text-sm text-zinc-500">No weapon attack strings from equipped items.</p>
            ) : (
              <div className="space-y-2">
                {equippedWeaponAttackPreview.map((row, rowIndex) => (
                  <div key={`${row.label}-${rowIndex}`} className="rounded border border-zinc-800 p-2 space-y-1">
                    <p className="text-sm text-zinc-300">{row.label}</p>
                    {row.lines.map((line, lineIndex) => (
                      <p key={lineIndex} className="text-xs text-zinc-500">
                        {line}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {naturalAttacksLocked && (
            <p className="text-xs text-zinc-500">
              {naturalSourceCapHint}
            </p>
          )}

          {editor.attacks.length === 0 && (
            <p className="text-sm text-zinc-500">No attacks configured.</p>
          )}

          <div className="space-y-3">
            {editor.attacks.map((attack, attackIndex) => (
              <div key={`${attackIndex}-${attack.attackMode}`} className="space-y-2 rounded border border-zinc-800 p-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Attack #{attackIndex + 1}</p>
                  {!readOnly && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveAttack(attackIndex, attackIndex - 1)}
                        disabled={attackIndex === 0}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
                        aria-label={`Move attack ${attackIndex + 1} up`}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveAttack(attackIndex, attackIndex + 1)}
                        disabled={attackIndex === editor.attacks.length - 1}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
                        aria-label={`Move attack ${attackIndex + 1} down`}
                      >
                        ↓
                      </button>
                      <button
                        onClick={() =>
                          setEditor((p) =>
                            p
                              ? {
                                  ...p,
                                  attacks: p.attacks
                                    .filter((_row, idx) => idx !== attackIndex)
                                    .map((row, idx) => ({ ...row, sortOrder: idx })),
                                }
                              : p,
                          )
                        }
                        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                <>
                    <input
                      disabled={readOnly}
                      value={attack.attackName ?? "Natural Weapon"}
                      onChange={(e) =>
                        setEditor((p) =>
                          p
                            ? {
                                ...p,
                                attacks: p.attacks.map((row, idx) =>
                                  idx === attackIndex
                                    ? { ...row, attackName: e.target.value }
                                    : row,
                                ),
                              }
                            : p,
                        )
                      }
                      placeholder="Natural attack name"
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    />

                    {(["melee", "ranged", "aoe"] as const).map((range) => {
                      const cfg = (attack.attackConfig?.[range] ?? {}) as {
                        enabled?: boolean;
                        targets?: number;
                        distance?: number;
                        count?: number;
                        centerRange?: number;
                        shape?: "SPHERE" | "CONE" | "LINE";
                        physicalStrength?: number;
                        mentalStrength?: number;
                        damageTypes?: Array<{ name: string; mode: "PHYSICAL" | "MENTAL" }>;
                        attackEffects?: string[];
                      };

                      return (
                        <div key={range} className="rounded border border-zinc-800 p-2 space-y-2">
                          <label className="text-xs text-zinc-300 flex items-center gap-2">
                            <input
                              disabled={readOnly}
                              type="checkbox"
                              checked={!!cfg.enabled}
                              onChange={(e) => updateAttackRange(attackIndex, range, { enabled: e.target.checked })}
                            />
                            {range.toUpperCase()} enabled
                          </label>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            {range !== "aoe" && (
                              <input
                                disabled={readOnly}
                                type="number"
                                min={1}
                                value={Number(cfg.targets ?? 1)}
                                onChange={(e) =>
                                  updateAttackRange(attackIndex, range, { targets: Number(e.target.value || 1) })
                                }
                                placeholder="Targets"
                                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                              />
                            )}
                            {range === "ranged" && (
                              <input
                                disabled={readOnly}
                                type="number"
                                min={0}
                                value={Number(cfg.distance ?? 0)}
                                onChange={(e) =>
                                  updateAttackRange(attackIndex, "ranged", { distance: Number(e.target.value || 0) })
                                }
                                placeholder="Distance ft"
                                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                              />
                            )}
                            {range === "aoe" && (
                              <>
                                <input
                                  disabled={readOnly}
                                  type="number"
                                  min={1}
                                  value={Number(cfg.count ?? 1)}
                                  onChange={(e) =>
                                    updateAttackRange(attackIndex, "aoe", { count: Number(e.target.value || 1) })
                                  }
                                  placeholder="Count"
                                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                />
                                <input
                                  disabled={readOnly}
                                  type="number"
                                  min={0}
                                  value={Number(cfg.centerRange ?? 0)}
                                  onChange={(e) =>
                                    updateAttackRange(attackIndex, "aoe", {
                                      centerRange: Number(e.target.value || 0),
                                    })
                                  }
                                  placeholder="Center ft"
                                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                />
                                <select
                                  disabled={readOnly}
                                  value={String(cfg.shape ?? "SPHERE")}
                                  onChange={(e) =>
                                    updateAttackRange(attackIndex, "aoe", { shape: e.target.value })
                                  }
                                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                >
                                  <option value="SPHERE">Sphere</option>
                                  <option value="CONE">Cone</option>
                                  <option value="LINE">Line</option>
                                </select>
                              </>
                            )}
                            <input
                              disabled={readOnly}
                              type="number"
                              min={0}
                              value={Number(cfg.physicalStrength ?? 0)}
                              onChange={(e) =>
                                updateAttackRange(attackIndex, range, {
                                  physicalStrength: Number(e.target.value || 0),
                                })
                              }
                              placeholder="Physical"
                              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                            />
                            <input
                              disabled={readOnly}
                              type="number"
                              min={0}
                              value={Number(cfg.mentalStrength ?? 0)}
                              onChange={(e) =>
                                updateAttackRange(attackIndex, range, {
                                  mentalStrength: Number(e.target.value || 0),
                                })
                              }
                              placeholder="Mental"
                              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                            />
                          </div>

                          <input
                            disabled={readOnly}
                            value={
                              Array.isArray(cfg.damageTypes)
                                ? cfg.damageTypes.map((x) => x.name).join(", ")
                                : ""
                            }
                            onChange={(e) =>
                              updateAttackRange(attackIndex, range, {
                                damageTypes: damageTypesFromCsv(e.target.value, picklists),
                              })
                            }
                            placeholder="Damage types (comma-separated)"
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                          />
                          <input
                            disabled={readOnly}
                            value={Array.isArray(cfg.attackEffects) ? cfg.attackEffects.join(", ") : ""}
                            onChange={(e) =>
                              updateAttackRange(attackIndex, range, {
                                attackEffects: listFromCsv(e.target.value),
                              })
                            }
                            placeholder="Attack effects (comma-separated)"
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                          />
                        </div>
                      );
                    })}
                    <div className="rounded border border-zinc-800 p-2 space-y-1">
                      <p className="text-xs text-zinc-300">Natural Attack Preview</p>
                      {(naturalAttackPreviewLines[attackIndex] ?? []).length === 0 ? (
                        <p className="text-xs text-zinc-500">No attack lines.</p>
                      ) : (
                        (naturalAttackPreviewLines[attackIndex] ?? []).map((line, lineIndex) => (
                          <p key={lineIndex} className="text-xs text-zinc-500">
                            {line}
                          </p>
                        ))
                      )}
                    </div>
                  </>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wide text-zinc-400">Powers</h3>
            {!readOnly && (
              <button
                onClick={() => setEditor((p) => (p ? { ...p, powers: [...p.powers, defaultPower()] } : p))}
                className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
              >
                Add Power
              </button>
            )}
          </div>

          <div className="space-y-3">
            {editor.powers.map((power, i) => (
                <div key={i} className="rounded border border-zinc-800 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Power {i + 1}</p>
                    {!readOnly && (
                      <button
                        onClick={() =>
                          setEditor((p) =>
                            p ? { ...p, powers: p.powers.filter((_x, idx) => idx !== i) } : p,
                          )
                        }
                        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Power Identity</p>
                    <div className="grid grid-cols-1 gap-2">
                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Power Name</span>
                        <input
                          disabled={readOnly}
                          value={power.name}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i ? { ...x, name: e.target.value } : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          placeholder="Power name"
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                      </label>
                    </div>

                  <label className="space-y-1 block">
                    <span className="text-[11px] text-zinc-500">Power Description</span>
                    <textarea
                      disabled={readOnly}
                      rows={2}
                      value={power.description ?? ""}
                    onChange={(e) =>
                      setEditor((p) =>
                        p
                          ? {
                              ...p,
                              powers: p.powers.map((x, idx) =>
                                idx === i ? { ...x, description: e.target.value || null } : x,
                              ),
                            }
                          : p,
                      )
                    }
                    placeholder="What does this power do?"
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                  />
                  </label>
                  </div>
                  <div className="order-3 space-y-2 pt-2">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Timing</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Duration</span>
                        <select
                          disabled={readOnly}
                          value={power.durationType}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i
                                        ? {
                                            ...x,
                                            durationType: e.target.value as MonsterPower["durationType"],
                                            durationTurns: e.target.value === "TURNS" ? x.durationTurns ?? 1 : null,
                                          }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        >
                          <option value="INSTANT">Instant</option>
                          <option value="TURNS">Turns</option>
                          <option value="UNTIL_TARGET_NEXT_TURN">Until target starts next turn</option>
                          <option value="PASSIVE">Passive</option>
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Duration (Turns)</span>
                        <input
                          disabled={readOnly || power.durationType !== "TURNS"}
                          type="number"
                          min={1}
                          max={4}
                          value={Number(power.durationTurns ?? 1)}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i
                                        ? { ...x, durationTurns: Math.max(1, Math.min(4, Number(e.target.value || 1))) }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm disabled:opacity-50"
                        />
                      </label>

                      <label className="flex items-center gap-2 text-sm text-zinc-300 pt-5">
                        <input
                          disabled={readOnly}
                          type="checkbox"
                          checked={power.responseRequired}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i ? { ...x, responseRequired: e.target.checked } : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                        />
                        Response
                      </label>
                    </div>
                  </div>

                  <div className="order-4 space-y-2 pt-2">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Tuning</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Dice Count</span>
                        <input
                          disabled={readOnly}
                          type="number"
                          min={1}
                          max={20}
                          value={power.diceCount}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i
                                        ? {
                                            ...x,
                                            diceCount: Math.max(1, Math.min(20, Number(e.target.value || 1))),
                                          }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Potency</span>
                        <input
                          disabled={readOnly}
                          type="number"
                          min={1}
                          max={5}
                          value={power.potency}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i
                                        ? { ...x, potency: Math.max(1, Math.min(5, Number(e.target.value || 1))) }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Cooldown (Turns)</span>
                        <input
                          disabled={readOnly}
                          type="number"
                          min={1}
                          value={power.cooldownTurns}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) => {
                                      if (idx !== i) return x;
                                      const cd = Math.max(1, Number(e.target.value || 1));
                                      return {
                                        ...x,
                                        cooldownTurns: cd,
                                        cooldownReduction: Math.min(x.cooldownReduction, cd - 1),
                                      };
                                    }),
                                  }
                                : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Cooldown Reduction (Coming soon)</span>
                        <input
                          disabled
                          type="number"
                          value={power.cooldownReduction}
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-60 cursor-not-allowed"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="order-2 space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Intentions</p>
                      <p className="text-[11px] text-zinc-600">A power can have multiple intentions (higher cost).</p>
                    </div>

                    <div className="space-y-3">
                      {power.intentions.map((it, j) => {
                        const details = (it.detailsJson ?? {}) as Record<string, unknown>;
                        const attackMode = getDetailsString(details, "attackMode");
                        const dmgTypes = getDetailsStringArray(details, "damageTypes");
                        const controlMode = getDetailsString(details, "controlMode");
                        const cleanseEffectType = getDetailsString(details, "cleanseEffectType");
                        const movementMode = getDetailsString(details, "movementMode");
                        const statTarget = getDetailsString(details, "statTarget");

                        const availableDamageTypes =
                          attackMode === "MENTAL"
                            ? picklists.damageTypes.filter((d) => (d.attackMode ?? "PHYSICAL") === "MENTAL")
                            : picklists.damageTypes.filter((d) => (d.attackMode ?? "PHYSICAL") === "PHYSICAL");

                        return (
                          <div key={j} className="rounded border border-zinc-800 bg-zinc-900/20 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">Intention {j + 1}</p>
                              {!readOnly && power.intentions.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditor((p) =>
                                      p
                                        ? {
                                            ...p,
                                            powers: p.powers.map((x, idx) =>
                                              idx === i
                                                ? {
                                                    ...x,
                                                    intentions: x.intentions
                                                      .filter((_row, k) => k !== j)
                                                      .map((row, k) => ({ ...row, sortOrder: k })),
                                                  }
                                                : x,
                                            ),
                                          }
                                        : p,
                                    )
                                  }
                                  className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                                >
                                  Remove
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <label className="space-y-1">
                                <span className="text-[11px] text-zinc-500">Intention Type</span>
                                <select
                                  disabled={readOnly}
                                  value={it.type}
                                  onChange={(e) =>
                                    setEditor((p) =>
                                      p
                                        ? {
                                            ...p,
                                            powers: p.powers.map((x, idx) =>
                                              idx === i
                                                ? {
                                                    ...x,
                                                    intentions: x.intentions.map((row, k) =>
                                                      k === j
                                                        ? { ...row, type: e.target.value as MonsterPowerIntentionType }
                                                        : row,
                                                    ),
                                                  }
                                                : x,
                                            ),
                                          }
                                        : p,
                                    )
                                  }
                                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                >
                                  {INTENTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="space-y-1">
                                <span className="text-[11px] text-zinc-500">Defence Requirement</span>
                                <select
                                  disabled={readOnly}
                                  value={getDetailsString(details, "defenceRequirement") || "NONE"}
                                  onChange={(e) =>
                                    setPowerIntentionDetails(setEditor, i, j, {
                                      defenceRequirement: e.target.value,
                                    })
                                  }
                                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                >
                                  <option value="NONE">None</option>
                                  <option value="PHYSICAL">Physical</option>
                                  <option value="MENTAL">Mental</option>
                                </select>
                              </label>
                            </div>

                            <div className="rounded border border-zinc-800 bg-zinc-950/30 p-3 space-y-2">
                              <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Specifics</p>

                              {(it.type === "ATTACK" || it.type === "DEFENCE") && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <label className="space-y-1">
                                    <span className="text-[11px] text-zinc-500">Mode</span>
                                    <select
                                      disabled={readOnly}
                                      value={attackMode || "PHYSICAL"}
                                      onChange={(e) =>
                                        setPowerIntentionDetails(setEditor, i, j, {
                                          attackMode: e.target.value,
                                          ...(it.type === "ATTACK" ? { damageTypes: [] } : {}),
                                        })
                                      }
                                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                    >
                                      {ATTACK_MODES.map((mode) => (
                                        <option key={mode} value={mode}>
                                          {mode}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  {it.type === "ATTACK" && (
                                    <div className="space-y-1">
                                      <span className="text-[11px] text-zinc-500">Damage Types</span>
                                      <div className="flex flex-wrap gap-2">
                                        {availableDamageTypes.map((dt) => {
                                          const selected = dmgTypes.some(
                                            (x) => String(x).toLowerCase() === dt.name.toLowerCase(),
                                          );
                                          return (
                                            <button
                                              key={dt.id}
                                              type="button"
                                              disabled={readOnly}
                                              onClick={() =>
                                                setPowerIntentionDetails(setEditor, i, j, {
                                                  damageTypes: toggleStringInArray(dmgTypes, dt.name),
                                                })
                                              }
                                              className={[
                                                "rounded border px-2 py-1 text-xs",
                                                selected
                                                  ? "border-emerald-600 bg-emerald-950/30 text-emerald-100"
                                                  : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800",
                                                readOnly ? "opacity-60 cursor-not-allowed" : "",
                                              ].join(" ")}
                                            >
                                              {dt.name}
                                            </button>
                                          );
                                        })}
                                        {picklists.damageTypes.length === 0 && (
                                          <p className="text-xs text-zinc-500">No damage types loaded.</p>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-zinc-600">
                                        Uses Forge damage type list (filtered by mode).
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {it.type === "CONTROL" && (
                                <label className="space-y-1 block">
                                  <span className="text-[11px] text-zinc-500">Control Mode</span>
                                  <select
                                    disabled={readOnly}
                                    value={controlMode}
                                    onChange={(e) =>
                                      setPowerIntentionDetails(setEditor, i, j, { controlMode: e.target.value })
                                    }
                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                  >
                                    <option value="">Select...</option>
                                    {CONTROL_MODES.map((mode) => (
                                      <option key={mode} value={mode}>
                                        {mode}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}

                              {it.type === "CLEANSE" && (
                                <label className="space-y-1 block">
                                  <span className="text-[11px] text-zinc-500">Cleanse Effect</span>
                                  <select
                                    disabled={readOnly}
                                    value={cleanseEffectType}
                                    onChange={(e) =>
                                      setPowerIntentionDetails(setEditor, i, j, { cleanseEffectType: e.target.value })
                                    }
                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                  >
                                    <option value="">Select...</option>
                                    {CLEANSE_EFFECTS.map((effect) => (
                                      <option key={effect} value={effect}>
                                        {effect}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}

                              {it.type === "MOVEMENT" && (
                                <label className="space-y-1 block">
                                  <span className="text-[11px] text-zinc-500">Movement Type</span>
                                  <select
                                    disabled={readOnly}
                                    value={movementMode}
                                    onChange={(e) =>
                                      setPowerIntentionDetails(setEditor, i, j, { movementMode: e.target.value })
                                    }
                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                  >
                                    <option value="">Select...</option>
                                    {MOVEMENT_MODES.map((mode) => (
                                      <option key={mode} value={mode}>
                                        {mode}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}

                              {(it.type === "AUGMENT" || it.type === "DEBUFF") && (
                                <label className="space-y-1 block">
                                  <span className="text-[11px] text-zinc-500">
                                    {it.type === "AUGMENT" ? "Augment Stat" : "Debuff Stat"}
                                  </span>
                                  <select
                                    disabled={readOnly}
                                    value={statTarget}
                                    onChange={(e) =>
                                      setPowerIntentionDetails(setEditor, i, j, { statTarget: e.target.value })
                                    }
                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                  >
                                    <option value="">Select...</option>
                                    {AUGMENT_DEBUFF_STATS.map((stat) => (
                                      <option key={stat} value={stat}>
                                        {stat}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}

                              {(it.type === "HEALING" || it.type === "SUMMON" || it.type === "TRANSFORMATION") && (
                                <p className="text-sm text-zinc-500">
                                  No specifics yet for {it.type}. (UI scaffold only.)
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {!readOnly && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i && x.intentions.length < 4
                                        ? {
                                            ...x,
                                            intentions: [
                                              ...x.intentions,
                                              { sortOrder: x.intentions.length, type: "ATTACK", detailsJson: {} },
                                            ],
                                          }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                        >
                          Add Intention
                        </button>
                      </div>
                    )}
                  </div>
                </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Custom Notes</h3>
          <textarea
            disabled={readOnly}
            rows={3}
            value={editor.customNotes ?? ""}
            onChange={(e) => setEditor((p) => (p ? { ...p, customNotes: e.target.value || null } : p))}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
          />
        </section>
          </div>

          <div className={`${previewMobileVisibility} lg:block lg:sticky lg:top-4 self-start`}>
            <section className="rounded border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
              <h3 className="font-semibold">Monster Block Preview</h3>
              {previewMonster && <MonsterBlockCard monster={previewMonster} weaponById={weaponById} />}
            </section>
          </div>
        </div>
        {/* Manual test checklist:
            - Click input: dropdown opens, shows all results
            - Click Filters: panel opens, selecting level chips reduces list
            - Tier chips reduce list (SC only)
            - Exclude Legendary hides legendaries
            - Clear resets and list returns
            - Closing/opening dropdown does not reset selections
            - Switching campaignId resets filters
            - Applying filters shows pills immediately
            - Clicking x on a pill removes only that filter
            - Result count updates live with search/filters
            - Recently used appears only when query is empty
            - Recently used selection behaves like normal selection
            - localStorage failures do not crash the picker
        */}
    </div>
  );
}
