import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import { requireCampaignGameDirector } from "@/lib/campaign/access";
import { prisma } from "@/prisma/client";

type PartyInventoryUpdatePayload = {
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
    return NextResponse.json({ error: "Campaign or inventory item not found" }, { status: 404 });
  }
  console.error("[PARTY_INVENTORY_ITEM]", error);
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
  context: { params: Promise<{ id: string; partyInventoryItemId: string }> },
) {
  try {
    const { id, partyInventoryItemId } = await context.params;
    const campaignId = String(id ?? "").trim();
    const targetItemId = String(partyInventoryItemId ?? "").trim();
    if (!campaignId || !targetItemId) {
      return NextResponse.json(
        { error: "Campaign id and inventory item id are required" },
        { status: 400 },
      );
    }

    const userId = await requireUserId();
    await requireCampaignGameDirector(campaignId, userId);

    const body = (await req.json().catch(() => ({}))) as PartyInventoryUpdatePayload;
    const quantity = normalizePositiveInteger(body.quantity);
    if (quantity === null) {
      return NextResponse.json({ error: "A positive integer quantity is required" }, { status: 400 });
    }

    const existing = await prisma.campaignPartyInventoryItem.findFirst({
      where: { id: targetItemId, campaignId },
      include: {
        backpackItems: {
          select: { quantity: true },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    const assignedQuantity = sumQuantity(existing.backpackItems);
    if (quantity < assignedQuantity) {
      return NextResponse.json(
        {
          error: `Quantity cannot be lower than the ${assignedQuantity} already assigned to character backpacks.`,
        },
        { status: 400 },
      );
    }

    const item = await prisma.campaignPartyInventoryItem.update({
      where: { id: targetItemId },
      data: { quantity },
      select: { id: true, quantity: true },
    });

    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; partyInventoryItemId: string }> },
) {
  try {
    const { id, partyInventoryItemId } = await context.params;
    const campaignId = String(id ?? "").trim();
    const targetItemId = String(partyInventoryItemId ?? "").trim();
    if (!campaignId || !targetItemId) {
      return NextResponse.json(
        { error: "Campaign id and inventory item id are required" },
        { status: 400 },
      );
    }

    const userId = await requireUserId();
    await requireCampaignGameDirector(campaignId, userId);

    const existing = await prisma.campaignPartyInventoryItem.findFirst({
      where: { id: targetItemId, campaignId },
      include: {
        backpackItems: {
          select: { quantity: true },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    const assignedQuantity = sumQuantity(existing.backpackItems);
    if (assignedQuantity > 0) {
      return NextResponse.json(
        { error: "Remove character backpack assignments before removing this party inventory item." },
        { status: 400 },
      );
    }

    await prisma.campaignPartyInventoryItem.delete({
      where: { id: targetItemId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
