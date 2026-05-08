import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import { requireCampaignGameDirector } from "@/lib/campaign/access";
import { prisma } from "@/prisma/client";

type CharacterUpdatePayload = {
  name?: unknown;
  assignedUserId?: unknown;
};

function normalizeName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAssignedUserId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
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
    return NextResponse.json({ error: "Campaign or character not found" }, { status: 404 });
  }
  console.error("[CAMPAIGN_CHARACTER]", error);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

async function assertAssignedPlayer(campaignId: string, assignedUserId: string | null | undefined) {
  if (assignedUserId === undefined || assignedUserId === null) return;

  const member = await prisma.campaignUser.findUnique({
    where: { campaignId_userId: { campaignId, userId: assignedUserId } },
    select: { role: true },
  });

  if (!member || member.role !== "PLAYER") {
    throw new Error("INVALID_ASSIGNED_PLAYER");
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; characterId: string }> },
) {
  try {
    const { id, characterId } = await context.params;
    const campaignId = String(id ?? "").trim();
    const targetCharacterId = String(characterId ?? "").trim();
    if (!campaignId || !targetCharacterId) {
      return NextResponse.json(
        { error: "Campaign id and character id are required" },
        { status: 400 },
      );
    }

    const userId = await requireUserId();
    await requireCampaignGameDirector(campaignId, userId);

    const existing = await prisma.campaignCharacter.findFirst({
      where: {
        id: targetCharacterId,
        campaignId,
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as CharacterUpdatePayload;
    const name = normalizeName(body.name);
    if (name !== undefined && !name) {
      return NextResponse.json({ error: "Character name is required" }, { status: 400 });
    }
    if (name && name.length > 120) {
      return NextResponse.json({ error: "Character name is too long" }, { status: 400 });
    }

    const assignedUserId = normalizeAssignedUserId(body.assignedUserId);
    try {
      await assertAssignedPlayer(campaignId, assignedUserId);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_ASSIGNED_PLAYER") {
        return NextResponse.json(
          { error: "Assigned user must be an existing Player member of this campaign" },
          { status: 400 },
        );
      }
      throw error;
    }

    const data: {
      name?: string;
      assignedUserId?: string | null;
    } = {};
    if (name !== undefined) data.name = name;
    if (assignedUserId !== undefined) data.assignedUserId = assignedUserId;

    const character = await prisma.campaignCharacter.update({
      where: { id: targetCharacterId },
      data,
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
