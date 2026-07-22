import assert from "node:assert/strict";

import { derivePowerCooldown, resolvePowerCost } from "../lib/summoning/powerCostResolver";
import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import { computeMonsterOutcomes } from "../lib/calculators/monsterOutcomeCalculator";
import { DEFAULT_POWER_TUNING_VALUES } from "../lib/config/powerTuningShared";
import {
  DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  calculateCharacterPlayerPowerSpend,
} from "../lib/config/characterBuilderTuningShared";
import { renderPowerDescriptorLines } from "../lib/summoning/render";
import { normalizeMonsterUpsertInput } from "../lib/summoning/validation";
import {
  CHARACTER_POWER_DEFENCE_MODES,
  CHARACTER_POWER_DEFENCE_RESISTED_ATTRIBUTES,
  normalizeCharacterPower,
  validateCharacterPowers,
} from "../lib/characterBuilder/powers";
import { adaptPowerToCombatActions } from "../lib/combat-lab/powerAdapter";
import {
  POWER_DEFENCE_MODE_OPTIONS,
  POWER_DEFENCE_RESISTED_ATTRIBUTE_OPTIONS,
} from "../lib/powers/authoringRules";
import type { EffectPacket, Power } from "../lib/summoning/types";
import activePowerTuningFixture from "./fixtures/tuning/active-power-tuning.json";

function createPacket(
  intention: EffectPacket["intention"],
  overrides: Partial<EffectPacket> = {},
): EffectPacket {
  return {
    sortOrder: 0,
    packetIndex: 0,
    hostility:
      intention === "ATTACK" || intention === "CONTROL" || intention === "DEBUFF"
        ? "HOSTILE"
        : "NON_HOSTILE",
    intention,
    type: intention,
    diceCount: 1,
    potency: 1,
    effectTimingType: "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: "INSTANT",
    effectDurationTurns: null,
    applyTo: "PRIMARY_TARGET",
    triggerConditionText: null,
    detailsJson: {},
    ...overrides,
  };
}

function createPower(config: {
  name: string;
  rangeCategories?: Power["rangeCategories"];
  meleeTargets?: number | null;
  rangedDistanceFeet?: number | null;
  rangedTargets?: number | null;
  aoeCenterRangeFeet?: number | null;
  aoeCount?: number | null;
  aoeShape?: Power["aoeShape"];
  aoeSphereRadiusFeet?: number | null;
  aoeConeLengthFeet?: number | null;
  aoeLineWidthFeet?: number | null;
  aoeLineLengthFeet?: number | null;
  packet: EffectPacket;
  packets?: EffectPacket[];
  counterMode?: Power["counterMode"];
  descriptorChassis?: Power["descriptorChassis"];
  descriptorChassisConfig?: Power["descriptorChassisConfig"];
  commitmentModifier?: Power["commitmentModifier"];
  attachedHostAnchorType?: Power["attachedHostAnchorType"];
  lifespanType?: Power["lifespanType"];
  lifespanTurns?: number | null;
  primaryDefenceGate?: Power["primaryDefenceGate"];
}): Power {
  const packets = config.packets ?? [config.packet];
  return {
    sortOrder: 0,
    name: config.name,
    description: null,
    descriptorChassis: config.descriptorChassis ?? "IMMEDIATE",
    descriptorChassisConfig: config.descriptorChassisConfig ?? {},
    cooldownTurns: 1,
    cooldownReduction: 0,
    counterMode: config.counterMode ?? "NO",
    commitmentModifier: config.commitmentModifier ?? "STANDARD",
    attachedHostAnchorType: config.attachedHostAnchorType ?? null,
    lifespanType: config.lifespanType ?? "NONE",
    lifespanTurns: config.lifespanTurns ?? null,
    rangeCategories: config.rangeCategories ?? [],
    meleeTargets: config.meleeTargets ?? null,
    rangedDistanceFeet: config.rangedDistanceFeet ?? null,
    rangedTargets: config.rangedTargets ?? null,
    aoeCenterRangeFeet: config.aoeCenterRangeFeet ?? null,
    aoeCount: config.aoeCount ?? null,
    aoeShape: config.aoeShape ?? null,
    aoeSphereRadiusFeet: config.aoeSphereRadiusFeet ?? null,
    aoeConeLengthFeet: config.aoeConeLengthFeet ?? null,
    aoeLineWidthFeet: config.aoeLineWidthFeet ?? null,
    aoeLineLengthFeet: config.aoeLineLengthFeet ?? null,
    primaryDefenceGate: config.primaryDefenceGate,
    defenceRequirement: config.primaryDefenceGate?.gateResult ?? undefined,
    effectPackets: packets,
    intentions: packets,
    diceCount: Number(config.packet.diceCount ?? 1),
    potency: Number(config.packet.potency ?? 1),
    effectDurationType: config.packet.effectDurationType ?? "INSTANT",
    effectDurationTurns: config.packet.effectDurationTurns ?? null,
    durationType: config.packet.effectDurationType ?? "INSTANT",
    durationTurns: config.packet.effectDurationTurns ?? null,
  };
}

function getFirstPacketBreakdown(power: Power) {
  const breakdown = resolvePowerCost(power);
  assert.equal(breakdown.packetCosts.length, 1);
  return breakdown.packetCosts[0];
}

