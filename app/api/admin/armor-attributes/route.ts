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

    const rows = await prisma.armorAttribute.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        descriptorTemplate: true,
        descriptorNotes: true,
        requiresPvKind: true,
      },
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
      typeof (body as any)?.descriptorTemplate === "string"
        ? (body as any).descriptorTemplate
        : null;

    const descriptorNotes =
      typeof (body as any)?.descriptorNotes === "string"
        ? (body as any).descriptorNotes
        : null;

    const requiresPvKind =
      (body as any)?.requiresPvKind === "PHYSICAL" || (body as any)?.requiresPvKind === "MENTAL"
        ? ((body as any).requiresPvKind as "PHYSICAL" | "MENTAL")
        : null;

    const created = await prisma.armorAttribute.create({
      data: { name, descriptorTemplate, descriptorNotes, requiresPvKind },
      select: {
        id: true,
        name: true,
        descriptorTemplate: true,
        descriptorNotes: true,
        requiresPvKind: true,
      },
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
      | {
          id?: unknown;
          name?: unknown;
          descriptorTemplate?: unknown;
          descriptorNotes?: unknown;
          requiresPvKind?: unknown;
        }
      | null;

    const idRaw = body?.id;
    const id =
      typeof idRaw === "number"
        ? idRaw
        : typeof idRaw === "string"
          ? Number.parseInt(idRaw, 10)
          : NaN;

    const name = typeof body?.name === "string" ? body.name.trim() : "";

    const descriptorTemplate =
      typeof (body as any)?.descriptorTemplate === "string"
        ? String((body as any).descriptorTemplate).trim()
        : "";

    const descriptorNotes =
      typeof (body as any)?.descriptorNotes === "string"
        ? String((body as any).descriptorNotes).trim()
        : "";

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be a number" }, { status: 400 });
    }

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

    if ("requiresPvKind" in (body ?? {})) {
      const v = (body as any)?.requiresPvKind;
      data.requiresPvKind = v === "PHYSICAL" || v === "MENTAL" ? v : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.armorAttribute.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        descriptorTemplate: true,
        descriptorNotes: true,
        requiresPvKind: true,
      },
    });

    return NextResponse.json({ row: updated });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Name already exists" }, { status: 409 });
    }

    const msg = String(e?.message ?? "");
    if (msg === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "FORBIDDEN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as
      | {
          id?: unknown;
        }
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

    await prisma.armorAttribute.delete({ where: { id } });

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
