import { NextResponse } from 'next/server';
import { prisma } from '../../../../../prisma/client';
import { requireUserId } from '@/lib/auth/server';
import { requireCampaignGameDirector } from '@/lib/campaign/access';

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
    await requireCampaignGameDirector(campaignId, userId);

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
    if (msg === 'NOT_FOUND') {
      return NextResponse.json(
        { ok: false, error: 'Campaign not found' },
        { status: 404 },
      );
    }

    console.error('[ITEM_TEMPLATES_DELETE]', error);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }
}
