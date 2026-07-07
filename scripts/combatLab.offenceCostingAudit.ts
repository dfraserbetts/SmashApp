import { spawnSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";

import { normalizeBuilderData } from "../lib/characterBuilder/core";
import { signatureMovePointPool } from "../lib/characterBuilder/powers";
import { calculateCharacterPlayerPowerSpend, normalizeCharacterPowerSpendScalar } from "../lib/config/characterBuilderTuningShared";
import { normalizeCombatTuning, normalizeCombatTuningFlatValues } from "../lib/config/combatTuningShared";
import { normalizePowerTuningValues, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import { diceSides, successCountForRoll } from "../lib/combat-lab/dice";
import {
  adaptCampaignCharacterToCombatActor,
  adaptMonsterToCombatLabActor,
  itemTemplateToSummoningEquipmentItem,
} from "../lib/combat-lab/liveAdapters";
import type { CombatAction, CombatActor, CombatAttributeName, CombatDieSize } from "../lib/combat-lab/types";
import { compareForgeOutputToBands } from "../lib/forge/outputBands";
import { buildForgeOutputProfile, type ForgeOutputProfileInput } from "../lib/forge/outputProfile";
import { resolvePowerCost } from "../lib/summoning/powerCostResolver";
import type { Power } from "../lib/summoning/types";

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];
type CharacterRow = Parameters<typeof adaptCampaignCharacterToCombatActor>[0];
type MonsterRow = Parameters<typeof adaptMonsterToCombatLabActor>[0];

type SuccessDistribution = {
  successes: number;
  probability: number;
};

type CostEvidence = {
  kind: "power" | "signatureMove" | "equippedWeapon" | "naturalAttack" | "none";
  costSource: string;
  availableCost: number | null;
  playerSpend: number | null;
  costPerExpectedRaw: number | null;
  costPerMaxRaw: number | null;
  costPerP20Point: number | null;
  basePowerValue: number | null;
  derivedCooldownTurns: number | null;
  powerPool: number | null;
  signatureMove: boolean;
  itemOutputBand: string | null;
  itemOutputWoundsPerSuccess: number | null;
  notes: string[];
  debug: Record<string, unknown>;
};

type FocusedProfile = {
  focusKey: string;
  assetType: "character" | "monster";
  assetId: string;
  assetName: string;
  level: number;
  attackId: string;
  attackName: string;
  sourceType: string;
  sourcePowerId: string | null;
  actionType: string;
  cooldownRounds: number;
  rangeCategory: string | null;
  targetCount: number | null;
  targetPolicy: string;
  primarySecondarySummary: string;
  useResourceSummary: string;
  accuracyAttribute: CombatAttributeName;
  die: CombatDieSize;
  diceCount: number;
  modifier: number;
  woundsPerSuccess: number;
  expectedSuccesses: number;
  expectedRawWounds: number;
  maxRawWounds: number;
  p10Raw: number;
  p16Raw: number;
  p20Raw: number;
  multipleOfMediumExpectedRaw: number | null;
  costEvidence: CostEvidence;
  adequacyJudgement: "clearly priced" | "maybe priced" | "underpriced risk" | "not enough data" | "disconnected/no cost evidence";
  hydrationWarnings: string[];
};

type Payload = {
  title: string;
  campaignId: string;
  campaignName: string;
  repoHead: string;
  gitStatus: string;
  exactCommand: string;
  mutation: "none";
  databaseAccess: "read-only";
  seeders: "none";
  assetSource: "balance-campaign-authored";
  activeTuning: {
    power: { setId: string; name: string; slug: string };
    combat: { setId: string; name: string; slug: string };
    characterBuilder: { id: string; playerPowerSpendScalar: number; fallbackUsed: boolean };
  };
  doctrine: string;
  focusedProfiles: FocusedProfile[];
  warnings: string[];
};

const BALANCE_ENVIRONMENT_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_ENVIRONMENT_CAMPAIGN_NAME = "Balance Environment";
const OFFICIAL_MEDIUM_BENCHMARK = "BALANCE_ATK_L3_AttackString_4D8_W2";
const CHARACTER_BUILDER_TUNING_ID = "default";

const FOCUS = [
  { key: "medium-ruler", asset: OFFICIAL_MEDIUM_BENCHMARK, action: "" },
  { key: "sage-mind-spark", asset: "BALANCE_Arcane Sage", action: "Mind Spark" },
  { key: "sage-focus", asset: "BALANCE_Arcane Sage", action: "Sage Focus" },
  { key: "sage-mind-lance", asset: "BALANCE_Arcane Sage", action: "Mind Lance" },
  { key: "hawkshot-longbow", asset: "BALANCE_Hawkshot Archer", action: "Longbow" },
  { key: "hawkshot-raking-shot", asset: "BALANCE_Hawkshot Archer", action: "Raking Shot" },
  { key: "hawkshot-skyline-shot", asset: "BALANCE_Hawkshot Archer", action: "Skyline Shot" },
  { key: "ranger-commander-bow", asset: "BALANCE_Ranger Commander", action: "Commander Bow" },
  { key: "ranger-marked-volley", asset: "BALANCE_Ranger Commander", action: "Marked Volley" },
  { key: "ranger-killbox", asset: "BALANCE_Ranger Commander", action: "Killbox Command" },
  { key: "stoneguard-breaker-slam", asset: "BALANCE_Stoneguard", action: "Breaker Slam" },
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
  weaponAttributes: {
    select: {
      strengthSource: true,
      rangeSource: true,
      weaponAttribute: {
        select: {
          name: true,
          pricingMode: true,
          pricingScalar: true,
        },
      },
    },
  },
  armorAttributes: {
    select: {
      armorAttribute: {
        select: {
          name: true,
          pricingMode: true,
          pricingScalar: true,
        },
      },
    },
  },
  shieldAttributes: {
    select: {
      shieldAttribute: {
        select: {
          name: true,
          pricingMode: true,
          pricingScalar: true,
        },
      },
    },
  },
  defEffects: { select: { defEffect: { select: { name: true } } } },
  vrpEntries: { select: { effectKind: true, magnitude: true, damageType: { select: { name: true } } } },
};

loadEnvConfig(process.cwd());

let prisma!: PrismaClientInstance;

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) return "UNKNOWN";
  return result.stdout.trim();
}

