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
    const invite = await prisma.campaignInvite.findUnique({
      where: { id },
      select: { id: true, invitedUserId: true },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    if (invite.invitedUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.campaignInvite.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[CAMPAIGN_INVITE_REJECT]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
