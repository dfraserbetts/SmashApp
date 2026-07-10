import { execFileSync } from "node:child_process";

import { loadEnvConfig } from "@next/env";

import {
  computeMonsterOutcomes,
  computeTraitAxisBonuses,
  type RadarAxes,
  type TraitAxisWeightDefinition,
} from "../lib/calculators/monsterOutcomeCalculator";
import {
  applyCombatTuningToCalculatorConfig,
  normalizeCombatTuning,
  normalizeCombatTuningFlatValues,
} from "../lib/config/combatTuningShared";
import type { DurabilityBaselinePackage } from "../lib/calculators/calculatorConfig";
import {
  normalizeOutcomeNormalizationValues,
  outcomeNormalizationValuesToCalculatorConfig,
} from "../lib/config/outcomeNormalizationShared";
import {
  normalizePowerTuningValues,
  type PowerTuningSnapshot,
} from "../lib/config/powerTuningShared";
import { getWillpowerDiceCountFromAttributes } from "../lib/summoning/attributes";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];

const CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const CAMPAIGN_NAME = "Balance Environment";

const REQUIRED_SAMPLE_NAMES = [
  "BALANCE_Minion Striker",
  "BALANCE_Physical Striker",
  "BALANCE_Durable Soldier",
  "BALANCE_Dodge Pressure Skirmisher",
  "BALANCE_Control Hexer",
  "BALANCE_Support Candidate Pressure Striker",
  "BALANCE_Support Candidate Guard Anchor",
  "BALANCE_Support Candidate Suppression Hexer",
  "BALANCE_Elite Vanguard",
  "BALANCE_Elite Hexer",
  "BALANCE_Legendary Elite Duelist",
  "BALANCE_Legendary Elite Hexer",
  "BALANCE_Legendary Elite Breaker Controller Rotation",
  "BALANCE_Boss Warlord",
  "BALANCE_Boss Hexlord",
  "BALANCE_Boss Behemoth",
  "BALANCE_Legendary Dragon",
  "BALANCE_Legendary Lich",
] as const;

const OPTIONAL_SAMPLE_NAMES = ["BALANCE_Legendary Elite True Hexer"] as const;
const SAMPLE_NAMES = [...REQUIRED_SAMPLE_NAMES, ...OPTIONAL_SAMPLE_NAMES] as const;

const POWER_INCLUDE = {
  rangeCategories: { orderBy: { rangeCategory: "asc" as const } },
  primaryDefenceGate: true,
  effectPackets: {
    orderBy: { packetIndex: "asc" as const },
    include: { localTargetingOverride: true },
  },
};

