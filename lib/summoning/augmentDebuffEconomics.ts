import {
  AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT,
  type AugmentDebuffEconomicModifier,
} from "@/lib/config/powerTuningShared";

export const INCARNATE_DIE_SIDES = [4, 6, 8, 10, 12] as const;
export type IncarnateDieSides = (typeof INCARNATE_DIE_SIDES)[number];
export type AugmentDebuffFamily = "AUGMENT" | "DEBUFF";
export type ProbabilityMass = readonly number[];
export type AdditionalCleanupRate = 0 | 1 | 2;

export type EconomicDuration =
  | { kind: "TURNS"; turns: 1 | 2 | 3 | 4 }
  | { kind: "UNTIL_TARGET_NEXT_TURN" }
  | { kind: "PASSIVE" };

export type PacketDeliveryResolution =
  | { mode: "INDEPENDENT"; correlationId?: string | null }
  | {
      mode: "LINKED";
      dependencyId: string;
      inheritedAppliedSuccessDistribution?: ProbabilityMass | null;
    };

export type PacketGeometryInput = {
  kind?: "NONE" | "SPHERE" | "CONE" | "LINE" | "OTHER";
  radiusFeet?: number | null;
  coneLengthFeet?: number | null;
  lineWidthFeet?: number | null;
  lineLengthFeet?: number | null;
  accessPremium?: number | null;
};

export type PacketDeliveryInput = {
  id: string;
  family: AugmentDebuffFamily;
  attribute: string;
  targetBucket: string;
  diceCount: number;
  potency: number;
  modifier: AugmentDebuffEconomicModifier;
  duration: EconomicDuration;
  recurring: boolean;
  expectedTargetCount: number;
  resolution: PacketDeliveryResolution;
  sourceDieSides?: IncarnateDieSides;
  sourceRollModifier?: number;
  sourceSuccessDistribution?: ProbabilityMass | null;
  resistSuccessDistribution?: ProbabilityMass | null;
  additionalCleanupRate?: AdditionalCleanupRate;
  geometry?: PacketGeometryInput | null;
  retainedShellInputs?: Readonly<Record<string, unknown>> | null;
};

export type DistributionSummary = {
  probabilityBySuccessCount: number[];
  probabilityZero: number;
  probabilityAtLeastOne: number;
  expectedSuccesses: number;
};

export type ResistanceCancellationSummary = DistributionSummary & {
  probabilityFullResistance: number;
  expectedNetSuccesses: number;
};

export type SignedModifierSuccessDiagnostic = {
  dieSides: IncarnateDieSides;
  rollModifier: number;
  expectedSuccessesPerDie: number;
  deltaFromUnmodifiedPerDie: number;
};

export type UptimeEnumeration = {
  horizonTurns: number;
  activeProbabilityByTurn: number[];
  expectedActiveTurns: number;
  recurrenceUptime: number | null;
  maxAndRefresh: boolean;
  additiveRecurringStacks: false;
};

export type PacketDeliveryEvaluation = {
  input: PacketDeliveryInput;
  supported: boolean;
  warnings: string[];
  sourceDistribution: number[];
  resistDistribution: number[] | null;
  appliedSuccessDistribution: number[];
  applicationProbability: number;
  expectedSuccesses: number;
  expectedNetSuccesses: number;
  expectedInitialStacks: number;
  expectedActiveTurns: number;
  expectedActiveTargetTurns: number;
  activeProbabilityByTurn: number[];
  recurrenceUptime: number | null;
  severity: number;
  deliveryUnits: number;
  finiteDurationSaturationPoint: number | null;
  potencyCanNoLongerImproveFiniteDurationUptime: boolean;
  saturationWarnings: string[];
  deliveryResolution: "INDEPENDENT_SOURCE" | "INHERITED_TARGET_LOCAL_PRIMARY";
  usesIndependentDiceDistribution: boolean;
  correlationIdentity: string | null;
  breadth: {
    authority: "EXPLICIT";
    expectedTargetCount: number;
    geometrySemanticMultiplier: 1;
    geometry: PacketGeometryInput | null;
  };
  retainedShellInputs: Readonly<Record<string, unknown>> | null;
  retainedShellInputDescription: string;
  finalBpvConversionStatus: "UNAVAILABLE_UNCALIBRATED";
  calibration: {
    status: "UNCALIBRATED";
    deliveryUnitToBpvCoefficient: null;
    finalBpv: null;
  };
};

export type SignedModifierProbability = {
  modifier: number;
  probability: number;
};

export type AggregatedDeliveryGroup = {
  targetBucket: string;
  attribute: string;
  supported: boolean;
  diagnostics: string[];
  expectedTargetCount: number | null;
  deliveryUnits: number | null;
  rawModifierDistributionByTurn: SignedModifierProbability[][];
  cappedModifierDistributionByTurn: SignedModifierProbability[][];
  hiddenExcessProbabilityByTurn: number[];
  certainCappedModifierByTurn: Array<number | null>;
};

