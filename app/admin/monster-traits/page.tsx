"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { MonsterTraitBand } from "@/lib/summoning/types";
import {
  MONSTER_TRAIT_MECHANICAL_OPERATIONS,
  MONSTER_TRAIT_MECHANICAL_TARGET_LABELS,
  MONSTER_TRAIT_MECHANICAL_TARGETS,
  evaluateMonsterTraitFormula,
  type MonsterTraitMechanicalEffectSummary,
  type MonsterTraitMechanicalOperation,
  type MonsterTraitMechanicalTarget,
} from "@/lib/summoning/traitMechanics";

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
  "[MonsterGuard]",
  "[MonsterFortitude]",
  "[MonsterIntellect]",
  "[MonsterSynergy]",
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
  MonsterGuard: "D6",
  MonsterFortitude: "D6",
  MonsterIntellect: "D4",
  MonsterSynergy: "D4",
  MonsterBravery: "D8",
  MonsterArmorSkill: 2,
  MonsterWeaponSkill: 3,
  MonsterWillpower: null,
  MonsterDodge: null,
};

const TRAIT_BANDS: MonsterTraitBand[] = ["MINOR", "STANDARD", "MAJOR", "BOSS"];
const TRAIT_AXIS_FIELDS = [
  { key: "physicalThreatWeight", label: "Physical Threat" },
  { key: "mentalThreatWeight", label: "Mental Threat" },
  { key: "physicalSurvivabilityWeight", label: "Physical Survivability" },
  { key: "mentalSurvivabilityWeight", label: "Mental Survivability" },
  { key: "manipulationWeight", label: "Manipulation" },
  { key: "synergyWeight", label: "Synergy" },
  { key: "mobilityWeight", label: "Mobility" },
  { key: "presenceWeight", label: "Presence" },
] as const;

const DEFAULT_MECHANICAL_EFFECT: MonsterTraitMechanicalEffectSummary = {
  sortOrder: 0,
  target: "PHYSICAL_RESILIENCE",
  operation: "ADD",
  valueExpression: "1",
};

type TraitAxisWeightKey = (typeof TRAIT_AXIS_FIELDS)[number]["key"];

type TraitAxisWeightInputs = Record<TraitAxisWeightKey, string>;

const DEFAULT_TRAIT_AXIS_WEIGHT_INPUTS: TraitAxisWeightInputs = {
  physicalThreatWeight: "0",
  mentalThreatWeight: "0",
  physicalSurvivabilityWeight: "0",
  mentalSurvivabilityWeight: "0",
  manipulationWeight: "0",
  synergyWeight: "0",
  mobilityWeight: "0",
  presenceWeight: "0",
};

type Row = {
  id: string;
  name: string;
  effectText: string | null;
  isEnabled: boolean;
  band: MonsterTraitBand;
  physicalThreatWeight: number;
  mentalThreatWeight: number;
  physicalSurvivabilityWeight: number;
  mentalSurvivabilityWeight: number;
  manipulationWeight: number;
  synergyWeight: number;
  mobilityWeight: number;
  presenceWeight: number;
  mechanicalEffects: MonsterTraitMechanicalEffectSummary[];
};

function parseAxisInputValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toAxisWeightPayload(inputs: TraitAxisWeightInputs): Record<TraitAxisWeightKey, number> {
  return Object.fromEntries(
    TRAIT_AXIS_FIELDS.map((field) => [field.key, parseAxisInputValue(inputs[field.key])]),
  ) as Record<TraitAxisWeightKey, number>;
}

function normalizeMechanicalEffectInputs(
  effects: MonsterTraitMechanicalEffectSummary[],
): MonsterTraitMechanicalEffectSummary[] {
  return effects
    .map((effect, index) => ({
      sortOrder: index,
      target: MONSTER_TRAIT_MECHANICAL_TARGETS.includes(
        effect.target as MonsterTraitMechanicalTarget,
      )
        ? effect.target
        : DEFAULT_MECHANICAL_EFFECT.target,
      operation: MONSTER_TRAIT_MECHANICAL_OPERATIONS.includes(
        effect.operation as MonsterTraitMechanicalOperation,
      )
        ? effect.operation
        : DEFAULT_MECHANICAL_EFFECT.operation,
      valueExpression: String(effect.valueExpression ?? "").trim(),
    }))
    .filter((effect) => effect.valueExpression.length > 0);
}

function formatMechanicalEffect(effect: MonsterTraitMechanicalEffectSummary): string {
  const label =
    MONSTER_TRAIT_MECHANICAL_TARGET_LABELS[
      effect.target as MonsterTraitMechanicalTarget
    ] ?? effect.target;
  return `${label}: ${effect.operation} ${effect.valueExpression}`;
}

