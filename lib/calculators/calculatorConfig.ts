import {
  LEVEL_3_SEMANTIC_SYNERGY_TUNING,
  type SemanticSynergyTuning,
} from "@/lib/calculators/semanticSynergy";

export type LevelCurvePoint = { level: number; min: number; max: number };

export type DurabilityLaneBaseline = {
  expectedHp: number;
  expectedProtection: number;
  expectedDefenceDice: number;
  expectedDefenceDieSides: 4 | 6 | 8 | 10 | 12;
  expectedBlockPerSuccess: number;
  expectedDodgeDice: number;
  expectedDodgeDieSides: 4 | 6 | 8 | 10 | 12;
  expectedResistCoverage: number;
  resistGateWeights: Partial<
    Record<"ATTACK" | "GUARD" | "FORTITUDE" | "INTELLECT" | "SYNERGY" | "BRAVERY", number>
  >;
  representativeInjuryDieSides: 4 | 6 | 8 | 10 | 12;
};

export type Level3DurabilityReferenceAttributes = {
  expectedTotal: number;
  attackDie: "D4" | "D6" | "D8" | "D10" | "D12";
  guardDie: "D4" | "D6" | "D8" | "D10" | "D12";
  fortitudeDie: "D4" | "D6" | "D8" | "D10" | "D12";
  intellectDie: "D4" | "D6" | "D8" | "D10" | "D12";
  synergyDie: "D4" | "D6" | "D8" | "D10" | "D12";
  braveryDie: "D4" | "D6" | "D8" | "D10" | "D12";
};

export type DurabilityBaselinePackage = {
  id: string;
  level: number;
  tier: "MINION" | "SOLDIER" | "ELITE" | "BOSS";
  legendary: boolean;
  referenceAttributes: Level3DurabilityReferenceAttributes;
  physical: DurabilityLaneBaseline;
  mental: DurabilityLaneBaseline;
};

export const LEVEL_3_DURABILITY_REFERENCE_ATTRIBUTES = {
  MINION: {
    expectedTotal: 34,
    attackDie: "D4",
    guardDie: "D6",
    fortitudeDie: "D6",
    intellectDie: "D6",
    synergyDie: "D6",
    braveryDie: "D6",
  },
  SOLDIER: {
    expectedTotal: 38,
    attackDie: "D8",
    guardDie: "D4",
    fortitudeDie: "D6",
    intellectDie: "D8",
    synergyDie: "D6",
    braveryDie: "D6",
  },
  ELITE: {
    expectedTotal: 42,
    attackDie: "D10",
    guardDie: "D6",
    fortitudeDie: "D4",
    intellectDie: "D10",
    synergyDie: "D4",
    braveryDie: "D8",
  },
  BOSS: {
    expectedTotal: 46,
    attackDie: "D10",
    guardDie: "D8",
    fortitudeDie: "D4",
    intellectDie: "D10",
    synergyDie: "D6",
    braveryDie: "D8",
  },
} as const satisfies Record<
  "MINION" | "SOLDIER" | "ELITE" | "BOSS",
  Level3DurabilityReferenceAttributes
>;

export type PressureReachCategory = "MELEE" | "RANGED" | "AOE";

export type PressureBaselinePackage = {
  id: string;
  level: number;
  tier: "MINION" | "SOLDIER" | "ELITE" | "BOSS";
  legendary: boolean;
  expectedTargetCount: number;
  expectedReachCategory: PressureReachCategory;
  expectedAreaCoverage: number;
  expectedPersistence: number;
  expectedAvailability: number;
  expectedDistinctMeaningfulPackages: number;
  expectedLinkedThreats: number;
  expectedActionsPerTurn: number;
  expectedResponseBurden: number;
};

export type ControlPressureResistibility = "RESISTED" | "UNRESISTED" | "UNKNOWN";

export type ControlPressureBaselinePackage = {
  id: string;
  referencePackage: string;
  level: number;
  tier: "MINION" | "SOLDIER" | "ELITE" | "BOSS";
  legendary: boolean;
  expectedPackageCount: number;
  expectedEffectSeverity: number;
  expectedTargetBreadth: number;
  expectedDuration: number;
  expectedRecurrence: number;
  expectedAvailability: number;
  expectedCooldownTurns: number;
  expectedSupportedStackImpact: number;
  expectedResistibility: ControlPressureResistibility;
  expectedReliability: number;
  expectedLinkedRelationships: number;
  expectedActionsPerTurn: number;
  expectedPerUseControlProxy: number;
  expectedEncounterControlProxy: number;
};

export type NewFormatDebuffControlTierBaseline = {
  baselineProxy: number;
  normalizationScale: number;
  actionCapacity: number;
};

