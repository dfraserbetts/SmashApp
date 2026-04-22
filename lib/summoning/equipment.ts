import type { AttributePlacement, MonsterNaturalAttackConfig } from "@/lib/summoning/types";

export type EquipmentItemType = "WEAPON" | "SHIELD" | "ARMOR" | "ITEM" | "CONSUMABLE";
export type EquipmentItemSize = "SMALL" | "ONE_HANDED" | "TWO_HANDED";
export type EquipmentArmorLocation = "HEAD" | "SHOULDERS" | "TORSO" | "LEGS" | "FEET";
export type EquipmentItemLocation = "HEAD" | "NECK" | "ARMS" | "BELT";

export type SummoningEquipmentItem = {
  id: string;
  name: string;
  type: EquipmentItemType;
  size: EquipmentItemSize | null;
  armorLocation: EquipmentArmorLocation | null;
  itemLocation?: EquipmentItemLocation | null;
  ppv: number | null;
  mpv: number | null;
  globalAttributeModifiers?: Array<{ attribute?: string; amount?: number }> | null;
  attributeLines?: Array<{ text: string; placement: AttributePlacement }> | null;
  itemAttributeLines?: Array<{ text: string; placement: AttributePlacement }> | null;
  customItemAttributeLines?: Array<{ text: string; placement: AttributePlacement }> | null;
  allAttributeLines?: Array<{ text: string; placement: AttributePlacement }> | null;
  melee?: MonsterNaturalAttackConfig["melee"];
  ranged?: MonsterNaturalAttackConfig["ranged"];
  aoe?: MonsterNaturalAttackConfig["aoe"];
};

export type EquipmentSlotKey =
  | "mainHandItemId"
  | "offHandItemId"
  | "smallItemId"
  | "headArmorItemId"
  | "shoulderArmorItemId"
  | "torsoArmorItemId"
  | "legsArmorItemId"
  | "feetArmorItemId"
  | "headItemId"
  | "neckItemId"
  | "armsItemId"
  | "beltItemId";

export type MonsterModifierField =
  | "attackModifier"
  | "guardModifier"
  | "fortitudeModifier"
  | "intellectModifier"
  | "synergyModifier"
  | "braveryModifier"
  | "weaponSkillModifier"
  | "armorSkillModifier"
  | "willpowerModifier"
  | "dodgeModifier";

const MODIFIER_ALIASES: Record<string, MonsterModifierField> = {
  attack: "attackModifier",
  guard: "guardModifier",
  defence: "guardModifier",
  defense: "guardModifier",
  fortitude: "fortitudeModifier",
  intellect: "intellectModifier",
  synergy: "synergyModifier",
  support: "synergyModifier",
  bravery: "braveryModifier",
  "weapon skill": "weaponSkillModifier",
  weaponskill: "weaponSkillModifier",
  "armor skill": "armorSkillModifier",
  "armour skill": "armorSkillModifier",
  armorskill: "armorSkillModifier",
  armourskill: "armorSkillModifier",
  willpower: "willpowerModifier",
  dodge: "dodgeModifier",
};

export const MONSTER_MODIFIER_FIELDS: MonsterModifierField[] = [
  "attackModifier",
  "guardModifier",
  "fortitudeModifier",
  "intellectModifier",
  "synergyModifier",
  "braveryModifier",
  "weaponSkillModifier",
  "armorSkillModifier",
  "willpowerModifier",
  "dodgeModifier",
];

const EQUIPMENT_LINE_PLACEMENTS = ["ATTACK", "GUARD", "TRAITS", "GENERAL"] as const;

export type EquipmentLinePlacementKey = (typeof EQUIPMENT_LINE_PLACEMENTS)[number];

function toEquipmentLinePlacementKey(value: unknown): EquipmentLinePlacementKey | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "DEFENCE") return "GUARD";
  return EQUIPMENT_LINE_PLACEMENTS.find((placement) => placement === normalized) ?? null;
}

function getMergedItemAttributeLines(
  item: SummoningEquipmentItem,
): Array<{ text: string; placement: AttributePlacement }> {
  if (Array.isArray(item.allAttributeLines) && item.allAttributeLines.length > 0) {
    return item.allAttributeLines;
  }

  return [
    ...(Array.isArray(item.attributeLines) ? item.attributeLines : []),
    ...(Array.isArray(item.itemAttributeLines) ? item.itemAttributeLines : []),
    ...(Array.isArray(item.customItemAttributeLines) ? item.customItemAttributeLines : []),
  ];
}

