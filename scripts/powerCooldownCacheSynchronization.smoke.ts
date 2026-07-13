import assert from "node:assert/strict";

import {
  DEFAULT_POWER_TUNING_VALUES,
  type PowerTuningSnapshot,
} from "../lib/config/powerTuningShared";
import { makeFixturePower } from "../lib/combat-lab/powerAdapter";
import {
  synchronizePowerCooldownCache,
  synchronizePowerCooldownCacheBatch,
} from "../lib/summoning/powerCooldownCacheSynchronization";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import type { Power } from "../lib/summoning/types";

const activeTuning: PowerTuningSnapshot = {
  setId: "power-cooldown-cache-sync-smoke-active",
  name: "Power Cooldown Cache Synchronization Smoke Active",
  slug: "power-cooldown-cache-sync-smoke-active",
  status: "ACTIVE",
  updatedAt: "2026-07-13T00:00:00.000Z",
  values: {
    ...DEFAULT_POWER_TUNING_VALUES,
    "cooldown.load.lightMax": 0,
    "cooldown.load.moderateMax": 999,
    "cooldown.load.heavyMax": 1000,
  },
};

const context = { level: 1, tier: "SOLDIER" as const };

function fixture(name: string, cooldownTurns: number): Power {
  const power = makeFixturePower({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    intention: "ATTACK",
    diceCount: 3,
    potency: 2,
    cooldownTurns,
  });
  return {
    ...power,
    effectPackets: power.effectPackets.map((packet, index) => ({
      ...packet,
      id: `${power.id}-packet-${index}`,
    })),
  };
}

function withoutCache(power: Power) {
  return Object.fromEntries(
    Object.entries(power).filter(
      ([key]) => !["cooldownTurns", "cooldownReduction", "cooldownAuthority"].includes(key),
    ),
  );
}

function synchronize(power: Power) {
  return synchronizePowerCooldownCache({
    power,
    tuningSnapshot: activeTuning,
    context,
  });
}

for (const storedCooldownTurns of [1, 5]) {
  const input = fixture(`Stored ${storedCooldownTurns}`, storedCooldownTurns);
  const inputSnapshot = structuredClone(input);
  const result = synchronize(input);
  assert.equal(result.ok, true);
  if (!result.ok) continue;
  assert.equal(result.power.cooldownTurns, 2);
  assert.equal(result.power.cooldownReduction, 0);
  assert.deepEqual(withoutCache(result.power), withoutCache(input));
  assert.deepEqual(input, inputSnapshot, "Synchronization must not mutate its input power.");
  assert.equal(result.authority.source, "ACTIVE_TUNING");
  assert.equal(result.authority.tuningSetId, activeTuning.setId);
  assert.equal(result.authority.storedCooldownTurns, storedCooldownTurns);
  assert.equal(result.authority.mismatch, true);
  assert.ok(result.authority.warnings.some((warning) => /stored cooldown/i.test(warning)));
}

const missingStored = fixture("Missing stored cooldown", 1);
missingStored.cooldownTurns = undefined as unknown as number;
const missingStoredResult = synchronize(missingStored);
assert.equal(missingStoredResult.ok, true);
assert.equal(missingStoredResult.ok && missingStoredResult.power.cooldownTurns, 2);
assert.equal(missingStoredResult.ok && missingStoredResult.power.cooldownReduction, 0);
assert.equal(missingStoredResult.ok && missingStoredResult.authority.storedCooldownTurns, null);

const missingTuning = synchronizePowerCooldownCache({
  power: fixture("Missing active tuning", 1),
  tuningSnapshot: null,
  context,
});
assert.equal(missingTuning.ok, false);
assert.equal(!missingTuning.ok && missingTuning.errorCode, "ACTIVE_TUNING_REQUIRED");

const batchInputs = [fixture("Batch One", 1), fixture("Batch Two", 5)];
const batchSnapshots = structuredClone(batchInputs);
const batch = synchronizePowerCooldownCacheBatch({
  powers: batchInputs,
  tuningSnapshot: activeTuning,
  context,
});
assert.equal(batch.ok, true);
assert.deepEqual(batch.ok && batch.powers.map((power) => power.cooldownTurns), [2, 2]);
assert.deepEqual(batch.ok && batch.powers.map((power) => power.cooldownReduction), [0, 0]);
assert.deepEqual(batchInputs, batchSnapshots);

const failingPower = {
  ...fixture("Batch failure", 1),
  get effectPackets(): Power["effectPackets"] {
    throw new Error("intentional batch derivation failure");
  },
};
const failedBatch = synchronizePowerCooldownCacheBatch({
  powers: [fixture("Batch success before failure", 1), failingPower],
  tuningSnapshot: activeTuning,
  context,
});
assert.equal(failedBatch.ok, false);
assert.equal(!failedBatch.ok && failedBatch.errorCode, "COOLDOWN_DERIVATION_FAILED");
assert.equal(!failedBatch.ok && failedBatch.powerIndex, 1);
assert.equal("powers" in failedBatch, false, "A failed batch must not expose partial synchronized output.");

const staleCopy = fixture("Copy-style stale cache", 5);
const copied = synchronize(staleCopy);
assert.equal(copied.ok, true);
assert.equal(copied.ok && copied.power.cooldownTurns, 2);
assert.equal(copied.ok && copied.power.id, staleCopy.id);
assert.deepEqual(
  copied.ok && copied.power.effectPackets.map((packet) => packet.id),
  staleCopy.effectPackets.map((packet) => packet.id),
);

const suddenLeap = fixture("Sudden Leap", 1);
const suddenLeapResult = synchronize(suddenLeap);
assert.equal(suddenLeapResult.ok, true);
assert.equal(suddenLeapResult.ok && suddenLeapResult.power.cooldownTurns, 2);

const beforeCost = resolvePowerCosts([staleCopy], activeTuning, context).powers[0];
assert.ok(beforeCost);
if (copied.ok) {
  const afterCost = resolvePowerCosts([copied.power], activeTuning, context).powers[0];
  assert.ok(afterCost);
  assert.equal(afterCost.breakdown.basePowerValue, beforeCost.breakdown.basePowerValue);
  assert.equal(afterCost.derivedCooldownTurns, beforeCost.derivedCooldownTurns);
  assert.deepEqual(afterCost.derivedCooldown, beforeCost.derivedCooldown);
}

console.log("powerCooldownCacheSynchronization.smoke.ts passed");
