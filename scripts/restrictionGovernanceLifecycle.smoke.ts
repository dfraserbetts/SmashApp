import assert from "node:assert/strict";

import {
  defaultBuilderData,
  type CharacterBuilderData,
} from "../lib/characterBuilder/core";
import {
  createDefaultCharacterPower,
  type CharacterPower,
} from "../lib/characterBuilder/powers";
import {
  normalizeRoleplayAbility,
  type RoleplayAbility,
} from "../lib/characterBuilder/roleplayAbilities";
import type { AbilityRestrictionDefinitionV1 } from "../lib/restrictions";
import {
  derivePlayerRestrictionGovernanceReadFacts,
  planApproveRestriction,
  planRequestRestrictionChanges,
  planSubmitRestriction,
} from "../lib/restrictions/governanceLifecycle";
import {
  normalizePlayerRestrictionSnapshot,
  type PlayerRestrictionGovernanceRowInput,
  type PlayerRestrictionSnapshot,
} from "../lib/restrictions/governancePersistence";
import { resolvePlayerRestrictionConsumer } from "../lib/restrictions/playerRestrictionConsumerResolver";

let checks = 0;
function check(value: unknown, message: string): asserts value {
  assert.ok(value, message);
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
function hasCode(value: { issues: readonly { code: string }[] }, code: string): boolean {
  return value.issues.some((entry) => entry.code === code);
}

const campaignId = "campaign-a";
const characterId = "character-a";
const actionAt = "2026-07-17T12:00:00.000Z";
const standard: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "STANDARD_STRUCTURED",
  templateKey: "ACTOR_PHYSICAL_HEALTH_PERCENTAGE",
  templateVersion: 1,
  parameters: {
    operator: { kind: "SYSTEM_ENUM", valueKey: "AT_OR_BELOW" },
    percentage: { kind: "PERCENTAGE", value: 50 },
  },
  customNarrativeText: null,
};
const changedStandard: AbilityRestrictionDefinitionV1 = {
  ...standard,
  parameters: {
    ...standard.parameters,
    percentage: { kind: "PERCENTAGE", value: 25 },
  },
};
const custom: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "CUSTOM_NARRATIVE",
  templateKey: null,
  templateVersion: null,
  parameters: {},
  customNarrativeText: "Only after the warning bell has rung.",
};
const campaignCustom: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "CAMPAIGN_CUSTOM_STRUCTURED",
  templateKey: "ACTOR_ZONE_MEMBERSHIP",
  templateVersion: 1,
  parameters: {
    operator: { kind: "SYSTEM_ENUM", valueKey: "INSIDE" },
    zone: {
      kind: "CAMPAIGN_REFERENCE",
      campaignId,
      valueKind: "ZONE",
      valueId: "zone-a",
    },
  },
  customNarrativeText: null,
};
const crossCampaign: AbilityRestrictionDefinitionV1 = {
  ...campaignCustom,
  parameters: {
    ...campaignCustom.parameters,
    zone: {
      kind: "CAMPAIGN_REFERENCE",
      campaignId: "campaign-b",
      valueKind: "ZONE",
      valueId: "zone-a",
    },
  },
};
const unsupported: AbilityRestrictionDefinitionV1 = {
  ...standard,
  templateKey: "FUTURE_SAFE_TEMPLATE",
  templateVersion: 9,
};

function snapshot(definition: AbilityRestrictionDefinitionV1): PlayerRestrictionSnapshot {
  const result = normalizePlayerRestrictionSnapshot(definition, campaignId);
  assert.ok(result.value, `Snapshot must normalize: ${result.issues.map((issue) => issue.code).join(", ")}`);
  return result.value;
}

const standardSnapshot = snapshot(standard);
const changedSnapshot = snapshot(changedStandard);
const unsupportedSnapshot = snapshot(unsupported);

function power(
  id: string,
  name: string,
  restriction: AbilityRestrictionDefinitionV1 | null,
): CharacterPower {
  const value = createDefaultCharacterPower(0);
  return {
    ...value,
    id,
    name,
    restriction,
    effectPackets: value.effectPackets.map((packet, index) => ({
      ...packet,
      id: `${id}-packet-${index}`,
    })),
    intentions: value.effectPackets.map((packet, index) => ({
      ...packet,
      id: `${id}-packet-${index}`,
    })),
  };
}

