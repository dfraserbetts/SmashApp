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
import { normalizePowerTuningValues, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import { analyzeOffencePressure } from "../lib/summoning/offencePressure";
import type {
  CombatAction,
  CombatActor,
  CombatContributionSourceBucket,
  CombatRunResult,
  CombatScenario,
  CombatSide,
  CombatSuiteReport,
} from "../lib/combat-lab/types";

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];
type CharacterRow = Parameters<typeof adaptCampaignCharacterToCombatActor>[0];
type MonsterRow = Parameters<typeof adaptMonsterToCombatLabActor>[0];
type ItemTemplateRow = Parameters<typeof itemTemplateToSummoningEquipmentItem>[0];

type CliOptions = {
  runs: number;
  seed: number;
  json: boolean;
  includeBoss: boolean;
};

type BuiltActor = {
  id: string;
  name: string;
  assetType: "character" | "monster";
  actor: CombatActor;
  warnings: string[];
};

type AssetSummary = {
  id: string;
  name: string;
  type: "character" | "monster";
  level: number;
  tier?: string | null;
  physicalHp: number;
  mentalHp: number;
  physicalProtection: number;
  mentalProtection: number;
  dodgeDice: number | null;
  physicalDefence: string;
  mentalDefence: string;
  signatureMoveStatus?: string;
  keyActions: Array<{
    name: string;
    sourceType: string;
    kind: string;
    pool: string | null;
    diceCount: number;
    accuracyAttribute: string;
    die: string;
    potency: number;
    cooldownRounds: number;
    pressureWarning: string;
  }>;
  warnings: string[];
  unsupported: string[];
};

type ScenarioResult = {
  scenarioName: string;
  attacker: string;
  target: string;
  runs: number;
  seed: number;
  assetSource: "balance-campaign-authored";
  runtimeMode: "Combat Lab runCombatScenario";
  attackerWinRate: number;
  targetWinRate: number;
  drawOrCensoredRate: number;
  averageRounds: number;
  medianRounds: number;
  targetDefeatedRound1Rate: number;
  targetDefeatedRound2Rate: number;
  averageActionsToDefeatTarget: number | null;
  averageAttackerRemainingHpOnWin: number | null;
  averageTargetRemainingHpOnWin: number | null;
  averageRawDamageByAttacker: number;
  averageNetDamageByAttacker: number;
  highestSingleHitNetDamage: number;
  majorInjuryEvents: number;
  normalMonsterDefeats: number;
  unsupportedPowerNames: string[];
  hydrationWarnings: string[];
  powerUsage: Array<{
    actionName: string;
    sourceType: string;
    usesPerRun: number;
    damagePerRun: number;
    cooldownRounds: number;
    preventedByCooldownPerRun: number;
    unavailableTurnsPerRun: number;
    firstUseTargetDefeatRate: number | null;
  }>;
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
    unsupportedOrIgnoredMechanics: string[];
  };
  assets: {
    attackers: AssetSummary[];
    targets: AssetSummary[];
    missingAttackers: string[];
    missingTargets: string[];
  };
  scenarios: ScenarioResult[];
};

const BALANCE_ENVIRONMENT_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_ENVIRONMENT_CAMPAIGN_NAME = "Balance Environment";

const ATTACKER_NAMES = [
  "BALANCE_Hawkshot Archer",
  "BALANCE_Ranger Commander",
  "BALANCE_Stoneguard",
  "BALANCE_Arcane Sage",
];

const TARGET_NAMES = [
  "BALANCE_Minion Grunt",
  "BALANCE_Minion Skirmisher",
  "BALANCE_Physical Striker",
  "BALANCE_Durable Soldier",
  "BALANCE_Dodge Pressure Skirmisher",
  "BALANCE_Elite Striker",
  "BALANCE_Elite Vanguard",
  "BALANCE_Elite Skirmisher",
  "BALANCE_Boss Warlord",
];

const FOCUS_ACTION_NAMES = new Set([
  "Raking Shot",
  "Skyline Shot",
  "Marked Volley",
  "Killbox Command",
  "Breaker Slam",
  "Mind Spark",
  "Mind Lance",
]);

