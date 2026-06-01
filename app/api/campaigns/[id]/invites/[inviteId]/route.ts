import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import { requireCampaignGameDirector } from "@/lib/campaign/access";
import { prisma } from "@/prisma/client";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; inviteId: string }> },
) {
  try {
    const { id, inviteId } = await context.params;
    const campaignId = String(id ?? "").trim();
    const pendingInviteId = String(inviteId ?? "").trim();

    if (!campaignId) {
      return NextResponse.json({ error: "Campaign id is required" }, { status: 400 });
    }
    if (!pendingInviteId) {
      return NextResponse.json({ error: "Invite id is required" }, { status: 400 });
    }

    const actorUserId = await requireUserId();
    await requireCampaignGameDirector(campaignId, actorUserId);

    const invite = await prisma.campaignInvite.findUnique({
      where: { id: pendingInviteId },
      select: { id: true, campaignId: true },
    });

    if (!invite || invite.campaignId !== campaignId) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    await prisma.campaignInvite.delete({
      where: { id: invite.id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    console.error("[CAMPAIGN_INVITE_CANCEL]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