function roundCost(value: number): number {
  return Math.round(value * 100) / 100;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function createBaseMonster() {
  return {
    name: "Movement Smoke",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: 1,
    tier: "MINION" as const,
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
    physicalResilienceCurrent: 19,
    physicalResilienceMax: 19,
    mentalPerseveranceCurrent: 19,
    mentalPerseveranceMax: 19,
    physicalProtection: 0,
    mentalProtection: 0,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 0,
    attackDie: "D8" as const,
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: "D8" as const,
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D8" as const,
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D8" as const,
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: "D8" as const,
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: "D8" as const,
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
    powers: [],
  };
}

const selfHealPacket = createPacket("HEALING", {
  applyTo: "SELF",
  detailsJson: {
    healingMode: "PHYSICAL",
    rangeCategory: "SELF",
  },
});

const selfHealPower = createPower({
  name: "Self Heal Smoke",
  packet: selfHealPacket,
});
const selfHeal = getFirstPacketBreakdown(
  selfHealPower,
);
const selfHealScalarBreakdown = resolvePowerCost(selfHealPower, {
  values: {
    ...DEFAULT_POWER_TUNING_VALUES,
    "packet.axisEmission.intention.healing": 1,
  },
});
const selfHealAxisEmissionBreakdown = resolvePowerCost(selfHealPower, {
  values: DEFAULT_POWER_TUNING_VALUES,
});
const selfHealScalarPacket = selfHealScalarBreakdown.packetCosts[0];
const selfHealAxisEmissionPacket = selfHealAxisEmissionBreakdown.packetCosts[0];

assert.equal(selfHeal.axisVector.synergy, 0);
assert.ok(selfHeal.axisVector.physicalSurvivability > 0);
assert.equal(selfHealAxisEmissionBreakdown.basePowerValue, selfHealScalarBreakdown.basePowerValue);
assert.equal(
  selfHealAxisEmissionPacket.packetTotalAfterContingency,
  selfHealScalarPacket.packetTotalAfterContingency,
);
assert.equal(selfHealAxisEmissionPacket.scalarPacketValue, selfHealScalarPacket.scalarPacketValue);
assert.equal(selfHealAxisEmissionPacket.axisEmissionMultiplier, 0.5);
assert.equal(
  selfHealAxisEmissionPacket.axisVector.physicalSurvivability,
  roundCost(selfHealScalarPacket.axisVector.physicalSurvivability * 0.5),
);
assert.deepEqual(
  (selfHeal.debug.axisRouting as { spillRules?: string[] }).spillRules ?? [],
  ["healingTo:physicalSurvivability"],
);

const allyHealPacket = createPacket("HEALING", {
  applyTo: "ALLIES",
  detailsJson: {
    healingMode: "PHYSICAL",
  },
});

const allyHeal = getFirstPacketBreakdown(
  createPower({
    name: "Ally Heal Smoke",
    rangeCategories: ["RANGED"],
    rangedTargets: 2,
    packet: allyHealPacket,
  }),
);

assert.ok(allyHeal.axisVector.synergy > 0);
assert.ok(allyHeal.axisVector.physicalSurvivability > 0);
assert.ok(
  ((allyHeal.debug.axisRouting as { spillRules?: string[] }).spillRules ?? []).includes(
    "healingSynergySpill",
  ),
);

const selfDefensiveAugmentPacket = createPacket("AUGMENT", {
  applyTo: "SELF",
  effectDurationType: "TURNS",
  effectDurationTurns: 2,
  detailsJson: {
    statTarget: "Guard",
    rangeCategory: "SELF",
  },
});

const selfDefensiveAugment = getFirstPacketBreakdown(
  createPower({
    name: "Self Defensive Augment Smoke",
    packet: selfDefensiveAugmentPacket,
  }),
);

assert.equal(selfDefensiveAugment.axisVector.synergy, 0);
assert.ok(selfDefensiveAugment.axisVector.physicalSurvivability > 0);

const selfRunMovementPacket = createPacket("MOVEMENT", {
  hostility: undefined,
  diceCount: 2,
  potency: 1,
  applyTo: "SELF",
  effectTimingType: "ON_CAST",
  effectDurationType: "INSTANT",
  detailsJson: {
    movementMode: "Run",
    rangeCategory: "SELF",
  },
});

const selfRunMovementPower = createPower({
  name: "Leap Smoke",
  packet: selfRunMovementPacket,
});
const weakestMovementBaselineValues = {
  ...DEFAULT_POWER_TUNING_VALUES,
  "packet.identity.intention.movement": 0.8,
  "packet.magnitude.dice.2": 3,
};
const weakestMovementUnreducedMagnitudeBreakdown = resolvePowerCost(selfRunMovementPower, {
  values: {
    ...weakestMovementBaselineValues,
    "packet.magnitude.movementTypeMultiplier.run": 1,
    "packet.axisEmission.intention.movement": 1,
  },
});
const weakestMovementMagnitudeOnlyBreakdown = resolvePowerCost(selfRunMovementPower, {
  values: {
    ...weakestMovementBaselineValues,
    "packet.axisEmission.intention.movement": 1,
  },
});
const weakestMovementAfterBreakdown = resolvePowerCost(selfRunMovementPower, {
  values: weakestMovementBaselineValues,
});
const weakestMovementAfterPacket = weakestMovementAfterBreakdown.packetCosts[0];
const weakestMovementMagnitudeOnlyPacket = weakestMovementMagnitudeOnlyBreakdown.packetCosts[0];
const weakestMovementAfterMonster = computeMonsterOutcomes(createBaseMonster(), calculatorConfig, {
  powerContribution: weakestMovementAfterBreakdown,
});
const weakestMovementAfterMonsterDebug = weakestMovementAfterMonster.debug as {
  finalPreNormalizationAxes?: { mobility?: number };
};
const weakestMovementMagnitudeOnlyMonster = computeMonsterOutcomes(createBaseMonster(), calculatorConfig, {
  powerContribution: weakestMovementMagnitudeOnlyBreakdown,
});
const weakestMovementMagnitudeOnlyMonsterDebug = weakestMovementMagnitudeOnlyMonster.debug as {
  finalPreNormalizationAxes?: { mobility?: number };
};

assert.equal(weakestMovementAfterPacket.packetIdentityCost, 0.8);
assert.equal(weakestMovementUnreducedMagnitudeBreakdown.packetCosts[0].packetMagnitudeCost, 4);
assert.equal(weakestMovementAfterPacket.packetMagnitudeCost, 1.2);
assert.equal(weakestMovementAfterPacket.packetRecipientCost, 0.5);
assert.equal(weakestMovementAfterPacket.packetSpecificCost, 1);
assert.equal(weakestMovementMagnitudeOnlyPacket.axisVector.mobility, 3.5);
assert.equal(weakestMovementAfterPacket.axisEmissionMultiplier, 0.5);
assert.equal(weakestMovementAfterPacket.axisEmissionValue, 1.75);
assert.equal(weakestMovementAfterPacket.axisEmissionTuningKey, "packet.axisEmission.intention.movement");
assert.equal(weakestMovementAfterPacket.axisVector.mobility, 1.75);
assert.equal(weakestMovementAfterPacket.packetTotalAfterContingency, 3.5);
assert.equal(
  weakestMovementAfterPacket.packetTotalAfterContingency,
  weakestMovementMagnitudeOnlyPacket.packetTotalAfterContingency,
);
assert.equal(weakestMovementAfterBreakdown.basePowerValue, 3.5);
assert.equal(
  weakestMovementAfterBreakdown.basePowerValue,
  weakestMovementMagnitudeOnlyBreakdown.basePowerValue,
);
assert.equal(weakestMovementAfterMonsterDebug.finalPreNormalizationAxes?.mobility ?? 0, 1.75);
assert.equal(
  weakestMovementMagnitudeOnlyMonsterDebug.finalPreNormalizationAxes?.mobility ?? 0,
  3.5,
);
assert.equal(
  (weakestMovementAfterPacket.debug as { hostility?: string }).hostility,
  "NON_HOSTILE_OR_UNKNOWN",
);

const staleSelfRunPacket = {
  ...selfRunMovementPacket,
  hostility: "HOSTILE" as const,
};
const staleSelfRunPower = {
  ...selfRunMovementPower,
  primaryDefenceGate: {
    sourcePacketIndex: 0,
    gateResult: "RESIST" as const,
    protectionChannel: null,
    resistAttribute: "FORTITUDE" as const,
    hostileEntryPattern: null,
    resolutionSource: "INFERRED" as const,
  },
  defenceRequirement: "RESIST" as const,
  effectPackets: [staleSelfRunPacket],
  intentions: [staleSelfRunPacket],
};
const normalizedStaleSelfRun = normalizeMonsterUpsertInput({
  ...createBaseMonster(),
  powers: [staleSelfRunPower],
});
if (!normalizedStaleSelfRun.ok) throw new Error(normalizedStaleSelfRun.error);
assert.equal(normalizedStaleSelfRun.data.powers[0].effectPackets[0].hostility, "NON_HOSTILE");
assert.equal(normalizedStaleSelfRun.data.powers[0].primaryDefenceGate?.gateResult, "NONE");
assert.equal(normalizedStaleSelfRun.data.powers[0].primaryDefenceGate?.protectionChannel, null);
assert.equal(normalizedStaleSelfRun.data.powers[0].primaryDefenceGate?.resistAttribute, null);

const hostileForcedMovementPacket = createPacket("MOVEMENT", {
  hostility: "HOSTILE",
  applyTo: "PRIMARY_TARGET",
  detailsJson: {
    movementMode: "Force Push",
    movementTheme: "BODY_ENDURANCE",
    rangeCategory: "RANGED",
  },
});
const normalizedHostileForcedMovement = normalizeMonsterUpsertInput({
  ...createBaseMonster(),
  powers: [
    createPower({
      name: "Force Push Smoke",
      rangeCategories: ["RANGED"],
      packet: hostileForcedMovementPacket,
    }),
  ],
});
if (!normalizedHostileForcedMovement.ok) throw new Error(normalizedHostileForcedMovement.error);
assert.equal(normalizedHostileForcedMovement.data.powers[0].effectPackets[0].hostility, "HOSTILE");
assert.equal(normalizedHostileForcedMovement.data.powers[0].primaryDefenceGate?.gateResult, "RESIST");
assert.equal(
  normalizedHostileForcedMovement.data.powers[0].primaryDefenceGate?.resistAttribute,
  "FORTITUDE",
);

const hostilePrimaryControlPacket = createPacket("CONTROL", {
  hostility: "HOSTILE",
  diceCount: 3,
  potency: 2,
  applyTo: "PRIMARY_TARGET",
  effectDurationType: "TURNS",
  effectDurationTurns: 1,
  detailsJson: {
    controlMode: "Force No Move",
    controlTheme: "BODY_ENDURANCE",
    rangeCategory: "RANGED",
  },
});
const forceNoResponseControlPacket = createPacket("CONTROL", {
  hostility: "HOSTILE",
  diceCount: 3,
  potency: 2,
  applyTo: "PRIMARY_TARGET",
  effectDurationType: "TURNS",
  effectDurationTurns: 1,
  detailsJson: {
    controlMode: "Force no response",
    controlTheme: "BODY_ENDURANCE",
    rangeCategory: "RANGED",
  },
});
const forceNoResponseCost = getFirstPacketBreakdown(createPower({
  name: "Force No Response Smoke",
  rangeCategories: ["RANGED"],
  packet: forceNoResponseControlPacket,
}));
assert.equal(
  DEFAULT_POWER_TUNING_VALUES["packet.controlMode.forceNoResponse"],
  DEFAULT_POWER_TUNING_VALUES["packet.controlMode.forceNoMainAction"],
);
assert.equal(forceNoResponseCost.packetSpecificCost, DEFAULT_POWER_TUNING_VALUES["packet.controlMode.forceNoMainAction"]);
assert.ok(
  (forceNoResponseCost.debug.chosenTuningKeys as string[]).includes("packet.controlMode.forceNoResponse"),
);
const normalizedForceNoResponse = normalizeMonsterUpsertInput({
  ...createBaseMonster(),
  powers: [
    createPower({
      name: "Force No Response Smoke",
      rangeCategories: ["RANGED"],
      packet: forceNoResponseControlPacket,
    }),
  ],
});
if (!normalizedForceNoResponse.ok) throw new Error(normalizedForceNoResponse.error);
assert.equal(
  normalizedForceNoResponse.data.powers[0].effectPackets[0].detailsJson.controlMode,
  "Force no response",
);

const counterPremiumKeys = {
  attack: "access.counterPremium.attack",
  attackControlCombo: "access.counterPremium.attackControlCombo",
  attackDefenceCombo: "access.counterPremium.attackDefenceCombo",
  attackOffensiveMultiplier: "access.counterPremium.attackOffensiveMultiplier",
  buff: "access.counterPremium.buff",
  control: "access.counterPremium.control",
  debuff: "access.counterPremium.debuff",
  defence: "access.counterPremium.defence",
  movement: "access.counterPremium.movement",
} as const;
const legacyCounterTuningValues = {
  ...DEFAULT_POWER_TUNING_VALUES,
  ...Object.fromEntries(Object.values(counterPremiumKeys).map((key) => [key, 0])),
};
const physicalAttackGate = {
  sourcePacketIndex: 0,
  gateResult: "DODGE_OR_PROTECTION",
  protectionChannel: "PHYSICAL",
  resistAttribute: null,
  hostileEntryPattern: null,
  resolutionSource: "INFERRED",
} as const;
const mentalAttackGate = {
  sourcePacketIndex: 0,
  gateResult: "DODGE_OR_PROTECTION",
  protectionChannel: "MENTAL",
  resistAttribute: null,
  hostileEntryPattern: null,
  resolutionSource: "INFERRED",
} as const;
const counterstrikePacket = createPacket("ATTACK", {
  diceCount: 3,
  potency: 4,
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Ice", "Slashing"],
    rangeCategory: "MELEE",
  },
});
const counterstrikePower = createPower({
  name: "Counterstrike",
  rangeCategories: ["MELEE"],
  meleeTargets: 1,
  packet: counterstrikePacket,
  counterMode: "YES",
  primaryDefenceGate: physicalAttackGate,
});
const suddenDaggerPacket = createPacket("ATTACK", {
  diceCount: 3,
  potency: 3,
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Piercing", "Necrotic"],
    rangeCategory: "RANGED",
    rangeValue: 30,
    rangeExtra: { targets: 1 },
  },
});
const suddenDaggerPower = createPower({
  name: "Sudden Dagger",
  rangeCategories: ["RANGED"],
  rangedDistanceFeet: 30,
  rangedTargets: 1,
  packet: suddenDaggerPacket,
  counterMode: "YES",
  primaryDefenceGate: physicalAttackGate,
});
const openVeinPrimaryPacket = createPacket("ATTACK", {
  diceCount: 4,
  potency: 4,
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Slashing"],
    rangeCategory: "MELEE",
  },
});
const openVeinOngoingPacket = createPacket("ATTACK", {
  sortOrder: 1,
  packetIndex: 1,
  diceCount: 1,
  potency: 3,
  effectTimingType: "START_OF_TURN",
  effectDurationType: "TURNS",
  effectDurationTurns: 2,
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Necrotic"],
    rangeCategory: "MELEE",
    secondaryScalingMode: "PRIMARY_WOUND_BANDS",
    woundsPerSuccess: 6,
  },
});
const openVeinPower = createPower({
  name: "Open Vein",
  rangeCategories: ["MELEE"],
  meleeTargets: 1,
  packet: openVeinPrimaryPacket,
  packets: [openVeinPrimaryPacket, openVeinOngoingPacket],
  primaryDefenceGate: physicalAttackGate,
});

function createRuntimeOngoingAttackPower(config: {
  name: string;
  diceCount?: number;
  potency?: number;
  attackMode?: "PHYSICAL" | "MENTAL";
  durationTurns?: number;
  timing?: EffectPacket["effectTimingType"];
  damageTypes?: string[];
}): Power {
  const attackMode = config.attackMode ?? "PHYSICAL";
  const packet = createPacket("ATTACK", {
    diceCount: config.diceCount ?? 4,
    potency: config.potency ?? 4,
    effectTimingType: config.timing ?? "ON_CAST",
    effectDurationType: "TURNS",
    effectDurationTurns: config.durationTurns ?? 2,
    woundChannel: attackMode,
    detailsJson: {
      attackMode,
      damageTypes: config.damageTypes ?? [attackMode === "MENTAL" ? "Psychic" : "Slashing"],
      rangeCategory: "MELEE",
    },
  });
  return createPower({
    name: config.name,
    rangeCategories: ["MELEE"],
    meleeTargets: 1,
    packet,
    primaryDefenceGate: attackMode === "MENTAL" ? mentalAttackGate : physicalAttackGate,
  });
}

function getRuntimeOngoingDebug(power: Power, tuningValues = DEFAULT_POWER_TUNING_VALUES) {
  const breakdown = resolvePowerCost(power, { values: tuningValues });
  const runtimeDebug = asRecord(breakdown.debug.runtimeOngoingDamageBreakdown);
  const packets = (runtimeDebug.packetDebug as Array<Record<string, unknown>> | undefined) ?? [];
  const packet = asRecord(packets.find((entry) => entry.fired === true));
  return { breakdown, packet };
}