function exactCommand(): string {
  return ["npx", "--yes", "tsx", "scripts/combatLab.offenceCostingAudit.ts", ...process.argv.slice(2)].join(" ");
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
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
  for (let index = 0; index < Math.max(0, Math.trunc(diceCount)); index += 1) {
    total = combineDistributions(total, perDie);
  }
  return total.map((probability, successes) => ({ successes, probability }));
}

function expectedFromDistribution(distribution: SuccessDistribution[]): number {
  return distribution.reduce((sum, entry) => sum + entry.successes * entry.probability, 0);
}

function probabilityRawAtLeast(distribution: SuccessDistribution[], woundsPerSuccess: number, threshold: number): number {
  return distribution
    .filter((entry) => entry.successes * woundsPerSuccess >= threshold)
    .reduce((sum, entry) => sum + entry.probability, 0);
}

function actionWoundsPerSuccess(action: CombatAction): number {
  return Math.max(1, action.effectPerPrimarySuccess ?? action.potency);
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

function sourcePowerKey(action: CombatAction): string | null {
  if (action.sourcePowerId) return action.sourcePowerId;
  const powerId = action.source?.power?.id;
  return powerId ? String(powerId) : null;
}

function backpackItemIdFromAction(action: CombatAction): string | null {
  const parts = action.id.split(":");
  const equipmentIndex = parts.indexOf("equipment");
  if (equipmentIndex >= 0 && parts[equipmentIndex + 2]) return parts[equipmentIndex + 2];
  return null;
}

function buildForgeInput(item: any): ForgeOutputProfileInput {
  return {
    level: item.level,
    rarity: item.rarity,
    type: item.type,
    size: item.size,
    armorLocation: item.armorLocation,
    shieldHasAttack: item.shieldHasAttack,
    rangeCategories: (item.rangeCategories ?? []).map((entry: any) => entry.rangeCategory),
    physicalStrength: item.physicalStrength,
    mentalStrength: item.mentalStrength,
    meleePhysicalStrength: item.meleePhysicalStrength,
    meleeMentalStrength: item.meleeMentalStrength,
    rangedPhysicalStrength: item.rangedPhysicalStrength,
    rangedMentalStrength: item.rangedMentalStrength,
    aoePhysicalStrength: item.aoePhysicalStrength,
    aoeMentalStrength: item.aoeMentalStrength,
    meleeTargets: item.meleeTargets,
    rangedTargets: item.rangedTargets,
    rangedDistanceFeet: item.rangedDistanceFeet,
    aoeCenterRangeFeet: item.aoeCenterRangeFeet,
    aoeCount: item.aoeCount,
    aoeShape: item.aoeShape,
    aoeSphereRadiusFeet: item.aoeSphereRadiusFeet,
    aoeConeLengthFeet: item.aoeConeLengthFeet,
    aoeLineWidthFeet: item.aoeLineWidthFeet,
    aoeLineLengthFeet: item.aoeLineLengthFeet,
    meleeDamageTypes: (item.meleeDamageTypes ?? []).map((entry: any) => entry.damageType),
    rangedDamageTypes: (item.rangedDamageTypes ?? []).map((entry: any) => entry.damageType),
    aoeDamageTypes: (item.aoeDamageTypes ?? []).map((entry: any) => entry.damageType),
    attackEffectsMelee: (item.attackEffectsMelee ?? []).map((entry: any) => entry.attackEffect),
    attackEffectsRanged: (item.attackEffectsRanged ?? []).map((entry: any) => entry.attackEffect),
    attackEffectsAoE: (item.attackEffectsAoE ?? []).map((entry: any) => entry.attackEffect),
    ppv: item.ppv,
    mpv: item.mpv,
    auraPhysical: item.auraPhysical,
    auraMental: item.auraMental,
    weaponAttributes: (item.weaponAttributes ?? []).map((entry: any) => ({
      weaponAttribute: entry.weaponAttribute,
      strengthSource: entry.strengthSource,
      rangeSource: entry.rangeSource,
    })),
    armorAttributes: (item.armorAttributes ?? []).map((entry: any) => ({
      armorAttribute: entry.armorAttribute,
    })),
    shieldAttributes: (item.shieldAttributes ?? []).map((entry: any) => ({
      shieldAttribute: entry.shieldAttribute,
    })),
    defEffects: (item.defEffects ?? []).map((entry: any) => entry.defEffect),
    vrpEntries: (item.vrpEntries ?? []).map((entry: any) => ({
      effectKind: entry.effectKind,
      magnitude: entry.magnitude,
      damageType: entry.damageType,
    })),
  };
}

async function loadActiveTuning() {
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
      where: { id: CHARACTER_BUILDER_TUNING_ID },
      select: { id: true, playerPowerSpendScalar: true },
    }),
  ]);
  if (!powerSet || !combatSet) {
    throw new Error("Missing ACTIVE Power or Combat tuning set.");
  }

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
    characterBuilder: {
      id: characterBuilderTuning?.id ?? CHARACTER_BUILDER_TUNING_ID,
      playerPowerSpendScalar: normalizeCharacterPowerSpendScalar(characterBuilderTuning?.playerPowerSpendScalar),
      fallbackUsed: !characterBuilderTuning,
    },
    activeTuning: {
      power: { setId: powerSet.id, name: powerSet.name, slug: powerSet.slug },
      combat: { setId: combatSet.id, name: combatSet.name, slug: combatSet.slug },
    },
  };
}

