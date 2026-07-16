import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import {
  computeMonsterOutcomes,
  type CanonicalPowerContribution,
} from "../lib/calculators/monsterOutcomeCalculator";
import {
  computeLevel3SemanticSynergy,
  LEVEL_3_SEMANTIC_SYNERGY_TUNING,
  SEMANTIC_SYNERGY_DIAGNOSTIC,
  type SemanticSynergyResult,
} from "../lib/calculators/semanticSynergy";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import type { PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import {
  attachPowerCooldownAuthority,
  resolvePowerCooldownAuthority,
} from "../lib/summoning/resolvePowerCooldownAuthority";
import type {
  EffectPacket,
  MonsterTier,
  MonsterUpsertInput,
  Power,
} from "../lib/summoning/types";
import activePowerTuningFixture from "./fixtures/tuning/active-power-tuning.json";

type SemanticFixture = {
  id: string;
  rawSupport: number;
  score: number;
  basePowerValue: number;
  cooldowns: number[];
  radarAxes: ReturnType<typeof computeMonsterOutcomes>["radarAxes"];
  model: SemanticSynergyResult;
  runtimeMs: number;
};

const fixtures: SemanticFixture[] = [];
let assertionCount = 0;
const activePowerTuning: PowerTuningSnapshot = {
  setId: activePowerTuningFixture.setId,
  name: activePowerTuningFixture.name,
  slug: activePowerTuningFixture.slug,
  status: activePowerTuningFixture.status as PowerTuningSnapshot["status"],
  updatedAt: activePowerTuningFixture.updatedAt,
  values: activePowerTuningFixture.values as Record<string, number>,
};

function check(name: string, condition: boolean): void {
  assertionCount += 1;
  assert.ok(condition, name);
  console.log(`PASS ${String(assertionCount).padStart(2, "0")}: ${name}`);
}

function near(actual: number, expected: number, tolerance: number, name: string): void {
  check(`${name} (actual ${actual})`, Math.abs(actual - expected) <= tolerance);
}

function stableId(kind: "power" | "packet", identity: string): string {
  return `semantic-synergy-${kind}-${identity.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function packet(params: {
  identity: string;
  packetIndex?: number;
  diceCount?: number;
  potency?: number;
  modifier?: 1 | 2 | 3 | 4 | 5 | null;
  attribute?: "ATTACK" | "GUARD" | "FORTITUDE" | "INTELLECT" | "SYNERGY" | "BRAVERY";
  intention?: EffectPacket["intention"];
  duration?: "TURNS" | "PASSIVE" | "UNTIL_TARGET_NEXT_TURN";
  durationTurns?: number | null;
  timing?: EffectPacket["effectTimingType"];
  applyTo?: EffectPacket["applyTo"];
  dependency?: EffectPacket["secondaryDependencyMode"];
  expectedTargets?: number;
  idOverride?: string | null;
}): EffectPacket {
  const intention = params.intention ?? "AUGMENT";
  const packetIndex = params.packetIndex ?? 0;
  const duration = params.duration ?? "TURNS";
  const expectedTargets = params.expectedTargets ?? 1;
  return {
    id:
      params.idOverride === undefined
        ? stableId("packet", params.identity)
        : (params.idOverride ?? undefined),
    sortOrder: packetIndex,
    packetIndex,
    hostility: intention === "DEBUFF" ? "HOSTILE" : "NON_HOSTILE",
    intention,
    type: intention,
    diceCount: params.diceCount ?? 3,
    potency: params.potency ?? 3,
    modifier: params.modifier === undefined ? 3 : params.modifier,
    effectTimingType: params.timing ?? "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: duration,
    effectDurationTurns:
      duration === "TURNS" ? (params.durationTurns ?? 2) : null,
    dealsWounds: false,
    woundChannel: null,
    targetedAttribute: params.attribute ?? "ATTACK",
    applicationModeKey: null,
    resolutionOrigin: "CASTER",
    applyTo: params.applyTo ?? "ALLIES",
    secondaryDependencyMode: params.dependency ?? "INDEPENDENT",
    triggerConditionText: null,
    detailsJson: {
      statTarget: params.attribute ?? "ATTACK",
      expectedTargetCount: expectedTargets,
      rangeCategory: "RANGED",
    },
    localTargetingOverride: null,
  };
}

function power(params: {
  identity: string;
  packets: EffectPacket[];
  range?: "SELF" | "RANGED" | "AOE";
  rangedTargets?: number;
  rangedDistanceFeet?: number;
  sphereRadiusFeet?: number;
  idOverride?: string | null;
}): Power {
  const range = params.range ?? "RANGED";
  const primary = params.packets[0];
  return {
    id:
      params.idOverride === undefined
        ? stableId("power", params.identity)
        : (params.idOverride ?? undefined),
    sortOrder: 0,
    name: params.identity,
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
    cooldownTurns: 1,
    cooldownReduction: 0,
    counterMode: "NO",
    commitmentModifier: "STANDARD",
    triggerMethod: null,
    attachedHostAnchorType: null,
    lifespanType: "NONE",
    lifespanTurns: null,
    previewSummaryOverride: null,
    rangeCategories: range === "SELF" ? [] : [range],
    meleeTargets: null,
    rangedTargets: range === "RANGED" ? (params.rangedTargets ?? 1) : null,
    rangedDistanceFeet: range === "RANGED" ? (params.rangedDistanceFeet ?? 30) : null,
    aoeCenterRangeFeet: range === "AOE" ? 30 : null,
    aoeCount: range === "AOE" ? 1 : null,
    aoeShape: range === "AOE" ? "SPHERE" : null,
    aoeSphereRadiusFeet: range === "AOE" ? (params.sphereRadiusFeet ?? 0) : null,
    aoeConeLengthFeet: null,
    aoeLineWidthFeet: null,
    aoeLineLengthFeet: null,
    primaryDefenceGate: null,
    effectPackets: params.packets,
    intentions: params.packets,
    diceCount: Number(primary?.diceCount ?? 1),
    potency: Number(primary?.potency ?? 1),
    effectDurationType: primary?.effectDurationType ?? "INSTANT",
    effectDurationTurns: primary?.effectDurationTurns ?? null,
    durationType: primary?.effectDurationType ?? "INSTANT",
    durationTurns: primary?.effectDurationTurns ?? null,
  };
}

function baseMonster(params: {
  powers: Power[];
  tier?: MonsterTier;
  level?: number;
  die?: "D4" | "D6" | "D8" | "D10" | "D12";
}): MonsterUpsertInput {
  const die = params.die ?? "D8";
  return {
    name: "Semantic Synergy Fixture",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: params.level ?? 3,
    tier: params.tier ?? "SOLDIER",
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
    attackDie: die,
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: die,
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: die,
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: die,
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: die,
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: die,
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
    powers: params.powers,
  };
}

function hydratePowers(powers: Power[], tier: MonsterTier, level: number): Power[] {
  return powers.map((authored) => {
    const resolution = resolvePowerCooldownAuthority({
      power: authored,
      mode: "ACTIVE_CURRENT_BALANCE",
      tuningSnapshot: activePowerTuning,
      context: { level, tier },
    });
    assert.ok(resolution.ok, resolution.ok ? "" : resolution.message);
    return attachPowerCooldownAuthority(authored, resolution);
  });
}

function contribution(powers: Power[], tier: MonsterTier, level: number): CanonicalPowerContribution {
  const costs = resolvePowerCosts(powers, activePowerTuning, { level, tier });
  return {
    axisVector: costs.totals.axisVector,
    basePowerValue: costs.totals.basePowerValue,
    powerCount: powers.length,
    powers: costs.powers.map((cost, index) => ({
      id: powers[index]?.id ?? null,
      name: powers[index]?.name ?? null,
      axisVector: cost.breakdown.axisVector,
      basePowerValue: cost.breakdown.basePowerValue,
      authoredPower: powers[index] ?? null,
      cooldownAuthority: powers[index]?.cooldownAuthority ?? null,
      derivedCooldownTurns: cost.derivedCooldownTurns,
      derivedCooldownLoad: cost.derivedCooldown.cooldownLoad,
      cooldownTurns: powers[index]?.cooldownTurns ?? null,
      cooldownReduction: powers[index]?.cooldownReduction ?? 0,
    })),
    debug: costs,
  };
}

function semanticModel(outcome: ReturnType<typeof computeMonsterOutcomes>): SemanticSynergyResult {
  const model = outcome.debug?.semanticSynergyAxisModel;
  assert.ok(model && typeof model === "object");
  return model as SemanticSynergyResult;
}

function runFixture(params: {
  id: string;
  powers?: Power[];
  tier?: MonsterTier;
  level?: number;
  die?: "D4" | "D6" | "D8" | "D10" | "D12";
  traitSynergy?: number;
}): SemanticFixture {
  const tier = params.tier ?? "SOLDIER";
  const level = params.level ?? 3;
  const hydrated = hydratePowers(params.powers ?? [], tier, level);
  const powerContribution = contribution(hydrated, tier, level);
  const monster = baseMonster({ powers: hydrated, tier, level, die: params.die });
  const started = performance.now();
  const outcome = computeMonsterOutcomes(monster, calculatorConfig, {
    powerContribution,
    traitAxisBonuses: params.traitSynergy
      ? {
          physicalThreat: 0,
          mentalThreat: 0,
          physicalSurvivability: 0,
          mentalSurvivability: 0,
          manipulation: 0,
          synergy: params.traitSynergy,
          mobility: 0,
          presence: 0,
        }
      : undefined,
  });
  const model = semanticModel(outcome);
  const fixture = {
    id: params.id,
    rawSupport: model.rawSemanticSupport,
    score: outcome.radarAxes.synergy,
    basePowerValue: Number(powerContribution.basePowerValue ?? 0),
    cooldowns: hydrated.map((entry) => entry.cooldownAuthority?.effectiveCooldownTurns ?? 0),
    radarAxes: outcome.radarAxes,
    model,
    runtimeMs: performance.now() - started,
  };
  fixtures.push(fixture);
  return fixture;
}

function singlePower(params: {
  identity: string;
  diceCount: number;
  potency: number;
  modifier: 1 | 2 | 3 | 4 | 5;
  attribute?: "ATTACK" | "BRAVERY";
  duration?: "TURNS" | "PASSIVE" | "UNTIL_TARGET_NEXT_TURN";
  durationTurns?: number;
  expectedTargets?: number;
  authoredTargets?: number;
  range?: "RANGED" | "AOE";
  timing?: EffectPacket["effectTimingType"];
  rangedDistanceFeet?: number;
}): Power {
  return power({
    identity: params.identity,
    packets: [
      packet({
        identity: `${params.identity}-packet`,
        diceCount: params.diceCount,
        potency: params.potency,
        modifier: params.modifier,
        attribute: params.attribute,
        duration: params.duration,
        durationTurns: params.durationTurns,
        expectedTargets: params.expectedTargets,
        timing: params.timing,
      }),
    ],
    range: params.range,
    rangedTargets: params.authoredTargets ?? params.expectedTargets,
    rangedDistanceFeet: params.rangedDistanceFeet,
    sphereRadiusFeet: 0,
  });
}

const noSupport = runFixture({ id: "no-support" });
check("Fixture 1 no-support control is zero", noSupport.rawSupport === 0 && noSupport.score === 0);

const courtMage = runFixture({
  id: "saved-court-mage",
  powers: [
    singlePower({
      identity: "Saved Court Mage Bravery",
      diceCount: 2,
      potency: 2,
      modifier: 1,
      attribute: "BRAVERY",
      duration: "UNTIL_TARGET_NEXT_TURN",
      expectedTargets: 3,
      rangedDistanceFeet: 120,
    }),
  ],
});
near(courtMage.basePowerValue, 9.5, 1e-12, "Fixture 2 Court Mage BPV 9.5");
check("Fixture 2 Court Mage cooldown 1", courtMage.cooldowns[0] === 1);
near(courtMage.rawSupport, 7.734375, 1e-9, "Fixture 2 Court Mage raw support");
near(courtMage.score, 3.281, 0.001, "Fixture 2 Court Mage score");

const simpleM1 = runFixture({
  id: "simple-m1",
  powers: [singlePower({ identity: "Simple M1", diceCount: 2, potency: 1, modifier: 1, durationTurns: 1 })],
});
near(simpleM1.rawSupport, 2.578125, 1e-9, "Fixture 3 Simple M1 raw support");
near(simpleM1.score, 1.413, 0.001, "Fixture 3 Simple M1 score");

const routineM3 = runFixture({
  id: "routine-m3",
  powers: [singlePower({ identity: "Routine M3", diceCount: 3, potency: 3, modifier: 3, durationTurns: 2 })],
});
near(routineM3.basePowerValue, 16, 1e-12, "Fixture 4 Routine M3 BPV 16");
check("Fixture 4 Routine M3 cooldown 2", routineM3.cooldowns[0] === 2);
near(routineM3.rawSupport, 15.15625, 1e-9, "Fixture 4 Routine M3 raw support");
near(routineM3.score, 5, 1e-9, "Fixture 4 Routine M3 score");

const strongM5 = runFixture({
  id: "strong-m5",
  powers: [singlePower({ identity: "Strong M5", diceCount: 3, potency: 3, modifier: 5, durationTurns: 2 })],
});
near(strongM5.basePowerValue, 22, 1e-12, "Fixture 5 Strong M5 BPV 22");
check("Fixture 5 Strong M5 cooldown 3", strongM5.cooldowns[0] === 3);
near(strongM5.rawSupport, 17.05078125, 1e-9, "Fixture 5 Strong M5 raw support");
near(strongM5.score, 5.342, 0.001, "Fixture 5 Strong M5 score");

const longM3 = runFixture({
  id: "long-m3",
  powers: [singlePower({ identity: "Long M3", diceCount: 3, potency: 3, modifier: 3, durationTurns: 4 })],
});
near(longM3.basePowerValue, 26, 1e-12, "Fixture 6 Long M3 BPV 26");
check("Fixture 6 Long M3 cooldown 3", longM3.cooldowns[0] === 3);
near(longM3.rawSupport, 17.890625, 1e-9, "Fixture 6 Long M3 raw support");
near(longM3.score, 5.484, 0.001, "Fixture 6 Long M3 score");

const passiveM4 = runFixture({
  id: "passive-m4",
  powers: [singlePower({ identity: "Passive M4", diceCount: 3, potency: 3, modifier: 4, duration: "PASSIVE" })],
});
near(passiveM4.basePowerValue, 31.5, 1e-12, "Fixture 7 Passive M4 BPV 31.5");
check("Fixture 7 Passive M4 diagnostic cooldown 4", passiveM4.cooldowns[0] === 4);
near(passiveM4.rawSupport, 17.626953125, 1e-9, "Fixture 7 Passive M4 four-turn raw support");
near(passiveM4.score, 5.44, 0.001, "Fixture 7 Passive M4 score");
check("Fixture 7 Passive is capacity-free", passiveM4.model.policy.passiveConsumesCapacity === false);

const threeTargetM3 = runFixture({
  id: "three-target-m3",
  powers: [singlePower({ identity: "Three Target M3", diceCount: 3, potency: 3, modifier: 3, durationTurns: 2, expectedTargets: 3 })],
});
near(threeTargetM3.basePowerValue, 39, 1e-12, "Fixture 8 Three-target M3 BPV 39");
check("Fixture 8 Three-target M3 cooldown 4", threeTargetM3.cooldowns[0] === 4);
near(threeTargetM3.rawSupport, 22.734375, 1e-9, "Fixture 8 Three-target M3 raw support");
near(threeTargetM3.score, 6.22, 0.001, "Fixture 8 Three-target M3 score");

const sixTargetM3 = runFixture({
  id: "six-target-m3",
  powers: [singlePower({ identity: "Six Target M3", diceCount: 3, potency: 3, modifier: 3, durationTurns: 2, expectedTargets: 6, range: "AOE" })],
});
near(sixTargetM3.basePowerValue, 75, 1e-12, "Fixture 9 Anchor G BPV 75");
check("Fixture 9 Anchor G cooldown 5", sixTargetM3.cooldowns[0] === 5);
near(sixTargetM3.rawSupport, 45.46875, 1e-9, "Fixture 9 Anchor G raw support");
near(sixTargetM3.score, 8.547, 0.001, "Fixture 9 Anchor G score");

const recurringM3 = runFixture({
  id: "recurring-m3",
  powers: [singlePower({ identity: "Recurring M3", diceCount: 3, potency: 3, modifier: 3, durationTurns: 2, timing: "START_OF_TURN" })],
});
near(recurringM3.basePowerValue, 29.5, 1e-12, "Fixture 10 Recurring M3 BPV 29.5");
check("Fixture 10 Recurring M3 cooldown 4", recurringM3.cooldowns[0] === 4);
near(recurringM3.rawSupport, 19.74456787109375, 1e-9, "Fixture 10 Recurring M3 raw support");
near(recurringM3.score, 5.782, 0.001, "Fixture 10 Recurring M3 score");

const linkedPrimary = packet({ identity: "linked-primary", diceCount: 3, potency: 3, modifier: 3, attribute: "ATTACK" });
const linkedSecondary = packet({
  identity: "linked-secondary",
  packetIndex: 1,
  diceCount: 3,
  potency: 2,
  modifier: 2,
  attribute: "BRAVERY",
  dependency: "LINKED_TO_PRIMARY",
});
const linkedM3M2 = runFixture({
  id: "linked-m3-m2",
  powers: [power({ identity: "Linked M3 plus M2", packets: [linkedPrimary, linkedSecondary] })],
});
near(linkedM3M2.basePowerValue, 29.5, 1e-12, "Fixture 11 Linked M3+M2 BPV 29.5");
check("Fixture 11 Linked M3+M2 cooldown 4", linkedM3M2.cooldowns[0] === 4);
near(linkedM3M2.rawSupport, 13.26171875, 1e-9, "Fixture 11 Linked M3+M2 raw support");
near(linkedM3M2.score, 4.626, 0.001, "Fixture 11 Linked M3+M2 score");

const sameA = packet({ identity: "same-attribute-a", modifier: 3, attribute: "ATTACK" });
const sameB = packet({ identity: "same-attribute-b", packetIndex: 1, modifier: 3, attribute: "ATTACK" });
const samePowerSameAttribute = runFixture({
  id: "same-power-same-attribute",
  powers: [power({ identity: "Same Power Same Attribute", packets: [sameA, sameB] })],
});
near(samePowerSameAttribute.basePowerValue, 27, 1e-12, "Fixture 12 same-attribute BPV 27");
check("Fixture 12 same-attribute cooldown 3", samePowerSameAttribute.cooldowns[0] === 3);
near(samePowerSameAttribute.rawSupport, 17.350502014160156, 1e-9, "Fixture 12 same-attribute five-turn raw support");
near(samePowerSameAttribute.score, 5.393, 0.001, "Fixture 12 same-attribute score");

const differentA = packet({ identity: "different-attribute-a", modifier: 3, attribute: "ATTACK" });
const differentB = packet({ identity: "different-attribute-b", packetIndex: 1, modifier: 3, attribute: "BRAVERY" });
const samePowerDifferentAttribute = runFixture({
  id: "same-power-different-attribute",
  powers: [power({ identity: "Same Power Different Attribute", packets: [differentA, differentB] })],
});
near(samePowerDifferentAttribute.basePowerValue, 32.5, 1e-12, "Fixture 13 different-attribute BPV 32.5");
check("Fixture 13 different-attribute cooldown 4", samePowerDifferentAttribute.cooldowns[0] === 4);
near(samePowerDifferentAttribute.rawSupport, 15.15625, 1e-9, "Fixture 13 different-attribute raw support");
near(samePowerDifferentAttribute.score, 5, 1e-9, "Fixture 13 different-attribute score");

const differentPowerSameAttribute = runFixture({
  id: "different-power-same-attribute",
  powers: [
    singlePower({ identity: "Same Attribute Power A", diceCount: 3, potency: 3, modifier: 3, attribute: "ATTACK", durationTurns: 2 }),
    singlePower({ identity: "Same Attribute Power B", diceCount: 3, potency: 3, modifier: 3, attribute: "ATTACK", durationTurns: 2 }),
  ],
});
near(differentPowerSameAttribute.rawSupport, 22.934188842773438, 1e-9, "Fixture 14 different-power same-attribute raw support");
near(differentPowerSameAttribute.score, 6.248, 0.001, "Fixture 14 different-power same-attribute score");

const differentPowerDifferentAttribute = runFixture({
  id: "different-power-different-attribute",
  powers: [
    singlePower({ identity: "Different Attribute Power A", diceCount: 3, potency: 3, modifier: 3, attribute: "ATTACK", durationTurns: 2 }),
    singlePower({ identity: "Different Attribute Power B", diceCount: 3, potency: 3, modifier: 3, attribute: "BRAVERY", durationTurns: 2 }),
  ],
});
near(differentPowerDifferentAttribute.rawSupport, 26.5234375, 1e-9, "Fixture 15 different-power different-attribute raw support");
near(differentPowerDifferentAttribute.score, 6.714, 0.001, "Fixture 15 different-power different-attribute score");

const minionMidpoint = runFixture({
  id: "minion-midpoint",
  tier: "MINION",
  die: "D6",
  powers: [singlePower({ identity: "Minion Midpoint", diceCount: 2, potency: 1, modifier: 1, durationTurns: 1 })],
});
near(minionMidpoint.rawSupport, 2.25, 1e-9, "Fixture 16 Minion midpoint raw support");
near(minionMidpoint.score, 5, 1e-8, "Fixture 16 Minion midpoint score");

near(routineM3.rawSupport, 15.15625, 1e-9, "Fixture 17 Soldier midpoint raw support");
near(routineM3.score, 5, 1e-9, "Fixture 17 Soldier midpoint score");

const eliteMidpoint = runFixture({
  id: "elite-midpoint",
  tier: "ELITE",
  die: "D10",
  powers: [singlePower({ identity: "Elite Midpoint", diceCount: 3, potency: 3, modifier: 3, durationTurns: 2, expectedTargets: 3 })],
});
near(eliteMidpoint.rawSupport, 23.352, 1e-9, "Fixture 18 Elite midpoint raw support");
near(eliteMidpoint.score, 5, 1e-8, "Fixture 18 Elite midpoint score");

const bossMidpoint = runFixture({
  id: "boss-midpoint",
  tier: "BOSS",
  die: "D10",
  powers: [
    singlePower({ identity: "Boss Midpoint Attack", diceCount: 3, potency: 3, modifier: 3, attribute: "ATTACK", durationTurns: 2, expectedTargets: 3 }),
    singlePower({ identity: "Boss Midpoint Bravery", diceCount: 3, potency: 3, modifier: 3, attribute: "BRAVERY", durationTurns: 2, expectedTargets: 3 }),
  ],
});
near(bossMidpoint.rawSupport, 46.704, 1e-9, "Fixture 19 Boss midpoint raw support");
near(bossMidpoint.score, 5, 1e-8, "Fixture 19 Boss midpoint score");
check("Boss uses capacity 2 without division", bossMidpoint.model.activeCapacity === 2);

check("Invariant M1 < M3 < M5", simpleM1.rawSupport < routineM3.rawSupport && routineM3.rawSupport < strongM5.rawSupport);
check("Invariant breadth 1 < 3 < 6", routineM3.rawSupport < threeTargetM3.rawSupport && threeTargetM3.rawSupport < sixTargetM3.rawSupport);
check("Invariant two turns < four turns", routineM3.rawSupport < longM3.rawSupport);
check("Invariant Passive radar cap is four turns", passiveM4.model.policy.passiveContributionTurns === 4);
check("Invariant linked packet inherits application", linkedM3M2.model.policy.linkedApplication === "INHERIT_TARGET_LOCAL_PRIMARY");
const cadenceOnlySelfPacket = packet({
  identity: "matched-cadence-self",
  packetIndex: 2,
  diceCount: 1,
  potency: 1,
  modifier: 1,
  attribute: "GUARD",
  durationTurns: 1,
  applyTo: "SELF",
});
cadenceOnlySelfPacket.detailsJson = {
  statTarget: "GUARD",
  expectedTargetCount: 1,
  rangeCategory: "SELF",
};
const sameAttributeMatchedCadencePower = power({
  identity: "Same Attribute Matched Cadence",
  packets: [
    packet({ identity: "matched-cadence-same-a", modifier: 3, attribute: "ATTACK" }),
    packet({ identity: "matched-cadence-same-b", packetIndex: 1, modifier: 3, attribute: "ATTACK" }),
    cadenceOnlySelfPacket,
  ],
});
const sameAttributeMatchedCadence = runFixture({
  id: "same-attribute-matched-cadence",
  powers: [sameAttributeMatchedCadencePower],
});
check(
  `Invariant per-cast same attribute is below different attribute (same cooldown/raw ${sameAttributeMatchedCadence.cooldowns[0]}/${sameAttributeMatchedCadence.rawSupport}; different ${samePowerDifferentAttribute.cooldowns[0]}/${samePowerDifferentAttribute.rawSupport})`,
  sameAttributeMatchedCadence.cooldowns[0] === samePowerDifferentAttribute.cooldowns[0] &&
    sameAttributeMatchedCadence.rawSupport < samePowerDifferentAttribute.rawSupport,
);
check("Invariant cooldown may reverse whole-horizon ordering", samePowerSameAttribute.rawSupport > samePowerDifferentAttribute.rawSupport);
check("Invariant different-power same attribute < different attribute", differentPowerSameAttribute.rawSupport < differentPowerDifferentAttribute.rawSupport);

const duplicatePacketId = stableId("packet", "duplicate-stable-identity");
const duplicateIdentity = runFixture({
  id: "duplicate-identity",
  powers: [
    power({ identity: "Duplicate Stable Identity A", packets: [packet({ identity: "ignored-a", idOverride: duplicatePacketId })] }),
    power({ identity: "Duplicate Stable Identity B", packets: [packet({ identity: "ignored-b", idOverride: duplicatePacketId })] }),
  ],
});
check("Invariant exact duplicate stable packet identity counted once", duplicateIdentity.model.duplicatePacketIdsRemoved.includes(duplicatePacketId));
check("Invariant distinct packet identities retained", samePowerSameAttribute.model.detectedSemanticPacketCount === 2 && samePowerSameAttribute.model.duplicatePacketIdsRemoved.length === 0);
check("Invariant +5 clamp active", samePowerSameAttribute.model.policy.sameAttributeClamp === 5);
check("Invariant all tier midpoints score 5", [minionMidpoint, routineM3, eliteMidpoint, bossMidpoint].every((fixture) => Math.abs(fixture.score - 5) < 1e-8));
check("Invariant no cross-creature discount", routineM3.rawSupport === runFixture({ id: "cross-creature-independent", powers: [singlePower({ identity: "Cross Creature Independent", diceCount: 3, potency: 3, modifier: 3, durationTurns: 2 })] }).rawSupport);
check("Invariant active capacity is respected", differentPowerDifferentAttribute.model.activeCapacity === 1 && differentPowerDifferentAttribute.rawSupport < routineM3.rawSupport * 2);

const missingIdentityPower = power({
  identity: "Missing Identity",
  idOverride: null,
  packets: [packet({ identity: "missing-id-packet", idOverride: null })],
});
const missingIdentity = computeLevel3SemanticSynergy({
  monster: baseMonster({ powers: [missingIdentityPower] }),
  powers: [{ authoredPower: missingIdentityPower, cooldownAuthority: { effectiveCooldownTurns: 2, source: "BUILTIN_DEFAULTS", tuningSetId: null, tuningUpdatedAt: null, storedCooldownTurns: null, mismatch: false, warnings: [], basePowerValue: 0, cooldownLoad: 0 } }],
  legacyRawSynergy: 0,
  legacyNonPowerSynergy: 0,
});
check("Invariant missing stable identity fails closed", missingIdentity.mode === "SEMANTIC_UNSUPPORTED" && missingIdentity.diagnostics.some((entry) => entry.code === SEMANTIC_SYNERGY_DIAGNOSTIC.missingIdentity));

const missingCooldownPower = power({ identity: "Missing Cooldown", packets: [packet({ identity: "missing-cooldown-packet" })] });
const missingCooldown = computeLevel3SemanticSynergy({
  monster: baseMonster({ powers: [missingCooldownPower] }),
  powers: [{ id: missingCooldownPower.id, authoredPower: missingCooldownPower, cooldownAuthority: null }],
  legacyRawSynergy: 0,
  legacyNonPowerSynergy: 0,
});
check("Invariant missing cooldown authority fails closed", missingCooldown.mode === "SEMANTIC_UNSUPPORTED" && missingCooldown.diagnostics.some((entry) => entry.code === SEMANTIC_SYNERGY_DIAGNOSTIC.missingCooldown));

const unsupportedLevel = runFixture({
  id: "unsupported-level",
  level: 4,
  powers: [singlePower({ identity: "Unsupported Level", diceCount: 3, potency: 3, modifier: 3, durationTurns: 2 })],
});
check("Invariant unsupported level fails closed", unsupportedLevel.model.mode === "SEMANTIC_UNSUPPORTED" && unsupportedLevel.score === 0 && unsupportedLevel.model.diagnostics.some((entry) => entry.code === SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedLevel));

const responseSupportPower = singlePower({
  identity: "Unsupported Response Support",
  diceCount: 3,
  potency: 3,
  modifier: 3,
  durationTurns: 2,
});
responseSupportPower.counterMode = "YES";
const responseSupport = runFixture({ id: "unsupported-response-support", powers: [responseSupportPower] });
check(
  "Invariant Response support remains explicitly unsupported",
  responseSupport.model.mode === "SEMANTIC_UNSUPPORTED" &&
    responseSupport.score === 0 &&
    responseSupport.model.diagnostics.some(
      (entry) => entry.code === SEMANTIC_SYNERGY_DIAGNOSTIC.unsupportedRuntime,
    ),
);

const legacyPacket = packet({ identity: "legacy-augment", modifier: null, diceCount: 1, potency: 1, durationTurns: 1 });
const legacyOnly = runFixture({ id: "legacy-only", powers: [power({ identity: "Legacy Only", packets: [legacyPacket] })] });
check("Invariant legacy-only support retains legacy path", legacyOnly.model.mode === "LEGACY_ONLY" && legacyOnly.model.scoreOverride === null && legacyOnly.model.diagnostics.some((entry) => entry.code === SEMANTIC_SYNERGY_DIAGNOSTIC.legacy));

const mixed = runFixture({
  id: "mixed-model",
  powers: [
    singlePower({ identity: "Mixed Semantic", diceCount: 3, potency: 3, modifier: 3, durationTurns: 2 }),
    power({ identity: "Mixed Legacy", packets: [packet({ identity: "mixed-legacy-packet", modifier: null })] }),
  ],
});
check("Invariant mixed semantic and legacy fails closed", mixed.model.mode === "MIXED_UNSUPPORTED" && mixed.score === 0 && mixed.model.diagnostics.some((entry) => entry.code === SEMANTIC_SYNERGY_DIAGNOSTIC.mixed));

const mixedNonPower = runFixture({
  id: "mixed-non-power",
  powers: [singlePower({ identity: "Mixed Non-Power Semantic", diceCount: 3, potency: 3, modifier: 3, durationTurns: 2 })],
  traitSynergy: 1,
});
check("Invariant non-power legacy weight beside semantic fails closed", mixedNonPower.model.mode === "MIXED_UNSUPPORTED" && mixedNonPower.score === 0);
check("Invariant semantic-only excludes cost-derived Synergy", routineM3.model.mode === "LEVEL_3_SEMANTIC" && routineM3.model.scoreOverride === routineM3.score);
check(
  "Invariant semantic Synergy leaves every other radar axis unchanged",
  (Object.keys(noSupport.radarAxes) as Array<keyof typeof noSupport.radarAxes>)
    .filter((axis) => axis !== "synergy")
    .every((axis) => Math.abs(noSupport.radarAxes[axis] - routineM3.radarAxes[axis]) <= 1e-12),
);

const selfOnlyPacket = packet({ identity: "self-only-packet", applyTo: "SELF", attribute: "GUARD" });
selfOnlyPacket.detailsJson = { statTarget: "GUARD", expectedTargetCount: 1, rangeCategory: "SELF" };
const selfOnly = runFixture({ id: "self-only", powers: [power({ identity: "Self Only", packets: [selfOnlyPacket], range: "SELF" })] });
check("Invariant self-only Augment is routed outside semantic Synergy", selfOnly.model.detectedSemanticPacketCount === 0 && selfOnly.rawSupport === 0 && selfOnly.score === 0);

const healing = runFixture({
  id: "healing-excluded",
  powers: [power({ identity: "Healing Excluded", packets: [packet({ identity: "healing-packet", intention: "HEALING", modifier: null })] })],
});
const cleanse = runFixture({
  id: "cleanse-excluded",
  powers: [power({ identity: "Cleanse Excluded", packets: [packet({ identity: "cleanse-packet", intention: "CLEANSE", modifier: null })] })],
});
const semanticWithHealingAndCleanse = runFixture({
  id: "semantic-with-healing-and-cleanse",
  powers: [
    singlePower({ identity: "Semantic Beside Other Support", diceCount: 3, potency: 3, modifier: 3, durationTurns: 2 }),
    power({ identity: "Excluded Healing", packets: [packet({ identity: "excluded-healing-packet", intention: "HEALING", modifier: null })] }),
    power({ identity: "Excluded Cleanse", packets: [packet({ identity: "excluded-cleanse-packet", intention: "CLEANSE", modifier: null })] }),
  ],
});
check(
  "Invariant Healing and Cleanse do not enter semantic Synergy",
    healing.rawSupport === 0 &&
    cleanse.rawSupport === 0 &&
    semanticWithHealingAndCleanse.model.mode === "LEVEL_3_SEMANTIC" &&
    Math.abs(semanticWithHealingAndCleanse.rawSupport - routineM3.rawSupport) <= 0.000001,
);

check("Invariant optimiser is exact and memoized", fixtures.filter((fixture) => fixture.model.optimizer).every((fixture) => fixture.model.optimizer?.exact && fixture.model.optimizer.memoizedStateCount > 0));
check("Invariant cooldown schedules are exact", routineM3.model.legalActivationTurns[0]?.turns.join(",") === "1,4" && strongM5.model.legalActivationTurns[0]?.turns.join(",") === "1,5" && passiveM4.model.legalActivationTurns[0]?.turns.join(",") === "1");

const worstFixture = fixtures.reduce((worst, fixture) => fixture.runtimeMs > worst.runtimeMs ? fixture : worst, fixtures[0]);
console.log(JSON.stringify({
  passed: true,
  assertionCount,
  fixtureCount: 19,
  referenceFixtures: fixtures.slice(0, 19).map((fixture) => ({
    id: fixture.id,
    rawSupport: fixture.rawSupport,
    score: fixture.score,
    basePowerValue: fixture.basePowerValue,
    cooldowns: fixture.cooldowns,
    optimizer: fixture.model.optimizer,
  })),
  tierScales: LEVEL_3_SEMANTIC_SYNERGY_TUNING.tiers,
  performance: {
    worstFixture: worstFixture?.id ?? null,
    worstFixtureRuntimeMs: worstFixture?.runtimeMs ?? 0,
    totalFixtureRuntimeMs: fixtures.reduce((sum, fixture) => sum + fixture.runtimeMs, 0),
    maximumMemoizedStates: Math.max(...fixtures.map((fixture) => fixture.model.optimizer?.memoizedStateCount ?? 0)),
  },
}, null, 2));
console.log(`semanticSynergyLevel3.smoke.ts passed (${assertionCount} assertions, 19 locked reference fixtures).`);
