import type {
  CoreAttribute,
  EffectPacket,
  HostileEntryPattern,
  MonsterPower,
  MonsterPowerIntentionType,
  PrimaryDefenceGate,
  ProtectionChannel,
} from "@/lib/summoning/types";

export type ApprovedCanaryId =
  | "simple_melee_attack"
  | "simple_ranged_attack"
  | "attached_self_buff"
  | "grasping_field"
  | "barbed_brand"
  | "deferred_mark"
  | "trigger_ward"
  | "held_bolt"
  | "crippling_surge"
  | "searing_lockdown"
  | "channelled_bulwark";

export type ApprovedCanaryScenarioCategory = "solo" | "pair" | "stress";

export type ApprovedCanaryScenarioId =
  | ApprovedCanaryId
  | "baseline_delivery_split"
  | "self_buff_package"
  | "area_control_package"
  | "attached_entry_split"
  | "delay_pressure_package"
  | "self_rider_interaction"
  | "recurring_pressure_split"
  | "triggered_defence_test"
  | "control_lock_suite"
  | "delayed_punishment_suite"
  | "self_fortress_suite"
  | "mixed_toolkit_suite"
  | "recurrence_delay_suite"
  | "full_branch_sweep";

export type ApprovedCanaryPowerEntry = {
  id: ApprovedCanaryId;
  label: string;
  purpose: string;
  description: string;
  power: MonsterPower;
};

export type ApprovedCanaryScenario = {
  id: ApprovedCanaryScenarioId;
  label: string;
  category: ApprovedCanaryScenarioCategory;
  powerIds: ApprovedCanaryId[];
  purpose: string;
  checks: string[];
};

function createCanaryPacket(
  intention: MonsterPowerIntentionType,
  sortOrder: number,
  overrides: Partial<EffectPacket> = {},
): EffectPacket {
  const detailsJson =
    overrides.detailsJson && typeof overrides.detailsJson === "object"
      ? { ...(overrides.detailsJson as Record<string, unknown>) }
      : {};

  return {
    hostility: intention === "ATTACK" || intention === "CONTROL" || intention === "DEBUFF"
      ? "HOSTILE"
      : "NON_HOSTILE",
    applyTo: "PRIMARY_TARGET",
    triggerConditionText: null,
    effectTimingType: "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: "INSTANT",
    effectDurationTurns: null,
    ...overrides,
    sortOrder,
    packetIndex: sortOrder,
    type: intention,
    intention,
    detailsJson,
  };
}

function getCoreAttributeFromStatTarget(value: unknown): CoreAttribute | null {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized === "ARMOR_SKILL" || normalized === "DODGE" || normalized === "WILLPOWER") {
    return "GUARD";
  }
  if (
    normalized === "ATTACK" ||
    normalized === "GUARD" ||
    normalized === "DEFENCE" ||
    normalized === "FORTITUDE" ||
    normalized === "INTELLECT" ||
    normalized === "SYNERGY" ||
    normalized === "SUPPORT" ||
    normalized === "BRAVERY"
  ) {
    if (normalized === "DEFENCE") return "GUARD";
    if (normalized === "SUPPORT") return "SYNERGY";
    return normalized as CoreAttribute;
  }
  return null;
}

function getControlThemeResistAttribute(value: unknown): CoreAttribute | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "BODY_ENDURANCE") return "FORTITUDE";
  if (normalized === "MIND_COGNITION") return "INTELLECT";
  if (normalized === "COURAGE_RESOLVE") return "BRAVERY";
  if (normalized === "TRUST_BELONGING") return "SYNERGY";
  if (normalized === "OFFENSIVE_EXECUTION") return "ATTACK";
  if (normalized === "DEFENSIVE_COORDINATION") return "GUARD";
  return null;
}

