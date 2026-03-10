import type { DiceSize } from "@/lib/summoning/types";

const DICE_SIZE_NUMERIC_VALUE: Record<DiceSize, number> = {
  D4: 4,
  D6: 6,
  D8: 8,
  D10: 10,
  D12: 12,
};

export function diceSizeToNumber(die: DiceSize | null | undefined): number {
  if (!die) return 0;
  return DICE_SIZE_NUMERIC_VALUE[die];
}

export function getAttributeNumericValue(die: DiceSize | null | undefined): number {
  // In Summoning V1, core attribute numeric value comes from die size.
  return diceSizeToNumber(die);
}

export function getAttributeSkillDiceContribution(die: DiceSize | null | undefined): number {
  const numeric = diceSizeToNumber(die);
  if (!numeric) return 0;
  return Math.round(numeric / 2);
}

function round0(n: number): number {
  return Math.round(n);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Spreadsheet-equivalent:
 * MAX(1, CEILING( ROUND( (ROUND(secondary/2,0) + 2*ROUND(primary/2,0)) / 3, 1), 1))
 */
export function weightedSkillFromAttributes(primary: number, secondary: number): number {
  const primaryHalf = round0(primary / 2);
  const secondaryHalf = round0(secondary / 2);

  const raw = (secondaryHalf + 2 * primaryHalf) / 3;
  const r1 = round1(raw);

  const ceiled = Math.ceil(r1); // CEILING(..., 1)
  return Math.max(1, ceiled);
}

export function getWeaponSkillDiceCountFromAttributes(
  attackDie: DiceSize | null | undefined,
  braveryDie: DiceSize | null | undefined,
): number {
  const attackValue = getAttributeNumericValue(attackDie);
  const braveryValue = getAttributeNumericValue(braveryDie);
  // Weapon Skill: primary Bravery, secondary Attack
  return weightedSkillFromAttributes(braveryValue, attackValue);
}

export function getArmorSkillDiceCountFromAttributes(
  defenceDie: DiceSize | null | undefined,
  fortitudeDie: DiceSize | null | undefined,
): number {
  const defenceValue = getAttributeNumericValue(defenceDie);
  const fortitudeValue = getAttributeNumericValue(fortitudeDie);
  // Armor Skill: primary Fortitude, secondary Defence
  return weightedSkillFromAttributes(fortitudeValue, defenceValue);
}

export function getDodgeValue(
  defenceDie: DiceSize | null | undefined,
  intellectDie: DiceSize | null | undefined,
  level: number,
  physicalProtection: number,
): number {
  const defenceValue = getAttributeNumericValue(defenceDie);
  const intellectValue = getAttributeNumericValue(intellectDie);
  // DODGE_VALUE_FORMULA_V2
  // Rogues dodge, knights tank. Choose your class fantasy... even in a classless system.
  const base = Math.ceil((2 * intellectValue + defenceValue) / 2);
  const raw = base + level - physicalProtection;
  return Math.max(1, raw);
}

export function getWillpowerDiceCountFromAttributes(
  supportDie: DiceSize | null | undefined,
  braveryDie: DiceSize | null | undefined,
): number {
  const supportValue = getAttributeNumericValue(supportDie);
  const braveryValue = getAttributeNumericValue(braveryDie);
  // Willpower: primary Support, secondary Bravery
  return weightedSkillFromAttributes(supportValue, braveryValue);
}
