import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";

// [ANCHOR:ADMIN_CAMPAIGN_DETAIL_API]

async function getUserIdFromSupabaseSSR(): Promise<string | null> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: unknown) {
          cookieStore.set({ name, value, ...(options as Record<string, unknown>) });
        },
        remove(name: string, options: unknown) {
          cookieStore.set({ name, value: "", ...(options as Record<string, unknown>) });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function requireAdminUserId(): Promise<string> {
  const userId = await getUserIdFromSupabaseSSR();
  if (!userId) throw new Error("UNAUTHENTICATED");

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { isAdmin: true },
  });

  if (!profile?.isAdmin) throw new Error("FORBIDDEN");
  return userId;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ campaignId: string }> },
) {
  try {
    const params = await context.params;
    const campaignId = String(params?.campaignId ?? "").trim();
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    await requireAdminUserId();

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        createdAt: true,
        name: true,
        ownerUserId: true,
        descriptorVersionTag: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [members, itemsRaw, monstersRaw] = await Promise.all([
      prisma.campaignUser.findMany({
        where: { campaignId },
        orderBy: { createdAt: "asc" },
        select: {
          userId: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.itemTemplate.findMany({
        where: { campaignId },
        orderBy: [{ createdAt: "desc" }, { name: "asc" }],
        include: {
          tags: {
            orderBy: { tag: "asc" },
          },
          vrpEntries: {
            include: {
              damageType: {
                select: {
                  id: true,
                  name: true,
                  attackMode: true,
                },
              },
            },
            orderBy: { id: "asc" },
          },
        },
      }),
      prisma.monster.findMany({
        where: { campaignId },
        orderBy: [{ createdAt: "desc" }, { name: "asc" }],
      }),
    ]);

    const items = itemsRaw.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      level: item.level,
      rarity: item.rarity,
      ppv: item.ppv,
      mpv: item.mpv,
      armorLocation: item.armorLocation,
      itemLocation: item.itemLocation,
      raw: item,
    }));

    const monsters = monstersRaw.map((monster) => ({
      id: monster.id,
      name: monster.name,
      level: monster.level,
      tier: monster.tier,
      legendary: monster.legendary,
      source: monster.source,
      raw: monster,
    }));

    return NextResponse.json({
      campaign,
      members,
      items,
      monsters,
    });
  } catch (e: unknown) {
    const msg = String((e as { message?: unknown })?.message ?? "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/*
Route smoke test:
1) Load /admin/campaigns as an admin user.
2) Click into /admin/campaigns/[campaignId].
3) Verify campaign header, members, items, and monsters render.
*/
