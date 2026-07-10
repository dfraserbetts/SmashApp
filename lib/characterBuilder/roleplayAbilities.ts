export type RoleplayOption<T extends string = string> = {
  value: T;
  label: string;
};

export const ROLEPLAY_INTENTION_OPTIONS = [
  { value: "PERSUASION", label: "Persuasion" },
  { value: "INTIMIDATION", label: "Intimidation" },
  { value: "DECEPTION", label: "Deception" },
  { value: "PERCEPTION", label: "Perception" },
  { value: "INTERVENTION", label: "Intervention" },
] as const;

export type RoleplayIntention = (typeof ROLEPLAY_INTENTION_OPTIONS)[number]["value"];

export const ROLEPLAY_SPECIFIC_OPTIONS = {
  PERSUASION: [
    { value: "ENCOURAGE", label: "Encourage" },
    { value: "COMMAND", label: "Command" },
    { value: "APPEAL", label: "Appeal" },
    { value: "RALLY", label: "Rally" },
    { value: "NEGOTIATE", label: "Negotiate" },
    { value: "PLEAD", label: "Plead" },
    { value: "INSPIRE", label: "Inspire" },
    { value: "REASSURE", label: "Reassure" },
    { value: "INVOKE_AUTHORITY", label: "Invoke Authority" },
    { value: "BUILD_TRUST", label: "Build Trust" },
  ],
  INTIMIDATION: [
    { value: "THREATEN", label: "Threaten" },
    { value: "DEFY", label: "Defy" },
    { value: "OVERAWE", label: "Overawe" },
    { value: "CHALLENGE", label: "Challenge" },
    { value: "SUPPRESS", label: "Suppress" },
    { value: "TERRIFY", label: "Terrify" },
    { value: "SHAME", label: "Shame" },
    { value: "BREAK_RESOLVE", label: "Break Resolve" },
  ],
  DECEPTION: [
    { value: "DISTRACT", label: "Distract" },
    { value: "LIE", label: "Lie" },
    { value: "MISDIRECT", label: "Misdirect" },
    { value: "FEINT", label: "Feint" },
    { value: "DISGUISE_INTENT", label: "Disguise Intent" },
    { value: "FALSE_IDENTITY", label: "False Identity" },
    { value: "BAIT", label: "Bait" },
    { value: "CONFUSE", label: "Confuse" },
  ],
  PERCEPTION: [
    { value: "SEARCH", label: "Search" },
    { value: "READ_INTENT", label: "Read Intent" },
    { value: "SPOT_WEAKNESS", label: "Spot Weakness" },
    { value: "TRACK", label: "Track" },
    { value: "INVESTIGATE", label: "Investigate" },
    { value: "SENSE_DANGER", label: "Sense Danger" },
    { value: "DISCERN_TRUTH", label: "Discern Truth" },
    { value: "REVELATION", label: "Revelation" },
  ],
  INTERVENTION: [
    { value: "RESCUE", label: "Rescue" },
    { value: "PULL_FREE", label: "Pull Free" },
    { value: "SHIELD_WITH_BODY", label: "Shield With Body" },
    { value: "INTERRUPT", label: "Interrupt" },
    { value: "EXTRACT", label: "Extract" },
    { value: "CATCH", label: "Catch" },
    { value: "STABILISE", label: "Stabilise" },
  ],
} as const satisfies Record<RoleplayIntention, readonly RoleplayOption[]>;

export type RoleplaySpecific =
  (typeof ROLEPLAY_SPECIFIC_OPTIONS)[RoleplayIntention][number]["value"];

export const ROLEPLAY_OUTCOME_LANE_OPTIONS = [
  { value: "HELP", label: "Help" },
  { value: "HINDER", label: "Hinder" },
] as const;

export type RoleplayOutcomeLane =
  (typeof ROLEPLAY_OUTCOME_LANE_OPTIONS)[number]["value"];

export const ROLEPLAY_SCENE_IMPACT_OPTIONS = [
  { value: "MINOR", label: "Minor" },
  { value: "STANDARD", label: "Standard" },
  { value: "MAJOR", label: "Major" },
  { value: "LEGENDARY", label: "Legendary" },
] as const;

