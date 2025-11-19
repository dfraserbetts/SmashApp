// app/campaign/[id]/summoning-circle/page.tsx
import { CampaignNav } from "@/app/components/CampaignNav";

type SummoningCirclePageProps = {
  params: { id: string };
};

export default function SummoningCirclePage({ params }: SummoningCirclePageProps) {
  const { id } = params;

  return (
    <main style={{ padding: "2rem" }}>
      <CampaignNav campaignId={id} />

      <section>
        <h1>The Summoning Circle</h1>

        <p style={{ marginTop: "0.75rem" }}>
          Placeholder for encounter and entity management for campaign{" "}
          <strong>{id}</strong>.
        </p>

        <p style={{ marginTop: "0.5rem" }}>
          Eventually this will handle monsters, NPCs, and everything else you
          throw at the party when they ignore your plot hooks.
        </p>
      </section>
    </main>
  );
}

