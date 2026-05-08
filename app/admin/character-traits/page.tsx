"use client";

import { FormEvent, useEffect, useState } from "react";

type CharacterTraitClassification = "POSITIVE" | "NEGATIVE";

type CharacterTraitRow = {
  id: string;
  name: string;
  descriptor: string;
  classification: CharacterTraitClassification;
  pointValue: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type TraitFormState = {
  name: string;
  descriptor: string;
  classification: CharacterTraitClassification;
  pointValue: string;
  isActive: boolean;
  notes: string;
};

const EMPTY_FORM: TraitFormState = {
  name: "",
  descriptor: "",
  classification: "POSITIVE",
  pointValue: "1",
  isActive: true,
  notes: "",
};

async function readApiError(res: Response, fallback: string) {
  try {
    const payload = (await res.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {}
  return fallback;
}

export default function AdminCharacterTraitsPage() {
  const [rows, setRows] = useState<CharacterTraitRow[]>([]);
  const [form, setForm] = useState<TraitFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadRows() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/character-traits", {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to load Character Traits."));
      }
      const data = (await res.json()) as { rows?: CharacterTraitRow[] };
      setRows(data.rows ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Character Traits.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  function editRow(row: CharacterTraitRow) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      descriptor: row.descriptor,
      classification: row.classification,
      pointValue: String(row.pointValue),
      isActive: row.isActive,
      notes: row.notes ?? "",
    });
    setMessage(null);
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function toPayload(state: TraitFormState) {
    return {
      name: state.name,
      descriptor: state.descriptor,
      classification: state.classification,
      pointValue: Number(state.pointValue),
      isActive: state.isActive,
      notes: state.notes,
    };
  }

  async function saveTrait(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const url = editingId
        ? `/api/admin/character-traits/${encodeURIComponent(editingId)}`
        : "/api/admin/character-traits";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(toPayload(form)),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to save Character Trait."));
      }
      await loadRows();
      resetForm();
      setMessage("Character Trait saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save Character Trait.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: CharacterTraitRow) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/character-traits/${encodeURIComponent(row.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: row.name,
          descriptor: row.descriptor,
          classification: row.classification,
          pointValue: row.pointValue,
          isActive: !row.isActive,
          notes: row.notes ?? "",
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to update Character Trait."));
      }
      await loadRows();
      setMessage(row.isActive ? "Character Trait deactivated." : "Character Trait reactivated.");
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update Character Trait.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Character Traits</h2>
        <p className="mt-1 text-sm opacity-70">
          Admin-managed player-safe traits for the Character Builder.
        </p>
      </div>

      {error ? <p className="rounded border border-red-800 p-3 text-sm text-red-300">{error}</p> : null}
      {message ? (
        <p className="rounded border border-emerald-800 p-3 text-sm text-emerald-300">{message}</p>
      ) : null}

      <form onSubmit={saveTrait} className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-semibold">{editingId ? "Edit Character Trait" : "Create Character Trait"}</h3>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="rounded border px-3 py-1 text-sm disabled:opacity-60"
            >
              Cancel Edit
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm">Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              disabled={saving}
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm">Classification</span>
            <select
              value={form.classification}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  classification: event.target.value as CharacterTraitClassification,
                }))
              }
              disabled={saving}
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
            >
              <option value="POSITIVE">Positive</option>
              <option value="NEGATIVE">Negative</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm">Point Value</span>
            <input
              type="number"
              min={1}
              step={1}
              value={form.pointValue}
              onChange={(event) =>
                setForm((current) => ({ ...current, pointValue: event.target.value }))
              }
              disabled={saving}
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
            />
          </label>

          <label className="flex items-center gap-2 pt-7">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((current) => ({ ...current, isActive: event.target.checked }))
              }
              disabled={saving}
            />
            <span className="text-sm">Active</span>
          </label>
        </div>

        <label className="block">
          <span className="text-sm">Descriptor</span>
          <textarea
            value={form.descriptor}
            onChange={(event) =>
              setForm((current) => ({ ...current, descriptor: event.target.value }))
            }
            disabled={saving}
            rows={4}
            className="mt-1 w-full rounded border bg-transparent px-3 py-2"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm">Notes</span>
          <textarea
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            disabled={saving}
            rows={3}
            className="mt-1 w-full rounded border bg-transparent px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="rounded border px-4 py-2 text-sm disabled:opacity-60"
        >
          {saving ? "Saving..." : editingId ? "Save Character Trait" : "Create Character Trait"}
        </button>
      </form>

      <section className="rounded-lg border">
        <div className="border-b p-3">
          <h3 className="font-semibold">Character Traits ({rows.length})</h3>
        </div>
        {loading ? <p className="p-3 text-sm opacity-70">Loading Character Traits...</p> : null}
        {!loading && rows.length === 0 ? (
          <p className="p-3 text-sm opacity-70">No Character Traits yet.</p>
        ) : null}
        <div className="divide-y">
          {rows.map((row) => (
            <article key={row.id} className="space-y-3 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-semibold">
                    {row.name}{" "}
                    <span className="text-xs opacity-60">
                      {row.isActive ? "Active" : "Inactive"} /{" "}
                      {row.classification === "POSITIVE" ? "Positive" : "Negative"}{" "}
                      {row.pointValue}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm opacity-80">{row.descriptor}</p>
                  {row.notes ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs opacity-60">Notes: {row.notes}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => editRow(row)}
                    disabled={saving}
                    className="rounded border px-3 py-1 text-sm disabled:opacity-60"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(row)}
                    disabled={saving}
                    className="rounded border px-3 py-1 text-sm disabled:opacity-60"
                  >
                    {row.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