export type RoleplaySceneImpact =
  (typeof ROLEPLAY_SCENE_IMPACT_OPTIONS)[number]["value"];

export const ROLEPLAY_SCOPE_OPTIONS = [
  { value: "SELF", label: "Self" },
  { value: "ONE_TARGET", label: "One Target" },
  { value: "SMALL_GROUP", label: "Small Group" },
  { value: "LARGE_GROUP", label: "Large Group" },
  { value: "FACTION_ARMY", label: "Faction / Army" },
] as const;

export type RoleplayScope = (typeof ROLEPLAY_SCOPE_OPTIONS)[number]["value"];

export const ROLEPLAY_DICE_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;
export type RoleplayDiceCount = (typeof ROLEPLAY_DICE_COUNT_OPTIONS)[number];

export const ROLEPLAY_RESTRICTION_TYPE_OPTIONS = [
  { value: "NONE", label: "None" },
  { value: "TARGET_ELIGIBILITY", label: "Target Eligibility" },
  { value: "CIRCUMSTANCE", label: "Circumstance" },
  { value: "OATH_BEHAVIOUR", label: "Oath / Behaviour" },
  { value: "SCENE_STATE", label: "Scene State" },
  { value: "RESOURCE_STATE", label: "Resource State" },
] as const;

export type RoleplayRestrictionType =
  (typeof ROLEPLAY_RESTRICTION_TYPE_OPTIONS)[number]["value"];

export const ROLEPLAY_RESTRICTION_BAND_OPTIONS = [
  { value: "NONE_COSMETIC", label: "None / Cosmetic" },
  { value: "LIGHT", label: "Light" },
  { value: "MODERATE", label: "Moderate" },
  { value: "HARSH", label: "Harsh" },
  { value: "SEVERE_OATH", label: "Severe / Oath" },
] as const;

export type RoleplayRestrictionBand =
  (typeof ROLEPLAY_RESTRICTION_BAND_OPTIONS)[number]["value"];

