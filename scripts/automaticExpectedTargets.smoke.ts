import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  normalizeCharacterPower,
} from "../lib/characterBuilder/powers";
import {
  toEditable,
  toPayload,
} from "../app/summoning-circle/components/SummoningCircleEditor";
import {
  applyAutomaticExpectedTargetsToPower,
  calculateExpectedTargetsForEffectiveAreaCapacity,
  estimatePowerPacketExpectedTargets,
  getNaturalAoeOneAreaCapacity,
} from "../lib/powers/expectedTargetEstimation";
import type { EffectPacket, Power } from "../lib/summoning/types";
import { normalizeMonsterUpsertInput } from "../lib/summoning/validation";

let checks = 0;
function equal<T>(actual: T, expected: T, message: string) {
  assert.equal(actual, expected, message);
  checks += 1;
}
function ok(value: unknown, message: string) {
  assert.ok(value, message);
  checks += 1;
}

for (const [radius, capacity] of [[10, 3], [20, 6], [30, 9]] as const) {
  equal(getNaturalAoeOneAreaCapacity({ shape: "SPHERE", sphereRadiusFeet: radius }), capacity, `Sphere ${radius} ft uses capacity ${capacity}.`);
}
for (const [length, capacity] of [[15, 3], [30, 8], [60, 14]] as const) {
  equal(getNaturalAoeOneAreaCapacity({ shape: "CONE", coneLengthFeet: length }), capacity, `Cone ${length} ft uses capacity ${capacity}.`);
}
const lineBands = {
  5: { 30: 3, 60: 6, 90: 9, 120: 12 },
  10: { 30: 4, 60: 8, 90: 12, 120: 16 },
  15: { 30: 5, 60: 10, 90: 15, 120: 20 },
  20: { 30: 6, 60: 12, 90: 18, 120: 24 },
} as const;
for (const [width, lengths] of Object.entries(lineBands)) {
  for (const [length, capacity] of Object.entries(lengths)) {
    equal(
      getNaturalAoeOneAreaCapacity({ shape: "LINE", lineWidthFeet: Number(width), lineLengthFeet: Number(length) }),
      capacity,
      `Line ${width} x ${length} ft uses capacity ${capacity}.`,
    );
  }
}

for (const [capacity, expected] of [[1, 1], [2, 2], [3, 2], [4, 3], [6, 3], [9, 3]] as const) {
  equal(calculateExpectedTargetsForEffectiveAreaCapacity({ effectiveAreaCapacity: capacity }).expectedTargets, expected, `Beneficial capacity ${capacity} estimates ${expected}.`);
}
equal(calculateExpectedTargetsForEffectiveAreaCapacity({ effectiveAreaCapacity: 9, teamContext: { source: "ACTUAL_TEAM_CONTEXT", totalTeamSize: 3 } }).expectedTargets, 2, "Actual team size 3 estimates 2.");
equal(calculateExpectedTargetsForEffectiveAreaCapacity({ effectiveAreaCapacity: 9, teamContext: { source: "FALLBACK_STANDARD_TEAM_SIZE_4", totalTeamSize: 99 } }).expectedTargets, 3, "Fallback context uses standard team size 4.");
equal(calculateExpectedTargetsForEffectiveAreaCapacity({ effectiveAreaCapacity: 9, recipient: "SELF" }).expectedTargets, 1, "Self-only estimates 1.");
equal(calculateExpectedTargetsForEffectiveAreaCapacity({ effectiveAreaCapacity: 9, recipient: "ALLIES", teamContext: { source: "ACTUAL_TEAM_CONTEXT", totalTeamSize: 4 } }).eligibleTeamSize, 3, "Allies excludes the caster.");

for (const [capacity, expected] of [[1, 1], [3, 2], [4, 2], [6, 3], [8, 4], [9, 4], [14, 6], [50, 6]] as const) {
  equal(calculateExpectedTargetsForEffectiveAreaCapacity({ effectiveAreaCapacity: capacity, hostility: "HOSTILE" }).expectedTargets, expected, `Hostile capacity ${capacity} estimates ${expected}.`);
}

function semanticAoe(params: { hostility?: "HOSTILE" | "NON_HOSTILE"; recipient?: EffectPacket["applyTo"]; radius?: number; count?: number; submitted?: number | null }): Power {
  const packet: EffectPacket = {
    ...createDefaultCharacterPowerPacket(params.hostility === "HOSTILE" ? "DEBUFF" : "AUGMENT", 0),
    modifier: 2,
    hostility: params.hostility ?? "NON_HOSTILE",
    applyTo: params.recipient ?? "PRIMARY_TARGET",
    detailsJson: {
      statTarget: "Guard",
      rangeCategory: "AOE",
      rangeValue: 0,
      rangeExtra: {
        shape: "SPHERE",
        sphereRadiusFeet: params.radius ?? 20,
        count: params.count ?? 1,
      },
      ...(params.submitted == null ? {} : { expectedTargetCount: params.submitted }),
    },
  };
  return {
    ...createDefaultCharacterPower(0),
    name: "Automatic Area",
    rangeCategories: ["AOE"],
    aoeShape: "SPHERE",
    aoeSphereRadiusFeet: params.radius ?? 20,
    aoeCount: params.count ?? 1,
    effectPackets: [packet],
    intentions: [packet],
  };
}

