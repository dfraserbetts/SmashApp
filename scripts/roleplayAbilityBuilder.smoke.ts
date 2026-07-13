import {
  ROLEPLAY_METHODS,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  ROLEPLAY_METHOD_UNSELECTED,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
  createDefaultRoleplayAbility,
  getCompatibleRoleplayOutcomeContracts,
  getRoleplayAbilityContractName,
  getRoleplayAbilityMethodName,
  getRoleplayAbilityCounterEligibility,
  getRoleplayAbilityOutcomeLane,
  getRoleplayAbilitySuccessOutcome,
  getRoleplayAbilityWarnings,
  getRoleplayMethodDefinition,
  getRoleplayMethodsForIntention,
  getRoleplayOutcomeContract,
  normalizeRoleplayAbility,
  reconcileRoleplayAbilityAuthoring,
  reconcileRoleplayAbilityContract,
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

const youShallNotPass = normalizeRoleplayAbility(
  {
    name: "You Shall Not Pass",
    description: "Gandalf bars the enemy's advance.",
    intention: "INTERVENTION",
    specific: "INTERRUPT",
    sceneImpact: "MAJOR",
    scope: "ONE_TARGET",
    diceCount: 4,
    outcomeLane: "HINDER",
    successOutcome: "the target's current or next hostile action fails",
    counter: true,
    restrictionType: "TARGET_ELIGIBILITY",
    restrictionBand: "HARSH",
    restrictionTag: "one Agent of Morgoth",
  },
  0,
);

assertEqual(
  youShallNotPass.outcomeContractId,
  "DENY_IMMINENT_HOSTILE_ACT",
  "You Shall Not Pass should migrate to Deny Imminent Hostile Act.",
);
assertEqual(youShallNotPass.methodId, "INTERRUPT", "Legacy Interrupt migration failed.");
assertEqual(
  youShallNotPass.narrativeTheme,
  "Gandalf bars the enemy's advance.",
  "Legacy description should migrate to Narrative Theme.",
);
assertEqual(
  getRoleplayAbilityOutcomeLane(youShallNotPass),
  "HINDER",
  "Deny Imminent Hostile Act should derive Hinder.",
);
assertEqual(
  getRoleplayAbilitySuccessOutcome(youShallNotPass),
  "the target's current or next hostile action fails",
  "Deny Imminent Hostile Act derived outcome mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(youShallNotPass),
  true,
  "Deny Imminent Hostile Act should permit Counter authoring.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(youShallNotPass),
  "Choose one Agent of Morgoth and roll 4 dice. On success, the target's current or next hostile action fails.",
  "You Shall Not Pass descriptor mismatch.",
);
assert(
  !Object.hasOwn(youShallNotPass, "successOutcome"),
  "Normalized data must not retain successOutcome.",
);
assert(
  !Object.hasOwn(youShallNotPass, "outcomeLane"),
  "Normalized data must not retain outcomeLane.",
);
for (const obsoleteField of ["outputCategory", "outputSubtype", "crisisAssist"]) {
  assert(
    !Object.hasOwn(youShallNotPass, obsoleteField),
    `Normalized data must not retain ${obsoleteField}.`,
  );
}
for (const legacyField of ["specific", "description"]) {
  assert(
    !Object.hasOwn(youShallNotPass, legacyField),
    `Normalized data must not retain ${legacyField}.`,
  );
}

const frodoHide = normalizeRoleplayAbility(
  {
    name: "Frodo Hide!",
    description: "A warning sends Frodo diving out of sight.",
    intention: "INTERVENTION",
    specific: "RESCUE",
    sceneImpact: "MINOR",
    scope: "ONE_TARGET",
    diceCount: 3,
    outcomeLane: "HELP",
    successOutcome: "the target becomes hidden from the immediate danger",
    counter: true,
    restrictionType: "TARGET_ELIGIBILITY",
    restrictionBand: "HARSH",
    restrictionTag: "Frodo",
  },
  1,
);

assertEqual(
  frodoHide.outcomeContractId,
  "HIDE_FROM_IMMEDIATE_DANGER",
  "Frodo Hide should migrate to Hide from Immediate Danger.",
);
assertEqual(frodoHide.methodId, "RESCUE", "Legacy Rescue migration failed.");
assertEqual(
  getRoleplayAbilityOutcomeLane(frodoHide),
  "HELP",
  "Hide from Immediate Danger should derive Help.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(frodoHide),
  false,
  "Hide from Immediate Danger should not permit Counter authoring.",
);
assertEqual(frodoHide.counter, false, "Hide contract should force Counter off.");
assertEqual(
  renderRoleplayAbilityDescriptor(frodoHide),
  "Choose Frodo and roll 3 dice. On success, the target becomes hidden from the immediate danger.",
  "Frodo Hide descriptor mismatch.",
);

const unknownLegacyOutcomeText = "the crowd accepts the bearer as their lost queen";
const unknownLegacyOutcome = normalizeRoleplayAbility(
  {
    intention: "PERSUASION",
    specific: "APPEAL",
    sceneImpact: "STANDARD",
    scope: "SMALL_GROUP",
    outcomeLane: "HINDER",
    successOutcome: unknownLegacyOutcomeText,
  },
  2,
);
assertEqual(
  unknownLegacyOutcome.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  "Unknown legacy prose should migrate to Custom Review.",
);
assertEqual(
  unknownLegacyOutcome.customOutcomeRequest,
  unknownLegacyOutcomeText,
  "Unknown legacy prose should be preserved exactly.",
);
assertEqual(
  unknownLegacyOutcome.customOutcomeLane,
  "HINDER",
  "Valid legacy lane should be preserved for Custom Review.",
);
assert(
  getRoleplayAbilityWarnings(unknownLegacyOutcome).some((warning) =>
    warning.includes("Game Director approval") && warning.includes("automatically costed"),
  ),
  "Custom Review should warn about approval and automatic costing.",
);

const incompatibleKnownOutcome = normalizeRoleplayAbility(
  {
    intention: "INTERVENTION",
    specific: "RESCUE",
    sceneImpact: "MINOR",
    scope: "ONE_TARGET",
    outcomeLane: "HINDER",
    successOutcome: "the target's current or next hostile action fails",
  },
  3,
);
assertEqual(
  incompatibleKnownOutcome.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  "A known outcome with incompatible authoring should migrate to Custom Review.",
);
assertEqual(
  incompatibleKnownOutcome.customOutcomeRequest,
  "the target's current or next hostile action fails",
  "Incompatible known outcome text should be preserved for review.",
);

const blankLegacyOutcome = normalizeRoleplayAbility(
  {
    intention: "PERSUASION",
    specific: "ENCOURAGE",
    successOutcome: "",
  },
  4,
);
assertEqual(
  blankLegacyOutcome.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
  "Blank legacy outcome should migrate to Unselected.",
);
assert(
  renderRoleplayAbilityDescriptor(blankLegacyOutcome).includes(
    "[select an outcome contract]",
  ),
  "Unselected descriptor should request an Outcome Contract.",
);
assert(
  getRoleplayAbilityWarnings(blankLegacyOutcome).includes("Outcome Contract is required."),
  "Unselected ability should warn that Outcome Contract is required.",
);

const hideAuthoring = {
  intention: "INTERVENTION" as const,
  methodId: "RESCUE" as const,
  sceneImpact: "MINOR" as const,
  scope: "ONE_TARGET" as const,
};
assertEqual(
  getCompatibleRoleplayOutcomeContracts(hideAuthoring).map((contract) => contract.id).join(","),
  "HIDE_FROM_IMMEDIATE_DANGER",
  "Only Hide should match its approved authoring combination.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts({ ...hideAuthoring, sceneImpact: "MAJOR" }).length,
  0,
  "Hide should not match an incompatible Impact.",
);

const denyAuthoring = {
  intention: "INTERVENTION" as const,
  methodId: "INTERRUPT" as const,
  sceneImpact: "MAJOR" as const,
  scope: "ONE_TARGET" as const,
};
assertEqual(
  getCompatibleRoleplayOutcomeContracts(denyAuthoring).map((contract) => contract.id).join(","),
  "DENY_IMMINENT_HOSTILE_ACT",
  "Only Deny should match its approved authoring combination.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts({ ...denyAuthoring, scope: "SMALL_GROUP" }).length,
  0,
  "Deny should not match an incompatible Scope.",
);

const denyWithCounter = reconcileRoleplayAbilityContract({
  ...createDefaultRoleplayAbility(4),
  ...denyAuthoring,
  outcomeContractId: "DENY_IMMINENT_HOSTILE_ACT",
  counter: true,
});
assertEqual(denyWithCounter.counter, true, "Deny should preserve requested Counter.");

const invalidatedDeny = reconcileRoleplayAbilityContract({
  ...denyWithCounter,
  sceneImpact: "MINOR",
});
assertEqual(
  invalidatedDeny.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
  "Incompatible Deny authoring should clear the contract.",
);
assertEqual(invalidatedDeny.counter, false, "Clearing Deny should also clear Counter.");

const drawHostileAttentionOutcomes = {
  MINOR:
    "the next time the target acts with hostility, it must direct that hostility at you, if you are a valid target",
  STANDARD:
    "until the end of the target's next turn in combat, or the end of the current meaningful exchange outside combat, whenever the target acts with hostility, it must direct that hostility at you, if you are a valid target",
  MAJOR:
    "for the rest of the current scene, whenever the target acts with hostility, it must direct that hostility at you, if you are a valid target",
  LEGENDARY:
    "the target recognises you as its personal rival until the rivalry is narratively resolved",
} as const;

const drawHostileAttentionDescriptors = {
  MINOR:
    "Choose one target and roll 3 dice. On success, the next time the target acts with hostility, it must direct that hostility at you, if you are a valid target.",
  STANDARD:
    "Choose one target and roll 3 dice. On success, until the end of the target's next turn in combat, or the end of the current meaningful exchange outside combat, whenever the target acts with hostility, it must direct that hostility at you, if you are a valid target.",
  MAJOR:
    "Choose one target and roll 3 dice. On success, for the rest of the current scene, whenever the target acts with hostility, it must direct that hostility at you, if you are a valid target.",
  LEGENDARY:
    "Choose one target and roll 3 dice. On success, the target recognises you as its personal rival until the rivalry is narratively resolved.",
} as const;

const drawBase = {
  ...createDefaultRoleplayAbility(5),
  name: "Face Me",
  narrativeTheme: "The hero calls out the foe.",
  intention: "INTIMIDATION" as const,
  methodId: "CHALLENGE" as const,
  sceneImpact: "MINOR" as const,
  scope: "ONE_TARGET" as const,
  diceCount: 3 as const,
  outcomeContractId: "DRAW_HOSTILE_ATTENTION" as const,
};

for (const sceneImpact of ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"] as const) {
  const authoring = { ...drawBase, sceneImpact };
  assert(
    getCompatibleRoleplayOutcomeContracts(authoring).some(
      (contract) => contract.id === "DRAW_HOSTILE_ATTENTION",
    ),
    `Draw Hostile Attention should be available at ${sceneImpact} Impact.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(authoring),
    drawHostileAttentionOutcomes[sceneImpact],
    `Draw Hostile Attention ${sceneImpact} outcome mismatch.`,
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(authoring),
    drawHostileAttentionDescriptors[sceneImpact],
    `Draw Hostile Attention ${sceneImpact} descriptor mismatch.`,
  );
  assertEqual(
    getRoleplayAbilityCounterEligibility(authoring),
    false,
    `Draw Hostile Attention ${sceneImpact} should not permit Counter.`,
  );
  assertEqual(
    reconcileRoleplayAbilityContract({ ...authoring, counter: true }).counter,
    false,
    `Draw Hostile Attention ${sceneImpact} should force Counter off.`,
  );
}

assert(
  !getCompatibleRoleplayOutcomeContracts({
    ...drawBase,
    intention: "PERSUASION",
  }).some((contract) => contract.id === "DRAW_HOSTILE_ATTENTION"),
  "Draw Hostile Attention should not appear for Persuasion / Challenge.",
);
assert(
  !getCompatibleRoleplayOutcomeContracts({ ...drawBase, methodId: "INTERRUPT" }).some(
    (contract) => contract.id === "DRAW_HOSTILE_ATTENTION",
  ),
  "Draw Hostile Attention should not appear for an incompatible Method.",
);
assert(
  !getCompatibleRoleplayOutcomeContracts({ ...drawBase, scope: "SMALL_GROUP" }).some(
    (contract) => contract.id === "DRAW_HOSTILE_ATTENTION",
  ),
  "Draw Hostile Attention should not appear for Small Group scope.",
);

let persistentDraw = reconcileRoleplayAbilityContract(drawBase);
for (const sceneImpact of ["STANDARD", "MAJOR", "LEGENDARY"] as const) {
  persistentDraw = reconcileRoleplayAbilityContract({ ...persistentDraw, sceneImpact });
  assertEqual(
    persistentDraw.outcomeContractId,
    "DRAW_HOSTILE_ATTENTION",
    `Changing Draw Hostile Attention to ${sceneImpact} should retain its family ID.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(persistentDraw),
    drawHostileAttentionOutcomes[sceneImpact],
    `Changing Draw Hostile Attention to ${sceneImpact} should update its outcome.`,
  );
}

for (const [label, invalidDraw] of [
  ["Scope", { ...drawBase, scope: "SMALL_GROUP" as const }],
  ["Method", { ...drawBase, methodId: "INTERRUPT" as const }],
  [
    "Intention",
    { ...drawBase, intention: "PERSUASION" as const },
  ],
] as const) {
  const reconciled = reconcileRoleplayAbilityContract({ ...invalidDraw, counter: true });
  assertEqual(
    reconciled.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    `Changing Draw Hostile Attention ${label} should clear the contract.`,
  );
  assertEqual(reconciled.counter, false, `Changing ${label} should also clear Counter.`);
}

const legacyEnableMovement = normalizeRoleplayAbility(
  {
    intention: "INTERVENTION",
    specific: "ENABLE_MOVEMENT",
  },
  6,
);
assertEqual(
  legacyEnableMovement.methodId,
  "RESCUE",
  "Legacy ENABLE_MOVEMENT should normalize to RESCUE.",
);

assertEqual(
  ROLEPLAY_METHODS.map((method) => method.id).join(","),
  "RESCUE,INTERRUPT,CHALLENGE,DISCERN_TRUTH",
  "The standard Method registry should contain exactly the four approved IDs.",
);
for (const [methodId, intention] of [
  ["RESCUE", "INTERVENTION"],
  ["INTERRUPT", "INTERVENTION"],
  ["CHALLENGE", "INTIMIDATION"],
  ["DISCERN_TRUTH", "PERCEPTION"],
] as const) {
  assertEqual(
    getRoleplayMethodDefinition(methodId)?.intention,
    intention,
    `${methodId} owning Intention mismatch.`,
  );
}

for (const [intention, expectedIds] of [
  ["INTERVENTION", "RESCUE,INTERRUPT"],
  ["INTIMIDATION", "CHALLENGE"],
  ["PERCEPTION", "DISCERN_TRUTH"],
  ["PERSUASION", ""],
  ["DECEPTION", ""],
] as const) {
  assertEqual(
    getRoleplayMethodsForIntention(intention).map((method) => method.id).join(","),
    expectedIds,
    `${intention} Method filtering mismatch.`,
  );
}

for (const [specific, expectedMethodId, intention] of [
  ["RESCUE", "RESCUE", "INTERVENTION"],
  ["INTERRUPT", "INTERRUPT", "INTERVENTION"],
  ["CHALLENGE", "CHALLENGE", "INTIMIDATION"],
  ["DISCERN_TRUTH", "DISCERN_TRUTH", "PERCEPTION"],
  ["ENABLE_MOVEMENT", "RESCUE", "INTERVENTION"],
] as const) {
  const migrated = normalizeRoleplayAbility(
    {
      description: `Legacy ${specific} theme`,
      intention,
      specific,
    },
    7,
  );
  assertEqual(migrated.methodId, expectedMethodId, `${specific} Method migration mismatch.`);
  assertEqual(
    migrated.narrativeTheme,
    `Legacy ${specific} theme`,
    `${specific} Narrative Theme migration mismatch.`,
  );
  assert(!Object.hasOwn(migrated, "specific"), `${specific} should not remain normalized.`);
  assert(!Object.hasOwn(migrated, "description"), "description should not remain normalized.");
}

const unknownLegacyMethod = normalizeRoleplayAbility(
  {
    intention: "PERSUASION",
    specific: "INSPIRE",
    description: "A stirring appeal to shared purpose.",
  },
  8,
);
assertEqual(
  unknownLegacyMethod.methodId,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  "Unknown legacy Specific should migrate to Custom Method review.",
);
assertEqual(
  unknownLegacyMethod.customMethodName,
  "Inspire",
  "Known legacy Specific label should be preserved as a readable Method name.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(unknownLegacyMethod).length,
  0,
  "Custom Methods should not match standard Outcome Contracts.",
);
assert(
  getRoleplayAbilityWarnings(unknownLegacyMethod).includes(
    "Custom Method requires Game Director approval.",
  ),
  "Custom Method should warn that GD approval is required.",
);

const intentionReconciled = reconcileRoleplayAbilityAuthoring({
  ...drawBase,
  intention: "PERCEPTION",
  counter: true,
});
assertEqual(
  intentionReconciled.methodId,
  ROLEPLAY_METHOD_UNSELECTED,
  "Changing Intention should clear a Method owned by another Intention.",
);
assertEqual(
  intentionReconciled.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
  "Changing Intention should clear the standard Outcome Contract.",
);
assertEqual(intentionReconciled.counter, false, "Changing Intention should clear Counter.");

const methodReconciled = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(9),
  ...denyAuthoring,
  methodId: "RESCUE",
  outcomeContractId: "DENY_IMMINENT_HOSTILE_ACT",
  counter: true,
});
assertEqual(
  methodReconciled.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
  "Changing Interrupt to Rescue should clear Deny Imminent Hostile Act.",
);
assertEqual(methodReconciled.counter, false, "Changing Method should clear Counter.");

