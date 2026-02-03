// app/components/CampaignNav.tsx
'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type CampaignNavProps = {
  campaignId: string;
};

export function CampaignNav({ campaignId }: CampaignNavProps) {
  const [campaignName, setCampaignName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCampaignName() {
      if (!campaignId) return;

      const { data, error } = await supabaseClient
        .from("Campaign")
        .select("name")
        .eq("id", campaignId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setCampaignName(null);
        return;
      }

      setCampaignName(data?.name ?? null);
    }

    loadCampaignName();

    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  return (
    <nav style={{ marginBottom: "1rem" }}>
      <strong>Campaign: {campaignName ?? campaignId}</strong>
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

