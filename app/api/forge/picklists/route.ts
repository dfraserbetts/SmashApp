// app/api/forge/picklists/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '../../../../prisma/client'; // adjust path if you move client.ts

type ForgeCostPicklistRow = {
  id: number;
  category: string;
  selector1: string;
  selector2: string | null;
  selector3: string | null;
  value: number;
  notes: string | null;
};

export async function GET() {
  try {
    const [
      damageTypes,
      attackEffectsRaw,
      defEffects,
      weaponAttributes,
      armorAttributes,
      shieldAttributes,
      configEntries,
      costEntries,
    ] = await Promise.all([
      prisma.damageType.findMany({ orderBy: { name: 'asc' } }),
      prisma.attackEffect.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          tooltip: true,
          damageTypeLinks: { select: { damageTypeId: true } },
        },
      }),
      prisma.defEffect.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, tooltip: true },
      }),
      prisma.weaponAttribute.findMany({ orderBy: { name: 'asc' } }),
      prisma.armorAttribute.findMany({ orderBy: { name: 'asc' } }),
      prisma.shieldAttribute.findMany({ orderBy: { name: 'asc' } }),
      prisma.forgeConfigEntry.findMany(),
      prisma.$queryRaw<ForgeCostPicklistRow[]>`
        SELECT
          "id",
          "category"::text AS "category",
          "selector1",
          "selector2",
          "selector3",
          "value",
          "notes"
        FROM "ForgeCostEntry"
      `,
    ]);

    const damageTypeModeById = new Map<number, 'PHYSICAL' | 'MENTAL'>();
    for (const dt of damageTypes) {
      const mode = String((dt as { attackMode?: unknown }).attackMode ?? '').trim().toUpperCase();
      damageTypeModeById.set(dt.id, mode === 'MENTAL' ? 'MENTAL' : 'PHYSICAL');
    }

    const physicalEffectNames = new Set<string>();
    const mentalEffectNames = new Set<string>();
    const attackEffects = attackEffectsRaw.map((row) => {
      const damageTypeIds = row.damageTypeLinks.map((link) => link.damageTypeId);
      let hasPhysical = false;
      let hasMental = false;
      for (const damageTypeId of damageTypeIds) {
        const mode = damageTypeModeById.get(damageTypeId) ?? 'PHYSICAL';
        if (mode === 'MENTAL') hasMental = true;
        else hasPhysical = true;
      }
      if (hasPhysical) physicalEffectNames.add(row.name);
      if (hasMental) mentalEffectNames.add(row.name);

      return {
        id: row.id,
        name: row.name,
        tooltip: row.tooltip,
        damageTypeIds,
      };
    });

    const physicalNames = Array.from(physicalEffectNames);
    const mentalNames = Array.from(mentalEffectNames);

    if (physicalNames.length) {
      await prisma.wardingOption.createMany({
        data: physicalNames.map((name) => ({ name })),
        skipDuplicates: true,
      });
    }
    if (mentalNames.length) {
      await prisma.sanctifiedOption.createMany({
        data: mentalNames.map((name) => ({ name })),
        skipDuplicates: true,
      });
    }

    const [wardingOptions, sanctifiedOptions] = await Promise.all([
      physicalNames.length
        ? prisma.wardingOption.findMany({
            where: { name: { in: physicalNames } },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
      mentalNames.length
        ? prisma.sanctifiedOption.findMany({
            where: { name: { in: mentalNames } },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      damageTypes,
      attackEffects,
      defEffects,
      weaponAttributes,
      armorAttributes,
      shieldAttributes,
      wardingOptions,
      sanctifiedOptions,
      config: configEntries,
      costs: costEntries,
    });
  } catch (error) {
    console.error('[FORGE_PICKLISTS]', error);
    return NextResponse.json(
      { error: 'Failed to load forge picklists' },
      { status: 500 },
    );
  }
}
