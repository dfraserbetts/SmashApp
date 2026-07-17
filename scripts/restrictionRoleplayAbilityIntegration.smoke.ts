import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  defaultBuilderData,
  normalizeBuilderData,
  type CharacterBuilderData,
} from "../lib/characterBuilder/core";
import { createDefaultCharacterPower } from "../lib/characterBuilder/powers";
import {
  createDefaultRoleplayAbility,
  normalizeRoleplayAbility,
  renderRoleplayAbilityDescriptor,
  type RoleplayAbility,
} from "../lib/characterBuilder/roleplayAbilities";
import type { AbilityRestrictionDefinitionV1 } from "../lib/restrictions";
import {
  selectRestrictionAuthoringChoice,
  selectRestrictionOperator,
  selectRestrictionSubject,
  selectRestrictionTemplate,
  setCustomRestrictionNarrative,
  setRestrictionDraftValue,
  type RestrictionEditorDraft,
  type RestrictionStandardDraft,
} from "../lib/restrictions/editorModel";
import {
  getRoleplayAbilityRestrictionStateKey,
  getRoleplayAbilityRestrictionSummaryLabel,
  initializeRoleplayAbilityRestrictionStates,
  materializeRoleplayAbilityRestrictionStates,
  reconcileRoleplayAbilityRestrictionStates,
  rehydrateRoleplayAbilityRestrictionStates,
  replaceLegacyRoleplayRestrictionReview,
  resolveRoleplayAbilityRestrictionState,
  validateRawRoleplayAbilityRestrictionWrite,
  type RoleplayAbilityRestrictionEditorState,
  type RoleplayAbilityRestrictionStateMap,
} from "../lib/restrictions/roleplayAbilityEditorIntegration";
import {
  initializePlayerPowerRestrictionDrafts,
  materializePlayerPowerRestrictionDrafts,
} from "../lib/restrictions/playerPowerEditorIntegration";
import {
  applyAutomaticExpectedTargetsToPower,
  applyAutomaticExpectedTargetsToPowers,
} from "../lib/powers/expectedTargetEstimation";

let checks = 0;
function ok(value: unknown, message: string): asserts value {
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
  customNarrativeText: "Only after the warning bell rings.",
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
      campaignId: "campaign-a",
      valueKind: "ZONE",
      valueId: "moon-circle",
    },
  },
  customNarrativeText: null,
};
const unsupported: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "STANDARD_STRUCTURED",
  templateKey: "FUTURE_ROLEPLAY_TEMPLATE",
  templateVersion: 8,
  parameters: {
    operator: { kind: "SYSTEM_ENUM", valueKey: "FUTURE_OPERATOR" },
    amount: { kind: "COUNT", value: 3 },
  },
  customNarrativeText: null,
};

function ability(
  id: string,
  name: string,
  restriction: AbilityRestrictionDefinitionV1 | null,
  sortOrder = 0,
): RoleplayAbility {
  return {
    ...createDefaultRoleplayAbility(sortOrder),
    id,
    name,
    narrativeTheme: "A bounded test theme.",
    restriction,
  };
}

function data(roleplayAbilities: RoleplayAbility[]): CharacterBuilderData {
  return { ...defaultBuilderData(), roleplayAbilities };
}

function validStandardDraft(percentage = 50): RestrictionEditorDraft {
  let draft = selectRestrictionAuthoringChoice(
    { kind: "NONE" },
    "STANDARD_STRUCTURED",
  ) as RestrictionStandardDraft;
  draft = selectRestrictionSubject(draft, "THE_ACTOR") as RestrictionStandardDraft;
  draft = selectRestrictionTemplate(
    draft,
    "ACTOR_PHYSICAL_HEALTH_PERCENTAGE",
    1,
  ) as RestrictionStandardDraft;
  draft = selectRestrictionOperator(draft, "AT_OR_BELOW") as RestrictionStandardDraft;
  return setRestrictionDraftValue(
    draft,
    "percentage",
    { kind: "PERCENTAGE", value: percentage },
  );
}

