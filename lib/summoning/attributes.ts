import type { DiceSize, MonsterTier } from "@/lib/summoning/types";
import type { ProtectionTuningValues } from "@/lib/config/combatTuningShared";
import {
  DEFAULT_ARMOR_SKILL_BASELINE_OFFSET,
  DEFAULT_ARMOR_SKILL_DEFENCE_WEIGHT,
  DEFAULT_ARMOR_SKILL_FORTITUDE_WEIGHT,
  DEFAULT_ARMOR_SKILL_SCALE,
  DEFAULT_DODGE_ATTRIBUTE_DIVISOR,
  DEFAULT_DODGE_DEFENCE_WEIGHT,
  DEFAULT_DODGE_INTELLECT_WEIGHT,
  DEFAULT_DODGE_PROTECTION_PENALTY_WEIGHT,
  DEFAULT_WEAPON_SKILL_ATTACK_WEIGHT,
  DEFAULT_WEAPON_SKILL_BASELINE_OFFSET,
  DEFAULT_WEAPON_SKILL_BRAVERY_WEIGHT,
  DEFAULT_WEAPON_SKILL_SCALE,
  DEFAULT_WILLPOWER_BASELINE_OFFSET,
  DEFAULT_WILLPOWER_BRAVERY_WEIGHT,
  DEFAULT_WILLPOWER_SCALE,
  DEFAULT_WILLPOWER_SUPPORT_WEIGHT,
} from "@/lib/config/combatTuningShared";

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
 * MAX(1, CEILING( ROUND( (weightedAverage(ROUND(primary/2,0), ROUND(secondary/2,0)) - offset) * scale, 1), 1))
 */
export function weightedSkillFromAttributes(
  primary: number,
  secondary: number,
  tuning?: {
    primaryWeight?: number;
    secondaryWeight?: number;
    baselineOffset?: number;
    scale?: number;
  },
): number {
  const primaryHalf = round0(primary / 2);
  const secondaryHalf = round0(secondary / 2);
  const primaryWeight =
    typeof tuning?.primaryWeight === "number" &&
    Number.isFinite(tuning.primaryWeight) &&
    tuning.primaryWeight > 0
      ? tuning.primaryWeight
      : 2;
  const secondaryWeight =
    typeof tuning?.secondaryWeight === "number" &&
    Number.isFinite(tuning.secondaryWeight) &&
    tuning.secondaryWeight > 0
      ? tuning.secondaryWeight
      : 1;
  const baselineOffset =
    typeof tuning?.baselineOffset === "number" &&
    Number.isFinite(tuning.baselineOffset) &&
    tuning.baselineOffset > 0
      ? tuning.baselineOffset
      : 1;
  const scale =
    typeof tuning?.scale === "number" && Number.isFinite(tuning.scale) && tuning.scale > 0
      ? tuning.scale
      : 1;
  const totalWeight = primaryWeight + secondaryWeight;

  const weightedHalf =
    (secondaryHalf * secondaryWeight + primaryHalf * primaryWeight) / totalWeight;
  const raw = (weightedHalf - baselineOffset) * scale;
  const r1 = round1(raw);

  const ceiled = Math.ceil(r1); // CEILING(..., 1)
  return Math.max(1, ceiled);
}

export function getWeaponSkillDiceCountFromAttributes(
  attackDie: DiceSize | null | undefined,
  braveryDie: DiceSize | null | undefined,
  tuning?: Pick<
    ProtectionTuningValues,
    | "weaponSkillAttackWeight"
    | "weaponSkillBraveryWeight"
    | "weaponSkillBaselineOffset"
    | "weaponSkillScale"
  >,
): number {
  const attackValue = getAttributeNumericValue(attackDie);
  const braveryValue = getAttributeNumericValue(braveryDie);
  // Weapon Skill: primary Bravery, secondary Attack
  return weightedSkillFromAttributes(braveryValue, attackValue, {
    primaryWeight: tuning?.weaponSkillBraveryWeight ?? DEFAULT_WEAPON_SKILL_BRAVERY_WEIGHT,
    secondaryWeight: tuning?.weaponSkillAttackWeight ?? DEFAULT_WEAPON_SKILL_ATTACK_WEIGHT,
    baselineOffset:
      tuning?.weaponSkillBaselineOffset ?? DEFAULT_WEAPON_SKILL_BASELINE_OFFSET,
    scale: tuning?.weaponSkillScale ?? DEFAULT_WEAPON_SKILL_SCALE,
  });
}

export function getArmorSkillDiceCountFromAttributes(
  defenceDie: DiceSize | null | undefined,
  fortitudeDie: DiceSize | null | undefined,
  tuning?: Pick<
    ProtectionTuningValues,
    | "armorSkillDefenceWeight"
    | "armorSkillFortitudeWeight"
    | "armorSkillBaselineOffset"
    | "armorSkillScale"
  >,
): number {
  const defenceValue = getAttributeNumericValue(defenceDie);
  const fortitudeValue = getAttributeNumericValue(fortitudeDie);
  // Armor Skill: primary Fortitude, secondary Defence
  return weightedSkillFromAttributes(fortitudeValue, defenceValue, {
    primaryWeight: tuning?.armorSkillFortitudeWeight ?? DEFAULT_ARMOR_SKILL_FORTITUDE_WEIGHT,
    secondaryWeight: tuning?.armorSkillDefenceWeight ?? DEFAULT_ARMOR_SKILL_DEFENCE_WEIGHT,
    baselineOffset: tuning?.armorSkillBaselineOffset ?? DEFAULT_ARMOR_SKILL_BASELINE_OFFSET,
    scale: tuning?.armorSkillScale ?? DEFAULT_ARMOR_SKILL_SCALE,
  });
}

