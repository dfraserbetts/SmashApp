import assert from "node:assert/strict";

import type { PowerCooldownAuthorityResult } from "../lib/summoning/types";
import { parseCharacterReconciliationArgs } from "./reconcileCharacterPowerCooldownCaches";
import { parseMonsterReconciliationArgs } from "./reconcileMonsterPowerCooldownCaches";
import {
  createReconciliationReport,
  formatReconciliationHuman,
  reconciliationExitCode,
  resolvedReconciliationResult,
  stableJson,
  unresolvedReconciliationResult,
  verifyBuilderDataCacheOnlyChanges,
  verifyCacheOnlyPowerChange,
} from "./powerCooldownCacheReconciliation.shared";

const authority = (effectiveCooldownTurns: number): PowerCooldownAuthorityResult => ({
  effectiveCooldownTurns,
  source: "ACTIVE_TUNING",
  tuningSetId: "tuning-current",
  tuningUpdatedAt: "2026-07-13T00:00:00.000Z",
  storedCooldownTurns: null,
  mismatch: false,
  warnings: [],
  basePowerValue: 10,
  cooldownLoad: 2,
});

const identity = {
  ownerId: "owner-1",
  ownerName: "Fixture Owner",
  campaignId: "campaign-1",
  campaignName: "Fixture Campaign",
  ownerArchived: false,
  level: 3,
};

const input = {
  name: "Fixture Power",
  cooldownTurns: 2,
  cooldownReduction: 0,
  semanticField: { unchanged: true },
};
const inputSnapshot = structuredClone(input);

const match = resolvedReconciliationResult({
  ...identity,
  category: "MONSTER_POWER",
  powerId: "match",
  powerName: "Exact Match",
  originalPower: input,
  targetCooldownTurns: 2,
  authority: authority(2),
});
const storedLower = resolvedReconciliationResult({
  ...identity,
  category: "MONSTER_POWER",
  powerId: "lower",
  powerName: "Stored Lower",
  originalPower: { ...input, cooldownTurns: 1 },
  targetCooldownTurns: 2,
  authority: authority(2),
});
const storedHigher = resolvedReconciliationResult({
  ...identity,
  category: "CHARACTER_POWER",
  powerId: "higher",
  powerName: "Stored Higher",
  originalPower: { ...input, cooldownTurns: 5 },
  targetCooldownTurns: 2,
  authority: authority(2),
});
const reductionOnly = resolvedReconciliationResult({
  ...identity,
  category: "SIGNATURE_MOVE",
  powerId: "reduction",
  powerName: "Reduction Only",
  originalPower: { ...input, cooldownReduction: 1 },
  targetCooldownTurns: 2,
  authority: authority(2),
});
const unresolved = unresolvedReconciliationResult({
  ...identity,
  category: "CHARACTER_POWER",
  powerId: "unresolved",
  powerName: "Missing Authority",
  storedCooldownTurns: 2,
  storedCooldownReduction: 0,
  error: "Active tuning is missing.",
});

assert.equal(match.status, "MATCH");
assert.equal(storedLower.status, "MISMATCH");
assert.equal(storedLower.cooldownDelta, 1);
assert.equal(storedHigher.status, "MISMATCH");
assert.equal(storedHigher.cooldownDelta, -3);
assert.equal(reductionOnly.status, "MISMATCH");
assert.equal(unresolved.status, "UNRESOLVED");
assert.deepEqual(input, inputSnapshot, "Reconciliation must not mutate power inputs.");

for (const row of [match, storedLower, storedHigher, reductionOnly]) {
  assert.equal(row.semanticIntegrityVerified, true);
  assert.ok(
    row.proposedChangedPaths.every((path) => path === "cooldownTurns" || path === "cooldownReduction"),
  );
}
assert.equal(
  verifyCacheOnlyPowerChange(input, { ...input, semanticField: { unchanged: false } }).ok,
  false,
  "A semantic-field change must fail integrity verification.",
);

