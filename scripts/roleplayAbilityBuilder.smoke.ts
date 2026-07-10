import {
  createDefaultRoleplayAbility,
  getRoleplayAbilityWarnings,
  normalizeRoleplayAbility,
  renderRoleplayAbilityDescriptor,
} from "../lib/characterBuilder/roleplayAbilities";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${String(expected)}\nActual: ${String(actual)}`);
  }
}

const legacyYouShallNotPass = normalizeRoleplayAbility(
  {
    name: "You Shall Not Pass",
    description: "Gandalf bars the enemy's advance.",
    intention: "INTERVENTION",
    specific: "INTERRUPT",
    sceneImpact: "MAJOR",
    scope: "ONE_TARGET",
    diceCount: 4,
    outputCategory: "MOMENTUM_HESITATION",
    outputSubtype: "DENY_HOSTILE_ACTION",
    crisisAssist: true,
    restrictionType: "TARGET_ELIGIBILITY",
    restrictionBand: "HARSH",
    restrictionTag: "Agent of Morgoth",
  },
  0,
);

assertEqual(
  legacyYouShallNotPass.outcomeLane,
  "HINDER",
  "Legacy Deny Hostile Action should migrate to Hinder.",
);
assertEqual(
  legacyYouShallNotPass.successOutcome,
  "the target's current or next hostile action fails",
  "Legacy Deny Hostile Action should receive the locked Success Outcome.",
);
assertEqual(
  legacyYouShallNotPass.restrictionTag,
  "one Agent of Morgoth",
  "Legacy Deny Hostile Action should migrate its restricted target phrase.",
);
assert(
  !Object.hasOwn(legacyYouShallNotPass, "outputCategory"),
  "Normalized legacy data must not retain outputCategory.",
);
assert(
  !Object.hasOwn(legacyYouShallNotPass, "outputSubtype"),
  "Normalized legacy data must not retain outputSubtype.",
);
assert(
  !Object.hasOwn(legacyYouShallNotPass, "crisisAssist"),
  "Normalized legacy data must not retain crisisAssist.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(legacyYouShallNotPass),
  "Choose one Agent of Morgoth and roll 4 dice. On success, the target's current or next hostile action fails.",
  "Legacy You Shall Not Pass descriptor mismatch.",
);

const frodoHide = normalizeRoleplayAbility(
  {
    name: "Frodo Hide!",
    description: "The warning sends Frodo diving out of sight.",
    intention: "INTERVENTION",
    specific: "RESCUE",
    outcomeLane: "HELP",
    successOutcome: "the target becomes hidden from the immediate danger",
    sceneImpact: "MINOR",
    scope: "ONE_TARGET",
    diceCount: 3,
    restrictionType: "TARGET_ELIGIBILITY",
    restrictionBand: "HARSH",
    restrictionTag: "Frodo",
  },
  1,
);

assertEqual(
  renderRoleplayAbilityDescriptor(frodoHide),
  "Choose Frodo and roll 3 dice. On success, the target becomes hidden from the immediate danger.",
  "Frodo Hide descriptor mismatch.",
);

const blankOutcome = createDefaultRoleplayAbility(2);
assert(
  renderRoleplayAbilityDescriptor(blankOutcome).includes("[define the success outcome]"),
  "Blank Success Outcome descriptor should display its authoring placeholder.",
);
assert(
  getRoleplayAbilityWarnings(blankOutcome).some((warning) =>
    warning.includes("Success Outcome"),
  ),
  "Blank Success Outcome should produce a warning.",
);

const legacyEnableMovement = normalizeRoleplayAbility(
  {
    intention: "INTERVENTION",
    specific: "ENABLE_MOVEMENT",
  },
  3,
);
assertEqual(
  legacyEnableMovement.specific,
  "RESCUE",
  "Legacy ENABLE_MOVEMENT should normalize to RESCUE.",
);

console.log("PASS roleplay ability builder smoke");
