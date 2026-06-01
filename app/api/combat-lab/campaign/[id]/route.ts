import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import { requireCampaignGameDirector } from "@/lib/campaign/access";
import { prisma } from "@/prisma/client";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const campaignId = String(id ?? "").trim();
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign id is required" }, { status: 400 });
    }

    const userId = await requireUserId();
    await requireCampaignGameDirector(campaignId, userId);

    const [campaign, characters, monsters] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, name: true, descriptorVersionTag: true },
      }),
      prisma.campaignCharacter.findMany({
        where: { campaignId, archivedAt: null },
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          level: true,
          updatedAt: true,
          builderData: true,
        },
      }),
      prisma.monster.findMany({
        where: { campaignId, source: "CAMPAIGN", isReadOnly: false },
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          level: true,
          tier: true,
          updatedAt: true,
          physicalResilienceMax: true,
          mentalPerseveranceMax: true,
          powers: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({
      campaign,
      characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        level: character.level,
        updatedAt: character.updatedAt,
        powerCount:
          Array.isArray((character.builderData as { powers?: unknown } | null)?.powers)
            ? ((character.builderData as { powers: unknown[] }).powers.length)
            : 0,
      })),
      monsters: monsters.map((monster) => ({
        id: monster.id,
        name: monster.name,
        level: monster.level,
        tier: monster.tier,
        updatedAt: monster.updatedAt,
        physicalResilienceMax: monster.physicalResilienceMax,
        mentalPerseveranceMax: monster.mentalPerseveranceMax,
        powerCount: monster.powers.length,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[COMBAT_LAB_CAMPAIGN_GET]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