function createPrimaryGate(
  packet: EffectPacket,
  hostileEntryPattern: HostileEntryPattern | null = null,
): PrimaryDefenceGate {
  const details = packet.detailsJson as Record<string, unknown>;
  let gateResult: PrimaryDefenceGate["gateResult"] = "NONE";
  let protectionChannel: ProtectionChannel | null = null;
  let resistAttribute: CoreAttribute | null = null;

  if (packet.intention === "ATTACK") {
    gateResult = "DODGE_OR_PROTECTION";
    protectionChannel =
      String(details.attackMode ?? "PHYSICAL").trim().toUpperCase() === "MENTAL"
        ? "MENTAL"
        : "PHYSICAL";
  } else if (packet.intention === "CONTROL") {
    gateResult = "RESIST";
    resistAttribute = getControlThemeResistAttribute(details.controlTheme);
  } else if (packet.intention === "DEBUFF") {
    gateResult = "RESIST";
    resistAttribute = getCoreAttributeFromStatTarget(details.statTarget ?? details.statChoice);
  }

  return {
    sourcePacketIndex: packet.packetIndex ?? 0,
    gateResult,
    protectionChannel,
    resistAttribute,
    hostileEntryPattern,
    resolutionSource: hostileEntryPattern ? "EXPLICIT" : "INFERRED",
  };
}

function createCanaryPower(
  config: Omit<
    Partial<MonsterPower>,
    "cooldownTurns" | "cooldownReduction" | "effectPackets" | "intentions" | "name"
  > & {
    name: string;
    effectPackets: EffectPacket[];
    cooldownTurns?: number;
    cooldownReduction?: number;
  },
): MonsterPower {
  const primaryPacket = config.effectPackets[0];
  const primaryGate = config.primaryDefenceGate ?? createPrimaryGate(primaryPacket);
  const primaryDurationType = primaryPacket.effectDurationType ?? "INSTANT";
  const primaryDurationTurns =
    primaryDurationType === "TURNS" ? (primaryPacket.effectDurationTurns ?? 1) : null;

  return {
    sortOrder: config.sortOrder ?? 0,
    name: config.name,
    description: config.description ?? null,
    descriptorChassis: config.descriptorChassis,
    descriptorChassisConfig: config.descriptorChassisConfig ?? {},
    chargeType: config.chargeType ?? null,
    chargeTurns: config.chargeTurns ?? null,
    chargeBonusDicePerTurn: config.chargeBonusDicePerTurn ?? null,
    diceCount: Number(primaryPacket.diceCount ?? config.diceCount ?? 1),
    potency: Number(primaryPacket.potency ?? config.potency ?? 1),
    effectDurationType: primaryDurationType,
    effectDurationTurns: primaryDurationTurns,
    durationType: primaryDurationType,
    durationTurns: primaryDurationTurns,
    lifespanType: config.lifespanType ?? "NONE",
    lifespanTurns: config.lifespanTurns ?? null,
    primaryDefenceGate: primaryGate,
    defenceRequirement: primaryGate.gateResult,
    cooldownTurns: config.cooldownTurns ?? 1,
    cooldownReduction: config.cooldownReduction ?? 0,
    counterMode: config.counterMode ?? "NO",
    commitmentModifier: config.commitmentModifier ?? "STANDARD",
    triggerMethod: config.triggerMethod ?? null,
    attachedHostAnchorType: config.attachedHostAnchorType ?? null,
    rangeCategories: config.rangeCategories ? [...config.rangeCategories] : [],
    meleeTargets: config.meleeTargets ?? null,
    rangedTargets: config.rangedTargets ?? null,
    rangedDistanceFeet: config.rangedDistanceFeet ?? null,
    aoeCenterRangeFeet: config.aoeCenterRangeFeet ?? null,
    aoeCount: config.aoeCount ?? null,
    aoeShape: config.aoeShape ?? null,
    aoeSphereRadiusFeet: config.aoeSphereRadiusFeet ?? null,
    aoeConeLengthFeet: config.aoeConeLengthFeet ?? null,
    aoeLineWidthFeet: config.aoeLineWidthFeet ?? null,
    aoeLineLengthFeet: config.aoeLineLengthFeet ?? null,
    effectPackets: config.effectPackets.map((packet) => ({ ...packet })),
    intentions: config.effectPackets.map((packet) => ({ ...packet })),
  };
}

function clonePower(power: MonsterPower): MonsterPower {
  return structuredClone(power);
}

const simpleMeleeAttack = createCanaryPacket("ATTACK", 0, {
  hostility: "HOSTILE",
  diceCount: 1,
  potency: 1,
  effectTimingType: "ON_CAST",
  effectDurationType: "INSTANT",
  effectDurationTurns: null,
  applyTo: "PRIMARY_TARGET",
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Blunt"],
  },
});

