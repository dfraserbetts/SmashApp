import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma } from "@prisma/client";

import {
  DEFAULT_COMBAT_TUNING_VALUES,
  normalizeCombatTuning,
  normalizeCombatTuningFlatValues,
  type ProtectionTuningValues,
} from "../lib/config/combatTuningShared";
import {
  DEFAULT_POWER_TUNING_VALUES,
  normalizePowerTuningValues,
  type PowerTuningSnapshot,
} from "../lib/config/powerTuningShared";
import { adaptMonsterToCombatLabActor } from "../lib/combat-lab/liveAdapters";
import { evaluateAttributeBalancingGuide } from "../lib/summoning/attributeBalancingGuide";
import {
  normalizeMonsterUpsertInput,
} from "../lib/summoning/validation";
import { isSelectableDamageTypeName } from "../lib/damageTypes/selectable";
import { serializeMonsterRestrictionForDatabase } from "../lib/restrictions/monsterPersistence";
import type {
  CoreAttribute,
  EffectDurationType,
  EffectPacketApplyTo,
  MonsterCalculatorArchetype,
  MonsterNaturalAttackConfig,
  MonsterTier,
  MonsterUpsertInput,
  Power,
  PowerIntention,
  PrimaryDefenceGate,
  RangeCategory,
  ResistTheme,
  WoundChannel,
} from "../lib/summoning/types";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;
const EXPECTED_LEVEL_3_SOLDIER_ATTRIBUTE_TOTAL = 38;

type SelectableDamageType = {
  name: string;
  attackMode: WoundChannel;
};

const MONSTER_INCLUDE = {
  tags: { orderBy: { tag: "asc" as const } },
  traits: {
    orderBy: { sortOrder: "asc" as const },
    include: { trait: { select: { id: true, name: true, effectText: true } } },
  },
  attacks: { orderBy: { sortOrder: "asc" as const } },
  naturalAttack: true,
  powers: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      rangeCategories: { orderBy: { rangeCategory: "asc" as const } },
      primaryDefenceGate: true,
      tags: { orderBy: { tag: "asc" as const } },
      effectPackets: {
        orderBy: { packetIndex: "asc" as const },
        include: { localTargetingOverride: true },
      },
    },
  },
};

type PrismaClient = typeof import("../prisma/client").prisma;

type PowerSpec = {
  name: string;
  description: string;
  intention: PowerIntention;
  diceCount: number;
  potency: number;
  rangeCategory: "SELF" | RangeCategory;
  rangeValue: number;
  rangeExtra?: Record<string, unknown>;
  applyTo?: EffectPacketApplyTo;
  durationType?: EffectDurationType;
  durationTurns?: number | null;
  attackMode?: WoundChannel;
  damageTypes?: string[];
  statTarget?: CoreAttribute;
  controlMode?: string;
  controlTheme?: ResistTheme;
};

type MonsterSpec = Omit<
  MonsterUpsertInput,
  | "attacks"
  | "traits"
  | "tags"
  | "customNotes"
  | "naturalAttack"
  | "powers"
  | "level"
  | "tier"
  | "legendary"
  | "calculatorArchetype"
