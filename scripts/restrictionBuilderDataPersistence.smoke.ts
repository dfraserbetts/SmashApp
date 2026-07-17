import assert from "node:assert/strict";

import {
  defaultBuilderData,
  normalizeBuilderData,
} from "../lib/characterBuilder/core";
import {
  createDefaultCharacterPower,
  normalizeCharacterPower,
} from "../lib/characterBuilder/powers";
import {
  LEGACY_ROLEPLAY_RESTRICTION_BANDS,
  LEGACY_ROLEPLAY_RESTRICTION_TYPES,
  diagnoseRoleplayRestrictionTransition,
  migrateLegacyRoleplayRestriction,
  normalizePersistedRestriction,
} from "../lib/restrictions/persistence";
import {
  createDefaultRoleplayAbility,
  getRoleplayRestrictionTransitionIssues,
  normalizeRoleplayAbility,
  ROLEPLAY_RESTRICTION_BAND_OPTIONS,
  ROLEPLAY_RESTRICTION_TYPE_OPTIONS,
  renderRoleplayAbilityDescriptor,
} from "../lib/characterBuilder/roleplayAbilities";
import {
  ROLEPLAY_RESTRICTION_BAND_VALUES,
  ROLEPLAY_RESTRICTION_TYPE_VALUES,
} from "../lib/characterBuilder/legacyRoleplayRestrictions";
import type {
  AbilityRestrictionDefinitionV1,
  RestrictionCampaignReference,
} from "../lib/restrictions";

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

// One canonical legacy inventory serves both live Roleplay and migration callers.
equal(LEGACY_ROLEPLAY_RESTRICTION_TYPES, ROLEPLAY_RESTRICTION_TYPE_VALUES, "Migration types must reference the canonical inventory.");
equal(LEGACY_ROLEPLAY_RESTRICTION_BANDS, ROLEPLAY_RESTRICTION_BAND_VALUES, "Migration bands must reference the canonical inventory.");
deepEqual(ROLEPLAY_RESTRICTION_TYPE_OPTIONS.map((option) => option.value), ROLEPLAY_RESTRICTION_TYPE_VALUES, "Live Roleplay type options must expose the canonical values.");
deepEqual(ROLEPLAY_RESTRICTION_BAND_OPTIONS.map((option) => option.value), ROLEPLAY_RESTRICTION_BAND_VALUES, "Live Roleplay band options must expose the canonical values.");
deepEqual(ROLEPLAY_RESTRICTION_TYPE_VALUES, ["NONE", "TARGET_ELIGIBILITY", "CIRCUMSTANCE", "OATH_BEHAVIOUR", "SCENE_STATE", "RESOURCE_STATE"], "All six legacy Restriction types must remain available in order.");
deepEqual(ROLEPLAY_RESTRICTION_BAND_VALUES, ["NONE_COSMETIC", "LIGHT", "MODERATE", "HARSH", "SEVERE_OATH"], "All five legacy Restriction bands must remain available in order.");

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
const zoneReference: RestrictionCampaignReference = {
  kind: "CAMPAIGN_REFERENCE",
  campaignId: "campaign-1",
  valueKind: "ZONE",
  valueId: "blood-circle",
};
const campaignCustom: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "CAMPAIGN_CUSTOM_STRUCTURED",
  templateKey: "ACTOR_ZONE_MEMBERSHIP",
  templateVersion: 1,
  parameters: {
    operator: { kind: "SYSTEM_ENUM", valueKey: "INSIDE" },
    zone: zoneReference,
  },
  customNarrativeText: null,
};
const customNarrative: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "CUSTOM_NARRATIVE",
  templateKey: null,
  templateVersion: null,
  parameters: {},
  customNarrativeText: "This Ability may only be used after accepting responsibility.",
};
const unknownTemplate: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "STANDARD_STRUCTURED",
  templateKey: "FUTURE_TEMPLATE",
  templateVersion: 7,
  parameters: { futureValue: { kind: "NUMBER", value: 3 } },
  customNarrativeText: null,
};

