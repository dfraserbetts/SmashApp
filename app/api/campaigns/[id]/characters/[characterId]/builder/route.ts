import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import {
  getCampaignPermissions,
  requireCampaignAccess,
} from "@/lib/campaign/access";
import { getMemberIdentities, getMemberIdentityLabel } from "@/lib/campaign/memberIdentity";
import { prisma } from "@/prisma/client";

const DEFAULT_CHARACTER_NAME = "UNNAMED";

type BuilderPayload = {
  name?: unknown;
  imageUrl?: unknown;
  age?: unknown;
  race?: unknown;
  description?: unknown;
  level?: unknown;
};

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
  console.error("[CHARACTER_BUILDER]", error);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

function normalizeDisplayName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return DEFAULT_CHARACTER_NAME;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_CHARACTER_NAME;
}

function normalizeOptionalString(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeLevel(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) return 1;
  return numeric;
}

async function loadBuilderContext(campaignId: string, characterId: string, userId: string) {
  const access = await requireCampaignAccess(campaignId, userId);
  const [campaign, character] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true },
    }),
    prisma.campaignCharacter.findFirst({
      where: { id: characterId, campaignId },
      select: {
        id: true,
        campaignId: true,
        name: true,
        imageUrl: true,
        age: true,
        race: true,
        description: true,
        level: true,
        assignedUserId: true,
        archivedAt: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  if (!campaign || !character) return null;

  const permissions = getCampaignPermissions(access);
  const isAssignedActivePlayer =
    character.assignedUserId === userId && character.archivedAt === null;
  const canManage = permissions.canManageCampaignCharacters;
  const canOpenBuilder = canManage || isAssignedActivePlayer;
  if (!canOpenBuilder) {
    throw new Error("FORBIDDEN");
  }

  const identities = character.assignedUserId
    ? await getMemberIdentities([character.assignedUserId])
    : new Map();
  const assignedIdentity = character.assignedUserId
    ? identities.get(character.assignedUserId)
    : undefined;

  return {
    campaign,
    character,
    access: {
      userId,
      role: access.effectiveRole,
      isAdmin: access.isAdmin,
      isOwner: access.isOwner,
      permissions,
    },
    canEdit: canManage || isAssignedActivePlayer,
    assignedPlayerLabel: getMemberIdentityLabel(assignedIdentity),
  };
}

export async function GET(
  _req: Request,
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
    const builderContext = await loadBuilderContext(campaignId, targetCharacterId, userId);
    if (!builderContext) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    return NextResponse.json(builderContext);
  } catch (error) {
    return toErrorResponse(error);
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
    const builderContext = await loadBuilderContext(campaignId, targetCharacterId, userId);
    if (!builderContext) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (!builderContext.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as BuilderPayload;
    const name = normalizeDisplayName(body.name);
    const imageUrl = normalizeOptionalString(body.imageUrl, 500);
    const age = normalizeOptionalString(body.age, 80);
    const race = normalizeOptionalString(body.race, 120);
    const description = normalizeOptionalString(body.description, 4000);
    const level = normalizeLevel(body.level);

    const data: {
      name?: string;
      imageUrl?: string | null;
      age?: string | null;
      race?: string | null;
      description?: string | null;
      level?: number;
    } = {};
    if (name !== undefined) data.name = name.slice(0, 120);
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (age !== undefined) data.age = age;
    if (race !== undefined) data.race = race;
    if (description !== undefined) data.description = description;
    if (level !== undefined) data.level = level;

    const character = await prisma.campaignCharacter.update({
      where: { id: targetCharacterId },
      data,
      select: {
        id: true,
        campaignId: true,
        name: true,
        imageUrl: true,
        age: true,
        race: true,
        description: true,
        level: true,
        assignedUserId: true,
        archivedAt: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, character });
  } catch (error) {
    return toErrorResponse(error);
  }
}