type MonsterRow = Awaited<ReturnType<typeof loadMonsters>>[number];
type TuningSet = {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: Date;
  entries: Array<{ configKey: string; value: number }>;
};

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function axis(value: Partial<RadarAxes> | null | undefined, key: keyof RadarAxes): number {
  return round(Number(value?.[key] ?? 0));
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>) {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function tuningMetadata(set: TuningSet) {
  return {
    setId: set.id,
    name: set.name,
    slug: set.slug,
    status: set.status,
    updatedAt: set.updatedAt.toISOString(),
  };
}

function buildCalculatorInput(monster: MonsterRow) {
  return {
    ...monster,
    attacks: monster.attacks.map((attack) => ({
      id: attack.id,
      attackMode: attack.attackMode,
      attackName: attack.attackName,
      attackConfig: attack.attackConfig,
    })),
    naturalAttack: monster.naturalAttack
      ? {
          attackName: monster.naturalAttack.attackName,
          attackConfig: monster.naturalAttack.attackConfig,
        }
      : null,
    powers: monster.powers.map((power) => ({
      ...power,
      rangeCategories: power.rangeCategories.map((range) => range.rangeCategory),
      intentions: power.effectPackets.map((packet) => ({
        ...packet,
        detailsJson: packet.detailsJson,
        localTargetingOverride: packet.localTargetingOverride,
      })),
    })),
  };
}

function traitDefinitions(monster: MonsterRow): TraitAxisWeightDefinition[] {
  return monster.traits.map(({ trait }) => ({
    band: trait.band,
    physicalThreatWeight: trait.physicalThreatWeight,
    mentalThreatWeight: trait.mentalThreatWeight,
    physicalSurvivabilityWeight: trait.physicalSurvivabilityWeight,
    mentalSurvivabilityWeight: trait.mentalSurvivabilityWeight,
    survivabilityWeight: trait.survivabilityWeight,
    manipulationWeight: trait.manipulationWeight,
    synergyWeight: trait.synergyWeight,
    mobilityWeight: trait.mobilityWeight,
    presenceWeight: trait.presenceWeight,
  }));
}

function equippedItemIds(monster: MonsterRow): string[] {
  return [
    monster.equippedWeaponId,
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
  ].filter((id): id is string => Boolean(id));
}

function powerIntentions(monster: MonsterRow, intention: string): string[] {
  return monster.powers
    .filter((power) => power.effectPackets.some((packet) => packet.intention === intention))
    .map((power) => power.name);
}

function naturalAttackEffectNames(monster: MonsterRow): string[] {
  const names = new Set<string>();
  const attacks = monster.attacks.length > 0
    ? monster.attacks
    : monster.naturalAttack
      ? [{ attackConfig: monster.naturalAttack.attackConfig }]
      : [];
  for (const attack of attacks) {
    const config = asRecord(attack.attackConfig);
    for (const range of ["melee", "ranged", "aoe"] as const) {
      const profile = asRecord(config[range]);
      const effects = Array.isArray(profile.attackEffects) ? profile.attackEffects : [];
      for (const effect of effects) {
        if (typeof effect === "string" && effect.trim()) names.add(effect.trim());
      }
    }
  }
  return [...names].sort();
}

function summarizeMonster(
  monster: MonsterRow,
  tuning: Awaited<ReturnType<typeof loadActiveTuning>>,
) {
  const calculatorInput = buildCalculatorInput(monster);
  const powerCosts = resolvePowerCosts(
    calculatorInput.powers as unknown as Parameters<typeof resolvePowerCosts>[0],
    tuning.powerSnapshot,
    { level: monster.level, tier: monster.tier },
  );
  const traits = computeTraitAxisBonuses(traitDefinitions(monster), monster.level);
  const outcome = computeMonsterOutcomes(
    calculatorInput as unknown as Parameters<typeof computeMonsterOutcomes>[0],
    tuning.calculatorConfig,
    {
      protectionTuning: tuning.combatValues,
      powerContribution: {
        axisVector: powerCosts.totals.axisVector,
        basePowerValue: powerCosts.totals.basePowerValue,
        powerCount: powerCosts.powers.length,
        powers: powerCosts.powers.map((power) => ({
          id: power.powerId ?? null,
          name: power.name,
          axisVector: power.breakdown.axisVector,
          basePowerValue: power.breakdown.basePowerValue,
          authoredPower:
            (calculatorInput.powers.find(
              (authoredPower) =>
                authoredPower.id === power.powerId || authoredPower.name === power.name,
            ) ?? null) as unknown as Parameters<typeof resolvePowerCosts>[0][number] | null,
          derivedCooldownTurns: power.derivedCooldownTurns,
          derivedCooldownLoad: power.derivedCooldown.cooldownLoad,
          cooldownTurns: power.cooldownTurns,
          cooldownReduction: power.cooldownReduction,
        })),
        debug: powerCosts,
      },
      traitAxisBonuses: traits,
    },
  );

  const debug = asRecord(outcome.debug);
  const nonPowerDebug = asRecord(debug.nonPowerContribution);
  const nonPowerSources = asRecord(nonPowerDebug.sources);
  const finalPreNormalizationAxes = asRecord(debug.finalPreNormalizationAxes);
  const normalization = asRecord(debug.normalizationBreakdown);
  const durabilityBaselineModel = asRecord(normalization.durabilityAxisBaselineModel);
  const physicalDurabilityModel = asRecord(durabilityBaselineModel.physicalSurvivability);
  const mentalDurabilityModel = asRecord(durabilityBaselineModel.mentalSurvivability);
  const curvePoints = asRecord(normalization.curvePoints);
  const physicalCurve = asRecord(curvePoints.physicalSurvivability);
  const mentalCurve = asRecord(curvePoints.mentalSurvivability);
  const rawBudgetTargets = asRecord(nonPowerSources.rawSurvivabilityBudgetTargets);
  const poolHealth = asRecord(debug.poolHealthBreakdown);
  const physicalPoolLane = asRecord(poolHealth.physicalLane);
  const mentalPoolLane = asRecord(poolHealth.mentalLane);
  const defensiveTotals = asRecord(nonPowerSources.defensiveProfileTotals);
  const defensiveAxis = asRecord(nonPowerSources.defensiveProfileContribution);
  const sharedDodgeAxis = asRecord(nonPowerSources.defensiveSharedDodgeContribution);
  const c14Bonus = asRecord(nonPowerSources.c14LegendaryDurabilityBonus);
  const customLimitBreak = asRecord(nonPowerSources.customLimitBreakAxisBonuses);
  const powerDebug = asRecord(debug.powerContribution);
  const effectivePower = asRecord(powerDebug.effectivePowerAxisVector);
  const itemIds = equippedItemIds(monster);
  const willpowerDice = getWillpowerDiceCountFromAttributes(
    monster.synergyDie,
    monster.braveryDie,
    tuning.combatValues,
  );
  const passivePowerNames = monster.powers
    .filter((power) => power.lifespanType === "PASSIVE")
    .map((power) => power.name);

  return {
    name: monster.name,
    id: monster.id,
    level: monster.level,
    tier: monster.tier,
    legendary: monster.legendary,
    defeatModel: monster.legendary ? "LEGENDARY_MONSTER" : "NORMAL_MONSTER",
    pools: {
      physicalHp: monster.physicalResilienceMax,
      mentalHp: monster.mentalPerseveranceMax,
      expectedPhysicalHp: round(asNumber(poolHealth.expectedPhysicalResilience)),
      expectedMentalHp: round(asNumber(poolHealth.expectedMentalPerseverance)),
      physicalRatio: round(asNumber(poolHealth.physicalPoolRatio), 3),
      mentalRatio: round(asNumber(poolHealth.mentalPoolRatio), 3),
      physicalRawBonus: round(asNumber(physicalPoolLane.rawBonus)),
      mentalRawBonus: round(asNumber(mentalPoolLane.rawBonus)),
    },
    protection: {
      physical: monster.physicalProtection,
      mental: monster.mentalProtection,
      naturalPhysical: monster.naturalPhysicalProtection,
      naturalMental: monster.naturalMentalProtection,
    },
    attributes: {
      guard: monster.guardDie,
      fortitude: monster.fortitudeDie,
      intellect: monster.intellectDie,
      synergy: monster.synergyDie,
      bravery: monster.braveryDie,
      armorSkillValue: monster.armorSkillValue,
    },
    resists: {
      attack: monster.attackResistDie,
      guard: monster.guardResistDie,
      fortitude: monster.fortitudeResistDie,
      intellect: monster.intellectResistDie,
      synergy: monster.synergyResistDie,
      bravery: monster.braveryResistDie,
    },
    defence: {
      authoredDodgeDice: asNumber(defensiveTotals.authoredDodgeDice),
      unarmoredDodgeDice: asNumber(defensiveTotals.unarmoredDodgeDice),
      scoringDodgeDice: asNumber(defensiveTotals.scoringDodgeDice),
      expectedDodgeDice: asNumber(defensiveTotals.expectedDodgeDice),
      armorSkillDice: monster.armorSkillValue,
      willpowerDice,
      physicalBlockPerSuccess: asNumber(defensiveTotals.physicalBlockPerSuccess),
      mentalBlockPerSuccess: asNumber(defensiveTotals.mentalBlockPerSuccess),
      physicalDodgeRawBonus: round(asNumber(sharedDodgeAxis.physicalSurvivability)),
      mentalDodgeRawBonus: round(asNumber(sharedDodgeAxis.mentalSurvivability)),
      physicalProtectionRawBonus: round(asNumber(defensiveAxis.physicalSurvivability)),
      mentalProtectionRawBonus: round(asNumber(defensiveAxis.mentalSurvivability)),
      guardResistRawBonus: round(asNumber(nonPowerSources.defenceResistContribution)),
      fortitudeResistRawBonus: round(asNumber(nonPowerSources.fortitudeResistContribution)),
    },
    otherDurability: {
      traitPhysicalRawBonus: round(traits.physicalSurvivability),
      traitMentalRawBonus: round(traits.mentalSurvivability),
      effectivePowerPhysicalRawBonus: round(asNumber(effectivePower.physicalSurvivability)),
      effectivePowerMentalRawBonus: round(asNumber(effectivePower.mentalSurvivability)),
      c14PhysicalRawBonus: round(asNumber(c14Bonus.physicalSurvivability)),
      c14MentalRawBonus: round(asNumber(c14Bonus.mentalSurvivability)),
      limitBreakPhysicalRawBonus: round(asNumber(customLimitBreak.physicalSurvivability)),
      limitBreakMentalRawBonus: round(asNumber(customLimitBreak.mentalSurvivability)),
      healingPowers: powerIntentions(monster, "HEALING"),
      passivePowers: passivePowerNames,
      naturalAttackEffects: naturalAttackEffectNames(monster),
      equippedItemIds: itemIds,
      equipmentAxisCoverage:
        itemIds.length === 0
          ? "no equipped item IDs"
          : "aggregate protection is included; editor-only equipment modifier bonuses are not reproduced",
    },
    raw: {
      physicalBudgetTarget: round(asNumber(rawBudgetTargets.physicalSurvivability)),
      mentalBudgetTarget: round(asNumber(rawBudgetTargets.mentalSurvivability)),
      physical: round(asNumber(finalPreNormalizationAxes.physicalSurvivability)),
      mental: round(asNumber(finalPreNormalizationAxes.mentalSurvivability)),
    },
    normalization: {
      tierKey: String(normalization.tierKey ?? "unknown"),
      tierMultiplier: round(asNumber(normalization.tierMultiplier)),
      physicalCurve: {
        min: round(asNumber(physicalCurve.min)),
        max: round(asNumber(physicalCurve.max)),
        tierAdjustedMax: round(
          asNumber(physicalCurve.max) * asNumber(normalization.tierMultiplier),
        ),
      },
      mentalCurve: {
        min: round(asNumber(mentalCurve.min)),
        max: round(asNumber(mentalCurve.max)),
        tierAdjustedMax: round(
          asNumber(mentalCurve.max) * asNumber(normalization.tierMultiplier),
        ),
      },
    },
    durabilityBaseline: {
      model: String(physicalDurabilityModel.model ?? "legacy-level-curve"),
      packageId: String(physicalDurabilityModel.baselinePackageId ?? "legacy-fallback"),
      fallback: Boolean(durabilityBaselineModel.fallback),
      physical: physicalDurabilityModel,
      mental: mentalDurabilityModel,
    },
    axis: {
      physicalThreat: axis(outcome.radarAxes, "physicalThreat"),
      mentalThreat: axis(outcome.radarAxes, "mentalThreat"),
      physical: axis(outcome.radarAxes, "physicalSurvivability"),
      mental: axis(outcome.radarAxes, "mentalSurvivability"),
      physicalCapped: outcome.radarAxes.physicalSurvivability >= 10,
      mentalCapped: outcome.radarAxes.mentalSurvivability >= 10,
    },
    traits: monster.traits.map(({ trait }) => ({
      name: trait.name,
      band: trait.band,
      physicalSurvivabilityWeight: trait.physicalSurvivabilityWeight,
      mentalSurvivabilityWeight: trait.mentalSurvivabilityWeight,
      survivabilityWeight: trait.survivabilityWeight,
    })),
  };
}

function dieFromSides(sides: number): "D4" | "D6" | "D8" | "D10" | "D12" {
  if (sides >= 12) return "D12";
  if (sides >= 10) return "D10";
  if (sides >= 8) return "D8";
  if (sides >= 6) return "D6";
  return "D4";
}

function summarizeBaselineAnchor(
  baseline: DurabilityBaselinePackage,
  tuning: Awaited<ReturnType<typeof loadActiveTuning>>,
) {
  const physical = baseline.physical;
  const mental = baseline.mental;
  const input = {
    level: baseline.level,
    tier: baseline.tier,
    legendary: baseline.legendary,
    attackDie: dieFromSides(physical.representativeInjuryDieSides),
    weaponSkillValue: 1,
    weaponSkillModifier: 0,
    attackResistDie: 0,
    attacks: [],
    guardDie: dieFromSides(physical.expectedDefenceDieSides),
    guardResistDie: 0,
    fortitudeDie: "D4",
    fortitudeResistDie: 0,
    intellectDie: dieFromSides(mental.representativeInjuryDieSides),
    intellectResistDie: 0,
    synergyDie: "D4",
    synergyResistDie: 0,
    braveryDie: dieFromSides(mental.expectedDefenceDieSides),
    braveryResistDie: 0,
    naturalAttack: null,
    naturalPhysicalProtection: physical.expectedProtection,
    naturalMentalProtection: mental.expectedProtection,
    powers: [],
    physicalResilienceMax: physical.expectedHp,
    mentalPerseveranceMax: mental.expectedHp,
    physicalProtection: physical.expectedProtection,
    mentalProtection: mental.expectedProtection,
    armorSkillValue: physical.expectedDefenceDice,
    limitBreakAttribute: null,
    limitBreakTier: null,
    limitBreak2Attribute: null,
    limitBreak2Tier: null,
  };
  const outcome = computeMonsterOutcomes(
    input as unknown as Parameters<typeof computeMonsterOutcomes>[0],
    tuning.calculatorConfig,
    {
      protectionTuning: tuning.combatValues,
      defensiveProfileSources: [
        {
          sourceKind: "natural",
          sourceLabel: baseline.id,
          physicalProtection: physical.expectedProtection,
          mentalProtection: mental.expectedProtection,
        },
      ],
      defensiveProfileContext: {
        totalPhysicalProtection: physical.expectedProtection,
        totalMentalProtection: mental.expectedProtection,
        armorSkillDice: physical.expectedDefenceDice,
        willpowerDice: mental.expectedDefenceDice,
        dodgeDice: physical.expectedDodgeDice,
        unarmoredDodgeDice: physical.expectedDodgeDice,
      },
    },
  );
  const debug = asRecord(outcome.debug);
  const normalization = asRecord(debug.normalizationBreakdown);
  const durability = asRecord(normalization.durabilityAxisBaselineModel);
  return {
    id: baseline.id,
    level: baseline.level,
    tier: baseline.tier,
    legendary: baseline.legendary,
    physicalScore: axis(outcome.radarAxes, "physicalSurvivability"),
    mentalScore: axis(outcome.radarAxes, "mentalSurvivability"),
    physical: asRecord(durability.physicalSurvivability),
    mental: asRecord(durability.mentalSurvivability),
  };
}

async function loadActiveTuning(prisma: PrismaClientInstance) {
  const [powerSet, combatSet, outcomeSet] = await Promise.all([
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
    prisma.outcomeNormalizationConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
  ]);
  if (!powerSet || !combatSet || !outcomeSet) {
    throw new Error("Missing ACTIVE Power, Combat, or Outcome Normalization tuning set.");
  }

  const powerSnapshot: PowerTuningSnapshot = {
    setId: powerSet.id,
    name: powerSet.name,
    slug: powerSet.slug,
    status: powerSet.status,
    updatedAt: powerSet.updatedAt.toISOString(),
    values: normalizePowerTuningValues(entriesToRecord(powerSet.entries)),
  };
  const combatValues = normalizeCombatTuning(
    normalizeCombatTuningFlatValues(entriesToRecord(combatSet.entries)),
  );
  const outcomeValues = normalizeOutcomeNormalizationValues(entriesToRecord(outcomeSet.entries));
  const calculatorConfig = applyCombatTuningToCalculatorConfig(
    outcomeNormalizationValuesToCalculatorConfig(outcomeValues),
    combatValues,
  );

  return {
    powerSnapshot,
    combatValues,
    calculatorConfig,
    metadata: {
      power: tuningMetadata(powerSet),
      combat: tuningMetadata(combatSet),
      outcomeNormalization: tuningMetadata(outcomeSet),
    },
  };
}

async function loadMonsters(prisma: PrismaClientInstance) {
  return prisma.monster.findMany({
    where: {
      campaignId: CAMPAIGN_ID,
      name: { in: [...SAMPLE_NAMES] },
    },
    orderBy: { name: "asc" },
    include: {
      naturalAttack: true,
      attacks: { orderBy: { sortOrder: "asc" } },
      traits: { include: { trait: true }, orderBy: { sortOrder: "asc" } },
      powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
    },
  });
}

function buildPayload(params: {
  repoHead: string;
  gitStatus: string;
  tuning: Awaited<ReturnType<typeof loadActiveTuning>>;
  samples: ReturnType<typeof summarizeMonster>[];
  missingRequired: string[];
  missingOptional: string[];
}) {
  const level3PhysicalCurve = params.tuning.calculatorConfig.scoringCurves.physicalSurvivability.find(
    (point) => point.level === 3,
  );
  const level3MentalCurve = params.tuning.calculatorConfig.scoringCurves.mentalSurvivability.find(
    (point) => point.level === 3,
  );
  const baselineAnchors = params.tuning.calculatorConfig.durabilityAxisTuning.baselines
    .filter((baseline) => baseline.level === 3)
    .map((baseline) => summarizeBaselineAnchor(baseline, params.tuning));
  return {
    title: "Summoning Circle durability-axis reconciliation",
    provenance: {
      repoHead: params.repoHead,
      gitStatus: params.gitStatus,
      campaignId: CAMPAIGN_ID,
      campaignName: CAMPAIGN_NAME,
      assetSource: "balance-campaign-authored",
      databaseAccess: "read-only",
      mutation: "none",
      activeTuning: params.tuning.metadata,
    },
    modelNotes: {
      axisFields: ["physicalSurvivability", "mentalSurvivability"],
      normalization:
        "Level 3 accepted-package-relative model centered at 5; other levels retain the legacy generic level curve.",
      equipmentCoverage:
        "Top-level aggregate protection is included. Editor-only item modifier axis bonuses are omitted and flagged when equipment IDs exist.",
      regenerationCoverage:
        "No dedicated monster regeneration field exists in the inspected schema. Authored healing/passive powers are listed and their resolver axis contribution is included.",
      legendaryCoverage:
        "Level 3 Legendary packages use deterministic three-die Major Injury probability with event-local overflow and no automatic Blaze credit. The flat C14 bonus remains only in the legacy fallback.",
    },
    activeDurabilityTuning: {
      displayTierMultipliers: params.tuning.calculatorConfig.tierMultipliers,
      level3DisplayCurves: {
        physicalSurvivability: level3PhysicalCurve,
        mentalSurvivability: level3MentalCurve,
      },
      healthPoolTuning: params.tuning.calculatorConfig.healthPoolTuning,
      durabilityAxisTuning: params.tuning.calculatorConfig.durabilityAxisTuning,
      rawSurvivabilityBudget: {
        physicalAt1: params.tuning.combatValues.rawPhysicalSurvivabilityBudgetAt1,
        physicalPerLevel: params.tuning.combatValues.rawPhysicalSurvivabilityBudgetPerLevel,
        mentalAt1: params.tuning.combatValues.rawMentalSurvivabilityBudgetAt1,
        mentalPerLevel: params.tuning.combatValues.rawMentalSurvivabilityBudgetPerLevel,
        minionMultiplier: params.tuning.combatValues.rawSurvivabilityBudgetMinionMultiplier,
        soldierMultiplier: params.tuning.combatValues.rawSurvivabilityBudgetSoldierMultiplier,
        eliteMultiplier: params.tuning.combatValues.rawSurvivabilityBudgetEliteMultiplier,
        bossMultiplier: params.tuning.combatValues.rawSurvivabilityBudgetBossMultiplier,
        legendaryMultiplier: params.tuning.combatValues.rawSurvivabilityBudgetLegendaryMultiplier,
        calculatorNumeratorReferenceLevel: 1,
      },
      defensiveStringTuning: {
        protectionK: params.tuning.combatValues.protectionK,
        protectionS: params.tuning.combatValues.protectionS,
        physicalOutputScale: params.tuning.combatValues.defenceStringProtectionOutputScale,
        physicalOutputMaxShare:
          params.tuning.combatValues.defenceStringProtectionOutputMaxShare,
        mentalOutputScale:
          params.tuning.combatValues.mentalDefenceStringProtectionOutputScale,
        mentalOutputMaxShare:
          params.tuning.combatValues.mentalDefenceStringProtectionOutputMaxShare,
        dodgeBaselineScale: params.tuning.combatValues.dodgeBaselineScale,
        dodgeBaselineMaxShare: params.tuning.combatValues.dodgeBaselineMaxShare,
        dodgeParityScale: params.tuning.combatValues.dodgeParityScale,
        dodgeParityMaxShare: params.tuning.combatValues.dodgeParityMaxShare,
        dodgeAboveExpectedScale: params.tuning.combatValues.dodgeAboveExpectedScale,
        dodgeAboveExpectedMaxShare:
          params.tuning.combatValues.dodgeAboveExpectedMaxShare,
        dodgeExtremeAboveExpectedScale:
          params.tuning.combatValues.dodgeExtremeAboveExpectedScale,
        dodgeExtremeAboveExpectedMaxShare:
          params.tuning.combatValues.dodgeExtremeAboveExpectedMaxShare,
        dodgeTotalMaxShare: params.tuning.combatValues.dodgeTotalMaxShare,
      },
    },
    missingRequired: params.missingRequired,
    missingOptional: params.missingOptional,
    baselineAnchors,
    samples: params.samples,
  };
}

function printHuman(payload: ReturnType<typeof buildPayload>) {
  console.log(payload.title);
  console.log(`campaignId=${payload.provenance.campaignId}`);
  console.log(`campaignName=${payload.provenance.campaignName}`);
  console.log(`assetSource=${payload.provenance.assetSource}`);
  console.log(`repoHead=${payload.provenance.repoHead}`);
  console.log(`gitStatus=${payload.provenance.gitStatus}`);
  console.log("databaseAccess=read-only; mutation=none");
  console.log(
    `tuning=${payload.provenance.activeTuning.power.name} | ${payload.provenance.activeTuning.combat.name} | ${payload.provenance.activeTuning.outcomeNormalization.name}`,
  );
  console.log(
    `level3Curves physical=${payload.activeDurabilityTuning.level3DisplayCurves.physicalSurvivability?.min}/${payload.activeDurabilityTuning.level3DisplayCurves.physicalSurvivability?.max} mental=${payload.activeDurabilityTuning.level3DisplayCurves.mentalSurvivability?.min}/${payload.activeDurabilityTuning.level3DisplayCurves.mentalSurvivability?.max}`,
  );
  console.log(
    `tierMultipliers=${JSON.stringify(payload.activeDurabilityTuning.displayTierMultipliers)}`,
  );
  console.log("");
  console.log("Level 3 accepted-package anchors:");
  for (const anchor of payload.baselineAnchors) {
    console.log(
      `- ${anchor.id}: ${anchor.tier}${anchor.legendary ? "+LEG" : ""} physical=${anchor.physicalScore} mental=${anchor.mentalScore}`,
    );
  }
  console.log("");
  console.log(
    "Name | tier/L | HP P/M | Prot P/M | Baseline | Ratio P/M | Axis P/M | Threat P/M | Cap P/M",
  );
  for (const sample of payload.samples) {
    console.log(
      [
        sample.name,
        `${sample.tier}${sample.legendary ? "+LEG" : ""}/L${sample.level}`,
        `${sample.pools.physicalHp}/${sample.pools.mentalHp}`,
        `${sample.protection.physical}/${sample.protection.mental}`,
        sample.durabilityBaseline.packageId,
        `${round(asNumber(sample.durabilityBaseline.physical.ratioToBaseline), 3)}/${round(asNumber(sample.durabilityBaseline.mental.ratioToBaseline), 3)}`,
        `${sample.axis.physical}/${sample.axis.mental}`,
        `${sample.axis.physicalThreat}/${sample.axis.mentalThreat}`,
        `${sample.axis.physicalCapped}/${sample.axis.mentalCapped}`,
      ].join(" | "),
    );
  }
  if (payload.missingRequired.length > 0) {
    console.log(`Missing required samples: ${payload.missingRequired.join(", ")}`);
  }
  if (payload.missingOptional.length > 0) {
    console.log(`Missing optional samples: ${payload.missingOptional.join(", ")}`);
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");
  const json = process.argv.includes("--json");
  const repoHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const gitStatus =
    execFileSync("git", ["status", "--short", "--untracked-files=all"], {
      encoding: "utf8",
    }).trim() || "clean";

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: CAMPAIGN_ID },
      select: { id: true, name: true },
    });
    if (!campaign || campaign.name !== CAMPAIGN_NAME) {
      throw new Error(`Balance Environment campaign identity mismatch for ${CAMPAIGN_ID}.`);
    }
    const [tuning, rows] = await Promise.all([loadActiveTuning(prisma), loadMonsters(prisma)]);
    const foundNames = new Set(rows.map((row) => row.name));
    const missingRequired = REQUIRED_SAMPLE_NAMES.filter((name) => !foundNames.has(name));
    const missingOptional = OPTIONAL_SAMPLE_NAMES.filter((name) => !foundNames.has(name));
    const payload = buildPayload({
      repoHead,
      gitStatus,
      tuning,
      samples: rows.map((row) => summarizeMonster(row, tuning)),
      missingRequired,
      missingOptional,
    });
    if (json) console.log(JSON.stringify(payload, null, 2));
    else printHuman(payload);
    if (missingRequired.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
