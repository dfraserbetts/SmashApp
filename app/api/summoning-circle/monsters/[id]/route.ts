import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import type { Prisma } from "@prisma/client";
import { requireCampaignMember, requireUserId } from "../../_shared";
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

    if (data.attackMode === "EQUIPPED_WEAPON" && data.equippedWeaponId) {
      const isValid = await isValidEquippedWeaponId(campaignId, data.equippedWeaponId);
      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid equippedWeaponId for campaign" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.monster.update({
        where: { id },
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
        },
      });

      await tx.monsterTag.deleteMany({ where: { monsterId: id } });
      await tx.monsterTrait.deleteMany({ where: { monsterId: id } });
      await tx.monsterPower.deleteMany({ where: { monsterId: id } });
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

      if (data.attackMode === "NATURAL_WEAPON" && data.naturalAttack) {
        await tx.monsterNaturalAttack.create({
          data: {
            monsterId: id,
            attackName: data.naturalAttack.attackName,
            attackConfig: data.naturalAttack.attackConfig as Prisma.InputJsonValue,
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