export type CalculatorConfig = {
  tierMultipliers: {
    MINION: number;
    SOLDIER: number;
    ELITE: number;
    BOSS: number;
    LEGENDARY: number;
  };
  baselineParty: {
    size: number;
    focusedWPR: number;
    typicalWPR: number;
    aoeMultiplier: number;
    netSuccessMultiplier: number;
    combatHorizonRounds: number;
  };
  manipulationTuning: {
    rangeCategoryMultiplier: {
      SELF: number;
      MELEE: number;
      RANGED: number;
      AOE: number;
    };
    rangedDistanceScalarPer30ft: number;
    aoeCastRangeScalarPer30ft: number;
    maxDistanceScalarBonus: number;
    meleeTargetExponent: number;
    rangedTargetExponent: number;
    aoeGridSquareFeet: number;
    aoeMaxExpectedTargets: number;
    aoeCountExponent: number;
    sphereRadiusScalarPer10ft: number;
    coneLengthScalarPer30ft: number;
    lineLengthScalarPer30ft: number;
    lineWidthScalarPer5ft: number;
    maxGeometryScalarBonus: number;
  };
  seuFallbacks: {
    augmentSeuPerSuccess: number;
    augmentSeuPerStack: number;
    debuffSeuPerSuccess: number;
    debuffSeuPerStack: number;
    cleanseSeuPerSuccess: number;
    cleanseSeuPerStack: number;
  };
  naturalAttackTuning: {
    damageOutputWeight: number;
    greaterSuccessEffectWeight: number;
    rangeEffectWeight: number;
  };
  threatAxisTuning: {
    referenceLevel: number;
    referenceDiceCount: number;
    referenceDieSides: number;
    referenceWoundsPerSuccess: number;
    referenceTargetCount: number;
    referenceDamageTypeCount: number;
    levelScalePerLevel: number;
    minLevelScale: number;
    curveExponent: number;
    tierBaselineMultipliers: {
      MINION: number;
      SOLDIER: number;
      ELITE: number;
      BOSS: number;
      LEGENDARY: number;
    };
  };
  pressureAxisTuning: {
    calibratedLevel: number;
    midpointScore: number;
    logRatioScale: number;
    nonCalibratedFallbackMode: "LEGACY_DAMAGE_DUPLICATING_CURVE";
    reachValues: Record<PressureReachCategory, number>;
    componentWeights: {
      targetBreadth: number;
      reach: number;
      areaCoverage: number;
      persistence: number;
      availability: number;
      distinctPackages: number;
      linkedThreats: number;
      actionEconomy: number;
      responseBurden: number;
    };
    componentCaps: {
      targetBreadth: number;
      reach: number;
      areaCoverage: number;
      persistence: number;
      availability: number;
      distinctPackages: number;
      linkedThreats: number;
      actionEconomy: number;
      responseBurden: number;
    };
    baselines: PressureBaselinePackage[];
  };
  controlPressureAxisTuning: {
    calibratedLevel: number;
    midpointScore: number;
    logRatioScale: number;
    nonCalibratedFallbackMode: "LEGACY_COST_COUPLED_MANIPULATION_CURVE";
    reliabilityValues: Record<ControlPressureResistibility, number>;
    componentWeights: {
      effectSeverity: number;
      targetBreadth: number;
      duration: number;
      recurrence: number;
      availability: number;
      supportedStackImpact: number;
      distinctPackages: number;
      actionEconomy: number;
      reliability: number;
      linkedRelationships: number;
    };
    componentCaps: {
      effectSeverity: number;
      targetBreadth: number;
      duration: number;
      recurrence: number;
      availability: number;
      supportedStackImpact: number;
      distinctPackages: number;
      actionEconomy: number;
      reliability: number;
      linkedRelationships: number;
    };
    baselines: ControlPressureBaselinePackage[];
    newFormatDebuff: {
      supportedLevel: 3;
      coefficient: 4;
      referenceConstant: number;
      tierBaselines: Record<
        "MINION" | "SOLDIER" | "ELITE" | "BOSS",
        NewFormatDebuffControlTierBaseline
      >;
    };
  };
  semanticSynergyAxisTuning: SemanticSynergyTuning;
  durabilityAxisTuning: {
    calibratedLevel: number;
    midpointScore: number;
    scoreHalfRange: number;
    logRatioScale: number;
    referenceIncomingDiceCount: number;
    referenceIncomingDieSides: 4 | 6 | 8 | 10 | 12;
    referenceWoundsPerSuccess: number;
    referenceDefenceUsesPerRound: number;
    protectionPreventionPerPoint: number;
    authoredProtectionStaticRuntimeShare: number;
    resistPreventionPerCoveragePoint: number;
    defencePreventionMaxShare: number;
    dodgePreventionMaxShare: number;
    protectionPreventionMaxShare: number;
    resistPreventionMaxShare: number;
    totalPreventionMaxShare: number;
    supplementalContributionMaxRatio: number;
    representativeLegendaryOverflowDamage: number;
    baselines: DurabilityBaselinePackage[];
  };
  healthPoolTuning: {
    expectedPhysicalResilienceAt1: number;
    expectedPhysicalResiliencePerLevel: number;
    expectedMentalPerseveranceAt1: number;
    expectedMentalPerseverancePerLevel: number;

    expectedPoolTierMultipliers: {
      MINION: number;
      SOLDIER: number;
      ELITE: number;
      BOSS: number;
    };

    weakerSideWeight: number;
    averageWeight: number;

    poolAtExpectedShare: number;
    belowExpectedMaxPenaltyShare: number;
    belowExpectedScale: number;
    aboveExpectedMaxBonusShare: number;
    aboveExpectedScale: number;
  };
  scoringCurves: {
    physicalThreat: LevelCurvePoint[];
    mentalThreat: LevelCurvePoint[];
    physicalSurvivability: LevelCurvePoint[];
    mentalSurvivability: LevelCurvePoint[];
    manipulation: LevelCurvePoint[];
    synergy: LevelCurvePoint[];
    mobility: LevelCurvePoint[];
    presence: LevelCurvePoint[];
  };
};

function makeLinearCurve(opts: {
  minAt1: number;
  maxAt1: number;
  minPerLevel: number;
  maxPerLevel: number;
  maxLevel?: number;
}): LevelCurvePoint[] {
  const maxLevel = opts.maxLevel ?? 20;
  const out: LevelCurvePoint[] = [];
  for (let level = 1; level <= maxLevel; level += 1) {
    out.push({
      level,
      min: opts.minAt1 + (level - 1) * opts.minPerLevel,
      max: opts.maxAt1 + (level - 1) * opts.maxPerLevel,
    });
  }
  return out;
}

function withCurvePointOverrides(
  curve: LevelCurvePoint[],
  overrides: Record<number, Partial<Omit<LevelCurvePoint, "level">>>,
): LevelCurvePoint[] {
  return curve.map((point) => ({
    ...point,
    ...(overrides[point.level] ?? {}),
  }));
}

const PHYSICAL_RESIST_COVERAGE_WEIGHTS = { GUARD: 0.5, FORTITUDE: 0.5 } as const;
const MENTAL_RESIST_COVERAGE_WEIGHTS = {
  INTELLECT: 1 / 3,
  SYNERGY: 1 / 3,
  BRAVERY: 1 / 3,
} as const;

