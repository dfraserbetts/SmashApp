import { buildDescriptorResult } from "@/lib/descriptors/descriptorEngine";
import { renderForgeResult } from "@/lib/descriptors/renderers/forgeRenderer";
import type { DescriptorInput } from "@/lib/descriptors/types";

type NamedRelation<T extends string> = Record<T, { name: string }>;

type DamageTypeRelation = {
  damageType: {
    name: string;
    attackMode: string;
  };
};

type WeaponAttributeRelation = {
  strengthSource: "MELEE" | "RANGED" | "AOE" | null;
  rangeSource: "MELEE" | "RANGED" | "AOE" | null;
  weaponAttribute: {
    name: string;
    descriptorTemplate: string | null;
  };
};

type ArmorAttributeRelation = {
  armorAttribute: {
    name: string;
    descriptorTemplate: string | null;
  };
};

type ShieldAttributeRelation = {
  shieldAttribute: {
    name: string;
    descriptorTemplate: string | null;
  };
};

type VrpEntryRelation = {
  effectKind: "VULNERABILITY" | "RESISTANCE" | "PROTECTION";
  magnitude: number;
  damageType: {
    name: string;
  };
};

export type CharacterBuilderEquipmentItemSource = {
  id: string;
  name: string | null;
  rarity: string | null;
  level: number | null;
  type: string | null;
  size: string | null;
  armorLocation: string | null;
  itemLocation: string | null;
  generalDescription: string | null;
  globalAttributeModifiers: unknown;
  meleeTargets: number | null;
  rangedTargets: number | null;
  rangedDistanceFeet: number | null;
  aoeCenterRangeFeet: number | null;
  aoeCount: number | null;
  aoeShape: "SPHERE" | "CONE" | "LINE" | null;
  aoeSphereRadiusFeet: number | null;
  aoeConeLengthFeet: number | null;
  aoeLineWidthFeet: number | null;
  aoeLineLengthFeet: number | null;
  physicalStrength: number | null;
  mentalStrength: number | null;
  meleePhysicalStrength: number | null;
  meleeMentalStrength: number | null;
  rangedPhysicalStrength: number | null;
  rangedMentalStrength: number | null;
  aoePhysicalStrength: number | null;
  aoeMentalStrength: number | null;
  ppv: number | null;
  mpv: number | null;
  auraPhysical: number | null;
  auraMental: number | null;
  customWeaponAttributes: string | null;
  customArmorAttributes: string | null;
  customShieldAttributes: string | null;
  customItemAttributes: string | null;
  shieldHasAttack: boolean | null;
  meleeDamageTypes: DamageTypeRelation[];
  rangedDamageTypes: DamageTypeRelation[];
  aoeDamageTypes: DamageTypeRelation[];
  attackEffectsMelee: NamedRelation<"attackEffect">[];
  attackEffectsRanged: NamedRelation<"attackEffect">[];
  attackEffectsAoE: NamedRelation<"attackEffect">[];
  weaponAttributes: WeaponAttributeRelation[];
  armorAttributes: ArmorAttributeRelation[];
  shieldAttributes: ShieldAttributeRelation[];
  defEffects: NamedRelation<"defEffect">[];
  wardingOptions: NamedRelation<"wardingOption">[];
  sanctifiedOptions: NamedRelation<"sanctifiedOption">[];
  vrpEntries: VrpEntryRelation[];
};

export type CharacterBuilderEquipmentSummary = {
  details: string;
  descriptorSections: Array<{ title: string; lines: string[] }>;
  descriptorWarnings: string[];
};

function numberOrUndefined(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readGlobalAttributeModifiers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const attribute = typeof record.attribute === "string" ? record.attribute.trim() : "";
      const amount = typeof record.amount === "number" ? record.amount : Number(record.amount);
      if (!attribute || !Number.isFinite(amount)) return null;
      return { attribute, amount };
    })
    .filter((entry): entry is { attribute: string; amount: number } => Boolean(entry));
}

function damageTypeEntries(rows: DamageTypeRelation[]) {
  return rows
    .map((row) => ({
      name: row.damageType.name,
      mode: row.damageType.attackMode === "MENTAL" ? "MENTAL" : "PHYSICAL",
    }))
    .filter((row) => row.name.trim().length > 0) as unknown as string[];
}

function names<T extends string>(rows: Array<NamedRelation<T>>, key: T) {
  return rows.map((row) => row[key].name).filter(Boolean);
}

