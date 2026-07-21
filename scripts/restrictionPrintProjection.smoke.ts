import assert from "node:assert/strict";

import { defaultBuilderData } from "../lib/characterBuilder/core";
import {
  createDefaultCharacterPower,
  summarizeCharacterPowers,
  type CharacterPower,
} from "../lib/characterBuilder/powers";
import {
  createDefaultRoleplayAbility,
  type RoleplayAbility,
} from "../lib/characterBuilder/roleplayAbilities";
import {
  createRestrictionFingerprint,
  type AbilityRestrictionDefinitionV1,
} from "../lib/restrictions";
import {
  RESTRICTION_PRINT_PROJECTION_OMISSION_REASONS,
  projectCharacterRestrictionPrintData,
} from "../lib/restrictions/printProjection";
import type {
  CharacterRestrictionGovernanceReadModel,
  PlayerRestrictionGovernanceReadEntry,
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
function deepEqual(actual: unknown, expected: unknown, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const campaignId = "campaign-print";
const characterId = "character-print";
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
const unsupported: AbilityRestrictionDefinitionV1 = {
  ...standard,
  templateKey: "FUTURE_UNSUPPORTED_TEMPLATE",
};
const fingerprint = createRestrictionFingerprint(standard);

function power(
  id: string,
  name: string,
  restriction: AbilityRestrictionDefinitionV1 | null = null,
): CharacterPower {
  return {
    ...createDefaultCharacterPower(0, { generateIds: false }),
    id,
    name,
    restriction,
  };
}

function roleplay(
  id: string,
  name: string,
  restriction: AbilityRestrictionDefinitionV1 | null = null,
): RoleplayAbility {
  return {
    ...createDefaultRoleplayAbility(0),
    id,
    name,
    restriction,
  };
}

function entry(
  consumerType: PlayerRestrictionGovernanceReadEntry["consumerType"],
  consumerId: string,
  lifecycle: PlayerRestrictionGovernanceReadEntry["effectiveLifecycle"],
  overrides: Partial<PlayerRestrictionGovernanceReadEntry> = {},
): PlayerRestrictionGovernanceReadEntry {
  const approved = lifecycle === "APPROVED";
  return {
    governanceId: `governance-${consumerId}`,
    synthetic: false,
    consumerType,
    consumerId,
    consumerName: consumerId,
    consumerIndex: 0,
    consumerPresence: "PRESENT",
    semanticStatus: "VALID",
    currentSemanticRestriction: standard,
    currentFingerprint: fingerprint,
    submittedDefinition: standard,
    submittedSnapshotStatus: "VALID",
    submittedFingerprint: fingerprint,
    approvedFingerprint: approved ? fingerprint : null,
    submittedProposalMatchesLiveDefinition: true,
    approvedProposalMatchesLiveDefinition: approved ? true : null,
    storedLifecycle: lifecycle,
    effectiveLifecycle: lifecycle,
    approvalCurrent: approved,
    selectedTier: approved ? "MATERIAL_LIMITATION" : null,
    submissionRevision: 1,
    submittedByUserId: "player",
    submittedAt: "2026-07-21T10:00:00.000Z",
    reviewedByUserId: approved ? "gd" : null,
    reviewedAt: approved ? "2026-07-21T11:00:00.000Z" : null,
    history: [],
    diagnosticIssues: [],
    ...overrides,
  };
}

function model(
  governance: readonly PlayerRestrictionGovernanceReadEntry[],
): CharacterRestrictionGovernanceReadModel {
  return { campaignId, characterId, governance };
}

const unrestrictedOnly = defaultBuilderData();
unrestrictedOnly.powers = [power("power-free", "Free Power")];
unrestrictedOnly.signatureMove = power("signature-free", "Free Signature");
unrestrictedOnly.roleplayAbilities = [roleplay("roleplay-free", "Free Roleplay")];
const unrestrictedProjection = projectCharacterRestrictionPrintData({
  builderData: unrestrictedOnly,
  governance: { status: "AVAILABLE", model: model([]) },
});
deepEqual(unrestrictedProjection.includedOrdinaryPowerIds, ["power-free"], "Unrestricted Power prints without approval.");
equal(unrestrictedProjection.includedSignatureMoveId, "signature-free", "Unrestricted Signature Move prints without approval.");
deepEqual(unrestrictedProjection.includedRoleplayAbilityIds, ["roleplay-free"], "Unrestricted Roleplay Ability prints without approval.");
equal(unrestrictedProjection.omitted.length, 0, "Unrestricted content produces no omission.");

const mixed = defaultBuilderData();
mixed.powers = [
  power("power-free", "Dragon Breath"),
  power("power-approved", "Dragon Strike", standard),
  power("power-pending", "Hidden Flame", standard),
];
mixed.signatureMove = power("signature-stale", "Final Eclipse", standard);
mixed.roleplayAbilities = [roleplay("roleplay-changes", "Rally the Guard", standard)];
const mixedSnapshot = JSON.stringify(mixed);
const mixedProjection = projectCharacterRestrictionPrintData({
  builderData: mixed,
  governance: {
    status: "AVAILABLE",
    model: model([
      entry("PLAYER_POWER", "power-approved", "APPROVED"),
      entry("PLAYER_POWER", "power-pending", "PENDING_GD_APPROVAL"),
      entry("SIGNATURE_MOVE", "signature-stale", "APPROVAL_STALE", {
        storedLifecycle: "APPROVED",
        approvedFingerprint: "restriction:v1:old",
        approvedProposalMatchesLiveDefinition: false,
      }),
      entry("ROLEPLAY_ABILITY", "roleplay-changes", "CHANGES_REQUESTED"),
    ]),
  },
});
deepEqual(mixedProjection.includedOrdinaryPowerIds, ["power-free", "power-approved"], "Mixed projection preserves included Power order.");
equal(mixedProjection.includedSignatureMoveId, null, "Stale Signature Move is omitted.");
deepEqual(mixedProjection.includedRoleplayAbilityIds, [], "Changes Requested Roleplay Ability is omitted.");
deepEqual(
  mixedProjection.omitted.map((item) => [item.consumerType, item.consumerName, item.reasonCode]),
  [
    ["PLAYER_POWER", "Hidden Flame", "PENDING_GD_APPROVAL"],
    ["SIGNATURE_MOVE", "Final Eclipse", "APPROVAL_STALE"],
    ["ROLEPLAY_ABILITY", "Rally the Guard", "CHANGES_REQUESTED"],
  ],
  "Mixed omissions are deterministic and player-facing.",
);
equal(JSON.stringify(mixed), mixedSnapshot, "Projection does not mutate source Builder data.");
check(Object.isFrozen(mixedProjection.builderData), "Projected Builder data is immutable.");
check(Object.isFrozen(mixedProjection.builderData.powers), "Projected Power collection is immutable.");
check(Object.isFrozen(mixedProjection.builderData.powers[0]?.effectPackets), "Projected Power packet data is immutable.");

const rawBudget = summarizeCharacterPowers({
  level: 3,
  powers: mixed.powers,
  cooldownAuthorityMode: "EXPLICIT_BUILTIN_PREVIEW",
});
const projectedBudget = summarizeCharacterPowers({
  level: 3,
  powers: mixedProjection.builderData.powers,
  cooldownAuthorityMode: "EXPLICIT_BUILTIN_PREVIEW",
});
equal(projectedBudget.powers.length, 2, "Printed budget contains only included Powers.");
check(projectedBudget.totalSpent < rawBudget.totalSpent, "Omitted Power spend is removed from the printed budget.");
equal(
  projectedBudget.powers.find((item) => item.power.id === "power-approved")?.spend,
  rawBudget.powers.find((item) => item.power.id === "power-approved")?.spend,
  "Approved restricted Power retains its gross cost without economic credit.",
);
equal(mixedProjection.builderData.powers[1]?.restrictionDiscountPercent, 0, "Projection activates no Restriction discount.");

const reasonCases: Array<{
  id: string;
  power: CharacterPower;
  governance: readonly PlayerRestrictionGovernanceReadEntry[];
  expected: (typeof RESTRICTION_PRINT_PROJECTION_OMISSION_REASONS)[number];
}> = [
  { id: "draft", power: power("draft", "Draft", standard), governance: [entry("PLAYER_POWER", "draft", "DRAFT")], expected: "DRAFT" },
  { id: "pending", power: power("pending", "Pending", standard), governance: [entry("PLAYER_POWER", "pending", "PENDING_GD_APPROVAL")], expected: "PENDING_GD_APPROVAL" },
  { id: "changes", power: power("changes", "Changes", standard), governance: [entry("PLAYER_POWER", "changes", "CHANGES_REQUESTED")], expected: "CHANGES_REQUESTED" },
  { id: "stale", power: power("stale", "Stale", standard), governance: [entry("PLAYER_POWER", "stale", "APPROVAL_STALE")], expected: "APPROVAL_STALE" },
  { id: "missing", power: power("missing", "Missing", standard), governance: [], expected: "MISSING_GOVERNANCE" },
  { id: "not-current", power: power("not-current", "Not Current", standard), governance: [entry("PLAYER_POWER", "not-current", "APPROVED", { approvalCurrent: false })], expected: "APPROVAL_NOT_CURRENT" },
  { id: "mismatch", power: power("mismatch", "Mismatch", standard), governance: [entry("PLAYER_POWER", "mismatch", "APPROVED", { currentFingerprint: "restriction:v1:different" })], expected: "FINGERPRINT_MISMATCH" },
  { id: "malformed", power: power("malformed", "Malformed", { schemaVersion: 2 } as unknown as AbilityRestrictionDefinitionV1), governance: [], expected: "MALFORMED_RESTRICTION" },
  { id: "unsupported", power: power("unsupported", "Unsupported", unsupported), governance: [], expected: "UNSUPPORTED_RESTRICTION" },
];

for (const reasonCase of reasonCases) {
  const data = defaultBuilderData();
  data.powers = [reasonCase.power];
  const projection = projectCharacterRestrictionPrintData({
    builderData: data,
    governance: { status: "AVAILABLE", model: model(reasonCase.governance) },
  });
  equal(projection.omitted[0]?.reasonCode, reasonCase.expected, `${reasonCase.id} uses its stable dominant omission reason.`);
  check(Boolean(projection.omitted[0]?.reasonLabel), `${reasonCase.id} exposes a readable omission label.`);
}

const unresolvedLegacy = defaultBuilderData();
unresolvedLegacy.roleplayAbilities = [{
  ...roleplay("legacy", "Legacy Ability"),
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "LIGHT",
  restrictionText: "while the old condition holds",
}];
equal(
  projectCharacterRestrictionPrintData({
    builderData: unresolvedLegacy,
    governance: { status: "AVAILABLE", model: model([]) },
  }).omitted[0]?.reasonCode,
  "UNRESOLVED_LEGACY_REVIEW",
  "Unresolved legacy Roleplay data is omitted deterministically.",
);

const unavailable = defaultBuilderData();
unavailable.powers = [
  power("free-when-offline", "Free When Offline"),
  power("restricted-when-offline", "Restricted When Offline", standard),
];
const unavailableProjection = projectCharacterRestrictionPrintData({
  builderData: unavailable,
  governance: { status: "UNAVAILABLE", campaignId },
});
deepEqual(unavailableProjection.includedOrdinaryPowerIds, ["free-when-offline"], "Governance failure retains unrestricted content.");
equal(unavailableProjection.omitted[0]?.reasonCode, "GOVERNANCE_UNAVAILABLE", "Governance failure fails closed for restricted content.");
equal(unavailableProjection.aggregateWarningState, "GOVERNANCE_UNAVAILABLE", "Governance failure raises the aggregate warning state.");

const restrictionRemoved = defaultBuilderData();
restrictionRemoved.powers = [power("restriction-removed", "Restriction Removed")];
const removedProjection = projectCharacterRestrictionPrintData({
  builderData: restrictionRemoved,
  governance: {
    status: "AVAILABLE",
    model: model([entry("PLAYER_POWER", "restriction-removed", "APPROVED")]),
  },
});
deepEqual(removedProjection.includedOrdinaryPowerIds, ["restriction-removed"], "Historical governance does not block a surviving unrestricted Power.");

const allOmitted = defaultBuilderData();
allOmitted.powers = [power("only-pending", "Only Pending", standard)];
equal(
  projectCharacterRestrictionPrintData({
    builderData: allOmitted,
    governance: {
      status: "AVAILABLE",
      model: model([entry("PLAYER_POWER", "only-pending", "PENDING_GD_APPROVAL")]),
    },
  }).builderData.powers.length,
  0,
  "Projection safely produces the existing empty Power-sheet input.",
);

console.log(`Restriction print projection smoke passed (${checks} checks).`);
