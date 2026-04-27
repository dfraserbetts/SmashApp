import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inspect } from "node:util";

import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import {
  computeMonsterOutcomes,
  type CanonicalPowerContribution,
  type DefensiveProfileSource,
  type RadarAxes,
  type WeaponAttackSource,
} from "../lib/calculators/monsterOutcomeCalculator";
import {
  applyCombatTuningToCalculatorConfig,
  normalizeCombatTuning,
} from "../lib/config/combatTuningShared";
import {
  normalizeOutcomeNormalizationValues,
  outcomeNormalizationValuesToCalculatorConfig,
} from "../lib/config/outcomeNormalizationShared";
import { normalizePowerTuningValues } from "../lib/config/powerTuningShared";
import { resolvePowerCost } from "../lib/summoning/powerCostResolver";
import type {
  EffectPacket,
  MonsterAttack,
  MonsterNaturalAttackConfig,
  MonsterUpsertInput,
  Power,
  RangeCategory,
} from "../lib/summoning/types";

const AXES = [
  "physicalThreat",
  "mentalThreat",
  "physicalSurvivability",
  "mentalSurvivability",
  "manipulation",
  "synergy",
  "mobility",
  "presence",
] as const satisfies readonly (keyof RadarAxes)[];

const EXPECTED_BANDS = {
  NONE: { min: 0, max: 0 },
  TRACE: { min: 1, max: 2 },
  LOW: { min: 3, max: 4 },
  MEDIUM: { min: 5, max: 6 },
  HIGH: { min: 7, max: 8 },
  EXTREME: { min: 9, max: 10 },
} as const;

type AxisKey = (typeof AXES)[number];
type BandName = keyof typeof EXPECTED_BANDS;
type ExpectedBands = Partial<Record<AxisKey, BandName>>;
type OutcomeStatus = "pass" | "warn" | "fail";
type FixtureGroup = "level-1-foundation" | "higher-level-tier";
type DisplayDirection = "TOO_HIGH" | "TOO_LOW" | "ON_BAND";
type MismatchClassification =
  | "RAW_VALUE"
  | "DISPLAY_NORMALIZATION"
  | "FIXTURE_EXPECTATION";
type OwnerLayer =
  | "Power Tuning"
  | "Combat Tuning"
  | "Outcome Normalization"
  | "Code seam"
  | "Fixture expectation";

type CalibrationFixture = {
  id: string;
  title: string;
  group?: FixtureGroup;
  monster: MonsterUpsertInput;
  expected: ExpectedBands;
  notes?: string[];
  equippedWeaponSources?: WeaponAttackSource[];
  defensiveProfileSources?: DefensiveProfileSource[];
  defensiveProfileContext?: {
    dodgeDice?: number;
    armorSkillDice?: number;
    willpowerDice?: number;
    totalPhysicalProtection?: number;
    totalMentalProtection?: number;
  };
  power?: Power;
  powerContribution?: CanonicalPowerContribution | null;
  naturalAttackGsAxisBonuses?: Partial<RadarAxes>;
  naturalAttackRangeAxisBonuses?: Partial<RadarAxes>;
  equipmentModifierAxisBonuses?: Partial<RadarAxes>;
  traitAxisBonuses?: Partial<RadarAxes>;
};

type AxisEvaluation = {
  axis: AxisKey;
  expected: BandName;
  actualBand: BandName | "ABOVE_EXTREME";
  rawImpliedBand: BandName | "ABOVE_EXTREME";
  radarValue: number;
  finalPreNormalizationValue: number;
  status: OutcomeStatus;
  classification?: MismatchClassification;
  ownerLayer?: OwnerLayer;
  classificationReason?: string;
};

type DisplayCurvePoint = {
  min: number;
  max: number;
};

type TuningSource = {
  layer: "Power Tuning" | "Combat Tuning" | "Outcome Normalization";
  kind: "snapshot" | "source defaults";
  path?: string;
  name?: string | null;
};

type LoadedTuning<TValues> = {
  values: TValues;
  source: TuningSource;
};

type RequestedTuningMode = "active" | "defaults";
type CalibrationTuningMode = "active" | "defaults" | "mixed";
type BalanceTruthStatus =
  | "FULL ACTIVE SNAPSHOT"
  | "MIXED ACTIVE/DEFAULT SNAPSHOT"
  | "SOURCE DEFAULT SMOKE TEST ONLY";

