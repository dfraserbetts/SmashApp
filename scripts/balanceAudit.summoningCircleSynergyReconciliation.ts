import { loadEnvConfig } from "@next/env";
import { execSync } from "node:child_process";

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
import {
  normalizeOutcomeNormalizationValues,
  outcomeNormalizationValuesToCalculatorConfig,
} from "../lib/config/outcomeNormalizationShared";
import {
  normalizePowerTuningValues,
  type PowerTuningSnapshot,
} from "../lib/config/powerTuningShared";
import { adaptPowerToCombatActions } from "../lib/combat-lab/powerAdapter";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import type { EffectPacket, MonsterUpsertInput, Power } from "../lib/summoning/types";

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];

const CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const CAMPAIGN_NAME = "Balance Environment";
const SAMPLE_NAMES = [
  "BALANCE_Physical Striker",
  "BALANCE_Durable Soldier",
  "BALANCE_Control Hexer",
  "BALANCE_Support Candidate Pressure Striker",
  "BALANCE_Support Candidate Guard Anchor",
  "BALANCE_Support Candidate Suppression Hexer",
  "BALANCE_Legendary Elite Duelist",
  "BALANCE_Legendary Elite Hexer",
  "BALANCE_Legendary Elite True Hexer",
  "BALANCE_Legendary Elite Breaker Controller Rotation",
  "BALANCE_Boss Warlord",
  "BALANCE_Boss Hexlord",
  "BALANCE_Boss Behemoth",
  "BALANCE_Legendary Dragon",
  "BALANCE_Legendary Lich",
] as const;
const SUPPORT_INTENTIONS = new Set(["HEALING", "CLEANSE", "AUGMENT", "SUPPORT"]);

const POWER_INCLUDE = {
  rangeCategories: { orderBy: { rangeCategory: "asc" as const } },
  primaryDefenceGate: true,
  effectPackets: {
    orderBy: { packetIndex: "asc" as const },
    include: { localTargetingOverride: true },
  },
};

