import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MonsterBlockCard } from "../app/summoning-circle/components/MonsterBlockCard";
import {
  createDefaultPowerPacket,
  defaultPower,
  toEditable,
  toPayload,
} from "../app/summoning-circle/components/SummoningCircleEditor";
import { DEFAULT_POWER_TUNING_VALUES, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import { applyAutomaticExpectedTargetsToPowers } from "../lib/powers/expectedTargetEstimation";
import type { AbilityRestrictionDefinitionV1 } from "../lib/restrictions";
import {
  getRestrictionReadOnlyModel,
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
  getMonsterPowerRestrictionSummaryLabel,
  initializeMonsterPowerRestrictionDrafts,
  materializeMonsterPowerRestrictionDrafts,
  reconcileMonsterPowerRestrictionDrafts,
  rehydrateMonsterPowerRestrictionDrafts,
  resolveMonsterPowerRestrictionDraft,
  type MonsterPowerRestrictionDraftMap,
} from "../lib/restrictions/monsterPowerEditorIntegration";
import { assignSummoningPowerIdentities } from "../lib/summoning/monsterPowerReconciliation";
import { synchronizePowerCooldownCacheBatch } from "../lib/summoning/powerCooldownCacheSynchronization";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import type { MonsterPower } from "../lib/summoning/types";
import { normalizeMonsterUpsertInput } from "../lib/summoning/validation";

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
  customNarrativeText: "Only after the war horn sounds.",
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
  templateKey: "FUTURE_MONSTER_TEMPLATE",
  templateVersion: 9,
  parameters: {
    operator: { kind: "SYSTEM_ENUM", valueKey: "FUTURE_OPERATOR" },
    amount: { kind: "COUNT", value: 3 },
  },
  customNarrativeText: null,
};

