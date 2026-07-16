import assert from "node:assert/strict";

import {
  RESTRICTION_AUTHORING_MODES,
  RESTRICTION_CONDITION_FAMILIES,
  RESTRICTION_EVALUATION_LABELS,
  RESTRICTION_TEMPLATE_REGISTRY,
  auditRestrictionTemplateRegistry,
  canonicalizeRestrictionDefinition,
  createRestrictionFingerprint,
  normalizeRestrictionDefinition,
  renderRestrictionDescriptor,
  validateRestrictionDefinition,
  type AbilityRestrictionDefinitionV1,
  type RestrictionCampaignReference,
  type RestrictionParameterValue,
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
function hasCode(issues: readonly { code: string }[], code: string): boolean {
  return issues.some((entry) => entry.code === code);
}

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
const labels: Record<string, string> = {
  "anchor-1": "The Shattered Altar",
  "zone-blood": "Blood Ritual Circle",
  "oath-1": "The Oath of Mercy",
  "tag-thrall": "Blood Thrall",
  "tag-ashen": "Servant of the Ashen Crown",
};
const renderContext = (consumerNoun: "Power" | "Ability" = "Power") => ({
  consumerNoun,
  resolveCampaignReferenceLabel: (reference: RestrictionCampaignReference) => labels[reference.valueId] ?? null,
});

// Registry audit and bounded proof inventory.
equal(auditRestrictionTemplateRegistry().length, 0, "The proof registry must pass its structural audit.");
equal(new Set(RESTRICTION_TEMPLATE_REGISTRY.map((template) => `${template.key}@${template.version}`)).size, RESTRICTION_TEMPLATE_REGISTRY.length, "Template key/version identities must be unique.");
equal(RESTRICTION_AUTHORING_MODES.join(","), "STANDARD_STRUCTURED,CAMPAIGN_CUSTOM_STRUCTURED,CUSTOM_NARRATIVE", "Exactly three authoring modes are supported.");
equal(RESTRICTION_EVALUATION_LABELS.AUTOMATIC, "Automatically checked", "Automatic label drifted.");
equal(RESTRICTION_EVALUATION_LABELS.SCENE_CONTEXT, "Checked through scene context", "Scene label drifted.");
equal(RESTRICTION_EVALUATION_LABELS.GD_ADJUDICATION, "Requires GD adjudication", "GD label drifted.");
for (const template of RESTRICTION_TEMPLATE_REGISTRY) {
  check(Boolean(template.subject && template.conditionFamily && template.evaluationCapability), `${template.key} needs subject, family, and capability.`);
  check(template.supportedOperators.length > 0, `${template.key} needs operators.`);
  check(template.parameterSchema.length > 0, `${template.key} needs parameter schema.`);
  check(typeof template.render === "function" && typeof template.validate === "function", `${template.key} needs renderer and validator.`);
  check(!template.supportedAuthoringModes.includes("CUSTOM_NARRATIVE" as never), `${template.key} cannot own Custom Narrative.`);
}
for (const family of RESTRICTION_CONDITION_FAMILIES) {
  check(RESTRICTION_TEMPLATE_REGISTRY.some((template) => template.conditionFamily === family), `${family} needs proof coverage.`);
}
for (const key of [
  "ACTOR_PHYSICAL_HEALTH_PERCENTAGE", "ACTOR_CONDITION", "TARGET_STANDARD_TAG",
  "TARGET_HEALTH_PERCENTAGE", "ACTOR_ANCHOR_PROXIMITY", "ACTOR_ZONE_MEMBERSHIP",
  "SCENE_ENVIRONMENT_STATE", "RELATED_ALLIED_TAGGED_ENTITY_COUNT",
  "OATH_REMAINS_UNBROKEN", "TARGET_CAMPAIGN_TAG",
]) check(RESTRICTION_TEMPLATE_REGISTRY.some((template) => template.key === key), `${key} proof template is missing.`);

// Normalization.
equal(normalizeRestrictionDefinition(null).definition, null, "Null means no Restriction.");
equal(normalizeRestrictionDefinition(undefined).definition, null, "Absence means no Restriction.");
const standardHealth = structured("ACTOR_PHYSICAL_HEALTH_PERCENTAGE", {
  operator: enumParameter("AT_OR_BELOW"),
  percentage: { kind: "PERCENTAGE", value: 50 },
});
const normalizedStandard = normalizeRestrictionDefinition(JSON.parse(JSON.stringify(standardHealth)));
check(normalizedStandard.definition?.authoringMode === "STANDARD_STRUCTURED", "Standard mode must normalize.");
const campaignZone = structured("ACTOR_ZONE_MEMBERSHIP", {
  operator: enumParameter("INSIDE"),
  zone: campaignReference("ZONE", "zone-blood"),
}, "CAMPAIGN_CUSTOM_STRUCTURED");
const normalizedCampaign = normalizeRestrictionDefinition(JSON.parse(JSON.stringify(campaignZone)));
check(normalizedCampaign.definition?.authoringMode === "CAMPAIGN_CUSTOM_STRUCTURED", "Campaign mode must normalize.");
equal((normalizedCampaign.definition?.parameters.zone as RestrictionCampaignReference).valueId, "zone-blood", "Campaign identity must survive JSON round-trip.");
const customInput = {
  schemaVersion: 1,
  authoringMode: "CUSTOM_NARRATIVE",
  templateKey: "SHOULD_BE_REMOVED",
  templateVersion: 1,
  parameters: { junk: enumParameter("JUNK") },
  customNarrativeText: "  Restriction:   This Ability may only be used after the actor has publicly accepted responsibility for the dispute.  ",
};
const normalizedCustom = normalizeRestrictionDefinition(customInput);
equal(normalizedCustom.definition?.customNarrativeText, "This Ability may only be used after the actor has publicly accepted responsibility for the dispute.", "Custom text should trim whitespace and presentation prefix.");
equal(normalizedCustom.definition?.templateKey, null, "Custom mode removes template identity.");
equal(Object.keys(normalizedCustom.definition?.parameters ?? {}).length, 0, "Custom mode removes structured parameters.");
check(hasCode(normalizedCustom.issues, "INCOMPATIBLE_MODE_FIELDS_REMOVED"), "Hybrid Custom fields need an explicit warning.");
check(hasCode(normalizeRestrictionDefinition([]).issues, "MULTIPLE_RESTRICTIONS_NOT_SUPPORTED"), "Arrays must be rejected.");
check(hasCode(normalizeRestrictionDefinition("prose").issues, "INVALID_DEFINITION"), "Arbitrary prose must not become structured authoring.");
check(hasCode(normalizeRestrictionDefinition({ schemaVersion: 2, authoringMode: "STANDARD_STRUCTURED" }).issues, "UNSUPPORTED_SCHEMA_VERSION"), "Unknown schema versions must fail.");
const unknownNormalized = normalizeRestrictionDefinition({ ...standardHealth, templateKey: "FUTURE_SAFE_TEMPLATE" });
equal(unknownNormalized.definition?.templateKey, "FUTURE_SAFE_TEMPLATE", "Safe unknown template identity must be preserved.");
check(hasCode(validateRestrictionDefinition(unknownNormalized.definition), "UNKNOWN_TEMPLATE"), "Unknown templates must validate honestly.");
check(hasCode(normalizeRestrictionDefinition({ ...standardHealth, parameters: { nested: { kind: "MAGIC", value: 1 } } }).issues, "INVALID_PARAMETER_KIND"), "Malformed parameter discriminants must fail.");
check(hasCode(normalizeRestrictionDefinition({ ...standardHealth, conditions: [{ source: "x" }] }).issues, "COMPOUND_STRUCTURE"), "Nested conditions must fail.");
check(hasCode(normalizeRestrictionDefinition({ ...standardHealth, parameters: { source: { kind: "SYSTEM_ENUM", valueKey: "ACTIVATION_COST" } } }).issues, "PROHIBITED_ABILITY_SOURCE"), "Governed Ability Cost sources must fail.");
const structuredWithNarrative = normalizeRestrictionDefinition({ ...standardHealth, customNarrativeText: "wrong lane" });
equal(structuredWithNarrative.definition?.customNarrativeText, null, "Structured mode removes narrative text.");

// Validation.
check(hasCode(validateRestrictionDefinition(structured("ACTOR_PHYSICAL_HEALTH_PERCENTAGE", { operator: enumParameter("AT_OR_BELOW") })), "MISSING_REQUIRED_PARAMETER"), "Missing parameters must fail.");
check(hasCode(validateRestrictionDefinition(structured("ACTOR_PHYSICAL_HEALTH_PERCENTAGE", { operator: enumParameter("EQUALS"), percentage: { kind: "PERCENTAGE", value: 50 } })), "INVALID_OPERATOR"), "Invalid operators must fail.");
check(hasCode(validateRestrictionDefinition(structured("ACTOR_PHYSICAL_HEALTH_PERCENTAGE", { operator: enumParameter("AT_OR_BELOW"), percentage: { kind: "PERCENTAGE", value: 101 } })), "PERCENTAGE_OUT_OF_BOUNDS"), "Invalid percentages must fail.");
const related = (count: number, campaignId = "campaign-1") => structured("RELATED_ALLIED_TAGGED_ENTITY_COUNT", {
  operator: enumParameter("AT_LEAST"), count: { kind: "COUNT", value: count }, tag: campaignReference("TAG", "tag-thrall", campaignId),
}, "CAMPAIGN_CUSTOM_STRUCTURED");
check(hasCode(validateRestrictionDefinition(related(0)), "COUNT_OUT_OF_BOUNDS"), "Invalid counts must fail.");
const anchor = (distance: number) => structured("ACTOR_ANCHOR_PROXIMITY", {
  operator: enumParameter("WITHIN_DISTANCE"), distance: { kind: "DISTANCE", value: distance, unit: "FEET" }, anchor: campaignReference("ANCHOR", "anchor-1"),
}, "CAMPAIGN_CUSTOM_STRUCTURED");
check(hasCode(validateRestrictionDefinition(anchor(-1)), "DISTANCE_OUT_OF_BOUNDS"), "Invalid distances must fail.");
check(hasCode(validateRestrictionDefinition(related(1, "campaign-2"), { campaignId: "campaign-1" }), "CROSS_CAMPAIGN_REFERENCE"), "Cross-campaign references must fail.");
check(hasCode(validateRestrictionDefinition(related(1), { resolveCampaignReference: () => ({ status: "UNRESOLVED" }) }), "UNRESOLVED_CAMPAIGN_REFERENCE"), "Unresolved references must fail.");
check(hasCode(validateRestrictionDefinition(related(1), { resolveCampaignReference: () => ({ status: "STALE" }) }), "STALE_CAMPAIGN_REFERENCE"), "Stale references must fail.");
const undead = structured("TARGET_STANDARD_TAG", { operator: enumParameter("PRESENT"), tag: enumParameter("UNDEAD") });
check(hasCode(validateRestrictionDefinition(undead, { intrinsicTargetTags: ["UNDEAD"] }), "DUPLICATED_INTRINSIC_TARGET_TAG"), "Intrinsic target-tag duplication needs a warning.");
check(hasCode(validateRestrictionDefinition(undead, { claimedSubject: "THE_ACTOR" }), "IMPOSSIBLE_SUBJECT_TEMPLATE"), "Impossible subject/template claims must fail.");
const sunlight = structured("SCENE_ENVIRONMENT_STATE", { operator: enumParameter("PRESENT"), environment: enumParameter("DIRECT_SUNLIGHT") });
check(hasCode(validateRestrictionDefinition(sunlight, { claimedEvaluationCapability: "AUTOMATIC" }), "UNSUPPORTED_AUTOMATIC_EVALUATION"), "Unsupported automatic claims must fail.");
const blankCustom: AbilityRestrictionDefinitionV1 = { schemaVersion: 1, authoringMode: "CUSTOM_NARRATIVE", templateKey: null, templateVersion: null, parameters: {}, customNarrativeText: " " };
check(hasCode(validateRestrictionDefinition(blankCustom), "BLANK_CUSTOM_NARRATIVE"), "Blank Custom Narrative must fail.");
const compoundCustom: AbilityRestrictionDefinitionV1 = { ...blankCustom, customNarrativeText: "Only at night and while wounded" };
const compoundIssues = validateRestrictionDefinition(compoundCustom);
check(hasCode(compoundIssues, "LIKELY_COMPOUND_NARRATIVE"), "Likely compound narrative needs a warning.");
check(!compoundIssues.some((entry) => entry.code === "LIKELY_COMPOUND_NARRATIVE" && entry.severity === "error"), "Narrative heuristics must not pretend to prove invalidity.");

// Exact descriptor acceptance and proof-family rendering.
equal(renderRestrictionDescriptor(standardHealth, renderContext()).descriptor, "Restriction: This Power may only be used while the actor is at or below 50% of maximum Physical Health.", "Actor Health descriptor drifted.");
equal(renderRestrictionDescriptor(undead, renderContext()).descriptor, "Restriction: This Power may only target a character with the Undead tag.", "Undead descriptor drifted.");
equal(renderRestrictionDescriptor(normalizedCustom.definition, renderContext("Ability")).descriptor, "Restriction: This Ability may only be used after the actor has publicly accepted responsibility for the dispute.", "Roleplay Custom Narrative descriptor drifted.");
equal(renderRestrictionDescriptor(campaignZone, renderContext()).descriptor, "Restriction: This Power may only be used while the actor remains inside the Blood Ritual Circle.", "Zone descriptor drifted.");
equal(renderRestrictionDescriptor(related(1), renderContext()).descriptor, "Restriction: This Power may only be used while at least one allied Blood Thrall remains active.", "Related-entity descriptor drifted.");
const ashenTag = structured("TARGET_CAMPAIGN_TAG", { operator: enumParameter("PRESENT"), tag: campaignReference("TAG", "tag-ashen") }, "CAMPAIGN_CUSTOM_STRUCTURED");
equal(renderRestrictionDescriptor(ashenTag, renderContext()).descriptor, "Restriction: This Power may only target a character with the Servant of the Ashen Crown tag.", "Campaign tag descriptor drifted.");
const blinded = structured("ACTOR_CONDITION", { operator: enumParameter("PRESENT"), condition: enumParameter("BLINDED") });
equal(renderRestrictionDescriptor(blinded, renderContext()).descriptor, "Restriction: This Power may only be used while the actor is Blinded.", "Condition-present descriptor drifted.");
equal(renderRestrictionDescriptor({ ...blinded, parameters: { ...blinded.parameters, operator: enumParameter("ABSENT") } }, renderContext()).descriptor, "Restriction: This Power may only be used while the actor is not Blinded.", "Condition-absent descriptor drifted.");
equal(renderRestrictionDescriptor(structured("TARGET_HEALTH_PERCENTAGE", { operator: enumParameter("AT_OR_BELOW"), percentage: { kind: "PERCENTAGE", value: 25 } }), renderContext()).descriptor, "Restriction: This Power may only target a character at or below 25% of maximum Physical Health.", "Target Health descriptor drifted.");
equal(renderRestrictionDescriptor(anchor(30), renderContext()).descriptor, "Restriction: This Power may only be used while the actor remains within 30 feet of The Shattered Altar.", "Anchor descriptor drifted.");
equal(renderRestrictionDescriptor(sunlight, renderContext()).descriptor, "Restriction: This Power may only be used while the scene is in Direct Sunlight.", "Scene descriptor drifted.");
const oath = structured("OATH_REMAINS_UNBROKEN", { operator: enumParameter("REMAINS_UNBROKEN"), oath: campaignReference("OATH", "oath-1") }, "CAMPAIGN_CUSTOM_STRUCTURED");
equal(renderRestrictionDescriptor(oath, renderContext()).descriptor, "Restriction: This Power may only be used while The Oath of Mercy remains unbroken.", "Oath descriptor drifted.");
check(hasCode(renderRestrictionDescriptor(anchor(30), { consumerNoun: "Power", resolveCampaignReferenceLabel: () => null }).issues, "UNRESOLVED_CAMPAIGN_REFERENCE"), "Unresolved display labels must be reported honestly.");
const punctuationCustom = normalizeRestrictionDefinition({ ...blankCustom, customNarrativeText: "Restriction: Restriction: Only after sunset..." }).definition;
equal(renderRestrictionDescriptor(punctuationCustom, renderContext()).descriptor, "Restriction: Only after sunset.", "Prefix and terminal punctuation must normalize once.");

// Semantic canonicalization and fingerprints.
const reorderedHealth: AbilityRestrictionDefinitionV1 = {
  customNarrativeText: null, parameters: { percentage: { value: 50, kind: "PERCENTAGE" }, operator: { valueKey: "AT_OR_BELOW", kind: "SYSTEM_ENUM" } },
  templateVersion: 1, templateKey: "ACTOR_PHYSICAL_HEALTH_PERCENTAGE", authoringMode: "STANDARD_STRUCTURED", schemaVersion: 1,
};
equal(createRestrictionFingerprint(standardHealth), createRestrictionFingerprint(reorderedHealth), "Object key order must not affect fingerprints.");
equal(createRestrictionFingerprint(standardHealth), createRestrictionFingerprint(JSON.parse(JSON.stringify(standardHealth))), "JSON round-trip must not affect fingerprints.");
equal(canonicalizeRestrictionDefinition(standardHealth), canonicalizeRestrictionDefinition(reorderedHealth), "Canonical semantic strings must sort recursively.");
const zoneFingerprint = createRestrictionFingerprint(campaignZone);
labels["zone-blood"] = "Renamed Ritual Circle";
equal(createRestrictionFingerprint(campaignZone), zoneFingerprint, "Display label changes must not affect fingerprints.");
check(createRestrictionFingerprint({ ...standardHealth, parameters: { ...standardHealth.parameters, percentage: { kind: "PERCENTAGE", value: 51 } } }) !== createRestrictionFingerprint(standardHealth), "Threshold changes must change fingerprints.");
check(createRestrictionFingerprint({ ...campaignZone, parameters: { ...campaignZone.parameters, zone: campaignReference("ZONE", "zone-other") } }) !== zoneFingerprint, "Campaign value identity changes must change fingerprints.");
const governanceJunk = normalizeRestrictionDefinition({ ...standardHealth, approvalState: "APPROVED", reviewer: "someone", credit: 99, descriptor: "junk" }).definition;
equal(createRestrictionFingerprint(governanceJunk), createRestrictionFingerprint(standardHealth), "Governance-shaped junk must not enter the semantic fingerprint.");
check(createRestrictionFingerprint(standardHealth).startsWith("restriction:v1:{"), "Fingerprint must be a versioned canonical semantic string.");

// Phase boundaries are represented by absence, atomic shape, and pure metadata.
check(!RESTRICTION_AUTHORING_MODES.includes("NONE" as never), "NONE must not be an authoring mode.");
check(!RESTRICTION_TEMPLATE_REGISTRY.some((template) => template.supportedOperators.some((operator) => ["AND", "OR"].includes(operator))), "Registry must not support AND/OR.");
for (const forbidden of ["approval", "reviewer", "timestamp", "credit", "discount", "activationCost", "backlash", "spark", "evaluator", "runtimeEligibility"]) {
  check(!Object.keys(standardHealth).some((key) => key.toLowerCase().includes(forbidden.toLowerCase())), `Semantic definition must exclude ${forbidden}.`);
}
equal(renderRestrictionDescriptor(null, renderContext()).descriptor, null, "No Restriction renders no sentence.");

assert.ok(checks >= 100, `Expected at least 100 deterministic checks, received ${checks}.`);
console.log(`Restriction authoring domain smoke passed (${checks} checks; ${RESTRICTION_TEMPLATE_REGISTRY.length} proof templates; ${RESTRICTION_CONDITION_FAMILIES.length} families).`);
