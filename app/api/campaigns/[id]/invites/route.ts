import { NextResponse } from "next/server";

import { findUserProfileByEmail, normalizeEmail } from "@/lib/auth/profile";
import { requireUserId } from "@/lib/auth/server";
import { requireCampaignGameDirector } from "@/lib/campaign/access";
import { getAppBaseUrl, sendEmail } from "@/lib/email/sendEmail";
import { prisma } from "@/prisma/client";

type InviteBody = {
  email?: unknown;
  playerName?: unknown;
};

function normalizeOptionalName(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toInvitePayload(invite: {
  id: string;
  campaignId: string;
  invitedEmail: string;
  invitedEmailNormalized: string;
  invitedUserId: string;
  playerName: string | null;
  emailDeliveryStatus: string | null;
  createdAt: Date;
  emailSentAt: Date | null;
}) {
  return {
    id: invite.id,
    campaignId: invite.campaignId,
    invitedEmail: invite.invitedEmail,
    invitedEmailNormalized: invite.invitedEmailNormalized,
    invitedUserId: invite.invitedUserId,
    playerName: invite.playerName,
    emailDeliveryStatus: invite.emailDeliveryStatus,
    createdAt: invite.createdAt.toISOString(),
    emailSentAt: invite.emailSentAt?.toISOString() ?? null,
  };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const campaignId = String(id ?? "").trim();
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign id is required" }, { status: 400 });
    }

    const actorUserId = await requireUserId();
    await requireCampaignGameDirector(campaignId, actorUserId);

    const body = (await req.json().catch(() => ({}))) as InviteBody;
    const invitedEmail = typeof body.email === "string" ? body.email.trim() : "";
    const invitedEmailNormalized = normalizeEmail(invitedEmail);
    const playerName = normalizeOptionalName(body.playerName);

    if (!invitedEmailNormalized || !isValidEmail(invitedEmailNormalized)) {
      return NextResponse.json({ error: "A valid player email is required" }, { status: 400 });
    }
    if (body.playerName !== undefined && body.playerName !== null && playerName === null) {
      return NextResponse.json({ error: "playerName must be text" }, { status: 400 });
    }
    if (playerName && playerName.length > 120) {
      return NextResponse.json({ error: "Player Name is too long" }, { status: 400 });
    }

    const [campaign, targetProfile] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, name: true, ownerUserId: true },
      }),
      findUserProfileByEmail(invitedEmailNormalized),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (!targetProfile) {
      return NextResponse.json(
        {
          code: "ACCOUNT_NOT_FOUND",
          error: "Account not found",
          invitedEmailNormalized,
        },
        { status: 409 },
      );
    }

    if (targetProfile.userId === campaign.ownerUserId) {
      return NextResponse.json(
        { code: "OWNER_CANNOT_BE_INVITED", error: "Campaign owner is already a member" },
        { status: 409 },
      );
    }

    const existingMember = await prisma.campaignUser.findUnique({
      where: { campaignId_userId: { campaignId, userId: targetProfile.userId } },
      select: { userId: true },
    });
    if (existingMember) {
      return NextResponse.json(
        { code: "ALREADY_MEMBER", error: "That player is already a campaign member" },
        { status: 409 },
      );
    }

    const existingInvite = await prisma.campaignInvite.findUnique({
      where: {
        campaignId_invitedUserId: {
          campaignId,
          invitedUserId: targetProfile.userId,
        },
      },
      select: {
        id: true,
        campaignId: true,
        invitedEmail: true,
        invitedEmailNormalized: true,
        invitedUserId: true,
        playerName: true,
        emailDeliveryStatus: true,
        createdAt: true,
        emailSentAt: true,
      },
    });
    if (existingInvite) {
      return NextResponse.json({
        ok: true,
        code: "INVITE_ALREADY_PENDING",
        invite: toInvitePayload(existingInvite),
      });
    }

    const invite = await prisma.campaignInvite.create({
      data: {
        campaignId,
        invitedEmail,
        invitedEmailNormalized,
        invitedUserId: targetProfile.userId,
        invitedByUserId: actorUserId,
        playerName,
      },
      select: {
        id: true,
        campaignId: true,
        invitedEmail: true,
        invitedEmailNormalized: true,
        invitedUserId: true,
        playerName: true,
        emailDeliveryStatus: true,
        createdAt: true,
        emailSentAt: true,
      },
    });

    const inviteUrl = `${getAppBaseUrl()}/campaign-invites/${encodeURIComponent(invite.id)}`;
    const emailDelivery = await sendEmail({
      to: invitedEmail,
      subject: `You have been invited to ${campaign.name}`,
      text: [
        `You have been invited to ${campaign.name}.`,
        "",
        `Open your campaign invite: ${inviteUrl}`,
      ].join("\n"),
    });

    const updatedInvite = await prisma.campaignInvite.update({
      where: { id: invite.id },
      data: {
        emailDeliveryStatus: emailDelivery.status,
        emailSentAt: emailDelivery.sent || emailDelivery.logged ? new Date() : null,
      },
      select: {
        id: true,
        campaignId: true,
        invitedEmail: true,
        invitedEmailNormalized: true,
        invitedUserId: true,
        playerName: true,
        emailDeliveryStatus: true,
        createdAt: true,
        emailSentAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      code: "INVITE_CREATED",
      invite: toInvitePayload(updatedInvite),
      emailDeliveryStatus: emailDelivery,
    });
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
    console.error("[CAMPAIGN_INVITES_CREATE]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
