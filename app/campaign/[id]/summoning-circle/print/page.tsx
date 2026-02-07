import { CampaignNav } from "@/app/components/CampaignNav";
import { SummoningCirclePrintMode } from "@/app/summoning-circle/components/SummoningCirclePrintMode";

type SummoningCirclePrintPageProps = {
  params: { id: string };
};

export default async function SummoningCirclePrintPage({ params }: SummoningCirclePrintPageProps) {
  const { id } = await Promise.resolve(params);

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
