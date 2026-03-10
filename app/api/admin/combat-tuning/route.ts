// ADMIN_COMBAT_TUNING_API
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";
import {
  DEFAULT_PROTECTION_K,
  DEFAULT_PROTECTION_S,
  normalizeProtectionTuning,
} from "@/lib/config/combatTuningShared";

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

function errorResponse(e: unknown) {
  const msg = String((e as { message?: unknown })?.message ?? "");
  if (msg === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (msg === "FORBIDDEN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

async function getOrCreateTuningRow() {
  const existing = await prisma.combatTuning.findFirst({
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      protectionK: true,
      protectionS: true,
      updatedAt: true,
    },
  });

  if (existing) {
    const normalized = normalizeProtectionTuning(existing.protectionK, existing.protectionS);
    if (
      normalized.protectionK !== existing.protectionK ||
      normalized.protectionS !== existing.protectionS
    ) {
      return prisma.combatTuning.update({
        where: { id: existing.id },
        data: {
          protectionK: normalized.protectionK,
          protectionS: normalized.protectionS,
        },
        select: {
          id: true,
          protectionK: true,
          protectionS: true,
          updatedAt: true,
        },
      });
    }
    return existing;
  }

  return prisma.combatTuning.create({
    data: {
      protectionK: DEFAULT_PROTECTION_K,
      protectionS: DEFAULT_PROTECTION_S,
    },
    select: {
      id: true,
      protectionK: true,
      protectionS: true,
      updatedAt: true,
    },
  });
}

function parsePositiveInt(input: unknown): number | null {
  const value =
    typeof input === "number"
      ? input
      : typeof input === "string"
        ? Number.parseInt(input, 10)
        : Number.NaN;
  if (!Number.isFinite(value) || value < 1) return null;
  return Math.trunc(value);
}

export async function GET() {
  try {
    await requireAdminUserId();
    const row = await getOrCreateTuningRow();
    return NextResponse.json({ row });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as
      | { protectionK?: unknown; protectionS?: unknown }
      | null;

    const protectionK = parsePositiveInt(body?.protectionK);
    const protectionS = parsePositiveInt(body?.protectionS);

    if (protectionK === null) {
      return NextResponse.json({ error: "protectionK must be >= 1" }, { status: 400 });
    }
    if (protectionS === null) {
      return NextResponse.json({ error: "protectionS must be >= 1" }, { status: 400 });
    }

    const existing = await prisma.combatTuning.findFirst({
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true },
    });

    const row = existing
      ? await prisma.combatTuning.update({
          where: { id: existing.id },
          data: { protectionK, protectionS },
          select: {
            id: true,
            protectionK: true,
            protectionS: true,
            updatedAt: true,
          },
        })
      : await prisma.combatTuning.create({
          data: { protectionK, protectionS },
          select: {
            id: true,
            protectionK: true,
            protectionS: true,
            updatedAt: true,
          },
        });

    return NextResponse.json({ row });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
