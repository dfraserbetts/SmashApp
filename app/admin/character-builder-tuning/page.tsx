"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  MAX_CHARACTER_POWER_SPEND_SCALAR,
  MIN_CHARACTER_POWER_SPEND_SCALAR,
  validateCharacterPowerSpendScalar,
  type CharacterBuilderTuningSnapshot,
} from "@/lib/config/characterBuilderTuningShared";

type CharacterBuilderTuningResponse = {
  tuning: CharacterBuilderTuningSnapshot;
  error?: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

async function fetchCharacterBuilderTuning(): Promise<CharacterBuilderTuningSnapshot> {
  const response = await fetch("/api/admin/character-builder-tuning", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as CharacterBuilderTuningResponse | null;
  if (!response.ok || !payload?.tuning) {
    throw new Error(payload?.error ?? "Failed to load Character Builder tuning.");
  }
  return payload.tuning;
}

export default function AdminCharacterBuilderTuningPage() {
  const [tuning, setTuning] = useState<CharacterBuilderTuningSnapshot | null>(null);
  const [draftScalar, setDraftScalar] = useState(String(DEFAULT_CHARACTER_POWER_SPEND_SCALAR));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const validation = validateCharacterPowerSpendScalar(draftScalar);
  const dirty =
    tuning !== null &&
    validation.ok &&
    Math.abs(validation.value - tuning.playerPowerSpendScalar) > 0.0000001;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchCharacterBuilderTuning();
      setTuning(next);
      setDraftScalar(String(next.playerPowerSpendScalar));
    } catch (loadError: unknown) {
      setError(String((loadError as { message?: unknown })?.message ?? "Failed to load Character Builder tuning."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const nextValidation = validateCharacterPowerSpendScalar(draftScalar);
    if (!nextValidation.ok) {
      setError(nextValidation.error);
      return;
    }

    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const response = await fetch("/api/admin/character-builder-tuning", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerPowerSpendScalar: nextValidation.value }),
      });
      const payload = (await response.json().catch(() => null)) as CharacterBuilderTuningResponse | null;
      if (!response.ok || !payload?.tuning) {
        throw new Error(payload?.error ?? "Failed to save Character Builder tuning.");
      }
      setTuning(payload.tuning);
      setDraftScalar(String(payload.tuning.playerPowerSpendScalar));
      setFlash("Saved Character Builder tuning.");
    } catch (saveError: unknown) {
      setError(String((saveError as { message?: unknown })?.message ?? "Failed to save Character Builder tuning."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-6">
      <a className="text-sm underline" href="/admin">
        Back to Admin Dashboard
      </a>

      <section className="rounded-lg border border-zinc-800 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Player Economy</p>
        <h2 className="mt-1 text-lg font-medium">Character Builder Tuning</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Character Builder tuning controls downstream player-facing economy. Canonical Phase 6
          BasePowerValue and Summoning Circle Power Tuning remain separate.
        </p>
      </section>

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

      <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-base font-medium">Character Power Spend Scalar</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Multiplies canonical BasePowerValue to calculate Character Builder Power Point spend.
              Cooldown still derives from BasePowerValue.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Current saved value: {tuning?.playerPowerSpendScalar ?? DEFAULT_CHARACTER_POWER_SPEND_SCALAR}.
              Last updated: {formatDateTime(tuning?.updatedAt ?? null)}.
            </p>
          </div>
          <span
            className={[
              "rounded border px-3 py-1 text-xs",
              dirty
                ? "border-amber-600/60 bg-amber-500/10 text-amber-100"
                : "border-zinc-700 bg-zinc-900 text-zinc-300",
            ].join(" ")}
          >
            {dirty ? "Unsaved change" : "No unsaved changes"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="block">
            <span className="text-sm">Character Power Spend Scalar</span>
            <input
              type="number"
              min={MIN_CHARACTER_POWER_SPEND_SCALAR}
              max={MAX_CHARACTER_POWER_SPEND_SCALAR}
              step="any"
              value={draftScalar}
              onChange={(event) => setDraftScalar(event.target.value)}
              disabled={loading || saving}
              className="mt-1 w-full rounded border border-zinc-700 bg-transparent p-2 text-sm disabled:opacity-60"
            />
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving || !validation.ok || !dirty}
            className="rounded border border-emerald-700 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-950/30 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
          <span>Default: {DEFAULT_CHARACTER_POWER_SPEND_SCALAR}</span>
          <span>Allowed: greater than 0 to {MAX_CHARACTER_POWER_SPEND_SCALAR}</span>
          {!validation.ok ? <span className="text-red-300">{validation.error}</span> : null}
        </div>

        {loading ? <p className="mt-3 text-sm text-zinc-400">Loading...</p> : null}
      </section>
    </main>
  );
}
