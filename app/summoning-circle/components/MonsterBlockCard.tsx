"use client";

import { useMemo } from "react";
import type {
  DiceSize,
  MonsterAttack,
  MonsterNaturalAttackConfig,
  MonsterUpsertInput,
} from "@/lib/summoning/types";
import {
  getArmorSkillDiceCountFromAttributes,
  getWeaponSkillDiceCountFromAttributes,
} from "@/lib/summoning/attributes";
import {
  getHighestItemModifiers,
  getProtectionTotalsFromItems,
  type MonsterModifierField,
  type SummoningEquipmentItem,
} from "@/lib/summoning/equipment";
import {
  effectiveCooldownTurns,
  formatModifierWithEffective,
  renderAttackActionLines,
  renderPowerDurationText,
  renderPowerStackCleanupText,
  renderPowerSuccessClause,
} from "@/lib/summoning/render";

export type WeaponProjection = {
  id: string;
  name: string;
  imageUrl?: string | null;
  type: "WEAPON" | "SHIELD" | "ARMOR" | "ITEM" | "CONSUMABLE";
  size: "SMALL" | "ONE_HANDED" | "TWO_HANDED" | null;
  armorLocation: "HEAD" | "SHOULDERS" | "TORSO" | "LEGS" | "FEET" | null;
  ppv: number | null;
  mpv: number | null;
  globalAttributeModifiers?: Array<{ attribute?: string; amount?: number }>;
  melee: MonsterNaturalAttackConfig["melee"];
  ranged: MonsterNaturalAttackConfig["ranged"];
  aoe: MonsterNaturalAttackConfig["aoe"];
};

type MonsterBlockCardProps = {
  monster: MonsterUpsertInput;
  weaponById?: Record<string, WeaponProjection>;
  className?: string;
};

const ATTR_ROWS = [
  ["Attack", "attackDie", "attackResistDie", "attackModifier"],
  ["Defence", "defenceDie", "defenceResistDie", "defenceModifier"],
  ["Fortitude", "fortitudeDie", "fortitudeResistDie", "fortitudeModifier"],
  ["Intellect", "intellectDie", "intellectResistDie", "intellectModifier"],
  ["Support", "supportDie", "supportResistDie", "supportModifier"],
  ["Bravery", "braveryDie", "braveryResistDie", "braveryModifier"],
] as const;

function dieLabel(value: DiceSize | null | undefined): string {
  if (!value) return "-";
  return `d${value.replace("D", "")}`;
}

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

