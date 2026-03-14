import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";

type ForgeCostRow = {
  id: number;
  category: string;
  selector1: string;
  selector2: string | null;
  selector3: string | null;
  value: number;
  notes: string | null;
};

const VALID_FORGE_COST_CATEGORIES = new Set([
  "AoECenterRangeFt",
  "AoECount",
  "ArmorAttributes",
  "Attribute",
  "Aura_Mental",
  "Aura_Physical",
  "ConeLengthFt",
  "DmgType_Count",
  "GS_AttackEffects",
  "GS_DefEffects",
  "ItemModifiers",
  "ItemType",
  "LineLengthFt",
  "LineWidthFt",
  "MeleeTargets",
  "RangeCategory",
  "RangedDistanceFt",
  "RangedTargets",
  "SanctifiedOptions",
  "ShieldAttributes",
  "ShieldHasAttack",
  "SphereSizeFt",
  "Stat",
  "VRPOptions",
  "WardingOptions",
  "WeaponAttributes",
]);

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

async function requireAdmin(): Promise<void> {
  const userId = await getUserIdFromSupabaseSSR();
  if (!userId) throw new Error("UNAUTHENTICATED");

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { isAdmin: true },
  });

  if (!profile?.isAdmin) throw new Error("FORBIDDEN");
}

function statusFromErr(e: any) {
  const msg = String(e?.message ?? "");
  if (msg === "UNAUTHENTICATED") return 401;
  if (msg === "FORBIDDEN") return 403;
  return 500;
}

function debugErrorPayload(error: unknown) {
  if (process.env.NODE_ENV === "production") return undefined;
  const e = error as {
    message?: unknown;
    code?: unknown;
    stack?: unknown;
    cause?: unknown;
  } | null;
  return {
    message: String(e?.message ?? "Unknown error"),
    code: e?.code ?? null,
    cause: e?.cause ?? null,
    stack: typeof e?.stack === "string" ? e.stack : null,
  };
}

async function getForgeCostContexts(category: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ selector1: string }>>`
    SELECT DISTINCT "selector1"
    FROM "ForgeCostEntry"
    WHERE "category" = CAST(${category} AS "ForgeCostCategory")
    ORDER BY "selector1" ASC
  `;
  return rows.map((row) => row.selector1);
}

async function getForgeCostRows(
  category: string,
  selector2: string,
  selector3: string | null,
): Promise<ForgeCostRow[]> {
  return prisma.$queryRaw<ForgeCostRow[]>`
    SELECT
      "id",
      "category"::text AS "category",
      "selector1",
      "selector2",
      "selector3",
      "value",
      "notes"
    FROM "ForgeCostEntry"
    WHERE "category" = CAST(${category} AS "ForgeCostCategory")
      AND "selector2" = ${selector2}
      AND "selector3" IS NOT DISTINCT FROM ${selector3}
    ORDER BY "selector1" ASC
  `;
}

