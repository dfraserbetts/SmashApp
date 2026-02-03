"use client";

import { useEffect, useMemo, useState } from "react";

type Row = { id: number; name: string };

export default function AdminWeaponAttributesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/weapon-attributes", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      setRows(data.rows ?? []);
    } catch (e: any) {
      setErr(String(e?.message ?? "Failed to load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createRow() {
    setErr(null);
    const name = newName.trim();
    if (!name) return;

    try {
      const res = await fetch("/api/admin/weapon-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Create failed");
      setRows((prev) => [data.row, ...prev]);
      setNewName("");
    } catch (e: any) {
      setErr(String(e?.message ?? "Create failed"));
    }
  }

  function startEdit(r: Row) {
    setEditingId(r.id);
    setEditingName(r.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveEdit() {
    if (editingId === null) return;
    setErr(null);

    const name = editingName.trim();
    if (!name) {
      setErr("Name is required");
      return;
    }

    try {
      const res = await fetch("/api/admin/weapon-attributes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Update failed");

      setRows((prev) => prev.map((r) => (r.id === editingId ? data.row : r)));
      cancelEdit();
    } catch (e: any) {
      setErr(String(e?.message ?? "Update failed"));
    }
  }

  async function deleteRow(id: number) {
    if (!confirm("Delete this weapon attribute?")) return;
    setErr(null);

    try {
      const res = await fetch("/api/admin/weapon-attributes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Delete failed");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      setErr(String(e?.message ?? "Delete failed"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="text-sm">New weapon attribute</label>
          <input
            className="mt-1 w-full rounded border bg-transparent p-2"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Keen, Brutal, Versatile..."
          />
        </div>
        <button
          className="rounded border px-4 py-2 text-sm"
          onClick={createRow}
          disabled={!newName.trim()}
          title={!newName.trim() ? "Enter a name" : "Create"}
        >
          Add
        </button>
        <button className="rounded border px-4 py-2 text-sm" onClick={load}>
          Refresh
        </button>
      </div>

      {err && <div className="rounded border p-3 text-sm">{err}</div>}

      <div className="rounded-lg border">
        <div className="border-b p-3 text-sm font-medium">
          Weapon Attributes ({sorted.length})
        </div>

        {loading ? (
          <div className="p-3 text-sm opacity-80">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="p-3 text-sm opacity-80">No weapon attributes yet.</div>
        ) : (
          <ul className="divide-y">
            {sorted.map((r) => (
              <li key={r.id} className="flex items-center gap-3 p-3">
                {editingId === r.id ? (
                  <>
                    <input
                      className="w-full rounded border bg-transparent p-2 text-sm"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                    />
                    <button className="rounded border px-3 py-2 text-sm" onClick={saveEdit}>
                      Save
                    </button>
                    <button className="rounded border px-3 py-2 text-sm" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 text-sm">{r.name}</div>
                    <button
                      className="rounded border px-3 py-2 text-sm"
                      onClick={() => startEdit(r)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded border px-3 py-2 text-sm"
                      onClick={() => deleteRow(r.id)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs opacity-70">
        Tip: if you delete something in use, the API should block it with a 409 —
        because even admins don’t get to violate physics. (Well, not without a spell slot.)
      </p>
    </div>
  );
}
