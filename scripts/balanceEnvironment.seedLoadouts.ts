import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma } from "@prisma/client";

import {
  normalizeBuilderData,
  sanitizeBuilderEquipment,
  type EquipmentSlotKey,
  type EquippedSlotsState,
} from "../lib/characterBuilder/core";
import { buildCharacterDerivedCombatStats } from "../lib/characterBuilder/derivedStats";
import {
  adaptCampaignCharacterToCombatActor,
  adaptMonsterToCombatLabActor,
} from "../lib/combat-lab/liveAdapters";
import { DEFAULT_COMBAT_TUNING_VALUES } from "../lib/config/combatTuningShared";
import { isSelectableDamageTypeName } from "../lib/damageTypes/selectable";
import type { MonsterNaturalAttackConfig } from "../lib/summoning/types";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;

const CHARACTER_NAMES = [
  "BALANCE_Arcane Sage",
  "BALANCE_Ranger Commander",
  "BALANCE_Stoneguard",
  "BALANCE_Hawkshot Archer",
] as const;

const MONSTER_NAMES = [
  "BALANCE_Physical Striker",
  "BALANCE_Mental Wailer",
  "BALANCE_Control Hexer",
  "BALANCE_Dodge Pressure Skirmisher",
  "BALANCE_Durable Soldier",
] as const;

const LEGAL_DAMAGE_TYPES: ReadonlyMap<string, WoundMode> = new Map([
  ["Blunt", "PHYSICAL"],
  ["Fire", "PHYSICAL"],
  ["Force", "PHYSICAL"],
  ["Ice", "PHYSICAL"],
  ["Lightning", "PHYSICAL"],
  ["Necrotic", "PHYSICAL"],
  ["Piercing", "PHYSICAL"],
  ["Poison", "PHYSICAL"],
  ["Slashing", "PHYSICAL"],
  ["Fear", "MENTAL"],
  ["Holy", "MENTAL"],
  ["Psychic", "MENTAL"],
] as const);

type ItemType = "WEAPON" | "ARMOR" | "SHIELD" | "ITEM";
type ItemRarity = "COMMON" | "UNCOMMON" | "RARE" | "LEGENDARY" | "MYTHIC";
type WeaponSize = "SMALL" | "ONE_HANDED" | "TWO_HANDED";
type ArmorLocation = "HEAD" | "SHOULDERS" | "TORSO" | "LEGS" | "FEET";
type ItemLocation = "HEAD" | "NECK" | "ARMS" | "BELT";
type RangeCategory = "MELEE" | "RANGED" | "AOE";
type WoundMode = "PHYSICAL" | "MENTAL";

type DamageTypeRef = {
  name: string;
  mode: WoundMode;
};

type ItemSpec = {
  id: string;
  name: string;
  rarity: ItemRarity;
  level: number;
  description: string;
  type: ItemType;
  size?: WeaponSize | null;
  armorLocation?: ArmorLocation | null;
  itemLocation?: ItemLocation | null;
  ppv?: number | null;
  mpv?: number | null;
  rangeCategories?: RangeCategory[];
  meleeTargets?: number | null;
  rangedTargets?: number | null;
  rangedDistanceFeet?: number | null;
  meleePhysicalStrength?: number | null;
  meleeMentalStrength?: number | null;
  rangedPhysicalStrength?: number | null;
  rangedMentalStrength?: number | null;
  meleeDamageTypes?: string[];
  rangedDamageTypes?: string[];
  globalAttributeModifiers?: Array<{ attribute: string; amount: number }>;
};

type CharacterLoadout = {
  characterName: (typeof CHARACTER_NAMES)[number];
  slots: Partial<Record<EquipmentSlotKey, string>>;
};

type MonsterAttackSpec = {
  monsterName: (typeof MONSTER_NAMES)[number];
  attackName: string;
  attackConfig: MonsterNaturalAttackConfig;
};