function addPowerCostEvidence(params: {
  map: Map<string, CostEvidence>;
  power: Power;
  kind: "power" | "signatureMove";
  powerTuning: PowerTuningSnapshot;
  level: number;
  scalar: number;
  tier?: any;
}) {
  const cost = resolvePowerCost(params.power, params.powerTuning, {
    level: params.level,
    tier: params.tier ?? "SOLDIER",
  });
  const playerSpend = calculateCharacterPlayerPowerSpend(cost.basePowerValue, params.scalar);
  const evidence: CostEvidence = {
    kind: params.kind,
    costSource: "resolvePowerCost",
    availableCost: playerSpend,
    playerSpend,
    costPerExpectedRaw: null,
    costPerMaxRaw: null,
    costPerP20Point: null,
    basePowerValue: cost.basePowerValue,
    derivedCooldownTurns: cost.derivedCooldownTurns,
    powerPool: params.kind === "signatureMove" ? signatureMovePointPool(params.level) : null,
    signatureMove: params.kind === "signatureMove",
    itemOutputBand: null,
    itemOutputWoundsPerSuccess: null,
    notes: [
      params.kind === "signatureMove"
        ? "Signature move uses same resolver and scalar, but a separate level x 20 pool."
        : "Normal power uses Character Builder spend scalar over basePowerValue.",
    ],
    debug: {
      sharedContextCost: cost.sharedContextCost,
      structuralCost: cost.structuralCost,
      accessCost: cost.accessCost,
      packetCosts: cost.packetCosts.map((packet) => ({
        packetIndex: packet.packetIndex,
        intention: packet.intention,
        packetMagnitudeCost: packet.packetMagnitudeCost,
        packetTotalAfterContingency: packet.packetTotalAfterContingency,
        magnitude: packet.debug.magnitude,
      })),
      derivedCooldown: cost.derivedCooldown,
    },
  };
  const id = params.power.id ? String(params.power.id) : null;
  const name = String(params.power.name ?? "");
  if (id) {
    params.map.set(id, evidence);
    if (params.kind === "signatureMove") params.map.set(`signatureMove:${id}`, evidence);
  }
  if (name) {
    params.map.set(`name:${name}`, evidence);
    if (params.kind === "signatureMove") params.map.set(`name:Signature Move: ${name}`, evidence);
  }
}

