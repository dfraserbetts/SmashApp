// ADMIN_OUTCOME_NORMALIZATION_API
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";
import {
  activateOutcomeNormalizationSet,
  archiveOutcomeNormalizationSet,
  createDraftOutcomeNormalizationSetFromActive,
  deleteArchivedOutcomeNormalizationSet,
  ensureSeedOutcomeNormalizationSet,
  getOutcomeNormalizationSetById,
  listOutcomeNormalizationSets,
  saveOutcomeNormalizationSetValues,
  unarchiveOutcomeNormalizationSet,
} from "@/lib/config/outcomeNormalization";
import { DEFAULT_OUTCOME_NORMALIZATION_VALUES } from "@/lib/config/outcomeNormalizationShared";

const KNOWN_OUTCOME_NORMALIZATION_KEYS = new Set(
  Object.keys(DEFAULT_OUTCOME_NORMALIZATION_VALUES),
);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResponse(error: unknown) {
  const message = String((error as { message?: unknown })?.message ?? "");
  if (message === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (message === "FORBIDDEN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (
    message === "INVALID_ACTION" ||
    message === "INVALID_SET_ID" ||
    message === "INVALID_VALUES" ||
    message === "INVALID_NOTES" ||
    message === "OUTCOME_NORMALIZATION_SET_NOT_FOUND" ||
    message === "OUTCOME_NORMALIZATION_SET_NOT_EDITABLE" ||
    message === "OUTCOME_NORMALIZATION_SET_NOT_DRAFT" ||
    message === "OUTCOME_NORMALIZATION_SET_NOT_ARCHIVED" ||
    message === "OUTCOME_NORMALIZATION_ACTIVE_ARCHIVE_REQUIRES_REPLACEMENT"
  ) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.error("[ADMIN_OUTCOME_NORMALIZATION]", error);
  return NextResponse.json(
    process.env.NODE_ENV === "production"
      ? { error: "Server error" }
      : {
          error: "Server error",
          debug: { message: message || "Unknown error" },
        },
    { status: 500 },
  );
}

function parseFiniteNonNegativeNumber(value: unknown): number | null {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue) || numericValue < 0) return null;
  return numericValue;
}

function validateSetId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("INVALID_SET_ID");
  }
  return value;
}

function validateValues(input: unknown): Record<string, number> {
  if (!isRecord(input)) throw new Error("INVALID_VALUES");

  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!KNOWN_OUTCOME_NORMALIZATION_KEYS.has(key)) throw new Error("INVALID_VALUES");
    const parsed = parseFiniteNonNegativeNumber(value);
    if (parsed === null) throw new Error("INVALID_VALUES");
    values[key] = parsed;
  }

  return values;
}

function validateNotesByKey(input: unknown): Record<string, string> | undefined {
  if (input == null) return undefined;
  if (!isRecord(input)) throw new Error("INVALID_NOTES");

  const notesByKey: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!KNOWN_OUTCOME_NORMALIZATION_KEYS.has(key)) throw new Error("INVALID_NOTES");
    if (value == null) continue;
    if (typeof value !== "string") throw new Error("INVALID_NOTES");
    notesByKey[key] = value;
  }
  return notesByKey;
}

async function buildAdminResponse(selectedSetId?: string | null) {
  const activeSnapshot = await ensureSeedOutcomeNormalizationSet();
  const selectedSnapshot = selectedSetId
    ? await getOutcomeNormalizationSetById(selectedSetId)
    : activeSnapshot;

  if (!selectedSnapshot) throw new Error("OUTCOME_NORMALIZATION_SET_NOT_FOUND");

  return {
    activeSetId: activeSnapshot.setId,
    sets: await listOutcomeNormalizationSets(),
    selectedSet: selectedSnapshot,
  };
}

export async function GET(req: Request) {
  try {
    await requireAdminUserId();
    const setId = new URL(req.url).searchParams.get("setId");
    return NextResponse.json(await buildAdminResponse(setId));
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as
      | { action?: unknown; name?: unknown; notes?: unknown }
      | null;

    if (body?.action !== "createDraftFromActive") {
      throw new Error("INVALID_ACTION");
    }

    const createdSet = await createDraftOutcomeNormalizationSetFromActive({
      name: typeof body.name === "string" ? body.name : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });

    return NextResponse.json({
      createdSet,
      ...(await buildAdminResponse(createdSet.setId)),
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as
      | {
          action?: unknown;
          setId?: unknown;
          values?: unknown;
          notesByKey?: unknown;
        }
      | null;

    if (body?.action === "saveDraftValues") {
      const setId = validateSetId(body.setId);
      const values = validateValues(body.values);
      const notesByKey = validateNotesByKey(body.notesByKey);
      const selectedSet = await saveOutcomeNormalizationSetValues(setId, values, notesByKey);
      return NextResponse.json(await buildAdminResponse(selectedSet.setId));
    }

    if (body?.action === "activateDraft") {
      const setId = validateSetId(body.setId);
      const selectedSet = await activateOutcomeNormalizationSet(setId);
      return NextResponse.json(await buildAdminResponse(selectedSet.setId));
    }

    if (body?.action === "archiveSet") {
      const setId = validateSetId(body.setId);
      const selectedSet = await archiveOutcomeNormalizationSet(setId);
      return NextResponse.json(await buildAdminResponse(selectedSet.setId));
    }

    if (body?.action === "unarchiveSet") {
      const setId = validateSetId(body.setId);
      const selectedSet = await unarchiveOutcomeNormalizationSet(setId);
      return NextResponse.json(await buildAdminResponse(selectedSet.setId));
    }

    if (body?.action === "deleteArchivedSet") {
      const setId = validateSetId(body.setId);
      await deleteArchivedOutcomeNormalizationSet(setId);
      return NextResponse.json(await buildAdminResponse());
    }

    throw new Error("INVALID_ACTION");
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
