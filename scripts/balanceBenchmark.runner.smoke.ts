import assert from "node:assert/strict";

import {
  BALANCE_BENCHMARK_REGISTRY,
  registryFamilies,
} from "./balanceBenchmark.registry";
import {
  BALANCE_BENCHMARK_SCHEMA_VERSION,
  COMPATIBILITY_STATES,
  assertBalanceBenchmarkReport,
  type BalanceBenchmarkReport,
  type RepositoryProvenance,
  type RunnableSuiteDefinition,
  type TuningProvenance,
} from "./balanceBenchmark.schema";
import {
  createProgressWriter,
  executeSuite,
  renderHumanReport,
  selectSuites,
  verifySuiteCommand,
} from "./balanceBenchmark.runner";

const cwd = process.cwd();
const monsterReconciliationId = "power-cooldown-cache-reconciliation-monsters";
const characterReconciliationId = "power-cooldown-cache-reconciliation-characters";
const reconciliationIds = [monsterReconciliationId, characterReconciliationId] as const;

const repository: RepositoryProvenance = {
  root: cwd,
  branch: "smoke",
  commitSha: "0000000000000000000000000000000000000000",
  originMainSha: null,
  ahead: 0,
  behind: 0,
  dirtyPaths: [],
  stagedPaths: [],
  untrackedPaths: [],
  selectedBase: null,
};

const tuning: TuningProvenance = {
  power: null,
  combat: null,
  outcomeNormalization: null,
  warning: "Smoke fixture intentionally omits DB tuning provenance.",
};

const readOnly = {
  classification: "READ_ONLY" as const,
  declaredReadOnly: true as const,
  databaseAccess: "none" as const,
  databaseWrites: false as const,
  assetWrites: false as const,
  tuningWrites: false as const,
  baselineWrites: false as const,
  repositoryWrites: false as const,
  rationale: "In-memory smoke fixture launches only the Node executable.",
};

function fixtureSuite(
  overrides: Partial<RunnableSuiteDefinition> & Pick<RunnableSuiteDefinition, "id" | "arguments">,
): RunnableSuiteDefinition {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    family: overrides.family ?? "Core resolver and cooldown authority",
    description: overrides.description ?? "Runner execution smoke fixture.",
    compatibility: overrides.compatibility ?? "AVAILABLE",
    modes: overrides.modes ?? ["quick"],
    command: overrides.command ?? process.execPath,
    arguments: overrides.arguments,
    deterministicSeeds: overrides.deterministicSeeds ?? [],
    mutationSafety: overrides.mutationSafety ?? readOnly,
    timeoutMs: overrides.timeoutMs ?? 5_000,
    changedPathPatterns: overrides.changedPathPatterns ?? [],
    failureSeverity: overrides.failureSeverity ?? "REGRESSION",
    supportsJson: overrides.supportsJson ?? false,
    baselinePolicy: overrides.baselinePolicy ?? {
      kind: "SELF_ASSERTING",
      acceptedReference: "Smoke fixture exit code",
      extraction: "EXIT_CODE",
      notes: "Used only by the runner smoke test.",
    },
    notes: overrides.notes ?? [],
  };
}

