import { NextResponse } from "next/server";

import { upsertUserProfileFromAuthUser } from "@/lib/auth/profile";
import { requireSupabaseUser } from "@/lib/auth/server";
import { prisma } from "@/prisma/client";

function roleLabel(role: "GAME_DIRECTOR" | "PLAYER") {
  return role === "GAME_DIRECTOR" ? "Game Director" : "Player";
}

export async function GET() {
  try {
    const user = await requireSupabaseUser();
    await upsertUserProfileFromAuthUser(user);

    const [memberships, invites] = await Promise.all([
      prisma.campaignUser.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          campaign: {
            select: {
              id: true,
              name: true,
              descriptorVersionTag: true,
            },
          },
        },
      }),
      prisma.campaignInvite.findMany({
        where: { invitedUserId: user.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          campaignId: true,
          invitedByUserId: true,
          createdAt: true,
          campaign: {
            select: {
              name: true,
              descriptorVersionTag: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      cards: [
        ...invites.map((invite) => ({
          kind: "pendingInvite" as const,
          inviteId: invite.id,
          campaignId: invite.campaignId,
          campaignName: invite.campaign.name,
          descriptorVersionTag: invite.campaign.descriptorVersionTag,
          statusLabel: "Invite Pending",
          invitedByNameOrEmail: null,
          createdAt: invite.createdAt.toISOString(),
        })),
        ...memberships.map((membership) => ({
          kind: "membership" as const,
          campaignId: membership.campaign.id,
          campaignName: membership.campaign.name,
          descriptorVersionTag: membership.campaign.descriptorVersionTag,
          role: membership.role,
          roleLabel: roleLabel(membership.role),
        })),
      ],
    });
  } catch (error) {
    if ((error as Error).message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DASHBOARD_CAMPAIGNS]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
