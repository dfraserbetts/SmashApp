import {
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  CHARACTER_POWER_INTENTION_OPTIONS,
  CHARACTER_POWER_MAX_DICE_COUNT,
  CHARACTER_POWER_MAX_PACKET_DURATION_TURNS,
  CHARACTER_POWER_MAX_POTENCY,
  CHARACTER_POWER_RANGE_RANGED_DISTANCE_OPTIONS,
  CHARACTER_POWER_RANGE_TARGET_OPTIONS,
  CHARACTER_POWER_RESERVE_RELEASE_BEHAVIOUR_OPTIONS,
  getCharacterPowerAllowedCommitmentOptions,
  getCharacterPowerAllowedApplyToOptions,
  getCharacterPowerAllowedTimingOptions,
  getCharacterPowerPrimaryDefenceLabel,
  deriveCharacterPowerBudgetCooldownPressure,
  normalizeCharacterPower,
  prepareCharacterPowerIdsForPersistence,
  powerPointPool,
  signatureMovePointPool,
  synchronizeCharacterPowerCooldownCaches,
  summarizeCharacterPowers as summarizeCharacterPowersRaw,
  validateCharacterPowers as validateCharacterPowersRaw,
  type CharacterPower,
} from "../lib/characterBuilder/powers";
import {
  getCharacterBuilderThreeFieldAugmentDebuffPublicWriteError,
  THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR,
} from "../lib/powers/authoringRules";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import { DEFAULT_CHARACTER_POWER_SPEND_SCALAR } from "../lib/config/characterBuilderTuningShared";
import {
  DEFAULT_POWER_TUNING_VALUES,
  normalizePowerTuningValues,
  type PowerTuningSnapshot,
} from "../lib/config/powerTuningShared";
import { normalizeBuilderData } from "../lib/characterBuilder/core";
import {
  CHARACTER_BUILDER_V1_POWER_INTENTIONS,
  POWER_AUTHORING_MAX_PACKET_DURATION_TURNS,
  getPowerAllowedCommitmentOptions,
  getPowerAllowedCounterOptions,
  getPowerAllowedRangeCategories,
  getPowerAllowedTimingOptions,
  isPowerPacketTimingAuthorable,
  isPowerSecondaryDiceAuthored,
} from "../lib/powers/authoringRules";
import type { Power } from "../lib/summoning/types";

const summarizeCharacterPowers = (
  params: Parameters<typeof summarizeCharacterPowersRaw>[0],
) =>
  summarizeCharacterPowersRaw({
    ...params,
    cooldownAuthorityMode:
      params.cooldownAuthorityMode ??
      (params.tuningSnapshot
        ? "ACTIVE_CURRENT_BALANCE"
        : "EXPLICIT_BUILTIN_PREVIEW"),
  });

const validateCharacterPowers = (
  params: Parameters<typeof validateCharacterPowersRaw>[0],
) =>
  validateCharacterPowersRaw({
    ...params,
    cooldownAuthorityMode:
      params.cooldownAuthorityMode ??
      (params.tuningSnapshot
        ? "ACTIVE_CURRENT_BALANCE"
        : "EXPLICIT_BUILTIN_PREVIEW"),
  });

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const cacheSynchronizationTuning: PowerTuningSnapshot = {
  setId: "character-power-cache-sync-smoke-active",
  name: "Character Power Cache Synchronization Smoke Active",
  slug: "character-power-cache-sync-smoke-active",
  status: "ACTIVE",
  updatedAt: "2026-07-13T00:00:00.000Z",
  values: {
    ...DEFAULT_POWER_TUNING_VALUES,
    "cooldown.load.lightMax": 0,
    "cooldown.load.moderateMax": 999,
    "cooldown.load.heavyMax": 1000,
  },
};

function characterPowerWithoutCache(power: CharacterPower) {
  return Object.fromEntries(
    Object.entries(power).filter(
      ([key]) => !["cooldownTurns", "cooldownReduction", "cooldownAuthority"].includes(key),
    ),
  );
}

const levelOnePower = {
  ...createDefaultCharacterPower(0),
  name: "Practice Strike",
  effectPackets: [
    {
      ...createDefaultCharacterPowerPacket("ATTACK", 0),
      detailsJson: {
        attackMode: "PHYSICAL",
        damageTypes: ["Slash"],
        rangeCategory: "MELEE",
        rangeValue: 1,
        rangeExtra: {},
      },
    },
  ],
};
levelOnePower.intentions = levelOnePower.effectPackets;
const levelOneSummary = summarizeCharacterPowers({
  level: 1,
  powers: [levelOnePower],
});

assert(
  levelOneSummary.powers[0]?.cooldownAuthority.ok === true &&
    levelOneSummary.powers[0].cooldownAuthority.result.source === "BUILTIN_DEFAULTS",
  "Snapshot-less Character Builder smoke fixtures must explicitly expose built-in preview provenance.",
);
const missingGameplayTuning = summarizeCharacterPowersRaw({
  level: 1,
  powers: [levelOnePower],
  cooldownAuthorityMode: "ACTIVE_CURRENT_BALANCE",
});
assert(
  missingGameplayTuning.powers[0]?.cooldownAuthority.ok === false &&
    missingGameplayTuning.powers[0].cooldownAuthority.errorCode === "ACTIVE_TUNING_REQUIRED",
  "Current-balance Character Builder calculation must fail explicitly without active tuning.",
);

const normalizedCachedPower = normalizeCharacterPower(
  { ...levelOnePower, cooldownTurns: 4, cooldownReduction: 1 },
  0,
);
assert(
  normalizedCachedPower.cooldownTurns === 4 && normalizedCachedPower.cooldownReduction === 1,
  "Character power normalization must preserve valid cooldown cache values.",
);
const normalCacheSync = synchronizeCharacterPowerCooldownCaches({
  level: 1,
  powers: [normalizedCachedPower],
  signatureMove: null,
  tuningSnapshot: cacheSynchronizationTuning,
});
assert(normalCacheSync.ok, "Normal character power cache synchronization should resolve.");
assert(normalCacheSync.ok && normalCacheSync.powers[0]?.cooldownTurns === 2, "Normal powers should persist their authoritative cooldown cache.");
assert(normalCacheSync.ok && normalCacheSync.powers[0]?.cooldownReduction === 0, "Normal synchronized cache reduction should be zero.");
assert(
  normalCacheSync.ok &&
    JSON.stringify(characterPowerWithoutCache(normalCacheSync.powers[0])) ===
      JSON.stringify(characterPowerWithoutCache(normalizedCachedPower)),
  "Normal cache synchronization must preserve semantic power fields.",
);
const missingSyncTuning = synchronizeCharacterPowerCooldownCaches({
  level: 1,
  powers: [normalizedCachedPower],
  signatureMove: null,
  tuningSnapshot: null,
});
assert(
  !missingSyncTuning.ok && missingSyncTuning.errorCode === "ACTIVE_TUNING_REQUIRED",
  "Production character cache synchronization must fail explicitly without active tuning.",
);
const builderDataBeforeSync = normalizeBuilderData({
  narrativeNotes: "Preserve this builder note.",
  powers: [normalizedCachedPower],
  signatureMove: null,
});
assert(normalCacheSync.ok, "BuilderData preservation fixture requires synchronized powers.");
if (normalCacheSync.ok) {
  const builderDataAfterSync = {
    ...builderDataBeforeSync,
    powers: normalCacheSync.powers,
    signatureMove: normalCacheSync.signatureMove,
  };
  const beforeUnrelated = { ...builderDataBeforeSync, powers: [], signatureMove: null };
  const afterUnrelated = { ...builderDataAfterSync, powers: [], signatureMove: null };
  assert(
    JSON.stringify(afterUnrelated) === JSON.stringify(beforeUnrelated),
    "Reconstructing synchronized builderData must preserve every unrelated field.",
  );
}

