import { NextResponse } from "next/server";
import { prisma } from "../../../../prisma/client";
import { requireCampaignAccess, requireUserId } from "../_shared";

const ALLOWED_ITEM_TYPES = new Set(["WEAPON", "ARMOR", "SHIELD", "ITEM"]);
const ALLOWED_TIERS = new Set(["PUSH", "BREAK", "TRANSCEND"]);
type LimitBreakTier = "PUSH" | "BREAK" | "TRANSCEND";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");
  const itemTypeRaw = searchParams.get("itemType");
  const tierRaw = searchParams.get("tier");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  const itemType = (itemTypeRaw ?? "").trim().toUpperCase();
  if (!ALLOWED_ITEM_TYPES.has(itemType)) {
    return NextResponse.json(
      { error: "itemType must be one of WEAPON, ARMOR, SHIELD, ITEM" },
      { status: 400 },
    );
  }

  const tier = tierRaw ? tierRaw.trim().toUpperCase() : null;
  if (tier && !ALLOWED_TIERS.has(tier)) {
    return NextResponse.json(
      { error: "tier must be one of PUSH, BREAK, TRANSCEND" },
      { status: 400 },
    );
  }

  try {
    const userId = await requireUserId();
    await requireCampaignAccess(campaignId, userId);

    const where = {
      templateType: "MYTHIC_ITEM" as const,
      itemType,
      ...(tier ? { tier: tier as LimitBreakTier } : {}),
    };

    let rows: Array<{
      id: string;
      name: string;
      tier: LimitBreakTier;
      itemType: string | null;
      thresholdPercent: number;
      description: string | null;
      baseCostKey: string | null;
      baseCostParams: unknown;
      baseCostText: string | null;
      successEffectKey: string | null;
      successEffectParams: unknown;
      failForwardEnabled: boolean;
      failForwardEffectKey: string | null;
      failForwardEffectParams: unknown;
      failForwardCostAKey: string | null;
      failForwardCostBKey: string | null;
      isPersistent: boolean;
      persistentCostTiming: string | null;
      persistentStateText: string | null;
      endConditionText: string | null;
      endCostKey: string | null;
      endCostParams: unknown;
      endCostText: string | null;
    }>;

    try {
      rows = await prisma.limitBreakTemplate.findMany({
        where,
        select: {
          id: true,
          name: true,
          tier: true,
          itemType: true,
          thresholdPercent: true,
          description: true,
          baseCostKey: true,
          baseCostParams: true,
          baseCostText: true,
          successEffectKey: true,
          successEffectParams: true,
          failForwardEnabled: true,
          failForwardEffectKey: true,
          failForwardEffectParams: true,
          failForwardCostAKey: true,
          failForwardCostBKey: true,
          isPersistent: true,
          persistentCostTiming: true,
          persistentStateText: true,
          endConditionText: true,
          endCostKey: true,
          endCostParams: true,
          endCostText: true,
        },
        orderBy: [{ name: "asc" }],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Dev fallback: hot reloaded server can run an older Prisma client bundle.
      // In that case, query without baseCostText to avoid 500s until restart/regenerate.
      if (!message.includes("Unknown field `baseCostText`")) {
        throw error;
      }

      const legacyRows = await prisma.limitBreakTemplate.findMany({
        where,
        select: {
          id: true,
          name: true,
          tier: true,
          itemType: true,
          thresholdPercent: true,
          description: true,
          baseCostKey: true,
          baseCostParams: true,
          successEffectKey: true,
          successEffectParams: true,
          failForwardEnabled: true,
          failForwardEffectKey: true,
          failForwardEffectParams: true,
          failForwardCostAKey: true,
          failForwardCostBKey: true,
          isPersistent: true,
          persistentCostTiming: true,
          persistentStateText: true,
          endConditionText: true,
          endCostKey: true,
          endCostParams: true,
          endCostText: true,
        },
        orderBy: [{ name: "asc" }],
      });

      rows = legacyRows.map((row) => ({ ...row, baseCostText: null }));
    }

    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load templates";

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[FORGE_LIMIT_BREAK_TEMPLATES_GET]", error);
    return NextResponse.json({ error: "Failed to load templates" }, { status: 500 });
  }
}
