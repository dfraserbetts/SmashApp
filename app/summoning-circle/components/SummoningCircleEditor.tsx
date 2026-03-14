"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { useSearchParams } from "next/navigation";
import type {
  CoreAttribute,
  DiceSize,
  LimitBreakTier,
  MonsterAttack,
  MonsterTraitDefinitionSummary,
  MonsterNaturalAttackConfig,
  MonsterPower,
  MonsterPowerIntentionApplyTo,
  MonsterPowerIntentionType,
  MonsterSource,
  MonsterSummary,
  MonsterTier,
  MonsterUpsertInput,
} from "@/lib/summoning/types";
import {
  getArmorSkillDiceCountFromAttributes,
  getDodgeValue,
  getAttributeNumericValue,
  getWeaponSkillDiceCountFromAttributes,
  getWillpowerDiceCountFromAttributes,
} from "@/lib/summoning/attributes";
import {
  getHighestItemModifiers,
  getItemLinePlacementCounts,
  getProtectionTotalsFromItems,
  isTwoHanded,
  isValidArmorItemForSlot,
  isValidHandItemForSlot,
  isValidItemAccessorySlot,
  type SummoningEquipmentItem,
} from "@/lib/summoning/equipment";
import { renderAttackActionLines } from "@/lib/summoning/render";
import {
  MonsterBlockCard,
  buildMonsterTraitRenderContext,
  renderTraitTemplate,
  type WeaponProjection,
} from "@/app/summoning-circle/components/MonsterBlockCard";
import { useScaledPreview } from "@/app/summoning-circle/components/useScaledPreview";
import { useProtectionTuning } from "@/app/summoning-circle/components/useProtectionTuning";
import {
  getAttributeLimitBreakCeiling,
  getLimitBreakRequiredSuccesses,
  getLimitBreakThresholdPercent,
} from "@/lib/limitBreakThreshold";
import {
  computeTraitAxisBonuses,
  computeMonsterOutcomes,
  getEquipmentModifierBudgetShare,
  getEquipmentModifierPressureMultiplier,
  type MonsterCalculatorArchetype,
  type RadarAxes,
  type TraitAxisWeightDefinition,
  type WeaponAttackSource,
} from "@/lib/calculators/monsterOutcomeCalculator";
import { calculatorConfig, type LevelCurvePoint } from "@/lib/calculators/calculatorConfig";
import { MonsterCalculatorPanel } from "@/app/summoning-circle/components/MonsterCalculatorPanel";

type Props = { campaignId: string };
type PrintLayoutMode = "COMPACT_1P" | "LEGENDARY_2P";

type EditableMonster = MonsterUpsertInput & {
  id?: string;
  source?: MonsterSource;
  isReadOnly?: boolean;
};

type Picklists = {
  damageTypes: Array<{ id: number; name: string; attackMode?: "PHYSICAL" | "MENTAL" }>;
  attackEffects: Array<{ id: number; name: string; tooltip?: string | null; damageTypeIds?: number[] }>;
};

type NaturalAttackDamageField = "meleeDamageTypeIds" | "rangedDamageTypeIds" | "aoeDamageTypeIds";
type NaturalAttackEffectField = "attackEffectMeleeIds" | "attackEffectRangedIds" | "attackEffectAoEIds";
const NATURAL_DAMAGE_FIELD_TO_RANGE: Record<NaturalAttackDamageField, "melee" | "ranged" | "aoe"> = {
  meleeDamageTypeIds: "melee",
  rangedDamageTypeIds: "ranged",
  aoeDamageTypeIds: "aoe",
};
const NATURAL_EFFECT_FIELD_TO_RANGE: Record<NaturalAttackEffectField, "melee" | "ranged" | "aoe"> = {
  attackEffectMeleeIds: "melee",
  attackEffectRangedIds: "ranged",
  attackEffectAoEIds: "aoe",
};

type TagSuggestion = {
  value: string;
  source: "global" | "campaign";
};

const HAND_SLOTS = [
  { key: "mainHandItemId", label: "Main Hand" },
  { key: "offHandItemId", label: "Off Hand" },
  { key: "smallItemId", label: "Small Slot" },
] as const;

// SC_SEPARATE_ARMOR_AND_ITEM_EDITOR_SLOTS_V2
const ARMOR_SLOTS = [
  { key: "headArmorItemId", label: "Head Armor" },
  { key: "shoulderArmorItemId", label: "Shoulder Armor" },
  { key: "torsoArmorItemId", label: "Torso Armor" },
  { key: "legsArmorItemId", label: "Legs Armor" },
  { key: "feetArmorItemId", label: "Feet Armor" },
] as const;
const ITEM_SLOTS = [
  { key: "headItemId", label: "Head Item" },
  { key: "neckItemId", label: "Neck Item" },
  { key: "armsItemId", label: "Arms Item" },
  { key: "beltItemId", label: "Belt Item" },
] as const;
const ARMOR_SLOT_ROWS = [
  [ARMOR_SLOTS[0], ARMOR_SLOTS[1]],
  [ARMOR_SLOTS[2], ARMOR_SLOTS[3]],
  [ARMOR_SLOTS[4]],
] as const;
const ITEM_SLOT_ROWS = [
  [ITEM_SLOTS[0], ITEM_SLOTS[1]],
  [ITEM_SLOTS[2], ITEM_SLOTS[3]],
] as const;
const LEVEL_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);
const STRENGTH_OPTIONS = [0, 1, 2, 3, 4, 5] as const;
const TARGET_OPTIONS = [1, 2, 3, 4, 5] as const;
const DICE_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const POTENCY_OPTIONS = [1, 2, 3, 4, 5] as const;
const PICKER_LEVEL_OPTIONS = Array.from({ length: 20 }, (_, idx) => idx + 1);
const MONSTER_TIER_OPTIONS: MonsterTier[] = ["MINION", "SOLDIER", "ELITE", "BOSS"];
const MONSTER_TIER_LABELS: Record<MonsterTier, string> = {
  MINION: "Minion",
  SOLDIER: "Soldier",
  ELITE: "Elite",
  BOSS: "Boss",
};
const LIMIT_BREAK_TIER_OPTIONS: LimitBreakTier[] = ["PUSH", "BREAK", "TRANSCEND"];
const CORE_ATTRIBUTE_OPTIONS: CoreAttribute[] = [
  "ATTACK",
  "DEFENCE",
  "FORTITUDE",
  "INTELLECT",
  "SUPPORT",
  "BRAVERY",
];
const CORE_ATTRIBUTE_LABELS: Record<CoreAttribute, string> = {
  ATTACK: "Attack",
  DEFENCE: "Defence",
  FORTITUDE: "Fortitude",
  INTELLECT: "Intellect",
  SUPPORT: "Support",
  BRAVERY: "Bravery",
};
const MAX_RECENT_PICKER_ITEMS = 5;
const DEFAULT_IMAGE_POS_X = 50;
const DEFAULT_IMAGE_POS_Y = 35;

const DICE: DiceSize[] = ["D4", "D6", "D8", "D10", "D12"];
const INTENTIONS: MonsterPowerIntentionType[] = [
  "ATTACK",
  "DEFENCE",
  "HEALING",
  "CLEANSE",
  "CONTROL",
  "MOVEMENT",
  "AUGMENT",
  "DEBUFF",
  "SUMMON",
  "TRANSFORMATION",
];
type PowerRangeCategory = "SELF" | "MELEE" | "RANGED" | "AOE";
type PowerRangeAoeShape = "SPHERE" | "CONE" | "LINE";
type PowerRangeState = {
  category: PowerRangeCategory | null;
  rangeValue: number | null;
  rangeExtra: Record<string, unknown>;
  meleeTargets: number;
  rangedDistanceFeet: number;
  rangedTargets: number;
  aoeCenterRangeFeet: number;
  aoeCount: number;
  aoeShape: PowerRangeAoeShape;
  aoeSphereRadiusFeet: number;
  aoeConeLengthFeet: number;
  aoeLineWidthFeet: number;
  aoeLineLengthFeet: number;
};
type ImageDragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPosX: number;
  startPosY: number;
  frameWidth: number;
  frameHeight: number;
};

const POWER_RANGE_CATEGORIES: PowerRangeCategory[] = ["SELF", "MELEE", "RANGED", "AOE"];
const POWER_RANGE_TARGET_OPTIONS = [1, 2, 3, 4, 5] as const;
const POWER_RANGE_RANGED_DISTANCE_OPTIONS = [30, 60, 120, 200] as const;
const POWER_RANGE_AOE_CENTER_RANGE_OPTIONS = [0, 30, 60, 120, 200] as const;
const POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS = [10, 20, 30] as const;
const POWER_RANGE_AOE_CONE_LENGTH_OPTIONS = [15, 30, 60] as const;
const POWER_RANGE_AOE_LINE_WIDTH_OPTIONS = [5, 10, 15, 20] as const;
const POWER_RANGE_AOE_LINE_LENGTH_OPTIONS = [30, 60, 90, 120] as const;
const POWER_RANGE_AOE_SHAPES: PowerRangeAoeShape[] = ["SPHERE", "CONE", "LINE"];
const ATTACK_MODES = ["PHYSICAL", "MENTAL"] as const;
const ATTACK_MODE_LABELS: Record<(typeof ATTACK_MODES)[number], string> = {
  PHYSICAL: "Physical",
  MENTAL: "Mental",
};
const ATTACK_MODE_TOOLTIPS: Record<(typeof ATTACK_MODES)[number], string> = {
  PHYSICAL:
    "Focuses the physical attributes of the target. Physical effects usually connect to bodily threat, physical damage types, and physical defence responses.",
  MENTAL:
    "Focuses the mental attributes of the target. Mental effects usually connect to mental damage types, mental pressure, and mental defence responses.",
};
const LIMIT_BREAK_TIER_LABELS: Record<LimitBreakTier, string> = {
  PUSH: "Push",
  BREAK: "Break",
  TRANSCEND: "Transcend",
};
const LIMIT_BREAK_TIER_TOOLTIPS: Record<LimitBreakTier, string> = {
  PUSH:
    "The lightest custom limit break tier. Push represents an early breakthrough with a notable cost, but a lower cost than the higher tiers.",
  BREAK:
    "A stronger custom limit break tier. Break represents a more dramatic breakthrough with a steeper cost and a stronger payoff than Push.",
  TRANSCEND:
    "The highest custom limit break tier. Transcend represents the most extreme breakthrough state, with exceptional payoff at a brutal cost that will often badly injure the user to perform.",
};
const CORE_ATTRIBUTE_OPTION_TOOLTIPS: Record<CoreAttribute, string> = {
  ATTACK: "Uses Attack as the attribute for this custom limit break.",
  DEFENCE: "Uses Defence as the attribute for this custom limit break.",
  FORTITUDE: "Uses Fortitude as the attribute for this custom limit break.",
  INTELLECT: "Uses Intellect as the attribute for this custom limit break.",
  SUPPORT: "Uses Support as the attribute for this custom limit break.",
  BRAVERY: "Uses Bravery as the attribute for this custom limit break.",
};
const NATURAL_ATTACK_GS_ATTRITION_PRIMARY_SHARE = 0.08;
const NATURAL_ATTACK_GS_ATTRITION_PRESENCE_SHARE = 0.03;
const NATURAL_ATTACK_GS_PRESSURE_PRIMARY_SHARE = 0.12;
const NATURAL_ATTACK_GS_PRESSURE_PRESENCE_SHARE = 0.05;
const NATURAL_ATTACK_GS_CONTROL_PRIMARY_SHARE = 0.18;
const NATURAL_ATTACK_GS_CONTROL_PRESENCE_SHARE = 0.08;
const NATURAL_ATTACK_GS_CONTROL_EXTRA_THREAT_SHARE = 0.06;
const NATURAL_ATTACK_GS_MENTAL_ATTRITION_EFFECTS = new Set(["horrified"]);
const NATURAL_ATTACK_GS_PHYSICAL_ATTRITION_EFFECTS = new Set([
  "immolate",
  "poisoned",
  "laceration",
]);
const NATURAL_ATTACK_GS_PRESSURE_EFFECTS = new Set([
  "shaken",
  "overwhelmed",
  "disease",
  "smite",
]);
const NATURAL_ATTACK_GS_CONTROL_EFFECTS = new Set([
  "freeze",
  "surge",
  "penetrate",
  "sundered",
]);
const NATURAL_ATTACK_GS_CONTROL_PHYSICAL_THREAT_EFFECTS = new Set([
  "surge",
  "penetrate",
  "sundered",
]);
const NATURAL_ATTACK_RANGE_SCALAR_BY_DISTANCE: Record<number, number> = {
  0: 1,
  30: 1.05,
  60: 1.1,
  120: 1.18,
  200: 1.26,
};
const NATURAL_ATTACK_RANGE_MOBILITY_BONUS_BY_DISTANCE: Record<number, number> = {
  0: 0,
  30: 0.01,
  60: 0.02,
  120: 0.03,
  200: 0.04,
};
const NATURAL_ATTACK_RANGED_THREAT_SHARE_BY_DISTANCE: Record<number, number> = {
  30: 0.03,
  60: 0.05,
  120: 0.07,
  200: 0.09,
};
const NATURAL_ATTACK_RANGED_PRESENCE_SHARE_BY_DISTANCE: Record<number, number> = {
  30: 0.02,
  60: 0.04,
  120: 0.06,
  200: 0.08,
};
const NATURAL_ATTACK_RANGE_MOBILITY_CAP_SHARE = 0.2;
const NATURAL_ATTACK_RANGE_PRESENCE_CAP_SHARE = 0.5;
const NATURAL_ATTACK_RANGE_PHYSICAL_THREAT_CAP_SHARE = 0.7;
const NATURAL_ATTACK_RANGE_MENTAL_THREAT_CAP_SHARE = 0.7;

function getAttackModeKey(value: unknown): (typeof ATTACK_MODES)[number] {
  return String(value ?? "").toUpperCase() === "MENTAL" ? "MENTAL" : "PHYSICAL";
}

const CONTROL_MODES = [
  "Force move",
  "Force no move",
  "Force specific action",
  "Force no action",
  "Force specific power",
] as const;

const CLEANSE_EFFECTS = [
  "Active Power",
  "Effect over time",
  "Damage over time",
  "Channelled Power",
] as const;

const MOVEMENT_MODES = [
  "Force Push",
  "Force Teleport",
  "Force Fly",
  "Run",
  "Fly",
  "Teleport",
] as const;

const AUGMENT_DEBUFF_STATS = [
  "Attack",
  "Defence",
  "Fortitude",
  "Intellect",
  "Support",
  "Bravery",
  "Movement",
  "Weapon Skill",
  "Armor Skill",
  "Dodge",
  "Willpower",
] as const;

function getDetailsString(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  return typeof value === "string" ? value : "";
}

