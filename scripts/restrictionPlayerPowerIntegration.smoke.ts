import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { defaultBuilderData, normalizeBuilderData, type CharacterBuilderData } from "../lib/characterBuilder/core";
import {
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  prepareCharacterPowerIdsForPersistence,
  synchronizeCharacterPowerCooldownCaches,
  type CharacterPower,
} from "../lib/characterBuilder/powers";
import { DEFAULT_POWER_TUNING_VALUES, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import {
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
import {
  getPlayerPowerRestrictionSummaryLabel,
  initializePlayerPowerRestrictionDrafts,
  materializePlayerPowerRestrictionDrafts,
  reconcilePlayerPowerRestrictionDrafts,
  rehydratePlayerPowerRestrictionDrafts,
  validateRawPlayerPowerRestrictionWrite,
  type PlayerPowerRestrictionDraftMap,
} from "../lib/restrictions/playerPowerEditorIntegration";
import type { AbilityRestrictionDefinitionV1 } from "../lib/restrictions";
import { applyAutomaticExpectedTargetsToPower, applyAutomaticExpectedTargetsToPowers } from "../lib/powers/expectedTargetEstimation";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";

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
  customNarrativeText: "Only after the bell rings",
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
  templateKey: "FUTURE_SAFE_TEMPLATE",
  templateVersion: 7,
  parameters: {
    operator: { kind: "SYSTEM_ENUM", valueKey: "FUTURE_OPERATOR" },
    amount: { kind: "COUNT", value: 3 },
  },
  customNarrativeText: null,
};

function power(id: string, name: string, restriction: AbilityRestrictionDefinitionV1 | null): CharacterPower {
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

function data(powers: CharacterPower[], signatureMove: CharacterPower | null = null): CharacterBuilderData {
  return { ...defaultBuilderData(), powers, signatureMove };
}

function withoutRestriction(powerValue: CharacterPower): Omit<CharacterPower, "restriction"> {
  const { restriction: _restriction, ...rest } = powerValue;
  void _restriction;
  return rest;
}

function validHealthDraft(percentage = 50): RestrictionEditorDraft {
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

const ordinaryNone = power("power-none", "No Restriction Power", null);
const ordinaryStandard = power("power-standard", "Standard Power", standardHealth);
const ordinaryCustom = power("power-custom", "Custom Power", customNarrative);
const ordinaryCampaign = power("power-campaign", "Campaign Power", campaignCustom);
const signatureUnsupported = power("signature-unsupported", "Future Signature", unsupported);
const initialData = data(
  [ordinaryNone, ordinaryStandard, ordinaryCustom, ordinaryCampaign],
  signatureUnsupported,
);

// Initialization covers every player consumer and never stores drafts in builderData.
const initialized = initializePlayerPowerRestrictionDrafts(initialData);
deepEqual(Object.keys(initialized).sort(), [
  "power-campaign",
  "power-custom",
  "power-none",
  "power-standard",
  "signature-unsupported",
].sort(), "Draft initialization keys every ordinary Power and Signature Move by stable ID.");
equal(initialized[ordinaryNone.id!]?.kind, "NONE", "No Restriction initializes NONE.");
equal(initialized[ordinaryStandard.id!]?.kind, "STANDARD", "Standard initializes editable.");
equal(initialized[ordinaryCustom.id!]?.kind, "CUSTOM_NARRATIVE", "Custom initializes editable.");
equal(initialized[ordinaryCampaign.id!]?.kind, "CAMPAIGN_CUSTOM_READ_ONLY", "Campaign-Custom initializes locked.");
equal(initialized[signatureUnsupported.id!]?.kind, "UNSUPPORTED_READ_ONLY", "Unsupported Signature initializes locked.");
ok(!JSON.stringify(initialData).includes("CAMPAIGN_CUSTOM_READ_ONLY"), "Transient draft discriminants never enter builderData.");

// Stable identity reconciliation follows reorder, insert, remove, rename, and packet edits.
const reorderedData = data([
  ordinaryCampaign,
  ordinaryNone,
  ordinaryCustom,
  ordinaryStandard,
], signatureUnsupported);
const reorderedDrafts = reconcilePlayerPowerRestrictionDrafts(initialized, reorderedData);
equal(reorderedDrafts[ordinaryStandard.id!], initialized[ordinaryStandard.id!], "Reorder retains the same draft object by Power ID.");
equal(reorderedDrafts[ordinaryCampaign.id!], initialized[ordinaryCampaign.id!], "Reorder never transfers drafts by array position.");
const inserted = power("power-inserted", "Inserted Power", null);
const insertedDrafts = reconcilePlayerPowerRestrictionDrafts(
  reorderedDrafts,
  data([inserted, ...reorderedData.powers], signatureUnsupported),
);
equal(insertedDrafts[inserted.id!]?.kind, "NONE", "Inserted Power receives a new No Restriction draft.");
const removedDrafts = reconcilePlayerPowerRestrictionDrafts(
  insertedDrafts,
  data([inserted, ordinaryCampaign, ordinaryNone, ordinaryStandard], signatureUnsupported),
);
ok(!(ordinaryCustom.id! in removedDrafts), "Removed Power draft is removed.");
equal(removedDrafts[ordinaryStandard.id!], initialized[ordinaryStandard.id!], "Removing another Power does not alter surviving drafts.");
const renamed = { ...ordinaryStandard, name: "Renamed Standard Power" };
const renamedDrafts = reconcilePlayerPowerRestrictionDrafts(
  removedDrafts,
  data([inserted, ordinaryCampaign, ordinaryNone, renamed], signatureUnsupported),
);
equal(renamedDrafts[renamed.id!], initialized[ordinaryStandard.id!], "Rename preserves the Power draft.");
const packetEdited = {
  ...renamed,
  effectPackets: renamed.effectPackets.map((packet) => ({ ...packet, potency: 4 })),
};
const packetDrafts = reconcilePlayerPowerRestrictionDrafts(
  renamedDrafts,
  data([inserted, ordinaryCampaign, ordinaryNone, packetEdited], signatureUnsupported),
);
equal(packetDrafts[packetEdited.id!], initialized[ordinaryStandard.id!], "Packet edits preserve the Power draft.");
const withoutSignature = reconcilePlayerPowerRestrictionDrafts(
  packetDrafts,
  data([inserted, ordinaryCampaign, ordinaryNone, packetEdited], null),
);
ok(!(signatureUnsupported.id! in withoutSignature), "Removing Signature Move removes only its draft.");
const recreatedSignature = power("signature-recreated", "Recreated Signature", null);
const recreatedDrafts = reconcilePlayerPowerRestrictionDrafts(
  withoutSignature,
  data([inserted, ordinaryCampaign, ordinaryNone, packetEdited], recreatedSignature),
);
equal(recreatedDrafts[recreatedSignature.id!]?.kind, "NONE", "Recreated Signature Move receives its own No Restriction draft.");
ok(!(signatureUnsupported.id! in recreatedDrafts), "Old Signature draft never transfers to a recreated identity.");

// Materialization laws and immutability.
const sourceSnapshot = structuredClone(initialData);
const draftsSnapshot = structuredClone(initialized);
const materialized = materializePlayerPowerRestrictionDrafts(initialData, initialized);
equal(materialized.ok, true, "Valid and locked drafts materialize successfully.");
ok(materialized.ok, "Materialized result is available.");
ok(materialized.builderData !== initialData, "Materialization returns a new builderData object.");
equal(materialized.builderData.powers[0]?.restriction, null, "NONE persists explicit null.");
deepEqual(materialized.builderData.powers[1]?.restriction, standardHealth, "Valid Standard persists normalized semantics.");
deepEqual(materialized.builderData.powers[2]?.restriction, customNarrative, "Valid Custom persists semantics.");
deepEqual(materialized.builderData.powers[3]?.restriction, campaignCustom, "Campaign-Custom remains exactly preserved.");
deepEqual(materialized.builderData.signatureMove?.restriction, unsupported, "Unsupported semantics remain exactly preserved.");
deepEqual(
  materialized.builderData.powers.map(withoutRestriction),
  initialData.powers.map(withoutRestriction),
  "Materialization preserves Power order, IDs, names, packets, targeting, magnitudes, semantic fields, and cooldown caches.",
);
deepEqual(
  withoutRestriction(materialized.builderData.signatureMove!),
  withoutRestriction(initialData.signatureMove!),
  "Materialization preserves every non-Restriction Signature Move field.",
);
deepEqual(initialData, sourceSnapshot, "Materialization does not mutate source builderData.");
deepEqual(initialized, draftsSnapshot, "Materialization does not mutate source drafts.");

const warningPower = power("power-warning", "Warning Power", null);
const warningDraft = setCustomRestrictionNarrative(
  selectRestrictionAuthoringChoice({ kind: "NONE" }, "CUSTOM_NARRATIVE"),
  "Only at night and while carrying the crown",
);
const warningMaterialized = materializePlayerPowerRestrictionDrafts(
  data([warningPower]),
  { [warningPower.id!]: warningDraft },
);
equal(warningMaterialized.ok, true, "Warning-only Custom Narrative does not block save.");
ok(
  resolveRestrictionEditorDraft(warningDraft, { consumerNoun: "Power" }).issues.some(
    (issue) => issue.severity === "warning",
  ),
  "Warning-only fixture really contains a warning.",
);

const incompletePower = power("power-incomplete", "Incomplete Power", standardHealth);
const incompleteDraft = selectRestrictionSubject(
  selectRestrictionAuthoringChoice({ kind: "NONE" }, "STANDARD_STRUCTURED"),
  "THE_ACTOR",
);
const incompleteResult = materializePlayerPowerRestrictionDrafts(
  data([incompletePower]),
  { [incompletePower.id!]: incompleteDraft },
);
equal(incompleteResult.ok, false, "Incomplete ordinary Power blocks materialization.");
ok(!incompleteResult.ok && incompleteResult.builderData === null, "Incomplete result produces no API builderData.");
ok(!incompleteResult.ok && incompleteResult.issues[0]?.message.includes("Incomplete Power"), "Blocking issue visibly identifies the Power.");
ok(!incompleteResult.ok && incompleteResult.issues[0]?.issueCodes.includes("EDITOR_TEMPLATE_REQUIRED"), "Blocking issue retains underlying field code.");

const invalidPower = power("power-invalid", "Invalid Power", null);
const invalidResult = materializePlayerPowerRestrictionDrafts(
  data([invalidPower]),
  { [invalidPower.id!]: validHealthDraft(101) },
);
equal(invalidResult.ok, false, "Invalid ordinary Power blocks materialization.");
ok(!invalidResult.ok && invalidResult.issues[0]?.issueCodes.includes("PERCENTAGE_OUT_OF_BOUNDS"), "Invalid materialization retains shared validator code.");

const malformedPower = power("power-malformed", "Malformed Power", null);
const malformedDraft: RestrictionEditorDraft = {
  kind: "MALFORMED_READ_ONLY",
  issues: [{
    code: "INVALID_DEFINITION",
    severity: "error",
    message: "Malformed external Restriction.",
    path: "restriction",
  }],
};
equal(materializePlayerPowerRestrictionDrafts(
  data([malformedPower]),
  { [malformedPower.id!]: malformedDraft },
).ok, false, "Malformed read-only state blocks save until deliberate replacement.");

const missingDraftResult = materializePlayerPowerRestrictionDrafts(data([ordinaryNone]), {});
equal(missingDraftResult.ok, false, "A missing transient draft blocks raw builderData fallback.");
ok(!missingDraftResult.ok && missingDraftResult.issues[0]?.issueCodes.includes("PLAYER_POWER_RESTRICTION_DRAFT_REQUIRED"), "Missing draft has a stable issue code.");

// Stale-semantic regression: a partial edit cannot fall back to the old stored definition.
const staleSource = data([power("power-stale", "Stale Semantic Power", standardHealth)]);
const staleDrafts = initializePlayerPowerRestrictionDrafts(staleSource);
staleDrafts["power-stale"] = incompleteDraft;
const staleResult = materializePlayerPowerRestrictionDrafts(staleSource, staleDrafts);
equal(staleResult.ok, false, "Incomplete changed draft blocks the stale-semantic save.");
equal(staleResult.builderData, null, "Stale stored semantics are never returned as a save payload.");
deepEqual(staleSource.powers[0]?.restriction, standardHealth, "Blocked save does not mutate the source's old semantic definition.");

// Signature Move follows the same laws without altering identity, packets, pool fields, or cooldown caches.
const signature = {
  ...power("signature-live", "Limit Break", standardHealth),
  cooldownTurns: 4,
  cooldownReduction: 1,
};
const signatureData = data([], signature);
const signatureDrafts = initializePlayerPowerRestrictionDrafts(signatureData);
const signatureBefore = structuredClone(signature);
const signatureValid = materializePlayerPowerRestrictionDrafts(signatureData, signatureDrafts);
ok(signatureValid.ok && signatureValid.builderData.signatureMove?.id === signature.id, "Signature stable ID survives materialization.");
deepEqual(signatureValid.ok && signatureValid.builderData.signatureMove?.effectPackets.map((packet) => packet.id), signature.effectPackets.map((packet) => packet.id), "Signature packet IDs survive materialization.");
equal(signatureValid.ok && signatureValid.builderData.signatureMove?.cooldownTurns, 4, "Signature cooldown cache remains unchanged.");
equal(signatureValid.ok && signatureValid.builderData.signatureMove?.cooldownReduction, 1, "Signature cooldown reduction remains unchanged.");
deepEqual(signature, signatureBefore, "Signature source remains immutable.");
const signatureNone = materializePlayerPowerRestrictionDrafts(
  signatureData,
  { [signature.id!]: { kind: "NONE" } },
);
ok(signatureNone.ok && signatureNone.builderData.signatureMove?.restriction === null, "Signature No Restriction persists null.");
const signatureIncomplete = materializePlayerPowerRestrictionDrafts(
  signatureData,
  { [signature.id!]: incompleteDraft },
);
equal(signatureIncomplete.ok, false, "Incomplete Signature Restriction blocks save.");
ok(!signatureIncomplete.ok && signatureIncomplete.issues[0]?.consumerKind === "SIGNATURE_MOVE", "Signature blocking issue retains consumer identity.");
const signatureInvalid = materializePlayerPowerRestrictionDrafts(
  signatureData,
  { [signature.id!]: validHealthDraft(101) },
);
equal(signatureInvalid.ok, false, "Invalid Signature Restriction blocks save.");

// Collapsed summaries are semantic and never expose JSON.
equal(getPlayerPowerRestrictionSummaryLabel({ kind: "NONE" }), "No Restriction", "NONE summary is concise.");
equal(getPlayerPowerRestrictionSummaryLabel(validHealthDraft()), "Standard Restriction", "Standard summary is concise.");
equal(getPlayerPowerRestrictionSummaryLabel(warningDraft), "Fully Custom Restriction", "Custom summary is concise.");
equal(getPlayerPowerRestrictionSummaryLabel(initialized[ordinaryCampaign.id!]), "Campaign-Custom Restriction", "Campaign summary is concise.");
equal(getPlayerPowerRestrictionSummaryLabel(initialized[signatureUnsupported.id!]), "Unsupported Restriction", "Unsupported summary is concise.");
equal(getPlayerPowerRestrictionSummaryLabel(incompleteDraft), "Incomplete Restriction Draft", "Incomplete summary is explicit.");
equal(getPlayerPowerRestrictionSummaryLabel(validHealthDraft(101)), "Invalid Restriction Draft", "Invalid summary is explicit.");

// Raw server write guard runs before normalization destroys invalid evidence.
const rawPower = { ...ordinaryNone } as Record<string, unknown>;
delete rawPower.restriction;
equal(validateRawPlayerPowerRestrictionWrite({ powers: [rawPower] }, "campaign-a"), null, "Missing Restriction field is accepted.");
equal(validateRawPlayerPowerRestrictionWrite({ powers: [{ ...ordinaryNone, restriction: null }] }, "campaign-a"), null, "Explicit null is accepted.");
equal(validateRawPlayerPowerRestrictionWrite({ powers: [{ ...ordinaryNone, restriction: standardHealth }] }, "campaign-a"), null, "Valid Standard is accepted.");
equal(validateRawPlayerPowerRestrictionWrite({ powers: [{ ...ordinaryNone, restriction: customNarrative }] }, "campaign-a"), null, "Valid Custom Narrative is accepted.");
equal(validateRawPlayerPowerRestrictionWrite({ powers: [{ ...ordinaryNone, restriction: campaignCustom }] }, "campaign-a"), null, "Same-campaign Campaign-Custom is accepted.");
equal(validateRawPlayerPowerRestrictionWrite({ powers: [{ ...ordinaryNone, restriction: unsupported }] }, "campaign-a"), null, "Safe unknown template is accepted without remapping.");
const malformedWrite = validateRawPlayerPowerRestrictionWrite({
  powers: [{ ...ordinaryNone, name: "Malformed API Power", restriction: { ...standardHealth, authoringMode: "NOPE" } }],
}, "campaign-a");
equal(malformedWrite?.code, "INVALID_AUTHORING_MODE", "Malformed mode is rejected with stable code.");
ok(malformedWrite?.clientMessage.includes("Power 1 \"Malformed API Power\"") ?? false, "Ordinary Power error contains index and name.");
const compoundWrite = validateRawPlayerPowerRestrictionWrite({
  powers: [{ ...ordinaryNone, restriction: { ...standardHealth, and: [standardHealth] } }],
}, "campaign-a");
equal(compoundWrite?.code, "COMPOUND_STRUCTURE", "Fatal compound structure is rejected.");
const prohibitedWrite = validateRawPlayerPowerRestrictionWrite({
  powers: [{ ...ordinaryNone, restriction: { ...standardHealth, source: "ability_effect" } }],
}, "campaign-a");
equal(prohibitedWrite?.code, "PROHIBITED_ABILITY_SOURCE", "Prohibited self-satisfaction source is rejected.");
const crossCampaignWrite = validateRawPlayerPowerRestrictionWrite({
  powers: [{ ...ordinaryNone, restriction: campaignCustom }],
}, "campaign-b");
equal(crossCampaignWrite?.code, "CROSS_CAMPAIGN_REFERENCE", "Cross-campaign reference is rejected.");
const signatureWrite = validateRawPlayerPowerRestrictionWrite({
  signatureMove: { ...signature, restriction: { ...standardHealth, authoringMode: "NOPE" } },
}, "campaign-a");
equal(signatureWrite?.consumerKind, "SIGNATURE_MOVE", "Signature API error retains consumer identity.");
ok(signatureWrite?.clientMessage.startsWith("Signature Move") ?? false, "Signature API error is visibly identified.");
equal(validateRawPlayerPowerRestrictionWrite({
  roleplayAbilities: [{ restriction: { authoringMode: "NOPE" } }],
}, "campaign-a"), null, "Phase 3B1 guard ignores Roleplay Restriction data.");

// Complete logical save pipeline and invariance.
const semanticPacket = {
  ...createDefaultCharacterPowerPacket("AUGMENT", 0),
  id: "pipeline-packet",
  targetedAttribute: "GUARD" as const,
  modifier: 3,
  potency: 2,
  effectDurationType: "UNTIL_TARGET_NEXT_TURN" as const,
  effectDurationTurns: null,
};
const pipelinePower: CharacterPower = {
  ...power("pipeline-power", "Pipeline Power", null),
  effectPackets: [semanticPacket],
  intentions: [semanticPacket],
};
const pipelineSource = data([pipelinePower]);
const pipelineDrafts: PlayerPowerRestrictionDraftMap = {
  [pipelinePower.id!]: validHealthDraft(25),
};
const pipelineMaterialized = materializePlayerPowerRestrictionDrafts(
  pipelineSource,
  pipelineDrafts,
);
ok(pipelineMaterialized.ok, "Pipeline materialization succeeds.");
equal(validateRawPlayerPowerRestrictionWrite(pipelineMaterialized.builderData, "campaign-a"), null, "Raw write guard accepts materialized data.");
const normalized = normalizeBuilderData(pipelineMaterialized.builderData);
deepEqual(normalized.powers[0]?.restriction?.parameters.percentage, { kind: "PERCENTAGE", value: 25 }, "normalizeBuilderData preserves Restriction.");
const prepared = prepareCharacterPowerIdsForPersistence({
  powers: normalized.powers,
  signatureMove: normalized.signatureMove,
});
equal(prepared.powers[0]?.id, pipelinePower.id, "ID preparation preserves Power ID.");
equal(prepared.powers[0]?.effectPackets[0]?.id, semanticPacket.id, "ID preparation preserves packet ID.");
const teamContext = { source: "ACTUAL_TEAM_CONTEXT" as const, totalTeamSize: 4 };
const expectedTargetData = {
  ...normalized,
  powers: applyAutomaticExpectedTargetsToPowers(prepared.powers, teamContext),
  signatureMove: prepared.signatureMove
    ? applyAutomaticExpectedTargetsToPower(prepared.signatureMove, teamContext)
    : null,
};
deepEqual(expectedTargetData.powers[0]?.restriction, normalized.powers[0]?.restriction, "Automatic expected-target processing preserves Restriction.");
equal(expectedTargetData.powers[0]?.effectPackets[0]?.targetedAttribute, "GUARD", "Expected-target processing preserves semantic targetedAttribute.");
equal(expectedTargetData.powers[0]?.effectPackets[0]?.modifier, 3, "Expected-target processing preserves semantic Modifier.");
equal(expectedTargetData.powers[0]?.effectPackets[0]?.potency, 2, "Expected-target processing preserves semantic Potency.");

const activeTuning: PowerTuningSnapshot = {
  setId: "restriction-player-integration",
  name: "Restriction Player Integration",
  slug: "restriction-player-integration",
  status: "ACTIVE",
  updatedAt: "2026-07-16T00:00:00.000Z",
  values: DEFAULT_POWER_TUNING_VALUES,
};
const costBefore = resolvePowerCosts(pipelineSource.powers, activeTuning, { level: 1, tier: "SOLDIER" }).powers[0];
const costAfter = resolvePowerCosts(expectedTargetData.powers, activeTuning, { level: 1, tier: "SOLDIER" }).powers[0];
equal(costAfter?.breakdown.basePowerValue, costBefore?.breakdown.basePowerValue, "Changing Restriction does not change Power cost.");
equal(costAfter?.derivedCooldownTurns, costBefore?.derivedCooldownTurns, "Changing Restriction does not change derived cooldown.");
const synchronized = synchronizeCharacterPowerCooldownCaches({
  level: 1,
  powers: expectedTargetData.powers,
  signatureMove: expectedTargetData.signatureMove,
  tuningSnapshot: activeTuning,
  playerPowerSpendScalar: 1,
  expectedTargetTeamContext: teamContext,
});
ok(synchronized.ok, "Cooldown synchronization accepts the materialized Power.");
ok(synchronized.ok && synchronized.powers[0]?.restriction?.templateKey === "ACTOR_PHYSICAL_HEALTH_PERCENTAGE", "Cooldown synchronization preserves Restriction.");
ok(synchronized.ok && synchronized.powers[0]?.effectPackets[0]?.id === semanticPacket.id, "Cooldown synchronization preserves packet identity.");
const serialized = JSON.parse(JSON.stringify({
  ...expectedTargetData,
  powers: synchronized.ok ? synchronized.powers : [],
  signatureMove: synchronized.ok ? synchronized.signatureMove : null,
}));
const responseData = normalizeBuilderData(serialized);
equal(responseData.powers[0]?.id, pipelinePower.id, "JSON and normalized API response preserve Power ID.");
equal(responseData.powers[0]?.effectPackets[0]?.id, semanticPacket.id, "JSON and normalized API response preserve packet ID.");
deepEqual(responseData.powers[0]?.restriction?.parameters.percentage, { kind: "PERCENTAGE", value: 25 }, "JSON and normalized API response preserve Restriction.");
equal(responseData.powers[0]?.effectPackets[0]?.modifier, 3, "JSON response preserves semantic Augment Modifier.");
const responseDrafts = rehydratePlayerPowerRestrictionDrafts(responseData);
equal(responseDrafts[pipelinePower.id!]?.kind, "STANDARD", "Authoritative response rehydrates the editor draft.");
equal(resolveRestrictionEditorDraft(responseDrafts[pipelinePower.id!], { consumerNoun: "Power" }).status, "VALID", "Rehydrated response draft resolves validly.");

// Source composition assertions protect the bounded UI/API integration.
const pageSource = readFileSync("app/campaign/[id]/characters/[characterId]/builder/page.tsx", "utf8");
const routeSource = readFileSync("app/api/campaigns/[id]/characters/[characterId]/builder/route.ts", "utf8");
equal((pageSource.match(/<RestrictionEditor/gu) ?? []).length, 1, "Power card renderer contains one shared RestrictionEditor path.");
ok(pageSource.includes('consumerNoun="Power"'), "Editor uses the Power consumer noun.");
ok(pageSource.indexOf("character-power-whole-restriction-editor") < pageSource.indexOf("Primary Packet"), "Whole-Power editor is outside and before packet cards.");
ok(pageSource.includes("powers: [signatureMoveDraft]") && pageSource.includes("powers: builderData.powers"), "Signature Move and ordinary Powers reuse the same card renderer.");
ok(pageSource.includes("character-power-collapsed-restriction-summary"), "Collapsed cards contain a compact Restriction summary.");
ok(pageSource.indexOf("character-power-collapsed-restriction-summary") > pageSource.indexOf("</button>"), "Collapsed summary is not nested inside the collapse-toggle button.");
ok(pageSource.includes("summary.descriptorLines.map"), "Ordinary Power descriptor rendering remains separate and present.");
ok(!pageSource.includes("descriptor={restriction"), "Ordinary descriptor is never passed into the Restriction editor.");
ok(pageSource.indexOf("<RestrictionEditor") < pageSource.indexOf('data-testid="character-builder-section-roleplay-abilities"'), "Restriction editor is confined to the Power-card path before Roleplay UI.");
ok(routeSource.indexOf("validateRawPlayerPowerRestrictionWrite") < routeSource.indexOf("normalizeBuilderData(body.builderData)"), "Raw write guard runs before normalization.");
ok(routeSource.includes("restrictionWriteIssue.code"), "API returns the stable Restriction issue code.");

console.log(`Player Power Restriction integration smoke passed (${checks} checks).`);
