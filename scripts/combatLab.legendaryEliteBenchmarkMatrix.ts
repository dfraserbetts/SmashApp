import { spawnSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";

import {
  adaptCampaignCharacterToCombatActor,
  adaptMonsterToCombatLabActor,
  itemTemplateToSummoningEquipmentItem,
} from "../lib/combat-lab/liveAdapters";
import { createActorInstances } from "../lib/combat-lab/combatState";
import { runCombatScenario } from "../lib/combat-lab/autoSimulator";
import { runScenarioSuite } from "../lib/combat-lab/reporting";
import { normalizeCombatTuning, normalizeCombatTuningFlatValues } from "../lib/config/combatTuningShared";
import {
  DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  normalizeCharacterPowerSpendScalar,
} from "../lib/config/characterBuilderTuningShared";
import { normalizePowerTuningValues, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import type { CombatAction, CombatActor, CombatScenario } from "../lib/combat-lab/types";

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
  assetType: "character" | "monster";
  actor: CombatActor;
  warnings: string[];
};

type ActionUsage = {
  actionName: string;
  sourceType: string;
  usesPerRun: number;
  damagePerRun: number;
  physicalDamagePerRun: number;
  mentalDamagePerRun: number;
  cooldownRounds: number;
};

type SpecialActionMetric = {
  actionName: string;
  usesPerRun: number;
  landedPerRun: number;
  resistedPerRun: number;
  statusUptimePerRun: number | null;
};

type LinkedRiderMetric = {
  actionName: string;
  parentActionName: string;
  usesPerRun: number;
  damagePerRun: number;
  highestDamage: number;
  preventedByPrimaryResistPerRun: number | null;
};

type ScenarioRow = {
  scenarioName: string;
  attacker: string;
  defender: string;
  seed: number;
  runs: number;
  attackerWinRate: number;
  defenderWinRate: number;
  drawOrCensoredRate: number;
  averageRounds: number;
  medianRounds: number;
  playerDefeatedRound1Rate: number;
  playerDefeatedRound2Rate: number;
  attackerDefeatedRound1Rate: number;
  attackerDefeatedRound2Rate: number;
  highestHitVsPlayer: number;
  highestHitVsBenchmark: number;
  totalKnownDamagePerRun: number;
  physicalDamagePerRun: number;
  mentalDamagePerRun: number;
  naturalAttackUsesPerRun: number;
  naturalAttackDamagePerRun: number;
  controlUsesPerRun: number;
  controlLandedPerRun: number;
  controlResistedPerRun: number;
  debuffUsesPerRun: number;
  debuffLandedPerRun: number;
  debuffResistedPerRun: number;
  linkedRiderUsesPerRun: number;
  linkedRiderDamagePerRun: number;
  highestLinkedRiderHit: number;
  mainActionDeniedPerRun: number;
  keyEnemyActionUsage: ActionUsage[];
  controlActions: SpecialActionMetric[];
  debuffActions: SpecialActionMetric[];
  linkedRiders: LinkedRiderMetric[];
  hydrationWarnings: string[];
  unsupportedPowerNames: string[];
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
    browserInspected: false;
    mutation: "none";
    databaseAccess: "read-only";
    seeders: "none";
    runtimeMode: "Combat Lab runCombatScenario";
  };
  assets: {
    attackers: Array<{
      id: string;
      name: string;
      level: number;
      tier: string | null;
      defeatModel: string;
      physicalHp: number;
      mentalHp: number;
      physicalProtection: number;
      mentalProtection: number;
      warnings: string[];
    }>;
    defenders: Array<{
      id: string;
      name: string;
      level: number;
      defeatModel: string;
      physicalHp: number;
      mentalHp: number;
      physicalProtection: number;
      mentalProtection: number;
      warnings: string[];
    }>;
  };
  scenarios: ScenarioRow[];
};

const BALANCE_ENVIRONMENT_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_ENVIRONMENT_CAMPAIGN_NAME = "Balance Environment";

const ATTACKER_NAMES = [
  "BALANCE_Legendary Elite Duelist",
  "BALANCE_Legendary Elite Hexer",
  "BALANCE_Legendary Elite Breaker Controller Rotation",
] as const;

