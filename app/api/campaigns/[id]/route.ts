import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";

type CookieOptions = Record<string, unknown>;

async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: unknown) {
          cookieStore.set({ name, value, ...(options as CookieOptions) });
        },
        remove(name: string, options: unknown) {
          cookieStore.set({ name, value: "", ...(options as CookieOptions) });
        },
      },
    },
  );
}

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

    const supabase = await getSupabaseServer();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const membership = await prisma.campaignUser.findUnique({
      where: {
        campaignId_userId: {
          campaignId,
          userId: user.id,
        },
      },
      select: {
        role: true,
      },
    });

    const canDelete =
      campaign.ownerUserId === user.id || membership?.role === "GAME_DIRECTOR";

    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.campaign.delete({
      where: { id: campaignId },
    });

    return NextResponse.json({
      ok: true,
      deletedCampaignId: campaign.id,
      deletedCampaignName: campaign.name,
    });
  } catch (error) {
    console.error("[CAMPAIGN_DELETE]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
