import { loadEnvConfig } from "@next/env";
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import {
  computeMonsterOutcomes,
  computeTraitAxisBonuses,
  computeTraitLegacySynergySources,
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
import {
  attachPowerCooldownAuthority,
  resolvePowerCooldownAuthority,
} from "../lib/summoning/resolvePowerCooldownAuthority";
import type {
  EffectPacket,
  MonsterUpsertInput,
  Power,
  PowerCooldownAuthorityResolution,
} from "../lib/summoning/types";

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
const DATABASE_OPERATIONS = [
  "powerTuningConfigSet.findFirst",
  "combatTuningConfigSet.findFirst",
  "outcomeNormalizationConfigSet.findFirst",
  "monster.findMany",
] as const;
const GAZZKILL_MONSTER_ID = "cmlfrpajh0000eswctslf0rsk";
const GAZZKILL_RILE_POWER_ID = "cmpy3ilyj000ga0wco7830nmy";
const GAZZKILL_RILE_PACKET_ID = "cmpy3im0y000ha0wcxpj0vza9";
const WOLF_BERZERKER_IRON_SKIN_RIDER_PACKET_ID = "cmq6ey1ug000by0wcp63l68vt";

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
type LoadedPower = LoadedMonster["powers"][number];
type LoadedPacket = LoadedPower["effectPackets"][number];
type PowerCostContext = { level: number; tier: "MINION" | "SOLDIER" | "ELITE" | "BOSS" };

function round(value: number, digits = 3): number {
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

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
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

function axisValues(value: Partial<RadarAxes> | null | undefined): RadarAxes {
  const axes = { ...emptyAxes(), ...(value ?? {}) };
  return Object.fromEntries(
    Object.entries(axes).map(([key, axisValue]) => [key, round(axisValue, 6)]),
  ) as RadarAxes;
}

function axesAreFinite(axes: RadarAxes): boolean {
  return Object.values(axes).every(Number.isFinite);
}

function axesEqual(left: RadarAxes, right: RadarAxes, epsilon = 0.000001): boolean {
  return (Object.keys(left) as Array<keyof RadarAxes>).every(
    (axis) => Math.abs(left[axis] - right[axis]) <= epsilon,
  );
}

function stableId(kind: "power" | "packet", identity: string): string {
  const normalized = identity
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!normalized) throw new Error(`Stable ${kind} identity cannot be empty.`);
  return `synergy-audit-${kind}-${normalized}`;
}

function createPacket(params: {
  powerIdentity: string;
  packetIdentity?: string;
  intention: EffectPacket["intention"];
  modifier: number | null | undefined;
  applyTo: EffectPacket["applyTo"];
  targetedAttribute?: EffectPacket["targetedAttribute"];
  diceCount?: number;
  potency?: number;
  durationType?: EffectPacket["effectDurationType"];
  durationTurns?: number | null;
  detailsJson?: Record<string, unknown>;
}): EffectPacket {
  return {
    id: stableId("packet", `${params.powerIdentity}-${params.packetIdentity ?? "primary"}`),
    sortOrder: 0,
    packetIndex: 0,
    hostility: ["ATTACK", "CONTROL", "DEBUFF"].includes(params.intention)
      ? "HOSTILE"
      : "NON_HOSTILE",
    intention: params.intention,
    type: params.intention,
    diceCount: params.diceCount ?? 3,
    potency: params.potency ?? 3,
    modifier: params.modifier,
    effectTimingType: "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: params.durationType ?? "TURNS",
    effectDurationTurns: params.durationTurns ?? 2,
    targetedAttribute: params.targetedAttribute ?? null,
    applicationModeKey: null,
    resolutionOrigin: "CASTER",
    applyTo: params.applyTo,
    secondaryDependencyMode: "INDEPENDENT",
    triggerConditionText: null,
    detailsJson: params.detailsJson ?? {},
    localTargetingOverride: null,
  };
}

function createPower(params: {
  identity: string;
  name: string;
  packet: EffectPacket;
  range?: "RANGED" | "AOE" | "SELF";
  targets?: number;
  authoredCooldown?: number;
  aoeRadiusFeet?: number;
}): Power {
  const range = params.range ?? "RANGED";
  const targets = Math.max(1, params.targets ?? 1);
  return {
    id: stableId("power", params.identity),
    sortOrder: 0,
    name: params.name,
    description: null,
    schemaVersion: 2,
    rulesVersion: "v1",
    contentRevision: 1,
    previewRendererVersion: 1,
    status: "ACTIVE",
    descriptorChassis: "IMMEDIATE",
    descriptorChassisConfig: {},
    chargeType: null,
    chargeTurns: null,
    chargeBonusDicePerTurn: null,
    cooldownTurns: params.authoredCooldown ?? 2,
    cooldownReduction: 0,
    counterMode: "NO",
    commitmentModifier: "STANDARD",
    triggerMethod: null,
    attachedHostAnchorType: null,
    lifespanType: "NONE",
    lifespanTurns: null,
    previewSummaryOverride: null,
    rangeCategories: range === "SELF" ? [] : [range],
    meleeTargets: 1,
    rangedDistanceFeet: range === "RANGED" ? 30 : null,
    rangedTargets: range === "RANGED" ? targets : null,
    aoeCenterRangeFeet: range === "AOE" ? 30 : null,
    aoeCount: range === "AOE" ? targets : 1,
    aoeShape: range === "AOE" ? "SPHERE" : null,
    aoeSphereRadiusFeet: range === "AOE" ? (params.aoeRadiusFeet ?? 10) : null,
    aoeConeLengthFeet: null,
    aoeLineWidthFeet: null,
    aoeLineLengthFeet: null,
    primaryDefenceGate: undefined,
    effectPackets: [params.packet],
    intentions: [params.packet],
    diceCount: Number(params.packet.diceCount ?? 1),
    potency: Number(params.packet.potency ?? 1),
    effectDurationType: params.packet.effectDurationType ?? "INSTANT",
    effectDurationTurns: params.packet.effectDurationTurns ?? null,
    durationType: params.packet.effectDurationType ?? "INSTANT",
    durationTurns: params.packet.effectDurationTurns ?? null,
  };
}

function augmentPower(params: {
  identity: string;
  name: string;
  modifier: number | null;
  applyTo?: "ALLIES" | "SELF";
  targets?: number;
  range?: "RANGED" | "AOE" | "SELF";
  durationTurns?: number;
}): Power {
  const applyTo = params.applyTo ?? "ALLIES";
  const packet = createPacket({
    powerIdentity: params.identity,
    intention: "AUGMENT",
    modifier: params.modifier,
    applyTo,
    targetedAttribute: "SYNERGY",
    diceCount: 3,
    potency: 3,
    durationType: "TURNS",
    durationTurns: params.durationTurns ?? 2,
    detailsJson: {
      statTarget: "Synergy",
      rangeCategory: applyTo === "SELF" ? "SELF" : params.range ?? "RANGED",
      expectedTargetCount: params.targets ?? 1,
    },
  });
  return createPower({
    identity: params.identity,
    name: params.name,
    packet,
    range: applyTo === "SELF" ? "SELF" : params.range,
    targets: params.targets,
    aoeRadiusFeet: 10,
  });
}

function unsupportedSupportPower(): Power {
  const identity = "unsupported-generic-support";
  const packet = createPacket({
    powerIdentity: identity,
    intention: "SUPPORT",
    modifier: undefined,
    applyTo: "ALLIES",
    diceCount: 2,
    potency: 1,
    durationType: "INSTANT",
    durationTurns: null,
    detailsJson: { unsupportedMode: "Narrative support" },
  });
  return createPower({ identity, name: "Unsupported Generic Support", packet });
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

function mapMonsterPacket(packet: LoadedPacket): EffectPacket {
  const local = packet.localTargetingOverride;
  return {
    id: packet.id,
    packetIndex: packet.packetIndex,
    sortOrder: packet.packetIndex,
    hostility: packet.hostility,
    intention: packet.intention,
    type: packet.intention,
    specific: packet.specific,
    diceCount: packet.diceCount,
    potency: packet.potency,
    modifier: packet.modifier,
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
    localTargetingOverride: local
      ? {
          meleeTargets: local.meleeTargets,
          rangedTargets: local.rangedTargets,
          rangedDistanceFeet: local.rangedDistanceFeet,
          aoeCenterRangeFeet: local.aoeCenterRangeFeet,
          aoeCount: local.aoeCount,
          aoeShape: local.aoeShape,
          aoeSphereRadiusFeet: local.aoeSphereRadiusFeet,
          aoeConeLengthFeet: local.aoeConeLengthFeet,
          aoeLineWidthFeet: local.aoeLineWidthFeet,
          aoeLineLengthFeet: local.aoeLineLengthFeet,
        }
      : null,
  };
}

function mapMonsterPower(power: LoadedPower): Power {
  const packets = power.effectPackets.map(mapMonsterPacket);
  const primary = packets[0];
  return {
    id: power.id,
    sortOrder: power.sortOrder,
    name: power.name,
    description: power.description,
    schemaVersion: power.schemaVersion,
    rulesVersion: power.rulesVersion,
    contentRevision: power.contentRevision,
    previewRendererVersion: power.previewRendererVersion,
    status: power.status,
    descriptorChassis: power.descriptorChassis,
    descriptorChassisConfig: asRecord(power.descriptorChassisConfig),
    chargeType: power.chargeType,
    chargeTurns: power.chargeTurns,
    chargeBonusDicePerTurn: power.chargeBonusDicePerTurn,
    cooldownTurns: power.cooldownTurns,
    cooldownReduction: power.cooldownReduction,
    counterMode: power.counterMode,
    commitmentModifier: power.commitmentModifier,
    triggerMethod: power.triggerMethod,
    attachedHostAnchorType: power.attachedHostAnchorType,
    lifespanType: power.lifespanType,
    lifespanTurns: power.lifespanTurns,
    previewSummaryOverride: power.previewSummaryOverride,
    rangeCategories: power.rangeCategories.map((range) => range.rangeCategory),
    meleeTargets: power.meleeTargets,
    rangedTargets: power.rangedTargets,
    rangedDistanceFeet: power.rangedDistanceFeet,
    aoeCenterRangeFeet: power.aoeCenterRangeFeet,
    aoeCount: power.aoeCount,
    aoeShape: power.aoeShape,
    aoeSphereRadiusFeet: power.aoeSphereRadiusFeet,
    aoeConeLengthFeet: power.aoeConeLengthFeet,
    aoeLineWidthFeet: power.aoeLineWidthFeet,
    aoeLineLengthFeet: power.aoeLineLengthFeet,
    primaryDefenceGate: power.primaryDefenceGate
      ? {
          sourcePacketIndex: power.primaryDefenceGate.sourcePacketIndex,
          gateResult: power.primaryDefenceGate.gateResult,
          protectionChannel: power.primaryDefenceGate.protectionChannel,
          resistAttribute: power.primaryDefenceGate.resistAttribute,
          hostileEntryPattern: power.primaryDefenceGate.hostileEntryPattern,
          resolutionSource: power.primaryDefenceGate.resolutionSource,
        }
      : null,
    effectPackets: packets,
    intentions: packets,
    diceCount: Number(primary?.diceCount ?? 1),
    potency: Number(primary?.potency ?? 1),
    effectDurationType: primary?.effectDurationType ?? "INSTANT",
    effectDurationTurns: primary?.effectDurationTurns ?? null,
    durationType: primary?.effectDurationType ?? "INSTANT",
    durationTurns: primary?.effectDurationTurns ?? null,
  };
}

function traitDefinitions(monster: LoadedMonster): TraitAxisWeightDefinition[] {
  return monster.traits.map(({ trait }) => ({
    name: trait.name,
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

function resolveAndAttachPowers(
  powers: Power[],
  snapshot: PowerTuningSnapshot,
  context: PowerCostContext,
): {
  powers: Power[];
  authority: Array<{
    powerId: string | null;
    powerName: string;
    resolution: PowerCooldownAuthorityResolution;
  }>;
} {
  const authority = powers.map((power) => ({
    powerId: power.id ?? null,
    powerName: power.name,
    resolution: resolvePowerCooldownAuthority({
      power,
      mode: "ACTIVE_CURRENT_BALANCE",
      tuningSnapshot: snapshot,
      context,
    }),
  }));
  return {
    powers: powers.map((power, index) =>
      attachPowerCooldownAuthority(power, authority[index].resolution),
    ),
    authority,
  };
}

function runtimeSummary(powers: Power[]) {
  if (powers.length === 0) {
    return {
      status: "NO_ELIGIBLE_RUNTIME_ACTION" as const,
      powers: [],
    };
  }
  const summaries = powers.map((power) => {
    const adapted = adaptPowerToCombatActions(power);
    const status = adapted.unsupported.length > 0
      ? "UNSUPPORTED_INPUT"
      : adapted.actions.length > 0
        ? "SUPPORTED"
        : "NO_ELIGIBLE_RUNTIME_ACTION";
    return {
      powerId: power.id ?? null,
      power: power.name,
      status,
      actions: adapted.actions.map((action) => ({
        kind: action.kind,
        targetPolicy: action.targetPolicy,
        targetCount: action.targetCount,
        diceCount: action.diceCount,
        potency: action.potency,
        modifier: action.modifier,
        durationRounds: action.durationRounds ?? null,
        recurring: action.recurring?.kind ?? null,
        semanticFormat: action.modifier?.semanticFormat ?? null,
      })),
      unsupported: adapted.unsupported,
      warnings: adapted.warnings,
    };
  });
  return {
    status: summaries.some((summary) => summary.status === "UNSUPPORTED_INPUT")
      ? "UNSUPPORTED_INPUT" as const
      : summaries.some((summary) => summary.status === "SUPPORTED")
        ? "SUPPORTED" as const
        : "NO_ELIGIBLE_RUNTIME_ACTION" as const,
    powers: summaries,
  };
}

function powerContribution(params: {
  powers: Power[];
  costs: ReturnType<typeof resolvePowerCosts>;
}) {
  return {
    axisVector: params.costs.totals.axisVector,
    basePowerValue: params.costs.totals.basePowerValue,
    powerCount: params.costs.powers.length,
    powers: params.costs.powers.map((power, index) => ({
      id: power.powerId ?? null,
      name: power.name,
      axisVector: power.breakdown.axisVector,
      basePowerValue: power.breakdown.basePowerValue,
      authoredPower: params.powers[index] ?? null,
      cooldownAuthority: params.powers[index]?.cooldownAuthority ?? null,
      derivedCooldownTurns: power.derivedCooldownTurns,
      derivedCooldownLoad: power.derivedCooldown.cooldownLoad,
      cooldownTurns: params.powers[index]?.cooldownTurns ?? null,
      cooldownReduction: params.powers[index]?.cooldownReduction ?? 0,
    })),
    debug: params.costs,
  };
}

function semanticCostDiagnostics(costs: ReturnType<typeof resolvePowerCosts>) {
  const powers = costs.powers.map((power) => {
    const calibration = asRecord(power.breakdown.debug.augmentDebuffCalibration);
    return {
      powerId: power.powerId ?? null,
      powerName: power.name,
      status: asString(calibration.status) || "UNKNOWN",
      aggregateDeliveryUnits: asNullableNumber(calibration.aggregateDeliveryUnits),
      roundedFinalBpv: asNullableNumber(calibration.roundedFinalBpv),
      warnings: Array.isArray(calibration.warnings) ? calibration.warnings : [],
      unresolvedDiagnostics: Array.isArray(calibration.unresolvedDiagnostics)
        ? calibration.unresolvedDiagnostics
        : [],
    };
  });
  const delivery = powers.map((power) => power.aggregateDeliveryUnits);
  return {
    powers,
    aggregateDeliveryUnits: delivery.every((value) => value === null)
      ? null
      : round(delivery.reduce<number>((sum, value) => sum + (value ?? 0), 0), 6),
  };
}

function summarizeOutcome(outcome: ReturnType<typeof computeMonsterOutcomes>) {
  const debug = asRecord(outcome.debug);
  const semanticSynergy = asRecord(debug.semanticSynergyAxisModel);
  const finalPre = asRecord(debug.finalPreNormalizationAxes);
  const powerDebug = asRecord(debug.powerContribution);
  const canonical = axisValues(asRecord(powerDebug.canonicalPowerAxisVector));
  const effective = axisValues(asRecord(powerDebug.effectivePowerAxisVector));
  const perPowerAvailability = Array.isArray(powerDebug.perPowerAvailability)
    ? powerDebug.perPowerAvailability.map((entry) => {
        const row = asRecord(entry);
        return {
          id: row.id ?? null,
          name: row.name ?? null,
          cooldownSource: row.cooldownSource ?? null,
          authoritySource: row.authoritySource ?? null,
          authorityTuningSetId: row.authorityTuningSetId ?? null,
          effectiveCooldownTurns: row.cooldownTurns ?? null,
          unresolvedError: row.unresolvedError ?? null,
          canonicalPowerAxisVector: axisValues(asRecord(row.canonicalPowerAxisVector)),
          effectivePowerAxisVector: axisValues(asRecord(row.effectivePowerAxisVector)),
        };
      })
    : [];
  return {
    finalSynergy: round(outcome.radarAxes.synergy, 6),
    rawSynergy: round(asNumber(finalPre.synergy), 6),
    canonicalPowerAxisVector: canonical,
    effectivePowerAxisVector: effective,
    canonicalResolverSynergy: canonical.synergy,
    effectiveResolverSynergy: effective.synergy,
    radarAxes: axisValues(outcome.radarAxes),
    perPowerAvailability,
    powerWarnings: Array.isArray(powerDebug.warnings) ? powerDebug.warnings : [],
    suppressedByMissingAuthority: perPowerAvailability.some(
      (row) => row.unresolvedError !== null || row.cooldownSource === "UNRESOLVED",
    ),
    semanticSynergy: {
      mode: semanticSynergy.mode ?? null,
      rawSemanticSupport: semanticSynergy.rawSemanticSupport ?? null,
      tierScale: semanticSynergy.tierScale ?? null,
      activeCapacity: semanticSynergy.activeCapacity ?? null,
      detectedSemanticPacketCount: semanticSynergy.detectedSemanticPacketCount ?? 0,
      semanticPowerIds: Array.isArray(semanticSynergy.semanticPowerIds)
        ? semanticSynergy.semanticPowerIds
        : [],
      diagnostics: Array.isArray(semanticSynergy.diagnostics) ? semanticSynergy.diagnostics : [],
      excludedLegacySynergySources: Array.isArray(
        semanticSynergy.excludedLegacySynergySources
      )
        ? semanticSynergy.excludedLegacySynergySources
        : [],
      legalActivationTurns: Array.isArray(semanticSynergy.legalActivationTurns)
        ? semanticSynergy.legalActivationTurns
        : [],
      optimizer: semanticSynergy.optimizer ?? null,
    },
  };
}

function computeFixture(params: {
  id: string;
  description: string;
  powers: Power[];
  tuning: Awaited<ReturnType<typeof loadActiveTuning>>;
  expectedRuntime: "SUPPORTED" | "UNSUPPORTED_INPUT" | "NO_ELIGIBLE_RUNTIME_ACTION";
}) {
  const context: PowerCostContext = { level: 3, tier: "SOLDIER" };
  const hydrated = resolveAndAttachPowers(params.powers, params.tuning.powerSnapshot, context);
  const costs = resolvePowerCosts(hydrated.powers, params.tuning.powerSnapshot, context);
  const outcome = computeMonsterOutcomes(baseMonster(hydrated.powers), params.tuning.calculatorConfig, {
    protectionTuning: params.tuning.combatValues,
    powerContribution: powerContribution({ powers: hydrated.powers, costs }),
  });
  const runtime = runtimeSummary(hydrated.powers);
  const summary = summarizeOutcome(outcome);
  return {
    id: params.id,
    description: params.description,
    expectedRuntime: params.expectedRuntime,
    powers: hydrated.powers.map((power) => ({
      id: power.id ?? null,
      name: power.name,
      packetIds: power.effectPackets.map((packet) => packet.id ?? null),
      modifiers: power.effectPackets.map((packet) => packet.modifier ?? null),
      applyTo: power.effectPackets.map((packet) => packet.applyTo ?? null),
      explicitTargets: power.rangeCategories?.includes("AOE")
        ? power.aoeCount ?? null
        : power.rangedTargets ?? (power.effectPackets.some((packet) => packet.applyTo === "SELF") ? 1 : null),
    })),
    authority: hydrated.authority.map((entry, index) => ({
      powerId: entry.powerId,
      powerName: entry.powerName,
      resolved: entry.resolution.ok,
      attached: hydrated.powers[index]?.cooldownAuthority != null,
      source: entry.resolution.ok ? entry.resolution.result.source : null,
      tuningSetId: entry.resolution.ok ? entry.resolution.result.tuningSetId : null,
      tuningUpdatedAt: entry.resolution.ok ? entry.resolution.result.tuningUpdatedAt : null,
      effectiveCooldownTurns: entry.resolution.ok
        ? entry.resolution.result.effectiveCooldownTurns
        : null,
      storedCooldownTurns: entry.resolution.ok
        ? entry.resolution.result.storedCooldownTurns
        : entry.resolution.storedCooldownTurns,
      mismatch: entry.resolution.ok ? entry.resolution.result.mismatch : null,
      errorCode: entry.resolution.ok ? null : entry.resolution.errorCode,
      message: entry.resolution.ok ? null : entry.resolution.message,
      warnings: entry.resolution.ok ? entry.resolution.result.warnings : [],
    })),
    runtime,
    semanticDelivery: semanticCostDiagnostics(costs),
    basePowerValue: round(costs.totals.basePowerValue, 6),
    ...summary,
  };
}

function buildFixtures(tuning: Awaited<ReturnType<typeof loadActiveTuning>>) {
  const legacyOne = augmentPower({
    identity: "legacy-one-target-m3",
    name: "Legacy One-Target M3 Augment",
    modifier: null,
    targets: 1,
  });
  const legacyAreaOne = augmentPower({
    identity: "legacy-area-explicit-one-m3",
    name: "Legacy 10-Foot Area M3 Augment, One Expected Target",
    modifier: null,
    range: "AOE",
    targets: 1,
  });
  const legacyThree = augmentPower({
    identity: "legacy-explicit-three-m3",
    name: "Legacy Explicit Three-Target M3 Augment",
    modifier: null,
    targets: 3,
  });
  const newOne = augmentPower({
    identity: "new-format-one-ally-m3",
    name: "New-Format One-Ally M3 Augment",
    modifier: 3,
    targets: 1,
  });
  const newThree = augmentPower({
    identity: "new-format-three-allies-m3",
    name: "New-Format Three-Allies M3 Augment",
    modifier: 3,
    targets: 3,
  });
  const newLong = augmentPower({
    identity: "new-format-one-ally-m3-duration-four",
    name: "New-Format One-Ally M3 Augment, Duration Four",
    modifier: 3,
    targets: 1,
    durationTurns: 4,
  });
  const selfOnly = augmentPower({
    identity: "new-format-self-only-m3",
    name: "New-Format Self-Only M3 Augment",
    modifier: 3,
    applyTo: "SELF",
    range: "SELF",
    targets: 1,
  });
  const duplicateLeft = augmentPower({
    identity: "new-format-duplicate-left-m3",
    name: "New-Format Exact Semantic Duplicate A",
    modifier: 3,
    targets: 1,
  });
  const duplicateRight = augmentPower({
    identity: "new-format-duplicate-right-m3",
    name: "New-Format Exact Semantic Duplicate B",
    modifier: 3,
    targets: 1,
  });
  return [
    computeFixture({
      id: "no_augment_baseline",
      description: "No-Augment baseline",
      powers: [],
      tuning,
      expectedRuntime: "NO_ELIGIBLE_RUNTIME_ACTION",
    }),
    computeFixture({
      id: "legacy_one_target_m3",
      description: "Current Modifier-null one-target 3-dice/Potency-3 Augment",
      powers: [legacyOne],
      tuning,
      expectedRuntime: "SUPPORTED",
    }),
    computeFixture({
      id: "legacy_area_explicit_one_m3",
      description: "Current Modifier-null 10-foot area shape with expected target count held at one",
      powers: [legacyAreaOne],
      tuning,
      expectedRuntime: "SUPPORTED",
    }),
    computeFixture({
      id: "legacy_explicit_three_m3",
      description: "Current Modifier-null explicit three-target equivalent",
      powers: [legacyThree],
      tuning,
      expectedRuntime: "SUPPORTED",
    }),
    computeFixture({
      id: "new_format_one_ally_m3",
      description: "Diagnostic new-format one-ally Modifier-3 Augment",
      powers: [newOne],
      tuning,
      expectedRuntime: "SUPPORTED",
    }),
    computeFixture({
      id: "new_format_three_allies_m3",
      description: "Diagnostic new-format explicit three-ally Modifier-3 Augment",
      powers: [newThree],
      tuning,
      expectedRuntime: "SUPPORTED",
    }),
    computeFixture({
      id: "new_format_one_ally_m3_duration_four",
      description: "Diagnostic new-format one-ally Modifier-3 Augment with four-turn duration",
      powers: [newLong],
      tuning,
      expectedRuntime: "SUPPORTED",
    }),
    computeFixture({
      id: "new_format_self_only_m3",
      description: "Diagnostic self-only new-format Modifier-3 Augment",
      powers: [selfOnly],
      tuning,
      expectedRuntime: "SUPPORTED",
    }),
    computeFixture({
      id: "new_format_exact_semantic_duplicate",
      description: "Two semantically identical new-format powers with distinct deterministic identities",
      powers: [duplicateLeft, duplicateRight],
      tuning,
      expectedRuntime: "SUPPORTED",
    }),
    computeFixture({
      id: "unsupported_support",
      description: "Unsupported generic Support input remains explicitly unsupported",
      powers: [unsupportedSupportPower()],
      tuning,
      expectedRuntime: "UNSUPPORTED_INPUT",
    }),
  ];
}

function calculatorMonsterForPersisted(monster: LoadedMonster, powers: Power[]): MonsterUpsertInput {
  return {
    ...baseMonster(powers),
    name: monster.name,
    imageUrl: monster.imageUrl,
    imagePosX: monster.imagePosX,
    imagePosY: monster.imagePosY,
    level: monster.level,
    tier: monster.tier,
    legendary: monster.legendary,
    mainHandItemId: monster.mainHandItemId,
    offHandItemId: monster.offHandItemId,
    smallItemId: monster.smallItemId,
    headArmorItemId: monster.headArmorItemId,
    shoulderArmorItemId: monster.shoulderArmorItemId,
    torsoArmorItemId: monster.torsoArmorItemId,
    legsArmorItemId: monster.legsArmorItemId,
    feetArmorItemId: monster.feetArmorItemId,
    headItemId: monster.headItemId,
    neckItemId: monster.neckItemId,
    armsItemId: monster.armsItemId,
    beltItemId: monster.beltItemId,
    physicalResilienceCurrent: monster.physicalResilienceCurrent,
    physicalResilienceMax: monster.physicalResilienceMax,
    mentalPerseveranceCurrent: monster.mentalPerseveranceCurrent,
    mentalPerseveranceMax: monster.mentalPerseveranceMax,
    physicalProtection: monster.physicalProtection,
    mentalProtection: monster.mentalProtection,
    naturalPhysicalProtection: monster.naturalPhysicalProtection,
    naturalMentalProtection: monster.naturalMentalProtection,
    attackDie: monster.attackDie,
    attackResistDie: monster.attackResistDie,
    attackModifier: monster.attackModifier,
    guardDie: monster.guardDie,
    guardResistDie: monster.guardResistDie,
    guardModifier: monster.guardModifier,
    fortitudeDie: monster.fortitudeDie,
    fortitudeResistDie: monster.fortitudeResistDie,
    fortitudeModifier: monster.fortitudeModifier,
    intellectDie: monster.intellectDie,
    intellectResistDie: monster.intellectResistDie,
    intellectModifier: monster.intellectModifier,
    synergyDie: monster.synergyDie,
    synergyResistDie: monster.synergyResistDie,
    synergyModifier: monster.synergyModifier,
    braveryDie: monster.braveryDie,
    braveryResistDie: monster.braveryResistDie,
    braveryModifier: monster.braveryModifier,
    weaponSkillValue: monster.weaponSkillValue,
    weaponSkillModifier: monster.weaponSkillModifier,
    armorSkillValue: monster.armorSkillValue,
    armorSkillModifier: monster.armorSkillModifier,
    powers,
  };
}

function summarizePersistedAsset(
  monster: LoadedMonster,
  authoredPowers: Power[],
  tuning: Awaited<ReturnType<typeof loadActiveTuning>>,
) {
  const context: PowerCostContext = { level: monster.level, tier: monster.tier };
  const hydrated = resolveAndAttachPowers(authoredPowers, tuning.powerSnapshot, context);
  const costs = resolvePowerCosts(hydrated.powers, tuning.powerSnapshot, context);
  const outcome = computeMonsterOutcomes(
    calculatorMonsterForPersisted(monster, hydrated.powers),
    tuning.calculatorConfig,
    {
      protectionTuning: tuning.combatValues,
      traitAxisBonuses: computeTraitAxisBonuses(traitDefinitions(monster), monster.level),
      legacyNonPowerSynergySources: computeTraitLegacySynergySources(
        traitDefinitions(monster),
        monster.level,
      ),
      powerContribution: powerContribution({ powers: hydrated.powers, costs }),
    },
  );
  return {
    monsterId: monster.id,
    name: monster.name,
    level: monster.level,
    tier: monster.tier,
    powerIds: hydrated.powers.map((power) => power.id ?? null),
    packetIds: hydrated.powers.flatMap((power) =>
      power.effectPackets.map((packet) => packet.id ?? null),
    ),
    modifiers: hydrated.powers.flatMap((power) =>
      power.effectPackets.map((packet) => packet.modifier ?? null),
    ),
    authority: hydrated.authority.map((entry) => ({
      powerId: entry.powerId,
      powerName: entry.powerName,
      resolved: entry.resolution.ok,
      source: entry.resolution.ok ? entry.resolution.result.source : null,
      tuningSetId: entry.resolution.ok ? entry.resolution.result.tuningSetId : null,
      basePowerValue: entry.resolution.ok
        ? round(entry.resolution.result.basePowerValue, 6)
        : null,
      errorCode: entry.resolution.ok ? null : entry.resolution.errorCode,
    })),
    runtime: runtimeSummary(hydrated.powers),
    basePowerValue: round(costs.totals.basePowerValue, 6),
    ...summarizeOutcome(outcome),
  };
}

function editorEquivalentPowers(powers: Power[]): Power[] {
  return powers.map((power) => {
    const packets = power.effectPackets.map((packet) => ({
      ...packet,
      detailsJson: JSON.parse(JSON.stringify(packet.detailsJson)) as Record<string, unknown>,
    }));
    return {
      ...power,
      cooldownAuthority: null,
      effectPackets: packets,
      intentions: packets,
    };
  });
}

function buildMappingEvidence(monster: LoadedMonster) {
  const persistedPower = monster.powers.find((power) => power.effectPackets.length > 0);
  if (!persistedPower) {
    throw new Error(`Selected persisted asset ${monster.id} has no packet-bearing power.`);
  }
  const persistedPacket = persistedPower.effectPackets[0];
  const mappedPower = mapMonsterPower(persistedPower);
  const mappedPacket = mappedPower.effectPackets[0];
  const nonNullProbe = mapMonsterPacket({
    ...persistedPacket,
    id: stableId("packet", "persisted-mapping-non-null-modifier-probe"),
    modifier: 3,
  });
  const nullProbe = mapMonsterPacket({
    ...persistedPacket,
    id: stableId("packet", "persisted-mapping-null-modifier-probe"),
    modifier: null,
  });
  const allMappedPowers = monster.powers.map(mapMonsterPower);
  return {
    selectedPowerId: persistedPower.id,
    selectedPacketId: persistedPacket.id,
    selectedPersistedModifier: persistedPacket.modifier,
    selectedMappedModifier: mappedPacket.modifier ?? null,
    powerIdPreserved: mappedPower.id === persistedPower.id,
    packetIdPreserved: mappedPacket.id === persistedPacket.id,
    persistedModifiersPreserved: monster.powers.every((power, powerIndex) =>
      power.effectPackets.every(
        (packet, packetIndex) =>
          allMappedPowers[powerIndex]?.effectPackets[packetIndex]?.modifier === packet.modifier,
      ),
    ),
    persistedPowerIdsPreserved: monster.powers.every(
      (power, index) => allMappedPowers[index]?.id === power.id,
    ),
    persistedPacketIdsPreserved: monster.powers.every((power, powerIndex) =>
      power.effectPackets.every(
        (packet, packetIndex) =>
          allMappedPowers[powerIndex]?.effectPackets[packetIndex]?.id === packet.id,
      ),
    ),
    nonNullModifierProbe: {
      source: 3,
      mapped: nonNullProbe.modifier ?? null,
      preserved: nonNullProbe.modifier === 3,
    },
    nullModifierProbe: {
      source: null,
      mapped: nullProbe.modifier ?? null,
      preserved: nullProbe.modifier === null,
    },
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
    status: set.status,
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
    where: { OR: [{ campaignId: CAMPAIGN_ID }, { level: 3 }] },
    orderBy: { name: "asc" },
    include: {
      naturalAttack: true,
      attacks: { orderBy: { sortOrder: "asc" } },
      traits: { include: { trait: true }, orderBy: { sortOrder: "asc" } },
      powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
    },
  });
}

function fixtureById(fixtures: ReturnType<typeof buildFixtures>, id: string) {
  const fixture = fixtures.find((entry) => entry.id === id);
  if (!fixture) throw new Error(`Missing deterministic fixture ${id}.`);
  return fixture;
}

function compareSemanticAxisGap(fixtures: ReturnType<typeof buildFixtures>) {
  const one = fixtureById(fixtures, "new_format_one_ally_m3");
  const three = fixtureById(fixtures, "new_format_three_allies_m3");
  const long = fixtureById(fixtures, "new_format_one_ally_m3_duration_four");
  const breadthPricingChanges =
    asNumber(three.semanticDelivery.aggregateDeliveryUnits) >
      asNumber(one.semanticDelivery.aggregateDeliveryUnits) &&
    three.basePowerValue > one.basePowerValue;
  const breadthCurrentSynergyChanges =
    three.canonicalResolverSynergy !== one.canonicalResolverSynergy ||
    three.effectiveResolverSynergy !== one.effectiveResolverSynergy ||
    three.finalSynergy !== one.finalSynergy;
  const persistencePricingChanges =
    asNumber(long.semanticDelivery.aggregateDeliveryUnits) >
      asNumber(one.semanticDelivery.aggregateDeliveryUnits) &&
    long.basePowerValue > one.basePowerValue;
  const persistenceCurrentSynergyChanges =
    long.canonicalResolverSynergy !== one.canonicalResolverSynergy ||
    long.effectiveResolverSynergy !== one.effectiveResolverSynergy ||
    long.finalSynergy !== one.finalSynergy;
  return {
    label: "Diagnostic current-state comparison; not an accepted semantic calibration",
    breadth: {
      oneTargetDeliveryUnits: one.semanticDelivery.aggregateDeliveryUnits,
      threeTargetDeliveryUnits: three.semanticDelivery.aggregateDeliveryUnits,
      oneTargetBpv: one.basePowerValue,
      threeTargetBpv: three.basePowerValue,
      oneTargetCanonicalSynergy: one.canonicalResolverSynergy,
      threeTargetCanonicalSynergy: three.canonicalResolverSynergy,
      oneTargetEffectiveSynergy: one.effectiveResolverSynergy,
      threeTargetEffectiveSynergy: three.effectiveResolverSynergy,
      oneTargetFinalSynergy: one.finalSynergy,
      threeTargetFinalSynergy: three.finalSynergy,
      semanticPricingChanges: breadthPricingChanges,
      currentSynergyChanges: breadthCurrentSynergyChanges,
      gapDetected: breadthPricingChanges && !breadthCurrentSynergyChanges,
    },
    persistence: {
      durationTwoDeliveryUnits: one.semanticDelivery.aggregateDeliveryUnits,
      durationFourDeliveryUnits: long.semanticDelivery.aggregateDeliveryUnits,
      durationTwoBpv: one.basePowerValue,
      durationFourBpv: long.basePowerValue,
      durationTwoCanonicalSynergy: one.canonicalResolverSynergy,
      durationFourCanonicalSynergy: long.canonicalResolverSynergy,
      durationTwoEffectiveSynergy: one.effectiveResolverSynergy,
      durationFourEffectiveSynergy: long.effectiveResolverSynergy,
      durationTwoFinalSynergy: one.finalSynergy,
      durationFourFinalSynergy: long.finalSynergy,
      semanticPricingChanges: persistencePricingChanges,
      currentSynergyChanges: persistenceCurrentSynergyChanges,
      gapDetected: persistencePricingChanges && !persistenceCurrentSynergyChanges,
    },
  };
}

async function buildPayload() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");
  try {
    const [tuning, monsters] = await Promise.all([loadActiveTuning(prisma), loadMonsters(prisma)]);
    const selectedAsset = monsters.find((monster) =>
      monster.powers.some((power) => power.effectPackets.length > 0),
    );
    if (!selectedAsset) {
      throw new Error("No packet-bearing persisted monster is available for saved/editor parity.");
    }
    const mappedPowers = selectedAsset.powers.map(mapMonsterPower);
    const saved = summarizePersistedAsset(selectedAsset, mappedPowers, tuning);
    const editorEquivalent = summarizePersistedAsset(
      selectedAsset,
      editorEquivalentPowers(mappedPowers),
      tuning,
    );
    const mapping = buildMappingEvidence(selectedAsset);
    const fixtures = buildFixtures(tuning);
    const reconciliationStarted = performance.now();
    const levelThreeAssets = monsters
      .filter((monster) => monster.level === 3)
      .map((monster) => {
        const started = performance.now();
        const summary = summarizePersistedAsset(
          monster,
          monster.powers.map(mapMonsterPower),
          tuning,
        );
        return { ...summary, calculatorRuntimeMs: performance.now() - started };
      });
    const reconciliationRuntimeMs = performance.now() - reconciliationStarted;
    const sortedAssetRuntimeMs = levelThreeAssets
      .map((asset) => asset.calculatorRuntimeMs)
      .sort((left, right) => left - right);
    const medianAssetRuntimeMs = sortedAssetRuntimeMs.length === 0
      ? 0
      : sortedAssetRuntimeMs.length % 2 === 1
        ? sortedAssetRuntimeMs[Math.floor(sortedAssetRuntimeMs.length / 2)]
        : (
            sortedAssetRuntimeMs[sortedAssetRuntimeMs.length / 2 - 1] +
            sortedAssetRuntimeMs[sortedAssetRuntimeMs.length / 2]
          ) / 2;
    const namedAsset = (fragment: string) =>
      levelThreeAssets.find((asset) => asset.name.toLowerCase().includes(fragment.toLowerCase()));
    const courtMage = namedAsset("court mage");
    const direWolf = namedAsset("dire wolf");
    const gazzkill = namedAsset("gazzkill");
    const wolfBerzerker = namedAsset("wolf berzerker");
    const gazzkillRecord = monsters.find((monster) => monster.id === GAZZKILL_MONSTER_ID);
    const gazzkillRilePower = gazzkillRecord?.powers.find(
      (power) => power.id === GAZZKILL_RILE_POWER_ID,
    );
    const gazzkillRilePacket = gazzkillRilePower?.effectPackets.find(
      (packet) => packet.id === GAZZKILL_RILE_PACKET_ID,
    );
    const gazzkillRileAuthority = gazzkill?.authority.find(
      (entry) => entry.powerId === GAZZKILL_RILE_POWER_ID,
    );
    const gazzkillRileAvailability = gazzkill?.perPowerAvailability.find(
      (entry) => entry.id === GAZZKILL_RILE_POWER_ID,
    );
    const gazzkillRileRuntime = gazzkill?.runtime.powers.find(
      (power) => power.powerId === GAZZKILL_RILE_POWER_ID,
    );
    const remainingLegacyLevelThreeAugmentPacketIds = monsters
      .filter((monster) => monster.level === 3)
      .flatMap((monster) => monster.powers)
      .flatMap((power) => power.effectPackets)
      .filter((packet) => packet.intention === "AUGMENT" && packet.modifier == null)
      .map((packet) => packet.id)
      .sort();
    const genericSupportAssets = levelThreeAssets.filter((asset) => {
      const monster = monsters.find((candidate) => candidate.id === asset.monsterId);
      return monster?.powers.some((power) =>
        power.effectPackets.some((packet) => packet.intention === "SUPPORT"),
      );
    });
    const mixedModelAssets = levelThreeAssets.filter(
      (asset) => asset.semanticSynergy.mode === "MIXED_UNSUPPORTED",
    );
    const semanticAxisGap = compareSemanticAxisGap(fixtures);
    const fixtureIds = fixtures.map((fixture) => fixture.id);
    const syntheticPowerIds = fixtures.flatMap((fixture) =>
      fixture.powers.map((power) => power.id).filter((id): id is string => id !== null),
    );
    const syntheticPacketIds = fixtures.flatMap((fixture) =>
      fixture.powers.flatMap((power) =>
        power.packetIds.filter((id): id is string => id !== null),
      ),
    );
    const expectedSupported = fixtures.filter((fixture) => fixture.expectedRuntime === "SUPPORTED");
    const expectedUnsupported = fixtures.filter(
      (fixture) => fixture.expectedRuntime === "UNSUPPORTED_INPUT",
    );
    const fixtureAuthorityResolved = fixtures.every((fixture) =>
      fixture.authority.every((entry) => entry.resolved && entry.attached),
    );
    const persistedAuthorityResolved =
      saved.authority.every((entry) => entry.resolved) &&
      editorEquivalent.authority.every((entry) => entry.resolved);
    const checks = {
      persistedModifierPreserved:
        mapping.persistedModifiersPreserved &&
        mapping.nonNullModifierProbe.preserved &&
        mapping.nullModifierProbe.preserved,
      persistedStablePowerIdsPreserved:
        mapping.powerIdPreserved && mapping.persistedPowerIdsPreserved,
      persistedStablePacketIdsPreserved:
        mapping.packetIdPreserved && mapping.persistedPacketIdsPreserved,
      deterministicSyntheticPowerIds:
        syntheticPowerIds.length > 0 && new Set(syntheticPowerIds).size === syntheticPowerIds.length,
      deterministicSyntheticPacketIds:
        syntheticPacketIds.length > 0 && new Set(syntheticPacketIds).size === syntheticPacketIds.length,
      cooldownAuthorityResolvedAndAttached: fixtureAuthorityResolved && persistedAuthorityResolved,
      activeCooldownAuthorityProvenance: fixtures.every((fixture) =>
        fixture.authority.every(
          (entry) =>
            entry.source === "ACTIVE_TUNING" && entry.tuningSetId === tuning.powerSnapshot.setId,
        ),
      ),
      supportedAdapterCasesRemainSupported: expectedSupported.every(
        (fixture) => fixture.runtime.status === "SUPPORTED",
      ),
      unsupportedAdapterCasesRemainUnsupported: expectedUnsupported.every(
        (fixture) => fixture.runtime.status === "UNSUPPORTED_INPUT",
      ),
      noAuthoritySuppression: fixtures.every(
        (fixture) => !fixture.suppressedByMissingAuthority,
      ) && !saved.suppressedByMissingAuthority && !editorEquivalent.suppressedByMissingAuthority,
      nonzeroCanonicalAxesRemainEffective: fixtures.every((fixture) =>
        fixture.perPowerAvailability.every((power) => {
          const canonicalTotal = Object.values(power.canonicalPowerAxisVector).reduce(
            (sum, value) => sum + Math.abs(value),
            0,
          );
          const effectiveTotal = Object.values(power.effectivePowerAxisVector).reduce(
            (sum, value) => sum + Math.abs(value),
            0,
          );
          return canonicalTotal === 0 || effectiveTotal > 0;
        }),
      ),
      savedEditorParity:
        Math.abs(saved.finalSynergy - editorEquivalent.finalSynergy) <= 0.000001 &&
        Math.abs(saved.rawSynergy - editorEquivalent.rawSynergy) <= 0.000001 &&
        axesEqual(saved.canonicalPowerAxisVector, editorEquivalent.canonicalPowerAxisVector) &&
        axesEqual(saved.effectivePowerAxisVector, editorEquivalent.effectivePowerAxisVector),
      finiteCalculatorOutputs:
        fixtures.every((fixture) => axesAreFinite(fixture.radarAxes)) &&
        axesAreFinite(saved.radarAxes) &&
        axesAreFinite(editorEquivalent.radarAxes),
      noAugmentBaselineStable: (() => {
        const baseline = fixtureById(fixtures, "no_augment_baseline");
        return baseline.finalSynergy === 0 && baseline.rawSynergy === 0;
      })(),
      exactDuplicateFixtureIdentityDistinct: (() => {
        const duplicate = fixtureById(fixtures, "new_format_exact_semantic_duplicate");
        return duplicate.powers.length === 2 &&
          new Set(duplicate.powers.map((power) => power.id)).size === 2 &&
          new Set(duplicate.powers.flatMap((power) => power.packetIds)).size === 2;
      })(),
      semanticDeliveryDiagnosticsAvailable: fixtures
        .filter((fixture) => fixture.id.startsWith("new_format_"))
        .every((fixture) => fixture.semanticDelivery.aggregateDeliveryUnits !== null),
      semanticAxisGapEvaluated:
        semanticAxisGap.breadth.semanticPricingChanges &&
        semanticAxisGap.persistence.semanticPricingChanges,
      humanJsonOutputContract:
        fixtureIds.length === new Set(fixtureIds).size && fixtureIds.length === fixtures.length,
      databaseReadOnly:
        DATABASE_OPERATIONS.every(
          (operation) => operation.endsWith(".findFirst") || operation.endsWith(".findMany"),
        ),
      courtMageUsesApprovedSemanticModel:
        Boolean(courtMage) &&
        courtMage?.semanticSynergy.mode === "LEVEL_3_SEMANTIC" &&
        Math.abs(Number(courtMage?.semanticSynergy.rawSemanticSupport) - 7.734375) <= 0.000001 &&
        Math.abs(Number(courtMage?.finalSynergy) - 3.280608242480187) <= 0.000001 &&
        courtMage.authority.some(
          (entry) =>
            courtMage.semanticSynergy.semanticPowerIds.includes(entry.powerId) &&
            Math.abs(Number(entry.basePowerValue) - 9.5) <= 0.000001,
        ),
      direWolfUsesSemanticHowlWithPackTacticsExcluded:
        Boolean(direWolf) &&
        direWolf?.semanticSynergy.mode === "LEVEL_3_SEMANTIC_WITH_EXCLUSIONS" &&
        Math.abs(Number(direWolf?.semanticSynergy.rawSemanticSupport) - 22.734375) <= 0.000001 &&
        Math.abs(Number(direWolf?.finalSynergy) - 4.923795225863854) <= 0.000001 &&
        direWolf.semanticSynergy.excludedLegacySynergySources.some(
          (source) =>
            asRecord(source).name === "Pack Tactics" &&
            Math.abs(asNumber(asRecord(source).amount) - 0.75) <= 0.000001,
        ),
      gazzkillStableMonsterIdentity:
        gazzkillRecord?.id === GAZZKILL_MONSTER_ID &&
        gazzkillRecord.name === "Gazzkill" &&
        gazzkillRecord.level === 3 &&
        gazzkillRecord.tier === "BOSS",
      gazzkillRileStablePowerIdentity:
        gazzkillRilePower?.id === GAZZKILL_RILE_POWER_ID &&
        gazzkillRilePower.name === "Rile'em'up!" &&
        gazzkillRilePower.sortOrder === 2,
      gazzkillRileStablePacketIdentity:
        gazzkillRilePacket?.id === GAZZKILL_RILE_PACKET_ID &&
        gazzkillRilePacket.packetIndex === 0,
      gazzkillRileUsesApprovedSemanticContract:
        gazzkillRilePacket?.intention === "AUGMENT" &&
        gazzkillRilePacket.hostility === "NON_HOSTILE" &&
        gazzkillRilePacket.targetedAttribute === "ATTACK" &&
        gazzkillRilePacket.diceCount === 2 &&
        gazzkillRilePacket.potency === 1 &&
        gazzkillRilePacket.modifier === 1,
      gazzkillRileTargetContractPreserved:
        gazzkillRilePower?.rangeCategories.length === 1 &&
        gazzkillRilePower.rangeCategories[0]?.rangeCategory === "RANGED" &&
        gazzkillRilePower.rangedTargets === 3 &&
        gazzkillRilePower.rangedDistanceFeet === 30 &&
        gazzkillRilePacket?.applyTo === "PRIMARY_TARGET" &&
        asNumber(asRecord(gazzkillRilePacket.detailsJson).rangeValue) === 30 &&
        asNumber(asRecord(asRecord(gazzkillRilePacket.detailsJson).rangeExtra).targets) === 3,
      gazzkillRileTimingAndDependencyPreserved:
        gazzkillRilePower?.descriptorChassis === "IMMEDIATE" &&
        gazzkillRilePacket?.effectTimingType === "ON_CAST" &&
        gazzkillRilePacket.effectTimingTurns === null &&
        gazzkillRilePacket.effectDurationType === "UNTIL_TARGET_NEXT_TURN" &&
        gazzkillRilePacket.effectDurationTurns === null &&
        gazzkillRilePacket.secondaryDependencyMode === null &&
        gazzkillRilePacket.triggerConditionText === null,
      gazzkillRileEconomicAuthorityApproved:
        gazzkillRileAuthority?.resolved === true &&
        gazzkillRileAuthority.source === "ACTIVE_TUNING" &&
        Math.abs(Number(gazzkillRileAuthority.basePowerValue) - 7.5) <= 0.000001,
      gazzkillRileCooldownAuthorityApproved:
        gazzkillRilePower?.cooldownTurns === 1 &&
        gazzkillRileAvailability?.effectiveCooldownTurns === 1 &&
        gazzkillRileAvailability.cooldownSource === "ACTIVE_TUNING" &&
        gazzkillRileAvailability.unresolvedError === null,
      gazzkillRileSemanticSynergyApproved:
        gazzkill?.semanticSynergy.mode === "LEVEL_3_SEMANTIC" &&
        gazzkillRecord?.synergyDie === "D6" &&
        gazzkill.semanticSynergy.semanticPowerIds.length === 1 &&
        gazzkill.semanticSynergy.semanticPowerIds[0] === GAZZKILL_RILE_POWER_ID &&
        Math.abs(Number(gazzkill.semanticSynergy.rawSemanticSupport) - 6.75) <= 0.000001 &&
        Math.abs(Number(gazzkill.finalSynergy) - 1.229711) <= 0.000001 &&
        gazzkill.semanticSynergy.legalActivationTurns.length === 1 &&
        gazzkill.semanticSynergy.legalActivationTurns[0]?.turns.join(",") === "1,3,5",
      gazzkillRileNoLegacyMixedOrIdentityDiagnostics:
        gazzkill?.semanticSynergy.diagnostics.every(
          (diagnostic) =>
            diagnostic.code !== "LEGACY_SYNERGY_MODEL" &&
            diagnostic.code !== "MIXED_SEMANTIC_LEGACY_SYNERGY_UNSUPPORTED" &&
            !diagnostic.code.includes("MISSING_IDENTITY") &&
            !diagnostic.code.includes("COOLDOWN"),
        ) === true,
      gazzkillRileRuntimeHydrationPreserved:
        gazzkillRileRuntime?.status === "SUPPORTED" &&
        gazzkillRileRuntime.unsupported.length === 0 &&
        gazzkillRileRuntime.warnings.length === 0 &&
        gazzkillRileRuntime.actions.length === 1 &&
        gazzkillRileRuntime.actions[0]?.kind === "buff" &&
        gazzkillRileRuntime.actions[0]?.targetPolicy === "ally" &&
        gazzkillRileRuntime.actions[0]?.targetCount === 3 &&
        gazzkillRileRuntime.actions[0]?.diceCount === 2 &&
        gazzkillRileRuntime.actions[0]?.potency === 1 &&
        gazzkillRileRuntime.actions[0]?.modifier?.amount === 1 &&
        gazzkillRileRuntime.actions[0]?.durationRounds === 1 &&
        gazzkillRileRuntime.actions[0]?.semanticFormat === "augmentDebuffThreeFieldV1",
      gazzkillNonSynergyAxesRemainUnderCurrentOwnership:
        gazzkill?.radarAxes.physicalThreat === 0.00067 &&
        gazzkill.radarAxes.mentalThreat === 0 &&
        gazzkill.radarAxes.physicalSurvivability === 9.725262 &&
        gazzkill.radarAxes.mentalSurvivability === 5.830205 &&
        gazzkill.radarAxes.manipulation === 3.033907 &&
        gazzkill.radarAxes.mobility === 2.039084 &&
        gazzkill.radarAxes.presence === 4.368786 &&
        gazzkill.powerWarnings.length === 0,
      gazzkillUnrelatedPowerAndPacketIdentitiesStable:
        JSON.stringify(gazzkill?.powerIds) === JSON.stringify([
          "cmpy3ilr3000ca0wcr0sx2pxj",
          "cmpy3ilui000ea0wc20mjxfch",
          GAZZKILL_RILE_POWER_ID,
        ]) &&
        JSON.stringify(gazzkill?.packetIds) === JSON.stringify([
          "cmpy3ilss000da0wcp4pdjtoh",
          "cmpy3ilwv000fa0wczdc38p9o",
          GAZZKILL_RILE_PACKET_ID,
        ]) &&
        JSON.stringify(gazzkill?.modifiers) === JSON.stringify([null, null, 1]),
      onlyApprovedLegacyLevelThreeAugmentsRemain:
        JSON.stringify(remainingLegacyLevelThreeAugmentPacketIds) === JSON.stringify([
          WOLF_BERZERKER_IRON_SKIN_RIDER_PACKET_ID,
        ].sort()),
      wolfBerzerkerSelfPassiveExcluded:
        Boolean(wolfBerzerker) &&
        Number(wolfBerzerker?.semanticSynergy.rawSemanticSupport) === 0 &&
        Number(wolfBerzerker?.finalSynergy) === 0,
      unsupportedGenericSupportRemainsZero: genericSupportAssets.every(
        (asset) =>
          Number(asset.semanticSynergy.rawSemanticSupport) === 0 &&
          Number(asset.finalSynergy) === 0,
      ) && (() => {
        const unsupported = fixtureById(fixtures, "unsupported_support");
        return unsupported.rawSynergy === 0 && unsupported.finalSynergy === 0;
      })(),
      noSavedAssetSilentlyMigrated: levelThreeAssets.every((asset) =>
        asset.semanticSynergy.mode === "LEVEL_3_SEMANTIC" ||
        asset.semanticSynergy.mode === "LEVEL_3_SEMANTIC_WITH_EXCLUSIONS"
          ? Number(asset.semanticSynergy.detectedSemanticPacketCount) > 0
          : true,
      ),
    };
    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    if (failedChecks.length > 0) {
      throw new Error(
        `SYNERGY_AUDIT_INCOMPATIBLE: ${failedChecks.join(", ")}; saved=${JSON.stringify({
          finalSynergy: saved.finalSynergy,
          rawSynergy: saved.rawSynergy,
          canonicalPowerAxisVector: saved.canonicalPowerAxisVector,
          effectivePowerAxisVector: saved.effectivePowerAxisVector,
        })}; editor=${JSON.stringify({
          finalSynergy: editorEquivalent.finalSynergy,
          rawSynergy: editorEquivalent.rawSynergy,
          canonicalPowerAxisVector: editorEquivalent.canonicalPowerAxisVector,
          effectivePowerAxisVector: editorEquivalent.effectivePowerAxisVector,
        })}; courtMage=${JSON.stringify(courtMage ?? null)}; gazzkill=${JSON.stringify(gazzkill ?? null)}`,
      );
    }
    const requestedSet = new Set<string>(SAMPLE_NAMES);
    const requestedSamples = monsters
      .filter((monster) => requestedSet.has(monster.name))
      .map((monster) => ({
        id: monster.id,
        name: monster.name,
        level: monster.level,
        tier: monster.tier,
        authoredSupportPowers: monster.powers
          .filter((power) =>
            power.effectPackets.some((packet) => SUPPORT_INTENTIONS.has(packet.intention)),
          )
          .map((power) => ({ id: power.id, name: power.name })),
      }));
    return {
      title: "Summoning Circle Synergy reconciliation compatibility audit",
      auditCompatibility: "compatible" as const,
      currentBalanceStatus: {
        legacyCurrentSynergyEvidence: "available",
        semanticNewFormatSynergy: "level_3_implemented",
        semanticBreadthMismatchDetected: semanticAxisGap.breadth.gapDetected,
        semanticPersistenceMismatchDetected: semanticAxisGap.persistence.gapDetected,
        level3SemanticReferenceSuites: "implemented",
        productionMutation: "none",
      },
      provenance: {
        repoHead: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
        gitStatus:
          execSync("git status --short --untracked-files=all", { encoding: "utf8" }).trim() ||
          "clean",
        campaignId: CAMPAIGN_ID,
        campaignName: CAMPAIGN_NAME,
        assetSource: "persisted Balance Environment monsters plus deterministic audit-local fixtures",
        databaseAccess: "read-only" as const,
        databaseOperations: DATABASE_OPERATIONS,
        databaseMutation: "none" as const,
        tuning: tuning.metadata,
        cooldownAuthority: {
          mode: "ACTIVE_CURRENT_BALANCE" as const,
          source: "ACTIVE_TUNING" as const,
          tuningSetId: tuning.powerSnapshot.setId,
          tuningUpdatedAt: tuning.powerSnapshot.updatedAt ?? null,
        },
      },
      outputContract: {
        fixtureIds,
        verdict: "compatible" as const,
        deterministicAcrossHumanAndJson: true,
      },
      checks,
      mapping,
      savedEditorParity: {
        selectedAsset: { id: selectedAsset.id, name: selectedAsset.name },
        saved,
        editorEquivalent,
        passed: checks.savedEditorParity,
      },
      fixtures,
      semanticAxisGap,
      requestedSamples,
      missingRequestedSamples: SAMPLE_NAMES.filter(
        (name) => !requestedSamples.some((sample) => sample.name === name),
      ),
      savedLevelThreeReconciliation: {
        assetCount: levelThreeAssets.length,
        runtimeMs: reconciliationRuntimeMs,
        medianAssetRuntimeMs,
        maximumAssetRuntimeMs: Math.max(
          0,
          ...levelThreeAssets.map((asset) => asset.calculatorRuntimeMs),
        ),
        namedAssets: {
          courtMage: courtMage ?? null,
          direWolf: direWolf ?? null,
          gazzkill: gazzkill ?? null,
          wolfBerzerker: wolfBerzerker ?? null,
        },
        genericSupportAssets,
        mixedModelAssets,
      },
      warnings: [
        "Legacy-only power support remains on the explicitly diagnosed legacy path.",
        "Mixed semantic and legacy support fails closed and is reported in savedLevelThreeReconciliation.mixedModelAssets.",
        "Semantic Synergy remains Level 3 only; unsupported levels fail closed.",
      ],
      changedAxes: ["synergy"],
    };
  } finally {
    await prisma.$disconnect();
  }
}

function printHuman(payload: Awaited<ReturnType<typeof buildPayload>>) {
  console.log(payload.title);
  console.log(`auditCompatibility=${payload.auditCompatibility}`);
  console.log(`currentBalanceStatus=${JSON.stringify(payload.currentBalanceStatus)}`);
  console.log(`repoHead=${payload.provenance.repoHead}`);
  console.log(`gitStatus=${payload.provenance.gitStatus}`);
  console.log(`campaignId=${payload.provenance.campaignId}`);
  console.log(`tuning=${JSON.stringify(payload.provenance.tuning)}`);
  console.log(`cooldownAuthority=${JSON.stringify(payload.provenance.cooldownAuthority)}`);
  console.log("databaseAccess=read-only; mutation=none");
  console.log(`fixtureSet=${payload.outputContract.fixtureIds.join(",")}`);
  console.log(`checks=${JSON.stringify(payload.checks)}`);
  console.log("");
  console.log("Saved/editor parity");
  console.log(JSON.stringify(payload.savedEditorParity));
  console.log("");
  console.log("Fixtures | runtime | final/raw | canonical/effective Synergy | semantic DU | BPV");
  for (const fixture of payload.fixtures) {
    console.log(
      `${fixture.id} | ${fixture.runtime.status} | ${fixture.finalSynergy}/${fixture.rawSynergy} | ${fixture.canonicalResolverSynergy}/${fixture.effectiveResolverSynergy} | ${fixture.semanticDelivery.aggregateDeliveryUnits ?? "legacy"} | ${fixture.basePowerValue}`,
    );
    console.log(`  ${fixture.description}`);
    console.log(`  identity=${JSON.stringify(fixture.powers)}`);
    console.log(`  authority=${JSON.stringify(fixture.authority)}`);
    console.log(`  runtime=${JSON.stringify(fixture.runtime)}`);
    console.log(`  canonicalAxes=${JSON.stringify(fixture.canonicalPowerAxisVector)}`);
    console.log(`  effectiveAxes=${JSON.stringify(fixture.effectivePowerAxisVector)}`);
    console.log(`  semanticDelivery=${JSON.stringify(fixture.semanticDelivery)}`);
  }
  console.log("");
  console.log(`semanticAxisGap=${JSON.stringify(payload.semanticAxisGap)}`);
  console.log(`savedLevelThreeReconciliation=${JSON.stringify(payload.savedLevelThreeReconciliation)}`);
  for (const warning of payload.warnings) console.log(`warning=${warning}`);
  console.log(`finalCompatibilityVerdict=${payload.outputContract.verdict}`);
}

async function main() {
  const payload = await buildPayload();
  if (process.argv.includes("--json")) console.log(JSON.stringify(payload, null, 2));
  else printHuman(payload);
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      auditCompatibility: "execution_error",
      databaseMutation: "none",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
