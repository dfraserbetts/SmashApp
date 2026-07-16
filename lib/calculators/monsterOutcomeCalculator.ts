import type {
  CoreAttribute,
  LimitBreakTier,
  MonsterTraitBand,
  MonsterTier,
  MonsterUpsertInput,
  MonsterCalculatorArchetype,
  PowerCooldownAuthorityResult,
} from "@/lib/summoning/types";
import {
  getArmorSkillDiceCountFromAttributes,
  getDodgeValue,
  getWeaponSkillDiceCountFromAttributes,
  getWillpowerDiceCountFromAttributes,
} from "@/lib/summoning/attributes";
import { strengthToTableWoundsPerSuccess } from "@/lib/forge/outputProfile";
import type {
  CalculatorConfig,
  ControlPressureBaselinePackage,
  ControlPressureResistibility,
  DurabilityBaselinePackage,
  DurabilityLaneBaseline,
  LevelCurvePoint,
  PressureBaselinePackage,
  PressureReachCategory,
} from "@/lib/calculators/calculatorConfig";
import { successCountForRoll } from "@/lib/combat-lab/dice";
import {
  DEFAULT_COMBAT_TUNING_VALUES,
  getRawSurvivabilityBudgetTarget,
  type ProtectionTuningValues,
} from "@/lib/config/combatTuningShared";
import {
  aggregateAugmentDebuffPowerDelivery,
  createMatchedReferenceResistDistribution,
  evaluateAugmentDebuffPacket,
  type EconomicDuration,
  type IncarnateDieSides,
  type PacketDeliveryEvaluation,
} from "@/lib/summoning/augmentDebuffEconomics";
import { getNaturalAoeOneAreaCapacity } from "@/lib/powers/expectedTargetEstimation";
import { computeLevel3SemanticSynergy } from "@/lib/calculators/semanticSynergy";

export type { MonsterCalculatorArchetype };

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
  equippedItemType?: "ARMOR" | "SHIELD" | string | null;
  armorLocation?: "HEAD" | "SHOULDERS" | "TORSO" | "LEGS" | "FEET" | string | null;
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
  | "weaponSkillValue"
  | "weaponSkillModifier"
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
  powers?: Array<{
    id?: string | null;
    name?: string | null;
    axisVector?: Partial<RadarAxes> | null;
    basePowerValue?: number | null;
    authoredPower?: MonsterUpsertInput["powers"][number] | null;
    cooldownAuthority?: PowerCooldownAuthorityResult | null;
    derivedCooldownTurns?: number | null;
    derivedCooldownLoad?: number | null;
    cooldownTurns?: number | null;
    cooldownReduction?: number | null;
  }> | null;
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
  expectedSuccessesPerDie: number;
  expectedSuccesses: number;
  reliabilityMultiplier: number;
  authoredStrength: number;
  damageTypeCount: number;
  woundsPerSuccess: number;
  levelAdjustedWoundsPerSuccess: number;
  levelWoundBonus: number;
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
  equippedItemType: string | null;
  armorLocation: string | null;
};

type DefensiveProfileContext = {
  dodgeDice: number;
  unarmoredDodgeDice?: number;
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
    expectedIncomingAttackDice: number;
    expectedDodgeDice: number;
    baselineDodgeDice: number;
    scoringDodgeDice: number;
    authoredDodgeDice: number;
    unarmoredDodgeDice: number;
    dodgeDiceAboveExpectation: number;
    dodgeAboveExpectationRatio: number;
    physicalDodgeRawBonus: number;
    mentalDodgeRawBonus: number;
    physicalDefenceRawBonus: number;
    mentalDefenceRawBonus: number;
  };
};

type DefensivePackageBand = {
  level: number;
  lowMax: number;
  standardMax: number;
  highMax: number;
  extremeMin: number;
};

const DEFENSIVE_PACKAGE_BANDS: Record<"physical" | "mental", DefensivePackageBand[]> = {
  physical: [
    { level: 1, lowMax: 2, standardMax: 4, highMax: 6, extremeMin: 8 },
    { level: 2, lowMax: 2, standardMax: 4, highMax: 8, extremeMin: 10 },
    { level: 3, lowMax: 2, standardMax: 6, highMax: 10, extremeMin: 12 },
    { level: 4, lowMax: 4, standardMax: 8, highMax: 12, extremeMin: 14 },
    { level: 5, lowMax: 4, standardMax: 10, highMax: 16, extremeMin: 18 },
    { level: 6, lowMax: 4, standardMax: 10, highMax: 16, extremeMin: 20 },
    { level: 7, lowMax: 6, standardMax: 12, highMax: 18, extremeMin: 22 },
    { level: 8, lowMax: 6, standardMax: 12, highMax: 20, extremeMin: 24 },
    { level: 9, lowMax: 6, standardMax: 14, highMax: 22, extremeMin: 26 },
    { level: 10, lowMax: 8, standardMax: 14, highMax: 24, extremeMin: 28 },
    { level: 11, lowMax: 8, standardMax: 16, highMax: 26, extremeMin: 30 },
    { level: 12, lowMax: 8, standardMax: 16, highMax: 28, extremeMin: 32 },
    { level: 13, lowMax: 10, standardMax: 18, highMax: 30, extremeMin: 34 },
    { level: 14, lowMax: 10, standardMax: 18, highMax: 32, extremeMin: 36 },
    { level: 15, lowMax: 10, standardMax: 20, highMax: 34, extremeMin: 38 },
    { level: 16, lowMax: 12, standardMax: 20, highMax: 36, extremeMin: 40 },
    { level: 17, lowMax: 12, standardMax: 22, highMax: 38, extremeMin: 42 },
    { level: 18, lowMax: 12, standardMax: 22, highMax: 40, extremeMin: 44 },
    { level: 19, lowMax: 14, standardMax: 24, highMax: 42, extremeMin: 46 },
    { level: 20, lowMax: 14, standardMax: 24, highMax: 44, extremeMin: 48 },
  ],
  mental: [
    { level: 1, lowMax: 2, standardMax: 4, highMax: 6, extremeMin: 8 },
    { level: 2, lowMax: 2, standardMax: 4, highMax: 6, extremeMin: 8 },
    { level: 3, lowMax: 2, standardMax: 6, highMax: 8, extremeMin: 10 },
    { level: 4, lowMax: 4, standardMax: 6, highMax: 10, extremeMin: 12 },
    { level: 5, lowMax: 4, standardMax: 8, highMax: 12, extremeMin: 14 },
    { level: 6, lowMax: 4, standardMax: 8, highMax: 12, extremeMin: 16 },
    { level: 7, lowMax: 4, standardMax: 10, highMax: 14, extremeMin: 18 },
    { level: 8, lowMax: 6, standardMax: 10, highMax: 16, extremeMin: 20 },
    { level: 9, lowMax: 6, standardMax: 12, highMax: 18, extremeMin: 22 },
    { level: 10, lowMax: 6, standardMax: 12, highMax: 20, extremeMin: 24 },
    { level: 11, lowMax: 8, standardMax: 14, highMax: 22, extremeMin: 26 },
    { level: 12, lowMax: 8, standardMax: 14, highMax: 24, extremeMin: 28 },
    { level: 13, lowMax: 8, standardMax: 16, highMax: 26, extremeMin: 30 },
    { level: 14, lowMax: 10, standardMax: 16, highMax: 28, extremeMin: 32 },
    { level: 15, lowMax: 10, standardMax: 18, highMax: 30, extremeMin: 34 },
    { level: 16, lowMax: 10, standardMax: 18, highMax: 32, extremeMin: 36 },
    { level: 17, lowMax: 12, standardMax: 20, highMax: 34, extremeMin: 38 },
    { level: 18, lowMax: 12, standardMax: 20, highMax: 36, extremeMin: 40 },
    { level: 19, lowMax: 12, standardMax: 22, highMax: 38, extremeMin: 42 },
    { level: 20, lowMax: 14, standardMax: 22, highMax: 40, extremeMin: 44 },
  ],
};

const ARMOUR_PACKAGE_SLOT_ORDER = ["HEAD", "SHOULDERS", "TORSO", "LEGS", "FEET"] as const;

