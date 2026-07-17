import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import {
  computeMonsterOutcomes,
  type CanonicalPowerContribution,
  type RadarAxes,
} from "../lib/calculators/monsterOutcomeCalculator";
import {
  computeLevel3SelfBraverySurvivability,
  SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC,
  type SelfBraverySurvivabilityPassiveState,
  type SelfBraverySurvivabilityResult,
} from "../lib/calculators/selfBraverySurvivability";
import {
  getDodgeValue,
  getWeaponSkillDiceCountFromAttributes,
  getWillpowerDiceCountFromAttributes,
} from "../lib/summoning/attributes";
import { makeResolvedPowerCooldownAuthority } from "../lib/summoning/resolvePowerCooldownAuthority";
import type {
  EffectPacket,
  MonsterTier,
  MonsterUpsertInput,
  Power,
} from "../lib/summoning/types";

type Die = "D4" | "D6" | "D8" | "D10";
type Attribute = "BRAVERY" | "INTELLECT";
type MentalProfile = {
  braveryDie: Die;
  intellectDie: Die;
  mentalDefenceDice: number;
  blockPerSuccess: number;
};

const DIE_SIDES: Record<Die, number> = { D4: 4, D6: 6, D8: 8, D10: 10 };
const SOLDIER_D8: MentalProfile = {
  braveryDie: "D8",
  intellectDie: "D8",
  mentalDefenceDice: 3,
  blockPerSuccess: 1,
};
const fixtures: Array<{ id: string; model: SelfBraverySurvivabilityResult; runtimeMs: number }> = [];
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
  return `self-bravery-${kind}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function packet(params: {
  identity: string;
  attribute?: Attribute;
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
  const attribute = params.attribute ?? "BRAVERY";
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
    detailsJson: { statTarget: attribute, rangeCategory: "SELF" },
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
    tuningSetId: "self-bravery-survivability-smoke",
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
  attribute?: Attribute;
  modifier: number;
  dice?: number;
  potency?: number;
  duration?: "TURNS" | "PASSIVE" | "UNTIL_TARGET_NEXT_TURN";
  durationTurns?: number;
  cooldown: number;
  timing?: EffectPacket["effectTimingType"];
  linked?: Array<{ attribute: Attribute; modifier: number; potency?: number }>;
  idOverride?: string | null;
  packetIdOverride?: string | null;
}): Power {
  const duration = params.duration ?? "TURNS";
  const packets = [
    packet({
      identity: `${params.identity}-primary`,
      attribute: params.attribute ?? "BRAVERY",
      modifier: params.modifier,
      dice: params.dice ?? 3,
      potency: params.potency ?? 3,
      duration,
      durationTurns: params.durationTurns ?? 2,
      timing: params.timing,
      idOverride: params.packetIdOverride,
    }),
  ];
  for (const [index, linked] of (params.linked ?? []).entries()) {
    packets.push(
      packet({
        identity: `${params.identity}-linked-${index}`,
        attribute: linked.attribute,
        modifier: linked.modifier,
        dice: 0,
        potency: linked.potency ?? 3,
        packetIndex: index + 1,
        duration,
        durationTurns: params.durationTurns ?? 2,
        dependency: "LINKED_TO_PRIMARY",
      }),
    );
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
  profile?: MentalProfile;
  tier?: MonsterTier;
  level?: number;
  passiveState?: SelfBraverySurvivabilityPassiveState;
  snapshots?: Readonly<Record<string, number>>;
  includeAuthority?: boolean;
}): SelfBraverySurvivabilityResult {
  const started = performance.now();
  const profile = params.profile ?? SOLDIER_D8;
  const model = computeLevel3SelfBraverySurvivability({
    level: params.level ?? 3,
    tier: params.tier ?? "SOLDIER",
    braveryDieSides: DIE_SIDES[profile.braveryDie],
    intellectDieSides: DIE_SIDES[profile.intellectDie],
    mentalDefenceDice: profile.mentalDefenceDice,
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

function hasIntellectDiagnostic(model: SelfBraverySurvivabilityResult): boolean {
  return model.diagnostics.some(
    (diagnostic) =>
      diagnostic.code ===
      SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.intellectNoApprovedManipulationReference,
  );
}

const control = runFixture({ id: "01-no-power-control" });
near("1. Control H0", control.fiveTurnHarmWithout, 15.97132682800293);
near("1. Control H1", control.fiveTurnHarmWith, 15.97132682800293);
check("1. Control has no semantic replacement", control.mode === "NONE");

const intellectPowers: Power[] = [];
const intellectModels: SelfBraverySurvivabilityResult[] = [];
function intellectFixture(
  id: string,
  candidate: Power,
  options: Omit<Parameters<typeof runFixture>[0], "id" | "powers"> = {},
): SelfBraverySurvivabilityResult {
  intellectPowers.push(candidate);
  const model = runFixture({ id, powers: [candidate], ...options });
  intellectModels.push(model);
  return model;
}

intellectFixture(
  "02-intellect-m1-one-turn",
  augment({
    identity: "Intellect M1 one turn",
    attribute: "INTELLECT",
    modifier: 1,
    dice: 2,
    potency: 1,
    duration: "UNTIL_TARGET_NEXT_TURN",
    cooldown: 1,
  }),
);
intellectFixture(
  "03-intellect-m3-two-turn",
  augment({ identity: "Intellect M3 two turn", attribute: "INTELLECT", modifier: 3, cooldown: 2 }),
);
intellectFixture(
  "04-intellect-m5-two-turn",
  augment({ identity: "Intellect M5 two turn", attribute: "INTELLECT", modifier: 5, cooldown: 2 }),
);
intellectFixture(
  "05-intellect-m3-four-turn",
  augment({
    identity: "Intellect M3 four turn",
    attribute: "INTELLECT",
    modifier: 3,
    durationTurns: 4,
    cooldown: 3,
  }),
);
const intellectPreparedPower = augment({
  identity: "Intellect prepared Passive M4",
  attribute: "INTELLECT",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
intellectFixture(
  "06-intellect-prepared-passive",
  intellectPreparedPower,
);
const intellectInactivePower = augment({
  identity: "Intellect inactive Passive M4",
  attribute: "INTELLECT",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
intellectFixture(
  "07-intellect-inactive-passive",
  intellectInactivePower,
  { passiveState: "INACTIVE" },
);
const intellectSnapshotPower = augment({
  identity: "Intellect ACTIVE snapshot M4",
  attribute: "INTELLECT",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
intellectFixture(
  "08-intellect-active-snapshot",
  intellectSnapshotPower,
  {
    passiveState: "ACTIVE_SNAPSHOT",
    snapshots: { [intellectSnapshotPower.id!]: 2 },
  },
);
intellectFixture(
  "09-intellect-linked-m3-m2",
  augment({
    identity: "Intellect linked M3 M2",
    attribute: "INTELLECT",
    modifier: 3,
    linked: [{ attribute: "INTELLECT", modifier: 2, potency: 2 }],
    cooldown: 3,
  }),
);
intellectFixture(
  "10-intellect-linked-clamp",
  augment({
    identity: "Intellect linked clamp",
    attribute: "INTELLECT",
    modifier: 3,
    linked: [{ attribute: "INTELLECT", modifier: 3 }],
    cooldown: 3,
  }),
);
intellectFixture(
  "11-intellect-d6-m5",
  augment({ identity: "Intellect D6 M5", attribute: "INTELLECT", modifier: 5, cooldown: 2 }),
  { profile: { ...SOLDIER_D8, intellectDie: "D6" } },
);
intellectFixture(
  "12-intellect-d10-m5",
  augment({ identity: "Intellect D10 M5", attribute: "INTELLECT", modifier: 5, cooldown: 2 }),
  { profile: { ...SOLDIER_D8, intellectDie: "D10" } },
);

for (const [index, model] of intellectModels.entries()) {
  near(`${index + 2}. Intellect semantic prevention remains zero`, model.preventedHarm, 0);
  near(`${index + 2}. Intellect semantic supplemental remains zero`, model.semanticSupplementalRatio, 0);
  check(`${index + 2}. Intellect emits missing-reference diagnostic`, hasIntellectDiagnostic(model));
}

const braveryM1 = runFixture({
  id: "13-bravery-m1-one-turn",
  powers: [augment({
    identity: "Bravery M1 one turn",
    modifier: 1,
    dice: 2,
    potency: 1,
    duration: "UNTIL_TARGET_NEXT_TURN",
    cooldown: 1,
  })],
});
const braveryM3Power = augment({ identity: "Bravery M3 two turn", modifier: 3, cooldown: 2 });
const braveryM3 = runFixture({ id: "14-bravery-m3-two-turn", powers: [braveryM3Power] });
const braveryM5 = runFixture({
  id: "15-bravery-m5-two-turn",
  powers: [augment({ identity: "Bravery M5 two turn", modifier: 5, cooldown: 2 })],
});
const braveryLong = runFixture({
  id: "16-bravery-m3-four-turn",
  powers: [augment({
    identity: "Bravery M3 four turn",
    modifier: 3,
    durationTurns: 4,
    cooldown: 3,
  })],
});
const braveryPreparedPower = augment({
  identity: "Bravery prepared Passive M4",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
const braveryPrepared = runFixture({
  id: "17-bravery-prepared-passive",
  powers: [braveryPreparedPower],
});
const braveryInactivePower = augment({
  identity: "Bravery inactive Passive M4",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
const braveryInactive = runFixture({
  id: "18-bravery-inactive-passive",
  powers: [braveryInactivePower],
  passiveState: "INACTIVE",
});
const braverySnapshotPower = augment({
  identity: "Bravery ACTIVE snapshot M4",
  modifier: 4,
  duration: "PASSIVE",
  cooldown: 4,
});
const braverySnapshot = runFixture({
  id: "19-bravery-active-snapshot",
  powers: [braverySnapshotPower],
  passiveState: "ACTIVE_SNAPSHOT",
  snapshots: { [braverySnapshotPower.id!]: 2 },
});
const braveryLinked = runFixture({
  id: "20-bravery-linked-m3-m2",
  powers: [augment({
    identity: "Bravery linked M3 M2",
    modifier: 3,
    linked: [{ attribute: "BRAVERY", modifier: 2, potency: 2 }],
    cooldown: 3,
  })],
});
const braveryClamp = runFixture({
  id: "21-bravery-linked-clamp",
  powers: [augment({
    identity: "Bravery linked clamp",
    modifier: 3,
    linked: [{ attribute: "BRAVERY", modifier: 3 }],
    cooldown: 3,
  })],
});
const braveryD6 = runFixture({
  id: "22-bravery-d6-m5",
  profile: { ...SOLDIER_D8, braveryDie: "D6" },
  powers: [augment({ identity: "Bravery D6 M5", modifier: 5, cooldown: 2 })],
});
const braveryD10 = runFixture({
  id: "23-bravery-d10-m5",
  profile: { ...SOLDIER_D8, braveryDie: "D10" },
  powers: [augment({ identity: "Bravery D10 M5", modifier: 5, cooldown: 2 })],
});

const linkedIntellectBraveryPower = augment({
  identity: "Linked Intellect plus Bravery",
  attribute: "INTELLECT",
  modifier: 3,
  linked: [{ attribute: "BRAVERY", modifier: 2, potency: 2 }],
  cooldown: 3,
});
const linkedIntellectBravery = runFixture({
  id: "24-linked-intellect-bravery",
  powers: [linkedIntellectBraveryPower],
});
const competingIntellectPower = augment({
  identity: "Competing Intellect",
  attribute: "INTELLECT",
  modifier: 3,
  cooldown: 2,
});
const competingBraveryPower = augment({
  identity: "Competing Bravery",
  modifier: 3,
  cooldown: 2,
});
const competing = runFixture({
  id: "25-separate-intellect-bravery",
  powers: [competingIntellectPower, competingBraveryPower],
});
const boss = runFixture({
  id: "26-boss-fail-closed",
  tier: "BOSS",
  powers: [augment({ identity: "Boss Bravery", modifier: 3, cooldown: 2 })],
});
const recurrence = runFixture({
  id: "27-recurrence-fail-closed",
  powers: [augment({
    identity: "Recurring Bravery",
    modifier: 3,
    cooldown: 2,
    timing: "START_OF_TURN",
  })],
});
const legacyPower = augment({ identity: "Legacy Bravery", modifier: 3, cooldown: 2 });
legacyPower.effectPackets[0]!.modifier = null;
legacyPower.intentions = legacyPower.effectPackets;
const legacy = runFixture({ id: "28-legacy-only", powers: [legacyPower] });
const mixedPower = augment({
  identity: "Mixed Bravery",
  modifier: 3,
  cooldown: 2,
  linked: [{ attribute: "BRAVERY", modifier: 2 }],
});
mixedPower.effectPackets[1]!.modifier = null;
mixedPower.intentions = mixedPower.effectPackets;
const mixed = runFixture({ id: "29-mixed-semantic-legacy", powers: [mixedPower] });
const unsupportedLevel = runFixture({
  id: "30-unsupported-level",
  level: 4,
  powers: [augment({ identity: "Level four Bravery", modifier: 3, cooldown: 2 })],
});

near("13. M1 expires before the locked post-turn attack", braveryM1.preventedHarm, 0);
near("14. M3 two-turn prevented harm anchor", braveryM3.preventedHarm, 2.402167394757271);
near("15. M5 two-turn prevented harm anchor", braveryM5.preventedHarm, 3.371533378958702);
near("16. M3 four-turn prevented harm anchor", braveryLong.preventedHarm, 4.4700125232338905);
near("17. Prepared Passive M4 anchor", braveryPrepared.preventedHarm, 6.042268127202988);
near("18. Inactive Passive M4 anchor", braveryInactive.preventedHarm, 6.31711120459871);
near("19. ACTIVE snapshot M4 anchor", braverySnapshot.preventedHarm, 7.657527923583984);
near("20. Linked Bravery M3 plus M2 anchor", braveryLinked.preventedHarm, 3.371533378958702);
near("21. Linked Bravery clamp anchor", braveryClamp.preventedHarm, 3.371533378958702);
near("22. D6 baseline plus M5 anchor", braveryD6.preventedHarm, 2.96295166015625);
near("23. D10 baseline plus M5 anchor", braveryD10.preventedHarm, 3.04756142578125);
near(
  "24. Linked Intellect plus Bravery anchor",
  linkedIntellectBravery.preventedHarm,
  1.8662625923752785,
);
near("25. Competing Intellect and Bravery anchor", competing.preventedHarm, 2.402167394757271);
check("14. M3 two-turn Bravery prevents mental harm", braveryM3.preventedHarm > 0);
check("16. Longer duration does not reduce prevention", braveryLong.preventedHarm >= braveryM3.preventedHarm);
check(
  "17-19. Passive modes remain distinct",
  new Set([
    braveryPrepared.preventedHarm,
    braveryInactive.preventedHarm,
    braverySnapshot.preventedHarm,
  ]).size === 3,
);
check(
  "18. Inactive failure and retry expands exact branches",
  braveryInactive.performance.transitionBranches > braveryPrepared.performance.transitionBranches,
);
check(
  "18. Failed Inactive attempts consume the Power lane and may retry",
  braveryInactive.expectedPowerActions > braveryPrepared.expectedPowerActions &&
    braveryInactive.expectedPowerActions === braveryInactive.expectedActivations &&
    braveryPrepared.expectedPowerActions === 0,
);
check(
  "19. ACTIVE snapshot consumes no measured Power Action",
  braverySnapshot.expectedPowerActions === 0 && braverySnapshot.expectedActivations === 0,
);
near("20-21. Same-attribute linked total clamps at +5", braveryClamp.preventedHarm, braveryLinked.preventedHarm);
check("22-23. Actual Bravery die remains authoritative", braveryD6.preventedHarm !== braveryD10.preventedHarm);
check("24. Linked Intellect and Bravery uses one inherited source result", linkedIntellectBravery.preventedHarm > 0);
check("24. Linked Intellect remains zero-credit diagnostic", hasIntellectDiagnostic(linkedIntellectBravery));
check(
  "25. Separate powers enter one exact Power-lane optimiser",
  competing.performance.choiceCount > braveryM3.performance.choiceCount,
);
check(
  "26. Boss fails closed",
  boss.mode === "FAIL_CLOSED" &&
    boss.diagnostics.some(
      (diagnostic) =>
        diagnostic.code ===
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.bossActionEconomyUnresolved,
    ),
);
check(
  "27. Recurrence fails closed",
  recurrence.mode === "FAIL_CLOSED" &&
    recurrence.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedRecurrence,
    ),
);
check("28. Legacy-only content retains legacy path", legacy.mode === "NONE");
check(
  "29. Mixed semantic and legacy fails closed",
  mixed.mode === "FAIL_CLOSED" &&
    mixed.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.mixedSemanticLegacy,
    ),
);
check(
  "30. Unsupported level fails closed",
  unsupportedLevel.mode === "FAIL_CLOSED" &&
    unsupportedLevel.diagnostics.some(
      (diagnostic) => diagnostic.code === SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedLevel,
    ),
);

const missingIdentity = runFixture({
  id: "diagnostic-missing-identity",
  powers: [augment({
    identity: "Missing identity Bravery",
    modifier: 3,
    cooldown: 2,
    packetIdOverride: null,
  })],
});
check(
  "Missing identity fails closed",
  missingIdentity.mode === "FAIL_CLOSED" &&
    missingIdentity.diagnostics.some(
      (diagnostic) => diagnostic.code === SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.missingIdentity,
    ),
);
const missingCooldown = runFixture({
  id: "diagnostic-missing-cooldown",
  powers: [augment({ identity: "Missing cooldown Bravery", modifier: 3, cooldown: 2 })],
  includeAuthority: false,
});
check(
  "Missing cooldown authority fails closed",
  missingCooldown.mode === "FAIL_CLOSED" &&
    missingCooldown.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.missingCooldownAuthority,
    ),
);
const missingSnapshotPower = augment({
  identity: "Missing Bravery snapshot",
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
  missingSnapshot.mode === "FAIL_CLOSED" &&
    missingSnapshot.diagnostics.some(
      (diagnostic) =>
        diagnostic.code ===
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.activeSnapshotMissingSuccesses,
    ),
);
const malformedSnapshot = runFixture({
  id: "diagnostic-malformed-snapshot",
  powers: [missingSnapshotPower],
  passiveState: "ACTIVE_SNAPSHOT",
  snapshots: { [missingSnapshotPower.id!]: -1 },
});
check(
  "Malformed ACTIVE snapshot fails closed",
  malformedSnapshot.mode === "FAIL_CLOSED" &&
    malformedSnapshot.diagnostics.some(
      (diagnostic) =>
        diagnostic.code ===
        SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.activeSnapshotInvalidSuccesses,
    ),
);
const responsePower = augment({ identity: "Response Bravery", modifier: 3, cooldown: 2 });
responsePower.counterMode = "YES";
const response = runFixture({ id: "diagnostic-response", powers: [responsePower] });
check(
  "Response Bravery fails closed",
  response.mode === "FAIL_CLOSED" &&
    response.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
    ),
);
const fieldPower = augment({ identity: "Field Bravery", modifier: 3, cooldown: 2 });
fieldPower.descriptorChassis = "FIELD";
const field = runFixture({ id: "diagnostic-field", powers: [fieldPower] });
check(
  "Unsupported chassis fails closed",
  field.mode === "FAIL_CLOSED" &&
    field.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
    ),
);
const orderingPower = augment({ identity: "Ordering Bravery", modifier: 3, cooldown: 2 });
orderingPower.effectPackets.push(
  packet({
    identity: "Ordering unrelated payload",
    intention: "DEFENCE",
    packetIndex: 1,
    modifier: null,
  }),
);
orderingPower.intentions = orderingPower.effectPackets;
const ordering = runFixture({ id: "diagnostic-ordering", powers: [orderingPower] });
check(
  "Context-dependent ordering fails closed",
  ordering.mode === "FAIL_CLOSED" &&
    ordering.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.unsupportedOrdering,
    ),
);
const noReferencePower = augment({ identity: "No reference Bravery", modifier: 3, cooldown: 2 });
const noReference = computeLevel3SelfBraverySurvivability({
  level: 3,
  tier: "SOLDIER",
  braveryDieSides: 8,
  intellectDieSides: 8,
  mentalDefenceDice: 3,
  blockPerSuccess: 1,
  powers: [{
    id: noReferencePower.id,
    authoredPower: noReferencePower,
    cooldownAuthority: noReferencePower.cooldownAuthority,
  }],
  tuning: { ...calculatorConfig.durabilityAxisTuning, referenceIncomingDiceCount: 0 },
});
check(
  "Missing mental incoming reference fails closed",
  noReference.mode === "FAIL_CLOSED" &&
    noReference.diagnostics.some(
      (diagnostic) => diagnostic.code === SELF_BRAVERY_SURVIVABILITY_DIAGNOSTIC.noReferenceAttack,
    ),
);
const plateauProfile: MentalProfile = { ...SOLDIER_D8, braveryDie: "D4" };
const plateauM3 = runFixture({
  id: "invariant-d4-m3-plateau",
  profile: plateauProfile,
  powers: [augment({ identity: "D4 Bravery M3 plateau", modifier: 3, cooldown: 2 })],
});
const plateauM5 = runFixture({
  id: "invariant-d4-m5-plateau",
  profile: plateauProfile,
  powers: [augment({ identity: "D4 Bravery M5 plateau", modifier: 5, cooldown: 2 })],
});
near(
  "M5 need not exceed M3 when actual die thresholds plateau",
  plateauM5.preventedHarm,
  plateauM3.preventedHarm,
);
const duplicatePacketPower = augment({
  identity: "Duplicate Bravery packet",
  modifier: 3,
  cooldown: 2,
  linked: [{ attribute: "BRAVERY", modifier: 3 }],
});
duplicatePacketPower.effectPackets[1]!.id = duplicatePacketPower.effectPackets[0]!.id;
duplicatePacketPower.intentions = duplicatePacketPower.effectPackets;
const duplicatePacket = runFixture({
  id: "invariant-duplicate-packet",
  powers: [duplicatePacketPower],
});
near(
  "Duplicate stable packet identity counts once",
  duplicatePacket.preventedHarm,
  braveryM3.preventedHarm,
);
const crossClampM5 = runFixture({
  id: "invariant-cross-attribute-clamp",
  powers: [augment({
    identity: "Linked Intellect M5 plus Bravery M2",
    attribute: "INTELLECT",
    modifier: 5,
    linked: [{ attribute: "BRAVERY", modifier: 2, potency: 2 }],
    cooldown: 3,
  })],
});
near(
  "Intellect and Bravery do not share a clamp group",
  crossClampM5.preventedHarm,
  linkedIntellectBravery.preventedHarm,
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
    name: "SELF Bravery production path",
    level: 3,
    tier: "SOLDIER",
    legendary: false,
    physicalResilienceCurrent: 18,
    physicalResilienceMax: 18,
    mentalPerseveranceCurrent: 18,
    mentalPerseveranceMax: 18,
    physicalProtection: 1,
    mentalProtection: 3,
    naturalPhysicalProtection: 1,
    naturalMentalProtection: 3,
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
    weaponSkillValue: 3,
    weaponSkillModifier: 0,
    armorSkillValue: 3,
    armorSkillModifier: 0,
    tags: [],
    traits: [],
    attacks: [],
    naturalAttack: null,
    powers,
  } as unknown as MonsterUpsertInput;
}

function canonicalContribution(powers: Power[]): CanonicalPowerContribution {
  const entries = powers.map((candidate) => {
    const axes = zeroAxes();
    const packets = candidate.effectPackets ?? [];
    if (packets.some((entry) => entry.targetedAttribute === "BRAVERY")) {
      axes.mentalSurvivability = 9;
    }
    if (packets.some((entry) => entry.targetedAttribute === "INTELLECT")) {
      axes.manipulation = 7;
    }
    return {
      id: candidate.id,
      name: candidate.name,
      axisVector: axes,
      basePowerValue: 16,
      authoredPower: candidate,
      cooldownAuthority: candidate.cooldownAuthority,
      derivedCooldownTurns: candidate.cooldownAuthority?.effectiveCooldownTurns ?? null,
    };
  });
  const aggregate = entries.reduce(
    (sum, entry) => {
      for (const axis of Object.keys(sum) as Array<keyof RadarAxes>) {
        sum[axis] += entry.axisVector[axis];
      }
      return sum;
    },
    zeroAxes(),
  );
  return {
    axisVector: aggregate,
    basePowerValue: powers.length * 16,
    powerCount: powers.length,
    powers: entries,
  };
}

const productionBaseline = computeMonsterOutcomes(baseMonster([]), calculatorConfig);
const productionBravery = augment({
  identity: "Production Bravery",
  modifier: 3,
  durationTurns: 4,
  cooldown: 3,
});
const productionBraveryOutcome = computeMonsterOutcomes(
  baseMonster([productionBravery]),
  calculatorConfig,
  { powerContribution: canonicalContribution([productionBravery]) },
);
const productionIntellect = augment({
  identity: "Production Intellect",
  attribute: "INTELLECT",
  modifier: 3,
  durationTurns: 4,
  cooldown: 3,
});
const productionIntellectOutcome = computeMonsterOutcomes(
  baseMonster([productionIntellect]),
  calculatorConfig,
  { powerContribution: canonicalContribution([productionIntellect]) },
);

type ProductionDebug = {
  powerContribution: {
    effectivePowerAxisVector: RadarAxes;
    semanticSelfBraverySurvivabilityReplacement: {
      excludedCostDerivedMentalSurvivability: number;
      excludedSelfIntellectCostAxes: { manipulation: number };
      model: SelfBraverySurvivabilityResult;
    };
  };
  normalizationBreakdown: {
    durabilityAxisBaselineModel: {
      mentalSurvivability: {
        supplementalContributions: { semanticBravery: number };
        supplementalRatio: number;
      };
    };
  };
};
const braveryDebug = productionBraveryOutcome.debug as ProductionDebug;
const intellectDebug = productionIntellectOutcome.debug as ProductionDebug;
check(
  "Eligible Bravery cost-derived Mental Survivability is removed",
  braveryDebug.powerContribution.semanticSelfBraverySurvivabilityReplacement
    .excludedCostDerivedMentalSurvivability > 0 &&
    braveryDebug.powerContribution.effectivePowerAxisVector.mentalSurvivability === 0,
);
check(
  "Semantic Bravery enters the existing supplemental lane once",
  braveryDebug.normalizationBreakdown.durabilityAxisBaselineModel.mentalSurvivability
    .supplementalContributions.semanticBravery > 0,
);
check(
  "Semantic Bravery increases only Mental Survivability",
  productionBraveryOutcome.radarAxes.mentalSurvivability >
    productionBaseline.radarAxes.mentalSurvivability,
);
for (const axis of [
  "physicalThreat",
  "mentalThreat",
  "physicalSurvivability",
  "manipulation",
  "synergy",
  "mobility",
  "presence",
] as const) {
  near(
    `Production Bravery leaves ${axis} unchanged`,
    productionBraveryOutcome.radarAxes[axis],
    productionBaseline.radarAxes[axis],
    1e-9,
  );
}
check(
  "Eligible Intellect cost-derived Manipulation is explicitly suppressed",
  intellectDebug.powerContribution.semanticSelfBraverySurvivabilityReplacement
    .excludedSelfIntellectCostAxes.manipulation > 0 &&
    intellectDebug.powerContribution.effectivePowerAxisVector.manipulation === 0,
);
check(
  "Production Intellect exposes zero-credit diagnostic",
  hasIntellectDiagnostic(
    intellectDebug.powerContribution.semanticSelfBraverySurvivabilityReplacement.model,
  ),
);
for (const axis of Object.keys(zeroAxes()) as Array<keyof RadarAxes>) {
  near(
    `Production Intellect leaves ${axis} unchanged`,
    productionIntellectOutcome.radarAxes[axis],
    productionBaseline.radarAxes[axis],
    1e-9,
  );
}

const permanentDerivedBefore = {
  dodge: getDodgeValue("D8", "D8", 3, 1),
  willpower: getWillpowerDiceCountFromAttributes("D8", "D8"),
  weaponSkill: getWeaponSkillDiceCountFromAttributes("D8", "D8"),
  mentalHp: baseMonster([]).mentalPerseveranceMax,
};
const permanentDerivedWithIntellectPower = {
  dodge: getDodgeValue("D8", "D8", 3, 1),
  willpower: getWillpowerDiceCountFromAttributes("D8", "D8"),
  weaponSkill: getWeaponSkillDiceCountFromAttributes("D8", "D8"),
  mentalHp: baseMonster([productionIntellect]).mentalPerseveranceMax,
};
check(
  "Temporary Intellect does not recalculate Dodge, Willpower, Weapon Skill, or mental HP",
  JSON.stringify(permanentDerivedBefore) === JSON.stringify(permanentDerivedWithIntellectPower),
);
check(
  "Temporary Bravery changes Mental Defence results without changing hydrated dice count",
  braveryM3.preventedHarm > 0 &&
    braveryM3.policy.hydratedMentalDefenceDice === control.policy.hydratedMentalDefenceDice &&
    braveryM3.policy.hydratedMentalDefenceDice === SOLDIER_D8.mentalDefenceDice &&
    braveryM3.policy.braveryDieSides === 8,
);
check(
  "Cleanup, Resist, Dodge, and Major Injury are excluded",
  braveryM3.policy.cleanupContribution === 0 &&
    braveryM3.policy.resistContribution === 0 &&
    braveryM3.policy.dodgeContribution === 0 &&
    braveryM3.policy.majorInjuryContribution === 0,
);
check(
  "Configured supplemental maximum is reused",
  braveryM3.policy.supplementalContributionMaxRatio ===
    calculatorConfig.durabilityAxisTuning.supplementalContributionMaxRatio,
);
check(
  "Exactly 30 numbered fixtures were recorded",
  fixtures.filter((fixture) => /^\d\d-/.test(fixture.id)).length === 30,
);

const numberedFixtures = fixtures.filter((fixture) => /^\d\d-/.test(fixture.id));
const maximumStates = Math.max(
  ...numberedFixtures.map((fixture) => fixture.model.performance.memoizedStateCount),
);
const maximumBranches = Math.max(
  ...numberedFixtures.map((fixture) => fixture.model.performance.transitionBranches),
);
const maximumRuntimeMs = Math.max(...numberedFixtures.map((fixture) => fixture.runtimeMs));
const calculatorRuntimeSamples = Array.from({ length: 25 }, () => {
  const started = performance.now();
  computeMonsterOutcomes(baseMonster([productionBravery]), calculatorConfig, {
    powerContribution: canonicalContribution([productionBravery]),
  });
  return performance.now() - started;
}).sort((left, right) => left - right);
const typicalCalculatorRuntimeMs = calculatorRuntimeSamples[
  Math.floor(calculatorRuntimeSamples.length / 2)
]!;
const maximumCalculatorRuntimeMs = calculatorRuntimeSamples.at(-1)!;
check("Reference suite stays below 1000 memoized states", maximumStates < 1000);
check("Reference suite stays below 5000 transition branches", maximumBranches < 5000);
check("Typical production calculator call stays below 50ms", typicalCalculatorRuntimeMs < 50);

console.log(
  JSON.stringify(
    {
      fixtureCount: numberedFixtures.length,
      assertionCount: assertions,
      maximumStates,
      maximumBranches,
      maximumRuntimeMs,
      typicalCalculatorRuntimeMs,
      maximumCalculatorRuntimeMs,
      anchors: Object.fromEntries(
        numberedFixtures.map((fixture) => [fixture.id, {
          mode: fixture.model.mode,
          fiveTurnHarmWithout: fixture.model.fiveTurnHarmWithout,
          fiveTurnHarmWith: fixture.model.fiveTurnHarmWith,
          preventedHarm: fixture.model.preventedHarm,
          semanticSupplementalRatio: fixture.model.semanticSupplementalRatio,
          diagnostics: fixture.model.diagnostics.map((diagnostic) => diagnostic.code),
          states: fixture.model.performance.memoizedStateCount,
          branches: fixture.model.performance.transitionBranches,
        }]),
      ),
    },
    null,
    2,
  ),
);
console.log(
  `selfBraverySurvivabilityLevel3.smoke.ts passed (${assertions} assertions, ${numberedFixtures.length} fixtures).`,
);