// Shared persistence adapter.
for (const empty of [null, undefined]) {
  const result = normalizePersistedRestriction(empty);
  equal(result.status, "NONE", "Null and absence must normalize to NONE.");
  equal(result.definition, null, "No Restriction must persist as null.");
  check(result.valid, "No Restriction is a valid persistence state.");
}
for (const [label, definition] of [
  ["standard", standard],
  ["campaign custom", campaignCustom],
  ["custom narrative", customNarrative],
] as const) {
  const result = normalizePersistedRestriction(definition);
  equal(result.status, "VALID", `${label} must be valid.`);
  deepEqual(result.definition, definition, `${label} must survive normalization.`);
  deepEqual(
    normalizePersistedRestriction(JSON.parse(JSON.stringify(result.definition))).definition,
    definition,
    `${label} must survive JSON save/load.`,
  );
}
const malformed = normalizePersistedRestriction({ schemaVersion: 1, authoringMode: "NOPE" });
equal(malformed.status, "INVALID", "Malformed definitions must be invalid.");
equal(malformed.definition, null, "Malformed definitions must not persist.");
const compound = normalizePersistedRestriction({ ...standard, conditions: [standard] });
equal(compound.status, "INVALID", "Compound definitions must be invalid.");
equal(compound.definition, null, "Fatal compound definitions must not persist.");
check(hasCode(compound.issues, "COMPOUND_STRUCTURE"), "Compound failure must remain inspectable.");
const unknown = normalizePersistedRestriction(unknownTemplate);
equal(unknown.status, "UNSUPPORTED", "Unknown templates must be visibly unsupported.");
deepEqual(unknown.definition, unknownTemplate, "Safe unknown template identity must be preserved.");
check(hasCode(unknown.issues, "UNKNOWN_TEMPLATE"), "Unknown templates need an honest issue.");
const junked = normalizePersistedRestriction({
  ...standard,
  approvalState: "APPROVED",
  reviewer: "reviewer-1",
  approvedAt: "today",
  restrictionDiscountPercent: 50,
  credit: 10,
  generatedDescriptor: "not semantic",
  runtimeEligibility: "ELIGIBLE",
});
deepEqual(junked.definition, standard, "Governance, economics, descriptors, and runtime junk must be excluded.");
for (const forbidden of ["approvalState", "reviewer", "approvedAt", "credit", "generatedDescriptor", "runtimeEligibility", "restrictionDiscountPercent"]) {
  check(!Object.hasOwn(junked.definition ?? {}, forbidden), `${forbidden} must not persist.`);
}

// Character Power and Signature Move normalization.
function powerWithRestriction(restriction: unknown, sortOrder = 0) {
  return { ...createDefaultCharacterPower(sortOrder), restriction };
}
const noRestrictionPower = normalizeCharacterPower(createDefaultCharacterPower(0), 0);
equal(noRestrictionPower.restriction, null, "Absent Character Power Restriction canonicalizes to null.");
for (const [label, definition] of [
  ["standard", standard],
  ["campaign custom", campaignCustom],
  ["custom narrative", customNarrative],
] as const) {
  const source = powerWithRestriction(definition);
  const normalized = normalizeCharacterPower(JSON.parse(JSON.stringify(source)), 0);
  deepEqual(normalized.restriction, definition, `Character Power ${label} Restriction must round-trip.`);
  equal(normalized.id, source.id, `Character Power ${label} ID must remain unchanged.`);
  deepEqual(normalized.effectPackets.map((packet) => packet.id), source.effectPackets.map((packet) => packet.id), `Character Power ${label} packet IDs must remain unchanged.`);
  for (const key of ["diceCount", "potency", "cooldownTurns", "cooldownReduction", "counterMode"] as const) {
    equal(normalized[key], source[key], `Character Power ${label} ${key} must remain unchanged.`);
  }
}
equal(normalizeCharacterPower(powerWithRestriction({ nope: true }), 0).restriction, null, "Malformed Character Power Restriction must fall back to null.");
deepEqual(normalizeCharacterPower(powerWithRestriction(unknownTemplate), 0).restriction, unknownTemplate, "Unknown Character Power template must be preserved.");
const placeholders = normalizeCharacterPower({
  ...powerWithRestriction(standard),
  sparkDiscountPercent: 99,
  restrictionDiscountPercent: 99,
}, 0);
equal(placeholders.sparkDiscountPercent, 0, "Spark placeholder remains inert.");
equal(placeholders.restrictionDiscountPercent, 0, "Restriction discount placeholder remains inert.");
deepEqual(placeholders.restriction, standard, "Placeholder fields cannot become Restriction data.");