const noneAbility = ability("roleplay-none", "None", null, 0);
const standardAbility = ability("roleplay-standard", "Standard", standard, 1);
const customAbility = ability("roleplay-custom", "Custom", custom, 2);
const campaignAbility = ability("roleplay-campaign", "Campaign", campaignCustom, 3);
const unsupportedAbility = ability("roleplay-unsupported", "Future", unsupported, 4);
const initialData = data([
  noneAbility,
  standardAbility,
  customAbility,
  campaignAbility,
  unsupportedAbility,
]);

// Initialization and semantic state coverage.
const initialized = initializeRoleplayAbilityRestrictionStates(initialData);
deepEqual(Object.keys(initialized).sort(), [
  "roleplay-campaign",
  "roleplay-custom",
  "roleplay-none",
  "roleplay-standard",
  "roleplay-unsupported",
].sort(), "Initialization keys Roleplay Restriction state only by stable Ability ID.");
equal(getRoleplayAbilityRestrictionStateKey(noneAbility), "roleplay-none", "Stable key uses the Ability ID.");
equal(getRoleplayAbilityRestrictionStateKey({ id: " " }), null, "Blank Ability IDs cannot become keys.");
equal(initialized[noneAbility.id]?.kind, "EDITOR", "No Restriction initializes an editor state.");
equal(initialized[standardAbility.id]?.kind, "EDITOR", "Standard initializes an editor state.");
equal(initialized[customAbility.id]?.kind, "EDITOR", "Custom initializes an editor state.");
equal(initialized[campaignAbility.id]?.kind, "EDITOR", "Campaign-Custom initializes a read-only editor state.");
equal(initialized[unsupportedAbility.id]?.kind, "EDITOR", "Unsupported semantic data initializes a read-only editor state.");
const initializedStandard = initialized[standardAbility.id];
const initializedCustom = initialized[customAbility.id];
const initializedCampaign = initialized[campaignAbility.id];
const initializedUnsupported = initialized[unsupportedAbility.id];
if (initializedStandard?.kind === "EDITOR") equal(initializedStandard.draft.kind, "STANDARD", "Standard stays editable.");
if (initializedCustom?.kind === "EDITOR") equal(initializedCustom.draft.kind, "CUSTOM_NARRATIVE", "Custom stays editable.");
if (initializedCampaign?.kind === "EDITOR") equal(initializedCampaign.draft.kind, "CAMPAIGN_CUSTOM_READ_ONLY", "Campaign-Custom stays read-only.");
if (initializedUnsupported?.kind === "EDITOR") equal(initializedUnsupported.draft.kind, "UNSUPPORTED_READ_ONLY", "Unknown template stays read-only.");

// Safe migration and exact unresolved legacy review details.
const safeLegacyBuilder = normalizeBuilderData({
  ...defaultBuilderData(),
  roleplayAbilities: [{
    ...noneAbility,
    id: "roleplay-safe-legacy",
    restrictionType: "TARGET_ELIGIBILITY",
    restrictionBand: "HARSH",
    restrictionTag: "one sworn sentinel",
    restrictionText: "Old audit note.",
  }],
});
const safeLegacy = safeLegacyBuilder.roleplayAbilities[0]!;
equal(safeLegacy.restriction?.authoringMode, "CUSTOM_NARRATIVE", "Safe legacy data migrates before editor initialization.");
equal(safeLegacy.restriction?.customNarrativeText, "This Ability may only target one sworn sentinel.", "Safe migration preserves target eligibility separately.");
equal(safeLegacy.restrictionType, "NONE", "Safe migration neutralizes legacy type.");
equal(safeLegacy.restrictionBand, "NONE_COSMETIC", "Safe migration neutralizes legacy band.");
equal(safeLegacy.restrictionTag, "", "Safe migration clears legacy tag.");
equal(safeLegacy.restrictionText, "", "Safe migration clears legacy text.");
const safeState = initializeRoleplayAbilityRestrictionStates(safeLegacyBuilder)[safeLegacy.id];
equal(safeState?.kind, "EDITOR", "Safe legacy migration opens as a semantic editor state.");