const customMethod = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(10),
  intention: "PERSUASION",
  methodId: ROLEPLAY_METHOD_CUSTOM_REVIEW,
  customMethodName: "Invoke Ancestral Memory",
  customMethodRequest: "Consult inherited memories for guidance and boundaries.",
  outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
});
const customMethodAfterIntentionChange = reconcileRoleplayAbilityAuthoring({
  ...customMethod,
  intention: "PERCEPTION",
});
assertEqual(
  customMethodAfterIntentionChange.methodId,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  "Custom Method should remain selected across Intention changes.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(customMethodAfterIntentionChange).length,
  0,
  "Custom Method should expose no standard contracts.",
);
const customMethodWarnings = getRoleplayAbilityWarnings(customMethodAfterIntentionChange);
assert(
  customMethodWarnings.includes("Custom Method requires Game Director approval."),
  "Custom Method approval warning missing.",
);
assert(
  customMethodWarnings.includes(
    "Automatic standard Outcome Contract matching is unavailable for a Custom Method.",
  ),
  "Custom Method matching warning missing.",
);

const uncoverConcealedTruthOutcomes = {
  MINOR:
    "you learn whether the target is concealing something relevant to the immediate situation and, if so, its general nature; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed",
  STANDARD:
    "you learn one useful concealed truth about the target relevant to the immediate situation; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed",
  MAJOR:
    "you learn a central concealed truth about the target that is shaping the current situation; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed",
  LEGENDARY:
    "you learn a defining concealed truth about the target whose significance extends beyond the current scene; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed",
} as const;