async function main(): Promise<void> {
const suiteIds = BALANCE_BENCHMARK_REGISTRY.map((suite) => suite.id);
assert.equal(new Set(suiteIds).size, suiteIds.length, "Registry suite IDs must be unique.");
assert.equal(registryFamilies().length, 11, "All eleven contract families must be represented.");

for (const suite of BALANCE_BENCHMARK_REGISTRY) {
  assert.ok(
    COMPATIBILITY_STATES.includes(suite.compatibility),
    `${suite.id} has an invalid compatibility state.`,
  );
  assert.equal(
    verifySuiteCommand(suite, cwd),
    null,
    `${suite.id} must reference an existing command/script unless explicitly MISSING.`,
  );
  if (suite.mutationSafety.classification === "READ_ONLY") {
    assert.equal(suite.mutationSafety.declaredReadOnly, true, `${suite.id} lacks an explicit declaration.`);
    assert.equal(suite.mutationSafety.databaseWrites, false);
    assert.equal(suite.mutationSafety.assetWrites, false);
    assert.equal(suite.mutationSafety.tuningWrites, false);
    assert.equal(suite.mutationSafety.baselineWrites, false);
    assert.equal(suite.mutationSafety.repositoryWrites, false);
    assert.ok(suite.mutationSafety.rationale.length > 0);
  }
  if (suite.supportsJson) {
    assert.ok(suite.arguments.includes("--json"), `${suite.id} claims JSON support without --json.`);
  }
}

const explicitSynergy = selectSuites({
  mode: "full",
  suiteIds: ["synergy-reconciliation"],
  includePartial: true,
});
assert.equal(explicitSynergy.selected.length, 0, "Incompatible Synergy must never be executable.");
assert.deepEqual(explicitSynergy.skipped.map(({ suite }) => suite.id), ["synergy-reconciliation"]);

const axesDefault = selectSuites({ mode: "axes", includePartial: false });
assert.ok(axesDefault.selected.some((suite) => suite.id === "power-threat-monotonic-smoke"));
assert.ok(
  axesDefault.selected.some((suite) => suite.id === "control-pressure-axis-reconciliation"),
  "AVAILABLE Control Pressure reconciliation must run in axes mode without --include-partial.",
);
assert.ok(
  axesDefault.selected.every((suite) => suite.compatibility !== "PARTIAL"),
  "PARTIAL suites must be excluded by default.",
);
assert.equal(
  axesDefault.skipped.filter(({ suite }) => suite.compatibility === "PARTIAL").length,
  3,
  "The three remaining authority-stale axis audits must be explicitly skipped.",
);

const axesPartial = selectSuites({ mode: "axes", includePartial: true });
assert.equal(
  axesPartial.selected.filter((suite) => suite.compatibility === "PARTIAL").length,
  3,
  "--include-partial must include the three remaining partial axis audits.",
);
assert.ok(
  axesPartial.selected.every((suite) => suite.compatibility !== "AVAILABLE_BUT_INCOMPATIBLE"),
  "--include-partial must never include incompatible suites.",
);

const quick = selectSuites({ mode: "quick", includePartial: false });
for (const requiredId of [
  "project-typecheck",
  "power-cost-resolver-smoke",
  "power-cooldown-authority-smoke",
  "power-cooldown-cache-synchronization-smoke",
  "outcome-calculator-smoke",
  "character-power-builder-smoke",
  "augment-debuff-three-field-semantic-smoke",
  "augment-debuff-economics-smoke",
]) {
  assert.ok(quick.selected.some((suite) => suite.id === requiredId), `quick mode omitted ${requiredId}`);
}
assert.equal(quick.selected.length, 8, "quick mode must contain the eight available baseline suites.");
for (const reconciliationId of reconciliationIds) {
  assert.equal(
    quick.selected.some((suite) => suite.id === reconciliationId),
    false,
    `${reconciliationId} must remain excluded from quick mode.`,
  );
}
const full = selectSuites({ mode: "full", includePartial: false });
assert.ok(
  full.selected.some((suite) => suite.id === "augment-debuff-three-field-semantic-smoke"),
  "full mode omitted augment-debuff-three-field-semantic-smoke",
);
assert.ok(
  full.selected.some((suite) => suite.id === "augment-debuff-economics-smoke"),
  "full mode omitted augment-debuff-economics-smoke",
);
for (const reconciliationId of reconciliationIds) {
  const suite = BALANCE_BENCHMARK_REGISTRY.find((candidate) => candidate.id === reconciliationId);
  assert.ok(suite, `${reconciliationId} must be uniquely registered.`);
  assert.equal(suite?.compatibility, "AVAILABLE");
  assert.equal(suite?.mutationSafety.classification, "READ_ONLY");
  assert.equal(suite?.mutationSafety.declaredReadOnly, true);
  assert.equal(suite?.mutationSafety.databaseAccess, "read-only");
  assert.deepEqual(suite?.modes, ["full", "changed"]);
  assert.ok(suite?.notes.some((note) => /apply capability.*never supplies --apply/i.test(note)));
  assert.ok(full.selected.some((candidate) => candidate.id === reconciliationId));
}

function changed(path: string) {
  return selectSuites({ mode: "changed", includePartial: false, changedPaths: [path] });
}

assert.ok(changed("lib/summoning/powerCostResolver.ts").selected.some((suite) => suite.id === "power-cost-resolver-smoke"));
assert.ok(changed("lib/summoning/resolvePowerCooldownAuthority.ts").selected.some((suite) => suite.id === "power-cooldown-authority-smoke"));
assert.ok(changed("lib/summoning/resolvePowerCooldownAuthority.ts").selected.some((suite) => suite.id === "outcome-calculator-smoke"));
for (const path of [
  "lib/summoning/powerCooldownCacheSynchronization.ts",
  "app/api/summoning-circle/monsters/route.ts",
  "app/api/summoning-circle/monsters/[id]/route.ts",
  "app/api/summoning-circle/monsters/[id]/copy/route.ts",
  "app/api/campaigns/[id]/characters/[characterId]/builder/route.ts",
  "lib/characterBuilder/powers.ts",
]) {
  const selection = changed(path);
  assert.ok(
    selection.selected.some((suite) => suite.id === "power-cooldown-cache-synchronization-smoke"),
    `${path} must select the cooldown-cache synchronization smoke.`,
  );
  assert.ok(
    selection.selected.some((suite) => suite.id === "project-typecheck"),
    `${path} must select project typecheck.`,
  );
  assert.ok(
    selection.selected.some((suite) => suite.id === "power-cooldown-authority-smoke"),
    `${path} must select cooldown authority coverage.`,
  );
  assert.ok(
    selection.selected.some((suite) => suite.id === "power-cost-resolver-smoke"),
    `${path} must select power-cost resolver coverage.`,
  );
}
for (const path of [
  "lib/summoning/powerCooldownCacheSynchronization.ts",
  "lib/summoning/resolvePowerCooldownAuthority.ts",
  "scripts/powerCooldownCacheReconciliation.shared.ts",
  "scripts/powerCooldownCacheReconciliation.apply.ts",
  "scripts/powerCooldownCacheReconciliation.smoke.ts",
]) {
  const selection = changed(path);
  assert.ok(selection.selected.some((suite) => suite.id === monsterReconciliationId));
  assert.ok(selection.selected.some((suite) => suite.id === characterReconciliationId));
}
for (const path of [
  "app/api/summoning-circle/monsters/route.ts",
  "scripts/reconcileMonsterPowerCooldownCaches.ts",
]) {
  const selection = changed(path);
  assert.ok(selection.selected.some((suite) => suite.id === monsterReconciliationId));
  assert.equal(selection.selected.some((suite) => suite.id === characterReconciliationId), false);
}
for (const path of [
  "app/api/campaigns/[id]/characters/[characterId]/builder/route.ts",
  "lib/characterBuilder/powers.ts",
  "scripts/reconcileCharacterPowerCooldownCaches.ts",
]) {
  const selection = changed(path);
  assert.ok(selection.selected.some((suite) => suite.id === characterReconciliationId));
  assert.equal(selection.selected.some((suite) => suite.id === monsterReconciliationId), false);
}
for (const path of [
  "lib/summoning/powerCooldownCacheSynchronization.ts",
  "app/api/campaigns/[id]/characters/[characterId]/builder/route.ts",
  "lib/characterBuilder/powers.ts",
]) {
  assert.ok(
    changed(path).selected.some((suite) => suite.id === "character-power-builder-smoke"),
    `${path} must select Character Builder power coverage.`,
  );
}
assert.ok(changed("lib/calculators/monsterOutcomeCalculator.ts").selected.some((suite) => suite.id === "outcome-calculator-smoke"));
assert.ok(changed("lib/combat-lab/actionResolver.ts").selected.some((suite) => suite.id === "combat-lab-smoke"));
for (const path of [
  "prisma/schema.prisma",
  "prisma/migrations/20260714120000_add_effect_packet_modifier/migration.sql",
  "lib/summoning/validation.ts",
  "app/api/summoning-circle/monsters/[id]/copy/route.ts",
  "lib/characterBuilder/powers.ts",
  "app/api/campaigns/[id]/characters/[characterId]/builder/route.ts",
  "lib/combat-lab/powerAdapter.ts",
  "lib/combat-lab/actionResolver.ts",
  "lib/combat-lab/combatState.ts",
  "lib/combat-lab/liveAdapters.ts",
  "scripts/augmentDebuffThreeFieldSemantic.smoke.ts",
]) {
  const selection = changed(path);
  assert.ok(
    selection.selected.some((suite) => suite.id === "augment-debuff-three-field-semantic-smoke"),
    `${path} must select the focused Augment/Debuff semantic smoke.`,
  );
}
const semanticSuite = BALANCE_BENCHMARK_REGISTRY.find(
  (suite) => suite.id === "augment-debuff-three-field-semantic-smoke",
);
assert.equal(semanticSuite?.compatibility, "AVAILABLE");
assert.equal(semanticSuite?.mutationSafety.classification, "READ_ONLY");
assert.equal(semanticSuite?.mutationSafety.databaseAccess, "none");
const economicsSuite = BALANCE_BENCHMARK_REGISTRY.find(
  (suite) => suite.id === "augment-debuff-economics-smoke",
);
assert.equal(economicsSuite?.compatibility, "AVAILABLE");
assert.equal(economicsSuite?.mutationSafety.classification, "READ_ONLY");
assert.equal(economicsSuite?.mutationSafety.declaredReadOnly, true);
assert.equal(economicsSuite?.mutationSafety.databaseAccess, "none");
assert.equal(economicsSuite?.mutationSafety.databaseWrites, false);
for (const path of [
  "lib/summoning/augmentDebuffEconomics.ts",
  "lib/summoning/powerCostResolver.ts",
  "lib/config/powerTuningShared.ts",
  "lib/config/powerTuningAdminMetadata.ts",
  "scripts/augmentDebuffEconomics.smoke.ts",
]) {
  assert.ok(
    changed(path).selected.some((suite) => suite.id === "augment-debuff-economics-smoke"),
    `${path} must select the focused Augment/Debuff economics smoke.`,
  );
}
const phase2BResolverSelection = changed("lib/summoning/powerCostResolver.ts");
for (const requiredSuite of [
  "power-cost-resolver-smoke",
  "power-cooldown-authority-smoke",
  "augment-debuff-three-field-semantic-smoke",
  "augment-debuff-economics-smoke",
]) {
  assert.ok(
    phase2BResolverSelection.selected.some((suite) => suite.id === requiredSuite),
    `Phase 2B resolver changes must select ${requiredSuite}.`,
  );
}
assert.equal(
  changed("lib/characterBuilder/roleplayAbilities.ts").selected.some(
    (suite) => suite.id === "augment-debuff-economics-smoke",
  ),
  false,
  "Unrelated Roleplay code must not select the economics smoke.",
);
const controlPressureSuite = BALANCE_BENCHMARK_REGISTRY.find(
  (suite) => suite.id === "control-pressure-axis-reconciliation",
);
const synergySuite = BALANCE_BENCHMARK_REGISTRY.find(
  (suite) => suite.id === "synergy-reconciliation",
);
const mobilitySuite = BALANCE_BENCHMARK_REGISTRY.find(
  (suite) => suite.id === "mobility-reconciliation",
);
assert.equal(controlPressureSuite?.compatibility, "AVAILABLE");
assert.equal(synergySuite?.compatibility, "AVAILABLE_BUT_INCOMPATIBLE");
assert.equal(mobilitySuite?.compatibility, "MISSING");
assert.deepEqual(mobilitySuite?.modes, ["full", "changed"]);
for (const path of [
  "lib/combat-lab/actionResolver.ts",
  "lib/calculators/monsterOutcomeCalculator.ts",
  "scripts/monsterOutcomeCalculator.smoke.ts",
  "scripts/balanceAudit.summoningCircleControlPressureReconciliation.ts",
]) {
  const selection = changed(path);
  assert.ok(
    selection.selected.some((suite) => suite.id === "control-pressure-axis-reconciliation"),
    `${path} must select the AVAILABLE Control Pressure reconciliation.`,
  );
}
assert.equal(changed("docs/balance/note.md").selected.length, 0, "Documentation-only changes may select no suites.");
const roleplaySelection = changed("lib/characterBuilder/roleplayAbilities.ts");
assert.equal(
  roleplaySelection.selected.some((suite) => suite.id === "power-cooldown-cache-synchronization-smoke"),
  false,
  "Unrelated Roleplay code must not select the cooldown-cache synchronization smoke.",
);
assert.ok(
  roleplaySelection.selected.some((suite) => suite.id === "character-power-builder-smoke"),
  "Existing broad Character Builder mapping may still select its own suite for Roleplay code.",
);
assert.ok(
  roleplaySelection.selected.every((suite) => !reconciliationIds.includes(suite.id as typeof reconciliationIds[number])),
  "Unrelated Roleplay code must select neither reconciliation suite.",
);
const unknown = changed("app/unmapped-production-path.ts");
assert.equal(unknown.selected.length, 0);
assert.deepEqual(unknown.warnings, ["Unmapped production path: app/unmapped-production-path.ts"]);

const duplicate = selectSuites({
  mode: "quick",
  suiteIds: ["power-cost-resolver-smoke", "power-cost-resolver-smoke"],
  includePartial: false,
});
assert.deepEqual(duplicate.selected.map((suite) => suite.id), ["power-cost-resolver-smoke"]);

const synchronizationDuplicate = selectSuites({
  mode: "changed",
  includePartial: false,
  changedPaths: [
    "lib/summoning/powerCooldownCacheSynchronization.ts",
    "app/api/summoning-circle/monsters/route.ts",
  ],
});
assert.equal(
  synchronizationDuplicate.selected.filter((suite) => suite.id === "power-cooldown-cache-synchronization-smoke").length,
  1,
  "Changed-path overlap must not duplicate the synchronization suite.",
);
const reconciliationDuplicate = selectSuites({
  mode: "changed",
  includePartial: false,
  changedPaths: [
    "lib/summoning/powerCooldownCacheSynchronization.ts",
    "lib/summoning/resolvePowerCooldownAuthority.ts",
  ],
});
for (const reconciliationId of reconciliationIds) {
  assert.equal(
    reconciliationDuplicate.selected.filter((suite) => suite.id === reconciliationId).length,
    1,
    `${reconciliationId} must remain deduplicated across overlapping path mappings.`,
  );
}
assert.ok(
  BALANCE_BENCHMARK_REGISTRY.every((suite) => !suite.arguments.includes("--apply")),
  "No benchmark command may register an apply mode.",
);
const synchronizationSuite = BALANCE_BENCHMARK_REGISTRY.find(
  (suite) => suite.id === "power-cooldown-cache-synchronization-smoke",
);
assert.ok(synchronizationSuite, "Synchronization suite must be registered.");
assert.equal(synchronizationSuite?.mutationSafety.classification, "READ_ONLY");
assert.equal(synchronizationSuite?.mutationSafety.declaredReadOnly, true);
assert.equal(synchronizationSuite?.mutationSafety.databaseWrites, false);

const unsafeReconciliation = await executeSuite({
  suite: fixtureSuite({
    id: "power-cooldown-cache-reconciliation-future-unsafe-fixture",
    arguments: ["-e", "process.exit(0)"],
    mutationSafety: {
      classification: "UNKNOWN",
      declaredReadOnly: false,
      databaseAccess: "unknown",
      rationale: "Deliberately missing an explicit READ_ONLY declaration.",
    },
  }),
  repository,
  tuning,
  cwd,
  progress: () => undefined,
});
assert.equal(unsafeReconciliation.status, "ERROR");
assert.equal(unsafeReconciliation.severity, "BLOCKER");
assert.match(unsafeReconciliation.error ?? "", /explicit READ_ONLY mutation-safety declaration/);

const commandFailure = await executeSuite({
  suite: fixtureSuite({
    id: "fixture-regression",
    arguments: ["-e", "process.exit(7)"],
    failureSeverity: "REGRESSION",
  }),
  repository,
  tuning,
  cwd,
  progress: () => undefined,
});
assert.equal(commandFailure.status, "FAIL");
assert.equal(commandFailure.severity, "REGRESSION");
assert.equal(commandFailure.exitCode, 7);

const timeout = await executeSuite({
  suite: fixtureSuite({
    id: "fixture-timeout",
    arguments: ["-e", "setTimeout(() => undefined, 10000)"],
    timeoutMs: 40,
  }),
  repository,
  tuning,
  cwd,
  progress: () => undefined,
});
assert.equal(timeout.status, "ERROR");
assert.equal(timeout.severity, "BLOCKER");
assert.match(timeout.error ?? "", /timeout/i);

const partialSuccess = await executeSuite({
  suite: fixtureSuite({
    id: "fixture-partial",
    compatibility: "PARTIAL",
    arguments: ["-e", "process.exit(0)"],
    failureSeverity: "WARNING",
  }),
  repository,
  tuning,
  cwd,
  progress: () => undefined,
});
assert.equal(partialSuccess.status, "WARNING", "PARTIAL evidence must never be reported as PASS.");

const report: BalanceBenchmarkReport = {
  schemaVersion: BALANCE_BENCHMARK_SCHEMA_VERSION,
  mode: "quick",
  startedAt: commandFailure.startedAt,
  endedAt: timeout.endedAt,
  durationMs: commandFailure.durationMs + timeout.durationMs,
  repository,
  tuning,
  changedPaths: [],
  selectedSuiteIds: [commandFailure.suiteId, timeout.suiteId],
  skippedSuiteIds: [],
  overallStatus: "ERROR",
  highestSeverity: "BLOCKER",
  suiteResults: [commandFailure, timeout],
  summaryCounts: { PASS: 0, FAIL: 1, WARNING: 0, SKIPPED: 0, ERROR: 1 },
  warnings: [],
};
const serialized: unknown = JSON.parse(JSON.stringify(report));
assertBalanceBenchmarkReport(serialized);

const humanFixture = structuredClone(report);
humanFixture.suiteResults[0].stdout = "{ deliberately-not-parsed human output";
assert.doesNotThrow(() => renderHumanReport(humanFixture));

const stdoutChunks: string[] = [];
const stderrChunks: string[] = [];
const jsonProgress = createProgressWriter(true, {
  stdout: { write: (chunk) => stdoutChunks.push(chunk) },
  stderr: { write: (chunk) => stderrChunks.push(chunk) },
});
jsonProgress("fixture progress");
assert.deepEqual(stdoutChunks, [], "JSON-mode progress must not contaminate stdout.");
assert.match(stderrChunks.join(""), /fixture progress/);

console.log(
  JSON.stringify(
    {
      passed: true,
      suiteCount: suiteIds.length,
      familyCount: registryFamilies().length,
      assertions: [
        "unique suite IDs and valid compatibility states",
        "registered command/script existence",
        "explicit mutation-safety declarations",
        "incompatible Synergy exclusion",
        "PARTIAL default exclusion and deliberate inclusion",
        "required quick-mode selection",
        "representative changed-path mappings and unmapped warning",
        "duplicate selection de-duplication",
        "reconciliation full/changed selection and quick exclusion",
        "reconciliation READ_ONLY enforcement and apply-command exclusion",
        "regression and timeout classification",
        "PARTIAL success remains WARNING",
        "report JSON schema validation",
        "human output independence from suite stdout parsing",
        "JSON progress isolation",
      ],
    },
    null,
    2,
  ),
);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
