import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type ChiefState =
  | "NEXT_CODEX_PROMPT"
  | "STOP_FOR_DESIGN_INTENT"
  | "STOP_FOR_APPROVAL"
  | "STOP_FOR_SAFETY"
  | "DONE";

type ChiefProviderName = "mock" | "openai";

type CliOptions = {
  command: string | null;
  jobId: string | null;
  goalFile: string | null;
  chiefProvider: ChiefProviderName;
  chiefModel: string;
  maxTurns: number;
};

type ChiefResponse = {
  state: ChiefState;
  decision: string;
  codexPrompt: string | null;
  requiresLeadDesigner: boolean;
  dangerousApprovalRequested: string[];
  notes: string[];
};

type ChiefRequest = {
  jobId: string;
  turn: number;
  goal: string;
  previousCodexReportPath: string | null;
  previousCodexReport: string | null;
};

type SafetyResult = {
  ok: boolean;
  blockedTerms: Array<{ term: string; line: number }>;
};

type RunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

const REPO_ROOT = process.cwd();
const JOBS_ROOT = resolve(REPO_ROOT, ".incarnate-balance-agent", "jobs");
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_CHIEF_MODEL = "gpt-5";
const CODEX_TIMEOUT_MS = 300_000;

const CHIEF_STATES: ChiefState[] = [
  "NEXT_CODEX_PROMPT",
  "STOP_FOR_DESIGN_INTENT",
  "STOP_FOR_APPROVAL",
  "STOP_FOR_SAFETY",
  "DONE",
];

const PROMPT_BLOCK_TERMS = [
  "commit",
  "push",
  "seeder",
  "seeders",
  "DB write",
  "database write",
  "DB query",
  "database query",
  "migration",
  "formula change",
  "scalar change",
  "tuning change",
  "Balance Environment asset mutation",
  "scenario simulation",
  "100-run",
  "500-run",
  "workspace-write",
  "danger-full-access",
  "yolo",
  ".env",
  "API key",
  "token",
  "secret",
  "credential",
];

function parseArgs(argv: string[]): CliOptions {
  const [command, ...rest] = argv;
  const options: CliOptions = {
    command: command ?? null,
    jobId: null,
    goalFile: null,
    chiefProvider: "mock",
    chiefModel: DEFAULT_CHIEF_MODEL,
    maxTurns: 1,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = rest[index + 1];
    if (arg === "--job-id") {
      options.jobId = next ?? null;
      index += 1;
    } else if (arg === "--goal-file") {
      options.goalFile = next ?? null;
      index += 1;
    } else if (arg === "--chief-provider") {
      if (next !== "mock" && next !== "openai") throw new Error("--chief-provider must be mock or openai.");
      options.chiefProvider = next;
      index += 1;
    } else if (arg === "--chief-model") {
      options.chiefModel = next ?? DEFAULT_CHIEF_MODEL;
      index += 1;
    } else if (arg === "--max-turns") {
      const parsed = Number.parseInt(next ?? "", 10);
      if (!Number.isFinite(parsed) || parsed < 1) throw new Error("--max-turns must be a positive integer.");
      options.maxTurns = parsed;
      index += 1;
    }
  }
  return options;
}

function usage(): string {
  return [
    "Usage:",
    "  npx --yes tsx scripts/balanceAutoRelay.orchestrator.ts run-readonly --job-id <JOB_ID> --goal-file <PATH> --chief-provider mock --max-turns <N>",
  ].join("\n");
}

function run(command: string, args: string[], input?: string, timeoutMs = 30_000): RunResult {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    input,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runGit(args: string[]): string {
  const result = run("git", args);
  return result.status === 0 ? result.stdout.trim() : `ERROR: ${result.stderr.trim()}`;
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeText(path: string, text: string) {
  ensureDir(dirname(path));
  writeFileSync(path, text, "utf8");
}

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function writeJson(path: string, value: unknown) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function turnName(turn: number): string {
  return String(turn).padStart(3, "0");
}

function isProhibitionLine(line: string): boolean {
  const lower = line.toLowerCase();
  return lower.includes("do not") || lower.includes("must not") || lower.includes("never ");
}

function validatePromptSafety(prompt: string): SafetyResult {
  const blockedTerms: SafetyResult["blockedTerms"] = [];
  const lines = prompt.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (isProhibitionLine(line)) continue;
    const lower = line.toLowerCase();
    for (const term of PROMPT_BLOCK_TERMS) {
      if (lower.includes(term.toLowerCase())) {
        blockedTerms.push({ term, line: index + 1 });
      }
    }
  }
  return { ok: blockedTerms.length === 0, blockedTerms };
}

function chiefResponseIsValid(value: unknown): value is ChiefResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ChiefResponse>;
  return (
    typeof candidate.state === "string" &&
    CHIEF_STATES.includes(candidate.state as ChiefState) &&
    typeof candidate.decision === "string" &&
    (typeof candidate.codexPrompt === "string" || candidate.codexPrompt === null) &&
    typeof candidate.requiresLeadDesigner === "boolean" &&
    Array.isArray(candidate.dangerousApprovalRequested) &&
    Array.isArray(candidate.notes)
  );
}

