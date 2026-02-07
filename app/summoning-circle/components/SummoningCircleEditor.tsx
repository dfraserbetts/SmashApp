"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DiceSize,
  MonsterNaturalAttackConfig,
  MonsterPower,
  MonsterPowerIntentionType,
  MonsterSource,
  MonsterSummary,
  MonsterUpsertInput,
} from "@/lib/summoning/types";
import { formatModifierWithEffective } from "@/lib/summoning/render";
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

function dieLabel(value: DiceSize | null | undefined): string {
  if (!value) return "-";
  return `d${value.replace("D", "")}`;
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

function defaultMonster(): EditableMonster {
  return {
    name: "New Monster",
    level: 1,
    tier: "MINION",
    legendary: false,
    attackMode: "NATURAL_WEAPON",
    equippedWeaponId: null,
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
    tags: [],
    traits: [],
    naturalAttack: { attackName: "Natural Weapon", attackConfig: defaultNaturalConfig() },
    powers: [],
  };
}

function toEditable(raw: Record<string, unknown>): EditableMonster {
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((entry) => String((entry as { tag?: unknown }).tag ?? ""))
    : [];
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
    tags,
    traits,
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
  return {
    ...monster,
    tags: [...monster.tags],
    traits: monster.traits.map((t, i) => ({ sortOrder: i, text: t.text })),
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

export function SummoningCircleEditor({ campaignId }: Props) {
  const [summaries, setSummaries] = useState<MonsterSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditableMonster | null>(null);
  const [weapons, setWeapons] = useState<WeaponProjection[]>([]);
  const [picklists, setPicklists] = useState<Picklists>({ damageTypes: [], attackEffects: [] });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const readOnly = !!editor && (editor.source === "CORE" || editor.isReadOnly);

  const refreshSummaries = useCallback(async () => {
    const res = await fetch(
      `/api/summoning-circle/monsters?campaignId=${encodeURIComponent(campaignId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error("Failed to load monsters");
    const json = await res.json();
    const list = Array.isArray(json.monsters) ? (json.monsters as MonsterSummary[]) : [];
    setSummaries(list);
    if (!selectedId && list[0]) setSelectedId(list[0].id);
    if (selectedId && !list.some((m) => m.id === selectedId)) {
      setSelectedId(list[0]?.id ?? null);
    }
  }, [campaignId, selectedId]);

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

  const selectedWeapon = useMemo(() => {
    if (!editor?.equippedWeaponId) return null;
    return weapons.find((w) => w.id === editor.equippedWeaponId) ?? null;
  }, [editor?.equippedWeaponId, weapons]);

  const saveMonster = useCallback(async () => {
    if (!editor || readOnly) return;
    setBusy(true);
    setError(null);
    try {
      const isUpdate = !!editor.id;
      const res = await fetch(
        isUpdate
          ? `/api/summoning-circle/monsters/${editor.id}?campaignId=${encodeURIComponent(campaignId)}`
          : `/api/summoning-circle/monsters?campaignId=${encodeURIComponent(campaignId)}`,
        {
          method: isUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(editor)),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      await refreshSummaries();
      setSelectedId(String(json.id));
      await refreshSelected(String(json.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }, [campaignId, editor, readOnly, refreshSelected, refreshSummaries]);

  const deleteMonster = useCallback(async () => {
    if (!editor?.id || readOnly) return;
    if (!window.confirm("Delete this monster?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/summoning-circle/monsters/${editor.id}?campaignId=${encodeURIComponent(campaignId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(await res.text());
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
    try {
      const res = await fetch(
        `/api/summoning-circle/monsters/${editor.id}/copy?campaignId=${encodeURIComponent(campaignId)}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      await refreshSummaries();
      setSelectedId(String(json.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to copy");
    } finally {
      setBusy(false);
    }
  }, [campaignId, editor?.id, refreshSummaries]);

  const newMonster = useCallback(() => {
    setSelectedId(null);
    setEditor(defaultMonster());
  }, []);

  const updateRange = useCallback(
    (range: "melee" | "ranged" | "aoe", patch: Record<string, unknown>) => {
      setEditor((prev) => {
        if (!prev) return prev;
        const currentConfig = prev.naturalAttack?.attackConfig ?? defaultNaturalConfig();
        const currentRange = (currentConfig as Record<string, unknown>)[range] ?? {};
        return {
          ...prev,
          naturalAttack: {
            attackName: prev.naturalAttack?.attackName ?? "Natural Weapon",
            attackConfig: {
              ...currentConfig,
              [range]: { ...currentRange, ...patch },
            },
          },
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
              onClick={() => setSelectedId(row.id)}
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

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Survivability & Defence</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            {[
              ["physicalResilienceCurrent", "PR Current"],
              ["physicalResilienceMax", "PR Max"],
              ["mentalPerseveranceCurrent", "MP Current"],
              ["mentalPerseveranceMax", "MP Max"],
              ["physicalProtection", "Physical Protection"],
              ["mentalProtection", "Mental Protection"],
            ].map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span className="text-[11px] text-zinc-500">{label}</span>
                <input
                  disabled={readOnly}
                  type="number"
                  min={0}
                  value={Number((editor as Record<string, unknown>)[key] ?? 0)}
                  onChange={(e) =>
                    setEditor((p) => (p ? { ...p, [key]: Number(e.target.value || 0) } : p))
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
              </label>
            ))}
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
                  disabled={readOnly}
                  type="number"
                  value={Number(editor[modKey])}
                  onChange={(e) =>
                    setEditor((p) => (p ? { ...p, [modKey]: Number(e.target.value || 0) } : p))
                  }
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="text-xs text-zinc-400">
              Weapon Skill / Modifier
              <div className="grid grid-cols-2 gap-2 mt-1">
                <input
                  disabled={readOnly}
                  type="number"
                  min={1}
                  value={editor.weaponSkillValue}
                  onChange={(e) =>
                    setEditor((p) => (p ? { ...p, weaponSkillValue: Number(e.target.value || 1) } : p))
                  }
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
                <input
                  disabled={readOnly}
                  type="number"
                  value={editor.weaponSkillModifier}
                  onChange={(e) =>
                    setEditor((p) => (p ? { ...p, weaponSkillModifier: Number(e.target.value || 0) } : p))
                  }
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
              </div>
            </label>
            <label className="text-xs text-zinc-400">
              Armor Skill / Modifier
              <div className="grid grid-cols-2 gap-2 mt-1">
                <input
                  disabled={readOnly}
                  type="number"
                  min={1}
                  value={editor.armorSkillValue}
                  onChange={(e) =>
                    setEditor((p) => (p ? { ...p, armorSkillValue: Number(e.target.value || 1) } : p))
                  }
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
                <input
                  disabled={readOnly}
                  type="number"
                  value={editor.armorSkillModifier}
                  onChange={(e) =>
                    setEditor((p) => (p ? { ...p, armorSkillModifier: Number(e.target.value || 0) } : p))
                  }
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
              </div>
            </label>
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
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Attacks</h3>
          <select
            disabled={readOnly}
            value={editor.attackMode}
            onChange={(e) =>
              setEditor((p) => {
                if (!p) return p;
                const attackMode = e.target.value as EditableMonster["attackMode"];
                return {
                  ...p,
                  attackMode,
                  naturalAttack:
                    attackMode === "NATURAL_WEAPON"
                      ? p.naturalAttack ?? { attackName: "Natural Weapon", attackConfig: defaultNaturalConfig() }
                      : p.naturalAttack,
                };
              })
            }
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
          >
            <option value="NATURAL_WEAPON">Natural Weapon</option>
            <option value="EQUIPPED_WEAPON">Equipped Weapon</option>
          </select>

          {editor.attackMode === "EQUIPPED_WEAPON" && (
            <select
              disabled={readOnly}
              value={editor.equippedWeaponId ?? ""}
              onChange={(e) => setEditor((p) => (p ? { ...p, equippedWeaponId: e.target.value || null } : p))}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            >
              <option value="">Select weapon</option>
              {weapons.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}

          {editor.attackMode === "NATURAL_WEAPON" && editor.naturalAttack && (
            <div className="space-y-2 rounded border border-zinc-800 p-2">
              <input
                disabled={readOnly}
                value={editor.naturalAttack.attackName}
                onChange={(e) =>
                  setEditor((p) =>
                    p && p.naturalAttack
                      ? { ...p, naturalAttack: { ...p.naturalAttack, attackName: e.target.value } }
                      : p,
                  )
                }
                placeholder="Natural attack name"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
              />

              {(["melee", "ranged", "aoe"] as const).map((range) => {
                const cfg = (editor.naturalAttack?.attackConfig[range] ?? {}) as {
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
                        onChange={(e) => updateRange(range, { enabled: e.target.checked })}
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
                          onChange={(e) => updateRange(range, { targets: Number(e.target.value || 1) })}
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
                          onChange={(e) => updateRange("ranged", { distance: Number(e.target.value || 0) })}
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
                            onChange={(e) => updateRange("aoe", { count: Number(e.target.value || 1) })}
                            placeholder="Count"
                            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                          />
                          <input
                            disabled={readOnly}
                            type="number"
                            min={0}
                            value={Number(cfg.centerRange ?? 0)}
                            onChange={(e) =>
                              updateRange("aoe", { centerRange: Number(e.target.value || 0) })
                            }
                            placeholder="Center ft"
                            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                          />
                          <select
                            disabled={readOnly}
                            value={String(cfg.shape ?? "SPHERE")}
                            onChange={(e) => updateRange("aoe", { shape: e.target.value })}
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
                        onChange={(e) => updateRange(range, { physicalStrength: Number(e.target.value || 0) })}
                        placeholder="Physical"
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                      />
                      <input
                        disabled={readOnly}
                        type="number"
                        min={0}
                        value={Number(cfg.mentalStrength ?? 0)}
                        onChange={(e) => updateRange(range, { mentalStrength: Number(e.target.value || 0) })}
                        placeholder="Mental"
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                      />
                    </div>

                    <input
                      disabled={readOnly}
                      value={Array.isArray(cfg.damageTypes) ? cfg.damageTypes.map((x) => x.name).join(", ") : ""}
                      onChange={(e) =>
                        updateRange(range, { damageTypes: damageTypesFromCsv(e.target.value, picklists) })
                      }
                      placeholder="Damage types (comma-separated)"
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                    />
                    <input
                      disabled={readOnly}
                      value={Array.isArray(cfg.attackEffects) ? cfg.attackEffects.join(", ") : ""}
                      onChange={(e) => updateRange(range, { attackEffects: listFromCsv(e.target.value) })}
                      placeholder="Attack effects (comma-separated)"
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Monster Editor</h2>
            {readOnly && (
              <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                Core monster (read-only)
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {readOnly && editor.id && (
                <button
                  onClick={copyMonster}
                  disabled={busy}
                  className="rounded border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800 disabled:opacity-60"
                >
                  Copy to Campaign
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

          <input
            disabled={readOnly}
            value={editor.tags.join(", ")}
            onChange={(e) => setEditor((p) => (p ? { ...p, tags: listFromCsv(e.target.value) } : p))}
            placeholder="Tags (comma-separated stable strings)"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
          />
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
          <MonsterBlockCard monster={editor} selectedWeapon={selectedWeapon} />
        </section>
      </div>
    </div>
  );
}
