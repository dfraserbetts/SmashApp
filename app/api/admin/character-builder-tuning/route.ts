import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";
import {
  ensureCharacterBuilderTuning,
  saveCharacterBuilderTuning,
} from "@/lib/config/characterBuilderTuning";
import { validateCharacterPowerSpendScalar } from "@/lib/config/characterBuilderTuningShared";

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

function errorResponse(error: unknown) {
  const message = String((error as { message?: unknown })?.message ?? "");
  if (message === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (message === "FORBIDDEN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (message === "INVALID_CHARACTER_POWER_SPEND_SCALAR") {
    return NextResponse.json(
      { error: "Character Power Spend Scalar must be greater than 0 and no more than 20." },
      { status: 400 },
    );
  }

  console.error("[ADMIN_CHARACTER_BUILDER_TUNING]", error);
  return NextResponse.json(
    process.env.NODE_ENV === "production"
      ? { error: "Server error" }
      : { error: "Server error", debug: { message: message || "Unknown error" } },
    { status: 500 },
  );
}

export async function GET() {
  try {
    await requireAdminUserId();
    return NextResponse.json({ tuning: await ensureCharacterBuilderTuning() });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdminUserId();
    const body = (await req.json().catch(() => null)) as
      | { playerPowerSpendScalar?: unknown }
      | null;
    const validation = validateCharacterPowerSpendScalar(body?.playerPowerSpendScalar);
    if (!validation.ok) throw new Error("INVALID_CHARACTER_POWER_SPEND_SCALAR");

    return NextResponse.json({
      tuning: await saveCharacterBuilderTuning({
        playerPowerSpendScalar: validation.value,
      }),
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