const swipingLikeOngoing = getRuntimeOngoingDebug(
  createRuntimeOngoingAttackPower({ name: "Swiping Claws Resolver Smoke" }),
);
const swipingMagnitude = asRecord(
  swipingLikeOngoing.breakdown.packetCosts[0]?.debug.magnitude,
);
const swipingContributions = asRecord(swipingLikeOngoing.packet.contributions);
assert.equal(swipingMagnitude.sourcePotency, 4);
assert.equal(swipingMagnitude.effectiveTableFacingWoundsPerSuccess, 8);
assert.equal(swipingMagnitude.potencyForValuation, 8);
assert.equal(swipingLikeOngoing.packet.runtimeEquivalentTiming, "START_OF_TURN");
assert.equal(swipingLikeOngoing.packet.tickCount, 2);
assert.equal(swipingLikeOngoing.packet.effectiveWoundsPerSuccess, 8);
assert.equal(swipingLikeOngoing.packet.expectedSuccessesPerTick, 3.2);
assert.equal(swipingLikeOngoing.packet.spikePercentile, 0.9);
assert.equal(swipingLikeOngoing.packet.spikeSuccessesPerTick, 5);
assert.equal(swipingLikeOngoing.packet.expectedTickDamageBeforeMitigation, 25.6);
assert.equal(swipingLikeOngoing.packet.spikeTickDamageBeforeMitigation, 40);
assert.equal(swipingLikeOngoing.packet.expectedTotalOngoingBeforeMitigation, 51.2);
assert.equal(swipingLikeOngoing.packet.firstTickBeforeCleanup, true);
assert.equal(swipingContributions.expectedDamageThreat, 5.12);
assert.equal(swipingContributions.spikePressure, 2);
assert.equal(swipingContributions.firstTickBeforeCleanupPressure, 0.5);
assert.equal(swipingContributions.cleanupActionTaxPressure, 0.5);
assert.ok(swipingLikeOngoing.breakdown.runtimeOngoingDamageCost > 0);
assert.ok(swipingLikeOngoing.breakdown.axisVector.physicalThreat > 0);
assert.ok(swipingLikeOngoing.breakdown.axisVector.presence > 0);

const instantAttackNoOngoing = getRuntimeOngoingDebug(createPower({
  name: "Instant Slash Resolver Smoke",
  rangeCategories: ["MELEE"],
  meleeTargets: 1,
  packet: createPacket("ATTACK", {
    diceCount: 4,
    potency: 4,
    detailsJson: {
      attackMode: "PHYSICAL",
      damageTypes: ["Slashing"],
      rangeCategory: "MELEE",
    },
  }),
  primaryDefenceGate: physicalAttackGate,
}));
assert.equal(instantAttackNoOngoing.breakdown.runtimeOngoingDamageCost, 0);
assert.equal(instantAttackNoOngoing.packet.fired, undefined);

const mentalOngoing = getRuntimeOngoingDebug(
  createRuntimeOngoingAttackPower({ name: "Mental Ongoing Smoke", attackMode: "MENTAL" }),
);
assert.ok(mentalOngoing.breakdown.axisVector.mentalThreat > 0);
assert.equal(asRecord(mentalOngoing.packet.axisVector).physicalThreat, 0);

const weakerOngoing = getRuntimeOngoingDebug(
  createRuntimeOngoingAttackPower({ name: "Weak Ongoing Smoke", potency: 3 }),
);
assert.ok(swipingLikeOngoing.breakdown.basePowerValue > weakerOngoing.breakdown.basePowerValue);
assert.ok(swipingLikeOngoing.breakdown.axisVector.physicalThreat > weakerOngoing.breakdown.axisVector.physicalThreat);
assert.ok(swipingLikeOngoing.breakdown.axisVector.presence > weakerOngoing.breakdown.axisVector.presence);

const longerOngoing = getRuntimeOngoingDebug(
  createRuntimeOngoingAttackPower({ name: "Long Ongoing Smoke", durationTurns: 3 }),
);
assert.ok(longerOngoing.breakdown.basePowerValue > swipingLikeOngoing.breakdown.basePowerValue);
assert.ok(longerOngoing.breakdown.axisVector.physicalThreat > swipingLikeOngoing.breakdown.axisVector.physicalThreat);
assert.ok(longerOngoing.breakdown.axisVector.presence >= swipingLikeOngoing.breakdown.axisVector.presence);

const moreDiceOngoing = getRuntimeOngoingDebug(
  createRuntimeOngoingAttackPower({ name: "More Dice Ongoing Smoke", diceCount: 5 }),
);
assert.ok(moreDiceOngoing.breakdown.basePowerValue > swipingLikeOngoing.breakdown.basePowerValue);
assert.ok(moreDiceOngoing.breakdown.axisVector.physicalThreat > swipingLikeOngoing.breakdown.axisVector.physicalThreat);
assert.ok(moreDiceOngoing.breakdown.axisVector.presence >= swipingLikeOngoing.breakdown.axisVector.presence);

const lowSpikePercentile = getRuntimeOngoingDebug(
  createRuntimeOngoingAttackPower({ name: "Low Spike Percentile Smoke" }),
  { ...DEFAULT_POWER_TUNING_VALUES, "axis.ongoing.percentileForSpike": 0.5 },
);
const highSpikePercentile = getRuntimeOngoingDebug(
  createRuntimeOngoingAttackPower({ name: "High Spike Percentile Smoke" }),
  { ...DEFAULT_POWER_TUNING_VALUES, "axis.ongoing.percentileForSpike": 0.9 },
);
assert.ok(highSpikePercentile.breakdown.basePowerValue >= lowSpikePercentile.breakdown.basePowerValue);
assert.ok(highSpikePercentile.breakdown.axisVector.physicalThreat >= lowSpikePercentile.breakdown.axisVector.physicalThreat);
assert.ok(highSpikePercentile.breakdown.axisVector.presence > lowSpikePercentile.breakdown.axisVector.presence);

const defenceOnlyCounterPower = createPower({
  name: "Guard Snap",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 2,
    potency: 2,
    detailsJson: {
      attackMode: "PHYSICAL",
      rangeCategory: "SELF",
    },
  }),
  counterMode: "YES",
});
const attackDefenceCounterPower = createPower({
  name: "Riposte Guard",
  rangeCategories: ["MELEE"],
  meleeTargets: 1,
  packet: counterstrikePacket,
  packets: [
    counterstrikePacket,
    createPacket("DEFENCE", {
      sortOrder: 1,
      packetIndex: 1,
      hostility: "NON_HOSTILE",
      applyTo: "SELF",
      diceCount: 1,
      potency: 2,
      detailsJson: {
        attackMode: "PHYSICAL",
        rangeCategory: "SELF",
      },
    }),
  ],
  counterMode: "YES",
  primaryDefenceGate: physicalAttackGate,
});

function summarizeCounterAudit(power: Power) {
  const before = resolvePowerCost(power, {
    values: legacyCounterTuningValues,
  });
  const after = resolvePowerCost(power, {
    values: DEFAULT_POWER_TUNING_VALUES,
  });
  return {
    before,
    after,
    beforeSpend: calculateCharacterPlayerPowerSpend(
      before.basePowerValue,
      DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
    ),
    afterSpend: calculateCharacterPlayerPowerSpend(
      after.basePowerValue,
      DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
    ),
  };
}