function ability(
  id: string,
  name: string,
  restriction: AbilityRestrictionDefinitionV1 | null,
  index = 0,
): RoleplayAbility {
  return normalizeRoleplayAbility({ id, name, restriction }, index);
}

function data(params: Partial<CharacterBuilderData> = {}): CharacterBuilderData {
  return { ...defaultBuilderData(), ...params };
}

const powerStandard = power("power-a", "First Power", standard);
const powerCustom = power("power-b", "Second Power", custom);
const signature = power("signature-a", "Signature", standard);
const roleplay = ability("roleplay-a", "A Warning", campaignCustom);
const baseData = data({
  powers: [powerStandard, powerCustom],
  signatureMove: signature,
  roleplayAbilities: [roleplay],
});

// Stable-ID live consumer resolution.
const resolvedPower = resolvePlayerRestrictionConsumer(baseData, {
  campaignId,
  consumerType: "PLAYER_POWER",
  consumerId: "power-a",
});
check(resolvedPower.ok, "Player Power resolves by stable ID.");
equal(resolvedPower.consumerName, "First Power", "Player Power exposes its visible name.");
equal(resolvedPower.consumerIndex, 0, "Player Power exposes its ordinary index.");
equal(resolvedPower.semanticStatus, "VALID", "Standard Restriction is valid.");
equal(resolvedPower.currentFingerprint, standardSnapshot.fingerprint, "Power fingerprint is exact.");
const resolvedSignature = resolvePlayerRestrictionConsumer(baseData, {
  campaignId,
  consumerType: "SIGNATURE_MOVE",
  consumerId: "signature-a",
});
check(resolvedSignature.ok, "Signature Move resolves only by its stable ID.");
equal(resolvedSignature.consumerIndex, null, "Signature Move has no collection index.");
const resolvedRoleplay = resolvePlayerRestrictionConsumer(baseData, {
  campaignId,
  consumerType: "ROLEPLAY_ABILITY",
  consumerId: "roleplay-a",
});
check(resolvedRoleplay.ok, "Roleplay Ability resolves by stable ID.");
equal(resolvedRoleplay.semanticStatus, "VALID", "Same-campaign Campaign-Custom is valid.");

