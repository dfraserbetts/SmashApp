"use client";

import { useMemo, type ReactNode } from "react";
import type {
  AttributePlacement,
  CoreAttribute,
  DiceSize,
  LimitBreakTier,
  MonsterAttack,
  MonsterNaturalAttackConfig,
  MonsterUpsertInput,
} from "@/lib/summoning/types";
import {
  getArmorSkillDiceCountFromAttributes,
  getDodgeValue,
  getWeaponSkillDiceCountFromAttributes,
  getWillpowerDiceCountFromAttributes,
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
  renderPowerDescriptorLines,
} from "@/lib/summoning/render";
import { safeParseJson, interpolateText } from "@/lib/textInterpolation";
import {
  getAttributeLimitBreakCeiling,
  getLimitBreakRequiredSuccesses,
  getLimitBreakThresholdPercent,
  getWeaponLimitBreakCeiling,
} from "@/lib/limitBreakThreshold";
import {
  normalizeProtectionTuning,
  type ProtectionTuningValues,
} from "@/lib/config/combatTuningShared";

export type WeaponProjection = {
  id: string;
  name: string;
  imageUrl?: string | null;
  type: "WEAPON" | "SHIELD" | "ARMOR" | "ITEM" | "CONSUMABLE";
  size: "SMALL" | "ONE_HANDED" | "TWO_HANDED" | null;
  armorLocation: "HEAD" | "SHOULDERS" | "TORSO" | "LEGS" | "FEET" | null;
  itemLocation?: "HEAD" | "NECK" | "ARMS" | "BELT" | null;
  ppv: number | null;
  mpv: number | null;
  globalAttributeModifiers?: Array<{ attribute?: string; amount?: number }>;
  attributeLines?: Array<{ text: string; placement: AttributePlacement }>;
  itemAttributeLines?: Array<{ text: string; placement: AttributePlacement }>;
  customItemAttributeLines?: Array<{ text: string; placement: AttributePlacement }>;
  allAttributeLines?: Array<{ text: string; placement: AttributePlacement }>;
  mythicLimitBreakTemplate?: {
    id: string;
    name: string;
    tier: "PUSH" | "BREAK" | "TRANSCEND";
    thresholdPercent: number;
    description: string | null;
    successEffectParams: unknown;
    baseCostText: string | null;
    baseCostParams: unknown;
    endCostText: string | null;
    endCostParams: unknown;
    isPersistent: boolean;
    persistentCostTiming: "BEGIN" | "END" | null;
  } | null;
  melee: MonsterNaturalAttackConfig["melee"];
  ranged: MonsterNaturalAttackConfig["ranged"];
  aoe: MonsterNaturalAttackConfig["aoe"];
};

type MonsterBlockCardProps = {
  monster: MonsterUpsertInput;
  weaponById?: Record<string, WeaponProjection>;
  className?: string;
  isPrint?: boolean;
  printLayout?: PrintLayoutMode;
  printPage?: PrintPageMode;
  protectionTuning?: ProtectionTuningValues;
};
type PrintLayoutMode = "COMPACT_1P" | "LEGENDARY_2P";
type PrintPageMode = "COMPACT" | "PAGE1_MAIN" | "PAGE2_POWER";

const ATTR_ROWS = [
  ["Attack", "attackDie", "attackResistDie", "attackModifier"],
  ["Defence", "defenceDie", "defenceResistDie", "defenceModifier"],
  ["Fortitude", "fortitudeDie", "fortitudeResistDie", "fortitudeModifier"],
  ["Intellect", "intellectDie", "intellectResistDie", "intellectModifier"],
  ["Support", "supportDie", "supportResistDie", "supportModifier"],
  ["Bravery", "braveryDie", "braveryResistDie", "braveryModifier"],
] as const;
const DEFAULT_IMAGE_POS_X = 50;
const DEFAULT_IMAGE_POS_Y = 35;

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

function formatAttributeDieDisplay(die: string): string {
  return formatDieDisplay(die).replace(/^D/i, "");
}

