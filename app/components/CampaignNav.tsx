// app/components/CampaignNav.tsx
'use client';

import Link from "next/link";
import { useEffect, useState } from "react";

type CampaignNavProps = {
  campaignId: string;
};

export function CampaignNav({ campaignId }: CampaignNavProps) {
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [canManageCampaign, setCanManageCampaign] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCampaignAccess() {
      if (!campaignId) return;

      try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          campaign?: { name?: string | null };
          access?: { permissions?: { canManageCampaign?: boolean } };
        };

        if (cancelled) return;

        if (!res.ok) {
          setCampaignName(null);
          setCanManageCampaign(false);
          return;
        }

        setCampaignName(data.campaign?.name ?? null);
        setCanManageCampaign(Boolean(data.access?.permissions?.canManageCampaign));
      } catch {
        if (cancelled) return;
        setCampaignName(null);
        setCanManageCampaign(false);
      }
    }

    void loadCampaignAccess();

    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  return (
    <nav style={{ marginBottom: "1rem" }}>
      <strong>Campaign: {campaignName ?? campaignId}</strong>
      <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.75rem" }}>
        <Link href={`/campaign/${campaignId}`}>Overview</Link>
        {canManageCampaign ? <Link href={`/campaign/${campaignId}/forge`}>The Forge</Link> : null}
        {canManageCampaign ? (
          <Link href={`/campaign/${campaignId}/summoning-circle`}>
            The Summoning Circle
          </Link>
        ) : null}
        <Link href={`/campaign/${campaignId}/characters`}>
          {canManageCampaign ? "Character Management" : "Character Builder"}
        </Link>
        <Link href={`/campaign/${campaignId}/inventory`}>
          Party Inventory
        </Link>
      </div>
      <hr style={{ marginTop: "0.75rem" }} />
    </nav>
  );
}

