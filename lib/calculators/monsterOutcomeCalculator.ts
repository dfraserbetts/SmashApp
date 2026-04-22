import type {
  CoreAttribute,
  LimitBreakTier,
  MonsterTraitBand,
  MonsterTier,
  MonsterUpsertInput,
} from "@/lib/summoning/types";
import {
  getArmorSkillDiceCountFromAttributes,
  getDodgeValue,
  getWillpowerDiceCountFromAttributes,
} from "@/lib/summoning/attributes";
import type { CalculatorConfig, LevelCurvePoint } from "@/lib/calculators/calculatorConfig";
import {
  DEFAULT_COMBAT_TUNING_VALUES,
  type ProtectionTuningValues,
} from "@/lib/config/combatTuningShared";

export type MonsterCalculatorArchetype = "BALANCED" | "GLASS_CANNON" | "TANK" | "CONTROLLER";

export type RadarAxes = {
  physicalThreat: number;
  mentalThreat: number;
  physicalSurvivability: number;
  mentalSurvivability: number;
  manipulation: number;
  synergy: number;
  mobility: number;
  presence: number;
};

export type TraitAxisBonuses = {
  physicalThreat: number;
  mentalThreat: number;
  physicalSurvivability: number;
  mentalSurvivability: number;
  manipulation: number;
  synergy: number;
  mobility: number;
  presence: number;
};

export type TraitAxisWeightDefinition = {
  band?: MonsterTraitBand | null;
  physicalThreatWeight?: number | null;
  mentalThreatWeight?: number | null;
  physicalSurvivabilityWeight?: number | null;
  mentalSurvivabilityWeight?: number | null;
  survivabilityWeight?: number | null;
  manipulationWeight?: number | null;
  synergyWeight?: number | null;
  mobilityWeight?: number | null;
  presenceWeight?: number | null;
};

export const TRAIT_AXIS_UNIT = 0.5;

export type WeaponAttackSource = {
  id: string;
  label: string;
  attackConfig: {
    melee?: {
      enabled?: boolean;
      targets?: number;
      physicalStrength?: number;
      mentalStrength?: number;
      damageTypes?: unknown;
    };
    ranged?: {
      enabled?: boolean;
      targets?: number;
      distance?: number;
      physicalStrength?: number;
      mentalStrength?: number;
      damageTypes?: unknown;
    };
    aoe?: {
      enabled?: boolean;
      count?: number;
      centerRange?: number;
      shape?: string;
      sphereRadiusFeet?: number;
      coneLengthFeet?: number;
      lineWidthFeet?: number;
      lineLengthFeet?: number;
      physicalStrength?: number;
      mentalStrength?: number;
      damageTypes?: unknown;
    };
  };
};

export type DefensiveProfileSourceKind = "natural" | "equipped";

export type DefensiveProfileSource = {
  sourceKind: DefensiveProfileSourceKind;
  sourceId?: string | null;
  sourceLabel: string;
  physicalProtection?: number | null;
  mentalProtection?: number | null;
};

export type MonsterOutcomeProfile = {
  threat: {
    sustainedPhysical: number;
    sustainedMental: number;
    sustainedTotal: number;
    spike: number;
  };
  utility: {
    seuPerRound: number;
    tsuPerRound: number;
  };
  sustainedPhysical: number;
  sustainedMental: number;
  sustainedTotal: number;
  spike: number;
  seuPerRound: number;
  tsuPerRound: number;
  netSuccessMultiplier: number;
  radarAxes: RadarAxes;
  debug?: Record<string, unknown>;
};

type MonsterOutcomeInput = Pick<
  MonsterUpsertInput,
  | "level"
  | "tier"
  | "legendary"
  | "attackDie"
  | "attackResistDie"
  | "attacks"
  | "guardDie"
  | "braveryResistDie"
  | "guardResistDie"
  | "fortitudeResistDie"
  | "intellectResistDie"
  | "limitBreakAttribute"
  | "limitBreakTier"
  | "limitBreak2Attribute"
  | "limitBreak2Tier"
  | "naturalAttack"
  | "naturalPhysicalProtection"
  | "naturalMentalProtection"
  | "powers"
  | "physicalResilienceMax"
  | "mentalPerseveranceMax"
  | "physicalProtection"
  | "mentalProtection"
  | "fortitudeDie"
  | "intellectDie"
  | "synergyDie"
  | "braveryDie"
  | "armorSkillValue"
  | "synergyResistDie"
>;

export type CanonicalPowerContribution = {
  axisVector?: Partial<RadarAxes> | null;
  basePowerValue?: number | null;
  powerCount?: number | null;
  debug?: Record<string, unknown> | null;
};

type TierBudgetKey = keyof CalculatorConfig["tierMultipliers"];

type AttackConfigLike = {
  melee?: {
    enabled?: boolean;
    targets?: number;
    physicalStrength?: number;
    mentalStrength?: number;
    damageTypes?: unknown;
  } | null;
  ranged?: {
    enabled?: boolean;
    targets?: number;
    physicalStrength?: number;
    mentalStrength?: number;
    damageTypes?: unknown;
  } | null;
  aoe?: {
    enabled?: boolean;
    count?: number;
    centerRange?: number;
    shape?: string;
    sphereRadiusFeet?: number;
    coneLengthFeet?: number;
    lineWidthFeet?: number;
    lineLengthFeet?: number;
    physicalStrength?: number;
    mentalStrength?: number;
    damageTypes?: unknown;
  } | null;
} | null;

type AtWillContribution = {
  physical: number;
  mental: number;
  total: number;
  hasRanged: boolean;
  hasAoe: boolean;
};

type AtWillProfileSourceKind = "natural" | "equipped";

type NormalizedAtWillAttackSegment = {
  attackKind: "melee" | "ranged" | "aoe";
  threatLane: Mode;
  rangeCategory: "MELEE" | "RANGED" | "AOE";
  diceCount: number;
  dieSides: number;
  successChance: number;
  authoredStrength: number;
  damageTypeCount: number;
  woundsPerSuccess: number;
  targetCount: number;
  targetMultiplier: number;
  aoeContributionInput: number;
};

type NormalizedAtWillAttackProfile = {
  sourceKind: AtWillProfileSourceKind;
  sourceId: string | null;
  sourceLabel: string;
  segments: NormalizedAtWillAttackSegment[];
  greaterSuccessAxisBonuses: RadarAxes;
  rangeAxisBonuses: RadarAxes;
};

type NormalizedDefensiveProfile = {
  sourceKind: DefensiveProfileSourceKind;
  sourceId: string | null;
  sourceLabel: string;
  physicalProtection: number;
  mentalProtection: number;
};

type DefensiveProfileContext = {
  dodgeDice: number;
  armorSkillDice: number;
  willpowerDice: number;
  totalPhysicalProtection: number;
  totalMentalProtection: number;
};

type DefensiveContribution = {
  axisVector: Pick<RadarAxes, "physicalSurvivability" | "mentalSurvivability">;
  sharedDodgeAxisVector: Pick<RadarAxes, "physicalSurvivability" | "mentalSurvivability">;
  profileBreakdown: Array<
    NormalizedDefensiveProfile & {
      physicalProtectionShare: number;
      mentalProtectionShare: number;
      axisVector: Pick<RadarAxes, "physicalSurvivability" | "mentalSurvivability">;
    }
  >;
  totals: {
    physicalBlockPerSuccess: number;
    mentalBlockPerSuccess: number;
    physicalDodgeRawBonus: number;
    mentalDodgeRawBonus: number;
    physicalDefenceRawBonus: number;
    mentalDefenceRawBonus: number;
  };
};

type AtWillSummary = {
  bestPhysical: number;
  bestMental: number;
  bestTotal: number;
  hasRanged: boolean;
  hasAoe: boolean;
};

type Mode = "PHYSICAL" | "MENTAL";

type DefensiveProfileProtectionTuning = Pick<
  ProtectionTuningValues,
  | "protectionK"
  | "protectionS"
  | "armorSkillGuardWeight"
  | "armorSkillFortitudeWeight"
  | "armorSkillBaselineOffset"
  | "armorSkillScale"
  | "willpowerSynergyWeight"
  | "willpowerBraveryWeight"
  | "willpowerBaselineOffset"
  | "willpowerScale"
  | "dodgeIntellectWeight"
  | "dodgeGuardWeight"
  | "dodgeAttributeDivisor"
  | "dodgeProtectionPenaltyWeight"
  | "defenceStringProtectionOutputScale"
  | "defenceStringProtectionOutputMaxShare"
  | "dodgeBaselineScale"
  | "dodgeBaselineMaxShare"
  | "dodgeParityScale"
  | "dodgeParityMaxShare"
  | "dodgeAboveExpectedScale"
  | "dodgeAboveExpectedMaxShare"
  | "dodgeExtremeAboveExpectedScale"
  | "dodgeExtremeAboveExpectedMaxShare"
  | "dodgeTotalMaxShare"
>;

