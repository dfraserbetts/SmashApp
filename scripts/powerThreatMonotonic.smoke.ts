import { strict as assert } from "node:assert";

import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import {
  computeMonsterOutcomes,
  type CanonicalPowerContribution,
  type RadarAxes,
} from "../lib/calculators/monsterOutcomeCalculator";
import { DEFAULT_POWER_TUNING_VALUES } from "../lib/config/powerTuningShared";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import { normalizeMonsterUpsertInput } from "../lib/summoning/validation";
import type { EffectPacket, MonsterUpsertInput, Power } from "../lib/summoning/types";

type DiagnosticRow = {
  label: string;
  normalizedPowerObject: Power;
  validationResult: { ok: boolean; error: string | null };
  basePowerValue: number;
  canonicalPowerPhysicalThreat: number;
  effectivePowerPhysicalThreat: number | null;
  finalPreNormalizationPhysicalThreat: number | null;
  finalPhysicalThreatRadar: number | null;
  availability: Record<string, unknown> | null;
  costBreakdown: Record<string, unknown> | null;
  damageTypeFieldPath: string;
  damageTypeFieldValue: unknown;
  potencyFieldPath: string;
  potencyFieldValue: unknown;
  diceFieldPath: string;
  diceFieldValue: unknown;
};

function round(value: number | null | undefined, places = 4): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const scalar = 10 ** places;
  return Math.round(value * scalar) / scalar;
}

