export type LimitBreakTierValue = "PUSH" | "BREAK" | "TRANSCEND";

export function getWeaponLimitBreakCeiling(weaponSkill: number): number {
  const normalizedSkill = Number.isFinite(weaponSkill) ? Math.floor(weaponSkill) : 0;
  return Math.max(1, normalizedSkill + 1);
}

export function getAttributeLimitBreakCeiling(attributeValue: number): number {
  const normalizedAttribute = Number.isFinite(attributeValue) ? Math.floor(attributeValue) : 0;
  return Math.max(1, normalizedAttribute + 1);
}

export function getLimitBreakThresholdPercent(
  tier: LimitBreakTierValue | null | undefined,
): number | null {
  if (tier === "PUSH") return 60;
  if (tier === "BREAK") return 85;
  if (tier === "TRANSCEND") return 125;
  return null;
}

export function getLimitBreakRequiredSuccesses(
  ceiling: number,
  thresholdPercent: number,
): number {
  return Math.ceil((ceiling * thresholdPercent) / 100);
}