function mockChiefResponse(request: ChiefRequest): ChiefResponse {
  if (!request.previousCodexReport) {
    return {
      state: "NEXT_CODEX_PROMPT",
      decision: "Run one harmless read-only Codex inspection of the relay README.",
      codexPrompt: [
        "You are Codex running locally inside the Incarnate TTRPG repo.",
        "",
        "MODE: READ_ONLY_AUTO_RELAY_PROOF",
        "",
        "Inspect only this file:",
        "docs/reference/balance-relay/README.txt",
        "",
        "Report whether it states that relay summaries are navigation-only and raw Codex reports are authoritative evidence.",
        "",
        "Do not edit files.",
        "Do not run tests.",
        "Do not run DB.",
        "Do not run simulations.",
        "Do not inspect secrets.",
        "",
        "Return a concise report with:",
        "- file inspected",
        "- findings",
        "- confirmation no writes were performed",
      ].join("\n"),
      requiresLeadDesigner: false,
      dangerousApprovalRequested: [],
      notes: ["Mock Chief provider first turn."],
    };
  }
  return {
    state: "DONE",
    decision: "Codex report received; automated read-only proof is complete.",
    codexPrompt: null,
    requiresLeadDesigner: false,
    dangerousApprovalRequested: [],
    notes: ["Mock Chief provider returned DONE after one Codex report."],
  };
}

function extractResponseText(apiResponse: Record<string, unknown>): string | null {
  if (typeof apiResponse.output_text === "string") return apiResponse.output_text;
  const output = apiResponse.output;
  if (!Array.isArray(output)) return null;
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.length > 0 ? chunks.join("\n") : null;
}

async function openAiChiefResponse(request: ChiefRequest, model: string): Promise<{ chief: ChiefResponse; raw: unknown }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      raw: { error: "OPENAI_API_KEY is required for --chief-provider openai." },
      chief: {
        state: "STOP_FOR_SAFETY",
        decision: "OPENAI_API_KEY is required for the OpenAI Chief provider.",
        codexPrompt: null,
        requiresLeadDesigner: true,
        dangerousApprovalRequested: [],
        notes: ["Missing OPENAI_API_KEY; key value was not printed."],
      },
    };
  }

  const body = {
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "You are the Chief Balance Agent for the Incarnate TTRPG relay.",
              "Return only JSON matching the requested shape.",
              "Do not request dangerous actions unless they must stop for approval.",
            ].join("\n"),
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify(request, null, 2) }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "chief_response",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["state", "decision", "codexPrompt", "requiresLeadDesigner", "dangerousApprovalRequested", "notes"],
          properties: {
            state: { enum: CHIEF_STATES },
            decision: { type: "string" },
            codexPrompt: { anyOf: [{ type: "string" }, { type: "null" }] },
            requiresLeadDesigner: { type: "boolean" },
            dangerousApprovalRequested: { type: "array", items: { type: "string" } },
            notes: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const raw = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    return {
      raw,
      chief: {
        state: "STOP_FOR_SAFETY",
        decision: "OpenAI Chief provider request failed.",
        codexPrompt: null,
        requiresLeadDesigner: true,
        dangerousApprovalRequested: [],
        notes: [`HTTP ${response.status}; raw response stored without printing secrets.`],
      },
    };
  }

  const text = extractResponseText(raw);
  if (!text) {
    return {
      raw,
      chief: {
        state: "STOP_FOR_SAFETY",
        decision: "OpenAI Chief provider returned no parseable text.",
        codexPrompt: null,
        requiresLeadDesigner: true,
        dangerousApprovalRequested: [],
        notes: ["Raw response was stored."],
      },
    };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (chiefResponseIsValid(parsed)) return { raw, chief: parsed };
  } catch {
    // handled below
  }
  return {
    raw,
    chief: {
      state: "STOP_FOR_SAFETY",
      decision: "OpenAI Chief provider response could not be parsed as a valid Chief response.",
      codexPrompt: null,
      requiresLeadDesigner: true,
      dangerousApprovalRequested: [],
      notes: ["Raw response was stored."],
    },
  };
}