export type AggregatedPowerDelivery = {
  status: "SUPPORTED" | "UNSUPPORTED_CORRELATION";
  totalDeliveryUnits: number | null;
  groups: AggregatedDeliveryGroup[];
  diagnostics: string[];
  calibration: {
    status: "UNCALIBRATED";
    deliveryUnitToBpvCoefficient: null;
    finalBpv: null;
  };
};

export type AugmentDebuffBpvCalibrationMode = "APPROVED" | "UNCALIBRATED";

export type AugmentDebuffBpvConversionResult = {
  aggregateDeliveryUnits: number | null;
  linearDeliveryCharge: number | null;
  retainedShell: number;
  unaffectedCosts: number;
  unroundedFullBpv: number | null;
  roundedFinalBpv: number | null;
  coefficient: number | null;
  roundingStep: number | null;
  halfStepTiePolicy: "UPWARD" | null;
  calibrationStatus:
    | "APPROVED_CALIBRATED_NOT_PUBLIC"
    | "UNCALIBRATED"
    | "UNRESOLVED";
  warnings: string[];
  unresolvedDiagnostics: string[];
};

const EPSILON = 1e-12;
const REFERENCE_HORIZON_TURNS =
  AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.referenceHorizonTurns;
const REFERENCE_SOURCE_DIE = 8 satisfies IncarnateDieSides;

function assertNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

export function roundBpvToStepTiesUp(value: number, step: number): number {
  assertNonNegativeFinite("value", value);
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError("step must be a positive finite number.");
  }
  const rounded = Math.floor(value / step + 0.5 + EPSILON) * step;
  return Number(rounded.toFixed(12));
}

export function calculateAggregateModifierDeliveryCharge(
  aggregateDeliveryUnits: number,
  coefficient = AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.deliveryUnitToBpvCoefficient,
): {
  aggregateDeliveryUnits: number;
  coefficient: number;
  linearDeliveryCharge: number;
} {
  assertNonNegativeFinite("aggregateDeliveryUnits", aggregateDeliveryUnits);
  assertNonNegativeFinite("coefficient", coefficient);
  return {
    aggregateDeliveryUnits,
    coefficient,
    linearDeliveryCharge: coefficient * aggregateDeliveryUnits,
  };
}

export function convertAugmentDebuffPowerToBpv(params: {
  aggregateDeliveryUnits: number | null;
  retainedShell: number;
  unaffectedCosts: number;
  mode?: AugmentDebuffBpvCalibrationMode;
  warnings?: readonly string[];
  unresolvedDiagnostics?: readonly string[];
}): AugmentDebuffBpvConversionResult {
  assertNonNegativeFinite("retainedShell", params.retainedShell);
  assertNonNegativeFinite("unaffectedCosts", params.unaffectedCosts);
  const warnings = [...new Set(params.warnings ?? [])];
  const unresolvedDiagnostics = [...new Set(params.unresolvedDiagnostics ?? [])];
  const base = {
    aggregateDeliveryUnits: params.aggregateDeliveryUnits,
    retainedShell: params.retainedShell,
    unaffectedCosts: params.unaffectedCosts,
    warnings,
    unresolvedDiagnostics,
  };

  if (unresolvedDiagnostics.length > 0 || params.aggregateDeliveryUnits === null) {
    return {
      ...base,
      linearDeliveryCharge: null,
      unroundedFullBpv: null,
      roundedFinalBpv: null,
      coefficient: null,
      roundingStep: null,
      halfStepTiePolicy: null,
      calibrationStatus: "UNRESOLVED",
    };
  }

  assertNonNegativeFinite("aggregateDeliveryUnits", params.aggregateDeliveryUnits);
  if ((params.mode ?? "APPROVED") === "UNCALIBRATED") {
    return {
      ...base,
      linearDeliveryCharge: null,
      unroundedFullBpv: null,
      roundedFinalBpv: null,
      coefficient: null,
      roundingStep: null,
      halfStepTiePolicy: null,
      calibrationStatus: "UNCALIBRATED",
    };
  }

  const coefficient = AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.deliveryUnitToBpvCoefficient;
  const roundingStep = AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.finalBpvRoundingStep;
  const charge = calculateAggregateModifierDeliveryCharge(
    params.aggregateDeliveryUnits,
    coefficient,
  );
  const unroundedFullBpv =
    params.retainedShell + params.unaffectedCosts + charge.linearDeliveryCharge;
  return {
    ...base,
    linearDeliveryCharge: charge.linearDeliveryCharge,
    unroundedFullBpv,
    roundedFinalBpv: roundBpvToStepTiesUp(unroundedFullBpv, roundingStep),
    coefficient,
    roundingStep,
    halfStepTiePolicy: AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.halfStepTiePolicy,
    calibrationStatus: "APPROVED_CALIBRATED_NOT_PUBLIC",
    warnings: [...new Set(warnings)],
  };
}

export const APPROVED_AUGMENT_MODIFIER_SEVERITY =
  AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.modifierSeverity.augment;
