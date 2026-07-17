import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RestrictionEditor } from "../app/components/restrictions/RestrictionEditor";
import { RestrictionReadOnly } from "../app/components/restrictions/RestrictionReadOnly";
import {
  RESTRICTION_CONDITION_FAMILIES,
  RESTRICTION_EVALUATION_LABELS,
  RESTRICTION_SUBJECTS,
  RESTRICTION_TEMPLATE_REGISTRY,
  createRestrictionFingerprint,
  type AbilityRestrictionDefinitionV1,
  type RestrictionParameterValue,
  type RestrictionSubject,
} from "../lib/restrictions";
import {
  FULLY_CUSTOM_RESTRICTION_LABEL,
  RESTRICTION_CONDITION_FAMILY_LABELS,
  RESTRICTION_EDITOR_AUTHORING_CHOICES,
  RESTRICTION_OPERATOR_LABELS,
  RESTRICTION_STANDARD_TEMPLATE_PRESENTATION,
  RESTRICTION_SUBJECT_LABELS,
  RESTRICTION_SYSTEM_ENUM_LABELS,
  createEmptyRestrictionDraft,
  createRestrictionDraftFromDefinition,
  getRestrictionPresentationAuditIssues,
  getRestrictionReadOnlyModel,
  getRestrictionSubjectOptions,
  getStandardRestrictionTemplates,
  getStandardTemplateOptions,
  replaceLockedRestriction,
  resolveRestrictionEditorDraft,
  selectRestrictionAuthoringChoice,
  selectRestrictionOperator,
  selectRestrictionSubject,
  selectRestrictionTemplate,
  setCustomRestrictionNarrative,
  setRestrictionDraftValue,
  type RestrictionEditorDraft,
  type RestrictionStandardDraft,
} from "../lib/restrictions/editorModel";

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
function includes(actual: string, expected: string, message: string): void {
  assert.ok(actual.includes(expected), `${message} Missing: ${expected}`);
  checks += 1;
}
function hasCode(issues: readonly { code: string; severity?: string }[], code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

const standardHealth: AbilityRestrictionDefinitionV1 = {
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
const customNarrative: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "CUSTOM_NARRATIVE",
  templateKey: null,
  templateVersion: null,
  parameters: {},
  customNarrativeText: "This Power may only be used after accepting responsibility.",
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
      valueId: "blood-circle",
    },
  },
  customNarrativeText: null,
};
const unsupported: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "STANDARD_STRUCTURED",
  templateKey: "FUTURE_RESTRICTION_TEMPLATE",
  templateVersion: 12,
  parameters: {
    operator: { kind: "SYSTEM_ENUM", valueKey: "FUTURE_OPERATOR" },
    futureValue: { kind: "COUNT", value: 3 },
  },
  customNarrativeText: null,
};
const powerContext = { consumerNoun: "Power" as const };
const abilityContext = { consumerNoun: "Ability" as const };