const reordered = resolvePlayerRestrictionConsumer(data({
  ...baseData,
  powers: [powerCustom, { ...powerStandard, name: "Renamed Power" }],
}), {
  campaignId,
  consumerType: "PLAYER_POWER",
  consumerId: "power-a",
});
equal(reordered.consumerIndex, 1, "Reorder changes only the reported index.");
equal(reordered.consumerName, "Renamed Power", "Rename changes only visible metadata.");
equal(reordered.currentFingerprint, resolvedPower.currentFingerprint, "Rename and reorder preserve semantic identity.");
const duplicate = resolvePlayerRestrictionConsumer(data({
  powers: [powerStandard, { ...powerStandard, name: "Duplicate" }],
}), {
  campaignId,
  consumerType: "PLAYER_POWER",
  consumerId: "power-a",
});
equal(duplicate.consumerPresence, "DUPLICATE", "Duplicate stable IDs are rejected.");
check(hasCode(duplicate, "DUPLICATE_PLAYER_RESTRICTION_CONSUMER_ID"), "Duplicate ID has a stable issue.");
const absent = resolvePlayerRestrictionConsumer(data(), {
  campaignId,
  consumerType: "PLAYER_POWER",
  consumerId: "power-a",
});
equal(absent.consumerPresence, "ABSENT", "Deleted consumer is reported absent.");
const mismatch = resolvePlayerRestrictionConsumer(baseData, {
  campaignId,
  consumerType: "ROLEPLAY_ABILITY",
  consumerId: "power-a",
});
check(hasCode(mismatch, "PLAYER_RESTRICTION_CONSUMER_TYPE_MISMATCH"), "Consumer type mismatch is explicit.");
const blank = resolvePlayerRestrictionConsumer(baseData, {
  campaignId,
  consumerType: "PLAYER_POWER",
  consumerId: " ",
});
check(hasCode(blank, "BLANK_PLAYER_RESTRICTION_CONSUMER_ID"), "Blank requested ID is rejected.");
const unrestricted = resolvePlayerRestrictionConsumer(data({ powers: [power("none", "None", null)] }), {
  campaignId,
  consumerType: "PLAYER_POWER",
  consumerId: "none",
});
equal(unrestricted.semanticStatus, "NONE", "No semantic Restriction is ordinary absence.");
check(hasCode(unrestricted, "MISSING_SEMANTIC_RESTRICTION"), "Restriction absence remains diagnostic.");
equal(resolvePlayerRestrictionConsumer(data({ powers: [power("custom", "Custom", custom)] }), {
  campaignId,
  consumerType: "PLAYER_POWER",
  consumerId: "custom",
}).semanticStatus, "VALID", "Custom Narrative resolves as valid.");
const cross = resolvePlayerRestrictionConsumer(data({
  roleplayAbilities: [ability("cross", "Cross", crossCampaign)],
}), {
  campaignId,
  consumerType: "ROLEPLAY_ABILITY",
  consumerId: "cross",
});
equal(cross.semanticStatus, "MALFORMED", "Cross-campaign definition is rejected.");
check(hasCode(cross, "CROSS_CAMPAIGN_REFERENCE"), "Cross-campaign issue is stable.");
const safeUnsupported = resolvePlayerRestrictionConsumer(data({
  powers: [power("future", "Future", unsupported)],
}), {
  campaignId,
  consumerType: "PLAYER_POWER",
  consumerId: "future",
});
equal(safeUnsupported.semanticStatus, "UNSUPPORTED", "Safe unsupported status is preserved.");
check(safeUnsupported.normalizedSnapshot, "Safe unsupported snapshot remains representable.");
const malformedPower = power("malformed", "Malformed", null) as unknown as Record<string, unknown>;
malformedPower.restriction = { schemaVersion: 2 };
const malformed = resolvePlayerRestrictionConsumer(data({
  powers: [malformedPower as unknown as CharacterPower],
}), {
  campaignId,
  consumerType: "PLAYER_POWER",
  consumerId: "malformed",
});
equal(malformed.semanticStatus, "MALFORMED", "Malformed definition is rejected.");
const legacy = normalizeRoleplayAbility({
  id: "legacy",
  name: "Legacy",
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "LIGHT",
  restrictionText: "during the eclipse",
}, 0);
const legacyResolution = resolvePlayerRestrictionConsumer(data({ roleplayAbilities: [legacy] }), {
  campaignId,
  consumerType: "ROLEPLAY_ABILITY",
  consumerId: "legacy",
});
equal(legacyResolution.semanticStatus, "UNRESOLVED_LEGACY_REVIEW", "Unresolved legacy review remains explicit.");

function firstSubmit(
  liveSnapshot: PlayerRestrictionSnapshot = standardSnapshot,
  consumerId = "power-a",
) {
  return planSubmitRestriction({
    currentRow: null,
    expectedSubmissionRevision: 0,
    actorUserId: "player-a",
    actionAt,
    governanceId: `governance-${consumerId}`,
    locator: { campaignId, characterId, consumerType: "PLAYER_POWER", consumerId },
    liveSnapshot,
    eventIds: [`submitted-${consumerId}`],
  });
}

const sourceBefore = JSON.stringify(baseData);
const submitted = firstSubmit();
check(submitted.ok, "First submission is valid.");
equal(submitted.steps.length, 1, "First submission has one ordered write step.");
equal(submitted.steps[0].operation, "CREATE", "First submission creates the current row.");
equal(submitted.steps[0].expectedSubmissionRevision, 0, "First submission conditionally expects revision zero.");
equal(submitted.finalRow?.submissionRevision, 1, "First submission increments revision zero to one.");
equal(submitted.finalRow?.lifecycle, "PENDING_GD_APPROVAL", "First submission becomes Pending.");
equal(submitted.finalRow?.submittedByUserId, "player-a", "Authenticated actor becomes submitter.");
equal(submitted.finalRow?.submittedFingerprint, standardSnapshot.fingerprint, "Submitted fingerprint is exact.");
deepEqual(submitted.finalRow?.submittedDefinitionJson, standardSnapshot.json, "Submitted snapshot is exact and immutable.");
equal(submitted.finalRow?.selectedTier, null, "Submission carries no tier.");
equal(submitted.finalRow?.approvedFingerprint, null, "Submission manufactures no approval.");
equal(submitted.steps[0].event.action, "SUBMITTED", "Submission appends a Submitted event.");
equal(JSON.stringify(baseData), sourceBefore, "Consumer resolution and transition planning do not mutate builderData.");
check(Object.isFrozen(standardSnapshot.definition), "Normalized snapshot is immutable.");

