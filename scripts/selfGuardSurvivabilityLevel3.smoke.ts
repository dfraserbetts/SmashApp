import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import {
  computeMonsterOutcomes,
  type CanonicalPowerContribution,
  type RadarAxes,
} from "../lib/calculators/monsterOutcomeCalculator";
import {
  computeLevel3SelfGuardSurvivability,
  SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC,
  type SelfGuardSurvivabilityPassiveState,
  type SelfGuardSurvivabilityResult,
} from "../lib/calculators/selfGuardSurvivability";
import { makeResolvedPowerCooldownAuthority } from "../lib/summoning/resolvePowerCooldownAuthority";
import type {
  EffectPacket,
  MonsterTier,
  MonsterUpsertInput,
  Power,
} from "../lib/summoning/types";

type Die = "D4" | "D6" | "D8" | "D10" | "D12";
type DefenceProfile = {
  die: Die;
  physicalDefenceDice: number;
  dodgeDice: number;
  blockPerSuccess: number;
};

const DIE_SIDES: Record<Die, number> = { D4: 4, D6: 6, D8: 8, D10: 10, D12: 12 };
const SOLDIER_D4: DefenceProfile = {
  die: "D4",
  physicalDefenceDice: 2,
  dodgeDice: 2,
  blockPerSuccess: 1,
};
const fixtures: Array<{ id: string; model: SelfGuardSurvivabilityResult; runtimeMs: number }> = [];
let assertions = 0;

function check(label: string, condition: boolean): void {
  assertions += 1;
  assert.ok(condition, label);
  console.log(`PASS ${String(assertions).padStart(2, "0")}: ${label}`);
}

function near(label: string, actual: number, expected: number, tolerance = 0.0001): void {
  check(`${label} (actual ${actual})`, Math.abs(actual - expected) <= tolerance);
}