const signatureSource = {
  ...createDefaultCharacterPower(0),
  name: "Signature Restriction",
  cooldownTurns: 4,
  cooldownReduction: 1,
  restriction: campaignCustom,
};
const signature = normalizeCharacterPower(JSON.parse(JSON.stringify(signatureSource)), 0);
deepEqual(signature.restriction, campaignCustom, "Signature Move Restriction must round-trip.");
equal(signature.id, signatureSource.id, "Signature Move identity must remain unchanged.");
equal(signature.cooldownTurns, 4, "Signature Move cooldown data must remain unchanged.");
equal(signature.cooldownReduction, 1, "Signature Move separate-pool-related cooldown reduction must remain unchanged.");
equal(normalizeCharacterPower({ ...signatureSource, restriction: { bad: true } }, 0).restriction, null, "Malformed Signature Move Restriction must fall back to null.");
equal(normalizeCharacterPower({ ...signatureSource, restriction: undefined }, 0).restriction, null, "Signature Move may have no Restriction.");

// Roleplay shared authority and active legacy cutover.
const legacyRoleplay = {
  ...createDefaultRoleplayAbility(0),
  id: "roleplay-1",
  name: "Legacy Target Phrase",
  narrativeTheme: "A test",
  restrictionType: "TARGET_ELIGIBILITY" as const,
  restrictionBand: "HARSH" as const,
  restrictionTag: "one Agent of Morgoth",
  restrictionText: "Preserved legacy note.",
};
const legacyDescriptor = renderRoleplayAbilityDescriptor(normalizeRoleplayAbility(legacyRoleplay, 0));
const roleplayWithShared = normalizeRoleplayAbility({ ...legacyRoleplay, restriction: customNarrative }, 0);
deepEqual(roleplayWithShared.restriction, customNarrative, "Explicit Roleplay shared Restriction must round-trip.");
equal(roleplayWithShared.restrictionType, "NONE", "Shared Roleplay authority must neutralize the legacy type.");
equal(roleplayWithShared.restrictionBand, "NONE_COSMETIC", "Shared Roleplay authority must neutralize the legacy band.");
equal(roleplayWithShared.restrictionTag, "", "Shared Roleplay authority must clear the legacy tag.");
equal(roleplayWithShared.restrictionText, "", "Shared Roleplay authority must clear the legacy text.");
equal(renderRoleplayAbilityDescriptor(roleplayWithShared), legacyDescriptor, "Shared persistence field must not change the ordinary descriptor.");
check(legacyDescriptor.startsWith("Choose one target"), "Scope, not legacy Target Eligibility, must own ordinary target grammar.");
check(hasCode(getRoleplayRestrictionTransitionIssues({ ...legacyRoleplay, restriction: customNarrative }), "LEGACY_AND_SHARED_RESTRICTION_PRESENT"), "Dual Roleplay representations need a diagnostic.");
check(hasCode(diagnoseRoleplayRestrictionTransition({ ...legacyRoleplay, restriction: customNarrative }), "LEGACY_AND_SHARED_RESTRICTION_PRESENT"), "Shared transition diagnostic must be stable.");
equal(normalizeRoleplayAbility({ ...legacyRoleplay, restriction: { bad: true } }, 0).restriction, null, "Malformed explicit Roleplay Restriction must fall back to null.");
const migratedLegacyRoleplay = normalizeRoleplayAbility(legacyRoleplay, 0);
equal(migratedLegacyRoleplay.restriction?.authoringMode, "CUSTOM_NARRATIVE", "Safe legacy Roleplay data migrates during normalization.");
equal(migratedLegacyRoleplay.restriction?.customNarrativeText, "This Ability may only target one Agent of Morgoth.", "Safe Target Eligibility migration preserves its meaning.");
equal(migratedLegacyRoleplay.restrictionType, "NONE", "Safe migration neutralizes the legacy type.");
equal(migratedLegacyRoleplay.restrictionBand, "NONE_COSMETIC", "Safe migration neutralizes the legacy band.");
equal(migratedLegacyRoleplay.restrictionTag, "", "Safe migration clears the legacy tag.");
equal(migratedLegacyRoleplay.restrictionText, "", "Safe migration clears the legacy text.");
const reviewOnlyRoleplay = normalizeRoleplayAbility({
  ...legacyRoleplay,
  restrictionType: "OATH_BEHAVIOUR",
  restrictionText: "Keep the old oath wording for review.",
}, 0);
equal(reviewOnlyRoleplay.restriction, null, "Ambiguous legacy Roleplay data must not invent semantic meaning.");
equal(reviewOnlyRoleplay.restrictionType, "OATH_BEHAVIOUR", "Ambiguous legacy type remains reviewable.");
equal(reviewOnlyRoleplay.restrictionBand, "HARSH", "Ambiguous legacy band remains reviewable.");
equal(reviewOnlyRoleplay.restrictionTag, "one Agent of Morgoth", "Ambiguous legacy tag remains reviewable.");
equal(reviewOnlyRoleplay.restrictionText, "Keep the old oath wording for review.", "Ambiguous legacy text remains reviewable.");

