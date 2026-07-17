import type { Prisma } from "@prisma/client";
import {
  createRestrictionFingerprint,
  validateRestrictionDefinition,
  type AbilityRestrictionDefinitionV1,
  type RestrictionIssue,
} from "@/lib/restrictions";
import {
  PLAYER_RESTRICTION_CONSUMERS,
  RESTRICTION_LIFECYCLE_STATES,
  RESTRICTION_TIERS,
  type PlayerRestrictionConsumer,
  type RestrictionLifecycleState,
  type RestrictionTier,
} from "@/lib/restrictions/governance";
import { normalizePersistedRestriction } from "@/lib/restrictions/persistence";

export const PLAYER_RESTRICTION_REVIEW_EVENT_ACTIONS = [
  "SUBMITTED",
  "APPROVED",
  "CHANGES_REQUESTED",
  "APPROVAL_STALE",
] as const;

export type PlayerRestrictionReviewEventAction =
  (typeof PLAYER_RESTRICTION_REVIEW_EVENT_ACTIONS)[number];

export type PlayerRestrictionGovernanceLocatorInput = Readonly<{
  campaignId: string;
  characterId: string;
  consumerType: PlayerRestrictionConsumer;
  consumerId: string;
}>;

export type PlayerRestrictionGovernanceLocator = Readonly<{
  campaignId: string;
  characterId: string;
  consumerType: PlayerRestrictionConsumer;
  consumerId: string;
  identityKey: string;
}>;

export type PlayerRestrictionSnapshot = Readonly<{
  status: "VALID" | "UNSUPPORTED";
  definition: AbilityRestrictionDefinitionV1;
  fingerprint: string;
  json: Prisma.InputJsonValue;
}>;

export type PlayerRestrictionGovernanceRowInput = Readonly<{
  id: string;
  campaignId: string;
  characterId: string;
  consumerType: PlayerRestrictionConsumer;
  consumerId: string;
  lifecycle: RestrictionLifecycleState;
  submissionRevision: number;
  submittedFingerprint: string | null;
  submittedDefinitionJson: unknown;
  submittedByUserId: string | null;
  submittedAt: Date | string | null;
  approvedFingerprint: string | null;
  selectedTier: RestrictionTier | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}>;

