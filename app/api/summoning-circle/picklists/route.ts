import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { requireUserId } from "../_shared";
import { isSelectableDamageTypeName } from "@/lib/damageTypes/selectable";

function selectableDamageTypes(
  damageTypes: Array<{ id: number; name: string; attackMode?: unknown }>,
) {
  return damageTypes
    .filter((damageType) => isSelectableDamageTypeName(damageType.name))
    .sort((a, b) => a.name.localeCompare(b.name));
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
      damageTypes: selectableDamageTypes(damageTypes),
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
