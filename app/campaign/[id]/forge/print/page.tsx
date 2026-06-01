import { CampaignNav } from '@/app/components/CampaignNav';
import { CampaignToolAccessDenied } from '@/app/campaign/[id]/CampaignToolAccessDenied';
import { ForgePrintMode } from '@/app/forge/components/ForgePrintMode';
import { requireUserId } from '@/lib/auth/server';
import { requireCampaignGameDirector } from '@/lib/campaign/access';

type ForgePrintPageProps = {
  params: { id: string };
};

export default async function ForgePrintPage({ params }: ForgePrintPageProps) {
  const { id } = await Promise.resolve(params);
  try {
    const userId = await requireUserId();
    await requireCampaignGameDirector(id, userId);
  } catch {
    return <CampaignToolAccessDenied campaignId={id} />;
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="w-full px-4 md:px-6 py-4 space-y-6">
        <div className="forge-print-controls">
          <CampaignNav campaignId={id} />
        </div>
        <header className="forge-print-controls">
          <h1 className="text-2xl font-semibold">The Forge - Print Mode</h1>
        </header>
        <ForgePrintMode campaignId={id} />
      </div>
    </main>
  );
}
