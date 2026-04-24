export type LevelCurvePoint = { level: number; min: number; max: number };

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
    physicalThreat: makeLinearCurve({
      minAt1: 0,
      maxAt1: 10,
      minPerLevel: 0.5,
      maxPerLevel: 2.5,
    }),
    mentalThreat: makeLinearCurve({
      minAt1: 0,
      maxAt1: 10,
      minPerLevel: 0.5,
      maxPerLevel: 2.5,
    }),
    physicalSurvivability: makeLinearCurve({
      minAt1: 0,
      maxAt1: 14,
      minPerLevel: 0.05,
      maxPerLevel: 0.15,
    }),
    mentalSurvivability: makeLinearCurve({
      minAt1: 1,
      maxAt1: 8,
      minPerLevel: 0.05,
      maxPerLevel: 0.15,
    }),
    manipulation: makeLinearCurve({
      minAt1: 0,
      maxAt1: 13,
      minPerLevel: 0.05,
      maxPerLevel: 0.2,
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
      minPerLevel: 0.1,
      maxPerLevel: 0.2,
    }),
    presence: makeLinearCurve({
      minAt1: 0,
      maxAt1: 10,
      minPerLevel: 0.2,
      maxPerLevel: 1.5,
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