function axisValue(value: Partial<RadarAxes> | null | undefined, key: keyof RadarAxes): number {
  const raw = value?.[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function createAttackPacket(params: {
  diceCount: number;
  potency: number;
  damageTypes: string[];
}): EffectPacket {
  return {
    sortOrder: 0,
    packetIndex: 0,
    hostility: "HOSTILE",
    intention: "ATTACK",
    type: "ATTACK",
    specific: null,
    diceCount: params.diceCount,
    potency: params.potency,
    effectTimingType: "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: "INSTANT",
    effectDurationTurns: null,
    dealsWounds: true,
    woundChannel: "PHYSICAL",
    targetedAttribute: null,
    applicationModeKey: null,
    resolutionOrigin: "CASTER",
    applyTo: "PRIMARY_TARGET",
    triggerConditionText: null,
    detailsJson: {
      attackMode: "PHYSICAL",
      damageTypes: params.damageTypes,
      rangeCategory: "MELEE",
      rangeValue: 1,
      rangeExtra: {},
    },
    localTargetingOverride: null,
  };
}

function createImmediateAttackPower(params: {
  name: string;
  diceCount: number;
  potency: number;
  damageTypes: string[];
}): Power {
  const packet = createAttackPacket(params);
  return {
    sortOrder: 0,
    name: params.name,
    description: null,
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
    cooldownTurns: 1,
    cooldownReduction: 0,
    counterMode: "NO",
    commitmentModifier: "STANDARD",
    triggerMethod: null,
    attachedHostAnchorType: null,
    lifespanType: "NONE",
    lifespanTurns: null,
    previewSummaryOverride: null,
    rangeCategories: ["MELEE"],
    meleeTargets: 1,
    rangedTargets: null,
    rangedDistanceFeet: null,
    aoeCenterRangeFeet: null,
    aoeCount: null,
    aoeShape: null,
    aoeSphereRadiusFeet: null,
    aoeConeLengthFeet: null,
    aoeLineWidthFeet: null,
    aoeLineLengthFeet: null,
    primaryDefenceGate: {
      sourcePacketIndex: 0,
      gateResult: "DODGE_OR_PROTECTION",
      protectionChannel: "PHYSICAL",
      resistAttribute: null,
      hostileEntryPattern: null,
      resolutionSource: "INFERRED",
    },
    defenceRequirement: "DODGE_OR_PROTECTION",
    diceCount: params.diceCount,
    potency: params.potency,
    effectDurationType: "INSTANT",
    effectDurationTurns: null,
    durationType: "INSTANT",
    durationTurns: null,
    effectPackets: [packet],
    intentions: [packet],
  };
}

function createMonster(power: Power): MonsterUpsertInput {
  return {
    name: "Power Threat Monotonicity Probe",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: 1,
    tier: "MINION",
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
    attackDie: "D6",
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: "D6",
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D6",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D6",
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: "D6",
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: "D6",
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
    powers: [power],
  };
}

function buildPowerContribution(power: Power): CanonicalPowerContribution {
  const resolved = resolvePowerCosts(
    [power],
    { setId: "source-default", name: "Source defaults", values: DEFAULT_POWER_TUNING_VALUES },
    { level: 1, tier: "MINION" },
  );

  return {
    axisVector: resolved.totals.axisVector,
    basePowerValue: resolved.totals.basePowerValue,
    powerCount: resolved.powers.length,
    powers: resolved.powers.map((resolvedPower) => ({
      id: resolvedPower.powerId ?? null,
      name: resolvedPower.name,
      axisVector: resolvedPower.breakdown.axisVector,
      basePowerValue: resolvedPower.breakdown.basePowerValue,
      derivedCooldownTurns: resolvedPower.derivedCooldownTurns,
      derivedCooldownLoad: resolvedPower.derivedCooldown.cooldownLoad,
      cooldownTurns: resolvedPower.cooldownTurns,
      cooldownReduction: resolvedPower.cooldownReduction,
    })),
    debug: resolved,
  };
}

function getDebugRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function evaluatePower(label: string, power: Power): DiagnosticRow {
  const monster = createMonster(power);
  const validation = normalizeMonsterUpsertInput(monster);
  const normalizedPower = validation.ok ? validation.data.powers[0] ?? power : power;
  const contribution = buildPowerContribution(normalizedPower);
  const outcome = validation.ok
    ? computeMonsterOutcomes(validation.data, calculatorConfig, { powerContribution: contribution })
    : null;
  const debug = getDebugRecord(outcome?.debug);
  const powerDebug = getDebugRecord(debug.powerContribution);
  const finalPreNormalizationAxes = getDebugRecord(debug.finalPreNormalizationAxes);
  const availabilityRows = Array.isArray(powerDebug.perPowerAvailability)
    ? powerDebug.perPowerAvailability
    : [];
  const packet = normalizedPower.effectPackets[0];
  const details = getDebugRecord(packet?.detailsJson);
  const resolvedDebug = getDebugRecord(contribution.debug);
  const resolvedPowers = Array.isArray(resolvedDebug.powers) ? resolvedDebug.powers : [];
  const firstResolvedPower = getDebugRecord(resolvedPowers[0]);

  return {
    label,
    normalizedPowerObject: normalizedPower,
    validationResult: {
      ok: validation.ok,
      error: validation.ok ? null : validation.error,
    },
    basePowerValue: contribution.basePowerValue ?? 0,
    canonicalPowerPhysicalThreat: axisValue(contribution.axisVector, "physicalThreat"),
    effectivePowerPhysicalThreat: round(
      axisValue(powerDebug.effectivePowerAxisVector as Partial<RadarAxes> | null, "physicalThreat"),
    ),
    finalPreNormalizationPhysicalThreat: round(
      typeof finalPreNormalizationAxes.physicalThreat === "number"
        ? finalPreNormalizationAxes.physicalThreat
        : null,
    ),
    finalPhysicalThreatRadar: round(outcome?.radarAxes.physicalThreat),
    availability: getDebugRecord(availabilityRows[0]),
    costBreakdown: getDebugRecord(firstResolvedPower.breakdown),
    damageTypeFieldPath: "effectPackets[0].detailsJson.damageTypes",
    damageTypeFieldValue: details.damageTypes,
    potencyFieldPath: "effectPackets[0].potency",
    potencyFieldValue: packet?.potency,
    diceFieldPath: "effectPackets[0].diceCount",
    diceFieldValue: packet?.diceCount,
  };
}

function isNonDecreasing(values: Array<number | null>): boolean {
  let previous: number | null = null;
  for (const value of values) {
    if (value === null) return false;
    if (previous !== null && value < previous) return false;
    previous = value;
  }
  return true;
}

const potencyRows = [1, 2, 3, 4, 5].map((potency) =>
  evaluatePower(
    `dice 5 potency ${potency} one physical damage`,
    createImmediateAttackPower({
      name: `Potency ${potency}`,
      diceCount: 5,
      potency,
      damageTypes: ["Slash"],
    }),
  ),
);
const missingDamageRow = evaluatePower(
  "dice 5 potency 5 no damage type",
  createImmediateAttackPower({
    name: "Missing Damage Type",
    diceCount: 5,
    potency: 5,
    damageTypes: [],
  }),
);
const oneDamageRow = evaluatePower(
  "dice 5 potency 5 one damage type",
  createImmediateAttackPower({
    name: "One Damage Type",
    diceCount: 5,
    potency: 5,
    damageTypes: ["Slash"],
  }),
);
const twoDamageRow = evaluatePower(
  "dice 5 potency 5 two damage types",
  createImmediateAttackPower({
    name: "Two Damage Types",
    diceCount: 5,
    potency: 5,
    damageTypes: ["Slash", "Pierce"],
  }),
);
const diceSixRow = evaluatePower(
  "dice 6 potency 5 one damage type",
  createImmediateAttackPower({
    name: "Dice Six",
    diceCount: 6,
    potency: 5,
    damageTypes: ["Slash"],
  }),
);
const potencyTwentyRow = evaluatePower(
  "dice 5 potency 20 one damage type",
  createImmediateAttackPower({
    name: "Potency Twenty",
    diceCount: 5,
    potency: 20,
    damageTypes: ["Slash"],
  }),
);
const diceTenRow = evaluatePower(
  "dice 10 potency 5 one damage type",
  createImmediateAttackPower({
    name: "Dice Ten",
    diceCount: 10,
    potency: 5,
    damageTypes: ["Slash"],
  }),
);
const diceTwentyRow = evaluatePower(
  "dice 20 potency 5 one damage type",
  createImmediateAttackPower({
    name: "Dice Twenty",
    diceCount: 20,
    potency: 5,
    damageTypes: ["Slash"],
  }),
);

const reportRows = [
  ...potencyRows,
  missingDamageRow,
  oneDamageRow,
  twoDamageRow,
  diceSixRow,
  potencyTwentyRow,
  diceTenRow,
  diceTwentyRow,
];

console.log("\n[Power Threat Monotonic Diagnostic]");
for (const row of reportRows) {
  console.log(JSON.stringify(row, null, 2));
}

assert.equal(
  missingDamageRow.validationResult.ok,
  false,
  "Missing damage type attack should be invalid.",
);
assert.equal(
  oneDamageRow.validationResult.ok,
  true,
  "One damage type attack should be valid.",
);
assert.ok(
  isNonDecreasing(potencyRows.map((row) => row.basePowerValue)),
  "BasePowerValue should be monotonic for potency 1 through 5.",
);
assert.ok(
  isNonDecreasing(potencyRows.map((row) => row.canonicalPowerPhysicalThreat)),
  "Canonical power physical threat should be monotonic for potency 1 through 5.",
);
assert.ok(
  isNonDecreasing(potencyRows.map((row) => row.effectivePowerPhysicalThreat)),
  "Effective power physical threat should be monotonic for potency 1 through 5.",
);
assert.ok(
  isNonDecreasing(potencyRows.map((row) => row.finalPreNormalizationPhysicalThreat)),
  "Final pre-normalization physical threat should be monotonic for potency 1 through 5.",
);
assert.ok(
  isNonDecreasing(potencyRows.map((row) => row.finalPhysicalThreatRadar)),
  "Final Physical Threat radar should be monotonic for potency 1 through 5.",
);
assert.ok(
  diceSixRow.basePowerValue >= oneDamageRow.basePowerValue,
  "Dice 6 should not reduce BasePowerValue versus dice 5.",
);
assert.ok(
  Number(diceSixRow.finalPhysicalThreatRadar) >= Number(oneDamageRow.finalPhysicalThreatRadar),
  "Dice 6 should not reduce final Physical Threat radar versus dice 5.",
);
assert.ok(
  twoDamageRow.basePowerValue >= oneDamageRow.basePowerValue,
  "Adding a second valid damage type should not reduce BasePowerValue.",
);
assert.ok(
  Number(twoDamageRow.finalPhysicalThreatRadar) >= Number(oneDamageRow.finalPhysicalThreatRadar),
  "Adding a second valid damage type should not reduce final Physical Threat radar.",
);
assert.equal(
  potencyTwentyRow.potencyFieldValue,
  20,
  "Summoning normalization should preserve legal potency 20.",
);
assert.ok(
  potencyTwentyRow.basePowerValue > oneDamageRow.basePowerValue,
  "Potency 20 should price above potency 5.",
);
assert.ok(
  potencyTwentyRow.canonicalPowerPhysicalThreat > oneDamageRow.canonicalPowerPhysicalThreat,
  "Potency 20 canonical physical threat should exceed potency 5.",
);
assert.ok(
  Number(potencyTwentyRow.finalPhysicalThreatRadar) >= Number(oneDamageRow.finalPhysicalThreatRadar),
  "Potency 20 final Physical Threat radar should not drop below potency 5.",
);
assert.equal(
  diceTwentyRow.diceFieldValue,
  20,
  "Summoning normalization should preserve legal dice count 20.",
);
assert.ok(diceTwentyRow.basePowerValue > diceTenRow.basePowerValue, "Dice 20 should price above dice 10.");
assert.ok(
  diceTwentyRow.canonicalPowerPhysicalThreat > diceTenRow.canonicalPowerPhysicalThreat,
  "Dice 20 canonical physical threat should exceed dice 10.",
);
assert.ok(
  Number(diceTwentyRow.finalPhysicalThreatRadar) >= Number(diceTenRow.finalPhysicalThreatRadar),
  "Dice 20 final Physical Threat radar should not drop below dice 10.",
);

console.log("Power Threat monotonic smoke passed.");