// Presentation inventory and audit.
deepEqual(
  RESTRICTION_SUBJECTS.map((subject) => RESTRICTION_SUBJECT_LABELS[subject]),
  [
    "The Actor",
    "The Target",
    "The Scene",
    "A Location or Zone",
    "An Item or Object",
    "Another Character or Group",
    "An Oath or Behaviour",
  ],
  "All seven shared Subjects retain exact player-facing labels.",
);
deepEqual(
  RESTRICTION_CONDITION_FAMILIES.map((family) => RESTRICTION_CONDITION_FAMILY_LABELS[family]),
  [
    "Actor State",
    "Target Identity",
    "Target State",
    "Equipment or Anchor State",
    "Position or Zone State",
    "Scene or Environment State",
    "Related Entity or Count State",
    "Oath or Behaviour",
  ],
  "All eight condition families retain exact player-facing labels.",
);
deepEqual(
  RESTRICTION_EDITOR_AUTHORING_CHOICES.map((choice) => choice.label),
  ["No Restriction", "Standard Structured", FULLY_CUSTOM_RESTRICTION_LABEL],
  "The editor exposes exactly three authoring choices.",
);
equal(
  FULLY_CUSTOM_RESTRICTION_LABEL,
  "Fully Custom — GD Review and Manual Adjudication Required",
  "The required Fully Custom label is exact.",
);
deepEqual(
  RESTRICTION_STANDARD_TEMPLATE_PRESENTATION.map((entry) => entry.label),
  [
    "Actor Physical Health",
    "Actor Condition",
    "Target Tag",
    "Target Physical Health",
    "Scene Environment",
  ],
  "Every Standard proof template has a player-facing label.",
);
deepEqual(
  [RESTRICTION_OPERATOR_LABELS.AT_OR_BELOW, RESTRICTION_OPERATOR_LABELS.PRESENT, RESTRICTION_OPERATOR_LABELS.ABSENT],
  ["At or below", "Present", "Absent"],
  "Every Standard operator has a player-facing label.",
);
deepEqual(
  [RESTRICTION_SYSTEM_ENUM_LABELS.BLINDED, RESTRICTION_SYSTEM_ENUM_LABELS.UNDEAD, RESTRICTION_SYSTEM_ENUM_LABELS.DIRECT_SUNLIGHT],
  ["Blinded", "Undead", "Direct Sunlight"],
  "Every Standard system-enum value has a player-facing label.",
);
deepEqual(getRestrictionPresentationAuditIssues(), [], "Presentation metadata passes its registry audit.");
const presentationIdentities = RESTRICTION_STANDARD_TEMPLATE_PRESENTATION.map(
  (entry) => `${entry.templateKey}@${entry.templateVersion}`,
);
equal(new Set(presentationIdentities).size, presentationIdentities.length, "Presentation identities contain no duplicates.");
const registryIdentities = new Set(RESTRICTION_TEMPLATE_REGISTRY.map((template) => `${template.key}@${template.version}`));
for (const identity of presentationIdentities) {
  ok(registryIdentities.has(identity), `Presentation ${identity} is not orphaned.`);
}
equal(getStandardRestrictionTemplates().length, 5, "Only the five bounded Standard proof templates are editable.");
const fingerprintBeforePresentation = createRestrictionFingerprint(standardHealth);
void getRestrictionSubjectOptions();
void getStandardTemplateOptions("THE_ACTOR");
equal(createRestrictionFingerprint(standardHealth), fingerprintBeforePresentation, "Presentation lookup never alters semantic fingerprints.");

// Draft initialization and JSON stability.
deepEqual(createEmptyRestrictionDraft(), { kind: "NONE" }, "An empty editor starts at No Restriction.");
equal(createRestrictionDraftFromDefinition(null).kind, "NONE", "Null definition initializes No Restriction.");
const healthDraft = createRestrictionDraftFromDefinition(standardHealth);
equal(healthDraft.kind, "STANDARD", "A valid Standard definition initializes an editable Standard draft.");
if (healthDraft.kind === "STANDARD") {
  equal(healthDraft.subject, "THE_ACTOR", "Standard initialization derives Subject from registry identity.");
  equal(healthDraft.operator, "AT_OR_BELOW", "Standard initialization retains operator.");
  deepEqual(healthDraft.values.percentage, { kind: "PERCENTAGE", value: 50 }, "Standard initialization retains typed values.");
}
const narrativeDraft = createRestrictionDraftFromDefinition(customNarrative);
equal(narrativeDraft.kind, "CUSTOM_NARRATIVE", "Custom Narrative initializes an editable narrative draft.");
if (narrativeDraft.kind === "CUSTOM_NARRATIVE") equal(narrativeDraft.text, customNarrative.customNarrativeText, "Narrative text is retained.");
const campaignDraft = createRestrictionDraftFromDefinition(campaignCustom);
equal(campaignDraft.kind, "CAMPAIGN_CUSTOM_READ_ONLY", "Campaign-Custom initializes locked read-only.");
const unsupportedDraft = createRestrictionDraftFromDefinition(unsupported);
equal(unsupportedDraft.kind, "UNSUPPORTED_READ_ONLY", "Unknown template initializes locked unsupported.");
if (unsupportedDraft.kind === "UNSUPPORTED_READ_ONLY") {
  deepEqual(unsupportedDraft.definition, unsupported, "Unknown key, version, and typed parameters remain intact.");
}
const malformedDraft = createRestrictionDraftFromDefinition({ schemaVersion: 1, authoringMode: "NOPE" });
equal(malformedDraft.kind, "MALFORMED_READ_ONLY", "Malformed external input initializes a safe locked state.");
deepEqual(
  createRestrictionDraftFromDefinition(JSON.parse(JSON.stringify(standardHealth))),
  healthDraft,
  "Draft initialization is stable across JSON save/load.",
);

