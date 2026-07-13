import assert from "node:assert/strict";

import type { PowerCooldownAuthorityResult } from "../lib/summoning/types";
import { parseCharacterReconciliationArgs } from "./reconcileCharacterPowerCooldownCaches";
import { parseMonsterReconciliationArgs } from "./reconcileMonsterPowerCooldownCaches";
import {
  APPLY_CONFIRMATION_TOKEN,
  createReconciliationReport,
  formatReconciliationHuman,
  reconciliationExitCode,
  resolvedReconciliationResult,
  stableJson,
  unresolvedReconciliationResult,
  verifyBuilderDataCacheOnlyChanges,
  verifyCacheOnlyPowerChange,
  type DryRunCliOptions,
  type ReconciliationReport,
  type ReconciliationResult,
} from "./powerCooldownCacheReconciliation.shared";
import {
  executeGuardedApply,
  formatApplyHuman,
  type ApplyTransactionEvidence,
} from "./powerCooldownCacheReconciliation.apply";

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
const tuning = {
  setId: "tuning-current",
  name: "Current",
  updatedAt: "2026-07-13T00:00:00.000Z",
};
const input = {
  name: "Fixture Power",
  cooldownTurns: 2,
  cooldownReduction: 0,
  semanticField: { unchanged: true },
};
const inputSnapshot = structuredClone(input);

function resolved(params: {
  category: "MONSTER_POWER" | "CHARACTER_POWER" | "SIGNATURE_MOVE";
  powerId: string;
  storedTurns: number;
  storedReduction?: number;
  targetTurns: number;
}): ReconciliationResult {
  return resolvedReconciliationResult({
    ...identity,
    category: params.category,
    powerId: params.powerId,
    powerName: params.powerId,
    originalPower: {
      ...input,
      cooldownTurns: params.storedTurns,
      cooldownReduction: params.storedReduction ?? 0,
    },
    targetCooldownTurns: params.targetTurns,
    authority: authority(params.targetTurns),
  });
}

const match = resolved({ category: "MONSTER_POWER", powerId: "match", storedTurns: 2, targetTurns: 2 });
const storedLower = resolved({ category: "MONSTER_POWER", powerId: "lower", storedTurns: 1, targetTurns: 2 });
const storedHigher = resolved({ category: "CHARACTER_POWER", powerId: "higher", storedTurns: 5, targetTurns: 2 });
storedHigher.proposedChangedPaths = storedHigher.proposedChangedPaths.map((path) => `powers[0].${path}`);
const reductionOnly = resolved({
  category: "SIGNATURE_MOVE",
  powerId: "reduction",
  storedTurns: 2,
  storedReduction: 1,
  targetTurns: 2,
});
reductionOnly.proposedChangedPaths = reductionOnly.proposedChangedPaths.map((path) => `signatureMove.${path}`);
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
assert.equal(
  verifyCacheOnlyPowerChange(input, { ...input, semanticField: { unchanged: false } }).ok,
  false,
  "A semantic-field change must fail integrity verification.",
);

const builderBefore = {
  narrativeNotes: "must remain deeply identical",
  powers: [{ name: "Ordinary", cooldownTurns: 1, cooldownReduction: 0, semantic: [1, 2] }],
  signatureMove: { name: "Signature", cooldownTurns: 5, cooldownReduction: 1, semantic: { x: true } },
};
const builderAfter = structuredClone(builderBefore);
builderAfter.powers[0].cooldownTurns = 2;
builderAfter.signatureMove.cooldownTurns = 2;
builderAfter.signatureMove.cooldownReduction = 0;
assert.equal(verifyBuilderDataCacheOnlyChanges(builderBefore, builderAfter).ok, true);
assert.deepEqual(builderBefore.powers[0].semantic, builderAfter.powers[0].semantic);
assert.deepEqual(builderBefore.signatureMove.semantic, builderAfter.signatureMove.semantic);

function report(scope: "MONSTER" | "CHARACTER", results: readonly ReconciliationResult[]) {
  return createReconciliationReport({
    scope,
    generatedAt: "2026-07-13T01:00:00.000Z",
    branch: "main",
    commitSha: "0000000000000000000000000000000000000000",
    tuning,
    ownerCount: 1,
    activeOwnerCount: 1,
    archivedOwnerCount: 0,
    results,
  });
}

