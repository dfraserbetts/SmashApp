import type { CombatDieSize } from "@/lib/combat-lab/types";

export type OffencePressureApplicationMode = "costing" | "reviewOnly";

export type OffencePressureWarningLevel = "none" | "watch" | "burstWarning" | "extremeP20Review";

export type OffencePressureAnalysis = {
  diceCount: number;
  woundsPerSuccess: number;
  die: CombatDieSize | null;
  basePowerValueSurcharge: number;
  warningLevel: OffencePressureWarningLevel;
  burstScore: number;
  twoSuccessFaceProbability: number | null;
  p16Raw: number | null;
  p20Raw: number | null;
  reasons: string[];
};

export const OFFENCE_PRESSURE_CONSTANTS = {
  woundsPerSuccessSoftCap: 4,
  basePowerValueSurchargeScalar: 0.5,
  basePowerValueSurchargeCap: 12,
  burstWarningScore: 35,
  extremeP20Probability: 0.5,
} as const;

const DIE_SIDES: Record<CombatDieSize, number> = {
  D4: 4,
  D6: 6,
  D8: 8,
  D10: 10,
  D12: 12,
};

function roundCost(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizedDiceCount(value: number): number {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
}

function normalizedWoundsPerSuccess(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function successProbabilitiesForDie(die: CombatDieSize): [number, number, number] {
  const sides = DIE_SIDES[die];
  const zeroFaces = Math.min(3, sides);
  const oneFaces = Math.max(0, Math.min(9, sides) - 3);
  const twoFaces = Math.max(0, sides - 9);
  return [zeroFaces / sides, oneFaces / sides, twoFaces / sides];
}

function successDistribution(diceCount: number, die: CombatDieSize): number[] {
  const [p0, p1, p2] = successProbabilitiesForDie(die);
  let distribution = [1];
  for (let index = 0; index < diceCount; index += 1) {
    const next = Array(distribution.length + 2).fill(0) as number[];
    distribution.forEach((probability, successes) => {
      next[successes] += probability * p0;
      next[successes + 1] += probability * p1;
      next[successes + 2] += probability * p2;
    });
    distribution = next;
  }
  return distribution;
}

function probabilityRawAtLeast(diceCount: number, die: CombatDieSize, woundsPerSuccess: number, threshold: number): number {
  if (diceCount <= 0 || woundsPerSuccess <= 0) return 0;
  return successDistribution(diceCount, die).reduce(
    (sum, probability, successes) => sum + (successes * woundsPerSuccess >= threshold ? probability : 0),
    0,
  );
}

export function analyzeOffencePressure(params: {
  diceCount: number;
  woundsPerSuccess: number;
  die?: CombatDieSize | null;
}): OffencePressureAnalysis {
  const diceCount = normalizedDiceCount(params.diceCount);
  const woundsPerSuccess = normalizedWoundsPerSuccess(params.woundsPerSuccess);
  const die = params.die ?? null;
  const overSoftCap = Math.max(0, woundsPerSuccess - OFFENCE_PRESSURE_CONSTANTS.woundsPerSuccessSoftCap);
  const uncappedSurcharge =
    diceCount * overSoftCap * overSoftCap * OFFENCE_PRESSURE_CONSTANTS.basePowerValueSurchargeScalar;
  const basePowerValueSurcharge = roundCost(
    Math.min(OFFENCE_PRESSURE_CONSTANTS.basePowerValueSurchargeCap, uncappedSurcharge),
  );
  const reasons: string[] = [];
  if (basePowerValueSurcharge > 0) {
    reasons.push(
      `W/S ${woundsPerSuccess} exceeds soft cap ${OFFENCE_PRESSURE_CONSTANTS.woundsPerSuccessSoftCap}.`,
    );
  }
  if (uncappedSurcharge > basePowerValueSurcharge) {
    reasons.push(
      `BasePowerValue surcharge capped at ${OFFENCE_PRESSURE_CONSTANTS.basePowerValueSurchargeCap}.`,
    );
  }

  const twoSuccessFaceProbability = die ? successProbabilitiesForDie(die)[2] : null;
  const p16Raw = die ? probabilityRawAtLeast(diceCount, die, woundsPerSuccess, 16) : null;
  const p20Raw = die ? probabilityRawAtLeast(diceCount, die, woundsPerSuccess, 20) : null;
  if (twoSuccessFaceProbability && twoSuccessFaceProbability > 0) {
    reasons.push(`${die} has ${(twoSuccessFaceProbability * 100).toFixed(1)}% natural 10+ faces.`);
  }
  if (p20Raw !== null && p20Raw >= OFFENCE_PRESSURE_CONSTANTS.extremeP20Probability) {
    reasons.push(`P20 raw output chance ${(p20Raw * 100).toFixed(1)}% requires signature/offence review.`);
  }

  const burstScore = roundCost(
    basePowerValueSurcharge * 6 +
      (twoSuccessFaceProbability ?? 0) * diceCount * 10 +
      (p16Raw ?? 0) * 40 +
      (p20Raw ?? 0) * 80,
  );
  const warningLevel: OffencePressureWarningLevel =
    p20Raw !== null && p20Raw >= OFFENCE_PRESSURE_CONSTANTS.extremeP20Probability
      ? "extremeP20Review"
      : burstScore >= OFFENCE_PRESSURE_CONSTANTS.burstWarningScore
        ? "burstWarning"
        : basePowerValueSurcharge > 0
          ? "watch"
          : "none";

  return {
    diceCount,
    woundsPerSuccess,
    die,
    basePowerValueSurcharge,
    warningLevel,
    burstScore,
    twoSuccessFaceProbability,
    p16Raw,
    p20Raw,
    reasons,
  };
}