const uncoverConcealedTruthDescriptors = {
  MINOR:
    "Choose one target and roll 3 dice. On success, you learn whether the target is concealing something relevant to the immediate situation and, if so, its general nature; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed.",
  STANDARD:
    "Choose one target and roll 3 dice. On success, you learn one useful concealed truth about the target relevant to the immediate situation; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed.",
  MAJOR:
    "Choose one target and roll 3 dice. On success, you learn a central concealed truth about the target that is shaping the current situation; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed.",
  LEGENDARY:
    "Choose one target and roll 3 dice. On success, you learn a defining concealed truth about the target whose significance extends beyond the current scene; if no qualifying concealed truth exists, you learn that nothing relevant is being concealed.",
} as const;

const uncoverContract = getRoleplayOutcomeContract("UNCOVER_CONCEALED_TRUTH");
assert(uncoverContract, "UNCOVER_CONCEALED_TRUTH should exist.");
assertEqual(uncoverContract.name, "Uncover Concealed Truth", "Contract name mismatch.");
assertEqual(uncoverContract.outcomeLane, "HELP", "Uncover Concealed Truth should be Help.");
assertEqual(uncoverContract.variants.length, 4, "Uncover Concealed Truth needs four variants.");
for (const variant of uncoverContract.variants) {
  assertEqual(variant.authoring.intention, "PERCEPTION", "Variant Intention mismatch.");
  assertEqual(variant.authoring.methodId, "DISCERN_TRUTH", "Variant Method mismatch.");
  assertEqual(variant.authoring.scope, "ONE_TARGET", "Variant Scope mismatch.");
  assertEqual(variant.counterEligible, false, "Every variant must disallow Counter.");
  assertEqual(
    variant.privilegeCostKey,
    `UNCOVER_CONCEALED_TRUTH_${variant.authoring.sceneImpact}`,
    `${variant.authoring.sceneImpact} privilege key mismatch.`,
  );
}