function addItemCostEvidence(params: {
  map: Map<string, CostEvidence>;
  backpackItemId: string;
  item: any;
}) {
  const profile = buildForgeOutputProfile(buildForgeInput(params.item));
  const comparison = compareForgeOutputToBands(profile);
  const attackProfile = comparison.weaponProfiles
    .filter((entry) => entry.enabled)
    .sort((left, right) => right.totalPressure - left.totalPressure)[0] ?? null;
  params.map.set(params.backpackItemId, {
    kind: "equippedWeapon",
    costSource: "itemTemplate + Forge output-band comparison; no persisted spent FP found on ItemTemplate",
    availableCost: null,
    playerSpend: null,
    costPerExpectedRaw: null,
    costPerMaxRaw: null,
    costPerP20Point: null,
    basePowerValue: null,
    derivedCooldownTurns: null,
    powerPool: null,
    signatureMove: false,
    itemOutputBand: attackProfile?.classification ?? null,
    itemOutputWoundsPerSuccess: attackProfile?.totalWoundsPerSuccess ?? null,
    notes: [
      "Combat Lab hydrates item offensive output from stored item template fields.",
      "Forge UI computes FP from ForgeCostEntry rows, but spent FP is not persisted on this item row.",
    ],
    debug: {
      itemId: params.item.id,
      itemName: params.item.name,
      itemLevel: params.item.level,
      rarity: params.item.rarity,
      type: params.item.type,
      size: params.item.size,
      rangeCategories: (params.item.rangeCategories ?? []).map((entry: any) => entry.rangeCategory),
      strengths: {
        physicalStrength: params.item.physicalStrength,
        mentalStrength: params.item.mentalStrength,
        meleePhysicalStrength: params.item.meleePhysicalStrength,
        meleeMentalStrength: params.item.meleeMentalStrength,
        rangedPhysicalStrength: params.item.rangedPhysicalStrength,
        rangedMentalStrength: params.item.rangedMentalStrength,
        aoePhysicalStrength: params.item.aoePhysicalStrength,
        aoeMentalStrength: params.item.aoeMentalStrength,
      },
      forgeAttackProfiles: comparison.weaponProfiles.map((entry) => ({
        profileKind: entry.profileKind,
        totalWoundsPerSuccess: entry.totalWoundsPerSuccess,
        targetCount: entry.targetCount,
        totalPressure: entry.totalPressure,
        classification: entry.classification,
        thresholds: entry.thresholds,
      })),
    },
  });
}