const pendingRow = submitted.finalRow!;
const pendingRetry = planSubmitRestriction({
  currentRow: pendingRow,
  expectedSubmissionRevision: 1,
  actorUserId: "player-a",
  actionAt,
  governanceId: pendingRow.id,
  locator: pendingRow,
  liveSnapshot: standardSnapshot,
  eventIds: ["retry"],
});
check(!pendingRetry.ok, "Pending proposal cannot be silently replaced.");
check(hasCode(pendingRetry, "PENDING_PROPOSAL_IMMUTABLE"), "Pending immutability has a stable issue.");
const staleExpected = planSubmitRestriction({
  currentRow: pendingRow,
  expectedSubmissionRevision: 0,
  actorUserId: "player-a",
  actionAt,
  governanceId: pendingRow.id,
  locator: pendingRow,
  liveSnapshot: standardSnapshot,
  eventIds: ["stale"],
});
check(hasCode(staleExpected, "STALE_SUBMISSION_REVISION"), "Stale submission revision is rejected.");

const changed = planRequestRestrictionChanges({
  currentRow: pendingRow,
  expectedSubmissionRevision: 1,
  actorUserId: "gd-a",
  actionAt,
  notes: "Please make this condition objectively enforceable.",
  eventId: "changes-a",
});
check(changed.ok, "Request Changes succeeds with a note.");
equal(changed.finalRow?.lifecycle, "CHANGES_REQUESTED", "Request Changes updates lifecycle.");
equal(changed.finalRow?.selectedTier, null, "Request Changes clears the tier.");
equal(changed.finalRow?.submissionRevision, 1, "Request Changes preserves revision.");
equal(changed.steps[0].event.semanticFingerprint, standardSnapshot.fingerprint, "Request Changes targets immutable submitted proposal.");
const resubmitted = planSubmitRestriction({
  currentRow: changed.finalRow,
  expectedSubmissionRevision: 1,
  actorUserId: "player-a",
  actionAt,
  governanceId: pendingRow.id,
  locator: pendingRow,
  liveSnapshot: changedSnapshot,
  eventIds: ["resubmitted-a"],
});
check(resubmitted.ok, "Changes Requested can be resubmitted.");
equal(resubmitted.finalRow?.submissionRevision, 2, "Resubmission increments exactly once.");
equal(resubmitted.finalRow?.reviewedByUserId, null, "Resubmission clears latest reviewer metadata.");
equal(resubmitted.finalRow?.selectedTier, null, "Resubmission requires a new tier decision.");

const draftRow: PlayerRestrictionGovernanceRowInput = {
  id: "governance-draft",
  campaignId,
  characterId,
  consumerType: "PLAYER_POWER",
  consumerId: "power-draft",
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
  createdAt: actionAt,
  updatedAt: actionAt,
};
const draftSubmit = planSubmitRestriction({
  currentRow: draftRow,
  expectedSubmissionRevision: 0,
  actorUserId: "player-a",
  actionAt,
  governanceId: draftRow.id,
  locator: draftRow,
  liveSnapshot: standardSnapshot,
  eventIds: ["draft-submit"],
});
check(draftSubmit.ok, "Persisted Draft can submit.");
equal(draftSubmit.steps[0].operation, "UPDATE", "Persisted Draft updates rather than creates.");