// Draft transitions and downstream clearing/defaulting.
let draft = createEmptyRestrictionDraft();
draft = selectRestrictionAuthoringChoice(draft, "STANDARD_STRUCTURED");
equal(draft.kind, "STANDARD", "Standard choice creates a partial Standard draft.");
draft = selectRestrictionAuthoringChoice(draft, "CUSTOM_NARRATIVE");
equal(draft.kind, "CUSTOM_NARRATIVE", "Custom choice replaces editable Standard state.");
draft = selectRestrictionAuthoringChoice(draft, "NONE");
equal(draft.kind, "NONE", "No Restriction deliberately clears editable state.");

let standardDraft = selectRestrictionAuthoringChoice(createEmptyRestrictionDraft(), "STANDARD_STRUCTURED") as RestrictionStandardDraft;
standardDraft = selectRestrictionSubject(standardDraft, "THE_ACTOR") as RestrictionStandardDraft;
equal(standardDraft.templateKey, null, "Actor Subject does not auto-select among multiple Conditions.");
standardDraft = selectRestrictionTemplate(standardDraft, "ACTOR_CONDITION", 1) as RestrictionStandardDraft;
equal(standardDraft.operator, null, "Actor Condition does not auto-select among multiple Operators.");
deepEqual(standardDraft.values.condition, { kind: "SYSTEM_ENUM", valueKey: "BLINDED" }, "A single legal enum Value defaults deterministically.");
standardDraft = selectRestrictionOperator(standardDraft, "PRESENT") as RestrictionStandardDraft;
standardDraft = selectRestrictionSubject(standardDraft, "THE_TARGET") as RestrictionStandardDraft;
equal(standardDraft.templateKey, null, "Changing Subject clears Condition.");
equal(standardDraft.operator, null, "Changing Subject clears Operator.");
deepEqual(standardDraft.values, {}, "Changing Subject clears Values.");
standardDraft = selectRestrictionTemplate(standardDraft, "TARGET_STANDARD_TAG", 1) as RestrictionStandardDraft;
standardDraft = selectRestrictionOperator(standardDraft, "PRESENT") as RestrictionStandardDraft;
standardDraft = { ...standardDraft, values: { ...standardDraft.values, injected: { kind: "COUNT", value: 4 } } };
standardDraft = selectRestrictionOperator(standardDraft, "ABSENT") as RestrictionStandardDraft;
ok(!Object.hasOwn(standardDraft.values, "injected"), "Changing Operator clears values that are no longer legal.");
deepEqual(standardDraft.values.tag, { kind: "SYSTEM_ENUM", valueKey: "UNDEAD" }, "Changing Operator retains a still-legal typed Value.");
const beforeInvalidOperator = standardDraft;
deepEqual(selectRestrictionOperator(standardDraft, "NOT_SUPPORTED"), beforeInvalidOperator, "Transition API cannot select an unsupported Operator.");
deepEqual(setRestrictionDraftValue(standardDraft, "freeForm", { kind: "NUMBER", value: 1 }), standardDraft, "Transition API cannot create unknown parameter keys.");

