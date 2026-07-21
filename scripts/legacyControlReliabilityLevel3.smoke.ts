import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MonsterCalculatorPanel } from "../app/summoning-circle/components/MonsterCalculatorPanel";
import {
  formatRadarAxisDisplayValue,
  OutcomeRadar,
} from "../app/summoning-circle/components/OutcomeRadar";
import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import {
  computeLevel3LegacyControlDelivery,
  normalizeLevel3LegacyControlStrength,
  type MonsterOutcomeProfile,
  type RadarAxes,
} from "../lib/calculators/monsterOutcomeCalculator";

const DICE_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20] as const;
const FULL_DICE_COUNTS = Array.from({ length: 20 }, (_, index) => index + 1);
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

function eliteScore(perUseControlProxy: number): number {
  const tuning = calculatorConfig.controlPressureAxisTuning;
  const eliteBaseline = tuning.baselines.find(
    (baseline) => baseline.level === 3 && baseline.tier === "ELITE" && !baseline.legendary,
  );
  assert.ok(eliteBaseline, "Level 3 Elite Control reference must exist.");
  if (perUseControlProxy <= 0) return 0;
  return normalizeLevel3LegacyControlStrength({
    perUseControlProxy,
    baselinePerUseControlProxy: eliteBaseline.expectedPerUseControlProxy,
    midpointScore: tuning.midpointScore,
    ratioExponent: tuning.ratioExponent,
  });
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
const performanceSamples = DICE_COUNTS.map((diceCount) => {
  const iterations = 100;
  const startedAt = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    evaluate(diceCount, AUTHORITATIVE_COOLDOWNS[diceCount]);
  }
  return {
    diceCount,
    iterations,
    averageCalculationMs: (performance.now() - startedAt) / iterations,
  };
});

for (const rows of [authoritative, fixedCooldown, secondLegacyFamily]) {
  for (let index = 1; index < rows.length; index += 1) {
    assert.ok(
      rows[index].applicationProbability >= rows[index - 1].applicationProbability,
      `Application probability must not decrease at Dice ${rows[index].diceCount}.`,
    );
    assert.ok(
      rows[index].expectedPositiveNetSuccesses >
        rows[index - 1].expectedPositiveNetSuccesses,
      `Expected positive net successes must increase at Dice ${rows[index].diceCount}.`,
    );
    assert.ok(
      rows[index].expectedExcessNetSuccesses >=
        rows[index - 1].expectedExcessNetSuccesses,
      `Expected excess net successes must not decrease at Dice ${rows[index].diceCount}.`,
    );
    assert.ok(
      rows[index].perUseControlProxy >= rows[index - 1].perUseControlProxy,
      `Per-use Control must not decrease at Dice ${rows[index].diceCount}.`,
    );
    for (const threshold of ["atLeastOne", "atLeastTwo", "atLeastThree", "atLeastFive"] as const) {
      assert.ok(
        rows[index].robustnessProbabilities[threshold] >=
          rows[index - 1].robustnessProbabilities[threshold],
        `${threshold} robustness must not decrease at Dice ${rows[index].diceCount}.`,
      );
    }
  }
  for (const row of rows) {
    assert.ok(
      Math.abs(
        row.robustnessProbabilities.atLeastOne - row.applicationProbability,
      ) < 1e-12,
      `Application probability must equal P(net successes >= 1) at Dice ${row.diceCount}.`,
    );
    assert.ok(
      row.robustnessProbabilities.atLeastOne >= row.robustnessProbabilities.atLeastTwo &&
        row.robustnessProbabilities.atLeastTwo >= row.robustnessProbabilities.atLeastThree &&
        row.robustnessProbabilities.atLeastThree >= row.robustnessProbabilities.atLeastFive,
      `Robustness thresholds must be nested at Dice ${row.diceCount}.`,
    );
  }
}

const authoritativeScores = authoritative.map((row) => eliteScore(row.perUseControlProxy));
const completeSweep = FULL_DICE_COUNTS.map((diceCount) => {
  const delivery = computeLevel3LegacyControlDelivery({
    sourceDie: "D10",
    diceCount,
    resistibility: "RESISTED",
    durationTurns: 2,
    targetCount: 1,
    effectSeverity: 2,
    supportedStackImpact: 1,
    recurrenceContribution: 0,
    cooldownTurns: 2,
  });
  assert.ok(delivery);
  return {
    diceCount,
    perUseControlProxy: delivery.perUseControlProxy,
    score: eliteScore(delivery.perUseControlProxy),
  };
});
for (let index = 1; index < completeSweep.length; index += 1) {
  assert.ok(
    completeSweep[index].score >= completeSweep[index - 1].score,
    `Primary Control Strength must not decrease at Dice ${completeSweep[index].diceCount}.`,
  );
}
for (let index = 1; index < authoritativeScores.length; index += 1) {
  assert.ok(
    authoritativeScores[index] >= authoritativeScores[index - 1],
    `Primary Control Pressure must not decrease at Dice ${DICE_COUNTS[index]}.`,
  );
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
  authoritative[4].perUseControlProxy < authoritative[5].perUseControlProxy &&
    authoritative[4].encounterControlProxy > authoritative[5].encounterControlProxy &&
    authoritativeScores[4] < authoritativeScores[5],
  "Dice 5 to 6 must expose the per-use gain and primary-score gain despite the cooldown-cadence drop.",
);

