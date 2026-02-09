"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DiceSize,
  MonsterAttack,
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
  getWillpowerValue,
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

const ATTR_ROWS = [
  ["Attack", "attackDie", "attackResistDie", "attackModifier"],
  ["Defence", "defenceDie", "defenceResistDie", "defenceModifier"],
  ["Fortitude", "fortitudeDie", "fortitudeResistDie", "fortitudeModifier"],
  ["Intellect", "intellectDie", "intellectResistDie", "intellectModifier"],
  ["Support", "supportDie", "supportResistDie", "supportModifier"],
  ["Bravery", "braveryDie", "braveryResistDie", "braveryModifier"],
] as const;

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
    ? raw.traits.map((entry, i) => ({
        sortOrder: i,
        text: String((entry as { text?: unknown }).text ?? ""),
      }))
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
    traits: monster.traits.map((t, i) => ({ sortOrder: i, text: t.text })),
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

function asNullableId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [equipmentCapHint, setEquipmentCapHint] = useState<string | null>(null);
  const hasDraftRef = useRef(false);

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
    const [weaponRes, pickRes] = await Promise.all([
      fetch(`/api/summoning-circle/weapons?campaignId=${encodeURIComponent(campaignId)}`, {
        cache: "no-store",
      }),
      fetch("/api/forge/picklists", { cache: "no-store" }),
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
      editor ? getWillpowerValue(editor.supportDie, editor.braveryDie, editor.level) : 0,
    [editor?.supportDie, editor?.braveryDie, editor?.level],
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
  const willpowerDice = Math.max(0, Math.ceil(willpowerValue / 6));
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6">
      <aside className="rounded border border-zinc-800 bg-zinc-950/40 p-3 space-y-3 h-fit">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Monsters</p>
          <button
            onClick={newMonster}
            className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
          >
            New
          </button>
        </div>
        <div className="space-y-2">
          {summaries.map((row) => (
            <button
              key={row.id}
              onClick={() => {
                hasDraftRef.current = false;
                setSuccess(null);
                setSelectedId(row.id);
              }}
              className={`w-full text-left rounded border px-2 py-2 ${
                selectedId === row.id
                  ? "border-emerald-500 bg-emerald-950/20"
                  : "border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900"
              }`}
            >
              <p className="text-sm font-medium">{row.name}</p>
              <p className="text-xs text-zinc-500">
                L{row.level} {row.tier} {row.source === "CORE" ? "- Core" : ""}
              </p>
            </button>
          ))}
        </div>
      </aside>

      <div className="space-y-5">
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
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Survivability & Defence</h3>
          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[11px] text-zinc-500">PR Max</span>
              <input
                readOnly
                type="number"
                value={resilienceValues.physicalResilienceMax}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-zinc-500">MP Max</span>
              <input
                readOnly
                type="number"
                value={resilienceValues.mentalPerseveranceMax}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
              />
            </label>
          </div>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Attributes, Resists & Modifiers</h3>
          <div className="space-y-2">
            {ATTR_ROWS.map(([label, dieKey, resistKey, modKey]) => (
              <div key={label} className="grid grid-cols-1 md:grid-cols-[140px_1fr_1fr_1fr] gap-2">
                <p className="text-sm self-center">{label}</p>
                <select
                  disabled={readOnly}
                  value={String(editor[dieKey])}
                  onChange={(e) =>
                    setEditor((p) => (p ? { ...p, [dieKey]: e.target.value as DiceSize } : p))
                  }
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
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
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
                <input
                  readOnly
                  type="number"
                  value={itemModifierValues[modKey]}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
                />
              </div>
            ))}
          </div>

        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Traits</h3>
          <textarea
            disabled={readOnly}
            rows={4}
            value={editor.traits.map((t) => t.text).join("\n")}
            onChange={(e) =>
              setEditor((p) =>
                p
                  ? {
                      ...p,
                      traits: e.target.value
                        .split("\n")
                        .map((text, idx) => ({ sortOrder: idx, text: text.trim() }))
                        .filter((t) => t.text),
                    }
                  : p,
              )
            }
            placeholder="One trait per line"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
          />
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Equipped Gear</h3>

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500">Hands</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {HAND_SLOTS.map((slot) => {
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
              })}
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
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-2">
              {BODY_SLOTS.map((slot) => {
                const selectedValue = editor[slot.key] ?? "";
                const options = weapons.filter((item) => isValidBodyItemForSlot(slot.key, item));
                return (
                  <label key={slot.key} className="space-y-1">
                    <span className="text-[11px] text-zinc-500">{slot.label}</span>
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
              })}
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
                <span className="text-[11px] text-zinc-500">Armor Skill</span>
                <input
                  readOnly
                  type="number"
                  value={computedArmorSkillValue}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-zinc-500">Dodge</span>
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
                <span className="text-[11px] text-zinc-500">Willpower</span>
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

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500">From Equipped Gear</p>
            <p className="text-xs text-zinc-500">Weapon Skill: {computedWeaponSkillValue}</p>
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
            {editor.powers.map((power, i) => {
              const maxReduction = Math.max(0, power.cooldownTurns - 1);
              return (
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
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
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
                      placeholder="Name"
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    />
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
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    />
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
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    />
                    <select
                      disabled={readOnly}
                      value={power.defenceRequirement}
                      onChange={(e) =>
                        setEditor((p) =>
                          p
                            ? {
                                ...p,
                                powers: p.powers.map((x, idx) =>
                                  idx === i
                                    ? {
                                        ...x,
                                        defenceRequirement:
                                          e.target.value as MonsterPower["defenceRequirement"],
                                      }
                                    : x,
                                ),
                              }
                            : p,
                        )
                      }
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    >
                      <option value="NONE">Defence: None</option>
                      <option value="PROTECTION">Defence: Protection</option>
                      <option value="RESIST">Defence: Resist</option>
                    </select>
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
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    >
                      <option value="INSTANT">Instant</option>
                      <option value="TURNS">Turns</option>
                      <option value="PASSIVE">Passive</option>
                    </select>
                    {power.durationType === "TURNS" && (
                      <input
                        disabled={readOnly}
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
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                      />
                    )}
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
                                  return { ...x, cooldownTurns: cd, cooldownReduction: Math.min(x.cooldownReduction, cd - 1) };
                                }),
                              }
                            : p,
                        )
                      }
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    />
                    <input
                      disabled={readOnly}
                      type="number"
                      min={0}
                      max={maxReduction}
                      value={power.cooldownReduction}
                      onChange={(e) =>
                        setEditor((p) =>
                          p
                            ? {
                                ...p,
                                powers: p.powers.map((x, idx) =>
                                  idx === i
                                    ? {
                                        ...x,
                                        cooldownReduction: Math.max(
                                          0,
                                          Math.min(maxReduction, Number(e.target.value || 0)),
                                        ),
                                      }
                                    : x,
                                ),
                              }
                            : p,
                        )
                      }
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    />
                  </div>
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
                    placeholder="Description"
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                  />
                  <label className="text-xs text-zinc-300 flex items-center gap-2">
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
                  <div className="space-y-1">
                    {power.intentions.map((it, j) => (
                      <div key={j} className="grid grid-cols-1 md:grid-cols-4 gap-2">
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
                                                ? {
                                                    ...row,
                                                    type: e.target.value as MonsterPowerIntentionType,
                                                  }
                                                : row,
                                            ),
                                          }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        >
                          {INTENTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <input
                          disabled={readOnly}
                          value={String((it.detailsJson as Record<string, unknown>).statChoice ?? "")}
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
                                                ? {
                                                    ...row,
                                                    detailsJson: {
                                                      ...(row.detailsJson as Record<string, unknown>),
                                                      statChoice: e.target.value,
                                                    },
                                                  }
                                                : row,
                                            ),
                                          }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          placeholder="Stat choice"
                          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                        <input
                          disabled={readOnly}
                          value={String((it.detailsJson as Record<string, unknown>).controlMode ?? "")}
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
                                                ? {
                                                    ...row,
                                                    detailsJson: {
                                                      ...(row.detailsJson as Record<string, unknown>),
                                                      controlMode: e.target.value,
                                                    },
                                                  }
                                                : row,
                                            ),
                                          }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          placeholder="Control mode"
                          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                        <input
                          disabled={readOnly}
                          value={String(
                            (it.detailsJson as Record<string, unknown>).cleanseEffectType ?? "",
                          )}
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
                                                ? {
                                                    ...row,
                                                    detailsJson: {
                                                      ...(row.detailsJson as Record<string, unknown>),
                                                      cleanseEffectType: e.target.value,
                                                    },
                                                  }
                                                : row,
                                            ),
                                          }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          placeholder="Cleanse effect"
                          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  {!readOnly && (
                    <div className="flex gap-2">
                      <button
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
                      <button
                        onClick={() =>
                          setEditor((p) =>
                            p
                              ? {
                                  ...p,
                                  powers: p.powers.map((x, idx) =>
                                    idx === i && x.intentions.length > 1
                                      ? { ...x, intentions: x.intentions.slice(0, -1) }
                                      : x,
                                  ),
                                }
                              : p,
                          )
                        }
                        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        Remove Intention
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
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

        <section className="rounded border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <h3 className="font-semibold">Monster Block Preview</h3>
          {previewMonster && <MonsterBlockCard monster={previewMonster} weaponById={weaponById} />}
        </section>
      </div>
    </div>
  );
}
