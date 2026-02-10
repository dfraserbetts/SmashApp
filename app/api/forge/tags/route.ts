import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { prisma } from '@/prisma/client';
import { hasItemTagClient } from '../items/route';

const MAX_SUGGESTIONS = 20;

type TagSuggestion = {
  value: string;
  source: 'global' | 'campaign';
};

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get('campaignId');
  const s = (searchParams.get('s') ?? '').trim();

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
  }

  try {
    const userId = await requireUserId();
    await requireCampaignMember(campaignId, userId);

    if (s.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    if (!hasItemTagClient(prisma)) {
      console.warn("[FORGE_TAGS_GET] itemTag model unavailable; returning empty suggestions");
      return NextResponse.json({ suggestions: [] });
    }

    const [campaignRows] = await Promise.all([
      prisma.itemTag.findMany({
        where: {
          tag: { contains: s, mode: 'insensitive' },
          itemTemplate: {
            campaignId,
          },
        },
        select: { tag: true },
        distinct: ['tag'],
        orderBy: { tag: 'asc' },
        take: MAX_SUGGESTIONS,
      }),
    ]);

    // Forge currently stores campaign-scoped item templates only.
    const globalRows: Array<{ tag: string }> = [];

    const deduped = new Map<string, TagSuggestion>();

    for (const row of campaignRows) {
      const value = row.tag.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, { value, source: 'campaign' });
      }
    }

    for (const row of globalRows) {
      const value = row.tag.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, { value, source: 'global' });
      }
    }

    return NextResponse.json({
      suggestions: Array.from(deduped.values()).slice(0, MAX_SUGGESTIONS),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to load tag suggestions';

    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[FORGE_TAGS_GET]', error);
    return NextResponse.json({ error: 'Failed to load tag suggestions' }, { status: 500 });
  }
}