const counterstrikeAudit = summarizeCounterAudit(counterstrikePower);
const suddenDaggerAudit = summarizeCounterAudit(suddenDaggerPower);
const openVeinAudit = summarizeCounterAudit(openVeinPower);
const defenceOnlyCounterAudit = summarizeCounterAudit(defenceOnlyCounterPower);
const attackDefenceCounterAudit = summarizeCounterAudit(attackDefenceCounterPower);
const counterstrikeDescriptor = renderPowerDescriptorLines(counterstrikePower).join("\n");
const suddenDaggerDescriptor = renderPowerDescriptorLines(suddenDaggerPower).join("\n");
const openVeinDescriptor = renderPowerDescriptorLines(openVeinPower).join("\n");
const dodgePower = createPower({
  name: "Sudden Dive",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 2,
    potency: 1,
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Dodge",
      rangeCategory: "SELF",
    },
  }),
  counterMode: "YES",
});
const strongDodgePower = createPower({
  name: "Sudden Dive",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 2,
    potency: 3,
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Dodge",
      rangeCategory: "SELF",
    },
  }),
});
const illegalRepositionPower = createPower({
  name: "Illegal Sidestep",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 3,
    potency: 2,
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Reposition",
      rangeCategory: "SELF",
    },
  }),
});
const resistPower = createPower({
  name: "Sudden Dive",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 2,
    potency: 1,
    detailsJson: {
      attackMode: "MENTAL",
      defenceMode: "Resist",
      resistedAttribute: "Guard",
      rangeCategory: "SELF",
    },
  }),
  counterMode: "YES",
});
const braveryResistPower = createPower({
  name: "Mind Fortress",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 2,
    potency: 3,
    detailsJson: {
      attackMode: "MENTAL",
      defenceMode: "Resist",
      resistedAttribute: "Bravery",
      rangeCategory: "SELF",
    },
  }),
});
const missingResistedAttributePower = createPower({
  name: "Incomplete Resist",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 2,
    potency: 2,
    detailsJson: {
      attackMode: "MENTAL",
      defenceMode: "Resist",
      rangeCategory: "SELF",
    },
  }),
});
const multiResistedAttributePower = createPower({
  name: "Overbroad Resist",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 2,
    potency: 2,
    detailsJson: {
      attackMode: "MENTAL",
      defenceMode: "Resist",
      resistedAttribute: ["Attack", "Guard"],
      rangeCategory: "SELF",
    },
  }),
});
const dodgeDescriptor = renderPowerDescriptorLines(dodgePower).join("\n");
const characterDodgeDescriptor = renderPowerDescriptorLines(
  normalizeCharacterPower(dodgePower, 0),
).join("\n");
const strongDodgeDescriptor = renderPowerDescriptorLines(strongDodgePower).join("\n");
const physicalBlockPoolDescriptor = renderPowerDescriptorLines(createPower({
  name: "Silver Shield",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 5,
    potency: 5,
    effectDurationType: "TURNS",
    effectDurationTurns: 2,
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Block",
      rangeCategory: "SELF",
    },
  }),
  rangeCategories: ["MELEE"],
})).join("\n");
const immediateTimedSelfBlockPoolDescriptor = renderPowerDescriptorLines(createPower({
  name: "Tough it out",
  descriptorChassis: "IMMEDIATE",
  commitmentModifier: "STANDARD",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 5,
    potency: 4,
    effectDurationType: "TURNS",
    effectDurationTurns: 2,
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Block",
      rangeCategory: "SELF",
    },
  }),
})).join("\n");
const singularPhysicalBlockPoolDescriptor = renderPowerDescriptorLines(createPower({
  name: "Silver Shield",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 1,
    potency: 1,
    effectDurationType: "TURNS",
    effectDurationTurns: 2,
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Block",
      rangeCategory: "SELF",
    },
  }),
  rangeCategories: ["MELEE"],
})).join("\n");
const mentalBlockPoolDescriptor = renderPowerDescriptorLines(createPower({
  name: "Mind Ward",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 3,
    potency: 4,
    effectDurationType: "TURNS",
    effectDurationTurns: 2,
    detailsJson: {
      attackMode: "MENTAL",
      defenceMode: "Block",
      rangeCategory: "SELF",
    },
  }),
  rangeCategories: ["MELEE"],
})).join("\n");
const dodgePoolDescriptor = renderPowerDescriptorLines(createPower({
  name: "Blur",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 3,
    potency: 4,
    effectDurationType: "TURNS",
    effectDurationTurns: 2,
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Dodge",
      rangeCategory: "SELF",
    },
  }),
  rangeCategories: ["MELEE"],
})).join("\n");
const attachedSilverShieldDescriptor = renderPowerDescriptorLines(createPower({
  name: "Silver Shield",
  descriptorChassis: "ATTACHED",
  attachedHostAnchorType: "SELF",
  lifespanType: "PASSIVE",
  primaryDefenceGate: {
    sourcePacketIndex: 0,
    gateResult: "NONE",
    protectionChannel: null,
    resistAttribute: null,
    hostileEntryPattern: "ON_PAYLOAD",
    resolutionSource: "EXPLICIT",
  },
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 5,
    potency: 5,
    effectTimingType: "START_OF_TURN",
    effectDurationType: "INSTANT",
    effectDurationTurns: null,
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Block",
      rangeCategory: "SELF",
    },
  }),
})).join("\n");
const fieldBlockPoolDescriptor = renderPowerDescriptorLines(createPower({
  name: "Aegis Field",
  descriptorChassis: "FIELD",
  lifespanType: "TURNS",
  lifespanTurns: 3,
  rangeCategories: ["AOE"],
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "ALLIES",
    diceCount: 2,
    potency: 3,
    effectTimingType: "START_OF_TURN",
    effectDurationType: "INSTANT",
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Block",
      rangeCategory: "AOE",
      rangeValue: 30,
      rangeExtra: { count: 1, shape: "SPHERE", sphereRadiusFeet: 10 },
    },
  }),
})).join("\n");
const instantPhysicalBlockDescriptor = renderPowerDescriptorLines(createPower({
  name: "Silver Shield",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 2,
    potency: 5,
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Block",
      rangeCategory: "SELF",
    },
  }),
  rangeCategories: ["MELEE"],
})).join("\n");
const instantMentalBlockDescriptor = renderPowerDescriptorLines(createPower({
  name: "Mind Ward",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 2,
    potency: 5,
    detailsJson: {
      attackMode: "MENTAL",
      defenceMode: "Block",
      rangeCategory: "SELF",
    },
  }),
  rangeCategories: ["MELEE"],
})).join("\n");
const dualLaneDefenceCounterDescriptor = renderPowerDescriptorLines(createPower({
  name: "Split Guard",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 3,
    potency: 4,
    woundChannel: "PHYSICAL",
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Block",
      rangeCategory: "SELF",
    },
  }),
  packets: [
    createPacket("DEFENCE", {
      packetIndex: 0,
      sortOrder: 0,
      hostility: "NON_HOSTILE",
      applyTo: "SELF",
      diceCount: 3,
      potency: 4,
      woundChannel: "PHYSICAL",
      detailsJson: {
        attackMode: "PHYSICAL",
        defenceMode: "Block",
        rangeCategory: "SELF",
      },
    }),
    createPacket("DEFENCE", {
      packetIndex: 1,
      sortOrder: 1,
      hostility: "NON_HOSTILE",
      applyTo: "SELF",
      diceCount: 1,
      potency: 2,
      woundChannel: "MENTAL",
      detailsJson: {
        attackMode: "MENTAL",
        defenceMode: "Block",
        rangeCategory: "SELF",
      },
    }),
  ],
  counterMode: "YES",
})).join("\n");
const reverseDualLaneDefenceCounterDescriptor = renderPowerDescriptorLines(createPower({
  name: "Mind And Body Guard",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 2,
    potency: 3,
    woundChannel: "MENTAL",
    detailsJson: {
      attackMode: "MENTAL",
      defenceMode: "Block",
      rangeCategory: "SELF",
    },
  }),
  packets: [
    createPacket("DEFENCE", {
      packetIndex: 0,
      sortOrder: 0,
      hostility: "NON_HOSTILE",
      applyTo: "SELF",
      diceCount: 2,
      potency: 3,
      woundChannel: "MENTAL",
      detailsJson: {
        attackMode: "MENTAL",
        defenceMode: "Block",
        rangeCategory: "SELF",
      },
    }),
    createPacket("DEFENCE", {
      packetIndex: 1,
      sortOrder: 1,
      hostility: "NON_HOSTILE",
      applyTo: "SELF",
      diceCount: 1,
      potency: 5,
      woundChannel: "PHYSICAL",
      detailsJson: {
        attackMode: "PHYSICAL",
        defenceMode: "Block",
        rangeCategory: "SELF",
      },
    }),
  ],
  counterMode: "YES",
})).join("\n");
const dodgeAndPhysicalCounterDescriptor = renderPowerDescriptorLines(createPower({
  name: "Dodge And Guard",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 3,
    potency: 2,
    woundChannel: "PHYSICAL",
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Dodge",
      rangeCategory: "SELF",
    },
  }),
  packets: [
    createPacket("DEFENCE", {
      packetIndex: 0,
      sortOrder: 0,
      hostility: "NON_HOSTILE",
      applyTo: "SELF",
      diceCount: 3,
      potency: 2,
      woundChannel: "PHYSICAL",
      detailsJson: {
        attackMode: "PHYSICAL",
        defenceMode: "Dodge",
        rangeCategory: "SELF",
      },
    }),
    createPacket("DEFENCE", {
      packetIndex: 1,
      sortOrder: 1,
      hostility: "NON_HOSTILE",
      applyTo: "SELF",
      potency: 2,
      woundChannel: "PHYSICAL",
      detailsJson: {
        attackMode: "PHYSICAL",
        defenceMode: "Block",
        rangeCategory: "SELF",
      },
    }),
  ],
  counterMode: "YES",
})).join("\n");
const sameLaneDefenceCounterDescriptor = renderPowerDescriptorLines(createPower({
  name: "Double Guard",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 3,
    potency: 2,
    woundChannel: "PHYSICAL",
    detailsJson: {
      attackMode: "PHYSICAL",
      defenceMode: "Block",
      rangeCategory: "SELF",
    },
  }),
  packets: [
    createPacket("DEFENCE", {
      packetIndex: 0,
      sortOrder: 0,
      hostility: "NON_HOSTILE",
      applyTo: "SELF",
      diceCount: 3,
      potency: 2,
      woundChannel: "PHYSICAL",
      detailsJson: {
        attackMode: "PHYSICAL",
        defenceMode: "Block",
        rangeCategory: "SELF",
      },
    }),
    createPacket("DEFENCE", {
      packetIndex: 1,
      sortOrder: 1,
      hostility: "NON_HOSTILE",
      applyTo: "SELF",
      potency: 1,
      woundChannel: "PHYSICAL",
      detailsJson: {
        attackMode: "PHYSICAL",
        defenceMode: "Block",
        rangeCategory: "SELF",
      },
    }),
  ],
  counterMode: "YES",
})).join("\n");
const resistAndPhysicalCounterDescriptor = renderPowerDescriptorLines(createPower({
  name: "Resist And Guard",
  packet: createPacket("DEFENCE", {
    hostility: "NON_HOSTILE",
    applyTo: "SELF",
    diceCount: 3,
    potency: 2,
    woundChannel: "MENTAL",
    detailsJson: {
      attackMode: "MENTAL",
      defenceMode: "Resist",
      resistedAttribute: "Bravery",
      rangeCategory: "SELF",
    },
  }),
  packets: [
    createPacket("DEFENCE", {
      packetIndex: 0,
      sortOrder: 0,
      hostility: "NON_HOSTILE",
      applyTo: "SELF",
      diceCount: 3,
      potency: 2,
      woundChannel: "MENTAL",
      detailsJson: {
        attackMode: "MENTAL",
        defenceMode: "Resist",
        resistedAttribute: "Bravery",
        rangeCategory: "SELF",
      },
    }),
    createPacket("DEFENCE", {
      packetIndex: 1,
      sortOrder: 1,
      hostility: "NON_HOSTILE",
      applyTo: "SELF",
      potency: 2,
      woundChannel: "PHYSICAL",
      detailsJson: {
        attackMode: "PHYSICAL",
        defenceMode: "Block",
        rangeCategory: "SELF",
      },
    }),
  ],
  counterMode: "YES",
})).join("\n");
const braveryResistDescriptor = renderPowerDescriptorLines(braveryResistPower).join("\n");
const illegalRepositionDescriptor = renderPowerDescriptorLines(illegalRepositionPower).join("\n");
const illegalRepositionNormalized = normalizeMonsterUpsertInput({
  ...createBaseMonster(),
  powers: [illegalRepositionPower],
});
if (!illegalRepositionNormalized.ok) throw new Error(illegalRepositionNormalized.error);
const missingResistedAttributeNormalized = normalizeMonsterUpsertInput({
  ...createBaseMonster(),
  powers: [missingResistedAttributePower],
});
const multiResistedAttributeNormalized = normalizeMonsterUpsertInput({
  ...createBaseMonster(),
  powers: [multiResistedAttributePower],
});
const missingResistedAttributeCharacterErrors = validateCharacterPowers({
  level: 1,
  powers: [normalizeCharacterPower(missingResistedAttributePower, 0)],
});
const multiResistedAttributeCharacterErrors = validateCharacterPowers({
  level: 1,
  powers: [normalizeCharacterPower(multiResistedAttributePower, 0)],
});
const resistDescriptor = renderPowerDescriptorLines(resistPower).join("\n");
const dodgeCost = getFirstPacketBreakdown(dodgePower);
const resistCost = getFirstPacketBreakdown(resistPower);
const combatLabDodgeAdaptation = adaptPowerToCombatActions(dodgePower, {
  cooldownAuthorityMode: "EXPLICIT_BUILTIN_PREVIEW",
});

