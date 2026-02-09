import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import type { Prisma } from "@prisma/client";
import { renderAttackActionLines } from "@/lib/summoning/render";
import type { MonsterNaturalAttackConfig } from "@/lib/summoning/types";
import type { SummoningEquipmentItem } from "@/lib/summoning/equipment";
import { requireCampaignMember, requireUserId } from "../../../_shared";

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

function normalizedSourceAttacks(source: {
  attacks: Array<{
    sortOrder: number;
    attackMode: "NATURAL" | "EQUIPPED";
    attackName: string | null;
    attackConfig: unknown;
  }>;
  naturalAttack: {
    attackName: string;
    attackConfig: unknown;
  } | null;
}) {
  const sourceAttacks = [...source.attacks]
    .filter((attack) => attack.attackMode === "NATURAL")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((attack, index) => ({
      sortOrder: index,
      attackMode: "NATURAL" as const,
      attackName: attack.attackName ?? "Natural Weapon",
      attackConfig: attack.attackConfig ?? {},
    }));

  if (sourceAttacks.length > 0) return sourceAttacks;

  if (source.naturalAttack) {
    return [
      {
        sortOrder: 0,
        attackMode: "NATURAL" as const,
        attackName: source.naturalAttack.attackName,
        attackConfig: source.naturalAttack.attackConfig,
      },
    ];
  }

  return [];
}

async function loadEquipmentItemsById(
  campaignId: string,
  handItemIds: Array<string | null | undefined>,
): Promise<EquipmentItemsById> {
  const ids = Array.from(new Set(handItemIds.filter(Boolean) as string[]));
  if (ids.length === 0) return new Map();

  const rows = await prisma.itemTemplate.findMany({
    where: {
      campaignId,
      id: { in: ids },
      type: { in: ["WEAPON", "SHIELD"] },
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
  sourceAttacks: Array<{ sortOrder: number; attackName: string | null; attackConfig: unknown }>,
  source: {
    mainHandItemId: string | null;
    offHandItemId: string | null;
    smallItemId: string | null;
    weaponSkillValue: number;
  },
  itemsById: EquipmentItemsById,
): string | null {
  const handIds = [source.mainHandItemId, source.offHandItemId, source.smallItemId];
  let equippedWeaponSourceCount = 0;
  for (const itemId of handIds) {
    if (!itemId) continue;
    const item = itemsById.get(itemId) ?? null;
    if (getWeaponSourceAttackLines(item, source.weaponSkillValue).length > 0) {
      equippedWeaponSourceCount += 1;
    }
  }

  const totalWeaponSources = equippedWeaponSourceCount + sourceAttacks.length;
  if (totalWeaponSources > WEAPON_SOURCE_CAP) {
    return WEAPON_SOURCE_CAP_ERROR;
  }
  return null;
}

export async function POST(
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

    const source = await prisma.monster.findFirst({
      where: {
        id,
        OR: [{ source: "CORE" }, { source: "CAMPAIGN", campaignId }],
      },
      include: MONSTER_INCLUDE,
    });

    if (!source) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const sourceAttacks = normalizedSourceAttacks(source);
    const equipmentItemsById = await loadEquipmentItemsById(campaignId, [
      source.mainHandItemId,
      source.offHandItemId,
      source.smallItemId,
    ]);
    const sourceCapError = validateWeaponSourceCap(
      sourceAttacks,
      {
        mainHandItemId: source.mainHandItemId,
        offHandItemId: source.offHandItemId,
        smallItemId: source.smallItemId,
        weaponSkillValue: source.weaponSkillValue,
      },
      equipmentItemsById,
    );
    if (sourceCapError) {
      return NextResponse.json({ error: sourceCapError }, { status: 400 });
    }
    const naturalAttack = sourceAttacks[0]
      ? {
          attackName: sourceAttacks[0].attackName ?? "Natural Weapon",
          attackConfig: (sourceAttacks[0].attackConfig ?? {}) as Prisma.InputJsonValue,
        }
      : null;

    const created = await prisma.monster.create({
      data: {
        name: `${source.name} (Copy)`,
        level: source.level,
        tier: source.tier,
        legendary: source.legendary,
        source: "CAMPAIGN",
        isReadOnly: false,
        Campaign: {
          connect: { id: campaignId },
        },
        attackMode: "NATURAL_WEAPON",
        equippedWeaponId: null,
        mainHandItemId: source.mainHandItemId,
        offHandItemId: source.offHandItemId,
        smallItemId: source.smallItemId,
        headItemId: source.headItemId,
        shoulderItemId: source.shoulderItemId,
        torsoItemId: source.torsoItemId,
        legsItemId: source.legsItemId,
        feetItemId: source.feetItemId,
        customNotes: source.customNotes,
        physicalResilienceCurrent: source.physicalResilienceCurrent,
        physicalResilienceMax: source.physicalResilienceMax,
        mentalPerseveranceCurrent: source.mentalPerseveranceCurrent,
        mentalPerseveranceMax: source.mentalPerseveranceMax,
        physicalProtection: source.physicalProtection,
        mentalProtection: source.mentalProtection,
        attackDie: source.attackDie,
        attackResistDie: source.attackResistDie,
        attackModifier: source.attackModifier,
        defenceDie: source.defenceDie,
        defenceResistDie: source.defenceResistDie,
        defenceModifier: source.defenceModifier,
        fortitudeDie: source.fortitudeDie,
        fortitudeResistDie: source.fortitudeResistDie,
        fortitudeModifier: source.fortitudeModifier,
        intellectDie: source.intellectDie,
        intellectResistDie: source.intellectResistDie,
        intellectModifier: source.intellectModifier,
        supportDie: source.supportDie,
        supportResistDie: source.supportResistDie,
        supportModifier: source.supportModifier,
        braveryDie: source.braveryDie,
        braveryResistDie: source.braveryResistDie,
        braveryModifier: source.braveryModifier,
        weaponSkillValue: source.weaponSkillValue,
        weaponSkillModifier: source.weaponSkillModifier,
        armorSkillValue: source.armorSkillValue,
        armorSkillModifier: source.armorSkillModifier,
        tags: {
          create: source.tags.map((tag) => ({ tag: tag.tag })),
        },
        traits: {
          create: source.traits.map((trait) => ({
            sortOrder: trait.sortOrder,
            text: trait.text,
          })),
        },
        attacks: {
          create: sourceAttacks.map((attack) => ({
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
          create: source.powers.map((power) => ({
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
          })),
        },
      },
      include: MONSTER_INCLUDE,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to copy monster";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[SUMMONING_MONSTER_COPY]", error);
    return NextResponse.json({ error: "Failed to copy monster" }, { status: 500 });
  }
}
