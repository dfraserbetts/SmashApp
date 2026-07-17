import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MONSTER_RESTRICTION_CONSUMER,
  PLAYER_RESTRICTION_CONSUMERS,
  RESTRICTION_CONSUMER_LABELS,
  RESTRICTION_LIFECYCLE_LABELS,
  RESTRICTION_LIFECYCLE_ORDER,
  RESTRICTION_LIFECYCLE_STATES,
  RESTRICTION_PRINT_OMISSION_LABELS,
  RESTRICTION_QUALIFICATION_DOCTRINE,
  RESTRICTION_TIER_LABELS,
  RESTRICTION_TIER_ORDER,
  RESTRICTION_TIER_QUALIFICATION_SUMMARIES,
  RESTRICTION_TIERS,
  consumerSupportsNumericRestrictionCredit,
  evaluateRestrictionReadiness,
  isPlayerRestrictionConsumer,
  projectRestrictionPrintableContent,
  restrictionReviewActionRequiresNotes,
  restrictionReviewActionRequiresTier,
  staleApprovedRestrictionOnFingerprintChange,
  type RestrictionLifecycleState,
  type RestrictionPrintableEntry,
  type RestrictionReadinessFacts,
} from "../lib/restrictions/governance";

let checks = 0;

function check(condition: unknown, message: string): asserts condition {
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

deepEqual(
  RESTRICTION_LIFECYCLE_STATES,
  ["DRAFT", "PENDING_GD_APPROVAL", "APPROVED", "CHANGES_REQUESTED", "APPROVAL_STALE"],
  "Lifecycle keys are exact and ordered.",
);
deepEqual(
  RESTRICTION_LIFECYCLE_LABELS,
  {
    DRAFT: "Draft",
    PENDING_GD_APPROVAL: "Pending Game Director Approval",
    APPROVED: "Approved",
    CHANGES_REQUESTED: "Changes Requested",
    APPROVAL_STALE: "Approval Stale",
  },
  "Lifecycle labels are exact and do not expose Rejected as the player-facing state.",
);
deepEqual(
  RESTRICTION_LIFECYCLE_STATES.map((state) => RESTRICTION_LIFECYCLE_ORDER[state]),
  [0, 1, 2, 3, 4],
  "Lifecycle ordering is deterministic.",
);

deepEqual(
  PLAYER_RESTRICTION_CONSUMERS,
  ["PLAYER_POWER", "SIGNATURE_MOVE", "ROLEPLAY_ABILITY"],
  "Player-authored consumer keys are exact.",
);
equal(MONSTER_RESTRICTION_CONSUMER, "MONSTER_POWER", "Monster consumer is defined separately.");
deepEqual(
  RESTRICTION_CONSUMER_LABELS,
  {
    PLAYER_POWER: "Player Power",
    SIGNATURE_MOVE: "Signature Move",
    ROLEPLAY_ABILITY: "Roleplay Ability",
    MONSTER_POWER: "Monster Power",
  },
  "Consumer labels are deterministic.",
);
check(isPlayerRestrictionConsumer("PLAYER_POWER"), "Player Power enters player governance.");
check(isPlayerRestrictionConsumer("SIGNATURE_MOVE"), "Signature Move enters player governance.");
check(isPlayerRestrictionConsumer("ROLEPLAY_ABILITY"), "Roleplay Ability enters player governance.");
check(!isPlayerRestrictionConsumer("MONSTER_POWER"), "Monster Power stays outside player governance.");
check(consumerSupportsNumericRestrictionCredit("PLAYER_POWER"), "Player Power supports future numeric credit.");
check(consumerSupportsNumericRestrictionCredit("SIGNATURE_MOVE"), "Signature Move supports future numeric credit.");
check(!consumerSupportsNumericRestrictionCredit("ROLEPLAY_ABILITY"), "Roleplay has no numeric credit.");
check(!consumerSupportsNumericRestrictionCredit("MONSTER_POWER"), "Monster has no numeric credit.");

deepEqual(
  RESTRICTION_TIERS,
  ["MATERIAL_LIMITATION", "SUBSTANTIAL_LIMITATION", "NARROW_AVAILABILITY", "OATH_LIMITATION"],
  "All four tier keys and their severity order are exact.",
);
deepEqual(
  RESTRICTION_TIER_LABELS,
  {
    MATERIAL_LIMITATION: "Material Limitation",
    SUBSTANTIAL_LIMITATION: "Substantial Limitation",
    NARROW_AVAILABILITY: "Narrow Availability",
    OATH_LIMITATION: "Oath Limitation",
  },
  "All four tier labels are exact.",
);
deepEqual(
  RESTRICTION_TIERS.map((tier) => RESTRICTION_TIER_ORDER[tier]),
  [0, 1, 2, 3],
  "Tier ordering is deterministic.",
);
deepEqual(
  RESTRICTION_TIER_QUALIFICATION_SUMMARIES.MATERIAL_LIMITATION,
  [
    "Removes use in a recurring, plausible class of scenes.",
    "Or imposes a meaningful precondition that cannot routinely be ignored.",
    "Must create real occasions where the player wishes the Restriction did not exist.",
  ],
  "Material qualification is exact.",
);
deepEqual(
  RESTRICTION_TIER_QUALIFICATION_SUMMARIES.SUBSTANTIAL_LIMITATION,
  [
    "Removes use across a broad, strategically relevant context.",
    "Or requires costly, risky, uncertain, or time-sensitive setup that frequently changes decisions.",
  ],
  "Substantial qualification is exact.",
);
deepEqual(
  RESTRICTION_TIER_QUALIFICATION_SUMMARIES.NARROW_AVAILABILITY,
  [
    "The Power or Ability is normally unavailable.",
    "It becomes usable only under distinctly limited circumstances.",
    "Those circumstances cannot be arranged routinely by the player or allies.",
  ],
  "Narrow qualification is exact.",
);
deepEqual(
  RESTRICTION_TIER_QUALIFICATION_SUMMARIES.OATH_LIMITATION,
  [
    "The Power or Ability is expected to become eligible only approximately two or three times across an entire campaign.",
    "Eligibility is tied to a defining oath, sacrifice, identity, relationship, revelation, event, or campaign-level circumstance.",
    "Normal player or ally preparation cannot make it routinely available.",
    "The condition has real narrative consequences and mechanical scarcity.",
    "The GD must explicitly judge the campaign prevalence and enforceability.",
    "Dramatic wording alone does not qualify.",
  ],
  "Oath qualification is exact.",
);
check(RESTRICTION_QUALIFICATION_DOCTRINE.reliableEnabling.includes("routine or trivial enabling removes qualification"), "Reliable enabling doctrine is explicit.");
check(RESTRICTION_QUALIFICATION_DOCTRINE.gdControlledConditions.includes("expected actual campaign prevalence"), "GD-controlled classification uses actual prevalence.");
check(RESTRICTION_QUALIFICATION_DOCTRINE.noQualification.startsWith("Cosmetic, guaranteed"), "Cosmetic conditions receive no tier.");
check(RESTRICTION_QUALIFICATION_DOCTRINE.sharedStandard.includes("identical qualification standards"), "Structured and Fully Custom share one standard.");

check(restrictionReviewActionRequiresTier("APPROVE_AND_APPLY_TIER"), "Approval requires a tier.");
check(!restrictionReviewActionRequiresTier("REQUEST_CHANGES"), "Request Changes does not require a tier.");
check(restrictionReviewActionRequiresNotes("REQUEST_CHANGES"), "Request Changes requires notes.");
check(!restrictionReviewActionRequiresNotes("APPROVE_AND_APPLY_TIER"), "Approval notes are optional.");

const baseFacts: RestrictionReadinessFacts = {
  consumer: "PLAYER_POWER",
  hasSemanticRestriction: true,
  lifecycleState: "DRAFT",
  fingerprintMatches: true,
  economicResolutionCurrent: false,
  semanticIntegrity: "VALID",
  ordinaryValidationPasses: true,
  authoritativeBudgetPasses: false,
};

const unrestricted = evaluateRestrictionReadiness({
  ...baseFacts,
  hasSemanticRestriction: false,
  lifecycleState: null,
  authoritativeBudgetPasses: true,
});
check(unrestricted.canSaveDurableDraft, "Valid unrestricted content can save.");
check(unrestricted.contentTableReady, "Valid budget-compliant unrestricted content is table-ready.");
check(unrestricted.contentPrintEligible, "Unrestricted content needs no Restriction approval to print.");
check(!unrestricted.creditActive, "Unrestricted content has no Restriction credit.");

const unrestrictedOverspent = evaluateRestrictionReadiness({
  ...baseFacts,
  hasSemanticRestriction: false,
  lifecycleState: null,
});
check(unrestrictedOverspent.canSaveDurableDraft, "Gross-overspent unrestricted draft can persist.");
check(!unrestrictedOverspent.contentTableReady, "Gross-overspent unrestricted content is not table-ready.");

const draft = evaluateRestrictionReadiness(baseFacts);
check(draft.canSaveDurableDraft, "Gross-overspent restricted Draft can persist.");
check(draft.canSubmitRestriction, "Valid Draft Restriction can submit.");
check(!draft.creditActive, "Draft receives no credit.");
check(!draft.contentTableReady, "Gross-overspent Draft is not table-ready.");
check(!draft.contentPrintEligible, "Draft restricted content is not printable.");

for (const state of [
  "PENDING_GD_APPROVAL",
  "CHANGES_REQUESTED",
  "APPROVAL_STALE",
] as const) {
  const policy = evaluateRestrictionReadiness({ ...baseFacts, lifecycleState: state });
  check(policy.canSaveDurableDraft, `${state} can persist.`);
  check(!policy.creditActive, `${state} receives no credit.`);
  check(!policy.contentTableReady, `${state} is not table-ready.`);
  check(!policy.contentPrintEligible, `${state} is not printable.`);
}
check(
  evaluateRestrictionReadiness({ ...baseFacts, lifecycleState: "CHANGES_REQUESTED" }).canSubmitRestriction,
  "Changes Requested can resubmit after correction.",
);
check(
  evaluateRestrictionReadiness({ ...baseFacts, lifecycleState: "APPROVAL_STALE" }).canSubmitRestriction,
  "Stale approval can resubmit after correction.",
);

const approved = evaluateRestrictionReadiness({
  ...baseFacts,
  lifecycleState: "APPROVED",
  economicResolutionCurrent: true,
  authoritativeBudgetPasses: true,
});
check(approved.approvalCurrent, "Matching Approved governance is current.");
check(approved.creditActive, "Approved current Player Power credit is active.");
check(approved.contentTableReady, "Approved Net-budget-valid content is table-ready.");
check(approved.contentPrintEligible, "Approved current restricted content is printable.");

const approvedOverspent = evaluateRestrictionReadiness({
  ...baseFacts,
  lifecycleState: "APPROVED",
  economicResolutionCurrent: true,
});
check(!approvedOverspent.contentTableReady, "Approved Net-budget-invalid content is not table-ready.");
check(approvedOverspent.contentPrintEligible, "Content approval remains current independently of whole-build budget readiness.");

const obsoleteEconomics = evaluateRestrictionReadiness({
  ...baseFacts,
  lifecycleState: "APPROVED",
  economicResolutionCurrent: false,
  authoritativeBudgetPasses: true,
});
check(!obsoleteEconomics.creditActive, "Obsolete economic resolution suspends credit.");
check(!obsoleteEconomics.contentTableReady, "Costed content with obsolete economics is not table-ready.");

const approvedRoleplay = evaluateRestrictionReadiness({
  ...baseFacts,
  consumer: "ROLEPLAY_ABILITY",
  lifecycleState: "APPROVED",
  authoritativeBudgetPasses: true,
});
check(!approvedRoleplay.creditActive, "Approved Roleplay produces no numeric credit.");
check(approvedRoleplay.contentTableReady, "Approved valid Roleplay can be table-ready without economics.");
check(approvedRoleplay.contentPrintEligible, "Approved valid Roleplay is printable.");

const monster = evaluateRestrictionReadiness({
  ...baseFacts,
  consumer: "MONSTER_POWER",
  lifecycleState: "APPROVED",
  fingerprintMatches: true,
  economicResolutionCurrent: true,
  authoritativeBudgetPasses: true,
});
check(monster.outsidePlayerGovernance, "Monster is outside player governance.");
check(!monster.canSubmitRestriction, "Monster does not enter the player approval queue.");
check(!monster.creditActive, "Monster receives no credit.");
check(!monster.contentTableReady && !monster.contentPrintEligible, "Monster is outside player readiness and print policy.");

for (const semanticIntegrity of ["MALFORMED", "UNRESOLVED_LEGACY_REVIEW"] as const) {
  const invalid = evaluateRestrictionReadiness({ ...baseFacts, semanticIntegrity });
  check(!invalid.canSaveDurableDraft, `${semanticIntegrity} blocks durable save.`);
  check(!invalid.canSubmitRestriction, `${semanticIntegrity} cannot submit.`);
  check(!invalid.creditActive, `${semanticIntegrity} receives no credit.`);
  check(!invalid.contentTableReady, `${semanticIntegrity} is not ready.`);
  check(!invalid.contentPrintEligible, `${semanticIntegrity} is not printable.`);
}

const stale = staleApprovedRestrictionOnFingerprintChange({
  lifecycleState: "APPROVED",
  approvedFingerprint: "approved-fingerprint",
  currentFingerprint: "edited-fingerprint",
});
equal(stale.lifecycleState, "APPROVAL_STALE", "Fingerprint mismatch makes Approved governance stale.");
check(!stale.fingerprintMatches, "Fingerprint mismatch is explicit.");
check(stale.creditSuspended, "Fingerprint mismatch suspends credit immediately.");
equal(
  staleApprovedRestrictionOnFingerprintChange({
    lifecycleState: "APPROVED",
    approvedFingerprint: "same",
    currentFingerprint: "same",
  }).lifecycleState,
  "APPROVED",
  "Matching fingerprint preserves Approved governance.",
);

function printable(
  id: string,
  lifecycleState: RestrictionLifecycleState | null,
  overrides: Partial<RestrictionPrintableEntry> = {},
): RestrictionPrintableEntry {
  return {
    id,
    name: id,
    consumer: "PLAYER_POWER",
    hasSemanticRestriction: true,
    semanticIntegrity: "VALID",
    ordinaryValidationPasses: true,
    lifecycleState,
    fingerprintMatches: true,
    ...overrides,
  };
}

const projection = projectRestrictionPrintableContent([
  printable("unrestricted", null, { hasSemanticRestriction: false }),
  printable("approved", "APPROVED"),
  printable("draft", "DRAFT"),
  printable("pending", "PENDING_GD_APPROVAL"),
  printable("changes", "CHANGES_REQUESTED"),
  printable("stale", "APPROVAL_STALE"),
  printable("fingerprint-stale", "APPROVED", { fingerprintMatches: false }),
  printable("malformed", "DRAFT", { semanticIntegrity: "MALFORMED" }),
  printable("legacy", "DRAFT", { semanticIntegrity: "UNRESOLVED_LEGACY_REVIEW" }),
  printable("missing-governance", null),
]);
deepEqual(
  projection.included.map((entry) => [entry.entry.id, entry.inclusion]),
  [["unrestricted", "UNRESTRICTED"], ["approved", "APPROVED_RESTRICTED"]],
  "Projection includes unrestricted and current Approved restricted content in source order.",
);
deepEqual(
  projection.omitted.map((entry) => [entry.entry.id, entry.omissionReason]),
  [
    ["draft", "DRAFT_RESTRICTION"],
    ["pending", "PENDING_GD_APPROVAL"],
    ["changes", "CHANGES_REQUESTED"],
    ["stale", "APPROVAL_STALE"],
    ["fingerprint-stale", "APPROVAL_STALE"],
    ["malformed", "MALFORMED_RESTRICTION"],
    ["legacy", "UNRESOLVED_LEGACY_RESTRICTION"],
    ["missing-governance", "MISSING_GOVERNANCE_RECORD"],
  ],
  "Projection returns every required deterministic omission reason.",
);
for (const entry of projection.omitted) {
  check(
    Boolean(entry.omissionReason && RESTRICTION_PRINT_OMISSION_LABELS[entry.omissionReason]),
    `${entry.entry.id} has a future-UI-safe omission label.`,
  );
}

const printSource = readFileSync(
  "app/campaign/[id]/characters/[characterId]/print/CharacterPrintMode.tsx",
  "utf8",
);
const sheetSource = readFileSync(
  "app/campaign/[id]/characters/[characterId]/components/CharacterSheetPreview.tsx",
  "utf8",
);
check(printSource.includes("powers: payload.character.builderData.powers"), "Current print budget still receives raw Power builderData.");
check(printSource.includes("payload.character.builderData.signatureMove ?"), "Current print budget still receives raw Signature Move builderData.");
check(printSource.includes("builderData={payload.character.builderData}"), "CharacterSheetPreview still receives raw builderData.");
check(printSource.includes("powerBudget={powerBudget}"), "CharacterSheetPreview still receives the raw-content Power budget.");
check(sheetSource.includes("powerBudget.powers.map"), "PowerReferenceSheet still renders the supplied unprojected Power budget.");
check(!printSource.includes("projectRestrictionPrintableContent"), "Phase 4A2 does not integrate print filtering prematurely.");

console.log(`Restriction governance domain smoke passed (${checks} checks).`);