const ITEM_SPECS: ItemSpec[] = [
  {
    id: "balance-sage-focus",
    name: "BALANCE_Sage Focus",
    rarity: "COMMON",
    level: LEVEL,
    description: "Calibration ranged mental focus for BALANCE_Arcane Sage.",
    type: "WEAPON",
    size: "ONE_HANDED",
    rangeCategories: ["RANGED"],
    rangedTargets: 1,
    rangedDistanceFeet: 30,
    rangedMentalStrength: 2,
    rangedDamageTypes: ["Psychic"],
  },
  {
    id: "balance-arcane-robe",
    name: "BALANCE_Arcane Robe",
    rarity: "COMMON",
    level: LEVEL,
    description: "Calibration torso armor with light physical and mental protection.",
    type: "ARMOR",
    armorLocation: "TORSO",
    ppv: 1,
    mpv: 1,
  },
  {
    id: "balance-commander-bow",
    name: "BALANCE_Commander Bow",
    rarity: "COMMON",
    level: LEVEL,
    description: "Calibration ranged physical weapon for BALANCE_Ranger Commander.",
    type: "WEAPON",
    size: "TWO_HANDED",
    rangeCategories: ["RANGED"],
    rangedTargets: 1,
    rangedDistanceFeet: 60,
    rangedPhysicalStrength: 2,
    rangedDamageTypes: ["Piercing"],
  },
  {
    id: "balance-ranger-leathers",
    name: "BALANCE_Ranger Leathers",
    rarity: "COMMON",
    level: LEVEL,
    description: "Calibration torso armor with modest physical protection.",
    type: "ARMOR",
    armorLocation: "TORSO",
    ppv: 2,
    mpv: 0,
  },
  {
    id: "balance-stoneguard-hammer",
    name: "BALANCE_Stoneguard Hammer",
    rarity: "COMMON",
    level: LEVEL,
    description: "Calibration one-handed melee physical weapon for BALANCE_Stoneguard.",
    type: "WEAPON",
    size: "ONE_HANDED",
    rangeCategories: ["MELEE"],
    meleeTargets: 1,
    meleePhysicalStrength: 2,
    meleeDamageTypes: ["Blunt"],
  },
  {
    id: "balance-stoneguard-shield",
    name: "BALANCE_Stoneguard Shield",
    rarity: "COMMON",
    level: LEVEL,
    description: "Calibration defensive shield for BALANCE_Stoneguard.",
    type: "SHIELD",
    size: "ONE_HANDED",
    ppv: 2,
    mpv: 0,
  },
  {
    id: "balance-stoneguard-plate",
    name: "BALANCE_Stoneguard Plate",
    rarity: "COMMON",
    level: LEVEL,
    description: "Calibration heavier torso armor for BALANCE_Stoneguard.",
    type: "ARMOR",
    armorLocation: "TORSO",
    ppv: 4,
    mpv: 0,
  },
  {
    id: "balance-hawkshot-longbow",
    name: "BALANCE_Hawkshot Longbow",
    rarity: "COMMON",
    level: LEVEL,
    description: "Calibration ranged physical weapon for BALANCE_Hawkshot Archer.",
    type: "WEAPON",
    size: "TWO_HANDED",
    rangeCategories: ["RANGED"],
    rangedTargets: 1,
    rangedDistanceFeet: 60,
    rangedPhysicalStrength: 3,
    rangedDamageTypes: ["Piercing"],
  },
  {
    id: "balance-light-leathers",
    name: "BALANCE_Light Leathers",
    rarity: "COMMON",
    level: LEVEL,
    description: "Calibration light torso armor for BALANCE_Hawkshot Archer.",
    type: "ARMOR",
    armorLocation: "TORSO",
    ppv: 1,
    mpv: 0,
  },
];

const CHARACTER_LOADOUTS: CharacterLoadout[] = [
  {
    characterName: "BALANCE_Arcane Sage",
    slots: {
      mainHand: "balance-sage-focus",
      torsoArmor: "balance-arcane-robe",
    },
  },
  {
    characterName: "BALANCE_Ranger Commander",
    slots: {
      mainHand: "balance-commander-bow",
      torsoArmor: "balance-ranger-leathers",
    },
  },
  {
    characterName: "BALANCE_Stoneguard",
    slots: {
      mainHand: "balance-stoneguard-hammer",
      offHand: "balance-stoneguard-shield",
      torsoArmor: "balance-stoneguard-plate",
    },
  },
  {
    characterName: "BALANCE_Hawkshot Archer",
    slots: {
      mainHand: "balance-hawkshot-longbow",
      torsoArmor: "balance-light-leathers",
    },
  },
];

const MONSTER_ATTACKS: MonsterAttackSpec[] = [
  {
    monsterName: "BALANCE_Physical Striker",
    attackName: "BALANCE_Crushing Claws",
    attackConfig: meleeConfig({ physicalStrength: 2, damageType: { name: "Slashing", mode: "PHYSICAL" } }),
  },
  {
    monsterName: "BALANCE_Mental Wailer",
    attackName: "BALANCE_Psychic Cry",
    attackConfig: rangedConfig({ mentalStrength: 2, damageType: { name: "Psychic", mode: "MENTAL" } }),
  },
  {
    monsterName: "BALANCE_Control Hexer",
    attackName: "BALANCE_Hex Spark",
    attackConfig: rangedConfig({ mentalStrength: 1, damageType: { name: "Fear", mode: "MENTAL" } }),
  },
  {
    monsterName: "BALANCE_Dodge Pressure Skirmisher",
    attackName: "BALANCE_Skirmish Cut",
    attackConfig: meleeConfig({ physicalStrength: 1, damageType: { name: "Slashing", mode: "PHYSICAL" } }),
  },
  {
    monsterName: "BALANCE_Durable Soldier",
    attackName: "BALANCE_Shielding Bash",
    attackConfig: meleeConfig({ physicalStrength: 2, damageType: { name: "Blunt", mode: "PHYSICAL" } }),
  },
];

const ITEM_TEMPLATE_INCLUDE = {
  rangeCategories: { select: { rangeCategory: true } },
  meleeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  rangedDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  aoeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  attackEffectsMelee: { select: { attackEffect: { select: { name: true } } } },
  attackEffectsRanged: { select: { attackEffect: { select: { name: true } } } },
  attackEffectsAoE: { select: { attackEffect: { select: { name: true } } } },
  vrpEntries: { select: { effectKind: true, magnitude: true, damageType: { select: { name: true } } } },
};

const CHARACTER_INCLUDE = {
  backpackItems: {
    orderBy: { createdAt: "asc" as const },
    include: {
      partyInventoryItem: {
        include: {
          itemTemplate: {
            include: ITEM_TEMPLATE_INCLUDE,
          },
        },
      },
    },
  },
};

