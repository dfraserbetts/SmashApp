import { CampaignNav } from "@/app/components/CampaignNav";
import { CampaignToolAccessDenied } from "@/app/campaign/[id]/CampaignToolAccessDenied";
import { SummoningCirclePrintMode } from "@/app/summoning-circle/components/SummoningCirclePrintMode";
import { requireUserId } from "@/lib/auth/server";
import { requireCampaignGameDirector } from "@/lib/campaign/access";

type SummoningCirclePrintPageProps = {
  params: { id: string };
};

export default async function SummoningCirclePrintPage({ params }: SummoningCirclePrintPageProps) {
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
        <div className="sc-print-controls">
          <CampaignNav campaignId={id} />
        </div>
        <header className="sc-print-controls">
          <h1 className="text-2xl font-semibold">The Summoning Circle - Print Mode</h1>
        </header>
        <SummoningCirclePrintMode campaignId={id} />
      </div>
    </main>
  );
}
