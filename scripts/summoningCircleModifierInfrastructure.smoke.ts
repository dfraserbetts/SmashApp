import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createDefaultPowerPacket,
  defaultPower,
  removeSelectedTraitAtIndex,
  toEditable,
  toPayload,
} from "../app/summoning-circle/components/SummoningCircleEditor";
import {
  getThreeFieldAugmentDebuffPublicWriteError,
  THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_ENABLED,
} from "../lib/powers/authoringRules";
import {
  assignSummoningPowerIdentities,
  getSummoningSemanticPreviewDiagnostics,
  MonsterPowerIdentityError,
  planMonsterPowerReconciliation,
} from "../lib/summoning/monsterPowerReconciliation";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import type { EffectPacket, Power } from "../lib/summoning/types";
import { normalizeMonsterUpsertInput } from "../lib/summoning/validation";

function deterministicIds(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

const createId = deterministicIds("client-id");
const created = defaultPower({ createId });
assert.equal(created.effectPackets[0]?.id, "client-id-1", "A new packet receives an ID immediately.");
assert.equal(created.id, "client-id-2", "A new power receives an ID immediately.");
const scalarEdit = { ...created, name: "Edited", cooldownTurns: 3 };
assert.equal(scalarEdit.id, created.id, "Scalar edits preserve the power ID.");
assert.equal(scalarEdit.effectPackets[0]?.id, created.effectPackets[0]?.id, "Scalar edits preserve packet IDs.");

const packetIds = deterministicIds("packet-id");
const firstAddedPacket = createDefaultPowerPacket("ATTACK", 1, packetIds);
const reAddedPacket = createDefaultPowerPacket("ATTACK", 1, packetIds);
assert.notEqual(firstAddedPacket.id, reAddedPacket.id, "Removing and re-adding creates a new packet ID.");

assert.deepEqual(
  removeSelectedTraitAtIndex(
    [
      { traitDefinitionId: "trait-a", sortOrder: 0 },
      { traitDefinitionId: "trait-b", sortOrder: 1 },
      { traitDefinitionId: "trait-c", sortOrder: 2 },
    ],
    1,
  ),
  [
    { traitDefinitionId: "trait-a", sortOrder: 0 },
    { traitDefinitionId: "trait-c", sortOrder: 1 },
  ],
  "Clicking a selected Trait chip removes that trait and restores contiguous sort order.",
);

const copied = assignSummoningPowerIdentities(created, {
  forceNew: true,
  createId: deterministicIds("copy-id"),
});
assert.notEqual(copied.id, created.id, "A copied power receives a new identity.");
assert.notEqual(copied.effectPackets[0]?.id, created.effectPackets[0]?.id, "Copied packets receive new identities.");
assert.equal(copied.effectPackets[0]?.intention, created.effectPackets[0]?.intention);

const persistedPacket = {
  id: "persisted-packet",
  packetIndex: 0,
  sortOrder: 0,
  hostility: "NON_HOSTILE",
  intention: "AUGMENT",
  type: "AUGMENT",
  specific: "Attack",
  diceCount: 4,
  potency: 3,
  modifier: 5,
  effectTimingType: "START_OF_TURN",
  effectTimingTurns: 2,
  effectDurationType: "TURNS",
  effectDurationTurns: 4,
  dealsWounds: false,
  woundChannel: null,
  targetedAttribute: "ATTACK",
  resolutionOrigin: "PRIMARY_TARGET",
  applyTo: "ALLIES",
  secondaryDependencyMode: null,
  triggerConditionText: null,
  detailsJson: {
    expectedTargetCount: 2,
    recurrence: "EVERY_TURN",
    dependencyPowerId: "persisted-power",
    dependencyPacketId: "persisted-packet",
  },
  localTargetingOverride: {
    meleeTargets: null,
    rangedTargets: 2,
    rangedDistanceFeet: 60,
    aoeCenterRangeFeet: null,
    aoeCount: null,
    aoeShape: null,
    aoeSphereRadiusFeet: null,
    aoeConeLengthFeet: null,
    aoeLineWidthFeet: null,
    aoeLineLengthFeet: null,
  },
} satisfies EffectPacket;

const hydrated = toEditable(
  {
    id: "monster-fixture",
    name: "Hydration fixture",
    level: 3,
    tier: "SOLDIER",
    powers: [
      {
        id: "persisted-power",
        sortOrder: 0,
        name: "Semantic Augment",
        description: "Preserve all fields",
        schemaVersion: 2,
        rulesVersion: "semantic-v1",
        contentRevision: 7,
        previewRendererVersion: 3,
        status: "ACTIVE",
        rangeCategories: ["RANGED"],
        rangedTargets: 2,
        rangedDistanceFeet: 60,
        cooldownTurns: 2,
        cooldownReduction: 0,
        effectPackets: [persistedPacket],
      },
      {
        id: "legacy-power",
        sortOrder: 1,
        name: "Legacy Augment",
        cooldownTurns: 1,
        cooldownReduction: 0,
        effectPackets: [{ ...persistedPacket, id: "legacy-packet", modifier: null }],
      },
    ],
  },
  { createId: deterministicIds("hydration-fallback") },
);
const hydratedPower = hydrated.powers[0];
const hydratedPacket = hydratedPower.effectPackets[0];
assert.equal(hydratedPower.id, "persisted-power");
assert.equal(hydratedPacket.id, "persisted-packet");
assert.equal(hydratedPacket.modifier, 5);
assert.equal(hydrated.powers[1]?.effectPackets[0]?.modifier, null, "Legacy null remains null.");
assert.equal(hydratedPacket.diceCount, 4);
assert.equal(hydratedPacket.potency, 3);
assert.equal(hydratedPacket.effectTimingType, "START_OF_TURN");
assert.equal(hydratedPacket.effectDurationTurns, 4);
assert.equal(hydratedPacket.targetedAttribute, "ATTACK");
assert.equal(hydratedPacket.applyTo, "ALLIES");
assert.deepEqual(hydratedPacket.localTargetingOverride, persistedPacket.localTargetingOverride);

const payload = toPayload(hydrated);
const payloadPower = payload.powers[0];
const payloadPacket = payloadPower.effectPackets[0];
assert.equal(payloadPower.id, "persisted-power");
assert.equal(payloadPacket.id, "persisted-packet");
assert.equal(payloadPacket.modifier, 5);
assert.equal(payloadPacket.diceCount, 4);
assert.equal(payloadPacket.potency, 3);
assert.equal(payloadPacket.effectTimingType, "START_OF_TURN");
assert.equal(payloadPacket.effectDurationType, "TURNS");
assert.equal(payloadPacket.effectDurationTurns, 4);
assert.equal(payloadPacket.secondaryDependencyMode, null);
for (const [key, value] of Object.entries(hydratedPacket.detailsJson)) {
  assert.deepEqual(
    (payloadPacket.detailsJson as Record<string, unknown>)[key],
    value,
    `Payload details preserve ${key}.`,
  );
}

const normalized = normalizeMonsterUpsertInput(payload);
assert.equal(normalized.ok, true, "Server normalization accepts the round-trip payload.");
if (normalized.ok) {
  assert.equal(normalized.data.powers[0]?.id, "persisted-power");
  assert.equal(normalized.data.powers[0]?.effectPackets[0]?.id, "persisted-packet");
  assert.equal(normalized.data.powers[0]?.effectPackets[0]?.modifier, 5);
  assert.equal(normalized.data.powers[0]?.effectPackets[0]?.diceCount, 4);
  assert.equal(normalized.data.powers[0]?.effectPackets[0]?.potency, 3);
}

const malformedPayload = structuredClone(payload);
malformedPayload.powers[0]!.id = " ";
assert.equal(normalizeMonsterUpsertInput(malformedPayload).ok, false, "Malformed identities reject.");
const duplicatePayload = structuredClone(payload);
duplicatePayload.powers[1]!.id = duplicatePayload.powers[0]!.id;
assert.equal(normalizeMonsterUpsertInput(duplicatePayload).ok, false, "Duplicate power IDs reject.");
duplicatePayload.powers[1]!.id = "legacy-power";
duplicatePayload.powers[1]!.effectPackets[0]!.id = duplicatePayload.powers[0]!.effectPackets[0]!.id;
assert.equal(normalizeMonsterUpsertInput(duplicatePayload).ok, false, "Duplicate packet IDs reject.");

const existingGraph = [
  { id: "power-a", monsterId: "monster-a", packets: [{ id: "packet-a" }, { id: "packet-removed" }] },
  { id: "power-removed", monsterId: "monster-a", packets: [{ id: "removed-power-packet" }] },
];
const plan = planMonsterPowerReconciliation({
  mode: "UPDATE",
  monsterId: "monster-a",
  submittedPowers: [
    { id: "power-a", packets: [{ id: "packet-a" }, { id: "packet-new" }] },
    { id: "power-new", packets: [{ id: "new-power-packet" }] },
    { packets: [{ id: undefined }] },
  ],
  existingPowers: existingGraph,
  occupiedPowers: [{ id: "power-a", monsterId: "monster-a" }],
  occupiedPackets: [{ id: "packet-a", powerId: "power-a", monsterId: "monster-a" }],
});
assert.deepEqual(plan.updatePowers[0], {
  submittedPowerIndex: 0,
  powerId: "power-a",
  createPackets: [{ submittedPacketIndex: 1, suppliedId: "packet-new" }],
  updatePackets: [{ submittedPacketIndex: 0, packetId: "packet-a" }],
  deletePacketIds: ["packet-removed"],
});
assert.deepEqual(plan.deletePowerIds, ["power-removed"]);
assert.deepEqual(plan.createPowers, [
  { submittedPowerIndex: 1, suppliedId: "power-new" },
  { submittedPowerIndex: 2 },
]);

assert.throws(
  () => planMonsterPowerReconciliation({
    mode: "UPDATE",
    monsterId: "monster-a",
    submittedPowers: [{ id: "foreign-power", packets: [] }],
    existingPowers: existingGraph,
    occupiedPowers: [{ id: "foreign-power", monsterId: "monster-b" }],
    occupiedPackets: [],
  }),
  (error) => error instanceof MonsterPowerIdentityError && error.code === "POWER_ID_OWNED_BY_ANOTHER_MONSTER",
);
assert.throws(
  () => planMonsterPowerReconciliation({
    mode: "UPDATE",
    monsterId: "monster-a",
    submittedPowers: [{ id: "power-a", packets: [{ id: "packet-b" }] }],
    existingPowers: existingGraph,
    occupiedPowers: [{ id: "power-a", monsterId: "monster-a" }],
    occupiedPackets: [{ id: "packet-b", powerId: "power-b", monsterId: "monster-a" }],
  }),
  (error) => error instanceof MonsterPowerIdentityError && error.code === "PACKET_ID_OWNED_BY_ANOTHER_POWER",
);

const completeSemanticPower: Power = {
  ...created,
  id: "semantic-power",
  name: "Complete semantic augment",
  rangeCategories: ["RANGED"],
  rangedTargets: 1,
  rangedDistanceFeet: 30,
  effectDurationType: "TURNS",
  effectDurationTurns: 2,
  durationType: "TURNS",
  durationTurns: 2,
  effectPackets: [{
    ...created.effectPackets[0]!,
    id: "semantic-packet",
    intention: "AUGMENT",
    type: "AUGMENT",
    modifier: 3,
    diceCount: 2,
    potency: 2,
    targetedAttribute: "ATTACK",
    effectDurationType: "TURNS",
    effectDurationTurns: 2,
    secondaryDependencyMode: null,
    detailsJson: { statTarget: "ATTACK" },
  }],
};
completeSemanticPower.intentions = completeSemanticPower.effectPackets.map((packet) => ({ ...packet }));
assert.deepEqual(getSummoningSemanticPreviewDiagnostics(completeSemanticPower), []);
const semanticResolution = resolvePowerCosts([completeSemanticPower], undefined, { level: 3, tier: "SOLDIER" });
assert.ok(Number.isFinite(semanticResolution.powers[0]?.breakdown.basePowerValue));

const missingPacketId = structuredClone(completeSemanticPower);
delete missingPacketId.effectPackets[0]!.id;
assert.ok(getSummoningSemanticPreviewDiagnostics(missingPacketId).some((message) => message.includes("MISSING_STABLE_ID")));
const instantDuration = structuredClone(completeSemanticPower);
instantDuration.effectPackets[0]!.effectDurationType = "INSTANT";
assert.ok(getSummoningSemanticPreviewDiagnostics(instantDuration).some((message) => message.includes("DURATION_INSTANT_UNSUPPORTED")));
const missingOccupancy = structuredClone(completeSemanticPower);
missingOccupancy.rangeCategories = ["AOE"];
missingOccupancy.effectPackets[0]!.detailsJson = { statTarget: "ATTACK" };
assert.ok(getSummoningSemanticPreviewDiagnostics(missingOccupancy).some((message) => message.includes("EXPECTED_TARGET_COUNT_UNRESOLVED")));
const legacyPower = structuredClone(completeSemanticPower);
legacyPower.effectPackets[0]!.modifier = null;
assert.deepEqual(getSummoningSemanticPreviewDiagnostics(legacyPower), [], "Legacy packets stay on the legacy preview path.");
assert.doesNotThrow(() => resolvePowerCosts([legacyPower], undefined, { level: 3, tier: "SOLDIER" }));

assert.equal(
  getThreeFieldAugmentDebuffPublicWriteError([completeSemanticPower]),
  THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_ENABLED
    ? null
    : "THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED: Modifier authoring is not available in Phase 1.",
);

const postSource = readFileSync("app/api/summoning-circle/monsters/route.ts", "utf8");
const putSource = readFileSync("app/api/summoning-circle/monsters/[id]/route.ts", "utf8");
const editorSource = readFileSync(
  "app/summoning-circle/components/SummoningCircleEditor.tsx",
  "utf8",
);
const selectedTraitsStart = editorSource.indexOf("Selected Traits");
const availableTraitsStart = editorSource.indexOf("Helpful Traits", selectedTraitsStart);
const selectedTraitsSource = editorSource.slice(selectedTraitsStart, availableTraitsStart);
assert.match(
  selectedTraitsSource,
  /<button[\s\S]*onClick=\{\(\) =>[\s\S]*removeSelectedTraitAtIndex\(p\.traits, index\)[\s\S]*aria-label=\{`Remove trait \$\{label\}`\}/,
  "The full selected Trait chip remains the accessible removal button.",
);
assert.match(postSource, /\.\.\.\(power\.id \? \{ id: power\.id \} : \{\}\)/, "POST persists supplied power IDs.");
assert.match(postSource, /\.\.\.\(effectPacket\.id \? \{ id: effectPacket\.id \} : \{\}\)/, "POST persists supplied packet IDs.");
assert.doesNotMatch(putSource, /tx\.power\.deleteMany\(\{ where: \{ monsterId: id \} \}\)/, "PUT must not delete every power.");
assert.match(putSource, /tx\.power\.update\(/, "Retained powers update in place.");
assert.match(putSource, /tx\.effectPacket\.update\(/, "Retained packets update in place.");
assert.match(putSource, /deletePacketIds/, "Only planned packet removals cascade.");
assert.match(putSource, /deletePowerIds/, "Only planned power removals cascade.");

console.log("Summoning Circle modifier infrastructure smoke passed.");
