import type { DiceSize } from "@/lib/summoning/types";
import { getAttributeNumericValue } from "@/lib/summoning/attributes";

export const MONSTER_TRAIT_MECHANICAL_TARGETS = [
  "ATTACK_ATTRIBUTE",
  "GUARD_ATTRIBUTE",
  "FORTITUDE_ATTRIBUTE",
  "INTELLECT_ATTRIBUTE",
  "SYNERGY_ATTRIBUTE",
  "BRAVERY_ATTRIBUTE",
  "ATTACK_RESIST",
  "GUARD_RESIST",
  "FORTITUDE_RESIST",
  "INTELLECT_RESIST",
  "SYNERGY_RESIST",
  "BRAVERY_RESIST",
  "PHYSICAL_RESILIENCE",
  "MENTAL_PERSEVERANCE",
  "WEAPON_SKILL",
  "ARMOR_SKILL",
  "WILLPOWER",
  "DODGE",
] as const;

export type MonsterTraitMechanicalTarget = (typeof MONSTER_TRAIT_MECHANICAL_TARGETS)[number];

export const MONSTER_TRAIT_MECHANICAL_TARGET_LABELS: Record<
  MonsterTraitMechanicalTarget,
  string
> = {
  ATTACK_ATTRIBUTE: "Attack Attribute",
  GUARD_ATTRIBUTE: "Guard Attribute",
  FORTITUDE_ATTRIBUTE: "Fortitude Attribute",
  INTELLECT_ATTRIBUTE: "Intellect Attribute",
  SYNERGY_ATTRIBUTE: "Synergy Attribute",
  BRAVERY_ATTRIBUTE: "Bravery Attribute",
  ATTACK_RESIST: "Attack Resist",
  GUARD_RESIST: "Guard Resist",
  FORTITUDE_RESIST: "Fortitude Resist",
  INTELLECT_RESIST: "Intellect Resist",
  SYNERGY_RESIST: "Synergy Resist",
  BRAVERY_RESIST: "Bravery Resist",
  PHYSICAL_RESILIENCE: "Physical Resilience",
  MENTAL_PERSEVERANCE: "Mental Perseverance",
  WEAPON_SKILL: "Weapon Skill",
  ARMOR_SKILL: "Armor Skill",
  WILLPOWER: "Willpower",
  DODGE: "Dodge",
};

export const MONSTER_TRAIT_MECHANICAL_OPERATIONS = ["ADD"] as const;
export type MonsterTraitMechanicalOperation = (typeof MONSTER_TRAIT_MECHANICAL_OPERATIONS)[number];

export type MonsterTraitMechanicalEffectSummary = {
  id?: string;
  sortOrder: number;
  target: MonsterTraitMechanicalTarget;
  operation: MonsterTraitMechanicalOperation;
  valueExpression: string;
};

export type MonsterTraitFormulaContext = {
  MonsterName?: string | null;
  MonsterLevel: number;
  MonsterAttack?: DiceSize | number | null;
  MonsterGuard?: DiceSize | number | null;
  MonsterFortitude?: DiceSize | number | null;
  MonsterIntellect?: DiceSize | number | null;
  MonsterSynergy?: DiceSize | number | null;
  MonsterBravery?: DiceSize | number | null;
  MonsterArmorSkill?: number | null;
  MonsterWeaponSkill?: number | null;
  MonsterWillpower?: number | null;
  MonsterDodge?: number | null;
};

export type MonsterTraitMechanicalModifiers = {
  attributeModifiers: {
    attack: number;
    guard: number;
    fortitude: number;
    intellect: number;
    synergy: number;
    bravery: number;
  };
  resistModifiers: {
    attack: number;
    guard: number;
    fortitude: number;
    intellect: number;
    synergy: number;
    bravery: number;
  };
  poolModifiers: {
    physicalResilience: number;
    mentalPerseverance: number;
  };
  derivedModifiers: {
    weaponSkill: number;
    armorSkill: number;
    willpower: number;
    dodge: number;
  };
};

