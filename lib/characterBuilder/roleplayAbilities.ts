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
    { value: "ENABLE_MOVEMENT", label: "Enable Movement" },
  ],
} as const satisfies Record<RoleplayIntention, readonly RoleplayOption[]>;

export type RoleplaySpecific =
  (typeof ROLEPLAY_SPECIFIC_OPTIONS)[RoleplayIntention][number]["value"];

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

export const ROLEPLAY_OUTPUT_CATEGORY_OPTIONS = [
  { value: "SCENE_INFLUENCE", label: "Scene Influence" },
  { value: "REVEAL", label: "Reveal" },
  { value: "ACTION_ENABLE", label: "Action Enable" },
  { value: "REROLL_DICE_SUPPORT", label: "Reroll / Dice Support" },
  {
    value: "TEMPORARY_IGNORE_PUSH_THROUGH",
    label: "Temporary Ignore / Push Through",
  },
  { value: "POSITION_RESCUE", label: "Position / Rescue" },
  { value: "MOMENTUM_HESITATION", label: "Momentum / Hesitation" },
] as const;

export type RoleplayOutputCategory =
  (typeof ROLEPLAY_OUTPUT_CATEGORY_OPTIONS)[number]["value"];

export const ROLEPLAY_OUTPUT_SUBTYPE_OPTIONS = {
  SCENE_INFLUENCE: [{ value: "SHIFT_SCENE_STATE", label: "Shift Scene State" }],
  REVEAL: [{ value: "REVEAL_USEFUL_TRUTH", label: "Reveal Useful Truth" }],
  ACTION_ENABLE: [{ value: "ENABLE_BOUNDED_ACTION", label: "Enable Bounded Action" }],
  REROLL_DICE_SUPPORT: [{ value: "SUPPORT_ROLL", label: "Support Roll" }],
  TEMPORARY_IGNORE_PUSH_THROUGH: [{ value: "PUSH_THROUGH", label: "Push Through" }],
  POSITION_RESCUE: [{ value: "REPOSITION_RESCUE", label: "Reposition / Rescue" }],
  MOMENTUM_HESITATION: [
    { value: "CREATE_OPENING", label: "Create Opening" },
    { value: "DENY_HOSTILE_ACTION", label: "Deny Hostile Action" },
  ],
} as const satisfies Record<RoleplayOutputCategory, readonly RoleplayOption[]>;

export type RoleplayOutputSubtype =
  (typeof ROLEPLAY_OUTPUT_SUBTYPE_OPTIONS)[RoleplayOutputCategory][number]["value"];

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
  sceneImpact: RoleplaySceneImpact;
  scope: RoleplayScope;
  diceCount: RoleplayDiceCount;
  outputCategory: RoleplayOutputCategory;
  outputSubtype: RoleplayOutputSubtype;
  counter: boolean;
  crisisAssist: boolean;
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
  return options.some((option) => option.value === value) ? (value as T[number]["value"]) : fallback;
}

export function getRoleplaySpecificOptions(intention: RoleplayIntention) {
  return ROLEPLAY_SPECIFIC_OPTIONS[intention];
}

export function getRoleplayOutputSubtypeOptions(category: RoleplayOutputCategory) {
  return ROLEPLAY_OUTPUT_SUBTYPE_OPTIONS[category];
}

