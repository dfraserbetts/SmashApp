import type { RestrictionIssue } from "@/lib/restrictions";
import {
  RESTRICTION_TIERS,
  type RestrictionLifecycleState,
  type RestrictionTier,
} from "@/lib/restrictions/governance";
import {
  normalizePlayerRestrictionGovernanceRow,
  normalizePlayerRestrictionReviewEvent,
  type NormalizedPlayerRestrictionGovernanceRow,
  type PlayerRestrictionGovernanceLocatorInput,
  type PlayerRestrictionGovernanceRowInput,
  type PlayerRestrictionReviewEventInput,
  type PlayerRestrictionSnapshot,
} from "@/lib/restrictions/governancePersistence";
import type { PlayerRestrictionConsumerResolution } from "@/lib/restrictions/playerRestrictionConsumerResolver";

export const SELF_APPROVAL_POLICIES = ["UNRESOLVED", "ALLOW", "DENY"] as const;
export type SelfApprovalPolicy = (typeof SELF_APPROVAL_POLICIES)[number];

export type GovernanceLifecycleAction =
  | "SUBMIT"
  | "APPROVE"
  | "REQUEST_CHANGES";

export type GovernanceLifecycleWriteStep = Readonly<{
  operation: "CREATE" | "UPDATE";
  expectedLifecycle: RestrictionLifecycleState | null;
  expectedSubmissionRevision: number;
  row: PlayerRestrictionGovernanceRowInput;
  event: PlayerRestrictionReviewEventInput;
}>;

export type GovernanceLifecyclePlan = Readonly<{
  ok: boolean;
  action: GovernanceLifecycleAction;
  steps: readonly GovernanceLifecycleWriteStep[];
  finalRow: PlayerRestrictionGovernanceRowInput | null;
  issues: readonly RestrictionIssue[];
}>;

type CommonPlanInput = Readonly<{
  currentRow: PlayerRestrictionGovernanceRowInput | null;
  expectedSubmissionRevision: number;
  actorUserId: string;
  actionAt: Date | string;
}>;

export type SubmitRestrictionPlanInput = CommonPlanInput & Readonly<{
  governanceId: string;
  locator: PlayerRestrictionGovernanceLocatorInput;
  liveSnapshot: PlayerRestrictionSnapshot;
  eventIds: readonly string[];
}>;

export type ApproveRestrictionPlanInput = CommonPlanInput & Readonly<{
  liveSnapshot: PlayerRestrictionSnapshot;
  selectedTier: RestrictionTier | null;
  notes?: string | null;
  selfApprovalPolicy: SelfApprovalPolicy;
  eventId: string;
}>;

export type RequestRestrictionChangesPlanInput = CommonPlanInput & Readonly<{
  notes: string | null;
  eventId: string;
}>;

export type PlayerRestrictionGovernanceReadFacts = Readonly<{
  synthetic: boolean;
  currentRow: NormalizedPlayerRestrictionGovernanceRow | null;
  submittedProposalMatchesLiveDefinition: boolean | null;
  approvedProposalMatchesLiveDefinition: boolean | null;
  storedLifecycle: RestrictionLifecycleState | null;
  effectiveLifecycle: RestrictionLifecycleState;
  approvalCurrent: boolean;
  orphaned: boolean;
  issues: readonly RestrictionIssue[];
}>;

function issue(
  code: string,
  message: string,
  path: string,
): RestrictionIssue {
  return Object.freeze({ code, message, path, severity: "error" as const });
}

function withPrefix(
  issues: readonly RestrictionIssue[],
  prefix: string,
): RestrictionIssue[] {
  return issues.map((entry) => ({
    ...entry,
    path: entry.path ? `${prefix}.${entry.path}` : prefix,
  }));
}

function normalizedTimestamp(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function eventTimestamp(actionAt: string, offset: number): string {
  return new Date(Date.parse(actionAt) + offset).toISOString();
}

function normalizeNotes(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 4000)
    : null;
}

function currentRowResult(
  currentRow: PlayerRestrictionGovernanceRowInput | null,
): Readonly<{
  value: NormalizedPlayerRestrictionGovernanceRow | null;
  issues: readonly RestrictionIssue[];
}> {
  if (!currentRow) return { value: null, issues: [] };
  const normalized = normalizePlayerRestrictionGovernanceRow(currentRow);
  return {
    value: normalized.value,
    issues: withPrefix(normalized.issues, "currentRow"),
  };
}