function getDetailsStringArray(details: Record<string, unknown>, key: string): string[] {
  const value = details[key];
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function getDetailsRecord(details: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = details[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getDetailsNullableNumber(details: Record<string, unknown>, key: string): number | null {
  const value = details[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getDetailsStatTarget(details: Record<string, unknown>): string {
  const value = details.statTarget ?? details.statChoice;
  return typeof value === "string" ? value : "";
}

function getDetailsApplyTo(details: Record<string, unknown>): MonsterPowerIntentionApplyTo {
  return details.applyTo === "SELF" ? "SELF" : "PRIMARY_TARGET";
}

function defaultDetailsForIntentionType(type: MonsterPowerIntentionType): Record<string, unknown> {
  switch (type) {
    case "ATTACK":
      return { applyTo: "PRIMARY_TARGET", attackMode: "PHYSICAL", damageTypes: [] };
    case "DEFENCE":
      return { applyTo: "PRIMARY_TARGET", attackMode: "PHYSICAL" };
    case "CONTROL":
      return { applyTo: "PRIMARY_TARGET", controlMode: "Force move" };
    case "CLEANSE":
      return { applyTo: "PRIMARY_TARGET", cleanseEffectType: "Active Power" };
    case "MOVEMENT":
      return { applyTo: "PRIMARY_TARGET", movementMode: "Force Push" };
    case "AUGMENT":
    case "DEBUFF":
      return { applyTo: "PRIMARY_TARGET", statTarget: "Attack" };
    case "HEALING":
      return { applyTo: "PRIMARY_TARGET", healingMode: "PHYSICAL" };
    case "SUMMON":
    case "TRANSFORMATION":
      return { applyTo: "PRIMARY_TARGET" };
    default:
      return { applyTo: "PRIMARY_TARGET" };
  }
}

function deriveDefenceCheckLabel(
  intentionType: MonsterPowerIntentionType,
  details: Record<string, unknown>,
): string | null {
  const normalizeCoreStat = (statTarget: string): string | null => {
    const normalized = statTarget.trim().toLowerCase();
    if (normalized === "attack") return "Attack";
    if (normalized === "defence") return "Defence";
    if (normalized === "fortitude") return "Fortitude";
    if (normalized === "intellect") return "Intellect";
    if (normalized === "support") return "Support";
    if (normalized === "bravery") return "Bravery";
    return null;
  };

  if (intentionType === "ATTACK") {
    const mode = String(details.attackMode ?? "PHYSICAL").toUpperCase();
    return mode === "MENTAL" ? "Mental Defence" : "Physical Defence";
  }

  if (intentionType === "CONTROL") return "Resist (GD Choice)";
  if (intentionType === "MOVEMENT") return "Resist (GD Choice)";

  if (intentionType === "DEBUFF") {
    const statTarget = normalizeCoreStat(getDetailsStatTarget(details));
    return statTarget ? `${statTarget} Resist` : "Resist (GD Choice)";
  }

  if (intentionType === "CLEANSE") {
    const cleanseEffectType = getDetailsString(details, "cleanseEffectType");
    if (cleanseEffectType === "Effect over time" || cleanseEffectType === "Damage over time") {
      return "Resist Fortitude";
    }
    return "Resist (GD Choice)";
  }

  // No defence check for HEALING, AUGMENT, DEFENCE, SUMMON, TRANSFORMATION, etc.
  return null;
}

function clampToOptions(value: number | null, options: readonly number[], fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return options.includes(value) ? value : fallback;
}

function toPowerRangeState(power: MonsterPower): PowerRangeState {
  const canonicalDetails = (power.intentions[0]?.detailsJson ?? {}) as Record<string, unknown>;
  const rawCategory = getDetailsString(canonicalDetails, "rangeCategory").trim().toUpperCase();
  const category = POWER_RANGE_CATEGORIES.includes(rawCategory as PowerRangeCategory)
    ? (rawCategory as PowerRangeCategory)
    : null;

  const rangeValue = getDetailsNullableNumber(canonicalDetails, "rangeValue");
  const rangeExtra = getDetailsRecord(canonicalDetails, "rangeExtra");
  const rangedTargetsRaw =
    typeof rangeExtra.targets === "number"
      ? rangeExtra.targets
      : typeof rangeExtra.targets === "string"
        ? Number(rangeExtra.targets)
        : null;
  const aoeCountRaw =
    typeof rangeExtra.count === "number"
      ? rangeExtra.count
      : typeof rangeExtra.count === "string"
        ? Number(rangeExtra.count)
        : null;
  const aoeSphereRadiusRaw =
    typeof rangeExtra.sphereRadiusFeet === "number"
      ? rangeExtra.sphereRadiusFeet
      : typeof rangeExtra.sphereRadiusFeet === "string"
        ? Number(rangeExtra.sphereRadiusFeet)
        : null;
  const aoeConeLengthRaw =
    typeof rangeExtra.coneLengthFeet === "number"
      ? rangeExtra.coneLengthFeet
      : typeof rangeExtra.coneLengthFeet === "string"
        ? Number(rangeExtra.coneLengthFeet)
        : null;
  const aoeLineWidthRaw =
    typeof rangeExtra.lineWidthFeet === "number"
      ? rangeExtra.lineWidthFeet
      : typeof rangeExtra.lineWidthFeet === "string"
        ? Number(rangeExtra.lineWidthFeet)
        : null;
  const aoeLineLengthRaw =
    typeof rangeExtra.lineLengthFeet === "number"
      ? rangeExtra.lineLengthFeet
      : typeof rangeExtra.lineLengthFeet === "string"
        ? Number(rangeExtra.lineLengthFeet)
        : null;
  const aoeShapeRaw = String(rangeExtra.shape ?? "SPHERE").toUpperCase();
  const aoeShape = POWER_RANGE_AOE_SHAPES.includes(aoeShapeRaw as PowerRangeAoeShape)
    ? (aoeShapeRaw as PowerRangeAoeShape)
    : "SPHERE";

  return {
    category,
    rangeValue,
    rangeExtra,
    meleeTargets: clampToOptions(rangeValue, POWER_RANGE_TARGET_OPTIONS, 1),
    rangedDistanceFeet: clampToOptions(rangeValue, POWER_RANGE_RANGED_DISTANCE_OPTIONS, 30),
    rangedTargets: clampToOptions(
      Number.isFinite(rangedTargetsRaw as number) ? Number(rangedTargetsRaw) : null,
      POWER_RANGE_TARGET_OPTIONS,
      1,
    ),
    aoeCenterRangeFeet: clampToOptions(rangeValue, POWER_RANGE_AOE_CENTER_RANGE_OPTIONS, 0),
    aoeCount: clampToOptions(
      Number.isFinite(aoeCountRaw as number) ? Number(aoeCountRaw) : null,
      POWER_RANGE_TARGET_OPTIONS,
      1,
    ),
    aoeShape,
    aoeSphereRadiusFeet: clampToOptions(
      Number.isFinite(aoeSphereRadiusRaw as number) ? Number(aoeSphereRadiusRaw) : null,
      POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS,
      10,
    ),
    aoeConeLengthFeet: clampToOptions(
      Number.isFinite(aoeConeLengthRaw as number) ? Number(aoeConeLengthRaw) : null,
      POWER_RANGE_AOE_CONE_LENGTH_OPTIONS,
      15,
    ),
    aoeLineWidthFeet: clampToOptions(
      Number.isFinite(aoeLineWidthRaw as number) ? Number(aoeLineWidthRaw) : null,
      POWER_RANGE_AOE_LINE_WIDTH_OPTIONS,
      5,
    ),
    aoeLineLengthFeet: clampToOptions(
      Number.isFinite(aoeLineLengthRaw as number) ? Number(aoeLineLengthRaw) : null,
      POWER_RANGE_AOE_LINE_LENGTH_OPTIONS,
      30,
    ),
  };
}

function setPowerIntentionDetails(
  setEditor: Dispatch<SetStateAction<EditableMonster | null>>,
  powerIndex: number,
  intentionIndex: number,
  patch: Record<string, unknown>,
) {
  setEditor((prev) => {
    if (!prev) return prev;
    const powers = prev.powers.map((power, pi) => {
      if (pi !== powerIndex) return power;
      const intentions = power.intentions.map((intention, ii) => {
        if (ii !== intentionIndex) return intention;
        const current = (intention.detailsJson ?? {}) as Record<string, unknown>;
        return { ...intention, detailsJson: { ...current, ...patch } };
      });
      return { ...power, intentions };
    });
    return { ...prev, powers };
  });
}

function setPowerCanonicalIntentionDetails(
  setEditor: Dispatch<SetStateAction<EditableMonster | null>>,
  powerIndex: number,
  patch: Record<string, unknown>,
) {
  setEditor((prev) => {
    if (!prev) return prev;
    const powers = prev.powers.map((power, pi) => {
      if (pi !== powerIndex) return power;
      const intentions =
        power.intentions.length > 0
          ? [...power.intentions]
          : [
              {
                sortOrder: 0,
                type: "ATTACK" as MonsterPowerIntentionType,
                detailsJson: defaultDetailsForIntentionType("ATTACK"),
              },
            ];
      const first = intentions[0];
      const current = (first.detailsJson ?? {}) as Record<string, unknown>;
      intentions[0] = { ...first, detailsJson: { ...current, ...patch } };
      return {
        ...power,
        intentions: intentions.map((intention, idx) => ({ ...intention, sortOrder: idx })),
      };
    });
    return { ...prev, powers };
  });
}

function clearLimitBreak2(
  setEditor: Dispatch<SetStateAction<EditableMonster | null>>,
) {
  setEditor((prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      limitBreak2Name: null,
      limitBreak2Tier: null,
      limitBreak2TriggerText: null,
      limitBreak2Attribute: null,
      limitBreak2ThresholdSuccesses: null,
      limitBreak2CostText: null,
      limitBreak2EffectText: null,
    };
  });
}

function toggleStringInArray(arr: string[], value: string): string[] {
  const key = value.toLowerCase();
  const exists = arr.some((entry) => String(entry).toLowerCase() === key);
  return exists
    ? arr.filter((entry) => String(entry).toLowerCase() !== key)
    : [...arr, value];
}

function filterAttackEffectsForDamageTypes(
  allEffects: Picklists["attackEffects"],
  _allDamageTypes: Picklists["damageTypes"],
  selectedDamageTypeIds: number[],
): Picklists["attackEffects"] {
  if (!selectedDamageTypeIds.length) return [];

  const selectedIds = new Set(selectedDamageTypeIds);
  return allEffects.filter(
    (fx) =>
      Array.isArray(fx.damageTypeIds) &&
      fx.damageTypeIds.some((damageTypeId) => selectedIds.has(damageTypeId)),
  );
}

const ATTR_ROWS = [
  ["Attack", "attackDie", "attackResistDie", "attackModifier"],
  ["Defence", "defenceDie", "defenceResistDie", "defenceModifier"],
  ["Fortitude", "fortitudeDie", "fortitudeResistDie", "fortitudeModifier"],
  ["Intellect", "intellectDie", "intellectResistDie", "intellectModifier"],
  ["Support", "supportDie", "supportResistDie", "supportModifier"],
  ["Bravery", "braveryDie", "braveryResistDie", "braveryModifier"],
] as const;
const ATTRIBUTE_TOOLTIPS: Record<(typeof ATTR_ROWS)[number][0], string> = {
  Attack: "Affects Physical Resilience, Weapon Skill, and physical attack dice.",
  Defence: "Affects Physical Resilience, Armor Skill, Dodge, and physical defence dice.",
  Fortitude: "Affects Physical Resilience and Armor Skill.",
  Intellect: "Affects Mental Perseverance, Dodge, and mental attack dice.",
  Support: "Affects Mental Perseverance, Willpower, and all Ally Assist rolls.",
  Bravery: "Affects Mental Perseverance, Weapon Skill, and Willpower.",
};
const DERIVED_STAT_TOOLTIPS = {
  weaponSkill:
    "Derived from Bravery (weighted) + Attack (weighted). Attributes are halved before weighting.",
  armorSkill:
    "Derived from Fortitude (weighted) + Defence (weighted). Attributes are halved before weighting.",
  dodge:
    "Derived from Intellect (weighted) + Defence (weighted). Attributes are halved before weighting.",
  willpower:
    "Derived from Support (weighted) + Bravery (weighted). Attributes are halved before weighting.",
} as const;

const TIER_MULTIPLIER: Record<MonsterTier, number> = {
  MINION: 1,
  SOLDIER: 1.5,
  ELITE: 2,
  BOSS: 3,
};

const LEGENDARY_BONUS_BY_TIER: Record<MonsterTier, number> = {
  MINION: 0.25,
  SOLDIER: 0.5,
  ELITE: 0.75,
  BOSS: 1,
};
const TRAIT_POINTS_PLACEHOLDER = 5;

function dieLabel(value: DiceSize | null | undefined): string {
  if (!value) return "-";
  return `d${value.replace("D", "")}`;
}

function calculateResilienceValues(
  monster: Pick<
    EditableMonster,
    | "level"
    | "tier"
    | "legendary"
    | "attackDie"
    | "defenceDie"
    | "fortitudeDie"
    | "intellectDie"
    | "supportDie"
    | "braveryDie"
  >,
): {
  physicalResilienceMax: number;
  mentalPerseveranceMax: number;
} {
  const tierMultiplier = TIER_MULTIPLIER[monster.tier];
  const legendaryBonus = monster.legendary ? LEGENDARY_BONUS_BY_TIER[monster.tier] : 0;

  const prBase =
    monster.level +
    (getAttributeNumericValue(monster.attackDie) +
      getAttributeNumericValue(monster.defenceDie) +
      getAttributeNumericValue(monster.fortitudeDie));
  const mpBase =
    monster.level +
    (getAttributeNumericValue(monster.intellectDie) +
      getAttributeNumericValue(monster.supportDie) +
      getAttributeNumericValue(monster.braveryDie));

  const physicalResilienceMax = Math.round(prBase * tierMultiplier + prBase * legendaryBonus);
  const mentalPerseveranceMax = Math.round(mpBase * tierMultiplier + mpBase * legendaryBonus);

  return { physicalResilienceMax, mentalPerseveranceMax };
}

function defaultNaturalConfig(): MonsterNaturalAttackConfig {
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: 1,
      mentalStrength: 0,
      damageTypes: [],
      attackEffects: [],
    },
    ranged: {
      enabled: false,
      targets: 1,
      distance: 30,
      physicalStrength: 0,
      mentalStrength: 0,
      damageTypes: [],
      attackEffects: [],
    },
    aoe: {
      enabled: false,
      count: 1,
      centerRange: 0,
      shape: "SPHERE",
      sphereRadiusFeet: 5,
      physicalStrength: 0,
      mentalStrength: 0,
      damageTypes: [],
      attackEffects: [],
    },
  };
}

function defaultNaturalAttackEntry(sortOrder = 0): MonsterAttack {
  return {
    sortOrder,
    attackMode: "NATURAL",
    attackName: "Natural Weapon",
    attackConfig: defaultNaturalConfig(),
  };
}

function normalizeAttackEntry(
  value: unknown,
  sortOrder: number,
): MonsterAttack {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    sortOrder,
    attackMode: "NATURAL",
    attackName: String(raw.attackName ?? "Natural Weapon"),
    attackConfig: (raw.attackConfig ?? defaultNaturalConfig()) as MonsterNaturalAttackConfig,
  };
}

function defaultMonster(): EditableMonster {
  return {
    name: "New Monster",
    imageUrl: null,
    imagePosX: DEFAULT_IMAGE_POS_X,
    imagePosY: DEFAULT_IMAGE_POS_Y,
    level: 1,
    tier: "MINION",
    legendary: false,
    customNotes: null,
    physicalResilienceCurrent: 10,
    physicalResilienceMax: 10,
    mentalPerseveranceCurrent: 10,
    mentalPerseveranceMax: 10,
    physicalProtection: 0,
    mentalProtection: 0,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 0,
    attackDie: "D6",
    attackResistDie: 0,
    attackModifier: 0,
    defenceDie: "D6",
    defenceResistDie: 0,
    defenceModifier: 0,
    fortitudeDie: "D6",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D6",
    intellectResistDie: 0,
    intellectModifier: 0,
    supportDie: "D6",
    supportResistDie: 0,
    supportModifier: 0,
    braveryDie: "D6",
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: 3,
    weaponSkillModifier: 0,
    armorSkillValue: 3,
    armorSkillModifier: 0,
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
    tags: [],
    traits: [],
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
    attacks: [defaultNaturalAttackEntry(0)],
    naturalAttack: { attackName: "Natural Weapon", attackConfig: defaultNaturalConfig() },
    powers: [],
  };
}

function toEditable(raw: Record<string, unknown>): EditableMonster {
  const tagsRaw = Array.isArray(raw.tags)
    ? raw.tags.map((entry) => String((entry as { tag?: unknown }).tag ?? ""))
    : [];
  const tags: string[] = [];
  const tagSeen = new Set<string>();
  for (const rawTag of tagsRaw) {
    const tag = rawTag.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (tagSeen.has(key)) continue;
    tagSeen.add(key);
    tags.push(tag);
  }
  const traits = Array.isArray(raw.traits)
    ? raw.traits
        .map((entry, i) => {
          const row = entry as {
            sortOrder?: unknown;
            traitDefinitionId?: unknown;
            name?: unknown;
            effectText?: unknown;
            text?: unknown;
            trait?: { id?: unknown; name?: unknown; effectText?: unknown } | null;
          };
          const traitDefinitionId =
            typeof row.traitDefinitionId === "string" && row.traitDefinitionId.trim().length > 0
              ? row.traitDefinitionId.trim()
              : typeof row.trait?.id === "string" && row.trait.id.trim().length > 0
                ? row.trait.id.trim()
                : "";
          const name =
            typeof row.trait?.name === "string"
              ? row.trait.name
              : typeof row.name === "string"
                ? row.name
                : typeof row.text === "string"
                  ? row.text
                  : null;
          const effectText =
            typeof row.trait?.effectText === "string"
              ? row.trait.effectText
              : typeof row.effectText === "string"
                ? row.effectText
                : null;
          return {
            sortOrder: i,
            traitDefinitionId,
            name: name?.trim() || null,
            effectText: effectText?.trim() || null,
          };
        })
        .filter((trait) => trait.traitDefinitionId.length > 0)
    : [];
  const powers = Array.isArray(raw.powers)
    ? raw.powers.map((entry, i) => {
        const p = entry as Record<string, unknown>;
        return {
          sortOrder: i,
          name: String(p.name ?? ""),
          description: p.description ? String(p.description) : null,
          diceCount: Number(p.diceCount ?? 1),
          potency: Number(p.potency ?? 1),
          durationType: p.durationType as MonsterPower["durationType"],
          durationTurns: p.durationType === "TURNS" ? Number(p.durationTurns ?? 1) : null,
          defenceRequirement: p.defenceRequirement as MonsterPower["defenceRequirement"],
          cooldownTurns: Number(p.cooldownTurns ?? 1),
          cooldownReduction: Number(p.cooldownReduction ?? 0),
          responseRequired: !!p.responseRequired,
          intentions: Array.isArray(p.intentions)
            ? p.intentions.map((intention, j) => {
                const it = intention as Record<string, unknown>;
                return {
                  sortOrder: j,
                  type: it.type as MonsterPowerIntentionType,
                  detailsJson:
                    it.detailsJson && typeof it.detailsJson === "object"
                      ? (it.detailsJson as Record<string, unknown>)
                      : {},
                };
              })
            : [],
        };
      })
    : [];

  const naturalAttackRaw =
    raw.naturalAttack && typeof raw.naturalAttack === "object"
      ? (raw.naturalAttack as Record<string, unknown>)
      : null;
  const attacksRaw = Array.isArray(raw.attacks) ? raw.attacks : [];
  const normalizedAttacks: MonsterAttack[] = attacksRaw
    .slice(0, 3)
    .map((entry, index) => normalizeAttackEntry(entry, index));
  const attacks = (normalizedAttacks.length > 0
    ? normalizedAttacks
    : naturalAttackRaw
      ? [
          {
            sortOrder: 0,
            attackMode: "NATURAL" as const,
            attackName: String(naturalAttackRaw.attackName ?? "Natural Weapon"),
            attackConfig: (naturalAttackRaw.attackConfig ??
              defaultNaturalConfig()) as MonsterNaturalAttackConfig,
          },
        ]
      : []
  ).map((attack, index) => ({ ...attack, sortOrder: index }));

  const rawMainHandItemId = typeof raw.mainHandItemId === "string" ? raw.mainHandItemId : null;
  const mainHandItemId =
    rawMainHandItemId && rawMainHandItemId.trim().length > 0 ? rawMainHandItemId.trim() : null;

  return {
    ...defaultMonster(),
    ...raw,
    attackResistDie: Number(raw.attackResistDie ?? 0),
    defenceResistDie: Number(raw.defenceResistDie ?? 0),
    fortitudeResistDie: Number(raw.fortitudeResistDie ?? 0),
    intellectResistDie: Number(raw.intellectResistDie ?? 0),
    supportResistDie: Number(raw.supportResistDie ?? 0),
    braveryResistDie: Number(raw.braveryResistDie ?? 0),
    naturalPhysicalProtection: Math.max(
      0,
      Math.min(30, Number(raw.naturalPhysicalProtection ?? 0) || 0),
    ),
    naturalMentalProtection: Math.max(
      0,
      Math.min(30, Number(raw.naturalMentalProtection ?? 0) || 0),
    ),
    id: typeof raw.id === "string" ? raw.id : undefined,
    source:
      raw.source === "CORE" || raw.source === "CAMPAIGN"
        ? (raw.source as MonsterSource)
        : undefined,
    isReadOnly: !!raw.isReadOnly,
    imageUrl:
      typeof raw.imageUrl === "string" && raw.imageUrl.trim().length > 0
        ? raw.imageUrl.trim()
        : null,
    imagePosX: clampImagePosition(raw.imagePosX, DEFAULT_IMAGE_POS_X),
    imagePosY: clampImagePosition(raw.imagePosY, DEFAULT_IMAGE_POS_Y),
    mainHandItemId,
    offHandItemId:
      typeof raw.offHandItemId === "string" && raw.offHandItemId.trim().length > 0
        ? raw.offHandItemId.trim()
        : null,
    smallItemId:
      typeof raw.smallItemId === "string" && raw.smallItemId.trim().length > 0
        ? raw.smallItemId.trim()
        : null,
    headArmorItemId:
      typeof raw.headArmorItemId === "string" && raw.headArmorItemId.trim().length > 0
        ? raw.headArmorItemId.trim()
        : null,
    shoulderArmorItemId:
      typeof raw.shoulderArmorItemId === "string" && raw.shoulderArmorItemId.trim().length > 0
        ? raw.shoulderArmorItemId.trim()
        : null,
    torsoArmorItemId:
      typeof raw.torsoArmorItemId === "string" && raw.torsoArmorItemId.trim().length > 0
        ? raw.torsoArmorItemId.trim()
        : null,
    legsArmorItemId:
      typeof raw.legsArmorItemId === "string" && raw.legsArmorItemId.trim().length > 0
        ? raw.legsArmorItemId.trim()
        : null,
    feetArmorItemId:
      typeof raw.feetArmorItemId === "string" && raw.feetArmorItemId.trim().length > 0
        ? raw.feetArmorItemId.trim()
        : null,
    headItemId:
      typeof raw.headItemId === "string" && raw.headItemId.trim().length > 0
        ? raw.headItemId.trim()
        : null,
    neckItemId:
      typeof raw.neckItemId === "string" && raw.neckItemId.trim().length > 0
        ? raw.neckItemId.trim()
        : null,
    armsItemId:
      typeof raw.armsItemId === "string" && raw.armsItemId.trim().length > 0
        ? raw.armsItemId.trim()
        : null,
    beltItemId:
      typeof raw.beltItemId === "string" && raw.beltItemId.trim().length > 0
        ? raw.beltItemId.trim()
        : null,
    limitBreakName:
      typeof raw.limitBreakName === "string" && raw.limitBreakName.trim().length > 0
        ? raw.limitBreakName.trim()
        : null,
    limitBreakTier:
      raw.limitBreakTier === "PUSH" ||
      raw.limitBreakTier === "BREAK" ||
      raw.limitBreakTier === "TRANSCEND"
        ? (raw.limitBreakTier as LimitBreakTier)
        : null,
    limitBreakTriggerText:
      typeof raw.limitBreakTriggerText === "string" && raw.limitBreakTriggerText.trim().length > 0
        ? raw.limitBreakTriggerText
        : null,
    limitBreakAttribute:
      raw.limitBreakAttribute === "ATTACK" ||
      raw.limitBreakAttribute === "DEFENCE" ||
      raw.limitBreakAttribute === "FORTITUDE" ||
      raw.limitBreakAttribute === "INTELLECT" ||
      raw.limitBreakAttribute === "SUPPORT" ||
      raw.limitBreakAttribute === "BRAVERY"
        ? (raw.limitBreakAttribute as CoreAttribute)
        : null,
    limitBreakThresholdSuccesses: (() => {
      if (
        raw.limitBreakThresholdSuccesses === null ||
        raw.limitBreakThresholdSuccesses === undefined
      ) {
        return null;
      }
      const parsed = Number(raw.limitBreakThresholdSuccesses);
      if (!Number.isFinite(parsed)) return null;
      return Math.max(1, Math.trunc(parsed));
    })(),
    limitBreakCostText:
      typeof raw.limitBreakCostText === "string" && raw.limitBreakCostText.trim().length > 0
        ? raw.limitBreakCostText
        : null,
    limitBreakEffectText:
      typeof raw.limitBreakEffectText === "string" && raw.limitBreakEffectText.trim().length > 0
        ? raw.limitBreakEffectText
        : null,
    limitBreak2Name:
      typeof raw.limitBreak2Name === "string" && raw.limitBreak2Name.trim().length > 0
        ? raw.limitBreak2Name.trim()
        : null,
    limitBreak2Tier:
      raw.limitBreak2Tier === "PUSH" ||
      raw.limitBreak2Tier === "BREAK" ||
      raw.limitBreak2Tier === "TRANSCEND"
        ? (raw.limitBreak2Tier as LimitBreakTier)
        : null,
    limitBreak2TriggerText:
      typeof raw.limitBreak2TriggerText === "string" && raw.limitBreak2TriggerText.trim().length > 0
        ? raw.limitBreak2TriggerText.trim()
        : null,
    limitBreak2Attribute:
      raw.limitBreak2Attribute === "ATTACK" ||
      raw.limitBreak2Attribute === "DEFENCE" ||
      raw.limitBreak2Attribute === "FORTITUDE" ||
      raw.limitBreak2Attribute === "INTELLECT" ||
      raw.limitBreak2Attribute === "SUPPORT" ||
      raw.limitBreak2Attribute === "BRAVERY"
        ? (raw.limitBreak2Attribute as CoreAttribute)
        : null,
    limitBreak2ThresholdSuccesses: (() => {
      if (
        raw.limitBreak2ThresholdSuccesses === null ||
        raw.limitBreak2ThresholdSuccesses === undefined
      ) {
        return null;
      }
      const parsed = Number(raw.limitBreak2ThresholdSuccesses);
      if (!Number.isFinite(parsed)) return null;
      return Math.max(1, Math.trunc(parsed));
    })(),
    limitBreak2CostText:
      typeof raw.limitBreak2CostText === "string" && raw.limitBreak2CostText.trim().length > 0
        ? raw.limitBreak2CostText.trim()
        : null,
    limitBreak2EffectText:
      typeof raw.limitBreak2EffectText === "string" && raw.limitBreak2EffectText.trim().length > 0
        ? raw.limitBreak2EffectText.trim()
        : null,
    tags,
    traits,
    attacks,
    naturalAttack: naturalAttackRaw
      ? {
          attackName: String(naturalAttackRaw.attackName ?? "Natural Weapon"),
          attackConfig: (naturalAttackRaw.attackConfig ??
            defaultNaturalConfig()) as MonsterNaturalAttackConfig,
        }
      : null,
    powers,
  };
}

function toPayload(monster: EditableMonster): MonsterUpsertInput {
  const normalizedAttacks = monster.attacks
    .slice(0, 3)
    .map((attack, index) => ({
      ...attack,
      sortOrder: index,
      attackMode: "NATURAL" as const,
      attackName: attack.attackName ?? "Natural Weapon",
      attackConfig: attack.attackConfig ?? defaultNaturalConfig(),
    }));
  const primaryAttack = normalizedAttacks[0];

  return {
    ...monster,
    naturalAttack: primaryAttack
      ? {
          attackName: primaryAttack.attackName ?? "Natural Weapon",
          attackConfig: primaryAttack.attackConfig ?? defaultNaturalConfig(),
        }
      : null,
    tags: [...monster.tags],
    traits: monster.traits.map((trait, i) => ({
      sortOrder: i,
      traitDefinitionId: trait.traitDefinitionId,
    })),
    attacks: normalizedAttacks,
    powers: monster.powers.map((p, i) => ({
      ...p,
      sortOrder: i,
      intentions: p.intentions.map((it, j) => ({ ...it, sortOrder: j })),
    })),
  };
}

function defaultPower(): MonsterPower {
  return {
    sortOrder: 0,
    name: "New Power",
    description: null,
    diceCount: 1,
    potency: 1,
    durationType: "INSTANT",
    durationTurns: null,
    defenceRequirement: "NONE",
    cooldownTurns: 1,
    cooldownReduction: 0,
    responseRequired: false,
    intentions: [
      {
        sortOrder: 0,
        type: "ATTACK",
        detailsJson: defaultDetailsForIntentionType("ATTACK"),
      },
    ],
  };
}

function listFromCsv(value: string): string[] {
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function canonicalizeTag(
  raw: string,
  universe: TagSuggestion[],
  existing: string[],
): string | null {
  const tag = raw.trim();
  if (!tag) return null;

  const key = tag.toLowerCase();
  if (existing.some((entry) => entry.toLowerCase() === key)) {
    return null;
  }

  const canonical = universe.find((entry) => entry.value.toLowerCase() === key);
  if (canonical) return canonical.value;

  return tag;
}

function tokenFromTagInput(value: string): string {
  const parts = value.split(",");
  return parts[parts.length - 1]?.trim() ?? "";
}

function formatNumberRanges(values: number[]): string {
  if (values.length === 0) return "";
  const sorted = [...values].sort((a, b) => a - b);
  const ranges: Array<{ start: number; end: number }> = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    if (current === end + 1) {
      end = current;
      continue;
    }
    ranges.push({ start, end });
    start = current;
    end = current;
  }
  ranges.push({ start, end });

  return ranges
    .map((range) => (range.start === range.end ? String(range.start) : `${range.start}-${range.end}`))
    .join(", ");
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function monsterMatches(row: MonsterSummary, q: string): boolean {
  const query = normalizeSearch(q);
  if (!query) return true;

  const name = String((row as { name?: unknown }).name ?? "").toLowerCase();
  if (name.includes(query)) return true;

  const tags = getMonsterTags(row);

  return tags.some((tag) => String(tag).toLowerCase().includes(query));
}

function isLegendaryMonster(row: MonsterSummary): boolean {
  const candidate = row as unknown as { legendary?: unknown; rarity?: unknown };
  if (typeof candidate.legendary === "boolean") {
    return candidate.legendary;
  }
  return String(candidate.rarity ?? "").trim().toLowerCase() === "legendary";
}

function getMonsterTags(row: MonsterSummary): string[] {
  const candidate = row as unknown as { tags?: unknown };
  return Array.isArray(candidate.tags) ? (candidate.tags as string[]) : [];
}

function asNullableId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asNullableText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asNullableDraftText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.length > 0 ? value : null;
}

function clampImagePosition(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
}

function createEmptyAxisBonuses(): RadarAxes {
  return {
    physicalThreat: 0,
    mentalThreat: 0,
    survivability: 0,
    manipulation: 0,
    synergy: 0,
    mobility: 0,
    presence: 0,
  };
}

function getCurvePointForLevel(curve: LevelCurvePoint[], level: number): LevelCurvePoint {
  if (curve.length === 0) return { level: 1, min: 0, max: 1 };
  const sorted = [...curve].sort((a, b) => a.level - b.level);
  const minLevel = sorted[0].level;
  const maxLevel = sorted[sorted.length - 1].level;
  const normalizedLevel = Math.max(minLevel, Math.min(maxLevel, Math.trunc(level || minLevel)));
  const exact = sorted.find((point) => point.level === normalizedLevel);
  if (exact) return exact;
  if (normalizedLevel < minLevel) return sorted[0];
  return sorted[sorted.length - 1];
}

function getTierAdjustedAxisBudgetTarget(curvePoint: LevelCurvePoint, tierMultiplier: number): number {
  return curvePoint.max * Math.max(0, tierMultiplier);
}

function getCalculatorTierMultiplier(
  monster: Pick<EditableMonster, "tier" | "legendary">,
): number {
  const tierKey = monster.legendary ? "LEGENDARY" : monster.tier;
  return calculatorConfig.tierMultipliers[tierKey] ?? calculatorConfig.tierMultipliers.ELITE;
}

const EQUIPMENT_MODIFIER_AXIS_FIELDS = [
  { field: "attackModifier", axis: "physicalThreat" },
  { field: "defenceModifier", axis: "survivability" },
  { field: "fortitudeModifier", axis: "survivability" },
  { field: "intellectModifier", axis: "mentalThreat" },
  { field: "supportModifier", axis: "synergy" },
  { field: "braveryModifier", axis: "manipulation" },
  { field: "weaponSkillModifier", axis: "physicalThreat" },
  { field: "armorSkillModifier", axis: "survivability" },
] as const;

const EQUIPMENT_LINE_ATTACK_THREAT_SHARE_PER_LINE = 0.05;
const EQUIPMENT_LINE_ATTACK_PRESENCE_SHARE_PER_LINE = 0.015;
const EQUIPMENT_LINE_DEFENCE_SURVIVABILITY_SHARE_PER_LINE = 0.06;
const EQUIPMENT_LINE_TRAITS_SYNERGY_SHARE_PER_LINE = 0.04;
const EQUIPMENT_LINE_TRAITS_PRESENCE_SHARE_PER_LINE = 0.02;
const EQUIPMENT_LINE_GENERAL_SYNERGY_SHARE_PER_LINE = 0.03;
const EQUIPMENT_LINE_GENERAL_PRESENCE_SHARE_PER_LINE = 0.015;

const EQUIPMENT_LINE_ATTACK_THREAT_CAP_SHARE = 0.3;
const EQUIPMENT_LINE_ATTACK_PRESENCE_CAP_SHARE = 0.12;
const EQUIPMENT_LINE_DEFENCE_SURVIVABILITY_CAP_SHARE = 0.32;
const EQUIPMENT_LINE_TRAITS_SYNERGY_CAP_SHARE = 0.24;
const EQUIPMENT_LINE_TRAITS_PRESENCE_CAP_SHARE = 0.12;
const EQUIPMENT_LINE_GENERAL_SYNERGY_CAP_SHARE = 0.18;
const EQUIPMENT_LINE_GENERAL_PRESENCE_CAP_SHARE = 0.1;

// SC_DEFENCE_STRING_SURVIVABILITY_V3
const DEFENCE_STRING_PROTECTION_OUTPUT_MAX_SHARE = 1.0;
const DEFENCE_STRING_PROTECTION_OUTPUT_SCALE = 8;

// SC_DODGE_BENCHMARK_V2
const DODGE_BASELINE_MAX_SHARE = 0.2;
const DODGE_BASELINE_SCALE = 1.25;

const DODGE_PARITY_MAX_SHARE = 0.5;
const DODGE_PARITY_SCALE = 0.3;

const DODGE_ABOVE_EXPECTED_MAX_SHARE = 0.35;
const DODGE_ABOVE_EXPECTED_SCALE = 1.2;

const DODGE_TOTAL_MAX_SHARE = 0.95;

type DodgeExpectedAttackCurveRow = {
  minLevel: number;
  maxLevel: number;
  typical: number;
};

const DODGE_EXPECTED_INCOMING_ATTACK_DICE_BY_TIER: Record<
  MonsterTier,
  DodgeExpectedAttackCurveRow[]
> = {
  MINION: [
    { minLevel: 1, maxLevel: 8, typical: 2 },
    { minLevel: 9, maxLevel: 15, typical: 3 },
    { minLevel: 16, maxLevel: 20, typical: 4 },
  ],
  SOLDIER: [
    { minLevel: 1, maxLevel: 4, typical: 2 },
    { minLevel: 5, maxLevel: 11, typical: 3 },
    { minLevel: 12, maxLevel: 15, typical: 4 },
    { minLevel: 16, maxLevel: 20, typical: 5 },
  ],
  ELITE: [
    { minLevel: 1, maxLevel: 4, typical: 3 },
    { minLevel: 5, maxLevel: 11, typical: 4 },
    { minLevel: 12, maxLevel: 15, typical: 5 },
    { minLevel: 16, maxLevel: 20, typical: 6 },
  ],
  BOSS: [
    { minLevel: 1, maxLevel: 4, typical: 4 },
    { minLevel: 5, maxLevel: 11, typical: 5 },
    { minLevel: 12, maxLevel: 15, typical: 6 },
    { minLevel: 16, maxLevel: 20, typical: 7 },
  ],
};

function getExpectedIncomingAttackDiceForDodge(
  level: number,
  tier: MonsterTier | null | undefined,
): number {
  const normalizedLevel = Math.max(1, Math.trunc(level || 1));
  const normalizedTier = tier ?? "ELITE";
  const rows =
    DODGE_EXPECTED_INCOMING_ATTACK_DICE_BY_TIER[normalizedTier] ??
    DODGE_EXPECTED_INCOMING_ATTACK_DICE_BY_TIER.ELITE;

  const match = rows.find(
    (row) => normalizedLevel >= row.minLevel && normalizedLevel <= row.maxLevel,
  );

  if (match) return match.typical;
  if (normalizedLevel < rows[0].minLevel) return rows[0].typical;
  return rows[rows.length - 1].typical;
}

function getSmoothDodgeShare(
  rawValue: number,
  scale: number,
  maxShare: number,
): number {
  const normalized = Math.max(0, Number.isFinite(rawValue) ? rawValue : 0);
  const safeScale = Math.max(0.001, scale);
  const safeMax = Math.max(0, maxShare);
  return safeMax * (1 - Math.exp(-normalized / safeScale));
}

function getDodgeParityProgress(
  currentDodgeDice: number,
  expectedIncomingAttackDice: number,
): number {
  const current = Math.max(0, Number.isFinite(currentDodgeDice) ? currentDodgeDice : 0);
  const expected = Math.max(
    1,
    Number.isFinite(expectedIncomingAttackDice) ? expectedIncomingAttackDice : 1,
  );
  return Math.min(1, current / expected);
}

function getCappedEquipmentLineShare(
  lineCount: number,
  perLineShare: number,
  capShare: number,
): number {
  const normalizedCount = Math.max(0, Math.trunc(lineCount || 0));
  return Math.min(capShare, normalizedCount * perLineShare);
}

function getSmoothDefenceShare(
  rawPotential: number,
  scale: number,
  maxShare: number,
): number {
  const normalized = Math.max(0, Number.isFinite(rawPotential) ? rawPotential : 0);
  const safeScale = Math.max(0.001, scale);
  const safeMax = Math.max(0, maxShare);
  return safeMax * (1 - Math.exp(-normalized / safeScale));
}

function addNaturalAttackGsEffectAxisBonus(
  bonuses: RadarAxes,
  effectName: string,
  axisBudgetTargets: RadarAxes,
) {
  const normalized = effectName.trim().toLowerCase();
  if (!normalized) return;

  if (NATURAL_ATTACK_GS_MENTAL_ATTRITION_EFFECTS.has(normalized)) {
    bonuses.mentalThreat +=
      axisBudgetTargets.mentalThreat * NATURAL_ATTACK_GS_ATTRITION_PRIMARY_SHARE;
    bonuses.presence += axisBudgetTargets.presence * NATURAL_ATTACK_GS_ATTRITION_PRESENCE_SHARE;
    return;
  }

  if (NATURAL_ATTACK_GS_PHYSICAL_ATTRITION_EFFECTS.has(normalized)) {
    bonuses.physicalThreat +=
      axisBudgetTargets.physicalThreat * NATURAL_ATTACK_GS_ATTRITION_PRIMARY_SHARE;
    bonuses.presence += axisBudgetTargets.presence * NATURAL_ATTACK_GS_ATTRITION_PRESENCE_SHARE;
    return;
  }

  if (NATURAL_ATTACK_GS_PRESSURE_EFFECTS.has(normalized)) {
    bonuses.manipulation +=
      axisBudgetTargets.manipulation * NATURAL_ATTACK_GS_PRESSURE_PRIMARY_SHARE;
    bonuses.presence += axisBudgetTargets.presence * NATURAL_ATTACK_GS_PRESSURE_PRESENCE_SHARE;
    return;
  }

  if (NATURAL_ATTACK_GS_CONTROL_EFFECTS.has(normalized)) {
    bonuses.manipulation +=
      axisBudgetTargets.manipulation * NATURAL_ATTACK_GS_CONTROL_PRIMARY_SHARE;
    bonuses.presence += axisBudgetTargets.presence * NATURAL_ATTACK_GS_CONTROL_PRESENCE_SHARE;
    if (NATURAL_ATTACK_GS_CONTROL_PHYSICAL_THREAT_EFFECTS.has(normalized)) {
      bonuses.physicalThreat +=
        axisBudgetTargets.physicalThreat * NATURAL_ATTACK_GS_CONTROL_EXTRA_THREAT_SHARE;
    }
  }
}

function addNaturalAttackRangeAxisBonus(
  bonuses: RadarAxes,
  attackConfig: MonsterNaturalAttackConfig,
  axisBudgetTargets: RadarAxes,
) {
  const resolveThreatChannels = (rangeConfig: unknown) => {
    const config = (rangeConfig ?? {}) as {
      physicalStrength?: unknown;
      mentalStrength?: unknown;
      damageTypes?: Array<{ mode?: unknown; attackMode?: unknown }>;
    };
    let physicalValue = Math.max(0, Number(config.physicalStrength ?? 0));
    let mentalValue = Math.max(0, Number(config.mentalStrength ?? 0));
    const modes = new Set<"PHYSICAL" | "MENTAL">();
    for (const row of config.damageTypes ?? []) {
      const mode = String(row?.mode ?? row?.attackMode ?? "").toUpperCase();
      if (mode === "PHYSICAL" || mode === "MENTAL") modes.add(mode);
    }

    if (modes.has("MENTAL") && !modes.has("PHYSICAL") && mentalValue === 0 && physicalValue > 0) {
      mentalValue = physicalValue;
      physicalValue = 0;
    }
    if (modes.has("PHYSICAL") && !modes.has("MENTAL") && physicalValue === 0 && mentalValue > 0) {
      physicalValue = mentalValue;
      mentalValue = 0;
    }

    return {
      hasPhysical: physicalValue > 0,
      hasMental: mentalValue > 0,
    };
  };

  const addRelevantThreat = (share: number, rangeConfig: unknown) => {
    const channels = resolveThreatChannels(rangeConfig);
    if (channels.hasPhysical) {
      bonuses.physicalThreat += axisBudgetTargets.physicalThreat * share;
    }
    if (channels.hasMental) {
      bonuses.mentalThreat += axisBudgetTargets.mentalThreat * share;
    }
  };

  const getRangeScalar = (distanceFeet: number): number | null =>
    NATURAL_ATTACK_RANGE_SCALAR_BY_DISTANCE[distanceFeet] ?? null;
  const getRangeMobilityBonus = (distanceFeet: number): number =>
    NATURAL_ATTACK_RANGE_MOBILITY_BONUS_BY_DISTANCE[distanceFeet] ?? 0;
  const getExpectedNaturalAoeTargetsFromGeometry = (
    aoeConfig: NonNullable<MonsterNaturalAttackConfig["aoe"]>,
  ): number => {
    const shape = String(aoeConfig.shape ?? "SPHERE").toUpperCase();
    if (shape === "SPHERE") {
      const sphereTargets: Record<number, number> = { 10: 3, 20: 6, 30: 9 };
      return sphereTargets[Math.max(0, Number(aoeConfig.sphereRadiusFeet ?? 0))] ?? 1;
    }
    if (shape === "CONE") {
      const coneTargets: Record<number, number> = { 15: 3, 30: 8, 60: 14 };
      return coneTargets[Math.max(0, Number(aoeConfig.coneLengthFeet ?? 0))] ?? 1;
    }

    const lineTargetTable: Record<number, Record<number, number>> = {
      5: { 30: 3, 60: 6, 90: 9, 120: 12 },
      10: { 30: 4, 60: 8, 90: 12, 120: 16 },
      15: { 30: 5, 60: 10, 90: 15, 120: 20 },
      20: { 30: 6, 60: 12, 90: 18, 120: 24 },
    };
    const width = Math.max(0, Number(aoeConfig.lineWidthFeet ?? 0));
    const length = Math.max(0, Number(aoeConfig.lineLengthFeet ?? 0));
    return lineTargetTable[width]?.[length] ?? 1;
  };

  const rangedConfig = attackConfig.ranged;
  if (rangedConfig?.enabled) {
    const distance = Number(rangedConfig.distance ?? 0);
    const rangeScalar = getRangeScalar(distance);
    const threatShare = NATURAL_ATTACK_RANGED_THREAT_SHARE_BY_DISTANCE[distance];
    const presenceShare = NATURAL_ATTACK_RANGED_PRESENCE_SHARE_BY_DISTANCE[distance];
    if (rangeScalar !== null && threatShare !== undefined && presenceShare !== undefined) {
      bonuses.mobility += axisBudgetTargets.mobility * getRangeMobilityBonus(distance);
      bonuses.presence += axisBudgetTargets.presence * presenceShare;
      addRelevantThreat(threatShare, rangedConfig);
    }
  }

  const aoeConfig = attackConfig.aoe;
  if (!aoeConfig?.enabled) return;
  const castRange = Number(aoeConfig.centerRange ?? 0);
  const rangeScalar = getRangeScalar(castRange);
  if (rangeScalar === null) return;

  bonuses.mobility += axisBudgetTargets.mobility * getRangeMobilityBonus(castRange);
  const expectedTargets = getExpectedNaturalAoeTargetsFromGeometry(aoeConfig);
  const extraTargets = Math.max(0, expectedTargets - 1);
  const additionalPresenceShare = extraTargets * 0.035 * rangeScalar;
  bonuses.presence += axisBudgetTargets.presence * additionalPresenceShare;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getWeaponSourceAttackLines(
  item: Pick<WeaponProjection, "type" | "melee" | "ranged" | "aoe"> | null | undefined,
  weaponSkillValue: number,
  level?: number,
): string[] {
  if (!item) return [];
  if (item.type !== "WEAPON" && item.type !== "SHIELD") return [];
  return renderAttackActionLines(
    {
      melee: item.melee,
      ranged: item.ranged,
      aoe: item.aoe,
    } as MonsterNaturalAttackConfig,
    weaponSkillValue,
    { applyWeaponSkillOverride: true, strengthMultiplier: 2, level },
  );
}

function HoverTooltipLabel({
  label,
  tooltip,
  className,
}: {
  label: string;
  tooltip: string;
  className?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ left: -9999, top: -9999, maxWidth: 320 });

  const updateTooltipPosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltipEl = tooltipRef.current;
    if (!trigger || !tooltipEl) return;

    const viewportPadding = 12;
    const tooltipGap = 6;
    const maxWidth = Math.max(180, Math.min(320, window.innerWidth - viewportPadding * 2));
    tooltipEl.style.maxWidth = `${maxWidth}px`;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();

    let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - viewportPadding - tooltipRect.width));

    let top = triggerRect.top - tooltipRect.height - tooltipGap;
    if (top < viewportPadding) {
      top = Math.min(
        window.innerHeight - viewportPadding - tooltipRect.height,
        triggerRect.bottom + tooltipGap,
      );
    }

    setTooltipPos({ left, top, maxWidth });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updateTooltipPosition();
    const onViewportChange = () => updateTooltipPosition();

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [isOpen, updateTooltipPosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && triggerRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return (
    <span className="relative inline-flex items-center">
      <span
        ref={triggerRef}
        tabIndex={0}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onPointerDown={(event: ReactPointerEvent<HTMLSpanElement>) => {
          if (event.pointerType !== "touch") return;
          event.preventDefault();
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
          }
        }}
        className={[
          "cursor-help rounded-sm border-b border-dotted border-zinc-500 outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
          className ?? "text-sm",
        ].join(" ")}
      >
        {label}
      </span>
      <span
        ref={tooltipRef}
        role="tooltip"
        aria-hidden={!isOpen}
        className={[
          "pointer-events-none fixed z-30 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-center text-xs leading-snug text-zinc-200 whitespace-normal break-words shadow-lg transition-opacity",
          isOpen ? "opacity-100" : "opacity-0",
        ].join(" ")}
        style={{
          left: `${tooltipPos.left}px`,
          top: `${tooltipPos.top}px`,
          maxWidth: `${tooltipPos.maxWidth}px`,
        }}
      >
        {tooltip}
      </span>
    </span>
  );
}