assert(powerPointPool(1) === 50, "Level 1 PowerPool should equal 50.");
assert(
  levelOneSummary.playerPowerSpendScalar === DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  "Default player power spend scalar should be 3.",
);
assert(levelOneSummary.totalSpent > 0, "Power spend should be positive.");
assert(levelOneSummary.remaining === 50 - levelOneSummary.totalSpent, "Spend should deduct from pool.");

const staleTopLevelMeleeTwoPower = {
  ...createDefaultCharacterPower(0),
  name: "Melee Two Secondary Apply To",
  rangeCategories: ["MELEE" as const],
  meleeTargets: 1,
  effectPackets: [
    {
      ...createDefaultCharacterPowerPacket("ATTACK", 0),
      detailsJson: {
        attackMode: "PHYSICAL",
        damageTypes: ["Slash"],
        rangeCategory: "MELEE",
        rangeValue: 2,
        rangeExtra: {},
      },
    },
    {
      ...createDefaultCharacterPowerPacket("CLEANSE", 1),
      detailsJson: {
        cleanseEffectType: "Active Power",
      },
    },
  ],
};
staleTopLevelMeleeTwoPower.intentions = staleTopLevelMeleeTwoPower.effectPackets;
const meleeTwoApplyToOptions = getCharacterPowerAllowedApplyToOptions(
  staleTopLevelMeleeTwoPower,
  staleTopLevelMeleeTwoPower.effectPackets[1],
);
assert(
  meleeTwoApplyToOptions.includes("ALLIES"),
  "Character Builder Apply To should include Allies when Packet 1 is Melee 2 even if stale top-level meleeTargets is 1.",
);

const meleeOnePower = {
  ...staleTopLevelMeleeTwoPower,
  effectPackets: [
    {
      ...staleTopLevelMeleeTwoPower.effectPackets[0],
      detailsJson: {
        ...(staleTopLevelMeleeTwoPower.effectPackets[0].detailsJson ?? {}),
        rangeValue: 1,
      },
    },
    staleTopLevelMeleeTwoPower.effectPackets[1],
  ],
};
meleeOnePower.intentions = meleeOnePower.effectPackets;
const meleeOneApplyToOptions = getCharacterPowerAllowedApplyToOptions(
  meleeOnePower,
  meleeOnePower.effectPackets[1],
);
assert(
  !meleeOneApplyToOptions.includes("ALLIES"),
  "Character Builder Apply To should not include Allies for single-target Melee without local targeting override.",
);

const dependencyModePower = normalizeCharacterPower({
  ...levelOnePower,
  name: "Dependency Mode Probe",
  effectPackets: [
    levelOnePower.effectPackets[0],
    {
      ...createDefaultCharacterPowerPacket("HEALING", 1),
      secondaryDependencyMode: "INDEPENDENT",
    },
  ],
}, 0);
assert(
  dependencyModePower.effectPackets[1]?.secondaryDependencyMode === "INDEPENDENT",
  "Character Builder should preserve explicit secondaryDependencyMode on packet 2+.",
);

const legacyDependencyModePower = normalizeCharacterPower({
  ...levelOnePower,
  name: "Legacy Dependency Mode Probe",
  effectPackets: [
    levelOnePower.effectPackets[0],
    {
      ...createDefaultCharacterPowerPacket("HEALING", 1),
      secondaryDependencyMode: undefined,
    },
  ],
}, 0);
assert(
  legacyDependencyModePower.effectPackets[0]?.secondaryDependencyMode == null &&
    legacyDependencyModePower.effectPackets[1]?.secondaryDependencyMode === "LINKED_TO_PRIMARY",
  "Legacy packet 2+ powers should default secondaryDependencyMode to LINKED_TO_PRIMARY while Packet 1 remains unset.",
);

assert(
  levelOneSummary.powers[0]?.derivedCooldownTurns,
  "Derived cooldown should be present.",
);
assert(
  (levelOneSummary.powers[0]?.descriptorLines.length ?? 0) > 0,
  "Descriptor should render.",
);
assert(
  levelOneSummary.powers[0]?.descriptorLines.some((line) => /slash/i.test(line)),
  "Attack descriptor should include selected damage type.",
);
assert(
  getCharacterPowerPrimaryDefenceLabel(levelOnePower).includes("Dodge") ||
    getCharacterPowerPrimaryDefenceLabel(levelOnePower).includes("Defence"),
  "Primary defence gate should be derived from Packet 1.",
);
assert(
  !getCharacterPowerAllowedTimingOptions(levelOnePower, 0).includes("ON_TRIGGER"),
  "Immediate standard Packet 1 should not allow On Trigger.",
);
assert(
  POWER_AUTHORING_MAX_PACKET_DURATION_TURNS === CHARACTER_POWER_MAX_PACKET_DURATION_TURNS,
  "Character Builder should consume the shared packet duration turn cap.",
);
assert(
  !isPowerSecondaryDiceAuthored(1),
  "Shared authoring rules should prohibit secondary packet dice authoring.",
);
assert(
  !CHARACTER_BUILDER_V1_POWER_INTENTIONS.includes("SUPPORT"),
  "Shared Character Builder V1 intention allowlist should exclude SUPPORT.",
);
assert(
  getPowerAllowedRangeCategories({ descriptorChassis: "FIELD" }).join(",") === "AOE",
  "Shared authoring rules should lock Field powers to AoE range.",
);
assert(
  !getPowerAllowedCommitmentOptions("TRIGGER").includes("CHANNEL") &&
    !getPowerAllowedCommitmentOptions("RESERVE").includes("CHANNEL"),
  "Shared authoring rules should reject Channel for Trigger and Reserve powers.",
);
assert(
  !getPowerAllowedCounterOptions({ descriptorChassis: "TRIGGER" }).includes("YES"),
  "Shared authoring rules should reject Counter for Trigger powers.",
);
assert(
  !getPowerAllowedCounterOptions({
    descriptorChassis: "IMMEDIATE",
    commitmentModifier: "CHARGE",
    chargeType: "DELAYED_RELEASE",
  }).includes("YES"),
  "Shared authoring rules should reject Counter for delayed-release Charge powers.",
);
assert(
  getPowerAllowedRangeCategories({
    descriptorChassis: "ATTACHED",
    attachedHostAnchorType: "SELF",
  }).join(",") === "SELF",
  "Shared authoring rules should allow only Self range for Attached Self host.",
);
assert(
  !getPowerAllowedRangeCategories({
    descriptorChassis: "ATTACHED",
    attachedHostAnchorType: "TARGET",
  }).includes("SELF"),
  "Shared authoring rules should reject Self range for Attached Target host.",
);
assert(
  getPowerAllowedRangeCategories({
    descriptorChassis: "ATTACHED",
    attachedHostAnchorType: "AREA",
  }).join(",") === "AOE",
  "Shared authoring rules should allow only AoE range for Attached Area host.",
);

