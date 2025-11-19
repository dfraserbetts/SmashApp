// app/campaign/[id]/character-creator/page.tsx
import { CampaignNav } from "@/app/components/CampaignNav";

type CharacterCreatorPageProps = {
  params: { id: string };
};

export default function CharacterCreatorPage({ params }: CharacterCreatorPageProps) {
  const { id } = params;

  return (
    <main style={{ padding: "2rem" }}>
      <CampaignNav campaignId={id} />

      <section>
        <h1>Character Creator</h1>

        <p style={{ marginTop: "0.75rem" }}>
          Placeholder for character creation and management for campaign{" "}
          <strong>{id}</strong>.
        </p>

        <p style={{ marginTop: "0.5rem" }}>
          This will eventually track stats, gear, abilities, levelling, and the
          poor souls your players will inevitably min-max into oblivion.
        </p>
      </section>
    </main>
  );
}

