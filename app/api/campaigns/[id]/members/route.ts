import { NextResponse } from "next/server";

import { prisma } from "@/prisma/client";
import { requireUserId } from "@/lib/auth/server";
import {
  getCampaignPermissions,
  requireCampaignAccess,
  requireCampaignGameDirector,
} from "@/lib/campaign/access";

type CampaignMemberPayload = {
  userId?: unknown;
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
        createdAt: true,
      },
    });
    const hasOwnerRow = rows.some((row) => row.userId === campaign.ownerUserId);
    const members = [
      ...(!hasOwnerRow
        ? [
            {
              userId: campaign.ownerUserId,
              role: "GAME_DIRECTOR" as const,
              createdAt: campaign.createdAt,
              isOwner: true,
              isSyntheticOwner: true,
            },
          ]
        : []),
      ...rows.map((row) => ({
        ...row,
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
    });
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