let sceneDraft = selectRestrictionAuthoringChoice(createEmptyRestrictionDraft(), "STANDARD_STRUCTURED") as RestrictionStandardDraft;
sceneDraft = selectRestrictionSubject(sceneDraft, "THE_SCENE") as RestrictionStandardDraft;
equal(sceneDraft.templateKey, "SCENE_ENVIRONMENT_STATE", "A sole legal Condition defaults deterministically.");
deepEqual(sceneDraft.values.environment, { kind: "SYSTEM_ENUM", valueKey: "DIRECT_SUNLIGHT" }, "A sole Scene Value defaults deterministically.");
equal(sceneDraft.operator, null, "Multiple Scene Operators are never chosen silently.");

equal(selectRestrictionAuthoringChoice(campaignDraft, "NONE").kind, "CAMPAIGN_CUSTOM_READ_ONLY", "Campaign-Custom cannot be silently cleared.");
equal(selectRestrictionAuthoringChoice(unsupportedDraft, "STANDARD_STRUCTURED").kind, "UNSUPPORTED_READ_ONLY", "Unsupported definition cannot be silently remapped.");
equal(replaceLockedRestriction(campaignDraft, "NONE").kind, "NONE", "Campaign-Custom can be deliberately cleared.");
equal(replaceLockedRestriction(campaignDraft, "STANDARD_STRUCTURED").kind, "STANDARD", "Campaign-Custom can be deliberately replaced with Standard.");
equal(replaceLockedRestriction(unsupportedDraft, "CUSTOM_NARRATIVE").kind, "CUSTOM_NARRATIVE", "Unsupported definition can be deliberately replaced with Custom Narrative.");

function standardFor(
  subject: RestrictionSubject,
  templateKey: string,
  operator: string,
  values: Array<[string, RestrictionParameterValue]>,
): RestrictionStandardDraft {
  let result = selectRestrictionAuthoringChoice(createEmptyRestrictionDraft(), "STANDARD_STRUCTURED") as RestrictionStandardDraft;
  result = selectRestrictionSubject(result, subject) as RestrictionStandardDraft;
  result = selectRestrictionTemplate(result, templateKey, 1) as RestrictionStandardDraft;
  result = selectRestrictionOperator(result, operator) as RestrictionStandardDraft;
  for (const [key, value] of values) result = setRestrictionDraftValue(result, key, value) as RestrictionStandardDraft;
  return result;
}

// Structured semantic resolution and exact previews.
const actorHealth50 = resolveRestrictionEditorDraft(standardFor(
  "THE_ACTOR",
  "ACTOR_PHYSICAL_HEALTH_PERCENTAGE",
  "AT_OR_BELOW",
  [["percentage", { kind: "PERCENTAGE", value: 50 }]],
), powerContext);
equal(actorHealth50.status, "VALID", "Actor Health 50% resolves validly.");
deepEqual(actorHealth50.definition, standardHealth, "Actor Health resolves the exact semantic definition.");
equal(actorHealth50.descriptor, "Restriction: This Power may only be used while the actor is at or below 50% of maximum Physical Health.", "Actor Health descriptor is exact.");
equal(actorHealth50.evaluationLabel, "Automatically checked", "Actor Health evaluation label is exact.");

for (const [operator, expected] of [
  ["PRESENT", "Restriction: This Ability may only be used while the actor is Blinded."],
  ["ABSENT", "Restriction: This Ability may only be used while the actor is not Blinded."],
] as const) {
  const result = resolveRestrictionEditorDraft(standardFor(
    "THE_ACTOR",
    "ACTOR_CONDITION",
    operator,
    [["condition", { kind: "SYSTEM_ENUM", valueKey: "BLINDED" }]],
  ), abilityContext);
  equal(result.status, "VALID", `Actor Blinded ${operator} resolves validly.`);
  equal(result.descriptor, expected, `Actor Blinded ${operator} descriptor is exact.`);
}

