import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import { requireCampaignGameDirector } from "@/lib/campaign/access";
import { prisma } from "@/prisma/client";

type BackpackUpdatePayload = {
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
    return NextResponse.json({ error: "Campaign, character, or backpack item not found" }, { status: 404 });
  }
  console.error("[CHARACTER_BACKPACK_ITEM]", error);
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

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; characterId: string; backpackItemId: string }> },
) {
  try {
    const { id, characterId, backpackItemId } = await context.params;
    const campaignId = String(id ?? "").trim();
    const targetCharacterId = String(characterId ?? "").trim();
    const targetBackpackItemId = String(backpackItemId ?? "").trim();
    if (!campaignId || !targetCharacterId || !targetBackpackItemId) {
      return NextResponse.json(
        { error: "Campaign id, character id, and backpack item id are required" },
        { status: 400 },
      );
    }

    const userId = await requireUserId();
    await requireCampaignGameDirector(campaignId, userId);

    const body = (await req.json().catch(() => ({}))) as BackpackUpdatePayload;
    const quantity = normalizePositiveInteger(body.quantity);
    if (quantity === null) {
      return NextResponse.json({ error: "A positive integer quantity is required" }, { status: 400 });
    }

    const existing = await prisma.campaignCharacterBackpackItem.findFirst({
      where: {
        id: targetBackpackItemId,
        campaignId,
        characterId: targetCharacterId,
      },
      include: {
        partyInventoryItem: {
          include: {
            backpackItems: {
              select: { id: true, quantity: true },
            },
          },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Backpack item not found" }, { status: 404 });
    }

    const otherAssignedQuantity = sumQuantity(
      existing.partyInventoryItem.backpackItems.filter((row) => row.id !== existing.id),
    );
    if (otherAssignedQuantity + quantity > existing.partyInventoryItem.quantity) {
      return NextResponse.json(
        {
          error: `Only ${Math.max(
            0,
            existing.partyInventoryItem.quantity - otherAssignedQuantity,
          )} can be assigned to this backpack.`,
        },
        { status: 400 },
      );
    }

    const backpackItem = await prisma.campaignCharacterBackpackItem.update({
      where: { id: targetBackpackItemId },
      data: { quantity },
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

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; characterId: string; backpackItemId: string }> },
) {
  try {
    const { id, characterId, backpackItemId } = await context.params;
    const campaignId = String(id ?? "").trim();
    const targetCharacterId = String(characterId ?? "").trim();
    const targetBackpackItemId = String(backpackItemId ?? "").trim();
    if (!campaignId || !targetCharacterId || !targetBackpackItemId) {
      return NextResponse.json(
        { error: "Campaign id, character id, and backpack item id are required" },
        { status: 400 },
      );
    }

    const userId = await requireUserId();
    await requireCampaignGameDirector(campaignId, userId);

    const existing = await prisma.campaignCharacterBackpackItem.findFirst({
      where: {
        id: targetBackpackItemId,
        campaignId,
        characterId: targetCharacterId,
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Backpack item not found" }, { status: 404 });
    }

    await prisma.campaignCharacterBackpackItem.delete({
      where: { id: targetBackpackItemId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
