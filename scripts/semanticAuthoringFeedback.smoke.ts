import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createSemanticAuthoringFeedback,
  formatSemanticApplicationProbability,
  formatSemanticExpectedActiveTurns,
  NEAR_CERTAIN_APPLICATION_PROBABILITY,
  UNPRICED_REMOVAL_HARDNESS,
} from "../lib/powers/semanticAuthoringFeedback";
import {
  createReferenceSourceDistribution,
  evaluateAugmentDebuffPacket,
  type EconomicDuration,
  type PacketDeliveryEvaluation,
  type PacketDeliveryInput,
} from "../lib/summoning/augmentDebuffEconomics";
import {
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  normalizeCharacterPower,
} from "../lib/characterBuilder/powers";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import activePowerTuningFixture from "./fixtures/tuning/active-power-tuning.json";

let checks = 0;

function check(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

function near(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) <= 1e-12, `${message}: expected ${expected}, received ${actual}`);
  checks += 1;
}

function evaluate(params: {
  id?: string;
  family?: "AUGMENT" | "DEBUFF";
  diceCount?: number;
  potency?: number;
  duration?: EconomicDuration;
  recurring?: boolean;
  resolution?: PacketDeliveryInput["resolution"];
} = {}): PacketDeliveryEvaluation {
  return evaluateAugmentDebuffPacket({
    id: params.id ?? "feedback-packet",
    family: params.family ?? "AUGMENT",
    attribute: "BRAVERY",
    targetBucket: "PRIMARY_TARGET",
    diceCount: params.diceCount ?? 1,
    potency: params.potency ?? 1,
    modifier: 1,
    duration: params.duration ?? { kind: "UNTIL_TARGET_NEXT_TURN" },
    recurring: params.recurring ?? false,
    expectedTargetCount: 3,
    resolution: params.resolution ?? { mode: "INDEPENDENT", correlationId: params.id ?? "feedback-packet" },
  });
}

const augmentD1 = createSemanticAuthoringFeedback(evaluate({ diceCount: 1 }))!;
const augmentD3 = createSemanticAuthoringFeedback(evaluate({ diceCount: 3 }))!;
const augmentD5 = createSemanticAuthoringFeedback(evaluate({ diceCount: 5 }))!;
const augmentD19 = createSemanticAuthoringFeedback(evaluate({ diceCount: 19 }))!;
near(augmentD1.applicationProbability, 0.625, "Augment Dice 1 uses the exact D8 pricing distribution");
near(augmentD3.applicationProbability, 0.947265625, "Augment Dice 3 uses the exact D8 pricing distribution");
check(!augmentD3.isNearCertain, "Dice 3 is below the approved near-certainty threshold.");
check(augmentD5.applicationProbability >= 0.99 && augmentD5.isNearCertain, "Dice 5 crosses near certainty.");
check(augmentD19.isNearCertain, "Dice 19 remains near-certain without claiming exact saturation.");
check(augmentD19.formattedApplicationProbability === ">99.9%", "Sub-certain reliability is not rounded into an exact-looking 100.0%.");
check(augmentD5.nearCertaintyNotice?.includes("very little extra reliability"), "Near-certainty copy explains marginal Dice value.");

const resistedDebuff = createSemanticAuthoringFeedback(evaluate({
  family: "DEBUFF",
  diceCount: 3,
}))!;
near(resistedDebuff.applicationProbability, 0.33748626708984375, "Debuff reliability uses post-resistance applied successes");
check(
  resistedDebuff.reliabilityReference === "STANDARD_D8_MATCHED_RESISTANCE" &&
    resistedDebuff.reliabilityNotice === "Pricing reliability after matched resistance: 33.7%.",
  "Resisted Debuff feedback identifies the matched-resistance reference.",
);

const primaryEvaluation = evaluate({ id: "primary", diceCount: 3 });
const linkedFeedback = createSemanticAuthoringFeedback(evaluate({
  id: "linked",
  diceCount: 20,
  potency: 20,
  resolution: {
    mode: "LINKED",
    dependencyId: "primary",
    inheritedAppliedSuccessDistribution: primaryEvaluation.appliedSuccessDistribution,
  },
}))!;
near(linkedFeedback.applicationProbability, primaryEvaluation.applicationProbability, "Linked reliability inherits primary applied successes");
check(linkedFeedback.linkedReliabilityInherited, "Linked feedback does not present an independent Dice model.");
check(linkedFeedback.reliabilityNotice === "Uses the primary packet's applied-success result.", "Linked copy names the inherited authority.");
check(createSemanticAuthoringFeedback(null) === null, "Incomplete packets do not fabricate probability.");

