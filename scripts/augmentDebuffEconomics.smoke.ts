import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT, POWER_TUNING_CONFIG_KEY_ORDER } from "../lib/config/powerTuningShared";
import { AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT_ADMIN_METADATA, POWER_TUNING_ADMIN_METADATA } from "../lib/config/powerTuningAdminMetadata";
import {
  APPROVED_AUGMENT_MODIFIER_SEVERITY,
  APPROVED_DEBUFF_MODIFIER_SEVERITY,
  aggregateAugmentDebuffPowerDelivery,
  calculateAggregateModifierDeliveryCharge,
  cancelSuccessDistributions,
  createMatchedReferenceResistDistribution,
  createSuccessDistribution,
  convertAugmentDebuffPowerToBpv,
  enumerateStackUptime,
  evaluateAugmentDebuffPacket,
  getModifierSeverity,
  getModifierSuccessDeltaDiagnostic,
  getSignedModifierSuccessDiagnostics,
  roundBpvToStepTiesUp,
  successCountForEconomicFace,
  summarizeResistanceCancellation,
  summarizeSuccessDistribution,
  type EconomicDuration,
  type PacketDeliveryEvaluation,
  type PacketDeliveryInput,
  type ProbabilityMass,
} from "../lib/summoning/augmentDebuffEconomics";

const EPSILON = 1e-10;
let assertionCount = 0;

function check(condition: unknown, message: string): asserts condition {
  assertionCount += 1;
  assert.ok(condition, message);
}