assert.ok(
  authoritativeScores[5] >= 7 && authoritativeScores[5] <= 9,
  "Dice 6 must be between 7 and 9 for Level 3.",
);
assert.ok(
  authoritativeScores[7] >= 9,
  "Dice 10 must be extreme for Level 3 and score at least 9.",
);
assert.ok(authoritativeScores.at(-1)! > 10, "Dice 20 must exceed 10 internally.");
assert.ok(
  authoritativeScores.at(-1)! >= authoritativeScores[7] + 2,
  "Dice 20 must score materially above Dice 10.",
);
assert.ok(Number.isFinite(authoritativeScores.at(-1)!));
assert.ok(
  authoritativeScores.at(-1)! / authoritativeScores[7] <
    authoritative.at(-1)!.perUseControlProxy / authoritative[7].perUseControlProxy,
  "The cube-root score must compress extreme penetration rather than scale linearly.",
);
assert.equal(
  new Set(authoritative.slice(5).map((row) => row.perUseControlProxy)).size,
  authoritative.length - 5,
  "Dice 6-20 per-use penetration values must remain distinct.",
);

for (const baseline of calculatorConfig.controlPressureAxisTuning.baselines) {
  assert.ok(
    Math.abs(
      normalizeLevel3LegacyControlStrength({
        perUseControlProxy: baseline.expectedPerUseControlProxy,
        baselinePerUseControlProxy: baseline.expectedPerUseControlProxy,
        midpointScore: calculatorConfig.controlPressureAxisTuning.midpointScore,
        ratioExponent: calculatorConfig.controlPressureAxisTuning.ratioExponent,
      }) - 5,
    ) < 1e-12,
    `${baseline.id} must remain exactly at score 5.`,
  );
}
assert.equal(
  new Set(authoritativeScores.slice(5)).size,
  authoritativeScores.length - 5,
  "Dice 6-20 primary scores must remain distinct before the bounded apex.",
);

const diceThree = authoritative[2];
assert.ok(
  Math.abs(eliteScore(diceThree.perUseControlProxy) - 5) < 1e-12,
  "The exact resisted 3D10 movement-denial comparator must remain the Elite midpoint.",
);
assert.ok(
  Math.abs(diceThree.expectedPositiveNetSuccesses - 0.811611328125) < 1e-12,
  "Matched 3D8 resistance must be applied exactly once.",
);
assert.ok(
  Math.abs(
    diceThree.expectedExcessNetSuccesses -
      (diceThree.expectedPositiveNetSuccesses - diceThree.applicationProbability),
  ) < 1e-12,
  "Excess net successes must exclude exactly the first surviving success.",
);
assert.equal(
  computeLevel3LegacyControlDelivery({
    sourceDie: "D10",
    diceCount: 3,
    resistibility: "UNKNOWN",
    durationTurns: 2,
    targetCount: 1,
    effectSeverity: 2,
    supportedStackImpact: 1,
    recurrenceContribution: 0,
    cooldownTurns: 2,
  }),
  null,
  "Missing resistance authority must fail closed.",
);

const fixedShape = (effectSeverity: number, targetCount = 1, durationTurns = 2) => {
  const result = computeLevel3LegacyControlDelivery({
    sourceDie: "D10",
    diceCount: 3,
    resistibility: "RESISTED",
    durationTurns,
    targetCount,
    effectSeverity,
    supportedStackImpact: 1,
    recurrenceContribution: 0,
    cooldownTurns: 2,
  });
  assert.ok(result);
  return result;
};
const forcedMovement = fixedShape(1);
const movementDenial = fixedShape(2);
const mainActionDenial = fixedShape(3);
assert.ok(
  forcedMovement.perUseControlProxy < movementDenial.perUseControlProxy &&
    movementDenial.perUseControlProxy < mainActionDenial.perUseControlProxy,
  "Forced movement < movement denial < Main Action denial.",
);
assert.ok(
  fixedShape(2, 2).perUseControlProxy > movementDenial.perUseControlProxy,
  "Target breadth must increase per-use Control Strength.",
);
assert.ok(
  fixedShape(2, 1, 3).perUseControlProxy > movementDenial.perUseControlProxy,
  "Runtime-supported duration must increase per-use Control Strength.",
);
assert.equal(
  evaluate(3, 2).perUseControlProxy,
  evaluate(3, 5).perUseControlProxy,
  "Cooldown must not be applied to the per-use Control Strength kernel.",
);