const illegalTimingPower = {
  ...levelOnePower,
  effectPackets: [
    {
      ...levelOnePower.effectPackets[0],
      effectTimingType: "ON_TRIGGER" as const,
    },
  ],
};
illegalTimingPower.intentions = illegalTimingPower.effectPackets;
const illegalTimingErrors = validateCharacterPowers({
  level: 1,
  powers: [illegalTimingPower],
});
assert(
  illegalTimingErrors.some((error) => error.includes("timing is not legal")),
  "Illegal timing should be rejected.",
);

const missingDamageTypePower = {
  ...levelOnePower,
  effectPackets: [
    {
      ...levelOnePower.effectPackets[0],
      detailsJson: {
        ...levelOnePower.effectPackets[0].detailsJson,
        damageTypes: [],
      },
    },
  ],
};
missingDamageTypePower.intentions = missingDamageTypePower.effectPackets;
const missingDamageErrors = validateCharacterPowers({
  level: 1,
  powers: [missingDamageTypePower],
});
assert(
  missingDamageErrors.some((error) => error.includes("requires at least one damage type")),
  "Missing Attack damage type should be rejected.",
);
const missingDamageSummary = summarizeCharacterPowers({
  level: 1,
  powers: [missingDamageTypePower],
});
assert(
  missingDamageSummary.powers[0]?.costValid === false,
  "Missing Attack damage type should not have a valid comparable cost.",
);
assert(
  missingDamageSummary.powers[0]?.spend === null,
  "Missing Attack damage type should not contribute player spend.",
);

const secondaryDicePower = normalizeCharacterPower({
  ...levelOnePower,
  name: "Secondary Dice Probe",
  effectPackets: [
    { ...levelOnePower.effectPackets[0], diceCount: 5, potency: 2 },
    {
      ...createDefaultCharacterPowerPacket("ATTACK", 1),
      diceCount: 3,
      potency: 2,
      detailsJson: {
        attackMode: "PHYSICAL",
        damageTypes: ["Slash"],
        rangeCategory: "MELEE",
        rangeValue: 1,
        rangeExtra: {},
      },
    },
  ],
}, 0);
secondaryDicePower.intentions = secondaryDicePower.effectPackets;
assert(
  validateCharacterPowers({ level: 1, powers: [secondaryDicePower] }).some((error) =>
    error.includes("secondary packet dice"),
  ),
  "Secondary packet dice should not be independently authorable.",
);

const longDurationPower = normalizeCharacterPower({
  ...levelOnePower,
  name: "Long Duration Probe",
  effectPackets: [
    {
      ...levelOnePower.effectPackets[0],
      effectDurationType: "TURNS" as const,
      effectDurationTurns: CHARACTER_POWER_MAX_PACKET_DURATION_TURNS + 1,
    },
  ],
}, 0);
assert(
  validateCharacterPowers({ level: 1, powers: [longDurationPower] }).some((error) =>
    error.includes("duration turns cannot exceed"),
  ),
  "Packet duration turns above 4 should be rejected.",
);

const triggerPower = normalizeCharacterPower({
  ...levelOnePower,
  name: "Trigger Probe",
  descriptorChassis: "TRIGGER" as const,
  triggerMethod: "ARM_AND_THEN_TARGET" as const,
  lifespanType: "TURNS" as const,
  lifespanTurns: 1,
  effectPackets: [
    {
      ...levelOnePower.effectPackets[0],
      effectTimingType: "ON_TRIGGER" as const,
      triggerConditionText: "MOVES",
    },
  ],
}, 0);
assert(
  !validateCharacterPowers({ level: 20, powers: [triggerPower] }).some((error) =>
    error.includes("timing is not legal") || error.includes("trigger condition"),
  ),
  "Trigger Packet 1 On Trigger with a trigger condition should be legal.",
);
assert(
  getPowerAllowedTimingOptions(triggerPower, 0).includes("ON_TRIGGER"),
  "Shared authoring rules should allow Trigger Packet 1 On Trigger timing.",
);

const blankTriggerPower = normalizeCharacterPower({
  ...triggerPower,
  effectPackets: [{ ...triggerPower.effectPackets[0], triggerConditionText: null }],
}, 0);
assert(
  validateCharacterPowers({ level: 20, powers: [blankTriggerPower] }).some((error) =>
    error.includes("requires a trigger condition") || error.includes("On Trigger timing requires"),
  ),
  "Trigger without a trigger condition should be rejected.",
);
assert(
  CHARACTER_POWER_RANGE_TARGET_OPTIONS.join(",") === "1,2,3,4,5" &&
    CHARACTER_POWER_RANGE_RANGED_DISTANCE_OPTIONS.join(",") === "30,60,120,200",
  "Character Builder should use the shared Summoning Circle fixed range option sets.",
);

const illegalRangedDistancePower = normalizeCharacterPower({
  ...levelOnePower,
  name: "Illegal Ranged Distance",
  effectPackets: [
    {
      ...levelOnePower.effectPackets[0],
      detailsJson: {
        ...levelOnePower.effectPackets[0].detailsJson,
        rangeCategory: "RANGED",
        rangeValue: 45,
        rangeExtra: { targets: 1 },
      },
    },
  ],
}, 0);
assert(
  validateCharacterPowers({ level: 20, powers: [illegalRangedDistancePower] }).some((error) =>
    error.includes("Ranged distance must use"),
  ),
  "Character Builder validation should reject ranged distances outside Summoning Circle options.",
);

const reserveWithoutReleasePower = normalizeCharacterPower({
  ...levelOnePower,
  name: "Reserve Without Release",
  descriptorChassis: "RESERVE" as const,
  lifespanType: "TURNS" as const,
  lifespanTurns: 1,
  effectPackets: [
    {
      ...levelOnePower.effectPackets[0],
      effectTimingType: "ON_RELEASE" as const,
    },
  ],
}, 0);
assert(
  validateCharacterPowers({ level: 20, powers: [reserveWithoutReleasePower] }).some((error) =>
    error.includes("Release Behaviour"),
  ),
  "Reserve powers should be invalid until Release Behaviour is authored.",
);

const reserveWithReleasePower = normalizeCharacterPower({
  ...reserveWithoutReleasePower,
  descriptorChassisConfig: { releaseBehaviour: CHARACTER_POWER_RESERVE_RELEASE_BEHAVIOUR_OPTIONS[0] },
}, 0);
assert(
  !validateCharacterPowers({ level: 20, powers: [reserveWithReleasePower] }).some((error) =>
    error.includes("Release Behaviour") || error.includes("timing is not legal"),
  ),
  "Reserve powers should validate after Release Behaviour is authored.",
);

