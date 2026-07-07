import { spawnSync } from "node:child_process";

type SandboxPayload = {
  provenance: {
    campaignId: string;
    campaignName: string;
    repoHead: string;
    gitStatus: string;
  };
  rows: SandboxRow[];
};

type SandboxRow = {
  profile: string;
  action: string;
  dice: string;
  woundsPerSuccess: number;
  expectedRaw: number;
  maxRaw: number;
  p16: number;
  p20: number;
  currentCost: number | null;
  modelD: number;
  flags: string[];
};

type FocusRow = {
  profile: string;
  label: string;
  pool: "normal" | "signature";
  currentCost: number | null;
  modelD: number;
  directReplacement: {
    cost: number;
    legal: boolean;
    poolLimit: number;
  };
  additive: {
    cost: number | null;
    surcharge: number | null;
  };
  burst: {
    score: number;
    tier: "low" | "watch" | "high" | "extreme";
  };
  hybrid: {
    cost: number | null;
    surcharge: number | null;
    flag: string;
  };
  recommendedTreatment: string;
};

const NORMAL_POWER_POOL_LEVEL_3 = 150;
const SIGNATURE_MOVE_POOL_LEVEL_3 = 60;

const FOCUS_PROFILES = new Map<string, { label: string; pool: "normal" | "signature" }>([
  ["sage-mind-spark", { label: "Mind Spark", pool: "normal" }],
  ["sage-mind-lance", { label: "Mind Lance", pool: "normal" }],
  ["hawkshot-raking-shot", { label: "Raking Shot", pool: "normal" }],
  ["hawkshot-skyline-shot", { label: "Skyline Shot", pool: "signature" }],
  ["ranger-marked-volley", { label: "Marked Volley", pool: "normal" }],
  ["ranger-killbox", { label: "Killbox Command", pool: "signature" }],
  ["stoneguard-breaker-slam", { label: "Breaker Slam", pool: "normal" }],
]);

const ADDITIVE_CONSTANTS = {
  woundsPerSuccessThreshold: 4,
  woundsPerSuccessScalar: 0.75,
  twoSuccessFaceScalar: 1,
  p16Scalar: 10,
  p20Scalar: 25,
};

const BURST_SCORE_CONSTANTS = {
  woundsPerSuccessStepScalar: 5,
  twoSuccessFaceScalar: 10,
  p16Scalar: 40,
  p20Scalar: 80,
};

const HYBRID_CONSTANTS = {
  woundsPerSuccessThreshold: 4,
  woundsPerSuccessScalar: 0.5,
  twoSuccessFaceScalar: 0.75,
  p16Scalar: 5,
  p20Scalar: 15,
  extremeP20Flag: 50,
};

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function runSandbox(): SandboxPayload {
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  return JSON.parse(
    run(npxCommand, ["--yes", "tsx", "scripts/combatLab.offenceCostModelSandbox.ts", "--json"]),
  ) as SandboxPayload;
}

function git(args: string[]) {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "UNKNOWN";
}

