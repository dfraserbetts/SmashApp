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
import type { EffectPacket, Power } from "../lib/summoning/types";

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
  packet: EffectPacket;
  packets?: EffectPacket[];
  counterMode?: Power["counterMode"];
  primaryDefenceGate?: Power["primaryDefenceGate"];
}): Power {
  const packets = config.packets ?? [config.packet];
  return {
    sortOrder: 0,
    name: config.name,
    description: null,
    descriptorChassis: "IMMEDIATE",
    descriptorChassisConfig: {},
    cooldownTurns: 1,
    cooldownReduction: 0,
    counterMode: config.counterMode ?? "NO",
    commitmentModifier: "STANDARD",
    lifespanType: "NONE",
    lifespanTurns: null,
    rangeCategories: config.rangeCategories ?? [],
    meleeTargets: config.meleeTargets ?? null,
    rangedDistanceFeet: config.rangedDistanceFeet ?? null,
    rangedTargets: config.rangedTargets ?? null,
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
assert.match(
  counterstrikeDescriptor,
  /When used as a Counter, this attack does not allow the triggering attacker an active defence roll\. Passive\/static protection still applies\./,
);
assert.match(
  suddenDaggerDescriptor,
  /The target may attempt a Dodge or Protection roll against Sudden Dagger as soon as the power is declared\./,
);
assert.match(
  suddenDaggerDescriptor,
  /When used as a Counter, this attack does not allow the triggering attacker an active defence roll\. Passive\/static protection still applies\./,
);
assert.match(
  openVeinDescriptor,
  /The target may attempt a Dodge or Protection roll against Open Vein as soon as the power is declared\./,
);
assert.doesNotMatch(openVeinDescriptor, /When used as a Counter/);
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
  /For each applied success from the primary effect, it also teleports the caster 10 ft when triggered\./,
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
    },
    null,
    2,
  ),
);

console.log("powerCostResolver.smoke.ts passed");
