"use client";

import { useEffect, useMemo, useState } from "react";

type ForgeValueCategory =
  | "WEAPON_ATTRIBUTES"
  | "ARMOR_ATTRIBUTES"
  | "SHIELD_ATTRIBUTES"
  | "WARDING_OPTIONS"
  | "SANCTIFIED_OPTIONS"
  | "ATTACK_EFFECTS"
  | "DEF_EFFECTS"
  | "DAMAGE_TYPES";

type ValueRow = {
  id: number;
  name: string;
  descriptorTemplate?: string | null;
  descriptorNotes?: string | null;
  requiresRange?: "MELEE" | "RANGED" | "AOE" | null;
  requiresAoeShape?: "SPHERE" | "CONE" | "LINE" | null;
};

type ForgeCostEntry = {
  id: number;
  category: string;
  selector1: string;
  selector2: string | null;
  selector3: string | null;
  value: number;
  notes: string | null;
};

function parseTieredName(name: string): { base: string; tier: number | null } {
  const m = name.trim().match(/^(.*)\s(\d+)$/);
  if (!m) return { base: name.trim(), tier: null };
  return { base: (m[1] ?? "").trim(), tier: Number.parseInt(m[2] ?? "", 10) };
}

export default function AdminForgeValuesPage() {
  const [category, setCategory] = useState<ForgeValueCategory>("WEAPON_ATTRIBUTES");

  const [rows, setRows] = useState<ValueRow[]>([]);
  const [costs, setCosts] = useState<ForgeCostEntry[]>([]);

  // Admin-backed cost editing (Option B: full context matrix)
  const [costContexts, setCostContexts] = useState<string[]>([]);
  const [costRowsLive, setCostRowsLive] = useState<ForgeCostEntry[]>([]);
  const [costEdits, setCostEdits] = useState<Record<string, { value: string; notes: string }>>(
    {},
  );
  const [savingContext, setSavingContext] = useState<string | null>(null);
  // Bootstrap first context (when none exist yet)
  const [bootstrapContext, setBootstrapContext] = useState("");
  const [bootstrapValue, setBootstrapValue] = useState("");
  const [bootstrapNotes, setBootstrapNotes] = useState("");
  const [bootstrapping, setBootstrapping] = useState(false);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [q, setQ] = useState("");

  // Create
  const [newValueName, setNewValueName] = useState("");
  const [creatingValue, setCreatingValue] = useState(false);

  // Rename
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [migrateOnRename, setMigrateOnRename] = useState(true);
  const [savingRename, setSavingRename] = useState(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Weapon Attribute descriptor editing (v1)
  const [descriptorTemplate, setDescriptorTemplate] = useState("");
  const [descriptorNotes, setDescriptorNotes] = useState("");

  const [requiresRange, setRequiresRange] =
    useState<"MELEE" | "RANGED" | "AOE" | "">( "");
  const [requiresAoeShape, setRequiresAoeShape] =
    useState<"SPHERE" | "CONE" | "LINE" | "">( "");
  const [requiresStrengthSource, setRequiresStrengthSource] =
    useState<boolean>(false);

  const [requiresRangeSelection, setRequiresRangeSelection] =
    useState<boolean>(false);

  const [requiresStrengthKind, setRequiresStrengthKind] = 
    useState<string>("");

  const [savingDescriptor, setSavingDescriptor] = useState(false);

  const isWeaponAttributes = category === "WEAPON_ATTRIBUTES";
  const isArmorAttributes = category === "ARMOR_ATTRIBUTES";
  const isShieldAttributes = category === "SHIELD_ATTRIBUTES";

  const TOKEN_WHITELIST = useMemo(() => {
    // Weapon Attribute tokens
    if (isWeaponAttributes) {
      return new Set([
        "[MeleePhysicalStrength]",
        "[MeleeMentalStrength]",
        "[RangedPhysicalStrength]",
        "[RangedMentalStrength]",
        "[AoePhysicalStrength]",
        "[AoeMentalStrength]",

        // Parameterised strength selection
        "[ChosenPhysicalStrength]",
        "[ChosenMentalStrength]",
        "[ChosenRange]",

        "[AttributeValue]",

        // Weapon context (selected on this weapon)
        "[GS_AttackEffects]",
        "[DamageTypes]",

        // Range context
        "[MeleeTargets]",
        "[RangedTargets]",
        "[RangedDistanceFeet]",
        "[AoeCount]",
        "[AoeCenterRangeFeet]",
        "[AoeShape]",
        "[AoeSphereRadiusFeet]",
        "[AoeConeLengthFeet]",
        "[AoeLineWidthFeet]",
        "[AoeLineLengthFeet]",
      ]);
    }

    // Armor Attribute tokens (start minimal; expand when needed)
    if (isArmorAttributes || isShieldAttributes) {
      return new Set([
        "[AttributeValue]",
        "[PPV]",
        "[MPV]",
        "[ChosenPV]",
        "[AuraPhysical]",
        "[AuraMental]",
      ]);
    }

    return new Set<string>();
  }, [isWeaponAttributes, isArmorAttributes, isShieldAttributes]);

  function extractTokens(s: string): string[] {
    const matches = s.match(/\[[^\]]+\]/g) ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of matches) {
      if (!seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    return out;
  }

function renderTemplatePreview(
  tpl: string,
  category: ForgeValueCategory,
  selectedBaseName: string,
): string {
  // Preview uses fixed sample values. Later we can wire real item-context.
  const isWeapon = category === "WEAPON_ATTRIBUTES";

  const base = (selectedBaseName ?? "").trim().toLowerCase();

  const attributeValueSample =
    // If you're editing Warding/Sanctified as an ARMOR ATTRIBUTE, preview should reflect that.
    (category === "ARMOR_ATTRIBUTES" && base === "warding") || category === "WARDING_OPTIONS"
      ? "Disease"
      : (category === "ARMOR_ATTRIBUTES" && base === "sanctified") || category === "SANCTIFIED_OPTIONS"
        ? "Feedback"
        : "3";

  // Armor context samples (also fine for shields/options)
  const ppv = "3";
  const mpv = "2";
  const chosenPv = ppv; // pretend "Physical" is the chosen PV

  const sample: Record<string, string> = {
    // Common
    "[AttributeValue]": attributeValueSample,

    // Weapon-ish samples
    "[MeleePhysicalStrength]": "2",
    "[MeleeMentalStrength]": "1",
    "[RangedPhysicalStrength]": "3",
    "[RangedMentalStrength]": "0",
    "[AoePhysicalStrength]": "2",
    "[AoeMentalStrength]": "2",

    "[GS_AttackEffects]": "Laceration, Burn",
    "[DamageTypes]": "Slashing, Psychic",

    "[MeleeTargets]": "1",
    "[RangedTargets]": "1",
    "[RangedDistanceFeet]": "30",

    "[AoeCount]": "3",
    "[AoeCenterRangeFeet]": "60",
    "[AoeShape]": "Sphere",
    "[AoeSphereRadiusFeet]": "10",
    "[AoeConeLengthFeet]": "15",
    "[AoeLineWidthFeet]": "5",
    "[AoeLineLengthFeet]": "30",

    // Armor-ish samples
    "[PPV]": ppv,
    "[MPV]": mpv,
    "[ChosenPV]": chosenPv,
    "[AuraPhysical]": "1",
    "[AuraMental]": "2",
    "[Aura]": "1",
  };

  let out = tpl ?? "";
  for (const [k, v] of Object.entries(sample)) {
    out = out.split(k).join(v);
  }

  // Tiny nicety: if someone previews a weapon template while editing armor, they still get reasonable values.
  // (No additional logic needed; sample covers both.)
  return out;
}
  
  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      // 1) Forge values (admin-gated)
      const valuesEndpoint =
        category === "WEAPON_ATTRIBUTES"
          ? "/api/admin/weapon-attributes"
          : category === "ARMOR_ATTRIBUTES"
            ? "/api/admin/armor-attributes"
            : category === "SHIELD_ATTRIBUTES"
              ? "/api/admin/shield-attributes"
              : category === "WARDING_OPTIONS"
                ? "/api/admin/warding-options"
                : category === "SANCTIFIED_OPTIONS"
                  ? "/api/admin/sanctified-options"
                  : category === "ATTACK_EFFECTS"
                    ? "/api/admin/attack-effects"
                    : category === "DEF_EFFECTS"
                      ? "/api/admin/def-effects"
                      : "/api/admin/damage-types";


      const valuesRes = await fetch(valuesEndpoint, { cache: "no-store" });

      const valuesJson = await valuesRes.json();
      if (!valuesRes.ok) {
        throw new Error(valuesJson?.error ?? "Failed to load forge values");
      }

      // 2) Costs (read-only via picklists for now)
      const pickRes = await fetch("/api/forge/picklists", { cache: "no-store" });
      const pickJson = await pickRes.json();
      if (!pickRes.ok) {
        throw new Error(pickJson?.error ?? "Failed to load picklists");
      }

      const allCosts = (pickJson?.costs ?? []) as ForgeCostEntry[];
      setRows((valuesJson?.rows ?? []) as ValueRow[]);
      setCosts(allCosts);
    } catch (e: any) {
      setErr(String(e?.message ?? "Failed to load"));
      setRows([]);
      setCosts([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

    useEffect(() => {
    // When switching categories, reset selection + edit buffers so we don’t “cross the streams”.
    setSelectedId(null);
    setQ("");
    setNewValueName("");
    cancelRename();
    setErr(null);
    setFlash(null);
    setBootstrapContext("");
    setBootstrapValue("");
    setBootstrapNotes("");

    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  async function createValue() {
    setErr(null);
    const name = newValueName.trim();
    if (!name) return;

    try {
      setCreatingValue(true);
      const valuesEndpoint =
        category === "WEAPON_ATTRIBUTES"
          ? "/api/admin/weapon-attributes"
          : category === "ARMOR_ATTRIBUTES"
            ? "/api/admin/armor-attributes"
            : category === "SHIELD_ATTRIBUTES"
              ? "/api/admin/shield-attributes"
              : category === "WARDING_OPTIONS"
                ? "/api/admin/warding-options"
                : category === "SANCTIFIED_OPTIONS"
                  ? "/api/admin/sanctified-options"
                  : category === "ATTACK_EFFECTS"
                    ? "/api/admin/attack-effects"
                    : category === "DEF_EFFECTS"
                      ? "/api/admin/def-effects"
                      : "/api/admin/damage-types";

      const res = await fetch(valuesEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Create failed");

      // Add locally and auto-select
      const row = data?.row as ValueRow | undefined;
      if (row?.id) {
        setRows((prev) => [row, ...prev]);
        setSelectedId(row.id);
        setQ("");
        setNewValueName("");
      } else {
        // Fallback if shape changes
        await loadAll();
      }
    } catch (e: any) {
      setErr(String(e?.message ?? "Create failed"));
    } finally {
      setCreatingValue(false);
    }
  }

  function beginRename() {
    if (!selected) return;
    setIsRenaming(true);
    setRenameValue(selected.name);
  }

  function cancelRename() {
    setIsRenaming(false);
    setRenameValue("");
    setMigrateOnRename(true);
  }

  async function saveRename() {
    if (!selected) return;
    const name = renameValue.trim();
    if (!name) {
      setErr("Name is required");
      return;
    }

    setErr(null);
    try {
      setSavingRename(true);

      const oldParsed = parseTieredName(selected.name);
      const newParsed = parseTieredName(name);

      // 1) rename the value row
      const valuesEndpoint =
        category === "WEAPON_ATTRIBUTES"
          ? "/api/admin/weapon-attributes"
          : category === "ARMOR_ATTRIBUTES"
            ? "/api/admin/armor-attributes"
            : category === "SHIELD_ATTRIBUTES"
              ? "/api/admin/shield-attributes"
              : category === "WARDING_OPTIONS"
                ? "/api/admin/warding-options"
                : category === "SANCTIFIED_OPTIONS"
                  ? "/api/admin/sanctified-options"
                  : category === "ATTACK_EFFECTS"
                    ? "/api/admin/attack-effects"
                    : category === "DEF_EFFECTS"
                      ? "/api/admin/def-effects"
                      : "/api/admin/damage-types";

      const res = await fetch(valuesEndpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Rename failed");

      // 2) optionally migrate costs for this base+tier
      if (costCategory && migrateOnRename) {
        const fromSelector3 = oldParsed.tier === null ? null : String(oldParsed.tier);
        const toSelector3 = newParsed.tier === null ? null : String(newParsed.tier);

        await fetch("/api/admin/forge-costs/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          category: costCategory,
          fromSelector2: oldParsed.base,
            fromSelector3,
            toSelector2: newParsed.base,
            toSelector3,
          }),
        }).then(async (r) => {
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j?.error ?? "Cost migrate failed");
        });
      }

      cancelRename();

      // Refresh both values + costs so UI matches DB
      await loadAll();
      setSelectedId(selected.id);
    } catch (e: any) {
      setErr(String(e?.message ?? "Rename failed"));
    } finally {
      setSavingRename(false);
    }
  }

  const filteredRows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base = rows
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!query) return base;

    return base.filter((r) => r.name.toLowerCase().includes(query));
  }, [rows, q]);

  const selected = useMemo(() => {
    if (selectedId === null) return null;
    return rows.find((r) => r.id === selectedId) ?? null;
  }, [rows, selectedId]);

  useEffect(() => {
    if (!selected) {
      setDescriptorTemplate("");
      setDescriptorNotes("");
      setRequiresRange("");
      setRequiresAoeShape("");
      setRequiresRangeSelection(false);
      setRequiresStrengthKind("");
      return;
    }

    setDescriptorTemplate(String(selected.descriptorTemplate ?? ""));
    setDescriptorNotes(String(selected.descriptorNotes ?? ""));
    setRequiresRange((selected.requiresRange as any) ?? "");
    setRequiresAoeShape((selected.requiresAoeShape as any) ?? "");
    setRequiresStrengthSource(!!(selected as any).requiresStrengthSource);
    setRequiresRangeSelection(!!(selected as any).requiresRangeSelection);
    setRequiresStrengthKind((selected as any).requiresStrengthKind ?? "");
  }, [selected]);

  const selectedParsed = useMemo(() => {
    if (!selected) return null;
    return parseTieredName(selected.name);
  }, [selected]);

  const variants = useMemo(() => {
    if (!selectedParsed) return [];

    const base = selectedParsed.base.toLowerCase();
    const sameBase = rows.filter((r) => parseTieredName(r.name).base.toLowerCase() === base);

    // Sort: tiered values in numeric tier order, then non-tiered alphabetically
    return sameBase
      .slice()
      .sort((a, b) => {
        const pa = parseTieredName(a.name);
        const pb = parseTieredName(b.name);
        const ta = pa.tier ?? Number.POSITIVE_INFINITY;
        const tb = pb.tier ?? Number.POSITIVE_INFINITY;
        if (ta !== tb) return ta - tb;
        return a.name.localeCompare(b.name);
      });
  }, [rows, selectedParsed]);

  const tierStr = useMemo(() => {
    if (!selectedParsed) return null;
    return selectedParsed.tier === null ? null : String(selectedParsed.tier);
  }, [selectedParsed]);

  const costCategory = useMemo(() => {
    return category === "WEAPON_ATTRIBUTES"
      ? "WeaponAttributes"
      : category === "ARMOR_ATTRIBUTES"
        ? "ArmorAttributes"
        : category === "SHIELD_ATTRIBUTES"
          ? "ShieldAttributes"
          : category === "WARDING_OPTIONS"
            ? "WardingOptions"
            : category === "SANCTIFIED_OPTIONS"
              ? "SanctifiedOptions"
              : category === "ATTACK_EFFECTS"
                ? "GS_AttackEffects"
                : category === "DEF_EFFECTS"
                  ? "GS_DefEffects"
                  : null;
  }, [category]);

  async function loadCostsLive() {
    if (!selectedParsed) {
      setCostContexts([]);
      setCostRowsLive([]);
      setCostEdits({});
      return;
    }

    setErr(null);
    try {
      const params = new URLSearchParams();

      if (!costCategory) {
        // This category doesn't use per-value costs
        setCostContexts([]);
        setCostRowsLive([]);
        setCostEdits({});
        return;
      }

      params.set("category", costCategory);
      params.set("selector2", selectedParsed.base);
      if (tierStr !== null) params.set("selector3", tierStr);

      const res = await fetch(`/api/admin/forge-costs?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load costs");

      const contexts = (data?.contexts ?? []) as string[];
      const rows = (data?.rows ?? []) as ForgeCostEntry[];

      setCostContexts(isShieldAttributes ? contexts.filter((c) => c === "Shield") : contexts);
      setCostRowsLive(rows);

      // Initialize edit buffers for every context (Option B matrix)
      const nextEdits: Record<string, { value: string; notes: string }> = {};
      for (const ctx of contexts) {
        const existing = rows.find((r) => r.selector1 === ctx) ?? null;
        nextEdits[ctx] = {
          value: existing ? String(existing.value) : "",
          notes: existing?.notes ?? "",
        };
      }
      setCostEdits(nextEdits);
    } catch (e: any) {
      setErr(String(e?.message ?? "Failed to load costs"));
      setCostContexts([]);
      setCostRowsLive([]);
      setCostEdits({});
    }
  }

  useEffect(() => {
    if (costCategory) {
      void loadCostsLive();
    } else {
      setCostContexts([]);
      setCostRowsLive([]);
      setCostEdits({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costCategory, selectedParsed?.base, tierStr]);

  const costMatrix = useMemo(() => {
    if (!selectedParsed) return [];
    return costContexts.map((ctx) => {
      const existing = costRowsLive.find((r) => r.selector1 === ctx) ?? null;
      return { context: ctx, existing };
    });
  }, [costContexts, costRowsLive, selectedParsed]);


  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3">
        <div>
          <label className="text-sm">Category</label>
          <select
            className="mt-1 rounded border bg-transparent p-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as ForgeValueCategory)}
          >
          <option value="WEAPON_ATTRIBUTES">Weapon Attributes</option>
          <option value="ARMOR_ATTRIBUTES">Armor Attributes</option>
          <option value="SHIELD_ATTRIBUTES">Shield Attributes</option>
          <option value="WARDING_OPTIONS">Warding Options</option>
          <option value="SANCTIFIED_OPTIONS">Sanctified Options</option>
          <option value="ATTACK_EFFECTS">Greater Success — Attack Effects</option>
          <option value="DEF_EFFECTS">Greater Success — Defence Effects</option>
          <option value="DAMAGE_TYPES">Damage Types</option>
          </select>
        </div>

        <div className="flex-1">
          <label className="text-sm">Search values</label>
          <input
            className="mt-1 w-full rounded border bg-transparent p-2"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Brutal, Dangerous, Reload..."
          />
        </div>

      <div className="w-[260px]">
        <label className="text-sm">New value</label>
        <input
          className="mt-1 w-full rounded border bg-transparent p-2"
          value={newValueName}
          onChange={(e) => setNewValueName(e.target.value)}
          placeholder="e.g. Brutal 1"
        />
      </div>

      <button
        className="rounded border px-4 py-2 text-sm"
        onClick={createValue}
        disabled={!newValueName.trim() || creatingValue}
        title={!newValueName.trim() ? "Enter a name" : "Create"}
      >
        {creatingValue ? "Adding…" : "Add"}
      </button>

      <button className="rounded border px-4 py-2 text-sm" onClick={loadAll}>
        Refresh
      </button>
      </div>

      {err && <div className="rounded border p-3 text-sm">{err}</div>}
      {flash && <div className="rounded border p-3 text-sm">{flash}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: Values list */}
        <div className="rounded-lg border lg:col-span-1">
          <div className="border-b p-3 text-sm font-medium">
            Values ({filteredRows.length})
          </div>

          {loading ? (
            <div className="p-3 text-sm opacity-80">Loading…</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-3 text-sm opacity-80">No values found.</div>
          ) : (
            <ul className="divide-y">
              {filteredRows.map((r) => (
                <li key={r.id}>
                  <button
                    className={`w-full p-3 text-left text-sm hover:bg-zinc-900 ${
                      selectedId === r.id ? "bg-zinc-900" : ""
                    }`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: Details */}
        <div className="rounded-lg border lg:col-span-2">
          <div className="border-b p-3 text-sm font-medium">Edit</div>

          {!selected ? (
            <div className="p-3 text-sm opacity-80">
              Select a value on the left.
            </div>
          ) : (
            <div className="space-y-4 p-3">
        <div className="space-y-2">
          {!isRenaming ? (
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{selected.name}</div>
                {selectedParsed && (
                  <div className="text-xs opacity-70">
                    Base: {selectedParsed.base}
                    {selectedParsed.tier !== null ? ` • Tier: ${selectedParsed.tier}` : ""}
                  </div>
                )}
              </div>

              <button
                className="rounded border px-3 py-1 text-xs"
                onClick={beginRename}
                title="Rename this value"
              >
                Rename
              </button>
            </div>
          ) : (
            <div className="rounded border p-2">
              <div className="text-xs font-medium opacity-80">Rename value</div>

              <div className="mt-2 flex gap-2">
                <input
                  className="w-full rounded border bg-transparent p-2 text-sm"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="New name"
                />
                <button
                  className="rounded border px-3 py-2 text-xs"
                  onClick={saveRename}
                  disabled={!renameValue.trim() || savingRename}
                  title={!renameValue.trim() ? "Enter a name" : "Save"}
                >
                  {savingRename ? "Saving…" : "Save"}
                </button>
                <button
                  className="rounded border px-3 py-2 text-xs"
                  onClick={cancelRename}
                  disabled={savingRename}
                >
                  Cancel
                </button>
              </div>

              <label className="mt-2 flex items-center gap-2 text-xs opacity-80">
                <input
                  type="checkbox"
                  checked={migrateOnRename}
                  onChange={(e) => setMigrateOnRename(e.target.checked)}
                  disabled={savingRename}
                />
                Migrate costs (recommended)
              </label>

              <div className="mt-1 text-[11px] opacity-70">
                If checked, we remap costs for this specific Base+Tier pairing.
              </div>
            </div>
          )}
        </div>

              {(isWeaponAttributes || isArmorAttributes || isShieldAttributes) && (
                <div className="rounded border p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Descriptor Template</div>
                    </div>

                    <button
                      className="rounded border px-3 py-2 text-sm"
                      disabled={savingDescriptor || !selected}
                      onClick={async () => {
                        if (!selected) return;

                        setErr(null);

                        const tokens = extractTokens(descriptorTemplate);
                        const unknown = tokens.filter((t) => !TOKEN_WHITELIST.has(t));
                        if (unknown.length) {
                          setErr(
                            `Unknown token(s): ${unknown.join(", ")}. Use the token buttons.`,
                          );
                          return;
                        }

                        try {
                          setSavingDescriptor(true);

                          const endpoint = isWeaponAttributes 
                            ? "/api/admin/weapon-attributes"
                            : isArmorAttributes
                              ? "/api/admin/armor-attributes"
                              : "/api/admin/shield-attributes";

                          const payload: any = {
                            id: selected.id,
                            descriptorTemplate,
                            descriptorNotes,
                          };

                          // Only weapon attributes support these gating/parameter flags
                          if (isWeaponAttributes) {
                            payload.requiresRange = requiresRange || null;
                            payload.requiresAoeShape = requiresAoeShape || null;
                            payload.requiresStrengthSource = requiresStrengthSource;
                            payload.requiresRangeSelection = requiresRangeSelection;
                            payload.requiresStrengthKind = requiresStrengthKind || null;
                          }

                          const res = await fetch(endpoint, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(payload),
                          });

                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(data?.error ?? "Save failed");

                          // Update local rows (prefer API-returned row)
                          if (data?.row?.id) {
                            setRows((prev) =>
                              prev.map((r) => (r.id === data.row.id ? data.row : r)),
                            );
                          } else {
                            await loadAll();
                            setSelectedId(selected.id);
                          }

                          setFlash("Saved descriptor.");
                          setTimeout(() => setFlash(null), 2000);
                        } catch (e: any) {
                          setErr(String(e?.message ?? "Save failed"));
                        } finally {
                          setSavingDescriptor(false);
                        }
                      }}
                      title="Save descriptor"
                    >
                      {savingDescriptor ? "Saving…" : "Save"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="space-y-2">
                      <textarea
                        className="h-28 w-full rounded border bg-transparent p-2 text-sm"
                        value={descriptorTemplate}
                        onChange={(e) => setDescriptorTemplate(e.target.value)}
                        placeholder="e.g. Parry: You may add [MeleePhysicalStrength] to your Physical Protection Score against Melee Attacks which target you."
                      />

                      <div className="flex flex-wrap gap-2">
                        {Array.from(TOKEN_WHITELIST.values()).map((t) => (
                          <button
                            key={t}
                            type="button"
                            className="rounded border px-2 py-1 text-[11px]"
                            onClick={() => setDescriptorTemplate((prev) => `${prev}${t}`)}
                            title={`Insert ${t}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>

                      {isWeaponAttributes && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <div className="text-xs font-medium opacity-80">Requires Range</div>
                            <select
                              className="w-full rounded border bg-transparent p-2 text-sm"
                              value={requiresRange}
                              onChange={(e) => setRequiresRange(e.target.value as any)}
                            >
                              <option value="">None</option>
                              <option value="MELEE">Melee</option>
                              <option value="RANGED">Ranged</option>
                              <option value="AOE">AoE</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <div className="text-xs font-medium opacity-80">Requires AoE Shape</div>
                            <select
                              className="w-full rounded border bg-transparent p-2 text-sm"
                              value={requiresAoeShape}
                              onChange={(e) => setRequiresAoeShape(e.target.value as any)}
                            >
                              <option value="">None</option>
                              <option value="SPHERE">Sphere</option>
                              <option value="CONE">Cone</option>
                              <option value="LINE">Line</option>
                            </select>

                            <div className="pt-2 space-y-2">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={requiresStrengthSource}
                                  onChange={(e) => setRequiresStrengthSource(e.target.checked)}
                                />
                                Requires Strength Source Selection
                              </label>

                              <label className="flex items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={requiresRangeSelection}
                                  onChange={(e) => setRequiresRangeSelection(e.target.checked)}
                                />
                                Requires range selection
                              </label>

                              <div className="pt-2 space-y-1">
                                <div className="text-xs font-medium opacity-80">
                                  Requires Physical or Mental
                                </div>
                                <select
                                  className="w-full rounded border bg-transparent p-2 text-sm"
                                  value={requiresStrengthKind}
                                  onChange={(e) => setRequiresStrengthKind(e.target.value)}
                                >
                                  <option value="">None</option>
                                  <option value="PHYSICAL">Physical</option>
                                  <option value="MENTAL">Mental</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-1">
                        <div className="text-xs font-medium opacity-80">Notes (internal)</div>
                        <textarea
                          className="h-20 w-full rounded border bg-transparent p-2 text-sm"
                          value={descriptorNotes}
                          onChange={(e) => setDescriptorNotes(e.target.value)}
                          placeholder="Internal notes (optional)"
                        />
                      </div>

                      {(() => {
                        const tokens = extractTokens(descriptorTemplate);
                        if (!tokens.length) return null;

                        const unknown = tokens.filter((t) => !TOKEN_WHITELIST.has(t));

                        return (
                          <div className="text-xs">
                            <div className="opacity-70">Tokens found:</div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {tokens.map((t) => (
                                <span
                                  key={t}
                                  className={`rounded border px-2 py-1 text-[11px] ${
                                    unknown.includes(t) ? "border-red-500" : ""
                                  }`}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-medium opacity-80">Preview</div>
                      <div className="rounded border p-2 text-sm whitespace-pre-wrap">
                        {renderTemplatePreview(
                          descriptorTemplate.trim(),
                          category,
                          selectedParsed?.base ?? selected?.name ?? "",
                        ) || (
                          <span className="opacity-70">Nothing to preview.</span>
                        )}
                      </div>
                      <div className="text-[11px] opacity-70">
                        Preview uses sample values (2/1/3/0/2/2).
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Variant table */}
              <div className="rounded border">
                <div className="border-b p-2 text-xs font-medium opacity-80">
                  Variants (same base)
                </div>
                {variants.length === 0 ? (
                  <div className="p-2 text-sm opacity-80">None.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs opacity-70">
                      <tr>
                        <th className="p-2 text-left">Value</th>
                        <th className="p-2 text-left">Tier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {variants.map((v) => {
                        const pv = parseTieredName(v.name);
                        return (
                          <tr key={v.id}>
                            <td className="p-2">{v.name}</td>
                            <td className="p-2">{pv.tier ?? "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Costs table (Option B: full context matrix + inline edit) */}
              {costCategory ? (
                <div className="rounded border">
                  <div className="border-b p-2 text-xs font-medium opacity-80">
                    Costs (full context matrix)
                  </div>

              {costMatrix.length === 0 ? (
                <div className="p-2 space-y-3">
                  <div className="text-sm opacity-80">
                    No cost contexts exist for this category yet. Create the first one below.
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <div className="md:col-span-1">
                      <label className="text-xs opacity-70">Context (selector1)</label>
                      <input
                        className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                        value={bootstrapContext}
                        onChange={(e) => setBootstrapContext(e.target.value)}
                        placeholder="e.g. Armor"
                      />
                    </div>

                    <div className="md:col-span-1">
                      <label className="text-xs opacity-70">Cost</label>
                      <input
                        className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                        value={bootstrapValue}
                        onChange={(e) => setBootstrapValue(e.target.value)}
                        placeholder="e.g. 0"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-xs opacity-70">Notes (optional)</label>
                      <input
                        className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                        value={bootstrapNotes}
                        onChange={(e) => setBootstrapNotes(e.target.value)}
                        placeholder="seed"
                      />
                    </div>
                  </div>

                  <button
                    className="rounded border px-3 py-2 text-sm"
                    disabled={
                      bootstrapping ||
                      !bootstrapContext.trim() ||
                      bootstrapValue.trim() === "" ||
                      !selectedParsed ||
                      !costCategory
                    }
                    onClick={async () => {
                      if (!selectedParsed || !costCategory) return;

                      const ctx = bootstrapContext.trim();
                      const v = Number.parseFloat(bootstrapValue);
                      if (!ctx) return;

                      if (!Number.isFinite(v)) {
                        setErr("Cost must be a number.");
                        return;
                      }

                      setErr(null);
                      setBootstrapping(true);

                      try {
                        const res = await fetch("/api/admin/forge-costs", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            category: costCategory,
                            selector1: isShieldAttributes ? "Shield" : ctx,
                            selector2: selectedParsed.base,
                            selector3: tierStr ?? null,
                            value: v,
                            notes: bootstrapNotes.trim() || null,
                          }),
                        });

                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data?.error ?? "Create failed");

                        setFlash(`Bootstrapped context: ${ctx}`);
                        setTimeout(() => setFlash(null), 2000);

                        setBootstrapContext("");
                        setBootstrapValue("");
                        setBootstrapNotes("");

                        await loadCostsLive();
                      } catch (e: any) {
                        setErr(String(e?.message ?? "Bootstrap failed"));
                      } finally {
                        setBootstrapping(false);
                      }
                    }}
                    title="Create first cost context"
                  >
                    {bootstrapping ? "Creating…" : "Create first context"}
                  </button>

                  <div className="text-xs opacity-70">
                    Tip: Contexts are just labels (selector1). Once one exists, the full matrix appears and you can add more rows normally.
                  </div>
                </div>
              ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs opacity-70">
                        <tr>
                          <th className="p-2 text-left">Context (selector1)</th>
                          <th className="p-2 text-left">Cost</th>
                          <th className="p-2 text-left">Notes</th>
                          <th className="p-2 text-left"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {costMatrix.map(({ context, existing }) => {
                          const edit = costEdits[context] ?? { value: "", notes: "" };
                          const isSaving = savingContext === context;

                          async function save() {
                            if (!selectedParsed) return;

                            const v = Number.parseFloat(edit.value);
                            if (!Number.isFinite(v)) {
                              setErr("Cost must be a number (or leave blank for no row).");
                              return;
                            }

                            setErr(null);
                            setSavingContext(context);

                            try {
                              if (existing) {
                                const res = await fetch("/api/admin/forge-costs", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    id: existing.id,
                                    value: v,
                                    notes: edit.notes.trim() || null,
                                  }),
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data?.error ?? "Update failed");

                                await loadCostsLive();
                                setCosts((prev) =>
                                  prev.map((c) => (c.id === data.row.id ? data.row : c)),
                                );
                                setFlash(
                                  `Saved cost for ${selectedParsed.base}${tierStr ? ` ${tierStr}` : ""} • ${context}`,
                                );
                                setTimeout(() => setFlash(null), 2000);
                              } else {
                                const res = await fetch("/api/admin/forge-costs", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    category: costCategory,
                                    selector1: isShieldAttributes ? "Shield" : context,
                                    selector2: selectedParsed.base,
                                    selector3: tierStr ?? null,
                                    value: v,
                                    notes: edit.notes.trim() || null,
                                  }),
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data?.error ?? "Create failed");

                                await loadCostsLive();
                                setCosts((prev) => [data.row, ...prev]);
                                setFlash(
                                  `Created cost for ${selectedParsed.base}${tierStr ? ` ${tierStr}` : ""} • ${context}`,
                                );
                                setTimeout(() => setFlash(null), 2000);
                              }
                            } catch (e: any) {
                              setErr(String(e?.message ?? "Save failed"));
                            } finally {
                              setSavingContext(null);
                            }
                          }

                          return (
                            <tr key={context}>
                              <td className="p-2">{context}</td>
                              <td className="p-2">
                                <input
                                  className="w-28 rounded border bg-transparent p-2 text-sm"
                                  value={edit.value}
                                  onChange={(e) =>
                                    setCostEdits((prev) => ({
                                      ...prev,
                                      [context]: { ...edit, value: e.target.value },
                                    }))
                                  }
                                  placeholder={existing ? String(existing.value) : ""}
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  className="w-full rounded border bg-transparent p-2 text-sm"
                                  value={edit.notes}
                                  onChange={(e) =>
                                    setCostEdits((prev) => ({
                                      ...prev,
                                      [context]: { ...edit, notes: e.target.value },
                                    }))
                                  }
                                  placeholder="optional"
                                />
                              </td>
                              <td className="p-2">
                                <button
                                  className="rounded border px-3 py-2 text-sm"
                                  disabled={isSaving || edit.value.trim() === ""}
                                  onClick={save}
                                  title={edit.value.trim() === "" ? "Enter a cost to save" : "Save"}
                                >
                                  {existing ? "Save" : "Create"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <div className="rounded border p-3 text-sm opacity-80">
                  No per-value costs for this category.
                  <div className="mt-1 text-xs opacity-70">
                    This category is not currently configured for per-value ForgeCostEntry rows.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
