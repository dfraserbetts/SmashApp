import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { expectedSuccesses } from "../lib/combat-lab/dice";
import {
  adaptCampaignCharacterToCombatActor,
  adaptMonsterToCombatLabActor,
  itemTemplateToSummoningEquipmentItem,
} from "../lib/combat-lab/liveAdapters";
import { createFixtureActor } from "../lib/combat-lab/powerAdapter";
import { runScenarioSuite } from "../lib/combat-lab/reporting";
import type { CombatAction, CombatActor, CombatDieSize, CombatScenario, CombatSuiteReport } from "../lib/combat-lab/types";
import { normalizeCombatTuning, normalizeCombatTuningFlatValues } from "../lib/config/combatTuningShared";
import { normalizePowerTuningValues, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];

type TierName = "MINION" | "SOLDIER" | "ELITE" | "BOSS";
type Verdict = "PASS" | "LOW" | "HIGH" | "HIGH/CENSORED" | "UNCLEAR";
type AssetSource = "balance-campaign-authored" | "synthetic-in-memory";

type TierBand = {
  tier: TierName;
  label: string;
  min: number;
  max: number | null;
  source: string;
};

type ProbeProfile = {
  id: "low" | "medium" | "high";
  name: string;
  scope: "official" | "diagnostic";
  description: string;
  diceCount: number;
  die: CombatDieSize;
  potency: number;
};

type CliOptions = {
  runs: number;
  seed: number;
  json: boolean;
  balanceEnvironment: boolean;
  compareRoleAssets: boolean;
  includeSyntheticDiagnostics: boolean;
};

type ReportRow = {
  tier: TierName;
  band: string;
  attackChannel: "physical" | "mental";
  attackerProfile: string;
  profileScope: ProbeProfile["scope"];
  probeDefinition: string;
  assetSource: AssetSource;
  campaignId: string | null;
  campaignName: string | null;
  attackerAssetId: string | null;
  attackerAssetName: string | null;
  attackerActionId: string | null;
  attackerActionName: string | null;
  targetAssetId: string | null;
  targetAssetName: string | null;
  targetOffenseDisabled: boolean;
  targetTierSource: string;
  adapterRuntimeWarnings: string[];
  verdict: Verdict;
  defeatedSampleCount: number;
  censoredSampleCount: number;
  simpleExpectedAttacksToRelevantHp: number | null;
  expectedVsObservedDifference: number | null;
  likelyExplanation: string;
  avgMeaningfulAttacksToDefeat: number | null;
  medianMeaningfulAttacksToDefeat: number | null;
  avgSuccessfulHitsToDefeat: number | null;
  medianSuccessfulHitsToDefeat: number | null;
  avgOverkill: number | null;
  medianTurnsToDefeat: number | null;
  playerWinRate: number;
  stalemateRate: number;
  sourceDamageShare: CombatSuiteReport["defeatMetrics"]["monsterDefeated"]["sourceDamageShare"];
};

type DualChannelSummary = {
  targetAssetName: string;
  tier: TierName;
  band: string;
  physicalAvg: number | null;
  physicalMedian: number | null;
  physicalVerdict: Verdict | null;
  physicalCensored: number | null;
  mentalAvg: number | null;
  mentalMedian: number | null;
  mentalVerdict: Verdict | null;
  mentalCensored: number | null;
  betterChannel: "physical" | "mental" | null;
  betterAvg: number | null;
  worseChannel: "physical" | "mental" | null;
  worseAvg: number | null;
  summaryClassification: "PASS" | "HIGH_BOTH" | "LOW_BOTH" | "SPLIT_PROFILE" | "UNCLEAR";
};

type ProfileMath = {
  profile: string;
  scope: ProbeProfile["scope"];
  diceCount: number;
  die: CombatDieSize;
  woundsPerSuccess: number;
  expectedSuccessesPerAttack: number;
  expectedWoundsPerAttack: number;
};

type TargetAnatomy = {
  tier: TierName;
  name: string;
  level: number;
  physicalHp: number;
  mentalHp: number;
  physicalProtection: number;
  mentalProtection: number;
  dodgeValue: number;
  dodgeDice: number | null;
  physicalDefenceDice: number | null;
  physicalBlockPerSuccess: number | null;
  mentalDefenceDice: number | null;
  mentalBlockPerSuccess: number | null;
  defeatModel: string;
  likelyDefeatCondition: string;
};

type RealAssetProfile = {
  id: string;
  assetType: "character" | "monster";
  name: string;
  level: number;
  roleOrTier: string | null;
  scope: ProbeProfile["scope"];
  classification: "low" | "medium" | "high" | "candidate";
  actor: CombatActor;
  selectedAction: CombatAction;
  expectedWoundsPerAttack: number;
  expectedSuccessesPerAttack: number;
  warnings: string[];
  calibrationAsset: boolean;
};

type RealTargetAsset = {
  id: string;
  assetType: "monster";
  name: string;
  tier: TierName;
  level: number;
  actor: CombatActor;
  warnings: string[];
  calibrationAsset: boolean;
};

type RealAssetDiscovery = {
  campaignId: string;
  campaignName: string;
  attackers: RealAssetProfile[];
  selectedAttackers: {
    low: RealAssetProfile | null;
    medium: RealAssetProfile | null;
    high: RealAssetProfile | null;
  };
  targets: RealTargetAsset[];
  calibrationTargets: RealTargetAsset[];
  roleTargets: RealTargetAsset[];
  missingTargetTiers: TierName[];
  warnings: string[];
  activeTuning: {
    power: { setId: string; name: string; slug: string };
    combat: { setId: string; name: string; slug: string };
  };
};

type AtkPayload = {
  report: string;
  mode: "balance-environment" | "role-asset-comparison" | "synthetic-diagnostics";
  campaignId: string | null;
  campaignName: string | null;
  assetSource: AssetSource;
  mutation: "none";
  databaseAccess: "read-only" | "none";
  seeders: "none";
  runsPerScenario: number;
  seed: number;
  repoHead: string;
  gitStatus: string;
  exactCommand: string;
  bandSources: string[];
  actionDefinitionSources: string[];
  officialVerdictUses: string;
  dualChannelSummaries?: DualChannelSummary[];
  discovery?: RealAssetDiscovery;
  probeProfiles?: ProbeProfile[];
  probeProfileMath?: ProfileMath[];
  targetFixtureAnatomy?: TargetAnatomy[];
  rows: ReportRow[];
};

