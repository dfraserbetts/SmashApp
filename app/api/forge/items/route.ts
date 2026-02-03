// app/api/forge/items/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { prisma } from '../../../../prisma/client';
import type { VRPEntryInput } from './vrp-utils';
import { normalizeVRPEntries } from './vrp-utils';

async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
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
          cookieStore.set({ name, value: '', ...options });
        },
      },
    },
  );
}

async function requireUserId() {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user?.id) {
    throw new Error('UNAUTHORIZED');
  }
  return data.user.id;
}

async function requireCampaignMember(campaignId: string, userId: string) {
  const membership = await prisma.campaignUser.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
    select: { role: true },
  });

  if (!membership) {
    throw new Error('FORBIDDEN');
  }

  return membership.role;
}

type GlobalAttributeModifierInput = {
  attribute: string;
  amount: number;
};

type ItemTemplateInput = {
  id: string;
  campaignId: string;
  itemUrl?: string | null;
  name: string;
  rarity: string;
  level: number;
  generalDescription: string;
  type: string;

  size?: string | null;
  physicalStrength?: number | null;
  mentalStrength?: number | null;

  meleePhysicalStrength?: number | null;
  meleeMentalStrength?: number | null;
  rangedPhysicalStrength?: number | null;
  rangedMentalStrength?: number | null;
  aoePhysicalStrength?: number | null;
  aoeMentalStrength?: number | null;

  meleeTargets?: number | null;
  rangedTargets?: number | null;

  rangedDistanceFeet?: number | null;
  aoeCenterRangeFeet?: number | null;
  aoeCount?: number | null;
  aoeShape?: string | null;
  aoeSphereRadiusFeet?: number | null;
  aoeConeLengthFeet?: number | null;
  aoeLineWidthFeet?: number | null;
  aoeLineLengthFeet?: number | null;

  customWeaponAttributes?: string | null;

  armorLocation?: string | null;
  ppv?: number | null;
  mpv?: number | null;
  auraPhysical?: number | null;
  auraMental?: number | null;
  customArmorAttributes?: string | null;

  shieldHasAttack?: boolean | null;
  customShieldAttributes?: string | null;

  itemLocation?: string | null;
  customItemAttributes?: string | null;

  rangeCategories?: string[];

  meleeDamageTypeIds?: number[];
  rangedDamageTypeIds?: number[];
  aoeDamageTypeIds?: number[];

  attackEffectMeleeIds?: number[];
  attackEffectRangedIds?: number[];
  attackEffectAoEIds?: number[];

  weaponAttributes?: {
    weaponAttributeId: number;
    strengthSource?: "MELEE" | "RANGED" | "AOE" | null;
    rangeSource?: "MELEE" | "RANGED" | "AOE" | null;
  }[];
  armorAttributeIds?: number[];
  shieldAttributeIds?: number[];

  defEffectIds?: number[];
  wardingOptionIds?: number[];
  sanctifiedOptionIds?: number[];

  globalAttributeModifiers?: { attribute: string; amount: number }[];

  vrpEntries?: VRPEntryInput[];
};

// ------------------- GET /api/forge/items -------------------

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get('campaignId');

  if (!campaignId) {
    return NextResponse.json(
      { error: 'campaignId is required' },
      { status: 400 },
    );
  }
  try {
    const userId = await requireUserId();
    await requireCampaignMember(campaignId, userId);
    const items = await prisma.itemTemplate.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      include: {
        rangeCategories: true,
        meleeDamageTypes: { include: { damageType: true } },
        rangedDamageTypes: { include: { damageType: true } },
        aoeDamageTypes: { include: { damageType: true } },

        attackEffectsMelee: { include: { attackEffect: true } },
        attackEffectsRanged: { include: { attackEffect: true } },
        attackEffectsAoE: { include: { attackEffect: true } },

        weaponAttributes: { include: { weaponAttribute: true } },
        armorAttributes: { include: { armorAttribute: true } },
        shieldAttributes: { include: { shieldAttribute: true } },

        defEffects: { include: { defEffect: true } },
        wardingOptions: { include: { wardingOption: true } },
        sanctifiedOptions: { include: { sanctifiedOption: true } },

        vrpEntries: { include: { damageType: true } },
      },
    });

    return NextResponse.json(items);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to load item templates';

    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[FORGE_ITEMS_GET]', error);
    return NextResponse.json({ error: 'Failed to load item templates' }, { status: 500 });
  }
}

