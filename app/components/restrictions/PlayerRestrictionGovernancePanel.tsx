"use client";

import { getRestrictionReadOnlyModel } from "@/lib/restrictions/editorModel";
import {
  RESTRICTION_TIER_LABELS,
  type PlayerRestrictionConsumer,
} from "@/lib/restrictions/governance";
import {
  getLatestPlayerFacingRestrictionReviewNote,
  getRestrictionLifecycleDisplayLabel,
  hasPendingRestrictionProposalMismatch,
  hasUnsavedApprovedRestrictionMismatch,
  type PlayerRestrictionGovernanceReadEntry,
} from "@/lib/restrictions/governanceView";
import type { AbilityRestrictionDefinitionV1 } from "@/lib/restrictions";

type ActionFeedback = Readonly<{
  kind: "success" | "error";
  message: string;
}> | null;

export type PlayerRestrictionGovernancePanelProps = {
  consumerType: PlayerRestrictionConsumer;
  consumerId: string | null;
  consumerNoun: "Power" | "Ability";
  entry: PlayerRestrictionGovernanceReadEntry | null;
  localDefinition: AbilityRestrictionDefinitionV1 | null;
  localFingerprint: string | null;
  materializationReady: boolean;
  ordinaryValidationPasses: boolean;
  grossPoolOverspent: boolean;
  canEdit: boolean;
  governanceAvailable: boolean;
  busy: boolean;
  feedback: ActionFeedback;
  onSaveAndSubmit: () => void;
};

const HISTORY_ACTION_LABELS: Readonly<Record<
  PlayerRestrictionGovernanceReadEntry["history"][number]["action"],
  string
>> = {
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes Requested",
  APPROVAL_STALE: "Approval Stale",
};

function formatTimestamp(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Invalid timestamp";
}

function RestrictionDescriptor({
  definition,
  label,
  consumerNoun,
}: {
  definition: AbilityRestrictionDefinitionV1 | null;
  label: string;
  consumerNoun: "Power" | "Ability";
}) {
  if (!definition) return null;
  const resolution = getRestrictionReadOnlyModel(definition, { consumerNoun });
  return (
    <div className="rounded border border-zinc-800 bg-black/40 p-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <p className="mt-1 text-sm text-zinc-200">
        {resolution.descriptor ?? "No descriptor is available."}
      </p>
    </div>
  );
}