async function createForgeCostRow(args: {
  category: string;
  selector1: string;
  selector2: string | null;
  selector3: string | null;
  value: number;
  notes: string | null;
}): Promise<ForgeCostRow> {
  const rows = await prisma.$queryRaw<ForgeCostRow[]>`
    INSERT INTO "ForgeCostEntry" (
      "category",
      "selector1",
      "selector2",
      "selector3",
      "value",
      "notes"
    )
    VALUES (
      CAST(${args.category} AS "ForgeCostCategory"),
      ${args.selector1},
      ${args.selector2},
      ${args.selector3},
      ${args.value},
      ${args.notes}
    )
    RETURNING
      "id",
      "category"::text AS "category",
      "selector1",
      "selector2",
      "selector3",
      "value",
      "notes"
  `;

  const created = rows[0];
  if (!created) throw new Error("CREATE_FAILED");
  return created;
}

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);

    const category = (searchParams.get("category") ?? "").trim();
    const selector2 = (searchParams.get("selector2") ?? "").trim();
    const selector3Raw = searchParams.get("selector3");
    const selector3 =
      selector3Raw === null || selector3Raw.trim() === "" ? null : selector3Raw.trim();

    if (!category) {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }
    if (!VALID_FORGE_COST_CATEGORIES.has(category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }

    const contexts = await getForgeCostContexts(category);

    // If selector2 isn't provided, return just contexts (useful later)
    if (!selector2) {
      return NextResponse.json({ contexts, rows: [] });
    }

    const rows = await getForgeCostRows(category, selector2, selector3);

    return NextResponse.json({ contexts, rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to load forge costs" },
      { status: statusFromErr(e) },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const body = (await req.json().catch(() => null)) as
      | {
          category?: unknown;
          selector1?: unknown;
          selector2?: unknown;
          selector3?: unknown;
          value?: unknown;
          notes?: unknown;
        }
      | null;

    const category = typeof body?.category === "string" ? body.category.trim() : "";
    const selector1 = typeof body?.selector1 === "string" ? body.selector1.trim() : "";
    const selector2Raw = typeof body?.selector2 === "string" ? body.selector2.trim() : "";
    const selector2 =
      category === "ItemModifiers"
        ? selector2Raw || null
        : selector2Raw;
    const selector3 =
      typeof body?.selector3 === "string" && body.selector3.trim() !== ""
        ? body.selector3.trim()
        : null;

    const valueRaw = body?.value;
    const value =
      typeof valueRaw === "number"
        ? valueRaw
        : typeof valueRaw === "string"
          ? Number.parseFloat(valueRaw)
          : NaN;

    const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

    if (!category) return NextResponse.json({ error: "category is required" }, { status: 400 });
    if (!VALID_FORGE_COST_CATEGORIES.has(category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    if (!selector1) return NextResponse.json({ error: "selector1 is required" }, { status: 400 });
    if (category !== "ItemModifiers" && !selector2) {
      return NextResponse.json({ error: "selector2 is required" }, { status: 400 });
    }
    if (!Number.isFinite(value)) return NextResponse.json({ error: "value must be a number" }, { status: 400 });

    const created = await createForgeCostRow({
      category,
      selector1,
      selector2,
      selector3,
      value,
      notes,
    });

    return NextResponse.json({ row: created }, { status: 201 });
  } catch (e: any) {
    console.error("[ADMIN_FORGE_COSTS_POST]", debugErrorPayload(e));
    // unique constraint (if your schema enforces uniqueness on the selector tuple)
    if (e?.code === "P2002" || e?.code === "23505") {
      return NextResponse.json({ error: "Duplicate cost entry" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Failed to create forge cost", debug: debugErrorPayload(e) },
      { status: statusFromErr(e) },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();

    const body = (await req.json().catch(() => null)) as
      | { id?: unknown; value?: unknown; notes?: unknown }
      | null;

    const idRaw = body?.id;
    const id =
      typeof idRaw === "number"
        ? idRaw
        : typeof idRaw === "string"
          ? Number.parseInt(idRaw, 10)
          : NaN;

    const valueRaw = body?.value;
    const value =
      typeof valueRaw === "number"
        ? valueRaw
        : typeof valueRaw === "string"
          ? Number.parseFloat(valueRaw)
          : NaN;

    const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

    if (!Number.isFinite(id)) return NextResponse.json({ error: "id must be a number" }, { status: 400 });
    if (!Number.isFinite(value)) return NextResponse.json({ error: "value must be a number" }, { status: 400 });

    const updated = await prisma.forgeCostEntry.update({
      where: { id },
      data: { value, notes },
      select: {
        id: true,
        category: true,
        selector1: true,
        selector2: true,
        selector3: true,
        value: true,
        notes: true,
      },
    });

    return NextResponse.json({ row: updated });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to update forge cost" },
      { status: statusFromErr(e) },
    );
  }
}
