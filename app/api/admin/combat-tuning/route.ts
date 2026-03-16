// ADMIN_COMBAT_TUNING_API
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";
import {
  normalizeCombatTuning,
  type ProtectionTuningValues,
} from "@/lib/config/combatTuningShared";
import { ensureCombatTuningRow, saveCombatTuning } from "@/lib/config/combatTuning";

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
  console.error("[ADMIN_COMBAT_TUNING]", e);
  return NextResponse.json(
    process.env.NODE_ENV === "production"
      ? { error: "Server error" }
      : {
          error: "Server error",
          debug: {
            message: msg || "Unknown error",
          },
        },
    { status: 500 },
  );
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

function parsePositiveNumber(input: unknown): number | null {
  const value =
    typeof input === "number"
      ? input
      : typeof input === "string" && input.trim().length > 0
        ? Number(input)
        : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export async function GET() {
  try {
    await requireAdminUserId();
    const row = await ensureCombatTuningRow();
    return NextResponse.json({ row });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as
      | {
          protectionK?: unknown;
          protectionS?: unknown;
          attackWeight?: unknown;
          defenceWeight?: unknown;
          fortitudeWeight?: unknown;
          intellectWeight?: unknown;
          supportWeight?: unknown;
          braveryWeight?: unknown;
          minionTierMultiplier?: unknown;
          soldierTierMultiplier?: unknown;
          eliteTierMultiplier?: unknown;
          bossTierMultiplier?: unknown;
          expectedPhysicalResilienceAt1?: unknown;
          expectedPhysicalResiliencePerLevel?: unknown;
          expectedMentalPerseveranceAt1?: unknown;
          expectedMentalPerseverancePerLevel?: unknown;
          expectedPoolMinionMultiplier?: unknown;
          expectedPoolSoldierMultiplier?: unknown;
          expectedPoolEliteMultiplier?: unknown;
          expectedPoolBossMultiplier?: unknown;
          poolWeakerSideWeight?: unknown;
          poolAverageWeight?: unknown;
          poolBelowExpectedMaxPenaltyShare?: unknown;
          poolBelowExpectedScale?: unknown;
          poolAboveExpectedMaxBonusShare?: unknown;
          poolAboveExpectedScale?: unknown;
        }
      | null;

    const protectionK = parsePositiveInt(body?.protectionK);
    const protectionS = parsePositiveInt(body?.protectionS);
    const attackWeight = parsePositiveNumber(body?.attackWeight);
    const defenceWeight = parsePositiveNumber(body?.defenceWeight);
    const fortitudeWeight = parsePositiveNumber(body?.fortitudeWeight);
    const intellectWeight = parsePositiveNumber(body?.intellectWeight);
    const supportWeight = parsePositiveNumber(body?.supportWeight);
    const braveryWeight = parsePositiveNumber(body?.braveryWeight);
    const minionTierMultiplier = parsePositiveNumber(body?.minionTierMultiplier);
    const soldierTierMultiplier = parsePositiveNumber(body?.soldierTierMultiplier);
    const eliteTierMultiplier = parsePositiveNumber(body?.eliteTierMultiplier);
    const bossTierMultiplier = parsePositiveNumber(body?.bossTierMultiplier);
    const expectedPhysicalResilienceAt1 = parsePositiveNumber(
      body?.expectedPhysicalResilienceAt1,
    );
    const expectedPhysicalResiliencePerLevel = parsePositiveNumber(
      body?.expectedPhysicalResiliencePerLevel,
    );
    const expectedMentalPerseveranceAt1 = parsePositiveNumber(
      body?.expectedMentalPerseveranceAt1,
    );
    const expectedMentalPerseverancePerLevel = parsePositiveNumber(
      body?.expectedMentalPerseverancePerLevel,
    );
    const expectedPoolMinionMultiplier = parsePositiveNumber(
      body?.expectedPoolMinionMultiplier,
    );
    const expectedPoolSoldierMultiplier = parsePositiveNumber(
      body?.expectedPoolSoldierMultiplier,
    );
    const expectedPoolEliteMultiplier = parsePositiveNumber(body?.expectedPoolEliteMultiplier);
    const expectedPoolBossMultiplier = parsePositiveNumber(body?.expectedPoolBossMultiplier);
    const poolWeakerSideWeight = parsePositiveNumber(body?.poolWeakerSideWeight);
    const poolAverageWeight = parsePositiveNumber(body?.poolAverageWeight);
    const poolBelowExpectedMaxPenaltyShare = parsePositiveNumber(
      body?.poolBelowExpectedMaxPenaltyShare,
    );
    const poolBelowExpectedScale = parsePositiveNumber(body?.poolBelowExpectedScale);
    const poolAboveExpectedMaxBonusShare = parsePositiveNumber(
      body?.poolAboveExpectedMaxBonusShare,
    );
    const poolAboveExpectedScale = parsePositiveNumber(body?.poolAboveExpectedScale);

    if (protectionK === null) {
      return NextResponse.json({ error: "protectionK must be >= 1" }, { status: 400 });
    }
    if (protectionS === null) {
      return NextResponse.json({ error: "protectionS must be >= 1" }, { status: 400 });
    }
    if (attackWeight === null) {
      return NextResponse.json({ error: "attackWeight must be > 0" }, { status: 400 });
    }
    if (defenceWeight === null) {
      return NextResponse.json({ error: "defenceWeight must be > 0" }, { status: 400 });
    }
    if (fortitudeWeight === null) {
      return NextResponse.json({ error: "fortitudeWeight must be > 0" }, { status: 400 });
    }
    if (intellectWeight === null) {
      return NextResponse.json({ error: "intellectWeight must be > 0" }, { status: 400 });
    }
    if (supportWeight === null) {
      return NextResponse.json({ error: "supportWeight must be > 0" }, { status: 400 });
    }
    if (braveryWeight === null) {
      return NextResponse.json({ error: "braveryWeight must be > 0" }, { status: 400 });
    }
    if (minionTierMultiplier === null) {
      return NextResponse.json({ error: "minionTierMultiplier must be > 0" }, { status: 400 });
    }
    if (soldierTierMultiplier === null) {
      return NextResponse.json({ error: "soldierTierMultiplier must be > 0" }, { status: 400 });
    }
    if (eliteTierMultiplier === null) {
      return NextResponse.json({ error: "eliteTierMultiplier must be > 0" }, { status: 400 });
    }
    if (bossTierMultiplier === null) {
      return NextResponse.json({ error: "bossTierMultiplier must be > 0" }, { status: 400 });
    }
    if (expectedPhysicalResilienceAt1 === null) {
      return NextResponse.json(
        { error: "expectedPhysicalResilienceAt1 must be > 0" },
        { status: 400 },
      );
    }
    if (expectedPhysicalResiliencePerLevel === null) {
      return NextResponse.json(
        { error: "expectedPhysicalResiliencePerLevel must be > 0" },
        { status: 400 },
      );
    }
    if (expectedMentalPerseveranceAt1 === null) {
      return NextResponse.json(
        { error: "expectedMentalPerseveranceAt1 must be > 0" },
        { status: 400 },
      );
    }
    if (expectedMentalPerseverancePerLevel === null) {
      return NextResponse.json(
        { error: "expectedMentalPerseverancePerLevel must be > 0" },
        { status: 400 },
      );
    }
    if (expectedPoolMinionMultiplier === null) {
      return NextResponse.json(
        { error: "expectedPoolMinionMultiplier must be > 0" },
        { status: 400 },
      );
    }
    if (expectedPoolSoldierMultiplier === null) {
      return NextResponse.json(
        { error: "expectedPoolSoldierMultiplier must be > 0" },
        { status: 400 },
      );
    }
    if (expectedPoolEliteMultiplier === null) {
      return NextResponse.json(
        { error: "expectedPoolEliteMultiplier must be > 0" },
        { status: 400 },
      );
    }
    if (expectedPoolBossMultiplier === null) {
      return NextResponse.json(
        { error: "expectedPoolBossMultiplier must be > 0" },
        { status: 400 },
      );
    }
    if (poolWeakerSideWeight === null) {
      return NextResponse.json({ error: "poolWeakerSideWeight must be > 0" }, { status: 400 });
    }
    if (poolAverageWeight === null) {
      return NextResponse.json({ error: "poolAverageWeight must be > 0" }, { status: 400 });
    }
    if (poolBelowExpectedMaxPenaltyShare === null) {
      return NextResponse.json(
        { error: "poolBelowExpectedMaxPenaltyShare must be > 0" },
        { status: 400 },
      );
    }
    if (poolBelowExpectedScale === null) {
      return NextResponse.json(
        { error: "poolBelowExpectedScale must be > 0" },
        { status: 400 },
      );
    }
    if (poolAboveExpectedMaxBonusShare === null) {
      return NextResponse.json(
        { error: "poolAboveExpectedMaxBonusShare must be > 0" },
        { status: 400 },
      );
    }
    if (poolAboveExpectedScale === null) {
      return NextResponse.json(
        { error: "poolAboveExpectedScale must be > 0" },
        { status: 400 },
      );
    }

    const row = await saveCombatTuning(
      normalizeCombatTuning({
        protectionK,
        protectionS,
        attackWeight,
        defenceWeight,
        fortitudeWeight,
        intellectWeight,
        supportWeight,
        braveryWeight,
        minionTierMultiplier,
        soldierTierMultiplier,
        eliteTierMultiplier,
        bossTierMultiplier,
        expectedPhysicalResilienceAt1,
        expectedPhysicalResiliencePerLevel,
        expectedMentalPerseveranceAt1,
        expectedMentalPerseverancePerLevel,
        expectedPoolMinionMultiplier,
        expectedPoolSoldierMultiplier,
        expectedPoolEliteMultiplier,
        expectedPoolBossMultiplier,
        poolWeakerSideWeight,
        poolAverageWeight,
        poolBelowExpectedMaxPenaltyShare,
        poolBelowExpectedScale,
        poolAboveExpectedMaxBonusShare,
        poolAboveExpectedScale,
      }) satisfies ProtectionTuningValues,
    );

    return NextResponse.json({ row });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
