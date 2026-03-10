import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";

type AttackEffectRow = {
  id: number;
  name: string;
  tooltip: string | null;
  damageTypeLinks: Array<{ damageTypeId: number }>;
};

type AttackEffectSyncClient = Pick<
  typeof prisma,
  "attackEffectDamageType" | "damageType" | "wardingOption" | "sanctifiedOption"
>;

function parseNumericId(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function parseDamageTypeIds(value: unknown): number[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const out = new Set<number>();
  for (const raw of value) {
    const id = parseNumericId(raw);
    if (!Number.isFinite(id)) return null;
    out.add(id);
  }
  return Array.from(out);
}

function rowToResponse(row: AttackEffectRow) {
  return {
    id: row.id,
    name: row.name,
    tooltip: row.tooltip,
    damageTypeIds: row.damageTypeLinks.map((link) => link.damageTypeId),
  };
}

function normalizeAttackMode(value: unknown): "PHYSICAL" | "MENTAL" {
  return String(value ?? "").trim().toUpperCase() === "MENTAL" ? "MENTAL" : "PHYSICAL";
}

async function syncDerivedDefenceOptionsForAttackEffect(
  db: AttackEffectSyncClient,
  input: { attackEffectId: number; nextName: string; previousName?: string | null },
) {
  const links = await db.attackEffectDamageType.findMany({
    where: { attackEffectId: input.attackEffectId },
    select: { damageTypeId: true },
  });
  if (links.length === 0) return;

  const linkedDamageTypeIds = links.map((link) => link.damageTypeId);
  const damageTypes = await db.damageType.findMany({
    where: { id: { in: linkedDamageTypeIds } },
    select: { id: true, attackMode: true },
  });

  let hasPhysical = false;
  let hasMental = false;
  for (const dt of damageTypes) {
    const mode = normalizeAttackMode(dt.attackMode);
    if (mode === "MENTAL") hasMental = true;
    else hasPhysical = true;
  }

  const nextName = input.nextName.trim();
  const previousName = (input.previousName ?? "").trim();
  const didRename = previousName.length > 0 && previousName !== nextName;

  if (hasPhysical) {
    if (didRename) {
      const nextExists = await db.wardingOption.findUnique({
        where: { name: nextName },
        select: { id: true },
      });
      if (!nextExists) {
        await db.wardingOption.updateMany({
          where: { name: previousName },
          data: { name: nextName },
        });
      }
    }
    await db.wardingOption.upsert({
      where: { name: nextName },
      update: {},
      create: { name: nextName },
    });
  }

  if (hasMental) {
    if (didRename) {
      const nextExists = await db.sanctifiedOption.findUnique({
        where: { name: nextName },
        select: { id: true },
      });
      if (!nextExists) {
        await db.sanctifiedOption.updateMany({
          where: { name: previousName },
          data: { name: nextName },
        });
      }
    }
    await db.sanctifiedOption.upsert({
      where: { name: nextName },
      update: {},
      create: { name: nextName },
    });
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

export async function GET() {
  try {
    await requireAdminUserId();

    const rows = await prisma.attackEffect.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        tooltip: true,
        damageTypeLinks: { select: { damageTypeId: true } },
      },
    });

    return NextResponse.json({ rows: rows.map(rowToResponse) });
  } catch (e: unknown) {
    const msg = String((e as { message?: unknown })?.message ?? "");
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
      | { name?: unknown; tooltip?: unknown; damageTypeIds?: unknown }
      | null;

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name)
      return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const damageTypeIds = parseDamageTypeIds(body?.damageTypeIds);
    const tooltip =
      typeof body?.tooltip === "string" ? body.tooltip.trim() : null;
    if (damageTypeIds === null) {
      return NextResponse.json(
        { error: "damageTypeIds must be an array of numeric ids" },
        { status: 400 },
      );
    }

    if (damageTypeIds.length) {
      const existingDamageTypes = await prisma.damageType.findMany({
        where: { id: { in: damageTypeIds } },
        select: { id: true },
      });
      if (existingDamageTypes.length !== damageTypeIds.length) {
        return NextResponse.json(
          { error: "One or more damageTypeIds are invalid" },
          { status: 400 },
        );
      }
    }

    const created = await prisma.attackEffect.create({
      data: {
        name,
        tooltip,
        damageTypeLinks: damageTypeIds.length
          ? {
              create: damageTypeIds.map((damageTypeId) => ({ damageTypeId })),
            }
          : undefined,
      },
      select: {
        id: true,
        name: true,
        tooltip: true,
        damageTypeLinks: { select: { damageTypeId: true } },
      },
    });
    await syncDerivedDefenceOptionsForAttackEffect(prisma, {
      attackEffectId: created.id,
      nextName: created.name,
    });

    return NextResponse.json({ row: rowToResponse(created) }, { status: 201 });
  } catch (e: unknown) {
    // Prisma unique constraint violation
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        { error: "Name already exists" },
        { status: 409 },
      );
    }
    const msg = String((e as { message?: unknown })?.message ?? "");
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
      | { id?: unknown; name?: unknown; tooltip?: unknown; damageTypeIds?: unknown }
      | null;

    const idRaw = body?.id;
    const id = parseNumericId(idRaw);

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const tooltip =
      typeof body?.tooltip === "string" ? body.tooltip.trim() : null;
    const hasDamageTypeIds = body?.damageTypeIds !== undefined;
    const damageTypeIds = hasDamageTypeIds ? parseDamageTypeIds(body?.damageTypeIds) : [];

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be a number" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (hasDamageTypeIds && damageTypeIds === null) {
      return NextResponse.json(
        { error: "damageTypeIds must be an array of numeric ids" },
        { status: 400 },
      );
    }
    if (hasDamageTypeIds && damageTypeIds && damageTypeIds.length) {
      const existingDamageTypes = await prisma.damageType.findMany({
        where: { id: { in: damageTypeIds } },
        select: { id: true },
      });
      if (existingDamageTypes.length !== damageTypeIds.length) {
        return NextResponse.json(
          { error: "One or more damageTypeIds are invalid" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.attackEffect.findUniqueOrThrow({
        where: { id },
        select: { name: true },
      });

      await tx.attackEffect.update({
        where: { id },
        data: { name, tooltip },
      });

      if (hasDamageTypeIds) {
        await tx.attackEffectDamageType.deleteMany({ where: { attackEffectId: id } });
        if (damageTypeIds && damageTypeIds.length) {
          await tx.attackEffectDamageType.createMany({
            data: damageTypeIds.map((damageTypeId) => ({ attackEffectId: id, damageTypeId })),
            skipDuplicates: true,
          });
        }
      }

      await syncDerivedDefenceOptionsForAttackEffect(tx, {
        attackEffectId: id,
        nextName: name,
        previousName: existing.name,
      });

      return tx.attackEffect.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          name: true,
          tooltip: true,
          damageTypeLinks: { select: { damageTypeId: true } },
        },
      });
    });

    return NextResponse.json({ row: rowToResponse(updated) });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        { error: "Name already exists" },
        { status: 409 },
      );
    }
    const msg = String((e as { message?: unknown })?.message ?? "");
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
    const id = parseNumericId(idRaw);

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id must be a number" }, { status: 400 });
    }

    await prisma.attackEffect.delete({ where: { id } });

    return NextResponse.json({ ok: true });

  } catch (e: unknown) {
    // FK constraint violation (if referenced somewhere)
    if ((e as { code?: string })?.code === "P2003") {
      return NextResponse.json(
        { error: "Cannot delete: value is in use" },
        { status: 409 },
      );
    }
    const msg = String((e as { message?: unknown })?.message ?? "");
    if (msg === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "FORBIDDEN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
