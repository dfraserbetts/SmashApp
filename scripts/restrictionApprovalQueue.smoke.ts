import type { AbilityRestrictionDefinitionV1 } from "../lib/restrictions";
import {
  CAMPAIGN_RESTRICTION_HISTORY_ACTION_LABELS,
  CAMPAIGN_RESTRICTION_QUEUE_FILTER_LABELS,
  buildCampaignRestrictionApprovalBlockers,
  canRequestCampaignRestrictionChanges,
  getCampaignRestrictionApprovalEligibility,
  getCampaignRestrictionQueueItemsForFilter,
  getCampaignRestrictionReviewDraftKey,
  groupCampaignRestrictionQueueItems,
  resolveRestrictionQueuePlayerLabel,
  type CampaignRestrictionQueueItem,
} from "../lib/restrictions/governanceQueueView";

let checks = 0;

function check(condition: unknown, message: string): asserts condition {
  checks += 1;
  if (!condition) throw new Error(`Check ${checks} failed: ${message}`);
}

const definition: AbilityRestrictionDefinitionV1 = Object.freeze({
  schemaVersion: 1,
  authoringMode: "CUSTOM_NARRATIVE",
  templateKey: null,
  templateVersion: null,
  parameters: Object.freeze({}),
  customNarrativeText: "Only while defending the Old Gate.",
});

function item(
  governanceId: string,
  patch: Partial<CampaignRestrictionQueueItem> = {},
): CampaignRestrictionQueueItem {
  return Object.freeze({
    governanceId,
    campaignId: "campaign-1",
    characterId: "character-1",
    characterName: "Arin",
    assignedPlayerLabel: "Player",
    characterArchived: false,
    consumerType: "PLAYER_POWER",
    consumerId: `power-${governanceId}`,
    consumerName: "Old Gate Ward",
    consumerPresence: "PRESENT",
    ordinaryDescriptorLines: Object.freeze(["Roll 3 dice."]),
    submittedDefinition: definition,
    submittedDescriptor: "Restriction: only while defending the Old Gate.",
    submittedAuthoringModeLabel: "Fully Custom",
    submittedEvaluationLabel: "GD adjudication",
    submittedValidationLabel: "Valid in the current Restriction registry.",
    submittedSnapshotStatus: "VALID",
    submittedDiagnosticMessages: Object.freeze([]),
    currentSavedDefinition: definition,
    currentSavedDescriptor: "Restriction: only while defending the Old Gate.",
    submittedProposalMatchesLiveDefinition: true,
    approvedProposalMatchesLiveDefinition: null,
    storedLifecycle: "PENDING_GD_APPROVAL",
    effectiveLifecycle: "PENDING_GD_APPROVAL",
    approvalCurrent: false,
    selectedTier: null,
    submissionRevision: 1,
    submittedAt: "2026-07-17T10:00:00.000Z",
    reviewedAt: null,
    latestPlayerFacingNote: null,
    history: Object.freeze([]),
    approvalBlockers: Object.freeze([]),
    requestChangesAvailable: true,
    characterBuilderUrl: "/campaign/campaign-1/characters/character-1/builder",
    activityAt: "2026-07-17T10:00:00.000Z",
    ...patch,
  });
}

check(resolveRestrictionQueuePlayerLabel({
  playerName: "  Rowan  ",
  assignedUserId: "player-1",
  campaignOwnerUserId: "owner-1",
}) === "Rowan", "campaign playerName is the preferred privacy-safe label");
check(resolveRestrictionQueuePlayerLabel({
  playerName: null,
  assignedUserId: "owner-1",
  campaignOwnerUserId: "owner-1",
}) === "Campaign Owner", "assigned owner receives the Campaign Owner fallback");
check(resolveRestrictionQueuePlayerLabel({
  playerName: null,
  assignedUserId: "player-1",
  campaignOwnerUserId: "owner-1",
}) === "Player", "another assigned member receives the generic Player fallback");
check(resolveRestrictionQueuePlayerLabel({
  playerName: null,
  assignedUserId: null,
  campaignOwnerUserId: "owner-1",
}) === "Unassigned", "an unassigned Character receives the Unassigned fallback");