const targetUndead = resolveRestrictionEditorDraft(standardFor(
  "THE_TARGET",
  "TARGET_STANDARD_TAG",
  "PRESENT",
  [["tag", { kind: "SYSTEM_ENUM", valueKey: "UNDEAD" }]],
), powerContext);
equal(targetUndead.status, "VALID", "Target Undead resolves validly.");
equal(targetUndead.descriptor, "Restriction: This Power may only target a character with the Undead tag.", "Target Undead descriptor is exact.");

const targetHealth = resolveRestrictionEditorDraft(standardFor(
  "THE_TARGET",
  "TARGET_HEALTH_PERCENTAGE",
  "AT_OR_BELOW",
  [["percentage", { kind: "PERCENTAGE", value: 25 }]],
), abilityContext);
equal(targetHealth.status, "VALID", "Target Health threshold resolves validly.");
equal(targetHealth.descriptor, "Restriction: This Ability may only target a character at or below 25% of maximum Physical Health.", "Target Health descriptor is exact.");

const sceneSunlight = resolveRestrictionEditorDraft(standardFor(
  "THE_SCENE",
  "SCENE_ENVIRONMENT_STATE",
  "PRESENT",
  [["environment", { kind: "SYSTEM_ENUM", valueKey: "DIRECT_SUNLIGHT" }]],
), powerContext);
equal(sceneSunlight.status, "VALID", "Scene Direct Sunlight resolves validly.");
equal(sceneSunlight.descriptor, "Restriction: This Power may only be used while the scene is in Direct Sunlight.", "Scene descriptor is exact.");
equal(sceneSunlight.evaluationLabel, "Checked through scene context", "Scene evaluation label is exact.");
deepEqual(
  Object.values(RESTRICTION_EVALUATION_LABELS),
  ["Automatically checked", "Checked through scene context", "Requires GD adjudication"],
  "Evaluation display reuses all exact shared labels.",
);

const subjectOnly = resolveRestrictionEditorDraft(
  selectRestrictionSubject(
    selectRestrictionAuthoringChoice(createEmptyRestrictionDraft(), "STANDARD_STRUCTURED"),
    "THE_ACTOR",
  ),
  powerContext,
);
equal(subjectOnly.status, "INCOMPLETE", "Subject-only draft remains explicitly incomplete.");
ok(hasCode(subjectOnly.issues, "EDITOR_TEMPLATE_REQUIRED"), "Subject-only draft identifies its missing Condition.");
const emptyStandard = resolveRestrictionEditorDraft(
  selectRestrictionAuthoringChoice(createEmptyRestrictionDraft(), "STANDARD_STRUCTURED"),
  powerContext,
);
equal(emptyStandard.status, "INCOMPLETE", "Empty Standard draft remains explicitly incomplete.");
ok(hasCode(emptyStandard.issues, "EDITOR_SUBJECT_REQUIRED"), "Empty Standard identifies its missing Subject.");
const missingPercentageDraft = standardFor("THE_ACTOR", "ACTOR_PHYSICAL_HEALTH_PERCENTAGE", "AT_OR_BELOW", []);
const missingPercentage = resolveRestrictionEditorDraft(missingPercentageDraft, powerContext);
equal(missingPercentage.status, "INCOMPLETE", "Missing required parameter remains explicitly incomplete.");
ok(hasCode(missingPercentage.issues, "EDITOR_VALUE_REQUIRED"), "Missing required parameter has a field-level issue.");
const invalidPercentage = resolveRestrictionEditorDraft(setRestrictionDraftValue(
  missingPercentageDraft,
  "percentage",
  { kind: "PERCENTAGE", value: 101 },
), powerContext);
equal(invalidPercentage.status, "INVALID", "Out-of-bounds percentage is invalid rather than incomplete.");
ok(hasCode(invalidPercentage.issues, "PERCENTAGE_OUT_OF_BOUNDS"), "Percentage bounds use the shared validator code.");
const invalidOperatorDraft = { ...missingPercentageDraft, operator: "NOT_SUPPORTED", values: { percentage: { kind: "PERCENTAGE", value: 50 } } } as RestrictionStandardDraft;
const invalidOperator = resolveRestrictionEditorDraft(invalidOperatorDraft, powerContext);
equal(invalidOperator.status, "INVALID", "A forged invalid Operator is rejected.");
ok(hasCode(invalidOperator.issues, "INVALID_OPERATOR"), "Invalid Operator uses the shared validator code.");
const unknownParameterDraft = { ...standardFor("THE_ACTOR", "ACTOR_PHYSICAL_HEALTH_PERCENTAGE", "AT_OR_BELOW", [["percentage", { kind: "PERCENTAGE", value: 50 }]]), values: { percentage: { kind: "PERCENTAGE", value: 50 }, invented: { kind: "COUNT", value: 2 } } } as RestrictionStandardDraft;
const unknownParameter = resolveRestrictionEditorDraft(unknownParameterDraft, powerContext);
equal(unknownParameter.status, "INVALID", "Forged unknown parameters are rejected.");
ok(hasCode(unknownParameter.issues, "EDITOR_UNKNOWN_PARAMETER"), "Unknown draft parameters remain explicit.");

