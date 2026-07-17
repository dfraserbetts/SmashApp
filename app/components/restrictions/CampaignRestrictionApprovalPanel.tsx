"use client";

import Link from "next/link";

import {
  RESTRICTION_CONSUMER_LABELS,
  RESTRICTION_LIFECYCLE_LABELS,
  RESTRICTION_TIER_LABELS,
  RESTRICTION_TIER_QUALIFICATION_SUMMARIES,
  RESTRICTION_TIERS,
  type RestrictionTier,
} from "@/lib/restrictions/governance";
import {
  CAMPAIGN_RESTRICTION_HISTORY_ACTION_LABELS,
  canRequestCampaignRestrictionChanges,
  getCampaignRestrictionApprovalEligibility,
  type CampaignRestrictionQueueItem,
} from "@/lib/restrictions/governanceQueueView";

type ReviewFeedback = Readonly<{
  kind: "success" | "error";
  message: string;
}> | null;

export type CampaignRestrictionApprovalPanelProps = {
  item: CampaignRestrictionQueueItem;
  selectedTier: RestrictionTier | null;
  notes: string;
  busy: boolean;
  feedback: ReviewFeedback;
  onSelectedTierChange: (tier: RestrictionTier | null) => void;
  onNotesChange: (notes: string) => void;
  onApprove: () => void;
  onRequestChanges: () => void;
};

function formatTimestamp(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Invalid timestamp";
}

function DefinitionDescriptor({ label, descriptor }: { label: string; descriptor: string }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-black/35 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</h4>
      <p className="mt-2 text-sm text-zinc-100">{descriptor}</p>
    </section>
  );
}