const simpleRangedAttack = createCanaryPacket("ATTACK", 0, {
  hostility: "HOSTILE",
  diceCount: 1,
  potency: 1,
  effectTimingType: "ON_CAST",
  effectDurationType: "INSTANT",
  effectDurationTurns: null,
  applyTo: "PRIMARY_TARGET",
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Piercing"],
  },
});

const attachedSelfBuffDefence = createCanaryPacket("AUGMENT", 0, {
  hostility: "NON_HOSTILE",
  diceCount: 1,
  potency: 1,
  effectTimingType: "ON_ATTACH",
  effectDurationType: "TURNS",
  effectDurationTurns: 2,
  applyTo: "SELF",
  detailsJson: {
    rangeCategory: "SELF",
    statTarget: "Guard",
  },
});

const attachedSelfBuffFortitude = createCanaryPacket("AUGMENT", 1, {
  hostility: "NON_HOSTILE",
  diceCount: 1,
  potency: 1,
  effectTimingType: "ON_ATTACH",
  effectDurationType: "TURNS",
  effectDurationTurns: 2,
  applyTo: "SELF",
  detailsJson: {
    rangeCategory: "SELF",
    statTarget: "Fortitude",
  },
});

const graspingFieldControl = createCanaryPacket("CONTROL", 0, {
  hostility: "HOSTILE",
  diceCount: 1,
  potency: 1,
  effectTimingType: "ON_TRIGGER",
  triggerConditionText: "AREA_STARTS_TURN",
  effectDurationType: "TURNS",
  effectDurationTurns: 1,
  applyTo: "PRIMARY_TARGET",
  detailsJson: {
    controlMode: "Force no move",
    controlTheme: "BODY_ENDURANCE",
  },
});

const barbedBrandAttack = createCanaryPacket("ATTACK", 0, {
  hostility: "HOSTILE",
  diceCount: 2,
  potency: 2,
  effectTimingType: "ON_ATTACH",
  effectDurationType: "INSTANT",
  effectDurationTurns: null,
  applyTo: "PRIMARY_TARGET",
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Piercing"],
  },
});

const deferredMarkAttack = createCanaryPacket("ATTACK", 0, {
  hostility: "HOSTILE",
  diceCount: 2,
  potency: 1,
  effectTimingType: "ON_TRIGGER",
  triggerConditionText: "SUFFERS_WOUNDS",
  effectDurationType: "INSTANT",
  effectDurationTurns: null,
  applyTo: "PRIMARY_TARGET",
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Fire"],
  },
});

const triggerWardAttack = createCanaryPacket("ATTACK", 0, {
  hostility: "HOSTILE",
  diceCount: 3,
  potency: 1,
  effectTimingType: "ON_TRIGGER",
  triggerConditionText: "AREA_ENTERS",
  effectDurationType: "INSTANT",
  effectDurationTurns: null,
  applyTo: "PRIMARY_TARGET",
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Piercing"],
  },
});

const heldBoltAttack = createCanaryPacket("ATTACK", 0, {
  hostility: "HOSTILE",
  diceCount: 2,
  potency: 2,
  effectTimingType: "ON_RELEASE",
  effectDurationType: "INSTANT",
  effectDurationTurns: null,
  applyTo: "PRIMARY_TARGET",
  detailsJson: {
    attackMode: "MENTAL",
    damageTypes: ["Corruption"],
  },
});

const cripplingSurgeAttack = createCanaryPacket("ATTACK", 0, {
  hostility: "HOSTILE",
  diceCount: 2,
  potency: 1,
  effectTimingType: "ON_CAST",
  effectDurationType: "INSTANT",
  effectDurationTurns: null,
  applyTo: "PRIMARY_TARGET",
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Psychic"],
  },
});

const cripplingSurgeSelfRider = createCanaryPacket("AUGMENT", 1, {
  hostility: "NON_HOSTILE",
  diceCount: 1,
  potency: 1,
  effectTimingType: "ON_CAST",
  effectDurationType: "TURNS",
  effectDurationTurns: 1,
  applyTo: "SELF",
  detailsJson: {
    statTarget: "Guard",
    secondaryScalingMode: "PRIMARY_WOUND_BANDS",
  },
});

