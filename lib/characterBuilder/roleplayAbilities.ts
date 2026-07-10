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

export const ROLEPLAY_METHOD_UNSELECTED = "UNSELECTED" as const;
export const ROLEPLAY_METHOD_CUSTOM_REVIEW = "CUSTOM_REVIEW" as const;

export type RoleplayStandardMethodId =
  | "RESCUE"
  | "INTERRUPT"
  | "CHALLENGE"
  | "DISCERN_TRUTH";

export type RoleplayMethodId =
  | RoleplayStandardMethodId
  | typeof ROLEPLAY_METHOD_UNSELECTED
  | typeof ROLEPLAY_METHOD_CUSTOM_REVIEW;

export type RoleplayMethodDefinition = {
  id: RoleplayStandardMethodId;
  name: string;
  intention: RoleplayIntention;
  definition: string;
  legalApproaches: readonly string[];
  exclusions: readonly string[];
};

export const ROLEPLAY_METHODS = [
  {
    id: "RESCUE",
    name: "Rescue",
    intention: "INTERVENTION",
    definition:
      "Protect or secure a target from immediate danger by warning, guiding, sheltering, distracting, interposing, or exploiting a plausible route to safety.",
    legalApproaches: [
      "Warn or signal imminent danger",
      "Reveal nearby cover, concealment, or an escape opportunity",
      "Create a protective distraction or opening",
      "Interpose where fictionally possible",
      "Guide or coordinate an immediate rescue",
      "Exploit the environment or social situation to secure safety",
    ],
    exclusions: [
      "Does not directly restore Health or treat Injury.",
      "Does not remove quantified stacks, units, fields, attachments, or active powers.",
      "Does not grant another action.",
      "Does not move a measured distance.",
      "Does not teleport or force impossible relocation.",
      "Does not deny an impending hostile act unless the selected Outcome Contract explicitly grants that result.",
    ],
  },
  {
    id: "INTERRUPT",
    name: "Interrupt",
    intention: "INTERVENTION",
    definition:
      "Intervene at the moment of a meaningful impending act to stop, spoil, or break that act before it resolves.",
    legalApproaches: [
      "Issue a decisive command or defiance",
      "Create a timely distraction",
      "Physically interpose where fictionally possible",
      "Disrupt concentration or preparation",
      "Invoke authority, an oath, a symbol, or a known weakness",
      "Reveal something at the decisive moment",
    ],
    exclusions: [
      "Does not suppress every future action.",
      "Does not remove passive effects.",
      "Does not remove existing stacks, units, fields, attachments, or active powers.",
      "Does not permanently incapacitate.",
      "Does not become Block, Dodge, Resist, or Cleanse.",
      "Does not automatically reveal or interrupt a hidden or unperceived act.",
    ],
  },
  {
    id: "CHALLENGE",
    name: "Challenge",
    intention: "INTIMIDATION",
    definition:
      "Confront a target openly to contest its courage, authority, attention, reputation, or willingness to oppose you.",
    legalApproaches: [
      "Issue a direct challenge",
      "Openly defy the target",
      "Appeal to honour, pride, duty, or reputation",
      "Provoke the target",
      "Make a public stand",
      "Declare a personal rivalry",
      "Take responsibility for an accusation or confrontation",
    ],
    exclusions: [
      "Does not create hostility where none exists.",
      "Does not compel the target to perform a hostile act.",
      "Does not make the Ability user a valid target.",
      "Does not force movement, range, or impossible actions.",
      "Does not alter rolls or quantified output.",
      "Does not create Control stacks.",
      "Does not automatically override unrelated duties, loyalties, or objectives.",
    ],
  },
  {
    id: "DISCERN_TRUTH",
    name: "Discern Truth",
    intention: "PERCEPTION",
    definition:
      "Learn concealed information through observation, deduction, evidence, intuition, behavioural tells, contradictions, or another perceptive insight.",
    legalApproaches: [
      "Study body language, hesitation, or emotional reactions",
      "Compare statements for contradiction",
      "Inspect evidence or physical details",
      "Notice omissions, avoidance, or unusual emphasis",
      "Connect previously discovered clues",
      "Use intuitive, spiritual, magical, or supernatural perception where supported by the Narrative Theme and current fiction",
    ],
    exclusions: [
      "Does not compel speech, confession, or cooperation.",
      "Does not force the target to deliberately reveal information.",
      "Does not read thoughts or memories unless a separate contract or Power permits it.",
      "Does not publicly expose the truth.",
      "Does not create evidence.",
      "Does not force other characters to believe the truth.",
      "Does not reveal unrelated facts merely because they are secret.",
      "Does not mechanically alter the target.",
    ],
  },
] as const satisfies readonly RoleplayMethodDefinition[];

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
  | "DENY_IMMINENT_HOSTILE_ACT"
  | "DRAW_HOSTILE_ATTENTION";

