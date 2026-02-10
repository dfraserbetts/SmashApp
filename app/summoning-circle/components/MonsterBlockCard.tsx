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
const POWER_RANGE_CATEGORIES = ["MELEE", "RANGED", "AOE"] as const;
const POWER_RANGE_AOE_SHAPES = ["SPHERE", "CONE", "LINE"] as const;
type PowerRangeCategory = (typeof POWER_RANGE_CATEGORIES)[number];
type PowerRangeAoeShape = (typeof POWER_RANGE_AOE_SHAPES)[number];

function dieLabel(value: DiceSize | null | undefined): string {
  if (!value) return "-";
  return `d${value.replace("D", "")}`;
}

function formatDieDisplay(die: string): string {
  const s = String(die || "").trim();
  if (!s) return "D?";
  if (s[0].toLowerCase() === "d") return `D${s.slice(1)}`;
  return `D${s}`;
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

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatPowerRange(power: MonsterUpsertInput["powers"][number]): string {
  const details = (power.intentions[0]?.detailsJson ?? {}) as Record<string, unknown>;
  const rawCategory = String(details.rangeCategory ?? "").trim().toUpperCase();
  const category = POWER_RANGE_CATEGORIES.includes(rawCategory as PowerRangeCategory)
    ? (rawCategory as PowerRangeCategory)
    : null;
  if (!category) return "-";

  const value = asNullableNumber(details.rangeValue);
  const rangeExtra =
    details.rangeExtra && typeof details.rangeExtra === "object" && !Array.isArray(details.rangeExtra)
      ? (details.rangeExtra as Record<string, unknown>)
      : {};

  if (category === "MELEE") {
    const targets = value ?? 1;
    return `Melee (${targets} target${targets === 1 ? "" : "s"})`;
  }

  if (category === "RANGED") {
    const distance = value ?? 30;
    const targets = asNullableNumber(rangeExtra.targets);
    return `Ranged (${distance} ft${targets ? `, ${targets} target${targets === 1 ? "" : "s"}` : ""})`;
  }

  const centerRange = value ?? 0;
  const count = asNullableNumber(rangeExtra.count) ?? 1;
  const rawShape = String(rangeExtra.shape ?? "SPHERE").trim().toUpperCase();
  const shape = POWER_RANGE_AOE_SHAPES.includes(rawShape as PowerRangeAoeShape)
    ? (rawShape as PowerRangeAoeShape)
    : "SPHERE";
  const shapeLabel = shape.charAt(0) + shape.slice(1).toLowerCase();
  return `AoE (${centerRange} ft center, ${count} area${count === 1 ? "" : "s"}, ${shapeLabel})`;
}

function derivePowerDefenceCheck(
  power: MonsterUpsertInput["powers"][number],
): string | null {
  const details = (power.intentions[0]?.detailsJson ?? {}) as Record<string, unknown>;
  const type = String(power.intentions[0]?.type ?? "").toUpperCase();

  if (type === "ATTACK") {
    const mode = String(details.attackMode ?? "PHYSICAL").toUpperCase();
    return mode === "MENTAL" ? "Defend (Mental)" : "Defend (Physical)";
  }

  if (type === "CONTROL") return "Resist (GD Choice)";
  if (type === "MOVEMENT") return "Resist Fortitude";

  if (type === "DEBUFF") {
    const statTarget = String(details.statTarget ?? "").trim();
    return `Resist ${statTarget || "?"}`;
  }

  return null;
}

function patchPowerSuccessClauseForStat(
  clause: string,
  power: MonsterUpsertInput["powers"][number],
): string {
  const details = (power.intentions[0]?.detailsJson ?? {}) as Record<string, unknown>;
  const type = String(power.intentions[0]?.type ?? "").toUpperCase();
  if (type !== "DEBUFF" && type !== "AUGMENT") return clause;

  const statTarget = String(details.statTarget ?? "").trim();
  if (!statTarget) return clause;

  // Only do a minimal, safe replacement.
  // Replace standalone "Stat" or "stat" tokens.
  return clause.replace(/\bStat\b/g, statTarget).replace(/\bstat\b/g, statTarget);
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
  const monsterMeta = monster as MonsterUpsertInput & { rarity?: string | null; tier?: string | null };
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
      <div className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          {/* Left - Mental */}
          <div className="flex md:block items-center justify-between md:justify-start gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Mental Perseverance</p>
              <p className="text-sm font-semibold">
                MP {monster.mentalPerseveranceCurrent}/{monster.mentalPerseveranceMax}
              </p>
            </div>
            <div className="text-right md:text-left">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Mental Protection</p>
              <p className="text-sm font-semibold">{protectionValues.mentalProtection}</p>
            </div>
          </div>

          {/* Center - Identity */}
          <div className="text-left md:text-center">
            <p className="text-lg font-semibold leading-tight">
              {monster.name?.trim() ? monster.name : "Unnamed Monster"}
            </p>
            <p className="text-xs text-zinc-400">
              {[
                typeof monster.level === "number" ? `Level ${monster.level}` : null,
                monsterMeta.rarity ? String(monsterMeta.rarity) : null,
                monsterMeta.tier ? String(monsterMeta.tier) : null,
              ]
                .filter((token): token is string => Boolean(token))
                .join(" | ")}
            </p>
          </div>

          {/* Right - Physical */}
          <div className="flex md:block items-center justify-between md:justify-start gap-3 md:text-right">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Physical Resilience</p>
              <p className="text-sm font-semibold">
                PR {monster.physicalResilienceCurrent}/{monster.physicalResilienceMax}
              </p>
            </div>
            <div className="text-right md:text-right">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Physical Protection</p>
              <p className="text-sm font-semibold">{protectionValues.physicalProtection}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-900/10 p-3">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(140px,12%)_1fr_minmax(140px,12%)] gap-3 items-stretch min-w-0">
          {/* LEFT: Mental */}
          <div className="space-y-1 md:col-start-1">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Mental</p>
            <div className="mt-1 space-y-2.5">
              {(["Intellect", "Support", "Bravery"] as const).map((label) => {
                const row = ATTR_ROWS.find((r) => r[0] === label);
                if (!row) return null;
                const [, dieKey, resistKey, modKey] = row;

                const itemModifier = itemDerived.itemModifiers[MOD_KEY_TO_ITEM_FIELD[modKey]];
                const modifierValue = useItemDerivedValues ? itemModifier : Number(monster[modKey]);

                return (
                  <div
                    key={label}
                    className="pl-2 border-l border-zinc-800 py-2"
                  >
                    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3">
                      <div>
                        <p className="font-medium text-sm">{label}</p>
                        <p className="text-[11px] leading-tight text-zinc-300">
                          Mod: {formatModifierWithEffective(modifierValue)}
                        </p>
                        <p className="text-[11px] leading-tight text-zinc-400">
                          Resist: {Number(monster[resistKey])} Dice
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-2xl font-semibold leading-none">
                          {formatDieDisplay(dieLabel(monster[dieKey]))}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CENTER: Image */}
          <div className="w-full min-w-0 justify-self-stretch md:col-start-2">
            {imageUrl ? (
              <div className="w-full min-w-0 aspect-[3/4] rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden p-2 flex items-center justify-center">
                <img
                  src={imageUrl}
                  alt={monster.name?.trim() ? monster.name : "Monster image"}
                  className="w-full h-full object-cover mx-auto bg-zinc-950/20"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="w-full min-w-0 aspect-[3/4] rounded border border-zinc-800 bg-zinc-950/30 p-3 text-center text-xs text-zinc-500 flex items-center justify-center">
                No image
              </div>
            )}
          </div>

          {/* RIGHT: Physical */}
          <div className="space-y-1 text-right md:col-start-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Physical</p>
            <div className="mt-1 space-y-2.5">
              {(["Attack", "Defence", "Fortitude"] as const).map((label) => {
                const row = ATTR_ROWS.find((r) => r[0] === label);
                if (!row) return null;
                const [, dieKey, resistKey, modKey] = row;

                const itemModifier = itemDerived.itemModifiers[MOD_KEY_TO_ITEM_FIELD[modKey]];
                const modifierValue = useItemDerivedValues ? itemModifier : Number(monster[modKey]);

                return (
                  <div
                    key={label}
                    className="pr-2 border-r border-zinc-800 py-2 text-right"
                  >
                    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                      <div className="text-left">
                        <p className="text-2xl font-semibold leading-none">
                          {formatDieDisplay(dieLabel(monster[dieKey]))}
                        </p>
                      </div>

                      <div>
                        <p className="font-medium text-sm">{label}</p>
                        <p className="text-[11px] leading-tight text-zinc-300">
                          Mod: {formatModifierWithEffective(modifierValue)}
                        </p>
                        <p className="text-[11px] leading-tight text-zinc-400">
                          Resist: {Number(monster[resistKey])} Dice
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
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
            <p>Range: {formatPowerRange(power)}</p>
            <p>Cooldown: {effectiveCooldownTurns(power)}</p>
            {(() => {
              const defenceCheck = derivePowerDefenceCheck(power);
              return defenceCheck ? <p>Defence: {defenceCheck}</p> : null;
            })()}
            <p>Response: {power.responseRequired ? "Yes" : "No"}</p>
            {power.intentions.length > 1 && (
              <p>
                Multi-Intention: roll once vs primary ({power.intentions[0].type}); net successes apply to all.
              </p>
            )}
            {(() => {
              const raw = renderPowerSuccessClause(power);
              const patched = patchPowerSuccessClauseForStat(raw, power);
              return <p>{patched}</p>;
            })()}
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