const BAND_SOURCE_REFS = [
  "docs/02_Power_System_And_Costing.txt:43-58",
  "docs/07_Incarnate_Balance_Tuning_Bible.txt:135-153",
  "docs/04_Combat_Lab_Balance_And_Validation.txt:142-164",
];

const ACTION_DEFINITION_REFS = [
  "docs/02_Power_System_And_Costing.txt:21-41",
  "docs/07_Incarnate_Balance_Tuning_Bible.txt:161-180",
];

const BALANCE_ENVIRONMENT_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_ENVIRONMENT_CAMPAIGN_NAME = "Balance Environment";
const ATK_MEDIUM_ATTACKER_NAME = "BALANCE_ATK_Medium_Attacker";
const ATK_TARGET_NAMES: Record<TierName, string> = {
  MINION: "BALANCE_ATK_Minion_Target",
  SOLDIER: "BALANCE_ATK_Soldier_Target",
  ELITE: "BALANCE_ATK_Elite_Target",
  BOSS: "BALANCE_ATK_Boss_Target",
};
const ATK_TARGET_NAME_SET = new Set(Object.values(ATK_TARGET_NAMES));

let prisma!: PrismaClientInstance;
let prismaLoaded = false;

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

const TIER_BANDS: TierBand[] = [
  { tier: "MINION", label: "1-2 Medium Strength Attacks", min: 1, max: 2, source: "docs/02_Power_System_And_Costing.txt:46" },
  { tier: "SOLDIER", label: "2-3 Medium Strength Attacks", min: 2, max: 3, source: "docs/02_Power_System_And_Costing.txt:47" },
  { tier: "ELITE", label: "4-6 Medium Strength Attacks", min: 4, max: 6, source: "docs/02_Power_System_And_Costing.txt:48" },
  { tier: "BOSS", label: "16+ Medium Strength Attacks", min: 16, max: null, source: "docs/02_Power_System_And_Costing.txt:49" },
];

const PROBE_PROFILES: ProbeProfile[] = [
  {
    id: "low",
    name: "Low Attack Probe",
    scope: "diagnostic",
    description: "Provisional low attack profile: 2 dice on D6, 1 wound per success.",
    diceCount: 2,
    die: "D6",
    potency: 1,
  },
  {
    id: "medium",
    name: "Medium Attack Probe",
    scope: "official",
    description: "Provisional Medium Strength Attack profile: 3 dice on D8, 2 wounds per success.",
    diceCount: 3,
    die: "D8",
    potency: 2,
  },
  {
    id: "high",
    name: "High Attack Probe",
    scope: "diagnostic",
    description: "Provisional high attack profile: 5 dice on D12, 3 wounds per success.",
    diceCount: 5,
    die: "D12",
    potency: 3,
  },
];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    runs: 25,
    seed: 4242,
    json: false,
    balanceEnvironment: true,
    compareRoleAssets: false,
    includeSyntheticDiagnostics: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--balance-environment") {
      options.balanceEnvironment = true;
      continue;
    }
    if (arg === "--compare-role-assets") {
      options.compareRoleAssets = true;
      options.balanceEnvironment = true;
      continue;
    }
    if (arg === "--include-synthetic-diagnostics") {
      options.includeSyntheticDiagnostics = true;
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

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) return "UNKNOWN";
  return result.stdout.trim();
}

