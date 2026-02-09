"use client";

import { useEffect, useMemo, useState } from "react";

type TemplateType = "PLAYER" | "MYTHIC_ITEM" | "MONSTER";
type Tier = "PUSH" | "BREAK" | "TRANSCEND";
type Intention =
  | "ATTACK"
  | "DEFENCE"
  | "HEALING"
  | "MOVEMENT"
  | "CLEANSE"
  | "CONTROL"
  | "AUGMENT"
  | "DEBUFF"
  | "SUMMONING"
  | "TRANSFORMATION"
  | "SUPPORT";

type Row = {
  id: string;
  name: string;
  templateType: TemplateType;
  tier: Tier;
  thresholdPercent: number;
  description: string | null;
  intention: Intention | null;
  itemType: string | null;
  monsterCategory: string | null;
  baseCostKey: string | null;
  baseCostParams: unknown;
  successEffectKey: string | null;
  successEffectParams: unknown;
  isPersistent: boolean;
  persistentStateText: string | null;
  endConditionText: string | null;
  endCostText: string | null;
  failForwardEnabled: boolean;
  failForwardEffectKey: string | null;
  failForwardEffectParams: unknown;
  failForwardCostAKey: string | null;
  failForwardCostBKey: string | null;
  createdAt: string;
  updatedAt: string;
};

type EditorState = {
  id: string | null;
  name: string;
  templateType: TemplateType;
  tier: Tier;
  description: string;
  intention: Intention | "";
  itemType: string;
  monsterCategory: string;
  baseCostKey: string;
  baseCostParams: string;
  successEffectKey: string;
  successEffectParams: string;
  isPersistent: boolean;
  persistentStateText: string;
  endConditionText: string;
  endCostText: string;
  failForwardEnabled: boolean;
  failForwardEffectKey: string;
  failForwardEffectParams: string;
  failForwardCostAKey: string;
  failForwardCostBKey: string;
};

const THRESHOLD_BY_TIER: Record<Tier, number> = {
  PUSH: 60,
  BREAK: 85,
  TRANSCEND: 125,
};

const ITEM_TYPES = ["WEAPON", "SHIELD", "HELMET", "ARMOR", "OTHER"];
const INTENTIONS: Intention[] = [
  "ATTACK",
  "DEFENCE",
  "HEALING",
  "MOVEMENT",
  "CLEANSE",
  "CONTROL",
  "AUGMENT",
  "DEBUFF",
  "SUMMONING",
  "TRANSFORMATION",
  "SUPPORT",
];

