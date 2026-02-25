import type {
  MonsterNaturalAttackConfig,
  MonsterPower,
  MonsterPowerIntention,
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
};

type MonsterOutcomeInput = Pick<
  MonsterUpsertInput,
  | "level"
  | "tier"
  | "legendary"
  | "attackDie"
  | "attacks"
  | "naturalAttack"
  | "powers"
  | "physicalResilienceMax"
  | "mentalPerseveranceMax"
  | "physicalProtection"
  | "mentalProtection"
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

type Mode = "PHYSICAL" | "MENTAL";

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

function getRangeCategory(details: Record<string, unknown>): "MELEE" | "RANGED" | "AOE" {
  const rc = String(details.rangeCategory ?? "").trim().toUpperCase();
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
  const tierAdjustedMax = curvePoint.max * Math.max(0, tierMultiplier);
  const span = tierAdjustedMax - curvePoint.min;
  if (!Number.isFinite(span) || span <= 0) {
    return value >= tierAdjustedMax ? 10 : 0;
  }
  const normalized = ((value - curvePoint.min) / span) * 10;
  return clampRadarScore(normalized);
}

function toTierBudgetKey(monster: Pick<MonsterOutcomeInput, "tier" | "legendary">): TierBudgetKey {
  if (monster.legendary) return "LEGENDARY";
  const tier = String(monster.tier ?? "MINION").toUpperCase() as MonsterTier | "LEGENDARY";
  if (tier === "MINION" || tier === "ELITE" || tier === "BOSS") return tier;
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

function computeAtWillFromAttackConfig(
  attackConfig: AttackConfigLike,
  successChance: number,
  aoeMultiplier: number,
  netSuccessMultiplier: number,
  strengthMultiplier: number,
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
    const modes = readDamageModes(damageTypes);

    if (modes.has("MENTAL") && !modes.has("PHYSICAL") && mentalValue === 0 && physicalValue > 0) {
      mentalValue = physicalValue;
      physicalValue = 0;
    }
    if (modes.has("PHYSICAL") && !modes.has("MENTAL") && physicalValue === 0 && mentalValue > 0) {
      physicalValue = mentalValue;
      mentalValue = 0;
    }

    const scalar = successChance * netSuccessMultiplier * Math.max(0, multiplier);
    physical += physicalValue * strengthScalar * scalar;
    mental += mentalValue * strengthScalar * scalar;
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

function pickBestAtWillSource(candidates: AtWillContribution[]): AtWillContribution {
  let best: AtWillContribution = {
    physical: 0,
    mental: 0,
    total: 0,
    hasRanged: false,
    hasAoe: false,
  };
  for (const candidate of candidates) {
    if (candidate.total > best.total) best = candidate;
  }
  return best;
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
  opts?: { equippedWeaponSources?: WeaponAttackSource[] },
): MonsterOutcomeProfile {
  const cfg = config;
  const netSuccessMultiplier = cfg.baselineParty.netSuccessMultiplier;
  const successChance = successChanceFromDieSides(dieSidesFromDieString(monster.attackDie));

  const atWillCandidates: AtWillContribution[] = [];
  for (const attack of monster.attacks ?? []) {
    if (attack.attackMode !== "NATURAL") continue;
    atWillCandidates.push(
      computeAtWillFromAttackConfig(
        attack.attackConfig as AttackConfigLike,
        successChance,
        cfg.baselineParty.aoeMultiplier,
        netSuccessMultiplier,
        2,
      ),
    );
  }
  if (monster.naturalAttack?.attackConfig) {
    atWillCandidates.push(
      computeAtWillFromAttackConfig(
        monster.naturalAttack.attackConfig as AttackConfigLike,
        successChance,
        cfg.baselineParty.aoeMultiplier,
        netSuccessMultiplier,
        2,
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
      ),
    );
  }
  const bestAtWill = pickBestAtWillSource(atWillCandidates);

  let sustainedPhysical = bestAtWill.physical;
  let sustainedMental = bestAtWill.mental;
  let spike = bestAtWill.total;
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
  let hasRangedPressure = atWillCandidates.some((candidate) => candidate.hasRanged);
  let hasAoePressure = atWillCandidates.some((candidate) => candidate.hasAoe);
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

  const netPhysicalIncoming = Math.max(
    1,
    partyWPR - clampNonNegative(monster.physicalProtection),
  );
  const netMentalIncoming = Math.max(
    1,
    partyWPR - clampNonNegative(monster.mentalProtection),
  );

  const roundsToPRZero = clampNonNegative(monster.physicalResilienceMax) / netPhysicalIncoming;
  const roundsToMPZero = clampNonNegative(monster.mentalPerseveranceMax) / netMentalIncoming;
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
  const radarAxes: RadarAxes = {
    physicalThreat: normalizeByLevelCurve(
      sustainedPhysical,
      getCurvePointForLevel(cfg.scoringCurves.physicalThreat, level),
      tierMultiplier,
    ),
    mentalThreat: normalizeByLevelCurve(
      sustainedMental,
      getCurvePointForLevel(cfg.scoringCurves.mentalThreat, level),
      tierMultiplier,
    ),
    survivability: normalizeByLevelCurve(
      survivabilityRounds,
      getCurvePointForLevel(cfg.scoringCurves.survivability, level),
      tierMultiplier,
    ),
    manipulation: normalizeByLevelCurve(
      manipulationBudget,
      getCurvePointForLevel(cfg.scoringCurves.manipulation, level),
      tierMultiplier,
    ),
    synergy: normalizeByLevelCurve(
      synergyBudget,
      getCurvePointForLevel(cfg.scoringCurves.synergy, level),
      tierMultiplier,
    ),
    mobility: normalizeByLevelCurve(
      mobilityBudget,
      getCurvePointForLevel(cfg.scoringCurves.mobility, level),
      tierMultiplier,
    ),
    presence: normalizeByLevelCurve(
      presenceBudget,
      getCurvePointForLevel(cfg.scoringCurves.presence, level),
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
  };
}