export function derivePlayerRestrictionGovernanceReadFacts(params: {
  live: PlayerRestrictionConsumerResolution;
  currentRow: PlayerRestrictionGovernanceRowInput | null;
}): PlayerRestrictionGovernanceReadFacts | null {
  const currentResult = currentRowResult(params.currentRow);
  if (!params.currentRow && !params.live.normalizedSnapshot) return null;
  const current = currentResult.value;
  const submittedMatch = current?.submittedFingerprint
    ? current.submittedFingerprint === params.live.currentFingerprint
    : null;
  const approvedMatch = current?.approvedFingerprint
    ? current.approvedFingerprint === params.live.currentFingerprint
    : null;
  const effectiveLifecycle: RestrictionLifecycleState = current
    ? current.lifecycle === "APPROVED" && approvedMatch !== true
      ? "APPROVAL_STALE"
      : current.lifecycle
    : "DRAFT";
  return Object.freeze({
    synthetic: params.currentRow === null,
    currentRow: current,
    submittedProposalMatchesLiveDefinition: submittedMatch,
    approvedProposalMatchesLiveDefinition: approvedMatch,
    storedLifecycle: current?.lifecycle ?? null,
    effectiveLifecycle,
    approvalCurrent: current?.lifecycle === "APPROVED" && approvedMatch === true,
    orphaned: Boolean(current && params.live.consumerPresence !== "PRESENT"),
    issues: Object.freeze([
      ...currentResult.issues,
      ...params.live.issues,
    ].map((entry) => Object.freeze({ ...entry }))),
  });
}

function inputFromCurrent(
  current: NormalizedPlayerRestrictionGovernanceRow,
  patch: Partial<PlayerRestrictionGovernanceRowInput>,
): PlayerRestrictionGovernanceRowInput {
  return {
    id: current.id,
    campaignId: current.locator.campaignId,
    characterId: current.locator.characterId,
    consumerType: current.locator.consumerType,
    consumerId: current.locator.consumerId,
    lifecycle: current.lifecycle,
    submissionRevision: current.submissionRevision,
    submittedFingerprint: current.submittedFingerprint,
    submittedDefinitionJson: current.submittedDefinitionJson,
    submittedByUserId: current.submittedByUserId,
    submittedAt: current.submittedAt,
    approvedFingerprint: current.approvedFingerprint,
    selectedTier: current.selectedTier,
    reviewedByUserId: current.reviewedByUserId,
    reviewedAt: current.reviewedAt,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    ...patch,
  };
}

function eventFor(
  row: PlayerRestrictionGovernanceRowInput,
  input: Omit<PlayerRestrictionReviewEventInput, "governanceId" | "campaignId">,
): PlayerRestrictionReviewEventInput {
  return {
    governanceId: row.id,
    campaignId: row.campaignId,
    ...input,
  };
}

function plan(
  action: GovernanceLifecycleAction,
  steps: readonly GovernanceLifecycleWriteStep[],
  issues: readonly RestrictionIssue[],
): GovernanceLifecyclePlan {
  const validationIssues = [...issues];
  steps.forEach((step, index) => {
    const row = normalizePlayerRestrictionGovernanceRow(step.row);
    const event = normalizePlayerRestrictionReviewEvent(step.event);
    validationIssues.push(...withPrefix(row.issues, `steps[${index}].row`));
    validationIssues.push(...withPrefix(event.issues, `steps[${index}].event`));
  });
  const frozenIssues = Object.freeze(
    validationIssues.map((entry) => Object.freeze({ ...entry })),
  );
  const ok = frozenIssues.every((entry) => entry.severity !== "error");
  return Object.freeze({
    ok,
    action,
    steps: ok ? Object.freeze([...steps]) : Object.freeze([]),
    finalRow: ok && steps.length > 0 ? steps[steps.length - 1].row : null,
    issues: frozenIssues,
  });
}

function revisionIssues(expected: number, actual: number): RestrictionIssue[] {
  if (!Number.isInteger(expected) || expected < 0) {
    return [issue(
      "EXPECTED_SUBMISSION_REVISION_REQUIRED",
      "The expected submission revision must be a nonnegative integer.",
      "expectedSubmissionRevision",
    )];
  }
  return expected === actual
    ? []
    : [issue(
        "STALE_SUBMISSION_REVISION",
        "The governance record changed after this action was prepared.",
        "expectedSubmissionRevision",
      )];
}

