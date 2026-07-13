import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";

import {
  BALANCE_BENCHMARK_REGISTRY,
  getSuiteById,
  registryFamilies,
  suitesForMode,
} from "./balanceBenchmark.registry";
import {
  BALANCE_BENCHMARK_SCHEMA_VERSION,
  FAILURE_SEVERITIES,
  RESULT_STATUSES,
  RUNNER_MODES,
  assertBalanceBenchmarkReport,
  type BalanceBenchmarkReport,
  type FailureSeverity,
  type JsonObject,
  type ReportSummaryCounts,
  type RepositoryProvenance,
  type RunnerMode,
  type SuiteDefinition,
  type SuiteResult,
  type TuningProvenance,
} from "./balanceBenchmark.schema";

export type CliOptions = {
  mode: RunnerMode;
  json: boolean;
  list: boolean;
  suiteIds: string[];
  base: string | null;
  includePartial: boolean;
  failFast: boolean;
  help: boolean;
};

export type SuiteSelection = {
  selected: SuiteDefinition[];
  skipped: Array<{ suite: SuiteDefinition; reason: string }>;
  warnings: string[];
};

type OutputStreams = {
  stdout: { write: (chunk: string) => unknown };
  stderr: { write: (chunk: string) => unknown };
};

type ExecuteSuiteOptions = {
  suite: SuiteDefinition;
  repository: RepositoryProvenance;
  tuning: TuningProvenance;
  cwd: string;
  progress: (message: string) => void;
};

type ChangedPathCollection = {
  base: string | null;
  paths: string[];
  warnings: string[];
};

const activeChildren = new Set<ChildProcess>();
let interrupted = false;

const severityRank: Record<FailureSeverity, number> = {
  INFORMATIONAL: 0,
  SKIPPED_INCOMPATIBLE: 1,
  WARNING: 2,
  REGRESSION: 3,
  BLOCKER: 4,
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function quoteArgument(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value);
}

export function formatSuiteCommand(suite: SuiteDefinition): string {
  if (suite.command === null) return "<missing>";
  return [suite.command, ...suite.arguments].map(quoteArgument).join(" ");
}

