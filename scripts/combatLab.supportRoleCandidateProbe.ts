import { spawnSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";

import { createActorInstances } from "../lib/combat-lab/combatState";
import {
  adaptCampaignCharacterToCombatActor,
  adaptMonsterToCombatLabActor,
  itemTemplateToSummoningEquipmentItem,
} from "../lib/combat-lab/liveAdapters";
import { runCombatScenario } from "../lib/combat-lab/autoSimulator";
import { collectHydrationIntegrity } from "../lib/combat-lab/reporting";
import { normalizeCombatTuning, normalizeCombatTuningFlatValues } from "../lib/config/combatTuningShared";
import {
  DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  normalizeCharacterPowerSpendScalar,
} from "../lib/config/characterBuilderTuningShared";
import { normalizePowerTuningValues, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import type {
  CombatActor,
  CombatActorContribution,
  CombatRunResult,
  CombatScenario,
  CombatSide,
} from "../lib/combat-lab/types";

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];
type CharacterRow = Parameters<typeof adaptCampaignCharacterToCombatActor>[0];
type MonsterRow = Parameters<typeof adaptMonsterToCombatLabActor>[0];
type ItemTemplateRow = Parameters<typeof itemTemplateToSummoningEquipmentItem>[0];

type CliOptions = {
  runs: number;
  seed: number;
  json: boolean;
};

type BuiltActor = {
  id: string;
  name: string;
  actor: CombatActor;
  warnings: string[];
  source: {
    level: number;
    tier?: string | null;
    legendary?: boolean;
    physicalHp: number;
    mentalHp: number;
    physicalProtection: number;
    mentalProtection: number;
  };
};

type ScenarioSpec = {
  name: string;
  packageType: "baseline" | "candidate-pair" | "candidate-full" | "candidate-doubled";
  enemyNames: string[];
};

type ContributionSummary = {
  actorName: string;
  displayName: string;
  side: CombatSide;
  actionsPerRun: number;
  damagePerRun: number;
  controlTurnsPerRun: number;
  actionsDeniedPerRun: number;
  topActionName: string | null;
};

type ScenarioSummary = {
  scenarioName: string;
  packageType: ScenarioSpec["packageType"];
  party: string[];
  enemies: string[];
  duplicateAssets: string[];
  duplicateRepresentation: "createActorInstances";
  playerWinRate: number;
  monsterWinRate: number;
  stalemateRate: number;
  averageRounds: number;
  medianRounds: number;
  stoppedBy: Record<CombatRunResult["stoppedBy"], number>;
  averageDamagePerRound: Record<CombatSide, number>;
  averageMainActionsUsed: Record<CombatSide, number>;
  averagePowerActionsUsed: Record<CombatSide, number>;
  c14DiagnosticsPerRun: {
    majorInjuryEvents: number;
    minorInjuryEvents: number;
    noAutoBlazeEvents: number;
    injuryDefeats: number;
  };
  survivorRates: Record<string, number>;
  groupSurvivorAverageAlive: Record<string, number>;
  groupAnySurvivorRate: Record<string, number>;
  topPlayerTargets: Array<{ targetName: string; events: number; share: number }>;
  topEnemyDamage: ContributionSummary[];
  firstRunDefeatOrder: string[];
  hydrationWarnings: string[];
  unsupportedPowerNames: string[];
  unsupportedEffectCount: number;
  fallbackActions: number;
};

type Payload = {
  title: string;
  provenance: {
    campaignId: string;
    campaignName: string;
    repoHead: string;
    gitStatus: string;
    cleanWorktree: boolean;
    exactCommand: string;
    runs: number;
    seed: number;
    assetSource: "balance-campaign-authored";
    databaseAccess: "read-only";
    mutation: "none";
    seeders: "none";
    browserInspected: false;
    runtimeMode: "Combat Lab runCombatScenario";
  };
  notes: string[];
  assets: {
    party: Array<ReturnType<typeof actorInventoryEntry>>;
    enemies: Array<ReturnType<typeof actorInventoryEntry>>;
  };
  scenarios: ScenarioSummary[];
};

const BALANCE_ENVIRONMENT_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_ENVIRONMENT_CAMPAIGN_NAME = "Balance Environment";

const STANDARD_PARTY = [
  "BALANCE_Hawkshot Archer",
  "BALANCE_Ranger Commander",
  "BALANCE_Stoneguard",
  "BALANCE_Arcane Sage",
] as const;

const ENEMY_NAMES = [
  "BALANCE_Legendary Elite Duelist",
  "BALANCE_Legendary Elite Hexer",
  "BALANCE_Legendary Elite Breaker Controller Rotation",
  "BALANCE_Physical Striker",
  "BALANCE_Durable Soldier",
  "BALANCE_Control Hexer",
  "BALANCE_Dodge Pressure Skirmisher",
  "BALANCE_Support Candidate Pressure Striker",
  "BALANCE_Support Candidate Guard Anchor",
  "BALANCE_Support Candidate Suppression Hexer",
] as const;

const PRESSURE_STRIKER = "BALANCE_Support Candidate Pressure Striker";
const GUARD_ANCHOR = "BALANCE_Support Candidate Guard Anchor";
const SUPPRESSION_HEXER = "BALANCE_Support Candidate Suppression Hexer";

const SCENARIO_SPECS: ScenarioSpec[] = [
  {
    name: "Duelist baseline support",
    packageType: "baseline",
    enemyNames: ["BALANCE_Legendary Elite Duelist", "BALANCE_Physical Striker", "BALANCE_Durable Soldier"],
  },
  {
    name: "Hexer baseline support",
    packageType: "baseline",
    enemyNames: ["BALANCE_Legendary Elite Hexer", "BALANCE_Control Hexer", "BALANCE_Durable Soldier"],
  },
  {
    name: "Rotation baseline support",
    packageType: "baseline",
    enemyNames: ["BALANCE_Legendary Elite Breaker Controller Rotation", "BALANCE_Control Hexer", "BALANCE_Dodge Pressure Skirmisher"],
  },
  {
    name: "Duelist + Pressure Striker + Guard Anchor",
    packageType: "candidate-pair",
    enemyNames: ["BALANCE_Legendary Elite Duelist", PRESSURE_STRIKER, GUARD_ANCHOR],
  },
  {
    name: "Duelist + Pressure Striker + Suppression Hexer",
    packageType: "candidate-pair",
    enemyNames: ["BALANCE_Legendary Elite Duelist", PRESSURE_STRIKER, SUPPRESSION_HEXER],
  },
  {
    name: "Duelist + Guard Anchor + Suppression Hexer",
    packageType: "candidate-pair",
    enemyNames: ["BALANCE_Legendary Elite Duelist", GUARD_ANCHOR, SUPPRESSION_HEXER],
  },
  {
    name: "Hexer + Pressure Striker + Guard Anchor",
    packageType: "candidate-pair",
    enemyNames: ["BALANCE_Legendary Elite Hexer", PRESSURE_STRIKER, GUARD_ANCHOR],
  },
  {
    name: "Hexer + Pressure Striker + Suppression Hexer",
    packageType: "candidate-pair",
    enemyNames: ["BALANCE_Legendary Elite Hexer", PRESSURE_STRIKER, SUPPRESSION_HEXER],
  },
  {
    name: "Hexer + Guard Anchor + Suppression Hexer",
    packageType: "candidate-pair",
    enemyNames: ["BALANCE_Legendary Elite Hexer", GUARD_ANCHOR, SUPPRESSION_HEXER],
  },
  {
    name: "Rotation + Pressure Striker + Guard Anchor",
    packageType: "candidate-pair",
    enemyNames: ["BALANCE_Legendary Elite Breaker Controller Rotation", PRESSURE_STRIKER, GUARD_ANCHOR],
  },
  {
    name: "Rotation + Pressure Striker + Suppression Hexer",
    packageType: "candidate-pair",
    enemyNames: ["BALANCE_Legendary Elite Breaker Controller Rotation", PRESSURE_STRIKER, SUPPRESSION_HEXER],
  },
  {
    name: "Rotation + Guard Anchor + Suppression Hexer",
    packageType: "candidate-pair",
    enemyNames: ["BALANCE_Legendary Elite Breaker Controller Rotation", GUARD_ANCHOR, SUPPRESSION_HEXER],
  },
  {
    name: "Duelist full candidate package",
    packageType: "candidate-full",
    enemyNames: ["BALANCE_Legendary Elite Duelist", PRESSURE_STRIKER, GUARD_ANCHOR, SUPPRESSION_HEXER],
  },
  {
    name: "Hexer full candidate package",
    packageType: "candidate-full",
    enemyNames: ["BALANCE_Legendary Elite Hexer", PRESSURE_STRIKER, GUARD_ANCHOR, SUPPRESSION_HEXER],
  },
  {
    name: "Rotation full candidate package",
    packageType: "candidate-full",
    enemyNames: ["BALANCE_Legendary Elite Breaker Controller Rotation", PRESSURE_STRIKER, GUARD_ANCHOR, SUPPRESSION_HEXER],
  },
  {
    name: "Duelist doubled Pressure package",
    packageType: "candidate-doubled",
    enemyNames: ["BALANCE_Legendary Elite Duelist", PRESSURE_STRIKER, PRESSURE_STRIKER, GUARD_ANCHOR],
  },
  {
    name: "Hexer doubled Suppression package",
    packageType: "candidate-doubled",
    enemyNames: ["BALANCE_Legendary Elite Hexer", SUPPRESSION_HEXER, SUPPRESSION_HEXER, GUARD_ANCHOR],
  },
  {
    name: "Rotation doubled mixed package",
    packageType: "candidate-doubled",
    enemyNames: ["BALANCE_Legendary Elite Breaker Controller Rotation", PRESSURE_STRIKER, SUPPRESSION_HEXER, GUARD_ANCHOR],
  },
];

const POWER_INCLUDE = {
  rangeCategories: { orderBy: { rangeCategory: "asc" as const } },
  primaryDefenceGate: true,
  effectPackets: {
    orderBy: { packetIndex: "asc" as const },
    include: { localTargetingOverride: true },
  },
};

const ITEM_TEMPLATE_INCLUDE = {
  rangeCategories: { select: { rangeCategory: true } },
  meleeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  rangedDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  aoeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  attackEffectsMelee: { select: { attackEffect: { select: { name: true } } } },
  attackEffectsRanged: { select: { attackEffect: { select: { name: true } } } },
  attackEffectsAoE: { select: { attackEffect: { select: { name: true } } } },
  vrpEntries: { select: { effectKind: true, magnitude: true, damageType: { select: { name: true } } } },
};

loadEnvConfig(process.cwd());

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { runs: 100, seed: 4242, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--runs") {
      options.runs = Math.max(1, Math.trunc(Number(argv[index + 1] ?? options.runs)));
      index += 1;
    } else if (arg === "--seed") {
      options.seed = Math.trunc(Number(argv[index + 1] ?? options.seed));
      index += 1;
    } else if (arg === "--help") {
      console.log("Usage: npx --yes tsx scripts/combatLab.supportRoleCandidateProbe.ts [--runs 100] [--seed 4242] [--json]");
      process.exit(0);
    }
  }
  return options;
}

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) return "UNKNOWN";
  return result.stdout.trim();
}