export const APPROVED_DEBUFF_MODIFIER_SEVERITY =
  AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.modifierSeverity.debuff;

function assertIntegerInRange(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
}

function assertDieSides(dieSides: number): asserts dieSides is IncarnateDieSides {
  if (!(INCARNATE_DIE_SIDES as readonly number[]).includes(dieSides)) {
    throw new RangeError(`dieSides must be one of ${INCARNATE_DIE_SIDES.join(", ")}.`);
  }
}

export function normalizeProbabilityMass(input: ProbabilityMass): number[] {
  if (input.length === 0) throw new RangeError("Probability mass must not be empty.");
  const values = Array.from(input, (value) => {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError("Probability mass entries must be finite and non-negative.");
    }
    return value;
  });
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) throw new RangeError("Probability mass must contain positive probability.");
  return values.map((value) => value / total);
}

export function successCountForEconomicFace(face: number, rollModifier = 0): 0 | 1 | 2 {
  if (!Number.isInteger(face) || face < 1) throw new RangeError("face must be a positive integer.");
  assertIntegerInRange("rollModifier", rollModifier, -5, 5);
  if (face === 1) return 0;
  const modifiedResult = face + rollModifier;
  if (modifiedResult < 4) return 0;
  if (modifiedResult < 10) return 1;
  return 2;
}

export function convolveSuccessDistributions(
  leftInput: ProbabilityMass,
  rightInput: ProbabilityMass,
): number[] {
  const left = normalizeProbabilityMass(leftInput);
  const right = normalizeProbabilityMass(rightInput);
  const output = Array.from({ length: left.length + right.length - 1 }, () => 0);
  for (let leftSuccesses = 0; leftSuccesses < left.length; leftSuccesses += 1) {
    for (let rightSuccesses = 0; rightSuccesses < right.length; rightSuccesses += 1) {
      output[leftSuccesses + rightSuccesses] +=
        left[leftSuccesses] * right[rightSuccesses];
    }
  }
  return output;
}

export function createSuccessDistribution(params: {
  dieSides: IncarnateDieSides;
  diceCount: number;
  rollModifier?: number;
}): number[] {
  assertDieSides(params.dieSides);
  assertIntegerInRange("diceCount", params.diceCount, 1, 20);
  const rollModifier = params.rollModifier ?? 0;
  assertIntegerInRange("rollModifier", rollModifier, -5, 5);
  const oneDie = [0, 0, 0];
  for (let face = 1; face <= params.dieSides; face += 1) {
    oneDie[successCountForEconomicFace(face, rollModifier)] += 1 / params.dieSides;
  }
  let distribution = [1];
  for (let die = 0; die < params.diceCount; die += 1) {
    distribution = convolveSuccessDistributions(distribution, oneDie);
  }
  return distribution;
}

export function summarizeSuccessDistribution(input: ProbabilityMass): DistributionSummary {
  const probabilityBySuccessCount = normalizeProbabilityMass(input);
  const probabilityZero = probabilityBySuccessCount[0] ?? 0;
  return {
    probabilityBySuccessCount,
    probabilityZero,
    probabilityAtLeastOne: 1 - probabilityZero,
    expectedSuccesses: probabilityBySuccessCount.reduce(
      (sum, probability, successes) => sum + probability * successes,
      0,
    ),
  };
}

export function cancelSuccessDistributions(
  sourceInput: ProbabilityMass,
  resistInput: ProbabilityMass,
): number[] {
  const source = normalizeProbabilityMass(sourceInput);
  const resist = normalizeProbabilityMass(resistInput);
  const output = Array.from({ length: source.length }, () => 0);
  for (let sourceSuccesses = 0; sourceSuccesses < source.length; sourceSuccesses += 1) {
    for (let resistSuccesses = 0; resistSuccesses < resist.length; resistSuccesses += 1) {
      output[Math.max(0, sourceSuccesses - resistSuccesses)] +=
        source[sourceSuccesses] * resist[resistSuccesses];
    }
  }
  return normalizeProbabilityMass(output);
}

export function summarizeResistanceCancellation(
  sourceInput: ProbabilityMass,
  resistInput: ProbabilityMass,
): ResistanceCancellationSummary {
  const summary = summarizeSuccessDistribution(
    cancelSuccessDistributions(sourceInput, resistInput),
  );
  return {
    ...summary,
    probabilityFullResistance: summary.probabilityZero,
    expectedNetSuccesses: summary.expectedSuccesses,
  };
}

export function createReferenceSourceDistribution(diceCount: number): number[] {
  return createSuccessDistribution({ dieSides: REFERENCE_SOURCE_DIE, diceCount });
}

export function createMatchedReferenceResistDistribution(): number[] {
  return createSuccessDistribution({
    dieSides: REFERENCE_SOURCE_DIE,
    diceCount: AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.referenceResist.diceCount,
  });
}

