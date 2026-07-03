import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

type Severity = "PASS" | "WARNING" | "BLOCKING";

type Check = {
  label: string;
  severity: Severity;
  detail: string;
};

type Metadata = {
  approvalScope?: unknown;
  dangerousActionsApproved?: unknown;
};

const REQUIRED_FILES = [
  "metadata.json",
  "00-chief-prompt.md",
  "01-codex-report.md",
  "02-relay-summary.md",
  "03-chief-decision.md",
  "04-validation-log.txt",
];

const ONE_MB = 1024 * 1024;
const FIVE_MB = 5 * ONE_MB;

const TEMPLATE_MARKERS: Record<string, string[]> = {
  "metadata.json": ["TEMPLATE-DO-NOT-USE-AS-A-REAL-JOB"],
  "00-chief-prompt.md": ["Paste the exact prompt sent to Codex here.", "This file is a template."],
  "01-codex-report.md": ["Paste the exact Codex response here.", "This file is a template."],
  "02-relay-summary.md": ["This file is optional and non-authoritative.", "This file is a template."],
  "03-chief-decision.md": ["Record the Chief Balance Agent's judgement and next action here.", "This file is a template."],
  "04-validation-log.txt": ["Template only. Do not include real current job validation output"],
};

const DANGEROUS_TERMS = [
  "commit",
  "push",
  "seeder",
  "seeders",
  "DB write",
  "database write",
  "migration",
  "formula change",
  "scalar change",
  "tuning change",
  "Balance Environment asset mutation",
  "100-run",
  "500-run",
  "deleteMany",
  "createMany",
  "upsert",
  "destructive command",
];

