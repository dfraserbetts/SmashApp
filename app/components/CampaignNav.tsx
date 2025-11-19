// app/components/CampaignNav.tsx
import Link from "next/link";

type CampaignNavProps = {
  campaignId: string;
};

export function CampaignNav({ campaignId }: CampaignNavProps) {
  return (
    <nav style={{ marginBottom: "1rem" }}>
      <strong>Campaign: {campaignId}</strong>
      <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.75rem" }}>
        <Link href={`/campaign/${campaignId}`}>Overview</Link>
        <Link href={`/campaign/${campaignId}/forge`}>The Forge</Link>
        <Link href={`/campaign/${campaignId}/summoning-circle`}>
          The Summoning Circle
        </Link>
        <Link href={`/campaign/${campaignId}/character-creator`}>
          Character Creator
        </Link>
      </div>
      <hr style={{ marginTop: "0.75rem" }} />
    </nav>
  );
}

