import { inspect } from "node:util";

import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import {
  computeMonsterOutcomes,
  type CanonicalPowerContribution,
  type DefensiveProfileSource,
  type RadarAxes,
  type WeaponAttackSource,
} from "../lib/calculators/monsterOutcomeCalculator";
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
  const breakdown = resolvePowerCost(fixture.power);
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
  const result = computeMonsterOutcomes(fixture.monster, calculatorConfig, {
    equippedWeaponSources: fixture.equippedWeaponSources,
    defensiveProfileSources: fixture.defensiveProfileSources,
    defensiveProfileContext: fixture.defensiveProfileContext,
    equipmentModifierAxisBonuses: fixture.equipmentModifierAxisBonuses,
    naturalAttackGsAxisBonuses: fixture.naturalAttackGsAxisBonuses,
    naturalAttackRangeAxisBonuses: fixture.naturalAttackRangeAxisBonuses,
    powerContribution: fixture.powerContribution,
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
  console.log(`\n=== ${report.id}: ${report.title} [${report.status.toUpperCase()}] ===`);
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
      physicalSurvivability: "LOW",
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
      physicalSurvivability: "LOW",
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
      physicalSurvivability: "LOW",
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
      physicalSurvivability: "MEDIUM",
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
      physicalSurvivability: "LOW",
      mentalSurvivability: "HIGH",
      physicalThreat: "NONE",
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
      manipulation: "MEDIUM",
      mobility: "LOW",
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
      physicalSurvivability: "MEDIUM",
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
      physicalSurvivability: "MEDIUM",
      synergy: "LOW",
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
      physicalSurvivability: "HIGH",
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
      synergy: "MEDIUM",
      physicalSurvivability: "MEDIUM",
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
      manipulation: "MEDIUM",
      physicalThreat: "TRACE",
      presence: "TRACE",
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
      manipulation: "HIGH",
      presence: "TRACE",
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
  "summary",
  {
    fixtureCount: reports.length,
    pass: reports.filter((report) => report.status === "pass").length,
    warn: reports.filter((report) => report.status === "warn").length,
    fail: reports.filter((report) => report.status === "fail").length,
    mismatchCount: initialFailures.length,
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