const attachedPower = normalizeCharacterPower({
  ...levelOnePower,
  name: "Attached Probe",
  descriptorChassis: "ATTACHED" as const,
  attachedHostAnchorType: "TARGET" as const,
  descriptorChassisConfig: { hostileEntryPattern: "ON_ATTACH", anchorText: "target" },
  lifespanType: "TURNS" as const,
  lifespanTurns: 1,
  effectPackets: [
    {
      ...levelOnePower.effectPackets[0],
      effectTimingType: "ON_ATTACH" as const,
    },
  ],
}, 0);
assert(
  !validateCharacterPowers({ level: 20, powers: [attachedPower] }).some((error) =>
    error.includes("timing is not legal"),
  ),
  "Attached Packet 1 On Attach should be legal.",
);
assert(
  getPowerAllowedTimingOptions(attachedPower, 0).includes("ON_ATTACH"),
  "Shared authoring rules should allow Attached Packet 1 On Attach timing.",
);

const attachedWithoutEntryPower = normalizeCharacterPower({
  ...attachedPower,
  name: "Attached Without Entry",
  primaryDefenceGate: null,
  descriptorChassisConfig: { anchorText: "target" },
}, 0);
assert(
  validateCharacterPowers({ level: 20, powers: [attachedWithoutEntryPower] }).some((error) =>
    error.includes("Attached Hostile Entry"),
  ),
  "Hostile Attached powers should be invalid until Attached Hostile Entry is authored.",
);
assert(
  validateCharacterPowers({ level: 20, powers: [attachedWithoutEntryPower] }).some((error) =>
    error.includes("timing requires an Attached Hostile Entry"),
  ),
  "Hostile Attached Packet 1 timing should not validate until Attached Hostile Entry is authored.",
);
assert(
  !isPowerPacketTimingAuthorable(attachedWithoutEntryPower, 0),
  "Hostile Attached Packet 1 timing should not be authorable until Attached Hostile Entry is authored.",
);
assert(
  isPowerPacketTimingAuthorable(attachedPower, 0),
  "Hostile Attached Packet 1 timing should be authorable after Attached Hostile Entry is authored.",
);

function renderSinglePowerDescriptor(power: CharacterPower) {
  return summarizeCharacterPowers({ level: 20, powers: [power] }).powers[0]?.descriptorLines.join(" ") ?? "";
}

function createAttachedHostPower(
  label: string,
  attachedHostAnchorType: NonNullable<CharacterPower["attachedHostAnchorType"]>,
  rangeCategory: string,
  rangeValue: number,
  rangeExtra: Record<string, unknown> = {},
) {
  return normalizeCharacterPower({
    ...attachedPower,
    name: label,
    attachedHostAnchorType,
    descriptorChassisConfig: { hostileEntryPattern: "ON_ATTACH", anchorText: attachedHostAnchorType.toLowerCase() },
    effectPackets: [
      {
        ...attachedPower.effectPackets[0],
        detailsJson: {
          ...(attachedPower.effectPackets[0].detailsJson ?? {}),
          rangeCategory,
          rangeValue,
          rangeExtra,
        },
      },
    ],
  }, 0);
}

const attachedWeaponSelfDescriptor = renderSinglePowerDescriptor(
  createAttachedHostPower("Attached Weapon Self", "WEAPON", "SELF", 0),
);
assert(
  /attach Attached Weapon Self to your weapon/i.test(attachedWeaponSelfDescriptor),
  "Attached Weapon with Self range should attach to your weapon.",
);

const attachedWeaponSingleTargetDescriptor = renderSinglePowerDescriptor(
  createAttachedHostPower("Attached Weapon Single Target", "WEAPON", "MELEE", 1),
);
assert(
  /attach Attached Weapon Single Target to the target's weapon/i.test(attachedWeaponSingleTargetDescriptor),
  "Attached Weapon with one melee/ranged target should attach to the target's weapon.",
);

const attachedWeaponMultiTargetDescriptor = renderSinglePowerDescriptor(
  createAttachedHostPower("Attached Weapon Multi Target", "WEAPON", "MELEE", 2),
);
assert(
  /attach Attached Weapon Multi Target to all targets' weapons/i.test(attachedWeaponMultiTargetDescriptor),
  "Attached Weapon with multiple melee/ranged targets should attach to all targets' weapons.",
);

const attachedWeaponAoeDescriptor = renderSinglePowerDescriptor(
  createAttachedHostPower("Attached Weapon AOE", "WEAPON", "AOE", 30, {
    count: 1,
    shape: "SPHERE",
    sphereRadiusFeet: 10,
  }),
);
assert(
  /attach Attached Weapon AOE to all targets' weapons/i.test(attachedWeaponAoeDescriptor),
  "Attached Weapon with AoE range should attach to all targets' weapons.",
);

const attachedObjectSingleTargetDescriptor = renderSinglePowerDescriptor(
  createAttachedHostPower("Attached Object Single Target", "OBJECT", "RANGED", 30, { targets: 1 }),
);
assert(
  /attach Attached Object Single Target to the target's object/i.test(attachedObjectSingleTargetDescriptor),
  "Attached Object with one melee/ranged target should attach to the target's object.",
);

const attachedObjectMultiTargetDescriptor = renderSinglePowerDescriptor(
  createAttachedHostPower("Attached Object Multi Target", "OBJECT", "RANGED", 30, { targets: 2 }),
);
assert(
  /attach Attached Object Multi Target to all targets' objects/i.test(attachedObjectMultiTargetDescriptor),
  "Attached Object with multiple melee/ranged targets should attach to all targets' objects.",
);

const attachedArmorSingleTargetDescriptor = renderSinglePowerDescriptor(
  createAttachedHostPower("Attached Armor Single Target", "ARMOR", "MELEE", 1),
);
assert(
  /attach Attached Armor Single Target to the target's armor/i.test(attachedArmorSingleTargetDescriptor),
  "Attached Armor with one melee/ranged target should attach to the target's armor.",
);

const attachedArmorMultiTargetDescriptor = renderSinglePowerDescriptor(
  createAttachedHostPower("Attached Armor Multi Target", "ARMOR", "MELEE", 2),
);
assert(
  /attach Attached Armor Multi Target to all targets' armor/i.test(attachedArmorMultiTargetDescriptor),
  "Attached Armor with multiple melee/ranged targets should attach to all targets' armor.",
);

const attachedSelfDescriptor = renderSinglePowerDescriptor(
  createAttachedHostPower("Attached Self", "SELF", "SELF", 0),
);
assert(
  /attach Attached Self to yourself/i.test(attachedSelfDescriptor),
  "Attached Self should only attach to yourself.",
);

const attachedTargetMultiTargetDescriptor = renderSinglePowerDescriptor(
  createAttachedHostPower("Attached Target Multi Target", "TARGET", "MELEE", 2),
);
assert(
  /attach Attached Target Multi Target to all targets/i.test(attachedTargetMultiTargetDescriptor),
  "Attached Target with multiple melee/ranged targets should attach to all targets.",
);

