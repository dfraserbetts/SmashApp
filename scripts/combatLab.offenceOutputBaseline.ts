import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { diceSides, successCountForRoll } from "../lib/combat-lab/dice";
import {
  adaptCampaignCharacterToCombatActor,
  adaptMonsterToCombatLabActor,
  itemTemplateToSummoningEquipmentItem,
} from "../lib/combat-lab/liveAdapters";
import type { CombatAction, CombatActor, CombatAttributeName, CombatDieSize } from "../lib/combat-lab/types";
import { normalizeCombatTuning, normalizeCombatTuningFlatValues } from "../lib/config/combatTuningShared";
import { normalizePowerTuningValues, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];
type CharacterRow = Parameters<typeof adaptCampaignCharacterToCombatActor>[0];
type MonsterRow = Parameters<typeof adaptMonsterToCombatLabActor>[0];

type CliOptions = {
  json: boolean;
  includeNonLevel3: boolean;
};

type AssetCategory =
  | "calibration-attack-string"
  | "calibration-other"
  | "authored-named-offence"
  | "placeholder-compatibility"
  | "fallback-excluded";

type SuccessDistribution = {
  successes: number;
  probability: number;
};

type OffenceProfile = {
  category: AssetCategory;
  assetType: "character" | "monster";
  assetId: string;
  assetName: string;
  level: number;
  roleOrTier: string | null;
  actionId: string;
  actionName: string;
  sourceType: string;
  sourcePowerId: string | null;
  channel: string;
  rangeCategory: string | null;
  targetCount: number | null;
  accuracyAttribute: CombatAttributeName;
  die: CombatDieSize;
  diceCount: number;
  modifier: number;
  woundsPerSuccess: number;
  expectedSuccesses: number;
  expectedRawWounds: number;
  expectedRawWoundsPerDie: number;
  maxSuccesses: number;
  maxRawWounds: number;
  spikeThresholdSuccesses: number;
  spikeThresholdRawWounds: number;
  spikeProbability: number;
  zeroSuccessProbability: number;
  maxSuccessProbability: number;
  distribution: SuccessDistribution[];
  defenceGate: string | null;
  cooldownRounds: number;
  targetPolicy: string;
  notes: string[];
  warnings: string[];
};

type BaselinePayload = {
  title: string;
  campaignId: string;
  campaignName: string;
  assetSource: "balance-campaign-authored";
  mutation: "none";
  databaseAccess: "read-only";
  seeders: "none";
  repoHead: string;
  gitStatus: string;
  exactCommand: string;
  activeTuning: {
    power: { setId: string; name: string; slug: string };
    combat: { setId: string; name: string; slug: string };
  };
  successDoctrine: string;
  spikeThresholdDefinition: string;
  profileCounts: Record<AssetCategory, number>;
  warnings: string[];
  profiles: OffenceProfile[];
};

const BALANCE_ENVIRONMENT_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_ENVIRONMENT_CAMPAIGN_NAME = "Balance Environment";
const OFFICIAL_ROLE_COMPARISON_RULER = "BALANCE_ATK_L3_AttackString_4D8_W2";

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

let prisma!: PrismaClientInstance;
let prismaLoaded = false;

function parseArgs(argv: string[]): CliOptions {
  return {
    json: argv.includes("--json"),
    includeNonLevel3: argv.includes("--include-non-level-3"),
  };
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

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) return "UNKNOWN";
  return result.stdout.trim();
}

function exactCommand(): string {
  return ["npx", "--yes", "tsx", "scripts/combatLab.offenceOutputBaseline.ts", ...process.argv.slice(2)].join(" ");
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
    throw new Error("Missing ACTIVE Power or Combat tuning set. Offence baseline is read-only and does not seed tuning.");
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

function combineDistributions(left: number[], right: number[]): number[] {
  const combined = Array.from({ length: left.length + right.length - 1 }, () => 0);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      combined[leftIndex + rightIndex] += left[leftIndex] * right[rightIndex];
    }
  }
  return combined;
}

function successDistribution(diceCount: number, die: CombatDieSize, modifier: number): SuccessDistribution[] {
  const sides = diceSides(die);
  const perDie = [0, 0, 0];
  for (let face = 1; face <= sides; face += 1) {
    perDie[successCountForRoll(face, modifier)] += 1 / sides;
  }

  let total = [1];
  for (let dieIndex = 0; dieIndex < Math.max(0, Math.trunc(diceCount)); dieIndex += 1) {
    total = combineDistributions(total, perDie);
  }
  return total.map((probability, successes) => ({ successes, probability }));
}

function expectedFromDistribution(distribution: SuccessDistribution[]): number {
  return distribution.reduce((sum, entry) => sum + entry.successes * entry.probability, 0);
}