const oldestPending = item("pending-old", {
  submittedAt: "2026-07-17T08:00:00.000Z",
  activityAt: "2026-07-17T08:00:00.000Z",
});
const matchingPending = item("pending-new", {
  submittedAt: "2026-07-17T09:00:00.000Z",
  activityAt: "2026-07-17T09:00:00.000Z",
});
const mismatchPending = item("pending-mismatch", {
  submittedAt: "2026-07-17T10:00:00.000Z",
  submittedProposalMatchesLiveDefinition: false,
});
const unsupportedPending = item("pending-unsupported", {
  submittedAt: "2026-07-17T11:00:00.000Z",
  submittedSnapshotStatus: "UNSUPPORTED",
});
const orphanedPending = item("pending-orphan", {
  submittedAt: "2026-07-17T12:00:00.000Z",
  consumerPresence: "ABSENT",
  ordinaryDescriptorLines: Object.freeze([]),
  submittedProposalMatchesLiveDefinition: false,
});
const archivedPending = item("pending-archived", {
  submittedAt: "2026-07-17T13:00:00.000Z",
  characterArchived: true,
});
const changesOld = item("changes-old", {
  storedLifecycle: "CHANGES_REQUESTED",
  effectiveLifecycle: "CHANGES_REQUESTED",
  reviewedAt: "2026-07-17T12:00:00.000Z",
  activityAt: "2026-07-17T12:00:00.000Z",
});
const changesNew = item("changes-new", {
  storedLifecycle: "CHANGES_REQUESTED",
  effectiveLifecycle: "CHANGES_REQUESTED",
  reviewedAt: "2026-07-17T13:00:00.000Z",
  activityAt: "2026-07-17T13:00:00.000Z",
});
const staleOld = item("stale-old", {
  storedLifecycle: "APPROVAL_STALE",
  effectiveLifecycle: "APPROVAL_STALE",
  selectedTier: "MATERIAL_LIMITATION",
  activityAt: "2026-07-17T14:00:00.000Z",
});
const approvedNowStale = item("approved-now-stale", {
  storedLifecycle: "APPROVED",
  effectiveLifecycle: "APPROVAL_STALE",
  approvalCurrent: false,
  selectedTier: "SUBSTANTIAL_LIMITATION",
  approvedProposalMatchesLiveDefinition: false,
  activityAt: "2026-07-17T15:00:00.000Z",
});
const approvedOld = item("approved-old", {
  storedLifecycle: "APPROVED",
  effectiveLifecycle: "APPROVED",
  approvalCurrent: true,
  selectedTier: "MATERIAL_LIMITATION",
  reviewedAt: "2026-07-17T16:00:00.000Z",
  activityAt: "2026-07-17T16:00:00.000Z",
});
const approvedNew = item("approved-new", {
  storedLifecycle: "APPROVED",
  effectiveLifecycle: "APPROVED",
  approvalCurrent: true,
  selectedTier: "NARROW_AVAILABILITY",
  reviewedAt: "2026-07-17T17:00:00.000Z",
  activityAt: "2026-07-17T17:00:00.000Z",
});
const persistedDraft = item("persisted-draft", {
  storedLifecycle: "DRAFT",
  effectiveLifecycle: "DRAFT",
  requestChangesAvailable: false,
});

const grouped = groupCampaignRestrictionQueueItems([
  approvedOld,
  changesOld,
  unsupportedPending,
  staleOld,
  matchingPending,
  orphanedPending,
  approvedNew,
  changesNew,
  mismatchPending,
  archivedPending,
  approvedNowStale,
  oldestPending,
  persistedDraft,
], 1);