const EMPTY_TRAIT_AXIS_BONUSES: TraitAxisBonuses = {
  physicalThreat: 0,
  mentalThreat: 0,
  physicalSurvivability: 0,
  mentalSurvivability: 0,
  manipulation: 0,
  synergy: 0,
  mobility: 0,
  presence: 0,
};

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function clampRadarScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 10) return 10;
  return value;
}

function clampTraitAxisWeight(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(3, Math.trunc(parsed)));
}

function getExpectedPoolValue(
  at1: number,
  perLevel: number,
  level: number,
  tierMultiplier: number,
): number {
  const normalizedLevel = Math.max(1, Math.trunc(level || 1));
  return Math.max(1, (at1 + (normalizedLevel - 1) * perLevel) * Math.max(0.001, tierMultiplier));
}

function getSignedExpectedPoolDeltaShare(
  ratio: number,
  cfg: CalculatorConfig["healthPoolTuning"],
): number {
  const safeRatio = Math.max(0, Number.isFinite(ratio) ? ratio : 0);
  const delta = safeRatio - 1;

  if (delta < 0) {
    return (
      -cfg.belowExpectedMaxPenaltyShare *
      (1 - Math.exp(-Math.abs(delta) / Math.max(0.001, cfg.belowExpectedScale)))
    );
  }

  if (delta > 0) {
    return (
      cfg.aboveExpectedMaxBonusShare *
      (1 - Math.exp(-delta / Math.max(0.001, cfg.aboveExpectedScale)))
    );
  }

  return 0;
}

function getFinalPoolShare(atExpectedShare: number, signedDeltaShare: number): number {
  const base = clampNonNegative(atExpectedShare);
  const delta = Number.isFinite(signedDeltaShare) ? signedDeltaShare : 0;
  return Math.max(0, Math.min(1, base + delta));
}

function getPoolLaneRawBonus(
  ratio: number,
  curvePoint: LevelCurvePoint,
  tierMultiplier: number,
  cfg: CalculatorConfig["healthPoolTuning"],
): { signedDeltaShare: number; finalShare: number; rawBonus: number } {
  const signedDeltaShare = getSignedExpectedPoolDeltaShare(ratio, cfg);
  const finalShare = getFinalPoolShare(cfg.poolAtExpectedShare, signedDeltaShare);
  return {
    signedDeltaShare,
    finalShare,
    rawBonus: getTierAdjustedAxisBudgetTarget(curvePoint, tierMultiplier) * finalShare,
  };
}

function readPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const row of value) {
    if (typeof row === "string") {
      const trimmed = row.trim();
      if (trimmed.length > 0) out.push(trimmed);
      continue;
    }
    if (row && typeof row === "object") {
      const name = (row as { name?: unknown }).name;
      if (typeof name === "string" && name.trim().length > 0) out.push(name.trim());
    }
  }
  return out;
}

function readDamageModes(value: unknown): Set<Mode> {
  const out = new Set<Mode>();
  if (!Array.isArray(value)) return out;
  for (const row of value) {
    if (row && typeof row === "object") {
      const mode = String(
        (row as { mode?: unknown; attackMode?: unknown }).mode ??
          (row as { mode?: unknown; attackMode?: unknown }).attackMode ??
          "",
      ).toUpperCase();
      if (mode === "MENTAL") out.add("MENTAL");
      if (mode === "PHYSICAL") out.add("PHYSICAL");
    }
  }
  return out;
}

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function createEmptyAxisBonuses(): RadarAxes {
  return {
    physicalThreat: 0,
    mentalThreat: 0,
    physicalSurvivability: 0,
    mentalSurvivability: 0,
    manipulation: 0,
    synergy: 0,
    mobility: 0,
    presence: 0,
  };
}

export function createEmptyTraitAxisBonuses(): TraitAxisBonuses {
  return { ...EMPTY_TRAIT_AXIS_BONUSES };
}

export function getTraitLevelBand(level: number): 0 | 1 | 2 | 3 {
  const normalizedLevel = Math.max(1, Math.min(20, Math.trunc(level || 1)));
  if (normalizedLevel <= 5) return 0;
  if (normalizedLevel <= 10) return 1;
  if (normalizedLevel <= 15) return 2;
  return 3;
}

export function getTraitBandPressureMultiplier(
  band: MonsterTraitBand | null | undefined,
  monsterLevel: number,
): number {
  const levelBand = getTraitLevelBand(monsterLevel);
  const multipliers: Record<MonsterTraitBand, [number, number, number, number]> = {
    MINOR: [1.0, 0.6, 0.3, 0.1],
    STANDARD: [1.5, 1.0, 0.6, 0.3],
    MAJOR: [2.0, 1.5, 1.0, 0.6],
    BOSS: [3.0, 2.0, 1.4, 1.0],
  };
  const resolvedBand = band ?? "STANDARD";
  return multipliers[resolvedBand][levelBand];
}

export function computeTraitAxisBonuses(
  traits: TraitAxisWeightDefinition[],
  monsterLevel: number,
): TraitAxisBonuses {
  const bonuses = createEmptyTraitAxisBonuses();

  for (const trait of traits) {
    const pressureMultiplier = getTraitBandPressureMultiplier(trait.band, monsterLevel);
    const legacySharedSurvivability =
      clampTraitAxisWeight(trait.survivabilityWeight) * TRAIT_AXIS_UNIT * pressureMultiplier * 0.5;
    bonuses.physicalThreat +=
      clampTraitAxisWeight(trait.physicalThreatWeight) * TRAIT_AXIS_UNIT * pressureMultiplier;
    bonuses.mentalThreat +=
      clampTraitAxisWeight(trait.mentalThreatWeight) * TRAIT_AXIS_UNIT * pressureMultiplier;
    bonuses.physicalSurvivability +=
      clampTraitAxisWeight(trait.physicalSurvivabilityWeight) * TRAIT_AXIS_UNIT * pressureMultiplier +
      legacySharedSurvivability;
    bonuses.mentalSurvivability +=
      clampTraitAxisWeight(trait.mentalSurvivabilityWeight) * TRAIT_AXIS_UNIT * pressureMultiplier +
      legacySharedSurvivability;
    bonuses.manipulation +=
      clampTraitAxisWeight(trait.manipulationWeight) * TRAIT_AXIS_UNIT * pressureMultiplier;
    bonuses.synergy +=
      clampTraitAxisWeight(trait.synergyWeight) * TRAIT_AXIS_UNIT * pressureMultiplier;
    bonuses.mobility +=
      clampTraitAxisWeight(trait.mobilityWeight) * TRAIT_AXIS_UNIT * pressureMultiplier;
    bonuses.presence +=
      clampTraitAxisWeight(trait.presenceWeight) * TRAIT_AXIS_UNIT * pressureMultiplier;
  }

  return bonuses;
}

export function getEquipmentModifierBudgetShare(modifierValue: number): number {
  const points = Math.max(0, Math.trunc(modifierValue || 0));
  if (points <= 0) return 0;
  if (points === 1) return 0.2;
  if (points === 2) return 0.35;
  if (points === 3) return 0.45;
  return 0.45 + (points - 3) * 0.05;
}

function normalizeTraitAxisBonuses(
  bonuses: Partial<TraitAxisBonuses> | null | undefined,
): TraitAxisBonuses {
  if (!bonuses) return createEmptyTraitAxisBonuses();
  return {
    physicalThreat: clampNonNegative(bonuses.physicalThreat ?? 0),
    mentalThreat: clampNonNegative(bonuses.mentalThreat ?? 0),
    physicalSurvivability: clampNonNegative(bonuses.physicalSurvivability ?? 0),
    mentalSurvivability: clampNonNegative(bonuses.mentalSurvivability ?? 0),
    manipulation: clampNonNegative(bonuses.manipulation ?? 0),
    synergy: clampNonNegative(bonuses.synergy ?? 0),
    mobility: clampNonNegative(bonuses.mobility ?? 0),
    presence: clampNonNegative(bonuses.presence ?? 0),
  };
}

function normalizeRawAxisBonuses(
  bonuses: Partial<RadarAxes> | null | undefined,
): RadarAxes {
  if (!bonuses) return createEmptyAxisBonuses();
  return {
    physicalThreat: clampNonNegative(bonuses.physicalThreat ?? 0),
    mentalThreat: clampNonNegative(bonuses.mentalThreat ?? 0),
    physicalSurvivability: clampNonNegative(bonuses.physicalSurvivability ?? 0),
    mentalSurvivability: clampNonNegative(bonuses.mentalSurvivability ?? 0),
    manipulation: clampNonNegative(bonuses.manipulation ?? 0),
    synergy: clampNonNegative(bonuses.synergy ?? 0),
    mobility: clampNonNegative(bonuses.mobility ?? 0),
    presence: clampNonNegative(bonuses.presence ?? 0),
  };
}