const reviewBuilder = normalizeBuilderData({
  ...defaultBuilderData(),
  roleplayAbilities: [{
    ...noneAbility,
    id: "roleplay-review",
    name: "Old Oath",
    restrictionType: "OATH_BEHAVIOUR",
    restrictionBand: "SEVERE_OATH",
    restrictionTag: "the sworn company",
    restrictionText: "Never abandon the old road",
  }],
});
const reviewAbility = reviewBuilder.roleplayAbilities[0]!;
const reviewStates = initializeRoleplayAbilityRestrictionStates(reviewBuilder);
const reviewState = reviewStates[reviewAbility.id];
equal(reviewState?.kind, "LEGACY_REVIEW_REQUIRED", "Ambiguous legacy data becomes explicit review state.");
if (reviewState?.kind === "LEGACY_REVIEW_REQUIRED") {
  equal(reviewState.legacySource.restrictionType, "OATH_BEHAVIOUR", "Review preserves legacy type.");
  equal(reviewState.legacySource.restrictionBand, "SEVERE_OATH", "Review preserves legacy band.");
  equal(reviewState.legacySource.restrictionTag, "the sworn company", "Review preserves legacy tag.");
  equal(reviewState.legacySource.restrictionText, "Never abandon the old road", "Review preserves legacy text.");
  ok(reviewState.issues.some((issue) => issue.code === "LEGACY_RESTRICTION_REQUIRES_REVIEW"), "Review retains stable migration code.");
  equal(getRoleplayAbilityRestrictionSummaryLabel(reviewState), "Legacy Restriction Review Required", "Review summary is explicit.");
  const noneReplacement = replaceLegacyRoleplayRestrictionReview(reviewState, "NONE");
  const standardReplacement = replaceLegacyRoleplayRestrictionReview(reviewState, "STANDARD_STRUCTURED");
  const customReplacement = replaceLegacyRoleplayRestrictionReview(reviewState, "CUSTOM_NARRATIVE");
  equal(noneReplacement.kind, "EDITOR", "Review may be deliberately cleared.");
  equal(standardReplacement.kind, "EDITOR", "Review may be deliberately replaced with Standard.");
  equal(customReplacement.kind, "EDITOR", "Review may be deliberately replaced with Custom.");
  if (noneReplacement.kind === "EDITOR") equal(noneReplacement.draft.kind, "NONE", "None replacement does not copy old prose.");
  if (standardReplacement.kind === "EDITOR") equal(standardReplacement.draft.kind, "STANDARD", "Standard replacement starts empty.");
  if (customReplacement.kind === "EDITOR") {
    equal(customReplacement.draft.kind, "CUSTOM_NARRATIVE", "Custom replacement starts a Custom draft.");
    if (customReplacement.draft.kind === "CUSTOM_NARRATIVE") equal(customReplacement.draft.text, "", "Ambiguous prose is never copied automatically.");
  }
}

