import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import type { Prisma } from "@prisma/client";
import { requireCampaignMember, requireUserId } from "../../../_shared";

const MONSTER_INCLUDE = {
  tags: { orderBy: { tag: "asc" as const } },
  traits: { orderBy: { sortOrder: "asc" as const } },
  naturalAttack: true,
  powers: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      intentions: { orderBy: { sortOrder: "asc" as const } },
    },
  },
};

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

    const created = await prisma.monster.create({
      data: {
        name: `${source.name} (Copy)`,
        level: source.level,
        tier: source.tier,
        legendary: source.legendary,
        source: "CAMPAIGN",
        isReadOnly: false,
        campaignId,
        attackMode: source.attackMode,
        equippedWeaponId: source.equippedWeaponId,
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
        naturalAttack: source.naturalAttack
          ? {
              create: {
                attackName: source.naturalAttack.attackName,
                attackConfig: source.naturalAttack.attackConfig as Prisma.InputJsonValue,
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
