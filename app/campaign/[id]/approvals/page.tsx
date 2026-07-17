"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { CampaignNav } from "@/app/components/CampaignNav";
import { CampaignRestrictionApprovalPanel } from "@/app/components/restrictions/CampaignRestrictionApprovalPanel";
import type { RestrictionTier } from "@/lib/restrictions/governance";
import {
  CAMPAIGN_RESTRICTION_QUEUE_FILTER_LABELS,
  CAMPAIGN_RESTRICTION_QUEUE_FILTERS,
  getCampaignRestrictionQueueItemsForFilter,
  getCampaignRestrictionReviewDraftKey,
  type CampaignRestrictionQueueFilter,
  type CampaignRestrictionQueueItem,
  type CampaignRestrictionQueueReadModel,
} from "@/lib/restrictions/governanceQueueView";

type ReviewDraft = Readonly<{
  selectedTier: RestrictionTier | null;
  notes: string;
}>;

type ActionFeedback = Readonly<{
  governanceId: string;
  kind: "success" | "error";
  message: string;
}> | null;

const EMPTY_REVIEW_DRAFT: ReviewDraft = Object.freeze({
  selectedTier: null,
  notes: "",
});

function errorMessage(data: { error?: string }, fallback: string): string {
  return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
}

export default function CampaignRestrictionApprovalsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const campaignId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [queue, setQueue] = useState<CampaignRestrictionQueueReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<CampaignRestrictionQueueFilter>("PENDING");
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
  const [feedback, setFeedback] = useState<ActionFeedback>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const loadQueue = useCallback(async (preserveCurrent = false) => {
    if (!campaignId) {
      setLoadError("Missing campaign id.");
      setLoading(false);
      return null;
    }
    if (!preserveCurrent) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/restriction-governance`,
        { cache: "no-store", credentials: "include" },
      );
      const data = (await res.json().catch(() => ({}))) as CampaignRestrictionQueueReadModel & {
        error?: string;
      };
      if (res.status === 401) {
        router.push("/login");
        return null;
      }
      if (res.status === 403) {
        setLoadError("Only a campaign Game Director or administrator may review Restriction approvals.");
        return null;
      }
      if (res.status === 404) {
        setLoadError("Campaign not found.");
        return null;
      }
      if (!res.ok || !data.groups || !data.counts) {
        throw new Error(errorMessage(data, "Failed to load the Restriction approval queue."));
      }
      setQueue(data);
      window.dispatchEvent(new Event("restriction-governance-queue-updated"));
      return data;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load the Restriction approval queue.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [campaignId, router]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const visibleItems = useMemo(
    () => queue
      ? getCampaignRestrictionQueueItemsForFilter(queue.groups, activeFilter)
      : [],
    [activeFilter, queue],
  );

  function draftFor(governanceId: string): ReviewDraft {
    return reviewDrafts[getCampaignRestrictionReviewDraftKey(governanceId)] ?? EMPTY_REVIEW_DRAFT;
  }

  function updateDraft(governanceId: string, patch: Partial<ReviewDraft>) {
    const key = getCampaignRestrictionReviewDraftKey(governanceId);
    setReviewDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? EMPTY_REVIEW_DRAFT), ...patch },
    }));
  }

  function clearDraft(governanceId: string) {
    const key = getCampaignRestrictionReviewDraftKey(governanceId);
    setReviewDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function performReviewAction(
    item: CampaignRestrictionQueueItem,
    action: "APPROVE" | "REQUEST_CHANGES",
  ) {
    if (!campaignId || activeActionId) return;
    const draft = draftFor(item.governanceId);
    if (action === "APPROVE" && !draft.selectedTier) return;
    if (action === "REQUEST_CHANGES" && !draft.notes.trim()) return;
    setActiveActionId(item.governanceId);
    setFeedback(null);
    setAnnouncement(null);
    try {
      const routeSuffix = action === "APPROVE" ? "approve" : "request-changes";
      const body = action === "APPROVE"
        ? {
            expectedSubmissionRevision: item.submissionRevision,
            selectedTier: draft.selectedTier,
            ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
          }
        : {
            expectedSubmissionRevision: item.submissionRevision,
            notes: draft.notes.trim(),
          };
      const res = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/restriction-governance/${encodeURIComponent(item.governanceId)}/${routeSuffix}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.ok) {
        const message = data.code === "SELF_APPROVAL_POLICY_UNRESOLVED"
          ? "This review cannot be completed because self-approval policy has not yet been decided."
          : errorMessage(data, action === "APPROVE"
              ? "Failed to approve the Restriction."
              : "Failed to request changes.");
        setFeedback({ governanceId: item.governanceId, kind: "error", message });
        setAnnouncement(message);
        if (
          res.status === 409 ||
          data.code === "STALE_SUBMISSION_REVISION" ||
          data.code === "GOVERNANCE_CONCURRENCY_CONFLICT"
        ) {
          await loadQueue(true);
        }
        return;
      }

      clearDraft(item.governanceId);
      const message = action === "APPROVE"
        ? "Restriction approved and classified. Economic credit remains inactive."
        : "Changes Requested was recorded with the Note to Player.";
      setFeedback({ governanceId: item.governanceId, kind: "success", message });
      setAnnouncement(message);
      setActiveFilter(action === "APPROVE" ? "RECENTLY_APPROVED" : "CHANGES_REQUESTED");
      await loadQueue(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The review action failed.";
      setFeedback({ governanceId: item.governanceId, kind: "error", message });
      setAnnouncement(message);
    } finally {
      setActiveActionId(null);
    }
  }

  if (loading && !queue) {
    return (
      <main className="min-h-screen bg-black p-6 text-zinc-100">
        <div className="mx-auto max-w-6xl text-zinc-400">Loading Restriction approvals...</div>
      </main>
    );
  }

  if (loadError && !queue) {
    return (
      <main className="min-h-screen bg-black p-6 text-zinc-100">
        <div className="mx-auto max-w-3xl space-y-4">
          {campaignId ? <CampaignNav campaignId={campaignId} /> : null}
          <h1 className="text-2xl font-semibold">Restriction Approvals</h1>
          <p className="text-red-300" role="alert">{loadError}</p>
          <button
            type="button"
            onClick={() => router.replace(`/campaign/${campaignId ?? ""}`)}
            className="rounded border border-zinc-700 px-4 py-2 hover:bg-zinc-900"
          >
            Back to campaign
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <CampaignNav campaignId={campaignId ?? ""} />

        <header className="space-y-2">
          <p className="text-sm text-zinc-400">Campaign: {queue?.campaign.name ?? campaignId}</p>
          <h1 className="text-3xl font-semibold">Restriction Approvals</h1>
          <p className="max-w-4xl text-sm text-zinc-400">
            Review exact immutable submitted proposals. Live Character changes never overwrite the proposal under review.
          </p>
          <p className="rounded border border-violet-800 bg-violet-950/20 p-3 text-sm text-violet-100">
            Economic credit is not active yet. Approval records the Restriction tier but does not currently change Power spend or cooldown.
          </p>
        </header>

        {loadError ? (
          <p className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-100" role="alert">
            Queue refresh failed: {loadError}. Existing queue data has been preserved.
          </p>
        ) : null}
        {announcement ? (
          <p
            className={feedback?.kind === "error"
              ? "rounded border border-red-800 bg-red-950/25 p-3 text-sm text-red-200"
              : "rounded border border-emerald-800 bg-emerald-950/20 p-3 text-sm text-emerald-200"}
            role={feedback?.kind === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {announcement}
          </p>
        ) : null}

        {queue ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Restriction approval queue counts">
            {CAMPAIGN_RESTRICTION_QUEUE_FILTERS.map((filter) => {
              const count = filter === "PENDING"
                ? queue.counts.pending
                : filter === "CHANGES_REQUESTED"
                  ? queue.counts.changesRequested
                  : filter === "APPROVAL_STALE"
                    ? queue.counts.approvalStale
                    : queue.counts.recentlyApproved;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  aria-pressed={activeFilter === filter}
                  className={`rounded-xl border p-4 text-left ${
                    activeFilter === filter
                      ? "border-sky-600 bg-sky-950/25"
                      : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900"
                  }`}
                >
                  <span className="block text-sm text-zinc-400">
                    {CAMPAIGN_RESTRICTION_QUEUE_FILTER_LABELS[filter]}
                  </span>
                  <span className="mt-1 block text-2xl font-semibold text-zinc-100">{count}</span>
                </button>
              );
            })}
          </section>
        ) : null}

        <section className="space-y-4" aria-labelledby="restriction-queue-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="restriction-queue-heading" className="text-xl font-semibold">
              {CAMPAIGN_RESTRICTION_QUEUE_FILTER_LABELS[activeFilter]}
            </h2>
            <button
              type="button"
              onClick={() => void loadQueue(true)}
              disabled={loading || Boolean(activeActionId)}
              className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh queue"}
            </button>
          </div>

          {visibleItems.length === 0 ? (
            <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
              No {CAMPAIGN_RESTRICTION_QUEUE_FILTER_LABELS[activeFilter].toLowerCase()} Restriction reviews.
            </p>
          ) : (
            visibleItems.map((item) => {
              const draft = draftFor(item.governanceId);
              return (
                <CampaignRestrictionApprovalPanel
                  key={item.governanceId}
                  item={item}
                  selectedTier={draft.selectedTier}
                  notes={draft.notes}
                  busy={activeActionId !== null}
                  feedback={feedback?.governanceId === item.governanceId ? feedback : null}
                  onSelectedTierChange={(selectedTier) => updateDraft(item.governanceId, { selectedTier })}
                  onNotesChange={(notes) => updateDraft(item.governanceId, { notes })}
                  onApprove={() => void performReviewAction(item, "APPROVE")}
                  onRequestChanges={() => void performReviewAction(item, "REQUEST_CHANGES")}
                />
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
