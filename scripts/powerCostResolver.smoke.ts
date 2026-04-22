import assert from "node:assert/strict";

import { resolvePowerCost } from "../lib/summoning/powerCostResolver";
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

console.log("powerCostResolver.smoke.ts passed");