const searingLockdownAttack = createCanaryPacket("ATTACK", 0, {
  hostility: "HOSTILE",
  diceCount: 2,
  potency: 1,
  effectTimingType: "ON_ATTACH",
  effectDurationType: "TURNS",
  effectDurationTurns: 2,
  applyTo: "PRIMARY_TARGET",
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Fire"],
  },
});

const searingLockdownControl = createCanaryPacket("CONTROL", 1, {
  hostility: "HOSTILE",
  diceCount: 1,
  potency: 1,
  effectTimingType: "START_OF_TURN",
  effectDurationType: "INSTANT",
  effectDurationTurns: null,
  applyTo: "PRIMARY_TARGET",
  detailsJson: {
    controlMode: "Force no move",
    controlTheme: "BODY_ENDURANCE",
    secondaryScalingMode: "PRIMARY_WOUND_BANDS",
  },
});

const searingLockdownDebuff = createCanaryPacket("DEBUFF", 2, {
  hostility: "HOSTILE",
  diceCount: 1,
  potency: 1,
  effectTimingType: "START_OF_TURN",
  effectDurationType: "INSTANT",
  effectDurationTurns: null,
  applyTo: "PRIMARY_TARGET",
  detailsJson: {
    statTarget: "Guard",
    secondaryScalingMode: "PRIMARY_WOUND_BANDS",
  },
});

const channelledBulwarkAugment = createCanaryPacket("AUGMENT", 0, {
  hostility: "NON_HOSTILE",
  diceCount: 1,
  potency: 1,
  effectTimingType: "START_OF_TURN_WHILST_CHANNELLED",
  effectDurationType: "TURNS",
  effectDurationTurns: 1,
  applyTo: "SELF",
  detailsJson: {
    rangeCategory: "SELF",
    statTarget: "Guard",
  },
});

