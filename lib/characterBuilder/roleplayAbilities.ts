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

export const ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED = "UNSELECTED" as const;
export const ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW = "CUSTOM_REVIEW" as const;

export type RoleplayStandardOutcomeContractId =
  | "HIDE_FROM_IMMEDIATE_DANGER"
  | "DENY_IMMINENT_HOSTILE_ACT";

export type RoleplayOutcomeContractId =
  | RoleplayStandardOutcomeContractId
  | typeof ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED
  | typeof ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW;

export type RoleplayOutcomeContractAuthoring = {
  intention: RoleplayIntention;
  specific: RoleplaySpecific;
  sceneImpact: RoleplaySceneImpact;
  scope: RoleplayScope;
};

export type RoleplayOutcomeContractDefinition = {
  id: RoleplayStandardOutcomeContractId;
  name: string;
  outcomeLane: RoleplayOutcomeLane;
  successOutcome: string;
  compatibleAuthoring: readonly RoleplayOutcomeContractAuthoring[];
  counterEligible: boolean;
  privilegeCostKey: string;
  examples: readonly string[];
  exclusions: readonly string[];
};

export const ROLEPLAY_OUTCOME_CONTRACTS = [
  {
    id: "HIDE_FROM_IMMEDIATE_DANGER",
    name: "Hide from Immediate Danger",
    outcomeLane: "HELP",
    successOutcome: "the target becomes hidden from the immediate danger",
    compatibleAuthoring: [
      {
        intention: "INTERVENTION",
        specific: "RESCUE",
        sceneImpact: "MINOR",
        scope: "ONE_TARGET",
      },
    ],
    counterEligible: false,
    privilegeCostKey: "HIDE_FROM_IMMEDIATE_DANGER",
    examples: [
      "Diving between ruined stones",
      "Disappearing into a crowd",
      "Being covered by concealing mist",
      "Slipping beneath a wagon",
      "A companion creating a distraction",
    ],
    exclusions: [
      "Does not grant permanent invisibility.",
      "Does not hide the target from every creature in the scene.",
      "Does not end an entire encounter.",
      "Does not remove existing quantified effects.",
      "Does not move the target a measured distance.",
      "Does not grant another action.",
      "Does not require an additional Hide, movement, or defence roll.",
    ],
  },
  {
    id: "DENY_IMMINENT_HOSTILE_ACT",
    name: "Deny Imminent Hostile Act",
    outcomeLane: "HINDER",
    successOutcome: "the target's current or next hostile action fails",
    compatibleAuthoring: [
      {
        intention: "INTERVENTION",
        specific: "INTERRUPT",
        sceneImpact: "MAJOR",
        scope: "ONE_TARGET",
      },
    ],
    counterEligible: true,
    privilegeCostKey: "DENY_IMMINENT_HOSTILE_ACT",
    examples: ["Stopping an imminent hostile act before it resolves"],
    exclusions: [
      "Does not permanently incapacitate the target.",
      "Does not cancel passive effects.",
      "Does not remove existing stacks, units, fields, attachments, or active powers.",
      "Does not prevent every action for the scene.",
      "Does not become ordinary Block, Dodge, Resist, or Cleanse.",
      "Does not automatically affect a group.",
    ],
  },
] as const satisfies readonly RoleplayOutcomeContractDefinition[];

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
  outcomeContractId: RoleplayOutcomeContractId;
  customOutcomeLane: RoleplayOutcomeLane;
  customOutcomeRequest: string;
  counter: boolean;
  restrictionType: RoleplayRestrictionType;
  restrictionBand: RoleplayRestrictionBand;
  restrictionTag: string;
  restrictionText: string;
};

type RoleplayAbilityAuthoring = Pick<
  RoleplayAbility,
  "intention" | "specific" | "sceneImpact" | "scope"
>;

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

