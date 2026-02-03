import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";

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
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options });
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

type Body = {
  category?: unknown;
  fromSelector2?: unknown;
  fromSelector3?: unknown;
  toSelector2?: unknown;
  toSelector3?: unknown;
};

export async function POST(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as Body | null;

    const category =
      typeof body?.category === "string" ? body.category.trim() : "";
    const fromSelector2 =
      typeof body?.fromSelector2 === "string" ? body.fromSelector2.trim() : "";
    const toSelector2 =
      typeof body?.toSelector2 === "string" ? body.toSelector2.trim() : "";

    const fromSelector3 =
      body?.fromSelector3 === null
        ? null
        : typeof body?.fromSelector3 === "string"
          ? body.fromSelector3.trim()
          : null;

    const toSelector3 =
      body?.toSelector3 === null
        ? null
        : typeof body?.toSelector3 === "string"
          ? body.toSelector3.trim()
          : null;

    if (!category) {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }
    if (!fromSelector2) {
      return NextResponse.json({ error: "fromSelector2 is required" }, { status: 400 });
    }
    if (!toSelector2) {
      return NextResponse.json({ error: "toSelector2 is required" }, { status: 400 });
    }

    // No-op: don’t waste a spell slot.
    if (
      fromSelector2.toLowerCase() === toSelector2.toLowerCase() &&
      (fromSelector3 ?? null) === (toSelector3 ?? null)
    ) {
      return NextResponse.json({ updated: 0 });
    }

    // Update only rows for this exact “base + tier” pairing.
    const result = await prisma.forgeCostEntry.updateMany({
    where: {
        category: category as any,
        selector2: fromSelector2,
        selector3: fromSelector3,
    },
    data: {
        selector2: toSelector2,
        selector3: toSelector3,
    },
    });

    return NextResponse.json({ updated: result.count });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