function evaluateMechanicalEffectPreview(effect: MonsterTraitMechanicalEffectSummary): string {
  const value = evaluateMonsterTraitFormula(
    effect.valueExpression,
    SAMPLE_CTX as unknown as Parameters<typeof evaluateMonsterTraitFormula>[1],
  );
  return value === null ? "?" : String(Math.round(value * 100) / 100);
}

function normalizeMechanicalEffectsForUi(value: unknown): MonsterTraitMechanicalEffectSummary[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, index) => {
      const candidate = raw as {
        id?: unknown;
        sortOrder?: unknown;
        target?: unknown;
        operation?: unknown;
        valueExpression?: unknown;
      };
      const target = String(candidate.target ?? "");
      const operation = String(candidate.operation ?? "ADD");
      return {
        id: typeof candidate.id === "string" ? candidate.id : undefined,
        sortOrder: Number(candidate.sortOrder ?? index) || index,
        target: MONSTER_TRAIT_MECHANICAL_TARGETS.includes(
          target as MonsterTraitMechanicalTarget,
        )
          ? (target as MonsterTraitMechanicalTarget)
          : DEFAULT_MECHANICAL_EFFECT.target,
        operation: MONSTER_TRAIT_MECHANICAL_OPERATIONS.includes(
          operation as MonsterTraitMechanicalOperation,
        )
          ? (operation as MonsterTraitMechanicalOperation)
          : DEFAULT_MECHANICAL_EFFECT.operation,
        valueExpression: String(candidate.valueExpression ?? ""),
      };
    })
    .filter((effect) => effect.valueExpression.trim().length > 0);
}

function normalizeRowForUi(value: unknown): Row {
  const candidate = value as Row & { mechanicalEffects?: unknown };
  return {
    id: String(candidate.id ?? ""),
    name: String(candidate.name ?? ""),
    effectText: typeof candidate.effectText === "string" ? candidate.effectText : null,
    isEnabled: Boolean(candidate.isEnabled),
    band:
      candidate.band === "MINOR" ||
      candidate.band === "STANDARD" ||
      candidate.band === "MAJOR" ||
      candidate.band === "BOSS"
        ? candidate.band
        : "STANDARD",
    physicalThreatWeight: Number(candidate.physicalThreatWeight ?? 0) || 0,
    mentalThreatWeight: Number(candidate.mentalThreatWeight ?? 0) || 0,
    physicalSurvivabilityWeight: Number(candidate.physicalSurvivabilityWeight ?? 0) || 0,
    mentalSurvivabilityWeight: Number(candidate.mentalSurvivabilityWeight ?? 0) || 0,
    manipulationWeight: Number(candidate.manipulationWeight ?? 0) || 0,
    synergyWeight: Number(candidate.synergyWeight ?? 0) || 0,
    mobilityWeight: Number(candidate.mobilityWeight ?? 0) || 0,
    presenceWeight: Number(candidate.presenceWeight ?? 0) || 0,
    mechanicalEffects: normalizeMechanicalEffectsForUi(candidate.mechanicalEffects),
  };
}

