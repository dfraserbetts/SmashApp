import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expectedSuccesses } from "../lib/combat-lab/dice";
import { adaptMonsterToCombatLabActor } from "../lib/combat-lab/liveAdapters";
import { runScenarioSuite } from "../lib/combat-lab/reporting";
import type { CombatAction, CombatActor, CombatDieSize, CombatScenario, CombatSuiteReport } from "../lib/combat-lab/types";
import { normalizeCombatTuning, normalizeCombatTuningFlatValues } from "../lib/config/combatTuningShared";
import { normalizePowerTuningValues, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const CANDIDATE_PREFIX = "BALANCE_ATK_L3_AttackString_";

type PrismaClient = typeof import("../prisma/client")["prisma"];
type TierName = "MINION" | "SOLDIER" | "ELITE" | "BOSS";
type Verdict = "PASS" | "LOW" | "HIGH" | "HIGH/CENSORED" | "UNCLEAR";

type CliOptions = {
  balanceEnvironment: boolean;
  runs: number;
  seed: number;
  json: boolean;
};

type TierBand = {
  tier: TierName;
  targetName: string;
  label: string;
  min: number;
  max: number | null;
};

type CandidateProfile = {
  id: string;
  name: string;
  candidate: string;
  actor: CombatActor;
  action: CombatAction;
  channel: "physical" | "mental";
  diceCount: number;
  die: CombatDieSize;
  woundsPerSuccess: number;
  expectedSuccesses: number;
  expectedWoundsPerAttack: number;
  warnings: string[];
};

type TargetProfile = {
  id: string;
  name: string;
  tier: TierName;
  actor: CombatActor;
  warnings: string[];
};

type ResultRow = {
  candidate: string;
  channel: "physical" | "mental";
  diceCount: number;
  die: CombatDieSize;
  woundsPerSuccess: number;
  expectedSuccesses: number;
  expectedWoundsPerAttack: number;
  target: string;
  tier: TierName;
  band: string;
  avgAttacksToKill: number | null;
  medianAttacksToKill: number | null;
  defeatedCount: number;
  censoredCount: number;
  verdict: Verdict;
};

type CandidateSummary = {
  candidate: string;
  channel: "physical" | "mental";
  expectedWoundsPerAttack: number;
  minion: string;
  soldier: string;
  elite: string;
  boss: string;
};

const TIER_BANDS: TierBand[] = [
  { tier: "MINION", targetName: "BALANCE_ATK_Minion_Target", label: "1-2 Medium Strength Attacks", min: 1, max: 2 },
  { tier: "SOLDIER", targetName: "BALANCE_ATK_Soldier_Target", label: "2-3 Medium Strength Attacks", min: 2, max: 3 },
  { tier: "ELITE", targetName: "BALANCE_ATK_Elite_Target", label: "4-6 Medium Strength Attacks", min: 4, max: 6 },
  { tier: "BOSS", targetName: "BALANCE_ATK_Boss_Target", label: "16+ Medium Strength Attacks", min: 16, max: null },
];

let prisma!: PrismaClient;
let prismaLoaded = false;

const POWER_INCLUDE = {
  rangeCategories: { orderBy: { rangeCategory: "asc" as const } },
  primaryDefenceGate: true,
  effectPackets: {
    orderBy: { packetIndex: "asc" as const },
    include: { localTargetingOverride: true },
  },
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    balanceEnvironment: false,
    runs: 25,
    seed: 4242,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--balance-environment") {
      options.balanceEnvironment = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--runs") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) options.runs = Math.trunc(value);
      index += 1;
      continue;
    }
    if (arg === "--seed") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value)) options.seed = Math.trunc(value);
      index += 1;
    }
  }
  return options;
}

