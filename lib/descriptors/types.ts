// lib/descriptors/types.ts
import type { ItemType } from "@/lib/forge/types";

export type AttributeModToken = {
  attributeName: string;
  magnitude: number; // positive integer (1–5 today)
};

export type ModifiersLine = {
  kind: "GLOBAL_ATTRIBUTE_MODIFIERS";
  itemType: ItemType;
  mods: AttributeModToken[]; // already deduped by attributeName
};

export type WeaponAttributeLine = {
  kind: "WEAPON_ATTRIBUTE";
  itemType: ItemType;
  text: string; // fully rendered line, including “Name: …”
};

export type TextLine = {
  kind: "TEXT";
  text: string;
};

export type DescriptorSectionId =
  | "MODIFIERS"
  | "WEAPON_ATTRIBUTES"
  | "ATTACK_ACTIONS"
  // Armor (Step E)
  | "DEFENCE"
  | "GREATER_DEFENCE_EFFECTS"
  | "SHIELD_ATTRIBUTES"
  | "ARMOR_ATTRIBUTES"
  | "VRP"
  | "CUSTOM_ARMOR_ATTRIBUTES";

export type DescriptorSection = {
  id: DescriptorSectionId;
  title: string;
  order: number;
  lines: DescriptorLine[];
};

export type DescriptorResult = {
  sections: DescriptorSection[];
  meta?: {
    warnings?: string[];
  };
};

export type DescriptorInput = {
  itemType: ItemType;
  globalAttributeModifiers?: Array<{
    attribute: string;
    amount: number;
  }>;

  // Weapon Attributes (render-only; templates authored via Admin UI)
  weaponAttributes?: Array<{
    name: string; // e.g. "Reload 5" or "Parry"
    descriptorTemplate?: string | null; // template text saved in DB

    // Optional explicit value for [AttributeValue] tokens (preferred over parsing from name)
    attributeValue?: number | string | null;

    // Parameterised attribute context
    strengthSource?: "MELEE" | "RANGED" | "AOE" | null;

    // New: chosen range token source
    rangeSource?: "MELEE" | "RANGED" | "AOE" | null;
  }>;

  // Armor core (Step E)
  ppv?: number;
  mpv?: number;
  auraPhysical?: number | null;
  auraMental?: number | null;

  // Greater Defence Effects (names; deterministic rendering)
  defEffects?: string[];

  // Armor Attributes (templates authored via Admin UI)
  armorAttributes?: Array<{
    name: string;
    descriptorTemplate?: string | null;
    // Optional explicit value for [AttributeValue] tokens (preferred over parsing from name)
    attributeValue?: number | string | null;
  }>;

  // Shield Attributes (templates authored via Admin UI)
  shieldAttributes?: Array<{
    name: string;
    descriptorTemplate?: string | null;
    // Optional explicit value for [AttributeValue] tokens (preferred over parsing from name)
    attributeValue?: number | string | null;
  }>;

  // VRP (deterministic)
  vrpEntries?: Array<{
    effectKind: "VULNERABILITY" | "RESISTANCE" | "PROTECTION";
    magnitude: number;
    damageType: string;
  }>;

  // Custom Armor Attributes (free text)
  customArmorAttributes?: string;

  // Attack inputs (DT-A6 hardening)


  // Attack inputs (DT-A6 hardening)
  melee?: {
    enabled: boolean;
    damageTypes: string[];
    targets?: number;
    physicalStrength?: number;
    mentalStrength?: number;
  };

  ranged?: {
    enabled: boolean;
    damageTypes: string[];
    targets?: number;
    distance?: number;
    physicalStrength?: number;
    mentalStrength?: number;
  };

  aoe?: {
    enabled: boolean;
    damageTypes: string[];
    count?: number;
    centerRange?: number;
    shape?: "SPHERE" | "CONE" | "LINE";
    geometry?: Record<string, number>;
    physicalStrength?: number;
    mentalStrength?: number;
  };
};

export type MeleeRangeSpec = {
  kind: "MELEE";
  targets: number;
};

export type RangedRangeSpec = {
  kind: "RANGED";
  targets: number;
  distance: number;
};

export type AoERangeSpec = {
  kind: "AOE";
  count: number;
  centerRange: number;
  shape: "SPHERE" | "CONE" | "LINE";
  geometry: Record<string, number>;
};

export type AttackRangeSpec =
  | MeleeRangeSpec
  | RangedRangeSpec
  | AoERangeSpec;

export type DamageEntry = {
  amount: number;
  mode: "PHYSICAL" | "MENTAL";
  damageType: string;
};

export type AttackActionLine = {
  kind: "ATTACK_ACTION";
  itemType: ItemType;

  // Patch A: multi-range support (deterministic order handled by engine)
  ranges: AttackRangeSpec[];

  damage: {
    entries: DamageEntry[];
  };
};

// (Removed) WeaponAttributeLine structured variant.
// Weapon Attributes are rendered in the engine into a single text line.

export type DescriptorLine =
  | ModifiersLine
  | WeaponAttributeLine
  | AttackActionLine
  | TextLine;