async function chiefResponse(
  provider: ChiefProviderName,
  request: ChiefRequest,
  turnDir: string,
  model: string,
): Promise<ChiefResponse> {
  if (provider === "mock") {
    const response = mockChiefResponse(request);
    writeJson(resolve(turnDir, "01-chief-response.json"), response);
    return response;
  }
  const response = await openAiChiefResponse(request, model);
  writeJson(resolve(turnDir, "01-chief-response.json"), {
    parsedChiefResponse: response.chief,
    rawProviderResponse: response.raw,
  });
  return response.chief;
}

function codexVersion(): string {
  const result = run("codex", ["--version"]);
  return result.status === 0 ? result.stdout.trim() : `ERROR: ${result.stderr.trim()}`;
}

function runCodex(prompt: string, reportPath: string): { result: RunResult; command: string[]; version: string } {
  const command = [
    "--ask-for-approval",
    "never",
    "exec",
    "--cd",
    REPO_ROOT,
    "--sandbox",
    "read-only",
    "--output-last-message",
    reportPath,
    "-",
  ];
  const version = codexVersion();
  const result = run("codex", command, prompt, CODEX_TIMEOUT_MS);
  return { result, command: ["codex", ...command], version };
}

function finalSummary(params: {
  jobId: string;
  finalState: ChiefState;
  turnCount: number;
  headBefore: string;
  headAfter: string;
  statusBefore: string;
  statusAfter: string;
  codexReportPaths: string[];
  chiefResponsePaths: string[];
  stopReason: string | null;
  manualActionNeeded: boolean;
}) {
  return [
    `# Auto Relay Final Summary — ${params.jobId}`,
    "",
    `finalState: ${params.finalState}`,
    `turnCount: ${params.turnCount}`,
    `headBefore: ${params.headBefore}`,
    `headAfter: ${params.headAfter}`,
    `gitStatusBefore: ${params.statusBefore || "clean"}`,
    `gitStatusAfter: ${params.statusAfter || "clean"}`,
    "",
    "codexReportPaths:",
    ...params.codexReportPaths.map((path) => `- ${path}`),
    "",
    "chiefResponsePaths:",
    ...params.chiefResponsePaths.map((path) => `- ${path}`),
    "",
    `stopReason: ${params.stopReason ?? "none"}`,
    `manualLeadDesignerActionNeeded: ${params.manualActionNeeded ? "yes" : "no"}`,
    "",
  ].join("\n");
}