function near(actual: number, expected: number, message: string, epsilon = EPSILON): void {
  assertionCount += 1;
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message}\nExpected: ${expected}\nActual: ${actual}`,
  );
}

function massNear(actual: ProbabilityMass, expected: ProbabilityMass, message: string): void {
  assertionCount += 1;
  assert.equal(actual.length, expected.length, `${message}: distribution length`);
  actual.forEach((probability, index) => {
    assert.ok(
      Math.abs(probability - (expected[index] ?? 0)) <= EPSILON,
      `${message}: probability at ${index}`,
    );
  });
}

function packet(
  overrides: Partial<PacketDeliveryInput> & Pick<PacketDeliveryInput, "id">,
): PacketDeliveryEvaluation {
  return evaluateAugmentDebuffPacket({
    id: overrides.id,
    family: overrides.family ?? "AUGMENT",
    attribute: overrides.attribute ?? "GUARD",
    targetBucket: overrides.targetBucket ?? "PRIMARY_TARGETS",
    diceCount: overrides.diceCount ?? 3,
    potency: overrides.potency ?? 3,
    modifier: overrides.modifier ?? 3,
    duration: overrides.duration ?? { kind: "TURNS", turns: 2 },
    recurring: overrides.recurring ?? false,
    expectedTargetCount: overrides.expectedTargetCount ?? 1,
    resolution: overrides.resolution ?? { mode: "INDEPENDENT" },
    sourceDieSides: overrides.sourceDieSides,
    sourceRollModifier: overrides.sourceRollModifier,
    sourceSuccessDistribution: overrides.sourceSuccessDistribution,
    resistSuccessDistribution: overrides.resistSuccessDistribution,
    additionalCleanupRate: overrides.additionalCleanupRate,
    geometry: overrides.geometry,
    retainedShellInputs: overrides.retainedShellInputs,
  });
}

function certainPacket(params: {
  id: string;
  family?: "AUGMENT" | "DEBUFF";
  modifier: 1 | 2 | 3 | 4 | 5;
  duration?: EconomicDuration;
  potency?: number;
  attribute?: string;
  targetBucket?: string;
  expectedTargetCount?: number;
}): PacketDeliveryEvaluation {
  return packet({
    ...params,
    sourceSuccessDistribution: [0, 1],
    resistSuccessDistribution: params.family === "DEBUFF" ? [1] : undefined,
    resolution: { mode: "INDEPENDENT" },
    potency: params.potency ?? 20,
    duration: params.duration ?? { kind: "TURNS", turns: 1 },
  });
}

// Exact success math.
for (const [dieSides, expected] of [
  [4, [0.75, 0.25, 0]],
  [6, [0.5, 0.5, 0]],
  [8, [0.375, 0.625, 0]],
  [10, [0.3, 0.6, 0.1]],
  [12, [0.25, 0.5, 0.25]],
] as const) {
  massNear(createSuccessDistribution({ dieSides, diceCount: 1 }), expected, `D${dieSides}`);
}
for (const diceCount of [1, 2, 3, 4, 6, 10, 20]) {
  const distribution = createSuccessDistribution({ dieSides: 8, diceCount });
  near(distribution.reduce((sum, probability) => sum + probability, 0), 1, `${diceCount}D8 mass`);
  check(distribution.length === diceCount * 2 + 1, `${diceCount}D8 support must be exact.`);
}
check(successCountForEconomicFace(1, 5) === 0, "Natural 1 must remain zero under +5.");
check(successCountForEconomicFace(8, -5) === 0, "Negative roll Modifier must apply.");
check(successCountForEconomicFace(9, 1) === 2, "Modified totals of 10+ must yield two successes.");
near(
  summarizeSuccessDistribution(createSuccessDistribution({ dieSides: 8, diceCount: 3 })).expectedSuccesses,
  1.875,
  "3D8 expected successes",
);
massNear(
  cancelSuccessDistributions([0.25, 0.5, 0.25], [0.5, 0.5]),
  [0.5, 0.375, 0.125],
  "Exact source/Resist cancellation",
);
const matched3d8 = createMatchedReferenceResistDistribution();
massNear(
  matched3d8,
  [0.052734375, 0.263671875, 0.439453125, 0.244140625, 0, 0, 0],
  "Matched 3D8 reference distribution",
);
const matchedCancellation = summarizeResistanceCancellation(matched3d8, matched3d8);
near(matchedCancellation.probabilityFullResistance, 0.6625137329101562, "Matched 3D8 full resistance");
near(matchedCancellation.probabilityAtLeastOne, 0.33748626708984375, "Matched 3D8 application");
near(matchedCancellation.expectedNetSuccesses, 0.45078277587890625, "Matched 3D8 net successes");

// Exact uptime, cleanup, saturation, and recurrence.
const certainSuccess = [0, 1] as const;
for (const turns of [1, 2, 3, 4] as const) {
  const uptime = enumerateStackUptime({
    appliedSuccessDistribution: certainSuccess,
    potency: 20,
    duration: { kind: "TURNS", turns },
  });
  near(uptime.expectedActiveTurns, turns, `Duration ${turns}`);
}
near(
  enumerateStackUptime({
    appliedSuccessDistribution: certainSuccess,
    potency: 20,
    duration: { kind: "UNTIL_TARGET_NEXT_TURN" },
  }).expectedActiveTurns,
  1,
  "Until Target Next Turn",
);
near(
  enumerateStackUptime({
    appliedSuccessDistribution: certainSuccess,
    potency: 20,
    duration: { kind: "PASSIVE" },
  }).expectedActiveTurns,
  4,
  "Passive four-turn bound",
);
for (const [additionalCleanupRate, expectedTurns] of [[0, 4], [1, 3], [2, 2]] as const) {
  near(
    enumerateStackUptime({
      appliedSuccessDistribution: certainSuccess,
      potency: 5,
      duration: { kind: "TURNS", turns: 4 },
      additionalCleanupRate,
    }).expectedActiveTurns,
    expectedTurns,
    `Cleanup rate ${additionalCleanupRate}`,
  );
}
const durationOneP1 = packet({
  id: "duration-one-p1",
  sourceSuccessDistribution: [0.25, 0.75],
  potency: 1,
  duration: { kind: "TURNS", turns: 1 },
});
const durationOneP20 = packet({
  id: "duration-one-p20",
  sourceSuccessDistribution: [0.25, 0.75],
  potency: 20,
  duration: { kind: "TURNS", turns: 1 },
});
near(durationOneP1.expectedActiveTurns, durationOneP20.expectedActiveTurns, "Duration-1 Potency saturation");
check(durationOneP1.finiteDurationSaturationPoint === 1, "Duration 1 must saturate at Potency 1.");
check(durationOneP20.potencyCanNoLongerImproveFiniteDurationUptime, "Saturated Potency must be reported.");
const matchedP10 = packet({
  id: "matched-p10",
  family: "DEBUFF",
  potency: 10,
  duration: { kind: "TURNS", turns: 4 },
});
const matchedP20 = packet({
  id: "matched-p20",
  family: "DEBUFF",
  potency: 20,
  duration: { kind: "TURNS", turns: 4 },
});
near(matchedP10.expectedActiveTurns, matchedP20.expectedActiveTurns, "3D8 finite saturation at P10/P20");
const recurrence = enumerateStackUptime({
  appliedSuccessDistribution: [0.5, 0.5],
  potency: 3,
  duration: { kind: "TURNS", turns: 2 },
  recurring: true,
});
massNear(recurrence.activeProbabilityByTurn, [0.5, 0.75, 0.75, 0.75], "Max-and-refresh recurrence");
check(recurrence.maxAndRefresh, "Recurrence must declare max-and-refresh.");
check(recurrence.additiveRecurringStacks === false, "Recurrence must never add stacks.");
near(recurrence.recurrenceUptime ?? -1, 2.75, "Failed recurrence must not independently refresh duration");
check(recurrence.horizonTurns === 4, "Recurring pricing horizon must be four turns.");

// Approved pricing severity and diagnostics.
assertionCount += 2;
assert.deepEqual(APPROVED_AUGMENT_MODIFIER_SEVERITY, { 1: 1, 2: 3, 3: 4, 4: 5, 5: 6 });
assert.deepEqual(APPROVED_DEBUFF_MODIFIER_SEVERITY, { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 });
for (const modifier of [1, 2, 3, 4, 5] as const) {
  check(getModifierSeverity("AUGMENT", modifier) === [0, 1, 3, 4, 5, 6][modifier], `Augment M${modifier}`);
  check(getModifierSeverity("DEBUFF", modifier) === modifier, `Debuff M${modifier}`);
}
const d8Diagnostics = getSignedModifierSuccessDiagnostics();
check(d8Diagnostics.length === 11, "D8 diagnostics must cover -5 through +5.");
check(d8Diagnostics[0]?.rollModifier === -5 && d8Diagnostics[10]?.rollModifier === 5, "Signed diagnostic bounds");
near(d8Diagnostics[5]?.deltaFromUnmodifiedPerDie ?? -1, 0, "Unmodified D8 diagnostic");
for (const dieSides of [4, 6, 10, 12] as const) {
  const diagnostic = getModifierSuccessDeltaDiagnostic({ family: "AUGMENT", modifier: 3, dieSides });
  check(diagnostic.approvedPricingSeverity === 4, `D${dieSides} diagnostic must retain D8 pricing severity.`);
}

// Explicit breadth and geometry isolation.
for (const expectedTargetCount of [1, 2, 3, 5, 6, 9]) {
  const evaluation = packet({ id: `targets-${expectedTargetCount}`, expectedTargetCount });
  near(
    evaluation.expectedActiveTargetTurns,
    evaluation.expectedActiveTurns * expectedTargetCount,
    `Explicit target count ${expectedTargetCount}`,
  );
}
const geometrySmall = packet({
  id: "geometry-small",
  expectedTargetCount: 3,
  geometry: { kind: "SPHERE", radiusFeet: 10 },
});
const geometryLarge = packet({
  id: "geometry-large",
  expectedTargetCount: 3,
  geometry: { kind: "SPHERE", radiusFeet: 100 },
});
near(geometrySmall.deliveryUnits, geometryLarge.deliveryUnits, "Geometry cannot multiply target occupancy");
check(geometryLarge.breadth.geometrySemanticMultiplier === 1, "Geometry multiplier must remain one.");
check(geometryLarge.breadth.expectedTargetCount === 3, "Explicit count remains breadth authority.");

// Linked delivery.
const parent = packet({
  id: "primary",
  sourceSuccessDistribution: [0.4, 0.6],
  resolution: { mode: "INDEPENDENT" },
  modifier: 3,
});
const linked = packet({
  id: "linked",
  diceCount: 0,
  potency: 2,
  modifier: 2,
  resolution: {
    mode: "LINKED",
    dependencyId: "primary",
    inheritedAppliedSuccessDistribution: parent.appliedSuccessDistribution,
  },
});
massNear(linked.appliedSuccessDistribution, parent.appliedSuccessDistribution, "Linked inherited distribution");
check(!linked.usesIndependentDiceDistribution, "Linked delivery must not roll independent Dice.");
near(linked.expectedInitialStacks, 1.2, "Linked Potency applies to inherited successes");
check(linked.severity === 3, "Linked Modifier must use its own band once, not successes.");
const zeroLinked = packet({
  id: "zero-linked",
  resolution: { mode: "LINKED", dependencyId: "zero-parent", inheritedAppliedSuccessDistribution: [1] },
});
near(zeroLinked.deliveryUnits, 0, "Zero parent application means zero linked delivery");
const missingLinked = packet({
  id: "missing-linked",
  resolution: { mode: "LINKED", dependencyId: "missing" },
});
check(!missingLinked.supported, "Missing linked distribution must be unsupported.");
check(missingLinked.warnings.includes("LINKED_DEPENDENCY_DISTRIBUTION_REQUIRED"), "Missing dependency diagnostic");

// Clamp-aware aggregation.
function aggregate(...evaluations: PacketDeliveryEvaluation[]) {
  return aggregateAugmentDebuffPowerDelivery(evaluations);
}
const plus3Pair = aggregate(
  certainPacket({ id: "plus3-a", modifier: 3 }),
  certainPacket({ id: "plus3-b", modifier: 3 }),
);
check(plus3Pair.groups[0]?.certainCappedModifierByTurn[0] === 5, "+3 and +3 must clamp to +5.");
check(plus3Pair.groups[0]?.hiddenExcessProbabilityByTurn[0] === 1, "+6 must preserve hidden excess.");
const plus5Minus3 = aggregate(
  certainPacket({ id: "plus5", modifier: 5 }),
  certainPacket({ id: "minus3", family: "DEBUFF", modifier: 3 }),
);
check(plus5Minus3.groups[0]?.certainCappedModifierByTurn[0] === 2, "+5 and -3 must yield +2.");
const mixedThree = aggregate(
  certainPacket({ id: "mixed-plus5", modifier: 5 }),
  certainPacket({ id: "mixed-plus4", modifier: 4 }),
  certainPacket({ id: "mixed-minus5", family: "DEBUFF", modifier: 5 }),
);
check(mixedThree.groups[0]?.certainCappedModifierByTurn[0] === 4, "+5, +4, and -5 must yield +4.");
const differentAttributes = aggregate(
  certainPacket({ id: "guard", modifier: 3, attribute: "GUARD" }),
  certainPacket({ id: "bravery", modifier: 3, attribute: "BRAVERY" }),
);
check(differentAttributes.groups.length === 2, "Different attributes must aggregate independently.");
const differentBuckets = aggregate(
  certainPacket({ id: "primary-bucket", modifier: 3, targetBucket: "PRIMARY" }),
  certainPacket({ id: "secondary-bucket", modifier: 3, targetBucket: "SECONDARY" }),
);
check(differentBuckets.groups.length === 2, "Different target buckets must aggregate independently.");
const differingDurations = aggregate(
  certainPacket({ id: "short", modifier: 3, duration: { kind: "TURNS", turns: 1 } }),
  certainPacket({ id: "long", modifier: 3, duration: { kind: "TURNS", turns: 2 } }),
);
check(differingDurations.groups[0]?.certainCappedModifierByTurn.join("|") === "5|3", "Hidden excess must preserve later value.");
const independentProbabilities = aggregate(
  packet({ id: "chance-a", modifier: 3, potency: 1, duration: { kind: "TURNS", turns: 1 }, sourceSuccessDistribution: [0.5, 0.5] }),
  packet({ id: "chance-b", modifier: 3, potency: 1, duration: { kind: "TURNS", turns: 1 }, sourceSuccessDistribution: [0.5, 0.5] }),
);
massNear(
  independentProbabilities.groups[0]?.rawModifierDistributionByTurn[0].map((entry) => entry.probability) ?? [],
  [0.25, 0.5, 0.25],
  "Independent applications remain independent",
);
const linkedAggregate = aggregate(parent, linked);
check(linkedAggregate.status === "SUPPORTED", "Compatible linked primary and secondary must aggregate.");
check(
  linkedAggregate.groups[0]?.rawModifierDistributionByTurn[0].map((entry) => entry.modifier).join("|") === "0|5",
  "Linked packets must preserve dependency correlation.",
);
const crossAttributeLinkedAggregate = aggregate(parent, {
  ...linked,
  input: {
    ...linked.input,
    attribute: "BRAVERY",
  },
});
check(
  crossAttributeLinkedAggregate.status === "SUPPORTED",
  "Linked packets may inherit delivery across attribute groups.",
);
check(
  crossAttributeLinkedAggregate.groups.length === 2,
  "Cross-attribute linked packets must retain separate clamp groups.",
);
const duplicateSemantics = aggregate(
  certainPacket({ id: "duplicate-a", modifier: 5 }),
  certainPacket({ id: "duplicate-b", modifier: 5 }),
);
check(duplicateSemantics.groups[0]?.certainCappedModifierByTurn[0] === 5, "Duplicate semantics must still clamp.");
const unsupported = aggregate(
  packet({ id: "correlated-a", sourceSuccessDistribution: [0.5, 0.5], resolution: { mode: "INDEPENDENT", correlationId: "unknown-joint" } }),
  packet({ id: "correlated-b", sourceSuccessDistribution: [0.25, 0.75], resolution: { mode: "INDEPENDENT", correlationId: "unknown-joint" } }),
);
check(unsupported.status === "UNSUPPORTED_CORRELATION", "Unsupported correlation must diagnose.");
check(unsupported.totalDeliveryUnits === null, "Unsupported correlation must not fall back to addition.");

// Monotonicity and boundary packages.
function delivery(overrides: Partial<PacketDeliveryInput> & Pick<PacketDeliveryInput, "id">): number {
  return packet(overrides).deliveryUnits;
}
let previous = -1;
for (const diceCount of [1, 2, 3, 4, 6, 10, 20]) {
  const current = delivery({ id: `dice-${diceCount}`, diceCount });
  check(current + EPSILON >= previous, "Increasing Dice must not reduce delivery.");
  previous = current;
}
previous = -1;
for (const potency of [1, 2, 3, 5, 10, 20]) {
  const current = delivery({ id: `potency-${potency}`, potency, duration: { kind: "TURNS", turns: 4 } });
  check(current + EPSILON >= previous, "Increasing Potency must not reduce delivery.");
  previous = current;
}
previous = -1;
for (const modifier of [1, 2, 3, 4, 5] as const) {
  const current = delivery({ id: `modifier-${modifier}`, modifier });
  check(current + EPSILON >= previous, "Increasing Modifier must not reduce delivery.");
  previous = current;
}
const narrow = delivery({ id: "narrow", expectedTargetCount: 1, duration: { kind: "TURNS", turns: 1 } });
const broad = delivery({ id: "broad", expectedTargetCount: 9, duration: { kind: "TURNS", turns: 4 } });
check(broad >= narrow && broad > 0, "Targets and duration must not reduce delivery; broad AOE is not free.");
const resisted = delivery({ id: "resisted", family: "DEBUFF" });
const unresisted = delivery({ id: "unresisted", family: "DEBUFF", resistSuccessDistribution: [1] });
check(unresisted + EPSILON >= resisted, "Removing resistance must not reduce delivery.");
const nonRecurring = delivery({ id: "non-recurring", sourceSuccessDistribution: [0.5, 0.5], potency: 3, duration: { kind: "TURNS", turns: 2 } });
const recurringDelivery = delivery({ id: "recurring", sourceSuccessDistribution: [0.5, 0.5], potency: 3, duration: { kind: "TURNS", turns: 2 }, recurring: true });
check(recurringDelivery + EPSILON >= nonRecurring, "Recurrence must not reduce delivery.");
for (const boundary of [
  packet({ id: "high-dice-low-potency", diceCount: 20, potency: 1, modifier: 5 }),
  packet({ id: "low-dice-high-potency", diceCount: 1, potency: 20, modifier: 5 }),
  packet({ id: "high-dice-high-potency-low-modifier", diceCount: 20, potency: 20, modifier: 1 }),
  packet({ id: "high-all", diceCount: 20, potency: 20, modifier: 5, expectedTargetCount: 9, duration: { kind: "PASSIVE" } }),
]) {
  check(Number.isFinite(boundary.deliveryUnits) && boundary.deliveryUnits >= 0, `${boundary.input.id} must be finite.`);
  check(boundary.calibration.finalBpv === null, `${boundary.input.id} must not emit BPV.`);
}

// Code-owned calibration remains isolated from active/admin tuning.
check(AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.deliveryUnitToBpvCoefficient === 1.51, "Approved coefficient");
check(
  !("minimumDeliveryBpv" in AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT),
  "Calibration must contain no active delivery floor",
);
check(AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.finalBpvRoundingStep === 0.5, "Approved rounding step");
check(AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.halfStepTiePolicy === "UPWARD", "Approved tie policy");
check(AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.status === "APPROVED_CALIBRATED_NOT_PUBLIC", "Calibration status");
check(!POWER_TUNING_CONFIG_KEY_ORDER.some((key) => key.includes("augmentDebuffEconomics")), "Draft must not enter active tuning keys.");
check(!Object.keys(POWER_TUNING_ADMIN_METADATA).some((key) => key.includes("augmentDebuffEconomics")), "Draft must not enter active admin metadata.");
check(
  Object.values(AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT_ADMIN_METADATA).every(
    (metadata) => !metadata.editable && metadata.activeTuningKey === null,
  ),
  "Draft metadata must remain inert and non-editable.",
);
check(
  !("minimumDeliveryBpv" in AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT_ADMIN_METADATA),
  "Admin metadata must expose no delivery floor",
);
const economicsSource = readFileSync("lib/summoning/augmentDebuffEconomics.ts", "utf8");
check(!/\b1\.4\b/u.test(economicsSource), "Rejected 1.4 coefficient must be absent from economics implementation.");
check(!/floorAppliedDeliveryCharge|floorActivated|minimumDeliveryBpv/u.test(economicsSource), "Floor-specific conversion fields must be absent.");
near(roundBpvToStepTiesUp(7.24, 0.5), 7, "Round below half-step");
near(roundBpvToStepTiesUp(7.25, 0.5), 7.5, "Half-step tie rounds upward");
near(roundBpvToStepTiesUp(7.75, 0.5), 8, "Second half-step tie rounds upward");
const lowDeliveryCharge = calculateAggregateModifierDeliveryCharge(0.2996000647544861);
near(
  lowDeliveryCharge.linearDeliveryCharge,
  1.51 * lowDeliveryCharge.aggregateDeliveryUnits,
  "Low diagnostic delivery remains exactly linear",
);
check(
  !("floorActivated" in lowDeliveryCharge),
  "Linear delivery charge must expose no minimum-floor flag",
);
const explicitlyUncalibrated = convertAugmentDebuffPowerToBpv({
  aggregateDeliveryUnits: 7.578125,
  retainedShell: 4.7,
  unaffectedCosts: 0,
  mode: "UNCALIBRATED",
});
check(explicitlyUncalibrated.calibrationStatus === "UNCALIBRATED", "Explicit uncalibrated diagnostics remain available");
check(explicitlyUncalibrated.roundedFinalBpv === null, "Uncalibrated mode must not emit final BPV");

// Deterministic delivery-unit calibration anchors (not BPV).
const anchors = {
  augment3d8P3M3Duration2: packet({ id: "anchor-augment", family: "AUGMENT" }),
  matchedDebuff3d8P3M3Duration2: packet({ id: "anchor-debuff", family: "DEBUFF" }),
  modestPlus1: packet({ id: "anchor-plus1", modifier: 1 }),
  reliablePlus2: packet({ id: "anchor-plus2", diceCount: 6, modifier: 2 }),
  strongPlus3: packet({ id: "anchor-plus3", diceCount: 6, potency: 4, modifier: 3, duration: { kind: "TURNS", turns: 3 } }),
  plus4Passive: packet({ id: "anchor-plus4-passive", modifier: 4, potency: 20, duration: { kind: "PASSIVE" } }),
  plus5Reference: packet({ id: "anchor-plus5", modifier: 5 }),
  oneTarget: packet({ id: "anchor-one-target", expectedTargetCount: 1 }),
  threeTargets: packet({ id: "anchor-three-targets", expectedTargetCount: 3 }),
  aoeSixTargets: packet({ id: "anchor-six-targets", expectedTargetCount: 6, geometry: { kind: "SPHERE", radiusFeet: 20 } }),
  aoeNineTargets: packet({ id: "anchor-nine-targets", expectedTargetCount: 9, geometry: { kind: "SPHERE", radiusFeet: 20 } }),
};
near(anchors.threeTargets.deliveryUnits, anchors.oneTarget.deliveryUnits * 3, "One versus three targets");
near(anchors.aoeNineTargets.deliveryUnits, anchors.aoeSixTargets.deliveryUnits * 1.5, "Explicit AOE target comparison");
for (const [name, evaluation] of Object.entries(anchors)) {
  check(evaluation.finalBpvConversionStatus === "UNAVAILABLE_UNCALIBRATED", `${name} conversion status`);
}

const approvedAnchorInputs = [
  ["A", packet({ id: "bpv-a", diceCount: 2, potency: 1, modifier: 1, duration: { kind: "TURNS", turns: 1 } }), 4.7, 6],
  ["B", packet({ id: "bpv-b", diceCount: 3, potency: 2, modifier: 2 }), 4.7, 13.5],
  ["C", packet({ id: "bpv-c" }), 4.7, 16],
  ["D", packet({ id: "bpv-d", modifier: 5 }), 4.7, 22],
  ["E", packet({ id: "bpv-e", modifier: 4, duration: { kind: "PASSIVE" } }), 4.7, 31.5],
  ["F", packet({ id: "bpv-f", expectedTargetCount: 3 }), 4.7, 39],
  ["G", packet({ id: "bpv-g", expectedTargetCount: 6 }), 6.2, 75],
  ["H", packet({ id: "bpv-h", family: "DEBUFF" }), 3.7, 7],
  ["I", packet({ id: "bpv-i", family: "DEBUFF", expectedTargetCount: 3 }), 3.7, 13],
] as const;
for (const [name, evaluation, retainedShell, expectedBpv] of approvedAnchorInputs) {
  const conversion = convertAugmentDebuffPowerToBpv({
    aggregateDeliveryUnits: evaluation.deliveryUnits,
    retainedShell,
    unaffectedCosts: 0,
  });
  near(conversion.roundedFinalBpv ?? -1, expectedBpv, `Approved BPV anchor ${name}`);
}

function calibratedBpv(evaluation: PacketDeliveryEvaluation, retainedShell: number): number {
  return (
    convertAugmentDebuffPowerToBpv({
      aggregateDeliveryUnits: evaluation.deliveryUnits,
      retainedShell,
      unaffectedCosts: 0,
    }).roundedFinalBpv ?? -1
  );
}

const interpolationGrid = [
  ["1D8/P1/M1/D1", packet({ id: "grid-1d", diceCount: 1, potency: 1, modifier: 1, duration: { kind: "TURNS", turns: 1 } }), 4.7, 5.5],
  ["6D8/P1/M5/D2", packet({ id: "grid-6d", diceCount: 6, potency: 1, modifier: 5 }), 4.7, 22.5],
  ["1D8/P20/M5/D4", packet({ id: "grid-p20", diceCount: 1, potency: 20, modifier: 5, duration: { kind: "TURNS", turns: 4 } }), 4.7, 27.5],
  ["10D8/P1/M1/D4", packet({ id: "grid-10d", diceCount: 10, potency: 1, modifier: 1, duration: { kind: "TURNS", turns: 4 } }), 4.7, 10.5],
  ["3D8/P10/M1/D4", packet({ id: "grid-p10", potency: 10, modifier: 1, duration: { kind: "TURNS", turns: 4 } }), 4.7, 10.5],
  ["Recurring M3", packet({ id: "grid-recurring", recurring: true }), 4.7, 28.5],
  ["Two targets", packet({ id: "grid-two-targets", expectedTargetCount: 2 }), 4.7, 27.5],
  ["Five targets", packet({ id: "grid-five-targets", expectedTargetCount: 5 }), 4.7, 62],
] as const;
for (const [name, evaluation, retainedShell, expectedBpv] of interpolationGrid) {
  near(calibratedBpv(evaluation, retainedShell), expectedBpv, `Interpolation ${name}`);
}

for (const [modifier, expectedBpv] of [
  [1, 4.5],
  [2, 5.5],
  [3, 7],
  [4, 8],
  [5, 9],
] as const) {
  const evaluation = packet({ id: `grid-matched-debuff-${modifier}`, family: "DEBUFF", modifier });
  near(calibratedBpv(evaluation, 3.7), expectedBpv, `Matched Debuff M${modifier}`);
}
const matchedDebuffProgression = ([1, 2, 3, 4, 5] as const).map((modifier) => {
  const evaluation = packet({
    id: `grid-matched-debuff-progression-${modifier}`,
    family: "DEBUFF",
    modifier,
  });
  const conversion = convertAugmentDebuffPowerToBpv({
    aggregateDeliveryUnits: evaluation.deliveryUnits,
    retainedShell: 3.7,
    unaffectedCosts: 0,
  });
  near(
    conversion.linearDeliveryCharge ?? -1,
    1.51 * evaluation.deliveryUnits,
    `Matched Debuff M${modifier} linear charge`,
  );
  return {
    modifier,
    deliveryUnits: evaluation.deliveryUnits,
    linearDeliveryCharge: conversion.linearDeliveryCharge ?? -1,
    unroundedFullBpv: conversion.unroundedFullBpv ?? -1,
    roundedFinalBpv: conversion.roundedFinalBpv ?? -1,
  };
});
check(
  matchedDebuffProgression.every(
    (entry, index) =>
      index === 0 ||
      entry.roundedFinalBpv > matchedDebuffProgression[index - 1].roundedFinalBpv,
  ),
  "Matched Debuff M1-M5 rounded BPV must be strictly increasing",
);
const strongResist = packet({
  id: "grid-strong-resist",
  family: "DEBUFF",
  resistSuccessDistribution: createSuccessDistribution({ dieSides: 8, diceCount: 6 }),
});
near(calibratedBpv(strongResist, 3.7), 4, "Strong-resistance diagnostic remains linear and non-authoritative");

console.log(
  JSON.stringify(
    {
      passed: true,
      assertionCount,
      anchors: Object.fromEntries(
        Object.entries(anchors).map(([name, evaluation]) => [name, evaluation.deliveryUnits]),
      ),
      matchedReference: {
        probabilityFullResistance: matchedCancellation.probabilityFullResistance,
        probabilityOfApplication: matchedCancellation.probabilityAtLeastOne,
        expectedNetSuccesses: matchedCancellation.expectedNetSuccesses,
      },
      calibrationStatus: AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.status,
      coefficient: AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.deliveryUnitToBpvCoefficient,
      matchedDebuffProgression,
    },
    null,
    2,
  ),
);
