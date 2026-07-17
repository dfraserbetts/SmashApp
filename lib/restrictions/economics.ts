import {
  consumerSupportsNumericRestrictionCredit,
  type RestrictionConsumer,
  type RestrictionTier,
} from "@/lib/restrictions/governance";

export const APPROVED_ORDINARY_RESTRICTION_TIER_RATES = {
  MATERIAL_LIMITATION: 0.1,
  SUBSTANTIAL_LIMITATION: 0.2,
  NARROW_AVAILABILITY: 0.3,
} as const satisfies Readonly<
  Record<Exclude<RestrictionTier, "OATH_LIMITATION">, number>
>;

export const APPROVED_PLAYER_POWER_DRAWBACK_ECONOMIC_RULES = {
  standardCombinedCap: 0.5,
  minimumNetBpv: 1,
  roundingStep: 0.5,
  roundingDirection: "UP",
} as const;

export type PlayerPowerDrawbackTuningCandidate = {
  tuningSetId?: unknown;
  tuningVersion?: unknown;
  updatedAt?: unknown;
  restrictionTierRates?: Partial<Record<RestrictionTier, unknown>>;
  standardCombinedCap?: unknown;
  exceptionalCombinedCap?: unknown;
  minimumNetBpv?: unknown;
  roundingStep?: unknown;
  roundingDirection?: unknown;
};

export type PlayerPowerDrawbackTuningSnapshot = Readonly<{
  tuningSetId: string;
  tuningVersion: string;
  updatedAt: string;
  restrictionTierRates: Readonly<Record<RestrictionTier, number>>;
  standardCombinedCap: number;
  exceptionalCombinedCap: number;
  minimumNetBpv: number;
  roundingStep: number;
  roundingDirection: "UP";
}>;

export type PlayerPowerDrawbackTuningIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type PlayerPowerDrawbackTuningValidation =
  | Readonly<{
      ok: true;
      value: PlayerPowerDrawbackTuningSnapshot;
      issues: readonly [];
    }>
  | Readonly<{
      ok: false;
      value: null;
      issues: readonly PlayerPowerDrawbackTuningIssue[];
    }>;

function tuningIssue(
  code: string,
  path: string,
  message: string,
): PlayerPowerDrawbackTuningIssue {
  return Object.freeze({ code, path, message });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readNonBlankString(
  value: unknown,
  path: string,
  issues: PlayerPowerDrawbackTuningIssue[],
): string | null {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(tuningIssue("MISSING_TUNING_PROVENANCE", path, `${path} is required.`));
    return null;
  }
  return value.trim();
}

