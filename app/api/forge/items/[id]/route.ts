import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { prisma } from '../../../../../prisma/client';

import { normalizeVRPEntries } from '../vrp-utils';
import type { VRPEntryInput } from '../vrp-utils';
import { hasItemTagClient, isUnknownTagsIncludeError } from '../route';

// Local enum replacements.
// Your generated Prisma Client does not export these as TS enums in this project,
// so we treat them as strings at the API boundary.
type ItemType = string;
type ItemRarity = string;
type WeaponSize = string;
type AoEShape = string;
type ArmorLocation = string;
type ItemLocation = string;
type RangeCategory = string;

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

function normalizeTagsInput(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }

  return out;
}

function withTagStrings<T extends { tags?: Array<{ tag: string }> }>(
  row: T,
): Omit<T, 'tags'> & { tags: string[] } {
  const tags = Array.isArray(row.tags) ? row.tags.map((entry) => entry.tag) : [];
  return {
    ...(row as Omit<T, 'tags'>),
    tags,
  };
}

type ItemTemplateInput = {
  itemUrl?: string | null;
  name?: string;
  rarity?: ItemRarity;
  level?: number;
  generalDescription?: string;
  type?: ItemType;
  globalAttributeModifiers?: { attribute: string; amount: number }[];

  size?: WeaponSize | null;
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
  aoeShape?: AoEShape | null;
  aoeSphereRadiusFeet?: number | null;
  aoeConeLengthFeet?: number | null;
  aoeLineWidthFeet?: number | null;
  aoeLineLengthFeet?: number | null;

  customWeaponAttributes?: string | null;
  mythicLbPushTemplateId?: string | null;
  mythicLbBreakTemplateId?: string | null;
  mythicLbTranscendTemplateId?: string | null;

  armorLocation?: ArmorLocation | null;
  ppv?: number | null;
  mpv?: number | null;
  auraPhysical?: number | null;
  auraMental?: number | null;
  customArmorAttributes?: string | null;

  shieldHasAttack?: boolean | null;
  customShieldAttributes?: string | null;

  itemLocation?: ItemLocation | null;
  customItemAttributes?: string | null;

  rangeCategories?: RangeCategory[];

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

  tags?: string[];
  vrpEntries?: VRPEntryInput[];
};

// ------------------- GET /api/forge/items/[id] -------------------

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
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
    const includeNoTags = {
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
    };
    const includeWithTags = {
      ...includeNoTags,
      tags: {
        select: { tag: true },
        orderBy: { tag: 'asc' as const },
      },
    };

    try {
      const item = await prisma.itemTemplate.findFirst({
        where: { id, campaignId },
        include: includeWithTags,
      });

      if (!item) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      return NextResponse.json(withTagStrings(item));
    } catch (error) {
      if (!isUnknownTagsIncludeError(error)) {
        throw error;
      }

      console.warn(`[FORGE_ITEM_GET] tags fallback: ${String(error)}`);

      const item = await prisma.itemTemplate.findFirst({
        where: { id, campaignId },
        include: includeNoTags,
      });

      if (!item) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      return NextResponse.json(withTagStrings({ ...item, tags: [] }));
    }
  } catch (error) {
    console.error('[FORGE_ITEM_GET]', error);
    return NextResponse.json(
      { error: 'Failed to load item template' },
      { status: 500 },
    );
  }
}