function actionWoundsPerSuccess(action: CombatAction): number {
  return Math.max(1, action.effectPerPrimarySuccess ?? action.potency);
}

function actionChannel(action: CombatAction): string {
  if (action.pool) return action.pool;
  if (action.damageTypes && action.damageTypes.length > 0) return action.damageTypes.join(",");
  return "unspecified";
}

function defenceGate(action: CombatAction): string | null {
  const gate = action.source?.power?.primaryDefenceGate;
  if (!gate) return null;
  return [
    gate.gateResult,
    gate.protectionChannel ? `channel=${gate.protectionChannel}` : null,
    gate.resistAttribute ? `resist=${gate.resistAttribute}` : null,
    gate.hostileEntryPattern ? `pattern=${gate.hostileEntryPattern}` : null,
    `source=${gate.resolutionSource}`,
  ].filter(Boolean).join(" ");
}

function isPlaceholder(actor: CombatActor, action: CombatAction): boolean {
  return /placeholder|compatibility/i.test(`${actor.name} ${action.name}`);
}

function classifyProfile(actor: CombatActor, action: CombatAction, assetType: "character" | "monster"): AssetCategory {
  if (action.sourceType === "fallback") return "fallback-excluded";
  if (isPlaceholder(actor, action)) return "placeholder-compatibility";
  if (/^BALANCE_ATK_L3_AttackString_/i.test(actor.name)) return "calibration-attack-string";
  if (/^BALANCE_ATK_/i.test(actor.name)) return "calibration-other";
  if (assetType === "monster" && /^BALANCE_(Minion|Soldier|Elite|Boss|Legendary)_/i.test(actor.name)) {
    return isPlaceholder(actor, action) ? "placeholder-compatibility" : "authored-named-offence";
  }
  return "authored-named-offence";
}