function toJsonText(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function emptyEditor(): EditorState {
  return {
    id: null,
    name: "",
    templateType: "PLAYER",
    tier: "PUSH",
    description: "",
    intention: "",
    itemType: "",
    monsterCategory: "",
    baseCostKey: "",
    baseCostParams: "{}",
    successEffectKey: "",
    successEffectParams: "{}",
    isPersistent: false,
    persistentStateText: "",
    endConditionText: "",
    endCostText: "",
    failForwardEnabled: false,
    failForwardEffectKey: "",
    failForwardEffectParams: "{}",
    failForwardCostAKey: "",
    failForwardCostBKey: "",
  };
}

function rowToEditor(row: Row): EditorState {
  return {
    id: row.id,
    name: row.name,
    templateType: row.templateType,
    tier: row.tier,
    description: row.description ?? "",
    intention: row.intention ?? "",
    itemType: row.itemType ?? "",
    monsterCategory: row.monsterCategory ?? "",
    baseCostKey: row.baseCostKey ?? "",
    baseCostParams: toJsonText(row.baseCostParams),
    successEffectKey: row.successEffectKey ?? "",
    successEffectParams: toJsonText(row.successEffectParams),
    isPersistent: row.isPersistent,
    persistentStateText: row.persistentStateText ?? "",
    endConditionText: row.endConditionText ?? "",
    endCostText: row.endCostText ?? "",
    failForwardEnabled: row.failForwardEnabled,
    failForwardEffectKey: row.failForwardEffectKey ?? "",
    failForwardEffectParams: toJsonText(row.failForwardEffectParams),
    failForwardCostAKey: row.failForwardCostAKey ?? "",
    failForwardCostBKey: row.failForwardCostBKey ?? "",
  };
}

function gatingLabel(row: Row): string {
  if (row.templateType === "PLAYER") return row.intention ?? "-";
  if (row.templateType === "MYTHIC_ITEM") return row.itemType ?? "-";
  return row.monsterCategory ?? "-";
}

function getApiErrorMessage(
  status: number,
  payload: { error?: unknown; detail?: unknown } | null | undefined,
  fallback: string,
): string {
  if (status === 401) return "Unauthorized: please sign in again.";
  if (status === 403) return "Forbidden: admin access required.";

  const base =
    typeof payload?.error === "string" && payload.error.trim().length > 0
      ? payload.error
      : fallback;
  const detail =
    typeof payload?.detail === "string" && payload.detail.trim().length > 0
      ? payload.detail
      : null;

  return detail ? `${base}: ${detail}` : base;
}

export default function AdminLimitBreakTemplatesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());

  const thresholdPercent = THRESHOLD_BY_TIER[editor.tier];
  const showPersistence =
    editor.templateType === "PLAYER" &&
    (editor.intention === "SUMMONING" || editor.intention === "TRANSFORMATION");

  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [rows],
  );

  async function loadRows(selectId?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/limit-break-templates", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(
            res.status,
            data as { error?: unknown; detail?: unknown },
            "Failed to load templates",
          ),
        );
      }

      const nextRows = (data.rows ?? []) as Row[];
      setRows(nextRows);

      if (selectId) {
        const found = nextRows.find((r) => r.id === selectId);
        if (found) {
          setEditor(rowToEditor(found));
        }
      } else if (editor.id) {
        const found = nextRows.find((r) => r.id === editor.id);
        if (found) {
          setEditor(rowToEditor(found));
        } else {
          setEditor(emptyEditor());
        }
      }
    } catch (e: any) {
      setError(String(e?.message ?? "Failed to load templates"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setEditor((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }

  function createNew() {
    setSaveError(null);
    setEditor(emptyEditor());
  }

  async function saveTemplate() {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        id: editor.id,
        name: editor.name,
        templateType: editor.templateType,
        tier: editor.tier,
        thresholdPercent,
        description: editor.description,
        intention: editor.intention || null,
        itemType: editor.itemType || null,
        monsterCategory: editor.monsterCategory || null,
        baseCostKey: editor.baseCostKey || null,
        baseCostParams: editor.baseCostParams,
        successEffectKey: editor.successEffectKey || null,
        successEffectParams: editor.successEffectParams,
        isPersistent: editor.isPersistent,
        persistentStateText: editor.persistentStateText || null,
        endConditionText: editor.endConditionText || null,
        endCostText: editor.endCostText || null,
        failForwardEnabled: editor.failForwardEnabled,
        failForwardEffectKey: editor.failForwardEffectKey || null,
        failForwardEffectParams: editor.failForwardEffectParams,
        failForwardCostAKey: editor.failForwardCostAKey || null,
        failForwardCostBKey: editor.failForwardCostBKey || null,
      };

      const method = editor.id ? "PUT" : "POST";
      const res = await fetch("/api/admin/limit-break-templates", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(
            res.status,
            data as { error?: unknown; detail?: unknown },
            "Save failed",
          ),
        );
      }

      const row = data.row as Row;
      setEditor(rowToEditor(row));
      await loadRows(row.id);
    } catch (e: any) {
      setSaveError(String(e?.message ?? "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} template(s)?`)) return;

    setDeleting(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/limit-break-templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(
            res.status,
            data as { error?: unknown; detail?: unknown },
            "Delete failed",
          ),
        );
      }

      const deletedSet = new Set(selectedIds);
      setRows((prev) => prev.filter((r) => !deletedSet.has(r.id)));
      setSelectedIds([]);
      if (editor.id && deletedSet.has(editor.id)) {
        setEditor(emptyEditor());
      }
    } catch (e: any) {
      setSaveError(String(e?.message ?? "Delete failed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button className="rounded border px-3 py-2 text-sm" onClick={createNew}>
          Create New
        </button>
        <button
          className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          onClick={deleteSelected}
          disabled={selectedIds.length === 0 || deleting}
        >
          {deleting ? "Deleting..." : "Delete Selected"}
        </button>
      </div>

      {error && <div className="rounded border p-3 text-sm">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border">
          <div className="border-b p-3 text-sm font-medium">
            Templates ({rows.length})
          </div>
          {loading ? (
            <div className="p-3 text-sm opacity-70">Loading...</div>
          ) : sortedRows.length === 0 ? (
            <div className="p-3 text-sm opacity-70">No templates yet.</div>
          ) : (
            <div className="max-h-[75vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Sel</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Tier</th>
                    <th className="p-2">Intention/Item</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-b ${
                        editor.id === row.id ? "bg-white/5" : ""
                      }`}
                      onClick={() => {
                        setSaveError(null);
                        setEditor(rowToEditor(row));
                      }}
                    >
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={(e) => toggleSelected(row.id, e.target.checked)}
                        />
                      </td>
                      <td className="p-2">{row.name}</td>
                      <td className="p-2">{row.templateType}</td>
                      <td className="p-2">{row.tier}</td>
                      <td className="p-2">{gatingLabel(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded border p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">Template Editor</h2>
            <button
              className="rounded border px-3 py-2 text-sm disabled:opacity-50"
              onClick={saveTemplate}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          {saveError && <div className="rounded border p-2 text-sm">{saveError}</div>}

          <div>
            <label className="text-xs opacity-80">Name</label>
            <input
              className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
              value={editor.name}
              onChange={(e) => setField("name", e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs opacity-80">Template Type</label>
              <select
                className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                value={editor.templateType}
                onChange={(e) =>
                  setField("templateType", e.target.value as TemplateType)
                }
              >
                <option value="PLAYER">PLAYER</option>
                <option value="MYTHIC_ITEM">MYTHIC_ITEM</option>
                <option value="MONSTER">MONSTER</option>
              </select>
            </div>
            <div>
              <label className="text-xs opacity-80">Tier</label>
              <select
                className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                value={editor.tier}
                onChange={(e) => setField("tier", e.target.value as Tier)}
              >
                <option value="PUSH">PUSH</option>
                <option value="BREAK">BREAK</option>
                <option value="TRANSCEND">TRANSCEND</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs opacity-80">Threshold Percent</label>
            <input
              readOnly
              className="mt-1 w-full rounded border bg-transparent p-2 text-sm opacity-80"
              value={thresholdPercent}
            />
          </div>

          <div>
            <label className="text-xs opacity-80">Description</label>
            <textarea
              className="mt-1 min-h-16 w-full rounded border bg-transparent p-2 text-sm"
              value={editor.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          {editor.templateType === "PLAYER" && (
            <div>
              <label className="text-xs opacity-80">Intention</label>
              <select
                className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                value={editor.intention}
                onChange={(e) =>
                  setField("intention", e.target.value as Intention | "")
                }
              >
                <option value="">Select intention</option>
                {INTENTIONS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
          )}

          {editor.templateType === "MYTHIC_ITEM" && (
            <div>
              <label className="text-xs opacity-80">Item Type</label>
              <select
                className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                value={editor.itemType}
                onChange={(e) => setField("itemType", e.target.value)}
              >
                <option value="">Select item type</option>
                {ITEM_TYPES.map((itemType) => (
                  <option key={itemType} value={itemType}>
                    {itemType}
                  </option>
                ))}
              </select>
            </div>
          )}

          {editor.templateType === "MONSTER" && (
            <div>
              <label className="text-xs opacity-80">Monster Category</label>
              <input
                className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                value={editor.monsterCategory}
                onChange={(e) => setField("monsterCategory", e.target.value)}
              />
            </div>
          )}

          <div className="rounded border p-2">
            <div className="mb-2 text-sm font-medium">Base/Success Keys + Params</div>
            <div className="space-y-2">
              <input
                className="w-full rounded border bg-transparent p-2 text-sm"
                placeholder="baseCostKey"
                value={editor.baseCostKey}
                onChange={(e) => setField("baseCostKey", e.target.value)}
              />
              <textarea
                className="min-h-20 w-full rounded border bg-transparent p-2 font-mono text-xs"
                placeholder="baseCostParams JSON"
                value={editor.baseCostParams}
                onChange={(e) => setField("baseCostParams", e.target.value)}
              />
              <input
                className="w-full rounded border bg-transparent p-2 text-sm"
                placeholder="successEffectKey"
                value={editor.successEffectKey}
                onChange={(e) => setField("successEffectKey", e.target.value)}
              />
              <textarea
                className="min-h-20 w-full rounded border bg-transparent p-2 font-mono text-xs"
                placeholder="successEffectParams JSON"
                value={editor.successEffectParams}
                onChange={(e) => setField("successEffectParams", e.target.value)}
              />
            </div>
          </div>

          {showPersistence && (
            <div className="rounded border p-2">
              <div className="mb-2 text-sm font-medium">Persistence</div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editor.isPersistent}
                  onChange={(e) => setField("isPersistent", e.target.checked)}
                />
                isPersistent
              </label>
              <textarea
                className="mt-2 min-h-16 w-full rounded border bg-transparent p-2 text-sm"
                placeholder="persistentStateText"
                value={editor.persistentStateText}
                onChange={(e) => setField("persistentStateText", e.target.value)}
              />
              <textarea
                className="mt-2 min-h-16 w-full rounded border bg-transparent p-2 text-sm"
                placeholder="endConditionText"
                value={editor.endConditionText}
                onChange={(e) => setField("endConditionText", e.target.value)}
              />
              <textarea
                className="mt-2 min-h-16 w-full rounded border bg-transparent p-2 text-sm"
                placeholder="endCostText"
                value={editor.endCostText}
                onChange={(e) => setField("endCostText", e.target.value)}
              />
            </div>
          )}

          <div className="rounded border p-2">
            <div className="mb-2 text-sm font-medium">Fail-forward</div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editor.failForwardEnabled}
                onChange={(e) => setField("failForwardEnabled", e.target.checked)}
              />
              failForwardEnabled
            </label>
            <input
              className="mt-2 w-full rounded border bg-transparent p-2 text-sm"
              placeholder="failForwardEffectKey"
              value={editor.failForwardEffectKey}
              onChange={(e) => setField("failForwardEffectKey", e.target.value)}
            />
            <textarea
              className="mt-2 min-h-20 w-full rounded border bg-transparent p-2 font-mono text-xs"
              placeholder="failForwardEffectParams JSON"
              value={editor.failForwardEffectParams}
              onChange={(e) =>
                setField("failForwardEffectParams", e.target.value)
              }
            />
            <input
              className="mt-2 w-full rounded border bg-transparent p-2 text-sm"
              placeholder="failForwardCostAKey"
              value={editor.failForwardCostAKey}
              onChange={(e) => setField("failForwardCostAKey", e.target.value)}
            />
            <input
              className="mt-2 w-full rounded border bg-transparent p-2 text-sm"
              placeholder="failForwardCostBKey"
              value={editor.failForwardCostBKey}
              onChange={(e) => setField("failForwardCostBKey", e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

