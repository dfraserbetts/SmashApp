import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import {
  getCampaignPermissions,
  requireCampaignAccess,
} from "@/lib/campaign/access";
import {
  getEquipmentSlotUseCounts,
  normalizeBuilderData,
} from "@/lib/characterBuilder/core";
import { prisma } from "@/prisma/client";

const PARTY_STASH_TRANSFER_TARGET_ID = "__PARTY_STASH__";

type TransferPayload = {
  sourceBackpackItemId?: unknown;
  targetCharacterId?: unknown;
  quantity?: unknown;
};

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
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
  console.error("[BACKPACK_TRANSFER]", error);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; characterId: string }> },
) {
  try {
    const { id, characterId } = await context.params;
    const campaignId = String(id ?? "").trim();
    const sourceCharacterId = String(characterId ?? "").trim();
    if (!campaignId || !sourceCharacterId) {
      return NextResponse.json(
        { error: "Campaign id and source character id are required" },
        { status: 400 },
      );
    }

    const actorUserId = await requireUserId();
    const access = await requireCampaignAccess(campaignId, actorUserId);
    const permissions = getCampaignPermissions(access);

    const body = (await req.json().catch(() => ({}))) as TransferPayload;
    const sourceBackpackItemId = normalizeId(body.sourceBackpackItemId);
    const targetCharacterId = normalizeId(body.targetCharacterId);
    const quantity = normalizePositiveInteger(body.quantity);
    if (!sourceBackpackItemId || !targetCharacterId || quantity === null) {
      return NextResponse.json(
        { error: "Source item, recipient character, and positive quantity are required" },
        { status: 400 },
      );
    }
    const transferToPartyStash = targetCharacterId === PARTY_STASH_TRANSFER_TARGET_ID;
    if (!transferToPartyStash && targetCharacterId === sourceCharacterId) {
      return NextResponse.json(
        { error: "Choose a different character to receive this item" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const [sourceCharacter, targetCharacter, sourceBackpackItem] = await Promise.all([
        tx.campaignCharacter.findFirst({
          where: { id: sourceCharacterId, campaignId },
          select: {
            id: true,
            assignedUserId: true,
            archivedAt: true,
            builderData: true,
          },
        }),
        transferToPartyStash
          ? Promise.resolve(null)
          : tx.campaignCharacter.findFirst({
              where: { id: targetCharacterId, campaignId },
              select: { id: true, archivedAt: true },
            }),
        tx.campaignCharacterBackpackItem.findFirst({
          where: {
            id: sourceBackpackItemId,
            campaignId,
            characterId: sourceCharacterId,
          },
          select: {
            id: true,
            quantity: true,
            partyInventoryItemId: true,
          },
        }),
      ]);

      if (!sourceCharacter || (!transferToPartyStash && !targetCharacter) || !sourceBackpackItem) {
        return { status: 404 as const, error: "Backpack transfer target not found" };
      }
      if (sourceCharacter.archivedAt || targetCharacter?.archivedAt) {
        return { status: 400 as const, error: "Archived characters cannot send or receive items" };
      }
      const canTransferFromSource =
        permissions.canManageCampaignInventory || sourceCharacter.assignedUserId === actorUserId;
      if (!canTransferFromSource) {
        return { status: 403 as const, error: "You can only transfer from your own Backpack" };
      }
      if (quantity > sourceBackpackItem.quantity) {
        return { status: 400 as const, error: "Transfer quantity exceeds Backpack quantity" };
      }

      const sourceBuilderData = normalizeBuilderData(sourceCharacter.builderData);
      const usedCount =
        getEquipmentSlotUseCounts(sourceBuilderData.equippedSlots).get(sourceBackpackItem.id) ?? 0;
      const transferableQuantity = Math.max(0, sourceBackpackItem.quantity - usedCount);
      if (quantity > transferableQuantity) {
        return {
          status: 400 as const,
          error: "Unequip this item before transferring the equipped quantity",
        };
      }

      if (quantity === sourceBackpackItem.quantity) {
        await tx.campaignCharacterBackpackItem.delete({
          where: { id: sourceBackpackItem.id },
        });
      } else {
        await tx.campaignCharacterBackpackItem.update({
          where: { id: sourceBackpackItem.id },
          data: { quantity: { decrement: quantity } },
        });
      }

      if (transferToPartyStash) {
        return { status: 200 as const, recipientBackpackItem: null };
      }

      const recipientBackpackItem = await tx.campaignCharacterBackpackItem.upsert({
        where: {
          characterId_partyInventoryItemId: {
            characterId: targetCharacterId,
            partyInventoryItemId: sourceBackpackItem.partyInventoryItemId,
          },
        },
        update: { quantity: { increment: quantity } },
        create: {
          campaignId,
          characterId: targetCharacterId,
          partyInventoryItemId: sourceBackpackItem.partyInventoryItemId,
          quantity,
        },
        select: { id: true, quantity: true },
      });

      return { status: 200 as const, recipientBackpackItem };
    });

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, recipientBackpackItem: result.recipientBackpackItem });
  } catch (error) {
    return toErrorResponse(error);
  }
}