function formatTierLabel(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return "";
  return `${s[0].toUpperCase()}${s.slice(1).toLowerCase()}`;
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

export function renderTraitTemplate(
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

export function buildMonsterTraitRenderContext(params: {
  monster:
    | Pick<
        MonsterUpsertInput,
        | "name"
        | "level"
        | "attackDie"
        | "defenceDie"
        | "fortitudeDie"
        | "intellectDie"
        | "supportDie"
        | "braveryDie"
      >
    | null
    | undefined;
  weaponSkillValue: number | null;
  armorSkillValue: number | null;
  willpowerValue: number | null;
  dodgeValue: number | null;
}): Record<string, unknown> {
  const {
    monster,
    weaponSkillValue,
    armorSkillValue,
    willpowerValue,
    dodgeValue,
  } = params;

  return {
    MonsterName: monster?.name ?? null,
    MonsterLevel: typeof monster?.level === "number" ? monster.level : null,

    MonsterAttack: monster?.attackDie ?? null,
    MonsterDefence: monster?.defenceDie ?? null,
    MonsterFortitude: monster?.fortitudeDie ?? null,
    MonsterIntellect: monster?.intellectDie ?? null,
    MonsterSupport: monster?.supportDie ?? null,
    MonsterBravery: monster?.braveryDie ?? null,

    MonsterWeaponSkill: weaponSkillValue,
    MonsterArmorSkill: armorSkillValue,

    MonsterWillpower: willpowerValue,
    MonsterDodge: dodgeValue,
  };
}

function parseHeaderLine(line: string): { header: string; text: string } {
  const parts = String(line).split("||");
  if (parts.length < 2) return { header: "", text: line };
  return { header: parts[0].trim(), text: parts.slice(1).join("||").trim() };
}

function formatNaturalAttackLines(
  attackName: string | null | undefined,
  lines: string[],
): string[] {
  const resolvedName = String(attackName ?? "").trim() || "Natural Weapon";
  return lines.map((line) =>
    line.replace(/This weapon inflicts/g, `${resolvedName} inflicts`),
  );
}

const MECHANICS_HIGHLIGHT_RE =
  /\b\d+\s*dice\b|\b\d+\s*(?:mental|physical)?\s*[a-z-]*\s*wounds\b|\bchoose\s+\d+\b|\b\d+\s*stacks?\b|\b\d+\s*ft\b|\bcooldown:\s*\d+\b|\bunder\s*\d+%/gi;

function highlightMechanics(text: string | null | undefined): ReactNode {
  if (!text) return text ?? "";

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let idx = 0;
  let match: RegExpExecArray | null;
  MECHANICS_HIGHLIGHT_RE.lastIndex = 0;

  while ((match = MECHANICS_HIGHLIGHT_RE.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > cursor) {
      nodes.push(<span key={`plain-${idx}`}>{text.slice(cursor, start)}</span>);
      idx += 1;
    }
    nodes.push(
      <span key={`bold-${idx}`} className="font-semibold">
        {match[0]}
      </span>,
    );
    idx += 1;
    cursor = end;
  }

  if (cursor < text.length) {
    nodes.push(<span key={`plain-${idx}`}>{text.slice(cursor)}</span>);
  }

  return nodes.length > 0 ? nodes : text;
}

function getAttackTextLen(s?: string): number {
  return s ? s.replace(/\s+/g, " ").trim().length : 0;
}

function isMeleeHeader(header: string): boolean {
  return header.trim().toLowerCase().includes("melee");
}

function isRangedHeader(header: string): boolean {
  return header.trim().toLowerCase().includes("ranged");
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
      monster.headArmorItemId ||
      monster.shoulderArmorItemId ||
      monster.torsoArmorItemId ||
      monster.legsArmorItemId ||
      monster.feetArmorItemId ||
      monster.headItemId ||
      monster.neckItemId ||
      monster.armsItemId ||
      monster.beltItemId,
  );
}

function getEquippedItems(
  monster: MonsterUpsertInput,
  weaponById?: Record<string, WeaponProjection>,
): Array<SummoningEquipmentItem | null> {
  if (!weaponById) return [];
  // SC_SEPARATE_ARMOR_AND_ITEM_RENDER_SLOTS_V2
  const slotIds = [
    monster.mainHandItemId ?? null,
    monster.offHandItemId ?? null,
    monster.smallItemId ?? null,
    monster.headArmorItemId ?? null,
    monster.shoulderArmorItemId ?? null,
    monster.torsoArmorItemId ?? null,
    monster.legsArmorItemId ?? null,
    monster.feetArmorItemId ?? null,
    monster.headItemId ?? null,
    monster.neckItemId ?? null,
    monster.armsItemId ?? null,
    monster.beltItemId ?? null,
  ];
  return slotIds.map((id) => (id ? (weaponById[id] ?? null) : null));
}

function buildEquipmentWeaponAttacks(
  monster: MonsterUpsertInput,
  weaponSkillValue: number,
  level: number,
  weaponById?: Record<string, WeaponProjection>,
): Array<{ label: string; lines: string[]; attackPlacementLines: string[] }> {
  if (!weaponById) return [];

  const slots: Array<{ slotLabel: string; id: string | null | undefined }> = [
    { slotLabel: "Main Hand", id: monster.mainHandItemId },
    { slotLabel: "Off Hand", id: monster.offHandItemId },
    { slotLabel: "Small Slot", id: monster.smallItemId },
  ];

  const output: Array<{ label: string; lines: string[]; attackPlacementLines: string[] }> = [];

  for (const slot of slots) {
    if (!slot.id) continue;
    const item = weaponById[slot.id];
    if (!item) continue;
    if (item.type !== "WEAPON" && item.type !== "SHIELD") continue;

    const rawAttributeLines = Array.isArray(item.allAttributeLines)
      ? item.allAttributeLines
      : [
          ...(Array.isArray(item.attributeLines) ? item.attributeLines : []),
          ...(Array.isArray(item.itemAttributeLines) ? item.itemAttributeLines : []),
          ...(Array.isArray(item.customItemAttributeLines) ? item.customItemAttributeLines : []),
        ];
    const attackPlacementLines: string[] = [];
    const seenAttackLines = new Set<string>();
    for (const rawLine of rawAttributeLines) {
      const text = typeof rawLine?.text === "string" ? rawLine.text.trim() : "";
      if (!text) continue;
      const placement = rawLine?.placement === "ATTACK" ? "ATTACK" : rawLine?.placement;
      if (placement !== "ATTACK") continue;
      if (seenAttackLines.has(text)) continue;
      seenAttackLines.add(text);
      attackPlacementLines.push(text);
    }

    const lines = renderAttackActionLines(
      {
        melee: item.melee,
        ranged: item.ranged,
        aoe: item.aoe,
      } as MonsterNaturalAttackConfig,
      weaponSkillValue,
      { applyWeaponSkillOverride: true, strengthMultiplier: 2, level },
    );

    if (lines.length === 0) continue;

    output.push({
      label: `${slot.slotLabel}: ${item.name}`,
      lines,
      attackPlacementLines,
    });
  }

  return output;
}

function clampImagePosition(value: unknown, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function getEquippedMythicLimitBreakTemplate(
  monster: MonsterUpsertInput,
  weaponById?: Record<string, WeaponProjection>,
): { template: WeaponProjection["mythicLimitBreakTemplate"]; sourceItemName: string | null } {
  if (!weaponById) return { template: null, sourceItemName: null };

  const slotIds = [
    monster.mainHandItemId,
    monster.offHandItemId,
    monster.smallItemId,
    monster.headArmorItemId,
    monster.shoulderArmorItemId,
    monster.torsoArmorItemId,
    monster.legsArmorItemId,
    monster.feetArmorItemId,
    monster.headItemId,
    monster.neckItemId,
    monster.armsItemId,
    monster.beltItemId,
  ];
  for (const slotId of slotIds) {
    if (!slotId) continue;
    const item = weaponById[slotId];
    const template = item?.mythicLimitBreakTemplate ?? null;
    if (template) return { template, sourceItemName: item?.name ?? null };
  }
  return { template: null, sourceItemName: null };
}

type CustomLimitBreakSlot = {
  name: string | null;
  tier: LimitBreakTier | null;
  triggerText: string | null;
  attribute: CoreAttribute | null;
  thresholdSuccesses: number | null;
  costText: string | null;
  effectText: string | null;
};

type CustomLimitBreakPreview = {
  name: string;
  tier: LimitBreakTier | null;
  threshold: number | null;
  baseDiceCount: number | null;
  attributeLabel: string | null;
  triggerText: string;
  costText: string;
  effectText: string;
};

function getCustomLimitBreakAttributeContext(
  monster: MonsterUpsertInput,
  attribute: CoreAttribute | null,
): { value: number | null; label: string | null } {
  if (attribute === "ATTACK") return { value: dieNumeric(monster.attackDie), label: "Attack" };
  if (attribute === "DEFENCE") return { value: dieNumeric(monster.defenceDie), label: "Defence" };
  if (attribute === "FORTITUDE") return { value: dieNumeric(monster.fortitudeDie), label: "Fortitude" };
  if (attribute === "INTELLECT") return { value: dieNumeric(monster.intellectDie), label: "Intellect" };
  if (attribute === "SUPPORT") return { value: dieNumeric(monster.supportDie), label: "Support" };
  if (attribute === "BRAVERY") return { value: dieNumeric(monster.braveryDie), label: "Bravery" };
  return { value: null, label: null };
}

function buildCustomLimitBreakPreview(
  monster: MonsterUpsertInput,
  slot: CustomLimitBreakSlot,
): CustomLimitBreakPreview | null {
  const name = slot.name?.trim() ?? "";
  const triggerText = slot.triggerText?.trim() ?? "";
  const costText = slot.costText?.trim() ?? "";
  const effectText = slot.effectText?.trim() ?? "";
  const hasAnyContent = Boolean(
    name ||
      slot.tier ||
      triggerText ||
      slot.attribute ||
      slot.thresholdSuccesses !== null ||
      costText ||
      effectText,
  );
  if (!hasAnyContent) return null;

  const attributeContext = getCustomLimitBreakAttributeContext(monster, slot.attribute);
  const thresholdFromSlot =
    typeof slot.thresholdSuccesses === "number" && Number.isFinite(slot.thresholdSuccesses)
      ? Math.max(1, Math.trunc(slot.thresholdSuccesses))
      : null;
  const computedThreshold = (() => {
    const thresholdPercent = getLimitBreakThresholdPercent(slot.tier);
    if (attributeContext.value === null || thresholdPercent === null) return null;
    return getLimitBreakRequiredSuccesses(
      getAttributeLimitBreakCeiling(attributeContext.value),
      thresholdPercent,
    );
  })();

  return {
    name: name || "Custom Limit Break",
    tier: slot.tier,
    threshold: thresholdFromSlot ?? computedThreshold,
    baseDiceCount: attributeContext.value,
    attributeLabel: attributeContext.label,
    triggerText,
    costText,
    effectText,
  };
}

export function MonsterBlockCard({
  monster,
  weaponById,
  className,
  isPrint,
  printLayout = "COMPACT_1P",
  printPage = "COMPACT",
  protectionTuning,
}: MonsterBlockCardProps) {
  const inPrint = Boolean(isPrint);
  const is2Page = inPrint && printLayout === "LEGENDARY_2P";
  const isMainPage = inPrint && printPage === "PAGE1_MAIN";
  const isPowerPage = inPrint && printPage === "PAGE2_POWER";
  const imageUrl = isHttpUrl(monster.imageUrl) ? monster.imageUrl.trim() : null;
  const imagePosX = clampImagePosition(
    (monster as { imagePosX?: unknown }).imagePosX,
    DEFAULT_IMAGE_POS_X,
  );
  const imagePosY = clampImagePosition(
    (monster as { imagePosY?: unknown }).imagePosY,
    DEFAULT_IMAGE_POS_Y,
  );
  const monsterMeta = monster as MonsterUpsertInput & { rarity?: string | null; tier?: string | null };
  const baseWeaponSkillValue = useMemo(
    () => getWeaponSkillDiceCountFromAttributes(monster.attackDie, monster.braveryDie),
    [monster.attackDie, monster.braveryDie],
  );
  const baseArmorSkillValue = useMemo(
    () => getArmorSkillDiceCountFromAttributes(monster.defenceDie, monster.fortitudeDie),
    [monster.defenceDie, monster.fortitudeDie],
  );
  const equippedItems = useMemo(
    () => getEquippedItems(monster, weaponById),
    [monster, weaponById],
  );
  const itemDerived = useMemo(() => {
    const itemModifiers = getHighestItemModifiers(equippedItems);
    const itemProtection = getProtectionTotalsFromItems(equippedItems);
    return { itemModifiers, itemProtection };
  }, [equippedItems]);
  const computedWeaponSkillValue = useMemo(
    () =>
      Math.max(
        1,
        baseWeaponSkillValue +
          Math.max(0, Math.trunc(itemDerived.itemModifiers.weaponSkillModifier ?? 0)),
      ),
    [baseWeaponSkillValue, itemDerived.itemModifiers.weaponSkillModifier],
  );
  const computedArmorSkillValue = useMemo(
    () =>
      Math.max(
        1,
        baseArmorSkillValue +
          Math.max(0, Math.trunc(itemDerived.itemModifiers.armorSkillModifier ?? 0)),
      ),
    [baseArmorSkillValue, itemDerived.itemModifiers.armorSkillModifier],
  );

  const renderedAttacks = useMemo(() => {
    // SC_LEVEL_WOUND_SCALER_WIRING
    const slotBasedAttacks = buildEquipmentWeaponAttacks(
      monster,
      computedWeaponSkillValue,
      monster.level,
      weaponById,
    );
    const naturalMapped = getRenderableNaturalAttacks(monster).map((attack) => ({
      label: `Natural Weapon: ${attack.attackName ?? "Natural Weapon"}`,
      attackPlacementLines: [] as string[],
      lines: formatNaturalAttackLines(
        attack.attackName,
        renderAttackActionLines(
          (attack.attackConfig ?? {}) as MonsterNaturalAttackConfig,
          computedWeaponSkillValue,
          { applyWeaponSkillOverride: true, strengthMultiplier: 2, level: monster.level },
        ),
      ),
    }));
    return [...slotBasedAttacks, ...naturalMapped];
  }, [computedWeaponSkillValue, monster, weaponById]);
  const attackGroups = useMemo(() => {
    const map = new Map<string, typeof renderedAttacks>();
    for (const a of renderedAttacks) {
      const key = a.label || "Attack";
      const prev = map.get(key);
      if (!prev) map.set(key, [a]);
      else prev.push(a);
    }
    return Array.from(map.entries()).map(([label, attacks]) => ({ label, attacks }));
  }, [renderedAttacks]);
  const attackGroupsForRender = useMemo(() => {
    return attackGroups.map((group) => {
      const parsedLines = group.attacks
        .flatMap((attack) => attack.lines)
        .map((line) => parseHeaderLine(line));
      const meleeLines = parsedLines.filter((line) => isMeleeHeader(line.header));
      const rangedLines = parsedLines.filter((line) => isRangedHeader(line.header));
      return {
        ...group,
        parsedLines,
        meleeLines,
        rangedLines,
      };
    });
  }, [attackGroups]);
  const wideAttackGroup = useMemo(() => {
    const dualCandidates = attackGroupsForRender.filter((group) => {
      const meleeTextLen = getAttackTextLen(
        group.meleeLines.map((line) => `${line.header} ${line.text}`.trim()).join(" "),
      );
      const rangedTextLen = getAttackTextLen(
        group.rangedLines.map((line) => `${line.header} ${line.text}`.trim()).join(" "),
      );
      const isDualMode = group.meleeLines.length > 0 && group.rangedLines.length > 0;
      const isSafeToCombine =
        meleeTextLen > 0 && rangedTextLen > 0 && meleeTextLen <= 220 && rangedTextLen <= 220;
      return isDualMode && isSafeToCombine;
    });

    if (attackGroupsForRender.length === 3 && dualCandidates.length === 1) {
      return dualCandidates[0];
    }
    return null;
  }, [attackGroupsForRender]);
  const attackWrapClass = (() => {
    if (!inPrint) return "";
    // Always use grid for print modes (stable, predictable)
    if (attackGroups.length <= 1) return "sc-print-attack-grid sc-grid-1";
    return "sc-print-attack-grid sc-grid-2";
  })();
  const isTwoColumnAttackGrid = inPrint && attackWrapClass.includes("sc-grid-2");
  const hasOddAttackGroups = attackGroupsForRender.length % 2 === 1;
  const allowOddTailFullSpan = !wideAttackGroup;
  const resolvedProtectionTuning = useMemo(
    () => normalizeProtectionTuning(protectionTuning?.protectionK, protectionTuning?.protectionS),
    [protectionTuning?.protectionK, protectionTuning?.protectionS],
  );

  const useItemDerivedValues = hasItemSlots(monster);
  const naturalPhysicalProtectionValue =
    typeof (monster as { naturalPhysicalProtection?: unknown }).naturalPhysicalProtection ===
      "number" &&
    Number.isFinite(
      (monster as { naturalPhysicalProtection?: unknown }).naturalPhysicalProtection as number,
    )
      ? Math.max(
          0,
          Math.min(
            30,
            Math.trunc(
              (monster as { naturalPhysicalProtection?: unknown })
                .naturalPhysicalProtection as number,
            ),
          ),
        )
      : 0;
  const naturalMentalProtectionValue =
    typeof (monster as { naturalMentalProtection?: unknown }).naturalMentalProtection ===
      "number" &&
    Number.isFinite(
      (monster as { naturalMentalProtection?: unknown }).naturalMentalProtection as number,
    )
      ? Math.max(
          0,
          Math.min(
            30,
            Math.trunc(
              (monster as { naturalMentalProtection?: unknown }).naturalMentalProtection as number,
            ),
          ),
        )
      : 0;
  const protectionValues = {
    physicalProtection:
      naturalPhysicalProtectionValue + itemDerived.itemProtection.physicalProtection,
    mentalProtection:
      naturalMentalProtectionValue + itemDerived.itemProtection.mentalProtection,
  };
  const dodgeValue = useMemo(
    () =>
      Math.max(
        0,
        getDodgeValue(
          monster.defenceDie,
          monster.intellectDie,
          monster.level,
          protectionValues.physicalProtection,
        ),
      ),
    [
      monster.defenceDie,
      monster.intellectDie,
      monster.level,
      protectionValues.physicalProtection,
    ],
  );
  const willpowerValue = useMemo(
    () =>
      Math.max(
        1,
        getWillpowerDiceCountFromAttributes(monster.supportDie, monster.braveryDie) +
          Math.max(0, Math.trunc(itemDerived.itemModifiers.willpowerModifier ?? 0)),
      ),
    [monster.supportDie, monster.braveryDie, itemDerived.itemModifiers.willpowerModifier],
  );
  const renderedDefenceStrings = useMemo(() => {
    const dodgeDice = Math.max(
      0,
      Math.ceil(dodgeValue / 6) +
        Math.max(0, Math.trunc(itemDerived.itemModifiers.dodgeModifier ?? 0)),
    );
    const armorSkillForDefenceCalc = Math.max(1, computedArmorSkillValue);
    // PROTECTION_BLOCK_FORMULA_V2
    const physicalBlockPerSuccess =
      protectionValues.physicalProtection <= 0
        ? 0
        : Math.ceil(
            (protectionValues.physicalProtection / resolvedProtectionTuning.protectionK) *
              (1 + armorSkillForDefenceCalc / resolvedProtectionTuning.protectionS),
          );
    const willpowerDice = Math.max(0, willpowerValue);
    const willpowerForDefenceCalc = Math.max(1, willpowerValue);
    const mentalBlockPerSuccess =
      protectionValues.mentalProtection <= 0
        ? 0
        : Math.ceil(
            (protectionValues.mentalProtection / resolvedProtectionTuning.protectionK) *
              (1 + willpowerForDefenceCalc / resolvedProtectionTuning.protectionS),
          );

    return [
      `Dodge: Roll ${dodgeDice} dice. If successes exceed the attacker's successes, take 0 damage. Otherwise take full damage.`,
      `Physical Protection: Roll ${computedArmorSkillValue} dice, block ${physicalBlockPerSuccess} wounds per success.`,
      `Mental Protection: Roll ${willpowerDice} dice, block ${mentalBlockPerSuccess} wounds per success.`,
    ];
  }, [
    computedArmorSkillValue,
    dodgeValue,
    itemDerived.itemModifiers.dodgeModifier,
    protectionValues.physicalProtection,
    protectionValues.mentalProtection,
    resolvedProtectionTuning.protectionK,
    resolvedProtectionTuning.protectionS,
    willpowerValue,
  ]);
  const equippedAttributeLinesByPlacement = useMemo(() => {
    const buckets: Record<AttributePlacement, string[]> = {
      ATTACK: [],
      DEFENCE: [],
      TRAITS: [],
      GENERAL: [],
    };
    const seen: Record<AttributePlacement, Set<string>> = {
      ATTACK: new Set<string>(),
      DEFENCE: new Set<string>(),
      TRAITS: new Set<string>(),
      GENERAL: new Set<string>(),
    };
    if (!weaponById) return buckets;

    const slotIds = [
      monster.mainHandItemId,
      monster.offHandItemId,
      monster.smallItemId,
      monster.headArmorItemId,
      monster.shoulderArmorItemId,
      monster.torsoArmorItemId,
      monster.legsArmorItemId,
      monster.feetArmorItemId,
      monster.headItemId,
      monster.neckItemId,
      monster.armsItemId,
      monster.beltItemId,
    ];

    for (const slotId of slotIds) {
      if (!slotId) continue;
      const item = weaponById[slotId];
      if (!item) continue;
      const rawLines = Array.isArray(item.allAttributeLines)
        ? item.allAttributeLines
        : [
            ...(Array.isArray(item.attributeLines) ? item.attributeLines : []),
            ...(Array.isArray(item.itemAttributeLines) ? item.itemAttributeLines : []),
            ...(Array.isArray(item.customItemAttributeLines) ? item.customItemAttributeLines : []),
          ];
      if (rawLines.length === 0) continue;

      for (const rawLine of rawLines) {
        const text = typeof rawLine?.text === "string" ? rawLine.text.trim() : "";
        if (!text) continue;
        const placement: AttributePlacement =
          rawLine?.placement === "ATTACK" ||
          rawLine?.placement === "DEFENCE" ||
          rawLine?.placement === "TRAITS" ||
          rawLine?.placement === "GENERAL"
            ? rawLine.placement
            : "TRAITS";
        if (seen[placement].has(text)) continue;
        seen[placement].add(text);
        buckets[placement].push(text);
      }
    }

    return buckets;
  }, [monster, weaponById]);
  const equippedTraitLinesWithSource = useMemo(() => {
    const out: Array<{ text: string; sourceItemName: string }> = [];
    const seen = new Set<string>();
    if (!weaponById) return out;

    const slotIds = [
      monster.mainHandItemId,
      monster.offHandItemId,
      monster.smallItemId,
      monster.headArmorItemId,
      monster.shoulderArmorItemId,
      monster.torsoArmorItemId,
      monster.legsArmorItemId,
      monster.feetArmorItemId,
      monster.headItemId,
      monster.neckItemId,
      monster.armsItemId,
      monster.beltItemId,
    ];

    for (const slotId of slotIds) {
      if (!slotId) continue;
      const item = weaponById[slotId];
      if (!item) continue;

      const rawLines = Array.isArray(item.allAttributeLines)
        ? item.allAttributeLines
        : [
            ...(Array.isArray(item.attributeLines) ? item.attributeLines : []),
            ...(Array.isArray(item.itemAttributeLines) ? item.itemAttributeLines : []),
            ...(Array.isArray(item.customItemAttributeLines) ? item.customItemAttributeLines : []),
          ];

      if (rawLines.length === 0) continue;

      const itemName = (item.name ?? "").trim() || "Item";

      for (const rawLine of rawLines) {
        const text = typeof rawLine?.text === "string" ? rawLine.text.trim() : "";
        if (!text) continue;

        const placement: AttributePlacement =
          rawLine?.placement === "ATTACK" ||
          rawLine?.placement === "DEFENCE" ||
          rawLine?.placement === "TRAITS" ||
          rawLine?.placement === "GENERAL"
            ? rawLine.placement
            : "TRAITS";

        if (placement !== "TRAITS") continue;

        const key = `${itemName}::${text}`;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({ text, sourceItemName: itemName });
      }
    }

    return out;
  }, [monster, weaponById]);
  const equippedDefenceLinesWithSource = useMemo(() => {
    const out: Array<{ text: string; sourceItemName: string }> = [];
    const seen = new Set<string>();
    if (!weaponById) return out;

    const slotIds = [
      monster.mainHandItemId,
      monster.offHandItemId,
      monster.smallItemId,
      monster.headArmorItemId,
      monster.shoulderArmorItemId,
      monster.torsoArmorItemId,
      monster.legsArmorItemId,
      monster.feetArmorItemId,
      monster.headItemId,
      monster.neckItemId,
      monster.armsItemId,
      monster.beltItemId,
    ];

    for (const slotId of slotIds) {
      if (!slotId) continue;
      const item = weaponById[slotId];
      if (!item) continue;

      const rawLines = Array.isArray(item.allAttributeLines)
        ? item.allAttributeLines
        : [
            ...(Array.isArray(item.attributeLines) ? item.attributeLines : []),
            ...(Array.isArray(item.itemAttributeLines) ? item.itemAttributeLines : []),
            ...(Array.isArray(item.customItemAttributeLines) ? item.customItemAttributeLines : []),
          ];

      const itemName = (item.name ?? "").trim() || "Item";

      for (const rawLine of rawLines) {
        const text = typeof rawLine?.text === "string" ? rawLine.text.trim() : "";
        if (!text) continue;

        const placement: AttributePlacement =
          rawLine?.placement === "ATTACK" ||
          rawLine?.placement === "DEFENCE" ||
          rawLine?.placement === "TRAITS" ||
          rawLine?.placement === "GENERAL"
            ? rawLine.placement
            : "TRAITS";

        if (placement !== "DEFENCE") continue;

        const key = `${itemName}::${text}`;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({ text, sourceItemName: itemName });
      }
    }

    return out;
  }, [monster, weaponById]);
  const compressedDefenceLinesWithSource = useMemo(() => {
    const out: Array<{ text: string; sourceItemName: string }> = [];

    // Match:
    // +1 to Defence rolls against Fire attacks
    // -2 to Defence rolls against Psychic attacks
    // +1 dice to Defence rolls against Holy attacks
    const vrpRe =
      /^([+-]?\d+)\s+(to Defence rolls|dice to Defence rolls)\s+against\s+(.+?)\s+attacks$/i;

    type Kind = "MOD" | "DICE";
    type Key = string;

    const groups = new Map<Key, { kind: Kind; damageType: string; total: number; sources: string[] }>();

    const pushNonVrp = (row: { text: string; sourceItemName: string }) => {
      out.push(row);
    };

    for (const row of equippedDefenceLinesWithSource) {
      const text = row.text.trim();
      const m = text.match(vrpRe);
      if (!m) {
        pushNonVrp(row);
        continue;
      }

      const rawNum = Number(m[1]);
      if (!Number.isFinite(rawNum) || rawNum === 0) {
        pushNonVrp(row);
        continue;
      }

      const phrase = String(m[2]).toLowerCase();
      const damageType = String(m[3]).trim();
      const kind: Kind = phrase.includes("dice") ? "DICE" : "MOD";
      const key: Key = `${kind}::${damageType.toLowerCase()}`;

      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          kind,
          damageType,
          total: rawNum,
          sources: [row.sourceItemName],
        });
      } else {
        existing.total += rawNum;
        if (!existing.sources.includes(row.sourceItemName)) existing.sources.push(row.sourceItemName);
      }
    }

    // Emit aggregated VRP lines
    for (const g of groups.values()) {
      // clamp to [-5, +5]
      let total = g.total;
      if (total > 5) total = 5;
      if (total < -5) total = -5;

      if (total === 0) continue;

      const sign = total > 0 ? "+" : "";
      const joinedSources = g.sources.sort((a, b) => a.localeCompare(b)).join("/");

      const vrpText =
        g.kind === "DICE"
          ? `${sign}${total} dice to Defence rolls against ${g.damageType} attacks`
          : `${sign}${total} to Defence rolls against ${g.damageType} attacks`;

      out.push({
        sourceItemName: joinedSources,
        text: vrpText,
      });
    }

    // Sort: VRP lines first (they start with +/-), then other lines
    return out.sort((a, b) => {
      const aIsVrp = /^[+-]\d+/.test(a.text.trim());
      const bIsVrp = /^[+-]\d+/.test(b.text.trim());
      if (aIsVrp !== bIsVrp) return aIsVrp ? -1 : 1;
      return a.sourceItemName.localeCompare(b.sourceItemName) || a.text.localeCompare(b.text);
    });
  }, [equippedDefenceLinesWithSource]);

  const MOD_KEY_TO_ITEM_FIELD: Record<(typeof ATTR_ROWS)[number][3], MonsterModifierField> = {
    attackModifier: "attackModifier",
    defenceModifier: "defenceModifier",
    fortitudeModifier: "fortitudeModifier",
    intellectModifier: "intellectModifier",
    supportModifier: "supportModifier",
    braveryModifier: "braveryModifier",
  };
  const customNotesText = monster.customNotes?.trim() ?? "";
  const legendaryLimitBreakPreview = useMemo(() => {
    const picked = getEquippedMythicLimitBreakTemplate(monster, weaponById);
    const template = picked.template;
    if (!template) return null;

    const baseCostText = interpolateText(
      template.baseCostText ?? "",
      safeParseJson(template.baseCostParams),
    ).trim();
    const endCostText = interpolateText(
      template.endCostText ?? "",
      safeParseJson(template.endCostParams),
    ).trim();
    const effectText = interpolateText(
      template.description ?? "",
      safeParseJson(template.successEffectParams),
    ).trim();

    const costText = baseCostText.length > 0 ? baseCostText : endCostText;
    const thresholdPercentRaw = Number(template.thresholdPercent);
    const thresholdPercent = Number.isFinite(thresholdPercentRaw) ? thresholdPercentRaw : 0;
    const rawWeaponSkill = (monster as { weaponSkillValue?: unknown }).weaponSkillValue;
    const weaponSkill =
      typeof rawWeaponSkill === "number" && Number.isFinite(rawWeaponSkill)
        ? rawWeaponSkill
        : null;
    const thresholdRequired =
      weaponSkill === null
        ? null
        : getLimitBreakRequiredSuccesses(
            getWeaponLimitBreakCeiling(weaponSkill),
            thresholdPercent,
          );

    return {
      name: template.name,
      tier: template.tier,
      costText,
      effectText,
      baseDiceCount: weaponSkill,
      thresholdRequired,
      sourceLabel: (picked.sourceItemName?.trim() ? picked.sourceItemName.trim() : "Item"),
    };
  }, [monster, weaponById]);
  const customLimitBreakPreviews = useMemo(() => {
    if (!monster.legendary) return [];
    const preview1 = buildCustomLimitBreakPreview(monster, {
      name: monster.limitBreakName,
      tier: monster.limitBreakTier,
      triggerText: monster.limitBreakTriggerText,
      attribute: monster.limitBreakAttribute,
      thresholdSuccesses: monster.limitBreakThresholdSuccesses,
      costText: monster.limitBreakCostText,
      effectText: monster.limitBreakEffectText,
    });
    const monsterWithLb2 = monster as MonsterUpsertInput & {
      limitBreak2Name?: string | null;
      limitBreak2Tier?: LimitBreakTier | null;
      limitBreak2TriggerText?: string | null;
      limitBreak2Attribute?: CoreAttribute | null;
      limitBreak2ThresholdSuccesses?: number | null;
      limitBreak2CostText?: string | null;
      limitBreak2EffectText?: string | null;
    };
    const preview2 = buildCustomLimitBreakPreview(monster, {
      name: monsterWithLb2.limitBreak2Name ?? null,
      tier: monsterWithLb2.limitBreak2Tier ?? null,
      triggerText: monsterWithLb2.limitBreak2TriggerText ?? null,
      attribute: monsterWithLb2.limitBreak2Attribute ?? null,
      thresholdSuccesses: monsterWithLb2.limitBreak2ThresholdSuccesses ?? null,
      costText: monsterWithLb2.limitBreak2CostText ?? null,
      effectText: monsterWithLb2.limitBreak2EffectText ?? null,
    });
    return [preview1, preview2].filter((x): x is CustomLimitBreakPreview => Boolean(x));
  }, [monster]);
  const hasAnyLimitBreak = Boolean(legendaryLimitBreakPreview || customLimitBreakPreviews.length > 0);
  const renderedTraits = useMemo(() => {
    const out: Array<{ key: string; name: string; effect: string }> = [];

    // Monster traits
    for (let idx = 0; idx < monster.traits.length; idx++) {
      const trait = monster.traits[idx];
      const traitName = trait.name?.trim() || "Trait";
      const rawEffect = trait.effectText?.trim() || "No description";

      const tokenCtx = buildMonsterTraitRenderContext({
        monster,
        weaponSkillValue: computedWeaponSkillValue,
        armorSkillValue: computedArmorSkillValue,
        willpowerValue,
        dodgeValue,
      });

      const effect = renderTraitTemplate(rawEffect, tokenCtx);
      out.push({
        key: String(trait.id ?? `${trait.traitDefinitionId}-${idx}`),
        name: traitName,
        effect,
      });
    }

    // Item attribute placement TRAITS (treated as additional trait rows)
    for (let idx = 0; idx < equippedTraitLinesWithSource.length; idx++) {
      const row = equippedTraitLinesWithSource[idx];
      out.push({
        key: `item-trait-${idx}`,
        name: row.sourceItemName,
        effect: row.text,
      });
    }

    return out;
  }, [
    monster,
    computedWeaponSkillValue,
    computedArmorSkillValue,
    willpowerValue,
    dodgeValue,
    equippedTraitLinesWithSource,
  ]);

  const useTraitTable = useMemo(() => {
    if (renderedTraits.length < 4) return false;
    const avgLen =
      renderedTraits.reduce((sum, t) => sum + (t.effect?.length ?? 0), 0) / renderedTraits.length;
    return avgLen <= 70;
  }, [renderedTraits]);
  const hasTraitsOrGeneral =
    renderedTraits.length > 0 || equippedAttributeLinesByPlacement.GENERAL.length > 0;
  const traitCount = renderedTraits.length;
  const traitGridClass = traitCount <= 1 ? "mt-2 grid grid-cols-1 gap-2" : "mt-2 grid grid-cols-2 gap-2";
  const powerCount = Array.isArray(monster.powers) ? monster.powers.length : 0;
  const powerGridClass = powerCount <= 1 ? "sc-print-power-grid sc-grid-1" : "sc-print-power-grid";
  const nonPrintAttrGapClass =
    printLayout === "LEGENDARY_2P" ? "flex-1 gap-[14px] lg:gap-[75px]" : "flex-1 gap-1 lg:gap-[65px]";

  return (
    <div
      className={[
        "sc-monster-block sc-monster-card mx-auto w-full rounded border border-zinc-800 bg-zinc-950 p-4 space-y-3 text-sm",
        inPrint ? `sc-is-print sc-print-layout-${printLayout} sc-print-page-${printPage}` : "",
        is2Page ? "sc-is-2p" : "",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {isPowerPage && (
        <div className="rounded border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-base font-semibold leading-tight">
                {monster.name?.trim() ? monster.name : "Unnamed Monster"}
              </p>
              <p className="text-xs text-zinc-400">
                Level {monster.level} | {monster.legendary ? "Legendary " : ""}
                {formatTierLabel(monsterMeta.tier)}
              </p>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Power Action Reference
            </p>
          </div>
        </div>
      )}

      {!isPowerPage && (
      <div className="rounded border border-zinc-800 bg-zinc-900/10 p-3">
        <div className="sc-hero-header mb-2 pb-2">
          <div className="grid grid-cols-3 items-center gap-2">
            <div className="text-left">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Mental Perseverance</p>
              <p className="text-lg font-semibold leading-none">{monster.mentalPerseveranceMax}</p>
            </div>

            <div className="text-center">
              <p className="text-lg font-semibold leading-tight">
                {monster.name?.trim() ? monster.name : "Unnamed Monster"}
              </p>
              <p className="text-xs text-zinc-400">
                Level {monster.level} | {monster.legendary ? "Legendary " : ""}
                {formatTierLabel(monsterMeta.tier)}
              </p>
            </div>

            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Physical Resilience</p>
              <p className="text-lg font-semibold leading-none">{monster.physicalResilienceMax}</p>
            </div>
          </div>
        </div>

        <div
          className={[
            "grid grid-cols-1 lg:grid-cols-[2.2fr_1.6fr_2.2fr] gap-4 items-start min-w-0 sc-hero-row",
            !inPrint ? "lg:min-h-[360px] xl:min-h-[420px]" : "",
          ].join(" ")}
        >
          {/* LEFT: Mental */}
          <div className="space-y-1 md:col-start-1 h-full flex flex-col sc-hero-left">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Mental</p>
            <div
              className={[
                "mt-2 flex flex-col sc-attr-stack",
                inPrint ? "gap-1" : nonPrintAttrGapClass,
              ].join(" ")}
            >
              {(["Intellect", "Support", "Bravery"] as const).map((label) => {
                const row = ATTR_ROWS.find((r) => r[0] === label);
                if (!row) return null;
                const [, dieKey, resistKey, modKey] = row;

                const itemModifier = itemDerived.itemModifiers[MOD_KEY_TO_ITEM_FIELD[modKey]];
                const modifierValue = useItemDerivedValues ? itemModifier : Number(monster[modKey]);
                const resistDice = Number(monster[resistKey]);
                const die = monster[dieKey];

                return (
                  <div key={label} className="rounded border border-zinc-800 bg-zinc-950/20 px-0.5 py-0.5 sm:px-0.5 sm:py-0.5 lg:px-1 lg:py-1">
                    <p className="font-semibold text-[10px] sm:text-[11px] lg:text-xs xl:text-sm leading-tight text-center">{label}</p>
                    <div className="mt-1 grid grid-cols-[1fr_auto] items-start gap-1">
                      <div className="text-[8px] sm:text-[9px] text-zinc-400 leading-snug">
                        <p className="whitespace-nowrap">Mod: {formatModifierWithEffective(modifierValue)}</p>
                        <p className="whitespace-nowrap">Resist: {resistDice} Dice</p>
                      </div>
                      <p className="text-[clamp(0.9rem,2.4vw,1.6rem)] font-semibold leading-none">
                        {formatAttributeDieDisplay(dieLabel(die))}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CENTER: Image */}
          <div className="w-full min-w-0 justify-self-start lg:col-start-2 flex sc-hero-mid items-start">
            {imageUrl ? (
              <div
                data-sc="hero-image-wrap"
                className={[
                  "w-full min-w-0 sc-image-wrap rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden p-2 flex items-center justify-center",
                  "mx-auto max-w-[240px] sm:max-w-[280px]",
                  "lg:mx-auto lg:max-w-[320px] xl:max-w-[360px]",
                ].join(" ")}
              >
                <img
                  src={imageUrl}
                  alt={monster.name?.trim() ? monster.name : "Monster image"}
                  className="w-full h-full object-cover mx-auto bg-zinc-950/20"
                  style={{ objectPosition: `${imagePosX}% ${imagePosY}%` }}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div
                data-sc="hero-image-wrap"
                className={[
                  "w-full min-w-0 rounded border border-zinc-800 bg-zinc-950/30 p-3 text-center text-xs text-zinc-500 flex items-center justify-center overflow-hidden",
                  "mx-auto max-w-[240px] sm:max-w-[280px]",
                  "lg:mx-auto lg:max-w-[320px] xl:max-w-[360px]",
                ].join(" ")}
              >
                No image
              </div>
            )}
          </div>

          {/* RIGHT: Physical */}
          <div className="space-y-1 md:col-start-3 h-full flex flex-col sc-hero-right">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Physical</p>
            <div
              className={[
                "mt-2 flex flex-col sc-attr-stack",
                inPrint ? "gap-1" : nonPrintAttrGapClass,
              ].join(" ")}
            >
              {(["Attack", "Defence", "Fortitude"] as const).map((label) => {
                const row = ATTR_ROWS.find((r) => r[0] === label);
                if (!row) return null;
                const [, dieKey, resistKey, modKey] = row;

                const itemModifier = itemDerived.itemModifiers[MOD_KEY_TO_ITEM_FIELD[modKey]];
                const modifierValue = useItemDerivedValues ? itemModifier : Number(monster[modKey]);
                const resistDice = Number(monster[resistKey]);
                const die = monster[dieKey];

                return (
                  <div key={label} className="rounded border border-zinc-800 bg-zinc-950/20 px-0.5 py-0.5 sm:px-0.5 sm:py-0.5 lg:px-1 lg:py-1 text-right">
                    <p className="font-semibold text-[10px] sm:text-[11px] lg:text-xs xl:text-sm leading-tight text-center">{label}</p>
                    <div className="mt-1 grid grid-cols-[auto_1fr] items-start gap-1">
                      <p className="text-[clamp(0.9rem,2.4vw,1.6rem)] font-semibold leading-none">
                        {formatAttributeDieDisplay(dieLabel(die))}
                      </p>
                      <div className="text-[8px] sm:text-[9px] text-zinc-400 leading-snug text-right">
                        <p className="whitespace-nowrap">{formatModifierWithEffective(modifierValue)} :Mod</p>
                        <p className="whitespace-nowrap">{resistDice} Dice :Resist</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      )}
      {!isPowerPage && hasTraitsOrGeneral && (
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Traits</p>

          {inPrint && renderedTraits.length > 0 && (
            <div className={traitGridClass}>
              {renderedTraits.map((t, idx) => {
                const isLast = idx === traitCount - 1;
                const isOddCount = traitCount % 2 === 1;
                const spanFull = traitCount > 1 && isOddCount && isLast;

                return (
                <div
                  key={t.key}
                  className={["rounded border border-zinc-800 bg-zinc-950/20 p-2", spanFull ? "col-span-2" : ""].join(" ").trim()}
                >
                  <p className="font-semibold text-xs">{t.name}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-zinc-300">{t.effect}</p>
                </div>
              )})}
            </div>
          )}

          {!inPrint && renderedTraits.length > 0 && useTraitTable && (
            <div className="mt-2 overflow-hidden rounded border border-zinc-800">
              <div className="grid grid-cols-[140px_1fr] border-b border-zinc-800 bg-zinc-950/40">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Trait</p>
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Effect</p>
              </div>

              {renderedTraits.map((t, idx) => (
                <div
                  key={t.key}
                  className={[
                    "grid grid-cols-[140px_1fr]",
                    idx !== renderedTraits.length - 1 ? "border-b border-zinc-800" : "",
                  ].join(" ")}
                >
                  <p className="px-2 py-1 text-xs font-medium">{t.name}</p>
                  <p className="px-2 py-1 text-xs text-zinc-300">{t.effect}</p>
                </div>
              ))}
            </div>
          )}

          {!inPrint && renderedTraits.length > 0 && !useTraitTable && (
            <div className="mt-2 space-y-1">
              {renderedTraits.map((t) => (
                <div key={t.key} className="space-y-0.5">
                  <p>- {t.name}</p>
                  <p className="pl-3 text-xs text-zinc-400">{t.effect}</p>
                </div>
              ))}
            </div>
          )}

          {equippedAttributeLinesByPlacement.GENERAL.length > 0 && (
            <div className="mt-2">
              <div className="rounded border border-zinc-800 p-2 space-y-1">
                {equippedAttributeLinesByPlacement.GENERAL.map((line, idx) => (
                  <p key={`general-placement-${idx}`} className="text-xs text-zinc-400">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!isPowerPage && (
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">DEFENCE</p>
        <div className="rounded border border-zinc-800 p-2 space-y-2">
          {/* Core defence lines: always 3-up, wrappers scale this block on small screens */}
          <div className="grid grid-cols-3 gap-2 sc-defence-grid">
            {renderedDefenceStrings.map((line, i) => (
              <div
                key={i}
                className="rounded border border-zinc-800 bg-zinc-950/20 px-2 py-0 text-xs leading-snug text-center h-full min-h-[70px] min-w-0 w-full flex items-center justify-center sc-defence-chip"
              >
                {line}
              </div>
            ))}
          </div>

          {compressedDefenceLinesWithSource.length > 0 && (
            <div className="border-t border-zinc-800 pt-2 space-y-1 sc-defence-passives">
              {compressedDefenceLinesWithSource.map((row, idx) => (
                <p key={`defence-placement-${idx}`} className="text-xs text-zinc-400">
                  {row.sourceItemName}: {row.text}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {!isPowerPage && (
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">ATTACKS</p>
        <div className="rounded border border-zinc-800 p-2 space-y-1">
          {renderedAttacks.length === 0 && <p className="text-zinc-500">No attack lines.</p>}

          {inPrint && renderedAttacks.length > 0 && (
            <div className={attackWrapClass}>
              {attackGroupsForRender.map((group, idx) => {
                const isWide = wideAttackGroup?.label === group.label;
                const spanFull =
                  isTwoColumnAttackGrid &&
                  hasOddAttackGroups &&
                  allowOddTailFullSpan &&
                  idx === attackGroupsForRender.length - 1;

                if (isWide) {
                  return (
                    <div
                      key={group.label}
                      className="sc-print-attack-card sc-attack-wide col-span-2 rounded border border-zinc-800 bg-zinc-950/20 p-2"
                    >
                      <p className="font-semibold text-xs">{group.label}</p>

                      {group.attacks.flatMap((attack) => attack.attackPlacementLines).map((line, idx) => (
                        <p key={`atk-pl-${group.label}-${idx}`} className="mt-1 text-[10px] leading-snug text-zinc-300">
                          {highlightMechanics(line)}
                        </p>
                      ))}

                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <div className="sc-attack-sub">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Melee</p>
                          <div className="mt-1 space-y-1">
                            {group.meleeLines.map((parsed, idx) => (
                              <p key={`atk-wide-melee-${group.label}-${idx}`} className="text-[10px] leading-snug">
                                {highlightMechanics(parsed.text)}
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className="sc-attack-sub">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Ranged</p>
                          <div className="mt-1 space-y-1">
                            {group.rangedLines.map((parsed, idx) => (
                              <p key={`atk-wide-ranged-${group.label}-${idx}`} className="text-[10px] leading-snug">
                                {highlightMechanics(parsed.text)}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={group.label}
                    className={[
                      "sc-print-attack-card rounded border border-zinc-800 bg-zinc-950/20 p-2 mb-2",
                      spanFull ? "sc-span-full" : "",
                    ].join(" ")}
                  >
                    <p className="font-semibold text-xs">{group.label}</p>

                    {group.attacks.flatMap((attack) => attack.attackPlacementLines).map((line, idx) => (
                      <p key={`atk-pl-${group.label}-${idx}`} className="mt-1 text-[10px] leading-snug text-zinc-300">
                        {highlightMechanics(line)}
                      </p>
                    ))}

                    <div className="mt-1 space-y-1">
                      {group.parsedLines.map((parsed, idx) => (
                        <div key={`atk-ln-${group.label}-${idx}`} className="grid grid-cols-[70px_1fr] gap-2">
                          <p className="font-medium text-[10px]">{parsed.header}</p>
                          <p className="text-[10px] leading-snug">{highlightMechanics(parsed.text)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!inPrint && renderedAttacks.map((attack, attackIndex) => (
            <div key={attackIndex} className="space-y-1">
              <p className="font-medium">Attack {attackIndex + 1}</p>
              <p>{attack.label}</p>
              {attack.attackPlacementLines.map((line, idx) => (
                <p key={`attack-inline-${attackIndex}-${idx}`} className="text-xs text-zinc-400">
                  {highlightMechanics(line)}
                </p>
              ))}
              {attack.lines.map((line, idx) => {
                const parsed = parseHeaderLine(line);
                return (
                  <div key={idx} className="grid grid-cols-[82px_1fr] gap-2">
                    <p className="font-medium">{parsed.header}</p>
                    <p>{highlightMechanics(parsed.text)}</p>
                  </div>
                );
              })}
              {attack.lines.length === 0 && (
                <p className="text-zinc-500">No attack lines.</p>
              )}
            </div>
          ))}
        </div>
      </div>
      )}

      {!isMainPage && (
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Powers</p>
        {monster.powers.length === 0 && <p className="text-zinc-500">None</p>}
        <div className={powerGridClass}>
        {monster.powers.map((power, idx) => {
          const isLast = idx === powerCount - 1;
          const isOddCount = powerCount % 2 === 1;
          const spanFull = powerCount > 1 && isOddCount && isLast;

          return (
          <div
            key={idx}
            className={["sc-print-power-card rounded border border-zinc-800 p-2 space-y-1", spanFull ? "col-span-2" : ""].join(" ").trim()}
          >
            <div className="mb-2 rounded border border-zinc-800 bg-zinc-950/40 p-2 text-center">
              <div className="text-sm font-semibold leading-tight">
                {power.name}
              </div>

              {power.description && (
                <div className="mt-1 text-xs font-normal leading-snug">
                  {highlightMechanics(power.description)}
                </div>
              )}
            </div>
            {renderPowerDescriptorLines(power).map((line, i) => (
              <p key={i}>{highlightMechanics(line)}</p>
            ))}
            <p>
              {highlightMechanics(
                `Cooldown: ${effectiveCooldownTurns(power)} | Response: ${power.responseRequired ? "Yes" : "No"}`,
              )}
            </p>
          </div>
        )})}
        </div>
      </div>
      )}

      {!isMainPage && hasAnyLimitBreak && (
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">LIMIT BREAK</p>

          {legendaryLimitBreakPreview && (
            <div className="rounded border border-zinc-800 p-2 space-y-1.5">
              <div className="mb-2">
                <div className="rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-center">
                  <p className="font-semibold text-sm tracking-wide">
                    {legendaryLimitBreakPreview.sourceLabel} - {legendaryLimitBreakPreview.name} ({legendaryLimitBreakPreview.tier})
                  </p>
                </div>
              </div>
              <p className="text-zinc-300">
                Roll {legendaryLimitBreakPreview.baseDiceCount ?? "â€”"} dice.{" "}
                {legendaryLimitBreakPreview.name} executes on{" "}
                {legendaryLimitBreakPreview.thresholdRequired ?? "â€”"} successes.
              </p>
              {legendaryLimitBreakPreview.costText.length > 0 && (
                <p className="text-zinc-300">
                  <span className="text-zinc-400">Cost:</span>{" "}
                  {legendaryLimitBreakPreview.costText}
                </p>
              )}
              {legendaryLimitBreakPreview.effectText.length > 0 && (
                <p className="text-zinc-300">
                  <span className="text-zinc-400">Effect:</span>{" "}
                  {legendaryLimitBreakPreview.effectText}
                </p>
              )}
            </div>
          )}

          {customLimitBreakPreviews.map((customLimitBreakPreview, idx) => (
            <div key={`innate-limit-break-${idx}`} className="mt-2 rounded border border-zinc-800 p-2 space-y-1.5">
              <div className="mb-2">
                <div className="rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-center">
                  <p className="font-semibold text-sm tracking-wide">
                    Innate - {customLimitBreakPreview.name}
                    {customLimitBreakPreview.tier ? ` (${customLimitBreakPreview.tier})` : ""}
                  </p>
                </div>
              </div>
              <p className="text-zinc-300">
                Roll {customLimitBreakPreview.baseDiceCount ?? "—"}
                {customLimitBreakPreview.attributeLabel ? ` ${customLimitBreakPreview.attributeLabel}` : ""} dice.{" "}
                {customLimitBreakPreview.name} executes on{" "}
                {customLimitBreakPreview.threshold ?? "—"} successes.
              </p>
              {customLimitBreakPreview.triggerText.length > 0 && (
                <p className="text-zinc-300">
                  <span className="text-zinc-400">Trigger:</span>{" "}
                  {customLimitBreakPreview.triggerText}
                </p>
              )}
              {customLimitBreakPreview.costText.length > 0 && (
                <p className="text-zinc-300">
                  <span className="text-zinc-400">Cost:</span>{" "}
                  {customLimitBreakPreview.costText}
                </p>
              )}
              {customLimitBreakPreview.effectText.length > 0 && (
                <p className="text-zinc-300">
                  <span className="text-zinc-400">Effect:</span>{" "}
                  {customLimitBreakPreview.effectText}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {!isPowerPage && customNotesText.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Custom Attributes</p>
          <p className="whitespace-pre-wrap">{customNotesText}</p>
        </div>
      )}

      <style jsx global>{`
        /* IMPORTANT:
           Monster hero image sizing must ONLY be changed via the SC_IMAGE_SIZING_TOKENS variables below.
           Do NOT add aspect/max-height/height rules anywhere else (JSX Tailwind or other print rules).
        */
        /* ===========================
           SC_IMAGE_SIZING_TOKENS
           Single source of truth
           =========================== */
        .sc-monster-card {
          --sc-image-aspect: 3 / 4;
          --sc-image-max-h: 60mm;
          --sc-image-max-h-compact-1p: 60mm;
          --sc-image-max-h-legendary-p1: 70mm;
          --sc-image-max-h-legendary-p2: 60mm;
        }

        /* SC_IMAGE_SIZING_APPLY */
        .sc-monster-card .sc-image-wrap {
          aspect-ratio: var(--sc-image-aspect);
          max-height: var(--sc-image-max-h);
          height: auto;
        }

        /* SC_IMAGE_SIZING_LAYOUTS */
        .sc-print-layout-COMPACT_1P.sc-monster-card {
          --sc-image-max-h: var(--sc-image-max-h-compact-1p);
        }
        .sc-print-layout-LEGENDARY_2P.sc-print-page-PAGE1_MAIN.sc-monster-card {
          --sc-image-max-h: var(--sc-image-max-h-legendary-p1);
        }
        .sc-print-layout-LEGENDARY_2P.sc-print-page-PAGE2_POWER.sc-monster-card {
          --sc-image-max-h: var(--sc-image-max-h-legendary-p2);
        }

        .sc-is-print .sc-image-wrap {
          flex: 0 0 auto !important;
        }

        .sc-is-print .sc-image-wrap img {
          max-height: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }

        /* Force hero layout in print preview (screen) */
        .sc-is-print .sc-hero-row {
          display: grid !important;
          grid-template-columns: 1fr 2fr 1fr !important;
          gap: 10px !important;
          align-items: stretch !important;
        }
        .sc-is-print .sc-hero-left,
        .sc-is-print .sc-hero-right {
          display: flex !important;
          flex-direction: column !important;
        }
        .sc-is-print .sc-hero-mid {
          display: flex !important;
        }
        .sc-is-print .sc-image-wrap {
          width: 100% !important;
        }

        /* ===== Print Preview must mirror Print output ===== */
        .sc-is-print .sc-defence-passives {
          column-count: 2;
          column-gap: 10px;
        }
        .sc-is-print .sc-defence-passives > * {
          break-inside: avoid;
        }

        /* Attacks: flowing columns in preview too */
        .sc-is-print .sc-print-attack-columns {
          column-fill: auto;
        }
        .sc-is-print .sc-print-attack-columns.sc-cols-1 {
          column-count: 1;
          column-gap: 8px;
        }
        .sc-is-print .sc-print-attack-columns.sc-cols-2 {
          column-count: 2;
          column-gap: 8px;
        }
        .sc-is-print .sc-print-attack-columns.sc-cols-3 {
          column-count: 3;
          column-gap: 8px;
        }

        .sc-is-print .sc-print-attack-card {
          break-inside: avoid;
          page-break-inside: avoid;
          display: inline-block;
          width: 100%;
          min-width: 0;
          margin-bottom: 8px;
        }
        /* Attacks: grid for Compact preview */
        .sc-is-print .sc-print-attack-grid.sc-grid-1 {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .sc-is-print .sc-print-attack-grid.sc-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .sc-print-attack-grid.sc-grid-2 .sc-span-full {
          grid-column: 1 / -1;
        }
        .sc-is-print .sc-print-attack-grid .sc-print-attack-card {
          width: auto;
          margin: 0;
          display: block;
        }

        .sc-print-power-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 4px 10px;
        }
        .sc-print-power-grid.sc-grid-1 {
          grid-template-columns: 1fr;
        }
        .sc-is-print .sc-print-power-card {
          break-inside: avoid;
          page-break-inside: avoid;
          display: inline-block;
          width: 100%;
          margin: 0 !important;
        }
        .sc-attack-wide .sc-attack-sub {
          break-inside: avoid;
        }

        /* Core print styling: shared by print-preview/editor-preview/real-print */
        .sc-is-print.sc-monster-card {
          padding: 6px !important;
          font-size: 10px !important;
          line-height: 1.15 !important;
          background: #ffffff !important;
          color: #111111 !important;
        }
        .sc-is-print.sc-monster-card * {
          color: inherit !important;
        }
        .sc-is-print.sc-monster-card.space-y-2 > :not([hidden]) ~ :not([hidden]) {
          margin-top: 4px !important;
        }
        .sc-is-print.sc-monster-card.space-y-3 > :not([hidden]) ~ :not([hidden]) {
          margin-top: 5px !important;
        }
        .sc-is-print.sc-monster-card.space-y-4 > :not([hidden]) ~ :not([hidden]) {
          margin-top: 6px !important;
        }
        .sc-is-print.sc-monster-card .bg-zinc-950\\/40 {
          padding: 4px !important;
        }
        .sc-is-print.sc-monster-card .sc-attr-stack {
          gap: 4px !important;
        }
        .sc-is-print.sc-print-layout-LEGENDARY_2P .sc-hero-left .sc-attr-stack,
        .sc-is-print.sc-print-layout-LEGENDARY_2P .sc-hero-right .sc-attr-stack {
          flex: 1 1 auto !important;
          justify-content: space-between !important;
          gap: 14px !important;
        }
        .sc-is-print.sc-monster-card .sc-defence-chip {
          min-height: 0 !important;
          padding-top: 4px !important;
          padding-bottom: 4px !important;
        }
        .sc-is-print.sc-monster-card .rounded.border.border-zinc-800.p-2 {
          padding: 6px !important;
        }
        .sc-is-print.sc-monster-card .rounded.border.border-zinc-800.bg-zinc-900\\/10.p-3 {
          padding: 4px !important;
        }
        .sc-is-print.sc-monster-card .sc-print-attack-card {
          padding: 6px !important;
        }
        .sc-is-print.sc-monster-card .sc-print-power-card {
          padding: 6px !important;
        }
        .sc-is-print.sc-monster-card .text-xs.uppercase.tracking-wide {
          font-size: 8.5px !important;
          line-height: 1 !important;
        }
        .sc-is-print.sc-monster-card .text-\\[clamp\\(1\\.5rem\\,4vw\\,2\\.25rem\\)\\] {
          font-size: 22px !important;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}



