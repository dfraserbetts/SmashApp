// app/campaign/[id]/page.tsx
import { CampaignNav } from "@/app/components/CampaignNav";

type CampaignPageProps = {
  params: { id: string };
};

export default function CampaignPage({ params }: CampaignPageProps) {
  const { id } = params;

  return (
    <main style={{ padding: "2rem" }}>
      <CampaignNav campaignId={id} />

      <section>
        <h1>Campaign Overview</h1>

        <p style={{ marginTop: "0.75rem" }}>
          Overview for campaign <strong>{id}</strong>.
        </p>

        <p style={{ marginTop: "0.5rem" }}>
          From here you will eventually manage sessions, world notes, party
          members, and jump into your campaign tools.
        </p>

        <ul style={{ marginTop: "1rem" }}>
          <li><strong>The Forge</strong> — item crafting & equipment.</li>
          <li><strong>The Summoning Circle</strong> — monsters & encounters.</li>
          <li><strong>Character Creator</strong> — players & NPCs.</li>
        </ul>
      </section>
    </main>
  );
}