const DEFENDER_NAMES = [
  "BALANCE_Hawkshot Archer",
  "BALANCE_Ranger Commander",
  "BALANCE_Stoneguard",
  "BALANCE_Arcane Sage",
] as const;

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
      console.log("Usage: npx --yes tsx scripts/combatLab.legendaryEliteBenchmarkMatrix.ts [--runs 100] [--seed 4242] [--json]");
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
  return ["npx", "--yes", "tsx", "scripts/combatLab.legendaryEliteBenchmarkMatrix.ts", ...process.argv.slice(2)].join(" ");
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function round(value: number | null, digits = 2): number {
  if (value === null || !Number.isFinite(value)) return 0;
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

function warningsToStrings(warnings: unknown[]): string[] {
  return warnings.map((warning) => {
    if (typeof warning === "string") return warning;
    if (warning && typeof warning === "object" && "message" in warning) {
      return String((warning as { message: unknown }).message);
    }
    return JSON.stringify(warning);
  });
}

function flattenSupportedActions(actions: CombatAction[]): CombatAction[] {
  return actions.flatMap((action) => [
    ...(action.supported ? [action] : []),
    ...flattenSupportedActions(action.secondaryActions ?? []),
  ]);
}

function offensiveActions(actor: CombatActor): CombatAction[] {
  return actor.actions.filter((action) => action.supported && action.kind === "attack");
}

function linkedAttackRiderActions(actor: CombatActor): Array<{ parent: CombatAction; rider: CombatAction }> {
  return actor.actions.flatMap((parent) =>
    (parent.secondaryActions ?? [])
      .filter((rider) => rider.supported && rider.kind === "attack" && parent.secondaryDependencyMode !== "INDEPENDENT")
      .map((rider) => ({ parent, rider })),
  );
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
      where: { campaignId: campaign.id, archivedAt: null, name: { in: [...DEFENDER_NAMES] } },
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
        name: { in: [...ATTACKER_NAMES] },
      },
      include: {
        naturalAttack: true,
        attacks: { orderBy: { sortOrder: "asc" } },
        traits: { orderBy: { sortOrder: "asc" }, include: { trait: { select: { name: true, effectText: true } } } },
        powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
      },
    }),
  ]);

  const missingCharacters = DEFENDER_NAMES.filter((name) => !characters.some((row) => row.name === name));
  const missingMonsters = ATTACKER_NAMES.filter((name) => !monsters.some((row) => row.name === name));
  if (missingCharacters.length > 0 || missingMonsters.length > 0) {
    throw new Error(`Missing benchmark assets. Characters: ${missingCharacters.join(", ") || "none"}; monsters: ${missingMonsters.join(", ") || "none"}.`);
  }

  for (const monster of monsters) {
    if (monster.tier !== "ELITE" || !monster.legendary) {
      throw new Error(`${monster.name} hydrated from DB as tier ${monster.tier}, legendary ${monster.legendary}; expected legendary ELITE.`);
    }
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

  const defenders = characters.map((row): BuiltActor => {
    const adapted = adaptCampaignCharacterToCombatActor(
      row as CharacterRow,
      tuning.combatValues,
      tuning.powerSnapshot,
      tuning.characterPowerSpendScalar,
    );
    return {
      id: row.id,
      name: row.name,
      assetType: "character",
      actor: adapted.actor,
      warnings: warningsToStrings(adapted.warnings),
    };
  });

  const attackers = monsters.map((row): BuiltActor => {
    const adapted = adaptMonsterToCombatLabActor(row as MonsterRow, monsterEquipmentById, tuning.combatValues, tuning.powerSnapshot);
    return {
      id: row.id,
      name: row.name,
      assetType: "monster",
      actor: adapted.actor,
      warnings: warningsToStrings(adapted.warnings),
    };
  });

  const unsupported = [...attackers, ...defenders].flatMap((asset) =>
    asset.actor.unsupportedPowers.map((power) => `${asset.name}: ${power.powerName}: ${power.reason}`),
  );
  if (unsupported.length > 0) {
    throw new Error(`Unsupported powers detected in Legendary Elite benchmark matrix: ${unsupported.join(" | ")}`);
  }

  return { attackers, defenders };
}

