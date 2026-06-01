import type {
  CoreAttribute,
  EffectPacket,
  MonsterNaturalAttackConfig,
  Power,
  PowerIntention,
  RangeCategory,
} from "@/lib/summoning/types";

import type {
  CombatAction,
  CombatActor,
  CombatAttributeName,
  CombatDieSize,
  CombatPool,
  CombatSide,
  CombatActionSourceType,
  UnsupportedPowerReason,
} from "./types";

const ATTRIBUTES: CombatAttributeName[] = [
  "Attack",
  "Guard",
  "Fortitude",
  "Intellect",
  "Synergy",
  "Bravery",
];

const CORE_TO_COMBAT_ATTRIBUTE: Record<CoreAttribute, CombatAttributeName> = {
  ATTACK: "Attack",
  GUARD: "Guard",
  FORTITUDE: "Fortitude",
  INTELLECT: "Intellect",
  SYNERGY: "Synergy",
  BRAVERY: "Bravery",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePool(value: unknown): CombatPool {
  return asString(value).toUpperCase() === "MENTAL" ? "mental" : "physical";
}

function normalizeAttribute(value: unknown, fallback: CombatAttributeName): CombatAttributeName {
  const normalized = asString(value).toUpperCase();
  if (normalized === "DEFENCE" || normalized === "DEFENSE" || normalized === "GUARD") return "Guard";
  if (normalized === "SUPPORT" || normalized === "SYNERGY") return "Synergy";
  return ATTRIBUTES.find((attribute) => attribute.toUpperCase() === normalized) ?? fallback;
}

function getPackets(power: Power): EffectPacket[] {
  const packets = Array.isArray(power.effectPackets) && power.effectPackets.length > 0
    ? power.effectPackets
    : power.intentions;
  return (packets ?? []).map((packet, index) => ({
    ...packet,
    packetIndex: packet.packetIndex ?? packet.sortOrder ?? index,
    sortOrder: packet.sortOrder ?? index,
    intention: packet.intention ?? packet.type ?? "ATTACK",
    type: packet.type ?? packet.intention ?? "ATTACK",
    detailsJson: asRecord(packet.detailsJson),
  }));
}

function unsupported(
  power: Power,
  reason: string,
  packet?: EffectPacket,
): UnsupportedPowerReason {
  return {
    powerId: power.id ?? power.name,
    powerName: power.name,
    reason,
    descriptorChassis: power.descriptorChassis ?? null,
    packetIndex: packet?.packetIndex ?? null,
    packetIntention: packet?.intention ?? null,
  };
}

function packetIsCastableNow(power: Power, packet: EffectPacket): string | null {
  const chassis = power.descriptorChassis ?? "IMMEDIATE";
  if (chassis !== "IMMEDIATE") {
    return `Descriptor chassis ${chassis} is not resolved in automated V1.`;
  }
  const timing = packet.effectTimingType ?? "ON_CAST";
  if (timing !== "ON_CAST") {
    return `Packet timing ${timing} is not resolved in automated V1.`;
  }
  const duration = packet.effectDurationType ?? "INSTANT";
  if (duration !== "INSTANT" && duration !== "TURNS") {
    return `Packet duration ${duration} is not resolved in automated V1.`;
  }
  return null;
}

function actionKindForIntention(intention: PowerIntention): CombatAction["kind"] | null {
  if (intention === "ATTACK") return "attack";
  if (intention === "HEALING") return "healing";
  if (intention === "AUGMENT") return "buff";
  if (intention === "DEBUFF") return "debuff";
  if (intention === "DEFENCE") return "defence";
  return null;
}

function targetPolicyForAction(kind: CombatAction["kind"], packet: EffectPacket): CombatAction["targetPolicy"] {
  const applyTo = packet.applyTo ?? asString(asRecord(packet.detailsJson).applyTo).toUpperCase();
  if (applyTo === "SELF") return "self";
  if (kind === "healing" || kind === "buff" || kind === "defence") return "ally";
  return "enemy";
}

export function adaptPowerToCombatActions(power: Power): {
  actions: CombatAction[];
  unsupported: UnsupportedPowerReason[];
} {
  const actions: CombatAction[] = [];
  const unsupportedReasons: UnsupportedPowerReason[] = [];
  const packets = getPackets(power);

  if (packets.length === 0) {
    unsupportedReasons.push(unsupported(power, "Power has no effect packets."));
    return { actions, unsupported: unsupportedReasons };
  }

  for (const packet of packets) {
    const castableIssue = packetIsCastableNow(power, packet);
    const kind = actionKindForIntention(packet.intention);
    if (castableIssue || !kind) {
      unsupportedReasons.push(
        unsupported(
          power,
          castableIssue ?? `Packet intention ${packet.intention} is not supported by automated V1.`,
          packet,
        ),
      );
      continue;
    }

    const details = asRecord(packet.detailsJson);
    const pool = normalizePool(packet.woundChannel ?? details.attackMode ?? details.healingMode);
    const durationRounds = Math.max(1, asInt(packet.effectDurationTurns, 1));
    const attribute = normalizeAttribute(
      packet.targetedAttribute ? CORE_TO_COMBAT_ATTRIBUTE[packet.targetedAttribute] : details.statTarget ?? details.statChoice,
      kind === "debuff" ? "Attack" : "Guard",
    );
    const potency = asInt(packet.potency ?? power.potency, 1);
    const diceCount = asInt(packet.diceCount ?? power.diceCount, 1);

    actions.push({
      id: `${power.id ?? power.name}:${packet.packetIndex ?? actions.length}`,
      sourcePowerId: power.id ?? power.name,
      sourceType: "power",
      name: packets.length > 1 ? `${power.name} (${packet.intention})` : power.name,
      kind,
      targetPolicy: targetPolicyForAction(kind, packet),
      supported: true,
      unsupportedReasons: [],
      pool,
      rangeCategory:
        power.rangeCategories?.includes("AOE")
          ? "AOE"
          : power.rangeCategories?.includes("RANGED")
            ? "RANGED"
            : power.rangeCategories?.includes("MELEE")
              ? "MELEE"
              : null,
      targetCount: power.rangeCategories?.includes("AOE")
        ? Math.max(1, asInt(power.aoeCount, 1))
        : power.rangeCategories?.includes("RANGED")
          ? Math.max(1, asInt(power.rangedTargets, 1))
          : Math.max(1, asInt(power.meleeTargets, 1)),
      accuracyAttribute:
        kind === "healing" || kind === "buff" || kind === "defence" ? "Synergy" : "Attack",
      diceCount,
      potency,
      protection: kind === "defence" ? potency : undefined,
      modifier:
        kind === "buff" || kind === "debuff"
          ? { attribute, amount: Math.max(1, potency), durationRounds }
          : undefined,
      cooldownRounds: Math.max(0, asInt(power.cooldownTurns, 0) - asInt(power.cooldownReduction, 0)),
      source: { power, packet },
    });
  }

  if (actions.length === 0 && unsupportedReasons.length === 0) {
    unsupportedReasons.push(unsupported(power, "No supported V1 action could be derived."));
  }

  return { actions, unsupported: unsupportedReasons };
}

export function makeBasicAttackAction(params: {
  id?: string;
  name?: string;
  pool?: CombatPool;
  diceCount: number;
  potency: number;
  sourceType?: CombatActionSourceType;
}): CombatAction {
  return {
    id: params.id ?? "basic-attack",
    name: params.name ?? "Basic Attack",
    sourceType: params.sourceType ?? "fallback",
    kind: "attack",
    targetPolicy: "enemy",
    supported: true,
    unsupportedReasons: [],
    pool: params.pool ?? "physical",
    rangeCategory: "MELEE",
    targetCount: 1,
    accuracyAttribute: "Attack",
    diceCount: params.diceCount,
    potency: params.potency,
    cooldownRounds: 0,
  };
}

function positiveNumber(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function positiveInt(value: unknown, fallback: number): number {
  const numeric = positiveNumber(value);
  return numeric > 0 ? Math.max(1, Math.trunc(numeric)) : fallback;
}

function damageTypeCount(
  damageTypes: Array<{ name?: string | null; mode?: string | null }> | undefined,
  pool: CombatPool,
): number {
  const mode = pool === "mental" ? "MENTAL" : "PHYSICAL";
  const count = (damageTypes ?? []).filter((entry) => (entry.mode ?? "PHYSICAL") === mode).length;
  return Math.max(1, count);
}

function rangeTargetCount(
  rangeCategory: RangeCategory,
  config: NonNullable<MonsterNaturalAttackConfig[Lowercase<RangeCategory>]>,
): number {
  if (rangeCategory === "AOE") {
    return positiveInt((config as NonNullable<MonsterNaturalAttackConfig["aoe"]>).count, 1);
  }
  return positiveInt(
    (config as NonNullable<MonsterNaturalAttackConfig["melee"] | MonsterNaturalAttackConfig["ranged"]>).targets,
    1,
  );
}

function makeAttackProfileActions(params: {
  idBase: string;
  sourceLabel: string;
  sourceType: Exclude<CombatActionSourceType, "power" | "fallback">;
  rangeCategory: RangeCategory;
  config: NonNullable<MonsterNaturalAttackConfig["melee" | "ranged" | "aoe"]>;
  diceCount: number;
}): CombatAction[] {
  if (!params.config.enabled) return [];
  const physicalStrength = positiveNumber(params.config.physicalStrength);
  const mentalStrength = positiveNumber(params.config.mentalStrength);
  const targetCount = rangeTargetCount(params.rangeCategory, params.config);
  const base = {
    kind: "attack" as const,
    targetPolicy: "enemy" as const,
    sourceType: params.sourceType,
    rangeCategory: params.rangeCategory,
    targetCount,
    accuracyAttribute: "Attack" as const,
    diceCount: Math.max(1, Math.trunc(params.diceCount)),
    cooldownRounds: 0,
  };
  const actions: CombatAction[] = [];
  if (physicalStrength > 0) {
    actions.push({
      ...base,
      id: `${params.idBase}:${params.rangeCategory.toLowerCase()}:physical`,
      name: `${params.sourceLabel} ${params.rangeCategory.toLowerCase()} physical attack`,
      supported: true,
      unsupportedReasons: [],
      pool: "physical",
      damageTypeCount: damageTypeCount(params.config.damageTypes, "physical"),
      potency: Math.max(1, Math.ceil(physicalStrength)),
    });
  }
  if (mentalStrength > 0) {
    actions.push({
      ...base,
      id: `${params.idBase}:${params.rangeCategory.toLowerCase()}:mental`,
      name: `${params.sourceLabel} ${params.rangeCategory.toLowerCase()} mental attack`,
      supported: true,
      unsupportedReasons: [],
      pool: "mental",
      damageTypeCount: damageTypeCount(params.config.damageTypes, "mental"),
      potency: Math.max(1, Math.ceil(mentalStrength)),
    });
  }
  if (actions.length === 0) {
    actions.push({
      ...base,
      id: `${params.idBase}:${params.rangeCategory.toLowerCase()}:unsupported`,
      name: `${params.sourceLabel} ${params.rangeCategory.toLowerCase()} attack`,
      supported: false,
      unsupportedReasons: ["Attack profile is enabled but has no physical or mental strength."],
      pool: "physical",
      damageTypeCount: Math.max(1, params.config.damageTypes?.length ?? 0),
      potency: 1,
    });
  }
  return actions;
}

export function makeAttackActionsFromConfig(params: {
  idBase: string;
  sourceLabel: string;
  sourceType: Exclude<CombatActionSourceType, "power" | "fallback">;
  attackConfig: MonsterNaturalAttackConfig | null | undefined;
  diceCount: number;
}): CombatAction[] {
  const config = params.attackConfig ?? {};
  return [
    ...(config.melee
      ? makeAttackProfileActions({
          ...params,
          rangeCategory: "MELEE",
          config: config.melee,
        })
      : []),
    ...(config.ranged
      ? makeAttackProfileActions({
          ...params,
          rangeCategory: "RANGED",
          config: config.ranged,
        })
      : []),
    ...(config.aoe
      ? makeAttackProfileActions({
          ...params,
          rangeCategory: "AOE",
          config: config.aoe,
        })
      : []),
  ];
}

export function makeFixturePower(params: {
  id: string;
  name: string;
  intention: PowerIntention;
  pool?: CombatPool;
  diceCount: number;
  potency: number;
  applyTo?: "PRIMARY_TARGET" | "ALLIES" | "SELF";
  statTarget?: CombatAttributeName;
  durationTurns?: number;
}): Power {
  const details: Record<string, unknown> = {
    attackMode: params.pool === "mental" ? "MENTAL" : "PHYSICAL",
    healingMode: params.pool === "mental" ? "MENTAL" : "PHYSICAL",
    statTarget: params.statTarget ?? "Attack",
  };
  const packet: EffectPacket = {
    sortOrder: 0,
    packetIndex: 0,
    hostility:
      params.intention === "ATTACK" || params.intention === "DEBUFF" ? "HOSTILE" : "NON_HOSTILE",
    intention: params.intention,
    type: params.intention,
    diceCount: params.diceCount,
    potency: params.potency,
    effectTimingType: "ON_CAST",
    effectTimingTurns: null,
    effectDurationType: params.durationTurns ? "TURNS" : "INSTANT",
    effectDurationTurns: params.durationTurns ?? null,
    dealsWounds: params.intention === "ATTACK",
    woundChannel: params.pool === "mental" ? "MENTAL" : "PHYSICAL",
    applyTo: params.applyTo ?? "PRIMARY_TARGET",
    targetedAttribute: null,
    detailsJson: details,
  };

  return {
    id: params.id,
    sortOrder: 0,
    name: params.name,
    description: null,
    descriptorChassis: "IMMEDIATE",
    descriptorChassisConfig: {},
    cooldownTurns: 0,
    cooldownReduction: 0,
    rangeCategories: ["MELEE"],
    primaryDefenceGate: null,
    effectPackets: [packet],
    intentions: [packet],
    diceCount: params.diceCount,
    potency: params.potency,
  };
}

export function createFixtureActor(params: {
  id: string;
  side: CombatSide;
  name: string;
  role: string;
  level?: number;
  tier?: string;
  physicalHp: number;
  mentalHp: number;
  physicalProtection: number;
  mentalProtection: number;
  dodgeValue: number;
  attack: number;
  guard: number;
  fortitude: number;
  intellect: number;
  synergy: number;
  bravery: number;
  actionsPerTurn?: number;
  powers: Power[];
  basicAttack?: { diceCount: number; potency: number; pool?: CombatPool };
}): CombatActor {
  const adapted = params.powers.map(adaptPowerToCombatActions);
  const actions = adapted.flatMap((row) => row.actions);
  if (params.basicAttack) actions.unshift(makeBasicAttackAction(params.basicAttack));
  const attributeDice = Object.fromEntries(
    ATTRIBUTES.map((attribute) => [attribute, "D8" as CombatDieSize]),
  ) as Record<CombatAttributeName, CombatDieSize>;

  return {
    id: params.id,
    side: params.side,
    name: params.name,
    role: params.role,
    level: params.level ?? 5,
    tier: params.tier ?? null,
    physicalHpCurrent: params.physicalHp,
    physicalHpMax: params.physicalHp,
    mentalHpCurrent: params.mentalHp,
    mentalHpMax: params.mentalHp,
    physicalProtection: params.physicalProtection,
    mentalProtection: params.mentalProtection,
    dodgeValue: params.dodgeValue,
    attributes: {
      Attack: params.attack,
      Guard: params.guard,
      Fortitude: params.fortitude,
      Intellect: params.intellect,
      Synergy: params.synergy,
      Bravery: params.bravery,
    },
    attributeDice,
    resist: {},
    actionsPerTurn: params.actionsPerTurn ?? 1,
    actions,
    unsupportedPowers: adapted.flatMap((row) => row.unsupported),
    hydration: {
      source: "fixture",
      realData: false,
      warnings: [],
      unsupportedEquipment: [],
      unsupportedTraits: [],
      fallbackActions: actions.filter((action) => action.sourceType === "fallback").map((action) => action.name),
    },
    defeated: false,
  };
}