export function planSubmitRestriction(
  input: SubmitRestrictionPlanInput,
): GovernanceLifecyclePlan {
  const currentResult = currentRowResult(input.currentRow);
  const issues = [...currentResult.issues];
  const current = currentResult.value;
  const actionAt = normalizedTimestamp(input.actionAt);
  if (!actionAt) {
    issues.push(issue("INVALID_ACTION_TIMESTAMP", "A valid server action timestamp is required.", "actionAt"));
  }
  issues.push(...revisionIssues(
    input.expectedSubmissionRevision,
    current?.submissionRevision ?? 0,
  ));
  if (!input.liveSnapshot) {
    issues.push(issue("LIVE_RESTRICTION_REQUIRED", "A normalized live Restriction is required.", "liveSnapshot"));
  }
  if (current?.lifecycle === "PENDING_GD_APPROVAL") {
    issues.push(issue(
      "PENDING_PROPOSAL_IMMUTABLE",
      "A Pending submitted proposal is immutable; submit a current proposal only after review changes its lifecycle.",
      "currentRow.lifecycle",
    ));
  }
  if (
    current?.lifecycle === "APPROVED" &&
    current.approvedFingerprint === input.liveSnapshot?.fingerprint
  ) {
    issues.push(issue(
      "CURRENT_APPROVAL_CANNOT_BE_RESUBMITTED",
      "The live Restriction already matches the current approved proposal.",
      "currentRow.lifecycle",
    ));
  }
  if (current && ![
    "DRAFT",
    "CHANGES_REQUESTED",
    "APPROVAL_STALE",
    "APPROVED",
  ].includes(current.lifecycle)) {
    issues.push(issue(
      "ILLEGAL_SUBMISSION_LIFECYCLE",
      `A proposal cannot be submitted from ${current.lifecycle}.`,
      "currentRow.lifecycle",
    ));
  }
  const needsStaleStep = current?.lifecycle === "APPROVED" &&
    current.approvedFingerprint !== input.liveSnapshot?.fingerprint;
  const requiredEvents = needsStaleStep ? 2 : 1;
  if (input.eventIds.length < requiredEvents || input.eventIds.slice(0, requiredEvents).some((id) => !id.trim())) {
    issues.push(issue(
      "REVIEW_EVENT_ID_REQUIRED",
      `${requiredEvents} stable review-event ID${requiredEvents === 1 ? " is" : "s are"} required.`,
      "eventIds",
    ));
  }
  if (issues.some((entry) => entry.severity === "error") || !actionAt) {
    return plan("SUBMIT", [], issues);
  }

  const steps: GovernanceLifecycleWriteStep[] = [];
  let submissionSourceLifecycle: RestrictionLifecycleState = current?.lifecycle ?? "DRAFT";
  if (needsStaleStep && current) {
    const staleRow = inputFromCurrent(current, {
      lifecycle: "APPROVAL_STALE",
      updatedAt: actionAt,
    });
    const staleEvent = eventFor(staleRow, {
      id: input.eventIds[0],
      action: "APPROVAL_STALE",
      fromLifecycle: "APPROVED",
      toLifecycle: "APPROVAL_STALE",
      submissionRevision: current.submissionRevision,
      semanticFingerprint: current.approvedFingerprint!,
      semanticDefinitionJson: current.submittedDefinitionJson!,
      selectedTier: current.selectedTier,
      actorUserId: input.actorUserId,
      notes: null,
      createdAt: eventTimestamp(actionAt, 0),
    });
    steps.push(Object.freeze({
      operation: "UPDATE",
      expectedLifecycle: "APPROVED",
      expectedSubmissionRevision: current.submissionRevision,
      row: staleRow,
      event: staleEvent,
    }));
    submissionSourceLifecycle = "APPROVAL_STALE";
  }

  const nextRevision = (current?.submissionRevision ?? 0) + 1;
  const pendingRow: PlayerRestrictionGovernanceRowInput = current
    ? inputFromCurrent(current, {
        lifecycle: "PENDING_GD_APPROVAL",
        submissionRevision: nextRevision,
        submittedFingerprint: input.liveSnapshot.fingerprint,
        submittedDefinitionJson: input.liveSnapshot.json,
        submittedByUserId: input.actorUserId,
        submittedAt: actionAt,
        approvedFingerprint: null,
        selectedTier: null,
        reviewedByUserId: null,
        reviewedAt: null,
        updatedAt: actionAt,
      })
    : {
        id: input.governanceId,
        campaignId: input.locator.campaignId,
        characterId: input.locator.characterId,
        consumerType: input.locator.consumerType,
        consumerId: input.locator.consumerId,
        lifecycle: "PENDING_GD_APPROVAL",
        submissionRevision: 1,
        submittedFingerprint: input.liveSnapshot.fingerprint,
        submittedDefinitionJson: input.liveSnapshot.json,
        submittedByUserId: input.actorUserId,
        submittedAt: actionAt,
        approvedFingerprint: null,
        selectedTier: null,
        reviewedByUserId: null,
        reviewedAt: null,
        createdAt: actionAt,
        updatedAt: actionAt,
      };
  const submittedEvent = eventFor(pendingRow, {
    id: input.eventIds[needsStaleStep ? 1 : 0],
    action: "SUBMITTED",
    fromLifecycle: submissionSourceLifecycle,
    toLifecycle: "PENDING_GD_APPROVAL",
    submissionRevision: nextRevision,
    semanticFingerprint: input.liveSnapshot.fingerprint,
    semanticDefinitionJson: input.liveSnapshot.json,
    selectedTier: null,
    actorUserId: input.actorUserId,
    notes: null,
    createdAt: eventTimestamp(actionAt, needsStaleStep ? 1 : 0),
  });
  steps.push(Object.freeze({
    operation: current ? "UPDATE" : "CREATE",
    expectedLifecycle: current ? submissionSourceLifecycle : null,
    expectedSubmissionRevision: current?.submissionRevision ?? 0,
    row: pendingRow,
    event: submittedEvent,
  }));

  return plan("SUBMIT", steps, issues);
}