export function PlayerRestrictionGovernancePanel({
  consumerType,
  consumerId,
  consumerNoun,
  entry,
  localDefinition,
  localFingerprint,
  materializationReady,
  ordinaryValidationPasses,
  grossPoolOverspent,
  canEdit,
  governanceAvailable,
  busy,
  feedback,
  onSaveAndSubmit,
}: PlayerRestrictionGovernancePanelProps) {
  const savedDefinition = entry?.currentSemanticRestriction ?? null;
  const hasCurrentRestriction = materializationReady
    ? localDefinition !== null
    : savedDefinition !== null;
  const unsavedLocalRemoval = materializationReady &&
    localDefinition === null &&
    savedDefinition !== null;
  const historicalOnly = !hasCurrentRestriction && Boolean(entry?.governanceId);
  const lifecycle = entry?.effectiveLifecycle ?? "DRAFT";
  const pendingMismatch = hasPendingRestrictionProposalMismatch(entry);
  const localApprovedMismatch = hasUnsavedApprovedRestrictionMismatch(
    entry,
    localFingerprint,
  );
  const localDiffersFromSaved = Boolean(
    localDefinition &&
    localFingerprint &&
    entry?.currentFingerprint &&
    localFingerprint !== entry.currentFingerprint,
  );
  const latestReviewNote = getLatestPlayerFacingRestrictionReviewNote(entry);
  const safeUnsupported = entry?.semanticStatus === "UNSUPPORTED" ||
    entry?.submittedSnapshotStatus === "UNSUPPORTED";
  const actionLabel = lifecycle === "CHANGES_REQUESTED"
    ? "Save and Resubmit for GD Approval"
    : lifecycle === "APPROVAL_STALE"
      ? "Save and Submit Revised Restriction"
      : lifecycle === "DRAFT"
        ? "Save and Submit for GD Approval"
        : null;
  const actionEnabled = Boolean(
    actionLabel &&
    localDefinition &&
    consumerId?.trim() &&
    materializationReady &&
    ordinaryValidationPasses &&
    canEdit &&
    governanceAvailable &&
    !busy,
  );

  return (
    <section
      className="mt-3 space-y-3 rounded-lg border border-sky-900/70 bg-sky-950/15 p-3"
      data-testid="player-restriction-governance-panel"
      data-consumer-type={consumerType}
      data-governance-lifecycle={hasCurrentRestriction ? lifecycle : "NONE"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-sky-100">Restriction Governance</h4>
          <p className="mt-1 text-xs text-sky-300">
            {hasCurrentRestriction
              ? getRestrictionLifecycleDisplayLabel(lifecycle)
              : "No Restriction — approval not required"}
          </p>
        </div>
        {entry ? (
          <span className="rounded border border-sky-900 px-2 py-1 text-[11px] text-sky-300">
            Revision {entry.submissionRevision}
          </span>
        ) : null}
      </div>

      {!governanceAvailable && hasCurrentRestriction ? (
        <p className="rounded border border-amber-700 bg-amber-950/30 p-2 text-xs text-amber-200" role="status">
          Governance status is unavailable. The Character draft remains editable, but submission is paused until status reloads.
        </p>
      ) : null}

      {!hasCurrentRestriction ? (
        <div className="space-y-2 text-sm text-zinc-300">
          <p>No semantic Restriction currently applies, so Restriction approval is not required.</p>
          {historicalOnly ? (
            <p className="rounded border border-amber-800 bg-amber-950/20 p-2 text-xs text-amber-200">
              Historical governance is preserved, but it is inactive while no semantic Restriction exists. A new Restriction must be saved before it can be submitted.
            </p>
          ) : null}
          {unsavedLocalRemoval ? (
            <p className="rounded border border-sky-800 bg-sky-950/20 p-2 text-xs text-sky-200">
              Unsaved local change: the server still has the previous semantic Restriction until this Character draft is saved.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {lifecycle === "DRAFT" ? (
            <p className="text-xs text-zinc-300">
              No Restriction tier or economic credit is active for this Draft.
            </p>
          ) : null}

          {lifecycle === "PENDING_GD_APPROVAL" ? (
            <div className="space-y-2 text-xs text-zinc-300">
              <p>Submitted {formatTimestamp(entry?.submittedAt ?? null)} at revision {entry?.submissionRevision ?? 0}.</p>
              <p>No Restriction tier or economic credit is active while review is Pending.</p>
              {pendingMismatch ? (
                <p className="rounded border border-amber-600 bg-amber-950/30 p-2 font-medium text-amber-100" role="alert">
                  The saved Restriction has changed since this proposal was submitted. The Game Director is still reviewing the immutable submitted proposal. Approval is blocked until the current version can be resubmitted.
                </p>
              ) : null}
            </div>
          ) : null}

          {lifecycle === "APPROVED" ? (
            <div className="space-y-1 text-xs text-emerald-200">
              <p>
                Approved as {entry?.selectedTier ? RESTRICTION_TIER_LABELS[entry.selectedTier] : "an unclassified tier"} on {formatTimestamp(entry?.reviewedAt ?? null)}.
              </p>
              <p>The approved proposal matches the current saved Restriction.</p>
              <p>Economic credit is not active yet.</p>
              {latestReviewNote ? <p className="text-zinc-300">Latest approval note: {latestReviewNote}</p> : null}
            </div>
          ) : null}

          {lifecycle === "CHANGES_REQUESTED" ? (
            <div className="space-y-2 text-xs text-amber-200">
              <p>Reviewed {formatTimestamp(entry?.reviewedAt ?? null)}. No previous tier or economic credit carries into resubmission.</p>
              {latestReviewNote ? (
                <p className="rounded border border-amber-700 bg-amber-950/30 p-2 font-medium">
                  Game Director note: {latestReviewNote}
                </p>
              ) : null}
            </div>
          ) : null}

          {lifecycle === "APPROVAL_STALE" ? (
            <div className="space-y-1 text-xs text-amber-200">
              <p>
                Previous tier: {entry?.selectedTier ? RESTRICTION_TIER_LABELS[entry.selectedTier] : "Not recorded"}; reviewed {formatTimestamp(entry?.reviewedAt ?? null)}.
              </p>
              <p>The prior approval and any future credit are inactive for the current saved Restriction.</p>
            </div>
          ) : null}

          {localApprovedMismatch ? (
            <p className="rounded border border-amber-700 bg-amber-950/30 p-2 text-xs text-amber-200" role="status">
              Unsaved local change: saving this semantic Restriction will make the current approval non-current. Server governance remains Approved until the save succeeds.
            </p>
          ) : null}

          {safeUnsupported ? (
            <p className="rounded border border-amber-700 bg-amber-950/30 p-2 text-xs text-amber-200">
              This stored Restriction is safe but unsupported by the current registry. It may be submitted or returned for changes, but the registry cannot approve it.
            </p>
          ) : null}

          {grossPoolOverspent ? (
            <p className="rounded border border-violet-800 bg-violet-950/20 p-2 text-xs text-violet-200">
              This draft may be submitted while over budget, but it is not table-ready unless its final authoritative budget becomes valid. Approval does not currently change Power spend.
            </p>
          ) : null}

          {entry?.submittedDefinition ? (
            <RestrictionDescriptor
              definition={entry.submittedDefinition}
              label={lifecycle === "APPROVED" ? "Approved proposal" : "Immutable submitted proposal"}
              consumerNoun={consumerNoun}
            />
          ) : null}
          <RestrictionDescriptor
            definition={savedDefinition ?? localDefinition}
            label={savedDefinition ? "Current saved Restriction" : "Current Restriction draft"}
            consumerNoun={consumerNoun}
          />
          {localDiffersFromSaved ? (
            <RestrictionDescriptor
              definition={localDefinition}
              label="Unsaved local Restriction preview"
              consumerNoun={consumerNoun}
            />
          ) : null}

          {actionLabel ? (
            <div>
              <button
                type="button"
                onClick={onSaveAndSubmit}
                disabled={!actionEnabled}
                className="rounded border border-sky-700 px-3 py-2 text-xs font-medium text-sky-100 hover:bg-sky-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="restriction-save-and-submit"
              >
                {busy ? "Saving and submitting..." : actionLabel}
              </button>
              {!ordinaryValidationPasses ? (
                <p className="mt-1 text-xs text-red-300">Resolve this consumer&apos;s ordinary validation errors before submitting.</p>
              ) : null}
              {!consumerId?.trim() ? (
                <p className="mt-1 text-xs text-red-300">A stable consumer identity is required before submitting.</p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {feedback ? (
        <p
          className={feedback.kind === "success" ? "text-xs text-emerald-300" : "text-xs text-red-300"}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}

      {entry && entry.history.length > 0 ? (
        <details className="rounded border border-zinc-800 bg-black/30 p-2" data-testid="restriction-governance-history">
          <summary className="cursor-pointer text-xs font-medium text-zinc-300">
            Governance history ({entry.history.length})
          </summary>
          <ol className="mt-2 space-y-2 text-xs text-zinc-400">
            {entry.history.map((history) => (
              <li key={history.id} className="rounded border border-zinc-800 p-2">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="font-medium text-zinc-200">{HISTORY_ACTION_LABELS[history.action]}</span>
                  <span>{formatTimestamp(history.createdAt)}</span>
                  <span>Revision {history.submissionRevision}</span>
                  {history.selectedTier ? <span>{RESTRICTION_TIER_LABELS[history.selectedTier]}</span> : null}
                </div>
                {history.notes ? <p className="mt-1 text-zinc-300">{history.notes}</p> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