export function validateCompletePlayerPowerDrawbackTuning(
  candidate: PlayerPowerDrawbackTuningCandidate,
): PlayerPowerDrawbackTuningValidation {
  const issues: PlayerPowerDrawbackTuningIssue[] = [];
  const tuningSetId = readNonBlankString(candidate.tuningSetId, "tuningSetId", issues);
  const tuningVersion = readNonBlankString(candidate.tuningVersion, "tuningVersion", issues);
  const updatedAt = readNonBlankString(candidate.updatedAt, "updatedAt", issues);
  if (updatedAt !== null && !Number.isFinite(Date.parse(updatedAt))) {
    issues.push(tuningIssue(
      "INVALID_TUNING_TIMESTAMP",
      "updatedAt",
      "updatedAt must be a valid timestamp.",
    ));
  }

  const rates = {} as Record<RestrictionTier, number>;
  for (const tier of [
    "MATERIAL_LIMITATION",
    "SUBSTANTIAL_LIMITATION",
    "NARROW_AVAILABILITY",
    "OATH_LIMITATION",
  ] as const) {
    const value = candidate.restrictionTierRates?.[tier];
    if (!isFiniteNumber(value)) {
      issues.push(tuningIssue(
        tier === "OATH_LIMITATION" ? "MISSING_OATH_RATE" : "MISSING_TIER_RATE",
        `restrictionTierRates.${tier}`,
        `${tier} requires a finite rate.`,
      ));
      continue;
    }
    if (value < 0 || value > 1) {
      issues.push(tuningIssue(
        "INVALID_TIER_RATE",
        `restrictionTierRates.${tier}`,
        `${tier} rate must be between 0 and 1.`,
      ));
      continue;
    }
    rates[tier] = value;
  }

  const standardCombinedCap = candidate.standardCombinedCap;
  if (!isFiniteNumber(standardCombinedCap) || standardCombinedCap <= 0 || standardCombinedCap > 1) {
    issues.push(tuningIssue(
      "INVALID_STANDARD_COMBINED_CAP",
      "standardCombinedCap",
      "standardCombinedCap must be finite, greater than 0, and no greater than 1.",
    ));
  }

  const exceptionalCombinedCap = candidate.exceptionalCombinedCap;
  if (!isFiniteNumber(exceptionalCombinedCap)) {
    issues.push(tuningIssue(
      "MISSING_EXCEPTIONAL_COMBINED_CAP",
      "exceptionalCombinedCap",
      "A finite exceptionalCombinedCap is required for complete tuning.",
    ));
  } else if (
    exceptionalCombinedCap <= 0 ||
    exceptionalCombinedCap > 1 ||
    (
      isFiniteNumber(standardCombinedCap) &&
      exceptionalCombinedCap <= standardCombinedCap
    )
  ) {
    issues.push(tuningIssue(
      "INVALID_EXCEPTIONAL_COMBINED_CAP",
      "exceptionalCombinedCap",
      "exceptionalCombinedCap must be greater than the standard cap and no greater than 1.",
    ));
  }

  const minimumNetBpv = candidate.minimumNetBpv;
  if (!isFiniteNumber(minimumNetBpv) || minimumNetBpv <= 0) {
    issues.push(tuningIssue(
      "INVALID_MINIMUM_NET_BPV",
      "minimumNetBpv",
      "minimumNetBpv must be finite and greater than 0.",
    ));
  }

  const roundingStep = candidate.roundingStep;
  if (!isFiniteNumber(roundingStep) || roundingStep <= 0) {
    issues.push(tuningIssue(
      "INVALID_ROUNDING_STEP",
      "roundingStep",
      "roundingStep must be finite and greater than 0.",
    ));
  }
  if (candidate.roundingDirection !== "UP") {
    issues.push(tuningIssue(
      "INVALID_ROUNDING_DIRECTION",
      "roundingDirection",
      "Only upward final BPV rounding is supported.",
    ));
  }

  if (issues.length > 0) {
    return Object.freeze({
      ok: false as const,
      value: null,
      issues: Object.freeze(issues),
    });
  }

  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      tuningSetId: tuningSetId!,
      tuningVersion: tuningVersion!,
      updatedAt: updatedAt!,
      restrictionTierRates: Object.freeze({ ...rates }),
      standardCombinedCap: standardCombinedCap as number,
      exceptionalCombinedCap: exceptionalCombinedCap as number,
      minimumNetBpv: minimumNetBpv as number,
      roundingStep: roundingStep as number,
      roundingDirection: "UP" as const,
    }),
    issues: Object.freeze([]) as readonly [],
  });
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite and non-negative.`);
  }
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and greater than 0.`);
  }
}