export function getModifierSeverity(
  family: AugmentDebuffFamily,
  modifier: AugmentDebuffEconomicModifier,
): number {
  assertIntegerInRange("modifier", modifier, 1, 5);
  return family === "AUGMENT"
    ? AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.modifierSeverity.augment[modifier]
    : AUGMENT_DEBUFF_ECONOMICS_PHASE2A_DRAFT.modifierSeverity.debuff[modifier];
}

export function getModifierSuccessDeltaDiagnostic(params: {
  family: AugmentDebuffFamily;
  modifier: AugmentDebuffEconomicModifier;
  dieSides?: IncarnateDieSides;
}): {
  dieSides: IncarnateDieSides;
  signedRollModifier: number;
  baseExpectedSuccessesPerDie: number;
  modifiedExpectedSuccessesPerDie: number;
  absoluteDeltaPerDie: number;
  d8NormalizedSeverity: number;
  approvedPricingSeverity: number;
} {
  const dieSides = params.dieSides ?? REFERENCE_SOURCE_DIE;
  const signedRollModifier = params.family === "AUGMENT" ? params.modifier : -params.modifier;
  const base = summarizeSuccessDistribution(
    createSuccessDistribution({ dieSides, diceCount: 1 }),
  ).expectedSuccesses;
  const modified = summarizeSuccessDistribution(
    createSuccessDistribution({ dieSides, diceCount: 1, rollModifier: signedRollModifier }),
  ).expectedSuccesses;
  const absoluteDeltaPerDie = Math.abs(modified - base);
  return {
    dieSides,
    signedRollModifier,
    baseExpectedSuccessesPerDie: base,
    modifiedExpectedSuccessesPerDie: modified,
    absoluteDeltaPerDie,
    d8NormalizedSeverity: Math.round(absoluteDeltaPerDie / 0.125),
    approvedPricingSeverity: getModifierSeverity(params.family, params.modifier),
  };
}

export function getSignedModifierSuccessDiagnostics(
  dieSides: IncarnateDieSides = REFERENCE_SOURCE_DIE,
): SignedModifierSuccessDiagnostic[] {
  assertDieSides(dieSides);
  const baseExpectedSuccessesPerDie = summarizeSuccessDistribution(
    createSuccessDistribution({ dieSides, diceCount: 1 }),
  ).expectedSuccesses;
  return Array.from({ length: 11 }, (_, index) => index - 5).map((rollModifier) => {
    const expectedSuccessesPerDie = summarizeSuccessDistribution(
      createSuccessDistribution({ dieSides, diceCount: 1, rollModifier }),
    ).expectedSuccesses;
    return {
      dieSides,
      rollModifier,
      expectedSuccessesPerDie,
      deltaFromUnmodifiedPerDie: expectedSuccessesPerDie - baseExpectedSuccessesPerDie,
    };
  });
}

function durationLimit(duration: EconomicDuration): number {
  if (duration.kind === "TURNS") return duration.turns;
  if (duration.kind === "UNTIL_TARGET_NEXT_TURN") return 1;
  return REFERENCE_HORIZON_TURNS;
}

function durationIsPassive(duration: EconomicDuration): boolean {
  return duration.kind === "PASSIVE";
}

type UptimeState = { stacks: number; remainingDuration: number; probability: number };

function stateKey(stacks: number, remainingDuration: number): string {
  return `${stacks}:${remainingDuration}`;
}

function addState(
  states: Map<string, UptimeState>,
  stacks: number,
  remainingDuration: number,
  probability: number,
): void {
  if (probability <= 0) return;
  const key = stateKey(stacks, remainingDuration);
  const existing = states.get(key);
  if (existing) {
    existing.probability += probability;
  } else {
    states.set(key, { stacks, remainingDuration, probability });
  }
}

function enumerateUptimeCore(params: {
  appliedSuccessDistribution: ProbabilityMass;
  potency: number;
  duration: EconomicDuration;
  recurring: boolean;
  additionalCleanupRate: AdditionalCleanupRate;
}): UptimeEnumeration {
  const distribution = normalizeProbabilityMass(params.appliedSuccessDistribution);
  const passive = durationIsPassive(params.duration);
  const authoredDuration = durationLimit(params.duration);
  const horizonTurns = params.recurring || passive ? REFERENCE_HORIZON_TURNS : authoredDuration;
  const cleanupPerTurn = 1 + params.additionalCleanupRate;
  let states = new Map<string, UptimeState>();
  addState(states, 0, 0, 1);
  const activeProbabilityByTurn: number[] = [];

  for (let turn = 0; turn < horizonTurns; turn += 1) {
    const afterTurn = new Map<string, UptimeState>();
    let activeProbability = 0;
    const attemptDistribution = turn === 0 || params.recurring ? distribution : [1];

    for (const state of states.values()) {
      for (
        let appliedSuccesses = 0;
        appliedSuccesses < attemptDistribution.length;
        appliedSuccesses += 1
      ) {
        const branchProbability =
          state.probability * (attemptDistribution[appliedSuccesses] ?? 0);
        if (branchProbability <= 0) continue;

        let stacks = state.stacks;
        let remainingDuration = state.remainingDuration;
        if (appliedSuccesses > 0) {
          stacks = Math.max(stacks, appliedSuccesses * params.potency);
          remainingDuration = passive ? REFERENCE_HORIZON_TURNS : authoredDuration;
        }

        const active = stacks > 0 && (passive || remainingDuration > 0);
        if (active) activeProbability += branchProbability;

        if (active) {
          stacks = Math.max(0, stacks - cleanupPerTurn);
          if (!passive) remainingDuration = Math.max(0, remainingDuration - 1);
        }
        if (stacks === 0 || (!passive && remainingDuration === 0)) {
          stacks = 0;
          remainingDuration = 0;
        }
        addState(afterTurn, stacks, remainingDuration, branchProbability);
      }
    }

    activeProbabilityByTurn.push(activeProbability);
    states = afterTurn;
  }

  const expectedActiveTurns = activeProbabilityByTurn.reduce((sum, value) => sum + value, 0);
  return {
    horizonTurns,
    activeProbabilityByTurn,
    expectedActiveTurns,
    recurrenceUptime: params.recurring ? expectedActiveTurns : null,
    maxAndRefresh: params.recurring,
    additiveRecurringStacks: false,
  };
}