check(grouped.groups.pending.length === 6, "all persisted Pending variants remain in the Pending queue");
check(grouped.groups.pending[0].governanceId === "pending-old", "Pending sorts oldest submitted proposal first");
check(grouped.groups.pending[1].governanceId === "pending-new", "matching Pending follows deterministic submission order");
check(grouped.groups.pending.some((entry) => entry.governanceId === "pending-mismatch"), "mismatched Pending remains visible");
check(grouped.groups.pending.some((entry) => entry.governanceId === "pending-unsupported"), "unsupported Pending remains visible");
check(grouped.groups.pending.some((entry) => entry.governanceId === "pending-orphan"), "orphaned Pending remains visible");
check(grouped.groups.pending.some((entry) => entry.governanceId === "pending-archived"), "archived Pending remains visible");
check(grouped.groups.changesRequested[0].governanceId === "changes-new", "Changes Requested sorts newest review first");
check(grouped.groups.approvalStale[0].governanceId === "approved-now-stale", "newest effective Stale sorts first");
check(grouped.groups.approvalStale.some((entry) => entry.governanceId === "approved-now-stale"), "Approved-now-stale moves to the Stale view");
check(!grouped.groups.recentlyApproved.some((entry) => entry.governanceId === "approved-now-stale"), "obsolete approval is not presented as current");
check(grouped.groups.recentlyApproved.length === 1, "Recently Approved is bounded by the supplied limit");
check(grouped.groups.recentlyApproved[0].governanceId === "approved-new", "Recently Approved sorts newest review first");
check(grouped.counts.pending === 6, "pending summary count is exact");
check(grouped.counts.changesRequested === 2, "Changes Requested count is exact");
check(grouped.counts.approvalStale === 2, "Approval Stale count is exact");
check(grouped.counts.currentApproved === 2, "current Approved count includes the unbounded set");
check(grouped.counts.recentlyApproved === 1, "Recently Approved count matches the bounded list");
check(!Object.values(grouped.groups).flat().some((entry) => entry.governanceId === "persisted-draft"), "persisted Draft does not enter review views");
check(getCampaignRestrictionQueueItemsForFilter(grouped.groups, "PENDING") === grouped.groups.pending, "Pending filter maps exactly");
check(getCampaignRestrictionQueueItemsForFilter(grouped.groups, "CHANGES_REQUESTED") === grouped.groups.changesRequested, "Changes Requested filter maps exactly");
check(getCampaignRestrictionQueueItemsForFilter(grouped.groups, "APPROVAL_STALE") === grouped.groups.approvalStale, "Stale filter maps exactly");
check(getCampaignRestrictionQueueItemsForFilter(grouped.groups, "RECENTLY_APPROVED") === grouped.groups.recentlyApproved, "Approved filter maps exactly");

const validBlockers = buildCampaignRestrictionApprovalBlockers({
  governanceId: "governance-1",
  storedLifecycle: "PENDING_GD_APPROVAL",
  effectiveLifecycle: "PENDING_GD_APPROVAL",
  consumerPresence: "PRESENT",
  submittedProposalMatchesLiveDefinition: true,
  submittedSnapshotStatus: "VALID",
  characterArchived: false,
  selfApprovalPolicyUnresolved: false,
});
check(validBlockers.length === 0, "matching supported active Pending has no base approval blocker");
check(!getCampaignRestrictionApprovalEligibility(item("valid"), null).canApprove, "no tier disables approval");
check(getCampaignRestrictionApprovalEligibility(item("valid"), "MATERIAL_LIMITATION").canApprove, "a valid matching supported Pending can approve with a tier");

const mismatchBlockers = buildCampaignRestrictionApprovalBlockers({
  governanceId: "mismatch",
  storedLifecycle: "PENDING_GD_APPROVAL",
  effectiveLifecycle: "PENDING_GD_APPROVAL",
  consumerPresence: "PRESENT",
  submittedProposalMatchesLiveDefinition: false,
  submittedSnapshotStatus: "VALID",
  characterArchived: false,
  selfApprovalPolicyUnresolved: false,
});
check(mismatchBlockers.some((entry) => entry.code === "LIVE_PROPOSAL_MISMATCH"), "mismatch disables approval with an explained blocker");
const unsupportedBlockers = buildCampaignRestrictionApprovalBlockers({
  governanceId: "unsupported",
  storedLifecycle: "PENDING_GD_APPROVAL",
  effectiveLifecycle: "PENDING_GD_APPROVAL",
  consumerPresence: "PRESENT",
  submittedProposalMatchesLiveDefinition: true,
  submittedSnapshotStatus: "UNSUPPORTED",
  characterArchived: false,
  selfApprovalPolicyUnresolved: false,
});
check(unsupportedBlockers.some((entry) => entry.code === "ACTIVE_REGISTRY_SUPPORT_REQUIRED"), "unsupported proposal disables approval");
const orphanedBlockers = buildCampaignRestrictionApprovalBlockers({
  governanceId: "orphan",
  storedLifecycle: "PENDING_GD_APPROVAL",
  effectiveLifecycle: "PENDING_GD_APPROVAL",
  consumerPresence: "ABSENT",
  submittedProposalMatchesLiveDefinition: false,
  submittedSnapshotStatus: "VALID",
  characterArchived: false,
  selfApprovalPolicyUnresolved: false,
});
check(orphanedBlockers.some((entry) => entry.code === "LIVE_CONSUMER_REQUIRED"), "orphaned consumer disables approval");
const archivedBlockers = buildCampaignRestrictionApprovalBlockers({
  governanceId: "archived",
  storedLifecycle: "PENDING_GD_APPROVAL",
  effectiveLifecycle: "PENDING_GD_APPROVAL",
  consumerPresence: "PRESENT",
  submittedProposalMatchesLiveDefinition: true,
  submittedSnapshotStatus: "VALID",
  characterArchived: true,
  selfApprovalPolicyUnresolved: false,
});
check(archivedBlockers.some((entry) => entry.code === "CHARACTER_ARCHIVED"), "archived Character disables approval exactly as the server does");
const selfBlockers = buildCampaignRestrictionApprovalBlockers({
  governanceId: "self",
  storedLifecycle: "PENDING_GD_APPROVAL",
  effectiveLifecycle: "PENDING_GD_APPROVAL",
  consumerPresence: "PRESENT",
  submittedProposalMatchesLiveDefinition: true,
  submittedSnapshotStatus: "VALID",
  characterArchived: false,
  selfApprovalPolicyUnresolved: true,
});
check(selfBlockers.some((entry) => entry.code === "SELF_APPROVAL_POLICY_UNRESOLVED"), "self-policy unresolved is a safe blocker flag");
check(selfBlockers.some((entry) => entry.message.includes("has not yet been decided")), "self-policy explanation does not invent permanent denial doctrine");