function stableId(kind: "power" | "packet", value: string): string {
  return `self-guard-${kind}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function packet(params: {
  identity: string;
  attribute?: "GUARD" | "FORTITUDE";
  intention?: EffectPacket["intention"];
  packetIndex?: number;
  dice?: number;
  potency?: number;
  modifier?: number | null;
  duration?: "TURNS" | "PASSIVE" | "UNTIL_TARGET_NEXT_TURN" | "INSTANT";
  durationTurns?: number;
  timing?: EffectPacket["effectTimingType"];
  dependency?: EffectPacket["secondaryDependencyMode"];
  idOverride?: string | null;
}): EffectPacket {
  const intention = params.intention ?? "AUGMENT";
  const packetIndex = params.packetIndex ?? 0;
  const duration = params.duration ?? "TURNS";
  const attribute = params.attribute ?? "GUARD";
  return {
    id:
      params.idOverride === undefined
        ? stableId("packet", params.identity)
        : (params.idOverride ?? undefined),
    sortOrder: packetIndex,
    packetIndex,
    intention,
    type: intention,
    hostility: "NON_HOSTILE",
    specific: null,
    diceCount: params.dice ?? 3,
    potency: params.potency ?? 3,
    modifier: params.modifier === undefined ? 3 : params.modifier,
    effectTimingType: params.timing ?? "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: duration,
    effectDurationTurns: duration === "TURNS" ? (params.durationTurns ?? 2) : null,
    dealsWounds: false,
    woundChannel: null,
    targetedAttribute: intention === "AUGMENT" ? attribute : null,
    applicationModeKey: null,
    resolutionOrigin: "CASTER",
    applyTo: "SELF",
    secondaryDependencyMode:
      params.dependency ?? (packetIndex === 0 ? "INDEPENDENT" : "LINKED_TO_PRIMARY"),
    triggerConditionText: null,
    detailsJson: {
      statTarget: attribute,
      rangeCategory: "SELF",
      defenceMode: intention === "DEFENCE" ? "Block" : undefined,
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
}): Power {
  const primary = params.packets[0]!;
  const powerId =
    params.idOverride === undefined
      ? stableId("power", params.identity)
      : (params.idOverride ?? undefined);
  const authority = makeResolvedPowerCooldownAuthority({
    effectiveCooldownTurns: params.cooldown,
    source: "ACTIVE_TUNING",
    tuningSetId: "self-guard-survivability-smoke",
    tuningUpdatedAt: new Date(0).toISOString(),
    storedCooldownTurns: params.cooldown,
  });
  return {
    id: powerId,
    name: params.identity,
    sortOrder: 0,
    descriptorChassis: params.chassis ?? "IMMEDIATE",
    counterMode: params.counter ? "YES" : "NO",
    effectPackets: params.packets,
    intentions: params.packets,
    diceCount: Number(primary.diceCount ?? 1),
    potency: Number(primary.potency ?? 1),
    cooldownTurns: params.cooldown,
    cooldownAuthority: authority,
    rangeCategories: [],
  } as unknown as Power;
}

function augment(params: {
  identity: string;
  attribute?: "GUARD" | "FORTITUDE";
  modifier: number;
  dice?: number;
  potency?: number;
  duration?: "TURNS" | "PASSIVE" | "UNTIL_TARGET_NEXT_TURN";
  durationTurns?: number;
  cooldown: number;
  timing?: EffectPacket["effectTimingType"];
  linked?: Array<{ attribute: "GUARD" | "FORTITUDE"; modifier: number; potency?: number }>;
  idOverride?: string | null;
  packetIdOverride?: string | null;
}): Power {
  const duration = params.duration ?? "TURNS";
  const packets = [packet({
    identity: `${params.identity}-primary`,
    attribute: params.attribute ?? "GUARD",
    modifier: params.modifier,
    dice: params.dice ?? 3,
    potency: params.potency ?? 3,
    duration,
    durationTurns: params.durationTurns ?? 2,
    timing: params.timing,
    idOverride: params.packetIdOverride,
  })];
  for (const [index, linked] of (params.linked ?? []).entries()) {
    packets.push(packet({
      identity: `${params.identity}-linked-${index}`,
      attribute: linked.attribute,
      modifier: linked.modifier,
      dice: 0,
      potency: linked.potency ?? 3,
      packetIndex: index + 1,
      duration,
      durationTurns: params.durationTurns ?? 2,
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

function runFixture(params: {
  id: string;
  powers?: Power[];
  profile?: DefenceProfile;
  tier?: MonsterTier;
  level?: number;
  passiveState?: SelfGuardSurvivabilityPassiveState;
  snapshots?: Readonly<Record<string, number>>;
  includeAuthority?: boolean;
}): SelfGuardSurvivabilityResult {
  const started = performance.now();
  const profile = params.profile ?? SOLDIER_D4;
  const model = computeLevel3SelfGuardSurvivability({
    level: params.level ?? 3,
    tier: params.tier ?? "SOLDIER",
    guardDieSides: DIE_SIDES[profile.die],
    fortitudeDieSides: DIE_SIDES[profile.die],
    physicalDefenceDice: profile.physicalDefenceDice,
    dodgeDice: profile.dodgeDice,
    blockPerSuccess: profile.blockPerSuccess,
    powers: (params.powers ?? []).map((candidate) => ({
      id: candidate.id ?? null,
      name: candidate.name,
      authoredPower: candidate,
      cooldownAuthority:
        params.includeAuthority === false ? null : (candidate.cooldownAuthority ?? null),
    })),
    tuning: calculatorConfig.durabilityAxisTuning,
    passiveState: params.passiveState,
    passiveActivationSourceSuccessesByPowerId: params.snapshots,
  });
  fixtures.push({ id: params.id, model, runtimeMs: performance.now() - started });
  return model;
}

const control = runFixture({ id: "01-control" });
near("1. Control H0", control.fiveTurnHarmWithout, 22.30224609375);
near("1. Control H1", control.fiveTurnHarmWith, 22.30224609375);
check("Control has no semantic replacement", control.mode === "NONE");

const m1 = runFixture({
  id: "02-m1-one-turn",
  powers: [augment({
    identity: "M1 one turn",
    modifier: 1,
    dice: 2,
    potency: 1,
    duration: "UNTIL_TARGET_NEXT_TURN",
    cooldown: 1,
  })],
});
near("2. M1 one-turn prevention", m1.preventedHarm, 0);

const routineM3 = runFixture({
  id: "03-m3-two-turn",
  powers: [augment({ identity: "M3 two turn", modifier: 3, cooldown: 2 })],
});
near("3. M3 two-turn prevention", routineM3.preventedHarm, 1.4192008972);

const m5 = runFixture({
  id: "04-m5-two-turn",
  powers: [augment({ identity: "M5 two turn", modifier: 5, cooldown: 2 })],
});
near("4. M5 D4 plateau", m5.preventedHarm, 1.4192008972);

const longM3Power = augment({
  identity: "M3 four turn",
  modifier: 3,
  durationTurns: 4,
  cooldown: 3,
});
const longM3 = runFixture({ id: "05-m3-four-turn", powers: [longM3Power] });
near("5. M3 four-turn prevention", longM3.preventedHarm, 2.3205852509);

const preparedPower = augment({
  identity: "Prepared Passive M4",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
const prepared = runFixture({ id: "06-prepared-passive", powers: [preparedPower] });
near("6. Prepared Passive M4", prepared.preventedHarm, 1.9945526123);

const inactivePower = augment({
  identity: "Inactive Passive M4",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
const inactive = runFixture({
  id: "07-inactive-passive",
  powers: [inactivePower],
  passiveState: "INACTIVE",
});
near("7. Inactive Passive M4 retry doctrine", inactive.preventedHarm, 3.1708541522);

const snapshotPower = augment({
  identity: "Snapshot Passive M4",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
const snapshot = runFixture({
  id: "08-active-snapshot",
  powers: [snapshotPower],
  passiveState: "ACTIVE_SNAPSHOT",
  snapshots: { [snapshotPower.id!]: 2 },
});
near("8. ACTIVE snapshot stored successes", snapshot.preventedHarm, 6.1370849609);

const fortActive = runFixture({
  id: "09-fortitude-active",
  powers: [augment({ identity: "Fortitude active", attribute: "FORTITUDE", modifier: 3, cooldown: 2 })],
});
const fortStrong = runFixture({
  id: "10-fortitude-strong-d10",
  profile: { ...SOLDIER_D4, die: "D10" },
  powers: [augment({ identity: "Fortitude D10", attribute: "FORTITUDE", modifier: 5, cooldown: 2 })],
});
const fortPreparedPower = augment({
  identity: "Fortitude prepared",
  attribute: "FORTITUDE",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
const fortPrepared = runFixture({ id: "11-fortitude-prepared", powers: [fortPreparedPower] });
const fortInactivePower = augment({
  identity: "Fortitude inactive",
  attribute: "FORTITUDE",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
const fortInactive = runFixture({
  id: "12-fortitude-inactive",
  powers: [fortInactivePower],
  passiveState: "INACTIVE",
});
const fortSnapshotPower = augment({
  identity: "Fortitude snapshot",
  attribute: "FORTITUDE",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
const fortSnapshot = runFixture({
  id: "13-fortitude-snapshot",
  powers: [fortSnapshotPower],
  passiveState: "ACTIVE_SNAPSHOT",
  snapshots: { [fortSnapshotPower.id!]: 2 },
});
const fortLinked = runFixture({
  id: "14-fortitude-linked",
  powers: [augment({
    identity: "Fortitude linked",
    attribute: "FORTITUDE",
    modifier: 3,
    linked: [{ attribute: "FORTITUDE", modifier: 2 }],
    cooldown: 3,
  })],
});
for (const [label, model] of [
  ["9", fortActive],
  ["10", fortStrong],
  ["11", fortPrepared],
  ["12", fortInactive],
  ["13", fortSnapshot],
  ["14", fortLinked],
] as const) {
  near(`${label}. Fortitude generic prevention`, model.preventedHarm, 0);
  near(`${label}. Fortitude supplemental credit`, model.semanticSupplementalRatio, 0);
  check(
    `${label}. Fortitude diagnostic`,
    model.diagnostics.some(
      (diagnostic) =>
        diagnostic.code ===
        SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.fortitudeNoGenericIncomingHarmEffect,
    ),
  );
}

const guardFortitude = runFixture({
  id: "15-linked-guard-fortitude",
  powers: [augment({
    identity: "Linked Guard Fortitude",
    modifier: 3,
    cooldown: 4,
    linked: [{ attribute: "FORTITUDE", modifier: 3 }],
  })],
});
near("15. Linked Guard plus Fortitude counts Guard only", guardFortitude.preventedHarm, 0.7096004486);

const clamped = runFixture({
  id: "16-linked-guard-clamp",
  powers: [augment({
    identity: "Linked Guard clamp",
    modifier: 3,
    cooldown: 2,
    linked: [{ attribute: "GUARD", modifier: 3 }],
  })],
});
near("16. Linked Guard clamps once at +5", clamped.preventedHarm, 1.4192008972);

const competing = runFixture({
  id: "17-competing-guard-powers",
  powers: [
    augment({ identity: "Fast M1", modifier: 1, durationTurns: 2, cooldown: 1 }),
    augment({ identity: "Long M2", modifier: 2, durationTurns: 4, cooldown: 3 }),
  ],
});
near("17. Competing Guard powers exact Power-lane optimum", competing.preventedHarm, 3.1150109176);

const strongReferencePower = augment({
  identity: "Strong baseline comparator",
  modifier: 5,
  durationTurns: 4,
  cooldown: 4,
});
const strongD4 = runFixture({ id: "18-strong-d4", powers: [strongReferencePower] });
near("18. Strong Guard on D4 baseline", strongD4.preventedHarm, 1.6109848022);
const strongD10 = runFixture({
  id: "19-same-strong-d10",
  profile: { ...SOLDIER_D4, die: "D10" },
  powers: [strongReferencePower],
});
near("19. Same power on D10 baseline", strongD10.preventedHarm, 4.7745370605);

const fortD4 = runFixture({
  id: "20-strong-fortitude-d4",
  powers: [augment({ identity: "Strong Fortitude D4", attribute: "FORTITUDE", modifier: 5, durationTurns: 4, cooldown: 4 })],
});
const fortD10 = runFixture({
  id: "21-strong-fortitude-d10",
  profile: { ...SOLDIER_D4, die: "D10" },
  powers: [augment({ identity: "Strong Fortitude D10", attribute: "FORTITUDE", modifier: 5, durationTurns: 4, cooldown: 4 })],
});
near("20. Strong Fortitude D4 remains zero", fortD4.preventedHarm, 0);
near("21. Strong Fortitude D10 remains zero", fortD10.preventedHarm, 0);

const minion = runFixture({
  id: "22-minion-d6",
  tier: "MINION",
  profile: { die: "D6", physicalDefenceDice: 1, dodgeDice: 2, blockPerSuccess: 0 },
  powers: [longM3Power],
});
near("22. Minion D6 comparator", minion.preventedHarm, 2.0141601563);
const soldier = runFixture({
  id: "23-soldier-d8",
  profile: { ...SOLDIER_D4, die: "D8" },
  powers: [longM3Power],
});
near("23. Soldier D8 comparator", soldier.preventedHarm, 3.9785444736);
const elite = runFixture({
  id: "24-elite-d10",
  tier: "ELITE",
  profile: { die: "D10", physicalDefenceDice: 3, dodgeDice: 2, blockPerSuccess: 1 },
  powers: [longM3Power],
});
near("24. Elite D10 comparator", elite.preventedHarm, 4.4334911133);

const weak = runFixture({
  id: "25-weak-one-turn",
  powers: [augment({
    identity: "Weak one turn",
    modifier: 1,
    dice: 1,
    potency: 1,
    duration: "UNTIL_TARGET_NEXT_TURN",
    cooldown: 1,
  })],
});
near("25. Weak one-turn Guard", weak.preventedHarm, 0);

const veryStrongD10 = runFixture({
  id: "26-strong-d10",
  profile: { ...SOLDIER_D4, die: "D10" },
  powers: [augment({
    identity: "Very strong D10",
    modifier: 5,
    dice: 4,
    potency: 4,
    durationTurns: 4,
    cooldown: 4,
  })],
});
near("26. Strong D10 Guard", veryStrongD10.preventedHarm, 5.1532789014);

const poolPower = power({
  identity: "Defensive pool control",
  cooldown: 2,
  packets: [packet({
    identity: "defensive-pool-control",
    intention: "DEFENCE",
    modifier: null,
    durationTurns: 2,
  })],
});
const poolControl = runFixture({ id: "27-defensive-pool-control", powers: [poolPower] });
near("27. Defensive pool has zero semantic Modifier delta", poolControl.preventedHarm, 0);
check("27. Defensive pool stays outside semantic mode", poolControl.mode === "NONE");

const boss = runFixture({
  id: "28-boss-fail-closed",
  tier: "BOSS",
  powers: [augment({ identity: "Boss Guard", modifier: 3, cooldown: 2 })],
});
check(
  "28. Boss fails closed",
  boss.mode === "FAIL_CLOSED" &&
    boss.diagnostics.some(
      (diagnostic) =>
        diagnostic.code ===
        SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.bossActionEconomyUnresolved,
    ),
);

const recurring = runFixture({
  id: "29-recurrence-fail-closed",
  powers: [augment({
    identity: "Recurring Guard",
    modifier: 3,
    timing: "START_OF_TURN",
    cooldown: 3,
  })],
});
check(
  "29. Recurrence fails closed",
  recurring.mode === "FAIL_CLOSED" &&
    recurring.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedRecurrence,
    ),
);

const missingIdentityPower = augment({
  identity: "Missing identity",
  modifier: 3,
  cooldown: 2,
  idOverride: null,
  packetIdOverride: null,
});
const missingIdentity = runFixture({ id: "diagnostic-missing-identity", powers: [missingIdentityPower] });
check(
  "Missing identity fails closed",
  missingIdentity.diagnostics.some(
    (diagnostic) => diagnostic.code === SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.missingIdentity,
  ),
);
const missingCooldown = runFixture({
  id: "diagnostic-missing-cooldown",
  powers: [augment({ identity: "Missing cooldown", modifier: 3, cooldown: 2 })],
  includeAuthority: false,
});
check(
  "Missing cooldown authority fails closed",
  missingCooldown.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.missingCooldownAuthority,
  ),
);
const unsupportedLevel = runFixture({
  id: "diagnostic-unsupported-level",
  level: 2,
  powers: [augment({ identity: "Level two Guard", modifier: 3, cooldown: 2 })],
});
check(
  "Unsupported level fails closed",
  unsupportedLevel.diagnostics.some(
    (diagnostic) => diagnostic.code === SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedLevel,
  ),
);
const legacyPower = augment({ identity: "Legacy Guard", modifier: 3, cooldown: 2 });
legacyPower.effectPackets[0]!.modifier = null;
legacyPower.intentions = legacyPower.effectPackets;
const legacyOnly = runFixture({ id: "diagnostic-legacy-only", powers: [legacyPower] });
check("Legacy-only content keeps the legacy path", legacyOnly.mode === "NONE");
const mixedPower = augment({
  identity: "Mixed Guard",
  modifier: 3,
  cooldown: 2,
  linked: [{ attribute: "GUARD", modifier: 2 }],
});
mixedPower.effectPackets[1]!.modifier = null;
mixedPower.intentions = mixedPower.effectPackets;
const mixed = runFixture({ id: "diagnostic-mixed", powers: [mixedPower] });
check(
  "Mixed semantic and legacy packets fail closed",
  mixed.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.mixedSemanticLegacy,
  ),
);
const missingSnapshotPower = augment({
  identity: "Missing snapshot",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
const missingSnapshot = runFixture({
  id: "diagnostic-missing-snapshot",
  powers: [missingSnapshotPower],
  passiveState: "ACTIVE_SNAPSHOT",
});
check(
  "Missing ACTIVE snapshot fails closed",
  missingSnapshot.diagnostics.some(
    (diagnostic) =>
      diagnostic.code ===
      SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.activeSnapshotMissingSuccesses,
  ),
);
const responsePower = augment({ identity: "Response Guard", modifier: 3, cooldown: 2 });
responsePower.counterMode = "YES";
const response = runFixture({ id: "diagnostic-response", powers: [responsePower] });
check(
  "Response timing fails closed",
  response.diagnostics.some(
    (diagnostic) => diagnostic.code === SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
  ),
);
const fieldPower = augment({ identity: "Field Guard", modifier: 3, cooldown: 2 });
fieldPower.descriptorChassis = "FIELD";
const field = runFixture({ id: "diagnostic-field", powers: [fieldPower] });
check(
  "Unsupported chassis fails closed",
  field.diagnostics.some(
    (diagnostic) => diagnostic.code === SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
  ),
);
const orderingPower = augment({ identity: "Ordering Guard", modifier: 3, cooldown: 2 });
orderingPower.effectPackets.push(packet({
  identity: "ordering-defence",
  intention: "DEFENCE",
  packetIndex: 1,
  modifier: null,
}));
orderingPower.intentions = orderingPower.effectPackets;
const ordering = runFixture({ id: "diagnostic-ordering", powers: [orderingPower] });
check(
  "Context-dependent defensive setup ordering fails closed",
  ordering.diagnostics.some(
    (diagnostic) => diagnostic.code === SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
  ),
);
const noReferencePower = augment({ identity: "No reference Guard", modifier: 3, cooldown: 2 });
const noReference = computeLevel3SelfGuardSurvivability({
  level: 3,
  tier: "SOLDIER",
  guardDieSides: 4,
  fortitudeDieSides: 4,
  physicalDefenceDice: 2,
  dodgeDice: 2,
  blockPerSuccess: 1,
  powers: [{
    id: noReferencePower.id,
    authoredPower: noReferencePower,
    cooldownAuthority: noReferencePower.cooldownAuthority,
  }],
  tuning: { ...calculatorConfig.durabilityAxisTuning, referenceIncomingDiceCount: 0 },
});
check(
  "Missing incoming reference fails closed",
  noReference.mode === "FAIL_CLOSED" &&
    noReference.diagnostics.some(
      (diagnostic) => diagnostic.code === SELF_DEFENCE_SURVIVABILITY_DIAGNOSTIC.noReferenceAttack,
    ),
);
const duplicatePacketPower = augment({
  identity: "Duplicate packet Guard",
  modifier: 3,
  cooldown: 2,
  linked: [{ attribute: "GUARD", modifier: 3 }],
});
duplicatePacketPower.effectPackets[1]!.id = duplicatePacketPower.effectPackets[0]!.id;
duplicatePacketPower.intentions = duplicatePacketPower.effectPackets;
const duplicatePacket = runFixture({ id: "diagnostic-duplicate-packet", powers: [duplicatePacketPower] });
near(
  "Duplicate stable packet identity counts once",
  duplicatePacket.preventedHarm,
  routineM3.preventedHarm,
);

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

function baseMonster(powers: Power[]): MonsterUpsertInput {
  return {
    name: "SELF Guard production path",
    level: 3,
    tier: "SOLDIER",
    legendary: false,
    physicalResilienceCurrent: 10,
    physicalResilienceMax: 10,
    mentalPerseveranceCurrent: 10,
    mentalPerseveranceMax: 10,
    physicalProtection: 1,
    mentalProtection: 1,
    naturalPhysicalProtection: 1,
    naturalMentalProtection: 1,
    attackDie: "D4",
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: "D4",
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D4",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D4",
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: "D4",
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: "D4",
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: 1,
    weaponSkillModifier: 0,
    armorSkillValue: 2,
    armorSkillModifier: 0,
    tags: [],
    traits: [],
    attacks: [],
    naturalAttack: null,
    powers,
  } as unknown as MonsterUpsertInput;
}

function canonicalContribution(candidate: Power, physicalSurvivability: number): CanonicalPowerContribution {
  const axes = { ...zeroAxes(), physicalSurvivability };
  return {
    axisVector: axes,
    basePowerValue: physicalSurvivability,
    powerCount: 1,
    powers: [{
      id: candidate.id,
      name: candidate.name,
      axisVector: axes,
      basePowerValue: physicalSurvivability,
      authoredPower: candidate,
      cooldownAuthority: candidate.cooldownAuthority,
      derivedCooldownTurns: candidate.cooldownAuthority?.effectiveCooldownTurns ?? null,
    }],
  };
}

const productionGuard = augment({
  identity: "Production Guard",
  modifier: 3,
  durationTurns: 4,
  cooldown: 3,
});
const productionBaseline = computeMonsterOutcomes(baseMonster([]), calculatorConfig);
const productionGuardOutcome = computeMonsterOutcomes(
  baseMonster([productionGuard]),
  calculatorConfig,
  { powerContribution: canonicalContribution(productionGuard, 9) },
);
const productionDebug = productionGuardOutcome.debug as {
  powerContribution: {
    effectivePowerAxisVector: RadarAxes;
    semanticSelfGuardSurvivabilityReplacement: {
      excludedCostDerivedPhysicalSurvivability: number;
      model: SelfGuardSurvivabilityResult;
    };
  };
  normalizationBreakdown: {
    durabilityAxisBaselineModel: {
      physicalSurvivability: {
        supplementalContributions: { semanticGuard: number };
        supplementalRatio: number;
      };
    };
  };
};
check(
  "Eligible Guard cost-derived physical Survivability is removed",
  productionDebug.powerContribution.semanticSelfGuardSurvivabilityReplacement
    .excludedCostDerivedPhysicalSurvivability > 0 &&
    productionDebug.powerContribution.effectivePowerAxisVector.physicalSurvivability === 0,
);
check(
  "Semantic Guard enters the existing supplemental lane once",
  productionDebug.normalizationBreakdown.durabilityAxisBaselineModel.physicalSurvivability
    .supplementalContributions.semanticGuard > 0,
);
check(
  "Semantic Guard increases only physical Survivability",
  productionGuardOutcome.radarAxes.physicalSurvivability >
    productionBaseline.radarAxes.physicalSurvivability &&
    productionGuardOutcome.radarAxes.mentalSurvivability ===
      productionBaseline.radarAxes.mentalSurvivability,
);
for (const axis of [
  "physicalThreat",
  "mentalThreat",
  "mentalSurvivability",
  "manipulation",
  "synergy",
  "mobility",
  "presence",
] as const) {
  near(
    `Production Guard leaves ${axis} unchanged`,
    productionGuardOutcome.radarAxes[axis],
    productionBaseline.radarAxes[axis],
    1e-9,
  );
}

const productionFortitude = augment({
  identity: "Production Fortitude",
  attribute: "FORTITUDE",
  modifier: 4,
  durationTurns: 4,
  cooldown: 3,
});
const productionFortitudeOutcome = computeMonsterOutcomes(
  baseMonster([productionFortitude]),
  calculatorConfig,
  { powerContribution: canonicalContribution(productionFortitude, 9) },
);
const fortitudeDebug = productionFortitudeOutcome.debug as {
  powerContribution: {
    semanticSelfGuardSurvivabilityReplacement: {
      excludedCostDerivedPhysicalSurvivability: number;
      model: SelfGuardSurvivabilityResult;
    };
  };
};
check(
  "Eligible Fortitude cost-derived physical credit is suppressed",
  fortitudeDebug.powerContribution.semanticSelfGuardSurvivabilityReplacement
    .excludedCostDerivedPhysicalSurvivability > 0,
);
near(
  "Fortitude leaves physical Survivability at the no-power baseline",
  productionFortitudeOutcome.radarAxes.physicalSurvivability,
  productionBaseline.radarAxes.physicalSurvivability,
  1e-9,
);
near(
  "Fortitude is not routed to mental Survivability",
  productionFortitudeOutcome.radarAxes.mentalSurvivability,
  productionBaseline.radarAxes.mentalSurvivability,
  1e-9,
);

const calculatorRuntimeSamples = Array.from({ length: 25 }, () => {
  const started = performance.now();
  computeMonsterOutcomes(baseMonster([productionGuard]), calculatorConfig, {
    powerContribution: canonicalContribution(productionGuard, 9),
  });
  return performance.now() - started;
}).sort((left, right) => left - right);
const typicalCalculatorRuntimeMs = calculatorRuntimeSamples[
  Math.floor(calculatorRuntimeSamples.length / 2)
]!;
const maximumCalculatorRuntimeMs = calculatorRuntimeSamples.at(-1)!;

check("Longer duration increases prevention", longM3.preventedHarm > routineM3.preventedHarm);
near("D4 Modifier progression can plateau", m5.preventedHarm, routineM3.preventedHarm);
check(
  "Prepared, Inactive, and ACTIVE snapshot states remain distinct",
  new Set([prepared.preventedHarm, inactive.preventedHarm, snapshot.preventedHarm]).size === 3,
);
check("Inactive failure/retry doctrine adds expected branches", inactive.performance.transitionBranches > prepared.performance.transitionBranches);
check("Multiple Guard powers compete in one exact optimizer", competing.performance.choiceCount > routineM3.performance.choiceCount);
check("Major Injury contributes zero", routineM3.policy.majorInjuryContribution === 0);
check("Configured supplemental maximum is reused", routineM3.policy.supplementalContributionMaxRatio === calculatorConfig.durabilityAxisTuning.supplementalContributionMaxRatio);
check("Exactly 29 numbered fixtures were recorded", fixtures.filter((fixture) => /^\d\d-/.test(fixture.id)).length === 29);

const numberedFixtures = fixtures.filter((fixture) => /^\d\d-/.test(fixture.id));
const maximumStates = Math.max(...numberedFixtures.map((fixture) => fixture.model.performance.memoizedStateCount));
const maximumBranches = Math.max(...numberedFixtures.map((fixture) => fixture.model.performance.transitionBranches));
const maximumRuntimeMs = Math.max(...numberedFixtures.map((fixture) => fixture.runtimeMs));
check("Reference suite stays below 500 memoized states", maximumStates < 500);
check("Reference suite stays below 2500 transition branches", maximumBranches < 2_500);
check("Typical production calculator call stays below 50ms", typicalCalculatorRuntimeMs < 50);

console.log(JSON.stringify({
  fixtureCount: numberedFixtures.length,
  assertionCount: assertions,
  maximumStates,
  maximumBranches,
  maximumRuntimeMs,
  typicalCalculatorRuntimeMs,
  maximumCalculatorRuntimeMs,
  fixtures: numberedFixtures.map((fixture) => ({
    id: fixture.id,
    mode: fixture.model.mode,
    fiveTurnHarmWithout: fixture.model.fiveTurnHarmWithout,
    fiveTurnHarmWith: fixture.model.fiveTurnHarmWith,
    preventedHarm: fixture.model.preventedHarm,
    semanticSupplementalRatio: fixture.model.semanticSupplementalRatio,
    diagnostics: fixture.model.diagnostics.map((diagnostic) => diagnostic.code),
    states: fixture.model.performance.memoizedStateCount,
    branches: fixture.model.performance.transitionBranches,
    runtimeMs: fixture.runtimeMs,
  })),
}, null, 2));
console.log(`selfGuardSurvivabilityLevel3.smoke.ts passed (${assertions} assertions, 29 fixtures).`);