const POWER_INCLUDE = {
  rangeCategories: { orderBy: { rangeCategory: "asc" as const } },
  primaryDefenceGate: true,
  effectPackets: {
    orderBy: { packetIndex: "asc" as const },
    include: { localTargetingOverride: true },
  },
};

const MONSTER_INCLUDE = {
  traits: {
    orderBy: { sortOrder: "asc" as const },
    include: { trait: { select: { name: true, effectText: true } } },
  },
  attacks: { orderBy: { sortOrder: "asc" as const } },
  naturalAttack: true,
  powers: {
    orderBy: { sortOrder: "asc" as const },
    include: POWER_INCLUDE,
  },
};

type PrismaClient = typeof import("../prisma/client").prisma;

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = join(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

function meleeConfig(params: { physicalStrength: number; damageType: DamageTypeRef }): MonsterNaturalAttackConfig {
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: params.physicalStrength,
      mentalStrength: 0,
      damageTypes: [params.damageType],
      attackEffects: [],
    },
  };
}

function rangedConfig(params: { mentalStrength: number; damageType: DamageTypeRef }): MonsterNaturalAttackConfig {
  return {
    ranged: {
      enabled: true,
      targets: 1,
      distance: 30,
      physicalStrength: 0,
      mentalStrength: params.mentalStrength,
      damageTypes: [params.damageType],
      attackEffects: [],
    },
  };
}

function assertNoForbiddenTerm(value: string, label: string) {
  if (new RegExp("\\bwar(?:d|ds|ding)\\b", "i").test(value)) {
    throw new Error(`${label} contains forbidden equipment terminology: ${value}`);
  }
}

function assertCanonicalDamageType(name: string, mode: WoundMode, selectable: Map<string, WoundMode>) {
  const legalMode = LEGAL_DAMAGE_TYPES.get(name);
  if (!legalMode) throw new Error(`Illegal damage type "${name}".`);
  if (legalMode !== mode) throw new Error(`Damage type "${name}" is ${legalMode}, not ${mode}.`);
  const selectableMode = selectable.get(name);
  if (!selectableMode) throw new Error(`Damage type "${name}" is not selectable in current data.`);
  if (selectableMode !== mode) throw new Error(`Damage type "${name}" selectable mode is ${selectableMode}, not ${mode}.`);
}

function allItemDamageTypes(spec: ItemSpec): DamageTypeRef[] {
  return [
    ...(spec.meleeDamageTypes ?? []).map((name) => ({ name, mode: "PHYSICAL" as const })),
    ...(spec.rangedDamageTypes ?? []).map((name) => ({
      name,
      mode: name === "Psychic" || name === "Fear" || name === "Holy" ? "MENTAL" as const : "PHYSICAL" as const,
    })),
  ];
}

function enabledNaturalProfiles(config: MonsterNaturalAttackConfig) {
  return [
    config.melee,
    config.ranged,
    config.aoe,
  ].filter((profile): profile is NonNullable<typeof profile> => Boolean(profile?.enabled));
}

function validateSpecs(selectable: Map<string, WoundMode>) {
  for (const spec of ITEM_SPECS) {
    assertNoForbiddenTerm(spec.name, spec.id);
    assertNoForbiddenTerm(spec.description, spec.id);
    for (const damageType of allItemDamageTypes(spec)) {
      assertCanonicalDamageType(damageType.name, damageType.mode, selectable);
    }
  }

  for (const spec of MONSTER_ATTACKS) {
    assertNoForbiddenTerm(spec.attackName, spec.monsterName);
    for (const profile of enabledNaturalProfiles(spec.attackConfig)) {
      if (!Array.isArray(profile.damageTypes) || profile.damageTypes.length < 1) {
        throw new Error(`${spec.monsterName}: ${spec.attackName} has no damage type.`);
      }
      for (const damageType of profile.damageTypes) {
        assertCanonicalDamageType(damageType.name, damageType.mode, selectable);
      }
    }
  }
}

async function damageTypeMaps(prisma: PrismaClient) {
  const rows = await prisma.damageType.findMany({
    where: { name: { in: Array.from(LEGAL_DAMAGE_TYPES.keys()) } },
    select: { id: true, name: true, attackMode: true },
  });
  const selectable = new Map<string, WoundMode>();
  const ids = new Map<string, number>();
  for (const row of rows) {
    if (!isSelectableDamageTypeName(row.name)) continue;
    const mode = row.attackMode === "MENTAL" ? "MENTAL" : "PHYSICAL";
    selectable.set(row.name, mode);
    ids.set(row.name, row.id);
  }
  return { selectable, ids };
}

function damageTypeIds(names: string[] | undefined, ids: Map<string, number>): number[] {
  return (names ?? []).map((name) => {
    const id = ids.get(name);
    if (!id) throw new Error(`Missing damage type id for ${name}.`);
    return id;
  });
}

