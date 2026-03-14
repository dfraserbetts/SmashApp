import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { Prisma } from "@prisma/client";
import {
  isTwoHanded,
  isValidArmorItemForSlot,
  isValidHandItemForSlot,
  isValidItemAccessorySlot,
  type SummoningEquipmentItem,
} from "@/lib/summoning/equipment";
import { renderAttackActionLines } from "@/lib/summoning/render";
import type { MonsterNaturalAttackConfig, MonsterUpsertInput } from "@/lib/summoning/types";
import { requireCampaignAccess, requireCampaignDirectorOrAdmin, requireUserId } from "../_shared";
import { normalizeMonsterUpsertInput } from "@/lib/summoning/validation";

const MONSTER_INCLUDE = {
  tags: { orderBy: { tag: "asc" as const } },
  traits: {
    orderBy: { sortOrder: "asc" as const },
    include: { trait: { select: { id: true, name: true, effectText: true } } },
  },
  attacks: { orderBy: { sortOrder: "asc" as const } },
  naturalAttack: true,
  powers: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      intentions: { orderBy: { sortOrder: "asc" as const } },
    },
  },
};
const WEAPON_SOURCE_CAP = 3;
const WEAPON_SOURCE_CAP_ERROR =
  "A monster can have at most 3 weapon sources total (equipped + natural). Unequip a weapon source or remove a natural weapon.";

function getInternalErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta ? ` ${JSON.stringify(error.meta)}` : "";
    return `${fallback} (${error.code})${meta}`;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return `${fallback}: ${error.message}`;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}

type EquipmentItemsById = Map<string, SummoningEquipmentItem>;

async function validateCoreTraitDefinitions(
  traits: MonsterUpsertInput["traits"],
): Promise<string | null> {
  if (traits.length === 0) return null;
  const ids = Array.from(new Set(traits.map((trait) => trait.traitDefinitionId)));
  const rows = await prisma.monsterTraitDefinition.findMany({
    where: {
      id: { in: ids },
      source: "CORE",
      isEnabled: true,
    },
    select: { id: true },
  });
  if (rows.length !== ids.length) {
    return "One or more selected traits are invalid or disabled";
  }
  return null;
}