function loadEnvFile(relativePath: string) {
  const filePath = join(process.cwd(), relativePath);
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function getPrisma(): Promise<PrismaClient> {
  if (!prismaLoaded) {
    loadEnvFile(".env");
    loadEnvFile(".env.local");
    prisma = (await import("../prisma/client")).prisma;
    prismaLoaded = true;
  }
  return prisma;
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

async function loadActiveTuning() {
  const [powerSet, combatSet] = await Promise.all([
    prisma.powerTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
    prisma.combatTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
  ]);
  if (!powerSet || !combatSet) {
    throw new Error("Missing ACTIVE Power or Combat tuning set. Attack-string calibration is read-only and does not seed tuning.");
  }
  const powerSnapshot: PowerTuningSnapshot = {
    setId: powerSet.id,
    name: powerSet.name,
    slug: powerSet.slug,
    status: powerSet.status,
    updatedAt: powerSet.updatedAt.toISOString(),
    values: normalizePowerTuningValues(entriesToRecord(powerSet.entries)),
  };
  const combatSnapshot = {
    setId: combatSet.id,
    name: combatSet.name,
    slug: combatSet.slug,
    status: combatSet.status,
    updatedAt: combatSet.updatedAt.toISOString(),
    values: normalizeCombatTuningFlatValues(entriesToRecord(combatSet.entries)),
  };
  return {
    powerSnapshot,
    combatValues: normalizeCombatTuning(combatSnapshot.values),
    activeTuning: {
      power: { setId: powerSnapshot.setId, name: powerSnapshot.name, slug: powerSnapshot.slug },
      combat: { setId: combatSnapshot.setId, name: combatSnapshot.name, slug: combatSnapshot.slug },
    },
  };
}

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) return "UNKNOWN";
  return result.stdout.trim();
}

function exactCommand() {
  return ["npx", "--yes", "tsx", "scripts/combatLab.attackStringCalibration.ts", ...process.argv.slice(2)].join(" ");
}