export function createEmptyMonsterTraitMechanicalModifiers(): MonsterTraitMechanicalModifiers {
  return {
    attributeModifiers: {
      attack: 0,
      guard: 0,
      fortitude: 0,
      intellect: 0,
      synergy: 0,
      bravery: 0,
    },
    resistModifiers: {
      attack: 0,
      guard: 0,
      fortitude: 0,
      intellect: 0,
      synergy: 0,
      bravery: 0,
    },
    poolModifiers: {
      physicalResilience: 0,
      mentalPerseverance: 0,
    },
    derivedModifiers: {
      weaponSkill: 0,
      armorSkill: 0,
      willpower: 0,
      dodge: 0,
    },
  };
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

  for (let t = 0; t < tokens.length; t += 1) {
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

  return stack.length === 1 ? stack[0] : null;
}

function contextValueToNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^D(4|6|8|10|12)$/.test(value)) {
    return getAttributeNumericValue(value as DiceSize);
  }
  return null;
}

export function evaluateMonsterTraitFormula(
  expression: string,
  context: MonsterTraitFormulaContext,
): number | null {
  let source = expression.trim();
  if (!source) return null;

  source = source.replace(/\[([A-Za-z0-9]+)\]/g, (_match, key: string) => {
    const n = contextValueToNumber(context[key as keyof MonsterTraitFormulaContext]);
    return n === null ? "?" : String(n);
  });
  if (source.includes("?")) return null;

  let guard = 0;
  while (/\b(ceil|floor|round)\s*\([^()]*\)/.test(source) && guard < 20) {
    guard += 1;
    source = source.replace(
      /\b(ceil|floor|round)\s*\(([^()]*)\)/g,
      (_full, fn: string, inner: string) => {
        const value = safeEvalArithmetic(inner);
        if (value === null) return "?";
        if (fn === "ceil") return String(Math.ceil(value));
        if (fn === "floor") return String(Math.floor(value));
        return String(Math.round(value));
      },
    );
    if (source.includes("?")) return null;
  }

  const value = safeEvalArithmetic(source);
  return value === null || !Number.isFinite(value) ? null : value;
}

export function computeMonsterTraitMechanicalModifiers(
  effects: MonsterTraitMechanicalEffectSummary[],
  context: MonsterTraitFormulaContext,
): MonsterTraitMechanicalModifiers {
  const modifiers = createEmptyMonsterTraitMechanicalModifiers();

  for (const effect of effects) {
    const value = evaluateMonsterTraitFormula(effect.valueExpression, context);
    if (value === null) continue;

    switch (effect.target) {
      case "ATTACK_ATTRIBUTE":
        modifiers.attributeModifiers.attack += value;
        break;
      case "GUARD_ATTRIBUTE":
        modifiers.attributeModifiers.guard += value;
        break;
      case "FORTITUDE_ATTRIBUTE":
        modifiers.attributeModifiers.fortitude += value;
        break;
      case "INTELLECT_ATTRIBUTE":
        modifiers.attributeModifiers.intellect += value;
        break;
      case "SYNERGY_ATTRIBUTE":
        modifiers.attributeModifiers.synergy += value;
        break;
      case "BRAVERY_ATTRIBUTE":
        modifiers.attributeModifiers.bravery += value;
        break;
      case "ATTACK_RESIST":
        modifiers.resistModifiers.attack += value;
        break;
      case "GUARD_RESIST":
        modifiers.resistModifiers.guard += value;
        break;
      case "FORTITUDE_RESIST":
        modifiers.resistModifiers.fortitude += value;
        break;
      case "INTELLECT_RESIST":
        modifiers.resistModifiers.intellect += value;
        break;
      case "SYNERGY_RESIST":
        modifiers.resistModifiers.synergy += value;
        break;
      case "BRAVERY_RESIST":
        modifiers.resistModifiers.bravery += value;
        break;
      case "PHYSICAL_RESILIENCE":
        modifiers.poolModifiers.physicalResilience += value;
        break;
      case "MENTAL_PERSEVERANCE":
        modifiers.poolModifiers.mentalPerseverance += value;
        break;
      case "WEAPON_SKILL":
        modifiers.derivedModifiers.weaponSkill += value;
        break;
      case "ARMOR_SKILL":
        modifiers.derivedModifiers.armorSkill += value;
        break;
      case "WILLPOWER":
        modifiers.derivedModifiers.willpower += value;
        break;
      case "DODGE":
        modifiers.derivedModifiers.dodge += value;
        break;
    }
  }

  return modifiers;
}
