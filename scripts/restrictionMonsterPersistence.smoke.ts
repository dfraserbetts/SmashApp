import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Prisma } from "@prisma/client";

import {
  createDefaultPowerPacket,
  defaultPower,
  toEditable,
  toPayload,
} from "../app/summoning-circle/components/SummoningCircleEditor";
import {
  normalizeMonsterRestrictionForWrite,
  readMonsterRestrictionFromDatabase,
  serializeMonsterRestrictionForDatabase,
} from "../lib/restrictions/monsterPersistence";
import type { AbilityRestrictionDefinitionV1 } from "../lib/restrictions";
import { planMonsterPowerReconciliation } from "../lib/summoning/monsterPowerReconciliation";
import type { EffectPacket, Power } from "../lib/summoning/types";
import { normalizeMonsterUpsertInput } from "../lib/summoning/validation";

let checks = 0;
function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  checks += 1;
}
function deepEqual(actual: unknown, expected: unknown, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function ok(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  checks += 1;
}
function hasCode(issues: readonly { code: string }[], code: string): boolean {
  return issues.some((entry) => entry.code === code);
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
const narrative: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "CUSTOM_NARRATIVE",
  templateKey: null,
  templateVersion: null,
  parameters: {},
  customNarrativeText: "This Power may only be used after accepting responsibility.",
};
const unsupported: AbilityRestrictionDefinitionV1 = {
  schemaVersion: 1,
  authoringMode: "STANDARD_STRUCTURED",
  templateKey: "FUTURE_MONSTER_TEMPLATE",
  templateVersion: 9,
  parameters: { futureValue: { kind: "NUMBER", value: 3 } },
  customNarrativeText: null,
};

// Pure read/write adapter and Prisma null semantics.
for (const empty of [undefined, null, Prisma.DbNull, Prisma.JsonNull]) {
  const read = readMonsterRestrictionFromDatabase(empty);
  equal(read.status, "NONE", "Database NULL and historical JSON null read as no Restriction.");
  equal(read.definition, null, "No database Restriction produces no trusted semantic definition.");
  const write = normalizeMonsterRestrictionForWrite(empty, { campaignId: "campaign-a" });
  ok(write.ok, "Absent Restriction is a legal write.");
  equal(write.definition, null, "Absent Restriction normalizes to null.");
}
equal(
  serializeMonsterRestrictionForDatabase(null, Prisma.DbNull),
  Prisma.DbNull,
  "Canonical absence uses Prisma.DbNull, not JSON literal null.",
);

for (const [label, definition, campaignId] of [
  ["Standard Structured", standard, null],
  ["Campaign-Custom Structured", campaignCustom, "campaign-a"],
  ["Custom Narrative", narrative, null],
] as const) {
  const write = normalizeMonsterRestrictionForWrite(definition, { campaignId });
  ok(write.ok, `${label} is accepted for relational persistence.`);
  deepEqual(write.definition, definition, `${label} survives write normalization.`);
  const json = serializeMonsterRestrictionForDatabase(write.definition, Prisma.DbNull);
  ok(json !== Prisma.DbNull, `${label} writes a semantic JSON object.`);
  const read = readMonsterRestrictionFromDatabase(JSON.parse(JSON.stringify(json)));
  deepEqual(read.definition, definition, `${label} survives JSON save/load and read normalization.`);
}

const malformed = normalizeMonsterRestrictionForWrite(
  { schemaVersion: 1, authoringMode: "NOT_A_MODE" },
  { campaignId: "campaign-a" },
);
equal(malformed.ok, false, "Malformed explicit Restriction input is rejected.");
const compound = normalizeMonsterRestrictionForWrite(
  { ...standard, conditions: [standard] },
  { campaignId: "campaign-a" },
);
equal(compound.ok, false, "Fatal compound Restriction input is rejected.");
ok(hasCode(compound.issues, "COMPOUND_STRUCTURE"), "Compound rejection retains its diagnostic code.");
const malformedRead = readMonsterRestrictionFromDatabase({ schemaVersion: 1, nope: true });
equal(malformedRead.status, "INVALID", "Malformed stored JSON is diagnosed without throwing.");
equal(malformedRead.definition, null, "Malformed stored JSON produces no trusted definition.");

const wrongCampaign = normalizeMonsterRestrictionForWrite(campaignCustom, {
  campaignId: "campaign-b",
});
equal(wrongCampaign.ok, false, "Cross-campaign references are rejected.");
ok(hasCode(wrongCampaign.issues, "CROSS_CAMPAIGN_REFERENCE"), "Cross-campaign rejection is explicit.");
const globalReference = normalizeMonsterRestrictionForWrite(campaignCustom, { campaignId: null });
equal(globalReference.ok, false, "Global/core Monster Powers cannot acquire campaign references.");
ok(
  hasCode(globalReference.issues, "CAMPAIGN_REFERENCE_REQUIRES_CAMPAIGN_MONSTER"),
  "Global/core campaign-reference rejection is explicit.",
);

const unsupportedWrite = normalizeMonsterRestrictionForWrite(unsupported, { campaignId: null });
ok(unsupportedWrite.ok, "Safe unknown templates remain round-trippable.");
equal(unsupportedWrite.status, "UNSUPPORTED", "Unknown template status remains unsupported.");
deepEqual(unsupportedWrite.definition, unsupported, "Unknown key, version, and typed parameters are preserved.");
ok(
  unsupportedWrite.issues.some(
    (entry) => entry.code === "UNKNOWN_TEMPLATE" && entry.severity === "warning",
  ),
  "Unknown templates carry an explicit unsupported warning.",
);

const junked = normalizeMonsterRestrictionForWrite({
  ...standard,
  generatedDescriptor: "Do not persist",
  displayLabel: "Do not persist",
  approvalState: "APPROVED",
  reviewerId: "reviewer-1",
  restrictionDiscountPercent: 99,
  threatBudgetRefund: 12,
  runtimeEligible: true,
  combatLabState: "SUPPORTED",
}, { campaignId: null });
ok(junked.ok, "Non-semantic persistence junk is stripped rather than trusted.");
deepEqual(junked.definition, standard, "Only the shared semantic definition is persisted.");

// Monster editor bridge, API normalization, and Power invariants.
let nextId = 0;
const createId = () => `fixture-id-${++nextId}`;
const defaultFixturePower = defaultPower({ createId });
const packet = {
  ...createDefaultPowerPacket("AUGMENT", 0, createId),
  id: "packet-a",
  packetIndex: 0,
  sortOrder: 0,
  hostility: "NON_HOSTILE" as const,
  intention: "AUGMENT" as const,
  type: "AUGMENT" as const,
  specific: "Attack",
  diceCount: 4,
  potency: 3,
  modifier: 5,
  effectTimingType: "START_OF_TURN" as const,
  effectTimingTurns: 2,
  effectDurationType: "TURNS" as const,
  effectDurationTurns: 4,
  targetedAttribute: "ATTACK" as const,
  applyTo: "ALLIES" as const,
  detailsJson: {
    statTarget: "Attack",
    rangeCategory: "RANGED",
    rangeValue: 60,
    rangeExtra: { targets: 2 },
    expectedTargetCount: 2,
  },
} satisfies EffectPacket;
const sourcePower: Power = {
  ...defaultFixturePower,
  id: "power-a",
  sortOrder: 0,
  name: "Restricted Rally",
  description: "Preserve the complete authored Power.",
  restriction: standard,
  rangeCategories: ["RANGED"],
  rangedTargets: 2,
  rangedDistanceFeet: 60,
  cooldownTurns: 2,
  cooldownReduction: 0,
  effectPackets: [packet],
  intentions: [{ ...packet }],
};
const editable = toEditable({
  id: "monster-a",
  name: "Restriction fixture",
  level: 3,
  tier: "SOLDIER",
  powers: [
    sourcePower,
    {
      ...sourcePower,
      id: "power-b",
      sortOrder: 1,
      restriction: narrative,
      effectPackets: [{ ...packet, id: "packet-b" }],
      intentions: [{ ...packet, id: "packet-b" }],
    },
  ],
}, { createId });
deepEqual(editable.powers[0]?.restriction, standard, "GET-shaped Power hydration preserves Restriction.");
const payload = toPayload(editable);
deepEqual(payload.powers[0]?.restriction, standard, "Create/update payload mapping preserves Restriction.");
const normalized = normalizeMonsterUpsertInput(payload, { campaignId: "campaign-a" });
ok(normalized.ok, `Monster create/update normalization accepts valid Restrictions${normalized.ok ? "." : `: ${normalized.error}`}`);
const normalizedPower = normalized.data.powers[0]!;
deepEqual(normalizedPower.restriction, standard, "Normalized Power retains semantic Restriction.");
equal(normalizedPower.id, "power-a", "Power identity is unchanged.");
equal(normalizedPower.effectPackets[0]?.id, "packet-a", "Packet identity is unchanged.");
equal(normalizedPower.sortOrder, 0, "Power ordering is unchanged.");
equal(normalized.data.powers[1]?.id, "power-b", "Second Power ordering and identity are unchanged.");
equal(normalizedPower.effectPackets[0]?.modifier, 5, "Semantic Augment modifier is unchanged.");
equal(normalizedPower.effectPackets[0]?.targetedAttribute, "ATTACK", "Semantic Augment target is unchanged.");
equal(normalizedPower.effectPackets[0]?.detailsJson.expectedTargetCount, 2, "Expected-target data is unchanged.");
equal(normalizedPower.cooldownTurns, 2, "Cooldown cache data is unchanged.");
equal(normalizedPower.cooldownReduction, 0, "Cooldown reduction is unchanged.");
equal(normalizedPower.diceCount, 4, "Cost-relevant dice are unchanged.");
equal(normalizedPower.potency, 3, "Cost-relevant potency is unchanged.");

const noRestrictionPayload = structuredClone(payload);
noRestrictionPayload.powers[0]!.restriction = null;
const noRestriction = normalizeMonsterUpsertInput(noRestrictionPayload, { campaignId: "campaign-a" });
ok(noRestriction.ok, "Legacy payloads with no Restriction remain accepted.");
equal(noRestriction.data.powers[0]?.restriction, null, "No Restriction remains null.");

const malformedPayload = structuredClone(payload) as unknown as Record<string, unknown>;
((malformedPayload.powers as Array<Record<string, unknown>>)[0]).restriction = {
  schemaVersion: 1,
  authoringMode: "NOT_A_MODE",
};
const malformedPayloadResult = normalizeMonsterUpsertInput(malformedPayload, { campaignId: "campaign-a" });
equal(malformedPayloadResult.ok, false, "Malformed explicit API Restriction returns a validation failure.");
if (!malformedPayloadResult.ok) {
  ok(
    malformedPayloadResult.error.startsWith("POWER_1_RESTRICTION_INVALID:"),
    "Malformed explicit API Restriction has a stable client-facing error prefix.",
  );
}
const compoundPayload = structuredClone(payload) as unknown as Record<string, unknown>;
((compoundPayload.powers as Array<Record<string, unknown>>)[0]).restriction = {
  ...standard,
  conditions: [standard],
};
const compoundPayloadResult = normalizeMonsterUpsertInput(compoundPayload, { campaignId: "campaign-a" });
equal(compoundPayloadResult.ok, false, "Fatal compound API Restriction returns a validation failure.");
const crossCampaignPayload = structuredClone(payload);
crossCampaignPayload.powers[0]!.restriction = campaignCustom;
const crossCampaignPayloadResult = normalizeMonsterUpsertInput(crossCampaignPayload, { campaignId: "campaign-b" });
equal(crossCampaignPayloadResult.ok, false, "Cross-campaign API Restriction returns a validation failure.");

const unsupportedPayload = structuredClone(payload);
unsupportedPayload.powers[0]!.restriction = unsupported;
const unsupportedPayloadResult = normalizeMonsterUpsertInput(unsupportedPayload, { campaignId: "campaign-a" });
ok(unsupportedPayloadResult.ok, "Older clients may read and resave safe unsupported Restrictions.");
deepEqual(unsupportedPayloadResult.data.powers[0]?.restriction, unsupported, "Unsupported API Restriction is not remapped or dropped.");

// Copy validation follows the destination campaign and its all-or-nothing 400 policy.
for (const definition of [standard, narrative, campaignCustom]) {
  const copy = normalizeMonsterRestrictionForWrite(definition, { campaignId: "campaign-a" });
  ok(copy.ok, "Standard, narrative, and same-campaign definitions survive copy validation.");
  deepEqual(copy.definition, definition, "Copy validation preserves semantic definition exactly.");
}
equal(
  normalizeMonsterRestrictionForWrite(campaignCustom, { campaignId: "campaign-b" }).ok,
  false,
  "Copy validation blocks cross-campaign references.",
);

// Reconciliation indices keep each Restriction attached to its authored Power.
const submitted = [
  { ...sourcePower, id: "power-b", sortOrder: 0, restriction: null, effectPackets: [{ ...packet, id: "packet-b" }] },
  { ...sourcePower, id: "power-a", sortOrder: 1, restriction: campaignCustom, effectPackets: [{ ...packet, id: "packet-a", potency: 4 }] },
  { ...sourcePower, id: "power-new", sortOrder: 2, restriction: unsupported, effectPackets: [{ ...packet, id: "packet-new" }] },
];
const reconciliation = planMonsterPowerReconciliation({
  mode: "UPDATE",
  monsterId: "monster-a",
  submittedPowers: submitted.map((power) => ({ id: power.id, packets: power.effectPackets })),
  existingPowers: [
    { id: "power-a", monsterId: "monster-a", packets: [{ id: "packet-a" }] },
    { id: "power-b", monsterId: "monster-a", packets: [{ id: "packet-b" }] },
    { id: "power-removed", monsterId: "monster-a", packets: [{ id: "packet-removed" }] },
  ],
  occupiedPowers: [
    { id: "power-a", monsterId: "monster-a" },
    { id: "power-b", monsterId: "monster-a" },
  ],
  occupiedPackets: [
    { id: "packet-a", powerId: "power-a", monsterId: "monster-a" },
    { id: "packet-b", powerId: "power-b", monsterId: "monster-a" },
  ],
});
deepEqual(reconciliation.updatePowers.map((plan) => plan.powerId), ["power-b", "power-a"], "Reordered Powers retain their identities.");
equal(submitted[reconciliation.updatePowers[0]!.submittedPowerIndex]?.restriction, null, "Removed Restriction stays with power-b.");
deepEqual(submitted[reconciliation.updatePowers[1]!.submittedPowerIndex]?.restriction, campaignCustom, "Changed Restriction stays with power-a.");
deepEqual(reconciliation.createPowers, [{ submittedPowerIndex: 2, suppliedId: "power-new" }], "Inserted Power remains distinct.");
deepEqual(submitted[reconciliation.createPowers[0]!.submittedPowerIndex]?.restriction, unsupported, "Unsupported Restriction stays with inserted Power.");
deepEqual(reconciliation.deletePowerIds, ["power-removed"], "Removed Power is deleted without Restriction transfer.");
deepEqual(reconciliation.updatePowers[1]?.updatePackets, [{ submittedPacketIndex: 0, packetId: "packet-a" }], "Packet edits preserve packet identity.");

// Current route and editor bridges all include the relational field without adding UI.
for (const path of [
  "app/api/summoning-circle/monsters/route.ts",
  "app/api/summoning-circle/monsters/[id]/route.ts",
  "app/api/summoning-circle/monsters/[id]/copy/route.ts",
]) {
  const source = readFileSync(path, "utf8");
  ok(source.includes("restrictionJson: serializeMonsterRestrictionForDatabase"), `${path} writes restrictionJson.`);
  ok(source.includes("restriction: readMonsterRestrictionFromDatabase"), `${path} serializes restrictionJson to the shared Power shape.`);
}
const createRoute = readFileSync("app/api/summoning-circle/monsters/route.ts", "utf8");
const updateRoute = readFileSync("app/api/summoning-circle/monsters/[id]/route.ts", "utf8");
const copyRoute = readFileSync("app/api/summoning-circle/monsters/[id]/copy/route.ts", "utf8");
ok(createRoute.includes("normalizeMonsterUpsertInput(body, { campaignId })"), "Create validation uses the Monster campaign identity.");
ok(updateRoute.includes("normalizeMonsterUpsertInput(body, { campaignId })"), "Update validation uses the Monster campaign identity.");
ok(copyRoute.includes("campaignId: source.campaignId"), "Copy validates every Restriction against its source and destination campaign identity.");
ok(copyRoute.includes("{ status: 400 }"), "Copy retains a blocking client-error policy.");
ok(copyRoute.includes('OR: [{ source: "CORE" }, { source: "CAMPAIGN", campaignId }]'), "Core/read-only source copying remains available under the existing permission filter.");
const editorSource = readFileSync("app/summoning-circle/components/SummoningCircleEditor.tsx", "utf8");
ok(editorSource.includes("readMonsterRestrictionFromDatabase(p.restriction).definition"), "Editor hydration preserves opaque Restriction data without exposing new UI.");
ok(!editorSource.includes("Restriction editor"), "This phase does not add a Restriction editor.");

console.log(`Monster Restriction persistence smoke passed (${checks} checks).`);
