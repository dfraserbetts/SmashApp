import type { MonsterCalculatorArchetype } from "@/lib/calculators/monsterOutcomeCalculator";
import type { DiceSize, MonsterTier } from "@/lib/summoning/types";

export type AttributeBudgetStatus = "Under Budget" | "On Budget" | "Over Budget";
export type AttributeShapeReadout =
  | "Broadly Balanced"
  | "Light Specialist"
  | "Strong Specialist"
  | "Extreme Specialist";
export type AttributeWeaknessReadout =
  | "No Clear Weakness"
  | "One Clear Weakness"
  | "Multiple Clear Weaknesses";
export type AttributeArchetypeFit = "Good Fit" | "Partial Fit" | "Soft Tension";

export type AttributeBalancingGuideInput = {
  level: number;
  tier: MonsterTier;
  archetype: MonsterCalculatorArchetype;
  attributes: {
    attackDie: DiceSize;
    guardDie: DiceSize;
    fortitudeDie: DiceSize;
    intellectDie: DiceSize;
    synergyDie: DiceSize;
    braveryDie: DiceSize;
  };
};

export type AttributeBalancingGuide = {
  currentTotal: number;
  expectedTotal: number;
  budgetDelta: number;
  budgetStatus: AttributeBudgetStatus;
  shapeReadout: AttributeShapeReadout;
  weaknessReadout: AttributeWeaknessReadout;
  archetypeFit: AttributeArchetypeFit;
  archetypeFitNote: string;
  highAttributes: string[];
  lowAttributes: string[];
};

const EXPECTED_ATTRIBUTE_TOTALS: Record<number, Record<MonsterTier, number>> = {
  1: { MINION: 32, SOLDIER: 36, ELITE: 40, BOSS: 44 },
  2: { MINION: 32, SOLDIER: 36, ELITE: 40, BOSS: 44 },
  3: { MINION: 34, SOLDIER: 38, ELITE: 42, BOSS: 46 },
  4: { MINION: 34, SOLDIER: 38, ELITE: 42, BOSS: 46 },
  5: { MINION: 36, SOLDIER: 40, ELITE: 44, BOSS: 48 },
  6: { MINION: 36, SOLDIER: 40, ELITE: 44, BOSS: 48 },
  7: { MINION: 38, SOLDIER: 42, ELITE: 46, BOSS: 50 },
  8: { MINION: 38, SOLDIER: 42, ELITE: 46, BOSS: 50 },
  9: { MINION: 40, SOLDIER: 44, ELITE: 48, BOSS: 52 },
  10: { MINION: 40, SOLDIER: 44, ELITE: 48, BOSS: 52 },
  11: { MINION: 42, SOLDIER: 46, ELITE: 50, BOSS: 54 },
  12: { MINION: 42, SOLDIER: 46, ELITE: 50, BOSS: 54 },
  13: { MINION: 44, SOLDIER: 48, ELITE: 52, BOSS: 56 },
  14: { MINION: 44, SOLDIER: 48, ELITE: 52, BOSS: 56 },
  15: { MINION: 46, SOLDIER: 50, ELITE: 54, BOSS: 58 },
  16: { MINION: 48, SOLDIER: 52, ELITE: 56, BOSS: 60 },
  17: { MINION: 50, SOLDIER: 54, ELITE: 58, BOSS: 62 },
  18: { MINION: 52, SOLDIER: 56, ELITE: 60, BOSS: 64 },
  19: { MINION: 54, SOLDIER: 58, ELITE: 62, BOSS: 66 },
  20: { MINION: 56, SOLDIER: 60, ELITE: 64, BOSS: 68 },
};

const ATTRIBUTE_LABELS = {
  attackDie: "Attack",
  guardDie: "Guard",
  fortitudeDie: "Fortitude",
  intellectDie: "Intellect",
  synergyDie: "Synergy",
  braveryDie: "Bravery",
} as const;

function dieToValue(die: DiceSize): number {
  if (die === "D4") return 4;
  if (die === "D6") return 6;
  if (die === "D8") return 8;
  if (die === "D10") return 10;
  if (die === "D12") return 12;
  return 6;
}

export function getExpectedAttributeTotal(level: number, tier: MonsterTier): number {
  const normalizedLevel = Math.max(1, Math.min(20, Math.trunc(level || 1)));
  return EXPECTED_ATTRIBUTE_TOTALS[normalizedLevel]?.[tier] ?? EXPECTED_ATTRIBUTE_TOTALS[1].MINION;
}

function getBudgetStatus(delta: number): AttributeBudgetStatus {
  if (delta <= -4) return "Under Budget";
  if (delta >= 4) return "Over Budget";
  return "On Budget";
}

function getShapeReadout(values: number[]): AttributeShapeReadout {
  const sortedValues = [...values].sort((a, b) => b - a);
  const max = sortedValues[0] ?? 0;
  const secondHighest = sortedValues[1] ?? 0;
  const min = sortedValues[sortedValues.length - 1] ?? 0;
  const spread = max - min;
  const highCount = values.filter((value) => value >= 10).length;
  const lowCount = values.filter((value) => value <= 4).length;
  const hasRealPeak = max >= 10 && max - secondHighest >= 2;
  const hasConcentratedHighEnd = max >= 10 && highCount >= 2 && spread >= 4;

  // Weaknesses stay in the weakness lane. Stronger specialist labels need a real top-end signal.
  if (!hasRealPeak && !hasConcentratedHighEnd) {
    if (spread >= 4 && max >= 8) return "Light Specialist";
    return "Broadly Balanced";
  }

  if (spread >= 8 || (hasConcentratedHighEnd && lowCount >= 2)) return "Extreme Specialist";
  if (spread >= 6 || highCount >= 2) return "Strong Specialist";
  return "Light Specialist";
}