export function getDodgeValue(
  defenceDie: DiceSize | null | undefined,
  intellectDie: DiceSize | null | undefined,
  level: number,
  physicalProtection: number,
  tuning?: Pick<
    ProtectionTuningValues,
    | "dodgeIntellectWeight"
    | "dodgeDefenceWeight"
    | "dodgeAttributeDivisor"
    | "dodgeProtectionPenaltyWeight"
  >,
): number {
  const defenceValue = getAttributeNumericValue(defenceDie);
  const intellectValue = getAttributeNumericValue(intellectDie);
  const intellectWeight = tuning?.dodgeIntellectWeight ?? DEFAULT_DODGE_INTELLECT_WEIGHT;
  const defenceWeight = tuning?.dodgeDefenceWeight ?? DEFAULT_DODGE_DEFENCE_WEIGHT;
  const attributeDivisor = tuning?.dodgeAttributeDivisor ?? DEFAULT_DODGE_ATTRIBUTE_DIVISOR;
  const protectionPenaltyWeight =
    tuning?.dodgeProtectionPenaltyWeight ?? DEFAULT_DODGE_PROTECTION_PENALTY_WEIGHT;
  // DODGE_VALUE_FORMULA_V2
  // Rogues dodge, knights tank. Choose your class fantasy... even in a classless system.
  const base = Math.ceil(
    (intellectValue * intellectWeight + defenceValue * defenceWeight) / attributeDivisor,
  );
  const raw = base + level - physicalProtection * protectionPenaltyWeight;
  return Math.max(1, Math.ceil(raw));
}

export function getWillpowerDiceCountFromAttributes(
  supportDie: DiceSize | null | undefined,
  braveryDie: DiceSize | null | undefined,
  tuning?: Pick<
    ProtectionTuningValues,
    | "willpowerSupportWeight"
    | "willpowerBraveryWeight"
    | "willpowerBaselineOffset"
    | "willpowerScale"
  >,
): number {
  const supportValue = getAttributeNumericValue(supportDie);
  const braveryValue = getAttributeNumericValue(braveryDie);
  // Willpower: primary Support, secondary Bravery
  return weightedSkillFromAttributes(supportValue, braveryValue, {
    primaryWeight: tuning?.willpowerSupportWeight ?? DEFAULT_WILLPOWER_SUPPORT_WEIGHT,
    secondaryWeight: tuning?.willpowerBraveryWeight ?? DEFAULT_WILLPOWER_BRAVERY_WEIGHT,
    baselineOffset: tuning?.willpowerBaselineOffset ?? DEFAULT_WILLPOWER_BASELINE_OFFSET,
    scale: tuning?.willpowerScale ?? DEFAULT_WILLPOWER_SCALE,
  });
}

const LEGENDARY_BONUS_BY_TIER: Record<MonsterTier, number> = {
  MINION: 0.25,
  SOLDIER: 0.5,
  ELITE: 0.75,
  BOSS: 1,
};

export function calculateMonsterResilienceValues(
  monster: {
    level: number;
    tier: MonsterTier;
    legendary: boolean;
    attackDie: DiceSize | null | undefined;
    defenceDie: DiceSize | null | undefined;
    fortitudeDie: DiceSize | null | undefined;
    intellectDie: DiceSize | null | undefined;
    supportDie: DiceSize | null | undefined;
    braveryDie: DiceSize | null | undefined;
  },
  tuning: Pick<
    ProtectionTuningValues,
    | "attackWeight"
    | "defenceWeight"
    | "fortitudeWeight"
    | "intellectWeight"
    | "supportWeight"
    | "braveryWeight"
    | "minionTierMultiplier"
    | "soldierTierMultiplier"
    | "eliteTierMultiplier"
    | "bossTierMultiplier"
  >,
): {
  physicalResilienceMax: number;
  mentalPerseveranceMax: number;
} {
  const tierMultiplierByTier: Record<MonsterTier, number> = {
    MINION: tuning.minionTierMultiplier,
    SOLDIER: tuning.soldierTierMultiplier,
    ELITE: tuning.eliteTierMultiplier,
    BOSS: tuning.bossTierMultiplier,
  };

  const tierMultiplier = tierMultiplierByTier[monster.tier];
  const legendaryBonus = monster.legendary ? LEGENDARY_BONUS_BY_TIER[monster.tier] : 0;

  const prBase =
    monster.level +
    getAttributeNumericValue(monster.attackDie) * tuning.attackWeight +
    getAttributeNumericValue(monster.defenceDie) * tuning.defenceWeight +
    getAttributeNumericValue(monster.fortitudeDie) * tuning.fortitudeWeight;

  const mpBase =
    monster.level +
    getAttributeNumericValue(monster.intellectDie) * tuning.intellectWeight +
    getAttributeNumericValue(monster.supportDie) * tuning.supportWeight +
    getAttributeNumericValue(monster.braveryDie) * tuning.braveryWeight;

  const physicalResilienceMax = Math.round(prBase * tierMultiplier + prBase * legendaryBonus);
  const mentalPerseveranceMax = Math.round(mpBase * tierMultiplier + mpBase * legendaryBonus);

  return { physicalResilienceMax, mentalPerseveranceMax };
}
