import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import {
  computeMonsterOutcomes,
  type CanonicalPowerContribution,
  type RadarAxes,
} from "../lib/calculators/monsterOutcomeCalculator";
import {
  computeLevel3SelfAttackThreat,
  SELF_ATTACK_THREAT_DIAGNOSTIC,
  type SelfAttackThreatMainAction,
  type SelfAttackThreatPassiveState,
  type SelfAttackThreatPowerEntry,
  type SelfAttackThreatResult,
} from "../lib/calculators/selfAttackThreat";
import { makeResolvedPowerCooldownAuthority } from "../lib/summoning/resolvePowerCooldownAuthority";
import type {
  EffectPacket,
  MonsterTier,
  MonsterUpsertInput,
  Power,
} from "../lib/summoning/types";

type Die = "D4" | "D6" | "D8" | "D10" | "D12";

type FixtureResult = {
  id: string;
  model: SelfAttackThreatResult;
  runtimeMs: number;
};

const DIE_SIDES: Record<Die, number> = { D4: 4, D6: 6, D8: 8, D10: 10, D12: 12 };
const fixtures: FixtureResult[] = [];
let assertions = 0;

function check(label: string, condition: boolean): void {
  assertions += 1;
  assert.ok(condition, label);
  console.log(`PASS ${String(assertions).padStart(2, "0")}: ${label}`);
}

function near(label: string, actual: number, expected: number, tolerance = 0.000001): void {
  check(`${label} (actual ${actual})`, Math.abs(actual - expected) <= tolerance);
}

