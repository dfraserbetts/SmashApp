import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import {
  getCampaignPermissions,
  requireCampaignAccess,
  requireCampaignGameDirector,
} from "@/lib/campaign/access";
import { prisma } from "@/prisma/client";

type CharacterPayload = {
  name?: unknown;
  assignedUserId?: unknown;
};

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAssignedUserId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  console.error("[CAMPAIGN_CHARACTERS]", error);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

async function validateAssignedPlayer(campaignId: string, assignedUserId: string | null) {
  if (!assignedUserId) return null;

  const member = await prisma.campaignUser.findUnique({
    where: { campaignId_userId: { campaignId, userId: assignedUserId } },
    select: { userId: true, role: true },
  });

  if (!member || member.role !== "PLAYER") {
    throw new Error("INVALID_ASSIGNED_PLAYER");
  }

  return assignedUserId;
}

async function getPlayerMembers(campaignId: string) {
  return prisma.campaignUser.findMany({
    where: {
      campaignId,
      role: "PLAYER",
    },
    orderBy: { createdAt: "asc" },
    select: {
      userId: true,
      role: true,
      createdAt: true,
    },
  });
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

    const [campaign, characters, playerMembers] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          name: true,
          ownerUserId: true,
          descriptorVersionTag: true,
        },
      }),
      prisma.campaignCharacter.findMany({
        where: { campaignId },
        orderBy: [{ createdAt: "asc" }, { name: "asc" }],
        select: {
          id: true,
          campaignId: true,
          name: true,
          assignedUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      getPlayerMembers(campaignId),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({
      campaign,
      access: {
        userId,
        role: access.effectiveRole,
        isAdmin: access.isAdmin,
        isOwner: access.isOwner,
        permissions: getCampaignPermissions(access),
      },
      characters,
      playerMembers,
      bondsMode: "future_game_director_assigned",
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

    const userId = await requireUserId();
    await requireCampaignGameDirector(campaignId, userId);

    const body = (await req.json().catch(() => ({}))) as CharacterPayload;
    const name = normalizeName(body.name);
    if (!name) {
      return NextResponse.json({ error: "Character name is required" }, { status: 400 });
    }
    if (name.length > 120) {
      return NextResponse.json({ error: "Character name is too long" }, { status: 400 });
    }

    const assignedUserId = normalizeAssignedUserId(body.assignedUserId);
    try {
      await validateAssignedPlayer(campaignId, assignedUserId);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_ASSIGNED_PLAYER") {
        return NextResponse.json(
          { error: "Assigned user must be an existing Player member of this campaign" },
          { status: 400 },
        );
      }
      throw error;
    }

    const character = await prisma.campaignCharacter.create({
      data: {
        campaignId,
        name,
        assignedUserId,
      },
      select: {
        id: true,
        campaignId: true,
        name: true,
        assignedUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, character });
  } catch (error) {
    return toErrorResponse(error);
  }
}
