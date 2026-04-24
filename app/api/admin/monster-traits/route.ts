import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";
import {
  MONSTER_TRAIT_MECHANICAL_OPERATIONS,
  MONSTER_TRAIT_MECHANICAL_TARGETS,
  type MonsterTraitMechanicalOperation,
  type MonsterTraitMechanicalTarget,
} from "@/lib/summoning/traitMechanics";

const MONSTER_TRAIT_BANDS = ["MINOR", "STANDARD", "MAJOR", "BOSS"] as const;

const monsterTraitDefinitionSelect = {
  id: true,
  name: true,
  effectText: true,
  isEnabled: true,
  source: true,
  isReadOnly: true,
  band: true,
  physicalThreatWeight: true,
  mentalThreatWeight: true,
  physicalSurvivabilityWeight: true,
  mentalSurvivabilityWeight: true,
  survivabilityWeight: true,
  manipulationWeight: true,
  synergyWeight: true,
  mobilityWeight: true,
  presenceWeight: true,
  mechanicalEffects: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      target: true,
      operation: true,
      valueExpression: true,
    },
  },
} as const;

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

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEffectText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBand(value: unknown): (typeof MONSTER_TRAIT_BANDS)[number] {
  const normalized = String(value ?? "").trim().toUpperCase();
  return MONSTER_TRAIT_BANDS.includes(normalized as (typeof MONSTER_TRAIT_BANDS)[number])
    ? (normalized as (typeof MONSTER_TRAIT_BANDS)[number])
    : "STANDARD";
}

function normalizeAxisWeight(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function normalizeMechanicalEffects(value: unknown): Array<{
  sortOrder: number;
  target: MonsterTraitMechanicalTarget;
  operation: MonsterTraitMechanicalOperation;
  valueExpression: string;
}> {
  if (!Array.isArray(value)) return [];

  const effects: Array<{
    sortOrder: number;
    target: MonsterTraitMechanicalTarget;
    operation: MonsterTraitMechanicalOperation;
    valueExpression: string;
  }> = [];

  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index] as {
      target?: unknown;
      operation?: unknown;
      valueExpression?: unknown;
    };
    const target = String(raw?.target ?? "").trim();
    const operation = String(raw?.operation ?? "ADD").trim();
    const valueExpression =
      typeof raw?.valueExpression === "string" ? raw.valueExpression.trim() : "";

    if (
      !MONSTER_TRAIT_MECHANICAL_TARGETS.includes(target as MonsterTraitMechanicalTarget) ||
      !MONSTER_TRAIT_MECHANICAL_OPERATIONS.includes(operation as MonsterTraitMechanicalOperation) ||
      valueExpression.length === 0
    ) {
      continue;
    }

    effects.push({
      sortOrder: effects.length,
      target: target as MonsterTraitMechanicalTarget,
      operation: operation as MonsterTraitMechanicalOperation,
      valueExpression,
    });
  }

  return effects;
}

