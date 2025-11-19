// app/campaign/[id]/forge/page.tsx
import { CampaignNav } from "@/app/components/CampaignNav";

type ForgePageProps = {
  params: { id: string };
};

export default function ForgePage({ params }: ForgePageProps) {
  const { id } = params;

  return (
    <main style={{ padding: "2rem" }}>
      <CampaignNav campaignId={id} />

      <section>
        <h1>The Forge</h1>

        <p style={{ marginTop: "0.75rem" }}>
          Placeholder for The Forge UI for campaign <strong>{id}</strong>.
        </p>

        <p style={{ marginTop: "0.5rem" }}>
          This is where weapon, shield, armor, and item creation will live —
          all the crunchy crafting you dragged out of Google Apps Script.
        </p>
      </section>
    </main>
  );
}