const attachedAreaDescriptor = renderSinglePowerDescriptor(
  createAttachedHostPower("Attached Area", "AREA", "AOE", 30, {
    count: 1,
    shape: "SPHERE",
    sphereRadiusFeet: 10,
  }),
);
assert(
  /attach Attached Area to the area/i.test(attachedAreaDescriptor),
  "Attached Area should attach to the area rather than target-owned anchors.",
);

const attachedTargetSelfRangeErrors = validateCharacterPowers({
  level: 20,
  powers: [createAttachedHostPower("Attached Target Self Illegal", "TARGET", "SELF", 0)],
});
assert(
  attachedTargetSelfRangeErrors.some((error) =>
    error.includes("Range category is not legal for this attached host/anchor"),
  ),
  "Attached Target should not allow Self range.",
);

const attachedSelfMeleeRangeErrors = validateCharacterPowers({
  level: 20,
  powers: [createAttachedHostPower("Attached Self Melee Illegal", "SELF", "MELEE", 1)],
});
assert(
  attachedSelfMeleeRangeErrors.some((error) =>
    error.includes("Range category is not legal for this attached host/anchor"),
  ),
  "Attached Self should only allow Self range.",
);

const attachedAreaMeleeRangeErrors = validateCharacterPowers({
  level: 20,
  powers: [createAttachedHostPower("Attached Area Melee Illegal", "AREA", "MELEE", 1)],
});
assert(
  attachedAreaMeleeRangeErrors.some((error) =>
    error.includes("Range category is not legal for this attached host/anchor"),
  ),
  "Attached Area should only allow AoE range.",
);

assert(
  !validateCharacterPowers({
    level: 20,
    powers: [createAttachedHostPower("Attached Target Melee Legal", "TARGET", "MELEE", 1)],
  }).some((error) => error.includes("Range category is not legal for this attached host/anchor")),
  "Attached Target should allow melee/ranged target ranges.",
);

assert(
  !validateCharacterPowers({
    level: 20,
    powers: [createAttachedHostPower("Attached Area AOE Legal", "AREA", "AOE", 30, {
      count: 1,
      shape: "SPHERE",
      sphereRadiusFeet: 10,
    })],
  }).some((error) => error.includes("Range category is not legal for this attached host/anchor")),
  "Attached Area should allow AoE range.",
);

const channelTriggerPower = normalizeCharacterPower({
  ...triggerPower,
  commitmentModifier: "CHANNEL" as const,
}, 0);
assert(
  validateCharacterPowers({ level: 20, powers: [channelTriggerPower] }).some((error) =>
    error.includes("CHANNEL commitment is not legal"),
  ),
  "Channel should not be legal for Trigger powers.",
);
assert(
  !getCharacterPowerAllowedCommitmentOptions("TRIGGER").includes("CHANNEL"),
  "Character Builder UI options should omit Channel for Trigger powers.",
);

const counterTriggerPower = normalizeCharacterPower({
  ...triggerPower,
  counterMode: "YES" as const,
}, 0);
assert(
  validateCharacterPowers({ level: 20, powers: [counterTriggerPower] }).some((error) =>
    error.includes("Counter is not legal"),
  ),
  "Counter should not be legal for Trigger powers.",
);

const fieldMeleePower = normalizeCharacterPower({
  ...levelOnePower,
  name: "Field Melee Probe",
  descriptorChassis: "FIELD" as const,
  lifespanType: "TURNS" as const,
  lifespanTurns: 1,
}, 0);
assert(
  validateCharacterPowers({ level: 20, powers: [fieldMeleePower] }).some((error) =>
    error.includes("Field powers must use AoE"),
  ),
  "Field powers should require AoE range.",
);

const fieldAoePower = normalizeCharacterPower({
  ...levelOnePower,
  name: "Field AoE Probe",
  descriptorChassis: "FIELD" as const,
  lifespanType: "TURNS" as const,
  lifespanTurns: 1,
  effectPackets: [
    {
      ...levelOnePower.effectPackets[0],
      effectTimingType: "START_OF_TURN" as const,
      detailsJson: {
        ...levelOnePower.effectPackets[0].detailsJson,
        rangeCategory: "AOE",
        rangeValue: 0,
        rangeExtra: {
          count: 1,
          shape: "SPHERE",
          sphereRadiusFeet: 10,
        },
      },
    },
  ],
}, 0);
assert(
  !validateCharacterPowers({ level: 20, powers: [fieldAoePower] }).some((error) =>
    error.includes("Field powers must use AoE") || error.includes("AoE count"),
  ),
  "Field powers with AoE count, shape, and geometry should pass Field range validation.",
);

const supportPower = normalizeCharacterPower({
  ...levelOnePower,
  name: "Support Probe",
  effectPackets: [
    {
      ...createDefaultCharacterPowerPacket("SUPPORT", 0),
      detailsJson: {
        rangeCategory: "SELF",
        rangeValue: 0,
        rangeExtra: {},
      },
    },
  ],
}, 0);
assert(
  !CHARACTER_POWER_INTENTION_OPTIONS.includes("SUPPORT"),
  "Character Builder V1 UI options should not include SUPPORT.",
);
assert(
  validateCharacterPowers({ level: 1, powers: [supportPower] }).some((error) =>
    error.includes("SUPPORT is not supported"),
  ),
  "Unsupported SUPPORT intention should be rejected.",
);

const expensivePacket = {
  ...createDefaultCharacterPowerPacket("ATTACK", 0),
  diceCount: 20,
  potency: 20,
  effectDurationType: "TURNS" as const,
  effectDurationTurns: CHARACTER_POWER_MAX_PACKET_DURATION_TURNS,
  detailsJson: {
    attackMode: "PHYSICAL",
    damageTypes: ["Slash", "Pierce", "Bludgeon"],
    rangeCategory: "AOE",
    rangeValue: 200,
    rangeExtra: {
      count: 5,
      shape: "SPHERE",
      sphereRadiusFeet: 30,
    },
  },
};
const expensivePowers = Array.from({ length: 6 }, (_, index) => ({
  ...createDefaultCharacterPower(index),
  name: `Expensive Power ${index + 1}`,
  effectPackets: [expensivePacket],
  intentions: [expensivePacket],
}));
const overspendErrors = validateCharacterPowers({
  level: 1,
  powers: expensivePowers,
});

assert(
  overspendErrors.some((error) => error.includes("Power Point spend")),
  "Overspend should be rejected.",
);

function makeDiagnosticPower(params: {
  name: string;
  diceCount: number;
  potency: number;
  damageTypes: string[];
}): CharacterPower {
  const packet = {
    ...createDefaultCharacterPowerPacket("ATTACK", 0),
    diceCount: params.diceCount,
    potency: params.potency,
    detailsJson: {
      attackMode: "PHYSICAL",
      damageTypes: params.damageTypes,
      rangeCategory: "MELEE",
      rangeValue: 1,
      rangeExtra: {},
    },
  };
  const power = {
    ...createDefaultCharacterPower(0),
    name: params.name,
    diceCount: params.diceCount,
    potency: params.potency,
    effectPackets: [packet],
    intentions: [packet],
  };
  return normalizeCharacterPower(power, 0);
}