export type RoleplayAbility = {
  id: string;
  sortOrder: number;
  name: string;
  description: string;
  intention: RoleplayIntention;
  specific: RoleplaySpecific;
  outcomeLane: RoleplayOutcomeLane;
  successOutcome: string;
  sceneImpact: RoleplaySceneImpact;
  scope: RoleplayScope;
  diceCount: RoleplayDiceCount;
  counter: boolean;
  restrictionType: RoleplayRestrictionType;
  restrictionBand: RoleplayRestrictionBand;
  restrictionTag: string;
  restrictionText: string;
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function readOption<const T extends readonly RoleplayOption[]>(
  value: unknown,
  options: T,
  fallback: T[number]["value"],
): T[number]["value"] {
  return options.some((option) => option.value === value)
    ? (value as T[number]["value"])
    : fallback;
}

export function getRoleplaySpecificOptions(intention: RoleplayIntention) {
  return ROLEPLAY_SPECIFIC_OPTIONS[intention];
}

export function createDefaultRoleplayAbility(sortOrder: number): RoleplayAbility {
  return {
    id: `roleplay-ability-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    sortOrder,
    name: "",
    description: "",
    intention: "PERSUASION",
    specific: "ENCOURAGE",
    outcomeLane: "HELP",
    successOutcome: "",
    sceneImpact: "MINOR",
    scope: "ONE_TARGET",
    diceCount: 1,
    counter: false,
    restrictionType: "NONE",
    restrictionBand: "NONE_COSMETIC",
    restrictionTag: "",
    restrictionText: "",
  };
}

export function normalizeRoleplayAbility(value: unknown, sortOrder: number): RoleplayAbility {
  const record = readRecord(value);
  const intention = readOption(
    record.intention,
    ROLEPLAY_INTENTION_OPTIONS,
    ROLEPLAY_INTENTION_OPTIONS[0].value,
  );
  const specificOptions = getRoleplaySpecificOptions(intention);
  const legacyDenyHostileAction = record.outputSubtype === "DENY_HOSTILE_ACTION";
  const rawSpecific = record.specific === "ENABLE_MOVEMENT" ? "RESCUE" : record.specific;
  const numericDiceCount = Number(record.diceCount);
  const diceCount = ROLEPLAY_DICE_COUNT_OPTIONS.includes(
    numericDiceCount as RoleplayDiceCount,
  )
    ? (numericDiceCount as RoleplayDiceCount)
    : ROLEPLAY_DICE_COUNT_OPTIONS[0];
  const storedRestrictionTag = readString(record.restrictionTag, 120);
  const restrictionTag =
    legacyDenyHostileAction &&
    storedRestrictionTag &&
    !/^one\s+/i.test(storedRestrictionTag)
      ? `one ${storedRestrictionTag}`
      : storedRestrictionTag;

  return {
    id: readString(record.id, 120) || `roleplay-ability-${sortOrder + 1}`,
    sortOrder,
    name: readString(record.name, 120),
    description: readString(record.description, 2000),
    intention,
    specific: readOption(rawSpecific, specificOptions, specificOptions[0].value),
    outcomeLane: legacyDenyHostileAction
      ? "HINDER"
      : readOption(record.outcomeLane, ROLEPLAY_OUTCOME_LANE_OPTIONS, "HELP"),
    successOutcome: legacyDenyHostileAction
      ? "the target's current or next hostile action fails"
      : readString(record.successOutcome, 1000),
    sceneImpact: readOption(
      record.sceneImpact,
      ROLEPLAY_SCENE_IMPACT_OPTIONS,
      ROLEPLAY_SCENE_IMPACT_OPTIONS[0].value,
    ),
    scope: readOption(record.scope, ROLEPLAY_SCOPE_OPTIONS, "ONE_TARGET"),
    diceCount,
    counter: record.counter === true,
    restrictionType: readOption(
      record.restrictionType,
      ROLEPLAY_RESTRICTION_TYPE_OPTIONS,
      "NONE",
    ),
    restrictionBand: readOption(
      record.restrictionBand,
      ROLEPLAY_RESTRICTION_BAND_OPTIONS,
      "NONE_COSMETIC",
    ),
    restrictionTag,
    restrictionText: readString(record.restrictionText, 1000),
  };
}

export function normalizeRoleplayAbilities(value: unknown): RoleplayAbility[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeRoleplayAbility);
}

function defaultTargetPhrase(scope: RoleplayScope) {
  if (scope === "ONE_TARGET") return "one target";
  if (scope === "SMALL_GROUP") return "a small group of targets";
  if (scope === "LARGE_GROUP") return "a large group of targets";
  return "a faction or army";
}

function renderSuccessOutcome(successOutcome: string) {
  const trimmed = successOutcome.trim() || "[define the success outcome]";
  return `${trimmed.replace(/[.!?]+$/u, "").trimEnd()}.`;
}

export function renderRoleplayAbilityDescriptor(ability: RoleplayAbility): string {
  const rollClause = `roll ${ability.diceCount} dice`;
  const outcomeClause = renderSuccessOutcome(ability.successOutcome);
  if (ability.scope === "SELF") {
    return `Roll ${ability.diceCount} dice. On success, ${outcomeClause}`;
  }

  const restrictedTargetPhrase =
    ability.restrictionType === "TARGET_ELIGIBILITY"
      ? ability.restrictionTag.trim()
      : "";
  const targetPhrase = restrictedTargetPhrase || defaultTargetPhrase(ability.scope);
  return `Choose ${targetPhrase} and ${rollClause}. On success, ${outcomeClause}`;
}

export function getRoleplayAbilityWarnings(ability: RoleplayAbility): string[] {
  const warnings: string[] = [];
  if (!ability.name.trim()) warnings.push("Name is required.");
  if (!ability.description.trim()) warnings.push("Description is required.");
  if (!ability.successOutcome.trim()) warnings.push("Success Outcome is required.");
  if (
    ability.restrictionType === "TARGET_ELIGIBILITY" &&
    !ability.restrictionTag.trim()
  ) {
    warnings.push("Target Eligibility requires a Restricted target phrase.");
  }
  if (
    ability.restrictionType !== "NONE" &&
    ability.restrictionBand === "NONE_COSMETIC"
  ) {
    warnings.push(
      "This restriction uses the None / Cosmetic band and currently earns no meaningful restriction discount.",
    );
  }
  return warnings;
}