function exactCommand(): string {
  return ["npx", "--yes", "tsx", "scripts/combatLab.supportRoleCandidateProbe.ts", ...process.argv.slice(2)].join(" ");
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pct(value: number): number {
  return round(value * 100, 1);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function displayName(actor: Pick<CombatActor, "displayGroupName" | "name">): string {
  return actor.displayGroupName ?? actor.name.replace(/ #\d+$/, "");
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

async function loadActiveTuning(prisma: PrismaClientInstance) {
  const [powerSet, combatSet, characterBuilderTuning] = await Promise.all([
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
    prisma.characterBuilderTuning.findUnique({
      where: { id: "default" },
      select: { playerPowerSpendScalar: true },
    }),
  ]);
  if (!powerSet || !combatSet) throw new Error("Missing ACTIVE Power or Combat tuning set.");
  const powerSnapshot: PowerTuningSnapshot = {
    setId: powerSet.id,
    name: powerSet.name,
    slug: powerSet.slug,
    status: powerSet.status,
    updatedAt: powerSet.updatedAt.toISOString(),
    values: normalizePowerTuningValues(entriesToRecord(powerSet.entries)),
  };
  return {
    powerSnapshot,
    combatValues: normalizeCombatTuning(normalizeCombatTuningFlatValues(entriesToRecord(combatSet.entries))),
    characterPowerSpendScalar: normalizeCharacterPowerSpendScalar(
      characterBuilderTuning?.playerPowerSpendScalar ?? DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
    ),
  };
}

async function loadAssets(prisma: PrismaClientInstance, tuning: Awaited<ReturnType<typeof loadActiveTuning>>) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: BALANCE_ENVIRONMENT_CAMPAIGN_ID },
    select: { id: true, name: true },
  });
  if (!campaign) throw new Error(`Balance Environment campaign not found: ${BALANCE_ENVIRONMENT_CAMPAIGN_ID}`);
  if (campaign.name !== BALANCE_ENVIRONMENT_CAMPAIGN_NAME) {
    throw new Error(`Campaign ${campaign.id} name "${campaign.name}" did not match ${BALANCE_ENVIRONMENT_CAMPAIGN_NAME}.`);
  }

  const [characters, monsters] = await Promise.all([
    prisma.campaignCharacter.findMany({
      where: { campaignId: campaign.id, archivedAt: null, name: { in: [...STANDARD_PARTY] } },
      include: {
        backpackItems: {
          include: {
            partyInventoryItem: {
              include: {
                itemTemplate: { include: ITEM_TEMPLATE_INCLUDE },
              },
            },
          },
        },
      },
    }),
    prisma.monster.findMany({
      where: {
        campaignId: campaign.id,
        source: "CAMPAIGN",
        isReadOnly: false,
        name: { in: [...ENEMY_NAMES] },
      },
      include: {
        naturalAttack: true,
        attacks: { orderBy: { sortOrder: "asc" } },
        traits: { orderBy: { sortOrder: "asc" }, include: { trait: { select: { name: true, effectText: true } } } },
        powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
      },
    }),
  ]);

  const missingCharacters = STANDARD_PARTY.filter((name) => !characters.some((row) => row.name === name));
  const missingMonsters = ENEMY_NAMES.filter((name) => !monsters.some((row) => row.name === name));
  if (missingCharacters.length > 0 || missingMonsters.length > 0) {
    throw new Error(`Missing Balance Environment assets. Characters: ${missingCharacters.join(", ") || "none"}; monsters: ${missingMonsters.join(", ") || "none"}.`);
  }

  const itemIds = Array.from(new Set(monsters.flatMap((monster) => [
    monster.mainHandItemId,
    monster.offHandItemId,
    monster.smallItemId,
    monster.headArmorItemId,
    monster.shoulderArmorItemId,
    monster.torsoArmorItemId,
    monster.legsArmorItemId,
    monster.feetArmorItemId,
    monster.headItemId,
    monster.neckItemId,
    monster.armsItemId,
    monster.beltItemId,
  ]).filter(Boolean) as string[]));
  const itemRows = itemIds.length > 0
    ? await prisma.itemTemplate.findMany({ where: { campaignId: campaign.id, id: { in: itemIds } }, include: ITEM_TEMPLATE_INCLUDE })
    : [];
  const monsterEquipmentById = new Map(itemRows.map((item) => [item.id, itemTemplateToSummoningEquipmentItem(item as ItemTemplateRow)]));

  const party = characters.map((row): BuiltActor => {
    const adapted = adaptCampaignCharacterToCombatActor(
      row as CharacterRow,
      tuning.combatValues,
      tuning.powerSnapshot,
      tuning.characterPowerSpendScalar,
    );
    return {
      id: row.id,
      name: row.name,
      actor: { ...adapted.actor, side: "players" },
      warnings: warningsToStrings(adapted.warnings),
      source: {
        level: row.level,
        physicalHp: adapted.actor.physicalHpMax,
        mentalHp: adapted.actor.mentalHpMax,
        physicalProtection: adapted.actor.physicalProtection,
        mentalProtection: adapted.actor.mentalProtection,
      },
    };
  });

  const enemies = monsters.map((row): BuiltActor => {
    const adapted = adaptMonsterToCombatLabActor(row as MonsterRow, monsterEquipmentById, tuning.combatValues, tuning.powerSnapshot);
    return {
      id: row.id,
      name: row.name,
      actor: { ...adapted.actor, side: "monsters" },
      warnings: warningsToStrings(adapted.warnings),
      source: {
        level: row.level,
        tier: row.tier,
        legendary: row.legendary,
        physicalHp: adapted.actor.physicalHpMax,
        mentalHp: adapted.actor.mentalHpMax,
        physicalProtection: adapted.actor.physicalProtection,
        mentalProtection: adapted.actor.mentalProtection,
      },
    };
  });

  return {
    partyByName: new Map(party.map((asset) => [asset.name, asset])),
    enemyByName: new Map(enemies.map((asset) => [asset.name, asset])),
    party,
    enemies,
  };
}