function findCostEvidence(params: {
  action: CombatAction;
  powerCosts: Map<string, CostEvidence>;
  itemCosts: Map<string, CostEvidence>;
}): CostEvidence {
  if (params.action.sourceType === "equippedWeapon") {
    const backpackItemId = backpackItemIdFromAction(params.action);
    return (backpackItemId ? params.itemCosts.get(backpackItemId) : null) ?? noCost("equippedWeapon");
  }
  if (params.action.sourceType === "naturalAttack") {
    return noCost("naturalAttack");
  }
  const key = sourcePowerKey(params.action);
  const nameKey = `name:${params.action.source?.power?.name ?? params.action.name}`;
  return (key ? params.powerCosts.get(key) : null) ??
    params.powerCosts.get(nameKey) ??
    noCost(params.action.sourceType === "signatureMove" ? "signatureMove" : "none");
}

function noCost(kind: CostEvidence["kind"]): CostEvidence {
  return {
    kind,
    costSource: kind === "naturalAttack"
      ? "natural attacks have authored output fields but no power/forge cost row"
      : "no cost evidence matched",
    availableCost: null,
    playerSpend: null,
    costPerExpectedRaw: null,
    costPerMaxRaw: null,
    costPerP20Point: null,
    basePowerValue: null,
    derivedCooldownTurns: null,
    powerPool: null,
    signatureMove: kind === "signatureMove",
    itemOutputBand: null,
    itemOutputWoundsPerSuccess: null,
    notes: [],
    debug: {},
  };
}

function focusKey(actor: CombatActor, action: CombatAction): string | null {
  const normalizedAsset = actor.name.trim().toLowerCase();
  const normalizedAction = action.name.trim().toLowerCase();
  const match = FOCUS.find((focus) => {
    if (focus.asset.toLowerCase() !== normalizedAsset) return false;
    if (!focus.action) return true;
    return normalizedAction.includes(focus.action.toLowerCase());
  });
  return match?.key ?? null;
}

