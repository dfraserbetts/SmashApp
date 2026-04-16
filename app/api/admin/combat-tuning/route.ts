// ADMIN_COMBAT_TUNING_API
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";
import {
  activateCombatTuningSet,
  archiveCombatTuningSet,
  createDraftCombatTuningSetFromActive,
  deleteArchivedCombatTuningSet,
  ensureSeedCombatTuningSet,
  getCombatTuningSetById,
  listCombatTuningSets,
  saveCombatTuningSetValues,
  unarchiveCombatTuningSet,
} from "@/lib/config/combatTuning";
import {
  COMBAT_TUNING_CONFIG_KEY_ORDER,
  validateCombatTuningConfigValue,
  type CombatTuningValueValidationIssue,
} from "@/lib/config/combatTuningShared";

const KNOWN_COMBAT_TUNING_KEYS = new Set(COMBAT_TUNING_CONFIG_KEY_ORDER);

class CombatTuningValidationError extends Error {
  issue: CombatTuningValueValidationIssue;

  constructor(issue: CombatTuningValueValidationIssue) {
    super("INVALID_VALUES");
    this.issue = issue;
  }
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
    message === "COMBAT_TUNING_SET_NOT_FOUND" ||
    message === "COMBAT_TUNING_SET_NOT_EDITABLE" ||
    message === "COMBAT_TUNING_SET_NOT_DRAFT" ||
    message === "COMBAT_TUNING_SET_NOT_ARCHIVED" ||
    message === "COMBAT_TUNING_ACTIVE_ARCHIVE_REQUIRES_REPLACEMENT"
  ) {
    if (error instanceof CombatTuningValidationError && process.env.NODE_ENV !== "production") {
      return NextResponse.json(
        {
          error: message,
          debug: {
            offendingKey: error.issue.key,
            offendingRawValue: error.issue.rawValue,
            reason: error.issue.reason,
            requirement: error.issue.requirement,
          },
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.error("[ADMIN_COMBAT_TUNING]", error);
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
    const validation = validateCombatTuningConfigValue(key, value);
    if (!validation.ok) throw new CombatTuningValidationError(validation.issue);
    values[key] = validation.value;
  }

  return values;
}

function validateNotesByKey(input: unknown): Record<string, string> | undefined {
  if (input == null) return undefined;
  if (!isRecord(input)) throw new Error("INVALID_NOTES");

  const notesByKey: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!KNOWN_COMBAT_TUNING_KEYS.has(key)) throw new Error("INVALID_NOTES");
    if (value == null) continue;
    if (typeof value !== "string") throw new Error("INVALID_NOTES");
    notesByKey[key] = value;
  }
  return notesByKey;
}

async function buildAdminResponse(selectedSetId?: string | null) {
  const activeSnapshot = await ensureSeedCombatTuningSet();
  const selectedSnapshot = selectedSetId
    ? await getCombatTuningSetById(selectedSetId)
    : activeSnapshot;

  if (!selectedSnapshot) throw new Error("COMBAT_TUNING_SET_NOT_FOUND");

  return {
    activeSetId: activeSnapshot.setId,
    sets: await listCombatTuningSets(),
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

    const createdSet = await createDraftCombatTuningSetFromActive({
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
      const selectedSet = await saveCombatTuningSetValues(setId, values, notesByKey);
      return NextResponse.json(await buildAdminResponse(selectedSet.setId));
    }

    if (body?.action === "activateDraft") {
      const setId = validateSetId(body.setId);
      const selectedSet = await activateCombatTuningSet(setId);
      return NextResponse.json(await buildAdminResponse(selectedSet.setId));
    }

    if (body?.action === "archiveSet") {
      const setId = validateSetId(body.setId);
      const selectedSet = await archiveCombatTuningSet(setId);
      return NextResponse.json(await buildAdminResponse(selectedSet.setId));
    }

    if (body?.action === "unarchiveSet") {
      const setId = validateSetId(body.setId);
      const selectedSet = await unarchiveCombatTuningSet(setId);
      return NextResponse.json(await buildAdminResponse(selectedSet.setId));
    }

    if (body?.action === "deleteArchivedSet") {
      const setId = validateSetId(body.setId);
      await deleteArchivedCombatTuningSet(setId);
      return NextResponse.json(await buildAdminResponse());
    }

    throw new Error("INVALID_ACTION");
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