const BASE_SCENARIOS = [
  ["BALANCE_Hawkshot Archer", "BALANCE_Physical Striker"],
  ["BALANCE_Hawkshot Archer", "BALANCE_Durable Soldier"],
  ["BALANCE_Hawkshot Archer", "BALANCE_Elite Striker"],
  ["BALANCE_Hawkshot Archer", "BALANCE_Elite Vanguard"],
  ["BALANCE_Ranger Commander", "BALANCE_Physical Striker"],
  ["BALANCE_Ranger Commander", "BALANCE_Durable Soldier"],
  ["BALANCE_Ranger Commander", "BALANCE_Elite Striker"],
  ["BALANCE_Ranger Commander", "BALANCE_Elite Vanguard"],
  ["BALANCE_Stoneguard", "BALANCE_Physical Striker"],
  ["BALANCE_Stoneguard", "BALANCE_Durable Soldier"],
  ["BALANCE_Stoneguard", "BALANCE_Elite Striker"],
  ["BALANCE_Stoneguard", "BALANCE_Elite Vanguard"],
  ["BALANCE_Arcane Sage", "BALANCE_Physical Striker"],
  ["BALANCE_Arcane Sage", "BALANCE_Elite Striker"],
] as const;

const BOSS_SCENARIOS = [
  ["BALANCE_Hawkshot Archer", "BALANCE_Boss Warlord"],
  ["BALANCE_Ranger Commander", "BALANCE_Boss Warlord"],
  ["BALANCE_Stoneguard", "BALANCE_Boss Warlord"],
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
  const options: CliOptions = { runs: 50, seed: 4242, json: false, includeBoss: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--include-boss") {
      options.includeBoss = true;
    } else if (arg === "--runs") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) options.runs = Math.trunc(value);
      index += 1;
    } else if (arg === "--seed") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value)) options.seed = Math.trunc(value);
      index += 1;
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
  return ["npx", "--yes", "tsx", "scripts/combatLab.offenceScenarioPressure.ts", ...process.argv.slice(2)].join(" ");
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function round(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pct(value: number): number {
  return round(value * 100, 1) ?? 0;
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0;
}

function actorTotalHp(actor: CombatActor): number {
  return Math.max(0, actor.physicalHpCurrent) + Math.max(0, actor.mentalHpCurrent);
}

function actorActionPressure(actor: CombatActor, action: CombatAction): string {
  if (action.kind !== "attack") return "none";
  const die = actor.attributeDice[action.accuracyAttribute] ?? "D8";
  const woundsPerSuccess = Math.max(1, action.effectPerPrimarySuccess ?? action.potency);
  return analyzeOffencePressure({ diceCount: action.diceCount, die, woundsPerSuccess }).warningLevel;
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
  };
}

function summarizeActor(asset: BuiltActor): AssetSummary {
  const actor = asset.actor;
  const offensiveActions = actor.actions.filter((action) => action.kind === "attack" && action.supported);
  const keyActions = offensiveActions.map((action) => ({
    name: action.name,
    sourceType: action.sourceType,
    kind: action.kind,
    pool: action.pool ?? null,
    diceCount: action.diceCount,
    accuracyAttribute: action.accuracyAttribute,
    die: actor.attributeDice[action.accuracyAttribute] ?? "D8",
    potency: action.potency,
    cooldownRounds: action.cooldownRounds,
    pressureWarning: actorActionPressure(actor, action),
  }));
  return {
    id: asset.id,
    name: asset.name,
    type: asset.assetType,
    level: actor.level,
    tier: actor.tier ?? null,
    physicalHp: actor.physicalHpMax,
    mentalHp: actor.mentalHpMax,
    physicalProtection: actor.physicalProtection,
    mentalProtection: actor.mentalProtection,
    dodgeDice: actor.dodgeDice ?? null,
    physicalDefence: `${actor.physicalDefenceDice ?? 0} x ${actor.physicalBlockPerSuccess ?? 0}`,
    mentalDefence: `${actor.mentalDefenceDice ?? 0} x ${actor.mentalBlockPerSuccess ?? 0}`,
    signatureMoveStatus: asset.assetType === "character"
      ? actor.actions.some((action) => action.sourceType === "signatureMove") ? "hydrated" : "none hydrated"
      : undefined,
    keyActions,
    warnings: asset.warnings,
    unsupported: actor.unsupportedPowers.map((power) => `${power.powerName}: ${power.reason}`),
  };
}

function scenarioName(attacker: string, target: string): string {
  return `${attacker} vs ${target}`;
}

