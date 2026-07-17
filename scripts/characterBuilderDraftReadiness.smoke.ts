import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { defaultBuilderData } from "../lib/characterBuilder/core";
import {
  buildCharacterGrossBudgetReadiness,
  createDefaultCharacterPower,
  signatureMovePointPool,
  summarizeCharacterPowerValidation,
  synchronizeCharacterPowerCooldownCaches,
  validateCharacterPowers,
  validateCharacterPowersForDraftSave,
  type CharacterPower,
} from "../lib/characterBuilder/powers";
import {
  DEFAULT_POWER_TUNING_VALUES,
  type PowerTuningSnapshot,
} from "../lib/config/powerTuningShared";
import { selectRestrictionAuthoringChoice } from "../lib/restrictions/editorModel";
import { materializePlayerPowerRestrictionDrafts } from "../lib/restrictions/playerPowerEditorIntegration";

let checks = 0;
function check(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  checks += 1;
}
function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  checks += 1;
}

const activeTuning: PowerTuningSnapshot = {
  setId: "character-builder-draft-readiness",
  name: "Character Builder Draft Readiness",
  slug: "character-builder-draft-readiness",
  status: "ACTIVE",
  updatedAt: "2026-07-17T00:00:00.000Z",
  values: DEFAULT_POWER_TUNING_VALUES,
};

function validPower(index: number, highMagnitude = false): CharacterPower {
  const power = createDefaultCharacterPower(index);
  const packet = power.effectPackets[0];
  const nextPacket = {
    ...packet,
    diceCount: highMagnitude ? 20 : 1,
    potency: highMagnitude ? 20 : 1,
    detailsJson: {
      ...(packet.detailsJson ?? {}),
      damageTypes: ["Slash"],
    },
  };
  return {
    ...power,
    name: highMagnitude ? `High Magnitude ${index + 1}` : `Valid Power ${index + 1}`,
    diceCount: nextPacket.diceCount,
    potency: nextPacket.potency,
    effectPackets: [nextPacket],
    intentions: [nextPacket],
  };
}

const normalPowers = Array.from({ length: 20 }, (_, index) => validPower(index));
const normal = summarizeCharacterPowerValidation({
  level: 1,
  powers: normalPowers,
  tuningSnapshot: activeTuning,
});
check(normal.overspent, "Twenty otherwise-valid Powers overspend the normal pool fixture.");
equal(normal.saveBlockingErrors.length, 0, "Normal pool overspend does not block durable draft save.");
equal(normal.readinessErrors.length, 1, "Normal pool overspend remains a readiness failure.");
check(normal.readinessErrors[0]?.includes("Total Power Point spend"), "Normal readiness message remains visible.");
check(normal.allErrors.includes(normal.readinessErrors[0]!), "Complete validation still contains normal overspend.");
equal(validateCharacterPowersForDraftSave({
  level: 1,
  powers: normalPowers,
  tuningSnapshot: activeTuning,
}).length, 0, "Draft-save helper accepts valid normal overspend.");
check(validateCharacterPowers({
  level: 1,
  powers: normalPowers,
  tuningSnapshot: activeTuning,
}).some((error) => error.includes("Total Power Point spend")), "Legacy full validator remains readiness-compatible.");

const signaturePower = validPower(0, true);
const signature = summarizeCharacterPowerValidation({
  level: 1,
  powers: [signaturePower],
  tuningSnapshot: activeTuning,
  powerPool: signatureMovePointPool(1),
  powerPoolKind: "signature",
  powerLabel: "Signature Move",
  poolDescription: "Character Level x 20",
  offencePressureMode: "reviewOnly",
});
check(signature.overspent, "High-magnitude Signature Move overspends its separate pool.");
equal(signature.saveBlockingErrors.length, 0, "Signature overspend does not block durable draft save.");
check(signature.readinessErrors[0]?.includes("Signature Move"), "Signature readiness message names its separate pool.");
const gross = buildCharacterGrossBudgetReadiness({
  normal: normal.summary,
  signature: signature.summary,
});
equal(gross.normalPowerPoolOverspent, true, "Gross summary exposes normal overspend.");
equal(gross.signatureMovePoolOverspent, true, "Gross summary exposes Signature overspend.");
equal(gross.normalPowerTotalSpent, normal.summary.totalSpent, "Gross summary exposes authoritative normal spend.");
equal(gross.signatureMoveTotalSpent, signature.summary.totalSpent, "Gross summary exposes authoritative Signature spend.");
equal(gross.grossBudgetReady, false, "Either overspent pool makes gross budget not table-ready.");