function buildDescriptorInput(item: CharacterBuilderEquipmentItemSource): DescriptorInput {
  const itemType = item.type ?? "ITEM";
  const meleePhysicalStrength = item.meleePhysicalStrength ?? item.physicalStrength;
  const meleeMentalStrength = item.meleeMentalStrength ?? item.mentalStrength;
  const rangedPhysicalStrength = item.rangedPhysicalStrength ?? item.physicalStrength;
  const rangedMentalStrength = item.rangedMentalStrength ?? item.mentalStrength;
  const aoePhysicalStrength = item.aoePhysicalStrength ?? item.physicalStrength;
  const aoeMentalStrength = item.aoeMentalStrength ?? item.mentalStrength;

  const input = {
    itemType: itemType as DescriptorInput["itemType"],
    itemName: item.name ?? "",
    globalAttributeModifiers: readGlobalAttributeModifiers(item.globalAttributeModifiers),
    weaponAttributes: item.weaponAttributes.map((row) => ({
      name: row.weaponAttribute.name,
      descriptorTemplate: row.weaponAttribute.descriptorTemplate,
      strengthSource: row.strengthSource,
      rangeSource: row.rangeSource,
    })),
    armorAttributes: item.armorAttributes.map((row) => ({
      name: row.armorAttribute.name,
      descriptorTemplate: row.armorAttribute.descriptorTemplate,
    })),
    shieldAttributes: item.shieldAttributes.map((row) => ({
      name: row.shieldAttribute.name,
      descriptorTemplate: row.shieldAttribute.descriptorTemplate,
    })),
    ppv: numberOrUndefined(item.ppv),
    mpv: numberOrUndefined(item.mpv),
    auraPhysical: item.auraPhysical,
    auraMental: item.auraMental,
    defEffects: names(item.defEffects, "defEffect"),
    wardingOptions: names(item.wardingOptions, "wardingOption"),
    sanctifiedOptions: names(item.sanctifiedOptions, "sanctifiedOption"),
    vrpEntries: item.vrpEntries.map((entry) => ({
      effectKind: entry.effectKind,
      magnitude: entry.magnitude,
      damageType: entry.damageType.name,
    })),
    customArmorAttributes:
      item.customArmorAttributes ?? item.customShieldAttributes ?? item.customItemAttributes ?? undefined,
    melee: {
      enabled:
        Boolean(meleePhysicalStrength && meleePhysicalStrength > 0) ||
        Boolean(meleeMentalStrength && meleeMentalStrength > 0),
      damageTypes: damageTypeEntries(item.meleeDamageTypes),
      targets: item.meleeTargets ?? 1,
      physicalStrength: numberOrUndefined(meleePhysicalStrength),
      mentalStrength: numberOrUndefined(meleeMentalStrength),
    },
    ranged: {
      enabled:
        Boolean(rangedPhysicalStrength && rangedPhysicalStrength > 0) ||
        Boolean(rangedMentalStrength && rangedMentalStrength > 0),
      damageTypes: damageTypeEntries(item.rangedDamageTypes),
      targets: item.rangedTargets ?? 1,
      distance: item.rangedDistanceFeet ?? 0,
      distanceFeet: item.rangedDistanceFeet ?? 0,
      physicalStrength: numberOrUndefined(rangedPhysicalStrength),
      mentalStrength: numberOrUndefined(rangedMentalStrength),
    },
    aoe: {
      enabled:
        Boolean(aoePhysicalStrength && aoePhysicalStrength > 0) ||
        Boolean(aoeMentalStrength && aoeMentalStrength > 0),
      damageTypes: damageTypeEntries(item.aoeDamageTypes),
      count: item.aoeCount ?? 1,
      centerRange: item.aoeCenterRangeFeet ?? 0,
      shape: item.aoeShape ?? "SPHERE",
      geometry: {
        radius: item.aoeSphereRadiusFeet ?? undefined,
        length: item.aoeConeLengthFeet ?? item.aoeLineLengthFeet ?? undefined,
        width: item.aoeLineWidthFeet ?? undefined,
      },
      physicalStrength: numberOrUndefined(aoePhysicalStrength),
      mentalStrength: numberOrUndefined(aoeMentalStrength),
    },
  };
  return input as unknown as DescriptorInput;
}

export function summarizeEquipmentItem(item: CharacterBuilderEquipmentItemSource): CharacterBuilderEquipmentSummary {
  const detailParts = [
    item.type,
    item.rarity,
    item.level !== null && item.level !== undefined ? `Level ${item.level}` : null,
    item.size ?? item.armorLocation ?? item.itemLocation,
  ].filter(Boolean);
  const descriptor = buildDescriptorResult(buildDescriptorInput(item));
  return {
    details: detailParts.length > 0 ? detailParts.join(" - ") : "No item details",
    descriptorSections: renderForgeResult(descriptor),
    descriptorWarnings: descriptor.meta?.warnings ?? [],
  };
}