assert.ok(
  counterstrikeAudit.after.basePowerValue - counterstrikeAudit.before.basePowerValue >= 20,
  "Counterstrike should receive a material attack-counter premium.",
);
assert.ok(
  suddenDaggerAudit.after.basePowerValue - suddenDaggerAudit.before.basePowerValue >= 20,
  "Sudden Dagger should receive a material attack-counter premium.",
);
assert.equal(
  openVeinAudit.after.basePowerValue,
  openVeinAudit.before.basePowerValue,
  "Non-counter Open Vein must not receive attack-counter premium.",
);
assert.ok(
  defenceOnlyCounterAudit.after.accessCost < counterstrikeAudit.after.accessCost,
  "Defence-only Counter premium should remain lower than Attack Counter premium.",
);
assert.ok(
  attackDefenceCounterAudit.after.accessCost > counterstrikeAudit.after.accessCost,
  "Attack + Defence Counter should cost more than Attack-only Counter.",
);
assert.match(
  counterstrikeDescriptor,
  /The target may attempt a Dodge or Protection roll against Counterstrike as soon as the power is declared\./,
);
assert.doesNotMatch(counterstrikeDescriptor, /When used as a Counter|Passive\/static protection still applies|Counter-enabled powers remain normally usable/);
assert.match(
  suddenDaggerDescriptor,
  /The target may attempt a Dodge or Protection roll against Sudden Dagger as soon as the power is declared\./,
);
assert.doesNotMatch(suddenDaggerDescriptor, /When used as a Counter|Passive\/static protection still applies|Counter-enabled powers remain normally usable/);
assert.match(
  openVeinDescriptor,
  /The target may attempt a Dodge or Protection roll against Open Vein as soon as the power is declared\./,
);
assert.doesNotMatch(openVeinDescriptor, /When used as a Counter/);
assert.match(
  dodgeDescriptor,
  /applies 1 Dodge per success/,
);
assert.match(
  characterDodgeDescriptor,
  /applies 1 Dodge per success/,
);
assert.match(
  strongDodgeDescriptor,
  /applies 3 Dodge per success/,
);
assert.match(
  physicalBlockPoolDescriptor,
  /Silver Shield creates a Physical Block Pool with 5 points per success/,
);
assert.equal(
  immediateTimedSelfBlockPoolDescriptor,
  "Target self. On cast, roll 5 dice. Tough it out creates a Physical Block Pool with 4 points per success for 2 turns.",
);
assert.match(
  singularPhysicalBlockPoolDescriptor,
  /Silver Shield creates a Physical Block Pool with 1 point per success/,
);
assert.match(
  mentalBlockPoolDescriptor,
  /Mind Ward creates a Mental Block Pool with 4 points per success/,
);
assert.match(
  dodgePoolDescriptor,
  /Blur creates a Dodge Pool with 4 points per success/,
);
assert.match(
  attachedSilverShieldDescriptor,
  /Attach Silver Shield to yourself until it ends or is removed\. At the start of each turn, roll 5 dice\. Silver Shield creates a Physical Block Pool with 5 points per success\./,
);
assert.match(
  fieldBlockPoolDescriptor,
  /Aegis Field creates a Physical Block Pool with 3 points per success/,
);
assert.match(
  instantPhysicalBlockDescriptor,
  /Silver Shield blocks 5 physical wounds per success/,
);
assert.match(
  instantMentalBlockDescriptor,
  /Mind Ward blocks 5 mental wounds per success/,
);
assert.match(
  dualLaneDefenceCounterDescriptor,
  /Split Guard is a dual-lane Defence Counter: it blocks 4 physical wounds per success and, using the same successes, blocks 2 mental wounds per success\./,
);
assert.match(
  dualLaneDefenceCounterDescriptor,
  /When used as a Counter, roll 3 dice once\./,
);
assert.match(
  dualLaneDefenceCounterDescriptor,
  /Against a single-lane incoming attack, only the matching wound lane applies; against a dual-lane incoming attack, each matching lane applies to its own wounds\./,
);
assert.doesNotMatch(dualLaneDefenceCounterDescriptor, /For each applied success from the primary effect|Packet 1|Packet 2/);
assert.match(
  reverseDualLaneDefenceCounterDescriptor,
  /Mind And Body Guard is a dual-lane Defence Counter: it blocks 3 mental wounds per success and, using the same successes, blocks 5 physical wounds per success\./,
);
assert.doesNotMatch(dodgeAndPhysicalCounterDescriptor, /dual-lane Defence Counter|using the same successes/);
assert.doesNotMatch(sameLaneDefenceCounterDescriptor, /dual-lane Defence Counter|using the same successes/);
assert.doesNotMatch(resistAndPhysicalCounterDescriptor, /dual-lane Defence Counter|using the same successes/);
assert.doesNotMatch(instantPhysicalBlockDescriptor, /Physical Block Pool/);
assert.doesNotMatch(instantMentalBlockDescriptor, /Mental Block Pool/);
assert.doesNotMatch(dodgeDescriptor, /Dodge Pool/);
assert.doesNotMatch(
  [
    physicalBlockPoolDescriptor,
    singularPhysicalBlockPoolDescriptor,
    mentalBlockPoolDescriptor,
    dodgePoolDescriptor,
    attachedSilverShieldDescriptor,
    fieldBlockPoolDescriptor,
  ].join("\n"),
  /(?:blocks \d+ (?:physical|mental) wounds per success|applies \d+ Dodge per success)/,
);
assert.equal(dodgePower.counterMode, "YES");
assert.doesNotMatch(dodgeDescriptor, /When used as a Counter|creates a Dodge defence|avoidable incoming action|Dodge \/ Evade|Reposition/);
assert.doesNotMatch(strongDodgeDescriptor, /When used as a Counter|creates a Dodge defence|avoidable incoming action|Dodge \/ Evade|Reposition/);
assert.deepEqual([...POWER_DEFENCE_MODE_OPTIONS], ["Block", "Dodge", "Resist"]);
assert.deepEqual([...CHARACTER_POWER_DEFENCE_MODES], ["Block", "Dodge", "Resist"]);
assert.deepEqual([...POWER_DEFENCE_RESISTED_ATTRIBUTE_OPTIONS], [
  "Attack",
  "Guard",
  "Fortitude",
  "Intellect",
  "Synergy",
  "Bravery",
]);
assert.deepEqual([...CHARACTER_POWER_DEFENCE_RESISTED_ATTRIBUTES], [
  "Attack",
  "Guard",
  "Fortitude",
  "Intellect",
  "Synergy",
  "Bravery",
]);
assert.equal(missingResistedAttributeNormalized.ok, false);
assert.match(
  missingResistedAttributeNormalized.ok ? "" : missingResistedAttributeNormalized.error,
  /require.*resisted attribute/i,
);
assert.ok(
  missingResistedAttributeCharacterErrors.some((error) =>
    error.includes("Resist requires a resisted attribute"),
  ),
);
assert.equal(multiResistedAttributeNormalized.ok, false);
assert.match(
  multiResistedAttributeNormalized.ok ? "" : multiResistedAttributeNormalized.error,
  /require.*resisted attribute/i,
);
assert.ok(
  multiResistedAttributeCharacterErrors.some((error) =>
    error.includes("Resist requires a resisted attribute"),
  ),
);
assert.equal(
  illegalRepositionNormalized.data.powers[0].effectPackets[0].detailsJson.defenceMode,
  "Block",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    resistPower.effectPackets[0].detailsJson as Record<string, unknown>,
    "defenceCleanupTarget",
  ),
  false,
);
assert.match(
  resistDescriptor,
  /applies 1 Guard Resist per success/,
);
assert.doesNotMatch(resistDescriptor, /Pool/);
assert.match(
  braveryResistDescriptor,
  /applies 3 Bravery Resists per success/,
);
assert.equal(resistPower.counterMode, "YES");
assert.doesNotMatch(resistDescriptor, /When used as a Counter|replaces normal Dodge|does not stack with normal Resist|Passive\/static protection still applies|Counter-enabled powers remain normally usable/);
assert.doesNotMatch(resistDescriptor, /Resist \/ Purge \/ Shake Off/);
assert.doesNotMatch(resistDescriptor, /cleanup|purge|shake off/i);
assert.doesNotMatch(`${resistDescriptor}\n${braveryResistDescriptor}`, /attempts to Resist|removable hostile effect|all hostile effects|any hostile effect|Dodge \/ Evade|Resist \/ Purge \/ Shake Off|Reposition/i);
assert.doesNotMatch(illegalRepositionDescriptor, /Reposition/);
assert.equal(
  dodgeCost.packetSpecificCost,
  DEFAULT_POWER_TUNING_VALUES["packet.defenceMode.dodge"],
);
assert.equal(
  resistCost.packetSpecificCost,
  DEFAULT_POWER_TUNING_VALUES["packet.defenceMode.resist"],
);
assert.equal(DEFAULT_POWER_TUNING_VALUES["packet.defenceMode.dodgeEvade"], undefined);
assert.equal(DEFAULT_POWER_TUNING_VALUES["packet.defenceMode.reposition"], undefined);
assert.equal(DEFAULT_POWER_TUNING_VALUES["packet.defenceMode.resistPurgeShakeOff"], undefined);
assert.equal(combatLabDodgeAdaptation.unsupported.length, 0);
assert.equal(combatLabDodgeAdaptation.actions[0]?.defenceMode, "Dodge");
const triggeredSelfTeleportPacket = createPacket("MOVEMENT", {
  sortOrder: 1,
  packetIndex: 1,
  hostility: "NON_HOSTILE",
  potency: 2,
  applyTo: "SELF",
  effectTimingType: "ON_TRIGGER",
  effectDurationType: "INSTANT",
  detailsJson: {
    movementMode: "Teleport",
    rangeCategory: "SELF",
  },
});
const triggeredSelfAugmentPacket = createPacket("AUGMENT", {
  sortOrder: 1,
  packetIndex: 1,
  hostility: "NON_HOSTILE",
  potency: 1,
  applyTo: "SELF",
  effectTimingType: "ON_TRIGGER",
  effectDurationType: "INSTANT",
  detailsJson: {
    statTarget: "Guard",
    rangeCategory: "SELF",
  },
});
const secondarySelfTeleportDescriptor = renderPowerDescriptorLines({
  ...createPower({
    name: "Secondary Self Teleport Descriptor Smoke",
    rangeCategories: ["RANGED"],
    packet: hostilePrimaryControlPacket,
  }),
  primaryDefenceGate: {
    sourcePacketIndex: 0,
    gateResult: "RESIST",
    protectionChannel: null,
    resistAttribute: "FORTITUDE",
    hostileEntryPattern: null,
    resolutionSource: "INFERRED",
  },
  effectPackets: [hostilePrimaryControlPacket, triggeredSelfTeleportPacket],
  intentions: [hostilePrimaryControlPacket, triggeredSelfTeleportPacket],
}).join("\n");
assert.match(
  secondarySelfTeleportDescriptor,
  /If Secondary Self Teleport Descriptor Smoke applies its Primary Packet, then when triggered, Secondary Self Teleport Descriptor Smoke teleports the caster 10 ft for each applied success from the primary effect\./,
);
const secondarySelfAugmentDescriptor = renderPowerDescriptorLines({
  ...createPower({
    name: "Secondary Self Augment Descriptor Smoke",
    rangeCategories: ["RANGED"],
    packet: hostilePrimaryControlPacket,
  }),
  primaryDefenceGate: {
    sourcePacketIndex: 0,
    gateResult: "RESIST",
    protectionChannel: null,
    resistAttribute: "FORTITUDE",
    hostileEntryPattern: null,
    resolutionSource: "INFERRED",
  },
  effectPackets: [hostilePrimaryControlPacket, triggeredSelfAugmentPacket],
  intentions: [hostilePrimaryControlPacket, triggeredSelfAugmentPacket],
}).join("\n");
assert.match(secondarySelfAugmentDescriptor, /applies 1 stack of \+1 Guard to the caster/);
const sameTimingPrimaryAttackPacket = createPacket("ATTACK", {
  diceCount: 1,
  potency: 1,
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Necrotic"],
    rangeCategory: "MELEE",
  },
});
const sameTimingSecondaryHealPacket = createPacket("HEALING", {
  sortOrder: 1,
  packetIndex: 1,
  hostility: "NON_HOSTILE",
  potency: 2,
  applyTo: "SELF",
  effectTimingType: "ON_CAST",
  effectDurationType: "INSTANT",
  detailsJson: {
    healingMode: "PHYSICAL",
    rangeCategory: "SELF",
  },
});
const sameTimingSecondaryDescriptor = renderPowerDescriptorLines(createPower({
  name: "Same Timing Rider",
  rangeCategories: ["MELEE"],
  packet: sameTimingPrimaryAttackPacket,
  packets: [sameTimingPrimaryAttackPacket, sameTimingSecondaryHealPacket],
  primaryDefenceGate: physicalAttackGate,
})).join("\n");
assert.match(
  sameTimingSecondaryDescriptor,
  /For every 2 wounds inflicted, rounding up, it also heals the caster for 2 physical wounds\./,
);
const fieldPrimaryAttackPacket = createPacket("ATTACK", {
  diceCount: 1,
  potency: 1,
  effectTimingType: "ON_TRIGGER",
  effectDurationType: "INSTANT",
  triggerConditionText: "AREA_ENTERS",
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Necrotic"],
    rangeCategory: "AOE",
    rangeValue: 30,
    rangeExtra: { count: 1, shape: "SPHERE", sphereRadiusFeet: 10 },
  },
});
const fieldSecondaryAllyHealPacket = createPacket("HEALING", {
  sortOrder: 1,
  packetIndex: 1,
  hostility: "NON_HOSTILE",
  potency: 3,
  applyTo: "ALLIES",
  effectTimingType: "START_OF_TURN",
  effectDurationType: "INSTANT",
  detailsJson: {
    healingMode: "PHYSICAL",
    rangeCategory: "AOE",
  },
});
const fieldSecondaryPrimaryTargetHealPacket = createPacket("HEALING", {
  ...fieldSecondaryAllyHealPacket,
  applyTo: "PRIMARY_TARGET",
});
const fieldDependentSecondaryDescriptor = renderPowerDescriptorLines(createPower({
  name: "Field Test",
  descriptorChassis: "FIELD",
  lifespanType: "TURNS",
  lifespanTurns: 2,
  rangeCategories: ["AOE"],
  aoeCenterRangeFeet: 30,
  aoeCount: 1,
  aoeShape: "SPHERE",
  aoeSphereRadiusFeet: 10,
  packet: fieldPrimaryAttackPacket,
  packets: [fieldPrimaryAttackPacket, fieldSecondaryAllyHealPacket],
  primaryDefenceGate: physicalAttackGate,
})).join("\n");
assert.match(
  fieldDependentSecondaryDescriptor,
  /Create 1 sphere with a 10 ft radius within 30 ft\./,
);
assert.match(
  fieldDependentSecondaryDescriptor,
  /When a target enters the area, roll 1 die\. Field Test inflicts 2 physical Necrotic wounds to that target per success\./,
);
assert.match(
  fieldDependentSecondaryDescriptor,
  /When an ally subsequently starts their turn in the area, and Field Test inflicted wounds this round, Field Test heals that ally for 3 physical wounds for every 2 wounds in Field Test's Primary result this round, rounding up\./,
);
assert.doesNotMatch(fieldDependentSecondaryDescriptor, /first time .*triggered each round/i);
assert.doesNotMatch(fieldDependentSecondaryDescriptor, /use that roll for each later trigger this round/i);
assert.doesNotMatch(fieldDependentSecondaryDescriptor, /targets within the area per success/i);
assert.doesNotMatch(fieldDependentSecondaryDescriptor, /allies inside the field/i);
assert.doesNotMatch(fieldDependentSecondaryDescriptor, /it also heals/i);
assert.doesNotMatch(fieldDependentSecondaryDescriptor, /then when an ally/i);
assert.doesNotMatch(fieldDependentSecondaryDescriptor, /\bfor 1 turn\b/);
const fieldPrimaryTargetSecondaryDescriptor = renderPowerDescriptorLines(createPower({
  name: "Target Field test",
  descriptorChassis: "FIELD",
  lifespanType: "TURNS",
  lifespanTurns: 2,
  rangeCategories: ["AOE"],
  aoeCenterRangeFeet: 30,
  aoeCount: 1,
  aoeShape: "SPHERE",
  aoeSphereRadiusFeet: 10,
  packet: fieldPrimaryAttackPacket,
  packets: [fieldPrimaryAttackPacket, fieldSecondaryPrimaryTargetHealPacket],
  primaryDefenceGate: physicalAttackGate,
})).join("\n");
assert.match(
  fieldPrimaryTargetSecondaryDescriptor,
  /When a target subsequently starts its turn in the area, and Target Field test inflicted wounds on that primary target, Target Field test heals that target for 3 physical wounds for every 2 wounds in that target's Primary result this round, rounding up\./,
);
const attachedSecondaryDescriptor = renderPowerDescriptorLines(createPower({
  name: "Attached Aid",
  descriptorChassis: "ATTACHED",
  attachedHostAnchorType: "SELF",
  lifespanType: "TURNS",
  lifespanTurns: 2,
  rangeCategories: ["RANGED"],
  packet: createPacket("CONTROL", {
    ...hostilePrimaryControlPacket,
    effectTimingType: "ON_TRIGGER",
    triggerConditionText: "MAKES_ATTACK",
  }),
  packets: [
    createPacket("CONTROL", {
      ...hostilePrimaryControlPacket,
      effectTimingType: "ON_TRIGGER",
      triggerConditionText: "MAKES_ATTACK",
    }),
    createPacket("HEALING", {
      sortOrder: 1,
      packetIndex: 1,
      hostility: "NON_HOSTILE",
      potency: 2,
      applyTo: "ALLIES",
      effectTimingType: "START_OF_TURN",
      effectDurationType: "TURNS",
      effectDurationTurns: 2,
      detailsJson: {
        healingMode: "MENTAL",
        rangeCategory: "SELF",
      },
    }),
  ],
  primaryDefenceGate: {
    sourcePacketIndex: 0,
    gateResult: "RESIST",
    protectionChannel: null,
    resistAttribute: "FORTITUDE",
    hostileEntryPattern: "ON_PAYLOAD",
    resolutionSource: "INFERRED",
  },
})).join("\n");
assert.match(
  attachedSecondaryDescriptor,
  /If Attached Aid applies its Primary Packet this round, then at the start of each turn, Attached Aid heals allies within range of the attached host for 2 mental wounds for 2 turns for each applied success in Attached Aid's Primary result this round\./,
);
assert.equal(
  (
    weakestMovementAfterPacket.debug as {
      magnitude?: { movementTypeMultiplier?: number; movementTypeMultiplierKey?: string | null };
    }
  ).magnitude?.movementTypeMultiplier,
  0.3,
);
assert.equal(
  (
    weakestMovementAfterPacket.debug as {
      magnitude?: { movementTypeMultiplier?: number; movementTypeMultiplierKey?: string | null };
    }
  ).magnitude?.movementTypeMultiplierKey,
  "packet.magnitude.movementTypeMultiplier.run",
);