const builderBefore = {
  narrativeNotes: "must remain byte-for-byte equivalent",
  attributes: { Attack: 8 },
  powers: [{ name: "Ordinary", cooldownTurns: 1, cooldownReduction: 0, semantic: [1, 2] }],
  signatureMove: { name: "Signature", cooldownTurns: 5, cooldownReduction: 1, semantic: { x: true } },
};
const builderBeforeSnapshot = structuredClone(builderBefore);
const builderAfter = structuredClone(builderBefore);
builderAfter.powers[0].cooldownTurns = 2;
builderAfter.signatureMove.cooldownTurns = 2;
builderAfter.signatureMove.cooldownReduction = 0;
const builderIntegrity = verifyBuilderDataCacheOnlyChanges(builderBefore, builderAfter);
assert.equal(builderIntegrity.ok, true);
assert.deepEqual(builderBefore, builderBeforeSnapshot, "Builder verification must not mutate its input.");
assert.deepEqual(builderAfter.attributes, builderBefore.attributes);
assert.equal(builderAfter.narrativeNotes, builderBefore.narrativeNotes);
assert.deepEqual(builderAfter.powers[0].semantic, builderBefore.powers[0].semantic);
assert.deepEqual(builderAfter.signatureMove.semantic, builderBefore.signatureMove.semantic);

const report = createReconciliationReport({
  scope: "CHARACTER",
  generatedAt: "2026-07-13T00:00:00.000Z",
  branch: "main",
  commitSha: "0000000000000000000000000000000000000000",
  tuning: {
    setId: "tuning-current",
    name: "Current",
    updatedAt: "2026-07-13T00:00:00.000Z",
  },
  ownerCount: 1,
  activeOwnerCount: 1,
  archivedOwnerCount: 0,
  results: [match, storedLower, storedHigher, reductionOnly],
});
assert.equal(report.storedLowerThanDerived, 1);
assert.equal(report.storedHigherThanDerived, 1);
assert.equal(report.reductionOnlyChanges, 1);
assert.equal(report.categoryCounts.CHARACTER_POWER.total, 1);
assert.equal(report.categoryCounts.SIGNATURE_MOVE.total, 1);
assert.equal(storedHigher.category, "CHARACTER_POWER");
assert.equal(reductionOnly.category, "SIGNATURE_MOVE");
assert.match(formatReconciliationHuman(report), /no database, tuning, asset, or repository writes occurred/i);
assert.equal(stableJson(report), stableJson(report), "JSON serialization must be stable.");
assert.doesNotThrow(() => JSON.parse(stableJson(report)));
assert.equal(reconciliationExitCode(report), 0, "Ordinary mismatches must not fail a dry run.");

const unresolvedReport = createReconciliationReport({
  scope: "CHARACTER",
  generatedAt: "2026-07-13T00:00:00.000Z",
  branch: "main",
  commitSha: "0000000000000000000000000000000000000000",
  tuning: { setId: null, name: null, updatedAt: null },
  ownerCount: 1,
  activeOwnerCount: 1,
  archivedOwnerCount: 0,
  results: [unresolved],
});
assert.equal(reconciliationExitCode(unresolvedReport), 1);

for (const parser of [parseMonsterReconciliationArgs, parseCharacterReconciliationArgs]) {
  assert.deepEqual(parser(["--json"]), { json: true, help: false });
  assert.throws(() => parser(["--apply"]), /dry-run only.*--apply.*forbidden/i);
  assert.throws(() => parser(["--unknown"]), /unknown option/i);
}

console.log(
  JSON.stringify(
    {
      passed: true,
      assertions: [
        "match, lower, higher, reduction-only, and unresolved classification",
        "cache-only semantic integrity and builderData deep identity",
        "ordinary and signature category separation",
        "input immutability and stable JSON",
        "dry-run-only CLI parser rejection",
        "mismatch success and unresolved failure exit doctrine",
      ],
    },
    null,
    2,
  ),
);
