import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import { prisma } from "@/prisma/client";

function playerLabel(member: { playerName: string | null; role: "GAME_DIRECTOR" | "PLAYER" }) {
  const name = member.playerName?.trim();
  if (name) return name;
  return member.role === "GAME_DIRECTOR" ? "Game Director" : "Player";
}

export async function GET(
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
    const invite = await prisma.campaignInvite.findUnique({
      where: { id },
      select: {
        id: true,
        campaignId: true,
        invitedUserId: true,
        playerName: true,
        createdAt: true,
        campaign: {
          select: {
            name: true,
            members: {
              orderBy: { createdAt: "asc" },
              select: {
                playerName: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    if (invite.invitedUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      invite: {
        id: invite.id,
        campaignId: invite.campaignId,
        campaignName: invite.campaign.name,
        playerName: invite.playerName,
        createdAt: invite.createdAt.toISOString(),
      },
      currentPlayers: invite.campaign.members.map((member) => ({
        playerNameOrLabel: playerLabel(member),
      })),
    });
  } catch (error) {
    if ((error as Error).message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[CAMPAIGN_INVITE_DETAIL]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
