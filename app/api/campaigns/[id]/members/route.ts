import { NextResponse } from "next/server";

import { prisma } from "@/prisma/client";
import { requireUserId } from "@/lib/auth/server";
import {
  getCampaignPermissions,
  requireCampaignAccess,
  requireCampaignGameDirector,
} from "@/lib/campaign/access";
import { getMemberIdentities } from "@/lib/campaign/memberIdentity";

type CampaignMemberPayload = {
  userId?: unknown;
  playerName?: unknown;
  confirmation?: unknown;
  allowHistoricCharacters?: unknown;
  canManagePartyStash?: unknown;
};

function normalizeUserId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePlayerName(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getVisibleMemberLabel(args: {
  userId: string;
  playerName: string | null;
  email: string | null;
  canViewEmail: boolean;
  role: "GAME_DIRECTOR" | "PLAYER";
}) {
  const playerName = args.playerName?.trim();
  if (playerName) {
    return args.canViewEmail && args.email ? `${playerName} (${args.email})` : playerName;
  }
  if (args.canViewEmail && args.email) return args.email;
  if (args.canViewEmail) return args.userId;
  return args.role === "GAME_DIRECTOR" ? "Game Director" : "Player";
}

function getConfirmationValue(args: {
  userId: string;
  playerName: string | null;
  email: string | null;
}) {
  return args.email ?? args.playerName?.trim() ?? args.userId;
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
    const permissions = getCampaignPermissions(access);
    const canViewEmail = permissions.canManageCampaign;

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
        playerName: true,
        role: true,
        canManagePartyStash: true,
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
              playerName: null,
              userId: campaign.ownerUserId,
              email: canViewEmail ? identities.get(campaign.ownerUserId)?.email ?? null : null,
              identityLabel: getVisibleMemberLabel({
                userId: campaign.ownerUserId,
                playerName: null,
                email: identities.get(campaign.ownerUserId)?.email ?? null,
                canViewEmail,
                role: "GAME_DIRECTOR",
              }),
              confirmationValue: getConfirmationValue({
                userId: campaign.ownerUserId,
                playerName: null,
                email: identities.get(campaign.ownerUserId)?.email ?? null,
              }),
              role: "GAME_DIRECTOR" as const,
              canManagePartyStash: false,
              allowHistoricCharacters: false,
              createdAt: campaign.createdAt,
              isOwner: true,
              isSyntheticOwner: true,
            },
          ]
        : []),
      ...rows.map((row) => ({
        ...row,
        email: canViewEmail ? identities.get(row.userId)?.email ?? null : null,
        identityLabel: getVisibleMemberLabel({
          userId: row.userId,
          playerName: row.playerName,
          email: identities.get(row.userId)?.email ?? null,
          canViewEmail,
          role: row.role,
        }),
        confirmationValue: getConfirmationValue({
          userId: row.userId,
          playerName: row.playerName,
          email: identities.get(row.userId)?.email ?? null,
        }),
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
        permissions,
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
    const playerName = normalizePlayerName(body.playerName);
    if (body.playerName !== undefined && playerName === null) {
      return NextResponse.json({ error: "playerName must be text" }, { status: 400 });
    }
    if (typeof playerName === "string" && playerName.length > 120) {
      return NextResponse.json({ error: "Player Name is too long" }, { status: 400 });
    }
    if (
      body.allowHistoricCharacters !== undefined &&
      typeof body.allowHistoricCharacters !== "boolean"
    ) {
      return NextResponse.json(
        { error: "allowHistoricCharacters must be a boolean" },
        { status: 400 },
      );
    }
    if (body.canManagePartyStash !== undefined && typeof body.canManagePartyStash !== "boolean") {
      return NextResponse.json(
        { error: "canManagePartyStash must be a boolean" },
        { status: 400 },
      );
    }

    const [campaign, member] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { ownerUserId: true },
      }),
      prisma.campaignUser.findUnique({
        where: { campaignId_userId: { campaignId, userId: targetUserId } },
        select: { role: true },
      }),
    ]);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const targetIsOwner = targetUserId === campaign.ownerUserId;
    const effectiveRole = targetIsOwner ? "GAME_DIRECTOR" : member?.role;
    if (!effectiveRole) {
      return NextResponse.json({ error: "Campaign member not found" }, { status: 404 });
    }
    if (body.allowHistoricCharacters !== undefined && effectiveRole !== "PLAYER") {
      return NextResponse.json(
        { error: "Historic character policy can only be changed for Player members" },
        { status: 400 },
      );
    }
    if (body.canManagePartyStash !== undefined && effectiveRole !== "PLAYER") {
      return NextResponse.json(
        { error: "Party Stash management can only be delegated to Player members" },
        { status: 400 },
      );
    }

    const data: {
      playerName?: string | null;
      allowHistoricCharacters?: boolean;
      canManagePartyStash?: boolean;
    } = {};
    if (playerName !== undefined) data.playerName = playerName;
    if (typeof body.allowHistoricCharacters === "boolean") {
      data.allowHistoricCharacters = body.allowHistoricCharacters;
    }
    if (typeof body.canManagePartyStash === "boolean") {
      data.canManagePartyStash = body.canManagePartyStash;
    }

    const memberSelect = {
      userId: true,
      playerName: true,
      role: true,
      canManagePartyStash: true,
      allowHistoricCharacters: true,
      createdAt: true,
    } as const;
    const updated = member
      ? await prisma.campaignUser.update({
          where: { campaignId_userId: { campaignId, userId: targetUserId } },
          data: {
            ...data,
            ...(targetIsOwner ? { role: "GAME_DIRECTOR" as const } : {}),
          },
          select: memberSelect,
        })
      : await prisma.campaignUser.create({
          data: {
            campaignId,
            userId: targetUserId,
            role: "GAME_DIRECTOR",
            playerName: data.playerName ?? null,
            canManagePartyStash: false,
          },
          select: memberSelect,
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
    const playerName = normalizePlayerName(body.playerName);
    if (!targetUserId) {
      return NextResponse.json({ error: "Player userId is required" }, { status: 400 });
    }
    if (body.playerName !== undefined && playerName === null) {
      return NextResponse.json({ error: "playerName must be text" }, { status: 400 });
    }
    if (typeof playerName === "string" && playerName.length > 120) {
      return NextResponse.json({ error: "Player Name is too long" }, { status: 400 });
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
      update: { role, ...(playerName !== undefined ? { playerName } : {}) },
      create: {
        campaignId,
        userId: targetUserId,
        role,
        playerName,
        canManagePartyStash: false,
      },
      select: {
        userId: true,
        playerName: true,
        role: true,
        canManagePartyStash: true,
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
        select: { userId: true, playerName: true, role: true },
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
    const confirmationValue = getConfirmationValue({
      userId: targetUserId,
      playerName: member.playerName,
      email: identities.get(targetUserId)?.email ?? null,
    });
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