// Reconciliation follows identity through reorder, rename, ordinary edits, add, and remove.
const editedStates: RoleplayAbilityRestrictionStateMap = {
  ...initialized,
  [noneAbility.id]: { kind: "EDITOR", draft: { kind: "CUSTOM_NARRATIVE", text: "Transient draft" } },
};
const reordered = data([
  { ...customAbility, sortOrder: 0, name: "Renamed Custom" },
  { ...noneAbility, sortOrder: 1, narrativeTheme: "Ordinary edit" },
  standardAbility,
]);
const reconciled = reconcileRoleplayAbilityRestrictionStates(editedStates, reordered);
deepEqual(Object.keys(reconciled).sort(), ["roleplay-custom", "roleplay-none", "roleplay-standard"].sort(), "Removed Ability state is removed without disturbing survivors.");
deepEqual(reconciled[noneAbility.id], editedStates[noneAbility.id], "Transient state follows its stable ID through reorder and ordinary edits.");
deepEqual(reconciled[customAbility.id], editedStates[customAbility.id], "Rename does not transfer or recreate state.");
const addedAbility = ability("roleplay-added", "Added", null, 3);
const withAdd = reconcileRoleplayAbilityRestrictionStates(reconciled, data([...reordered.roleplayAbilities, addedAbility]));
equal(withAdd[addedAbility.id]?.kind, "EDITOR", "Add initializes a new independent state.");
const addedState = withAdd[addedAbility.id];
if (addedState?.kind === "EDITOR") equal(addedState.draft.kind, "NONE", "New Ability starts with No Restriction.");
ok(withAdd[addedAbility.id] !== withAdd[noneAbility.id], "State is never transferred between Ability IDs.");

// Resolution and summary labels cover every state.
const summaryCases: Array<[RoleplayAbilityRestrictionEditorState | undefined, string]> = [
  [{ kind: "EDITOR", draft: { kind: "NONE" } }, "No Restriction"],
  [{ kind: "EDITOR", draft: validStandardDraft() }, "Standard Restriction"],
  [{ kind: "EDITOR", draft: { kind: "CUSTOM_NARRATIVE", text: "Only after dawn." } }, "Fully Custom Restriction"],
  [initialized[campaignAbility.id], "Campaign-Custom Restriction"],
  [initialized[unsupportedAbility.id], "Unsupported Restriction"],
  [{ kind: "EDITOR", draft: selectRestrictionAuthoringChoice({ kind: "NONE" }, "STANDARD_STRUCTURED") }, "Incomplete Restriction Draft"],
  [{ kind: "EDITOR", draft: { kind: "MALFORMED_READ_ONLY", issues: [{ code: "BAD", severity: "error", message: "Bad" }] } }, "Invalid Restriction Draft"],
] as Array<[RoleplayAbilityRestrictionEditorState | undefined, string]>;
for (const [state, label] of summaryCases) {
  equal(getRoleplayAbilityRestrictionSummaryLabel(state), label, `${label} summary must remain distinct.`);
}
equal(getRoleplayAbilityRestrictionSummaryLabel(undefined), "Invalid Restriction Draft", "Missing UI state is visibly invalid.");

// Successful materialization persists shared semantics and neutralizes every legacy field.
const sourceBefore = structuredClone(initialData);
const statesBefore = structuredClone(initialized);
const materialized = materializeRoleplayAbilityRestrictionStates(initialData, initialized, "campaign-a");
ok(materialized.ok, "All supported semantic states materialize.");
deepEqual(materialized.builderData.roleplayAbilities.map((entry) => entry.restriction), [
  null,
  standard,
  custom,
  campaignCustom,
  unsupported,
], "None, Standard, Custom, Campaign-Custom, and unsupported definitions persist exactly.");
for (const entry of materialized.builderData.roleplayAbilities) {
  equal(entry.restrictionType, "NONE", `${entry.name} writes neutral legacy type.`);
  equal(entry.restrictionBand, "NONE_COSMETIC", `${entry.name} writes neutral legacy band.`);
  equal(entry.restrictionTag, "", `${entry.name} clears legacy tag.`);
  equal(entry.restrictionText, "", `${entry.name} clears legacy text.`);
}
deepEqual(initialData, sourceBefore, "Materialization never mutates builderData or Roleplay Abilities.");
deepEqual(initialized, statesBefore, "Materialization never mutates the state map or definitions.");

