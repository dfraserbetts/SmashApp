import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import {
  getCampaignPermissions,
  requireCampaignAccess,
} from "@/lib/campaign/access";
import { prisma } from "@/prisma/client";

type BackpackPayload = {
  partyInventoryItemId?: unknown;
  quantity?: unknown;
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
  console.error("[CHARACTER_BACKPACK]", error);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

function normalizePositiveInteger(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function sumQuantity(rows: Array<{ quantity: number }>): number {
  return rows.reduce((total, row) => total + row.quantity, 0);
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
    const access = await requireCampaignAccess(campaignId, userId);
    const canManage = getCampaignPermissions(access).canManageCampaignInventory;

    const character = await prisma.campaignCharacter.findFirst({
      where: { id: targetCharacterId, campaignId },
      select: {
        id: true,
        name: true,
        assignedUserId: true,
        archivedAt: true,
      },
    });
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    if (!canManage && (character.assignedUserId !== userId || character.archivedAt)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const backpackItems = await prisma.campaignCharacterBackpackItem.findMany({
      where: {
        campaignId,
        characterId: targetCharacterId,
      },
      orderBy: { createdAt: "asc" },
      include: {
        partyInventoryItem: {
          include: {
            itemTemplate: {
              select: {
                id: true,
                name: true,
                rarity: true,
                level: true,
                type: true,
                size: true,
                armorLocation: true,
                itemLocation: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      character,
      backpackItems,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
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
    const access = await requireCampaignAccess(campaignId, userId);
    const permissions = getCampaignPermissions(access);
    if (!permissions.canManagePartyStash) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as BackpackPayload;
    const partyInventoryItemId =
      typeof body.partyInventoryItemId === "string" ? body.partyInventoryItemId.trim() : "";
    const quantity = normalizePositiveInteger(body.quantity);
    if (!partyInventoryItemId || quantity === null) {
      return NextResponse.json(
        { error: "partyInventoryItemId and a positive integer quantity are required" },
        { status: 400 },
      );
    }

    const [character, partyItem] = await Promise.all([
      prisma.campaignCharacter.findFirst({
        where: { id: targetCharacterId, campaignId },
        select: { id: true, archivedAt: true },
      }),
      prisma.campaignPartyInventoryItem.findFirst({
        where: { id: partyInventoryItemId, campaignId },
        include: {
          backpackItems: {
            select: { quantity: true },
          },
        },
      }),
    ]);

    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (character.archivedAt) {
      return NextResponse.json(
        { error: "Archived characters cannot receive Party Stash assignments" },
        { status: 400 },
      );
    }
    if (!partyItem) {
      return NextResponse.json({ error: "Party inventory item not found" }, { status: 404 });
    }

    const assignedQuantity = sumQuantity(partyItem.backpackItems);
    const availableQuantity = partyItem.quantity - assignedQuantity;
    if (quantity > availableQuantity) {
      return NextResponse.json(
        { error: `Only ${Math.max(0, availableQuantity)} available to assign.` },
        { status: 400 },
      );
    }

    const backpackItem = await prisma.campaignCharacterBackpackItem.upsert({
      where: {
        characterId_partyInventoryItemId: {
          characterId: targetCharacterId,
          partyInventoryItemId,
        },
      },
      update: {
        quantity: { increment: quantity },
      },
      create: {
        campaignId,
        characterId: targetCharacterId,
        partyInventoryItemId,
        quantity,
      },
      select: {
        id: true,
        quantity: true,
        characterId: true,
        partyInventoryItemId: true,
      },
    });

    return NextResponse.json({ ok: true, backpackItem });
  } catch (error) {
    return toErrorResponse(error);
  }
}
