import { CampaignNav } from "@/app/components/CampaignNav";
import { SummoningCircleEditor } from "@/app/summoning-circle/components/SummoningCircleEditor";
import Link from "next/link";

type SummoningCirclePageProps = {
  params: { id: string };
};

export default async function SummoningCirclePage({ params }: SummoningCirclePageProps) {
  const { id } = await Promise.resolve(params);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="w-full px-4 md:px-6 py-4 space-y-6">
        <CampaignNav campaignId={id} />
        <header>
          <h1 className="text-2xl font-semibold">The Summoning Circle</h1>
          <div className="mt-2">
            <Link
              href={`/campaign/${id}/summoning-circle/print`}
              className="rounded border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800"
            >
              Open Print Mode
            </Link>
          </div>
        </header>
        <SummoningCircleEditor campaignId={id} />
      </div>
    </main>
  );
}

