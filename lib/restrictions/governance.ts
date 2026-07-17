export const RESTRICTION_LIFECYCLE_STATES = [
  "DRAFT",
  "PENDING_GD_APPROVAL",
  "APPROVED",
  "CHANGES_REQUESTED",
  "APPROVAL_STALE",
] as const;

export type RestrictionLifecycleState =
  (typeof RESTRICTION_LIFECYCLE_STATES)[number];

export const RESTRICTION_LIFECYCLE_LABELS: Readonly<
  Record<RestrictionLifecycleState, string>
> = {
  DRAFT: "Draft",
  PENDING_GD_APPROVAL: "Pending Game Director Approval",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes Requested",
  APPROVAL_STALE: "Approval Stale",
};

export const RESTRICTION_LIFECYCLE_ORDER: Readonly<
  Record<RestrictionLifecycleState, number>
> = Object.fromEntries(
  RESTRICTION_LIFECYCLE_STATES.map((state, index) => [state, index]),
) as Record<RestrictionLifecycleState, number>;

export const PLAYER_RESTRICTION_CONSUMERS = [
  "PLAYER_POWER",
  "SIGNATURE_MOVE",
  "ROLEPLAY_ABILITY",
] as const;

export type PlayerRestrictionConsumer =
  (typeof PLAYER_RESTRICTION_CONSUMERS)[number];

export const MONSTER_RESTRICTION_CONSUMER = "MONSTER_POWER" as const;
export type MonsterRestrictionConsumer = typeof MONSTER_RESTRICTION_CONSUMER;
export type RestrictionConsumer =
  | PlayerRestrictionConsumer
  | MonsterRestrictionConsumer;

export const RESTRICTION_CONSUMER_LABELS: Readonly<
  Record<RestrictionConsumer, string>
> = {
  PLAYER_POWER: "Player Power",
  SIGNATURE_MOVE: "Signature Move",
  ROLEPLAY_ABILITY: "Roleplay Ability",
  MONSTER_POWER: "Monster Power",
};

export const RESTRICTION_TIERS = [
  "MATERIAL_LIMITATION",
  "SUBSTANTIAL_LIMITATION",
  "NARROW_AVAILABILITY",
  "OATH_LIMITATION",
] as const;

export type RestrictionTier = (typeof RESTRICTION_TIERS)[number];

export const RESTRICTION_TIER_LABELS: Readonly<Record<RestrictionTier, string>> = {
  MATERIAL_LIMITATION: "Material Limitation",
  SUBSTANTIAL_LIMITATION: "Substantial Limitation",
  NARROW_AVAILABILITY: "Narrow Availability",
  OATH_LIMITATION: "Oath Limitation",
};

export const RESTRICTION_TIER_ORDER: Readonly<Record<RestrictionTier, number>> =
  Object.fromEntries(
    RESTRICTION_TIERS.map((tier, index) => [tier, index]),
  ) as Record<RestrictionTier, number>;

export const RESTRICTION_TIER_QUALIFICATION_SUMMARIES: Readonly<
  Record<RestrictionTier, readonly string[]>
> = {
  MATERIAL_LIMITATION: [
    "Removes use in a recurring, plausible class of scenes.",
    "Or imposes a meaningful precondition that cannot routinely be ignored.",
    "Must create real occasions where the player wishes the Restriction did not exist.",
  ],
  SUBSTANTIAL_LIMITATION: [
    "Removes use across a broad, strategically relevant context.",
    "Or requires costly, risky, uncertain, or time-sensitive setup that frequently changes decisions.",
  ],
  NARROW_AVAILABILITY: [
    "The Power or Ability is normally unavailable.",
    "It becomes usable only under distinctly limited circumstances.",
    "Those circumstances cannot be arranged routinely by the player or allies.",
  ],
  OATH_LIMITATION: [
    "The Power or Ability is expected to become eligible only approximately two or three times across an entire campaign.",
    "Eligibility is tied to a defining oath, sacrifice, identity, relationship, revelation, event, or campaign-level circumstance.",
    "Normal player or ally preparation cannot make it routinely available.",
    "The condition has real narrative consequences and mechanical scarcity.",
    "The GD must explicitly judge the campaign prevalence and enforceability.",
    "Dramatic wording alone does not qualify.",
  ],
};

export const RESTRICTION_QUALIFICATION_DOCTRINE = {
  reliableEnabling:
    "Reliable player or ally enabling reduces qualification according to remaining cost, risk, action tax, uncertainty, timing, and opportunity cost; routine or trivial enabling removes qualification.",
  gdControlledConditions:
    "GD-controlled conditions are classified using expected actual campaign prevalence and are not severe merely because the GD has discretion.",
  noQualification:
    "Cosmetic, guaranteed, irrelevant, or routinely self-satisfied conditions do not qualify for any tier.",
  sharedStandard:
    "Standard Structured and Fully Custom Restrictions use identical qualification standards.",
} as const;