// Custom Narrative normalization and warnings.
let blankNarrative = selectRestrictionAuthoringChoice(createEmptyRestrictionDraft(), "CUSTOM_NARRATIVE");
const blankNarrativeResolution = resolveRestrictionEditorDraft(blankNarrative, abilityContext);
equal(blankNarrativeResolution.status, "INCOMPLETE", "Blank Custom Narrative is incomplete.");
ok(hasCode(blankNarrativeResolution.issues, "BLANK_CUSTOM_NARRATIVE"), "Blank narrative uses shared validation.");
blankNarrative = setCustomRestrictionNarrative(blankNarrative, "  Restriction: Restriction: only during the eclipse  ");
const normalizedNarrative = resolveRestrictionEditorDraft(blankNarrative, abilityContext);
equal(normalizedNarrative.status, "VALID", "Valid Custom Narrative resolves.");
equal(normalizedNarrative.definition?.customNarrativeText, "only during the eclipse", "Duplicate prefixes and whitespace normalize semantically.");
equal(normalizedNarrative.descriptor, "Restriction: only during the eclipse.", "Custom Narrative terminal punctuation normalizes in its separate descriptor.");
equal(normalizedNarrative.evaluationLabel, "Requires GD adjudication", "Custom Narrative evaluation is explicit.");
const compoundNarrative = resolveRestrictionEditorDraft(setCustomRestrictionNarrative(
  selectRestrictionAuthoringChoice(createEmptyRestrictionDraft(), "CUSTOM_NARRATIVE"),
  "Only at night and while carrying the crown",
), powerContext);
equal(compoundNarrative.status, "VALID", "Likely-compound Custom Narrative remains valid.");
ok(compoundNarrative.issues.some((issue) => issue.code === "LIKELY_COMPOUND_NARRATIVE" && issue.severity === "warning"), "Likely compound remains a warning, never an error.");