async function runReadonly(options: CliOptions) {
  if (!options.jobId || !options.goalFile) throw new Error(`${usage()}\n\nMissing --job-id or --goal-file.`);
  if (options.jobId.includes("/") || options.jobId.includes("\\") || options.jobId.includes("..")) {
    throw new Error("--job-id must be a single folder name.");
  }
  const goalPath = resolve(REPO_ROOT, options.goalFile);
  if (!existsSync(goalPath)) throw new Error(`Goal file does not exist: ${options.goalFile}`);
  const goal = readText(goalPath);
  const jobDir = resolve(JOBS_ROOT, options.jobId);
  ensureDir(jobDir);
  ensureDir(resolve(jobDir, "turns"));

  const headBefore = runGit(["rev-parse", "HEAD"]);
  const statusBefore = runGit(["status", "--short"]);
  writeText(resolve(jobDir, "00-lead-goal.md"), goal);

  const metadata = {
    jobId: options.jobId,
    mode: "APPROVED_AUTO_RELAY_MVP_IMPLEMENTATION",
    provider: options.chiefProvider,
    chiefModel: options.chiefProvider === "openai" ? options.chiefModel : null,
    repoPath: REPO_ROOT,
    headBefore,
    statusBefore,
    maxTurns: options.maxTurns,
    codexSandbox: "read-only",
    codexApprovalPolicy: "never",
    disallowedSandboxes: ["workspace-write", "danger-full-access"],
    createdAt: new Date().toISOString(),
  };
  writeJson(resolve(jobDir, "metadata.json"), metadata);

  let previousCodexReport: string | null = null;
  let previousCodexReportPath: string | null = null;
  let finalState: ChiefState = "STOP_FOR_SAFETY";
  let stopReason: string | null = "max turns exhausted";
  let manualActionNeeded = true;
  const codexReportPaths: string[] = [];
  const chiefResponsePaths: string[] = [];
  let actualTurns = 0;

  for (let turn = 1; turn <= options.maxTurns; turn += 1) {
    actualTurns = turn;
    const turnDir = resolve(jobDir, "turns", turnName(turn));
    ensureDir(turnDir);
    const request: ChiefRequest = {
      jobId: options.jobId,
      turn,
      goal,
      previousCodexReportPath,
      previousCodexReport,
    };
    writeJson(resolve(turnDir, "00-chief-request.json"), request);

    const chief = await chiefResponse(options.chiefProvider, request, turnDir, options.chiefModel);
    chiefResponsePaths.push(resolve(turnDir, "01-chief-response.json"));

    if (chief.state !== "NEXT_CODEX_PROMPT") {
      finalState = chief.state;
      stopReason = chief.decision;
      manualActionNeeded = chief.requiresLeadDesigner || chief.state !== "DONE";
      break;
    }

    if (!chief.codexPrompt) {
      finalState = "STOP_FOR_SAFETY";
      stopReason = "Chief returned NEXT_CODEX_PROMPT without codexPrompt.";
      manualActionNeeded = true;
      break;
    }

    const promptSafety = validatePromptSafety(chief.codexPrompt);
    if (!promptSafety.ok) {
      writeJson(resolve(turnDir, "06-validation.json"), {
        ok: false,
        stop: "STOP_FOR_SAFETY",
        blockedTerms: promptSafety.blockedTerms,
      });
      finalState = "STOP_FOR_SAFETY";
      stopReason = "Codex prompt failed MVP safety validation.";
      manualActionNeeded = true;
      break;
    }

    const promptPath = resolve(turnDir, "02-codex-prompt.md");
    const stdoutPath = resolve(turnDir, "03-codex-stdout.txt");
    const stderrPath = resolve(turnDir, "04-codex-stderr.txt");
    const reportPath = resolve(turnDir, "05-codex-report.md");
    writeText(promptPath, chief.codexPrompt);

    const codex = runCodex(chief.codexPrompt, reportPath);
    writeText(stdoutPath, codex.result.stdout);
    writeText(stderrPath, codex.result.stderr);

    const reportExists = existsSync(reportPath);
    const reportText = reportExists ? readText(reportPath) : "";
    const validation = {
      ok: codex.result.status === 0 && reportExists,
      codexExitStatus: codex.result.status,
      codexCommand: codex.command,
      codexVersion: codex.version,
      sandbox: "read-only",
      approvalPolicy: "never",
      promptSha256: sha256(chief.codexPrompt),
      reportSha256: reportExists ? sha256(reportText) : null,
      promptPath,
      stdoutPath,
      stderrPath,
      reportPath,
      repoHeadAfterCodex: runGit(["rev-parse", "HEAD"]),
      repoStatusAfterCodex: runGit(["status", "--short"]),
    };
    writeJson(resolve(turnDir, "06-validation.json"), validation);

    if (codex.result.status !== 0 || !reportExists) {
      finalState = "STOP_FOR_SAFETY";
      stopReason = "Codex exited non-zero or did not produce a report.";
      manualActionNeeded = true;
      break;
    }

    previousCodexReport = reportText;
    previousCodexReportPath = reportPath;
    codexReportPaths.push(reportPath);
  }

  if (actualTurns >= options.maxTurns && finalState === "STOP_FOR_SAFETY" && previousCodexReport) {
    stopReason = "Max turns exhausted before Chief returned DONE or stop state.";
  }

  const headAfter = runGit(["rev-parse", "HEAD"]);
  const statusAfter = runGit(["status", "--short"]);
  const summary = finalSummary({
    jobId: options.jobId,
    finalState,
    turnCount: actualTurns,
    headBefore,
    headAfter,
    statusBefore,
    statusAfter,
    codexReportPaths,
    chiefResponsePaths,
    stopReason,
    manualActionNeeded,
  });
  writeText(resolve(jobDir, "07-final-summary.md"), summary);

  console.log(summary);
  process.exitCode = finalState === "STOP_FOR_SAFETY" ? 1 : 0;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.command !== "run-readonly") throw new Error(usage());
    await runReadonly(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