type TuningSet = {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: Date;
  entries: Array<{ configKey: string; value: number }>;
};
type LoadedMonster = Awaited<ReturnType<typeof loadMonsters>>[number];

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>) {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function emptyAxes(): RadarAxes {
  return {
    physicalThreat: 0,
    mentalThreat: 0,
    physicalSurvivability: 0,
    mentalSurvivability: 0,
    manipulation: 0,
    synergy: 0,
    mobility: 0,
    presence: 0,
  };
}

function axisValues(value: Partial<RadarAxes> | null | undefined) {
  const axes = { ...emptyAxes(), ...(value ?? {}) };
  return Object.fromEntries(
    Object.entries(axes).map(([key, axisValue]) => [key, round(axisValue)]),
  ) as RadarAxes;
}

function axisDelta(value: RadarAxes, baseline: RadarAxes) {
  return Object.fromEntries(
    (Object.keys(value) as Array<keyof RadarAxes>).map((key) => [
      key,
      round(value[key] - baseline[key]),
    ]),
  ) as RadarAxes;
}

function createPacket(
  intention: EffectPacket["intention"],
  overrides: Partial<EffectPacket> = {},
): EffectPacket {
  return {
    sortOrder: 0,
    packetIndex: 0,
    hostility: ["ATTACK", "CONTROL", "DEBUFF"].includes(intention)
      ? "HOSTILE"
      : "NON_HOSTILE",
    intention,
    type: intention,
    diceCount: 2,
    potency: 1,
    effectTimingType: "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: "INSTANT",
    effectDurationTurns: null,
    applyTo: "ALLIES",
    triggerConditionText: null,
    detailsJson: {},
    ...overrides,
  };
}

function createPower(options: {
  name: string;
  packet: EffectPacket;
  packets?: EffectPacket[];
  targets?: number;
  cooldown?: number;
}): Power {
  const packets = options.packets ?? [options.packet];
  const targets = options.targets ?? 1;
  return {
    sortOrder: 0,
    name: options.name,
    description: null,
    descriptorChassis: "IMMEDIATE",
    descriptorChassisConfig: {},
    cooldownTurns: options.cooldown ?? 2,
    cooldownReduction: 0,
    counterMode: "NO",
    commitmentModifier: "STANDARD",
    attachedHostAnchorType: null,
    lifespanType: "NONE",
    lifespanTurns: null,
    rangeCategories: ["RANGED"],
    meleeTargets: 1,
    rangedDistanceFeet: 30,
    rangedTargets: targets,
    aoeCenterRangeFeet: null,
    aoeCount: 1,
    aoeShape: null,
    aoeSphereRadiusFeet: null,
    aoeConeLengthFeet: null,
    aoeLineWidthFeet: null,
    aoeLineLengthFeet: null,
    primaryDefenceGate: undefined,
    effectPackets: packets,
    intentions: packets,
    diceCount: Number(options.packet.diceCount ?? 1),
    potency: Number(options.packet.potency ?? 1),
    effectDurationType: options.packet.effectDurationType ?? "INSTANT",
    effectDurationTurns: options.packet.effectDurationTurns ?? null,
    durationType: options.packet.effectDurationType ?? "INSTANT",
    durationTurns: options.packet.effectDurationTurns ?? null,
  };
}

function baseMonster(powers: Power[]): MonsterUpsertInput {
  return {
    name: "Synthetic Synergy Evidence",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: 3,
    tier: "SOLDIER",
    legendary: false,
    mainHandItemId: null,
    offHandItemId: null,
    smallItemId: null,
    headArmorItemId: null,
    shoulderArmorItemId: null,
    torsoArmorItemId: null,
    legsArmorItemId: null,
    feetArmorItemId: null,
    headItemId: null,
    neckItemId: null,
    armsItemId: null,
    beltItemId: null,
    customNotes: null,
    limitBreakName: null,
    limitBreakTier: null,
    limitBreakTriggerText: null,
    limitBreakAttribute: null,
    limitBreakThresholdSuccesses: null,
    limitBreakCostText: null,
    limitBreakEffectText: null,
    limitBreak2Name: null,
    limitBreak2Tier: null,
    limitBreak2TriggerText: null,
    limitBreak2Attribute: null,
    limitBreak2ThresholdSuccesses: null,
    limitBreak2CostText: null,
    limitBreak2EffectText: null,
    physicalResilienceCurrent: 20,
    physicalResilienceMax: 20,
    mentalPerseveranceCurrent: 20,
    mentalPerseveranceMax: 20,
    physicalProtection: 0,
    mentalProtection: 0,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 0,
    attackDie: "D8",
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: "D8",
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D8",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D8",
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: "D8",
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: "D8",
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: 0,
    weaponSkillModifier: 0,
    armorSkillValue: 0,
    armorSkillModifier: 0,
    tags: [],
    traits: [],
    attacks: [],
    naturalAttack: null,
    powers,
  };
}

function healingPower(options: {
  name: string;
  applyTo?: EffectPacket["applyTo"];
  targets?: number;
  dice?: number;
  potency?: number;
  duration?: EffectPacket["effectDurationType"];
  durationTurns?: number;
  timing?: EffectPacket["effectTimingType"];
  cooldown?: number;
  linkedDamagePotency?: number;
}) {
  const packet = createPacket("HEALING", {
    applyTo: options.applyTo ?? "ALLIES",
    diceCount: options.dice ?? 2,
    potency: options.potency ?? 1,
    effectDurationType: options.duration ?? "INSTANT",
    effectDurationTurns: options.durationTurns ?? null,
    effectTimingType: options.timing ?? "ON_CAST",
    detailsJson: {
      healingMode: "PHYSICAL",
      rangeCategory: options.applyTo === "SELF" ? "SELF" : "RANGED",
    },
  });
  const packets = [packet];
  if (options.linkedDamagePotency !== undefined) {
    packets.push(
      createPacket("ATTACK", {
        sortOrder: 1,
        packetIndex: 1,
        diceCount: 0,
        potency: options.linkedDamagePotency,
        dealsWounds: true,
        woundChannel: "MENTAL",
        applyTo: "PRIMARY_TARGET",
        secondaryDependencyMode: "LINKED_TO_PRIMARY",
        detailsJson: { attackMode: "MENTAL", damageTypes: ["Psychic"] },
      }),
    );
  }
  return createPower({
    name: options.name,
    packet,
    packets,
    targets: options.targets,
    cooldown: options.cooldown,
  });
}

function cleansePower(name: string, targets: number) {
  const packet = createPacket("CLEANSE", {
    applyTo: "ALLIES",
    diceCount: 2,
    potency: 1,
    detailsJson: { cleanseEffectType: "Damage over time" },
  });
  return createPower({ name, packet, targets, cooldown: 2 });
}

function augmentPower(options: {
  name: string;
  statTarget: string;
  durationTurns: number;
  targets?: number;
}) {
  const packet = createPacket("AUGMENT", {
    applyTo: "ALLIES",
    diceCount: 2,
    potency: 1,
    effectDurationType: "TURNS",
    effectDurationTurns: options.durationTurns,
    detailsJson: { statTarget: options.statTarget },
  });
  return createPower({ name: options.name, packet, targets: options.targets, cooldown: 2 });
}

function unsupportedSupportPower() {
  const packet = createPacket("SUPPORT", {
    applyTo: "ALLIES",
    detailsJson: { unsupportedMode: "Narrative support" },
  });
  return createPower({ name: "Unsupported Generic Support", packet, cooldown: 2 });
}

function runtimeSummary(powers: Power[]) {
  return powers.flatMap((power) => {
    const adapted = adaptPowerToCombatActions(power);
    return adapted.actions.map((action) => ({
      power: power.name,
      actionKind: action.kind,
      targetPolicy: action.targetPolicy,
      diceCount: action.diceCount,
      potency: action.potency,
      durationRounds: action.durationRounds ?? null,
      recurring: action.recurring?.kind ?? null,
      unsupported: adapted.unsupported,
      warnings: adapted.warnings,
    }));
  });
}

function computeFixture(params: {
  id: string;
  description: string;
  powers: Power[];
  tuning: Awaited<ReturnType<typeof loadActiveTuning>>;
  snapshot?: PowerTuningSnapshot;
  derivedCooldownOverrides?: number[];
}) {
  const snapshot = params.snapshot ?? params.tuning.powerSnapshot;
  const costs = resolvePowerCosts(params.powers, snapshot, { level: 3, tier: "SOLDIER" });
  const outcome = computeMonsterOutcomes(baseMonster(params.powers), params.tuning.calculatorConfig, {
    protectionTuning: params.tuning.combatValues,
    powerContribution: {
      axisVector: costs.totals.axisVector,
      basePowerValue: costs.totals.basePowerValue,
      powerCount: costs.powers.length,
      powers: costs.powers.map((power, index) => ({
        id: power.powerId ?? null,
        name: power.name,
        axisVector: power.breakdown.axisVector,
        basePowerValue: power.breakdown.basePowerValue,
        authoredPower: params.powers[index] ?? null,
        derivedCooldownTurns:
          params.derivedCooldownOverrides?.[index] ?? power.derivedCooldownTurns,
        derivedCooldownLoad: power.derivedCooldown.cooldownLoad,
        cooldownTurns: params.powers[index]?.cooldownTurns ?? null,
        cooldownReduction: params.powers[index]?.cooldownReduction ?? 0,
      })),
      debug: costs,
    },
  });
  const debug = asRecord(outcome.debug);
  const finalPre = asRecord(debug.finalPreNormalizationAxes);
  const powerDebug = asRecord(debug.powerContribution);
  const canonical = asRecord(powerDebug.canonicalPowerAxisVector);
  const effective = asRecord(powerDebug.effectivePowerAxisVector);
  return {
    id: params.id,
    description: params.description,
    finalSynergy: round(outcome.radarAxes.synergy),
    rawSynergy: round(asNumber(finalPre.synergy)),
    canonicalResolverSynergy: round(asNumber(canonical.synergy)),
    effectiveResolverSynergy: round(asNumber(effective.synergy)),
    basePowerValue: round(costs.totals.basePowerValue),
    powers: params.powers.map((power, index) => ({
      name: power.name,
      targets: power.rangedTargets ?? 1,
      authoredCooldown: power.cooldownTurns,
      derivedCooldown:
        params.derivedCooldownOverrides?.[index] ?? costs.powers[index]?.derivedCooldownTurns,
      packets: power.intentions.map((packet) => ({
        intention: packet.intention,
        applyTo: packet.applyTo,
        diceCount: packet.diceCount,
        potency: packet.potency,
        duration: packet.effectDurationType,
        durationTurns: packet.effectDurationTurns,
        timing: packet.effectTimingType,
        dependency: packet.secondaryDependencyMode ?? "PRIMARY",
        details: packet.detailsJson,
      })),
    })),
    runtime: runtimeSummary(params.powers),
    radarAxes: axisValues(outcome.radarAxes),
  };
}

function buildFixtures(tuning: Awaited<ReturnType<typeof loadActiveTuning>>) {
  const noSupport = computeFixture({
    id: "no_support",
    description: "No support package",
    powers: [],
    tuning,
  });
  const basicHeal = healingPower({ name: "Allied Heal", targets: 1, dice: 2, cooldown: 2 });
  const duplicateHeal = healingPower({ name: "Renamed Allied Heal", targets: 1, dice: 2, cooldown: 2 });
  const healPlusCleanse = [basicHeal, cleansePower("Distinct Cleanse", 1)];
  const linkedDamage = healingPower({
    name: "Allied Heal With Linked Damage",
    targets: 1,
    dice: 2,
    cooldown: 2,
    linkedDamagePotency: 8,
  });
  const highCostValues = {
    ...tuning.powerSnapshot.values,
    "packet.identity.intention.healing":
      (tuning.powerSnapshot.values["packet.identity.intention.healing"] ?? 1.5) + 8,
  };
  const highCostSnapshot: PowerTuningSnapshot = {
    ...tuning.powerSnapshot,
    values: highCostValues,
  };
  const fixtures = [
    noSupport,
    computeFixture({
      id: "self_heal",
      description: "Self-only physical healing",
      powers: [healingPower({ name: "Self Heal", applyTo: "SELF", targets: 1 })],
      tuning,
    }),
    computeFixture({ id: "ally_heal_one", description: "One-target allied healing", powers: [basicHeal], tuning }),
    computeFixture({
      id: "ally_heal_three",
      description: "Three-target allied healing",
      powers: [healingPower({ name: "Group Heal", targets: 3, dice: 2 })],
      tuning,
    }),
    computeFixture({
      id: "heal_small",
      description: "Small allied healing magnitude",
      powers: [healingPower({ name: "Small Heal", targets: 1, dice: 1, potency: 1 })],
      tuning,
    }),
    computeFixture({
      id: "heal_large",
      description: "Large allied healing magnitude",
      powers: [healingPower({ name: "Large Heal", targets: 1, dice: 5, potency: 3 })],
      tuning,
    }),
    computeFixture({
      id: "heal_one_shot",
      description: "One-shot allied healing",
      powers: [healingPower({ name: "One Shot Heal", duration: "INSTANT", timing: "ON_CAST" })],
      tuning,
    }),
    computeFixture({
      id: "heal_recurring",
      description: "Recurring two-turn allied healing",
      powers: [healingPower({
        name: "Recurring Heal",
        duration: "TURNS",
        durationTurns: 2,
        timing: "START_OF_TURN",
      })],
      tuning,
    }),
    computeFixture({
      id: "heal_short_cooldown",
      description: "Allied healing with forced short derived cooldown",
      powers: [healingPower({ name: "Short Cooldown Heal" })],
      tuning,
      derivedCooldownOverrides: [1],
    }),
    computeFixture({
      id: "heal_long_cooldown",
      description: "Allied healing with forced long derived cooldown",
      powers: [healingPower({ name: "Long Cooldown Heal" })],
      tuning,
      derivedCooldownOverrides: [5],
    }),
    computeFixture({
      id: "cleanse_one",
      description: "One-target Cleanse",
      powers: [cleansePower("Single Cleanse", 1)],
      tuning,
    }),
    computeFixture({
      id: "cleanse_three",
      description: "Three-target Cleanse",
      powers: [cleansePower("Group Cleanse", 3)],
      tuning,
    }),
    computeFixture({
      id: "augment_defensive",
      description: "Two-turn allied Guard Augment",
      powers: [augmentPower({ name: "Guard Augment", statTarget: "Guard", durationTurns: 2 })],
      tuning,
    }),
    computeFixture({
      id: "augment_offensive",
      description: "Two-turn allied Attack Augment",
      powers: [augmentPower({ name: "Attack Augment", statTarget: "Attack", durationTurns: 2 })],
      tuning,
    }),
    computeFixture({
      id: "augment_short",
      description: "One-turn allied Guard Augment",
      powers: [augmentPower({ name: "Short Guard Augment", statTarget: "Guard", durationTurns: 1 })],
      tuning,
    }),
    computeFixture({
      id: "augment_long",
      description: "Four-turn allied Guard Augment",
      powers: [augmentPower({ name: "Long Guard Augment", statTarget: "Guard", durationTurns: 4 })],
      tuning,
    }),
    computeFixture({ id: "heal_plus_cleanse", description: "Distinct healing plus Cleanse", powers: healPlusCleanse, tuning }),
    computeFixture({
      id: "duplicate_heals",
      description: "Two functionally identical healing packages",
      powers: [basicHeal, duplicateHeal],
      tuning,
    }),
    computeFixture({ id: "heal_linked_damage", description: "Allied healing with linked W/S8 damage rider", powers: [linkedDamage], tuning }),
    computeFixture({ id: "heal_cost_default", description: "Same allied heal under active cost tuning", powers: [basicHeal], tuning }),
    computeFixture({ id: "heal_cost_high", description: "Same allied heal under inflated healing identity cost", powers: [basicHeal], tuning, snapshot: highCostSnapshot }),
    computeFixture({ id: "unsupported_support", description: "Unsupported generic Support intention", powers: [unsupportedSupportPower()], tuning }),
  ];
  return fixtures.map((fixture) => ({
    ...fixture,
    otherRadarAxisChanges: axisDelta(fixture.radarAxes, noSupport.radarAxes),
  }));
}

function mapMonsterPower(power: LoadedMonster["powers"][number]): Power {
  const packets: EffectPacket[] = power.effectPackets.map((packet) => ({
    id: packet.id,
    packetIndex: packet.packetIndex,
    sortOrder: packet.packetIndex,
    hostility: packet.hostility,
    intention: packet.intention,
    type: packet.intention,
    specific: packet.specific,
    diceCount: packet.diceCount,
    potency: packet.potency,
    effectTimingType: packet.effectTimingType,
    effectTimingTurns: packet.effectTimingTurns,
    effectDurationType: packet.effectDurationType,
    effectDurationTurns: packet.effectDurationTurns,
    dealsWounds: packet.dealsWounds,
    woundChannel: packet.woundChannel,
    targetedAttribute: packet.targetedAttribute,
    applicationModeKey: packet.applicationModeKey,
    resolutionOrigin: packet.resolutionOrigin,
    applyTo: packet.applyTo,
    secondaryDependencyMode: packet.secondaryDependencyMode,
    triggerConditionText: packet.triggerConditionText,
    detailsJson: asRecord(packet.detailsJson),
    localTargetingOverride: packet.localTargetingOverride,
  }));
  return {
    ...power,
    rangeCategories: power.rangeCategories.map((range) => range.rangeCategory),
    effectPackets: packets,
    intentions: packets,
    diceCount: Number(packets[0]?.diceCount ?? 1),
    potency: Number(packets[0]?.potency ?? 1),
  } as Power;
}

function traitDefinitions(monster: LoadedMonster): TraitAxisWeightDefinition[] {
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

function summarizeAsset(monster: LoadedMonster, tuning: Awaited<ReturnType<typeof loadActiveTuning>>) {
  const powers = monster.powers.map(mapMonsterPower);
  const costs = resolvePowerCosts(powers, tuning.powerSnapshot, {
    level: monster.level,
    tier: monster.tier,
  });
  const outcome = computeMonsterOutcomes(
    {
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
      tags: [],
      traits: [],
      powers,
    } as unknown as MonsterUpsertInput,
    tuning.calculatorConfig,
    {
      protectionTuning: tuning.combatValues,
      traitAxisBonuses: computeTraitAxisBonuses(traitDefinitions(monster), monster.level),
      powerContribution: {
        axisVector: costs.totals.axisVector,
        basePowerValue: costs.totals.basePowerValue,
        powerCount: costs.powers.length,
        powers: costs.powers.map((power, index) => ({
          id: power.powerId ?? null,
          name: power.name,
          axisVector: power.breakdown.axisVector,
          basePowerValue: power.breakdown.basePowerValue,
          authoredPower: powers[index] ?? null,
          derivedCooldownTurns: power.derivedCooldownTurns,
          derivedCooldownLoad: power.derivedCooldown.cooldownLoad,
          cooldownTurns: powers[index]?.cooldownTurns ?? null,
          cooldownReduction: powers[index]?.cooldownReduction ?? 0,
        })),
        debug: costs,
      },
    },
  );
  const debug = asRecord(outcome.debug);
  const finalPre = asRecord(debug.finalPreNormalizationAxes);
  const powerDebug = asRecord(debug.powerContribution);
  const canonical = asRecord(powerDebug.canonicalPowerAxisVector);
  const effective = asRecord(powerDebug.effectivePowerAxisVector);
  const supportPowers = powers
    .filter((power) => power.intentions.some((packet) => SUPPORT_INTENTIONS.has(packet.intention)))
    .map((power) => ({
      name: power.name,
      intentions: power.intentions.map((packet) => packet.intention),
      runtime: runtimeSummary([power]),
    }));
  return {
    name: monster.name,
    level: monster.level,
    tier: monster.tier,
    legendary: monster.legendary,
    finalSynergy: round(outcome.radarAxes.synergy),
    rawSynergy: round(asNumber(finalPre.synergy)),
    canonicalResolverSynergy: round(asNumber(canonical.synergy)),
    effectiveResolverSynergy: round(asNumber(effective.synergy)),
    supportPowers,
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
  const metadata = (set: TuningSet) => ({
    id: set.id,
    name: set.name,
    slug: set.slug,
    updatedAt: set.updatedAt.toISOString(),
  });
  return {
    powerSnapshot,
    combatValues,
    calculatorConfig: applyCombatTuningToCalculatorConfig(
      outcomeNormalizationValuesToCalculatorConfig(outcomeValues),
      combatValues,
    ),
    metadata: {
      power: metadata(powerSet),
      combat: metadata(combatSet),
      outcome: metadata(outcomeSet),
    },
  };
}

async function loadMonsters(prisma: PrismaClientInstance) {
  return prisma.monster.findMany({
    where: { campaignId: CAMPAIGN_ID },
    orderBy: { name: "asc" },
    include: {
      naturalAttack: true,
      attacks: { orderBy: { sortOrder: "asc" } },
      traits: { include: { trait: true }, orderBy: { sortOrder: "asc" } },
      powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
    },
  });
}

function printHuman(payload: Awaited<ReturnType<typeof buildPayload>>) {
  console.log(payload.title);
  console.log(`repoHead=${payload.provenance.repoHead}`);
  console.log(`gitStatus=${payload.provenance.gitStatus}`);
  console.log(`campaignId=${payload.provenance.campaignId}`);
  console.log("databaseAccess=read-only; mutation=none");
  console.log("");
  console.log("Synthetic fixtures | final/raw | canonical/effective resolver | BPV");
  for (const fixture of payload.fixtures) {
    console.log(
      `${fixture.id} | ${fixture.finalSynergy}/${fixture.rawSynergy} | ${fixture.canonicalResolverSynergy}/${fixture.effectiveResolverSynergy} | ${fixture.basePowerValue}`,
    );
    console.log(`  ${fixture.description}`);
    console.log(`  powers=${JSON.stringify(fixture.powers)}`);
    console.log(`  runtime=${JSON.stringify(fixture.runtime)}`);
    console.log(`  otherAxisChanges=${JSON.stringify(fixture.otherRadarAxisChanges)}`);
  }
  console.log("");
  console.log("Requested Balance Environment samples");
  for (const sample of payload.requestedSamples) {
    console.log(
      `${sample.name} | ${sample.tier}${sample.legendary ? "+LEG" : ""}/L${sample.level} | synergy=${sample.finalSynergy}/${sample.rawSynergy} resolver=${sample.canonicalResolverSynergy}/${sample.effectiveResolverSynergy} support=${sample.supportPowers.map((power) => power.name).join(",") || "none"}`,
    );
  }
  console.log("");
  console.log("All authored support assets");
  for (const sample of payload.authoredSupportAssets) {
    console.log(`${sample.name} | synergy=${sample.finalSynergy} | ${sample.supportPowers.map((power) => power.name).join(",")}`);
  }
}

async function buildPayload() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");
  try {
    const [tuning, monsters] = await Promise.all([loadActiveTuning(prisma), loadMonsters(prisma)]);
    const summaries = monsters.map((monster) => summarizeAsset(monster, tuning));
    const requestedSet = new Set<string>(SAMPLE_NAMES);
    return {
      title: "Summoning Circle Synergy reconciliation",
      provenance: {
        repoHead: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
        gitStatus:
          execSync("git status --short --untracked-files=all", { encoding: "utf8" }).trim() ||
          "clean",
        campaignId: CAMPAIGN_ID,
        campaignName: CAMPAIGN_NAME,
        tuning: tuning.metadata,
      },
      fixtures: buildFixtures(tuning),
      requestedSamples: summaries.filter((sample) => requestedSet.has(sample.name)),
      missingRequestedSamples: SAMPLE_NAMES.filter(
        (name) => !summaries.some((sample) => sample.name === name),
      ),
      authoredSupportAssets: summaries.filter((sample) => sample.supportPowers.length > 0),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const payload = await buildPayload();
  if (process.argv.includes("--json")) console.log(JSON.stringify(payload, null, 2));
  else printHuman(payload);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
