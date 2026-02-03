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

async function requireAdmin(): Promise<void> {
  const userId = await getUserIdFromSupabaseSSR();
  if (!userId) throw new Error("UNAUTHENTICATED");

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { isAdmin: true },
  });

  if (!profile?.isAdmin) throw new Error("FORBIDDEN");
}

function statusFromErr(e: any) {
  const msg = String(e?.message ?? "");
  if (msg === "UNAUTHENTICATED") return 401;
  if (msg === "FORBIDDEN") return 403;
  return 500;
}

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);

    const category = (searchParams.get("category") ?? "").trim();
    const selector2 = (searchParams.get("selector2") ?? "").trim();
    const selector3Raw = searchParams.get("selector3");
    const selector3 =
      selector3Raw === null || selector3Raw.trim() === "" ? null : selector3Raw.trim();

    if (!category) {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }

    // Context list (full matrix) = distinct selector1 for the category
    const contextsRaw = await prisma.forgeCostEntry.findMany({
      where: { category: category as any },
      select: { selector1: true },
      distinct: ["selector1"],
      orderBy: { selector1: "asc" },
    });

    const contexts = contextsRaw.map((r) => r.selector1);

    // If selector2 isn't provided, return just contexts (useful later)
    if (!selector2) {
      return NextResponse.json({ contexts, rows: [] });
    }

    const rows = await prisma.forgeCostEntry.findMany({
      where: {
        category: category as any,
        selector2,
        selector3,
      },
      orderBy: [{ selector1: "asc" }],
      select: {
        id: true,
        category: true,
        selector1: true,
        selector2: true,
        selector3: true,
        value: true,
        notes: true,
      },
    });

    return NextResponse.json({ contexts, rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to load forge costs" },
      { status: statusFromErr(e) },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const body = (await req.json().catch(() => null)) as
      | {
          category?: unknown;
          selector1?: unknown;
          selector2?: unknown;
          selector3?: unknown;
          value?: unknown;
          notes?: unknown;
        }
      | null;

    const category = typeof body?.category === "string" ? body.category.trim() : "";
    const selector1 = typeof body?.selector1 === "string" ? body.selector1.trim() : "";
    const selector2 = typeof body?.selector2 === "string" ? body.selector2.trim() : "";
    const selector3 =
      typeof body?.selector3 === "string" && body.selector3.trim() !== ""
        ? body.selector3.trim()
        : null;

    const valueRaw = body?.value;
    const value =
      typeof valueRaw === "number"
        ? valueRaw
        : typeof valueRaw === "string"
          ? Number.parseFloat(valueRaw)
          : NaN;

    const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

    if (!category) return NextResponse.json({ error: "category is required" }, { status: 400 });
    if (!selector1) return NextResponse.json({ error: "selector1 is required" }, { status: 400 });
    if (!selector2) return NextResponse.json({ error: "selector2 is required" }, { status: 400 });
    if (!Number.isFinite(value)) return NextResponse.json({ error: "value must be a number" }, { status: 400 });

    const created = await prisma.forgeCostEntry.create({
      data: {
        category: category as any,
        selector1,
        selector2,
        selector3,
        value,
        notes,
      },
      select: {
        id: true,
        category: true,
        selector1: true,
        selector2: true,
        selector3: true,
        value: true,
        notes: true,
      },
    });

    return NextResponse.json({ row: created }, { status: 201 });
  } catch (e: any) {
    // unique constraint (if your schema enforces uniqueness on the selector tuple)
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Duplicate cost entry" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Failed to create forge cost" },
      { status: statusFromErr(e) },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();

    const body = (await req.json().catch(() => null)) as
      | { id?: unknown; value?: unknown; notes?: unknown }
      | null;

    const idRaw = body?.id;
    const id =
      typeof idRaw === "number"
        ? idRaw
        : typeof idRaw === "string"
          ? Number.parseInt(idRaw, 10)
          : NaN;

    const valueRaw = body?.value;
    const value =
      typeof valueRaw === "number"
        ? valueRaw
        : typeof valueRaw === "string"
          ? Number.parseFloat(valueRaw)
          : NaN;

    const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

    if (!Number.isFinite(id)) return NextResponse.json({ error: "id must be a number" }, { status: 400 });
    if (!Number.isFinite(value)) return NextResponse.json({ error: "value must be a number" }, { status: 400 });

    const updated = await prisma.forgeCostEntry.update({
      where: { id },
      data: { value, notes },
      select: {
        id: true,
        category: true,
        selector1: true,
        selector2: true,
        selector3: true,
        value: true,
        notes: true,
      },
    });

    return NextResponse.json({ row: updated });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to update forge cost" },
      { status: statusFromErr(e) },
    );
  }
}