async function upsertItemTemplate(
  tx: Prisma.TransactionClient,
  spec: ItemSpec,
  damageTypeIdsByName: Map<string, number>,
) {
  const coreData = {
    campaignId: BALANCE_CAMPAIGN_ID,
    itemUrl: null,
    name: spec.name,
    rarity: spec.rarity,
    level: spec.level,
    generalDescription: spec.description,
    type: spec.type,
    globalAttributeModifiers: spec.globalAttributeModifiers ?? [],
    size: spec.size ?? null,
    physicalStrength: null,
    mentalStrength: null,
    meleePhysicalStrength: spec.meleePhysicalStrength ?? null,
    meleeMentalStrength: spec.meleeMentalStrength ?? null,
    rangedPhysicalStrength: spec.rangedPhysicalStrength ?? null,
    rangedMentalStrength: spec.rangedMentalStrength ?? null,
    aoePhysicalStrength: null,
    aoeMentalStrength: null,
    meleeTargets: spec.meleeTargets ?? null,
    rangedTargets: spec.rangedTargets ?? null,
    rangedDistanceFeet: spec.rangedDistanceFeet ?? null,
    aoeCenterRangeFeet: null,
    aoeCount: null,
    aoeShape: null,
    aoeSphereRadiusFeet: null,
    aoeConeLengthFeet: null,
    aoeLineWidthFeet: null,
    aoeLineLengthFeet: null,
    customWeaponAttributes: null,
    mythicLbPushTemplateId: null,
    mythicLbBreakTemplateId: null,
    mythicLbTranscendTemplateId: null,
    armorLocation: spec.armorLocation ?? null,
    ppv: spec.ppv ?? null,
    mpv: spec.mpv ?? null,
    auraPhysical: null,
    auraMental: null,
    customArmorAttributes: null,
    shieldHasAttack: spec.type === "SHIELD" ? false : null,
    customShieldAttributes: null,
    itemLocation: spec.itemLocation ?? null,
    customItemAttributes: null,
  };

  await tx.itemTemplate.upsert({
    where: { id: spec.id },
    create: {
      id: spec.id,
      createdAt: new Date(),
      ...coreData,
    } as unknown as Parameters<typeof tx.itemTemplate.upsert>[0]["create"],
    update: coreData as unknown as Parameters<typeof tx.itemTemplate.upsert>[0]["update"],
  });

  await Promise.all([
    tx.itemTemplateRangeCategory.deleteMany({ where: { itemTemplateId: spec.id } }),
    tx.itemTemplateMeleeDamageType.deleteMany({ where: { itemTemplateId: spec.id } }),
    tx.itemTemplateRangedDamageType.deleteMany({ where: { itemTemplateId: spec.id } }),
    tx.itemTemplateAoEDamageType.deleteMany({ where: { itemTemplateId: spec.id } }),
    tx.itemTemplateAttackEffectMelee.deleteMany({ where: { itemTemplateId: spec.id } }),
    tx.itemTemplateAttackEffectRanged.deleteMany({ where: { itemTemplateId: spec.id } }),
    tx.itemTemplateAttackEffectAoE.deleteMany({ where: { itemTemplateId: spec.id } }),
    tx.itemTemplateWeaponAttribute.deleteMany({ where: { itemTemplateId: spec.id } }),
    tx.itemTemplateArmorAttribute.deleteMany({ where: { itemTemplateId: spec.id } }),
    tx.itemTemplateShieldAttribute.deleteMany({ where: { itemTemplateId: spec.id } }),
    tx.itemTemplateDefEffect.deleteMany({ where: { itemTemplateId: spec.id } }),
    tx.itemTemplateVRPEntry.deleteMany({ where: { itemTemplateId: spec.id } }),
  ]);

  if (spec.rangeCategories?.length) {
    await tx.itemTemplateRangeCategory.createMany({
      data: spec.rangeCategories.map((rangeCategory) => ({
        itemTemplateId: spec.id,
        rangeCategory,
      })),
    });
  }

  const meleeIds = damageTypeIds(spec.meleeDamageTypes, damageTypeIdsByName);
  if (meleeIds.length) {
    await tx.itemTemplateMeleeDamageType.createMany({
      data: meleeIds.map((damageTypeId) => ({ itemTemplateId: spec.id, damageTypeId })),
    });
  }

  const rangedIds = damageTypeIds(spec.rangedDamageTypes, damageTypeIdsByName);
  if (rangedIds.length) {
    await tx.itemTemplateRangedDamageType.createMany({
      data: rangedIds.map((damageTypeId) => ({ itemTemplateId: spec.id, damageTypeId })),
    });
  }

  const partyItem = await tx.campaignPartyInventoryItem.upsert({
    where: {
      campaignId_itemTemplateId: {
        campaignId: BALANCE_CAMPAIGN_ID,
        itemTemplateId: spec.id,
      },
    },
    update: { quantity: 1 },
    create: {
      campaignId: BALANCE_CAMPAIGN_ID,
      itemTemplateId: spec.id,
      quantity: 1,
    },
    select: { id: true, itemTemplateId: true, quantity: true },
  });

  return partyItem;
}