function collectFocusedProfiles(params: {
  actor: CombatActor;
  assetType: "character" | "monster";
  powerCosts: Map<string, CostEvidence>;
  itemCosts: Map<string, CostEvidence>;
  warnings: string[];
  mediumExpectedRaw: number | null;
}): FocusedProfile[] {
  return params.actor.actions.flatMap((action) => {
    if (action.kind !== "attack" || !action.supported) return [];
    const key = focusKey(params.actor, action);
    if (!key) return [];
    const diceCount = Math.max(0, Math.trunc(action.diceCount));
    const modifier = 0;
    const die = params.actor.attributeDice[action.accuracyAttribute] ?? "D8";
    const distribution = successDistribution(diceCount, die, modifier);
    const expectedSuccesses = expectedFromDistribution(distribution);
    const woundsPerSuccess = actionWoundsPerSuccess(action);
    const expectedRawWounds = expectedSuccesses * woundsPerSuccess;
    const maxRawWounds = distribution.reduce(
      (max, entry) => entry.probability > 0 ? Math.max(max, entry.successes * woundsPerSuccess) : max,
      0,
    );
    const costEvidence = findCostEvidence({
      action,
      powerCosts: params.powerCosts,
      itemCosts: params.itemCosts,
    });
    const costValue = costEvidence.availableCost;
    if (costValue !== null && expectedRawWounds > 0) {
      costEvidence.costPerExpectedRaw = costValue / expectedRawWounds;
    }
    if (costValue !== null && maxRawWounds > 0) {
      costEvidence.costPerMaxRaw = costValue / maxRawWounds;
    }
    const p20 = probabilityRawAtLeast(distribution, woundsPerSuccess, 20);
    if (costValue !== null && p20 > 0) {
      costEvidence.costPerP20Point = costValue / (p20 * 100);
    }

    const noCostEvidence = costEvidence.availableCost === null && costEvidence.itemOutputBand === null;
    const adequacyJudgement: FocusedProfile["adequacyJudgement"] =
      noCostEvidence
        ? "disconnected/no cost evidence"
        : costEvidence.kind === "equippedWeapon"
          ? "maybe priced"
          : expectedRawWounds >= 18 && (costValue ?? 0) < 40
            ? "underpriced risk"
            : "maybe priced";

    return [{
      focusKey: key,
      assetType: params.assetType,
      assetId: params.actor.id,
      assetName: params.actor.name,
      level: params.actor.level,
      attackId: action.id,
      attackName: action.name,
      sourceType: action.sourceType,
      sourcePowerId: sourcePowerKey(action),
      actionType: action.kind,
      cooldownRounds: action.cooldownRounds,
      rangeCategory: action.rangeCategory ?? null,
      targetCount: action.targetCount ?? null,
      targetPolicy: action.targetPolicy,
      primarySecondarySummary: action.secondaryActions?.length
        ? `${action.secondaryActions.length} secondary action(s): ${action.secondaryActions.map((entry) => entry.name).join(", ")}`
        : "primary only",
      useResourceSummary: action.sourceType === "signatureMove"
        ? "Signature Move slot; separate level x 20 pool; Combat Lab cooldown derived from same resolver"
        : action.source?.power?.commitmentModifier
          ? `${action.source.power.descriptorChassis ?? "UNKNOWN"} / ${action.source.power.commitmentModifier}${action.source.power.chargeType ? ` / ${action.source.power.chargeType}` : ""}`
          : "at-will / no resource metadata found",
      accuracyAttribute: action.accuracyAttribute,
      die,
      diceCount,
      modifier,
      woundsPerSuccess,
      expectedSuccesses,
      expectedRawWounds,
      maxRawWounds,
      p10Raw: probabilityRawAtLeast(distribution, woundsPerSuccess, 10),
      p16Raw: probabilityRawAtLeast(distribution, woundsPerSuccess, 16),
      p20Raw: p20,
      multipleOfMediumExpectedRaw:
        params.mediumExpectedRaw && params.mediumExpectedRaw > 0
          ? expectedRawWounds / params.mediumExpectedRaw
          : null,
      costEvidence,
      adequacyJudgement,
      hydrationWarnings: params.warnings,
    }];
  });
}