const fallbackTeam = { source: "FALLBACK_STANDARD_TEAM_SIZE_4" as const, totalTeamSize: 4 };
const low = applyAutomaticExpectedTargetsToPower(semanticAoe({ submitted: 1 }), fallbackTeam);
const high = applyAutomaticExpectedTargetsToPower(semanticAoe({ submitted: 999 }), fallbackTeam);
const omitted = applyAutomaticExpectedTargetsToPower(semanticAoe({ submitted: null }), fallbackTeam);
for (const power of [low, high, omitted]) {
  equal(power.effectPackets[0]?.detailsJson?.expectedTargetCount, 3, "Server-style normalization ignores submitted beneficial breadth and derives 3.");
}
const hostile = applyAutomaticExpectedTargetsToPower(semanticAoe({ hostility: "HOSTILE", radius: 30, submitted: 1 }), fallbackTeam);
equal(hostile.effectPackets[0]?.detailsJson?.expectedTargetCount, 4, "Hostile tamper value is overwritten with 4.");
const changedGeometry = applyAutomaticExpectedTargetsToPower(semanticAoe({ hostility: "HOSTILE", radius: 10 }), fallbackTeam);
equal(changedGeometry.effectPackets[0]?.detailsJson?.expectedTargetCount, 2, "Geometry changes the derived result.");
const multipleAreas = estimatePowerPacketExpectedTargets({ power: semanticAoe({ hostility: "HOSTILE", radius: 10, count: 2 }), packet: semanticAoe({ hostility: "HOSTILE", radius: 10, count: 2 }).effectPackets[0]!, teamContext: fallbackTeam });
equal(multipleAreas.effectiveAreaCapacity, 6, "Area Count multiplies one-area capacity exactly once.");
equal(multipleAreas.expectedTargets, 3, "The occupancy formula is applied after Area Count.");
const recipientChanged = applyAutomaticExpectedTargetsToPower(semanticAoe({ recipient: "SELF" }), fallbackTeam);
equal(recipientChanged.effectPackets[0]?.detailsJson?.expectedTargetCount, 1, "Recipient eligibility changes beneficial breadth.");

const characterServerNormalized = normalizeCharacterPower(
  semanticAoe({ submitted: 1 }),
  0,
  { source: "ACTUAL_TEAM_CONTEXT", totalTeamSize: 4 },
);
equal(characterServerNormalized.effectPackets[0]?.detailsJson?.expectedTargetCount, 3, "Character server normalization overwrites a malicious low value.");
for (const submitted of [1, 999, null]) {
  const summoningPayload = toPayload(toEditable({
    id: `automatic-targets-${String(submitted)}`,
    name: "Automatic Targets",
    level: 3,
    tier: "SOLDIER",
    powers: [semanticAoe({ submitted })],
  }));
  const summoningServerNormalized = normalizeMonsterUpsertInput(summoningPayload);
  ok(summoningServerNormalized.ok, `Summoning server normalization accepts the semantic AoE fixture${summoningServerNormalized.ok ? "." : `: ${summoningServerNormalized.error}`}`);
  if (summoningServerNormalized.ok) {
    equal(summoningServerNormalized.data.powers[0]?.effectPackets[0]?.detailsJson?.expectedTargetCount, 3, "Summoning server normalization ignores low, high, and omitted client values.");
  }
}

const legacy = semanticAoe({ submitted: 1 });
legacy.effectPackets[0]!.modifier = null;
legacy.intentions = legacy.effectPackets;
const legacyBefore = JSON.stringify(legacy);
equal(JSON.stringify(applyAutomaticExpectedTargetsToPower(legacy, fallbackTeam)), legacyBefore, "Legacy Modifier-null packets remain byte-for-byte unchanged.");
const nonAoe = semanticAoe({ submitted: 2 });
nonAoe.rangeCategories = ["RANGED"];
nonAoe.aoeShape = null;
nonAoe.effectPackets[0]!.detailsJson = {
  ...nonAoe.effectPackets[0]!.detailsJson,
  rangeCategory: "RANGED",
  rangeExtra: {},
};
equal(estimatePowerPacketExpectedTargets({ power: nonAoe, packet: nonAoe.effectPackets[0]!, teamContext: fallbackTeam }).calculationMode, "NON_AOE_AUTHORED_TARGETS", "Non-AoE preserves authored target behavior.");
const unsupported = semanticAoe({ radius: 25 });
const unsupportedResult = estimatePowerPacketExpectedTargets({ power: unsupported, packet: unsupported.effectPackets[0]!, teamContext: fallbackTeam });
equal(unsupportedResult.calculationMode, "UNSUPPORTED_GEOMETRY", "Unsupported geometry fails diagnostically.");
ok(Boolean(unsupportedResult.unsupportedReason), "Unsupported geometry includes a reason.");

for (const path of [
  "app/campaign/[id]/characters/[characterId]/builder/page.tsx",
  "app/summoning-circle/components/SummoningCircleEditor.tsx",
]) {
  const source = readFileSync(path, "utf8");
  ok(source.includes("Estimated Targets:"), `${path} contains the read-only display.`);
  ok(!/Expected Targets<\/span>[\s\S]{0,200}<select/.test(source), `${path} contains no editable Expected Targets select.`);
  ok(!source.includes("expectedTargetCount: event.target.value") && !source.includes("expectedTargetCount: e.target.value"), `${path} contains no Expected Targets form-state authority.`);
}
for (const path of [
  "app/api/campaigns/[id]/characters/[characterId]/builder/route.ts",
  "app/api/summoning-circle/monsters/route.ts",
  "app/api/summoning-circle/monsters/[id]/route.ts",
  "app/api/summoning-circle/monsters/[id]/copy/route.ts",
]) {
  ok(readFileSync(path, "utf8").includes("applyAutomaticExpectedTargets"), `${path} independently recomputes Expected Targets.`);
}

console.log(`automaticExpectedTargets.smoke: PASS (${checks} checks)`);
