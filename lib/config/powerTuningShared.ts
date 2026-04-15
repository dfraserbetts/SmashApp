export type PowerTuningConfigStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type PowerTuningFlatValues = Record<string, number>;
export type PowerTuningSnapshot = {
  setId: string;
  name: string;
  slug: string;
  status: PowerTuningConfigStatus;
  updatedAt: string;
  values: PowerTuningFlatValues;
};

export const POWER_TUNING_DEFAULTS_NESTED = {
  access: {
    chargeTurns: { "1": 0.5, "2": 1, "3": 1.5, "4": 2, "5": 2.5, "6": 3, "7": 3.5, "8": 4 },
    chargeType: { buildPower: 1, delayedCast: 1.5 },
    commitment: { channel: 2, charge: 2, standard: 0 },
    counter: { no: 0, yes: 1.5 },
  },
  axis: {
    presence: { passive: 0.4, turns: 0.2, recurringTurnTiming: 0.1 },
    structural: {
      attachedPressure: 0.4,
      fieldPressure: 0.5,
      recurringCarrierTurnShare: 0.05,
      reservePressure: 0.4,
      triggerPressure: 0.4,
    },
  },
  packet: {
    augmentStat: {
      armorSkill: 1,
      attack: 1.5,
      bravery: 1,
      defence: 1.5,
      dodge: 2,
      fortitude: 1,
      intellect: 1,
      movement: 1.5,
      support: 1,
      weaponSkill: 1,
      willpower: 1,
    },
    cleanseEffect: {
      activePower: 2.5,
      channelledPower: 2.5,
      damageOverTime: 1.5,
      effectOverTime: 1.5,
    },
    controlMode: {
      forceMove: 1.5,
      forceNoMainAction: 2,
      forceNoMove: 1.5,
      forceSpecificMainAction: 2.5,
      forceSpecificPowerAction: 3,
    },
    debuffStat: {
      armorSkill: 1,
      attack: 1.5,
      bravery: 1,
      defence: 1.5,
      dodge: 2,
      fortitude: 1,
      intellect: 1,
      movement: 1.5,
      support: 1,
      weaponSkill: 1,
      willpower: 1,
    },
    duration: { instant: 0, passive: 3, turns: 1, untilNextTurn: 0.5 },
    durationTurns: { "1": 0, "2": 0.5, "3": 1, "4": 1.5 },
    identity: {
      intention: {
        attack: 1,
        augment: 2,
        cleanse: 2,
        control: 3,
        debuff: 2.5,
        defence: 1.5,
        healing: 1.5,
        movement: 2,
      },
    },
    magnitude: {
      buildPowerBonusDice: {
        "1": 1.1,
        "2": 1.2,
        "3": 1.3,
        "4": 1.4,
        "5": 1.5,
        "6": 1.6,
        "7": 1.7,
        "8": 1.8,
        "9": 1.9,
        "10": 2,
      },
      damageTypeCount: { "1": 1, "2": 1.25, "3": 1.5, "4": 1.75 },
      dice: {
        "1": 3,
        "2": 6,
        "3": 9,
        "4": 12,
        "5": 15,
        "6": 18,
        "7": 21,
        "8": 24,
        "9": 27,
        "10": 30,
      },
      potency: { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 },
    },
    movementType: {
      fly: 1.5,
      forceFly: 2,
      forcePush: 1.5,
      forceTeleport: 2.5,
      run: 1,
      teleport: 2,
    },
    recipient: { allies: 1, primaryTargets: 0, self: 0.5 },
    timing: {
      endOfTurn: 1,
      endOfTurnWhileChannelled: 1.5,
      onAttach: 0.5,
      onCast: 0,
      onExpiry: 1,
      onRelease: 1,
      onTrigger: 1.5,
      startOfTurn: 1,
      startOfTurnWhileChannelled: 1.5,
    },
  },
  shared: {
    aoeCastRange: { "0": 0, "30": 0.5, "60": 1, "120": 1.5, "200": 2 },
    aoeCount: { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4 },
    aoeShape: { cone: 0.5, line: 1, sphere: 0 },
    coneLength: { "15": 0.5, "30": 1, "60": 1.5 },
    lineLength: { "30": 0.5, "60": 1, "90": 1.5, "120": 2 },
    lineWidth: { "5": 0, "10": 0.5, "15": 1, "20": 1.5 },
    meleeTargets: { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4 },
    rangeCategory: { self: 0, melee: 1, ranged: 2, aoe: 3 },
    rangedDistance: { "30": 0, "60": 0.5, "120": 1, "200": 1.5 },
    rangedTargets: { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4 },
    sphereRadius: { "10": 0.5, "20": 1, "30": 1.5 },
  },
  structural: {
    attachedHostileEntry: { onAttach: 0.5, onPayload: 1.5 },
    chassis: { attached: 2, field: 3, immediate: 0, reserve: 2.5, trigger: 2.5 },
    lifespan: { none: 0, passive: 3, turns: 1 },
    lifespanTurns: {
      "1": 0,
      "2": 0.5,
      "3": 1,
      "4": 1.5,
      "5": 2,
      "6": 2.5,
      "7": 3,
      "8": 3.5,
    },
    triggerMethod: { armThenTarget: 1, targetThenArm: 0.5 },
  },
  system: {
    packetCount: { base: 0, addPacket2: 2, addPacket3: 4, addPacket4plus: 7 },
    secondaryContingency: { packet2: 0.75, packet3plus: 0.6 },
    synergy: {
      carrierRecurring: 2.5,
      hostileToBeneficial: 1.5,
      latchToPayload: 3,
      overlapLeverage: 2,
      resultScalingFollowThrough: 1.5,
    },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNonNegativeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

export function flattenNestedPowerTuningDefaults(
  input: Record<string, unknown>,
): PowerTuningFlatValues {
  const flattened: PowerTuningFlatValues = {};

  function visit(node: Record<string, unknown>, prefix: string) {
    for (const [key, value] of Object.entries(node)) {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "number" && Number.isFinite(value)) {
        flattened[nextKey] = value;
        continue;
      }
      if (isRecord(value)) {
        visit(value, nextKey);
      }
    }
  }

  visit(input, "");
  return flattened;
}

export const DEFAULT_POWER_TUNING_VALUES: PowerTuningFlatValues =
  flattenNestedPowerTuningDefaults(POWER_TUNING_DEFAULTS_NESTED);

export const POWER_TUNING_CONFIG_KEY_ORDER: string[] = Object.keys(
  DEFAULT_POWER_TUNING_VALUES,
);

export function normalizePowerTuningValues(
  input?: Record<string, unknown> | null,
): PowerTuningFlatValues {
  const normalized: PowerTuningFlatValues = {};
  for (const key of POWER_TUNING_CONFIG_KEY_ORDER) {
    normalized[key] = toNonNegativeNumber(input?.[key], DEFAULT_POWER_TUNING_VALUES[key]);
  }
  return normalized;
}

export function getPowerTuningValue(
  values: PowerTuningFlatValues,
  key: string,
  fallback = 0,
): number {
  const value = values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