function makeSummoningCircleShapedAttackPower(params: {
  name: string;
  diceCount: number;
  potency: number;
}): Power {
  const packet = {
    ...createDefaultCharacterPowerPacket("ATTACK", 0),
    diceCount: params.diceCount,
    potency: params.potency,
    effectTimingType: "ON_CAST" as const,
    effectDurationType: "INSTANT" as const,
    detailsJson: {
      attackMode: "PHYSICAL",
      damageTypes: ["Slash"],
      rangeCategory: "MELEE",
      rangeValue: 1,
      rangeExtra: {},
    },
  };
  return {
    ...createDefaultCharacterPower(0),
    name: params.name,
    diceCount: params.diceCount,
    potency: params.potency,
    rangeCategories: ["MELEE"],
    meleeTargets: 1,
    rangedTargets: null,
    rangedDistanceFeet: null,
    aoeCenterRangeFeet: null,
    aoeCount: null,
    aoeShape: null,
    aoeSphereRadiusFeet: null,
    aoeConeLengthFeet: null,
    aoeLineWidthFeet: null,
    aoeLineLengthFeet: null,
    effectPackets: [packet],
    intentions: [packet],
  };
}

function makeSummoningCircleShapedPowerForCaseB(): Power {
  return makeSummoningCircleShapedAttackPower({
    name: "Case E - Summoning Circle shape",
    diceCount: 6,
    potency: 12,
  });
}

{
  const costlySignatureMove = normalizeCharacterPower(
    makeSummoningCircleShapedAttackPower({
      name: "Signature Move budget separation fixture",
      diceCount: 2,
      potency: 8,
    }),
    0,
  );
  const normalPowerSummary = summarizeCharacterPowers({
    level: 3,
    powers: [costlySignatureMove],
  });
  const signatureMoveSummary = summarizeCharacterPowers({
    level: 3,
    powers: [costlySignatureMove],
    powerPool: signatureMovePointPool(3),
    powerPoolKind: "signature",
    offencePressureMode: "reviewOnly",
  });
  const normalPowerErrors = validateCharacterPowers({
    level: 3,
    powers: [costlySignatureMove],
  });
  const signatureMoveErrors = validateCharacterPowers({
    level: 3,
    powers: [costlySignatureMove],
    powerPool: signatureMovePointPool(3),
    powerPoolKind: "signature",
    powerLabel: "Signature Move",
    poolDescription: "Character Level x 20",
    offencePressureMode: "reviewOnly",
  });

  assert(normalPowerSummary.powerPool === powerPointPool(3), "Level 3 normal powers should use Character Level x 50.");
  assert(signatureMoveSummary.powerPool === 60, "Level 3 Signature Move should use Character Level x 20.");
  assert(!normalPowerErrors.some((error) => error.includes("Power Point spend")), "Normal power pool should validate separately from Signature Move pool.");
  assert(
    signatureMoveErrors.some((error) => error.includes("Signature Move Point spend") && error.includes("Character Level x 20")),
    "Signature Move overspend should be checked against its separate Character Level x 20 pool.",
  );

  const signatureBudgetCooldown = deriveCharacterPowerBudgetCooldownPressure({
    spend: 46,
    powerPool: signatureMovePointPool(3),
    poolKind: "signature",
    baseCooldownTurns: 3,
    maxCooldownTurns: 5,
  });
  assert(signatureBudgetCooldown?.budgetCooldownFloor === 4, "46/60 Signature Move spend should require cooldown floor 4.");
  assert(signatureBudgetCooldown?.finalCooldownTurns === 4, "Signature budget pressure should raise cooldown 3 to 4.");

  const staleNormal = { ...costlySignatureMove, cooldownTurns: 1, cooldownReduction: 0 };
  const staleSignature = { ...costlySignatureMove, cooldownTurns: 1, cooldownReduction: 0 };
  const synchronizedCaches = synchronizeCharacterPowerCooldownCaches({
    level: 3,
    powers: [staleNormal],
    signatureMove: staleSignature,
    tuningSnapshot: cacheSynchronizationTuning,
  });
  assert(synchronizedCaches.ok, "Normal and signature cache synchronization should resolve together.");
  assert(
    synchronizedCaches.ok && synchronizedCaches.signatureMove?.cooldownTurns === 5,
    "Signature stored 1 with an effective budget-pressure cooldown of 5 should persist 5.",
  );
  assert(
    synchronizedCaches.ok &&
      synchronizedCaches.powers[0]?.cooldownTurns !== synchronizedCaches.signatureMove?.cooldownTurns,
    "Ordinary and signature powers must retain their distinct budget-pool cooldown pressure.",
  );
  assert(
    synchronizedCaches.ok && synchronizedCaches.signatureMove?.cooldownReduction === 0,
    "Signature synchronization should fold legacy reduction into the effective cache.",
  );
  assert(
    synchronizedCaches.ok &&
      JSON.stringify(characterPowerWithoutCache(synchronizedCaches.signatureMove!)) ===
        JSON.stringify(characterPowerWithoutCache(staleSignature)),
    "Signature cache synchronization must preserve semantic power fields.",
  );
}

function printPowerCostDiagnostic(label: string, power: Power) {
  const resolved = resolvePowerCosts([power], undefined, { level: 1, tier: "SOLDIER" }).powers[0];
  const summary = summarizeCharacterPowers({
    level: 1,
    powers: [normalizeCharacterPower(power, 0)],
  }).powers[0];
  const packet = power.effectPackets[0];
  const details = packet?.detailsJson ?? {};
  const validationErrors = validateCharacterPowers({
    level: 1,
    powers: [normalizeCharacterPower(power, 0)],
  });
  const diagnostic = {
    label,
    normalizedPowerPassedToResolver: power,
    resolverTotalBasePowerValue: resolved?.breakdown.basePowerValue ?? null,
    resolverBreakdown: resolved?.breakdown ?? null,
    characterBuilderPlayerSpend: summary?.spend ?? null,
    characterBuilderSpendScalar: summary?.playerPowerSpendScalar ?? null,
    derivedCooldown: resolved?.derivedCooldown ?? null,
    validationResult: {
      ok: validationErrors.length === 0,
      errors: validationErrors,
    },
    damageTypeFieldPath: "effectPackets[0].detailsJson.damageTypes",
    damageTypeFieldValue: (details as Record<string, unknown>).damageTypes,
    diceFieldPath: "effectPackets[0].diceCount",
    diceFieldValue: packet?.diceCount,
    potencyFieldPath: "effectPackets[0].potency",
    potencyFieldValue: packet?.potency,
    topLevelDiceFieldPath: "diceCount",
    topLevelDiceFieldValue: power.diceCount,
    topLevelPotencyFieldPath: "potency",
    topLevelPotencyFieldValue: power.potency,
    timingFields: {
      descriptorChassis: power.descriptorChassis,
      commitmentModifier: power.commitmentModifier,
      packetEffectTimingType: packet?.effectTimingType,
      packetEffectTimingTurns: packet?.effectTimingTurns,
    },
    durationFields: {
      lifespanType: power.lifespanType,
      lifespanTurns: power.lifespanTurns,
      powerEffectDurationType: power.effectDurationType,
      powerEffectDurationTurns: power.effectDurationTurns,
      packetEffectDurationType: packet?.effectDurationType,
      packetEffectDurationTurns: packet?.effectDurationTurns,
    },
    packetSpecificFields: {
      intention: packet?.intention,
      type: packet?.type,
      hostility: packet?.hostility,
      dealsWounds: packet?.dealsWounds,
      woundChannel: packet?.woundChannel,
      applyTo: packet?.applyTo,
      specific: packet?.specific ?? null,
      detailsJson: details,
    },
  };

  console.log(`\n[Character Power Cost Diagnostic] ${label}`);
  console.log(JSON.stringify(diagnostic, null, 2));
  return diagnostic;
}

