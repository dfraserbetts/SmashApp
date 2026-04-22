import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { requireUserId } from "../_shared";

function withRequiredDamageTypes(
  damageTypes: Array<{ id: number; name: string; attackMode?: unknown }>,
) {
  const next = damageTypes.map((damageType) =>
    damageType.name.trim().toLowerCase() === "corruption"
      ? { ...damageType, attackMode: "MENTAL" as const }
      : damageType,
  );

  if (!next.some((damageType) => damageType.name.trim().toLowerCase() === "corruption")) {
    next.push({ id: -1, name: "Corruption", attackMode: "MENTAL" });
  }

  return next.sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET() {
  try {
    await requireUserId();

    const [damageTypes, attackEffects] = await Promise.all([
      prisma.damageType.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, attackMode: true },
      }),
      prisma.attackEffect.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          tooltip: true,
          damageTypeLinks: { select: { damageTypeId: true } },
        },
      }),
    ]);

    return NextResponse.json({
      damageTypes: withRequiredDamageTypes(damageTypes),
      attackEffects: attackEffects.map((row) => ({
        id: row.id,
        name: row.name,
        tooltip: row.tooltip,
        damageTypeIds: row.damageTypeLinks.map((link) => link.damageTypeId),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load picklists";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[SUMMONING_PICKLISTS_GET]", error);
    return NextResponse.json({ error: "Failed to load picklists" }, { status: 500 });
  }
}