const TUNING_SNAPSHOT_PATHS = {
  power: "scripts/fixtures/tuning/active-power-tuning.json",
  combat: "scripts/fixtures/tuning/active-combat-tuning.json",
  outcome: "scripts/fixtures/tuning/active-outcome-normalization.json",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSnapshotPayload(relativePath: string): {
  values: Record<string, unknown>;
  name: string | null;
} | null {
  const absolutePath = join(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) return null;

  const parsed = JSON.parse(readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Tuning snapshot ${relativePath} must contain a JSON object.`);
  }

  const values = isRecord(parsed.values) ? parsed.values : parsed;
  return {
    values,
    name: typeof parsed.name === "string" && parsed.name.trim().length > 0
      ? parsed.name.trim()
      : null,
  };
}

function snapshotExists(relativePath: string): boolean {
  return existsSync(join(process.cwd(), relativePath));
}

function parseRequestedTuningMode(argv: string[]): {
  mode: RequestedTuningMode | null;
  explicit: boolean;
} {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tuning") {
      const value = argv[index + 1];
      if (value !== "active" && value !== "defaults") {
        throw new Error("--tuning must be either active or defaults.");
      }
      return { mode: value, explicit: true };
    }
    if (arg.startsWith("--tuning=")) {
      const value = arg.slice("--tuning=".length);
      if (value !== "active" && value !== "defaults") {
        throw new Error("--tuning must be either active or defaults.");
      }
      return { mode: value, explicit: true };
    }
  }

  return { mode: null, explicit: false };
}

function loadOptionalTuningSnapshot<TValues>(params: {
  layer: TuningSource["layer"];
  relativePath: string;
  useSnapshot: boolean;
  normalize: (values?: Record<string, unknown> | null) => TValues;
}): LoadedTuning<TValues> {
  if (!params.useSnapshot) {
    return {
      values: params.normalize(null),
      source: {
        layer: params.layer,
        kind: "source defaults",
      },
    };
  }

  const snapshot = readSnapshotPayload(params.relativePath);
  if (!snapshot) {
    return {
      values: params.normalize(null),
      source: {
        layer: params.layer,
        kind: "source defaults",
      },
    };
  }

  return {
    values: params.normalize(snapshot.values),
    source: {
      layer: params.layer,
      kind: "snapshot",
      path: params.relativePath,
      name: snapshot.name,
    },
  };
}

function formatTuningSource(source: TuningSource): string {
  if (source.kind === "source defaults") return `${source.layer}: source defaults`;
  return `${source.layer}: snapshot ${source.path}${source.name ? ` (${source.name})` : ""}`;
}

const requestedTuningMode = parseRequestedTuningMode(process.argv.slice(2));
const anySnapshotExists = Object.values(TUNING_SNAPSHOT_PATHS).some(snapshotExists);
const selectedTuningMode: RequestedTuningMode =
  requestedTuningMode.mode ?? (anySnapshotExists ? "active" : "defaults");
const useTuningSnapshots = selectedTuningMode === "active";

const powerTuning = loadOptionalTuningSnapshot({
  layer: "Power Tuning",
  relativePath: TUNING_SNAPSHOT_PATHS.power,
  useSnapshot: useTuningSnapshots,
  normalize: normalizePowerTuningValues,
});
const combatTuning = loadOptionalTuningSnapshot({
  layer: "Combat Tuning",
  relativePath: TUNING_SNAPSHOT_PATHS.combat,
  useSnapshot: useTuningSnapshots,
  normalize: (values) => normalizeCombatTuning(values),
});
const outcomeNormalization = loadOptionalTuningSnapshot({
  layer: "Outcome Normalization",
  relativePath: TUNING_SNAPSHOT_PATHS.outcome,
  useSnapshot: useTuningSnapshots,
  normalize: normalizeOutcomeNormalizationValues,
});

const tuningSources = [powerTuning.source, combatTuning.source, outcomeNormalization.source] as const;
const snapshotBackedLayerCount = tuningSources.filter((source) => source.kind === "snapshot").length;
const calibrationTuningMode: CalibrationTuningMode =
  selectedTuningMode === "defaults"
    ? "defaults"
    : snapshotBackedLayerCount === tuningSources.length
      ? "active"
      : "mixed";
const balanceTruthStatus: BalanceTruthStatus =
  calibrationTuningMode === "active"
    ? "FULL ACTIVE SNAPSHOT"
    : calibrationTuningMode === "mixed"
      ? "MIXED ACTIVE/DEFAULT SNAPSHOT"
      : "SOURCE DEFAULT SMOKE TEST ONLY";
const tuningModeWarnings = [
  selectedTuningMode === "defaults" && requestedTuningMode.explicit
    ? "SOURCE DEFAULT MODE: fallback smoke test only, not live balance truth."
    : null,
  selectedTuningMode === "defaults" && !requestedTuningMode.explicit && !anySnapshotExists
    ? "No active tuning snapshots found. Running source-default smoke mode. This is not live balance truth."
    : null,
  selectedTuningMode === "active" && snapshotBackedLayerCount < tuningSources.length
    ? "MIXED TUNING MODE: not full active balance truth."
    : null,
].filter((warning): warning is string => Boolean(warning));

const runtimeCalculatorConfig = applyCombatTuningToCalculatorConfig(
  outcomeNormalizationValuesToCalculatorConfig(outcomeNormalization.values),
  combatTuning.values,
);

function axisVector(): RadarAxes {
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

function round(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function roundedAxes(value: Partial<RadarAxes> | null | undefined): RadarAxes {
  const next = axisVector();
  for (const axis of AXES) {
    next[axis] = round(value?.[axis]);
  }
  return next;
}

function bandForValue(value: number): BandName | "ABOVE_EXTREME" {
  const score = Math.round(value);
  if (score === 0) return "NONE";
  if (score >= 1 && score <= 2) return "TRACE";
  if (score >= 3 && score <= 4) return "LOW";
  if (score >= 5 && score <= 6) return "MEDIUM";
  if (score >= 7 && score <= 8) return "HIGH";
  if (score >= 9 && score <= 10) return "EXTREME";
  return "ABOVE_EXTREME";
}

function isInBand(value: number, band: BandName): boolean {
  const range = EXPECTED_BANDS[band];
  const score = Math.round(value);
  return score >= range.min && score <= range.max;
}

function expectedBandMidpoint(band: BandName): number {
  const range = EXPECTED_BANDS[band];
  return (range.min + range.max) / 2;
}

function bandIndex(band: BandName | "ABOVE_EXTREME"): number {
  if (band === "NONE") return 0;
  if (band === "TRACE") return 1;
  if (band === "LOW") return 2;
  if (band === "MEDIUM") return 3;
  if (band === "HIGH") return 4;
  if (band === "EXTREME") return 5;
  return 6;
}

function signedBandDistance(
  actual: BandName | "ABOVE_EXTREME",
  expected: BandName,
): number {
  return bandIndex(actual) - bandIndex(expected);
}

function bandDistance(actual: BandName | "ABOVE_EXTREME", expected: BandName): number {
  return Math.abs(signedBandDistance(actual, expected));
}

function displayDirectionForValue(value: number, expected: BandName): DisplayDirection {
  const range = EXPECTED_BANDS[expected];
  const score = Math.round(value);
  if (score < range.min) return "TOO_LOW";
  if (score > range.max) return "TOO_HIGH";
  return "ON_BAND";
}

function isPowerLedMismatch(powerValue: number, nonPowerValue: number): boolean {
  return powerValue > 0 && powerValue >= nonPowerValue;
}

function sourceOwnerLayer(params: {
  axis: AxisKey;
  powerValue: number;
  nonPowerValue: number;
  finalPreNormalizationValue: number;
}): OwnerLayer {
  if (isPowerLedMismatch(params.powerValue, params.nonPowerValue)) return "Power Tuning";
  if (
    params.axis === "physicalSurvivability" ||
    params.axis === "mentalSurvivability" ||
    params.axis === "physicalThreat" ||
    params.axis === "mentalThreat"
  ) {
    return "Combat Tuning";
  }
  if (params.finalPreNormalizationValue <= 0) return "Code seam";
  return "Fixture expectation";
}

function classifyMismatch(params: {
  axis: AxisKey;
  expected: BandName;
  actualBand: BandName | "ABOVE_EXTREME";
  rawImpliedBand: BandName | "ABOVE_EXTREME";
  radarValue: number;
  finalPreNormalizationValue: number;
  powerValue: number;
  nonPowerValue: number;
}): {
  classification: MismatchClassification;
  ownerLayer: OwnerLayer;
  reason: string;
} {
  const expectedMidpoint = expectedBandMidpoint(params.expected);
  const raw = params.finalPreNormalizationValue;
  const radar = params.radarValue;
  const rawDistance = bandDistance(params.rawImpliedBand, params.expected);
  const radarDistance = bandDistance(params.actualBand, params.expected);
  const rawSide = Math.sign(signedBandDistance(params.rawImpliedBand, params.expected));
  const radarSide = Math.sign(signedBandDistance(params.actualBand, params.expected));
  const sourceOwner = sourceOwnerLayer(params);

  if (isInBand(radar, params.expected)) {
    return {
      classification: "FIXTURE_EXPECTATION",
      ownerLayer: "Fixture expectation",
      reason: "Radar value is already inside the expected band; this row should be treated as a pass.",
    };
  }

  if (raw <= 0 && expectedMidpoint > 0) {
    return {
      classification: "RAW_VALUE",
      ownerLayer: "Code seam",
      reason: `Expected ${params.expected}, but raw pre-normalization is zero and radar cannot express the axis.`,
    };
  }

  if (isInBand(raw, params.expected) && !isInBand(radar, params.expected)) {
    return {
      classification: "DISPLAY_NORMALIZATION",
      ownerLayer: "Outcome Normalization",
      reason: `Raw value ${raw} is inside expected ${params.expected}, but radar ${radar} lands in ${params.actualBand}.`,
    };
  }

  if (rawSide > 0 && radarSide < 0) {
    return {
      classification: "DISPLAY_NORMALIZATION",
      ownerLayer: "Outcome Normalization",
      reason: `Raw-implied band ${params.rawImpliedBand} is at or above expected ${params.expected}, but radar band ${params.actualBand} underreports it.`,
    };
  }

  if (rawDistance <= 1 && radarDistance >= 2) {
    return {
      classification: "DISPLAY_NORMALIZATION",
      ownerLayer: "Outcome Normalization",
      reason: `Raw-implied band ${params.rawImpliedBand} is close to expected ${params.expected}, but radar band ${params.actualBand} is ${radarDistance} bands away.`,
    };
  }

  if (rawDistance <= 1 && radarDistance <= 1 && rawSide === radarSide) {
    return {
      classification: "FIXTURE_EXPECTATION",
      ownerLayer: "Fixture expectation",
      reason: `Raw-implied band ${params.rawImpliedBand} and radar band ${params.actualBand} are both adjacent to expected ${params.expected}; this looks like the fixture expectation boundary is too strict.`,
    };
  }

  if (raw > 0 && radar >= 8 && raw <= expectedMidpoint + 2) {
    return {
      classification: "DISPLAY_NORMALIZATION",
      ownerLayer: "Outcome Normalization",
      reason: `Raw value ${raw} is not extreme relative to expected midpoint ${expectedMidpoint}, but radar value ${radar} normalizes to ${params.actualBand}.`,
    };
  }

  if (rawSide !== 0 && rawSide === radarSide && rawDistance >= 1) {
    return {
      classification: "RAW_VALUE",
      ownerLayer: sourceOwner,
      reason: `Raw-implied band ${params.rawImpliedBand} and radar band ${params.actualBand} are on the same side of expected ${params.expected}; owner follows the dominant ${sourceOwner === "Power Tuning" ? "effective power" : "non-power"} source.`,
    };
  }

  if (radarDistance > rawDistance) {
    return {
      classification: "DISPLAY_NORMALIZATION",
      ownerLayer: "Outcome Normalization",
      reason: `Radar band ${params.actualBand} is farther from expected ${params.expected} than raw-implied band ${params.rawImpliedBand}.`,
    };
  }

  return {
    classification: "RAW_VALUE",
    ownerLayer: sourceOwner,
    reason: `Raw-implied band ${params.rawImpliedBand} remains outside expected ${params.expected}; owner follows the dominant source layer.`,
  };
}

function createBaseMonster(overrides: Partial<MonsterUpsertInput> = {}): MonsterUpsertInput {
  const monster: MonsterUpsertInput = {
    name: "Calibration Monster",
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
    physicalResilienceCurrent: 12,
    physicalResilienceMax: 12,
    mentalPerseveranceCurrent: 12,
    mentalPerseveranceMax: 12,
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
    powers: [],
    ...overrides,
  };
  return monster;
}

function readDisplayCurvePoint(
  value: unknown,
): DisplayCurvePoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as { min?: unknown; max?: unknown };
  return {
    min: round(point.min),
    max: round(point.max),
  };
}

function createNaturalAttack(
  name: string,
  attackConfig: MonsterNaturalAttackConfig,
): MonsterAttack {
  return {
    sortOrder: 0,
    attackMode: "NATURAL",
    attackName: name,
    attackConfig,
  };
}

const expandedFixtureGroup: FixtureGroup = "higher-level-tier";

const basicPhysicalAttackConfig: MonsterNaturalAttackConfig = {
  melee: {
    enabled: true,
    targets: 1,
    physicalStrength: 1,
    mentalStrength: 0,
    damageTypes: [{ name: "Slashing", mode: "PHYSICAL" }],
    attackEffects: [],
  },
};

const basicWeaponSource: WeaponAttackSource = {
  id: "calibration-basic-weapon",
  label: "Main Hand: Basic Weapon",
  attackConfig: {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: 1,
      mentalStrength: 0,
      damageTypes: [{ name: "Slashing", mode: "PHYSICAL" }],
    },
  },
};

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
  packet: EffectPacket;
  rangeCategories?: RangeCategory[];
  rangedTargets?: number | null;
  cooldownTurns?: number;
}): Power {
  return {
    sortOrder: 0,
    name: config.name,
    description: null,
    descriptorChassis: "IMMEDIATE",
    descriptorChassisConfig: {},
    cooldownTurns: config.cooldownTurns ?? 1,
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
    defenceRequirement: "NONE",
  };
}

function withPower(fixture: Omit<CalibrationFixture, "powerContribution">): CalibrationFixture {
  if (!fixture.power) return fixture;
  const breakdown = resolvePowerCost(
    fixture.power,
    { values: powerTuning.values },
    { level: fixture.monster.level, tier: fixture.monster.tier },
  );
  return {
    ...fixture,
    monster: {
      ...fixture.monster,
      powers: [fixture.power],
    },
    powerContribution: {
      ...breakdown,
      powers: [
        {
          id: fixture.power.id ?? null,
          name: fixture.power.name,
          axisVector: breakdown.axisVector,
          basePowerValue: breakdown.basePowerValue,
          derivedCooldownTurns: breakdown.derivedCooldownTurns,
          cooldownTurns: fixture.power.cooldownTurns,
          cooldownReduction: fixture.power.cooldownReduction,
        },
      ],
    },
  };
}

function authoredSummary(fixture: CalibrationFixture): Record<string, unknown> {
  const monster = fixture.monster;
  return {
    fixtureGroup: fixture.group ?? "level-1-foundation",
    monster: {
      name: monster.name,
      level: monster.level,
      tier: monster.tier,
      pools: {
        physicalResilienceMax: monster.physicalResilienceMax,
        mentalPerseveranceMax: monster.mentalPerseveranceMax,
      },
      protection: {
        physicalProtection: monster.physicalProtection,
        mentalProtection: monster.mentalProtection,
        naturalPhysicalProtection: monster.naturalPhysicalProtection,
        naturalMentalProtection: monster.naturalMentalProtection,
      },
      attributes: {
        attackDie: monster.attackDie,
        guardDie: monster.guardDie,
        fortitudeDie: monster.fortitudeDie,
        intellectDie: monster.intellectDie,
        synergyDie: monster.synergyDie,
        braveryDie: monster.braveryDie,
      },
      naturalAttacks: monster.attacks.map((attack) => attack.attackName),
    },
    equippedWeaponSources: fixture.equippedWeaponSources?.map((source) => source.label) ?? [],
    defensiveProfileSources: fixture.defensiveProfileSources ?? [],
    defensiveProfileContext: fixture.defensiveProfileContext ?? null,
    traitAxisBonuses: fixture.traitAxisBonuses ?? null,
    power: fixture.power
      ? {
          name: fixture.power.name,
          packets: fixture.power.effectPackets.map((packet) => ({
            intention: packet.intention,
            applyTo: packet.applyTo,
            diceCount: packet.diceCount,
            potency: packet.potency,
            detailsJson: packet.detailsJson,
          })),
        }
      : null,
    notes: fixture.notes ?? [],
  };
}

function evaluateFixture(fixture: CalibrationFixture) {
  const result = computeMonsterOutcomes(fixture.monster, runtimeCalculatorConfig, {
    equippedWeaponSources: fixture.equippedWeaponSources,
    defensiveProfileSources: fixture.defensiveProfileSources,
    defensiveProfileContext: fixture.defensiveProfileContext,
    protectionTuning: combatTuning.values,
    equipmentModifierAxisBonuses: fixture.equipmentModifierAxisBonuses,
    naturalAttackGsAxisBonuses: fixture.naturalAttackGsAxisBonuses,
    naturalAttackRangeAxisBonuses: fixture.naturalAttackRangeAxisBonuses,
    powerContribution: fixture.powerContribution,
    traitAxisBonuses: fixture.traitAxisBonuses,
  });
  const debug = result.debug as {
    powerContribution?: {
      axisVector?: Partial<RadarAxes>;
      canonicalPowerAxisVector?: Partial<RadarAxes>;
      effectivePowerAxisVector?: Partial<RadarAxes>;
      availabilityFactor?: number | null;
      availabilityReason?: string;
      cooldownTurns?: number | null;
      cooldownSource?: string;
      perPowerAvailability?: unknown[];
      availabilityWarnings?: string[];
    };
    nonPowerContribution?: { axisVector?: Partial<RadarAxes> };
    finalPreNormalizationAxes?: Partial<RadarAxes>;
    normalizationBreakdown?: {
      level?: number;
      tierKey?: string;
      tierMultiplier?: number;
      displayCurvePoints?: Partial<Record<AxisKey, unknown>>;
      curvePoints?: Partial<Record<AxisKey, unknown>>;
    };
  };
  const powerContribution = roundedAxes(
    debug.powerContribution?.canonicalPowerAxisVector ?? debug.powerContribution?.axisVector,
  );
  const effectivePowerContribution = roundedAxes(
    debug.powerContribution?.effectivePowerAxisVector,
  );
  const nonPowerContribution = roundedAxes(debug.nonPowerContribution?.axisVector);
  const finalPreNormalizationAxes = roundedAxes(debug.finalPreNormalizationAxes);
  const radarAxes = roundedAxes(result.radarAxes);
  const displayCurvePointSource =
    debug.normalizationBreakdown?.displayCurvePoints ??
    debug.normalizationBreakdown?.curvePoints ??
    {};
  const displayCurvePoints = AXES.reduce(
    (acc, axis) => {
      acc[axis] = readDisplayCurvePoint(displayCurvePointSource[axis]);
      return acc;
    },
    {} as Record<AxisKey, DisplayCurvePoint | null>,
  );
  const axisEvaluations: AxisEvaluation[] = [];

  for (const axis of AXES) {
    const expected = fixture.expected[axis];
    if (!expected) continue;

    const radarValue = radarAxes[axis];
    const finalPreNormalizationValue = finalPreNormalizationAxes[axis];
    const actualBand = bandForValue(radarValue);
    const rawImpliedBand = bandForValue(finalPreNormalizationValue);
    const status: OutcomeStatus = isInBand(radarValue, expected)
      ? "pass"
      : finalPreNormalizationValue > 0 || radarValue > 0
        ? "warn"
        : "fail";
    const mismatch =
      status === "pass"
        ? undefined
        : classifyMismatch({
            axis,
            expected,
            actualBand,
            rawImpliedBand,
            powerValue: effectivePowerContribution[axis],
            nonPowerValue: nonPowerContribution[axis],
            finalPreNormalizationValue,
            radarValue,
          });

    axisEvaluations.push({
      axis,
      expected,
      actualBand,
      rawImpliedBand,
      radarValue,
      finalPreNormalizationValue,
      status,
      classification: mismatch?.classification,
      ownerLayer: mismatch?.ownerLayer,
      classificationReason: mismatch?.reason,
    });
  }

  const overall: OutcomeStatus = axisEvaluations.some((row) => row.status === "fail")
    ? "fail"
    : axisEvaluations.some((row) => row.status === "warn")
      ? "warn"
      : "pass";

  return {
    id: fixture.id,
    title: fixture.title,
    group: fixture.group ?? "level-1-foundation",
    level: fixture.monster.level,
    tier: fixture.monster.tier,
    authoredInputs: authoredSummary(fixture),
    powerContribution: { axisVector: powerContribution },
    effectivePowerContribution: {
      axisVector: effectivePowerContribution,
      availabilityFactor: debug.powerContribution?.availabilityFactor ?? null,
      availabilityReason: debug.powerContribution?.availabilityReason ?? null,
      cooldownTurns: debug.powerContribution?.cooldownTurns ?? null,
      cooldownSource: debug.powerContribution?.cooldownSource ?? null,
      perPowerAvailability: debug.powerContribution?.perPowerAvailability ?? [],
      availabilityWarnings: debug.powerContribution?.availabilityWarnings ?? [],
    },
    nonPowerContribution: { axisVector: nonPowerContribution },
    finalPreNormalizationAxes,
    radarAxes,
    normalization: {
      level: debug.normalizationBreakdown?.level ?? fixture.monster.level,
      tier: debug.normalizationBreakdown?.tierKey ?? fixture.monster.tier,
      tierMultiplier: round(debug.normalizationBreakdown?.tierMultiplier),
      displayCurvePoints,
    },
    expectedBands: fixture.expected,
    axisEvaluations,
    status: overall,
  };
}

function printSection(title: string, value: unknown) {
  console.log(`\n${title}`);
  console.log(inspect(value, { depth: 12, colors: false, compact: false, sorted: true }));
}

function printFixtureReport(report: ReturnType<typeof evaluateFixture>) {
  console.log(
    `\n=== ${report.group} / ${report.id}: ${report.title} [${report.status.toUpperCase()}] ===`,
  );
  printSection("authored inputs summary", report.authoredInputs);
  printSection("canonicalPowerContribution.axisVector", report.powerContribution.axisVector);
  printSection("effectivePowerContribution", report.effectivePowerContribution);
  printSection("nonPowerContribution.axisVector", report.nonPowerContribution.axisVector);
  printSection("finalPreNormalizationAxes", report.finalPreNormalizationAxes);
  printSection("radarAxes", report.radarAxes);
  printSection("expected band", report.expectedBands);
  printSection(
    "pass/warn/fail",
    report.axisEvaluations.map((row) => ({
      fixtureId: report.id,
      fixtureName: report.title,
      axis: row.axis,
      expected: row.expected,
      rawImpliedBand: row.rawImpliedBand,
      rawPreNormalizationValue: row.finalPreNormalizationValue,
      radarBand: row.actualBand,
      radarValue: row.radarValue,
      status: row.status,
      classification: row.classification ?? null,
      ownerLayer: row.ownerLayer ?? null,
      classificationReason: row.classificationReason ?? null,
    })),
  );
}

const fixtures: CalibrationFixture[] = [
  {
    id: "naked-level-1-minion",
    title: "naked level 1 minion",
    monster: createBaseMonster({
      name: "Naked Level 1 Minion",
      physicalResilienceCurrent: 8,
      physicalResilienceMax: 8,
      mentalPerseveranceCurrent: 8,
      mentalPerseveranceMax: 8,
    }),
    expected: {
      physicalThreat: "NONE",
      mentalThreat: "NONE",
      physicalSurvivability: "TRACE",
      mentalSurvivability: "NONE",
      presence: "NONE",
    },
  },
  {
    id: "basic-weapon-minion",
    title: "basic weapon minion",
    monster: createBaseMonster({ name: "Basic Weapon Minion" }),
    equippedWeaponSources: [basicWeaponSource],
    expected: {
      physicalThreat: "LOW",
      mentalThreat: "NONE",
      physicalSurvivability: "TRACE",
      mentalSurvivability: "NONE",
      presence: "TRACE",
    },
  },
  {
    id: "natural-attack-equivalent",
    title: "natural attack equivalent",
    monster: createBaseMonster({
      name: "Natural Attack Equivalent",
      attacks: [createNaturalAttack("Natural Claws", basicPhysicalAttackConfig)],
    }),
    expected: {
      physicalThreat: "LOW",
      mentalThreat: "NONE",
      physicalSurvivability: "TRACE",
      mentalSurvivability: "NONE",
      presence: "TRACE",
    },
  },
  {
    id: "dodge-skirmisher",
    title: "dodge skirmisher",
    monster: createBaseMonster({
      name: "Dodge Skirmisher",
      guardDie: "D12",
      intellectDie: "D12",
      physicalResilienceCurrent: 10,
      physicalResilienceMax: 10,
      mentalPerseveranceCurrent: 10,
      mentalPerseveranceMax: 10,
    }),
    defensiveProfileContext: {
      dodgeDice: 3,
      armorSkillDice: 1,
      willpowerDice: 1,
      totalPhysicalProtection: 0,
      totalMentalProtection: 0,
    },
    expected: {
      physicalSurvivability: "LOW",
      mentalSurvivability: "NONE",
      mobility: "NONE",
      physicalThreat: "NONE",
    },
  },
  {
    id: "ppv-brute",
    title: "PPV brute",
    monster: createBaseMonster({
      name: "PPV Brute",
      physicalResilienceCurrent: 20,
      physicalResilienceMax: 20,
      mentalPerseveranceCurrent: 8,
      mentalPerseveranceMax: 8,
      physicalProtection: 4,
      naturalPhysicalProtection: 4,
      guardDie: "D10",
      fortitudeDie: "D10",
    }),
    expected: {
      physicalSurvivability: "HIGH",
      mentalSurvivability: "NONE",
      physicalThreat: "NONE",
    },
  },
  {
    id: "mpv-ward",
    title: "MPV ward",
    monster: createBaseMonster({
      name: "MPV Ward",
      physicalResilienceCurrent: 8,
      physicalResilienceMax: 8,
      mentalPerseveranceCurrent: 20,
      mentalPerseveranceMax: 20,
      mentalProtection: 4,
      naturalMentalProtection: 4,
      synergyDie: "D10",
      braveryDie: "D10",
    }),
    expected: {
      physicalSurvivability: "TRACE",
      mentalSurvivability: "HIGH",
      physicalThreat: "NONE",
    },
  },
  {
    id: "level-4-boss-balanced-naked-body",
    title: "level 4 boss balanced naked body",
    group: expandedFixtureGroup,
    monster: createBaseMonster({
      name: "Level 4 Boss Balanced Naked Body",
      level: 4,
      tier: "BOSS",
      physicalResilienceCurrent: 75,
      physicalResilienceMax: 75,
      mentalPerseveranceCurrent: 75,
      mentalPerseveranceMax: 75,
      guardDie: "D8",
      fortitudeDie: "D8",
      synergyDie: "D8",
      braveryDie: "D8",
    }),
    expected: {
      physicalThreat: "NONE",
      mentalThreat: "NONE",
      physicalSurvivability: "TRACE",
      mentalSurvivability: "NONE",
      manipulation: "NONE",
      synergy: "NONE",
      mobility: "NONE",
      presence: "NONE",
    },
  },
  withPower({
    id: "weak-self-movement",
    title: "weak self movement",
    monster: createBaseMonster({ name: "Weak Self Movement" }),
    power: createPower({
      name: "Short Hop",
      packet: createPacket("MOVEMENT", {
        applyTo: "SELF",
        diceCount: 1,
        potency: 1,
        detailsJson: { movementMode: "Run", rangeCategory: "SELF" },
      }),
    }),
    expected: {
      mobility: "LOW",
      manipulation: "NONE",
      synergy: "NONE",
    },
  }),
  withPower({
    id: "level-1-minion-self-run-1-1",
    title: "level 1 minion self run 1/1",
    monster: createBaseMonster({ name: "Level 1 Minion Self Run 1/1" }),
    power: createPower({
      name: "Short Run",
      packet: createPacket("MOVEMENT", {
        applyTo: "SELF",
        diceCount: 1,
        potency: 1,
        detailsJson: { movementMode: "Run", rangeCategory: "SELF" },
      }),
    }),
    expected: {
      mobility: "LOW",
      manipulation: "NONE",
      synergy: "NONE",
    },
  }),
  withPower({
    id: "level-1-minion-self-run-2-2",
    title: "level 1 minion self run 2/2",
    monster: createBaseMonster({ name: "Level 1 Minion Self Run 2/2" }),
    power: createPower({
      name: "Battle Run",
      packet: createPacket("MOVEMENT", {
        applyTo: "SELF",
        diceCount: 2,
        potency: 2,
        detailsJson: { movementMode: "Run", rangeCategory: "SELF" },
      }),
    }),
    expected: {
      mobility: "MEDIUM",
      manipulation: "NONE",
      synergy: "NONE",
    },
  }),
  withPower({
    id: "level-1-minion-self-run-3-2",
    title: "level 1 minion self run 3/2",
    monster: createBaseMonster({ name: "Level 1 Minion Self Run 3/2" }),
    power: createPower({
      name: "Surging Run",
      packet: createPacket("MOVEMENT", {
        applyTo: "SELF",
        diceCount: 3,
        potency: 2,
        detailsJson: { movementMode: "Run", rangeCategory: "SELF" },
      }),
    }),
    expected: {
      mobility: "HIGH",
      manipulation: "NONE",
      synergy: "NONE",
    },
  }),
  withPower({
    id: "forced-movement-controller",
    title: "forced movement controller",
    monster: createBaseMonster({ name: "Forced Movement Controller" }),
    power: createPower({
      name: "Shove",
      packet: createPacket("MOVEMENT", {
        applyTo: "PRIMARY_TARGET",
        hostility: "HOSTILE",
        diceCount: 2,
        potency: 1,
        detailsJson: { movementMode: "Force Push", rangeCategory: "RANGED" },
      }),
      rangeCategories: ["RANGED"],
      rangedTargets: 1,
    }),
    expected: {
      manipulation: "LOW",
      mobility: "TRACE",
      presence: "NONE",
    },
  }),
  withPower({
    id: "self-heal",
    title: "self heal",
    monster: createBaseMonster({ name: "Self Heal" }),
    power: createPower({
      name: "Regenerate",
      packet: createPacket("HEALING", {
        applyTo: "SELF",
        diceCount: 2,
        potency: 1,
        detailsJson: { healingMode: "PHYSICAL", rangeCategory: "SELF" },
      }),
    }),
    expected: {
      physicalSurvivability: "LOW",
      synergy: "NONE",
    },
  }),
  withPower({
    id: "ally-heal",
    title: "ally heal",
    monster: createBaseMonster({ name: "Ally Heal" }),
    power: createPower({
      name: "Patch Up Ally",
      packet: createPacket("HEALING", {
        applyTo: "ALLIES",
        diceCount: 2,
        potency: 1,
        detailsJson: { healingMode: "PHYSICAL", rangeCategory: "RANGED" },
      }),
      rangeCategories: ["RANGED"],
      rangedTargets: 1,
    }),
    expected: {
      physicalSurvivability: "LOW",
      synergy: "TRACE",
    },
  }),
  withPower({
    id: "self-augment",
    title: "self augment",
    monster: createBaseMonster({ name: "Self Augment" }),
    power: createPower({
      name: "Brace",
      packet: createPacket("AUGMENT", {
        applyTo: "SELF",
        effectDurationType: "TURNS",
        effectDurationTurns: 2,
        detailsJson: { statTarget: "Guard", rangeCategory: "SELF" },
      }),
    }),
    expected: {
      physicalSurvivability: "LOW",
      synergy: "NONE",
    },
  }),
  withPower({
    id: "ally-augment",
    title: "ally augment",
    monster: createBaseMonster({ name: "Ally Augment" }),
    power: createPower({
      name: "Bolster Ally",
      packet: createPacket("AUGMENT", {
        applyTo: "ALLIES",
        effectDurationType: "TURNS",
        effectDurationTurns: 2,
        detailsJson: { statTarget: "Guard", rangeCategory: "RANGED" },
      }),
      rangeCategories: ["RANGED"],
      rangedTargets: 1,
    }),
    expected: {
      synergy: "LOW",
      physicalSurvivability: "LOW",
    },
  }),
  withPower({
    id: "basic-debuff",
    title: "basic debuff",
    monster: createBaseMonster({ name: "Basic Debuff" }),
    power: createPower({
      name: "Hamper",
      packet: createPacket("DEBUFF", {
        applyTo: "PRIMARY_TARGET",
        hostility: "HOSTILE",
        effectDurationType: "TURNS",
        effectDurationTurns: 1,
        detailsJson: { statTarget: "Guard", rangeCategory: "RANGED" },
      }),
      rangeCategories: ["RANGED"],
      rangedTargets: 1,
    }),
    expected: {
      manipulation: "TRACE",
      physicalThreat: "NONE",
      presence: "NONE",
    },
  }),
  withPower({
    id: "basic-control",
    title: "basic control",
    monster: createBaseMonster({ name: "Basic Control" }),
    power: createPower({
      name: "Pin",
      packet: createPacket("CONTROL", {
        applyTo: "PRIMARY_TARGET",
        hostility: "HOSTILE",
        diceCount: 2,
        potency: 1,
        effectDurationType: "TURNS",
        effectDurationTurns: 1,
        detailsJson: { controlMode: "Force no move", rangeCategory: "RANGED" },
      }),
      rangeCategories: ["RANGED"],
      rangedTargets: 1,
    }),
    expected: {
      manipulation: "MEDIUM",
      presence: "TRACE",
    },
  }),
  {
    id: "level-5-soldier-weapon-user",
    title: "level 5 soldier weapon user",
    group: expandedFixtureGroup,
    monster: createBaseMonster({
      name: "Level 5 Soldier Weapon User",
      level: 5,
      tier: "SOLDIER",
      physicalResilienceCurrent: 30,
      physicalResilienceMax: 30,
      mentalPerseveranceCurrent: 18,
      mentalPerseveranceMax: 18,
      attackDie: "D8",
      guardDie: "D8",
      fortitudeDie: "D8",
    }),
    equippedWeaponSources: [
      {
        id: "calibration-level-5-soldier-sword",
        label: "Main Hand: Soldier Sword",
        attackConfig: {
          melee: {
            enabled: true,
            targets: 1,
            physicalStrength: 2,
            mentalStrength: 0,
            damageTypes: [{ name: "Slashing", mode: "PHYSICAL" }],
          },
        },
      },
    ],
    expected: {
      physicalThreat: "TRACE",
      mentalThreat: "NONE",
      physicalSurvivability: "TRACE",
      mentalSurvivability: "NONE",
      mobility: "NONE",
      manipulation: "NONE",
      synergy: "NONE",
      presence: "TRACE",
    },
  },
  withPower({
    id: "level-5-soldier-controller",
    title: "level 5 soldier controller",
    group: expandedFixtureGroup,
    monster: createBaseMonster({
      name: "Level 5 Soldier Controller",
      level: 5,
      tier: "SOLDIER",
      physicalResilienceCurrent: 26,
      physicalResilienceMax: 26,
      mentalPerseveranceCurrent: 24,
      mentalPerseveranceMax: 24,
      intellectDie: "D10",
      braveryDie: "D8",
    }),
    power: createPower({
      name: "Commanding Pin",
      packet: createPacket("CONTROL", {
        applyTo: "PRIMARY_TARGET",
        hostility: "HOSTILE",
        diceCount: 3,
        potency: 2,
        effectDurationType: "TURNS",
        effectDurationTurns: 2,
        detailsJson: { controlMode: "Force no move", rangeCategory: "RANGED" },
      }),
      rangeCategories: ["RANGED"],
      rangedTargets: 1,
    }),
    expected: {
      physicalThreat: "NONE",
      mentalThreat: "NONE",
      physicalSurvivability: "TRACE",
      mentalSurvivability: "NONE",
      manipulation: "LOW",
      presence: "TRACE",
      mobility: "NONE",
      synergy: "NONE",
    },
  }),
  {
    id: "level-10-elite-area-threat",
    title: "level 10 elite area threat",
    group: expandedFixtureGroup,
    monster: createBaseMonster({
      name: "Level 10 Elite Area Threat",
      level: 10,
      tier: "ELITE",
      physicalResilienceCurrent: 72,
      physicalResilienceMax: 72,
      mentalPerseveranceCurrent: 42,
      mentalPerseveranceMax: 42,
      attackDie: "D8",
      guardDie: "D8",
      fortitudeDie: "D10",
      attacks: [
        createNaturalAttack("Sweeping Flame", {
          aoe: {
            enabled: true,
            count: 2,
            centerRange: 30,
            shape: "SPHERE",
            sphereRadiusFeet: 5,
            physicalStrength: 1,
            mentalStrength: 0,
            damageTypes: [{ name: "Fire", mode: "PHYSICAL" }],
            attackEffects: [],
          },
        }),
      ],
    }),
    naturalAttackRangeAxisBonuses: { mobility: 0.5 },
    expected: {
      physicalThreat: "NONE",
      mentalThreat: "NONE",
      physicalSurvivability: "TRACE",
      mentalSurvivability: "NONE",
      manipulation: "NONE",
      mobility: "NONE",
      synergy: "NONE",
      presence: "TRACE",
    },
  },
  {
    id: "level-10-elite-mental-attacker",
    title: "level 10 elite mental attacker",
    group: expandedFixtureGroup,
    monster: createBaseMonster({
      name: "Level 10 Elite Mental Attacker",
      level: 10,
      tier: "ELITE",
      physicalResilienceCurrent: 50,
      physicalResilienceMax: 50,
      mentalPerseveranceCurrent: 80,
      mentalPerseveranceMax: 80,
      mentalProtection: 5,
      naturalMentalProtection: 5,
      attackDie: "D10",
      intellectDie: "D10",
      braveryDie: "D10",
      attacks: [
        createNaturalAttack("Mind Lance", {
          ranged: {
            enabled: true,
            targets: 1,
            distance: 60,
            physicalStrength: 0,
            mentalStrength: 2,
            damageTypes: [{ name: "Psychic", mode: "MENTAL" }],
            attackEffects: [],
          },
        }),
      ],
    }),
    expected: {
      physicalThreat: "NONE",
      mentalThreat: "NONE",
      physicalSurvivability: "TRACE",
      mentalSurvivability: "LOW",
      manipulation: "NONE",
      mobility: "NONE",
      synergy: "NONE",
      presence: "TRACE",
    },
  },
  withPower({
    id: "level-20-boss-mixed-threat",
    title: "level 20 boss mixed threat",
    group: expandedFixtureGroup,
    monster: createBaseMonster({
      name: "Level 20 Boss Mixed Threat",
      level: 20,
      tier: "BOSS",
      physicalResilienceCurrent: 120,
      physicalResilienceMax: 120,
      mentalPerseveranceCurrent: 170,
      mentalPerseveranceMax: 170,
      physicalProtection: 2,
      mentalProtection: 4,
      naturalPhysicalProtection: 2,
      naturalMentalProtection: 4,
      attackDie: "D12",
      guardDie: "D10",
      fortitudeDie: "D12",
      intellectDie: "D10",
      braveryDie: "D10",
      attacks: [
        createNaturalAttack("Titan Cleave and Soul Burn", {
          melee: {
            enabled: true,
            targets: 2,
            physicalStrength: 3,
            mentalStrength: 0,
            damageTypes: [{ name: "Crushing", mode: "PHYSICAL" }],
            attackEffects: [],
          },
          ranged: {
            enabled: true,
            targets: 1,
            distance: 60,
            physicalStrength: 0,
            mentalStrength: 3,
            damageTypes: [{ name: "Psychic", mode: "MENTAL" }],
            attackEffects: [],
          },
        }),
      ],
    }),
    power: createPower({
      name: "Forceful Reposition",
      packet: createPacket("MOVEMENT", {
        applyTo: "PRIMARY_TARGET",
        hostility: "HOSTILE",
        diceCount: 2,
        potency: 2,
        detailsJson: { movementMode: "Force Push", rangeCategory: "RANGED" },
      }),
      rangeCategories: ["RANGED"],
      rangedTargets: 2,
    }),
    expected: {
      physicalThreat: "TRACE",
      mentalThreat: "NONE",
      physicalSurvivability: "NONE",
      mentalSurvivability: "TRACE",
      presence: "TRACE",
      mobility: "NONE",
      manipulation: "NONE",
      synergy: "NONE",
    },
  }),
  {
    id: "level-20-boss-tank",
    title: "level 20 boss tank",
    group: expandedFixtureGroup,
    monster: createBaseMonster({
      name: "Level 20 Boss Tank",
      level: 20,
      tier: "BOSS",
      physicalResilienceCurrent: 280,
      physicalResilienceMax: 280,
      mentalPerseveranceCurrent: 190,
      mentalPerseveranceMax: 190,
      physicalProtection: 9,
      mentalProtection: 5,
      naturalPhysicalProtection: 9,
      naturalMentalProtection: 5,
      attackDie: "D8",
      guardDie: "D12",
      fortitudeDie: "D12",
      braveryDie: "D12",
    }),
    equippedWeaponSources: [
      {
        id: "calibration-boss-tank-slam",
        label: "Main Hand: Heavy Shield Slam",
        attackConfig: {
          melee: {
            enabled: true,
            targets: 1,
            physicalStrength: 1,
            mentalStrength: 0,
            damageTypes: [{ name: "Bludgeoning", mode: "PHYSICAL" }],
          },
        },
      },
    ],
    traitAxisBonuses: { presence: 6 },
    expected: {
      physicalSurvivability: "TRACE",
      mentalSurvivability: "TRACE",
      physicalThreat: "NONE",
      mentalThreat: "NONE",
      mobility: "NONE",
      manipulation: "NONE",
      synergy: "NONE",
      presence: "TRACE",
    },
  },
  withPower({
    id: "high-mobility-skirmisher",
    title: "high mobility skirmisher",
    group: expandedFixtureGroup,
    monster: createBaseMonster({
      name: "High Mobility Skirmisher",
      level: 8,
      tier: "SOLDIER",
      physicalResilienceCurrent: 34,
      physicalResilienceMax: 34,
      mentalPerseveranceCurrent: 22,
      mentalPerseveranceMax: 22,
      attackDie: "D8",
      guardDie: "D10",
      attacks: [
        createNaturalAttack("Skirmisher Blade", {
          melee: {
            enabled: true,
            targets: 1,
            physicalStrength: 1,
            mentalStrength: 0,
            damageTypes: [{ name: "Slashing", mode: "PHYSICAL" }],
            attackEffects: ["Follow-up cut on greater success"],
          },
        }),
      ],
    }),
    naturalAttackGsAxisBonuses: { physicalThreat: 4.5 },
    power: createPower({
      name: "Blink Step",
      packet: createPacket("MOVEMENT", {
        applyTo: "SELF",
        diceCount: 4,
        potency: 3,
        detailsJson: { movementMode: "Teleport", rangeCategory: "SELF" },
      }),
      cooldownTurns: 1,
    }),
    expected: {
      mobility: "LOW",
      physicalThreat: "TRACE",
      physicalSurvivability: "TRACE",
      mentalSurvivability: "NONE",
      manipulation: "NONE",
      synergy: "NONE",
      presence: "NONE",
    },
  }),
  withPower({
    id: "level-5-elite-self-run-2-2",
    title: "level 5 elite self run 2/2",
    group: expandedFixtureGroup,
    monster: createBaseMonster({
      name: "Level 5 Elite Self Run 2/2",
      level: 5,
      tier: "ELITE",
      physicalResilienceCurrent: 30,
      physicalResilienceMax: 30,
      mentalPerseveranceCurrent: 24,
      mentalPerseveranceMax: 24,
    }),
    power: createPower({
      name: "Elite Battle Run",
      packet: createPacket("MOVEMENT", {
        applyTo: "SELF",
        diceCount: 2,
        potency: 2,
        detailsJson: { movementMode: "Run", rangeCategory: "SELF" },
      }),
    }),
    expected: {
      mobility: "TRACE",
      manipulation: "NONE",
      synergy: "NONE",
    },
  }),
  withPower({
    id: "support-commander",
    title: "support commander",
    group: expandedFixtureGroup,
    monster: createBaseMonster({
      name: "Support Commander",
      level: 8,
      tier: "SOLDIER",
      physicalResilienceCurrent: 34,
      physicalResilienceMax: 34,
      mentalPerseveranceCurrent: 34,
      mentalPerseveranceMax: 34,
      attackDie: "D6",
      synergyDie: "D10",
      braveryDie: "D8",
    }),
    traitAxisBonuses: { presence: 2 },
    power: createPower({
      name: "Battle Orders",
      packet: createPacket("AUGMENT", {
        applyTo: "ALLIES",
        diceCount: 4,
        potency: 3,
        effectDurationType: "TURNS",
        effectDurationTurns: 2,
        detailsJson: { statTarget: "Attack", rangeCategory: "RANGED" },
      }),
      rangeCategories: ["RANGED"],
      rangedTargets: 3,
    }),
    expected: {
      synergy: "HIGH",
      physicalThreat: "NONE",
      mentalThreat: "NONE",
      physicalSurvivability: "NONE",
      mentalSurvivability: "NONE",
      presence: "TRACE",
      manipulation: "NONE",
      mobility: "NONE",
    },
  }),
  {
    id: "low-threat-tank",
    title: "low threat tank",
    group: expandedFixtureGroup,
    monster: createBaseMonster({
      name: "Low Threat Tank",
      level: 10,
      tier: "ELITE",
      physicalResilienceCurrent: 65,
      physicalResilienceMax: 65,
      mentalPerseveranceCurrent: 74,
      mentalPerseveranceMax: 74,
      physicalProtection: 4,
      mentalProtection: 5,
      naturalPhysicalProtection: 4,
      naturalMentalProtection: 5,
      attackDie: "D6",
      guardDie: "D12",
      fortitudeDie: "D12",
      braveryDie: "D10",
    }),
    traitAxisBonuses: { presence: 3 },
    expected: {
      physicalSurvivability: "TRACE",
      mentalSurvivability: "LOW",
      physicalThreat: "NONE",
      mentalThreat: "NONE",
      mobility: "NONE",
      manipulation: "NONE",
      synergy: "NONE",
      presence: "TRACE",
    },
  },
  withPower({
    id: "glass-cannon-with-power",
    title: "glass cannon with power",
    group: expandedFixtureGroup,
    monster: createBaseMonster({
      name: "Glass Cannon With Power",
      level: 10,
      tier: "ELITE",
      physicalResilienceCurrent: 16,
      physicalResilienceMax: 16,
      mentalPerseveranceCurrent: 18,
      mentalPerseveranceMax: 18,
      attackDie: "D10",
      intellectDie: "D8",
      attacks: [
        createNaturalAttack("Volatile Focus Bolt", {
          ranged: {
            enabled: true,
            targets: 1,
            distance: 60,
            physicalStrength: 0,
            mentalStrength: 0,
            damageTypes: [{ name: "Fire", mode: "PHYSICAL" }],
            attackEffects: ["Overload on greater success"],
          },
        }),
      ],
    }),
    traitAxisBonuses: { physicalSurvivability: -4 },
    naturalAttackGsAxisBonuses: { physicalThreat: 9 },
    power: createPower({
      name: "Focused Ruin",
      packet: createPacket("ATTACK", {
        applyTo: "PRIMARY_TARGET",
        hostility: "HOSTILE",
        diceCount: 5,
        potency: 4,
        woundChannel: "PHYSICAL",
        detailsJson: {
          attackMode: "PHYSICAL",
          damageTypes: ["Fire", "Piercing"],
          rangeCategory: "RANGED",
        },
      }),
      rangeCategories: ["RANGED"],
      rangedTargets: 1,
      cooldownTurns: 1,
    }),
    expected: {
      physicalThreat: "LOW",
      mentalThreat: "NONE",
      physicalSurvivability: "NONE",
      mentalSurvivability: "NONE",
      mobility: "NONE",
      presence: "TRACE",
      manipulation: "NONE",
      synergy: "NONE",
    },
  }),
];

const reports = fixtures.map(evaluateFixture);

console.log("Outcome Calibration Harness");
console.log(
  `Expected radar bands: ${Object.entries(EXPECTED_BANDS)
    .map(([name, range]) => `${name}=${range.min === range.max ? range.min : `${range.min}-${range.max}`}`)
    .join(", ")}`,
);
console.log(`Calibration tuning mode: ${calibrationTuningMode}`);
console.log(`Balance truth status: ${balanceTruthStatus}`);
for (const warning of tuningModeWarnings) {
  console.log(`WARNING: ${warning}`);
}
console.log("Tuning source:");
for (const source of tuningSources) {
  console.log(`- ${formatTuningSource(source)}`);
}
console.log(`Fixtures: ${reports.length}`);

for (const report of reports) {
  printFixtureReport(report);
}

const initialFailures = reports.flatMap((report) =>
  report.axisEvaluations
    .filter((row) => row.status !== "pass")
    .map((row) => ({
      fixtureId: report.id,
      fixtureName: report.title,
      fixtureGroup: report.group,
      level: report.level,
      tier: report.tier,
      axis: row.axis,
      expectedBand: row.expected,
      rawImpliedBand: row.rawImpliedBand,
      rawPreNormalizationValue: row.finalPreNormalizationValue,
      actualRadarBand: row.actualBand,
      radarValue: row.radarValue,
      status: row.status,
      classification: row.classification,
      suggestedOwnerLayer: row.ownerLayer,
      classificationReason: row.classificationReason,
    })),
);

const mismatchGroupingDiagnostics = initialFailures.reduce(
  (acc, row) => {
    const key = [
      row.suggestedOwnerLayer ?? "Code seam",
      row.axis,
      `level-${row.level}`,
      row.tier,
      row.fixtureGroup,
    ].join(" | ");
    acc[key] = acc[key] ?? {
      ownerLayer: row.suggestedOwnerLayer ?? "Code seam",
      axis: row.axis,
      level: row.level,
      tier: row.tier,
      fixtureGroup: row.fixtureGroup,
      count: 0,
      fixtureIds: [] as string[],
    };
    acc[key].count += 1;
    acc[key].fixtureIds.push(row.fixtureId);
    return acc;
  },
  {} as Record<
    string,
    {
      ownerLayer: OwnerLayer;
      axis: AxisKey;
      level: number;
      tier: MonsterUpsertInput["tier"];
      fixtureGroup: FixtureGroup;
      count: number;
      fixtureIds: string[];
    }
  >,
);

const outcomeNormalizationMismatchDetails = reports.flatMap((report) =>
  report.axisEvaluations
    .filter((row) => row.status !== "pass" && row.ownerLayer === "Outcome Normalization")
    .map((row) => {
      const curvePoint = report.normalization.displayCurvePoints[row.axis];
      return {
        fixtureId: report.id,
        level: report.level,
        tier: report.tier,
        axis: row.axis,
        expectedBand: row.expected,
        rawPreNormalizationValue: row.finalPreNormalizationValue,
        rawImpliedBand: row.rawImpliedBand,
        radarValue: row.radarValue,
        radarBand: row.actualBand,
        displayCurveMin: curvePoint?.min ?? null,
        displayCurveMax: curvePoint?.max ?? null,
        tierMultiplierUsed: report.normalization.tierMultiplier,
        displayDirection: displayDirectionForValue(row.radarValue, row.expected),
      };
    }),
);

const outcomeNormalizationMismatchSummaryByAxis = AXES.flatMap((axis) => {
  const rows = outcomeNormalizationMismatchDetails.filter((row) => row.axis === axis);
  if (rows.length === 0) return [];
  const averageRawValue = round(
    rows.reduce((sum, row) => sum + row.rawPreNormalizationValue, 0) / rows.length,
  );
  const averageRadarValue = round(
    rows.reduce((sum, row) => sum + row.radarValue, 0) / rows.length,
  );
  const tooHigh = rows.filter((row) => row.displayDirection === "TOO_HIGH").length;
  const tooLow = rows.filter((row) => row.displayDirection === "TOO_LOW").length;
  const onBand = rows.filter((row) => row.displayDirection === "ON_BAND").length;
  return [
    {
      axis,
      count: rows.length,
      averageRawValue,
      averageRadarValue,
      tooHigh,
      tooLow,
      onBand,
      mostDirection:
        tooHigh > tooLow && tooHigh > onBand
          ? "TOO_HIGH"
          : tooLow > tooHigh && tooLow > onBand
            ? "TOO_LOW"
            : "MIXED",
    },
  ];
});

const summaryByGroup = reports.reduce(
  (acc, report) => {
    acc[report.group] = acc[report.group] ?? {
      fixtureCount: 0,
      pass: 0,
      warn: 0,
      fail: 0,
      mismatchCount: 0,
    };
    acc[report.group].fixtureCount += 1;
    acc[report.group][report.status] += 1;
    acc[report.group].mismatchCount += report.axisEvaluations.filter(
      (row) => row.status !== "pass",
    ).length;
    return acc;
  },
  {} as Record<
    FixtureGroup,
    {
      fixtureCount: number;
      pass: number;
      warn: number;
      fail: number;
      mismatchCount: number;
    }
  >,
);

const mismatchSummaryByOwnerLayer = initialFailures.reduce(
  (acc, row) => {
    const owner = row.suggestedOwnerLayer ?? "Code seam";
    acc[owner] = acc[owner] ?? {
      count: 0,
      rawValue: 0,
      displayNormalization: 0,
      fixtureExpectation: 0,
      mismatches: [] as typeof initialFailures,
    };
    acc[owner].count += 1;
    if (row.classification === "RAW_VALUE") acc[owner].rawValue += 1;
    if (row.classification === "DISPLAY_NORMALIZATION") {
      acc[owner].displayNormalization += 1;
    }
    if (row.classification === "FIXTURE_EXPECTATION") {
      acc[owner].fixtureExpectation += 1;
    }
    acc[owner].mismatches.push(row);
    return acc;
  },
  {} as Record<
    OwnerLayer,
    {
      count: number;
      rawValue: number;
      displayNormalization: number;
      fixtureExpectation: number;
      mismatches: typeof initialFailures;
    }
  >,
);

printSection(
  "higher-level/tier mismatch grouping diagnostics",
  Object.values(mismatchGroupingDiagnostics)
    .filter((row) => row.fixtureGroup === "higher-level-tier")
    .sort((a, b) =>
      `${a.ownerLayer}.${a.axis}.${a.level}.${a.tier}`.localeCompare(
        `${b.ownerLayer}.${b.axis}.${b.level}.${b.tier}`,
      ),
    ),
);

printSection(
  "Outcome Normalization mismatch details",
  outcomeNormalizationMismatchDetails,
);

printSection(
  "Outcome Normalization mismatch summary by axis",
  outcomeNormalizationMismatchSummaryByAxis,
);

printSection(
  "summary",
  {
    fixtureCount: reports.length,
    pass: reports.filter((report) => report.status === "pass").length,
    warn: reports.filter((report) => report.status === "warn").length,
    fail: reports.filter((report) => report.status === "fail").length,
    mismatchCount: initialFailures.length,
    summaryByGroup,
    mismatchGroupingDiagnostics,
    outcomeNormalizationMismatchDetails,
    outcomeNormalizationMismatchSummaryByAxis,
    initialFailures,
    rawValueIssues: initialFailures.filter((row) => row.classification === "RAW_VALUE"),
    displayNormalizationIssues: initialFailures.filter(
      (row) => row.classification === "DISPLAY_NORMALIZATION",
    ),
    fixtureExpectationIssues: initialFailures.filter(
      (row) => row.classification === "FIXTURE_EXPECTATION",
    ),
    mismatchSummaryByOwnerLayer,
  },
);