function buildScenario(attacker: BuiltActor, defender: BuiltActor, options: CliOptions, scenarioSeed: number): CombatScenario {
  return {
    name: `${attacker.name} vs ${defender.name}`,
    players: [{ ...defender.actor, side: "players" }],
    monsters: createActorInstances({ ...attacker.actor, side: "monsters" }, 1),
    runs: options.runs,
    seed: scenarioSeed,
    maxRounds: 20,
    turnOrder: "alternatingByRound",
  };
}

function actionContributionMap(suite: ReturnType<typeof runScenarioSuite>, attacker: BuiltActor) {
  const monsterContribution = suite.actorContributions.find((entry) => entry.side === "monsters" && entry.actorName === attacker.actor.name);
  return new Map((monsterContribution?.actionContributions ?? []).map((action) => [action.actionName, action]));
}

function summarizeSpecialMetrics(params: {
  attacker: BuiltActor;
  runs: Array<ReturnType<typeof runCombatScenario>>;
  contributionByActionName: ReturnType<typeof actionContributionMap>;
  monsterEvents: ReturnType<typeof runCombatScenario>["offensiveContributionEvents"];
}) {
  const runCount = Math.max(1, params.runs.length);
  const allActions = flattenSupportedActions(params.attacker.actor.actions);
  const controlActions = allActions.filter((action) => action.kind === "control");
  const debuffActions = allActions.filter((action) => action.kind === "debuff");
  const linkedRiders = linkedAttackRiderActions(params.attacker.actor);

  const contributionFor = (actionName: string) => params.contributionByActionName.get(actionName);

  const controlMetrics = controlActions.map((action): SpecialActionMetric => {
    const contribution = contributionFor(action.name);
    const uses = contribution?.uses ?? 0;
    const landed = contribution?.controlTurnsApplied ?? 0;
    return {
      actionName: action.name,
      usesPerRun: round(uses),
      landedPerRun: round(landed),
      resistedPerRun: round(Math.max(0, uses - landed)),
      statusUptimePerRun: null,
    };
  });

  const debuffMetrics = debuffActions.map((action): SpecialActionMetric => {
    const contribution = contributionFor(action.name);
    const uses = contribution?.uses ?? 0;
    const landed = contribution?.debuffApplications ?? 0;
    return {
      actionName: action.name,
      usesPerRun: round(uses),
      landedPerRun: round(landed),
      resistedPerRun: round(Math.max(0, uses - landed)),
      statusUptimePerRun: round(contribution?.debuffUptime ?? 0),
    };
  });

  const riderMetrics = linkedRiders.map(({ parent, rider }): LinkedRiderMetric => {
    const parentContribution = contributionFor(parent.name);
    const parentUses = parentContribution?.uses ?? 0;
    const parentApplications = parent.kind === "control"
      ? (parentContribution?.controlTurnsApplied ?? 0)
      : parent.kind === "debuff"
        ? (parentContribution?.debuffApplications ?? 0)
        : parentUses;
    const riderEvents = params.monsterEvents.filter((event) => event.actionName === rider.name || event.actionName === parent.name);
    return {
      actionName: rider.name,
      parentActionName: parent.name,
      usesPerRun: round(riderEvents.length / runCount),
      damagePerRun: round(riderEvents.reduce((sum, event) => sum + event.damage, 0) / runCount),
      highestDamage: riderEvents.reduce((max, event) => Math.max(max, event.damage), 0),
      preventedByPrimaryResistPerRun: round(Math.max(0, parentUses - parentApplications)),
    };
  });

  return {
    controlMetrics,
    debuffMetrics,
    riderMetrics,
    actionsDeniedPerRun: round(params.runs.reduce((sum, run) => sum + run.metrics.actionsDenied.players, 0) / runCount),
  };
}