function scaleRawAxisBonuses(bonuses: RadarAxes, weight: number): RadarAxes {
  const safeWeight = clampNonNegative(weight);
  return {
    physicalThreat: bonuses.physicalThreat * safeWeight,
    mentalThreat: bonuses.mentalThreat * safeWeight,
    physicalSurvivability: bonuses.physicalSurvivability * safeWeight,
    mentalSurvivability: bonuses.mentalSurvivability * safeWeight,
    manipulation: bonuses.manipulation * safeWeight,
    synergy: bonuses.synergy * safeWeight,
    mobility: bonuses.mobility * safeWeight,
    presence: bonuses.presence * safeWeight,
  };
}

function normalizeByLevelCurve(
  value: number,
  curvePoint: LevelCurvePoint,
  tierMultiplier: number,
): number {
  const tierAdjustedMax = getTierAdjustedAxisBudgetTarget(curvePoint, tierMultiplier);
  const span = tierAdjustedMax - curvePoint.min;
  if (!Number.isFinite(span) || span <= 0) {
    return value >= tierAdjustedMax ? 10 : 0;
  }
  const normalized = ((value - curvePoint.min) / span) * 10;
  return clampRadarScore(normalized);
}

function getTierAdjustedAxisBudgetTarget(
  curvePoint: LevelCurvePoint,
  tierMultiplier: number,
): number {
  return curvePoint.max * Math.max(0, tierMultiplier);
}

function getResistBudgetShare(resistDice: unknown): number {
  const dice = Math.max(0, Math.trunc(safeNum(resistDice)));
  if (dice <= 0) return 0;

  let share = 0;
  if (dice >= 1) share += 0.35;
  if (dice >= 2) share += 0.25;
  if (dice >= 3) share += 0.2;
  if (dice >= 4) share += 0.15;
  if (dice >= 5) share += (dice - 4) * 0.1;
  return share;
}

function getResistLevelPressureMultiplier(level: number): number {
  const normalizedLevel = Math.max(1, Math.min(20, Math.trunc(level || 1)));
  if (normalizedLevel <= 5) return 1.6;
  if (normalizedLevel <= 10) return 1.2;
  if (normalizedLevel <= 15) return 0.9;
  return 0.7;
}

function getResistTierPressureMultiplier(tierKey: TierBudgetKey): number {
  if (tierKey === "MINION") return 1.25;
  if (tierKey === "SOLDIER") return 1.0;
  if (tierKey === "ELITE") return 0.85;
  return 0.7;
}

function getResistPressureMultiplier(level: number, tierKey: TierBudgetKey): number {
  return getResistLevelPressureMultiplier(level) * getResistTierPressureMultiplier(tierKey);
}

function getEquipmentModifierLevelPressureMultiplier(level: number): number {
  const normalizedLevel = Math.max(1, Math.min(20, Math.trunc(level || 1)));
  if (normalizedLevel <= 5) return 1.5;
  if (normalizedLevel <= 10) return 1.2;
  if (normalizedLevel <= 15) return 1.0;
  return 0.85;
}

function getEquipmentModifierTierPressureMultiplier(tierKey: TierBudgetKey): number {
  if (tierKey === "MINION") return 1.25;
  if (tierKey === "SOLDIER") return 1.0;
  if (tierKey === "ELITE") return 0.9;
  return 0.8;
}

export function getEquipmentModifierPressureMultiplier(
  level: number,
  monster: Pick<MonsterUpsertInput, "tier" | "legendary">,
): number {
  const tierKey = toTierBudgetKey(monster);
  return (
    getEquipmentModifierLevelPressureMultiplier(level) *
    getEquipmentModifierTierPressureMultiplier(tierKey)
  );
}

function getRawAxisContributionFromBudgetShare(
  budgetShare: number,
  curvePoint: LevelCurvePoint,
  tierMultiplier: number,
  resistPressureMultiplier = 1,
): number {
  return (
    clampNonNegative(budgetShare) *
    clampNonNegative(resistPressureMultiplier) *
    getTierAdjustedAxisBudgetTarget(curvePoint, tierMultiplier)
  );
}

function getLimitBreakTierMagnitude(tier: LimitBreakTier | null | undefined): number {
  if (tier === "PUSH") return 1;
  if (tier === "BREAK") return 2;
  if (tier === "TRANSCEND") return 3;
  return 0;
}

function getLimitBreakPrimaryAxis(attribute: CoreAttribute | null | undefined): keyof RadarAxes | null {
  if (attribute === "ATTACK") return "physicalThreat";
  if (attribute === "GUARD" || attribute === "FORTITUDE") return "physicalSurvivability";
  if (attribute === "INTELLECT") return "mentalThreat";
  if (attribute === "SYNERGY") return "synergy";
  if (attribute === "BRAVERY") return "manipulation";
  return null;
}

function getLimitBreakLevelPressureMultiplier(level: number): number {
  const normalizedLevel = Math.max(1, Math.min(20, Math.trunc(level || 1)));
  if (normalizedLevel <= 5) return 1.8;
  if (normalizedLevel <= 10) return 1.35;
  if (normalizedLevel <= 15) return 1.0;
  return 0.8;
}

function getLimitBreakBaseTierPressureMultiplier(baseTier: MonsterTier | null | undefined): number {
  if (baseTier === "MINION") return 3.0;
  if (baseTier === "SOLDIER") return 2.0;
  if (baseTier === "ELITE") return 1.35;
  return 1.0;
}

function getLimitBreakPressureMultiplier(level: number, baseTier: MonsterTier | null | undefined): number {
  return (
    getLimitBreakLevelPressureMultiplier(level) *
    getLimitBreakBaseTierPressureMultiplier(baseTier)
  );
}

function computeSingleCustomLimitBreakAxisBonus(
  limitBreak: {
    tier: LimitBreakTier | null | undefined;
    attribute: CoreAttribute | null | undefined;
  },
  axisBudgetTargets: RadarAxes,
  pressureMultiplier: number,
): RadarAxes {
  const bonuses = createEmptyAxisBonuses();
  const tierMagnitude = getLimitBreakTierMagnitude(limitBreak.tier);
  const primaryAxis = getLimitBreakPrimaryAxis(limitBreak.attribute);
  if (!(tierMagnitude > 0) || !primaryAxis) return bonuses;

  const primaryShare = tierMagnitude * 0.25;
  const presenceShare = tierMagnitude * 0.12;

  bonuses[primaryAxis] +=
    axisBudgetTargets[primaryAxis] * primaryShare * clampNonNegative(pressureMultiplier);
  bonuses.presence +=
    axisBudgetTargets.presence * presenceShare * clampNonNegative(pressureMultiplier);

  return bonuses;
}

function computeCustomLimitBreakAxisBonuses(
  limitBreaks: Array<{
    tier: LimitBreakTier | null | undefined;
    attribute: CoreAttribute | null | undefined;
  }>,
  isLegendary: boolean,
  level: number,
  baseTier: MonsterTier | null | undefined,
  axisBudgetTargets: RadarAxes,
): RadarAxes {
  const bonuses = createEmptyAxisBonuses();
  if (!isLegendary) return bonuses;

  const pressureMultiplier = getLimitBreakPressureMultiplier(level, baseTier);

  for (const limitBreak of limitBreaks) {
    const slotBonus = computeSingleCustomLimitBreakAxisBonus(
      limitBreak,
      axisBudgetTargets,
      pressureMultiplier,
    );
    bonuses.physicalThreat += slotBonus.physicalThreat;
    bonuses.mentalThreat += slotBonus.mentalThreat;
    bonuses.physicalSurvivability += slotBonus.physicalSurvivability;
    bonuses.mentalSurvivability += slotBonus.mentalSurvivability;
    bonuses.manipulation += slotBonus.manipulation;
    bonuses.synergy += slotBonus.synergy;
    bonuses.mobility += slotBonus.mobility;
    bonuses.presence += slotBonus.presence;
  }

  return bonuses;
}

function toTierBudgetKey(monster: Pick<MonsterOutcomeInput, "tier" | "legendary">): TierBudgetKey {
  if (monster.legendary) return "LEGENDARY";
  const tier = String(monster.tier ?? "MINION").toUpperCase() as MonsterTier | "LEGENDARY";
  if (tier === "MINION" || tier === "SOLDIER" || tier === "ELITE" || tier === "BOSS") {
    return tier;
  }
  return "ELITE";
}

function getCurvePointForLevel(curve: LevelCurvePoint[], level: number): LevelCurvePoint {
  if (curve.length === 0) return { level: 1, min: 0, max: 1 };
  const sorted = [...curve].sort((a, b) => a.level - b.level);
  const minLevel = sorted[0].level;
  const maxLevel = sorted[sorted.length - 1].level;
  const normalizedLevel = Math.max(minLevel, Math.min(maxLevel, Math.trunc(level || minLevel)));
  const exact = sorted.find((point) => point.level === normalizedLevel);
  if (exact) return exact;
  if (normalizedLevel < minLevel) return sorted[0];
  return sorted[sorted.length - 1];
}

function readMultiplier(value: unknown, fallback = 1): number {
  const parsed = readPositiveNumber(value);
  if (parsed === null) return fallback;
  return Math.max(0, parsed);
}

