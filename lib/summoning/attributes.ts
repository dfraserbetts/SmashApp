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

export function getWeaponSkillDiceCountFromAttributes(
  attackDie: DiceSize | null | undefined,
  braveryDie: DiceSize | null | undefined,
): number {
  const attackValue = getAttributeSkillDiceContribution(attackDie);
  const braveryValue = getAttributeSkillDiceContribution(braveryDie);
  return Math.max(1, Math.ceil((attackValue + braveryValue) / 2));
}

export function getArmorSkillDiceCountFromAttributes(
  defenceDie: DiceSize | null | undefined,
  fortitudeDie: DiceSize | null | undefined,
): number {
  const defenceValue = getAttributeSkillDiceContribution(defenceDie);
  const fortitudeValue = getAttributeSkillDiceContribution(fortitudeDie);
  return Math.max(1, Math.ceil((defenceValue + fortitudeValue) / 2));
}

export function getDodgeValue(
  defenceDie: DiceSize | null | undefined,
  intellectDie: DiceSize | null | undefined,
  level: number,
  physicalWeight: number,
): number {
  return (
    getAttributeNumericValue(defenceDie) +
    getAttributeNumericValue(intellectDie) +
    level -
    physicalWeight
  );
}

export function getWillpowerDiceCountFromAttributes(
  supportDie: DiceSize | null | undefined,
  braveryDie: DiceSize | null | undefined,
): number {
  const supportValue = getAttributeSkillDiceContribution(supportDie);
  const braveryValue = getAttributeSkillDiceContribution(braveryDie);
  return Math.max(1, Math.ceil((supportValue + braveryValue) / 2));
}