// Draft changes persist, warning-only Custom succeeds, and stale semantic fallback is forbidden.
const editedMaterialization = materializeRoleplayAbilityRestrictionStates(
  data([noneAbility, standardAbility, customAbility]),
  {
    [noneAbility.id]: { kind: "EDITOR", draft: validStandardDraft(25) },
    [standardAbility.id]: { kind: "EDITOR", draft: { kind: "NONE" } },
    [customAbility.id]: {
      kind: "EDITOR",
      draft: setCustomRestrictionNarrative(
        { kind: "CUSTOM_NARRATIVE", text: "" },
        "Only while the bell rings and the gate remains open.",
      ),
    },
  },
  "campaign-a",
);
ok(editedMaterialization.ok, "Warnings do not block materialization.");
equal(editedMaterialization.builderData.roleplayAbilities[0]?.restriction?.parameters.percentage?.kind, "PERCENTAGE", "Edited Standard persists.");
equal(editedMaterialization.builderData.roleplayAbilities[1]?.restriction, null, "Deliberate None clears an old semantic definition.");
equal(editedMaterialization.builderData.roleplayAbilities[2]?.restriction?.authoringMode, "CUSTOM_NARRATIVE", "Warning-only Custom persists.");

const incompleteDraft = selectRestrictionAuthoringChoice({ kind: "NONE" }, "STANDARD_STRUCTURED");
const staleBlocked = materializeRoleplayAbilityRestrictionStates(
  data([standardAbility]),
  { [standardAbility.id]: { kind: "EDITOR", draft: incompleteDraft } },
  "campaign-a",
);
ok(!staleBlocked.ok, "Incomplete draft blocks save.");
if (!staleBlocked.ok) {
  equal(staleBlocked.builderData, null, "Incomplete draft produces no payload.");
  equal(staleBlocked.issues[0]?.resolutionStatus, "INCOMPLETE", "Incomplete status remains inspectable.");
}
deepEqual(standardAbility.restriction, standard, "Blocked save does not mutate or return stale semantic authority.");
const malformedBlocked = materializeRoleplayAbilityRestrictionStates(
  data([standardAbility]),
  { [standardAbility.id]: { kind: "EDITOR", draft: { kind: "MALFORMED_READ_ONLY", issues: [{ code: "MALFORMED", severity: "error", message: "Malformed stored definition." }] } } },
  "campaign-a",
);
ok(!malformedBlocked.ok, "Malformed read-only state blocks save.");
if (!malformedBlocked.ok) equal(malformedBlocked.issues[0]?.resolutionStatus, "INVALID", "Malformed state resolves as invalid.");
const legacyBlocked = materializeRoleplayAbilityRestrictionStates(reviewBuilder, reviewStates, "campaign-a");
ok(!legacyBlocked.ok, "Unresolved legacy review blocks unrelated saves.");
if (!legacyBlocked.ok) {
  equal(legacyBlocked.builderData, null, "Legacy review produces no API payload.");
  equal(legacyBlocked.issues[0]?.abilityId, "roleplay-review", "Legacy block identifies stable Ability ID.");
  equal(legacyBlocked.issues[0]?.abilityIndex, 0, "Legacy block identifies Ability index.");
  equal(legacyBlocked.issues[0]?.abilityName, "Old Oath", "Legacy block identifies visible name.");
  equal(legacyBlocked.issues[0]?.resolutionStatus, "LEGACY_REVIEW_REQUIRED", "Legacy status remains explicit.");
}
const missingState = materializeRoleplayAbilityRestrictionStates(data([noneAbility]), {}, "campaign-a");
ok(!missingState.ok, "Missing transient state blocks save.");
if (!missingState.ok) equal(missingState.issues[0]?.resolutionStatus, "MISSING_STATE", "Missing state has a stable status.");
const missingIdAbility = { ...noneAbility, id: "" };
const missingId = materializeRoleplayAbilityRestrictionStates(data([missingIdAbility]), {}, "campaign-a");
ok(!missingId.ok, "Missing stable Ability identity blocks save.");
if (!missingId.ok) equal(missingId.issues[0]?.resolutionStatus, "MISSING_ABILITY_ID", "Missing ID has a stable status.");
const crossCampaignMaterialization = materializeRoleplayAbilityRestrictionStates(
  data([campaignAbility]),
  initializeRoleplayAbilityRestrictionStates(data([campaignAbility])),
  "campaign-b",
);
ok(!crossCampaignMaterialization.ok, "Campaign-Custom data from another campaign blocks materialization.");
if (!crossCampaignMaterialization.ok) equal(crossCampaignMaterialization.issues[0]?.issueCodes[0], "CROSS_CAMPAIGN_REFERENCE", "Cross-campaign materialization code is stable.");

