import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildPlayerRestrictionGovernanceLocator,
  diagnosePlayerRestrictionGovernanceRow,
  diagnosePlayerRestrictionReviewEvent,
  normalizePlayerRestrictionGovernanceRow,
  normalizePlayerRestrictionReviewEvent,
  normalizePlayerRestrictionSnapshot,
  serializePlayerRestrictionSnapshot,
  type PlayerRestrictionGovernanceRowInput,
  type PlayerRestrictionReviewEventInput,
} from "../lib/restrictions/governancePersistence";
import {
  createRestrictionFingerprint,
  type AbilityRestrictionDefinitionV1,
  type RestrictionCampaignReference,
  type RestrictionParameterValue,
} from "../lib/restrictions";
import {
  RESTRICTION_TIERS,
} from "../lib/restrictions/governance";

let checks = 0;
function check(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  checks += 1;
}
function deepEqual(actual: unknown, expected: unknown, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function hasCode(issues: readonly { code: string }[], code: string): boolean {
  return issues.some((entry) => entry.code === code);
}
function requireValue<T>(value: T | null, message: string): T {
  assert.ok(value, message);
  return value;
}

const schemaPath = "prisma/schema.prisma";
const migrationPath =
  "prisma/migrations/20260717120000_add_player_restriction_governance/migration.sql";
const adapterPath = "lib/restrictions/governancePersistence.ts";
const schema = readFileSync(schemaPath, "utf8");
const migration = readFileSync(migrationPath, "utf8");
const adapterSource = readFileSync(adapterPath, "utf8");

function block(source: string, kind: "enum" | "model", name: string): string {
  const match = source.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${kind} ${name} must exist.`);
  return match[1];
}

function enumValues(name: string): string[] {
  return block(schema, "enum", name)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

// Schema and migration boundary.
deepEqual(
  enumValues("PlayerRestrictionConsumerType"),
  ["PLAYER_POWER", "SIGNATURE_MOVE", "ROLEPLAY_ABILITY"],
  "The Prisma consumer enum must contain exactly the three player-authored consumers.",
);
deepEqual(
  enumValues("PlayerRestrictionLifecycle"),
  ["DRAFT", "PENDING_GD_APPROVAL", "APPROVED", "CHANGES_REQUESTED", "APPROVAL_STALE"],
  "The Prisma lifecycle enum must match the pure domain keys exactly.",
);
deepEqual(
  enumValues("PlayerRestrictionTier"),
  ["MATERIAL_LIMITATION", "SUBSTANTIAL_LIMITATION", "NARROW_AVAILABILITY", "OATH_LIMITATION"],
  "The Prisma tier enum must match the pure domain keys exactly.",
);
deepEqual(
  enumValues("PlayerRestrictionReviewAction"),
  ["SUBMITTED", "APPROVED", "CHANGES_REQUESTED", "APPROVAL_STALE"],
  "The review-event action enum must remain persistence-specific and exact.",
);

const governanceModel = block(schema, "model", "PlayerRestrictionGovernance");
const reviewEventModel = block(schema, "model", "PlayerRestrictionReviewEvent");
for (const field of [
  "campaignId", "characterId", "consumerType", "consumerId", "lifecycle",
  "submissionRevision", "submittedFingerprint", "submittedDefinitionJson",
  "submittedByUserId", "submittedAt", "approvedFingerprint", "selectedTier",
  "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt", "events",
]) check(new RegExp(`\\b${field}\\b`).test(governanceModel), `Governance model needs ${field}.`);
for (const field of [
  "governanceId", "action", "fromLifecycle", "toLifecycle", "submissionRevision",
  "semanticFingerprint", "semanticDefinitionJson", "selectedTier", "actorUserId",
  "notes", "createdAt", "governance",
]) check(new RegExp(`\\b${field}\\b`).test(reviewEventModel), `Review-event model needs ${field}.`);
check(!/\bupdatedAt\b/u.test(reviewEventModel), "Immutable review events must not have updatedAt.");
check(/@@unique\(\[characterId, consumerType, consumerId\]\)/u.test(governanceModel), "Current governance identity must use character, consumer type, and stable consumer ID.");
check(/@@index\(\[campaignId, lifecycle, submittedAt\]\)/u.test(governanceModel), "Campaign approval queue index is required.");
check(/@@index\(\[characterId\]\)/u.test(governanceModel), "Character governance lookup index is required.");
check(/@@index\(\[submittedByUserId\]\)/u.test(governanceModel), "Submitting-user lookup index is required.");
check(/@@index\(\[reviewedByUserId\]\)/u.test(governanceModel), "Reviewing-user lookup index is required.");
check(/@@index\(\[governanceId, createdAt\]\)/u.test(reviewEventModel), "Governance history index is required.");
check(/@@index\(\[actorUserId, createdAt\]\)/u.test(reviewEventModel), "Actor history index is required.");
check(/@@index\(\[action, createdAt\]\)/u.test(reviewEventModel), "Action history index is required.");
check(/playerRestrictionGovernance\s+PlayerRestrictionGovernance\[\]/u.test(block(schema, "model", "Campaign")), "Campaign must expose its governance records.");
check(/restrictionGovernance\s+PlayerRestrictionGovernance\[\]/u.test(block(schema, "model", "CampaignCharacter")), "Campaign Character must expose its governance records.");
check((migration.match(/JSONB/gu) ?? []).length === 2, "Migration must create exactly two semantic JSONB snapshot columns.");
check((migration.match(/ON DELETE CASCADE ON UPDATE CASCADE/gu) ?? []).length === 3, "All three governance foreign keys must cascade.");
check(/REFERENCES "Campaign"\("id"\)/u.test(migration), "Governance must reference Campaign.");
check(/REFERENCES "CampaignCharacter"\("id"\)/u.test(migration), "Governance must reference CampaignCharacter.");
check(/REFERENCES "PlayerRestrictionGovernance"\("id"\)/u.test(migration), "Review events must reference current governance.");
check(!/^\s*(?:INSERT|UPDATE|DELETE)\b/imu.test(migration), "Migration must contain no backfill or data mutation.");
check(!/builderData|restrictionJson/iu.test(migration), "Migration must not rewrite live Player or Monster semantic storage.");
for (const forbidden of [
  "tierRate", "grossBpv", "netBpv", "pointCredit", "scalar", "tuningSet",
  "exceptionalCap", "activationCost", "backlash", "cooldown", "descriptorCache",
]) {
  check(!new RegExp(forbidden, "iu").test(`${governanceModel}\n${reviewEventModel}\n${migration}`), `Persistence must exclude ${forbidden}.`);
}
check(!/MONSTER_POWER|MonsterRestriction/iu.test(`${governanceModel}\n${reviewEventModel}\n${migration}`), "Player governance tables must contain no Monster provenance.");
check(!/UserProfile\s+@relation|UserProfile\?/u.test(`${governanceModel}\n${reviewEventModel}`), "Actor and reviewer IDs must not add UserProfile relations.");
check(adapterSource.includes('import type { Prisma } from "@prisma/client";'), "The adapter may use Prisma only as a type import.");
check(!/server-only|from ["']@\/lib\/prisma|React|window\.|document\.|economics|tuning/iu.test(adapterSource), "The adapter must stay pure, Prisma-type-only, and economics-free.");
check(adapterSource.includes("normalizePersistedRestriction"), "Adapter must reuse persisted Restriction normalization.");
check(adapterSource.includes("validateRestrictionDefinition"), "Adapter must reuse shared semantic validation.");
check(adapterSource.includes("createRestrictionFingerprint"), "Adapter must reuse deterministic fingerprints.");

const enumParameter = (valueKey: string): RestrictionParameterValue => ({
  kind: "SYSTEM_ENUM",
  valueKey,
});
const campaignReference = (
  valueKind: RestrictionCampaignReference["valueKind"],
  valueId: string,
  campaignId = "campaign-1",
): RestrictionCampaignReference => ({ kind: "CAMPAIGN_REFERENCE", campaignId, valueKind, valueId });
const structured = (
  templateKey: string,
  parameters: Record<string, RestrictionParameterValue>,
  authoringMode: "STANDARD_STRUCTURED" | "CAMPAIGN_CUSTOM_STRUCTURED" = "STANDARD_STRUCTURED",
): AbilityRestrictionDefinitionV1 => ({
  schemaVersion: 1,
  authoringMode,
  templateKey,
  templateVersion: 1,
  parameters,
  customNarrativeText: null,
});

const standard = structured("ACTOR_PHYSICAL_HEALTH_PERCENTAGE", {
  operator: enumParameter("AT_OR_BELOW"),
  percentage: { kind: "PERCENTAGE", value: 50 },
});
const custom: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "CUSTOM_NARRATIVE",
  templateKey: null,
  templateVersion: null,
  parameters: {},
  customNarrativeText: "This Ability may only be used after the actor accepts the consequences.",
};
const campaignCustom = structured("ACTOR_ZONE_MEMBERSHIP", {
  operator: enumParameter("INSIDE"),
  zone: campaignReference("ZONE", "zone-1"),
}, "CAMPAIGN_CUSTOM_STRUCTURED");
const crossCampaign = {
  ...campaignCustom,
  parameters: {
    ...campaignCustom.parameters,
    zone: campaignReference("ZONE", "zone-1", "campaign-2"),
  },
};
const unsupported = { ...standard, templateKey: "FUTURE_SAFE_TEMPLATE" };

// Stable locator identity.
for (const consumerType of ["PLAYER_POWER", "SIGNATURE_MOVE", "ROLEPLAY_ABILITY"] as const) {
  const locator = buildPlayerRestrictionGovernanceLocator({
    campaignId: "campaign-1",
    characterId: "character-1",
    consumerType,
    consumerId: `${consumerType.toLowerCase()}-1`,
  });
  check(locator.ok, `${consumerType} must produce a governance locator.`);
  equal(locator.value?.consumerType, consumerType, `${consumerType} identity must survive locator construction.`);
  check(Object.isFrozen(locator.value), `${consumerType} locator must be immutable.`);
}
const locatorA = requireValue(buildPlayerRestrictionGovernanceLocator({ campaignId: "campaign-1", characterId: "character-1", consumerType: "PLAYER_POWER", consumerId: "power-1" }).value, "First locator required.");
const locatorB = requireValue(buildPlayerRestrictionGovernanceLocator({ campaignId: "campaign-1", characterId: "character-2", consumerType: "PLAYER_POWER", consumerId: "power-1" }).value, "Second locator required.");
check(locatorA.identityKey !== locatorB.identityKey, "The same consumer ID on different characters remains distinct.");
const renamedReordered = requireValue(buildPlayerRestrictionGovernanceLocator({ campaignId: "campaign-1", characterId: "character-1", consumerType: "PLAYER_POWER", consumerId: "power-1" }).value, "Stable locator required.");
equal(renamedReordered.identityKey, locatorA.identityKey, "Rename and reorder metadata cannot change a stable locator.");
for (const [path, value] of [["campaignId", ""], ["characterId", "  "], ["consumerId", ""]] as const) {
  const input = { campaignId: "campaign-1", characterId: "character-1", consumerType: "PLAYER_POWER" as const, consumerId: "power-1", [path]: value };
  const invalid = buildPlayerRestrictionGovernanceLocator(input);
  check(!invalid.ok, `Blank ${path} must be rejected.`);
  check(hasCode(invalid.issues, "INVALID_GOVERNANCE_IDENTIFIER"), `Blank ${path} needs a stable diagnostic.`);
}
const monsterLocator = buildPlayerRestrictionGovernanceLocator({ campaignId: "campaign-1", characterId: "character-1", consumerType: "MONSTER_POWER" as never, consumerId: "monster-power-1" });
check(!monsterLocator.ok, "Monster Power must stay outside player governance persistence.");
check(hasCode(monsterLocator.issues, "INVALID_PLAYER_RESTRICTION_CONSUMER"), "Invalid consumer needs a stable diagnostic.");

// Snapshot normalization, campaign ownership, fingerprints, and immutability.
for (const [name, definition] of [["Standard Structured", standard], ["Custom Narrative", custom], ["Campaign-Custom", campaignCustom]] as const) {
  const before = JSON.stringify(definition);
  const normalized = normalizePlayerRestrictionSnapshot(definition, "campaign-1");
  check(normalized.ok, `${name} snapshot must normalize.`);
  equal(normalized.value?.status, "VALID", `${name} snapshot must be supported.`);
  equal(normalized.value?.fingerprint, createRestrictionFingerprint(definition), `${name} snapshot fingerprint must be exact.`);
  equal(JSON.stringify(definition), before, `${name} source definition must remain unchanged.`);
  check(Object.isFrozen(normalized.value), `${name} snapshot wrapper must be immutable.`);
  check(Object.isFrozen(normalized.value?.definition), `${name} normalized definition must be immutable.`);
  check(Object.isFrozen(normalized.value?.json), `${name} serialized JSON must be immutable.`);
}
const cross = normalizePlayerRestrictionSnapshot(crossCampaign, "campaign-1");
check(!cross.ok, "Cross-campaign Campaign-Custom snapshots must be rejected.");
check(hasCode(cross.issues, "CROSS_CAMPAIGN_REFERENCE"), "Cross-campaign snapshot needs a stable diagnostic.");
const future = normalizePlayerRestrictionSnapshot(unsupported, "campaign-1");
check(future.ok, "Safe unsupported snapshots must be preserved.");
equal(future.value?.status, "UNSUPPORTED", "Safe unsupported snapshot status must remain explicit.");
check(future.issues.some((entry) => entry.code === "UNKNOWN_TEMPLATE" && entry.severity === "warning"), "Unknown safe template must be downgraded to a preservation warning.");
for (const malformed of ["prose", [], { schemaVersion: 2, authoringMode: "STANDARD_STRUCTURED" }, { ...standard, parameters: "bad" }]) {
  check(!normalizePlayerRestrictionSnapshot(malformed, "campaign-1").ok, "Malformed snapshots must fail closed.");
}
check(hasCode(normalizePlayerRestrictionSnapshot(null, "campaign-1").issues, "MISSING_SEMANTIC_SNAPSHOT"), "Absent required snapshot needs a stable diagnostic.");
const serialized = serializePlayerRestrictionSnapshot(standard);
check(serialized !== standard, "Serialized snapshot must be cloned.");
deepEqual(serialized, standard, "Serialized snapshot must preserve normalized semantic content exactly.");
check(Object.isFrozen(serialized), "Serialized snapshot clone must be immutable.");

const now = "2026-07-17T12:00:00.000Z";
const standardFingerprint = createRestrictionFingerprint(standard);
const baseRow: PlayerRestrictionGovernanceRowInput = {
  id: "governance-1",
  campaignId: "campaign-1",
  characterId: "character-1",
  consumerType: "PLAYER_POWER",
  consumerId: "power-1",
  lifecycle: "DRAFT",
  submissionRevision: 0,
  submittedFingerprint: null,
  submittedDefinitionJson: null,
  submittedByUserId: null,
  submittedAt: null,
  approvedFingerprint: null,
  selectedTier: null,
  reviewedByUserId: null,
  reviewedAt: null,
  createdAt: now,
  updatedAt: now,
};
const submittedRow = {
  ...baseRow,
  lifecycle: "PENDING_GD_APPROVAL" as const,
  submissionRevision: 1,
  submittedFingerprint: standardFingerprint,
  submittedDefinitionJson: standard,
  submittedByUserId: "player-1",
  submittedAt: now,
};

// Current governance lifecycle shapes.
const draft = normalizePlayerRestrictionGovernanceRow(baseRow);
check(draft.ok, "Draft without a submitted snapshot must be valid.");
equal(draft.value?.submittedDefinition, null, "Draft must not manufacture a semantic snapshot.");
check(Object.isFrozen(draft.value), "Normalized Draft must be immutable.");
const pending = normalizePlayerRestrictionGovernanceRow(submittedRow);
check(pending.ok, "Complete Pending governance must be valid.");
equal(pending.value?.submittedFingerprint, standardFingerprint, "Pending fingerprint must survive exactly.");
check(Object.isFrozen(pending.value?.submittedDefinition), "Pending snapshot must be immutable.");
for (const tier of RESTRICTION_TIERS) {
  const approved = normalizePlayerRestrictionGovernanceRow({
    ...submittedRow,
    lifecycle: "APPROVED",
    approvedFingerprint: standardFingerprint,
    selectedTier: tier,
    reviewedByUserId: "gd-1",
    reviewedAt: now,
  });
  check(approved.ok, `Approved governance must support ${tier}.`);
  equal(approved.value?.selectedTier, tier, `${tier} must persist only as a classification.`);
}
const changes = normalizePlayerRestrictionGovernanceRow({
  ...submittedRow,
  lifecycle: "CHANGES_REQUESTED",
  reviewedByUserId: "gd-1",
  reviewedAt: now,
});
check(changes.ok, "Complete Changes Requested governance must be valid without a tier.");
const stale = normalizePlayerRestrictionGovernanceRow({
  ...submittedRow,
  lifecycle: "APPROVAL_STALE",
  approvedFingerprint: standardFingerprint,
  selectedTier: "SUBSTANTIAL_LIMITATION",
});
check(stale.ok, "Approval Stale may preserve the prior approved fingerprint and tier.");

const rowFailureCases: ReadonlyArray<readonly [string, PlayerRestrictionGovernanceRowInput, string]> = [
  ["Pending missing snapshot", { ...submittedRow, submittedDefinitionJson: null }, "SUBMITTED_DEFINITION_REQUIRED"],
  ["Pending missing fingerprint", { ...submittedRow, submittedFingerprint: null }, "SUBMITTED_FINGERPRINT_REQUIRED"],
  ["Pending with tier", { ...submittedRow, selectedTier: "MATERIAL_LIMITATION" }, "PENDING_TIER_NOT_ALLOWED"],
  ["Pending with approved fingerprint", { ...submittedRow, approvedFingerprint: standardFingerprint }, "PENDING_APPROVED_FINGERPRINT_NOT_ALLOWED"],
  ["Approved missing tier", { ...submittedRow, lifecycle: "APPROVED", approvedFingerprint: standardFingerprint, reviewedByUserId: "gd-1", reviewedAt: now }, "APPROVED_TIER_REQUIRED"],
  ["Approved fingerprints differ", { ...submittedRow, lifecycle: "APPROVED", approvedFingerprint: "different", selectedTier: "MATERIAL_LIMITATION", reviewedByUserId: "gd-1", reviewedAt: now }, "APPROVED_FINGERPRINT_MISMATCH"],
  ["Approved missing reviewer", { ...submittedRow, lifecycle: "APPROVED", approvedFingerprint: standardFingerprint, selectedTier: "MATERIAL_LIMITATION", reviewedAt: now }, "REVIEWING_USER_REQUIRED"],
  ["Stale missing prior approval", { ...submittedRow, lifecycle: "APPROVAL_STALE" }, "STALE_APPROVED_FINGERPRINT_REQUIRED"],
  ["Draft with tier", { ...baseRow, selectedTier: "MATERIAL_LIMITATION" }, "DRAFT_TIER_NOT_ALLOWED"],
  ["Malformed submitted timestamp", { ...submittedRow, submittedAt: "not-a-date" }, "MALFORMED_GOVERNANCE_TIMESTAMP"],
  ["Invalid consumer", { ...baseRow, consumerType: "MONSTER_POWER" as never }, "INVALID_PLAYER_RESTRICTION_CONSUMER"],
  ["Pending zero revision", { ...submittedRow, submissionRevision: 0 }, "POSITIVE_SUBMISSION_REVISION_REQUIRED"],
  ["Negative revision", { ...baseRow, submissionRevision: -1 }, "INVALID_SUBMISSION_REVISION"],
  ["Snapshot mismatch", { ...submittedRow, submittedFingerprint: "restriction:v1:mismatch" }, "SUBMITTED_FINGERPRINT_MISMATCH"],
  ["Cross-campaign snapshot", { ...submittedRow, submittedDefinitionJson: crossCampaign }, "CROSS_CAMPAIGN_REFERENCE"],
  ["Malformed snapshot", { ...submittedRow, submittedDefinitionJson: "bad" }, "INVALID_DEFINITION"],
  ["Unsupported approval", { ...submittedRow, lifecycle: "APPROVED", submittedDefinitionJson: unsupported, submittedFingerprint: createRestrictionFingerprint(unsupported), approvedFingerprint: createRestrictionFingerprint(unsupported), selectedTier: "MATERIAL_LIMITATION", reviewedByUserId: "gd-1", reviewedAt: now }, "UNSUPPORTED_SNAPSHOT_CANNOT_BE_APPROVED"],
];
for (const [name, input, code] of rowFailureCases) {
  const normalized = normalizePlayerRestrictionGovernanceRow(input);
  check(!normalized.ok, `${name} must be rejected.`);
  check(hasCode(normalized.issues, code), `${name} needs ${code}.`);
  check(hasCode(diagnosePlayerRestrictionGovernanceRow(input), code), `${name} diagnostic helper must preserve ${code}.`);
}

const baseEvent: PlayerRestrictionReviewEventInput = {
  id: "event-1",
  governanceId: "governance-1",
  campaignId: "campaign-1",
  action: "SUBMITTED",
  fromLifecycle: "DRAFT",
  toLifecycle: "PENDING_GD_APPROVAL",
  submissionRevision: 1,
  semanticFingerprint: standardFingerprint,
  semanticDefinitionJson: standard,
  selectedTier: null,
  actorUserId: "player-1",
  notes: null,
  createdAt: now,
};

// Immutable review-event shapes and transitions.
const submittedEvent = normalizePlayerRestrictionReviewEvent(baseEvent);
check(submittedEvent.ok, "Valid Submitted event must normalize.");
check(Object.isFrozen(submittedEvent.value), "Submitted event output must be immutable.");
check(Object.isFrozen(submittedEvent.value?.semanticDefinition), "Submitted event snapshot must be immutable.");
const approvedEvent = normalizePlayerRestrictionReviewEvent({
  ...baseEvent,
  action: "APPROVED",
  fromLifecycle: "PENDING_GD_APPROVAL",
  toLifecycle: "APPROVED",
  selectedTier: "MATERIAL_LIMITATION",
  actorUserId: "gd-1",
  notes: "Optional approval context.",
});
check(approvedEvent.ok, "Valid Approved event must normalize with an optional note.");
const staleApprovalEvent = normalizePlayerRestrictionReviewEvent({
  ...baseEvent,
  action: "APPROVED",
  fromLifecycle: "APPROVAL_STALE",
  toLifecycle: "APPROVED",
  selectedTier: "OATH_LIMITATION",
  actorUserId: "gd-1",
});
check(staleApprovalEvent.ok, "Approval may restore an Approval Stale proposal.");
const changesEvent = normalizePlayerRestrictionReviewEvent({
  ...baseEvent,
  action: "CHANGES_REQUESTED",
  fromLifecycle: "PENDING_GD_APPROVAL",
  toLifecycle: "CHANGES_REQUESTED",
  actorUserId: "gd-1",
  notes: "Please make the eligibility condition objectively reviewable.",
});
check(changesEvent.ok, "Valid Changes Requested event must include a note.");
equal(changesEvent.value?.notes, "Please make the eligibility condition objectively reviewable.", "Review note must survive normalization.");
const staleEvent = normalizePlayerRestrictionReviewEvent({
  ...baseEvent,
  action: "APPROVAL_STALE",
  fromLifecycle: "APPROVED",
  toLifecycle: "APPROVAL_STALE",
  selectedTier: "SUBSTANTIAL_LIMITATION",
  actorUserId: "player-1",
});
check(staleEvent.ok, "Valid Approval Stale event may preserve the prior tier.");
const unsupportedSubmission = normalizePlayerRestrictionReviewEvent({
  ...baseEvent,
  semanticDefinitionJson: unsupported,
  semanticFingerprint: createRestrictionFingerprint(unsupported),
});
check(unsupportedSubmission.ok, "Safe unsupported proposal may be preserved as Submitted.");
equal(unsupportedSubmission.value?.semanticSnapshotStatus, "UNSUPPORTED", "Unsupported event snapshot must remain explicit.");

const eventFailureCases: ReadonlyArray<readonly [string, PlayerRestrictionReviewEventInput, string]> = [
  ["Submitted wrong destination", { ...baseEvent, toLifecycle: "APPROVED" }, "ILLEGAL_REVIEW_EVENT_TRANSITION"],
  ["Submitted with tier", { ...baseEvent, selectedTier: "MATERIAL_LIMITATION" }, "SUBMITTED_TIER_NOT_ALLOWED"],
  ["Submitted zero revision", { ...baseEvent, submissionRevision: 0 }, "POSITIVE_SUBMISSION_REVISION_REQUIRED"],
  ["Approved wrong source", { ...baseEvent, action: "APPROVED", fromLifecycle: "DRAFT", toLifecycle: "APPROVED", selectedTier: "MATERIAL_LIMITATION" }, "ILLEGAL_REVIEW_EVENT_TRANSITION"],
  ["Approved wrong destination", { ...baseEvent, action: "APPROVED", fromLifecycle: "PENDING_GD_APPROVAL", selectedTier: "MATERIAL_LIMITATION" }, "ILLEGAL_REVIEW_EVENT_TRANSITION"],
  ["Approved missing tier", { ...baseEvent, action: "APPROVED", fromLifecycle: "PENDING_GD_APPROVAL", toLifecycle: "APPROVED" }, "APPROVED_TIER_REQUIRED"],
  ["Changes missing note", { ...baseEvent, action: "CHANGES_REQUESTED", fromLifecycle: "PENDING_GD_APPROVAL", toLifecycle: "CHANGES_REQUESTED", notes: "   " }, "CHANGES_REQUESTED_NOTE_REQUIRED"],
  ["Changes wrong source", { ...baseEvent, action: "CHANGES_REQUESTED", fromLifecycle: "APPROVED", toLifecycle: "CHANGES_REQUESTED", notes: "Fix this." }, "ILLEGAL_REVIEW_EVENT_TRANSITION"],
  ["Stale wrong source", { ...baseEvent, action: "APPROVAL_STALE", fromLifecycle: "PENDING_GD_APPROVAL", toLifecycle: "APPROVAL_STALE" }, "ILLEGAL_REVIEW_EVENT_TRANSITION"],
  ["Stale wrong destination", { ...baseEvent, action: "APPROVAL_STALE", fromLifecycle: "APPROVED", toLifecycle: "DRAFT" }, "ILLEGAL_REVIEW_EVENT_TRANSITION"],
  ["Fingerprint mismatch", { ...baseEvent, semanticFingerprint: "restriction:v1:mismatch" }, "SEMANTIC_FINGERPRINT_MISMATCH"],
  ["Actor missing", { ...baseEvent, actorUserId: "" }, "INVALID_GOVERNANCE_IDENTIFIER"],
  ["Snapshot malformed", { ...baseEvent, semanticDefinitionJson: [] }, "MULTIPLE_RESTRICTIONS_NOT_SUPPORTED"],
  ["Cross-campaign event", { ...baseEvent, semanticDefinitionJson: crossCampaign, semanticFingerprint: createRestrictionFingerprint(crossCampaign) }, "CROSS_CAMPAIGN_REFERENCE"],
  ["Unsupported approval", { ...baseEvent, action: "APPROVED", fromLifecycle: "PENDING_GD_APPROVAL", toLifecycle: "APPROVED", semanticDefinitionJson: unsupported, semanticFingerprint: createRestrictionFingerprint(unsupported), selectedTier: "MATERIAL_LIMITATION" }, "UNSUPPORTED_SNAPSHOT_CANNOT_BE_APPROVED"],
];
for (const [name, input, code] of eventFailureCases) {
  const normalized = normalizePlayerRestrictionReviewEvent(input);
  check(!normalized.ok, `${name} event must be rejected.`);
  check(hasCode(normalized.issues, code), `${name} event needs ${code}.`);
  check(hasCode(diagnosePlayerRestrictionReviewEvent(input), code), `${name} event diagnostic helper must preserve ${code}.`);
}

const mutableEventDefinition = JSON.parse(JSON.stringify(standard)) as AbilityRestrictionDefinitionV1;
const immutableEvent = requireValue(normalizePlayerRestrictionReviewEvent({ ...baseEvent, semanticDefinitionJson: mutableEventDefinition }).value, "Immutable event fixture required.");
(mutableEventDefinition.parameters.percentage as { kind: "PERCENTAGE"; value: number }).value = 10;
equal((immutableEvent.semanticDefinition.parameters.percentage as { kind: "PERCENTAGE"; value: number }).value, 50, "Later source edits cannot mutate immutable review history.");
equal(immutableEvent.semanticFingerprint, standardFingerprint, "Immutable event fingerprint remains bound to its snapshot.");

// No economics or automatic governance manufacture.
for (const value of [draft.value, pending.value, approvedEvent.value, staleEvent.value]) {
  const keys = Object.keys(value ?? {}).map((key) => key.toLowerCase());
  for (const forbidden of ["tierrate", "grossbpv", "netbpv", "scalar", "pointcredit", "exceptionalcap", "tuningset"]) {
    check(!keys.includes(forbidden), `Normalized persistence output must not contain ${forbidden}.`);
  }
}
check(!adapterSource.includes("builderData"), "Adapter must not read live BuilderData or manufacture governance records.");
check(!/createMany|upsert|\.create\(|\.update\(/u.test(adapterSource), "Pure adapter must not write governance records.");
check(!/OATH_LIMITATION[^\n]*(?:0\.4|40)/iu.test(`${adapterSource}\n${schema}\n${migration}`), "Oath persistence must not encode the candidate 40% rate.");
check(!/economics|activeTuning|restrictionTierRates/u.test(adapterSource), "Adapter must not import or activate Restriction economics.");

assert.ok(checks >= 150, `Expected at least 150 deterministic checks, received ${checks}.`);
console.log(`Restriction governance persistence smoke passed (${checks} checks).`);