// ------------------- POST /api/forge/items -------------------

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ItemTemplateInput;

    const userId = await requireUserId();
    const role = await requireCampaignMember(body.campaignId, userId);

    if (role !== 'GAME_DIRECTOR') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!body.id || !body.campaignId || !body.name || !body.rarity || !body.type) {
      return NextResponse.json(
        { error: 'id, campaignId, name, rarity, type are required' },
        { status: 400 },
      );
    }

    const now = new Date();

      const items = await prisma.$transaction(async (tx) => {
      // 1) Core item row
      const coreData: any = {
        id: body.id,
        campaignId: body.campaignId,
        itemUrl: body.itemUrl ?? null,
        createdAt: now,
        name: body.name,
        rarity: body.rarity,
        level: body.level,
        generalDescription: body.generalDescription,
        type: body.type,

        // NEW
        globalAttributeModifiers: body.globalAttributeModifiers ?? [],

        size: body.size ?? null,
        physicalStrength: body.physicalStrength ?? null,
        mentalStrength: body.mentalStrength ?? null,

        meleePhysicalStrength: body.meleePhysicalStrength ?? null,
        meleeMentalStrength: body.meleeMentalStrength ?? null,
        rangedPhysicalStrength: body.rangedPhysicalStrength ?? null,
        rangedMentalStrength: body.rangedMentalStrength ?? null,
        aoePhysicalStrength: body.aoePhysicalStrength ?? null,
        aoeMentalStrength: body.aoeMentalStrength ?? null,

        meleeTargets: body.meleeTargets ?? null,
        rangedTargets: body.rangedTargets ?? null,

        rangedDistanceFeet: body.rangedDistanceFeet ?? null,
        aoeCenterRangeFeet: body.aoeCenterRangeFeet ?? null,
        aoeCount: body.aoeCount ?? null,
        aoeShape: body.aoeShape ?? null,
        aoeSphereRadiusFeet: body.aoeSphereRadiusFeet ?? null,
        aoeConeLengthFeet: body.aoeConeLengthFeet ?? null,
        aoeLineWidthFeet: body.aoeLineWidthFeet ?? null,
        aoeLineLengthFeet: body.aoeLineLengthFeet ?? null,

        customWeaponAttributes: body.customWeaponAttributes ?? null,

        armorLocation: body.armorLocation ?? null,
        ppv: body.ppv ?? null,
        mpv: body.mpv ?? null,
        auraPhysical: body.auraPhysical ?? null,
        auraMental: body.auraMental ?? null,
        customArmorAttributes: body.customArmorAttributes ?? null,

        shieldHasAttack:
          typeof body.shieldHasAttack === 'boolean'
            ? body.shieldHasAttack
            : null,
        customShieldAttributes: body.customShieldAttributes ?? null,

        itemLocation: body.itemLocation ?? null,
        customItemAttributes: body.customItemAttributes ?? null,
      };

      const item = await tx.itemTemplate.create({
        data: coreData,
      });

      const id = item.id;

      // VRP entries (global, for all item types)
      if (Array.isArray(body.vrpEntries) && body.vrpEntries.length > 0) {
        const normalizedVRP = normalizeVRPEntries(body.vrpEntries);
        await tx.itemTemplateVRPEntry.createMany({
          data: normalizedVRP.map((entry) => ({
            itemTemplateId: id,
            effectKind: entry.effectKind,
            magnitude: entry.magnitude,
            damageTypeId: entry.damageTypeId,
          })),
        });
      }

      // 2) Join tables – we create only if arrays have length

      const rangeCategories = body.rangeCategories ?? [];
      if (rangeCategories.length) {
      if (Array.isArray(body.rangeCategories) && body.rangeCategories.length > 0) {
        await tx.itemTemplateRangeCategory.createMany({
          data: body.rangeCategories.map((rc) => ({
            itemTemplateId: id,
            rangeCategory: rc,
          })) as any,
        });
      }
      }

      const meleeDamageTypeIds = body.meleeDamageTypeIds ?? [];
      if (meleeDamageTypeIds.length) {
        await tx.itemTemplateMeleeDamageType.createMany({
          data: meleeDamageTypeIds.map((damageTypeId) => ({
            itemTemplateId: id,
            damageTypeId,
          })),
        });
      }

      const rangedDamageTypeIds = body.rangedDamageTypeIds ?? [];
      if (rangedDamageTypeIds.length) {
        await tx.itemTemplateRangedDamageType.createMany({
          data: rangedDamageTypeIds.map((damageTypeId) => ({
            itemTemplateId: id,
            damageTypeId,
          })),
        });
      }

      const aoeDamageTypeIds = body.aoeDamageTypeIds ?? [];
      if (aoeDamageTypeIds.length) {
        await tx.itemTemplateAoEDamageType.createMany({
          data: aoeDamageTypeIds.map((damageTypeId) => ({
            itemTemplateId: id,
            damageTypeId,
          })),
        });
      }

      const attackEffectMeleeIds = body.attackEffectMeleeIds ?? [];
      if (attackEffectMeleeIds.length) {
        await tx.itemTemplateAttackEffectMelee.createMany({
          data: attackEffectMeleeIds.map((attackEffectId) => ({
            itemTemplateId: id,
            attackEffectId,
          })),
        });
      }

      const attackEffectRangedIds = body.attackEffectRangedIds ?? [];
      if (attackEffectRangedIds.length) {
        await tx.itemTemplateAttackEffectRanged.createMany({
          data: attackEffectRangedIds.map((attackEffectId) => ({
            itemTemplateId: id,
            attackEffectId,
          })),
        });
      }

      const attackEffectAoEIds = body.attackEffectAoEIds ?? [];
      if (attackEffectAoEIds.length) {
        await tx.itemTemplateAttackEffectAoE.createMany({
          data: attackEffectAoEIds.map((attackEffectId) => ({
            itemTemplateId: id,
            attackEffectId,
          })),
        });
      }

      const weaponAttributes = body.weaponAttributes ?? [];
      if (weaponAttributes.length) {
        await tx.itemTemplateWeaponAttribute.createMany({
          data: weaponAttributes.map((wa) => ({
            itemTemplateId: id,
            weaponAttributeId: wa.weaponAttributeId,
            strengthSource: wa.strengthSource ?? null,
            rangeSource: wa.rangeSource ?? null,
          })),
        });
      }

      const armorAttributeIds = body.armorAttributeIds ?? [];
      if (armorAttributeIds.length) {
        await tx.itemTemplateArmorAttribute.createMany({
          data: armorAttributeIds.map((armorAttributeId) => ({
            itemTemplateId: id,
            armorAttributeId,
          })),
        });
      }

      const shieldAttributeIds = body.shieldAttributeIds ?? [];
      if (shieldAttributeIds.length) {
        await tx.itemTemplateShieldAttribute.createMany({
          data: shieldAttributeIds.map((shieldAttributeId) => ({
            itemTemplateId: id,
            shieldAttributeId,
          })),
        });
      }

      const defEffectIds = body.defEffectIds ?? [];
      if (defEffectIds.length) {
        await tx.itemTemplateDefEffect.createMany({
          data: defEffectIds.map((defEffectId) => ({
            itemTemplateId: id,
            defEffectId,
          })),
        });
      }

      const wardingOptionIds = body.wardingOptionIds ?? [];
      if (wardingOptionIds.length) {
        await tx.itemTemplateWardingOption.createMany({
          data: wardingOptionIds.map((wardingOptionId) => ({
            itemTemplateId: id,
            wardingOptionId,
          })),
        });
      }

      const sanctifiedOptionIds = body.sanctifiedOptionIds ?? [];
      if (sanctifiedOptionIds.length) {
        await tx.itemTemplateSanctifiedOption.createMany({
          data: sanctifiedOptionIds.map((sanctifiedOptionId) => ({
            itemTemplateId: id,
            sanctifiedOptionId,
          })),
        });
      }

      return item;
    });

  return NextResponse.json(items, { status: 201 });
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Failed to create item template';

    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[FORGE_ITEMS_POST]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