// Authoritative response rehydration discards stale transient state only after success.
const authoritative = data([{ ...noneAbility, restriction: custom }]);
const rehydrated = rehydrateRoleplayAbilityRestrictionStates(authoritative);
equal(rehydrated[noneAbility.id]?.kind, "EDITOR", "Authoritative response rehydrates editor state.");
const rehydratedNone = rehydrated[noneAbility.id];
if (rehydratedNone?.kind === "EDITOR") equal(rehydratedNone.draft.kind, "CUSTOM_NARRATIVE", "Authoritative semantic definition replaces stale transient state.");
const resolvedRehydrated = rehydrated[noneAbility.id]
  ? resolveRoleplayAbilityRestrictionState(rehydrated[noneAbility.id])
  : null;
deepEqual(resolvedRehydrated?.definition, custom, "Rehydrated resolution matches authoritative response.");

// Ordinary target grammar remains Scope-owned and semantic prose remains separate.
const migratedTarget = normalizeRoleplayAbility({
  ...noneAbility,
  scope: "ONE_TARGET",
  diceCount: 2,
  restrictionType: "TARGET_ELIGIBILITY",
  restrictionBand: "HARSH",
  restrictionTag: "an Agent of Morgoth",
}, 0);
ok(renderRoleplayAbilityDescriptor(migratedTarget).startsWith("Choose one target and roll 2 dice."), "Migrated Target Eligibility cannot rewrite ordinary target grammar.");
ok(!renderRoleplayAbilityDescriptor(migratedTarget).includes("Agent of Morgoth"), "Ordinary descriptor never contains migrated Restriction prose.");
const semanticTarget = { ...migratedTarget, restriction: custom };
equal(renderRoleplayAbilityDescriptor(semanticTarget), renderRoleplayAbilityDescriptor(migratedTarget), "Semantic Restriction cannot rewrite ordinary descriptor.");
const selfTarget = { ...migratedTarget, scope: "SELF" as const };
ok(renderRoleplayAbilityDescriptor(selfTarget).startsWith("Roll 2 dice."), "Self descriptor remains unchanged.");

// Raw server guard accepts only semantic authority plus neutral or absent legacy fields.
const rawBase = { id: "raw-roleplay", name: "Raw Ability" };
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [rawBase] }, "campaign-a"), null, "Absent semantic and legacy fields are accepted.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restriction: null }] }, "campaign-a"), null, "Explicit null is accepted.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restriction: standard }] }, "campaign-a"), null, "Valid Standard is accepted.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restriction: custom }] }, "campaign-a"), null, "Valid Custom is accepted.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restriction: campaignCustom }] }, "campaign-a"), null, "Same-campaign Campaign-Custom is accepted.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restriction: unsupported }] }, "campaign-a"), null, "Safe unknown template is accepted.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{
  ...rawBase,
  restriction: standard,
  restrictionType: "NONE",
  restrictionBand: "NONE_COSMETIC",
  restrictionTag: "",
  restrictionText: "",
}] }, "campaign-a"), null, "Fully neutral legacy fields are accepted beside semantic authority.");
equal(validateRawRoleplayAbilityRestrictionWrite({ powers: [{ restriction: { bad: true } }] }, "campaign-a"), null, "Roleplay guard ignores Player Power fields.");

