import Link from "next/link";

type CampaignToolAccessDeniedProps = {
  campaignId: string;
};

export function CampaignToolAccessDenied({ campaignId }: CampaignToolAccessDeniedProps) {
  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold">Campaign Tool</h1>
        <p className="text-red-300">You do not have access to this campaign tool.</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/campaign/${campaignId}`}
            className="rounded-lg border border-zinc-700 px-4 py-2 hover:bg-zinc-900"
          >
            Back to campaign
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-zinc-700 px-4 py-2 hover:bg-zinc-900"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