export const APPROVED_CANARY_POWERS: ApprovedCanaryPowerEntry[] = [
  {
    id: "simple_melee_attack",
    label: "Simple Melee Attack",
    purpose: "Cheapest truthful melee baseline",
    description: "A 1 target melee strike",
    power: createCanaryPower({
      name: "Simple Melee Attack",
      description: "A 1 target melee strike",
      descriptorChassis: "IMMEDIATE",
      counterMode: "NO",
      commitmentModifier: "STANDARD",
      rangeCategories: ["MELEE"],
      meleeTargets: 1,
      effectPackets: [simpleMeleeAttack],
    }),
  },
  {
    id: "simple_ranged_attack",
    label: "Simple Ranged Attack",
    purpose: "Cheapest truthful ranged baseline",
    description: "A 1 target ranged attack",
    power: createCanaryPower({
      name: "Simple Ranged Attack",
      description: "A 1 target ranged attack",
      descriptorChassis: "IMMEDIATE",
      counterMode: "NO",
      commitmentModifier: "STANDARD",
      rangeCategories: ["RANGED"],
      rangedDistanceFeet: 30,
      rangedTargets: 1,
      effectPackets: [simpleRangedAttack],
    }),
  },
  {
    id: "attached_self_buff",
    label: "Attached Self Buff",
    purpose: "Simple self-hosted Attached buff, same-moment multi-packet self utility",
    description: "A simple 2-packet self buff on an attached chassis",
    power: createCanaryPower({
      name: "Attached Self Buff",
      description: "A simple 2-packet self buff on an attached chassis",
      descriptorChassis: "ATTACHED",
      counterMode: "NO",
      commitmentModifier: "STANDARD",
      lifespanType: "TURNS",
      lifespanTurns: 2,
      attachedHostAnchorType: "SELF",
      rangeCategories: [],
      effectPackets: [attachedSelfBuffDefence, attachedSelfBuffFortitude],
    }),
  },
  {
    id: "grasping_field",
    label: "Grasping Field",
    purpose: "Recurring area control baseline",
    description: "Field canary for recurring area control",
    power: createCanaryPower({
      name: "Grasping Field",
      description: "Field canary for recurring area control",
      descriptorChassis: "FIELD",
      counterMode: "NO",
      commitmentModifier: "STANDARD",
      lifespanType: "TURNS",
      lifespanTurns: 3,
      rangeCategories: ["AOE"],
      aoeCenterRangeFeet: 30,
      aoeCount: 1,
      aoeShape: "SPHERE",
      aoeSphereRadiusFeet: 10,
      effectPackets: [graspingFieldControl],
    }),
  },
  {
    id: "barbed_brand",
    label: "Barbed Brand",
    purpose: "Explicit hostile gate-on-attach test",
    description: "Attached canary for explicit hostile gate-on-attach entry",
    power: createCanaryPower({
      name: "Barbed Brand",
      description: "Attached canary for explicit hostile gate-on-attach entry",
      descriptorChassis: "ATTACHED",
      counterMode: "NO",
      commitmentModifier: "STANDARD",
      lifespanType: "TURNS",
      lifespanTurns: 3,
      attachedHostAnchorType: "TARGET",
      rangeCategories: ["RANGED"],
      rangedDistanceFeet: 60,
      rangedTargets: 1,
      primaryDefenceGate: createPrimaryGate(barbedBrandAttack, "ON_ATTACH"),
      effectPackets: [barbedBrandAttack],
    }),
  },
  {
    id: "deferred_mark",
    label: "Deferred Mark",
    purpose: "Explicit hostile gate-on-payload test",
    description: "Attached canary for explicit hostile gate-on-payload entry",
    power: createCanaryPower({
      name: "Deferred Mark",
      description: "Attached canary for explicit hostile gate-on-payload entry",
      descriptorChassis: "ATTACHED",
      counterMode: "NO",
      commitmentModifier: "STANDARD",
      lifespanType: "TURNS",
      lifespanTurns: 3,
      attachedHostAnchorType: "TARGET",
      rangeCategories: ["RANGED"],
      rangedDistanceFeet: 60,
      rangedTargets: 1,
      descriptorChassisConfig: {
        payloadTriggerText: "SUFFERS_WOUNDS",
      },
      primaryDefenceGate: createPrimaryGate(deferredMarkAttack, "ON_PAYLOAD"),
      effectPackets: [deferredMarkAttack],
    }),
  },
  {
    id: "trigger_ward",
    label: "Trigger Ward",
    purpose: "Arm-first trigger resolution, area trigger legality, Counter coverage",
    description: "Trigger canary for arm-first trigger resolution",
    power: createCanaryPower({
      name: "Trigger Ward",
      description: "Trigger canary for arm-first trigger resolution",
      descriptorChassis: "TRIGGER",
      counterMode: "YES",
      commitmentModifier: "STANDARD",
      lifespanType: "TURNS",
      lifespanTurns: 2,
      triggerMethod: "ARM_AND_THEN_TARGET",
      rangeCategories: ["AOE"],
      aoeCenterRangeFeet: 0,
      aoeCount: 1,
      aoeShape: "SPHERE",
      aoeSphereRadiusFeet: 10,
      effectPackets: [triggerWardAttack],
    }),
  },
  {
    id: "held_bolt",
    label: "Held Bolt",
    purpose: "Reserve delayed-cast priming and held release",
    description: "Reserve canary for delayed-cast priming and held release",
    power: createCanaryPower({
      name: "Held Bolt",
      description: "Reserve canary for delayed-cast priming and held release",
      descriptorChassis: "RESERVE",
      counterMode: "NO",
      commitmentModifier: "CHARGE",
      chargeType: "DELAYED_RELEASE",
      chargeTurns: 2,
      lifespanType: "TURNS",
      lifespanTurns: 2,
      descriptorChassisConfig: {
        releaseBehaviour: "ACTION_ONLY",
      },
      rangeCategories: ["RANGED"],
      rangedDistanceFeet: 120,
      rangedTargets: 1,
      effectPackets: [heldBoltAttack],
    }),
  },
  {
    id: "crippling_surge",
    label: "Crippling Surge",
    purpose: "Hostile-primary into contingent self-rider",
    description: "Immediate canary for hostile-primary into contingent self-rider",
    power: createCanaryPower({
      name: "Crippling Surge",
      description: "Immediate canary for hostile-primary into contingent self-rider",
      descriptorChassis: "IMMEDIATE",
      counterMode: "NO",
      commitmentModifier: "STANDARD",
      rangeCategories: ["RANGED"],
      rangedDistanceFeet: 30,
      rangedTargets: 1,
      effectPackets: [cripplingSurgeAttack, cripplingSurgeSelfRider],
    }),
  },
  {
    id: "searing_lockdown",
    label: "Searing Lockdown",
    purpose: "Attached carrier legality, recurrence, and follow-through scaling",
    description: "Attached canary for carrier legality, recurrence, and follow-through scaling",
    power: createCanaryPower({
      name: "Searing Lockdown",
      description: "Attached canary for carrier legality, recurrence, and follow-through scaling",
      descriptorChassis: "ATTACHED",
      counterMode: "NO",
      commitmentModifier: "STANDARD",
      lifespanType: "TURNS",
      lifespanTurns: 2,
      attachedHostAnchorType: "TARGET",
      rangeCategories: ["RANGED"],
      rangedDistanceFeet: 30,
      rangedTargets: 1,
      primaryDefenceGate: createPrimaryGate(searingLockdownAttack, "ON_ATTACH"),
      effectPackets: [
        searingLockdownAttack,
        searingLockdownControl,
        searingLockdownDebuff,
      ],
    }),
  },
  {
    id: "channelled_bulwark",
    label: "Channelled Bulwark",
    purpose: "Simple Channel branch coverage on a self-hosted persistent buff",
    description: "Attached canary for Channel commitment on a self-hosted buff",
    power: createCanaryPower({
      name: "Channelled Bulwark",
      description: "Attached canary for Channel commitment on a self-hosted buff",
      descriptorChassis: "ATTACHED",
      counterMode: "NO",
      commitmentModifier: "CHANNEL",
      lifespanType: "TURNS",
      lifespanTurns: 2,
      attachedHostAnchorType: "SELF",
      rangeCategories: [],
      effectPackets: [channelledBulwarkAugment],
    }),
  },
];

