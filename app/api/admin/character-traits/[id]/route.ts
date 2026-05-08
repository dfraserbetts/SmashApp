import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import { prisma } from "@/prisma/client";

const characterTraitSelect = {
  id: true,
  name: true,
  descriptor: true,
  classification: true,
  pointValue: true,
  isActive: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function requireAdminUserId() {
  const userId = await requireUserId();
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { isAdmin: true },
  });
  if (!profile?.isAdmin) throw new Error("FORBIDDEN");
  return userId;
}

function normalizeString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeClassification(value: unknown) {
  return value === "NEGATIVE" ? "NEGATIVE" : "POSITIVE";
}

function normalizePointValue(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 1;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (message === "FORBIDDEN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if ((error as { code?: unknown })?.code === "P2002") {
    return NextResponse.json({ error: "Character Trait name already exists" }, { status: 409 });
  }
  console.error("[ADMIN_CHARACTER_TRAIT]", error);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminUserId();
    const { id } = await context.params;
    const traitId = String(id ?? "").trim();
    if (!traitId) {
      return NextResponse.json({ error: "Character Trait id is required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      descriptor?: unknown;
      classification?: unknown;
      pointValue?: unknown;
      isActive?: unknown;
      notes?: unknown;
    };

    const name = normalizeString(body.name, 120);
    const descriptor = normalizeString(body.descriptor, 4000);
    const classification = normalizeClassification(body.classification);
    const pointValue = normalizePointValue(body.pointValue);
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;
    const notes = normalizeString(body.notes, 2000) || null;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!descriptor) {
      return NextResponse.json({ error: "Descriptor is required" }, { status: 400 });
    }

    const row = await prisma.playerTrait.update({
      where: { id: traitId },
      data: {
        name,
        descriptor,
        classification,
        pointValue,
        isActive,
        notes,
      },
      select: characterTraitSelect,
    });

    return NextResponse.json({ row });
  } catch (error) {
    return errorResponse(error);
  }
}