async function assignBackpackItems(
  tx: Prisma.TransactionClient,
  characterIdByName: Map<string, string>,
  partyItemIdByTemplateId: Map<string, string>,
) {
  const backpackIds = new Map<string, Map<string, string>>();
  for (const loadout of CHARACTER_LOADOUTS) {
    const characterId = characterIdByName.get(loadout.characterName);
    if (!characterId) throw new Error(`Missing character ${loadout.characterName}.`);
    const perCharacter = new Map<string, string>();
    for (const itemTemplateId of Object.values(loadout.slots)) {
      if (!itemTemplateId) continue;
      const partyInventoryItemId = partyItemIdByTemplateId.get(itemTemplateId);
      if (!partyInventoryItemId) throw new Error(`Missing party inventory item for ${itemTemplateId}.`);
      const backpackItem = await tx.campaignCharacterBackpackItem.upsert({
        where: {
          characterId_partyInventoryItemId: {
            characterId,
            partyInventoryItemId,
          },
        },
        update: { quantity: 1 },
        create: {
          campaignId: BALANCE_CAMPAIGN_ID,
          characterId,
          partyInventoryItemId,
          quantity: 1,
        },
        select: { id: true, partyInventoryItemId: true },
      });
      perCharacter.set(itemTemplateId, backpackItem.id);
    }
    backpackIds.set(loadout.characterName, perCharacter);
  }
  return backpackIds;
}

async function updateEquippedSlots(
  tx: Prisma.TransactionClient,
  characterIdByName: Map<string, string>,
  backpackIdsByCharacter: Map<string, Map<string, string>>,
) {
  const assignments: Array<{ characterName: string; characterId: string; equippedSlots: EquippedSlotsState }> = [];
  for (const loadout of CHARACTER_LOADOUTS) {
    const characterId = characterIdByName.get(loadout.characterName);
    if (!characterId) throw new Error(`Missing character ${loadout.characterName}.`);
    const backpackIds = backpackIdsByCharacter.get(loadout.characterName);
    if (!backpackIds) throw new Error(`Missing backpack ids for ${loadout.characterName}.`);
    const equippedSlots: EquippedSlotsState = {};
    for (const [slot, itemTemplateId] of Object.entries(loadout.slots) as Array<[EquipmentSlotKey, string]>) {
      const backpackItemId = backpackIds.get(itemTemplateId);
      if (!backpackItemId) throw new Error(`Missing backpack item for ${loadout.characterName} ${itemTemplateId}.`);
      equippedSlots[slot] = backpackItemId;
    }

    const row = await tx.campaignCharacter.findUnique({
      where: { id: characterId },
      select: { builderData: true },
    });
    if (!row) throw new Error(`Missing character row ${characterId}.`);
    const builderData = normalizeBuilderData(row.builderData);
    const nextBuilderData = {
      ...builderData,
      equippedSlots,
    };
    await tx.campaignCharacter.update({
      where: { id: characterId },
      data: {
        builderData: JSON.parse(JSON.stringify(nextBuilderData)) as Prisma.InputJsonValue,
      },
    });
    assignments.push({ characterName: loadout.characterName, characterId, equippedSlots });
  }
  return assignments;
}

async function updateMonsterAttacks(
  tx: Prisma.TransactionClient,
  monsterIdByName: Map<string, string>,
) {
  const output: Array<{
    monsterName: string;
    monsterId: string;
    monsterAttackId: string;
    naturalAttackId: string;
    attackName: string;
  }> = [];
  for (const spec of MONSTER_ATTACKS) {
    const monsterId = monsterIdByName.get(spec.monsterName);
    if (!monsterId) throw new Error(`Missing monster ${spec.monsterName}.`);
    await tx.monsterAttack.deleteMany({ where: { monsterId } });
    await tx.monsterNaturalAttack.deleteMany({ where: { monsterId } });
    const attack = await tx.monsterAttack.create({
      data: {
        monsterId,
        sortOrder: 0,
        attackMode: "NATURAL",
        attackName: spec.attackName,
        attackConfig: spec.attackConfig as Prisma.InputJsonValue,
        equippedWeaponId: null,
      },
      select: { id: true },
    });
    const naturalAttack = await tx.monsterNaturalAttack.create({
      data: {
        monsterId,
        attackName: spec.attackName,
        attackConfig: spec.attackConfig as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    output.push({
      monsterName: spec.monsterName,
      monsterId,
      monsterAttackId: attack.id,
      naturalAttackId: naturalAttack.id,
      attackName: spec.attackName,
    });
  }
  return output;
}

function assertUniqueRows<T extends { name: string }>(rows: T[], expectedNames: readonly string[], label: string) {
  if (rows.length !== expectedNames.length) {
    throw new Error(`Expected ${expectedNames.length} ${label}, found ${rows.length}.`);
  }
  for (const name of expectedNames) {
    const matches = rows.filter((row) => row.name === name);
    if (matches.length !== 1) throw new Error(`Expected exactly one ${label} named ${name}, found ${matches.length}.`);
  }
}

function assertIdsPreserved(
  before: Map<string, string>,
  after: Map<string, string>,
  label: string,
) {
  for (const [name, id] of before) {
    const nextId = after.get(name);
    if (nextId !== id) throw new Error(`${label} id changed for ${name}: ${id} -> ${nextId ?? "missing"}.`);
  }
}

function hasFallback(actor: { hydration?: { fallbackActions?: string[] } }) {
  return (actor.hydration?.fallbackActions ?? []).length > 0;
}

function readGlobalAttributeModifiers(value: unknown): Array<{ attribute?: string; amount?: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is { attribute?: unknown; amount?: unknown } => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      attribute: typeof entry.attribute === "string" ? entry.attribute : undefined,
      amount: typeof entry.amount === "number" && Number.isFinite(entry.amount) ? entry.amount : undefined,
    }))
    .filter((entry) => entry.attribute || entry.amount !== undefined);
}

