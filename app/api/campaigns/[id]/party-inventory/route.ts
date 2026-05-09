import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import {
  getCampaignPermissions,
  requireCampaignAccess,
  requireCampaignGameDirector,
} from "@/lib/campaign/access";
import { prisma } from "@/prisma/client";

type PartyInventoryPayload = {
  itemTemplateId?: unknown;
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
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  console.error("[PARTY_INVENTORY]", error);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

function normalizePositiveInteger(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function summarizeAssignedQuantity(
  backpackItems: Array<{ quantity: number }>,
): number {
  return backpackItems.reduce((sum, row) => sum + row.quantity, 0);
}

function withTagStrings<T extends { tags?: Array<{ tag: string }> }>(
  row: T,
): Omit<T, "tags"> & { tags: string[] } {
  const tags = Array.isArray(row.tags) ? row.tags.map((entry) => entry.tag) : [];
  return {
    ...(row as Omit<T, "tags">),
    tags,
  };
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
    const isManager = permissions.canManageCampaignInventory;
    const canAssignPartyStash = permissions.canManagePartyStash;

    const [campaign, rawPartyItems, itemTemplates, characters] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, name: true },
      }),
      prisma.campaignPartyInventoryItem.findMany({
        where: { campaignId },
        orderBy: { createdAt: "asc" },
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
              tags: {
                select: { tag: true },
                orderBy: { tag: "asc" },
              },
            },
          },
          backpackItems: {
            include: {
              character: {
                select: {
                  id: true,
                  name: true,
                  assignedUserId: true,
                  archivedAt: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      isManager
        ? prisma.itemTemplate.findMany({
            where: { campaignId },
            orderBy: [{ name: "asc" }],
            select: {
              id: true,
              name: true,
              rarity: true,
              level: true,
              type: true,
              size: true,
              armorLocation: true,
              itemLocation: true,
              tags: {
                select: { tag: true },
                orderBy: { tag: "asc" },
              },
            },
          })
        : Promise.resolve([]),
      canAssignPartyStash
        ? prisma.campaignCharacter.findMany({
            where: isManager ? { campaignId } : { campaignId, archivedAt: null },
            orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              name: true,
              assignedUserId: true,
              archivedAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const partyItems = rawPartyItems.map((row) => {
      const assignedQuantity = summarizeAssignedQuantity(row.backpackItems);
      const availableQuantity = Math.max(0, row.quantity - assignedQuantity);
      return {
        id: row.id,
        campaignId: row.campaignId,
        itemTemplateId: row.itemTemplateId,
        quantity: isManager ? row.quantity : availableQuantity,
        assignedQuantity: isManager ? assignedQuantity : 0,
        availableQuantity,
        itemTemplate: withTagStrings(row.itemTemplate),
        backpackItems: isManager ? row.backpackItems : [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }).filter((item) => isManager || item.availableQuantity > 0);

    return NextResponse.json({
      campaign,
      access: {
        userId,
        role: access.effectiveRole,
        permissions,
      },
      itemTemplates: itemTemplates.map((item) => withTagStrings(item)),
      partyItems,
      characters,
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

    const body = (await req.json().catch(() => ({}))) as PartyInventoryPayload;
    const itemTemplateId = typeof body.itemTemplateId === "string" ? body.itemTemplateId.trim() : "";
    const quantity = normalizePositiveInteger(body.quantity);
    if (!itemTemplateId || quantity === null) {
      return NextResponse.json(
        { error: "itemTemplateId and a positive integer quantity are required" },
        { status: 400 },
      );
    }

    const template = await prisma.itemTemplate.findFirst({
      where: { id: itemTemplateId, campaignId },
      select: { id: true },
    });
    if (!template) {
      return NextResponse.json({ error: "Item template not found in campaign" }, { status: 404 });
    }

    const item = await prisma.campaignPartyInventoryItem.upsert({
      where: {
        campaignId_itemTemplateId: {
          campaignId,
          itemTemplateId,
        },
      },
      update: {
        quantity: { increment: quantity },
      },
      create: {
        campaignId,
        itemTemplateId,
        quantity,
      },
      select: {
        id: true,
        quantity: true,
      },
    });

    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return toErrorResponse(error);
  }
}