export function enumerateStackUptime(params: {
  appliedSuccessDistribution: ProbabilityMass;
  potency: number;
  duration: EconomicDuration;
  recurring?: boolean;
  additionalCleanupRate?: AdditionalCleanupRate;
}): UptimeEnumeration {
  assertIntegerInRange("potency", params.potency, 1, 20);
  const additionalCleanupRate = params.additionalCleanupRate ?? 0;
  assertIntegerInRange("additionalCleanupRate", additionalCleanupRate, 0, 2);
  return enumerateUptimeCore({
    appliedSuccessDistribution: params.appliedSuccessDistribution,
    potency: params.potency,
    duration: params.duration,
    recurring: params.recurring ?? false,
    additionalCleanupRate,
  });
}

function finiteDurationSaturation(params: {
  appliedSuccessDistribution: ProbabilityMass;
  duration: EconomicDuration;
  recurring: boolean;
  additionalCleanupRate: AdditionalCleanupRate;
  currentPotency: number;
}): { point: number | null; currentIsSaturated: boolean } {
  if (params.duration.kind === "PASSIVE") return { point: null, currentIsSaturated: false };
  const atTwenty = enumerateUptimeCore({
    appliedSuccessDistribution: params.appliedSuccessDistribution,
    potency: 20,
    duration: params.duration,
    recurring: params.recurring,
    additionalCleanupRate: params.additionalCleanupRate,
  }).expectedActiveTurns;
  let point = 20;
  for (let potency = 1; potency <= 20; potency += 1) {
    const value = enumerateUptimeCore({
      appliedSuccessDistribution: params.appliedSuccessDistribution,
      potency,
      duration: params.duration,
      recurring: params.recurring,
      additionalCleanupRate: params.additionalCleanupRate,
    }).expectedActiveTurns;
    if (Math.abs(value - atTwenty) <= EPSILON) {
      point = potency;
      break;
    }
  }
  const current = enumerateUptimeCore({
    appliedSuccessDistribution: params.appliedSuccessDistribution,
    potency: params.currentPotency,
    duration: params.duration,
    recurring: params.recurring,
    additionalCleanupRate: params.additionalCleanupRate,
  }).expectedActiveTurns;
  return {
    point,
    currentIsSaturated:
      params.currentPotency >= point && Math.abs(current - atTwenty) <= EPSILON,
  };
}

function packetAppliedDistribution(input: PacketDeliveryInput): {
  source: number[];
  resist: number[] | null;
  applied: number[];
  supported: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (input.resolution.mode === "LINKED") {
    const inherited = input.resolution.inheritedAppliedSuccessDistribution;
    if (!input.resolution.dependencyId.trim()) {
      warnings.push("LINKED_DEPENDENCY_ID_REQUIRED");
    }
    if (!inherited) {
      warnings.push("LINKED_DEPENDENCY_DISTRIBUTION_REQUIRED");
      return { source: [1], resist: null, applied: [1], supported: false, warnings };
    }
    if (input.resistSuccessDistribution) {
      warnings.push("LINKED_RESIST_IGNORED_ALREADY_RESOLVED");
    }
    const applied = normalizeProbabilityMass(inherited);
    return { source: applied, resist: null, applied, supported: warnings.length === 0, warnings };
  }

  assertIntegerInRange("diceCount", input.diceCount, 1, 20);
  const dieSides = input.sourceDieSides ?? REFERENCE_SOURCE_DIE;
  const source = input.sourceSuccessDistribution
    ? normalizeProbabilityMass(input.sourceSuccessDistribution)
    : createSuccessDistribution({
        dieSides,
        diceCount: input.diceCount,
        rollModifier: input.sourceRollModifier ?? 0,
      });

  if (input.family === "AUGMENT") {
    if (input.resistSuccessDistribution) warnings.push("AUGMENT_RESIST_DISTRIBUTION_IGNORED");
    return { source, resist: null, applied: source, supported: true, warnings };
  }

  const resist = input.resistSuccessDistribution
    ? normalizeProbabilityMass(input.resistSuccessDistribution)
    : createMatchedReferenceResistDistribution();
  return {
    source,
    resist,
    applied: cancelSuccessDistributions(source, resist),
    supported: true,
    warnings,
  };
}

