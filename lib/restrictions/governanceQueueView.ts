import type { AbilityRestrictionDefinitionV1 } from "@/lib/restrictions";
import {
  RESTRICTION_TIERS,
  type PlayerRestrictionConsumer,
  type RestrictionLifecycleState,
  type RestrictionTier,
} from "@/lib/restrictions/governance";
import type { PlayerRestrictionConsumerPresence } from "@/lib/restrictions/playerRestrictionConsumerResolver";

export const CAMPAIGN_RESTRICTION_QUEUE_FILTERS = [
  "PENDING",
  "CHANGES_REQUESTED",
  "APPROVAL_STALE",
  "RECENTLY_APPROVED",
] as const;

export type CampaignRestrictionQueueFilter =
  (typeof CAMPAIGN_RESTRICTION_QUEUE_FILTERS)[number];

export const CAMPAIGN_RESTRICTION_QUEUE_FILTER_LABELS: Readonly<
  Record<CampaignRestrictionQueueFilter, string>
> = {
  PENDING: "Pending",
  CHANGES_REQUESTED: "Changes Requested",
  APPROVAL_STALE: "Approval Stale",
  RECENTLY_APPROVED: "Recently Approved",
};

export const CAMPAIGN_RESTRICTION_HISTORY_ACTION_LABELS = {
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes Requested",
  APPROVAL_STALE: "Approval Stale",
} as const;

export type CampaignRestrictionQueueHistoryEntry = Readonly<{
  id: string;
  action: keyof typeof CAMPAIGN_RESTRICTION_HISTORY_ACTION_LABELS;
  createdAt: string;
  submissionRevision: number;
  selectedTier: RestrictionTier | null;
  notes: string | null;
}>;

export const CAMPAIGN_RESTRICTION_APPROVAL_BLOCKER_MESSAGES = {
  GOVERNANCE_RECORD_REQUIRED: "A persisted governance record is required.",
  PENDING_PROPOSAL_REQUIRED: "Only a Pending proposal can be approved.",
  LIVE_CONSUMER_REQUIRED: "The live consumer must still exist on the Character.",
  LIVE_PROPOSAL_MISMATCH: "The immutable submitted proposal no longer matches the Character's saved Restriction.",
  ACTIVE_REGISTRY_SUPPORT_REQUIRED: "The submitted Restriction is unsupported by the active registry.",
  CHARACTER_ARCHIVED: "Archived Characters cannot receive Restriction approval.",
  SELF_APPROVAL_POLICY_UNRESOLVED: "This review cannot be completed because self-approval policy has not yet been decided.",
  RESTRICTION_TIER_REQUIRED: "Select a Restriction Tier before approving.",
} as const;

export type CampaignRestrictionApprovalBlockerCode =
  keyof typeof CAMPAIGN_RESTRICTION_APPROVAL_BLOCKER_MESSAGES;

export type CampaignRestrictionApprovalBlocker = Readonly<{
  code: CampaignRestrictionApprovalBlockerCode;
  message: string;
}>;

export type CampaignRestrictionQueueItem = Readonly<{
  governanceId: string;
  campaignId: string;
  characterId: string;
  characterName: string;
  assignedPlayerLabel: string;
  characterArchived: boolean;
  consumerType: PlayerRestrictionConsumer;
  consumerId: string;
  consumerName: string;
  consumerPresence: PlayerRestrictionConsumerPresence;
  ordinaryDescriptorLines: readonly string[];
  submittedDefinition: AbilityRestrictionDefinitionV1;
  submittedDescriptor: string;
  submittedAuthoringModeLabel: string;
  submittedEvaluationLabel: string;
  submittedValidationLabel: string;
  submittedSnapshotStatus: "VALID" | "UNSUPPORTED";
  submittedDiagnosticMessages: readonly string[];
  currentSavedDefinition: AbilityRestrictionDefinitionV1 | null;
  currentSavedDescriptor: string | null;
  submittedProposalMatchesLiveDefinition: boolean | null;
  approvedProposalMatchesLiveDefinition: boolean | null;
  storedLifecycle: RestrictionLifecycleState;
  effectiveLifecycle: RestrictionLifecycleState;
  approvalCurrent: boolean;
  selectedTier: RestrictionTier | null;
  submissionRevision: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  latestPlayerFacingNote: string | null;
  history: readonly CampaignRestrictionQueueHistoryEntry[];
  approvalBlockers: readonly CampaignRestrictionApprovalBlocker[];
  requestChangesAvailable: boolean;
  characterBuilderUrl: string;
  activityAt: string;
}>;