const monsterReport = report("MONSTER", [match, storedLower]);
const monsterReportReordered = report("MONSTER", [storedLower, match]);
assert.equal(monsterReport.planHash, monsterReportReordered.planHash, "Equivalent ordering must hash identically.");
assert.notEqual(monsterReport.planHash, report("CHARACTER", [match, storedLower]).planHash);
const changedTarget = resolved({ category: "MONSTER_POWER", powerId: "lower", storedTurns: 1, targetTurns: 3 });
assert.notEqual(monsterReport.planHash, report("MONSTER", [match, changedTarget]).planHash);
const changedStored = resolved({ category: "MONSTER_POWER", powerId: "lower", storedTurns: 4, targetTurns: 2 });
assert.notEqual(monsterReport.planHash, report("MONSTER", [match, changedStored]).planHash);
assert.match(formatReconciliationHuman(monsterReport), /no database, tuning, asset, or repository writes occurred/i);
assert.match(formatReconciliationHuman(monsterReport), new RegExp(monsterReport.planHash));
assert.equal(stableJson(monsterReport), stableJson(monsterReport));
assert.equal(reconciliationExitCode(monsterReport), 0);

for (const parser of [parseMonsterReconciliationArgs, parseCharacterReconciliationArgs]) {
  assert.deepEqual(parser([]), { json: false, help: false, apply: false, confirm: null, planHash: null });
  assert.throws(() => parser(["--apply"]), /requires --confirm/i);
  assert.throws(
    () => parser(["--apply", "--confirm", "WRONG", "--plan-hash", "abc"]),
    /requires --confirm/i,
  );
  assert.throws(
    () => parser(["--apply", "--confirm", APPLY_CONFIRMATION_TOKEN]),
    /requires --plan-hash/i,
  );
  assert.throws(() => parser(["--unknown"]), /unknown option/i);
}

function applyOptions(planHash: string): DryRunCliOptions {
  return parseMonsterReconciliationArgs([
    "--apply",
    "--confirm",
    APPLY_CONFIRMATION_TOKEN,
    "--plan-hash",
    planHash,
  ]);
}

const evidence = (changes: number): ApplyTransactionEvidence => ({
  attemptedChangeCount: changes,
  appliedChangeCount: changes,
  affectedOwnerCount: 1,
  preVerificationResult: true,
  postVerificationResult: true,
  unchangedSemanticIntegrityResult: true,
});

