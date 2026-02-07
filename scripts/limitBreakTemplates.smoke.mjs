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
assert.equal(normalized.endCostText, null);
assert.equal(normalized.thresholdPercent, 85);

console.log("limitBreakTemplates.smoke.mjs passed");
