import {
  CHARACTER_BUILDER_V1_POWER_INTENTIONS,
  POWER_AUTHORING_MAX_PACKET_DURATION_TURNS,
  POWER_RANGE_AOE_CENTER_RANGE_OPTIONS,
  POWER_RANGE_AOE_CONE_LENGTH_OPTIONS,
  POWER_RANGE_AOE_LINE_LENGTH_OPTIONS,
  POWER_RANGE_AOE_LINE_WIDTH_OPTIONS,
  POWER_RANGE_AOE_SHAPES,
  POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS,
  POWER_RANGE_RANGED_DISTANCE_OPTIONS,
  POWER_RANGE_TARGET_OPTIONS,
  POWER_RESERVE_RELEASE_BEHAVIOUR_OPTIONS,
  getPowerAllowedCommitmentOptions,
  getPowerAllowedCounterOptions,
  getPowerAllowedRangeCategories,
  getPowerAllowedTimingOptions,
  getPowerAllowedTriggerConditionOptions,
  isPowerAttachedHostileEntryReady,
  isPowerPacketTimingAuthorable,
  isPowerReserveReleaseBehaviourReady,
  isPowerSecondaryDiceAuthored,
} from "../lib/powers/authoringRules";
import type { Power } from "../lib/summoning/types";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function powerFixture(overrides: Partial<Power> = {}): Pick<
  Power,
  "descriptorChassis" | "commitmentModifier" | "primaryDefenceGate" | "descriptorChassisConfig" | "effectPackets"
> {
  return {
    descriptorChassis: overrides.descriptorChassis ?? "IMMEDIATE",
    commitmentModifier: overrides.commitmentModifier ?? "STANDARD",
    primaryDefenceGate: overrides.primaryDefenceGate ?? null,
    descriptorChassisConfig: overrides.descriptorChassisConfig ?? {},
    effectPackets: overrides.effectPackets ?? [
      {
        sortOrder: 0,
        packetIndex: 0,
        intention: "ATTACK",
        type: "ATTACK",
        effectTimingType: "ON_CAST",
        effectTimingTurns: null,
        effectDurationType: "INSTANT",
        effectDurationTurns: null,
        detailsJson: {},
      },
    ],
  };
}