export function evaluateAugmentDebuffPacket(input: PacketDeliveryInput): PacketDeliveryEvaluation {
  assertIntegerInRange("potency", input.potency, 1, 20);
  assertIntegerInRange("modifier", input.modifier, 1, 5);
  if (!Number.isFinite(input.expectedTargetCount) || input.expectedTargetCount <= 0) {
    throw new RangeError("expectedTargetCount must be a positive finite number.");
  }
  const additionalCleanupRate = input.additionalCleanupRate ?? 0;
  assertIntegerInRange("additionalCleanupRate", additionalCleanupRate, 0, 2);
  const distributions = packetAppliedDistribution(input);
  const sourceSummary = summarizeSuccessDistribution(distributions.source);
  const appliedSummary = summarizeSuccessDistribution(distributions.applied);
  const expectedInitialStacks = appliedSummary.expectedSuccesses * input.potency;
  const uptime = enumerateUptimeCore({
    appliedSuccessDistribution: distributions.applied,
    potency: input.potency,
    duration: input.duration,
    recurring: input.recurring,
    additionalCleanupRate,
  });
  const expectedActiveTargetTurns = uptime.expectedActiveTurns * input.expectedTargetCount;
  const severity = getModifierSeverity(input.family, input.modifier);
  const saturation = finiteDurationSaturation({
    appliedSuccessDistribution: distributions.applied,
    duration: input.duration,
    recurring: input.recurring,
    additionalCleanupRate,
    currentPotency: input.potency,
  });
  const saturationWarnings: string[] = [];
  if (saturation.currentIsSaturated) saturationWarnings.push("FINITE_DURATION_POTENCY_SATURATED");
  if (input.duration.kind === "PASSIVE") saturationWarnings.push("PASSIVE_VALUE_BOUNDED_BY_FOUR_TURN_HORIZON");
  if (input.recurring) saturationWarnings.push("RECURRENCE_USES_MAX_AND_REFRESH_NOT_ADDITION");

  return {
    input,
    supported: distributions.supported,
    warnings: distributions.warnings,
    sourceDistribution: distributions.source,
    resistDistribution: distributions.resist,
    appliedSuccessDistribution: distributions.applied,
    applicationProbability: appliedSummary.probabilityAtLeastOne,
    expectedSuccesses: sourceSummary.expectedSuccesses,
    expectedNetSuccesses: appliedSummary.expectedSuccesses,
    expectedInitialStacks,
    expectedActiveTurns: uptime.expectedActiveTurns,
    expectedActiveTargetTurns,
    activeProbabilityByTurn: uptime.activeProbabilityByTurn,
    recurrenceUptime: uptime.recurrenceUptime,
    severity,
    deliveryUnits: distributions.supported ? severity * expectedActiveTargetTurns : 0,
    finiteDurationSaturationPoint: saturation.point,
    potencyCanNoLongerImproveFiniteDurationUptime: saturation.currentIsSaturated,
    saturationWarnings,
    deliveryResolution:
      input.resolution.mode === "LINKED"
        ? "INHERITED_TARGET_LOCAL_PRIMARY"
        : "INDEPENDENT_SOURCE",
    usesIndependentDiceDistribution: input.resolution.mode === "INDEPENDENT",
    correlationIdentity:
      input.resolution.mode === "LINKED"
        ? input.resolution.dependencyId
        : input.resolution.correlationId ?? null,
    breadth: {
      authority: "EXPLICIT",
      expectedTargetCount: input.expectedTargetCount,
      geometrySemanticMultiplier: 1,
      geometry: input.geometry ?? null,
    },
    retainedShellInputs: input.retainedShellInputs ?? null,
    retainedShellInputDescription:
      "Diagnostic shell inputs are retained verbatim; geometry does not multiply semantic target occupancy.",
    finalBpvConversionStatus: "UNAVAILABLE_UNCALIBRATED",
    calibration: {
      status: "UNCALIBRATED",
      deliveryUnitToBpvCoefficient: null,
      finalBpv: null,
    },
  };
}

function modifierSign(family: AugmentDebuffFamily): 1 | -1 {
  return family === "AUGMENT" ? 1 : -1;
}

function deterministicPacketActive(
  packet: PacketDeliveryEvaluation,
  appliedSuccesses: number,
  turn: number,
): boolean {
  if (appliedSuccesses <= 0) return false;
  const limit = durationLimit(packet.input.duration);
  if (turn >= limit) return false;
  const cleanupPerTurn = 1 + (packet.input.additionalCleanupRate ?? 0);
  return appliedSuccesses * packet.input.potency - turn * cleanupPerTurn > 0;
}