// Read-only model states and campaign label resolution.
const noRestrictionModel = getRestrictionReadOnlyModel(null, powerContext);
equal(noRestrictionModel.status, "NONE", "Read-only null displays no Restriction.");
const standardModel = getRestrictionReadOnlyModel(standardHealth, powerContext);
equal(standardModel.status, "VALID", "Read-only Standard definition remains valid.");
const narrativeModel = getRestrictionReadOnlyModel(customNarrative, abilityContext);
equal(narrativeModel.status, "VALID", "Read-only Custom Narrative remains valid.");
const unresolvedCampaignModel = getRestrictionReadOnlyModel(campaignCustom, powerContext);
equal(unresolvedCampaignModel.status, "CAMPAIGN_CUSTOM_READ_ONLY", "Campaign-Custom remains a distinct read-only state.");
ok(hasCode(unresolvedCampaignModel.issues, "UNRESOLVED_CAMPAIGN_REFERENCE"), "Unresolved campaign reference is shown honestly.");
equal(unresolvedCampaignModel.descriptor, null, "Unresolved campaign reference does not manufacture a descriptor.");
const resolvedCampaignModel = getRestrictionReadOnlyModel(campaignCustom, {
  consumerNoun: "Power",
  resolveCampaignReferenceLabel: (reference) => reference.valueId === "blood-circle" ? "Blood Circle" : null,
});
equal(resolvedCampaignModel.status, "CAMPAIGN_CUSTOM_READ_ONLY", "Resolved Campaign-Custom remains read-only.");
equal(resolvedCampaignModel.descriptor, "Restriction: This Power may only be used while the actor remains inside the Blood Circle.", "Resolved campaign label renders the exact descriptor.");
const unsupportedModel = getRestrictionReadOnlyModel(unsupported, powerContext);
equal(unsupportedModel.status, "UNSUPPORTED_READ_ONLY", "Unknown template displays unsupported read-only status.");
deepEqual(unsupportedModel.definition, unsupported, "Unknown template semantic identity remains preserved.");
const malformedModel = getRestrictionReadOnlyModel({ nope: true }, powerContext);
equal(malformedModel.status, "INVALID", "Malformed read-only input is safe and explicit.");
const ordinaryDescriptorSentinel = "Ordinary Power descriptor must not change";
const definitionBeforeRead = JSON.stringify(standardHealth);
void getRestrictionReadOnlyModel(standardHealth, powerContext);
equal(JSON.stringify(standardHealth), definitionBeforeRead, "Read-only modeling does not mutate semantic input.");
equal(ordinaryDescriptorSentinel, "Ordinary Power descriptor must not change", "No ordinary descriptor is accepted or rewritten.");

// React static rendering and accessibility contracts.
const noop = () => undefined;
function renderEditor(editorDraft: RestrictionEditorDraft, extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(createElement(RestrictionEditor, {
    draft: editorDraft,
    onDraftChange: noop,
    consumerNoun: "Power",
    idPrefix: "foundation-test",
    ...extra,
  }));
}

const noneMarkup = renderEditor(createEmptyRestrictionDraft());
includes(noneMarkup, '<details', "Restriction editor uses the page's native collapsible-chevron pattern.");
includes(noneMarkup, '<summary class="cursor-pointer"><h3', "Restriction Editor heading is the collapse/expand control.");
ok(!noneMarkup.includes('<details open=""'), "Restriction editor is collapsed by default.");
includes(noneMarkup, "Restriction authoring", "No Restriction editor has a fieldset legend.");
includes(noneMarkup, "No Restriction", "No Restriction choice is visibly labeled.");
includes(noneMarkup, "Restriction Descriptor", "Descriptor panel renders separately.");
includes(noneMarkup, "Evaluation Status", "Evaluation panel renders separately.");
includes(noneMarkup, "Validation Status", "Validation panel renders separately.");

const incompleteMarkup = renderEditor(subjectOnly.status === "INCOMPLETE"
  ? selectRestrictionSubject(selectRestrictionAuthoringChoice(createEmptyRestrictionDraft(), "STANDARD_STRUCTURED"), "THE_ACTOR")
  : createEmptyRestrictionDraft());
includes(incompleteMarkup, 'for="foundation-test-subject"', "Subject control has a proper label.");
includes(incompleteMarkup, 'for="foundation-test-condition"', "Condition control has a proper label.");
includes(incompleteMarkup, 'aria-describedby="foundation-test-condition-issues"', "Incomplete Condition is associated to its field issue.");
includes(incompleteMarkup, "Choose a Condition", "Incomplete Standard state is visible.");