function collectProfiles(params: {
  actor: CombatActor;
  assetType: "character" | "monster";
  warnings: string[];
  includeNonLevel3: boolean;
}): OffenceProfile[] {
  if (!params.includeNonLevel3 && params.actor.level !== 3) return [];
  return params.actor.actions.flatMap((action) => {
    if (action.kind !== "attack" || !action.supported) return [];
    const category = classifyProfile(params.actor, action, params.assetType);
    if (category === "fallback-excluded") return [];
    const diceCount = Math.max(0, Math.trunc(action.diceCount));
    const modifier = 0;
    const die = params.actor.attributeDice[action.accuracyAttribute] ?? "D8";
    const distribution = successDistribution(diceCount, die, modifier);
    const expectedSuccesses = expectedFromDistribution(distribution);
    const woundsPerSuccess = actionWoundsPerSuccess(action);
    const maxSuccesses = distribution.reduce(
      (max, entry) => entry.probability > 0 && entry.successes > max ? entry.successes : max,
      0,
    );
    const spikeThresholdSuccesses = Math.max(1, Math.ceil(maxSuccesses * 0.75));
    const notes: string[] = [];
    if (params.actor.name === OFFICIAL_ROLE_COMPARISON_RULER) {
      notes.push("official role comparison ruler");
    }
    if (category === "placeholder-compatibility") {
      notes.push("placeholder compatibility attack; keep separate from authored offensive conclusions");
    }
    if (action.secondaryActions && action.secondaryActions.length > 0) {
      notes.push(`${action.secondaryActions.length} secondary action(s) not folded into this raw primary profile row`);
    }
    if (action.targetCount && action.targetCount > 1) {
      notes.push("raw row is per primary target, not total multi-target encounter output");
    }
    return [{
      category,
      assetType: params.assetType,
      assetId: params.actor.id,
      assetName: params.actor.name,
      level: params.actor.level,
      roleOrTier: params.actor.tier ?? String(params.actor.role ?? ""),
      actionId: action.id,
      actionName: action.name,
      sourceType: action.sourceType,
      sourcePowerId: action.sourcePowerId ?? null,
      channel: actionChannel(action),
      rangeCategory: action.rangeCategory ?? null,
      targetCount: action.targetCount ?? null,
      accuracyAttribute: action.accuracyAttribute,
      die,
      diceCount,
      modifier,
      woundsPerSuccess,
      expectedSuccesses,
      expectedRawWounds: expectedSuccesses * woundsPerSuccess,
      expectedRawWoundsPerDie: diceCount > 0 ? (expectedSuccesses * woundsPerSuccess) / diceCount : 0,
      maxSuccesses,
      maxRawWounds: maxSuccesses * woundsPerSuccess,
      spikeThresholdSuccesses,
      spikeThresholdRawWounds: spikeThresholdSuccesses * woundsPerSuccess,
      spikeProbability: distribution
        .filter((entry) => entry.successes >= spikeThresholdSuccesses)
        .reduce((sum, entry) => sum + entry.probability, 0),
      zeroSuccessProbability: distribution[0]?.probability ?? 0,
      maxSuccessProbability: distribution.find((entry) => entry.successes === maxSuccesses)?.probability ?? 0,
      distribution,
      defenceGate: defenceGate(action),
      cooldownRounds: action.cooldownRounds,
      targetPolicy: action.targetPolicy,
      notes,
      warnings: params.warnings,
    }];
  });
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

function categoryCounts(profiles: OffenceProfile[]): Record<AssetCategory, number> {
  return {
    "calibration-attack-string": profiles.filter((profile) => profile.category === "calibration-attack-string").length,
    "calibration-other": profiles.filter((profile) => profile.category === "calibration-other").length,
    "authored-named-offence": profiles.filter((profile) => profile.category === "authored-named-offence").length,
    "placeholder-compatibility": profiles.filter((profile) => profile.category === "placeholder-compatibility").length,
    "fallback-excluded": profiles.filter((profile) => profile.category === "fallback-excluded").length,
  };
}

async function buildPayload(options: CliOptions): Promise<BaselinePayload> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: BALANCE_ENVIRONMENT_CAMPAIGN_ID },
    select: { id: true, name: true },
  });
  if (!campaign) throw new Error(`Balance Environment campaign not found: ${BALANCE_ENVIRONMENT_CAMPAIGN_ID}`);
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

  const monsterItemIds = Array.from(
    new Set(
      monsters.flatMap((monster) => [
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
      ]).filter(Boolean) as string[],
    ),
  );
  const itemRows = monsterItemIds.length > 0
    ? await prisma.itemTemplate.findMany({
        where: { campaignId: campaign.id, id: { in: monsterItemIds } },
        include: ITEM_TEMPLATE_INCLUDE,
      })
    : [];
  const monsterEquipmentById = new Map(
    itemRows.map((item) => [item.id, itemTemplateToSummoningEquipmentItem(item)]),
  );

  const warnings: string[] = [];
  const characterProfiles = characters.flatMap((row) => {
    const adapted = adaptCampaignCharacterToCombatActor(
      row as CharacterRow,
      tuning.combatValues,
      tuning.powerSnapshot,
    );
    const actorWarnings = warningsToStrings(adapted.warnings);
    if (adapted.actor.hydration.fallbackActions.length > 0) {
      warnings.push(`${adapted.actor.name}: fallback actions present (${adapted.actor.hydration.fallbackActions.join(", ")}).`);
    }
    return collectProfiles({
      actor: adapted.actor,
      assetType: "character",
      warnings: actorWarnings,
      includeNonLevel3: options.includeNonLevel3,
    });
  });

  const monsterProfiles = monsters.flatMap((row) => {
    const adapted = adaptMonsterToCombatLabActor(
      row as MonsterRow,
      monsterEquipmentById,
      tuning.combatValues,
      tuning.powerSnapshot,
    );
    const actorWarnings = warningsToStrings(adapted.warnings);
    if (adapted.actor.hydration.fallbackActions.length > 0) {
      warnings.push(`${adapted.actor.name}: fallback actions present (${adapted.actor.hydration.fallbackActions.join(", ")}).`);
    }
    return collectProfiles({
      actor: adapted.actor,
      assetType: "monster",
      warnings: actorWarnings,
      includeNonLevel3: options.includeNonLevel3,
    });
  });

  const profiles = [...characterProfiles, ...monsterProfiles].sort((left, right) =>
    left.category.localeCompare(right.category) ||
    left.expectedRawWounds - right.expectedRawWounds ||
    left.assetName.localeCompare(right.assetName) ||
    left.actionName.localeCompare(right.actionName),
  );

  return {
    title: "Balance Environment Level 3 Offence Output Baseline",
    campaignId: campaign.id,
    campaignName: campaign.name,
    assetSource: "balance-campaign-authored",
    mutation: "none",
    databaseAccess: "read-only",
    seeders: "none",
    repoHead: runGit(["rev-parse", "HEAD"]),
    gitStatus: runGit(["status", "--short", "--untracked-files=all"]),
    exactCommand: exactCommand(),
    activeTuning: tuning.activeTuning,
    successDoctrine: "Exact enumeration of current Combat Lab helper: natural 1 = 0; natural 2-3 may be rescued by modifiers to exactly 1; natural 4-9 = 1; modified natural success 10+ = 2; max 2 successes per die.",
    spikeThresholdDefinition: "spikeProbability = probability of total successes >= ceil(attainableMaxSuccesses * 0.75), where attainableMaxSuccesses comes from exact face enumeration for that die/modifier. Raw row is before defence, protection, target count multiplication, ongoing ticks, and secondary action folding.",
    profileCounts: categoryCounts(profiles),
    warnings,
    profiles,
  };
}

