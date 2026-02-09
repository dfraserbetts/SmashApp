// app/campaign/[id]/forge/page.tsx
import { CampaignNav } from "@/app/components/CampaignNav";
import { ForgeCreate } from "@/app/forge/components/ForgeCreate";
import Link from "next/link";

type ForgePageProps = {
  params: { id: string };
};

export default async function ForgePage({ params }: ForgePageProps) {
const { id } = await Promise.resolve(params);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="w-full px-0 md:px-6 space-y-6">
        <div className="px-4 md:px-6 pt-4 space-y-6">
          <CampaignNav campaignId={id} />

          <header className="space-y-1">
            <h1 className="text-2xl font-semibold">The Forge</h1>
            <div className="mt-2">
              <Link
                href={`/campaign/${id}/forge/print`}
                className="rounded border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800"
              >
                Open Print Mode
              </Link>
            </div>
          </header>
        </div>

        <ForgeCreate campaignId={id} />
      </div>
    </main>
  );
}