export const RESTRICTION_REVIEW_ACTIONS = [
  "APPROVE_AND_APPLY_TIER",
  "REQUEST_CHANGES",
] as const;

export type RestrictionReviewAction =
  (typeof RESTRICTION_REVIEW_ACTIONS)[number];

export function restrictionReviewActionRequiresTier(
  action: RestrictionReviewAction,
): boolean {
  return action === "APPROVE_AND_APPLY_TIER";
}

export function restrictionReviewActionRequiresNotes(
  action: RestrictionReviewAction,
): boolean {
  return action === "REQUEST_CHANGES";
}

export function isPlayerRestrictionConsumer(
  consumer: RestrictionConsumer,
): consumer is PlayerRestrictionConsumer {
  return (PLAYER_RESTRICTION_CONSUMERS as readonly string[]).includes(consumer);
}

export function consumerSupportsNumericRestrictionCredit(
  consumer: RestrictionConsumer,
): consumer is "PLAYER_POWER" | "SIGNATURE_MOVE" {
  return consumer === "PLAYER_POWER" || consumer === "SIGNATURE_MOVE";
}

export type RestrictionSemanticIntegrity =
  | "VALID"
  | "MALFORMED"
  | "UNRESOLVED_LEGACY_REVIEW";

export type RestrictionApprovalCurrentFacts = {
  hasSemanticRestriction: boolean;
  lifecycleState: RestrictionLifecycleState | null;
  fingerprintMatches: boolean;
};

export function isRestrictionApprovalCurrent(
  facts: RestrictionApprovalCurrentFacts,
): boolean {
  return facts.hasSemanticRestriction &&
    facts.lifecycleState === "APPROVED" &&
    facts.fingerprintMatches;
}

export type RestrictionCreditActivityFacts = RestrictionApprovalCurrentFacts & {
  consumer: RestrictionConsumer;
  economicResolutionCurrent: boolean;
};

export function isRestrictionCreditActive(
  facts: RestrictionCreditActivityFacts,
): boolean {
  return consumerSupportsNumericRestrictionCredit(facts.consumer) &&
    isRestrictionApprovalCurrent(facts) &&
    facts.economicResolutionCurrent;
}

export type RestrictionReadinessFacts = RestrictionCreditActivityFacts & {
  semanticIntegrity: RestrictionSemanticIntegrity;
  ordinaryValidationPasses: boolean;
  authoritativeBudgetPasses: boolean;
};

export type RestrictionReadinessPolicy = Readonly<{
  outsidePlayerGovernance: boolean;
  canSaveDurableDraft: boolean;
  canSubmitRestriction: boolean;
  approvalCurrent: boolean;
  creditActive: boolean;
  contentTableReady: boolean;
  contentPrintEligible: boolean;
}>;

export function evaluateRestrictionReadiness(
  facts: RestrictionReadinessFacts,
): RestrictionReadinessPolicy {
  const outsidePlayerGovernance = !isPlayerRestrictionConsumer(facts.consumer);
  const semanticDataValid = facts.semanticIntegrity === "VALID";
  const approvalCurrent = isRestrictionApprovalCurrent(facts);
  const creditActive = isRestrictionCreditActive(facts);
  const canSaveDurableDraft = semanticDataValid;
  const canSubmitRestriction = !outsidePlayerGovernance &&
    semanticDataValid &&
    facts.hasSemanticRestriction &&
    (
      facts.lifecycleState === "DRAFT" ||
      facts.lifecycleState === "CHANGES_REQUESTED" ||
      facts.lifecycleState === "APPROVAL_STALE"
    );

  const unrestrictedReady = !facts.hasSemanticRestriction &&
    semanticDataValid &&
    facts.ordinaryValidationPasses &&
    facts.authoritativeBudgetPasses;
  const approvedRestrictedReady = approvalCurrent &&
    semanticDataValid &&
    facts.ordinaryValidationPasses &&
    facts.authoritativeBudgetPasses &&
    (
      facts.consumer === "ROLEPLAY_ABILITY" ||
      creditActive
    );
  const contentTableReady = !outsidePlayerGovernance &&
    (unrestrictedReady || approvedRestrictedReady);

  const contentPrintEligible = !outsidePlayerGovernance &&
    semanticDataValid &&
    facts.ordinaryValidationPasses &&
    (
      !facts.hasSemanticRestriction ||
      approvalCurrent
    );

  return Object.freeze({
    outsidePlayerGovernance,
    canSaveDurableDraft,
    canSubmitRestriction,
    approvalCurrent,
    creditActive,
    contentTableReady,
    contentPrintEligible,
  });
}

export type RestrictionFingerprintChangeResult = Readonly<{
  fingerprintMatches: boolean;
  lifecycleState: RestrictionLifecycleState;
  creditSuspended: boolean;
}>;

