import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";

// [ANCHOR:ADMIN_CAMPAIGNS_LIST_API]

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

export async function GET() {
  try {
    await requireAdminUserId();

    const rows = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        name: true,
        ownerUserId: true,
        descriptorVersionTag: true,
        _count: {
          select: {
            members: true,
            ItemTemplate: true,
            monsters: true,
          },
        },
      },
    });

    return NextResponse.json({
      rows: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        name: row.name,
        ownerUserId: row.ownerUserId,
        descriptorVersionTag: row.descriptorVersionTag,
        membersCount: row._count.members,
        itemsCount: row._count.ItemTemplate,
        monstersCount: row._count.monsters,
      })),
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
2) Verify campaigns list and count columns render.
3) Click one campaign row link and verify detail page loads.
*/
