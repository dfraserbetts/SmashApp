import { spawnSync } from "node:child_process";

type AuditPayload = {
  campaignId: string;
  campaignName: string;
  repoHead: string;
  gitStatus: string;
  assetSource: string;
  focusedProfiles: AuditProfile[];
};

type AuditProfile = {
  focusKey: string;
  assetName: string;
  attackName: string;
  sourceType: string;
  cooldownRounds: number;
  rangeCategory: string | null;
  targetCount: number | null;
  useResourceSummary: string;
  die: string;
  diceCount: number;
  woundsPerSuccess: number;
  expectedSuccesses: number;
  expectedRawWounds: number;
  maxRawWounds: number;
  p10Raw: number;
  p16Raw: number;
  p20Raw: number;
  multipleOfMediumExpectedRaw: number | null;
  costEvidence: {
    availableCost: number | null;
    costSource: string;
    basePowerValue: number | null;
    playerSpend: number | null;
    signatureMove: boolean;
    itemOutputBand: string | null;
  };
};

type CandidateConstants = {
  baseScalar: number;
  nonlinearWoundsPerSuccessThreshold: number;
  nonlinearWoundsPerSuccessScalar: number;
  p10Scalar: number;
  p16Scalar: number;
  p20Scalar: number;
  d10D12TwoSuccessFaceScalar: number;
  d8ExpectedSuccessesPerDie: number;
};

type CandidateRow = {
  profile: string;
  asset: string;
  action: string;
  dice: string;
  woundsPerSuccess: number;
  expectedRaw: number;
  maxRaw: number;
  p10: number;
  p16: number;
  p20: number;
  xMedium: number | null;
  currentCost: number | null;
  currentCostPerExpectedRaw: number | null;
  modelA: number;
  modelB: number;
  modelC: number;
  modelD: number;
  modelDPerExpectedRaw: number;
  modelDCurrentMultiplier: number | null;
  cooldown: number;
  limiter: string;
  flags: string[];
  judgement: string;
};

type SandboxPayload = {
  title: string;
  provenance: {
    campaignId: string;
    campaignName: string;
    repoHead: string;
    gitStatus: string;
    command: string;
    dataSource: string;
    mutation: "none";
    databaseAccess: "read-only via audit reporter";
    seeders: "none";
  };
  constants: CandidateConstants;
  modelDefinitions: Record<string, string>;
  rows: CandidateRow[];
};

const CONSTANTS: CandidateConstants = {
  // Anchors medium 4D8 W/S 2 expected raw 5 near cost 20.
  baseScalar: 4,
  nonlinearWoundsPerSuccessThreshold: 4,
  nonlinearWoundsPerSuccessScalar: 1.5,
  p10Scalar: 10,
  p16Scalar: 20,
  p20Scalar: 40,
  d10D12TwoSuccessFaceScalar: 2,
  d8ExpectedSuccessesPerDie: 0.625,
};

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) return "UNKNOWN";
  return result.stdout.trim();
}

function exactCommand(): string {
  return ["npx", "--yes", "tsx", "scripts/combatLab.offenceCostModelSandbox.ts", ...process.argv.slice(2)].join(" ");
}