export function createDefaultRoleplayAbility(sortOrder: number): RoleplayAbility {
  return {
    id: `roleplay-ability-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    sortOrder,
    name: "",
    description: "",
    intention: "PERSUASION",
    specific: "ENCOURAGE",
    sceneImpact: "MINOR",
    scope: "ONE_TARGET",
    diceCount: 1,
    outputCategory: "SCENE_INFLUENCE",
    outputSubtype: "SHIFT_SCENE_STATE",
    counter: false,
    crisisAssist: false,
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
  const outputCategory = readOption(
    record.outputCategory,
    ROLEPLAY_OUTPUT_CATEGORY_OPTIONS,
    ROLEPLAY_OUTPUT_CATEGORY_OPTIONS[0].value,
  );
  const outputSubtypeOptions = getRoleplayOutputSubtypeOptions(outputCategory);
  const numericDiceCount = Number(record.diceCount);
  const diceCount = ROLEPLAY_DICE_COUNT_OPTIONS.includes(
    numericDiceCount as RoleplayDiceCount,
  )
    ? (numericDiceCount as RoleplayDiceCount)
    : ROLEPLAY_DICE_COUNT_OPTIONS[0];

  return {
    id: readString(record.id, 120) || `roleplay-ability-${sortOrder + 1}`,
    sortOrder,
    name: readString(record.name, 120),
    description: readString(record.description, 2000),
    intention,
    specific: readOption(record.specific, specificOptions, specificOptions[0].value),
    sceneImpact: readOption(
      record.sceneImpact,
      ROLEPLAY_SCENE_IMPACT_OPTIONS,
      ROLEPLAY_SCENE_IMPACT_OPTIONS[0].value,
    ),
    scope: readOption(record.scope, ROLEPLAY_SCOPE_OPTIONS, "ONE_TARGET"),
    diceCount,
    outputCategory,
    outputSubtype: readOption(
      record.outputSubtype,
      outputSubtypeOptions,
      outputSubtypeOptions[0].value,
    ),
    counter: record.counter === true,
    crisisAssist: record.crisisAssist === true,
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
    restrictionTag: readString(record.restrictionTag, 120),
    restrictionText: readString(record.restrictionText, 1000),
  };
}

export function normalizeRoleplayAbilities(value: unknown): RoleplayAbility[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeRoleplayAbility);
}

function optionLabel(options: readonly RoleplayOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function scopePhrase(scope: RoleplayScope) {
  if (scope === "SELF") return "yourself";
  if (scope === "ONE_TARGET") return "one target";
  if (scope === "SMALL_GROUP") return "a small group of targets";
  if (scope === "LARGE_GROUP") return "a large group of targets";
  return "a faction or army";
}

function renderDenyHostileActionDescriptor(ability: RoleplayAbility) {
  if (ability.scope === "ONE_TARGET") {
    const targetLabel =
      ability.restrictionType === "TARGET_ELIGIBILITY" && ability.restrictionTag.trim()
        ? ability.restrictionTag.trim()
        : "target";
    return `Choose one ${targetLabel} and roll ${ability.diceCount} dice. On success, interrupt its current or next hostile action; that action is spent with no effect.`;
  }

  if (ability.scope === "SELF") {
    return `Choose yourself and roll ${ability.diceCount} dice. On success, interrupt your current or next hostile action; that action is spent with no effect.`;
  }

  return `Choose ${scopePhrase(ability.scope)} and roll ${ability.diceCount} dice. On success, interrupt each target's current or next hostile action; those actions are spent with no effect.`;
}

export function renderRoleplayAbilityDescriptor(ability: RoleplayAbility): string {
  if (ability.outputSubtype === "DENY_HOSTILE_ACTION") {
    return renderDenyHostileActionDescriptor(ability);
  }

  const impactLabel = optionLabel(ROLEPLAY_SCENE_IMPACT_OPTIONS, ability.sceneImpact);
  const categoryLabel = optionLabel(ROLEPLAY_OUTPUT_CATEGORY_OPTIONS, ability.outputCategory);
  return `Choose ${scopePhrase(ability.scope)} and roll ${ability.diceCount} dice. On success, resolve a ${impactLabel} ${categoryLabel} effect within the GD's declared limits.`;
}

export function getRoleplayAbilityResultWindow(ability: RoleplayAbility) {
  return ability.outputSubtype === "DENY_HOSTILE_ACTION"
    ? "Current or next hostile action"
    : "Defined by output subtype";
}

export function getRoleplayAbilityWarnings(ability: RoleplayAbility): string[] {
  const warnings: string[] = [];
  if (ability.outputSubtype !== "DENY_HOSTILE_ACTION") {
    warnings.push("This output subtype uses a prototype fallback descriptor.");
    return warnings;
  }

  if (ability.outputCategory !== "MOMENTUM_HESITATION") {
    warnings.push("Deny Hostile Action requires the Momentum / Hesitation output category.");
  }
  if (ability.sceneImpact !== "MAJOR" && ability.sceneImpact !== "LEGENDARY") {
    warnings.push("Deny Hostile Action requires Major or Legendary Scene Impact.");
  }
  if (ability.sceneImpact === "MAJOR" && ability.scope !== "ONE_TARGET") {
    warnings.push("At Major Scene Impact, Deny Hostile Action must use One Target scope.");
  }
  if (
    (ability.scope === "SMALL_GROUP" ||
      ability.scope === "LARGE_GROUP" ||
      ability.scope === "FACTION_ARMY") &&
    ability.sceneImpact !== "LEGENDARY"
  ) {
    warnings.push("Group-scale Deny Hostile Action requires Legendary Scene Impact.");
  }
  return warnings;
}