const pairScenarios: ApprovedCanaryScenario[] = [
  {
    id: "baseline_delivery_split",
    label: "Baseline Delivery Split",
    category: "pair",
    powerIds: ["simple_melee_attack", "simple_ranged_attack"],
    purpose: "Baseline melee vs ranged delivery comparison",
    checks: ["shared range burden", "threat lane sanity", "no fake survivability/synergy"],
  },
  {
    id: "self_buff_package",
    label: "Self Buff Package",
    category: "pair",
    powerIds: ["attached_self_buff", "channelled_bulwark"],
    purpose: "Self-only survivability stacking without fake synergy",
    checks: ["self-only augment routing", "attached vs channel value", "survivability inflation"],
  },
  {
    id: "area_control_package",
    label: "Area Control Package",
    category: "pair",
    powerIds: ["grasping_field", "trigger_ward"],
    purpose: "Legal area pressure, trigger legality, control normalization",
    checks: [
      "field persistence",
      "arm-first trigger structure",
      "area trigger legality",
      "manipulation/control saturation",
      "no fake mobility",
    ],
  },
  {
    id: "attached_entry_split",
    label: "Attached Entry Split",
    category: "pair",
    powerIds: ["barbed_brand", "deferred_mark"],
    purpose: "Hostile gate-on-attach vs gate-on-payload split",
    checks: ["attached hostile entry pricing", "timing burden", "descriptor honesty"],
  },
  {
    id: "delay_pressure_package",
    label: "Delay Pressure Package",
    category: "pair",
    powerIds: ["deferred_mark", "held_bolt"],
    purpose: "Delayed threat structures across two chassis models",
    checks: ["attached delayed payload", "reserve delayed release", "charge turns", "delayed pressure value"],
  },
  {
    id: "self_rider_interaction",
    label: "Self Rider Interaction",
    category: "pair",
    powerIds: ["crippling_surge", "attached_self_buff"],
    purpose: "Hostile-primary into self-beneficial interaction",
    checks: [
      "self-rider routing",
      "survivability stacking",
      "no fake synergy from self-beneficial leverage",
    ],
  },
  {
    id: "recurring_pressure_split",
    label: "Recurring Pressure Split",
    category: "pair",
    powerIds: ["grasping_field", "searing_lockdown"],
    purpose: "Field recurrence vs attached carrier recurrence",
    checks: ["cadence shaping", "lifespan weighting", "recurring timing", "control/debuff recurrence"],
  },
  {
    id: "triggered_defence_test",
    label: "Triggered Defence Test",
    category: "pair",
    powerIds: ["trigger_ward", "channelled_bulwark"],
    purpose: "Reactive/armed threat plus ongoing self-protection",
    checks: ["counter-enabled trigger coverage", "channel commitment", "defensive self-value vs threat"],
  },
];

