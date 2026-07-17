import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { AbilityRestrictionDefinitionV1 } from "../lib/restrictions";
import {
  buildPlayerRestrictionGovernanceEntryMap,
  deriveCharacterRestrictionGovernanceReadiness,
  formatRestrictionGovernanceSummary,
  getLatestPlayerFacingRestrictionReviewNote,
  getPlayerRestrictionGovernanceEntryKey,
  hasPendingRestrictionProposalMismatch,
  hasSavedApprovedRestrictionMismatch,
  hasUnsavedApprovedRestrictionMismatch,
  replacePlayerRestrictionGovernanceEntry,
  type CharacterRestrictionGovernanceReadModel,
  type PlayerRestrictionGovernanceReadEntry,
} from "../lib/restrictions/governanceView";

let checks = 0;
function check(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  checks += 1;
}
function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  checks += 1;
}

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
const custom: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "CUSTOM_NARRATIVE",
  templateKey: null,
  templateVersion: null,
  parameters: {},
  customNarrativeText: "Only beneath the last moon.",
};

function entry(
  consumerType: PlayerRestrictionGovernanceReadEntry["consumerType"],
  consumerId: string,
  overrides: Partial<PlayerRestrictionGovernanceReadEntry> = {},
): PlayerRestrictionGovernanceReadEntry {
  return {
    governanceId: null,
    synthetic: true,
    consumerType,
    consumerId,
    consumerName: "Original name",
    consumerIndex: 0,
    consumerPresence: "PRESENT",
    semanticStatus: "VALID",
    currentSemanticRestriction: standard,
    currentFingerprint: "fingerprint-live",
    submittedDefinition: null,
    submittedSnapshotStatus: null,
    submittedFingerprint: null,
    approvedFingerprint: null,
    submittedProposalMatchesLiveDefinition: null,
    approvedProposalMatchesLiveDefinition: null,
    storedLifecycle: null,
    effectiveLifecycle: "DRAFT",
    approvalCurrent: false,
    selectedTier: null,
    submissionRevision: 0,
    submittedByUserId: null,
    submittedAt: null,
    reviewedByUserId: null,
    reviewedAt: null,
    history: [],
    diagnosticIssues: [],
    ...overrides,
  };
}

const power = entry("PLAYER_POWER", "power-stable");
const signature = entry("SIGNATURE_MOVE", "signature-stable");
const roleplay = entry("ROLEPLAY_ABILITY", "roleplay-stable");
const model: CharacterRestrictionGovernanceReadModel = {
  campaignId: "campaign-a",
  characterId: "character-a",
  governance: [roleplay, power, signature],
};

equal(getPlayerRestrictionGovernanceEntryKey("PLAYER_POWER", "power-stable"), '["PLAYER_POWER","power-stable"]', "Power key uses type plus stable ID.");
equal(getPlayerRestrictionGovernanceEntryKey("SIGNATURE_MOVE", "signature-stable"), '["SIGNATURE_MOVE","signature-stable"]', "Signature key uses type plus stable ID.");
equal(getPlayerRestrictionGovernanceEntryKey("ROLEPLAY_ABILITY", "roleplay-stable"), '["ROLEPLAY_ABILITY","roleplay-stable"]', "Roleplay key uses type plus stable ID.");
const mapped = buildPlayerRestrictionGovernanceEntryMap(model);
equal(mapped.get(getPlayerRestrictionGovernanceEntryKey("PLAYER_POWER", "power-stable")), power, "Reorder does not affect Power mapping.");
equal(mapped.get(getPlayerRestrictionGovernanceEntryKey("SIGNATURE_MOVE", "signature-stable")), signature, "Reorder does not affect Signature mapping.");
equal(mapped.get(getPlayerRestrictionGovernanceEntryKey("ROLEPLAY_ABILITY", "roleplay-stable")), roleplay, "Reorder does not affect Roleplay mapping.");
const renamedPower = { ...power, consumerName: "Renamed Power", consumerIndex: 9 };
const renamedModel = replacePlayerRestrictionGovernanceEntry(model, renamedPower);
equal(renamedModel.governance.length, 3, "Stable replacement does not duplicate renamed consumers.");
equal(buildPlayerRestrictionGovernanceEntryMap(renamedModel).get('["PLAYER_POWER","power-stable"]')?.consumerName, "Renamed Power", "Rename preserves stable governance mapping.");