function round(value: number | null, places = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function roundNumber(value: number, places = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function warningsToStrings(warnings: unknown[]): string[] {
  return warnings.map((warning) => {
    if (typeof warning === "string") return warning;
    if (warning && typeof warning === "object" && "message" in warning) {
      return String((warning as { message: unknown }).message);
    }
    return JSON.stringify(warning);
  });
}

function tierBand(tier: TierName): TierBand {
  const band = TIER_BANDS.find((entry) => entry.tier === tier);
  if (!band) throw new Error(`Unsupported target tier ${tier}.`);
  return band;
}

function verdictFor(value: number | null, band: TierBand, defeatedCount: number, censoredCount: number): Verdict {
  if (defeatedCount <= 0 || value === null) return "UNCLEAR";
  if (censoredCount > 0 && censoredCount >= defeatedCount) return "HIGH/CENSORED";
  if (value < band.min) return "LOW";
  if (band.max !== null && value > band.max) return censoredCount > 0 ? "HIGH/CENSORED" : "HIGH";
  return "PASS";
}

function scenario(profile: CandidateProfile, target: TargetProfile, options: CliOptions): CombatScenario {
  return {
    name: `L3 Attack String ${profile.candidate} ${profile.channel} vs ${target.name}`,
    players: [
      {
        ...profile.actor,
        side: "players",
        actions: [profile.action],
        actionsPerTurn: 1,
      },
    ],
    monsters: [
      {
        ...target.actor,
        actions: [],
        actionsPerTurn: 0,
      },
    ],
    runs: options.runs,
    seed: options.seed,
    maxRounds: 240,
    turnOrder: "playersFirst",
  };
}

function rowFromReport(profile: CandidateProfile, target: TargetProfile, report: CombatSuiteReport): ResultRow {
  const metrics = report.defeatMetrics.monsterDefeated;
  const avg = round(metrics.avgMeaningfulActionsToDefeat);
  const censoredCount = Math.max(0, report.runs - metrics.sampleCount);
  const band = tierBand(target.tier);
  return {
    candidate: profile.candidate,
    channel: profile.channel,
    diceCount: profile.diceCount,
    die: profile.die,
    woundsPerSuccess: profile.woundsPerSuccess,
    expectedSuccesses: profile.expectedSuccesses,
    expectedWoundsPerAttack: profile.expectedWoundsPerAttack,
    target: target.name,
    tier: target.tier,
    band: band.label,
    avgAttacksToKill: avg,
    medianAttacksToKill: round(metrics.medianMeaningfulActionsToDefeat),
    defeatedCount: metrics.sampleCount,
    censoredCount,
    verdict: verdictFor(avg, band, metrics.sampleCount, censoredCount),
  };
}

function formatResult(value: number | null, verdict: Verdict) {
  return `${value === null ? "n/a" : value} ${verdict}`;
}

function summarizeCandidateRows(rows: ResultRow[]): CandidateSummary[] {
  const byCandidate = new Map<string, ResultRow[]>();
  for (const row of rows) {
    const key = `${row.candidate}:${row.channel}`;
    byCandidate.set(key, [...(byCandidate.get(key) ?? []), row]);
  }
  return Array.from(byCandidate.values()).map((candidateRows) => {
    const first = candidateRows[0];
    const byTier = new Map(candidateRows.map((row) => [row.tier, row]));
    const minion = byTier.get("MINION");
    const soldier = byTier.get("SOLDIER");
    const elite = byTier.get("ELITE");
    const boss = byTier.get("BOSS");
    return {
      candidate: first.candidate,
      channel: first.channel,
      expectedWoundsPerAttack: first.expectedWoundsPerAttack,
      minion: minion ? formatResult(minion.avgAttacksToKill, minion.verdict) : "missing",
      soldier: soldier ? formatResult(soldier.avgAttacksToKill, soldier.verdict) : "missing",
      elite: elite ? formatResult(elite.avgAttacksToKill, elite.verdict) : "missing",
      boss: boss ? formatResult(boss.avgAttacksToKill, boss.verdict) : "missing",
    };
  });
}

function candidateLabel(name: string) {
  return name.replace(CANDIDATE_PREFIX, "");
}

async function discoverAssets() {
  const client = await getPrisma();
  const campaign = await client.campaign.findUnique({
    where: { id: BALANCE_CAMPAIGN_ID },
    select: { id: true, name: true },
  });
  if (!campaign) throw new Error(`Balance Environment campaign not found: ${BALANCE_CAMPAIGN_ID}`);
  if (campaign.name !== BALANCE_CAMPAIGN_NAME) {
    throw new Error(`Campaign name mismatch: expected ${BALANCE_CAMPAIGN_NAME}, found ${campaign.name}.`);
  }
  const tuning = await loadActiveTuning();
  const monsters = await client.monster.findMany({
    where: {
      campaignId: campaign.id,
      source: "CAMPAIGN",
      isReadOnly: false,
      OR: [
        { name: { startsWith: CANDIDATE_PREFIX } },
        { name: { in: TIER_BANDS.map((band) => band.targetName) } },
      ],
    },
    orderBy: { name: "asc" },
    include: {
      naturalAttack: true,
      attacks: { orderBy: { sortOrder: "asc" } },
      traits: { orderBy: { sortOrder: "asc" }, include: { trait: { select: { name: true, effectText: true } } } },
      powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
    },
  });
  const adapted = monsters.map((row) => {
    const result = adaptMonsterToCombatLabActor(
      row as Parameters<typeof adaptMonsterToCombatLabActor>[0],
      new Map(),
      tuning.combatValues,
      tuning.powerSnapshot,
    );
    return { row, result, warnings: warningsToStrings(result.warnings) };
  });

  const candidates: CandidateProfile[] = adapted
    .filter((entry) => entry.row.name.startsWith(CANDIDATE_PREFIX))
    .flatMap((entry) => entry.result.actor.actions
      .filter((action) =>
        action.kind === "attack" &&
        action.supported &&
        action.sourceType === "naturalAttack" &&
        (action.pool === "physical" || action.pool === "mental"),
      )
      .map((action) => {
        const channel = action.pool === "mental" ? "mental" : "physical";
        const die = entry.result.actor.attributeDice[action.accuracyAttribute] ?? "D8";
        const successes = expectedSuccesses(Math.max(1, action.diceCount), die);
        return {
          id: `${entry.row.id}:${action.id}`,
          name: `${entry.row.name} / ${action.name}`,
          candidate: candidateLabel(entry.row.name),
          actor: entry.result.actor,
          action,
          channel,
          diceCount: Math.max(1, action.diceCount),
          die,
          woundsPerSuccess: Math.max(0, action.potency),
          expectedSuccesses: roundNumber(successes),
          expectedWoundsPerAttack: roundNumber(successes * Math.max(0, action.potency)),
          warnings: entry.warnings,
        };
      }));

  const targets: TargetProfile[] = TIER_BANDS.map((band) => {
    const entry = adapted.find((row) => row.row.name === band.targetName);
    if (!entry) throw new Error(`Missing target asset: ${band.targetName}`);
    return {
      id: entry.row.id,
      name: entry.row.name,
      tier: band.tier,
      actor: entry.result.actor,
      warnings: entry.warnings,
    };
  });

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    activeTuning: tuning.activeTuning,
    candidates,
    targets,
    warnings: adapted.flatMap((entry) => entry.warnings.map((warning) => `${entry.row.name}: ${warning}`)),
  };
}

async function buildPayload(options: CliOptions) {
  if (!options.balanceEnvironment) {
    throw new Error("Pass --balance-environment to confirm this report uses authored Balance Environment assets.");
  }
  const discovery = await discoverAssets();
  if (discovery.candidates.length === 0) {
    throw new Error(`No ${CANDIDATE_PREFIX} candidate actions found. Run scripts/balanceEnvironment.ensureAtkAttackStringCandidates.ts first.`);
  }
  const rows: ResultRow[] = [];
  for (const candidate of discovery.candidates) {
    for (const target of discovery.targets) {
      const report = runScenarioSuite(scenario(candidate, target, options));
      rows.push(rowFromReport(candidate, target, report));
    }
  }
  return {
    report: "Combat Lab Level 3 Attack String Calibration",
    mode: "attack-string-calibration",
    campaignId: discovery.campaignId,
    campaignName: discovery.campaignName,
    assetSource: "balance-campaign-authored",
    mutation: "none",
    databaseAccess: "read-only",
    seeders: "none",
    runsPerScenario: options.runs,
    seed: options.seed,
    repoHead: runGit(["rev-parse", "HEAD"]),
    gitStatus: runGit(["status", "--short"]),
    exactCommand: exactCommand(),
    activeTuning: discovery.activeTuning,
    doctrineNote:
      "Attack-string calibration only. Candidate strings are not final doctrine. Existing BALANCE_ATK_* target assets were created from an earlier provisional 3D8_W2 ruler, so final doctrine still requires attack/defence offset validation.",
    candidates: discovery.candidates.map((candidate) => ({
      name: candidate.candidate,
      channel: candidate.channel,
      diceCount: candidate.diceCount,
      die: candidate.die,
      woundsPerSuccess: candidate.woundsPerSuccess,
      expectedSuccesses: candidate.expectedSuccesses,
      expectedWoundsPerAttack: candidate.expectedWoundsPerAttack,
      physicalAttackExists: discovery.candidates.some((entry) => entry.candidate === candidate.candidate && entry.channel === "physical"),
      mentalAttackExists: discovery.candidates.some((entry) => entry.candidate === candidate.candidate && entry.channel === "mental"),
    })),
    targets: discovery.targets.map((target) => ({
      name: target.name,
      tier: target.tier,
      physicalHp: target.actor.physicalHpMax,
      mentalHp: target.actor.mentalHpMax,
      dodgeDice: target.actor.dodgeDice,
      physicalDefenceDice: target.actor.physicalDefenceDice,
      physicalBlockPerSuccess: target.actor.physicalBlockPerSuccess,
      mentalDefenceDice: target.actor.mentalDefenceDice,
      mentalBlockPerSuccess: target.actor.mentalBlockPerSuccess,
    })),
    summaries: summarizeCandidateRows(rows),
    rows,
    warnings: discovery.warnings,
  };
}

function printPayload(payload: Awaited<ReturnType<typeof buildPayload>>) {
  console.log(payload.report);
  console.log(`Mode: ${payload.mode}`);
  console.log(`Asset source: ${payload.assetSource}`);
  console.log(`Campaign: ${payload.campaignName} (${payload.campaignId})`);
  console.log(`Mutation: ${payload.mutation}; DB access: ${payload.databaseAccess}; seeders: ${payload.seeders}`);
  console.log(`Repo HEAD: ${payload.repoHead}`);
  console.log(`Git status: ${payload.gitStatus || "clean"}`);
  console.log(`Exact command: ${payload.exactCommand}`);
  console.log(`Runs per scenario: ${payload.runsPerScenario}`);
  console.log(`Seed: ${payload.seed}`);
  console.log(`Power tuning: ${payload.activeTuning.power.name} (${payload.activeTuning.power.slug})`);
  console.log(`Combat tuning: ${payload.activeTuning.combat.name} (${payload.activeTuning.combat.slug})`);
  console.log(payload.doctrineNote);

  console.log("\nCandidate Attack Strings:");
  const uniqueCandidates = new Map<string, typeof payload.candidates[number][]>();
  for (const candidate of payload.candidates) {
    uniqueCandidates.set(candidate.name, [...(uniqueCandidates.get(candidate.name) ?? []), candidate]);
  }
  for (const [name, entries] of uniqueCandidates) {
    const first = entries[0];
    const channels = entries.map((entry) => entry.channel).join("/");
    console.log(
      `- ${name}: ${first.diceCount} x ${first.die}, ${first.woundsPerSuccess} wounds/success, ` +
      `expected successes ${first.expectedSuccesses}, expected wounds/attack ${first.expectedWoundsPerAttack}, channels ${channels}.`,
    );
  }

  console.log("\nSummary:");
  console.log(
    "Candidate                 | Channel  | Exp W/A | Minion        | Soldier       | Elite         | Boss",
  );
  console.log("-".repeat(116));
  for (const summary of payload.summaries) {
    console.log(
      `${summary.candidate.padEnd(25)} | ${summary.channel.padEnd(8)} | ${String(summary.expectedWoundsPerAttack).padStart(7)} | ` +
      `${summary.minion.padEnd(13)} | ${summary.soldier.padEnd(13)} | ${summary.elite.padEnd(13)} | ${summary.boss}`,
    );
  }

  console.log("\nDetailed Rows:");
  console.log(
    "Candidate                 | Channel  | Target                    | Tier     | Avg | Med | Def | Cens | Verdict",
  );
  console.log("-".repeat(122));
  for (const row of payload.rows) {
    console.log(
      `${row.candidate.padEnd(25)} | ${row.channel.padEnd(8)} | ${row.target.padEnd(25)} | ${row.tier.padEnd(8)} | ` +
      `${String(row.avgAttacksToKill ?? "n/a").padStart(4)} | ${String(row.medianAttacksToKill ?? "n/a").padStart(3)} | ` +
      `${String(row.defeatedCount).padStart(3)} | ${String(row.censoredCount).padStart(4)} | ${row.verdict}`,
    );
  }

  const relevantWarnings = payload.warnings.filter((warning) =>
    /Damage hydration warning|defence summary|Physical Defence/i.test(warning),
  );
  if (relevantWarnings.length > 0) {
    console.log("\nAdapter/runtime notes:");
    for (const warning of Array.from(new Set(relevantWarnings))) {
      console.log(`- ${warning}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = await buildPayload(options);
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printPayload(payload);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prismaLoaded && prisma) await prisma.$disconnect();
  });