function summarizeScenario(scenario: CombatScenario, attacker: BuiltActor, defender: BuiltActor): ScenarioRow {
  const suite = runScenarioSuite(scenario);
  const runs = Array.from({ length: scenario.runs }, (_, index) => runCombatScenario(scenario, index));
  const playerDefeatRounds = runs.flatMap((run) => run.stoppedBy === "playersDefeated" ? [run.rounds] : []);
  const attackerDefeatRounds = runs.flatMap((run) => run.stoppedBy === "monstersDefeated" ? [run.rounds] : []);
  const monsterEvents = runs.flatMap((run) =>
    run.offensiveContributionEvents.filter((event) => event.actorSide === "monsters" && event.targetSide === "players")
  );
  const playerEvents = runs.flatMap((run) =>
    run.offensiveContributionEvents.filter((event) => event.actorSide === "players" && event.targetSide === "monsters")
  );
  const contributionByActionName = actionContributionMap(suite, attacker);
  const cooldownByActionName = new Map(suite.cooldownTrace
    .filter((trace) => trace.side === "monsters" && trace.actorName === attacker.actor.name)
    .map((trace) => [trace.actionName, trace]));
  const actionPoolByName = new Map(flattenSupportedActions(attacker.actor.actions).map((action) => [action.name, action.pool]));
  for (const { parent, rider } of linkedAttackRiderActions(attacker.actor)) {
    if (rider.pool) actionPoolByName.set(parent.name, rider.pool);
  }
  const special = summarizeSpecialMetrics({ attacker, runs, contributionByActionName, monsterEvents });

  const keyEnemyActionUsage = offensiveActions(attacker.actor).map((action): ActionUsage => {
    const contribution = contributionByActionName.get(action.name);
    const cooldown = cooldownByActionName.get(action.name);
    const actionEvents = monsterEvents.filter((event) => event.actionName === action.name);
    return {
      actionName: action.name,
      sourceType: action.sourceType,
      usesPerRun: round(contribution?.uses ?? 0),
      damagePerRun: round(contribution?.damage ?? 0),
      physicalDamagePerRun: round(actionEvents.filter((event) => actionPoolByName.get(event.actionName) === "physical").reduce((sum, event) => sum + event.damage, 0) / scenario.runs),
      mentalDamagePerRun: round(actionEvents.filter((event) => actionPoolByName.get(event.actionName) === "mental").reduce((sum, event) => sum + event.damage, 0) / scenario.runs),
      cooldownRounds: cooldown?.cooldownRounds ?? action.cooldownRounds,
    };
  });

  return {
    scenarioName: scenario.name,
    attacker: attacker.name,
    defender: defender.name,
    seed: scenario.seed,
    runs: scenario.runs,
    attackerWinRate: pct(suite.monsterWinRate),
    defenderWinRate: pct(suite.playerWinRate),
    drawOrCensoredRate: pct(suite.stalemateRate),
    averageRounds: round(suite.averageRounds),
    medianRounds: median(runs.map((run) => run.rounds)),
    playerDefeatedRound1Rate: pct(playerDefeatRounds.filter((round) => round <= 1).length / Math.max(1, runs.length)),
    playerDefeatedRound2Rate: pct(playerDefeatRounds.filter((round) => round <= 2).length / Math.max(1, runs.length)),
    attackerDefeatedRound1Rate: pct(attackerDefeatRounds.filter((round) => round <= 1).length / Math.max(1, runs.length)),
    attackerDefeatedRound2Rate: pct(attackerDefeatRounds.filter((round) => round <= 2).length / Math.max(1, runs.length)),
    highestHitVsPlayer: monsterEvents.reduce((max, event) => Math.max(max, event.damage), 0),
    highestHitVsBenchmark: playerEvents.reduce((max, event) => Math.max(max, event.damage), 0),
    totalKnownDamagePerRun: round(monsterEvents.reduce((sum, event) => sum + event.damage, 0) / scenario.runs),
    physicalDamagePerRun: round(monsterEvents.filter((event) => actionPoolByName.get(event.actionName) === "physical").reduce((sum, event) => sum + event.damage, 0) / scenario.runs),
    mentalDamagePerRun: round(monsterEvents.filter((event) => actionPoolByName.get(event.actionName) === "mental").reduce((sum, event) => sum + event.damage, 0) / scenario.runs),
    naturalAttackUsesPerRun: round(keyEnemyActionUsage.filter((action) => action.sourceType === "naturalAttack").reduce((sum, action) => sum + action.usesPerRun, 0)),
    naturalAttackDamagePerRun: round(keyEnemyActionUsage.filter((action) => action.sourceType === "naturalAttack").reduce((sum, action) => sum + action.damagePerRun, 0)),
    controlUsesPerRun: round(special.controlMetrics.reduce((sum, metric) => sum + metric.usesPerRun, 0)),
    controlLandedPerRun: round(special.controlMetrics.reduce((sum, metric) => sum + metric.landedPerRun, 0)),
    controlResistedPerRun: round(special.controlMetrics.reduce((sum, metric) => sum + metric.resistedPerRun, 0)),
    debuffUsesPerRun: round(special.debuffMetrics.reduce((sum, metric) => sum + metric.usesPerRun, 0)),
    debuffLandedPerRun: round(special.debuffMetrics.reduce((sum, metric) => sum + metric.landedPerRun, 0)),
    debuffResistedPerRun: round(special.debuffMetrics.reduce((sum, metric) => sum + metric.resistedPerRun, 0)),
    linkedRiderUsesPerRun: round(special.riderMetrics.reduce((sum, metric) => sum + metric.usesPerRun, 0)),
    linkedRiderDamagePerRun: round(special.riderMetrics.reduce((sum, metric) => sum + metric.damagePerRun, 0)),
    highestLinkedRiderHit: special.riderMetrics.reduce((max, metric) => Math.max(max, metric.highestDamage), 0),
    mainActionDeniedPerRun: special.actionsDeniedPerRun,
    keyEnemyActionUsage,
    controlActions: special.controlMetrics,
    debuffActions: special.debuffMetrics,
    linkedRiders: special.riderMetrics,
    hydrationWarnings: [...attacker.warnings, ...defender.warnings],
    unsupportedPowerNames: [
      ...attacker.actor.unsupportedPowers.map((power) => `${attacker.name}: ${power.powerName}: ${power.reason}`),
      ...defender.actor.unsupportedPowers.map((power) => `${defender.name}: ${power.powerName}: ${power.reason}`),
    ],
  };
}

