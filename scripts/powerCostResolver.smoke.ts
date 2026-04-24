import assert from "node:assert/strict";

import { resolvePowerCost } from "../lib/summoning/powerCostResolver";
import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import { computeMonsterOutcomes } from "../lib/calculators/monsterOutcomeCalculator";
import { DEFAULT_POWER_TUNING_VALUES } from "../lib/config/powerTuningShared";
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
  rangedTargets?: number | null;
  packet: EffectPacket;
}): Power {
  return {
    sortOrder: 0,
    name: config.name,
    description: null,
    descriptorChassis: "IMMEDIATE",
    descriptorChassisConfig: {},
    cooldownTurns: 1,
    cooldownReduction: 0,
    counterMode: "NO",
    commitmentModifier: "STANDARD",
    lifespanType: "NONE",
    lifespanTurns: null,
    rangeCategories: config.rangeCategories ?? [],
    rangedTargets: config.rangedTargets ?? null,
    effectPackets: [config.packet],
    intentions: [config.packet],
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

const selfHeal = getFirstPacketBreakdown(
  createPower({
    name: "Self Heal Smoke",
    packet: selfHealPacket,
  }),
);

assert.equal(selfHeal.axisVector.synergy, 0);
assert.ok(selfHeal.axisVector.physicalSurvivability > 0);
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
const weakestMovementBeforeBreakdown = resolvePowerCost(selfRunMovementPower, {
  values: {
    ...weakestMovementBaselineValues,
    "packet.magnitude.movementTypeMultiplier.run": 1,
  },
});
const weakestMovementAfterBreakdown = resolvePowerCost(selfRunMovementPower, {
  values: weakestMovementBaselineValues,
});
const weakestMovementAfterPacket = weakestMovementAfterBreakdown.packetCosts[0];
const weakestMovementBeforeMonster = computeMonsterOutcomes(createBaseMonster(), calculatorConfig, {
  powerContribution: weakestMovementBeforeBreakdown,
});
const weakestMovementAfterMonster = computeMonsterOutcomes(createBaseMonster(), calculatorConfig, {
  powerContribution: weakestMovementAfterBreakdown,
});
const weakestMovementAfterMonsterDebug = weakestMovementAfterMonster.debug as {
  finalPreNormalizationAxes?: { mobility?: number };
};
const weakestMovementBeforeMonsterDebug = weakestMovementBeforeMonster.debug as {
  finalPreNormalizationAxes?: { mobility?: number };
};

assert.equal(weakestMovementAfterPacket.packetIdentityCost, 0.8);
assert.equal(weakestMovementBeforeBreakdown.packetCosts[0].packetMagnitudeCost, 4);
assert.equal(weakestMovementAfterPacket.packetMagnitudeCost, 0.8);
assert.equal(weakestMovementAfterPacket.packetRecipientCost, 0.5);
assert.equal(weakestMovementAfterPacket.packetSpecificCost, 1);
assert.equal(weakestMovementAfterPacket.axisVector.mobility, 3.1);
assert.equal(weakestMovementAfterBreakdown.basePowerValue, 3.1);
assert.equal(weakestMovementAfterMonsterDebug.finalPreNormalizationAxes?.mobility ?? 0, 3.1);
assert.equal(weakestMovementAfterMonster.radarAxes.mobility, 6.5625);
assert.equal(
  (weakestMovementAfterPacket.debug as { hostility?: string }).hostility,
  "NON_HOSTILE_OR_UNKNOWN",
);
assert.equal(
  (
    weakestMovementAfterPacket.debug as {
      magnitude?: { movementTypeMultiplier?: number; movementTypeMultiplierKey?: string | null };
    }
  ).magnitude?.movementTypeMultiplier,
  0.2,
);
assert.equal(
  (
    weakestMovementAfterPacket.debug as {
      magnitude?: { movementTypeMultiplier?: number; movementTypeMultiplierKey?: string | null };
    }
  ).magnitude?.movementTypeMultiplierKey,
  "packet.magnitude.movementTypeMultiplier.run",
);

console.log(
  JSON.stringify(
    {
      weakestSelfRunMovement: {
        before: {
          packetMagnitudeCost: weakestMovementBeforeBreakdown.packetCosts[0].packetMagnitudeCost,
          powerContributionMobility: weakestMovementBeforeBreakdown.axisVector.mobility,
          basePowerValue: weakestMovementBeforeBreakdown.basePowerValue,
          finalPreNormalizationAxesMobility:
            weakestMovementBeforeMonsterDebug.finalPreNormalizationAxes?.mobility ?? 0,
          radarMobility: weakestMovementBeforeMonster.radarAxes.mobility,
        },
        after: {
          packetMagnitudeCost: weakestMovementAfterPacket.packetMagnitudeCost,
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
    },
    null,
    2,
  ),
);

console.log("powerCostResolver.smoke.ts passed");