check(canRequestCampaignRestrictionChanges(mismatchPending, "Please restore the submitted version."), "Request Changes remains available for mismatch");
check(canRequestCampaignRestrictionChanges(unsupportedPending, "Please replace the unsupported template."), "Request Changes remains available for unsupported proposal");
check(canRequestCampaignRestrictionChanges(orphanedPending, "Please remove or recreate the Power."), "Request Changes remains available for orphaned proposal");
check(canRequestCampaignRestrictionChanges(archivedPending, "Please resolve this archived proposal."), "Request Changes mirrors the server's archived behavior");
check(!canRequestCampaignRestrictionChanges(matchingPending, "   "), "Request Changes requires a trimmed nonblank note");
check(!canRequestCampaignRestrictionChanges(changesNew, "A note"), "Request Changes is unavailable outside Pending");

check(getCampaignRestrictionReviewDraftKey("governance-1") === "restriction-review:governance-1", "tier/note drafts use stable governance IDs");
check(CAMPAIGN_RESTRICTION_QUEUE_FILTER_LABELS.PENDING === "Pending", "Pending view label is exact");
check(CAMPAIGN_RESTRICTION_QUEUE_FILTER_LABELS.CHANGES_REQUESTED === "Changes Requested", "Changes Requested view label is exact");
check(CAMPAIGN_RESTRICTION_QUEUE_FILTER_LABELS.APPROVAL_STALE === "Approval Stale", "Approval Stale view label is exact");
check(CAMPAIGN_RESTRICTION_QUEUE_FILTER_LABELS.RECENTLY_APPROVED === "Recently Approved", "Recently Approved view label is exact");
check(CAMPAIGN_RESTRICTION_HISTORY_ACTION_LABELS.SUBMITTED === "Submitted", "history Submitted label is exact");
check(CAMPAIGN_RESTRICTION_HISTORY_ACTION_LABELS.APPROVED === "Approved", "history Approved label is exact");
check(CAMPAIGN_RESTRICTION_HISTORY_ACTION_LABELS.CHANGES_REQUESTED === "Changes Requested", "history Changes Requested label is exact");
check(CAMPAIGN_RESTRICTION_HISTORY_ACTION_LABELS.APPROVAL_STALE === "Approval Stale", "history Approval Stale label is exact");

const serialized = JSON.stringify(grouped);
check(!serialized.includes("email"), "queue contract exposes no email field");
check(!serialized.includes("actorUserId"), "queue contract exposes no raw actor user ID");
check(!serialized.includes("submittedByUserId"), "queue contract exposes no submitter user ID");
check(!serialized.includes("reviewedByUserId"), "queue contract exposes no reviewer user ID");
check(!serialized.includes("semanticFingerprint"), "queue contract exposes no full fingerprint");
check(!serialized.includes("restrictionDiscountPercent"), "queue contract exposes no economic field");

console.log(`Restriction approval queue smoke passed (${checks} checks).`);