const oneTurnP1 = createSemanticAuthoringFeedback(evaluate({ potency: 1 }))!;
const oneTurnP20 = createSemanticAuthoringFeedback(evaluate({ potency: 20 }))!;
check(oneTurnP1.potencySaturated && oneTurnP1.potencySaturationPoint === 1, "One-turn Potency 1 is sufficient.");
check(oneTurnP20.potencySaturated && oneTurnP20.potencySaturationPoint === 1, "One-turn Potency 20 reports the exact plateau.");
check(
  oneTurnP20.potencySaturationNotice ===
    "Natural persistence is saturated at 1 for this duration. Additional Potency does not extend the effect through ordinary stack degradation and does not increase current BPV, but extra stacks may still affect Resist or Cleanse difficulty.",
  "Saturation copy accurately distinguishes natural persistence, BPV, and removal difficulty.",
);
check(
  oneTurnP20.redundantValueNotice ===
    "Values that do not improve priced reliability or natural persistence do not increase current BPV. Removal difficulty is not currently priced.",
  "Generic redundant-value copy names the unpriced removal dimension.",
);
check(!oneTurnP1.unpricedRemovalHardness, "No removal-hardness diagnostic appears when stacks cannot exceed priced persistence.");
check(
  oneTurnP20.unpricedRemovalHardness &&
    oneTurnP20.warnings.includes(UNPRICED_REMOVAL_HARDNESS) &&
    oneTurnP20.unpricedRemovalHardnessNotice?.includes("Resist or Cleanse difficulty") &&
    oneTurnP20.unpricedRemovalHardnessNotice.includes("not certified as balanced"),
  "Excess stacks expose the stable unpriced-removal-hardness diagnostic with the required balance warning.",
);

const fourTurnP1 = evaluate({ diceCount: 2, potency: 1, duration: { kind: "TURNS", turns: 4 } });
const fourTurnP2 = evaluate({ diceCount: 2, potency: 2, duration: { kind: "TURNS", turns: 4 } });
const fourTurnP4 = createSemanticAuthoringFeedback(evaluate({ diceCount: 2, potency: 4, duration: { kind: "TURNS", turns: 4 } }))!;
check(fourTurnP1.expectedActiveTurns !== fourTurnP2.expectedActiveTurns, "Four-turn Potency 1 remains meaningfully different from Potency 2.");
check(fourTurnP4.potencySaturationPoint === 4, "Four-turn Potency 4 reaches the evaluator's exact plateau.");

const passiveP20 = createSemanticAuthoringFeedback(evaluate({ diceCount: 2, potency: 20, duration: { kind: "PASSIVE" } }))!;
check(passiveP20.potencySaturated && passiveP20.potencySaturationPoint !== null, "Passive saturation is proven against the authored result.");
check(passiveP20.passiveHorizonNotice?.includes("four target turns"), "Passive feedback distinguishes the pricing horizon from runtime duration.");

const recurring = createSemanticAuthoringFeedback(evaluate({
  diceCount: 2,
  potency: 20,
  duration: { kind: "TURNS", turns: 4 },
  recurring: true,
}))!;
check(recurring.recurrenceNotice?.includes("max-and-refresh"), "Recurring feedback states max-and-refresh semantics.");
check(recurring.warnings.includes("RECURRENCE_USES_MAX_AND_REFRESH_NOT_ADDITION"), "Recurrence evaluator diagnostics remain visible to the helper.");

const resistedP1 = evaluate({ family: "DEBUFF", diceCount: 3, potency: 1, duration: { kind: "TURNS", turns: 4 } });
const resistedP5 = evaluate({ family: "DEBUFF", diceCount: 3, potency: 5, duration: { kind: "TURNS", turns: 4 } });
check(resistedP5.expectedActiveTurns > resistedP1.expectedActiveTurns, "Resisted Debuff Potency remains meaningful when it changes persistence.");
check(linkedFeedback.potencySaturationPoint === 1, "Linked saturation uses inherited primary applied successes.");

