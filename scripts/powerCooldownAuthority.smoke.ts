import assert from "node:assert/strict";

import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import { computeMonsterOutcomes } from "../lib/calculators/monsterOutcomeCalculator";
import { DEFAULT_POWER_TUNING_VALUES, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import { adaptPowerToCombatActions, makeFixturePower } from "../lib/combat-lab/powerAdapter";
import { effectiveCooldownTurns } from "../lib/summoning/render";
import {
  attachPowerCooldownAuthority,
  resolvePowerCooldownAuthority,
} from "../lib/summoning/resolvePowerCooldownAuthority";
import type { MonsterUpsertInput, Power } from "../lib/summoning/types";

const activeTuning: PowerTuningSnapshot = {
  setId: "power-cooldown-authority-smoke-active",
  name: "Power Cooldown Authority Smoke Active",
  slug: "power-cooldown-authority-smoke-active",
  status: "ACTIVE",
  updatedAt: "2026-07-13T00:00:00.000Z",
  values: {
    ...DEFAULT_POWER_TUNING_VALUES,
    "cooldown.load.lightMax": 0,
    "cooldown.load.moderateMax": 999,
    "cooldown.load.heavyMax": 1000,
  },
};

function powerWithStoredCooldown(storedCooldownTurns: number | null, name: string): Power {
  const power = makeFixturePower({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    intention: "ATTACK",
    diceCount: 3,
    potency: 2,
    cooldownTurns: storedCooldownTurns ?? 1,
  });
  return storedCooldownTurns === null
    ? { ...power, cooldownTurns: undefined as unknown as number }
    : power;
}

function resolveActive(power: Power, minimumCooldownTurns?: number) {
  return resolvePowerCooldownAuthority({
    power,
    mode: "ACTIVE_CURRENT_BALANCE",
    tuningSnapshot: activeTuning,
    context: { level: 1, tier: "SOLDIER" },
    minimumCooldownTurns,
  });
}

for (const [stored, mismatch] of [[1, true], [5, true], [null, false], [2, false]] as const) {
  const resolution = resolveActive(powerWithStoredCooldown(stored, `Stored ${stored ?? "missing"}`));
  assert.equal(resolution.ok, true);
  if (!resolution.ok) continue;
  assert.equal(resolution.result.effectiveCooldownTurns, 2);
  assert.equal(resolution.result.source, "ACTIVE_TUNING");
  assert.equal(resolution.result.tuningSetId, activeTuning.setId);
  assert.equal(resolution.result.tuningUpdatedAt, activeTuning.updatedAt);
  assert.equal(resolution.result.storedCooldownTurns, stored);
  assert.equal(resolution.result.mismatch, mismatch);
}

const suddenLeap = powerWithStoredCooldown(1, "Sudden Leap");
const suddenLeapResolution = resolveActive(suddenLeap);
assert.equal(suddenLeapResolution.ok, true);
assert.equal(suddenLeapResolution.ok && suddenLeapResolution.result.effectiveCooldownTurns, 2);
const resolvedSuddenLeap = attachPowerCooldownAuthority(suddenLeap, suddenLeapResolution);
assert.equal(effectiveCooldownTurns(resolvedSuddenLeap), 2);
assert.equal(effectiveCooldownTurns(suddenLeap), null);

const unresolvedAdapter = adaptPowerToCombatActions(suddenLeap);
assert.equal(unresolvedAdapter.actions.length, 0);
assert.match(unresolvedAdapter.unsupported[0]?.reason ?? "", /unresolved cooldown authority/i);
const resolvedAdapter = adaptPowerToCombatActions(resolvedSuddenLeap);
assert.equal(resolvedAdapter.actions[0]?.cooldownRounds, 2);

const signatureResolution = resolveActive(powerWithStoredCooldown(1, "Signature Power"), 5);
assert.equal(signatureResolution.ok, true);
assert.equal(signatureResolution.ok && signatureResolution.result.effectiveCooldownTurns, 5);
assert.equal(signatureResolution.ok && signatureResolution.result.mismatch, true);

const missingActive = resolvePowerCooldownAuthority({
  power: suddenLeap,
  mode: "ACTIVE_CURRENT_BALANCE",
  tuningSnapshot: null,
});
assert.equal(missingActive.ok, false);
assert.equal(!missingActive.ok && missingActive.errorCode, "ACTIVE_TUNING_REQUIRED");
assert.equal(!missingActive.ok && missingActive.storedCooldownTurns, 1);

const explicitPreview = resolvePowerCooldownAuthority({
  power: suddenLeap,
  mode: "EXPLICIT_BUILTIN_PREVIEW",
});
assert.equal(explicitPreview.ok, true);
assert.equal(explicitPreview.ok && explicitPreview.result.source, "BUILTIN_DEFAULTS");
assert.equal(explicitPreview.ok && explicitPreview.result.tuningSetId, null);
assert.ok(explicitPreview.ok && explicitPreview.result.warnings.some((warning) => /explicit built-in preview/i.test(warning)));

function calculatorMonster(): MonsterUpsertInput {
  return {
    name: "Cooldown Authority Calculator Smoke",
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: 1,
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
    powers: [resolvedSuddenLeap],
  };
}

const calculatorOutcome = computeMonsterOutcomes(calculatorMonster(), calculatorConfig, {
  powerContribution: {
    axisVector: { mobility: 4 },
    basePowerValue: suddenLeapResolution.ok ? suddenLeapResolution.result.basePowerValue : 0,
    powerCount: 1,
    powers: [{
      id: resolvedSuddenLeap.id ?? null,
      name: resolvedSuddenLeap.name,
      axisVector: { mobility: 4 },
      authoredPower: resolvedSuddenLeap,
      cooldownAuthority: resolvedSuddenLeap.cooldownAuthority,
    }],
  },
});
const calculatorPowerDebug = (calculatorOutcome.debug as {
  powerContribution?: {
    perPowerAvailability?: Array<{
      cooldownTurns?: number | null;
      authoritySource?: string | null;
      authorityTuningSetId?: string | null;
      authorityStoredCooldownTurns?: number | null;
      authorityMismatch?: boolean | null;
      unresolvedError?: string | null;
    }>;
  };
}).powerContribution?.perPowerAvailability?.[0];
assert.equal(calculatorPowerDebug?.cooldownTurns, 2);
assert.equal(calculatorPowerDebug?.authoritySource, "ACTIVE_TUNING");
assert.equal(calculatorPowerDebug?.authorityTuningSetId, activeTuning.setId);
assert.equal(calculatorPowerDebug?.authorityStoredCooldownTurns, 1);
assert.equal(calculatorPowerDebug?.authorityMismatch, true);
assert.equal(calculatorPowerDebug?.unresolvedError, null);

console.log("powerCooldownAuthority.smoke.ts passed");
