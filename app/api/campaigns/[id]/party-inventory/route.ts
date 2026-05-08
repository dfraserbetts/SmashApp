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

    const [campaign, rawPartyItems, itemTemplates, characters] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, name: true },
      }),
      prisma.campaignPartyInventoryItem.findMany({
        where: isManager
          ? { campaignId }
          : {
              campaignId,
              backpackItems: {
                some: {
                  character: {
                    assignedUserId: userId,
                    archivedAt: null,
                  },
                },
              },
            },
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
            },
          },
          backpackItems: {
            where: isManager
              ? {}
              : {
                  character: {
                    assignedUserId: userId,
                    archivedAt: null,
                  },
                },
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
            },
          })
        : Promise.resolve([]),
      isManager
        ? prisma.campaignCharacter.findMany({
            where: { campaignId },
            orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              name: true,
              assignedUserId: true,
              archivedAt: true,
            },
          })
        : prisma.campaignCharacter.findMany({
            where: {
              campaignId,
              assignedUserId: userId,
              archivedAt: null,
            },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              assignedUserId: true,
              archivedAt: true,
            },
          }),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const partyItems = rawPartyItems.map((row) => {
      const assignedQuantity = summarizeAssignedQuantity(row.backpackItems);
      return {
        id: row.id,
        campaignId: row.campaignId,
        itemTemplateId: row.itemTemplateId,
        quantity: isManager ? row.quantity : assignedQuantity,
        assignedQuantity,
        availableQuantity: isManager ? Math.max(0, row.quantity - assignedQuantity) : 0,
        itemTemplate: row.itemTemplate,
        backpackItems: row.backpackItems,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    return NextResponse.json({
      campaign,
      access: {
        userId,
        role: access.effectiveRole,
        permissions,
      },
      itemTemplates,
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
