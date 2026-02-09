import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";
import {
  LimitBreakTemplateValidationError,
  normalizeAndValidateTemplate,
} from "@/lib/limitBreakTemplates";

async function getSupabaseServer() {
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

  return supabase;
}

async function requireAdminUserId(): Promise<string> {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user?.id) {
    throw new Error("UNAUTHENTICATED");
  }

  const userId = data.user.id;

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { isAdmin: true },
  });

  if (!profile?.isAdmin) throw new Error("FORBIDDEN");
  return userId;
}

function handleError(error: unknown) {
  const msg = error instanceof Error ? error.message : "Server error";
  const stack = error instanceof Error ? error.stack : undefined;

  console.error("[ADMIN_LIMIT_BREAK_TEMPLATES]", {
    message: msg,
    stack,
    error,
  });

  if (msg === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (msg === "FORBIDDEN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (error instanceof LimitBreakTemplateValidationError) {
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const prismaCode = (error as any)?.code;
  if (prismaCode === "P2025") {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json({ error: "Server error", detail: msg }, { status: 500 });
  }

  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

export async function GET() {
  try {
    await requireAdminUserId();

    const rows = await prisma.limitBreakTemplate.findMany({
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ rows });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const data = normalizeAndValidateTemplate(body);

    const row = await prisma.limitBreakTemplate.create({
      data,
    });

    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const data = normalizeAndValidateTemplate(body);

    const row = await prisma.limitBreakTemplate.update({
      where: { id },
      data,
    });

    return NextResponse.json({ row });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
    const ids =
      Array.isArray(body?.ids)
        ? body?.ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "ids must be a non-empty string array" }, { status: 400 });
    }

    const result = await prisma.limitBreakTemplate.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ count: result.count });
  } catch (error) {
    return handleError(error);
  }
}
