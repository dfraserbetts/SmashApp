"use client";

import { useEffect, useMemo, useState } from "react";

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";

function dieNumeric(value: DiceSize | null | undefined): number | null {
  if (!value) return null;
  const raw = value.replace("D", "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function safeEvalArithmetic(expr: string): number | null {
  const input = expr.replace(/\s+/g, "");
  if (!input) return null;
  if (!/^[0-9+\-*/().]+$/.test(input)) return null;

  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if ("+-*/()".includes(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) j += 1;
      const num = input.slice(i, j);
      if (num.split(".").length > 2) return null;
      tokens.push(num);
      i = j;
      continue;
    }
    return null;
  }

  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const output: string[] = [];
  const ops: string[] = [];

  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t];
    const prev = t === 0 ? null : tokens[t - 1];

    if (
      tok === "-" &&
      (prev === null || prev === "(" || prev === "+" || prev === "-" || prev === "*" || prev === "/")
    ) {
      output.push("0");
      ops.push("-");
      continue;
    }

    if (/^[0-9.]+$/.test(tok)) {
      const n = Number(tok);
      if (!Number.isFinite(n)) return null;
      output.push(tok);
      continue;
    }

    if (tok === "(") {
      ops.push(tok);
      continue;
    }

    if (tok === ")") {
      while (ops.length > 0 && ops[ops.length - 1] !== "(") {
        output.push(ops.pop() as string);
      }
      if (ops.pop() !== "(") return null;
      continue;
    }

    if (tok in prec) {
      while (
        ops.length > 0 &&
        ops[ops.length - 1] in prec &&
        prec[ops[ops.length - 1]] >= prec[tok]
      ) {
        output.push(ops.pop() as string);
      }
      ops.push(tok);
      continue;
    }

    return null;
  }

  while (ops.length > 0) {
    const op = ops.pop() as string;
    if (op === "(" || op === ")") return null;
    output.push(op);
  }

  const stack: number[] = [];
  for (const tok of output) {
    if (/^[0-9.]+$/.test(tok)) {
      const n = Number(tok);
      if (!Number.isFinite(n)) return null;
      stack.push(n);
      continue;
    }
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) return null;

    if (tok === "+") stack.push(a + b);
    else if (tok === "-") stack.push(a - b);
    else if (tok === "*") stack.push(a * b);
    else if (tok === "/") {
      if (b === 0) return null;
      stack.push(a / b);
    } else return null;
  }

  if (stack.length !== 1) return null;
  return stack[0];
}

function renderTraitTemplate(template: string, ctx: Record<string, unknown>): string {
  if (!template) return template;

  const tokenToString = (tokenName: string): string => {
    const val = ctx[tokenName];
    if (val === null || val === undefined) return "?";
    if (typeof val === "string") {
      if (/^D(4|6|8|10|12)$/.test(val)) return `d${val.replace("D", "")}`;
      return val;
    }
    if (typeof val === "number" && Number.isFinite(val)) return String(val);
    return "?";
  };

  const tokenToNumber = (tokenName: string): number | null => {
    const val = ctx[tokenName];
    if (val === null || val === undefined) return null;
    if (typeof val === "number" && Number.isFinite(val)) return val;
    if (typeof val === "string" && /^D(4|6|8|10|12)$/.test(val)) return dieNumeric(val as DiceSize);
    return null;
  };

  const evaluateExpression = (
    expr: string,
    wrapper: "ceil" | "floor" | "round" | null,
  ): string | null => {
    const trimmedExpr = expr.trim();
    if (!trimmedExpr) return wrapper ? "?" : null;
    if (!/\[[A-Za-z0-9]+\]/.test(trimmedExpr)) return null;

    const replaced = trimmedExpr.replace(/\[([A-Za-z0-9]+)\]/g, (_m, rawKey: string) => {
      const n = tokenToNumber(rawKey);
      return n === null ? "?" : String(n);
    });

    if (replaced.includes("?")) return "?";

    const value = safeEvalArithmetic(replaced);
    if (value === null) return "?";

    let finalValue = value;
    if (wrapper === "ceil") finalValue = Math.ceil(value);
    else if (wrapper === "floor") finalValue = Math.floor(value);
    else if (wrapper === "round") finalValue = Math.round(value);

    if (wrapper) return String(finalValue);

    const asInt = Math.trunc(finalValue);
    if (Math.abs(finalValue - asInt) < 1e-9) return String(asInt);
    return String(Math.round(finalValue * 100) / 100);
  };

  let out = template.replace(
    /\((ceil|floor|round)\s*\(\s*([^()]*)\s*\)\)/g,
    (full, rawWrapper: string, inner: string) => {
      const wrapper = rawWrapper as "ceil" | "floor" | "round";
      const evaluated = evaluateExpression(inner, wrapper);
      return evaluated === null ? full : evaluated;
    },
  );

  out = out.replace(/\(([^()]*)\)/g, (full, inner: string) => {
    const evaluated = evaluateExpression(inner, null);
    return evaluated === null ? full : evaluated;
  });

  out = out.replace(/\[([A-Za-z0-9]+)\]/g, (_m, rawKey: string) => tokenToString(rawKey));
  return out;
}

