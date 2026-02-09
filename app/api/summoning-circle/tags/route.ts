import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { requireCampaignMember, requireUserId } from "../_shared";

const MAX_SUGGESTIONS = 20;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");
  const s = (searchParams.get("s") ?? "").trim();

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  try {
    const userId = await requireUserId();
    await requireCampaignMember(campaignId, userId);

    if (s.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const [campaignRows, coreRows] = await Promise.all([
      prisma.monsterTag.findMany({
        where: {
          tag: { startsWith: s, mode: "insensitive" },
          monster: {
            source: "CAMPAIGN",
            campaignId,
          },
        },
        select: { tag: true },
        distinct: ["tag"],
        orderBy: { tag: "asc" },
        take: MAX_SUGGESTIONS,
      }),
      prisma.monsterTag.findMany({
        where: {
          tag: { startsWith: s, mode: "insensitive" },
          monster: {
            source: "CORE",
          },
        },
        select: { tag: true },
        distinct: ["tag"],
        orderBy: { tag: "asc" },
        take: MAX_SUGGESTIONS,
      }),
    ]);

    const deduped = new Map<string, { value: string; source: "global" | "campaign" }>();

    for (const row of campaignRows) {
      const value = row.tag.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, { value, source: "campaign" });
      }
    }

    for (const row of coreRows) {
      const value = row.tag.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, { value, source: "global" });
      }
    }

    return NextResponse.json({ suggestions: Array.from(deduped.values()).slice(0, MAX_SUGGESTIONS) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load tags";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[SUMMONING_TAGS_GET]", error);
    return NextResponse.json({ error: "Failed to load tags" }, { status: 500 });
  }
}