// Complete CharacterBuilderData JSON contract.
const builderSource = {
  ...defaultBuilderData(),
  narrativeNotes: "Unrelated notes remain",
  selectedTraitKeys: ["trait-1"],
  powers: [powerWithRestriction(standard, 0), powerWithRestriction(null, 1), powerWithRestriction(customNarrative, 2)],
  signatureMove: signatureSource,
  roleplayAbilities: [{ ...legacyRoleplay, restriction: campaignCustom }],
};
const builderNormalized = normalizeBuilderData(builderSource);
deepEqual(builderNormalized.powers.map((power) => power.restriction), [standard, null, customNarrative], "Ordinary Powers independently preserve zero-or-one Restrictions.");
deepEqual(builderNormalized.signatureMove?.restriction, campaignCustom, "CharacterBuilderData preserves Signature Move Restriction.");
deepEqual(builderNormalized.roleplayAbilities[0]?.restriction, campaignCustom, "CharacterBuilderData preserves explicit Roleplay Restriction.");
equal(builderNormalized.narrativeNotes, "Unrelated notes remain", "Unrelated character notes remain unchanged.");
deepEqual(builderNormalized.selectedTraitKeys, ["trait-1"], "Unrelated trait data remains unchanged.");
deepEqual(
  normalizeBuilderData(JSON.parse(JSON.stringify(builderNormalized))),
  builderNormalized,
  "CharacterBuilderData must be stable after JSON save/load and renormalization.",
);

// Pure legacy migration contract used by live Roleplay normalization and review state.
const noneMigration = migrateLegacyRoleplayRestriction({
  restrictionType: "NONE",
  restrictionBand: "SEVERE_OATH",
  restrictionTag: "preserved tag",
  restrictionText: "preserved text",
});
check(noneMigration.migrationApplied, "Legacy NONE migration is explicit and applied.");
equal(noneMigration.definition, null, "Legacy NONE maps to no Restriction.");
equal(noneMigration.legacySource.restrictionBand, "SEVERE_OATH", "Legacy NONE audit source preserves its band.");
equal(noneMigration.legacySource.restrictionTag, "preserved tag", "Legacy NONE audit source preserves its tag.");
equal(noneMigration.legacySource.restrictionText, "preserved text", "Legacy NONE audit source preserves its text.");