const discernTruthStandard = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(11),
  name: "I See What You're Hiding",
  narrativeTheme:
    "You study the target's hesitation, contradictions, and the subjects they avoid.",
  intention: "PERCEPTION",
  methodId: "DISCERN_TRUTH",
  sceneImpact: "STANDARD",
  scope: "ONE_TARGET",
  diceCount: 3,
  outcomeContractId: "UNCOVER_CONCEALED_TRUTH",
  counter: true,
});
assertEqual(
  getRoleplayAbilityMethodName(discernTruthStandard),
  "Discern Truth",
  "Discern Truth Method name mismatch.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(discernTruthStandard)
    .map((contract) => contract.id)
    .join(","),
  "UNCOVER_CONCEALED_TRUTH",
  "Discern Truth should match its standard contract.",
);
assertEqual(
  getRoleplayAbilityContractName(discernTruthStandard),
  "Uncover Concealed Truth",
  "Standard Discern Truth contract name mismatch.",
);
assertEqual(
  getRoleplayAbilityOutcomeLane(discernTruthStandard),
  "HELP",
  "Standard Discern Truth lane mismatch.",
);
assertEqual(
  getRoleplayAbilitySuccessOutcome(discernTruthStandard),
  uncoverConcealedTruthOutcomes.STANDARD,
  "Standard Discern Truth outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(discernTruthStandard),
  uncoverConcealedTruthDescriptors.STANDARD,
  "Standard Discern Truth descriptor mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(discernTruthStandard),
  false,
  "Uncover Concealed Truth should not permit Counter.",
);
assertEqual(
  discernTruthStandard.counter,
  false,
  "Standard Discern Truth reconciliation should force Counter off.",
);
assert(
  !getRoleplayAbilityWarnings(discernTruthStandard).some((warning) =>
    warning.includes("Custom Outcome")),
  "Standard Discern Truth should not warn about Custom Outcome approval.",
);