function buildPayload(options: CliOptions, attackers: BuiltActor[], defenders: BuiltActor[]): Payload {
  const scenarios: ScenarioRow[] = [];
  for (const attackerName of ATTACKER_NAMES) {
    const attacker = attackers.find((asset) => asset.name === attackerName);
    if (!attacker) throw new Error(`Missing attacker after load: ${attackerName}`);
    for (const defenderName of DEFENDER_NAMES) {
      const defender = defenders.find((asset) => asset.name === defenderName);
      if (!defender) throw new Error(`Missing defender after load: ${defenderName}`);
      const scenario = buildScenario(attacker, defender, options, options.seed);
      scenarios.push(summarizeScenario(scenario, attacker, defender));
    }
  }

  const gitStatus = runGit(["status", "--short", "--untracked-files=all"]);
  return {
    title: "Balance Environment Legendary Elite Benchmark Matrix",
    provenance: {
      campaignId: BALANCE_ENVIRONMENT_CAMPAIGN_ID,
      campaignName: BALANCE_ENVIRONMENT_CAMPAIGN_NAME,
      repoHead: runGit(["rev-parse", "HEAD"]),
      gitStatus,
      cleanWorktree: gitStatus.length === 0,
      exactCommand: exactCommand(),
      runs: options.runs,
      seed: options.seed,
      assetSource: "balance-campaign-authored",
      browserInspected: false,
      mutation: "none",
      databaseAccess: "read-only",
      seeders: "none",
      runtimeMode: "Combat Lab runCombatScenario",
    },
    assets: {
      attackers: attackers.map((asset) => ({
        id: asset.id,
        name: asset.name,
        level: asset.actor.level,
        tier: asset.actor.tier ?? null,
        defeatModel: asset.actor.defeatModel,
        physicalHp: asset.actor.physicalHpMax,
        mentalHp: asset.actor.mentalHpMax,
        physicalProtection: asset.actor.physicalProtection,
        mentalProtection: asset.actor.mentalProtection,
        warnings: asset.warnings,
      })),
      defenders: defenders.map((asset) => ({
        id: asset.id,
        name: asset.name,
        level: asset.actor.level,
        defeatModel: asset.actor.defeatModel,
        physicalHp: asset.actor.physicalHpMax,
        mentalHp: asset.actor.mentalHpMax,
        physicalProtection: asset.actor.physicalProtection,
        mentalProtection: asset.actor.mentalProtection,
        warnings: asset.warnings,
      })),
    },
    scenarios,
  };
}