const TRAIT_TOKENS = [
  "[MonsterName]",
  "[MonsterLevel]",
  "[MonsterAttack]",
  "[MonsterDefence]",
  "[MonsterFortitude]",
  "[MonsterIntellect]",
  "[MonsterSupport]",
  "[MonsterBravery]",
  "[MonsterArmorSkill]",
  "[MonsterWeaponSkill]",
  "[MonsterWillpower]",
  "[MonsterDodge]",
];

const SAMPLE_CTX: Record<string, unknown> = {
  MonsterName: "Sample Monster",
  MonsterLevel: 6,
  MonsterAttack: "D8",
  MonsterDefence: "D6",
  MonsterFortitude: "D6",
  MonsterIntellect: "D4",
  MonsterSupport: "D4",
  MonsterBravery: "D8",
  MonsterArmorSkill: 2,
  MonsterWeaponSkill: 3,
  MonsterWillpower: null,
  MonsterDodge: null,
};

type Row = {
  id: string;
  name: string;
  effectText: string | null;
  isEnabled: boolean;
};

export default function AdminMonsterTraitsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newEffectText, setNewEffectText] = useState("");
  const [newIsEnabled, setNewIsEnabled] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingEffectText, setEditingEffectText] = useState("");
  const [editingIsEnabled, setEditingIsEnabled] = useState(true);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/monster-traits", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e: unknown) {
      setErr(String((e as { message?: unknown })?.message ?? "Failed to load"));
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
      const res = await fetch("/api/admin/monster-traits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          effectText: newEffectText.trim() || null,
          isEnabled: newIsEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Create failed");
      setRows((prev) => [data.row, ...prev]);
      setNewName("");
      setNewEffectText("");
      setNewIsEnabled(true);
    } catch (e: unknown) {
      setErr(String((e as { message?: unknown })?.message ?? "Create failed"));
    }
  }

  function startEdit(row: Row) {
    setEditingId(row.id);
    setEditingName(row.name);
    setEditingEffectText(row.effectText ?? "");
    setEditingIsEnabled(row.isEnabled);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingEffectText("");
    setEditingIsEnabled(true);
  }

  async function saveEdit() {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) {
      setErr("Name is required");
      return;
    }

    setErr(null);
    try {
      const res = await fetch("/api/admin/monster-traits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name,
          effectText: editingEffectText.trim() || null,
          isEnabled: editingIsEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Update failed");
      setRows((prev) => prev.map((row) => (row.id === editingId ? data.row : row)));
      cancelEdit();
    } catch (e: unknown) {
      setErr(String((e as { message?: unknown })?.message ?? "Update failed"));
    }
  }

  async function deleteRow(id: string) {
    if (!window.confirm("Delete this monster trait?")) return;
    setErr(null);
    try {
      const res = await fetch("/api/admin/monster-traits", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Delete failed");
      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch (e: unknown) {
      setErr(String((e as { message?: unknown })?.message ?? "Delete failed"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-1">
          <label className="text-sm">Trait name</label>
          <input
            className="mt-1 w-full rounded border bg-transparent p-2"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Tough"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm">Effect text</label>
          <input
            className="mt-1 w-full rounded border bg-transparent p-2"
            value={newEffectText}
            onChange={(e) => setNewEffectText(e.target.value)}
            placeholder="Trait effect description"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={newIsEnabled}
            onChange={(e) => setNewIsEnabled(e.target.checked)}
          />
          Enabled
        </label>
      </div>

      <div className="flex gap-3">
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

      <div className="rounded border p-3 space-y-2">
        <p className="text-sm font-medium">Trait templating</p>
        <p className="text-xs opacity-80">
          You can use tokens like <span className="font-mono">[MonsterLevel]</span>. Arithmetic is supported only inside parentheses, e.g. <span className="font-mono">([MonsterLevel]/2)</span>.
          Unknown tokens or invalid expressions render as <span className="font-mono">?</span>.
        </p>

        <div className="flex flex-wrap gap-2">
          {TRAIT_TOKENS.map((t) => (
            <span key={t} className="rounded border px-2 py-1 text-xs font-mono opacity-90">
              {t}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="rounded border p-2">
            <p className="text-xs font-medium mb-1">Example</p>
            <p className="text-xs font-mono opacity-80">
              [MonsterName] recovers ([MonsterLevel]/2) wounds at the start of each of its turns.
            </p>
            <p className="mt-1 text-xs font-mono opacity-80">
              [MonsterName] recovers (ceil([MonsterLevel]/2)) wounds at the start of each of its turns.
            </p>
          </div>
          <div className="rounded border p-2">
            <p className="text-xs font-medium mb-1">Rendered preview (sample context)</p>
            <p className="text-xs opacity-90">
              {renderTraitTemplate(
                "[MonsterName] recovers ([MonsterLevel]/2) wounds at the start of each of its turns.",
                SAMPLE_CTX,
              )}
            </p>
            <p className="mt-1 text-xs opacity-90">
              {renderTraitTemplate(
                "[MonsterName] recovers (ceil([MonsterLevel]/2)) wounds at the start of each of its turns.",
                SAMPLE_CTX,
              )}
            </p>
          </div>
        </div>

        <div className="rounded border p-2">
          <p className="text-xs font-medium mb-1">Your current "Effect text" preview</p>
          <p className="text-xs opacity-90">
            {renderTraitTemplate(newEffectText || "", SAMPLE_CTX) || <span className="opacity-70">-</span>}
          </p>
        </div>
      </div>

      {err && <div className="rounded border p-3 text-sm">{err}</div>}

      <div className="rounded-lg border">
        <div className="border-b p-3 text-sm font-medium">
          Monster Traits ({sorted.length})
        </div>

        {loading ? (
          <div className="p-3 text-sm opacity-80">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="p-3 text-sm opacity-80">No traits yet.</div>
        ) : (
          <ul className="divide-y">
            {sorted.map((row) => (
              <li key={row.id} className="p-3 space-y-2">
                {editingId === row.id ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                    <input
                      className="w-full rounded border bg-transparent p-2 text-sm"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                    />
                    <input
                      className="md:col-span-2 w-full rounded border bg-transparent p-2 text-sm"
                      value={editingEffectText}
                      onChange={(e) => setEditingEffectText(e.target.value)}
                    />
                    <div className="md:col-span-4 rounded border p-2">
                      <p className="text-xs font-medium mb-1">Rendered preview (sample context)</p>
                      <p className="text-xs opacity-90">
                        {renderTraitTemplate(editingEffectText || "", SAMPLE_CTX) || <span className="opacity-70">-</span>}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editingIsEnabled}
                        onChange={(e) => setEditingIsEnabled(e.target.checked)}
                      />
                      Enabled
                    </label>
                    <div className="md:col-span-4 flex gap-2">
                      <button className="rounded border px-3 py-2 text-sm" onClick={saveEdit}>
                        Save
                      </button>
                      <button className="rounded border px-3 py-2 text-sm" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{row.name}</p>
                      <p className="text-xs opacity-80">{row.effectText ?? "No description"}</p>
                      <p className="text-[11px] opacity-70 mt-1">
                        {row.isEnabled ? "Enabled" : "Disabled"}
                      </p>
                    </div>
                    <button className="rounded border px-3 py-2 text-sm" onClick={() => startEdit(row)}>
                      Edit
                    </button>
                    <button className="rounded border px-3 py-2 text-sm" onClick={() => deleteRow(row.id)}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

