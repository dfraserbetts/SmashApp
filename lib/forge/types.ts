export type ItemType =
  | 'WEAPON'
  | 'ARMOR'
  | 'SHIELD'
  | 'ITEM'
  | 'CONSUMABLE';

export type ItemRarity =
  | 'COMMON'
  | 'UNCOMMON'
  | 'RARE'
  | 'LEGENDARY'
  | 'MYTHIC';

export type WeaponSize = 'SMALL' | 'ONE_HANDED' | 'TWO_HANDED';
export type RangeCategory = 'MELEE' | 'RANGED' | 'AOE';
export type AoEShape = 'SPHERE' | 'CONE' | 'LINE';

export type ArmorLocation = 'HEAD' | 'SHOULDERS' | 'TORSO' | 'LEGS' | 'FEET';
export type ItemLocation =
  | 'HEAD'
  | 'NECK'
  | 'ARMS'
  | 'BELT'
  | 'HANDS'
  | 'FINGER'
  | 'CHEST'
  | 'BACK'
  | 'FEET'
  | 'OTHER';

export type VRPEffectKind =
  | 'VULNERABILITY'
  | 'RESISTANCE'
  | 'PROTECTION';
