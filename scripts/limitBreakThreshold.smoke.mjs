import assert from "node:assert/strict";
import {
  getAttributeLimitBreakCeiling,
  getLimitBreakRequiredSuccesses,
  getLimitBreakThresholdPercent,
  getWeaponLimitBreakCeiling,
} from "../lib/limitBreakThreshold.ts";

const weaponSkill3Ceiling = getWeaponLimitBreakCeiling(3);
assert.equal(weaponSkill3Ceiling, 4);
assert.equal(getLimitBreakRequiredSuccesses(weaponSkill3Ceiling, 60), 3);
assert.equal(getLimitBreakRequiredSuccesses(weaponSkill3Ceiling, 85), 4);
assert.equal(getLimitBreakRequiredSuccesses(weaponSkill3Ceiling, 125), 5);

const weaponSkill5Ceiling = getWeaponLimitBreakCeiling(5);
assert.equal(weaponSkill5Ceiling, 6);
assert.equal(getLimitBreakRequiredSuccesses(weaponSkill5Ceiling, 60), 4);
assert.equal(getLimitBreakRequiredSuccesses(weaponSkill5Ceiling, 85), 6);
assert.equal(getLimitBreakRequiredSuccesses(weaponSkill5Ceiling, 125), 8);

const attrSixCeiling = getAttributeLimitBreakCeiling(6);
assert.equal(attrSixCeiling, 7);
const pushPercent = getLimitBreakThresholdPercent("PUSH");
const breakPercent = getLimitBreakThresholdPercent("BREAK");
const transcendPercent = getLimitBreakThresholdPercent("TRANSCEND");
assert.notEqual(pushPercent, null);
assert.notEqual(breakPercent, null);
assert.notEqual(transcendPercent, null);
assert.equal(
  getLimitBreakRequiredSuccesses(attrSixCeiling, pushPercent),
  5,
);
assert.equal(
  getLimitBreakRequiredSuccesses(attrSixCeiling, breakPercent),
  6,
);
assert.equal(
  getLimitBreakRequiredSuccesses(attrSixCeiling, transcendPercent),
  9,
);

const attrTenCeiling = getAttributeLimitBreakCeiling(10);
assert.equal(attrTenCeiling, 11);
assert.equal(
  getLimitBreakRequiredSuccesses(attrTenCeiling, pushPercent),
  7,
);
assert.equal(
  getLimitBreakRequiredSuccesses(attrTenCeiling, breakPercent),
  10,
);
assert.equal(
  getLimitBreakRequiredSuccesses(attrTenCeiling, transcendPercent),
  14,
);

console.log("limitBreakThreshold.smoke.mjs passed");
