import { CampaignNav } from '@/app/components/CampaignNav';
import { ForgePrintMode } from '@/app/forge/components/ForgePrintMode';

type ForgePrintPageProps = {
  params: { id: string };
};

export default async function ForgePrintPage({ params }: ForgePrintPageProps) {
  const { id } = await Promise.resolve(params);

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