function buildScenario(attacker: BuiltActor, target: BuiltActor, options: CliOptions, scenarioSeed: number): CombatScenario {
  return {
    name: scenarioName(attacker.name, target.name),
    players: [{ ...attacker.actor, side: "players" }],
    monsters: createActorInstances({ ...target.actor, side: "monsters" }, 1),
    runs: options.runs,
    seed: scenarioSeed,
    maxRounds: 20,
    turnOrder: "alternatingByRound",
  };
}

function firstUseDefeatedTarget(run: CombatRunResult, actionName: string): boolean | null {
  const firstUse = run.offensiveContributionEvents.find((event) =>
    event.actorSide === "players" && event.actionName === actionName && event.meaningfulOffensiveAction
  );
  if (!firstUse) return null;
  return run.stoppedBy === "monstersDefeated" && firstUse.round === run.rounds;
}

function summarizeScenario(
  scenario: CombatScenario,
  attacker: BuiltActor,
  target: BuiltActor,
): ScenarioResult {
  const suite = runScenarioSuite(scenario);
  const runs = Array.from({ length: scenario.runs }, (_, index) => runCombatScenario(scenario, index));
  const attackerWinRuns = runs.filter((run) => run.winner === "players");
  const targetWinRuns = runs.filter((run) => run.winner === "monsters");
  const attackerRemaining = attackerWinRuns.flatMap((run) => {
    const id = run.survivorActorIds.players[0];
    if (!id) return [];
    const contribution = run.metrics.actorContributions[id];
    return contribution ? [] : [];
  });
  void attackerRemaining;

  const targetDefeatEvents = runs.flatMap((run) =>
    run.stoppedBy === "monstersDefeated" ? [run.rounds] : [],
  );
  const playerEvents = runs.flatMap((run) =>
    run.offensiveContributionEvents.filter((event) => event.actorSide === "players" && event.targetSide === "monsters"),
  );
  const perRunPlayerDamage = runs.map((run) =>
    run.offensiveContributionEvents
      .filter((event) => event.actorSide === "players" && event.targetSide === "monsters")
      .reduce((sum, event) => sum + event.damage, 0),
  );
  const targetWinRemaining = targetWinRuns.flatMap((run) => {
    const targetId = run.survivorActorIds.monsters[0];
    const eventTargetIds = new Set(run.offensiveContributionEvents.map((event) => event.targetId).filter(Boolean));
    void eventTargetIds;
    return targetId ? [0] : [];
  });
  void targetWinRemaining;

  const playerContribution = suite.actorContributions.find((entry) => entry.side === "players" && entry.actorName === attacker.actor.name);
  const contributionByActionName = new Map((playerContribution?.actionContributions ?? []).map((action) => [action.actionName, action]));
  const focusActions = attacker.actor.actions.filter((action) =>
    action.kind === "attack" &&
    (FOCUS_ACTION_NAMES.has(action.name) || action.sourceType === "signatureMove")
  );
  const contributionOnlyActions = (playerContribution?.actionContributions ?? []).filter((action) =>
    action.uses > 0 && !focusActions.some((candidate) => candidate.name === action.actionName)
  );
  const powerUsage = [
    ...focusActions.map((action) => ({
      actionName: action.name,
      sourceType: action.sourceType,
      contribution: contributionByActionName.get(action.name) ?? null,
    })),
    ...contributionOnlyActions.map((action) => ({
      actionName: action.actionName,
      sourceType: action.sourceType,
      contribution: action,
    })),
  ]
    .map((entry) => {
      const action = entry.contribution;
      const cooldown = suite.cooldownTrace.find((trace) => trace.actorName === attacker.actor.name && trace.actionName === entry.actionName);
      const firstUseSamples = runs
        .map((run) => firstUseDefeatedTarget(run, entry.actionName))
        .filter((value): value is boolean => value !== null);
      return {
        actionName: entry.actionName,
        sourceType: entry.sourceType,
        usesPerRun: round(action?.uses ?? 0) ?? 0,
        damagePerRun: round(action?.damage ?? 0) ?? 0,
        cooldownRounds: cooldown?.cooldownRounds ?? 0,
        preventedByCooldownPerRun: round(cooldown?.preventedByCooldown ?? 0) ?? 0,
        unavailableTurnsPerRun: round(cooldown?.unavailableTurns ?? 0) ?? 0,
        firstUseTargetDefeatRate: firstUseSamples.length > 0
          ? pct(firstUseSamples.filter(Boolean).length / firstUseSamples.length)
          : null,
      };
    });

  return {
    scenarioName: scenario.name,
    attacker: attacker.name,
    target: target.name,
    runs: scenario.runs,
    seed: scenario.seed,
    assetSource: "balance-campaign-authored",
    runtimeMode: "Combat Lab runCombatScenario",
    attackerWinRate: pct(suite.playerWinRate),
    targetWinRate: pct(suite.monsterWinRate),
    drawOrCensoredRate: pct(suite.stalemateRate),
    averageRounds: round(suite.averageRounds) ?? 0,
    medianRounds: suite.medianRounds,
    targetDefeatedRound1Rate: pct(targetDefeatEvents.filter((round) => round <= 1).length / Math.max(1, runs.length)),
    targetDefeatedRound2Rate: pct(targetDefeatEvents.filter((round) => round <= 2).length / Math.max(1, runs.length)),
    averageActionsToDefeatTarget: round(suite.defeatMetrics.monsterDefeated.avgMeaningfulActionsToDefeat),
    averageAttackerRemainingHpOnWin: round(average(attackerWinRuns.map((run) => run.winnerHealthRemainingPercent * 100))),
    averageTargetRemainingHpOnWin: round(average(targetWinRuns.map((run) => run.winnerHealthRemainingPercent * 100))),
    averageRawDamageByAttacker: round(average(perRunPlayerDamage) ?? 0) ?? 0,
    averageNetDamageByAttacker: round(suite.actorContributions.find((entry) => entry.side === "players")?.damage ?? 0) ?? 0,
    highestSingleHitNetDamage: Math.max(0, ...playerEvents.map((event) => event.damage)),
    majorInjuryEvents: suite.majorInjuryDiagnostics.majorInjuryEvents,
    normalMonsterDefeats: suite.majorInjuryDiagnostics.normalMonsterDefeats,
    unsupportedPowerNames: suite.unsupported.unsupportedPowerNames,
    hydrationWarnings: suite.hydrationIntegrity.hydrationWarnings,
    powerUsage,
  };
}

