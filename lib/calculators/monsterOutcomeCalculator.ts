import type {
  CoreAttribute,
  LimitBreakTier,
  MonsterNaturalAttackConfig,
  MonsterPower,
  MonsterPowerIntention,
  MonsterTraitBand,
  MonsterTier,
  MonsterUpsertInput,
} from "@/lib/summoning/types";
import type { CalculatorConfig, LevelCurvePoint } from "@/lib/calculators/calculatorConfig";

export type MonsterCalculatorArchetype = "BALANCED" | "GLASS_CANNON" | "TANK" | "CONTROLLER";

export type RadarAxes = {
  physicalThreat: number;
  mentalThreat: number;
  survivability: number;
  manipulation: number;
  synergy: number;
  mobility: number;
  presence: number;
};

export type TraitAxisBonuses = {
  physicalThreat: number;
  mentalThreat: number;
  survivability: number;
  manipulation: number;
  synergy: number;
  mobility: number;
  presence: number;
};

export type TraitAxisWeightDefinition = {
  band?: MonsterTraitBand | null;
  physicalThreatWeight?: number | null;
  mentalThreatWeight?: number | null;
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
    melee?: { enabled?: boolean; targets?: number; physicalStrength?: number; mentalStrength?: number };
    ranged?: { enabled?: boolean; targets?: number; physicalStrength?: number; mentalStrength?: number };
    aoe?: { enabled?: boolean; count?: number; physicalStrength?: number; mentalStrength?: number };
  };
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
  | "braveryResistDie"
  | "defenceResistDie"
  | "fortitudeResistDie"
  | "intellectResistDie"
  | "limitBreakAttribute"
  | "limitBreakTier"
  | "limitBreak2Attribute"
  | "limitBreak2Tier"
  | "naturalAttack"
  | "powers"
  | "physicalResilienceMax"
  | "mentalPerseveranceMax"
  | "physicalProtection"
  | "mentalProtection"
  | "supportResistDie"
>;

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

type AtWillSummary = {
  bestPhysical: number;
  bestMental: number;
  bestTotal: number;
  hasRanged: boolean;
  hasAoe: boolean;
};

type Mode = "PHYSICAL" | "MENTAL";

