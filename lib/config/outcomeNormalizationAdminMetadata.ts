import { OUTCOME_NORMALIZATION_KEY_ORDER } from "@/lib/config/outcomeNormalizationShared";

export const OUTCOME_NORMALIZATION_ADMIN_GROUPS = [
  "Tier Multipliers",
  "Baseline Party",
  "Manipulation Tuning",
  "Synergy Utility Fallbacks",
  "Natural Attack Weighting",
  "Scoring Curves - Physical Threat",
  "Scoring Curves - Mental Threat",
  "Scoring Curves - Physical Survivability",
  "Scoring Curves - Mental Survivability",
  "Scoring Curves - Manipulation",
  "Scoring Curves - Synergy",
  "Scoring Curves - Mobility",
  "Scoring Curves - Pressure",
] as const;

export type OutcomeNormalizationAdminGroup =
  (typeof OUTCOME_NORMALIZATION_ADMIN_GROUPS)[number];
export type OutcomeNormalizationAffects = "normalization";
export type OutcomeNormalizationValueFormat = "number" | "multiplier" | "share" | "curve_value";

export type OutcomeNormalizationAdminMetadata = {
  label: string;
  group: OutcomeNormalizationAdminGroup;
  description: string;
  affects: OutcomeNormalizationAffects;
  sortOrder?: number;
  format?: OutcomeNormalizationValueFormat;
  suggestedMin?: number;
  suggestedMax?: number;
  aliases?: string[];
};

const CURVE_GROUPS: Record<string, OutcomeNormalizationAdminGroup> = {
  physicalThreat: "Scoring Curves - Physical Threat",
  mentalThreat: "Scoring Curves - Mental Threat",
  physicalSurvivability: "Scoring Curves - Physical Survivability",
  mentalSurvivability: "Scoring Curves - Mental Survivability",
  manipulation: "Scoring Curves - Manipulation",
  synergy: "Scoring Curves - Synergy",
  mobility: "Scoring Curves - Mobility",
  presence: "Scoring Curves - Pressure",
};

