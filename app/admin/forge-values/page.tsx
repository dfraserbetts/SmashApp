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
  | "DAMAGE_TYPES"
  | "PPV_COSTS"
  | "MPV_COSTS"
  | "ITEM_MODIFIER_COSTS"
  | "GLOBAL_ATTRIBUTE_MODIFIER_COSTS";

type AttributePlacement = "ATTACK" | "GUARD" | "TRAITS" | "GENERAL";
type AttackMode = "PHYSICAL" | "MENTAL";
type StatCostType = "PPV" | "MPV";
type StatCostTarget = "Armor" | "Shield";
type ItemModifierCostStat = "Armor Skill" | "Weapon Skill" | "Willpower" | "Dodge";
type GlobalAttributeCostItemType = "Weapon" | "Armor" | "Shield" | "Item";
type GlobalAttributeCostStat =
  | "Attack"
  | "Guard"
  | "Fortitude"
  | "Intellect"
  | "Synergy"
  | "Bravery";

type ValueRow = {
  id: number;
  name: string;
  tooltip?: string | null;
  attackMode?: AttackMode | null;
  damageTypeIds?: number[] | null;
  descriptorTemplate?: string | null;
  descriptorNotes?: string | null;
  pricingMode?: string | null;
  pricingScalar?: number | null;
  requiresRange?: "MELEE" | "RANGED" | "AOE" | null;
  requiresAoeShape?: "SPHERE" | "CONE" | "LINE" | null;
  requiresPpv?: boolean;
  requiresMpv?: boolean;
  placement?: AttributePlacement | null;
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
const STAT_COST_LEVELS = Array.from({ length: 5 }, (_unused, index) => index + 1);
const ITEM_MODIFIER_COST_LEVELS = [1, 2, 3];
const GLOBAL_ATTRIBUTE_COST_LEVELS = [1, 2, 3, 4, 5];
const GLOBAL_ATTRIBUTE_COST_ITEM_TYPES: GlobalAttributeCostItemType[] = [
  "Weapon",
  "Armor",
  "Shield",
  "Item",
];
const GLOBAL_ATTRIBUTE_COST_STATS_FALLBACK: GlobalAttributeCostStat[] = [
  "Attack",
  "Guard",
  "Fortitude",
  "Intellect",
  "Synergy",
  "Bravery",
];
const WEAPON_ATTRIBUTE_PRICING_MODE_OPTIONS = [
  { value: "", label: "Static ForgeCostEntry rows" },
  { value: "MELEE_PHYSICAL_STRENGTH", label: "Melee Physical Strength" },
  { value: "MELEE_MENTAL_STRENGTH", label: "Melee Mental Strength" },
  { value: "RANGED_PHYSICAL_STRENGTH", label: "Ranged Physical Strength" },
  { value: "RANGED_MENTAL_STRENGTH", label: "Ranged Mental Strength" },
  { value: "AOE_PHYSICAL_STRENGTH", label: "AoE Physical Strength" },
  { value: "AOE_MENTAL_STRENGTH", label: "AoE Mental Strength" },
  { value: "CHOSEN_PHYSICAL_STRENGTH", label: "Chosen Physical Strength" },
  { value: "CHOSEN_MENTAL_STRENGTH", label: "Chosen Mental Strength" },
] as const;
const ITEM_MODIFIER_COST_STATS: ItemModifierCostStat[] = [
  "Armor Skill",
  "Weapon Skill",
  "Willpower",
  "Dodge",
];

function parseTieredName(name: string): { base: string; tier: number | null } {
  const m = name.trim().match(/^(.*)\s(\d+)$/);
  if (!m) return { base: name.trim(), tier: null };
  return { base: (m[1] ?? "").trim(), tier: Number.parseInt(m[2] ?? "", 10) };
}

const AURA_PHYSICAL_REROLL_TEMPLATE =
  "Aura (Physical) [AuraPhysical]: Allies within 10ft may reroll up to [AuraPhysical] failed Physical Defence dice per defence roll.";
const AURA_MENTAL_REROLL_TEMPLATE =
  "Aura (Mental) [AuraMental]: Allies within 10ft may reroll up to [AuraMental] failed Mental Defence dice per defence roll.";

function convertAuraProtectionTemplateToReroll(template: string): string | null {
  const raw = String(template ?? "");
  const normalized = raw.toLowerCase();
  const hasPhysicalToken = raw.includes("[AuraPhysical]");
  const hasMentalToken = raw.includes("[AuraMental]");

  const alreadyPhysicalReroll =
    hasPhysicalToken &&
    normalized.includes(
      "aura (physical) [auraphysical]: allies within 10ft may reroll up to [auraphysical] failed physical defence dice per defence roll.",
    );
  const alreadyMentalReroll =
    hasMentalToken &&
    normalized.includes(
      "aura (mental) [auramental]: allies within 10ft may reroll up to [auramental] failed mental defence dice per defence roll.",
    );

  const mentionsPhysicalProtection =
    /physical\s+protection/i.test(raw) || /\+\s*\[AuraPhysical\]/i.test(raw);
  const mentionsMentalProtection =
    /mental\s+protection/i.test(raw) || /\+\s*\[AuraMental\]/i.test(raw);

  const convertPhysical = hasPhysicalToken && mentionsPhysicalProtection && !alreadyPhysicalReroll;
  const convertMental = hasMentalToken && mentionsMentalProtection && !alreadyMentalReroll;

  if (convertPhysical && convertMental) {
    return `${AURA_PHYSICAL_REROLL_TEMPLATE}\n${AURA_MENTAL_REROLL_TEMPLATE}`;
  }
  if (convertPhysical) return AURA_PHYSICAL_REROLL_TEMPLATE;
  if (convertMental) return AURA_MENTAL_REROLL_TEMPLATE;
  return null;
}

export default function AdminForgeValuesPage() {
  const [category, setCategory] = useState<ForgeValueCategory>("WEAPON_ATTRIBUTES");

  const [rows, setRows] = useState<ValueRow[]>([]);
  const [costs, setCosts] = useState<ForgeCostEntry[]>([]);
  const [damageTypeOptions, setDamageTypeOptions] = useState<Array<{ id: number; name: string }>>(
    [],
  );

  // Admin-backed cost editing (Option B: full context matrix)
  const [costContexts, setCostContexts] = useState<string[]>([]);
  const [costRowsLive, setCostRowsLive] = useState<ForgeCostEntry[]>([]);
  const [costEdits, setCostEdits] = useState<Record<string, { value: string; notes: string }>>(
    {},
  );
  const [savingContext, setSavingContext] = useState<string | null>(null);
  const [deletingStaticCosts, setDeletingStaticCosts] = useState(false);
  // Bootstrap first context (when none exist yet)
  const [bootstrapContext, setBootstrapContext] = useState("");
  const [bootstrapValue, setBootstrapValue] = useState("");
  const [bootstrapNotes, setBootstrapNotes] = useState("");
  const [bootstrapping, setBootstrapping] = useState(false);
  const [statCostType, setStatCostType] = useState<StatCostType>("PPV");
  const [statCostTarget, setStatCostTarget] = useState<StatCostTarget>("Armor");
  const [statCostEdits, setStatCostEdits] = useState<
    Record<number, { value: string; notes: string }>
  >({});
  const [savingStatLevel, setSavingStatLevel] = useState<number | null>(null);
  const [itemModifierCostStat, setItemModifierCostStat] =
    useState<ItemModifierCostStat>("Armor Skill");
  const [itemModifierCostEdits, setItemModifierCostEdits] = useState<
    Record<number, { value: string; notes: string }>
  >({});
  const [savingItemModifierLevel, setSavingItemModifierLevel] = useState<number | null>(null);
  const [globalAttributeCostItemType, setGlobalAttributeCostItemType] =
    useState<GlobalAttributeCostItemType>("Weapon");
  const [globalAttributeCostEdits, setGlobalAttributeCostEdits] = useState<
    Record<number, { value: string; notes: string }>
  >({});
  const [savingGlobalAttributeLevel, setSavingGlobalAttributeLevel] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [q, setQ] = useState("");

  // Create
  const [newValueName, setNewValueName] = useState("");
  const [newDamageTypeAttackMode, setNewDamageTypeAttackMode] = useState<AttackMode>("PHYSICAL");
  const [creatingValue, setCreatingValue] = useState(false);

  // Rename
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [migrateOnRename, setMigrateOnRename] = useState(true);
  const [savingRename, setSavingRename] = useState(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDamageTypeAttackMode, setSelectedDamageTypeAttackMode] =
    useState<AttackMode>("PHYSICAL");
  const [savingDamageTypeAttackMode, setSavingDamageTypeAttackMode] = useState(false);
  const [selectedAttackEffectDamageTypeIds, setSelectedAttackEffectDamageTypeIds] = useState<
    number[]
  >([]);
  const [savingAttackEffectLinks, setSavingAttackEffectLinks] = useState(false);

  // Weapon Attribute descriptor editing (v1)
  const [descriptorTemplate, setDescriptorTemplate] = useState("");
  const [descriptorNotes, setDescriptorNotes] = useState("");
  const [tooltipText, setTooltipText] = useState("");

  const [requiresRange, setRequiresRange] =
    useState<"MELEE" | "RANGED" | "AOE" | "">( "");
  const [requiresAoeShape, setRequiresAoeShape] =
    useState<"SPHERE" | "CONE" | "LINE" | "">( "");
  const [requiresStrengthSource, setRequiresStrengthSource] =
    useState<boolean>(false);
  const [pricingMode, setPricingMode] = useState("");
  const [pricingScalar, setPricingScalar] = useState("");

  const [requiresRangeSelection, setRequiresRangeSelection] =
    useState<boolean>(false);

  const [requiresStrengthKind, setRequiresStrengthKind] = 
    useState<string>("");
  const [requiresPpv, setRequiresPpv] = useState<boolean>(false);
  const [requiresMpv, setRequiresMpv] = useState<boolean>(false);
  const [placement, setPlacement] = useState<AttributePlacement>("TRAITS");

  const [savingDescriptor, setSavingDescriptor] = useState(false);

  const isWeaponAttributes = category === "WEAPON_ATTRIBUTES";
  const isArmorAttributes = category === "ARMOR_ATTRIBUTES";
  const isShieldAttributes = category === "SHIELD_ATTRIBUTES";
  const isDamageTypes = category === "DAMAGE_TYPES";
  const isAttackEffects = category === "ATTACK_EFFECTS";
  const isDefEffects = category === "DEF_EFFECTS";
  const isPpvCosts = category === "PPV_COSTS";
  const isMpvCosts = category === "MPV_COSTS";
  const isItemModifierCosts = category === "ITEM_MODIFIER_COSTS";
  const isGlobalAttributeModifierCosts = category === "GLOBAL_ATTRIBUTE_MODIFIER_COSTS";
  const isStatCostCategory = isPpvCosts || isMpvCosts;
  const isStandaloneCostCategory =
    isStatCostCategory || isItemModifierCosts || isGlobalAttributeModifierCosts;

  useEffect(() => {
    if (isPpvCosts) {
      setStatCostType("PPV");
      return;
    }
    if (isMpvCosts) {
      setStatCostType("MPV");
      return;
    }
    if (isShieldAttributes) {
      setStatCostTarget("Shield");
      return;
    }
    if (isArmorAttributes) {
      setStatCostTarget("Armor");
    }
  }, [isArmorAttributes, isMpvCosts, isPpvCosts, isShieldAttributes]);

  const TOKEN_WHITELIST = useMemo(() => {
    // Weapon Attribute tokens
    if (isWeaponAttributes) {
      return new Set([
        "[ItemName]",
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
        "[ItemName]",
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
    "[ItemName]": "Sample Item",
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
      const valuesEndpoint = isStandaloneCostCategory
        ? null
        : (
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
                      : "/api/admin/damage-types"
        );

      let valueRows: ValueRow[] = [];
      if (valuesEndpoint) {
        const valuesRes = await fetch(valuesEndpoint, { cache: "no-store" });
        const valuesJson = await valuesRes.json();
        if (!valuesRes.ok) {
          throw new Error(valuesJson?.error ?? "Failed to load forge values");
        }
        valueRows = (valuesJson?.rows ?? []) as ValueRow[];
      }

      // 2) Costs (read-only via picklists for now)
      const pickRes = await fetch("/api/forge/picklists", { cache: "no-store" });
      const pickJson = await pickRes.json();
      if (!pickRes.ok) {
        throw new Error(pickJson?.error ?? "Failed to load picklists");
      }

      const allCosts = (pickJson?.costs ?? []) as ForgeCostEntry[];
      const allDamageTypeOptions = Array.isArray(pickJson?.damageTypes)
        ? (pickJson.damageTypes as Array<{ id?: unknown; name?: unknown }>)
            .map((row) => ({
              id:
                typeof row.id === "number"
                  ? row.id
                  : typeof row.id === "string"
                    ? Number.parseInt(row.id, 10)
                    : NaN,
              name: typeof row.name === "string" ? row.name : "",
            }))
            .filter((row) => Number.isFinite(row.id) && row.name.trim().length > 0)
        : [];
      setRows(valueRows);
      setCosts(allCosts);
      setDamageTypeOptions(allDamageTypeOptions);
    } catch (e: any) {
      setErr(String(e?.message ?? "Failed to load"));
      setRows([]);
      setCosts([]);
      setDamageTypeOptions([]);
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
    setNewDamageTypeAttackMode("PHYSICAL");
    setSelectedAttackEffectDamageTypeIds([]);
    cancelRename();
    setErr(null);
    setFlash(null);
    setBootstrapContext("");
    setBootstrapValue("");
    setBootstrapNotes("");
    setStatCostType(category === "MPV_COSTS" ? "MPV" : "PPV");
    setSavingStatLevel(null);

    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  async function createValue() {
    setErr(null);
    const name = newValueName.trim();
    if (!name) return;
    if (isStatCostCategory) return;

    try {
      setCreatingValue(true);
      const valuesEndpoint = isStatCostCategory
        ? null
        : (
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
                      : "/api/admin/damage-types"
        );
      if (!valuesEndpoint) return;

      const payload = isDamageTypes
        ? { name, attackMode: newDamageTypeAttackMode }
        : { name };

      const res = await fetch(valuesEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        setNewDamageTypeAttackMode("PHYSICAL");
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

  async function saveDamageTypeAttackMode() {
    if (!selected || !isDamageTypes) return;

    setErr(null);
    try {
      setSavingDamageTypeAttackMode(true);

      const res = await fetch("/api/admin/damage-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          name: selected.name,
          attackMode: selectedDamageTypeAttackMode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Save failed");

      if (data?.row?.id) {
        setRows((prev) => prev.map((r) => (r.id === data.row.id ? data.row : r)));
      } else {
        await loadAll();
        setSelectedId(selected.id);
      }

      setFlash("Saved damage type mode.");
      setTimeout(() => setFlash(null), 2000);
    } catch (e: any) {
      setErr(String(e?.message ?? "Save failed"));
    } finally {
      setSavingDamageTypeAttackMode(false);
    }
  }

  function toggleSelectedAttackEffectDamageType(damageTypeId: number) {
    setSelectedAttackEffectDamageTypeIds((prev) =>
      prev.includes(damageTypeId)
        ? prev.filter((id) => id !== damageTypeId)
        : [...prev, damageTypeId],
    );
  }

  async function saveAttackEffectLinks() {
    if (!selected || !isAttackEffects) return;

    setErr(null);
    try {
      setSavingAttackEffectLinks(true);

      const res = await fetch("/api/admin/attack-effects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          name: selected.name,
          tooltip: tooltipText.trim() || null,
          damageTypeIds: selectedAttackEffectDamageTypeIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Save failed");

      if (data?.row?.id) {
        setRows((prev) => prev.map((r) => (r.id === data.row.id ? data.row : r)));
      } else {
        await loadAll();
        setSelectedId(selected.id);
      }

      setFlash("Saved attack effect links.");
      setTimeout(() => setFlash(null), 2000);
    } catch (e: any) {
      setErr(String(e?.message ?? "Save failed"));
    } finally {
      setSavingAttackEffectLinks(false);
    }
  }

  async function saveDefEffectTooltip() {
    if (!selected || !isDefEffects) return;

    setErr(null);
    try {
      const res = await fetch("/api/admin/def-effects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          name: selected.name,
          tooltip: tooltipText.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Save failed");

      if (data?.row?.id) {
        setRows((prev) => prev.map((r) => (r.id === data.row.id ? data.row : r)));
      } else {
        await loadAll();
        setSelectedId(selected.id);
      }

      setFlash("Saved tooltip.");
      setTimeout(() => setFlash(null), 2000);
    } catch (e: any) {
      setErr(String(e?.message ?? "Save failed"));
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
      setTooltipText("");
      setSelectedDamageTypeAttackMode("PHYSICAL");
      setSelectedAttackEffectDamageTypeIds([]);
      setRequiresRange("");
      setRequiresAoeShape("");
      setRequiresRangeSelection(false);
      setRequiresStrengthKind("");
      setPricingMode("");
      setPricingScalar("");
      setRequiresPpv(false);
      setRequiresMpv(false);
      setPlacement("TRAITS");
      return;
    }

    setDescriptorTemplate(String(selected.descriptorTemplate ?? ""));
    setDescriptorNotes(String(selected.descriptorNotes ?? ""));
    setTooltipText(String(selected.tooltip ?? ""));
    setSelectedDamageTypeAttackMode(selected.attackMode === "MENTAL" ? "MENTAL" : "PHYSICAL");
    setSelectedAttackEffectDamageTypeIds(
      Array.isArray(selected.damageTypeIds)
        ? selected.damageTypeIds
            .map((id) =>
              typeof id === "number"
                ? id
                : typeof id === "string"
                  ? Number.parseInt(id, 10)
                  : NaN,
            )
            .filter((id) => Number.isFinite(id))
        : [],
    );
    setRequiresRange((selected.requiresRange as any) ?? "");
    setRequiresAoeShape((selected.requiresAoeShape as any) ?? "");
    setRequiresStrengthSource(!!(selected as any).requiresStrengthSource);
    setRequiresRangeSelection(!!(selected as any).requiresRangeSelection);
    setRequiresStrengthKind((selected as any).requiresStrengthKind ?? "");
    setPricingMode(String((selected as any).pricingMode ?? ""));
    setPricingScalar(
      (selected as any).pricingScalar === null || (selected as any).pricingScalar === undefined
        ? ""
        : String((selected as any).pricingScalar),
    );
    setRequiresPpv(Boolean((selected as any).requiresPpv));
    setRequiresMpv(Boolean((selected as any).requiresMpv));
    const rawPlacement = String(selected.placement ?? "").toUpperCase();
    setPlacement(
      rawPlacement === "ATTACK" ||
        rawPlacement === "GUARD" ||
        rawPlacement === "TRAITS" ||
        rawPlacement === "GENERAL"
        ? (rawPlacement as AttributePlacement)
        : rawPlacement === "DEFENCE"
          ? "GUARD"
          : "TRAITS",
    );
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

  const fixedCostContext = useMemo(() => {
    if (isWeaponAttributes) return "Weapon";
    if (isShieldAttributes) return "Shield";
    return null;
  }, [isShieldAttributes, isWeaponAttributes]);

  const isDynamicWeaponPricingActive = useMemo(
    () => isWeaponAttributes && pricingMode.trim().length > 0,
    [isWeaponAttributes, pricingMode],
  );

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

      const filteredContexts = fixedCostContext
        ? [fixedCostContext]
        : contexts;

      setCostContexts(filteredContexts);
      setCostRowsLive(rows);

      // Initialize edit buffers for every context (Option B matrix)
      const nextEdits: Record<string, { value: string; notes: string }> = {};
      for (const ctx of filteredContexts) {
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
  }, [costCategory, fixedCostContext, selectedParsed?.base, tierStr]);

  const costMatrix = useMemo(() => {
    if (!selectedParsed) return [];
    const visibleRows = fixedCostContext
      ? costRowsLive.filter((row) => String(row.selector1 ?? "").trim() === fixedCostContext)
      : costRowsLive;
    return costContexts.map((ctx) => {
      const existing = visibleRows.find((r) => r.selector1 === ctx) ?? null;
      return { context: ctx, existing };
    });
  }, [costContexts, costRowsLive, fixedCostContext, selectedParsed]);
  const hasStaticCostRows = costRowsLive.length > 0;
  const statCostEntryByLevel = useMemo(() => {
    const out = new Map<number, ForgeCostEntry>();
    for (const row of costs) {
      if (String(row.category ?? "").trim().toLowerCase() !== "stat") continue;
      if (String(row.selector1 ?? "").trim().toUpperCase() !== statCostType) continue;
      if (String(row.selector2 ?? "").trim().toLowerCase() !== statCostTarget.toLowerCase()) continue;

      const level = Number.parseInt(String(row.selector3 ?? ""), 10);
      if (!Number.isFinite(level) || level < 1 || level > 10) continue;
      out.set(level, row);
    }
    return out;
  }, [costs, statCostTarget, statCostType]);
  const itemModifierCostEntryByLevel = useMemo(() => {
    const out = new Map<number, ForgeCostEntry>();
    for (const row of costs) {
      if (String(row.category ?? "").trim().toLowerCase() !== "itemmodifiers") continue;
      if (String(row.selector1 ?? "").trim() !== itemModifierCostStat) continue;
      if (String(row.selector2 ?? "").trim().length > 0) continue;

      const level = Number.parseInt(String(row.selector3 ?? ""), 10);
      if (!Number.isFinite(level) || level < 1 || level > 3) continue;
      out.set(level, row);
    }
    return out;
  }, [costs, itemModifierCostStat]);
  const globalAttributeCostEntryByLevel = useMemo(() => {
    const out = new Map<number, ForgeCostEntry>();
    for (const row of costs) {
      if (String(row.category ?? "").trim().toLowerCase() !== "attribute") continue;
      if (String(row.selector1 ?? "").trim() !== globalAttributeCostItemType) continue;
      const stat = String(row.selector2 ?? "").trim();
      if (!GLOBAL_ATTRIBUTE_COST_STATS_FALLBACK.includes(stat as GlobalAttributeCostStat)) continue;
      const level = Number.parseInt(String(row.selector3 ?? ""), 10);
      if (!Number.isFinite(level) || level < 1 || level > 5) continue;
      if (!out.has(level)) {
        out.set(level, row);
      }
    }
    return out;
  }, [costs, globalAttributeCostItemType]);

  useEffect(() => {
    const next: Record<number, { value: string; notes: string }> = {};
    for (const level of STAT_COST_LEVELS) {
      const existing = statCostEntryByLevel.get(level) ?? null;
      next[level] = {
        value: existing ? String(existing.value) : "",
        notes: existing?.notes ?? "",
      };
    }
    setStatCostEdits(next);
  }, [statCostEntryByLevel]);
  useEffect(() => {
    const next: Record<number, { value: string; notes: string }> = {};
    for (const level of ITEM_MODIFIER_COST_LEVELS) {
      const existing = itemModifierCostEntryByLevel.get(level) ?? null;
      next[level] = {
        value: existing ? String(existing.value) : "",
        notes: existing?.notes ?? "",
      };
    }
    setItemModifierCostEdits(next);
  }, [itemModifierCostEntryByLevel]);
  useEffect(() => {
    const next: Record<number, { value: string; notes: string }> = {};
    for (const level of GLOBAL_ATTRIBUTE_COST_LEVELS) {
      const existing = globalAttributeCostEntryByLevel.get(level) ?? null;
      next[level] = {
        value: existing ? String(existing.value) : "",
        notes: existing?.notes ?? "",
      };
    }
    setGlobalAttributeCostEdits(next);
  }, [globalAttributeCostEntryByLevel]);

  async function saveStatCost(level: number) {
    const edit = statCostEdits[level] ?? { value: "", notes: "" };
    const parsedValue = Number.parseFloat(edit.value);
    if (!Number.isFinite(parsedValue)) {
      setErr("Cost must be a number.");
      return;
    }

    setErr(null);
    setSavingStatLevel(level);

    try {
      const existing = statCostEntryByLevel.get(level) ?? null;

      if (existing) {
        const res = await fetch("/api/admin/forge-costs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: existing.id,
            value: parsedValue,
            notes: edit.notes.trim() || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Update failed");

        const savedRow = data?.row as ForgeCostEntry | undefined;
        if (savedRow?.id) {
          setCosts((prev) => prev.map((row) => (row.id === savedRow.id ? savedRow : row)));
        }
      } else {
        const res = await fetch("/api/admin/forge-costs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: "Stat",
            selector1: statCostType,
            selector2: statCostTarget,
            selector3: String(level),
            value: parsedValue,
            notes: edit.notes.trim() || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Create failed");

        const savedRow = data?.row as ForgeCostEntry | undefined;
        if (savedRow?.id) {
          setCosts((prev) => {
            if (prev.some((row) => row.id === savedRow.id)) {
              return prev.map((row) => (row.id === savedRow.id ? savedRow : row));
            }
            return [savedRow, ...prev];
          });
        }
      }

      setFlash(`Saved ${statCostType} ${statCostTarget} value ${level}.`);
      setTimeout(() => setFlash(null), 2000);
    } catch (e: any) {
      setErr(String(e?.message ?? "Save failed"));
    } finally {
      setSavingStatLevel(null);
    }
  }

  async function saveItemModifierCost(level: number) {
    const edit = itemModifierCostEdits[level] ?? { value: "", notes: "" };
    const parsedValue = Number.parseFloat(edit.value);
    if (!Number.isFinite(parsedValue)) {
      setErr("Cost must be a number.");
      return;
    }

    setErr(null);
    setSavingItemModifierLevel(level);

    try {
      const existing = itemModifierCostEntryByLevel.get(level) ?? null;

      if (existing) {
        const res = await fetch("/api/admin/forge-costs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: existing.id,
            value: parsedValue,
            notes: edit.notes.trim() || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Update failed");

        const savedRow = data?.row as ForgeCostEntry | undefined;
        if (savedRow?.id) {
          setCosts((prev) => prev.map((row) => (row.id === savedRow.id ? savedRow : row)));
        }
      } else {
        const res = await fetch("/api/admin/forge-costs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: "ItemModifiers",
            selector1: itemModifierCostStat,
            selector3: String(level),
            value: parsedValue,
            notes: edit.notes.trim() || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Create failed");

        const savedRow = data?.row as ForgeCostEntry | undefined;
        if (savedRow?.id) {
          setCosts((prev) => {
            if (prev.some((row) => row.id === savedRow.id)) {
              return prev.map((row) => (row.id === savedRow.id ? savedRow : row));
            }
            return [savedRow, ...prev];
          });
        }
      }

      setFlash(`Saved ${itemModifierCostStat} value ${level}.`);
      setTimeout(() => setFlash(null), 2000);
    } catch (e: any) {
      setErr(String(e?.message ?? "Save failed"));
    } finally {
      setSavingItemModifierLevel(null);
    }
  }

  async function saveGlobalAttributeCost(level: number) {
    const edit = globalAttributeCostEdits[level] ?? { value: "", notes: "" };
    const parsedValue = Number.parseFloat(edit.value);
    if (!Number.isFinite(parsedValue)) {
      setErr("Cost must be a number.");
      return;
    }

    setErr(null);
    setSavingGlobalAttributeLevel(level);

    try {
      const nextCosts = [...costs];

      for (const stat of GLOBAL_ATTRIBUTE_COST_STATS_FALLBACK) {
        const existing =
          costs.find(
            (row) =>
              String(row.category ?? "").trim().toLowerCase() === "attribute" &&
              String(row.selector1 ?? "").trim() === globalAttributeCostItemType &&
              String(row.selector2 ?? "").trim() === stat &&
              String(row.selector3 ?? "").trim() === String(level),
          ) ?? null;

        if (existing) {
          const res = await fetch("/api/admin/forge-costs", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: existing.id,
              value: parsedValue,
              notes: edit.notes.trim() || null,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error ?? "Update failed");

          const savedRow = data?.row as ForgeCostEntry | undefined;
          if (savedRow?.id) {
            const idx = nextCosts.findIndex((row) => row.id === savedRow.id);
            if (idx >= 0) nextCosts[idx] = savedRow;
          }
        } else {
          const res = await fetch("/api/admin/forge-costs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category: "Attribute",
              selector1: globalAttributeCostItemType,
              selector2: stat,
              selector3: String(level),
              value: parsedValue,
              notes: edit.notes.trim() || null,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error ?? "Create failed");

          const savedRow = data?.row as ForgeCostEntry | undefined;
          if (savedRow?.id) {
            nextCosts.unshift(savedRow);
          }
        }
      }

      setCosts(nextCosts);
      setFlash(`Saved ${globalAttributeCostItemType} global attribute cost for magnitude ${level}.`);
      setTimeout(() => setFlash(null), 2000);
    } catch (e: any) {
      setErr(String(e?.message ?? "Save failed"));
    } finally {
      setSavingGlobalAttributeLevel(null);
    }
  }


  return (
    <div className="space-y-6">
      <a className="text-sm underline" href="/admin">
        ← Back to Admin Dashboard
      </a>
      <div className="flex items-end gap-3">
        <div>
          <label className="text-sm">Category</label>
          <select
            className="mt-1 rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100"
            style={{ colorScheme: "dark" }}
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
          <option value="PPV_COSTS">PPV Costs</option>
          <option value="MPV_COSTS">MPV Costs</option>
          <option value="ITEM_MODIFIER_COSTS">Item Modifiers</option>
          <option value="GLOBAL_ATTRIBUTE_MODIFIER_COSTS">Global Attribute Modifiers</option>
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
          placeholder={isStandaloneCostCategory ? "Not used for standalone costs" : "e.g. Brutal 1"}
          disabled={isStandaloneCostCategory}
        />
      </div>
      {isDamageTypes && (
        <div className="w-[180px]">
          <label className="text-sm">Attack Mode</label>
          <select
            className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
            value={newDamageTypeAttackMode}
            onChange={(e) => setNewDamageTypeAttackMode(e.target.value as AttackMode)}
          >
            <option value="PHYSICAL">Physical</option>
            <option value="MENTAL">Mental</option>
          </select>
        </div>
      )}

      <button
        className="rounded border px-4 py-2 text-sm"
        onClick={createValue}
        disabled={isStandaloneCostCategory || !newValueName.trim() || creatingValue}
        title={isStandaloneCostCategory ? "Use the cost editor below" : !newValueName.trim() ? "Enter a name" : "Create"}
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div>{r.name}</div>
                        {r.tooltip ? (
                          <div className="truncate text-[11px] opacity-60">
                            {r.tooltip}
                          </div>
                        ) : null}
                      </div>
                      {isDamageTypes && (
                        <span className="rounded border px-2 py-0.5 text-[10px] uppercase opacity-80">
                          {r.attackMode === "MENTAL" ? "mental" : "physical"}
                        </span>
                      )}
                    </div>
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
              {isStatCostCategory
                ? "PPV/MPV stat costs are edited below."
                : "Select a value on the left."}
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

              {isDamageTypes && (
                <div className="rounded border p-3 space-y-2">
                  <div className="text-sm font-medium">Damage Type Mode</div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-[220px]">
                      <label className="text-xs opacity-80">Attack Mode</label>
                      <select
                        className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                        value={selectedDamageTypeAttackMode}
                        onChange={(e) =>
                          setSelectedDamageTypeAttackMode(e.target.value as AttackMode)
                        }
                        disabled={savingDamageTypeAttackMode}
                      >
                        <option value="PHYSICAL">Physical</option>
                        <option value="MENTAL">Mental</option>
                      </select>
                    </div>
                    <button
                      className="rounded border px-3 py-2 text-sm"
                      onClick={saveDamageTypeAttackMode}
                      disabled={savingDamageTypeAttackMode}
                    >
                      {savingDamageTypeAttackMode ? "Saving..." : "Save Mode"}
                    </button>
                  </div>
                </div>
              )}

              {isAttackEffects && (
                <div className="rounded border p-3 space-y-3">
                  <div>
                    <div className="text-sm font-medium">Linked Damage Types</div>
                    <div className="text-xs opacity-70">
                      Only linked effects appear when those damage types are selected.
                    </div>
                  </div>

                  {damageTypeOptions.length === 0 ? (
                    <div className="text-sm opacity-80">No damage types available.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {damageTypeOptions.map((dt) => {
                        const linked = selectedAttackEffectDamageTypeIds.includes(dt.id);
                        return (
                          <button
                            key={dt.id}
                            type="button"
                            className={`rounded-full border px-3 py-1 text-xs ${
                              linked ? "bg-zinc-800" : ""
                            }`}
                            onClick={() => toggleSelectedAttackEffectDamageType(dt.id)}
                            disabled={savingAttackEffectLinks}
                            title={linked ? "Unlink" : "Link"}
                          >
                            {dt.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button
                    className="rounded border px-3 py-2 text-sm"
                    onClick={saveAttackEffectLinks}
                    disabled={savingAttackEffectLinks}
                  >
                    {savingAttackEffectLinks ? "Saving..." : "Save"}
                  </button>

                  <div className="space-y-1">
                    <label className="text-xs opacity-80">Tooltip</label>
                    <textarea
                      className="min-h-20 w-full rounded border bg-transparent p-2 text-sm"
                      value={tooltipText}
                      onChange={(e) => setTooltipText(e.target.value)}
                      placeholder="Short hover tooltip for this Greater Success effect."
                    />
                  </div>
                </div>
              )}

              {isDefEffects && (
                <div className="rounded border p-3 space-y-3">
                  <div className="text-sm font-medium">Tooltip</div>
                  <textarea
                    className="min-h-20 w-full rounded border bg-transparent p-2 text-sm"
                    value={tooltipText}
                    onChange={(e) => setTooltipText(e.target.value)}
                    placeholder="Short hover tooltip for this Greater Success effect."
                  />
                  <button
                    className="rounded border px-3 py-2 text-sm"
                    onClick={saveDefEffectTooltip}
                  >
                    Save Tooltip
                  </button>
                </div>
              )}

              {(isWeaponAttributes || isArmorAttributes || isShieldAttributes) && (
                <div className="rounded border p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Descriptor Template</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="rounded border px-3 py-2 text-sm"
                        type="button"
                        disabled={savingDescriptor || !selected}
                        onClick={() => {
                          if (!selected) return;
                          const converted = convertAuraProtectionTemplateToReroll(descriptorTemplate);
                          if (!converted) {
                            setFlash("No Aura Protection pattern found.");
                            setTimeout(() => setFlash(null), 2000);
                            return;
                          }
                          setDescriptorTemplate(converted);
                          setFlash("Converted Aura template to reroll format.");
                          setTimeout(() => setFlash(null), 2000);
                        }}
                        title="Convert aura protection descriptors to reroll format"
                      >
                        Convert Aura to Reroll
                      </button>
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
                              tooltip: tooltipText.trim() || null,
                              descriptorTemplate,
                              descriptorNotes,
                              placement,
                            };

                            // Weapon attributes support range/shape/source gating.
                            if (isWeaponAttributes) {
                              payload.requiresRange = requiresRange || null;
                              payload.requiresAoeShape = requiresAoeShape || null;
                              payload.requiresStrengthSource = requiresStrengthSource;
                              payload.requiresRangeSelection = requiresRangeSelection;
                              payload.requiresStrengthKind = requiresStrengthKind || null;
                              payload.pricingMode = pricingMode || null;
                              payload.pricingScalar =
                                pricingScalar.trim().length > 0
                                  ? Number(pricingScalar)
                                  : null;
                            }
                            // Armor attributes support PV gating.
                            if (isArmorAttributes) {
                              payload.requiresPpv = requiresPpv;
                              payload.requiresMpv = requiresMpv;
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

                              <div className="pt-2 space-y-1">
                                <div className="text-xs font-medium opacity-80">
                                  Dynamic Cost Basis
                                </div>
                                <select
                                  className="w-full rounded border bg-transparent p-2 text-sm"
                                  value={pricingMode}
                                  onChange={(e) => setPricingMode(e.target.value)}
                                >
                                  {WEAPON_ATTRIBUTE_PRICING_MODE_OPTIONS.map((option) => (
                                    <option key={option.value || "STATIC"} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <p className="text-[11px] opacity-70">
                                  If set, Forge cost becomes Pricing Scalar multiplied by the selected live strength value instead of using static ForgeCostEntry rows.
                                </p>
                              </div>

                              <div className="space-y-1">
                                <div className="text-xs font-medium opacity-80">Pricing Scalar</div>
                                <input
                                  className="w-full rounded border bg-transparent p-2 text-sm"
                                  value={pricingScalar}
                                  onChange={(e) => setPricingScalar(e.target.value)}
                                  placeholder="e.g. 1"
                                  inputMode="decimal"
                                />
                                <p className="text-[11px] opacity-70">
                                  Example: scalar 2 with Melee Physical Strength prices the attribute as 2 x current Melee Physical Strength.
                                </p>
                              </div>

                              {isDynamicWeaponPricingActive && (
                                <div className="rounded border border-amber-600/50 bg-amber-950/30 p-3 text-xs text-amber-100">
                                  Dynamic pricing is active for this weapon attribute. Forge ignores static `ForgeCostEntry` rows while this mode is set and uses `Pricing Scalar x selected live strength` instead.
                                  Context selectors do not change the scalar behavior. Weapon attributes resolve on the `Weapon` context only, so any old non-`Weapon` rows are legacy static data.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {isArmorAttributes && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={requiresPpv}
                              onChange={(e) => setRequiresPpv(e.target.checked)}
                            />
                            Requires PPV
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={requiresMpv}
                              onChange={(e) => setRequiresMpv(e.target.checked)}
                            />
                            Requires MPV
                          </label>
                        </div>
                      )}

                      <div className="space-y-1">
                        <div className="text-xs font-medium opacity-80">Placement</div>
                        <select
                          className="w-full rounded border bg-transparent p-2 text-sm"
                          value={placement}
                          onChange={(e) => setPlacement(e.target.value as AttributePlacement)}
                        >
                          <option value="ATTACK">Attack</option>
                          <option value="GUARD">Guard</option>
                          <option value="TRAITS">Traits</option>
                          <option value="GENERAL">General</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-medium opacity-80">Tooltip</div>
                        <textarea
                          className="h-20 w-full rounded border bg-transparent p-2 text-sm"
                          value={tooltipText}
                          onChange={(e) => setTooltipText(e.target.value)}
                          placeholder="Short hover tooltip shown in Forge."
                        />
                      </div>

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
                    {isDynamicWeaponPricingActive
                      ? "Static Costs (inactive while dynamic pricing is enabled)"
                      : fixedCostContext
                        ? `Costs (${fixedCostContext} context)`
                        : "Costs (full context matrix)"}
                  </div>

              {isDynamicWeaponPricingActive ? (
                <div className="space-y-3 p-3">
                  <div className="text-sm opacity-80">
                    This attribute currently uses dynamic pricing, so the Forge does not read static cost rows for it.
                  </div>

                  <div className="rounded border border-zinc-800 p-3 text-sm">
                    <div>
                      Active rule: <span className="font-medium">{pricingScalar.trim() || "0"}</span> x{" "}
                      <span className="font-medium">
                        {WEAPON_ATTRIBUTE_PRICING_MODE_OPTIONS.find((option) => option.value === pricingMode)?.label ?? pricingMode}
                      </span>
                    </div>
                    <div className="mt-2 text-xs opacity-70">
                      Selector contexts such as `Weapon` or `Shield` do not participate in this calculation. Dynamic weapon-attribute pricing uses the authored scalar plus the chosen live strength basis only.
                    </div>
                  </div>

                  {hasStaticCostRows ? (
                    <div className="space-y-3">
                      <div className="text-sm opacity-80">
                        Legacy static rows still stored for this attribute:
                      </div>
                      <table className="w-full text-sm">
                        <thead className="text-xs opacity-70">
                          <tr>
                            <th className="p-2 text-left">Context</th>
                            <th className="p-2 text-left">Cost</th>
                            <th className="p-2 text-left">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {costRowsLive.map((row) => (
                            <tr key={row.id}>
                              <td className="p-2">{row.selector1}</td>
                              <td className="p-2">{row.value}</td>
                              <td className="p-2">{row.notes ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <button
                        className="rounded border px-3 py-2 text-sm"
                        disabled={deletingStaticCosts}
                        onClick={async () => {
                          if (costRowsLive.length === 0) return;
                          setErr(null);
                          setDeletingStaticCosts(true);
                          try {
                            const res = await fetch("/api/admin/forge-costs", {
                              method: "DELETE",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ ids: costRowsLive.map((row) => row.id) }),
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(data?.error ?? "Delete failed");
                            await loadCostsLive();
                            setFlash("Removed inactive static cost rows.");
                            setTimeout(() => setFlash(null), 2000);
                          } catch (e: any) {
                            setErr(String(e?.message ?? "Delete failed"));
                          } finally {
                            setDeletingStaticCosts(false);
                          }
                        }}
                      >
                        {deletingStaticCosts ? "Removing..." : "Delete inactive static rows"}
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm opacity-70">
                      No legacy static rows are stored for this attribute.
                    </div>
                  )}
                </div>
              ) : costMatrix.length === 0 ? (
                <div className="p-2 space-y-3">
                  <div className="text-sm opacity-80">
                    {fixedCostContext
                      ? `No ${fixedCostContext} cost row exists for this value yet. Create it below.`
                      : "No cost contexts exist for this category yet. Create the first one below."}
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <div className="md:col-span-1">
                      <label className="text-xs opacity-70">Context (selector1)</label>
                      {fixedCostContext ? (
                        <div className="mt-1 rounded border border-zinc-800 bg-zinc-950/60 p-2 text-sm">
                          {fixedCostContext}
                        </div>
                      ) : (
                        <input
                          className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                          value={bootstrapContext}
                          onChange={(e) => setBootstrapContext(e.target.value)}
                          placeholder="e.g. Armor"
                        />
                      )}
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
                      (!(fixedCostContext ?? bootstrapContext.trim())) ||
                      bootstrapValue.trim() === "" ||
                      !selectedParsed ||
                      !costCategory
                    }
                    onClick={async () => {
                      if (!selectedParsed || !costCategory) return;

                      const ctx = fixedCostContext ?? bootstrapContext.trim();
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
                            selector1: fixedCostContext ?? ctx,
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
                    {fixedCostContext
                      ? `This category uses a fixed ${fixedCostContext} selector1 value in ForgeCostEntry.`
                      : "Tip: Contexts are just labels (selector1). Once one exists, the full matrix appears and you can add more rows normally."}
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
                                    selector1: fixedCostContext ?? context,
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

        {isStatCostCategory && (
          <div className="rounded-lg border lg:col-span-2">
            <div className="border-b p-3 text-sm font-medium">
              {statCostType} Costs
            </div>

            <div className="space-y-3 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs opacity-70">Stat (selector1)</label>
                  <select
                    className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                    value={statCostType}
                    onChange={(e) => setStatCostType(e.target.value as StatCostType)}
                  >
                    <option value="PPV">PPV</option>
                    <option value="MPV">MPV</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs opacity-70">Item Type (selector2)</label>
                  <select
                    className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                    value={statCostTarget}
                    onChange={(e) => setStatCostTarget(e.target.value as StatCostTarget)}
                  >
                    <option value="Armor">Armor</option>
                    <option value="Shield">Shield</option>
                  </select>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead className="text-xs opacity-70">
                  <tr>
                    <th className="p-2 text-left">Value (selector3)</th>
                    <th className="p-2 text-left">Cost</th>
                    <th className="p-2 text-left">Notes</th>
                    <th className="p-2 text-left"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {STAT_COST_LEVELS.map((level) => {
                    const existing = statCostEntryByLevel.get(level) ?? null;
                    const edit = statCostEdits[level] ?? { value: "", notes: "" };
                    const isSaving = savingStatLevel === level;

                    return (
                      <tr key={`${statCostType}-${statCostTarget}-${level}-standalone`}>
                        <td className="p-2">{level}</td>
                        <td className="p-2">
                          <input
                            className="w-28 rounded border bg-transparent p-2 text-sm"
                            value={edit.value}
                            onChange={(e) =>
                              setStatCostEdits((prev) => ({
                                ...prev,
                                [level]: { ...edit, value: e.target.value },
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
                              setStatCostEdits((prev) => ({
                                ...prev,
                                [level]: { ...edit, notes: e.target.value },
                              }))
                            }
                            placeholder="optional"
                          />
                        </td>
                        <td className="p-2">
                          <button
                            className="rounded border px-3 py-2 text-sm"
                            disabled={isSaving || edit.value.trim() === ""}
                            onClick={() => void saveStatCost(level)}
                            title={edit.value.trim() === "" ? "Enter a cost to save" : "Save"}
                          >
                            {isSaving ? "Saving..." : existing ? "Save" : "Create"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {isItemModifierCosts && (
          <div className="rounded-lg border lg:col-span-2">
            <div className="border-b p-3 text-sm font-medium">
              Item Modifier Costs
            </div>

            <div className="space-y-3 p-3">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs opacity-70">Modifier (selector1)</label>
                  <select
                    className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                    value={itemModifierCostStat}
                    onChange={(e) => setItemModifierCostStat(e.target.value as ItemModifierCostStat)}
                  >
                    {ITEM_MODIFIER_COST_STATS.map((stat) => (
                      <option key={stat} value={stat}>
                        {stat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-xs opacity-70">
                These are base modifier costs. Item location is applied later through the Forge item
                location multiplier, not stored as a separate cost row here.
              </div>

              <table className="w-full text-sm">
                <thead className="text-xs opacity-70">
                  <tr>
                    <th className="p-2 text-left">Value (selector3)</th>
                    <th className="p-2 text-left">Cost</th>
                    <th className="p-2 text-left">Notes</th>
                    <th className="p-2 text-left"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ITEM_MODIFIER_COST_LEVELS.map((level) => {
                    const existing = itemModifierCostEntryByLevel.get(level) ?? null;
                    const edit = itemModifierCostEdits[level] ?? { value: "", notes: "" };
                    const isSaving = savingItemModifierLevel === level;

                    return (
                      <tr key={`${itemModifierCostStat}-${level}-standalone`}>
                        <td className="p-2">{level}</td>
                        <td className="p-2">
                          <input
                            className="w-28 rounded border bg-transparent p-2 text-sm"
                            value={edit.value}
                            onChange={(e) =>
                              setItemModifierCostEdits((prev) => ({
                                ...prev,
                                [level]: { ...edit, value: e.target.value },
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
                              setItemModifierCostEdits((prev) => ({
                                ...prev,
                                [level]: { ...edit, notes: e.target.value },
                              }))
                            }
                            placeholder="optional"
                          />
                        </td>
                        <td className="p-2">
                          <button
                            className="rounded border px-3 py-2 text-sm"
                            disabled={isSaving || edit.value.trim() === ""}
                            onClick={() => void saveItemModifierCost(level)}
                          >
                            {existing ? "Save" : "Create"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {isGlobalAttributeModifierCosts && (
          <div className="rounded-lg border lg:col-span-2">
            <div className="border-b p-3 text-sm font-medium">
              Global Attribute Modifier Costs
            </div>

            <div className="space-y-3 p-3">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs opacity-70">Item Type (selector1)</label>
                  <select
                    className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                    value={globalAttributeCostItemType}
                    onChange={(e) =>
                      setGlobalAttributeCostItemType(e.target.value as GlobalAttributeCostItemType)
                    }
                  >
                    {GLOBAL_ATTRIBUTE_COST_ITEM_TYPES.map((itemType) => (
                      <option key={itemType} value={itemType}>
                        {itemType}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-xs opacity-70">
                Saving a magnitude here applies the same exact cost to all six matching attributes
                for the selected item type.
              </div>

              <table className="w-full text-sm">
                <thead className="text-xs opacity-70">
                  <tr>
                    <th className="p-2 text-left">Magnitude (selector3)</th>
                    <th className="p-2 text-left">Cost</th>
                    <th className="p-2 text-left">Notes</th>
                    <th className="p-2 text-left"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {GLOBAL_ATTRIBUTE_COST_LEVELS.map((level) => {
                    const existing = globalAttributeCostEntryByLevel.get(level) ?? null;
                    const edit = globalAttributeCostEdits[level] ?? { value: "", notes: "" };
                    const isSaving = savingGlobalAttributeLevel === level;

                    return (
                      <tr key={`${globalAttributeCostItemType}-${level}`}>
                        <td className="p-2">{level}</td>
                        <td className="p-2">
                          <input
                            className="w-28 rounded border bg-transparent p-2 text-sm"
                            value={edit.value}
                            onChange={(e) =>
                              setGlobalAttributeCostEdits((prev) => ({
                                ...prev,
                                [level]: { ...edit, value: e.target.value },
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
                              setGlobalAttributeCostEdits((prev) => ({
                                ...prev,
                                [level]: { ...edit, notes: e.target.value },
                              }))
                            }
                            placeholder="optional"
                          />
                        </td>
                        <td className="p-2">
                          <button
                            className="rounded border px-3 py-2 text-sm"
                            disabled={isSaving || edit.value.trim() === ""}
                            onClick={() => void saveGlobalAttributeCost(level)}
                          >
                            {isSaving ? "Saving..." : existing ? "Save" : "Create"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