function round(value: number, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function twoSuccessFaceProbability(row: SandboxRow) {
  const sides = Number(row.dice.split("x")[1]?.replace(/^D/i, ""));
  if (!Number.isFinite(sides) || sides <= 0) return 0;
  return Math.max(0, sides - 9) / sides;
}

function woundsPerSuccessOverage(row: SandboxRow) {
  return Math.max(0, row.woundsPerSuccess - ADDITIVE_CONSTANTS.woundsPerSuccessThreshold);
}

function diceCount(row: SandboxRow) {
  return Math.max(1, Number(row.dice.split("x")[0]) || 1);
}

function additiveSurcharge(row: SandboxRow) {
  return round(
    woundsPerSuccessOverage(row) ** 2 * diceCount(row) * ADDITIVE_CONSTANTS.woundsPerSuccessScalar +
      twoSuccessFaceProbability(row) * diceCount(row) * row.woundsPerSuccess * ADDITIVE_CONSTANTS.twoSuccessFaceScalar +
      (row.p16 / 100) * ADDITIVE_CONSTANTS.p16Scalar +
      (row.p20 / 100) * ADDITIVE_CONSTANTS.p20Scalar,
  );
}

function burstPressureScore(row: SandboxRow) {
  return round(
    woundsPerSuccessOverage(row) * diceCount(row) * BURST_SCORE_CONSTANTS.woundsPerSuccessStepScalar +
      twoSuccessFaceProbability(row) * diceCount(row) * BURST_SCORE_CONSTANTS.twoSuccessFaceScalar +
      (row.p16 / 100) * BURST_SCORE_CONSTANTS.p16Scalar +
      (row.p20 / 100) * BURST_SCORE_CONSTANTS.p20Scalar,
    1,
  );
}

function burstTier(score: number): FocusRow["burst"]["tier"] {
  if (score >= 85) return "extreme";
  if (score >= 50) return "high";
  if (score >= 20) return "watch";
  return "low";
}

function hybridSurcharge(row: SandboxRow) {
  return round(
    woundsPerSuccessOverage(row) ** 2 * diceCount(row) * HYBRID_CONSTANTS.woundsPerSuccessScalar +
      twoSuccessFaceProbability(row) * diceCount(row) * row.woundsPerSuccess * HYBRID_CONSTANTS.twoSuccessFaceScalar +
      (row.p16 / 100) * HYBRID_CONSTANTS.p16Scalar +
      (row.p20 / 100) * HYBRID_CONSTANTS.p20Scalar,
  );
}

function poolLimit(pool: FocusRow["pool"]) {
  return pool === "signature" ? SIGNATURE_MOVE_POOL_LEVEL_3 : NORMAL_POWER_POOL_LEVEL_3;
}

function recommendation(row: SandboxRow, focus: { pool: FocusRow["pool"] }, score: number) {
  if (row.currentCost === null) return "Resolve missing cost evidence before pricing.";
  if (focus.pool === "signature" && row.modelD > SIGNATURE_MOVE_POOL_LEVEL_3 && score >= 85) {
    return "Keep signature legal only with warning/legality gate; direct replacement breaks pool.";
  }
  if (score >= 85) return "Apply surcharge and hard burst warning.";
  if (score >= 50) return "Apply surcharge and warning.";
  if (woundsPerSuccessOverage(row) > 0) return "Light surcharge; no hard warning.";
  return "Do not increase; already low-pressure.";
}

function buildRows(payload: SandboxPayload): FocusRow[] {
  return payload.rows
    .filter((row) => FOCUS_PROFILES.has(row.profile))
    .map((row) => {
      const focus = FOCUS_PROFILES.get(row.profile)!;
      const additive = additiveSurcharge(row);
      const burstScore = burstPressureScore(row);
      const hybrid = hybridSurcharge(row);
      const limit = poolLimit(focus.pool);
      const hybridCost = row.currentCost === null ? null : round(row.currentCost + hybrid);
      const flag = row.p20 >= HYBRID_CONSTANTS.extremeP20Flag
        ? "extreme P20 legality review"
        : burstScore >= 50
          ? "burst warning"
          : "none";
      return {
        profile: row.profile,
        label: focus.label,
        pool: focus.pool,
        currentCost: row.currentCost,
        modelD: row.modelD,
        directReplacement: {
          cost: row.modelD,
          legal: row.modelD <= limit,
          poolLimit: limit,
        },
        additive: {
          cost: row.currentCost === null ? null : round(row.currentCost + additive),
          surcharge: row.currentCost === null ? null : additive,
        },
        burst: {
          score: burstScore,
          tier: burstTier(burstScore),
        },
        hybrid: {
          cost: hybridCost,
          surcharge: row.currentCost === null ? null : hybrid,
          flag,
        },
        recommendedTreatment: recommendation(row, focus, burstScore),
      };
    });
}

function format(value: number | null | boolean) {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === null) return "-";
  return value.toFixed(2);
}

function print(rows: FocusRow[], payload: SandboxPayload) {
  console.log("Offence Cost Model Normalisation");
  console.log(`Campaign: ${payload.provenance.campaignName} (${payload.provenance.campaignId})`);
  console.log(`Repo HEAD: ${git(["rev-parse", "HEAD"])}`);
  console.log(`Git status: ${git(["status", "--short", "--untracked-files=all"]) || "clean"}`);
  console.log(`Data source: scripts/combatLab.offenceCostModelSandbox.ts --json`);
  console.log(`Mutation: none; DB writes: none; seeders: none`);
  console.log("");
  console.log("Constants");
  console.log(JSON.stringify({ ADDITIVE_CONSTANTS, BURST_SCORE_CONSTANTS, HYBRID_CONSTANTS }, null, 2));
  console.log("");
  console.log([
    "Profile".padEnd(20),
    "Current".padStart(8),
    "Model D".padStart(8),
    "Direct legal".padStart(12),
    "Add cost".padStart(9),
    "Burst".padStart(8),
    "Tier".padStart(8),
    "Hybrid".padStart(8),
    "Flag".padEnd(28),
    "Treatment".padEnd(48),
  ].join(" | "));
  console.log("-".repeat(180));
  for (const row of rows) {
    console.log([
      row.label.padEnd(20),
      format(row.currentCost).padStart(8),
      format(row.modelD).padStart(8),
      `${format(row.directReplacement.legal)} <= ${row.directReplacement.poolLimit}`.padStart(12),
      format(row.additive.cost).padStart(9),
      format(row.burst.score).padStart(8),
      row.burst.tier.padStart(8),
      format(row.hybrid.cost).padStart(8),
      row.hybrid.flag.padEnd(28),
      row.recommendedTreatment.padEnd(48),
    ].join(" | "));
  }
}

function main() {
  const payload = runSandbox();
  const rows = buildRows(payload);
  const output = {
    provenance: {
      ...payload.provenance,
      command: ["npx", "--yes", "tsx", "scripts/combatLab.offenceCostModelNormalisation.ts", ...process.argv.slice(2)].join(" "),
      repoHead: git(["rev-parse", "HEAD"]),
      gitStatus: git(["status", "--short", "--untracked-files=all"]),
      mutation: "none",
      databaseAccess: "read-only via sandbox reporter",
      seeders: "none",
    },
    constants: { ADDITIVE_CONSTANTS, BURST_SCORE_CONSTANTS, HYBRID_CONSTANTS },
    poolContext: {
      level: 3,
      normalPowerPool: NORMAL_POWER_POOL_LEVEL_3,
      signatureMovePool: SIGNATURE_MOVE_POOL_LEVEL_3,
    },
    rows,
  };
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  print(rows, payload);
}

main();
