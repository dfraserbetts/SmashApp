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
const ATTACK_NAME = "BALANCE_ATK_L3_AttackString_4D8_W2";
const BOSS_TARGETS = [
  "BALANCE_OFFSET_L3_Boss_Standard_Defence",
  "BALANCE_OFFSET_L3_Boss_Heavy_Defence",
  "BALANCE_OFFSET_L3_Boss_Physical_Biased",
  "BALANCE_OFFSET_L3_Boss_Mental_Biased",
];
const ATTACKER_COUNTS = [1, 2, 3, 4, 5];

type PrismaClient = typeof import("../prisma/client")["prisma"];
type DefencePackage = "Standard Defence" | "Heavy Defence" | "Physical Biased" | "Mental Biased";
type Verdict = "PASS" | "LOW" | "UNCLEAR";
type PressureLabel =
  | "lower-bound boss"
  | "normal boss candidate"
  | "long boss candidate"
  | "legendary/raid candidate"
  | "too long / likely slog";

type CliOptions = {
  balanceEnvironment: boolean;
  runs: number;
  seed: number;
  json: boolean;
};

type AttackProfile = {
  actor: CombatActor;
  action: CombatAction;
  channel: "physical" | "mental";
  diceCount: number;
  die: CombatDieSize;
  woundsPerSuccess: number;
  expectedSuccesses: number;
  expectedWoundsPerAttack: number;
};

type TargetProfile = {
  name: string;
  defencePackage: DefencePackage;
  actor: CombatActor;
  runtime: {
    physicalHp: number;
    mentalHp: number;
    dodgeDice: number;
    physicalDefenceDice: number;
    physicalBlockPerSuccess: number;
    mentalDefenceDice: number;
    mentalBlockPerSuccess: number;
  };
  warnings: string[];
};