export type CampaignRestrictionQueueGroups = Readonly<{
  pending: readonly CampaignRestrictionQueueItem[];
  changesRequested: readonly CampaignRestrictionQueueItem[];
  approvalStale: readonly CampaignRestrictionQueueItem[];
  recentlyApproved: readonly CampaignRestrictionQueueItem[];
}>;

export type CampaignRestrictionQueueCounts = Readonly<{
  pending: number;
  changesRequested: number;
  approvalStale: number;
  recentlyApproved: number;
  currentApproved: number;
}>;

export type CampaignRestrictionQueueReadModel = Readonly<{
  campaign: Readonly<{ id: string; name: string }>;
  access: Readonly<{ canManageCampaign: true }>;
  groups: CampaignRestrictionQueueGroups;
  counts: CampaignRestrictionQueueCounts;
}>;

export type CampaignRestrictionQueueSummary = Readonly<{
  counts: CampaignRestrictionQueueCounts;
}>;

export function resolveRestrictionQueuePlayerLabel(params: {
  playerName: string | null | undefined;
  assignedUserId: string | null | undefined;
  campaignOwnerUserId: string;
}): string {
  const playerName = params.playerName?.trim();
  if (playerName) return playerName;
  if (!params.assignedUserId) return "Unassigned";
  return params.assignedUserId === params.campaignOwnerUserId
    ? "Campaign Owner"
    : "Player";
}

export function getCampaignRestrictionReviewDraftKey(governanceId: string): string {
  return `restriction-review:${governanceId.trim()}`;
}

export function isCampaignRestrictionTier(value: unknown): value is RestrictionTier {
  return typeof value === "string" &&
    (RESTRICTION_TIERS as readonly string[]).includes(value);
}

export function buildCampaignRestrictionApprovalBlockers(params: {
  governanceId: string | null;
  storedLifecycle: RestrictionLifecycleState | null;
  effectiveLifecycle: RestrictionLifecycleState;
  consumerPresence: PlayerRestrictionConsumerPresence;
  submittedProposalMatchesLiveDefinition: boolean | null;
  submittedSnapshotStatus: "VALID" | "UNSUPPORTED" | null;
  characterArchived: boolean;
  selfApprovalPolicyUnresolved: boolean;
}): readonly CampaignRestrictionApprovalBlocker[] {
  const codes: CampaignRestrictionApprovalBlockerCode[] = [];
  if (!params.governanceId?.trim()) codes.push("GOVERNANCE_RECORD_REQUIRED");
  if (
    params.storedLifecycle !== "PENDING_GD_APPROVAL" ||
    params.effectiveLifecycle !== "PENDING_GD_APPROVAL"
  ) {
    codes.push("PENDING_PROPOSAL_REQUIRED");
  }
  if (params.consumerPresence !== "PRESENT") codes.push("LIVE_CONSUMER_REQUIRED");
  if (params.submittedProposalMatchesLiveDefinition !== true) {
    codes.push("LIVE_PROPOSAL_MISMATCH");
  }
  if (params.submittedSnapshotStatus !== "VALID") {
    codes.push("ACTIVE_REGISTRY_SUPPORT_REQUIRED");
  }
  if (params.characterArchived) codes.push("CHARACTER_ARCHIVED");
  if (params.selfApprovalPolicyUnresolved) {
    codes.push("SELF_APPROVAL_POLICY_UNRESOLVED");
  }
  return Object.freeze(Array.from(new Set(codes)).map((code) => Object.freeze({
    code,
    message: CAMPAIGN_RESTRICTION_APPROVAL_BLOCKER_MESSAGES[code],
  })));
}