async function buildPayload(): Promise<Payload> {
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
                itemTemplate: { include: ITEM_TEMPLATE_INCLUDE },
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
  const monsterItems = monsterItemIds.length > 0
    ? await prisma.itemTemplate.findMany({
        where: { campaignId: campaign.id, id: { in: monsterItemIds } },
        include: ITEM_TEMPLATE_INCLUDE,
      })
    : [];
  const monsterEquipmentById = new Map(monsterItems.map((item) => [item.id, itemTemplateToSummoningEquipmentItem(item as any)]));

  const characterData = characters.map((row) => {
    const builderData = normalizeBuilderData(row.builderData);
    const powerCosts = new Map<string, CostEvidence>();
    for (const power of builderData.powers) {
      addPowerCostEvidence({
        map: powerCosts,
        power: power as Power,
        kind: "power",
        powerTuning: tuning.powerSnapshot,
        level: row.level,
        scalar: tuning.characterBuilder.playerPowerSpendScalar,
      });
    }
    if (builderData.signatureMove) {
      addPowerCostEvidence({
        map: powerCosts,
        power: builderData.signatureMove as Power,
        kind: "signatureMove",
        powerTuning: tuning.powerSnapshot,
        level: row.level,
        scalar: tuning.characterBuilder.playerPowerSpendScalar,
      });
    }
    const itemCosts = new Map<string, CostEvidence>();
    for (const backpackItem of row.backpackItems ?? []) {
      const item = backpackItem.partyInventoryItem?.itemTemplate;
      if (item) addItemCostEvidence({ map: itemCosts, backpackItemId: backpackItem.id, item });
    }
    const adapted = adaptCampaignCharacterToCombatActor(row as CharacterRow, tuning.combatValues, tuning.powerSnapshot);
    return {
      row,
      actor: adapted.actor,
      warnings: warningsToStrings(adapted.warnings),
      powerCosts,
      itemCosts,
    };
  });

  const monsterData = monsters.map((row) => {
    const powerCosts = new Map<string, CostEvidence>();
    for (const power of row.powers ?? []) {
      addPowerCostEvidence({
        map: powerCosts,
        power: power as unknown as Power,
        kind: "power",
        powerTuning: tuning.powerSnapshot,
        level: row.level,
        scalar: tuning.characterBuilder.playerPowerSpendScalar,
        tier: row.tier,
      });
    }
    const adapted = adaptMonsterToCombatLabActor(row as MonsterRow, monsterEquipmentById, tuning.combatValues, tuning.powerSnapshot);
    return {
      row,
      actor: adapted.actor,
      warnings: warningsToStrings(adapted.warnings),
      powerCosts,
      itemCosts: new Map<string, CostEvidence>(),
    };
  });

  const mediumActor = monsterData.find((entry) => entry.actor.name === OFFICIAL_MEDIUM_BENCHMARK)?.actor ??
    characterData.find((entry) => entry.actor.name === OFFICIAL_MEDIUM_BENCHMARK)?.actor;
  const mediumAction = mediumActor?.actions.find((action) => action.kind === "attack" && action.supported);
  const mediumExpectedRaw = mediumActor && mediumAction
    ? expectedFromDistribution(successDistribution(mediumAction.diceCount, mediumActor.attributeDice[mediumAction.accuracyAttribute] ?? "D8", 0)) *
      actionWoundsPerSuccess(mediumAction)
    : null;

  const focusedProfiles = [
    ...characterData.flatMap((entry) => collectFocusedProfiles({
      actor: entry.actor,
      assetType: "character" as const,
      powerCosts: entry.powerCosts,
      itemCosts: entry.itemCosts,
      warnings: entry.warnings,
      mediumExpectedRaw,
    })),
    ...monsterData.flatMap((entry) => collectFocusedProfiles({
      actor: entry.actor,
      assetType: "monster" as const,
      powerCosts: entry.powerCosts,
      itemCosts: entry.itemCosts,
      warnings: entry.warnings,
      mediumExpectedRaw,
    })),
  ].sort((left, right) => FOCUS.findIndex((focus) => focus.key === left.focusKey) - FOCUS.findIndex((focus) => focus.key === right.focusKey));

  const foundKeys = new Set(focusedProfiles.map((profile) => profile.focusKey));
  const warnings = FOCUS
    .filter((focus) => !foundKeys.has(focus.key))
    .map((focus) => `Focused profile not found: ${focus.asset} / ${focus.action || "(first attack)"}`);

  return {
    title: "Balance Environment Level 3 Offence Costing Audit",
    campaignId: campaign.id,
    campaignName: campaign.name,
    repoHead: runGit(["rev-parse", "HEAD"]),
    gitStatus: runGit(["status", "--short", "--untracked-files=all"]),
    exactCommand: exactCommand(),
    mutation: "none",
    databaseAccess: "read-only",
    seeders: "none",
    assetSource: "balance-campaign-authored",
    activeTuning: {
      ...tuning.activeTuning,
      characterBuilder: tuning.characterBuilder,
    },
    doctrine: "Raw output enumerates current Combat Lab success helper: natural 1 = 0; natural 2-3 may be rescued by modifiers where modifiers apply; natural 4-9 = 1; modified natural success 10+ = 2; max 2 successes per die. This audit uses unmodified raw rows.",
    focusedProfiles,
    warnings,
  };
}

