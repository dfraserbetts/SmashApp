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
  includePlaceholder: boolean;
};

type BuiltActor = {
  id: string;
  name: string;
  assetType: "character" | "monster";
  roleGroup: "player" | "soldier" | "elite" | "boss" | "minion";
  actor: CombatActor;
  warnings: string[];
};

type ActionSummary = {
  name: string;
  sourceType: string;
  kind: string;
  pool: string | null;
  diceCount: number;
  die: string;
  accuracyAttribute: string;
  potency: number;
  cooldownRounds: number;
  placeholder: boolean;
};

type AssetSummary = {
  id: string;
  name: string;
  type: "character" | "monster";
  roleGroup: BuiltActor["roleGroup"];
  tier: string | null;
  level: number;
  physicalHp: number;
  mentalHp: number;
  physicalProtection: number;
  mentalProtection: number;
  dodgeDice: number | null;
  physicalDefence: string;
  mentalDefence: string;
  meaningfulOffence: boolean;
  placeholderOnly: boolean;
  suitableForIncomingEvidence: boolean;
  offensiveActions: ActionSummary[];
  defensiveActions: ActionSummary[];
  warnings: string[];
  unsupported: string[];
};

type ScenarioResult = {
  scenarioName: string;
  attacker: string;
  defender: string;
  attackerRoleGroup: BuiltActor["roleGroup"];
  runs: number;
  seed: number;
  runtimeMode: "Combat Lab runCombatScenario";
  attackerWinRate: number;
  defenderWinRate: number;
  drawOrCensoredRate: number;
  averageRounds: number;
  medianRounds: number;
  playerDefeatedRound1Rate: number;
  playerDefeatedRound2Rate: number;
  averagePlayerRemainingHpOnWin: number | null;
  averageAttackerRemainingHpOnWin: number | null;
  highestSingleHitNetDamageAgainstPlayer: number;
  majorInjuryEvents: number;
  normalMonsterDefeats: number;
  keyEnemyActionUsage: Array<{
    actionName: string;
    sourceType: string;
    usesPerRun: number;
    damagePerRun: number;
    cooldownRounds: number;
    preventedByCooldownPerRun: number;
  }>;
  keyPlayerDefensiveUsage: Array<{
    actionName: string;
    sourceType: string;
    usesPerRun: number;
    cooldownRounds: number;
    preventedByCooldownPerRun: number;
  }>;
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
    unsupportedOrIgnoredMechanics: string[];
  };
  assets: {
    playerDefenders: AssetSummary[];
    soldierAttackers: AssetSummary[];
    eliteAttackers: AssetSummary[];
    bossAttackers: AssetSummary[];
    minionAttackers: AssetSummary[];
    missingCharacters: string[];
    missingMonsters: string[];
  };
  skippedPlaceholderScenarios: Array<{ attacker: string; defender: string; reason: string }>;
  scenarios: ScenarioResult[];
};

const BALANCE_ENVIRONMENT_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_ENVIRONMENT_CAMPAIGN_NAME = "Balance Environment";

const PLAYER_DEFENDER_NAMES = [
  "BALANCE_Hawkshot Archer",
  "BALANCE_Ranger Commander",
  "BALANCE_Stoneguard",
  "BALANCE_Arcane Sage",
];

const SOLDIER_ATTACKER_NAMES = [
  "BALANCE_Physical Striker",
  "BALANCE_Mental Wailer",
  "BALANCE_Dodge Pressure Skirmisher",
  "BALANCE_Durable Soldier",
  "BALANCE_Control Hexer",
];

const ELITE_ATTACKER_NAMES = [
  "BALANCE_Elite Striker",
  "BALANCE_Elite Wailer",
  "BALANCE_Elite Skirmisher",
  "BALANCE_Elite Vanguard",
  "BALANCE_Elite Hexer",
];

const BOSS_ATTACKER_NAMES = [
  "BALANCE_Boss Warlord",
  "BALANCE_Boss Hexlord",
  "BALANCE_Boss Behemoth",
];

const MINION_ATTACKER_NAMES = [
  "BALANCE_Minion Grunt",
  "BALANCE_Minion Skirmisher",
  "BALANCE_Minion Striker",
  "BALANCE_Minion Wailer",
  "BALANCE_Minion Hexling",
];