check(formatSemanticApplicationProbability(0.947265625) === "94.7%", "Probability formatting is deterministic.");
check(formatSemanticExpectedActiveTurns(2.5) === "2.50", "Expected-turn formatting is deterministic.");
check(NEAR_CERTAIN_APPLICATION_PROBABILITY === 0.99, "Near-certainty starts at the approved 99% threshold.");

const builderSource = readFileSync("app/campaign/[id]/characters/[characterId]/builder/page.tsx", "utf8");
const summoningSource = readFileSync("app/summoning-circle/components/SummoningCircleEditor.tsx", "utf8");
for (const [label, source] of [["Character Builder", builderSource], ["Summoning Circle", summoningSource]] as const) {
  check(source.includes("getSemanticAuthoringFeedbackForPacket"), `${label} consumes the shared feedback model.`);
  check(source.includes("semanticFeedback.potencySaturationNotice"), `${label} renders semantic Potency saturation feedback.`);
  check(source.includes("semanticFeedback.unpricedRemovalHardnessNotice"), `${label} renders unpriced removal hardness feedback.`);
  check(source.includes("semanticFeedback.expectedActiveDurationNotice") || source.includes("primarySemanticFeedback.reliabilityNotice"), `${label} renders semantic reliability or persistence feedback.`);
  check(source.includes("MODIFIER_AUTHORING_VALUES.map"), `${label} retains Modifier controls.`);
  check(source.includes("Estimated Targets:"), `${label} retains read-only Estimated Targets output.`);
}
check(builderSource.includes("isLegacyModifierPacket") && builderSource.includes("Legacy Potency"), "Character legacy packets retain their conversion-only path.");
check(summoningSource.includes("isLegacyModifierPacket") && summoningSource.includes("Legacy Potency"), "Summoning legacy packets retain their conversion-only path.");

const extremePacket = {
  ...createDefaultCharacterPowerPacket("AUGMENT", 0),
  id: "audit-extreme-augment-packet-001",
  diceCount: 19,
  potency: 20,
  modifier: 1,
  targetedAttribute: "BRAVERY" as const,
  effectTimingType: "ON_CAST" as const,
  effectDurationType: "UNTIL_TARGET_NEXT_TURN" as const,
  effectDurationTurns: null,
  applyTo: "PRIMARY_TARGET" as const,
  secondaryDependencyMode: "INDEPENDENT" as const,
  detailsJson: {
    statTarget: "Bravery",
    rangeCategory: "AOE",
    rangeValue: 0,
    rangeExtra: {
      shape: "LINE",
      count: 2,
      lineWidthFeet: 20,
      lineLengthFeet: 120,
    },
    expectedTargetCount: 3,
  },
};
const extremePower = normalizeCharacterPower({
  ...createDefaultCharacterPower(0),
  id: "audit-extreme-augment-power-001",
  name: "Extreme Augment feedback regression",
  diceCount: 19,
  potency: 20,
  rangeCategory: "AOE",
  aoeCenterRangeFeet: 0,
  aoeCount: 2,
  aoeShape: "LINE",
  aoeLineWidthFeet: 20,
  aoeLineLengthFeet: 120,
  effectPackets: [extremePacket],
  intentions: [extremePacket],
}, 0, {
  source: "FALLBACK_STANDARD_TEAM_SIZE_4",
  totalTeamSize: 4,
});
const extremeResolution = resolvePowerCosts([extremePower], {
  setId: activePowerTuningFixture.setId,
  name: activePowerTuningFixture.name,
  values: activePowerTuningFixture.values as Record<string, number>,
}, {
  level: 3,
  tier: "SOLDIER",
}).powers[0]!;
check(
  extremeResolution.breakdown.basePowerValue === 13.5,
  `Extreme fixture remains BPV 13.5 (received ${extremeResolution.breakdown.basePowerValue}).`,
);
check(extremeResolution.derivedCooldownTurns === 2, "Extreme fixture remains cooldown 2.");

const economicsSource = readFileSync("lib/summoning/augmentDebuffEconomics.ts", "utf8");
check(economicsSource.includes("deliveryUnits: distributions.supported ? severity * expectedActiveTargetTurns : 0"), "Feedback implementation leaves semantic delivery pricing untouched.");
check(createReferenceSourceDistribution(5).length > 0, "Feedback remains grounded in the existing reference distribution helper.");

console.log(`Semantic authoring feedback smoke passed (${checks} checks).`);