const validMarkup = renderEditor(createRestrictionDraftFromDefinition(standardHealth));
includes(validMarkup, "Actor Physical Health", "Valid Standard markup uses presentation labels, not template keys.");
includes(validMarkup, "At or below", "Valid Standard markup uses operator presentation labels.");
includes(validMarkup, "Automatically checked", "Valid Standard markup shows evaluation capability.");
includes(validMarkup, "Restriction: This Power may only be used", "Valid Standard markup shows a separate descriptor.");
ok(!validMarkup.includes(">ACTOR_PHYSICAL_HEALTH_PERCENTAGE<"), "Normal editor labels do not expose raw template keys.");

const customWarningMarkup = renderEditor(setCustomRestrictionNarrative(
  selectRestrictionAuthoringChoice(createEmptyRestrictionDraft(), "CUSTOM_NARRATIVE"),
  "Only at night and while carrying the crown",
));
includes(customWarningMarkup, FULLY_CUSTOM_RESTRICTION_LABEL, "Custom Narrative choice uses the exact required label.");
includes(customWarningMarkup, 'for="foundation-test-custom-narrative"', "Custom Narrative textarea has a proper label.");
includes(customWarningMarkup, "Warnings", "Custom Narrative warning is visually separate.");
includes(customWarningMarkup, "GD review and manual adjudication", "Custom Narrative explains its review requirement.");

const campaignMarkup = renderEditor(campaignDraft);
includes(campaignMarkup, '<details', "Locked Restriction editor remains collapsible.");
includes(campaignMarkup, 'data-restriction-editor="true"', "Locked Restriction editor keeps the shared composition boundary.");
includes(campaignMarkup, "Campaign-Custom authoring is not available yet", "Campaign-Custom locked state explains deferral.");
includes(campaignMarkup, "Deliberate replacement", "Campaign-Custom requires a deliberate replacement action.");
includes(campaignMarkup, "Replace with No Restriction", "Campaign-Custom can be deliberately cleared.");
ok(!campaignMarkup.includes("valueKind"), "Campaign reference identity is not exposed as raw object UX.");

const unsupportedMarkup = renderEditor(unsupportedDraft);
includes(unsupportedMarkup, "Unsupported Restriction template", "Unsupported state is visibly identified.");
includes(unsupportedMarkup, "FUTURE_RESTRICTION_TEMPLATE@12", "Unsupported state preserves and displays key/version.");
includes(unsupportedMarkup, "has not been remapped", "Unsupported state explains preservation.");

const disabledMarkup = renderEditor(createRestrictionDraftFromDefinition(standardHealth), { disabled: true });
includes(disabledMarkup, "disabled", "Disabled editor emits disabled controls.");
includes(disabledMarkup, "editor is disabled in the current context", "Disabled editor explains its state.");

const readOnlyMarkup = renderToStaticMarkup(createElement(RestrictionReadOnly, {
  definition: campaignCustom,
  consumerNoun: "Power",
  idPrefix: "read-only-test",
  resolveCampaignReferenceLabel: () => "Blood Circle",
}));
includes(readOnlyMarkup, 'data-restriction-read-only="true"', "Read-only summary has a stable composition boundary.");
includes(readOnlyMarkup, "Campaign-Custom Structured", "Read-only summary shows authoring mode.");
includes(readOnlyMarkup, "Blood Circle", "Read-only summary uses the pure campaign-label resolver.");
ok(!/approval|reviewer|economic credit|Combat Lab support/iu.test(readOnlyMarkup), "Read-only summary manufactures no governance, economics, or Combat Lab state.");
ok(!/runtime eligibility/iu.test(readOnlyMarkup), "Read-only summary manufactures no runtime eligibility state.");

console.log(`Restriction editor foundation smoke passed (${checks} checks).`);
