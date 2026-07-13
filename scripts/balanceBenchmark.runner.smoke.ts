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
  axesDefault.selected.every((suite) => suite.compatibility !== "PARTIAL"),
  "PARTIAL suites must be excluded by default.",
);
assert.equal(
  axesDefault.skipped.filter(({ suite }) => suite.compatibility === "PARTIAL").length,
  4,
  "All four authority-stale axis audits must be explicitly skipped.",
);

const axesPartial = selectSuites({ mode: "axes", includePartial: true });
assert.equal(
  axesPartial.selected.filter((suite) => suite.compatibility === "PARTIAL").length,
  4,
  "--include-partial must include all four partial axis audits.",
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
  "outcome-calculator-smoke",
  "character-power-builder-smoke",
]) {
  assert.ok(quick.selected.some((suite) => suite.id === requiredId), `quick mode omitted ${requiredId}`);
}

function changed(path: string) {
  return selectSuites({ mode: "changed", includePartial: false, changedPaths: [path] });
}

assert.ok(changed("lib/summoning/powerCostResolver.ts").selected.some((suite) => suite.id === "power-cost-resolver-smoke"));
assert.ok(changed("lib/summoning/resolvePowerCooldownAuthority.ts").selected.some((suite) => suite.id === "power-cooldown-authority-smoke"));
assert.ok(changed("lib/summoning/resolvePowerCooldownAuthority.ts").selected.some((suite) => suite.id === "outcome-calculator-smoke"));
assert.ok(changed("lib/calculators/monsterOutcomeCalculator.ts").selected.some((suite) => suite.id === "outcome-calculator-smoke"));
assert.ok(changed("lib/combat-lab/actionResolver.ts").selected.some((suite) => suite.id === "combat-lab-smoke"));
assert.equal(changed("docs/balance/note.md").selected.length, 0, "Documentation-only changes may select no suites.");
const unknown = changed("app/unmapped-production-path.ts");
assert.equal(unknown.selected.length, 0);
assert.deepEqual(unknown.warnings, ["Unmapped production path: app/unmapped-production-path.ts"]);

const duplicate = selectSuites({
  mode: "quick",
  suiteIds: ["power-cost-resolver-smoke", "power-cost-resolver-smoke"],
  includePartial: false,
});
assert.deepEqual(duplicate.selected.map((suite) => suite.id), ["power-cost-resolver-smoke"]);

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
