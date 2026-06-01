import { CampaignNav } from "@/app/components/CampaignNav";
import { CampaignToolAccessDenied } from "@/app/campaign/[id]/CampaignToolAccessDenied";
import { SummoningCircleEditor } from "@/app/summoning-circle/components/SummoningCircleEditor";
import { requireUserId } from "@/lib/auth/server";
import { getCampaignPermissions, requireCampaignGameDirector } from "@/lib/campaign/access";
import Link from "next/link";

type SummoningCirclePageProps = {
  params: { id: string };
};

export default async function SummoningCirclePage({ params }: SummoningCirclePageProps) {
  const { id } = await Promise.resolve(params);
  let canDeleteMonsters = false;
  try {
    const userId = await requireUserId();
    const access = await requireCampaignGameDirector(id, userId);
    canDeleteMonsters = getCampaignPermissions(access).canDeleteMonsters;
  } catch {
    return <CampaignToolAccessDenied campaignId={id} />;
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="w-full px-0 md:px-6 space-y-6">
        <div className="px-4 md:px-6 pt-4 space-y-6">
          <CampaignNav campaignId={id} />
          <header className="space-y-1">
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
        </div>
        <SummoningCircleEditor campaignId={id} canDeleteMonsters={canDeleteMonsters} />
      </div>
    </main>
  );
}