const diagnosticCases = {
  caseA: makeDiagnosticPower({
    name: "Case A - 1 dice potency 1 one physical damage",
    diceCount: 1,
    potency: 1,
    damageTypes: ["Slash"],
  }),
  caseB: makeDiagnosticPower({
    name: "Case B - 6 dice potency 12 one physical damage",
    diceCount: 6,
    potency: 12,
    damageTypes: ["Slash"],
  }),
  caseC: makeDiagnosticPower({
    name: "Case C - 6 dice potency 12 no damage",
    diceCount: 6,
    potency: 12,
    damageTypes: [],
  }),
  caseD: makeDiagnosticPower({
    name: "Case D - 6 dice potency 12 two physical damage",
    diceCount: 6,
    potency: 12,
    damageTypes: ["Slash", "Pierce"],
  }),
  caseE: makeSummoningCircleShapedPowerForCaseB(),
};

const diagnosticOutputs = {
  caseA: printPowerCostDiagnostic("Case A", diagnosticCases.caseA),
  caseB: printPowerCostDiagnostic("Case B", diagnosticCases.caseB),
  caseC: printPowerCostDiagnostic("Case C", diagnosticCases.caseC),
  caseD: printPowerCostDiagnostic("Case D", diagnosticCases.caseD),
  caseE: printPowerCostDiagnostic("Case E", diagnosticCases.caseE),
};

function basePowerValueForMagnitude(diceCount: number, potency: number): number {
  const power = makeDiagnosticPower({
    name: `Magnitude ${diceCount} dice potency ${potency}`,
    diceCount,
    potency,
    damageTypes: ["Slash"],
  });
  const resolved = resolvePowerCosts([power], undefined, { level: 1, tier: "SOLDIER" }).powers[0];
  return resolved?.breakdown.basePowerValue ?? 0;
}

function chosenTuningKeysForDiagnostic(diagnostic: {
  resolverBreakdown: { packetCosts: Array<{ debug: Record<string, unknown> }> } | null;
}): string[] {
  const chosenKeys = diagnostic.resolverBreakdown?.packetCosts[0]?.debug.chosenTuningKeys;
  return Array.isArray(chosenKeys) ? chosenKeys.filter((key): key is string => typeof key === "string") : [];
}

function resolveChosenTuningKeys(power: Power): string[] {
  const resolved = resolvePowerCosts([power], undefined, { level: 1, tier: "SOLDIER" }).powers[0];
  const chosenKeys = resolved?.breakdown.packetCosts[0]?.debug.chosenTuningKeys;
  return Array.isArray(chosenKeys) ? chosenKeys.filter((key): key is string => typeof key === "string") : [];
}

function resolveBasePowerValue(power: Power): number {
  return resolvePowerCosts([power], undefined, { level: 1, tier: "SOLDIER" }).powers[0]
    ?.breakdown.basePowerValue ?? 0;
}

function assertClose(actual: number, expected: number, message: string) {
  assert(Math.abs(actual - expected) < 0.001, `${message} Expected ${expected}, got ${actual}.`);
}

assert(
  !diagnosticOutputs.caseB.validationResult.errors.some((error: string) =>
    error.includes("requires at least one damage type"),
  ),
  "Case B should satisfy required damage type validation.",
);
assert(
  !diagnosticOutputs.caseC.validationResult.ok,
  "Case C should be invalid without a damage type.",
);
assert(
  diagnosticCases.caseB.effectPackets[0]?.diceCount === 6 &&
    diagnosticCases.caseB.effectPackets[0]?.potency === 12,
  "Case B dice and potency should reach the resolver packet fields.",
);
assert(
  diagnosticOutputs.caseB.resolverTotalBasePowerValue === diagnosticOutputs.caseE.resolverTotalBasePowerValue,
  "Character Builder and equivalent Summoning Circle-shaped Case B should resolve to the same BasePowerValue.",
);
assert(
  diagnosticOutputs.caseB.resolverTotalBasePowerValue === 129.2,
  "Case B BasePowerValue should be 129.2 with Phase 1 expected-output attack payload pricing plus raised capped offence pressure surcharge.",
);
assert(
  chosenTuningKeysForDiagnostic(diagnosticOutputs.caseB).includes("packet.magnitude.potency.20"),
  "Case B should use conservative packet.magnitude.potency.20 fallback for effective wounds above the explicit table.",
);
assert(
  chosenTuningKeysForDiagnostic(diagnosticOutputs.caseB).includes("packet.magnitude.dice.6"),
  "Case B should use exact packet.magnitude.dice.6 tuning.",
);
assert(
  diagnosticOutputs.caseB.characterBuilderSpendScalar === DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  "Case B should use default player spend scalar 3.",
);
assert(
  diagnosticOutputs.caseB.characterBuilderPlayerSpend === 388,
  "Case B PlayerPowerSpend should be ceil(129.2 * 3) = 388.",
);
assert(
  diagnosticOutputs.caseB.resolverBreakdown.packetCosts.some((packet) =>
    JSON.stringify(packet.debug?.magnitude ?? {}).includes("burstWarning"),
  ),
  "Case B should carry an offence pressure burst warning in resolver debug.",
);
assert(
  diagnosticOutputs.caseB.derivedCooldown?.derivedCooldownTurns === 5,
  "Case B cooldown should still derive from BasePowerValue.",
);
const caseBScalarTwoSummary = summarizeCharacterPowers({
  level: 1,
  powers: [diagnosticCases.caseB],
  playerPowerSpendScalar: 2,
});
assert(
  caseBScalarTwoSummary.powers[0]?.spend === 259,
  "Changing scalar to 2 should change Case B PlayerPowerSpend to 259.",
);
const caseBOverspendErrors = validateCharacterPowers({
  level: 1,
  powers: [diagnosticCases.caseB],
});
assert(
  caseBOverspendErrors.some((error) => error.includes("Power Point spend")),
  "Level 1 Case B should overspend with default scalar 3.",
);
assert(
  Number(diagnosticOutputs.caseB.resolverTotalBasePowerValue) >=
    Number(diagnosticOutputs.caseC.resolverTotalBasePowerValue),
  "Adding one damage type should not lower raw resolver cost.",
);
assert(
  Number(diagnosticOutputs.caseD.resolverTotalBasePowerValue) >
    Number(diagnosticOutputs.caseB.resolverTotalBasePowerValue),
  "Adding a second damage type should increase raw resolver cost.",
);