const targetInput = {
  restrictionType: "TARGET_ELIGIBILITY",
  restrictionBand: "HARSH",
  restrictionTag: "one Agent of Morgoth",
  restrictionText: "audit note",
};
const targetBefore = structuredClone(targetInput);
const targetMigration = migrateLegacyRoleplayRestriction(targetInput);
check(targetMigration.migrationApplied, "Nonblank Target Eligibility is unambiguous.");
equal(targetMigration.definition?.authoringMode, "CUSTOM_NARRATIVE", "Target Eligibility maps to Custom Narrative.");
equal(targetMigration.definition?.customNarrativeText, "This Ability may only target one Agent of Morgoth.", "Target Eligibility sentence must preserve target meaning.");
equal(targetMigration.legacySource.restrictionText, "audit note", "Legacy target text remains available for audit.");
deepEqual(targetInput, targetBefore, "Legacy migration must not mutate its input.");

const circumstanceMigration = migrateLegacyRoleplayRestriction({
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "MODERATE",
  restrictionTag: "preserved circumstance tag",
  restrictionText: "Only while the actor remains under direct moonlight.",
});
check(circumstanceMigration.migrationApplied, "Complete Circumstance text is unambiguous.");
equal(circumstanceMigration.definition?.customNarrativeText, "Only while the actor remains under direct moonlight.", "Circumstance sentence must be preserved.");
equal(circumstanceMigration.legacySource.restrictionTag, "preserved circumstance tag", "Circumstance tag remains available for audit.");

for (const [sourceText, expectedText] of [
  ["This Ability may only be used while the actor is in direct moonlight.", "This Ability may only be used while the actor is in direct moonlight."],
  ["Only while the actor remains under direct moonlight.", "Only while the actor remains under direct moonlight."],
  ["  Only   after the actor has publicly accepted responsibility.  ", "Only after the actor has publicly accepted responsibility."],
] as const) {
  const result = migrateLegacyRoleplayRestriction({
    restrictionType: "CIRCUMSTANCE",
    restrictionBand: "MODERATE",
    restrictionTag: "preserved tag",
    restrictionText: sourceText,
  });
  check(result.migrationApplied, `${sourceText} must be explicit enough to migrate.`);
  equal(result.definition?.customNarrativeText, expectedText, "Accepted Circumstance text must normalize without changing meaning.");
  equal(result.legacySource.restrictionTag, "preserved tag", "Accepted Circumstance migration must preserve its tag.");
}

for (const sourceText of [
  "Moonlight.",
  "The battlefield.",
  " ",
  "...",
  "Direct moonlight.",
  "The actor remains under direct moonlight.",
  "When angry.",
]) {
  const result = migrateLegacyRoleplayRestriction({
    restrictionType: "CIRCUMSTANCE",
    restrictionBand: "LIGHT",
    restrictionTag: "preserved tag",
    restrictionText: sourceText,
  });
  equal(result.definition, null, `${sourceText || "blank text"} must remain review-only.`);
  check(!result.migrationApplied, `${sourceText || "blank text"} must not apply migration.`);
  check(hasCode(result.issues, "LEGACY_RESTRICTION_REQUIRES_REVIEW"), `${sourceText || "blank text"} must require review.`);
  equal(result.legacySource.restrictionTag, "preserved tag", "Review-only migration must preserve its tag.");
  equal(result.legacySource.restrictionText, sourceText.trim().replace(/\s+/gu, " "), "Review-only migration must preserve normalized source text.");
}

const compoundCircumstance = migrateLegacyRoleplayRestriction({
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "HARSH",
  restrictionTag: "compound audit tag",
  restrictionText: "Only while the actor is in moonlight and the target is wounded.",
});
check(compoundCircumstance.migrationApplied, "Explicit compound-looking eligibility prose may migrate for GD review.");
check(hasCode(compoundCircumstance.issues, "LIKELY_COMPOUND_NARRATIVE"), "Compound-looking migrated prose must retain the GD-review warning.");
check(!compoundCircumstance.issues.some((entry) => entry.code === "LIKELY_COMPOUND_NARRATIVE" && entry.severity === "error"), "Compound narrative review must remain a warning.");
check(!JSON.stringify(compoundCircumstance.definition).includes("APPROVED"), "Compound migration must not manufacture approval.");

