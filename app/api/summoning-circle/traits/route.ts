import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { requireUserId } from "../_shared";

const CORE_TRAIT_SEED: Array<{ name: string; effectText: string }> = [
  { name: "Tough", effectText: "Gain a +1 to defence" },
  { name: "Dangerous", effectText: "Gain a +1 to attack" },
  { name: "Smart", effectText: "Gain a +1 to intellect" },
  { name: "Resilient", effectText: "Gain a +1 to Fortitude" },
  { name: "Courageous", effectText: "Gain a +1 to bravery" },
  { name: "Reliable", effectText: "Gain a +1 to support" },
];

async function ensureCoreTraitsSeeded() {
  const count = await prisma.monsterTraitDefinition.count();
  if (count > 0) return;

  await prisma.monsterTraitDefinition.createMany({
    data: CORE_TRAIT_SEED.map((trait) => ({
      name: trait.name,
      effectText: trait.effectText,
      source: "CORE",
      isReadOnly: true,
      isEnabled: true,
    })),
    skipDuplicates: true,
  });
}

export async function GET() {
  try {
    await requireUserId();
    await ensureCoreTraitsSeeded();

    const rows = await prisma.monsterTraitDefinition.findMany({
      where: {
        source: "CORE",
        isEnabled: true,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        effectText: true,
      },
    });

    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load traits";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[SUMMONING_TRAITS_GET]", error);
    return NextResponse.json({ error: "Failed to load traits" }, { status: 500 });
  }
}