function addSignedProbability(
  distribution: Map<number, number>,
  modifier: number,
  probability: number,
): void {
  distribution.set(modifier, (distribution.get(modifier) ?? 0) + probability);
}

function convolveSignedDistributions(
  left: Map<number, number>,
  right: Map<number, number>,
): Map<number, number> {
  const output = new Map<number, number>();
  for (const [leftModifier, leftProbability] of left) {
    for (const [rightModifier, rightProbability] of right) {
      addSignedProbability(
        output,
        leftModifier + rightModifier,
        leftProbability * rightProbability,
      );
    }
  }
  return output;
}

function serializeSignedDistribution(distribution: Map<number, number>): SignedModifierProbability[] {
  return [...distribution.entries()]
    .filter(([, probability]) => probability > EPSILON)
    .sort(([left], [right]) => left - right)
    .map(([modifier, probability]) => ({ modifier, probability }));
}

function probabilityMassMatches(left: ProbabilityMass, right: ProbabilityMass): boolean {
  const normalizedLeft = normalizeProbabilityMass(left);
  const normalizedRight = normalizeProbabilityMass(right);
  const length = Math.max(normalizedLeft.length, normalizedRight.length);
  for (let index = 0; index < length; index += 1) {
    if (Math.abs((normalizedLeft[index] ?? 0) - (normalizedRight[index] ?? 0)) > EPSILON) {
      return false;
    }
  }
  return true;
}

function buildCorrelationSubgroupDistribution(
  packets: PacketDeliveryEvaluation[],
  turn: number,
  diagnostics: string[],
): Map<number, number> | null {
  if (packets.length === 1) {
    const packet = packets[0];
    const activeProbability = packet.activeProbabilityByTurn[turn] ?? 0;
    const signedModifier = modifierSign(packet.input.family) * packet.input.modifier;
    const distribution = new Map<number, number>();
    addSignedProbability(distribution, 0, 1 - activeProbability);
    addSignedProbability(distribution, signedModifier, activeProbability);
    return distribution;
  }

  if (packets.some((packet) => packet.input.recurring)) {
    diagnostics.push("UNSUPPORTED_CORRELATION: shared recurring dependency requires joint sequence enumeration");
    return null;
  }
  const reference = packets[0].appliedSuccessDistribution;
  if (packets.some((packet) => !probabilityMassMatches(reference, packet.appliedSuccessDistribution))) {
    diagnostics.push("UNSUPPORTED_CORRELATION: shared dependency distributions differ");
    return null;
  }

  const distribution = new Map<number, number>();
  reference.forEach((probability, appliedSuccesses) => {
    let signedModifier = 0;
    for (const packet of packets) {
      if (deterministicPacketActive(packet, appliedSuccesses, turn)) {
        signedModifier += modifierSign(packet.input.family) * packet.input.modifier;
      }
    }
    addSignedProbability(distribution, signedModifier, probability);
  });
  return distribution;
}