const samePowerLowLevelCooldown = derivePowerCooldown(30, DEFAULT_POWER_TUNING_VALUES, {
  level: 1,
  tier: "SOLDIER",
});
const samePowerHighLevelCooldown = derivePowerCooldown(30, DEFAULT_POWER_TUNING_VALUES, {
  level: 10,
  tier: "SOLDIER",
});
const lowerPowerSameLevelCooldown = derivePowerCooldown(10, DEFAULT_POWER_TUNING_VALUES, {
  level: 5,
  tier: "SOLDIER",
});
const higherPowerSameLevelCooldown = derivePowerCooldown(40, DEFAULT_POWER_TUNING_VALUES, {
  level: 5,
  tier: "SOLDIER",
});
const maxClampedCooldown = derivePowerCooldown(
  999,
  {
    ...DEFAULT_POWER_TUNING_VALUES,
    "cooldown.maxTurns": 3,
  },
  { level: 1, tier: "SOLDIER" },
);
const minClampedCooldown = derivePowerCooldown(
  0,
  {
    ...DEFAULT_POWER_TUNING_VALUES,
    "cooldown.minTurns": 2,
  },
  { level: 1, tier: "SOLDIER" },
);
const fallbackCooldown = derivePowerCooldown(30, DEFAULT_POWER_TUNING_VALUES);

assert.ok(
  samePowerLowLevelCooldown.derivedCooldownTurns >=
    samePowerHighLevelCooldown.derivedCooldownTurns,
);
assert.ok(
  higherPowerSameLevelCooldown.derivedCooldownTurns >=
    lowerPowerSameLevelCooldown.derivedCooldownTurns,
);
assert.equal(maxClampedCooldown.derivedCooldownTurns, 3);
assert.equal(minClampedCooldown.derivedCooldownTurns, 2);
assert.equal(fallbackCooldown.level, 1);
assert.ok(fallbackCooldown.notes.some((note) => note.includes("level 1 fallback")));

// Phase 2B new-format Augment/Debuff resolver integration.
const activeFixtureTuning = {
  setId: activePowerTuningFixture.setId,
  name: activePowerTuningFixture.name,
  values: activePowerTuningFixture.values as Record<string, number>,
};

function semanticModifierPacket(params: {
  id: string;
  intention?: "AUGMENT" | "DEBUFF";
  diceCount?: number;
  potency?: number;
  modifier?: 1 | 2 | 3 | 4 | 5;
  attribute?: "ATTACK" | "GUARD" | "BRAVERY";
  duration?: "TURNS" | "PASSIVE" | "UNTIL_TARGET_NEXT_TURN";
  durationTurns?: number | null;
  applyTo?: "PRIMARY_TARGET" | "ALLIES" | "SELF";
  expectedTargetCount?: number;
  packetIndex?: number;
  dependencyMode?: EffectPacket["secondaryDependencyMode"];
  timing?: EffectPacket["effectTimingType"];
}): EffectPacket {
  const intention = params.intention ?? "AUGMENT";
  const attribute = params.attribute ?? "ATTACK";
  return createPacket(intention, {
    id: params.id,
    packetIndex: params.packetIndex ?? 0,
    sortOrder: params.packetIndex ?? 0,
    diceCount: params.diceCount ?? 3,
    potency: params.potency ?? 3,
    modifier: params.modifier ?? 3,
    targetedAttribute: attribute,
    effectTimingType: params.timing ?? "ON_CAST",
    effectDurationType: params.duration ?? "TURNS",
    effectDurationTurns:
      params.duration === "PASSIVE" || params.duration === "UNTIL_TARGET_NEXT_TURN"
        ? null
        : params.durationTurns ?? 2,
    applyTo: params.applyTo ?? (intention === "AUGMENT" ? "ALLIES" : "PRIMARY_TARGET"),
    secondaryDependencyMode: params.dependencyMode ?? "INDEPENDENT",
    detailsJson: {
      statTarget: attribute,
      ...(params.expectedTargetCount === undefined
        ? {}
        : { expectedTargetCount: params.expectedTargetCount }),
    },
  });
}