assert(
  !CHARACTER_BUILDER_V1_POWER_INTENTIONS.includes("SUPPORT"),
  "Character Builder V1 intention allowlist should exclude SUPPORT.",
);
assert(
  getPowerAllowedCommitmentOptions("TRIGGER").join(",") === "STANDARD,CHARGE",
  "Trigger should not allow Channel commitment.",
);
assert(
  getPowerAllowedCommitmentOptions("RESERVE").join(",") === "STANDARD,CHARGE",
  "Reserve should not allow Channel commitment.",
);
assert(
  getPowerAllowedCounterOptions({ descriptorChassis: "TRIGGER" }).join(",") === "NO",
  "Trigger should not allow Counter Yes.",
);
assert(
  getPowerAllowedCounterOptions({
    descriptorChassis: "IMMEDIATE",
    commitmentModifier: "CHARGE",
    chargeType: "DELAYED_RELEASE",
  }).join(",") === "NO",
  "Delayed-release Charge should not allow Counter Yes.",
);
assert(
  getPowerAllowedRangeCategories({ descriptorChassis: "FIELD" }).join(",") === "AOE",
  "Field should lock range to AoE.",
);
assert(
  getPowerAllowedRangeCategories({
    descriptorChassis: "ATTACHED",
    attachedHostAnchorType: "SELF",
  }).join(",") === "SELF",
  "Attached Self host should only allow Self range.",
);
assert(
  !getPowerAllowedRangeCategories({
    descriptorChassis: "ATTACHED",
    attachedHostAnchorType: "TARGET",
  }).includes("SELF"),
  "Attached Target host should exclude Self range.",
);
assert(
  getPowerAllowedRangeCategories({
    descriptorChassis: "ATTACHED",
    attachedHostAnchorType: "AREA",
  }).join(",") === "AOE",
  "Attached Area host should only allow AoE range.",
);
assert(
  getPowerAllowedTimingOptions(powerFixture({ descriptorChassis: "TRIGGER" }), 0).join(",") ===
    "ON_TRIGGER",
  "Trigger Packet 1 should only allow On Trigger timing.",
);
assert(
  getPowerAllowedTimingOptions(
    powerFixture({
      descriptorChassis: "ATTACHED",
      primaryDefenceGate: {
        sourcePacketIndex: 0,
        gateResult: "NONE",
        protectionChannel: null,
        resistAttribute: null,
        hostileEntryPattern: "ON_ATTACH",
        resolutionSource: "EXPLICIT",
      },
    }),
    0,
  ).join(",") === "ON_ATTACH",
  "Attached On Attach hostile entry should only allow On Attach for Packet 1.",
);
assert(
  POWER_AUTHORING_MAX_PACKET_DURATION_TURNS === 4,
  "Packet duration turns should cap at 4.",
);
assert(
  POWER_RANGE_TARGET_OPTIONS.join(",") === "1,2,3,4,5" &&
    POWER_RANGE_RANGED_DISTANCE_OPTIONS.join(",") === "30,60,120,200" &&
    POWER_RANGE_AOE_CENTER_RANGE_OPTIONS.join(",") === "0,30,60,120,200" &&
    POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS.join(",") === "10,20,30" &&
    POWER_RANGE_AOE_CONE_LENGTH_OPTIONS.join(",") === "15,30,60" &&
    POWER_RANGE_AOE_LINE_WIDTH_OPTIONS.join(",") === "5,10,15,20" &&
    POWER_RANGE_AOE_LINE_LENGTH_OPTIONS.join(",") === "30,60,90,120" &&
    POWER_RANGE_AOE_SHAPES.join(",") === "SPHERE,CONE,LINE",
  "Shared range option constants should match Summoning Circle option hydration.",
);
assert(
  POWER_RESERVE_RELEASE_BEHAVIOUR_OPTIONS.join(",") ===
    "ACTION_OR_RESPONSE,ACTION_ONLY,RESPONSE_ONLY,ON_EXPIRY",
  "Reserve release behaviour options should match Summoning Circle option hydration.",
);
assert(
  !isPowerSecondaryDiceAuthored(1),
  "Secondary packet dice should not be independently authored.",
);
assert(
  !getPowerAllowedTriggerConditionOptions({
    triggerMethod: "ARM_AND_THEN_TARGET",
    rangeCategory: "MELEE",
  }).includes("AREA_ENTERS"),
  "Arm-and-then-target should filter area trigger options without AoE.",
);
assert(
  !getPowerAllowedTriggerConditionOptions({
    triggerMethod: "TARGET_AND_THEN_ARM",
    rangeCategory: "MELEE",
  }).includes("AREA_ENTERS"),
  "Target-and-then-arm should filter area trigger options without AoE.",
);
assert(
  getPowerAllowedTriggerConditionOptions({
    triggerMethod: "ARM_AND_THEN_TARGET",
    rangeCategory: "AOE",
  }).includes("AREA_ENTERS") &&
    getPowerAllowedTriggerConditionOptions({
      triggerMethod: "ARM_AND_THEN_TARGET",
      rangeCategory: "AOE",
    }).includes("AREA_STARTS_TURN"),
  "Area trigger options should be available with AoE range.",
);
assert(
  !isPowerReserveReleaseBehaviourReady(powerFixture({ descriptorChassis: "RESERVE" })),
  "Reserve should be incomplete until release behaviour is authored.",
);
assert(
  isPowerReserveReleaseBehaviourReady(
    powerFixture({
      descriptorChassis: "RESERVE",
      descriptorChassisConfig: { releaseBehaviour: "ACTION_ONLY" },
    }),
  ),
  "Reserve should be ready after release behaviour is authored.",
);
assert(
  !isPowerAttachedHostileEntryReady(powerFixture({ descriptorChassis: "ATTACHED" })),
  "Hostile Attached powers should be incomplete until hostile entry is authored.",
);
assert(
  !isPowerPacketTimingAuthorable(powerFixture({ descriptorChassis: "ATTACHED" }), 0),
  "Hostile Attached Packet 1 timing should not be authorable until hostile entry is authored.",
);
assert(
  isPowerAttachedHostileEntryReady(
    powerFixture({
      descriptorChassis: "ATTACHED",
      descriptorChassisConfig: { hostileEntryPattern: "ON_ATTACH" },
    }),
  ),
  "Hostile Attached powers should be ready after hostile entry is authored.",
);
assert(
  isPowerPacketTimingAuthorable(
    powerFixture({
      descriptorChassis: "ATTACHED",
      descriptorChassisConfig: { hostileEntryPattern: "ON_ATTACH" },
    }),
    0,
  ),
  "Hostile Attached Packet 1 timing should be authorable after hostile entry is authored.",
);

console.log("powerAuthoringRules.smoke passed");