// ------------------- PUT /api/forge/items/[id] -------------------

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
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
    const role = await requireCampaignMember(campaignId, userId);

    if (role !== 'GAME_DIRECTOR') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json()) as ItemTemplateInput;
    const normalizedTags = normalizeTagsInput(body.tags);
      const updated = await prisma.$transaction(async (tx) => {
      // 1) core update (scoped to campaign)
      const updatedCount = await tx.itemTemplate.updateMany({
        where: { id, campaignId },
        data: {
          ...(body.itemUrl !== undefined ? { itemUrl: body.itemUrl } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.rarity !== undefined ? { rarity: body.rarity } : {}),
          ...(body.level !== undefined ? { level: body.level } : {}),
          ...(body.generalDescription !== undefined
            ? { generalDescription: body.generalDescription }
            : {}),
          ...(body.type !== undefined ? { type: body.type } : {}),
          ...(body.globalAttributeModifiers !== undefined
          ? { globalAttributeModifiers: body.globalAttributeModifiers }
          : {}),

          ...(body.size !== undefined ? { size: body.size } : {}),
          ...(body.physicalStrength !== undefined
            ? { physicalStrength: body.physicalStrength }
            : {}),
          ...(body.mentalStrength !== undefined
            ? { mentalStrength: body.mentalStrength }
            : {}),

          ...(body.meleePhysicalStrength !== undefined
            ? { meleePhysicalStrength: body.meleePhysicalStrength }
            : {}),
          ...(body.meleeMentalStrength !== undefined
            ? { meleeMentalStrength: body.meleeMentalStrength }
            : {}),
          ...(body.rangedPhysicalStrength !== undefined
            ? { rangedPhysicalStrength: body.rangedPhysicalStrength }
            : {}),
          ...(body.rangedMentalStrength !== undefined
            ? { rangedMentalStrength: body.rangedMentalStrength }
            : {}),
          ...(body.aoePhysicalStrength !== undefined
            ? { aoePhysicalStrength: body.aoePhysicalStrength }
            : {}),
          ...(body.aoeMentalStrength !== undefined
            ? { aoeMentalStrength: body.aoeMentalStrength }
            : {}),

          ...(body.meleeTargets !== undefined
            ? { meleeTargets: body.meleeTargets }
            : {}),
          ...(body.rangedTargets !== undefined
            ? { rangedTargets: body.rangedTargets }
            : {}),

          ...(body.rangedDistanceFeet !== undefined
            ? { rangedDistanceFeet: body.rangedDistanceFeet }
            : {}),
          ...(body.aoeCenterRangeFeet !== undefined
            ? { aoeCenterRangeFeet: body.aoeCenterRangeFeet }
            : {}),
          ...(body.aoeCount !== undefined ? { aoeCount: body.aoeCount } : {}),
          ...(body.aoeShape !== undefined ? { aoeShape: body.aoeShape } : {}),
          ...(body.aoeSphereRadiusFeet !== undefined
            ? { aoeSphereRadiusFeet: body.aoeSphereRadiusFeet }
            : {}),
          ...(body.aoeConeLengthFeet !== undefined
            ? { aoeConeLengthFeet: body.aoeConeLengthFeet }
            : {}),
          ...(body.aoeLineWidthFeet !== undefined
            ? { aoeLineWidthFeet: body.aoeLineWidthFeet }
            : {}),
          ...(body.aoeLineLengthFeet !== undefined
            ? { aoeLineLengthFeet: body.aoeLineLengthFeet }
            : {}),

          ...(body.customWeaponAttributes !== undefined
            ? { customWeaponAttributes: body.customWeaponAttributes }
            : {}),
          ...(body.mythicLbPushTemplateId !== undefined
            ? { mythicLbPushTemplateId: body.mythicLbPushTemplateId }
            : {}),
          ...(body.mythicLbBreakTemplateId !== undefined
            ? { mythicLbBreakTemplateId: body.mythicLbBreakTemplateId }
            : {}),
          ...(body.mythicLbTranscendTemplateId !== undefined
            ? { mythicLbTranscendTemplateId: body.mythicLbTranscendTemplateId }
            : {}),

          ...(body.armorLocation !== undefined
            ? { armorLocation: body.armorLocation }
            : {}),
          ...(body.ppv !== undefined ? { ppv: body.ppv } : {}),
          ...(body.mpv !== undefined ? { mpv: body.mpv } : {}),
          ...(body.auraPhysical !== undefined
            ? { auraPhysical: body.auraPhysical }
            : {}),
          ...(body.auraMental !== undefined
            ? { auraMental: body.auraMental }
            : {}),
          ...(body.customArmorAttributes !== undefined
            ? { customArmorAttributes: body.customArmorAttributes }
            : {}),

          ...(body.shieldHasAttack !== undefined
            ? { shieldHasAttack: body.shieldHasAttack }
            : {}),
          ...(body.customShieldAttributes !== undefined
            ? { customShieldAttributes: body.customShieldAttributes }
            : {}),

          ...(body.itemLocation !== undefined
            ? { itemLocation: body.itemLocation }
            : {}),
          ...(body.customItemAttributes !== undefined
            ? { customItemAttributes: body.customItemAttributes }
            : {}),
         } as any,
      });

      if (updatedCount.count === 0) {
        throw new Error("Not found");
      }

      const item = await tx.itemTemplate.findFirst({
        where: { id, campaignId },
        select: { id: true },
      });

      if (!item) {
        throw new Error("Not found");
      }

      // 2) relational sets: replace if arrays provided
      if (body.rangeCategories) {
        await tx.itemTemplateRangeCategory.deleteMany({
          where: { itemTemplateId: id },
        });
        if (body.rangeCategories.length) {
          await tx.itemTemplateRangeCategory.createMany({
            data: body.rangeCategories.map((rc) => ({
              itemTemplateId: id,
              rangeCategory: rc,
            })) as any,
          });
        }
      }

      if (body.meleeDamageTypeIds) {
        await tx.itemTemplateMeleeDamageType.deleteMany({
          where: { itemTemplateId: id },
        });
        if (body.meleeDamageTypeIds.length) {
          await tx.itemTemplateMeleeDamageType.createMany({
            data: body.meleeDamageTypeIds.map((damageTypeId) => ({
              itemTemplateId: id,
              damageTypeId,
            })),
          });
        }
      }

      if (body.rangedDamageTypeIds) {
        await tx.itemTemplateRangedDamageType.deleteMany({
          where: { itemTemplateId: id },
        });
        if (body.rangedDamageTypeIds.length) {
          await tx.itemTemplateRangedDamageType.createMany({
            data: body.rangedDamageTypeIds.map((damageTypeId) => ({
              itemTemplateId: id,
              damageTypeId,
            })),
          });
        }
      }

      if (body.aoeDamageTypeIds) {
        await tx.itemTemplateAoEDamageType.deleteMany({
          where: { itemTemplateId: id },
        });
        if (body.aoeDamageTypeIds.length) {
          await tx.itemTemplateAoEDamageType.createMany({
            data: body.aoeDamageTypeIds.map((damageTypeId) => ({
              itemTemplateId: id,
              damageTypeId,
            })),
          });
        }
      }

      if (body.attackEffectMeleeIds) {
        await tx.itemTemplateAttackEffectMelee.deleteMany({
          where: { itemTemplateId: id },
        });
        if (body.attackEffectMeleeIds.length) {
          await tx.itemTemplateAttackEffectMelee.createMany({
            data: body.attackEffectMeleeIds.map((attackEffectId) => ({
              itemTemplateId: id,
              attackEffectId,
            })),
          });
        }
      }

      if (body.attackEffectRangedIds) {
        await tx.itemTemplateAttackEffectRanged.deleteMany({
          where: { itemTemplateId: id },
        });
        if (body.attackEffectRangedIds.length) {
          await tx.itemTemplateAttackEffectRanged.createMany({
            data: body.attackEffectRangedIds.map((attackEffectId) => ({
              itemTemplateId: id,
              attackEffectId,
            })),
          });
        }
      }

      if (body.attackEffectAoEIds) {
        await tx.itemTemplateAttackEffectAoE.deleteMany({
          where: { itemTemplateId: id },
        });
        if (body.attackEffectAoEIds.length) {
          await tx.itemTemplateAttackEffectAoE.createMany({
            data: body.attackEffectAoEIds.map((attackEffectId) => ({
              itemTemplateId: id,
              attackEffectId,
            })),
          });
        }
      }

      if (Array.isArray(body.weaponAttributes)) {
        await tx.itemTemplateWeaponAttribute.deleteMany({
          where: { itemTemplateId: id },
        });

        if (body.weaponAttributes.length) {
          await tx.itemTemplateWeaponAttribute.createMany({
            data: body.weaponAttributes.map((wa) => ({
              itemTemplateId: id,
              weaponAttributeId: wa.weaponAttributeId,
              strengthSource: wa.strengthSource ?? null,
              rangeSource: wa.rangeSource ?? null,
            })),
          });
        }
      }

      if (body.armorAttributeIds) {
        await tx.itemTemplateArmorAttribute.deleteMany({
          where: { itemTemplateId: id },
        });
        if (body.armorAttributeIds.length) {
          await tx.itemTemplateArmorAttribute.createMany({
            data: body.armorAttributeIds.map((armorAttributeId) => ({
              itemTemplateId: id,
              armorAttributeId,
            })),
          });
        }
      }

      if (body.shieldAttributeIds) {
        await tx.itemTemplateShieldAttribute.deleteMany({
          where: { itemTemplateId: id },
        });
        if (body.shieldAttributeIds.length) {
          await tx.itemTemplateShieldAttribute.createMany({
            data: body.shieldAttributeIds.map((shieldAttributeId) => ({
              itemTemplateId: id,
              shieldAttributeId,
            })),
          });
        }
      }

      if (body.defEffectIds) {
        await tx.itemTemplateDefEffect.deleteMany({
          where: { itemTemplateId: id },
        });
        if (body.defEffectIds.length) {
          await tx.itemTemplateDefEffect.createMany({
            data: body.defEffectIds.map((defEffectId) => ({
              itemTemplateId: id,
              defEffectId,
            })),
          });
        }
      }

      if (body.wardingOptionIds) {
        await tx.itemTemplateWardingOption.deleteMany({
          where: { itemTemplateId: id },
        });
        if (body.wardingOptionIds.length) {
          await tx.itemTemplateWardingOption.createMany({
            data: body.wardingOptionIds.map((wardingOptionId) => ({
              itemTemplateId: id,
              wardingOptionId,
            })),
          });
        }
      }

      if (body.sanctifiedOptionIds) {
        await tx.itemTemplateSanctifiedOption.deleteMany({
          where: { itemTemplateId: id },
        });
        if (body.sanctifiedOptionIds.length) {
          await tx.itemTemplateSanctifiedOption.createMany({
            data: body.sanctifiedOptionIds.map((sanctifiedOptionId) => ({
              itemTemplateId: id,
              sanctifiedOptionId,
            })),
          });
        }
      }

      if (body.vrpEntries) {
        const normalizedVRP = normalizeVRPEntries(body.vrpEntries);
        await tx.itemTemplateVRPEntry.deleteMany({
          where: { itemTemplateId: id },
        });
        if (normalizedVRP.length) {
          await tx.itemTemplateVRPEntry.createMany({
            data: normalizedVRP.map((e) => ({
              itemTemplateId: id,
              effectKind: e.effectKind,
              magnitude: e.magnitude,
              damageTypeId: e.damageTypeId,
            })),
          });
        }
      }

      const tagsSupported = hasItemTagClient(tx);
      if (body.tags !== undefined) {
        if (tagsSupported) {
          if (normalizedTags.length === 0) {
            await tx.itemTag.deleteMany({
              where: { itemTemplateId: id },
            });
          } else {
            await tx.itemTag.deleteMany({
              where: { itemTemplateId: id },
            });
            await tx.itemTag.createMany({
              data: normalizedTags.map((tag) => ({
                itemTemplateId: id,
                tag,
              })),
            });
          }
        } else {
          console.warn("[FORGE_ITEMS_PUT] itemTag model unavailable; skipping tag persistence");
        }
      }

      let updatedItem:
        | (Record<string, unknown> & { tags?: Array<{ tag: string }> })
        | null;
      if (tagsSupported) {
        try {
          const withTags = await tx.itemTemplate.findFirst({
            where: { id, campaignId },
            include: {
              tags: {
                select: { tag: true },
                orderBy: { tag: 'asc' },
              },
            },
          });
          updatedItem = withTags as
            | (Record<string, unknown> & { tags?: Array<{ tag: string }> })
            | null;
        } catch (error) {
          if (!isUnknownTagsIncludeError(error)) {
            throw error;
          }
          console.warn("[FORGE_ITEMS_PUT] itemTag model unavailable; skipping tag persistence");
          updatedItem = (await tx.itemTemplate.findFirst({
            where: { id, campaignId },
          })) as (Record<string, unknown> & { tags?: Array<{ tag: string }> }) | null;
        }
      } else {
        updatedItem = (await tx.itemTemplate.findFirst({
          where: { id, campaignId },
        })) as (Record<string, unknown> & { tags?: Array<{ tag: string }> }) | null;
      }

      if (!updatedItem) {
        throw new Error("Not found");
      }

      const persistedTags = Array.isArray(updatedItem.tags)
        ? updatedItem.tags.map((entry) => entry.tag)
        : [];
      const responseTags = body.tags !== undefined ? normalizedTags : persistedTags;
      return {
        ...updatedItem,
        tags: responseTags,
      };
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update item template";
    const status = message === "Not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ------------------- DELETE /api/forge/items/[id] -------------------

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
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
    const role = await requireCampaignMember(campaignId, userId);

    if (role !== 'GAME_DIRECTOR') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const deleted = await prisma.itemTemplate.deleteMany({
      where: { id, campaignId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[FORGE_ITEM_DELETE]', error);
    return NextResponse.json(
      { error: 'Failed to delete item template' },
      { status: 500 },
    );
  }
}