const malformedWrite = validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restriction: { bad: true } }] }, "campaign-a");
equal(malformedWrite?.code, "UNSUPPORTED_SCHEMA_VERSION", "Malformed definition is rejected.");
equal(malformedWrite?.abilityIndex, 0, "Raw error contains Roleplay index.");
equal(malformedWrite?.abilityId, "raw-roleplay", "Raw error contains stable ID.");
equal(malformedWrite?.abilityName, "Raw Ability", "Raw error contains visible name.");
ok(malformedWrite?.clientMessage.includes("Roleplay Ability 1 \"Raw Ability\"") === true, "Raw client message contains stable readable identity.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restriction: { ...standard, and: [standard] } }] }, "campaign-a")?.code, "COMPOUND_STRUCTURE", "Fatal compound definition is rejected.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restriction: { ...standard, source: "ability_effect" } }] }, "campaign-a")?.code, "PROHIBITED_ABILITY_SOURCE", "Governed Ability self-satisfaction is rejected.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restriction: campaignCustom }] }, "campaign-b")?.code, "CROSS_CAMPAIGN_REFERENCE", "Cross-campaign reference is rejected.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restrictionType: "OATH_BEHAVIOUR" }] }, "campaign-a")?.code, "LEGACY_ROLEPLAY_RESTRICTION_WRITE_REJECTED", "Non-neutral legacy-only write is rejected.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restriction: standard, restrictionBand: "HARSH" }] }, "campaign-a")?.code, "ROLEPLAY_RESTRICTION_DUAL_WRITE", "Dual semantic and legacy write is rejected.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restrictionType: 4 }] }, "campaign-a")?.code, "MALFORMED_LEGACY_ROLEPLAY_RESTRICTION", "Malformed legacy type is rejected.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restrictionBand: "NOPE" }] }, "campaign-a")?.code, "MALFORMED_LEGACY_ROLEPLAY_RESTRICTION", "Malformed legacy option is rejected.");
equal(validateRawRoleplayAbilityRestrictionWrite({ roleplayAbilities: [{ ...rawBase, restrictionTag: 5 }] }, "campaign-a")?.code, "MALFORMED_LEGACY_ROLEPLAY_RESTRICTION", "Malformed legacy text type is rejected.");

// Complete Character Builder order: automatic targets, Player materialization, then Roleplay.
const power = { ...createDefaultCharacterPower(0), id: "pipeline-power", restriction: standard };
const pipelineSource = {
  ...data([{ ...noneAbility, restriction: custom }]),
  powers: [power],
};
const automatic = {
  ...pipelineSource,
  powers: applyAutomaticExpectedTargetsToPowers(pipelineSource.powers, { source: "FALLBACK_STANDARD_TEAM_SIZE_4", totalTeamSize: 4 }),
  signatureMove: pipelineSource.signatureMove
    ? applyAutomaticExpectedTargetsToPower(pipelineSource.signatureMove, { source: "FALLBACK_STANDARD_TEAM_SIZE_4", totalTeamSize: 4 })
    : null,
};
const playerMaterialized = materializePlayerPowerRestrictionDrafts(
  automatic,
  initializePlayerPowerRestrictionDrafts(automatic),
);
ok(playerMaterialized.ok, "Existing Player materialization remains intact.");
const roleplayMaterialized = playerMaterialized.ok
  ? materializeRoleplayAbilityRestrictionStates(
      playerMaterialized.builderData,
      initializeRoleplayAbilityRestrictionStates(playerMaterialized.builderData),
      "campaign-a",
    )
  : null;
ok(roleplayMaterialized?.ok, "Roleplay materialization follows successful Player materialization.");
if (roleplayMaterialized?.ok) {
  equal(validateRawRoleplayAbilityRestrictionWrite(roleplayMaterialized.builderData, "campaign-a"), null, "Final materialized payload passes the raw Roleplay guard.");
  const jsonRoundTrip = normalizeBuilderData(JSON.parse(JSON.stringify(roleplayMaterialized.builderData)));
  deepEqual(jsonRoundTrip.roleplayAbilities[0]?.restriction, custom, "JSON/API normalization preserves semantic Roleplay Restriction.");
  const hydratedPipeline = rehydrateRoleplayAbilityRestrictionStates(jsonRoundTrip);
  const hydratedPipelineState = hydratedPipeline[noneAbility.id];
  if (hydratedPipelineState?.kind === "EDITOR") equal(hydratedPipelineState.draft.kind, "CUSTOM_NARRATIVE", "Authoritative API response hydrates the correct stable state.");
}

