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

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEffectText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET() {
  try {
    await requireAdminUserId();

    const rows = await prisma.monsterTraitDefinition.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        effectText: true,
        isEnabled: true,
        source: true,
        isReadOnly: true,
      },
    });

    return NextResponse.json({ rows });
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

export async function POST(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as
      | { id?: unknown; name?: unknown; effectText?: unknown; isEnabled?: unknown }
      | null;

    const id = normalizeId(body?.id);
    const name = normalizeName(body?.name);
    const effectText = normalizeEffectText(body?.effectText);
    const isEnabled = typeof body?.isEnabled === "boolean" ? body.isEnabled : true;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const row = id
      ? await prisma.monsterTraitDefinition.update({
          where: { id },
          data: { name, effectText, isEnabled },
          select: {
            id: true,
            name: true,
            effectText: true,
            isEnabled: true,
            source: true,
            isReadOnly: true,
          },
        })
      : await prisma.monsterTraitDefinition.create({
          data: {
            name,
            effectText,
            isEnabled,
            source: "CORE",
            isReadOnly: true,
          },
          select: {
            id: true,
            name: true,
            effectText: true,
            isEnabled: true,
            source: true,
            isReadOnly: true,
          },
        });

    return NextResponse.json({ row }, { status: id ? 200 : 201 });
  } catch (e: unknown) {
    const err = e as { message?: unknown; code?: string };
    const msg = String(err?.message ?? "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as
      | { id?: unknown; name?: unknown; effectText?: unknown; isEnabled?: unknown }
      | null;

    const id = normalizeId(body?.id);
    const name = normalizeName(body?.name);
    const effectText = normalizeEffectText(body?.effectText);
    const isEnabled = typeof body?.isEnabled === "boolean" ? body.isEnabled : undefined;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const row = await prisma.monsterTraitDefinition.update({
      where: { id },
      data: {
        name,
        effectText,
        ...(isEnabled === undefined ? {} : { isEnabled }),
      },
      select: {
        id: true,
        name: true,
        effectText: true,
        isEnabled: true,
        source: true,
        isReadOnly: true,
      },
    });

    return NextResponse.json({ row });
  } catch (e: unknown) {
    const err = e as { message?: unknown; code?: string };
    const msg = String(err?.message ?? "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const id = normalizeId(body?.id);
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const usageCount = await prisma.monsterTrait.count({ where: { traitDefinitionId: id } });
    if (usageCount > 0) {
      return NextResponse.json(
        { error: "Cannot delete trait definition: it is currently assigned to one or more monsters." },
        { status: 400 },
      );
    }

    await prisma.monsterTraitDefinition.delete({ where: { id } });
    return NextResponse.json({ ok: true });
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