function semanticPower(params: {
  name: string;
  packet: EffectPacket;
  packets?: EffectPacket[];
  range?: "SELF" | "MELEE" | "RANGED" | "AOE";
  targets?: number;
  distance?: number;
  sphereRadius?: number;
}): Power {
  const range = params.range ?? "RANGED";
  const isDebuff = (params.packet.intention ?? params.packet.type) === "DEBUFF";
  return createPower({
    name: params.name,
    packet: params.packet,
    packets: params.packets,
    rangeCategories: range === "SELF" ? [] : [range],
    meleeTargets: range === "MELEE" ? params.targets ?? 1 : null,
    rangedTargets: range === "RANGED" ? params.targets ?? 1 : null,
    rangedDistanceFeet: range === "RANGED" ? params.distance ?? 30 : null,
    aoeCenterRangeFeet: range === "AOE" ? params.distance ?? 30 : null,
    aoeCount: range === "AOE" ? 1 : null,
    aoeShape: range === "AOE" ? "SPHERE" : null,
    aoeSphereRadiusFeet: range === "AOE" ? params.sphereRadius ?? 0 : null,
    primaryDefenceGate: isDebuff
      ? {
          sourcePacketIndex: 0,
          gateResult: "RESIST",
          protectionChannel: null,
          resistAttribute: "ATTACK",
          hostileEntryPattern: "DIRECT",
          resolutionSource: "EXPLICIT",
        }
      : undefined,
  });
}

const semanticAnchors = [
  ["A", semanticPower({ name: "Anchor A", packet: semanticModifierPacket({ id: "anchor-a", diceCount: 2, potency: 1, modifier: 1, durationTurns: 1 }) }), 6, 1],
  ["B", semanticPower({ name: "Anchor B", packet: semanticModifierPacket({ id: "anchor-b", potency: 2, modifier: 2 }) }), 13.5, 2],
  ["C", semanticPower({ name: "Anchor C", packet: semanticModifierPacket({ id: "anchor-c" }) }), 16, 2],
  ["D", semanticPower({ name: "Anchor D", packet: semanticModifierPacket({ id: "anchor-d", modifier: 5 }) }), 22, 3],
  ["E", semanticPower({ name: "Anchor E", packet: semanticModifierPacket({ id: "anchor-e", modifier: 4, duration: "PASSIVE" }) }), 31.5, 4],
  ["F", semanticPower({ name: "Anchor F", packet: semanticModifierPacket({ id: "anchor-f" }), targets: 3 }), 39, 4],
  ["G", semanticPower({ name: "Anchor G", packet: semanticModifierPacket({ id: "anchor-g", expectedTargetCount: 6 }), range: "AOE" }), 75, 5],
  ["H", semanticPower({ name: "Anchor H", packet: semanticModifierPacket({ id: "anchor-h", intention: "DEBUFF" }) }), 7, 1],
  ["I", semanticPower({ name: "Anchor I", packet: semanticModifierPacket({ id: "anchor-i", intention: "DEBUFF" }), targets: 3 }), 13, 2],
] as const;

const semanticAnchorResults: Record<string, { bpv: number; cooldown: number }> = {};
for (const [name, power, expectedBpv, expectedCooldown] of semanticAnchors) {
  const result = resolvePowerCost(power, activeFixtureTuning, { level: 3 });
  assert.equal(result.basePowerValue, expectedBpv, `Anchor ${name} BPV`);
  assert.equal(result.derivedCooldownTurns, expectedCooldown, `Anchor ${name} cooldown`);
  assert.equal(result.packetCosts[0]?.packetMagnitudeCost, 0, `Anchor ${name} legacy magnitude removed`);
  assert.equal(result.packetCosts[0]?.packetDurationCost, 0, `Anchor ${name} legacy duration removed`);
  assert.equal(result.packetCosts[0]?.contingencyMultiplier, 1, `Anchor ${name} contingency removed`);
  semanticAnchorResults[name] = {
    bpv: result.basePowerValue,
    cooldown: result.derivedCooldownTurns,
  };
}
assert.equal(
  calculateCharacterPlayerPowerSpend(
    semanticAnchorResults.F?.bpv ?? 0,
    DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  ),
  117,
  "Anchor F must use the rounded 39 BPV for character-point conversion",
);

const shellGrid = [
  semanticPower({ name: "Semantic Self", packet: semanticModifierPacket({ id: "semantic-self", applyTo: "SELF" }), range: "SELF" }),
  semanticPower({ name: "Semantic Melee", packet: semanticModifierPacket({ id: "semantic-melee" }), range: "MELEE" }),
  semanticPower({ name: "Semantic Ranged", packet: semanticModifierPacket({ id: "semantic-ranged" }) }),
  semanticPower({ name: "Semantic AOE", packet: semanticModifierPacket({ id: "semantic-aoe", expectedTargetCount: 1 }), range: "AOE" }),
].map((power) => resolvePowerCost(power, activeFixtureTuning, { level: 3 }));
assert.deepEqual(shellGrid.map((result) => result.basePowerValue), [13.5, 15, 16, 17.5]);

const rangedDistanceGrid = [30, 60, 120, 200].map((distance) =>
  resolvePowerCost(
    semanticPower({
      name: `Semantic Range ${distance}`,
      packet: semanticModifierPacket({ id: `semantic-range-${distance}` }),
      distance,
    }),
    activeFixtureTuning,
    { level: 3 },
  ).basePowerValue,
);
assert.deepEqual(rangedDistanceGrid, [16, 16.5, 17, 17.5]);

const geometryGrid = [0, 10, 20, 30].map((sphereRadius) =>
  resolvePowerCost(
    semanticPower({
      name: `Semantic Sphere ${sphereRadius}`,
      packet: semanticModifierPacket({ id: `semantic-sphere-${sphereRadius}`, expectedTargetCount: 1 }),
      range: "AOE",
      sphereRadius,
    }),
    activeFixtureTuning,
    { level: 3 },
  ).basePowerValue,
);
assert.deepEqual(geometryGrid, [17.5, 18, 18.5, 19]);

assert.throws(
  () =>
    resolvePowerCost(
      semanticPower({
        name: "Missing AOE occupancy",
        packet: semanticModifierPacket({ id: "missing-aoe-count" }),
        range: "AOE",
      }),
      activeFixtureTuning,
      { level: 3 },
    ),
  /EXPECTED_TARGET_COUNT_UNRESOLVED/,
);

const lowDeliveryAuthored = resolvePowerCost(
  semanticPower({
    name: "Low delivery matched-reference Debuff",
    packet: semanticModifierPacket({ id: "low-delivery-matched", intention: "DEBUFF", diceCount: 1, modifier: 1, durationTurns: 1 }),
  }),
  activeFixtureTuning,
  { level: 3 },
);
const lowDeliveryDebug = lowDeliveryAuthored.debug.augmentDebuffCalibration as Record<string, unknown>;
assert.ok(!("floorActivated" in lowDeliveryDebug));
assert.ok(!("floorAppliedDeliveryCharge" in lowDeliveryDebug));
assert.ok(!("minimumDeliveryBpv" in lowDeliveryDebug));
assert.ok(
  Math.abs(
    Number(lowDeliveryDebug.linearDeliveryCharge) -
      1.51 * Number(lowDeliveryDebug.aggregateDeliveryUnits),
  ) < 1e-12,
);

const floorPacketA = semanticModifierPacket({ id: "floor-a", diceCount: 1, potency: 1, modifier: 1, durationTurns: 1 });
const floorPacketB = semanticModifierPacket({ id: "floor-b", diceCount: 1, potency: 1, modifier: 1, durationTurns: 1, attribute: "BRAVERY", packetIndex: 1 });
const lowDeliveryAggregate = resolvePowerCost(
  semanticPower({ name: "Linear low-delivery aggregate", packet: floorPacketA, packets: [floorPacketA, floorPacketB] }),
  activeFixtureTuning,
  { level: 3 },
);
const lowDeliveryAggregateDebug = lowDeliveryAggregate.debug.augmentDebuffCalibration as Record<string, unknown>;
assert.ok(
  Math.abs(
    Number(lowDeliveryAggregateDebug.linearDeliveryCharge) -
      1.51 * Number(lowDeliveryAggregateDebug.aggregateDeliveryUnits),
  ) < 1e-12,
);
assert.equal(lowDeliveryAggregate.packetCountComplexityCost, 2);

const linkedParent = semanticModifierPacket({ id: "linked-parent" });
const linkedSecondary = semanticModifierPacket({
  id: "linked-secondary",
  potency: 2,
  modifier: 2,
  attribute: "BRAVERY",
  packetIndex: 1,
  dependencyMode: "LINKED_TO_PRIMARY",
});
const linkedResult = resolvePowerCost(
  semanticPower({ name: "Linked semantic", packet: linkedParent, packets: [linkedParent, linkedSecondary] }),
  activeFixtureTuning,
  { level: 3 },
);
assert.equal(linkedResult.packetCosts[1]?.contingencyMultiplier, 1);
assert.equal(linkedResult.packetCountComplexityCost, 2);
assert.equal(linkedResult.basePowerValue, 29.5);

const sameAttributeA = semanticModifierPacket({ id: "same-a" });
const sameAttributeB = semanticModifierPacket({ id: "same-b", packetIndex: 1 });
const sameAttributeResult = resolvePowerCost(
  semanticPower({ name: "Same attribute clamp", packet: sameAttributeA, packets: [sameAttributeA, sameAttributeB] }),
  activeFixtureTuning,
  { level: 3 },
);
const differentAttributeResult = resolvePowerCost(
  semanticPower({ name: "Different attributes", packet: floorPacketA, packets: [sameAttributeA, { ...sameAttributeB, id: "different-b", targetedAttribute: "BRAVERY", detailsJson: { statTarget: "BRAVERY" } }] }),
  activeFixtureTuning,
  { level: 3 },
);
assert.ok(sameAttributeResult.basePowerValue < differentAttributeResult.basePowerValue);

const legacyModifierPacket = createPacket("AUGMENT", {
  id: "legacy-modifier",
  modifier: null,
  diceCount: 1,
  potency: 1,
  effectDurationType: "TURNS",
  effectDurationTurns: 1,
  applyTo: "ALLIES",
  detailsJson: { statTarget: "ATTACK" },
});
const legacyModifierResult = resolvePowerCost(
  semanticPower({ name: "Legacy modifier-null parity", packet: legacyModifierPacket }),
  activeFixtureTuning,
  { level: 3 },
);
assert.equal(legacyModifierResult.basePowerValue, 7.7);
assert.equal(legacyModifierResult.derivedCooldownTurns, 1);
assert.equal(legacyModifierResult.packetCosts[0]?.debug.economicPath, "LEGACY_OR_NON_MODIFIER");

const mixedNewPacket = semanticModifierPacket({ id: "mixed-new", packetIndex: 1, dependencyMode: "LINKED_TO_PRIMARY" });
const mixedResult = resolvePowerCost(
  semanticPower({ name: "Mixed legacy and semantic", packet: legacyModifierPacket, packets: [legacyModifierPacket, mixedNewPacket] }),
  activeFixtureTuning,
  { level: 3 },
);
assert.equal(mixedResult.packetCosts[0]?.debug.economicPath, "LEGACY_OR_NON_MODIFIER");
assert.equal(mixedResult.packetCosts[1]?.debug.economicPath, "NEW_FORMAT_AUGMENT_DEBUFF_SEMANTIC");
assert.equal(mixedResult.packetCountComplexityCost, 2);