function roundToPrecision(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function roundUpToStep(value: number, step: number): number {
  return roundToPrecision(Math.ceil((value - Number.EPSILON) / step) * step);
}

export type RestrictionOnlyBpvCredit = Readonly<{
  grossBpv: number;
  tier: RestrictionTier;
  tierRate: number;
  rawRestrictionCreditBpv: number;
}>;

export function calculateRestrictionOnlyBpvCredit(params: {
  grossBpv: number;
  tier: RestrictionTier;
  tuning: PlayerPowerDrawbackTuningSnapshot;
}): RestrictionOnlyBpvCredit {
  assertFiniteNonNegative(params.grossBpv, "grossBpv");
  const tierRate = params.tuning.restrictionTierRates[params.tier];
  return Object.freeze({
    grossBpv: params.grossBpv,
    tier: params.tier,
    tierRate,
    rawRestrictionCreditBpv: roundToPrecision(params.grossBpv * tierRate),
  });
}

export type PlayerPowerDrawbackEconomicResult = Readonly<{
  consumer: "PLAYER_POWER" | "SIGNATURE_MOVE";
  grossBpv: number;
  grossPlayerSpend: number;
  cooldownBasisBpv: number;
  budgetCooldownSpendBasis: number;
  restrictionTier: RestrictionTier | null;
  restrictionRate: number;
  burdenRate: number;
  rawRestrictionCreditBpv: number;
  rawBurdenCreditBpv: number;
  rawCombinedCreditBpv: number;
  exceptionalCombinationEligible: boolean;
  appliedCombinedCapRate: number;
  maximumCombinedCreditBpv: number;
  appliedCombinedCreditBpv: number;
  netBpvBeforeFloor: number;
  netBpvAfterFloor: number;
  netBpv: number;
  netPlayerSpend: number;
  displayedPlayerPointCredit: number;
  playerSpendScalar: number;
  tuningSetId: string;
  tuningVersion: string;
  tuningUpdatedAt: string;
}>;

export function resolvePlayerPowerDrawbackEconomics(params: {
  consumer: RestrictionConsumer;
  grossBpv: number;
  playerSpendScalar: number;
  restrictionTier: RestrictionTier | null;
  burdenRate?: number;
  exceptionalCombinationEligible: boolean;
  tuning: PlayerPowerDrawbackTuningSnapshot;
}): PlayerPowerDrawbackEconomicResult | null {
  if (!consumerSupportsNumericRestrictionCredit(params.consumer)) return null;

  assertFiniteNonNegative(params.grossBpv, "grossBpv");
  assertFinitePositive(params.playerSpendScalar, "playerSpendScalar");
  if (params.grossBpv < params.tuning.minimumNetBpv) {
    throw new Error("grossBpv cannot be lower than the configured minimum Net BPV.");
  }

  const burdenRate = params.burdenRate ?? 0;
  if (!Number.isFinite(burdenRate) || burdenRate < 0 || burdenRate > 1) {
    throw new Error("burdenRate must be finite and between 0 and 1.");
  }

  const restrictionRate = params.restrictionTier === null
    ? 0
    : params.tuning.restrictionTierRates[params.restrictionTier];
  const rawRestrictionCreditBpv = roundToPrecision(params.grossBpv * restrictionRate);
  const rawBurdenCreditBpv = roundToPrecision(params.grossBpv * burdenRate);
  const rawCombinedCreditBpv = roundToPrecision(
    rawRestrictionCreditBpv + rawBurdenCreditBpv,
  );
  const appliedCombinedCapRate = params.exceptionalCombinationEligible
    ? params.tuning.exceptionalCombinedCap
    : params.tuning.standardCombinedCap;
  const maximumCombinedCreditBpv = roundToPrecision(
    params.grossBpv * appliedCombinedCapRate,
  );
  const appliedCombinedCreditBpv = Math.min(
    rawCombinedCreditBpv,
    maximumCombinedCreditBpv,
  );
  const netBpvBeforeFloor = roundToPrecision(
    params.grossBpv - appliedCombinedCreditBpv,
  );
  const netBpvAfterFloor = Math.max(
    params.tuning.minimumNetBpv,
    netBpvBeforeFloor,
  );
  const netBpv = Math.min(
    params.grossBpv,
    roundUpToStep(netBpvAfterFloor, params.tuning.roundingStep),
  );
  const grossPlayerSpend = Math.ceil(params.grossBpv * params.playerSpendScalar);
  const netPlayerSpend = Math.ceil(netBpv * params.playerSpendScalar);

  return Object.freeze({
    consumer: params.consumer,
    grossBpv: params.grossBpv,
    grossPlayerSpend,
    cooldownBasisBpv: params.grossBpv,
    budgetCooldownSpendBasis: grossPlayerSpend,
    restrictionTier: params.restrictionTier,
    restrictionRate,
    burdenRate,
    rawRestrictionCreditBpv,
    rawBurdenCreditBpv,
    rawCombinedCreditBpv,
    exceptionalCombinationEligible: params.exceptionalCombinationEligible,
    appliedCombinedCapRate,
    maximumCombinedCreditBpv,
    appliedCombinedCreditBpv,
    netBpvBeforeFloor,
    netBpvAfterFloor,
    netBpv,
    netPlayerSpend,
    displayedPlayerPointCredit: grossPlayerSpend - netPlayerSpend,
    playerSpendScalar: params.playerSpendScalar,
    tuningSetId: params.tuning.tuningSetId,
    tuningVersion: params.tuning.tuningVersion,
    tuningUpdatedAt: params.tuning.updatedAt,
  });
}