function aggregateDeliveryGroup(
  targetBucket: string,
  attribute: string,
  packets: PacketDeliveryEvaluation[],
  allPacketsById: ReadonlyMap<string, PacketDeliveryEvaluation>,
  knownExternalDependencyIds: ReadonlySet<string>,
): AggregatedDeliveryGroup {
  const diagnostics: string[] = [];
  if (packets.some((packet) => !packet.supported)) {
    diagnostics.push("UNSUPPORTED_CORRELATION: one or more packet evaluations are unsupported");
  }
  const expectedTargetCount = packets[0]?.input.expectedTargetCount ?? null;
  if (
    expectedTargetCount === null ||
    packets.some(
      (packet) => Math.abs(packet.input.expectedTargetCount - expectedTargetCount) > EPSILON,
    )
  ) {
    diagnostics.push("UNSUPPORTED_CORRELATION: same-bucket packets have different expected target overlap");
  }

  const linkedDependencyIds = new Set(
    packets
      .filter((packet) => packet.input.resolution.mode === "LINKED")
      .map((packet) =>
        packet.input.resolution.mode === "LINKED" ? packet.input.resolution.dependencyId : "",
      ),
  );
  for (const packet of packets) {
    if (packet.input.resolution.mode !== "LINKED") continue;
    const parent = allPacketsById.get(packet.input.resolution.dependencyId);
    if (!parent && !knownExternalDependencyIds.has(packet.input.resolution.dependencyId)) {
      diagnostics.push(
        `UNSUPPORTED_CORRELATION: linked dependency ${packet.input.resolution.dependencyId} is missing from the power aggregate`,
      );
      continue;
    }
    if (!parent) continue;
    if (parent.input.resolution.mode === "LINKED") {
      diagnostics.push("UNSUPPORTED_CORRELATION: chained linked dependencies are not supported");
    }
    if (!probabilityMassMatches(parent.appliedSuccessDistribution, packet.appliedSuccessDistribution)) {
      diagnostics.push(
        `UNSUPPORTED_CORRELATION: linked dependency ${packet.input.resolution.dependencyId} distribution is incompatible`,
      );
    }
  }

  const horizon = Math.max(...packets.map((packet) => packet.activeProbabilityByTurn.length), 0);
  const subgroupMap = new Map<string, PacketDeliveryEvaluation[]>();
  packets.forEach((packet, index) => {
    const dependencyIdentity =
      packet.input.resolution.mode === "LINKED"
        ? packet.input.resolution.dependencyId
        : linkedDependencyIds.has(packet.input.id)
          ? packet.input.id
          : packet.correlationIdentity;
    const correlationKey = dependencyIdentity
      ? `correlated:${dependencyIdentity}`
      : `independent:${index}`;
    const subgroup = subgroupMap.get(correlationKey) ?? [];
    subgroup.push(packet);
    subgroupMap.set(correlationKey, subgroup);
  });

  const rawModifierDistributionByTurn: SignedModifierProbability[][] = [];
  const cappedModifierDistributionByTurn: SignedModifierProbability[][] = [];
  const hiddenExcessProbabilityByTurn: number[] = [];
  const certainCappedModifierByTurn: Array<number | null> = [];
  let deliveryUnits = 0;

  for (let turn = 0; turn < horizon; turn += 1) {
    let combined = new Map<number, number>([[0, 1]]);
    for (const subgroup of subgroupMap.values()) {
      const subgroupDistribution = buildCorrelationSubgroupDistribution(
        subgroup,
        turn,
        diagnostics,
      );
      if (!subgroupDistribution) continue;
      combined = convolveSignedDistributions(combined, subgroupDistribution);
    }
    rawModifierDistributionByTurn.push(serializeSignedDistribution(combined));

    const capped = new Map<number, number>();
    let hiddenExcessProbability = 0;
    let expectedSeverity = 0;
    for (const [rawModifier, probability] of combined) {
      const cappedModifier = Math.max(-5, Math.min(5, rawModifier));
      addSignedProbability(capped, cappedModifier, probability);
      if (Math.abs(rawModifier) > 5) hiddenExcessProbability += probability;
      if (cappedModifier > 0) {
        expectedSeverity +=
          probability *
          getModifierSeverity("AUGMENT", cappedModifier as AugmentDebuffEconomicModifier);
      } else if (cappedModifier < 0) {
        expectedSeverity +=
          probability *
          getModifierSeverity(
            "DEBUFF",
            Math.abs(cappedModifier) as AugmentDebuffEconomicModifier,
          );
      }
    }
    const serializedCapped = serializeSignedDistribution(capped);
    cappedModifierDistributionByTurn.push(serializedCapped);
    hiddenExcessProbabilityByTurn.push(hiddenExcessProbability);
    certainCappedModifierByTurn.push(
      serializedCapped.length === 1 && Math.abs(serializedCapped[0].probability - 1) <= EPSILON
        ? serializedCapped[0].modifier
        : null,
    );
    if (expectedTargetCount !== null) deliveryUnits += expectedSeverity * expectedTargetCount;
  }

  const supported = diagnostics.length === 0;
  return {
    targetBucket,
    attribute,
    supported,
    diagnostics: [...new Set(diagnostics)],
    expectedTargetCount,
    deliveryUnits: supported ? deliveryUnits : null,
    rawModifierDistributionByTurn,
    cappedModifierDistributionByTurn,
    hiddenExcessProbabilityByTurn,
    certainCappedModifierByTurn,
  };
}

export function aggregateAugmentDebuffPowerDelivery(
  packets: readonly PacketDeliveryEvaluation[],
  knownExternalDependencyIds: ReadonlySet<string> = new Set(),
): AggregatedPowerDelivery {
  const allPacketsById = new Map(packets.map((packet) => [packet.input.id, packet]));
  const grouped = new Map<string, PacketDeliveryEvaluation[]>();
  for (const packet of packets) {
    const key = `${packet.input.targetBucket}\u0000${packet.input.attribute}`;
    const group = grouped.get(key) ?? [];
    group.push(packet);
    grouped.set(key, group);
  }
  const groups = [...grouped.values()].map((group) =>
    aggregateDeliveryGroup(
      group[0].input.targetBucket,
      group[0].input.attribute,
      group,
      allPacketsById,
      knownExternalDependencyIds,
    ),
  );
  const diagnostics = groups.flatMap((group) => group.diagnostics);
  const supported = groups.every((group) => group.supported);
  return {
    status: supported ? "SUPPORTED" : "UNSUPPORTED_CORRELATION",
    totalDeliveryUnits: supported
      ? groups.reduce((sum, group) => sum + (group.deliveryUnits ?? 0), 0)
      : null,
    groups,
    diagnostics: [...new Set(diagnostics)],
    calibration: {
      status: "UNCALIBRATED",
      deliveryUnitToBpvCoefficient: null,
      finalBpv: null,
    },
  };
}
