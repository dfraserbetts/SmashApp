"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COMBAT_TUNING_ADMIN_GROUPS,
  COMBAT_TUNING_ADMIN_METADATA,
  type CombatTuningAdminGroup,
  type CombatTuningValueFormat,
} from "@/lib/config/combatTuningAdminMetadata";
import {
  COMBAT_TUNING_CONFIG_KEY_ORDER,
  DEFAULT_COMBAT_TUNING_VALUES,
  getCombatTuningInputMin,
  validateCombatTuningConfigValue,
  type CombatTuningConfigStatus,
  type CombatTuningSnapshot,
} from "@/lib/config/combatTuningShared";

type CombatTuningSetListItem = {
  id: string;
  name: string;
  slug: string;
  status: CombatTuningConfigStatus;
  notes: string | null;
  updatedAt: string;
  activatedAt: string | null;
};

type AdminCombatTuningResponse = {
  activeSetId: string;
  sets: CombatTuningSetListItem[];
  selectedSet: CombatTuningSnapshot;
};

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function getStatusChipClass(status: CombatTuningConfigStatus): string {
  if (status === "ACTIVE") return "border-emerald-600/60 bg-emerald-500/10 text-emerald-200";
  if (status === "DRAFT") return "border-amber-600/60 bg-amber-500/10 text-amber-200";
  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function toDraftInputs(values: Record<string, number>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const key of COMBAT_TUNING_CONFIG_KEY_ORDER) {
    next[key] = String(values[key] ?? (DEFAULT_COMBAT_TUNING_VALUES as Record<string, number>)[key] ?? 0);
  }
  return next;
}

function getSnapshotValue(snapshot: CombatTuningSnapshot | null, key: string): number {
  return snapshot?.values[key] ?? (DEFAULT_COMBAT_TUNING_VALUES as Record<string, number>)[key] ?? 0;
}

function parseDraftValue(key: string, value: string | undefined): number | null {
  const validation = validateCombatTuningConfigValue(key, value);
  return validation.ok ? validation.value : null;
}

function valuesDiffer(left: number | null, right: number): boolean {
  return left === null || Math.abs(left - right) > 0.0000001;
}

function formatHint(format?: CombatTuningValueFormat): string | null {
  if (format === "share") return "0.00 to 1.00 typical";
  if (format === "multiplier") return "1.00 = neutral";
  return null;
}

const HIDDEN_COMBAT_TUNING_KEYS = new Set(["poolWeakerSideWeight", "poolAverageWeight"]);
const DISPLAYED_COMBAT_TUNING_KEYS = COMBAT_TUNING_CONFIG_KEY_ORDER.filter(
  (key) => !HIDDEN_COMBAT_TUNING_KEYS.has(key),
);

const FORMULA_GUIDES: Partial<
  Record<
    CombatTuningAdminGroup,
    {
      title: string;
      formula: string;
      notes: string[];
    }
  >
> = {
  "Protection Formula": {
    title: "How protection block is made",
    formula: "Block per success = ceil((Protection Value / K) * (1 + Skill / S))",
    notes: [
      "Raise K to make protection block less.",
      "Raise S to make Armor Skill or the pooled Willpower value matter less.",
      "Physical block uses Armor Skill. Mental block scales through the Willpower pool, while Bravery remains the surfaced Mental Defence stat.",
    ],
  },
  "Baseline Resilience & Perseverance": {
    title: "How monster pools are made",
    formula:
      "Pool = round((Level + weighted attributes) * Tier Multiplier + Legendary Bonus)",
    notes: [
      "Physical Resilience uses Attack, Guard, and Fortitude.",
      "Mental Perseverance uses Intellect, Synergy, and Bravery.",
      "Raise a tier multiplier to make that tier's real stat-block pools larger.",
    ],
  },
  "Pool Expectation by Tier": {
    title: "How expected pools are made",
    formula: "Expected Pool = (Level 1 value + Per Level growth * (Level - 1)) * Tier Multiplier",
    notes: [
      "These values describe what the calculator expects, not the stat block's actual pool.",
      "Raise expected values to make the same monster look less durable by comparison.",
      "Lower expected values to make the same monster look more durable by comparison.",
    ],
  },
  "Pool Penalty / Bonus Scaling": {
    title: "How pool expectation affects each survivability lane",
    formula:
      "Lane Pool Share = Expected Pool Share + below/above expected delta, clamped from 0 to 1",
    notes: [
      "Expected Pool Share is the per-lane share at exactly expected physical or mental pools.",
      "Pool ratio below 1 gives that lane a survivability penalty.",
      "Pool ratio above 1 gives that lane a survivability bonus.",
      "Caps set the maximum penalty or bonus; scale controls how quickly it ramps.",
    ],
  },
  "Attribute Weights / Realization Inputs": {
    title: "How attribute weights become baseline stats",
    formula:
      "Skill = max(1, ceil(round(((primary half * primary weight + secondary half * secondary weight) / total weight - offset) * scale, 1)))",
    notes: [
      "Raise an attribute weight to make that attribute matter more.",
      "Raise Baseline Offset to lower the final skill.",
      "Raise Skill Scale to make stronger attributes improve the skill faster.",
      "Dodge = max(1, ceil((Intellect * Intellect Weight + Guard * Guard Weight) / Attribute Divisor) + Level - Physical Protection * Protection Penalty).",
    ],
  },
  "Dodge & Defence Package": {
    title: "How defensive baseline becomes physical and mental survivability",
    formula:
      "Lane Bonus = Lane Budget * (shared Dodge split + lane-specific Block Share)",
    notes: [
      "Dodge Share comes from Dodge dice compared against expected incoming attack dice and is split across both survivability lanes.",
      "Physical block uses Armor Skill and physical protection output. Mental block uses the Willpower pool and mental protection output, while Bravery remains the surfaced Mental Defence stat.",
      "Raise caps to allow a bigger survivability contribution; raise scales to make it ramp more slowly.",
    ],
  },
};

