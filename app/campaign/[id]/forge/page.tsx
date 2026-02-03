// app/campaign/[id]/forge/page.tsx
import { CampaignNav } from "@/app/components/CampaignNav";
import { ForgeCreate } from "@/app/forge/components/ForgeCreate";

type ForgePageProps = {
  params: { id: string };
};

export default async function ForgePage({ params }: ForgePageProps) {
const { id } = await Promise.resolve(params);

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <CampaignNav campaignId={id} />

        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">The Forge</h1>
        </header>

        <ForgeCreate campaignId={id} />
      </div>
    </main>
  );
}

