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
  | "defenceModifier"
  | "fortitudeModifier"
  | "intellectModifier"
  | "supportModifier"
  | "braveryModifier"
  | "weaponSkillModifier"
  | "armorSkillModifier";

const MODIFIER_ALIASES: Record<string, MonsterModifierField> = {
  attack: "attackModifier",
  defence: "defenceModifier",
  defense: "defenceModifier",
  fortitude: "fortitudeModifier",
  intellect: "intellectModifier",
  support: "supportModifier",
  bravery: "braveryModifier",
  "weapon skill": "weaponSkillModifier",
  weaponskill: "weaponSkillModifier",
  "armor skill": "armorSkillModifier",
  "armour skill": "armorSkillModifier",
  armorskill: "armorSkillModifier",
  armourskill: "armorSkillModifier",
};

export const MONSTER_MODIFIER_FIELDS: MonsterModifierField[] = [
  "attackModifier",
  "defenceModifier",
  "fortitudeModifier",
  "intellectModifier",
  "supportModifier",
  "braveryModifier",
  "weaponSkillModifier",
  "armorSkillModifier",
];

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
