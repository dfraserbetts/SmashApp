import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import { prisma } from "@/prisma/client";

function toErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[CAMPAIGN_LEAVE]", error);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

export async function POST(
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

    const [campaign, member, profile] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { ownerUserId: true },
      }),
      prisma.campaignUser.findUnique({
        where: { campaignId_userId: { campaignId, userId } },
        select: { role: true },
      }),
      prisma.userProfile.findUnique({
        where: { userId },
        select: { isAdmin: true },
      }),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (!member) {
      return NextResponse.json({ error: "Campaign membership not found" }, { status: 403 });
    }
    if (campaign.ownerUserId === userId || profile?.isAdmin || member.role !== "PLAYER") {
      return NextResponse.json(
        { error: "Only Player members can leave a campaign through this flow" },
        { status: 403 },
      );
    }

    const now = new Date();
    const [archiveResult] = await prisma.$transaction([
      prisma.campaignCharacter.updateMany({
        where: {
          campaignId,
          assignedUserId: userId,
        },
        data: {
          assignedUserId: null,
          archivedAt: now,
          archivedByUserId: userId,
          archiveReason: "PLAYER_LEFT",
        },
      }),
      prisma.campaignUser.delete({
        where: { campaignId_userId: { campaignId, userId } },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      archivedAssignedCharacters: true,
      archivedCharacterCount: archiveResult.count,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