> & {
  role: string;
  tier?: MonsterTier;
  calculatorArchetype?: MonsterCalculatorArchetype;
  tags: string[];
  powers: PowerSpec[];
};

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = join(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

function normalizeDamageTypeAttackMode(value: unknown): WoundChannel {
  return String(value ?? "").toUpperCase() === "MENTAL" ? "MENTAL" : "PHYSICAL";
}

function selectableDamageTypeMap(damageTypes: SelectableDamageType[]) {
  return new Map(
    damageTypes.map((damageType) => [
      damageType.name.trim().toLowerCase(),
      {
        name: damageType.name.trim(),
        attackMode: normalizeDamageTypeAttackMode(damageType.attackMode),
      },
    ]),
  );
}

function assertLegalDamageTypes(params: {
  ownerName: string;
  actionName: string;
  source: string;
  attackMode: WoundChannel;
  damageTypes: string[];
  selectableDamageTypes: SelectableDamageType[];
}) {
  if (params.damageTypes.length === 0) {
    throw new Error(`${params.ownerName}: ${params.source} ${params.actionName} must have at least one damage type.`);
  }
  const legalByName = selectableDamageTypeMap(params.selectableDamageTypes);
  for (const damageType of params.damageTypes) {
    const legal = legalByName.get(damageType.trim().toLowerCase());
    if (!legal) {
      throw new Error(`${params.ownerName}: ${params.source} ${params.actionName} uses illegal damage type "${damageType}".`);
    }
    if (legal.name !== damageType) {
      throw new Error(
        `${params.ownerName}: ${params.source} ${params.actionName} must use canonical damage type "${legal.name}", not "${damageType}".`,
      );
    }
    if (legal.attackMode !== params.attackMode) {
      throw new Error(
        `${params.ownerName}: ${params.source} ${params.actionName} uses ${damageType} (${legal.attackMode}) on ${params.attackMode} attack mode.`,
      );
    }
  }
}

function assertMonsterSpecDamageTypes(params: {
  spec: MonsterSpec;
  selectableDamageTypes: SelectableDamageType[];
}) {
  for (const power of params.spec.powers) {
    if (power.intention !== "ATTACK") continue;
    assertLegalDamageTypes({
      ownerName: params.spec.name,
      actionName: power.name,
      source: "power spec",
      attackMode: normalizeDamageTypeAttackMode(power.attackMode),
      damageTypes: power.damageTypes ?? (power.attackMode === "MENTAL" ? ["Psychic"] : ["Slashing"]),
      selectableDamageTypes: params.selectableDamageTypes,
    });
  }
}

function assertPowerDamageTypes(params: {
  ownerName: string;
  power: Power;
  selectableDamageTypes: SelectableDamageType[];
}) {
  for (const [packetIndex, packet] of params.power.effectPackets.entries()) {
    if ((packet.intention ?? packet.type) !== "ATTACK" && packet.dealsWounds !== true) continue;
    const details =
      packet.detailsJson && typeof packet.detailsJson === "object"
        ? packet.detailsJson as Record<string, unknown>
        : {};
    const damageTypes = Array.isArray(details.damageTypes)
      ? details.damageTypes.map((entry) => String(entry)).filter(Boolean)
      : [];
    assertLegalDamageTypes({
      ownerName: params.ownerName,
      actionName: `${params.power.name} packet ${packetIndex + 1}`,
      source: "power packet",
      attackMode: normalizeDamageTypeAttackMode(details.attackMode ?? packet.woundChannel),
      damageTypes,
      selectableDamageTypes: params.selectableDamageTypes,
    });
  }
}

function assertNaturalAttackDamageTypes(params: {
  ownerName: string;
  actionName: string;
  attackConfig: MonsterNaturalAttackConfig | null | undefined;
  selectableDamageTypes: SelectableDamageType[];
}) {
  const legalByName = selectableDamageTypeMap(params.selectableDamageTypes);
  for (const range of ["melee", "ranged", "aoe"] as const) {
    const config = params.attackConfig?.[range];
    if (!config?.enabled) continue;
    if (!Array.isArray(config.damageTypes) || config.damageTypes.length === 0) {
      throw new Error(`${params.ownerName}: ${params.actionName} ${range} attack must have at least one damage type object.`);
    }
    for (const damageType of config.damageTypes) {
      const name = String(damageType?.name ?? "");
      const mode = normalizeDamageTypeAttackMode(damageType?.mode);
      const legal = legalByName.get(name.trim().toLowerCase());
      if (!legal) {
        throw new Error(`${params.ownerName}: ${params.actionName} ${range} attack uses illegal damage type "${name}".`);
      }
      if (legal.name !== name) {
        throw new Error(
          `${params.ownerName}: ${params.actionName} ${range} attack must use canonical damage type "${legal.name}", not "${name}".`,
        );
      }
      if (legal.attackMode !== mode) {
        throw new Error(
          `${params.ownerName}: ${params.actionName} ${range} attack uses ${name} (${legal.attackMode}) with ${mode} mode.`,
        );
      }
    }
  }
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function toPowerTuningSnapshot(set: {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: Date;
  entries: Array<{ configKey: string; value: number }>;
}): PowerTuningSnapshot {
  return {
    setId: set.id,
    name: set.name,
    slug: set.slug,
    status: set.status === "DRAFT" || set.status === "ARCHIVED" ? set.status : "ACTIVE",
    updatedAt: set.updatedAt.toISOString(),
    values: normalizePowerTuningValues(entriesToRecord(set.entries)),
  };
}

function powerRangeFields(spec: PowerSpec) {
  if (spec.rangeCategory === "MELEE") {
    return { meleeTargets: spec.rangeValue };
  }
  if (spec.rangeCategory === "RANGED") {
    return {
      rangedTargets: Number(spec.rangeExtra?.targets ?? 1),
      rangedDistanceFeet: spec.rangeValue,
    };
  }
  if (spec.rangeCategory === "AOE") {
    return {
      aoeCenterRangeFeet: spec.rangeValue,
      aoeCount: Number(spec.rangeExtra?.count ?? 1),
      aoeShape: (spec.rangeExtra?.shape ?? "SPHERE") as "SPHERE" | "CONE" | "LINE",
      aoeSphereRadiusFeet: spec.rangeExtra?.sphereRadiusFeet ? Number(spec.rangeExtra.sphereRadiusFeet) : null,
      aoeConeLengthFeet: spec.rangeExtra?.coneLengthFeet ? Number(spec.rangeExtra.coneLengthFeet) : null,
      aoeLineWidthFeet: spec.rangeExtra?.lineWidthFeet ? Number(spec.rangeExtra.lineWidthFeet) : null,
      aoeLineLengthFeet: spec.rangeExtra?.lineLengthFeet ? Number(spec.rangeExtra.lineLengthFeet) : null,
    };
  }
  return {};
}

function primaryGateForSpec(spec: PowerSpec): PrimaryDefenceGate | null {
  if (spec.intention === "ATTACK") {
    return {
      sourcePacketIndex: 0,
      gateResult: spec.attackMode === "MENTAL" ? "PROTECTION" : "DODGE_OR_PROTECTION",
      protectionChannel: spec.attackMode ?? "PHYSICAL",
      resistAttribute: null,
      hostileEntryPattern: "DIRECT",
      resolutionSource: "INFERRED",
    };
  }
  if (spec.intention === "CONTROL" || spec.intention === "DEBUFF") {
    const resistAttribute =
      spec.controlTheme === "MIND_COGNITION"
        ? "INTELLECT"
        : spec.controlTheme === "COURAGE_RESOLVE"
          ? "BRAVERY"
          : spec.controlTheme === "DEFENSIVE_COORDINATION"
            ? "GUARD"
            : spec.controlTheme === "BODY_ENDURANCE"
              ? "FORTITUDE"
              : spec.controlTheme === "TRUST_BELONGING"
                ? "SYNERGY"
                : spec.controlTheme === "OFFENSIVE_EXECUTION"
                  ? "ATTACK"
                  : spec.statTarget ?? "GUARD";
    return {
      sourcePacketIndex: 0,
      gateResult: "RESIST",
      protectionChannel: null,
      resistAttribute,
      hostileEntryPattern: "DIRECT",
      resolutionSource: "INFERRED",
    };
  }
  return null;
}

function buildPower(spec: PowerSpec, sortOrder: number): Power {
  const durationType = spec.durationType ?? "INSTANT";
  const detailsJson: Record<string, unknown> = {
    rangeCategory: spec.rangeCategory,
    rangeValue: spec.rangeValue,
    rangeExtra: spec.rangeExtra ?? {},
    applyTo: spec.applyTo ?? "PRIMARY_TARGET",
  };
  if (spec.intention === "ATTACK") {
    detailsJson.attackMode = spec.attackMode ?? "PHYSICAL";
    detailsJson.damageTypes = spec.damageTypes ?? (spec.attackMode === "MENTAL" ? ["Psychic"] : ["Slashing"]);
  }
  if (spec.intention === "CONTROL") {
    detailsJson.controlMode = spec.controlMode ?? "Force no main action";
    detailsJson.controlTheme = spec.controlTheme ?? "MIND_COGNITION";
  }
  if (spec.intention === "DEBUFF") {
    detailsJson.statTarget = spec.statTarget ?? "Guard";
  }

  const packet = {
    sortOrder: 0,
    packetIndex: 0,
    hostility: spec.intention === "ATTACK" || spec.intention === "CONTROL" || spec.intention === "DEBUFF" ? "HOSTILE" as const : "NON_HOSTILE" as const,
    intention: spec.intention,
    type: spec.intention,
    specific: spec.intention === "ATTACK" ? spec.attackMode ?? "PHYSICAL" : spec.controlMode ?? spec.statTarget ?? null,
    diceCount: spec.diceCount,
    potency: spec.potency,
    effectTimingType: "ON_CAST" as const,
    effectTimingTurns: null,
    effectDurationType: durationType,
    effectDurationTurns: durationType === "TURNS" ? spec.durationTurns ?? 1 : null,
    dealsWounds: spec.intention === "ATTACK",
    woundChannel: spec.intention === "ATTACK" ? spec.attackMode ?? "PHYSICAL" : null,
    targetedAttribute: spec.statTarget ?? null,
    applicationModeKey: null,
    resolutionOrigin: "CASTER" as const,
    applyTo: spec.applyTo ?? "PRIMARY_TARGET",
    secondaryDependencyMode: null,
    triggerConditionText: null,
    detailsJson,
    localTargetingOverride: null,
  };

  return {
    sortOrder,
    name: spec.name,
    description: spec.description,
    schemaVersion: 1,
    rulesVersion: "v1",
    contentRevision: 1,
    previewRendererVersion: 1,
    status: "ACTIVE",
    descriptorChassis: "IMMEDIATE",
    descriptorChassisConfig: {},
    chargeType: null,
    chargeTurns: null,
    chargeBonusDicePerTurn: null,
    cooldownTurns: 0,
    cooldownReduction: 0,
    counterMode: "NO",
    commitmentModifier: "STANDARD",
    triggerMethod: null,
    attachedHostAnchorType: null,
    lifespanType: "NONE",
    lifespanTurns: null,
    previewSummaryOverride: null,
    rangeCategories: spec.rangeCategory === "SELF" ? [] : [spec.rangeCategory],
    ...powerRangeFields(spec),
    primaryDefenceGate: primaryGateForSpec(spec),
    effectPackets: [packet],
    intentions: [packet],
    diceCount: spec.diceCount,
    potency: spec.potency,
    effectDurationType: durationType,
    effectDurationTurns: durationType === "TURNS" ? spec.durationTurns ?? 1 : null,
    durationType,
    durationTurns: durationType === "TURNS" ? spec.durationTurns ?? 1 : null,
    defenceRequirement: primaryGateForSpec(spec)?.gateResult ?? "NONE",
  };
}

function metadata(role: string) {
  return [
    "BALANCE_STATUS: Experimental",
    "BALANCE_SOURCE: Balance Environment calibration",
    "BALANCE_PHASE: First-pass monster set",
    `BALANCE_ROLE: ${role}`,
    "BALANCE_NOTES: Experimental calibration monster; not final tuned monster.",
  ].join("\n");
}

function baseMonster(spec: MonsterSpec): MonsterUpsertInput {
  return {
    ...spec,
    level: LEVEL,
    tier: spec.tier ?? "SOLDIER",
    legendary: false,
    calculatorArchetype: spec.calculatorArchetype ?? "BALANCED",
    customNotes: metadata(spec.role),
    attacks: [],
    traits: [],
    naturalAttack: null,
    powers: spec.powers.map(buildPower),
  };
}

const MONSTERS: MonsterSpec[] = [
  {
    name: "BALANCE_Physical Striker",
    role: "Direct physical pressure",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
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
    physicalResilienceCurrent: 32,
    physicalResilienceMax: 32,
    mentalPerseveranceCurrent: 24,
    mentalPerseveranceMax: 24,
    physicalProtection: 1,
    mentalProtection: 0,
    naturalPhysicalProtection: 1,
    naturalMentalProtection: 0,
    attackDie: "D10",
    attackResistDie: 1,
    attackModifier: 0,
    guardDie: "D8",
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D6",
    fortitudeResistDie: 1,
    fortitudeModifier: 0,
    intellectDie: "D4",
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: "D4",
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: "D6",
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: 3,
    weaponSkillModifier: 0,
    armorSkillValue: 2,
    armorSkillModifier: 0,
    tags: ["BALANCE", "CALIBRATION", "PHYSICAL_PRESSURE"],
    powers: [{
      name: "Crushing Swipe",
      description: "A straightforward physical hit for first-pass damage calibration.",
      intention: "ATTACK",
      diceCount: 2,
      potency: 2,
      rangeCategory: "MELEE",
      rangeValue: 1,
      attackMode: "PHYSICAL",
      damageTypes: ["Slashing"],
    }],
  },
  {
    name: "BALANCE_Mental Wailer",
    role: "Direct mental pressure",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
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
    physicalResilienceCurrent: 22,
    physicalResilienceMax: 22,
    mentalPerseveranceCurrent: 30,
    mentalPerseveranceMax: 30,
    physicalProtection: 0,
    mentalProtection: 1,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 1,
    attackDie: "D6",
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: "D4",
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D4",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D10",
    intellectResistDie: 1,
    intellectModifier: 0,
    synergyDie: "D6",
    synergyResistDie: 1,
    synergyModifier: 0,
    braveryDie: "D8",
    braveryResistDie: 1,
    braveryModifier: 0,
    weaponSkillValue: 2,
    weaponSkillModifier: 0,
    armorSkillValue: 1,
    armorSkillModifier: 0,
    tags: ["BALANCE", "CALIBRATION", "MENTAL_PRESSURE"],
    powers: [{
      name: "Mind Wail",
      description: "A simple ranged mental hit for mental pressure calibration.",
      intention: "ATTACK",
      diceCount: 2,
      potency: 2,
      rangeCategory: "RANGED",
      rangeValue: 30,
      rangeExtra: { targets: 1 },
      attackMode: "MENTAL",
      damageTypes: ["Psychic"],
    }],
  },
  {
    name: "BALANCE_Control Hexer",
    role: "Hostile control and debuff calibration",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
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
    physicalResilienceCurrent: 24,
    physicalResilienceMax: 24,
    mentalPerseveranceCurrent: 28,
    mentalPerseveranceMax: 28,
    physicalProtection: 0,
    mentalProtection: 1,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 1,
    attackDie: "D4",
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: "D4",
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D6",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D10",
    intellectResistDie: 1,
    intellectModifier: 0,
    synergyDie: "D8",
    synergyResistDie: 1,
    synergyModifier: 0,
    braveryDie: "D6",
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: 1,
    weaponSkillModifier: 0,
    armorSkillValue: 1,
    armorSkillModifier: 0,
    calculatorArchetype: "CONTROLLER",
    tags: ["BALANCE", "CALIBRATION", "CONTROL"],
    powers: [
      {
        name: "Hexing Glare",
        description: "A clean hostile control packet resisted on the mental/cognition lane.",
        intention: "CONTROL",
        diceCount: 2,
        potency: 1,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        controlMode: "Force no main action",
        controlTheme: "MIND_COGNITION",
        durationType: "TURNS",
        durationTurns: 1,
      },
      {
        name: "Pale Spark",
        description: "A deliberately small mental attack so Combat Lab hydrates a real non-fallback action.",
        intention: "ATTACK",
        diceCount: 1,
        potency: 1,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        attackMode: "MENTAL",
        damageTypes: ["Psychic"],
      },
    ],
  },
  {
    name: "BALANCE_Dodge Pressure Skirmisher",
    role: "Dodge pressure calibration",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
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
    physicalResilienceCurrent: 26,
    physicalResilienceMax: 26,
    mentalPerseveranceCurrent: 22,
    mentalPerseveranceMax: 22,
    physicalProtection: 0,
    mentalProtection: 0,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 0,
    attackDie: "D10",
    attackResistDie: 1,
    attackModifier: 0,
    guardDie: "D8",
    guardResistDie: 1,
    guardModifier: 0,
    fortitudeDie: "D6",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D4",
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: "D4",
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: "D6",
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: 3,
    weaponSkillModifier: 0,
    armorSkillValue: 1,
    armorSkillModifier: 0,
    calculatorArchetype: "SCRAPPER",
    tags: ["BALANCE", "CALIBRATION", "DODGE_PRESSURE"],
    powers: [{
      name: "Flurry Cut",
      description: "A modest multi-target physical attack pattern that remains Dodge-legal.",
      intention: "ATTACK",
      diceCount: 3,
      potency: 1,
      rangeCategory: "MELEE",
      rangeValue: 2,
      attackMode: "PHYSICAL",
      damageTypes: ["Slashing"],
    }],
  },
  {
    name: "BALANCE_Durable Soldier",
    role: "Durable simple combatant",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
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
    physicalResilienceCurrent: 44,
    physicalResilienceMax: 44,
    mentalPerseveranceCurrent: 34,
    mentalPerseveranceMax: 34,
    physicalProtection: 2,
    mentalProtection: 1,
    naturalPhysicalProtection: 2,
    naturalMentalProtection: 1,
    attackDie: "D6",
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: "D10",
    guardResistDie: 1,
    guardModifier: 0,
    fortitudeDie: "D10",
    fortitudeResistDie: 1,
    fortitudeModifier: 0,
    intellectDie: "D4",
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: "D4",
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: "D4",
    braveryResistDie: 1,
    braveryModifier: 0,
    weaponSkillValue: 2,
    weaponSkillModifier: 0,
    armorSkillValue: 3,
    armorSkillModifier: 0,
    calculatorArchetype: "TANK",
    tags: ["BALANCE", "CALIBRATION", "DURABLE"],
    powers: [{
      name: "Soldier's Strike",
      description: "A simple moderate physical strike with no hard control.",
      intention: "ATTACK",
      diceCount: 2,
      potency: 2,
      rangeCategory: "MELEE",
      rangeValue: 1,
      attackMode: "PHYSICAL",
      damageTypes: ["Blunt"],
    }],
  },
];

function jsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return {};
  return value as Prisma.InputJsonValue;
}

function buildPowerCreateData(power: Power) {
  return {
    sortOrder: power.sortOrder,
    sourceType: "MONSTER_POWER" as const,
    name: power.name,
    description: power.description,
    restrictionJson: serializeMonsterRestrictionForDatabase(power.restriction, Prisma.DbNull),
    schemaVersion: power.schemaVersion ?? 1,
    rulesVersion: power.rulesVersion ?? "v1",
    contentRevision: power.contentRevision ?? 1,
    previewRendererVersion: power.previewRendererVersion ?? 1,
    status: power.status ?? "ACTIVE",
    descriptorChassis: power.descriptorChassis ?? "IMMEDIATE",
    descriptorChassisConfig: jsonValue(power.descriptorChassisConfig),
    chargeType: power.chargeType ?? null,
    chargeTurns: power.chargeTurns ?? null,
    chargeBonusDicePerTurn: power.chargeBonusDicePerTurn ?? null,
    counterMode: power.counterMode ?? "NO",
    commitmentModifier: power.commitmentModifier ?? "STANDARD",
    triggerMethod: power.triggerMethod ?? null,
    attachedHostAnchorType: power.attachedHostAnchorType ?? null,
    cooldownTurns: power.cooldownTurns,
    cooldownReduction: power.cooldownReduction,
    lifespanType: power.lifespanType ?? "NONE",
    lifespanTurns: power.lifespanTurns ?? null,
    previewSummaryOverride: power.previewSummaryOverride ?? null,
    meleeTargets: power.meleeTargets ?? null,
    rangedTargets: power.rangedTargets ?? null,
    rangedDistanceFeet: power.rangedDistanceFeet ?? null,
    aoeCenterRangeFeet: power.aoeCenterRangeFeet ?? null,
    aoeCount: power.aoeCount ?? null,
    aoeShape: power.aoeShape ?? null,
    aoeSphereRadiusFeet: power.aoeSphereRadiusFeet ?? null,
    aoeConeLengthFeet: power.aoeConeLengthFeet ?? null,
    aoeLineWidthFeet: power.aoeLineWidthFeet ?? null,
    aoeLineLengthFeet: power.aoeLineLengthFeet ?? null,
    rangeCategories: {
      create: (power.rangeCategories ?? []).map((rangeCategory) => ({ rangeCategory })),
    },
    primaryDefenceGate: power.primaryDefenceGate
      ? {
          create: {
            sourcePacketIndex: power.primaryDefenceGate.sourcePacketIndex,
            gateResult: power.primaryDefenceGate.gateResult,
            protectionChannel: power.primaryDefenceGate.protectionChannel,
            resistAttribute: power.primaryDefenceGate.resistAttribute,
            hostileEntryPattern: power.primaryDefenceGate.hostileEntryPattern,
            resolutionSource: power.primaryDefenceGate.resolutionSource,
          },
        }
      : undefined,
    effectPackets: {
      create: power.effectPackets.map((packet, packetIndex) => ({
        packetIndex: packet.packetIndex ?? packet.sortOrder ?? packetIndex,
        hostility: packet.hostility ?? "NON_HOSTILE",
        intention: packet.intention,
        specific: packet.specific ?? null,
        diceCount: packet.diceCount ?? power.diceCount,
        potency: packet.potency ?? power.potency,
        effectTimingType: packet.effectTimingType ?? "ON_CAST",
        effectTimingTurns: packet.effectTimingTurns ?? null,
        effectDurationType: packet.effectDurationType ?? power.effectDurationType ?? "INSTANT",
        effectDurationTurns:
          (packet.effectDurationType ?? power.effectDurationType) === "TURNS"
            ? packet.effectDurationTurns ?? power.effectDurationTurns ?? null
            : null,
        dealsWounds: packet.dealsWounds ?? false,
        woundChannel: packet.woundChannel ?? null,
        targetedAttribute: packet.targetedAttribute ?? null,
        applicationModeKey: packet.applicationModeKey ?? null,
        resolutionOrigin: packet.resolutionOrigin ?? "CASTER",
        applyTo: packet.applyTo ?? null,
        secondaryDependencyMode: packet.secondaryDependencyMode ?? null,
        triggerConditionText: packet.triggerConditionText ?? null,
        detailsJson: jsonValue(packet.detailsJson),
        localTargetingOverride: packet.localTargetingOverride
          ? { create: packet.localTargetingOverride }
          : undefined,
      })),
    },
  };
}

async function upsertMonster(prisma: PrismaClient, data: MonsterUpsertInput) {
  const matches = await prisma.monster.findMany({
    where: { campaignId: BALANCE_CAMPAIGN_ID, name: data.name },
    select: { id: true, source: true, isReadOnly: true, campaignId: true },
  });
  if (matches.length > 1) {
    throw new Error(`Refusing to upsert ${data.name}: found ${matches.length} matching monsters in Balance Environment.`);
  }
  const existing = matches[0] ?? null;
  if (existing && (existing.source !== "CAMPAIGN" || existing.isReadOnly || existing.campaignId !== BALANCE_CAMPAIGN_ID)) {
    throw new Error(`Refusing to update protected or out-of-scope monster ${data.name}.`);
  }
  if (!existing) {
    throw new Error(`Refusing to create ${data.name}: Balance Environment calibration pass may only update existing monster records.`);
  }

  const monsterData = {
    name: data.name,
    imageUrl: data.imageUrl,
    imagePosX: data.imagePosX,
    imagePosY: data.imagePosY,
    level: data.level,
    tier: data.tier,
    legendary: data.legendary,
    calculatorArchetype: data.calculatorArchetype ?? "BALANCED",
    source: "CAMPAIGN" as const,
    isReadOnly: false,
    campaignId: BALANCE_CAMPAIGN_ID,
    mainHandItemId: data.mainHandItemId,
    offHandItemId: data.offHandItemId,
    smallItemId: data.smallItemId,
    headArmorItemId: data.headArmorItemId,
    shoulderArmorItemId: data.shoulderArmorItemId,
    torsoArmorItemId: data.torsoArmorItemId,
    legsArmorItemId: data.legsArmorItemId,
    feetArmorItemId: data.feetArmorItemId,
    headItemId: data.headItemId,
    neckItemId: data.neckItemId,
    armsItemId: data.armsItemId,
    beltItemId: data.beltItemId,
    customNotes: data.customNotes,
    limitBreakName: data.limitBreakName,
    limitBreakTier: data.limitBreakTier,
    limitBreakTriggerText: data.limitBreakTriggerText,
    limitBreakAttribute: data.limitBreakAttribute,
    limitBreakThresholdSuccesses: data.limitBreakThresholdSuccesses,
    limitBreakCostText: data.limitBreakCostText,
    limitBreakEffectText: data.limitBreakEffectText,
    limitBreak2Name: data.limitBreak2Name,
    limitBreak2Tier: data.limitBreak2Tier,
    limitBreak2TriggerText: data.limitBreak2TriggerText,
    limitBreak2Attribute: data.limitBreak2Attribute,
    limitBreak2ThresholdSuccesses: data.limitBreak2ThresholdSuccesses,
    limitBreak2CostText: data.limitBreak2CostText,
    limitBreak2EffectText: data.limitBreak2EffectText,
    physicalResilienceCurrent: data.physicalResilienceCurrent,
    physicalResilienceMax: data.physicalResilienceMax,
    mentalPerseveranceCurrent: data.mentalPerseveranceCurrent,
    mentalPerseveranceMax: data.mentalPerseveranceMax,
    physicalProtection: data.physicalProtection,
    mentalProtection: data.mentalProtection,
    naturalPhysicalProtection: data.naturalPhysicalProtection,
    naturalMentalProtection: data.naturalMentalProtection,
    attackDie: data.attackDie,
    attackResistDie: data.attackResistDie,
    attackModifier: data.attackModifier,
    guardDie: data.guardDie,
    guardResistDie: data.guardResistDie,
    guardModifier: data.guardModifier,
    fortitudeDie: data.fortitudeDie,
    fortitudeResistDie: data.fortitudeResistDie,
    fortitudeModifier: data.fortitudeModifier,
    intellectDie: data.intellectDie,
    intellectResistDie: data.intellectResistDie,
    intellectModifier: data.intellectModifier,
    synergyDie: data.synergyDie,
    synergyResistDie: data.synergyResistDie,
    synergyModifier: data.synergyModifier,
    braveryDie: data.braveryDie,
    braveryResistDie: data.braveryResistDie,
    braveryModifier: data.braveryModifier,
    weaponSkillValue: data.weaponSkillValue,
    weaponSkillModifier: data.weaponSkillModifier,
    armorSkillValue: data.armorSkillValue,
    armorSkillModifier: data.armorSkillModifier,
  };

  return prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.monsterTag.deleteMany({ where: { monsterId: existing.id } });
      await tx.monsterTrait.deleteMany({ where: { monsterId: existing.id } });
      await tx.power.deleteMany({ where: { monsterId: existing.id } });
      await tx.monsterAttack.deleteMany({ where: { monsterId: existing.id } });
      await tx.monsterNaturalAttack.deleteMany({ where: { monsterId: existing.id } });
      return tx.monster.update({
        where: { id: existing.id },
        data: {
          ...monsterData,
          tags: { create: data.tags.map((tag) => ({ tag })) },
          traits: {
            create: data.traits.map((trait) => ({
              sortOrder: trait.sortOrder,
              traitDefinitionId: trait.traitDefinitionId,
            })),
          },
          attacks: {
            create: data.attacks.map((attack) => ({
              sortOrder: attack.sortOrder,
              attackMode: attack.attackMode,
              attackName: attack.attackName,
              attackConfig: jsonValue(attack.attackConfig),
              equippedWeaponId: (attack as { equippedWeaponId?: string | null }).equippedWeaponId ?? null,
            })),
          },
          naturalAttack: data.naturalAttack
            ? {
                create: {
                  attackName: data.naturalAttack.attackName,
                  attackConfig: jsonValue(data.naturalAttack.attackConfig),
                },
              }
            : undefined,
          powers: { create: data.powers.map(buildPowerCreateData) },
        },
        include: MONSTER_INCLUDE,
      });
    }

    throw new Error(`Unexpected create path reached for ${data.name}.`);
  });
}