// Approval action and policy seam.
for (const tier of [
  "MATERIAL_LIMITATION",
  "SUBSTANTIAL_LIMITATION",
  "NARROW_AVAILABILITY",
  "OATH_LIMITATION",
] as const) {
  const approval = planApproveRestriction({
    currentRow: pendingRow,
    expectedSubmissionRevision: 1,
    actorUserId: "gd-a",
    actionAt,
    liveSnapshot: standardSnapshot,
    selectedTier: tier,
    notes: tier === "MATERIAL_LIMITATION" ? "Optional note" : null,
    selfApprovalPolicy: "UNRESOLVED",
    eventId: `approve-${tier}`,
  });
  check(approval.ok, `${tier} classification can be structurally approved.`);
  equal(approval.finalRow?.selectedTier, tier, `${tier} is stored as governance metadata.`);
  equal(approval.finalRow?.approvedFingerprint, standardSnapshot.fingerprint, `${tier} approval binds exact fingerprint.`);
  equal(approval.finalRow?.reviewedByUserId, "gd-a", `${tier} stores authenticated actor.`);
  equal(approval.finalRow?.submissionRevision, 1, `${tier} preserves revision.`);
  check(!/rate|credit|grossBpv|netBpv|scalar/iu.test(JSON.stringify(approval)), `${tier} produces no economic output.`);
}
const approved = planApproveRestriction({
  currentRow: pendingRow,
  expectedSubmissionRevision: 1,
  actorUserId: "gd-a",
  actionAt,
  liveSnapshot: standardSnapshot,
  selectedTier: "MATERIAL_LIMITATION",
  notes: "  Optional approval note.  ",
  selfApprovalPolicy: "UNRESOLVED",
  eventId: "approved-a",
});
check(approved.ok, "Valid approval succeeds.");
equal(approved.steps[0].event.notes, "Optional approval note.", "Approval notes are normalized.");
const approvedRow = approved.finalRow!;
const missingTier = planApproveRestriction({
  currentRow: pendingRow,
  expectedSubmissionRevision: 1,
  actorUserId: "gd-a",
  actionAt,
  liveSnapshot: standardSnapshot,
  selectedTier: null,
  selfApprovalPolicy: "UNRESOLVED",
  eventId: "missing-tier",
});
check(hasCode(missingTier, "APPROVAL_TIER_REQUIRED"), "Missing approval tier is rejected.");
check(hasCode(planApproveRestriction({
  currentRow: pendingRow,
  expectedSubmissionRevision: 0,
  actorUserId: "gd-a",
  actionAt,
  liveSnapshot: standardSnapshot,
  selectedTier: "MATERIAL_LIMITATION",
  selfApprovalPolicy: "UNRESOLVED",
  eventId: "wrong-revision",
}), "STALE_SUBMISSION_REVISION"), "Approval rejects stale revision.");
check(hasCode(planApproveRestriction({
  currentRow: approvedRow,
  expectedSubmissionRevision: 1,
  actorUserId: "gd-a",
  actionAt,
  liveSnapshot: standardSnapshot,
  selectedTier: "MATERIAL_LIMITATION",
  selfApprovalPolicy: "UNRESOLVED",
  eventId: "non-pending",
}), "APPROVAL_REQUIRES_PENDING_PROPOSAL"), "Approval rejects non-Pending lifecycle.");
check(hasCode(planApproveRestriction({
  currentRow: pendingRow,
  expectedSubmissionRevision: 1,
  actorUserId: "gd-a",
  actionAt,
  liveSnapshot: changedSnapshot,
  selectedTier: "MATERIAL_LIMITATION",
  selfApprovalPolicy: "UNRESOLVED",
  eventId: "mismatch-live",
}), "LIVE_RESTRICTION_DOES_NOT_MATCH_SUBMISSION"), "Approval rejects live fingerprint mismatch.");
const corruptSubmitted = {
  ...pendingRow,
  submittedFingerprint: changedSnapshot.fingerprint,
};
check(hasCode(planApproveRestriction({
  currentRow: corruptSubmitted,
  expectedSubmissionRevision: 1,
  actorUserId: "gd-a",
  actionAt,
  liveSnapshot: standardSnapshot,
  selectedTier: "MATERIAL_LIMITATION",
  selfApprovalPolicy: "UNRESOLVED",
  eventId: "corrupt",
}), "SUBMITTED_FINGERPRINT_MISMATCH"), "Submitted snapshot mismatch is rejected by shared adapter.");
const unsupportedSubmitted = firstSubmit(unsupportedSnapshot, "unsupported");
check(unsupportedSubmitted.ok, "Safe unsupported definition may be submitted for visibility.");
check(hasCode(planApproveRestriction({
  currentRow: unsupportedSubmitted.finalRow,
  expectedSubmissionRevision: 1,
  actorUserId: "gd-a",
  actionAt,
  liveSnapshot: unsupportedSnapshot,
  selectedTier: "MATERIAL_LIMITATION",
  selfApprovalPolicy: "UNRESOLVED",
  eventId: "unsupported-approve",
}), "UNSUPPORTED_RESTRICTION_CANNOT_BE_APPROVED"), "Safe unsupported definition cannot be approved.");
const selfApproval = planApproveRestriction({
  currentRow: pendingRow,
  expectedSubmissionRevision: 1,
  actorUserId: "player-a",
  actionAt,
  liveSnapshot: standardSnapshot,
  selectedTier: "MATERIAL_LIMITATION",
  selfApprovalPolicy: "UNRESOLVED",
  eventId: "self",
});
check(hasCode(selfApproval, "SELF_APPROVAL_POLICY_UNRESOLVED"), "Self-approval unresolved policy returns stable conflict.");
equal(selfApproval.steps.length, 0, "Self-approval conflict plans no mutation or event.");
check(planApproveRestriction({
  currentRow: pendingRow,
  expectedSubmissionRevision: 1,
  actorUserId: "player-a",
  actionAt,
  liveSnapshot: standardSnapshot,
  selectedTier: "MATERIAL_LIMITATION",
  selfApprovalPolicy: "ALLOW",
  eventId: "self-allowed",
}).ok, "Explicit ALLOW seam can permit self-review without locking production doctrine.");