const blankTarget = migrateLegacyRoleplayRestriction({ restrictionType: "TARGET_ELIGIBILITY", restrictionBand: "LIGHT", restrictionTag: " ", restrictionText: "" });
equal(blankTarget.definition, null, "Blank Target Eligibility cannot manufacture a definition.");
check(hasCode(blankTarget.issues, "BLANK_LEGACY_RESTRICTION_TAG"), "Blank target tag needs a diagnostic.");
const blankCircumstance = migrateLegacyRoleplayRestriction({ restrictionType: "CIRCUMSTANCE", restrictionBand: "LIGHT", restrictionTag: "tag", restrictionText: " " });
equal(blankCircumstance.definition, null, "Blank Circumstance text cannot manufacture a definition.");
check(hasCode(blankCircumstance.issues, "LEGACY_RESTRICTION_REQUIRES_REVIEW"), "Blank Circumstance needs review.");
const fragmentCircumstance = migrateLegacyRoleplayRestriction({ restrictionType: "CIRCUMSTANCE", restrictionBand: "LIGHT", restrictionTag: "", restrictionText: "under direct moonlight" });
equal(fragmentCircumstance.definition, null, "A Circumstance fragment cannot manufacture a complete narrative condition.");
check(hasCode(fragmentCircumstance.issues, "LEGACY_RESTRICTION_REQUIRES_REVIEW"), "A Circumstance fragment needs review.");

for (const restrictionType of LEGACY_ROLEPLAY_RESTRICTION_TYPES) {
  const result = migrateLegacyRoleplayRestriction({
    restrictionType,
    restrictionBand: "SEVERE_OATH",
    restrictionTag: "preserved tag",
    restrictionText: "One complete preserved sentence.",
  });
  equal(result.legacySource.restrictionType, restrictionType, `${restrictionType} must remain in the audit source.`);
  equal(result.legacySource.restrictionBand, "SEVERE_OATH", `${restrictionType} band must remain audit-only.`);
  if (["OATH_BEHAVIOUR", "SCENE_STATE", "RESOURCE_STATE"].includes(restrictionType)) {
    equal(result.definition, null, `${restrictionType} must remain ambiguous.`);
    check(hasCode(result.issues, "LEGACY_RESTRICTION_REQUIRES_REVIEW"), `${restrictionType} must require review.`);
  }
}

const dualMigration = migrateLegacyRoleplayRestriction({ ...targetInput, restriction: standard });
deepEqual(dualMigration.definition, standard, "Existing shared Restriction must not be overwritten.");
check(!dualMigration.migrationApplied, "Dual representation must not apply migration.");
check(hasCode(dualMigration.issues, "LEGACY_AND_SHARED_RESTRICTION_PRESENT"), "Dual migration needs the stable diagnostic.");
const malformedDual = migrateLegacyRoleplayRestriction({ ...targetInput, restriction: { bad: true } });
equal(malformedDual.definition, null, "Malformed existing shared Restriction must not be replaced from legacy data.");
check(hasCode(malformedDual.issues, "LEGACY_MIGRATION_BLOCKED_BY_INVALID_SHARED_RESTRICTION"), "Malformed shared data must block automatic legacy overwrite.");

for (const result of [noneMigration, targetMigration, circumstanceMigration, dualMigration]) {
  const semantic = JSON.stringify(result.definition);
  for (const forbidden of ["APPROVED", "reviewer", "timestamp", "provenance", "SEVERE_OATH", "HARSH", "credit", "discount"]) {
    check(!semantic.includes(forbidden), `Migration must not manufacture ${forbidden}.`);
  }
}

assert.ok(checks >= 120, `Expected at least 120 checks, received ${checks}.`);
console.log(`Restriction BuilderData persistence smoke passed (${checks} checks).`);
