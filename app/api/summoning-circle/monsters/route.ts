import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import type { Prisma } from "@prisma/client";
import { requireCampaignMember, requireUserId } from "../_shared";
import { normalizeMonsterUpsertInput } from "@/lib/summoning/validation";

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

async function isValidEquippedWeaponId(campaignId: string, equippedWeaponId: string) {
  const weapon = await prisma.itemTemplate.findFirst({
    where: {
      id: equippedWeaponId,
      campaignId,
      type: { in: ["WEAPON", "SHIELD"] },
    },
    select: { id: true },
  });

  return !!weapon;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  try {
    const userId = await requireUserId();
    await requireCampaignMember(campaignId, userId);

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
      },
      orderBy: [{ source: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ monsters });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load monsters";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const role = await requireCampaignMember(campaignId, userId);
    if (role !== "GAME_DIRECTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = parsed.data;

    if (data.attackMode === "EQUIPPED_WEAPON" && data.equippedWeaponId) {
      const isValid = await isValidEquippedWeaponId(campaignId, data.equippedWeaponId);
      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid equippedWeaponId for campaign" },
          { status: 400 },
        );
      }
    }

    const monster = await prisma.monster.create({
      data: {
        name: data.name,
        level: data.level,
        tier: data.tier,
        legendary: data.legendary,
        attackMode: data.attackMode,
        equippedWeaponId: data.equippedWeaponId,
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
        source: "CAMPAIGN",
        isReadOnly: false,
        campaignId,
        tags: {
          create: data.tags.map((tag) => ({ tag })),
        },
        traits: {
          create: data.traits,
        },
        naturalAttack:
          data.attackMode === "NATURAL_WEAPON" && data.naturalAttack
            ? {
                create: {
                  attackName: data.naturalAttack.attackName,
                  attackConfig: data.naturalAttack.attackConfig as Prisma.InputJsonValue,
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

    return NextResponse.json(monster, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create monster";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[SUMMONING_MONSTERS_POST]", error);
    return NextResponse.json({ error: "Failed to create monster" }, { status: 500 });
  }
}
