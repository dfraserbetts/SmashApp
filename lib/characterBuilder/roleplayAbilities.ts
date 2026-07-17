import type { AbilityRestrictionDefinitionV1, RestrictionIssue } from "@/lib/restrictions";
import {
  diagnoseRoleplayRestrictionTransition,
  migrateLegacyRoleplayRestriction,
} from "@/lib/restrictions/persistence";
import {
  type RoleplayRestrictionBand,
  type RoleplayRestrictionType,
} from "@/lib/characterBuilder/legacyRoleplayRestrictions";

export {
  ROLEPLAY_RESTRICTION_BAND_OPTIONS,
  ROLEPLAY_RESTRICTION_TYPE_OPTIONS,
  type RoleplayRestrictionBand,
  type RoleplayRestrictionType,
} from "@/lib/characterBuilder/legacyRoleplayRestrictions";

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
  | "STEEL_YOURSELF"
  | "MISDIRECT"
  | "DISTRACT"
  | "RESCUE"
  | "INTERRUPT"
  | "CHALLENGE"
  | "OVERAWE"
  | "DISCERN_TRUTH"
  | "TRACK"
  | "PROVE";

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
    id: "STEEL_YOURSELF",
    name: "Steel Yourself",
    intention: "PERSUASION",
    definition:
      "Strengthen your own resolve by deliberately invoking a personal purpose, value, promise, duty, identity, hope, memory, training, ritual, or acceptance of the stakes.",
    legalApproaches: [
      "Recall a person, promise, oath, value, or cause that matters",
      "Focus on one clear immediate purpose",
      "Repeat a mantra, prayer, ritual, or trained mental discipline",
      "Acknowledge fear, pain, exhaustion, or doubt without surrendering the chosen course",
      "Reframe hardship as a chosen cost or sacrifice",
      "Anchor yourself in identity, duty, hope, love, or responsibility",
      "Accept the stakes and consciously choose to continue",
      "Draw strength from a previous hardship, failure, victory, or lesson",
    ],
    exclusions: [
      "Does not target or bind another character; use Appeal or Rally for others.",
      "Does not rely on deliberate self-deception or a false premise.",
      "Does not use supernatural domination or control.",
      "Does not erase fear, doubt, pain, exhaustion, temptation, memory, or emotion.",
      "Does not remove Fear, Control stacks, conditions, fields, attachments, active powers, Injury, or another quantified effect.",
      "Does not restore Health, resources, disabled Attributes, or spent abilities.",
      "Does not grant an additional action, Response, measured movement, bonus, penalty immunity, or another quantified Power output.",
      "Does not create capability, access, authority, equipment, or resources that do not exist.",
      "Does not make an impossible course possible.",
      "Does not guarantee that the declared course succeeds.",
      "Does not create permanent immunity to fear, doubt, temptation, hardship, or adversity.",
      "Does not bypass a mechanical prohibition that genuinely prevents the course.",
      "Does not make high Difficulty or Legendary Impact legalise an impossible, incoherent, or overbroad course.",
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
      "Does not automatically deceive anyone outside the selected Scope.",
      "Does not establish an unlimited collection of separate false claims.",
      "Does not guarantee that every inference drawn from the premise benefits the Ability user.",
      "Does not make high Difficulty or Legendary Impact legalise an ineligible premise.",
    ],
  },
  {
    id: "DISTRACT",
    name: "Distract",
    intention: "DECEPTION",
    definition:
      "Divert a target's immediate attention away from one bounded subject or development by creating a plausible competing focus through spectacle, interruption, bait, urgency, noise, movement, performance, or another attention-capturing act.",
    legalApproaches: [
      "Create a sudden noise, spectacle, or commotion",
      "Engage the target in an absorbing conversation or performance",
      "Draw attention toward a real competing event",
      "Use an object, movement, or environmental feature as a temporary focus",
      "Exploit curiosity, urgency, pride, habit, or professional attention",
      "Make yourself conspicuous so another development is overlooked",
      "Occupy the target with a plausible immediate concern",
      "Redirect sight, hearing, scrutiny, or active monitoring",
    ],
    exclusions: [
      "Does not establish a false or materially misleading premise; that uses Misdirect.",
      "Does not use supernatural domination or control.",
      "Does not erase memory, perception, senses, awareness, or capability.",
      "Does not make the target's current or next action fail.",
      "Does not cancel or alter a formally declared hostile action.",
      "Does not force the target to perform one exact alternative action.",
      "Does not force movement, positioning, or resource use.",
      "Does not create hostility, loyalty, cooperation, surrender, or obedience.",
      "Does not make another character hidden or invisible.",
      "Does not grant another action, Response, or measured movement.",
      "Does not guarantee that the action enabled by the distraction succeeds.",
      "Does not create bonuses, penalties, Fear, Control stacks, conditions, fields, attachments, or another quantified Power output.",
      "Does not automatically affect anyone outside the selected Scope.",
      "Does not bypass target access, attention capability, Narrative Theme, Outcome Contract, Scene Impact, Scope, or fictional plausibility.",
      "Does not make high Difficulty legalise an impossible or incoherent distraction.",
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
    id: "OVERAWE",
    name: "Overawe",
    intention: "INTIMIDATION",
    definition:
      "Intimidate through a credible threat, display of power, authority, reputation, certainty, omen, or consequence that makes continued opposition feel too dangerous or costly.",
    legalApproaches: [
      "Issue a credible threat",
      "Demonstrate power, capability, or readiness",
      "Invoke a feared reputation",
      "Invoke recognised authority or judgement",
      "Make the likely consequences of resistance unmistakable",
      "Exploit visible fear, doubt, or failing confidence",
      "Present an ominous symbol, warning, prophecy, or sign supported by the fiction",
      "Show absolute resolve or willingness to follow through",
    ],
    exclusions: [
      "Does not rely on deliberate lies or concealed falsehoods.",
      "Does not make an impossible, incoherent, or wholly baseless threat credible.",
      "Does not use supernatural domination or control.",
      "Does not create comprehension, fear, self-preservation, evaluative judgement, or agency where none exists.",
      "Does not inflict wounds, damage, Injury, or another quantified output.",
      "Does not create or remove Fear, Control stacks, conditions, penalties, bonuses, fields, attachments, or active powers.",
      "Does not force surrender, confession, cooperation, loyalty, or obedience unless an exact Outcome Contract explicitly grants a narrower result.",
      "Does not dictate the target's exact alternative action, movement, tactics, or use of resources.",
      "Does not grant open-ended authority over future decisions.",
      "Does not create permanent general obedience or permanent emotional rewriting.",
      "Does not automatically affect anyone outside the selected Scope.",
      "Does not bypass target access, comprehension, fictional plausibility, or contract exclusions.",
      "Does not guarantee that a threatened consequence is later carried out.",
      "Does not make high Difficulty or Legendary Impact legalise an ineligible use.",
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
  {
    id: "TRACK",
    name: "Track",
    intention: "PERCEPTION",
    definition:
      "Locate or follow a missing, concealed, or moving subject by interpreting physical traces, disturbed environments, witness reports, behavioural patterns, magical signatures, spiritual impressions, or another coherent sign of passage.",
    legalApproaches: [
      "Follow footprints, tracks, blood, debris, scent, or other physical traces",
      "Read disturbed terrain, architecture, vegetation, dust, water, or weather",
      "Connect reliable sightings, testimony, reports, or known movements",
      "Infer direction and timing from wear, displacement, decay, or environmental change",
      "Recognise a recurring magical, spiritual, psychic, technological, or supernatural signature supported by the Narrative Theme",
      "Distinguish genuine signs from false trails or unrelated disturbance",
      "Predict a likely route from the quarry's established habits, needs, destination, or constraints",
      "Maintain pursuit as the trail moves through different environments",
    ],
    exclusions: [
      "Does not reveal unrelated secrets merely because the quarry is being tracked.",
      "Does not identify an exploitable weakness; that uses Reveal Exploitable Weakness.",
      "Does not establish a concealed truth unrelated to the quarry's trail, passage, route, or location; that uses Uncover Concealed Truth.",
      "Does not create footprints, evidence, witness testimony, signatures, or traces that do not coherently exist.",
      "Does not grant omniscience or automatic knowledge of an exact current location.",
      "Does not guarantee reaching, catching, intercepting, confronting, or defeating the quarry.",
      "Does not grant an action, Response, measured movement, speed, travel time, or transportation.",
      "Does not bypass barriers, hazards, locks, access requirements, distance, time, equipment, or environmental limits.",
      "Does not remove concealment, invisibility, fields, attachments, active powers, conditions, or another quantified effect.",
      "Does not bypass a mechanical effect that explicitly makes the quarry impossible to track.",
      "Does not affect or mechanically alter the quarry.",
      "Does not automatically reveal the trail or result to other characters.",
      "Does not convert One Target into Small Group.",
      "Does not convert Small Group into Large Group, Faction / Army, or a diffuse population.",
      "Does not allow high Difficulty or Legendary Impact to legalise an impossible, incoherent, or inaccessible pursuit.",
    ],
  },
  {
    id: "PROVE",
    name: "Prove",
    intention: "PERCEPTION",
    definition:
      "Establish one truthful conclusion for others by presenting, demonstrating, connecting, or revealing coherent evidence, testimony, signs, consequences, or another verifiable basis.",
    legalApproaches: [
      "Present physical evidence that directly supports one conclusion",
      "Demonstrate a repeatable or immediately observable fact",
      "Connect multiple known clues into one coherent proof",
      "Expose a contradiction through a verifiable record or source",
      "Present reliable witness testimony",
      "Reconstruct one event from accepted evidence",
      "Reveal an accessible supporting detail that makes the truth demonstrable",
      "Invoke magical, spiritual, psychic, technological, or supernatural verification supported by Narrative Theme and current fiction",
    ],
    exclusions: [
      "Does not discover whether a speculative claim is true; use Discern Truth.",
      "Does not permit testing claims by repeatedly declaring possible truths.",
      "Does not fabricate evidence, testimony, records, signs, credentials, or authority.",
      "Does not establish a false or materially misleading premise; use Misdirect.",
      "Does not reveal unrelated secrets or exploitable weaknesses.",
      "Does not compel a particular action, cooperation, confession, emotional response, or public admission.",
      "Does not force an accepted target to speak honestly.",
      "Does not create comprehension, perception, memory, agency, or evaluative capability where none exists.",
      "Does not override conclusive evidence that genuinely disproves the declared conclusion.",
      "Does not grant an action, Response, movement, bonus, penalty, condition, or another quantified output.",
      "Does not mechanically alter the audience or the subject of the truth.",
      "Does not automatically affect anyone outside the selected Scope.",
      "Does not convert One Target into Small Group.",
      "Does not convert Small Group into Large Group, Faction / Army, or the public.",
      "Does not make high Difficulty or Legendary Impact legalise a false, unsupported, incoherent, or inaccessible conclusion.",
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

export const ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED = "UNSELECTED" as const;
export const ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW = "CUSTOM_REVIEW" as const;

export type RoleplayStandardOutcomeContractId =
  | "HIDE_FROM_IMMEDIATE_DANGER"
  | "SECURE_IMMEDIATE_SAFETY"
  | "DENY_IMMINENT_HOSTILE_ACT"
  | "DRAW_HOSTILE_ATTENTION"
  | "BREAK_SHARED_RESOLVE"
  | "UNCOVER_CONCEALED_TRUTH"
  | "REVEAL_EXPLOITABLE_WEAKNESS"
  | "TRACE_QUARRY"
  | "ESTABLISH_VERIFIED_TRUTH"
  | "SECURE_WILLING_COOPERATION"
  | "ESTABLISH_SHARED_RESOLVE"
  | "SUSTAIN_PERSONAL_RESOLVE"
  | "ESTABLISH_FALSE_BELIEF"
  | "DIVERT_IMMEDIATE_ATTENTION";

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

export type RoleplayOutcomeContractCounterEligibility = {
  default: boolean;
  byScope?: Partial<Record<RoleplayScope, boolean>>;
  byImpact?: Partial<Record<RoleplaySceneImpact, boolean>>;
};

export type RoleplayOutcomeContractDefinition = {
  id: RoleplayStandardOutcomeContractId;
  name: string;
  outcomeLane: RoleplayOutcomeLane;
  intention: RoleplayIntention;
  methodId: RoleplayStandardMethodId;
  supportedScopes: readonly RoleplayScope[];
  outcomeTemplate: string;
  scopeTokens: Partial<
    Record<RoleplayScope, Readonly<Record<string, string>>>
  >;
  impactFragments: Partial<Record<RoleplaySceneImpact, string>>;
  counterEligibility: RoleplayOutcomeContractCounterEligibility;
  privilegeCostKey: string;
  examples: readonly string[];
  exclusions: readonly string[];
};

export type ResolvedRoleplayOutcomeContract = {
  contractId: RoleplayStandardOutcomeContractId;
  scope: RoleplayScope;
  sceneImpact: RoleplaySceneImpact;
  successOutcome: string;
  counterEligible: boolean;
  privilegeCostKey: string;
};

export type RoleplayStandardLibraryAudit = {
  methodIds: RoleplayStandardMethodId[];
  contractIds: RoleplayStandardOutcomeContractId[];
  privilegeKeys: string[];
  plannedCellCount: number;
  completedCellCount: number;
  missingCellCount: number;
  missingCellsByContract: Record<
    RoleplayStandardOutcomeContractId,
    Array<{ scope: RoleplayScope; sceneImpact: RoleplaySceneImpact }>
  >;
  supportedScopesByContract: Record<RoleplayStandardOutcomeContractId, RoleplayScope[]>;
  completedImpactsByContractScope: Record<
    string,
    RoleplaySceneImpact[]
  >;
  missingScopeTokenFragments: string[];
  unresolvedTemplateTokens: string[];
  duplicateIds: string[];
  duplicatePrivilegeKeys: string[];
  invalidMethodOwnership: string[];
  blankGeneratedOutcomes: string[];
  duplicateCompletedCells: string[];
  counterResolutionErrors: string[];
  structuralErrors: string[];
};

export const ROLEPLAY_OUTCOME_CONTRACTS = [
  {
    id: "HIDE_FROM_IMMEDIATE_DANGER",
    name: "Hide from Immediate Danger",
    outcomeLane: "HELP",
    intention: "INTERVENTION",
    methodId: "RESCUE",
    supportedScopes: ["ONE_TARGET", "SMALL_GROUP"],
    outcomeTemplate: "{{subject}} {{impact}}",
    scopeTokens: {
      ONE_TARGET: {
        subject: "the target",
        dangerReference: "the immediate danger",
      },
      SMALL_GROUP: {
        subject: "every accepted member of the selected group",
        dangerReference: "one declared immediate danger",
      },
    },
    impactFragments: {
      MINOR: "becomes hidden from {{dangerReference}}",
      STANDARD:
        "becomes hidden from {{dangerReference}} for the rest of the current scene unless an identifiable change defeats that concealment",
      MAJOR:
        "becomes securely hidden from {{dangerReference}} for the rest of the current scene and remains concealed despite active searching, ordinary suspicion, or serious pressure unless decisive circumstances defeat the concealment",
      LEGENDARY:
        "becomes hidden from {{dangerReference}} through a defining concealment whose protection extends beyond the current scene until it is decisively exposed or narratively resolved",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "HIDE_FROM_IMMEDIATE_DANGER",
    examples: [
      "Diving between ruined stones",
      "Disappearing into a crowd",
      "Being covered by concealing mist",
      "Slipping beneath a wagon",
      "A companion creating a distraction",
      "Remaining concealed while searchers actively inspect the surrounding area",
      "A witness staying hidden from a defining danger beyond the immediate scene",
    ],
    exclusions: [
      "Does not grant invisibility, sensory immunity, or universal concealment.",
      "Does not hide the selected target or group from every creature in the scene.",
      "Does not end an entire encounter.",
      "Does not remove existing quantified effects.",
      "Does not move the target a measured distance.",
      "Does not grant another action.",
      "Does not require an additional Hide, movement, or defence roll.",
      "Does not automatically conceal anyone outside the selected Scope.",
      "Does not convert One Target into Small Group.",
      "Does not convert Small Group into Large Group or Faction / Army.",
      "Does not permit majority interpretation, hidden exemptions, or per-member resistance.",
      "Does not require one member's later exposure to expose every other member when the fiction supports individual resolution.",
      "Does not permit impossible or incoherent concealment.",
      "Does not permit arbitrary cancellation after success.",
    ],
  },
  {
    id: "SECURE_IMMEDIATE_SAFETY",
    name: "Secure Immediate Safety",
    outcomeLane: "HELP",
    intention: "INTERVENTION",
    methodId: "RESCUE",
    supportedScopes: ["ONE_TARGET", "SMALL_GROUP"],
    outcomeTemplate: "{{subject}} {{impact}}",
    scopeTokens: {
      ONE_TARGET: { subject: "the target" },
      SMALL_GROUP: { subject: "every accepted member of the selected group" },
    },
    impactFragments: {
      MINOR:
        "is secured from one small immediate peril for the current meaningful exchange and is no longer directly threatened by it during that exchange",
      STANDARD:
        "is secured from one declared immediate peril and is no longer directly threatened by it",
      MAJOR:
        "is secured from one central immediate peril for the rest of the current scene and remains outside its direct threat despite serious pressure or worsening conditions unless a decisive change defeats the safe state",
      LEGENDARY:
        "is secured from one defining peril through an enduring safe state whose protection extends beyond the current scene until it is decisively breached or narratively resolved",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "SECURE_IMMEDIATE_SAFETY",
    examples: [
      "Catching an ally as a broken ledge gives way",
      "Pulling a child clear of a collapsing awning",
      "Guiding a companion through smoke into a protected alcove",
      "Getting a witness behind a sanctuary threshold before a mob reaches them",
      "Drawing a trapped animal through the only safe opening",
      "Interposing and directing someone behind substantial cover before a hazardous collapse",
      "Revealing and using a coherent service route to get one target out of an immediate fire",
      "Securing one person outside the crush of a stampeding crowd",
      "Getting every accepted group member beyond one worsening central peril for the scene",
      "Establishing an enduring sanctuary from one defining peril",
    ],
    exclusions: [
      "Does not protect the selected target or group from every danger in the scene.",
      "Does not grant invulnerability, immunity, or permanent safety.",
      "Does not end the source of the peril.",
      "Does not protect anyone outside the selected Scope.",
      "Does not extinguish a fire, stabilise a structure, stop a crowd, defeat an enemy, or otherwise solve the wider danger unless a separate outcome grants that result.",
      "Does not restore Health or treat Injury.",
      "Does not remove stacks, conditions, fields, attachments, active powers, or other quantified effects already affecting the target.",
      "Does not grant Block, Dodge, Resist, Protection, Resistance, or another quantified defence.",
      "Does not grant another action or Response.",
      "Does not move a measured distance.",
      "Does not allow the player to choose an exact tactical destination.",
      "Does not teleport or cross an impossible or inaccessible barrier.",
      "Does not automatically carry, move, or rescue anyone outside the selected Scope.",
      "Does not require an additional movement, defence, rescue, or target-action roll to establish the purchased safety.",
      "Does not purchase exact squares, paths, distances, formations, or destinations.",
      "Does not cancel a formally declared hostile action after the normal Response Window has begun.",
      "Does not retroactively prevent an already resolved consequence.",
      "Does not prevent the source from creating a genuinely new threat later.",
      "Does not preserve safety for a member after voluntary re-entry or after a change decisive enough for the selected Scene Impact defeats that member's safe state.",
      "Does not convert One Target into Small Group.",
      "Does not convert Small Group into Large Group or Faction / Army.",
      "Does not permit majority interpretation, hidden exemptions, or per-member resistance.",
      "Does not bypass Rescue, Narrative Theme, target access, the selected Scene Impact, the selected supported Scope, or fictional plausibility.",
      "Does not apply different declared perils to different accepted members.",
      "Does not require the source of the peril to end and does not prevent genuinely new dangers.",
      "Does not allow high Difficulty to legalise an impossible rescue.",
      "Does not permit the Game Director to leave the target directly exposed to the same accepted peril after a successful roll.",
      "Does not permit the Game Director to leave any accepted group member directly exposed to the same accepted peril after a successful roll.",
      "Does not permit arbitrary cancellation because the successful rescue disrupts the planned scene or encounter.",
    ],
  },
  {
    id: "DENY_IMMINENT_HOSTILE_ACT",
    name: "Deny Imminent Hostile Act",
    outcomeLane: "HINDER",
    intention: "INTERVENTION",
    methodId: "INTERRUPT",
    supportedScopes: ["ONE_TARGET"],
    outcomeTemplate: "{{impact}}",
    scopeTokens: { ONE_TARGET: {} },
    impactFragments: {
      MINOR:
        "one small immediate hostile act the target is about to take is spoiled before it resolves",
      STANDARD: "the target's current hostile action fails before it resolves",
      MAJOR: "the target's current or next hostile action fails",
      LEGENDARY:
        "the target's defining current or next hostile action fails before it resolves, preventing the defining consequence that action would otherwise establish",
    },
    counterEligibility: { default: true },
    privilegeCostKey: "DENY_IMMINENT_HOSTILE_ACT",
    examples: [
      "Spoiling one small immediate hostile act before it resolves",
      "Stopping the hostile action currently being attempted",
      "Denying the target's current or next hostile action",
      "Preventing one defining hostile action and its defining direct consequence",
    ],
    exclusions: [
      "Does not permanently incapacitate the target.",
      "Does not cancel passive effects.",
      "Does not remove existing stacks, units, fields, attachments, or active powers.",
      "Does not prevent every action for the scene.",
      "Does not become ordinary Block, Dodge, Resist, or Cleanse.",
      "Does not automatically affect a group.",
      "Does not automatically reveal a hidden or unperceived act.",
      "Does not cancel unrelated prior consequences, future turns, or every hostile objective.",
      "Does not bypass the requirement for an eligible perceived impending act under the existing timing doctrine.",
    ],
  },
  {
    id: "DRAW_HOSTILE_ATTENTION",
    name: "Draw Hostile Attention",
    outcomeLane: "HINDER",
    intention: "INTIMIDATION",
    methodId: "CHALLENGE",
    supportedScopes: ["ONE_TARGET"],
    outcomeTemplate: "{{impact}}",
    scopeTokens: { ONE_TARGET: {} },
    impactFragments: {
      MINOR:
        "the next time the target acts with hostility, it must direct that hostility at you, if you are a valid target",
      STANDARD:
        "until the end of the target's next turn in combat, or the end of the current meaningful exchange outside combat, whenever the target acts with hostility, it must direct that hostility at you, if you are a valid target",
      MAJOR:
        "for the rest of the current scene, whenever the target acts with hostility, it must direct that hostility at you, if you are a valid target",
      LEGENDARY:
        "the target recognises you as its personal rival until the rivalry is narratively resolved",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "DRAW_HOSTILE_ATTENTION",
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
    id: "BREAK_SHARED_RESOLVE",
    name: "Break Resolve",
    outcomeLane: "HINDER",
    intention: "INTIMIDATION",
    methodId: "OVERAWE",
    supportedScopes: ["ONE_TARGET", "SMALL_GROUP"],
    outcomeTemplate: "{{impact}}",
    scopeTokens: {
      ONE_TARGET: {
        subject: "the target",
        shared: "",
        alternativeSubject: "the target",
      },
      SMALL_GROUP: {
        subject: "the selected group",
        shared: " shared",
        alternativeSubject: "each member",
      },
    },
    impactFragments: {
      MINOR:
        "{{subject}} breaks off one small immediate{{shared}} course of opposition for the current meaningful exchange; {{alternativeSubject}} may choose another coherent response but does not pursue that course",
      STANDARD:
        "{{subject}} abandons one clear{{shared}} course of opposition for the rest of the current scene; {{alternativeSubject}} may choose another coherent response but does not pursue that course",
      MAJOR:
        "{{subject}} abandons one central{{shared}} course of opposition for the rest of the current scene and does not resume it despite serious pressure, loyalty, personal cost, or command",
      LEGENDARY:
        "{{subject}} adopts an enduring refusal to pursue one defining course of opposition whose consequences extend beyond the current scene and maintains that refusal until it is narratively resolved",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "BREAK_SHARED_RESOLVE",
    examples: [
      "A gang breaks off one immediate rush",
      "Guards stop one brief collective search",
      "A mob ceases pounding one door through the current exchange",
      "Pursuers abandon one immediate attempt to seize someone",
      "Raiders abandon storming one barricade for the scene",
      "A patrol abandons pursuit of a refugee group",
      "Mercenaries cease one coordinated attempt to enforce an eviction",
      "Conspirators stop trying to silence one witness for the scene",
      "Cultists abandon carrying out the central sacrifice despite their leader's commands",
      "Soldiers cease a central attempt to burn a village despite loyalty and fear of punishment",
      "A sworn patrol abandons the principal pursuit shaping the current crisis",
      "A hostile council bloc ceases one central act of persecution for the scene",
      "A sworn band forms an enduring refusal to continue one defining hunt",
      "A small cabal abandons a defining conspiracy extending beyond the scene",
      "Former zealots refuse to resume one foundational persecution",
      "An elite guard's enduring refusal breaks one long-running course of oppression",
    ],
    exclusions: [
      "Does not dictate the selected target's or group's exact alternative response.",
      "Does not automatically force retreat, surrender, confession, cooperation, loyalty, alliance, or obedience.",
      "Does not end every hostile intention or objective held by the selected target or group.",
      "Does not prevent every future act of opposition.",
      "Does not affect more than one bounded Declared Opposed Course.",
      "Does not apply to unspecified future commands or conflicts.",
      "Does not remove individual identity, values, loyalties, emotions, priorities, or judgement.",
      "Does not create one shared mind, action, turn, or resource pool.",
      "Does not create wounds, damage, Injury, Fear, Control stacks, conditions, penalties, bonuses, movement, extra actions, or another quantified Power output.",
      "Does not remove existing quantified effects.",
      "Does not automatically make the Ability user or allies safe from unrelated actions.",
      "Does not automatically bind anyone outside the selected target or accepted group.",
      "Does not automatically bind later arrivals, replacements, followers, or intermediaries.",
      "Does not automatically propagate through leadership, command, reputation, testimony, or institutional authority.",
      "Does not convert One Target into Small Group.",
      "Does not convert Small Group into Large Group, Faction / Army, or a diffuse crowd.",
      "Does not make an impossible or incoherent threat effective.",
      "Does not permit deliberate lies or false authority through Overawe.",
      "Does not permit cosmetic rewording or tactical relabelling to evade the accepted course.",
      "Does not guarantee that a threatened consequence is later carried out.",
      "Does not allow high Difficulty or Legendary Impact to legalise an invalid target, group, or overbroad course.",
      "Does not permit arbitrary cancellation because the result obstructs the planned plot or encounter.",
    ],
  },
  {
    id: "UNCOVER_CONCEALED_TRUTH",
    name: "Uncover Concealed Truth",
    outcomeLane: "HELP",
    intention: "PERCEPTION",
    methodId: "DISCERN_TRUTH",
    supportedScopes: ["ONE_TARGET"],
    outcomeTemplate: "{{impact}}",
    scopeTokens: { ONE_TARGET: {} },
    impactFragments: {
      MINOR:
        "you learn whether the target is concealing something relevant to the immediate situation and, if so, its general nature; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed",
      STANDARD:
        "you learn one useful concealed truth about the target relevant to the immediate situation; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed",
      MAJOR:
        "you learn a central concealed truth about the target that is shaping the current situation; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed",
      LEGENDARY:
        "you learn a defining concealed truth about the target whose significance extends beyond the current scene; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "UNCOVER_CONCEALED_TRUTH",
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
    intention: "PERCEPTION",
    methodId: "DISCERN_TRUTH",
    supportedScopes: ["ONE_TARGET"],
    outcomeTemplate: "{{impact}}",
    scopeTokens: { ONE_TARGET: {} },
    impactFragments: {
      MINOR:
        "you identify one small immediately useful weakness, opening, or opportunity concerning the target for the current meaningful exchange; if no qualifying exploitable opportunity exists, you learn that none is presently accessible",
      STANDARD:
        "you identify one useful exploitable weakness, route, pattern, dependency, or leverage point concerning the target for the current situation; if no qualifying exploitable opportunity exists, you learn that none is presently accessible",
      MAJOR:
        "you reveal one central exploitable vulnerability or opportunity concerning the target that is shaping the current scene and can materially change how it is approached; if no qualifying exploitable opportunity exists, you learn that none is presently accessible",
      LEGENDARY:
        "you reveal one defining vulnerability, hidden route, dependency, or leverage point concerning the target whose significance extends beyond the current scene; if no qualifying exploitable opportunity exists, you learn that none is presently accessible",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "REVEAL_EXPLOITABLE_WEAKNESS",
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
    id: "TRACE_QUARRY",
    name: "Trace Quarry",
    outcomeLane: "HELP",
    intention: "PERCEPTION",
    methodId: "TRACK",
    supportedScopes: ["ONE_TARGET", "SMALL_GROUP"],
    outcomeTemplate: "{{impact}}",
    scopeTokens: {
      ONE_TARGET: {
        quarryReference: "the selected target",
        quarryPossessive: "the selected target's",
      },
      SMALL_GROUP: {
        quarryReference: "the selected group",
        quarryPossessive: "the selected group's",
      },
    },
    impactFragments: {
      MINOR:
        "you identify one recent accessible sign of {{quarryPossessive}} passage and the immediate direction or next nearby trace it indicates for the current meaningful exchange",
      STANDARD:
        "you establish a reliable trail left by {{quarryReference}} and can follow it through the current scene unless an identifiable change genuinely breaks or obscures that trail",
      MAJOR:
        "you establish and maintain a reliable trail to {{quarryReference}} through the current scene despite serious concealment, false trails, difficult terrain, or deliberate evasion unless decisive circumstances make continued tracking impossible or incoherent",
      LEGENDARY:
        "you uncover a defining trail, route, or signature leading toward {{quarryReference}} whose significance extends beyond the current scene and can continue following it until the quarry is reached or the pursuit is narratively resolved",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "TRACE_QUARRY",
    examples: [
      "Following footprints from a raided farm toward one creature",
      "Reading blood and broken branches to pursue an injured fugitive",
      "Connecting witness sightings to trace one missing courier",
      "Following a stolen object through marks left by its carrier",
      "Reading magical residue to follow one supernatural quarry",
      "Identifying the next nearby trace left by one escaping suspect",
      "Maintaining a trail despite deliberate false tracks",
      "Following a patrol's shared trail through difficult terrain",
      "Tracing a small band through changing environments",
      "Pursuing a defining magical signature across multiple scenes",
      "Following a legendary quarry until it is reached or the pursuit is resolved",
    ],
    exclusions: [
      "Does not guarantee reaching, catching, intercepting, confronting, or defeating the quarry.",
      "Does not grant an action, Response, measured movement, speed, travel time, transportation, or teleportation.",
      "Does not bypass barriers, locks, hazards, access requirements, distance, equipment, time, or environmental restrictions.",
      "Does not reveal unrelated secrets, motives, memories, weaknesses, or evidence.",
      "Does not establish more than one coherent trail.",
      "Does not create traces, evidence, testimony, routes, or signatures that cannot coherently exist.",
      "Does not grant omniscience or automatic exact current-location knowledge.",
      "Does not remove concealment, invisibility, conditions, fields, attachments, active powers, or another quantified effect.",
      "Does not bypass a mechanical effect that explicitly makes tracking impossible.",
      "Does not alter, slow, hinder, mark, expose, or mechanically affect the quarry.",
      "Does not automatically reveal the result to another character.",
      "Does not convert One Target into Small Group.",
      "Does not convert Small Group into Large Group, Faction / Army, or a diffuse population.",
      "Does not grant separate trails for members who are not travelling as one coherent group.",
      "Does not continue every branch automatically after the selected group splits.",
      "Does not guarantee that future attempts made while following the trail succeed.",
      "Does not allow high Difficulty or Legendary Impact to legalise an invalid quarry, impossible pursuit, or inaccessible connection.",
      "Does not permit the Game Director to substitute a false, irrelevant, useless, or deliberately circular trail after a successful accepted declaration.",
      "Does not permit arbitrary cancellation merely because the trail disrupts the planned plot or encounter.",
    ],
  },
  {
    id: "ESTABLISH_VERIFIED_TRUTH",
    name: "Establish Verified Truth",
    outcomeLane: "HELP",
    intention: "PERCEPTION",
    methodId: "PROVE",
    supportedScopes: ["ONE_TARGET", "SMALL_GROUP"],
    outcomeTemplate: "{{impact}}",
    scopeTokens: {
      ONE_TARGET: { audience: "the target" },
      SMALL_GROUP: { audience: "every accepted member of the selected group" },
    },
    impactFragments: {
      MINOR:
        "{{audience}} recognises one small immediately verifiable truth as established for the current meaningful exchange and treats it as true when making relevant decisions",
      STANDARD:
        "{{audience}} recognises one meaningful truth relevant to the current situation as established for the rest of the current scene and treats it as true when making relevant decisions unless meaningful new evidence materially changes the conclusion",
      MAJOR:
        "{{audience}} recognises one central truth shaping the current situation as conclusively established for the rest of the current scene and continues to treat it as true despite serious denial, pressure, loyalty, or personal cost unless decisive new evidence or narrative resolution materially changes the conclusion",
      LEGENDARY:
        "{{audience}} recognises one defining truth whose consequences extend beyond the current scene as decisively established and treats it as true until its consequences are fulfilled or narratively resolved",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "ESTABLISH_VERIFIED_TRUTH",
    examples: [
      "Proving one prisoner could not have committed the immediate crime",
      "Demonstrating that one bridge or structure is unsafe",
      "Establishing that one order or document is authentic",
      "Proving that a visible document is forged",
      "Connecting records and physical evidence to establish one betrayal",
      "Demonstrating that one ritual depends on a specific object",
      "Proving that one accused person was elsewhere",
      "Establishing for a small council that one warning is genuine",
      "Proving to a patrol that its orders were issued by the recognised commander",
      "Establishing a defining historical or institutional truth whose consequences extend beyond the current scene",
    ],
    exclusions: [
      "Does not discover whether a speculative claim is true.",
      "Does not permit repeated claim-testing as a substitute for Discern Truth.",
      "Does not fabricate evidence, records, testimony, credentials, signs, or authority.",
      "Does not establish more than one bounded Declared Truth.",
      "Does not prove a false, materially misleading, impossible, or incoherent conclusion.",
      "Does not reveal unrelated secrets, motives, memories, weaknesses, routes, or evidence.",
      "Does not compel cooperation, confession, surrender, testimony, disclosure, honesty, alliance, obedience, or another exact action.",
      "Does not force public admission.",
      "Does not remove independent values, loyalties, priorities, emotions, or judgement.",
      "Does not create comprehension, perception, memory, agency, or capability.",
      "Does not grant bonuses, penalties, actions, Responses, movement, conditions, or another quantified output.",
      "Does not mechanically alter the audience or subject.",
      "Does not automatically affect anyone outside the selected Scope.",
      "Does not convert One Target into Small Group.",
      "Does not convert Small Group into Large Group, Faction / Army, or the public.",
      "Does not permit majority interpretation, hidden exemptions, or per-member resistance.",
      "Does not automatically propagate through testimony, leadership, reputation, institutions, reports, or rumours.",
      "Does not allow Difficulty or Legendary Impact to legalise an invalid conclusion or inaccessible proof.",
      "Does not permit arbitrary cancellation after a successful accepted declaration.",
    ],
  },
  {
    id: "SECURE_WILLING_COOPERATION",
    name: "Secure Willing Cooperation",
    outcomeLane: "HELP",
    intention: "PERSUASION",
    methodId: "APPEAL",
    supportedScopes: ["ONE_TARGET", "SMALL_GROUP"],
    outcomeTemplate: "{{subject}} {{impact}}",
    scopeTokens: {
      ONE_TARGET: { subject: "the target" },
      SMALL_GROUP: { subject: "every accepted member of the selected group" },
    },
    impactFragments: {
      MINOR:
        "willingly complies with one small immediate request requiring negligible sacrifice, risk, or commitment",
      STANDARD:
        "willingly agrees to and sincerely carries out one meaningful request involving inconvenience, social cost, or modest personal risk",
      MAJOR:
        "willingly commits to and sincerely pursues one difficult request involving substantial effort, personal cost, reputational danger, or physical risk",
      LEGENDARY:
        "willingly makes one defining commitment, alliance, or promise whose consequences extend beyond the current scene and sincerely upholds it until it is fulfilled or narratively resolved",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "SECURE_WILLING_COOPERATION",
    examples: [
      "Waiting briefly while the Ability user speaks to someone",
      "Passing along a harmless message",
      "Granting a meeting or temporary access",
      "Sheltering someone at substantial personal risk",
      "Testifying against a dangerous patron",
      "Joining an alliance for a coming war",
      "Swearing to protect a community",
      "Reconciling with a former enemy and upholding a defined peace",
      "A small group agreeing to carry one shared message",
      "Every accepted council member committing to one difficult shared request",
    ],
    exclusions: [
      "Does not grant open-ended authority over the selected Scope.",
      "Does not create permanent general obedience.",
      "Does not apply to unspecified future requests.",
      "Does not manufacture love, devotion, intimacy, or consent.",
      "Does not remove any accepted member's identity or independent judgement.",
      "Does not make an impossible request possible.",
      "Does not create comprehension, agency, authority, or capability.",
      "Does not automatically compel anyone outside the selected Scope.",
      "Does not guarantee successful completion of the requested task.",
      "Does not permit deliberate sabotage, false cooperation, or technical evasion of the accepted request.",
      "Does not extend beyond the one request accepted before Difficulty was set.",
      "Does not make an ineligible request legal through high Difficulty or Legendary Impact.",
      "Does not prevent legitimate narrative resolution.",
      "Does not permit arbitrary cancellation merely because cooperation becomes inconvenient for the Game Director or planned plot.",
      "Does not permit different requests for different members or bundled independent requests.",
      "Does not permit majority interpretation, hidden exemptions, per-member resistance, or a secretly unwilling accepted member.",
      "Does not convert Small Group into Large Group or Faction / Army.",
      "Does not propagate to later arrivals, replacements, followers, subordinates, organisations, factions, armies, or the public.",
      "Does not create a shared mind, shared turn, identical execution, automatic competence, or guaranteed task success.",
    ],
  },
  {
    id: "ESTABLISH_SHARED_RESOLVE",
    name: "Establish Shared Resolve",
    outcomeLane: "HELP",
    intention: "PERSUASION",
    methodId: "RALLY",
    supportedScopes: ["SMALL_GROUP"],
    outcomeTemplate: "{{impact}}",
    scopeTokens: { SMALL_GROUP: {} },
    impactFragments: {
      MINOR:
        "the selected group steadies around one simple immediate course and sincerely pursues it through the current meaningful exchange despite ordinary hesitation, confusion, or pressure",
      STANDARD:
        "the selected group adopts one clear shared course as its immediate priority for the rest of the current scene and sincerely pursues it despite meaningful fear, confusion, disagreement, or pressure",
      MAJOR:
        "the selected group commits to one difficult shared course for the rest of the current scene and sincerely pursues it despite serious fear, division, personal cost, or danger unless decisive circumstances or narrative resolution make that course no longer coherent",
      LEGENDARY:
        "the selected group forms one defining shared resolve, pledge, or cause whose consequences extend beyond the current scene and sincerely upholds it until it is fulfilled or narratively resolved",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "ESTABLISH_SHARED_RESOLVE",
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
    id: "SUSTAIN_PERSONAL_RESOLVE",
    name: "Sustain Personal Resolve",
    outcomeLane: "HELP",
    intention: "PERSUASION",
    methodId: "STEEL_YOURSELF",
    supportedScopes: ["SELF"],
    outcomeTemplate: "{{impact}}",
    scopeTokens: { SELF: {} },
    impactFragments: {
      MINOR:
        "you steady yourself around one small immediate personal course and sincerely pursue it through the current meaningful exchange despite ordinary fear, doubt, discomfort, or hesitation",
      STANDARD:
        "you commit yourself to one clear personal course for the rest of the current scene and sincerely pursue it despite meaningful fear, exhaustion, doubt, temptation, or pressure",
      MAJOR:
        "you hold to one difficult personal course for the rest of the current scene and sincerely pursue it despite serious fear, exhaustion, personal cost, temptation, or danger unless decisive circumstances or narrative resolution make that course no longer coherent",
      LEGENDARY:
        "you form one defining personal resolve, oath, or purpose whose consequences extend beyond the current scene and sincerely uphold it until it is fulfilled or narratively resolved",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "SUSTAIN_PERSONAL_RESOLVE",
    examples: [
      "A bearer continuing toward the destination despite terror and exhaustion",
      "A witness continuing truthful testimony despite intimidation",
      "A rescuer refusing to leave until trapped civilians are clear",
      "A messenger continuing through pursuit and hardship",
      "A defender holding one evacuation route through the scene",
      "A tempted character reaffirming one promise and continuing to honour it",
      "A pilgrim accepting one defining oath whose consequences extend beyond the scene",
      "A frightened hero choosing to continue one mission without becoming immune to fear",
    ],
    exclusions: [
      "Does not establish more than one bounded Declared Personal Course.",
      "Does not guarantee that the declared course succeeds.",
      "Does not grant an action, Response, measured movement, exact route, or exact destination.",
      "Does not grant bonuses, penalties, advantage, disadvantage, immunity, Resistance, Protection, or another quantified output.",
      "Does not remove Fear, Control stacks, conditions, fields, attachments, active powers, Injury, or another quantified effect.",
      "Does not restore Health, resources, Attributes, or disabled abilities.",
      "Does not permit action while unconscious, defeated, incapacitated, or otherwise mechanically unable to act.",
      "Does not bypass normal resource costs, restrictions, access, equipment, authority, or capability.",
      "Does not make an impossible course possible.",
      "Does not create permanent immunity to fear, doubt, temptation, pain, exhaustion, hardship, or adversity.",
      "Does not establish a false premise or rewrite memory.",
      "Does not affect another character.",
      "Does not become Rally, Appeal, Cleanse, Resist, Blaze of Glory, or a Power.",
      "Does not allow high Difficulty or Legendary Impact to legalise an invalid course.",
      "Does not permit arbitrary cancellation after a successful accepted declaration.",
    ],
  },
  {
    id: "ESTABLISH_FALSE_BELIEF",
    name: "Establish False Belief",
    outcomeLane: "HINDER",
    intention: "DECEPTION",
    methodId: "MISDIRECT",
    supportedScopes: ["ONE_TARGET", "SMALL_GROUP"],
    outcomeTemplate: "{{impact}}",
    scopeTokens: {
      ONE_TARGET: {
        subject: "the target",
        beliefReference: "the belief",
        resolutionReference: "",
      },
      SMALL_GROUP: {
        subject: "every accepted member of the selected group",
        beliefReference: "that member's belief",
        resolutionReference: " for that member",
      },
    },
    impactFragments: {
      MINOR:
        "{{subject}} accepts one small and immediately plausible false premise as true for the current meaningful exchange and treats it as true when making relevant decisions",
      STANDARD:
        "{{subject}} genuinely accepts one plausible false premise relevant to the current situation as true for the rest of the current scene and treats it as true when making relevant decisions unless meaningful contradictory evidence resolves {{beliefReference}}",
      MAJOR:
        "{{subject}} genuinely accepts one central false premise shaping the current situation as true for the rest of the current scene and continues to treat it as true when making relevant decisions unless decisive contradictory evidence, direct experience, or narrative resolution ends {{beliefReference}}",
      LEGENDARY:
        "{{subject}} genuinely accepts one defining false premise whose consequences extend beyond the current scene as true and treats it as true when making relevant decisions until it is decisively disproved or narratively resolved{{resolutionReference}}",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "ESTABLISH_FALSE_BELIEF",
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
      "Does not control how any target responds to the premise.",
      "Does not remove any target's independent priorities, values, judgement, or agency.",
      "Does not rewrite memories.",
      "Does not establish more than one bounded premise.",
      "Does not establish unspecified future lies.",
      "Does not make an impossible or internally incoherent premise believable.",
      "Does not override conclusive knowledge already possessed by an accepted target.",
      "Does not automatically survive contradictory evidence sufficient for its Impact.",
      "Does not create supporting proof, evidence, credentials, disguises, authority, or documents.",
      "Does not force unselected third parties to share the belief.",
      "Does not automatically propagate through testimony, reputation, command, or institutional authority.",
      "Does not guarantee that any target's reaction benefits the Ability user.",
      "Does not manufacture love, loyalty, devotion, consent, or obedience.",
      "Does not permit arbitrary cancellation after a successful accepted declaration.",
      "Does not allow Difficulty or Legendary Impact to legalise an ineligible premise.",
      "Does not convert One Target into Small Group.",
      "Does not convert Small Group into Large Group or Faction / Army.",
      "Does not permit majority interpretation, hidden exemptions, or per-member resistance.",
    ],
  },
  {
    id: "DIVERT_IMMEDIATE_ATTENTION",
    name: "Divert Immediate Attention",
    outcomeLane: "HINDER",
    intention: "DECEPTION",
    methodId: "DISTRACT",
    supportedScopes: ["ONE_TARGET", "SMALL_GROUP"],
    outcomeTemplate: "{{attentionClause}} {{impact}}",
    scopeTokens: {
      ONE_TARGET: {
        attentionClause: "the target's active attention is diverted",
        observationReference: "that target's deliberate observation or interference",
      },
      SMALL_GROUP: {
        attentionClause:
          "every accepted member of the selected group has their active attention diverted",
        observationReference:
          "deliberate observation or interference from any accepted member",
      },
    },
    impactFragments: {
      MINOR:
        "for the current meaningful exchange, creating a brief opening for one declared small immediate action or development to proceed without {{observationReference}}",
      STANDARD:
        "long enough for one declared meaningful action or development relevant to the current scene to proceed without {{observationReference}}",
      MAJOR:
        "despite serious vigilance, pressure, or competing priorities, long enough for one declared central action or development capable of changing the current scene to proceed without {{observationReference}}",
      LEGENDARY:
        "through a defining diversion, long enough for one declared defining action or development whose consequences extend beyond the current scene to proceed without {{observationReference}}",
    },
    counterEligibility: { default: false },
    privilegeCostKey: "DIVERT_IMMEDIATE_ATTENTION",
    examples: [
      "Starting a loud argument so one ally can slip through a side doorway",
      "Performing an absorbing demonstration while another character examines one document",
      "Knocking over a display so one small object can be exchanged",
      "Drawing a sentry into conversation while one witness moves out of scrutiny",
      "Making yourself conspicuous so another character reaches an accessible control",
      "Creating a real commotion so one person can enter nearby cover",
      "Occupying a clerk with an urgent question while a brief message is passed",
      "Holding a patrol's attention while one meaningful scene objective proceeds",
      "Sustaining a diversion despite serious vigilance while one central action proceeds",
      "Creating a defining diversion for one action whose consequences outlast the scene",
    ],
    exclusions: [
      "Does not guarantee that the declared action or development succeeds.",
      "Does not grant an additional action, Response, or measured movement.",
      "Does not make an accepted target's current or next action fail.",
      "Does not cancel a formally declared or already resolved action.",
      "Does not force an accepted target to take one exact alternative action.",
      "Does not remove passive senses, memory, perception, awareness, or capability.",
      "Does not make another character hidden, invisible, or immune from detection.",
      "Does not prevent unselected observers from noticing or interfering.",
      "Does not remove physical barriers, locks, hazards, access requirements, or other obstacles.",
      "Does not grant bonuses, penalties, advantage, disadvantage, Fear, Control stacks, conditions, fields, attachments, or another quantified output.",
      "Does not establish a false premise; that uses Establish False Belief.",
      "Does not permit more than one bounded Declared Opening.",
      "Does not cover several unrelated actions or an entire plan.",
      "Does not primarily enable a direct formal hostile action against an accepted target without normal defence or response.",
      "Does not force movement or alter an accepted target's position.",
      "Does not automatically affect anyone outside the selected Scope.",
      "Does not convert One Target into Small Group through a broad Declared Opening.",
      "Does not convert Small Group into Large Group or Faction / Army.",
      "Does not permit majority interpretation, hidden exemptions, or per-member resistance.",
      "Does not bypass Distract, Narrative Theme, target access, attention capability, the selected Scene Impact, Scope, or fictional plausibility.",
      "Does not allow high Difficulty to legalise an impossible distraction.",
      "Does not permit the Game Director to continue deliberate observation or interference during the accepted opening merely because success disrupts the planned scene.",
      "Does not persist after the one accepted opening has been used.",
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
  restriction?: AbilityRestrictionDefinitionV1 | null;
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
  STEEL_YOURSELF: "Steel Yourself",
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
  PROVE: "Prove",
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

const ROLEPLAY_TEMPLATE_TOKEN_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/gu;

function resolveRoleplayTemplate(
  template: string,
  tokens: Readonly<Record<string, string>>,
): string | null {
  let unresolved = false;
  const resolved = template.replace(
    ROLEPLAY_TEMPLATE_TOKEN_PATTERN,
    (_match, tokenName: string) => {
      if (!Object.hasOwn(tokens, tokenName)) {
        unresolved = true;
        return `{{${tokenName}}}`;
      }
      return tokens[tokenName];
    },
  );
  if (unresolved || /\{\{\s*[A-Za-z][A-Za-z0-9_]*\s*\}\}/u.test(resolved)) return null;
  const normalized = resolved.replace(/\s+/gu, " ").trim();
  return normalized || null;
}

function resolveRoleplayCounterEligibility(
  contract: RoleplayOutcomeContractDefinition,
  scope: RoleplayScope,
  sceneImpact: RoleplaySceneImpact,
) {
  return contract.counterEligibility.byImpact?.[sceneImpact] ??
    contract.counterEligibility.byScope?.[scope] ??
    contract.counterEligibility.default;
}

export function resolveRoleplayOutcomeContract(
  contract: RoleplayOutcomeContractDefinition,
  authoring: RoleplayOutcomeContractAuthoring,
): ResolvedRoleplayOutcomeContract | null {
  if (
    contract.intention !== authoring.intention ||
    contract.methodId !== authoring.methodId ||
    !contract.supportedScopes.includes(authoring.scope)
  ) {
    return null;
  }

  const scopeTokens = contract.scopeTokens[authoring.scope];
  const impactFragment = contract.impactFragments[authoring.sceneImpact];
  if (scopeTokens === undefined || impactFragment === undefined) return null;

  const resolvedImpact = resolveRoleplayTemplate(impactFragment, scopeTokens);
  if (!resolvedImpact) return null;
  const successOutcome = resolveRoleplayTemplate(contract.outcomeTemplate, {
    ...scopeTokens,
    impact: resolvedImpact,
  });
  if (!successOutcome) return null;

  return {
    contractId: contract.id,
    scope: authoring.scope,
    sceneImpact: authoring.sceneImpact,
    successOutcome,
    counterEligible: resolveRoleplayCounterEligibility(
      contract,
      authoring.scope,
      authoring.sceneImpact,
    ),
    privilegeCostKey: contract.privilegeCostKey,
  };
}

export function getRoleplayOutcomeContractsForMethod(
  intention: RoleplayIntention,
  methodId: RoleplayMethodId,
) {
  return ROLEPLAY_OUTCOME_CONTRACTS.filter(
    (contract) =>
      contract.intention === intention && contract.methodId === methodId,
  );
}

export function getRoleplayCompletedScopesForContract(
  contract: RoleplayOutcomeContractDefinition,
) {
  return ROLEPLAY_SCOPE_OPTIONS.map((option) => option.value).filter(
    (scope) =>
      contract.supportedScopes.includes(scope) &&
      getRoleplayCompletedImpactsForContract(contract, scope).length > 0,
  );
}

export function getRoleplayCompletedImpactsForContract(
  contract: RoleplayOutcomeContractDefinition,
  scope: RoleplayScope,
) {
  return ROLEPLAY_SCENE_IMPACT_OPTIONS.map((option) => option.value).filter(
    (sceneImpact) =>
      resolveRoleplayOutcomeContract(contract, {
        intention: contract.intention,
        methodId: contract.methodId,
        scope,
        sceneImpact,
      }) !== null,
  );
}

export function enumerateRoleplayResolvedContractCells(
  contract: RoleplayOutcomeContractDefinition,
) {
  return contract.supportedScopes.flatMap((scope) =>
    ROLEPLAY_SCENE_IMPACT_OPTIONS.flatMap((option) => {
      const resolved = resolveRoleplayOutcomeContract(contract, {
        intention: contract.intention,
        methodId: contract.methodId,
        scope,
        sceneImpact: option.value,
      });
      return resolved ? [resolved] : [];
    }),
  );
}

export function auditRoleplayStandardLibrary(): RoleplayStandardLibraryAudit {
  const contractIds = ROLEPLAY_OUTCOME_CONTRACTS.map((contract) => contract.id);
  const privilegeKeys = ROLEPLAY_OUTCOME_CONTRACTS.map(
    (contract) => contract.privilegeCostKey,
  );
  const duplicateValues = (values: readonly string[]) =>
    [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
  const duplicateIds = duplicateValues(contractIds);
  const duplicatePrivilegeKeys = duplicateValues(privilegeKeys);
  const missingScopeTokenFragments: string[] = [];
  const unresolvedTemplateTokens: string[] = [];
  const invalidMethodOwnership: string[] = [];
  const blankGeneratedOutcomes: string[] = [];
  const duplicateCompletedCells: string[] = [];
  const counterResolutionErrors: string[] = [];
  const completedCellKeys = new Set<string>();
  const missingCellsByContract = {} as RoleplayStandardLibraryAudit["missingCellsByContract"];
  const supportedScopesByContract = {} as RoleplayStandardLibraryAudit["supportedScopesByContract"];
  const completedImpactsByContractScope: Record<string, RoleplaySceneImpact[]> = {};
  let plannedCellCount = 0;
  let completedCellCount = 0;

  for (const registryContract of ROLEPLAY_OUTCOME_CONTRACTS) {
    const contract: RoleplayOutcomeContractDefinition = registryContract;
    const method = getRoleplayMethodDefinition(contract.methodId);
    if (!method || method.intention !== contract.intention) {
      invalidMethodOwnership.push(`${contract.id}:${contract.intention}/${contract.methodId}`);
    }
    supportedScopesByContract[contract.id] = [...contract.supportedScopes];
    missingCellsByContract[contract.id] = [];
    plannedCellCount += contract.supportedScopes.length * ROLEPLAY_SCENE_IMPACT_OPTIONS.length;

    for (const scope of contract.supportedScopes) {
      if (contract.scopeTokens[scope] === undefined) {
        missingScopeTokenFragments.push(`${contract.id}:${scope}`);
      }
      completedImpactsByContractScope[`${contract.id}:${scope}`] =
        getRoleplayCompletedImpactsForContract(contract, scope);

      for (const { value: sceneImpact } of ROLEPLAY_SCENE_IMPACT_OPTIONS) {
        const authoring = {
          intention: contract.intention,
          methodId: contract.methodId,
          scope,
          sceneImpact,
        };
        const resolved = resolveRoleplayOutcomeContract(contract, authoring);
        if (!resolved) {
          missingCellsByContract[contract.id].push({ scope, sceneImpact });
          const scopeTokens = contract.scopeTokens[scope];
          const impactFragment = contract.impactFragments[sceneImpact];
          if (scopeTokens !== undefined && impactFragment !== undefined) {
            const resolvedImpact = resolveRoleplayTemplate(impactFragment, scopeTokens);
            if (!resolvedImpact) {
              unresolvedTemplateTokens.push(`${contract.id}:${scope}:${sceneImpact}:impact`);
            } else if (
              !resolveRoleplayTemplate(contract.outcomeTemplate, {
                ...scopeTokens,
                impact: resolvedImpact,
              })
            ) {
              unresolvedTemplateTokens.push(`${contract.id}:${scope}:${sceneImpact}:outcome`);
            }
          }
          continue;
        }

        completedCellCount += 1;
        const cellKey = `${resolved.contractId}:${resolved.scope}:${resolved.sceneImpact}`;
        if (completedCellKeys.has(cellKey)) duplicateCompletedCells.push(cellKey);
        completedCellKeys.add(cellKey);
        if (!resolved.successOutcome.trim()) blankGeneratedOutcomes.push(cellKey);
        if (typeof resolved.counterEligible !== "boolean") {
          counterResolutionErrors.push(cellKey);
        }
      }
    }
  }

  const structuralErrors = [
    ...duplicateIds.map((value) => `duplicate-id:${value}`),
    ...duplicatePrivilegeKeys.map((value) => `duplicate-key:${value}`),
    ...ROLEPLAY_OUTCOME_CONTRACTS.filter(
      (contract) => contract.privilegeCostKey !== contract.id,
    ).map((contract) => `invalid-family-key:${contract.id}:${contract.privilegeCostKey}`),
    ...invalidMethodOwnership.map((value) => `invalid-method:${value}`),
    ...blankGeneratedOutcomes.map((value) => `blank-outcome:${value}`),
    ...duplicateCompletedCells.map((value) => `duplicate-cell:${value}`),
    ...counterResolutionErrors.map((value) => `counter:${value}`),
    ...unresolvedTemplateTokens.map((value) => `token:${value}`),
  ];

  return {
    methodIds: ROLEPLAY_METHODS.map((method) => method.id),
    contractIds,
    privilegeKeys,
    plannedCellCount,
    completedCellCount,
    missingCellCount: plannedCellCount - completedCellCount,
    missingCellsByContract,
    supportedScopesByContract,
    completedImpactsByContractScope,
    missingScopeTokenFragments,
    unresolvedTemplateTokens,
    duplicateIds,
    duplicatePrivilegeKeys,
    invalidMethodOwnership,
    blankGeneratedOutcomes,
    duplicateCompletedCells,
    counterResolutionErrors,
    structuralErrors,
  };
}

export function isRoleplayOutcomeContractCompatible(
  contract: RoleplayOutcomeContractDefinition,
  authoring: RoleplayAbilityAuthoring,
) {
  return resolveRoleplayOutcomeContract(contract, authoring) !== null;
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
    return resolveRoleplayOutcomeContract(contract, ability)?.successOutcome ?? "";
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
    ? (resolveRoleplayOutcomeContract(contract, ability)?.counterEligible ?? false)
    : false;
}

export function reconcileRoleplayAbilityContract(ability: RoleplayAbility): RoleplayAbility {
  if (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW) return ability;
  if (ability.outcomeContractId === ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED) {
    return ability.counter ? { ...ability, counter: false } : ability;
  }

  const contract = getRoleplayOutcomeContract(ability.outcomeContractId);
  const resolved = contract
    ? resolveRoleplayOutcomeContract(contract, ability)
    : null;
  if (!contract || !resolved) {
    return {
      ...ability,
      outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
      counter: false,
    };
  }
  if (!resolved.counterEligible && ability.counter) {
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

export function selectRoleplayAbilityOutcomeContract(
  ability: RoleplayAbility,
  outcomeContractId: RoleplayOutcomeContractId,
): RoleplayAbility {
  const contract = getRoleplayOutcomeContract(outcomeContractId);
  if (!contract) {
    return reconcileRoleplayAbilityAuthoring({ ...ability, outcomeContractId });
  }
  if (
    contract.intention !== ability.intention ||
    contract.methodId !== ability.methodId
  ) {
    return reconcileRoleplayAbilityAuthoring({
      ...ability,
      outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
      counter: false,
    });
  }

  const completedScopes = getRoleplayCompletedScopesForContract(contract);
  const scope = completedScopes.includes(ability.scope)
    ? ability.scope
    : completedScopes[0];
  if (!scope) {
    return reconcileRoleplayAbilityAuthoring({
      ...ability,
      outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
      counter: false,
    });
  }
  const completedImpacts = getRoleplayCompletedImpactsForContract(contract, scope);
  const sceneImpact = completedImpacts.includes(ability.sceneImpact)
    ? ability.sceneImpact
    : completedImpacts[0];
  if (!sceneImpact) {
    return reconcileRoleplayAbilityAuthoring({
      ...ability,
      outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
      counter: false,
    });
  }
  return reconcileRoleplayAbilityAuthoring({
    ...ability,
    outcomeContractId,
    scope,
    sceneImpact,
  });
}

export function selectRoleplayAbilityScope(
  ability: RoleplayAbility,
  requestedScope: RoleplayScope,
): RoleplayAbility {
  const contract = getRoleplayOutcomeContract(ability.outcomeContractId);
  if (!contract) {
    return reconcileRoleplayAbilityAuthoring({ ...ability, scope: requestedScope });
  }
  const completedScopes = getRoleplayCompletedScopesForContract(contract);
  const scope = completedScopes.includes(requestedScope)
    ? requestedScope
    : completedScopes[0];
  if (!scope) return reconcileRoleplayAbilityAuthoring(ability);
  const completedImpacts = getRoleplayCompletedImpactsForContract(contract, scope);
  const sceneImpact = completedImpacts.includes(ability.sceneImpact)
    ? ability.sceneImpact
    : completedImpacts[0];
  if (!sceneImpact) return reconcileRoleplayAbilityAuthoring(ability);
  return reconcileRoleplayAbilityAuthoring({ ...ability, scope, sceneImpact });
}

export function selectRoleplayAbilitySceneImpact(
  ability: RoleplayAbility,
  requestedImpact: RoleplaySceneImpact,
): RoleplayAbility {
  const contract = getRoleplayOutcomeContract(ability.outcomeContractId);
  if (!contract) {
    return reconcileRoleplayAbilityAuthoring({
      ...ability,
      sceneImpact: requestedImpact,
    });
  }
  const completedImpacts = getRoleplayCompletedImpactsForContract(
    contract,
    ability.scope,
  );
  const sceneImpact = completedImpacts.includes(requestedImpact)
    ? requestedImpact
    : completedImpacts[0];
  if (!sceneImpact) return reconcileRoleplayAbilityAuthoring(ability);
  return reconcileRoleplayAbilityAuthoring({ ...ability, sceneImpact });
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
    restriction: null,
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
        enumerateRoleplayResolvedContractCells(contract).some(
          (cell) =>
            normalizeOutcomeForMigration(cell.successOutcome) === normalizedLegacyOutcome,
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
  const restrictionMigration = migrateLegacyRoleplayRestriction({
    ...record,
    restrictionTag,
  });
  const legacyRestrictionResolved =
    restrictionMigration.definition !== null || restrictionMigration.migrationApplied;

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
    restriction: restrictionMigration.definition,
    restrictionType: legacyRestrictionResolved
      ? "NONE"
      : restrictionMigration.legacySource.restrictionType,
    restrictionBand: legacyRestrictionResolved
      ? "NONE_COSMETIC"
      : restrictionMigration.legacySource.restrictionBand,
    restrictionTag: legacyRestrictionResolved
      ? ""
      : restrictionMigration.legacySource.restrictionTag,
    restrictionText: legacyRestrictionResolved
      ? ""
      : restrictionMigration.legacySource.restrictionText,
  });
}

export function getRoleplayRestrictionTransitionIssues(input: unknown): RestrictionIssue[] {
  return diagnoseRoleplayRestrictionTransition(input);
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

  const targetPhrase = defaultTargetPhrase(ability.scope);
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
  const resolved = contract
    ? resolveRoleplayOutcomeContract(contract, ability)
    : null;
  if (contract && !isRoleplayOutcomeContractCompatible(contract, ability)) {
    warnings.push(
      "The selected Outcome Contract is incompatible with the current Intention, Method, Scene Impact, or Scope.",
    );
  }
  if (contract && ability.counter && !resolved?.counterEligible) {
    warnings.push("The selected Outcome Contract does not permit Counter authoring.");
  }
  return warnings;
}