function characterBackpackItemsForRules(
  row: Awaited<ReturnType<PrismaClient["campaignCharacter"]["findMany"]>>[number],
) {
  const record = row as unknown as {
    backpackItems: Array<{
      id: string;
      quantity: number;
      partyInventoryItem: {
        itemTemplate: {
          type: string | null;
          size: string | null;
          armorLocation: string | null;
          itemLocation: string | null;
        };
      };
    }>;
  };
  return record.backpackItems.map((entry) => ({
    id: entry.id,
    quantity: entry.quantity,
    itemTemplate: {
      type: entry.partyInventoryItem.itemTemplate.type,
      size: entry.partyInventoryItem.itemTemplate.size,
      armorLocation: entry.partyInventoryItem.itemTemplate.armorLocation,
      itemLocation: entry.partyInventoryItem.itemTemplate.itemLocation,
    },
  }));
}

async function verify(prisma: PrismaClient, expectedCharacterIds: Map<string, string>, expectedMonsterIds: Map<string, string>) {
  const [characters, monsters] = await Promise.all([
    prisma.campaignCharacter.findMany({
      where: { campaignId: BALANCE_CAMPAIGN_ID, name: { in: [...CHARACTER_NAMES] } },
      orderBy: { name: "asc" },
      include: CHARACTER_INCLUDE,
    }),
    prisma.monster.findMany({
      where: { campaignId: BALANCE_CAMPAIGN_ID, name: { in: [...MONSTER_NAMES] } },
      orderBy: { name: "asc" },
      include: MONSTER_INCLUDE,
    }),
  ]);
  assertUniqueRows(characters, CHARACTER_NAMES, "characters");
  assertUniqueRows(monsters, MONSTER_NAMES, "monsters");
  assertIdsPreserved(expectedCharacterIds, new Map(characters.map((row) => [row.name, row.id])), "Character");
  assertIdsPreserved(expectedMonsterIds, new Map(monsters.map((row) => [row.name, row.id])), "Monster");

  const characterResults = characters.map((character) => {
    const rulesItems = characterBackpackItemsForRules(character);
    const builderData = sanitizeBuilderEquipment(normalizeBuilderData(character.builderData), rulesItems);
    const sanitizedSlots = builderData.equippedSlots;
    const rawSlots = normalizeBuilderData(character.builderData).equippedSlots;
    if (JSON.stringify(sanitizedSlots) !== JSON.stringify(rawSlots)) {
      throw new Error(`${character.name}: equippedSlots did not survive sanitizer.`);
    }
    const backpackIds = new Set(character.backpackItems.map((item) => item.id));
    for (const [slot, backpackItemId] of Object.entries(rawSlots)) {
      if (!backpackIds.has(backpackItemId)) {
        throw new Error(`${character.name}: ${slot} points at non-backpack id ${backpackItemId}.`);
      }
    }
    const derived = buildCharacterDerivedCombatStats({
      level: character.level,
      builderData,
      backpackItems: character.backpackItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        itemTemplate: {
          id: item.partyInventoryItem.itemTemplate.id,
          itemUrl: item.partyInventoryItem.itemTemplate.itemUrl,
          name: item.partyInventoryItem.itemTemplate.name,
          rarity: item.partyInventoryItem.itemTemplate.rarity,
          level: item.partyInventoryItem.itemTemplate.level,
          details: item.partyInventoryItem.itemTemplate.generalDescription,
          type: item.partyInventoryItem.itemTemplate.type,
          size: item.partyInventoryItem.itemTemplate.size,
          armorLocation: item.partyInventoryItem.itemTemplate.armorLocation,
          itemLocation: item.partyInventoryItem.itemTemplate.itemLocation,
          ppv: item.partyInventoryItem.itemTemplate.ppv,
          mpv: item.partyInventoryItem.itemTemplate.mpv,
          globalAttributeModifiers: readGlobalAttributeModifiers(item.partyInventoryItem.itemTemplate.globalAttributeModifiers),
          meleeTargets: item.partyInventoryItem.itemTemplate.meleeTargets,
          rangedTargets: item.partyInventoryItem.itemTemplate.rangedTargets,
          rangedDistanceFeet: item.partyInventoryItem.itemTemplate.rangedDistanceFeet,
          aoeCenterRangeFeet: item.partyInventoryItem.itemTemplate.aoeCenterRangeFeet,
          aoeCount: item.partyInventoryItem.itemTemplate.aoeCount,
          aoeShape: item.partyInventoryItem.itemTemplate.aoeShape,
          aoeSphereRadiusFeet: item.partyInventoryItem.itemTemplate.aoeSphereRadiusFeet,
          aoeConeLengthFeet: item.partyInventoryItem.itemTemplate.aoeConeLengthFeet,
          aoeLineWidthFeet: item.partyInventoryItem.itemTemplate.aoeLineWidthFeet,
          aoeLineLengthFeet: item.partyInventoryItem.itemTemplate.aoeLineLengthFeet,
          physicalStrength: item.partyInventoryItem.itemTemplate.physicalStrength,
          mentalStrength: item.partyInventoryItem.itemTemplate.mentalStrength,
          meleePhysicalStrength: item.partyInventoryItem.itemTemplate.meleePhysicalStrength,
          meleeMentalStrength: item.partyInventoryItem.itemTemplate.meleeMentalStrength,
          rangedPhysicalStrength: item.partyInventoryItem.itemTemplate.rangedPhysicalStrength,
          rangedMentalStrength: item.partyInventoryItem.itemTemplate.rangedMentalStrength,
          aoePhysicalStrength: item.partyInventoryItem.itemTemplate.aoePhysicalStrength,
          aoeMentalStrength: item.partyInventoryItem.itemTemplate.aoeMentalStrength,
          meleeDamageTypes: item.partyInventoryItem.itemTemplate.meleeDamageTypes.map((entry) => ({
            name: entry.damageType.name,
            mode: entry.damageType.attackMode === "MENTAL" ? "MENTAL" as const : "PHYSICAL" as const,
          })),
          rangedDamageTypes: item.partyInventoryItem.itemTemplate.rangedDamageTypes.map((entry) => ({
            name: entry.damageType.name,
            mode: entry.damageType.attackMode === "MENTAL" ? "MENTAL" as const : "PHYSICAL" as const,
          })),
          aoeDamageTypes: item.partyInventoryItem.itemTemplate.aoeDamageTypes.map((entry) => ({
            name: entry.damageType.name,
            mode: entry.damageType.attackMode === "MENTAL" ? "MENTAL" as const : "PHYSICAL" as const,
          })),
          attackEffectsMelee: item.partyInventoryItem.itemTemplate.attackEffectsMelee.map((entry) => entry.attackEffect.name),
          attackEffectsRanged: item.partyInventoryItem.itemTemplate.attackEffectsRanged.map((entry) => entry.attackEffect.name),
          attackEffectsAoE: item.partyInventoryItem.itemTemplate.attackEffectsAoE.map((entry) => entry.attackEffect.name),
          vrpEntries: item.partyInventoryItem.itemTemplate.vrpEntries.map((entry) => ({
            effectKind: entry.effectKind,
            magnitude: entry.magnitude,
            damageType: entry.damageType.name,
          })),
          descriptorSections: [],
        },
      })),
      protectionTuning: DEFAULT_COMBAT_TUNING_VALUES,
    });
    if (derived.attacks.length < 1) {
      throw new Error(`${character.name}: Character Sheet derived stats produced no real equipment attack.`);
    }
    if (derived.protectionSources.length < 1) {
      throw new Error(`${character.name}: Character Sheet derived stats produced no protection source.`);
    }
    const hydration = adaptCampaignCharacterToCombatActor(character, DEFAULT_COMBAT_TUNING_VALUES);
    if (hasFallback(hydration.actor)) {
      throw new Error(`${character.name}: Combat Lab still has fallback actions: ${hydration.actor.hydration.fallbackActions.join(", ")}.`);
    }
    return {
      id: character.id,
      name: character.name,
      backpackItems: character.backpackItems.map((item) => ({
        id: item.id,
        itemTemplateId: item.partyInventoryItem.itemTemplate.id,
        itemName: item.partyInventoryItem.itemTemplate.name,
      })),
      equippedSlots: rawSlots,
      sheetAttackLines: derived.attacks.flatMap((attack) => attack.lines),
      protectionSources: derived.protectionSources,
      hydrationWarnings: hydration.warnings.map((warning) => warning.message),
      fallbackActions: hydration.actor.hydration.fallbackActions,
    };
  });

  const monsterResults = monsters.map((monster) => {
    if (monster.attacks.length !== 1) throw new Error(`${monster.name}: expected one MonsterAttack row.`);
    if (!monster.naturalAttack) throw new Error(`${monster.name}: missing MonsterNaturalAttack compatibility row.`);
    if (monster.naturalAttack.attackName !== monster.attacks[0].attackName) {
      throw new Error(`${monster.name}: compatibility natural attack does not mirror first attack name.`);
    }
    const hydration = adaptMonsterToCombatLabActor(monster, new Map(), DEFAULT_COMBAT_TUNING_VALUES);
    if (hasFallback(hydration.actor)) {
      throw new Error(`${monster.name}: Combat Lab still has fallback actions: ${hydration.actor.hydration.fallbackActions.join(", ")}.`);
    }
    return {
      id: monster.id,
      name: monster.name,
      monsterAttackId: monster.attacks[0].id,
      naturalAttackId: monster.naturalAttack.id,
      attackName: monster.attacks[0].attackName,
      actionNames: hydration.actor.actions.map((action) => action.name),
      hydrationWarnings: hydration.warnings.map((warning) => warning.message),
      fallbackActions: hydration.actor.hydration.fallbackActions,
    };
  });

  return { characterResults, monsterResults };
}

