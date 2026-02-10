import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { requireCampaignMember, requireUserId } from "../_shared";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  try {
    const userId = await requireUserId();
    await requireCampaignMember(campaignId, userId);

    const rows = await prisma.itemTemplate.findMany({
      where: {
        campaignId,
        type: { in: ["WEAPON", "SHIELD", "ARMOR"] },
      },
      orderBy: { name: "asc" },
      include: {
        rangeCategories: true,
        meleeDamageTypes: { include: { damageType: true } },
        rangedDamageTypes: { include: { damageType: true } },
        aoeDamageTypes: { include: { damageType: true } },
        attackEffectsMelee: { include: { attackEffect: true } },
        attackEffectsRanged: { include: { attackEffect: true } },
        attackEffectsAoE: { include: { attackEffect: true } },
      },
    });

    const weapons = rows.map((row) => ({
      id: row.id,
      name: row.name,
      imageUrl: row.itemUrl ?? null,
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
          mode: x.damageType.attackMode,
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
          mode: x.damageType.attackMode,
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
          mode: x.damageType.attackMode,
        })),
        attackEffects: row.attackEffectsAoE.map((x) => x.attackEffect.name),
      },
    }));

    return NextResponse.json({ weapons });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load weapons";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[SUMMONING_WEAPONS_GET]", error);
    return NextResponse.json({ error: "Failed to load weapons" }, { status: 500 });
  }
}
