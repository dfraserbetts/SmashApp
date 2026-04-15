"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OUTCOME_NORMALIZATION_ADMIN_GROUPS,
  OUTCOME_NORMALIZATION_ADMIN_METADATA,
  type OutcomeNormalizationAdminGroup,
  type OutcomeNormalizationValueFormat,
} from "@/lib/config/outcomeNormalizationAdminMetadata";
import {
  DEFAULT_OUTCOME_NORMALIZATION_VALUES,
  OUTCOME_NORMALIZATION_KEY_ORDER,
  type OutcomeNormalizationConfigStatus,
  type OutcomeNormalizationSnapshot,
} from "@/lib/config/outcomeNormalizationShared";

type OutcomeNormalizationSetListItem = {
  id: string;
  name: string;
  slug: string;
  status: OutcomeNormalizationConfigStatus;
  notes: string | null;
  updatedAt: string;
  activatedAt: string | null;
};

type AdminOutcomeNormalizationResponse = {
  activeSetId: string;
  sets: OutcomeNormalizationSetListItem[];
  selectedSet: OutcomeNormalizationSnapshot;
};

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function getStatusChipClass(status: OutcomeNormalizationConfigStatus): string {
  if (status === "ACTIVE") return "border-emerald-600/60 bg-emerald-500/10 text-emerald-200";
  if (status === "DRAFT") return "border-amber-600/60 bg-amber-500/10 text-amber-200";
  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function toDraftInputs(values: Record<string, number>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const key of OUTCOME_NORMALIZATION_KEY_ORDER) {
    next[key] = String(values[key] ?? DEFAULT_OUTCOME_NORMALIZATION_VALUES[key] ?? 0);
  }
  return next;
}

function getSnapshotValue(snapshot: OutcomeNormalizationSnapshot | null, key: string): number {
  return snapshot?.values[key] ?? DEFAULT_OUTCOME_NORMALIZATION_VALUES[key] ?? 0;
}

function parseDraftValue(value: string | undefined): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function valuesDiffer(left: number | null, right: number): boolean {
  return left === null || Math.abs(left - right) > 0.0000001;
}

function formatHint(format?: OutcomeNormalizationValueFormat): string | null {
  if (format === "share") return "0.00 to 1.00 typical";
  if (format === "multiplier") return "1.00 = neutral";
  if (format === "curve_value") return "Radar curve budget bound";
  return null;
}

function buildValuesPayload(draftValues: Record<string, string>): Record<string, number> | string {
  const values: Record<string, number> = {};
  for (const key of OUTCOME_NORMALIZATION_KEY_ORDER) {
    const parsed = parseDraftValue(draftValues[key]);
    if (parsed === null) return `${key} must be a finite number >= 0.`;
    values[key] = parsed;
  }
  return values;
}