const MINIMUM_SCENARIOS = [
  ["BALANCE_Physical Striker", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Physical Striker", "BALANCE_Ranger Commander"],
  ["BALANCE_Physical Striker", "BALANCE_Stoneguard"],
  ["BALANCE_Physical Striker", "BALANCE_Arcane Sage"],
  ["BALANCE_Mental Wailer", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Mental Wailer", "BALANCE_Ranger Commander"],
  ["BALANCE_Mental Wailer", "BALANCE_Stoneguard"],
  ["BALANCE_Mental Wailer", "BALANCE_Arcane Sage"],
  ["BALANCE_Dodge Pressure Skirmisher", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Dodge Pressure Skirmisher", "BALANCE_Stoneguard"],
  ["BALANCE_Minion Grunt", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Minion Grunt", "BALANCE_Arcane Sage"],
  ["BALANCE_Minion Hexling", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Minion Hexling", "BALANCE_Arcane Sage"],
  ["BALANCE_Minion Skirmisher", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Minion Skirmisher", "BALANCE_Arcane Sage"],
  ["BALANCE_Minion Wailer", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Minion Wailer", "BALANCE_Arcane Sage"],
  ["BALANCE_Minion Striker", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Minion Striker", "BALANCE_Arcane Sage"],
  ["BALANCE_Elite Vanguard", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Elite Vanguard", "BALANCE_Ranger Commander"],
  ["BALANCE_Elite Vanguard", "BALANCE_Stoneguard"],
  ["BALANCE_Elite Vanguard", "BALANCE_Arcane Sage"],
  ["BALANCE_Elite Hexer", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Elite Hexer", "BALANCE_Ranger Commander"],
  ["BALANCE_Elite Hexer", "BALANCE_Stoneguard"],
  ["BALANCE_Elite Hexer", "BALANCE_Arcane Sage"],
  ["BALANCE_Elite Skirmisher", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Elite Skirmisher", "BALANCE_Ranger Commander"],
  ["BALANCE_Elite Skirmisher", "BALANCE_Stoneguard"],
  ["BALANCE_Elite Skirmisher", "BALANCE_Arcane Sage"],
  ["BALANCE_Elite Wailer", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Elite Wailer", "BALANCE_Ranger Commander"],
  ["BALANCE_Elite Wailer", "BALANCE_Stoneguard"],
  ["BALANCE_Elite Wailer", "BALANCE_Arcane Sage"],
  ["BALANCE_Elite Striker", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Elite Striker", "BALANCE_Ranger Commander"],
  ["BALANCE_Elite Striker", "BALANCE_Stoneguard"],
  ["BALANCE_Elite Striker", "BALANCE_Arcane Sage"],
  ["BALANCE_Boss Warlord", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Boss Warlord", "BALANCE_Ranger Commander"],
  ["BALANCE_Boss Warlord", "BALANCE_Stoneguard"],
  ["BALANCE_Boss Warlord", "BALANCE_Arcane Sage"],
  ["BALANCE_Boss Hexlord", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Boss Hexlord", "BALANCE_Ranger Commander"],
  ["BALANCE_Boss Hexlord", "BALANCE_Stoneguard"],
  ["BALANCE_Boss Hexlord", "BALANCE_Arcane Sage"],
  ["BALANCE_Boss Behemoth", "BALANCE_Hawkshot Archer"],
  ["BALANCE_Boss Behemoth", "BALANCE_Ranger Commander"],
  ["BALANCE_Boss Behemoth", "BALANCE_Stoneguard"],
  ["BALANCE_Boss Behemoth", "BALANCE_Arcane Sage"],
] as const;

const OPTIONAL_SCENARIOS = [] as const;

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
  const options: CliOptions = { runs: 50, seed: 4242, json: false, includePlaceholder: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--include-placeholder") {
      options.includePlaceholder = true;
    } else if (arg === "--runs") {
      options.runs = Math.max(1, Math.trunc(Number(argv[index + 1] ?? options.runs)));
      index += 1;
    } else if (arg === "--seed") {
      options.seed = Math.trunc(Number(argv[index + 1] ?? options.seed));
      index += 1;
    } else if (arg === "--help") {
      console.log("Usage: npx --yes tsx scripts/combatLab.incomingPressureBaseline.ts [--runs 50] [--seed 4242] [--json] [--include-placeholder]");
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
  return ["npx", "--yes", "tsx", "scripts/combatLab.incomingPressureBaseline.ts", ...process.argv.slice(2)].join(" ");
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

function warningsToStrings(warnings: unknown[]): string[] {
  return warnings.map((warning) => {
    if (typeof warning === "string") return warning;
    if (warning && typeof warning === "object" && "message" in warning) {
      return String((warning as { message: unknown }).message);
    }
    return JSON.stringify(warning);
  });
}

function isPlaceholderAction(action: CombatAction): boolean {
  return /placeholder/i.test(action.name);
}

function offensiveActions(actor: CombatActor): CombatAction[] {
  return actor.actions.filter((action) => action.kind === "attack" && action.supported);
}

function defensiveActions(actor: CombatActor): CombatAction[] {
  return actor.actions.filter((action) => action.supported && action.kind === "defence");
}

function actionSummary(actor: CombatActor, action: CombatAction): ActionSummary {
  return {
    name: action.name,
    sourceType: action.sourceType,
    kind: action.kind,
    pool: action.pool ?? null,
    diceCount: action.diceCount,
    die: actor.attributeDice[action.accuracyAttribute] ?? "D8",
    accuracyAttribute: action.accuracyAttribute,
    potency: action.potency,
    cooldownRounds: action.cooldownRounds,
    placeholder: isPlaceholderAction(action),
  };
}

function summarizeAsset(asset: BuiltActor): AssetSummary {
  const actor = asset.actor;
  const attacks = offensiveActions(actor);
  const placeholderOnly = attacks.length > 0 && attacks.every(isPlaceholderAction);
  return {
    id: asset.id,
    name: asset.name,
    type: asset.assetType,
    roleGroup: asset.roleGroup,
    tier: actor.tier ?? null,
    level: actor.level,
    physicalHp: actor.physicalHpMax,
    mentalHp: actor.mentalHpMax,
    physicalProtection: actor.physicalProtection,
    mentalProtection: actor.mentalProtection,
    dodgeDice: actor.dodgeDice ?? null,
    physicalDefence: `${actor.physicalDefenceDice ?? 0} dice, block ${actor.physicalBlockPerSuccess ?? 0}/success`,
    mentalDefence: `${actor.mentalDefenceDice ?? 0} dice, block ${actor.mentalBlockPerSuccess ?? 0}/success`,
    meaningfulOffence: attacks.length > 0 && !placeholderOnly,
    placeholderOnly,
    suitableForIncomingEvidence: asset.assetType === "monster" && attacks.length > 0 && !placeholderOnly,
    offensiveActions: attacks.map((action) => actionSummary(actor, action)),
    defensiveActions: defensiveActions(actor).map((action) => actionSummary(actor, action)),
    warnings: asset.warnings,
    unsupported: actor.unsupportedPowers.map((power) => `${power.powerName}: ${power.reason}`),
  };
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

async function buildAssets(prisma: PrismaClientInstance, tuning: Awaited<ReturnType<typeof loadActiveTuning>>) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: BALANCE_ENVIRONMENT_CAMPAIGN_ID },
    select: { id: true, name: true },
  });
  if (!campaign) throw new Error(`Balance Environment campaign not found: ${BALANCE_ENVIRONMENT_CAMPAIGN_ID}`);
  if (campaign.name !== BALANCE_ENVIRONMENT_CAMPAIGN_NAME) {
    throw new Error(`Campaign ${campaign.id} name "${campaign.name}" did not match ${BALANCE_ENVIRONMENT_CAMPAIGN_NAME}.`);
  }

  const monsterNames = [
    ...SOLDIER_ATTACKER_NAMES,
    ...ELITE_ATTACKER_NAMES,
    ...BOSS_ATTACKER_NAMES,
    ...MINION_ATTACKER_NAMES,
  ];

  const [characters, monsters] = await Promise.all([
    prisma.campaignCharacter.findMany({
      where: { campaignId: campaign.id, archivedAt: null, name: { in: PLAYER_DEFENDER_NAMES } },
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
        name: { in: monsterNames },
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

  const players = characters.map((row) => {
    const adapted = adaptCampaignCharacterToCombatActor(
      row as CharacterRow,
      tuning.combatValues,
      tuning.powerSnapshot,
      tuning.characterPowerSpendScalar,
    );
    return {
      id: row.id,
      name: row.name,
      assetType: "character" as const,
      roleGroup: "player" as const,
      actor: adapted.actor,
      warnings: warningsToStrings(adapted.warnings),
    };
  });

  const monstersBuilt = monsters.map((row) => {
    const adapted = adaptMonsterToCombatLabActor(row as MonsterRow, monsterEquipmentById, tuning.combatValues, tuning.powerSnapshot);
    const roleGroup: BuiltActor["roleGroup"] = SOLDIER_ATTACKER_NAMES.includes(row.name)
      ? "soldier"
      : ELITE_ATTACKER_NAMES.includes(row.name)
        ? "elite"
        : BOSS_ATTACKER_NAMES.includes(row.name)
          ? "boss"
          : "minion";
    return {
      id: row.id,
      name: row.name,
      assetType: "monster" as const,
      roleGroup,
      actor: adapted.actor,
      warnings: warningsToStrings(adapted.warnings),
    };
  });

  return {
    players,
    monsters: monstersBuilt,
    missingCharacters: PLAYER_DEFENDER_NAMES.filter((name) => !players.some((actor) => actor.name === name)),
    missingMonsters: monsterNames.filter((name) => !monstersBuilt.some((actor) => actor.name === name)),
  };
}

function buildScenario(attacker: BuiltActor, defender: BuiltActor, options: CliOptions, scenarioSeed: number): CombatScenario {
  return {
    name: `${attacker.name} incoming pressure vs ${defender.name}`,
    players: [{ ...defender.actor, side: "players" }],
    monsters: createActorInstances({ ...attacker.actor, side: "monsters" }, 1),
    runs: options.runs,
    seed: scenarioSeed,
    maxRounds: 20,
    turnOrder: "alternatingByRound",
  };
}

function summarizeScenario(scenario: CombatScenario, attacker: BuiltActor, defender: BuiltActor): ScenarioResult {
  const suite = runScenarioSuite(scenario);
  const runs = Array.from({ length: scenario.runs }, (_, index) => runCombatScenario(scenario, index));
  const attackerWinRuns = runs.filter((run) => run.winner === "monsters");
  const defenderWinRuns = runs.filter((run) => run.winner === "players");
  const playerDefeatRounds = runs.flatMap((run) => run.stoppedBy === "playersDefeated" ? [run.rounds] : []);
  const monsterEvents = runs.flatMap((run) =>
    run.offensiveContributionEvents.filter((event) => event.actorSide === "monsters" && event.targetSide === "players")
  );
  const highestHit = monsterEvents.reduce((max, event) => Math.max(max, event.damage), 0);
  const monsterContribution = suite.actorContributions.find((entry) => entry.side === "monsters" && entry.actorName === attacker.actor.name);
  const contributionByActionName = new Map((monsterContribution?.actionContributions ?? []).map((action) => [action.actionName, action]));
  const cooldownByActionName = new Map(suite.cooldownTrace
    .filter((trace) => trace.side === "monsters" && trace.actorName === attacker.actor.name)
    .map((trace) => [trace.actionName, trace]));

  const keyEnemyActionUsage = offensiveActions(attacker.actor).map((action) => {
    const contribution = contributionByActionName.get(action.name);
    const cooldown = cooldownByActionName.get(action.name);
    return {
      actionName: action.name,
      sourceType: action.sourceType,
      usesPerRun: round(contribution?.uses ?? 0) ?? 0,
      damagePerRun: round(contribution?.damage ?? 0) ?? 0,
      cooldownRounds: cooldown?.cooldownRounds ?? action.cooldownRounds,
      preventedByCooldownPerRun: round(cooldown?.preventedByCooldown ?? 0) ?? 0,
    };
  });

  const playerCooldowns = suite.cooldownTrace.filter((trace) => trace.side === "players" && trace.actorName === defender.actor.name);
  const playerContribution = suite.actorContributions.find((entry) => entry.side === "players" && entry.actorName === defender.actor.name);
  const playerContributionByActionName = new Map((playerContribution?.actionContributions ?? []).map((action) => [action.actionName, action]));
  const keyPlayerDefensiveUsage = defensiveActions(defender.actor).map((action) => {
    const cooldown = playerCooldowns.find((trace) => trace.actionName === action.name);
    const contribution = playerContributionByActionName.get(action.name);
    return {
      actionName: action.name,
      sourceType: action.sourceType,
      usesPerRun: round(contribution?.uses ?? cooldown?.uses ?? 0) ?? 0,
      cooldownRounds: cooldown?.cooldownRounds ?? action.cooldownRounds,
      preventedByCooldownPerRun: round(cooldown?.preventedByCooldown ?? 0) ?? 0,
    };
  }).filter((entry) => entry.usesPerRun > 0 || entry.preventedByCooldownPerRun > 0);

  return {
    scenarioName: scenario.name,
    attacker: attacker.name,
    defender: defender.name,
    attackerRoleGroup: attacker.roleGroup,
    runs: scenario.runs,
    seed: scenario.seed,
    runtimeMode: "Combat Lab runCombatScenario",
    attackerWinRate: pct(suite.monsterWinRate),
    defenderWinRate: pct(suite.playerWinRate),
    drawOrCensoredRate: pct(suite.stalemateRate),
    averageRounds: round(suite.averageRounds) ?? 0,
    medianRounds: median(runs.map((run) => run.rounds)),
    playerDefeatedRound1Rate: pct(playerDefeatRounds.filter((round) => round <= 1).length / Math.max(1, runs.length)),
    playerDefeatedRound2Rate: pct(playerDefeatRounds.filter((round) => round <= 2).length / Math.max(1, runs.length)),
    averagePlayerRemainingHpOnWin: round(average(defenderWinRuns.map((run) => run.winnerHealthRemainingPercent * 100))),
    averageAttackerRemainingHpOnWin: round(average(attackerWinRuns.map((run) => run.winnerHealthRemainingPercent * 100))),
    highestSingleHitNetDamageAgainstPlayer: highestHit,
    majorInjuryEvents: suite.majorInjuryDiagnostics.majorInjuryEvents,
    normalMonsterDefeats: suite.majorInjuryDiagnostics.normalMonsterDefeats,
    keyEnemyActionUsage,
    keyPlayerDefensiveUsage,
    hydrationWarnings: [...attacker.warnings, ...defender.warnings],
    unsupportedPowerNames: [
      ...attacker.actor.unsupportedPowers.map((power) => `${attacker.name}: ${power.powerName}: ${power.reason}`),
      ...defender.actor.unsupportedPowers.map((power) => `${defender.name}: ${power.powerName}: ${power.reason}`),
    ],
  };
}

function printAssets(label: string, assets: AssetSummary[]) {
  console.log(label);
  for (const asset of assets) {
    console.log(`- ${asset.name}: id ${asset.id}, ${asset.tier ?? asset.roleGroup} L${asset.level}, HP ${asset.physicalHp}/${asset.mentalHp}, P/M prot ${asset.physicalProtection}/${asset.mentalProtection}, defence P ${asset.physicalDefence}, M ${asset.mentalDefence}, offence ${asset.meaningfulOffence ? "meaningful" : asset.placeholderOnly ? "placeholder-only" : "none"}`);
    for (const action of asset.offensiveActions) {
      console.log(`  - ${action.name}: ${action.sourceType}, ${action.diceCount}x${action.die} ${action.accuracyAttribute}, W/S ${action.potency}, ${action.pool ?? "n/a"}, cooldown ${action.cooldownRounds}${action.placeholder ? " [placeholder]" : ""}`);
    }
    for (const warning of asset.warnings) console.log(`  warning: ${warning}`);
    for (const unsupported of asset.unsupported) console.log(`  unsupported: ${unsupported}`);
  }
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
  printAssets("Player defenders:", payload.assets.playerDefenders);
  console.log("");
  printAssets("Soldier attackers:", payload.assets.soldierAttackers);
  console.log("");
  printAssets("Elite attackers:", payload.assets.eliteAttackers);
  console.log("");
  printAssets("Boss attackers:", payload.assets.bossAttackers);
  console.log("");
  printAssets("Minion attackers:", payload.assets.minionAttackers);
  if (payload.assets.missingCharacters.length > 0) console.log(`Missing characters: ${payload.assets.missingCharacters.join(", ")}`);
  if (payload.assets.missingMonsters.length > 0) console.log(`Missing monsters: ${payload.assets.missingMonsters.join(", ")}`);
  if (payload.skippedPlaceholderScenarios.length > 0) {
    console.log("");
    console.log("Skipped placeholder-only scenarios:");
    for (const skipped of payload.skippedPlaceholderScenarios) {
      console.log(`- ${skipped.attacker} vs ${skipped.defender}: ${skipped.reason}`);
    }
  }
  console.log("");
  console.log("Scenario | A Win | D Win | Draw | Avg R | Med R | Player dead R1 | Player dead R2 | Player HP win | Attacker HP win | High hit");
  console.log("--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:");
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
      row.averagePlayerRemainingHpOnWin ?? "n/a",
      row.averageAttackerRemainingHpOnWin ?? "n/a",
      row.highestSingleHitNetDamageAgainstPlayer,
    ].join(" | "));
    for (const usage of row.keyEnemyActionUsage.filter((entry) => entry.usesPerRun > 0 || entry.damagePerRun > 0)) {
      console.log(`  enemy ${usage.actionName}: uses/run ${usage.usesPerRun}, damage/run ${usage.damagePerRun}, cooldown ${usage.cooldownRounds}, cooldown blocks/run ${usage.preventedByCooldownPerRun}`);
    }
    for (const usage of row.keyPlayerDefensiveUsage) {
      console.log(`  player defence ${usage.actionName}: uses/run ${usage.usesPerRun}, cooldown ${usage.cooldownRounds}, cooldown blocks/run ${usage.preventedByCooldownPerRun}`);
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
    const playersByName = new Map(assets.players.map((actor) => [actor.name, actor]));
    const monstersByName = new Map(assets.monsters.map((actor) => [actor.name, actor]));
    const allPairs = [...MINIMUM_SCENARIOS, ...OPTIONAL_SCENARIOS];
    const skippedPlaceholderScenarios: Payload["skippedPlaceholderScenarios"] = [];
    const scenarios = allPairs.flatMap(([attackerName, defenderName], index) => {
      const attacker = monstersByName.get(attackerName);
      const defender = playersByName.get(defenderName);
      if (!attacker || !defender) return [];
      const summary = summarizeAsset(attacker);
      if (summary.placeholderOnly && !options.includePlaceholder) {
        skippedPlaceholderScenarios.push({
          attacker: attacker.name,
          defender: defender.name,
          reason: "attacker has only placeholder compatibility attacks; not used for official incoming-pressure evidence",
        });
        return [];
      }
      const scenario = buildScenario(attacker, defender, options, options.seed + index * 101);
      return [summarizeScenario(scenario, attacker, defender)];
    });
    const assetSummaries = assets.monsters.map(summarizeAsset);
    const gitStatus = runGit(["status", "--short", "--untracked-files=all"]);
    const unsupportedOrIgnoredMechanics = Array.from(new Set([
      ...assets.players.flatMap((actor) => actor.warnings),
      ...assets.monsters.flatMap((actor) => actor.warnings),
      ...assets.players.flatMap((actor) => actor.actor.unsupportedPowers.map((power) => `${actor.name}: ${power.powerName}: ${power.reason}`)),
      ...assets.monsters.flatMap((actor) => actor.actor.unsupportedPowers.map((power) => `${actor.name}: ${power.powerName}: ${power.reason}`)),
    ]));
    const payload: Payload = {
      title: "Balance Environment Incoming Pressure Baseline",
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
        unsupportedOrIgnoredMechanics,
      },
      assets: {
        playerDefenders: assets.players.map(summarizeAsset),
        soldierAttackers: assetSummaries.filter((asset) => asset.roleGroup === "soldier"),
        eliteAttackers: assetSummaries.filter((asset) => asset.roleGroup === "elite"),
        bossAttackers: assetSummaries.filter((asset) => asset.roleGroup === "boss"),
        minionAttackers: assetSummaries.filter((asset) => asset.roleGroup === "minion"),
        missingCharacters: assets.missingCharacters,
        missingMonsters: assets.missingMonsters,
      },
      skippedPlaceholderScenarios,
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