equal(formatRestrictionGovernanceSummary({ definition: standard, entry: power }), "Restriction: Standard · Draft", "Synthetic Draft has an effective summary.");
const pending = entry("PLAYER_POWER", "power-stable", {
  governanceId: "governance-pending",
  synthetic: false,
  storedLifecycle: "PENDING_GD_APPROVAL",
  effectiveLifecycle: "PENDING_GD_APPROVAL",
  submissionRevision: 1,
  submittedDefinition: standard,
  submittedFingerprint: "fingerprint-live",
  submittedProposalMatchesLiveDefinition: true,
});
check(formatRestrictionGovernanceSummary({ definition: standard, entry: pending }).includes("Pending Game Director Approval"), "Pending summary is visible.");
const approved = entry("PLAYER_POWER", "power-stable", {
  governanceId: "governance-approved",
  synthetic: false,
  storedLifecycle: "APPROVED",
  effectiveLifecycle: "APPROVED",
  approvalCurrent: true,
  selectedTier: "SUBSTANTIAL_LIMITATION",
  approvedFingerprint: "fingerprint-live",
  approvedProposalMatchesLiveDefinition: true,
  submissionRevision: 1,
});
equal(formatRestrictionGovernanceSummary({ definition: standard, entry: approved }), "Restriction: Standard · Approved — Substantial Limitation", "Approved summary includes classification tier.");
const changes = entry("ROLEPLAY_ABILITY", "roleplay-stable", {
  governanceId: "governance-changes",
  synthetic: false,
  storedLifecycle: "CHANGES_REQUESTED",
  effectiveLifecycle: "CHANGES_REQUESTED",
  submissionRevision: 2,
  history: [{
    id: "event-note",
    action: "CHANGES_REQUESTED",
    fromLifecycle: "PENDING_GD_APPROVAL",
    toLifecycle: "CHANGES_REQUESTED",
    submissionRevision: 2,
    semanticFingerprint: "fingerprint-submitted",
    semanticDefinition: custom,
    semanticSnapshotStatus: "VALID",
    selectedTier: null,
    actorUserId: "hidden-actor-id",
    notes: "Clarify who can satisfy this condition.",
    createdAt: "2026-07-17T10:00:00.000Z",
  }],
});
equal(getLatestPlayerFacingRestrictionReviewNote(changes), "Clarify who can satisfy this condition.", "Latest nonblank player-facing note is selected.");
check(formatRestrictionGovernanceSummary({ definition: custom, entry: changes }).includes("Changes Requested"), "Changes Requested summary is visible.");
const stale = entry("SIGNATURE_MOVE", "signature-stable", {
  governanceId: "governance-stale",
  synthetic: false,
  storedLifecycle: "APPROVED",
  effectiveLifecycle: "APPROVAL_STALE",
  approvalCurrent: false,
  selectedTier: "MATERIAL_LIMITATION",
  approvedFingerprint: "fingerprint-old",
  approvedProposalMatchesLiveDefinition: false,
});
check(hasSavedApprovedRestrictionMismatch(stale), "Approved saved mismatch is detectable.");
check(formatRestrictionGovernanceSummary({ definition: standard, entry: stale }).includes("Approval Stale"), "Effective Stale is displayed.");
const pendingMismatch = { ...pending, submittedProposalMatchesLiveDefinition: false };
check(hasPendingRestrictionProposalMismatch(pendingMismatch), "Pending immutable/live mismatch is detectable.");
const orphan = entry("PLAYER_POWER", "orphaned", {
  governanceId: "governance-orphaned",
  synthetic: false,
  consumerPresence: "ABSENT",
  currentSemanticRestriction: null,
  currentFingerprint: null,
});
equal(orphan.consumerPresence, "ABSENT", "Orphaned history remains representable.");
equal(formatRestrictionGovernanceSummary({ definition: null, entry: orphan }), "No Restriction — approval not required", "No Restriction never manufactures approval.");
check(hasUnsavedApprovedRestrictionMismatch(approved, "fingerprint-local-change"), "Approved local unsaved semantic change is detectable.");
equal(hasUnsavedApprovedRestrictionMismatch(approved, "fingerprint-live"), false, "Matching local approval does not warn.");