for (const sceneImpact of ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"] as const) {
  const ability = reconcileRoleplayAbilityAuthoring({
    ...discernTruthStandard,
    sceneImpact,
    outcomeContractId: "UNCOVER_CONCEALED_TRUTH",
  });
  assertEqual(
    getRoleplayAbilitySuccessOutcome(ability),
    uncoverConcealedTruthOutcomes[sceneImpact],
    `${sceneImpact} Uncover Concealed Truth outcome mismatch.`,
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(ability),
    uncoverConcealedTruthDescriptors[sceneImpact],
    `${sceneImpact} Uncover Concealed Truth descriptor mismatch.`,
  );
}

for (const invalidAuthoring of [
  { intention: "INTIMIDATION" as const },
  { methodId: "CHALLENGE" as const },
  { scope: "SELF" as const },
  { scope: "SMALL_GROUP" as const },
  { scope: "LARGE_GROUP" as const },
  { scope: "FACTION_ARMY" as const },
]) {
  assert(
    !getCompatibleRoleplayOutcomeContracts({
      ...discernTruthStandard,
      ...invalidAuthoring,
    }).some((contract) => contract.id === "UNCOVER_CONCEALED_TRUTH"),
    `Uncover Concealed Truth should reject ${JSON.stringify(invalidAuthoring)}.`,
  );
}