async function loadEquipmentItemsById(
  campaignId: string,
  data: Pick<
    MonsterUpsertInput,
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
    | "beltItemId"
  >,
): Promise<EquipmentItemsById> {
  const ids = Array.from(
    new Set(
      [
        data.mainHandItemId,
        data.offHandItemId,
        data.smallItemId,
        data.headArmorItemId,
        data.shoulderArmorItemId,
        data.torsoArmorItemId,
        data.legsArmorItemId,
        data.feetArmorItemId,
        data.headItemId,
        data.neckItemId,
        data.armsItemId,
        data.beltItemId,
      ].filter(Boolean) as string[],
    ),
  );

  if (ids.length === 0) return new Map();

  const rows = await prisma.itemTemplate.findMany({
    where: {
      campaignId,
      id: { in: ids },
      type: { in: ["WEAPON", "SHIELD", "ARMOR", "ITEM"] },
    },
    select: {
      id: true,
      name: true,
      type: true,
      size: true,
      armorLocation: true,
      itemLocation: true,
      ppv: true,
      mpv: true,
      globalAttributeModifiers: true,
      meleeTargets: true,
      meleePhysicalStrength: true,
      meleeMentalStrength: true,
      rangedTargets: true,
      rangedDistanceFeet: true,
      rangedPhysicalStrength: true,
      rangedMentalStrength: true,
      aoeCount: true,
      aoeCenterRangeFeet: true,
      aoeShape: true,
      aoeSphereRadiusFeet: true,
      aoeConeLengthFeet: true,
      aoeLineWidthFeet: true,
      aoeLineLengthFeet: true,
      aoePhysicalStrength: true,
      aoeMentalStrength: true,
      rangeCategories: { select: { rangeCategory: true } },
      meleeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
      rangedDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
      aoeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
      attackEffectsMelee: { select: { attackEffect: { select: { name: true } } } },
      attackEffectsRanged: { select: { attackEffect: { select: { name: true } } } },
      attackEffectsAoE: { select: { attackEffect: { select: { name: true } } } },
    },
  });

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        type: row.type,
        size: row.size,
        armorLocation: row.armorLocation,
        itemLocation: row.itemLocation,
        ppv: row.ppv,
        mpv: row.mpv,
        globalAttributeModifiers: Array.isArray(row.globalAttributeModifiers)
          ? (row.globalAttributeModifiers as Array<{ attribute?: string; amount?: number }>)
          : [],
        melee: {
          enabled: row.rangeCategories.some((r) => r.rangeCategory === "MELEE"),
          targets: row.meleeTargets ?? 1,
          physicalStrength: row.meleePhysicalStrength ?? 0,
          mentalStrength: row.meleeMentalStrength ?? 0,
          damageTypes: row.meleeDamageTypes.map((x) => ({
            name: x.damageType.name,
            mode: x.damageType.attackMode as "PHYSICAL" | "MENTAL",
          })),
          attackEffects: row.attackEffectsMelee.map((x) => x.attackEffect.name),
        },
        ranged: {
          enabled: row.rangeCategories.some((r) => r.rangeCategory === "RANGED"),
          targets: row.rangedTargets ?? 1,
          distance: row.rangedDistanceFeet ?? 0,
          physicalStrength: row.rangedPhysicalStrength ?? 0,
          mentalStrength: row.rangedMentalStrength ?? 0,
          damageTypes: row.rangedDamageTypes.map((x) => ({
            name: x.damageType.name,
            mode: x.damageType.attackMode as "PHYSICAL" | "MENTAL",
          })),
          attackEffects: row.attackEffectsRanged.map((x) => x.attackEffect.name),
        },
        aoe: {
          enabled: row.rangeCategories.some((r) => r.rangeCategory === "AOE"),
          count: row.aoeCount ?? 1,
          centerRange: row.aoeCenterRangeFeet ?? 0,
          shape: row.aoeShape ?? "SPHERE",
          sphereRadiusFeet: row.aoeSphereRadiusFeet ?? undefined,
          coneLengthFeet: row.aoeConeLengthFeet ?? undefined,
          lineWidthFeet: row.aoeLineWidthFeet ?? undefined,
          lineLengthFeet: row.aoeLineLengthFeet ?? undefined,
          physicalStrength: row.aoePhysicalStrength ?? 0,
          mentalStrength: row.aoeMentalStrength ?? 0,
          damageTypes: row.aoeDamageTypes.map((x) => ({
            name: x.damageType.name,
            mode: x.damageType.attackMode as "PHYSICAL" | "MENTAL",
          })),
          attackEffects: row.attackEffectsAoE.map((x) => x.attackEffect.name),
        },
      } satisfies SummoningEquipmentItem,
    ]),
  );
}

function getWeaponSourceAttackLines(
  item: SummoningEquipmentItem | null | undefined,
  weaponSkillValue: number,
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
    { applyWeaponSkillOverride: true },
  );
}

function validateWeaponSourceCap(
  data: Pick<
    MonsterUpsertInput,
    "mainHandItemId" | "offHandItemId" | "smallItemId" | "attacks" | "weaponSkillValue"
  >,
  itemsById: EquipmentItemsById,
): string | null {
  const handIds = [data.mainHandItemId, data.offHandItemId, data.smallItemId];
  let equippedWeaponSourceCount = 0;
  for (const itemId of handIds) {
    if (!itemId) continue;
    const item = itemsById.get(itemId) ?? null;
    if (getWeaponSourceAttackLines(item, data.weaponSkillValue).length > 0) {
      equippedWeaponSourceCount += 1;
    }
  }
  const totalWeaponSources = equippedWeaponSourceCount + data.attacks.length;
  if (totalWeaponSources > WEAPON_SOURCE_CAP) {
    return WEAPON_SOURCE_CAP_ERROR;
  }
  return null;
}

