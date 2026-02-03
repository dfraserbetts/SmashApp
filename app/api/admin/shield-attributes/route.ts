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

export async function GET() {
  try {
    await requireAdminUserId();

    const rows = await prisma.shieldAttribute.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, descriptorTemplate: true, descriptorNotes: true },
    });

    return NextResponse.json({ rows });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "FORBIDDEN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminUserId();

const body = (await req.json().catch(() => null)) as
      | { name?: unknown; descriptorTemplate?: unknown; descriptorNotes?: unknown }
      | null;

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name)
      return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const descriptorTemplate =
      typeof body?.descriptorTemplate === "string" ? body.descriptorTemplate : null;

    const descriptorNotes =
      typeof body?.descriptorNotes === "string" ? body.descriptorNotes : null;

    const created = await prisma.shieldAttribute.create({
      data: { name, descriptorTemplate, descriptorNotes },
      select: { id: true, name: true, descriptorTemplate: true, descriptorNotes: true },
    });

    return NextResponse.json({ row: created }, { status: 201 });
  } catch (e: any) {
    // Prisma unique constraint violation
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "Name already exists" },
        { status: 409 },
      );
    }
    const msg = String(e?.message ?? "");
    if (msg === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "FORBIDDEN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as
      | { id?: unknown; name?: unknown; descriptorTemplate?: unknown; descriptorNotes?: unknown }
      | null;

    const idRaw = body?.id;
    const id =
      typeof idRaw === "number"
        ? idRaw
        : typeof idRaw === "string"
          ? Number.parseInt(idRaw, 10)
          : NaN;

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be a number" }, { status: 400 });
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";

    const descriptorTemplate =
      typeof body?.descriptorTemplate === "string"
        ? String(body.descriptorTemplate).trim()
        : "";

    const descriptorNotes =
      typeof body?.descriptorNotes === "string"
        ? String(body.descriptorNotes).trim()
        : "";

    // Backwards compatible: name is only required if the caller is actually updating it.
    if ("name" in (body ?? {}) && !name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const data: any = {};

    if ("name" in (body ?? {})) data.name = name;

    if ("descriptorTemplate" in (body ?? {})) {
      data.descriptorTemplate = descriptorTemplate || null;
    }

    if ("descriptorNotes" in (body ?? {})) {
      data.descriptorNotes = descriptorNotes || null;
    }

    const updated = await prisma.shieldAttribute.update({
      where: { id },
      data,
      select: { id: true, name: true, descriptorTemplate: true, descriptorNotes: true },
    });

    return NextResponse.json({ row: updated });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Name already exists" }, { status: 409 });
    }
    const msg = String(e?.message ?? "");
    if (msg === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as
      | { id?: unknown }
      | null;

    const idRaw = body?.id;
    const id =
    typeof idRaw === "number"
        ? idRaw
        : typeof idRaw === "string"
        ? Number.parseInt(idRaw, 10)
        : NaN;

    if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id must be a number" }, { status: 400 });
    }

    await prisma.shieldAttribute.delete({ where: { id } });

    return NextResponse.json({ ok: true });

  } catch (e: any) {
    // FK constraint violation (if referenced somewhere)
    if (e?.code === "P2003") {
      return NextResponse.json(
        { error: "Cannot delete: value is in use" },
        { status: 409 },
      );
    }
    const msg = String(e?.message ?? "");
    if (msg === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "FORBIDDEN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