function actorInventoryEntry(asset: BuiltActor) {
  return {
    id: asset.id,
    name: asset.name,
    level: asset.source.level,
    tier: asset.source.tier ?? null,
    legendary: asset.source.legendary ?? false,
    defeatModel: asset.actor.defeatModel,
    actionsPerTurn: asset.actor.actionsPerTurn,
    physicalHp: asset.source.physicalHp,
    mentalHp: asset.source.mentalHp,
    physicalProtection: asset.source.physicalProtection,
    mentalProtection: asset.source.mentalProtection,
    actionCount: asset.actor.actions.length,
    supportedActionCount: asset.actor.actions.filter((action) => action.supported).length,
    fallbackActions: asset.actor.actions.filter((action) => action.sourceType === "fallback").map((action) => action.name),
    unsupportedPowerNames: asset.actor.unsupportedPowers.map((power) => power.powerName),
    warnings: asset.warnings,
    actions: asset.actor.actions.map((action) => ({
      name: action.name,
      sourceType: action.sourceType,
      kind: action.kind,
      supported: action.supported,
      diceCount: action.diceCount,
      potency: action.potency,
      pool: action.pool ?? null,
      targetPolicy: action.targetPolicy,
      targetCount: action.targetCount ?? null,
      cooldownRounds: action.cooldownRounds,
      secondaryActions: action.secondaryActions?.map((secondary) => ({
        name: secondary.name,
        kind: secondary.kind,
        diceCount: secondary.diceCount,
        potency: secondary.potency,
        pool: secondary.pool ?? null,
      })) ?? [],
    })),
  };
}

