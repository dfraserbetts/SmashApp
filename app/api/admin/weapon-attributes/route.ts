import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";

const WEAPON_ATTRIBUTE_TOKEN_WHITELIST = new Set<string>([
  "[MeleePhysicalStrength]",
  "[MeleeMentalStrength]",
  "[RangedPhysicalStrength]",
  "[RangedMentalStrength]",
  "[AoePhysicalStrength]",
  "[AoeMentalStrength]",
  "[ChosenPhysicalStrength]",

  // Parameterised strength selection (chosen per Item ↔ WeaponAttribute join)
  "[ChosenPhysicalStrength]",
  "[ChosenMentalStrength]",
  "[ChosenRange]",

  "[AttributeValue]",

  // Weapon context (selected on this weapon)
  "[GS_AttackEffects]",
  "[DamageTypes]",

  // Range context
  "[MeleeTargets]",
  "[RangedTargets]",
  "[RangedDistanceFeet]",
  "[AoeCount]",
  "[AoeCenterRangeFeet]",
  "[AoeShape]",
  "[AoeSphereRadiusFeet]",
  "[AoeConeLengthFeet]",
  "[AoeLineWidthFeet]",
  "[AoeLineLengthFeet]",
]);

function extractTokens(s: string): string[] {
  const matches = s.match(/\[[^\]]+\]/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of matches) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function validateDescriptorTemplateOrThrow(tpl: string) {
  const tokens = extractTokens(tpl);
  const unknown = tokens.filter((t) => !WEAPON_ATTRIBUTE_TOKEN_WHITELIST.has(t));
  if (unknown.length) {
    throw new Error(`UNKNOWN_TOKENS:${unknown.join(",")}`);
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

    const rows = await prisma.weaponAttribute.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        descriptorTemplate: true,
        descriptorNotes: true,
        requiresRange: true,
        requiresAoeShape: true,
        requiresStrengthSource: true,
        requiresRangeSelection: true,
        requiresStrengthKind: true,
      } as any,
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
        {
          id?: unknown;
          name?: unknown;
          descriptorTemplate?: unknown;
          descriptorNotes?: unknown;
          requiresRange?: unknown;
          requiresAoeShape?: unknown;
          requiresStrengthSource?: unknown;
          requiresRangeSelection?: unknown;
          requiresStrengthKind?: unknown;
        }
      | null;
      
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name)
      return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const descriptorTemplate =
      typeof body?.descriptorTemplate === "string"
        ? body.descriptorTemplate.trim()
        : "";

    const descriptorNotes =
      typeof body?.descriptorNotes === "string" ? body.descriptorNotes.trim() : "";

    const requiresRangeRaw = body?.requiresRange;
    const requiresAoeShapeRaw = body?.requiresAoeShape;
    const requiresStrengthSourceRaw = body?.requiresStrengthSource;
    const requiresStrengthKindRaw = (body as any)?.requiresStrengthKind;

    const requiresRange =
      requiresRangeRaw === "MELEE" ||
      requiresRangeRaw === "RANGED" ||
      requiresRangeRaw === "AOE"
        ? requiresRangeRaw
        : null;

    const requiresAoeShape =
      requiresAoeShapeRaw === "SPHERE" ||
      requiresAoeShapeRaw === "CONE" ||
      requiresAoeShapeRaw === "LINE"
        ? requiresAoeShapeRaw
        : null;
    const requiresStrengthSource =
      typeof requiresStrengthSourceRaw === "boolean"
        ? requiresStrengthSourceRaw
        : false;

    const requiresStrengthKind =
      requiresStrengthKindRaw === "PHYSICAL" || requiresStrengthKindRaw === "MENTAL"
        ? requiresStrengthKindRaw
        : null;
        
    if (descriptorTemplate) {
      validateDescriptorTemplateOrThrow(descriptorTemplate);
    }

    const created = await prisma.weaponAttribute.create({
      data: {
        name,
        descriptorTemplate: descriptorTemplate || null,
        descriptorNotes: descriptorNotes || null,
        requiresRange,
        requiresAoeShape,
        requiresStrengthSource,
        requiresStrengthKind,
      } as any,
      select: {
        id: true,
        name: true,
        descriptorTemplate: true,
        descriptorNotes: true,
        requiresRange: true,
        requiresAoeShape: true,
        requiresStrengthSource: true,
        requiresRangeSelection: true,
        requiresStrengthKind: true,
      } as any,
    });

    return NextResponse.json({ row: created }, { status: 201 });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.startsWith("UNKNOWN_TOKENS:")) {
      const tokens = msg.replace("UNKNOWN_TOKENS:", "");
      return NextResponse.json(
        { error: `Unknown token(s): ${tokens}` },
        { status: 400 },
      );
    }

    // Prisma unique constraint violation
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "Name already exists" },
        { status: 409 },
      );
    }

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
        {
          id?: unknown;
          name?: unknown;
          descriptorTemplate?: unknown;
          descriptorNotes?: unknown;
          requiresRange?: unknown;
          requiresAoeShape?: unknown;
          requiresStrengthSource?: unknown;
          requiresRangeSelection?: unknown;
          requiresStrengthKind?: unknown;
        }
      | null;

    const idRaw = body?.id;
    const id =
      typeof idRaw === "number"
        ? idRaw
        : typeof idRaw === "string"
          ? Number(idRaw)
          : NaN;

    const name = typeof body?.name === "string" ? body.name.trim() : "";

    const descriptorTemplate =
      typeof body?.descriptorTemplate === "string"
        ? body.descriptorTemplate.trim()
        : null;

    const descriptorNotes =
      typeof body?.descriptorNotes === "string"
        ? body.descriptorNotes.trim()
        : null;

    const requiresRangeRaw = body?.requiresRange;
    const requiresAoeShapeRaw = body?.requiresAoeShape;
    const requiresStrengthSourceRaw = body?.requiresStrengthSource;
    const requiresStrengthKindRaw = (body as any)?.requiresStrengthKind;

    const requiresRange =
      requiresRangeRaw === "MELEE" ||
      requiresRangeRaw === "RANGED" ||
      requiresRangeRaw === "AOE"
        ? requiresRangeRaw
        : null;

    const requiresAoeShape =
      requiresAoeShapeRaw === "SPHERE" ||
      requiresAoeShapeRaw === "CONE" ||
      requiresAoeShapeRaw === "LINE"
        ? requiresAoeShapeRaw
        : null;
    const requiresStrengthSource =
    typeof body?.requiresStrengthSource === "boolean"
      ? body.requiresStrengthSource
      : undefined;

    const requiresStrengthKind =
    requiresStrengthKindRaw === "PHYSICAL" || requiresStrengthKindRaw === "MENTAL"
      ? requiresStrengthKindRaw
      : null;

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be a number" }, { status: 400 });
    }

    // Backwards compatible: if caller doesn't send name, we don't force it.
    // But if they DO send it, it must be non-empty.
    if ("name" in (body ?? {}) && !name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const data: any = {};
    if ("name" in (body ?? {})) data.name = name;

    if ("descriptorTemplate" in (body ?? {})) {
      if (descriptorTemplate) {
        validateDescriptorTemplateOrThrow(descriptorTemplate);
      }
      data.descriptorTemplate = descriptorTemplate || null;
    }

    if ("descriptorNotes" in (body ?? {}))
      data.descriptorNotes = descriptorNotes || null;

    if ("requiresRange" in (body ?? {})) data.requiresRange = requiresRange;

    if ("requiresAoeShape" in (body ?? {})) data.requiresAoeShape = requiresAoeShape;

    if ("requiresStrengthSource" in (body ?? {})) {
      data.requiresStrengthSource = requiresStrengthSource;
    }

    if ("requiresRangeSelection" in (body ?? {})) {
      data.requiresRangeSelection = Boolean((body as any)?.requiresRangeSelection);
    }

    if ("requiresStrengthKind" in (body ?? {})) {
      data.requiresStrengthKind = requiresStrengthKind;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const updated = await prisma.weaponAttribute.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        descriptorTemplate: true,
        descriptorNotes: true,
        requiresRange: true,
        requiresAoeShape: true,
        requiresStrengthSource: true,
        requiresRangeSelection: true,
        requiresStrengthKind: true,
      } as any,
    });

    return NextResponse.json({ row: updated });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.startsWith("UNKNOWN_TOKENS:")) {
      const tokens = msg.replace("UNKNOWN_TOKENS:", "");
      return NextResponse.json(
        { error: `Unknown token(s): ${tokens}` },
        { status: 400 },
      );
    }

    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "Name already exists" },
        { status: 409 },
      );
    }

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

    await prisma.weaponAttribute.delete({ where: { id } });

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