export function CampaignRestrictionApprovalPanel({
  item,
  selectedTier,
  notes,
  busy,
  feedback,
  onSelectedTierChange,
  onNotesChange,
  onApprove,
  onRequestChanges,
}: CampaignRestrictionApprovalPanelProps) {
  const pending = item.effectiveLifecycle === "PENDING_GD_APPROVAL";
  const approvalEligibility = getCampaignRestrictionApprovalEligibility(item, selectedTier);
  const requestChangesEnabled = canRequestCampaignRestrictionChanges(item, notes) && !busy;
  const mismatch = item.submittedProposalMatchesLiveDefinition === false;
  const unsupported = item.submittedSnapshotStatus === "UNSUPPORTED";
  const orphaned = item.consumerPresence !== "PRESENT";
  const showCurrentSaved = Boolean(
    item.currentSavedDescriptor &&
    (mismatch || item.effectiveLifecycle === "APPROVAL_STALE"),
  );

  return (
    <article
      className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4"
      data-testid="campaign-restriction-review-card"
      data-governance-id={item.governanceId}
      data-lifecycle={item.effectiveLifecycle}
    >
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            {RESTRICTION_CONSUMER_LABELS[item.consumerType]}
          </p>
          <h3 className="text-lg font-semibold text-zinc-100">{item.consumerName}</h3>
          <p className="mt-1 text-sm text-zinc-400">
            {item.assignedPlayerLabel} · {item.characterName}
          </p>
        </div>
        <div className="text-sm text-zinc-400 lg:text-right">
          <p className="font-medium text-zinc-200">
            {RESTRICTION_LIFECYCLE_LABELS[item.effectiveLifecycle]}
          </p>
          <p>Submitted {formatTimestamp(item.submittedAt)}</p>
          <p>Submission revision {item.submissionRevision}</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link
          href={item.characterBuilderUrl}
          className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900"
        >
          Open Character Builder
        </Link>
        {item.characterArchived ? (
          <span className="rounded border border-amber-800 px-3 py-1.5 text-xs text-amber-200">
            Character archived
          </span>
        ) : null}
      </div>

      <section className="rounded-lg border border-zinc-800 bg-black/25 p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Ability Context
        </h4>
        {orphaned ? (
          <p className="mt-2 rounded border border-amber-800 bg-amber-950/25 p-2 text-sm text-amber-200">
            Consumer no longer exists on the Character. Ordinary descriptor context is unavailable.
          </p>
        ) : item.ordinaryDescriptorLines.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm text-zinc-200">
            {item.ordinaryDescriptorLines.map((line, index) => (
              <li key={`${index}:${line}`}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">Ordinary descriptor context is unavailable.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-sky-900/70 bg-sky-950/15 p-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-300">
            Proposed Restriction
          </h4>
          <p className="mt-2 text-sm text-zinc-100">{item.submittedDescriptor}</p>
        </div>
        <dl className="grid gap-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-zinc-500">Authoring mode</dt>
            <dd className="mt-1 text-zinc-200">{item.submittedAuthoringModeLabel}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Evaluation capability</dt>
            <dd className="mt-1 text-zinc-200">{item.submittedEvaluationLabel}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Validation / registry</dt>
            <dd className="mt-1 text-zinc-200">{item.submittedValidationLabel}</dd>
          </div>
        </dl>
        {item.submittedDiagnosticMessages.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-amber-200">
            {item.submittedDiagnosticMessages.map((message, index) => (
              <li key={`${index}:${message}`}>{message}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {unsupported ? (
        <p className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-100" role="alert">
          This proposal is preserved but unsupported by the current Restriction registry. It cannot be approved. Request Changes remains available.
        </p>
      ) : null}

      {mismatch ? (
        <p className="rounded border border-amber-600 bg-amber-950/30 p-3 text-sm font-medium text-amber-100" role="alert">
          The Character&apos;s saved Restriction has changed since submission. Approval is blocked. You may Request Changes against the submitted proposal.
        </p>
      ) : null}

      {orphaned ? (
        <p className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-100">
          Approval is unavailable, but the immutable proposal and review history remain preserved. Request Changes follows the existing server policy.
        </p>
      ) : null}

      {item.characterArchived ? (
        <p className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-100">
          Character archived — approval is unavailable. Request Changes remains available for the immutable Pending proposal.
        </p>
      ) : null}

      {showCurrentSaved && item.currentSavedDescriptor ? (
        <DefinitionDescriptor label="Current Saved Restriction" descriptor={item.currentSavedDescriptor} />
      ) : null}

      {item.effectiveLifecycle === "APPROVAL_STALE" ? (
        <div className="space-y-3">
          <DefinitionDescriptor label="Previously Approved Proposal" descriptor={item.submittedDescriptor} />
          <p className="text-sm text-amber-200">
            Previous approved tier: {item.selectedTier ? RESTRICTION_TIER_LABELS[item.selectedTier] : "Not recorded"}.
            The player must save and submit the revised Restriction before it can be reviewed again.
          </p>
        </div>
      ) : null}

      {item.effectiveLifecycle === "CHANGES_REQUESTED" ? (
        <p className="rounded border border-amber-800 bg-amber-950/20 p-3 text-sm text-amber-100">
          Game Director note: {item.latestPlayerFacingNote ?? "No note was recorded."} The player must revise the Restriction and resubmit it from the Character Builder.
        </p>
      ) : null}

      {item.effectiveLifecycle === "APPROVED" ? (
        <p className="rounded border border-emerald-800 bg-emerald-950/20 p-3 text-sm text-emerald-100">
          Approved as {item.selectedTier ? RESTRICTION_TIER_LABELS[item.selectedTier] : "an unrecorded tier"} by Game Director on {formatTimestamp(item.reviewedAt)}.
          {item.latestPlayerFacingNote ? ` Note to Player: ${item.latestPlayerFacingNote}` : ""}
        </p>
      ) : null}

      <p className="rounded border border-violet-800 bg-violet-950/20 p-3 text-sm text-violet-100">
        Economic credit is not active yet. Approval records the Restriction tier but does not currently change Power spend or cooldown.
      </p>

      {pending ? (
        <section className="space-y-3 rounded-lg border border-zinc-700 bg-black/30 p-3" aria-label="Restriction review controls">
          <div>
            <label htmlFor={`restriction-tier-${item.governanceId}`} className="text-sm font-medium text-zinc-200">
              Restriction Tier
            </label>
            <select
              id={`restriction-tier-${item.governanceId}`}
              value={selectedTier ?? ""}
              onChange={(event) => onSelectedTierChange(
                (RESTRICTION_TIERS as readonly string[]).includes(event.target.value)
                  ? event.target.value as RestrictionTier
                  : null,
              )}
              disabled={busy}
              className="mt-1 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 disabled:opacity-60"
            >
              <option value="">Select a Restriction Tier…</option>
              {RESTRICTION_TIERS.map((tier) => (
                <option key={tier} value={tier}>{RESTRICTION_TIER_LABELS[tier]}</option>
              ))}
            </select>
          </div>

          {selectedTier === "OATH_LIMITATION" ? (
            <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-100">
              <p className="font-semibold">Oath Limitation qualification</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {RESTRICTION_TIER_QUALIFICATION_SUMMARIES.OATH_LIMITATION.map((line) => (
                  <li key={line}>{line}</li>
                ))}
                <li>No numeric Oath credit is active.</li>
              </ul>
            </div>
          ) : null}

          <div>
            <label htmlFor={`restriction-notes-${item.governanceId}`} className="text-sm font-medium text-zinc-200">
              Notes to Player
            </label>
            <textarea
              id={`restriction-notes-${item.governanceId}`}
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              disabled={busy}
              rows={4}
              maxLength={4000}
              className="mt-1 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 disabled:opacity-60"
              placeholder="Optional for approval; required when requesting changes."
            />
          </div>

          {approvalEligibility.blockers.length > 0 ? (
            <div className="rounded border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-300" role="status">
              <p className="font-semibold">Approval is disabled because:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {approvalEligibility.blockers.map((blocker) => (
                  <li key={blocker.code}>{blocker.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRequestChanges}
              disabled={!requestChangesEnabled}
              className="rounded border border-amber-700 px-3 py-2 text-sm text-amber-100 hover:bg-amber-950/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Request Changes
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={!approvalEligibility.canApprove || busy}
              className="rounded border border-emerald-700 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-950/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Approve and Apply Tier
            </button>
          </div>
          {!notes.trim() ? (
            <p className="text-xs text-zinc-500">Request Changes requires a nonblank Note to Player.</p>
          ) : null}
        </section>
      ) : null}

      {feedback ? (
        <p
          className={feedback.kind === "success" ? "text-sm text-emerald-300" : "text-sm text-red-300"}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}

      {item.history.length > 0 ? (
        <details className="rounded-lg border border-zinc-800 bg-black/25 p-3">
          <summary className="cursor-pointer text-sm font-medium text-zinc-200">
            Immutable review history ({item.history.length})
          </summary>
          <ol className="mt-3 space-y-2 text-xs text-zinc-400">
            {item.history.map((event) => (
              <li key={event.id} className="rounded border border-zinc-800 p-2">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="font-medium text-zinc-200">
                    {CAMPAIGN_RESTRICTION_HISTORY_ACTION_LABELS[event.action]}
                  </span>
                  <span>{formatTimestamp(event.createdAt)}</span>
                  <span>Revision {event.submissionRevision}</span>
                  {event.selectedTier ? <span>{RESTRICTION_TIER_LABELS[event.selectedTier]}</span> : null}
                </div>
                {event.notes ? <p className="mt-1 text-zinc-200">{event.notes}</p> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </article>
  );
}