function getExpectedNaturalAoeTargetsFromGeometry(
  aoeConfig: NonNullable<AttackConfigLike>["aoe"],
): number {
  if (!aoeConfig?.enabled) return 1;

  const shape = String((aoeConfig as { shape?: unknown }).shape ?? "SPHERE").toUpperCase();
  if (shape === "SPHERE") {
    const sphereTargets: Record<number, number> = { 10: 3, 20: 6, 30: 9 };
    return sphereTargets[Math.max(0, Math.trunc(safeNum(aoeConfig.sphereRadiusFeet ?? 0)))] ?? 1;
  }
  if (shape === "CONE") {
    const coneTargets: Record<number, number> = { 15: 3, 30: 8, 60: 14 };
    return coneTargets[Math.max(0, Math.trunc(safeNum(aoeConfig.coneLengthFeet ?? 0)))] ?? 1;
  }

  const lineTargetTable: Record<number, Record<number, number>> = {
    5: { 30: 3, 60: 6, 90: 9, 120: 12 },
    10: { 30: 4, 60: 8, 90: 12, 120: 16 },
    15: { 30: 5, 60: 10, 90: 15, 120: 20 },
    20: { 30: 6, 60: 12, 90: 18, 120: 24 },
  };
  const width = Math.max(0, Math.trunc(safeNum(aoeConfig.lineWidthFeet ?? 0)));
  const length = Math.max(0, Math.trunc(safeNum(aoeConfig.lineLengthFeet ?? 0)));
  return lineTargetTable[width]?.[length] ?? 1;
}

function getEffectiveNaturalAoeTargetCount(
  aoeConfig: NonNullable<AttackConfigLike>["aoe"],
): number {
  const selectedCount = readMultiplier(aoeConfig?.count, 1);
  const expectedTargetsFromGeometry = getExpectedNaturalAoeTargetsFromGeometry(aoeConfig);
  return Math.max(selectedCount, expectedTargetsFromGeometry);
}

function withEffectiveNaturalAoeTargetCount(attackConfig: AttackConfigLike): AttackConfigLike {
  if (!attackConfig?.aoe?.enabled) return attackConfig;
  return {
    ...attackConfig,
    aoe: {
      ...attackConfig.aoe,
      count: getEffectiveNaturalAoeTargetCount(attackConfig.aoe),
    },
  };
}