function monsterPower(
  id: string,
  name: string,
  restriction: AbilityRestrictionDefinitionV1 | null,
): MonsterPower {
  const packet = {
    ...createDefaultPowerPacket("ATTACK", 0, () => `${id}-packet`),
    id: `${id}-packet`,
    hostility: "HOSTILE" as const,
    diceCount: 1,
    potency: 1,
    dealsWounds: true,
    woundChannel: "PHYSICAL" as const,
    detailsJson: {
      attackMode: "PHYSICAL",
      damageTypes: ["Slash"],
      rangeCategory: "MELEE",
      rangeValue: 1,
      rangeExtra: {},
    },
  };
  return {
    ...defaultPower({ createId: () => id }),
    id,
    name,
    restriction,
    descriptorChassis: "IMMEDIATE",
    rangeCategories: ["MELEE"],
    meleeTargets: 1,
    primaryDefenceGate: {
      sourcePacketIndex: 0,
      gateResult: "DODGE_OR_PROTECTION",
      protectionChannel: "PHYSICAL",
      resistAttribute: null,
      hostileEntryPattern: null,
      resolutionSource: "INFERRED",
    },
    defenceRequirement: "DODGE_OR_PROTECTION",
    effectPackets: [packet],
    intentions: [{ ...packet }],
  };
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

const nonePower = monsterPower("power-none", "No Restriction", null);
const standardPower = monsterPower("power-standard", "Bloodied Strike", standard);
const customPower = monsterPower("power-custom", "Horn Call", custom);
const campaignPower = monsterPower("power-campaign", "Circle Ward", campaignCustom);
const unsupportedPower = monsterPower("power-unsupported", "Future Power", unsupported);
const powers = [nonePower, standardPower, customPower, campaignPower, unsupportedPower];
const campaignMonster = toEditable({
  id: "monster-campaign",
  source: "CAMPAIGN",
  isReadOnly: false,
  name: "Restriction Monster",
  level: 1,
  tier: "SOLDIER",
  powers,
});
const coreMonster = toEditable({
  id: "monster-core",
  source: "CORE",
  isReadOnly: true,
  name: "Core Restriction Monster",
  level: 1,
  tier: "SOLDIER",
  powers,
});

// Initialization covers new, campaign, and core/read-only Monster shapes.
deepEqual(initializeMonsterPowerRestrictionDrafts([]), {}, "A new Monster without Powers initializes an empty draft map.");
const initialized = initializeMonsterPowerRestrictionDrafts(campaignMonster.powers);
deepEqual(Object.keys(initialized).sort(), powers.map((power) => power.id!).sort(), "Every Monster Power draft is keyed by stable Power ID.");
equal(initialized[nonePower.id!]?.kind, "NONE", "No Restriction initializes NONE.");
equal(initialized[standardPower.id!]?.kind, "STANDARD", "Standard Structured initializes editable.");
equal(initialized[customPower.id!]?.kind, "CUSTOM_NARRATIVE", "Custom Narrative initializes editable.");
equal(initialized[campaignPower.id!]?.kind, "CAMPAIGN_CUSTOM_READ_ONLY", "Campaign-Custom initializes locked.");
equal(initialized[unsupportedPower.id!]?.kind, "UNSUPPORTED_READ_ONLY", "Safe unsupported initializes locked.");
deepEqual(Object.keys(initializeMonsterPowerRestrictionDrafts(coreMonster.powers)).sort(), Object.keys(initialized).sort(), "Core/read-only Powers initialize the same honest read model.");
ok(!JSON.stringify(campaignMonster).includes("CAMPAIGN_CUSTOM_READ_ONLY"), "Transient draft discriminants never enter the editable Monster.");

// Stable identity survives collection and unrelated Power edits.
const reordered = [campaignMonster.powers[4]!, campaignMonster.powers[1]!, campaignMonster.powers[0]!, campaignMonster.powers[3]!, campaignMonster.powers[2]!];
const reorderedDrafts = reconcileMonsterPowerRestrictionDrafts(initialized, reordered);
equal(reorderedDrafts[standardPower.id!], initialized[standardPower.id!], "Reorder retains the same Standard draft object.");
equal(reorderedDrafts[unsupportedPower.id!], initialized[unsupportedPower.id!], "Reorder never transfers a locked draft by array position.");
const renamed = reordered.map((power) => power.id === standardPower.id ? { ...power, name: "Renamed Strike" } : power);
const renamedDrafts = reconcileMonsterPowerRestrictionDrafts(reorderedDrafts, renamed);
equal(renamedDrafts[standardPower.id!], initialized[standardPower.id!], "Rename retains draft ownership by Power ID.");
const packetEdited = renamed.map((power) => power.id === standardPower.id ? {
  ...power,
  effectPackets: power.effectPackets.map((packet) => ({ ...packet, potency: 4 })),
} : power);
const packetEditedDrafts = reconcileMonsterPowerRestrictionDrafts(renamedDrafts, packetEdited);
equal(packetEditedDrafts[standardPower.id!], initialized[standardPower.id!], "Packet edits do not overwrite an active draft.");
const insertedPower = monsterPower("power-inserted", "Inserted", null);
const insertedDrafts = reconcileMonsterPowerRestrictionDrafts(packetEditedDrafts, [insertedPower, ...packetEdited]);
equal(insertedDrafts[insertedPower.id!]?.kind, "NONE", "Inserted Power initializes No Restriction.");
equal(insertedDrafts[standardPower.id!], initialized[standardPower.id!], "Insertion does not shift another Power draft.");
const removedDrafts = reconcileMonsterPowerRestrictionDrafts(insertedDrafts, [insertedPower, ...packetEdited.filter((power) => power.id !== customPower.id)]);
equal(removedDrafts[customPower.id!], undefined, "Removing a Power removes only its draft entry.");
equal(removedDrafts[campaignPower.id!], initialized[campaignPower.id!], "Removing a Power leaves other drafts unchanged.");
const otherMonsterPowers = [monsterPower("other-power", "Other Monster Power", null)];
const switchedDrafts = initializeMonsterPowerRestrictionDrafts(otherMonsterPowers);
deepEqual(Object.keys(switchedDrafts), ["other-power"], "Switching Monsters cannot leak prior Power drafts.");
equal(switchedDrafts[standardPower.id!], undefined, "Previous Monster drafts are absent after authoritative switch initialization.");

// Authoritative create, update, and copy responses fully rehydrate drafts.
const createResponseDrafts = rehydrateMonsterPowerRestrictionDrafts([monsterPower("created-power", "Created", standard)]);
equal(createResponseDrafts["created-power"]?.kind, "STANDARD", "Create response rehydrates its returned Power ID.");
const updateResponseDrafts = rehydrateMonsterPowerRestrictionDrafts([monsterPower("power-standard", "Updated", custom)]);
equal(updateResponseDrafts["power-standard"]?.kind, "CUSTOM_NARRATIVE", "Update response replaces resolved transient state with authoritative semantics.");
const copiedPower = assignSummoningPowerIdentities(standardPower, {
  forceNew: true,
  createId: (() => { let index = 0; return () => `copy-id-${++index}`; })(),
});
ok(copiedPower.id !== standardPower.id, "Copy follows existing fresh Power identity law.");
ok(copiedPower.effectPackets[0]?.id !== standardPower.effectPackets[0]?.id, "Copy follows existing fresh packet identity law.");
deepEqual(copiedPower.restriction, standard, "Copy preserves the supported semantic definition.");
const copiedDrafts = rehydrateMonsterPowerRestrictionDrafts([copiedPower]);
equal(copiedDrafts[copiedPower.id!]?.kind, "STANDARD", "Copied Monster hydration keys the draft by returned copied Power ID.");

// Materialization laws and immutability.
const sourceSnapshot = JSON.parse(JSON.stringify(campaignMonster));
const draftSnapshot = JSON.parse(JSON.stringify(initialized));
const materialized = materializeMonsterPowerRestrictionDrafts(campaignMonster, initialized, { campaignId: "campaign-a" });
ok(materialized.ok, "Complete editable and locked drafts materialize successfully.");
ok(materialized.ok && materialized.monster !== campaignMonster, "Materialization returns a cloned Monster.");
ok(materialized.ok && materialized.monster.powers[0] !== campaignMonster.powers[0], "Materialization clones Power records.");
equal(materialized.ok && materialized.monster.powers[0]?.restriction, null, "NONE materializes null.");
deepEqual(materialized.ok && materialized.monster.powers[1]?.restriction, standard, "Valid Standard persists exactly.");
deepEqual(materialized.ok && materialized.monster.powers[2]?.restriction, custom, "Valid Custom persists exactly.");
deepEqual(materialized.ok && materialized.monster.powers[3]?.restriction, campaignCustom, "Same-campaign Campaign-Custom is preserved.");
deepEqual(materialized.ok && materialized.monster.powers[4]?.restriction, unsupported, "Safe unsupported key, version, and typed parameters are preserved.");
deepEqual(campaignMonster, sourceSnapshot, "Materialization never mutates the editable Monster or packets.");
deepEqual(initialized, draftSnapshot, "Materialization never mutates the draft map.");

const incompleteDrafts: MonsterPowerRestrictionDraftMap = {
  ...initialized,
  [standardPower.id!]: selectRestrictionSubject(
    selectRestrictionAuthoringChoice({ kind: "NONE" }, "STANDARD_STRUCTURED") as RestrictionStandardDraft,
    "THE_ACTOR",
  ),
};
const incomplete = materializeMonsterPowerRestrictionDrafts(campaignMonster, incompleteDrafts, { campaignId: "campaign-a" });
equal(incomplete.ok, false, "Incomplete Restriction blocks materialization.");
equal(!incomplete.ok && incomplete.monster, null, "Incomplete Restriction produces no payload source.");
equal(!incomplete.ok && incomplete.issues[0]?.powerId, standardPower.id!, "Incomplete issue identifies stable Power ID.");
equal(!incomplete.ok && incomplete.issues[0]?.powerName, standardPower.name, "Incomplete issue identifies visible Power name.");
equal(!incomplete.ok && incomplete.issues[0]?.resolutionStatus, "INCOMPLETE", "Incomplete issue retains resolution status.");
ok(!incomplete.ok && incomplete.issues[0]!.issueCodes.includes("EDITOR_TEMPLATE_REQUIRED"), "Incomplete issue exposes field-level codes.");

const invalidDrafts: MonsterPowerRestrictionDraftMap = {
  ...initialized,
  [standardPower.id!]: {
    kind: "STANDARD",
    subject: "THE_ACTOR",
    templateKey: "MISSING_TEMPLATE",
    templateVersion: 1,
    operator: "AT_OR_BELOW",
    values: {},
  },
};
const invalid = materializeMonsterPowerRestrictionDrafts(campaignMonster, invalidDrafts, { campaignId: "campaign-a" });
equal(invalid.ok, false, "Invalid Restriction blocks materialization.");
equal(!invalid.ok && invalid.issues[0]?.resolutionStatus, "INVALID", "Invalid issue is structured.");
const malformedDrafts: MonsterPowerRestrictionDraftMap = {
  ...initialized,
  [standardPower.id!]: {
    kind: "MALFORMED_READ_ONLY",
    issues: [{ code: "INVALID_DEFINITION", severity: "error", message: "Malformed external definition.", path: "restriction" }],
  },
};
equal(materializeMonsterPowerRestrictionDrafts(campaignMonster, malformedDrafts, { campaignId: "campaign-a" }).ok, false, "Malformed read-only state blocks save until replaced or cleared.");
const missingDrafts = { ...initialized };
delete missingDrafts[standardPower.id!];
const missing = materializeMonsterPowerRestrictionDrafts(campaignMonster, missingDrafts, { campaignId: "campaign-a" });
equal(missing.ok, false, "Missing draft blocks instead of assuming No Restriction.");
equal(!missing.ok && missing.issues[0]?.resolutionStatus, "MISSING_DRAFT", "Missing draft has stable blocking status.");
const missingIdMonster = { ...campaignMonster, powers: [{ ...campaignMonster.powers[0], id: undefined }] };
const missingId = materializeMonsterPowerRestrictionDrafts(missingIdMonster, initialized, { campaignId: "campaign-a" });
equal(missingId.ok, false, "Missing stable Power identity blocks save.");
equal(!missingId.ok && missingId.issues[0]?.resolutionStatus, "MISSING_POWER_ID", "Missing identity has stable blocking status.");
const wrongCampaign = materializeMonsterPowerRestrictionDrafts(campaignMonster, initialized, { campaignId: "campaign-b" });
equal(wrongCampaign.ok, false, "Cross-campaign locked definition remains blocked by Monster persistence authority.");
ok(!wrongCampaign.ok && wrongCampaign.issues.some((issue) => issue.issueCodes.includes("CROSS_CAMPAIGN_REFERENCE")), "Cross-campaign materialization exposes the server-authority code.");

let warningDraft = selectRestrictionAuthoringChoice({ kind: "NONE" }, "CUSTOM_NARRATIVE");
warningDraft = setCustomRestrictionNarrative(warningDraft, "Only after the bell rings and the gate closes.");
const warningResolution = resolveMonsterPowerRestrictionDraft(warningDraft);
equal(warningResolution.status, "VALID", "Warning-only narrative remains valid.");
ok(warningResolution.issues.some((issue) => issue.severity === "warning"), "Warning-only fixture actually carries a warning.");
const warningDrafts = { ...initialized, [standardPower.id!]: warningDraft };
equal(materializeMonsterPowerRestrictionDrafts(campaignMonster, warningDrafts, { campaignId: "campaign-a" }).ok, true, "Warnings do not block Monster save.");

// Stale-semantic regression: the old stored definition can never become the save result.
const staleResult = materializeMonsterPowerRestrictionDrafts(campaignMonster, incompleteDrafts, { campaignId: "campaign-a" });
equal(staleResult.ok, false, "An incomplete edit over a valid stored Restriction fails closed.");
equal(!staleResult.ok && staleResult.monster, null, "Stale stored semantics are not returned as a saveable Monster.");
deepEqual(campaignMonster.powers[1]?.restriction, standard, "Blocking the save does not mutate the stored editable semantic definition.");

// Summary labels cover every live state without exposing JSON.
equal(getMonsterPowerRestrictionSummaryLabel(initialized[nonePower.id!]!), "No Restriction", "NONE summary is compact.");
equal(getMonsterPowerRestrictionSummaryLabel(initialized[standardPower.id!]!), "Standard Restriction", "Standard summary is compact.");
equal(getMonsterPowerRestrictionSummaryLabel(initialized[customPower.id!]!), "Fully Custom Restriction", "Custom summary is compact.");
equal(getMonsterPowerRestrictionSummaryLabel(initialized[campaignPower.id!]!), "Campaign-Custom Restriction", "Campaign-Custom summary is honest.");
equal(getMonsterPowerRestrictionSummaryLabel(initialized[unsupportedPower.id!]!), "Unsupported Restriction", "Unsupported summary is honest.");
equal(getMonsterPowerRestrictionSummaryLabel(incompleteDrafts[standardPower.id!]!), "Incomplete Restriction Draft", "Incomplete summary is visible.");
equal(getMonsterPowerRestrictionSummaryLabel(invalidDrafts[standardPower.id!]!), "Invalid Restriction Draft", "Invalid summary is visible.");

// Complete logical create/update pipeline preserves every unrelated Power field.
const pipelineDrafts = initializeMonsterPowerRestrictionDrafts([standardPower]);
pipelineDrafts[standardPower.id!] = validHealthDraft(25);
const pipelineMonster = toEditable({
  id: "pipeline-monster",
  source: "CAMPAIGN",
  isReadOnly: false,
  name: "Pipeline Monster",
  level: 1,
  tier: "SOLDIER",
  powers: [standardPower],
});
const pipelineMaterialized = materializeMonsterPowerRestrictionDrafts(pipelineMonster, pipelineDrafts, { campaignId: "campaign-a" });
ok(pipelineMaterialized.ok, "Edited Standard Restriction materializes for create/update.");
const payload = pipelineMaterialized.ok ? toPayload(pipelineMaterialized.monster) : null;
ok(payload, "Successful materialization reaches the existing toPayload path.");
equal(payload.powers[0]?.id, standardPower.id, "toPayload preserves Power identity.");
equal(payload.powers[0]?.effectPackets[0]?.id, standardPower.effectPackets[0]?.id, "toPayload preserves packet identity.");
deepEqual(payload.powers[0]?.restriction?.parameters.percentage, { kind: "PERCENTAGE", value: 25 }, "toPayload receives only resolved current semantics.");
const normalized = normalizeMonsterUpsertInput(payload, { campaignId: "campaign-a" });
ok(normalized.ok, "Existing Monster server normalizer accepts the materialized payload with campaign context.");
ok(normalized.ok && normalized.data.powers[0]?.restriction?.templateKey === standard.templateKey, "Server normalization preserves the Restriction.");
const expectedTargets = normalized.ok
  ? applyAutomaticExpectedTargetsToPowers(normalized.data.powers, { source: "FALLBACK_STANDARD_TEAM_SIZE_4", totalTeamSize: 4 })
  : [];
ok(expectedTargets[0]?.restriction?.templateKey === standard.templateKey, "Automatic expected-target application preserves Restriction.");
equal(expectedTargets[0]?.id, standardPower.id, "Expected-target application preserves Power ID.");
equal(expectedTargets[0]?.effectPackets[0]?.id, standardPower.effectPackets[0]?.id, "Expected-target application preserves packet ID.");

const activeTuning: PowerTuningSnapshot = {
  setId: "restriction-monster-integration",
  name: "Restriction Monster Integration",
  slug: "restriction-monster-integration",
  status: "ACTIVE",
  updatedAt: "2026-07-16T00:00:00.000Z",
  values: DEFAULT_POWER_TUNING_VALUES,
};
const noRestrictionCost = resolvePowerCosts([{ ...expectedTargets[0]!, restriction: null }], activeTuning, { level: 1, tier: "SOLDIER" }).powers[0]!;
const restrictedCost = resolvePowerCosts(expectedTargets, activeTuning, { level: 1, tier: "SOLDIER" }).powers[0]!;
equal(restrictedCost.breakdown.basePowerValue, noRestrictionCost.breakdown.basePowerValue, "Restriction does not change Power BPV.");
equal(restrictedCost.derivedCooldownTurns, noRestrictionCost.derivedCooldownTurns, "Restriction does not change derived cooldown.");
deepEqual(restrictedCost.breakdown.axisVector, noRestrictionCost.breakdown.axisVector, "Restriction does not change threat axes or Monster threat contribution.");
const synchronized = synchronizePowerCooldownCacheBatch({
  powers: expectedTargets,
  tuningSnapshot: activeTuning,
  context: { level: 1, tier: "SOLDIER" },
});
ok(synchronized.ok, "Cooldown synchronization accepts materialized Monster Powers.");
ok(synchronized.ok && synchronized.powers[0]?.restriction?.templateKey === standard.templateKey, "Cooldown synchronization preserves Restriction.");
equal(synchronized.ok && synchronized.powers[0]?.id, standardPower.id, "Cooldown synchronization preserves Power ID.");
equal(synchronized.ok && synchronized.powers[0]?.effectPackets[0]?.id, standardPower.effectPackets[0]?.id, "Cooldown synchronization preserves packet ID.");
const serialized = JSON.parse(JSON.stringify(synchronized.ok ? synchronized.powers : []));
const responseMonster = toEditable({
  ...payload,
  id: "pipeline-monster",
  source: "CAMPAIGN",
  isReadOnly: false,
  powers: serialized,
});
equal(responseMonster.powers[0]?.id, standardPower.id, "JSON and authoritative response hydration preserve Power ID.");
equal(responseMonster.powers[0]?.effectPackets[0]?.id, standardPower.effectPackets[0]?.id, "JSON and authoritative response hydration preserve packet ID.");
deepEqual(responseMonster.powers[0]?.restriction?.parameters.percentage, { kind: "PERCENTAGE", value: 25 }, "JSON and authoritative response hydration preserve Restriction.");
equal(rehydrateMonsterPowerRestrictionDrafts(responseMonster.powers)[standardPower.id!]?.kind, "STANDARD", "Authoritative server-shaped response rehydrates the correct draft.");

// Source-level UI, read-only, print, and boundary assertions.
const editorSource = readFileSync("app/summoning-circle/components/SummoningCircleEditor.tsx", "utf8");
const printSource = readFileSync("app/summoning-circle/components/SummoningCirclePrintMode.tsx", "utf8");
const blockCardSource = readFileSync("app/summoning-circle/components/MonsterBlockCard.tsx", "utf8");
ok(editorSource.includes('import { RestrictionEditor }'), "Monster editor uses the shared RestrictionEditor.");
ok(editorSource.includes('import { RestrictionReadOnly }'), "Monster editor uses the shared read-only presentation.");
ok(editorSource.includes('data-testid="monster-power-whole-restriction"'), "Restriction is explicitly whole-Power UI.");
ok(editorSource.indexOf('data-testid="monster-power-whole-restriction"') < editorSource.indexOf("showRangeSection && powerRangeSection"), "Whole-Power Restriction is placed before packet authoring controls.");
ok(editorSource.includes('consumerNoun="Power"'), "Monster editor uses the shared Power consumer contract.");
ok(editorSource.includes('idPrefix={`monster-power-restriction-${power.id ?? i}`}'), "Editor IDs are deterministic from stable Power identity.");
ok(editorSource.includes("{readOnly ? (") && editorSource.includes("<RestrictionReadOnly"), "Core/read-only Powers render read-only presentation rather than editable controls.");
ok(editorSource.includes("disabled={busy}"), "Editable Restriction controls follow current busy state.");
ok(editorSource.includes("onConfirmReplace={() => window.confirm"), "Locked replacement uses deliberate Power-naming confirmation.");
ok(editorSource.includes('data-testid="monster-power-collapsed-restriction-summary"'), "Collapsed Power cards show compact Restriction state.");
ok(editorSource.indexOf('data-testid="monster-power-collapsed-restriction-summary"') > editorSource.indexOf("</button>"), "Collapsed summary is outside the interactive toggle button.");
ok(editorSource.includes('data-testid="monster-power-restriction-blocking-errors"'), "Restriction blockers are visibly listed.");
ok(editorSource.includes("disabled={busy || restrictionBlockingMessages.length > 0}"), "Save button accounts for visible Restriction blockers.");
ok(editorSource.indexOf("materializeMonsterPowerRestrictionDrafts") < editorSource.indexOf("JSON.stringify(toPayload(normalizedEditor))"), "Create and update requests materialize drafts before toPayload.");
ok(editorSource.includes("rehydrateMonsterPowerRestrictionDrafts(authoritativeEditor.powers)"), "Create/update response rehydrates from authoritative semantics.");
ok(editorSource.includes("rehydrateMonsterPowerRestrictionDrafts(copiedEditor.powers)"), "Copy response rehydrates copied Power drafts.");
ok(!editorSource.includes("playerPowerEditorIntegration"), "Monster UI does not import Player integration.");
ok(!editorSource.includes("RoleplayAbility"), "Monster UI adds no Roleplay integration.");
ok(!printSource.includes('import { RestrictionReadOnly }'), "Print no longer imports the full read-only Restriction presentation.");
ok(!printSource.includes('data-testid="monster-power-print-restrictions"'), "Print has no separate Power Restrictions section.");
ok(!printSource.includes("Power Restrictions"), "Print does not reserve space for a Power Restrictions heading.");
ok(!printSource.includes("RestrictionEditor"), "Print contains no editor controls.");
ok(!printSource.includes("definition={power.restriction ?? null}"), "Print does not render null Restriction presentations.");
ok(blockCardSource.includes("renderPowerDescriptorLines(power).map"), "Ordinary Power descriptor rendering remains present and separate.");
ok(!blockCardSource.includes("<RestrictionReadOnly"), "The full Restriction presentation is not spliced into Power cards.");
ok(blockCardSource.includes('import { getRestrictionReadOnlyModel }'), "Power cards resolve the existing canonical Restriction descriptor.");
ok(blockCardSource.includes("const restrictionDescriptor = inPrint && power.restriction"), "Only printed Powers with a Restriction resolve an inline descriptor.");
ok(!blockCardSource.includes('"No Restriction"'), "Power cards never print a No Restriction placeholder.");
ok(
  blockCardSource.indexOf("renderPowerDescriptorLines(power).map") <
    blockCardSource.indexOf("{restrictionDescriptor ? (") &&
    blockCardSource.indexOf("{restrictionDescriptor ? (") <
    blockCardSource.indexOf("<p title={cooldownDisplaySource}>"),
  "The Restriction descriptor is below existing descriptor text and above Cooldown/Counter.",
);

const printMonster = (power: MonsterPower) => renderToStaticMarkup(createElement(MonsterBlockCard, {
  monster: { ...campaignMonster, powers: [power] },
  isPrint: true,
}));
const printedText = (markup: string) => markup
  .replace(/<[^>]*>/g, " ")
  .replace(/&#x27;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ")
  .trim();

const unrestrictedPrintText = printedText(printMonster({ ...nonePower, name: "Open Strike" }));
ok(!unrestrictedPrintText.includes("No Restriction"), "An unrestricted printed Power emits no Restriction placeholder.");
ok(!unrestrictedPrintText.includes("Restriction Descriptor"), "An unrestricted printed Power emits no standalone Restriction panel content.");

const expectedRestrictionDescriptor = getRestrictionReadOnlyModel(standard, {
  consumerNoun: "Power",
}).descriptor;
ok(expectedRestrictionDescriptor, "The standard Restriction fixture resolves a canonical descriptor.");
const restrictedPrintText = printedText(printMonster(standardPower));
ok(restrictedPrintText.includes(expectedRestrictionDescriptor), "A restricted printed Power includes only its canonical Restriction descriptor.");
ok(
  restrictedPrintText.indexOf(expectedRestrictionDescriptor) < restrictedPrintText.indexOf("Cooldown:"),
  "Rendered Restriction descriptor appears before Cooldown/Counter.",
);
ok(!restrictedPrintText.includes("Evaluation Status"), "A restricted printed Power omits Restriction evaluation metadata.");
ok(!restrictedPrintText.includes("Validation Status"), "A restricted printed Power omits Restriction validation metadata.");

assert.ok(checks >= 100, `Expected at least 100 Monster editor integration checks, got ${checks}.`);
console.log(`Monster Power Restriction editor integration smoke passed (${checks} checks).`);