function fmt(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function printHuman(payload: Payload) {
  console.log(payload.title);
  console.log(`Campaign: ${payload.campaignName} (${payload.campaignId})`);
  console.log(`Repo HEAD: ${payload.repoHead}`);
  console.log(`Git status: ${payload.gitStatus ? "dirty" : "clean"}`);
  console.log(`Exact command: ${payload.exactCommand}`);
  console.log(`Power tuning: ${payload.activeTuning.power.name} (${payload.activeTuning.power.slug})`);
  console.log(`Combat tuning: ${payload.activeTuning.combat.name} (${payload.activeTuning.combat.slug})`);
  console.log(`Character Builder scalar: ${payload.activeTuning.characterBuilder.playerPowerSpendScalar} (${payload.activeTuning.characterBuilder.fallbackUsed ? "fallback" : payload.activeTuning.characterBuilder.id})`);
  console.log(`Mutation: ${payload.mutation}; database: ${payload.databaseAccess}; seeders: ${payload.seeders}`);
  console.log(`Doctrine: ${payload.doctrine}`);
  if (payload.warnings.length > 0) {
    console.log("Warnings:");
    payload.warnings.forEach((warning) => console.log(`- ${warning}`));
  }
  console.log("");
  console.log([
    "Profile".padEnd(29),
    "Asset".padEnd(30),
    "Action".padEnd(32),
    "Src".padEnd(14),
    "Dice".padEnd(9),
    "W/S".padStart(4),
    "Exp".padStart(7),
    "Max".padStart(6),
    "P20".padStart(7),
    "xMed".padStart(6),
    "Cost".padStart(7),
    "CostSrc".padEnd(24),
    "Judge".padEnd(22),
  ].join(" | "));
  console.log("-".repeat(220));
  for (const profile of payload.focusedProfiles) {
    console.log([
      profile.focusKey.slice(0, 29).padEnd(29),
      profile.assetName.slice(0, 30).padEnd(30),
      profile.attackName.slice(0, 32).padEnd(32),
      profile.sourceType.slice(0, 14).padEnd(14),
      `${profile.diceCount}x${profile.die}`.padEnd(9),
      String(profile.woundsPerSuccess).padStart(4),
      fmt(profile.expectedRawWounds).padStart(7),
      fmt(profile.maxRawWounds).padStart(6),
      `${fmt(profile.p20Raw * 100, 1)}%`.padStart(7),
      fmt(profile.multipleOfMediumExpectedRaw).padStart(6),
      fmt(profile.costEvidence.availableCost).padStart(7),
      profile.costEvidence.costSource.slice(0, 24).padEnd(24),
      profile.adequacyJudgement.padEnd(22),
    ].join(" | "));
  }
  console.log("");
  console.log("Detailed cost evidence:");
  for (const profile of payload.focusedProfiles) {
    console.log(`- ${profile.assetName} / ${profile.attackName}`);
    console.log(`  delivery: cooldown ${profile.cooldownRounds}, ${profile.rangeCategory ?? "unknown"} targets=${profile.targetCount ?? "-"}, ${profile.primarySecondarySummary}`);
    console.log(`  resource: ${profile.useResourceSummary}`);
    console.log(`  output: expected ${fmt(profile.expectedRawWounds)}, max ${fmt(profile.maxRawWounds)}, P10 ${fmt(profile.p10Raw * 100, 1)}%, P16 ${fmt(profile.p16Raw * 100, 1)}%, P20 ${fmt(profile.p20Raw * 100, 1)}%`);
    console.log(`  cost: ${profile.costEvidence.costSource}; available=${fmt(profile.costEvidence.availableCost)}, basePower=${fmt(profile.costEvidence.basePowerValue)}, spend/raw=${fmt(profile.costEvidence.costPerExpectedRaw)}, itemBand=${profile.costEvidence.itemOutputBand ?? "-"}`);
    if (profile.costEvidence.notes.length > 0) {
      console.log(`  notes: ${profile.costEvidence.notes.join(" ")}`);
    }
  }
}

async function main() {
  prisma = (await import("../prisma/client")).prisma;
  const payload = await buildPayload();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  printHuman(payload);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
