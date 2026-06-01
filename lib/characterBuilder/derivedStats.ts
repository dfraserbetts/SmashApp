import { DEFAULT_COMBAT_TUNING_VALUES, type ProtectionTuningValues } from "@/lib/config/combatTuningShared";
import {
  calculateResilienceValuesFromAttributeNumbers,
  getDodgeValueFromAttributeNumbers,
  weightedSkillFromAttributes,
} from "@/lib/summoning/attributes";
import {
  getHighestItemModifiers,
  getProtectionTotalsFromItems,
  type SummoningEquipmentItem,
} from "@/lib/summoning/equipment";
import { renderAttackActionLines } from "@/lib/summoning/render";
import type { AttributePlacement, MonsterNaturalAttackConfig } from "@/lib/summoning/types";
import {
  CHARACTER_ATTRIBUTES,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_SLOTS,
  type CharacterAttribute,
  type CharacterBuilderData,
  type EquipmentSlotKey,
} from "./core";

type DamageTypeSummary = { name: string; mode: "PHYSICAL" | "MENTAL" };

export type CharacterBuilderDerivedBackpackItem = {
  id: string;
  quantity: number;
  itemTemplate: {
    id: string;
    itemUrl?: string | null;
    name: string | null;
    rarity?: string | null;
    level?: number | null;
    details?: string | null;
    type: string | null;
    size: string | null;
    armorLocation: string | null;
    itemLocation?: string | null;
    ppv?: number | null;
    mpv?: number | null;
    globalAttributeModifiers?: Array<{ attribute?: string; amount?: number }> | null;
    meleeTargets?: number | null;
    rangedTargets?: number | null;
    rangedDistanceFeet?: number | null;
    aoeCenterRangeFeet?: number | null;
    aoeCount?: number | null;
    aoeShape?: "SPHERE" | "CONE" | "LINE" | null;
    aoeSphereRadiusFeet?: number | null;
    aoeConeLengthFeet?: number | null;
    aoeLineWidthFeet?: number | null;
    aoeLineLengthFeet?: number | null;
    physicalStrength?: number | null;
    mentalStrength?: number | null;
    meleePhysicalStrength?: number | null;
    meleeMentalStrength?: number | null;
    rangedPhysicalStrength?: number | null;
    rangedMentalStrength?: number | null;
    aoePhysicalStrength?: number | null;
    aoeMentalStrength?: number | null;
    meleeDamageTypes?: DamageTypeSummary[];
    rangedDamageTypes?: DamageTypeSummary[];
    aoeDamageTypes?: DamageTypeSummary[];
    attackEffectsMelee?: string[];
    attackEffectsRanged?: string[];
    attackEffectsAoE?: string[];
    descriptorSections?: Array<{
      title: string;
      lines: string[];
      linePlacements?: Array<AttributePlacement | null>;
      lineEffectFamilies?: Array<string | null>;
      lineEffectValues?: Array<number | null>;
    }>;
  };
};

export type CharacterDerivedCombatStats = {
  physicalHealth: number;
  mentalHealth: number;
  weaponSkill: number;
  armorSkill: number;
  willpower: number;
  dodgeValue: number;
  dodgeDice: number;
  physicalProtection: number;
  mentalProtection: number;
  physicalBlockPerSuccess: number;
  mentalBlockPerSuccess: number;
  attacks: Array<{ slot: EquipmentSlotKey; slotLabel: string; label: string; lines: string[] }>;
  defenceStrings: string[];
  protectionSources: Array<{
    slot: EquipmentSlotKey;
    itemName: string;
    physicalProtection: number;
    mentalProtection: number;
  }>;
  itemOutputSections: Array<{
    slot: EquipmentSlotKey;
    itemName: string;
    title: string;
    lines: string[];
    linePlacements?: Array<AttributePlacement | null>;
    lineEffectFamilies?: Array<string | null>;
    lineEffectValues?: Array<number | null>;
  }>;
  itemModifiers: ReturnType<typeof getHighestItemModifiers>;
  notes: string[];
};