function readOutcomeContractId(value: unknown): RoleplayOutcomeContractId | null {
  if (
    value === ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED ||
    value === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW ||
    ROLEPLAY_OUTCOME_CONTRACTS.some((contract) => contract.id === value)
  ) {
    return value as RoleplayOutcomeContractId;
  }
  return null;
}

function normalizeOutcomeForMigration(value: string) {
  return value
    .trim()
    .replace(/[‘’]/gu, "'")
    .replace(/[.!?]+$/u, "")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en");
}

export function getRoleplaySpecificOptions(intention: RoleplayIntention) {
  return ROLEPLAY_SPECIFIC_OPTIONS[intention];
}

export function getRoleplayOutcomeContract(id: unknown) {
  return ROLEPLAY_OUTCOME_CONTRACTS.find((contract) => contract.id === id) ?? null;
}

export function isRoleplayOutcomeContractCompatible(
  contract: RoleplayOutcomeContractDefinition,
  authoring: RoleplayAbilityAuthoring,
) {
  return contract.compatibleAuthoring.some(
    (compatible) =>
      compatible.intention === authoring.intention &&
      compatible.specific === authoring.specific &&
      compatible.sceneImpact === authoring.sceneImpact &&
      compatible.scope === authoring.scope,
  );
}

export function getCompatibleRoleplayOutcomeContracts(authoring: RoleplayAbilityAuthoring) {
  return ROLEPLAY_OUTCOME_CONTRACTS.filter((contract) =>
    isRoleplayOutcomeContractCompatible(contract, authoring),
  );
}

export function getRoleplayAbilityOutcomeLane(ability: RoleplayAbility) {
  return getRoleplayOutcomeContract(ability.outcomeContractId)?.outcomeLane ??
    ability.customOutcomeLane;
}

export function getRoleplayAbilitySuccessOutcome(ability: RoleplayAbility) {
  return getRoleplayOutcomeContract(ability.outcomeContractId)?.successOutcome ??
    (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW
      ? ability.customOutcomeRequest
      : "");
}

export function getRoleplayAbilityContractName(ability: RoleplayAbility) {
  if (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW) {
    return "Custom Outcome — Review Required";
  }
  return getRoleplayOutcomeContract(ability.outcomeContractId)?.name ?? "No Outcome Contract";
}

export function getRoleplayAbilityCounterEligibility(ability: RoleplayAbility) {
  if (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW) return true;
  return getRoleplayOutcomeContract(ability.outcomeContractId)?.counterEligible ?? false;
}