function runGit(cwd: string, arguments_: string[], allowFailure = false): string {
  const result = spawnSync("git", arguments_, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  if (result.status !== 0) {
    if (allowFailure) return "";
    throw new Error((result.stderr || `git ${arguments_.join(" ")} failed`).trim());
  }
  return result.stdout.trim();
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function repositoryStatusSnapshot(cwd: string): string[] {
  return lines(runGit(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]));
}

function parseDivergence(value: string): { behind: number | null; ahead: number | null } {
  const [behindText, aheadText] = value.trim().split(/\s+/);
  const behind = Number(behindText);
  const ahead = Number(aheadText);
  return {
    behind: Number.isFinite(behind) ? behind : null,
    ahead: Number.isFinite(ahead) ? ahead : null,
  };
}

export function collectRepositoryProvenance(cwd: string, selectedBase: string | null): RepositoryProvenance {
  const root = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  const originMainSha = runGit(root, ["rev-parse", "origin/main"], true) || null;
  const divergence = originMainSha
    ? parseDivergence(runGit(root, ["rev-list", "--left-right", "--count", "origin/main...HEAD"]))
    : { behind: null, ahead: null };
  const stagedPaths = lines(runGit(root, ["diff", "--cached", "--name-only"])).map(normalizePath);
  const unstagedPaths = lines(runGit(root, ["diff", "--name-only"])).map(normalizePath);
  const untrackedPaths = lines(
    runGit(root, ["ls-files", "--others", "--exclude-standard"]),
  ).map(normalizePath);
  return {
    root: normalize(root),
    branch: runGit(root, ["branch", "--show-current"]) || "DETACHED",
    commitSha: runGit(root, ["rev-parse", "HEAD"]),
    originMainSha,
    ahead: divergence.ahead,
    behind: divergence.behind,
    dirtyPaths: unique([...stagedPaths, ...unstagedPaths, ...untrackedPaths]),
    stagedPaths: unique(stagedPaths),
    untrackedPaths: unique(untrackedPaths),
    selectedBase,
  };
}

export function collectChangedPaths(
  cwd: string,
  requestedBase: string | null,
): ChangedPathCollection {
  const warnings: string[] = [];
  let base: string | null = null;
  if (requestedBase) {
    base = runGit(cwd, ["rev-parse", "--verify", `${requestedBase}^{commit}`], true) || null;
    if (!base) throw new Error(`Unable to resolve --base ${requestedBase}`);
  } else {
    base = runGit(cwd, ["merge-base", "origin/main", "HEAD"], true) || null;
    if (!base) warnings.push("Unable to determine merge-base with origin/main; committed changes were omitted.");
  }

  const committed = base
    ? lines(runGit(cwd, ["diff", "--name-only", `${base}...HEAD`])).map(normalizePath)
    : [];
  const staged = lines(runGit(cwd, ["diff", "--cached", "--name-only"])).map(normalizePath);
  const unstaged = lines(runGit(cwd, ["diff", "--name-only"])).map(normalizePath);
  const untracked = lines(runGit(cwd, ["ls-files", "--others", "--exclude-standard"])).map(
    normalizePath,
  );
  return { base, paths: unique([...committed, ...staged, ...unstaged, ...untracked]), warnings };
}

function globToRegExp(pattern: string): RegExp {
  const normalizedPattern = normalizePath(pattern);
  let expression = "";
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    if (character === "*") {
      if (normalizedPattern[index + 1] === "*") {
        expression += ".*";
        index += 1;
      } else {
        expression += "[^/]*";
      }
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`^${expression}$`);
}

export function pathMatchesPattern(path: string, pattern: string): boolean {
  return globToRegExp(pattern).test(normalizePath(path));
}

function suiteMatchesChangedPaths(suite: SuiteDefinition, changedPaths: string[]): boolean {
  return changedPaths.some((path) =>
    suite.changedPathPatterns.some((pattern) => pathMatchesPattern(path, pattern)),
  );
}

function isDocumentationPath(path: string): boolean {
  const normalizedPath = normalizePath(path);
  return normalizedPath.startsWith("docs/") || /(^|\/)README(?:\.[^/]*)?$/i.test(normalizedPath);
}

function isProductionLikePath(path: string): boolean {
  const normalizedPath = normalizePath(path);
  return /^(app|lib|prisma|scripts)\//.test(normalizedPath) ||
    ["package.json", "tsconfig.json"].includes(normalizedPath);
}

export function selectSuites(params: {
  mode: RunnerMode;
  suiteIds?: string[];
  includePartial: boolean;
  changedPaths?: string[];
}): SuiteSelection {
  const warnings: string[] = [];
  let candidates: SuiteDefinition[];
  if (params.suiteIds && params.suiteIds.length > 0) {
    const requested = Array.from(new Set(params.suiteIds));
    candidates = requested.map((id) => {
      const suite = getSuiteById(id);
      if (!suite) throw new Error(`Unknown suite ID: ${id}`);
      return suite;
    });
  } else if (params.mode === "changed") {
    const changedPaths = params.changedPaths ?? [];
    candidates = BALANCE_BENCHMARK_REGISTRY.filter((suite) =>
      suiteMatchesChangedPaths(suite, changedPaths),
    );
    for (const path of changedPaths) {
      const mapped = BALANCE_BENCHMARK_REGISTRY.some((suite) =>
        suite.changedPathPatterns.some((pattern) => pathMatchesPattern(path, pattern)),
      );
      if (!mapped && !isDocumentationPath(path) && isProductionLikePath(path)) {
        warnings.push(`Unmapped production path: ${path}`);
      }
    }
  } else {
    candidates = suitesForMode(params.mode);
  }

  const selected: SuiteDefinition[] = [];
  const skipped: Array<{ suite: SuiteDefinition; reason: string }> = [];
  const seenIds = new Set<string>();
  const seenCommands = new Set<string>();
  for (const suite of candidates) {
    if (seenIds.has(suite.id)) continue;
    seenIds.add(suite.id);
    if (suite.compatibility === "AVAILABLE_BUT_INCOMPATIBLE") {
      skipped.push({ suite, reason: suite.notes.join(" ") || "Suite is incompatible." });
      continue;
    }
    if (suite.compatibility === "MISSING") {
      skipped.push({ suite, reason: suite.notes.join(" ") || "Suite is missing." });
      continue;
    }
    if (suite.compatibility === "PARTIAL" && !params.includePartial) {
      skipped.push({ suite, reason: "PARTIAL suite excluded; pass --include-partial to run it." });
      continue;
    }
    const commandKey = formatSuiteCommand(suite);
    if (seenCommands.has(commandKey)) {
      skipped.push({ suite, reason: `Duplicate command already selected: ${commandKey}` });
      continue;
    }
    seenCommands.add(commandKey);
    selected.push(suite);
  }
  return { selected, skipped, warnings: unique(warnings) };
}

function resolveExecutable(command: string, cwd: string): boolean {
  if (isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    try {
      accessSync(resolve(cwd, command), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  const pathValue = process.env.PATH ?? "";
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
    : [""];
  for (const directory of pathValue.split(delimiter)) {
    for (const extension of extensions) {
      const candidate = join(directory, command.toLowerCase().endsWith(extension.toLowerCase()) ? command : `${command}${extension}`);
      try {
        accessSync(candidate, constants.X_OK);
        return true;
      } catch {
        // Continue searching PATH.
      }
    }
  }
  return false;
}

export function verifySuiteCommand(suite: SuiteDefinition, cwd: string): string | null {
  if (suite.command === null) return suite.compatibility === "MISSING" ? null : "command is absent";
  if (!resolveExecutable(suite.command, cwd)) return `command is not executable: ${suite.command}`;
  const tsxIndex = suite.arguments.indexOf("tsx");
  if (tsxIndex >= 0) {
    const script = suite.arguments[tsxIndex + 1];
    if (!script) return "tsx script argument is absent";
    try {
      accessSync(resolve(cwd, script), constants.R_OK);
    } catch {
      return `registered script does not exist: ${script}`;
    }
  }
  const npxCli = suite.arguments.find((argument) => /(?:^|[/\\])npx-cli\.js$/.test(argument));
  if (npxCli) {
    try {
      accessSync(resolve(cwd, npxCli), constants.R_OK);
    } catch {
      return `npx CLI entry point does not exist: ${npxCli}`;
    }
  }
  return null;
}

function emptyTuningProvenance(warning: string | null): TuningProvenance {
  return { power: null, combat: null, outcomeNormalization: null, warning };
}

export async function loadTuningProvenance(cwd: string): Promise<TuningProvenance> {
  loadEnvConfig(cwd);
  try {
    const { prisma } = await import("../prisma/client");
    try {
      const [power, combat, outcomeNormalization] = await Promise.all([
        prisma.powerTuningConfigSet.findFirst({
          where: { status: "ACTIVE" },
          orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
          select: { id: true, name: true, updatedAt: true },
        }),
        prisma.combatTuningConfigSet.findFirst({
          where: { status: "ACTIVE" },
          orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
          select: { id: true, name: true, updatedAt: true },
        }),
        prisma.outcomeNormalizationConfigSet.findFirst({
          where: { status: "ACTIVE" },
          orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
          select: { id: true, name: true, updatedAt: true },
        }),
      ]);
      const convert = (value: { id: string; name: string; updatedAt: Date } | null) =>
        value ? { id: value.id, name: value.name, updatedAt: value.updatedAt.toISOString() } : null;
      const missing = [power, combat, outcomeNormalization].filter((entry) => entry === null).length;
      return {
        power: convert(power),
        combat: convert(combat),
        outcomeNormalization: convert(outcomeNormalization),
        warning: missing > 0 ? `${missing} active tuning set(s) were not found.` : null,
      };
    } finally {
      await prisma.$disconnect();
    }
  } catch (error: unknown) {
    return emptyTuningProvenance(
      `Active tuning provenance unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function recordOrEmpty(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function extractStructuredFields(parsed: JsonObject): {
  baselineValues: JsonObject;
  observedValues: JsonObject;
  tolerances: Record<string, number | string>;
  changedAxes: string[];
  campaignProvenance: SuiteResult["campaignProvenance"];
  databaseProvenance: SuiteResult["databaseProvenance"];
} {
  const provenance = recordOrEmpty(parsed.provenance);
  const toleranceRecord = recordOrEmpty(parsed.tolerances);
  const tolerances: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(toleranceRecord)) {
    if (typeof value === "number" || typeof value === "string") tolerances[key] = value;
  }
  const campaignId = provenance.campaignId;
  const campaignName = provenance.campaignName;
  const assetSource = provenance.assetSource;
  const hasCampaign = [campaignId, campaignName, assetSource].some(
    (value) => typeof value === "string",
  );
  const databaseAccess = provenance.databaseAccess;
  return {
    baselineValues: recordOrEmpty(parsed.baselineValues ?? parsed.baselines),
    observedValues: { structuredOutput: parsed },
    tolerances,
    changedAxes: stringArray(parsed.changedAxes),
    campaignProvenance: hasCampaign
      ? {
          id: typeof campaignId === "string" ? campaignId : null,
          name: typeof campaignName === "string" ? campaignName : null,
          assetSource: typeof assetSource === "string" ? assetSource : null,
        }
      : null,
    databaseProvenance:
      databaseAccess === "none" || databaseAccess === "read-only"
        ? { access: databaseAccess, source: "suite structured output" }
        : { access: "unknown", source: "suite structured output omitted database access" },
  };
}

function looksLikeInfrastructureFailure(output: string): boolean {
  return /DATABASE_URL|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Cannot find module|ERR_MODULE_NOT_FOUND|command not found|is not recognized/i.test(
    output,
  );
}

function baseSuiteResult(
  suite: SuiteDefinition,
  repository: RepositoryProvenance,
  tuning: TuningProvenance,
): Omit<SuiteResult, "status" | "severity" | "startedAt" | "endedAt" | "durationMs" | "exitCode" | "signal" | "warnings" | "stdout" | "stderr" | "error"> {
  return {
    suiteId: suite.id,
    command: formatSuiteCommand(suite),
    commitSha: repository.commitSha,
    branch: repository.branch,
    tuningSetId: tuning.power?.id ?? null,
    tuningUpdatedAt: tuning.power?.updatedAt ?? null,
    databaseProvenance: {
      access:
        suite.mutationSafety.classification === "READ_ONLY"
          ? suite.mutationSafety.databaseAccess
          : "unknown",
      source: "suite registry declaration",
    },
    campaignProvenance: null,
    deterministicSeeds: suite.deterministicSeeds,
    baselineValues: {},
    observedValues: {},
    tolerances: {},
    changedAxes: [],
    mutationSafety: suite.mutationSafety,
  };
}

export function makeSkippedResult(
  suite: SuiteDefinition,
  reason: string,
  repository: RepositoryProvenance,
  tuning: TuningProvenance,
): SuiteResult {
  const now = new Date().toISOString();
  const severity: FailureSeverity =
    suite.compatibility === "AVAILABLE_BUT_INCOMPATIBLE"
      ? "SKIPPED_INCOMPATIBLE"
      : suite.compatibility === "PARTIAL"
        ? "WARNING"
        : "INFORMATIONAL";
  return {
    ...baseSuiteResult(suite, repository, tuning),
    status: "SKIPPED",
    severity,
    startedAt: now,
    endedAt: now,
    durationMs: 0,
    exitCode: null,
    signal: null,
    warnings: [reason],
    stdout: "",
    stderr: "",
    error: null,
  };
}

export async function executeSuite(options: ExecuteSuiteOptions): Promise<SuiteResult> {
  const { suite, repository, tuning, cwd, progress } = options;
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const finish = (
    fields: Pick<SuiteResult, "status" | "severity" | "exitCode" | "signal" | "warnings" | "stdout" | "stderr" | "error"> &
      Partial<Pick<SuiteResult, "baselineValues" | "observedValues" | "tolerances" | "changedAxes" | "campaignProvenance" | "databaseProvenance">>,
  ): SuiteResult => {
    const ended = Date.now();
    return {
      ...baseSuiteResult(suite, repository, tuning),
      startedAt,
      endedAt: new Date(ended).toISOString(),
      durationMs: ended - started,
      ...fields,
    };
  };

  if (suite.compatibility === "AVAILABLE_BUT_INCOMPATIBLE" || suite.compatibility === "MISSING") {
    return makeSkippedResult(suite, "Compatibility state forbids execution.", repository, tuning);
  }
  if (suite.mutationSafety.classification !== "READ_ONLY") {
    return finish({
      status: "ERROR",
      severity: "BLOCKER",
      exitCode: null,
      signal: null,
      warnings: [],
      stdout: "",
      stderr: "",
      error: "Runner refused a suite without an explicit READ_ONLY mutation-safety declaration.",
    });
  }
  const commandError = verifySuiteCommand(suite, cwd);
  if (commandError) {
    return finish({
      status: "ERROR",
      severity: "BLOCKER",
      exitCode: null,
      signal: null,
      warnings: [],
      stdout: "",
      stderr: "",
      error: commandError,
    });
  }
  if (suite.command === null) throw new Error("Unreachable missing command");

  progress(`RUN ${suite.id}`);
  const beforeStatus =
    suite.mutationSafety.databaseAccess === "read-only" ? repositoryStatusSnapshot(cwd) : null;
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let spawnErrorMessage: string | null = null;
  const outcome = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
    (resolveOutcome) => {
      const child = spawn(suite.command, suite.arguments, {
        cwd,
        env: process.env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      activeChildren.add(child);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        spawnErrorMessage = error.message;
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, suite.timeoutMs);
      child.on("close", (exitCode, signal) => {
        clearTimeout(timer);
        activeChildren.delete(child);
        resolveOutcome({ exitCode, signal });
      });
    },
  );

  const warnings: string[] = [];
  if (suite.compatibility === "PARTIAL") {
    warnings.push("PARTIAL evidence: successful execution is not an accepted baseline pass.");
    warnings.push(...suite.notes);
  }
  if (beforeStatus) {
    const afterStatus = repositoryStatusSnapshot(cwd);
    if (JSON.stringify(beforeStatus) !== JSON.stringify(afterStatus)) {
      warnings.push(
        `Repository status changed during DB-backed suite execution. Before=${JSON.stringify(beforeStatus)} After=${JSON.stringify(afterStatus)}`,
      );
    }
  }
  if (timedOut) {
    return finish({
      status: "ERROR",
      severity: "BLOCKER",
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      warnings,
      stdout,
      stderr,
      error: `Suite exceeded timeout of ${suite.timeoutMs}ms.`,
    });
  }
  if (spawnErrorMessage !== null) {
    return finish({
      status: "ERROR",
      severity: "BLOCKER",
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      warnings,
      stdout,
      stderr,
      error: spawnErrorMessage,
    });
  }
  if (outcome.exitCode !== 0) {
    const infrastructure = looksLikeInfrastructureFailure(`${stderr}\n${stdout}`);
    return finish({
      status: infrastructure ? "ERROR" : "FAIL",
      severity: infrastructure ? "BLOCKER" : suite.failureSeverity,
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      warnings,
      stdout,
      stderr,
      error: infrastructure
        ? "Command failed because its runtime or environment was unavailable."
        : "Command completed with a non-zero assertion/result exit.",
    });
  }

  let extracted: ReturnType<typeof extractStructuredFields> | null = null;
  if (suite.supportsJson) {
    try {
      const parsed: unknown = JSON.parse(stdout);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("top-level JSON value is not an object");
      }
      extracted = extractStructuredFields(parsed as JsonObject);
    } catch (error: unknown) {
      return finish({
        status: "ERROR",
        severity: "BLOCKER",
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        warnings,
        stdout,
        stderr,
        error: `Malformed structured suite output: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  const changedDuringRun = warnings.some((warning) => warning.startsWith("Repository status changed"));
  const partial = suite.compatibility === "PARTIAL";
  return finish({
    status: partial || changedDuringRun ? "WARNING" : "PASS",
    severity: partial || changedDuringRun ? "WARNING" : "INFORMATIONAL",
    exitCode: outcome.exitCode,
    signal: outcome.signal,
    warnings,
    stdout,
    stderr,
    error: null,
    ...(extracted ?? {}),
  });
}

function summaryCounts(results: SuiteResult[]): ReportSummaryCounts {
  const counts: ReportSummaryCounts = { PASS: 0, FAIL: 0, WARNING: 0, SKIPPED: 0, ERROR: 0 };
  for (const result of results) counts[result.status] += 1;
  return counts;
}

function highestSeverity(results: SuiteResult[]): FailureSeverity {
  return results.reduce<FailureSeverity>(
    (highest, result) =>
      severityRank[result.severity] > severityRank[highest] ? result.severity : highest,
    "INFORMATIONAL",
  );
}

function overallStatus(results: SuiteResult[]): BalanceBenchmarkReport["overallStatus"] {
  if (results.some((result) => result.status === "ERROR")) return "ERROR";
  if (results.some((result) => result.status === "FAIL")) return "FAIL";
  return "PASS";
}

function boundedFailureExcerpt(result: SuiteResult): string {
  const source = result.stderr.trim() || result.stdout.trim() || result.error || "No command output.";
  return source.split(/\r?\n/).slice(-12).join("\n").slice(-2_000);
}

export function renderHumanReport(report: BalanceBenchmarkReport): string {
  const output: string[] = [
    "Balance Benchmark Runner",
    `mode=${report.mode} commit=${report.repository.commitSha} branch=${report.repository.branch}`,
  ];
  const tuning = report.tuning.power;
  output.push(
    tuning
      ? `powerTuning=${tuning.name ?? "unnamed"} (${tuning.id}, ${tuning.updatedAt})`
      : `powerTuning=unavailable${report.tuning.warning ? ` (${report.tuning.warning})` : ""}`,
  );
  if (report.mode === "changed") {
    output.push(`changedPaths=${report.changedPaths.length}`);
    for (const path of report.changedPaths) output.push(`  ${path}`);
  }
  output.push("");
  for (const result of report.suiteResults) {
    const reason = result.error ?? result.warnings[0] ?? "";
    output.push(
      `${result.status.padEnd(7)} ${result.severity.padEnd(20)} ${String(result.durationMs).padStart(6)}ms  ${result.suiteId}${reason ? ` — ${reason}` : ""}`,
    );
    if (result.status === "FAIL" || result.status === "ERROR") {
      output.push(boundedFailureExcerpt(result));
      output.push("  Complete stdout/stderr are retained in the in-memory/JSON result object.");
    }
  }
  output.push("");
  output.push(
    `counts=${RESULT_STATUSES.map((status) => `${status}:${report.summaryCounts[status]}`).join(" ")}`,
  );
  output.push(`overall=${report.overallStatus} highestSeverity=${report.highestSeverity}`);
  for (const warning of report.warnings) output.push(`warning: ${warning}`);
  return output.join("\n");
}

export function createProgressWriter(json: boolean, streams: OutputStreams = process) {
  return (message: string): void => {
    const destination = json ? streams.stderr : streams.stderr;
    destination.write(`[balance-benchmark] ${message}\n`);
  };
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    mode: "quick",
    json: false,
    list: false,
    suiteIds: [],
    base: null,
    includePartial: false,
    failFast: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mode") {
      const mode = argv[++index] as RunnerMode | undefined;
      if (!mode || !RUNNER_MODES.includes(mode)) throw new Error(`Invalid --mode: ${mode ?? "missing"}`);
      options.mode = mode;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--list") {
      options.list = true;
    } else if (argument === "--suite") {
      const value = argv[++index];
      if (!value) throw new Error("--suite requires an ID or comma-separated IDs");
      options.suiteIds.push(...value.split(",").map((entry) => entry.trim()).filter(Boolean));
    } else if (argument === "--base") {
      options.base = argv[++index] ?? null;
      if (!options.base) throw new Error("--base requires a git ref");
    } else if (argument === "--include-partial") {
      options.includePartial = true;
    } else if (argument === "--fail-fast") {
      options.failFast = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage(): string {
  return [
    "Balance Benchmark Runner",
    "",
    "Usage:",
    "  npx --yes tsx scripts/balanceBenchmark.runner.ts --mode <quick|axes|runtime|full|changed> [options]",
    "  npx --yes tsx scripts/balanceBenchmark.runner.ts --list",
    "",
    "Options:",
    "  --mode <mode>       Runner mode (default: quick)",
    "  --json              Emit exactly one JSON document to stdout",
    "  --list              List registered suites without executing them",
    "  --suite <id[,id]>   Select suite IDs; repeatable",
    "  --base <git-ref>    Override changed-mode comparison base",
    "  --include-partial   Deliberately execute PARTIAL suites",
    "  --fail-fast         Stop execution after the first FAIL or ERROR",
    "  --help              Show this help",
  ].join("\n");
}

function installSignalHandlers(progress: (message: string) => void): () => void {
  const handler = () => {
    interrupted = true;
    progress("Interrupt received; terminating active child process.");
    for (const child of activeChildren) child.kill("SIGTERM");
  };
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
  return () => {
    process.off("SIGINT", handler);
    process.off("SIGTERM", handler);
  };
}

function listPayload() {
  return {
    schemaVersion: BALANCE_BENCHMARK_SCHEMA_VERSION,
    suiteCount: BALANCE_BENCHMARK_REGISTRY.length,
    familyCount: registryFamilies().length,
    suites: BALANCE_BENCHMARK_REGISTRY.map((suite) => ({
      id: suite.id,
      family: suite.family,
      compatibility: suite.compatibility,
      modes: suite.modes,
      command: formatSuiteCommand(suite),
      mutationSafety: suite.mutationSafety.classification,
    })),
  };
}

async function run(options: CliOptions): Promise<BalanceBenchmarkReport> {
  const runStarted = Date.now();
  const progress = createProgressWriter(options.json);
  let changed: ChangedPathCollection = { base: null, paths: [], warnings: [] };
  if (options.mode === "changed") changed = collectChangedPaths(process.cwd(), options.base);
  const repository = collectRepositoryProvenance(process.cwd(), changed.base);
  const tuning = await loadTuningProvenance(repository.root);
  const selection = selectSuites({
    mode: options.mode,
    suiteIds: options.suiteIds,
    includePartial: options.includePartial,
    changedPaths: changed.paths,
  });
  const warnings = unique([
    ...changed.warnings,
    ...selection.warnings,
    ...(tuning.warning ? [tuning.warning] : []),
  ]);
  const results: SuiteResult[] = selection.skipped.map(({ suite, reason }) =>
    makeSkippedResult(suite, reason, repository, tuning),
  );
  const cleanupSignals = installSignalHandlers(progress);
  try {
    for (let index = 0; index < selection.selected.length; index += 1) {
      const suite = selection.selected[index];
      if (interrupted) break;
      const result = await executeSuite({
        suite,
        repository,
        tuning,
        cwd: repository.root,
        progress,
      });
      results.push(result);
      if (options.failFast && (result.status === "FAIL" || result.status === "ERROR")) {
        for (const remaining of selection.selected.slice(index + 1)) {
          results.push(
            makeSkippedResult(remaining, "Not run because --fail-fast stopped execution.", repository, tuning),
          );
        }
        break;
      }
    }
  } finally {
    cleanupSignals();
  }
  if (interrupted) warnings.push("Run interrupted by SIGINT/SIGTERM.");
  const orderedResults = [...results].sort(
    (left, right) =>
      BALANCE_BENCHMARK_REGISTRY.findIndex((suite) => suite.id === left.suiteId) -
      BALANCE_BENCHMARK_REGISTRY.findIndex((suite) => suite.id === right.suiteId),
  );
  const runEnded = Date.now();
  const report: BalanceBenchmarkReport = {
    schemaVersion: BALANCE_BENCHMARK_SCHEMA_VERSION,
    mode: options.mode,
    startedAt: new Date(runStarted).toISOString(),
    endedAt: new Date(runEnded).toISOString(),
    durationMs: runEnded - runStarted,
    repository,
    tuning,
    changedPaths: changed.paths,
    selectedSuiteIds: selection.selected.map((suite) => suite.id),
    skippedSuiteIds: orderedResults
      .filter((result) => result.status === "SKIPPED")
      .map((result) => result.suiteId),
    overallStatus: overallStatus(orderedResults),
    highestSeverity: highestSeverity(orderedResults),
    suiteResults: orderedResults,
    summaryCounts: summaryCounts(orderedResults),
    warnings: unique(warnings),
  };
  assertBalanceBenchmarkReport(report);
  return report;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.list) {
    const payload = listPayload();
    if (options.json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      process.stdout.write(
        `${payload.suites
          .map(
            (suite) =>
              `${suite.id.padEnd(42)} ${suite.compatibility.padEnd(28)} ${suite.family}\n  ${suite.command}`,
          )
          .join("\n")}\n`,
      );
    }
    return;
  }
  const report = await run(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderHumanReport(report)}\n`);
  }
  if (report.overallStatus !== "PASS" || interrupted) process.exitCode = 1;
}

const isMain = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `[balance-benchmark] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

export const INTERNAL_ENUMS_FOR_SMOKE = {
  modes: RUNNER_MODES,
  statuses: RESULT_STATUSES,
  severities: FAILURE_SEVERITIES,
};