async function loadTuning(prisma: PrismaClient): Promise<{
  powerTuning: PowerTuningSnapshot;
  protectionTuning: ProtectionTuningValues;
}> {
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

  return {
    powerTuning: powerSet
      ? toPowerTuningSnapshot(powerSet)
      : {
          setId: "script-default",
          name: "Script default power tuning",
          slug: "script-default-power-tuning",
          status: "ACTIVE",
          updatedAt: new Date(0).toISOString(),
          values: DEFAULT_POWER_TUNING_VALUES,
        },
    protectionTuning: combatSet
      ? normalizeCombatTuning(normalizeCombatTuningFlatValues(entriesToRecord(combatSet.entries)))
      : DEFAULT_COMBAT_TUNING_VALUES,
  };
}

async function main() {
  loadLocalEnv();
  const { prisma } = await import("../prisma/client");

  const initialCounts = await Promise.all([
    prisma.campaignCharacter.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
    prisma.monster.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
    prisma.itemTemplate.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
  ]);

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: BALANCE_CAMPAIGN_ID },
      select: { id: true, name: true },
    });
    if (!campaign) throw new Error(`Campaign ${BALANCE_CAMPAIGN_ID} was not found.`);
    if (campaign.name !== BALANCE_CAMPAIGN_NAME) {
      throw new Error(`Campaign name mismatch: expected ${BALANCE_CAMPAIGN_NAME}, found ${campaign.name}.`);
    }

    const damageTypeRows = await prisma.damageType.findMany({
      orderBy: { name: "asc" },
      select: { name: true, attackMode: true },
    });
    const selectableDamageTypes = damageTypeRows
      .filter((row) => isSelectableDamageTypeName(row.name))
      .map((row) => ({
        name: row.name,
        attackMode: normalizeDamageTypeAttackMode(row.attackMode),
      }));
    for (const spec of MONSTERS) {
      assertMonsterSpecDamageTypes({ spec, selectableDamageTypes });
    }

    const { powerTuning, protectionTuning } = await loadTuning(prisma);
    const normalized = MONSTERS.map((spec) => {
      const result = normalizeMonsterUpsertInput(baseMonster(spec), {
        campaignId: BALANCE_CAMPAIGN_ID,
      });
      if (!result.ok) {
        throw new Error(`${spec.name}: ${result.error}`);
      }
      for (const power of result.data.powers) {
        assertPowerDamageTypes({
          ownerName: result.data.name,
          power,
          selectableDamageTypes,
        });
      }
      for (const attack of result.data.attacks) {
        assertNaturalAttackDamageTypes({
          ownerName: result.data.name,
          actionName: attack.attackName ?? "Natural Weapon",
          attackConfig: attack.attackConfig,
          selectableDamageTypes,
        });
      }
      if (result.data.naturalAttack) {
        assertNaturalAttackDamageTypes({
          ownerName: result.data.name,
          actionName: result.data.naturalAttack.attackName,
          attackConfig: result.data.naturalAttack.attackConfig,
          selectableDamageTypes,
        });
      }
      const guide = evaluateAttributeBalancingGuide({
        level: result.data.level,
        tier: result.data.tier,
        archetype: result.data.calculatorArchetype ?? "BALANCED",
        attributes: {
          attackDie: result.data.attackDie,
          guardDie: result.data.guardDie,
          fortitudeDie: result.data.fortitudeDie,
          intellectDie: result.data.intellectDie,
          synergyDie: result.data.synergyDie,
          braveryDie: result.data.braveryDie,
        },
      });
      if (
        guide.currentTotal !== EXPECTED_LEVEL_3_SOLDIER_ATTRIBUTE_TOTAL ||
        guide.budgetStatus !== "On Budget"
      ) {
        throw new Error(
          `${spec.name}: attribute total ${guide.currentTotal}, expected ${EXPECTED_LEVEL_3_SOLDIER_ATTRIBUTE_TOTAL} and On Budget status.`,
        );
      }
      return result.data;
    });

    const existingExpectedRows = await prisma.monster.findMany({
      where: { campaignId: BALANCE_CAMPAIGN_ID, name: { in: MONSTERS.map((entry) => entry.name) } },
      select: { id: true, name: true, source: true, isReadOnly: true, campaignId: true },
      orderBy: { name: "asc" },
    });
    if (existingExpectedRows.length !== MONSTERS.length) {
      throw new Error(
        `Expected ${MONSTERS.length} existing Balance Environment monsters before update, found ${existingExpectedRows.length}.`,
      );
    }
    const protectedRows = existingExpectedRows.filter(
      (row) => row.source !== "CAMPAIGN" || row.isReadOnly || row.campaignId !== BALANCE_CAMPAIGN_ID,
    );
    if (protectedRows.length > 0) {
      throw new Error(`Refusing protected or out-of-scope monsters: ${protectedRows.map((row) => row.name).join(", ")}`);
    }

    const outputs = [];
    for (const data of normalized) {
      const before = await prisma.monster.findFirst({
        where: { campaignId: BALANCE_CAMPAIGN_ID, name: data.name },
        select: { id: true },
      });
      const row = await upsertMonster(prisma, data);
      if (!before || before.id !== row.id) {
        throw new Error(`${data.name}: expected to preserve existing monster id.`);
      }
      const attributeGuide = evaluateAttributeBalancingGuide({
        level: row.level,
        tier: row.tier,
        archetype: row.calculatorArchetype as MonsterCalculatorArchetype,
        attributes: {
          attackDie: row.attackDie,
          guardDie: row.guardDie,
          fortitudeDie: row.fortitudeDie,
          intellectDie: row.intellectDie,
          synergyDie: row.synergyDie,
          braveryDie: row.braveryDie,
        },
      });
      outputs.push({
        operation: "updated",
        id: row.id,
        name: row.name,
        level: row.level,
        tier: row.tier,
        legendary: row.legendary,
        source: row.source,
        isReadOnly: row.isReadOnly,
        physicalResilience: `${row.physicalResilienceCurrent}/${row.physicalResilienceMax}`,
        mentalPerseverance: `${row.mentalPerseveranceCurrent}/${row.mentalPerseveranceMax}`,
        protection: {
          physical: row.physicalProtection,
          mental: row.mentalProtection,
        },
        attributeBudget: {
          currentTotal: attributeGuide.currentTotal,
          expectedTotal: attributeGuide.expectedTotal,
          budgetDelta: attributeGuide.budgetDelta,
          budgetStatus: attributeGuide.budgetStatus,
        },
      powers: row.powers.map((power) => ({
          name: power.name,
          packets: power.effectPackets.map((packet) => ({
            intention: packet.intention,
            diceCount: packet.diceCount,
            potency: packet.potency,
            woundChannel: packet.woundChannel,
            applyTo: packet.applyTo,
            damageTypes:
              packet.detailsJson && typeof packet.detailsJson === "object"
                ? (packet.detailsJson as Record<string, unknown>).damageTypes
                : [],
          })),
        })),
      });
    }

    const rows = await prisma.monster.findMany({
      where: { campaignId: BALANCE_CAMPAIGN_ID, name: { in: MONSTERS.map((entry) => entry.name) } },
      include: MONSTER_INCLUDE,
      orderBy: { name: "asc" },
    });
    if (rows.length !== MONSTERS.length) {
      throw new Error(`Expected ${MONSTERS.length} seeded monsters, found ${rows.length}.`);
    }
    if (rows.some((row) => row.source !== "CAMPAIGN" || row.isReadOnly || row.campaignId !== BALANCE_CAMPAIGN_ID)) {
      throw new Error("One or more seeded monsters are not mutable CAMPAIGN rows in the Balance Environment campaign.");
    }
    if (rows.some((row) => row.legendary)) {
      throw new Error("Legendary Anchor was not requested; one or more seeded rows are legendary.");
    }
    for (const row of rows) {
      const guide = evaluateAttributeBalancingGuide({
        level: row.level,
        tier: row.tier,
        archetype: row.calculatorArchetype as MonsterCalculatorArchetype,
        attributes: {
          attackDie: row.attackDie,
          guardDie: row.guardDie,
          fortitudeDie: row.fortitudeDie,
          intellectDie: row.intellectDie,
          synergyDie: row.synergyDie,
          braveryDie: row.braveryDie,
        },
      });
      if (
        guide.currentTotal !== EXPECTED_LEVEL_3_SOLDIER_ATTRIBUTE_TOTAL ||
        guide.budgetStatus !== "On Budget"
      ) {
        throw new Error(`${row.name}: final attribute budget is ${guide.currentTotal} / ${guide.budgetStatus}.`);
      }
      for (const power of row.powers) {
        assertPowerDamageTypes({
          ownerName: row.name,
          power: power as unknown as Power,
          selectableDamageTypes,
        });
      }
      for (const attack of row.attacks) {
        assertNaturalAttackDamageTypes({
          ownerName: row.name,
          actionName: attack.attackName ?? "Natural Weapon",
          attackConfig: attack.attackConfig as MonsterNaturalAttackConfig | null,
          selectableDamageTypes,
        });
      }
      if (row.naturalAttack) {
        assertNaturalAttackDamageTypes({
          ownerName: row.name,
          actionName: row.naturalAttack.attackName,
          attackConfig: row.naturalAttack.attackConfig as MonsterNaturalAttackConfig,
          selectableDamageTypes,
        });
      }
    }

    const hydration = rows.map((row) => {
      const adapted = adaptMonsterToCombatLabActor(row, new Map(), protectionTuning, powerTuning);
      const fallbackActions = adapted.actor.hydration.fallbackActions ?? [];
      const nonFallbackActions = adapted.actor.actions.filter((action) => action.id !== "monster-fallback-basic-attack");
      if (nonFallbackActions.length === 0) {
        throw new Error(`${row.name} hydrated with no non-fallback Combat Lab action.`);
      }
      return {
        id: row.id,
        name: row.name,
        fallbackActions,
        nonFallbackActionCount: nonFallbackActions.length,
        actions: adapted.actor.actions.map((action) => ({
          id: action.id,
          name: action.name,
          kind: action.kind,
          pool: action.pool,
          diceCount: action.diceCount,
          potency: action.potency,
          supported: action.supported,
        })),
      };
    });

    const finalCounts = await Promise.all([
      prisma.campaignCharacter.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
      prisma.monster.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
      prisma.itemTemplate.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
    ]);
    if (initialCounts[0] !== finalCounts[0]) {
      throw new Error(`Character count changed from ${initialCounts[0]} to ${finalCounts[0]}; aborting report.`);
    }
    if (initialCounts[2] !== finalCounts[2]) {
      throw new Error(`Forge item count changed from ${initialCounts[2]} to ${finalCounts[2]}; aborting report.`);
    }

    console.log(JSON.stringify({
      campaignId: BALANCE_CAMPAIGN_ID,
      campaignName: BALANCE_CAMPAIGN_NAME,
      assetSource: "balance-campaign-authored",
      helper: "scripts/balanceEnvironment.seedMonsters.ts",
      levelDefault: LEVEL,
      legendaryAnchorCreated: false,
      counts: {
        before: {
          characters: initialCounts[0],
          monsters: initialCounts[1],
          itemTemplates: initialCounts[2],
        },
        after: {
          characters: finalCounts[0],
          monsters: finalCounts[1],
          itemTemplates: finalCounts[2],
        },
      },
      monsters: outputs,
      hydration,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