export function getCampaignRestrictionApprovalEligibility(
  item: CampaignRestrictionQueueItem,
  selectedTier: RestrictionTier | null,
): Readonly<{
  canApprove: boolean;
  blockers: readonly CampaignRestrictionApprovalBlocker[];
}> {
  const blockers = [...item.approvalBlockers];
  if (!selectedTier) {
    blockers.push(Object.freeze({
      code: "RESTRICTION_TIER_REQUIRED",
      message: CAMPAIGN_RESTRICTION_APPROVAL_BLOCKER_MESSAGES.RESTRICTION_TIER_REQUIRED,
    }));
  }
  return Object.freeze({
    canApprove: blockers.length === 0,
    blockers: Object.freeze(blockers),
  });
}

export function canRequestCampaignRestrictionChanges(
  item: Pick<CampaignRestrictionQueueItem, "governanceId" | "storedLifecycle" | "requestChangesAvailable">,
  notes: string,
): boolean {
  return Boolean(
    item.governanceId.trim() &&
    item.storedLifecycle === "PENDING_GD_APPROVAL" &&
    item.requestChangesAvailable &&
    notes.trim(),
  );
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareAscending(left: CampaignRestrictionQueueItem, right: CampaignRestrictionQueueItem): number {
  const leftTime = timestamp(left.submittedAt) ?? Number.POSITIVE_INFINITY;
  const rightTime = timestamp(right.submittedAt) ?? Number.POSITIVE_INFINITY;
  return leftTime - rightTime || left.governanceId.localeCompare(right.governanceId);
}

function compareDescending(left: CampaignRestrictionQueueItem, right: CampaignRestrictionQueueItem): number {
  const leftTime = timestamp(left.activityAt) ?? Number.NEGATIVE_INFINITY;
  const rightTime = timestamp(right.activityAt) ?? Number.NEGATIVE_INFINITY;
  return rightTime - leftTime || left.governanceId.localeCompare(right.governanceId);
}

export function groupCampaignRestrictionQueueItems(
  items: readonly CampaignRestrictionQueueItem[],
  recentApprovedLimit = 25,
): Readonly<{
  groups: CampaignRestrictionQueueGroups;
  counts: CampaignRestrictionQueueCounts;
}> {
  const pending = items
    .filter((item) => item.effectiveLifecycle === "PENDING_GD_APPROVAL")
    .sort(compareAscending);
  const changesRequested = items
    .filter((item) => item.effectiveLifecycle === "CHANGES_REQUESTED")
    .sort(compareDescending);
  const approvalStale = items
    .filter((item) => item.effectiveLifecycle === "APPROVAL_STALE")
    .sort(compareDescending);
  const approved = items
    .filter((item) => item.effectiveLifecycle === "APPROVED" && item.approvalCurrent)
    .sort(compareDescending);
  const boundedLimit = Number.isInteger(recentApprovedLimit) && recentApprovedLimit >= 0
    ? recentApprovedLimit
    : 25;
  const recentlyApproved = approved.slice(0, boundedLimit);

  return Object.freeze({
    groups: Object.freeze({
      pending: Object.freeze(pending),
      changesRequested: Object.freeze(changesRequested),
      approvalStale: Object.freeze(approvalStale),
      recentlyApproved: Object.freeze(recentlyApproved),
    }),
    counts: Object.freeze({
      pending: pending.length,
      changesRequested: changesRequested.length,
      approvalStale: approvalStale.length,
      recentlyApproved: recentlyApproved.length,
      currentApproved: approved.length,
    }),
  });
}

export function getCampaignRestrictionQueueItemsForFilter(
  groups: CampaignRestrictionQueueGroups,
  filter: CampaignRestrictionQueueFilter,
): readonly CampaignRestrictionQueueItem[] {
  if (filter === "PENDING") return groups.pending;
  if (filter === "CHANGES_REQUESTED") return groups.changesRequested;
  if (filter === "APPROVAL_STALE") return groups.approvalStale;
  return groups.recentlyApproved;
}
