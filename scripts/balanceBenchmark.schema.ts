export const BALANCE_BENCHMARK_SCHEMA_VERSION = "1.0.0" as const;

export const RUNNER_MODES = ["quick", "axes", "runtime", "full", "changed"] as const;
export type RunnerMode = (typeof RUNNER_MODES)[number];

export const COMPATIBILITY_STATES = [
  "AVAILABLE",
  "AVAILABLE_BUT_INCOMPATIBLE",
  "PARTIAL",
  "MISSING",
] as const;
export type CompatibilityState = (typeof COMPATIBILITY_STATES)[number];

export const RESULT_STATUSES = ["PASS", "FAIL", "WARNING", "SKIPPED", "ERROR"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const FAILURE_SEVERITIES = [
  "BLOCKER",
  "REGRESSION",
  "WARNING",
  "INFORMATIONAL",
  "SKIPPED_INCOMPATIBLE",
] as const;
export type FailureSeverity = (typeof FAILURE_SEVERITIES)[number];

export const BENCHMARK_FAMILIES = [
  "Core resolver and cooldown authority",
  "Combat Lab runtime",
  "Character Builder powers",
  "Outcome Calculator smoke",
  "Threat reconciliation",
  "Durability reconciliation",
  "Pressure reconciliation",
  "Control Pressure reconciliation",
  "Shared success-scaled effect grids",
  "Synergy reconciliation",
  "Mobility reconciliation",
] as const;
export type BenchmarkFamily = (typeof BENCHMARK_FAMILIES)[number];

export type JsonObject = Record<string, unknown>;

export type MutationSafetyDeclaration =
  | {
      classification: "READ_ONLY";
      declaredReadOnly: true;
      databaseAccess: "none" | "read-only";
      databaseWrites: false;
      assetWrites: false;
      tuningWrites: false;
      baselineWrites: false;
      repositoryWrites: false;
      rationale: string;
    }
  | {
      classification: "UNSAFE" | "UNKNOWN";
      declaredReadOnly: false;
      databaseAccess: "none" | "read-only" | "unknown";
      rationale: string;
    };

export type BaselinePolicy = {
  kind: "SELF_ASSERTING" | "STRUCTURED_OUTPUT" | "COMMAND_ONLY" | "NONE";
  acceptedReference: string | null;
  extraction: "EXIT_CODE" | "STABLE_JSON" | "UNAVAILABLE";
  notes: string;
};

type SuiteDefinitionBase = {
  id: string;
  title: string;
  family: BenchmarkFamily;
  description: string;
  modes: RunnerMode[];
  arguments: string[];
  deterministicSeeds: number[];
  mutationSafety: MutationSafetyDeclaration;
  timeoutMs: number;
  changedPathPatterns: string[];
  failureSeverity: FailureSeverity;
  supportsJson: boolean;
  baselinePolicy: BaselinePolicy;
  notes: string[];
};

export type RunnableSuiteDefinition = SuiteDefinitionBase & {
  compatibility: Exclude<CompatibilityState, "MISSING">;
  command: string;
};

export type MissingSuiteDefinition = SuiteDefinitionBase & {
  compatibility: "MISSING";
  command: null;
};

export type SuiteDefinition = RunnableSuiteDefinition | MissingSuiteDefinition;

export type DatabaseProvenance = {
  access: "none" | "read-only" | "unknown";
  source?: string;
};

export type CampaignProvenance = {
  id: string | null;
  name: string | null;
  assetSource: string | null;
};

export type TuningSetProvenance = {
  id: string;
  name: string | null;
  updatedAt: string;
};

export type TuningProvenance = {
  power: TuningSetProvenance | null;
  combat: TuningSetProvenance | null;
  outcomeNormalization: TuningSetProvenance | null;
  warning: string | null;
};

export type RepositoryProvenance = {
  root: string;
  branch: string;
  commitSha: string;
  originMainSha: string | null;
  ahead: number | null;
  behind: number | null;
  dirtyPaths: string[];
  stagedPaths: string[];
  untrackedPaths: string[];
  selectedBase: string | null;
};

export type SuiteResult = {
  suiteId: string;
  status: ResultStatus;
  severity: FailureSeverity;
  command: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  commitSha: string;
  branch: string;
  tuningSetId: string | null;
  tuningUpdatedAt: string | null;
  databaseProvenance: DatabaseProvenance;
  campaignProvenance: CampaignProvenance | null;
  deterministicSeeds: number[];
  baselineValues: JsonObject;
  observedValues: JsonObject;
  tolerances: Record<string, number | string>;
  changedAxes: string[];
  mutationSafety: MutationSafetyDeclaration;
  warnings: string[];
  stdout: string;
  stderr: string;
  error: string | null;
};

export type ReportSummaryCounts = {
  PASS: number;
  FAIL: number;
  WARNING: number;
  SKIPPED: number;
  ERROR: number;
};

export type BalanceBenchmarkReport = {
  schemaVersion: typeof BALANCE_BENCHMARK_SCHEMA_VERSION;
  mode: RunnerMode;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  repository: RepositoryProvenance;
  tuning: TuningProvenance;
  changedPaths: string[];
  selectedSuiteIds: string[];
  skippedSuiteIds: string[];
  overallStatus: "PASS" | "FAIL" | "ERROR";
  highestSeverity: FailureSeverity;
  suiteResults: SuiteResult[];
  summaryCounts: ReportSummaryCounts;
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string";
}

function hasNumber(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "number" && Number.isFinite(record[key]);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function validateBalanceBenchmarkReport(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["report must be an object"];
  if (value.schemaVersion !== BALANCE_BENCHMARK_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${BALANCE_BENCHMARK_SCHEMA_VERSION}`);
  }
  if (!RUNNER_MODES.includes(value.mode as RunnerMode)) errors.push("mode is invalid");
  for (const key of ["startedAt", "endedAt"] as const) {
    if (!hasString(value, key)) errors.push(`${key} must be a string`);
  }
  if (!hasNumber(value, "durationMs")) errors.push("durationMs must be a finite number");
  if (!isRecord(value.repository)) errors.push("repository must be an object");
  if (!isRecord(value.tuning)) errors.push("tuning must be an object");
  for (const key of ["changedPaths", "selectedSuiteIds", "skippedSuiteIds", "warnings"] as const) {
    if (!isStringArray(value[key])) errors.push(`${key} must be a string array`);
  }
  if (!isRecord(value.summaryCounts)) errors.push("summaryCounts must be an object");
  if (!Array.isArray(value.suiteResults)) {
    errors.push("suiteResults must be an array");
  } else {
    value.suiteResults.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push(`suiteResults[${index}] must be an object`);
        return;
      }
      if (!hasString(entry, "suiteId")) errors.push(`suiteResults[${index}].suiteId is invalid`);
      if (!RESULT_STATUSES.includes(entry.status as ResultStatus)) {
        errors.push(`suiteResults[${index}].status is invalid`);
      }
      if (!FAILURE_SEVERITIES.includes(entry.severity as FailureSeverity)) {
        errors.push(`suiteResults[${index}].severity is invalid`);
      }
      if (!hasString(entry, "command")) errors.push(`suiteResults[${index}].command is invalid`);
      if (!hasNumber(entry, "durationMs")) errors.push(`suiteResults[${index}].durationMs is invalid`);
      if (!isStringArray(entry.warnings)) errors.push(`suiteResults[${index}].warnings is invalid`);
      if (!isRecord(entry.mutationSafety)) {
        errors.push(`suiteResults[${index}].mutationSafety is invalid`);
      }
    });
  }
  return errors;
}

export function assertBalanceBenchmarkReport(value: unknown): asserts value is BalanceBenchmarkReport {
  const errors = validateBalanceBenchmarkReport(value);
  if (errors.length > 0) throw new Error(`Invalid balance benchmark report: ${errors.join("; ")}`);
}
