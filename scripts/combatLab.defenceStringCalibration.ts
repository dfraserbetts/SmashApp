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
const ATTACK_PREFIX = "BALANCE_ATK_L3_AttackString_";
const DEFENCE_PREFIX = "BALANCE_DEF_L3_";
const SOLDIER_MIN = 2;
const SOLDIER_MAX = 3;

const INCLUDED_ATTACKS = new Set(["3D8_W2", "4D8_W2", "3D8_W3", "3D8_W4", "4D8_W3"]);
const DEFENCE_ORDER = [
  "BALANCE_DEF_L3_Soldier_No_Defence",
  "BALANCE_DEF_L3_Soldier_Light_Defence",
  "BALANCE_DEF_L3_Soldier_Standard_Defence",
  "BALANCE_DEF_L3_Soldier_Heavy_Defence",
  "BALANCE_DEF_L3_Soldier_Physical_Biased",
  "BALANCE_DEF_L3_Soldier_Mental_Biased",
];

type PrismaClient = typeof import("../prisma/client")["prisma"];
type Verdict = "PASS" | "LOW" | "HIGH" | "HIGH/CENSORED" | "UNCLEAR";

type CliOptions = {
  balanceEnvironment: boolean;
  runs: number;
  seed: number;
  json: boolean;
};