function runAuditReporter(): AuditPayload {
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    npxCommand,
    ["--yes", "tsx", "scripts/combatLab.offenceCostingAudit.ts", "--json"],
    { cwd: process.cwd(), encoding: "utf8", maxBuffer: 1024 * 1024 * 20, shell: true },
  );
  if (result.status !== 0) {
    throw new Error(
      `Audit reporter failed with status ${result.status}.\nERROR:\n${result.error?.message ?? ""}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }
  return JSON.parse(result.stdout) as AuditPayload;
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function twoSuccessFaceProbabilityPerDie(die: string): number {
  const sides = Number(String(die).replace(/^D/i, ""));
  if (!Number.isFinite(sides) || sides <= 0) return 0;
  return Math.max(0, sides - 9) / sides;
}

function expectedRawComponent(profile: AuditProfile): number {
  return profile.expectedRawWounds * CONSTANTS.baseScalar;
}

function nonlinearWoundsPerSuccessSurcharge(profile: AuditProfile): number {
  return Math.max(0, profile.woundsPerSuccess - CONSTANTS.nonlinearWoundsPerSuccessThreshold) ** 2 *
    profile.diceCount *
    CONSTANTS.nonlinearWoundsPerSuccessScalar;
}

function tailThresholdSurcharge(profile: AuditProfile): number {
  return profile.p10Raw * CONSTANTS.p10Scalar +
    profile.p16Raw * CONSTANTS.p16Scalar +
    profile.p20Raw * CONSTANTS.p20Scalar;
}

function dieSizeSurcharge(profile: AuditProfile): number {
  return twoSuccessFaceProbabilityPerDie(profile.die) *
    profile.diceCount *
    profile.woundsPerSuccess *
    CONSTANTS.d10D12TwoSuccessFaceScalar;
}

function modelA(profile: AuditProfile): number {
  return expectedRawComponent(profile);
}

function modelB(profile: AuditProfile): number {
  return expectedRawComponent(profile) + nonlinearWoundsPerSuccessSurcharge(profile);
}

function modelC(profile: AuditProfile): number {
  return expectedRawComponent(profile) + tailThresholdSurcharge(profile);
}

function modelD(profile: AuditProfile): number {
  return expectedRawComponent(profile) +
    nonlinearWoundsPerSuccessSurcharge(profile) +
    dieSizeSurcharge(profile) +
    profile.p16Raw * 30 +
    profile.p20Raw * 60;
}

function issueFlags(profile: AuditProfile): string[] {
  const flags: string[] = [];
  if (profile.costEvidence.availableCost === null) flags.push("missing current cost");
  if (profile.die === "D10" || profile.die === "D12") flags.push("D10/D12 two-success-face access");
  if (profile.woundsPerSuccess > 4) flags.push("W/S above 4");
  if (profile.p20Raw > 0.2) flags.push("P20 > 20%");
  if (profile.sourceType === "signatureMove" && profile.p20Raw > 0.2) flags.push("signature-gated but still burst-risk");
  if (profile.cooldownRounds === 0 && profile.expectedRawWounds >= 10) flags.push("at-will high pressure");
  if (profile.p20Raw === 0 && profile.expectedRawWounds >= 10) flags.push("capped-high but no P20");
  if (profile.sourceType === "equippedWeapon" && profile.costEvidence.availableCost === null) flags.push("Forge item cost disconnected");
  return flags;
}

function judgement(profile: AuditProfile, modelDValue: number): string {
  const current = profile.costEvidence.availableCost;
  if (current === null) return "current cost missing; sandbox cannot compare current economy";
  const multiplier = modelDValue / Math.max(1, current);
  if (multiplier >= 2) return "candidate D materially exceeds current cost";
  if (multiplier >= 1.35) return "candidate D moderately exceeds current cost";
  if (multiplier <= 0.8) return "candidate D below current cost";
  return "candidate D close to current cost";
}

function buildPayload(audit: AuditPayload): SandboxPayload {
  const rows = audit.focusedProfiles.map((profile) => {
    const a = modelA(profile);
    const b = modelB(profile);
    const c = modelC(profile);
    const d = modelD(profile);
    const current = profile.costEvidence.availableCost;
    return {
      profile: profile.focusKey,
      asset: profile.assetName,
      action: profile.attackName,
      dice: `${profile.diceCount}x${profile.die}`,
      woundsPerSuccess: profile.woundsPerSuccess,
      expectedRaw: round(profile.expectedRawWounds),
      maxRaw: round(profile.maxRawWounds),
      p10: round(profile.p10Raw * 100, 1),
      p16: round(profile.p16Raw * 100, 1),
      p20: round(profile.p20Raw * 100, 1),
      xMedium: profile.multipleOfMediumExpectedRaw === null ? null : round(profile.multipleOfMediumExpectedRaw),
      currentCost: current,
      currentCostPerExpectedRaw: current === null ? null : round(current / Math.max(1, profile.expectedRawWounds)),
      modelA: round(a),
      modelB: round(b),
      modelC: round(c),
      modelD: round(d),
      modelDPerExpectedRaw: round(d / Math.max(1, profile.expectedRawWounds)),
      modelDCurrentMultiplier: current === null ? null : round(d / Math.max(1, current)),
      cooldown: profile.cooldownRounds,
      limiter: profile.sourceType === "signatureMove"
        ? "signature pool; cooldown reported separately"
        : profile.cooldownRounds > 0
          ? `cooldown ${profile.cooldownRounds}; no blind discount applied`
          : "at-will/no cooldown",
      flags: issueFlags(profile),
      judgement: judgement(profile, d),
    };
  });

  return {
    title: "Balance Environment Level 3 Offence Cost Model Sandbox",
    provenance: {
      campaignId: audit.campaignId,
      campaignName: audit.campaignName,
      repoHead: runGit(["rev-parse", "HEAD"]),
      gitStatus: runGit(["status", "--short", "--untracked-files=all"]),
      command: exactCommand(),
      dataSource: "balance-campaign-authored via scripts/combatLab.offenceCostingAudit.ts --json",
      mutation: "none",
      databaseAccess: "read-only via audit reporter",
      seeders: "none",
    },
    constants: CONSTANTS,
    modelDefinitions: {
      model0: "Current resolved cost where available; missing for natural attacks and item rows without persisted spent FP.",
      modelA: "expectedRawWounds * baseScalar. baseScalar=4 anchors medium 4D8 W/S 2 expected raw 5 near cost 20.",
      modelB: "modelA + max(0, W/S - 4)^2 * diceCount * 1.5.",
      modelC: "modelA + P10*10 + P16*20 + P20*40, with probabilities expressed 0-1.",
      modelD: "modelA + nonlinear W/S surcharge + two-success-face surcharge + P16*30 + P20*60. Cooldown/signature are reported separately, not blindly discounted.",
    },
    rows,
  };
}

function fmt(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function printPayload(payload: SandboxPayload) {
  console.log(payload.title);
  console.log(`Campaign: ${payload.provenance.campaignName} (${payload.provenance.campaignId})`);
  console.log(`Repo HEAD: ${payload.provenance.repoHead}`);
  console.log(`Git status: ${payload.provenance.gitStatus ? "dirty" : "clean"}`);
  console.log(`Command: ${payload.provenance.command}`);
  console.log(`Data source: ${payload.provenance.dataSource}`);
  console.log(`Mutation: ${payload.provenance.mutation}; database: ${payload.provenance.databaseAccess}; seeders: ${payload.provenance.seeders}`);
  console.log(`Constants: ${JSON.stringify(payload.constants)}`);
  console.log("");

  console.log("Profile pressure table");
  console.log([
    "Profile".padEnd(29),
    "Dice".padEnd(8),
    "W/S".padStart(4),
    "Exp".padStart(7),
    "Max".padStart(7),
    "P10".padStart(7),
    "P16".padStart(7),
    "P20".padStart(7),
    "xMed".padStart(7),
    "Current".padStart(8),
    "Cur/Exp".padStart(8),
  ].join(" | "));
  console.log("-".repeat(125));
  for (const row of payload.rows) {
    console.log([
      row.profile.slice(0, 29).padEnd(29),
      row.dice.padEnd(8),
      String(row.woundsPerSuccess).padStart(4),
      fmt(row.expectedRaw).padStart(7),
      fmt(row.maxRaw).padStart(7),
      `${fmt(row.p10, 1)}%`.padStart(7),
      `${fmt(row.p16, 1)}%`.padStart(7),
      `${fmt(row.p20, 1)}%`.padStart(7),
      fmt(row.xMedium).padStart(7),
      fmt(row.currentCost).padStart(8),
      fmt(row.currentCostPerExpectedRaw).padStart(8),
    ].join(" | "));
  }

  console.log("");
  console.log("Candidate model comparison");
  console.log([
    "Profile".padEnd(29),
    "Current".padStart(8),
    "A".padStart(8),
    "B".padStart(8),
    "C".padStart(8),
    "D".padStart(8),
    "D/Exp".padStart(8),
    "D/Cur".padStart(8),
    "Judgement".padEnd(42),
  ].join(" | "));
  console.log("-".repeat(145));
  for (const row of payload.rows) {
    console.log([
      row.profile.slice(0, 29).padEnd(29),
      fmt(row.currentCost).padStart(8),
      fmt(row.modelA).padStart(8),
      fmt(row.modelB).padStart(8),
      fmt(row.modelC).padStart(8),
      fmt(row.modelD).padStart(8),
      fmt(row.modelDPerExpectedRaw).padStart(8),
      fmt(row.modelDCurrentMultiplier).padStart(8),
      row.judgement.slice(0, 42).padEnd(42),
    ].join(" | "));
  }

  console.log("");
  console.log("Issue flags");
  for (const row of payload.rows) {
    if (row.flags.length === 0) continue;
    console.log(`- ${row.profile}: ${row.flags.join("; ")} (${row.limiter})`);
  }
}

function main() {
  const payload = buildPayload(runAuditReporter());
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  printPayload(payload);
}

main();
