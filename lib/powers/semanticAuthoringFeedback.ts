import {
  evaluateAugmentDebuffPacket,
  type PacketDeliveryEvaluation,
} from "@/lib/summoning/augmentDebuffEconomics";

export const NEAR_CERTAIN_APPLICATION_PROBABILITY = 0.99;
export const UNPRICED_REMOVAL_HARDNESS = "UNPRICED_REMOVAL_HARDNESS";

const SEMANTIC_EQUALITY_TOLERANCE = 1e-12;

export type SemanticReliabilityReference =
  | "STANDARD_D8_REFERENCE"
  | "STANDARD_D8_MATCHED_RESISTANCE"
  | "INHERITED_PRIMARY_APPLIED_SUCCESSES";

export type SemanticAuthoringFeedback = {
  applicationProbability: number;
  formattedApplicationProbability: string;
  reliabilityReference: SemanticReliabilityReference;
  reliabilityNotice: string;
  isNearCertain: boolean;
  nearCertaintyNotice: string | null;
  expectedActiveTurns: number;
  formattedExpectedActiveTurns: string;
  expectedActiveDurationNotice: string;
  potencySaturated: boolean;
  potencySaturationPoint: number | null;
  potencySaturationNotice: string | null;
  unpricedRemovalHardness: boolean;
  unpricedRemovalHardnessNotice: string | null;
  linkedReliabilityInherited: boolean;
  passiveHorizonNotice: string | null;
  recurrenceNotice: string | null;
  redundantValueNotice: string | null;
  warnings: string[];
};

type PowerCostDebugSource = {
  debug: Record<string, unknown>;
};

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= SEMANTIC_EQUALITY_TOLERANCE;
}

function findPassiveEquivalentPotency(
  evaluation: PacketDeliveryEvaluation,
): number | null {
  if (evaluation.input.duration.kind !== "PASSIVE" || evaluation.input.potency <= 1) {
    return null;
  }

  for (let potency = 1; potency < evaluation.input.potency; potency += 1) {
    const candidate = evaluateAugmentDebuffPacket({
      ...evaluation.input,
      potency,
    });
    if (
      candidate.supported &&
      nearlyEqual(candidate.expectedActiveTurns, evaluation.expectedActiveTurns) &&
      nearlyEqual(candidate.deliveryUnits, evaluation.deliveryUnits)
    ) {
      return potency;
    }
  }

  return null;
}

function resolvePotencySaturationPoint(
  evaluation: PacketDeliveryEvaluation,
): number | null {
  if (
    evaluation.potencyCanNoLongerImproveFiniteDurationUptime &&
    evaluation.finiteDurationSaturationPoint !== null
  ) {
    return evaluation.finiteDurationSaturationPoint;
  }
  return findPassiveEquivalentPotency(evaluation);
}

export function formatSemanticApplicationProbability(probability: number): string {
  const percentage = probability * 100;
  if (probability < 1 && percentage >= 99.95) return ">99.9%";
  return `${percentage.toFixed(1)}%`;
}

export function formatSemanticExpectedActiveTurns(expectedActiveTurns: number): string {
  return expectedActiveTurns.toFixed(2);
}

