'use client';

import { useState, useEffect, useMemo, useRef, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';

import type {
  ItemRarity,
  ItemType,
  WeaponSize,
  AoEShape,
  RangeCategory,
  ArmorLocation,
  ItemLocation,
  VRPEffectKind,
} from '../../../lib/forge/types';

import { useForgePicklists } from '../../../lib/forge/useForgePicklists';
import type {
  DamageType,
  AttackEffect,
  DefEffect,
  WeaponAttribute,
  ArmorAttribute,
  ShieldAttribute,
  WardingOption,
  SanctifiedOption,
  ForgeConfigEntry,
} from '../../../lib/forge/useForgePicklists';

import { useForgeItems, type ForgeItemSummary } from '../../../lib/forge/useForgeItems';
import { buildDescriptorResult } from '@/lib/descriptors/descriptorEngine';
import { renderForgeResult } from '@/lib/descriptors/renderers/forgeRenderer';

type LoadedItem = {
  id: string;
  name: string | null;
  type: string | null;
  rarity: string | null;
  level: number | null;
  generalDescription: string | null;
  tags?: string[];

  // VRP stored in ItemTemplateVRPEntry table
  vrpEntries?: Array<{
    effectKind: VRPEffectKind;
    magnitude: number;
    damageTypeId: number;
  }>;
  mythicLbPushTemplateId?: string | null;
  mythicLbBreakTemplateId?: string | null;
  mythicLbTranscendTemplateId?: string | null;
};

type LimitBreakTier = 'PUSH' | 'BREAK' | 'TRANSCEND';
type MythicItemType = 'WEAPON' | 'ARMOR' | 'SHIELD' | 'ITEM';

type MythicLimitBreakTemplateRow = {
  id: string;
  name: string;
  tier: LimitBreakTier;
  itemType: string | null;
  thresholdPercent: number;
  description: string | null;
  baseCostKey: string | null;
  successEffectKey: string | null;
  failForwardEnabled: boolean;
  failForwardEffectKey: string | null;
  failForwardCostAKey: string | null;
  failForwardCostBKey: string | null;
  isPersistent: boolean;
  persistentStateText: string | null;
  endConditionText: string | null;
  endCostText: string | null;
};

function normalizeOptionalId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function deriveSelectedMythicLimitBreakId(value: {
  mythicLbPushTemplateId?: string | null;
  mythicLbBreakTemplateId?: string | null;
  mythicLbTranscendTemplateId?: string | null;
}): string | null {
  // Legacy bad states can have multiple set. Prefer highest tier.
  return (
    normalizeOptionalId(value.mythicLbTranscendTemplateId) ??
    normalizeOptionalId(value.mythicLbBreakTemplateId) ??
    normalizeOptionalId(value.mythicLbPushTemplateId) ??
    null
  );
}

type TagSuggestion = {
  value: string;
  source: 'global' | 'campaign';
};
const PICKER_LEVEL_OPTIONS = Array.from({ length: 20 }, (_, idx) => idx + 1);
const MAX_RECENT_PICKER_ITEMS = 5;

function listFromCsv(value: string): string[] {
  return value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function formatNumberRanges(values: number[]): string {
  if (values.length === 0) return '';
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
    .join(', ');
}

function tokenFromTagInput(value: string): string {
  const parts = value.split(',');
  return parts[parts.length - 1]?.trim() ?? '';
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

function itemMatches(row: ForgeItemSummary, q: string): boolean {
  const query = normalizeSearch(q);
  if (!query) return true;

  const name = String(row.name ?? '').toLowerCase();
  if (name.includes(query)) return true;

  return row.tags.some((tag) => String(tag).toLowerCase().includes(query));
}

function isLegendaryItem(row: ForgeItemSummary): boolean {
  return String(row.rarity ?? '').trim().toLowerCase() === 'legendary';
}
// DamageType.name → allowed AttackEffect.name[]
const DAMAGE_TYPE_TO_EFFECT_NAMES: Record<string, string[]> = {
  blunt: ['Impact'],
  slashing: ['Laceration'],
  fire: ['Immolate'],
  holy: ['Smite'],
  ice: ['Freeze'],
  lightning: ['Surge'],
  necrotic: ['Disease'],
  poison: ['Poisoned'],
  psychic: ['Overwhelmed'],
  piercing: ['Penetrate'],
  fear: ['Horrified'],
};

function getDamageTypeMode(dt: any): 'PHYSICAL' | 'MENTAL' {
  const raw = (dt?.attackMode ?? dt?.damageMode ?? '').toString().trim().toUpperCase();
  return raw === 'MENTAL' ? 'MENTAL' : 'PHYSICAL'; // default PHYSICAL for backwards compat
}

function normaliseName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

function filterAttackEffectsForDamageTypes(
  allEffects: AttackEffect[],
  allDamageTypes: DamageType[],
  selectedDamageTypeIds: number[],
): AttackEffect[] {
  if (!selectedDamageTypeIds.length) return [];

  // Map damageTypeId → name
  const damageTypeNameById = new Map<number, string>();
  for (const dt of allDamageTypes) {
    damageTypeNameById.set(dt.id, dt.name);
  }

  // Collect allowed effect names based on selected damage types
  const allowedEffectNames = new Set<string>();
  for (const dtId of selectedDamageTypeIds) {
    const dtName = damageTypeNameById.get(dtId);
    if (!dtName) continue;

    const key = normaliseName(dtName);
    const effectNames = DAMAGE_TYPE_TO_EFFECT_NAMES[key] ?? [];
    for (const effName of effectNames) {
      allowedEffectNames.add(normaliseName(effName));
    }
  }

  if (!allowedEffectNames.size) return [];

  // Only return attack effects whose names match one of the allowed names
  return allEffects.filter((fx) =>
    allowedEffectNames.has(normaliseName(fx.name)),
  );
}

const ITEM_TYPES: ItemType[] = [
  'WEAPON',
  'ARMOR',
  'SHIELD',
  'ITEM',
  'CONSUMABLE',
];
const ITEM_RARITIES: ItemRarity[] = [
  'COMMON',
  'UNCOMMON',
  'RARE',
  'LEGENDARY',
  'MYTHIC',
];

const WEAPON_SIZES: WeaponSize[] = ['SMALL', 'ONE_HANDED', 'TWO_HANDED'];
const SIZE_LABELS: Record<WeaponSize, string> = {
  SMALL: 'Small',
  ONE_HANDED: 'One Handed',
  TWO_HANDED: 'Two Handed',
};
const RANGE_CATEGORIES: RangeCategory[] = ['MELEE', 'RANGED', 'AOE'];
const AOE_SHAPES: AoEShape[] = ['SPHERE', 'CONE', 'LINE'];

type GlobalAttributeModifierForm = {
  attribute: string;
  amount: number;
};

type ForgeFormValues = {
  // Core
  name: string;
  rarity: ItemRarity;
  level: number;
  type: ItemType;
  generalDescription: string;
  itemUrl: string;
  globalAttributeModifiers: GlobalAttributeModifierForm[];

  // Weapon core
  size?: WeaponSize | null;
  shieldHasAttack?: boolean | null;

  // Per-range Strength (Physical / Mental)
  meleePhysicalStrength?: number | null;
  meleeMentalStrength?: number | null;
  rangedPhysicalStrength?: number | null;
  rangedMentalStrength?: number | null;
  aoePhysicalStrength?: number | null;
  aoeMentalStrength?: number | null;

  meleeTargets?: number | null;
  rangedTargets?: number | null;

  // Ranged / AoE geometry
  rangedDistanceFeet?: number | null;
  aoeCenterRangeFeet?: number | null;
  aoeCount?: number | null;
  aoeShape?: AoEShape | null;
  aoeSphereRadiusFeet?: number | null;
  aoeConeLengthFeet?: number | null;
  aoeLineWidthFeet?: number | null;
  aoeLineLengthFeet?: number | null;

  // Armor core
  armorLocation?: ArmorLocation | null;
  ppv?: number | null;
  mpv?: number | null;
  auraPhysical?: number | null;
  auraMental?: number | null;

  // Item core
  itemLocation?: ItemLocation | null;

  // Tags
  tags: string[];
  rangeCategories: RangeCategory[];

  meleeDamageTypeIds: number[];
  rangedDamageTypeIds: number[];
  aoeDamageTypeIds: number[];

  attackEffectMeleeIds: number[];
  attackEffectRangedIds: number[];
  attackEffectAoEIds: number[];

  weaponAttributeIds: number[];

  // Per-weapon-attribute strength source (keyed by weaponAttributeId as string)
  weaponAttributeStrengthSources: Record<
    string,
    'MELEE' | 'RANGED' | 'AOE' | null
  >;

  // Per-weapon-attribute chosen range for [ChosenRange] (keyed by weaponAttributeId as string)
  weaponAttributeRangeSelections: Record<
    string,
    'MELEE' | 'RANGED' | 'AOE' | null
  >;
  armorAttributeIds: number[];
  shieldAttributeIds: number[];
  defEffectIds: number[];
  wardingOptionIds: number[];
  sanctifiedOptionIds: number[];

  customWeaponAttributes?: string | null;
  customArmorAttributes?: string | null;
  customShieldAttributes?: string | null;
  customItemAttributes?: string | null;
  selectedMythicLimitBreakId?: string | null;
  mythicLbPushTemplateId?: string | null;
  mythicLbBreakTemplateId?: string | null;
  mythicLbTranscendTemplateId?: string | null;
};

type ForgeCostBreakdown = {
  targetCost: number;
  choiceCost: number;
  potencyCost: number;
  typeCost: number;
  gsCost: number;
  otherCost: number;

  // Derived for visual tuning (does not change spend math)
  attackBaseFactor: number;
  effectBase: number;
  attackStringCost: number;

  // What the calculator actually used as raw-spent
  rawSpent: number;
};

type ForgeCalculatorTotals = {
  totalFp: number;
  spentFp: number;
  remainingFp: number;
  percentSpent: number;
  multiplier: number;
};

type ForgeConfigRow = {
  category?: string | null;
  selector1?: string | null;
  selector2?: string | null;
  value?: number | null;
};

type ForgeCostRow = {
  category?: string | null;
  selector1?: string | null;
  selector2?: string | null;
  selector3?: string | null;
  value?: number | null;
};

type ForgeCalculatorContext = {
  damageTypes: DamageType[];
  attackEffects: AttackEffect[];
  defEffects: DefEffect[];
  weaponAttributes: WeaponAttribute[];
  armorAttributes: ArmorAttribute[];
  shieldAttributes: ShieldAttribute[];
  wardingOptions: WardingOption[];
  sanctifiedOptions: SanctifiedOption[];
  vrpEntries: {
    effectKind: VRPEffectKind;
    magnitude: number;
    damageTypeId: number;
  }[];
};

function normaliseConfigKey(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function findConfigValue(
  configRows: ForgeConfigRow[],
  category: string,
  selector1?: string | null,
  selector2?: string | null,
  defaultValue = 0,
): number {
  const categoryKey = normaliseConfigKey(category);
  const s1Key = normaliseConfigKey(selector1);
  const s2Key = normaliseConfigKey(selector2);

  const found = configRows.find((row) => {
    return (
      normaliseConfigKey(row.category) === categoryKey &&
      (selector1 === undefined ||
        normaliseConfigKey(row.selector1) === s1Key) &&
      (selector2 === undefined ||
        normaliseConfigKey(row.selector2) === s2Key)
    );
  });

  const v = typeof found?.value === 'number' ? found.value : defaultValue;
  return Number.isFinite(v) ? v : defaultValue;
}

function findCostValue(
  costRows: ForgeCostRow[],
  category: string,
  selector1?: string | null,
  selector2?: string | null,
  selector3?: string | number | null,
  defaultValue = 0,
): number {
  const categoryKey = normaliseConfigKey(category);
  const s1Key = normaliseConfigKey(selector1);
  const s2Key = normaliseConfigKey(selector2);
  const s3Key =
    selector3 === undefined
      ? ''
      : normaliseConfigKey(
          typeof selector3 === 'number' ? selector3.toString() : selector3,
        );

  const found = costRows.find((row) => {
    const rowCat = normaliseConfigKey(row.category);
    if (rowCat !== categoryKey) return false;

    if (
      selector1 !== undefined &&
      normaliseConfigKey(row.selector1) !== s1Key
    ) {
      return false;
    }

    if (
      selector2 !== undefined &&
      normaliseConfigKey(row.selector2) !== s2Key
    ) {
      return false;
    }

    if (
      selector3 !== undefined &&
      normaliseConfigKey(row.selector3) !== s3Key
    ) {
      return false;
    }

    return true;
  });

  const v = typeof found?.value === 'number' ? found.value : defaultValue;
  return Number.isFinite(v) ? v : defaultValue;
}

function calculateTotalFp(
  values: ForgeFormValues,
  configRows: ForgeConfigRow[],
): number {
  const level = typeof values.level === 'number' ? values.level : 0;
  const rarity = values.rarity;

  if (!level || !rarity) {
    return 0;
  }

  // Map ItemRarity enum → ForgeConfigEntry.selector1 label
  const rarityLabelMap: Record<ItemRarity, string> = {
    COMMON: 'common',
    UNCOMMON: 'uncommon',
    RARE: 'rare',
    LEGENDARY: 'legendary',
    MYTHIC: 'mythic',
  };

  const rarityLabel = rarityLabelMap[rarity] ?? '';
  if (!rarityLabel) {
    return 0;
  }

  // Look up the scalar from ForgeConfigEntry (category = RARITY, selector1 = rarity label)
  const rarityScalar = findConfigValue(
    configRows,
    'RARITY',
    rarityLabel,
    undefined,
    0,
  );

  const total = level * rarityScalar;
  return Number.isFinite(total) ? total : 0;
}

function calculateItemMultiplier(
  values: ForgeFormValues,
  configRows: ForgeConfigRow[],
): number {
  const type = values.type;
  // Default multiplier if we can't resolve anything sensible
  let multiplier = 1;

  if (type === 'WEAPON' || type === 'SHIELD') {
    const size = values.size;
    if (!size) return multiplier;

    const typeLabel = type === 'WEAPON' ? 'Weapon' : 'Shield';

    const sizeLabel = SIZE_LABELS[size as WeaponSize] ?? '';
    if (!sizeLabel) return multiplier;

    multiplier = findConfigValue(
      configRows,
      'SIZE',
      typeLabel,
      sizeLabel,
      1,
    );
    return multiplier || 1;
  }

  if (type === 'ARMOR') {
    const loc = values.armorLocation;
    if (!loc) return multiplier;

    const armorLocLabelMap: Record<string, string> = {
      HEAD: 'Head',
      SHOULDERS: 'Shoulders',
      TORSO: 'Torso',
      LEGS: 'Legs',
      FEET: 'Feet',
    };

    const locLabel = armorLocLabelMap[loc] ?? '';
    if (!locLabel) return multiplier;

    multiplier = findConfigValue(
      configRows,
      'ARMOR_LOCATION',
      locLabel,
      undefined,
      1,
    );
    return multiplier || 1;
  }

  if (type === 'ITEM') {
    const loc = values.itemLocation;
    if (!loc) return multiplier;

    const itemLocLabelMap: Record<string, string> = {
      HEAD: 'Head',
      NECK: 'Neck',
      ARMS: 'Arms',
      BELT: 'Belt',
      HANDS: 'Hands',
      FINGER: 'Finger',
      CHEST: 'Chest',
      BACK: 'Back',
      FEET: 'Feet',
      OTHER: 'Other',
    };

    const locLabel = itemLocLabelMap[loc] ?? '';
    if (!locLabel) return multiplier;

    multiplier = findConfigValue(
      configRows,
      'ITEM_LOCATION',
      locLabel,
      undefined,
      1,
    );
    return multiplier || 1;
  }

  // For now, consumables use a neutral multiplier of 1.
  // We'll swap this to the CONSUMABLES config once the form fields exist.
  return multiplier;
}

function calculateRawSpentFp(
  values: ForgeFormValues,
  costRows: ForgeCostRow[],
  context: ForgeCalculatorContext,
  ): number {
  let targetCost = 0;
  let choiceCost = 0;
  let potencyCost = 0;
  let typeCost = 0;
  let gsCost = 0;
  let otherCost = 0;
  let attackLinesCost = 0;
  let usedPerRangeAttackPricing = false;
  const type = values.type;

  const typeLabelMap: Record<string, string> = {
    WEAPON: 'Weapon',
    ARMOR: 'Armor',
    SHIELD: 'Shield',
    ITEM: 'Item',
    CONSUMABLE: 'Item',
  };
  const typeLabel = typeLabelMap[type] ?? '';

  function findGlobalAttributeCost(
    rows: ForgeCostRow[],
    itemTypeLabel: string,
    attributeName: string,
    magnitude: number,
  ): number {
    // 1) Exact match: selector1=type, selector2=attribute, selector3=magnitude
    const exactA = findCostValue(
      rows,
      'Attribute',
      itemTypeLabel,
      attributeName,
      magnitude,
      0,
    );
    if (exactA) return exactA;

    // 2) Exact match swapped: selector1=attribute, selector2=type, selector3=magnitude
    const exactB = findCostValue(
      rows,
      'Attribute',
      attributeName,
      itemTypeLabel,
      magnitude,
      0,
    );
    if (exactB) return exactB;

    // 3) Cost-per-point (no selector3): multiply by magnitude
    const perPointA = findCostValue(
      rows,
      'Attribute',
      itemTypeLabel,
      attributeName,
      undefined,
      0,
    );
    if (perPointA) return perPointA * magnitude;

    // 4) Cost-per-point swapped
    const perPointB = findCostValue(
      rows,
      'Attribute',
      attributeName,
      itemTypeLabel,
      undefined,
      0,
    );
    if (perPointB) return perPointB * magnitude;

    return 0;
  }

  // Global attribute modifiers apply to all types
  if (typeLabel && Array.isArray(values.globalAttributeModifiers)) {
    for (const mod of values.globalAttributeModifiers) {
      // Support both { attribute, amount } and any legacy naming like { stat, value }
      const attributeName =
        (mod as any)?.attribute ??
        (mod as any)?.stat ??
        (mod as any)?.name ??
        null;

      const magnitudeRaw =
        (mod as any)?.amount ??
        (mod as any)?.value ??
        (mod as any)?.magnitude ??
        0;

      const magnitude =
        typeof magnitudeRaw === 'number'
          ? magnitudeRaw
          : parseInt(String(magnitudeRaw), 10);

      if (!attributeName || !Number.isFinite(magnitude) || magnitude <= 0) {
        continue;
      }

      otherCost += findGlobalAttributeCost(
        costRows,
        typeLabel,
        String(attributeName),
        magnitude,
      );
    }
  }

  // Weapon / Shield stat + range + damage costs
  // NEW: Each selected range category is its own "attack line"
  if (type === 'WEAPON' || type === 'SHIELD') {
    const size = values.size;
    const shieldHasAttack = values.shieldHasAttack;
    const hasSize = !!size;
    const isWeaponLike =
      type === 'WEAPON' || (type === 'SHIELD' && hasSize && shieldHasAttack);

    if (isWeaponLike) {
      const rangeCats = (values.rangeCategories ?? []) as RangeCategory[];

      const rcLabelMap: Record<RangeCategory, 'Melee' | 'Ranged' | 'AoE'> = {
        MELEE: 'Melee',
        RANGED: 'Ranged',
        AOE: 'AoE',
      };

      const addGsAttackEffects = (
        rangeLabel: 'Melee' | 'Ranged' | 'AoE',
        ids: number[],
      ): number => {
        let cost = 0;
        for (const effectId of ids) {
          const effect = context.attackEffects.find((fx) => fx.id === effectId);
          if (!effect || !effect.name) continue;

          cost += findCostValue(
            costRows,
            'GS_AttackEffects',
            'Weapon',
            rangeLabel,
            effect.name,
            0,
          );
        }
        return cost;
      };

      const calcAttackLine = (rc: RangeCategory): number => {
        const rangeLabel = rcLabelMap[rc];
        if (!rangeLabel) return 0;

        let lineTargetCost = 0;
        let lineChoiceCost = 0;
        let linePotencyCost = 0;
        let lineTypeCost = 0;
        let lineGsCost = 0;

        // Base range category selection cost (belongs to the line)
        lineTargetCost += findCostValue(
          costRows,
          'RangeCategory',
          typeLabel,
          rangeLabel,
          undefined,
          0,
        );

// Per-range Strength costs
        if (rc === 'MELEE') {
          const physicalStrength = values.meleePhysicalStrength ?? 0;
          const mentalStrength = values.meleeMentalStrength ?? 0;

          if (physicalStrength > 0) {
            linePotencyCost += findCostValue(
              costRows,
              'Stat',
              typeLabel,
              'PhysicalStrength',
              physicalStrength,
              0,
            );
          }
          if (mentalStrength > 0) {
            linePotencyCost += findCostValue(
              costRows,
              'Stat',
              typeLabel,
              'MentalStrength',
              mentalStrength,
              0,
            );
          }

          const meleeTargets = Number(values.meleeTargets ?? 1);
          lineChoiceCost += findCostValue(
            costRows,
            'MeleeTargets',
            typeLabel,
            String(meleeTargets),
            undefined,
            0,
          );

          const meleeCount = (values.meleeDamageTypeIds ?? []).length;
          if (meleeCount > 0) {
            lineTypeCost += findCostValue(
              costRows,
              'DmgType_Count',
              typeLabel,
              'Melee',
              meleeCount,
              0,
            );
          }

          if (type === 'WEAPON') {
            const meleeTargets = Number(values.meleeTargets ?? 1);
            lineGsCost +=
            addGsAttackEffects('Melee', values.attackEffectMeleeIds ?? []) *
            Math.max(1, meleeTargets);
          }
        }

        if (rc === 'RANGED') {
          const physicalStrength = values.rangedPhysicalStrength ?? 0;
          const mentalStrength = values.rangedMentalStrength ?? 0;

          if (physicalStrength > 0) {
            linePotencyCost += findCostValue(
              costRows,
              'Stat',
              typeLabel,
              'PhysicalStrength',
              physicalStrength,
              0,
            );
          }
          if (mentalStrength > 0) {
            linePotencyCost += findCostValue(
              costRows,
              'Stat',
              typeLabel,
              'MentalStrength',
              mentalStrength,
              0,
            );
          }

          if (values.rangedTargets) {
            lineChoiceCost += findCostValue(
              costRows,
              'RangedTargets',
              typeLabel,
              String(values.rangedTargets),
              undefined,
              0,
            );
          }

          if (values.rangedDistanceFeet) {
            lineTargetCost += findCostValue(
              costRows,
              'RangedDistanceFt',
              typeLabel,
              String(values.rangedDistanceFeet),
              undefined,
              0,
            );
          }

          const rangedCount = (values.rangedDamageTypeIds ?? []).length;
          if (rangedCount > 0) {
            lineTypeCost += findCostValue(
              costRows,
              'DmgType_Count',
              typeLabel,
              'Ranged',
              rangedCount,
              0,
            );
          }

        if (type === 'WEAPON') {
            const rangedTargets = Number(values.rangedTargets ?? 1);
            lineGsCost +=
              addGsAttackEffects('Ranged', values.attackEffectRangedIds ?? []) *
              Math.max(1, rangedTargets);
          }
        }

        if (rc === 'AOE') {
          const physicalStrength = values.aoePhysicalStrength ?? 0;
          const mentalStrength = values.aoeMentalStrength ?? 0;

          if (physicalStrength > 0) {
            linePotencyCost += findCostValue(
              costRows,
              'Stat',
              typeLabel,
              'PhysicalStrength',
              physicalStrength,
              0,
            );
          }
          if (mentalStrength > 0) {
            linePotencyCost += findCostValue(
              costRows,
              'Stat',
              typeLabel,
              'MentalStrength',
              mentalStrength,
              0,
            );
          }

          if (values.aoeCount) {
            lineChoiceCost += findCostValue(
              costRows,
              'AoECount',
              typeLabel,
              String(values.aoeCount),
              undefined,
              0,
            );
          }

          if (values.aoeCenterRangeFeet) {
            lineTargetCost += findCostValue(
              costRows,
              'AoECenterRangeFt',
              typeLabel,
              String(values.aoeCenterRangeFeet),
              undefined,
              0,
            );
          }

          const shape = values.aoeShape;
          if (shape === 'SPHERE' && values.aoeSphereRadiusFeet) {
            lineTargetCost += findCostValue(
              costRows,
              'SphereSizeFt',
              typeLabel,
              String(values.aoeSphereRadiusFeet),
              undefined,
              0,
            );
          } else if (shape === 'CONE' && values.aoeConeLengthFeet) {
            lineTargetCost += findCostValue(
              costRows,
              'ConeLengthFt',
              typeLabel,
              String(values.aoeConeLengthFeet),
              undefined,
              0,
            );
          } else if (shape === 'LINE') {
            if (values.aoeLineWidthFeet) {
              lineTargetCost += findCostValue(
                costRows,
                'LineWidthFt',
                typeLabel,
                String(values.aoeLineWidthFeet),
                undefined,
                0,
              );
            }
            if (values.aoeLineLengthFeet) {
              lineTargetCost += findCostValue(
                costRows,
                'LineLengthFt',
                typeLabel,
                String(values.aoeLineLengthFeet),
                undefined,
                0,
              );
            }
          }

          const aoeCount = (values.aoeDamageTypeIds ?? []).length;
          if (aoeCount > 0) {
            lineTypeCost += findCostValue(
              costRows,
              'DmgType_Count',
              typeLabel,
              'AoE',
              aoeCount,
              0,
            );
          }

          if (type === 'WEAPON') {
            // AoE doesn't have a "targets" selector today, so treat as 1x.
            // If later you want this to scale by aoeCount, change multiplier to Number(values.aoeCount ?? 1).
            lineGsCost += addGsAttackEffects(
              'AoE',
              values.attackEffectAoEIds ??[],
            );
          }
        }

        const attackBase = lineTargetCost + lineChoiceCost;
        const effectBase = linePotencyCost + lineTypeCost + lineGsCost;
        const attackBaseFactor = Math.max(1, attackBase);

        return attackBaseFactor * effectBase;
      };

      if (rangeCats.length) {
        usedPerRangeAttackPricing = true;
        for (const rc of rangeCats) {
          attackLinesCost += calcAttackLine(rc);
        }
      }
    } // end isWeaponLike
  } // end WEAPON/SHIELD

  // Armor / Shield stat costs (PPV / MPV)
  if (type === 'ARMOR' || type === 'SHIELD') {
    const ppv = values.ppv ?? 0;
    const mpv = values.mpv ?? 0;

    if (ppv > 0) {
      potencyCost += findCostValue(
        costRows,
        'Stat',
        'PPV',
        type === 'ARMOR' ? 'Armor' : 'Shield',
        ppv,
        0,
      );
    }

    if (mpv > 0) {
      potencyCost += findCostValue(
        costRows,
        'Stat',
        'MPV',
        type === 'ARMOR' ? 'Armor' : 'Shield',
        mpv,
        0,
      );
    }
  }

  // Armor / Shield auras (Physical / Mental)
  if (type === 'ARMOR' || type === 'SHIELD') {
    const auraPhysical = values.auraPhysical ?? 0;
    const auraMental = values.auraMental ?? 0;
    const auraItemLabel = type === 'ARMOR' ? 'Armor' : 'Shield';

    if (auraPhysical > 0) {
      otherCost += findCostValue(
        costRows,
        'Aura_Physical',
        auraItemLabel,
        String(auraPhysical),
        undefined,
        0,
      );
    }

    if (auraMental > 0) {
      otherCost += findCostValue(
        costRows,
        'Aura_Mental',
        auraItemLabel,
        String(auraMental),
        undefined,
        0,
      );
    }
  }

  // Weapon / Armor / Shield attribute tags
    if (type === 'WEAPON') {
    const weaponAttrIds = values.weaponAttributeIds ?? [];
    for (const attrId of weaponAttrIds) {
      const attr = context.weaponAttributes.find((a) => a.id === attrId);
      if (!attr || !attr.name) continue;

      const name = attr.name.trim();

      // Handle attributes with magnitude encoded in the name, e.g. "Dangerous 3", "Reload 5"
      const match = name.match(/^(.*\D)\s+(\d+)$/);
      if (match) {
        const baseName = match[1].trim();
        const magnitude = parseInt(match[2], 10);

        otherCost += findCostValue(
          costRows,
          'WeaponAttributes',
          'Weapon',
          baseName,
          magnitude,
          0,
        );
      } else {
        // Flat-cost attributes without magnitude
        otherCost += findCostValue(
          costRows,
          'WeaponAttributes',
          'Weapon',
          name,
          undefined,
          0,
        );
      }
    }
  }

  if (type === 'ARMOR') {
    const armorAttrIds = values.armorAttributeIds ?? [];
    for (const attrId of armorAttrIds) {
      const attr = context.armorAttributes.find((a) => a.id === attrId);
      if (!attr) continue;

      otherCost += findCostValue(
        costRows,
        'ArmorAttributes',
        'Armor',
        attr.name,
        undefined,
        0,
      );
    }
  }

  if (type === 'SHIELD') {
    const shieldAttrIds = values.shieldAttributeIds ?? [];
    for (const attrId of shieldAttrIds) {
      const attr = context.shieldAttributes.find((a) => a.id === attrId);
      if (!attr) continue;

      otherCost += findCostValue(
        costRows,
        'ShieldAttributes',
        'Shield',
        attr.name,
        undefined,
        0,
      );
    }
  }

  // Offensive GS effects (Weapon) — per-range now
  if (type === 'WEAPON' && !usedPerRangeAttackPricing) {
    const rangeCats = (values.rangeCategories ?? []) as RangeCategory[];

    const addGsAttackEffects = (rangeLabel: 'Melee' | 'Ranged' | 'AoE', ids: number[]) => {
      for (const effectId of ids) {
        const effect = context.attackEffects.find((fx) => fx.id === effectId);
        if (!effect || !effect.name) continue;

        gsCost += findCostValue(
          costRows,
          'GS_AttackEffects',
          'Weapon',
          rangeLabel,
          effect.name,
          0,
        );
      }
    };

    if (rangeCats.includes('MELEE')) {
      addGsAttackEffects('Melee', values.attackEffectMeleeIds ?? []);
    }
    if (rangeCats.includes('RANGED')) {
      addGsAttackEffects('Ranged', values.attackEffectRangedIds ?? []);
    }
    if (rangeCats.includes('AOE')) {
      addGsAttackEffects('AoE', values.attackEffectAoEIds ?? []);
    }
  }

  // Defensive GS effects (Armor / Shield)
  if (type === 'ARMOR' || type === 'SHIELD') {
    const defEffectIds = values.defEffectIds ?? [];
    const defItemLabel = type === 'ARMOR' ? 'Armor' : 'Shield';

    for (const effectId of defEffectIds) {
      const effect = context.defEffects.find((d) => d.id === effectId);
      if (!effect) continue;

      gsCost += findCostValue(
        costRows,
        'GS_DefEffects',
        defItemLabel,
        effect.name,
        undefined,
        0,
      );
    }
  }

  // Warding / Sanctified options (Armor / Shield)
  if (type === 'ARMOR' || type === 'SHIELD') {
    const wardingOptionIds = values.wardingOptionIds ?? [];
    const sanctifiedOptionIds = values.sanctifiedOptionIds ?? [];
    const wardItemLabel = type === 'ARMOR' ? 'Armor' : 'Shield';

    if (wardingOptionIds.length) {
      for (const optionId of wardingOptionIds) {
        const opt = context.wardingOptions.find((o) => o.id === optionId);
        if (!opt) continue;

        otherCost += findCostValue(
          costRows,
          'WardingOptions',
          wardItemLabel,
          opt.name,
          undefined,
          0,
        );
      }
    }

    if (sanctifiedOptionIds.length) {
      for (const optionId of sanctifiedOptionIds) {
        const opt = context.sanctifiedOptions.find((o) => o.id === optionId);
        if (!opt) continue;

        otherCost += findCostValue(
          costRows,
          'SanctifiedOptions',
          wardItemLabel,
          opt.name,
          undefined,
          0,
        );
      }
    }
  }

  // VRP (Armor / Shield only), built from the live VRPEntryForm[] state
  if (type === 'ARMOR' || type === 'SHIELD') {
    const vrpItemLabel = type === 'ARMOR' ? 'Armor' : 'Shield';

    for (const entry of context.vrpEntries ?? []) {
      const damage = context.damageTypes.find(
        (d) => d.id === entry.damageTypeId,
      );
      if (!damage) continue;

      const effectBase =
        entry.effectKind === 'VULNERABILITY'
          ? 'Vulnerability'
          : entry.effectKind === 'RESISTANCE'
          ? 'Resistance'
          : entry.effectKind === 'PROTECTION'
          ? 'Protection'
          : '';

      if (!effectBase) continue;

      const selector2Label = `${effectBase} ${entry.magnitude} ${damage.name}`;

      otherCost += findCostValue(
        costRows,
        'VRPOptions',
        vrpItemLabel,
        selector2Label,
        undefined,
        0,
      );
    }
  }

  // NOTE: Consumable-specific cost pieces (Intention / Magnitude / Potency / Range / Duration)
  // still to be wired once their ForgeCostEntry rows exist.

  // Attack pricing:
  // - Weapons/Shields with attack lines: sum per-range line costs
  // - Everything else: keep legacy AttackBase × EffectBase behaviour
  const legacyAttackBase = targetCost + choiceCost;
  const legacyEffectBase = potencyCost + typeCost + gsCost;
  const legacyAttackBaseFactor = Math.max(1, legacyAttackBase);
  const legacyAttackStringCost = legacyAttackBaseFactor * legacyEffectBase;

  const attackStringCost = usedPerRangeAttackPricing
    ? attackLinesCost
    : legacyAttackStringCost;

  const grandTotal = attackStringCost + otherCost;
  return grandTotal;
}

function calculateForgeTotals(
  values: ForgeFormValues,
  configRows: ForgeConfigRow[],
  costs: ForgeCostRow[],
  context: ForgeCalculatorContext,
): ForgeCalculatorTotals {
  // Base resources from level × rarity
  const totalFp = calculateTotalFp(values, configRows);

  // Size / location / consumable-charges multiplier
  const multiplier = calculateItemMultiplier(values, configRows);

  // Sum all raw costs from ForgeCostEntry, then apply the item multiplier
  const rawSpent = calculateRawSpentFp(values, costs, context);

  const spentFp = rawSpent * multiplier;
  const remainingFp = totalFp - spentFp;
  const percentSpent =
    totalFp > 0 ? Math.max(0, Math.min(100, (spentFp / totalFp) * 100)) : 0;

  return {
    totalFp,
    spentFp,
    remainingFp,
    percentSpent,
    multiplier,

  };
}

export function ForgeCreate({ campaignId }: { campaignId: string }) {
  const { data, loading, error } = useForgePicklists();

  // Campaign items (for edit selection)
  const {
    data: forgeItems,
    loading: itemsLoading,
    error: itemsError,
    refetch: refetchForgeItems,
  } = useForgeItems(campaignId);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerFiltersOpen, setPickerFiltersOpen] = useState(false);
  const [pickerLevelSelected, setPickerLevelSelected] = useState<number[]>([]);
  const [pickerExcludeLegendary, setPickerExcludeLegendary] = useState(false);
  const [recentForgeItemIds, setRecentForgeItemIds] = useState<string[]>([]);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const pickerFiltersRef = useRef<HTMLDivElement | null>(null);

  // Used by preview + "last forged" banner
  const [createdItem, setCreatedItem] = useState<LoadedItem | null>(null);

  const [mobileView, setMobileView] = useState<'editor' | 'preview'>('editor');
  const editorScrollYRef = useRef(0);
  const previewScrollYRef = useRef(0);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(media.matches);
    update();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (isDesktop) return;
    if (typeof window === 'undefined') return;
    const targetY =
      mobileView === 'editor'
        ? editorScrollYRef.current
        : previewScrollYRef.current;
    requestAnimationFrame(() => {
      window.scrollTo(0, targetY);
    });
  }, [mobileView, isDesktop]);

  const handleMobileViewChange = (nextView: 'editor' | 'preview') => {
    if (nextView === mobileView) return;
    if (!isDesktop && typeof window !== 'undefined') {
      const currentY = window.scrollY;
      if (mobileView === 'editor') {
        editorScrollYRef.current = currentY;
      } else {
        previewScrollYRef.current = currentY;
      }
    }
    setMobileView(nextView);
  };

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (pickerRef.current && !pickerRef.current.contains(target)) {
        setPickerOpen(false);
      }
      if (pickerFiltersRef.current && !pickerFiltersRef.current.contains(target)) {
        setPickerFiltersOpen(false);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (pickerFiltersOpen) {
        setPickerFiltersOpen(false);
        return;
      }
      if (pickerOpen) {
        setPickerOpen(false);
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [pickerFiltersOpen, pickerOpen]);

  function isHttpUrl(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const v = value.trim();
    if (!v) return false;
    return v.startsWith('http://') || v.startsWith('https://');
  }

  function namesByIds<T extends { id: number; name: string }>(
    list: T[],
    ids: number[],
  ): string[] {
    const map = new Map(list.map((x) => [x.id, x.name] as const));
    return ids.map((id) => map.get(id) ?? `#${id}`);
  }

  function formatSigned(n: number): string {
    return n >= 0 ? `+${n}` : `${n}`;
  }

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [activeTagIndex, setActiveTagIndex] = useState<number>(-1);
  const [tagsFocused, setTagsFocused] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const isHydratingRef = useRef(false);

    type VRPEntryForm = {
    effectKind: VRPEffectKind;
    magnitude: number;
    damageTypeId: number;
  };

  const [vrpEntries, setVrpEntries] = useState<VRPEntryForm[]>([]);

  const [vrpEffectKind, setVrpEffectKind] =
    useState<VRPEffectKind>('VULNERABILITY');
  const [vrpMagnitude, setVrpMagnitude] = useState<number>(1);
  const [vrpDamageTypeId, setVrpDamageTypeId] = useState<number | null>(null);
  const [vrpMagnitudeError, setVrpMagnitudeError] = useState<string | null>(null);

  const [globalAttributeSelection, setGlobalAttributeSelection] =
    useState<string>('Attack');
  const [globalAttributeAmount, setGlobalAttributeAmount] =
    useState<number>(1);
  const [mythicLbTemplates, setMythicLbTemplates] = useState<
    MythicLimitBreakTemplateRow[]
  >([]);
  const [mythicLbTemplatesLoading, setMythicLbTemplatesLoading] =
    useState(false);
  const [mythicLbTemplatesError, setMythicLbTemplatesError] =
    useState<string | null>(null);
  const forgePickerSupportsLevel = useMemo(
    () => (forgeItems ?? []).every((row) => Object.prototype.hasOwnProperty.call(row, 'level')),
    [forgeItems],
  );
  const queryFilteredForgeItems = useMemo(
    () => (forgeItems ?? []).filter((row) => itemMatches(row, pickerQuery)),
    [forgeItems, pickerQuery],
  );
  const filteredForgeItems = useMemo(
    () =>
      queryFilteredForgeItems.filter((row) => {
        if (
          forgePickerSupportsLevel &&
          pickerLevelSelected.length > 0 &&
          (typeof row.level !== 'number' || !pickerLevelSelected.includes(row.level))
        ) {
          return false;
        }
        if (pickerExcludeLegendary && isLegendaryItem(row)) {
          return false;
        }
        return true;
      }),
    [
      forgePickerSupportsLevel,
      pickerExcludeLegendary,
      pickerLevelSelected,
      queryFilteredForgeItems,
    ],
  );
  const recentForgeStorageKey = useMemo(
    () => `forge.recentItems.${campaignId}`,
    [campaignId],
  );
  const forgeItemsById = useMemo(() => {
    const map: Record<string, ForgeItemSummary> = {};
    for (const row of forgeItems ?? []) {
      map[row.id] = row;
    }
    return map;
  }, [forgeItems]);
  const hasPickerQuery = pickerQuery.trim().length > 0;
  const hasPickerFilters =
    (forgePickerSupportsLevel && pickerLevelSelected.length > 0) ||
    pickerExcludeLegendary;
  const pickerTotalCount = (forgeItems ?? []).length;
  const pickerFilteredCount = filteredForgeItems.length;
  const activePickerFilterPills = useMemo(() => {
    const pills: Array<{ id: 'level' | 'noLegendary'; label: string }> = [];
    if (forgePickerSupportsLevel && pickerLevelSelected.length > 0) {
      pills.push({
        id: 'level',
        label: `Level: ${formatNumberRanges(pickerLevelSelected)}`,
      });
    }
    if (pickerExcludeLegendary) {
      pills.push({ id: 'noLegendary', label: 'No Legendary' });
    }
    return pills;
  }, [forgePickerSupportsLevel, pickerExcludeLegendary, pickerLevelSelected]);
  const recentForgeItems = useMemo(() => {
    if (hasPickerQuery) return [] as ForgeItemSummary[];
    const allowedIds = new Set(filteredForgeItems.map((row) => row.id));
    const rows: ForgeItemSummary[] = [];
    for (const id of recentForgeItemIds) {
      const row = forgeItemsById[id];
      if (!row) continue;
      if (!allowedIds.has(row.id)) continue;
      rows.push(row);
    }
    return rows;
  }, [filteredForgeItems, forgeItemsById, hasPickerQuery, recentForgeItemIds]);
  const recentForgeIdSet = useMemo(
    () => new Set(recentForgeItems.map((row) => row.id)),
    [recentForgeItems],
  );
  const filteredForgeItemsWithoutRecent = useMemo(
    () => filteredForgeItems.filter((row) => !recentForgeIdSet.has(row.id)),
    [filteredForgeItems, recentForgeIdSet],
  );
  const selectedItemSummary = (forgeItems ?? []).find((row) => row.id === selectedItemId) ?? null;
  const togglePickerLevel = (level: number) => {
    setPickerLevelSelected((prev) =>
      prev.includes(level)
        ? prev.filter((entry) => entry !== level)
        : [...prev, level].sort((a, b) => a - b),
    );
  };
  const setPickerLevelRange = (min: number, max: number) => {
    setPickerLevelSelected(
      PICKER_LEVEL_OPTIONS.filter((level) => level >= min && level <= max),
    );
  };
  const clearPickerFilters = () => {
    setPickerLevelSelected([]);
    setPickerExcludeLegendary(false);
  };
  const removePickerFilterPill = (pillId: 'level' | 'noLegendary') => {
    if (pillId === 'level') {
      setPickerLevelSelected([]);
      return;
    }
    setPickerExcludeLegendary(false);
  };

  const persistRecentForgeItemIds = (ids: string[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        recentForgeStorageKey,
        JSON.stringify(ids.slice(0, MAX_RECENT_PICKER_ITEMS)),
      );
    } catch {
      // no-op: localStorage unavailable
    }
  };

  const markForgeItemAsRecent = (itemId: string) => {
    setRecentForgeItemIds((prev) => {
      const next = [itemId, ...prev.filter((id) => id !== itemId)].slice(0, MAX_RECENT_PICKER_ITEMS);
      persistRecentForgeItemIds(next);
      return next;
    });
  };

  const armorAttrsFromPicklist = data?.armorAttributes ?? [];
  const shieldAttrsFromPicklist = data?.shieldAttributes ?? [];
  const defEffectsFromPicklist = data?.defEffects ?? [];
  const wardingOptionsFromPicklist = data?.wardingOptions ?? [];
  const sanctifiedOptionsFromPicklist = data?.sanctifiedOptions ?? [];

  const defaultForgeValues: ForgeFormValues = {
  // Core
  name: '',
  type: '' as any,
  rarity: '' as any,
  level: 1,
  generalDescription: '',
  itemUrl: '',
  globalAttributeModifiers: [],

  // Weapon / Shield core
  size: null as any,
  shieldHasAttack: false,

  // Per-range Strength (Physical/Mental)
  meleePhysicalStrength: 0 as any,
  meleeMentalStrength: 0 as any,
  rangedPhysicalStrength: 0 as any,
  rangedMentalStrength: 0 as any,
  aoePhysicalStrength: 0 as any,
  aoeMentalStrength: 0 as any,

  meleeTargets: 1 as any,
  rangedTargets: 1 as any,

  // Ranged / AoE geometry
  rangedDistanceFeet: null as any,
  aoeCenterRangeFeet: null as any,
  aoeCount: 1 as any,
  aoeShape: null as any,
  aoeSphereRadiusFeet: null as any,
  aoeConeLengthFeet: null as any,
  aoeLineWidthFeet: null as any,
  aoeLineLengthFeet: null as any,

  // Armor core
  armorLocation: null as any,
  ppv: 0 as any,
  mpv: 0 as any,
  auraPhysical: null as any,
  auraMental: null as any,

  // Item core
  itemLocation: null as any,

  // Tags / relations (id arrays)
  tags: [],
  rangeCategories: [],
  meleeDamageTypeIds: [],
  rangedDamageTypeIds: [],
  aoeDamageTypeIds: [],

  attackEffectMeleeIds: [],
  attackEffectRangedIds: [],
  attackEffectAoEIds: [],

  weaponAttributeIds: [],
  weaponAttributeStrengthSources: {},
  weaponAttributeRangeSelections: {},
  armorAttributeIds: [],
  shieldAttributeIds: [],

  defEffectIds: [],
  wardingOptionIds: [],
  sanctifiedOptionIds: [],

  // (removed) invalid type syntax accidentally pasted into default values object

  // Custom strings
  customWeaponAttributes: '',
  customArmorAttributes: '',
  customShieldAttributes: '',
  customItemAttributes: '',
  selectedMythicLimitBreakId: null,
  mythicLbPushTemplateId: null,
  mythicLbBreakTemplateId: null,
  mythicLbTranscendTemplateId: null,
};

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue,
    getValues,
    clearErrors,
  } = useForm<ForgeFormValues>({
  mode: 'onChange',
  reValidateMode: 'onChange',
  defaultValues: defaultForgeValues,
});

  useEffect(() => {
    register('tags');
  }, [register]);

function resetForgeToNewItemMode() {
  // Switch to "New Item" mode
  setSelectedItemId(null);
  setPickerOpen(false);
  setPickerQuery('');
  setPickerFiltersOpen(false);
  clearPickerFilters();

  // Prevent cleanup effects from fighting reset()
  isHydratingRef.current = true;

  // Reset all form values
  reset(defaultForgeValues);

  // Clear VRP state + scratch inputs
  setVrpEntries([]);
  setVrpEffectKind('VULNERABILITY');
  setVrpMagnitude(1);
  setVrpDamageTypeId(null);
  setVrpMagnitudeError(null);
  setTagInput('');
  setTagSuggestions([]);
  setActiveTagIndex(-1);
  setTagsFocused(false);

  // Clear created/loaded item context
  setCreatedItem(null);

  // Release hydration lock after effects settle
  setTimeout(() => {
    isHydratingRef.current = false;
  }, 50);
}

function handleResetForge() {
  const ok = window.confirm(
    'Reset the Forge?\n\nThis will clear all fields and start a new item. Unsaved changes will be lost.',
  );
  if (!ok) return;

  resetForgeToNewItemMode();
}

    // Load selected item into the form (edit mode)
  useEffect(() => {
    if (!selectedItemId) {
      // New item mode — do not auto-reset here (prevents wiping in-progress work)
      return;
    }

    let cancelled = false;

    async function loadItem() {
      try {
        const id = selectedItemId;
        if (!id) return;

        const res = await fetch(
          `/api/forge/items/${encodeURIComponent(
            selectedItemId,
          )}?campaignId=${encodeURIComponent(campaignId)}`,
        );

        if (!res.ok) throw new Error(`Failed to load item: ${res.status}`);

        const item = (await res.json()) as LoadedItem;

        if (cancelled) return;

        isHydratingRef.current = true;
        // Hydrate full form from API payload
        reset({
        // Core
          name: item.name ?? '',
          type: (item.type ?? '') as any,
          rarity: (item.rarity ?? '') as any,
          level: item.level ?? 1,
          generalDescription: item.generalDescription ?? '',
          itemUrl: (item as any).itemUrl ?? '',
          globalAttributeModifiers: (item as any).globalAttributeModifiers ?? [],

          // Weapon / shield core
          size: ((item as any).size ?? null) as any,
          shieldHasAttack: ((item as any).shieldHasAttack ?? false) as any,

          // Per-range Strength (Physical/Mental)
          meleePhysicalStrength: Number((item as any).meleePhysicalStrength ?? 0) as any,
          meleeMentalStrength: Number((item as any).meleeMentalStrength ?? 0) as any,
          rangedPhysicalStrength: Number((item as any).rangedPhysicalStrength ?? 0) as any,
          rangedMentalStrength: Number((item as any).rangedMentalStrength ?? 0) as any,
          aoePhysicalStrength: Number((item as any).aoePhysicalStrength ?? 0) as any,
          aoeMentalStrength: Number((item as any).aoeMentalStrength ?? 0) as any,
          
          meleeTargets: Number((item as any).meleeTargets ?? 1),
          rangedTargets: Number((item as any).rangedTargets ?? 1),

          // Ranged / AoE geometry
          rangedDistanceFeet: ((item as any).rangedDistanceFeet ?? null) as any,
          aoeCenterRangeFeet: ((item as any).aoeCenterRangeFeet ?? null) as any,
          aoeCount: ((item as any).aoeCount ?? 1) as any,
          aoeShape: ((item as any).aoeShape ?? null) as any,
          aoeSphereRadiusFeet: ((item as any).aoeSphereRadiusFeet ?? null) as any,
          aoeConeLengthFeet: ((item as any).aoeConeLengthFeet ?? null) as any,
          aoeLineWidthFeet: ((item as any).aoeLineWidthFeet ?? null) as any,
          aoeLineLengthFeet: ((item as any).aoeLineLengthFeet ?? null) as any,

          // Armor core
          armorLocation: ((item as any).armorLocation ?? null) as any,
          ppv: ((item as any).ppv ?? 0) as any,
          mpv: ((item as any).mpv ?? 0) as any,
          auraPhysical: ((item as any).auraPhysical ?? null) as any,
          auraMental: ((item as any).auraMental ?? null) as any,

          // Item core
          itemLocation: ((item as any).itemLocation ?? null) as any,

          // Tags / relations (API returns join rows; we map to id arrays)
          tags: Array.isArray((item as any).tags)
            ? (item as any).tags
                .map((entry: any) => String(entry ?? '').trim())
                .filter((entry: string) => entry.length > 0)
            : [],
          rangeCategories: Array.isArray((item as any).rangeCategories)
            ? (item as any).rangeCategories.map((rc: any) => rc.rangeCategory)
            : [],

          meleeDamageTypeIds: Array.isArray((item as any).meleeDamageTypes)
            ? (item as any).meleeDamageTypes.map((x: any) => x.damageTypeId)
            : [],
          rangedDamageTypeIds: Array.isArray((item as any).rangedDamageTypes)
            ? (item as any).rangedDamageTypes.map((x: any) => x.damageTypeId)
            : [],
          aoeDamageTypeIds: Array.isArray((item as any).aoeDamageTypes)
            ? (item as any).aoeDamageTypes.map((x: any) => x.damageTypeId)
            : [],

          attackEffectMeleeIds: Array.isArray((item as any).attackEffectsMelee)
            ? (item as any).attackEffectsMelee.map((x: any) => x.attackEffectId)
            : [],
          attackEffectRangedIds: Array.isArray((item as any).attackEffectsRanged)
            ? (item as any).attackEffectsRanged.map((x: any) => x.attackEffectId)
            : [],
          attackEffectAoEIds: Array.isArray((item as any).attackEffectsAoE)
            ? (item as any).attackEffectsAoE.map((x: any) => x.attackEffectId)
            : [],

          weaponAttributeIds: Array.isArray((item as any).weaponAttributes)
            ? (item as any).weaponAttributes.map((x: any) => x.weaponAttributeId)
            : [],

          weaponAttributeStrengthSources: Array.isArray((item as any).weaponAttributes)
            ? Object.fromEntries(
                (item as any).weaponAttributes.map((x: any) => [
                  String(x.weaponAttributeId),
                  x.strengthSource ?? null,
                ]),
              )
            : {},

          weaponAttributeRangeSelections: Array.isArray((item as any).weaponAttributes)
            ? Object.fromEntries(
                (item as any).weaponAttributes.map((x: any) => [
                  String(x.weaponAttributeId),
                  x.rangeSource ?? null,
                ]),
              )
            : {},
          armorAttributeIds: Array.isArray((item as any).armorAttributes)
            ? (item as any).armorAttributes.map((x: any) => x.armorAttributeId)
            : [],
          shieldAttributeIds: Array.isArray((item as any).shieldAttributes)
            ? (item as any).shieldAttributes.map((x: any) => x.shieldAttributeId)
            : [],

          defEffectIds: Array.isArray((item as any).defEffects)
            ? (item as any).defEffects.map((x: any) => x.defEffectId)
            : [],
          wardingOptionIds: Array.isArray((item as any).wardingOptions)
            ? (item as any).wardingOptions.map((x: any) => x.wardingOptionId)
            : [],
          sanctifiedOptionIds: Array.isArray((item as any).sanctifiedOptions)
            ? (item as any).sanctifiedOptions.map((x: any) => x.sanctifiedOptionId)
            : [],

          // Custom strings
          customWeaponAttributes: ((item as any).customWeaponAttributes ?? '') as any,
          customArmorAttributes: ((item as any).customArmorAttributes ?? '') as any,
          customShieldAttributes: ((item as any).customShieldAttributes ?? '') as any,
          customItemAttributes: ((item as any).customItemAttributes ?? '') as any,
          selectedMythicLimitBreakId: deriveSelectedMythicLimitBreakId(item),
          mythicLbPushTemplateId: null,
          mythicLbBreakTemplateId: null,
          mythicLbTranscendTemplateId: null,
        });

        
        // VRP entries live outside RHF (state-driven UI)
        const mappedVrp = Array.isArray((item as any).vrpEntries)
          ? (item as any).vrpEntries.map((e: any) => ({
              effectKind: e.effectKind,
              magnitude: e.magnitude,
              damageTypeId: e.damageTypeId,
            }))
          : [];

        setVrpEntries(mappedVrp);

        setCreatedItem(item);
        } catch (err) {
          console.error(err);
        } finally {
          // Keep hydration flag true long enough for reset() + derived useEffects to settle.
          // Otherwise, "type change" / "armor cleared" cleanup effects can wipe VRP after we set it.
          setTimeout(() => {
            isHydratingRef.current = false;
          }, 50);
        }
    }

    loadItem();

    return () => {
      cancelled = true;
    };
  }, [selectedItemId, reset, campaignId]);

  useEffect(() => {
    setTagInput('');
    setTagSuggestions([]);
    setActiveTagIndex(-1);
    setTagsFocused(false);
    setPickerOpen(false);
    setPickerQuery('');
  }, [selectedItemId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setRecentForgeItemIds([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(recentForgeStorageKey);
      if (!raw) {
        setRecentForgeItemIds([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setRecentForgeItemIds([]);
        return;
      }
      const sanitized = parsed
        .map((value) => String(value))
        .filter((value) => value.trim().length > 0)
        .slice(0, MAX_RECENT_PICKER_ITEMS);
      setRecentForgeItemIds(sanitized);
    } catch {
      setRecentForgeItemIds([]);
    }
  }, [recentForgeStorageKey]);

  useEffect(() => {
    const availableIds = new Set((forgeItems ?? []).map((row) => row.id));
    setRecentForgeItemIds((prev) => {
      const next = prev.filter((id) => availableIds.has(id));
      if (next.length !== prev.length) {
        persistRecentForgeItemIds(next);
      }
      return next;
    });
  }, [forgeItems]);

  useEffect(() => {
    setPickerFiltersOpen(false);
    setPickerLevelSelected([]);
    setPickerExcludeLegendary(false);
  }, [campaignId]);

  const selectedType = watch('type');
  const selectedRarity = watch('rarity');
  const isWeapon = selectedType === 'WEAPON';
  const isArmor = selectedType === 'ARMOR';
  const isShield = selectedType === 'SHIELD';
  const isItem = selectedType === 'ITEM';
  const isConsumable = selectedType === 'CONSUMABLE';
  const isMythic = selectedRarity === 'MYTHIC';
  const mythicTemplateItemType: MythicItemType | null =
    selectedType === 'WEAPON' ||
    selectedType === 'ARMOR' ||
    selectedType === 'SHIELD' ||
    selectedType === 'ITEM'
      ? selectedType
      : null;
  const showMythicLimitBreakSection =
    isMythic && mythicTemplateItemType !== null;

  // Live calculator values
  const watchedValues = watch();

  const calculatorContext: ForgeCalculatorContext = {
    damageTypes: data?.damageTypes ?? [],
    attackEffects: data?.attackEffects ?? [],
    defEffects: data?.defEffects ?? [],
    weaponAttributes: data?.weaponAttributes ?? [],
    armorAttributes: data?.armorAttributes ?? [],
    shieldAttributes: data?.shieldAttributes ?? [],
    wardingOptions: data?.wardingOptions ?? [],
    sanctifiedOptions: data?.sanctifiedOptions ?? [],
    vrpEntries,
  };

  const currentTags = Array.isArray(watchedValues.tags) ? watchedValues.tags : [];
  const currentTagToken = tokenFromTagInput(tagInput);
  const filteredTagSuggestions = tagSuggestions.filter(
    (suggestion) => !currentTags.some((tag) => tag.toLowerCase() === suggestion.value.toLowerCase()),
  );
  const isTagDropdownOpen = tagsFocused && currentTagToken.length >= 2;

  useEffect(() => {
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
          `/api/forge/tags?campaignId=${encodeURIComponent(campaignId)}&s=${encodeURIComponent(currentTagToken)}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        if (!res.ok) throw new Error('Failed to load tag suggestions');
        const json = (await res.json()) as { suggestions?: TagSuggestion[] };
        setTagSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
      } catch (err) {
        if ((err as { name?: string }).name !== 'AbortError') {
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
  }, [campaignId, currentTagToken]);

  useEffect(() => {
    if (!isTagDropdownOpen || filteredTagSuggestions.length === 0) {
      setActiveTagIndex(-1);
      return;
    }
    setActiveTagIndex(-1);
  }, [filteredTagSuggestions, isTagDropdownOpen]);

  function commitTagInput(rawValue?: string) {
    const valueToCommit = rawValue ?? tagInput;
    const parsed = listFromCsv(valueToCommit);

    if (parsed.length > 0) {
      const nextTags = [...(getValues('tags') ?? [])];
      for (const part of parsed) {
        const canonical = canonicalizeTag(part, tagSuggestions, nextTags);
        if (!canonical) continue;
        nextTags.push(canonical);
      }
      setValue('tags', nextTags, { shouldDirty: true, shouldValidate: false });
    }

    setTagInput('');
    setTagSuggestions([]);
    setActiveTagIndex(-1);
  }


  const safeCustomWeaponAttributes =
    (watchedValues.customWeaponAttributes ?? '').toString();
  const safeCustomWeaponAttributesTrimmed = safeCustomWeaponAttributes.trim();

  const safeCustomArmorAttributes =
    (watchedValues.customArmorAttributes ?? '').toString();
  const safeCustomArmorAttributesTrimmed = safeCustomArmorAttributes.trim();

  const safeCustomShieldAttributes =
    (watchedValues.customShieldAttributes ?? '').toString();
  const safeCustomShieldAttributesTrimmed = safeCustomShieldAttributes.trim();

  const safeCustomItemAttributes =
    (watchedValues.customItemAttributes ?? '').toString();
  const safeCustomItemAttributesTrimmed = safeCustomItemAttributes.trim();

  const calculatorTotals = calculateForgeTotals(
    watchedValues,
    (data?.config ?? []) as ForgeConfigRow[],
    (data?.costs ?? []) as ForgeCostRow[],
    calculatorContext,
  );

  // Descriptor debug toggle (keep OUT of JSX or TS will scream)
  const DEBUG_DESCRIPTORS = false;

  // Clear type-specific validation errors when switching item type
  useEffect(() => {
    clearErrors([
      'ppv',
      'mpv',
      'rangeCategories',
      'meleeDamageTypeIds',
      'rangedDamageTypeIds',
      'aoeDamageTypeIds',
    ]);
  }, [selectedType, clearErrors]);


  const selectedRangeCategories = watch('rangeCategories') ?? [];
  const selectedAoeShape = watch('aoeShape');
  const globalAttributeModifiers =
    (watch('globalAttributeModifiers') as GlobalAttributeModifierForm[] | undefined) ??
    [];

  // AoE shape change cleanup — prevent stale geometry from sticking around
  useEffect(() => {
    const rangeCats = (selectedRangeCategories ?? []) as RangeCategory[];
    const hasAoe = rangeCats.includes('AOE');

    // If AoE isn't selected, do nothing here — toggleRangeCategory already clears.
    if (!hasAoe) return;

    if (selectedAoeShape === 'SPHERE') {
      setValue('aoeConeLengthFeet', null, { shouldDirty: true });
      setValue('aoeLineWidthFeet', null, { shouldDirty: true });
      setValue('aoeLineLengthFeet', null, { shouldDirty: true });
    } else if (selectedAoeShape === 'CONE') {
      setValue('aoeSphereRadiusFeet', null, { shouldDirty: true });
      setValue('aoeLineWidthFeet', null, { shouldDirty: true });
      setValue('aoeLineLengthFeet', null, { shouldDirty: true });
    } else if (selectedAoeShape === 'LINE') {
      setValue('aoeSphereRadiusFeet', null, { shouldDirty: true });
      setValue('aoeConeLengthFeet', null, { shouldDirty: true });
    } else {
      // Shape cleared / unset — wipe all geometry
      setValue('aoeSphereRadiusFeet', null, { shouldDirty: true });
      setValue('aoeConeLengthFeet', null, { shouldDirty: true });
      setValue('aoeLineWidthFeet', null, { shouldDirty: true });
      setValue('aoeLineLengthFeet', null, { shouldDirty: true });
    }
  }, [selectedAoeShape, selectedRangeCategories, setValue]);

  const meleeDamageTypeIds = watch('meleeDamageTypeIds') ?? [];
  const rangedDamageTypeIds = watch('rangedDamageTypeIds') ?? [];
  const aoeDamageTypeIds = watch('aoeDamageTypeIds') ?? [];

  const attackEffectMeleeIds = watch('attackEffectMeleeIds') ?? [];
  const attackEffectRangedIds = watch('attackEffectRangedIds') ?? [];
  const attackEffectAoEIds = watch('attackEffectAoEIds') ?? [];

  const weaponAttributeIds = watch('weaponAttributeIds') ?? [];
  const weaponAttributeStrengthSources =
  (watch('weaponAttributeStrengthSources') ?? {}) as Record<string, any>;

  const weaponAttributeRangeSelections =
  (watch('weaponAttributeRangeSelections') ?? {}) as Record<string, any>;

  const size = watch('size');
  const shieldHasAttack = watch('shieldHasAttack') ?? false;

  // Attack section enabled:
  // - Weapons always attack
  // - Shields only attack if Size is selected AND HasAttack is true
  const hasSize = !!size;

  const isWeaponLike =
    isWeapon ||
    (isShield && hasSize && shieldHasAttack);

  // If item type changes, clear shared size + shield attack toggle
  // (but never during hydration, or it wipes loaded weapons/shields)
  useEffect(() => {
    if (isHydratingRef.current) return;

    setValue('size', null, { shouldDirty: true });
    setValue('shieldHasAttack', false, { shouldDirty: true });
    setValue('selectedMythicLimitBreakId', null, { shouldDirty: true });
    setValue('mythicLbPushTemplateId', null, { shouldDirty: true });
    setValue('mythicLbBreakTemplateId', null, { shouldDirty: true });
    setValue('mythicLbTranscendTemplateId', null, { shouldDirty: true });
  }, [selectedType, setValue]);

  useEffect(() => {
    if (isHydratingRef.current) return;
    if (selectedRarity === 'MYTHIC') return;

    setValue('selectedMythicLimitBreakId', null, { shouldDirty: true });
    setValue('mythicLbPushTemplateId', null, { shouldDirty: true });
    setValue('mythicLbBreakTemplateId', null, { shouldDirty: true });
    setValue('mythicLbTranscendTemplateId', null, { shouldDirty: true });
  }, [selectedRarity, setValue]);


  // If shield loses size, force HasAttack = false
  useEffect(() => {
    if (!isShield) return;
    if (!hasSize && shieldHasAttack) {
      setValue('shieldHasAttack', false, { shouldDirty: true });
    }
  }, [isShield, hasSize, shieldHasAttack, setValue]);

  const armorAttributeIds = watch('armorAttributeIds') ?? [];
  const defEffectIds = watch('defEffectIds') ?? [];
  const wardingOptionIds = watch('wardingOptionIds') ?? [];
  const sanctifiedOptionIds = watch('sanctifiedOptionIds') ?? [];
  const shieldAttributeIds = watch('shieldAttributeIds') ?? [];
  const selectedMythicLimitBreakId = watch('selectedMythicLimitBreakId') ?? null;

  const armorLocation = watch('armorLocation');
  const hasArmorLocation = !!armorLocation;

  const itemLocation = watch('itemLocation') ?? '';
  const hasItemLocation =
    typeof itemLocation === 'string' && itemLocation.trim().length > 0;

    const itemLocationOptions =
    (data?.config ?? []).filter(
      (entry: any) =>
        typeof entry.category === 'string' &&
        entry.category.toLowerCase() === 'item_location',
    );

  useEffect(() => {
    let cancelled = false;

    async function loadMythicLimitBreakTemplates() {
      if (!showMythicLimitBreakSection || !mythicTemplateItemType) {
        setMythicLbTemplates([]);
        setMythicLbTemplatesError(null);
        setMythicLbTemplatesLoading(false);
        return;
      }

      setMythicLbTemplatesLoading(true);
      setMythicLbTemplatesError(null);

      try {
        const res = await fetch(
          `/api/forge/limit-break-templates?campaignId=${encodeURIComponent(
            campaignId,
          )}&itemType=${encodeURIComponent(mythicTemplateItemType)}`,
          { cache: 'no-store' },
        );

        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error ?? `Failed to load templates (${res.status})`);
        }

        if (cancelled) return;

        const rows = Array.isArray(payload?.rows)
          ? (payload.rows as MythicLimitBreakTemplateRow[])
          : [];

        const tierOrder: Record<LimitBreakTier, number> = {
          PUSH: 0,
          BREAK: 1,
          TRANSCEND: 2,
        };

        rows.sort((a, b) => {
          const tierDelta = tierOrder[a.tier] - tierOrder[b.tier];
          if (tierDelta !== 0) return tierDelta;
          return a.name.localeCompare(b.name);
        });

        setMythicLbTemplates(rows);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Failed to load mythic limit break templates';
        setMythicLbTemplates([]);
        setMythicLbTemplatesError(message);
      } finally {
        if (!cancelled) {
          setMythicLbTemplatesLoading(false);
        }
      }
    }

    void loadMythicLimitBreakTemplates();

    return () => {
      cancelled = true;
    };
  }, [campaignId, showMythicLimitBreakSection, mythicTemplateItemType]);

  const mythicPushTemplates = mythicLbTemplates.filter((t) => t.tier === 'PUSH');
  const mythicBreakTemplates = mythicLbTemplates.filter((t) => t.tier === 'BREAK');
  const mythicTranscendTemplates = mythicLbTemplates.filter(
    (t) => t.tier === 'TRANSCEND',
  );

  const selectedMythicTemplate =
    mythicLbTemplates.find((t) => t.id === selectedMythicLimitBreakId) ?? null;

  const attributeCostEntries = (data?.costs ?? []) as any[];
  const attributeNames = Array.from(
    new Set(
      attributeCostEntries
        .filter((entry: any) => {
          const category =
            typeof entry.category === 'string'
              ? entry.category.toLowerCase()
              : '';
          const selector2 =
            typeof entry.selector2 === 'string'
              ? entry.selector2.trim()
              : '';
          return category === 'attribute' && selector2.length > 0;
        })
        .map((entry: any) => (entry.selector2 as string).trim()),
    ),
  ).sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    if (!attributeNames.length) return;

    setGlobalAttributeSelection((current) => {
      if (attributeNames.includes(current)) return current;
      if (attributeNames.includes('Attack')) return 'Attack';
      return attributeNames[0];
    });

    setGlobalAttributeAmount((current) => {
      if (current >= 1 && current <= 5) return current;
      return 1;
    });
  }, [attributeNames]);

  const auraPhysicalAttrId = armorAttrsFromPicklist.find(
    (a) => a.name === 'Aura (Physical)',
  )?.id;
  const auraMentalAttrId = armorAttrsFromPicklist.find(
    (a) => a.name === 'Aura (Mental)',
  )?.id;
  const wardingAttrId = armorAttrsFromPicklist.find(
    (a) => a.name === 'Warding',
  )?.id;
  const sanctifiedAttrId = armorAttrsFromPicklist.find(
    (a) => a.name === 'Sanctified',
  )?.id;

  const hasAuraPhysicalAttr =
    !!auraPhysicalAttrId && armorAttributeIds.includes(auraPhysicalAttrId);
  const hasAuraMentalAttr =
    !!auraMentalAttrId && armorAttributeIds.includes(auraMentalAttrId);
  const hasWardingAttr =
    !!wardingAttrId && armorAttributeIds.includes(wardingAttrId);
  const hasSanctifiedAttr =
    !!sanctifiedAttrId && armorAttributeIds.includes(sanctifiedAttrId);

  // Strength is now gated by selected damage types (not the other way round).
  const meleePhysicalStrength = Number(watch('meleePhysicalStrength') ?? 0);
  const meleeMentalStrength = Number(watch('meleeMentalStrength') ?? 0);
  const rangedPhysicalStrength = Number(watch('rangedPhysicalStrength') ?? 0);
  const rangedMentalStrength = Number(watch('rangedMentalStrength') ?? 0);
  const aoePhysicalStrength = Number(watch('aoePhysicalStrength') ?? 0);
  const aoeMentalStrength = Number(watch('aoeMentalStrength') ?? 0);

  // Once size is selected, all damage types are available (no strength gating).
  const availableDamageTypes = data && hasSize ? data.damageTypes : [];

  // Invariant enforcement:
  // - PhysicalStrength > 0 requires ≥1 PHYSICAL damage type selected (per range)
  // - MentalStrength > 0 requires ≥1 MENTAL damage type selected (per range)
  useEffect(() => {
    if (!data) return;
    if (!hasSize) return;

    const countFamilies = (ids: number[]) => {
      let physical = 0;
      let mental = 0;

      for (const id of ids) {
        const dt = data.damageTypes.find((d) => d.id === id);
        const mode = getDamageTypeMode(dt as any);
        if (mode === 'MENTAL') mental += 1;
        else if (mode === 'PHYSICAL') physical += 1;
      }

      return { physical, mental };
    };

    const enforce = (
      damageField: 'meleeDamageTypeIds' | 'rangedDamageTypeIds' | 'aoeDamageTypeIds',
      physicalField:
        | 'meleePhysicalStrength'
        | 'rangedPhysicalStrength'
        | 'aoePhysicalStrength',
      mentalField:
        | 'meleeMentalStrength'
        | 'rangedMentalStrength'
        | 'aoeMentalStrength',
    ) => {
      const ids = (watch(damageField) ?? []) as number[];
      const { physical, mental } = countFamilies(ids);

      if (physical === 0 && Number(watch(physicalField) ?? 0) > 0) {
        setValue(physicalField, 0 as any, { shouldDirty: true, shouldValidate: true });
      }

      if (mental === 0 && Number(watch(mentalField) ?? 0) > 0) {
        setValue(mentalField, 0 as any, { shouldDirty: true, shouldValidate: true });
      }
    };

    enforce('meleeDamageTypeIds', 'meleePhysicalStrength', 'meleeMentalStrength');
    enforce('rangedDamageTypeIds', 'rangedPhysicalStrength', 'rangedMentalStrength');
    enforce('aoeDamageTypeIds', 'aoePhysicalStrength', 'aoeMentalStrength');
  }, [data, hasSize, meleePhysicalStrength, meleeMentalStrength, rangedPhysicalStrength, rangedMentalStrength, aoePhysicalStrength, aoeMentalStrength]);

  // Filtered GS options based on selected damage types
  const meleeAvailableAttackEffects =
    data && meleeDamageTypeIds.length
      ? filterAttackEffectsForDamageTypes(
          data.attackEffects,
          data.damageTypes,
          meleeDamageTypeIds,
        )
      : [];

  const rangedAvailableAttackEffects =
    data && rangedDamageTypeIds.length
      ? filterAttackEffectsForDamageTypes(
          data.attackEffects,
          data.damageTypes,
          rangedDamageTypeIds,
        )
      : [];

    const aoeAvailableAttackEffects =
    data && aoeDamageTypeIds.length
      ? filterAttackEffectsForDamageTypes(
          data.attackEffects,
          data.damageTypes,
          aoeDamageTypeIds,
        )
      : [];

    // When size is unset, nuke all weapon-only state
    useEffect(() => {
      // Never wipe loaded weapon/shield data while reset() is hydrating the form
      if (isHydratingRef.current) return;

      // Only applies to weapon-like types
      if (selectedType !== 'WEAPON' && selectedType !== 'SHIELD') return;

      if (hasSize) return;

      setValue('size', null, { shouldDirty: true });

      setValue('rangeCategories', [], { shouldDirty: true });

      setValue('meleeTargets', null, { shouldDirty: true });
      setValue('rangedTargets', null, { shouldDirty: true });

      setValue('rangedDistanceFeet', null, { shouldDirty: true });

      setValue('aoeCenterRangeFeet', null, { shouldDirty: true });
      setValue('aoeCount', null, { shouldDirty: true });
      setValue('aoeShape', null, { shouldDirty: true });

      setValue('aoeSphereRadiusFeet', null, { shouldDirty: true });
      setValue('aoeConeLengthFeet', null, { shouldDirty: true });
      setValue('aoeLineWidthFeet', null, { shouldDirty: true });
      setValue('aoeLineLengthFeet', null, { shouldDirty: true });

      setValue('meleeDamageTypeIds', [], { shouldDirty: true });
      setValue('rangedDamageTypeIds', [], { shouldDirty: true });
      setValue('aoeDamageTypeIds', [], { shouldDirty: true });

      setValue('attackEffectMeleeIds', [], { shouldDirty: true });
      setValue('attackEffectRangedIds', [], { shouldDirty: true });
      setValue('attackEffectAoEIds', [], { shouldDirty: true });

      setValue('weaponAttributeIds', [], { shouldDirty: true });
      setValue('weaponAttributeStrengthSources', {}, { shouldDirty: true });
      setValue('customWeaponAttributes', '', { shouldDirty: true });
      }, [hasSize, selectedType, setValue]);

  // When type is NOT ARMOR, clear armor-only state (leave shared PPV/MPV alone)
  useEffect(() => {
    if (selectedType === 'ARMOR') return;

    setValue('armorLocation', null, { shouldDirty: true });
    setValue('auraPhysical', null, { shouldDirty: true });
    setValue('auraMental', null, { shouldDirty: true });
    setValue('armorAttributeIds', [], { shouldDirty: true });
    setValue('defEffectIds', [], { shouldDirty: true });
    setValue('wardingOptionIds', [], { shouldDirty: true });
    setValue('sanctifiedOptionIds', [], { shouldDirty: true });
  }, [selectedType, setValue]);


  // When type is NOT ITEM, clear item-only state
  useEffect(() => {
    if (selectedType === 'ITEM') return;

    setValue('itemLocation', null, { shouldDirty: true });
    setValue('customItemAttributes', '', { shouldDirty: true });
  }, [selectedType, setValue]);

  // Reset VRP completely whenever item type changes
  // (BUT: do not wipe VRP during hydration from the DB)
  useEffect(() => {
    if (isHydratingRef.current) return;

    if (!isHydratingRef.current) {
      setVrpEntries([]);
    }
    setVrpEffectKind('VULNERABILITY');
    setVrpMagnitude(1);
    setVrpDamageTypeId(null);
  }, [selectedType]);

    // When armor location is cleared, wipe armor state; when set, ensure PPV/MPV default to 0
  useEffect(() => {
    // Do NOT touch PPV/MPV or armor-specific fields unless we're actually on an ARMOR item
    if (!isArmor) return;

    if (!hasArmorLocation) {
      setValue('ppv', null, { shouldDirty: true });
      setValue('mpv', null, { shouldDirty: true });
      setValue('auraPhysical', null, { shouldDirty: true });
      setValue('auraMental', null, { shouldDirty: true });
      setValue('armorAttributeIds', [], { shouldDirty: true });
      setValue('defEffectIds', [], { shouldDirty: true });
      setValue('wardingOptionIds', [], { shouldDirty: true });
      setValue('sanctifiedOptionIds', [], { shouldDirty: true });
      setValue('customArmorAttributes', '', { shouldDirty: true });
      if (!isHydratingRef.current) {
        setVrpEntries([]);
      }
      return;
    }

    const currentPpv = watch('ppv');
    const currentMpv = watch('mpv');

    if (
      currentPpv === null ||
      currentPpv === undefined ||
      Number.isNaN(currentPpv)
    ) {
      setValue('ppv', 0, { shouldDirty: true });
    }
    if (
      currentMpv === null ||
      currentMpv === undefined ||
      Number.isNaN(currentMpv)
    ) {
      setValue('mpv', 0, { shouldDirty: true });
    }
  }, [isArmor, hasArmorLocation, setValue]);

  // When type is SHIELD, ensure PPV/MPV default to 0 if unset
useEffect(() => {
  if (selectedType !== 'SHIELD') return;

  const currentPpv = watch('ppv');
  const currentMpv = watch('mpv');

  if (currentPpv === null || currentPpv === undefined || Number.isNaN(currentPpv)) {
    setValue('ppv', 0, { shouldDirty: true });
  }
  if (currentMpv === null || currentMpv === undefined || Number.isNaN(currentMpv)) {
    setValue('mpv', 0, { shouldDirty: true });
  }
}, [selectedType, setValue]);

  // Aura (Physical) defaulting/clearing when its attribute toggles
  useEffect(() => {
    if (!hasAuraPhysicalAttr) {
      setValue('auraPhysical', null, { shouldDirty: true });
      return;
    }

    const current = watch('auraPhysical');
    if (current === null || current === undefined || Number.isNaN(current)) {
      setValue('auraPhysical', 1, { shouldDirty: true });
    }
  }, [hasAuraPhysicalAttr, setValue]);

  // Aura (Mental) defaulting/clearing when its attribute toggles
  useEffect(() => {
    if (!hasAuraMentalAttr) {
      setValue('auraMental', null, { shouldDirty: true });
      return;
    }

    const current = watch('auraMental');
    if (current === null || current === undefined || Number.isNaN(current)) {
      setValue('auraMental', 1, { shouldDirty: true });
    }
  }, [hasAuraMentalAttr, setValue]);

  // Clear warding options when Warding attribute is removed
  useEffect(() => {
    if (!hasWardingAttr && wardingOptionIds.length) {
      setValue('wardingOptionIds', [], { shouldDirty: true });
    }
  }, [hasWardingAttr, wardingOptionIds, setValue]);

  // Clear sanctified options when Sanctified attribute is removed
  useEffect(() => {
    if (!hasSanctifiedAttr && sanctifiedOptionIds.length) {
      setValue('sanctifiedOptionIds', [], { shouldDirty: true });
    }
  }, [hasSanctifiedAttr, sanctifiedOptionIds, setValue]);

  // NOTE: Damage types are no longer gated by strength, so we do not prune selections here.
  // Strength is enforced by selected damage types in the invariant effect above.

  // Melee GS cleanup
  useEffect(() => {
    if (!data) return;

    if (!meleeDamageTypeIds.length) {
      if (attackEffectMeleeIds.length) {
        setValue('attackEffectMeleeIds', [], { shouldDirty: true });
      }
      return;
    }

    const allowedIds = new Set(
      filterAttackEffectsForDamageTypes(
        data.attackEffects,
        data.damageTypes,
        meleeDamageTypeIds,
      ).map((fx) => fx.id),
    );

    const filtered = attackEffectMeleeIds.filter((id) => allowedIds.has(id));
    if (filtered.length !== attackEffectMeleeIds.length) {
      setValue('attackEffectMeleeIds', filtered, { shouldDirty: true });
    }
  }, [data, meleeDamageTypeIds, attackEffectMeleeIds, setValue]);

  // Ranged GS cleanup
  useEffect(() => {
    if (!data) return;

    if (!rangedDamageTypeIds.length) {
      if (attackEffectRangedIds.length) {
        setValue('attackEffectRangedIds', [], { shouldDirty: true });
      }
      return;
    }

    const allowedIds = new Set(
      filterAttackEffectsForDamageTypes(
        data.attackEffects,
        data.damageTypes,
        rangedDamageTypeIds,
      ).map((fx) => fx.id),
    );

    const filtered = attackEffectRangedIds.filter((id) =>
      allowedIds.has(id),
    );
    if (filtered.length !== attackEffectRangedIds.length) {
      setValue('attackEffectRangedIds', filtered, { shouldDirty: true });
    }
  }, [data, rangedDamageTypeIds, attackEffectRangedIds, setValue]);

  // AoE GS cleanup
  useEffect(() => {
    if (!data) return;

    if (!aoeDamageTypeIds.length) {
      if (attackEffectAoEIds.length) {
        setValue('attackEffectAoEIds', [], { shouldDirty: true });
      }
      return;
    }

    const allowedIds = new Set(
      filterAttackEffectsForDamageTypes(
        data.attackEffects,
        data.damageTypes,
        aoeDamageTypeIds,
      ).map((fx) => fx.id),
    );

    const filtered = attackEffectAoEIds.filter((id) => allowedIds.has(id));
    if (filtered.length !== attackEffectAoEIds.length) {
      setValue('attackEffectAoEIds', filtered, { shouldDirty: true });
    }
  }, [data, aoeDamageTypeIds, attackEffectAoEIds, setValue]);

  type NumberArrayFieldName =
    | 'meleeDamageTypeIds'
    | 'rangedDamageTypeIds'
    | 'aoeDamageTypeIds'
    | 'attackEffectMeleeIds'
    | 'attackEffectRangedIds'
    | 'attackEffectAoEIds'
    | 'weaponAttributeIds'
    | 'armorAttributeIds'
    | 'shieldAttributeIds'
    | 'defEffectIds'
    | 'wardingOptionIds'
    | 'sanctifiedOptionIds';

  function toggleNumberArrayField(field: NumberArrayFieldName, id: number) {
    const current = ((watch(field as any) ?? []) as number[]);
    const exists = current.includes(id);
    const next = exists ? current.filter((x) => x !== id) : [...current, id];
    setValue(field as any, next as any, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function toggleWeaponAttributeIdExclusive(
    clickedId: number,
    clickedName: string,
    allAttrs: WeaponAttribute[],
  ) {
    const current = ((watch('weaponAttributeIds') ?? []) as number[]);

    // Treat "Dangerous 3" / "Reload 5" as baseName + magnitude.
    const match = clickedName.match(/^(.*\D)\s+(\d+)$/);
    const baseName = (match ? match[1] : clickedName).trim();

    const isExclusiveFamily = baseName === 'Dangerous' || baseName === 'Reload';

    // If exclusive, remove any other picked ids from the same family first.
    let pruned = current;
    if (isExclusiveFamily) {
      const familyIds = allAttrs
        .filter((a) => {
          const m = a.name.match(/^(.*\D)\s+(\d+)$/);
          const b = (m ? m[1] : a.name).trim();
          return b === baseName && a.id !== clickedId;
        })
        .map((a) => a.id);

      if (familyIds.length) {
        pruned = pruned.filter((id) => !familyIds.includes(id));
      }
    }

    // Then apply normal toggle semantics for the clicked id.
    const exists = pruned.includes(clickedId);
    const next = exists
      ? pruned.filter((x) => x !== clickedId)
      : [...pruned, clickedId];

    setValue('weaponAttributeIds', next, {
      shouldDirty: true,
      shouldValidate: true,
    });

    // Keep strength-source map aligned to selected ids
    const currentSources =
      (watch('weaponAttributeStrengthSources') ?? {}) as Record<string, any>;

    const allowed = new Set(next.map((id) => String(id)));
    const prunedSources: Record<string, 'MELEE' | 'RANGED' | 'AOE' | null> = {};

    for (const [k, v] of Object.entries(currentSources)) {
      if (!allowed.has(k)) continue;
      prunedSources[k] =
        v === 'MELEE' || v === 'RANGED' || v === 'AOE' ? v : null;
    }

    setValue('weaponAttributeStrengthSources', prunedSources as any, {
      shouldDirty: true,
      shouldValidate: false,
    });
  }

      function toggleRangeCategory(category: RangeCategory) {

      const current = (watch('rangeCategories') ?? []) as RangeCategory[];
      const exists = current.includes(category);
      const next = exists
        ? current.filter((c) => c !== category)
        : [...current, category];

      setValue('rangeCategories', next, {
        shouldDirty: true,
        shouldValidate: true,
      });

      if (exists) {
        // We just turned this category OFF – clear dependent fields
        if (category === 'MELEE') {
          setValue('meleeTargets', null, { shouldDirty: true, shouldValidate: true });
          setValue('meleeDamageTypeIds', [], { shouldDirty: true, shouldValidate: true });
          setValue('attackEffectMeleeIds', [], { shouldDirty: true, shouldValidate: true });
        } else if (category === 'RANGED') {
          setValue('rangedTargets', null, { shouldDirty: true, shouldValidate: true });
          setValue('rangedDistanceFeet', null, { shouldDirty: true, shouldValidate: true });
          setValue('rangedDamageTypeIds', [], { shouldDirty: true, shouldValidate: true });
          setValue('attackEffectRangedIds', [], { shouldDirty: true, shouldValidate: true });
        } else if (category === 'AOE') {
          setValue('aoeCenterRangeFeet', null, { shouldDirty: true, shouldValidate: true });
          setValue('aoeCount', null, { shouldDirty: true, shouldValidate: true });
          setValue('aoeShape', null, { shouldDirty: true, shouldValidate: true });
          setValue('aoeSphereRadiusFeet', null, { shouldDirty: true, shouldValidate: true });
          setValue('aoeConeLengthFeet', null, { shouldDirty: true, shouldValidate: true });
          setValue('aoeLineWidthFeet', null, { shouldDirty: true, shouldValidate: true });
          setValue('aoeLineLengthFeet', null, { shouldDirty: true, shouldValidate: true });
          setValue('aoeDamageTypeIds', [], { shouldDirty: true, shouldValidate: true });
          setValue('attackEffectAoEIds', [], { shouldDirty: true, shouldValidate: true });
        }
      } else {
        // We just turned this category ON – initialise sensible defaults
        if (category === 'MELEE') {
          const currentMeleeTargets = watch('meleeTargets') as
            | number
            | null
            | undefined;
          if (
            currentMeleeTargets === null ||
            currentMeleeTargets === undefined ||
            Number.isNaN(currentMeleeTargets)
          ) {
            setValue('meleeTargets', 1, { shouldDirty: true, shouldValidate: true });
          }
        } else if (category === 'RANGED') {
          const currentRangedTargets = watch('rangedTargets') as
            | number
            | null
            | undefined;
          if (
            currentRangedTargets === null ||
            currentRangedTargets === undefined ||
            Number.isNaN(currentRangedTargets)
          ) {
            setValue('rangedTargets', 1, { shouldDirty: true, shouldValidate: true });
          }
        } else if (category === 'AOE') {
          const currentAoeCount = watch('aoeCount') as
            | number
            | null
            | undefined;
          if (
            currentAoeCount === null ||
            currentAoeCount === undefined ||
            Number.isNaN(currentAoeCount)
          ) {
            setValue('aoeCount', 1, { shouldDirty: true, shouldValidate: true });
          }
        }
      }
    }

  function isRangeCategorySelected(category: RangeCategory) {
    return selectedRangeCategories.includes(category);
  }

    function validateOptionalInRange(
    value: number | null | undefined,
    min: number,
    max: number,
    label: string,
  ) {
    if (value === undefined || value === null || Number.isNaN(value)) {
      return true; // empty is fine
    }
    return (
      (value >= min && value <= max) ||
      `${label} must be between ${min} and ${max}`
    );
  }

   function toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function toNullableEnum<T extends string>(
    value: T | '' | null | undefined,
  ): T | null {
    if (!value || value === '') return null;
    return value;
  }

  async function onSubmit(values: ForgeFormValues) {
    setSubmitError(null);
    setSubmitSuccess(null);
    setCreatedItem(null);

    try {
      const isEdit = Boolean(selectedItemId);
      const id = isEdit ? selectedItemId! : `ITEM-${Date.now()}`;
      const normalizedTags = [...(values.tags ?? [])];
      for (const part of listFromCsv(tagInput)) {
        const canonical = canonicalizeTag(part, tagSuggestions, normalizedTags);
        if (!canonical) continue;
        normalizedTags.push(canonical);
      }
      setValue('tags', normalizedTags, { shouldDirty: true, shouldValidate: false });
      setTagInput('');
      setTagSuggestions([]);
      setActiveTagIndex(-1);

      const normalizedSelectedMythicLimitBreakId = normalizeOptionalId(
        values.selectedMythicLimitBreakId,
      );
      const canAttachMythicLimitBreak =
        values.rarity === 'MYTHIC' &&
        (values.type === 'WEAPON' ||
          values.type === 'ARMOR' ||
          values.type === 'SHIELD' ||
          values.type === 'ITEM');

      let mythicLbPushTemplateId: string | null = null;
      let mythicLbBreakTemplateId: string | null = null;
      let mythicLbTranscendTemplateId: string | null = null;

      if (canAttachMythicLimitBreak && normalizedSelectedMythicLimitBreakId) {
        const selectedTemplate =
          mythicLbTemplates.find(
            (template) => template.id === normalizedSelectedMythicLimitBreakId,
          ) ?? null;

        if (selectedTemplate) {
          if (selectedTemplate.tier === 'PUSH') {
            mythicLbPushTemplateId = selectedTemplate.id;
          } else if (selectedTemplate.tier === 'BREAK') {
            mythicLbBreakTemplateId = selectedTemplate.id;
          } else {
            mythicLbTranscendTemplateId = selectedTemplate.id;
          }
        }
      }

      const basePayload = {
        itemUrl:
        values.itemUrl && values.itemUrl.trim()
        ? values.itemUrl.trim()
        : null,
        name: values.name,
        rarity: values.rarity,
        level: values.level,
        generalDescription: values.generalDescription,
        type: values.type,

        // Weapon / shield core
        size: toNullableEnum<WeaponSize>(values.size ?? null),

        // Per-range Strength (Physical/Mental)
        meleePhysicalStrength: toNullableNumber(values.meleePhysicalStrength) ?? 0,
        meleeMentalStrength: toNullableNumber(values.meleeMentalStrength) ?? 0,
        rangedPhysicalStrength: toNullableNumber(values.rangedPhysicalStrength) ?? 0,
        rangedMentalStrength: toNullableNumber(values.rangedMentalStrength) ?? 0,
        aoePhysicalStrength: toNullableNumber(values.aoePhysicalStrength) ?? 0,
        aoeMentalStrength: toNullableNumber(values.aoeMentalStrength) ?? 0,

        meleeTargets: toNullableNumber(values.meleeTargets) ?? 1,
        rangedTargets: toNullableNumber(values.rangedTargets) ?? 1,


        // Ranged / AoE geometry
        rangedDistanceFeet: toNullableNumber(values.rangedDistanceFeet),
        aoeCenterRangeFeet: toNullableNumber(values.aoeCenterRangeFeet),
        aoeCount: toNullableNumber(values.aoeCount),
        aoeShape: toNullableEnum<AoEShape>(values.aoeShape ?? null),
        aoeSphereRadiusFeet: toNullableNumber(values.aoeSphereRadiusFeet),
        aoeConeLengthFeet: toNullableNumber(values.aoeConeLengthFeet),
        aoeLineWidthFeet: toNullableNumber(values.aoeLineWidthFeet),
        aoeLineLengthFeet: toNullableNumber(values.aoeLineLengthFeet),

        // Armor
        armorLocation: toNullableEnum<ArmorLocation>(
          values.armorLocation ?? null,
        ),
        ppv: toNullableNumber(values.ppv),
        mpv: toNullableNumber(values.mpv),
        auraPhysical: toNullableNumber(values.auraPhysical),
        auraMental: toNullableNumber(values.auraMental),
 
        // Item
        itemLocation: toNullableEnum<ItemLocation>(
          values.itemLocation ?? null,
        ),

        // Shield
        shieldHasAttack:
          values.type === 'SHIELD'
            ? Boolean(values.shieldHasAttack)
            : null,

        // Tags and relations
        tags: normalizedTags,
        rangeCategories: values.rangeCategories,

        meleeDamageTypeIds: values.meleeDamageTypeIds,
        rangedDamageTypeIds: values.rangedDamageTypeIds,
        aoeDamageTypeIds: values.aoeDamageTypeIds,

        attackEffectMeleeIds: values.attackEffectMeleeIds,
        attackEffectRangedIds: values.attackEffectRangedIds,
        attackEffectAoEIds: values.attackEffectAoEIds,

        weaponAttributes: (values.weaponAttributeIds ?? []).map((weaponAttributeId) => {
          const key = String(weaponAttributeId);

          const rawStrength = (values.weaponAttributeStrengthSources ?? {})[key];
          const strengthSource =
            rawStrength === 'MELEE' || rawStrength === 'RANGED' || rawStrength === 'AOE'
              ? rawStrength
              : null;

          const rawRange = (values.weaponAttributeRangeSelections ?? {})[key];
          const rangeSource =
            rawRange === 'MELEE' || rawRange === 'RANGED' || rawRange === 'AOE'
              ? rawRange
              : null;

          return {
            weaponAttributeId,
            strengthSource,
            rangeSource,
          };
        }),
        armorAttributeIds: values.armorAttributeIds,
        shieldAttributeIds: values.shieldAttributeIds,
        defEffectIds: values.defEffectIds,
        wardingOptionIds: values.wardingOptionIds,
        sanctifiedOptionIds: values.sanctifiedOptionIds,

        customWeaponAttributes:
          values.customWeaponAttributes &&
          values.customWeaponAttributes.trim()
            ? values.customWeaponAttributes.trim()
            : null,
        customArmorAttributes:
          values.customArmorAttributes &&
          values.customArmorAttributes.trim()
            ? values.customArmorAttributes.trim()
            : null,
        customShieldAttributes:
          values.customShieldAttributes &&
          values.customShieldAttributes.trim()
            ? values.customShieldAttributes.trim()
            : null,
        customItemAttributes:
          values.customItemAttributes &&
          values.customItemAttributes.trim()
            ? values.customItemAttributes.trim()
            : null,
        mythicLbPushTemplateId,
        mythicLbBreakTemplateId,
        mythicLbTranscendTemplateId,

        globalAttributeModifiers: values.globalAttributeModifiers ?? [],

        vrpEntries:

          vrpEntries.length > 0
            ? vrpEntries.map((e) => ({

                effectKind: e.effectKind,
                magnitude: e.magnitude,
                damageTypeId: e.damageTypeId,
              }))
            : [],
      };

      // Payload sanitation — never persist stale AoE geometry
      const hasAoe = Array.isArray(values.rangeCategories)
        ? values.rangeCategories.includes('AOE')
        : false;

      const sanitizedBasePayload = {
        ...basePayload,

        // If AOE not selected, wipe all AoE fields
        aoeCenterRangeFeet: hasAoe ? basePayload.aoeCenterRangeFeet : null,
        aoeCount: hasAoe ? basePayload.aoeCount : null,
        aoeShape: hasAoe ? basePayload.aoeShape : null,

        // If AOE selected, keep only geometry relevant to the chosen shape
        aoeSphereRadiusFeet:
          hasAoe && basePayload.aoeShape === 'SPHERE'
            ? basePayload.aoeSphereRadiusFeet
            : null,

        aoeConeLengthFeet:
          hasAoe && basePayload.aoeShape === 'CONE'
            ? basePayload.aoeConeLengthFeet
            : null,

        aoeLineWidthFeet:
          hasAoe && basePayload.aoeShape === 'LINE'
            ? basePayload.aoeLineWidthFeet
            : null,

        aoeLineLengthFeet:
          hasAoe && basePayload.aoeShape === 'LINE'
            ? basePayload.aoeLineLengthFeet
            : null,
      };

      const createPayload = {
        id,
        campaignId,
        ...sanitizedBasePayload,
      };

      const updatePayload = {
        ...sanitizedBasePayload,
      };

      const res = await fetch(
        isEdit
          ? `/api/forge/items/${encodeURIComponent(id)}?campaignId=${encodeURIComponent(
              campaignId,
            )}`
          : '/api/forge/items',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(isEdit ? updatePayload : createPayload),
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Failed to create item (status ${res.status})`);
      }

      const item = (await res.json()) as LoadedItem;
      setCreatedItem(item);
      setSubmitSuccess(`Item created: ${item.id}`);

    // Refresh item list so selector reflects latest data
    refetchForgeItems();

    // If this was a create, switch selector to the new item
    if (!isEdit && item?.id) {
      setSelectedItemId(item.id);
    }

      // If you want a hard reset after each forge, uncomment:
      // reset();
    } catch (err: unknown) {
      console.error('[FORGE_CREATE_SUBMIT]', err);
      const message =
        err instanceof Error ? err.message : 'Unknown error creating item';
      setSubmitError(message);
    }
  }

  function renderDamageTypeChips(
    types: DamageType[],
    selectedIds: number[],
    field:
      | 'meleeDamageTypeIds'
      | 'rangedDamageTypeIds'
      | 'aoeDamageTypeIds',
  ) {
    if (!types.length) return null;

    return (
      <div className="flex flex-wrap gap-2 text-[11px] max-h-40 overflow-y-auto pr-1">
        {types.map((dt) => (
          <button
            key={dt.id}
            type="button"
            onClick={() => toggleNumberArrayField(field, dt.id)}
            className={`px-2 py-1 rounded-full border text-[11px] ${
              selectedIds.includes(dt.id)
                ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
            }`}
          >
            {dt.name}
          </button>
        ))}
      </div>
    );
  }

    function renderGroupedDamageTypeChips(
    types: DamageType[],
    selectedIds: number[],
    field:
      | 'meleeDamageTypeIds'
      | 'rangedDamageTypeIds'
      | 'aoeDamageTypeIds',
  ) {
    if (!types.length) return null;

    const physical = types.filter((dt) => getDamageTypeMode(dt as any) === 'PHYSICAL');
    const mental = types.filter((dt) => getDamageTypeMode(dt as any) === 'MENTAL');

    const renderGroup = (title: string, group: DamageType[]) => {
      if (!group.length) return null;

      return (
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            {title}
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] max-h-40 overflow-y-auto pr-1">
            {group.map((dt) => (
              <button
                key={dt.id}
                type="button"
                onClick={() => toggleNumberArrayField(field, dt.id)}
                className={`px-2 py-1 rounded-full border text-[11px] ${
                  selectedIds.includes(dt.id)
                    ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
                }`}
              >
                {dt.name}
              </button>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {renderGroup('Physical Damage Types', physical)}
        {renderGroup('Mental Damage Types', mental)}
      </div>
    );
  }

  function renderAttackEffectChips(
    effects: AttackEffect[],
    selectedIds: number[],
    field:
      | 'attackEffectMeleeIds'
      | 'attackEffectRangedIds'
      | 'attackEffectAoEIds',
  ) {
    if (!effects.length) return null;

    return (
      <div className="flex flex-wrap gap-2 text-[11px] max-h-40 overflow-y-auto pr-1">
        {effects.map((fx) => (
          <button
            key={fx.id}
            type="button"
            onClick={() => toggleNumberArrayField(field, fx.id)}
            className={`px-2 py-1 rounded-full border text-[11px] ${
              selectedIds.includes(fx.id)
                ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
            }`}
          >
            {fx.name}
          </button>
        ))}
      </div>
    );
  }

  function renderWeaponAttributeChips(
    attrs: WeaponAttribute[],
    selectedIds: number[],
    selectedRangeCategories: RangeCategory[],
    selectedAoeShape: AoEShape | null,
  ) {
    if (!attrs.length) return null;

    return (
      <div className="flex flex-wrap gap-2 text-[11px] max-h-40 overflow-y-auto pr-1">
        {attrs.map((attr) => {
          const isSelected = selectedIds.includes(attr.id);

          const requiresRange = (attr as any).requiresRange as
            | RangeCategory
            | 'ANY'
            | null
            | undefined;

          const requiresAoeShape = Boolean((attr as any).requiresAoeShape);

          let isAvailable = true;
          const reasons: string[] = [];

          if (requiresRange && requiresRange !== 'ANY') {
            const ok = selectedRangeCategories.includes(requiresRange as RangeCategory);
            if (!ok) {
              isAvailable = false;
              reasons.push(`Requires ${requiresRange}`);
            }
          }

          if (requiresAoeShape) {
            const ok = Boolean(selectedAoeShape);
            if (!ok) {
              isAvailable = false;
              reasons.push('Requires an AoE Shape');
            }
          }

          // Important UX rule:
          // If it's already selected, never disable it (so the user can always remove it).
          const isDisabled = !isSelected && !isAvailable;

          const title = isDisabled
            ? `Unavailable: ${reasons.join(' + ')}`
            : '';

          return (
            <button
              key={attr.id}
              type="button"
              disabled={isDisabled}
              title={title}
              onClick={() => {
                if (isDisabled) return;
                toggleWeaponAttributeIdExclusive(attr.id, attr.name, attrs);
              }}
              className={`px-2 py-1 rounded-full border text-[11px] ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
                  : isDisabled
                    ? 'border-zinc-800 bg-zinc-950 text-zinc-500 opacity-60 cursor-not-allowed'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
              }`}
            >
              {attr.name}
            </button>
          );
        })}
      </div>
    );
  }

    function renderArmorAttributeChips(
    attrs: ArmorAttribute[],
    selectedIds: number[],
  ) {
    if (!attrs.length) return null;

    return (
      <div className="flex flex-wrap gap-2 text-[11px] max-h-40 overflow-y-auto pr-1">
        {attrs.map((attr) => (
          <button
            key={attr.id}
            type="button"
            onClick={() => toggleNumberArrayField('armorAttributeIds', attr.id)}
            className={`px-2 py-1 rounded-full border text-[11px] ${
              selectedIds.includes(attr.id)
                ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
            }`}
          >
            {attr.name}
          </button>
        ))}
      </div>
    );
  }

    function renderShieldAttributeChips(
    attrs: ShieldAttribute[],
    selectedIds: number[],
  ) {
    if (!attrs.length) return null;

    return (
      <div className="flex flex-wrap gap-2 text-[11px] max-h-40 overflow-y-auto pr-1">
        {attrs.map((attr) => (
          <button
            key={attr.id}
            type="button"
            onClick={() =>
              toggleNumberArrayField('shieldAttributeIds', attr.id)
            }
            className={`px-2 py-1 rounded-full border text-[11px] ${
              selectedIds.includes(attr.id)
                ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
            }`}
          >
            {attr.name}
          </button>
        ))}
      </div>
    );
  }

  function renderDefEffectChips(effects: DefEffect[], selectedIds: number[]) {
    if (!effects.length) return null;

    return (
      <div className="flex flex-wrap gap-2 text-[11px] max-h-40 overflow-y-auto pr-1">
        {effects.map((fx) => (
          <button
            key={fx.id}
            type="button"
            onClick={() => toggleNumberArrayField('defEffectIds', fx.id)}
            className={`px-2 py-1 rounded-full border text-[11px] ${
              selectedIds.includes(fx.id)
                ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
            }`}
          >
            {fx.name}
          </button>
        ))}
      </div>
    );
  }

  function renderWardingOptionChips(
    options: WardingOption[],
    selectedIds: number[],
  ) {
    if (!options.length) return null;

    return (
      <div className="flex flex-wrap gap-2 text-[11px] max-h-40 overflow-y-auto pr-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggleNumberArrayField('wardingOptionIds', opt.id)}
            className={`px-2 py-1 rounded-full border text-[11px] ${
              selectedIds.includes(opt.id)
                ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
            }`}
          >
            {opt.name}
          </button>
        ))}
      </div>
    );
  }

  function renderSanctifiedOptionChips(
    options: SanctifiedOption[],
    selectedIds: number[],
  ) {
    if (!options.length) return null;

    return (
      <div className="flex flex-wrap gap-2 text-[11px] max-h-40 overflow-y-auto pr-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() =>
              toggleNumberArrayField('sanctifiedOptionIds', opt.id)
            }
            className={`px-2 py-1 rounded-full border text-[11px] ${
              selectedIds.includes(opt.id)
                ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
            }`}
          >
            {opt.name}
          </button>
        ))}
      </div>
    );
  }

      function renderVrpBuilder() {
    if (!data) return null;

    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium">
          Vulnerability / Resistance / Protection (VRP)
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          {/* Effect kind */}
          <select
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={vrpEffectKind}
            onChange={(e) =>
              setVrpEffectKind(e.target.value as VRPEffectKind)
            }
          >
            <option value="VULNERABILITY">Vulnerability</option>
            <option value="RESISTANCE">Resistance</option>
            <option value="PROTECTION">Protection</option>
          </select>

          {/* Magnitude */}
          <input
            type="number"
            min={1}
            max={5}
            step={1}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={vrpMagnitude}
            onChange={(e) => {
              const n = Number(e.target.value);
              const value = Number.isFinite(n) ? n : 1;
              setVrpMagnitude(value);
              if (value < 1 || value > 5) {
                setVrpMagnitudeError('Modifier must be between 1 and 5.');
              } else {
                setVrpMagnitudeError(null);
              }
            }}
          />

          {/* Damage type */}
          <select
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={vrpDamageTypeId ?? ''}
            onChange={(e) =>
              setVrpDamageTypeId(
                e.target.value ? Number(e.target.value) : null,
              )
            }
          >
            <option value="">Damage type…</option>
            {data.damageTypes.map((dt) => (
              <option key={dt.id} value={dt.id}>
                {dt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Add button */}
        <button
          type="button"
          className="inline-flex items-center rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
          onClick={() => {
            // Damage type required
            if (!vrpDamageTypeId) {
              return;
            }

            // Magnitude must be 1–5
            if (vrpMagnitude < 1 || vrpMagnitude > 5) {
              setVrpMagnitudeError('Modifier must be between 1 and 5.');
              return;
            }

            setVrpMagnitudeError(null);

            // Add / Replace VRP entry
            // Rule: for the same (effectKind × damageTypeId), keep the HIGHEST magnitude.
            // Vulnerability conflicts with Resistance/Protection for the same damage type.
            setVrpEntries((prev) => {
              const dtId = vrpDamageTypeId;
              const kind = vrpEffectKind;
              const nextMagnitude = vrpMagnitude;

              const isConflict = (entry: VRPEntryForm) =>
                entry.damageTypeId === dtId &&
                (
                  // Same effect kind always replaces (but we keep highest magnitude below)
                  entry.effectKind === kind ||
                  // Vulnerability conflicts with Resistance/Protection (and vice versa)
                  (entry.effectKind === 'VULNERABILITY' &&
                    (kind === 'RESISTANCE' || kind === 'PROTECTION')) ||
                  (kind === 'VULNERABILITY' &&
                    (entry.effectKind === 'RESISTANCE' || entry.effectKind === 'PROTECTION'))
                );

              // Capture any existing same-kind entry so we can keep the highest magnitude.
              const existingSameKind = prev.find(
                (e) => e.damageTypeId === dtId && e.effectKind === kind,
              );

              const magnitudeToStore =
                existingSameKind
                  ? Math.max(Number(existingSameKind.magnitude ?? 0), Number(nextMagnitude ?? 0))
                  : nextMagnitude;

              const filtered = prev.filter((entry) => !isConflict(entry));

              return [
                ...filtered,
                {
                  effectKind: kind,
                  magnitude: magnitudeToStore,
                  damageTypeId: dtId,
                },
              ];
            });
          }}
        >
          Add
        </button>

        {vrpMagnitudeError && (
          <p className="text-[11px] text-red-400">
            {vrpMagnitudeError}
          </p>
        )}

        {vrpEntries.length > 0 && (
          <div className="flex flex-wrap gap-2 text-[11px]">
            {vrpEntries.map((entry, idx) => {
              const dtName =
                data.damageTypes.find(
                  (dt) => dt.id === entry.damageTypeId,
                )?.name ?? 'Unknown';

              const label =
                entry.effectKind === 'VULNERABILITY'
                  ? 'Vulnerability'
                  : entry.effectKind === 'RESISTANCE'
                  ? 'Resistance'
                  : 'Protection';

              return (
                <button
                  key={`${entry.effectKind}-${entry.damageTypeId}`}
                  type="button"
                  onClick={() =>
                    setVrpEntries((prev) =>
                      prev.filter((_, i) => i !== idx),
                    )
                  }
                  className="px-2 py-1 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-red-400 hover:text-red-300"
                >
                  {label} {entry.magnitude} {dtName}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderAttackSection(includeSizePickerForWeapon: boolean) {
    return (
      <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Attack Details</h2>
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Select a size to unlock the rest.
          </span>
        </div>

        {/* Size (always visible when type = WEAPON) */}
          {includeSizePickerForWeapon && isWeapon && (
          <div className="space-y-1">
            <label className="block text-xs font-medium">
              Size
            </label>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              {...register('size', {
                validate: (value) => {
                  // Only enforce for weapons / shields
                  if (!isWeapon && !isShield) return true;
                  const v = (value ?? '').toString().trim();
                  return v ? true : 'Size is required.';
                },
              })}
            >
              <option value="">—</option>
              {WEAPON_SIZES.map((s) => (
                <option key={s} value={s}>
                  {SIZE_LABELS[s]}
                </option>
              ))}
            </select>
            {errors.size && (
              <p className="text-xs text-red-400">
                {errors.size.message as string}
              </p>
            )}
          </div>
        )}

        {/* Range categories */}
        {hasSize && (
          <div className="space-y-1">
            <label className="block text-xs font-medium">
              Range Categories
            </label>
            <div className="flex flex-wrap gap-3 text-xs">
              {RANGE_CATEGORIES.map((rc) => (
                <button
                  key={rc}
                  type="button"
                  onClick={() => toggleRangeCategory(rc)}
                  className={`px-2 py-1 rounded-full border ${
                    isRangeCategorySelected(rc)
                      ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
                  }`}
                >
                  {rc}
                </button>
              ))}
            </div>
            {/* Hidden field to validate selection */}
            <input
              type="hidden"
              {...register('rangeCategories', {
                validate: (value) => {
                  if (!isWeaponLike) return true;
                  const arr = (value ?? []) as RangeCategory[];
                  return (
                    arr.length > 0 ||
                    'Please select at least one range category.'
                  );
                },
              })}
            />
            {errors.rangeCategories && (
              <p className="text-xs text-red-400">
                {errors.rangeCategories.message as string}
              </p>
            )}
          </div>
        )}

        {/* Melee Targets */}
        {hasSize && isRangeCategorySelected('MELEE') && (
          <div className="space-y-1">
            <label className="block text-xs font-medium">
              Melee Targets
            </label>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              {...register('meleeTargets', {
                valueAsNumber: true,
                validate: (v) => {
                  if (!isWeaponLike || !isRangeCategorySelected('MELEE')) {
                    return true;
                  }
                  const val = toNullableNumber(v);
                  return typeof val === 'number' && val >= 1
                    ? true
                    : 'Melee targets is required.';
                },
              })}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {errors.meleeTargets && (
              <p className="text-xs text-red-400">
                {errors.meleeTargets.message as string}
              </p>
            )}
          </div>
        )}

        {/* Melee damage types + Greater Success */}
        {data && hasSize && isRangeCategorySelected('MELEE') && (
          <div className="space-y-2">
            {/* Damage Types – Melee */}
            <div className="space-y-1">
              <label className="block text-xs font-medium">
                Damage Types – Melee
              </label>
              {renderGroupedDamageTypeChips(
                availableDamageTypes,
                meleeDamageTypeIds,
                'meleeDamageTypeIds',
              )}
              <input
                type="hidden"
                {...register('meleeDamageTypeIds', {
                  validate: (value) => {
                    if (!isWeaponLike || !isRangeCategorySelected('MELEE')) {
                      return true;
                    }
                    const arr = (value ?? []) as number[];
                    return (
                      arr.length > 0 ||
                      'Please select at least one melee damage type.'
                    );
                  },
                })}
              />
              {errors.meleeDamageTypeIds && (
                <p className="text-xs text-red-400">
                  {errors.meleeDamageTypeIds.message as string}
                </p>
              )}
            </div>

            {/* Greater Success – Melee */}
            {meleeAvailableAttackEffects.length > 0 && (
              <div className="space-y-1">
                <label className="block text-xs font-medium">
                  Greater Success – Melee
                </label>
                {renderAttackEffectChips(
                  meleeAvailableAttackEffects,
                  attackEffectMeleeIds,
                  'attackEffectMeleeIds',
                )}
              </div>
            )}
          </div>
        )}

        {/* Melee Strength (Physical/Mental) */}
        {hasSize && isRangeCategorySelected('MELEE') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium">Melee Physical Strength</label>
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('meleePhysicalStrength', {
                  valueAsNumber: true,
                  validate: {
                    inRange: (v) =>
                      validateOptionalInRange(v, 0, 10, 'Melee physical strength'),
                    strengthRequired: (v) => {
                      if (!isWeaponLike || !isRangeCategorySelected('MELEE')) return true;
                      const values = getValues();
                      const phys = toNullableNumber(v);
                      const ment = toNullableNumber(values.meleeMentalStrength);
                      const hasAny =
                        (typeof phys === 'number' && phys > 0) ||
                        (typeof ment === 'number' && ment > 0);
                      return (
                        hasAny ||
                        'Melee Physical Strength or Melee Mental Strength must be greater than 0.'
                      );
                    },
                  },
                })}
              />
              {errors.meleePhysicalStrength && (
                <p className="text-xs text-red-400">
                  {errors.meleePhysicalStrength.message as string}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium">Melee Mental Strength</label>
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('meleeMentalStrength', {
                  valueAsNumber: true,
                  validate: {
                    inRange: (v) =>
                      validateOptionalInRange(v, 0, 10, 'Melee mental strength'),
                    strengthRequired: (v) => {
                      if (!isWeaponLike || !isRangeCategorySelected('MELEE')) return true;
                      const values = getValues();
                      const ment = toNullableNumber(v);
                      const phys = toNullableNumber(values.meleePhysicalStrength);
                      const hasAny =
                        (typeof phys === 'number' && phys > 0) ||
                        (typeof ment === 'number' && ment > 0);
                      return (
                        hasAny ||
                        'Melee Physical Strength or Melee Mental Strength must be greater than 0.'
                      );
                    },
                  },
                })}
              />
              {errors.meleeMentalStrength && (
                <p className="text-xs text-red-400">
                  {errors.meleeMentalStrength.message as string}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Ranged Targets */}
        {hasSize && isRangeCategorySelected('RANGED') && (
          <div className="space-y-1">
            <label className="block text-xs font-medium">
              Ranged Targets
            </label>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              {...register('rangedTargets', {
                valueAsNumber: true,
                validate: (v) => {
                  if (!isWeaponLike || !isRangeCategorySelected('RANGED')) {
                    return true;
                  }
                  const val = toNullableNumber(v);
                  return typeof val === 'number' && val >= 1
                    ? true
                    : 'Ranged targets is required.';
                },
              })}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {errors.rangedTargets && (
              <p className="text-xs text-red-400">
                {errors.rangedTargets.message as string}
              </p>
            )}
          </div>
        )}

        {/* Ranged distance */}
        {hasSize && isRangeCategorySelected('RANGED') && (
          <div className="space-y-1">
            <label className="block text-xs font-medium">
              Ranged Distance (ft)
            </label>

            <div className="flex flex-wrap gap-2 text-xs">
              {[30, 60, 120, 200].map((dist) => (
                <label
                  key={dist}
                  className="inline-flex items-center gap-1"
                >
                  <input
                    type="radio"
                    className="h-3 w-3 rounded border-zinc-600 bg-zinc-900"
                    value={dist}
                    checked={toNullableNumber(watch('rangedDistanceFeet')) === dist}
                    onChange={() => {
                      setValue('rangedDistanceFeet', dist as any, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                  />
                  <span>{dist}</span>
                </label>
              ))}
            </div>
            <input
              type="hidden"
              {...register('rangedDistanceFeet', {
                validate: (v) => {
                  if (!isWeaponLike || !isRangeCategorySelected('RANGED')) {
                    return true;
                  }
                  const val = toNullableNumber(v);
                  return typeof val === 'number' || 'Ranged distance is required.';
                },
              })}
            />
            {errors.rangedDistanceFeet && (
              <p className="text-xs text-red-400">
                {errors.rangedDistanceFeet.message as string}
              </p>
            )}
          </div>
        )}

        {/* Ranged damage types + Greater Success */}
        {data && hasSize && isRangeCategorySelected('RANGED') && (
          <div className="space-y-2">
            {/* Damage Types – Ranged */}
              <div className="space-y-1">
              <label className="block text-xs font-medium">
                Damage Types – Ranged
              </label>
              {renderGroupedDamageTypeChips(
                availableDamageTypes,
                rangedDamageTypeIds,
                'rangedDamageTypeIds',
              )}
              <input
                type="hidden"
                {...register('rangedDamageTypeIds', {
                  validate: (value) => {
                    if (!isWeaponLike || !isRangeCategorySelected('RANGED')) {
                      return true;
                    }
                    const arr = (value ?? []) as number[];
                    return (
                      arr.length > 0 ||
                      'Please select at least one ranged damage type.'
                    );
                  },
                })}
              />
              {errors.rangedDamageTypeIds && (
                <p className="text-xs text-red-400">
                  {errors.rangedDamageTypeIds.message as string}
                </p>
              )}
            </div>


            {/* Greater Success – Ranged */}
            {rangedAvailableAttackEffects.length > 0 && (
              <div className="space-y-1">
                <label className="block text-xs font-medium">
                  Greater Success – Ranged
                </label>
                {renderAttackEffectChips(
                  rangedAvailableAttackEffects,
                  attackEffectRangedIds,
                  'attackEffectRangedIds',
                )}
              </div>
            )}
          </div>
        )}

        {/* Ranged Strength (Physical/Mental) */}
        {hasSize && isRangeCategorySelected('RANGED') && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium">Ranged Physical Strength</label>
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('rangedPhysicalStrength', {
                  valueAsNumber: true,
                  validate: {
                    inRange: (v) =>
                      validateOptionalInRange(v, 0, 10, 'Ranged physical strength'),
                    strengthRequired: (v) => {
                      if (!isWeaponLike || !isRangeCategorySelected('RANGED')) return true;
                      const values = getValues();
                      const phys = toNullableNumber(v);
                      const ment = toNullableNumber(values.rangedMentalStrength);
                      const hasAny =
                        (typeof phys === 'number' && phys > 0) ||
                        (typeof ment === 'number' && ment > 0);
                      return (
                        hasAny ||
                        'Ranged Physical Strength or Ranged Mental Strength must be greater than 0.'
                      );
                    },
                  },
                })}
              />
              {errors.rangedPhysicalStrength && (
                <p className="text-xs text-red-400">
                  {errors.rangedPhysicalStrength.message as string}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium">Ranged Mental Strength</label>
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('rangedMentalStrength', {
                  valueAsNumber: true,
                  validate: {
                    inRange: (v) =>
                      validateOptionalInRange(v, 0, 10, 'Ranged mental strength'),
                    strengthRequired: (v) => {
                      if (!isWeaponLike || !isRangeCategorySelected('RANGED')) return true;
                      const values = getValues();
                      const ment = toNullableNumber(v);
                      const phys = toNullableNumber(values.rangedPhysicalStrength);
                      const hasAny =
                        (typeof phys === 'number' && phys > 0) ||
                        (typeof ment === 'number' && ment > 0);
                      return (
                        hasAny ||
                        'Ranged Physical Strength or Ranged Mental Strength must be greater than 0.'
                      );
                    },
                  },
                })}
              />
              {errors.rangedMentalStrength && (
                <p className="text-xs text-red-400">
                  {errors.rangedMentalStrength.message as string}
                </p>
              )}
            </div>
          </div>
        )}

        {/* AoE controls */}
        {isRangeCategorySelected('AOE') && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium">
                AoE Center Range (ft)
              </label>
              <div className="flex flex-wrap gap-2 text-xs">
                {[0, 30, 60, 120, 200].map((dist) => (
                  <label
                    key={dist}
                    className="inline-flex items-center gap-1"
                  >
                    <input
                      type="radio"
                      className="h-3 w-3 rounded border-zinc-600 bg-zinc-900"
                      value={dist}
                      checked={toNullableNumber(watch('aoeCenterRangeFeet')) === dist}
                      onChange={() => {
                        setValue('aoeCenterRangeFeet', dist as any, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                    />
                    <span>{dist}</span>
                  </label>
                ))}
              </div>
              <input
                type="hidden"
                {...register('aoeCenterRangeFeet', {
                  validate: (v) => {
                    if (!isWeaponLike || !isRangeCategorySelected('AOE')) {
                      return true;
                    }
                    const val = toNullableNumber(v);
                    return typeof val === 'number' || 'AoE center range is required.';
                  },
                })}
              />
              {errors.aoeCenterRangeFeet && (
                <p className="text-xs text-red-400">
                  {errors.aoeCenterRangeFeet.message as string}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium">
                AoE Count (number of areas)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                step={1}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('aoeCount', {
                  valueAsNumber: true,
                  validate: {
                    inRange: (v) =>
                      validateOptionalInRange(v, 1, 5, 'AoE count'),
                    requiredForAoe: (v) => {
                      if (!isWeaponLike || !isRangeCategorySelected('AOE')) {
                        return true;
                      }
                      const n = toNullableNumber(v);
                      return (
                        (typeof n === 'number' && n >= 1) ||
                        'AoE count is required.'
                      );
                    },
                  },
                })}
              />
              {errors.aoeCount && (
                <p className="text-xs text-red-400">
                  {errors.aoeCount.message as string}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium">
                AoE Shape
              </label>
                <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('aoeShape', {
                  validate: (value) => {
                    if (!isWeaponLike || !isRangeCategorySelected('AOE')) {
                      return true;
                    }
                    const v = (value ?? '').toString().trim();
                    return v ? true : 'AoE shape is required.';
                  },
                })}
              >
                <option value="">—</option>
                {AOE_SHAPES.map((shape) => (
                  <option key={shape} value={shape}>
                    {shape}
                  </option>
                ))}
              </select>
              {errors.aoeShape && (
                <p className="text-xs text-red-400">
                  {errors.aoeShape.message as string}
                </p>
              )}
            </div>

            {/* Shape-specific sizes */}
            {selectedAoeShape === 'SPHERE' && (
              <div className="space-y-1">
                <label className="block text-xs font-medium">
                  Sphere Radius (ft)
                </label>
                <div className="flex flex-wrap gap-2 text-xs">
                  {[10, 20, 30].map((radius) => (
                    <label
                      key={radius}
                      className="inline-flex items-center gap-1"
                    >
                    <input
                      type="radio"
                      className="h-3 w-3 rounded border-zinc-600 bg-zinc-900"
                      value={radius}
                      checked={toNullableNumber(watch('aoeSphereRadiusFeet')) === radius}
                      onChange={() => {
                        setValue('aoeSphereRadiusFeet', radius as any, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                    />
                      <span>{radius}</span>
                    </label>
                  ))}
                </div>
                  <input
                    type="hidden"
                    {...register('aoeSphereRadiusFeet', {
                      validate: (v) => {
                        if (
                          !isWeaponLike ||
                          !isRangeCategorySelected('AOE') ||
                          selectedAoeShape !== 'SPHERE'
                        ) {
                          return true;
                        }
                        const val = toNullableNumber(v);
                        return typeof val === 'number' || 'Sphere radius is required.';
                      },
                    })}
                  />
                  {errors.aoeSphereRadiusFeet && (

                  <p className="text-xs text-red-400">
                    {errors.aoeSphereRadiusFeet.message as string}
                  </p>
                )}
              </div>
            )}

            {selectedAoeShape === 'CONE' && (
              <div className="space-y-1">
                <label className="block text-xs font-medium">
                  Cone Length (ft)
                </label>
                <div className="flex flex-wrap gap-2 text-xs">
                  {[15, 30, 60].map((len) => (
                    <label
                      key={len}
                      className="inline-flex items-center gap-1"
                    >
                    <input
                      type="radio"
                      className="h-3 w-3 rounded border-zinc-600 bg-zinc-900"
                      value={len}
                      checked={toNullableNumber(watch('aoeConeLengthFeet')) === len}
                      onChange={() => {
                        setValue('aoeConeLengthFeet', len as any, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                    />
                      <span>{len}</span>
                    </label>
                  ))}
                </div>

                <input
                  type="hidden"
                  {...register('aoeConeLengthFeet', {
                    validate: (v) => {
                      if (
                        !isWeaponLike ||
                        !isRangeCategorySelected('AOE') ||
                        selectedAoeShape !== 'CONE'
                      ) {
                        return true;
                      }
                      const val = toNullableNumber(v);
                      return typeof val === 'number' || 'Cone length is required.';
                    },
                  })}
                />

                {errors.aoeConeLengthFeet && (
                  <p className="text-xs text-red-400">
                    {errors.aoeConeLengthFeet.message as string}
                  </p>
                )}
              </div>
            )}

            {selectedAoeShape === 'LINE' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium">
                    Line Width (ft)
                  </label>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {[5, 10, 15, 20].map((w) => (
                      <label
                        key={w}
                        className="inline-flex items-center gap-1"
                      >
                      <input
                        type="radio"
                        className="h-3 w-3 rounded border-zinc-600 bg-zinc-900"
                        value={w}
                        checked={toNullableNumber(watch('aoeLineWidthFeet')) === w}
                        onChange={() => {
                          setValue('aoeLineWidthFeet', w as any, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }}
                      />
                        <span>{w}</span>
                      </label>
                    ))}
                  </div>
                  <input
                    type="hidden"
                    {...register('aoeLineWidthFeet', {
                      validate: (v) => {
                        if (
                          !isWeaponLike ||
                          !isRangeCategorySelected('AOE') ||
                          selectedAoeShape !== 'LINE'
                        ) {
                          return true;
                        }
                        const val = toNullableNumber(v);
                        return typeof val === 'number' || 'Line width is required.';
                      },
                    })}
                  />
                  {errors.aoeLineWidthFeet && (
                    <p className="text-xs text-red-400">
                      {errors.aoeLineWidthFeet.message as string}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium">
                    Line Length (ft)
                  </label>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {[30, 60, 90, 120].map((len) => (
                      <label
                        key={len}
                        className="inline-flex items-center gap-1"
                      >
                      <input
                        type="radio"
                        className="h-3 w-3 rounded border-zinc-600 bg-zinc-900"
                        value={len}
                        checked={toNullableNumber(watch('aoeLineLengthFeet')) === len}
                        onChange={() => {
                          setValue('aoeLineLengthFeet', len as any, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }}
                      />
                        <span>{len}</span>
                      </label>
                    ))}
                    </div>

                    <input
                      type="hidden"
                      {...register('aoeLineLengthFeet', {
                        validate: (v) => {
                          if (
                            !isWeaponLike ||
                            !isRangeCategorySelected('AOE') ||
                            selectedAoeShape !== 'LINE'
                          ) {
                            return true;
                          }
                          const val = toNullableNumber(v);
                          return typeof val === 'number' || 'Line length is required.';
                        },
                      })}
                    />

                    {errors.aoeLineLengthFeet && (
                    <p className="text-xs text-red-400">
                      {errors.aoeLineLengthFeet.message as string}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AoE damage types + Greater Success */}
        {data && hasSize && isRangeCategorySelected('AOE') && selectedAoeShape && (
          <div className="space-y-2">
            {/* Damage Types – AoE */}
             <div className="space-y-1">
              <label className="block text-xs font-medium">
              Damage Types – AoE
              </label>
              {renderGroupedDamageTypeChips(
                availableDamageTypes,
                aoeDamageTypeIds,
                'aoeDamageTypeIds',
              )}
              <input
                type="hidden"
                {...register('aoeDamageTypeIds', {
                  validate: (value) => {
                    if (!isWeaponLike || !isRangeCategorySelected('AOE')) {
                      return true;
                    }
                    const arr = (value ?? []) as number[];
                    return (
                      arr.length > 0 ||
                      'Please select at least one AoE damage type.'
                    );
                  },
                })}
              />
              {errors.aoeDamageTypeIds && (
                <p className="text-xs text-red-400">
                  {errors.aoeDamageTypeIds.message as string}
                </p>
              )}
            </div>

            {/* Greater Success – AoE */}
            {aoeAvailableAttackEffects.length > 0 && (
              <div className="space-y-1">
                <label className="block text-xs font-medium">
                  Greater Success – AoE
                </label>
                {renderAttackEffectChips(
                  aoeAvailableAttackEffects,
                  attackEffectAoEIds,
                  'attackEffectAoEIds',
                )}
              </div>
            )}
          </div>
        )}

        {/* AoE Strength (Physical/Mental) */}
        {hasSize && isRangeCategorySelected('AOE') && selectedAoeShape && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium">AoE Physical Strength</label>
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('aoePhysicalStrength', {
                  valueAsNumber: true,
                  validate: {
                    inRange: (v) =>
                      validateOptionalInRange(v, 0, 10, 'AoE physical strength'),
                    strengthRequired: (v) => {
                      if (!isWeaponLike || !isRangeCategorySelected('AOE')) return true;
                      const values = getValues();
                      const phys = toNullableNumber(v);
                      const ment = toNullableNumber(values.aoeMentalStrength);
                      const hasAny =
                        (typeof phys === 'number' && phys > 0) ||
                        (typeof ment === 'number' && ment > 0);
                      return (
                        hasAny ||
                        'AoE Physical Strength or AoE Mental Strength must be greater than 0.'
                      );
                    },
                  },
                })}
              />
              {errors.aoePhysicalStrength && (
                <p className="text-xs text-red-400">
                  {errors.aoePhysicalStrength.message as string}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium">AoE Mental Strength</label>
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('aoeMentalStrength', {
                  valueAsNumber: true,
                  validate: {
                    inRange: (v) =>
                      validateOptionalInRange(v, 0, 10, 'AoE mental strength'),
                    strengthRequired: (v) => {
                      if (!isWeaponLike || !isRangeCategorySelected('AOE')) return true;
                      const values = getValues();
                      const ment = toNullableNumber(v);
                      const phys = toNullableNumber(values.aoePhysicalStrength);
                      const hasAny =
                        (typeof phys === 'number' && phys > 0) ||
                        (typeof ment === 'number' && ment > 0);
                      return (
                        hasAny ||
                        'AoE Physical Strength or AoE Mental Strength must be greater than 0.'
                      );
                    },
                  },
                })}
              />
              {errors.aoeMentalStrength && (
                <p className="text-xs text-red-400">
                  {errors.aoeMentalStrength.message as string}
                </p>
              )}
            </div>
          </div>
        )}

{/* Weapon attributes (weapons only) */}
        {isWeapon && data && hasSize && (
          <div className="space-y-1">
            <label className="block text-xs font-medium">
              Weapon Attributes
            </label>

            {/* Chips (this was missing, so nothing could be selected) */}
            {renderWeaponAttributeChips(
              data.weaponAttributes ?? [],
              weaponAttributeIds,
              selectedRangeCategories as any,
              toNullableEnum<AoEShape>(selectedAoeShape as any),
            )}

            {weaponAttributeIds
              .filter(
                (id: number) =>
                  (data.weaponAttributes ?? []).find(
                    (a: WeaponAttribute) => a.id === id,
                  )?.requiresStrengthSource,
              )
              .length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Strength Source (per attribute)
                </div>

                <div className="space-y-2">
                  {weaponAttributeIds
                    .filter(
                      (id: number) =>
                        (data.weaponAttributes ?? []).find(
                          (a: WeaponAttribute) => a.id === id,
                        )?.requiresStrengthSource,
                    )
                    .map((id: number) => {
                    const key = String(id);
                    const attrName =
                      (data.weaponAttributes ?? []).find((a: WeaponAttribute) => a.id === id)?.name ??
                      `#${id}`;

                    const current = weaponAttributeStrengthSources[key] ?? null;

                    return (
                      <div
                        key={`wa-ss-${id}`}
                        className="flex flex-col md:flex-row md:items-center gap-2"
                      >
                        <div className="text-xs text-zinc-200 md:w-1/2">
                          {attrName}
                        </div>

                        <select
                          className="w-full md:w-1/2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          value={current ?? ''}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                            const v = e.target.value;
                            const next =
                              v === 'MELEE' || v === 'RANGED' || v === 'AOE'
                                ? v
                                : null;

                            setValue(
                              'weaponAttributeStrengthSources',
                              {
                                ...(weaponAttributeStrengthSources ?? {}),
                                [key]: next,
                              } as any,
                              { shouldDirty: true, shouldValidate: false },
                            );
                          }}
                        >
                          <option value="">None</option>
                          <option value="MELEE">Melee</option>
                          <option value="RANGED">Ranged</option>
                          <option value="AOE">AoE</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {weaponAttributeIds
              .filter(
                (id: number) =>
                  (data.weaponAttributes ?? []).find(
                    (a: WeaponAttribute) => a.id === id,
                  )?.requiresRangeSelection,
              )
              .length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Chosen Range (per attribute)
                </div>

                <div className="space-y-2">
                  {weaponAttributeIds
                    .filter(
                      (id: number) =>
                        (data.weaponAttributes ?? []).find(
                          (a: WeaponAttribute) => a.id === id,
                        )?.requiresRangeSelection,
                    )
                    .map((id: number) => {
                      const key = String(id);
                      const attrName =
                        (data.weaponAttributes ?? []).find(
                          (a: WeaponAttribute) => a.id === id,
                        )?.name ?? `#${id}`;

                      const current = weaponAttributeRangeSelections[key] ?? null;

                      return (
                        <div
                          key={`wa-cr-${id}`}
                          className="flex flex-col md:flex-row md:items-center gap-2"
                        >
                          <div className="text-xs text-zinc-200 md:w-1/2">
                            {attrName}
                          </div>

                          <select
                            className="w-full md:w-1/2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            value={current ?? ''}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                              const v = e.target.value;
                              const next =
                                v === 'MELEE' || v === 'RANGED' || v === 'AOE'
                                  ? v
                                  : null;

                              setValue(
                                'weaponAttributeRangeSelections',
                                {
                                  ...(weaponAttributeRangeSelections ?? {}),
                                  [key]: next,
                                } as any,
                                { shouldDirty: true, shouldValidate: false },
                              );
                            }}
                          >
                            <option value="">None</option>
                            <option value="MELEE">Melee</option>
                            <option value="RANGED">Ranged</option>
                            <option value="AOE">AoE</option>
                          </select>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <textarea
              rows={2}
              className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Custom weapon attribute notes (optional)."
              {...register('customWeaponAttributes')}
            />
          </div>
        )}
      </div>
    );
  }

  function renderMythicLimitBreakSection() {
    if (!showMythicLimitBreakSection) return null;

    return (
      <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Limit Break</h2>
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Mythic only
          </span>
        </div>

        {mythicLbTemplatesLoading && (
          <p className="text-xs text-zinc-500">Loading mythic templates...</p>
        )}
        {mythicLbTemplatesError && (
          <p className="text-xs text-red-400">
            Failed to load mythic templates: {mythicLbTemplatesError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium">Limit Break</label>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              {...register('selectedMythicLimitBreakId', {
                setValueAs: (value) =>
                  typeof value === 'string' && value.trim().length > 0
                    ? value.trim()
                    : null,
              })}
            >
              <option value="">None</option>
              {mythicPushTemplates.length > 0 && (
                <optgroup label="PUSH">
                  {mythicPushTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {`PUSH – ${template.name}`}
                    </option>
                  ))}
                </optgroup>
              )}
              {mythicBreakTemplates.length > 0 && (
                <optgroup label="BREAK">
                  {mythicBreakTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {`BREAK – ${template.name}`}
                    </option>
                  ))}
                </optgroup>
              )}
              {mythicTranscendTemplates.length > 0 && (
                <optgroup label="TRANSCEND">
                  {mythicTranscendTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {`TRANSCEND – ${template.name}`}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {!mythicLbTemplatesLoading && mythicLbTemplates.length === 0 && (
          <p className="text-xs text-zinc-500">
            No Mythic item limit break templates for {mythicTemplateItemType}.
          </p>
        )}

        {selectedMythicTemplate && (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-2 text-xs space-y-1">
            <div className="font-medium">
              {selectedMythicTemplate.name} ({selectedMythicTemplate.tier} –{' '}
              {selectedMythicTemplate.thresholdPercent}%)
            </div>
            {selectedMythicTemplate.description && (
              <div className="text-zinc-300">{selectedMythicTemplate.description}</div>
            )}
            <div>Cost: {selectedMythicTemplate.endCostText ?? 'Not specified'}</div>
            {selectedMythicTemplate.failForwardEnabled && (
              <div>
                Fail-forward: Enabled
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const editorMobileVisibility = mobileView === 'editor' ? 'block' : 'hidden';
  const previewMobileVisibility = mobileView === 'preview' ? 'block' : 'hidden';

  return (
    <div className="md:h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col md:flex-row">
      {/* MOBILE TOGGLE */}
      <div className="md:hidden sticky top-0 z-30 h-12 bg-zinc-950 border-b border-zinc-800 shadow">
        <div className="h-full px-2 flex items-center">
          <div className="flex w-full overflow-hidden rounded-md border border-zinc-700 bg-zinc-900">
            <button
              type="button"
              aria-pressed={mobileView === 'editor'}
              onClick={() => handleMobileViewChange('editor')}
              className={`flex-1 text-center text-xs font-semibold px-3 py-2 ${
                mobileView === 'editor'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Editor
            </button>
            <button
              type="button"
              aria-pressed={mobileView === 'preview'}
              onClick={() => handleMobileViewChange('preview')}
              className={`flex-1 text-center text-xs font-semibold px-3 py-2 ${
                mobileView === 'preview'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Preview
            </button>
          </div>
        </div>
      </div>

      {/* FORM COLUMN */}
      <div
        className={`relative w-full md:w-1/2 p-3 md:p-8 border-b md:border-b-0 md:border-r border-zinc-800 md:overflow-y-auto ${editorMobileVisibility} md:block`}
      >
        <h1 className="text-2xl font-bold mb-4">Forge Item Creator</h1>

        <div className="mb-6 space-y-2">
          <label className="block text-sm font-medium">
            Edit existing item (optional)
          </label>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div ref={pickerRef} className="relative min-w-0 flex-1">
                <div className="relative h-10 flex items-center">
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
                    value={pickerQuery}
                    onFocus={() => setPickerOpen(true)}
                    onClick={() => setPickerOpen(true)}
                    onChange={(e) => {
                      setPickerQuery(e.target.value);
                      setPickerOpen(true);
                    }}
                    placeholder="Click to search campaign items"
                    className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 pl-9 text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {pickerOpen && (
                  <div className="absolute z-30 mt-1 w-full rounded border border-zinc-800 bg-zinc-950/95 p-2 shadow-lg">
                    <div className="max-h-80 overflow-auto space-y-1">
                      {recentForgeItems.length === 0 &&
                      filteredForgeItemsWithoutRecent.length === 0 ? (
                        <p className="px-2 py-2 text-sm text-zinc-500">No matches.</p>
                      ) : (
                        <>
                          {!hasPickerQuery && recentForgeItems.length > 0 && (
                            <>
                              <p className="px-2 pt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                                Recently used
                              </p>
                              {recentForgeItems.map((row) => (
                                <button
                                  key={`recent-${row.id}`}
                                  type="button"
                                  onClick={() => {
                                    setSubmitSuccess(null);
                                    setSelectedItemId(row.id);
                                    markForgeItemAsRecent(row.id);
                                    setPickerOpen(false);
                                    setPickerQuery('');
                                  }}
                                  className={`w-full rounded border px-2 py-2 text-left ${
                                    selectedItemId === row.id
                                      ? 'border-emerald-500 bg-emerald-950/20'
                                      : 'border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-medium">{row.name ?? '(Unnamed)'}</p>
                                      <p className="text-xs text-zinc-500">
                                        {row.rarity ?? '?'} L{row.level ?? '?'} - {row.type ?? '?'}
                                      </p>
                                    </div>
                                  </div>
                                  {row.tags.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {row.tags.slice(0, 6).map((tag) => (
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
                              ))}
                              <div className="my-1 border-t border-zinc-800" />
                            </>
                          )}
                          {filteredForgeItemsWithoutRecent.map((row) => (
                            <button
                              key={row.id}
                              type="button"
                              onClick={() => {
                                setSubmitSuccess(null);
                                setSelectedItemId(row.id);
                                markForgeItemAsRecent(row.id);
                                setPickerOpen(false);
                                setPickerQuery('');
                              }}
                              className={`w-full rounded border px-2 py-2 text-left ${
                                selectedItemId === row.id
                                  ? 'border-emerald-500 bg-emerald-950/20'
                                  : 'border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium">{row.name ?? '(Unnamed)'}</p>
                                  <p className="text-xs text-zinc-500">
                                    {row.rarity ?? '?'} L{row.level ?? '?'} - {row.type ?? '?'}
                                  </p>
                                </div>
                              </div>
                              {row.tags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {row.tags.slice(0, 6).map((tag) => (
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
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div ref={pickerFiltersRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setPickerFiltersOpen((prev) => !prev)}
                  className={`inline-flex h-10 items-center shrink-0 rounded border px-3 text-sm ${
                    pickerFiltersOpen
                      ? 'border-emerald-600 bg-emerald-950/20 text-emerald-100'
                      : 'border-zinc-700 hover:bg-zinc-800'
                  }`}
                >
                  Filters
                </button>

                {pickerFiltersOpen && (
                  <div className="absolute right-0 z-40 mt-1 w-80 max-w-[90vw] rounded border border-zinc-800 bg-zinc-950/95 p-3 shadow-lg space-y-3">
                    {forgePickerSupportsLevel && (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Item Level</p>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => setPickerLevelSelected([])}
                            className={`rounded border px-2 py-1 text-xs ${
                              pickerLevelSelected.length === 0
                                ? 'border-emerald-600 bg-emerald-950/20 text-emerald-100'
                                : 'border-zinc-700 bg-zinc-900 hover:bg-zinc-800'
                            }`}
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickerLevelRange(1, 5)}
                            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                          >
                            1-5
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickerLevelRange(6, 10)}
                            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                          >
                            6-10
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickerLevelRange(11, 15)}
                            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                          >
                            11-15
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickerLevelRange(16, 20)}
                            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                          >
                            16-20
                          </button>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {PICKER_LEVEL_OPTIONS.map((level) => {
                            const active = pickerLevelSelected.includes(level);
                            return (
                              <button
                                key={level}
                                type="button"
                                onClick={() => togglePickerLevel(level)}
                                className={`rounded border px-2 py-1 text-xs ${
                                  active
                                    ? 'border-emerald-600 bg-emerald-950/20 text-emerald-100'
                                    : 'border-zinc-700 bg-zinc-900 hover:bg-zinc-800'
                                }`}
                              >
                                {level}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={pickerExcludeLegendary}
                        onChange={(e) => setPickerExcludeLegendary(e.target.checked)}
                        className="h-4 w-4"
                      />
                      Exclude Legendary
                    </label>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={clearPickerFilters}
                        className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={resetForgeToNewItemMode}
                className="inline-flex h-10 items-center shrink-0 rounded border border-emerald-600 bg-emerald-600 px-3 text-sm text-emerald-50 hover:border-emerald-500 hover:bg-emerald-500"
              >
                New item
              </button>
            </div>

            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {activePickerFilterPills.map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => removePickerFilterPill(pill.id)}
                    className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                  >
                    <span>{pill.label}</span>
                    <span aria-hidden="true">x</span>
                  </button>
                ))}
              </div>
              <p className="pt-1 text-right text-[11px] text-zinc-500">
                {hasPickerQuery || hasPickerFilters
                  ? `Showing ${pickerFilteredCount} of ${pickerTotalCount}`
                  : `Showing ${pickerTotalCount}`}
              </p>
            </div>
          </div>

          {selectedItemSummary && (
            <p className="text-xs text-zinc-500">
              Editing: {selectedItemSummary.name ?? '(Unnamed)'} ({selectedItemSummary.id})
            </p>
          )}

          {itemsLoading && (
            <p className="text-xs text-zinc-500">Loading campaign items...</p>
          )}

          {itemsError && (
            <p className="text-xs text-red-400">
              Failed to load campaign items: {itemsError}
            </p>
          )}
        </div>
        {/* Manual test checklist:
            - Click input: dropdown opens, shows all results
            - Click Filters: panel opens, selecting level chips reduces list
            - Exclude Legendary hides Legendary rarity items
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

        {loading && (
          <p className="text-sm text-zinc-500 mb-2">Loading picklists…</p>
        )}

        {error && (
          <p className="text-sm text-red-400 mb-2">
            Failed to load picklists: {error}
          </p>
        )}

        {submitError && (
          <p className="mb-2 text-sm text-red-400">
            Error creating item: {submitError}
          </p>
        )}
        {submitSuccess && (
          <p className="mb-2 text-sm text-emerald-400">{submitSuccess}</p>
        )}

        {/* Forge Calculator */}
        <ForgeCalculatorPanel totals={calculatorTotals} />

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4 bg-zinc-900/40 border border-zinc-800 rounded-xl p-4"
        >
                    {/* BASIC SECTION */}
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1">
              <label className="block text-sm font-medium">Item Name</label>
              <input
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="e.g. Holy Avenger"
                {...register('name', { required: 'Name is required' })}
              />
              {errors.name && (
                <p className="text-xs text-red-400">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Tags</label>
              <div className="flex flex-wrap items-center gap-2">
                {currentTags.map((tag, index) => (
                  <span
                    key={`${tag}-${index}`}
                    className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() =>
                        setValue(
                          'tags',
                          currentTags.filter((_tag, idx) => idx !== index),
                          { shouldDirty: true, shouldValidate: false },
                        )
                      }
                      className="text-zinc-400 hover:text-zinc-200"
                      aria-label={`Remove tag ${tag}`}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
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
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActiveTagIndex((prev) =>
                          Math.min(
                            filteredTagSuggestions.length - 1,
                            prev < 0 ? 0 : prev + 1,
                          ),
                        );
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActiveTagIndex((prev) => Math.max(0, prev <= 0 ? 0 : prev - 1));
                        return;
                      }
                      if (e.key === 'Enter') {
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
                      if (e.key === 'Tab') {
                        const pickIndex = activeTagIndex >= 0 ? activeTagIndex : 0;
                        const pick = filteredTagSuggestions[pickIndex];
                        if (pick) {
                          e.preventDefault();
                          commitTagInput(pick.value);
                        }
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setTagSuggestions([]);
                        setActiveTagIndex(-1);
                        return;
                      }
                    }

                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      commitTagInput();
                      return;
                    }
                    if (e.key === 'Backspace' && tagInput.trim().length === 0) {
                      setValue('tags', currentTags.slice(0, -1), {
                        shouldDirty: true,
                        shouldValidate: false,
                      });
                    }
                  }}
                  placeholder="Add tag (Enter or comma)"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                                idx === activeTagIndex ? 'bg-zinc-800' : ''
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
            </div>

                        {/* Item Image URL */}
            <div className="space-y-1">
              <label className="block text-sm font-medium">Item Image URL</label>
              <input
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="https://example.com/image.png"
                {...register('itemUrl', {
                  validate: (v) => {
                    const value = (v ?? '').toString().trim();
                    if (!value) return true; // optional
                    try {
                      const u = new URL(value);
                      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
                        return 'URL must start with http:// or https://';
                      }
                      return true;
                    } catch {
                      return 'Please enter a valid URL';
                    }
                  },
                })}
              />
              {errors.itemUrl && (
                <p className="text-xs text-red-400">
                  {errors.itemUrl.message as string}
                </p>
              )}
              <p className="text-[11px] text-zinc-500">
                Must be a direct URL. Hotlinks can break if the host blocks them.
              </p>
            </div>

            {/* Rarity + Level */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Rarity */}
              <div className="space-y-1">
                <label className="block text-sm font-medium">Rarity</label>
                <select
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  {...register('rarity', {
                    required: 'Rarity is required',
                  })}
                >
                  {ITEM_RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {errors.rarity && (
                  <p className="text-xs text-red-400">
                    {errors.rarity.message as string}
                  </p>
                )}
              </div>

              {/* Item Level */}
              <div className="space-y-1">
                <label className="block text-sm font-medium">Item Level</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  {...register('level', {
                    required: 'Level is required',
                    valueAsNumber: true,
                    min: { value: 1, message: 'Minimum level is 1' },
                    max: { value: 20, message: 'Maximum level is 20' },
                  })}
                />
                {errors.level && (
                  <p className="text-xs text-red-400">
                    {errors.level.message}
                  </p>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="block text-sm font-medium">
                General Description
              </label>
              <textarea
                rows={4}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Short flavour and function description."
                {...register('generalDescription', {
                  required: 'Description is required',
                })}
              />
              {errors.generalDescription && (
                <p className="text-xs text-red-400">
                  {errors.generalDescription.message}
                </p>
              )}
            </div>

            {/* Global Attribute Modifiers */}
            <div className="space-y-1">
              <label className="block text-sm font-medium">
                Global Attribute Modifiers
              </label>
              <p className="text-[11px] text-zinc-500">
                Applies to all item types. Each attribute can be set once; adding
                a new value replaces the old one.
              </p>

              {attributeNames.length > 0 ? (
                <>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <select
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={globalAttributeSelection}
                      onChange={(e) =>
                        setGlobalAttributeSelection(e.target.value)
                      }
                    >
                      {attributeNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>

                    <select
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={globalAttributeAmount}
                      onChange={(e) =>
                        setGlobalAttributeAmount(
                          Number(e.target.value) || 1,
                        )
                      }
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          +{n}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="inline-flex items-center rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
                      onClick={() => {
                        if (!globalAttributeSelection) return;
                        if (
                          globalAttributeAmount < 1 ||
                          globalAttributeAmount > 5
                        ) {
                          return;
                        }

                        const next: GlobalAttributeModifierForm[] = [
                          ...globalAttributeModifiers.filter(
                            (entry) =>
                              entry.attribute !== globalAttributeSelection,
                          ),
                          {
                            attribute: globalAttributeSelection,
                            amount: globalAttributeAmount,
                          },
                        ];

                        setValue(
                          'globalAttributeModifiers',
                          next as any,
                          { shouldDirty: true },
                        );
                      }}
                    >
                      Add
                    </button>
                  </div>

                  {globalAttributeModifiers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {globalAttributeModifiers.map((entry, idx) => (
                        <button
                          key={`${entry.attribute}-${idx}`}
                          type="button"
                          onClick={() => {
                            const next =
                              globalAttributeModifiers.filter(
                                (_, i) => i !== idx,
                              );
                            setValue(
                              'globalAttributeModifiers',
                              next as any,
                              { shouldDirty: true },
                            );
                          }}
                          className="px-2 py-1 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-red-400 hover:text-red-300"
                        >
                          {entry.attribute} +{entry.amount}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-zinc-500">
                  No attribute cost entries available.
                </p>
              )}
            </div>

            {/* Item Type */}
            <div className="space-y-1">
              <label className="block text-sm font-medium">Item Type</label>
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('type', {
                  required: 'Item Type is required',
                })}
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {errors.type && (
                <p className="text-xs text-red-400">
                  {errors.type.message as string}
                </p>
              )}
            </div>

        {/* ATTACK SECTION – WEAPON ONLY (shield uses same helper inside its card) */}
        {isWeapon && renderAttackSection(true)}
        {isWeapon && showMythicLimitBreakSection && renderMythicLimitBreakSection()}

                {/* ARMOR SECTION */}
        {isArmor && (
          <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Armor Details</h2>
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                Choose a location to unlock armor stats.
              </span>
            </div>

            {/* Armor Location */}
            <div className="space-y-1">
              <label className="block text-xs font-medium">
                Armor Location
              </label>
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('armorLocation', {
                  validate: (value) => {
                    if (!isArmor) return true;
                    const v = (value ?? '').toString().trim();
                    return v ? true : 'Armor Location is required.';
                  },
                })}
              >
                <option value="">—</option>
                {['HEAD', 'SHOULDERS', 'TORSO', 'LEGS', 'FEET'].map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
              {errors.armorLocation && (
                <p className="text-xs text-red-400">
                  {errors.armorLocation.message as string}
                </p>
              )}
            </div>

            {hasArmorLocation && (
              <div className="space-y-4">
                {/* PPV / MPV */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">
                      Physical Protection Value (PPV)
                    </label>
                      <input
                      type="number"
                      min={0}
                      max={10}
                      step={1}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      {...register('ppv', {
                        valueAsNumber: true,
                        validate: {
                          inRange: (v) =>
                            validateOptionalInRange(v, 0, 10, 'PPV'),
                          ppvOrMpvRequiredArmor: (v) => {
                            if (!isArmor) return true;
                            const values = getValues();
                            const ppvNum = toNullableNumber(v);
                            const mpvNum = toNullableNumber(values.mpv);
                            const hasAny =
                              (typeof ppvNum === 'number' && ppvNum > 0) ||
                              (typeof mpvNum === 'number' && mpvNum > 0);
                            return (
                              hasAny ||
                              'Armor must have at least 1 point of PPV or MPV.'
                            );
                          },
                        },
                      })}
                    />
                    {errors.ppv && (
                      <p className="text-xs text-red-400">
                        {errors.ppv.message as string}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">
                      Mental Protection Value (MPV)
                    </label>
                      <input
                      type="number"
                      min={0}
                      max={10}
                      step={1}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      {...register('mpv', {
                        valueAsNumber: true,
                        validate: {
                          inRange: (v) =>
                            validateOptionalInRange(v, 0, 10, 'MPV'),
                          ppvOrMpvRequiredArmor: (v) => {
                            if (!isArmor) return true;
                            const values = getValues();
                            const mpvNum = toNullableNumber(v);
                            const ppvNum = toNullableNumber(values.ppv);
                            const hasAny =
                              (typeof ppvNum === 'number' && ppvNum > 0) ||
                              (typeof mpvNum === 'number' && mpvNum > 0);
                            return (
                              hasAny ||
                              'Armor must have at least 1 point of PPV or MPV.'
                            );
                          },
                        },
                      })}
                    />
                    {errors.mpv && (
                      <p className="text-xs text-red-400">
                        {errors.mpv.message as string}
                      </p>
                    )}
                  </div>
                </div>
                {/* Def effects */}
                {data && (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">
                      Greater Success – Defence
                    </label>
                    {renderDefEffectChips(defEffectsFromPicklist, defEffectIds)}
                  </div>
                )}
                {showMythicLimitBreakSection && renderMythicLimitBreakSection()}

                {/* Armor attributes */}
                {data && (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">
                      Armor Attributes
                    </label>
                    {renderArmorAttributeChips(
                      armorAttrsFromPicklist,
                      armorAttributeIds,
                    )}
                  </div>
                )}

                {/* Aura fields */}
                {hasAuraPhysicalAttr && (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">
                      Aura (Physical)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      step={1}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      {...register('auraPhysical', {
                        valueAsNumber: true,
                        validate: (v) =>
                          validateOptionalInRange(
                            v,
                            1,
                            5,
                            'Aura (Physical)',
                          ),
                      })}
                    />
                    {errors.auraPhysical && (
                      <p className="text-xs text-red-400">
                        {errors.auraPhysical.message as string}
                      </p>
                    )}
                  </div>
                )}

                {hasAuraMentalAttr && (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">
                      Aura (Mental)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      step={1}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      {...register('auraMental', {
                        valueAsNumber: true,
                        validate: (v) =>
                          validateOptionalInRange(
                            v,
                            1,
                            5,
                            'Aura (Mental)',
                          ),
                      })}
                    />
                    {errors.auraMental && (
                      <p className="text-xs text-red-400">
                        {errors.auraMental.message as string}
                      </p>
                    )}
                  </div>
                )}

                {/* Warding options */}
                {data && hasWardingAttr && (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">
                      Warding
                    </label>
                    {renderWardingOptionChips(
                      wardingOptionsFromPicklist,
                      wardingOptionIds,
                    )}
                  </div>
                )}

                {/* Sanctified options */}
                {data && hasSanctifiedAttr && (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">
                      Sanctified
                    </label>
                    {renderSanctifiedOptionChips(
                      sanctifiedOptionsFromPicklist,
                      sanctifiedOptionIds,
                    )}
                  </div>
                )}

                {/* VRP builder */}
                {renderVrpBuilder()}

                {/* Custom armor attributes */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium">
                    Custom Armor Attributes (no cost)
                  </label>
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Custom armor attribute notes (optional)."
                    {...register('customArmorAttributes')}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* SHIELD SECTION */}
        {isShield && (
          <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Shield Details</h2>
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                Set defence and optional VRP.
              </span>
            </div>

            {/* Size (shared with weapons) */}
            <div className="space-y-1">
              <label className="block text-xs font-medium">Size</label>
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('size', {
                  validate: (value) => {
                    if (!isWeapon && !isShield) return true;
                    const v = (value ?? '').toString().trim();
                    return v ? true : 'Size is required.';
                  },
                })}
              >
                <option value="">—</option>
                {WEAPON_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {SIZE_LABELS[s]}
                  </option>
                ))}
              </select>
              {errors.size && (
                <p className="text-xs text-red-400">
                  {errors.size.message as string}
                </p>
              )}
            </div>

            {/* Everything below is gated by hasSize */}
            {hasSize && (
              <>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">
                    Shield has attack?
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-zinc-600 bg-zinc-900"
                      {...register('shieldHasAttack')}
                    />
                    <span>Yes, this shield can make attacks</span>
                  </label>
                </div>

                {/* Shield attack section – uses same engine as weapons, no size picker */}
                {shieldHasAttack && renderAttackSection(false)}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">
                      Physical Protection Value (PPV)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={1}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      {...register('ppv', {
                        valueAsNumber: true,
                        validate: {
                          inRange: (v) =>
                            validateOptionalInRange(v, 0, 10, 'PPV'),
                          ppvOrMpvRequiredShield: (v) => {
                            if (!isShield) return true;
                            const values = getValues();
                            const ppvNum = toNullableNumber(v);
                            const mpvNum = toNullableNumber(values.mpv);
                            const hasAny =
                              (typeof ppvNum === 'number' && ppvNum > 0) ||
                              (typeof mpvNum === 'number' && mpvNum > 0);
                            return (
                              hasAny ||
                              'Shields must have at least 1 point of PPV or MPV.'
                            );
                          },
                        },
                      })}
                    />
                    {errors.ppv && isShield && (
                      <p className="text-xs text-red-400">
                        {errors.ppv.message as string}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium">
                      Mental Protection Value (MPV)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={1}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      {...register('mpv', {
                        valueAsNumber: true,
                        validate: {
                          inRange: (v) =>
                            validateOptionalInRange(v, 0, 10, 'MPV'),
                          ppvOrMpvRequiredShield: (v) => {
                            if (!isShield) return true;
                            const values = getValues();
                            const mpvNum = toNullableNumber(v);
                            const ppvNum = toNullableNumber(values.ppv);
                            const hasAny =
                              (typeof ppvNum === 'number' && ppvNum > 0) ||
                              (typeof mpvNum === 'number' && mpvNum > 0);
                            return (
                              hasAny ||
                              'Shields must have at least 1 point of PPV or MPV.'
                            );
                          },
                        },
                      })}
                    />
                    {errors.mpv && isShield && (
                      <p className="text-xs text-red-400">
                        {errors.mpv.message as string}
                      </p>
                    )}
                  </div>
                </div>
                {showMythicLimitBreakSection && renderMythicLimitBreakSection()}

                {/* VRP builder – shields share the same engine as armor */}
                {renderVrpBuilder()}

                {/* Shield attributes */}
                {data && (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">
                      Shield Attributes
                    </label>
                    {renderShieldAttributeChips(
                      shieldAttrsFromPicklist,
                      shieldAttributeIds,
                    )}
                  </div>
                )}

                {/* Custom shield attributes */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium">
                    Custom Shield Attributes (no cost)
                  </label>
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Custom shield attribute notes (optional)."
                    {...register('customShieldAttributes')}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ITEM SECTION */}
          {isItem && (
          <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Item Details</h2>
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                Set location and optional attributes.
              </span>
            </div>

            {/* Item Location */}
            <div className="space-y-1">
              <label className="block text-xs font-medium">
                Item Location
              </label>
               <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('itemLocation', {
                  validate: (value) => {
                    if (!isItem) return true;
                    const v = (value ?? '').toString().trim();
                    return v ? true : 'Item Location is required.';
                  },
                })}
              >
                <option value="">—</option>
                {itemLocationOptions.map((entry) => (
                  <option
                    key={entry.id}
                    value={entry.selector1.toUpperCase() as ItemLocation}
                  >
                    {entry.selector1}
                  </option>
                ))}
              </select>
              {errors.itemLocation && (
                <p className="text-xs text-red-400">
                  {errors.itemLocation.message as string}
                </p>
              )}
            </div>

            {/* Custom item attributes */}
            {hasItemLocation && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium">
                    Custom Item Attributes (no cost)
                  </label>
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Custom item attribute notes (optional)."
                    {...register('customItemAttributes')}
                  />
                </div>
                {showMythicLimitBreakSection && renderMythicLimitBreakSection()}
              </div>
            )}
          </div>
        )}

          {/* End BASIC + type-specific sections */}
        </div>

        {/* FORGE BUTTON */}
      <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleResetForge}
          className="inline-flex justify-center items-center rounded-md border border-zinc-700 bg-zinc-900 px-6 py-3 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
        >
          Reset the Forge
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex justify-center items-center rounded-md bg-emerald-600 px-6 py-3 text-sm font-semibold text-emerald-50 shadow-sm hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Forging…' : 'Forge'}
        </button>
      </div>
    </form>
    </div>

          {/* PREVIEW COLUMN */}
      <div
        className={`w-full md:w-1/2 p-3 md:p-8 md:overflow-y-auto ${previewMobileVisibility} md:block`}
      >
        <h2 className="text-xl font-semibold mb-4">Preview</h2>

        <div className="w-full rounded-xl border border-zinc-800 p-4 text-sm space-y-4">
          {loading && <p className="text-zinc-500">Waiting for picklists…</p>}
          {error && (
            <p className="text-red-400">
              Cannot show preview until picklists load: {String(error)}
            </p>
          )}

          {/* LIVE ITEM CARD (updates while typing) */}
          {!error && (
            <div className="space-y-3">
              {/* Header (above image) */}
              <div className="space-y-1">
                {(() => {
                  const rawSize = watchedValues.size as WeaponSize | null | undefined;
                  const sizeLabel = rawSize ? SIZE_LABELS[rawSize] ?? rawSize : null;

                  return (
                <p className="text-xs uppercase tracking-wide text-zinc-400">
                  {watchedValues.rarity} {watchedValues.type}
                  {' '}
                  -{' '}
                  {(watchedValues.type === 'WEAPON' ||
                    watchedValues.type === 'SHIELD') &&
                  sizeLabel
                    ? sizeLabel
                    : watchedValues.type === 'ARMOR' && watchedValues.armorLocation
                      ? watchedValues.armorLocation
                      : watchedValues.type === 'ITEM' && watchedValues.itemLocation
                        ? watchedValues.itemLocation
                        : 'Unassigned'}
                </p>
                  );
                })()}

                <p className="text-lg font-semibold">
                  {watchedValues.name?.trim() ? watchedValues.name : 'Unnamed item'}
                </p>

                {watchedValues.generalDescription?.trim() && (
                  <p className="text-zinc-200">{watchedValues.generalDescription}</p>
                )}
              </div>
                            {/* Descriptor output (starting with Modifiers) */}
              {(() => {
                if (!data) return null;

                const rangeCats = (watchedValues.rangeCategories ?? []) as RangeCategory[];

                // Choose a deterministic primary damage type:
                // first enabled range with ids, else anything selected, else null
                const meleeIds = watchedValues.meleeDamageTypeIds ?? [];
                const rangedIds = watchedValues.rangedDamageTypeIds ?? [];
                const aoeIds = watchedValues.aoeDamageTypeIds ?? [];

                const damageSpecsByIds = (ids: number[]) => {
                  const specs: Array<{ name: string; mode: 'PHYSICAL' | 'MENTAL' }> = [];

                  for (const id of ids) {
                    const dt = (data.damageTypes ?? []).find((d) => d.id === id);
                    if (!dt?.name) continue;

                    const mode = getDamageTypeMode(dt as any) === 'MENTAL' ? 'MENTAL' : 'PHYSICAL';
                    specs.push({ name: dt.name, mode });
                  }

                  // Dedup by name (case-insensitive), deterministic sort
                  const byName = new Map<string, { name: string; mode: 'PHYSICAL' | 'MENTAL' }>();
                  for (const s of specs) {
                    const key = s.name.toLowerCase();
                    if (!byName.has(key)) byName.set(key, s);
                  }

                  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
                };

                const meleeDamageTypes = damageSpecsByIds(meleeIds);
                const rangedDamageTypes = damageSpecsByIds(rangedIds);
                const aoeDamageTypes = damageSpecsByIds(aoeIds);

                // IMPORTANT: watchedValues.aoeShape can be '' which fails the engine's "aoe.shape" check
                const aoeShape = toNullableEnum<AoEShape>(watchedValues.aoeShape as any);

                const attackEffectNameById = new Map<number, string>();
                for (const fx of data?.attackEffects ?? []) {
                  if (typeof fx?.id === 'number' && fx?.name) {
                    attackEffectNameById.set(fx.id, fx.name);
                  }
                }

                const mapAttackEffectNames = (ids: number[] | undefined | null): string[] => {
                  const out: string[] = [];
                  for (const id of ids ?? []) {
                    const name = attackEffectNameById.get(id);
                    if (name) out.push(name);
                  }
                  return out;
                };

                const selectedWeaponAttributes = (watchedValues.weaponAttributeIds ?? [])
                  .map((id) => {
                    const a = (data.weaponAttributes ?? []).find((x: any) => x.id === id);
                    if (!a) return null;

                    const key = String(id);

                    const rawStrength = (watchedValues as any).weaponAttributeStrengthSources?.[key];
                    const strengthSource =
                      rawStrength === 'MELEE' || rawStrength === 'RANGED' || rawStrength === 'AOE'
                        ? rawStrength
                        : null;

                    const rawRange = (watchedValues as any).weaponAttributeRangeSelections?.[key];
                    const rangeSource =
                      rawRange === 'MELEE' || rawRange === 'RANGED' || rawRange === 'AOE'
                        ? rawRange
                        : null;

                    return {
                      name: String(a.name ?? '').trim(),
                      descriptorTemplate: (a.descriptorTemplate ?? null) as string | null,
                      strengthSource,
                      rangeSource,
                    };
                  })
                  .filter(Boolean)
                  .filter((a: any) => a.name.length > 0);

                const selectedArmorAttributes = (watchedValues.armorAttributeIds ?? [])
                  .map((id) => {
                    const a = (data.armorAttributes ?? []).find((x: any) => x.id === id);
                    if (!a) return null;

                    return {
                      name: String(a.name ?? '').trim(),
                      descriptorTemplate: (a.descriptorTemplate ?? null) as string | null,
                    };
                  })
                  .filter(Boolean)
                  .filter((a: any) => a.name.length > 0);

                // Shield Attributes (templated, like armor attributes)
                // NOTE: Shield attribute "AttributeValue" comes from ForgeCostEntry rows (category ShieldAttributes).
                // Your current rows are: selector1="TBC", selector2="<AttributeName>", value=<number>.
                // So we read selector2 for the name (fallback to selector1 if it’s not TBC).
                const selectedShieldAttributes = (watchedValues.shieldAttributeIds ?? [])
                  .map((id) => {
                    const s = (data.shieldAttributes ?? []).find((x: any) => x.id === id);
                    if (!s) return null;

                    const baseName = String(s.name ?? '').trim();
                    if (!baseName) return null;

                    const costRow = ((data.costs ?? []) as any[]).find((r) => {
                      if (r?.category !== 'ShieldAttributes') return false;
                      const sel1 = String(r?.selector1 ?? '');
                      const sel2 = String(r?.selector2 ?? '');
                      // Current broken shape: selector1=TBC, selector2=Name
                      if (sel1 === 'TBC') return sel2 === baseName;
                      // Future/ideal shape: selector1=Name
                      return sel1 === baseName;
                    });

                    const numericValue =
                      costRow && typeof costRow.value === 'number'
                        ? costRow.value
                        : null;

                    return {
                      name: baseName,
                      attributeValue: numericValue,
                      descriptorTemplate: (s.descriptorTemplate ?? null) as string | null,
                    };

                  })
                  .filter(Boolean)
                  .filter((s: any) => s.name.length > 0);

                const defEffectNames = namesByIds(
                  (data.defEffects ?? []) as any,
                  (watchedValues.defEffectIds ?? []) as number[],
                );

                const damageTypeNameById = new Map<number, string>();
                for (const dt of data.damageTypes ?? []) {
                  if (typeof dt?.id === 'number' && dt?.name) {
                    damageTypeNameById.set(dt.id, dt.name);
                  }
                }

                const wardingOptionNames = namesByIds(
                  (data.wardingOptions ?? []) as any,
                  (watchedValues.wardingOptionIds ?? []) as number[],
                );

                const sanctifiedOptionNames = namesByIds(
                  (data.sanctifiedOptions ?? []) as any,
                  (watchedValues.sanctifiedOptionIds ?? []) as number[],
                );

                const vrpForEngine = (vrpEntries ?? [])
                  .map((e) => {
                    const dtName = damageTypeNameById.get(e.damageTypeId);
                    if (!dtName) return null;

                    return {
                      effectKind: e.effectKind,
                      magnitude: Number(e.magnitude ?? 0),
                      damageType: dtName,
                    };
                  })
                  .filter(Boolean);

                const engineInput = {
                  itemType: watchedValues.type,
                  globalAttributeModifiers: watchedValues.globalAttributeModifiers ?? [],

                  // Weapon-only (engine ignores these for ARMOR anyway)
                  weaponAttributes: selectedWeaponAttributes,

                  // Armor / Shield shared defence + attributes
                  ppv: Number((watchedValues as any).ppv ?? 0),
                  mpv: Number((watchedValues as any).mpv ?? 0),
                  auraPhysical: (watchedValues as any).auraPhysical ?? null,
                  auraMental: (watchedValues as any).auraMental ?? null,
                  defEffects: defEffectNames,
                  armorAttributes: selectedArmorAttributes,
                  shieldAttributes: selectedShieldAttributes,
                  wardingOptions: wardingOptionNames,
                  sanctifiedOptions: sanctifiedOptionNames,
                  vrpEntries: vrpForEngine,
                  customArmorAttributes: safeCustomArmorAttributesTrimmed,
                  customShieldAttributes: safeCustomShieldAttributesTrimmed,

                  // Ranges (engine ignores these for ARMOR anyway)
                  melee: {
                    enabled: rangeCats.includes('MELEE'),
                    damageTypes: meleeDamageTypes,
                    targets: Number(watchedValues.meleeTargets ?? 1),
                    physicalStrength: Number((watchedValues as any).meleePhysicalStrength ?? 0),
                    mentalStrength: Number((watchedValues as any).meleeMentalStrength ?? 0),
                    gsAttackEffects: mapAttackEffectNames((watchedValues as any).attackEffectMeleeIds),
                  },
                  ranged: {
                    enabled: rangeCats.includes('RANGED'),
                    damageTypes: rangedDamageTypes,
                    targets: Number(watchedValues.rangedTargets ?? 1),
                    distance: Number(watchedValues.rangedDistanceFeet ?? 0),
                    physicalStrength: Number((watchedValues as any).rangedPhysicalStrength ?? 0),
                    mentalStrength: Number((watchedValues as any).rangedMentalStrength ?? 0),
                    gsAttackEffects: mapAttackEffectNames((watchedValues as any).attackEffectRangedIds),
                  },
                  aoe: {
                    enabled: rangeCats.includes('AOE'),
                    damageTypes: aoeDamageTypes,
                    count: Number(watchedValues.aoeCount ?? 1),
                    centerRange: Number(watchedValues.aoeCenterRangeFeet ?? 0),

                    // IMPORTANT: normalize '' -> null so the engine doesn't drop AoE lines
                    shape: aoeShape,

                    // AoE geometry (wired into descriptor engine)
                    geometry: {
                      ...(aoeShape === 'SPHERE' && toNullableNumber((watchedValues as any).aoeSphereRadiusFeet)
                        ? { radius: Number((watchedValues as any).aoeSphereRadiusFeet) }
                        : {}),
                      ...(aoeShape === 'CONE' && toNullableNumber((watchedValues as any).aoeConeLengthFeet)
                        ? { length: Number((watchedValues as any).aoeConeLengthFeet) }
                        : {}),
                      ...(aoeShape === 'LINE'
                        ? {
                            ...(toNullableNumber((watchedValues as any).aoeLineLengthFeet)
                              ? { length: Number((watchedValues as any).aoeLineLengthFeet) }
                              : {}),
                            ...(toNullableNumber((watchedValues as any).aoeLineWidthFeet)
                              ? { width: Number((watchedValues as any).aoeLineWidthFeet) }
                              : {}),
                          }
                        : {}),
                    },

                    physicalStrength: Number((watchedValues as any).aoePhysicalStrength ?? 0),
                    mentalStrength: Number((watchedValues as any).aoeMentalStrength ?? 0),
                    gsAttackEffects: mapAttackEffectNames((watchedValues as any).attackEffectAoEIds),
                  },
                };

                const descriptor = buildDescriptorResult(engineInput as any);
                const rendered = renderForgeResult(descriptor);

                const modifiers = rendered.find((s: { title: string; lines: string[] }) => s.title === 'Modifiers');
                const weaponAttributes = rendered.find((s: { title: string; lines: string[] }) => s.title === 'Weapon Attributes');
                const attack = rendered.find((s: { title: string; lines: string[] }) => s.title === 'Attack Actions');

                const defence = rendered.find((s: { title: string; lines: string[] }) => s.title === 'Defence');
                const greaterDefence = rendered.find((s: { title: string; lines: string[] }) => s.title === 'Greater Defence Effects');
                const armorAttributes = rendered.find((s: { title: string; lines: string[] }) => s.title === 'Armor Attributes');
                const shieldAttributes = rendered.find((s: { title: string; lines: string[] }) => s.title === 'Shield Attributes');
                const vrp = rendered.find((s: { title: string; lines: string[] }) => s.title === 'VRP');

                const showModifiers = Boolean(modifiers && modifiers.lines.length > 0);
                const showWeaponAttributes = Boolean(weaponAttributes && weaponAttributes.lines.length > 0);
                const showAttack = Boolean(attack && attack.lines.length > 0);

                const showDefence = Boolean(defence && defence.lines.length > 0);
                const showGreaterDefence = Boolean(greaterDefence && greaterDefence.lines.length > 0);
                const showArmorAttributes = Boolean(armorAttributes && armorAttributes.lines.length > 0);
                const showShieldAttributes = Boolean(shieldAttributes && shieldAttributes.lines.length > 0);
                const showVrp = Boolean(vrp && vrp.lines.length > 0);

                const showCustomWeapon =
                  watchedValues.type === 'WEAPON' && safeCustomWeaponAttributesTrimmed.length > 0;
                const showCustomArmor =
                  watchedValues.type === 'ARMOR' && safeCustomArmorAttributesTrimmed.length > 0;
                const showCustomShield =
                  watchedValues.type === 'SHIELD' && safeCustomShieldAttributesTrimmed.length > 0;
                const showCustomItem =
                  watchedValues.type === 'ITEM' && safeCustomItemAttributesTrimmed.length > 0;

                // Armor-only: show the shared "Whilst wearing..." preface ONLY when we have
                // at least one non-custom armor line (global modifiers OR armor attributes OR VRP OR greater defence).
                // If the user only typed Custom Armor Attributes, do NOT show the preface.
                const showArmorWearPreface =
                  watchedValues.type === 'ARMOR' &&
                  (showModifiers || showArmorAttributes || showVrp || showGreaterDefence);

                const showShieldWieldPreface =
                  watchedValues.type === 'SHIELD' &&
                  (showModifiers || showVrp || showShieldAttributes);

                const stripArmorPrefixForBullet = (line: string): string => {
                  let s = String(line ?? '').trim();

                  // Normalize the repetitive starters into clean bullet fragments
                  const prefixes = [
                    'Whilst wearing this armor, the wielder gains ',
                    'Whilst wearing this armor, you gain ',
                    'Whilst wearing this armor, you suffer ',
                  ];

                  for (const p of prefixes) {
                    if (s.startsWith(p)) {
                      s = s.slice(p.length).trim();
                      break;
                    }
                  }

                  // Also make GS defence effects fit the same pattern
                  const gsPrefix = 'Greater successes on Defence rolls grant you ';
                  if (s.startsWith(gsPrefix)) {
                    s = s.slice(gsPrefix.length).trim();
                  }

                  // Remove trailing period for tighter bullets (optional, but cleaner)
                  if (s.endsWith('.')) s = s.slice(0, -1);

                  return s;
                };

                const renderArmorBullets = (lines: string[], keyPrefix: string) => {
                  return (
                    <ul className="list-disc pl-5 space-y-1">
                      {lines
                        .map((l) => stripArmorPrefixForBullet(l))
                        .filter((l) => l.length > 0)
                        .map((l, idx) => (
                          <li key={`${keyPrefix}-${idx}`} className="text-sm leading-5">
                            {l}
                          </li>
                        ))}
                    </ul>
                  );
                };

                const stripShieldPrefixForBullet = (line: string): string => {
                  let s = String(line ?? '').trim();

                  const prefixes = [
                    'Whilst wielding this shield, the wielder gains ',
                    'Whilst wielding this shield, you gain ',
                    'Whilst wielding this shield, you suffer ',
                  ];

                  for (const p of prefixes) {
                    if (s.startsWith(p)) {
                      s = s.slice(p.length).trim();
                      break;
                    }
                  }

                  if (s.endsWith('.')) s = s.slice(0, -1);
                  return s;
                };

                const renderShieldBullets = (lines: string[], keyPrefix: string) => {
                  return (
                    <ul className="list-disc pl-5 space-y-1">
                      {lines
                        .map((l) => stripShieldPrefixForBullet(l))
                        .filter((l) => l.length > 0)
                        .map((l, idx) => (
                          <li key={`${keyPrefix}-${idx}`} className="text-sm leading-5">
                            {l}
                          </li>
                        ))}
                    </ul>
                  );
                };

                if (
                  !showModifiers &&
                  !showWeaponAttributes &&
                  !showAttack &&
                  !showDefence &&
                  !showGreaterDefence &&
                  !showArmorAttributes &&
                  !showVrp &&
                  !DEBUG_DESCRIPTORS
                ) {
                  // Still show the image even if there are no descriptor lines yet.
                  return (
                    <div className="mt-3 space-y-4">
                      {/* Image (placeholder by default, swap to URL if valid) */}
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                        <img
                          src={
                            isHttpUrl(watchedValues.itemUrl)
                              ? watchedValues.itemUrl.trim()
                              : '/item-placeholder.png'
                          }
                          alt={watchedValues.name?.trim() ? watchedValues.name : 'Item image'}
                          className="w-full max-h-[520px] object-contain bg-zinc-950/20"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            // If user URL fails (hotlink blocked/404), fall back to placeholder.
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = '/item-placeholder.png';
                          }}
                        />
                      </div>
                    </div>
                  );
                }


                return (
                  <div className="mt-3 space-y-4">
                    {DEBUG_DESCRIPTORS && (
                      <div className="rounded border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200 space-y-2">
                        <div className="font-mono text-zinc-400">
                          Descriptor Debug (roll for insight)
                        </div>

                        <div>
                          <div className="text-zinc-400 mb-1">Engine input</div>
                          <pre className="whitespace-pre-wrap break-words">
                            {JSON.stringify(engineInput, null, 2)}
                          </pre>
                        </div>

                        <div>
                          <div className="text-zinc-400 mb-1">
                            Engine output (sections/lines)
                          </div>
                          <pre className="whitespace-pre-wrap break-words">
                            {JSON.stringify(descriptor, null, 2)}
                          </pre>
                        </div>

                        <div>
                          <div className="text-zinc-400 mb-1">Rendered output</div>
                          <pre className="whitespace-pre-wrap break-words">
                            {JSON.stringify(rendered, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Image (placeholder by default, swap to URL if valid) */}

                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                      <img
                        src={
                          isHttpUrl(watchedValues.itemUrl)
                            ? watchedValues.itemUrl.trim()
                            : '/item-placeholder.png'
                        }
                        alt={watchedValues.name?.trim() ? watchedValues.name : 'Item image'}
                        className="w-full max-h-[520px] object-contain bg-zinc-950/20"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          // If user URL fails (hotlink blocked/404), fall back to placeholder.
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = '/item-placeholder.png';
                        }}
                      />
                    </div>

                  {(() => {
                    const showAttributesBox =
                      showModifiers ||
                      showWeaponAttributes ||
                      showArmorAttributes ||
                      showShieldAttributes ||
                      showVrp ||
                      showCustomArmor ||
                      showCustomShield ||
                      showCustomItem;

                    const showDefenceBox = showDefence || showGreaterDefence;

                    const formatGreaterDefenceLine = (lines: string[]): string => {
                      // Existing engine lines look like:
                      // "Greater successes on Defence rolls grant you 1 stack of Feedback."
                      // We normalize into one sentence with a list.
                      const prefix = 'Greater successes on Defence rolls grant you 1 stack of ';

                      const names = lines
                        .map((l) => String(l ?? '').trim())
                        .map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : l))
                        .map((l) => (l.endsWith('.') ? l.slice(0, -1) : l))
                        .map((l) => l.trim())
                        .filter(Boolean);

                      if (names.length === 0) return '';

                      if (names.length === 1) return `Greater successes on defence rolls grant you 1 stack of ${names[0]}.`;
                      if (names.length === 2) return `Greater successes on defence rolls grant you 1 stack of ${names[0]} or ${names[1]}.`;

                      const head = names.slice(0, -1).join(', ');
                      const tail = names[names.length - 1];
                      return `Greater successes on defence rolls grant you 1 stack of ${head} or ${tail}.`;
                    };

                    return (
                      <>
                        {/* ATTRIBUTES BOX */}
                        {showAttributesBox && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
                              <p className="text-xs uppercase tracking-wide text-zinc-500">
                              Attributes
                            </p>

                            {showArmorWearPreface && (
                              <p className="text-sm leading-5 text-zinc-200">
                                Whilst wearing this armor, the wielder gains
                              </p>
                            )}

                            {showShieldWieldPreface && (
                              <p className="text-sm leading-5 text-zinc-200">
                                Whilst wielding this shield, the wielder gains
                              </p>
                            )}
                          {/* Modifiers */}
                          {watchedValues.type === 'ARMOR' && showModifiers && modifiers && (
                            renderArmorBullets(modifiers.lines, 'mod')
                          )}
                          {watchedValues.type === 'SHIELD' && showModifiers && modifiers && (
                            renderShieldBullets(modifiers.lines, 'mod')
                          )}
                          {watchedValues.type !== 'ARMOR' && watchedValues.type !== 'SHIELD' && showModifiers && modifiers && (
                            <div className="space-y-1">
                              {modifiers.lines.map((l, idx) => (
                                <p key={`mod-${idx}`} className="text-sm leading-5">
                                  {l}
                                </p>
                              ))}
                            </div>
                          )}

                            {/* Weapon Attributes */}
                            {showWeaponAttributes && weaponAttributes && (
                              <div className="space-y-1">
                                {weaponAttributes.lines.map((l, idx) => (
                                  <p key={`wa-${idx}`} className="text-sm leading-5">
                                    {l}
                                  </p>
                                ))}
                              </div>
                            )}

                            {showCustomWeapon && (
                              <p className="text-sm leading-5">
                                Custom: {safeCustomWeaponAttributesTrimmed}
                              </p>
                            )}

                            {/* VRP */}
                            {watchedValues.type === 'ARMOR' && showVrp && vrp && (
                              renderArmorBullets(vrp.lines, 'vrp')
                            )}
                            {watchedValues.type === 'SHIELD' && showVrp && vrp && (
                              renderShieldBullets(vrp.lines, 'vrp')
                            )}
                            {watchedValues.type !== 'ARMOR' && watchedValues.type !== 'SHIELD' && showVrp && vrp && (
                              <div className="space-y-1">
                                {vrp.lines.map((l, idx) => (
                                  <p key={`vrp-${idx}`} className="text-sm leading-5">
                                    {l}
                                  </p>
                                ))}
                              </div>
                            )}

                          {/* Armor Attributes */}
                            {watchedValues.type === 'ARMOR' && showArmorAttributes && armorAttributes && (
                              renderArmorBullets(armorAttributes.lines, 'aa')
                            )}
                            {watchedValues.type !== 'ARMOR' && showArmorAttributes && armorAttributes && (
                              <div className="space-y-1">
                                {armorAttributes.lines.map((l, idx) => (
                                  <p key={`aa-${idx}`} className="text-sm leading-5">
                                    {l}
                                  </p>
                                ))}
                              </div>
                            )}

                            {/* Shield Attributes */}
                            {watchedValues.type === 'SHIELD' && showShieldAttributes && shieldAttributes && (
                              renderShieldBullets(shieldAttributes.lines, 'sa')
                            )}

                            {/* Custom LAST */}
                            {showCustomArmor && (
                              <p className="text-sm leading-5">
                                Custom: {safeCustomArmorAttributesTrimmed}
                              </p>
                            )}

                            {showCustomShield && (
                              <p className="text-sm leading-5">
                                Custom: {safeCustomShieldAttributesTrimmed}
                              </p>
                            )}

                            {showCustomItem && (
                              <p className="text-sm leading-5">
                                Custom: {safeCustomItemAttributesTrimmed}
                              </p>
                            )}
                          </div>
                        )}

                        {/* DEFENCE BOX */}
                        {showDefenceBox && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
                            <p className="text-xs uppercase tracking-wide text-zinc-500">
                              {(defence && defence.title) ? defence.title : 'Defence'}
                            </p>
                            <div className="space-y-1">
                              {(defence?.lines ?? []).map((l, idx) => (
                                <p key={`def-${idx}`} className="text-sm leading-5">
                                  {l}
                                </p>
                              ))}
                            </div>

                            {watchedValues.type === 'ARMOR' && showGreaterDefence && greaterDefence && (
                              (() => {
                                const line = formatGreaterDefenceLine(greaterDefence.lines);
                                if (!line) return null;
                                return (
                                  <p className="text-sm leading-5 text-zinc-200">
                                    {line}
                                  </p>
                                );
                              })()
                            )}
                          </div>
                        )}

                        {/* ATTACK BOX */}
                        {showAttack && attack && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
                            <p className="text-xs uppercase tracking-wide text-zinc-500">
                              {attack.title}
                            </p>

                            {attack.lines.map((line: string, idx: number) => {
                              const parts = String(line).split('||');
                              const hasHeader = parts.length > 1;

                              const header = (hasHeader ? parts[0] : '').trim();
                              const text = (hasHeader
                                ? parts.slice(1).join('||')
                                : parts[0]
                              ).trim();

                              return (
                                <div
                                  key={`atk-${idx}`}
                                  className="grid grid-cols-[72px_1fr] gap-x-2"
                                >
                                  <div className="text-zinc-200 font-semibold">
                                    {header}
                                  </div>
                                  <div className="text-zinc-200">{text}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  </div>
                );
              })()}
            </div>
          )}


        </div>
      </div>
    </div>
  );
}


function ForgeCalculatorPanel({ totals }: { totals: ForgeCalculatorTotals }) {
  const total = totals.totalFp;
  const spent = totals.spentFp;
  const remaining = totals.remainingFp;
  const percent = totals.percentSpent;
  const overspent = remaining < 0;

  const safePercent = total > 0 ? Math.max(0, Math.min(100, percent)) : 0;

  return (
    <div className="sticky top-12 md:top-0 z-20 mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow">
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="flex-1 text-center">
          <div className="text-xs uppercase tracking-wide text-zinc-400">Total FP</div>
          <div className="text-lg font-semibold text-zinc-50">{total.toFixed(2)}</div>
        </div>

        <div className="flex-1 text-center">
          <div className="text-xs uppercase tracking-wide text-zinc-400">Spent</div>
          <div className="text-lg font-semibold text-zinc-50">{spent.toFixed(2)}</div>
        </div>

        <div className="flex-1 text-center">
          <div className="text-xs uppercase tracking-wide text-zinc-400">Remaining</div>
          <div
            className={
              'text-lg font-semibold ' + (overspent ? 'text-red-400' : 'text-zinc-50')
            }
          >
            {remaining.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={'h-full rounded-full ' + (overspent ? 'bg-red-500' : 'bg-emerald-500')}
          style={{ width: `${safePercent}%` }}
        />
      </div>

      <div className="text-right text-[11px] text-zinc-400">
        {total > 0 ? `${safePercent.toFixed(0)}% spent` : '0% spent'}
      </div>
    </div>
  );
}


