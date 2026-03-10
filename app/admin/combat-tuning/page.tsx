"use client";

import { useEffect, useState } from "react";

type TuningRow = {
  id: string;
  protectionK: number;
  protectionS: number;
  updatedAt: string;
};

// ADMIN_COMBAT_TUNING_PAGE
export default function AdminCombatTuningPage() {
  const [row, setRow] = useState<TuningRow | null>(null);
  const [protectionK, setProtectionK] = useState("");
  const [protectionS, setProtectionS] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/combat-tuning", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        row?: TuningRow;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load combat tuning");
      if (!data.row) throw new Error("Missing combat tuning row");
      setRow(data.row);
      setProtectionK(String(data.row.protectionK));
      setProtectionS(String(data.row.protectionS));
    } catch (e: unknown) {
      setErr(String((e as { message?: unknown })?.message ?? "Failed to load combat tuning"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    const k = Number.parseInt(protectionK, 10);
    const s = Number.parseInt(protectionS, 10);
    if (!Number.isFinite(k) || k < 1) {
      setErr("Protection K must be >= 1.");
      return;
    }
    if (!Number.isFinite(s) || s < 1) {
      setErr("Protection S must be >= 1.");
      return;
    }

    setSaving(true);
    setErr(null);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/combat-tuning", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protectionK: k, protectionS: s }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        row?: TuningRow;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to save combat tuning");
      if (data.row) {
        setRow(data.row);
        setProtectionK(String(data.row.protectionK));
        setProtectionS(String(data.row.protectionS));
      }
      setFlash("Saved combat tuning.");
      window.setTimeout(() => setFlash(null), 2000);
    } catch (e: unknown) {
      setErr(String((e as { message?: unknown })?.message ?? "Failed to save combat tuning"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <a className="text-sm underline" href="/admin">
        Back to Admin Dashboard
      </a>

      <div className="rounded-lg border">
        <div className="border-b p-3">
          <h2 className="text-lg font-medium">Combat Tuning</h2>
          <p className="mt-1 text-sm opacity-80">Protection Block Tuning</p>
        </div>

        <div className="space-y-4 p-3">
          <p className="text-sm opacity-80">
            block = ceil((PPV / K) * (1 + skill / S))
          </p>
          <p className="text-xs opacity-70">
            Adjusting K and S: because even spreadsheets deserve a GM screen.
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm">Protection K</label>
              <input
                type="number"
                min={1}
                step={1}
                className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                value={protectionK}
                onChange={(e) => setProtectionK(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm">Protection S</label>
              <input
                type="number"
                min={1}
                step={1}
                className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                value={protectionS}
                onChange={(e) => setProtectionS(e.target.value)}
              />
            </div>
          </div>

          {row?.updatedAt ? (
            <p className="text-xs opacity-70">Last updated: {new Date(row.updatedAt).toLocaleString()}</p>
          ) : null}

          {err ? <div className="rounded border p-3 text-sm">{err}</div> : null}
          {flash ? <div className="rounded border p-3 text-sm">{flash}</div> : null}

          <div className="flex gap-2">
            <button
              className="rounded border px-3 py-2 text-sm"
              type="button"
              onClick={save}
              disabled={loading || saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              className="rounded border px-3 py-2 text-sm"
              type="button"
              onClick={() => void load()}
              disabled={loading || saving}
            >
              Refresh
            </button>
          </div>

          {loading ? <p className="text-sm opacity-80">Loading...</p> : null}
        </div>
      </div>
    </div>
  );
}