export function createSemanticAuthoringFeedback(
  evaluation: PacketDeliveryEvaluation | null | undefined,
): SemanticAuthoringFeedback | null {
  if (!evaluation?.supported) return null;

  const linkedReliabilityInherited = !evaluation.usesIndependentDiceDistribution;
  const formattedApplicationProbability = formatSemanticApplicationProbability(
    evaluation.applicationProbability,
  );
  const formattedExpectedActiveTurns = formatSemanticExpectedActiveTurns(
    evaluation.expectedActiveTurns,
  );
  const isNearCertain =
    evaluation.applicationProbability >= NEAR_CERTAIN_APPLICATION_PROBABILITY;
  const potencySaturationPoint = resolvePotencySaturationPoint(evaluation);
  const potencySaturated = potencySaturationPoint !== null;
  const unpricedRemovalHardness = potencySaturationPoint !== null &&
    evaluation.appliedSuccessDistribution.some(
      (probability, successes) =>
        probability > 0 && successes * evaluation.input.potency > potencySaturationPoint,
    );
  const reliabilityReference: SemanticReliabilityReference = linkedReliabilityInherited
    ? "INHERITED_PRIMARY_APPLIED_SUCCESSES"
    : evaluation.input.family === "DEBUFF" && evaluation.resistDistribution !== null
      ? "STANDARD_D8_MATCHED_RESISTANCE"
      : "STANDARD_D8_REFERENCE";
  const reliabilityNotice = linkedReliabilityInherited
    ? "Uses the primary packet's applied-success result."
    : reliabilityReference === "STANDARD_D8_MATCHED_RESISTANCE"
      ? `Pricing reliability after matched resistance: ${formattedApplicationProbability}.`
      : `Pricing reliability: ${formattedApplicationProbability} using the standard D8 reference.`;
  const nearCertaintyNotice = !linkedReliabilityInherited && isNearCertain
    ? "Application is already near-certain. Additional Dice provide very little extra reliability."
    : null;
  const potencySaturationNotice = potencySaturated
    ? `Natural persistence is saturated at ${potencySaturationPoint} for this duration. Additional Potency does not extend the effect through ordinary stack degradation and does not increase current BPV, but extra stacks may still affect Resist or Cleanse difficulty.`
    : null;
  const unpricedRemovalHardnessNotice = unpricedRemovalHardness
    ? `${UNPRICED_REMOVAL_HARDNESS}: Natural persistence is saturated at ${potencySaturationPoint} for this duration. Excess stacks do not increase current BPV but may still increase Resist or Cleanse difficulty. This unpriced removal hardness is not certified as balanced by the calculator.`
    : null;
  const passiveHorizonNotice = evaluation.input.duration.kind === "PASSIVE"
    ? "Passive pricing is evaluated over four target turns. Runtime stacks still degrade normally."
    : null;
  const recurrenceNotice = evaluation.input.recurring
    ? "Recurring reapplication uses max-and-refresh; stacks do not add together on each recurrence."
    : null;
  const redundantValueNotice = potencySaturated || (!linkedReliabilityInherited && isNearCertain)
    ? "Values that do not improve priced reliability or natural persistence do not increase current BPV. Removal difficulty is not currently priced."
    : null;

  return {
    applicationProbability: evaluation.applicationProbability,
    formattedApplicationProbability,
    reliabilityReference,
    reliabilityNotice,
    isNearCertain,
    nearCertaintyNotice,
    expectedActiveTurns: evaluation.expectedActiveTurns,
    formattedExpectedActiveTurns,
    expectedActiveDurationNotice: `Expected active duration: ${formattedExpectedActiveTurns} target turns.`,
    potencySaturated,
    potencySaturationPoint,
    potencySaturationNotice,
    unpricedRemovalHardness,
    unpricedRemovalHardnessNotice,
    linkedReliabilityInherited,
    passiveHorizonNotice,
    recurrenceNotice,
    redundantValueNotice,
    warnings: [...new Set([
      ...evaluation.warnings,
      ...evaluation.saturationWarnings,
      ...(unpricedRemovalHardness ? [UNPRICED_REMOVAL_HARDNESS] : []),
    ])],
  };
}

export function getSemanticAuthoringFeedbackForPacket(
  breakdown: PowerCostDebugSource | null | undefined,
  packetId: string | null | undefined,
): SemanticAuthoringFeedback | null {
  if (!breakdown || !packetId) return null;
  const calibration = breakdown.debug.augmentDebuffCalibration as
    | { packetEvaluations?: PacketDeliveryEvaluation[] }
    | undefined;
  const evaluation = calibration?.packetEvaluations?.find(
    (candidate) => candidate.input.id === packetId,
  );
  return createSemanticAuthoringFeedback(evaluation);
}