function validateEquipmentSlots(
  data: Pick<
    MonsterUpsertInput,
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
    | "beltItemId"
  >,
  itemsById: EquipmentItemsById,
): string | null {
  const main = data.mainHandItemId ? itemsById.get(data.mainHandItemId) ?? null : null;
  const off = data.offHandItemId ? itemsById.get(data.offHandItemId) ?? null : null;
  const small = data.smallItemId ? itemsById.get(data.smallItemId) ?? null : null;
  const headArmor = data.headArmorItemId ? itemsById.get(data.headArmorItemId) ?? null : null;
  const shoulderArmor = data.shoulderArmorItemId ? itemsById.get(data.shoulderArmorItemId) ?? null : null;
  const torsoArmor = data.torsoArmorItemId ? itemsById.get(data.torsoArmorItemId) ?? null : null;
  const legsArmor = data.legsArmorItemId ? itemsById.get(data.legsArmorItemId) ?? null : null;
  const feetArmor = data.feetArmorItemId ? itemsById.get(data.feetArmorItemId) ?? null : null;
  const head = data.headItemId ? itemsById.get(data.headItemId) ?? null : null;
  const neck = data.neckItemId ? itemsById.get(data.neckItemId) ?? null : null;
  const arms = data.armsItemId ? itemsById.get(data.armsItemId) ?? null : null;
  const belt = data.beltItemId ? itemsById.get(data.beltItemId) ?? null : null;

  if (data.mainHandItemId && !main) return "Invalid mainHandItemId for campaign";
  if (data.offHandItemId && !off) return "Invalid offHandItemId for campaign";
  if (data.smallItemId && !small) return "Invalid smallItemId for campaign";
  if (data.headArmorItemId && !headArmor) return "Invalid headArmorItemId for campaign";
  if (data.shoulderArmorItemId && !shoulderArmor) return "Invalid shoulderArmorItemId for campaign";
  if (data.torsoArmorItemId && !torsoArmor) return "Invalid torsoArmorItemId for campaign";
  if (data.legsArmorItemId && !legsArmor) return "Invalid legsArmorItemId for campaign";
  if (data.feetArmorItemId && !feetArmor) return "Invalid feetArmorItemId for campaign";
  if (data.headItemId && !head) return "Invalid headItemId for campaign";
  if (data.neckItemId && !neck) return "Invalid neckItemId for campaign";
  if (data.armsItemId && !arms) return "Invalid armsItemId for campaign";
  if (data.beltItemId && !belt) return "Invalid beltItemId for campaign";

  if (main && !isValidHandItemForSlot("mainHandItemId", main)) {
    return "Main Hand item must be one-handed or two-handed weapon/shield";
  }
  if (off && !isValidHandItemForSlot("offHandItemId", off)) {
    return "Off Hand item must be one-handed weapon/shield";
  }
  if (small && !isValidHandItemForSlot("smallItemId", small)) {
    return "Small Slot item must be small weapon/shield";
  }
  if (isTwoHanded(main) && off) {
    return "Off Hand cannot be equipped while Main Hand has a two-handed item";
  }

  if (headArmor && !isValidArmorItemForSlot("headArmorItemId", headArmor)) {
    return "Head Armor slot item must have HEAD armor location";
  }
  if (shoulderArmor && !isValidArmorItemForSlot("shoulderArmorItemId", shoulderArmor)) {
    return "Shoulder Armor slot item must have SHOULDERS armor location";
  }
  if (torsoArmor && !isValidArmorItemForSlot("torsoArmorItemId", torsoArmor)) {
    return "Torso Armor slot item must have TORSO armor location";
  }
  if (legsArmor && !isValidArmorItemForSlot("legsArmorItemId", legsArmor)) {
    return "Legs Armor slot item must have LEGS armor location";
  }
  if (feetArmor && !isValidArmorItemForSlot("feetArmorItemId", feetArmor)) {
    return "Feet Armor slot item must have FEET armor location";
  }
  if (head && !isValidItemAccessorySlot("headItemId", head)) {
    return "Head Item slot item must have HEAD item location";
  }
  if (neck && !isValidItemAccessorySlot("neckItemId", neck)) {
    return "Neck Item slot item must have NECK item location";
  }
  if (arms && !isValidItemAccessorySlot("armsItemId", arms)) {
    return "Arms Item slot item must have ARMS item location";
  }
  if (belt && !isValidItemAccessorySlot("beltItemId", belt)) {
    return "Belt Item slot item must have BELT item location";
  }

  return null;
}

