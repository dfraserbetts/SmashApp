import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { requireUserId } from "@/lib/auth/server";
import { requireCampaignGameDirector } from "@/lib/campaign/access";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const campaignId = String(params?.id ?? "").trim();
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign id is required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as
      | {
          campaignName?: unknown;
        }
      | null;

    const typedCampaignName =
      typeof body?.campaignName === "string" ? body.campaignName.trim() : "";
    if (!typedCampaignName) {
      return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
    }

    const userId = await requireUserId();

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        ownerUserId: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (typedCampaignName !== campaign.name) {
      return NextResponse.json(
        { error: "Campaign name does not match" },
        { status: 400 },
      );
    }

    await requireCampaignGameDirector(campaignId, userId);

    await prisma.campaign.delete({
      where: { id: campaignId },
    });

    return NextResponse.json({
      ok: true,
      deletedCampaignId: campaign.id,
      deletedCampaignName: campaign.name,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    console.error("[CAMPAIGN_DELETE]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