function FormulaGuide(props: { group: CombatTuningAdminGroup }) {
  const guide = FORMULA_GUIDES[props.group];
  if (!guide) return null;

  return (
    <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Formula Guide
      </p>
      <h3 className="mt-1 text-sm font-medium text-zinc-200">{guide.title}</h3>
      <p className="mt-2 rounded border border-zinc-800 bg-black/30 px-2 py-1.5 font-mono text-xs text-zinc-300">
        {guide.formula}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-400">
        {guide.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function buildValuesPayload(draftValues: Record<string, string>): Record<string, number> | string {
  const values: Record<string, number> = {};
  for (const key of COMBAT_TUNING_CONFIG_KEY_ORDER) {
    const parsed = parseDraftValue(key, draftValues[key]);
    if (parsed === null) {
      const validation = validateCombatTuningConfigValue(key, draftValues[key]);
      if (!validation.ok) {
        const metadata = COMBAT_TUNING_ADMIN_METADATA[key];
        const label = metadata?.label ? `${metadata.label} (${key})` : key;
        return `${label} must be a ${validation.issue.requirement}. Reason: ${validation.issue.reason}.`;
      }
      return `${key} must be a valid combat tuning value.`;
    }
    values[key] = parsed;
  }
  return values;
}

async function fetchAdminCombatTuning(setId?: string | null): Promise<AdminCombatTuningResponse> {
  const query = setId ? `?setId=${encodeURIComponent(setId)}` : "";
  const response = await fetch(`/api/admin/combat-tuning${query}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | (AdminCombatTuningResponse & { error?: string })
    | null;
  if (!response.ok || !payload?.selectedSet) {
    throw new Error(payload?.error ?? "Failed to load combat tuning");
  }
  return payload;
}

export default function AdminCombatTuningPage() {
  const [data, setData] = useState<AdminCombatTuningResponse | null>(null);
  const [activeSnapshot, setActiveSnapshot] = useState<CombatTuningSnapshot | null>(null);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>(
    toDraftInputs(DEFAULT_COMBAT_TUNING_VALUES),
  );
  const [newDraftName, setNewDraftName] = useState("");
  const [newDraftNotes, setNewDraftNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const selectedSet = data?.selectedSet ?? null;
  const selectedSetListItem = data?.sets.find((set) => set.id === selectedSet?.setId) ?? null;
  const isDraft = selectedSet?.status === "DRAFT";
  const isArchived = selectedSet?.status === "ARCHIVED";

  const dirtyKeys = useMemo(
    () =>
      isDraft
        ? COMBAT_TUNING_CONFIG_KEY_ORDER.filter((key) =>
            valuesDiffer(parseDraftValue(key, draftValues[key]), getSnapshotValue(selectedSet, key)),
          )
        : [],
    [draftValues, isDraft, selectedSet],
  );
  const isDirty = dirtyKeys.length > 0;

  const activeChangedKeys = useMemo(
    () =>
      COMBAT_TUNING_CONFIG_KEY_ORDER.filter((key) =>
        valuesDiffer(
          isDraft ? parseDraftValue(key, draftValues[key]) : getSnapshotValue(selectedSet, key),
          getSnapshotValue(activeSnapshot, key),
        ),
      ),
    [activeSnapshot, draftValues, isDraft, selectedSet],
  );
  const activeChangedSet = useMemo(() => new Set(activeChangedKeys), [activeChangedKeys]);

  const groupedKeys = useMemo(
    () =>
      COMBAT_TUNING_ADMIN_GROUPS.map((group) => {
        const allKeys = DISPLAYED_COMBAT_TUNING_KEYS.filter(
          (key) => COMBAT_TUNING_ADMIN_METADATA[key]?.group === group,
        );
        const normalizedSearch = searchQuery.trim().toLowerCase();
        const keys = allKeys.filter((key) => {
          if (!normalizedSearch) return true;
          const metadata = COMBAT_TUNING_ADMIN_METADATA[key];
          return [metadata?.label, metadata?.description, metadata?.group, metadata?.aliases?.join(" "), key]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch));
        });
        return {
          group,
          keys,
          totalChangedCount: allKeys.filter((key) => activeChangedSet.has(key)).length,
        };
      }),
    [activeChangedSet, searchQuery],
  );

  const visibleKeyCount = groupedKeys.reduce((sum, group) => sum + group.keys.length, 0);

  const load = useCallback(
    async (nextSetId?: string | null) => {
      if (isDirty && !window.confirm("Discard unsaved combat tuning edits?")) return;
      setLoading(true);
      setError(null);

      try {
        const payload = await fetchAdminCombatTuning(nextSetId ?? selectedSetId);
        const nextActiveSnapshot =
          payload.activeSetId === payload.selectedSet.setId
            ? payload.selectedSet
            : (await fetchAdminCombatTuning(payload.activeSetId)).selectedSet;

        setData(payload);
        setActiveSnapshot(nextActiveSnapshot);
        setSelectedSetId(payload.selectedSet.setId);
        setDraftValues(toDraftInputs(payload.selectedSet.values));
      } catch (loadError: unknown) {
        setError(String((loadError as { message?: unknown })?.message ?? "Failed to load combat tuning"));
      } finally {
        setLoading(false);
      }
    },
    [isDirty, selectedSetId],
  );

  useEffect(() => {
    if (selectedSetId === null) void load(null);
  }, [load, selectedSetId]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  async function createDraft() {
    if (isDirty && !window.confirm("Discard unsaved combat tuning edits?")) return;
    setSaving(true);
    setError(null);
    setFlash(null);

    try {
      const response = await fetch("/api/admin/combat-tuning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createDraftFromActive",
          name: newDraftName,
          notes: newDraftNotes,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (AdminCombatTuningResponse & { error?: string })
        | null;

      if (!response.ok || !payload?.selectedSet) {
        throw new Error(payload?.error ?? "Failed to create draft");
      }

      const nextActiveSnapshot =
        payload.activeSetId === payload.selectedSet.setId
          ? payload.selectedSet
          : (await fetchAdminCombatTuning(payload.activeSetId)).selectedSet;
      setData(payload);
      setActiveSnapshot(nextActiveSnapshot);
      setSelectedSetId(payload.selectedSet.setId);
      setDraftValues(toDraftInputs(payload.selectedSet.values));
      setNewDraftName("");
      setNewDraftNotes("");
      setFlash("Created draft from active set.");
    } catch (createError: unknown) {
      setError(String((createError as { message?: unknown })?.message ?? "Failed to create draft"));
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!selectedSet) return;
    const valuesOrError = buildValuesPayload(draftValues);
    if (typeof valuesOrError === "string") {
      setError(valuesOrError);
      return;
    }

    setSaving(true);
    setError(null);
    setFlash(null);

    try {
      const response = await fetch("/api/admin/combat-tuning", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveDraftValues",
          setId: selectedSet.setId,
          values: valuesOrError,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (AdminCombatTuningResponse & { error?: string })
        | null;
      if (!response.ok || !payload?.selectedSet) {
        throw new Error(payload?.error ?? "Failed to save draft");
      }
      setData(payload);
      setSelectedSetId(payload.selectedSet.setId);
      setDraftValues(toDraftInputs(payload.selectedSet.values));
      setFlash("Saved draft.");
    } catch (saveError: unknown) {
      setError(String((saveError as { message?: unknown })?.message ?? "Failed to save draft"));
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: "activateDraft" | "archiveSet" | "unarchiveSet" | "deleteArchivedSet") {
    if (!selectedSet) return;
    if (action === "activateDraft" && isDirty) {
      setError("Save draft changes before activating.");
      return;
    }
    if (
      action === "deleteArchivedSet" &&
      !window.confirm("This cannot be undone, are you sure?")
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setFlash(null);

    try {
      const response = await fetch("/api/admin/combat-tuning", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, setId: selectedSet.setId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (AdminCombatTuningResponse & { error?: string })
        | null;
      if (!response.ok || !payload?.selectedSet) {
        throw new Error(payload?.error ?? `Failed to ${action}`);
      }
      const nextActiveSnapshot =
        payload.activeSetId === payload.selectedSet.setId
          ? payload.selectedSet
          : (await fetchAdminCombatTuning(payload.activeSetId)).selectedSet;
      setData(payload);
      setActiveSnapshot(nextActiveSnapshot);
      setSelectedSetId(payload.selectedSet.setId);
      setDraftValues(toDraftInputs(payload.selectedSet.values));
      setFlash("Updated combat tuning set.");
    } catch (actionError: unknown) {
      setError(String((actionError as { message?: unknown })?.message ?? "Failed to update set"));
    } finally {
      setSaving(false);
    }
  }

  function resetFieldToActive(key: string) {
    setDraftValues((current) => ({
      ...current,
      [key]: String(getSnapshotValue(activeSnapshot, key)),
    }));
  }

  function resetSectionToActive(group: CombatTuningAdminGroup) {
    setDraftValues((current) => {
      const next = { ...current };
      for (const key of COMBAT_TUNING_CONFIG_KEY_ORDER) {
        if (COMBAT_TUNING_ADMIN_METADATA[key]?.group === group) {
          next[key] = String(getSnapshotValue(activeSnapshot, key));
        }
      }
      return next;
    });
  }

  function resetAllToActive() {
    if (!activeSnapshot) return;
    setDraftValues(toDraftInputs(activeSnapshot.values));
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8 text-zinc-100">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <a className="text-sm underline" href="/admin">
            Back to Admin Dashboard
          </a>
          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-zinc-500">Game Ops</p>
          <h1 className="mt-1 text-2xl font-semibold">Combat Tuning</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Monster Baseline Tuning controls non-power monster contribution: pools, protection,
            attribute realization, derived skills, and defensive baseline shape. Power-cost truth and
            final radar normalization remain in their own admin tools.
          </p>
        </div>
        {selectedSet ? (
          <span className={`rounded-full border px-3 py-1 text-xs ${getStatusChipClass(selectedSet.status)}`}>
            {selectedSet.status}
          </span>
        ) : null}
      </header>

      {error ? (
        <div className="rounded border border-red-700 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {flash ? (
        <div className="rounded border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-200">
          {flash}
        </div>
      ) : null}

      <section className="grid gap-4 rounded border border-zinc-800 bg-zinc-950/60 p-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Selected Set</span>
            <select
              value={selectedSet?.setId ?? ""}
              onChange={(event) => void load(event.target.value)}
              disabled={loading || saving}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
            >
              {data?.sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name} ({set.status}
                  {set.id === data.activeSetId ? ", active" : ""})
                </option>
              ))}
            </select>
          </label>
          {selectedSet ? (
            <div className="space-y-1 text-xs text-zinc-500">
              <p>Name: {selectedSet.name}</p>
              <p>Slug: {selectedSet.slug}</p>
              <p>Updated: {formatDateTime(selectedSet.updatedAt)}</p>
              <p>Activated: {formatDateTime(selectedSetListItem?.activatedAt ?? null)}</p>
              {selectedSetListItem?.notes ? <p>Notes: {selectedSetListItem.notes}</p> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveDraft()}
                  disabled={saving || loading}
                  className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={() => void runAction("activateDraft")}
                  disabled={saving || loading || isDirty}
                  className="rounded border border-emerald-700 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-950/30 disabled:opacity-60"
                >
                  Activate Draft
                </button>
              </>
            ) : null}
            {selectedSet && selectedSet.status !== "ARCHIVED" ? (
              <button
                type="button"
                onClick={() => void runAction("archiveSet")}
                disabled={saving || loading || selectedSet.status === "ACTIVE"}
                className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
                title={selectedSet.status === "ACTIVE" ? "Activate another draft before archiving active." : undefined}
              >
                Archive
              </button>
            ) : null}
            {isArchived ? (
              <>
                <button
                  type="button"
                  onClick={() => void runAction("unarchiveSet")}
                  disabled={saving || loading}
                  className="rounded border border-amber-700 px-3 py-2 text-sm text-amber-200 hover:bg-amber-950/30 disabled:opacity-60"
                >
                  Unarchive to Draft
                </button>
                <button
                  type="button"
                  onClick={() => void runAction("deleteArchivedSet")}
                  disabled={saving || loading}
                  className="rounded border border-red-700 px-3 py-2 text-sm text-red-200 hover:bg-red-950/30 disabled:opacity-60"
                >
                  Delete Archived
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void load(selectedSet?.setId ?? null)}
              disabled={saving || loading}
              className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
          {isDirty ? (
            <p className="text-xs text-amber-300">Unsaved changes: {dirtyKeys.length}</p>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
            <h2 className="text-sm font-medium">Create Draft From Active</h2>
            <div className="mt-3 grid gap-2">
              <input
                value={newDraftName}
                onChange={(event) => setNewDraftName(event.target.value)}
                placeholder="Draft name"
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
              />
              <textarea
                value={newDraftNotes}
                onChange={(event) => setNewDraftNotes(event.target.value)}
                placeholder="Notes"
                className="min-h-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void createDraft()}
                disabled={saving || loading}
                className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
              >
                Create Draft
              </button>
            </div>
          </div>
          {isDraft ? (
            <button
              type="button"
              onClick={resetAllToActive}
              className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
            >
              Reset Whole Draft To Active
            </button>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded border border-zinc-800 bg-zinc-950/60 p-4">
        <div className="grid gap-3 text-xs sm:grid-cols-4">
          <div className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="text-zinc-500">Total keys</div>
            <div className="mt-1 text-lg text-zinc-100">{DISPLAYED_COMBAT_TUNING_KEYS.length}</div>
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="text-zinc-500">Visible after search</div>
            <div className="mt-1 text-lg text-zinc-100">{visibleKeyCount}</div>
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="text-zinc-500">Changed vs active</div>
            <div className="mt-1 text-lg text-zinc-100">{activeChangedKeys.length}</div>
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="text-zinc-500">Unsaved</div>
            <div className="mt-1 text-lg text-zinc-100">{dirtyKeys.length}</div>
          </div>
        </div>

        <label className="block">
          <span className="text-sm">Search Tunables</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-transparent p-2 text-sm"
            placeholder="Filter by label, flat key, description, group, or tag"
          />
        </label>
      </section>

      {groupedKeys.map(({ group, keys, totalChangedCount }) => {
        if (keys.length === 0) return null;
        return (
          <section key={group} className="rounded border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">{group}</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {keys.length} visible keys. {totalChangedCount} changed vs active in this section.
                </p>
              </div>
              {isDraft ? (
                <button
                  type="button"
                  onClick={() => resetSectionToActive(group)}
                  className="rounded border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900"
                >
                  Reset Section To Active
                </button>
              ) : null}
            </div>
            <FormulaGuide group={group} />
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {keys.map((key) => {
                const metadata = COMBAT_TUNING_ADMIN_METADATA[key];
                const selectedValue = isDraft
                  ? parseDraftValue(key, draftValues[key])
                  : getSnapshotValue(selectedSet, key);
                const activeValue = getSnapshotValue(activeSnapshot, key);
                const changed = activeChangedSet.has(key);
                const hint = formatHint(metadata?.format);
                return (
                  <div
                    key={key}
                    className={`rounded border p-3 ${
                      changed ? "border-amber-700/70 bg-amber-950/10" : "border-zinc-800 bg-zinc-950"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-medium text-zinc-100">{metadata?.label ?? key}</h3>
                        <p className="mt-1 text-xs text-zinc-500">{key}</p>
                      </div>
                      {isDraft ? (
                        <button
                          type="button"
                          onClick={() => resetFieldToActive(key)}
                          className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-900"
                        >
                          Reset
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-zinc-400">{metadata?.description}</p>
                    <div className="mt-3 flex items-end gap-2">
                      <label className="flex-1 space-y-1">
                        <span className="text-xs text-zinc-500">Selected Value</span>
                        <input
                          type="number"
                          min={getCombatTuningInputMin(key)}
                          step={metadata?.format === "share" ? 0.01 : 0.1}
                          value={
                            isDraft
                              ? (draftValues[key] ?? "")
                              : String(getSnapshotValue(selectedSet, key))
                          }
                          onChange={(event) =>
                            setDraftValues((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          disabled={!isDraft}
                          className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm disabled:opacity-70"
                        />
                      </label>
                      <span className="rounded border border-zinc-800 px-2 py-2 text-xs text-zinc-400">
                        Active: {activeValue}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                      {hint ? <span>{hint}</span> : null}
                      <span>Selected parsed: {selectedValue ?? "invalid"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {loading ? <p className="text-sm text-zinc-400">Loading...</p> : null}
    </main>
  );
}
