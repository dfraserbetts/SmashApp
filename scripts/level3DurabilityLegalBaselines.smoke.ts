import assert from "node:assert/strict";

import {
  LEVEL_3_DURABILITY_REFERENCE_ATTRIBUTES,
  calculatorConfig,
} from "../lib/calculators/calculatorConfig";
import { DEFAULT_COMBAT_TUNING_VALUES } from "../lib/config/combatTuningShared";
import { evaluateAttributeBalancingGuide } from "../lib/summoning/attributeBalancingGuide";
import { calculateMonsterResilienceValues, diceSizeToNumber } from "../lib/summoning/attributes";
import type { DiceSize, MonsterTier } from "../lib/summoning/types";

const FIELDS = [
  "attackDie",
  "guardDie",
  "fortitudeDie",
  "intellectDie",
  "synergyDie",
  "braveryDie",
] as const;
const ALLOWED_DICE = ["D4", "D6", "D8", "D10", "D12"] as const;
type AttributeField = (typeof FIELDS)[number];
type Allocation = Record<AttributeField, DiceSize>;

const ANCHORS: Record<MonsterTier, Allocation> = {
  MINION: {
    attackDie: "D4",
    guardDie: "D4",
    fortitudeDie: "D4",
    intellectDie: "D4",
    synergyDie: "D4",
    braveryDie: "D4",
  },
  SOLDIER: {
    attackDie: "D6",
    guardDie: "D4",
    fortitudeDie: "D4",
    intellectDie: "D6",
    synergyDie: "D4",
    braveryDie: "D4",
  },
  ELITE: {
    attackDie: "D8",
    guardDie: "D6",
    fortitudeDie: "D4",
    intellectDie: "D8",
    synergyDie: "D4",
    braveryDie: "D6",
  },
  BOSS: {
    attackDie: "D10",
    guardDie: "D6",
    fortitudeDie: "D4",
    intellectDie: "D10",
    synergyDie: "D4",
    braveryDie: "D6",
  },
};

const EXPECTED_TOTALS: Record<MonsterTier, number> = {
  MINION: 34,
  SOLDIER: 38,
  ELITE: 42,
  BOSS: 46,
};

const EXPECTED_HEALTH: Record<
  MonsterTier,
  { physicalResilienceMax: number; mentalPerseveranceMax: number }
> = {
  MINION: { physicalResilienceMax: 12, mentalPerseveranceMax: 14 },
  SOLDIER: { physicalResilienceMax: 21, mentalPerseveranceMax: 22 },
  ELITE: { physicalResilienceMax: 34, mentalPerseveranceMax: 38 },
  BOSS: { physicalResilienceMax: 66, mentalPerseveranceMax: 74 },
};

// The active Combat Tuning Default v1 values used by the read-only reconciliation.
// The production generator remains the sole formula under test here.
const ACTIVE_LEVEL_3_HEALTH_TUNING = {
  ...DEFAULT_COMBAT_TUNING_VALUES,
  attackWeight: 1,
  guardWeight: 1,
  fortitudeWeight: 1.3,
  intellectWeight: 1,
  synergyWeight: 1,
  braveryWeight: 1.3,
  minionTierMultiplier: 0.6,
  soldierTierMultiplier: 0.9,
  eliteTierMultiplier: 1.4,
  bossTierMultiplier: 2.5,
};

function values(allocation: Allocation): number[] {
  return FIELDS.map((field) => diceSizeToNumber(allocation[field]));
}

function total(allocation: Allocation): number {
  return values(allocation).reduce((sum, value) => sum + value, 0);
}

function preservedStrictRelationships(allocation: Allocation, anchor: Allocation): number {
  const candidateValues = values(allocation);
  const anchorValues = values(anchor);
  let preserved = 0;
  for (let left = 0; left < FIELDS.length; left += 1) {
    for (let right = left + 1; right < FIELDS.length; right += 1) {
      const anchorSign = Math.sign((anchorValues[left] ?? 0) - (anchorValues[right] ?? 0));
      if (anchorSign === 0) continue;
      const candidateSign = Math.sign(
        (candidateValues[left] ?? 0) - (candidateValues[right] ?? 0),
      );
      if (candidateSign === anchorSign) preserved += 1;
    }
  }
  return preserved;
}

function squaredDeviation(allocation: Allocation, anchor: Allocation): number {
  return FIELDS.reduce((sum, field) => {
    const delta = diceSizeToNumber(allocation[field]) - diceSizeToNumber(anchor[field]);
    return sum + delta * delta;
  }, 0);
}

function changedCount(allocation: Allocation, anchor: Allocation): number {
  return FIELDS.filter((field) => allocation[field] !== anchor[field]).length;
}

