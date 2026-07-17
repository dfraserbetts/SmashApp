import type {
  AbilityRestrictionDefinitionV1,
  RestrictionIssue,
} from "@/lib/restrictions";
import {
  RESTRICTION_LIFECYCLE_LABELS,
  RESTRICTION_TIER_LABELS,
  type PlayerRestrictionConsumer,
  type RestrictionLifecycleState,
  type RestrictionTier,
} from "@/lib/restrictions/governance";
import type {
  PlayerRestrictionConsumerPresence,
  PlayerRestrictionSemanticStatus,
} from "@/lib/restrictions/playerRestrictionConsumerResolver";

export type PlayerRestrictionGovernanceHistoryEntry = Readonly<{
  id: string;
  action: "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED" | "APPROVAL_STALE";
  fromLifecycle: RestrictionLifecycleState;
  toLifecycle: RestrictionLifecycleState;
  submissionRevision: number;
  semanticFingerprint: string;
  semanticDefinition: AbilityRestrictionDefinitionV1;
  semanticSnapshotStatus: "VALID" | "UNSUPPORTED";
  selectedTier: RestrictionTier | null;
  actorUserId: string;
  notes: string | null;
  createdAt: string;
}>;

export type PlayerRestrictionGovernanceReadEntry = Readonly<{
  governanceId: string | null;
  synthetic: boolean;
  consumerType: PlayerRestrictionConsumer;
  consumerId: string;
  consumerName: string | null;
  consumerIndex: number | null;
  consumerPresence: PlayerRestrictionConsumerPresence;
  semanticStatus: PlayerRestrictionSemanticStatus;
  currentSemanticRestriction: AbilityRestrictionDefinitionV1 | null;
  currentFingerprint: string | null;
  submittedDefinition: AbilityRestrictionDefinitionV1 | null;
  submittedSnapshotStatus: "VALID" | "UNSUPPORTED" | null;
  submittedFingerprint: string | null;
  approvedFingerprint: string | null;
  submittedProposalMatchesLiveDefinition: boolean | null;
  approvedProposalMatchesLiveDefinition: boolean | null;
  storedLifecycle: RestrictionLifecycleState | null;
  effectiveLifecycle: RestrictionLifecycleState;
  approvalCurrent: boolean;
  selectedTier: RestrictionTier | null;
  submissionRevision: number;
  submittedByUserId: string | null;
  submittedAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  history: readonly PlayerRestrictionGovernanceHistoryEntry[];
  diagnosticIssues: readonly RestrictionIssue[];
}>;

export type CharacterRestrictionGovernanceReadModel = Readonly<{
  campaignId: string;
  characterId: string;
  governance: readonly PlayerRestrictionGovernanceReadEntry[];
}>;

export function getPlayerRestrictionGovernanceEntryKey(
  consumerType: PlayerRestrictionConsumer,
  consumerId: string,
): string {
  return JSON.stringify([consumerType, consumerId.trim()]);
}

export function buildPlayerRestrictionGovernanceEntryMap(
  model: CharacterRestrictionGovernanceReadModel | null,
): ReadonlyMap<string, PlayerRestrictionGovernanceReadEntry> {
  return new Map(
    (model?.governance ?? []).map((entry) => [
      getPlayerRestrictionGovernanceEntryKey(entry.consumerType, entry.consumerId),
      entry,
    ]),
  );
}

export function replacePlayerRestrictionGovernanceEntry(
  model: CharacterRestrictionGovernanceReadModel,
  replacement: PlayerRestrictionGovernanceReadEntry,
): CharacterRestrictionGovernanceReadModel {
  const key = getPlayerRestrictionGovernanceEntryKey(
    replacement.consumerType,
    replacement.consumerId,
  );
  let replaced = false;
  const governance = model.governance.map((entry) => {
    if (getPlayerRestrictionGovernanceEntryKey(entry.consumerType, entry.consumerId) !== key) {
      return entry;
    }
    replaced = true;
    return replacement;
  });
  if (!replaced) governance.push(replacement);
  return Object.freeze({
    ...model,
    governance: Object.freeze(governance),
  });
}

export function getLatestPlayerFacingRestrictionReviewNote(
  entry: PlayerRestrictionGovernanceReadEntry | null,
): string | null {
  if (!entry) return null;
  for (let index = entry.history.length - 1; index >= 0; index -= 1) {
    const note = entry.history[index]?.notes?.trim();
    if (note) return note;
  }
  return null;
}

export function getRestrictionLifecycleDisplayLabel(
  lifecycle: RestrictionLifecycleState,
): string {
  return RESTRICTION_LIFECYCLE_LABELS[lifecycle];
}