async function main() {
let transactionEntries = 0;
await assert.rejects(
  executeGuardedApply({
    options: applyOptions("incorrect"),
    report: monsterReport,
    transaction: async () => { transactionEntries += 1; return evidence(1); },
  }),
  /plan hash mismatch/i,
);
assert.equal(transactionEntries, 0);

const unresolvedReport = report("CHARACTER", [unresolved]);
await assert.rejects(
  executeGuardedApply({
    options: applyOptions(unresolvedReport.planHash),
    report: unresolvedReport,
    transaction: async () => { transactionEntries += 1; return evidence(1); },
  }),
  /UNRESOLVED/,
);
const semanticFailureReport = structuredClone(monsterReport) as ReconciliationReport;
semanticFailureReport.results[0].semanticIntegrityVerified = false;
await assert.rejects(
  executeGuardedApply({
    options: applyOptions(semanticFailureReport.planHash),
    report: semanticFailureReport,
    transaction: async () => { transactionEntries += 1; return evidence(1); },
  }),
  /semantic integrity/i,
);

for (const drift of ["Stored-value drift", "Tuning drift"]) {
  await assert.rejects(
    executeGuardedApply({
      options: applyOptions(monsterReport.planHash),
      report: monsterReport,
      preTransactionVerify: async () => { throw new Error(drift); },
      transaction: async () => { transactionEntries += 1; return evidence(1); },
    }),
    new RegExp(drift, "i"),
  );
}
assert.equal(transactionEntries, 0, "All pre-transaction refusals must prevent transaction entry.");

const zeroMismatchReport = report("MONSTER", [match]);
await assert.rejects(
  executeGuardedApply({
    options: applyOptions(zeroMismatchReport.planHash),
    report: zeroMismatchReport,
    transaction: async () => { transactionEntries += 1; return evidence(0); },
  }),
  /zero mismatches/i,
);

const committed = await executeGuardedApply({
  options: applyOptions(monsterReport.planHash),
  report: monsterReport,
  transaction: async () => { transactionEntries += 1; return evidence(1); },
  now: (() => {
    const times = [new Date("2026-07-13T02:00:00.000Z"), new Date("2026-07-13T02:00:01.000Z")];
    return () => times.shift()!;
  })(),
});
assert.equal(transactionEntries, 1);
assert.equal(committed.transactionStatus, "COMMITTED");
assert.match(formatApplyHuman(committed), /APPLY MODE/);
assert.match(formatApplyHuman(committed), /transaction committed/i);
assert.match(formatApplyHuman(committed), /no semantic fields changed/i);
assert.doesNotThrow(() => JSON.parse(stableJson(committed)));

async function atomicMock<T extends object, R>(state: T, work: (draft: T) => Promise<R>): Promise<R> {
  const draft = structuredClone(state);
  const result = await work(draft);
  for (const key of Object.keys(state)) delete (state as Record<string, unknown>)[key];
  Object.assign(state, draft);
  return result;
}

const monsterState = {
  rows: [
    { id: "one", cooldownTurns: 1, cooldownReduction: 0, semantic: "unchanged" },
    { id: "two", cooldownTurns: 1, cooldownReduction: 0, semantic: "unchanged" },
  ],
};
const monsterStateBefore = structuredClone(monsterState);
const rolledBackMonster = await executeGuardedApply({
  options: applyOptions(monsterReport.planHash),
  report: monsterReport,
  transaction: () => atomicMock(monsterState, async (draft) => {
    draft.rows[0].cooldownTurns = 2;
    throw new Error("second monster row verification failed");
  }),
});
assert.equal(rolledBackMonster.transactionStatus, "ROLLED_BACK");
assert.deepEqual(monsterState, monsterStateBefore, "One failed monster row must roll back every change.");

const characterReport = report("CHARACTER", [storedHigher, reductionOnly]);
const characterState = { builderData: structuredClone(builderBefore) };
const characterStateBefore = structuredClone(characterState);
const rolledBackCharacter = await executeGuardedApply({
  options: applyOptions(characterReport.planHash),
  report: characterReport,
  transaction: () => atomicMock(characterState, async (draft) => {
    draft.builderData.powers[0].cooldownTurns = 2;
    throw new Error("signature verification failed");
  }),
});
assert.equal(rolledBackCharacter.transactionStatus, "ROLLED_BACK");
assert.deepEqual(characterState, characterStateBefore, "One failed character verification must roll back every change.");

const cacheOnlyMonster = structuredClone(monsterStateBefore.rows[0]);
cacheOnlyMonster.cooldownTurns = 2;
cacheOnlyMonster.cooldownReduction = 0;
assert.deepEqual(verifyCacheOnlyPowerChange(monsterStateBefore.rows[0], cacheOnlyMonster), {
  ok: true,
  changedPaths: ["cooldownTurns"],
});
assert.equal(verifyBuilderDataCacheOnlyChanges(builderBefore, builderAfter).ok, true);
assert.deepEqual(input, inputSnapshot, "All guarded-apply fixtures must leave source inputs unmutated.");

console.log(JSON.stringify({
  passed: true,
  assertions: [
    "dry-run default and guarded CLI confirmation/hash contract",
    "stable plan hashes across ordering and sensitivity to stored/target values",
    "UNRESOLVED, semantic-integrity, stored-drift, tuning-drift, and zero-change refusals",
    "correct confirmation and plan hash permit mocked transaction entry",
    "monster and character cache-only changed paths",
    "all-or-nothing mocked rollback for monster and character failures",
    "stable dry-run and explicit apply-result human output",
    "input immutability",
  ],
}, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