function duplicateNames(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}

function buildScenario(spec: ScenarioSpec, assets: Awaited<ReturnType<typeof loadAssets>>, options: CliOptions): CombatScenario {
  const players = STANDARD_PARTY.map((name) => {
    const asset = assets.partyByName.get(name);
    if (!asset) throw new Error(`Missing party actor ${name}`);
    return { ...asset.actor, side: "players" as const };
  });

  const groupedEnemies = new Map<string, number>();
  for (const name of spec.enemyNames) groupedEnemies.set(name, (groupedEnemies.get(name) ?? 0) + 1);
  const monsters = [...groupedEnemies.entries()].flatMap(([name, count]) => {
    const asset = assets.enemyByName.get(name);
    if (!asset) throw new Error(`Missing enemy actor ${name}`);
    return createActorInstances({ ...asset.actor, side: "monsters" as const }, count);
  });

  return {
    name: spec.name,
    players,
    monsters,
    runs: options.runs,
    seed: options.seed,
    maxRounds: 20,
    turnOrder: "alternatingByRound",
  };
}

function fallbackActionCount(scenario: CombatScenario): number {
  return [...scenario.players, ...scenario.monsters].reduce(
    (count, actor) => count + actor.actions.filter((action) => action.sourceType === "fallback").length,
    0,
  );
}