export function getRestrictionDefinitionDisplayLabel(
  definition: AbilityRestrictionDefinitionV1 | null,
): string {
  if (!definition) return "No Restriction";
  return definition.authoringMode === "CUSTOM_NARRATIVE"
    ? "Fully Custom"
    : definition.authoringMode === "STANDARD_STRUCTURED"
      ? "Standard"
      : "Stored Restriction";
}

export function hasPendingRestrictionProposalMismatch(
  entry: PlayerRestrictionGovernanceReadEntry | null,
): boolean {
  return entry?.effectiveLifecycle === "PENDING_GD_APPROVAL" &&
    entry.submittedProposalMatchesLiveDefinition === false;
}

export function hasSavedApprovedRestrictionMismatch(
  entry: PlayerRestrictionGovernanceReadEntry | null,
): boolean {
  return entry?.storedLifecycle === "APPROVED" &&
    entry.approvedProposalMatchesLiveDefinition === false;
}

export function hasUnsavedApprovedRestrictionMismatch(
  entry: PlayerRestrictionGovernanceReadEntry | null,
  localFingerprint: string | null,
): boolean {
  return Boolean(
    entry?.approvalCurrent &&
    localFingerprint &&
    entry.approvedFingerprint &&
    localFingerprint !== entry.approvedFingerprint,
  );
}

export function formatRestrictionGovernanceSummary(params: {
  definition: AbilityRestrictionDefinitionV1 | null;
  entry: PlayerRestrictionGovernanceReadEntry | null;
}): string {
  const definitionLabel = getRestrictionDefinitionDisplayLabel(params.definition);
  if (!params.definition) return "No Restriction — approval not required";
  const lifecycle = params.entry?.effectiveLifecycle ?? "DRAFT";
  const tier = lifecycle === "APPROVED" && params.entry?.selectedTier
    ? ` — ${RESTRICTION_TIER_LABELS[params.entry.selectedTier]}`
    : "";
  return `Restriction: ${definitionLabel} · ${getRestrictionLifecycleDisplayLabel(lifecycle)}${tier}`;
}

export type PlayerRestrictionGovernanceReadinessConsumer = Readonly<{
  consumerType: PlayerRestrictionConsumer;
  consumerId: string;
  consumerName: string;
  hasSemanticRestriction: boolean;
  semanticValid: boolean;
  ordinaryValidationPasses: boolean;
  localFingerprint: string | null;
}>;

export type CharacterRestrictionGovernanceReadiness = Readonly<{
  ready: boolean;
  issues: readonly string[];
}>;

export function deriveCharacterRestrictionGovernanceReadiness(params: {
  model: CharacterRestrictionGovernanceReadModel | null;
  loadError: string | null;
  consumers: readonly PlayerRestrictionGovernanceReadinessConsumer[];
}): CharacterRestrictionGovernanceReadiness {
  const issues: string[] = [];
  const entries = buildPlayerRestrictionGovernanceEntryMap(params.model);
  const requiresGovernance = params.consumers.some(
    (consumer) => consumer.hasSemanticRestriction,
  );
  if (requiresGovernance && params.loadError) {
    issues.push("Restriction governance could not be loaded, so current approval cannot be proven.");
  } else if (requiresGovernance && !params.model) {
    issues.push("Restriction governance has not finished loading.");
  }

  for (const consumer of params.consumers) {
    const label = consumer.consumerName.trim() || "Unnamed consumer";
    if (!consumer.ordinaryValidationPasses) {
      issues.push(`${label} fails ordinary validation.`);
    }
    if (!consumer.semanticValid) {
      issues.push(`${label} has malformed or unresolved Restriction data.`);
      continue;
    }
    if (!consumer.hasSemanticRestriction) continue;
    const entry = entries.get(getPlayerRestrictionGovernanceEntryKey(
      consumer.consumerType,
      consumer.consumerId,
    )) ?? null;
    if (!entry) {
      issues.push(`${label} has a Restriction without current governance.`);
      continue;
    }
    if (!entry.approvalCurrent || entry.effectiveLifecycle !== "APPROVED") {
      issues.push(`${label} Restriction is ${getRestrictionLifecycleDisplayLabel(entry.effectiveLifecycle)}.`);
      continue;
    }
    if (hasUnsavedApprovedRestrictionMismatch(entry, consumer.localFingerprint)) {
      issues.push(`${label} has an unsaved local Restriction change that differs from its current approval.`);
    }
  }

  return Object.freeze({
    ready: issues.length === 0,
    issues: Object.freeze(Array.from(new Set(issues))),
  });
}
