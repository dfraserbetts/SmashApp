import {
  ROLEPLAY_METHODS,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  ROLEPLAY_METHOD_UNSELECTED,
  ROLEPLAY_OUTCOME_CONTRACTS,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
  createDefaultRoleplayAbility,
  getRoleplayAbilityOutcomeLane,
  getRoleplayAbilitySuccessOutcome,
  getRoleplayAbilityWarnings,
  getRoleplayMethodDefinition,
  getRoleplayOutcomeContract,
  reconcileRoleplayAbilityAuthoring,
  renderRoleplayAbilityDescriptor,
  type RoleplayDiceCount,
  type RoleplayIntention,
  type RoleplayOutcomeLane,
  type RoleplaySceneImpact,
  type RoleplayScope,
  type RoleplayStandardMethodId,
  type RoleplayStandardOutcomeContractId,
} from "../lib/characterBuilder/roleplayAbilities";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${String(expected)}\nActual: ${String(actual)}`);
  }
}

type ClosedBetaLoadout = {
  archetype: string;
  name: string;
  narrativeTheme: string;
  intention: RoleplayIntention;
  methodId: RoleplayStandardMethodId;
  outcomeContractId: RoleplayStandardOutcomeContractId;
  scope: RoleplayScope;
  sceneImpact: RoleplaySceneImpact;
  diceCount: RoleplayDiceCount;
  counter: boolean;
  outcomeLane: RoleplayOutcomeLane;
};

const loadouts: readonly ClosedBetaLoadout[] = [
  {
    archetype: "The Envoy",
    name: "A Fair Exchange",
    narrativeTheme:
      "You calmly identify what the other person actually values and offer one honest agreement that respects both sides.",
    intention: "PERSUASION",
    methodId: "APPEAL",
    outcomeContractId: "SECURE_WILLING_COOPERATION",
    scope: "ONE_TARGET",
    sceneImpact: "STANDARD",
    diceCount: 3,
    counter: false,
    outcomeLane: "HELP",
  },
  {
    archetype: "The Envoy",
    name: "The Evidence Speaks",
    narrativeTheme:
      "You assemble the records, physical signs, and corroborating details into one clear demonstration that every accepted witness can independently verify.",
    intention: "PERCEPTION",
    methodId: "PROVE",
    outcomeContractId: "ESTABLISH_VERIFIED_TRUTH",
    scope: "SMALL_GROUP",
    sceneImpact: "MAJOR",
    diceCount: 3,
    counter: false,
    outcomeLane: "HELP",
  },
  {
    archetype: "The Captain",
    name: "Hold Together",
    narrativeTheme:
      "You cut through panic with one clear shared priority and remind everyone why they must act together now.",
    intention: "PERSUASION",
    methodId: "RALLY",
    outcomeContractId: "ESTABLISH_SHARED_RESOLVE",
    scope: "SMALL_GROUP",
    sceneImpact: "STANDARD",
    diceCount: 3,
    counter: false,
    outcomeLane: "HELP",
  },
  {
    archetype: "The Captain",
    name: "One More Step",
    narrativeTheme:
      "You accept the fear and exhaustion without denying them, remember the people depending on you, and recommit to the promise carrying you forward.",
    intention: "PERSUASION",
    methodId: "STEEL_YOURSELF",
    outcomeContractId: "SUSTAIN_PERSONAL_RESOLVE",
    scope: "SELF",
    sceneImpact: "MAJOR",
    diceCount: 3,
    counter: false,
    outcomeLane: "HELP",
  },
  {
    archetype: "The Captain",
    name: "Face Me",
    narrativeTheme:
      "You step openly into the threat's attention and make ignoring your challenge feel like a public admission of weakness.",
    intention: "INTIMIDATION",
    methodId: "CHALLENGE",
    outcomeContractId: "DRAW_HOSTILE_ATTENTION",
    scope: "ONE_TARGET",
    sceneImpact: "MINOR",
    diceCount: 3,
    counter: false,
    outcomeLane: "HINDER",
  },
  {
    archetype: "The Trickster",
    name: "Wrong Door",
    narrativeTheme:
      "You combine selective truth, confident timing, and one staged detail to lead the target toward the wrong immediate conclusion.",
    intention: "DECEPTION",
    methodId: "MISDIRECT",
    outcomeContractId: "ESTABLISH_FALSE_BELIEF",
    scope: "ONE_TARGET",
    sceneImpact: "STANDARD",
    diceCount: 3,
    counter: false,
    outcomeLane: "HINDER",
  },
  {
    archetype: "The Trickster",
    name: "All Eyes Here",
    narrativeTheme:
      "You create one urgent, spectacular commotion that captures the whole patrol's active attention for a brief opening.",
    intention: "DECEPTION",
    methodId: "DISTRACT",
    outcomeContractId: "DIVERT_IMMEDIATE_ATTENTION",
    scope: "SMALL_GROUP",
    sceneImpact: "MINOR",
    diceCount: 3,
    counter: false,
    outcomeLane: "HINDER",
  },
  {
    archetype: "The Seeker",
    name: "What Are They Hiding?",
    narrativeTheme:
      "You compare what the subject says, what they avoid, and what the surrounding evidence makes difficult to explain.",
    intention: "PERCEPTION",
    methodId: "DISCERN_TRUTH",
    outcomeContractId: "UNCOVER_CONCEALED_TRUTH",
    scope: "ONE_TARGET",
    sceneImpact: "STANDARD",
    diceCount: 3,
    counter: false,
    outcomeLane: "HELP",
  },
  {
    archetype: "The Seeker",
    name: "The Weak Link",
    narrativeTheme:
      "You study repeated patterns, dependencies, and overlooked constraints until the central practical vulnerability becomes clear.",
    intention: "PERCEPTION",
    methodId: "DISCERN_TRUTH",
    outcomeContractId: "REVEAL_EXPLOITABLE_WEAKNESS",
    scope: "ONE_TARGET",
    sceneImpact: "MAJOR",
    diceCount: 3,
    counter: false,
    outcomeLane: "HELP",
  },
  {
    archetype: "The Seeker",
    name: "Trail Through Ash",
    narrativeTheme:
      "You separate the group's shared passage from the chaos around it by reading disturbed ash, hurried movement, fading signs, and corroborating sightings.",
    intention: "PERCEPTION",
    methodId: "TRACK",
    outcomeContractId: "TRACE_QUARRY",
    scope: "SMALL_GROUP",
    sceneImpact: "STANDARD",
    diceCount: 3,
    counter: false,
    outcomeLane: "HELP",
  },
  {
    archetype: "The Guardian",
    name: "Down, Stay Quiet",
    narrativeTheme:
      "You sweep the frightened civilians into one coherent concealed pocket and draw the immediate danger past them.",
    intention: "INTERVENTION",
    methodId: "RESCUE",
    outcomeContractId: "HIDE_FROM_IMMEDIATE_DANGER",
    scope: "SMALL_GROUP",
    sceneImpact: "MINOR",
    diceCount: 3,
    counter: false,
    outcomeLane: "HELP",
  },
  {
    archetype: "The Guardian",
    name: "Everyone Clear",
    narrativeTheme:
      "You identify one viable route through the collapsing district and coordinate the entire accepted group through it before the peril closes.",
    intention: "INTERVENTION",
    methodId: "RESCUE",
    outcomeContractId: "SECURE_IMMEDIATE_SAFETY",
    scope: "SMALL_GROUP",
    sceneImpact: "STANDARD",
    diceCount: 3,
    counter: false,
    outcomeLane: "HELP",
  },
  {
    archetype: "The Guardian",
    name: "Not This Time",
    narrativeTheme:
      "At the decisive moment, you interpose, expose the opening in the hostile act, and break it before it can resolve.",
    intention: "INTERVENTION",
    methodId: "INTERRUPT",
    outcomeContractId: "DENY_IMMINENT_HOSTILE_ACT",
    scope: "ONE_TARGET",
    sceneImpact: "MAJOR",
    diceCount: 3,
    counter: true,
    outcomeLane: "HINDER",
  },
  {
    archetype: "The Dread Herald",
    name: "Your Hunt Ends Here",
    narrativeTheme:
      "You reveal the full consequence of continuing the hunt and make the group's defining course of opposition feel impossible to justify or survive.",
    intention: "INTIMIDATION",
    methodId: "OVERAWE",
    outcomeContractId: "BREAK_SHARED_RESOLVE",
    scope: "SMALL_GROUP",
    sceneImpact: "LEGENDARY",
    diceCount: 3,
    counter: false,
    outcomeLane: "HINDER",
  },
];

assertEqual(loadouts.length, 14, "Closed Beta pack must contain fourteen loadouts.");

const runtimeDeclarationFields = [
  "declaredAim",
  "declaredPersonalCourse",
  "declaredQuarry",
  "declaredTruth",
  "quarry",
  "quarryId",
  "quarryMembers",
  "startingConnection",
  "trail",
  "trailText",
  "trackingObjective",
  "trackingRoute",
  "quarrySignature",
  "pursuitState",
  "truthClaim",
  "verifiedTruth",
  "proof",
  "proofText",
  "evidence",
  "evidenceText",
  "evidentiaryBasis",
  "audienceMembers",
  "truthSubject",
  "supportingDetail",
  "conclusion",
] as const;

const resolvedLoadouts = loadouts.map((fixture, index) => {
  const method = getRoleplayMethodDefinition(fixture.methodId);
  const contract = getRoleplayOutcomeContract(fixture.outcomeContractId);
  assert(method, `${fixture.name} Method is missing from the live registry.`);
  assert(contract, `${fixture.name} contract is missing from the live registry.`);

  const ability = reconcileRoleplayAbilityAuthoring({
    ...createDefaultRoleplayAbility(index),
    name: fixture.name,
    narrativeTheme: fixture.narrativeTheme,
    intention: fixture.intention,
    methodId: fixture.methodId,
    outcomeContractId: fixture.outcomeContractId,
    scope: fixture.scope,
    sceneImpact: fixture.sceneImpact,
    diceCount: fixture.diceCount,
    counter: fixture.counter,
  });
  const outcome = getRoleplayAbilitySuccessOutcome(ability);
  const descriptor = renderRoleplayAbilityDescriptor(ability);
  const warnings = getRoleplayAbilityWarnings(ability);

  assert(ability.name.trim(), `${fixture.name} has a blank name.`);
  assert(ability.narrativeTheme.trim(), `${fixture.name} has a blank Narrative Theme.`);
  assert(
    ability.methodId !== ROLEPLAY_METHOD_UNSELECTED &&
      ability.methodId !== ROLEPLAY_METHOD_CUSTOM_REVIEW,
    `${fixture.name} resolved to an Unselected or Custom Method.`,
  );
  assert(
    ability.outcomeContractId !== ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED &&
      ability.outcomeContractId !== ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
    `${fixture.name} resolved to an Unselected or Custom Outcome Contract.`,
  );
  assertEqual(ability.methodId, fixture.methodId, `${fixture.name} Method drifted.`);
  assertEqual(
    ability.outcomeContractId,
    fixture.outcomeContractId,
    `${fixture.name} contract drifted.`,
  );
  assertEqual(ability.scope, fixture.scope, `${fixture.name} Scope drifted.`);
  assertEqual(ability.sceneImpact, fixture.sceneImpact, `${fixture.name} Impact drifted.`);
  assertEqual(
    getRoleplayAbilityOutcomeLane(ability),
    fixture.outcomeLane,
    `${fixture.name} Outcome Lane drifted.`,
  );
  assert(outcome.trim(), `${fixture.name} has no resolved outcome.`);
  assert(descriptor.trim(), `${fixture.name} has no generated descriptor.`);
  assert(descriptor.includes("On success,"), `${fixture.name} descriptor is incomplete.`);
  assert(!/\{\{[^}]+\}\}/u.test(outcome), `${fixture.name} outcome has unresolved tokens.`);
  assert(!/\{\{[^}]+\}\}/u.test(descriptor), `${fixture.name} descriptor has unresolved tokens.`);
  assertEqual(descriptor.match(/\.+$/u)?.[0], ".", `${fixture.name} needs exactly one final period.`);
  assert(
    !warnings.some(
      (warning) => warning.includes("Custom Method") || warning.includes("Custom Outcome"),
    ),
    `${fixture.name} produced a Custom approval warning.`,
  );
  assertEqual(ability.counter, fixture.counter, `${fixture.name} Counter state drifted.`);

  if (!fixture.counter) {
    const forcedCounterCheck = reconcileRoleplayAbilityAuthoring({ ...ability, counter: true });
    assertEqual(
      forcedCounterCheck.counter,
      false,
      `${fixture.name} must force an ineligible Counter request false.`,
    );
  }

  for (const field of runtimeDeclarationFields) {
    assert(!Object.hasOwn(ability, field), `${fixture.name} stored runtime field ${field}.`);
  }

  return { fixture, ability, descriptor };
});

const enabledCounters = resolvedLoadouts.filter(({ ability }) => ability.counter);
assertEqual(enabledCounters.length, 1, "Exactly one Closed Beta loadout must enable Counter.");
assertEqual(enabledCounters[0]?.fixture.name, "Not This Time", "The Counter loadout must be Not This Time.");

const representedMethods = new Set(resolvedLoadouts.map(({ ability }) => ability.methodId));
assertEqual(representedMethods.size, 12, "Every standard Method must appear at least once.");
assertEqual(ROLEPLAY_METHODS.length, 12, "Live Method total drifted.");
for (const method of ROLEPLAY_METHODS) {
  assert(representedMethods.has(method.id), `${method.id} is absent from Method coverage.`);
}

const contractCounts = new Map<string, number>();
for (const { ability } of resolvedLoadouts) {
  contractCounts.set(
    ability.outcomeContractId,
    (contractCounts.get(ability.outcomeContractId) ?? 0) + 1,
  );
}
assertEqual(contractCounts.size, 14, "Every standard contract must appear exactly once.");
assertEqual(ROLEPLAY_OUTCOME_CONTRACTS.length, 14, "Live contract total drifted.");
for (const contract of ROLEPLAY_OUTCOME_CONTRACTS) {
  assertEqual(contractCounts.get(contract.id), 1, `${contract.id} must appear exactly once.`);
}

assertEqual(
  [...new Set(resolvedLoadouts.map(({ ability }) => ability.scope))].sort().join(","),
  ["ONE_TARGET", "SELF", "SMALL_GROUP"].sort().join(","),
  "Closed Beta Scope coverage drifted.",
);
assertEqual(
  [...new Set(resolvedLoadouts.map(({ ability }) => ability.sceneImpact))].sort().join(","),
  ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"].sort().join(","),
  "Closed Beta Impact coverage drifted.",
);
assertEqual(
  [...new Set(resolvedLoadouts.map(({ ability }) => getRoleplayAbilityOutcomeLane(ability)))]
    .sort()
    .join(","),
  ["HELP", "HINDER"].sort().join(","),
  "Closed Beta Outcome Lane coverage drifted.",
);

let currentArchetype = "";
for (const { fixture, descriptor } of resolvedLoadouts) {
  if (fixture.archetype !== currentArchetype) {
    currentArchetype = fixture.archetype;
    console.log(`\n${currentArchetype}`);
  }
  console.log(`- ${fixture.name}`);
  console.log(`  Method: ${fixture.methodId}`);
  console.log(`  Contract: ${fixture.outcomeContractId}`);
  console.log(`  Scope: ${fixture.scope}`);
  console.log(`  Impact: ${fixture.sceneImpact}`);
  console.log(`  Descriptor: ${descriptor}`);
}

console.log("\nPASS roleplay closed beta loadout smoke");