const stressScenarios: ApprovedCanaryScenario[] = [
  {
    id: "control_lock_suite",
    label: "Control Lock Suite",
    category: "stress",
    powerIds: ["grasping_field", "trigger_ward", "searing_lockdown"],
    purpose: "Control saturation / normalization stress set",
    checks: [
      "manipulation/control saturation",
      "recurring control pressure",
      "descriptor readability under multiple control effects",
    ],
  },
  {
    id: "delayed_punishment_suite",
    label: "Delayed Punishment Suite",
    category: "stress",
    powerIds: ["barbed_brand", "deferred_mark", "held_bolt"],
    purpose: "Delayed threat layering without fake control/support",
    checks: ["attach vs payload", "delay cadence", "reserve pressure"],
  },
  {
    id: "self_fortress_suite",
    label: "Self Fortress Suite",
    category: "stress",
    powerIds: ["attached_self_buff", "channelled_bulwark", "crippling_surge"],
    purpose: "Survivability concentration test",
    checks: ["self-only defensive utility", "survivability inflation", "fake synergy suppression"],
  },
  {
    id: "mixed_toolkit_suite",
    label: "Mixed Toolkit Suite",
    category: "stress",
    powerIds: ["simple_ranged_attack", "trigger_ward", "held_bolt", "crippling_surge"],
    purpose: "Mixed real-monster-style toolkit sanity test",
    checks: ["baseline threat", "trigger pressure", "delayed release", "self-rider utility"],
  },
  {
    id: "recurrence_delay_suite",
    label: "Recurrence Delay Suite",
    category: "stress",
    powerIds: ["searing_lockdown", "deferred_mark", "held_bolt"],
    purpose: "Recurring attached pressure plus delayed release",
    checks: ["attached recurrence", "delayed payload", "reserve release", "pressure stacking"],
  },
  {
    id: "full_branch_sweep",
    label: "Full Branch Sweep",
    category: "stress",
    powerIds: APPROVED_CANARY_POWERS.map((entry) => entry.id),
    purpose: "Pressure test only, not diagnostic",
    checks: [
      "no crashes",
      "no illegal integrity errors",
      "no nonsense axis spikes",
      "no obvious descriptor catastrophes",
    ],
  },
];

export const APPROVED_CANARY_SCENARIOS: ApprovedCanaryScenario[] = [
  ...APPROVED_CANARY_POWERS.map((entry): ApprovedCanaryScenario => ({
    id: entry.id,
    label: entry.label,
    category: "solo",
    powerIds: [entry.id],
    purpose: entry.purpose,
    checks: [entry.description],
  })),
  ...pairScenarios,
  ...stressScenarios,
];

export function cloneApprovedCanaryPower(power: MonsterPower): MonsterPower {
  return clonePower(power);
}

export function getApprovedCanaryEntry(id: ApprovedCanaryId): ApprovedCanaryPowerEntry | null {
  return APPROVED_CANARY_POWERS.find((entry) => entry.id === id) ?? null;
}

export function getApprovedCanaryPower(id: ApprovedCanaryId): MonsterPower | null {
  const entry = getApprovedCanaryEntry(id);
  return entry ? clonePower(entry.power) : null;
}

export function getApprovedCanaryScenario(
  id: ApprovedCanaryScenarioId,
): ApprovedCanaryScenario | null {
  return APPROVED_CANARY_SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

export function buildApprovedCanaryScenarioPowers(
  id: ApprovedCanaryScenarioId,
): MonsterPower[] {
  const scenario = getApprovedCanaryScenario(id);
  if (!scenario) return [];
  return scenario.powerIds
    .map((powerId) => getApprovedCanaryPower(powerId))
    .filter((power): power is MonsterPower => Boolean(power));
}

export function buildApprovedCanarySuite(): MonsterPower[] {
  return APPROVED_CANARY_POWERS.map((entry) => clonePower(entry.power));
}