type AttackProfile = {
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

type DefenceProfile = {
  id: string;
  name: string;
  label: string;
  actor: CombatActor;
  authored: {
    physicalHp: number;
    mentalHp: number;
    physicalProtection: number;
    mentalProtection: number;
    guardDie: string;
    fortitudeDie: string;
    intellectDie: string;
    synergyDie: string;
    braveryDie: string;
    armorSkillValue: number;
  };
  runtime: {
    dodgeDice: number;
    physicalDefenceDice: number;
    physicalBlockPerSuccess: number;
    mentalDefenceDice: number;
    mentalBlockPerSuccess: number;
  };
  warnings: string[];
};

type ResultRow = {
  attack: string;
  channel: "physical" | "mental";
  defence: string;
  expectedWoundsPerAttack: number;
  avgAttacksToKill: number | null;
  medianAttacksToKill: number | null;
  defeatedCount: number;
  censoredCount: number;
  verdict: Verdict;
};

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
  const options: CliOptions = { balanceEnvironment: false, runs: 25, seed: 4242, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--balance-environment") options.balanceEnvironment = true;
    if (arg === "--json") options.json = true;
    if (arg === "--runs") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) options.runs = Math.trunc(value);
      index += 1;
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
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

async function loadActiveTuning(client: PrismaClient) {
  const [powerSet, combatSet] = await Promise.all([
    client.powerTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
    client.combatTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
  ]);
  if (!powerSet || !combatSet) {
    throw new Error("Missing ACTIVE Power or Combat tuning set. Defence-string calibration does not seed tuning.");
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
  return result.status === 0 ? result.stdout.trim() : "UNKNOWN";
}

function exactCommand() {
  return ["npx", "--yes", "tsx", "scripts/combatLab.defenceStringCalibration.ts", ...process.argv.slice(2)].join(" ");
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

function attackLabel(name: string) {
  return name.replace(ATTACK_PREFIX, "");
}

function defenceLabel(name: string) {
  return name.replace(DEFENCE_PREFIX, "").replace(/^Soldier_/, "").replace(/_/g, " ");
}

function verdictFor(value: number | null, defeatedCount: number, censoredCount: number): Verdict {
  if (defeatedCount <= 0 || value === null) return "UNCLEAR";
  if (censoredCount > 0 && censoredCount >= defeatedCount) return "HIGH/CENSORED";
  if (value < SOLDIER_MIN) return "LOW";
  if (value > SOLDIER_MAX) return censoredCount > 0 ? "HIGH/CENSORED" : "HIGH";
  return "PASS";
}

function scenario(attack: AttackProfile, defence: DefenceProfile, options: CliOptions): CombatScenario {
  return {
    name: `L3 Defence String ${attack.candidate} ${attack.channel} vs ${defence.name}`,
    players: [{ ...attack.actor, side: "players", actions: [attack.action], actionsPerTurn: 1 }],
    monsters: [{ ...defence.actor, side: "monsters", actions: [], actionsPerTurn: 0 }],
    runs: options.runs,
    seed: options.seed,
    maxRounds: 240,
    turnOrder: "playersFirst",
  };
}

function rowFromReport(attack: AttackProfile, defence: DefenceProfile, report: CombatSuiteReport): ResultRow {
  const metrics = report.defeatMetrics.monsterDefeated;
  const avg = round(metrics.avgMeaningfulActionsToDefeat);
  const censoredCount = Math.max(0, report.runs - metrics.sampleCount);
  return {
    attack: attack.candidate,
    channel: attack.channel,
    defence: defence.label,
    expectedWoundsPerAttack: attack.expectedWoundsPerAttack,
    avgAttacksToKill: avg,
    medianAttacksToKill: round(metrics.medianMeaningfulActionsToDefeat),
    defeatedCount: metrics.sampleCount,
    censoredCount,
    verdict: verdictFor(avg, metrics.sampleCount, censoredCount),
  };
}

async function discoverAssets() {
  const client = await getPrisma();
  const campaign = await client.campaign.findUnique({ where: { id: BALANCE_CAMPAIGN_ID }, select: { id: true, name: true } });
  if (!campaign) throw new Error(`Balance Environment campaign not found: ${BALANCE_CAMPAIGN_ID}`);
  if (campaign.name !== BALANCE_CAMPAIGN_NAME) {
    throw new Error(`Campaign name mismatch: expected ${BALANCE_CAMPAIGN_NAME}, found ${campaign.name}.`);
  }
  const tuning = await loadActiveTuning(client);
  const rows = await client.monster.findMany({
    where: {
      campaignId: campaign.id,
      source: "CAMPAIGN",
      isReadOnly: false,
      OR: [
        { name: { startsWith: ATTACK_PREFIX } },
        { name: { in: DEFENCE_ORDER } },
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
  const adapted = rows.map((row) => {
    const result = adaptMonsterToCombatLabActor(
      row as Parameters<typeof adaptMonsterToCombatLabActor>[0],
      new Map(),
      tuning.combatValues,
      tuning.powerSnapshot,
    );
    return { row, result, warnings: warningsToStrings(result.warnings) };
  });

  const attacks: AttackProfile[] = adapted
    .filter((entry) => entry.row.name.startsWith(ATTACK_PREFIX) && INCLUDED_ATTACKS.has(attackLabel(entry.row.name)))
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
          candidate: attackLabel(entry.row.name),
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

  const defences: DefenceProfile[] = DEFENCE_ORDER.map((name) => {
    const entry = adapted.find((item) => item.row.name === name);
    if (!entry) throw new Error(`Missing defence candidate: ${name}. Run scripts/balanceEnvironment.ensureAtkDefenceStringCandidates.ts first.`);
    return {
      id: entry.row.id,
      name: entry.row.name,
      label: defenceLabel(entry.row.name),
      actor: entry.result.actor,
      authored: {
        physicalHp: entry.row.physicalResilienceMax,
        mentalHp: entry.row.mentalPerseveranceMax,
        physicalProtection: entry.row.physicalProtection,
        mentalProtection: entry.row.mentalProtection,
        guardDie: entry.row.guardDie,
        fortitudeDie: entry.row.fortitudeDie,
        intellectDie: entry.row.intellectDie,
        synergyDie: entry.row.synergyDie,
        braveryDie: entry.row.braveryDie,
        armorSkillValue: entry.row.armorSkillValue,
      },
      runtime: {
        dodgeDice: entry.result.actor.dodgeDice ?? 0,
        physicalDefenceDice: entry.result.actor.physicalDefenceDice ?? 0,
        physicalBlockPerSuccess: entry.result.actor.physicalBlockPerSuccess ?? 0,
        mentalDefenceDice: entry.result.actor.mentalDefenceDice ?? 0,
        mentalBlockPerSuccess: entry.result.actor.mentalBlockPerSuccess ?? 0,
      },
      warnings: entry.warnings,
    };
  });

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    activeTuning: tuning.activeTuning,
    attacks,
    defences,
    warnings: adapted.flatMap((entry) => entry.warnings.map((warning) => `${entry.row.name}: ${warning}`)),
  };
}

async function buildPayload(options: CliOptions) {
  if (!options.balanceEnvironment) {
    throw new Error("Pass --balance-environment to confirm this report uses authored Balance Environment assets.");
  }
  const discovery = await discoverAssets();
  if (discovery.attacks.length === 0) throw new Error("No included BALANCE_ATK_L3 attack-string candidates found.");
  const rows: ResultRow[] = [];
  for (const attack of discovery.attacks) {
    for (const defence of discovery.defences) {
      rows.push(rowFromReport(attack, defence, runScenarioSuite(scenario(attack, defence, options))));
    }
  }
  return {
    report: "Combat Lab Level 3 Defence String Calibration Matrix",
    mode: "defence-string-calibration",
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
      "Defence-string calibration only. Candidates are provisional Balance Environment ruler/probe assets, not role monster tuning or final doctrine. Soldier band target is 2-3 average Medium Strength Attacks to Kill.",
    attacks: discovery.attacks.map((attack) => ({
      candidate: attack.candidate,
      channel: attack.channel,
      diceCount: attack.diceCount,
      die: attack.die,
      woundsPerSuccess: attack.woundsPerSuccess,
      expectedSuccesses: attack.expectedSuccesses,
      expectedWoundsPerAttack: attack.expectedWoundsPerAttack,
    })),
    defences: discovery.defences.map((defence) => ({
      name: defence.name,
      label: defence.label,
      authored: defence.authored,
      runtime: defence.runtime,
    })),
    rows,
    warnings: discovery.warnings,
  };
}

function rowDisplay(row: ResultRow) {
  return `${row.avgAttacksToKill === null ? "n/a" : row.avgAttacksToKill} ${row.verdict}`;
}

function printChannelMatrix(rows: ResultRow[], channel: "physical" | "mental") {
  const channelRows = rows.filter((row) => row.channel === channel);
  const defences = DEFENCE_ORDER.map((name) => defenceLabel(name));
  const attacks = Array.from(new Set(channelRows.map((row) => row.attack)));
  console.log(`\n${channel.toUpperCase()} Soldier Defence Matrix (2-3 ATK band):`);
  console.log(`Attack`.padEnd(12) + " | " + defences.map((entry) => entry.padEnd(18)).join(" | "));
  console.log("-".repeat(12 + 3 + defences.length * 21));
  for (const attack of attacks) {
    const cells = defences.map((defence) => {
      const row = channelRows.find((entry) => entry.attack === attack && entry.defence === defence);
      return (row ? rowDisplay(row) : "missing").padEnd(18);
    });
    console.log(`${attack.padEnd(12)} | ${cells.join(" | ")}`);
  }
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

  console.log("\nAttack Strings:");
  for (const attack of payload.attacks) {
    console.log(
      `- ${attack.candidate} ${attack.channel}: ${attack.diceCount} x ${attack.die}, ` +
      `${attack.woundsPerSuccess} wounds/success, expected successes ${attack.expectedSuccesses}, ` +
      `expected wounds/attack ${attack.expectedWoundsPerAttack}.`,
    );
  }

  console.log("\nDefence Candidates:");
  for (const defence of payload.defences) {
    console.log(
      `- ${defence.label}: HP ${defence.authored.physicalHp}/${defence.authored.mentalHp}, ` +
      `PP/MP ${defence.authored.physicalProtection}/${defence.authored.mentalProtection}, ` +
      `runtime dodge ${defence.runtime.dodgeDice}, physical ${defence.runtime.physicalDefenceDice} dice blocks ${defence.runtime.physicalBlockPerSuccess}/success, ` +
      `mental ${defence.runtime.mentalDefenceDice} dice blocks ${defence.runtime.mentalBlockPerSuccess}/success.`,
    );
  }

  printChannelMatrix(payload.rows, "physical");
  printChannelMatrix(payload.rows, "mental");

  const relevantWarnings = payload.warnings.filter((warning) =>
    /Damage hydration warning|Physical Defence|fallback basic attack/i.test(warning),
  );
  if (relevantWarnings.length > 0) {
    console.log("\nAdapter/runtime notes:");
    for (const warning of Array.from(new Set(relevantWarnings))) console.log(`- ${warning}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = await buildPayload(options);
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else printPayload(payload);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prismaLoaded && prisma) await prisma.$disconnect();
  });