export function SummoningCircleEditor({ campaignId }: Props) {
  const searchParams = useSearchParams();
  const monsterIdFromUrl = searchParams.get("monsterId");
  const [summaries, setSummaries] = useState<MonsterSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditableMonster | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [activeTagIndex, setActiveTagIndex] = useState<number>(-1);
  const [tagsFocused, setTagsFocused] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [weapons, setWeapons] = useState<WeaponProjection[]>([]);
  const [picklists, setPicklists] = useState<Picklists>({ damageTypes: [], attackEffects: [] });
  const [traitDefinitions, setTraitDefinitions] = useState<MonsterTraitDefinitionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // SC_INLINE_HAND_EQUIP_CAP_WARNING_V1
  const [equipmentCapHint, setEquipmentCapHint] = useState<string | null>(null);
  const [equipmentCapHintSlot, setEquipmentCapHintSlot] = useState<
    null | "mainHandItemId" | "offHandItemId" | "smallItemId"
  >(null);
  const [previewPrintLayout, setPreviewPrintLayout] = useState<PrintLayoutMode>("COMPACT_1P");
  const [calculatorArchetype, setCalculatorArchetype] =
    useState<MonsterCalculatorArchetype>("BALANCED");
  const [mobileView, setMobileView] = useState<"editor" | "preview">("editor");
  const [monsterPickerOpen, setMonsterPickerOpen] = useState(false);
  const [collapsedPowerIds, setCollapsedPowerIds] = useState<Record<string, boolean>>({});
  const [collapsedNaturalAttacks, setCollapsedNaturalAttacks] = useState<Record<string, boolean>>(
    {},
  );
  const [collapsedLimitBreaks, setCollapsedLimitBreaks] = useState<Record<"LB1" | "LB2", boolean>>({
    LB1: true,
    LB2: true,
  });
  const [equippedGearCollapsed, setEquippedGearCollapsed] = useState(false);

  const togglePowerCollapsed = useCallback((powerId: string) => {
    setCollapsedPowerIds((prev) => {
      if (prev[powerId]) {
        const next = { ...prev };
        delete next[powerId];
        return next;
      }
      return { ...prev, [powerId]: true };
    });
  }, []);
  const getNaturalAttackCollapseKey = useCallback(
    (attack: MonsterAttack, attackIndex: number) => {
      const candidate = (attack as { id?: unknown }).id;
      if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
      return String(attackIndex);
    },
    [],
  );
  const toggleNaturalAttackCollapsed = useCallback((key: string) => {
    setCollapsedNaturalAttacks((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: true };
    });
  }, []);
  const getPowerCollapseKey = useCallback((power: MonsterPower, powerIndex: number) => {
    const candidate = (power as { id?: unknown }).id;
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
    return String(powerIndex);
  }, []);
  const toggleLimitBreakCollapsed = useCallback((key: "LB1" | "LB2") => {
    setCollapsedLimitBreaks((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const [monsterPickerQuery, setMonsterPickerQuery] = useState("");
  const [monsterFiltersOpen, setMonsterFiltersOpen] = useState(false);
  const [monsterLevelSelected, setMonsterLevelSelected] = useState<number[]>([]);
  const [monsterTierSelected, setMonsterTierSelected] = useState<MonsterTier[]>([]);
  const [monsterExcludeLegendary, setMonsterExcludeLegendary] = useState(false);
  const [recentMonsterIds, setRecentMonsterIds] = useState<string[]>([]);
  const hasDraftRef = useRef(false);
  const hasHydratedMonsterIdFromUrlRef = useRef(false);
  const collapseSeedKeyRef = useRef<string | null>(null);
  const monsterPickerRef = useRef<HTMLDivElement | null>(null);
  const monsterFiltersRef = useRef<HTMLDivElement | null>(null);
  const imageCropFrameRef = useRef<HTMLDivElement | null>(null);
  const imageDragStateRef = useRef<ImageDragState | null>(null);
  const [imageRepositionMode, setImageRepositionMode] = useState(false);
  const [imageDragging, setImageDragging] = useState(false);

  const readOnly = !!editor && (editor.source === "CORE" || editor.isReadOnly);
  const editorImagePosX = clampImagePosition(editor?.imagePosX, DEFAULT_IMAGE_POS_X);
  const editorImagePosY = clampImagePosition(editor?.imagePosY, DEFAULT_IMAGE_POS_Y);
  const editorHasValidImageUrl = isHttpUrl(editor?.imageUrl);
  const resilienceValues = useMemo(
    () =>
      editor
        ? calculateResilienceValues(editor)
        : { physicalResilienceMax: 0, mentalPerseveranceMax: 0 },
    [editor],
  );
  const baseWeaponSkillValue = useMemo(
    () =>
      editor
        ? getWeaponSkillDiceCountFromAttributes(editor.attackDie, editor.braveryDie)
        : 1,
    [editor?.attackDie, editor?.braveryDie],
  );
  const baseArmorSkillValue = useMemo(
    () =>
      editor
        ? getArmorSkillDiceCountFromAttributes(editor.defenceDie, editor.fortitudeDie)
        : 1,
    [editor?.defenceDie, editor?.fortitudeDie],
  );
  const customLimitBreakAttributeValue = useMemo(() => {
    if (!editor?.limitBreakAttribute) return null;
    switch (editor.limitBreakAttribute) {
      case "ATTACK":
        return getAttributeNumericValue(editor.attackDie);
      case "DEFENCE":
        return getAttributeNumericValue(editor.defenceDie);
      case "FORTITUDE":
        return getAttributeNumericValue(editor.fortitudeDie);
      case "INTELLECT":
        return getAttributeNumericValue(editor.intellectDie);
      case "SUPPORT":
        return getAttributeNumericValue(editor.supportDie);
      case "BRAVERY":
        return getAttributeNumericValue(editor.braveryDie);
      default:
        return null;
    }
  }, [
    editor?.attackDie,
    editor?.braveryDie,
    editor?.defenceDie,
    editor?.fortitudeDie,
    editor?.intellectDie,
    editor?.limitBreakAttribute,
    editor?.supportDie,
  ]);
  const customLimitBreakThresholdRequired = useMemo(() => {
    if (!editor?.limitBreakTier || customLimitBreakAttributeValue === null) return null;
    const thresholdPercent = getLimitBreakThresholdPercent(editor.limitBreakTier);
    if (thresholdPercent === null) return null;
    return getLimitBreakRequiredSuccesses(
      getAttributeLimitBreakCeiling(customLimitBreakAttributeValue),
      thresholdPercent,
    );
  }, [customLimitBreakAttributeValue, editor?.limitBreakTier]);
  const customLimitBreak2AttributeValue = useMemo(() => {
    if (!editor?.limitBreak2Attribute) return null;
    switch (editor.limitBreak2Attribute) {
      case "ATTACK":
        return getAttributeNumericValue(editor.attackDie);
      case "DEFENCE":
        return getAttributeNumericValue(editor.defenceDie);
      case "FORTITUDE":
        return getAttributeNumericValue(editor.fortitudeDie);
      case "INTELLECT":
        return getAttributeNumericValue(editor.intellectDie);
      case "SUPPORT":
        return getAttributeNumericValue(editor.supportDie);
      case "BRAVERY":
        return getAttributeNumericValue(editor.braveryDie);
      default:
        return null;
    }
  }, [
    editor?.attackDie,
    editor?.braveryDie,
    editor?.defenceDie,
    editor?.fortitudeDie,
    editor?.intellectDie,
    editor?.limitBreak2Attribute,
    editor?.supportDie,
  ]);
  const customLimitBreak2ThresholdRequired = useMemo(() => {
    if (!editor?.limitBreak2Tier || customLimitBreak2AttributeValue === null) return null;
    const thresholdPercent = getLimitBreakThresholdPercent(editor.limitBreak2Tier);
    if (thresholdPercent === null) return null;
    return getLimitBreakRequiredSuccesses(
      getAttributeLimitBreakCeiling(customLimitBreak2AttributeValue),
      thresholdPercent,
    );
  }, [customLimitBreak2AttributeValue, editor?.limitBreak2Tier]);
  const hasLimitBreak1 = Boolean(
    editor?.limitBreakName ||
      editor?.limitBreakTier ||
      editor?.limitBreakTriggerText ||
      editor?.limitBreakCostText ||
      editor?.limitBreakEffectText ||
      editor?.limitBreakAttribute ||
      editor?.limitBreakThresholdSuccesses,
  );
  const hasLimitBreak2 = Boolean(
    editor?.limitBreak2Name ||
      editor?.limitBreak2Tier ||
      editor?.limitBreak2TriggerText ||
      editor?.limitBreak2CostText ||
      editor?.limitBreak2EffectText ||
      editor?.limitBreak2Attribute ||
      editor?.limitBreak2ThresholdSuccesses,
  );
  const limitBreak2Enabled = hasLimitBreak2;
  const queryFilteredSummaries = useMemo(
    () => summaries.filter((summary) => monsterMatches(summary, monsterPickerQuery)),
    [summaries, monsterPickerQuery],
  );
  const filteredSummaries = useMemo(
    () =>
      queryFilteredSummaries.filter((summary) => {
        if (monsterLevelSelected.length > 0 && !monsterLevelSelected.includes(summary.level)) {
          return false;
        }
        if (monsterTierSelected.length > 0 && !monsterTierSelected.includes(summary.tier)) {
          return false;
        }
        if (monsterExcludeLegendary && isLegendaryMonster(summary)) {
          return false;
        }
        return true;
      }),
    [queryFilteredSummaries, monsterExcludeLegendary, monsterLevelSelected, monsterTierSelected],
  );
  const recentMonsterStorageKey = useMemo(
    () => `sc.recentMonsters.${campaignId}`,
    [campaignId],
  );
  const summariesById = useMemo(() => {
    const map: Record<string, MonsterSummary> = {};
    for (const row of summaries) {
      map[row.id] = row;
    }
    return map;
  }, [summaries]);
  const hasMonsterSearchQuery = monsterPickerQuery.trim().length > 0;
  const hasMonsterFilters =
    monsterLevelSelected.length > 0 ||
    monsterTierSelected.length > 0 ||
    monsterExcludeLegendary;
  const monsterPickerTotalCount = summaries.length;
  const monsterPickerFilteredCount = filteredSummaries.length;
  const activeMonsterFilterPills = useMemo(() => {
    const pills: Array<{ id: "level" | "tier" | "noLegendary"; label: string }> = [];
    if (monsterLevelSelected.length > 0) {
      pills.push({
        id: "level",
        label: `Level: ${formatNumberRanges(monsterLevelSelected)}`,
      });
    }
    if (monsterTierSelected.length > 0) {
      pills.push({
        id: "tier",
        label: `Tier: ${monsterTierSelected.map((tier) => MONSTER_TIER_LABELS[tier]).join(", ")}`,
      });
    }
    if (monsterExcludeLegendary) {
      pills.push({ id: "noLegendary", label: "No Legendary" });
    }
    return pills;
  }, [monsterExcludeLegendary, monsterLevelSelected, monsterTierSelected]);
  const recentMonsterRows = useMemo(() => {
    if (hasMonsterSearchQuery) return [] as MonsterSummary[];
    const allowedIds = new Set(filteredSummaries.map((row) => row.id));
    const rows: MonsterSummary[] = [];
    for (const id of recentMonsterIds) {
      const row = summariesById[id];
      if (!row) continue;
      if (!allowedIds.has(row.id)) continue;
      rows.push(row);
    }
    return rows;
  }, [filteredSummaries, hasMonsterSearchQuery, recentMonsterIds, summariesById]);
  const recentMonsterIdSet = useMemo(
    () => new Set(recentMonsterRows.map((row) => row.id)),
    [recentMonsterRows],
  );
  const filteredSummariesWithoutRecent = useMemo(
    () => filteredSummaries.filter((row) => !recentMonsterIdSet.has(row.id)),
    [filteredSummaries, recentMonsterIdSet],
  );

  const selectedMonsterId = selectedId;
  const setSelectedMonsterId = setSelectedId;

  useEffect(() => {
    // SUMMONING_CIRCLE_URL_MONSTER_HYDRATION
    if (hasHydratedMonsterIdFromUrlRef.current) return;
    hasHydratedMonsterIdFromUrlRef.current = true;

    if (!monsterIdFromUrl) return;

    // prevents overwriting existing editing state
    if (selectedMonsterId) return;

    setSelectedMonsterId(monsterIdFromUrl);
  }, [monsterIdFromUrl, selectedMonsterId, setSelectedMonsterId]);

  const refreshSummaries = useCallback(async () => {
    const res = await fetch(
      `/api/summoning-circle/monsters?campaignId=${encodeURIComponent(campaignId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error("Failed to load monsters");
    const json = await res.json();
    const list = Array.isArray(json.monsters) ? (json.monsters as MonsterSummary[]) : [];
    setSummaries(list);
    setSelectedId((current) => {
      if (current) {
        return list.some((m) => m.id === current) ? current : (list[0]?.id ?? null);
      }
      return hasDraftRef.current ? null : (list[0]?.id ?? null);
    });
  }, [campaignId]);

  const refreshStatic = useCallback(async () => {
    const [weaponRes, pickRes, traitRes] = await Promise.all([
      fetch(`/api/summoning-circle/weapons?campaignId=${encodeURIComponent(campaignId)}`, {
        cache: "no-store",
      }),
      fetch("/api/forge/picklists", { cache: "no-store" }),
      fetch("/api/summoning-circle/traits", { cache: "no-store" }),
    ]);

    if (weaponRes.ok) {
      const json = await weaponRes.json();
      setWeapons(Array.isArray(json.weapons) ? json.weapons : []);
    }
    if (pickRes.ok) {
      const json = await pickRes.json();
      setPicklists({
        damageTypes: Array.isArray(json.damageTypes)
          ? json.damageTypes.map((row: { id?: unknown; name?: unknown; attackMode?: unknown }) => ({
              id:
                typeof row.id === "number"
                  ? row.id
                  : typeof row.id === "string"
                    ? Number.parseInt(row.id, 10)
                    : NaN,
              name: typeof row.name === "string" ? row.name : "",
              attackMode: getAttackModeKey(row.attackMode),
            })).filter(
              (
                row: { id: number; name: string; attackMode: "PHYSICAL" | "MENTAL" },
              ): row is { id: number; name: string; attackMode: "PHYSICAL" | "MENTAL" } =>
                Number.isFinite(row.id) && row.name.trim().length > 0,
            )
          : [],
        attackEffects: Array.isArray(json.attackEffects) ? json.attackEffects : [],
      });
    }
    if (traitRes.ok) {
      const json = await traitRes.json();
      setTraitDefinitions(
        Array.isArray(json.rows)
          ? json.rows.map((row: unknown) => {
              const candidate = row as {
                id?: unknown;
                name?: unknown;
                effectText?: unknown;
                band?: unknown;
                physicalThreatWeight?: unknown;
                mentalThreatWeight?: unknown;
                survivabilityWeight?: unknown;
                manipulationWeight?: unknown;
                synergyWeight?: unknown;
                mobilityWeight?: unknown;
                presenceWeight?: unknown;
              };
              return {
                id: String(candidate.id ?? ""),
                name: String(candidate.name ?? ""),
                effectText:
                  typeof candidate.effectText === "string"
                    ? candidate.effectText
                    : null,
                band:
                  candidate.band === "MINOR" ||
                  candidate.band === "STANDARD" ||
                  candidate.band === "MAJOR" ||
                  candidate.band === "BOSS"
                    ? candidate.band
                    : "STANDARD",
                physicalThreatWeight: Number(candidate.physicalThreatWeight ?? 0) || 0,
                mentalThreatWeight: Number(candidate.mentalThreatWeight ?? 0) || 0,
                survivabilityWeight: Number(candidate.survivabilityWeight ?? 0) || 0,
                manipulationWeight: Number(candidate.manipulationWeight ?? 0) || 0,
                synergyWeight: Number(candidate.synergyWeight ?? 0) || 0,
                mobilityWeight: Number(candidate.mobilityWeight ?? 0) || 0,
                presenceWeight: Number(candidate.presenceWeight ?? 0) || 0,
              };
            })
          : [],
      );
    }
  }, [campaignId]);

  const refreshSelected = useCallback(
    async (id: string) => {
      const res = await fetch(
        `/api/summoning-circle/monsters/${id}?campaignId=${encodeURIComponent(campaignId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to load monster");
      const json = await res.json();
      setEditor(toEditable(json));
    },
    [campaignId],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([refreshSummaries(), refreshStatic()]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [refreshSummaries, refreshStatic]);

  useEffect(() => {
    if (!selectedId) return;
    const monsterId = selectedId;
    let cancelled = false;
    async function load() {
      try {
        await refreshSelected(monsterId);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load monster");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [refreshSelected, selectedId]);

  useEffect(() => {
    if (!editor) {
      setTagInput("");
      setTagSuggestions([]);
      setActiveTagIndex(-1);
      setEquipmentCapHint(null);
      setEquipmentCapHintSlot(null);
      setImageRepositionMode(false);
      setImageDragging(false);
      imageDragStateRef.current = null;
      return;
    }
    setTagInput("");
    setTagSuggestions([]);
    setActiveTagIndex(-1);
    setEquipmentCapHint(null);
    setEquipmentCapHintSlot(null);
    setImageRepositionMode(false);
    setImageDragging(false);
    imageDragStateRef.current = null;
  }, [editor?.id, selectedId]);

  useEffect(() => {
    if (imageRepositionMode) return;
    imageDragStateRef.current = null;
    setImageDragging(false);
  }, [imageRepositionMode]);

  useEffect(() => {
    if (!editor) {
      collapseSeedKeyRef.current = null;
      return;
    }

    const normalizedId =
      typeof editor.id === "string" && editor.id.trim().length > 0
        ? editor.id.trim()
        : null;
    const collapseSeedKey = normalizedId
      ? `existing:${normalizedId}`
      : `draft:${selectedId ?? "new"}`;

    if (collapseSeedKeyRef.current === collapseSeedKey) {
      return;
    }
    collapseSeedKeyRef.current = collapseSeedKey;

    const isExistingMonster = normalizedId !== null;

    const nextCollapsedPowerIds: Record<string, boolean> = {};
    for (let idx = 0; idx < editor.powers.length; idx += 1) {
      const key = getPowerCollapseKey(editor.powers[idx], idx);
      nextCollapsedPowerIds[key] = true;
    }

    const nextCollapsedNaturalAttackIds: Record<string, boolean> = {};
    for (let idx = 0; idx < editor.attacks.length; idx += 1) {
      const key = getNaturalAttackCollapseKey(editor.attacks[idx], idx);
      nextCollapsedNaturalAttackIds[key] = true;
    }

    setEquippedGearCollapsed(isExistingMonster);
    setCollapsedPowerIds(nextCollapsedPowerIds);
    setCollapsedNaturalAttacks(nextCollapsedNaturalAttackIds);
    setCollapsedLimitBreaks({ LB1: true, LB2: true });
  }, [editor, selectedId, getPowerCollapseKey, getNaturalAttackCollapseKey]);

  useEffect(() => {
    setMonsterPickerOpen(false);
    setMonsterPickerQuery("");
  }, [selectedId]);

  useEffect(() => {
    setMonsterFiltersOpen(false);
    setMonsterLevelSelected([]);
    setMonsterTierSelected([]);
    setMonsterExcludeLegendary(false);
  }, [campaignId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setRecentMonsterIds([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(recentMonsterStorageKey);
      if (!raw) {
        setRecentMonsterIds([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setRecentMonsterIds([]);
        return;
      }
      const sanitized = parsed
        .map((value) => String(value))
        .filter((value) => value.trim().length > 0)
        .slice(0, MAX_RECENT_PICKER_ITEMS);
      setRecentMonsterIds(sanitized);
    } catch {
      setRecentMonsterIds([]);
    }
  }, [recentMonsterStorageKey]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (monsterPickerRef.current && !monsterPickerRef.current.contains(target)) {
        setMonsterPickerOpen(false);
      }
      if (monsterFiltersRef.current && !monsterFiltersRef.current.contains(target)) {
        setMonsterFiltersOpen(false);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (monsterFiltersOpen) {
        setMonsterFiltersOpen(false);
        return;
      }
      if (monsterPickerOpen) {
        setMonsterPickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [monsterFiltersOpen, monsterPickerOpen]);

  const persistRecentMonsterIds = useCallback(
    (ids: string[]) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(
          recentMonsterStorageKey,
          JSON.stringify(ids.slice(0, MAX_RECENT_PICKER_ITEMS)),
        );
      } catch {
        // no-op: localStorage unavailable
      }
    },
    [recentMonsterStorageKey],
  );

  useEffect(() => {
    if (summaries.length === 0) return;
    const validIds = new Set(summaries.map((row) => row.id));
    setRecentMonsterIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      if (next.length !== prev.length) {
        persistRecentMonsterIds(next);
      }
      return next;
    });
  }, [persistRecentMonsterIds, summaries]);

  const markMonsterAsRecent = useCallback(
    (monsterId: string) => {
      setRecentMonsterIds((prev) => {
        const next = [monsterId, ...prev.filter((id) => id !== monsterId)].slice(
          0,
          MAX_RECENT_PICKER_ITEMS,
        );
        persistRecentMonsterIds(next);
        return next;
      });
    },
    [persistRecentMonsterIds],
  );

  const currentTagToken = useMemo(() => tokenFromTagInput(tagInput), [tagInput]);

  const filteredTagSuggestions = useMemo(() => {
    if (!editor) return [];
    const existing = new Set(editor.tags.map((tag) => tag.toLowerCase()));
    return tagSuggestions.filter((suggestion) => !existing.has(suggestion.value.toLowerCase()));
  }, [editor, tagSuggestions]);

  useEffect(() => {
    if (!editor || readOnly) return;
    if (currentTagToken.length < 2) {
      setTagSuggestions([]);
      setActiveTagIndex(-1);
      setTagsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setTagsLoading(true);
      try {
        const res = await fetch(
          `/api/summoning-circle/tags?campaignId=${encodeURIComponent(campaignId)}&s=${encodeURIComponent(currentTagToken)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!res.ok) throw new Error("Failed to load tag suggestions");
        const json = (await res.json()) as { suggestions?: TagSuggestion[] };
        setTagSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") {
          setTagSuggestions([]);
          setActiveTagIndex(-1);
        }
      } finally {
        setTagsLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [campaignId, currentTagToken, editor, readOnly]);

  const isTagDropdownOpen = tagsFocused && currentTagToken.length >= 2;

  useEffect(() => {
    if (!isTagDropdownOpen || filteredTagSuggestions.length === 0) {
      setActiveTagIndex(-1);
      return;
    }
    setActiveTagIndex(-1);
  }, [filteredTagSuggestions, isTagDropdownOpen]);

  const commitTagInput = useCallback(
    (rawValue?: string) => {
      const valueToCommit = rawValue ?? tagInput;
      const parsed = listFromCsv(valueToCommit);

      if (parsed.length > 0) {
        setEditor((prev) =>
          prev
            ? (() => {
                const nextTags = [...prev.tags];
                for (const part of parsed) {
                  const canonical = canonicalizeTag(part, tagSuggestions, nextTags);
                  if (!canonical) continue;
                  nextTags.push(canonical);
                }
                return { ...prev, tags: nextTags };
              })()
            : prev,
        );
      }

      setTagInput("");
      setTagSuggestions([]);
      setActiveTagIndex(-1);
    },
    [tagInput, tagSuggestions],
  );

  const weaponById = useMemo(() => {
    const map: Record<string, WeaponProjection> = {};
    for (const weapon of weapons) {
      map[weapon.id] = weapon;
    }
    return map;
  }, [weapons]);
  const traitById = useMemo(() => {
    const map: Record<string, MonsterTraitDefinitionSummary> = {};
    for (const trait of traitDefinitions) {
      map[trait.id] = trait;
    }
    return map;
  }, [traitDefinitions]);
  const selectedTraitAxisBonuses = useMemo(
    () =>
      computeTraitAxisBonuses(
        (editor?.traits ?? [])
          .map((trait) => traitById[trait.traitDefinitionId])
          .filter((trait): trait is MonsterTraitDefinitionSummary => Boolean(trait))
          .map(
            (trait): TraitAxisWeightDefinition => ({
              band: trait.band,
              physicalThreatWeight: trait.physicalThreatWeight,
              mentalThreatWeight: trait.mentalThreatWeight,
              survivabilityWeight: trait.survivabilityWeight,
              manipulationWeight: trait.manipulationWeight,
              synergyWeight: trait.synergyWeight,
              mobilityWeight: trait.mobilityWeight,
              presenceWeight: trait.presenceWeight,
            }),
          ),
        editor?.level ?? 1,
      ),
    [editor?.level, editor?.traits, traitById],
  );

  useEffect(() => {
    setEditor((prev) => {
      if (!prev) return prev;

      const next = { ...prev };
      let changed = false;

      const main = next.mainHandItemId ? weaponById[next.mainHandItemId] ?? null : null;
      if (isTwoHanded(main) && next.offHandItemId) {
        next.offHandItemId = null;
        changed = true;
      }

      const handSlots: Array<"mainHandItemId" | "offHandItemId" | "smallItemId"> = [
        "mainHandItemId",
        "offHandItemId",
        "smallItemId",
      ];
      for (const slot of handSlots) {
        const itemId = next[slot];
        if (!itemId) continue;
        const item = weaponById[itemId] ?? null;
        if (!item || !isValidHandItemForSlot(slot, item) || (slot === "offHandItemId" && isTwoHanded(main))) {
          next[slot] = null;
          changed = true;
        }
      }

      const armorSlots: Array<
        "headArmorItemId" | "shoulderArmorItemId" | "torsoArmorItemId" | "legsArmorItemId" | "feetArmorItemId"
      > = [
        "headArmorItemId",
        "shoulderArmorItemId",
        "torsoArmorItemId",
        "legsArmorItemId",
        "feetArmorItemId",
      ];
      for (const slot of armorSlots) {
        const itemId = next[slot];
        if (!itemId) continue;
        const item = weaponById[itemId] ?? null;
        if (!item || !isValidArmorItemForSlot(slot, item)) {
          next[slot] = null;
          changed = true;
        }
      }

      const itemSlots: Array<"headItemId" | "neckItemId" | "armsItemId" | "beltItemId"> = [
        "headItemId",
        "neckItemId",
        "armsItemId",
        "beltItemId",
      ];
      for (const slot of itemSlots) {
        const itemId = next[slot];
        if (!itemId) continue;
        const item = weaponById[itemId] ?? null;
        if (!item || !isValidItemAccessorySlot(slot, item)) {
          next[slot] = null;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [weaponById]);

  const equippedItems = useMemo(() => {
    if (!editor) return [] as Array<SummoningEquipmentItem | null>;
    return [
      editor.mainHandItemId ? weaponById[editor.mainHandItemId] ?? null : null,
      editor.offHandItemId ? weaponById[editor.offHandItemId] ?? null : null,
      editor.smallItemId ? weaponById[editor.smallItemId] ?? null : null,
      editor.headArmorItemId ? weaponById[editor.headArmorItemId] ?? null : null,
      editor.shoulderArmorItemId ? weaponById[editor.shoulderArmorItemId] ?? null : null,
      editor.torsoArmorItemId ? weaponById[editor.torsoArmorItemId] ?? null : null,
      editor.legsArmorItemId ? weaponById[editor.legsArmorItemId] ?? null : null,
      editor.feetArmorItemId ? weaponById[editor.feetArmorItemId] ?? null : null,
      editor.headItemId ? weaponById[editor.headItemId] ?? null : null,
      editor.neckItemId ? weaponById[editor.neckItemId] ?? null : null,
      editor.armsItemId ? weaponById[editor.armsItemId] ?? null : null,
      editor.beltItemId ? weaponById[editor.beltItemId] ?? null : null,
    ];
  }, [editor, weaponById]);

  const itemModifierValues = useMemo(() => getHighestItemModifiers(equippedItems), [equippedItems]);
  const itemProtectionValues = useMemo(
    () => getProtectionTotalsFromItems(equippedItems),
    [equippedItems],
  );
  const naturalPhysicalProtectionValue = useMemo(
    () => Math.max(0, Math.min(30, Number(editor?.naturalPhysicalProtection ?? 0) || 0)),
    [editor?.naturalPhysicalProtection],
  );
  const naturalMentalProtectionValue = useMemo(
    () => Math.max(0, Math.min(30, Number(editor?.naturalMentalProtection ?? 0) || 0)),
    [editor?.naturalMentalProtection],
  );
  const totalPhysicalProtection = useMemo(
    () => naturalPhysicalProtectionValue + itemProtectionValues.physicalProtection,
    [naturalPhysicalProtectionValue, itemProtectionValues.physicalProtection],
  );
  const totalMentalProtection = useMemo(
    () => naturalMentalProtectionValue + itemProtectionValues.mentalProtection,
    [naturalMentalProtectionValue, itemProtectionValues.mentalProtection],
  );
  const computedWeaponSkillValue = useMemo(
    () =>
      Math.max(
        1,
        baseWeaponSkillValue +
          Math.max(0, Math.trunc(itemModifierValues.weaponSkillModifier ?? 0)),
      ),
    [baseWeaponSkillValue, itemModifierValues.weaponSkillModifier],
  );
  const computedArmorSkillValue = useMemo(
    () =>
      Math.max(
        1,
        baseArmorSkillValue +
          Math.max(0, Math.trunc(itemModifierValues.armorSkillModifier ?? 0)),
      ),
    [baseArmorSkillValue, itemModifierValues.armorSkillModifier],
  );
  const protectionTuning = useProtectionTuning();
  const dodgeValue = useMemo(
    () =>
      Math.max(
        0,
        editor
          ? getDodgeValue(
              editor.defenceDie,
              editor.intellectDie,
              editor.level,
              totalPhysicalProtection,
            )
          : 0,
      ),
    [
      editor?.defenceDie,
      editor?.intellectDie,
      editor?.level,
      totalPhysicalProtection,
    ],
  );
  const willpowerValue = useMemo(
    () =>
      editor
        ? Math.max(
            1,
            getWillpowerDiceCountFromAttributes(editor.supportDie, editor.braveryDie) +
              Math.max(0, Math.trunc(itemModifierValues.willpowerModifier ?? 0)),
          )
        : 0,
    [editor?.supportDie, editor?.braveryDie, itemModifierValues.willpowerModifier],
  );
  const dodgeDice = useMemo(
    () =>
      Math.max(
        0,
        Math.ceil(dodgeValue / 6) + Math.max(0, Math.trunc(itemModifierValues.dodgeModifier ?? 0)),
      ),
    [dodgeValue, itemModifierValues.dodgeModifier],
  );
  const armorSkillForDefenceCalc = Math.max(1, computedArmorSkillValue);
  const physicalBlockPerSuccess = useMemo(
    () => {
      // PROTECTION_BLOCK_FORMULA_V2
      if (totalPhysicalProtection <= 0) return 0;
      return Math.ceil(
        (totalPhysicalProtection / protectionTuning.protectionK) *
          (1 + armorSkillForDefenceCalc / protectionTuning.protectionS),
      );
    },
    [
      totalPhysicalProtection,
      armorSkillForDefenceCalc,
      protectionTuning.protectionK,
      protectionTuning.protectionS,
    ],
  );
  const willpowerDice = Math.max(0, willpowerValue);
  const willpowerForDefenceCalc = Math.max(1, willpowerValue);
  const mentalBlockPerSuccess = useMemo(
    () => {
      if (totalMentalProtection <= 0) return 0;
      return Math.ceil(
        (totalMentalProtection / protectionTuning.protectionK) *
          (1 + willpowerForDefenceCalc / protectionTuning.protectionS),
      );
    },
    [
      totalMentalProtection,
      willpowerForDefenceCalc,
      protectionTuning.protectionK,
      protectionTuning.protectionS,
    ],
  );
  const traitRenderContext = useMemo(
    () =>
      buildMonsterTraitRenderContext({
        monster: editor,
        weaponSkillValue: computedWeaponSkillValue,
        armorSkillValue: computedArmorSkillValue,
        willpowerValue,
        dodgeValue,
      }),
    [
      editor,
      computedWeaponSkillValue,
      computedArmorSkillValue,
      willpowerValue,
      dodgeValue,
    ],
  );
  const renderTraitEffectText = useCallback(
    (rawEffect: string | null | undefined) =>
      renderTraitTemplate(rawEffect?.trim() || "No description", traitRenderContext),
    [traitRenderContext],
  );
  const defenceStrings = useMemo(
    () => [
      `Dodge: Roll ${dodgeDice} dice. If successes exceed the attacker's successes, take 0 damage. Otherwise take full damage.`,
      `Physical Protection: Roll ${computedArmorSkillValue} dice, block ${physicalBlockPerSuccess} wounds per success.`,
      `Mental Protection: Roll ${willpowerDice} dice, block ${mentalBlockPerSuccess} wounds per success.`,
    ],
    [
      computedArmorSkillValue,
      dodgeDice,
      mentalBlockPerSuccess,
      physicalBlockPerSuccess,
      willpowerDice,
    ],
  );

  const equippedWeaponAttackPreview = useMemo(() => {
    if (!editor) return [] as Array<{ label: string; lines: string[] }>;
    const slotItems: Array<{ label: string; id: string | null }> = [
      { label: "Main Hand", id: editor.mainHandItemId },
      { label: "Off Hand", id: editor.offHandItemId },
      { label: "Small Slot", id: editor.smallItemId },
    ];

    const rows: Array<{ label: string; lines: string[] }> = [];

    for (const slot of slotItems) {
      if (!slot.id) continue;
      const item = weaponById[slot.id];
      // SC_LEVEL_WOUND_SCALER_WIRING
      const lines = getWeaponSourceAttackLines(item, computedWeaponSkillValue, editor.level);
      if (lines.length === 0) continue;
      rows.push({ label: `${slot.label}: ${item?.name ?? "(Referenced item missing)"}`, lines });
    }

    return rows;
  }, [
    editor?.mainHandItemId,
    editor?.offHandItemId,
    editor?.smallItemId,
    editor?.level,
    computedWeaponSkillValue,
    weaponById,
  ]);
  const naturalAttackPreviewLines = useMemo(() => {
    if (!editor) return [] as string[][];
    return editor.attacks.map((attack) =>
      renderAttackActionLines(
        (attack.attackConfig ?? defaultNaturalConfig()) as MonsterNaturalAttackConfig,
        computedWeaponSkillValue,
        { applyWeaponSkillOverride: true, strengthMultiplier: 2, level: editor.level },
      ),
    );
  }, [editor?.attacks, editor?.level, computedWeaponSkillValue]);

  const weaponAttackStringCount = equippedWeaponAttackPreview.reduce(
    (total, row) => total + row.lines.length,
    0,
  );
  const equippedWeaponSourceCount = equippedWeaponAttackPreview.length;
  const naturalWeaponSourceCount = editor?.attacks.length ?? 0;
  const totalWeaponSources = equippedWeaponSourceCount + naturalWeaponSourceCount;
  const naturalAttacksLocked = totalWeaponSources >= 3;
  const naturalSourceCapHint =
    "Natural weapons are disabled because this monster already has 3 weapon sources (equipped + natural). Unequip a weapon or remove a natural weapon to add another.";
  const equipBlockedHint =
    "Cannot equip this weapon: this monster already has 3 weapon sources (equipped + natural). Remove a natural weapon or unequip a weapon to equip another.";
  const mainHandItem = editor?.mainHandItemId ? weaponById[editor.mainHandItemId] ?? null : null;
  const offHandDisabled = isTwoHanded(mainHandItem);
  const countEquippedWeaponSourcesForState = useCallback(
    (
      state: Pick<
        EditableMonster,
        "mainHandItemId" | "offHandItemId" | "smallItemId" | "attackDie" | "braveryDie" | "level"
      >,
    ) => {
      const slotIds = [state.mainHandItemId, state.offHandItemId, state.smallItemId];
      const weaponSkillValue = getWeaponSkillDiceCountFromAttributes(
        state.attackDie,
        state.braveryDie,
      );
      let count = 0;
      for (const itemId of slotIds) {
        if (!itemId) continue;
        const lines = getWeaponSourceAttackLines(weaponById[itemId] ?? null, weaponSkillValue, state.level);
        if (lines.length > 0) count += 1;
      }
      return count;
    },
    [weaponById],
  );
  useEffect(() => {
    if (totalWeaponSources < 3) {
      setEquipmentCapHint(null);
      setEquipmentCapHintSlot(null);
    }
  }, [totalWeaponSources]);
  const previewMonster = useMemo(
    () => {
      if (!editor) return null;
      const primaryAttack = editor.attacks[0] ?? null;
      return {
        ...editor,
        physicalResilienceMax: resilienceValues.physicalResilienceMax,
        physicalResilienceCurrent: resilienceValues.physicalResilienceMax,
        mentalPerseveranceMax: resilienceValues.mentalPerseveranceMax,
        mentalPerseveranceCurrent: resilienceValues.mentalPerseveranceMax,
        physicalProtection: totalPhysicalProtection,
        mentalProtection: totalMentalProtection,
        naturalPhysicalProtection: naturalPhysicalProtectionValue,
        naturalMentalProtection: naturalMentalProtectionValue,
        attackModifier: itemModifierValues.attackModifier,
        defenceModifier: itemModifierValues.defenceModifier,
        fortitudeModifier: itemModifierValues.fortitudeModifier,
        intellectModifier: itemModifierValues.intellectModifier,
        supportModifier: itemModifierValues.supportModifier,
        braveryModifier: itemModifierValues.braveryModifier,
        weaponSkillModifier: itemModifierValues.weaponSkillModifier,
        armorSkillModifier: itemModifierValues.armorSkillModifier,
        weaponSkillValue: computedWeaponSkillValue,
        armorSkillValue: computedArmorSkillValue,
        attacks: editor.attacks,
        naturalAttack: primaryAttack
          ? {
              attackName: primaryAttack.attackName ?? "Natural Weapon",
              attackConfig: primaryAttack.attackConfig ?? defaultNaturalConfig(),
            }
          : null,
      };
    },
    [
      computedArmorSkillValue,
      computedWeaponSkillValue,
      editor,
      itemModifierValues,
      naturalMentalProtectionValue,
      naturalPhysicalProtectionValue,
      resilienceValues,
      totalMentalProtection,
      totalPhysicalProtection,
    ],
  );
  const equippedWeaponSources = useMemo(() => {
    if (!previewMonster) return [] as WeaponAttackSource[];
    const slotIds = [
      { slot: "Main Hand", id: previewMonster.mainHandItemId ?? null },
      { slot: "Off Hand", id: previewMonster.offHandItemId ?? null },
      { slot: "Small Slot", id: previewMonster.smallItemId ?? null },
    ];

    const out: WeaponAttackSource[] = [];
    for (const slot of slotIds) {
      if (!slot.id) continue;
      const item = weaponById[slot.id];
      if (!item) continue;
      if (item.type !== "WEAPON" && item.type !== "SHIELD") continue;

      out.push({
        id: item.id,
        label: `${slot.slot}: ${item.name}`,
        attackConfig: {
          melee: item.melee,
          ranged: item.ranged,
          aoe: item.aoe,
        },
      });
    }
    return out;
  }, [
    previewMonster?.mainHandItemId,
    previewMonster?.offHandItemId,
    previewMonster?.smallItemId,
    weaponById,
  ]);
  const selectedNaturalAttackGsAxisBonuses = useMemo(() => {
    if (!previewMonster) return createEmptyAxisBonuses();

    const level = Math.max(1, Math.trunc(previewMonster.level || 1));
    const tierMultiplier = getCalculatorTierMultiplier(previewMonster);
    const axisBudgetTargets: RadarAxes = {
      physicalThreat: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.physicalThreat, level),
        tierMultiplier,
      ),
      mentalThreat: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.mentalThreat, level),
        tierMultiplier,
      ),
      survivability: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.survivability, level),
        tierMultiplier,
      ),
      manipulation: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.manipulation, level),
        tierMultiplier,
      ),
      synergy: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.synergy, level),
        tierMultiplier,
      ),
      mobility: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.mobility, level),
        tierMultiplier,
      ),
      presence: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.presence, level),
        tierMultiplier,
      ),
    };
    const bonuses = createEmptyAxisBonuses();

    for (const attack of previewMonster.attacks ?? []) {
      const attackConfig = attack.attackConfig ?? defaultNaturalConfig();
      for (const range of ["melee", "ranged", "aoe"] as const) {
        const rangeConfig = attackConfig[range];
        if (!rangeConfig?.enabled) continue;
        for (const effectName of rangeConfig.attackEffects ?? []) {
          addNaturalAttackGsEffectAxisBonus(bonuses, effectName, axisBudgetTargets);
        }
      }
    }

    return bonuses;
  }, [previewMonster]);
  const selectedEquipmentModifierAxisBonuses = useMemo(() => {
    if (!previewMonster) return createEmptyAxisBonuses();

    const level = Math.max(1, Math.trunc(previewMonster.level || 1));
    const tierMultiplier = getCalculatorTierMultiplier(previewMonster);
    const axisBudgetTargets: RadarAxes = {
      physicalThreat: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.physicalThreat, level),
        tierMultiplier,
      ),
      mentalThreat: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.mentalThreat, level),
        tierMultiplier,
      ),
      survivability: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.survivability, level),
        tierMultiplier,
      ),
      manipulation: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.manipulation, level),
        tierMultiplier,
      ),
      synergy: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.synergy, level),
        tierMultiplier,
      ),
      mobility: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.mobility, level),
        tierMultiplier,
      ),
      presence: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.presence, level),
        tierMultiplier,
      ),
    };
    const pressureMultiplier = getEquipmentModifierPressureMultiplier(level, previewMonster);
    const bonuses = createEmptyAxisBonuses();

    for (const { field, axis } of EQUIPMENT_MODIFIER_AXIS_FIELDS) {
      const modifierValue = Math.max(0, Math.trunc(itemModifierValues[field] ?? 0));
      const budgetShare = getEquipmentModifierBudgetShare(modifierValue);
      if (!(budgetShare > 0)) continue;
      bonuses[axis] += axisBudgetTargets[axis] * budgetShare * pressureMultiplier;
    }

    const lineCounts = getItemLinePlacementCounts(equippedItems);

    const attackThreatShare = getCappedEquipmentLineShare(
      lineCounts.ATTACK,
      EQUIPMENT_LINE_ATTACK_THREAT_SHARE_PER_LINE,
      EQUIPMENT_LINE_ATTACK_THREAT_CAP_SHARE,
    );
    const attackPresenceShare = getCappedEquipmentLineShare(
      lineCounts.ATTACK,
      EQUIPMENT_LINE_ATTACK_PRESENCE_SHARE_PER_LINE,
      EQUIPMENT_LINE_ATTACK_PRESENCE_CAP_SHARE,
    );
    const defenceSurvivabilityShare = getCappedEquipmentLineShare(
      lineCounts.DEFENCE,
      EQUIPMENT_LINE_DEFENCE_SURVIVABILITY_SHARE_PER_LINE,
      EQUIPMENT_LINE_DEFENCE_SURVIVABILITY_CAP_SHARE,
    );
    const traitsSynergyShare = getCappedEquipmentLineShare(
      lineCounts.TRAITS,
      EQUIPMENT_LINE_TRAITS_SYNERGY_SHARE_PER_LINE,
      EQUIPMENT_LINE_TRAITS_SYNERGY_CAP_SHARE,
    );
    const traitsPresenceShare = getCappedEquipmentLineShare(
      lineCounts.TRAITS,
      EQUIPMENT_LINE_TRAITS_PRESENCE_SHARE_PER_LINE,
      EQUIPMENT_LINE_TRAITS_PRESENCE_CAP_SHARE,
    );
    const generalSynergyShare = getCappedEquipmentLineShare(
      lineCounts.GENERAL,
      EQUIPMENT_LINE_GENERAL_SYNERGY_SHARE_PER_LINE,
      EQUIPMENT_LINE_GENERAL_SYNERGY_CAP_SHARE,
    );
    const generalPresenceShare = getCappedEquipmentLineShare(
      lineCounts.GENERAL,
      EQUIPMENT_LINE_GENERAL_PRESENCE_SHARE_PER_LINE,
      EQUIPMENT_LINE_GENERAL_PRESENCE_CAP_SHARE,
    );

    bonuses.physicalThreat += axisBudgetTargets.physicalThreat * attackThreatShare;
    bonuses.presence += axisBudgetTargets.presence * attackPresenceShare;
    bonuses.survivability += axisBudgetTargets.survivability * defenceSurvivabilityShare;
    bonuses.synergy += axisBudgetTargets.synergy * traitsSynergyShare;
    bonuses.presence += axisBudgetTargets.presence * traitsPresenceShare;
    bonuses.synergy += axisBudgetTargets.synergy * generalSynergyShare;
    bonuses.presence += axisBudgetTargets.presence * generalPresenceShare;

    const expectedIncomingAttackDice = getExpectedIncomingAttackDiceForDodge(
      previewMonster.level,
      previewMonster.tier,
    );

    const baselineDodgeShare = getSmoothDodgeShare(
      dodgeDice,
      DODGE_BASELINE_SCALE,
      DODGE_BASELINE_MAX_SHARE,
    );

    const dodgeParityProgress = getDodgeParityProgress(
      dodgeDice,
      expectedIncomingAttackDice,
    );

    const parityDodgeShare = getSmoothDodgeShare(
      dodgeParityProgress,
      DODGE_PARITY_SCALE,
      DODGE_PARITY_MAX_SHARE,
    );

    const dodgeAboveExpectedDice = Math.max(0, dodgeDice - expectedIncomingAttackDice);
    const aboveExpectedDodgeShare = getSmoothDodgeShare(
      dodgeAboveExpectedDice,
      DODGE_ABOVE_EXPECTED_SCALE,
      DODGE_ABOVE_EXPECTED_MAX_SHARE,
    );

    const totalDodgeShare = Math.min(
      DODGE_TOTAL_MAX_SHARE,
      baselineDodgeShare + parityDodgeShare + aboveExpectedDodgeShare,
    );

    const physicalDefencePotential = computedArmorSkillValue * physicalBlockPerSuccess;
    const physicalDefenceSurvivabilityShare = getSmoothDefenceShare(
      physicalDefencePotential,
      DEFENCE_STRING_PROTECTION_OUTPUT_SCALE,
      DEFENCE_STRING_PROTECTION_OUTPUT_MAX_SHARE,
    );

    const mentalDefencePotential = willpowerDice * mentalBlockPerSuccess;
    const mentalDefenceSurvivabilityShare = getSmoothDefenceShare(
      mentalDefencePotential,
      DEFENCE_STRING_PROTECTION_OUTPUT_SCALE,
      DEFENCE_STRING_PROTECTION_OUTPUT_MAX_SHARE,
    );

    bonuses.survivability +=
      axisBudgetTargets.survivability *
      (totalDodgeShare +
        physicalDefenceSurvivabilityShare +
        mentalDefenceSurvivabilityShare);

    return bonuses;
  }, [
    equippedItems,
    itemModifierValues,
    previewMonster,
    dodgeDice,
    computedArmorSkillValue,
    physicalBlockPerSuccess,
    willpowerDice,
    mentalBlockPerSuccess,
  ]);
  const selectedNaturalAttackRangeAxisBonuses = useMemo(() => {
    if (!previewMonster) return createEmptyAxisBonuses();

    const level = Math.max(1, Math.trunc(previewMonster.level || 1));
    const tierMultiplier = getCalculatorTierMultiplier(previewMonster);
    const axisBudgetTargets: RadarAxes = {
      physicalThreat: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.physicalThreat, level),
        tierMultiplier,
      ),
      mentalThreat: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.mentalThreat, level),
        tierMultiplier,
      ),
      survivability: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.survivability, level),
        tierMultiplier,
      ),
      manipulation: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.manipulation, level),
        tierMultiplier,
      ),
      synergy: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.synergy, level),
        tierMultiplier,
      ),
      mobility: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.mobility, level),
        tierMultiplier,
      ),
      presence: getTierAdjustedAxisBudgetTarget(
        getCurvePointForLevel(calculatorConfig.scoringCurves.presence, level),
        tierMultiplier,
      ),
    };
    const bonuses = createEmptyAxisBonuses();

    for (const attack of previewMonster.attacks ?? []) {
      addNaturalAttackRangeAxisBonus(
        bonuses,
        (attack.attackConfig ?? defaultNaturalConfig()) as MonsterNaturalAttackConfig,
        axisBudgetTargets,
      );
    }

    bonuses.mobility = Math.min(
      bonuses.mobility,
      axisBudgetTargets.mobility * NATURAL_ATTACK_RANGE_MOBILITY_CAP_SHARE,
    );
    bonuses.presence = Math.min(
      bonuses.presence,
      axisBudgetTargets.presence * NATURAL_ATTACK_RANGE_PRESENCE_CAP_SHARE,
    );
    bonuses.physicalThreat = Math.min(
      bonuses.physicalThreat,
      axisBudgetTargets.physicalThreat * NATURAL_ATTACK_RANGE_PHYSICAL_THREAT_CAP_SHARE,
    );
    bonuses.mentalThreat = Math.min(
      bonuses.mentalThreat,
      axisBudgetTargets.mentalThreat * NATURAL_ATTACK_RANGE_MENTAL_THREAT_CAP_SHARE,
    );

    return bonuses;
  }, [previewMonster]);
  const outcomeProfile = useMemo(
    () =>
      previewMonster
        ? computeMonsterOutcomes(previewMonster, calculatorConfig, {
            equippedWeaponSources,
            equipmentModifierAxisBonuses: selectedEquipmentModifierAxisBonuses,
            naturalAttackGsAxisBonuses: selectedNaturalAttackGsAxisBonuses,
            naturalAttackRangeAxisBonuses: selectedNaturalAttackRangeAxisBonuses,
            traitAxisBonuses: selectedTraitAxisBonuses,
          })
        : null,
    [
      equippedWeaponSources,
      previewMonster,
      selectedEquipmentModifierAxisBonuses,
      selectedNaturalAttackGsAxisBonuses,
      selectedNaturalAttackRangeAxisBonuses,
      selectedTraitAxisBonuses,
    ],
  );

  const saveMonster = useCallback(async () => {
    if (!editor || readOnly) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const normalizedTags = [...editor.tags];
      for (const part of listFromCsv(tagInput)) {
        const canonical = canonicalizeTag(part, tagSuggestions, normalizedTags);
        if (!canonical) continue;
        normalizedTags.push(canonical);
      }
      const normalizedEditor: EditableMonster = {
        ...editor,
        imageUrl: asNullableText(editor.imageUrl),
        imagePosX: clampImagePosition(editor.imagePosX, DEFAULT_IMAGE_POS_X),
        imagePosY: clampImagePosition(editor.imagePosY, DEFAULT_IMAGE_POS_Y),
        tags: normalizedTags,
        physicalResilienceMax: resilienceValues.physicalResilienceMax,
        physicalResilienceCurrent: resilienceValues.physicalResilienceMax,
        mentalPerseveranceMax: resilienceValues.mentalPerseveranceMax,
        mentalPerseveranceCurrent: resilienceValues.mentalPerseveranceMax,
        physicalProtection: totalPhysicalProtection,
        mentalProtection: totalMentalProtection,
        naturalPhysicalProtection: naturalPhysicalProtectionValue,
        naturalMentalProtection: naturalMentalProtectionValue,
        attackModifier: itemModifierValues.attackModifier,
        defenceModifier: itemModifierValues.defenceModifier,
        fortitudeModifier: itemModifierValues.fortitudeModifier,
        intellectModifier: itemModifierValues.intellectModifier,
        supportModifier: itemModifierValues.supportModifier,
        braveryModifier: itemModifierValues.braveryModifier,
        weaponSkillModifier: itemModifierValues.weaponSkillModifier,
        armorSkillModifier: itemModifierValues.armorSkillModifier,
        weaponSkillValue: computedWeaponSkillValue,
        armorSkillValue: computedArmorSkillValue,
        mainHandItemId: asNullableId(editor.mainHandItemId),
        offHandItemId: asNullableId(editor.offHandItemId),
        smallItemId: asNullableId(editor.smallItemId),
        headArmorItemId: asNullableId(editor.headArmorItemId),
        shoulderArmorItemId: asNullableId(editor.shoulderArmorItemId),
        torsoArmorItemId: asNullableId(editor.torsoArmorItemId),
        legsArmorItemId: asNullableId(editor.legsArmorItemId),
        feetArmorItemId: asNullableId(editor.feetArmorItemId),
        headItemId: asNullableId(editor.headItemId),
        neckItemId: asNullableId(editor.neckItemId),
        armsItemId: asNullableId(editor.armsItemId),
        beltItemId: asNullableId(editor.beltItemId),
        attacks: editor.attacks.map((attack, index) => ({ ...attack, sortOrder: index })),
      };
      const isUpdate = !!editor.id;
      const res = await fetch(
        isUpdate
          ? `/api/summoning-circle/monsters/${editor.id}?campaignId=${encodeURIComponent(campaignId)}`
          : `/api/summoning-circle/monsters?campaignId=${encodeURIComponent(campaignId)}`,
        {
          method: isUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(normalizedEditor)),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      hasDraftRef.current = false;
      setTagInput("");
      setTagSuggestions([]);
      setActiveTagIndex(-1);
      await refreshSummaries();
      setSelectedId(String(json.id));
      await refreshSelected(String(json.id));
      setSuccess("Monster saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }, [
    campaignId,
    editor,
    readOnly,
    refreshSelected,
    refreshSummaries,
    resilienceValues,
    naturalMentalProtectionValue,
    naturalPhysicalProtectionValue,
    totalMentalProtection,
    totalPhysicalProtection,
    itemModifierValues,
    computedWeaponSkillValue,
    computedArmorSkillValue,
    tagInput,
    tagSuggestions,
  ]);

  const deleteMonster = useCallback(async () => {
    if (!editor?.id || readOnly) return;
    if (!window.confirm("Delete this monster?")) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/summoning-circle/monsters/${editor.id}?campaignId=${encodeURIComponent(campaignId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(await res.text());
      hasDraftRef.current = false;
      setEditor(null);
      setSelectedId(null);
      await refreshSummaries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }, [campaignId, editor?.id, readOnly, refreshSummaries]);

  const copyMonster = useCallback(async () => {
    if (!editor?.id) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/summoning-circle/monsters/${editor.id}/copy?campaignId=${encodeURIComponent(campaignId)}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      hasDraftRef.current = false;
      await refreshSummaries();
      setSelectedId(String(json.id));
      setSuccess("Monster copied.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to copy");
    } finally {
      setBusy(false);
    }
  }, [campaignId, editor?.id, refreshSummaries]);

  const newMonster = useCallback(() => {
    hasDraftRef.current = true;
    setSuccess(null);
    setMonsterPickerOpen(false);
    setMonsterPickerQuery("");
    setSelectedId(null);
    setEditor(defaultMonster());
  }, []);

  const moveAttack = useCallback((fromIndex: number, toIndex: number) => {
    setEditor((prev) => {
      if (!prev) return prev;
      if (toIndex < 0 || toIndex >= prev.attacks.length) return prev;

      const next = [...prev.attacks];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);

      return {
        ...prev,
        attacks: next.map((attack, index) => ({ ...attack, sortOrder: index })),
      };
    });
  }, []);

  const updateAttackRange = useCallback(
    (attackIndex: number, range: "melee" | "ranged" | "aoe", patch: Record<string, unknown>) => {
      setEditor((prev) => {
        if (!prev) return prev;
        const currentAttack = prev.attacks[attackIndex];
        if (!currentAttack) return prev;
        const currentConfig = currentAttack.attackConfig ?? defaultNaturalConfig();
        const currentRange = (currentConfig as Record<string, unknown>)[range] ?? {};
        return {
          ...prev,
          attacks: prev.attacks.map((attack, index) =>
            index === attackIndex
              ? {
                  ...attack,
                  attackConfig: {
                    ...currentConfig,
                    [range]: { ...currentRange, ...patch },
                  },
                }
              : attack,
          ),
        };
      });
    },
    [],
  );

  const getSelectedDamageTypeIds = useCallback(
    (
      cfg: { damageTypes?: Array<{ name: string; mode: "PHYSICAL" | "MENTAL" }> } | undefined,
    ): number[] => {
      if (!cfg?.damageTypes || cfg.damageTypes.length === 0) return [];
      const idByName = new Map(
        picklists.damageTypes.map((dt) => [dt.name.trim().toLowerCase(), dt.id] as const),
      );
      const ids: number[] = [];
      for (const row of cfg.damageTypes) {
        const id = idByName.get(String(row?.name ?? "").trim().toLowerCase());
        if (typeof id === "number" && !ids.includes(id)) ids.push(id);
      }
      return ids;
    },
    [picklists.damageTypes],
  );

  const getSelectedAttackEffectIds = useCallback(
    (cfg: { attackEffects?: string[] } | undefined): number[] => {
      if (!cfg?.attackEffects || cfg.attackEffects.length === 0) return [];
      const idByName = new Map(
        picklists.attackEffects.map((fx) => [fx.name.trim().toLowerCase(), fx.id] as const),
      );
      const ids: number[] = [];
      for (const name of cfg.attackEffects) {
        const id = idByName.get(String(name ?? "").trim().toLowerCase());
        if (typeof id === "number" && !ids.includes(id)) ids.push(id);
      }
      return ids;
    },
    [picklists.attackEffects],
  );

  const setAttackDamageTypeIds = useCallback(
    (attackIndex: number, range: "melee" | "ranged" | "aoe", selectedIds: number[]) => {
      const selected = selectedIds
        .map((id) => picklists.damageTypes.find((dt) => dt.id === id))
        .filter((dt): dt is Picklists["damageTypes"][number] => Boolean(dt));
      updateAttackRange(attackIndex, range, {
        damageTypes: selected.map((dt) => ({
          name: dt.name,
          mode: getAttackModeKey(dt.attackMode),
        })),
      });
    },
    [picklists.damageTypes, updateAttackRange],
  );

  const setAttackEffectIds = useCallback(
    (attackIndex: number, range: "melee" | "ranged" | "aoe", selectedIds: number[]) => {
      const selected = selectedIds
        .map((id) => picklists.attackEffects.find((fx) => fx.id === id))
        .filter((fx): fx is Picklists["attackEffects"][number] => Boolean(fx));
      updateAttackRange(attackIndex, range, {
        attackEffects: selected.map((fx) => fx.name),
      });
    },
    [picklists.attackEffects, updateAttackRange],
  );

  const toggleNumberArrayField = useCallback(
    (
      attackIndex: number,
      fieldName: NaturalAttackDamageField | NaturalAttackEffectField,
      id: number,
      selectedIds: number[],
    ) => {
      const nextIds = selectedIds.includes(id)
        ? selectedIds.filter((entry) => entry !== id)
        : [...selectedIds, id];

      if (fieldName in NATURAL_DAMAGE_FIELD_TO_RANGE) {
        const range = NATURAL_DAMAGE_FIELD_TO_RANGE[fieldName as NaturalAttackDamageField];
        setAttackDamageTypeIds(attackIndex, range, nextIds);
        return;
      }

      const range = NATURAL_EFFECT_FIELD_TO_RANGE[fieldName as NaturalAttackEffectField];
      setAttackEffectIds(attackIndex, range, nextIds);
    },
    [setAttackDamageTypeIds, setAttackEffectIds],
  );

  const renderDamageTypeChips = useCallback(
    (
      attackIndex: number,
      types: Picklists["damageTypes"],
      selectedIds: number[],
      fieldName: NaturalAttackDamageField,
      allowedModes: Set<"PHYSICAL" | "MENTAL">,
    ) => {
      return (
        <div className="flex flex-wrap gap-2">
          {types.map((dt) => {
            const mode = getAttackModeKey(dt.attackMode);
            const isAllowed = allowedModes.has(mode);
            return (
              <button
                key={dt.id}
                type="button"
                disabled={readOnly || !isAllowed}
                onClick={() => toggleNumberArrayField(attackIndex, fieldName, dt.id, selectedIds)}
                className={[
                  "px-2 py-1 rounded-full border text-xs",
                  selectedIds.includes(dt.id)
                    ? "border-emerald-500 bg-emerald-600/20 text-emerald-200"
                    : "border-zinc-700 bg-zinc-900 text-zinc-200",
                  isAllowed ? "hover:border-zinc-500" : "opacity-40 cursor-not-allowed",
                ].join(" ")}
              >
                {dt.name}
              </button>
            );
          })}
        </div>
      );
    },
    [readOnly, toggleNumberArrayField],
  );

  const renderAttackEffectChips = useCallback(
    (
      attackIndex: number,
      effects: Picklists["attackEffects"],
      selectedIds: number[],
      fieldName: NaturalAttackEffectField,
    ) => {
      return (
        <div className="flex flex-wrap gap-2">
          {effects.map((fx) => (
            <button
              key={fx.id}
              type="button"
              disabled={readOnly}
              title={fx.tooltip?.trim() || fx.name}
              onClick={() => toggleNumberArrayField(attackIndex, fieldName, fx.id, selectedIds)}
              className={`px-2 py-1 rounded-full border text-xs ${
                selectedIds.includes(fx.id)
                  ? "border-emerald-500 bg-emerald-600/20 text-emerald-200"
                  : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500"
              }`}
            >
              {fx.name}
            </button>
          ))}
        </div>
      );
    },
    [readOnly, toggleNumberArrayField],
  );

  const renderRangePills = useCallback(
    (
      label: string,
      values: number[],
      value: number | null | undefined,
      onChange: (v: number) => void,
    ) => (
      <div className="space-y-2">
        <div className="text-[11px] text-zinc-400">{label}</div>
        <div className="flex flex-wrap gap-2">
          {values.map((v) => (
            <button
              key={v}
              type="button"
              disabled={readOnly}
              onClick={() => onChange(v)}
              className={[
                "px-3 py-1 rounded-full border text-xs",
                value === v
                  ? "border-emerald-500 bg-emerald-600/20 text-emerald-200"
                  : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500",
              ].join(" ")}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    ),
    [readOnly],
  );

  useEffect(() => {
    setEditor((prev) => {
      if (!prev) return prev;
      let changedAny = false;

      const nextAttacks = prev.attacks.map((attack) => {
        const config = attack.attackConfig ?? defaultNaturalConfig();
        const defaults = defaultNaturalConfig();
        const defaultMelee = defaults.melee!;
        const defaultRanged = defaults.ranged!;
        const defaultAoe = defaults.aoe!;
        let changedAttack = false;
        const nextConfig: MonsterNaturalAttackConfig = {
          ...defaults,
          ...config,
          melee: {
            enabled: config.melee?.enabled ?? defaultMelee.enabled,
            targets: config.melee?.targets ?? defaultMelee.targets,
            physicalStrength:
              config.melee?.physicalStrength ?? defaultMelee.physicalStrength,
            mentalStrength:
              config.melee?.mentalStrength ?? defaultMelee.mentalStrength,
            damageTypes: config.melee?.damageTypes ?? defaultMelee.damageTypes,
            attackEffects: config.melee?.attackEffects ?? defaultMelee.attackEffects,
          },
          ranged: {
            enabled: config.ranged?.enabled ?? defaultRanged.enabled,
            targets: config.ranged?.targets ?? defaultRanged.targets,
            distance: config.ranged?.distance ?? defaultRanged.distance,
            physicalStrength:
              config.ranged?.physicalStrength ?? defaultRanged.physicalStrength,
            mentalStrength:
              config.ranged?.mentalStrength ?? defaultRanged.mentalStrength,
            damageTypes: config.ranged?.damageTypes ?? defaultRanged.damageTypes,
            attackEffects: config.ranged?.attackEffects ?? defaultRanged.attackEffects,
          },
          aoe: {
            enabled: config.aoe?.enabled ?? defaultAoe.enabled,
            count: config.aoe?.count ?? defaultAoe.count,
            centerRange: config.aoe?.centerRange ?? defaultAoe.centerRange,
            shape: config.aoe?.shape ?? defaultAoe.shape,
            sphereRadiusFeet:
              config.aoe?.sphereRadiusFeet ?? defaultAoe.sphereRadiusFeet,
            coneLengthFeet: config.aoe?.coneLengthFeet ?? defaultAoe.coneLengthFeet,
            lineWidthFeet: config.aoe?.lineWidthFeet ?? defaultAoe.lineWidthFeet,
            lineLengthFeet: config.aoe?.lineLengthFeet ?? defaultAoe.lineLengthFeet,
            physicalStrength:
              config.aoe?.physicalStrength ?? defaultAoe.physicalStrength,
            mentalStrength:
              config.aoe?.mentalStrength ?? defaultAoe.mentalStrength,
            damageTypes: config.aoe?.damageTypes ?? defaultAoe.damageTypes,
            attackEffects: config.aoe?.attackEffects ?? defaultAoe.attackEffects,
          },
        };

        (["melee", "ranged", "aoe"] as const).forEach((range) => {
          const rangeCfg = (nextConfig[range] ?? {}) as {
            physicalStrength?: unknown;
            mentalStrength?: unknown;
            damageTypes?: Array<{ name: string; mode: "PHYSICAL" | "MENTAL" }>;
            attackEffects?: string[];
          };
          const ps = Number(rangeCfg.physicalStrength ?? 0);
          const ms = Number(rangeCfg.mentalStrength ?? 0);
          const allowPhysical = ps > 0;
          const allowMental = ms > 0;
          const currentDamageTypes = Array.isArray(rangeCfg.damageTypes) ? rangeCfg.damageTypes : [];
          const filteredDamageTypes = currentDamageTypes.filter((dt) => {
            const mode = String((dt as { mode?: unknown }).mode ?? "PHYSICAL").toUpperCase();
            if (mode === "MENTAL") return allowMental;
            return allowPhysical;
          });
          if (filteredDamageTypes.length !== currentDamageTypes.length) {
            changedAttack = true;
            (nextConfig[range] as Record<string, unknown>).damageTypes = filteredDamageTypes;
          }
          const selectedDamageTypeIds = getSelectedDamageTypeIds({
            ...rangeCfg,
            damageTypes: filteredDamageTypes,
          });
          const selectedAttackEffectIds = getSelectedAttackEffectIds(rangeCfg);
          const allowedEffects = filterAttackEffectsForDamageTypes(
            picklists.attackEffects,
            picklists.damageTypes,
            selectedDamageTypeIds,
          );
          const allowedIds = new Set(allowedEffects.map((fx) => fx.id));
          const filteredSelectedIds = selectedAttackEffectIds.filter((id) => allowedIds.has(id));

          if (filteredSelectedIds.length !== selectedAttackEffectIds.length) {
            changedAttack = true;
            (nextConfig[range] as Record<string, unknown>).attackEffects = filteredSelectedIds
              .map((id) => picklists.attackEffects.find((fx) => fx.id === id)?.name)
              .filter((name): name is string => Boolean(name));
          }
        });

        if (!changedAttack) return attack;
        changedAny = true;
        return { ...attack, attackConfig: nextConfig };
      });

      const primaryAttack = nextAttacks[0] ?? null;
      const nextNaturalAttack = primaryAttack
        ? {
            attackName: primaryAttack.attackName ?? "Natural Weapon",
            attackConfig: primaryAttack.attackConfig ?? defaultNaturalConfig(),
          }
        : null;
      const naturalAttackChanged = (() => {
        const prevNaturalAttack = prev.naturalAttack;
        if (!prevNaturalAttack && !nextNaturalAttack) return false;
        if (!prevNaturalAttack || !nextNaturalAttack) return true;
        if (
          (prevNaturalAttack.attackName ?? "Natural Weapon") !==
          nextNaturalAttack.attackName
        ) {
          return true;
        }
        return (
          JSON.stringify(prevNaturalAttack.attackConfig ?? {}) !==
          JSON.stringify(nextNaturalAttack.attackConfig ?? {})
        );
      })();

      if (!changedAny && !naturalAttackChanged) return prev;
      return { ...prev, attacks: nextAttacks, naturalAttack: nextNaturalAttack };
    });
  }, [editor?.attacks, getSelectedAttackEffectIds, getSelectedDamageTypeIds, picklists.attackEffects, picklists.damageTypes]);

  const editorMobileVisibility = mobileView === "editor" ? "block" : "hidden";
  const previewMobileVisibility = mobileView === "preview" ? "block" : "hidden";
  const previewMonsterName = previewMonster?.name ?? "none";
  const previewScaleEnabled = mobileView === "preview" && Boolean(previewMonster);
  const {
    wrapRef: previewScaleWrapRef,
    innerRef: previewScaleInnerRef,
    scale: previewScale,
    scaledHeight: previewHeight,
  } = useScaledPreview({
    enabled: previewScaleEnabled,
    contentKey: `${previewPrintLayout}-${previewMonsterName}-${mobileView}`,
  });

  if (loading) return <p className="text-sm text-zinc-400">Loading Summoning Circle...</p>;

  if (!editor) {
    return (
      <div className="space-y-4">
        <button
          onClick={newMonster}
          className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
        >
          Create Monster
        </button>
        <div className="rounded border border-zinc-800 p-4 text-sm text-zinc-400">
          Select a monster from the list, or create a new one.
        </div>
      </div>
    );
  }

  const handleImagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly || !imageRepositionMode || !editorHasValidImageUrl) return;
    const frame = imageCropFrameRef.current;
    if (!frame) return;

    const rect = frame.getBoundingClientRect();
    imageDragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosX: editorImagePosX,
      startPosY: editorImagePosY,
      frameWidth: Math.max(1, rect.width),
      frameHeight: Math.max(1, rect.height),
    };
    setImageDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleImagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = imageDragStateRef.current;
    if (!drag) return;
    if (event.pointerId !== drag.pointerId) return;

    const deltaXPercent = ((event.clientX - drag.startClientX) / drag.frameWidth) * 100;
    const deltaYPercent = ((event.clientY - drag.startClientY) / drag.frameHeight) * 100;
    const nextPosX = clampImagePosition(drag.startPosX + deltaXPercent, DEFAULT_IMAGE_POS_X);
    const nextPosY = clampImagePosition(drag.startPosY + deltaYPercent, DEFAULT_IMAGE_POS_Y);

    setEditor((prev) =>
      prev
        ? {
            ...prev,
            imagePosX: nextPosX,
            imagePosY: nextPosY,
          }
        : prev,
    );
  };

  const handleImagePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = imageDragStateRef.current;
    if (!drag) return;
    if (event.pointerId !== drag.pointerId) return;

    imageDragStateRef.current = null;
    setImageDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const renderSlotImagePreview = (
    slotLabel: string,
    selectedItemId: string | null | undefined,
  ) => {
    const selectedItem = selectedItemId ? weaponById[selectedItemId] ?? null : null;
    const selectedImageUrl =
      selectedItem && isHttpUrl(selectedItem.imageUrl) ? selectedItem.imageUrl.trim() : null;
    if (!selectedImageUrl) return null;

    return (
      <div className="h-[200px] w-full rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden flex items-center justify-center p-2">
        <img
          src={selectedImageUrl}
          alt={`${slotLabel} item preview`}
          className="max-h-full max-w-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  };
  const renderHandSlot = (slot: (typeof HAND_SLOTS)[number]) => {
    const selectedValue = editor[slot.key] ?? "";
    const options = weapons.filter((item) => {
      if (slot.key === "offHandItemId" && offHandDisabled) return false;
      return isValidHandItemForSlot(slot.key, item);
    });
    const offHandLocked = slot.key === "offHandItemId" && offHandDisabled;
    const disabled = readOnly || offHandLocked;
    const showInlineEquipmentCapHint = equipmentCapHint && equipmentCapHintSlot === slot.key;

    return (
      <label
        key={slot.key}
        className={`space-y-1 ${offHandLocked ? "opacity-60" : ""}`}
      >
        <span className="text-[11px] text-zinc-500">{slot.label}</span>
        {renderSlotImagePreview(slot.label, selectedValue)}
        <div className="flex gap-2">
          <select
            disabled={disabled}
            aria-disabled={disabled}
            value={selectedValue}
            onChange={(e) => {
              const itemId = asNullableId(e.target.value);
              let blockedBySourceCap = false;
              setEditor((prev) => {
                if (!prev) return prev;
                const next: EditableMonster = { ...prev, [slot.key]: itemId };
                if (slot.key === "mainHandItemId") {
                  const selectedItem = itemId ? weaponById[itemId] ?? null : null;
                  if (isTwoHanded(selectedItem)) {
                    next.offHandItemId = null;
                  }
                }
                const nextEquippedSourceCount = countEquippedWeaponSourcesForState(next);
                const nextTotalWeaponSources = nextEquippedSourceCount + next.attacks.length;
                if (nextTotalWeaponSources > 3) {
                  blockedBySourceCap = true;
                  return prev;
                }
                return next;
              });
              if (blockedBySourceCap) {
                setEquipmentCapHint(equipBlockedHint);
                setEquipmentCapHintSlot(slot.key);
              } else {
                setEquipmentCapHint(null);
                setEquipmentCapHintSlot(null);
              }
            }}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">None</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled || !selectedValue}
            onClick={() => {
              setEquipmentCapHint(null);
              setEquipmentCapHintSlot(null);
              setEditor((prev) => (prev ? { ...prev, [slot.key]: null } : prev));
            }}
            className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        </div>
        {showInlineEquipmentCapHint && <p className="text-xs text-zinc-500">{equipmentCapHint}</p>}
      </label>
    );
  };
  const renderArmorSlot = (slot: (typeof ARMOR_SLOTS)[number]) => {
    const selectedValue = editor[slot.key] ?? "";
    const options = weapons.filter(
      (item) => item.type === "ARMOR" && isValidArmorItemForSlot(slot.key, item),
    );

    return (
      <label key={slot.key} className="space-y-1">
        <span className="text-[11px] text-zinc-500">{slot.label}</span>
        {renderSlotImagePreview(slot.label, selectedValue)}
        <div className="flex gap-2">
          <select
            disabled={readOnly}
            value={selectedValue}
            onChange={(e) =>
              setEditor((prev) =>
                prev ? { ...prev, [slot.key]: asNullableId(e.target.value) } : prev,
              )
            }
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
          >
            <option value="">None</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={readOnly || !selectedValue}
            onClick={() =>
              setEditor((prev) => (prev ? { ...prev, [slot.key]: null } : prev))
            }
            className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </label>
    );
  };
  const renderItemSlot = (slot: (typeof ITEM_SLOTS)[number]) => {
    const selectedValue = editor[slot.key] ?? "";
    const options = weapons.filter(
      (item) => item.type === "ITEM" && isValidItemAccessorySlot(slot.key, item),
    );

    return (
      <label key={slot.key} className="space-y-1">
        <span className="text-[11px] text-zinc-500">{slot.label}</span>
        {renderSlotImagePreview(slot.label, selectedValue)}
        <div className="flex gap-2">
          <select
            disabled={readOnly}
            value={selectedValue}
            onChange={(e) =>
              setEditor((prev) =>
                prev ? { ...prev, [slot.key]: asNullableId(e.target.value) } : prev,
              )
            }
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
          >
            <option value="">None</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={readOnly || !selectedValue}
            onClick={() =>
              setEditor((prev) => (prev ? { ...prev, [slot.key]: null } : prev))
            }
            className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </label>
    );
  };

  const toggleMonsterLevel = (level: number) => {
    setMonsterLevelSelected((prev) =>
      prev.includes(level)
        ? prev.filter((entry) => entry !== level)
        : [...prev, level].sort((a, b) => a - b),
    );
  };

  const toggleMonsterTier = (tier: MonsterTier) => {
    setMonsterTierSelected((prev) =>
      prev.includes(tier)
        ? prev.filter((entry) => entry !== tier)
        : [...prev, tier],
    );
  };

  const setMonsterLevelRange = (min: number, max: number) => {
    setMonsterLevelSelected(
      PICKER_LEVEL_OPTIONS.filter((level) => level >= min && level <= max),
    );
  };

  const clearMonsterFilters = () => {
    setMonsterLevelSelected([]);
    setMonsterTierSelected([]);
    setMonsterExcludeLegendary(false);
  };

  const removeMonsterFilterPill = (pillId: "level" | "tier" | "noLegendary") => {
    if (pillId === "level") {
      setMonsterLevelSelected([]);
      return;
    }
    if (pillId === "tier") {
      setMonsterTierSelected([]);
      return;
    }
    setMonsterExcludeLegendary(false);
  };

  return (
    <div className="space-y-5">
      <section className="rounded border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="flex flex-col sm:flex-row sm:items-start gap-2">
          <div className="flex flex-1 items-start gap-2">
            <div ref={monsterPickerRef} className="flex-1 space-y-2 relative">
              <div className="relative">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                >
                  <path
                    d="M10.5 3a7.5 7.5 0 1 0 4.73 13.32l4.22 4.21 1.06-1.06-4.21-4.22A7.5 7.5 0 0 0 10.5 3Zm0 1.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"
                    fill="currentColor"
                  />
                </svg>
                <input
                  value={monsterPickerQuery}
                  onFocus={() => setMonsterPickerOpen(true)}
                  onClick={() => setMonsterPickerOpen(true)}
                  onChange={(e) => {
                    setMonsterPickerQuery(e.target.value);
                    setMonsterPickerOpen(true);
                  }}
                  placeholder="Click to search monsters"
                  className="w-full rounded border border-zinc-800 bg-zinc-900/30 pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {activeMonsterFilterPills.map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => removeMonsterFilterPill(pill.id)}
                      className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                    >
                      <span>{pill.label}</span>
                      <span aria-hidden="true">x</span>
                    </button>
                  ))}
                </div>
                <p className="pt-1 text-right text-[11px] text-zinc-500">
                  {hasMonsterSearchQuery || hasMonsterFilters
                    ? `Showing ${monsterPickerFilteredCount} of ${monsterPickerTotalCount}`
                    : `Showing ${monsterPickerTotalCount}`}
                </p>
              </div>

              {monsterPickerOpen && (
                <div className="absolute z-30 mt-1 w-full rounded border border-zinc-800 bg-zinc-950/95 p-2 space-y-2 shadow-lg">
                  <div className="max-h-80 overflow-auto space-y-1">
                    {recentMonsterRows.length === 0 &&
                    filteredSummariesWithoutRecent.length === 0 ? (
                      <p className="px-2 py-2 text-sm text-zinc-500">No matches.</p>
                    ) : (
                      <>
                        {!hasMonsterSearchQuery && recentMonsterRows.length > 0 && (
                          <>
                            <p className="px-2 pt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                              Recently used
                            </p>
                            {recentMonsterRows.map((row) => {
                              const tags = getMonsterTags(row);
                              return (
                                <button
                                  key={`recent-${row.id}`}
                                  type="button"
                                  onClick={() => {
                                    hasDraftRef.current = false;
                                    setSuccess(null);
                                    setSelectedId(row.id);
                                    markMonsterAsRecent(row.id);
                                    setMonsterPickerOpen(false);
                                    setMonsterPickerQuery("");
                                  }}
                                  className={`w-full text-left rounded border px-2 py-2 ${
                                    selectedId === row.id
                                      ? "border-emerald-500 bg-emerald-950/20"
                                      : "border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-medium">{row.name}</p>
                                      <p className="text-xs text-zinc-500">
                                        L{row.level} {row.tier} {row.source === "CORE" ? "- Core" : ""}
                                      </p>
                                    </div>
                                  </div>
                                  {tags.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {tags.slice(0, 6).map((tag) => (
                                        <span
                                          key={`recent-${row.id}-${tag}`}
                                          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-[2px] text-[10px] text-zinc-300"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                            <div className="my-1 border-t border-zinc-800" />
                          </>
                        )}
                        {filteredSummariesWithoutRecent.map((row) => {
                          const tags = getMonsterTags(row);
                          return (
                            <button
                              key={row.id}
                              type="button"
                              onClick={() => {
                                hasDraftRef.current = false;
                                setSuccess(null);
                                setSelectedId(row.id);
                                markMonsterAsRecent(row.id);
                                setMonsterPickerOpen(false);
                                setMonsterPickerQuery("");
                              }}
                              className={`w-full text-left rounded border px-2 py-2 ${
                                selectedId === row.id
                                  ? "border-emerald-500 bg-emerald-950/20"
                                  : "border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium">{row.name}</p>
                                  <p className="text-xs text-zinc-500">
                                    L{row.level} {row.tier} {row.source === "CORE" ? "- Core" : ""}
                                  </p>
                                </div>
                              </div>
                              {tags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {tags.slice(0, 6).map((tag) => (
                                    <span
                                      key={`${row.id}-${tag}`}
                                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-[2px] text-[10px] text-zinc-300"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div ref={monsterFiltersRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMonsterFiltersOpen((prev) => !prev)}
                className={`rounded border px-3 py-2 text-sm ${
                  monsterFiltersOpen
                    ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                    : "border-zinc-700 hover:bg-zinc-800"
                }`}
              >
                Filters
              </button>

              {monsterFiltersOpen && (
                <div className="absolute right-0 z-40 mt-1 w-80 max-w-[90vw] rounded border border-zinc-800 bg-zinc-950/95 p-3 shadow-lg space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Monster Level</p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setMonsterLevelSelected([])}
                        className={`rounded border px-2 py-1 text-xs ${
                          monsterLevelSelected.length === 0
                            ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                            : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                        }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonsterLevelRange(1, 5)}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        1-5
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonsterLevelRange(6, 10)}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        6-10
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonsterLevelRange(11, 15)}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        11-15
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonsterLevelRange(16, 20)}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        16-20
                      </button>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {PICKER_LEVEL_OPTIONS.map((level) => {
                        const active = monsterLevelSelected.includes(level);
                        return (
                          <button
                            key={level}
                            type="button"
                            onClick={() => toggleMonsterLevel(level)}
                            className={`rounded border px-2 py-1 text-xs ${
                              active
                                ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                                : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                            }`}
                          >
                            {level}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Tier</p>
                    <div className="flex flex-wrap gap-1">
                      {MONSTER_TIER_OPTIONS.map((tier) => {
                        const active = monsterTierSelected.includes(tier);
                        return (
                          <button
                            key={tier}
                            type="button"
                            onClick={() => toggleMonsterTier(tier)}
                            className={`rounded border px-2 py-1 text-xs ${
                              active
                                ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                                : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                            }`}
                          >
                            {MONSTER_TIER_LABELS[tier]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={monsterExcludeLegendary}
                      onChange={(e) => setMonsterExcludeLegendary(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Exclude Legendary
                  </label>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={clearMonsterFilters}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={newMonster}
            className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
          >
            Summon new monster
          </button>
        </div>
      </section>

        {error && (
          <div className="rounded border border-red-700/40 bg-red-950/20 p-2 text-sm text-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded border border-emerald-700/40 bg-emerald-950/20 p-2 text-sm text-emerald-200">
            {success}
          </div>
        )}

        <div className="lg:hidden rounded border border-zinc-800 overflow-hidden bg-zinc-900/40">
          <div className="grid grid-cols-2">
            <button
              type="button"
              aria-pressed={mobileView === "editor"}
              onClick={() => setMobileView("editor")}
              className={`text-xs font-semibold px-3 py-2 ${
                mobileView === "editor"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Editor
            </button>
            <button
              type="button"
              aria-pressed={mobileView === "preview"}
              onClick={() => setMobileView("preview")}
              className={`text-xs font-semibold px-3 py-2 ${
                mobileView === "preview"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Preview
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className={`${editorMobileVisibility} lg:block space-y-5`}>
        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Monster Editor</h2>
            {readOnly && (
              <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                Core monster (read-only)
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {editor.id && (
                <button
                  onClick={copyMonster}
                  disabled={busy}
                  className="rounded border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800 disabled:opacity-60"
                >
                  Copy
                </button>
              )}
              {!readOnly && (
                <>
                  <button
                    onClick={deleteMonster}
                    disabled={busy || !editor.id}
                    className="rounded border border-red-700 px-3 py-1 text-sm text-red-200 hover:bg-red-950/20 disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button
                    onClick={saveMonster}
                    disabled={busy}
                    className="rounded bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {busy ? "Saving..." : "Save"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              disabled={readOnly}
              value={editor.name}
              onChange={(e) => setEditor((p) => (p ? { ...p, name: e.target.value } : p))}
              placeholder="Name"
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            />
            <select
              disabled={readOnly}
              value={String(editor.level)}
              onChange={(e) =>
                setEditor((p) => (p ? { ...p, level: Number(e.target.value) } : p))
              }
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            >
              {LEVEL_OPTIONS.map((lvl) => (
                <option key={lvl} value={String(lvl)}>
                  {lvl}
                </option>
              ))}
            </select>
            <select
              disabled={readOnly}
              value={editor.tier}
              onChange={(e) =>
                setEditor((p) => (p ? { ...p, tier: e.target.value as EditableMonster["tier"] } : p))
              }
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            >
              <option value="MINION">Minion</option>
              <option value="SOLDIER">Soldier</option>
              <option value="ELITE">Elite</option>
              <option value="BOSS">Boss</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                disabled={readOnly}
                type="checkbox"
                checked={editor.legendary}
                onChange={(e) =>
                  setEditor((p) => (p ? { ...p, legendary: e.target.checked } : p))
                }
              />
              Legendary
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {editor.tags.map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                >
                  {tag}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditor((p) =>
                          p
                            ? { ...p, tags: p.tags.filter((_tag, idx) => idx !== index) }
                            : p,
                        )
                      }
                      className="text-zinc-400 hover:text-zinc-200"
                      aria-label={`Remove tag ${tag}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
            {!readOnly && (
              <div className="relative">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onFocus={() => setTagsFocused(true)}
                  onBlur={() => {
                    setTagsFocused(false);
                    commitTagInput();
                  }}
                  onKeyDown={(e) => {
                    if (isTagDropdownOpen && filteredTagSuggestions.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActiveTagIndex((prev) =>
                          Math.min(
                            filteredTagSuggestions.length - 1,
                            prev < 0 ? 0 : prev + 1,
                          ),
                        );
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActiveTagIndex((prev) => Math.max(0, prev <= 0 ? 0 : prev - 1));
                        return;
                      }
                      if (e.key === "Enter") {
                        if (activeTagIndex >= 0) {
                          e.preventDefault();
                          const pick = filteredTagSuggestions[activeTagIndex];
                          if (pick) {
                            commitTagInput(pick.value);
                          }
                          return;
                        }
                        e.preventDefault();
                        commitTagInput();
                        return;
                      }
                      if (e.key === "Tab") {
                        const pickIndex = activeTagIndex >= 0 ? activeTagIndex : 0;
                        const pick = filteredTagSuggestions[pickIndex];
                        if (pick) {
                          e.preventDefault();
                          commitTagInput(pick.value);
                        }
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setTagSuggestions([]);
                        setActiveTagIndex(-1);
                        return;
                      }
                    }

                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      commitTagInput();
                      return;
                    }
                    if (e.key === "Backspace" && tagInput.trim().length === 0) {
                      setEditor((p) =>
                        p && p.tags.length > 0 ? { ...p, tags: p.tags.slice(0, -1) } : p,
                      );
                    }
                  }}
                  placeholder="Add tag (Enter or comma)"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
                {isTagDropdownOpen && (
                  <div className="absolute z-20 mt-1 w-full rounded border border-zinc-700 bg-zinc-950 shadow-lg">
                    {tagsLoading ? (
                      <p className="px-2 py-1 text-xs text-zinc-400">Loading...</p>
                    ) : filteredTagSuggestions.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-zinc-500">No suggestions</p>
                    ) : (
                      <ul className="max-h-56 overflow-auto py-1">
                        {filteredTagSuggestions.map((suggestion, idx) => (
                          <li key={`${suggestion.source}-${suggestion.value}`}>
                            <button
                              type="button"
                              onMouseEnter={() => setActiveTagIndex(idx)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                commitTagInput(suggestion.value);
                              }}
                              className={`flex w-full items-center justify-between px-2 py-1 text-left text-sm hover:bg-zinc-800 ${
                                idx === activeTagIndex ? "bg-zinc-800" : ""
                              }`}
                            >
                              <span>{suggestion.value}</span>
                              <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                                {suggestion.source}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Monster Image URL</label>
            <input
              disabled={readOnly}
              value={editor.imageUrl ?? ""}
              onChange={(e) =>
                setEditor((p) =>
                  p
                    ? {
                        ...p,
                        imageUrl: asNullableText(e.target.value),
                      }
                    : p,
                )
              }
              placeholder="Paste an image URL..."
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
            />
            <p className="text-[11px] text-zinc-500">
              Must be a direct URL. Hotlinks can break if the host blocks them.
            </p>
            {!readOnly && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={imageRepositionMode}
                    onChange={(e) => setImageRepositionMode(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Reposition
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setEditor((p) =>
                      p
                        ? {
                            ...p,
                            imagePosX: DEFAULT_IMAGE_POS_X,
                            imagePosY: DEFAULT_IMAGE_POS_Y,
                          }
                        : p,
                    )
                  }
                  className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                >
                  Reset
                </button>
                <p className="ml-auto text-[11px] text-zinc-500">
                  Crop: {Math.round(editorImagePosX)}% / {Math.round(editorImagePosY)}%
                </p>
              </div>
            )}
            <div
              ref={imageCropFrameRef}
              onPointerDown={handleImagePointerDown}
              onPointerMove={handleImagePointerMove}
              onPointerUp={handleImagePointerEnd}
              onPointerCancel={handleImagePointerEnd}
              className={[
                "relative h-56 w-full rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden select-none",
                imageRepositionMode && !readOnly
                  ? imageDragging
                    ? "cursor-grabbing touch-none"
                    : "cursor-grab touch-none"
                  : "",
              ].join(" ")}
            >
              {editorHasValidImageUrl ? (
                <img
                  src={editor.imageUrl!.trim()}
                  alt="Monster image preview"
                  className="w-full h-full object-cover"
                  style={{ objectPosition: `${editorImagePosX}% ${editorImagePosY}%` }}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  draggable={false}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-zinc-500">
                  Enter a valid image URL to preview crop.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Survivability & Defence</h3>
          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[11px] text-zinc-500">Physical Resilience</span>
              <input
                readOnly
                type="number"
                value={resilienceValues.physicalResilienceMax}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-zinc-500">Mental Perseverance</span>
              <input
                readOnly
                type="number"
                value={resilienceValues.mentalPerseveranceMax}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
              />
            </label>
          </div>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3 overflow-visible">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Attributes</h3>
          <div className="space-y-2 min-w-0">
            <div className="mb-2 grid grid-cols-4 gap-2 items-center min-w-0 text-xs text-zinc-400 uppercase tracking-wide">
              <div aria-hidden="true" />
              <div className="text-center">Attributes</div>
              <div className="text-center">Resist</div>
              <div className="text-center">Modifiers</div>
            </div>
            {ATTR_ROWS.map(([label, dieKey, resistKey, modKey]) => (
              <div
                key={label}
                className="grid grid-cols-4 gap-2 items-center min-w-0"
              >
                <p className="self-center min-w-0 text-center">
                  <HoverTooltipLabel label={label} tooltip={ATTRIBUTE_TOOLTIPS[label]} />
                </p>
                <select
                  disabled={readOnly}
                  value={String(editor[dieKey])}
                  onChange={(e) =>
                    setEditor((p) => (p ? { ...p, [dieKey]: e.target.value as DiceSize } : p))
                  }
                  className="min-w-0 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-center"
                >
                  {DICE.map((die) => (
                    <option key={die} value={die}>
                      {dieLabel(die)}
                    </option>
                  ))}
                </select>
                <input
                  disabled={readOnly}
                  type="number"
                  min={0}
                  value={Number(editor[resistKey])}
                  onChange={(e) =>
                    setEditor((p) =>
                      p ? { ...p, [resistKey]: Math.max(0, Number(e.target.value || 0)) } : p,
                    )
                  }
                  className="min-w-0 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-center"
                />
                <input
                  readOnly
                  type="number"
                  value={itemModifierValues[modKey]}
                  className="min-w-0 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-center opacity-80"
                />
              </div>
            ))}
          </div>

        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Traits</h3>
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 items-center">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Trait Points</p>
            <input
              readOnly
              type="number"
              value={TRAIT_POINTS_PLACEHOLDER}
              className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-center opacity-80"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Selected Traits</p>
            {editor.traits.length === 0 ? (
              <p className="text-sm text-zinc-500">None</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {editor.traits.map((trait, index) => {
                  const resolved = traitById[trait.traitDefinitionId];
                  const label = trait.name ?? resolved?.name ?? trait.traitDefinitionId;
                  const effect = trait.effectText ?? resolved?.effectText ?? "No description";
                  const renderedEffect = renderTraitEffectText(effect);
                  return (
                    <span
                      key={`${trait.traitDefinitionId}-${index}`}
                      title={renderedEffect}
                      className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                    >
                      {label}
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    traits: p.traits
                                      .filter((_, idx) => idx !== index)
                                      .map((entry, idx) => ({ ...entry, sortOrder: idx })),
                                  }
                                : p,
                            )
                          }
                          className="text-zinc-400 hover:text-zinc-200"
                          aria-label={`Remove trait ${label}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Available CORE Traits</p>
            <div className="flex flex-wrap gap-2">
              {traitDefinitions
                .filter(
                  (trait) =>
                    !editor.traits.some((selected) => selected.traitDefinitionId === trait.id),
                )
                .map((trait) => {
                  const renderedEffect = renderTraitEffectText(
                    trait.effectText ?? "No description",
                  );
                  return (
                    <button
                      key={trait.id}
                      type="button"
                      title={renderedEffect}
                      disabled={readOnly}
                      onClick={() =>
                        setEditor((p) =>
                          p
                            ? {
                                ...p,
                                traits: p.traits.some(
                                  (selected) => selected.traitDefinitionId === trait.id,
                                )
                                  ? p.traits
                                  : [
                                      ...p.traits,
                                      {
                                        sortOrder: p.traits.length,
                                        traitDefinitionId: trait.id,
                                        name: trait.name,
                                        effectText: trait.effectText,
                                      },
                                    ],
                              }
                            : p,
                        )
                      }
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-60"
                    >
                      {trait.name}
                    </button>
                  );
                })}
              {traitDefinitions.length === 0 && (
                <p className="text-sm text-zinc-500">No CORE traits available.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <button
            type="button"
            onClick={() => setEquippedGearCollapsed((prev) => !prev)}
            className="w-full flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 hover:bg-zinc-900/40 cursor-pointer select-none"
            aria-expanded={!equippedGearCollapsed}
          >
            <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-400">
              <span aria-hidden="true">{equippedGearCollapsed ? "▶" : "▼"}</span>
              Equipped Gear
            </span>
          </button>

          {!equippedGearCollapsed && (
            <>
              {/* SC_EQUIP_LAYOUT_BODY_ORDER_V1 */}
              <div className="space-y-2">
                <p className="text-[11px] text-zinc-500">Loadout</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {renderArmorSlot(ARMOR_SLOTS[0])}
                    {renderItemSlot(ITEM_SLOTS[0])}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {renderItemSlot(ITEM_SLOTS[1])}
                    {renderArmorSlot(ARMOR_SLOTS[1])}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {renderItemSlot(ITEM_SLOTS[2])}
                    {renderArmorSlot(ARMOR_SLOTS[2])}
                  </div>
                  {offHandDisabled ? (
                    <div className="grid grid-cols-1 gap-3">
                      {renderHandSlot(HAND_SLOTS[0])}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {renderHandSlot(HAND_SLOTS[0])}
                      {renderHandSlot(HAND_SLOTS[1])}
                    </div>
                  )}
                  {offHandDisabled && (
                    <p className="text-xs text-zinc-500">
                      Off Hand is disabled while Main Hand has a two-handed item.
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {renderItemSlot(ITEM_SLOTS[3])}
                    {renderHandSlot(HAND_SLOTS[2])}
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {renderArmorSlot(ARMOR_SLOTS[3])}
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {renderArmorSlot(ARMOR_SLOTS[4])}
                  </div>
                </div>
              </div>

              <p className="text-xs text-zinc-500">
                Weapon sources: {totalWeaponSources}/3 (equipped {equippedWeaponSourceCount}, natural{" "}
                {naturalWeaponSourceCount}) - Attack strings: {weaponAttackStringCount}
              </p>
            </>
          )}
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Defence</h3>

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500">Derived from Gear & Attributes</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[11px] text-zinc-500">Natural Physical Protection</span>
                <select
                  value={editor.naturalPhysicalProtection}
                  disabled={readOnly}
                  onChange={(e) =>
                    setEditor((prev) =>
                      prev
                        ? {
                            ...prev,
                            naturalPhysicalProtection: Math.max(
                              0,
                              Math.min(30, Number(e.target.value) || 0),
                            ),
                          }
                        : prev,
                    )
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm"
                >
                  {Array.from({ length: 31 }, (_, value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-zinc-500">Natural Mental Protection</span>
                <select
                  value={editor.naturalMentalProtection}
                  disabled={readOnly}
                  onChange={(e) =>
                    setEditor((prev) =>
                      prev
                        ? {
                            ...prev,
                            naturalMentalProtection: Math.max(
                              0,
                              Math.min(30, Number(e.target.value) || 0),
                            ),
                          }
                        : prev,
                    )
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm"
                >
                  {Array.from({ length: 31 }, (_, value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
              <label className="space-y-1">
                <span
                  title="Physical Protection"
                  className="text-[11px] text-zinc-500 whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  Physical Protection
                </span>
                <input
                  readOnly
                  type="number"
                  value={totalPhysicalProtection}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
                />
              </label>
              <label className="space-y-1">
                <span
                  title="Armor Skill"
                  className="text-[11px] text-zinc-500 whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  <HoverTooltipLabel
                    label="Armor Skill"
                    tooltip={DERIVED_STAT_TOOLTIPS.armorSkill}
                    className="text-[11px]"
                  />
                </span>
                <input
                  readOnly
                  type="number"
                  value={computedArmorSkillValue}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
                />
              </label>
              <label className="space-y-1">
                <span
                  title="Dodge"
                  className="text-[11px] text-zinc-500 whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  <HoverTooltipLabel
                    label="Dodge"
                    tooltip={DERIVED_STAT_TOOLTIPS.dodge}
                    className="text-[11px]"
                  />
                </span>
                <input
                  readOnly
                  type="number"
                  value={dodgeValue}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
                />
              </label>
              <label className="space-y-1">
                <span
                  title="Mental Protection"
                  className="text-[11px] text-zinc-500 whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  Mental Protection
                </span>
                <input
                  readOnly
                  type="number"
                  value={totalMentalProtection}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
                />
              </label>
              <label className="space-y-1">
                <span
                  title="Willpower"
                  className="text-[11px] text-zinc-500 whitespace-nowrap overflow-hidden text-ellipsis"
                >
                  <HoverTooltipLabel
                    label="Willpower"
                    tooltip={DERIVED_STAT_TOOLTIPS.willpower}
                    className="text-[11px]"
                  />
                </span>
                <input
                  readOnly
                  type="number"
                  value={willpowerValue}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
                />
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500">Defence Strings</p>
            <div className="rounded border border-zinc-800 bg-zinc-900 p-2 space-y-1">
              {defenceStrings.map((line, index) => (
                <p key={index} className="text-xs text-zinc-300 whitespace-pre-wrap">
                  {line}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wide text-zinc-400">Attacks</h3>
            {!readOnly && (
              <button
                onClick={() => {
                  const nextAttackIndex = editor.attacks.length;
                  const nextAttack = defaultNaturalAttackEntry(nextAttackIndex);
                  const nextAttackKey = getNaturalAttackCollapseKey(nextAttack, nextAttackIndex);

                  setEditor((p) =>
                    p && p.attacks.length < 3
                      ? {
                          ...p,
                          attacks: [...p.attacks, nextAttack],
                        }
                      : p,
                  );

                  setCollapsedNaturalAttacks((prev) => {
                    const next = { ...prev };
                    delete next[nextAttackKey];
                    return next;
                  });
                }}
                type="button"
                onClickCapture={undefined}
                disabled={editor.attacks.length >= 3 || naturalAttacksLocked}
                className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
              >
                Add Natural Attack
              </button>
            )}
          </div>

          <label className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500">
              <HoverTooltipLabel
                label="Weapon Skill"
                tooltip={DERIVED_STAT_TOOLTIPS.weaponSkill}
                className="text-[11px]"
              />
            </span>
            <input
              readOnly
              type="number"
              value={computedWeaponSkillValue}
              className="w-12 text-center rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-80"
            />
          </label>

          <div className="space-y-2">
            <p className="text-[11px] text-zinc-500">From Equipped Gear</p>
            {equippedWeaponAttackPreview.length === 0 ? (
              <p className="text-sm text-zinc-500">No weapon attack strings from equipped items.</p>
            ) : (
              <div className="space-y-2">
                {equippedWeaponAttackPreview.map((row, rowIndex) => (
                  <div key={`${row.label}-${rowIndex}`} className="rounded border border-zinc-800 p-2 space-y-1">
                    <p className="text-sm text-zinc-300">{row.label}</p>
                    {row.lines.map((line, lineIndex) => (
                      <p key={lineIndex} className="text-xs text-zinc-500">
                        {line}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {naturalAttacksLocked && (
            <p className="text-xs text-zinc-500">
              {naturalSourceCapHint}
            </p>
          )}

          {editor.attacks.length === 0 && (
            <p className="text-sm text-zinc-500">No attacks configured.</p>
          )}

          <div className="space-y-3">
            {editor.attacks.map((attack, attackIndex) => {
              const naturalAttackKey = getNaturalAttackCollapseKey(attack, attackIndex);
              const collapsed = !!collapsedNaturalAttacks[naturalAttackKey];
              const naturalAttackName = attack.attackName?.trim() ?? "";
              return (
              <div key={naturalAttackKey} className="space-y-2 rounded border border-zinc-800 p-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleNaturalAttackCollapsed(naturalAttackKey)}
                    className="w-full flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 hover:bg-zinc-900/40 cursor-pointer select-none text-left"
                    aria-expanded={!collapsed}
                  >
                    <span className="min-w-0 truncate text-sm font-medium">
                      <span className="mr-2" aria-hidden="true">
                        {collapsed ? "▶" : "▼"}
                      </span>
                      {naturalAttackName || "Unnamed"}
                    </span>
                  </button>
                  {!readOnly && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveAttack(attackIndex, attackIndex - 1)}
                        disabled={attackIndex === 0}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
                        aria-label={`Move attack ${attackIndex + 1} up`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveAttack(attackIndex, attackIndex + 1)}
                        disabled={attackIndex === editor.attacks.length - 1}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-50"
                        aria-label={`Move attack ${attackIndex + 1} down`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditor((p) =>
                            p
                              ? {
                                  ...p,
                                  attacks: p.attacks
                                    .filter((_row, idx) => idx !== attackIndex)
                                    .map((row, idx) => ({ ...row, sortOrder: idx })),
                                }
                              : p,
                          )
                        }
                        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {!collapsed && (
                  <>
                    <input
                      disabled={readOnly}
                      value={attack.attackName ?? "Natural Weapon"}
                      onChange={(e) =>
                        setEditor((p) =>
                          p
                            ? {
                                ...p,
                                attacks: p.attacks.map((row, idx) =>
                                  idx === attackIndex
                                    ? { ...row, attackName: e.target.value }
                                    : row,
                                ),
                              }
                            : p,
                        )
                      }
                      placeholder="Natural attack name"
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    />

                    {(["melee", "ranged", "aoe"] as const).map((range) => {
                      const cfg = (attack.attackConfig?.[range] ?? {}) as {
                        enabled?: boolean;
                        targets?: number;
                        distance?: number;
                        count?: number;
                        centerRange?: number;
                        shape?: "SPHERE" | "CONE" | "LINE";
                        sphereRadiusFeet?: number;
                        coneLengthFeet?: number;
                        lineWidthFeet?: number;
                        lineLengthFeet?: number;
                        physicalStrength?: number;
                        mentalStrength?: number;
                        damageTypes?: Array<{ name: string; mode: "PHYSICAL" | "MENTAL" }>;
                        attackEffects?: string[];
                      };

                      const damageField: NaturalAttackDamageField =
                        range === "melee"
                          ? "meleeDamageTypeIds"
                          : range === "ranged"
                            ? "rangedDamageTypeIds"
                            : "aoeDamageTypeIds";
                      const effectField: NaturalAttackEffectField =
                        range === "melee"
                          ? "attackEffectMeleeIds"
                          : range === "ranged"
                            ? "attackEffectRangedIds"
                            : "attackEffectAoEIds";
                      const selectedDamageTypeIds = getSelectedDamageTypeIds(cfg);
                      const physicalStrength = Number(cfg.physicalStrength ?? 0);
                      const mentalStrength = Number(cfg.mentalStrength ?? 0);
                      const allowedModes = new Set<"PHYSICAL" | "MENTAL">();
                      if (physicalStrength > 0) allowedModes.add("PHYSICAL");
                      if (mentalStrength > 0) allowedModes.add("MENTAL");
                      const selectedModes = new Set<"PHYSICAL" | "MENTAL">();
                      for (const id of selectedDamageTypeIds) {
                        const dt = picklists.damageTypes.find((x) => x.id === id);
                        const mode = getAttackModeKey(dt?.attackMode);
                        selectedModes.add(mode);
                      }
                      const needsPhysical = physicalStrength > 0;
                      const needsMental = mentalStrength > 0;
                      const missingPhysical = needsPhysical && !selectedModes.has("PHYSICAL");
                      const missingMental = needsMental && !selectedModes.has("MENTAL");
                      const selectedAttackEffectIds = getSelectedAttackEffectIds(cfg);
                      const allowedAttackEffects = filterAttackEffectsForDamageTypes(
                        picklists.attackEffects,
                        picklists.damageTypes,
                        selectedDamageTypeIds,
                      );

                      return (
                        <div key={range} className="rounded border border-zinc-800 p-2 space-y-2">
                          <label className="text-xs text-zinc-300 flex items-center gap-2">
                            <input
                              disabled={readOnly}
                              type="checkbox"
                              checked={!!cfg.enabled}
                              onChange={(e) => updateAttackRange(attackIndex, range, { enabled: e.target.checked })}
                            />
                            {range.toUpperCase()} enabled
                          </label>

                          {!!cfg.enabled && (
                            <div className="space-y-3">
                              <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                                {range.toUpperCase()}
                              </p>

                              {range === "melee" && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div>
                                    <label className="block text-[11px] text-zinc-400 mb-1">
                                      Physical Strength
                                    </label>
                                    <select
                                      disabled={readOnly}
                                      value={String(clampToOptions(Number(cfg.physicalStrength ?? 0), STRENGTH_OPTIONS, 0))}
                                      onChange={(e) =>
                                        updateAttackRange(attackIndex, "melee", {
                                          physicalStrength: Number(e.target.value),
                                        })
                                      }
                                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                    >
                                      {STRENGTH_OPTIONS.map((v) => (
                                        <option key={v} value={String(v)}>
                                          {v}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-zinc-400 mb-1">
                                      Mental Strength
                                    </label>
                                    <select
                                      disabled={readOnly}
                                      value={String(clampToOptions(Number(cfg.mentalStrength ?? 0), STRENGTH_OPTIONS, 0))}
                                      onChange={(e) =>
                                        updateAttackRange(attackIndex, "melee", {
                                          mentalStrength: Number(e.target.value),
                                        })
                                      }
                                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                    >
                                      {STRENGTH_OPTIONS.map((v) => (
                                        <option key={v} value={String(v)}>
                                          {v}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-zinc-400 mb-1">
                                      Targets
                                    </label>
                                    <select
                                      disabled={readOnly}
                                      value={String(clampToOptions(Number(cfg.targets ?? 1), TARGET_OPTIONS, 1))}
                                      onChange={(e) =>
                                        updateAttackRange(attackIndex, "melee", {
                                          targets: Number(e.target.value),
                                        })
                                      }
                                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                    >
                                      {TARGET_OPTIONS.map((v) => (
                                        <option key={v} value={String(v)}>
                                          {v}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              )}

                              {range === "ranged" && (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                  <div>
                                    <label className="block text-[11px] text-zinc-400 mb-1">
                                      Physical Strength
                                    </label>
                                    <select
                                      disabled={readOnly}
                                      value={String(clampToOptions(Number(cfg.physicalStrength ?? 0), STRENGTH_OPTIONS, 0))}
                                      onChange={(e) =>
                                        updateAttackRange(attackIndex, "ranged", {
                                          physicalStrength: Number(e.target.value),
                                        })
                                      }
                                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                    >
                                      {STRENGTH_OPTIONS.map((v) => (
                                        <option key={v} value={String(v)}>
                                          {v}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-zinc-400 mb-1">
                                      Mental Strength
                                    </label>
                                    <select
                                      disabled={readOnly}
                                      value={String(clampToOptions(Number(cfg.mentalStrength ?? 0), STRENGTH_OPTIONS, 0))}
                                      onChange={(e) =>
                                        updateAttackRange(attackIndex, "ranged", {
                                          mentalStrength: Number(e.target.value),
                                        })
                                      }
                                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                    >
                                      {STRENGTH_OPTIONS.map((v) => (
                                        <option key={v} value={String(v)}>
                                          {v}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-zinc-400 mb-1">
                                      Targets
                                    </label>
                                    <select
                                      disabled={readOnly}
                                      value={String(clampToOptions(Number(cfg.targets ?? 1), TARGET_OPTIONS, 1))}
                                      onChange={(e) =>
                                        updateAttackRange(attackIndex, "ranged", {
                                          targets: Number(e.target.value),
                                        })
                                      }
                                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                    >
                                      {TARGET_OPTIONS.map((v) => (
                                        <option key={v} value={String(v)}>
                                          {v}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    {renderRangePills(
                                      "Ranged Distance (ft)",
                                      [30, 60, 120, 200],
                                      Number(cfg.distance ?? 0),
                                      (v) => updateAttackRange(attackIndex, "ranged", { distance: v }),
                                    )}
                                  </div>
                                </div>
                              )}

                              {range === "aoe" && (
                                <>
                                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                    <div>
                                      <label className="block text-[11px] text-zinc-400 mb-1">
                                        Physical Strength
                                      </label>
                                      <select
                                        disabled={readOnly}
                                        value={String(clampToOptions(Number(cfg.physicalStrength ?? 0), STRENGTH_OPTIONS, 0))}
                                        onChange={(e) =>
                                          updateAttackRange(attackIndex, "aoe", {
                                            physicalStrength: Number(e.target.value),
                                          })
                                        }
                                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                      >
                                        {STRENGTH_OPTIONS.map((v) => (
                                          <option key={v} value={String(v)}>
                                            {v}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[11px] text-zinc-400 mb-1">
                                        Mental Strength
                                      </label>
                                      <select
                                        disabled={readOnly}
                                        value={String(clampToOptions(Number(cfg.mentalStrength ?? 0), STRENGTH_OPTIONS, 0))}
                                        onChange={(e) =>
                                          updateAttackRange(attackIndex, "aoe", {
                                            mentalStrength: Number(e.target.value),
                                          })
                                        }
                                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                      >
                                        {STRENGTH_OPTIONS.map((v) => (
                                          <option key={v} value={String(v)}>
                                            {v}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[11px] text-zinc-400 mb-1">
                                        Count
                                      </label>
                                      <select
                                        disabled={readOnly}
                                        value={String(clampToOptions(Number(cfg.count ?? 1), TARGET_OPTIONS, 1))}
                                        onChange={(e) =>
                                          updateAttackRange(attackIndex, "aoe", {
                                            count: Number(e.target.value),
                                          })
                                        }
                                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                      >
                                        {TARGET_OPTIONS.map((v) => (
                                          <option key={v} value={String(v)}>
                                            {v}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      {renderRangePills(
                                        "AoE Cast Range (ft)",
                                        [0, 30, 60, 120, 200],
                                        Number(cfg.centerRange ?? 0),
                                        (v) => updateAttackRange(attackIndex, "aoe", { centerRange: v }),
                                      )}
                                    </div>
                                    <div>
                                      <label className="block text-[11px] text-zinc-400 mb-1">
                                        Shape
                                      </label>
                                      <select
                                        disabled={readOnly}
                                        value={String(cfg.shape ?? "SPHERE")}
                                        onChange={(e) =>
                                          updateAttackRange(attackIndex, "aoe", {
                                            shape: e.target.value as "SPHERE" | "CONE" | "LINE",
                                          })
                                        }
                                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                                      >
                                        <option value="SPHERE">Sphere</option>
                                        <option value="CONE">Cone</option>
                                        <option value="LINE">Line</option>
                                      </select>
                                    </div>
                                  </div>

                                  {String(cfg.shape ?? "SPHERE") === "SPHERE" && (
                                    <div>
                                      {renderRangePills(
                                        "AoE Sphere Radius (ft)",
                                        [10, 20, 30],
                                        Number(cfg.sphereRadiusFeet ?? 0),
                                        (v) => updateAttackRange(attackIndex, "aoe", { sphereRadiusFeet: v }),
                                      )}
                                    </div>
                                  )}

                                  {String(cfg.shape ?? "SPHERE") === "CONE" && (
                                    <div>
                                      {renderRangePills(
                                        "AoE Cone Length (ft)",
                                        [15, 30, 60],
                                        Number(cfg.coneLengthFeet ?? 0),
                                        (v) => updateAttackRange(attackIndex, "aoe", { coneLengthFeet: v }),
                                      )}
                                    </div>
                                  )}

                                  {String(cfg.shape ?? "SPHERE") === "LINE" && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div>
                                        {renderRangePills(
                                          "AoE Line Width (ft)",
                                          [5, 10, 15, 20],
                                          Number(cfg.lineWidthFeet ?? 0),
                                          (v) => updateAttackRange(attackIndex, "aoe", { lineWidthFeet: v }),
                                        )}
                                      </div>
                                      <div>
                                        {renderRangePills(
                                          "AoE Line Length (ft)",
                                          [30, 60, 90, 120],
                                          Number(cfg.lineLengthFeet ?? 0),
                                          (v) => updateAttackRange(attackIndex, "aoe", { lineLengthFeet: v }),
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}

                              <div className="space-y-1">
                                <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                                  Damage Types
                                </p>
                                {renderDamageTypeChips(
                                  attackIndex,
                                  picklists.damageTypes,
                                  selectedDamageTypeIds,
                                  damageField,
                                  allowedModes,
                                )}
                                {(missingPhysical || missingMental) && (
                                  <p className="text-xs text-amber-400">
                                    {missingPhysical &&
                                      "Select at least 1 PHYSICAL damage type (Physical Strength > 0). "}
                                    {missingMental &&
                                      "Select at least 1 MENTAL damage type (Mental Strength > 0)."}
                                  </p>
                                )}
                              </div>

                              <div className="space-y-1">
                                <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                                  Greater Success Attack Effects
                                </p>
                                {selectedDamageTypeIds.length === 0 ? (
                                  <p className="text-xs text-zinc-500">
                                    Select Damage Types to unlock Attack Effects.
                                  </p>
                                ) : (
                                  renderAttackEffectChips(
                                    attackIndex,
                                    allowedAttackEffects,
                                    selectedAttackEffectIds,
                                    effectField,
                                  )
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="rounded border border-zinc-800 p-2 space-y-1">
                      <p className="text-xs text-zinc-300">Natural Attack Preview</p>
                      {(naturalAttackPreviewLines[attackIndex] ?? []).length === 0 ? (
                        <p className="text-xs text-zinc-500">No attack lines.</p>
                      ) : (
                        (naturalAttackPreviewLines[attackIndex] ?? []).map((line, lineIndex) => (
                          <p key={lineIndex} className="text-xs text-zinc-500">
                            {line}
                          </p>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
              );
            })}
          </div>
        </section>

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wide text-zinc-400">Powers</h3>
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  const nextPowerIndex = editor.powers.length;
                  const nextPower = defaultPower();
                  const nextPowerKey = getPowerCollapseKey(nextPower, nextPowerIndex);

                  setEditor((p) => (p ? { ...p, powers: [...p.powers, nextPower] } : p));
                  setCollapsedPowerIds((prev) => {
                    const next = { ...prev };
                    delete next[nextPowerKey];
                    return next;
                  });
                }}
                className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
              >
                Add Power
              </button>
            )}
          </div>

          <div className="space-y-3">
            {editor.powers.map((power, i) => {
              const powerRangeState = toPowerRangeState(power);
              const powerKey = getPowerCollapseKey(power, i);
              const collapsed = !!collapsedPowerIds[powerKey];
              const powerName = power.name?.trim() || `Power ${i + 1}`;
              return (
                <div key={powerKey} className="rounded border border-zinc-800 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => togglePowerCollapsed(powerKey)}
                      className="w-full flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 hover:bg-zinc-900/40 cursor-pointer select-none text-left"
                      aria-expanded={!collapsed}
                    >
                      <span className="min-w-0 truncate text-sm font-medium">
                        <span className="mr-2" aria-hidden="true">
                          {collapsed ? "▶" : "▼"}
                        </span>
                        {powerName}
                      </span>
                      {collapsed && (
                        <span className="text-[11px] text-zinc-600">
                          Intentions: {power.intentions?.length ?? 0}
                        </span>
                      )}
                    </button>

                    {!readOnly && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!window.confirm("Remove this power? This cannot be undone.")) return;
                          setEditor((p) =>
                            p ? { ...p, powers: p.powers.filter((_x, idx) => idx !== i) } : p,
                          );
                        }}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 shrink-0"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {!collapsed && (
                    <>
                      <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-1 gap-2">
                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Power Name</span>
                        <input
                          disabled={readOnly}
                          value={power.name}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i ? { ...x, name: e.target.value } : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          placeholder="Power name"
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                      </label>
                    </div>

                  <label className="space-y-1 block">
                    <span className="text-[11px] text-zinc-500">Power Description</span>
                    <textarea
                      disabled={readOnly}
                      rows={2}
                      value={power.description ?? ""}
                    onChange={(e) =>
                      setEditor((p) =>
                        p
                          ? {
                              ...p,
                              powers: p.powers.map((x, idx) =>
                                idx === i ? { ...x, description: e.target.value || null } : x,
                              ),
                            }
                          : p,
                      )
                    }
                    placeholder="What does this power do?"
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                  />
                  </label>
                  </div>
                  <div className="order-2 space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Intentions</p>
                      <p className="text-[11px] text-zinc-600">A power can have multiple intentions (higher cost).</p>
                    </div>

                    <div className="space-y-3">
                      {power.intentions.map((it, j) => {
                        const details = (it.detailsJson ?? {}) as Record<string, unknown>;
                        const attackMode = getDetailsString(details, "attackMode");
                        const dmgTypes = getDetailsStringArray(details, "damageTypes");
                        const controlMode = getDetailsString(details, "controlMode");
                        const cleanseEffectType = getDetailsString(details, "cleanseEffectType");
                        const movementMode = getDetailsString(details, "movementMode");
                        const statTarget = getDetailsStatTarget(details);
                        const applyTo = getDetailsApplyTo(details);

                        const availableDamageTypes =
                          attackMode === "MENTAL"
                            ? picklists.damageTypes.filter((d) => getAttackModeKey(d.attackMode) === "MENTAL")
                            : picklists.damageTypes.filter((d) => getAttackModeKey(d.attackMode) === "PHYSICAL");

                        return (
                          <div key={j} className="rounded border border-zinc-800 bg-zinc-900/20 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">Intention {j + 1}</p>
                              {!readOnly && power.intentions.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditor((p) =>
                                      p
                                        ? {
                                            ...p,
                                            powers: p.powers.map((x, idx) =>
                                              idx === i
                                                ? {
                                                    ...x,
                                                    intentions: x.intentions
                                                      .filter((_row, k) => k !== j)
                                                      .map((row, k) => ({ ...row, sortOrder: k })),
                                                  }
                                                : x,
                                            ),
                                          }
                                        : p,
                                    )
                                  }
                                  className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                                >
                                  Remove
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <label className="space-y-1">
                                <span className="text-[11px] text-zinc-500">Intention Type</span>
                                <select
                                  disabled={readOnly}
                                  value={it.type}
                                  onChange={(e) => {
                                    const nextType = e.target.value as MonsterPowerIntentionType;

                                    setEditor((prev) => {
                                      if (!prev) return prev;
                                      const next = structuredClone(prev);
                                      const power = next.powers[i];
                                      if (!power) return prev;
                                      const intention = power.intentions[j];
                                      if (!intention) return prev;

                                      intention.type = nextType;
                                      intention.detailsJson = defaultDetailsForIntentionType(nextType);

                                      return next;
                                    });
                                  }}
                                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                >
                                  {INTENTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              {j === 0 && (
                                <div className="space-y-1">
                                  <span className="text-[11px] text-zinc-500">Defence Check</span>
                                  <input
                                    value={deriveDefenceCheckLabel(it.type, details) ?? "None"}
                                    disabled
                                    readOnly
                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 disabled:opacity-100"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="rounded border border-zinc-800 bg-zinc-950/30 p-3 space-y-2">
                              <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Specifics</p>

                              {power.intentions.length > 1 && j > 0 && (
                                <label className="space-y-1 block">
                                  <span className="text-[11px] text-zinc-500">Applies To</span>
                                  <select
                                    disabled={readOnly}
                                    value={applyTo}
                                    onChange={(e) =>
                                      setPowerIntentionDetails(setEditor, i, j, {
                                        applyTo: e.target.value as MonsterPowerIntentionApplyTo,
                                      })
                                    }
                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                  >
                                    <option value="PRIMARY_TARGET">Primary Target(s)</option>
                                    <option value="SELF">Self</option>
                                  </select>
                                </label>
                              )}

                              {(it.type === "ATTACK" || it.type === "DEFENCE") && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <label className="space-y-1">
                                    <span className="text-[11px] text-zinc-500">Mode</span>
                                    <select
                                      disabled={readOnly}
                                      value={attackMode || "PHYSICAL"}
                                      title={ATTACK_MODE_TOOLTIPS[getAttackModeKey(attackMode || "PHYSICAL")]}
                                      onChange={(e) =>
                                        setPowerIntentionDetails(setEditor, i, j, {
                                          attackMode: e.target.value,
                                          ...(it.type === "ATTACK" ? { damageTypes: [] } : {}),
                                        })
                                      }
                                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                    >
                                      {ATTACK_MODES.map((mode) => (
                                        <option
                                          key={mode}
                                          value={mode}
                                          title={ATTACK_MODE_TOOLTIPS[mode]}
                                        >
                                          {ATTACK_MODE_LABELS[mode]}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  {it.type === "ATTACK" && (
                                    <div className="space-y-1">
                                      <span className="text-[11px] text-zinc-500">Damage Types</span>
                                      <div className="flex flex-wrap gap-2">
                                        {availableDamageTypes.map((dt) => {
                                          const selected = dmgTypes.some(
                                            (x) => String(x).toLowerCase() === dt.name.toLowerCase(),
                                          );
                                          return (
                                            <button
                                              key={dt.id}
                                              type="button"
                                              disabled={readOnly}
                                              onClick={() =>
                                                setPowerIntentionDetails(setEditor, i, j, {
                                                  damageTypes: toggleStringInArray(dmgTypes, dt.name),
                                                })
                                              }
                                              className={[
                                                "rounded border px-2 py-1 text-xs",
                                                selected
                                                  ? "border-emerald-600 bg-emerald-950/30 text-emerald-100"
                                                  : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800",
                                                readOnly ? "opacity-60 cursor-not-allowed" : "",
                                              ].join(" ")}
                                            >
                                              {dt.name}
                                            </button>
                                          );
                                        })}
                                        {picklists.damageTypes.length === 0 && (
                                          <p className="text-xs text-zinc-500">No damage types loaded.</p>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-zinc-600">
                                        Uses Forge damage type list (filtered by mode).
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {it.type === "CONTROL" && (
                                <label className="space-y-1 block">
                                  <span className="text-[11px] text-zinc-500">Control Mode</span>
                                  <select
                                    disabled={readOnly}
                                    value={controlMode}
                                    onChange={(e) =>
                                      setPowerIntentionDetails(setEditor, i, j, { controlMode: e.target.value })
                                    }
                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                  >
                                    <option value="">Select...</option>
                                    {CONTROL_MODES.map((mode) => (
                                      <option key={mode} value={mode}>
                                        {mode}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}

                              {it.type === "CLEANSE" && (
                                <label className="space-y-1 block">
                                  <span className="text-[11px] text-zinc-500">Cleanse Effect</span>
                                  <select
                                    disabled={readOnly}
                                    value={cleanseEffectType}
                                    onChange={(e) =>
                                      setPowerIntentionDetails(setEditor, i, j, { cleanseEffectType: e.target.value })
                                    }
                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                  >
                                    <option value="">Select...</option>
                                    {CLEANSE_EFFECTS.map((effect) => (
                                      <option key={effect} value={effect}>
                                        {effect}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}

                              {it.type === "MOVEMENT" && (
                                <label className="space-y-1 block">
                                  <span className="text-[11px] text-zinc-500">Movement Type</span>
                                  <select
                                    disabled={readOnly}
                                    value={movementMode}
                                    onChange={(e) =>
                                      setPowerIntentionDetails(setEditor, i, j, { movementMode: e.target.value })
                                    }
                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                  >
                                    <option value="">Select...</option>
                                    {MOVEMENT_MODES.map((mode) => (
                                      <option key={mode} value={mode}>
                                        {mode}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}

                              {(it.type === "AUGMENT" || it.type === "DEBUFF") && (
                                <label className="space-y-1 block">
                                  <span className="text-[11px] text-zinc-500">
                                    {it.type === "AUGMENT" ? "Augment Stat" : "Debuff Stat"}
                                  </span>
                                  <select
                                    disabled={readOnly}
                                    value={statTarget}
                                    onChange={(e) =>
                                      setPowerIntentionDetails(setEditor, i, j, { statTarget: e.target.value })
                                    }
                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                  >
                                    <option value="">Select...</option>
                                    {AUGMENT_DEBUFF_STATS.map((stat) => (
                                      <option key={stat} value={stat}>
                                        {stat}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}

                              {it.type === "HEALING" && (
                                <label className="space-y-1 block">
                                  <span className="text-[11px] text-zinc-500">Healing Mode</span>
                                  <select
                                    disabled={readOnly}
                                    value={String((it.detailsJson ?? {}).healingMode ?? "PHYSICAL")}
                                    onChange={(e) =>
                                      setPowerIntentionDetails(setEditor, i, j, { healingMode: e.target.value })
                                    }
                                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                                  >
                                    <option value="PHYSICAL">Physical</option>
                                    <option value="MENTAL">Mental</option>
                                  </select>
                                </label>
                              )}

                              {(it.type === "SUMMON" || it.type === "TRANSFORMATION") && (
                                <p className="text-sm text-zinc-500">
                                  No specifics yet for {it.type}. (UI scaffold only.)
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {!readOnly && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i && x.intentions.length < 4
                                        ? {
                                            ...x,
                                            intentions: [
                                              ...x.intentions,
                                              {
                                                sortOrder: x.intentions.length,
                                                type: "ATTACK",
                                                detailsJson: defaultDetailsForIntentionType("ATTACK"),
                                              },
                                            ],
                                          }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                        >
                          Add Intention
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="order-3 space-y-2 pt-2">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Range</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {POWER_RANGE_CATEGORIES.map((category) => {
                        const selected = powerRangeState.category === category;
                        return (
                          <button
                            key={category}
                            type="button"
                            disabled={readOnly}
                            onClick={() => {
                              const patchByCategory: Record<PowerRangeCategory, Record<string, unknown>> = {
                                SELF: {
                                  rangeCategory: "SELF",
                                  rangeValue: 0,
                                  rangeExtra: {},
                                },
                                MELEE: {
                                  rangeCategory: "MELEE",
                                  rangeValue: powerRangeState.meleeTargets,
                                  rangeExtra: {},
                                },
                                RANGED: {
                                  rangeCategory: "RANGED",
                                  rangeValue: powerRangeState.rangedDistanceFeet,
                                  rangeExtra: { targets: powerRangeState.rangedTargets },
                                },
                                AOE: {
                                  rangeCategory: "AOE",
                                  rangeValue: powerRangeState.aoeCenterRangeFeet,
                                  rangeExtra: {
                                    count: powerRangeState.aoeCount,
                                    shape: powerRangeState.aoeShape,
                                    sphereRadiusFeet: powerRangeState.aoeSphereRadiusFeet,
                                    coneLengthFeet: powerRangeState.aoeConeLengthFeet,
                                    lineWidthFeet: powerRangeState.aoeLineWidthFeet,
                                    lineLengthFeet: powerRangeState.aoeLineLengthFeet,
                                  },
                                },
                              };
                              setPowerCanonicalIntentionDetails(setEditor, i, patchByCategory[category]);
                            }}
                            className={[
                              "px-2 py-1 rounded-full border",
                              selected
                                ? "border-emerald-500 bg-emerald-600/20 text-emerald-200"
                                : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500",
                              readOnly ? "opacity-60 cursor-not-allowed hover:border-zinc-700" : "",
                            ].join(" ")}
                          >
                            {category}
                          </button>
                        );
                      })}
                    </div>

                    {powerRangeState.category === "SELF" && (
                      <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
                        Self range. This power is expected to affect only the user.
                      </div>
                    )}

                    {powerRangeState.category === "MELEE" && (
                      <div className="space-y-1">
                        <label className="block text-[11px] text-zinc-500">Melee Targets</label>
                        <select
                          disabled={readOnly}
                          value={powerRangeState.meleeTargets}
                          onChange={(e) =>
                            setPowerCanonicalIntentionDetails(setEditor, i, {
                              rangeCategory: "MELEE",
                              rangeValue: Number(e.target.value),
                              rangeExtra: {},
                            })
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm disabled:opacity-60"
                        >
                          {POWER_RANGE_TARGET_OPTIONS.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {powerRangeState.category === "RANGED" && (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="block text-[11px] text-zinc-500">Ranged Distance (ft)</label>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {POWER_RANGE_RANGED_DISTANCE_OPTIONS.map((distance) => (
                              <label key={distance} className="inline-flex items-center gap-1">
                                <input
                                  disabled={readOnly}
                                  type="radio"
                                  className="h-3 w-3 rounded border-zinc-600 bg-zinc-900"
                                  value={distance}
                                  checked={powerRangeState.rangedDistanceFeet === distance}
                                  onChange={() =>
                                    setPowerCanonicalIntentionDetails(setEditor, i, {
                                      rangeCategory: "RANGED",
                                      rangeValue: distance,
                                      rangeExtra: { ...powerRangeState.rangeExtra, targets: powerRangeState.rangedTargets },
                                    })
                                  }
                                />
                                <span>{distance}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] text-zinc-500">Ranged Targets</label>
                          <select
                            disabled={readOnly}
                            value={powerRangeState.rangedTargets}
                            onChange={(e) =>
                              setPowerCanonicalIntentionDetails(setEditor, i, {
                                rangeCategory: "RANGED",
                                rangeValue: powerRangeState.rangedDistanceFeet,
                                rangeExtra: { ...powerRangeState.rangeExtra, targets: Number(e.target.value) },
                              })
                            }
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm disabled:opacity-60"
                          >
                            {POWER_RANGE_TARGET_OPTIONS.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {powerRangeState.category === "AOE" && (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="block text-[11px] text-zinc-500">AoE Cast Range (ft)</label>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {POWER_RANGE_AOE_CENTER_RANGE_OPTIONS.map((distance) => (
                              <label key={distance} className="inline-flex items-center gap-1">
                                <input
                                  disabled={readOnly}
                                  type="radio"
                                  className="h-3 w-3 rounded border-zinc-600 bg-zinc-900"
                                  value={distance}
                                  checked={powerRangeState.aoeCenterRangeFeet === distance}
                                  onChange={() =>
                                    setPowerCanonicalIntentionDetails(setEditor, i, {
                                      rangeCategory: "AOE",
                                      rangeValue: distance,
                                      rangeExtra: {
                                        ...powerRangeState.rangeExtra,
                                        count: powerRangeState.aoeCount,
                                        shape: powerRangeState.aoeShape,
                                        sphereRadiusFeet: powerRangeState.aoeSphereRadiusFeet,
                                        coneLengthFeet: powerRangeState.aoeConeLengthFeet,
                                        lineWidthFeet: powerRangeState.aoeLineWidthFeet,
                                        lineLengthFeet: powerRangeState.aoeLineLengthFeet,
                                      },
                                    })
                                  }
                                />
                                <span>{distance}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <label className="space-y-1">
                            <span className="block text-[11px] text-zinc-500">AoE Count</span>
                            <select
                              disabled={readOnly}
                              value={powerRangeState.aoeCount}
                              onChange={(e) =>
                                setPowerCanonicalIntentionDetails(setEditor, i, {
                                  rangeCategory: "AOE",
                                  rangeValue: powerRangeState.aoeCenterRangeFeet,
                                  rangeExtra: {
                                    ...powerRangeState.rangeExtra,
                                    count: Number(e.target.value),
                                    shape: powerRangeState.aoeShape,
                                    sphereRadiusFeet: powerRangeState.aoeSphereRadiusFeet,
                                    coneLengthFeet: powerRangeState.aoeConeLengthFeet,
                                    lineWidthFeet: powerRangeState.aoeLineWidthFeet,
                                    lineLengthFeet: powerRangeState.aoeLineLengthFeet,
                                  },
                                })
                              }
                              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm disabled:opacity-60"
                            >
                              {POWER_RANGE_TARGET_OPTIONS.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="block text-[11px] text-zinc-500">AoE Shape</span>
                            <select
                              disabled={readOnly}
                              value={powerRangeState.aoeShape}
                              onChange={(e) => {
                                const nextShape = e.target.value as PowerRangeAoeShape;
                                const nextSphereRadiusFeet = clampToOptions(
                                  powerRangeState.aoeSphereRadiusFeet,
                                  POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS,
                                  10,
                                );
                                const nextConeLengthFeet = clampToOptions(
                                  powerRangeState.aoeConeLengthFeet,
                                  POWER_RANGE_AOE_CONE_LENGTH_OPTIONS,
                                  15,
                                );
                                const nextLineWidthFeet = clampToOptions(
                                  powerRangeState.aoeLineWidthFeet,
                                  POWER_RANGE_AOE_LINE_WIDTH_OPTIONS,
                                  5,
                                );
                                const nextLineLengthFeet = clampToOptions(
                                  powerRangeState.aoeLineLengthFeet,
                                  POWER_RANGE_AOE_LINE_LENGTH_OPTIONS,
                                  30,
                                );

                                setPowerCanonicalIntentionDetails(setEditor, i, {
                                  rangeCategory: "AOE",
                                  rangeValue: powerRangeState.aoeCenterRangeFeet,
                                  rangeExtra: {
                                    ...powerRangeState.rangeExtra,
                                    count: powerRangeState.aoeCount,
                                    shape: nextShape,
                                    sphereRadiusFeet: nextSphereRadiusFeet,
                                    coneLengthFeet: nextConeLengthFeet,
                                    lineWidthFeet: nextLineWidthFeet,
                                    lineLengthFeet: nextLineLengthFeet,
                                  },
                                });
                              }}
                              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm disabled:opacity-60"
                            >
                              {POWER_RANGE_AOE_SHAPES.map((shape) => (
                                <option key={shape} value={shape}>
                                  {shape}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {powerRangeState.aoeShape === "SPHERE" && (
                          <div className="space-y-1">
                            <label className="block text-[11px] text-zinc-500">Sphere Radius (ft)</label>
                            <select
                              disabled={readOnly}
                              value={powerRangeState.aoeSphereRadiusFeet}
                              onChange={(e) =>
                                setPowerCanonicalIntentionDetails(setEditor, i, {
                                  rangeCategory: "AOE",
                                  rangeValue: powerRangeState.aoeCenterRangeFeet,
                                  rangeExtra: {
                                    ...powerRangeState.rangeExtra,
                                    count: powerRangeState.aoeCount,
                                    shape: powerRangeState.aoeShape,
                                    sphereRadiusFeet: Number(e.target.value),
                                    coneLengthFeet: powerRangeState.aoeConeLengthFeet,
                                    lineWidthFeet: powerRangeState.aoeLineWidthFeet,
                                    lineLengthFeet: powerRangeState.aoeLineLengthFeet,
                                  },
                                })
                              }
                              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm disabled:opacity-60"
                            >
                              {POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {powerRangeState.aoeShape === "CONE" && (
                          <div className="space-y-1">
                            <label className="block text-[11px] text-zinc-500">Cone Length (ft)</label>
                            <select
                              disabled={readOnly}
                              value={powerRangeState.aoeConeLengthFeet}
                              onChange={(e) =>
                                setPowerCanonicalIntentionDetails(setEditor, i, {
                                  rangeCategory: "AOE",
                                  rangeValue: powerRangeState.aoeCenterRangeFeet,
                                  rangeExtra: {
                                    ...powerRangeState.rangeExtra,
                                    count: powerRangeState.aoeCount,
                                    shape: powerRangeState.aoeShape,
                                    sphereRadiusFeet: powerRangeState.aoeSphereRadiusFeet,
                                    coneLengthFeet: Number(e.target.value),
                                    lineWidthFeet: powerRangeState.aoeLineWidthFeet,
                                    lineLengthFeet: powerRangeState.aoeLineLengthFeet,
                                  },
                                })
                              }
                              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm disabled:opacity-60"
                            >
                              {POWER_RANGE_AOE_CONE_LENGTH_OPTIONS.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {powerRangeState.aoeShape === "LINE" && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <label className="space-y-1">
                              <span className="block text-[11px] text-zinc-500">Line Width (ft)</span>
                              <select
                                disabled={readOnly}
                                value={powerRangeState.aoeLineWidthFeet}
                                onChange={(e) =>
                                  setPowerCanonicalIntentionDetails(setEditor, i, {
                                    rangeCategory: "AOE",
                                    rangeValue: powerRangeState.aoeCenterRangeFeet,
                                    rangeExtra: {
                                      ...powerRangeState.rangeExtra,
                                      count: powerRangeState.aoeCount,
                                      shape: powerRangeState.aoeShape,
                                      sphereRadiusFeet: powerRangeState.aoeSphereRadiusFeet,
                                      coneLengthFeet: powerRangeState.aoeConeLengthFeet,
                                      lineWidthFeet: Number(e.target.value),
                                      lineLengthFeet: powerRangeState.aoeLineLengthFeet,
                                    },
                                  })
                                }
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm disabled:opacity-60"
                              >
                                {POWER_RANGE_AOE_LINE_WIDTH_OPTIONS.map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="block text-[11px] text-zinc-500">Line Length (ft)</span>
                              <select
                                disabled={readOnly}
                                value={powerRangeState.aoeLineLengthFeet}
                                onChange={(e) =>
                                  setPowerCanonicalIntentionDetails(setEditor, i, {
                                    rangeCategory: "AOE",
                                    rangeValue: powerRangeState.aoeCenterRangeFeet,
                                    rangeExtra: {
                                      ...powerRangeState.rangeExtra,
                                      count: powerRangeState.aoeCount,
                                      shape: powerRangeState.aoeShape,
                                      sphereRadiusFeet: powerRangeState.aoeSphereRadiusFeet,
                                      coneLengthFeet: powerRangeState.aoeConeLengthFeet,
                                      lineWidthFeet: powerRangeState.aoeLineWidthFeet,
                                      lineLengthFeet: Number(e.target.value),
                                    },
                                  })
                                }
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm disabled:opacity-60"
                              >
                                {POWER_RANGE_AOE_LINE_LENGTH_OPTIONS.map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    {!powerRangeState.category && (
                      <p className="text-sm text-zinc-500">Select a range category.</p>
                    )}
                  </div>
                  <div className="order-4 space-y-2 pt-2">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Timing</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Duration</span>
                        <select
                          disabled={readOnly}
                          value={power.durationType}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i
                                        ? {
                                            ...x,
                                            durationType: e.target.value as MonsterPower["durationType"],
                                            durationTurns: e.target.value === "TURNS" ? x.durationTurns ?? 1 : null,
                                          }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        >
                          <option value="INSTANT">Instant</option>
                          <option value="UNTIL_TARGET_NEXT_TURN">Until target&apos;s next turn</option>
                          <option value="TURNS">Turns</option>
                          <option value="PASSIVE">Passive</option>
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Duration (Turns)</span>
                        <input
                          disabled={readOnly || power.durationType !== "TURNS"}
                          type="number"
                          min={1}
                          max={4}
                          value={Number(power.durationTurns ?? 1)}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i
                                        ? { ...x, durationTurns: Math.max(1, Math.min(4, Number(e.target.value || 1))) }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm disabled:opacity-50"
                        />
                      </label>

                      <label className="flex items-center gap-2 text-sm text-zinc-300 pt-5">
                        <input
                          disabled={readOnly}
                          type="checkbox"
                          checked={power.responseRequired}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i ? { ...x, responseRequired: e.target.checked } : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                        />
                        Response
                      </label>
                    </div>
                  </div>

                  <div className="order-5 space-y-2 pt-2">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Tuning</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Dice Count</span>
                        <select
                          disabled={readOnly}
                          value={String(clampToOptions(Number(power.diceCount), DICE_COUNT_OPTIONS, 1))}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i
                                        ? {
                                            ...x,
                                            diceCount: Number(e.target.value),
                                          }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        >
                          {DICE_COUNT_OPTIONS.map((v) => (
                            <option key={v} value={String(v)}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Potency</span>
                        <select
                          disabled={readOnly}
                          value={String(clampToOptions(Number(power.potency), POTENCY_OPTIONS, 1))}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) =>
                                      idx === i
                                        ? { ...x, potency: Number(e.target.value) }
                                        : x,
                                    ),
                                  }
                                : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        >
                          {POTENCY_OPTIONS.map((v) => (
                            <option key={v} value={String(v)}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Cooldown (Turns)</span>
                        <input
                          disabled={readOnly}
                          type="number"
                          min={1}
                          value={power.cooldownTurns}
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    powers: p.powers.map((x, idx) => {
                                      if (idx !== i) return x;
                                      const cd = Math.max(1, Number(e.target.value || 1));
                                      return {
                                        ...x,
                                        cooldownTurns: cd,
                                        cooldownReduction: Math.min(x.cooldownReduction, cd - 1),
                                      };
                                    }),
                                  }
                                : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Cooldown Reduction (Coming soon)</span>
                        <input
                          disabled
                          type="number"
                          value={power.cooldownReduction}
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm opacity-60 cursor-not-allowed"
                        />
                      </label>
                    </div>
                  </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {editor.legendary && (
          <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs uppercase tracking-wide text-zinc-400">Custom Limit Breaks</h3>
              {!readOnly && !limitBreak2Enabled && (
                <button
                  type="button"
                  onClick={() => {
                    setEditor((p) =>
                      p
                        ? {
                            ...p,
                            limitBreak2Name: p.limitBreak2Name ?? "New Limit Break",
                          }
                        : p,
                    );
                    setCollapsedLimitBreaks((prev) => ({ ...prev, LB2: false }));
                  }}
                  className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                >
                  Add Limit Break
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div className="rounded border border-zinc-800 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleLimitBreakCollapsed("LB1")}
                    className="w-full flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 hover:bg-zinc-900/40 cursor-pointer select-none text-left"
                    aria-expanded={!collapsedLimitBreaks.LB1}
                  >
                    <span className="min-w-0 truncate text-sm font-medium">
                      <span className="mr-2" aria-hidden="true">
                        {collapsedLimitBreaks.LB1 ? "▶" : "▼"}
                      </span>
                      {(editor.limitBreakName ?? "").trim() || "Unnamed"}
                    </span>
                    {collapsedLimitBreaks.LB1 && (
                      <span className="text-[11px] text-zinc-600">
                        {hasLimitBreak1 ? "Configured" : "Not configured"}
                      </span>
                    )}
                  </button>
                </div>

                {!collapsedLimitBreaks.LB1 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="space-y-1 md:col-span-2">
                <span className="text-[11px] text-zinc-500">Name</span>
                <input
                  disabled={readOnly}
                  value={editor.limitBreakName ?? ""}
                  onChange={(e) =>
                    setEditor((p) =>
                      p ? { ...p, limitBreakName: asNullableDraftText(e.target.value) } : p,
                    )
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-zinc-500">Tier</span>
                <select
                  disabled={readOnly}
                  value={editor.limitBreakTier ?? ""}
                  title={
                    editor.limitBreakTier
                      ? LIMIT_BREAK_TIER_TOOLTIPS[editor.limitBreakTier]
                      : ""
                  }
                  onChange={(e) =>
                    setEditor((p) =>
                      p
                        ? {
                            ...p,
                            limitBreakTier:
                              e.target.value === "PUSH" ||
                              e.target.value === "BREAK" ||
                              e.target.value === "TRANSCEND"
                                ? (e.target.value as LimitBreakTier)
                                : null,
                          }
                        : p,
                    )
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                >
                  <option value="">None</option>
                  {LIMIT_BREAK_TIER_OPTIONS.map((tier) => (
                    <option
                      key={tier}
                      value={tier}
                      title={LIMIT_BREAK_TIER_TOOLTIPS[tier]}
                    >
                      {LIMIT_BREAK_TIER_LABELS[tier]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-zinc-500">Attribute</span>
                <select
                  disabled={readOnly}
                  value={editor.limitBreakAttribute ?? ""}
                  title={
                    editor.limitBreakAttribute
                      ? CORE_ATTRIBUTE_OPTION_TOOLTIPS[editor.limitBreakAttribute]
                      : ""
                  }
                  onChange={(e) =>
                    setEditor((p) =>
                      p
                        ? {
                            ...p,
                            limitBreakAttribute:
                              e.target.value === "ATTACK" ||
                              e.target.value === "DEFENCE" ||
                              e.target.value === "FORTITUDE" ||
                              e.target.value === "INTELLECT" ||
                              e.target.value === "SUPPORT" ||
                              e.target.value === "BRAVERY"
                                ? (e.target.value as CoreAttribute)
                                : null,
                          }
                        : p,
                    )
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                >
                  <option value="">None</option>
                  {CORE_ATTRIBUTE_OPTIONS.map((attribute) => (
                    <option
                      key={attribute}
                      value={attribute}
                      title={CORE_ATTRIBUTE_OPTION_TOOLTIPS[attribute]}
                    >
                      {CORE_ATTRIBUTE_LABELS[attribute]}
                    </option>
                  ))}
                </select>
              </label>

              <p className="md:col-span-2 text-sm text-zinc-300">
                Threshold: {customLimitBreakThresholdRequired === null ? "--" : `${customLimitBreakThresholdRequired} successes`}
              </p>

              <label className="space-y-1 md:col-span-2">
                <span className="text-[11px] text-zinc-500">Trigger</span>
                <textarea
                  disabled={readOnly}
                  rows={2}
                  value={editor.limitBreakTriggerText ?? ""}
                  onChange={(e) =>
                    setEditor((p) =>
                      p
                        ? { ...p, limitBreakTriggerText: asNullableDraftText(e.target.value) }
                        : p,
                    )
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-[11px] text-zinc-500">Cost</span>
                <textarea
                  disabled={readOnly}
                  rows={2}
                  value={editor.limitBreakCostText ?? ""}
                  onChange={(e) =>
                    setEditor((p) =>
                      p
                        ? { ...p, limitBreakCostText: asNullableDraftText(e.target.value) }
                        : p,
                    )
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-[11px] text-zinc-500">Effect</span>
                <textarea
                  disabled={readOnly}
                  rows={3}
                  value={editor.limitBreakEffectText ?? ""}
                  onChange={(e) =>
                    setEditor((p) =>
                      p
                        ? { ...p, limitBreakEffectText: asNullableDraftText(e.target.value) }
                        : p,
                    )
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                />
              </label>
                  </div>
                )}
              </div>

              {limitBreak2Enabled && (
                <div className="rounded border border-zinc-800 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleLimitBreakCollapsed("LB2")}
                      className="w-full flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 hover:bg-zinc-900/40 cursor-pointer select-none text-left"
                      aria-expanded={!collapsedLimitBreaks.LB2}
                    >
                      <span className="min-w-0 truncate text-sm font-medium">
                        <span className="mr-2" aria-hidden="true">
                          {collapsedLimitBreaks.LB2 ? "▶" : "▼"}
                        </span>
                        {(editor.limitBreak2Name ?? "").trim() || "Unnamed"}
                      </span>
                      {collapsedLimitBreaks.LB2 && (
                        <span className="text-[11px] text-zinc-600">Configured</span>
                      )}
                    </button>

                    {!readOnly && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!window.confirm("Remove limit break 2? This cannot be undone.")) return;
                          clearLimitBreak2(setEditor);
                          setCollapsedLimitBreaks((prev) => ({ ...prev, LB2: true }));
                        }}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 shrink-0"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {!collapsedLimitBreaks.LB2 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <label className="space-y-1 md:col-span-2">
                        <span className="text-[11px] text-zinc-500">Name</span>
                        <input
                          disabled={readOnly}
                          value={editor.limitBreak2Name ?? ""}
                          onChange={(e) =>
                            setEditor((p) =>
                              p ? { ...p, limitBreak2Name: asNullableDraftText(e.target.value) } : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Tier</span>
                        <select
                          disabled={readOnly}
                          value={editor.limitBreak2Tier ?? ""}
                          title={
                            editor.limitBreak2Tier
                              ? LIMIT_BREAK_TIER_TOOLTIPS[editor.limitBreak2Tier]
                              : ""
                          }
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    limitBreak2Tier:
                                      e.target.value === "PUSH" ||
                                      e.target.value === "BREAK" ||
                                      e.target.value === "TRANSCEND"
                                        ? (e.target.value as LimitBreakTier)
                                        : null,
                                  }
                                : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        >
                          <option value="">None</option>
                          {LIMIT_BREAK_TIER_OPTIONS.map((tier) => (
                            <option
                              key={tier}
                              value={tier}
                              title={LIMIT_BREAK_TIER_TOOLTIPS[tier]}
                            >
                              {LIMIT_BREAK_TIER_LABELS[tier]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] text-zinc-500">Attribute</span>
                        <select
                          disabled={readOnly}
                          value={editor.limitBreak2Attribute ?? ""}
                          title={
                            editor.limitBreak2Attribute
                              ? CORE_ATTRIBUTE_OPTION_TOOLTIPS[editor.limitBreak2Attribute]
                              : ""
                          }
                          onChange={(e) =>
                            setEditor((p) =>
                              p
                                ? {
                                    ...p,
                                    limitBreak2Attribute:
                                      e.target.value === "ATTACK" ||
                                      e.target.value === "DEFENCE" ||
                                      e.target.value === "FORTITUDE" ||
                                      e.target.value === "INTELLECT" ||
                                      e.target.value === "SUPPORT" ||
                                      e.target.value === "BRAVERY"
                                        ? (e.target.value as CoreAttribute)
                                        : null,
                                  }
                                : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        >
                          <option value="">None</option>
                          {CORE_ATTRIBUTE_OPTIONS.map((attribute) => (
                            <option
                              key={attribute}
                              value={attribute}
                              title={CORE_ATTRIBUTE_OPTION_TOOLTIPS[attribute]}
                            >
                              {CORE_ATTRIBUTE_LABELS[attribute]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <p className="md:col-span-2 text-sm text-zinc-300">
                        Threshold: {customLimitBreak2ThresholdRequired === null ? "--" : `${customLimitBreak2ThresholdRequired} successes`}
                      </p>

                      <label className="space-y-1 md:col-span-2">
                        <span className="text-[11px] text-zinc-500">Trigger</span>
                        <textarea
                          disabled={readOnly}
                          rows={2}
                          value={editor.limitBreak2TriggerText ?? ""}
                          onChange={(e) =>
                            setEditor((p) =>
                              p ? { ...p, limitBreak2TriggerText: asNullableDraftText(e.target.value) } : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                      </label>

                      <label className="space-y-1 md:col-span-2">
                        <span className="text-[11px] text-zinc-500">Cost</span>
                        <textarea
                          disabled={readOnly}
                          rows={2}
                          value={editor.limitBreak2CostText ?? ""}
                          onChange={(e) =>
                            setEditor((p) =>
                              p ? { ...p, limitBreak2CostText: asNullableDraftText(e.target.value) } : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                      </label>

                      <label className="space-y-1 md:col-span-2">
                        <span className="text-[11px] text-zinc-500">Effect</span>
                        <textarea
                          disabled={readOnly}
                          rows={3}
                          value={editor.limitBreak2EffectText ?? ""}
                          onChange={(e) =>
                            setEditor((p) =>
                              p ? { ...p, limitBreak2EffectText: asNullableDraftText(e.target.value) } : p,
                            )
                          }
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4 space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Custom Attributes</h3>
          <textarea
            disabled={readOnly}
            rows={3}
            value={editor.customNotes ?? ""}
            onChange={(e) => setEditor((p) => (p ? { ...p, customNotes: e.target.value || null } : p))}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
          />
        </section>
          </div>

          <div className={`${previewMobileVisibility} lg:block lg:sticky lg:top-4 self-start space-y-3 min-w-0 w-full`}>
            <MonsterCalculatorPanel
              profile={outcomeProfile}
              archetype={calculatorArchetype}
              onArchetypeChangeAction={setCalculatorArchetype}
            />
            <section className="sc-print rounded border border-zinc-800 bg-zinc-900/30 p-4 space-y-3 min-w-0 w-full">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Monster Block Preview</h3>
                <label className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400">Layout</span>
                  <select
                    value={previewPrintLayout}
                    onChange={(e) => setPreviewPrintLayout(e.target.value as PrintLayoutMode)}
                    className="rounded border border-zinc-700 bg-zinc-950/40 px-2 py-1 text-xs"
                  >
                    <option value="COMPACT_1P">1 Page - Compact</option>
                    <option value="LEGENDARY_2P">2 Page - Legendary Layout</option>
                  </select>
                </label>
              </div>

              <div
                ref={previewScaleWrapRef}
                className="sc-print-preview-wrap w-full max-w-full"
                style={{
                  width: "100%",
                  overflowX: "hidden",
                  maxWidth: "100%",
                  height: previewHeight ? `${previewHeight}px` : undefined,
                }}
              >
                <div
                  ref={previewScaleInnerRef}
                  style={{
                    display: "inline-block",
                    width: "max-content",
                    maxWidth: "100%",
                    transformOrigin: "top left",
                    transform: `scale(${previewScale})`,
                  }}
                >
                  {previewMonster && previewPrintLayout === "COMPACT_1P" && (
                    <MonsterBlockCard
                      monster={previewMonster}
                      weaponById={weaponById}
                      isPrint
                      printLayout={previewPrintLayout}
                      printPage="COMPACT"
                      protectionTuning={protectionTuning}
                    />
                  )}

                  {previewMonster && previewPrintLayout === "LEGENDARY_2P" && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Page 1 - Main Action</p>
                        <MonsterBlockCard
                          monster={previewMonster}
                          weaponById={weaponById}
                          isPrint
                          printLayout={previewPrintLayout}
                          printPage="PAGE1_MAIN"
                          protectionTuning={protectionTuning}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Page 2 - Power Action</p>
                        <MonsterBlockCard
                          monster={previewMonster}
                          weaponById={weaponById}
                          isPrint
                          printLayout={previewPrintLayout}
                          printPage="PAGE2_POWER"
                          protectionTuning={protectionTuning}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
        {/* Manual test checklist:
            - Click input: dropdown opens, shows all results
            - Click Filters: panel opens, selecting level chips reduces list
            - Tier chips reduce list (SC only)
            - Exclude Legendary hides legendaries
            - Clear resets and list returns
            - Closing/opening dropdown does not reset selections
            - Switching campaignId resets filters
            - Applying filters shows pills immediately
            - Clicking x on a pill removes only that filter
            - Result count updates live with search/filters
            - Recently used appears only when query is empty
            - Recently used selection behaves like normal selection
            - localStorage failures do not crash the picker
        */}
    </div>
  );
}