function getLevelWoundBonus(level?: number, divisor = 3): number {
  const parsed = typeof level === "number" ? level : Number(level ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  const resolvedDivisor = Number.isFinite(divisor) && divisor > 0 ? divisor : 3;
  return Math.floor(parsed / resolvedDivisor);
}

function pushNormalizedAtWillSegments(
  segments: NormalizedAtWillAttackSegment[],
  config:
    | NonNullable<AttackConfigLike>["melee"]
    | NonNullable<AttackConfigLike>["ranged"]
    | NonNullable<AttackConfigLike>["aoe"],
  attackKind: NormalizedAtWillAttackSegment["attackKind"],
  rangeCategory: NormalizedAtWillAttackSegment["rangeCategory"],
  dieSides: number,
  successChance: number,
  targetCount: number,
  targetMultiplier: number,
  levelWoundBonus: number,
) {
  if (!config?.enabled) return;

  let physicalValue = clampNonNegative(Number(config.physicalStrength ?? 0));
  let mentalValue = clampNonNegative(Number(config.mentalStrength ?? 0));
  const damageTypeCount = Math.max(1, readStringArray(config.damageTypes).length);
  const modes = readDamageModes(config.damageTypes);

  if (modes.has("MENTAL") && !modes.has("PHYSICAL") && mentalValue === 0 && physicalValue > 0) {
    mentalValue = physicalValue;
    physicalValue = 0;
  }
  if (modes.has("PHYSICAL") && !modes.has("MENTAL") && physicalValue === 0 && mentalValue > 0) {
    physicalValue = mentalValue;
    mentalValue = 0;
  }

  const pushSegment = (threatLane: Mode, authoredStrength: number) => {
    if (!(authoredStrength > 0)) return;
    segments.push({
      attackKind,
      threatLane,
      rangeCategory,
      diceCount: 1,
      dieSides,
      successChance,
      authoredStrength,
      damageTypeCount,
      woundsPerSuccess: authoredStrength + levelWoundBonus,
      targetCount,
      targetMultiplier,
      aoeContributionInput: attackKind === "aoe" ? targetCount : 0,
    });
  };

  pushSegment("PHYSICAL", physicalValue);
  pushSegment("MENTAL", mentalValue);
}

function normalizeAtWillAttackProfile(params: {
  sourceKind: AtWillProfileSourceKind;
  sourceId?: string | null;
  sourceLabel: string;
  attackConfig: AttackConfigLike;
  dieSides: number;
  successChance: number;
  aoeMultiplier: number;
  level: number;
  levelWoundBonusDivisor?: number;
}): NormalizedAtWillAttackProfile {
  const segments: NormalizedAtWillAttackSegment[] = [];
  const levelWoundBonus = getLevelWoundBonus(params.level, params.levelWoundBonusDivisor ?? 3);
  const attackConfig = params.attackConfig;

  if (attackConfig?.melee?.enabled) {
    const targets = readMultiplier(attackConfig.melee.targets, 1);
    pushNormalizedAtWillSegments(
      segments,
      attackConfig.melee,
      "melee",
      "MELEE",
      params.dieSides,
      params.successChance,
      targets,
      targets,
      levelWoundBonus,
    );
  }

  if (attackConfig?.ranged?.enabled) {
    const targets = readMultiplier(attackConfig.ranged.targets, 1);
    pushNormalizedAtWillSegments(
      segments,
      attackConfig.ranged,
      "ranged",
      "RANGED",
      params.dieSides,
      params.successChance,
      targets,
      targets,
      levelWoundBonus,
    );
  }

  if (attackConfig?.aoe?.enabled) {
    const count = readMultiplier(attackConfig.aoe.count, 1);
    pushNormalizedAtWillSegments(
      segments,
      attackConfig.aoe,
      "aoe",
      "AOE",
      params.dieSides,
      params.successChance,
      count,
      params.aoeMultiplier * count,
      levelWoundBonus,
    );
  }

  return {
    sourceKind: params.sourceKind,
    sourceId: params.sourceId ?? null,
    sourceLabel: params.sourceLabel,
    segments,
    greaterSuccessAxisBonuses: createEmptyAxisBonuses(),
    rangeAxisBonuses: createEmptyAxisBonuses(),
  };
}

function computeAtWillContributionFromProfile(
  profile: NormalizedAtWillAttackProfile,
  netSuccessMultiplier: number,
): AtWillContribution {
  let physical = 0;
  let mental = 0;
  let hasRanged = false;
  let hasAoe = false;

  for (const segment of profile.segments) {
    const scalar =
      segment.successChance * netSuccessMultiplier * Math.max(0, segment.targetMultiplier);
    const contribution = segment.woundsPerSuccess * scalar * segment.damageTypeCount;
    if (segment.threatLane === "PHYSICAL") physical += contribution;
    if (segment.threatLane === "MENTAL") mental += contribution;
    hasRanged = hasRanged || segment.attackKind === "ranged";
    hasAoe = hasAoe || segment.attackKind === "aoe";
  }

  return {
    physical,
    mental,
    total: physical + mental,
    hasRanged,
    hasAoe,
  };
}

function getExpectedIncomingAttackDiceForDodge(level: number, tier: MonsterTier): number {
  const normalizedLevel = Math.max(1, Math.trunc(level || 1));
  const levelOffset = Math.floor((normalizedLevel - 1) / 5);
  const tierOffset = tier === "BOSS" ? 1 : 0;
  return Math.max(1, 1 + levelOffset + tierOffset);
}

function getSmoothDodgeShare(value: number, scale: number, maxShare: number): number {
  if (!(value > 0) || !(scale > 0) || !(maxShare > 0)) return 0;
  return maxShare * (1 - Math.exp(-value / scale));
}

function getDodgeParityProgress(currentDodgeDice: number, expectedIncomingAttackDice: number): number {
  if (!(currentDodgeDice > 0) || !(expectedIncomingAttackDice > 0)) return 0;
  return Math.min(1, currentDodgeDice / expectedIncomingAttackDice);
}

function getSmoothDefenceShare(value: number, scale: number, maxShare: number): number {
  if (!(value > 0) || !(scale > 0) || !(maxShare > 0)) return 0;
  return maxShare * (1 - Math.exp(-value / scale));
}

function normalizeDefensiveProfile(source: DefensiveProfileSource): NormalizedDefensiveProfile | null {
  const physicalProtection = clampNonNegative(Number(source.physicalProtection ?? 0));
  const mentalProtection = clampNonNegative(Number(source.mentalProtection ?? 0));
  if (!(physicalProtection > 0) && !(mentalProtection > 0)) return null;
  return {
    sourceKind: source.sourceKind,
    sourceId: source.sourceId ?? null,
    sourceLabel: String(source.sourceLabel ?? "").trim() || "Defensive Source",
    physicalProtection,
    mentalProtection,
  };
}

function buildDefaultDefensiveProfiles(
  monster: Pick<
    MonsterOutcomeInput,
    "physicalProtection" | "mentalProtection" | "naturalPhysicalProtection" | "naturalMentalProtection"
  >,
): NormalizedDefensiveProfile[] {
  const profiles: NormalizedDefensiveProfile[] = [];
  const naturalPhysicalProtection = clampNonNegative(Number(monster.naturalPhysicalProtection ?? 0));
  const naturalMentalProtection = clampNonNegative(Number(monster.naturalMentalProtection ?? 0));
  const equippedPhysicalProtection = Math.max(
    0,
    clampNonNegative(monster.physicalProtection ?? 0) - naturalPhysicalProtection,
  );
  const equippedMentalProtection = Math.max(
    0,
    clampNonNegative(monster.mentalProtection ?? 0) - naturalMentalProtection,
  );

  if (naturalPhysicalProtection > 0 || naturalMentalProtection > 0) {
    profiles.push({
      sourceKind: "natural",
      sourceId: null,
      sourceLabel: "Natural Protection",
      physicalProtection: naturalPhysicalProtection,
      mentalProtection: naturalMentalProtection,
    });
  }
  if (equippedPhysicalProtection > 0 || equippedMentalProtection > 0) {
    profiles.push({
      sourceKind: "equipped",
      sourceId: null,
      sourceLabel: "Equipped Protection",
      physicalProtection: equippedPhysicalProtection,
      mentalProtection: equippedMentalProtection,
    });
  }
  return profiles;
}

function resolveDefensiveProfileContext(
  monster: MonsterOutcomeInput,
  tuning: DefensiveProfileProtectionTuning,
  provided?: Partial<DefensiveProfileContext>,
): DefensiveProfileContext {
  const totalPhysicalProtection = clampNonNegative(
    provided?.totalPhysicalProtection ?? monster.physicalProtection ?? 0,
  );
  const totalMentalProtection = clampNonNegative(
    provided?.totalMentalProtection ?? monster.mentalProtection ?? 0,
  );
  const armorSkillDice = Math.max(
    1,
    Math.trunc(
      provided?.armorSkillDice ??
        monster.armorSkillValue ??
        getArmorSkillDiceCountFromAttributes(monster.guardDie, monster.fortitudeDie, tuning),
    ) || 1,
  );
  const willpowerDice = Math.max(
    0,
    Math.trunc(
      provided?.willpowerDice ??
        getWillpowerDiceCountFromAttributes(monster.synergyDie, monster.braveryDie, tuning),
    ) || 0,
  );
  const dodgeDice = Math.max(
    0,
    Math.trunc(
      provided?.dodgeDice ??
        (Math.ceil(
          getDodgeValue(
            monster.guardDie,
            monster.intellectDie,
            monster.level,
            totalPhysicalProtection,
            tuning,
          ) / 6,
        )),
    ) || 0,
  );

  return {
    dodgeDice,
    armorSkillDice,
    willpowerDice,
    totalPhysicalProtection,
    totalMentalProtection,
  };
}

function computeDefensiveContributionFromProfiles(
  profiles: NormalizedDefensiveProfile[],
  context: DefensiveProfileContext,
  tuning: DefensiveProfileProtectionTuning,
  level: number,
  tier: MonsterTier,
  axisBudgetTargets: Pick<RadarAxes, "physicalSurvivability" | "mentalSurvivability">,
): DefensiveContribution {
  if (profiles.length === 0) {
    return {
      axisVector: { physicalSurvivability: 0, mentalSurvivability: 0 },
      sharedDodgeAxisVector: { physicalSurvivability: 0, mentalSurvivability: 0 },
      profileBreakdown: [],
      totals: {
        physicalBlockPerSuccess: 0,
        mentalBlockPerSuccess: 0,
        physicalDodgeRawBonus: 0,
        mentalDodgeRawBonus: 0,
        physicalDefenceRawBonus: 0,
        mentalDefenceRawBonus: 0,
      },
    };
  }

  const expectedIncomingAttackDice = getExpectedIncomingAttackDiceForDodge(level, tier);
  const baselineDodgeShare = getSmoothDodgeShare(
    context.dodgeDice,
    tuning.dodgeBaselineScale,
    tuning.dodgeBaselineMaxShare,
  );
  const parityDodgeShare = getSmoothDodgeShare(
    getDodgeParityProgress(context.dodgeDice, expectedIncomingAttackDice),
    tuning.dodgeParityScale,
    tuning.dodgeParityMaxShare,
  );
  const dodgeAboveExpectedDice = Math.max(0, context.dodgeDice - expectedIncomingAttackDice);
  const aboveExpectedDodgeShare = getSmoothDodgeShare(
    Math.min(1, dodgeAboveExpectedDice),
    tuning.dodgeAboveExpectedScale,
    tuning.dodgeAboveExpectedMaxShare,
  );
  const extremeAboveExpectedDice = Math.max(0, dodgeAboveExpectedDice - 1);
  const extremeAboveExpectedDodgeShare = getSmoothDodgeShare(
    extremeAboveExpectedDice,
    tuning.dodgeExtremeAboveExpectedScale,
    tuning.dodgeExtremeAboveExpectedMaxShare,
  );
  const totalDodgeShare = Math.min(
    tuning.dodgeTotalMaxShare,
    baselineDodgeShare +
      parityDodgeShare +
      aboveExpectedDodgeShare +
      extremeAboveExpectedDodgeShare,
  );

  const physicalBlockPerSuccess =
    context.totalPhysicalProtection > 0
      ? Math.ceil(
          (context.totalPhysicalProtection / tuning.protectionK) *
            (1 + Math.max(1, context.armorSkillDice) / tuning.protectionS),
        )
      : 0;
  const mentalBlockPerSuccess =
    context.totalMentalProtection > 0
      ? Math.ceil(
          (context.totalMentalProtection / tuning.protectionK) *
            (1 + Math.max(1, context.willpowerDice) / tuning.protectionS),
        )
      : 0;
  const physicalDefenceShare = getSmoothDefenceShare(
    context.armorSkillDice * physicalBlockPerSuccess,
    tuning.defenceStringProtectionOutputScale,
    tuning.defenceStringProtectionOutputMaxShare,
  );
  const mentalDefenceShare = getSmoothDefenceShare(
    context.willpowerDice * mentalBlockPerSuccess,
    tuning.defenceStringProtectionOutputScale,
    tuning.defenceStringProtectionOutputMaxShare,
  );

  const physicalDodgeRawBonus =
    axisBudgetTargets.physicalSurvivability * totalDodgeShare;
  const mentalDodgeRawBonus = 0;
  const physicalDefenceRawBonus =
    axisBudgetTargets.physicalSurvivability * physicalDefenceShare;
  const mentalDefenceRawBonus = axisBudgetTargets.mentalSurvivability * mentalDefenceShare;
  const totalProfilePhysicalProtection = profiles.reduce(
    (sum, profile) => sum + profile.physicalProtection,
    0,
  );
  const totalProfileMentalProtection = profiles.reduce(
    (sum, profile) => sum + profile.mentalProtection,
    0,
  );
  const profileBreakdown = profiles.map((profile) => {
    const physicalProtectionShare =
      totalProfilePhysicalProtection > 0
        ? profile.physicalProtection / totalProfilePhysicalProtection
        : 0;
    const mentalProtectionShare =
      totalProfileMentalProtection > 0
        ? profile.mentalProtection / totalProfileMentalProtection
        : 0;
    return {
      ...profile,
      physicalProtectionShare,
      mentalProtectionShare,
      axisVector: {
        physicalSurvivability: physicalDefenceRawBonus * physicalProtectionShare,
        mentalSurvivability: mentalDefenceRawBonus * mentalProtectionShare,
      },
    };
  });

  return {
    axisVector: {
      physicalSurvivability: profileBreakdown.reduce(
        (sum, profile) => sum + profile.axisVector.physicalSurvivability,
        0,
      ),
      mentalSurvivability: profileBreakdown.reduce(
        (sum, profile) => sum + profile.axisVector.mentalSurvivability,
        0,
      ),
    },
    sharedDodgeAxisVector: {
      physicalSurvivability: physicalDodgeRawBonus,
      mentalSurvivability: mentalDodgeRawBonus,
    },
    profileBreakdown,
    totals: {
      physicalBlockPerSuccess,
      mentalBlockPerSuccess,
      physicalDodgeRawBonus,
      mentalDodgeRawBonus,
      physicalDefenceRawBonus,
      mentalDefenceRawBonus,
    },
  };
}

function summarizeAtWillCandidates(candidates: AtWillContribution[]): AtWillSummary {
  const summary: AtWillSummary = {
    bestPhysical: 0,
    bestMental: 0,
    bestTotal: 0,
    hasRanged: false,
    hasAoe: false,
  };

  for (const candidate of candidates) {
    summary.bestPhysical = Math.max(summary.bestPhysical, candidate.physical);
    summary.bestMental = Math.max(summary.bestMental, candidate.mental);
    summary.bestTotal = Math.max(summary.bestTotal, candidate.total);
    summary.hasRanged = summary.hasRanged || candidate.hasRanged;
    summary.hasAoe = summary.hasAoe || candidate.hasAoe;
  }
  return summary;
}

export function dieSidesFromDieString(die: string): number {
  const raw = String(die ?? "").trim().toUpperCase();
  if (raw === "D4") return 4;
  if (raw === "D6") return 6;
  if (raw === "D8") return 8;
  if (raw === "D10") return 10;
  if (raw === "D12") return 12;
  return 6;
}

export function successChanceFromDieSides(sides: number): number {
  if (!Number.isFinite(sides) || sides <= 0) return 0;
  const raw = (sides - 3) / sides;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

export function computeMonsterOutcomes(
  monster: MonsterOutcomeInput,
  config: CalculatorConfig,
  opts?: {
    equippedWeaponSources?: WeaponAttackSource[];
    defensiveProfileSources?: DefensiveProfileSource[];
    defensiveProfileContext?: Partial<DefensiveProfileContext>;
    protectionTuning?: Partial<DefensiveProfileProtectionTuning>;
    equipmentModifierAxisBonuses?: Partial<RadarAxes>;
    naturalAttackGsAxisBonuses?: Partial<RadarAxes>;
    naturalAttackRangeAxisBonuses?: Partial<RadarAxes>;
    powerContribution?: CanonicalPowerContribution | null;
    traitAxisBonuses?: Partial<TraitAxisBonuses>;
  },
): MonsterOutcomeProfile {
  const cfg = config;
  const netSuccessMultiplier = cfg.baselineParty.netSuccessMultiplier;
  const dieSides = dieSidesFromDieString(monster.attackDie);
  const successChance = successChanceFromDieSides(dieSides);

  const atWillProfiles: NormalizedAtWillAttackProfile[] = [];
  const naturalAttacks = (monster.attacks ?? []).filter((attack) => attack.attackMode === "NATURAL");
  for (const attack of naturalAttacks) {
    atWillProfiles.push(
      normalizeAtWillAttackProfile({
        sourceKind: "natural",
        sourceId: attack.id ?? null,
        sourceLabel: attack.attackName ?? "Natural Attack",
        attackConfig: withEffectiveNaturalAoeTargetCount(attack.attackConfig as AttackConfigLike),
        dieSides,
        successChance,
        aoeMultiplier: cfg.baselineParty.aoeMultiplier,
        level: monster.level,
      }),
    );
  }
  if (naturalAttacks.length === 0 && monster.naturalAttack?.attackConfig) {
    atWillProfiles.push(
      normalizeAtWillAttackProfile({
        sourceKind: "natural",
        sourceId: null,
        sourceLabel: monster.naturalAttack.attackName ?? "Natural Attack",
        attackConfig: withEffectiveNaturalAoeTargetCount(
          monster.naturalAttack.attackConfig as AttackConfigLike,
        ),
        dieSides,
        successChance,
        aoeMultiplier: cfg.baselineParty.aoeMultiplier,
        level: monster.level,
      }),
    );
  }
  for (const equippedWeaponSource of opts?.equippedWeaponSources ?? []) {
    atWillProfiles.push(
      normalizeAtWillAttackProfile({
        sourceKind: "equipped",
        sourceId: equippedWeaponSource.id,
        sourceLabel: equippedWeaponSource.label,
        attackConfig: equippedWeaponSource.attackConfig as AttackConfigLike,
        dieSides,
        successChance,
        aoeMultiplier: cfg.baselineParty.aoeMultiplier,
        level: monster.level,
      }),
    );
  }
  const atWillCandidates = atWillProfiles.map((profile) =>
    computeAtWillContributionFromProfile(profile, netSuccessMultiplier),
  );
  const atWillSummary = summarizeAtWillCandidates(atWillCandidates);

  const sustainedPhysical = atWillSummary.bestPhysical;
  const sustainedMental = atWillSummary.bestMental;
  const spike = atWillSummary.bestTotal;
  const seuPerRound = 0;
  const tsuPerRound = 0;
  const powerAxisVector = normalizeRawAxisBonuses(opts?.powerContribution?.axisVector);

  const sustainedTotal = sustainedPhysical + sustainedMental;

  const partyWPR =
    clampNonNegative(cfg.baselineParty.focusedWPR) +
    clampNonNegative(cfg.baselineParty.typicalWPR) * (Math.max(1, cfg.baselineParty.size) - 1);

  // SC_DEFENCE_STRING_SURVIVABILITY_V1
  // Raw PP/MP should not directly reduce incoming WPR here.
  // Protection is already represented through the editor-side defence-string
  // Defence-string lane bonuses are built from shared Dodge plus physical and mental protection output.
  const netIncoming = Math.max(1, partyWPR);

  const physicalRoundsToZero = clampNonNegative(monster.physicalResilienceMax) / netIncoming;
  const mentalRoundsToZero = clampNonNegative(monster.mentalPerseveranceMax) / netIncoming;
  const nonPowerPresenceBudget =
    spike * 0.6 + sustainedTotal * 0.4 + (atWillSummary.hasAoe ? 1.5 : 0);

  const level = Math.max(1, Math.trunc(monster.level || 1));
  const tierKey = toTierBudgetKey(monster);
  const tierMultiplier = cfg.tierMultipliers[tierKey] ?? 1;
  const resistPressureMultiplier = getResistPressureMultiplier(level, tierKey);
  const physicalThreatCurvePoint = getCurvePointForLevel(cfg.scoringCurves.physicalThreat, level);
  const mentalThreatCurvePoint = getCurvePointForLevel(cfg.scoringCurves.mentalThreat, level);
  const physicalSurvivabilityCurvePoint = getCurvePointForLevel(
    cfg.scoringCurves.physicalSurvivability,
    level,
  );
  const mentalSurvivabilityCurvePoint = getCurvePointForLevel(
    cfg.scoringCurves.mentalSurvivability,
    level,
  );
  const manipulationCurvePoint = getCurvePointForLevel(cfg.scoringCurves.manipulation, level);
  const synergyCurvePoint = getCurvePointForLevel(cfg.scoringCurves.synergy, level);
  const mobilityCurvePoint = getCurvePointForLevel(cfg.scoringCurves.mobility, level);
  const presenceCurvePoint = getCurvePointForLevel(cfg.scoringCurves.presence, level);
  const poolTierMultiplier =
    cfg.healthPoolTuning.expectedPoolTierMultipliers[monster.tier] ??
    cfg.healthPoolTuning.expectedPoolTierMultipliers.ELITE;
  const expectedPhysicalResilience = getExpectedPoolValue(
    cfg.healthPoolTuning.expectedPhysicalResilienceAt1,
    cfg.healthPoolTuning.expectedPhysicalResiliencePerLevel,
    level,
    poolTierMultiplier,
  );
  const expectedMentalPerseverance = getExpectedPoolValue(
    cfg.healthPoolTuning.expectedMentalPerseveranceAt1,
    cfg.healthPoolTuning.expectedMentalPerseverancePerLevel,
    level,
    poolTierMultiplier,
  );
  const physicalPoolRatio =
    clampNonNegative(monster.physicalResilienceMax) / Math.max(1, expectedPhysicalResilience);
  const mentalPoolRatio =
    clampNonNegative(monster.mentalPerseveranceMax) / Math.max(1, expectedMentalPerseverance);
  const physicalPoolLane = getPoolLaneRawBonus(
    physicalPoolRatio,
    physicalSurvivabilityCurvePoint,
    tierMultiplier,
    cfg.healthPoolTuning,
  );
  const mentalPoolLane = getPoolLaneRawBonus(
    mentalPoolRatio,
    mentalSurvivabilityCurvePoint,
    tierMultiplier,
    cfg.healthPoolTuning,
  );
  const axisBudgetTargets: RadarAxes = {
    physicalThreat: getTierAdjustedAxisBudgetTarget(physicalThreatCurvePoint, tierMultiplier),
    mentalThreat: getTierAdjustedAxisBudgetTarget(mentalThreatCurvePoint, tierMultiplier),
    physicalSurvivability: getTierAdjustedAxisBudgetTarget(
      physicalSurvivabilityCurvePoint,
      tierMultiplier,
    ),
    mentalSurvivability: getTierAdjustedAxisBudgetTarget(
      mentalSurvivabilityCurvePoint,
      tierMultiplier,
    ),
    manipulation: getTierAdjustedAxisBudgetTarget(manipulationCurvePoint, tierMultiplier),
    synergy: getTierAdjustedAxisBudgetTarget(synergyCurvePoint, tierMultiplier),
    mobility: getTierAdjustedAxisBudgetTarget(mobilityCurvePoint, tierMultiplier),
    presence: getTierAdjustedAxisBudgetTarget(presenceCurvePoint, tierMultiplier),
  };
  const normalizedDefensiveProfiles = (opts?.defensiveProfileSources ?? [])
    .map((source) => normalizeDefensiveProfile(source))
    .filter((profile): profile is NormalizedDefensiveProfile => Boolean(profile));
  const defensiveProfiles =
    normalizedDefensiveProfiles.length > 0
      ? normalizedDefensiveProfiles
      : buildDefaultDefensiveProfiles(monster);
  const defensiveProtectionTuning: DefensiveProfileProtectionTuning = {
    protectionK:
      opts?.protectionTuning?.protectionK ?? DEFAULT_COMBAT_TUNING_VALUES.protectionK,
    protectionS:
      opts?.protectionTuning?.protectionS ?? DEFAULT_COMBAT_TUNING_VALUES.protectionS,
    armorSkillGuardWeight:
      opts?.protectionTuning?.armorSkillGuardWeight ??
      DEFAULT_COMBAT_TUNING_VALUES.armorSkillGuardWeight,
    armorSkillFortitudeWeight:
      opts?.protectionTuning?.armorSkillFortitudeWeight ??
      DEFAULT_COMBAT_TUNING_VALUES.armorSkillFortitudeWeight,
    armorSkillBaselineOffset:
      opts?.protectionTuning?.armorSkillBaselineOffset ??
      DEFAULT_COMBAT_TUNING_VALUES.armorSkillBaselineOffset,
    armorSkillScale:
      opts?.protectionTuning?.armorSkillScale ?? DEFAULT_COMBAT_TUNING_VALUES.armorSkillScale,
    willpowerSynergyWeight:
      opts?.protectionTuning?.willpowerSynergyWeight ??
      DEFAULT_COMBAT_TUNING_VALUES.willpowerSynergyWeight,
    willpowerBraveryWeight:
      opts?.protectionTuning?.willpowerBraveryWeight ??
      DEFAULT_COMBAT_TUNING_VALUES.willpowerBraveryWeight,
    willpowerBaselineOffset:
      opts?.protectionTuning?.willpowerBaselineOffset ??
      DEFAULT_COMBAT_TUNING_VALUES.willpowerBaselineOffset,
    willpowerScale:
      opts?.protectionTuning?.willpowerScale ?? DEFAULT_COMBAT_TUNING_VALUES.willpowerScale,
    dodgeIntellectWeight:
      opts?.protectionTuning?.dodgeIntellectWeight ??
      DEFAULT_COMBAT_TUNING_VALUES.dodgeIntellectWeight,
    dodgeGuardWeight:
      opts?.protectionTuning?.dodgeGuardWeight ?? DEFAULT_COMBAT_TUNING_VALUES.dodgeGuardWeight,
    dodgeAttributeDivisor:
      opts?.protectionTuning?.dodgeAttributeDivisor ??
      DEFAULT_COMBAT_TUNING_VALUES.dodgeAttributeDivisor,
    dodgeProtectionPenaltyWeight:
      opts?.protectionTuning?.dodgeProtectionPenaltyWeight ??
      DEFAULT_COMBAT_TUNING_VALUES.dodgeProtectionPenaltyWeight,
    defenceStringProtectionOutputScale:
      opts?.protectionTuning?.defenceStringProtectionOutputScale ??
      DEFAULT_COMBAT_TUNING_VALUES.defenceStringProtectionOutputScale,
    defenceStringProtectionOutputMaxShare:
      opts?.protectionTuning?.defenceStringProtectionOutputMaxShare ??
      DEFAULT_COMBAT_TUNING_VALUES.defenceStringProtectionOutputMaxShare,
    dodgeBaselineScale:
      opts?.protectionTuning?.dodgeBaselineScale ??
      DEFAULT_COMBAT_TUNING_VALUES.dodgeBaselineScale,
    dodgeBaselineMaxShare:
      opts?.protectionTuning?.dodgeBaselineMaxShare ??
      DEFAULT_COMBAT_TUNING_VALUES.dodgeBaselineMaxShare,
    dodgeParityScale:
      opts?.protectionTuning?.dodgeParityScale ?? DEFAULT_COMBAT_TUNING_VALUES.dodgeParityScale,
    dodgeParityMaxShare:
      opts?.protectionTuning?.dodgeParityMaxShare ??
      DEFAULT_COMBAT_TUNING_VALUES.dodgeParityMaxShare,
    dodgeAboveExpectedScale:
      opts?.protectionTuning?.dodgeAboveExpectedScale ??
      DEFAULT_COMBAT_TUNING_VALUES.dodgeAboveExpectedScale,
    dodgeAboveExpectedMaxShare:
      opts?.protectionTuning?.dodgeAboveExpectedMaxShare ??
      DEFAULT_COMBAT_TUNING_VALUES.dodgeAboveExpectedMaxShare,
    dodgeExtremeAboveExpectedScale:
      opts?.protectionTuning?.dodgeExtremeAboveExpectedScale ??
      DEFAULT_COMBAT_TUNING_VALUES.dodgeExtremeAboveExpectedScale,
    dodgeExtremeAboveExpectedMaxShare:
      opts?.protectionTuning?.dodgeExtremeAboveExpectedMaxShare ??
      DEFAULT_COMBAT_TUNING_VALUES.dodgeExtremeAboveExpectedMaxShare,
    dodgeTotalMaxShare:
      opts?.protectionTuning?.dodgeTotalMaxShare ??
      DEFAULT_COMBAT_TUNING_VALUES.dodgeTotalMaxShare,
  };
  const defensiveContribution = computeDefensiveContributionFromProfiles(
    defensiveProfiles,
    resolveDefensiveProfileContext(
      monster,
      defensiveProtectionTuning,
      opts?.defensiveProfileContext,
    ),
    defensiveProtectionTuning,
    level,
    monster.tier,
    {
      physicalSurvivability: axisBudgetTargets.physicalSurvivability,
      mentalSurvivability: axisBudgetTargets.mentalSurvivability,
    },
  );
  const customLimitBreakAxisBonuses = computeCustomLimitBreakAxisBonuses(
    [
      {
        tier: monster.limitBreakTier,
        attribute: monster.limitBreakAttribute,
      },
      {
        tier: monster.limitBreak2Tier,
        attribute: monster.limitBreak2Attribute,
      },
    ],
    Boolean(monster.legendary),
    level,
    monster.tier ?? null,
    axisBudgetTargets,
  );

  const attackResistContribution = getRawAxisContributionFromBudgetShare(
    getResistBudgetShare(monster.attackResistDie),
    physicalThreatCurvePoint,
    tierMultiplier,
    resistPressureMultiplier,
  );
  const intellectResistContribution = getRawAxisContributionFromBudgetShare(
    getResistBudgetShare(monster.intellectResistDie),
    mentalThreatCurvePoint,
    tierMultiplier,
    resistPressureMultiplier,
  );
  const defenceResistContribution = getRawAxisContributionFromBudgetShare(
    getResistBudgetShare(monster.guardResistDie),
    physicalSurvivabilityCurvePoint,
    tierMultiplier,
    resistPressureMultiplier,
  );
  const fortitudeResistContribution = getRawAxisContributionFromBudgetShare(
    getResistBudgetShare(monster.fortitudeResistDie),
    physicalSurvivabilityCurvePoint,
    tierMultiplier,
    resistPressureMultiplier,
  );
  const supportResistContribution = getRawAxisContributionFromBudgetShare(
    getResistBudgetShare(monster.synergyResistDie),
    synergyCurvePoint,
    tierMultiplier,
    resistPressureMultiplier,
  );
  const braveryResistContribution = getRawAxisContributionFromBudgetShare(
    getResistBudgetShare(monster.braveryResistDie),
    manipulationCurvePoint,
    tierMultiplier,
    resistPressureMultiplier,
  );
  const rawNaturalAttackGsAxisBonuses = normalizeRawAxisBonuses(opts?.naturalAttackGsAxisBonuses);
  const rawNaturalAttackRangeAxisBonuses = normalizeRawAxisBonuses(
    opts?.naturalAttackRangeAxisBonuses,
  );
  const naturalAttackGsAxisBonuses = scaleRawAxisBonuses(
    rawNaturalAttackGsAxisBonuses,
    cfg.naturalAttackTuning.greaterSuccessEffectWeight,
  );
  const naturalAttackRangeAxisBonuses = scaleRawAxisBonuses(
    rawNaturalAttackRangeAxisBonuses,
    cfg.naturalAttackTuning.rangeEffectWeight,
  );
  const naturalProfileCount = atWillProfiles.filter((profile) => profile.sourceKind === "natural").length;
  const debugAtWillProfiles = atWillProfiles.map((profile) => {
    if (profile.sourceKind !== "natural" || naturalProfileCount !== 1) return profile;
    return {
      ...profile,
      greaterSuccessAxisBonuses: rawNaturalAttackGsAxisBonuses,
      rangeAxisBonuses: rawNaturalAttackRangeAxisBonuses,
    };
  });
  const traitAxisBonuses = normalizeTraitAxisBonuses(opts?.traitAxisBonuses);
  const equipmentModifierAxisBonuses = normalizeRawAxisBonuses(
    opts?.equipmentModifierAxisBonuses,
  );
  const hasPhysicalThreat = sustainedPhysical > 0;
  const hasMentalThreat = sustainedMental > 0;
  const equipmentAttackThreatBonus = equipmentModifierAxisBonuses.physicalThreat;
  const routedEquipmentPhysicalThreatBonus = hasPhysicalThreat
    ? equipmentAttackThreatBonus
    : 0;
  const routedEquipmentMentalThreatBonus = hasMentalThreat
    ? equipmentAttackThreatBonus
    : 0;
  const nonPowerContribution: RadarAxes = {
    physicalThreat:
      sustainedPhysical +
    attackResistContribution +
    routedEquipmentPhysicalThreatBonus +
    naturalAttackGsAxisBonuses.physicalThreat +
    naturalAttackRangeAxisBonuses.physicalThreat +
    customLimitBreakAxisBonuses.physicalThreat +
      traitAxisBonuses.physicalThreat,
    mentalThreat:
      sustainedMental +
      intellectResistContribution +
      routedEquipmentMentalThreatBonus +
      equipmentModifierAxisBonuses.mentalThreat +
      naturalAttackGsAxisBonuses.mentalThreat +
      naturalAttackRangeAxisBonuses.mentalThreat +
      customLimitBreakAxisBonuses.mentalThreat +
      traitAxisBonuses.mentalThreat,
    physicalSurvivability:
      physicalPoolLane.rawBonus +
      defenceResistContribution +
      fortitudeResistContribution +
      defensiveContribution.sharedDodgeAxisVector.physicalSurvivability +
      defensiveContribution.axisVector.physicalSurvivability +
      equipmentModifierAxisBonuses.physicalSurvivability +
      naturalAttackGsAxisBonuses.physicalSurvivability +
      customLimitBreakAxisBonuses.physicalSurvivability +
      traitAxisBonuses.physicalSurvivability,
    mentalSurvivability:
      mentalPoolLane.rawBonus +
      defensiveContribution.sharedDodgeAxisVector.mentalSurvivability +
      defensiveContribution.axisVector.mentalSurvivability +
      equipmentModifierAxisBonuses.mentalSurvivability +
      naturalAttackGsAxisBonuses.mentalSurvivability +
      customLimitBreakAxisBonuses.mentalSurvivability +
      traitAxisBonuses.mentalSurvivability,
    manipulation:
      braveryResistContribution +
      equipmentModifierAxisBonuses.manipulation +
      naturalAttackGsAxisBonuses.manipulation +
      customLimitBreakAxisBonuses.manipulation +
      traitAxisBonuses.manipulation,
    synergy:
      supportResistContribution +
      equipmentModifierAxisBonuses.synergy +
      naturalAttackGsAxisBonuses.synergy +
      customLimitBreakAxisBonuses.synergy +
      traitAxisBonuses.synergy,
    mobility:
      naturalAttackGsAxisBonuses.mobility +
      naturalAttackRangeAxisBonuses.mobility +
      customLimitBreakAxisBonuses.mobility +
      traitAxisBonuses.mobility,
    presence:
      nonPowerPresenceBudget +
      naturalAttackGsAxisBonuses.presence +
      naturalAttackRangeAxisBonuses.presence +
      customLimitBreakAxisBonuses.presence +
      traitAxisBonuses.presence,
  };
  const finalPreNormalizationAxes: RadarAxes = {
    physicalThreat: nonPowerContribution.physicalThreat + powerAxisVector.physicalThreat,
    mentalThreat: nonPowerContribution.mentalThreat + powerAxisVector.mentalThreat,
    physicalSurvivability:
      nonPowerContribution.physicalSurvivability + powerAxisVector.physicalSurvivability,
    mentalSurvivability:
      nonPowerContribution.mentalSurvivability + powerAxisVector.mentalSurvivability,
    manipulation: nonPowerContribution.manipulation + powerAxisVector.manipulation,
    synergy: nonPowerContribution.synergy + powerAxisVector.synergy,
    mobility: nonPowerContribution.mobility + powerAxisVector.mobility,
    presence: nonPowerContribution.presence + powerAxisVector.presence,
  };
  const radarAxes: RadarAxes = {
    physicalThreat: normalizeByLevelCurve(
      finalPreNormalizationAxes.physicalThreat,
      physicalThreatCurvePoint,
      tierMultiplier,
    ),
    mentalThreat: normalizeByLevelCurve(
      finalPreNormalizationAxes.mentalThreat,
      mentalThreatCurvePoint,
      tierMultiplier,
    ),
    physicalSurvivability: normalizeByLevelCurve(
      finalPreNormalizationAxes.physicalSurvivability,
      physicalSurvivabilityCurvePoint,
      tierMultiplier,
    ),
    mentalSurvivability: normalizeByLevelCurve(
      finalPreNormalizationAxes.mentalSurvivability,
      mentalSurvivabilityCurvePoint,
      tierMultiplier,
    ),
    manipulation: normalizeByLevelCurve(
      finalPreNormalizationAxes.manipulation,
      manipulationCurvePoint,
      tierMultiplier,
    ),
    synergy: normalizeByLevelCurve(
      finalPreNormalizationAxes.synergy,
      synergyCurvePoint,
      tierMultiplier,
    ),
    mobility: normalizeByLevelCurve(
      finalPreNormalizationAxes.mobility,
      mobilityCurvePoint,
      tierMultiplier,
    ),
    presence: normalizeByLevelCurve(
      finalPreNormalizationAxes.presence,
      presenceCurvePoint,
      tierMultiplier,
    ),
  };

  return {
    threat: {
      sustainedPhysical,
      sustainedMental,
      sustainedTotal,
      spike,
    },
    utility: {
      seuPerRound,
      tsuPerRound,
    },
    sustainedPhysical,
    sustainedMental,
    sustainedTotal,
    spike,
    seuPerRound,
    tsuPerRound,
    netSuccessMultiplier,
    radarAxes,
    debug: {
      powerContribution: {
        axisVector: powerAxisVector,
        basePowerValue: opts?.powerContribution?.basePowerValue ?? null,
        powerCount: opts?.powerContribution?.powerCount ?? null,
        resolverDebug: opts?.powerContribution?.debug ?? null,
        source: opts?.powerContribution ? "canonical_phase6_resolver" : "none_provided",
      },
      nonPowerContribution: {
        axisVector: nonPowerContribution,
        sources: {
          atWillSummary,
          attackResistContribution,
          intellectResistContribution,
          defenceResistContribution,
          fortitudeResistContribution,
          supportResistContribution,
          braveryResistContribution,
          defensiveProfileContribution: defensiveContribution.axisVector,
          defensiveSharedDodgeContribution: defensiveContribution.sharedDodgeAxisVector,
          defensiveProfileTotals: defensiveContribution.totals,
          defensiveProfiles: defensiveContribution.profileBreakdown,
          equipmentModifierAxisBonuses,
          naturalAttackGsAxisBonuses,
          naturalAttackRangeAxisBonuses,
          atWillProfiles: debugAtWillProfiles,
          naturalAttackTuning: {
            ...cfg.naturalAttackTuning,
            rawGreaterSuccessAxisBonuses: rawNaturalAttackGsAxisBonuses,
            rawRangeAxisBonuses: rawNaturalAttackRangeAxisBonuses,
          },
          traitAxisBonuses,
          customLimitBreakAxisBonuses,
          physicalPoolRawBonus: physicalPoolLane.rawBonus,
          mentalPoolRawBonus: mentalPoolLane.rawBonus,
          nonPowerPresenceBudget,
        },
      },
      finalPreNormalizationAxes,
      normalizationBreakdown: {
        level,
        tierKey,
        tierMultiplier,
        curvePoints: {
          physicalThreat: physicalThreatCurvePoint,
          mentalThreat: mentalThreatCurvePoint,
          physicalSurvivability: physicalSurvivabilityCurvePoint,
          mentalSurvivability: mentalSurvivabilityCurvePoint,
          manipulation: manipulationCurvePoint,
          synergy: synergyCurvePoint,
          mobility: mobilityCurvePoint,
          presence: presenceCurvePoint,
        },
        axisBudgetTargets,
        radarAxes,
      },
      legacyPowerHeuristics: {
        active: false,
        removed: [
          "power attack WPR/spike loop",
          "power SEU/TSU loop",
          "power intention-count synergy budget",
          "power movement heuristic mobility/manipulation budget",
          "power AoE pressure presence flag",
          "power range/target impact multiplier",
        ],
      },
      poolHealthBreakdown: {
        expectedPhysicalResilience,
        expectedMentalPerseverance,
        currentPhysicalResilienceMax: clampNonNegative(monster.physicalResilienceMax),
        currentMentalPerseveranceMax: clampNonNegative(monster.mentalPerseveranceMax),
        physicalPoolRatio,
        mentalPoolRatio,
        poolAtExpectedShare: cfg.healthPoolTuning.poolAtExpectedShare,
        physicalLane: physicalPoolLane,
        mentalLane: mentalPoolLane,
        physicalRoundsToZero,
        mentalRoundsToZero,
      },
    },
  };
}