export const calculatorConfig: CalculatorConfig = {
  tierMultipliers: {
    MINION: 0.6,
    SOLDIER: 0.8,
    ELITE: 1.0,
    BOSS: 1.5,
    LEGENDARY: 2.0,
  },
  baselineParty: {
    size: 4,
    focusedWPR: 32,
    typicalWPR: 18,
    aoeMultiplier: 1.3,
    netSuccessMultiplier: 0.7,
    combatHorizonRounds: 5,
  },
  manipulationTuning: {
    rangeCategoryMultiplier: {
      SELF: 0.6,
      MELEE: 0.85,
      RANGED: 1.0,
      AOE: 1.15,
    },
    rangedDistanceScalarPer30ft: 0.05,
    aoeCastRangeScalarPer30ft: 0.05,
    maxDistanceScalarBonus: 0.5,
    meleeTargetExponent: 0.7,
    rangedTargetExponent: 0.8,
    aoeGridSquareFeet: 25,
    aoeMaxExpectedTargets: 12,
    aoeCountExponent: 0.5,
    sphereRadiusScalarPer10ft: 0.08,
    coneLengthScalarPer30ft: 0.08,
    lineLengthScalarPer30ft: 0.06,
    lineWidthScalarPer5ft: 0.06,
    maxGeometryScalarBonus: 0.75,
  },
  seuFallbacks: {
    augmentSeuPerSuccess: 0.25,
    augmentSeuPerStack: 0.15,
    debuffSeuPerSuccess: 0.25,
    debuffSeuPerStack: 0.15,
    cleanseSeuPerSuccess: 0.25,
    cleanseSeuPerStack: 0.15,
  },
  naturalAttackTuning: {
    damageOutputWeight: 1,
    greaterSuccessEffectWeight: 1,
    rangeEffectWeight: 1,
  },
  threatAxisTuning: {
    referenceLevel: 3,
    referenceDiceCount: 4,
    referenceDieSides: 8,
    referenceWoundsPerSuccess: 2,
    referenceTargetCount: 1,
    referenceDamageTypeCount: 1,
    levelScalePerLevel: 0.25,
    minLevelScale: 0.5,
    curveExponent: 1.35,
    tierBaselineMultipliers: {
      MINION: 0.6,
      SOLDIER: 1,
      ELITE: 1,
      BOSS: 3,
      LEGENDARY: 4,
    },
  },
  pressureAxisTuning: {
    calibratedLevel: 3,
    midpointScore: 5,
    logRatioScale: 2.5,
    nonCalibratedFallbackMode: "LEGACY_DAMAGE_DUPLICATING_CURVE",
    reachValues: {
      MELEE: 1,
      RANGED: 1.12,
      AOE: 1.2,
    },
    componentWeights: {
      targetBreadth: 0.25,
      reach: 0.08,
      areaCoverage: 0.12,
      persistence: 0.14,
      availability: 0.12,
      distinctPackages: 0.17,
      linkedThreats: 0.05,
      actionEconomy: 0.07,
      responseBurden: 0,
    },
    componentCaps: {
      targetBreadth: 3.5,
      reach: 1.2,
      areaCoverage: 1.25,
      persistence: 1.25,
      availability: 1,
      distinctPackages: 4,
      linkedThreats: 2,
      actionEconomy: 2,
      responseBurden: 1,
    },
    baselines: [
      {
        id: "l3-minion-pressure-standard-v1",
        level: 3,
        tier: "MINION",
        legendary: false,
        expectedTargetCount: 1,
        expectedReachCategory: "MELEE",
        expectedAreaCoverage: 0,
        expectedPersistence: 0,
        expectedAvailability: 1,
        expectedDistinctMeaningfulPackages: 1,
        expectedLinkedThreats: 0,
        expectedActionsPerTurn: 1,
        expectedResponseBurden: 0,
      },
      {
        id: "l3-soldier-pressure-standard-v1",
        level: 3,
        tier: "SOLDIER",
        legendary: false,
        expectedTargetCount: 1,
        expectedReachCategory: "MELEE",
        expectedAreaCoverage: 0,
        expectedPersistence: 0,
        expectedAvailability: 0.875,
        expectedDistinctMeaningfulPackages: 2,
        expectedLinkedThreats: 0,
        expectedActionsPerTurn: 1,
        expectedResponseBurden: 0,
      },
      {
        id: "l3-elite-pressure-standard-v1",
        level: 3,
        tier: "ELITE",
        legendary: false,
        expectedTargetCount: 1,
        expectedReachCategory: "RANGED",
        expectedAreaCoverage: 0,
        expectedPersistence: 0,
        expectedAvailability: 0.875,
        expectedDistinctMeaningfulPackages: 2,
        expectedLinkedThreats: 0,
        expectedActionsPerTurn: 1,
        expectedResponseBurden: 0,
      },
      {
        id: "l3-legendary-elite-pressure-standard-v1",
        level: 3,
        tier: "ELITE",
        legendary: true,
        expectedTargetCount: 1,
        expectedReachCategory: "MELEE",
        expectedAreaCoverage: 0,
        expectedPersistence: 0.3333333333333333,
        expectedAvailability: 0.6,
        expectedDistinctMeaningfulPackages: 3,
        expectedLinkedThreats: 2,
        expectedActionsPerTurn: 1,
        expectedResponseBurden: 0,
      },
      {
        id: "l3-boss-pressure-standard-v1",
        level: 3,
        tier: "BOSS",
        legendary: false,
        expectedTargetCount: 2,
        expectedReachCategory: "MELEE",
        expectedAreaCoverage: 0.35,
        expectedPersistence: 0,
        expectedAvailability: 1,
        expectedDistinctMeaningfulPackages: 1,
        expectedLinkedThreats: 0,
        expectedActionsPerTurn: 2,
        expectedResponseBurden: 0,
      },
      {
        id: "l3-legendary-boss-pressure-standard-v1",
        level: 3,
        tier: "BOSS",
        legendary: true,
        expectedTargetCount: 2,
        expectedReachCategory: "RANGED",
        expectedAreaCoverage: 0.35,
        expectedPersistence: 0,
        expectedAvailability: 0.875,
        expectedDistinctMeaningfulPackages: 2,
        expectedLinkedThreats: 0,
        expectedActionsPerTurn: 2,
        expectedResponseBurden: 0,
      },
    ],
  },
  controlPressureAxisTuning: {
    calibratedLevel: 3,
    midpointScore: 5,
    // Legacy Control uses the same coefficient-4 logarithmic normalization
    // family as supported semantic Debuff Control. A base-10 ratio keeps the
    // exact penetration sweep useful through the bounded 0-10 radar range.
    logRatioScale: 4,
    nonCalibratedFallbackMode: "LEGACY_COST_COUPLED_MANIPULATION_CURVE",
    reliabilityValues: {
      RESISTED: 0.85,
      UNRESISTED: 1,
      UNKNOWN: 0.9,
    },
    componentWeights: {
      effectSeverity: 0.29,
      targetBreadth: 0.14,
      duration: 0.09,
      recurrence: 0.07,
      availability: 0.14,
      supportedStackImpact: 0.06,
      distinctPackages: 0.1,
      actionEconomy: 0.04,
      reliability: 0.05,
      linkedRelationships: 0.02,
    },
    componentCaps: {
      effectSeverity: 10,
      targetBreadth: 10,
      duration: 6,
      recurrence: 3,
      availability: 4,
      supportedStackImpact: 5,
      distinctPackages: 4,
      actionEconomy: 2,
      reliability: 4,
      linkedRelationships: 2,
    },
    newFormatDebuff: {
      supportedLevel: 3,
      coefficient: 4,
      referenceConstant: 2.4903429574618414,
      tierBaselines: {
        MINION: {
          baselineProxy: 1.25771484375,
          normalizationScale: 0.5050368022530775,
          actionCapacity: 1,
        },
        SOLDIER: {
          baselineProxy: 2.429901123046875,
          normalizationScale: 0.9757295137869008,
          actionCapacity: 1,
        },
        ELITE: {
          baselineProxy: 9.009,
          normalizationScale: 3.617574026503553,
          actionCapacity: 1,
        },
        BOSS: {
          baselineProxy: 10.8108,
          normalizationScale: 4.341088831804264,
          actionCapacity: 2,
        },
      },
    },
    baselines: [
      {
        id: "l3-minion-control-pressure-standard-v1",
        referencePackage:
          "One resisted 1D4 forced-movement packet against the matched 3D8 reference; one target, one turn, severity 1, cooldown 1.",
        level: 3,
        tier: "MINION",
        legendary: false,
        expectedPackageCount: 1,
        expectedEffectSeverity: 1,
        expectedTargetBreadth: 1,
        expectedDuration: 1,
        expectedRecurrence: 0,
        expectedAvailability: 0.9,
        expectedCooldownTurns: 1,
        expectedSupportedStackImpact: 1,
        expectedResistibility: "RESISTED",
        expectedReliability: 0.01318359375,
        expectedLinkedRelationships: 0,
        expectedActionsPerTurn: 1,
        expectedPerUseControlProxy: 0.01318359375,
        expectedEncounterControlProxy: 0.011865234375,
      },
      {
        id: "l3-soldier-control-pressure-standard-v1",
        referencePackage:
          "One unresisted 1D8 Main Action denial packet; one target, one turn, severity 3, cooldown 2.",
        level: 3,
        tier: "SOLDIER",
        legendary: false,
        expectedPackageCount: 1,
        expectedEffectSeverity: 3,
        expectedTargetBreadth: 1,
        expectedDuration: 1,
        expectedRecurrence: 0,
        expectedAvailability: 0.75,
        expectedCooldownTurns: 2,
        expectedSupportedStackImpact: 1,
        expectedResistibility: "UNRESISTED",
        expectedReliability: 0.625,
        expectedLinkedRelationships: 0,
        expectedActionsPerTurn: 1,
        expectedPerUseControlProxy: 1.875,
        expectedEncounterControlProxy: 1.40625,
      },
      {
        id: "l3-elite-control-pressure-standard-v1",
        referencePackage:
          "One resisted 3D10 movement-denial packet against the matched 3D8 reference; one target, two turns, severity 2, cooldown 2.",
        level: 3,
        tier: "ELITE",
        legendary: false,
        expectedPackageCount: 1,
        expectedEffectSeverity: 2,
        expectedTargetBreadth: 1,
        expectedDuration: 2,
        expectedRecurrence: 0,
        expectedAvailability: 0.75,
        expectedCooldownTurns: 2,
        expectedSupportedStackImpact: 1,
        expectedResistibility: "RESISTED",
        expectedReliability: 0.5005,
        expectedLinkedRelationships: 0,
        expectedActionsPerTurn: 1,
        expectedPerUseControlProxy: 3.2464453125,
        expectedEncounterControlProxy: 2.434833984375,
      },
      {
        id: "l3-legendary-elite-control-pressure-standard-v1",
        referencePackage:
          "One resisted 3D10 Main Action denial packet against the matched 3D8 reference; one target, two turns, severity 3, cooldown 2.",
        level: 3,
        tier: "ELITE",
        legendary: true,
        expectedPackageCount: 1,
        expectedEffectSeverity: 3,
        expectedTargetBreadth: 1,
        expectedDuration: 2,
        expectedRecurrence: 0,
        expectedAvailability: 0.75,
        expectedCooldownTurns: 2,
        expectedSupportedStackImpact: 1,
        expectedResistibility: "RESISTED",
        expectedReliability: 0.5005,
        expectedLinkedRelationships: 0,
        expectedActionsPerTurn: 1,
        expectedPerUseControlProxy: 4.86966796875,
        expectedEncounterControlProxy: 3.6522509765625,
      },
      {
        id: "l3-boss-control-pressure-standard-v1",
        referencePackage:
          "One resisted 3D10 Main Action denial packet against the matched 3D8 reference; two targets, two turns, severity 3, cooldown 2.",
        level: 3,
        tier: "BOSS",
        legendary: false,
        expectedPackageCount: 1,
        expectedEffectSeverity: 3,
        expectedTargetBreadth: 2,
        expectedDuration: 2,
        expectedRecurrence: 0,
        expectedAvailability: 0.75,
        expectedCooldownTurns: 2,
        expectedSupportedStackImpact: 1,
        expectedResistibility: "RESISTED",
        expectedReliability: 0.5005,
        expectedLinkedRelationships: 0,
        expectedActionsPerTurn: 2,
        expectedPerUseControlProxy: 9.7393359375,
        expectedEncounterControlProxy: 7.304501953125,
      },
      {
        id: "l3-legendary-boss-control-pressure-standard-v1",
        referencePackage:
          "One resisted 6D10 Main Action denial packet against the matched 3D8 reference; two targets, three turns, severity 3, cooldown 4.",
        level: 3,
        tier: "BOSS",
        legendary: true,
        expectedPackageCount: 1,
        expectedEffectSeverity: 3,
        expectedTargetBreadth: 2,
        expectedDuration: 3,
        expectedRecurrence: 0,
        expectedAvailability: 0.35,
        expectedCooldownTurns: 4,
        expectedSupportedStackImpact: 1,
        expectedResistibility: "RESISTED",
        expectedReliability: 0.9280511171875,
        expectedLinkedRelationships: 0,
        expectedActionsPerTurn: 2,
        expectedPerUseControlProxy: 53.01931253906249,
        expectedEncounterControlProxy: 18.55675938867187,
      },
    ],
  },
  semanticSynergyAxisTuning: LEVEL_3_SEMANTIC_SYNERGY_TUNING,
  durabilityAxisTuning: {
    calibratedLevel: 3,
    midpointScore: 5,
    scoreHalfRange: 5,
    logRatioScale: 1.1,
    referenceIncomingDiceCount: 4,
    referenceIncomingDieSides: 8,
    referenceWoundsPerSuccess: 2,
    referenceDefenceUsesPerRound: 2,
    protectionPreventionPerPoint: 0.35,
    // Live monster hydration converts authored Protection into the defence string
    // and exposes no additional static mitigation from that same value.
    authoredProtectionStaticRuntimeShare: 0,
    resistPreventionPerCoveragePoint: 0.35,
    defencePreventionMaxShare: 0.45,
    dodgePreventionMaxShare: 0.35,
    protectionPreventionMaxShare: 0.2,
    resistPreventionMaxShare: 0.2,
    totalPreventionMaxShare: 0.75,
    supplementalContributionMaxRatio: 0.5,
    representativeLegendaryOverflowDamage: 5,
    baselines: [
      {
        id: "l3-minion-standard-v1",
        level: 3,
        tier: "MINION",
        legendary: false,
        referenceAttributes: LEVEL_3_DURABILITY_REFERENCE_ATTRIBUTES.MINION,
        physical: { expectedHp: 12, expectedProtection: 0, expectedDefenceDice: 1, expectedDefenceDieSides: 4, expectedBlockPerSuccess: 0, expectedDodgeDice: 2, expectedDodgeDieSides: 4, expectedResistCoverage: 0, resistGateWeights: PHYSICAL_RESIST_COVERAGE_WEIGHTS, representativeInjuryDieSides: 4 },
        mental: { expectedHp: 14, expectedProtection: 0, expectedDefenceDice: 1, expectedDefenceDieSides: 4, expectedBlockPerSuccess: 0, expectedDodgeDice: 0, expectedDodgeDieSides: 4, expectedResistCoverage: 0, resistGateWeights: MENTAL_RESIST_COVERAGE_WEIGHTS, representativeInjuryDieSides: 4 },
      },
      {
        id: "l3-soldier-standard-v1",
        level: 3,
        tier: "SOLDIER",
        legendary: false,
        referenceAttributes: LEVEL_3_DURABILITY_REFERENCE_ATTRIBUTES.SOLDIER,
        physical: { expectedHp: 21, expectedProtection: 1, expectedDefenceDice: 2, expectedDefenceDieSides: 4, expectedBlockPerSuccess: 1, expectedDodgeDice: 2, expectedDodgeDieSides: 4, expectedResistCoverage: 0, resistGateWeights: PHYSICAL_RESIST_COVERAGE_WEIGHTS, representativeInjuryDieSides: 6 },
        mental: { expectedHp: 22, expectedProtection: 1, expectedDefenceDice: 2, expectedDefenceDieSides: 4, expectedBlockPerSuccess: 1, expectedDodgeDice: 0, expectedDodgeDieSides: 4, expectedResistCoverage: 0, resistGateWeights: MENTAL_RESIST_COVERAGE_WEIGHTS, representativeInjuryDieSides: 6 },
      },
      {
        id: "l3-elite-standard-v1",
        level: 3,
        tier: "ELITE",
        legendary: false,
        referenceAttributes: LEVEL_3_DURABILITY_REFERENCE_ATTRIBUTES.ELITE,
        physical: { expectedHp: 34, expectedProtection: 2, expectedDefenceDice: 3, expectedDefenceDieSides: 6, expectedBlockPerSuccess: 1, expectedDodgeDice: 2, expectedDodgeDieSides: 6, expectedResistCoverage: 0, resistGateWeights: PHYSICAL_RESIST_COVERAGE_WEIGHTS, representativeInjuryDieSides: 8 },
        mental: { expectedHp: 38, expectedProtection: 2, expectedDefenceDice: 3, expectedDefenceDieSides: 6, expectedBlockPerSuccess: 1, expectedDodgeDice: 0, expectedDodgeDieSides: 6, expectedResistCoverage: 0, resistGateWeights: MENTAL_RESIST_COVERAGE_WEIGHTS, representativeInjuryDieSides: 8 },
      },
      {
        id: "l3-legendary-elite-standard-v1",
        level: 3,
        tier: "ELITE",
        legendary: true,
        referenceAttributes: LEVEL_3_DURABILITY_REFERENCE_ATTRIBUTES.ELITE,
        physical: { expectedHp: 34, expectedProtection: 1, expectedDefenceDice: 3, expectedDefenceDieSides: 6, expectedBlockPerSuccess: 1, expectedDodgeDice: 3, expectedDodgeDieSides: 6, expectedResistCoverage: 0, resistGateWeights: PHYSICAL_RESIST_COVERAGE_WEIGHTS, representativeInjuryDieSides: 8 },
        mental: { expectedHp: 38, expectedProtection: 1, expectedDefenceDice: 2, expectedDefenceDieSides: 6, expectedBlockPerSuccess: 1, expectedDodgeDice: 0, expectedDodgeDieSides: 6, expectedResistCoverage: 0, resistGateWeights: MENTAL_RESIST_COVERAGE_WEIGHTS, representativeInjuryDieSides: 8 },
      },
      {
        id: "l3-boss-standard-v1",
        level: 3,
        tier: "BOSS",
        legendary: false,
        referenceAttributes: LEVEL_3_DURABILITY_REFERENCE_ATTRIBUTES.BOSS,
        physical: { expectedHp: 66, expectedProtection: 2, expectedDefenceDice: 3, expectedDefenceDieSides: 6, expectedBlockPerSuccess: 1, expectedDodgeDice: 2, expectedDodgeDieSides: 6, expectedResistCoverage: 0, resistGateWeights: PHYSICAL_RESIST_COVERAGE_WEIGHTS, representativeInjuryDieSides: 10 },
        mental: { expectedHp: 74, expectedProtection: 2, expectedDefenceDice: 3, expectedDefenceDieSides: 6, expectedBlockPerSuccess: 1, expectedDodgeDice: 0, expectedDodgeDieSides: 6, expectedResistCoverage: 0, resistGateWeights: MENTAL_RESIST_COVERAGE_WEIGHTS, representativeInjuryDieSides: 10 },
      },
      {
        id: "l3-legendary-boss-standard-v1",
        level: 3,
        tier: "BOSS",
        legendary: true,
        referenceAttributes: LEVEL_3_DURABILITY_REFERENCE_ATTRIBUTES.BOSS,
        physical: { expectedHp: 66, expectedProtection: 2, expectedDefenceDice: 3, expectedDefenceDieSides: 6, expectedBlockPerSuccess: 1, expectedDodgeDice: 2, expectedDodgeDieSides: 6, expectedResistCoverage: 0, resistGateWeights: PHYSICAL_RESIST_COVERAGE_WEIGHTS, representativeInjuryDieSides: 10 },
        mental: { expectedHp: 74, expectedProtection: 2, expectedDefenceDice: 3, expectedDefenceDieSides: 6, expectedBlockPerSuccess: 1, expectedDodgeDice: 0, expectedDodgeDieSides: 6, expectedResistCoverage: 0, resistGateWeights: MENTAL_RESIST_COVERAGE_WEIGHTS, representativeInjuryDieSides: 10 },
      },
    ],
  },
  healthPoolTuning: {
    expectedPhysicalResilienceAt1: 19,
    expectedPhysicalResiliencePerLevel: 1.5,
    expectedMentalPerseveranceAt1: 19,
    expectedMentalPerseverancePerLevel: 1.5,
    expectedPoolTierMultipliers: {
      MINION: 1,
      SOLDIER: 1.5,
      ELITE: 2,
      BOSS: 3,
    },
    weakerSideWeight: 0.75,
    averageWeight: 0.25,
    poolAtExpectedShare: 0,
    belowExpectedMaxPenaltyShare: 0.35,
    belowExpectedScale: 0.25,
    aboveExpectedMaxBonusShare: 0.25,
    aboveExpectedScale: 0.4,
  },
  scoringCurves: {
    physicalThreat: withCurvePointOverrides(
      makeLinearCurve({
        minAt1: 0,
        maxAt1: 10,
        minPerLevel: 0.5,
        maxPerLevel: 2.5,
      }),
      {
        10: { min: 0 },
        20: { min: 0, max: 48 },
      },
    ),
    mentalThreat: makeLinearCurve({
      minAt1: 0,
      maxAt1: 28,
      minPerLevel: 0.2,
      maxPerLevel: -0.15,
    }),
    physicalSurvivability: makeLinearCurve({
      minAt1: 0,
      maxAt1: 14,
      minPerLevel: 0.05,
      maxPerLevel: 0.06,
    }),
    mentalSurvivability: makeLinearCurve({
      minAt1: 0,
      maxAt1: 8,
      minPerLevel: 0,
      maxPerLevel: 0.226,
    }),
    manipulation: makeLinearCurve({
      minAt1: 0,
      maxAt1: 12.5,
      minPerLevel: 0.05,
      maxPerLevel: -0.17,
    }),
    synergy: makeLinearCurve({
      minAt1: 0,
      maxAt1: 6.8,
      minPerLevel: 0.05,
      maxPerLevel: 0.2,
    }),
    mobility: makeLinearCurve({
      minAt1: 0,
      maxAt1: 7,
      minPerLevel: 0,
      maxPerLevel: 0.2,
    }),
    presence: makeLinearCurve({
      minAt1: 0,
      maxAt1: 6.2,
      minPerLevel: 0,
      maxPerLevel: 0.35,
    }),
  },
};