const restrictedReady = deriveCharacterRestrictionGovernanceReadiness({
  model: { ...model, governance: [approved] },
  loadError: null,
  consumers: [{
    consumerType: "PLAYER_POWER",
    consumerId: "power-stable",
    consumerName: "Ready Power",
    hasSemanticRestriction: true,
    semanticValid: true,
    ordinaryValidationPasses: true,
    localFingerprint: "fingerprint-live",
  }],
});
equal(restrictedReady.ready, true, "Current Approved Restriction satisfies governance readiness without economics.");
const pendingReadiness = deriveCharacterRestrictionGovernanceReadiness({
  model: { ...model, governance: [pending] },
  loadError: null,
  consumers: [{
    consumerType: "PLAYER_POWER",
    consumerId: "power-stable",
    consumerName: "Pending Power",
    hasSemanticRestriction: true,
    semanticValid: true,
    ordinaryValidationPasses: true,
    localFingerprint: "fingerprint-live",
  }],
});
equal(pendingReadiness.ready, false, "Pending Restriction is not table-ready.");
check(pendingReadiness.issues.some((issue) => issue.includes("Pending Game Director Approval")), "Pending readiness reason is visible.");
const unrestrictedReady = deriveCharacterRestrictionGovernanceReadiness({
  model: null,
  loadError: "offline",
  consumers: [{
    consumerType: "PLAYER_POWER",
    consumerId: "unrestricted",
    consumerName: "Unrestricted Power",
    hasSemanticRestriction: false,
    semanticValid: true,
    ordinaryValidationPasses: true,
    localFingerprint: null,
  }],
});
equal(unrestrictedReady.ready, true, "Valid unrestricted content needs no governance proof.");

const pagePath = "app/campaign/[id]/characters/[characterId]/builder/page.tsx";
const panelPath = "app/components/restrictions/PlayerRestrictionGovernancePanel.tsx";
const serverPath = "lib/restrictions/governanceServer.ts";
const routePath = "app/api/campaigns/[id]/characters/[characterId]/builder/route.ts";
const page = readFileSync(pagePath, "utf8");
const panel = readFileSync(panelPath, "utf8");
const server = readFileSync(serverPath, "utf8");
const route = readFileSync(routePath, "utf8");
const saveSubmitStart = page.indexOf("async function handleSaveAndSubmitRestriction");
const saveSubmitEnd = page.indexOf("const editorPanel", saveSubmitStart);
const saveSubmit = page.slice(saveSubmitStart, saveSubmitEnd);
const governanceLoaderStart = page.indexOf("async function loadGovernance");
const governanceLoaderEnd = page.indexOf("async function loadBuilder", governanceLoaderStart);
const governanceLoader = page.slice(governanceLoaderStart, governanceLoaderEnd);

