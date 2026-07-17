import assert from "node:assert/strict";

import {
  APPROVED_ORDINARY_RESTRICTION_TIER_RATES,
  APPROVED_PLAYER_POWER_DRAWBACK_ECONOMIC_RULES,
  calculateRestrictionOnlyBpvCredit,
  resolvePlayerPowerDrawbackEconomics,
  validateCompletePlayerPowerDrawbackTuning,
  type PlayerPowerDrawbackTuningCandidate,
  type PlayerPowerDrawbackTuningSnapshot,
} from "../lib/restrictions/economics";

let checks = 0;

function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  checks += 1;
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  checks += 1;
}

function close(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${message} Expected ${expected}, received ${actual}.`);
  checks += 1;
}

const TEST_ONLY_OATH_RATE = 0.4;
const TEST_ONLY_EXCEPTIONAL_COMBINED_CAP = 0.7;

const testOnlyCompleteCandidate: PlayerPowerDrawbackTuningCandidate = {
  tuningSetId: "test-only-drawback-tuning",
  tuningVersion: "test-only-v1",
  updatedAt: "2026-07-17T00:00:00.000Z",
  restrictionTierRates: {
    ...APPROVED_ORDINARY_RESTRICTION_TIER_RATES,
    OATH_LIMITATION: TEST_ONLY_OATH_RATE,
  },
  ...APPROVED_PLAYER_POWER_DRAWBACK_ECONOMIC_RULES,
  exceptionalCombinedCap: TEST_ONLY_EXCEPTIONAL_COMBINED_CAP,
};

equal(APPROVED_ORDINARY_RESTRICTION_TIER_RATES.MATERIAL_LIMITATION, 0.1, "Material rate is approved at 10%.");
equal(APPROVED_ORDINARY_RESTRICTION_TIER_RATES.SUBSTANTIAL_LIMITATION, 0.2, "Substantial rate is approved at 20%.");
equal(APPROVED_ORDINARY_RESTRICTION_TIER_RATES.NARROW_AVAILABILITY, 0.3, "Narrow rate is approved at 30%.");
check(!Object.hasOwn(APPROVED_ORDINARY_RESTRICTION_TIER_RATES, "OATH_LIMITATION"), "No production-default Oath rate exists.");
equal(APPROVED_PLAYER_POWER_DRAWBACK_ECONOMIC_RULES.standardCombinedCap, 0.5, "Standard combined cap is approved at 50%.");
equal(APPROVED_PLAYER_POWER_DRAWBACK_ECONOMIC_RULES.minimumNetBpv, 1, "Minimum Net BPV is approved at 1.");
equal(APPROVED_PLAYER_POWER_DRAWBACK_ECONOMIC_RULES.roundingStep, 0.5, "Final upward BPV rounding step is approved at 0.5.");
equal(APPROVED_PLAYER_POWER_DRAWBACK_ECONOMIC_RULES.roundingDirection, "UP", "Final BPV rounding direction is upward.");
check(!Object.hasOwn(APPROVED_PLAYER_POWER_DRAWBACK_ECONOMIC_RULES, "exceptionalCombinedCap"), "No production-default exceptional cap exists.");

const missingOath = validateCompletePlayerPowerDrawbackTuning({
  ...testOnlyCompleteCandidate,
  restrictionTierRates: { ...APPROVED_ORDINARY_RESTRICTION_TIER_RATES },
});
check(!missingOath.ok, "Complete tuning rejects a missing Oath rate.");
check(missingOath.issues.some((issue) => issue.code === "MISSING_OATH_RATE"), "Missing Oath rate has a stable issue code.");

const missingExceptionalCap = validateCompletePlayerPowerDrawbackTuning({
  ...testOnlyCompleteCandidate,
  exceptionalCombinedCap: undefined,
});
check(!missingExceptionalCap.ok, "Complete tuning rejects a missing exceptional cap.");
check(missingExceptionalCap.issues.some((issue) => issue.code === "MISSING_EXCEPTIONAL_COMBINED_CAP"), "Missing exceptional cap has a stable issue code.");

const validated = validateCompletePlayerPowerDrawbackTuning(testOnlyCompleteCandidate);
check(validated.ok, "Clearly labelled test-only open values can exercise the generic algorithm.");
const tuning: PlayerPowerDrawbackTuningSnapshot = validated.ok
  ? validated.value
  : assert.fail("Test-only tuning should validate.");
check(Object.isFrozen(tuning), "Validated tuning snapshot is immutable.");
check(Object.isFrozen(tuning.restrictionTierRates), "Validated tier rates are immutable.");
equal(tuning.tuningSetId, "test-only-drawback-tuning", "Tuning-set identity is retained.");
equal(tuning.tuningVersion, "test-only-v1", "Tuning version is retained.");
equal(tuning.exceptionalCombinedCap, TEST_ONLY_EXCEPTIONAL_COMBINED_CAP, "Test-only exceptional cap is explicit rather than defaulted.");

for (const [tier, expectedRate] of [
  ["MATERIAL_LIMITATION", 0.1],
  ["SUBSTANTIAL_LIMITATION", 0.2],
  ["NARROW_AVAILABILITY", 0.3],
] as const) {
  const credit = calculateRestrictionOnlyBpvCredit({ grossBpv: 100, tier, tuning });
  equal(credit.tierRate, expectedRate, `${tier} resolves its exact approved rate.`);
  equal(credit.rawRestrictionCreditBpv, expectedRate * 100, `${tier} credit anchors to Gross BPV.`);
  equal(credit.grossBpv, 100, `${tier} leaves Gross BPV unchanged.`);
}

for (const grossBpv of [3.6, 14.8, 129.2]) {
  const result = resolvePlayerPowerDrawbackEconomics({
    consumer: "PLAYER_POWER",
    grossBpv,
    playerSpendScalar: 2,
    restrictionTier: "SUBSTANTIAL_LIMITATION",
    exceptionalCombinationEligible: false,
    tuning,
  });
  check(result !== null, `${grossBpv} BPV Player Power produces a numeric result.`);
  equal(result.grossBpv, grossBpv, `${grossBpv} Gross BPV is unchanged.`);
  equal(result.cooldownBasisBpv, grossBpv, `${grossBpv} cooldown BPV remains gross.`);
  equal(result.budgetCooldownSpendBasis, result.grossPlayerSpend, `${grossBpv} cooldown pressure remains gross-spend based.`);
  check(result.netBpv <= result.grossBpv, `${grossBpv} Net BPV never exceeds Gross BPV.`);
  check(result.netBpv >= tuning.minimumNetBpv, `${grossBpv} Net BPV respects the floor.`);
}

const standardCap = resolvePlayerPowerDrawbackEconomics({
  consumer: "PLAYER_POWER",
  grossBpv: 100,
  playerSpendScalar: 2,
  restrictionTier: "OATH_LIMITATION",
  burdenRate: 0.4,
  exceptionalCombinationEligible: false,
  tuning,
})!;
equal(standardCap.rawRestrictionCreditBpv, 40, "Oath test credit independently anchors to Gross BPV.");
equal(standardCap.rawBurdenCreditBpv, 40, "Future Burden placeholder independently anchors to Gross BPV.");
equal(standardCap.rawCombinedCreditBpv, 80, "Independent credits add without sequential discounting.");
equal(standardCap.appliedCombinedCapRate, 0.5, "False exceptional flag uses the standard cap.");
equal(standardCap.appliedCombinedCreditBpv, 50, "Ordinary combined credit cannot exceed the standard cap.");
equal(standardCap.netBpv, 50, "Standard cap produces the expected Net BPV.");

const exceptionalCap = resolvePlayerPowerDrawbackEconomics({
  consumer: "SIGNATURE_MOVE",
  grossBpv: 100,
  playerSpendScalar: 2,
  restrictionTier: "OATH_LIMITATION",
  burdenRate: 0.4,
  exceptionalCombinationEligible: true,
  tuning,
})!;
equal(exceptionalCap.appliedCombinedCapRate, TEST_ONLY_EXCEPTIONAL_COMBINED_CAP, "Explicit eligibility selects the configured exceptional cap.");
equal(exceptionalCap.appliedCombinedCreditBpv, 70, "Exceptional credit cannot exceed the configured exceptional cap.");
equal(exceptionalCap.netBpv, 30, "Exceptional cap produces a still-bounded Net BPV.");
equal(exceptionalCap.tuningVersion, "test-only-v1", "Exceptional resolution retains version provenance.");
check(Number.isFinite(exceptionalCap.appliedCombinedCapRate), "Exceptional cap is finite.");

const floorCase = resolvePlayerPowerDrawbackEconomics({
  consumer: "PLAYER_POWER",
  grossBpv: 1.2,
  playerSpendScalar: 2,
  restrictionTier: "OATH_LIMITATION",
  burdenRate: 0.4,
  exceptionalCombinationEligible: true,
  tuning,
})!;
close(floorCase.netBpvBeforeFloor, 0.36, "Floor fixture resolves the pre-floor Net BPV.");
equal(floorCase.netBpvAfterFloor, 1, "Minimum Net BPV floor applies once.");
equal(floorCase.netBpv, 1, "Final rounded Net BPV retains the floor.");

const roundingCase = resolvePlayerPowerDrawbackEconomics({
  consumer: "PLAYER_POWER",
  grossBpv: 14.8,
  playerSpendScalar: 2,
  restrictionTier: "MATERIAL_LIMITATION",
  exceptionalCombinationEligible: false,
  tuning,
})!;
close(roundingCase.netBpvBeforeFloor, 13.32, "Rounding fixture begins at the unrounded Net BPV.");
equal(roundingCase.netBpv, 13.5, "Final BPV rounds upward to the next 0.5.");
equal(roundingCase.netPlayerSpend, 27, "Player Point ceiling occurs after BPV resolution.");
equal(roundingCase.grossPlayerSpend, 30, "Gross Player spend remains unchanged.");

const exactHalf = resolvePlayerPowerDrawbackEconomics({
  consumer: "PLAYER_POWER",
  grossBpv: 10,
  playerSpendScalar: 2,
  restrictionTier: "MATERIAL_LIMITATION",
  exceptionalCombinationEligible: false,
  tuning,
})!;
equal(exactHalf.netBpvBeforeFloor, 9, "Exact-step fixture reaches an exact half-BPV boundary.");
equal(exactHalf.netBpv, 9, "Exact half-BPV value is preserved.");

const scalarTwo = roundingCase;
const scalarThree = resolvePlayerPowerDrawbackEconomics({
  consumer: "PLAYER_POWER",
  grossBpv: 14.8,
  playerSpendScalar: 3,
  restrictionTier: "MATERIAL_LIMITATION",
  exceptionalCombinationEligible: false,
  tuning,
})!;
equal(scalarTwo.rawRestrictionCreditBpv, scalarThree.rawRestrictionCreditBpv, "Scalar change does not alter native BPV credit.");
equal(scalarTwo.netBpv, scalarThree.netBpv, "Scalar change does not alter Net BPV.");
equal(scalarTwo.netPlayerSpend, 27, "Scalar 2 converts rounded Net BPV.");
equal(scalarThree.netPlayerSpend, 41, "Scalar 3 changes displayed points only.");

const independent = resolvePlayerPowerDrawbackEconomics({
  consumer: "PLAYER_POWER",
  grossBpv: 100,
  playerSpendScalar: 2,
  restrictionTier: "SUBSTANTIAL_LIMITATION",
  burdenRate: 0.3,
  exceptionalCombinationEligible: false,
  tuning,
})!;
equal(independent.rawRestrictionCreditBpv, 20, "Restriction credit uses Gross BPV.");
equal(independent.rawBurdenCreditBpv, 30, "Burden credit uses Gross BPV rather than post-Restriction BPV.");
check(independent.rawBurdenCreditBpv !== 24, "Burden credit is not calculated sequentially.");

check(Object.isFrozen(roundingCase), "Economic result is immutable.");
const originalNetBpv = roundingCase.netBpv;
try {
  (roundingCase as { netBpv: number }).netBpv = 999;
} catch {
  // Strict-mode mutation of a frozen result is expected to throw.
}
equal(roundingCase.netBpv, originalNetBpv, "Economic result cannot be mutated.");

equal(resolvePlayerPowerDrawbackEconomics({
  consumer: "ROLEPLAY_ABILITY",
  grossBpv: 100,
  playerSpendScalar: 2,
  restrictionTier: "MATERIAL_LIMITATION",
  exceptionalCombinationEligible: false,
  tuning,
}), null, "Roleplay produces no numeric result.");
equal(resolvePlayerPowerDrawbackEconomics({
  consumer: "MONSTER_POWER",
  grossBpv: 100,
  playerSpendScalar: 2,
  restrictionTier: "MATERIAL_LIMITATION",
  exceptionalCombinationEligible: false,
  tuning,
}), null, "Monster produces no numeric result.");

for (const candidate of [
  { ...testOnlyCompleteCandidate, restrictionTierRates: { ...testOnlyCompleteCandidate.restrictionTierRates, MATERIAL_LIMITATION: -0.1 } },
  { ...testOnlyCompleteCandidate, restrictionTierRates: { ...testOnlyCompleteCandidate.restrictionTierRates, MATERIAL_LIMITATION: Number.NaN } },
  { ...testOnlyCompleteCandidate, standardCombinedCap: 1.1 },
  { ...testOnlyCompleteCandidate, exceptionalCombinedCap: 0.5 },
  { ...testOnlyCompleteCandidate, exceptionalCombinedCap: Number.POSITIVE_INFINITY },
  { ...testOnlyCompleteCandidate, minimumNetBpv: 0 },
  { ...testOnlyCompleteCandidate, roundingStep: Number.NaN },
  { ...testOnlyCompleteCandidate, roundingDirection: "NEAREST" },
] satisfies PlayerPowerDrawbackTuningCandidate[]) {
  check(!validateCompletePlayerPowerDrawbackTuning(candidate).ok, "Invalid or non-finite tuning is rejected.");
}

assert.throws(
  () => resolvePlayerPowerDrawbackEconomics({
    consumer: "PLAYER_POWER",
    grossBpv: 100,
    playerSpendScalar: 2,
    restrictionTier: "MATERIAL_LIMITATION",
    burdenRate: Number.NaN,
    exceptionalCombinationEligible: false,
    tuning,
  }),
  /burdenRate must be finite/,
  "Non-finite future Burden rate is rejected.",
);
checks += 1;

console.log(`Restriction economics foundation smoke passed (${checks} checks).`);