function formatSegment(segment: string): string {
  if (/^\d+$/.test(segment)) return `Level ${segment}`;
  if (segment === "aoe" || segment === "AOE") return "AoE";
  if (segment === "WPR") return "WPR";
  if (segment === "SEU") return "SEU";
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function axisLabel(axis: string): string {
  if (axis === "physicalThreat") return "Physical Threat";
  if (axis === "mentalThreat") return "Mental Threat";
  if (axis === "physicalSurvivability") return "Physical Survivability";
  if (axis === "mentalSurvivability") return "Mental Survivability";
  if (axis === "manipulation") return "Control Pressure";
  if (axis === "synergy") return "Synergy";
  if (axis === "mobility") return "Mobility";
  if (axis === "presence") return "Pressure";
  return formatSegment(axis);
}

function labelForKey(configKey: string): string {
  const parts = configKey.split(".");

  if (parts[0] === "scoringCurves") {
    const [, axis, level, bound] = parts;
    return `Level ${level} ${axisLabel(axis ?? "")} ${bound === "min" ? "Floor" : "Ceiling"}`;
  }

  if (parts[0] === "tierMultipliers") return `${formatSegment(parts[1] ?? "")} Tier Weight`;
  if (configKey === "baselineParty.size") return "Baseline Party Size";
  if (configKey === "baselineParty.focusedWPR") return "Focused Party Wounds per Round";
  if (configKey === "baselineParty.typicalWPR") return "Typical Party Wounds per Round";
  if (configKey === "baselineParty.aoeMultiplier") return "Area Damage Multiplier";
  if (configKey === "baselineParty.netSuccessMultiplier") return "Expected Net Success Multiplier";
  if (configKey === "baselineParty.combatHorizonRounds") return "Expected Combat Length";

  if (configKey.startsWith("manipulationTuning.rangeCategoryMultiplier.")) {
    return `${formatSegment(parts[2] ?? "")} Control Range Category Multiplier`;
  }
  if (configKey === "manipulationTuning.rangedDistanceScalarPer30ft") return "Control Range Bonus per 30 ft";
  if (configKey === "manipulationTuning.aoeCastRangeScalarPer30ft") return "AoE Cast Range Bonus per 30 ft";
  if (configKey === "manipulationTuning.maxDistanceScalarBonus") return "Maximum Distance Bonus";
  if (configKey === "manipulationTuning.meleeTargetExponent") return "Melee Target Scaling Curve";
  if (configKey === "manipulationTuning.rangedTargetExponent") return "Ranged Target Scaling Curve";
  if (configKey === "manipulationTuning.aoeGridSquareFeet") return "Area Target Estimate Grid Size";
  if (configKey === "manipulationTuning.aoeMaxExpectedTargets") return "Maximum Expected Area Targets";
  if (configKey === "manipulationTuning.aoeCountExponent") return "Area Count Scaling Curve";
  if (configKey === "manipulationTuning.sphereRadiusScalarPer10ft") return "Sphere Radius Bonus per 10 ft";
  if (configKey === "manipulationTuning.coneLengthScalarPer30ft") return "Cone Length Bonus per 30 ft";
  if (configKey === "manipulationTuning.lineLengthScalarPer30ft") return "Line Length Bonus per 30 ft";
  if (configKey === "manipulationTuning.lineWidthScalarPer5ft") return "Line Width Bonus per 5 ft";
  if (configKey === "manipulationTuning.maxGeometryScalarBonus") return "Maximum Area Geometry Bonus";

  if (configKey === "seuFallbacks.augmentSeuPerSuccess") return "Augment Synergy Value per Success";
  if (configKey === "seuFallbacks.augmentSeuPerStack") return "Augment Synergy Value per Stack";
  if (configKey === "seuFallbacks.debuffSeuPerSuccess") return "Debuff Control Value per Success";
  if (configKey === "seuFallbacks.debuffSeuPerStack") return "Debuff Control Value per Stack";
  if (configKey === "seuFallbacks.cleanseSeuPerSuccess") return "Cleanse Synergy Value per Success";
  if (configKey === "seuFallbacks.cleanseSeuPerStack") return "Cleanse Synergy Value per Stack";

  if (configKey === "naturalAttackTuning.damageOutputWeight") return "Natural Attack Damage Impact";
  if (configKey === "naturalAttackTuning.greaterSuccessEffectWeight") {
    return "Natural Attack Greater-Success Impact";
  }
  if (configKey === "naturalAttackTuning.rangeEffectWeight") return "Natural Attack Range Impact";

  return parts.map(formatSegment).join(" / ");
}

function groupForKey(configKey: string): OutcomeNormalizationAdminGroup {
  if (configKey.startsWith("tierMultipliers.")) return "Tier Multipliers";
  if (configKey.startsWith("baselineParty.")) return "Baseline Party";
  if (configKey.startsWith("manipulationTuning.")) return "Manipulation Tuning";
  if (configKey.startsWith("seuFallbacks.")) return "Synergy Utility Fallbacks";
  if (configKey.startsWith("naturalAttackTuning.")) return "Natural Attack Weighting";
  if (configKey.startsWith("scoringCurves.")) {
    const axis = configKey.split(".")[1];
    return CURVE_GROUPS[axis] ?? "Scoring Curves - Pressure";
  }
  return "Baseline Party";
}

function formatForKey(configKey: string): OutcomeNormalizationValueFormat {
  if (configKey.startsWith("naturalAttackTuning.")) return "multiplier";
  if (configKey.startsWith("scoringCurves.")) return "curve_value";
  if (
    configKey.startsWith("tierMultipliers.") ||
    configKey.includes("rangeCategoryMultiplier") ||
    configKey.endsWith("Multiplier") ||
    configKey.endsWith("MultiplierPerRound")
  ) {
    return "multiplier";
  }
  if (
    configKey.endsWith("Share") ||
    configKey.endsWith("Weight") ||
    configKey.includes("ScalarPer") ||
    configKey.endsWith("Scale")
  ) {
    return "share";
  }
  return "number";
}

function descriptionForKey(configKey: string): string {
  if (configKey.startsWith("tierMultipliers.")) {
    return "Raise to make this monster tier normalize to a larger radar budget; lower to compress it.";
  }
  if (configKey.startsWith("baselineParty.")) {
    if (configKey.includes("WPR")) return "Expected party damage pressure. Raising it makes monster output normalize against a stronger party baseline.";
    if (configKey.endsWith("combatHorizonRounds")) return "Expected number of combat rounds. Raising it makes repeat and pool assumptions last longer.";
    return "Baseline party assumption used by downstream monster outcome calculations.";
  }
  if (configKey.startsWith("manipulationTuning.rangeCategoryMultiplier.")) {
    return "Raises or lowers how much this targeting range amplifies control and utility impact.";
  }
  if (configKey.startsWith("manipulationTuning.")) {
    return "Raises or lowers downstream control-pressure scaling from range, target count, or area geometry.";
  }
  if (configKey.startsWith("seuFallbacks.")) {
    return "Fallback synergy or control value used when a landed effect has no stronger direct signal.";
  }
  if (configKey === "naturalAttackTuning.damageOutputWeight") {
    return "Raises or lowers how much natural attack damage output moves the final radar without changing printed wounds.";
  }
  if (configKey === "naturalAttackTuning.greaterSuccessEffectWeight") {
    return "Raises or lowers how much natural attack greater-success rider effects move the radar.";
  }
  if (configKey === "naturalAttackTuning.rangeEffectWeight") {
    return "Raises or lowers how much natural attack range and delivery rider value moves the radar.";
  }
  if (configKey.startsWith("scoringCurves.")) {
    return "Curve bound for this level and radar axis. Raising it makes the same raw score normalize lower.";
  }
  return "Outcome normalization value.";
}

function aliasesForKey(configKey: string): string[] {
  const aliases = new Set<string>([configKey, ...configKey.split("."), groupForKey(configKey)]);
  const lowerKey = configKey.toLowerCase();

  if (lowerKey.includes("wpr")) {
    aliases.add("WPR");
    aliases.add("Wounds per Round");
    aliases.add("Damage per Round");
  }
  if (lowerKey.includes("seu")) {
    aliases.add("SEU");
    aliases.add("Synergy Utility Output");
    aliases.add("Support Utility Output");
    aliases.add("Standard Effect Unit");
  }
  if (lowerKey.includes("manipulation")) {
    aliases.add("Control Pressure");
    aliases.add("Manipulation");
    aliases.add("TSU");
    aliases.add("Tactical Utility Output");
  }
  if (lowerKey.includes("presence")) {
    aliases.add("Pressure");
    aliases.add("Presence");
  }
  if (lowerKey.includes("aoe")) {
    aliases.add("AoE");
    aliases.add("Area");
  }
  if (lowerKey.includes("scoringcurves")) {
    aliases.add("Radar Curve");
    aliases.add("Normalization Curve");
  }
  if (lowerKey.includes("naturalattack")) {
    aliases.add("Natural Attack");
    aliases.add("Natural Weapon");
    aliases.add("Natural Attack Weighting");
    aliases.add("Natural Attack Impact");
  }
  if (lowerKey.includes("range")) aliases.add("Targeting");
  if (lowerKey.includes("multiplier")) aliases.add("Multiplier");
  if (lowerKey.includes("weight")) aliases.add("Weight");
  if (lowerKey.includes("scalar")) aliases.add("Scale");

  return Array.from(aliases);
}

function suggestedBoundsForFormat(format: OutcomeNormalizationValueFormat): {
  suggestedMin?: number;
  suggestedMax?: number;
} {
  if (format === "share") return { suggestedMin: 0, suggestedMax: 1 };
  if (format === "multiplier") return { suggestedMin: 0, suggestedMax: 5 };
  if (format === "curve_value") return { suggestedMin: 0, suggestedMax: 100 };
  return { suggestedMin: 0 };
}

function buildMetadata(configKey: string, index: number): OutcomeNormalizationAdminMetadata {
  const format = formatForKey(configKey);
  return {
    label: labelForKey(configKey),
    group: groupForKey(configKey),
    description: descriptionForKey(configKey),
    affects: "normalization",
    sortOrder: index,
    format,
    aliases: aliasesForKey(configKey),
    ...suggestedBoundsForFormat(format),
  };
}

export const OUTCOME_NORMALIZATION_ADMIN_METADATA: Record<
  string,
  OutcomeNormalizationAdminMetadata
> = Object.fromEntries(
  OUTCOME_NORMALIZATION_KEY_ORDER.map((configKey, index) => [
    configKey,
    buildMetadata(configKey, index),
  ]),
);
