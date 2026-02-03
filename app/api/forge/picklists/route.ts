// app/api/forge/picklists/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '../../../../prisma/client'; // adjust path if you move client.ts

export async function GET() {
  try {
    const [
      damageTypes,
      attackEffects,
      defEffects,
      weaponAttributes,
      armorAttributes,
      shieldAttributes,
      wardingOptions,
      sanctifiedOptions,
      configEntries,
      costEntries,
    ] = await Promise.all([
      prisma.damageType.findMany({ orderBy: { name: 'asc' } }),
      prisma.attackEffect.findMany({ orderBy: { name: 'asc' } }),
      prisma.defEffect.findMany({ orderBy: { name: 'asc' } }),
      prisma.weaponAttribute.findMany({ orderBy: { name: 'asc' } }),
      prisma.armorAttribute.findMany({ orderBy: { name: 'asc' } }),
      prisma.shieldAttribute.findMany({ orderBy: { name: 'asc' } }),
      prisma.wardingOption.findMany({ orderBy: { name: 'asc' } }),
      prisma.sanctifiedOption.findMany({ orderBy: { name: 'asc' } }),
      prisma.forgeConfigEntry.findMany(),
      prisma.forgeCostEntry.findMany(),
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