function id(kind: "power" | "packet", value: string): string {
  return `self-attack-threat-${kind}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function packet(params: {
  identity: string;
  packetIndex?: number;
  intention?: EffectPacket["intention"];
  dice?: number;
  potency?: number;
  modifier?: number | null;
  duration?: "TURNS" | "PASSIVE" | "UNTIL_TARGET_NEXT_TURN" | "INSTANT";
  durationTurns?: number | null;
  timing?: EffectPacket["effectTimingType"];
  applyTo?: EffectPacket["applyTo"];
  attribute?: EffectPacket["targetedAttribute"];
  dependency?: EffectPacket["secondaryDependencyMode"];
  woundChannel?: EffectPacket["woundChannel"];
  idOverride?: string | null;
}): EffectPacket {
  const packetIndex = params.packetIndex ?? 0;
  const intention = params.intention ?? "AUGMENT";
  const duration = params.duration ?? "TURNS";
  return {
    id: params.idOverride === undefined ? id("packet", params.identity) : (params.idOverride ?? undefined),
    sortOrder: packetIndex,
    packetIndex,
    hostility: intention === "ATTACK" ? "HOSTILE" : "NON_HOSTILE",
    intention,
    type: intention,
    specific: intention === "ATTACK" ? "PHYSICAL" : null,
    diceCount: params.dice ?? 3,
    potency: params.potency ?? 3,
    modifier: params.modifier === undefined ? 3 : params.modifier,
    effectTimingType: params.timing ?? "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: duration,
    effectDurationTurns: duration === "TURNS" ? (params.durationTurns ?? 2) : null,
    dealsWounds: intention === "ATTACK",
    woundChannel: params.woundChannel ?? (intention === "ATTACK" ? "PHYSICAL" : null),
    targetedAttribute: params.attribute ?? (intention === "AUGMENT" ? "ATTACK" : null),
    applicationModeKey: null,
    resolutionOrigin: "CASTER",
    applyTo: params.applyTo ?? (intention === "AUGMENT" ? "SELF" : "PRIMARY_TARGET"),
    secondaryDependencyMode: params.dependency ?? (packetIndex === 0 ? "INDEPENDENT" : "LINKED_TO_PRIMARY"),
    triggerConditionText: null,
    detailsJson: {
      statTarget: params.attribute ?? "ATTACK",
      rangeCategory: intention === "AUGMENT" ? "SELF" : "RANGED",
      attackMode: intention === "ATTACK" ? "PHYSICAL" : undefined,
      damageTypes: intention === "ATTACK" ? ["Slash"] : undefined,
    },
    localTargetingOverride: null,
  };
}

function power(params: {
  identity: string;
  packets: EffectPacket[];
  cooldown: number;
  idOverride?: string | null;
  counter?: boolean;
  chassis?: Power["descriptorChassis"];
  range?: "SELF" | "RANGED";
}): Power {
  const primary = params.packets[0]!;
  const powerId = params.idOverride === undefined ? id("power", params.identity) : (params.idOverride ?? undefined);
  const authority = makeResolvedPowerCooldownAuthority({
    effectiveCooldownTurns: params.cooldown,
    source: "ACTIVE_TUNING",
    tuningSetId: "self-attack-threat-smoke",
    tuningUpdatedAt: new Date(0).toISOString(),
    storedCooldownTurns: params.cooldown,
  });
  return {
    id: powerId,
    sortOrder: 0,
    name: params.identity,
    description: null,
    schemaVersion: 2,
    rulesVersion: "v1",
    contentRevision: 1,
    previewRendererVersion: 1,
    status: "ACTIVE",
    descriptorChassis: params.chassis ?? "IMMEDIATE",
    descriptorChassisConfig: {},
    chargeType: null,
    chargeTurns: null,
    chargeBonusDicePerTurn: null,
    cooldownTurns: params.cooldown,
    cooldownReduction: 0,
    cooldownAuthority: authority,
    counterMode: params.counter ? "YES" : "NO",
    commitmentModifier: "STANDARD",
    triggerMethod: null,
    attachedHostAnchorType: null,
    lifespanType: "NONE",
    lifespanTurns: null,
    previewSummaryOverride: null,
    rangeCategories: params.range === "RANGED" ? ["RANGED"] : [],
    meleeTargets: null,
    rangedTargets: params.range === "RANGED" ? 1 : null,
    rangedDistanceFeet: params.range === "RANGED" ? 30 : null,
    aoeCenterRangeFeet: null,
    aoeCount: null,
    aoeShape: null,
    aoeSphereRadiusFeet: null,
    aoeConeLengthFeet: null,
    aoeLineWidthFeet: null,
    aoeLineLengthFeet: null,
    primaryDefenceGate: null,
    effectPackets: params.packets,
    intentions: params.packets,
    diceCount: Number(primary.diceCount ?? 1),
    potency: Number(primary.potency ?? 1),
    effectDurationType: primary.effectDurationType,
    effectDurationTurns: primary.effectDurationTurns,
    durationType: primary.effectDurationType,
    durationTurns: primary.effectDurationTurns,
  };
}

function buff(params: {
  identity: string;
  modifier: number;
  dice?: number;
  potency?: number;
  duration?: "TURNS" | "PASSIVE" | "UNTIL_TARGET_NEXT_TURN";
  durationTurns?: number;
  cooldown: number;
  timing?: EffectPacket["effectTimingType"];
  linkedModifier?: number;
  linkedPotency?: number;
  idOverride?: string | null;
  packetIdOverride?: string | null;
}): Power {
  const packets = [
    packet({
      identity: `${params.identity}-primary`,
      dice: params.dice ?? 3,
      potency: params.potency ?? 3,
      modifier: params.modifier,
      duration: params.duration ?? "TURNS",
      durationTurns: params.durationTurns ?? 2,
      timing: params.timing,
      idOverride: params.packetIdOverride,
    }),
  ];
  if (params.linkedModifier !== undefined) {
    packets.push(packet({
      identity: `${params.identity}-linked`,
      packetIndex: 1,
      dice: 0,
      potency: params.linkedPotency ?? 3,
      modifier: params.linkedModifier,
      duration: params.duration ?? "TURNS",
      durationTurns: params.durationTurns ?? 2,
      timing: params.timing,
      dependency: "LINKED_TO_PRIMARY",
    }));
  }
  return power({
    identity: params.identity,
    packets,
    cooldown: params.cooldown,
    idOverride: params.idOverride,
  });
}

function attackPower(identity: string, cooldown = 1): Power {
  return power({
    identity,
    cooldown,
    range: "RANGED",
    packets: [packet({
      identity: `${identity}-attack`,
      intention: "ATTACK",
      dice: 4,
      potency: 1,
      modifier: null,
      duration: "INSTANT",
      applyTo: "PRIMARY_TARGET",
      attribute: null,
      woundChannel: "PHYSICAL",
    })],
  });
}

function entry(authoredPower: Power, includeAuthority = true): SelfAttackThreatPowerEntry {
  return {
    id: authoredPower.id ?? null,
    name: authoredPower.name,
    authoredPower,
    cooldownAuthority: includeAuthority ? (authoredPower.cooldownAuthority ?? null) : null,
  };
}

function mainAction(die: Die): SelfAttackThreatMainAction {
  return {
    id: `main-${die}`,
    label: `${die} baseline`,
    segments: [{
      lane: "PHYSICAL",
      diceCount: 4,
      dieSides: DIE_SIDES[die],
      woundsPerSuccess: 2,
      targetMultiplier: 1,
      damageTypeCount: 1,
      reliabilityMultiplier: 0.7,
    }],
  };
}

function runFixture(params: {
  id: string;
  powers?: Power[];
  die?: Die;
  tier?: MonsterTier;
  level?: number;
  passiveState?: SelfAttackThreatPassiveState;
  passiveActivationSourceSuccessesByPowerId?: Readonly<Record<string, number>>;
  mainActions?: SelfAttackThreatMainAction[];
}): SelfAttackThreatResult {
  const started = performance.now();
  const die = params.die ?? "D8";
  const model = computeLevel3SelfAttackThreat({
    level: params.level ?? 3,
    tier: params.tier ?? "SOLDIER",
    dieSides: DIE_SIDES[die],
    mainActions: params.mainActions ?? [mainAction(die)],
    powers: (params.powers ?? []).map((candidate) => entry(candidate)),
    netSuccessMultiplier: 0.7,
    aoeMultiplier: 1.3,
    atWillThreatAxisMultiplier: 6,
    passiveState: params.passiveState,
    passiveActivationSourceSuccessesByPowerId:
      params.passiveActivationSourceSuccessesByPowerId,
  });
  fixtures.push({ id: params.id, model, runtimeMs: performance.now() - started });
  return model;
}

const control = runFixture({ id: "01-control" });
near("1. No-Augment control", control.fiveTurnDelta, 0);
check("Control has no semantic override", control.mode === "NONE");

const m1 = runFixture({
  id: "02-m1-one-turn",
  powers: [buff({ identity: "M1 one turn", modifier: 1, dice: 2, potency: 1, duration: "UNTIL_TARGET_NEXT_TURN", cooldown: 1 })],
});
near("2. M1 one-turn delta", m1.fiveTurnDelta, 0);

const routineM3 = runFixture({
  id: "03-routine-m3",
  powers: [buff({ identity: "Routine M3", modifier: 3, cooldown: 2 })],
});
near("3. Routine M3 delta", routineM3.fiveTurnDelta, 5.3046875);
check("Routine M3 has positive Threat increment", routineM3.rawThreatIncrement > 0);
near("Activation turns preserve all five baseline Main attacks", routineM3.fiveTurnHarmWithout, 17.5);

const strongM5 = runFixture({
  id: "04-strong-m5",
  powers: [buff({ identity: "Strong M5", modifier: 5, cooldown: 2 })],
});
near("4. Strong M5 delta", strongM5.fiveTurnDelta, 7.95703125);
check("Matching M5 exceeds M3", strongM5.fiveTurnDelta > routineM3.fiveTurnDelta);

const longM3 = runFixture({
  id: "05-long-m3",
  powers: [buff({ identity: "Long M3", modifier: 3, durationTurns: 4, cooldown: 3 })],
});
near("5. Four-turn M3 delta", longM3.fiveTurnDelta, 7.21875);
check("Long duration exceeds matching routine duration", longM3.fiveTurnDelta > routineM3.fiveTurnDelta);

const preparedM4 = runFixture({
  id: "06-prepared-passive-m4",
  powers: [buff({ identity: "Prepared Passive M4", modifier: 4, duration: "PASSIVE", cooldown: 4 })],
});
near("6. Prepared Passive M4 uses qualified prepared reference", preparedM4.fiveTurnDelta, 14.7314453125);
check("Prepared Passive consumes no measured Power activation", preparedM4.performance.choiceCount > 0);

const inactiveM4 = runFixture({
  id: "07-inactive-passive-m4",
  powers: [buff({ identity: "Inactive Passive M4", modifier: 4, duration: "PASSIVE", cooldown: 4 })],
  passiveState: "INACTIVE",
});
near("7. Inactive Passive M4 delta", inactiveM4.fiveTurnDelta, 11.910787021, 0.000001);
check("Prepared and Inactive Passive values differ", preparedM4.fiveTurnDelta > inactiveM4.fiveTurnDelta);
near("Inactive Passive failure branches leave baseline Main harm intact", inactiveM4.fiveTurnHarmWithout, 17.5);

const activeSnapshotPower = buff({
  identity: "Active Snapshot Passive M4",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
const activeSnapshotPowerId = activeSnapshotPower.id!;
const activeSnapshotM4 = runFixture({
  id: "active-snapshot-passive-m4",
  powers: [activeSnapshotPower],
  passiveState: "ACTIVE_SNAPSHOT",
  passiveActivationSourceSuccessesByPowerId: { [activeSnapshotPowerId]: 2 },
});
near("Active snapshot M4/P3 uses two stored successes as six initial stacks", activeSnapshotM4.fiveTurnDelta, 17.5);
near("Active snapshot consumes no Main lane", activeSnapshotM4.fiveTurnHarmWithout, 17.5);
near("Active snapshot applies deterministic stored-success harm without rerolling", activeSnapshotM4.fiveTurnHarmWith, 35);

const activeSnapshotWithThreatPower = runFixture({
  id: "active-snapshot-with-threat-power",
  powers: [activeSnapshotPower, attackPower("Active Snapshot Competing Attack")],
  passiveState: "ACTIVE_SNAPSHOT",
  passiveActivationSourceSuccessesByPowerId: { [activeSnapshotPowerId]: 2 },
});
near("Active snapshot consumes no Power lane", activeSnapshotWithThreatPower.fiveTurnHarmWith, 56);

const activeSnapshotOneSuccess = runFixture({
  id: "active-snapshot-one-success",
  powers: [activeSnapshotPower],
  passiveState: "ACTIVE_SNAPSHOT",
  passiveActivationSourceSuccessesByPowerId: { [activeSnapshotPowerId]: 1 },
});
check(
  "Different stored success counts produce different deterministic results",
  activeSnapshotOneSuccess.fiveTurnDelta < activeSnapshotM4.fiveTurnDelta,
);

const missingActiveSnapshot = runFixture({
  id: "active-snapshot-missing",
  powers: [activeSnapshotPower],
  passiveState: "ACTIVE_SNAPSHOT",
});
check(
  "Missing active snapshot successes fail closed",
  missingActiveSnapshot.mode === "FAIL_CLOSED" &&
    missingActiveSnapshot.diagnostics.some(
      (diagnostic) => diagnostic.code === SELF_ATTACK_THREAT_DIAGNOSTIC.activeSnapshotMissingSuccesses,
    ),
);

const invalidActiveSnapshot = runFixture({
  id: "active-snapshot-invalid",
  powers: [activeSnapshotPower],
  passiveState: "ACTIVE_SNAPSHOT",
  passiveActivationSourceSuccessesByPowerId: { [activeSnapshotPowerId]: 1.5 },
});
check(
  "Invalid active snapshot successes fail closed",
  invalidActiveSnapshot.mode === "FAIL_CLOSED" &&
    invalidActiveSnapshot.diagnostics.some(
      (diagnostic) => diagnostic.code === SELF_ATTACK_THREAT_DIAGNOSTIC.activeSnapshotInvalidSuccesses,
    ),
);

const wrongIdentityActiveSnapshot = runFixture({
  id: "active-snapshot-wrong-identity",
  powers: [activeSnapshotPower],
  passiveState: "ACTIVE_SNAPSHOT",
  passiveActivationSourceSuccessesByPowerId: { "another-power": 2 },
});
check(
  "Active snapshot data is keyed by stable Power identity",
  wrongIdentityActiveSnapshot.mode === "FAIL_CLOSED" &&
    wrongIdentityActiveSnapshot.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === SELF_ATTACK_THREAT_DIAGNOSTIC.activeSnapshotMissingSuccesses &&
        diagnostic.powerId === activeSnapshotPowerId,
    ),
);

const secondActiveSnapshotPower = buff({
  identity: "Second Active Snapshot Passive M2",
  modifier: 2,
  potency: 1,
  duration: "PASSIVE",
  cooldown: 4,
});
const twoActiveSnapshots = runFixture({
  id: "active-snapshot-two-passives",
  powers: [activeSnapshotPower, secondActiveSnapshotPower],
  passiveState: "ACTIVE_SNAPSHOT",
  passiveActivationSourceSuccessesByPowerId: {
    [activeSnapshotPowerId]: 2,
    [secondActiveSnapshotPower.id!]: 1,
  },
});
check("Two Passive Powers retain independent active snapshots", twoActiveSnapshots.mode === "SEMANTIC");
const missingSecondActiveSnapshot = runFixture({
  id: "active-snapshot-missing-second-passive",
  powers: [activeSnapshotPower, secondActiveSnapshotPower],
  passiveState: "ACTIVE_SNAPSHOT",
  passiveActivationSourceSuccessesByPowerId: { [activeSnapshotPowerId]: 2 },
});
check(
  "One Passive snapshot cannot satisfy another Power",
  missingSecondActiveSnapshot.mode === "FAIL_CLOSED" &&
    missingSecondActiveSnapshot.diagnostics.some(
      (diagnostic) => diagnostic.powerId === secondActiveSnapshotPower.id,
    ),
);

const activeLinkedPower = buff({
  identity: "Active Snapshot Linked M3 M2",
  modifier: 3,
  linkedModifier: 2,
  linkedPotency: 2,
  duration: "PASSIVE",
  cooldown: 4,
});
const activeLinked = runFixture({
  id: "active-snapshot-linked",
  powers: [activeLinkedPower],
  passiveState: "ACTIVE_SNAPSHOT",
  passiveActivationSourceSuccessesByPowerId: { [activeLinkedPower.id!]: 2 },
});
const activeClampedPower = buff({
  identity: "Active Snapshot Linked M3 M3",
  modifier: 3,
  linkedModifier: 3,
  linkedPotency: 2,
  duration: "PASSIVE",
  cooldown: 4,
});
const activeClamped = runFixture({
  id: "active-snapshot-clamped",
  powers: [activeClampedPower],
  passiveState: "ACTIVE_SNAPSHOT",
  passiveActivationSourceSuccessesByPowerId: { [activeClampedPower.id!]: 2 },
});
near("Active snapshot linked packets inherit stored primary successes", activeLinked.fiveTurnDelta, 19.6);
near("Active snapshot linked same-attribute modifiers remain clamped at +5", activeClamped.fiveTurnDelta, activeLinked.fiveTurnDelta);

const linked = runFixture({
  id: "08-linked-m3-m2",
  powers: [buff({ identity: "Linked M3 M2", modifier: 3, linkedModifier: 2, linkedPotency: 2, cooldown: 3 })],
});
near("8. Linked M3 plus M2 delta", linked.fiveTurnDelta, 3.978515625);

const clamped = runFixture({
  id: "09-same-attribute-clamp",
  powers: [buff({ identity: "Linked M3 M3", modifier: 3, linkedModifier: 3, linkedPotency: 3, cooldown: 3 })],
});
near("9. Same-attribute linked clamp delta", clamped.fiveTurnDelta, linked.fiveTurnDelta);

const competing = runFixture({
  id: "10-competing-m3-m5",
  powers: [
    buff({ identity: "Competing M3", modifier: 3, cooldown: 2 }),
    buff({ identity: "Competing M5", modifier: 5, cooldown: 2 }),
  ],
});
near("10. Competing M3 and M5 delta", competing.fiveTurnDelta, 10.811408997, 0.000001);
near("Multiple buffs compete only for Power while Main remains intact", competing.fiveTurnHarmWithout, 17.5);

const d6Strong = runFixture({
  id: "11-d6-strong",
  die: "D6",
  powers: [buff({ identity: "D6 Strong M5", modifier: 5, cooldown: 2 })],
});
near("11. D6 plus M5 delta", d6Strong.fiveTurnDelta, 6.533333333, 0.000001);

const d10Strong = runFixture({
  id: "12-d10-strong",
  die: "D10",
  powers: [buff({ identity: "D10 Strong M5", modifier: 5, cooldown: 2 })],
});
near("12. D10 plus M5 delta", d10Strong.fiveTurnDelta, 7.62832);

const minionM3 = runFixture({
  id: "13-d6-minion-m3",
  die: "D6",
  tier: "MINION",
  powers: [buff({ identity: "Minion M3", modifier: 3, cooldown: 2 })],
});
near("13. D6 Minion M3 delta", minionM3.fiveTurnDelta, 3.266666667, 0.000001);

const soldierM3 = runFixture({
  id: "14-d8-soldier-m3",
  powers: [buff({ identity: "Soldier M3", modifier: 3, cooldown: 2 })],
});
near("14. D8 Soldier M3 delta", soldierM3.fiveTurnDelta, 5.3046875);

const eliteM3 = runFixture({
  id: "15-d10-elite-m3",
  die: "D10",
  tier: "ELITE",
  powers: [buff({ identity: "Elite M3", modifier: 3, cooldown: 2 })],
});
near("15. D10 Elite M3 delta", eliteM3.fiveTurnDelta, 5.4488);

const boss = runFixture({
  id: "16-boss-fail-closed",
  tier: "BOSS",
  powers: [buff({ identity: "Boss M3", modifier: 3, cooldown: 2 })],
});
check(
  "16. Boss fails closed with stable diagnostic",
  boss.mode === "FAIL_CLOSED" &&
    boss.fiveTurnDelta === 0 &&
    boss.diagnostics.some((diagnostic) => diagnostic.code === SELF_ATTACK_THREAT_DIAGNOSTIC.bossActionEconomyUnresolved),
);

const irrational = runFixture({
  id: "17-weak-irrational",
  die: "D10",
  tier: "ELITE",
  powers: [buff({ identity: "Weak irrational", modifier: 1, dice: 1, potency: 1, duration: "UNTIL_TARGET_NEXT_TURN", cooldown: 1 })],
});
near("17. Weak irrational buff remains zero", irrational.fiveTurnDelta, 0);

const worthwhile = runFixture({
  id: "18-clearly-worthwhile",
  die: "D6",
  powers: [buff({ identity: "Clearly worthwhile", modifier: 5, dice: 4, potency: 4, durationTurns: 4, cooldown: 4 })],
});
near("18. Clearly worthwhile buff delta", worthwhile.fiveTurnDelta, 10.5);

const competingThreat = runFixture({
  id: "19-competing-threat-power",
  powers: [
    buff({ identity: "Threat competition M3", modifier: 3, cooldown: 2 }),
    attackPower("Threat competition Strike", 1),
  ],
});
near("19. Competing threatening Power is preserved", competingThreat.fiveTurnDelta, 7.109375);
near("Competing Power exists in control branch", competingThreat.fiveTurnHarmWithout, 28);

const recurring = runFixture({
  id: "20-recurring-fail-closed",
  powers: [buff({ identity: "Recurring M3", modifier: 3, timing: "START_OF_TURN", cooldown: 3 })],
});
check(
  "20. Recurring self buff fails closed",
  recurring.mode === "FAIL_CLOSED" &&
    recurring.diagnostics.some((diagnostic) => diagnostic.code === SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedRecurrence),
);

const legacy = buff({ identity: "Legacy SELF Attack", modifier: 3, cooldown: 2 });
legacy.effectPackets[0]!.modifier = null;
legacy.intentions = legacy.effectPackets;
const mixed = runFixture({
  id: "mixed-semantic-legacy",
  powers: [buff({ identity: "Semantic SELF Attack", modifier: 3, cooldown: 2 }), legacy],
});
check(
  "Mixed legacy and semantic SELF Attack fails closed",
  mixed.mode === "FAIL_CLOSED" &&
    mixed.diagnostics.some((diagnostic) => diagnostic.code === SELF_ATTACK_THREAT_DIAGNOSTIC.mixedSemanticLegacy),
);

const missingIdentityPower = buff({
  identity: "Missing identity",
  modifier: 3,
  cooldown: 2,
  idOverride: null,
  packetIdOverride: null,
});
const missingIdentity = runFixture({ id: "missing-identity", powers: [missingIdentityPower] });
check(
  "Missing stable identity fails closed",
  missingIdentity.diagnostics.some((diagnostic) => diagnostic.code === SELF_ATTACK_THREAT_DIAGNOSTIC.missingIdentity),
);

const missingCooldownPower = buff({ identity: "Missing cooldown", modifier: 3, cooldown: 2 });
const missingCooldown = computeLevel3SelfAttackThreat({
  level: 3,
  tier: "SOLDIER",
  dieSides: 8,
  mainActions: [mainAction("D8")],
  powers: [entry(missingCooldownPower, false)],
  netSuccessMultiplier: 0.7,
  aoeMultiplier: 1.3,
  atWillThreatAxisMultiplier: 6,
});
check(
  "Missing cooldown authority fails closed",
  missingCooldown.diagnostics.some((diagnostic) => diagnostic.code === SELF_ATTACK_THREAT_DIAGNOSTIC.missingCooldownAuthority),
);

const unsupportedLevel = runFixture({
  id: "unsupported-level",
  level: 2,
  powers: [buff({ identity: "Level 2 M3", modifier: 3, cooldown: 2 })],
});
check(
  "Unsupported level fails closed",
  unsupportedLevel.diagnostics.some((diagnostic) => diagnostic.code === SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedLevel),
);

const noBaseline = runFixture({
  id: "no-baseline",
  mainActions: [],
  powers: [buff({ identity: "No baseline M3", modifier: 3, cooldown: 2 })],
});
check(
  "Missing baseline attack fails closed",
  noBaseline.diagnostics.some((diagnostic) => diagnostic.code === SELF_ATTACK_THREAT_DIAGNOSTIC.noBaselineAttack),
);

const defensivePacket = packet({
  identity: "ordering-defence",
  packetIndex: 1,
  intention: "DEFENCE",
  modifier: null,
  duration: "TURNS",
  durationTurns: 2,
  applyTo: "SELF",
  attribute: null,
});
const orderingPower = buff({ identity: "Ordering M3", modifier: 3, cooldown: 2 });
orderingPower.effectPackets.push(defensivePacket);
orderingPower.intentions = orderingPower.effectPackets;
const unsupportedOrdering = runFixture({ id: "unsupported-ordering", powers: [orderingPower] });
check(
  "Defensive setup ordering fails closed",
  unsupportedOrdering.diagnostics.some((diagnostic) => diagnostic.code === SELF_ATTACK_THREAT_DIAGNOSTIC.unsupportedOrdering),
);

function baseMonster(powers: Power[]): MonsterUpsertInput {
  return {
    name: "SELF Attack production path",
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
    weaponSkillValue: 4,
    weaponSkillModifier: 0,
    armorSkillValue: 0,
    armorSkillModifier: 0,
    tags: [],
    traits: [],
    attacks: [{
      id: "self-attack-threat-main",
      sortOrder: 0,
      attackMode: "NATURAL",
      attackName: "Reference Slash",
      attackConfig: {
        melee: {
          enabled: true,
          targets: 1,
          physicalStrength: 1,
          mentalStrength: 0,
          damageTypes: [{ name: "Slashing", mode: "PHYSICAL" }],
          attackEffects: [],
        },
      },
    }],
    naturalAttack: null,
    powers,
  };
}

function zeroAxes(): RadarAxes {
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

const productionPower = buff({ identity: "Production M3", modifier: 3, cooldown: 2 });
const productionAxes = { ...zeroAxes(), physicalThreat: 9, mobility: 2 };
const productionContribution: CanonicalPowerContribution = {
  axisVector: productionAxes,
  basePowerValue: 12,
  powerCount: 1,
  powers: [{
    id: productionPower.id,
    name: productionPower.name,
    axisVector: productionAxes,
    basePowerValue: 12,
    authoredPower: productionPower,
    cooldownAuthority: productionPower.cooldownAuthority,
    derivedCooldownTurns: 2,
    derivedCooldownLoad: 0.5,
    cooldownTurns: 2,
    cooldownReduction: 0,
  }],
};
const productionOutcome = computeMonsterOutcomes(baseMonster([productionPower]), calculatorConfig, {
  powerContribution: productionContribution,
});
const productionDebug = productionOutcome.debug as {
  powerContribution: {
    effectivePowerAxisVector: RadarAxes;
    semanticSelfAttackThreatReplacement: {
      excludedCostDerivedThreat: { physicalThreat: number; mentalThreat: number };
      model: SelfAttackThreatResult;
    };
  };
  finalPreNormalizationAxes: RadarAxes;
  semanticSynergyAxisModel: { scoreOverride: number | null };
};
near(
  "Production path uses exact routine M3 delta",
  productionDebug.powerContribution.semanticSelfAttackThreatReplacement.model.fiveTurnDelta,
  5.3046875,
);
check(
  "Eligible semantic Threat replaces cost-derived Threat",
  productionDebug.powerContribution.semanticSelfAttackThreatReplacement.excludedCostDerivedThreat.physicalThreat > 0 &&
    productionDebug.powerContribution.effectivePowerAxisVector.physicalThreat === 0,
);
check(
  "Other resolver axes remain unchanged",
  productionDebug.powerContribution.effectivePowerAxisVector.mobility > 0,
);
check(
  "Eligible SELF Attack receives zero semantic Synergy",
  productionDebug.semanticSynergyAxisModel.scoreOverride === 0 && productionOutcome.radarAxes.synergy === 0,
);
check(
  "Production Threat increases above the accepted D8 Soldier midpoint",
  productionOutcome.radarAxes.physicalThreat > 5,
);
check(
  "Production adapter leaves non-Threat final axes finite",
  [
    productionOutcome.radarAxes.physicalSurvivability,
    productionOutcome.radarAxes.mentalSurvivability,
    productionOutcome.radarAxes.manipulation,
    productionOutcome.radarAxes.synergy,
    productionOutcome.radarAxes.mobility,
    productionOutcome.radarAxes.presence,
  ].every(Number.isFinite),
);

const maximumStates = Math.max(...fixtures.map((fixture) => fixture.model.performance.memoizedStateCount));
const maximumBranches = Math.max(...fixtures.map((fixture) => fixture.model.performance.transitionBranches));
const maximumRuntimeMs = Math.max(...fixtures.map((fixture) => fixture.runtimeMs));
check("Reference suite remains bounded below 500 states", maximumStates < 500);
check("Reference suite remains bounded below 2000 branches", maximumBranches < 2_000);
check("Exactly 20 required numbered fixtures were recorded", fixtures.filter((fixture) => /^\d\d-/.test(fixture.id)).length === 20);

console.log(JSON.stringify({
  fixtureCount: 20,
  assertionCount: assertions,
  maximumStates,
  maximumBranches,
  maximumRuntimeMs,
  fixtures: fixtures
    .filter((fixture) => /^\d\d-/.test(fixture.id))
    .map((fixture) => ({
      id: fixture.id,
      mode: fixture.model.mode,
      fiveTurnHarmWithout: fixture.model.fiveTurnHarmWithout,
      fiveTurnHarmWith: fixture.model.fiveTurnHarmWith,
      fiveTurnDelta: fixture.model.fiveTurnDelta,
      rawThreatIncrement: fixture.model.rawThreatIncrement,
      diagnostics: fixture.model.diagnostics.map((diagnostic) => diagnostic.code),
      states: fixture.model.performance.memoizedStateCount,
      branches: fixture.model.performance.transitionBranches,
      runtimeMs: fixture.runtimeMs,
    })),
}, null, 2));
console.log(`selfAttackThreatLevel3.smoke.ts passed (${assertions} assertions, 20 fixtures).`);