function toNaturalAttackField(
  attacks: Array<{
    sortOrder: number;
    attackName: string | null;
    attackConfig: unknown;
  }>,
) {
  const first = [...attacks].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (!first) {
    return null;
  }

  return {
    attackName: first.attackName ?? "Natural Weapon",
    attackConfig: (first.attackConfig ?? {}) as Prisma.InputJsonValue,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  try {
    const userId = await requireUserId();
    await requireCampaignAccess(campaignId, userId);

    const monsters = await prisma.monster.findMany({
      where: {
        OR: [{ source: "CORE" }, { source: "CAMPAIGN", campaignId }],
      },
      select: {
        id: true,
        name: true,
        level: true,
        tier: true,
        legendary: true,
        source: true,
        isReadOnly: true,
        campaignId: true,
        updatedAt: true,
        tags: {
          select: { tag: true },
          orderBy: { tag: "asc" },
        },
      },
      orderBy: [{ source: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({
      monsters: monsters.map((monster) => ({
        ...monster,
        tags: Array.isArray(monster.tags) ? monster.tags.map((tag) => tag.tag) : [],
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load monsters";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[SUMMONING_MONSTERS_GET]", error);
    return NextResponse.json({ error: "Failed to load monsters" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = normalizeMonsterUpsertInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const userId = await requireUserId();
    await requireCampaignDirectorOrAdmin(campaignId, userId);

    const data = parsed.data;
    const traitError = await validateCoreTraitDefinitions(data.traits);
    if (traitError) {
      return NextResponse.json({ error: traitError }, { status: 400 });
    }

    if (data.attacks.length > 3) {
      return NextResponse.json({ error: "A monster can have at most 3 attacks" }, { status: 400 });
    }
    const equipmentItemsById = await loadEquipmentItemsById(campaignId, data);
    const equipmentError = validateEquipmentSlots(data, equipmentItemsById);
    if (equipmentError) {
      return NextResponse.json({ error: equipmentError }, { status: 400 });
    }
    const weaponSourceError = validateWeaponSourceCap(data, equipmentItemsById);
    if (weaponSourceError) {
      return NextResponse.json({ error: weaponSourceError }, { status: 400 });
    }
    const naturalAttack = toNaturalAttackField(data.attacks);

    const monster = await prisma.monster.create({
      data: {
        name: data.name,
        imageUrl: data.imageUrl,
        imagePosX: data.imagePosX,
        imagePosY: data.imagePosY,
        level: data.level,
        tier: data.tier,
        legendary: data.legendary,
        attackMode: "NATURAL_WEAPON",
        equippedWeaponId: null,
        // SC_SEPARATE_ARMOR_AND_ITEM_PERSIST_V2
        mainHandItemId: data.mainHandItemId,
        offHandItemId: data.offHandItemId,
        smallItemId: data.smallItemId,
        headArmorItemId: data.headArmorItemId,
        shoulderArmorItemId: data.shoulderArmorItemId,
        torsoArmorItemId: data.torsoArmorItemId,
        legsArmorItemId: data.legsArmorItemId,
        feetArmorItemId: data.feetArmorItemId,
        headItemId: data.headItemId,
        neckItemId: data.neckItemId,
        armsItemId: data.armsItemId,
        beltItemId: data.beltItemId,
        customNotes: data.customNotes,
        limitBreakName: data.limitBreakName,
        limitBreakTier: data.limitBreakTier,
        limitBreakTriggerText: data.limitBreakTriggerText,
        limitBreakAttribute: data.limitBreakAttribute,
        limitBreakThresholdSuccesses: data.limitBreakThresholdSuccesses,
        limitBreakCostText: data.limitBreakCostText,
        limitBreakEffectText: data.limitBreakEffectText,
        limitBreak2Name: data.limitBreak2Name,
        limitBreak2Tier: data.limitBreak2Tier,
        limitBreak2TriggerText: data.limitBreak2TriggerText,
        limitBreak2Attribute: data.limitBreak2Attribute,
        limitBreak2ThresholdSuccesses: data.limitBreak2ThresholdSuccesses,
        limitBreak2CostText: data.limitBreak2CostText,
        limitBreak2EffectText: data.limitBreak2EffectText,
        physicalResilienceCurrent: data.physicalResilienceCurrent,
        physicalResilienceMax: data.physicalResilienceMax,
        mentalPerseveranceCurrent: data.mentalPerseveranceCurrent,
        mentalPerseveranceMax: data.mentalPerseveranceMax,
        physicalProtection: data.physicalProtection,
        mentalProtection: data.mentalProtection,
        naturalPhysicalProtection: data.naturalPhysicalProtection,
        naturalMentalProtection: data.naturalMentalProtection,
        attackDie: data.attackDie,
        attackResistDie: data.attackResistDie,
        attackModifier: data.attackModifier,
        defenceDie: data.defenceDie,
        defenceResistDie: data.defenceResistDie,
        defenceModifier: data.defenceModifier,
        fortitudeDie: data.fortitudeDie,
        fortitudeResistDie: data.fortitudeResistDie,
        fortitudeModifier: data.fortitudeModifier,
        intellectDie: data.intellectDie,
        intellectResistDie: data.intellectResistDie,
        intellectModifier: data.intellectModifier,
        supportDie: data.supportDie,
        supportResistDie: data.supportResistDie,
        supportModifier: data.supportModifier,
        braveryDie: data.braveryDie,
        braveryResistDie: data.braveryResistDie,
        braveryModifier: data.braveryModifier,
        weaponSkillValue: data.weaponSkillValue,
        weaponSkillModifier: data.weaponSkillModifier,
        armorSkillValue: data.armorSkillValue,
        armorSkillModifier: data.armorSkillModifier,
        source: "CAMPAIGN",
        isReadOnly: false,
        Campaign: {
          connect: { id: campaignId },
        },
        tags: {
          create: data.tags.map((tag) => ({ tag })),
        },
        traits: {
          create: data.traits.map((trait, index) => ({
            sortOrder: index,
            traitDefinitionId: trait.traitDefinitionId,
          })),
        },
        attacks: {
          create: data.attacks.map((attack) => ({
            sortOrder: attack.sortOrder,
            attackMode: "NATURAL",
            attackName: attack.attackName ?? "Natural Weapon",
            attackConfig: attack.attackConfig as Prisma.InputJsonValue,
            equippedWeaponId: null,
          })),
        },
        naturalAttack: naturalAttack
          ? {
              create: {
                attackName: naturalAttack.attackName,
                attackConfig: naturalAttack.attackConfig,
              },
            }
          : undefined,
        powers: {
          create: data.powers.map((power) => ({
            sortOrder: power.sortOrder,
            name: power.name,
            description: power.description,
            diceCount: power.diceCount,
            potency: power.potency,
            durationType: power.durationType as any,
            durationTurns: power.durationTurns,
            defenceRequirement: power.defenceRequirement,
            cooldownTurns: power.cooldownTurns,
            cooldownReduction: power.cooldownReduction,
            responseRequired: power.responseRequired,
            intentions: {
              create: power.intentions.map((intention) => ({
                sortOrder: intention.sortOrder,
                type: intention.type,
                detailsJson: intention.detailsJson as Prisma.InputJsonValue,
              })),
            },
          })),
        },
      },
      include: MONSTER_INCLUDE,
    });

    return NextResponse.json(monster, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create monster";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[SUMMONING_MONSTERS_POST]", error);
    const debugMessage = getInternalErrorMessage(error, "Failed to create monster");
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Failed to create monster" : debugMessage },
      { status: 500 },
    );
  }
}