async function main() {
  loadLocalEnv();
  const { prisma } = await import("../prisma/client");

  const initialCounts = {
    campaignCharacters: await prisma.campaignCharacter.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
    campaignMonsters: await prisma.monster.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
    outsideCharacters: await prisma.campaignCharacter.count({ where: { campaignId: { not: BALANCE_CAMPAIGN_ID } } }),
    outsideMonsters: await prisma.monster.count({ where: { campaignId: { not: BALANCE_CAMPAIGN_ID } } }),
    outsideItemTemplates: await prisma.itemTemplate.count({ where: { campaignId: { not: BALANCE_CAMPAIGN_ID } } }),
  };

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: BALANCE_CAMPAIGN_ID },
      select: { id: true, name: true },
    });
    if (!campaign) throw new Error(`Campaign ${BALANCE_CAMPAIGN_ID} was not found.`);
    if (campaign.name !== BALANCE_CAMPAIGN_NAME) {
      throw new Error(`Campaign name mismatch: expected ${BALANCE_CAMPAIGN_NAME}, found ${campaign.name}.`);
    }

    const [characters, monsters, existingItemNameConflicts] = await Promise.all([
      prisma.campaignCharacter.findMany({
        where: { campaignId: BALANCE_CAMPAIGN_ID, name: { in: [...CHARACTER_NAMES] } },
        select: { id: true, name: true },
      }),
      prisma.monster.findMany({
        where: { campaignId: BALANCE_CAMPAIGN_ID, name: { in: [...MONSTER_NAMES] } },
        select: { id: true, name: true },
      }),
      prisma.itemTemplate.findMany({
        where: {
          campaignId: BALANCE_CAMPAIGN_ID,
          name: { in: ITEM_SPECS.map((item) => item.name) },
          id: { notIn: ITEM_SPECS.map((item) => item.id) },
        },
        select: { id: true, name: true },
      }),
    ]);
    assertUniqueRows(characters, CHARACTER_NAMES, "characters");
    assertUniqueRows(monsters, MONSTER_NAMES, "monsters");
    if (existingItemNameConflicts.length > 0) {
      throw new Error(
        `Refusing to create duplicate item names: ${existingItemNameConflicts.map((item) => `${item.name} (${item.id})`).join(", ")}.`,
      );
    }

    const characterIdByName = new Map(characters.map((row) => [row.name, row.id]));
    const monsterIdByName = new Map(monsters.map((row) => [row.name, row.id]));
    const { selectable, ids: damageTypeIdsByName } = await damageTypeMaps(prisma);
    validateSpecs(selectable);

    const mutationOutput = await prisma.$transaction(async (tx) => {
      const itemTemplates: Array<{ id: string; name: string }> = [];
      const partyInventoryRows: Array<{ id: string; itemTemplateId: string; quantity: number }> = [];
      for (const spec of ITEM_SPECS) {
        const partyItem = await upsertItemTemplate(tx, spec, damageTypeIdsByName);
        itemTemplates.push({ id: spec.id, name: spec.name });
        partyInventoryRows.push(partyItem);
      }
      const partyItemIdByTemplateId = new Map(partyInventoryRows.map((row) => [row.itemTemplateId, row.id]));
      const backpackIdsByCharacter = await assignBackpackItems(tx, characterIdByName, partyItemIdByTemplateId);
      const equippedAssignments = await updateEquippedSlots(tx, characterIdByName, backpackIdsByCharacter);
      const monsterAttacks = await updateMonsterAttacks(tx, monsterIdByName);
      return {
        itemTemplates,
        partyInventoryRows,
        backpackRows: Array.from(backpackIdsByCharacter.entries()).flatMap(([characterName, rows]) =>
          Array.from(rows.entries()).map(([itemTemplateId, backpackItemId]) => ({
            characterName,
            itemTemplateId,
            backpackItemId,
          })),
        ),
        equippedAssignments,
        monsterAttacks,
      };
    }, { timeout: 30_000 });

    const finalCounts = {
      campaignCharacters: await prisma.campaignCharacter.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
      campaignMonsters: await prisma.monster.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
      outsideCharacters: await prisma.campaignCharacter.count({ where: { campaignId: { not: BALANCE_CAMPAIGN_ID } } }),
      outsideMonsters: await prisma.monster.count({ where: { campaignId: { not: BALANCE_CAMPAIGN_ID } } }),
      outsideItemTemplates: await prisma.itemTemplate.count({ where: { campaignId: { not: BALANCE_CAMPAIGN_ID } } }),
    };
    if (finalCounts.campaignCharacters !== initialCounts.campaignCharacters) {
      throw new Error(`Balance character count changed: ${initialCounts.campaignCharacters} -> ${finalCounts.campaignCharacters}.`);
    }
    if (finalCounts.campaignMonsters !== initialCounts.campaignMonsters) {
      throw new Error(`Balance monster count changed: ${initialCounts.campaignMonsters} -> ${finalCounts.campaignMonsters}.`);
    }
    if (finalCounts.outsideCharacters !== initialCounts.outsideCharacters) {
      throw new Error("Character count outside Balance Environment changed.");
    }
    if (finalCounts.outsideMonsters !== initialCounts.outsideMonsters) {
      throw new Error("Monster count outside Balance Environment changed.");
    }
    if (finalCounts.outsideItemTemplates !== initialCounts.outsideItemTemplates) {
      throw new Error("ItemTemplate count outside Balance Environment changed.");
    }

    const verification = await verify(prisma, characterIdByName, monsterIdByName);
    console.log(JSON.stringify({
      campaignId: BALANCE_CAMPAIGN_ID,
      campaignName: BALANCE_CAMPAIGN_NAME,
      initialCounts,
      finalCounts,
      ...mutationOutput,
      characterHydration: verification.characterResults,
      monsterHydration: verification.monsterResults,
      fallbackActionsRemain: false,
      forbiddenEquipmentTerminologyIntroduced: false,
      charactersCreatedOrDeleted: false,
      monstersCreatedOrDeleted: false,
      outsideBalanceEnvironmentTouched: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
