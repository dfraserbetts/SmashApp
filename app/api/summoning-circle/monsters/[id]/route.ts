import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import type { Prisma } from "@prisma/client";
import {
  isTwoHanded,
  isValidBodyItemForSlot,
  isValidHandItemForSlot,
  type SummoningEquipmentItem,
} from "@/lib/summoning/equipment";
import { renderAttackActionLines } from "@/lib/summoning/render";
import type { MonsterNaturalAttackConfig, MonsterUpsertInput } from "@/lib/summoning/types";
import { requireCampaignMember, requireUserId } from "../../_shared";
import { normalizeMonsterUpsertInput } from "@/lib/summoning/validation";

const MONSTER_INCLUDE = {
  tags: { orderBy: { tag: "asc" as const } },
  traits: { orderBy: { sortOrder: "asc" as const } },
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

type EquipmentItemsById = Map<string, SummoningEquipmentItem>;

async function loadEquipmentItemsById(
  campaignId: string,
  data: Pick<
    MonsterUpsertInput,
    | "mainHandItemId"
    | "offHandItemId"
    | "smallItemId"
    | "headItemId"
    | "shoulderItemId"
    | "torsoItemId"
    | "legsItemId"
    | "feetItemId"
  >,
): Promise<EquipmentItemsById> {
  const ids = Array.from(
    new Set(
      [
        data.mainHandItemId,
        data.offHandItemId,
        data.smallItemId,
        data.headItemId,
        data.shoulderItemId,
        data.torsoItemId,
        data.legsItemId,
        data.feetItemId,
      ].filter(Boolean) as string[],
    ),
  );

  if (ids.length === 0) return new Map();

  const rows = await prisma.itemTemplate.findMany({
    where: {
      campaignId,
      id: { in: ids },
      type: { in: ["WEAPON", "SHIELD", "ARMOR"] },
    },
    select: {
      id: true,
      name: true,
      type: true,
      size: true,
      armorLocation: true,
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
    | "headItemId"
    | "shoulderItemId"
    | "torsoItemId"
    | "legsItemId"
    | "feetItemId"
  >,
  itemsById: EquipmentItemsById,
): string | null {
  const main = data.mainHandItemId ? itemsById.get(data.mainHandItemId) ?? null : null;
  const off = data.offHandItemId ? itemsById.get(data.offHandItemId) ?? null : null;
  const small = data.smallItemId ? itemsById.get(data.smallItemId) ?? null : null;
  const head = data.headItemId ? itemsById.get(data.headItemId) ?? null : null;
  const shoulder = data.shoulderItemId ? itemsById.get(data.shoulderItemId) ?? null : null;
  const torso = data.torsoItemId ? itemsById.get(data.torsoItemId) ?? null : null;
  const legs = data.legsItemId ? itemsById.get(data.legsItemId) ?? null : null;
  const feet = data.feetItemId ? itemsById.get(data.feetItemId) ?? null : null;

  if (data.mainHandItemId && !main) return "Invalid mainHandItemId for campaign";
  if (data.offHandItemId && !off) return "Invalid offHandItemId for campaign";
  if (data.smallItemId && !small) return "Invalid smallItemId for campaign";
  if (data.headItemId && !head) return "Invalid headItemId for campaign";
  if (data.shoulderItemId && !shoulder) return "Invalid shoulderItemId for campaign";
  if (data.torsoItemId && !torso) return "Invalid torsoItemId for campaign";
  if (data.legsItemId && !legs) return "Invalid legsItemId for campaign";
  if (data.feetItemId && !feet) return "Invalid feetItemId for campaign";

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

  if (head && !isValidBodyItemForSlot("headItemId", head)) return "Head slot item must have HEAD location";
  if (shoulder && !isValidBodyItemForSlot("shoulderItemId", shoulder)) {
    return "Shoulder slot item must have SHOULDERS location";
  }
  if (torso && !isValidBodyItemForSlot("torsoItemId", torso)) return "Torso slot item must have TORSO location";
  if (legs && !isValidBodyItemForSlot("legsItemId", legs)) return "Legs slot item must have LEGS location";
  if (feet && !isValidBodyItemForSlot("feetItemId", feet)) return "Feet slot item must have FEET location";

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

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  try {
    const userId = await requireUserId();
    await requireCampaignMember(campaignId, userId);

    const monster = await prisma.monster.findFirst({
      where: {
        id,
        OR: [{ source: "CORE" }, { source: "CAMPAIGN", campaignId }],
      },
      include: MONSTER_INCLUDE,
    });

    if (!monster) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(monster);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load monster";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[SUMMONING_MONSTER_GET]", error);
    return NextResponse.json({ error: "Failed to load monster" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
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
    const role = await requireCampaignMember(campaignId, userId);
    if (role !== "GAME_DIRECTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.monster.findUnique({
      where: { id },
      select: {
        id: true,
        source: true,
        isReadOnly: true,
        campaignId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.source === "CORE" || existing.isReadOnly) {
      return NextResponse.json({ error: "Core monsters are read-only; copy first" }, { status: 403 });
    }

    if (existing.campaignId !== campaignId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = parsed.data;

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

    const updated = await prisma.$transaction(async (tx) => {
      await tx.monster.update({
        where: { id },
        data: {
          name: data.name,
          level: data.level,
          tier: data.tier,
          legendary: data.legendary,
          attackMode: "NATURAL_WEAPON",
          equippedWeaponId: null,
          mainHandItemId: data.mainHandItemId,
          offHandItemId: data.offHandItemId,
          smallItemId: data.smallItemId,
          headItemId: data.headItemId,
          shoulderItemId: data.shoulderItemId,
          torsoItemId: data.torsoItemId,
          legsItemId: data.legsItemId,
          feetItemId: data.feetItemId,
          customNotes: data.customNotes,
          physicalResilienceCurrent: data.physicalResilienceCurrent,
          physicalResilienceMax: data.physicalResilienceMax,
          mentalPerseveranceCurrent: data.mentalPerseveranceCurrent,
          mentalPerseveranceMax: data.mentalPerseveranceMax,
          physicalProtection: data.physicalProtection,
          mentalProtection: data.mentalProtection,
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
        },
      });

      await tx.monsterTag.deleteMany({ where: { monsterId: id } });
      await tx.monsterTrait.deleteMany({ where: { monsterId: id } });
      await tx.monsterPower.deleteMany({ where: { monsterId: id } });
      await tx.monsterAttack.deleteMany({ where: { monsterId: id } });
      await tx.monsterNaturalAttack.deleteMany({ where: { monsterId: id } });

      if (data.tags.length > 0) {
        await tx.monsterTag.createMany({
          data: data.tags.map((tag) => ({ monsterId: id, tag })),
        });
      }

      if (data.traits.length > 0) {
        await tx.monsterTrait.createMany({
          data: data.traits.map((trait) => ({
            monsterId: id,
            sortOrder: trait.sortOrder,
            text: trait.text,
          })),
        });
      }

      if (data.attacks.length > 0) {
        await tx.monsterAttack.createMany({
          data: data.attacks.map((attack) => ({
            monsterId: id,
            sortOrder: attack.sortOrder,
            attackMode: "NATURAL",
            attackName: attack.attackName ?? "Natural Weapon",
            attackConfig: attack.attackConfig as Prisma.InputJsonValue,
            equippedWeaponId: null,
          })),
        });
      }

      if (naturalAttack) {
        await tx.monsterNaturalAttack.create({
          data: {
            monsterId: id,
            attackName: naturalAttack.attackName,
            attackConfig: naturalAttack.attackConfig,
          },
        });
      }

      for (const power of data.powers) {
        await tx.monsterPower.create({
          data: {
            monsterId: id,
            sortOrder: power.sortOrder,
            name: power.name,
            description: power.description,
            diceCount: power.diceCount,
            potency: power.potency,
            durationType: power.durationType,
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
          },
        });
      }

      const fresh = await tx.monster.findUnique({
        where: { id },
        include: MONSTER_INCLUDE,
      });

      if (!fresh) throw new Error("Not found");
      return fresh;
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update monster";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "Not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[SUMMONING_MONSTER_PUT]", error);
    return NextResponse.json({ error: "Failed to update monster" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  try {
    const userId = await requireUserId();
    const role = await requireCampaignMember(campaignId, userId);
    if (role !== "GAME_DIRECTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.monster.findUnique({
      where: { id },
      select: { source: true, isReadOnly: true, campaignId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.source === "CORE" || existing.isReadOnly) {
      return NextResponse.json({ error: "Core monsters are read-only" }, { status: 403 });
    }
    if (existing.campaignId !== campaignId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.monster.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete monster";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[SUMMONING_MONSTER_DELETE]", error);
    return NextResponse.json({ error: "Failed to delete monster" }, { status: 500 });
  }
}