const SECRET_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "DATABASE_URL assignment", pattern: /\bDATABASE_URL\s*=/i },
  { label: "Postgres connection URL", pattern: /postgres(?:ql)?:\/\//i },
  { label: "MySQL connection URL", pattern: /mysql:\/\//i },
  { label: "MongoDB connection URL", pattern: /mongodb(?:\+srv)?:\/\//i },
  { label: "OpenAI API key", pattern: /\bOPENAI_API_KEY\b/i },
  { label: "API key assignment", pattern: /\bAPI_KEY\s*=/i },
  { label: "Bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/ },
  { label: "Private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "Token assignment", pattern: /\b(token|secret)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{16,}/i },
];

function runGit(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  let jobId: string | null = null;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--job-id") {
      jobId = rest[index + 1] ?? null;
      index += 1;
    }
  }
  return { command, jobId };
}

function add(checks: Check[], label: string, severity: Severity, detail: string) {
  checks.push({ label, severity, detail });
}

function fileText(path: string): string {
  return readFileSync(path, "utf8");
}

function looksLikeTemplate(fileName: string, text: string): boolean {
  return (TEMPLATE_MARKERS[fileName] ?? []).some((marker) => text.includes(marker));
}

function collectJobFiles(jobDir: string): string[] {
  const out: string[] = [];
  const stack = [jobDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  return out.sort();
}

function readMetadata(metadataPath: string): Metadata {
  if (!existsSync(metadataPath)) return {};
  try {
    return JSON.parse(fileText(metadataPath)) as Metadata;
  } catch {
    return {};
  }
}

function approvalText(metadata: Metadata): string {
  const parts = [
    typeof metadata.approvalScope === "string" ? metadata.approvalScope : JSON.stringify(metadata.approvalScope ?? ""),
    JSON.stringify(metadata.dangerousActionsApproved ?? []),
  ];
  return parts.join("\n").toLowerCase();
}

function detectDangerousTerms(reportText: string) {
  const lowerReport = reportText.toLowerCase();
  return DANGEROUS_TERMS
    .map((term) => {
      const needle = term.toLowerCase();
      const count = lowerReport.split(needle).length - 1;
      return { term, count };
    })
    .filter((entry) => entry.count > 0);
}

function claimsUnapprovedMutationPerformed(reportText: string): boolean {
  return [
    /\bunapproved\b.{0,80}\b(commit|push|seeder|database write|db write|migration|mutation)\b.{0,80}\b(performed|ran|executed|happened)\b/i,
    /\baccidental\b.{0,80}\b(write|mutation|commit|push|seeder|migration)\b/i,
    /\b(database|db)\s+write\s+(was\s+)?performed\b/i,
    /\bcommitted\s+without\s+approval\b/i,
    /\bpushed\s+without\s+approval\b/i,
  ].some((pattern) => pattern.test(reportText));
}

function detectSecretPatterns(files: string[], jobDir: string) {
  const hits: Array<{ file: string; category: string }> = [];
  for (const path of files) {
    const text = fileText(path);
    for (const { label, pattern } of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        hits.push({ file: relative(jobDir, path), category: label });
      }
    }
  }
  return hits;
}

function statusFor(checks: Check[]): "PASS" | "PASS_WITH_WARNINGS" | "FAIL_BLOCKING" {
  if (checks.some((check) => check.severity === "BLOCKING")) return "FAIL_BLOCKING";
  if (checks.some((check) => check.severity === "WARNING")) return "PASS_WITH_WARNINGS";
  return "PASS";
}

function printSection(title: string, checks: Check[]) {
  console.log(`\n## ${title}\n`);
  if (checks.length === 0) {
    console.log("- PASS: No issues found.");
    return;
  }
  for (const check of checks) {
    console.log(`- ${check.severity}: ${check.label} - ${check.detail}`);
  }
}

function validate(jobId: string) {
  const repoRoot = process.cwd();
  const storageRoot = resolve(repoRoot, ".incarnate-balance-agent");
  const jobsRoot = resolve(storageRoot, "jobs");
  const jobDir = resolve(jobsRoot, jobId);
  const relativeJobPath = relative(jobsRoot, jobDir);
  const invalidJobId = !jobId || jobId.includes("/") || jobId.includes("\\") || jobId.includes("..");

  const repoChecks: Check[] = [];
  const requiredChecks: Check[] = [];
  const rawReportChecks: Check[] = [];
  const summaryChecks: Check[] = [];
  const chiefDecisionChecks: Check[] = [];
  const repoStateChecks: Check[] = [];
  const dangerousChecks: Check[] = [];
  const campaignChecks: Check[] = [];
  const secretChecks: Check[] = [];
  const sizeChecks: Check[] = [];
  const notes: Check[] = [];

  const allChecks = [
    repoChecks,
    requiredChecks,
    rawReportChecks,
    summaryChecks,
    chiefDecisionChecks,
    repoStateChecks,
    dangerousChecks,
    campaignChecks,
    secretChecks,
    sizeChecks,
    notes,
  ];

  if (invalidJobId) {
    add(repoChecks, "job id", "BLOCKING", "Job id must be a single folder name.");
  }

  const ignored = runGit(["check-ignore", ".incarnate-balance-agent/"]);
  if (ignored.status === 0) {
    add(repoChecks, "local storage ignore", "PASS", ".incarnate-balance-agent/ is ignored by git.");
  } else {
    add(repoChecks, "local storage ignore", "BLOCKING", ".incarnate-balance-agent/ is not ignored by git.");
  }

  const tracked = runGit(["ls-files", ".incarnate-balance-agent"]);
  if (tracked.stdout.length === 0) {
    add(repoChecks, "tracked local artifacts", "PASS", "No .incarnate-balance-agent files are tracked.");
  } else {
    add(repoChecks, "tracked local artifacts", "BLOCKING", "Local relay artifacts are tracked by git.");
  }

  const insideJobsRoot =
    !invalidJobId &&
    relativeJobPath.length > 0 &&
    !relativeJobPath.startsWith("..") &&
    jobDir.toLowerCase().startsWith(`${jobsRoot.toLowerCase()}${sep}`);
  if (insideJobsRoot) {
    add(repoChecks, "job folder scope", "PASS", "Target job folder resolves under .incarnate-balance-agent/jobs/.");
  } else {
    add(repoChecks, "job folder scope", "BLOCKING", "Target job folder is outside .incarnate-balance-agent/jobs/.");
  }

  const jobDirExists = insideJobsRoot && existsSync(jobDir) && statSync(jobDir).isDirectory();
  if (jobDirExists) {
    add(repoChecks, "target job folder", "PASS", `${relative(repoRoot, jobDir)} exists.`);
  } else {
    add(repoChecks, "target job folder", "BLOCKING", `${relative(repoRoot, jobDir)} does not exist.`);
  }

  const requiredFileTexts = new Map<string, string>();
  for (const fileName of REQUIRED_FILES) {
    const path = resolve(jobDir, fileName);
    if (!jobDirExists || !existsSync(path)) {
      add(requiredChecks, fileName, "BLOCKING", "Missing required file.");
      continue;
    }
    const stats = statSync(path);
    const text = fileText(path);
    requiredFileTexts.set(fileName, text);
    const templateStatus = looksLikeTemplate(fileName, text) ? "appears to be untouched template" : "does not look like untouched template";
    add(requiredChecks, fileName, "PASS", `${stats.size} bytes; ${templateStatus}.`);
    if (stats.size > FIVE_MB) {
      add(sizeChecks, fileName, "BLOCKING", `${stats.size} bytes exceeds 5 MB.`);
    } else if (stats.size > ONE_MB) {
      add(sizeChecks, fileName, "WARNING", `${stats.size} bytes exceeds 1 MB.`);
    } else {
      add(sizeChecks, fileName, "PASS", `${stats.size} bytes.`);
    }
  }

  const reportText = requiredFileTexts.get("01-codex-report.md") ?? "";
  if (!reportText.trim()) {
    add(rawReportChecks, "raw report content", "BLOCKING", "01-codex-report.md is empty or missing.");
  } else if (looksLikeTemplate("01-codex-report.md", reportText)) {
    add(rawReportChecks, "raw report content", "BLOCKING", "01-codex-report.md still looks like the untouched template.");
  } else {
    add(rawReportChecks, "raw report content", "PASS", "01-codex-report.md is non-empty and does not look like the untouched template.");
  }
  add(rawReportChecks, "verbatim integrity", "WARNING", "True verbatim integrity cannot be proven until a future add-report command records ingest hashes.");

  const summaryText = requiredFileTexts.get("02-relay-summary.md") ?? "";
  if (!summaryText.trim()) {
    add(summaryChecks, "summary", "WARNING", "02-relay-summary.md is empty.");
  } else {
    for (const phrase of ["Navigation aid only", "verbatim Codex report", "authoritative evidence"]) {
      add(
        summaryChecks,
        phrase,
        summaryText.includes(phrase) ? "PASS" : "BLOCKING",
        summaryText.includes(phrase) ? "Required wording present." : "Required navigation-only wording missing.",
      );
    }
  }

  const decisionText = requiredFileTexts.get("03-chief-decision.md") ?? "";
  if (!decisionText.trim() || looksLikeTemplate("03-chief-decision.md", decisionText) || /decision pending/i.test(decisionText)) {
    add(chiefDecisionChecks, "chief decision", "WARNING", "Chief decision appears pending or template-like.");
  } else {
    add(chiefDecisionChecks, "chief decision", "PASS", "Chief decision appears recorded.");
  }

  for (const { label, pattern } of [
    { label: "repo path", pattern: /repo path|D:\\Code\\smashapp/i },
    { label: "branch", pattern: /\bbranch\b/i },
    { label: "HEAD", pattern: /\bHEAD\b|commit/i },
    { label: "git status or dirty/clean status", pattern: /git status|dirty|clean/i },
  ]) {
    add(
      repoStateChecks,
      label,
      pattern.test(reportText) ? "PASS" : "WARNING",
      pattern.test(reportText) ? "Likely present in report." : "Likely missing from report.",
    );
  }

  const metadata = readMetadata(resolve(jobDir, "metadata.json"));
  const approvedText = approvalText(metadata);
  const dangerousTerms = detectDangerousTerms(reportText);
  if (dangerousTerms.length === 0) {
    add(dangerousChecks, "dangerous terms", "PASS", "No dangerous action terms detected.");
  } else {
    for (const { term, count } of dangerousTerms) {
      const approved = approvedText.includes(term.toLowerCase());
      add(
        dangerousChecks,
        term,
        approved ? "PASS" : "WARNING",
        `${count} occurrence(s) detected${approved ? "; appears in metadata approval text." : "; no clear metadata approval match."}`,
      );
    }
  }
  if (claimsUnapprovedMutationPerformed(reportText)) {
    add(dangerousChecks, "explicit unapproved mutation claim", "BLOCKING", "Report appears to claim an unapproved mutation was performed.");
  }

  const provenanceRelevant = /Balance Environment|campaignId|campaignName|assetSource|live-authored|scenarioMatrix/i.test(reportText);
  if (!provenanceRelevant) {
    add(campaignChecks, "campaign provenance relevance", "PASS", "Report does not appear to be a Balance Environment or scenarioMatrix provenance job.");
  } else {
    for (const phrase of ["campaignId", "campaignName", "assetSource"]) {
      add(
        campaignChecks,
        phrase,
        reportText.includes(phrase) ? "PASS" : "WARNING",
        reportText.includes(phrase) ? "Likely present in report." : "Likely missing from report.",
      );
    }
  }

  if (jobDirExists) {
    const jobFiles = collectJobFiles(jobDir);
    const secretHits = detectSecretPatterns(jobFiles, jobDir);
    if (secretHits.length === 0) {
      add(secretChecks, "secret-like content", "PASS", "No configured secret-like patterns detected in local job files.");
    } else {
      for (const hit of secretHits) {
        add(secretChecks, hit.file, "BLOCKING", `WOULD_QUARANTINE: possible secret-like content detected (${hit.category}).`);
      }
    }
  }

  if (sizeChecks.length === 0) {
    add(sizeChecks, "required files", "WARNING", "No required files were available for size checks.");
  }

  add(notes, "validator scope", "PASS", "Phase 1.5B validator is read-only and does not write validation logs or metadata.");

  const flattened = allChecks.flat();
  const overallStatus = statusFor(flattened);
  const exitCode = overallStatus === "FAIL_BLOCKING" ? 1 : 0;

  console.log(`# Balance Relay Validation — ${jobId}`);
  console.log("\n## Overall Status\n");
  console.log(overallStatus);
  printSection("Repo Storage Checks", repoChecks);
  printSection("Required Files", requiredChecks);
  printSection("Raw Report", rawReportChecks);
  printSection("Summary", summaryChecks);
  printSection("Chief Decision", chiefDecisionChecks);
  printSection("Repo State Evidence", repoStateChecks);
  printSection("Dangerous Action Terms", dangerousChecks);
  printSection("Campaign Provenance", campaignChecks);
  printSection("Secret Scan", secretChecks);
  printSection("Size Checks", sizeChecks);
  printSection("Notes", notes);
  console.log("\n## Exit Code\n");
  console.log(exitCode);
  process.exitCode = exitCode;
}

function main() {
  const { command, jobId } = parseArgs(process.argv.slice(2));
  if (command !== "validate" || !jobId) {
    console.error("Usage: npx --yes tsx scripts/balanceRelay.helper.ts validate --job-id <JOB_ID>");
    process.exitCode = 1;
    return;
  }
  validate(jobId);
}

main();