// UI and route wiring remain bounded and atomic.
const builderSource = readFileSync("app/campaign/[id]/characters/[characterId]/builder/page.tsx", "utf8");
const routeSource = readFileSync("app/api/campaigns/[id]/characters/[characterId]/builder/route.ts", "utf8");
const reviewSource = readFileSync("app/components/restrictions/LegacyRoleplayRestrictionReview.tsx", "utf8");
ok(!builderSource.includes("Additional Restriction Type"), "Legacy Additional Restriction Type control is removed.");
ok(!builderSource.includes("ROLEPLAY_RESTRICTION_TYPE_OPTIONS"), "Legacy type option source is not used by the live builder.");
ok(!builderSource.includes("ROLEPLAY_RESTRICTION_BAND_OPTIONS"), "Legacy band option source is not used by the live builder.");
ok(!builderSource.includes("Restricted target phrase"), "Legacy target phrase control is removed.");
ok(builderSource.includes("<RestrictionEditor"), "Shared RestrictionEditor is used for editable Roleplay Abilities.");
ok(builderSource.includes("consumerNoun=\"Ability\""), "Roleplay editor uses the Ability noun.");
ok(builderSource.includes("<RestrictionReadOnly"), "Non-editable Roleplay uses RestrictionReadOnly.");
ok(builderSource.includes("<LegacyRoleplayRestrictionReview"), "Dedicated legacy review panel is wired.");
ok(builderSource.includes("This Restriction applies to the complete Ability."), "Whole-Ability authority note is present.");
ok(builderSource.includes("data-roleplay-restriction-summary=\"true\""), "Compact Restriction summary exists.");
ok(builderSource.indexOf("data-roleplay-restriction-summary=\"true\"") > builderSource.indexOf("</button>", builderSource.indexOf("abilityCollapseKey")), "Restriction summary is outside the collapse button.");
ok(builderSource.indexOf("Generated Descriptor") < builderSource.indexOf("data-testid=\"roleplay-ability-whole-restriction-editor\""), "Generated descriptor remains separate before Restriction authority.");
equal((builderSource.match(/builderData: finalMaterializedBuilderData/g) ?? []).length, 1, "Reusable save operation owns the single final materialized payload.");
equal((builderSource.match(/saveCharacterDraft\(\)/g) ?? []).length >= 3, true, "Save, equipment sync, and governance submission reuse the authoritative save operation.");
equal((builderSource.match(/rehydrateRoleplayAbilityRestrictionStates/g) ?? []).length >= 2, true, "Load and reusable save success rehydrate authoritative Roleplay states.");
ok(routeSource.indexOf("validateRawRoleplayAbilityRestrictionWrite") < routeSource.indexOf("normalizeBuilderData(body.builderData)"), "Raw Roleplay guard runs before normalization destroys evidence.");
ok(reviewSource.includes("Legacy Restriction Type"), "Review panel displays legacy type.");
ok(reviewSource.includes("Legacy Restriction Band"), "Review panel displays legacy band without economic authority.");
ok(reviewSource.includes("Legacy Target Phrase"), "Review panel displays legacy tag.");
ok(reviewSource.includes("Legacy Restriction Text"), "Review panel displays legacy text.");
ok(reviewSource.includes("window.confirm"), "Every legacy replacement requires deliberate confirmation.");
ok(!reviewSource.includes("setCustomRestrictionNarrative"), "Review UI never copies ambiguous prose into Custom Narrative.");

assert.ok(checks >= 130, `Expected at least 130 checks, received ${checks}.`);
console.log(`Restriction Roleplay Ability integration smoke passed (${checks} checks).`);
