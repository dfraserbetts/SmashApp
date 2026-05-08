import { NextResponse } from "next/server";

import { prisma } from "@/prisma/client";
import { requireUserId } from "@/lib/auth/server";
import {
  getCampaignPermissions,
  requireCampaignAccess,
  requireCampaignGameDirector,
} from "@/lib/campaign/access";
import { getMemberIdentities, getMemberIdentityLabel } from "@/lib/campaign/memberIdentity";

type CampaignMemberPayload = {
  userId?: unknown;
  confirmation?: unknown;
  allowHistoricCharacters?: unknown;
};

function normalizeUserId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isLikelySupabaseUserId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toErrorResponse(error: unknown) {
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
  console.error("[CAMPAIGN_MEMBERS]", error);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

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
    const access = await requireCampaignAccess(campaignId, userId);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        ownerUserId: true,
        descriptorVersionTag: true,
        createdAt: true,
      },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const rows = await prisma.campaignUser.findMany({
      where: { campaignId },
      orderBy: { createdAt: "asc" },
      select: {
        userId: true,
        role: true,
        allowHistoricCharacters: true,
        createdAt: true,
      },
    });
    const identities = await getMemberIdentities([
      campaign.ownerUserId,
      ...rows.map((row) => row.userId),
    ]);
    const hasOwnerRow = rows.some((row) => row.userId === campaign.ownerUserId);
    const members = [
      ...(!hasOwnerRow
        ? [
            {
              userId: campaign.ownerUserId,
              email: identities.get(campaign.ownerUserId)?.email ?? null,
              identityLabel: getMemberIdentityLabel(identities.get(campaign.ownerUserId)),
              confirmationValue: getMemberIdentityLabel(identities.get(campaign.ownerUserId)),
              role: "GAME_DIRECTOR" as const,
              allowHistoricCharacters: false,
              createdAt: campaign.createdAt,
              isOwner: true,
              isSyntheticOwner: true,
            },
          ]
        : []),
      ...rows.map((row) => ({
        ...row,
        email: identities.get(row.userId)?.email ?? null,
        identityLabel: getMemberIdentityLabel(identities.get(row.userId)),
        confirmationValue: getMemberIdentityLabel(identities.get(row.userId)),
        isOwner: row.userId === campaign.ownerUserId,
        isSyntheticOwner: false,
      })),
    ];

    return NextResponse.json({
      campaign,
      access: {
        role: access.effectiveRole,
        isAdmin: access.isAdmin,
        isOwner: access.isOwner,
        permissions: getCampaignPermissions(access),
      },
      members,
      inviteMode: "manual_user_id",
      identityMode: "email_when_service_role_available_else_user_id",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
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

    const body = (await req.json().catch(() => ({}))) as CampaignMemberPayload;
    const targetUserId = normalizeUserId(body.userId);
    if (!targetUserId) {
      return NextResponse.json({ error: "Player userId is required" }, { status: 400 });
    }
    if (typeof body.allowHistoricCharacters !== "boolean") {
      return NextResponse.json(
        { error: "allowHistoricCharacters must be a boolean" },
        { status: 400 },
      );
    }

    const member = await prisma.campaignUser.findUnique({
      where: { campaignId_userId: { campaignId, userId: targetUserId } },
      select: { role: true },
    });
    if (!member || member.role !== "PLAYER") {
      return NextResponse.json(
        { error: "Historic character policy can only be changed for Player members" },
        { status: 400 },
      );
    }

    const updated = await prisma.campaignUser.update({
      where: { campaignId_userId: { campaignId, userId: targetUserId } },
      data: { allowHistoricCharacters: body.allowHistoricCharacters },
      select: {
        userId: true,
        role: true,
        allowHistoricCharacters: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, member: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
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

    const body = (await req.json().catch(() => ({}))) as CampaignMemberPayload;
    const targetUserId = normalizeUserId(body.userId);
    if (!targetUserId) {
      return NextResponse.json({ error: "Player userId is required" }, { status: 400 });
    }
    if (!isLikelySupabaseUserId(targetUserId)) {
      return NextResponse.json(
        { error: "Player userId must be a Supabase UUID" },
        { status: 400 },
      );
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { ownerUserId: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const role = targetUserId === campaign.ownerUserId ? "GAME_DIRECTOR" : "PLAYER";
    const member = await prisma.campaignUser.upsert({
      where: { campaignId_userId: { campaignId, userId: targetUserId } },
      update: { role },
      create: {
        campaignId,
        userId: targetUserId,
        role,
      },
      select: {
        userId: true,
        role: true,
        allowHistoricCharacters: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      member: {
        ...member,
        isOwner: member.userId === campaign.ownerUserId,
        isSyntheticOwner: false,
      },
      inviteMode: "manual_user_id",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
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

    const body = (await req.json().catch(() => ({}))) as CampaignMemberPayload;
    const targetUserId = normalizeUserId(body.userId);
    const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : "";
    if (!targetUserId) {
      return NextResponse.json({ error: "Player userId is required" }, { status: 400 });
    }

    const [campaign, member] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { ownerUserId: true },
      }),
      prisma.campaignUser.findUnique({
        where: { campaignId_userId: { campaignId, userId: targetUserId } },
        select: { userId: true, role: true },
      }),
    ]);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (!member || member.role !== "PLAYER") {
      return NextResponse.json(
        { error: "Only Player members can be removed from this flow" },
        { status: 400 },
      );
    }
    if (targetUserId === actorUserId) {
      return NextResponse.json(
        { error: "You cannot remove yourself from the campaign here" },
        { status: 400 },
      );
    }

    const identities = await getMemberIdentities([targetUserId]);
    const confirmationValue = getMemberIdentityLabel(identities.get(targetUserId)) || targetUserId;
    if (confirmation !== confirmationValue) {
      return NextResponse.json(
        { error: "Confirmation does not match the player identity" },
        { status: 400 },
      );
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.campaignCharacter.updateMany({
        where: {
          campaignId,
          assignedUserId: targetUserId,
        },
        data: {
          assignedUserId: null,
          archivedAt: now,
          archivedByUserId: actorUserId,
          archiveReason: "PLAYER_REMOVED",
        },
      }),
      prisma.campaignUser.delete({
        where: { campaignId_userId: { campaignId, userId: targetUserId } },
      }),
    ]);

    return NextResponse.json({ ok: true, archivedAssignedCharacters: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