check(page.includes("restriction-governance`"), "Builder uses the dedicated governance endpoint.");
check(page.includes("await loadGovernance();"), "Builder reloads governance after authoritative refreshes.");
check(saveSubmit.indexOf("await saveCharacterDraft()") < saveSubmit.indexOf("fetch(governanceApiUrl"), "Save succeeds before submit begins.");
check(saveSubmit.includes("rehydratePlayerPowerRestrictionDrafts") === false, "Submission delegates authoritative rehydration to reusable save operation.");
check(page.includes("rehydratePlayerPowerRestrictionDrafts(savedDraft.builderData)"), "Reusable save rehydrates authoritative Power IDs and fields.");
check(page.includes("rehydrateRoleplayAbilityRestrictionStates(savedDraft.builderData)"), "Reusable save rehydrates authoritative Roleplay IDs and fields.");
check(saveSubmit.indexOf("buildPlayerRestrictionGovernanceEntryMap") < saveSubmit.indexOf("expectedSubmissionRevision"), "Submission resolves the post-save entry before reading revision.");
check(saveSubmit.includes("expectedSubmissionRevision: authoritativeEntry.submissionRevision"), "Submission uses authoritative current revision.");
check(!/submittedDefinition|semanticSnapshot|submittedFingerprint|approvedFingerprint/u.test(saveSubmit), "Client submits no semantic snapshot or fingerprint.");
check(page.includes("replacePlayerRestrictionGovernanceEntry"), "Successful submit updates returned governance immediately.");
check(saveSubmit.includes("await loadGovernance();"), "Successful submission reloads governance for final consistency.");
check(saveSubmit.includes('res.status === 409'), "Revision conflict is recognized.");
check(saveSubmit.includes("await loadGovernance();") && !saveSubmit.includes("retry"), "Revision conflict reloads without automatic retry.");
check(!governanceLoader.includes("setDraft("), "Governance load failure cannot erase the Character draft.");
check(page.includes("governanceLoadError"), "Governance load failure has independent warning state.");
equal((page.match(/<PlayerRestrictionGovernancePanel/gu) ?? []).length, 2, "Reusable panel has one shared Power/Signature site and one Roleplay site.");
check(page.includes('consumerType="ROLEPLAY_ABILITY"'), "Roleplay panel uses explicit stable consumer type.");
check(page.includes('governanceConsumerType') && page.includes('"SIGNATURE_MOVE"'), "Power renderer distinguishes ordinary and Signature consumers.");
check(page.includes("formatRestrictionGovernanceSummary"), "Collapsed summaries include effective lifecycle.");
check(page.indexOf("<PlayerRestrictionGovernancePanel", page.indexOf("character-power-whole-restriction-editor")) < page.indexOf("Primary Packet"), "Power governance panel follows whole-Power Restriction editor.");
check(page.indexOf("<PlayerRestrictionGovernancePanel", page.indexOf("roleplay-ability-whole-restriction-editor")) < page.indexOf("{warnings.length", page.indexOf("roleplay-ability-whole-restriction-editor")), "Roleplay governance panel follows whole-Ability Restriction editor.");
check(panel.includes("No Restriction — approval not required"), "No-Restriction UI is explicit.");
check(panel.includes("Pending Game Director Approval") || panel.includes("getRestrictionLifecycleDisplayLabel"), "Pending status is presented.");
check(panel.includes("immutable submitted proposal"), "Pending UI preserves immutable proposal wording.");
check(panel.includes("Approval is blocked until the current version can be resubmitted"), "Pending mismatch warning is prominent.");
check(panel.includes("Game Director note:"), "Changes Requested note is prominent.");
check(panel.includes("Save and Resubmit for GD Approval"), "Changes Requested resubmit action is present.");
check(panel.includes("Save and Submit Revised Restriction"), "Stale resubmit action is present.");
check(panel.includes("Unsaved local change"), "Approved local change warning is present.");
check(panel.includes("Economic credit is not active yet"), "Approved UI states economics are inactive.");
check(panel.includes("Governance history"), "Compact expandable history is present.");
check(!panel.includes("actorUserId"), "Panel never displays raw actor UUIDs.");
check(!panel.includes("resolvePlayerPowerDrawbackEconomics"), "Panel applies no economic resolver.");
check(!page.includes("resolvePlayerPowerDrawbackEconomics"), "Builder applies no economic resolver.");
check(!page.includes("/approve") && !page.includes("/request-changes"), "Builder exposes no GD review action routes.");
check(!panel.includes(">Approve<") && !panel.includes(">Request Changes<"), "Panel exposes no Approve or Request Changes buttons.");
check(page.includes("blockingSaveErrors.length === 0"), "Save enablement uses save-blocking errors only.");
check(page.includes("readinessOnlyErrors"), "Readiness-only errors are separately displayed.");
check(route.includes("grossBudgetReadiness"), "PATCH response exposes derived gross readiness.");
check(server.includes('from "@/lib/restrictions/governanceView"'), "Server reuses the shared serializable view contract.");
check(!server.includes("export type PlayerRestrictionGovernanceReadEntry"), "Server-only module no longer duplicates the view contract.");

console.log(`Restriction governance Builder UI static smoke passed (${checks} checks).`);