function contributionSummaries(runs: CombatRunResult[], side: CombatSide): ContributionSummary[] {
  const byActor = new Map<string, CombatActorContribution & { samples: number; displayName: string }>();
  for (const run of runs) {
    for (const contribution of Object.values(run.metrics.actorContributions)) {
      if (contribution.side !== side) continue;
      const key = contribution.displayGroupName ?? contribution.actorName.replace(/ #\d+$/, "");
      const existing = byActor.get(key);
      if (!existing) {
        byActor.set(key, { ...contribution, actorName: key, displayName: key, samples: 1 });
      } else {
        existing.samples += 1;
        existing.actionsUsed += contribution.actionsUsed;
        existing.damage += contribution.damage;
        existing.healing += contribution.healing;
        existing.mitigation += contribution.mitigation;
        existing.controlTurnsApplied += contribution.controlTurnsApplied;
        existing.actionsDenied += contribution.actionsDenied;
        if (!existing.topActionName && contribution.topActionName) existing.topActionName = contribution.topActionName;
      }
    }
  }
  const runCount = Math.max(1, runs.length);
  return [...byActor.values()]
    .map((entry) => ({
      actorName: entry.actorName,
      displayName: entry.displayName,
      side: entry.side,
      actionsPerRun: round(entry.actionsUsed / runCount),
      damagePerRun: round(entry.damage / runCount),
      controlTurnsPerRun: round(entry.controlTurnsApplied / runCount),
      actionsDeniedPerRun: round(entry.actionsDenied / runCount),
      topActionName: entry.topActionName,
    }))
    .sort((a, b) => b.damagePerRun - a.damagePerRun || b.controlTurnsPerRun - a.controlTurnsPerRun);
}

function topPlayerTargets(runs: CombatRunResult[]): ScenarioSummary["topPlayerTargets"] {
  const events = runs.flatMap((run) =>
    run.offensiveContributionEvents.filter((event) =>
      event.actorSide === "players" && event.targetSide === "monsters" && event.meaningfulOffensiveAction && event.targetName,
    ),
  );
  const byTarget = new Map<string, number>();
  for (const event of events) {
    const targetName = event.targetName?.replace(/ #\d+$/, "") ?? "UNKNOWN";
    byTarget.set(targetName, (byTarget.get(targetName) ?? 0) + 1);
  }
  return [...byTarget.entries()]
    .map(([targetName, count]) => ({ targetName, events: count, share: pct(count / Math.max(1, events.length)) }))
    .sort((a, b) => b.events - a.events);
}

function firstRunDefeatOrder(firstRun: CombatRunResult | undefined): string[] {
  if (!firstRun?.firstRunTranscript) return [];
  return firstRun.firstRunTranscript.events
    .filter((event) => /defeat|defeated/i.test(event.message))
    .map((event) => event.message)
    .slice(0, 10);
}

function groupSurvival(scenario: CombatScenario, runs: CombatRunResult[]) {
  const groups = new Map<string, CombatActor[]>();
  for (const actor of [...scenario.players, ...scenario.monsters]) {
    const key = displayName(actor);
    groups.set(key, [...(groups.get(key) ?? []), actor]);
  }
  const averageAlive: Record<string, number> = {};
  const anySurvivor: Record<string, number> = {};
  for (const [group, actors] of groups) {
    let totalAlive = 0;
    let anyAliveCount = 0;
    for (const run of runs) {
      const survivorIds = new Set([...run.survivorActorIds.players, ...run.survivorActorIds.monsters]);
      const alive = actors.filter((actor) => survivorIds.has(actor.id)).length;
      totalAlive += alive;
      if (alive > 0) anyAliveCount += 1;
    }
    averageAlive[group] = round(totalAlive / Math.max(1, runs.length));
    anySurvivor[group] = pct(anyAliveCount / Math.max(1, runs.length));
  }
  return { averageAlive, anySurvivor };
}

function summarizeScenario(spec: ScenarioSpec, scenario: CombatScenario): ScenarioSummary {
  const runs = Array.from({ length: scenario.runs }, (_, index) => runCombatScenario(scenario, index));
  const runCount = Math.max(1, runs.length);
  const hydration = collectHydrationIntegrity(scenario);
  const stoppedBy = {
    playersDefeated: runs.filter((run) => run.stoppedBy === "playersDefeated").length,
    monstersDefeated: runs.filter((run) => run.stoppedBy === "monstersDefeated").length,
    maxRounds: runs.filter((run) => run.stoppedBy === "maxRounds").length,
    stalemate: runs.filter((run) => run.stoppedBy === "stalemate").length,
  };
  const survivorRates = Object.fromEntries([...scenario.players, ...scenario.monsters].map((actor) => [
    actor.name,
    pct(runs.filter((run) => run.survivorActorIds[actor.side].includes(actor.id)).length / runCount),
  ]));
  const groupSurvivors = groupSurvival(scenario, runs);

  return {
    scenarioName: scenario.name,
    packageType: spec.packageType,
    party: [...STANDARD_PARTY],
    enemies: spec.enemyNames,
    duplicateAssets: duplicateNames(spec.enemyNames),
    duplicateRepresentation: "createActorInstances",
    playerWinRate: pct(runs.filter((run) => run.winner === "players").length / runCount),
    monsterWinRate: pct(runs.filter((run) => run.winner === "monsters").length / runCount),
    stalemateRate: pct(runs.filter((run) => run.winner === "stalemate").length / runCount),
    averageRounds: round(average(runs.map((run) => run.rounds))),
    medianRounds: median(runs.map((run) => run.rounds)),
    stoppedBy,
    averageDamagePerRound: {
      players: round(sum(runs.map((run) => run.metrics.damageDealt.players)) / Math.max(1, sum(runs.map((run) => run.rounds)))),
      monsters: round(sum(runs.map((run) => run.metrics.damageDealt.monsters)) / Math.max(1, sum(runs.map((run) => run.rounds)))),
    },
    averageMainActionsUsed: {
      players: round(sum(runs.map((run) => run.metrics.mainActionsUsed.players)) / runCount),
      monsters: round(sum(runs.map((run) => run.metrics.mainActionsUsed.monsters)) / runCount),
    },
    averagePowerActionsUsed: {
      players: round(sum(runs.map((run) => run.metrics.powerActionsUsed.players)) / runCount),
      monsters: round(sum(runs.map((run) => run.metrics.powerActionsUsed.monsters)) / runCount),
    },
    c14DiagnosticsPerRun: {
      majorInjuryEvents: round(sum(runs.map((run) => run.metrics.majorInjuryDiagnostics.majorInjuryEvents)) / runCount),
      minorInjuryEvents: round(sum(runs.map((run) => run.metrics.majorInjuryDiagnostics.minorInjuryEvents)) / runCount),
      noAutoBlazeEvents: round(sum(runs.map((run) => run.metrics.majorInjuryDiagnostics.noAutoBlazeEvents)) / runCount),
      injuryDefeats: round(sum(runs.map((run) => run.metrics.majorInjuryDiagnostics.injuryDefeats)) / runCount),
    },
    survivorRates,
    groupSurvivorAverageAlive: groupSurvivors.averageAlive,
    groupAnySurvivorRate: groupSurvivors.anySurvivor,
    topPlayerTargets: topPlayerTargets(runs),
    topEnemyDamage: contributionSummaries(runs, "monsters"),
    firstRunDefeatOrder: firstRunDefeatOrder(runs[0]),
    hydrationWarnings: hydration.actors.flatMap((actor) => actor.warnings.map((warning) => `${actor.name}: ${warning}`)),
    unsupportedPowerNames: Array.from(new Set(runs.flatMap((run) => run.unsupported.unsupportedPowerNames))).sort(),
    unsupportedEffectCount: sum(runs.map((run) => run.unsupported.unsupportedEffectCount)),
    fallbackActions: fallbackActionCount(scenario),
  };
}

function buildPayload(options: CliOptions, assets: Awaited<ReturnType<typeof loadAssets>>): Payload {
  const repoHead = runGit(["rev-parse", "HEAD"]);
  const gitStatus = runGit(["status", "--short", "--untracked-files=all"]);
  const scenarios = SCENARIO_SPECS.map((spec) => summarizeScenario(spec, buildScenario(spec, assets, options)));
  return {
    title: "Balance Environment support-role candidate probe",
    provenance: {
      campaignId: BALANCE_ENVIRONMENT_CAMPAIGN_ID,
      campaignName: BALANCE_ENVIRONMENT_CAMPAIGN_NAME,
      repoHead,
      gitStatus,
      cleanWorktree: gitStatus.length === 0,
      exactCommand: exactCommand(),
      runs: options.runs,
      seed: options.seed,
      assetSource: "balance-campaign-authored",
      databaseAccess: "read-only",
      mutation: "none",
      seeders: "none",
      browserInspected: false,
      runtimeMode: "Combat Lab runCombatScenario",
    },
    notes: [
      "Custom compositions are built from existing Balance Environment assets only.",
      "Candidate support assets are named BALANCE_Support Candidate* and created by the companion ensure script.",
      "Duplicate support assets use createActorInstances, which assigns unique runtime ids and display names.",
      "First-defeated order is inferred from first-run transcript defeat messages only; aggregate first-defeat order is not exposed by CombatRunResult.",
    ],
    assets: {
      party: assets.party.map(actorInventoryEntry).sort((a, b) => a.name.localeCompare(b.name)),
      enemies: assets.enemies.map(actorInventoryEntry).sort((a, b) => a.name.localeCompare(b.name)),
    },
    scenarios,
  };
}

function formatTargets(row: ScenarioSummary): string {
  return row.topPlayerTargets.map((entry) => `${entry.targetName} ${entry.share}%`).join("; ") || "none";
}

function formatEnemyDamage(row: ScenarioSummary): string {
  return row.topEnemyDamage.map((entry) => `${entry.displayName} ${entry.damagePerRun} dmg/${entry.actionsPerRun} act`).join("; ") || "none";
}

function printHuman(payload: Payload): void {
  const { provenance } = payload;
  console.log(payload.title);
  console.log(`campaignId=${provenance.campaignId}`);
  console.log(`campaignName=${provenance.campaignName}`);
  console.log(`repoHead=${provenance.repoHead}`);
  console.log(`worktree=${provenance.cleanWorktree ? "clean" : "dirty"}`);
  console.log(`runs=${provenance.runs} seed=${provenance.seed}`);
  console.log(`exactCommand=${provenance.exactCommand}`);
  console.log(`mutation=${provenance.mutation}; databaseAccess=${provenance.databaseAccess}; seeders=${provenance.seeders}`);
  console.log("");
  console.log("Scenario definitions:");
  for (const spec of SCENARIO_SPECS) {
    console.log(`- ${spec.name} [${spec.packageType}]: ${spec.enemyNames.join(" + ")}`);
  }
  console.log("");
  console.log("Results:");
  for (const row of payload.scenarios) {
    console.log(
      `- ${row.scenarioName}: players ${row.playerWinRate}% / monsters ${row.monsterWinRate}% / draw ${row.stalemateRate}%, avgRounds ${row.averageRounds}, medRounds ${row.medianRounds}, DPR players ${row.averageDamagePerRound.players}, monsters ${row.averageDamagePerRound.monsters}`,
    );
    console.log(`  targets: ${formatTargets(row)}`);
    console.log(`  enemy damage: ${formatEnemyDamage(row)}`);
    console.log(
      `  C14/run major ${row.c14DiagnosticsPerRun.majorInjuryEvents}, minor ${row.c14DiagnosticsPerRun.minorInjuryEvents}, injuryDefeats ${row.c14DiagnosticsPerRun.injuryDefeats}; unsupported=${row.unsupportedEffectCount}; fallback=${row.fallbackActions}; hydrationWarnings=${row.hydrationWarnings.length}`,
    );
    console.log(`  first-run defeat messages: ${row.firstRunDefeatOrder.length > 0 ? row.firstRunDefeatOrder.join(" | ") : "not exposed"}`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { prisma } = await import("../prisma/client");
  try {
    const tuning = await loadActiveTuning(prisma);
    const assets = await loadAssets(prisma, tuning);
    const payload = buildPayload(options, assets);
    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      printHuman(payload);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
