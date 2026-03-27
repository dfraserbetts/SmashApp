import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";

type CookieOptions = Record<string, unknown>;

function getErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  return typeof error.code === "string" ? error.code : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

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
          cookieStore.set({ name, value, ...(options as CookieOptions) });
        },
        remove(name: string, options: unknown) {
          cookieStore.set({ name, value: "", ...(options as CookieOptions) });
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

    const rows = await prisma.sanctifiedOption.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    return NextResponse.json({ rows });
  } catch (error) {
    const msg = getErrorMessage(error);
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
      | { name?: unknown }
      | null;

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name)
      return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const created = await prisma.sanctifiedOption.create({
      data: { name },
      select: { id: true, name: true },
    });

    return NextResponse.json({ row: created }, { status: 201 });
  } catch (error) {
    // Prisma unique constraint violation
    if (getErrorCode(error) === "P2002") {
      return NextResponse.json(
        { error: "Name already exists" },
        { status: 409 },
      );
    }
    const msg = getErrorMessage(error);
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
      | { id?: unknown; name?: unknown }
      | null;

    const idRaw = body?.id;
    const id =
    typeof idRaw === "number"
        ? idRaw
        : typeof idRaw === "string"
        ? Number.parseInt(idRaw, 10)
        : NaN;

    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id must be a number" }, { status: 400 });
    }
    if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const updated = await prisma.sanctifiedOption.update({
      where: { id },
      data: { name },
      select: { id: true, name: true },
    });

    return NextResponse.json({ row: updated });
  } catch (error) {
    if (getErrorCode(error) === "P2002") {
      return NextResponse.json(
        { error: "Name already exists" },
        { status: 409 },
      );
    }
    const msg = getErrorMessage(error);
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

    await prisma.sanctifiedOption.delete({ where: { id } });

    return NextResponse.json({ ok: true });

  } catch (error) {
    // FK constraint violation (if referenced somewhere)
    if (getErrorCode(error) === "P2003") {
      return NextResponse.json(
        { error: "Cannot delete: value is in use" },
        { status: 409 },
      );
    }
    const msg = getErrorMessage(error);
    if (msg === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "FORBIDDEN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