const approvedCurrentSubmit = planSubmitRestriction({
  currentRow: approvedRow,
  expectedSubmissionRevision: 1,
  actorUserId: "player-a",
  actionAt,
  governanceId: approvedRow.id,
  locator: approvedRow,
  liveSnapshot: standardSnapshot,
  eventIds: ["approved-current"],
});
check(hasCode(approvedCurrentSubmit, "CURRENT_APPROVAL_CANNOT_BE_RESUBMITTED"), "Current Approved proposal cannot be resubmitted.");
const staleAndSubmit = planSubmitRestriction({
  currentRow: approvedRow,
  expectedSubmissionRevision: 1,
  actorUserId: "player-a",
  actionAt,
  governanceId: approvedRow.id,
  locator: approvedRow,
  liveSnapshot: changedSnapshot,
  eventIds: ["stale-event", "new-submission"],
});
check(staleAndSubmit.ok, "Fingerprint-mismatched Approved proposal can stale and resubmit.");
equal(staleAndSubmit.steps.length, 2, "Stale-and-resubmit produces exactly two ordered steps.");
deepEqual(staleAndSubmit.steps.map((step) => step.event.action), ["APPROVAL_STALE", "SUBMITTED"], "Stale event precedes new Submitted event.");
deepEqual(staleAndSubmit.steps.map((step) => step.row.lifecycle), ["APPROVAL_STALE", "PENDING_GD_APPROVAL"], "Current row transitions through Stale then Pending.");
equal(staleAndSubmit.steps[0].event.semanticFingerprint, standardSnapshot.fingerprint, "Stale event preserves prior approved snapshot.");
equal(staleAndSubmit.steps[1].event.semanticFingerprint, changedSnapshot.fingerprint, "Submitted event stores revised live snapshot.");
equal(staleAndSubmit.finalRow?.submissionRevision, 2, "Stale event does not increment; new submission increments once.");
equal(staleAndSubmit.finalRow?.selectedTier, null, "Stale resubmission clears prior tier.");
equal(staleAndSubmit.finalRow?.approvedFingerprint, null, "Pending adapter carries no prior approved fingerprint.");
check(Date.parse(String(staleAndSubmit.steps[1].event.createdAt)) > Date.parse(String(staleAndSubmit.steps[0].event.createdAt)), "Two-event ordering is timestamp-stable.");
const staleRow = staleAndSubmit.steps[0].row;
const staleResubmit = planSubmitRestriction({
  currentRow: staleRow,
  expectedSubmissionRevision: 1,
  actorUserId: "player-a",
  actionAt,
  governanceId: staleRow.id,
  locator: staleRow,
  liveSnapshot: changedSnapshot,
  eventIds: ["stale-resubmit"],
});
check(staleResubmit.ok, "Approval Stale can be resubmitted directly.");

// Request Changes remains bound to the immutable submitted proposal.
const blankChanges = planRequestRestrictionChanges({
  currentRow: pendingRow,
  expectedSubmissionRevision: 1,
  actorUserId: "gd-a",
  actionAt,
  notes: "  ",
  eventId: "blank",
});
check(hasCode(blankChanges, "CHANGES_REQUESTED_NOTE_REQUIRED"), "Blank Request Changes note is rejected.");
check(hasCode(planRequestRestrictionChanges({
  currentRow: pendingRow,
  expectedSubmissionRevision: 0,
  actorUserId: "gd-a",
  actionAt,
  notes: "Revise it.",
  eventId: "changes-revision",
}), "STALE_SUBMISSION_REVISION"), "Request Changes rejects stale revision.");
check(hasCode(planRequestRestrictionChanges({
  currentRow: approvedRow,
  expectedSubmissionRevision: 1,
  actorUserId: "gd-a",
  actionAt,
  notes: "Revise it.",
  eventId: "changes-non-pending",
}), "REQUEST_CHANGES_REQUIRES_PENDING_PROPOSAL"), "Request Changes rejects non-Pending lifecycle.");
equal(changed.steps[0].event.semanticFingerprint, standardSnapshot.fingerprint, "Live edits do not change Request Changes event target.");
deepEqual(changed.steps[0].event.semanticDefinitionJson, standardSnapshot.json, "Request Changes preserves exact immutable event snapshot.");

