import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { computeLevel3LegacyControlDelivery } from "../lib/calculators/monsterOutcomeCalculator";

const DICE_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20] as const;
const AUTHORITATIVE_COOLDOWNS: Record<(typeof DICE_COUNTS)[number], number> = {
  1: 2,
  2: 2,
  3: 2,
  4: 3,
  5: 3,
  6: 4,
  8: 5,
  10: 5,
  15: 5,
  20: 5,
};
const BPV: Record<(typeof DICE_COUNTS)[number], number> = {
  1: 13,
  2: 15,
  3: 18,
  4: 22,
  5: 26,
  6: 31,
  8: 42,
  10: 57,
  15: 97,
  20: 137,
};
const BEFORE_SCORES: Record<(typeof DICE_COUNTS)[number], number> = {
  1: 2.9164614914,
  2: 2.9164614914,
  3: 2.9164614914,
  4: 2.819851155,
  5: 2.819851155,
  6: 2.6524523208,
  8: 2.6179573525,
  10: 2.6179573525,
  15: 2.6179573525,
  20: 2.6179573525,
};

function evaluate(diceCount: (typeof DICE_COUNTS)[number], cooldownTurns: number, severity = 2) {
  const result = computeLevel3LegacyControlDelivery({
    sourceDie: "D10",
    diceCount,
    resistibility: "RESISTED",
    categoricalReliability: 0.85,
    durationTurns: 2,
    targetCount: 1,
    effectSeverity: severity,
    supportedStackImpact: 1,
    recurrenceContribution: 0,
    cooldownTurns,
  });
  assert.ok(result, `Dice ${diceCount} must have an exact Level 3 delivery model.`);
  return result;
}

function eliteScore(encounterControlProxy: number): number {
  return Math.max(
    0,
    Math.min(10, 5 + Math.log2(encounterControlProxy / 1.25) * 0.6),
  );
}

const authoritative = DICE_COUNTS.map((diceCount) => ({
  bpv: BPV[diceCount],
  beforeScore: BEFORE_SCORES[diceCount],
  ...evaluate(diceCount, AUTHORITATIVE_COOLDOWNS[diceCount]),
}));
const fixedCooldown = DICE_COUNTS.map((diceCount) => ({
  ...evaluate(diceCount, AUTHORITATIVE_COOLDOWNS[1]),
}));
const secondLegacyFamily = DICE_COUNTS.map((diceCount) => ({
  ...evaluate(diceCount, AUTHORITATIVE_COOLDOWNS[diceCount], 3),
}));

for (const rows of [authoritative, fixedCooldown, secondLegacyFamily]) {
  for (let index = 1; index < rows.length; index += 1) {
    assert.ok(
      rows[index].applicationProbability >= rows[index - 1].applicationProbability,
      `Application probability must not decrease at Dice ${rows[index].diceCount}.`,
    );
    assert.ok(
      rows[index].expectedNetSuccesses >= rows[index - 1].expectedNetSuccesses,
      `Expected net successes must not decrease at Dice ${rows[index].diceCount}.`,
    );
    assert.ok(
      rows[index].perUseControlProxy >= rows[index - 1].perUseControlProxy,
      `Per-use Control must not decrease at Dice ${rows[index].diceCount}.`,
    );
  }
}

for (let index = 1; index < fixedCooldown.length; index += 1) {
  assert.ok(
    fixedCooldown[index].encounterControlProxy >=
      fixedCooldown[index - 1].encounterControlProxy,
    `Fixed-cooldown encounter Control must not decrease at Dice ${fixedCooldown[index].diceCount}.`,
  );
}

for (let index = 1; index < authoritative.length; index += 1) {
  const previous = authoritative[index - 1];
  const current = authoritative[index];
  if (current.cooldownTurns === previous.cooldownTurns) {
    assert.ok(
      current.encounterControlProxy >= previous.encounterControlProxy,
      `Encounter Control may only decrease when cooldown changes; Dice ${current.diceCount} did not.`,
    );
  }
}

assert.ok(
  authoritative[5].perUseControlProxy < authoritative[6].perUseControlProxy &&
    authoritative[5].encounterControlProxy > authoritative[6].encounterControlProxy,
  "Dice 6 to 8 must expose the genuine per-use gain versus cooldown-cadence trade-off.",
);

const report = {
  authoritative: authoritative.map((row) => ({
    diceCount: row.diceCount,
    bpv: row.bpv,
    cooldownTurns: row.cooldownTurns,
    availability: row.availability,
    applicationProbability: row.applicationProbability,
    expectedNetSuccesses: row.expectedNetSuccesses,
    expectedActiveTargetTurns: row.expectedActiveTargetTurns,
    perUseControlProxy: row.perUseControlProxy,
    encounterControlProxy: row.encounterControlProxy,
    beforeScore: row.beforeScore,
    afterScore: eliteScore(row.encounterControlProxy),
  })),
  fixedCooldown: fixedCooldown.map((row) => ({
    diceCount: row.diceCount,
    cooldownTurns: row.cooldownTurns,
    availability: row.availability,
    perUseControlProxy: row.perUseControlProxy,
    encounterControlProxy: row.encounterControlProxy,
    afterScore: eliteScore(row.encounterControlProxy),
  })),
  secondLegacyFamilyPerUse: secondLegacyFamily.map((row) => ({
    diceCount: row.diceCount,
    perUseControlProxy: row.perUseControlProxy,
  })),
};
assert.ok(
  authoritative[6].perUseControlProxy < authoritative.at(-1)!.perUseControlProxy,
  "Dice 8 through 20 must no longer plateau per use.",
);

const calculatorPanelSource = readFileSync(
  "app/summoning-circle/components/MonsterCalculatorPanel.tsx",
  "utf8",
);
assert.ok(
  calculatorPanelSource.includes("Control delivery: per use versus encounter") &&
    calculatorPanelSource.includes("authoritative cooldown cadence reduces availability"),
  "Ordinary calculator UI must explain per-use versus encounter Control.",
);

console.log(JSON.stringify(report, null, 2));
console.log("legacyControlReliabilityLevel3.smoke.ts passed");