function attributeNumber(
  attributes: CharacterBuilderData["attributes"],
  attribute: CharacterAttribute,
) {
  const value = attributes[attribute];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function itemName(item: CharacterBuilderDerivedBackpackItem) {
  return item.itemTemplate.name?.trim() || "(Unnamed item)";
}

function equippedSlotDisplayLabel(
  slot: EquipmentSlotKey,
  item: CharacterBuilderDerivedBackpackItem,
) {
  return (slot === "mainHand" || slot === "offHand") &&
    item.itemTemplate.type === "WEAPON" &&
    item.itemTemplate.size === "TWO_HANDED"
    ? "Two-Handed"
    : EQUIPMENT_SLOT_LABELS[slot];
}

function numberOrZero(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function positiveModifier(value: unknown) {
  const numeric = numberOrZero(value);
  return Math.max(0, Math.trunc(numeric));
}

export function getEquippedEntries(
  data: CharacterBuilderData,
  backpackItems: CharacterBuilderDerivedBackpackItem[],
) {
  const byId = new Map(backpackItems.map((item) => [item.id, item]));
  return EQUIPMENT_SLOTS.flatMap((slot) => {
    const backpackItemId = data.equippedSlots[slot];
    const backpackItem = backpackItemId ? byId.get(backpackItemId) : null;
    return backpackItem ? [{ slot, backpackItem }] : [];
  });
}

function toSummoningEquipmentItem(
  item: CharacterBuilderDerivedBackpackItem,
): SummoningEquipmentItem {
  return {
    id: item.itemTemplate.id,
    name: itemName(item),
    level: null,
    rarity: null,
    type: item.itemTemplate.type as SummoningEquipmentItem["type"],
    size: item.itemTemplate.size as SummoningEquipmentItem["size"],
    armorLocation: item.itemTemplate.armorLocation as SummoningEquipmentItem["armorLocation"],
    itemLocation: item.itemTemplate.itemLocation as SummoningEquipmentItem["itemLocation"],
    ppv: item.itemTemplate.ppv ?? null,
    mpv: item.itemTemplate.mpv ?? null,
    globalAttributeModifiers: item.itemTemplate.globalAttributeModifiers ?? [],
  };
}

function enabledStrength(physicalStrength: unknown, mentalStrength: unknown) {
  return numberOrZero(physicalStrength) > 0 || numberOrZero(mentalStrength) > 0;
}

export function buildAttackConfig(
  item: CharacterBuilderDerivedBackpackItem,
): MonsterNaturalAttackConfig {
  const template = item.itemTemplate;
  const meleePhysicalStrength = template.meleePhysicalStrength ?? template.physicalStrength ?? 0;
  const meleeMentalStrength = template.meleeMentalStrength ?? template.mentalStrength ?? 0;
  const rangedPhysicalStrength = template.rangedPhysicalStrength ?? template.physicalStrength ?? 0;
  const rangedMentalStrength = template.rangedMentalStrength ?? template.mentalStrength ?? 0;
  const aoePhysicalStrength = template.aoePhysicalStrength ?? template.physicalStrength ?? 0;
  const aoeMentalStrength = template.aoeMentalStrength ?? template.mentalStrength ?? 0;

  return {
    melee: {
      enabled: enabledStrength(meleePhysicalStrength, meleeMentalStrength),
      targets: Math.max(1, Math.trunc(numberOrZero(template.meleeTargets) || 1)),
      physicalStrength: numberOrZero(meleePhysicalStrength),
      mentalStrength: numberOrZero(meleeMentalStrength),
      damageTypes: template.meleeDamageTypes ?? [],
      attackEffects: template.attackEffectsMelee ?? [],
    },
    ranged: {
      enabled: enabledStrength(rangedPhysicalStrength, rangedMentalStrength),
      targets: Math.max(1, Math.trunc(numberOrZero(template.rangedTargets) || 1)),
      distance: Math.max(0, Math.trunc(numberOrZero(template.rangedDistanceFeet))),
      physicalStrength: numberOrZero(rangedPhysicalStrength),
      mentalStrength: numberOrZero(rangedMentalStrength),
      damageTypes: template.rangedDamageTypes ?? [],
      attackEffects: template.attackEffectsRanged ?? [],
    },
    aoe: {
      enabled: enabledStrength(aoePhysicalStrength, aoeMentalStrength),
      count: Math.max(1, Math.trunc(numberOrZero(template.aoeCount) || 1)),
      centerRange: Math.max(0, Math.trunc(numberOrZero(template.aoeCenterRangeFeet))),
      shape: template.aoeShape ?? "SPHERE",
      sphereRadiusFeet: Math.max(0, Math.trunc(numberOrZero(template.aoeSphereRadiusFeet))),
      coneLengthFeet: Math.max(0, Math.trunc(numberOrZero(template.aoeConeLengthFeet))),
      lineWidthFeet: Math.max(0, Math.trunc(numberOrZero(template.aoeLineWidthFeet))),
      lineLengthFeet: Math.max(0, Math.trunc(numberOrZero(template.aoeLineLengthFeet))),
      physicalStrength: numberOrZero(aoePhysicalStrength),
      mentalStrength: numberOrZero(aoeMentalStrength),
      damageTypes: template.aoeDamageTypes ?? [],
      attackEffects: template.attackEffectsAoE ?? [],
    },
  };
}

function itemOutputSections(
  entries: Array<{ slot: EquipmentSlotKey; backpackItem: CharacterBuilderDerivedBackpackItem }>,
) {
  const relevantTitles = new Set([
    "Modifiers",
    "Weapon Attributes",
    "Defence",
    "Greater Defence Effects",
    "Armor Attributes",
    "Shield Attributes",
    "VRP",
    "Custom Weapon Attributes",
    "Custom Armor Attributes",
    "Custom Shield Attributes",
    "Custom Item Attributes",
  ]);
  return entries.flatMap(({ slot, backpackItem }) =>
    (backpackItem.itemTemplate.descriptorSections ?? [])
      .filter((section) => relevantTitles.has(section.title))
      .map((section) => ({
        slot,
        itemName: itemName(backpackItem),
        title: section.title,
        lines: section.lines,
        linePlacements: section.linePlacements,
        lineEffectFamilies: section.lineEffectFamilies,
        lineEffectValues: section.lineEffectValues,
      })),
  );
}

export function buildCharacterDerivedCombatStats(params: {
  level: number;
  builderData: CharacterBuilderData;
  backpackItems: CharacterBuilderDerivedBackpackItem[];
  protectionTuning?: ProtectionTuningValues;
}): CharacterDerivedCombatStats {
  const tuning = params.protectionTuning ?? DEFAULT_COMBAT_TUNING_VALUES;
  const level = Math.max(1, Math.trunc(params.level || 1));
  const equippedEntries = getEquippedEntries(params.builderData, params.backpackItems);
  const equippedItems = equippedEntries.map(({ backpackItem }) =>
    toSummoningEquipmentItem(backpackItem),
  );
  const itemModifiers = getHighestItemModifiers(equippedItems);
  const itemProtection = getProtectionTotalsFromItems(equippedItems);

  const attackValue = attributeNumber(params.builderData.attributes, "Attack");
  const guardValue = attributeNumber(params.builderData.attributes, "Guard");
  const fortitudeValue = attributeNumber(params.builderData.attributes, "Fortitude");
  const intellectValue = attributeNumber(params.builderData.attributes, "Intellect");
  const synergyValue = attributeNumber(params.builderData.attributes, "Synergy");
  const braveryValue = attributeNumber(params.builderData.attributes, "Bravery");

  const resilience = calculateResilienceValuesFromAttributeNumbers(
    {
      level,
      tier: "SOLDIER",
      legendary: false,
      attackValue,
      guardValue,
      fortitudeValue,
      intellectValue,
      synergyValue,
      braveryValue,
    },
    tuning,
  );

  const weaponSkill = Math.max(
    1,
    weightedSkillFromAttributes(braveryValue, attackValue, {
      primaryWeight: tuning.weaponSkillBraveryWeight,
      secondaryWeight: tuning.weaponSkillAttackWeight,
      baselineOffset: tuning.weaponSkillBaselineOffset,
      scale: tuning.weaponSkillScale,
    }) + positiveModifier(itemModifiers.weaponSkillModifier),
  );
  const armorSkill = Math.max(
    1,
    weightedSkillFromAttributes(fortitudeValue, guardValue, {
      primaryWeight: tuning.armorSkillFortitudeWeight,
      secondaryWeight: tuning.armorSkillGuardWeight,
      baselineOffset: tuning.armorSkillBaselineOffset,
      scale: tuning.armorSkillScale,
    }) + positiveModifier(itemModifiers.armorSkillModifier),
  );
  const willpower = Math.max(
    1,
    weightedSkillFromAttributes(synergyValue, braveryValue, {
      primaryWeight: tuning.willpowerSynergyWeight,
      secondaryWeight: tuning.willpowerBraveryWeight,
      baselineOffset: tuning.willpowerBaselineOffset,
      scale: tuning.willpowerScale,
    }) + positiveModifier(itemModifiers.willpowerModifier),
  );

  const physicalProtection = itemProtection.physicalProtection;
  const mentalProtection = itemProtection.mentalProtection;
  const dodgeValue = Math.max(
    0,
    getDodgeValueFromAttributeNumbers(
      guardValue,
      intellectValue,
      level,
      physicalProtection,
      tuning,
    ),
  );
  const dodgeDice = Math.max(0, Math.ceil(dodgeValue / 6) + positiveModifier(itemModifiers.dodgeModifier));
  const physicalBlockPerSuccess =
    physicalProtection <= 0
      ? 0
      : Math.ceil(
          (physicalProtection / tuning.protectionK) * (1 + Math.max(1, armorSkill) / tuning.protectionS),
        );
  const mentalBlockPerSuccess =
    mentalProtection <= 0
      ? 0
      : Math.ceil(
          (mentalProtection / tuning.protectionK) * (1 + Math.max(1, willpower) / tuning.protectionS),
        );

  const attacks = equippedEntries.flatMap(({ slot, backpackItem }) => {
    const template = backpackItem.itemTemplate;
    if (template.type !== "WEAPON" && template.type !== "SHIELD") return [];
    const lines = renderAttackActionLines(buildAttackConfig(backpackItem), weaponSkill, {
      applyWeaponSkillOverride: true,
    });
    if (lines.length === 0) return [];
    const slotLabel = equippedSlotDisplayLabel(slot, backpackItem);
    return [
      {
        slot,
        slotLabel,
        label: `${slotLabel}: ${itemName(backpackItem)}`,
        lines,
      },
    ];
  });

  const protectionSources = equippedEntries.flatMap(({ slot, backpackItem }) => {
    const physical = Math.max(0, numberOrZero(backpackItem.itemTemplate.ppv));
    const mental = Math.max(0, numberOrZero(backpackItem.itemTemplate.mpv));
    if (physical <= 0 && mental <= 0) return [];
    return [
      {
        slot,
        itemName: itemName(backpackItem),
        physicalProtection: physical,
        mentalProtection: mental,
      },
    ];
  });

  return {
    physicalHealth: resilience.physicalResilienceMax,
    mentalHealth: resilience.mentalPerseveranceMax,
    weaponSkill,
    armorSkill,
    willpower,
    dodgeValue,
    dodgeDice,
    physicalProtection,
    mentalProtection,
    physicalBlockPerSuccess,
    mentalBlockPerSuccess,
    attacks,
    defenceStrings: [
      `Dodge: Roll ${dodgeDice} dice. If successes match or exceed the attacker's successes, take 0 damage. Otherwise take full damage.`,
      `Physical Protection: Roll ${armorSkill} dice, block ${physicalBlockPerSuccess} wounds per success.`,
      `Mental Protection: Roll ${willpower} dice, block ${mentalBlockPerSuccess} wounds per success.`,
    ],
    protectionSources,
    itemOutputSections: itemOutputSections(equippedEntries),
    itemModifiers,
    notes: [
      "Health pools use the Summoning Circle resilience formula with the non-legendary Soldier tier branch because Character Builder has no separate character-tier field yet.",
      "Character Traits are not applied as stat modifiers until trait mechanics are explicitly defined.",
    ],
  };
}

export function hasAssignedAttributes(data: CharacterBuilderData) {
  return CHARACTER_ATTRIBUTES.every(
    (attribute) => typeof data.attributes[attribute] === "number",
  );
}