export function reconcileRoleplayAbilityContract(ability: RoleplayAbility): RoleplayAbility {
  if (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW) return ability;
  if (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED) {
    return ability.counter ? { ...ability, counter: false } : ability;
  }

  const contract = getRoleplayOutcomeContract(ability.outcomeContractId);
  if (!contract || !isRoleplayOutcomeContractCompatible(contract, ability)) {
    return {
      ...ability,
      outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
      counter: false,
    };
  }
  if (!contract.counterEligible && ability.counter) {
    return { ...ability, counter: false };
  }
  return ability;
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
    outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    customOutcomeLane: "HELP",
    customOutcomeRequest: "",
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
  const rawSpecific = record.specific === "ENABLE_MOVEMENT" ? "RESCUE" : record.specific;
  const specific = readOption(rawSpecific, specificOptions, specificOptions[0].value);
  const sceneImpact = readOption(
    record.sceneImpact,
    ROLEPLAY_SCENE_IMPACT_OPTIONS,
    ROLEPLAY_SCENE_IMPACT_OPTIONS[0].value,
  );
  const scope = readOption(record.scope, ROLEPLAY_SCOPE_OPTIONS, "ONE_TARGET");
  const numericDiceCount = Number(record.diceCount);
  const diceCount = ROLEPLAY_DICE_COUNT_OPTIONS.includes(
    numericDiceCount as RoleplayDiceCount,
  )
    ? (numericDiceCount as RoleplayDiceCount)
    : ROLEPLAY_DICE_COUNT_OPTIONS[0];
  const legacyDenyHostileAction = record.outputSubtype === "DENY_HOSTILE_ACTION";
  const legacySuccessOutcome =
    readString(record.successOutcome, 1000) ||
    (legacyDenyHostileAction
      ? "the target's current or next hostile action fails"
      : "");
  const legacyOutcomeLane = readOption(
    record.outcomeLane,
    ROLEPLAY_OUTCOME_LANE_OPTIONS,
    legacyDenyHostileAction ? "HINDER" : "HELP",
  );
  const storedContractId = readOutcomeContractId(record.outcomeContractId);
  const authoring = { intention, specific, sceneImpact, scope };

  let outcomeContractId = storedContractId;
  let customOutcomeLane = readOption(
    record.customOutcomeLane,
    ROLEPLAY_OUTCOME_LANE_OPTIONS,
    legacyOutcomeLane,
  );
  let customOutcomeRequest = readString(record.customOutcomeRequest, 1000);

  if (!outcomeContractId) {
    if (!legacySuccessOutcome) {
      outcomeContractId = ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED;
    } else {
      const normalizedLegacyOutcome = normalizeOutcomeForMigration(legacySuccessOutcome);
      const matchingContract = ROLEPLAY_OUTCOME_CONTRACTS.find(
        (contract) =>
          normalizeOutcomeForMigration(contract.successOutcome) === normalizedLegacyOutcome,
      );
      if (
        matchingContract &&
        isRoleplayOutcomeContractCompatible(matchingContract, authoring)
      ) {
        outcomeContractId = matchingContract.id;
      } else {
        outcomeContractId = ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW;
        customOutcomeLane = legacyOutcomeLane;
        customOutcomeRequest = legacySuccessOutcome;
      }
    }
  } else if (outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW) {
    customOutcomeRequest ||= legacySuccessOutcome;
  }

  const storedRestrictionTag = readString(record.restrictionTag, 120);
  const restrictionTag =
    legacyDenyHostileAction &&
    storedRestrictionTag &&
    !/^one\s+/i.test(storedRestrictionTag)
      ? `one ${storedRestrictionTag}`
      : storedRestrictionTag;

  return reconcileRoleplayAbilityContract({
    id: readString(record.id, 120) || `roleplay-ability-${sortOrder + 1}`,
    sortOrder,
    name: readString(record.name, 120),
    description: readString(record.description, 2000),
    intention,
    specific,
    sceneImpact,
    scope,
    diceCount,
    outcomeContractId,
    customOutcomeLane,
    customOutcomeRequest,
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
  });
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

function renderOutcomeText(value: string, placeholder: string) {
  const trimmed = value.trim() || placeholder;
  return `${trimmed.replace(/[.!?]+$/u, "").trimEnd()}.`;
}

export function renderRoleplayAbilityDescriptor(ability: RoleplayAbility): string {
  const successOutcome = getRoleplayAbilitySuccessOutcome(ability);
  const placeholder =
    ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW
      ? "[define the custom outcome request]"
      : "[select an outcome contract]";
  const outcomeClause = renderOutcomeText(successOutcome, placeholder);
  const rollClause = `roll ${ability.diceCount} dice`;
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
  if (!ability.description.trim()) warnings.push("Theme / Description is required.");
  if (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED) {
    warnings.push("Outcome Contract is required.");
  }
  if (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW) {
    warnings.push(
      "Custom Outcome requires Game Director approval and cannot be automatically costed.",
    );
    if (!ability.customOutcomeRequest.trim()) {
      warnings.push("Custom Outcome Request is required for Game Director review.");
    }
  }

  const contract = getRoleplayOutcomeContract(ability.outcomeContractId);
  if (contract && !isRoleplayOutcomeContractCompatible(contract, ability)) {
    warnings.push(
      "The selected Outcome Contract is incompatible with the current Intention, Specific, Scene Impact, or Scope.",
    );
  }
  if (contract && ability.counter && !contract.counterEligible) {
    warnings.push("The selected Outcome Contract does not permit Counter authoring.");
  }
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