export async function GET() {
  try {
    await requireAdminUserId();

    const rows = await prisma.monsterTraitDefinition.findMany({
      orderBy: { name: "asc" },
      select: monsterTraitDefinitionSelect,
    });

    return NextResponse.json({ rows });
  } catch (e: unknown) {
    const msg = String((e as { message?: unknown })?.message ?? "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as
      | {
          id?: unknown;
          name?: unknown;
          effectText?: unknown;
          isEnabled?: unknown;
          band?: unknown;
          physicalThreatWeight?: unknown;
          mentalThreatWeight?: unknown;
          physicalSurvivabilityWeight?: unknown;
          mentalSurvivabilityWeight?: unknown;
          survivabilityWeight?: unknown;
          manipulationWeight?: unknown;
          synergyWeight?: unknown;
          mobilityWeight?: unknown;
          presenceWeight?: unknown;
          mechanicalEffects?: unknown;
        }
      | null;

    const id = normalizeId(body?.id);
    const name = normalizeName(body?.name);
    const effectText = normalizeEffectText(body?.effectText);
    const isEnabled = typeof body?.isEnabled === "boolean" ? body.isEnabled : true;
    const band = normalizeBand(body?.band);
    const physicalThreatWeight = normalizeAxisWeight(body?.physicalThreatWeight);
    const mentalThreatWeight = normalizeAxisWeight(body?.mentalThreatWeight);
    const physicalSurvivabilityWeight = normalizeAxisWeight(body?.physicalSurvivabilityWeight);
    const mentalSurvivabilityWeight = normalizeAxisWeight(body?.mentalSurvivabilityWeight);
    const survivabilityWeight =
      body && "survivabilityWeight" in body ? normalizeAxisWeight(body.survivabilityWeight) : 0;
    const manipulationWeight = normalizeAxisWeight(body?.manipulationWeight);
    const synergyWeight = normalizeAxisWeight(body?.synergyWeight);
    const mobilityWeight = normalizeAxisWeight(body?.mobilityWeight);
    const presenceWeight = normalizeAxisWeight(body?.presenceWeight);
    const mechanicalEffects = normalizeMechanicalEffects(body?.mechanicalEffects);

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const row = id
      ? await prisma.monsterTraitDefinition.update({
          where: { id },
          data: {
            name,
            effectText,
            isEnabled,
            band,
            physicalThreatWeight,
            mentalThreatWeight,
            physicalSurvivabilityWeight,
            mentalSurvivabilityWeight,
            survivabilityWeight,
            manipulationWeight,
            synergyWeight,
            mobilityWeight,
            presenceWeight,
            mechanicalEffects: {
              deleteMany: {},
              create: mechanicalEffects,
            },
          },
          select: monsterTraitDefinitionSelect,
        })
      : await prisma.monsterTraitDefinition.create({
          data: {
            name,
            effectText,
            isEnabled,
            source: "CORE",
            isReadOnly: true,
            band,
            physicalThreatWeight,
            mentalThreatWeight,
            physicalSurvivabilityWeight,
            mentalSurvivabilityWeight,
            survivabilityWeight,
            manipulationWeight,
            synergyWeight,
            mobilityWeight,
            presenceWeight,
            mechanicalEffects: {
              create: mechanicalEffects,
            },
          },
          select: monsterTraitDefinitionSelect,
        });

    return NextResponse.json({ row }, { status: id ? 200 : 201 });
  } catch (e: unknown) {
    const err = e as { message?: unknown; code?: string };
    const msg = String(err?.message ?? "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as
      | {
          id?: unknown;
          name?: unknown;
          effectText?: unknown;
          isEnabled?: unknown;
          band?: unknown;
          physicalThreatWeight?: unknown;
          mentalThreatWeight?: unknown;
          physicalSurvivabilityWeight?: unknown;
          mentalSurvivabilityWeight?: unknown;
          survivabilityWeight?: unknown;
          manipulationWeight?: unknown;
          synergyWeight?: unknown;
          mobilityWeight?: unknown;
          presenceWeight?: unknown;
          mechanicalEffects?: unknown;
        }
      | null;

    const id = normalizeId(body?.id);
    const name = normalizeName(body?.name);
    const effectText = normalizeEffectText(body?.effectText);
    const isEnabled = typeof body?.isEnabled === "boolean" ? body.isEnabled : undefined;
    const band = normalizeBand(body?.band);
    const physicalThreatWeight = normalizeAxisWeight(body?.physicalThreatWeight);
    const mentalThreatWeight = normalizeAxisWeight(body?.mentalThreatWeight);
    const physicalSurvivabilityWeight = normalizeAxisWeight(body?.physicalSurvivabilityWeight);
    const mentalSurvivabilityWeight = normalizeAxisWeight(body?.mentalSurvivabilityWeight);
    const legacySurvivabilityUpdate =
      body && "survivabilityWeight" in body
        ? { survivabilityWeight: normalizeAxisWeight(body.survivabilityWeight) }
        : {};
    const manipulationWeight = normalizeAxisWeight(body?.manipulationWeight);
    const synergyWeight = normalizeAxisWeight(body?.synergyWeight);
    const mobilityWeight = normalizeAxisWeight(body?.mobilityWeight);
    const presenceWeight = normalizeAxisWeight(body?.presenceWeight);
    const mechanicalEffects = normalizeMechanicalEffects(body?.mechanicalEffects);

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const row = await prisma.monsterTraitDefinition.update({
      where: { id },
      data: {
        name,
        effectText,
        band,
        physicalThreatWeight,
        mentalThreatWeight,
        physicalSurvivabilityWeight,
        mentalSurvivabilityWeight,
        ...legacySurvivabilityUpdate,
        manipulationWeight,
        synergyWeight,
        mobilityWeight,
        presenceWeight,
        mechanicalEffects: {
          deleteMany: {},
          create: mechanicalEffects,
        },
        ...(isEnabled === undefined ? {} : { isEnabled }),
      },
      select: monsterTraitDefinitionSelect,
    });

    return NextResponse.json({ row });
  } catch (e: unknown) {
    const err = e as { message?: unknown; code?: string };
    const msg = String(err?.message ?? "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdminUserId();

    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const id = normalizeId(body?.id);
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const usageCount = await prisma.monsterTrait.count({ where: { traitDefinitionId: id } });
    if (usageCount > 0) {
      return NextResponse.json(
        { error: "Cannot delete trait definition: it is currently assigned to one or more monsters." },
        { status: 400 },
      );
    }

    await prisma.monsterTraitDefinition.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = String((e as { message?: unknown })?.message ?? "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
