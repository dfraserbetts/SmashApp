import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import { prisma } from "@/prisma/client";

export async function POST(
  _req: Request,
  context: { params: Promise<{ inviteId: string }> },
) {
  try {
    const { inviteId } = await context.params;
    const id = String(inviteId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Invite id is required" }, { status: 400 });
    }

    const userId = await requireUserId();
    const result = await prisma.$transaction(async (tx) => {
      const invite = await tx.campaignInvite.findUnique({
        where: { id },
        select: {
          id: true,
          campaignId: true,
          invitedUserId: true,
          playerName: true,
          campaign: { select: { id: true } },
        },
      });

      if (!invite) {
        throw new Error("NOT_FOUND");
      }
      if (invite.invitedUserId !== userId) {
        throw new Error("FORBIDDEN");
      }
      if (!invite.campaign) {
        throw new Error("NOT_FOUND");
      }

      const existingMember = await tx.campaignUser.findUnique({
        where: {
          campaignId_userId: {
            campaignId: invite.campaignId,
            userId,
          },
        },
        select: { userId: true },
      });
      if (existingMember) {
        await tx.campaignInvite.delete({ where: { id: invite.id } });
        return { campaignId: invite.campaignId, alreadyMember: true };
      }

      await tx.campaignUser.create({
        data: {
          campaignId: invite.campaignId,
          userId,
          role: "PLAYER",
          playerName: invite.playerName ?? null,
          canManagePartyStash: false,
          allowHistoricCharacters: false,
        },
      });
      await tx.campaignInvite.delete({ where: { id: invite.id } });

      return { campaignId: invite.campaignId, alreadyMember: false };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    console.error("[CAMPAIGN_INVITE_ACCEPT]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