const emptyRadarAxes: RadarAxes = {
  physicalThreat: 0,
  mentalThreat: 0,
  physicalSurvivability: 0,
  mentalSurvivability: 0,
  manipulation: 0,
  synergy: 0,
  mobility: 0,
  presence: 0,
};
const overcapScore = authoritativeScores.at(-1)!;
const overcapRadarMarkup = renderToStaticMarkup(
  createElement(OutcomeRadar, {
    axes: { ...emptyRadarAxes, manipulation: overcapScore },
  }),
);
assert.equal(formatRadarAxisDisplayValue(overcapScore), "10+");
assert.ok(
  overcapRadarMarkup.includes("10+"),
  "The browser-facing radar summary must display 10+ for an uncapped score above 10.",
);

function renderControlPanel(score: number, row: (typeof authoritative)[number]): string {
  const eliteBaseline = calculatorConfig.controlPressureAxisTuning.baselines.find(
    (baseline) => baseline.level === 3 && baseline.tier === "ELITE" && !baseline.legendary,
  );
  assert.ok(eliteBaseline);
  const profile = {
    radarAxes: { ...emptyRadarAxes, manipulation: score },
    netSuccessMultiplier: 1,
    debug: {
      semanticSynergyAxisModel: {},
      controlPressureAxisBaselineModel: {
        ratioToBaseline: row.perUseControlProxy / eliteBaseline.expectedPerUseControlProxy,
        legacyControlDelivery: {
          level: 3,
          levelRelativeControlStrength: score,
          radarDisplayScore: Math.min(10, score),
          cadenceTradeoffApplied: true,
          packages: [
            {
              ...row,
              sourcePowerId: "terrifying-gaze-fixture",
              sourcePowerName: "Terrifying Gaze",
              packetIndex: 0,
              basePowerValue: row.bpv,
            },
          ],
        },
      },
    },
  } as unknown as MonsterOutcomeProfile;
  return renderToStaticMarkup(
    createElement(MonsterCalculatorPanel, {
      profile,
      archetype: "BALANCED",
      onArchetypeChangeAction: () => undefined,
    }),
  );
}

const overcapPanelMarkup = renderControlPanel(overcapScore, authoritative.at(-1)!);
assert.ok(overcapPanelMarkup.includes("Exceeds the Level 3 control envelope."));
assert.ok(overcapPanelMarkup.includes("10+ (plotted at 10)"));
assert.ok(overcapPanelMarkup.includes(overcapScore.toFixed(2)));
assert.ok(overcapPanelMarkup.includes("Level reference ratio"));
const referencePanelMarkup = renderControlPanel(authoritativeScores[2], authoritative[2]);
assert.ok(
  !referencePanelMarkup.includes("Exceeds the Level 3 control envelope."),
  "The Level 3 reference package must not render an over-level warning.",
);

const report = {
  authoritative: authoritative.map((row) => ({
    diceCount: row.diceCount,
    bpv: row.bpv,
    cooldownTurns: row.cooldownTurns,
    availability: row.availability,
    applicationProbability: row.applicationProbability,
    expectedPositiveNetSuccesses: row.expectedPositiveNetSuccesses,
    expectedExcessNetSuccesses: row.expectedExcessNetSuccesses,
    robustnessProbabilities: row.robustnessProbabilities,
    sourceSuccessDistribution: row.sourceSuccessDistribution,
    resistSuccessDistribution: row.resistSuccessDistribution,
    expectedActiveTargetTurns: row.expectedActiveTargetTurns,
    perUseControlProxy: row.perUseControlProxy,
    encounterControlProxy: row.encounterControlProxy,
    beforeScore: row.beforeScore,
    afterScore: eliteScore(row.perUseControlProxy),
  })),
  fixedCooldown: fixedCooldown.map((row) => ({
    diceCount: row.diceCount,
    cooldownTurns: row.cooldownTurns,
    availability: row.availability,
    perUseControlProxy: row.perUseControlProxy,
    encounterControlProxy: row.encounterControlProxy,
    afterScore: eliteScore(row.perUseControlProxy),
  })),
  secondLegacyFamilyPerUse: secondLegacyFamily.map((row) => ({
    diceCount: row.diceCount,
    perUseControlProxy: row.perUseControlProxy,
    afterScore: eliteScore(row.perUseControlProxy),
  })),
  completeSweep,
  performance: {
    samples: performanceSamples,
    worstAverageCalculationMs: Math.max(
      ...performanceSamples.map((sample) => sample.averageCalculationMs),
    ),
  },
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
  calculatorPanelSource.includes("Control Strength and Encounter Availability") &&
    calculatorPanelSource.includes("Expected excess net successes") &&
    calculatorPanelSource.includes("Authoritative cooldown") &&
    calculatorPanelSource.includes("Exceeds the Level") &&
    calculatorPanelSource.includes("highly resistant to cancellation by stronger defence") &&
    calculatorPanelSource.includes("Level reference ratio") &&
    calculatorPanelSource.includes("authoritative cooldown cadence reduces availability"),
  "Ordinary calculator UI must expose penetration robustness and per-use versus encounter Control.",
);

console.log(JSON.stringify(report, null, 2));
console.log("legacyControlReliabilityLevel3.smoke.ts passed");