const SHIELD_DEFENSIVE_OVERLAY_SHARE = 0.2;

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
  | "atWillThreatAxisMultiplier"
  | "defenceStringProtectionOutputScale"
  | "defenceStringProtectionOutputMaxShare"
  | "mentalDefenceStringProtectionOutputScale"
  | "mentalDefenceStringProtectionOutputMaxShare"
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
const RAW_NUMERATOR_REFERENCE_LEVEL = 1;

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
  return parsed;
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
  rawBudgetTarget: number,
  cfg: CalculatorConfig["healthPoolTuning"],
): { signedDeltaShare: number; finalShare: number; rawBudgetTarget: number; rawBonus: number } {
  const signedDeltaShare = getSignedExpectedPoolDeltaShare(ratio, cfg);
  const finalShare = getFinalPoolShare(cfg.poolAtExpectedShare, signedDeltaShare);
  return {
    signedDeltaShare,
    finalShare,
    rawBudgetTarget,
    rawBonus: rawBudgetTarget * finalShare,
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
    physicalThreat: Number.isFinite(bonuses.physicalThreat) ? bonuses.physicalThreat ?? 0 : 0,
    mentalThreat: Number.isFinite(bonuses.mentalThreat) ? bonuses.mentalThreat ?? 0 : 0,
    physicalSurvivability: Number.isFinite(bonuses.physicalSurvivability)
      ? bonuses.physicalSurvivability ?? 0
      : 0,
    mentalSurvivability: Number.isFinite(bonuses.mentalSurvivability)
      ? bonuses.mentalSurvivability ?? 0
      : 0,
    manipulation: Number.isFinite(bonuses.manipulation) ? bonuses.manipulation ?? 0 : 0,
    synergy: Number.isFinite(bonuses.synergy) ? bonuses.synergy ?? 0 : 0,
    mobility: Number.isFinite(bonuses.mobility) ? bonuses.mobility ?? 0 : 0,
    presence: Number.isFinite(bonuses.presence) ? bonuses.presence ?? 0 : 0,
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

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function scalePowerAxisBonusesByFactors(bonuses: RadarAxes, factors: RadarAxes): RadarAxes {
  return {
    physicalThreat: bonuses.physicalThreat * clampNonNegative(factors.physicalThreat),
    mentalThreat: bonuses.mentalThreat * clampNonNegative(factors.mentalThreat),
    physicalSurvivability:
      bonuses.physicalSurvivability * clampNonNegative(factors.physicalSurvivability),
    mentalSurvivability:
      bonuses.mentalSurvivability * clampNonNegative(factors.mentalSurvivability),
    manipulation: bonuses.manipulation * clampNonNegative(factors.manipulation),
    synergy: bonuses.synergy * clampNonNegative(factors.synergy),
    mobility: bonuses.mobility * clampNonNegative(factors.mobility),
    presence: bonuses.presence * clampNonNegative(factors.presence),
  };
}

function createUniformAxisFactors(factor: number): RadarAxes {
  const safeFactor = clampNonNegative(factor);
  return {
    physicalThreat: safeFactor,
    mentalThreat: safeFactor,
    physicalSurvivability: safeFactor,
    mentalSurvivability: safeFactor,
    manipulation: safeFactor,
    synergy: safeFactor,
    mobility: safeFactor,
    presence: safeFactor,
  };
}

function addRawAxisBonuses(left: RadarAxes, right: RadarAxes): RadarAxes {
  return {
    physicalThreat: left.physicalThreat + right.physicalThreat,
    mentalThreat: left.mentalThreat + right.mentalThreat,
    physicalSurvivability: left.physicalSurvivability + right.physicalSurvivability,
    mentalSurvivability: left.mentalSurvivability + right.mentalSurvivability,
    manipulation: left.manipulation + right.manipulation,
    synergy: left.synergy + right.synergy,
    mobility: left.mobility + right.mobility,
    presence: left.presence + right.presence,
  };
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getPowerAvailabilityFactor(cooldownTurns: number): number {
  if (cooldownTurns <= 0) return 1;
  if (cooldownTurns === 1) return 0.75;
  if (cooldownTurns === 2) return 0.55;
  if (cooldownTurns === 3) return 0.4;
  return 0.3;
}

const DEFAULT_RADAR_COOLDOWN_LOAD_EXPONENT = 1.2;
const UTILITY_EFFECTIVE_POWER_EXPONENT = 0.75;
const RESOLVER_DERIVED_POWER_RADAR_AVAILABILITY_FACTOR = 0.3;

function getRadarCooldownLoadExponent(): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.SMASH_RADAR_COOLDOWN_LOAD_EXPONENT;
  const parsed = env ? Number(env) : null;
  return parsed !== null && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_RADAR_COOLDOWN_LOAD_EXPONENT;
}

function resolvePowerAvailability(power: {
  cooldownAuthority?: PowerCooldownAuthorityResult | null;
}): {
  availabilityFactor: number;
  effectivePowerFactor: number;
  threatEffectivePowerFactor: number;
  utilityEffectivePowerFactor: number;
  utilityEffectivePowerExponent: number | null;
  utilityFactorFormulaLabel: string;
  axisEffectivePowerFactors: RadarAxes;
  tableCooldownAvailabilityFactor: number;
  radarLoadExpressionFactor: number;
  radarCooldownLoadExponent: number | null;
  derivedCooldownLoadClamped: number | null;
  factorFormulaLabel: string;
  availabilityReason: string;
  cooldownTurns: number | null;
  cooldownSource: string;
  cooldownAuthority: PowerCooldownAuthorityResult | null;
  unresolvedError: string | null;
} {
  const authority = power.cooldownAuthority ?? null;
  if (authority) {
    const resolvedCooldown = authority.effectiveCooldownTurns;
    const tableAvailabilityFactor = getPowerAvailabilityFactor(resolvedCooldown);
    const cooldownLoad = readFiniteNumber(authority.cooldownLoad);
    const normalizedCooldownLoad =
      cooldownLoad === null ? null : Math.max(0, Math.min(1, cooldownLoad));
    const radarCooldownLoadExponent = getRadarCooldownLoadExponent();
    const radarRelativeLoadFactor =
      normalizedCooldownLoad === null
        ? 1
        : Math.pow(normalizedCooldownLoad, radarCooldownLoadExponent);
    const availabilityFactor = RESOLVER_DERIVED_POWER_RADAR_AVAILABILITY_FACTOR;
    const utilityEffectivePowerFactor =
      Math.pow(Math.max(0, Math.min(1, availabilityFactor)), UTILITY_EFFECTIVE_POWER_EXPONENT);
    const utilityEffectivePowerExponent = UTILITY_EFFECTIVE_POWER_EXPONENT;
    const utilityFactorFormulaLabel = "pow(threatEffectivePowerFactor, utilityEffectivePowerExponent)";
    const axisEffectivePowerFactors: RadarAxes = {
      physicalThreat: availabilityFactor,
      mentalThreat: availabilityFactor,
      physicalSurvivability: utilityEffectivePowerFactor,
      mentalSurvivability: utilityEffectivePowerFactor,
      manipulation: utilityEffectivePowerFactor,
      synergy: utilityEffectivePowerFactor,
      mobility: utilityEffectivePowerFactor,
      presence: utilityEffectivePowerFactor,
    };
    return {
      availabilityFactor,
      effectivePowerFactor: availabilityFactor,
      threatEffectivePowerFactor: availabilityFactor,
      utilityEffectivePowerFactor,
      utilityEffectivePowerExponent,
      utilityFactorFormulaLabel,
      axisEffectivePowerFactors,
      tableCooldownAvailabilityFactor: tableAvailabilityFactor,
      radarLoadExpressionFactor: radarRelativeLoadFactor,
      radarCooldownLoadExponent,
      derivedCooldownLoadClamped: normalizedCooldownLoad,
      factorFormulaLabel:
        "threat axes: resolverDerivedPowerRadarAvailabilityFactor; utility axes: pow(threatEffectivePowerFactor, utilityEffectivePowerExponent)",
      availabilityReason:
        cooldownLoad === null
          ? `Authoritative resolver-derived cooldown ${resolvedCooldown} is present; persisted cooldown fields are diagnostic only. Threat axes use uniform resolver-derived radar availability factor ${availabilityFactor} so increasing canonical power value cannot reduce radar threat at cooldown bracket boundaries.`
          : `Authoritative resolver-derived cooldown ${resolvedCooldown} and cooldown load ${normalizedCooldownLoad} are present; persisted cooldown fields are diagnostic only. Threat axes use uniform resolver-derived radar availability factor ${availabilityFactor} so increasing canonical power value cannot reduce radar threat at cooldown bracket boundaries. The legacy table cooldown factor ${tableAvailabilityFactor} and load expression factor ${radarRelativeLoadFactor} are retained as diagnostics only.`,
      cooldownTurns: resolvedCooldown,
      cooldownSource: authority.source,
      cooldownAuthority: authority,
      unresolvedError: null,
    };
  }
  return {
    availabilityFactor: 0,
    effectivePowerFactor: 0,
    threatEffectivePowerFactor: 0,
    utilityEffectivePowerFactor: 0,
    utilityEffectivePowerExponent: null,
    utilityFactorFormulaLabel: "tableCooldownAvailabilityFactor",
    axisEffectivePowerFactors: createUniformAxisFactors(0),
    tableCooldownAvailabilityFactor: 0,
    radarLoadExpressionFactor: 1,
    radarCooldownLoadExponent: null,
    derivedCooldownLoadClamped: null,
    factorFormulaLabel: "tableCooldownAvailabilityFactor * radarLoadExpressionFactor",
    availabilityReason: "Cooldown authority is unresolved; persisted cooldown was not used and the power contributes no availability-scaled axes.",
    cooldownTurns: null,
    cooldownSource: "UNRESOLVED",
    cooldownAuthority: null,
    unresolvedError: "Power cooldown authority is unresolved.",
  };
}

function resolveEffectivePowerAxisContribution(
  contribution: CanonicalPowerContribution | null | undefined,
): {
  canonicalPowerAxisVector: RadarAxes;
  effectivePowerAxisVector: RadarAxes;
  availabilityFactor: number | null;
  effectivePowerFactor: number | null;
  factorFormulaLabel: string;
  availabilityReason: string;
  cooldownTurns: number | null;
  cooldownSource: string;
  perPower: Array<{
    id: string | null;
    name: string | null;
    canonicalPowerAxisVector: RadarAxes;
    effectivePowerAxisVector: RadarAxes;
    availabilityFactor: number;
    effectivePowerFactor: number;
    threatEffectivePowerFactor: number;
    utilityEffectivePowerFactor: number;
    utilityEffectivePowerExponent: number | null;
    utilityFactorFormulaLabel: string;
    axisEffectivePowerFactors: RadarAxes;
    tableCooldownAvailabilityFactor: number;
    radarLoadExpressionFactor: number;
    radarCooldownLoadExponent: number | null;
    derivedCooldownLoadClamped: number | null;
    factorFormulaLabel: string;
    availabilityReason: string;
    cooldownTurns: number | null;
    cooldownSource: string;
    cooldownAuthority: PowerCooldownAuthorityResult | null;
    unresolvedError: string | null;
    authoritySource: PowerCooldownAuthorityResult["source"] | null;
    authorityTuningSetId: string | null;
    authorityTuningUpdatedAt: string | null;
    authorityStoredCooldownTurns: number | null;
    authorityMismatch: boolean | null;
    authorityWarnings: string[];
    basePowerValue: number | null;
    derivedCooldownLoad: number | null;
  }>;
  warnings: string[];
} {
  const canonicalPowerAxisVector = normalizeRawAxisBonuses(contribution?.axisVector);
  const powers = Array.isArray(contribution?.powers) ? contribution.powers : [];
  const warnings: string[] = [];

  if (powers.length === 0) {
    if (contribution) {
      warnings.push(
        "No per-power contribution rows were provided; effective power axis vector falls back to canonical aggregate without availability reduction.",
      );
    }
    return {
      canonicalPowerAxisVector,
      effectivePowerAxisVector: canonicalPowerAxisVector,
      availabilityFactor: contribution ? 1 : null,
      effectivePowerFactor: contribution ? 1 : null,
      factorFormulaLabel: "tableCooldownAvailabilityFactor * radarLoadExpressionFactor",
      availabilityReason: contribution
        ? "Aggregate canonical power contribution had no per-power cooldown data, so no availability factor could be honestly applied."
        : "No canonical power contribution was provided.",
      cooldownTurns: null,
      cooldownSource: contribution ? "missing_per_power_rows" : "none",
      perPower: [],
      warnings,
    };
  }

  let effectivePowerAxisVector = createEmptyAxisBonuses();
  const perPower = powers.map((power, index) => {
    const canonicalAxis = normalizeRawAxisBonuses(power.axisVector);
    const availability = resolvePowerAvailability(power);
    const effectiveAxis = scalePowerAxisBonusesByFactors(
      canonicalAxis,
      availability.axisEffectivePowerFactors,
    );
    effectivePowerAxisVector = addRawAxisBonuses(effectivePowerAxisVector, effectiveAxis);
    if (availability.unresolvedError) {
      warnings.push(
        `Power ${power.name || index + 1} has unresolved cooldown authority; persisted cooldown was ignored and its availability-scaled contribution was suppressed.`,
      );
    }
    return {
      id: power.id ?? null,
      name: power.name ?? null,
      canonicalPowerAxisVector: canonicalAxis,
      effectivePowerAxisVector: effectiveAxis,
      availabilityFactor: availability.availabilityFactor,
      effectivePowerFactor: availability.effectivePowerFactor,
      threatEffectivePowerFactor: availability.threatEffectivePowerFactor,
      utilityEffectivePowerFactor: availability.utilityEffectivePowerFactor,
      utilityEffectivePowerExponent: availability.utilityEffectivePowerExponent,
      utilityFactorFormulaLabel: availability.utilityFactorFormulaLabel,
      axisEffectivePowerFactors: availability.axisEffectivePowerFactors,
      tableCooldownAvailabilityFactor: availability.tableCooldownAvailabilityFactor,
      radarLoadExpressionFactor: availability.radarLoadExpressionFactor,
      radarCooldownLoadExponent: availability.radarCooldownLoadExponent,
      derivedCooldownLoadClamped: availability.derivedCooldownLoadClamped,
      factorFormulaLabel: availability.factorFormulaLabel,
      availabilityReason: availability.availabilityReason,
      cooldownTurns: availability.cooldownTurns,
      cooldownSource: availability.cooldownSource,
      cooldownAuthority: availability.cooldownAuthority,
      unresolvedError: availability.unresolvedError,
      authoritySource: availability.cooldownAuthority?.source ?? null,
      authorityTuningSetId: availability.cooldownAuthority?.tuningSetId ?? null,
      authorityTuningUpdatedAt: availability.cooldownAuthority?.tuningUpdatedAt ?? null,
      authorityStoredCooldownTurns:
        availability.cooldownAuthority?.storedCooldownTurns ?? null,
      authorityMismatch: availability.cooldownAuthority?.mismatch ?? null,
      authorityWarnings: availability.cooldownAuthority?.warnings ?? [],
      basePowerValue:
        typeof power.basePowerValue === "number" && Number.isFinite(power.basePowerValue)
          ? power.basePowerValue
          : null,
      derivedCooldownLoad: readFiniteNumber(power.cooldownAuthority?.cooldownLoad),
    };
  });

  const weightedAvailabilityDenominator = perPower.reduce(
    (sum, power) =>
      sum +
      Object.values(power.canonicalPowerAxisVector).reduce((axisSum, value) => axisSum + value, 0),
    0,
  );
  const weightedAvailabilityNumerator = perPower.reduce((sum, power) => {
    const powerWeight = Object.values(power.canonicalPowerAxisVector).reduce(
      (axisSum, value) => axisSum + value,
      0,
    );
    return sum + powerWeight * power.availabilityFactor;
  }, 0);
  const weightedEffectivePowerNumerator = perPower.reduce(
    (sum, power) =>
      sum +
      Object.values(power.effectivePowerAxisVector).reduce((axisSum, value) => axisSum + value, 0),
    0,
  );
  const cooldownSources = new Set(perPower.map((power) => power.cooldownSource));
  const aggregateCooldownSource =
    cooldownSources.size === 1
      ? (perPower[0]?.cooldownSource ?? "none")
      : "MIXED_COOLDOWN_AUTHORITY";
  const aggregateAvailabilityFactor =
    weightedAvailabilityDenominator > 0
      ? weightedAvailabilityNumerator / weightedAvailabilityDenominator
      : 0;
  const aggregateEffectivePowerFactor =
    weightedAvailabilityDenominator > 0
      ? weightedEffectivePowerNumerator / weightedAvailabilityDenominator
      : 0;

  return {
    canonicalPowerAxisVector,
    effectivePowerAxisVector,
    availabilityFactor: aggregateAvailabilityFactor,
    effectivePowerFactor: aggregateEffectivePowerFactor,
    factorFormulaLabel:
      "per-power resolver-derived threat axes use resolverDerivedPowerRadarAvailabilityFactor; utility axes use pow(threatEffectivePowerFactor, utilityEffectivePowerExponent)",
    availabilityReason:
      cooldownSources.has("UNRESOLVED")
        ? "Per-power authoritative cooldown availability was applied where available; unresolved powers were suppressed without using persisted cooldown."
        : "Per-power authoritative resolver-derived effective power factors applied before final monster outcome axes. Threat axes use a uniform resolver-derived radar availability factor so increasing canonical power value cannot reduce threat at cooldown bracket boundaries; utility axes use a monotonic exponent transform of the threat factor. Persisted cooldown fields are diagnostic only.",
    cooldownTurns: null,
    cooldownSource: aggregateCooldownSource,
    perPower,
    warnings,
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

type ThreatAxisNormalizationBreakdown = {
  value: number;
  baselineRaw: number;
  ratioToBaseline: number;
  finalScore: number;
  capped: boolean;
  reference: {
    level: number;
    diceCount: number;
    dieSides: number;
    woundsPerSuccess: number;
    targetCount: number;
    damageTypeCount: number;
    expectedSuccesses: number;
    netSuccessMultiplier: number;
    atWillThreatAxisMultiplier: number;
    levelScale: number;
    tierKey: TierBudgetKey;
    tierBaselineMultiplier: number;
    curveExponent: number;
  };
};

function getThreatAxisLevelScale(
  level: number,
  tuning: CalculatorConfig["threatAxisTuning"],
): number {
  const normalizedLevel = Math.max(1, Math.trunc(level || tuning.referenceLevel));
  const rawScale =
    1 + (normalizedLevel - tuning.referenceLevel) * Math.max(0, tuning.levelScalePerLevel);
  return Math.max(Math.max(0, tuning.minLevelScale), rawScale);
}

function getThreatAxisBaselineRaw(params: {
  level: number;
  tierKey: TierBudgetKey;
  tuning: CalculatorConfig["threatAxisTuning"];
  netSuccessMultiplier: number;
  atWillThreatAxisMultiplier: number;
}): ThreatAxisNormalizationBreakdown["reference"] & { baselineRaw: number } {
  const expectedSuccesses = expectedTieredSuccesses({
    dieSides: params.tuning.referenceDieSides,
    diceCount: params.tuning.referenceDiceCount,
  });
  const levelScale = getThreatAxisLevelScale(params.level, params.tuning);
  const tierBaselineMultiplier =
    params.tuning.tierBaselineMultipliers[params.tierKey] ??
    params.tuning.tierBaselineMultipliers.ELITE;
  const baselineRaw =
    expectedSuccesses *
    Math.max(0, params.tuning.referenceWoundsPerSuccess) *
    Math.max(1, params.tuning.referenceTargetCount) *
    Math.max(1, params.tuning.referenceDamageTypeCount) *
    Math.max(0, params.netSuccessMultiplier) *
    Math.max(0, params.atWillThreatAxisMultiplier) *
    levelScale *
    Math.max(0.01, tierBaselineMultiplier);

  return {
    baselineRaw,
    level: params.tuning.referenceLevel,
    diceCount: params.tuning.referenceDiceCount,
    dieSides: params.tuning.referenceDieSides,
    woundsPerSuccess: params.tuning.referenceWoundsPerSuccess,
    targetCount: params.tuning.referenceTargetCount,
    damageTypeCount: params.tuning.referenceDamageTypeCount,
    expectedSuccesses,
    netSuccessMultiplier: params.netSuccessMultiplier,
    atWillThreatAxisMultiplier: params.atWillThreatAxisMultiplier,
    levelScale,
    tierKey: params.tierKey,
    tierBaselineMultiplier,
    curveExponent: params.tuning.curveExponent,
  };
}

function normalizeThreatByAcceptedBaseline(params: {
  value: number;
  level: number;
  tierKey: TierBudgetKey;
  tuning: CalculatorConfig["threatAxisTuning"];
  netSuccessMultiplier: number;
  atWillThreatAxisMultiplier: number;
}): ThreatAxisNormalizationBreakdown {
  const reference = getThreatAxisBaselineRaw({
    level: params.level,
    tierKey: params.tierKey,
    tuning: params.tuning,
    netSuccessMultiplier: params.netSuccessMultiplier,
    atWillThreatAxisMultiplier: params.atWillThreatAxisMultiplier,
  });
  const safeValue = clampNonNegative(params.value);
  const ratioToBaseline = reference.baselineRaw > 0 ? safeValue / reference.baselineRaw : 0;
  const shapedRatio = Math.pow(
    Math.max(0, ratioToBaseline),
    Math.max(0.1, params.tuning.curveExponent),
  );
  const finalScore =
    shapedRatio > 0 && Number.isFinite(shapedRatio)
      ? clampRadarScore((10 * shapedRatio) / (1 + shapedRatio))
      : 0;

  return {
    value: safeValue,
    baselineRaw: reference.baselineRaw,
    ratioToBaseline,
    finalScore,
    capped: finalScore >= 10,
    reference,
  };
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

function getRawAxisContributionFromBudgetTarget(
  budgetShare: number,
  rawBudgetTarget: number,
  resistPressureMultiplier = 1,
): number {
  return (
    clampNonNegative(budgetShare) *
    clampNonNegative(resistPressureMultiplier) *
    clampNonNegative(rawBudgetTarget)
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

function toThreatAxisBaselineTierKey(
  monster: Pick<MonsterOutcomeInput, "tier" | "legendary">,
): TierBudgetKey {
  const tier = String(monster.tier ?? "MINION").toUpperCase() as MonsterTier | "LEGENDARY";
  if (monster.legendary && tier === "BOSS") return "LEGENDARY";
  if (tier === "MINION" || tier === "SOLDIER" || tier === "ELITE" || tier === "BOSS") {
    return tier;
  }
  return toTierBudgetKey(monster);
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
  return getNaturalAoeOneAreaCapacity({
    shape: aoeConfig.shape,
    sphereRadiusFeet: aoeConfig.sphereRadiusFeet,
    coneLengthFeet: aoeConfig.coneLengthFeet,
    lineWidthFeet: aoeConfig.lineWidthFeet,
    lineLengthFeet: aoeConfig.lineLengthFeet,
  }) ?? 1;
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
  diceCount: number,
  expectedSuccessesPerDie: number,
  expectedSuccesses: number,
  reliabilityMultiplier: number,
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
      diceCount,
      dieSides,
      successChance,
      expectedSuccessesPerDie,
      expectedSuccesses,
      reliabilityMultiplier,
      authoredStrength,
      damageTypeCount,
      woundsPerSuccess: strengthToTableWoundsPerSuccess(authoredStrength),
      levelAdjustedWoundsPerSuccess: strengthToTableWoundsPerSuccess(authoredStrength) + levelWoundBonus,
      levelWoundBonus,
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
  diceCount: number;
  expectedSuccessesPerDie: number;
  expectedSuccesses: number;
  reliabilityMultiplier?: number;
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
      params.diceCount,
      params.expectedSuccessesPerDie,
      params.expectedSuccesses,
      params.reliabilityMultiplier ?? 1,
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
      params.diceCount,
      params.expectedSuccessesPerDie,
      params.expectedSuccesses,
      params.reliabilityMultiplier ?? 1,
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
      params.diceCount,
      params.expectedSuccessesPerDie,
      params.expectedSuccesses,
      params.reliabilityMultiplier ?? 1,
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
      segment.expectedSuccesses * netSuccessMultiplier * Math.max(0, segment.targetMultiplier);
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

type ExpectedPowerAttackContribution = {
  axisVector: Pick<RadarAxes, "physicalThreat" | "mentalThreat">;
  packetCount: number;
  source: "authored_power_packets" | "missing_authored_power_packets";
  notes: string[];
};

function getPowerRangeCategory(power: MonsterUpsertInput["powers"][number]): "MELEE" | "RANGED" | "AOE" | null {
  const ranges = Array.isArray(power.rangeCategories) ? power.rangeCategories : [];
  if (ranges.includes("AOE")) return "AOE";
  if (ranges.includes("RANGED")) return "RANGED";
  if (ranges.includes("MELEE")) return "MELEE";
  return null;
}

function getPowerTargetCount(power: MonsterUpsertInput["powers"][number], rangeCategory: string | null): number {
  if (rangeCategory === "AOE") return readMultiplier(power.aoeCount, 1);
  if (rangeCategory === "RANGED") return readMultiplier(power.rangedTargets, 1);
  if (rangeCategory === "MELEE") return readMultiplier(power.meleeTargets, 1);
  return 1;
}

function getExpectedPowerAttackContribution(params: {
  monster: MonsterOutcomeInput;
  powerContribution?: CanonicalPowerContribution | null;
  perPowerAvailability: ReturnType<typeof resolveEffectivePowerAxisContribution>["perPower"];
  netSuccessMultiplier: number;
  aoeMultiplier: number;
}): ExpectedPowerAttackContribution {
  const out: ExpectedPowerAttackContribution = {
    axisVector: { physicalThreat: 0, mentalThreat: 0 },
    packetCount: 0,
    source: "missing_authored_power_packets",
    notes: [],
  };
  const powers = params.powerContribution?.powers ?? [];
  const availabilityByKey = new Map<string, number>();
  for (const entry of params.perPowerAvailability) {
    const factor = Math.max(0, Number(entry.axisEffectivePowerFactors.physicalThreat ?? entry.availabilityFactor));
    if (entry.id) availabilityByKey.set(`id:${entry.id}`, factor);
    if (entry.name) availabilityByKey.set(`name:${entry.name}`, factor);
  }

  for (const powerEntry of powers) {
    const power = powerEntry.authoredPower;
    if (!power) continue;
    const rangeCategory = getPowerRangeCategory(power);
    const targetCount = getPowerTargetCount(power, rangeCategory);
    const targetMultiplier =
      rangeCategory === "AOE"
        ? targetCount * Math.max(0, params.aoeMultiplier)
        : targetCount;
    const availability =
      availabilityByKey.get(`id:${powerEntry.id ?? ""}`) ??
      availabilityByKey.get(`name:${powerEntry.name ?? ""}`) ??
      1;
    const powerDiceFallback = Math.max(1, Math.trunc(Number(power.diceCount ?? 1)));
    const packets = Array.isArray(power.intentions) ? power.intentions : [];
    for (const packet of packets) {
      const packetRecord = readRecord(packet);
      const details = readRecord(packetRecord.detailsJson);
      const intention = String(packetRecord.intention ?? packetRecord.type ?? "").toUpperCase();
      if (intention !== "ATTACK") continue;
      const rawMode = String(details.attackMode ?? packetRecord.woundChannel ?? "PHYSICAL").toUpperCase();
      const threatLane: Mode = rawMode === "MENTAL" ? "MENTAL" : "PHYSICAL";
      const diceCount = Math.max(1, Math.trunc(Number(packetRecord.diceCount ?? powerDiceFallback)));
      const rawPotency = Math.max(1, Number(packetRecord.potency ?? power.potency ?? 1));
      const tableFacingWoundsPerSuccess = strengthToTableWoundsPerSuccess(rawPotency);
      const damageTypeCount = Math.max(1, readStringArray(details.damageTypes).length);
      const expectedSuccessesForPacket = expectedTieredSuccesses({
        dieSides: dieSidesFromDieString(params.monster.attackDie),
        diceCount,
      });
      const contribution =
        expectedSuccessesForPacket *
        tableFacingWoundsPerSuccess *
        Math.max(0, targetMultiplier) *
        Math.max(0, availability) *
        Math.max(0, params.netSuccessMultiplier) *
        damageTypeCount;
      if (threatLane === "MENTAL") {
        out.axisVector.mentalThreat += contribution;
      } else {
        out.axisVector.physicalThreat += contribution;
      }
      out.packetCount += 1;
    }
  }

  if (out.packetCount > 0) {
    out.source = "authored_power_packets";
  } else {
    out.notes.push(
      "No authored ATTACK packet data was supplied to the outcome calculator; resolver-axis power threat remains the fallback.",
    );
  }
  return out;
}

type PressureAreaKind = "SINGLE_TARGET" | "MULTI_TARGET" | "AOE" | "FIELD";

type PressureActionPackage = {
  sourceKind: "natural" | "equipped" | "power";
  sourceId: string | null;
  sourceLabel: string;
  effectFamilies: string[];
  targetCount: number;
  reachCategory: PressureReachCategory;
  areaKind: PressureAreaKind;
  durationKind: string;
  durationTurns: number;
  recurring: boolean;
  cooldownTurns: number;
  availability: number;
  linkedThreatCount: number;
  actionLane: "main" | "power" | "response";
  functionalSignature: string;
};

type PressureComponentValues = {
  targetBreadth: number;
  reach: number;
  areaCoverage: number;
  persistence: number;
  availability: number;
  distinctPackages: number;
  linkedThreats: number;
  actionEconomy: number;
  responseBurden: number;
};

function pressureRangeRank(range: PressureReachCategory): number {
  if (range === "AOE") return 3;
  if (range === "RANGED") return 2;
  return 1;
}

function pressureTargetBreadth(targetCount: number): number {
  const targets = Math.max(0, targetCount);
  return targets > 0 ? 1 + Math.log2(targets) : 0;
}

function pressureAreaCoverage(areaKind: PressureAreaKind): number {
  if (areaKind === "FIELD") return 1.2;
  if (areaKind === "AOE") return 1;
  if (areaKind === "MULTI_TARGET") return 0.35;
  return 0;
}

function getPressureActionsPerTurn(monster: MonsterOutcomeInput): number {
  // This mirrors the current Combat Lab live adapter. Legendary status does not add actions.
  return monster.tier === "BOSS" ? 2 : 1;
}

function getPressurePowerCooldown(
  entry: NonNullable<CanonicalPowerContribution["powers"]>[number],
): number | null {
  return entry.cooldownAuthority?.effectiveCooldownTurns ?? null;
}

function getPressurePacketTargeting(
  power: MonsterUpsertInput["powers"][number],
  packets: MonsterUpsertInput["powers"][number]["intentions"],
): { reachCategory: PressureReachCategory; targetCount: number } {
  let reachCategory = getPowerRangeCategory(power) ?? "MELEE";
  let targetCount = getPowerTargetCount(power, reachCategory);
  for (const packet of packets) {
    const local = packet.localTargetingOverride;
    if (!local) continue;
    let localRange: PressureReachCategory = "MELEE";
    let localTargets = Math.max(1, Number(local.meleeTargets ?? 1));
    if (Number(local.aoeCount ?? 0) > 0) {
      localRange = "AOE";
      localTargets = Math.max(1, Number(local.aoeCount));
    } else if (Number(local.rangedTargets ?? 0) > 0 || Number(local.rangedDistanceFeet ?? 0) > 0) {
      localRange = "RANGED";
      localTargets = Math.max(1, Number(local.rangedTargets ?? 1));
    }
    if (pressureRangeRank(localRange) > pressureRangeRank(reachCategory)) {
      reachCategory = localRange;
    }
    targetCount = Math.max(targetCount, localTargets);
  }
  return { reachCategory, targetCount };
}

function getPressureDuration(
  power: MonsterUpsertInput["powers"][number],
  packets: MonsterUpsertInput["powers"][number]["intentions"],
): { durationKind: string; durationTurns: number; recurring: boolean } {
  const durationRank: Record<string, number> = {
    INSTANT: 0,
    UNTIL_TARGET_NEXT_TURN: 1,
    TURNS: 2,
    PASSIVE: 3,
  };
  let durationKind = String(
    power.effectDurationType ?? power.durationType ?? power.lifespanType ?? "INSTANT",
  ).toUpperCase();
  if (durationKind === "NONE") durationKind = "INSTANT";
  let durationTurns = Math.max(
    0,
    Number(power.effectDurationTurns ?? power.durationTurns ?? power.lifespanTurns ?? 0),
  );
  let recurring = false;
  for (const packet of packets) {
    const packetDuration = String(packet.effectDurationType ?? "INSTANT").toUpperCase();
    if ((durationRank[packetDuration] ?? 0) > (durationRank[durationKind] ?? 0)) {
      durationKind = packetDuration;
    }
    durationTurns = Math.max(durationTurns, Number(packet.effectDurationTurns ?? 0));
    const timing = String(packet.effectTimingType ?? "ON_CAST").toUpperCase();
    recurring = recurring || timing.includes("START_OF_TURN") || timing.includes("END_OF_TURN");
  }
  return { durationKind, durationTurns, recurring };
}

function getPressurePersistenceValue(action: PressureActionPackage): number {
  let value = 0;
  if (action.durationKind === "UNTIL_TARGET_NEXT_TURN") value = 0.35;
  if (action.durationKind === "TURNS") value = Math.min(1, Math.max(1, action.durationTurns) / 3);
  if (action.durationKind === "PASSIVE") value = 1;
  if (action.recurring) value += 0.25;
  if (action.areaKind === "FIELD") value += 0.25;
  return Math.min(1.25, value);
}

function pressureFunctionalSignature(action: Omit<PressureActionPackage, "functionalSignature">): string {
  return [
    action.effectFamilies.join("+"),
    action.targetCount,
    action.reachCategory,
    action.areaKind,
    action.durationKind,
    action.durationTurns,
    action.recurring ? "recurring" : "once",
    action.cooldownTurns,
    action.linkedThreatCount,
    action.actionLane,
  ].join("|");
}

function createPressureActionPackages(params: {
  atWillProfiles: NormalizedAtWillAttackProfile[];
  authoredPowers: MonsterUpsertInput["powers"];
  powerContribution?: CanonicalPowerContribution | null;
}): { packages: PressureActionPackage[]; unsupportedWarnings: string[] } {
  const candidates: PressureActionPackage[] = [];
  const unsupportedWarnings: string[] = [];
  for (const profile of params.atWillProfiles) {
    for (const segment of profile.segments) {
      if (!(segment.authoredStrength > 0) || !(segment.targetCount > 0)) continue;
      const areaKind: PressureAreaKind =
        segment.rangeCategory === "AOE"
          ? "AOE"
          : segment.targetCount > 1
            ? "MULTI_TARGET"
            : "SINGLE_TARGET";
      const base = {
        sourceKind: profile.sourceKind,
        sourceId: profile.sourceId,
        sourceLabel: profile.sourceLabel,
        effectFamilies: ["ATTACK"],
        targetCount: segment.targetCount,
        reachCategory: segment.rangeCategory,
        areaKind,
        durationKind: "INSTANT",
        durationTurns: 0,
        recurring: false,
        cooldownTurns: 0,
        availability: 1,
        linkedThreatCount: 0,
        actionLane: "main" as const,
      };
      candidates.push({ ...base, functionalSignature: pressureFunctionalSignature(base) });
    }
  }

  const powerEntries =
    params.powerContribution?.powers?.length
      ? params.powerContribution.powers
      : params.authoredPowers.map((power) => ({
          id: power.id ?? null,
          name: power.name,
          authoredPower: power,
          cooldownAuthority: power.cooldownAuthority ?? null,
        }));
  for (const entry of powerEntries) {
    const power = entry.authoredPower;
    if (!power) {
      unsupportedWarnings.push(`Power ${entry.name ?? entry.id ?? "unknown"} has no authored shape; omitted from Pressure.`);
      continue;
    }
    const allPackets = power.effectPackets?.length ? power.effectPackets : power.intentions;
    const unsupportedIntentions = allPackets
      .map((packet) => String(packet.intention ?? packet.type).toUpperCase())
      .filter((intention) => intention === "SUMMONING" || intention === "TRANSFORMATION");
    if (unsupportedIntentions.length > 0) {
      unsupportedWarnings.push(
        `Power ${power.name} contains unsupported ${[...new Set(unsupportedIntentions)].join("+")}; those packets do not add Pressure.`,
      );
    }
    const meaningfulPackets = allPackets.filter((packet) => {
      const intention = String(packet.intention ?? packet.type).toUpperCase();
      if (!(["ATTACK", "CONTROL", "DEBUFF"] as string[]).includes(intention)) return false;
      if (packet.hostility === "NON_HOSTILE") return false;
      return Number(packet.potency ?? power.potency ?? 0) > 0 || Number(packet.diceCount ?? power.diceCount ?? 0) > 0;
    });
    if (meaningfulPackets.length === 0) continue;
    const effectFamilies = [...new Set(meaningfulPackets.map((packet) => String(packet.intention).toUpperCase()))].sort();
    if (power.descriptorChassis === "FIELD") effectFamilies.push("FIELD");
    const targeting = getPressurePacketTargeting(power, meaningfulPackets);
    const duration = getPressureDuration(power, meaningfulPackets);
    const linkedThreatCount = meaningfulPackets.slice(1).filter((packet) => {
      const mode = String(packet.secondaryDependencyMode ?? "").toUpperCase();
      return mode.length > 0 && mode !== "INDEPENDENT";
    }).length;
    const cooldownTurns = getPressurePowerCooldown(entry);
    if (cooldownTurns === null) {
      unsupportedWarnings.push(
        `Power ${power.name} has unresolved cooldown authority; omitted from Pressure.`,
      );
      continue;
    }
    const areaKind: PressureAreaKind =
      power.descriptorChassis === "FIELD"
        ? "FIELD"
        : targeting.reachCategory === "AOE"
          ? "AOE"
          : targeting.targetCount > 1
            ? "MULTI_TARGET"
            : "SINGLE_TARGET";
    const base = {
      sourceKind: "power" as const,
      sourceId: entry.id ?? power.id ?? null,
      sourceLabel: entry.name ?? power.name,
      effectFamilies,
      targetCount: targeting.targetCount,
      reachCategory: targeting.reachCategory,
      areaKind,
      durationKind: duration.durationKind,
      durationTurns: duration.durationTurns,
      recurring: duration.recurring,
      cooldownTurns,
      availability: getPowerAvailabilityFactor(cooldownTurns),
      linkedThreatCount,
      actionLane: power.counterMode === "YES" ? ("response" as const) : ("power" as const),
    };
    candidates.push({ ...base, functionalSignature: pressureFunctionalSignature(base) });
  }

  const deduplicated = new Map<string, PressureActionPackage>();
  for (const candidate of candidates) {
    if (!deduplicated.has(candidate.functionalSignature)) {
      deduplicated.set(candidate.functionalSignature, candidate);
    }
  }
  return { packages: [...deduplicated.values()], unsupportedWarnings };
}

function getPressureComponentValues(params: {
  packages: PressureActionPackage[];
  actionsPerTurn: number;
  reachValues: CalculatorConfig["pressureAxisTuning"]["reachValues"];
}): PressureComponentValues {
  const { packages } = params;
  return {
    targetBreadth: Math.max(0, ...packages.map((action) => pressureTargetBreadth(action.targetCount))),
    reach: Math.max(0, ...packages.map((action) => params.reachValues[action.reachCategory])),
    areaCoverage: Math.max(0, ...packages.map((action) => pressureAreaCoverage(action.areaKind))),
    persistence: Math.max(0, ...packages.map(getPressurePersistenceValue)),
    availability:
      packages.length === 0
        ? 0
        : packages.reduce((sum, action) => sum + action.availability, 0) / packages.length,
    distinctPackages: packages.length,
    linkedThreats: packages.reduce((sum, action) => sum + action.linkedThreatCount, 0),
    actionEconomy: params.actionsPerTurn,
    responseBurden: 0,
  };
}

function getPressureBaselineComponentValues(
  baseline: PressureBaselinePackage,
  reachValues: CalculatorConfig["pressureAxisTuning"]["reachValues"],
): PressureComponentValues {
  return {
    targetBreadth: pressureTargetBreadth(baseline.expectedTargetCount),
    reach: reachValues[baseline.expectedReachCategory],
    areaCoverage: baseline.expectedAreaCoverage,
    persistence: baseline.expectedPersistence,
    availability: baseline.expectedAvailability,
    distinctPackages: baseline.expectedDistinctMeaningfulPackages,
    linkedThreats: baseline.expectedLinkedThreats,
    actionEconomy: baseline.expectedActionsPerTurn,
    responseBurden: baseline.expectedResponseBurden,
  };
}

function getPressureProxy(
  values: PressureComponentValues,
  tuning: CalculatorConfig["pressureAxisTuning"],
): { proxy: number; weightedComponents: PressureComponentValues } {
  const keys = Object.keys(tuning.componentWeights) as Array<keyof PressureComponentValues>;
  const weightedComponents = {} as PressureComponentValues;
  let proxy = 0;
  for (const key of keys) {
    const cap = Math.max(0.000001, tuning.componentCaps[key]);
    const weighted = Math.max(0, tuning.componentWeights[key]) * Math.min(1, Math.max(0, values[key]) / cap);
    weightedComponents[key] = weighted;
    proxy += weighted;
  }
  return { proxy, weightedComponents };
}

function buildPressureAxisBaselineModel(params: {
  monster: MonsterOutcomeInput;
  config: CalculatorConfig;
  atWillProfiles: NormalizedAtWillAttackProfile[];
  powerContribution?: CanonicalPowerContribution | null;
  legacyPresenceRaw: number;
  excludedLegacyBonuses: Record<string, number>;
}) {
  const tuning = params.config.pressureAxisTuning;
  const level = Math.max(1, Math.trunc(params.monster.level || 1));
  const baseline = tuning.baselines.find(
    (entry) =>
      entry.level === level &&
      entry.tier === params.monster.tier &&
      entry.legendary === Boolean(params.monster.legendary),
  );
  const actionResult = createPressureActionPackages({
    atWillProfiles: params.atWillProfiles,
    authoredPowers: params.monster.powers ?? [],
    powerContribution: params.powerContribution,
  });
  const actionsPerTurn = getPressureActionsPerTurn(params.monster);
  const actualComponents = getPressureComponentValues({
    packages: actionResult.packages,
    actionsPerTurn,
    reachValues: tuning.reachValues,
  });
  if (!baseline) {
    return {
      policy: "pressure_axis_breadth_persistence_v1",
      mode: tuning.nonCalibratedFallbackMode,
      calibrated: false,
      baselinePackageId: null,
      actionPackagesConsidered: actionResult.packages,
      deduplicatedFunctionalSignatures: actionResult.packages.map((action) => action.functionalSignature),
      meaningfulActionCount: actionResult.packages.length,
      components: actualComponents,
      weightedActualComponents: null,
      weightedBaselineComponents: null,
      unsupportedPackageWarnings: actionResult.unsupportedWarnings,
      responseBurdenOmissionReason:
        "No static authored field proves enemy response expenditure; runtime response use is not inferred from damage or cost.",
      traitEquipmentContribution: {
        applied: 0,
        excludedLegacyBonuses: params.excludedLegacyBonuses,
        reason: "Generic Presence weights do not prove encounter breadth or persistence.",
      },
      rawActualPressureProxy: params.legacyPresenceRaw,
      rawBaselinePressureProxy: null,
      ratioToBaseline: null,
      uncappedScore: null,
      finalScore: null,
      capped: false,
      capReason: null,
      fallbackPolicy:
        "Non-Level-3 packages retain the legacy Presence curve because no accepted baseline package exists.",
    };
  }
  const baselineComponents = getPressureBaselineComponentValues(baseline, tuning.reachValues);
  const actualProxy = getPressureProxy(actualComponents, tuning);
  const baselineProxy = getPressureProxy(baselineComponents, tuning);
  const ratio = baselineProxy.proxy > 0 ? actualProxy.proxy / baselineProxy.proxy : 0;
  const uncappedScore =
    actualProxy.proxy > 0 && ratio > 0
      ? tuning.midpointScore + Math.log2(ratio) * tuning.logRatioScale
      : 0;
  const finalScore = clampRadarScore(uncappedScore);
  return {
    policy: "pressure_axis_breadth_persistence_v1",
    mode: "LEVEL_3_BASELINE_RELATIVE",
    calibrated: true,
    baselinePackageId: baseline.id,
    baselinePackage: baseline,
    actionPackagesConsidered: actionResult.packages,
    deduplicatedFunctionalSignatures: actionResult.packages.map((action) => action.functionalSignature),
    meaningfulActionCount: actionResult.packages.length,
    components: actualComponents,
    baselineComponents,
    weightedActualComponents: actualProxy.weightedComponents,
    weightedBaselineComponents: baselineProxy.weightedComponents,
    unsupportedPackageWarnings: actionResult.unsupportedWarnings,
    responseBurdenOmissionReason:
      "No static authored field proves enemy response expenditure; runtime response use is not inferred from damage or cost.",
    traitEquipmentContribution: {
      applied: 0,
      excludedLegacyBonuses: params.excludedLegacyBonuses,
      reason: "Generic Presence weights do not prove encounter breadth or persistence.",
    },
    rawActualPressureProxy: actualProxy.proxy,
    rawBaselinePressureProxy: baselineProxy.proxy,
    ratioToBaseline: ratio,
    uncappedScore,
    finalScore,
    capped: finalScore !== uncappedScore,
    capReason: finalScore !== uncappedScore ? (uncappedScore > 10 ? "MAX_10" : "MIN_0") : null,
    fallbackPolicy: null,
  };
}

type ControlPressureEffectFamily =
  | "FORCED_MOVEMENT"
  | "MOVEMENT_DENIAL"
  | "MAIN_ACTION_DENIAL"
  | "ATTRIBUTE_DEBUFF"
  | "DEFENCE_DEBUFF";

type ControlPressureAvailabilityBand = "AT_WILL" | "SHORT" | "MEDIUM" | "LONG" | "UNKNOWN";

type SemanticControlPackage = {
  sourcePowerId: string | null;
  sourcePowerName: string;
  packetIndex: number;
  effectFamily: ControlPressureEffectFamily;
  runtimeSemanticMode: "forcedMovementApplied" | "movementDenied" | "mainActionDenied" | "attributeModifier";
  affectedAttribute: string | null;
  targetBreadth: number;
  targetCount: number;
  durationKind: "INSTANT" | "TURNS" | "PASSIVE" | "UNTIL_TARGET_NEXT_TURN";
  durationTurns: number;
  durationContribution: number;
  recurrence: boolean;
  recurrenceContribution: number;
  effectSeverity: number;
  supportedStackImpact: number;
  cooldownTurns: number | null;
  availabilityBand: ControlPressureAvailabilityBand;
  availabilityContribution: number;
  resistibility: ControlPressureResistibility;
  resistGateCategory: CoreAttribute | null;
  reliabilityContribution: number;
  dependencyMode: string;
  linked: boolean;
  linkedContribution: number;
  unsupportedAuthoringDistinctions: string[];
  functionalSignature: string;
};

type ControlPressureComponentValues = {
  effectSeverity: number;
  targetBreadth: number;
  duration: number;
  recurrence: number;
  availability: number;
  supportedStackImpact: number;
  distinctPackages: number;
  actionEconomy: number;
  reliability: number;
  linkedRelationships: number;
};

const CONTROL_PRESSURE_ATTRIBUTES = [
  "Attack",
  "Guard",
  "Fortitude",
  "Intellect",
  "Synergy",
  "Bravery",
] as const;

function controlPressureRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function controlPressureAttribute(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "DEFENCE" || normalized === "DEFENSE" || normalized === "GUARD") return "Guard";
  if (normalized === "SUPPORT" || normalized === "SYNERGY") return "Synergy";
  return CONTROL_PRESSURE_ATTRIBUTES.find((attribute) => attribute.toUpperCase() === normalized) ?? null;
}

function controlPressureTargeting(
  power: MonsterUpsertInput["powers"][number],
  packet: MonsterUpsertInput["powers"][number]["intentions"][number],
): { targetCount: number; targetBreadth: number } {
  const local = packet.localTargetingOverride;
  let range = getPowerRangeCategory(power) ?? "MELEE";
  let targetCount = getPowerTargetCount(power, range);
  if (local) {
    if (Number(local.aoeCount ?? 0) > 0) {
      range = "AOE";
      targetCount = Math.max(1, Number(local.aoeCount));
    } else if (Number(local.rangedTargets ?? 0) > 0 || Number(local.rangedDistanceFeet ?? 0) > 0) {
      range = "RANGED";
      targetCount = Math.max(1, Number(local.rangedTargets ?? 1));
    } else if (Number(local.meleeTargets ?? 0) > 0) {
      targetCount = Math.max(1, Number(local.meleeTargets));
    }
  }
  const boundedTargets = Math.max(1, Math.min(12, Math.trunc(targetCount)));
  return {
    targetCount: boundedTargets,
    targetBreadth: 1 + Math.log2(boundedTargets),
  };
}

function controlPressureDuration(
  power: MonsterUpsertInput["powers"][number],
  packet: MonsterUpsertInput["powers"][number]["intentions"][number],
): {
  durationKind: SemanticControlPackage["durationKind"];
  durationTurns: number;
  durationContribution: number;
  recurrence: boolean;
  recurrenceContribution: number;
} {
  const rawKind = String(packet.effectDurationType ?? "INSTANT").toUpperCase();
  const durationKind: SemanticControlPackage["durationKind"] =
    rawKind === "TURNS" || rawKind === "PASSIVE" || rawKind === "UNTIL_TARGET_NEXT_TURN"
      ? rawKind
      : "INSTANT";
  const packetTurns = Math.max(1, Math.trunc(Number(packet.effectDurationTurns ?? 1)));
  const durationTurns =
    power.descriptorChassis === "FIELD"
      ? Math.max(1, Math.trunc(Number(power.lifespanTurns ?? packetTurns)))
      : durationKind === "PASSIVE"
        ? 99
        : durationKind === "UNTIL_TARGET_NEXT_TURN"
          ? 1
          : durationKind === "TURNS"
            ? packetTurns
            : 1;
  const durationContribution =
    durationKind === "PASSIVE"
      ? 2
      : durationKind === "TURNS"
        ? Math.min(2, 1 + 0.4 * Math.max(0, durationTurns - 1))
        : 1;
  const timing = String(packet.effectTimingType ?? "ON_CAST").toUpperCase();
  const recurrence =
    durationKind === "TURNS" &&
    (timing === "START_OF_TURN" || timing === "START_OF_TURN_WHILST_CHANNELLED");
  return {
    durationKind,
    durationTurns,
    durationContribution,
    recurrence,
    recurrenceContribution: recurrence ? Math.min(1, durationTurns / 2) : 0,
  };
}

function controlPressureAvailability(cooldownTurns: number | null): {
  band: ControlPressureAvailabilityBand;
  contribution: number;
} {
  if (cooldownTurns === null) return { band: "UNKNOWN", contribution: 0.65 };
  if (cooldownTurns <= 0) return { band: "AT_WILL", contribution: 1 };
  if (cooldownTurns <= 2) {
    return { band: "SHORT", contribution: cooldownTurns === 1 ? 0.9 : 0.75 };
  }
  if (cooldownTurns === 3) return { band: "MEDIUM", contribution: 0.6 };
  return { band: "LONG", contribution: Math.max(0.25, 0.55 - cooldownTurns * 0.05) };
}

function controlPressureFunctionalSignature(
  value: Omit<SemanticControlPackage, "functionalSignature" | "sourcePowerId" | "sourcePowerName" | "packetIndex">,
): string {
  return [
    value.effectFamily,
    value.runtimeSemanticMode,
    value.affectedAttribute ?? "none",
    value.targetCount,
    value.durationKind,
    value.durationTurns,
    value.recurrence ? "recurring" : "once",
    value.availabilityBand,
    value.resistibility,
    value.dependencyMode,
  ].join("|");
}

function createSemanticControlPackages(params: {
  monster: MonsterOutcomeInput;
  powerContribution?: CanonicalPowerContribution | null;
  reliabilityValues: CalculatorConfig["controlPressureAxisTuning"]["reliabilityValues"];
}): {
  candidates: SemanticControlPackage[];
  packages: SemanticControlPackage[];
  duplicateSignatures: string[];
  unsupportedWarnings: string[];
} {
  const candidates: SemanticControlPackage[] = [];
  const unsupportedWarnings: string[] = [];
  const entries = params.powerContribution?.powers?.length
    ? params.powerContribution.powers
    : (params.monster.powers ?? []).map((power) => ({
        id: power.id ?? null,
        name: power.name,
        authoredPower: power,
        cooldownAuthority: power.cooldownAuthority ?? null,
      }));

  for (const entry of entries) {
    const power = entry.authoredPower;
    if (!power) {
      unsupportedWarnings.push(`Power ${entry.name ?? entry.id ?? "unknown"} has no authored packet shape; omitted from Control Pressure.`);
      continue;
    }
    if (power.descriptorChassis && power.descriptorChassis !== "IMMEDIATE" && power.descriptorChassis !== "FIELD") {
      unsupportedWarnings.push(`Power ${power.name} uses unsupported Combat Lab chassis ${power.descriptorChassis}; omitted from Control Pressure.`);
      continue;
    }
    const packets = power.effectPackets?.length ? power.effectPackets : power.intentions;
    const cooldownTurns = getPressurePowerCooldown(entry);
    if (cooldownTurns === null) {
      unsupportedWarnings.push(
        `Power ${power.name} has unresolved cooldown authority; omitted from Control Pressure.`,
      );
      continue;
    }
    const availability = controlPressureAvailability(cooldownTurns);
    for (const [packetOffset, packet] of packets.entries()) {
      if (packet.hostility === "NON_HOSTILE") continue;
      const intention = String(packet.intention ?? packet.type).toUpperCase();
      if (!(["CONTROL", "DEBUFF", "MOVEMENT"] as string[]).includes(intention)) continue;
      const details = controlPressureRecord(packet.detailsJson);
      const timing = String(packet.effectTimingType ?? "ON_CAST").toUpperCase();
      const durationKind = String(packet.effectDurationType ?? "INSTANT").toUpperCase();
      if (intention === "DEBUFF" && packet.modifier !== null && packet.modifier !== undefined) {
        continue;
      }
      const supportedRecurringTiming =
        durationKind === "TURNS" &&
        (timing === "START_OF_TURN" || timing === "START_OF_TURN_WHILST_CHANNELLED");
      const supportedFieldTiming = power.descriptorChassis === "FIELD" && timing === "START_OF_TURN";
      if (timing !== "ON_CAST" && !supportedRecurringTiming && !supportedFieldTiming) {
        unsupportedWarnings.push(`Power ${power.name} packet ${packet.packetIndex ?? packetOffset} timing ${timing} is not resolved by Combat Lab V1; omitted from Control Pressure.`);
        continue;
      }

      let effectFamily: ControlPressureEffectFamily;
      let runtimeSemanticMode: SemanticControlPackage["runtimeSemanticMode"];
      let affectedAttribute: string | null = null;
      let effectSeverity: number;
      let supportedStackImpact: number;
      const unsupportedAuthoringDistinctions: string[] = [];
      if (intention === "CONTROL") {
        const authoredMode = String(details.controlMode ?? "unspecified");
        if (authoredMode.toLowerCase() === "force no move") {
          effectFamily = "MOVEMENT_DENIAL";
          runtimeSemanticMode = "movementDenied";
          effectSeverity = 2;
          supportedStackImpact = 1;
          const warning = "Force no move uses categorical movement-denial severity; Dice Count and Potency do not add magnitude scaling.";
          unsupportedAuthoringDistinctions.push(warning);
          unsupportedWarnings.push(`Power ${power.name} packet ${packet.packetIndex ?? packetOffset}: ${warning}`);
        } else {
          effectFamily = "MAIN_ACTION_DENIAL";
          runtimeSemanticMode = "mainActionDenied";
          effectSeverity = 3;
          supportedStackImpact = 1;
        }
        if (
          authoredMode.toLowerCase() !== "force no move" &&
          authoredMode.toLowerCase() !== "force no main action"
        ) {
          const warning = `${authoredMode} collapses to the same runtime mainActionDenied behaviour; no distinct severity was awarded.`;
          unsupportedAuthoringDistinctions.push(warning);
          unsupportedWarnings.push(`Power ${power.name} packet ${packet.packetIndex ?? packetOffset}: ${warning}`);
        }
      } else if (intention === "DEBUFF") {
        affectedAttribute = controlPressureAttribute(
          packet.targetedAttribute ?? details.statTarget ?? details.statChoice ?? packet.specific,
        );
        if (!affectedAttribute) {
          unsupportedWarnings.push(`Power ${power.name} packet ${packet.packetIndex ?? packetOffset} Debuff has no runtime-supported target attribute; omitted from Control Pressure.`);
          continue;
        }
        effectFamily = affectedAttribute === "Guard" ? "DEFENCE_DEBUFF" : "ATTRIBUTE_DEBUFF";
        runtimeSemanticMode = "attributeModifier";
        effectSeverity = 2;
        supportedStackImpact = Math.min(2, Math.max(1, Math.trunc(Number(packet.potency ?? power.potency ?? 1))));
      } else {
        const movementMode = String(details.movementMode ?? "");
        if (!movementMode.toUpperCase().startsWith("FORCE ")) {
          unsupportedWarnings.push(`Power ${power.name} packet ${packet.packetIndex ?? packetOffset} Movement is not a hostile forced-movement mode; omitted from Control Pressure.`);
          continue;
        }
        effectFamily = "FORCED_MOVEMENT";
        runtimeSemanticMode = "forcedMovementApplied";
        effectSeverity = 1;
        supportedStackImpact = 1;
      }
      const targeting = controlPressureTargeting(power, packet);
      const duration = controlPressureDuration(power, packet);
      const gateResult = String(power.primaryDefenceGate?.gateResult ?? "NONE").toUpperCase();
      const resistibility: ControlPressureResistibility =
        gateResult === "RESIST" ? "RESISTED" : gateResult === "NONE" ? "UNRESISTED" : "UNKNOWN";
      const resistGateCategory =
        resistibility === "RESISTED" ? (power.primaryDefenceGate?.resistAttribute ?? null) : null;
      const dependencyMode =
        (packet.packetIndex ?? packet.sortOrder ?? packetOffset) <= 0
          ? "PRIMARY"
          : String(packet.secondaryDependencyMode ?? "LINKED_TO_PRIMARY").toUpperCase();
      const linked = dependencyMode !== "PRIMARY" && dependencyMode !== "INDEPENDENT";
      const base = {
        effectFamily,
        runtimeSemanticMode,
        affectedAttribute,
        targetBreadth: targeting.targetBreadth,
        targetCount: targeting.targetCount,
        durationKind: duration.durationKind,
        durationTurns: duration.durationTurns,
        durationContribution: duration.durationContribution,
        recurrence: duration.recurrence,
        recurrenceContribution: duration.recurrenceContribution,
        effectSeverity,
        supportedStackImpact,
        cooldownTurns,
        availabilityBand: availability.band,
        availabilityContribution: availability.contribution,
        resistibility,
        resistGateCategory,
        reliabilityContribution: params.reliabilityValues[resistibility],
        dependencyMode,
        linked,
        linkedContribution: linked ? 1 : 0,
        unsupportedAuthoringDistinctions,
      };
      candidates.push({
        sourcePowerId: entry.id ?? power.id ?? null,
        sourcePowerName: entry.name ?? power.name,
        packetIndex: packet.packetIndex ?? packetOffset,
        ...base,
        functionalSignature: controlPressureFunctionalSignature(base),
      });
    }
  }

  const signatures = new Map<string, SemanticControlPackage>();
  const duplicateSignatures: string[] = [];
  for (const candidate of candidates) {
    if (signatures.has(candidate.functionalSignature)) {
      duplicateSignatures.push(candidate.functionalSignature);
    } else {
      signatures.set(candidate.functionalSignature, candidate);
    }
  }
  return {
    candidates,
    packages: [...signatures.values()],
    duplicateSignatures,
    unsupportedWarnings,
  };
}

function controlPressureOverlapKey(value: SemanticControlPackage): string {
  return [value.effectFamily, value.runtimeSemanticMode, value.affectedAttribute ?? "none"].join("|");
}

function getControlPressureComponents(
  packages: SemanticControlPackage[],
  actionsPerTurn: number,
): { values: ControlPressureComponentValues; overlapHandling: Array<{ signature: string; factor: number }> } {
  const overlaps = new Map<string, number>();
  const values: ControlPressureComponentValues = {
    effectSeverity: 0,
    targetBreadth: 0,
    duration: 0,
    recurrence: 0,
    availability: 0,
    supportedStackImpact: 0,
    distinctPackages: 0,
    actionEconomy: packages.length > 0 ? actionsPerTurn : 0,
    reliability: 0,
    linkedRelationships: 0,
  };
  const overlapHandling = packages.map((controlPackage) => {
    const key = controlPressureOverlapKey(controlPackage);
    const previous = overlaps.get(key) ?? 0;
    const factor = previous === 0 ? 1 : Math.max(0.35, 0.6 ** previous);
    overlaps.set(key, previous + 1);
    values.effectSeverity += controlPackage.effectSeverity * factor;
    values.targetBreadth += controlPackage.targetBreadth * factor;
    values.duration += controlPackage.durationContribution * factor;
    values.recurrence += controlPackage.recurrenceContribution * factor;
    values.availability += controlPackage.availabilityContribution * factor;
    values.supportedStackImpact += controlPackage.supportedStackImpact * factor;
    values.distinctPackages += factor;
    values.reliability += controlPackage.reliabilityContribution * factor;
    values.linkedRelationships += controlPackage.linkedContribution * factor;
    return { signature: controlPackage.functionalSignature, factor };
  });
  return { values, overlapHandling };
}

function getControlPressureBaselineComponents(
  baseline: ControlPressureBaselinePackage,
): ControlPressureComponentValues {
  return {
    effectSeverity: baseline.expectedEffectSeverity,
    targetBreadth: baseline.expectedTargetBreadth,
    duration: baseline.expectedDuration,
    recurrence: baseline.expectedRecurrence,
    availability: baseline.expectedAvailability,
    supportedStackImpact: baseline.expectedSupportedStackImpact,
    distinctPackages: baseline.expectedPackageCount,
    actionEconomy: baseline.expectedActionsPerTurn,
    reliability: baseline.expectedReliability,
    linkedRelationships: baseline.expectedLinkedRelationships,
  };
}

function getControlPressureProxy(
  values: ControlPressureComponentValues,
  tuning: CalculatorConfig["controlPressureAxisTuning"],
) {
  const keys = Object.keys(tuning.componentWeights) as Array<keyof ControlPressureComponentValues>;
  const weightedComponents = {} as ControlPressureComponentValues;
  let proxy = 0;
  for (const key of keys) {
    const cap = Math.max(0.000001, tuning.componentCaps[key]);
    const contribution =
      Math.max(0, tuning.componentWeights[key]) * Math.min(1, Math.max(0, values[key]) / cap);
    weightedComponents[key] = contribution;
    proxy += contribution;
  }
  return { proxy, weightedComponents };
}

type NewFormatDebuffControlRejection = {
  code: string;
  powerId: string | null;
  powerName: string;
  packetIndex: number | null;
  reason: string;
};

type NewFormatDebuffControlPowerPackage = {
  powerId: string | null;
  powerName: string;
  packetEvaluations: PacketDeliveryEvaluation[];
  aggregateDeliveryUnits: number;
  attributeDeliveryUnits: Record<string, number>;
  affectedAttributes: string[];
  cooldownTurns: number;
  cooldownAuthoritySource: string;
  availability: number;
  actionCost: 1;
  demand: number;
  overlapFactor: number;
  overlapAdjustedDeliveryUnits: number;
  deliveredProxy: number;
  duplicateSignature: string;
};

type NewFormatDebuffControlExtraction = {
  detectedPacketCount: number;
  candidatePowerPackages: NewFormatDebuffControlPowerPackage[];
  powerPackages: NewFormatDebuffControlPowerPackage[];
  exactDuplicateSignaturesRemoved: string[];
  rejections: NewFormatDebuffControlRejection[];
};

function powerContainsNewFormatDebuff(
  power: MonsterUpsertInput["powers"][number] | null | undefined,
): boolean {
  if (!power) return false;
  const packets = power.effectPackets?.length ? power.effectPackets : power.intentions;
  return packets.some(
    (packet) =>
      String(packet.intention ?? packet.type).toUpperCase() === "DEBUFF" &&
      packet.modifier !== null &&
      packet.modifier !== undefined,
  );
}

function newFormatDebuffSourceDieSides(value: unknown): IncarnateDieSides | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "D4") return 4;
  if (normalized === "D6") return 6;
  if (normalized === "D8") return 8;
  if (normalized === "D10") return 10;
  if (normalized === "D12") return 12;
  return null;
}

function newFormatDebuffDuration(
  power: MonsterUpsertInput["powers"][number],
  packet: MonsterUpsertInput["powers"][number]["intentions"][number],
): { duration: EconomicDuration; recurring: boolean } | null {
  const durationKind = String(
    packet.effectDurationType ?? power.effectDurationType ?? power.durationType ?? "INSTANT",
  ).toUpperCase();
  const timing = String(packet.effectTimingType ?? "ON_CAST").toUpperCase();
  const recurring =
    timing === "START_OF_TURN" || timing === "START_OF_TURN_WHILST_CHANNELLED";
  if (timing !== "ON_CAST" && !recurring) return null;
  if (durationKind === "PASSIVE") return { duration: { kind: "PASSIVE" }, recurring: false };
  if (durationKind === "UNTIL_TARGET_NEXT_TURN") {
    return { duration: { kind: "UNTIL_TARGET_NEXT_TURN" }, recurring: false };
  }
  if (durationKind === "INSTANT") {
    return { duration: { kind: "TURNS", turns: 1 }, recurring: false };
  }
  if (durationKind !== "TURNS") return null;
  const turns = Number(packet.effectDurationTurns ?? power.effectDurationTurns ?? power.durationTurns);
  if (!Number.isInteger(turns) || turns < 1 || turns > 4) return null;
  return {
    duration: { kind: "TURNS", turns: turns as 1 | 2 | 3 | 4 },
    recurring,
  };
}

function newFormatDebuffTargeting(
  power: MonsterUpsertInput["powers"][number],
  packet: MonsterUpsertInput["powers"][number]["intentions"][number],
): { expectedTargetCount: number; targetBucket: string } | null {
  const local = packet.localTargetingOverride;
  let range: "MELEE" | "RANGED" | "AOE" | null = null;
  let rawTargets: unknown = null;
  if (local && Number(local.aoeCount) > 0) {
    range = "AOE";
    rawTargets = local.aoeCount;
  } else if (
    local &&
    (Number(local.rangedTargets) > 0 || Number(local.rangedDistanceFeet) > 0)
  ) {
    range = "RANGED";
    rawTargets = local.rangedTargets;
  } else if (local && Number(local.meleeTargets) > 0) {
    range = "MELEE";
    rawTargets = local.meleeTargets;
  } else {
    range = getPowerRangeCategory(power);
    rawTargets =
      range === "AOE"
        ? power.aoeCount
        : range === "RANGED"
          ? power.rangedTargets
          : range === "MELEE"
            ? power.meleeTargets
            : null;
  }
  const expectedTargetCount = Number(rawTargets);
  if (
    range === null ||
    !Number.isFinite(expectedTargetCount) ||
    expectedTargetCount <= 0
  ) {
    return null;
  }
  return {
    expectedTargetCount,
    targetBucket: `${packet.applyTo ?? "PRIMARY_TARGET"}:${range}:${expectedTargetCount}`,
  };
}

function newFormatDebuffPacketSignature(
  evaluation: PacketDeliveryEvaluation,
): string {
  const input = evaluation.input;
  return JSON.stringify({
    family: input.family,
    attribute: input.attribute,
    targetBucket: input.targetBucket,
    diceCount: input.diceCount,
    potency: input.potency,
    modifier: input.modifier,
    duration: input.duration,
    recurring: input.recurring,
    expectedTargetCount: input.expectedTargetCount,
    resolutionMode: input.resolution.mode,
    dependencyId:
      input.resolution.mode === "LINKED" ? "PRIMARY_PACKET" : null,
    sourceDieSides: input.sourceDieSides ?? null,
  });
}

function createNewFormatDebuffControlPackages(params: {
  monster: MonsterOutcomeInput;
  powerContribution?: CanonicalPowerContribution | null;
  supportedLevel: number;
}): NewFormatDebuffControlExtraction {
  const candidatePowerPackages: NewFormatDebuffControlPowerPackage[] = [];
  const rejections: NewFormatDebuffControlRejection[] = [];
  let detectedPacketCount = 0;
  const sourceDieSides = newFormatDebuffSourceDieSides(params.monster.attackDie);
  const entries = params.powerContribution?.powers?.length
    ? params.powerContribution.powers
    : (params.monster.powers ?? []).map((power) => ({
        id: power.id ?? null,
        name: power.name,
        authoredPower: power,
        cooldownAuthority: power.cooldownAuthority ?? null,
      }));

  const reject = (
    entry: NonNullable<CanonicalPowerContribution["powers"]>[number],
    packetIndex: number | null,
    code: string,
    reason: string,
  ) => {
    rejections.push({
      code,
      powerId: entry.id ?? null,
      powerName: entry.name ?? entry.authoredPower?.name ?? "unknown",
      packetIndex,
      reason,
    });
  };

  for (const entry of entries) {
    const power = entry.authoredPower;
    if (!power) continue;
    const packets = power.effectPackets?.length ? power.effectPackets : power.intentions;
    const newFormatPackets = packets.filter(
      (packet) =>
        String(packet.intention ?? packet.type).toUpperCase() === "DEBUFF" &&
        packet.modifier !== null &&
        packet.modifier !== undefined,
    );
    if (newFormatPackets.length === 0) continue;
    detectedPacketCount += newFormatPackets.length;

    if (Math.max(1, Math.trunc(params.monster.level || 1)) !== params.supportedLevel) {
      for (const packet of newFormatPackets) {
        reject(
          entry,
          packet.packetIndex ?? packet.sortOrder,
          "NEW_FORMAT_DEBUFF_CONTROL_BASELINE_UNAVAILABLE_FOR_LEVEL",
          `New-format Debuff Control supports Level ${params.supportedLevel} only.`,
        );
      }
      continue;
    }
    if (sourceDieSides === null) {
      for (const packet of newFormatPackets) {
        reject(
          entry,
          packet.packetIndex ?? packet.sortOrder,
          "NEW_FORMAT_DEBUFF_CONTROL_SOURCE_DIE_UNRESOLVED",
          `Attack die ${String(params.monster.attackDie)} is not supported.`,
        );
      }
      continue;
    }
    const cooldownTurns = getPressurePowerCooldown(entry);
    if (cooldownTurns === null) {
      for (const packet of newFormatPackets) {
        reject(
          entry,
          packet.packetIndex ?? packet.sortOrder,
          "NEW_FORMAT_DEBUFF_CONTROL_COOLDOWN_AUTHORITY_UNRESOLVED",
          "Current authoritative cooldown is unresolved; stored cooldown was not used.",
        );
      }
      continue;
    }

    const independentEvaluations: PacketDeliveryEvaluation[] = [];
    const linkedPackets: Array<{
      packet: (typeof newFormatPackets)[number];
      packetId: string;
      attribute: string;
      duration: { duration: EconomicDuration; recurring: boolean };
      targeting: { expectedTargetCount: number; targetBucket: string };
      modifier: 1 | 2 | 3 | 4 | 5;
    }> = [];
    let powerRejected = false;
    const seenPacketSignatures = new Set<string>();
    const primaryPacketId = `${entry.id ?? power.name}:new-format-primary`;

    for (const [packetOffset, packet] of newFormatPackets.entries()) {
      const packetIndex = packet.packetIndex ?? packet.sortOrder ?? packetOffset;
      const modifier = Number(packet.modifier);
      if (!Number.isInteger(modifier) || modifier < 1 || modifier > 5) {
        reject(
          entry,
          packetIndex,
          "NEW_FORMAT_DEBUFF_CONTROL_MODIFIER_UNSUPPORTED",
          "Modifier must be an integer from 1 through 5.",
        );
        powerRejected = true;
        continue;
      }
      const attribute = controlPressureAttribute(
        packet.targetedAttribute ??
          controlPressureRecord(packet.detailsJson).statTarget ??
          controlPressureRecord(packet.detailsJson).statChoice ??
          packet.specific,
      );
      if (!attribute) {
        reject(
          entry,
          packetIndex,
          "NEW_FORMAT_DEBUFF_CONTROL_ATTRIBUTE_UNRESOLVED",
          "Debuff target attribute is unresolved.",
        );
        powerRejected = true;
        continue;
      }
      const duration = newFormatDebuffDuration(power, packet);
      if (!duration) {
        reject(
          entry,
          packetIndex,
          "NEW_FORMAT_DEBUFF_CONTROL_DURATION_OR_TIMING_UNSUPPORTED",
          "Duration or timing cannot be represented by the four-turn semantic horizon.",
        );
        powerRejected = true;
        continue;
      }
      const targeting = newFormatDebuffTargeting(power, packet);
      if (!targeting) {
        reject(
          entry,
          packetIndex,
          "NEW_FORMAT_DEBUFF_CONTROL_TARGET_COUNT_UNRESOLVED",
          "An explicit positive expected-target count is required.",
        );
        powerRejected = true;
        continue;
      }
      const dependencyMode =
        packetIndex <= 0
          ? "PRIMARY"
          : String(packet.secondaryDependencyMode ?? "LINKED_TO_PRIMARY").toUpperCase();
      if (
        dependencyMode === "DEPENDENT_SEQUENTIAL" ||
        dependencyMode === "TRIGGERED_CONDITIONAL"
      ) {
        reject(
          entry,
          packetIndex,
          "NEW_FORMAT_DEBUFF_CONTROL_DEPENDENCY_UNSUPPORTED",
          `Dependency mode ${dependencyMode} has no safe target-local correlation model.`,
        );
        powerRejected = true;
        continue;
      }
      const packetId =
        dependencyMode === "PRIMARY"
          ? primaryPacketId
          : `${entry.id ?? power.name}:new-format:${packetIndex}`;
      const signature = JSON.stringify({
        attribute,
        duration,
        targeting,
        diceCount: packet.diceCount ?? power.diceCount,
        potency: packet.potency ?? power.potency,
        modifier,
        dependencyMode,
      });
      if (seenPacketSignatures.has(signature)) continue;
      seenPacketSignatures.add(signature);

      const diceCount = Number(packet.diceCount ?? power.diceCount);
      const potency = Number(packet.potency ?? power.potency);
      if (
        !Number.isInteger(diceCount) ||
        diceCount < 1 ||
        diceCount > 20 ||
        !Number.isInteger(potency) ||
        potency < 1 ||
        potency > 20
      ) {
        reject(
          entry,
          packetIndex,
          "NEW_FORMAT_DEBUFF_CONTROL_SEMANTIC_INPUT_UNSUPPORTED",
          "Dice Count and Potency must be integers from 1 through 20.",
        );
        powerRejected = true;
        continue;
      }

      if (dependencyMode === "LINKED_TO_PRIMARY") {
        linkedPackets.push({
          packet,
          packetId,
          attribute,
          duration,
          targeting,
          modifier: modifier as 1 | 2 | 3 | 4 | 5,
        });
        continue;
      }
      const evaluation = evaluateAugmentDebuffPacket({
        id: packetId,
        family: "DEBUFF",
        attribute,
        targetBucket: targeting.targetBucket,
        diceCount,
        potency,
        modifier: modifier as 1 | 2 | 3 | 4 | 5,
        duration: duration.duration,
        recurring: duration.recurring,
        expectedTargetCount: targeting.expectedTargetCount,
        resolution: { mode: "INDEPENDENT", correlationId: packetId },
        sourceDieSides,
        resistSuccessDistribution: createMatchedReferenceResistDistribution(),
        retainedShellInputs: {
          sourceAttribute: "Attack",
          sourcePowerId: entry.id ?? null,
          sourcePacketIndex: packetIndex,
        },
      });
      independentEvaluations.push(evaluation);
    }

    if (powerRejected) continue;
    const primaryEvaluation = independentEvaluations[0];
    if (linkedPackets.length > 0 && !primaryEvaluation) {
      for (const linked of linkedPackets) {
        reject(
          entry,
          linked.packet.packetIndex ?? linked.packet.sortOrder,
          "NEW_FORMAT_DEBUFF_CONTROL_CORRELATION_UNRESOLVED",
          "Linked Debuff has no supported independent primary distribution.",
        );
      }
      continue;
    }
    const evaluations = [...independentEvaluations];
    for (const linked of linkedPackets) {
      const packetIndex = linked.packet.packetIndex ?? linked.packet.sortOrder;
      evaluations.push(
        evaluateAugmentDebuffPacket({
          id: linked.packetId,
          family: "DEBUFF",
          attribute: linked.attribute,
          targetBucket: linked.targeting.targetBucket,
          diceCount: Math.trunc(Number(linked.packet.diceCount ?? power.diceCount)),
          potency: Math.trunc(Number(linked.packet.potency ?? power.potency)),
          modifier: linked.modifier,
          duration: linked.duration.duration,
          recurring: linked.duration.recurring,
          expectedTargetCount: linked.targeting.expectedTargetCount,
          resolution: {
            mode: "LINKED",
            dependencyId: primaryEvaluation.input.id,
            inheritedAppliedSuccessDistribution:
              primaryEvaluation.appliedSuccessDistribution,
          },
          sourceDieSides,
          retainedShellInputs: {
            sourceAttribute: "Attack",
            sourcePowerId: entry.id ?? null,
            sourcePacketIndex: packetIndex,
            linkedDependencyIdentity: primaryEvaluation.input.id,
          },
        }),
      );
    }
    if (evaluations.length === 0) continue;
    const aggregate = aggregateAugmentDebuffPowerDelivery(evaluations);
    if (aggregate.status !== "SUPPORTED" || aggregate.totalDeliveryUnits === null) {
      reject(
        entry,
        null,
        "NEW_FORMAT_DEBUFF_CONTROL_CORRELATION_UNRESOLVED",
        aggregate.diagnostics.join("; ") || "Power delivery correlation is unsupported.",
      );
      continue;
    }
    const availability = controlPressureAvailability(cooldownTurns).contribution;
    const affectedAttributes = [...new Set(evaluations.map((item) => item.input.attribute))].sort();
    const attributeDeliveryUnits = aggregate.groups.reduce<Record<string, number>>(
      (units, group) => {
        units[group.attribute] = (units[group.attribute] ?? 0) + (group.deliveryUnits ?? 0);
        return units;
      },
      {},
    );
    candidatePowerPackages.push({
      powerId: entry.id ?? power.id ?? null,
      powerName: entry.name ?? power.name,
      packetEvaluations: evaluations,
      aggregateDeliveryUnits: aggregate.totalDeliveryUnits,
      attributeDeliveryUnits,
      affectedAttributes,
      cooldownTurns,
      cooldownAuthoritySource: entry.cooldownAuthority?.source ?? "UNRESOLVED",
      availability,
      actionCost: 1,
      demand: availability,
      overlapFactor: 1,
      overlapAdjustedDeliveryUnits: aggregate.totalDeliveryUnits,
      deliveredProxy: 0,
      duplicateSignature: JSON.stringify({
        packets: evaluations.map(newFormatDebuffPacketSignature).sort(),
        cooldownTurns,
      }),
    });
  }

  const seenPowerSignatures = new Set<string>();
  const exactDuplicateSignaturesRemoved: string[] = [];
  const powerPackages = candidatePowerPackages.filter((candidate) => {
    if (seenPowerSignatures.has(candidate.duplicateSignature)) {
      exactDuplicateSignaturesRemoved.push(candidate.duplicateSignature);
      return false;
    }
    seenPowerSignatures.add(candidate.duplicateSignature);
    return true;
  });
  return {
    detectedPacketCount,
    candidatePowerPackages,
    powerPackages,
    exactDuplicateSignaturesRemoved,
    rejections,
  };
}

function applyNewFormatDebuffThroughput(params: {
  packages: NewFormatDebuffControlPowerPackage[];
  capacity: number;
}) {
  const overlapCounts = new Map<string, number>();
  const packages = params.packages.map((controlPackage) => {
    let overlapAdjustedDeliveryUnits = 0;
    for (const [attribute, deliveryUnits] of Object.entries(
      controlPackage.attributeDeliveryUnits,
    )) {
      const previous = overlapCounts.get(attribute) ?? 0;
      const factor = previous === 0 ? 1 : Math.max(0.35, 0.6 ** previous);
      overlapCounts.set(attribute, previous + 1);
      overlapAdjustedDeliveryUnits += deliveryUnits * factor;
    }
    const overlapFactor =
      controlPackage.aggregateDeliveryUnits > 0
        ? overlapAdjustedDeliveryUnits / controlPackage.aggregateDeliveryUnits
        : 1;
    return { ...controlPackage, overlapFactor, overlapAdjustedDeliveryUnits };
  });
  const totalDemand = packages.reduce((sum, item) => sum + item.demand, 0);
  const allocationScale = totalDemand > 0 ? Math.min(1, params.capacity / totalDemand) : 1;
  const deliveredPackages = packages.map((item) => ({
    ...item,
    deliveredProxy:
      item.overlapAdjustedDeliveryUnits * item.availability * allocationScale,
  }));
  return {
    packages: deliveredPackages,
    totalDemand,
    capacity: params.capacity,
    allocationScale,
    totalDeliveredProxy: deliveredPackages.reduce(
      (sum, item) => sum + item.deliveredProxy,
      0,
    ),
  };
}

function buildControlPressureAxisBaselineModel(params: {
  monster: MonsterOutcomeInput;
  config: CalculatorConfig;
  powerContribution?: CanonicalPowerContribution | null;
  legacyManipulationRaw: number;
  excludedLegacyContributions: Record<string, number>;
}) {
  const tuning = params.config.controlPressureAxisTuning;
  const level = Math.max(1, Math.trunc(params.monster.level || 1));
  const baseline = tuning.baselines.find(
    (entry) =>
      entry.level === level &&
      entry.tier === params.monster.tier &&
      entry.legendary === Boolean(params.monster.legendary),
  );
  const extraction = createSemanticControlPackages({
    monster: params.monster,
    powerContribution: params.powerContribution,
    reliabilityValues: tuning.reliabilityValues,
  });
  const actionsPerTurn = getPressureActionsPerTurn(params.monster);
  const actual = getControlPressureComponents(extraction.packages, actionsPerTurn);
  const newFormatExtraction = createNewFormatDebuffControlPackages({
    monster: params.monster,
    powerContribution: params.powerContribution,
    supportedLevel: tuning.newFormatDebuff.supportedLevel,
  });
  const newFormatWarnings = newFormatExtraction.rejections.map(
    (rejection) =>
      `${rejection.code}: Power ${rejection.powerName}${
        rejection.packetIndex === null ? "" : ` packet ${rejection.packetIndex}`
      }: ${rejection.reason}`,
  );
  const common = {
    policy: "control_pressure_runtime_semantics_v1",
    definition:
      "Control Pressure measures how reliably, broadly and persistently a creature restricts enemy choices or weakens enemy effectiveness.",
    semanticPackagesConsidered: extraction.packages,
    candidateSemanticPackages: extraction.candidates,
    functionalSignatures: extraction.packages.map((entry) => entry.functionalSignature),
    duplicateOverlapHandling: {
      exactDuplicatesRemoved: extraction.duplicateSignatures,
      overlapDiminishingReturns: actual.overlapHandling,
    },
    components: actual.values,
    effectSeverity: actual.values.effectSeverity,
    targetBreadth: actual.values.targetBreadth,
    duration: actual.values.duration,
    recurrence: actual.values.recurrence,
    cooldownAvailability: actual.values.availability,
    actionEconomyContribution: actual.values.actionEconomy,
    resistibilityContribution: {
      value: actual.values.reliability,
      policy: "Neutral gate policy: Fortitude, Intellect, Bravery, and other gate names receive identical value; only resisted, unresisted, or unknown status changes bounded reliability.",
      reliabilityValues: tuning.reliabilityValues,
    },
    linkedPackageContribution: actual.values.linkedRelationships,
    traitEquipmentContribution: {
      applied: 0,
      excludedLegacyContributions: params.excludedLegacyContributions,
      reason: "Generic Manipulation weights do not prove authored hostile table-facing control.",
    },
    unsupportedAuthoringWarnings: [
      ...extraction.unsupportedWarnings,
      ...newFormatWarnings,
    ],
  };
  const legacyResult = !baseline
    ? {
      ...common,
      mode: tuning.nonCalibratedFallbackMode,
      calibrated: false,
      fallback: true,
      baselinePackageId: null,
      baselinePackage: null,
      baselineComponents: null,
      weightedActualComponents: null,
      weightedBaselineComponents: null,
      rawActualControlPressureProxy: params.legacyManipulationRaw,
      rawBaselineControlPressureProxy: null,
      ratioToBaseline: null,
      uncappedScore: null,
      finalScore: null,
      capped: false,
      capReason: null,
      fallbackPolicy:
        "Non-Level-3 creatures retain the explicitly labelled legacy cost-coupled Manipulation curve until level-specific doctrine is accepted.",
      }
    : (() => {
        const baselineComponents = getControlPressureBaselineComponents(baseline);
        const actualProxy = getControlPressureProxy(actual.values, tuning);
        const baselineProxy = getControlPressureProxy(baselineComponents, tuning);
        const ratio = baselineProxy.proxy > 0 ? actualProxy.proxy / baselineProxy.proxy : 0;
        const uncappedScore =
          extraction.packages.length > 0 && actualProxy.proxy > 0 && ratio > 0
            ? tuning.midpointScore + Math.log2(ratio) * tuning.logRatioScale
            : 0;
        const finalScore = clampRadarScore(uncappedScore);
        return {
          ...common,
          mode: "LEVEL_3_BASELINE_RELATIVE",
          calibrated: true,
          fallback: false,
          baselinePackageId: baseline.id,
          baselinePackage: baseline,
          baselineComponents,
          weightedActualComponents: actualProxy.weightedComponents,
          weightedBaselineComponents: baselineProxy.weightedComponents,
          rawActualControlPressureProxy: actualProxy.proxy,
          rawBaselineControlPressureProxy: baselineProxy.proxy,
          ratioToBaseline: ratio,
          uncappedScore,
          finalScore,
          capped: finalScore !== uncappedScore,
          capReason:
            finalScore !== uncappedScore
              ? uncappedScore > 10
                ? "MAX_10"
                : "MIN_0"
              : null,
          fallbackPolicy: null,
        };
      })();

  const newFormatEvidence = {
    detectedPacketCount: newFormatExtraction.detectedPacketCount,
    candidatePowerPackages: newFormatExtraction.candidatePowerPackages,
    exactDuplicateSignaturesRemoved:
      newFormatExtraction.exactDuplicateSignaturesRemoved,
    rejections: newFormatExtraction.rejections,
  };
  if (newFormatExtraction.powerPackages.length === 0) {
    if (
      newFormatExtraction.detectedPacketCount > 0 &&
      extraction.packages.length === 0
    ) {
      return {
        ...legacyResult,
        policy: "new_format_debuff_control_pressure_v1",
        branch: "NEW_FORMAT_DEBUFF_CONTROL",
        mode: "NEW_FORMAT_DEBUFF_CONTROL_UNSUPPORTED",
        calibrated: true,
        fallback: false,
        rawActualControlPressureProxy: 0,
        rawBaselineControlPressureProxy: null,
        ratioToBaseline: null,
        uncappedScore: 0,
        finalScore: 0,
        capped: false,
        capReason: null,
        fallbackPolicy: null,
        newFormatDebuffControl: {
          ...newFormatEvidence,
          sourceAttribute: "Attack",
          actualSourceDie: params.monster.attackDie,
          supportedLevel: tuning.newFormatDebuff.supportedLevel,
          totalDemand: 0,
          capacity: tuning.newFormatDebuff.tierBaselines[params.monster.tier].actionCapacity,
          allocationScale: 1,
          preNormalizationProxy: 0,
          baselineProxy: null,
          normalizationScale: null,
          coefficient: tuning.newFormatDebuff.coefficient,
          referenceConstant: tuning.newFormatDebuff.referenceConstant,
          uncappedScore: 0,
          finalScore: 0,
        },
      };
    }
    return {
      ...legacyResult,
      branch: "LEGACY_CONTROL",
      newFormatDebuffControl: newFormatEvidence,
    };
  }

  if (extraction.packages.length > 0) {
    const mixedWarning =
      "NEW_FORMAT_DEBUFF_CONTROL_MIXED_FAMILY_NORMALIZATION_UNSUPPORTED: " +
      "New-format Debuff contribution was excluded; the complete legacy/non-Debuff Control score was preserved.";
    return {
      ...legacyResult,
      branch: "MIXED_UNSUPPORTED",
      unsupportedAuthoringWarnings: [
        ...legacyResult.unsupportedAuthoringWarnings,
        mixedWarning,
      ],
      newFormatDebuffControl: {
        ...newFormatEvidence,
        excludedFromScore: true,
        exclusionReason: mixedWarning,
      },
    };
  }

  const tierBaseline = tuning.newFormatDebuff.tierBaselines[params.monster.tier];
  const throughput = applyNewFormatDebuffThroughput({
    packages: newFormatExtraction.powerPackages,
    capacity: tierBaseline.actionCapacity,
  });
  const uncappedScore =
    throughput.totalDeliveredProxy > 0
      ? tuning.newFormatDebuff.coefficient *
        Math.log1p(throughput.totalDeliveredProxy / tierBaseline.normalizationScale)
      : 0;
  const finalScore = clampRadarScore(uncappedScore);
  return {
    ...common,
    policy: "new_format_debuff_control_pressure_v1",
    branch: "NEW_FORMAT_DEBUFF_CONTROL",
    mode: "LEVEL_3_NEW_FORMAT_DEBUFF_CONTROL",
    calibrated: true,
    fallback: false,
    baselinePackageId: null,
    baselinePackage: null,
    baselineComponents: null,
    weightedActualComponents: null,
    weightedBaselineComponents: null,
    rawActualControlPressureProxy: throughput.totalDeliveredProxy,
    rawBaselineControlPressureProxy: tierBaseline.baselineProxy,
    ratioToBaseline:
      throughput.totalDeliveredProxy / tierBaseline.baselineProxy,
    uncappedScore,
    finalScore,
    capped: finalScore !== uncappedScore,
    capReason:
      finalScore !== uncappedScore
        ? uncappedScore > 10
          ? "MAX_10"
          : "MIN_0"
        : null,
    fallbackPolicy: null,
    newFormatDebuffControl: {
      ...newFormatEvidence,
      sourceAttribute: "Attack",
      actualSourceDie: params.monster.attackDie,
      matchedResistanceDistribution: createMatchedReferenceResistDistribution(),
      deliveredPowerPackages: throughput.packages,
      totalDemand: throughput.totalDemand,
      capacity: throughput.capacity,
      allocationScale: throughput.allocationScale,
      preNormalizationProxy: throughput.totalDeliveredProxy,
      tier: params.monster.tier,
      level,
      baselineProxy: tierBaseline.baselineProxy,
      normalizationScale: tierBaseline.normalizationScale,
      coefficient: tuning.newFormatDebuff.coefficient,
      referenceConstant: tuning.newFormatDebuff.referenceConstant,
      uncappedScore,
      finalScore,
    },
  };
}

function getExpectedIncomingAttackDiceForDodge(level: number, tier: MonsterTier): number {
  const normalizedLevel = Math.max(1, Math.trunc(level || 1));
  const levelOffset = Math.floor((normalizedLevel - 1) / 5);
  const tierOffset = tier === "BOSS" ? 1 : 0;
  return Math.max(1, 1 + levelOffset + tierOffset);
}

function getExpectedDodgeDiceForSurvivability(level: number, tier: MonsterTier): number {
  const normalizedLevel = Math.max(1, Math.trunc(level || 1));
  const lateLevelDodgeExpectationOffset = normalizedLevel >= 12 ? 1 : 0;
  const highLevelDodgeExpectationOffset = normalizedLevel >= 16 ? 1 : 0;
  return (
    getExpectedIncomingAttackDiceForDodge(level, tier) +
    lateLevelDodgeExpectationOffset +
    highLevelDodgeExpectationOffset
  );
}

function getSmoothDodgeShare(value: number, scale: number, maxShare: number): number {
  if (!(value > 0) || !(scale > 0) || !(maxShare > 0)) return 0;
  return maxShare * (1 - Math.exp(-value / scale));
}

function getDodgeAboveExpectationRatio(currentDodgeDice: number, expectedDodgeDice: number): number {
  if (!(currentDodgeDice > 0) || !(expectedDodgeDice > 0)) return 0;
  return Math.max(0, currentDodgeDice / expectedDodgeDice - 1);
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
    equippedItemType: source.equippedItemType ? String(source.equippedItemType).trim().toUpperCase() : null,
    armorLocation: source.armorLocation ? String(source.armorLocation).trim().toUpperCase() : null,
  };
}

function getDefensivePackageBand(
  lane: "physical" | "mental",
  level: number,
): DefensivePackageBand {
  const normalizedLevel = Math.max(1, Math.min(20, Math.trunc(level || 1)));
  return DEFENSIVE_PACKAGE_BANDS[lane].find((entry) => entry.level === normalizedLevel) ??
    DEFENSIVE_PACKAGE_BANDS[lane][0];
}

function classifyDefensivePackageValue(value: number, band: DefensivePackageBand): string {
  if (!(value > 0)) return "none";
  if (value <= band.lowMax) return "low";
  if (value <= band.standardMax) return "standard";
  if (value <= band.highMax) return "high";
  if (value < band.extremeMin) return "high";
  return "extreme";
}

function buildDefensiveLaneDiagnostic(
  value: number,
  band: DefensivePackageBand,
): {
  value: number;
  packageBand: DefensivePackageBand;
  classification: string;
} {
  return {
    value,
    packageBand: band,
    classification: classifyDefensivePackageValue(value, band),
  };
}

function buildDefensivePackageDiagnostics(
  profiles: NormalizedDefensiveProfile[],
  level: number,
) {
  const armourSlots = Object.fromEntries(
    ARMOUR_PACKAGE_SLOT_ORDER.map((location) => [
      location,
      {
        location,
        physicalProtection: 0,
        mentalProtection: 0,
        sources: [] as Array<{ sourceId: string | null; sourceLabel: string }>,
      },
    ]),
  ) as Record<
    (typeof ARMOUR_PACKAGE_SLOT_ORDER)[number],
    {
      location: (typeof ARMOUR_PACKAGE_SLOT_ORDER)[number];
      physicalProtection: number;
      mentalProtection: number;
      sources: Array<{ sourceId: string | null; sourceLabel: string }>;
    }
  >;
  const shieldSources: Array<{
    sourceId: string | null;
    sourceLabel: string;
    physicalProtection: number;
    mentalProtection: number;
  }> = [];
  const uncategorizedEquippedSources: Array<{
    sourceId: string | null;
    sourceLabel: string;
    physicalProtection: number;
    mentalProtection: number;
  }> = [];

  let naturalPhysicalProtection = 0;
  let naturalMentalProtection = 0;
  let armourPhysicalProtection = 0;
  let armourMentalProtection = 0;
  let shieldPhysicalProtection = 0;
  let shieldMentalProtection = 0;

  for (const profile of profiles) {
    if (profile.sourceKind === "natural") {
      naturalPhysicalProtection += profile.physicalProtection;
      naturalMentalProtection += profile.mentalProtection;
      continue;
    }

    if (profile.sourceKind !== "equipped") continue;

    if (
      profile.equippedItemType === "ARMOR" &&
      ARMOUR_PACKAGE_SLOT_ORDER.includes(profile.armorLocation as (typeof ARMOUR_PACKAGE_SLOT_ORDER)[number])
    ) {
      const slot = armourSlots[profile.armorLocation as (typeof ARMOUR_PACKAGE_SLOT_ORDER)[number]];
      slot.physicalProtection += profile.physicalProtection;
      slot.mentalProtection += profile.mentalProtection;
      slot.sources.push({ sourceId: profile.sourceId, sourceLabel: profile.sourceLabel });
      armourPhysicalProtection += profile.physicalProtection;
      armourMentalProtection += profile.mentalProtection;
      continue;
    }

    if (profile.equippedItemType === "SHIELD") {
      shieldPhysicalProtection += profile.physicalProtection;
      shieldMentalProtection += profile.mentalProtection;
      shieldSources.push({
        sourceId: profile.sourceId,
        sourceLabel: profile.sourceLabel,
        physicalProtection: profile.physicalProtection,
        mentalProtection: profile.mentalProtection,
      });
      continue;
    }

    uncategorizedEquippedSources.push({
      sourceId: profile.sourceId,
      sourceLabel: profile.sourceLabel,
      physicalProtection: profile.physicalProtection,
      mentalProtection: profile.mentalProtection,
    });
  }

  const physicalPackageBand = getDefensivePackageBand("physical", level);
  const mentalPackageBand = getDefensivePackageBand("mental", level);
  const shieldExpected = {
    share: SHIELD_DEFENSIVE_OVERLAY_SHARE,
    physicalStandardMax: physicalPackageBand.standardMax * SHIELD_DEFENSIVE_OVERLAY_SHARE,
    mentalStandardMax: mentalPackageBand.standardMax * SHIELD_DEFENSIVE_OVERLAY_SHARE,
  };

  return {
    source: "defensive_package_parity_v1",
    reportOnly: true,
    armourPackageSlots: armourSlots,
    shieldSources,
    uncategorizedEquippedSources,
    shieldExpected,
    physical: {
      naturalPackage: buildDefensiveLaneDiagnostic(naturalPhysicalProtection, physicalPackageBand),
      equippedArmourPackage: buildDefensiveLaneDiagnostic(armourPhysicalProtection, physicalPackageBand),
      shieldOverlay: buildDefensiveLaneDiagnostic(shieldPhysicalProtection, physicalPackageBand),
      combinedEquipped: buildDefensiveLaneDiagnostic(
        armourPhysicalProtection + shieldPhysicalProtection,
        physicalPackageBand,
      ),
    },
    mental: {
      naturalPackage: buildDefensiveLaneDiagnostic(naturalMentalProtection, mentalPackageBand),
      equippedArmourPackage: buildDefensiveLaneDiagnostic(armourMentalProtection, mentalPackageBand),
      shieldOverlay: buildDefensiveLaneDiagnostic(shieldMentalProtection, mentalPackageBand),
      combinedEquipped: buildDefensiveLaneDiagnostic(
        armourMentalProtection + shieldMentalProtection,
        mentalPackageBand,
      ),
    },
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
      equippedItemType: null,
      armorLocation: null,
    });
  }
  if (equippedPhysicalProtection > 0 || equippedMentalProtection > 0) {
    profiles.push({
      sourceKind: "equipped",
      sourceId: null,
      sourceLabel: "Equipped Protection",
      physicalProtection: equippedPhysicalProtection,
      mentalProtection: equippedMentalProtection,
      equippedItemType: null,
      armorLocation: null,
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
  const unarmoredDodgeDice = Math.max(
    0,
    Math.trunc(
      provided?.unarmoredDodgeDice ??
        Math.ceil(
          getDodgeValue(
            monster.guardDie,
            monster.intellectDie,
            monster.level,
            0,
            tuning,
          ) / 6,
        ),
    ) || 0,
  );

  return {
    dodgeDice,
    unarmoredDodgeDice,
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
  const expectedIncomingAttackDice = getExpectedIncomingAttackDiceForDodge(level, tier);
  const expectedDodgeDice = getExpectedDodgeDiceForSurvivability(level, tier);
  const scoringDodgeDice = Math.max(context.dodgeDice, context.unarmoredDodgeDice ?? 0);
  const normalizedLevel = Math.max(1, Math.trunc(level || 1));
  const baselineDodgeDice =
    normalizedLevel >= 16
      ? Math.min(scoringDodgeDice, Math.max(1, expectedDodgeDice - 1))
      : scoringDodgeDice;
  const dodgeDiceAboveExpectation = Math.max(0, scoringDodgeDice - expectedDodgeDice);
  const dodgeAboveExpectationRatio = getDodgeAboveExpectationRatio(
    scoringDodgeDice,
    expectedDodgeDice,
  );
  const baselineDodgeShare = getSmoothDodgeShare(
    baselineDodgeDice,
    tuning.dodgeBaselineScale,
    tuning.dodgeBaselineMaxShare,
  );
  const parityDodgeShare = getSmoothDodgeShare(
    dodgeAboveExpectationRatio,
    tuning.dodgeParityScale,
    tuning.dodgeParityMaxShare,
  );
  const aboveExpectedDodgeShare = getSmoothDodgeShare(
    Math.min(1, dodgeDiceAboveExpectation),
    tuning.dodgeAboveExpectedScale,
    tuning.dodgeAboveExpectedMaxShare,
  );
  const extremeAboveExpectedDice = Math.max(0, dodgeDiceAboveExpectation - 1);
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
    tuning.mentalDefenceStringProtectionOutputScale,
    tuning.mentalDefenceStringProtectionOutputMaxShare,
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
      expectedIncomingAttackDice,
      expectedDodgeDice,
      baselineDodgeDice,
      scoringDodgeDice,
      authoredDodgeDice: context.dodgeDice,
      unarmoredDodgeDice: context.unarmoredDodgeDice ?? context.dodgeDice,
      dodgeDiceAboveExpectation,
      dodgeAboveExpectationRatio,
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

function successCountForNaturalMonsterOutcomeRoll(roll: number): number {
  if (roll >= 10) return 2;
  if (roll >= 4) return 1;
  return 0;
}

export function expectedTieredSuccessesPerDie(sides: number): number {
  const dieSides = Math.max(0, Math.trunc(Number(sides)));
  if (!Number.isFinite(dieSides) || dieSides <= 0) return 0;
  let total = 0;
  for (let roll = 1; roll <= dieSides; roll += 1) {
    total += successCountForNaturalMonsterOutcomeRoll(roll);
  }
  return total / dieSides;
}

export function expectedTieredSuccesses(params: {
  dieSides: number;
  diceCount: number;
  rerollFailedDiceOnce?: boolean;
}): number {
  const diceCount = Math.max(0, Math.trunc(Number(params.diceCount)));
  if (!Number.isFinite(diceCount) || diceCount <= 0) return 0;
  const perDie = expectedTieredSuccessesPerDie(params.dieSides);
  const baseExpected = perDie * diceCount;
  if (!params.rerollFailedDiceOnce) return baseExpected;
  const dieSides = Math.max(0, Math.trunc(Number(params.dieSides)));
  if (!Number.isFinite(dieSides) || dieSides <= 0) return baseExpected;
  const failProbability = Math.min(3, dieSides) / dieSides;
  return baseExpected + failProbability * perDie * diceCount;
}

type DurabilityLane = "physical" | "mental";
type ResistGate = keyof DurabilityLaneBaseline["resistGateWeights"];

type DurabilitySupplementalContributions = {
  power: number;
  trait: number;
  equipment: number;
  naturalAttack: number;
  limitBreak: number;
};

type DurabilityPackageActual = {
  hp: number;
  protection: number;
  defenceDice: number;
  defenceDieSides: number;
  blockPerSuccess: number;
  dodgeDice: number;
  dodgeDieSides: number;
  resistCoverage: number;
  injuryDieSides: number;
};

function resolveDurabilityBaselinePackage(
  config: CalculatorConfig,
  monster: Pick<MonsterOutcomeInput, "level" | "tier" | "legendary">,
): DurabilityBaselinePackage | null {
  const level = Math.max(1, Math.trunc(monster.level || 1));
  const tier = String(monster.tier ?? "MINION").toUpperCase();
  return (
    config.durabilityAxisTuning.baselines.find(
      (entry) =>
        entry.level === level &&
        entry.tier === tier &&
        entry.legendary === Boolean(monster.legendary),
    ) ?? null
  );
}

function successDistribution(
  diceCount: number,
  dieSides: number,
  modifier = 0,
): Map<number, number> {
  const count = Math.max(0, Math.trunc(diceCount));
  const sides = Math.max(1, Math.trunc(dieSides));
  let distribution = new Map<number, number>([[0, 1]]);
  for (let index = 0; index < count; index += 1) {
    const next = new Map<number, number>();
    for (const [currentSuccesses, currentProbability] of distribution) {
      for (let face = 1; face <= sides; face += 1) {
        const successes = currentSuccesses + successCountForRoll(face, modifier);
        next.set(successes, (next.get(successes) ?? 0) + currentProbability / sides);
      }
    }
    distribution = next;
  }
  return distribution;
}

function weightedResistCoverage(
  monster: MonsterOutcomeInput,
  baseline: DurabilityLaneBaseline,
): { value: number; gates: Record<string, { weight: number; resistValue: number }> } {
  const fields: Record<ResistGate, number> = {
    ATTACK: clampNonNegative(Number(monster.attackResistDie ?? 0)),
    GUARD: clampNonNegative(Number(monster.guardResistDie ?? 0)),
    FORTITUDE: clampNonNegative(Number(monster.fortitudeResistDie ?? 0)),
    INTELLECT: clampNonNegative(Number(monster.intellectResistDie ?? 0)),
    SYNERGY: clampNonNegative(Number(monster.synergyResistDie ?? 0)),
    BRAVERY: clampNonNegative(Number(monster.braveryResistDie ?? 0)),
  };
  const gates: Record<string, { weight: number; resistValue: number }> = {};
  let value = 0;
  for (const [gate, rawWeight] of Object.entries(baseline.resistGateWeights)) {
    const weight = clampNonNegative(Number(rawWeight));
    const resistValue = fields[gate as ResistGate] ?? 0;
    gates[gate] = { weight, resistValue };
    value += weight * resistValue;
  }
  return { value, gates };
}

function highestInjuryDieSides(monster: MonsterOutcomeInput, lane: DurabilityLane): number {
  const dice =
    lane === "physical"
      ? [monster.attackDie, monster.guardDie, monster.fortitudeDie]
      : [monster.intellectDie, monster.synergyDie, monster.braveryDie];
  return Math.max(...dice.map((die) => dieSidesFromDieString(String(die ?? "D4"))));
}

function majorInjuryProbability(dieSides: number, overflowModifier: number): number {
  const distribution = successDistribution(3, dieSides, overflowModifier);
  let probability = 0;
  for (const [successes, outcomeProbability] of distribution) {
    if (successes <= 1) probability += outcomeProbability;
  }
  return Math.min(1, Math.max(0, probability));
}

type RuntimeLikeDefenceUseSummary = {
  use: number;
  defenceDice: number;
  dodgeDice: number;
  expectedIncomingWounds: number;
  expectedDefencePrevention: number;
  expectedDodgePrevention: number;
  chosenDefencePrevention: number;
  chosenDodgePrevention: number;
  expectedWoundsAfterActiveDefence: number;
};

function runtimeLikePermanentDefenceExpectation(params: {
  actual: DurabilityPackageActual;
  tuning: CalculatorConfig["durabilityAxisTuning"];
}): {
  defence: number;
  dodge: number;
  protection: number;
  resist: number;
  total: number;
  effectiveIncomingWounds: number;
  expectedIncomingWounds: number;
  incomingSuccessDistribution: Array<{ successes: number; probability: number; wounds: number }>;
  uses: RuntimeLikeDefenceUseSummary[];
  chosenDefensiveOptionPolicy: string;
  authoredProtection: number;
  hydratedStaticProtection: number;
  standaloneProtectionCreditApplied: boolean;
  standaloneProtectionPolicyReason: string;
} {
  const { actual, tuning } = params;
  const incoming = successDistribution(
    tuning.referenceIncomingDiceCount,
    tuning.referenceIncomingDieSides,
  );
  const incomingSuccessDistribution = [...incoming.entries()].map(([successes, probability]) => ({
    successes,
    probability,
    wounds: successes * tuning.referenceWoundsPerSuccess,
  }));
  const expectedIncomingWounds = incomingSuccessDistribution.reduce(
    (sum, row) => sum + row.wounds * row.probability,
    0,
  );
  const useCount = Math.max(1, Math.trunc(tuning.referenceDefenceUsesPerRound));
  const uses: RuntimeLikeDefenceUseSummary[] = [];
  for (let use = 0; use < useCount; use += 1) {
    const defenceDice = Math.max(1, Math.trunc(actual.defenceDice) - use);
    const dodgeDice = actual.dodgeDice > 0 ? Math.max(1, Math.trunc(actual.dodgeDice) - use) : 0;
    const defenceDistribution = successDistribution(defenceDice, actual.defenceDieSides);
    const dodgeDistribution =
      dodgeDice > 0 ? successDistribution(dodgeDice, actual.dodgeDieSides) : new Map<number, number>();
    let expectedDefencePrevention = 0;
    let expectedDodgePrevention = 0;
    let chosenDefencePrevention = 0;
    let chosenDodgePrevention = 0;
    let expectedWoundsAfterActiveDefence = 0;
    for (const incomingRow of incomingSuccessDistribution) {
      if (incomingRow.wounds <= 0) continue;
      let defencePreventionForOutcome = 0;
      for (const [defenceSuccesses, probability] of defenceDistribution) {
        defencePreventionForOutcome +=
          Math.min(incomingRow.wounds, defenceSuccesses * actual.blockPerSuccess) * probability;
      }
      let dodgePreventionForOutcome = 0;
      for (const [dodgeSuccesses, probability] of dodgeDistribution) {
        if (dodgeSuccesses >= incomingRow.successes) {
          dodgePreventionForOutcome += incomingRow.wounds * probability;
        }
      }
      const chooseDefence = defencePreventionForOutcome > dodgePreventionForOutcome;
      const chosenPrevention = chooseDefence
        ? defencePreventionForOutcome
        : dodgePreventionForOutcome;
      expectedDefencePrevention += defencePreventionForOutcome * incomingRow.probability;
      expectedDodgePrevention += dodgePreventionForOutcome * incomingRow.probability;
      if (chooseDefence) {
        chosenDefencePrevention += chosenPrevention * incomingRow.probability;
      } else {
        chosenDodgePrevention += chosenPrevention * incomingRow.probability;
      }
      expectedWoundsAfterActiveDefence +=
        (incomingRow.wounds - chosenPrevention) * incomingRow.probability;
    }
    uses.push({
      use: use + 1,
      defenceDice,
      dodgeDice,
      expectedIncomingWounds,
      expectedDefencePrevention,
      expectedDodgePrevention,
      chosenDefencePrevention,
      chosenDodgePrevention,
      expectedWoundsAfterActiveDefence,
    });
  }
  const average = (key: keyof RuntimeLikeDefenceUseSummary) =>
    uses.reduce((sum, row) => sum + Number(row[key]), 0) / uses.length;
  const defence = average("chosenDefencePrevention");
  const dodge = average("chosenDodgePrevention");
  const activeExpectedWounds = average("expectedWoundsAfterActiveDefence");
  const hydratedStaticProtection =
    actual.protection * Math.max(0, tuning.authoredProtectionStaticRuntimeShare);
  const protection = Math.min(
    activeExpectedWounds,
    hydratedStaticProtection * tuning.protectionPreventionPerPoint,
  );
  const resist = Math.min(
    Math.max(0, activeExpectedWounds - protection),
    expectedIncomingWounds * tuning.resistPreventionMaxShare,
    actual.resistCoverage * tuning.resistPreventionPerCoveragePoint,
  );
  const effectiveIncomingWounds = Math.max(0.001, activeExpectedWounds - protection - resist);
  const total = Math.max(0, expectedIncomingWounds - effectiveIncomingWounds);
  return {
    defence,
    dodge,
    protection,
    resist,
    total,
    effectiveIncomingWounds,
    expectedIncomingWounds,
    incomingSuccessDistribution,
    uses,
    chosenDefensiveOptionPolicy:
      "For each incoming-success outcome and degradation use, choose Defence only when its capped expected prevention is strictly greater than Dodge; ties choose Dodge, matching Combat Lab.",
    authoredProtection: actual.protection,
    hydratedStaticProtection,
    standaloneProtectionCreditApplied: protection > 0,
    standaloneProtectionPolicyReason:
      hydratedStaticProtection > 0
        ? "EXPLICIT_RUNTIME_STATIC_PROTECTION"
        : "DERIVED_DEFENCE_STRING_NO_STATIC_LAYER",
  };
}

function durabilityProxy(params: {
  actual: DurabilityPackageActual;
  legendary: boolean;
  level: number;
  tuning: CalculatorConfig["durabilityAxisTuning"];
  supplementalRatio: number;
}) {
  const prevention = runtimeLikePermanentDefenceExpectation({
    actual: params.actual,
    tuning: params.tuning,
  });
  const expectedIncomingWounds = prevention.expectedIncomingWounds;
  const attacksToZero = params.actual.hp / prevention.effectiveIncomingWounds;
  const overflow = params.legendary
    ? params.tuning.representativeLegendaryOverflowDamage
    : 0;
  const overflowModifier = params.legendary
    ? -Math.floor(overflow / Math.max(1, Math.trunc(params.level || 1)))
    : 0;
  const injuryProbability = params.legendary
    ? majorInjuryProbability(params.actual.injuryDieSides, overflowModifier)
    : 0;
  const safeInjuryProbability = Math.max(0.000001, injuryProbability);
  const expectedTrialsByMajorInjuryState = params.legendary
    ? {
        zeroMajorInjuries: 3 / safeInjuryProbability,
        oneMajorInjury: 2 / safeInjuryProbability,
        twoMajorInjuries: 1 / safeInjuryProbability,
        threeMajorInjuries: 0,
      }
    : {
        zeroMajorInjuries: 0,
        oneMajorInjury: 0,
        twoMajorInjuries: 0,
        threeMajorInjuries: 0,
      };
  const expectedInjuryTrialsToDefeat = expectedTrialsByMajorInjuryState.zeroMajorInjuries;
  const legendaryAdditionalEvents = params.legendary
    ? Math.max(0, expectedInjuryTrialsToDefeat - 1)
    : 0;
  const rawProxy = (attacksToZero + legendaryAdditionalEvents) * params.supplementalRatio;
  return {
    expectedIncomingWounds,
    prevention,
    attacksToZero,
    legendary: {
      active: params.legendary,
      representativeOverflowDamage: overflow,
      overflowModifier,
      injuryDieSides: params.actual.injuryDieSides,
      diceCount: 3,
      majorInjuriesToDefeat: 3,
      majorInjuryProbabilityPerTrial: injuryProbability,
      expectedTrialsByMajorInjuryState,
      expectedTrialsToThreeMajorInjuries: expectedInjuryTrialsToDefeat,
      additionalPostZeroEvents: legendaryAdditionalEvents,
      blazeCredit: 0,
      policy:
        "Exact three-die face enumeration uses Combat Lab successCountForRoll with event-local overflow applied per die; Minor/No Injury do not advance defeat and Blaze gives no automatic credit.",
    },
    supplementalRatio: params.supplementalRatio,
    rawProxy,
  };
}

function baselineRelativeDurability(params: {
  lane: DurabilityLane;
  monster: MonsterOutcomeInput;
  config: CalculatorConfig;
  baselinePackage: DurabilityBaselinePackage;
  actualContext: DefensiveProfileContext;
  defensiveContribution: DefensiveContribution;
  supplemental: DurabilitySupplementalContributions;
}) {
  const tuning = params.config.durabilityAxisTuning;
  const baseline = params.baselinePackage[params.lane];
  const resist = weightedResistCoverage(params.monster, baseline);
  const supplementalRaw = Object.values(params.supplemental).reduce((sum, value) => sum + value, 0);
  const supplementalReference = Math.max(1, baseline.expectedHp);
  const supplementalShare = Math.max(
    -tuning.supplementalContributionMaxRatio,
    Math.min(tuning.supplementalContributionMaxRatio, supplementalRaw / supplementalReference),
  );
  const actual: DurabilityPackageActual = {
    hp:
      params.lane === "physical"
        ? clampNonNegative(params.monster.physicalResilienceMax)
        : clampNonNegative(params.monster.mentalPerseveranceMax),
    protection:
      params.lane === "physical"
        ? params.actualContext.totalPhysicalProtection
        : params.actualContext.totalMentalProtection,
    defenceDice:
      params.lane === "physical"
        ? params.actualContext.armorSkillDice
        : params.actualContext.willpowerDice,
    defenceDieSides: dieSidesFromDieString(
      String(params.lane === "physical" ? params.monster.guardDie : params.monster.braveryDie),
    ),
    blockPerSuccess:
      params.lane === "physical"
        ? params.defensiveContribution.totals.physicalBlockPerSuccess
        : params.defensiveContribution.totals.mentalBlockPerSuccess,
    // Calibrated durability mirrors the hydrated runtime actor. Authored
    // Protection has already reduced this Dodge value; the legacy unarmored
    // scoring view would incorrectly erase that live tradeoff.
    dodgeDice: params.lane === "physical" ? params.defensiveContribution.totals.authoredDodgeDice : 0,
    dodgeDieSides: dieSidesFromDieString(String(params.monster.guardDie)),
    resistCoverage: resist.value,
    injuryDieSides: highestInjuryDieSides(params.monster, params.lane),
  };
  const baselineActual: DurabilityPackageActual = {
    hp: baseline.expectedHp,
    protection: baseline.expectedProtection,
    defenceDice: baseline.expectedDefenceDice,
    defenceDieSides: baseline.expectedDefenceDieSides,
    blockPerSuccess: baseline.expectedBlockPerSuccess,
    dodgeDice: params.lane === "physical" ? baseline.expectedDodgeDice : 0,
    dodgeDieSides: baseline.expectedDodgeDieSides,
    resistCoverage: baseline.expectedResistCoverage,
    injuryDieSides: baseline.representativeInjuryDieSides,
  };
  const actualProxy = durabilityProxy({
    actual,
    legendary: Boolean(params.monster.legendary),
    level: params.monster.level,
    tuning,
    supplementalRatio: 1 + supplementalShare,
  });
  const baselineProxy = durabilityProxy({
    actual: baselineActual,
    legendary: params.baselinePackage.legendary,
    level: params.baselinePackage.level,
    tuning,
    supplementalRatio: 1,
  });
  const ratioToBaseline = actualProxy.rawProxy / Math.max(0.000001, baselineProxy.rawProxy);
  const uncappedFinalScore =
    tuning.midpointScore +
    tuning.scoreHalfRange * Math.tanh(Math.log(Math.max(0.000001, ratioToBaseline)) / tuning.logRatioScale);
  const finalScore = clampRadarScore(uncappedFinalScore);
  const hpRatio = actual.hp / Math.max(1, baseline.expectedHp);
  const hpContribution =
    tuning.scoreHalfRange * Math.tanh(Math.log(Math.max(0.000001, hpRatio)) / tuning.logRatioScale);
  return {
    model: "level3-accepted-package-relative-v1",
    policy:
      "Physical and mental durability compare authored HP and runtime-supported defence against the accepted package for the same level, tier, and legendary state.",
    baselinePackageId: params.baselinePackage.id,
    calibration: "LEVEL_3_CALIBRATED" as const,
    lane: params.lane,
    actualHp: actual.hp,
    baselineHp: baseline.expectedHp,
    hpRatio,
    hpContribution,
    actualProtection: actual.protection,
    authoredProtection: actual.protection,
    derivedBlockPackage: {
      defenceDice: actual.defenceDice,
      defenceDieSides: actual.defenceDieSides,
      blockPerSuccess: actual.blockPerSuccess,
    },
    hydratedStaticProtectionExpectedAtRuntime:
      actualProxy.prevention.hydratedStaticProtection,
    standaloneProtectionCreditApplied:
      actualProxy.prevention.standaloneProtectionCreditApplied,
    standaloneProtectionPolicyReason:
      actualProxy.prevention.standaloneProtectionPolicyReason,
    permanentDefenceExpectation: {
      incomingSuccessDistribution: actualProxy.prevention.incomingSuccessDistribution,
      uses: actualProxy.prevention.uses,
      chosenDefensiveOptionPolicy: actualProxy.prevention.chosenDefensiveOptionPolicy,
      expectedIncomingWounds: actualProxy.prevention.expectedIncomingWounds,
      expectedWoundsPerAttack: actualProxy.prevention.effectiveIncomingWounds,
      effectiveAttacksToZero: actualProxy.attacksToZero,
      defenceExpectedPrevention: actualProxy.prevention.defence,
      dodgeExpectedPrevention: actualProxy.prevention.dodge,
    },
    baselineProtection: baseline.expectedProtection,
    actualDefence: {
      dice: actual.defenceDice,
      dieSides: actual.defenceDieSides,
      blockPerSuccess: actual.blockPerSuccess,
    },
    baselineDefence: {
      dice: baseline.expectedDefenceDice,
      dieSides: baseline.expectedDefenceDieSides,
      blockPerSuccess: baseline.expectedBlockPerSuccess,
    },
    defenceContribution: actualProxy.prevention.defence,
    baselineDefenceContribution: baselineProxy.prevention.defence,
    actualDodge: { dice: actual.dodgeDice, dieSides: actual.dodgeDieSides },
    baselineDodge: { dice: baselineActual.dodgeDice, dieSides: baselineActual.dodgeDieSides },
    dodgeContribution: actualProxy.prevention.dodge,
    baselineDodgeContribution: baselineProxy.prevention.dodge,
    resistCoverage: { value: actual.resistCoverage, gates: resist.gates },
    baselineResistCoverage: baseline.expectedResistCoverage,
    resistContribution: actualProxy.prevention.resist,
    baselineResistContribution: baselineProxy.prevention.resist,
    supplementalContributions: params.supplemental,
    powerContribution: params.supplemental.power,
    defensivePowerContribution: params.supplemental.power,
    traitEquipmentContribution:
      params.supplemental.trait +
      params.supplemental.equipment +
      params.supplemental.naturalAttack +
      params.supplemental.limitBreak,
    supplementalRatio: actualProxy.supplementalRatio,
    legendaryInjuryFlowContribution:
      actualProxy.legendary.additionalPostZeroEvents - baselineProxy.legendary.additionalPostZeroEvents,
    majorInjuryProbabilityAssumptions: actualProxy.legendary,
    baselineMajorInjuryProbabilityAssumptions: baselineProxy.legendary,
    actualPrevention: actualProxy.prevention,
    baselinePrevention: baselineProxy.prevention,
    rawActualDurabilityProxy: actualProxy.rawProxy,
    rawBaselineDurabilityProxy: baselineProxy.rawProxy,
    ratioToBaseline,
    uncappedFinalScore,
    finalScore,
    capped: finalScore !== uncappedFinalScore,
    capReason:
      uncappedFinalScore < 0 ? "minimum-0" : uncappedFinalScore > 10 ? "maximum-10" : "none",
  };
}

function resolveAtWillAttackDiceCount(
  monster: MonsterOutcomeInput,
  tuning?: Partial<ProtectionTuningValues>,
): number {
  const stored = Number(monster.weaponSkillValue);
  if (Number.isFinite(stored) && stored > 0) return Math.max(1, Math.trunc(stored));
  const weaponSkillTuning = {
    weaponSkillAttackWeight:
      tuning?.weaponSkillAttackWeight ?? DEFAULT_COMBAT_TUNING_VALUES.weaponSkillAttackWeight,
    weaponSkillBraveryWeight:
      tuning?.weaponSkillBraveryWeight ?? DEFAULT_COMBAT_TUNING_VALUES.weaponSkillBraveryWeight,
    weaponSkillBaselineOffset:
      tuning?.weaponSkillBaselineOffset ??
      DEFAULT_COMBAT_TUNING_VALUES.weaponSkillBaselineOffset,
    weaponSkillScale:
      tuning?.weaponSkillScale ?? DEFAULT_COMBAT_TUNING_VALUES.weaponSkillScale,
  };
  return Math.max(
    1,
    getWeaponSkillDiceCountFromAttributes(
      monster.attackDie,
      monster.braveryDie,
      weaponSkillTuning,
    ),
  );
}

export function computeMonsterOutcomes(
  monster: MonsterOutcomeInput,
  config: CalculatorConfig,
  opts?: {
    equippedWeaponSources?: WeaponAttackSource[];
    defensiveProfileSources?: DefensiveProfileSource[];
    defensiveProfileContext?: Partial<DefensiveProfileContext>;
    protectionTuning?: Partial<ProtectionTuningValues>;
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
  const atWillDiceCount = resolveAtWillAttackDiceCount(monster, opts?.protectionTuning);
  const atWillExpectedSuccessesPerDie = expectedTieredSuccessesPerDie(dieSides);
  const atWillExpectedSuccesses = expectedTieredSuccesses({
    dieSides,
    diceCount: atWillDiceCount,
  });

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
        diceCount: atWillDiceCount,
        expectedSuccessesPerDie: atWillExpectedSuccessesPerDie,
        expectedSuccesses: atWillExpectedSuccesses,
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
        diceCount: atWillDiceCount,
        expectedSuccessesPerDie: atWillExpectedSuccessesPerDie,
        expectedSuccesses: atWillExpectedSuccesses,
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
        diceCount: atWillDiceCount,
        expectedSuccessesPerDie: atWillExpectedSuccessesPerDie,
        expectedSuccesses: atWillExpectedSuccesses,
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
  const powerAvailability = resolveEffectivePowerAxisContribution(opts?.powerContribution);
  const canonicalPowerAxisVector = powerAvailability.canonicalPowerAxisVector;
  const expectedPowerAttackContribution = getExpectedPowerAttackContribution({
    monster,
    powerContribution: opts?.powerContribution,
    perPowerAvailability: powerAvailability.perPower,
    netSuccessMultiplier,
    aoeMultiplier: cfg.baselineParty.aoeMultiplier,
  });
  const effectivePowerAxisVector = {
    ...powerAvailability.effectivePowerAxisVector,
    physicalThreat:
      expectedPowerAttackContribution.axisVector.physicalThreat > 0
        ? expectedPowerAttackContribution.axisVector.physicalThreat
        : powerAvailability.effectivePowerAxisVector.physicalThreat,
    mentalThreat:
      expectedPowerAttackContribution.axisVector.mentalThreat > 0
        ? expectedPowerAttackContribution.axisVector.mentalThreat
        : powerAvailability.effectivePowerAxisVector.mentalThreat,
  };

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
  const legacyNonPowerPresenceBudget =
    spike * 0.6 + sustainedTotal * 0.4 + (atWillSummary.hasAoe ? 1.5 : 0);
  const atWillThreatAxisMultiplier =
    opts?.protectionTuning?.atWillThreatAxisMultiplier ??
    DEFAULT_COMBAT_TUNING_VALUES.atWillThreatAxisMultiplier;
  const sustainedPhysicalThreatAxis = sustainedPhysical * atWillThreatAxisMultiplier;
  const sustainedMentalThreatAxis = sustainedMental * atWillThreatAxisMultiplier;

  const level = Math.max(1, Math.trunc(monster.level || 1));
  const tierKey = toTierBudgetKey(monster);
  const threatAxisTierKey = toThreatAxisBaselineTierKey(monster);
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
  const rawSurvivabilityBudgetTuning = {
    rawPhysicalSurvivabilityBudgetAt1:
      opts?.protectionTuning?.rawPhysicalSurvivabilityBudgetAt1 ??
      DEFAULT_COMBAT_TUNING_VALUES.rawPhysicalSurvivabilityBudgetAt1,
    rawPhysicalSurvivabilityBudgetPerLevel:
      opts?.protectionTuning?.rawPhysicalSurvivabilityBudgetPerLevel ??
      DEFAULT_COMBAT_TUNING_VALUES.rawPhysicalSurvivabilityBudgetPerLevel,
    rawMentalSurvivabilityBudgetAt1:
      opts?.protectionTuning?.rawMentalSurvivabilityBudgetAt1 ??
      DEFAULT_COMBAT_TUNING_VALUES.rawMentalSurvivabilityBudgetAt1,
    rawMentalSurvivabilityBudgetPerLevel:
      opts?.protectionTuning?.rawMentalSurvivabilityBudgetPerLevel ??
      DEFAULT_COMBAT_TUNING_VALUES.rawMentalSurvivabilityBudgetPerLevel,
    rawSurvivabilityBudgetMinionMultiplier:
      opts?.protectionTuning?.rawSurvivabilityBudgetMinionMultiplier ??
      DEFAULT_COMBAT_TUNING_VALUES.rawSurvivabilityBudgetMinionMultiplier,
    rawSurvivabilityBudgetSoldierMultiplier:
      opts?.protectionTuning?.rawSurvivabilityBudgetSoldierMultiplier ??
      DEFAULT_COMBAT_TUNING_VALUES.rawSurvivabilityBudgetSoldierMultiplier,
    rawSurvivabilityBudgetEliteMultiplier:
      opts?.protectionTuning?.rawSurvivabilityBudgetEliteMultiplier ??
      DEFAULT_COMBAT_TUNING_VALUES.rawSurvivabilityBudgetEliteMultiplier,
    rawSurvivabilityBudgetBossMultiplier:
      opts?.protectionTuning?.rawSurvivabilityBudgetBossMultiplier ??
      DEFAULT_COMBAT_TUNING_VALUES.rawSurvivabilityBudgetBossMultiplier,
    rawSurvivabilityBudgetLegendaryMultiplier:
      opts?.protectionTuning?.rawSurvivabilityBudgetLegendaryMultiplier ??
      DEFAULT_COMBAT_TUNING_VALUES.rawSurvivabilityBudgetLegendaryMultiplier,
  };
  const physicalSurvivabilityRawBudgetTarget = getRawSurvivabilityBudgetTarget(
    rawSurvivabilityBudgetTuning,
    "physical",
    RAW_NUMERATOR_REFERENCE_LEVEL,
    monster.tier,
    Boolean(monster.legendary),
  );
  const mentalSurvivabilityRawBudgetTarget = getRawSurvivabilityBudgetTarget(
    rawSurvivabilityBudgetTuning,
    "mental",
    RAW_NUMERATOR_REFERENCE_LEVEL,
    monster.tier,
    Boolean(monster.legendary),
  );
  const physicalPoolLane = getPoolLaneRawBonus(
    physicalPoolRatio,
    physicalSurvivabilityRawBudgetTarget,
    cfg.healthPoolTuning,
  );
  const mentalPoolLane = getPoolLaneRawBonus(
    mentalPoolRatio,
    mentalSurvivabilityRawBudgetTarget,
    cfg.healthPoolTuning,
  );
  const axisBudgetTargets: RadarAxes = {
    physicalThreat: getTierAdjustedAxisBudgetTarget(physicalThreatCurvePoint, tierMultiplier),
    mentalThreat: getTierAdjustedAxisBudgetTarget(mentalThreatCurvePoint, tierMultiplier),
    physicalSurvivability: physicalSurvivabilityRawBudgetTarget,
    mentalSurvivability: mentalSurvivabilityRawBudgetTarget,
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
    atWillThreatAxisMultiplier,
    defenceStringProtectionOutputScale:
      opts?.protectionTuning?.defenceStringProtectionOutputScale ??
      DEFAULT_COMBAT_TUNING_VALUES.defenceStringProtectionOutputScale,
    defenceStringProtectionOutputMaxShare:
      opts?.protectionTuning?.defenceStringProtectionOutputMaxShare ??
      DEFAULT_COMBAT_TUNING_VALUES.defenceStringProtectionOutputMaxShare,
    mentalDefenceStringProtectionOutputScale:
      opts?.protectionTuning?.mentalDefenceStringProtectionOutputScale ??
      opts?.protectionTuning?.defenceStringProtectionOutputScale ??
      DEFAULT_COMBAT_TUNING_VALUES.mentalDefenceStringProtectionOutputScale,
    mentalDefenceStringProtectionOutputMaxShare:
      opts?.protectionTuning?.mentalDefenceStringProtectionOutputMaxShare ??
      opts?.protectionTuning?.defenceStringProtectionOutputMaxShare ??
      DEFAULT_COMBAT_TUNING_VALUES.mentalDefenceStringProtectionOutputMaxShare,
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
  const defensiveProfileContext = resolveDefensiveProfileContext(
    monster,
    defensiveProtectionTuning,
    opts?.defensiveProfileContext,
  );
  const defensiveContribution = computeDefensiveContributionFromProfiles(
    defensiveProfiles,
    defensiveProfileContext,
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
  const defenceResistContribution = getRawAxisContributionFromBudgetTarget(
    getResistBudgetShare(monster.guardResistDie),
    physicalSurvivabilityRawBudgetTarget,
    resistPressureMultiplier,
  );
  const fortitudeResistContribution = getRawAxisContributionFromBudgetTarget(
    getResistBudgetShare(monster.fortitudeResistDie),
    physicalSurvivabilityRawBudgetTarget,
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
  const suppressedOffensiveResistContributions = {
    attackResistContribution,
    intellectResistContribution,
    supportResistContribution,
    braveryResistContribution,
  };
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
  const durabilityBaselinePackage = resolveDurabilityBaselinePackage(cfg, monster);
  const c14LegendaryDurabilityBonus = Boolean(monster.legendary) && !durabilityBaselinePackage
    ? {
        physicalSurvivability: axisBudgetTargets.physicalSurvivability * 0.25,
        mentalSurvivability: axisBudgetTargets.mentalSurvivability * 0.25,
      }
    : { physicalSurvivability: 0, mentalSurvivability: 0 };
  const legacyPresenceBonuses = {
    naturalAttackGreaterSuccess: naturalAttackGsAxisBonuses.presence,
    naturalAttackRange: naturalAttackRangeAxisBonuses.presence,
    customLimitBreak: customLimitBreakAxisBonuses.presence,
    trait: traitAxisBonuses.presence,
    equipment: equipmentModifierAxisBonuses.presence,
    genericPowerResolver: effectivePowerAxisVector.presence,
  };
  const legacyPresenceRaw =
    legacyNonPowerPresenceBudget +
    legacyPresenceBonuses.naturalAttackGreaterSuccess +
    legacyPresenceBonuses.naturalAttackRange +
    legacyPresenceBonuses.customLimitBreak +
    legacyPresenceBonuses.trait +
    legacyPresenceBonuses.genericPowerResolver;
  const pressureAxisBaselineModel = buildPressureAxisBaselineModel({
    monster,
    config: cfg,
    atWillProfiles,
    powerContribution: opts?.powerContribution,
    legacyPresenceRaw,
    excludedLegacyBonuses: legacyPresenceBonuses,
  });
  const calibratedPressureRaw = pressureAxisBaselineModel.calibrated
    ? pressureAxisBaselineModel.rawActualPressureProxy
    : legacyPresenceRaw;
  const nonPowerContribution: RadarAxes = {
    physicalThreat:
      sustainedPhysicalThreatAxis +
    routedEquipmentPhysicalThreatBonus +
    naturalAttackGsAxisBonuses.physicalThreat +
    naturalAttackRangeAxisBonuses.physicalThreat +
    customLimitBreakAxisBonuses.physicalThreat +
      traitAxisBonuses.physicalThreat,
    mentalThreat:
      sustainedMentalThreatAxis +
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
      c14LegendaryDurabilityBonus.physicalSurvivability +
      traitAxisBonuses.physicalSurvivability,
    mentalSurvivability:
      mentalPoolLane.rawBonus +
      defensiveContribution.sharedDodgeAxisVector.mentalSurvivability +
      defensiveContribution.axisVector.mentalSurvivability +
      equipmentModifierAxisBonuses.mentalSurvivability +
      naturalAttackGsAxisBonuses.mentalSurvivability +
      customLimitBreakAxisBonuses.mentalSurvivability +
      c14LegendaryDurabilityBonus.mentalSurvivability +
      traitAxisBonuses.mentalSurvivability,
    manipulation:
      equipmentModifierAxisBonuses.manipulation +
      naturalAttackGsAxisBonuses.manipulation +
      customLimitBreakAxisBonuses.manipulation +
      traitAxisBonuses.manipulation,
    synergy:
      equipmentModifierAxisBonuses.synergy +
      naturalAttackGsAxisBonuses.synergy +
      customLimitBreakAxisBonuses.synergy +
      traitAxisBonuses.synergy,
    mobility:
      naturalAttackGsAxisBonuses.mobility +
      naturalAttackRangeAxisBonuses.mobility +
      customLimitBreakAxisBonuses.mobility +
      traitAxisBonuses.mobility,
    presence: calibratedPressureRaw,
  };
  const newFormatDebuffResolverManipulationExcluded =
    opts?.powerContribution?.powers?.reduce((sum, power, index) => {
      if (!powerContainsNewFormatDebuff(power.authoredPower)) return sum;
      return (
        sum +
        Number(
          powerAvailability.perPower[index]?.effectivePowerAxisVector.manipulation ?? 0,
        )
      );
    }, 0) ?? 0;
  const legacyManipulationRaw =
    nonPowerContribution.manipulation +
    effectivePowerAxisVector.manipulation -
    newFormatDebuffResolverManipulationExcluded;
  const controlPressureAxisBaselineModel = buildControlPressureAxisBaselineModel({
    monster,
    config: cfg,
    powerContribution: opts?.powerContribution,
    legacyManipulationRaw,
    excludedLegacyContributions: {
      genericPowerResolver: effectivePowerAxisVector.manipulation,
      newFormatDebuffResolverExcluded: newFormatDebuffResolverManipulationExcluded,
      equipment: equipmentModifierAxisBonuses.manipulation,
      naturalAttackGreaterSuccess: naturalAttackGsAxisBonuses.manipulation,
      customLimitBreak: customLimitBreakAxisBonuses.manipulation,
      traits: traitAxisBonuses.manipulation,
    },
  });
  const calibratedControlPressureRaw = controlPressureAxisBaselineModel.calibrated
    ? controlPressureAxisBaselineModel.rawActualControlPressureProxy
    : legacyManipulationRaw;
  const legacyRawSynergy =
    nonPowerContribution.synergy + effectivePowerAxisVector.synergy;
  const semanticSynergyAxisModel = computeLevel3SemanticSynergy({
    monster,
    powers: opts?.powerContribution?.powers,
    legacyRawSynergy,
    legacyNonPowerSynergy: nonPowerContribution.synergy,
    tuning: cfg.semanticSynergyAxisTuning,
  });
  const finalPreNormalizationAxes: RadarAxes = {
    physicalThreat: nonPowerContribution.physicalThreat + effectivePowerAxisVector.physicalThreat,
    mentalThreat: nonPowerContribution.mentalThreat + effectivePowerAxisVector.mentalThreat,
    physicalSurvivability:
      nonPowerContribution.physicalSurvivability +
      effectivePowerAxisVector.physicalSurvivability,
    mentalSurvivability:
      nonPowerContribution.mentalSurvivability +
      effectivePowerAxisVector.mentalSurvivability,
    manipulation: calibratedControlPressureRaw,
    synergy:
      semanticSynergyAxisModel.scoreOverride === null
        ? legacyRawSynergy
        : semanticSynergyAxisModel.rawSemanticSupport,
    mobility: nonPowerContribution.mobility + effectivePowerAxisVector.mobility,
    presence: calibratedPressureRaw,
  };
  const physicalThreatNormalization = normalizeThreatByAcceptedBaseline({
    value: finalPreNormalizationAxes.physicalThreat,
    level,
    tierKey: threatAxisTierKey,
    tuning: cfg.threatAxisTuning,
    netSuccessMultiplier,
    atWillThreatAxisMultiplier,
  });
  const mentalThreatNormalization = normalizeThreatByAcceptedBaseline({
    value: finalPreNormalizationAxes.mentalThreat,
    level,
    tierKey: threatAxisTierKey,
    tuning: cfg.threatAxisTuning,
    netSuccessMultiplier,
    atWillThreatAxisMultiplier,
  });
  const physicalDurabilityNormalization = durabilityBaselinePackage
    ? baselineRelativeDurability({
        lane: "physical",
        monster,
        config: cfg,
        baselinePackage: durabilityBaselinePackage,
        actualContext: defensiveProfileContext,
        defensiveContribution,
        supplemental: {
          power: effectivePowerAxisVector.physicalSurvivability,
          trait: traitAxisBonuses.physicalSurvivability,
          equipment: equipmentModifierAxisBonuses.physicalSurvivability,
          naturalAttack:
            naturalAttackGsAxisBonuses.physicalSurvivability +
            naturalAttackRangeAxisBonuses.physicalSurvivability,
          limitBreak: customLimitBreakAxisBonuses.physicalSurvivability,
        },
      })
    : null;
  const mentalDurabilityNormalization = durabilityBaselinePackage
    ? baselineRelativeDurability({
        lane: "mental",
        monster,
        config: cfg,
        baselinePackage: durabilityBaselinePackage,
        actualContext: defensiveProfileContext,
        defensiveContribution,
        supplemental: {
          power: effectivePowerAxisVector.mentalSurvivability,
          trait: traitAxisBonuses.mentalSurvivability,
          equipment: equipmentModifierAxisBonuses.mentalSurvivability,
          naturalAttack:
            naturalAttackGsAxisBonuses.mentalSurvivability +
            naturalAttackRangeAxisBonuses.mentalSurvivability,
          limitBreak: customLimitBreakAxisBonuses.mentalSurvivability,
        },
      })
    : null;
  const radarAxes: RadarAxes = {
    physicalThreat: physicalThreatNormalization.finalScore,
    mentalThreat: mentalThreatNormalization.finalScore,
    physicalSurvivability:
      physicalDurabilityNormalization?.finalScore ??
      normalizeByLevelCurve(
        finalPreNormalizationAxes.physicalSurvivability,
        physicalSurvivabilityCurvePoint,
        tierMultiplier,
      ),
    mentalSurvivability:
      mentalDurabilityNormalization?.finalScore ??
      normalizeByLevelCurve(
        finalPreNormalizationAxes.mentalSurvivability,
        mentalSurvivabilityCurvePoint,
        tierMultiplier,
      ),
    manipulation: controlPressureAxisBaselineModel.calibrated
      ? Number(controlPressureAxisBaselineModel.finalScore ?? 0)
      : normalizeByLevelCurve(
          finalPreNormalizationAxes.manipulation,
          manipulationCurvePoint,
          tierMultiplier,
        ),
    synergy:
      semanticSynergyAxisModel.scoreOverride ??
      normalizeByLevelCurve(
        finalPreNormalizationAxes.synergy,
        synergyCurvePoint,
        tierMultiplier,
      ),
    mobility: normalizeByLevelCurve(
      finalPreNormalizationAxes.mobility,
      mobilityCurvePoint,
      tierMultiplier,
    ),
    presence: pressureAxisBaselineModel.calibrated
      ? Number(pressureAxisBaselineModel.finalScore ?? 0)
      : normalizeByLevelCurve(
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
        axisVector: canonicalPowerAxisVector,
        canonicalPowerAxisVector,
        effectivePowerAxisVector,
        availabilityFactor: powerAvailability.availabilityFactor,
        effectivePowerFactor: powerAvailability.effectivePowerFactor,
        factorFormulaLabel: powerAvailability.factorFormulaLabel,
        availabilityReason: powerAvailability.availabilityReason,
        cooldownTurns: powerAvailability.cooldownTurns,
        cooldownSource: powerAvailability.cooldownSource,
        perPowerAvailability: powerAvailability.perPower,
        availabilityWarnings: powerAvailability.warnings,
        basePowerValue: opts?.powerContribution?.basePowerValue ?? null,
        powerCount: opts?.powerContribution?.powerCount ?? null,
        resolverDebug: opts?.powerContribution?.debug ?? null,
        source: opts?.powerContribution ? "canonical_phase6_resolver" : "none_provided",
        expectedAttackOutput: expectedPowerAttackContribution,
      },
      nonPowerContribution: {
        axisVector: nonPowerContribution,
        sources: {
          atWillSummary,
          atWillThreatAxisMultiplier,
          sustainedPhysicalThreatAxis,
          sustainedMentalThreatAxis,
          attackResistContribution: 0,
          intellectResistContribution: 0,
          defenceResistContribution,
          fortitudeResistContribution,
          supportResistContribution: 0,
          braveryResistContribution: 0,
          suppressedOffensiveResistContributions,
          resistAxisContributionPolicy:
            "Resist dice are defensive capability and do not emit offensive radar axes by themselves.",
          defensiveProfileContribution: defensiveContribution.axisVector,
          defensiveSharedDodgeContribution: defensiveContribution.sharedDodgeAxisVector,
          defensiveProfileTotals: defensiveContribution.totals,
          defensiveProfiles: defensiveContribution.profileBreakdown,
          defensivePackageDiagnostics: buildDefensivePackageDiagnostics(defensiveProfiles, level),
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
          c14LegendaryDurabilityBonus: {
            ...c14LegendaryDurabilityBonus,
            policy:
              durabilityBaselinePackage
                ? "disabled for Level 3 calibrated packages because deterministic three-Major-Injury modelling is active"
                : "legacy fallback bonus outside calibrated Level 3 packages; full Blaze and Major Injury modelling is unavailable in fallback mode",
          },
          rawSurvivabilityBudgetTargets: {
            source: "combat_tuning.raw_survivability_budget_level_neutral_numerator",
            referenceLevel: RAW_NUMERATOR_REFERENCE_LEVEL,
            physicalSurvivability: physicalSurvivabilityRawBudgetTarget,
            mentalSurvivability: mentalSurvivabilityRawBudgetTarget,
          },
          displaySurvivabilityCurvePoints: {
            source: "outcome_normalization.scoring_curves",
            physicalSurvivability: physicalSurvivabilityCurvePoint,
            mentalSurvivability: mentalSurvivabilityCurvePoint,
          },
          physicalPoolRawBonus: physicalPoolLane.rawBonus,
          mentalPoolRawBonus: mentalPoolLane.rawBonus,
          nonPowerPresenceBudget: legacyNonPowerPresenceBudget,
          legacyPresenceRaw,
        },
      },
      finalPreNormalizationAxes,
      semanticSynergyAxisModel,
      normalizationBreakdown: {
        level,
        tierKey,
        tierMultiplier,
        displayCurvePoints: {
          physicalThreat: physicalThreatCurvePoint,
          mentalThreat: mentalThreatCurvePoint,
          physicalSurvivability: physicalSurvivabilityCurvePoint,
          mentalSurvivability: mentalSurvivabilityCurvePoint,
          manipulation: manipulationCurvePoint,
          synergy: synergyCurvePoint,
          mobility: mobilityCurvePoint,
          presence: presenceCurvePoint,
        },
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
        rawAxisBudgetTargets: axisBudgetTargets,
        axisBudgetTargets,
        threatAxisBaselineModel: {
          source: "accepted_level_3_medium_attack_ruler",
          policy:
            "Threat axes normalize raw expected output against the accepted medium package instead of broad generic curve caps.",
          tierKey: threatAxisTierKey,
          physicalThreat: physicalThreatNormalization,
          mentalThreat: mentalThreatNormalization,
        },
        durabilityAxisBaselineModel: durabilityBaselinePackage
          ? {
              source: "accepted_level_3_durability_packages",
              policy:
                "Survivability axes are relative to the accepted package for the same level, tier, and legendary state; cross-tier ordering is not required.",
              fallback: false,
              baselinePackage: durabilityBaselinePackage,
              physicalSurvivability: physicalDurabilityNormalization,
              mentalSurvivability: mentalDurabilityNormalization,
            }
          : {
              source: "legacy_level_curve",
              policy:
                "No accepted durability package exists for this level/tier/legendary state; legacy generic level-curve normalization remains active.",
              fallback: true,
              baselinePackage: null,
              physicalSurvivability: null,
              mentalSurvivability: null,
            },
        controlPressureAxisBaselineModel,
        semanticSynergyAxisModel,
        pressureAxisBaselineModel,
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

