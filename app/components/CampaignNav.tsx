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
  const [pendingApprovalCount, setPendingApprovalCount] = useState<number | null>(null);

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
          setPendingApprovalCount(null);
          return;
        }

        const canManage = Boolean(data.access?.permissions?.canManageCampaign);
        setCampaignName(data.campaign?.name ?? null);
        setCanManageCampaign(canManage);
        if (!canManage) setPendingApprovalCount(null);
      } catch {
        if (cancelled) return;
        setCampaignName(null);
        setCanManageCampaign(false);
        setPendingApprovalCount(null);
      }
    }

    void loadCampaignAccess();

    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId || !canManageCampaign) return;
    let cancelled = false;

    async function loadApprovalSummary() {
      try {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/restriction-governance?summary=1`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          counts?: { pending?: number };
        };
        if (cancelled) return;
        if (!res.ok || !Number.isInteger(data.counts?.pending)) {
          setPendingApprovalCount(null);
          return;
        }
        setPendingApprovalCount(data.counts!.pending!);
      } catch {
        if (!cancelled) setPendingApprovalCount(null);
      }
    }

    const handleQueueUpdated = () => void loadApprovalSummary();
    void loadApprovalSummary();
    window.addEventListener("restriction-governance-queue-updated", handleQueueUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("restriction-governance-queue-updated", handleQueueUpdated);
    };
  }, [campaignId, canManageCampaign]);

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
        {canManageCampaign ? (
          <Link href={`/campaign/${campaignId}/approvals`}>
            {pendingApprovalCount !== null && pendingApprovalCount > 0
              ? `Approvals (${pendingApprovalCount})`
              : "Approvals"}
          </Link>
        ) : null}
        <Link href={`/campaign/${campaignId}/inventory`}>
          Party Inventory
        </Link>
      </div>
      <hr style={{ marginTop: "0.75rem" }} />
    </nav>
  );
}