const EMPTY_TRAIT_AXIS_BONUSES: TraitAxisBonuses = {
  physicalThreat: 0,
  mentalThreat: 0,
  survivability: 0,
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

function getSignedExpectedPoolShare(
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

function normalizeLabel(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function createEmptyAxisBonuses(): RadarAxes {
  return {
    physicalThreat: 0,
    mentalThreat: 0,
    survivability: 0,
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
    bonuses.physicalThreat +=
      clampTraitAxisWeight(trait.physicalThreatWeight) * TRAIT_AXIS_UNIT * pressureMultiplier;
    bonuses.mentalThreat +=
      clampTraitAxisWeight(trait.mentalThreatWeight) * TRAIT_AXIS_UNIT * pressureMultiplier;
    bonuses.survivability +=
      clampTraitAxisWeight(trait.survivabilityWeight) * TRAIT_AXIS_UNIT * pressureMultiplier;
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
    survivability: clampNonNegative(bonuses.survivability ?? 0),
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
    survivability: clampNonNegative(bonuses.survivability ?? 0),
    manipulation: clampNonNegative(bonuses.manipulation ?? 0),
    synergy: clampNonNegative(bonuses.synergy ?? 0),
    mobility: clampNonNegative(bonuses.mobility ?? 0),
    presence: clampNonNegative(bonuses.presence ?? 0),
  };
}

function getDurationTicks(
  power: Pick<MonsterPower, "durationType" | "durationTurns">,
  horizon: number,
): number {
  const t = String(power.durationType ?? "").toUpperCase();
  if (t === "INSTANT") return 1;
  if (t === "UNTIL_TARGET_NEXT_TURN") return 1;
  if (t === "TURNS") {
    const turns = Math.max(1, Math.floor(safeNum(power.durationTurns ?? 1)));
    return Math.min(turns, Math.max(1, horizon - 1));
  }
  if (t === "PASSIVE") {
    return Math.max(1, horizon - 1);
  }
  return 1;
}

function getRangeCategory(details: Record<string, unknown>): "SELF" | "MELEE" | "RANGED" | "AOE" {
  const rc = String(details.rangeCategory ?? "").trim().toUpperCase();
  if (rc === "SELF") return "SELF";
  if (rc === "AOE") return "AOE";
  if (rc === "RANGED") return "RANGED";
  return "MELEE";
}

function getRangeExtra(details: Record<string, unknown>): Record<string, unknown> {
  const extra = details.rangeExtra;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    return extra as Record<string, unknown>;
  }
  return {};
}

function estimateAoETargetsFromGeometry(
  details: Record<string, unknown>,
  tuning: CalculatorConfig["manipulationTuning"],
): number {
  const extra = getRangeExtra(details);
  const shape = String(extra.shape ?? details.shape ?? "").toUpperCase();
  const square = Math.max(1, Number(tuning.aoeGridSquareFeet ?? 25));
  let areaFeet2 = 0;

  if (shape === "SPHERE") {
    const r = safeNum(extra.sphereRadiusFeet ?? details.sphereRadiusFeet);
    areaFeet2 = Math.PI * r * r;
  } else if (shape === "CONE") {
    const l = safeNum(extra.coneLengthFeet ?? details.coneLengthFeet);
    const width = l;
    areaFeet2 = 0.5 * width * l;
  } else if (shape === "LINE") {
    const len = safeNum(extra.lineLengthFeet ?? details.lineLengthFeet);
    const w = safeNum(extra.lineWidthFeet ?? details.lineWidthFeet);
    areaFeet2 = Math.max(0, len * Math.max(1, w));
  } else {
    areaFeet2 = 0;
  }

  if (areaFeet2 <= 0) return 1;
  const est = areaFeet2 / square;
  return Math.max(1, est);
}

function computeDistanceScalar(
  details: Record<string, unknown>,
  tuning: CalculatorConfig["manipulationTuning"],
): number {
  const rc = getRangeCategory(details);

  if (rc === "SELF") {
    return 1;
  }

  if (rc === "RANGED") {
    const dist = safeNum(details.rangeValue ?? details.distance ?? 0);
    const rawBonus = (dist / 30) * tuning.rangedDistanceScalarPer30ft;
    const cap = Math.max(0, tuning.maxDistanceScalarBonus);
    const bonus = cap <= 0 ? 0 : cap * clamp01(rawBonus / cap);
    return 1 + Math.max(0, bonus);
  }

  if (rc === "AOE") {
    const extra = getRangeExtra(details);
    const cast = safeNum(details.rangeValue ?? extra.castRangeFeet ?? extra.centerRange ?? 0);
    const rawBonus = (cast / 30) * tuning.aoeCastRangeScalarPer30ft;
    const cap = Math.max(0, tuning.maxDistanceScalarBonus);
    const bonus = cap <= 0 ? 0 : cap * clamp01(rawBonus / cap);
    return 1 + Math.max(0, bonus);
  }

  return 1;
}

function computeTargetScalar(details: Record<string, unknown>, cfg: CalculatorConfig): number {
  const tuning = cfg.manipulationTuning;
  const rc = getRangeCategory(details);
  const extra = getRangeExtra(details);

  if (rc === "SELF") {
    return 1;
  }

  if (rc === "MELEE") {
    const targets = Math.max(1, Math.floor(safeNum(details.targets ?? details.rangeValue ?? 1)));
    const exp = Number(tuning.meleeTargetExponent ?? 0.7);
    return Math.pow(targets, exp);
  }

  if (rc === "RANGED") {
    const targets = Math.max(1, Math.floor(safeNum(details.targets ?? extra.targets ?? 1)));
    const exp = Number(tuning.rangedTargetExponent ?? 0.8);
    return Math.pow(targets, exp);
  }

  const aoeCount = Math.max(1, Math.floor(safeNum(extra.count ?? details.count ?? 1)));
  const baseTargets = estimateAoETargetsFromGeometry(details, tuning);
  const countScalar = Math.pow(aoeCount, tuning.aoeCountExponent);
  const maxTargets = Math.max(1, Math.floor(safeNum(tuning.aoeMaxExpectedTargets ?? 12)));
  const expected = Math.min(maxTargets, baseTargets * countScalar);
  return Math.max(1, expected);
}

function computeImpactMultiplier(details: Record<string, unknown>, cfg: CalculatorConfig): number {
  const tuning = cfg.manipulationTuning;
  const rc = getRangeCategory(details);
  const rangeMult = tuning.rangeCategoryMultiplier[rc] ?? 1;
  const distanceMult = computeDistanceScalar(details, tuning);
  const targetMult = computeTargetScalar(details, cfg);
  return rangeMult * distanceMult * targetMult;
}

function controlTSUPerSuccess(details: Record<string, unknown>): number {
  const mode = normalizeLabel(details.controlMode);
  if (!mode) return 1.0;

  if (mode.includes("no move")) return 1.0;
  if (
    mode.includes("force move") ||
    mode.includes("push") ||
    mode.includes("pull") ||
    mode.includes("knockback")
  ) {
    return 1.25;
  }
  if (mode.includes("no main")) return 2.0;
  if (mode.includes("force main")) return 1.75;
  if (mode.includes("friendly fire")) return 2.25;
  if (mode.includes("specific power") || mode.includes("burn")) return 2.5;

  return 1.0;
}

function debuffTSUPerSuccess(powerPotency: number): number {
  const p = Math.max(1, Math.min(5, Math.trunc(powerPotency || 1)));
  return p * 0.5;
}

function movementTSUPerSuccess(details: Record<string, unknown>): number {
  const mode = normalizeLabel(details.movementMode);
  if (!mode) return 0;
  if (mode.includes("force")) return 1.25;
  return 0;
}

function getPowerCooldown(power: Pick<MonsterPower, "cooldownTurns" | "cooldownReduction">): number {
  return Math.max(1, power.cooldownTurns - power.cooldownReduction);
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
  if (attribute === "DEFENCE" || attribute === "FORTITUDE") return "survivability";
  if (attribute === "INTELLECT") return "mentalThreat";
  if (attribute === "SUPPORT") return "synergy";
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
    bonuses.survivability += slotBonus.survivability;
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

function getLevelWoundBonus(level?: number): number {
  const parsed = typeof level === "number" ? level : Number(level ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed / 3);
}

function computeAtWillFromAttackConfig(
  attackConfig: AttackConfigLike,
  successChance: number,
  aoeMultiplier: number,
  netSuccessMultiplier: number,
  strengthMultiplier: number,
  level: number,
): AtWillContribution {
  if (!attackConfig) {
    return {
      physical: 0,
      mental: 0,
      total: 0,
      hasRanged: false,
      hasAoe: false,
    };
  }

  let physical = 0;
  let mental = 0;
  let hasRanged = false;
  let hasAoe = false;
  const strengthScalar = clampNonNegative(Number(strengthMultiplier || 0));

  const applyContribution = (
    physicalStrength: unknown,
    mentalStrength: unknown,
    damageTypes: unknown,
    multiplier: number,
  ) => {
    let physicalValue = clampNonNegative(Number(physicalStrength ?? 0));
    let mentalValue = clampNonNegative(Number(mentalStrength ?? 0));
    const damageTypeCount = Math.max(1, readStringArray(damageTypes).length);
    const modes = readDamageModes(damageTypes);

    if (modes.has("MENTAL") && !modes.has("PHYSICAL") && mentalValue === 0 && physicalValue > 0) {
      mentalValue = physicalValue;
      physicalValue = 0;
    }
    if (modes.has("PHYSICAL") && !modes.has("MENTAL") && physicalValue === 0 && mentalValue > 0) {
      physicalValue = mentalValue;
      mentalValue = 0;
    }

    const toWoundsPerSuccess = (strength: number): number => {
      const base = strength * strengthScalar;
      if (!(base > 0)) return base;
      return base + getLevelWoundBonus(level);
    };

    const scalar = successChance * netSuccessMultiplier * Math.max(0, multiplier);
    physical += toWoundsPerSuccess(physicalValue) * scalar * damageTypeCount;
    mental += toWoundsPerSuccess(mentalValue) * scalar * damageTypeCount;
  };

  if (attackConfig.melee?.enabled) {
    const targets = readMultiplier(attackConfig.melee.targets, 1);
    applyContribution(
      attackConfig.melee.physicalStrength,
      attackConfig.melee.mentalStrength,
      attackConfig.melee.damageTypes,
      targets,
    );
  }

  if (attackConfig.ranged?.enabled) {
    hasRanged = true;
    const targets = readMultiplier(attackConfig.ranged.targets, 1);
    applyContribution(
      attackConfig.ranged.physicalStrength,
      attackConfig.ranged.mentalStrength,
      attackConfig.ranged.damageTypes,
      targets,
    );
  }

  if (attackConfig.aoe?.enabled) {
    hasAoe = true;
    const count = readMultiplier(attackConfig.aoe.count, 1);
    applyContribution(
      attackConfig.aoe.physicalStrength,
      attackConfig.aoe.mentalStrength,
      attackConfig.aoe.damageTypes,
      aoeMultiplier * count,
    );
  }

  return {
    physical,
    mental,
    total: physical + mental,
    hasRanged,
    hasAoe,
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

export function computeSEUFromIntention(
  intention: MonsterPowerIntention,
  power: Pick<MonsterPower, "diceCount">,
  attackDie: string,
  cfg: CalculatorConfig,
): number {
  if (
    intention.type !== "AUGMENT" &&
    intention.type !== "DEBUFF" &&
    intention.type !== "CLEANSE"
  ) {
    return 0;
  }

  const details = (intention.detailsJson ?? {}) as Record<string, unknown>;
  const expectedSuccesses =
    clampNonNegative(power.diceCount) * successChanceFromDieSides(dieSidesFromDieString(attackDie));
  const expectedStacksApplied = expectedSuccesses;

  let fallbackSeuPerSuccess = 0;
  let fallbackSeuPerStack = 0;

  if (intention.type === "AUGMENT") {
    fallbackSeuPerSuccess = cfg.seuFallbacks.augmentSeuPerSuccess;
    fallbackSeuPerStack = cfg.seuFallbacks.augmentSeuPerStack;
  } else if (intention.type === "DEBUFF") {
    fallbackSeuPerSuccess = cfg.seuFallbacks.debuffSeuPerSuccess;
    fallbackSeuPerStack = cfg.seuFallbacks.debuffSeuPerStack;
  } else {
    fallbackSeuPerSuccess = cfg.seuFallbacks.cleanseSeuPerSuccess;
    fallbackSeuPerStack = cfg.seuFallbacks.cleanseSeuPerStack;
  }

  const seuPerSuccess = readPositiveNumber(details.seuPerSuccess) ?? fallbackSeuPerSuccess;
  const seuPerStack = readPositiveNumber(details.seuPerStack) ?? fallbackSeuPerStack;

  return seuPerSuccess * expectedSuccesses + seuPerStack * expectedStacksApplied;
}

export function computeMonsterOutcomes(
  monster: MonsterOutcomeInput,
  config: CalculatorConfig,
  opts?: {
    equippedWeaponSources?: WeaponAttackSource[];
    equipmentModifierAxisBonuses?: Partial<RadarAxes>;
    naturalAttackGsAxisBonuses?: Partial<RadarAxes>;
    naturalAttackRangeAxisBonuses?: Partial<RadarAxes>;
    traitAxisBonuses?: Partial<TraitAxisBonuses>;
  },
): MonsterOutcomeProfile {
  const cfg = config;
  const netSuccessMultiplier = cfg.baselineParty.netSuccessMultiplier;
  const successChance = successChanceFromDieSides(dieSidesFromDieString(monster.attackDie));

  const atWillCandidates: AtWillContribution[] = [];
  for (const attack of monster.attacks ?? []) {
    if (attack.attackMode !== "NATURAL") continue;
    atWillCandidates.push(
      computeAtWillFromAttackConfig(
        withEffectiveNaturalAoeTargetCount(attack.attackConfig as AttackConfigLike),
        successChance,
        cfg.baselineParty.aoeMultiplier,
        netSuccessMultiplier,
        2,
        monster.level,
      ),
    );
  }
  if (monster.naturalAttack?.attackConfig) {
    atWillCandidates.push(
      computeAtWillFromAttackConfig(
        withEffectiveNaturalAoeTargetCount(monster.naturalAttack.attackConfig as AttackConfigLike),
        successChance,
        cfg.baselineParty.aoeMultiplier,
        netSuccessMultiplier,
        2,
        monster.level,
      ),
    );
  }
  for (const equippedWeaponSource of opts?.equippedWeaponSources ?? []) {
    atWillCandidates.push(
      computeAtWillFromAttackConfig(
        equippedWeaponSource.attackConfig as AttackConfigLike,
        successChance,
        cfg.baselineParty.aoeMultiplier,
        netSuccessMultiplier,
        1,
        monster.level,
      ),
    );
  }
  const atWillSummary = summarizeAtWillCandidates(atWillCandidates);

  let sustainedPhysical = atWillSummary.bestPhysical;
  let sustainedMental = atWillSummary.bestMental;
  let spike = atWillSummary.bestTotal;
  let seuPerRound = 0;
  let tsuPerRound = 0;
  const intentionCounts: Record<MonsterPowerIntention["type"], number> = {
    ATTACK: 0,
    DEFENCE: 0,
    HEALING: 0,
    CLEANSE: 0,
    CONTROL: 0,
    MOVEMENT: 0,
    AUGMENT: 0,
    DEBUFF: 0,
    SUMMON: 0,
    TRANSFORMATION: 0,
  };
  let hasRangedPressure = atWillSummary.hasRanged;
  let hasAoePressure = atWillSummary.hasAoe;
  let movementPotencyTotal = 0;

  const horizon = Math.max(1, Math.floor(safeNum(cfg.baselineParty.combatHorizonRounds ?? 5)));

  for (const power of monster.powers ?? []) {
    const cooldown = getPowerCooldown(power);
    const powerExpectedSuccesses = clampNonNegative(power.diceCount) * successChance;
    const ticks = getDurationTicks(power, horizon);
    const primaryRangeDetails = (power.intentions?.[0]?.detailsJson ?? {}) as Record<string, unknown>;

    for (const intention of power.intentions ?? []) {
      intentionCounts[intention.type] += 1;
      const details = (intention.detailsJson ?? {}) as Record<string, unknown>;
      const hasOwnRangeDetails =
        details.rangeCategory !== undefined ||
        details.rangeValue !== undefined ||
        details.rangeExtra !== undefined ||
        details.targets !== undefined ||
        details.count !== undefined ||
        details.distance !== undefined ||
        details.shape !== undefined;
      const impactDetails = hasOwnRangeDetails ? details : primaryRangeDetails;
      const impact = computeImpactMultiplier(impactDetails, cfg);

      const seuPerUse = computeSEUFromIntention(intention, power, monster.attackDie, cfg);
      if (seuPerUse > 0) seuPerRound += (seuPerUse * ticks * impact) / cooldown;

      if (intention.type === "CONTROL") {
        const tsuPerSuccess = controlTSUPerSuccess(details);
        const tsuPerUse = powerExpectedSuccesses * tsuPerSuccess * ticks * impact;
        tsuPerRound += tsuPerUse / cooldown;
      }

      if (intention.type === "DEBUFF") {
        const tsuPerSuccess = debuffTSUPerSuccess(power.potency);
        const tsuPerUse = powerExpectedSuccesses * tsuPerSuccess * ticks * impact;
        tsuPerRound += tsuPerUse / cooldown;
      }

      if (intention.type === "MOVEMENT") {
        movementPotencyTotal += clampNonNegative(power.potency);
        const tsuPerSuccess = movementTSUPerSuccess(details);
        if (tsuPerSuccess > 0) {
          const tsuPerUse = powerExpectedSuccesses * tsuPerSuccess * ticks * impact;
          tsuPerRound += tsuPerUse / cooldown;
        }
      }

      if (intention.type !== "ATTACK") continue;

      const attackMode = String(details.attackMode ?? "").trim().toUpperCase();
      const rangeCategory = String(impactDetails.rangeCategory ?? "").trim().toUpperCase();
      if (rangeCategory === "RANGED") hasRangedPressure = true;
      if (rangeCategory === "AOE") hasAoePressure = true;

      const damageTypes = readStringArray(details.damageTypes);
      const damageTypeCount = Math.max(1, damageTypes.length);
      const woundsPerSuccess = power.potency * 2 * damageTypeCount;

      let expectedWoundsPerUse = powerExpectedSuccesses * woundsPerSuccess;
      if (rangeCategory === "AOE") expectedWoundsPerUse *= cfg.baselineParty.aoeMultiplier;
      expectedWoundsPerUse *= netSuccessMultiplier;

      const perRound = expectedWoundsPerUse / cooldown;
      if (attackMode === "MENTAL") sustainedMental += perRound;
      else sustainedPhysical += perRound;

      spike = Math.max(spike, expectedWoundsPerUse);
    }
  }

  const sustainedTotal = sustainedPhysical + sustainedMental;

  const partyWPR =
    clampNonNegative(cfg.baselineParty.focusedWPR) +
    clampNonNegative(cfg.baselineParty.typicalWPR) * (Math.max(1, cfg.baselineParty.size) - 1);

  // SC_DEFENCE_STRING_SURVIVABILITY_V1
  // Raw PP/MP should not directly reduce incoming WPR here.
  // Protection is already represented through the editor-side defence-string
  // survivability bonus built from Dodge + Physical Protection output + Mental Protection output.
  const netIncoming = Math.max(1, partyWPR);

  const roundsToPRZero = clampNonNegative(monster.physicalResilienceMax) / netIncoming;
  const roundsToMPZero = clampNonNegative(monster.mentalPerseveranceMax) / netIncoming;
  const survivabilityRounds = Math.min(roundsToPRZero, roundsToMPZero);
  const manipulationBudget = clampNonNegative(tsuPerRound);
  const synergyBudget =
    intentionCounts.AUGMENT * 3 +
    intentionCounts.HEALING * 2 +
    intentionCounts.CLEANSE * 1.5 +
    clampNonNegative(seuPerRound);
  const mobilityBudget =
    intentionCounts.MOVEMENT * 2 +
    (movementPotencyTotal * 5) / 15 +
    (hasRangedPressure ? 1.5 : 0) +
    (hasAoePressure ? 1 : 0);
  const presenceBudget = spike * 0.6 + sustainedTotal * 0.4 + (hasAoePressure ? 1.5 : 0);

  const level = Math.max(1, Math.trunc(monster.level || 1));
  const tierKey = toTierBudgetKey(monster);
  const tierMultiplier = cfg.tierMultipliers[tierKey] ?? 1;
  const resistPressureMultiplier = getResistPressureMultiplier(level, tierKey);
  const physicalThreatCurvePoint = getCurvePointForLevel(cfg.scoringCurves.physicalThreat, level);
  const mentalThreatCurvePoint = getCurvePointForLevel(cfg.scoringCurves.mentalThreat, level);
  const survivabilityCurvePoint = getCurvePointForLevel(cfg.scoringCurves.survivability, level);
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
  const weakerPoolRatio = Math.min(physicalPoolRatio, mentalPoolRatio);
  const averagePoolRatio = (physicalPoolRatio + mentalPoolRatio) / 2;
  const poolWeightTotal = Math.max(
    0.0001,
    cfg.healthPoolTuning.weakerSideWeight + cfg.healthPoolTuning.averageWeight,
  );
  const combinedPoolRatio =
    (weakerPoolRatio * cfg.healthPoolTuning.weakerSideWeight +
      averagePoolRatio * cfg.healthPoolTuning.averageWeight) /
    poolWeightTotal;
  const poolHealthShare = getSignedExpectedPoolShare(combinedPoolRatio, cfg.healthPoolTuning);
  const poolHealthRawBonus =
    getTierAdjustedAxisBudgetTarget(survivabilityCurvePoint, tierMultiplier) * poolHealthShare;
  const axisBudgetTargets: RadarAxes = {
    physicalThreat: getTierAdjustedAxisBudgetTarget(physicalThreatCurvePoint, tierMultiplier),
    mentalThreat: getTierAdjustedAxisBudgetTarget(mentalThreatCurvePoint, tierMultiplier),
    survivability: getTierAdjustedAxisBudgetTarget(survivabilityCurvePoint, tierMultiplier),
    manipulation: getTierAdjustedAxisBudgetTarget(manipulationCurvePoint, tierMultiplier),
    synergy: getTierAdjustedAxisBudgetTarget(synergyCurvePoint, tierMultiplier),
    mobility: getTierAdjustedAxisBudgetTarget(mobilityCurvePoint, tierMultiplier),
    presence: getTierAdjustedAxisBudgetTarget(presenceCurvePoint, tierMultiplier),
  };
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
    getResistBudgetShare(monster.defenceResistDie),
    survivabilityCurvePoint,
    tierMultiplier,
    resistPressureMultiplier,
  );
  const fortitudeResistContribution = getRawAxisContributionFromBudgetShare(
    getResistBudgetShare(monster.fortitudeResistDie),
    survivabilityCurvePoint,
    tierMultiplier,
    resistPressureMultiplier,
  );
  const supportResistContribution = getRawAxisContributionFromBudgetShare(
    getResistBudgetShare(monster.supportResistDie),
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
  const naturalAttackGsAxisBonuses = normalizeRawAxisBonuses(opts?.naturalAttackGsAxisBonuses);
  const naturalAttackRangeAxisBonuses = normalizeRawAxisBonuses(
    opts?.naturalAttackRangeAxisBonuses,
  );
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
  const physicalThreatBudget =
    sustainedPhysical +
    attackResistContribution +
    routedEquipmentPhysicalThreatBonus +
    naturalAttackGsAxisBonuses.physicalThreat +
    naturalAttackRangeAxisBonuses.physicalThreat +
    customLimitBreakAxisBonuses.physicalThreat +
    traitAxisBonuses.physicalThreat;
  const mentalThreatBudget =
    sustainedMental +
    intellectResistContribution +
    routedEquipmentMentalThreatBonus +
    equipmentModifierAxisBonuses.mentalThreat +
    naturalAttackGsAxisBonuses.mentalThreat +
    naturalAttackRangeAxisBonuses.mentalThreat +
    customLimitBreakAxisBonuses.mentalThreat +
    traitAxisBonuses.mentalThreat;
  const survivabilityBudget =
    poolHealthRawBonus +
    defenceResistContribution +
    fortitudeResistContribution +
    equipmentModifierAxisBonuses.survivability +
    naturalAttackGsAxisBonuses.survivability +
    customLimitBreakAxisBonuses.survivability +
    traitAxisBonuses.survivability;
  const manipulationAxisBudget =
    manipulationBudget +
    braveryResistContribution +
    equipmentModifierAxisBonuses.manipulation +
    naturalAttackGsAxisBonuses.manipulation +
    customLimitBreakAxisBonuses.manipulation +
    traitAxisBonuses.manipulation;
  const synergyAxisBudget =
    synergyBudget +
    supportResistContribution +
    equipmentModifierAxisBonuses.synergy +
    naturalAttackGsAxisBonuses.synergy +
    customLimitBreakAxisBonuses.synergy +
    traitAxisBonuses.synergy;
  const mobilityAxisBudget =
    mobilityBudget +
    naturalAttackGsAxisBonuses.mobility +
    naturalAttackRangeAxisBonuses.mobility +
    customLimitBreakAxisBonuses.mobility +
    traitAxisBonuses.mobility;
  const presenceAxisBudget =
    presenceBudget +
    naturalAttackGsAxisBonuses.presence +
    naturalAttackRangeAxisBonuses.presence +
    customLimitBreakAxisBonuses.presence +
    traitAxisBonuses.presence;
  const radarAxes: RadarAxes = {
    physicalThreat: normalizeByLevelCurve(
      physicalThreatBudget,
      physicalThreatCurvePoint,
      tierMultiplier,
    ),
    mentalThreat: normalizeByLevelCurve(
      mentalThreatBudget,
      mentalThreatCurvePoint,
      tierMultiplier,
    ),
    survivability: normalizeByLevelCurve(
      survivabilityBudget,
      survivabilityCurvePoint,
      tierMultiplier,
    ),
    manipulation: normalizeByLevelCurve(
      manipulationAxisBudget,
      manipulationCurvePoint,
      tierMultiplier,
    ),
    synergy: normalizeByLevelCurve(
      synergyAxisBudget,
      synergyCurvePoint,
      tierMultiplier,
    ),
    mobility: normalizeByLevelCurve(
      mobilityAxisBudget,
      mobilityCurvePoint,
      tierMultiplier,
    ),
    presence: normalizeByLevelCurve(
      presenceAxisBudget,
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
      poolHealthBreakdown: {
        expectedPhysicalResilience,
        expectedMentalPerseverance,
        physicalPoolRatio,
        mentalPoolRatio,
        weakerPoolRatio,
        averagePoolRatio,
        combinedPoolRatio,
        signedPoolShare: poolHealthShare,
        rawBonus: poolHealthRawBonus,
        legacyRoundsToPRZero: roundsToPRZero,
        legacyRoundsToMPZero: roundsToMPZero,
        legacySurvivabilityRounds: survivabilityRounds,
      },
    },
  };
}