export function planApproveRestriction(
  input: ApproveRestrictionPlanInput,
): GovernanceLifecyclePlan {
  const currentResult = currentRowResult(input.currentRow);
  const issues = [...currentResult.issues];
  const current = currentResult.value;
  const actionAt = normalizedTimestamp(input.actionAt);
  if (!actionAt) issues.push(issue("INVALID_ACTION_TIMESTAMP", "A valid server action timestamp is required.", "actionAt"));
  issues.push(...revisionIssues(
    input.expectedSubmissionRevision,
    current?.submissionRevision ?? 0,
  ));
  if (!current) {
    issues.push(issue("GOVERNANCE_RECORD_REQUIRED", "A persisted governance record is required.", "currentRow"));
  } else if (current.lifecycle !== "PENDING_GD_APPROVAL") {
    issues.push(issue(
      "APPROVAL_REQUIRES_PENDING_PROPOSAL",
      "Only a Pending proposal can be approved.",
      "currentRow.lifecycle",
    ));
  }
  if (!input.eventId.trim()) issues.push(issue("REVIEW_EVENT_ID_REQUIRED", "A stable review-event ID is required.", "eventId"));
  if (!input.selectedTier || !(RESTRICTION_TIERS as readonly string[]).includes(input.selectedTier)) {
    issues.push(issue("APPROVAL_TIER_REQUIRED", "Approval requires one valid Restriction tier.", "selectedTier"));
  }
  if (!current?.submittedDefinition || !current.submittedFingerprint) {
    issues.push(issue("SUBMITTED_SNAPSHOT_REQUIRED", "Approval requires an exact submitted snapshot.", "currentRow.submittedDefinitionJson"));
  }
  if (current?.submittedSnapshotStatus === "UNSUPPORTED") {
    issues.push(issue(
      "UNSUPPORTED_RESTRICTION_CANNOT_BE_APPROVED",
      "A safe unsupported Restriction may be reviewed but cannot be approved by the active registry.",
      "currentRow.submittedDefinitionJson",
    ));
  }
  if (current?.submittedFingerprint && input.liveSnapshot.fingerprint !== current.submittedFingerprint) {
    issues.push(issue(
      "LIVE_RESTRICTION_DOES_NOT_MATCH_SUBMISSION",
      "The live semantic Restriction no longer matches the immutable submitted proposal.",
      "liveSnapshot.fingerprint",
    ));
  }
  if (current?.submittedByUserId === input.actorUserId) {
    if (input.selfApprovalPolicy === "UNRESOLVED") {
      issues.push(issue(
        "SELF_APPROVAL_POLICY_UNRESOLVED",
        "The policy for approving a Restriction submitted by the same reviewer remains unresolved.",
        "selfApprovalPolicy",
      ));
    } else if (input.selfApprovalPolicy === "DENY") {
      issues.push(issue(
        "SELF_APPROVAL_DENIED",
        "Current server policy does not permit approval by the submitting reviewer.",
        "selfApprovalPolicy",
      ));
    }
  }
  if (issues.some((entry) => entry.severity === "error") || !current || !actionAt || !input.selectedTier) {
    return plan("APPROVE", [], issues);
  }

  const notes = normalizeNotes(input.notes);
  const approvedRow = inputFromCurrent(current, {
    lifecycle: "APPROVED",
    approvedFingerprint: current.submittedFingerprint,
    selectedTier: input.selectedTier,
    reviewedByUserId: input.actorUserId,
    reviewedAt: actionAt,
    updatedAt: actionAt,
  });
  const event = eventFor(approvedRow, {
    id: input.eventId,
    action: "APPROVED",
    fromLifecycle: "PENDING_GD_APPROVAL",
    toLifecycle: "APPROVED",
    submissionRevision: current.submissionRevision,
    semanticFingerprint: current.submittedFingerprint!,
    semanticDefinitionJson: current.submittedDefinitionJson!,
    selectedTier: input.selectedTier,
    actorUserId: input.actorUserId,
    notes,
    createdAt: actionAt,
  });
  return plan("APPROVE", [Object.freeze({
    operation: "UPDATE",
    expectedLifecycle: "PENDING_GD_APPROVAL",
    expectedSubmissionRevision: current.submissionRevision,
    row: approvedRow,
    event,
  })], issues);
}