export const defaultCalculatorConfig = calculatorConfig;

export function resolveCalculatorConfig(overrides?: Partial<CalculatorConfig>): CalculatorConfig {
  if (!overrides) return calculatorConfig;

  return {
    tierMultipliers: {
      MINION: overrides.tierMultipliers?.MINION ?? calculatorConfig.tierMultipliers.MINION,
      SOLDIER: overrides.tierMultipliers?.SOLDIER ?? calculatorConfig.tierMultipliers.SOLDIER,
      ELITE: overrides.tierMultipliers?.ELITE ?? calculatorConfig.tierMultipliers.ELITE,
      BOSS: overrides.tierMultipliers?.BOSS ?? calculatorConfig.tierMultipliers.BOSS,
      LEGENDARY:
        overrides.tierMultipliers?.LEGENDARY ?? calculatorConfig.tierMultipliers.LEGENDARY,
    },
    baselineParty: {
      size: overrides.baselineParty?.size ?? calculatorConfig.baselineParty.size,
      focusedWPR:
        overrides.baselineParty?.focusedWPR ?? calculatorConfig.baselineParty.focusedWPR,
      typicalWPR:
        overrides.baselineParty?.typicalWPR ?? calculatorConfig.baselineParty.typicalWPR,
      aoeMultiplier:
        overrides.baselineParty?.aoeMultiplier ?? calculatorConfig.baselineParty.aoeMultiplier,
      netSuccessMultiplier:
        overrides.baselineParty?.netSuccessMultiplier ??
        calculatorConfig.baselineParty.netSuccessMultiplier,
      combatHorizonRounds:
        overrides.baselineParty?.combatHorizonRounds ??
        calculatorConfig.baselineParty.combatHorizonRounds,
    },
    manipulationTuning: {
      rangeCategoryMultiplier: {
        SELF:
          overrides.manipulationTuning?.rangeCategoryMultiplier?.SELF ??
          calculatorConfig.manipulationTuning.rangeCategoryMultiplier.SELF,
        MELEE:
          overrides.manipulationTuning?.rangeCategoryMultiplier?.MELEE ??
          calculatorConfig.manipulationTuning.rangeCategoryMultiplier.MELEE,
        RANGED:
          overrides.manipulationTuning?.rangeCategoryMultiplier?.RANGED ??
          calculatorConfig.manipulationTuning.rangeCategoryMultiplier.RANGED,
        AOE:
          overrides.manipulationTuning?.rangeCategoryMultiplier?.AOE ??
          calculatorConfig.manipulationTuning.rangeCategoryMultiplier.AOE,
      },
      rangedDistanceScalarPer30ft:
        overrides.manipulationTuning?.rangedDistanceScalarPer30ft ??
        calculatorConfig.manipulationTuning.rangedDistanceScalarPer30ft,
      aoeCastRangeScalarPer30ft:
        overrides.manipulationTuning?.aoeCastRangeScalarPer30ft ??
        calculatorConfig.manipulationTuning.aoeCastRangeScalarPer30ft,
      maxDistanceScalarBonus:
        overrides.manipulationTuning?.maxDistanceScalarBonus ??
        calculatorConfig.manipulationTuning.maxDistanceScalarBonus,
      meleeTargetExponent:
        overrides.manipulationTuning?.meleeTargetExponent ??
        calculatorConfig.manipulationTuning.meleeTargetExponent,
      rangedTargetExponent:
        overrides.manipulationTuning?.rangedTargetExponent ??
        calculatorConfig.manipulationTuning.rangedTargetExponent,
      aoeGridSquareFeet:
        overrides.manipulationTuning?.aoeGridSquareFeet ??
        calculatorConfig.manipulationTuning.aoeGridSquareFeet,
      aoeMaxExpectedTargets:
        overrides.manipulationTuning?.aoeMaxExpectedTargets ??
        calculatorConfig.manipulationTuning.aoeMaxExpectedTargets,
      aoeCountExponent:
        overrides.manipulationTuning?.aoeCountExponent ??
        calculatorConfig.manipulationTuning.aoeCountExponent,
      sphereRadiusScalarPer10ft:
        overrides.manipulationTuning?.sphereRadiusScalarPer10ft ??
        calculatorConfig.manipulationTuning.sphereRadiusScalarPer10ft,
      coneLengthScalarPer30ft:
        overrides.manipulationTuning?.coneLengthScalarPer30ft ??
        calculatorConfig.manipulationTuning.coneLengthScalarPer30ft,
      lineLengthScalarPer30ft:
        overrides.manipulationTuning?.lineLengthScalarPer30ft ??
        calculatorConfig.manipulationTuning.lineLengthScalarPer30ft,
      lineWidthScalarPer5ft:
        overrides.manipulationTuning?.lineWidthScalarPer5ft ??
        calculatorConfig.manipulationTuning.lineWidthScalarPer5ft,
      maxGeometryScalarBonus:
        overrides.manipulationTuning?.maxGeometryScalarBonus ??
        calculatorConfig.manipulationTuning.maxGeometryScalarBonus,
    },
    seuFallbacks: {
      augmentSeuPerSuccess:
        overrides.seuFallbacks?.augmentSeuPerSuccess ??
        calculatorConfig.seuFallbacks.augmentSeuPerSuccess,
      augmentSeuPerStack:
        overrides.seuFallbacks?.augmentSeuPerStack ??
        calculatorConfig.seuFallbacks.augmentSeuPerStack,
      debuffSeuPerSuccess:
        overrides.seuFallbacks?.debuffSeuPerSuccess ??
        calculatorConfig.seuFallbacks.debuffSeuPerSuccess,
      debuffSeuPerStack:
        overrides.seuFallbacks?.debuffSeuPerStack ??
        calculatorConfig.seuFallbacks.debuffSeuPerStack,
      cleanseSeuPerSuccess:
        overrides.seuFallbacks?.cleanseSeuPerSuccess ??
        calculatorConfig.seuFallbacks.cleanseSeuPerSuccess,
      cleanseSeuPerStack:
        overrides.seuFallbacks?.cleanseSeuPerStack ??
        calculatorConfig.seuFallbacks.cleanseSeuPerStack,
    },
    naturalAttackTuning: {
      damageOutputWeight:
        overrides.naturalAttackTuning?.damageOutputWeight ??
        calculatorConfig.naturalAttackTuning.damageOutputWeight,
      greaterSuccessEffectWeight:
        overrides.naturalAttackTuning?.greaterSuccessEffectWeight ??
        calculatorConfig.naturalAttackTuning.greaterSuccessEffectWeight,
      rangeEffectWeight:
        overrides.naturalAttackTuning?.rangeEffectWeight ??
        calculatorConfig.naturalAttackTuning.rangeEffectWeight,
    },
    threatAxisTuning: {
      referenceLevel:
        overrides.threatAxisTuning?.referenceLevel ??
        calculatorConfig.threatAxisTuning.referenceLevel,
      referenceDiceCount:
        overrides.threatAxisTuning?.referenceDiceCount ??
        calculatorConfig.threatAxisTuning.referenceDiceCount,
      referenceDieSides:
        overrides.threatAxisTuning?.referenceDieSides ??
        calculatorConfig.threatAxisTuning.referenceDieSides,
      referenceWoundsPerSuccess:
        overrides.threatAxisTuning?.referenceWoundsPerSuccess ??
        calculatorConfig.threatAxisTuning.referenceWoundsPerSuccess,
      referenceTargetCount:
        overrides.threatAxisTuning?.referenceTargetCount ??
        calculatorConfig.threatAxisTuning.referenceTargetCount,
      referenceDamageTypeCount:
        overrides.threatAxisTuning?.referenceDamageTypeCount ??
        calculatorConfig.threatAxisTuning.referenceDamageTypeCount,
      levelScalePerLevel:
        overrides.threatAxisTuning?.levelScalePerLevel ??
        calculatorConfig.threatAxisTuning.levelScalePerLevel,
      minLevelScale:
        overrides.threatAxisTuning?.minLevelScale ??
        calculatorConfig.threatAxisTuning.minLevelScale,
      curveExponent:
        overrides.threatAxisTuning?.curveExponent ??
        calculatorConfig.threatAxisTuning.curveExponent,
      tierBaselineMultipliers: {
        MINION:
          overrides.threatAxisTuning?.tierBaselineMultipliers?.MINION ??
          calculatorConfig.threatAxisTuning.tierBaselineMultipliers.MINION,
        SOLDIER:
          overrides.threatAxisTuning?.tierBaselineMultipliers?.SOLDIER ??
          calculatorConfig.threatAxisTuning.tierBaselineMultipliers.SOLDIER,
        ELITE:
          overrides.threatAxisTuning?.tierBaselineMultipliers?.ELITE ??
          calculatorConfig.threatAxisTuning.tierBaselineMultipliers.ELITE,
        BOSS:
          overrides.threatAxisTuning?.tierBaselineMultipliers?.BOSS ??
          calculatorConfig.threatAxisTuning.tierBaselineMultipliers.BOSS,
        LEGENDARY:
          overrides.threatAxisTuning?.tierBaselineMultipliers?.LEGENDARY ??
          calculatorConfig.threatAxisTuning.tierBaselineMultipliers.LEGENDARY,
      },
    },
    pressureAxisTuning: {
      ...calculatorConfig.pressureAxisTuning,
      ...overrides.pressureAxisTuning,
      reachValues: {
        ...calculatorConfig.pressureAxisTuning.reachValues,
        ...overrides.pressureAxisTuning?.reachValues,
      },
      componentWeights: {
        ...calculatorConfig.pressureAxisTuning.componentWeights,
        ...overrides.pressureAxisTuning?.componentWeights,
      },
      componentCaps: {
        ...calculatorConfig.pressureAxisTuning.componentCaps,
        ...overrides.pressureAxisTuning?.componentCaps,
      },
      baselines:
        overrides.pressureAxisTuning?.baselines ??
        calculatorConfig.pressureAxisTuning.baselines,
    },
    controlPressureAxisTuning: {
      ...calculatorConfig.controlPressureAxisTuning,
      ...overrides.controlPressureAxisTuning,
      reliabilityValues: {
        ...calculatorConfig.controlPressureAxisTuning.reliabilityValues,
        ...overrides.controlPressureAxisTuning?.reliabilityValues,
      },
      componentWeights: {
        ...calculatorConfig.controlPressureAxisTuning.componentWeights,
        ...overrides.controlPressureAxisTuning?.componentWeights,
      },
      componentCaps: {
        ...calculatorConfig.controlPressureAxisTuning.componentCaps,
        ...overrides.controlPressureAxisTuning?.componentCaps,
      },
      newFormatDebuff: {
        ...calculatorConfig.controlPressureAxisTuning.newFormatDebuff,
        ...overrides.controlPressureAxisTuning?.newFormatDebuff,
        tierBaselines: {
          ...calculatorConfig.controlPressureAxisTuning.newFormatDebuff.tierBaselines,
          ...overrides.controlPressureAxisTuning?.newFormatDebuff?.tierBaselines,
        },
      },
      baselines:
        overrides.controlPressureAxisTuning?.baselines ??
        calculatorConfig.controlPressureAxisTuning.baselines,
    },
    semanticSynergyAxisTuning: {
      ...calculatorConfig.semanticSynergyAxisTuning,
      ...overrides.semanticSynergyAxisTuning,
      tiers: {
        ...calculatorConfig.semanticSynergyAxisTuning.tiers,
        ...overrides.semanticSynergyAxisTuning?.tiers,
      },
    },
    durabilityAxisTuning: {
      ...calculatorConfig.durabilityAxisTuning,
      ...overrides.durabilityAxisTuning,
      baselines:
        overrides.durabilityAxisTuning?.baselines ??
        calculatorConfig.durabilityAxisTuning.baselines,
    },
    healthPoolTuning: {
      expectedPhysicalResilienceAt1:
        overrides.healthPoolTuning?.expectedPhysicalResilienceAt1 ??
        calculatorConfig.healthPoolTuning.expectedPhysicalResilienceAt1,
      expectedPhysicalResiliencePerLevel:
        overrides.healthPoolTuning?.expectedPhysicalResiliencePerLevel ??
        calculatorConfig.healthPoolTuning.expectedPhysicalResiliencePerLevel,
      expectedMentalPerseveranceAt1:
        overrides.healthPoolTuning?.expectedMentalPerseveranceAt1 ??
        calculatorConfig.healthPoolTuning.expectedMentalPerseveranceAt1,
      expectedMentalPerseverancePerLevel:
        overrides.healthPoolTuning?.expectedMentalPerseverancePerLevel ??
        calculatorConfig.healthPoolTuning.expectedMentalPerseverancePerLevel,
      expectedPoolTierMultipliers: {
        MINION:
          overrides.healthPoolTuning?.expectedPoolTierMultipliers?.MINION ??
          calculatorConfig.healthPoolTuning.expectedPoolTierMultipliers.MINION,
        SOLDIER:
          overrides.healthPoolTuning?.expectedPoolTierMultipliers?.SOLDIER ??
          calculatorConfig.healthPoolTuning.expectedPoolTierMultipliers.SOLDIER,
        ELITE:
          overrides.healthPoolTuning?.expectedPoolTierMultipliers?.ELITE ??
          calculatorConfig.healthPoolTuning.expectedPoolTierMultipliers.ELITE,
        BOSS:
          overrides.healthPoolTuning?.expectedPoolTierMultipliers?.BOSS ??
          calculatorConfig.healthPoolTuning.expectedPoolTierMultipliers.BOSS,
      },
      weakerSideWeight:
        overrides.healthPoolTuning?.weakerSideWeight ??
        calculatorConfig.healthPoolTuning.weakerSideWeight,
      averageWeight:
        overrides.healthPoolTuning?.averageWeight ??
        calculatorConfig.healthPoolTuning.averageWeight,
      poolAtExpectedShare:
        overrides.healthPoolTuning?.poolAtExpectedShare ??
        calculatorConfig.healthPoolTuning.poolAtExpectedShare,
      belowExpectedMaxPenaltyShare:
        overrides.healthPoolTuning?.belowExpectedMaxPenaltyShare ??
        calculatorConfig.healthPoolTuning.belowExpectedMaxPenaltyShare,
      belowExpectedScale:
        overrides.healthPoolTuning?.belowExpectedScale ??
        calculatorConfig.healthPoolTuning.belowExpectedScale,
      aboveExpectedMaxBonusShare:
        overrides.healthPoolTuning?.aboveExpectedMaxBonusShare ??
        calculatorConfig.healthPoolTuning.aboveExpectedMaxBonusShare,
      aboveExpectedScale:
        overrides.healthPoolTuning?.aboveExpectedScale ??
        calculatorConfig.healthPoolTuning.aboveExpectedScale,
    },
    scoringCurves: {
      physicalThreat:
        overrides.scoringCurves?.physicalThreat ?? calculatorConfig.scoringCurves.physicalThreat,
      mentalThreat:
        overrides.scoringCurves?.mentalThreat ?? calculatorConfig.scoringCurves.mentalThreat,
      physicalSurvivability:
        overrides.scoringCurves?.physicalSurvivability ??
        calculatorConfig.scoringCurves.physicalSurvivability,
      mentalSurvivability:
        overrides.scoringCurves?.mentalSurvivability ??
        calculatorConfig.scoringCurves.mentalSurvivability,
      manipulation:
        overrides.scoringCurves?.manipulation ?? calculatorConfig.scoringCurves.manipulation,
      synergy: overrides.scoringCurves?.synergy ?? calculatorConfig.scoringCurves.synergy,
      mobility: overrides.scoringCurves?.mobility ?? calculatorConfig.scoringCurves.mobility,
      presence: overrides.scoringCurves?.presence ?? calculatorConfig.scoringCurves.presence,
    },
  };
}