async function buildAssets(prisma: PrismaClientInstance, tuning: Awaited<ReturnType<typeof loadActiveTuning>>) {
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
      where: { campaignId: campaign.id, archivedAt: null, name: { in: ATTACKER_NAMES } },
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
        name: { in: TARGET_NAMES },
      },
      include: {
        naturalAttack: true,
        attacks: { orderBy: { sortOrder: "asc" } },
        traits: { orderBy: { sortOrder: "asc" }, include: { trait: { select: { name: true, effectText: true } } } },
        powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
      },
    }),
  ]);

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

  const attackers = characters.map((row) => {
    const adapted = adaptCampaignCharacterToCombatActor(row as CharacterRow, tuning.combatValues, tuning.powerSnapshot);
    return {
      id: row.id,
      name: row.name,
      assetType: "character" as const,
      actor: adapted.actor,
      warnings: warningsToStrings(adapted.warnings),
    };
  });
  const targets = monsters.map((row) => {
    const adapted = adaptMonsterToCombatLabActor(row as MonsterRow, monsterEquipmentById, tuning.combatValues, tuning.powerSnapshot);
    return {
      id: row.id,
      name: row.name,
      assetType: "monster" as const,
      actor: adapted.actor,
      warnings: warningsToStrings(adapted.warnings),
    };
  });
  return {
    attackers,
    targets,
    missingAttackers: ATTACKER_NAMES.filter((name) => !attackers.some((actor) => actor.name === name)),
    missingTargets: TARGET_NAMES.filter((name) => !targets.some((actor) => actor.name === name)),
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
    console.log(`- ${asset.name}: id ${asset.id}, L${asset.level}, HP ${asset.physicalHp}/${asset.mentalHp}, signature ${asset.signatureMoveStatus ?? "n/a"}`);
    for (const action of asset.keyActions) {
      console.log(`  - ${action.name}: ${action.sourceType}, ${action.diceCount}x${action.die} ${action.accuracyAttribute}, W/S ${action.potency}, cooldown ${action.cooldownRounds}, pressure ${action.pressureWarning}`);
    }
    for (const warning of asset.warnings) console.log(`  warning: ${warning}`);
    for (const unsupported of asset.unsupported) console.log(`  unsupported: ${unsupported}`);
  }
  console.log("");
  console.log("Targets:");
  for (const asset of payload.assets.targets) {
    console.log(`- ${asset.name}: id ${asset.id}, ${asset.tier ?? "n/a"} L${asset.level}, HP ${asset.physicalHp}/${asset.mentalHp}, protection ${asset.physicalProtection}/${asset.mentalProtection}, dodge ${asset.dodgeDice}, defence P ${asset.physicalDefence}, M ${asset.mentalDefence}`);
    for (const warning of asset.warnings) console.log(`  warning: ${warning}`);
    for (const unsupported of asset.unsupported) console.log(`  unsupported: ${unsupported}`);
  }
  if (payload.assets.missingAttackers.length > 0) console.log(`Missing attackers: ${payload.assets.missingAttackers.join(", ")}`);
  if (payload.assets.missingTargets.length > 0) console.log(`Missing targets: ${payload.assets.missingTargets.join(", ")}`);
  console.log("");
  console.log("Scenario | A Win | T Win | Draw | Avg R | Med R | T dead R1 | T dead R2 | Avg actions | A HP win | T HP win | High hit");
  console.log("--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:");
  for (const row of payload.scenarios) {
    console.log([
      row.scenarioName,
      `${row.attackerWinRate}%`,
      `${row.targetWinRate}%`,
      `${row.drawOrCensoredRate}%`,
      row.averageRounds,
      row.medianRounds,
      `${row.targetDefeatedRound1Rate}%`,
      `${row.targetDefeatedRound2Rate}%`,
      row.averageActionsToDefeatTarget ?? "n/a",
      row.averageAttackerRemainingHpOnWin ?? "n/a",
      row.averageTargetRemainingHpOnWin ?? "n/a",
      row.highestSingleHitNetDamage,
    ].join(" | "));
    for (const usage of row.powerUsage.filter((entry) => FOCUS_ACTION_NAMES.has(entry.actionName) || entry.sourceType === "signatureMove")) {
      console.log(
        `  ${usage.actionName}: uses/run ${usage.usesPerRun}, damage/run ${usage.damagePerRun}, cooldown ${usage.cooldownRounds}, cooldown blocks/run ${usage.preventedByCooldownPerRun}, first-use defeat ${usage.firstUseTargetDefeatRate ?? "n/a"}%`,
      );
    }
    if (row.hydrationWarnings.length > 0) console.log(`  hydration warnings: ${row.hydrationWarnings.join(" | ")}`);
    if (row.unsupportedPowerNames.length > 0) console.log(`  unsupported powers: ${row.unsupportedPowerNames.join(", ")}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = (await import("../prisma/client")).prisma;
  try {
    const tuning = await loadActiveTuning(prisma);
    const assets = await buildAssets(prisma, tuning);
    const attackerByName = new Map(assets.attackers.map((actor) => [actor.name, actor]));
    const targetByName = new Map(assets.targets.map((actor) => [actor.name, actor]));
    const scenarioPairs = [...BASE_SCENARIOS, ...(options.includeBoss ? BOSS_SCENARIOS : [])];
    const scenarios = scenarioPairs.flatMap(([attackerName, targetName], index) => {
      const attacker = attackerByName.get(attackerName);
      const target = targetByName.get(targetName);
      if (!attacker || !target) return [];
      const scenario = buildScenario(attacker, target, options, options.seed + index * 101);
      return [summarizeScenario(scenario, attacker, target)];
    });
    const gitStatus = runGit(["status", "--short", "--untracked-files=all"]);
    const unsupportedOrIgnoredMechanics = Array.from(new Set([
      ...assets.attackers.flatMap((actor) => actor.warnings),
      ...assets.targets.flatMap((actor) => actor.warnings),
      ...assets.attackers.flatMap((actor) => actor.actor.unsupportedPowers.map((power) => `${actor.name}: ${power.powerName}: ${power.reason}`)),
      ...assets.targets.flatMap((actor) => actor.actor.unsupportedPowers.map((power) => `${actor.name}: ${power.powerName}: ${power.reason}`)),
    ]));
    const payload: Payload = {
      title: "Balance Environment Offence Scenario Pressure",
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
        unsupportedOrIgnoredMechanics,
      },
      assets: {
        attackers: assets.attackers.map(summarizeActor),
        targets: assets.targets.map(summarizeActor),
        missingAttackers: assets.missingAttackers,
        missingTargets: assets.missingTargets,
      },
      scenarios,
    };
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