export function planRequestRestrictionChanges(
  input: RequestRestrictionChangesPlanInput,
): GovernanceLifecyclePlan {
  const currentResult = currentRowResult(input.currentRow);
  const issues = [...currentResult.issues];
  const current = currentResult.value;
  const actionAt = normalizedTimestamp(input.actionAt);
  const notes = normalizeNotes(input.notes);
  if (!actionAt) issues.push(issue("INVALID_ACTION_TIMESTAMP", "A valid server action timestamp is required.", "actionAt"));
  issues.push(...revisionIssues(
    input.expectedSubmissionRevision,
    current?.submissionRevision ?? 0,
  ));
  if (!current) {
    issues.push(issue("GOVERNANCE_RECORD_REQUIRED", "A persisted governance record is required.", "currentRow"));
  } else if (current.lifecycle !== "PENDING_GD_APPROVAL") {
    issues.push(issue(
      "REQUEST_CHANGES_REQUIRES_PENDING_PROPOSAL",
      "Changes can be requested only for a Pending proposal.",
      "currentRow.lifecycle",
    ));
  }
  if (!notes) {
    issues.push(issue(
      "CHANGES_REQUESTED_NOTE_REQUIRED",
      "Request Changes requires a nonblank player-facing note.",
      "notes",
    ));
  }
  if (!input.eventId.trim()) issues.push(issue("REVIEW_EVENT_ID_REQUIRED", "A stable review-event ID is required.", "eventId"));
  if (!current?.submittedDefinition || !current.submittedFingerprint) {
    issues.push(issue("SUBMITTED_SNAPSHOT_REQUIRED", "Request Changes requires an exact submitted snapshot.", "currentRow.submittedDefinitionJson"));
  }
  if (issues.some((entry) => entry.severity === "error") || !current || !actionAt || !notes) {
    return plan("REQUEST_CHANGES", [], issues);
  }

  const changesRow = inputFromCurrent(current, {
    lifecycle: "CHANGES_REQUESTED",
    selectedTier: null,
    reviewedByUserId: input.actorUserId,
    reviewedAt: actionAt,
    updatedAt: actionAt,
  });
  const event = eventFor(changesRow, {
    id: input.eventId,
    action: "CHANGES_REQUESTED",
    fromLifecycle: "PENDING_GD_APPROVAL",
    toLifecycle: "CHANGES_REQUESTED",
    submissionRevision: current.submissionRevision,
    semanticFingerprint: current.submittedFingerprint!,
    semanticDefinitionJson: current.submittedDefinitionJson!,
    selectedTier: null,
    actorUserId: input.actorUserId,
    notes,
    createdAt: actionAt,
  });
  return plan("REQUEST_CHANGES", [Object.freeze({
    operation: "UPDATE",
    expectedLifecycle: "PENDING_GD_APPROVAL",
    expectedSubmissionRevision: current.submissionRevision,
    row: changesRow,
    event,
  })], issues);
}
