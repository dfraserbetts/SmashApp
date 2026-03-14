import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { requireUserId } from "../_shared";

const CORE_TRAIT_SEED: Array<{
  name: string;
  effectText: string;
  band: "MINOR";
  physicalThreatWeight: number;
  mentalThreatWeight: number;
  survivabilityWeight: number;
  manipulationWeight: number;
  synergyWeight: number;
  mobilityWeight: number;
  presenceWeight: number;
}> = [
  {
    name: "Tough",
    effectText: "Gain a +1 to defence",
    band: "MINOR",
    physicalThreatWeight: 0,
    mentalThreatWeight: 0,
    survivabilityWeight: 0,
    manipulationWeight: 0,
    synergyWeight: 0,
    mobilityWeight: 0,
    presenceWeight: 0,
  },
  {
    name: "Dangerous",
    effectText: "Gain a +1 to attack",
    band: "MINOR",
    physicalThreatWeight: 0,
    mentalThreatWeight: 0,
    survivabilityWeight: 0,
    manipulationWeight: 0,
    synergyWeight: 0,
    mobilityWeight: 0,
    presenceWeight: 0,
  },
  {
    name: "Smart",
    effectText: "Gain a +1 to intellect",
    band: "MINOR",
    physicalThreatWeight: 0,
    mentalThreatWeight: 0,
    survivabilityWeight: 0,
    manipulationWeight: 0,
    synergyWeight: 0,
    mobilityWeight: 0,
    presenceWeight: 0,
  },
  {
    name: "Resilient",
    effectText: "Gain a +1 to Fortitude",
    band: "MINOR",
    physicalThreatWeight: 0,
    mentalThreatWeight: 0,
    survivabilityWeight: 0,
    manipulationWeight: 0,
    synergyWeight: 0,
    mobilityWeight: 0,
    presenceWeight: 0,
  },
  {
    name: "Courageous",
    effectText: "Gain a +1 to bravery",
    band: "MINOR",
    physicalThreatWeight: 0,
    mentalThreatWeight: 0,
    survivabilityWeight: 0,
    manipulationWeight: 0,
    synergyWeight: 0,
    mobilityWeight: 0,
    presenceWeight: 0,
  },
  {
    name: "Reliable",
    effectText: "Gain a +1 to support",
    band: "MINOR",
    physicalThreatWeight: 0,
    mentalThreatWeight: 0,
    survivabilityWeight: 0,
    manipulationWeight: 0,
    synergyWeight: 0,
    mobilityWeight: 0,
    presenceWeight: 0,
  },
];

async function ensureCoreTraitsSeeded() {
  const count = await prisma.monsterTraitDefinition.count();
  if (count > 0) return;

  await prisma.monsterTraitDefinition.createMany({
    data: CORE_TRAIT_SEED.map((trait) => ({
      ...trait,
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
        band: true,
        physicalThreatWeight: true,
        mentalThreatWeight: true,
        survivabilityWeight: true,
        manipulationWeight: true,
        synergyWeight: true,
        mobilityWeight: true,
        presenceWeight: true,
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