async function fetchAdminOutcomeNormalization(
  setId?: string | null,
): Promise<AdminOutcomeNormalizationResponse> {
  const query = setId ? `?setId=${encodeURIComponent(setId)}` : "";
  const response = await fetch(`/api/admin/outcome-normalization${query}`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | (AdminOutcomeNormalizationResponse & { error?: string })
    | null;
  if (!response.ok || !payload?.selectedSet) {
    throw new Error(payload?.error ?? "Failed to load outcome normalization");
  }
  return payload;
}

export default function AdminOutcomeNormalizationPage() {
  const [data, setData] = useState<AdminOutcomeNormalizationResponse | null>(null);
  const [activeSnapshot, setActiveSnapshot] = useState<OutcomeNormalizationSnapshot | null>(null);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>(
    toDraftInputs(DEFAULT_OUTCOME_NORMALIZATION_VALUES),
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
        ? OUTCOME_NORMALIZATION_KEY_ORDER.filter((key) =>
            valuesDiffer(parseDraftValue(draftValues[key]), getSnapshotValue(selectedSet, key)),
          )
        : [],
    [draftValues, isDraft, selectedSet],
  );
  const isDirty = dirtyKeys.length > 0;

  const activeChangedKeys = useMemo(
    () =>
      OUTCOME_NORMALIZATION_KEY_ORDER.filter((key) =>
        valuesDiffer(
          isDraft ? parseDraftValue(draftValues[key]) : getSnapshotValue(selectedSet, key),
          getSnapshotValue(activeSnapshot, key),
        ),
      ),
    [activeSnapshot, draftValues, isDraft, selectedSet],
  );
  const activeChangedSet = useMemo(() => new Set(activeChangedKeys), [activeChangedKeys]);

  const groupedKeys = useMemo(
    () =>
      OUTCOME_NORMALIZATION_ADMIN_GROUPS.map((group) => {
        const allKeys = OUTCOME_NORMALIZATION_KEY_ORDER.filter(
          (key) => OUTCOME_NORMALIZATION_ADMIN_METADATA[key]?.group === group,
        );
        const normalizedSearch = searchQuery.trim().toLowerCase();
        const keys = allKeys.filter((key) => {
          if (!normalizedSearch) return true;
          const metadata = OUTCOME_NORMALIZATION_ADMIN_METADATA[key];
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
      if (isDirty && !window.confirm("Discard unsaved outcome normalization edits?")) return;
      setLoading(true);
      setError(null);

      try {
        const payload = await fetchAdminOutcomeNormalization(nextSetId ?? selectedSetId);
        const nextActiveSnapshot =
          payload.activeSetId === payload.selectedSet.setId
            ? payload.selectedSet
            : (await fetchAdminOutcomeNormalization(payload.activeSetId)).selectedSet;

        setData(payload);
        setActiveSnapshot(nextActiveSnapshot);
        setSelectedSetId(payload.selectedSet.setId);
        setDraftValues(toDraftInputs(payload.selectedSet.values));
      } catch (loadError: unknown) {
        setError(
          String((loadError as { message?: unknown })?.message ?? "Failed to load outcome normalization"),
        );
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
    if (isDirty && !window.confirm("Discard unsaved outcome normalization edits?")) return;
    setSaving(true);
    setError(null);
    setFlash(null);

    try {
      const response = await fetch("/api/admin/outcome-normalization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createDraftFromActive",
          name: newDraftName,
          notes: newDraftNotes,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (AdminOutcomeNormalizationResponse & { error?: string })
        | null;

      if (!response.ok || !payload?.selectedSet) {
        throw new Error(payload?.error ?? "Failed to create draft");
      }

      const nextActiveSnapshot =
        payload.activeSetId === payload.selectedSet.setId
          ? payload.selectedSet
          : (await fetchAdminOutcomeNormalization(payload.activeSetId)).selectedSet;
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
      const response = await fetch("/api/admin/outcome-normalization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveDraftValues",
          setId: selectedSet.setId,
          values: valuesOrError,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (AdminOutcomeNormalizationResponse & { error?: string })
        | null;

      if (!response.ok || !payload?.selectedSet) {
        throw new Error(payload?.error ?? "Failed to save draft");
      }

      setData(payload);
      setSelectedSetId(payload.selectedSet.setId);
      setDraftValues(toDraftInputs(payload.selectedSet.values));
      setFlash("Saved draft values.");
    } catch (saveError: unknown) {
      setError(String((saveError as { message?: unknown })?.message ?? "Failed to save draft"));
    } finally {
      setSaving(false);
    }
  }

  async function activateDraft() {
    if (!selectedSet || isDirty) return;
    setSaving(true);
    setError(null);
    setFlash(null);

    try {
      const response = await fetch("/api/admin/outcome-normalization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activateDraft", setId: selectedSet.setId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (AdminOutcomeNormalizationResponse & { error?: string })
        | null;
      if (!response.ok || !payload?.selectedSet) {
        throw new Error(payload?.error ?? "Failed to activate draft");
      }
      setData(payload);
      setActiveSnapshot(payload.selectedSet);
      setSelectedSetId(payload.selectedSet.setId);
      setDraftValues(toDraftInputs(payload.selectedSet.values));
      setFlash("Activated draft.");
    } catch (activateError: unknown) {
      setError(String((activateError as { message?: unknown })?.message ?? "Failed to activate draft"));
    } finally {
      setSaving(false);
    }
  }

  async function archiveSelectedSet() {
    if (!selectedSet) return;
    setSaving(true);
    setError(null);
    setFlash(null);

    try {
      const response = await fetch("/api/admin/outcome-normalization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archiveSet", setId: selectedSet.setId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (AdminOutcomeNormalizationResponse & { error?: string })
        | null;
      if (!response.ok || !payload?.selectedSet) {
        throw new Error(payload?.error ?? "Failed to archive set");
      }
      setData(payload);
      setSelectedSetId(payload.selectedSet.setId);
      setDraftValues(toDraftInputs(payload.selectedSet.values));
      setFlash("Archived set.");
    } catch (archiveError: unknown) {
      setError(String((archiveError as { message?: unknown })?.message ?? "Failed to archive set"));
    } finally {
      setSaving(false);
    }
  }

  async function unarchiveSelectedSet() {
    if (!selectedSet) return;
    setSaving(true);
    setError(null);
    setFlash(null);

    try {
      const response = await fetch("/api/admin/outcome-normalization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unarchiveSet", setId: selectedSet.setId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (AdminOutcomeNormalizationResponse & { error?: string })
        | null;
      if (!response.ok || !payload?.selectedSet) {
        throw new Error(payload?.error ?? "Failed to unarchive set");
      }
      setData(payload);
      setSelectedSetId(payload.selectedSet.setId);
      setDraftValues(toDraftInputs(payload.selectedSet.values));
      setFlash("Unarchived set as draft.");
    } catch (unarchiveError: unknown) {
      setError(String((unarchiveError as { message?: unknown })?.message ?? "Failed to unarchive set"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteArchivedSelectedSet() {
    if (!selectedSet) return;
    if (!window.confirm("This cannot be undone, are you sure?")) return;

    setSaving(true);
    setError(null);
    setFlash(null);

    try {
      const response = await fetch("/api/admin/outcome-normalization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteArchivedSet", setId: selectedSet.setId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (AdminOutcomeNormalizationResponse & { error?: string })
        | null;
      if (!response.ok || !payload?.selectedSet) {
        throw new Error(payload?.error ?? "Failed to delete archived set");
      }
      setData(payload);
      setActiveSnapshot(payload.selectedSet);
      setSelectedSetId(payload.selectedSet.setId);
      setDraftValues(toDraftInputs(payload.selectedSet.values));
      setFlash("Deleted archived set.");
    } catch (deleteError: unknown) {
      setError(String((deleteError as { message?: unknown })?.message ?? "Failed to delete archived set"));
    } finally {
      setSaving(false);
    }
  }

  function resetFieldToActive(key: string) {
    setDraftValues((current) => ({ ...current, [key]: String(getSnapshotValue(activeSnapshot, key)) }));
  }

  function resetSectionToActive(group: OutcomeNormalizationAdminGroup) {
    setDraftValues((current) => {
      const next = { ...current };
      for (const key of OUTCOME_NORMALIZATION_KEY_ORDER) {
        if (OUTCOME_NORMALIZATION_ADMIN_METADATA[key]?.group === group) {
          next[key] = String(getSnapshotValue(activeSnapshot, key));
        }
      }
      return next;
    });
  }

  function resetAllToActive() {
    setDraftValues(toDraftInputs(activeSnapshot?.values ?? DEFAULT_OUTCOME_NORMALIZATION_VALUES));
  }

  return (
    <div className="space-y-6">
      <a className="text-sm underline" href="/admin">
        Back to Admin Dashboard
      </a>

      <section className="rounded-lg border border-zinc-800 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-medium">Outcome Normalization</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Versioned downstream monster radar normalization. This is separate from canonical Power
              Tuning and does not edit power-cost formula inputs.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Exposing {OUTCOME_NORMALIZATION_KEY_ORDER.length} normalization keys across{" "}
              {OUTCOME_NORMALIZATION_ADMIN_GROUPS.length} sections.
            </p>
          </div>
          <span
            className={[
              "rounded border px-3 py-1 text-xs",
              isDirty
                ? "border-amber-600/60 bg-amber-500/10 text-amber-100"
                : "border-zinc-700 bg-zinc-900 text-zinc-300",
            ].join(" ")}
          >
            {isDirty ? `Unsaved changes: ${dirtyKeys.length}` : "No unsaved changes"}
          </span>
        </div>
        <details className="mt-4 rounded border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-400">
          <summary className="cursor-pointer text-sm font-medium text-zinc-200">Key Terms</summary>
          <dl className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <dt className="font-medium text-zinc-300">Base Power Value</dt>
              <dd>The underlying scalar value of a power before cooldown is derived.</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-300">Axis</dt>
              <dd>How a power expresses battlefield shape on the monster-side calculator.</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-300">Cadence / Repeat Rate</dt>
              <dd>How often a power is expected to matter over time.</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-300">Wounds per Round</dt>
              <dd>Expected damage dealt per round.</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-300">Support Utility Output</dt>
              <dd>Non-damage support value used by the calculator.</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-300">Control Pressure</dt>
              <dd>Battlefield disruption and restriction pressure.</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-300">Pressure</dt>
              <dd>Broad encounter pressure or presence.</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-300">Recurring Carrier</dt>
              <dd>A structure that lets later effects repeat across turns.</dd>
            </div>
          </dl>
        </details>
      </section>

      <section className="space-y-4 rounded-lg border border-zinc-800 p-4">
        <div>
          <h3 className="text-base font-medium">Create Draft</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Drafts clone the current active normalization values. Notes are display-only after creation.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1">
            <span className="block text-sm">Draft Name</span>
            <input
              type="text"
              value={newDraftName}
              onChange={(event) => setNewDraftName(event.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-transparent p-2 text-sm"
              placeholder="Optional draft name"
            />
          </label>
          <label className="flex-1">
            <span className="block text-sm">Draft Notes</span>
            <input
              type="text"
              value={newDraftNotes}
              onChange={(event) => setNewDraftNotes(event.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-transparent p-2 text-sm"
              placeholder="Optional notes"
            />
          </label>
          <button
            type="button"
            onClick={createDraft}
            disabled={loading || saving}
            className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
          >
            {saving ? "Working..." : "Create Draft From Active"}
          </button>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-zinc-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-medium">Config Sets</h3>
          <button
            type="button"
            onClick={() => void load(selectedSetId)}
            disabled={loading || saving}
            className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-zinc-400">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Slug</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Updated</th>
                <th className="py-2 pr-4 font-medium">Activated</th>
                <th className="py-2 font-medium">Select</th>
              </tr>
            </thead>
            <tbody>
              {data?.sets.map((set) => (
                <tr key={set.id} className={set.id === selectedSetId ? "bg-zinc-900/40" : undefined}>
                  <td className="py-2 pr-4">
                    <div>{set.name}</div>
                    {set.notes ? <div className="text-xs text-zinc-500">{set.notes}</div> : null}
                  </td>
                  <td className="py-2 pr-4 text-zinc-400">{set.slug}</td>
                  <td className="py-2 pr-4">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusChipClass(set.status)}`}>
                      {set.status}
                    </span>
                    {set.id === data.activeSetId ? <span className="ml-2 text-xs text-zinc-500">Current active</span> : null}
                  </td>
                  <td className="py-2 pr-4 text-zinc-400">{formatDateTime(set.updatedAt)}</td>
                  <td className="py-2 pr-4 text-zinc-400">{formatDateTime(set.activatedAt)}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void load(set.id)}
                      disabled={loading || saving}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-900 disabled:opacity-60"
                    >
                      {set.id === selectedSetId ? "Selected" : "Open"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading ? <p className="text-sm text-zinc-400">Loading...</p> : null}
        {error ? <div className="rounded border border-red-900 bg-red-950/30 p-3 text-sm">{error}</div> : null}
        {flash ? <div className="rounded border border-emerald-900 bg-emerald-950/30 p-3 text-sm">{flash}</div> : null}
      </section>

      {selectedSet ? (
        <section className="space-y-5 rounded-lg border border-zinc-800 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-medium">{selectedSet.name}</h3>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${getStatusChipClass(selectedSet.status)}`}>
                  {selectedSet.status}
                </span>
                {selectedSet.setId === data?.activeSetId ? (
                  <span className="rounded border border-emerald-700/60 bg-emerald-950/30 px-2 py-0.5 text-xs text-emerald-200">
                    Active baseline
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-zinc-400">{selectedSet.slug}</p>
              <p className="mt-1 text-xs text-zinc-500">Last updated: {formatDateTime(selectedSet.updatedAt)}</p>
              {selectedSetListItem?.notes ? (
                <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/40 p-2 text-xs text-zinc-400">
                  <span className="text-zinc-500">Notes:</span> {selectedSetListItem.notes}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {isDraft ? (
                <>
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={loading || saving || !isDirty}
                    className="rounded border border-emerald-700 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-950/30 disabled:opacity-60"
                  >
                    {saving ? "Working..." : "Save Draft"}
                  </button>
                  <button
                    type="button"
                    onClick={activateDraft}
                    disabled={loading || saving || isDirty}
                    title={isDirty ? "Save changes before activating this draft." : undefined}
                    className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
                  >
                    Activate Draft
                  </button>
                  <button
                    type="button"
                    onClick={resetAllToActive}
                    disabled={loading || saving}
                    className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
                  >
                    Reset Draft To Active
                  </button>
                  <button
                    type="button"
                    onClick={archiveSelectedSet}
                    disabled={loading || saving}
                    className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
                  >
                    Archive Draft
                  </button>
                </>
              ) : isArchived ? (
                <>
                  <button
                    type="button"
                    onClick={unarchiveSelectedSet}
                    disabled={loading || saving}
                    className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
                  >
                    {saving ? "Working..." : "Unarchive to Draft"}
                  </button>
                  <span className="rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-400">
                    ARCHIVED sets are read-only until unarchived.
                  </span>
                  <button
                    type="button"
                    onClick={deleteArchivedSelectedSet}
                    disabled={loading || saving}
                    className="rounded border border-red-800 px-3 py-2 text-sm text-red-200 hover:bg-red-950/30 disabled:opacity-60"
                  >
                    Delete Archived
                  </button>
                </>
              ) : (
                <span className="rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-400">
                  {selectedSet.status} sets are read-only.
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-3 text-xs sm:grid-cols-4">
            <div className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
              <div className="text-zinc-500">Total keys</div>
              <div className="mt-1 text-lg text-zinc-100">{OUTCOME_NORMALIZATION_KEY_ORDER.length}</div>
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
              placeholder="Filter by label, flat key, description, or group"
            />
          </label>

          <div className="space-y-4">
            {groupedKeys.map(({ group, keys, totalChangedCount }) => {
              if (keys.length === 0) return null;

              return (
                <div key={group} className="space-y-3 rounded border border-zinc-800 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h4 className="text-sm font-medium uppercase tracking-wide text-zinc-300">{group}</h4>
                      <p className="mt-1 text-xs text-zinc-500">
                        {keys.length} visible keys. {totalChangedCount} changed vs active in this section.
                      </p>
                    </div>
                    {isDraft ? (
                      <button
                        type="button"
                        onClick={() => resetSectionToActive(group)}
                        disabled={loading || saving}
                        className="w-fit rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-900 disabled:opacity-60"
                      >
                        Reset Section To Active
                      </button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {keys.map((key) => {
                      const metadata = OUTCOME_NORMALIZATION_ADMIN_METADATA[key];
                      const activeValue = getSnapshotValue(activeSnapshot, key);
                      const selectedValue = getSnapshotValue(selectedSet, key);
                      const draftValue = draftValues[key] ?? "";
                      const currentParsedValue = isDraft ? parseDraftValue(draftValue) : selectedValue;
                      const differsFromActive = activeChangedSet.has(key);
                      const dirty = dirtyKeys.includes(key);
                      const hint = formatHint(metadata?.format);

                      return (
                        <div
                          key={key}
                          className={[
                            "rounded border p-3",
                            differsFromActive
                              ? "border-amber-700/70 bg-amber-950/10"
                              : "border-zinc-800 bg-zinc-950/20",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="text-sm font-medium" htmlFor={`outcome-normalization-${key}`}>
                                  {metadata?.label ?? key}
                                </label>
                                <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                                  Normalization
                                </span>
                                {dirty ? (
                                  <span className="rounded border border-sky-700/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sky-200">
                                    unsaved
                                  </span>
                                ) : null}
                                {differsFromActive ? (
                                  <span className="rounded border border-amber-700/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                                    changed
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 text-[11px] text-zinc-500">{key}</div>
                            </div>
                            {isDraft ? (
                              <button
                                type="button"
                                onClick={() => resetFieldToActive(key)}
                                disabled={loading || saving}
                                className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-900 disabled:opacity-60"
                              >
                                Reset
                              </button>
                            ) : null}
                          </div>

                          <p className="mt-2 text-xs text-zinc-400">{metadata?.description ?? "Outcome normalization value."}</p>

                          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-end">
                            <label className="block">
                              <span className="text-[11px] text-zinc-500">Selected Value</span>
                              <input
                                id={`outcome-normalization-${key}`}
                                type="number"
                                min={0}
                                step="any"
                                disabled={!isDraft}
                                value={isDraft ? draftValue : String(selectedValue)}
                                onChange={(event) =>
                                  setDraftValues((current) => ({
                                    ...current,
                                    [key]: event.target.value,
                                  }))
                                }
                                className="mt-1 w-full rounded border border-zinc-700 bg-transparent p-2 text-sm disabled:opacity-60"
                              />
                            </label>
                            <div className="rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-xs text-zinc-400">
                              Active: <span className="text-zinc-200">{activeValue}</span>
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                            {hint ? <span>{hint}</span> : null}
                            {metadata?.suggestedMin != null || metadata?.suggestedMax != null ? (
                              <span>
                                Suggested range: {metadata.suggestedMin ?? "?"} to{" "}
                                {metadata.suggestedMax ?? "open"}
                              </span>
                            ) : null}
                            {currentParsedValue === null ? (
                              <span className="text-red-300">Value must be finite and non-negative.</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