export function staleApprovedRestrictionOnFingerprintChange(params: {
  lifecycleState: RestrictionLifecycleState;
  approvedFingerprint: string;
  currentFingerprint: string;
}): RestrictionFingerprintChangeResult {
  const fingerprintMatches = params.approvedFingerprint === params.currentFingerprint;
  const lifecycleState = params.lifecycleState === "APPROVED" && !fingerprintMatches
    ? "APPROVAL_STALE"
    : params.lifecycleState;

  return Object.freeze({
    fingerprintMatches,
    lifecycleState,
    creditSuspended: lifecycleState !== "APPROVED",
  });
}

export const RESTRICTION_PRINT_OMISSION_REASONS = [
  "DRAFT_RESTRICTION",
  "PENDING_GD_APPROVAL",
  "CHANGES_REQUESTED",
  "APPROVAL_STALE",
  "MALFORMED_RESTRICTION",
  "UNRESOLVED_LEGACY_RESTRICTION",
  "MISSING_GOVERNANCE_RECORD",
  "ORDINARY_VALIDATION_FAILED",
] as const;

export type RestrictionPrintOmissionReason =
  (typeof RESTRICTION_PRINT_OMISSION_REASONS)[number];

export const RESTRICTION_PRINT_OMISSION_LABELS: Readonly<
  Record<RestrictionPrintOmissionReason, string>
> = {
  DRAFT_RESTRICTION: "Restriction is still a Draft.",
  PENDING_GD_APPROVAL: "Restriction is Pending Game Director Approval.",
  CHANGES_REQUESTED: "Changes have been requested for this Restriction.",
  APPROVAL_STALE: "Restriction approval is stale.",
  MALFORMED_RESTRICTION: "Restriction data is malformed.",
  UNRESOLVED_LEGACY_RESTRICTION: "Legacy Restriction data still requires review.",
  MISSING_GOVERNANCE_RECORD: "Restriction governance record is missing.",
  ORDINARY_VALIDATION_FAILED: "Content fails ordinary validation.",
};

export type RestrictionPrintableEntry = {
  id: string;
  name: string;
  consumer: PlayerRestrictionConsumer;
  hasSemanticRestriction: boolean;
  semanticIntegrity: RestrictionSemanticIntegrity;
  ordinaryValidationPasses: boolean;
  lifecycleState: RestrictionLifecycleState | null;
  fingerprintMatches: boolean;
};

export type RestrictionPrintProjectionEntry = Readonly<{
  entry: RestrictionPrintableEntry;
  inclusion: "UNRESTRICTED" | "APPROVED_RESTRICTED" | null;
  omissionReason: RestrictionPrintOmissionReason | null;
}>;

function classifyRestrictionPrintEntry(
  entry: RestrictionPrintableEntry,
): RestrictionPrintProjectionEntry {
  let inclusion: RestrictionPrintProjectionEntry["inclusion"] = null;
  let omissionReason: RestrictionPrintOmissionReason | null = null;

  if (entry.semanticIntegrity === "MALFORMED") {
    omissionReason = "MALFORMED_RESTRICTION";
  } else if (entry.semanticIntegrity === "UNRESOLVED_LEGACY_REVIEW") {
    omissionReason = "UNRESOLVED_LEGACY_RESTRICTION";
  } else if (!entry.ordinaryValidationPasses) {
    omissionReason = "ORDINARY_VALIDATION_FAILED";
  } else if (!entry.hasSemanticRestriction) {
    inclusion = "UNRESTRICTED";
  } else if (entry.lifecycleState === null) {
    omissionReason = "MISSING_GOVERNANCE_RECORD";
  } else if (entry.lifecycleState === "APPROVED" && !entry.fingerprintMatches) {
    omissionReason = "APPROVAL_STALE";
  } else if (entry.lifecycleState === "APPROVED") {
    inclusion = "APPROVED_RESTRICTED";
  } else {
    const lifecycleOmissionReasons: Readonly<Record<
      Exclude<RestrictionLifecycleState, "APPROVED">,
      RestrictionPrintOmissionReason
    >> = {
      DRAFT: "DRAFT_RESTRICTION",
      PENDING_GD_APPROVAL: "PENDING_GD_APPROVAL",
      CHANGES_REQUESTED: "CHANGES_REQUESTED",
      APPROVAL_STALE: "APPROVAL_STALE",
    };
    omissionReason = lifecycleOmissionReasons[entry.lifecycleState];
  }

  return Object.freeze({ entry, inclusion, omissionReason });
}

export type RestrictionPrintProjection = Readonly<{
  entries: readonly RestrictionPrintProjectionEntry[];
  included: readonly RestrictionPrintProjectionEntry[];
  omitted: readonly RestrictionPrintProjectionEntry[];
}>;

export function projectRestrictionPrintableContent(
  entries: readonly RestrictionPrintableEntry[],
): RestrictionPrintProjection {
  const classified = entries.map(classifyRestrictionPrintEntry);
  return Object.freeze({
    entries: Object.freeze(classified),
    included: Object.freeze(classified.filter((entry) => entry.inclusion !== null)),
    omitted: Object.freeze(classified.filter((entry) => entry.omissionReason !== null)),
  });
}