const invalidPacketPower = validPower(0);
invalidPacketPower.effectPackets[0].detailsJson = {
  ...(invalidPacketPower.effectPackets[0].detailsJson ?? {}),
  damageTypes: [],
};
invalidPacketPower.intentions = invalidPacketPower.effectPackets;
const invalidPacket = summarizeCharacterPowerValidation({
  level: 1,
  powers: [invalidPacketPower],
  tuningSnapshot: activeTuning,
});
check(invalidPacket.saveBlockingErrors.some((error) => error.includes("requires at least one damage type")), "Illegal packet structure still blocks save.");

const missingTuning = summarizeCharacterPowerValidation({
  level: 1,
  powers: [validPower(0)],
  tuningSnapshot: null,
});
check(missingTuning.saveBlockingErrors.some((error) => error.includes("Active power tuning is required")), "Missing active tuning still blocks save.");

const restrictedPower = validPower(0);
const restrictionSource = {
  ...defaultBuilderData(),
  powers: [restrictedPower],
};
const incompleteRestriction = materializePlayerPowerRestrictionDrafts(
  restrictionSource,
  {
    [restrictedPower.id!]: selectRestrictionAuthoringChoice(
      { kind: "NONE" },
      "STANDARD_STRUCTURED",
    ),
  },
);
equal(incompleteRestriction.ok, false, "Invalid Restriction materialization still blocks save.");

const synchronized = synchronizeCharacterPowerCooldownCaches({
  level: 1,
  powers: [validPower(0)],
  signatureMove: signaturePower,
  tuningSnapshot: activeTuning,
});
check(synchronized.ok, "Cooldown cache synchronization still succeeds for draft-save-valid content.");
if (synchronized.ok) {
  check(Number.isInteger(synchronized.powers[0]?.cooldownTurns), "Normal cooldown cache remains synchronized.");
  check(Number.isInteger(synchronized.signatureMove?.cooldownTurns), "Signature cooldown cache remains synchronized.");
}

const route = readFileSync(
  "app/api/campaigns/[id]/characters/[characterId]/builder/route.ts",
  "utf8",
);
check(route.includes("normalPowerValidation.saveBlockingErrors"), "PATCH uses normal draft-save validation.");
check(route.includes("signatureMoveValidation.saveBlockingErrors"), "PATCH uses Signature draft-save validation.");
check(route.includes("grossBudgetReadiness"), "PATCH returns derived gross budget readiness.");
check(route.includes("synchronizeCharacterPowerCooldownCaches"), "PATCH retains cooldown cache synchronization.");
check(route.includes("validateRawPlayerPowerRestrictionWrite"), "PATCH retains the raw Player Restriction guard.");
check(route.includes("validateRawRoleplayAbilityRestrictionWrite"), "PATCH retains the raw Roleplay Restriction guard.");
check(route.indexOf("validateRawPlayerPowerRestrictionWrite") < route.indexOf("normalizeBuilderData(body.builderData)"), "Raw Restriction validation remains before normalization.");
check(!route.includes("playerRestrictionGovernance.create"), "PATCH creates no governance row.");
check(!route.includes("approvalCurrent"), "PATCH does not mark lifecycle stale or manufacture approval.");

console.log(`Character Builder draft readiness smoke passed (${checks} checks).`);
