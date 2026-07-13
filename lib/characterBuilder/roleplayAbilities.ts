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
  | "APPEAL"
  | "RALLY"
  | "MISDIRECT"
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
    id: "APPEAL",
    name: "Appeal",
    intention: "PERSUASION",
    definition:
      "Persuade a target by connecting a clear request to their values, interests, loyalties, emotions, relationships, duties, or understanding of the situation.",
    legalApproaches: [
      "Present a reasoned argument",
      "Make an emotional appeal",
      "Establish shared interest or mutual benefit",
      "Appeal to compassion or mercy",
      "Invoke duty or responsibility",
      "Offer an honest compromise or negotiated concession",
      "Invoke a relationship, promise, value, or common cause",
      "Honestly explain the likely consequences of a choice",
    ],
    exclusions: [
      "Does not rely primarily on threats or fear.",
      "Does not rely on deliberate lies or concealed falsehoods.",
      "Does not use supernatural control or domination.",
      "Does not create comprehension, agency, or capability where none exists.",
      "Does not manufacture love, devotion, intimacy, or consent.",
      "Does not grant open-ended authority over future decisions.",
      "Does not create permanent general obedience.",
      "Does not automatically bind anyone other than the selected target.",
      "Does not make every request eligible merely because Scene Impact is high.",
      "Does not guarantee that the requested task ultimately succeeds.",
    ],
  },
  {
    id: "RALLY",
    name: "Rally",
    intention: "PERSUASION",
    definition:
      "Unite a bounded group around one clear shared course by invoking common purpose, courage, duty, identity, hope, urgency, or mutual reliance.",
    legalApproaches: [
      "Call attention to a common purpose",
      "Remind the group of shared duty or identity",
      "Present one clear immediate plan",
      "Reinforce courage through example",
      "Frame the stakes around people who depend on the group",
      "Restore focus amid panic, confusion, or disagreement",
      "Invoke solidarity or mutual reliance",
      "Turn competing reactions toward one honest collective priority",
    ],
    exclusions: [
      "Does not rely primarily on threats or fear.",
      "Does not rely on deliberate lies or concealed falsehoods.",
      "Does not use supernatural control or domination.",
      "Does not create a shared purpose where no coherent common basis exists.",
      "Does not grant open-ended command authority or general obedience.",
      "Does not erase individual identity, values, priorities, or judgement.",
      "Does not dictate identical tactics, movement, or actions.",
      "Does not grant extra actions, measured movement, quantified bonuses, or immunities.",
      "Does not remove quantified fear, Control stacks, conditions, attachments, fields, or active powers.",
      "Does not automatically affect anyone outside the selected group.",
      "Does not resolve unrelated disputes or disagreements.",
      "Does not guarantee that the shared course succeeds.",
      "Does not make high Difficulty or Legendary Impact legalise an incoherent course.",
    ],
  },
  {
    id: "MISDIRECT",
    name: "Misdirect",
    intention: "DECEPTION",
    definition:
      "Lead a target toward a false or materially misleading conclusion through direct falsehood, omission, implication, distraction, selective truth, staged cues, or deceptive framing.",
    legalApproaches: [
      "Tell a plausible direct lie",
      "Omit a decisive fact to produce a false conclusion",
      "Redirect attention toward a false explanation",
      "Frame true evidence misleadingly",
      "Imply authority, innocence, danger, or normality that does not exist",
      "Use an existing disguise, prop, document, reputation, or environmental cue deceptively",
      "Present selective information to lead the target toward the wrong conclusion",
      "Stage behaviour or circumstances to support a false interpretation",
    ],
    exclusions: [
      "Does not use supernatural domination or control.",
      "Does not rewrite memories.",
      "Does not create comprehension, perception, agency, or capability where none exists.",
      "Does not make an impossible or internally incoherent premise believable.",
      "Does not overcome conclusive knowledge already possessed by the target.",
      "Does not create physical evidence, documents, disguises, credentials, or authority that do not exist.",
      "Does not compel a particular action or emotional response.",
      "Does not automatically deceive anyone other than the selected target.",
      "Does not establish an unlimited collection of separate false claims.",
      "Does not guarantee that every inference drawn from the premise benefits the Ability user.",
      "Does not make high Difficulty or Legendary Impact legalise an ineligible premise.",
    ],
  },
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
  | "DRAW_HOSTILE_ATTENTION"
  | "UNCOVER_CONCEALED_TRUTH"
  | "REVEAL_EXPLOITABLE_WEAKNESS"
  | "SECURE_WILLING_COOPERATION"
  | "ESTABLISH_SHARED_RESOLVE"
  | "ESTABLISH_FALSE_BELIEF";

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
  {
    id: "UNCOVER_CONCEALED_TRUTH",
    name: "Uncover Concealed Truth",
    outcomeLane: "HELP",
    variants: [
      {
        authoring: {
          intention: "PERCEPTION",
          methodId: "DISCERN_TRUTH",
          sceneImpact: "MINOR",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "you learn whether the target is concealing something relevant to the immediate situation and, if so, its general nature; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed",
        counterEligible: false,
        privilegeCostKey: "UNCOVER_CONCEALED_TRUTH_MINOR",
      },
      {
        authoring: {
          intention: "PERCEPTION",
          methodId: "DISCERN_TRUTH",
          sceneImpact: "STANDARD",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "you learn one useful concealed truth about the target relevant to the immediate situation; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed",
        counterEligible: false,
        privilegeCostKey: "UNCOVER_CONCEALED_TRUTH_STANDARD",
      },
      {
        authoring: {
          intention: "PERCEPTION",
          methodId: "DISCERN_TRUTH",
          sceneImpact: "MAJOR",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "you learn a central concealed truth about the target that is shaping the current situation; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed",
        counterEligible: false,
        privilegeCostKey: "UNCOVER_CONCEALED_TRUTH_MAJOR",
      },
      {
        authoring: {
          intention: "PERCEPTION",
          methodId: "DISCERN_TRUTH",
          sceneImpact: "LEGENDARY",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "you learn a defining concealed truth about the target whose significance extends beyond the current scene; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed",
        counterEligible: false,
        privilegeCostKey: "UNCOVER_CONCEALED_TRUTH_LEGENDARY",
      },
    ],
    examples: [
      "Noticing that a witness is hiding fear of a particular person",
      "Realising that a negotiator is deliberately stalling for time",
      "Discovering that an official is secretly protecting someone",
      "Uncovering the concealed allegiance shaping a target's current actions",
      "Learning a defining truth about a target's identity, origin, oath, or loyalty whose significance extends beyond the current scene",
    ],
    exclusions: [
      "Does not compel speech, confession, cooperation, or testimony.",
      "Does not force the target deliberately to reveal information.",
      "Does not read thoughts or memories.",
      "Does not publicly expose the truth.",
      "Does not create physical evidence or proof.",
      "Does not force anyone else to believe the information.",
      "Does not reveal every secret held by or connected to the target.",
      "Does not reveal every implication or surrounding detail of the learned truth.",
      "Does not reveal unrelated facts merely because they are secret.",
      "Does not mechanically alter the target.",
      "Does not grant quantified bonuses or penalties.",
      "Does not bypass normal target access, the Discern Truth Method, Narrative Theme, or fictional plausibility.",
      "Does not permit a false, speculative, vague, or deliberately misleading answer.",
      "Does not allow the player to choose among several qualifying truths; the Game Director selects one that satisfies the chosen variant.",
      "Does not permit the Game Director to return the no-truth result when a qualifying concealed truth exists.",
      "Does not permit the Game Director to answer an accepted specific subject of investigation with an unrelated truth.",
    ],
  },
  {
    id: "REVEAL_EXPLOITABLE_WEAKNESS",
    name: "Reveal Exploitable Weakness",
    outcomeLane: "HELP",
    variants: [
      {
        authoring: {
          intention: "PERCEPTION",
          methodId: "DISCERN_TRUTH",
          sceneImpact: "MINOR",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "you identify one small immediately useful weakness, opening, or opportunity concerning the target for the current meaningful exchange; if no qualifying exploitable opportunity exists, you learn that none is presently accessible",
        counterEligible: false,
        privilegeCostKey: "REVEAL_EXPLOITABLE_WEAKNESS_MINOR",
      },
      {
        authoring: {
          intention: "PERCEPTION",
          methodId: "DISCERN_TRUTH",
          sceneImpact: "STANDARD",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "you identify one useful exploitable weakness, route, pattern, dependency, or leverage point concerning the target for the current situation; if no qualifying exploitable opportunity exists, you learn that none is presently accessible",
        counterEligible: false,
        privilegeCostKey: "REVEAL_EXPLOITABLE_WEAKNESS_STANDARD",
      },
      {
        authoring: {
          intention: "PERCEPTION",
          methodId: "DISCERN_TRUTH",
          sceneImpact: "MAJOR",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "you reveal one central exploitable vulnerability or opportunity concerning the target that is shaping the current scene and can materially change how it is approached; if no qualifying exploitable opportunity exists, you learn that none is presently accessible",
        counterEligible: false,
        privilegeCostKey: "REVEAL_EXPLOITABLE_WEAKNESS_MAJOR",
      },
      {
        authoring: {
          intention: "PERCEPTION",
          methodId: "DISCERN_TRUTH",
          sceneImpact: "LEGENDARY",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "you reveal one defining vulnerability, hidden route, dependency, or leverage point concerning the target whose significance extends beyond the current scene; if no qualifying exploitable opportunity exists, you learn that none is presently accessible",
        counterEligible: false,
        privilegeCostKey: "REVEAL_EXPLOITABLE_WEAKNESS_LEGENDARY",
      },
    ],
    examples: [
      "Noticing one loose fastening during the current exchange",
      "Identifying the brief moment when a creature's attention shifts",
      "Seeing smoke being drawn through a concealed vent",
      "Spotting one unstable foothold",
      "Noticing that a guard repeatedly checks one doorway",
      "Identifying that a ritual depends on an exposed focus",
      "Finding the service route that bypasses the watched entrance",
      "Recognising the repeated opening in a creature's attack pattern",
      "Discovering that a gate mechanism can be jammed at one specific point",
      "Learning that an enemy plan depends on one messenger arriving",
      "Revealing the central support whose failure would fundamentally alter the current battlefield",
      "Discovering that an attacking force's coordination depends on one visible signalling system",
      "Identifying the principal anchor sustaining a magical catastrophe",
      "Revealing the decisive logistical dependency shaping the current crisis",
      "Finding the route that could transform the party's approach to the whole current scene",
      "Revealing the defining oath-bound flaw in an ancient defence",
      "Discovering the hidden route on which a fortress's long-term survival depends",
      "Identifying the foundational dependency sustaining a legendary creature's apparent invulnerability",
      "Uncovering the leverage point on which a long-running hostile plan rests",
      "Revealing a defining structural or strategic vulnerability whose importance continues beyond the current scene",
    ],
    exclusions: [
      "Does not automatically exploit the revealed opportunity.",
      "Does not guarantee that a future attempt to use the opportunity succeeds.",
      "Does not automatically defeat, destroy, control, disable, or bypass the target.",
      "Does not create wounds, healing, Block, Dodge, Resist, Control stacks, conditions, penalties, bonuses, actions, movement, or another quantified Power output.",
      "Does not create or modify an existing mechanical vulnerability.",
      "Does not create an impossible or internally incoherent weakness, route, dependency, pattern, or leverage point.",
      "Does not contradict established fiction.",
      "Does not reveal every weakness, route, dependency, or possible solution.",
      "Does not provide a complete plan for exploiting the result.",
      "Does not automatically provide required equipment, access, authority, capability, evidence, or resources.",
      "Does not automatically expose the information publicly or force anyone else to believe it.",
      "Does not allow one nominal target to substitute for a diffuse crowd, multiple unrelated subjects, a faction, an army, or another broader Scope.",
      "Does not bypass target access, Discern Truth, Narrative Theme, Scene Impact, Scope, or fictional plausibility.",
      "Does not permit the Game Director to answer an accepted practical subject with an unrelated secret or piece of trivia.",
      "Does not permit the Game Director to return no qualifying opportunity merely because no opportunity was prepared in advance or because the result inconveniences the planned plot.",
      "Does not allow Difficulty or Legendary Impact to legalise an invalid target or impossible investigation.",
    ],
  },
  {
    id: "SECURE_WILLING_COOPERATION",
    name: "Secure Willing Cooperation",
    outcomeLane: "HELP",
    variants: [
      {
        authoring: {
          intention: "PERSUASION",
          methodId: "APPEAL",
          sceneImpact: "MINOR",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "the target willingly complies with one small immediate request requiring negligible sacrifice, risk, or commitment",
        counterEligible: false,
        privilegeCostKey: "SECURE_WILLING_COOPERATION_MINOR",
      },
      {
        authoring: {
          intention: "PERSUASION",
          methodId: "APPEAL",
          sceneImpact: "STANDARD",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "the target willingly agrees to and sincerely carries out one meaningful request involving inconvenience, social cost, or modest personal risk",
        counterEligible: false,
        privilegeCostKey: "SECURE_WILLING_COOPERATION_STANDARD",
      },
      {
        authoring: {
          intention: "PERSUASION",
          methodId: "APPEAL",
          sceneImpact: "MAJOR",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "the target willingly commits to and sincerely pursues one difficult request involving substantial effort, personal cost, reputational danger, or physical risk",
        counterEligible: false,
        privilegeCostKey: "SECURE_WILLING_COOPERATION_MAJOR",
      },
      {
        authoring: {
          intention: "PERSUASION",
          methodId: "APPEAL",
          sceneImpact: "LEGENDARY",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "the target willingly makes one defining commitment, alliance, or promise whose consequences extend beyond the current scene and sincerely upholds it until it is fulfilled or narratively resolved",
        counterEligible: false,
        privilegeCostKey: "SECURE_WILLING_COOPERATION_LEGENDARY",
      },
    ],
    examples: [
      "Waiting briefly while the Ability user speaks to someone",
      "Passing along a harmless message",
      "Granting a meeting or temporary access",
      "Sheltering someone at substantial personal risk",
      "Testifying against a dangerous patron",
      "Joining an alliance for a coming war",
      "Swearing to protect a community",
      "Reconciling with a former enemy and upholding a defined peace",
    ],
    exclusions: [
      "Does not grant open-ended authority over the target.",
      "Does not create permanent general obedience.",
      "Does not apply to unspecified future requests.",
      "Does not manufacture love, devotion, intimacy, or consent.",
      "Does not remove the target's identity or independent judgement.",
      "Does not make an impossible request possible.",
      "Does not create comprehension, agency, authority, or capability.",
      "Does not automatically compel anyone other than the selected target.",
      "Does not guarantee successful completion of the requested task.",
      "Does not permit deliberate sabotage, false cooperation, or technical evasion of the accepted request.",
      "Does not extend beyond the one request accepted before Difficulty was set.",
      "Does not make an ineligible request legal through high Difficulty or Legendary Impact.",
      "Does not prevent legitimate narrative resolution.",
      "Does not permit arbitrary cancellation merely because cooperation becomes inconvenient for the Game Director or planned plot.",
    ],
  },
  {
    id: "ESTABLISH_SHARED_RESOLVE",
    name: "Establish Shared Resolve",
    outcomeLane: "HELP",
    variants: [
      {
        authoring: {
          intention: "PERSUASION",
          methodId: "RALLY",
          sceneImpact: "MINOR",
          scope: "SMALL_GROUP",
        },
        successOutcome:
          "the selected group steadies around one simple immediate course and sincerely pursues it through the current meaningful exchange despite ordinary hesitation, confusion, or pressure",
        counterEligible: false,
        privilegeCostKey: "ESTABLISH_SHARED_RESOLVE_MINOR",
      },
      {
        authoring: {
          intention: "PERSUASION",
          methodId: "RALLY",
          sceneImpact: "STANDARD",
          scope: "SMALL_GROUP",
        },
        successOutcome:
          "the selected group adopts one clear shared course as its immediate priority for the rest of the current scene and sincerely pursues it despite meaningful fear, confusion, disagreement, or pressure",
        counterEligible: false,
        privilegeCostKey: "ESTABLISH_SHARED_RESOLVE_STANDARD",
      },
      {
        authoring: {
          intention: "PERSUASION",
          methodId: "RALLY",
          sceneImpact: "MAJOR",
          scope: "SMALL_GROUP",
        },
        successOutcome:
          "the selected group commits to one difficult shared course for the rest of the current scene and sincerely pursues it despite serious fear, division, personal cost, or danger unless decisive circumstances or narrative resolution make that course no longer coherent",
        counterEligible: false,
        privilegeCostKey: "ESTABLISH_SHARED_RESOLVE_MAJOR",
      },
      {
        authoring: {
          intention: "PERSUASION",
          methodId: "RALLY",
          sceneImpact: "LEGENDARY",
          scope: "SMALL_GROUP",
        },
        successOutcome:
          "the selected group forms one defining shared resolve, pledge, or cause whose consequences extend beyond the current scene and sincerely upholds it until it is fulfilled or narratively resolved",
        counterEligible: false,
        privilegeCostKey: "ESTABLISH_SHARED_RESOLVE_LEGENDARY",
      },
    ],
    examples: [
      "Frightened civilians stay together through one immediate escape",
      "A confused patrol regroups around one simple instruction",
      "Companions stop arguing long enough to complete one immediate task",
      "A rescue team steadies through one dangerous exchange",
      "Defenders hold a position for the current scene",
      "A group completes an evacuation despite meaningful fear",
      "A divided council acts together on one immediate plan",
      "Witnesses maintain a united stance through sustained pressure",
      "Defenders continue a dangerous rescue despite serious personal risk",
      "Divided companions commit to saving captives before pursuing revenge",
      "Witnesses stand together against a powerful retaliatory threat",
      "A patrol maintains one difficult course despite severe internal division",
      "A fellowship pledges itself to a defining mission",
      "A small council commits to a lasting resistance",
      "Former rivals form and uphold a defining shared cause",
      "A sworn band adopts a commitment extending beyond the current scene",
    ],
    exclusions: [
      "Does not grant open-ended command authority over the group.",
      "Does not create permanent general obedience.",
      "Does not apply to unspecified future commands or courses.",
      "Does not establish more than one bounded shared course.",
      "Does not dictate identical tactics, actions, movement, or resource use.",
      "Does not remove individual identity, values, priorities, or judgement.",
      "Does not grant extra actions or measured movement.",
      "Does not grant quantified bonuses, penalties, or immunities.",
      "Does not remove quantified fear, Control stacks, conditions, attachments, fields, or active powers.",
      "Does not guarantee that the shared course succeeds.",
      "Does not automatically bind people outside the accepted group.",
      "Does not automatically bind later arrivals or replacement members.",
      "Does not automatically propagate through leadership, testimony, reputation, or institutional authority.",
      "Does not convert a Small Group into a Large Group, faction, or army.",
      "Does not settle unrelated conflicts or disagreements.",
      "Does not permit false participation, deliberate sabotage, or technical evasion of the accepted course.",
      "Does not make an ineligible course legal through high Difficulty or Legendary Impact.",
      "Does not prevent legitimate narrative resolution.",
      "Does not permit arbitrary cancellation because the outcome inconveniences the Game Director or planned plot.",
    ],
  },
  {
    id: "ESTABLISH_FALSE_BELIEF",
    name: "Establish False Belief",
    outcomeLane: "HINDER",
    variants: [
      {
        authoring: {
          intention: "DECEPTION",
          methodId: "MISDIRECT",
          sceneImpact: "MINOR",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "the target accepts one small and immediately plausible false premise as true for the current meaningful exchange and treats it as true when making relevant decisions",
        counterEligible: false,
        privilegeCostKey: "ESTABLISH_FALSE_BELIEF_MINOR",
      },
      {
        authoring: {
          intention: "DECEPTION",
          methodId: "MISDIRECT",
          sceneImpact: "STANDARD",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "the target genuinely accepts one plausible false premise relevant to the current situation as true for the rest of the current scene and treats it as true when making relevant decisions unless meaningful contradictory evidence resolves the belief",
        counterEligible: false,
        privilegeCostKey: "ESTABLISH_FALSE_BELIEF_STANDARD",
      },
      {
        authoring: {
          intention: "DECEPTION",
          methodId: "MISDIRECT",
          sceneImpact: "MAJOR",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "the target genuinely accepts one central false premise shaping the current situation as true for the rest of the current scene and continues to treat it as true when making relevant decisions unless decisive contradictory evidence, direct experience, or narrative resolution ends the belief",
        counterEligible: false,
        privilegeCostKey: "ESTABLISH_FALSE_BELIEF_MAJOR",
      },
      {
        authoring: {
          intention: "DECEPTION",
          methodId: "MISDIRECT",
          sceneImpact: "LEGENDARY",
          scope: "ONE_TARGET",
        },
        successOutcome:
          "the target genuinely accepts one defining false premise whose consequences extend beyond the current scene as true and treats it as true when making relevant decisions until it is decisively disproved or narratively resolved",
        counterEligible: false,
        privilegeCostKey: "ESTABLISH_FALSE_BELIEF_LEGENDARY",
      },
    ],
    examples: [
      "The noise came from outside",
      "The package belongs to someone else",
      "The character is permitted to wait here briefly",
      "A minor procedural mistake has already been corrected",
      "The character is an authorised visitor",
      "The suspect left through another exit",
      "The meeting has been moved",
      "The current danger has a harmless explanation",
      "An ally is uninvolved in the immediate crime",
      "A trusted lieutenant has betrayed the target",
      "Another faction is responsible for the current crisis",
      "The target's orders have been superseded",
      "A protected person is responsible for the current threat",
      "The Ability user possesses legitimate authority central to the current conflict",
      "The Ability user is the rightful heir",
      "A long-trusted ally belongs to the enemy",
      "A foundational historical event occurred differently",
      "The target's oath was founded on a false betrayal",
      "A defining identity, allegiance, origin, or relationship is not what the target believed",
    ],
    exclusions: [
      "Does not compel a specific action.",
      "Does not control how the target responds to the premise.",
      "Does not remove the target's independent priorities, values, or judgement.",
      "Does not rewrite memories.",
      "Does not establish more than one bounded premise.",
      "Does not establish unspecified future lies.",
      "Does not make an impossible or internally incoherent premise believable.",
      "Does not override conclusive knowledge already possessed by the target.",
      "Does not automatically survive contradictory evidence sufficient for its Impact.",
      "Does not create supporting proof, evidence, credentials, disguises, authority, or documents.",
      "Does not force third parties to share the belief.",
      "Does not automatically propagate through testimony, reputation, command, or institutional authority.",
      "Does not guarantee that the target's reaction benefits the Ability user.",
      "Does not manufacture love, loyalty, devotion, consent, or obedience.",
      "Does not permit arbitrary cancellation after a successful accepted declaration.",
      "Does not allow Difficulty or Legendary Impact to legalise an ineligible premise.",
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