function printHuman(payload: Payload) {
  console.log(payload.title);
  console.log(`Campaign: ${payload.provenance.campaignName} (${payload.provenance.campaignId})`);
  console.log(`Repo HEAD: ${payload.provenance.repoHead}`);
  console.log(`Git status: ${payload.provenance.cleanWorktree ? "clean" : "dirty"}`);
  console.log(`Exact command: ${payload.provenance.exactCommand}`);
  console.log(`Runs: ${payload.provenance.runs}; seed: ${payload.provenance.seed}`);
  console.log(`Mutation: ${payload.provenance.mutation}; DB: ${payload.provenance.databaseAccess}; seeders: ${payload.provenance.seeders}`);
  console.log("");
  console.log("Attackers:");
  for (const asset of payload.assets.attackers) {
    console.log(`- ${asset.name}: id ${asset.id}, tier ${asset.tier}, defeatModel ${asset.defeatModel}, HP ${asset.physicalHp}/${asset.mentalHp}, prot ${asset.physicalProtection}/${asset.mentalProtection}`);
    for (const warning of asset.warnings) console.log(`  warning: ${warning}`);
  }
  console.log("");
  console.log("Defenders:");
  for (const asset of payload.assets.defenders) {
    console.log(`- ${asset.name}: id ${asset.id}, defeatModel ${asset.defeatModel}, HP ${asset.physicalHp}/${asset.mentalHp}, prot ${asset.physicalProtection}/${asset.mentalProtection}`);
    for (const warning of asset.warnings) console.log(`  warning: ${warning}`);
  }
  console.log("");
  console.log("Scenario | A Win | D Win | Draw | Avg R | Med R | P dead R1 | P dead R2 | A dead R1 | A dead R2 | Dmg/run | Phys/run | Ment/run | Nat u/dmg | Control u/l/r | Debuff u/l/r | Rider u/dmg/high | Main denied | High vs P | High vs A");
  console.log("--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:");
  for (const row of payload.scenarios) {
    console.log([
      row.scenarioName,
      `${row.attackerWinRate}%`,
      `${row.defenderWinRate}%`,
      `${row.drawOrCensoredRate}%`,
      row.averageRounds,
      row.medianRounds,
      `${row.playerDefeatedRound1Rate}%`,
      `${row.playerDefeatedRound2Rate}%`,
      `${row.attackerDefeatedRound1Rate}%`,
      `${row.attackerDefeatedRound2Rate}%`,
      row.totalKnownDamagePerRun,
      row.physicalDamagePerRun,
      row.mentalDamagePerRun,
      `${row.naturalAttackUsesPerRun}/${row.naturalAttackDamagePerRun}`,
      `${row.controlUsesPerRun}/${row.controlLandedPerRun}/${row.controlResistedPerRun}`,
      `${row.debuffUsesPerRun}/${row.debuffLandedPerRun}/${row.debuffResistedPerRun}`,
      `${row.linkedRiderUsesPerRun}/${row.linkedRiderDamagePerRun}/${row.highestLinkedRiderHit}`,
      row.mainActionDeniedPerRun,
      row.highestHitVsPlayer,
      row.highestHitVsBenchmark,
    ].join(" | "));
    for (const warning of row.hydrationWarnings) console.log(`  warning: ${warning}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = (await import("../prisma/client")).prisma;
  try {
    const tuning = await loadActiveTuning(prisma);
    const { attackers, defenders } = await loadAssets(prisma, tuning);
    const payload = buildPayload(options, attackers, defenders);
    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      printHuman(payload);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