const potency5BaseValue = basePowerValueForMagnitude(6, 5);
const potency6BaseValue = basePowerValueForMagnitude(6, 6);
const potency12BaseValue = basePowerValueForMagnitude(6, 12);
const woundsPerSuccess2BaseValue = basePowerValueForMagnitude(4, 1);
const woundsPerSuccess4BaseValue = basePowerValueForMagnitude(4, 2);
const woundsPerSuccess6BaseValue = basePowerValueForMagnitude(3, 3);
const woundsPerSuccess8BaseValue = basePowerValueForMagnitude(3, 4);
assertClose(
  woundsPerSuccess2BaseValue,
  8.4,
  "W/S2 baseline should remain unchanged by offence pressure surcharge tuning.",
);
assertClose(
  woundsPerSuccess4BaseValue,
  14.8,
  "W/S4 soft-cap baseline should remain unchanged by offence pressure surcharge tuning.",
);
assertClose(
  woundsPerSuccess6BaseValue,
  22.4,
  "W/S6 burst sample should reflect raised offence pressure surcharge scalar.",
);
assertClose(
  woundsPerSuccess8BaseValue,
  33.2,
  "W/S8 extreme sample should reflect raised offence pressure surcharge cap.",
);
assert(
  potency5BaseValue < potency6BaseValue && potency6BaseValue < potency12BaseValue,
  "Potency should be monotonic across 5, 6, and 12.",
);

const dice10BaseValue = basePowerValueForMagnitude(10, 5);
const dice11BaseValue = basePowerValueForMagnitude(11, 5);
const maxDiceBaseValue = basePowerValueForMagnitude(CHARACTER_POWER_MAX_DICE_COUNT, 5);
assert(
  dice10BaseValue < dice11BaseValue && dice11BaseValue <= maxDiceBaseValue,
  "Dice count should increase past 10 through the highest Character Builder legal dice value.",
);

const maxPotencyBaseValue = basePowerValueForMagnitude(6, CHARACTER_POWER_MAX_POTENCY);
assert(
  potency12BaseValue <= maxPotencyBaseValue,
  "Potency 12 should not exceed the highest Character Builder legal potency value.",
);

const summoningHighMagnitudePower = makeSummoningCircleShapedAttackPower({
  name: "Summoning Circle shape - high magnitude",
  diceCount: 11,
  potency: 12,
});
const summoningHighMagnitudeKeys = resolveChosenTuningKeys(summoningHighMagnitudePower);
assert(
  summoningHighMagnitudeKeys.includes("packet.magnitude.dice.11") &&
    summoningHighMagnitudeKeys.includes("packet.magnitude.potency.20"),
  "Summoning Circle-shaped high magnitude power should use exact dice.11 and conservative potency.20 fallback.",
);
assert(
  resolveBasePowerValue(summoningHighMagnitudePower) > diagnosticOutputs.caseB.resolverTotalBasePowerValue,
  "Summoning Circle-shaped dice 11 potency 12 power should cost more than dice 6 potency 12.",
);

const summoningMaxMagnitudePower = makeSummoningCircleShapedAttackPower({
  name: "Summoning Circle shape - max priced magnitude",
  diceCount: CHARACTER_POWER_MAX_DICE_COUNT,
  potency: CHARACTER_POWER_MAX_POTENCY,
});
const summoningMaxMagnitudeKeys = resolveChosenTuningKeys(summoningMaxMagnitudePower);
assert(
  summoningMaxMagnitudeKeys.includes(`packet.magnitude.dice.${CHARACTER_POWER_MAX_DICE_COUNT}`) &&
    summoningMaxMagnitudeKeys.includes(`packet.magnitude.potency.${CHARACTER_POWER_MAX_POTENCY}`),
  "Summoning Circle-shaped max magnitude power should use exact max dice and potency keys.",
);
assert(
  resolveBasePowerValue(summoningMaxMagnitudePower) > resolveBasePowerValue(summoningHighMagnitudePower),
  "Summoning Circle-shaped max magnitude power should cost more than dice 11 potency 12.",
);

const legacyActiveTuningShape = normalizePowerTuningValues({
  "packet.magnitude.dice.1": 1,
  "packet.magnitude.dice.2": 3,
  "packet.magnitude.dice.3": 6,
  "packet.magnitude.dice.4": 10,
  "packet.magnitude.dice.5": 14,
  "packet.magnitude.dice.6": 19,
  "packet.magnitude.dice.7": 24,
  "packet.magnitude.dice.8": 30,
  "packet.magnitude.dice.9": 37,
  "packet.magnitude.dice.10": 45,
  "packet.magnitude.potency.1": 1,
  "packet.magnitude.potency.2": 2,
  "packet.magnitude.potency.3": 3,
  "packet.magnitude.potency.4": 4,
  "packet.magnitude.potency.5": 5,
});
assert(
  legacyActiveTuningShape["packet.magnitude.dice.11"] >
    legacyActiveTuningShape["packet.magnitude.dice.10"] &&
    legacyActiveTuningShape["packet.magnitude.potency.6"] >
      legacyActiveTuningShape["packet.magnitude.potency.5"],
  "Missing high magnitude keys should continue from an existing active tuning shape without flattening.",
);

{
  const ordinary = createDefaultCharacterPower(0);
  const signature = createDefaultCharacterPower(0);
  assert(ordinary.id && ordinary.effectPackets[0]?.id, "New ordinary powers and packets should receive opaque IDs.");
  assert(signature.id && signature.effectPackets[0]?.id, "New signature powers and packets should receive opaque IDs.");
  assert(ordinary.id !== signature.id, "Ordinary and signature power IDs should be independent.");
  const normalizedOrdinary = normalizeCharacterPower(ordinary, 0);
  const normalizedSignature = normalizeCharacterPower(signature, 0);
  const preparedIds = prepareCharacterPowerIdsForPersistence({
    powers: [{ ...normalizedOrdinary, id: undefined }],
    signatureMove: { ...normalizedSignature, effectPackets: normalizedSignature.effectPackets.map((packet) => ({ ...packet, id: undefined })) },
  });
  assert(preparedIds.powers[0]?.id, "Persistence preparation should backfill a missing ordinary power ID.");
  assert(preparedIds.signatureMove?.effectPackets[0]?.id, "Persistence preparation should backfill a missing signature packet ID.");
  const reorderedPackets = [...ordinary.effectPackets].reverse();
  const reordered = normalizeCharacterPower({ ...ordinary, name: "Renamed without identity loss", effectPackets: reorderedPackets }, 0);
  assert(reordered.id === ordinary.id, "Rename should preserve ordinary power identity.");
  assert(reordered.effectPackets[0]?.id === reorderedPackets[0]?.id, "Packet reorder should preserve packet identity.");
  assert(
    getCharacterBuilderThreeFieldAugmentDebuffPublicWriteError({
      powers: [{ ...ordinary, effectPackets: [{ ...ordinary.effectPackets[0], intention: "AUGMENT", type: "AUGMENT", targetedAttribute: "GUARD", modifier: 3 }] }],
    }) === THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR,
    "Character save should reject non-null Modifier while Phase 1 authoring is disabled.",
  );
}

console.log("Character Power Builder smoke passed.");