export type RoleplayOutcomeContractId =
  | RoleplayStandardOutcomeContractId
  | typeof ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED
  | typeof ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW;

export type RoleplayOutcomeContractAuthoring = {
  intention: RoleplayIntention;
  methodId: RoleplayMethodId;
  sceneImpact: RoleplaySceneImpact;
  scope: RoleplayScope;
};

export type RoleplayOutcomeContractVariant = {
  authoring: RoleplayOutcomeContractAuthoring;
  successOutcome: string;
  counterEligible: boolean;
  privilegeCostKey: string;
  examples?: readonly string[];
  exclusions?: readonly string[];
};

export type RoleplayOutcomeContractDefinition = {
  id: RoleplayStandardOutcomeContractId;
  name: string;
  outcomeLane: RoleplayOutcomeLane;
  variants: readonly RoleplayOutcomeContractVariant[];
  examples: readonly string[];
  exclusions: readonly string[];
};

export const ROLEPLAY_OUTCOME_CONTRACTS = [
  {
    id: "HIDE_FROM_IMMEDIATE_DANGER",
    name: "Hide from Immediate Danger",
    outcomeLane: "HELP",
    variants: [
      {
        authoring: {
          intention: "INTERVENTION",
          methodId: "RESCUE",
          sceneImpact: "MINOR",
          scope: "ONE_TARGET",
        },
        successOutcome: "the target becomes hidden from the immediate danger",
        counterEligible: false,
        privilegeCostKey: "HIDE_FROM_IMMEDIATE_DANGER",
      },
    ],
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
    variants: [
      {
        authoring: {
          intention: "INTERVENTION",
          methodId: "INTERRUPT",
          sceneImpact: "MAJOR",
          scope: "ONE_TARGET",
        },
        successOutcome: "the target's current or next hostile action fails",
        counterEligible: true,
        privilegeCostKey: "DENY_IMMINENT_HOSTILE_ACT",
      },
    ],
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
  {
    id: "DRAW_HOSTILE_ATTENTION",
    name: "Draw Hostile Attention",
    outcomeLane: "HINDER",
    variants: [
      {
        authoring: {
          intention: "INTIMIDATION",
          methodId: "CHALLENGE",
          sceneImpact: "MINOR",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "the next time the target acts with hostility, it must direct that hostility at you, if you are a valid target",
        counterEligible: false,
        privilegeCostKey: "DRAW_HOSTILE_ATTENTION_MINOR",
      },
      {
        authoring: {
          intention: "INTIMIDATION",
          methodId: "CHALLENGE",
          sceneImpact: "STANDARD",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "until the end of the target's next turn in combat, or the end of the current meaningful exchange outside combat, whenever the target acts with hostility, it must direct that hostility at you, if you are a valid target",
        counterEligible: false,
        privilegeCostKey: "DRAW_HOSTILE_ATTENTION_STANDARD",
      },
      {
        authoring: {
          intention: "INTIMIDATION",
          methodId: "CHALLENGE",
          sceneImpact: "MAJOR",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "for the rest of the current scene, whenever the target acts with hostility, it must direct that hostility at you, if you are a valid target",
        counterEligible: false,
        privilegeCostKey: "DRAW_HOSTILE_ATTENTION_MAJOR",
      },
      {
        authoring: {
          intention: "INTIMIDATION",
          methodId: "CHALLENGE",
          sceneImpact: "LEGENDARY",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "the target recognises you as its personal rival until the rivalry is narratively resolved",
        counterEligible: false,
        privilegeCostKey: "DRAW_HOSTILE_ATTENTION_LEGENDARY",
      },
    ],
    examples: [
      "Challenging an enemy warrior to focus on you",
      "Drawing an accusation away from an ally in court",
      "Making yourself the focus of hostile questioning",
      "Confronting a political rival",
      "Establishing an enduring personal rivalry at Legendary Impact",
    ],
    exclusions: [
      "Does not create hostility where none exists.",
      "Does not compel the target to perform a hostile act.",
      "Does not make you a valid target.",
      "Does not force movement or create range.",
      "Does not force impossible or illegal actions.",
      "Does not alter rolls or quantified output.",
      "Does not create Control stacks.",
      "Does not prevent area or multi-target actions from affecting others where normally legal.",
      "Does not prevent immediate self-preservation.",
      "Does not automatically affect a group.",
      "Legendary creates rivalry rather than permanent mechanical domination.",
    ],
  },
] as const satisfies readonly RoleplayOutcomeContractDefinition[];

export type RoleplayAbility = {
  id: string;
  sortOrder: number;
  name: string;
  narrativeTheme: string;
  intention: RoleplayIntention;
  methodId: RoleplayMethodId;
  customMethodName: string;
  customMethodRequest: string;
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
  "intention" | "methodId" | "sceneImpact" | "scope"
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

function readMethodId(value: unknown): RoleplayMethodId | null {
  if (
    value === ROLEPLAY_METHOD_UNSELECTED ||
    value === ROLEPLAY_METHOD_CUSTOM_REVIEW ||
    ROLEPLAY_METHODS.some((method) => method.id === value)
  ) {
    return value as RoleplayMethodId;
  }
  return null;
}

const LEGACY_SPECIFIC_LABELS: Readonly<Record<string, string>> = {
  ENCOURAGE: "Encourage",
  COMMAND: "Command",
  APPEAL: "Appeal",
  RALLY: "Rally",
  NEGOTIATE: "Negotiate",
  PLEAD: "Plead",
  INSPIRE: "Inspire",
  REASSURE: "Reassure",
  INVOKE_AUTHORITY: "Invoke Authority",
  BUILD_TRUST: "Build Trust",
  THREATEN: "Threaten",
  DEFY: "Defy",
  OVERAWE: "Overawe",
  CHALLENGE: "Challenge",
  SUPPRESS: "Suppress",
  TERRIFY: "Terrify",
  SHAME: "Shame",
  BREAK_RESOLVE: "Break Resolve",
  DISTRACT: "Distract",
  LIE: "Lie",
  MISDIRECT: "Misdirect",
  FEINT: "Feint",
  DISGUISE_INTENT: "Disguise Intent",
  FALSE_IDENTITY: "False Identity",
  BAIT: "Bait",
  CONFUSE: "Confuse",
  SEARCH: "Search",
  READ_INTENT: "Read Intent",
  SPOT_WEAKNESS: "Spot Weakness",
  TRACK: "Track",
  INVESTIGATE: "Investigate",
  SENSE_DANGER: "Sense Danger",
  DISCERN_TRUTH: "Discern Truth",
  REVELATION: "Revelation",
  RESCUE: "Rescue",
  ENABLE_MOVEMENT: "Rescue",
  PULL_FREE: "Pull Free",
  SHIELD_WITH_BODY: "Shield With Body",
  INTERRUPT: "Interrupt",
  EXTRACT: "Extract",
  CATCH: "Catch",
  STABILISE: "Stabilise",
};

function readableLegacySpecific(value: string) {
  return LEGACY_SPECIFIC_LABELS[value] ??
    value
      .toLocaleLowerCase("en")
      .split("_")
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toLocaleUpperCase("en")}${part.slice(1)}`)
      .join(" ");
}

function normalizeOutcomeForMigration(value: string) {
  return value
    .trim()
    .replace(/[‘’]/gu, "'")
    .replace(/[.!?]+$/u, "")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en");
}

export function getRoleplayMethodDefinition(
  id: unknown,
): RoleplayMethodDefinition | null {
  return ROLEPLAY_METHODS.find((method) => method.id === id) ?? null;
}

export function getRoleplayMethodsForIntention(intention: RoleplayIntention) {
  return ROLEPLAY_METHODS.filter((method) => method.intention === intention);
}

export function isRoleplayMethodCompatibleWithIntention(
  method: RoleplayMethodDefinition,
  intention: RoleplayIntention,
) {
  return method.intention === intention;
}

export function getRoleplayAbilityMethodName(ability: RoleplayAbility) {
  if (ability.methodId === ROLEPLAY_METHOD_CUSTOM_REVIEW) {
    return ability.customMethodName.trim() || "Custom Method — Review Required";
  }
  return getRoleplayMethodDefinition(ability.methodId)?.name ?? "No Method";
}

export function getRoleplayOutcomeContract(
  id: unknown,
): RoleplayOutcomeContractDefinition | null {
  return ROLEPLAY_OUTCOME_CONTRACTS.find((contract) => contract.id === id) ?? null;
}

export function getRoleplayOutcomeContractVariant(
  contract: RoleplayOutcomeContractDefinition,
  authoring: RoleplayAbilityAuthoring,
): RoleplayOutcomeContractVariant | null {
  return contract.variants.find(
    (variant) =>
      variant.authoring.intention === authoring.intention &&
      variant.authoring.methodId === authoring.methodId &&
      variant.authoring.sceneImpact === authoring.sceneImpact &&
      variant.authoring.scope === authoring.scope,
  ) ?? null;
}

export function isRoleplayOutcomeContractCompatible(
  contract: RoleplayOutcomeContractDefinition,
  authoring: RoleplayAbilityAuthoring,
) {
  return getRoleplayOutcomeContractVariant(contract, authoring) !== null;
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
  const contract = getRoleplayOutcomeContract(ability.outcomeContractId);
  if (contract) {
    return getRoleplayOutcomeContractVariant(contract, ability)?.successOutcome ?? "";
  }
  return ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW
    ? ability.customOutcomeRequest
    : "";
}

export function getRoleplayAbilityContractName(ability: RoleplayAbility) {
  if (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW) {
    return "Custom Outcome — Review Required";
  }
  return getRoleplayOutcomeContract(ability.outcomeContractId)?.name ?? "No Outcome Contract";
}

export function getRoleplayAbilityCounterEligibility(ability: RoleplayAbility) {
  if (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW) {
    if (ability.methodId === ROLEPLAY_METHOD_UNSELECTED) return false;
    if (ability.methodId === ROLEPLAY_METHOD_CUSTOM_REVIEW) {
      return ability.customOutcomeRequest.trim().length > 0;
    }
    return true;
  }
  const contract = getRoleplayOutcomeContract(ability.outcomeContractId);
  return contract
    ? (getRoleplayOutcomeContractVariant(contract, ability)?.counterEligible ?? false)
    : false;
}

export function reconcileRoleplayAbilityContract(ability: RoleplayAbility): RoleplayAbility {
  if (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW) return ability;
  if (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED) {
    return ability.counter ? { ...ability, counter: false } : ability;
  }

  const contract = getRoleplayOutcomeContract(ability.outcomeContractId);
  const variant = contract
    ? getRoleplayOutcomeContractVariant(contract, ability)
    : null;
  if (!contract || !variant) {
    return {
      ...ability,
      outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
      counter: false,
    };
  }
  if (!variant.counterEligible && ability.counter) {
    return { ...ability, counter: false };
  }
  return ability;
}

export function reconcileRoleplayAbilityMethod(ability: RoleplayAbility): RoleplayAbility {
  if (ability.methodId === ROLEPLAY_METHOD_UNSELECTED) {
    return {
      ...ability,
      outcomeContractId: getRoleplayOutcomeContract(ability.outcomeContractId)
        ? ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED
        : ability.outcomeContractId,
      counter: false,
    };
  }

  if (ability.methodId === ROLEPLAY_METHOD_CUSTOM_REVIEW) {
    const standardContractSelected = getRoleplayOutcomeContract(
      ability.outcomeContractId,
    );
    const outcomeContractId = standardContractSelected
      ? ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED
      : ability.outcomeContractId;
    const customOutcomeRequested =
      outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW &&
      ability.customOutcomeRequest.trim().length > 0;
    return {
      ...ability,
      outcomeContractId,
      counter: customOutcomeRequested ? ability.counter : false,
    };
  }

  const method = getRoleplayMethodDefinition(ability.methodId);
  if (!method || !isRoleplayMethodCompatibleWithIntention(method, ability.intention)) {
    return {
      ...ability,
      methodId: ROLEPLAY_METHOD_UNSELECTED,
      outcomeContractId: getRoleplayOutcomeContract(ability.outcomeContractId)
        ? ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED
        : ability.outcomeContractId,
      counter: false,
    };
  }
  return ability;
}

export function reconcileRoleplayAbilityAuthoring(
  ability: RoleplayAbility,
): RoleplayAbility {
  return reconcileRoleplayAbilityContract(reconcileRoleplayAbilityMethod(ability));
}

export function createDefaultRoleplayAbility(sortOrder: number): RoleplayAbility {
  return {
    id: `roleplay-ability-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    sortOrder,
    name: "",
    narrativeTheme: "",
    intention: "PERSUASION",
    methodId: ROLEPLAY_METHOD_UNSELECTED,
    customMethodName: "",
    customMethodRequest: "",
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
  const hasStoredMethod = Object.hasOwn(record, "methodId");
  const storedMethodId = hasStoredMethod ? readMethodId(record.methodId) : null;
  const legacySpecific = readString(record.specific, 120);
  let methodId: RoleplayMethodId;
  let customMethodName = readString(record.customMethodName, 120);
  const customMethodRequest = readString(record.customMethodRequest, 1000);
  if (hasStoredMethod) {
    const rawStoredMethodId = readString(record.methodId, 120);
    if (storedMethodId) {
      methodId = storedMethodId;
    } else if (rawStoredMethodId) {
      methodId = ROLEPLAY_METHOD_CUSTOM_REVIEW;
      customMethodName ||= readableLegacySpecific(rawStoredMethodId);
    } else {
      methodId = ROLEPLAY_METHOD_UNSELECTED;
    }
  } else {
    const legacyStandardMethod =
      legacySpecific === "ENABLE_MOVEMENT" ? "RESCUE" : readMethodId(legacySpecific);
    if (
      legacyStandardMethod &&
      legacyStandardMethod !== ROLEPLAY_METHOD_UNSELECTED &&
      legacyStandardMethod !== ROLEPLAY_METHOD_CUSTOM_REVIEW
    ) {
      methodId = legacyStandardMethod;
    } else if (legacySpecific) {
      methodId = ROLEPLAY_METHOD_CUSTOM_REVIEW;
      customMethodName ||= readableLegacySpecific(legacySpecific);
    } else {
      methodId = ROLEPLAY_METHOD_UNSELECTED;
    }
  }
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
  const authoring = { intention, methodId, sceneImpact, scope };

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
      const matchingContract = ROLEPLAY_OUTCOME_CONTRACTS.find((contract) =>
        contract.variants.some(
          (variant) =>
            normalizeOutcomeForMigration(variant.successOutcome) === normalizedLegacyOutcome,
        ),
      );
      if (matchingContract && isRoleplayOutcomeContractCompatible(matchingContract, authoring)) {
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

  return reconcileRoleplayAbilityAuthoring({
    id: readString(record.id, 120) || `roleplay-ability-${sortOrder + 1}`,
    sortOrder,
    name: readString(record.name, 120),
    narrativeTheme: Object.hasOwn(record, "narrativeTheme")
      ? readString(record.narrativeTheme, 2000)
      : readString(record.description, 2000),
    intention,
    methodId,
    customMethodName,
    customMethodRequest,
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
  if (!ability.narrativeTheme.trim()) warnings.push("Narrative Theme is required.");
  if (ability.methodId === ROLEPLAY_METHOD_UNSELECTED) {
    warnings.push("Method is required.");
  }
  if (ability.methodId === ROLEPLAY_METHOD_CUSTOM_REVIEW) {
    warnings.push("Custom Method requires Game Director approval.");
    warnings.push(
      "Automatic standard Outcome Contract matching is unavailable for a Custom Method.",
    );
    if (!ability.customMethodName.trim()) {
      warnings.push("Proposed Method Name is required for Game Director review.");
    }
    if (!ability.customMethodRequest.trim()) {
      warnings.push("Custom Method Request is required for Game Director review.");
    }
  } else {
    const method = getRoleplayMethodDefinition(ability.methodId);
    if (method && !isRoleplayMethodCompatibleWithIntention(method, ability.intention)) {
      warnings.push("The selected Method is incompatible with the current Intention.");
    }
  }
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
  const variant = contract
    ? getRoleplayOutcomeContractVariant(contract, ability)
    : null;
  if (contract && !isRoleplayOutcomeContractCompatible(contract, ability)) {
    warnings.push(
      "The selected Outcome Contract is incompatible with the current Intention, Method, Scene Impact, or Scope.",
    );
  }
  if (contract && ability.counter && !variant?.counterEligible) {
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
