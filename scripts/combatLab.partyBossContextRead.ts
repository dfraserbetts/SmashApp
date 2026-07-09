import { spawnSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";

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
  assetType: "character" | "monster";
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
  category: "normal-boss" | "legendary-boss" | "supported-legendary-elite";
  partyNames: string[];
  enemyNames: string[];
  notes: string[];
};

type ContributionSummary = {
  actorName: string;
  side: CombatSide;
  actionsPerRun: number;
  damagePerRun: number;
  healingPerRun: number;
  mitigationPerRun: number;
  controlTurnsPerRun: number;
  actionsDeniedPerRun: number;
  topActionName: string | null;
};

type ScenarioSummary = {
  scenarioName: string;
  category: ScenarioSpec["category"];
  party: string[];
  enemies: string[];
  notes: string[];
  playerWinRate: number;
  monsterWinRate: number;
  stalemateRate: number;
  averageRounds: number;
  medianRounds: number;
  stoppedBy: Record<CombatRunResult["stoppedBy"], number>;
  averageDamagePerRound: Record<CombatSide, number>;
  averageMainActionsUsed: Record<CombatSide, number>;
  averagePowerActionsUsed: Record<CombatSide, number>;
  averageActionsDenied: Record<CombatSide, number>;
  c14DiagnosticsPerRun: {
    majorInjuryEvents: number;
    minorInjuryEvents: number;
    noInjuryEvents: number;
    playerCharacterInjuryFlowCount: number;
    legendaryMonsterInjuryFlowCount: number;
    noAutoBlazeEvents: number;
    injuryDefeats: number;
  };
  survivorRates: Record<string, number>;
  topPlayerDamage: ContributionSummary[];
  topEnemyDamage: ContributionSummary[];
  topPlayerTargets: Array<{ targetName: string; events: number; share: number }>;
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
  supportFindings: string[];
  knownLimitations: string[];
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

const MINDWARD_PARTY = [
  "BALANCE_Hawkshot Archer",
  "BALANCE_Ranger Commander",
  "BALANCE_Stoneguard",
  "BALANCE_Mindward Duelist",
] as const;

const ENEMY_NAMES = [
  "BALANCE_Boss Warlord",
  "BALANCE_Boss Hexlord",
  "BALANCE_Boss Behemoth",
  "BALANCE_Legendary Dragon",
  "BALANCE_Legendary Lich",
  "BALANCE_Legendary Elite Duelist",
  "BALANCE_Legendary Elite Hexer",
  "BALANCE_Legendary Elite Breaker Controller Rotation",
  "BALANCE_Support Candidate Pressure Striker",
  "BALANCE_Support Candidate Guard Anchor",
  "BALANCE_Support Candidate Suppression Hexer",
] as const;

const SCENARIO_SPECS: ScenarioSpec[] = [
  {
    name: "Standard Party vs Boss Warlord",
    category: "normal-boss",
    partyNames: [...STANDARD_PARTY],
    enemyNames: ["BALANCE_Boss Warlord"],
    notes: ["Supported/lower-bound Boss candidate; no minions in this read."],
  },
  {
    name: "Standard Party vs Boss Hexlord",
    category: "normal-boss",
    partyNames: [...STANDARD_PARTY],
    enemyNames: ["BALANCE_Boss Hexlord"],
    notes: ["Supported/lower-bound mental Boss candidate; no minions in this read."],
  },
  {
    name: "Mindward Party vs Boss Hexlord",
    category: "normal-boss",
    partyNames: [...MINDWARD_PARTY],
    enemyNames: ["BALANCE_Boss Hexlord"],
    notes: ["Mental-resistant party comparator swaps Arcane Sage for Mindward Duelist."],
  },
  {
    name: "Standard Party vs Boss Behemoth",
    category: "normal-boss",
    partyNames: [...STANDARD_PARTY],
    enemyNames: ["BALANCE_Boss Behemoth"],
    notes: ["Supported/lower-bound heavy physical Boss candidate; no minions in this read."],
  },
  {
    name: "Standard Party vs Legendary Dragon",
    category: "legendary-boss",
    partyNames: [...STANDARD_PARTY],
    enemyNames: ["BALANCE_Legendary Dragon"],
    notes: ["Legendary/solo-capable Boss candidate; current authored offence may still be placeholder-like."],
  },
  {
    name: "Standard Party vs Legendary Lich",
    category: "legendary-boss",
    partyNames: [...STANDARD_PARTY],
    enemyNames: ["BALANCE_Legendary Lich"],
    notes: ["Legendary/solo-capable mental Boss candidate; current authored offence may still be placeholder-like."],
  },
  {
    name: "Standard Party vs Duelist with Candidate Support",
    category: "supported-legendary-elite",
    partyNames: [...STANDARD_PARTY],
    enemyNames: [
      "BALANCE_Legendary Elite Duelist",
      "BALANCE_Support Candidate Pressure Striker",
      "BALANCE_Support Candidate Guard Anchor",
      "BALANCE_Support Candidate Suppression Hexer",
    ],
    notes: ["Full mixed support-candidate package benchmark, not a Boss asset."],
  },
  {
    name: "Standard Party vs Hexer with Candidate Support",
    category: "supported-legendary-elite",
    partyNames: [...STANDARD_PARTY],
    enemyNames: [
      "BALANCE_Legendary Elite Hexer",
      "BALANCE_Support Candidate Pressure Striker",
      "BALANCE_Support Candidate Guard Anchor",
      "BALANCE_Support Candidate Suppression Hexer",
    ],
    notes: ["Full mixed support-candidate package benchmark, not a Boss asset."],
  },
  {
    name: "Standard Party vs Rotation with Candidate Support",
    category: "supported-legendary-elite",
    partyNames: [...STANDARD_PARTY],
    enemyNames: [
      "BALANCE_Legendary Elite Breaker Controller Rotation",
      "BALANCE_Support Candidate Pressure Striker",
      "BALANCE_Support Candidate Guard Anchor",
      "BALANCE_Support Candidate Suppression Hexer",
    ],
    notes: ["Existing-mechanics anti-tank suite with full mixed support-candidate package, not a Boss asset."],
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
      console.log("Usage: npx --yes tsx scripts/combatLab.partyBossContextRead.ts [--runs 100] [--seed 4242] [--json]");
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
  return ["npx", "--yes", "tsx", "scripts/combatLab.partyBossContextRead.ts", ...process.argv.slice(2)].join(" ");
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
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

  const partyNames = Array.from(new Set([...STANDARD_PARTY, ...MINDWARD_PARTY]));
  const [characters, monsters] = await Promise.all([
    prisma.campaignCharacter.findMany({
      where: { campaignId: campaign.id, archivedAt: null, name: { in: partyNames } },
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

  const missingCharacters = partyNames.filter((name) => !characters.some((row) => row.name === name));
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
      assetType: "character",
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
      assetType: "monster",
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
    assetType: asset.assetType,
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
  };
}

function buildScenario(spec: ScenarioSpec, assets: Awaited<ReturnType<typeof loadAssets>>, options: CliOptions): CombatScenario {
  const players = spec.partyNames.map((name) => {
    const asset = assets.partyByName.get(name);
    if (!asset) throw new Error(`Missing party actor ${name}`);
    return { ...asset.actor, side: "players" as const };
  });
  const monsters = spec.enemyNames.map((name) => {
    const asset = assets.enemyByName.get(name);
    if (!asset) throw new Error(`Missing enemy actor ${name}`);
    return { ...asset.actor, side: "monsters" as const };
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

function contributionSummaries(runs: CombatRunResult[], side: CombatSide): ContributionSummary[] {
  const byActor = new Map<string, CombatActorContribution & { samples: number }>();
  for (const run of runs) {
    for (const contribution of Object.values(run.metrics.actorContributions)) {
      if (contribution.side !== side) continue;
      const key = contribution.actorName;
      const existing = byActor.get(key);
      if (!existing) {
        byActor.set(key, { ...contribution, samples: 1 });
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
      side: entry.side,
      actionsPerRun: round(entry.actionsUsed / runCount),
      damagePerRun: round(entry.damage / runCount),
      healingPerRun: round(entry.healing / runCount),
      mitigationPerRun: round(entry.mitigation / runCount),
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
    byTarget.set(event.targetName ?? "UNKNOWN", (byTarget.get(event.targetName ?? "UNKNOWN") ?? 0) + 1);
  }
  return [...byTarget.entries()]
    .map(([targetName, count]) => ({ targetName, events: count, share: pct(count / Math.max(1, events.length)) }))
    .sort((a, b) => b.events - a.events)
    .slice(0, 5);
}

function fallbackActionCount(scenario: CombatScenario): number {
  return [...scenario.players, ...scenario.monsters].reduce(
    (count, actor) => count + actor.actions.filter((action) => action.sourceType === "fallback").length,
    0,
  );
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
  const actors = [...scenario.players, ...scenario.monsters];
  const survivorRates = Object.fromEntries(actors.map((actor) => [
    actor.name,
    pct(runs.filter((run) => run.survivorActorIds[actor.side].includes(actor.id)).length / runCount),
  ]));

  const unsupportedNames = Array.from(new Set(runs.flatMap((run) => run.unsupported.unsupportedPowerNames))).sort();
  const totalUnsupportedEffects = sum(runs.map((run) => run.unsupported.unsupportedEffectCount));
  return {
    scenarioName: scenario.name,
    category: spec.category,
    party: spec.partyNames,
    enemies: spec.enemyNames,
    notes: spec.notes,
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
    averageActionsDenied: {
      players: round(sum(runs.map((run) => run.metrics.actionsDenied.players)) / runCount),
      monsters: round(sum(runs.map((run) => run.metrics.actionsDenied.monsters)) / runCount),
    },
    c14DiagnosticsPerRun: {
      majorInjuryEvents: round(sum(runs.map((run) => run.metrics.majorInjuryDiagnostics.majorInjuryEvents)) / runCount),
      minorInjuryEvents: round(sum(runs.map((run) => run.metrics.majorInjuryDiagnostics.minorInjuryEvents)) / runCount),
      noInjuryEvents: round(sum(runs.map((run) => run.metrics.majorInjuryDiagnostics.noInjuryEvents)) / runCount),
      playerCharacterInjuryFlowCount: round(sum(runs.map((run) => run.metrics.majorInjuryDiagnostics.playerCharacterInjuryFlowCount)) / runCount),
      legendaryMonsterInjuryFlowCount: round(sum(runs.map((run) => run.metrics.majorInjuryDiagnostics.legendaryMonsterInjuryFlowCount)) / runCount),
      noAutoBlazeEvents: round(sum(runs.map((run) => run.metrics.majorInjuryDiagnostics.noAutoBlazeEvents)) / runCount),
      injuryDefeats: round(sum(runs.map((run) => run.metrics.majorInjuryDiagnostics.injuryDefeats)) / runCount),
    },
    survivorRates,
    topPlayerDamage: contributionSummaries(runs, "players").slice(0, 4),
    topEnemyDamage: contributionSummaries(runs, "monsters").slice(0, 5),
    topPlayerTargets: topPlayerTargets(runs),
    hydrationWarnings: hydration.actors.flatMap((actor) => actor.warnings.map((warning) => `${actor.name}: ${warning}`)),
    unsupportedPowerNames: unsupportedNames,
    unsupportedEffectCount: totalUnsupportedEffects,
    fallbackActions: fallbackActionCount(scenario),
  };
}

function buildPayload(options: CliOptions, assets: Awaited<ReturnType<typeof loadAssets>>): Payload {
  const repoHead = runGit(["rev-parse", "HEAD"]);
  const gitStatus = runGit(["status", "--short"]);
  const scenarios = SCENARIO_SPECS.map((spec) => summarizeScenario(spec, buildScenario(spec, assets, options)));
  return {
    title: "Balance Environment party/Boss context read",
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
    supportFindings: [
      "CombatScenario supports multiple player and monster actors in one fight.",
      "Combat state clones multi-actor rosters and tracks living actors per side.",
      "Boss tier hydrates with actionsPerTurn = 2 through liveAdapters.",
      "Legendary defeat model is controlled by the explicit legendary flag, not inferred from tier alone.",
      "Round-end defence degradation reset is handled by autoSimulator after each round.",
    ],
    knownLimitations: [
      "Campaign character roles currently hydrate as Campaign Character, so player-side targeting falls through to a simple candidate order instead of tactical human focus-fire.",
      "Positioning and AoE target availability remain abstracted by Combat Lab policy rather than map-real encounter geometry.",
      "These scenarios are party/Boss context reads, not encounter design verdicts; normal Boss entries are tested without the backup they are expected to have in real encounters.",
      "Legendary Dragon and Legendary Lich are included as current authored assets; inspect action inventory before treating their offence as finalized.",
    ],
    assets: {
      party: assets.party.map(actorInventoryEntry).sort((a, b) => a.name.localeCompare(b.name)),
      enemies: assets.enemies.map(actorInventoryEntry).sort((a, b) => a.name.localeCompare(b.name)),
    },
    scenarios,
  };
}

function printHuman(payload: Payload): void {
  const { provenance } = payload;
  console.log(payload.title);
  console.log(`campaignId=${provenance.campaignId}`);
  console.log(`campaignName=${provenance.campaignName}`);
  console.log(`repoHead=${provenance.repoHead}`);
  console.log(`worktree=${provenance.cleanWorktree ? "clean" : "dirty"}`);
  console.log(`assetSource=${provenance.assetSource}`);
  console.log(`runs=${provenance.runs} seed=${provenance.seed}`);
  console.log(`exactCommand=${provenance.exactCommand}`);
  console.log("");
  console.log("Support findings:");
  for (const finding of payload.supportFindings) console.log(`- ${finding}`);
  console.log("");
  console.log("Known limitations:");
  for (const limitation of payload.knownLimitations) console.log(`- ${limitation}`);
  console.log("");
  console.log("Enemy inventory:");
  for (const enemy of payload.assets.enemies) {
    console.log(
      `- ${enemy.name}: tier=${enemy.tier} legendary=${enemy.legendary} defeatModel=${enemy.defeatModel} actionsPerTurn=${enemy.actionsPerTurn} HP=${enemy.physicalHp}/${enemy.mentalHp} actions=${enemy.supportedActionCount}/${enemy.actionCount} fallback=${enemy.fallbackActions.length}`,
    );
  }
  console.log("");
  console.log("Scenario results:");
  for (const row of payload.scenarios) {
    console.log(
      `- ${row.scenarioName}: players ${row.playerWinRate}% / monsters ${row.monsterWinRate}% / stalemate ${row.stalemateRate}%, avgRounds ${row.averageRounds}, medRounds ${row.medianRounds}`,
    );
    console.log(
      `  DPR players ${row.averageDamagePerRound.players}, monsters ${row.averageDamagePerRound.monsters}; mainActions/run players ${row.averageMainActionsUsed.players}, monsters ${row.averageMainActionsUsed.monsters}; powerActions/run players ${row.averagePowerActionsUsed.players}, monsters ${row.averagePowerActionsUsed.monsters}`,
    );
    const topPlayers = row.topPlayerDamage.map((entry) => `${entry.actorName} ${entry.damagePerRun}`).join("; ") || "none";
    const topEnemies = row.topEnemyDamage.map((entry) => `${entry.actorName} ${entry.damagePerRun}`).join("; ") || "none";
    const targets = row.topPlayerTargets.map((entry) => `${entry.targetName} ${entry.share}%`).join("; ") || "none";
    console.log(`  top player damage/run: ${topPlayers}`);
    console.log(`  top enemy damage/run: ${topEnemies}`);
    console.log(`  player target share: ${targets}`);
    console.log(
      `  C14/run: major ${row.c14DiagnosticsPerRun.majorInjuryEvents}, minor ${row.c14DiagnosticsPerRun.minorInjuryEvents}, no-auto-Blaze ${row.c14DiagnosticsPerRun.noAutoBlazeEvents}, injuryDefeats ${row.c14DiagnosticsPerRun.injuryDefeats}`,
    );
    console.log(`  unsupportedEffects=${row.unsupportedEffectCount}; fallbackActions=${row.fallbackActions}; hydrationWarnings=${row.hydrationWarnings.length}`);
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
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