function getWeaknessReadout(lowCount: number): AttributeWeaknessReadout {
  if (lowCount <= 0) return "No Clear Weakness";
  if (lowCount === 1) return "One Clear Weakness";
  return "Multiple Clear Weaknesses";
}

function getArchetypeFit(params: {
  archetype: MonsterCalculatorArchetype;
  shape: AttributeShapeReadout;
  weaknessCount: number;
  highAttributes: string[];
  lowAttributes: string[];
}): { fit: AttributeArchetypeFit; note: string } {
  const { archetype, shape, weaknessCount, highAttributes, lowAttributes } = params;
  const hasDefensivePeak = highAttributes.some((attr) =>
    ["Guard", "Fortitude", "Bravery"].includes(attr),
  );
  const hasThreatPeak = highAttributes.some((attr) =>
    ["Attack", "Intellect", "Bravery"].includes(attr),
  );
  const hasControlPeak = highAttributes.some((attr) =>
    ["Intellect", "Synergy", "Bravery"].includes(attr),
  );
  const sacrificesDirectLane = lowAttributes.some((attr) => ["Attack", "Guard"].includes(attr));

  if (archetype === "BALANCED") {
    if (shape === "Broadly Balanced" || shape === "Light Specialist") {
      return { fit: "Good Fit", note: "Balanced is happiest with broad or lightly specialized spreads." };
    }
    return { fit: "Soft Tension", note: "This spread is more specialized than the selected archetype suggests." };
  }

  if (archetype === "TANK") {
    if ((shape === "Light Specialist" || shape === "Strong Specialist") && hasDefensivePeak) {
      return { fit: "Good Fit", note: "Defensive concentration supports the Tank readout." };
    }
    if (hasDefensivePeak || shape === "Broadly Balanced") {
      return { fit: "Partial Fit", note: "Tank fit is present, but the defensive specialization is not very sharp." };
    }
    return { fit: "Soft Tension", note: "Tank usually wants a clearer Guard, Fortitude, or Bravery peak." };
  }

  if (archetype === "GLASS_CANNON") {
    if ((shape === "Strong Specialist" || shape === "Extreme Specialist") && hasThreatPeak && weaknessCount > 0) {
      return { fit: "Good Fit", note: "High threat with a visible weakness matches Glass Cannon guidance." };
    }
    if (hasThreatPeak) {
      return { fit: "Partial Fit", note: "There is threat focus, but the weakness profile is still soft." };
    }
    return { fit: "Soft Tension", note: "Glass Cannon usually wants a sharper Attack, Intellect, or Bravery peak." };
  }

  if (archetype === "CONTROLLER") {
    if ((shape === "Light Specialist" || shape === "Strong Specialist") && hasControlPeak && sacrificesDirectLane) {
      return { fit: "Good Fit", note: "Control-facing peaks with a direct-lane sacrifice match Controller guidance." };
    }
    if (hasControlPeak) {
      return { fit: "Partial Fit", note: "Control-facing attributes are present, but the tradeoff is gentle." };
    }
    return { fit: "Soft Tension", note: "Controller usually wants Intellect, Synergy, or Bravery to stand out." };
  }

  if (archetype === "SCRAPPER") {
    const hasPhysicalPeak = highAttributes.some((attr) =>
      ["Attack", "Guard", "Bravery"].includes(attr),
    );
    const hasMentalWeakness = lowAttributes.some((attr) =>
      ["Intellect", "Synergy", "Fortitude"].includes(attr),
    );
    if (
      (shape === "Light Specialist" || shape === "Strong Specialist") &&
      hasPhysicalPeak &&
      hasMentalWeakness
    ) {
      return {
        fit: "Good Fit",
        note: "Physical pressure with softer mental lanes matches Scrapper guidance well.",
      };
    }
    if (hasPhysicalPeak) {
      return {
        fit: "Partial Fit",
        note: "The physical core is there, but the build is not yet clearly sacrificing mental lanes.",
      };
    }
    return {
      fit: "Soft Tension",
      note: "Scrapper usually wants Attack, Guard, or Bravery to stand out over Intellect and Synergy.",
    };
  }

  return { fit: "Partial Fit", note: "Use this as soft guidance only; the outcome calculator remains the source of truth." };
}

export function evaluateAttributeBalancingGuide(
  input: AttributeBalancingGuideInput,
): AttributeBalancingGuide {
  const entries = Object.entries(input.attributes).map(([key, die]) => ({
    key,
    label: ATTRIBUTE_LABELS[key as keyof typeof ATTRIBUTE_LABELS],
    value: dieToValue(die),
  }));
  const values = entries.map((entry) => entry.value);
  const currentTotal = values.reduce((total, value) => total + value, 0);
  const expectedTotal = getExpectedAttributeTotal(input.level, input.tier);
  const budgetDelta = currentTotal - expectedTotal;
  const lowAttributes = entries
    .filter((entry) => entry.value <= 4)
    .map((entry) => entry.label);
  const highAttributes = entries
    .filter((entry) => entry.value >= 10)
    .map((entry) => entry.label);
  const shapeReadout = getShapeReadout(values);
  const archetypeFit = getArchetypeFit({
    archetype: input.archetype,
    shape: shapeReadout,
    weaknessCount: lowAttributes.length,
    highAttributes,
    lowAttributes,
  });

  return {
    currentTotal,
    expectedTotal,
    budgetDelta,
    budgetStatus: getBudgetStatus(budgetDelta),
    shapeReadout,
    weaknessReadout: getWeaknessReadout(lowAttributes.length),
    archetypeFit: archetypeFit.fit,
    archetypeFitNote: archetypeFit.note,
    highAttributes,
    lowAttributes,
  };
}