// Pure read-currentness facts.
const syntheticFacts = derivePlayerRestrictionGovernanceReadFacts({
  live: resolvedPower,
  currentRow: null,
});
check(syntheticFacts?.synthetic, "Existing restricted content without a row is synthetic Draft.");
equal(syntheticFacts?.effectiveLifecycle, "DRAFT", "Synthetic entry has effective Draft lifecycle.");
equal(syntheticFacts?.currentRow, null, "Synthetic Draft is not persisted.");
equal(derivePlayerRestrictionGovernanceReadFacts({ live: unrestricted, currentRow: null }), null, "Unrestricted content receives no synthetic row.");
const approvedCurrentFacts = derivePlayerRestrictionGovernanceReadFacts({
  live: resolvedPower,
  currentRow: approvedRow,
});
check(approvedCurrentFacts?.approvalCurrent, "Matching Approved fingerprint is current.");
equal(approvedCurrentFacts?.effectiveLifecycle, "APPROVED", "Matching Approved remains effective Approved.");
const changedLive = resolvePlayerRestrictionConsumer(data({
  powers: [power("power-a", "First Power", changedStandard)],
}), {
  campaignId,
  consumerType: "PLAYER_POWER",
  consumerId: "power-a",
});
const approvedStaleFacts = derivePlayerRestrictionGovernanceReadFacts({
  live: changedLive,
  currentRow: approvedRow,
});
equal(approvedStaleFacts?.storedLifecycle, "APPROVED", "GET preserves physically stored Approved lifecycle.");
equal(approvedStaleFacts?.effectiveLifecycle, "APPROVAL_STALE", "Fingerprint mismatch derives effective Stale.");
equal(approvedStaleFacts?.approvalCurrent, false, "Stale approval is not current.");
const pendingMismatchFacts = derivePlayerRestrictionGovernanceReadFacts({
  live: changedLive,
  currentRow: pendingRow,
});
equal(pendingMismatchFacts?.effectiveLifecycle, "PENDING_GD_APPROVAL", "Pending mismatch remains Pending.");
equal(pendingMismatchFacts?.submittedProposalMatchesLiveDefinition, false, "Pending mismatch is exposed explicitly.");
const orphanFacts = derivePlayerRestrictionGovernanceReadFacts({
  live: absent,
  currentRow: pendingRow,
});
check(orphanFacts?.orphaned, "Deleted consumer preserves governance as orphaned history.");
const readJson = JSON.stringify({ syntheticFacts, approvedStaleFacts, pendingMismatchFacts, orphanFacts });
check(!/email/iu.test(readJson), "Pure read facts expose no email address field.");
check(!/economic|rate|credit|grossBpv|netBpv|scalar/iu.test(readJson), "Pure read facts expose no economic fields.");

// Conditional steps prove the optimistic token used by server writes.
equal(approved.steps[0].expectedLifecycle, "PENDING_GD_APPROVAL", "Approval conditionally expects Pending.");
equal(changed.steps[0].expectedLifecycle, "PENDING_GD_APPROVAL", "Request Changes conditionally expects Pending.");
equal(approved.steps[0].expectedSubmissionRevision, changed.steps[0].expectedSubmissionRevision, "Competing review decisions use the same revision token.");
const retryAfterSuccess = planApproveRestriction({
  currentRow: approvedRow,
  expectedSubmissionRevision: 1,
  actorUserId: "gd-a",
  actionAt,
  liveSnapshot: standardSnapshot,
  selectedTier: "MATERIAL_LIMITATION",
  selfApprovalPolicy: "UNRESOLVED",
  eventId: "retry-approved",
});
check(!retryAfterSuccess.ok, "Retry after successful approval cannot append a second event.");

console.log(`Restriction governance lifecycle smoke passed (${checks} checks).`);
