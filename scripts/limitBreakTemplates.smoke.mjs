import assert from "node:assert/strict";
import {
  LimitBreakTemplateValidationError,
  normalizeAndValidateTemplate,
  tierToThresholdPercent,
} from "../lib/limitBreakTemplates.ts";

function shouldThrowValidation(fn, expectedMessagePart) {
  let threw = false;
  try {
    fn();
  } catch (error) {
    if (
      error instanceof LimitBreakTemplateValidationError &&
      String(error.message).includes(expectedMessagePart)
    ) {
      threw = true;
    } else {
      throw error;
    }
  }
  assert.equal(threw, true);
}

assert.equal(tierToThresholdPercent("PUSH"), 60);
assert.equal(tierToThresholdPercent("BREAK"), 85);
assert.equal(tierToThresholdPercent("TRANSCEND"), 125);

shouldThrowValidation(
  () =>
    normalizeAndValidateTemplate({
      name: "FF No Cost",
      templateType: "PLAYER",
      tier: "PUSH",
      intention: "ATTACK",
      failForwardEnabled: true,
      failForwardEffectKey: "EFFECT_X",
      failForwardCostAKey: null,
      failForwardCostBKey: null,
    }),
  "At least one fail-forward cost key",
);

const normalized = normalizeAndValidateTemplate({
  name: "No Persistence Outside Summon/Transform",
  templateType: "PLAYER",
  tier: "BREAK",
  intention: "ATTACK",
  isPersistent: true,
  persistentStateText: "Should be dropped",
  endConditionText: "Should be dropped",
  endCostText: "Should be dropped",
});

assert.equal(normalized.isPersistent, false);
assert.equal(normalized.persistentStateText, null);
assert.equal(normalized.endConditionText, null);
assert.equal(normalized.persistentCostTiming, null);
assert.equal(normalized.endCostKey, null);
assert.deepEqual(normalized.endCostParams, {});
assert.equal(normalized.endCostText, null);
assert.equal(normalized.thresholdPercent, 85);

const persistentEnd = normalizeAndValidateTemplate({
  name: "Persistent End Timing Clears Base",
  templateType: "PLAYER",
  tier: "PUSH",
  intention: "SUMMONING",
  isPersistent: true,
  persistentCostTiming: "END",
  endConditionText: "Ends when focus breaks",
  endCostText: "Lose your next turn",
  baseCostKey: "cost-lockout-until-rest",
  baseCostParams: { turns: 1 },
  endCostKey: "cost-backlash-wounds",
  endCostParams: { amount: 3 },
});

assert.equal(persistentEnd.persistentCostTiming, "END");
assert.equal(persistentEnd.baseCostKey, null);
assert.deepEqual(persistentEnd.baseCostParams, {});
assert.equal(persistentEnd.endCostText, "Lose your next turn");
assert.equal(persistentEnd.endCostKey, "cost-backlash-wounds");

const persistentBegin = normalizeAndValidateTemplate({
  name: "Persistent Begin Timing Clears End",
  templateType: "PLAYER",
  tier: "PUSH",
  intention: "SUMMONING",
  isPersistent: true,
  persistentCostTiming: "BEGIN",
  endConditionText: "Ends when summoned creature dies",
  baseCostKey: "cost-lockout-until-rest",
  baseCostParams: { turns: 1 },
  endCostText: "Should clear",
  endCostKey: "cost-backlash-wounds",
  endCostParams: { amount: 5 },
});

assert.equal(persistentBegin.persistentCostTiming, "BEGIN");
assert.equal(persistentBegin.baseCostKey, "cost-lockout-until-rest");
assert.equal(persistentBegin.endCostText, null);
assert.equal(persistentBegin.endCostKey, null);
assert.deepEqual(persistentBegin.endCostParams, {});

const nonPersistentClearsAll = normalizeAndValidateTemplate({
  name: "Non Persistent Clears Fields",
  templateType: "PLAYER",
  tier: "PUSH",
  intention: "SUMMONING",
  isPersistent: false,
  persistentCostTiming: "BEGIN",
  persistentStateText: "state",
  endConditionText: "end condition",
  endCostText: "end cost text",
  endCostKey: "end-cost-key",
  endCostParams: { x: 1 },
});

assert.equal(nonPersistentClearsAll.isPersistent, false);
assert.equal(nonPersistentClearsAll.persistentCostTiming, null);
assert.equal(nonPersistentClearsAll.persistentStateText, null);
assert.equal(nonPersistentClearsAll.endConditionText, null);
assert.equal(nonPersistentClearsAll.endCostText, null);
assert.equal(nonPersistentClearsAll.endCostKey, null);
assert.deepEqual(nonPersistentClearsAll.endCostParams, {});

console.log("limitBreakTemplates.smoke.mjs passed");