export type NormalizedPlayerRestrictionGovernanceRow = Readonly<{
  id: string;
  locator: PlayerRestrictionGovernanceLocator;
  lifecycle: RestrictionLifecycleState;
  submissionRevision: number;
  submittedFingerprint: string | null;
  submittedDefinition: AbilityRestrictionDefinitionV1 | null;
  submittedDefinitionJson: Prisma.InputJsonValue | null;
  submittedSnapshotStatus: PlayerRestrictionSnapshot["status"] | null;
  submittedByUserId: string | null;
  submittedAt: string | null;
  approvedFingerprint: string | null;
  selectedTier: RestrictionTier | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type PlayerRestrictionReviewEventInput = Readonly<{
  id: string;
  governanceId: string;
  campaignId: string;
  action: PlayerRestrictionReviewEventAction;
  fromLifecycle: RestrictionLifecycleState;
  toLifecycle: RestrictionLifecycleState;
  submissionRevision: number;
  semanticFingerprint: string;
  semanticDefinitionJson: unknown;
  selectedTier: RestrictionTier | null;
  actorUserId: string;
  notes: string | null;
  createdAt: Date | string;
}>;

export type NormalizedPlayerRestrictionReviewEvent = Readonly<{
  id: string;
  governanceId: string;
  campaignId: string;
  action: PlayerRestrictionReviewEventAction;
  fromLifecycle: RestrictionLifecycleState;
  toLifecycle: RestrictionLifecycleState;
  submissionRevision: number;
  semanticFingerprint: string;
  semanticDefinition: AbilityRestrictionDefinitionV1;
  semanticDefinitionJson: Prisma.InputJsonValue;
  semanticSnapshotStatus: PlayerRestrictionSnapshot["status"];
  selectedTier: RestrictionTier | null;
  actorUserId: string;
  notes: string | null;
  createdAt: string;
}>;

export type GovernancePersistenceResult<T> = Readonly<{
  ok: boolean;
  value: T | null;
  issues: readonly RestrictionIssue[];
}>;

function issue(
  code: string,
  message: string,
  path: string,
  severity: RestrictionIssue["severity"] = "error",
): RestrictionIssue {
  return { code, severity, message, path };
}

function issueIdentity(entry: RestrictionIssue): string {
  return `${entry.code}:${entry.path ?? ""}:${entry.severity}`;
}

function uniqueIssues(issues: readonly RestrictionIssue[]): RestrictionIssue[] {
  const seen = new Set<string>();
  return issues.filter((entry) => {
    const identity = issueIdentity(entry);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function withPathPrefix(
  issues: readonly RestrictionIssue[],
  prefix: string,
): RestrictionIssue[] {
  return issues.map((entry) => ({
    ...entry,
    path: entry.path ? `${prefix}.${entry.path}` : prefix,
  }));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function immutableClone<T>(value: T): T {
  return deepFreeze(JSON.parse(JSON.stringify(value)) as T);
}

function result<T>(value: T | null, issues: readonly RestrictionIssue[]): GovernancePersistenceResult<T> {
  const normalizedIssues = deepFreeze(uniqueIssues(issues).map((entry) => ({ ...entry })));
  return Object.freeze({
    ok: value !== null && !normalizedIssues.some((entry) => entry.severity === "error"),
    value: normalizedIssues.some((entry) => entry.severity === "error") ? null : value,
    issues: normalizedIssues,
  });
}

function identifier(value: unknown, path: string): { value: string | null; issues: RestrictionIssue[] } {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return {
      value: null,
      issues: [issue("INVALID_GOVERNANCE_IDENTIFIER", "A nonblank stable identifier is required.", path)],
    };
  }
  if (normalized.length > 200) {
    return {
      value: null,
      issues: [issue("GOVERNANCE_IDENTIFIER_TOO_LONG", "Stable identifiers cannot exceed 200 characters.", path)],
    };
  }
  return { value: normalized, issues: [] };
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestamp(
  value: unknown,
  path: string,
  required: boolean,
): { value: string | null; issues: RestrictionIssue[] } {
  if (value == null) {
    return required
      ? {
          value: null,
          issues: [issue("MISSING_GOVERNANCE_TIMESTAMP", "A timestamp is required.", path)],
        }
      : { value: null, issues: [] };
  }
  const date = value instanceof Date
    ? value
    : typeof value === "string" && value.trim()
      ? new Date(value)
      : new Date(Number.NaN);
  if (Number.isNaN(date.getTime())) {
    return {
      value: null,
      issues: [issue("MALFORMED_GOVERNANCE_TIMESTAMP", "The timestamp is malformed.", path)],
    };
  }
  return { value: date.toISOString(), issues: [] };
}

function campaignReferenceIssues(
  definition: AbilityRestrictionDefinitionV1,
  campaignId: string,
): RestrictionIssue[] {
  const issues: RestrictionIssue[] = [];
  for (const [key, value] of Object.entries(definition.parameters)) {
    if (value.kind === "CAMPAIGN_REFERENCE" && value.campaignId !== campaignId) {
      issues.push(issue(
        "CROSS_CAMPAIGN_REFERENCE",
        "Campaign references must belong to the governance record's campaign.",
        `parameters.${key}`,
      ));
    }
  }
  return issues;
}

function isLifecycle(value: unknown): value is RestrictionLifecycleState {
  return typeof value === "string" &&
    (RESTRICTION_LIFECYCLE_STATES as readonly string[]).includes(value);
}

function isTier(value: unknown): value is RestrictionTier {
  return typeof value === "string" &&
    (RESTRICTION_TIERS as readonly string[]).includes(value);
}

function isConsumer(value: unknown): value is PlayerRestrictionConsumer {
  return typeof value === "string" &&
    (PLAYER_RESTRICTION_CONSUMERS as readonly string[]).includes(value);
}

function isReviewAction(value: unknown): value is PlayerRestrictionReviewEventAction {
  return typeof value === "string" &&
    (PLAYER_RESTRICTION_REVIEW_EVENT_ACTIONS as readonly string[]).includes(value);
}

export function serializePlayerRestrictionSnapshot(
  definition: AbilityRestrictionDefinitionV1,
): Prisma.InputJsonValue {
  return immutableClone(definition) as Prisma.InputJsonValue;
}

export function buildPlayerRestrictionGovernanceLocator(
  input: PlayerRestrictionGovernanceLocatorInput,
): GovernancePersistenceResult<PlayerRestrictionGovernanceLocator> {
  const campaignId = identifier(input.campaignId, "campaignId");
  const characterId = identifier(input.characterId, "characterId");
  const consumerId = identifier(input.consumerId, "consumerId");
  const issues = [...campaignId.issues, ...characterId.issues, ...consumerId.issues];
  if (!isConsumer(input.consumerType)) {
    issues.push(issue(
      "INVALID_PLAYER_RESTRICTION_CONSUMER",
      "Governance persistence supports only Player Powers, Signature Moves, and Roleplay Abilities.",
      "consumerType",
    ));
  }
  if (!campaignId.value || !characterId.value || !consumerId.value || !isConsumer(input.consumerType)) {
    return result(null, issues);
  }
  return result(deepFreeze({
    campaignId: campaignId.value,
    characterId: characterId.value,
    consumerType: input.consumerType,
    consumerId: consumerId.value,
    identityKey: JSON.stringify([
      characterId.value,
      input.consumerType,
      consumerId.value,
    ]),
  }), issues);
}

export function normalizePlayerRestrictionSnapshot(
  input: unknown,
  campaignIdInput: string,
): GovernancePersistenceResult<PlayerRestrictionSnapshot> {
  const campaignId = identifier(campaignIdInput, "campaignId");
  const issues = [...campaignId.issues];
  const persisted = normalizePersistedRestriction(input);
  if (persisted.status === "NONE") {
    issues.push(issue("MISSING_SEMANTIC_SNAPSHOT", "A semantic Restriction snapshot is required.", "definition"));
    return result(null, issues);
  }
  if (!persisted.definition || persisted.status === "INVALID") {
    return result(null, [...issues, ...persisted.issues]);
  }

  const unsupported = persisted.status === "UNSUPPORTED";
  issues.push(...persisted.issues.map((entry) =>
    unsupported && entry.code === "UNKNOWN_TEMPLATE"
      ? { ...entry, severity: "warning" as const }
      : entry,
  ));
  if (campaignId.value) {
    if (!unsupported) {
      issues.push(...validateRestrictionDefinition(persisted.definition, {
        campaignId: campaignId.value,
      }));
    }
    issues.push(...campaignReferenceIssues(persisted.definition, campaignId.value));
  }
  if (issues.some((entry) => entry.severity === "error")) return result(null, issues);

  const definition = immutableClone(persisted.definition);
  return result(deepFreeze({
    status: unsupported ? "UNSUPPORTED" : "VALID",
    definition,
    fingerprint: createRestrictionFingerprint(definition),
    json: serializePlayerRestrictionSnapshot(definition),
  }), issues);
}

function addRequiredTextIssue(
  value: string | null,
  code: string,
  message: string,
  path: string,
  issues: RestrictionIssue[],
): void {
  if (!value) issues.push(issue(code, message, path));
}

function addRequiredSnapshotIssues(
  snapshot: PlayerRestrictionSnapshot | null,
  submittedFingerprint: string | null,
  issues: RestrictionIssue[],
): void {
  if (!snapshot) {
    issues.push(issue(
      "SUBMITTED_DEFINITION_REQUIRED",
      "The exact submitted semantic definition is required.",
      "submittedDefinitionJson",
    ));
  }
  addRequiredTextIssue(
    submittedFingerprint,
    "SUBMITTED_FINGERPRINT_REQUIRED",
    "The submitted semantic fingerprint is required.",
    "submittedFingerprint",
    issues,
  );
}

export function normalizePlayerRestrictionGovernanceRow(
  input: PlayerRestrictionGovernanceRowInput,
): GovernancePersistenceResult<NormalizedPlayerRestrictionGovernanceRow> {
  const id = identifier(input.id, "id");
  const locatorResult = buildPlayerRestrictionGovernanceLocator(input);
  const issues: RestrictionIssue[] = [...id.issues, ...locatorResult.issues];
  const lifecycle = isLifecycle(input.lifecycle) ? input.lifecycle : null;
  if (!lifecycle) {
    issues.push(issue("INVALID_RESTRICTION_LIFECYCLE", "The lifecycle value is unsupported.", "lifecycle"));
  }
  const selectedTier = input.selectedTier == null
    ? null
    : isTier(input.selectedTier)
      ? input.selectedTier
      : null;
  if (input.selectedTier != null && !selectedTier) {
    issues.push(issue("INVALID_RESTRICTION_TIER", "The selected tier is unsupported.", "selectedTier"));
  }
  if (!Number.isInteger(input.submissionRevision) || input.submissionRevision < 0) {
    issues.push(issue(
      "INVALID_SUBMISSION_REVISION",
      "The submission revision must be a nonnegative integer.",
      "submissionRevision",
    ));
  }

  const submittedFingerprint = optionalText(input.submittedFingerprint);
  const approvedFingerprint = optionalText(input.approvedFingerprint);
  const submittedByUserId = input.submittedByUserId == null
    ? null
    : identifier(input.submittedByUserId, "submittedByUserId");
  const reviewedByUserId = input.reviewedByUserId == null
    ? null
    : identifier(input.reviewedByUserId, "reviewedByUserId");
  if (submittedByUserId) issues.push(...submittedByUserId.issues);
  if (reviewedByUserId) issues.push(...reviewedByUserId.issues);

  const submittedAt = timestamp(input.submittedAt, "submittedAt", false);
  const reviewedAt = timestamp(input.reviewedAt, "reviewedAt", false);
  const createdAt = timestamp(input.createdAt, "createdAt", true);
  const updatedAt = timestamp(input.updatedAt, "updatedAt", true);
  issues.push(
    ...submittedAt.issues,
    ...reviewedAt.issues,
    ...createdAt.issues,
    ...updatedAt.issues,
  );

  let snapshot: PlayerRestrictionSnapshot | null = null;
  if (input.submittedDefinitionJson != null) {
    const normalized = normalizePlayerRestrictionSnapshot(
      input.submittedDefinitionJson,
      locatorResult.value?.campaignId ?? input.campaignId,
    );
    issues.push(...withPathPrefix(normalized.issues, "submittedDefinitionJson"));
    snapshot = normalized.value;
  }
  if (submittedFingerprint && !snapshot) {
    issues.push(issue(
      "SUBMITTED_SNAPSHOT_PAIR_REQUIRED",
      "A submitted fingerprint must have a matching submitted definition.",
      "submittedDefinitionJson",
    ));
  }
  if (snapshot && !submittedFingerprint) {
    issues.push(issue(
      "SUBMITTED_SNAPSHOT_PAIR_REQUIRED",
      "A submitted definition must have a matching submitted fingerprint.",
      "submittedFingerprint",
    ));
  }
  if (snapshot && submittedFingerprint && snapshot.fingerprint !== submittedFingerprint) {
    issues.push(issue(
      "SUBMITTED_FINGERPRINT_MISMATCH",
      "The submitted fingerprint does not match the normalized semantic snapshot.",
      "submittedFingerprint",
    ));
  }

  if (lifecycle && lifecycle !== "DRAFT" && input.submissionRevision <= 0) {
    issues.push(issue(
      "POSITIVE_SUBMISSION_REVISION_REQUIRED",
      "A submitted governance state requires a positive submission revision.",
      "submissionRevision",
    ));
  }
  if (lifecycle === "DRAFT" && selectedTier) {
    issues.push(issue(
      "DRAFT_TIER_NOT_ALLOWED",
      "Draft governance cannot manufacture an approved tier.",
      "selectedTier",
    ));
  }
  if (lifecycle === "PENDING_GD_APPROVAL") {
    addRequiredSnapshotIssues(snapshot, submittedFingerprint, issues);
    addRequiredTextIssue(
      submittedByUserId?.value ?? null,
      "SUBMITTING_USER_REQUIRED",
      "The submitting user is required while approval is pending.",
      "submittedByUserId",
      issues,
    );
    if (!submittedAt.value) {
      issues.push(issue("SUBMITTED_AT_REQUIRED", "The submission timestamp is required while approval is pending.", "submittedAt"));
    }
    if (selectedTier) {
      issues.push(issue("PENDING_TIER_NOT_ALLOWED", "Pending governance cannot have a selected tier.", "selectedTier"));
    }
    if (approvedFingerprint) {
      issues.push(issue(
        "PENDING_APPROVED_FINGERPRINT_NOT_ALLOWED",
        "Pending governance cannot manufacture an approved fingerprint.",
        "approvedFingerprint",
      ));
    }
  }
  if (lifecycle === "APPROVED") {
    addRequiredSnapshotIssues(snapshot, submittedFingerprint, issues);
    addRequiredTextIssue(
      approvedFingerprint,
      "APPROVED_FINGERPRINT_REQUIRED",
      "Approved governance requires an approved fingerprint.",
      "approvedFingerprint",
      issues,
    );
    if (approvedFingerprint && submittedFingerprint && approvedFingerprint !== submittedFingerprint) {
      issues.push(issue(
        "APPROVED_FINGERPRINT_MISMATCH",
        "The approved fingerprint must equal the submitted fingerprint.",
        "approvedFingerprint",
      ));
    }
    if (!selectedTier) {
      issues.push(issue("APPROVED_TIER_REQUIRED", "Approved governance requires a selected tier.", "selectedTier"));
    }
    addRequiredTextIssue(
      reviewedByUserId?.value ?? null,
      "REVIEWING_USER_REQUIRED",
      "Approved governance requires a reviewing user.",
      "reviewedByUserId",
      issues,
    );
    if (!reviewedAt.value) {
      issues.push(issue("REVIEWED_AT_REQUIRED", "Approved governance requires a review timestamp.", "reviewedAt"));
    }
    if (snapshot?.status === "UNSUPPORTED") {
      issues.push(issue(
        "UNSUPPORTED_SNAPSHOT_CANNOT_BE_APPROVED",
        "The persistence adapter preserves safe unsupported snapshots but cannot approve them.",
        "submittedDefinitionJson",
      ));
    }
  }
  if (lifecycle === "CHANGES_REQUESTED") {
    addRequiredSnapshotIssues(snapshot, submittedFingerprint, issues);
    addRequiredTextIssue(
      reviewedByUserId?.value ?? null,
      "REVIEWING_USER_REQUIRED",
      "Changes Requested governance requires a reviewing user.",
      "reviewedByUserId",
      issues,
    );
    if (!reviewedAt.value) {
      issues.push(issue("REVIEWED_AT_REQUIRED", "Changes Requested governance requires a review timestamp.", "reviewedAt"));
    }
  }
  if (lifecycle === "APPROVAL_STALE") {
    addRequiredTextIssue(
      approvedFingerprint,
      "STALE_APPROVED_FINGERPRINT_REQUIRED",
      "Approval Stale governance must preserve the prior approved fingerprint.",
      "approvedFingerprint",
      issues,
    );
  }

  if (
    !id.value ||
    !locatorResult.value ||
    !lifecycle ||
    !createdAt.value ||
    !updatedAt.value ||
    issues.some((entry) => entry.severity === "error")
  ) {
    return result(null, issues);
  }
  return result(deepFreeze({
    id: id.value,
    locator: locatorResult.value,
    lifecycle,
    submissionRevision: input.submissionRevision,
    submittedFingerprint,
    submittedDefinition: snapshot?.definition ?? null,
    submittedDefinitionJson: snapshot?.json ?? null,
    submittedSnapshotStatus: snapshot?.status ?? null,
    submittedByUserId: submittedByUserId?.value ?? null,
    submittedAt: submittedAt.value,
    approvedFingerprint,
    selectedTier,
    reviewedByUserId: reviewedByUserId?.value ?? null,
    reviewedAt: reviewedAt.value,
    createdAt: createdAt.value,
    updatedAt: updatedAt.value,
  }), issues);
}

export function diagnosePlayerRestrictionGovernanceRow(
  input: PlayerRestrictionGovernanceRowInput,
): readonly RestrictionIssue[] {
  return normalizePlayerRestrictionGovernanceRow(input).issues;
}

export function normalizePlayerRestrictionReviewEvent(
  input: PlayerRestrictionReviewEventInput,
): GovernancePersistenceResult<NormalizedPlayerRestrictionReviewEvent> {
  const id = identifier(input.id, "id");
  const governanceId = identifier(input.governanceId, "governanceId");
  const campaignId = identifier(input.campaignId, "campaignId");
  const actorUserId = identifier(input.actorUserId, "actorUserId");
  const issues: RestrictionIssue[] = [
    ...id.issues,
    ...governanceId.issues,
    ...campaignId.issues,
    ...actorUserId.issues,
  ];
  const action = isReviewAction(input.action) ? input.action : null;
  const fromLifecycle = isLifecycle(input.fromLifecycle) ? input.fromLifecycle : null;
  const toLifecycle = isLifecycle(input.toLifecycle) ? input.toLifecycle : null;
  if (!action) issues.push(issue("INVALID_REVIEW_EVENT_ACTION", "The review-event action is unsupported.", "action"));
  if (!fromLifecycle) issues.push(issue("INVALID_RESTRICTION_LIFECYCLE", "The source lifecycle is unsupported.", "fromLifecycle"));
  if (!toLifecycle) issues.push(issue("INVALID_RESTRICTION_LIFECYCLE", "The destination lifecycle is unsupported.", "toLifecycle"));
  if (!Number.isInteger(input.submissionRevision) || input.submissionRevision <= 0) {
    issues.push(issue(
      "POSITIVE_SUBMISSION_REVISION_REQUIRED",
      "Review events require a positive submission revision.",
      "submissionRevision",
    ));
  }
  const selectedTier = input.selectedTier == null
    ? null
    : isTier(input.selectedTier)
      ? input.selectedTier
      : null;
  if (input.selectedTier != null && !selectedTier) {
    issues.push(issue("INVALID_RESTRICTION_TIER", "The selected tier is unsupported.", "selectedTier"));
  }
  const notes = optionalText(input.notes);
  const semanticFingerprint = optionalText(input.semanticFingerprint);
  const createdAt = timestamp(input.createdAt, "createdAt", true);
  issues.push(...createdAt.issues);
  const snapshotResult = normalizePlayerRestrictionSnapshot(
    input.semanticDefinitionJson,
    campaignId.value ?? input.campaignId,
  );
  issues.push(...withPathPrefix(snapshotResult.issues, "semanticDefinitionJson"));
  const snapshot = snapshotResult.value;
  addRequiredTextIssue(
    semanticFingerprint,
    "SEMANTIC_FINGERPRINT_REQUIRED",
    "The event semantic fingerprint is required.",
    "semanticFingerprint",
    issues,
  );
  if (snapshot && semanticFingerprint && snapshot.fingerprint !== semanticFingerprint) {
    issues.push(issue(
      "SEMANTIC_FINGERPRINT_MISMATCH",
      "The event fingerprint does not match its immutable normalized snapshot.",
      "semanticFingerprint",
    ));
  }

  if (action === "SUBMITTED") {
    if (toLifecycle !== "PENDING_GD_APPROVAL") {
      issues.push(issue(
        "ILLEGAL_REVIEW_EVENT_TRANSITION",
        "Submitted events must end at Pending GD Approval.",
        "toLifecycle",
      ));
    }
    if (selectedTier) {
      issues.push(issue("SUBMITTED_TIER_NOT_ALLOWED", "Submitted events cannot select a tier.", "selectedTier"));
    }
  }
  if (action === "APPROVED") {
    if (fromLifecycle !== "PENDING_GD_APPROVAL" && fromLifecycle !== "APPROVAL_STALE") {
      issues.push(issue(
        "ILLEGAL_REVIEW_EVENT_TRANSITION",
        "Approved events must begin at Pending GD Approval or Approval Stale.",
        "fromLifecycle",
      ));
    }
    if (toLifecycle !== "APPROVED") {
      issues.push(issue("ILLEGAL_REVIEW_EVENT_TRANSITION", "Approved events must end at Approved.", "toLifecycle"));
    }
    if (!selectedTier) {
      issues.push(issue("APPROVED_TIER_REQUIRED", "Approved events require a selected tier.", "selectedTier"));
    }
    if (snapshot?.status === "UNSUPPORTED") {
      issues.push(issue(
        "UNSUPPORTED_SNAPSHOT_CANNOT_BE_APPROVED",
        "The persistence adapter preserves safe unsupported snapshots but cannot approve them.",
        "semanticDefinitionJson",
      ));
    }
  }
  if (action === "CHANGES_REQUESTED") {
    if (fromLifecycle !== "PENDING_GD_APPROVAL" || toLifecycle !== "CHANGES_REQUESTED") {
      issues.push(issue(
        "ILLEGAL_REVIEW_EVENT_TRANSITION",
        "Changes Requested events must move from Pending GD Approval to Changes Requested.",
        fromLifecycle !== "PENDING_GD_APPROVAL" ? "fromLifecycle" : "toLifecycle",
      ));
    }
    if (!notes) {
      issues.push(issue(
        "CHANGES_REQUESTED_NOTE_REQUIRED",
        "Changes Requested events require a nonblank player-facing note.",
        "notes",
      ));
    }
  }
  if (action === "APPROVAL_STALE") {
    if (fromLifecycle !== "APPROVED" || toLifecycle !== "APPROVAL_STALE") {
      issues.push(issue(
        "ILLEGAL_REVIEW_EVENT_TRANSITION",
        "Approval Stale events must move from Approved to Approval Stale.",
        fromLifecycle !== "APPROVED" ? "fromLifecycle" : "toLifecycle",
      ));
    }
  }

  if (
    !id.value ||
    !governanceId.value ||
    !campaignId.value ||
    !actorUserId.value ||
    !action ||
    !fromLifecycle ||
    !toLifecycle ||
    !semanticFingerprint ||
    !snapshot ||
    !createdAt.value ||
    issues.some((entry) => entry.severity === "error")
  ) {
    return result(null, issues);
  }
  return result(deepFreeze({
    id: id.value,
    governanceId: governanceId.value,
    campaignId: campaignId.value,
    action,
    fromLifecycle,
    toLifecycle,
    submissionRevision: input.submissionRevision,
    semanticFingerprint,
    semanticDefinition: snapshot.definition,
    semanticDefinitionJson: snapshot.json,
    semanticSnapshotStatus: snapshot.status,
    selectedTier,
    actorUserId: actorUserId.value,
    notes,
    createdAt: createdAt.value,
  }), issues);
}

export function diagnosePlayerRestrictionReviewEvent(
  input: PlayerRestrictionReviewEventInput,
): readonly RestrictionIssue[] {
  return normalizePlayerRestrictionReviewEvent(input).issues;
}