function renderTraitTemplate(
  template: string,
  ctx: Record<string, unknown>,
): string {
  if (!template) return template;

  const tokenToString = (tokenName: string): string => {
    const val = ctx[tokenName];
    if (val === null || val === undefined) return "?";
    if (typeof val === "string" && /^D(4|6|8|10|12)$/.test(val)) {
      return `d${val.replace("D", "")}`;
    }
    if (typeof val === "string") return val;
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

function parseHeaderLine(line: string): { header: string; text: string } {
  const parts = String(line).split("||");
  if (parts.length < 2) return { header: "", text: line };
  return { header: parts[0].trim(), text: parts.slice(1).join("||").trim() };
}

function formatTierLabel(value: string): string {
  if (!value) return value;
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getRenderableNaturalAttacks(monster: MonsterUpsertInput): MonsterAttack[] {
  if (Array.isArray(monster.attacks) && monster.attacks.length > 0) {
    return [...monster.attacks].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  if (!monster.naturalAttack) return [];
  return [
    {
      sortOrder: 0,
      attackMode: "NATURAL",
      attackName: monster.naturalAttack.attackName ?? "Natural Weapon",
      attackConfig: monster.naturalAttack.attackConfig,
    },
  ];
}

function hasItemSlots(monster: MonsterUpsertInput): boolean {
  return Boolean(
    monster.mainHandItemId ||
      monster.offHandItemId ||
      monster.smallItemId ||
      monster.headItemId ||
      monster.shoulderItemId ||
      monster.torsoItemId ||
      monster.legsItemId ||
      monster.feetItemId,
  );
}

function getEquippedItems(
  monster: MonsterUpsertInput,
  weaponById?: Record<string, WeaponProjection>,
): Array<SummoningEquipmentItem | null> {
  if (!weaponById) return [];
  const slotIds = [
    monster.mainHandItemId ?? null,
    monster.offHandItemId ?? null,
    monster.smallItemId ?? null,
    monster.headItemId ?? null,
    monster.shoulderItemId ?? null,
    monster.torsoItemId ?? null,
    monster.legsItemId ?? null,
    monster.feetItemId ?? null,
  ];
  return slotIds.map((id) => (id ? (weaponById[id] ?? null) : null));
}

function buildEquipmentWeaponAttacks(
  monster: MonsterUpsertInput,
  weaponSkillValue: number,
  weaponById?: Record<string, WeaponProjection>,
): Array<{ label: string; lines: string[] }> {
  if (!weaponById) return [];

  const slots: Array<{ slotLabel: string; id: string | null | undefined }> = [
    { slotLabel: "Main Hand", id: monster.mainHandItemId },
    { slotLabel: "Off Hand", id: monster.offHandItemId },
    { slotLabel: "Small Slot", id: monster.smallItemId },
  ];

  const output: Array<{ label: string; lines: string[] }> = [];

  for (const slot of slots) {
    if (!slot.id) continue;
    const item = weaponById[slot.id];
    if (!item) continue;
    if (item.type !== "WEAPON" && item.type !== "SHIELD") continue;

    const lines = renderAttackActionLines(
      {
        melee: item.melee,
        ranged: item.ranged,
        aoe: item.aoe,
      } as MonsterNaturalAttackConfig,
      weaponSkillValue,
      { applyWeaponSkillOverride: true },
    );

    if (lines.length === 0) continue;

    output.push({
      label: `${slot.slotLabel}: ${item.name}`,
      lines,
    });
  }

  return output;
}

export function MonsterBlockCard({ monster, weaponById, className }: MonsterBlockCardProps) {
  const imageUrl = isHttpUrl(monster.imageUrl) ? monster.imageUrl.trim() : null;
  const tierLabel = formatTierLabel(monster.tier);
  const computedWeaponSkillValue = useMemo(
    () => getWeaponSkillDiceCountFromAttributes(monster.attackDie, monster.braveryDie),
    [monster.attackDie, monster.braveryDie],
  );
  const computedArmorSkillValue = useMemo(
    () => getArmorSkillDiceCountFromAttributes(monster.defenceDie, monster.fortitudeDie),
    [monster.defenceDie, monster.fortitudeDie],
  );
  const itemDerived = useMemo(() => {
    const equippedItems = getEquippedItems(monster, weaponById);
    const itemModifiers = getHighestItemModifiers(equippedItems);
    const itemProtection = getProtectionTotalsFromItems(equippedItems);
    return { itemModifiers, itemProtection };
  }, [monster, weaponById]);

  const renderedAttacks = useMemo(() => {
    const slotBasedAttacks = buildEquipmentWeaponAttacks(
      monster,
      computedWeaponSkillValue,
      weaponById,
    );
    const naturalMapped = getRenderableNaturalAttacks(monster).map((attack) => ({
      label: `Natural Weapon: ${attack.attackName ?? "Natural Weapon"}`,
      lines: renderAttackActionLines(
        (attack.attackConfig ?? {}) as MonsterNaturalAttackConfig,
        computedWeaponSkillValue,
        { applyWeaponSkillOverride: true },
      ),
    }));
    return [...slotBasedAttacks, ...naturalMapped];
  }, [computedWeaponSkillValue, monster, weaponById]);

  const useItemDerivedValues = hasItemSlots(monster);
  const protectionValues = useItemDerivedValues
    ? itemDerived.itemProtection
    : {
        physicalProtection: monster.physicalProtection,
        mentalProtection: monster.mentalProtection,
      };

  const MOD_KEY_TO_ITEM_FIELD: Record<(typeof ATTR_ROWS)[number][3], MonsterModifierField> = {
    attackModifier: "attackModifier",
    defenceModifier: "defenceModifier",
    fortitudeModifier: "fortitudeModifier",
    intellectModifier: "intellectModifier",
    supportModifier: "supportModifier",
    braveryModifier: "braveryModifier",
  };

  return (
    <div className={["sc-monster-block rounded border border-zinc-800 bg-zinc-950 p-4 space-y-3 text-sm", className ?? ""].join(" ").trim()}>
      <div>
        <p className="text-lg font-semibold">{monster.name}</p>
        <p className="text-zinc-300">
          Level {monster.level} {monster.legendary ? "Legendary " : ""}
          {tierLabel}
        </p>
        {monster.tags.length > 0 && <p className="text-xs text-zinc-500">{monster.tags.join(" ")}</p>}
      </div>
      {imageUrl && (
        <div className="mt-3 rounded border border-zinc-800 bg-zinc-900/40 max-h-56 sm:max-h-64 lg:max-h-[500px] overflow-hidden flex items-center justify-center p-1">
          <img
            src={imageUrl}
            alt={monster.name?.trim() ? monster.name : "Monster image"}
            className="w-full h-auto max-h-56 sm:max-h-64 lg:max-h-[500px] object-contain mx-auto bg-zinc-950/20"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Survivability & Defence</p>
        <p>PR {monster.physicalResilienceCurrent}/{monster.physicalResilienceMax}</p>
        <p>MP {monster.mentalPerseveranceCurrent}/{monster.mentalPerseveranceMax}</p>
        <p>Physical Protection {protectionValues.physicalProtection}</p>
        <p>Mental Protection {protectionValues.mentalProtection}</p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Attributes, Resists & Modifiers</p>
        {ATTR_ROWS.map(([label, dieKey, resistKey, modKey]) => {
          const itemModifier = itemDerived.itemModifiers[MOD_KEY_TO_ITEM_FIELD[modKey]];
          const modifierValue = useItemDerivedValues ? itemModifier : Number(monster[modKey]);
          return (
            <p key={label}>
              {label}: {dieLabel(monster[dieKey])}
              {Number(monster[resistKey]) > 0 ? ` | Resist ${Number(monster[resistKey])} dice` : ""}
              {" | Mod "}
              {formatModifierWithEffective(modifierValue)}
            </p>
          );
        })}
        <p>
          Weapon Skill: {computedWeaponSkillValue} dice | Mod{" "}
          {formatModifierWithEffective(
            useItemDerivedValues ? itemDerived.itemModifiers.weaponSkillModifier : monster.weaponSkillModifier,
          )}
        </p>
        <p>
          Armor Skill: {computedArmorSkillValue} dice | Mod{" "}
          {formatModifierWithEffective(
            useItemDerivedValues ? itemDerived.itemModifiers.armorSkillModifier : monster.armorSkillModifier,
          )}
        </p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Traits</p>
        {monster.traits.length === 0 && <p className="text-zinc-500">None</p>}
        {monster.traits.map((trait, idx) => {
          const traitName = trait.name?.trim() || "Trait";
          const rawEffect = trait.effectText?.trim() || "No description";

          const tokenCtx: Record<string, unknown> = {
            MonsterName: monster.name ?? null,
            MonsterLevel: typeof monster.level === "number" ? monster.level : null,

            MonsterAttack: monster.attackDie ?? null,
            MonsterDefence: monster.defenceDie ?? null,
            MonsterFortitude: monster.fortitudeDie ?? null,
            MonsterIntellect: monster.intellectDie ?? null,
            MonsterSupport: monster.supportDie ?? null,
            MonsterBravery: monster.braveryDie ?? null,

            MonsterWeaponSkill: computedWeaponSkillValue,
            MonsterArmorSkill: computedArmorSkillValue,

            MonsterWillpower: null,
            MonsterDodge: null,
          };

          const effectText = renderTraitTemplate(rawEffect, tokenCtx);
          return (
            <div key={trait.id ?? `${trait.traitDefinitionId}-${idx}`} className="space-y-0.5">
              <p>- {traitName}</p>
              <p className="pl-3 text-xs text-zinc-400">{effectText}</p>
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Attacks</p>
        {renderedAttacks.length === 0 && <p className="text-zinc-500">No attack lines.</p>}
        {renderedAttacks.map((attack, attackIndex) => (
          <div key={attackIndex} className="space-y-1">
            <p className="font-medium">Attack {attackIndex + 1}</p>
            <p>{attack.label}</p>
            {attack.lines.map((line, idx) => {
              const parsed = parseHeaderLine(line);
              return (
                <div key={idx} className="grid grid-cols-[82px_1fr] gap-2">
                  <p className="font-medium">{parsed.header}</p>
                  <p>{parsed.text}</p>
                </div>
              );
            })}
            {attack.lines.length === 0 && (
              <p className="text-zinc-500">No attack lines.</p>
            )}
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Powers</p>
        {monster.powers.length === 0 && <p className="text-zinc-500">None</p>}
        {monster.powers.map((power, idx) => (
          <div key={idx} className="rounded border border-zinc-800 p-2 space-y-1">
            <p className="font-medium">{power.name}</p>
            {power.description && <p className="text-zinc-300">{power.description}</p>}
            <p>Dice Count: {power.diceCount} | Potency: {power.potency}</p>
            <p>Cooldown: {effectiveCooldownTurns(power)}</p>
            <p>Response: {power.responseRequired ? "Yes" : "No"}</p>
            {power.intentions.length > 1 && (
              <p>
                Multi-Intention: roll once vs primary ({power.intentions[0].type}); net successes apply to all.
              </p>
            )}
            <p>{renderPowerSuccessClause(power)}</p>
            {renderPowerDurationText(power) && <p>{renderPowerDurationText(power)}</p>}
            {renderPowerStackCleanupText(power) && <p>{renderPowerStackCleanupText(power)}</p>}
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Custom Notes</p>
        <p className="whitespace-pre-wrap">{monster.customNotes?.trim() || "None"}</p>
      </div>
    </div>
  );
}