function compareAllocations(left: Allocation, right: Allocation, anchor: Allocation): number {
  const relationDelta =
    preservedStrictRelationships(right, anchor) - preservedStrictRelationships(left, anchor);
  if (relationDelta !== 0) return relationDelta;
  const deviationDelta = squaredDeviation(left, anchor) - squaredDeviation(right, anchor);
  if (deviationDelta !== 0) return deviationDelta;
  const changedDelta = changedCount(left, anchor) - changedCount(right, anchor);
  if (changedDelta !== 0) return changedDelta;
  const maxDieDelta = Math.max(...values(left)) - Math.max(...values(right));
  if (maxDieDelta !== 0) return maxDieDelta;
  for (const field of FIELDS) {
    const lexicalDelta = diceSizeToNumber(left[field]) - diceSizeToNumber(right[field]);
    if (lexicalDelta !== 0) return lexicalDelta;
  }
  return 0;
}

function enumerateExactBudgetAllocations(expectedTotal: number): Allocation[] {
  const candidates: Allocation[] = [];
  for (const attackDie of ALLOWED_DICE)
    for (const guardDie of ALLOWED_DICE)
      for (const fortitudeDie of ALLOWED_DICE)
        for (const intellectDie of ALLOWED_DICE)
          for (const synergyDie of ALLOWED_DICE)
            for (const braveryDie of ALLOWED_DICE) {
              const allocation = {
                attackDie,
                guardDie,
                fortitudeDie,
                intellectDie,
                synergyDie,
                braveryDie,
              } satisfies Allocation;
              if (total(allocation) === expectedTotal) candidates.push(allocation);
            }
  return candidates;
}

for (const tier of ["MINION", "SOLDIER", "ELITE", "BOSS"] as const) {
  const anchor = ANCHORS[tier];
  const expectedTotal = EXPECTED_TOTALS[tier];
  const candidates = enumerateExactBudgetAllocations(expectedTotal);
  assert.ok(candidates.length > 0, `${tier}: exhaustive search must find a legal exact budget`);
  candidates.sort((left, right) => compareAllocations(left, right, anchor));
  const selected = candidates[0];
  const { expectedTotal: configuredExpectedTotal, ...configuredAllocation } =
    LEVEL_3_DURABILITY_REFERENCE_ATTRIBUTES[tier];
  assert.equal(configuredExpectedTotal, expectedTotal);
  assert.deepEqual(selected, configuredAllocation);

  const guide = evaluateAttributeBalancingGuide({
    level: 3,
    tier,
    archetype: "BALANCED",
    attributes: selected,
  });
  assert.equal(total(selected), expectedTotal, `${tier}: exact budget`);
  assert.equal(guide.expectedTotal, expectedTotal, `${tier}: production validation budget`);
  assert.equal(guide.currentTotal, expectedTotal, `${tier}: production validation total`);
  assert.equal(guide.budgetStatus, "On Budget", `${tier}: production validation status`);
  for (const field of FIELDS) {
    assert.ok(ALLOWED_DICE.includes(selected[field]), `${tier}.${field}: allowed die`);
  }

  const generated = calculateMonsterResilienceValues(
    { level: 3, tier, legendary: false, ...selected },
    ACTIVE_LEVEL_3_HEALTH_TUNING,
  );
  assert.deepEqual(generated, EXPECTED_HEALTH[tier], `${tier}: production-generated Health`);

  const configured = calculatorConfig.durabilityAxisTuning.baselines.filter(
    (baseline) => baseline.tier === tier,
  );
  assert.ok(configured.length > 0, `${tier}: configured durability package`);
  for (const baseline of configured) {
    assert.deepEqual(
      baseline.referenceAttributes,
      { expectedTotal, ...selected },
      `${baseline.id}: legal reference`,
    );
    assert.equal(
      baseline.physical.expectedHp,
      generated.physicalResilienceMax,
      `${baseline.id}: canonical physical Health`,
    );
    assert.equal(
      baseline.mental.expectedHp,
      generated.mentalPerseveranceMax,
      `${baseline.id}: canonical mental Health`,
    );
  }

  const best = selected;
  const tiedFinalists = candidates.filter(
    (candidate) => compareAllocations(candidate, best, anchor) === 0,
  );
  console.log(
    JSON.stringify({
      tier,
      exactCandidateCount: candidates.length,
      preservedStrictRelationships: preservedStrictRelationships(best, anchor),
      squaredDeviation: squaredDeviation(best, anchor),
      changedAttributes: changedCount(best, anchor),
      maximumDie: Math.max(...values(best)),
      tiedFinalistCount: tiedFinalists.length,
      selected: best,
      generatedHealth: generated,
    }),
  );
}

console.log("Level 3 legal durability baseline smoke passed.");
