import { CampaignNav } from "@/app/components/CampaignNav";
import { CharacterPrintMode } from "./CharacterPrintMode";

type CharacterPrintPageProps = {
  params: Promise<{ id: string; characterId: string }>;
};

export default async function CharacterPrintPage({ params }: CharacterPrintPageProps) {
  const { id, characterId } = await params;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="character-print-controls w-full space-y-6 px-4 py-4 md:px-6">
        <CampaignNav campaignId={id} />
        <header>
          <h1 className="text-2xl font-semibold">Character Builder - Print Mode</h1>
        </header>
      </div>
      <CharacterPrintMode campaignId={id} characterId={characterId} />
    </main>
  );
}