const legacyDebuffParent = createPacket("DEBUFF", {
  id: "legacy-debuff-parent",
  modifier: null,
  diceCount: 3,
  potency: 3,
  effectDurationType: "TURNS",
  effectDurationTurns: 2,
  applyTo: "PRIMARY_TARGET",
  detailsJson: { statTarget: "ATTACK" },
});
const linkedToLegacyDebuff = semanticModifierPacket({
  id: "linked-to-legacy-debuff",
  packetIndex: 1,
  dependencyMode: "LINKED_TO_PRIMARY",
});
const linkedLegacyDebuffResult = resolvePowerCost(
  semanticPower({
    name: "Linked to legacy resisted Debuff",
    packet: legacyDebuffParent,
    packets: [legacyDebuffParent, linkedToLegacyDebuff],
  }),
  activeFixtureTuning,
  { level: 3 },
);
assert.equal(
  linkedLegacyDebuffResult.packetCosts[1]?.debug.economicPath,
  "NEW_FORMAT_AUGMENT_DEBUFF_SEMANTIC",
);
assert.ok(
  Number(
    (linkedLegacyDebuffResult.debug.augmentDebuffCalibration as Record<string, unknown>)
      .aggregateDeliveryUnits,
  ) > 0,
);

const defenceParent = createPacket("DEFENCE", {
  id: "linked-defence-parent",
  hostility: "NON_HOSTILE",
  diceCount: 2,
  potency: 3,
  effectDurationType: "PASSIVE",
  applyTo: "SELF",
  detailsJson: { attackMode: "PHYSICAL", defenceMode: "Block" },
});
const linkedToDefence = semanticModifierPacket({
  id: "linked-to-defence",
  packetIndex: 1,
  dependencyMode: "LINKED_TO_PRIMARY",
  attribute: "GUARD",
  modifier: 1,
  potency: 3,
  durationTurns: 1,
  applyTo: "SELF",
});
const linkedDefenceResult = resolvePowerCost(
  createPower({
    name: "Linked to non-hostile Defence",
    packet: defenceParent,
    packets: [defenceParent, linkedToDefence],
    primaryDefenceGate: {
      sourcePacketIndex: 0,
      gateResult: "NONE",
      protectionChannel: null,
      resistAttribute: null,
      hostileEntryPattern: null,
      resolutionSource: "INFERRED",
    },
  }),
  activeFixtureTuning,
  { level: 3, tier: "ELITE" },
);
assert.equal(
  linkedDefenceResult.packetCosts[1]?.debug.economicPath,
  "NEW_FORMAT_AUGMENT_DEBUFF_SEMANTIC",
);
assert.ok(
  Number(
    (linkedDefenceResult.debug.augmentDebuffCalibration as Record<string, unknown>)
      .aggregateDeliveryUnits,
  ) > 0,
);

assert.throws(
  () =>
    resolvePowerCost(
      semanticPower({
        name: "Unallocatable mixed target magnitude",
        packet: legacyModifierPacket,
        packets: [legacyModifierPacket, mixedNewPacket],
        targets: 3,
      }),
      activeFixtureTuning,
      { level: 3 },
    ),
  /MIXED_SHARED_TARGETING_ALLOCATION_UNRESOLVED/,
);

const mixedSemanticPrimary = semanticModifierPacket({
  id: "mixed-semantic-primary",
  applyTo: "SELF",
});
const mixedHealingSecondary = createPacket("HEALING", {
  id: "mixed-healing-secondary",
  sortOrder: 1,
  packetIndex: 1,
  hostility: "NON_HOSTILE",
  applyTo: "SELF",
  diceCount: 1,
  potency: 1,
});
const mixedNonModifierResult = resolvePowerCost(
  semanticPower({
    name: "Mixed semantic and non-modifier",
    packet: mixedSemanticPrimary,
    packets: [mixedSemanticPrimary, mixedHealingSecondary],
    range: "SELF",
  }),
  activeFixtureTuning,
  { level: 3 },
);
assert.equal(
  mixedNonModifierResult.packetCosts[0]?.debug.economicPath,
  "NEW_FORMAT_AUGMENT_DEBUFF_SEMANTIC",
);
assert.equal(
  mixedNonModifierResult.packetCosts[1]?.debug.economicPath,
  "LEGACY_OR_NON_MODIFIER",
);
assert.equal(mixedNonModifierResult.packetCountComplexityCost, 2);

const unsupportedDependencyPrimary = semanticModifierPacket({ id: "unsupported-dependency-primary" });
const unsupportedDependencySecondary = semanticModifierPacket({
  id: "unsupported-dependency-secondary",
  packetIndex: 1,
  dependencyMode: "DEPENDENT_SEQUENTIAL",
});
assert.throws(
  () =>
    resolvePowerCost(
      semanticPower({
        name: "Unsupported semantic dependency",
        packet: unsupportedDependencyPrimary,
        packets: [unsupportedDependencyPrimary, unsupportedDependencySecondary],
      }),
      activeFixtureTuning,
      { level: 3 },
    ),
  /DEPENDENCY_MODE_UNSUPPORTED/,
);

assert.throws(
  () =>
    resolvePowerCost(
      semanticPower({
        name: "Invalid non-null modifier",
        packet: {
          ...semanticModifierPacket({ id: "invalid-modifier" }),
          modifier: 6,
        },
      }),
      activeFixtureTuning,
      { level: 3 },
    ),
  /MODIFIER_INVALID/,
);

assert.throws(
  () =>
    resolvePowerCost(
      semanticPower({
        name: "Unallocatable mixed targeting",
        packet: legacyModifierPacket,
        packets: [
          legacyModifierPacket,
          { ...mixedNewPacket, id: "mixed-local", localTargetingOverride: { meleeTargets: null, rangedTargets: 2, rangedDistanceFeet: 30, aoeCenterRangeFeet: null, aoeCount: null, aoeShape: null, aoeSphereRadiusFeet: null, aoeConeLengthFeet: null, aoeLineWidthFeet: null, aoeLineLengthFeet: null } },
        ],
      }),
      activeFixtureTuning,
      { level: 3 },
    ),
  /MIXED_SHARED_TARGETING_ALLOCATION_UNRESOLVED/,
);

console.log(
  JSON.stringify(
    {
      weakestSelfRunMovement: {
        unreducedMagnitude: {
          packetMagnitudeCost:
            weakestMovementUnreducedMagnitudeBreakdown.packetCosts[0].packetMagnitudeCost,
          powerContributionMobility: weakestMovementUnreducedMagnitudeBreakdown.axisVector.mobility,
          basePowerValue: weakestMovementUnreducedMagnitudeBreakdown.basePowerValue,
        },
        magnitudeOnly: {
          packetMagnitudeCost: weakestMovementMagnitudeOnlyPacket.packetMagnitudeCost,
          powerContributionMobility: weakestMovementMagnitudeOnlyBreakdown.axisVector.mobility,
          basePowerValue: weakestMovementMagnitudeOnlyBreakdown.basePowerValue,
          finalPreNormalizationAxesMobility:
            weakestMovementMagnitudeOnlyMonsterDebug.finalPreNormalizationAxes?.mobility ?? 0,
          radarMobility: weakestMovementMagnitudeOnlyMonster.radarAxes.mobility,
        },
        after: {
          packetMagnitudeCost: weakestMovementAfterPacket.packetMagnitudeCost,
          axisEmissionMultiplier: weakestMovementAfterPacket.axisEmissionMultiplier,
          axisEmissionValue: weakestMovementAfterPacket.axisEmissionValue,
          powerContributionMobility: weakestMovementAfterBreakdown.axisVector.mobility,
          basePowerValue: weakestMovementAfterBreakdown.basePowerValue,
          finalPreNormalizationAxesMobility:
            weakestMovementAfterMonsterDebug.finalPreNormalizationAxes?.mobility ?? 0,
          radarMobility: weakestMovementAfterMonster.radarAxes.mobility,
        },
        debug: {
          hostility: (weakestMovementAfterPacket.debug as { hostility?: string }).hostility,
          magnitude: (
            weakestMovementAfterPacket.debug as {
              magnitude?: Record<string, unknown>;
            }
          ).magnitude,
        },
      },
      counterPricingAudit: {
        tuningKeys: counterPremiumKeys,
        counterstrike: {
          beforeBasePowerValue: counterstrikeAudit.before.basePowerValue,
          afterBasePowerValue: counterstrikeAudit.after.basePowerValue,
          beforeCharacterSpend: counterstrikeAudit.beforeSpend,
          afterCharacterSpend: counterstrikeAudit.afterSpend,
          accessBefore: counterstrikeAudit.before.accessCost,
          accessAfter: counterstrikeAudit.after.accessCost,
          accessBreakdown: counterstrikeAudit.after.debug.accessBreakdown,
          packetCosts: counterstrikeAudit.after.packetCosts,
          derivedCooldown: counterstrikeAudit.after.derivedCooldownTurns,
        },
        suddenDagger: {
          beforeBasePowerValue: suddenDaggerAudit.before.basePowerValue,
          afterBasePowerValue: suddenDaggerAudit.after.basePowerValue,
          beforeCharacterSpend: suddenDaggerAudit.beforeSpend,
          afterCharacterSpend: suddenDaggerAudit.afterSpend,
          accessBefore: suddenDaggerAudit.before.accessCost,
          accessAfter: suddenDaggerAudit.after.accessCost,
          accessBreakdown: suddenDaggerAudit.after.debug.accessBreakdown,
          packetCosts: suddenDaggerAudit.after.packetCosts,
          derivedCooldown: suddenDaggerAudit.after.derivedCooldownTurns,
        },
        openVein: {
          beforeBasePowerValue: openVeinAudit.before.basePowerValue,
          afterBasePowerValue: openVeinAudit.after.basePowerValue,
          beforeCharacterSpend: openVeinAudit.beforeSpend,
          afterCharacterSpend: openVeinAudit.afterSpend,
          accessBefore: openVeinAudit.before.accessCost,
          accessAfter: openVeinAudit.after.accessCost,
          packetCosts: openVeinAudit.after.packetCosts,
          packetCountComplexityCost: openVeinAudit.after.packetCountComplexityCost,
          crossPacketSynergyCost: openVeinAudit.after.crossPacketSynergyCost,
          derivedCooldown: openVeinAudit.after.derivedCooldownTurns,
        },
      },
      augmentDebuffPhase2B: {
        anchors: semanticAnchorResults,
        shellGrid: shellGrid.map((result) => result.basePowerValue),
        rangedDistanceGrid,
        geometryGrid,
        lowDeliveryMatchedReference: lowDeliveryAuthored.basePowerValue,
        linkedBpv: linkedResult.basePowerValue,
        sameAttributeBpv: sameAttributeResult.basePowerValue,
        differentAttributeBpv: differentAttributeResult.basePowerValue,
        mixedBpv: mixedResult.basePowerValue,
      },
    },
    null,
    2,
  ),
);

console.log("powerCostResolver.smoke.ts passed");