function fmt(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function printProfileTable(title: string, profiles: OffenceProfile[]) {
  console.log(title);
  if (profiles.length === 0) {
    console.log("- none");
    return;
  }
  console.log([
    "Asset".padEnd(42),
    "Action".padEnd(38),
    "Src".padEnd(14),
    "Chan".padEnd(8),
    "Dice".padEnd(10),
    "W/S".padStart(5),
    "ExpSuc".padStart(7),
    "ExpRaw".padStart(7),
    "P0".padStart(7),
    "PSpike".padStart(7),
    "PMax".padStart(7),
    "Notes".padEnd(28),
  ].join(" | "));
  console.log("-".repeat(210));
  for (const profile of profiles) {
    const dice = `${profile.diceCount}x${profile.die}`;
    console.log([
      profile.assetName.slice(0, 42).padEnd(42),
      profile.actionName.slice(0, 38).padEnd(38),
      profile.sourceType.slice(0, 14).padEnd(14),
      profile.channel.slice(0, 8).padEnd(8),
      dice.padEnd(10),
      String(profile.woundsPerSuccess).padStart(5),
      fmt(profile.expectedSuccesses).padStart(7),
      fmt(profile.expectedRawWounds).padStart(7),
      fmt(profile.zeroSuccessProbability * 100, 1).padStart(6) + "%",
      fmt(profile.spikeProbability * 100, 1).padStart(6) + "%",
      fmt(profile.maxSuccessProbability * 100, 1).padStart(6) + "%",
      profile.notes.join("; ").slice(0, 28).padEnd(28),
    ].join(" | "));
  }
}

function printHumanPayload(payload: BaselinePayload) {
  console.log(payload.title);
  console.log(`Campaign: ${payload.campaignName} (${payload.campaignId})`);
  console.log(`Asset source: ${payload.assetSource}`);
  console.log(`Mutation: ${payload.mutation}; DB access: ${payload.databaseAccess}; seeders: ${payload.seeders}`);
  console.log(`Repo HEAD: ${payload.repoHead}`);
  console.log(`Git status: ${payload.gitStatus ? "dirty" : "clean"}`);
  console.log(`Exact command: ${payload.exactCommand}`);
  console.log(`Active power tuning: ${payload.activeTuning.power.name} (${payload.activeTuning.power.slug})`);
  console.log(`Active combat tuning: ${payload.activeTuning.combat.name} (${payload.activeTuning.combat.slug})`);
  console.log(`Success doctrine: ${payload.successDoctrine}`);
  console.log(`Spike definition: ${payload.spikeThresholdDefinition}`);
  console.log(`Profile counts: ${JSON.stringify(payload.profileCounts)}`);
  if (payload.warnings.length > 0) {
    console.log("Global warnings:");
    for (const warning of payload.warnings) console.log(`- ${warning}`);
  }
  console.log("");

  printProfileTable(
    "Calibration Attack Strings",
    payload.profiles.filter((profile) => profile.category === "calibration-attack-string"),
  );
  console.log("");
  printProfileTable(
    "Other Calibration Offence Assets",
    payload.profiles.filter((profile) => profile.category === "calibration-other"),
  );
  console.log("");
  printProfileTable(
    "Authored Named Offence Profiles",
    payload.profiles.filter((profile) => profile.category === "authored-named-offence"),
  );
  console.log("");
  printProfileTable(
    "Placeholder Compatibility Attacks",
    payload.profiles.filter((profile) => profile.category === "placeholder-compatibility"),
  );
  console.log("");

  console.log("Top raw output rows:");
  for (const profile of [...payload.profiles].sort((left, right) => right.expectedRawWounds - left.expectedRawWounds).slice(0, 10)) {
    console.log(
      `- ${profile.assetName} / ${profile.actionName}: ${profile.diceCount}x${profile.die}, ` +
      `${profile.woundsPerSuccess} wounds/success, expected raw ${fmt(profile.expectedRawWounds)}, ` +
      `spike ${fmt(profile.spikeProbability * 100, 1)}%, category ${profile.category}.`,
    );
  }
}

async function main() {
  await getPrisma();
  const payload = await buildPayload(parseArgs(process.argv.slice(2)));
  if (payload.exactCommand.includes("--json")) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  printHumanPayload(payload);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prismaLoaded) await prisma.$disconnect();
  });