type ResultRow = {
  target: string;
  defencePackage: DefencePackage;
  channel: "physical" | "mental";
  attackerCount: number;
  evidenceMode: "true-multi-attacker-runtime";
  avgTotalAttacksToDefeat: number | null;
  medianTotalAttacksToDefeat: number | null;
  observedAverageRoundsToDefeat: number | null;
  observedMedianRoundsToDefeat: number | null;
  defeatedCount: number;
  censoredCount: number;
  verdict: Verdict;
  pressureLabel: PressureLabel;
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
    throw new Error("Missing ACTIVE Power or Combat tuning set. Boss pressure validation does not seed tuning.");
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
  return ["npx", "--yes", "tsx", "scripts/combatLab.bossPressureValidation.ts", ...process.argv.slice(2)].join(" ");
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

function packageFromName(name: string): DefencePackage {
  if (name.endsWith("_Heavy_Defence")) return "Heavy Defence";
  if (name.endsWith("_Physical_Biased")) return "Physical Biased";
  if (name.endsWith("_Mental_Biased")) return "Mental Biased";
  return "Standard Defence";
}

function verdictFor(value: number | null, defeatedCount: number): Verdict {
  if (defeatedCount <= 0 || value === null) return "UNCLEAR";
  return value < 16 ? "LOW" : "PASS";
}

function pressureLabel(avgRounds: number | null, attackerCount: number, avgAttacks: number | null): PressureLabel {
  if (avgRounds === null || avgAttacks === null) return "too long / likely slog";
  if (avgRounds <= 4 && avgAttacks < 24) return "lower-bound boss";
  if (avgRounds <= 7 && avgAttacks < 36) return "normal boss candidate";
  if (avgRounds <= 10 && avgAttacks < 50) return "long boss candidate";
  if (avgRounds <= 14 && avgAttacks < 70) return "legendary/raid candidate";
  return "too long / likely slog";
}

function cloneAttacker(base: CombatActor, action: CombatAction, index: number): CombatActor {
  return {
    ...base,
    id: `${base.id}:pressure:${index}`,
    name: `${base.name} ${index}`,
    side: "players",
    actions: [{ ...action, id: `${action.id}:pressure:${index}` }],
    actionsPerTurn: 1,
  };
}

function scenario(attack: AttackProfile, target: TargetProfile, attackerCount: number, options: CliOptions): CombatScenario {
  return {
    name: `L3 Boss Pressure ${attack.channel} ${attackerCount} attackers vs ${target.name}`,
    players: Array.from({ length: attackerCount }, (_, index) => cloneAttacker(attack.actor, attack.action, index + 1)),
    monsters: [{ ...target.actor, side: "monsters", actions: [], actionsPerTurn: 0 }],
    runs: options.runs,
    seed: options.seed,
    maxRounds: 120,
    turnOrder: "playersFirst",
  };
}

function rowFromReport(
  attack: AttackProfile,
  target: TargetProfile,
  attackerCount: number,
  report: CombatSuiteReport,
): ResultRow {
  const metrics = report.defeatMetrics.monsterDefeated;
  const avgAttacks = round(metrics.avgMeaningfulActionsToDefeat);
  const avgRounds = round(report.averageRounds);
  const defeatedCount = metrics.sampleCount;
  const censoredCount = Math.max(0, report.runs - defeatedCount);
  return {
    target: target.name,
    defencePackage: target.defencePackage,
    channel: attack.channel,
    attackerCount,
    evidenceMode: "true-multi-attacker-runtime",
    avgTotalAttacksToDefeat: avgAttacks,
    medianTotalAttacksToDefeat: round(metrics.medianMeaningfulActionsToDefeat),
    observedAverageRoundsToDefeat: avgRounds,
    observedMedianRoundsToDefeat: round(report.medianRounds),
    defeatedCount,
    censoredCount,
    verdict: verdictFor(avgAttacks, defeatedCount),
    pressureLabel: pressureLabel(avgRounds, attackerCount, avgAttacks),
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
      OR: [{ name: ATTACK_NAME }, { name: { in: BOSS_TARGETS } }],
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
  const attackEntry = adapted.find((entry) => entry.row.name === ATTACK_NAME);
  if (!attackEntry) throw new Error(`Missing attack-string asset: ${ATTACK_NAME}`);
  const attacks: AttackProfile[] = attackEntry.result.actor.actions
    .filter((action) =>
      action.kind === "attack" &&
      action.supported &&
      action.sourceType === "naturalAttack" &&
      (action.pool === "physical" || action.pool === "mental"),
    )
    .map((action) => {
      const channel = action.pool === "mental" ? "mental" : "physical";
      const die = attackEntry.result.actor.attributeDice[action.accuracyAttribute] ?? "D8";
      const successes = expectedSuccesses(Math.max(1, action.diceCount), die);
      return {
        actor: attackEntry.result.actor,
        action,
        channel,
        diceCount: Math.max(1, action.diceCount),
        die,
        woundsPerSuccess: Math.max(0, action.potency),
        expectedSuccesses: roundNumber(successes),
        expectedWoundsPerAttack: roundNumber(successes * Math.max(0, action.potency)),
      };
    });
  const targets: TargetProfile[] = BOSS_TARGETS.map((name) => {
    const entry = adapted.find((item) => item.row.name === name);
    if (!entry) throw new Error(`Missing Boss pressure candidate: ${name}.`);
    return {
      name: entry.row.name,
      defencePackage: packageFromName(entry.row.name),
      actor: entry.result.actor,
      runtime: {
        physicalHp: entry.result.actor.physicalHpMax,
        mentalHp: entry.result.actor.mentalHpMax,
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
    targets,
    warnings: adapted.flatMap((entry) => entry.warnings.map((warning) => `${entry.row.name}: ${warning}`)),
  };
}

async function buildPayload(options: CliOptions) {
  if (!options.balanceEnvironment) {
    throw new Error("Pass --balance-environment to confirm this report uses authored Balance Environment assets.");
  }
  const discovery = await discoverAssets();
  const rows: ResultRow[] = [];
  for (const attack of discovery.attacks) {
    for (const target of discovery.targets) {
      for (const attackerCount of ATTACKER_COUNTS) {
        rows.push(rowFromReport(attack, target, attackerCount, runScenarioSuite(scenario(attack, target, attackerCount, options))));
      }
    }
  }
  return {
    report: "Combat Lab Level 3 Boss Pressure Validation",
    mode: "boss-pressure-validation",
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
      "Boss pressure validation only. Rows are true multi-attacker Combat Lab/runtime scenarios using Balance Environment-authored assets. This is not final boss doctrine and not role asset tuning.",
    attack: discovery.attacks.map((attack) => ({
      channel: attack.channel,
      diceCount: attack.diceCount,
      die: attack.die,
      woundsPerSuccess: attack.woundsPerSuccess,
      expectedSuccesses: attack.expectedSuccesses,
      expectedWoundsPerAttack: attack.expectedWoundsPerAttack,
    })),
    targets: discovery.targets.map((target) => ({
      name: target.name,
      defencePackage: target.defencePackage,
      runtime: target.runtime,
    })),
    rows,
    warnings: discovery.warnings,
  };
}

function display(row: ResultRow | undefined) {
  if (!row) return "missing";
  return `${row.observedAverageRoundsToDefeat ?? "n/a"}r / ${row.avgTotalAttacksToDefeat ?? "n/a"}atk ${row.verdict}`;
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
  console.log(`Evidence mode: true multi-attacker runtime scenarios`);
  console.log(`Power tuning: ${payload.activeTuning.power.name} (${payload.activeTuning.power.slug})`);
  console.log(`Combat tuning: ${payload.activeTuning.combat.name} (${payload.activeTuning.combat.slug})`);
  console.log(payload.doctrineNote);

  console.log("\nProvisional Attack String:");
  for (const attack of payload.attack) {
    console.log(
      `- ${attack.channel}: ${attack.diceCount} x ${attack.die}, ${attack.woundsPerSuccess} wounds/success, ` +
      `expected successes ${attack.expectedSuccesses}, expected wounds/attack ${attack.expectedWoundsPerAttack}.`,
    );
  }

  console.log("\nBoss Candidate Runtime Defence:");
  for (const target of payload.targets) {
    console.log(
      `- ${target.defencePackage}: HP ${target.runtime.physicalHp}/${target.runtime.mentalHp}, dodge ${target.runtime.dodgeDice}, ` +
      `physical ${target.runtime.physicalDefenceDice} dice blocks ${target.runtime.physicalBlockPerSuccess}/success, ` +
      `mental ${target.runtime.mentalDefenceDice} dice blocks ${target.runtime.mentalBlockPerSuccess}/success.`,
    );
  }

  console.log("\nBoss Pressure Matrix (cell = observed avg rounds / avg total attacks):");
  console.log("Defence          | Channel  | 1 attacker       | 2 attackers      | 3 attackers      | 4 attackers      | 5 attackers");
  console.log("-".repeat(120));
  for (const defencePackage of ["Standard Defence", "Heavy Defence", "Physical Biased", "Mental Biased"] as const) {
    for (const channel of ["physical", "mental"] as const) {
      const cells = ATTACKER_COUNTS.map((attackerCount) =>
        display(payload.rows.find((row) => row.defencePackage === defencePackage && row.channel === channel && row.attackerCount === attackerCount)).padEnd(16),
      );
      console.log(`${defencePackage.padEnd(16)} | ${channel.padEnd(8)} | ${cells.join(" | ")}`);
    }
  }

  console.log("\nDetailed Pressure Labels:");
  for (const defencePackage of ["Standard Defence", "Heavy Defence", "Physical Biased", "Mental Biased"] as const) {
    for (const channel of ["physical", "mental"] as const) {
      const row = payload.rows.find((entry) => entry.defencePackage === defencePackage && entry.channel === channel && entry.attackerCount === 4);
      if (!row) continue;
      console.log(
        `- ${defencePackage} ${channel}, 4 attackers: ${row.observedAverageRoundsToDefeat} rounds, ` +
        `${row.avgTotalAttacksToDefeat} attacks, ${row.defeatedCount} defeated/${row.censoredCount} censored, ${row.pressureLabel}.`,
      );
    }
  }

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