function loadEnvFile(relativePath: string) {
  const filePath = path.join(process.cwd(), relativePath);
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

async function getPrisma(): Promise<PrismaClientInstance> {
  if (!prismaLoaded) {
    loadEnvFile(".env");
    loadEnvFile(".env.local");
    prisma = (await import("../prisma/client")).prisma;
    prismaLoaded = true;
  }
  return prisma;
}

function exactCommand(): string {
  return ["npx", "--yes", "tsx", "scripts/combatLab.attacksToKill.ts", ...process.argv.slice(2)].join(" ");
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function profileMath(profile: ProbeProfile): ProfileMath {
  const expectedSuccessesPerAttack = expectedSuccesses(profile.diceCount, profile.die);
  return {
    profile: profile.name,
    scope: profile.scope,
    diceCount: profile.diceCount,
    die: profile.die,
    woundsPerSuccess: profile.potency,
    expectedSuccessesPerAttack: roundNumber(expectedSuccessesPerAttack),
    expectedWoundsPerAttack: roundNumber(expectedSuccessesPerAttack * profile.potency),
  };
}

function actionExpectedMath(actor: CombatActor, action: CombatAction): { successes: number; wounds: number } {
  const die = actor.attributeDice[action.accuracyAttribute] ?? "D8";
  const successes = expectedSuccesses(Math.max(1, action.diceCount), die);
  return {
    successes: roundNumber(successes),
    wounds: roundNumber(successes * Math.max(0, action.potency)),
  };
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

function formatNullable(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function tierBand(tier: TierName): TierBand {
  const band = TIER_BANDS.find((entry) => entry.tier === tier);
  if (!band) throw new Error(`No ATK band for tier ${tier}.`);
  return band;
}

function isTierName(value: unknown): value is TierName {
  return value === "MINION" || value === "SOLDIER" || value === "ELITE" || value === "BOSS";
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

function targetAnatomyFromActor(target: CombatActor): TargetAnatomy {
  return {
    tier: isTierName(target.tier) ? target.tier : "SOLDIER",
    name: target.displayGroupName ?? target.name,
    level: target.level,
    physicalHp: target.physicalHpMax,
    mentalHp: target.mentalHpMax,
    physicalProtection: target.physicalProtection,
    mentalProtection: target.mentalProtection,
    dodgeValue: target.dodgeValue ?? 0,
    dodgeDice: target.dodgeDice ?? null,
    physicalDefenceDice: target.physicalDefenceDice ?? null,
    physicalBlockPerSuccess: target.physicalBlockPerSuccess ?? null,
    mentalDefenceDice: target.mentalDefenceDice ?? null,
    mentalBlockPerSuccess: target.mentalBlockPerSuccess ?? null,
    defeatModel: target.defeatModel,
    likelyDefeatCondition:
      target.defeatModel === "NORMAL_MONSTER"
        ? "normal monster binary defeat when physical or mental HP reaches 0"
        : "C14 injury flow; not expected for normal ATK target bands",
  };
}

function createProbeAttacker(profile: ProbeProfile): CombatActor {
  const actor = createFixtureActor({
    id: `atk-${profile.id}-probe-attacker`,
    side: "players",
    name: profile.name,
    role: "ATK Probe",
    level: 5,
    physicalHp: 999,
    mentalHp: 999,
    physicalProtection: 0,
    mentalProtection: 0,
    dodgeValue: 8,
    attack: 5,
    guard: 3,
    fortitude: 4,
    intellect: 2,
    synergy: 2,
    bravery: 3,
    actionsPerTurn: 1,
    powers: [],
  });
  return {
    ...actor,
    attributeDice: {
      ...actor.attributeDice,
      Attack: profile.die,
    },
    actions: [
      {
        id: `atk-${profile.id}-probe-strike`,
        name: `${profile.name} Strike`,
        sourceType: "equippedWeapon",
        kind: "attack",
        targetPolicy: "enemy",
        supported: true,
        unsupportedReasons: [],
        pool: "physical",
        rangeCategory: "MELEE",
        targetCount: 1,
        accuracyAttribute: "Attack",
        diceCount: profile.diceCount,
        potency: profile.potency,
        cooldownRounds: 0,
      },
    ],
  };
}

function createTierTarget(tier: TierName): CombatActor {
  const scale = tier === "BOSS" ? 4 : tier === "ELITE" ? 2.3 : tier === "SOLDIER" ? 1.35 : 0.75;
  return createFixtureActor({
    id: `atk-target-${tier.toLowerCase()}`,
    side: "monsters",
    name: `ATK ${tier} Target`,
    role: tier[0] + tier.slice(1).toLowerCase(),
    tier,
    level: 5,
    physicalHp: Math.round(18 * scale),
    mentalHp: Math.round(12 * scale),
    physicalProtection: tier === "BOSS" ? 4 : tier === "ELITE" ? 3 : tier === "SOLDIER" ? 2 : 1,
    mentalProtection: tier === "BOSS" ? 3 : tier === "ELITE" ? 2 : 1,
    dodgeValue: tier === "MINION" ? 9 : 8,
    attack: tier === "BOSS" ? 6 : tier === "ELITE" ? 5 : tier === "SOLDIER" ? 4 : 3,
    guard: tier === "BOSS" ? 5 : tier === "ELITE" ? 4 : 3,
    fortitude: tier === "BOSS" ? 5 : tier === "ELITE" ? 4 : 3,
    intellect: tier === "BOSS" ? 4 : 3,
    synergy: 2,
    bravery: tier === "BOSS" ? 5 : 3,
    actionsPerTurn: 0,
    powers: [],
  });
}

function targetAnatomy(tier: TierName): TargetAnatomy {
  return targetAnatomyFromActor(createTierTarget(tier));
}

function syntheticScenario(band: TierBand, profile: ProbeProfile, options: CliOptions): CombatScenario {
  return {
    name: `Synthetic ATK ${profile.name} vs ${band.tier}`,
    players: [createProbeAttacker(profile)],
    monsters: [createTierTarget(band.tier)],
    runs: options.runs,
    seed: options.seed,
    maxRounds: 240,
    turnOrder: "playersFirst",
  };
}

function officialScenario(attacker: RealAssetProfile, target: RealTargetAsset, options: CliOptions): CombatScenario {
  return {
    name: `BE ATK ${attacker.name} vs ${target.name}`,
    players: [
      {
        ...attacker.actor,
        actions: [attacker.selectedAction],
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

function simpleExpectedAttacksToRelevantHp(
  target: CombatActor,
  expectedWoundsPerAttack: number,
  pool: CombatAction["pool"],
): number | null {
  if (expectedWoundsPerAttack <= 0) return null;
  const hp = pool === "mental" ? target.mentalHpMax : target.physicalHpMax;
  return roundNumber(hp / expectedWoundsPerAttack);
}

function likelyExplanation(params: {
  rowAverage: number | null;
  simpleExpected: number | null;
  censoredSamples: number;
  target: TargetAnatomy;
  profileScope: ProbeProfile["scope"];
}): string {
  if (params.censoredSamples > 0 && params.rowAverage === null) {
    return "censored non-defeats; selected attack output appears too low after dodge/defence/protection";
  }
  if (params.censoredSamples > 0) {
    return "censored samples plus defence/protection likely raise observed ATK";
  }
  if (params.rowAverage !== null && params.simpleExpected !== null && params.rowAverage > params.simpleExpected * 1.75) {
    return "defence/dodge/protection materially raise observed ATK above simple HP-only estimate";
  }
  if (params.rowAverage !== null && params.simpleExpected !== null && params.rowAverage < params.simpleExpected * 0.75) {
    return "observed ATK is faster than simple HP-only estimate; high roll output or overkill likely dominates";
  }
  if (params.target.defeatModel !== "NORMAL_MONSTER") {
    return "defeat condition is not simple wound depletion";
  }
  if (params.profileScope === "diagnostic") {
    return "diagnostic profile is not an official band verdict";
  }
  return "simple HP-only estimate and observed ATK are directionally close; remaining gap is runtime defence variance";
}

function verdictFor(value: number | null, band: TierBand, defeatedSamples: number, censoredSamples: number): Verdict {
  if (defeatedSamples <= 0 || value === null) return "UNCLEAR";
  const heavyCensoring = censoredSamples > 0 && censoredSamples >= defeatedSamples;
  if (heavyCensoring) return "HIGH/CENSORED";
  if (value < band.min) return "LOW";
  if (band.max !== null && value > band.max) return censoredSamples > 0 ? "HIGH/CENSORED" : "HIGH";
  return "PASS";
}

function rowFor(params: {
  band: TierBand;
  report: CombatSuiteReport;
  assetSource: AssetSource;
  campaignId: string | null;
  campaignName: string | null;
  attackerProfile: string;
  profileScope: ProbeProfile["scope"];
  probeDefinition: string;
  expectedWoundsPerAttack: number;
  targetActor: CombatActor;
  damagePool: CombatAction["pool"];
  attackerAssetId?: string | null;
  attackerAssetName?: string | null;
  attackerActionId?: string | null;
  attackerActionName?: string | null;
  targetAssetId?: string | null;
  targetAssetName?: string | null;
  targetOffenseDisabled: boolean;
  attackChannel?: "physical" | "mental";
  targetTierSource?: string;
  adapterRuntimeWarnings?: string[];
}): ReportRow {
  const metrics = params.report.defeatMetrics.monsterDefeated;
  const avgMeaningful = metrics.avgMeaningfulActionsToDefeat;
  const censoredSampleCount = Math.max(0, params.report.runs - metrics.sampleCount);
  const simpleExpected = simpleExpectedAttacksToRelevantHp(
    params.targetActor,
    params.expectedWoundsPerAttack,
    params.damagePool,
  );
  const observed = round(avgMeaningful);
  return {
    tier: params.band.tier,
    band: params.band.label,
    attackChannel: params.attackChannel ?? (params.damagePool === "mental" ? "mental" : "physical"),
    attackerProfile: params.attackerProfile,
    profileScope: params.profileScope,
    probeDefinition: params.probeDefinition,
    assetSource: params.assetSource,
    campaignId: params.campaignId,
    campaignName: params.campaignName,
    attackerAssetId: params.attackerAssetId ?? null,
    attackerAssetName: params.attackerAssetName ?? null,
    attackerActionId: params.attackerActionId ?? null,
    attackerActionName: params.attackerActionName ?? null,
    targetAssetId: params.targetAssetId ?? null,
    targetAssetName: params.targetAssetName ?? null,
    targetOffenseDisabled: params.targetOffenseDisabled,
    targetTierSource: params.targetTierSource ?? "explicit runtime actor tier",
    adapterRuntimeWarnings: params.adapterRuntimeWarnings ?? [],
    verdict: verdictFor(avgMeaningful, params.band, metrics.sampleCount, censoredSampleCount),
    defeatedSampleCount: metrics.sampleCount,
    censoredSampleCount,
    simpleExpectedAttacksToRelevantHp: simpleExpected,
    expectedVsObservedDifference: observed !== null && simpleExpected !== null
      ? roundNumber(observed - simpleExpected)
      : null,
    likelyExplanation: likelyExplanation({
      rowAverage: observed,
      simpleExpected,
      censoredSamples: censoredSampleCount,
      target: targetAnatomyFromActor(params.targetActor),
      profileScope: params.profileScope,
    }),
    avgMeaningfulAttacksToDefeat: observed,
    medianMeaningfulAttacksToDefeat: round(metrics.medianMeaningfulActionsToDefeat),
    avgSuccessfulHitsToDefeat: round(metrics.avgSuccessfulHitsToDefeat),
    medianSuccessfulHitsToDefeat: round(metrics.medianSuccessfulHitsToDefeat),
    avgOverkill: round(metrics.avgOverkill),
    medianTurnsToDefeat: round(metrics.medianRoundsToDefeat),
    playerWinRate: round(params.report.playerWinRate, 4) ?? 0,
    stalemateRate: round(params.report.stalemateRate, 4) ?? 0,
    sourceDamageShare: metrics.sourceDamageShare,
  };
}

function rowForOfficialMedium(params: {
  discovery: RealAssetDiscovery;
  medium: RealAssetProfile;
  target: RealTargetAsset;
  options: CliOptions;
}): ReportRow {
  const band = tierBand(params.target.tier);
  const report = runScenarioSuite(officialScenario(params.medium, params.target, params.options));
  const channel = params.medium.selectedAction.pool === "mental" ? "mental" : "physical";
  return rowFor({
    band,
    report,
    assetSource: "balance-campaign-authored",
    campaignId: params.discovery.campaignId,
    campaignName: params.discovery.campaignName,
    attackerProfile: params.medium.name,
    profileScope: "official",
    probeDefinition: `Official ${channel} Medium ruler: ${params.medium.actor.name}, ${params.medium.selectedAction.sourceType}, ${params.medium.selectedAction.diceCount} dice, potency ${params.medium.selectedAction.potency}.`,
    expectedWoundsPerAttack: params.medium.expectedWoundsPerAttack,
    targetActor: params.target.actor,
    damagePool: params.medium.selectedAction.pool,
    attackerAssetId: params.medium.actor.id,
    attackerAssetName: params.medium.actor.name,
    attackerActionId: params.medium.selectedAction.id,
    attackerActionName: params.medium.selectedAction.name,
    targetAssetId: params.target.id,
    targetAssetName: params.target.name,
    targetOffenseDisabled: true,
    attackChannel: channel,
    targetTierSource: "explicit Summoning Circle monster tier field",
    adapterRuntimeWarnings: [...params.medium.warnings, ...params.target.warnings],
  });
}

function summaryClassification(physical: ReportRow | undefined, mental: ReportRow | undefined): DualChannelSummary["summaryClassification"] {
  if (!physical || !mental) return "UNCLEAR";
  if (physical.censoredSampleCount > 0 || mental.censoredSampleCount > 0) return "UNCLEAR";
  const values = [physical.avgMeaningfulAttacksToDefeat, mental.avgMeaningfulAttacksToDefeat];
  if (values.some((value) => value === null)) return "UNCLEAR";
  const band = tierBand(physical.tier);
  const numeric = values as [number, number];
  const inBand = numeric.some((value) => value >= band.min && (band.max === null || value <= band.max));
  if (inBand) return "PASS";
  const max = band.max;
  const bothHigh = max !== null && numeric.every((value) => value > max);
  if (bothHigh) return "HIGH_BOTH";
  if (numeric.every((value) => value < band.min)) return "LOW_BOTH";
  return "SPLIT_PROFILE";
}

function summarizeDualChannelRows(rows: ReportRow[]): DualChannelSummary[] {
  const byTarget = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const key = row.targetAssetId ?? row.targetAssetName ?? `${row.tier}:${row.band}`;
    byTarget.set(key, [...(byTarget.get(key) ?? []), row]);
  }
  return Array.from(byTarget.values()).map((targetRows) => {
    const physical = targetRows.find((row) => row.attackChannel === "physical");
    const mental = targetRows.find((row) => row.attackChannel === "mental");
    const comparable = [physical, mental].filter((row): row is ReportRow => row !== undefined && row.avgMeaningfulAttacksToDefeat !== null);
    const sorted = comparable.sort((left, right) =>
      (left.avgMeaningfulAttacksToDefeat ?? Number.POSITIVE_INFINITY) -
      (right.avgMeaningfulAttacksToDefeat ?? Number.POSITIVE_INFINITY),
    );
    const better = sorted[0];
    const worse = sorted[sorted.length - 1];
    const first = targetRows[0];
    return {
      targetAssetName: first?.targetAssetName ?? "unknown target",
      tier: first?.tier ?? "SOLDIER",
      band: first?.band ?? "unknown band",
      physicalAvg: physical?.avgMeaningfulAttacksToDefeat ?? null,
      physicalMedian: physical?.medianMeaningfulAttacksToDefeat ?? null,
      physicalVerdict: physical?.verdict ?? null,
      physicalCensored: physical?.censoredSampleCount ?? null,
      mentalAvg: mental?.avgMeaningfulAttacksToDefeat ?? null,
      mentalMedian: mental?.medianMeaningfulAttacksToDefeat ?? null,
      mentalVerdict: mental?.verdict ?? null,
      mentalCensored: mental?.censoredSampleCount ?? null,
      betterChannel: better?.attackChannel ?? null,
      betterAvg: better?.avgMeaningfulAttacksToDefeat ?? null,
      worseChannel: worse?.attackChannel ?? null,
      worseAvg: worse?.avgMeaningfulAttacksToDefeat ?? null,
      summaryClassification: summaryClassification(physical, mental),
    };
  });
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
    throw new Error("Missing ACTIVE Power or Combat tuning set. ATK runner is read-only and does not seed tuning.");
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

function collectAttackerProfiles(params: {
  actor: CombatActor;
  warnings: string[];
  assetType: "character" | "monster";
  calibrationAsset?: boolean;
  forceClassification?: RealAssetProfile["classification"];
  forceScope?: ProbeProfile["scope"];
}): RealAssetProfile[] {
  const actor = params.actor;
  return actor.actions
    .filter((action) =>
      action.kind === "attack" &&
      action.supported &&
      action.sourceType !== "fallback" &&
      action.targetPolicy === "enemy",
    )
    .map((action) => {
      const math = actionExpectedMath(actor, action);
      return {
        id: `${actor.id}:${action.id}`,
        assetType: params.assetType,
        name: `${actor.name} / ${action.name}`,
        level: actor.level,
        roleOrTier: actor.role,
        scope: params.forceScope ?? "diagnostic" as const,
        classification: params.forceClassification ?? "candidate" as const,
        actor,
        selectedAction: action,
        expectedWoundsPerAttack: math.wounds,
        expectedSuccessesPerAttack: math.successes,
        warnings: params.warnings,
        calibrationAsset: Boolean(params.calibrationAsset),
      };
    });
}

function officialMediumAttackers(discovery: RealAssetDiscovery): { physical: RealAssetProfile | null; mental: RealAssetProfile | null } {
  const candidates = discovery.attackers.filter(
    (attacker) => attacker.calibrationAsset && attacker.actor.name === ATK_MEDIUM_ATTACKER_NAME,
  );
  return {
    physical: candidates.find((attacker) => attacker.selectedAction.pool === "physical") ?? null,
    mental: candidates.find((attacker) => attacker.selectedAction.pool === "mental") ?? null,
  };
}

function markSelectedAttackers(attackers: RealAssetProfile[]): RealAssetDiscovery["selectedAttackers"] {
  if (attackers.length === 0) return { low: null, medium: null, high: null };
  const calibrationMedium = attackers.find((attacker) => attacker.calibrationAsset && attacker.classification === "medium");
  const mediumTarget = profileMath(PROBE_PROFILES.find((profile) => profile.id === "medium")!).expectedWoundsPerAttack;
  const low = attackers.reduce((best, candidate) =>
    candidate.expectedWoundsPerAttack < best.expectedWoundsPerAttack ? candidate : best,
  );
  const high = attackers.reduce((best, candidate) =>
    candidate.expectedWoundsPerAttack > best.expectedWoundsPerAttack ? candidate : best,
  );
  const medium = calibrationMedium ?? attackers.reduce((best, candidate) =>
    Math.abs(candidate.expectedWoundsPerAttack - mediumTarget) < Math.abs(best.expectedWoundsPerAttack - mediumTarget)
      ? candidate
      : best,
  );
  for (const attacker of attackers) {
    if (attacker.id === low.id) attacker.classification = "low";
    if (attacker.id === medium.id) {
      attacker.classification = "medium";
      attacker.scope = "official";
    }
    if (attacker.id === high.id) attacker.classification = "high";
  }
  return { low, medium, high };
}

async function discoverRealAssets(): Promise<RealAssetDiscovery> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: BALANCE_ENVIRONMENT_CAMPAIGN_ID },
    select: { id: true, name: true },
  });
  if (!campaign) {
    throw new Error(`Balance Environment campaign not found: ${BALANCE_ENVIRONMENT_CAMPAIGN_ID}`);
  }
  if (campaign.name !== BALANCE_ENVIRONMENT_CAMPAIGN_NAME) {
    throw new Error(`Campaign id ${campaign.id} is named "${campaign.name}", expected "${BALANCE_ENVIRONMENT_CAMPAIGN_NAME}".`);
  }

  const tuning = await loadActiveTuning();
  const [characters, monsters] = await Promise.all([
    prisma.campaignCharacter.findMany({
      where: { campaignId: campaign.id, archivedAt: null },
      orderBy: { name: "asc" },
      include: {
        backpackItems: {
          include: {
            partyInventoryItem: {
              include: {
                itemTemplate: {
                  include: ITEM_TEMPLATE_INCLUDE,
                },
              },
            },
          },
        },
      },
    }),
    prisma.monster.findMany({
      where: { campaignId: campaign.id, source: "CAMPAIGN", isReadOnly: false },
      orderBy: { name: "asc" },
      include: {
        naturalAttack: true,
        attacks: { orderBy: { sortOrder: "asc" } },
        traits: { orderBy: { sortOrder: "asc" }, include: { trait: { select: { name: true, effectText: true } } } },
        powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
      },
    }),
  ]);

  const monsterItemIds = Array.from(new Set(monsters.flatMap((monster) => [
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
  const itemRows = monsterItemIds.length > 0
    ? await prisma.itemTemplate.findMany({
        where: { campaignId: campaign.id, id: { in: monsterItemIds } },
        include: ITEM_TEMPLATE_INCLUDE,
      })
    : [];
  const monsterEquipmentById = new Map(itemRows.map((item) => [item.id, itemTemplateToSummoningEquipmentItem(item)]));

  const warnings: string[] = [];
  const characterAttackers = characters.flatMap((row) => {
    const adapted = adaptCampaignCharacterToCombatActor(
      row as Parameters<typeof adaptCampaignCharacterToCombatActor>[0],
      tuning.combatValues,
      tuning.powerSnapshot,
    );
    const actorWarnings = warningsToStrings(adapted.warnings);
    if (adapted.actor.hydration.fallbackActions.length > 0) {
      warnings.push(`${adapted.actor.name}: fallback actions present (${adapted.actor.hydration.fallbackActions.join(", ")}).`);
    }
    return collectAttackerProfiles({
      actor: adapted.actor,
      warnings: actorWarnings,
      assetType: "character",
      calibrationAsset: false,
    });
  });
  const adaptedMonsters = monsters.map((row) => {
    const adapted = adaptMonsterToCombatLabActor(
      row as Parameters<typeof adaptMonsterToCombatLabActor>[0],
      monsterEquipmentById,
      tuning.combatValues,
      tuning.powerSnapshot,
    );
    return { row, adapted, warnings: warningsToStrings(adapted.warnings) };
  });
  const calibrationMediumAttackers = adaptedMonsters
    .filter((entry) => entry.adapted.actor.name === ATK_MEDIUM_ATTACKER_NAME)
    .flatMap((entry) =>
      collectAttackerProfiles({
        actor: {
          ...entry.adapted.actor,
          side: "players",
          role: "ATK Calibration Probe",
          actionsPerTurn: 1,
        },
        warnings: entry.warnings,
        assetType: "monster",
        calibrationAsset: true,
        forceClassification: "medium",
        forceScope: "official",
      }),
    );
  const attackers = [...characterAttackers, ...calibrationMediumAttackers];
  const selectedAttackers = markSelectedAttackers(attackers);

  const allTargets = adaptedMonsters.flatMap((entry) => {
    const adapted = entry.adapted;
    if (!isTierName(adapted.actor.tier)) {
      warnings.push(`${adapted.actor.name}: unsupported or missing tier "${String(adapted.actor.tier)}".`);
      return [];
    }
    return [{
      id: entry.row.id,
      assetType: "monster" as const,
      name: adapted.actor.name,
      tier: adapted.actor.tier,
      level: adapted.actor.level,
      actor: adapted.actor,
      warnings: entry.warnings,
      calibrationAsset: ATK_TARGET_NAME_SET.has(adapted.actor.name),
    }];
  });
  const calibrationTargets = allTargets.filter((target) => target.calibrationAsset);
  const roleTargets = allTargets.filter((target) => !target.name.startsWith("BALANCE_ATK_"));
  const targets = calibrationTargets.length > 0 ? calibrationTargets : allTargets;
  const missingTargetTiers = TIER_BANDS
    .map((band) => band.tier)
    .filter((tier) => !targets.some((target) => target.tier === tier && target.name === ATK_TARGET_NAMES[tier]));
  if (characterAttackers.length === 0) warnings.push("No non-fallback supported Balance Environment character attack actions were found.");
  if (calibrationMediumAttackers.length === 0) warnings.push(`No ${ATK_MEDIUM_ATTACKER_NAME} calibration attacker action was found.`);
  const officialMedium = {
    physical: calibrationMediumAttackers.find((attacker) => attacker.selectedAction.pool === "physical") ?? null,
    mental: calibrationMediumAttackers.find((attacker) => attacker.selectedAction.pool === "mental") ?? null,
  };
  if (!officialMedium.physical) warnings.push(`No physical Medium action was found on ${ATK_MEDIUM_ATTACKER_NAME}.`);
  if (!officialMedium.mental) warnings.push(`No mental Medium action was found on ${ATK_MEDIUM_ATTACKER_NAME}.`);
  if (!selectedAttackers.medium) warnings.push("No official Medium attacker candidate could be selected.");
  for (const tier of missingTargetTiers) warnings.push(`No ${ATK_TARGET_NAMES[tier]} calibration target was found.`);

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    attackers,
    selectedAttackers,
    targets,
    calibrationTargets,
    roleTargets,
    missingTargetTiers,
    warnings,
    activeTuning: tuning.activeTuning,
  };
}

async function buildBalanceEnvironmentPayload(options: CliOptions): Promise<AtkPayload> {
  const discovery = await discoverRealAssets();
  const mediumAttackers = officialMediumAttackers(discovery);
  const rows: ReportRow[] = [];
  for (const medium of [mediumAttackers.physical, mediumAttackers.mental]) {
    if (!medium) continue;
    for (const target of discovery.targets) {
      rows.push(rowForOfficialMedium({
        discovery,
        medium,
        target,
        options,
      }));
    }
  }
  return {
    report: "Combat Lab Attacks-to-Defeat Probe",
    mode: "balance-environment",
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
    bandSources: BAND_SOURCE_REFS,
    actionDefinitionSources: ACTION_DEFINITION_REFS,
    officialVerdictUses: `${ATK_MEDIUM_ATTACKER_NAME} physical and mental Medium rulers; Low/High are candidate diagnostics`,
    discovery,
    dualChannelSummaries: summarizeDualChannelRows(rows),
    rows,
  };
}

async function buildRoleAssetComparisonPayload(options: CliOptions): Promise<AtkPayload> {
  const discovery = await discoverRealAssets();
  const mediumAttackers = officialMediumAttackers(discovery);
  const rows: ReportRow[] = [];
  for (const medium of [mediumAttackers.physical, mediumAttackers.mental]) {
    if (!medium) continue;
    for (const target of discovery.roleTargets) {
      rows.push(rowForOfficialMedium({
        discovery,
        medium,
        target,
        options,
      }));
    }
  }
  if (discovery.roleTargets.length === 0) {
    discovery.warnings.push("No non-BALANCE_ATK_* Balance Environment monster role targets were found for comparison.");
  }
  return {
    report: "Combat Lab Role-Asset Attacks-to-Defeat Comparison",
    mode: "role-asset-comparison",
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
    bandSources: BAND_SOURCE_REFS,
    actionDefinitionSources: ACTION_DEFINITION_REFS,
    officialVerdictUses: `${ATK_MEDIUM_ATTACKER_NAME} physical and mental Medium rulers only; authored role assets are targets, Low/High attackers remain diagnostics in discovery`,
    discovery,
    dualChannelSummaries: summarizeDualChannelRows(rows),
    rows,
  };
}

function buildSyntheticPayload(options: CliOptions): AtkPayload {
  const rows = PROBE_PROFILES.flatMap((profile) =>
    TIER_BANDS.map((band) => {
      const report = runScenarioSuite(syntheticScenario(band, profile, options));
      const expected = profileMath(profile).expectedWoundsPerAttack;
      return rowFor({
        band,
        report,
        assetSource: "synthetic-in-memory",
        campaignId: null,
        campaignName: null,
        attackerProfile: profile.name,
        profileScope: profile.scope,
        probeDefinition: profile.description,
        expectedWoundsPerAttack: expected,
        targetActor: createTierTarget(band.tier),
        damagePool: "physical",
        targetOffenseDisabled: true,
      });
    }),
  );
  return {
    report: "Combat Lab Attacks-to-Defeat Probe",
    mode: "synthetic-diagnostics",
    campaignId: null,
    campaignName: null,
    assetSource: "synthetic-in-memory",
    mutation: "none",
    databaseAccess: "none",
    seeders: "none",
    runsPerScenario: options.runs,
    seed: options.seed,
    repoHead: runGit(["rev-parse", "HEAD"]),
    gitStatus: runGit(["status", "--short"]),
    exactCommand: exactCommand(),
    bandSources: BAND_SOURCE_REFS,
    actionDefinitionSources: ACTION_DEFINITION_REFS,
    officialVerdictUses: "synthetic diagnostics only; not official ATK evidence",
    probeProfiles: PROBE_PROFILES,
    probeProfileMath: PROBE_PROFILES.map(profileMath),
    targetFixtureAnatomy: TIER_BANDS.map((band) => targetAnatomy(band.tier)),
    rows,
  };
}

function printRealDiscovery(discovery: RealAssetDiscovery) {
  console.log("Balance Environment Asset Discovery:");
  console.log(`- campaignId: ${discovery.campaignId}`);
  console.log(`- campaignName: ${discovery.campaignName}`);
  console.log(`- active power tuning: ${discovery.activeTuning.power.name} (${discovery.activeTuning.power.slug})`);
  console.log(`- active combat tuning: ${discovery.activeTuning.combat.name} (${discovery.activeTuning.combat.slug})`);
  console.log("Attacker action candidates:");
  for (const attacker of discovery.attackers.sort((left, right) => left.expectedWoundsPerAttack - right.expectedWoundsPerAttack)) {
    const marker = attacker.classification === "candidate" ? "" : ` [${attacker.classification.toUpperCase()}]`;
    const calibration = attacker.calibrationAsset ? " [CALIBRATION ASSET]" : "";
    console.log(
      `- ${attacker.name}${marker}${calibration}: L${attacker.level}, ${attacker.selectedAction.sourceType}, ` +
      `${attacker.selectedAction.diceCount} dice using ${attacker.selectedAction.accuracyAttribute}, ` +
      `potency ${attacker.selectedAction.potency}, expected successes ${attacker.expectedSuccessesPerAttack}, ` +
      `expected wounds/attack ${attacker.expectedWoundsPerAttack}.`,
    );
  }
  console.log("Target candidates:");
  for (const target of discovery.targets) {
    const anatomy = targetAnatomyFromActor(target.actor);
    const calibration = target.calibrationAsset ? " [CALIBRATION ASSET]" : "";
    console.log(
      `- ${target.name}${calibration}: ${target.tier}, L${target.level}, physical HP ${anatomy.physicalHp}, ` +
      `mental HP ${anatomy.mentalHp}, dodge dice ${anatomy.dodgeDice}, physical defence ` +
      `${anatomy.physicalDefenceDice} x ${anatomy.physicalBlockPerSuccess}, mental defence ` +
      `${anatomy.mentalDefenceDice} x ${anatomy.mentalBlockPerSuccess}, defeat model ${anatomy.defeatModel}.`,
    );
  }
  if (discovery.roleTargets.length > 0) {
    console.log("Role target candidates:");
    for (const target of discovery.roleTargets) {
      const anatomy = targetAnatomyFromActor(target.actor);
      console.log(
        `- ${target.name}: ${target.tier}, L${target.level}, physical HP ${anatomy.physicalHp}, ` +
        `mental HP ${anatomy.mentalHp}, physical protection ${anatomy.physicalProtection}, ` +
        `mental protection ${anatomy.mentalProtection}, dodge dice ${anatomy.dodgeDice}, physical defence ` +
        `${anatomy.physicalDefenceDice} x ${anatomy.physicalBlockPerSuccess}, mental defence ` +
        `${anatomy.mentalDefenceDice} x ${anatomy.mentalBlockPerSuccess}, defeat model ${anatomy.defeatModel}.`,
      );
    }
  }
  if (discovery.warnings.length > 0) {
    console.log("Discovery warnings:");
    for (const warning of discovery.warnings) console.log(`- ${warning}`);
  }
}

function printRows(rows: ReportRow[]) {
  console.log([
    "Tier".padEnd(8),
    "Band".padEnd(31),
    "Channel".padEnd(8),
    "Attacker".padEnd(44),
    "Target".padEnd(34),
    "Scope".padEnd(10),
    "Simple".padStart(8),
    "Avg ATK".padStart(8),
    "Delta".padStart(7),
    "Med ATK".padStart(8),
    "Avg Hits".padStart(9),
    "Def".padStart(5),
    "Cens".padStart(5),
    "Verdict".padStart(13),
  ].join(" | "));
  console.log("-".repeat(190));
  for (const row of rows) {
    console.log([
      row.tier.padEnd(8),
      row.band.padEnd(31),
      row.attackChannel.padEnd(8),
      row.attackerProfile.slice(0, 44).padEnd(44),
      (row.targetAssetName ?? "synthetic target").slice(0, 34).padEnd(34),
      row.profileScope.padEnd(10),
      formatNullable(row.simpleExpectedAttacksToRelevantHp).padStart(8),
      formatNullable(row.avgMeaningfulAttacksToDefeat).padStart(8),
      formatNullable(row.expectedVsObservedDifference).padStart(7),
      formatNullable(row.medianMeaningfulAttacksToDefeat).padStart(8),
      formatNullable(row.avgSuccessfulHitsToDefeat).padStart(9),
      String(row.defeatedSampleCount).padStart(5),
      String(row.censoredSampleCount).padStart(5),
      row.verdict.padStart(13),
    ].join(" | "));
  }
}

function printMismatchDiagnostics(rows: ReportRow[]) {
  console.log("Expected vs Observed Diagnostics:");
  for (const row of rows) {
    if (row.profileScope !== "official") continue;
    console.log(
      `- ${row.tier} / ${row.attackerProfile} -> ${row.targetAssetName ?? "synthetic target"}: ` +
      `simple relevant-HP-only estimate ${formatNullable(row.simpleExpectedAttacksToRelevantHp)} attacks, observed avg ` +
      `${formatNullable(row.avgMeaningfulAttacksToDefeat)}, delta ${formatNullable(row.expectedVsObservedDifference)}, ` +
      `censored ${row.censoredSampleCount}; ${row.likelyExplanation}.`,
    );
  }
}

function printAdapterRuntimeWarnings(rows: ReportRow[]) {
  const warningsByTarget = new Map<string, { label: string; tierSource: string; warnings: Set<string> }>();
  for (const row of rows) {
    if (row.adapterRuntimeWarnings.length === 0) continue;
    const key = row.targetAssetId ?? row.targetAssetName ?? `${row.tier}:${row.band}`;
    const entry = warningsByTarget.get(key) ?? {
      label: row.targetAssetName ?? "synthetic target",
      tierSource: row.targetTierSource,
      warnings: new Set<string>(),
    };
    for (const warning of row.adapterRuntimeWarnings) entry.warnings.add(warning);
    warningsByTarget.set(key, entry);
  }
  if (warningsByTarget.size === 0) {
    console.log("Adapter/runtime warnings: none reported for compared rows.");
    return;
  }
  console.log("Adapter/runtime warnings:");
  for (const entry of warningsByTarget.values()) {
    console.log(`- ${entry.label} (${entry.tierSource}):`);
    for (const warning of entry.warnings) console.log(`  - ${warning}`);
  }
}

function printDualChannelSummaries(summaries: DualChannelSummary[] | undefined) {
  if (!summaries || summaries.length === 0) return;
  console.log("Dual-Channel Summary:");
  console.log([
    "Target".padEnd(34),
    "Tier".padEnd(8),
    "Band".padEnd(31),
    "Phys Avg".padStart(8),
    "Phys Med".padStart(8),
    "Phys V".padStart(8),
    "Ment Avg".padStart(8),
    "Ment Med".padStart(8),
    "Ment V".padStart(8),
    "Better".padStart(12),
    "Worse".padStart(12),
    "Summary".padStart(14),
  ].join(" | "));
  console.log("-".repeat(190));
  for (const summary of summaries) {
    console.log([
      summary.targetAssetName.slice(0, 34).padEnd(34),
      summary.tier.padEnd(8),
      summary.band.padEnd(31),
      formatNullable(summary.physicalAvg).padStart(8),
      formatNullable(summary.physicalMedian).padStart(8),
      (summary.physicalVerdict ?? "n/a").padStart(8),
      formatNullable(summary.mentalAvg).padStart(8),
      formatNullable(summary.mentalMedian).padStart(8),
      (summary.mentalVerdict ?? "n/a").padStart(8),
      `${summary.betterChannel ?? "n/a"} ${formatNullable(summary.betterAvg)}`.padStart(12),
      `${summary.worseChannel ?? "n/a"} ${formatNullable(summary.worseAvg)}`.padStart(12),
      summary.summaryClassification.padStart(14),
    ].join(" | "));
  }
}

function printHumanPayload(payload: AtkPayload) {
  console.log("Combat Lab Attacks-to-Defeat Probe");
  console.log(`Mode: ${payload.mode}`);
  console.log(`Asset source: ${payload.assetSource}`);
  console.log(`Campaign: ${payload.campaignName ?? "n/a"} (${payload.campaignId ?? "n/a"})`);
  console.log(`Mutation: ${payload.mutation}; DB access: ${payload.databaseAccess}; seeders: ${payload.seeders}`);
  console.log(`Repo HEAD: ${payload.repoHead}`);
  console.log(`Git status: ${payload.gitStatus ? "dirty" : "clean"}`);
  console.log(`Exact command: ${payload.exactCommand}`);
  console.log(`Runs per scenario: ${payload.runsPerScenario}`);
  console.log(`Seed: ${payload.seed}`);
  console.log(`Band sources: ${payload.bandSources.join("; ")}`);
  console.log(`Action definition sources: ${payload.actionDefinitionSources.join("; ")}`);
  console.log(`Official verdict uses: ${payload.officialVerdictUses}`);
  console.log("");
  if (payload.discovery) {
    printRealDiscovery(payload.discovery);
    console.log("");
  }
  if (payload.probeProfileMath) {
    console.log("Synthetic Probe Profile Math:");
    for (const math of payload.probeProfileMath) {
      console.log(
        `- ${math.profile} (${math.scope}): ${math.diceCount} x ${math.die}, ` +
        `${math.woundsPerSuccess} wounds/success, expected successes ${math.expectedSuccessesPerAttack}, ` +
        `expected wounds/attack ${math.expectedWoundsPerAttack}.`,
      );
    }
    console.log("");
  }
  printDualChannelSummaries(payload.dualChannelSummaries);
  if (payload.dualChannelSummaries && payload.dualChannelSummaries.length > 0) console.log("");
  printRows(payload.rows);
  console.log("");
  printAdapterRuntimeWarnings(payload.rows);
  console.log("");
  printMismatchDiagnostics(payload.rows);
  console.log("");
  console.log("Notes:");
  console.log("- Official PASS / LOW / HIGH judgement uses only Balance Environment-authored Medium attacker rows.");
  console.log("- Channel-specific ATK is official runtime evidence. Global durability interpretation requires reading both physical and mental channels.");
  console.log("- Target offense is disabled so ATK measures attacks-to-defeat rather than duel win rate.");
  console.log("- Low and High candidates/probes are diagnostic range checks only.");
  console.log("- Simple estimates are relevant-channel HP divided by expected wounds/attack before dodge, defence, protection, and censoring.");
  console.log("- ATK is measured from Combat Lab defeatMetrics.monsterDefeated.avgMeaningfulActionsToDefeat.");
  console.log("- Censored samples are runs where the target was not defeated within the probe cap.");
}

function jsonReplacer(key: string, value: unknown): unknown {
  if (key === "actor") return undefined;
  if (key === "selectedAction" && value && typeof value === "object") {
    const action = value as CombatAction;
    return {
      id: action.id,
      name: action.name,
      sourceType: action.sourceType,
      kind: action.kind,
      pool: action.pool ?? null,
      rangeCategory: action.rangeCategory ?? null,
      targetCount: action.targetCount ?? null,
      accuracyAttribute: action.accuracyAttribute,
      diceCount: action.diceCount,
      potency: action.potency,
      cooldownRounds: action.cooldownRounds,
    };
  }
  return value;
}

async function main() {
  await getPrisma();
  const options = parseArgs(process.argv.slice(2));
  const payloads: AtkPayload[] = [];
  if (options.balanceEnvironment) {
    payloads.push(options.compareRoleAssets
      ? await buildRoleAssetComparisonPayload(options)
      : await buildBalanceEnvironmentPayload(options));
  }
  if (options.includeSyntheticDiagnostics) {
    payloads.push(buildSyntheticPayload(options));
  }
  if (options.json) {
    console.log(JSON.stringify(payloads.length === 1 ? payloads[0] : { reports: payloads }, jsonReplacer, 2));
    return;
  }
  for (const [index, payload] of payloads.entries()) {
    if (index > 0) console.log("\n" + "=".repeat(120) + "\n");
    printHumanPayload(payload);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prismaLoaded) await prisma.$disconnect();
  });