let persistentDiscernTruth = reconcileRoleplayAbilityAuthoring({
  ...discernTruthStandard,
  sceneImpact: "MINOR",
  outcomeContractId: "UNCOVER_CONCEALED_TRUTH",
});
for (const sceneImpact of ["STANDARD", "MAJOR", "LEGENDARY", "MINOR"] as const) {
  persistentDiscernTruth = reconcileRoleplayAbilityAuthoring({
    ...persistentDiscernTruth,
    sceneImpact,
    counter: true,
  });
  assertEqual(
    persistentDiscernTruth.outcomeContractId,
    "UNCOVER_CONCEALED_TRUTH",
    `${sceneImpact} should retain the Uncover Concealed Truth family ID.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(persistentDiscernTruth),
    uncoverConcealedTruthOutcomes[sceneImpact],
    `${sceneImpact} persistence outcome mismatch.`,
  );
  assertEqual(persistentDiscernTruth.counter, false, `${sceneImpact} should force Counter off.`);
}

for (const [label, invalidAbility] of [
  ["Scope", { ...discernTruthStandard, scope: "SMALL_GROUP" as const }],
  ["Method", { ...discernTruthStandard, methodId: "CHALLENGE" as const }],
  ["Intention", { ...discernTruthStandard, intention: "INTIMIDATION" as const }],
] as const) {
  const reconciled = reconcileRoleplayAbilityAuthoring({ ...invalidAbility, counter: true });
  assertEqual(
    reconciled.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    `${label} invalidation should clear Uncover Concealed Truth.`,
  );
  assertEqual(reconciled.counter, false, `${label} invalidation should clear Counter.`);
}

const nonInvalidatingDiscernTruth = reconcileRoleplayAbilityAuthoring({
  ...discernTruthStandard,
  name: "The Truth Beneath",
  narrativeTheme: "You compare their pauses with the evidence already in hand.",
  diceCount: 5,
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "LIGHT",
  restrictionText: "Only while reviewing a direct statement from the target.",
});
assertEqual(
  nonInvalidatingDiscernTruth.outcomeContractId,
  "UNCOVER_CONCEALED_TRUTH",
  "Non-authoring presentation and restriction changes should retain the contract.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(nonInvalidatingDiscernTruth),
  uncoverConcealedTruthDescriptors.STANDARD.replace("roll 3 dice", "roll 5 dice"),
  "Dice Count should only change the descriptor roll count.",
);

const discernTruthCustomOutcome = normalizeRoleplayAbility(
  {
    name: "Read the Hidden Pattern",
    narrativeTheme: "You trace recurring symbols in the target's correspondence.",
    intention: "PERCEPTION",
    methodId: "DISCERN_TRUTH",
    sceneImpact: "STANDARD",
    scope: "ONE_TARGET",
    diceCount: 3,
    outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
    customOutcomeLane: "HELP",
    customOutcomeRequest:
      "You learn which hidden network currently exchanges messages with the target.",
  },
  12,
);
assertEqual(
  discernTruthCustomOutcome.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  "An explicitly stored Custom Outcome must not auto-migrate to the standard contract.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(discernTruthCustomOutcome),
  "Choose one target and roll 3 dice. On success, You learn which hidden network currently exchanges messages with the target.",
  "Discern Truth Custom Outcome descriptor regression.",
);
assert(
  getRoleplayAbilityWarnings(discernTruthCustomOutcome).some((warning) =>
    warning.includes("Custom Outcome requires Game Director approval"),
  ),
  "Discern Truth Custom Outcome approval warning should remain.",
);

console.log("PASS roleplay outcome contract registry smoke");
console.log("PASS roleplay draw hostile attention contract smoke");
console.log("PASS structured roleplay method registry smoke");
console.log("PASS roleplay uncover concealed truth contract smoke");
