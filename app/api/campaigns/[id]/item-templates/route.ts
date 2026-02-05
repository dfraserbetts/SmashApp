import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { prisma } from '../../../../../prisma/client';

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

type DeleteBody = {
  itemIds?: string[];
};

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: campaignId } = await context.params;

  if (!campaignId) {
    return NextResponse.json({ ok: false, error: 'Missing campaign id' }, { status: 400 });
  }

  let body: DeleteBody = {};

  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const itemIds = Array.isArray(body?.itemIds)
    ? body.itemIds.filter((id) => typeof id === 'string' && id.trim())
    : [];

  const uniqueIds = Array.from(new Set(itemIds));

  if (uniqueIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'itemIds is required' },
      { status: 400 },
    );
  }

  try {
    const userId = await requireUserId();
    const role = await requireCampaignMember(campaignId, userId);

    if (role !== 'GAME_DIRECTOR') {
      return NextResponse.json(
        { ok: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const matchingCount = await prisma.itemTemplate.count({
      where: { id: { in: uniqueIds }, campaignId },
    });

    if (matchingCount !== uniqueIds.length) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    console.log(
      `[ITEM_TEMPLATES_DELETE] campaignId=${campaignId} count=${uniqueIds.length}`,
    );

    const result = await prisma.itemTemplate.deleteMany({
      where: { id: { in: uniqueIds }, campaignId },
    });

    return NextResponse.json({ ok: true, deletedCount: result.count });
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Failed to delete item templates';

    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json(
        { ok: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    console.error('[ITEM_TEMPLATES_DELETE]', error);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }
}