export default function AdminMonsterTraitsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newEffectText, setNewEffectText] = useState("");
  const [newIsEnabled, setNewIsEnabled] = useState(true);
  const [newBand, setNewBand] = useState<MonsterTraitBand>("STANDARD");
  const [newWeights, setNewWeights] = useState<TraitAxisWeightInputs>(
    DEFAULT_TRAIT_AXIS_WEIGHT_INPUTS,
  );
  const [newMechanicalEffects, setNewMechanicalEffects] = useState<
    MonsterTraitMechanicalEffectSummary[]
  >([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingEffectText, setEditingEffectText] = useState("");
  const [editingIsEnabled, setEditingIsEnabled] = useState(true);
  const [editingBand, setEditingBand] = useState<MonsterTraitBand>("STANDARD");
  const [editingWeights, setEditingWeights] = useState<TraitAxisWeightInputs>(
    DEFAULT_TRAIT_AXIS_WEIGHT_INPUTS,
  );
  const [editingMechanicalEffects, setEditingMechanicalEffects] = useState<
    MonsterTraitMechanicalEffectSummary[]
  >([]);

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
      setRows(Array.isArray(data.rows) ? data.rows.map(normalizeRowForUi) : []);
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
          band: newBand,
          ...toAxisWeightPayload(newWeights),
          mechanicalEffects: normalizeMechanicalEffectInputs(newMechanicalEffects),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Create failed");
      setRows((prev) => [normalizeRowForUi(data.row), ...prev]);
      setNewName("");
      setNewEffectText("");
      setNewIsEnabled(true);
      setNewBand("STANDARD");
      setNewWeights(DEFAULT_TRAIT_AXIS_WEIGHT_INPUTS);
      setNewMechanicalEffects([]);
    } catch (e: unknown) {
      setErr(String((e as { message?: unknown })?.message ?? "Create failed"));
    }
  }

  function startEdit(row: Row) {
    setEditingId(row.id);
    setEditingName(row.name);
    setEditingEffectText(row.effectText ?? "");
    setEditingIsEnabled(row.isEnabled);
    setEditingBand(row.band);
    setEditingWeights({
      physicalThreatWeight: String(row.physicalThreatWeight),
      mentalThreatWeight: String(row.mentalThreatWeight),
      physicalSurvivabilityWeight: String(row.physicalSurvivabilityWeight),
      mentalSurvivabilityWeight: String(row.mentalSurvivabilityWeight),
      manipulationWeight: String(row.manipulationWeight),
      synergyWeight: String(row.synergyWeight),
      mobilityWeight: String(row.mobilityWeight),
      presenceWeight: String(row.presenceWeight),
    });
    setEditingMechanicalEffects(
      (row.mechanicalEffects ?? []).map((effect, index) => ({
        id: effect.id,
        sortOrder: index,
        target: effect.target,
        operation: effect.operation,
        valueExpression: effect.valueExpression,
      })),
    );
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingEffectText("");
    setEditingIsEnabled(true);
    setEditingBand("STANDARD");
    setEditingWeights(DEFAULT_TRAIT_AXIS_WEIGHT_INPUTS);
    setEditingMechanicalEffects([]);
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
          band: editingBand,
          ...toAxisWeightPayload(editingWeights),
          mechanicalEffects: normalizeMechanicalEffectInputs(editingMechanicalEffects),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Update failed");
      setRows((prev) =>
        prev.map((row) => (row.id === editingId ? normalizeRowForUi(data.row) : row)),
      );
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

  function renderTokenButtons(onInsert: (token: string) => void) {
    return (
      <div className="flex flex-wrap gap-2">
        {TRAIT_TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            className="rounded border px-2 py-1 text-[11px] font-mono opacity-90 hover:bg-zinc-900"
            onClick={() => onInsert(token)}
            title={`Insert ${token}`}
          >
            {token}
          </button>
        ))}
      </div>
    );
  }

  function renderMechanicalEffectsEditor(
    effects: MonsterTraitMechanicalEffectSummary[],
    setEffects: Dispatch<SetStateAction<MonsterTraitMechanicalEffectSummary[]>>,
  ) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Mechanical Effects</p>
            <p className="text-[11px] opacity-70">
              Structured rules applied by Summoning Circle. Use formulas like [MonsterLevel]*2.
            </p>
          </div>
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() =>
              setEffects((prev) => [
                ...prev,
                { ...DEFAULT_MECHANICAL_EFFECT, sortOrder: prev.length },
              ])
            }
          >
            Add Effect
          </button>
        </div>

        {effects.length === 0 ? (
          <p className="text-xs opacity-70">No mechanical effects.</p>
        ) : (
          <div className="space-y-2">
            {effects.map((effect, index) => (
              <div
                key={`${effect.id ?? "draft"}-${index}`}
                className="grid grid-cols-1 gap-2 rounded border border-zinc-800 p-2 md:grid-cols-[1.2fr_0.7fr_1fr_auto]"
              >
                <select
                  className="rounded border bg-transparent p-2 text-sm"
                  value={effect.target}
                  onChange={(e) =>
                    setEffects((prev) =>
                      prev.map((row, idx) =>
                        idx === index
                          ? {
                              ...row,
                              target: e.target.value as MonsterTraitMechanicalTarget,
                            }
                          : row,
                      ),
                    )
                  }
                >
                  {MONSTER_TRAIT_MECHANICAL_TARGETS.map((target) => (
                    <option key={target} value={target}>
                      {MONSTER_TRAIT_MECHANICAL_TARGET_LABELS[target]}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded border bg-transparent p-2 text-sm"
                  value={effect.operation}
                  onChange={(e) =>
                    setEffects((prev) =>
                      prev.map((row, idx) =>
                        idx === index
                          ? {
                              ...row,
                              operation: e.target.value as MonsterTraitMechanicalOperation,
                            }
                          : row,
                      ),
                    )
                  }
                >
                  {MONSTER_TRAIT_MECHANICAL_OPERATIONS.map((operation) => (
                    <option key={operation} value={operation}>
                      {operation}
                    </option>
                  ))}
                </select>
                <div className="space-y-1">
                  <input
                    className="w-full rounded border bg-transparent p-2 text-sm"
                    value={effect.valueExpression}
                    onChange={(e) =>
                      setEffects((prev) =>
                        prev.map((row, idx) =>
                          idx === index ? { ...row, valueExpression: e.target.value } : row,
                        ),
                      )
                    }
                    placeholder="e.g. [MonsterLevel]*2"
                  />
                  <p className="text-[11px] opacity-70">
                    Sample result: {evaluateMechanicalEffectPreview(effect)}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs hover:bg-zinc-900"
                  onClick={() =>
                    setEffects((prev) =>
                      prev
                        .filter((_row, idx) => idx !== index)
                        .map((row, idx) => ({ ...row, sortOrder: idx })),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <a className="text-sm underline" href="/admin">
        ← Back to Admin Dashboard
      </a>
      <div className="rounded border p-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
        <div className="md:col-span-1">
          <label className="text-sm">Trait name</label>
          <input
            className="mt-1 w-full rounded border bg-transparent p-2"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Tough"
          />
        </div>
        <label className="mt-7 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={newIsEnabled}
            onChange={(e) => setNewIsEnabled(e.target.checked)}
          />
          Enabled
        </label>
        <div className="md:col-span-2">
          <label className="text-sm">Effect text</label>
          <textarea
            className="mt-1 h-24 w-full rounded border bg-transparent p-2 text-sm"
            value={newEffectText}
            onChange={(e) => setNewEffectText(e.target.value)}
            placeholder="Trait effect description"
          />
          <div className="mt-2">
            {renderTokenButtons((token) => setNewEffectText((prev) => `${prev}${token}`))}
          </div>
          <p className="mt-2 text-[11px] opacity-70">
            Arithmetic is supported in formulas and templated text, e.g. [MonsterLevel]*2 or ceil([MonsterLevel]/2).
          </p>
        </div>
        <div className="md:col-span-1">
          <p className="text-xs font-medium opacity-80">Effect preview</p>
          <div className="mt-1 min-h-24 rounded border p-2 text-sm">
            {renderTraitTemplate(newEffectText || "", SAMPLE_CTX) || (
              <span className="opacity-70">Nothing to preview.</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-sm">Trait Band</label>
          <select
            className="mt-1 w-full rounded border bg-transparent p-2"
            value={newBand}
            onChange={(e) => setNewBand(e.target.value as MonsterTraitBand)}
          >
            {TRAIT_BANDS.map((band) => (
              <option key={band} value={band}>
                {band}
              </option>
            ))}
          </select>
        </div>
        {TRAIT_AXIS_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="text-sm">{field.label}</label>
            <input
              type="number"
              step="any"
              className="mt-1 w-full rounded border bg-transparent p-2"
              value={newWeights[field.key]}
              onChange={(e) =>
                setNewWeights((prev) => ({
                  ...prev,
                  [field.key]: e.target.value,
                }))
              }
            />
          </div>
        ))}
      </div>

      {renderMechanicalEffectsEditor(newMechanicalEffects, setNewMechanicalEffects)}

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
                    <div className="md:col-span-2 space-y-2">
                      <textarea
                        className="h-24 w-full rounded border bg-transparent p-2 text-sm"
                        value={editingEffectText}
                        onChange={(e) => setEditingEffectText(e.target.value)}
                      />
                      {renderTokenButtons((token) =>
                        setEditingEffectText((prev) => `${prev}${token}`),
                      )}
                    </div>
                    <div className="rounded border p-2">
                      <p className="text-xs font-medium mb-1">Effect preview</p>
                      <p className="text-xs opacity-90">
                        {renderTraitTemplate(editingEffectText || "", SAMPLE_CTX) || (
                          <span className="opacity-70">-</span>
                        )}
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
                    <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                      <div>
                        <label className="text-sm">Trait Band</label>
                        <select
                          className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                          value={editingBand}
                          onChange={(e) => setEditingBand(e.target.value as MonsterTraitBand)}
                        >
                          {TRAIT_BANDS.map((band) => (
                            <option key={band} value={band}>
                              {band}
                            </option>
                          ))}
                        </select>
                      </div>
                      {TRAIT_AXIS_FIELDS.map((field) => (
                        <div key={field.key}>
                          <label className="text-sm">{field.label}</label>
                          <input
                            type="number"
                            step="any"
                            className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
                            value={editingWeights[field.key]}
                            onChange={(e) =>
                              setEditingWeights((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <div className="md:col-span-4">
                      {renderMechanicalEffectsEditor(
                        editingMechanicalEffects,
                        setEditingMechanicalEffects,
                      )}
                    </div>
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
                        {row.isEnabled ? "Enabled" : "Disabled"} | Band: {row.band}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {TRAIT_AXIS_FIELDS.map((field) => (
                          <span key={`${row.id}-${field.key}`} className="rounded border px-2 py-1 text-[11px] opacity-80">
                            {field.label}: {row[field.key]}
                          </span>
                        ))}
                      </div>
                      {row.mechanicalEffects.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {row.mechanicalEffects.map((effect, index) => (
                            <span
                              key={`${row.id}-mechanical-${index}`}
                              className="rounded border border-emerald-800/70 px-2 py-1 text-[11px] opacity-80"
                            >
                              {formatMechanicalEffect(effect)}
                            </span>
                          ))}
                        </div>
                      )}
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