export function getItemLinePlacementCounts(
  items: Array<SummoningEquipmentItem | null | undefined>,
): Record<EquipmentLinePlacementKey, number> {
  const counts: Record<EquipmentLinePlacementKey, number> = {
    ATTACK: 0,
    GUARD: 0,
    TRAITS: 0,
    GENERAL: 0,
  };

  for (const item of items) {
    if (!item) continue;

    const seenLineKeys = new Set<string>();
    for (const line of getMergedItemAttributeLines(item)) {
      const placement = toEquipmentLinePlacementKey(line.placement);
      const normalizedText = String(line.text ?? "").trim().toLowerCase();
      if (!placement || !normalizedText) continue;

      const dedupeKey = `${placement}:${normalizedText}`;
      if (seenLineKeys.has(dedupeKey)) continue;
      seenLineKeys.add(dedupeKey);
      counts[placement] += 1;
    }
  }

  return counts;
}

export function mapModifierKeyToMonsterField(attribute: string): MonsterModifierField | null {
  const key = attribute.trim().toLowerCase();
  return MODIFIER_ALIASES[key] ?? null;
}

export function getHighestItemModifiers(
  items: Array<SummoningEquipmentItem | null | undefined>,
): Record<MonsterModifierField, number> {
  const highest = new Map<MonsterModifierField, number>();
  for (const item of items) {
    if (!item || !Array.isArray(item.globalAttributeModifiers)) continue;
    for (const rawModifier of item.globalAttributeModifiers) {
      const attribute = String(rawModifier?.attribute ?? "").trim();
      if (!attribute) continue;
      const amount = Number(rawModifier?.amount ?? 0);
      if (!Number.isFinite(amount)) continue;
      const field = mapModifierKeyToMonsterField(attribute);
      if (!field) continue;
      const current = highest.get(field);
      if (current === undefined || amount > current) {
        highest.set(field, amount);
      }
    }
  }

  const output = Object.fromEntries(
    MONSTER_MODIFIER_FIELDS.map((field) => [field, 0]),
  ) as Record<MonsterModifierField, number>;

  for (const [field, value] of highest.entries()) {
    output[field] = value;
  }
  return output;
}

export function getProtectionTotalsFromItems(
  items: Array<SummoningEquipmentItem | null | undefined>,
): { physicalProtection: number; mentalProtection: number } {
  let physicalProtection = 0;
  let mentalProtection = 0;
  for (const item of items) {
    if (!item) continue;
    if (item.type !== "ARMOR" && item.type !== "SHIELD") continue;
    physicalProtection += Number(item.ppv ?? 0);
    mentalProtection += Number(item.mpv ?? 0);
  }
  return { physicalProtection, mentalProtection };
}

export function isTwoHanded(item: SummoningEquipmentItem | null | undefined): boolean {
  return !!item && item.size === "TWO_HANDED";
}

export function isValidHandItemForSlot(
  slot: "mainHandItemId" | "offHandItemId" | "smallItemId",
  item: SummoningEquipmentItem | null | undefined,
): boolean {
  if (!item) return false;
  if (item.type !== "WEAPON" && item.type !== "SHIELD") return false;
  if (!item.size) return false;

  if (slot === "mainHandItemId") {
    return item.size === "ONE_HANDED" || item.size === "TWO_HANDED";
  }
  if (slot === "offHandItemId") {
    return item.size === "ONE_HANDED";
  }
  return item.size === "SMALL";
}

export function isValidArmorItemForSlot(
  slot: "headArmorItemId" | "shoulderArmorItemId" | "torsoArmorItemId" | "legsArmorItemId" | "feetArmorItemId",
  item: SummoningEquipmentItem | null | undefined,
): boolean {
  if (!item) return false;
  // SC_SEPARATE_ARMOR_SLOT_VALIDATION_V2
  if (item.type !== "ARMOR") return false;
  if (slot === "headArmorItemId") return item.armorLocation === "HEAD";
  if (slot === "shoulderArmorItemId") return item.armorLocation === "SHOULDERS";
  if (slot === "torsoArmorItemId") return item.armorLocation === "TORSO";
  if (slot === "legsArmorItemId") return item.armorLocation === "LEGS";
  return item.armorLocation === "FEET";
}

export function isValidItemAccessorySlot(
  slot: "headItemId" | "neckItemId" | "armsItemId" | "beltItemId",
  item: SummoningEquipmentItem | null | undefined,
): boolean {
  if (!item) return false;
  // SC_SEPARATE_ITEM_SLOT_VALIDATION_V2
  if (item.type !== "ITEM") return false;
  if (slot === "headItemId") return item.itemLocation === "HEAD";
  if (slot === "neckItemId") return item.itemLocation === "NECK";
  if (slot === "armsItemId") return item.itemLocation === "ARMS";
  return item.itemLocation === "BELT";
}

