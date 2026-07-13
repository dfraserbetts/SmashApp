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
assertEqual(
  unknownLegacyOutcome.methodId,
  "APPEAL",
  "Legacy Appeal should now migrate to the approved standard Method.",
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
  "APPEAL,RALLY,MISDIRECT,RESCUE,INTERRUPT,CHALLENGE,DISCERN_TRUTH",
  "The standard Method registry should contain exactly the seven approved IDs.",
);
for (const [methodId, intention] of [
  ["APPEAL", "PERSUASION"],
  ["RALLY", "PERSUASION"],
  ["MISDIRECT", "DECEPTION"],
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

const appealMethod = getRoleplayMethodDefinition("APPEAL");
assert(appealMethod, "APPEAL should exist in the Method registry.");
assertEqual(appealMethod.name, "Appeal", "Appeal Method name mismatch.");
assertEqual(
  appealMethod.definition,
  "Persuade a target by connecting a clear request to their values, interests, loyalties, emotions, relationships, duties, or understanding of the situation.",
  "Appeal Method definition mismatch.",
);
for (const exclusion of [
  "Does not rely primarily on threats or fear.",
  "Does not rely on deliberate lies or concealed falsehoods.",
  "Does not create permanent general obedience.",
  "Does not manufacture love, devotion, intimacy, or consent.",
]) {
  assert(appealMethod.exclusions.includes(exclusion), `Appeal exclusion missing: ${exclusion}`);
}

const rallyMethod = getRoleplayMethodDefinition("RALLY");
assert(rallyMethod, "RALLY should exist in the Method registry.");
assertEqual(rallyMethod.name, "Rally", "Rally Method name mismatch.");
assertEqual(rallyMethod.intention, "PERSUASION", "Rally owning Intention mismatch.");
assertEqual(
  rallyMethod.definition,
  "Unite a bounded group around one clear shared course by invoking common purpose, courage, duty, identity, hope, urgency, or mutual reliance.",
  "Rally Method definition mismatch.",
);
for (const exclusion of [
  "Does not grant open-ended command authority or general obedience.",
  "Does not dictate identical tactics, movement, or actions.",
  "Does not grant extra actions, measured movement, quantified bonuses, or immunities.",
  "Does not guarantee that the shared course succeeds.",
]) {
  assert(rallyMethod.exclusions.includes(exclusion), `Rally exclusion missing: ${exclusion}`);
}

const misdirectMethod = getRoleplayMethodDefinition("MISDIRECT");
assert(misdirectMethod, "MISDIRECT should exist in the Method registry.");
assertEqual(misdirectMethod.name, "Misdirect", "Misdirect Method name mismatch.");
assertEqual(
  misdirectMethod.intention,
  "DECEPTION",
  "Misdirect owning Intention mismatch.",
);
assertEqual(
  misdirectMethod.definition,
  "Lead a target toward a false or materially misleading conclusion through direct falsehood, omission, implication, distraction, selective truth, staged cues, or deceptive framing.",
  "Misdirect Method definition mismatch.",
);
for (const exclusion of [
  "Does not use supernatural domination or control.",
  "Does not rewrite memories.",
  "Does not compel a particular action or emotional response.",
  "Does not establish an unlimited collection of separate false claims.",
]) {
  assert(
    misdirectMethod.exclusions.includes(exclusion),
    `Misdirect exclusion missing: ${exclusion}`,
  );
}

for (const [intention, expectedIds] of [
  ["PERSUASION", "APPEAL,RALLY"],
  ["DECEPTION", "MISDIRECT"],
  ["INTERVENTION", "RESCUE,INTERRUPT"],
  ["INTIMIDATION", "CHALLENGE"],
  ["PERCEPTION", "DISCERN_TRUTH"],
] as const) {
  assertEqual(
    getRoleplayMethodsForIntention(intention).map((method) => method.id).join(","),
    expectedIds,
    `${intention} Method filtering mismatch.`,
  );
}

for (const [specific, expectedMethodId, intention] of [
  ["APPEAL", "APPEAL", "PERSUASION"],
  ["RALLY", "RALLY", "PERSUASION"],
  ["MISDIRECT", "MISDIRECT", "DECEPTION"],
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

const legacyLieMethod = normalizeRoleplayAbility(
  {
    intention: "DECEPTION",
    specific: "LIE",
    description: "You tell a direct and plausible lie.",
  },
  9,
);
assertEqual(
  legacyLieMethod.methodId,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  "Legacy LIE must remain Custom Method review.",
);
assertEqual(
  legacyLieMethod.customMethodName,
  "Lie",
  "Legacy LIE should preserve its readable Method name.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(legacyLieMethod).length,
  0,
  "Legacy LIE must not match a standard Outcome Contract.",
);
assert(
  getRoleplayAbilityWarnings(legacyLieMethod).includes(
    "Custom Method requires Game Director approval.",
  ),
  "Legacy LIE should retain the Custom Method approval warning.",
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
assert(
  uncoverContract.exclusions.includes(
    "Does not permit the Game Director to answer an accepted specific subject of investigation with an unrelated truth.",
  ),
  "Uncover Concealed Truth accepted-subject exclusion is missing.",
);
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

const secureWillingCooperationOutcomes = {
  MINOR:
    "the target willingly complies with one small immediate request requiring negligible sacrifice, risk, or commitment",
  STANDARD:
    "the target willingly agrees to and sincerely carries out one meaningful request involving inconvenience, social cost, or modest personal risk",
  MAJOR:
    "the target willingly commits to and sincerely pursues one difficult request involving substantial effort, personal cost, reputational danger, or physical risk",
  LEGENDARY:
    "the target willingly makes one defining commitment, alliance, or promise whose consequences extend beyond the current scene and sincerely upholds it until it is fulfilled or narratively resolved",
} as const;

const secureWillingCooperationDescriptors = {
  MINOR:
    "Choose one target and roll 3 dice. On success, the target willingly complies with one small immediate request requiring negligible sacrifice, risk, or commitment.",
  STANDARD:
    "Choose one target and roll 3 dice. On success, the target willingly agrees to and sincerely carries out one meaningful request involving inconvenience, social cost, or modest personal risk.",
  MAJOR:
    "Choose one target and roll 3 dice. On success, the target willingly commits to and sincerely pursues one difficult request involving substantial effort, personal cost, reputational danger, or physical risk.",
  LEGENDARY:
    "Choose one target and roll 3 dice. On success, the target willingly makes one defining commitment, alliance, or promise whose consequences extend beyond the current scene and sincerely upholds it until it is fulfilled or narratively resolved.",
} as const;

const cooperationContract = getRoleplayOutcomeContract("SECURE_WILLING_COOPERATION");
assert(cooperationContract, "SECURE_WILLING_COOPERATION should exist.");
assertEqual(
  cooperationContract.name,
  "Secure Willing Cooperation",
  "Cooperation contract name mismatch.",
);
assertEqual(cooperationContract.outcomeLane, "HELP", "Cooperation contract should be Help.");
assertEqual(cooperationContract.variants.length, 4, "Cooperation needs four variants.");
for (const variant of cooperationContract.variants) {
  assertEqual(variant.authoring.intention, "PERSUASION", "Cooperation Intention mismatch.");
  assertEqual(variant.authoring.methodId, "APPEAL", "Cooperation Method mismatch.");
  assertEqual(variant.authoring.scope, "ONE_TARGET", "Cooperation Scope mismatch.");
  assertEqual(variant.counterEligible, false, "Cooperation must disallow Counter.");
  assertEqual(
    variant.privilegeCostKey,
    `SECURE_WILLING_COOPERATION_${variant.authoring.sceneImpact}`,
    `${variant.authoring.sceneImpact} cooperation privilege key mismatch.`,
  );
}

const standWithMe = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(13),
  name: "Stand With Me",
  narrativeTheme:
    "You remind the target what they once promised and explain why keeping that promise matters now.",
  intention: "PERSUASION",
  methodId: "APPEAL",
  sceneImpact: "STANDARD",
  scope: "ONE_TARGET",
  diceCount: 3,
  outcomeContractId: "SECURE_WILLING_COOPERATION",
  counter: true,
});
assertEqual(getRoleplayAbilityMethodName(standWithMe), "Appeal", "Appeal name mismatch.");
assertEqual(
  getCompatibleRoleplayOutcomeContracts(standWithMe)
    .map((contract) => contract.id)
    .join(","),
  "SECURE_WILLING_COOPERATION",
  "Appeal should match only Secure Willing Cooperation for this authoring.",
);
assertEqual(
  getRoleplayAbilityContractName(standWithMe),
  "Secure Willing Cooperation",
  "Cooperation ability contract name mismatch.",
);
assertEqual(getRoleplayAbilityOutcomeLane(standWithMe), "HELP", "Cooperation lane mismatch.");
assertEqual(
  getRoleplayAbilitySuccessOutcome(standWithMe),
  secureWillingCooperationOutcomes.STANDARD,
  "Standard cooperation outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(standWithMe),
  secureWillingCooperationDescriptors.STANDARD,
  "Standard cooperation descriptor mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(standWithMe),
  false,
  "Cooperation should be Counter-ineligible.",
);
assertEqual(standWithMe.counter, false, "Cooperation reconciliation should force Counter off.");
assert(
  !getRoleplayAbilityWarnings(standWithMe).some((warning) =>
    warning.includes("Custom Method") || warning.includes("Custom Outcome")),
  "Standard Appeal should not have Custom review warnings.",
);

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
      ...standWithMe,
      ...invalidAuthoring,
    }).some((contract) => contract.id === "SECURE_WILLING_COOPERATION"),
    `Secure Willing Cooperation should reject ${JSON.stringify(invalidAuthoring)}.`,
  );
}

let persistentCooperation = reconcileRoleplayAbilityAuthoring({
  ...standWithMe,
  sceneImpact: "MINOR",
  outcomeContractId: "SECURE_WILLING_COOPERATION",
});
for (const sceneImpact of ["STANDARD", "MAJOR", "LEGENDARY", "MINOR"] as const) {
  persistentCooperation = reconcileRoleplayAbilityAuthoring({
    ...persistentCooperation,
    sceneImpact,
    counter: true,
  });
  assertEqual(
    persistentCooperation.outcomeContractId,
    "SECURE_WILLING_COOPERATION",
    `${sceneImpact} should retain the cooperation family ID.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(persistentCooperation),
    secureWillingCooperationOutcomes[sceneImpact],
    `${sceneImpact} cooperation outcome mismatch.`,
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(persistentCooperation),
    secureWillingCooperationDescriptors[sceneImpact],
    `${sceneImpact} cooperation descriptor mismatch.`,
  );
  assertEqual(persistentCooperation.counter, false, `${sceneImpact} should force Counter off.`);
}

for (const [label, invalidAbility] of [
  ["Scope", { ...standWithMe, scope: "SMALL_GROUP" as const }],
  ["Method", { ...standWithMe, methodId: "CHALLENGE" as const }],
  ["Intention", { ...standWithMe, intention: "INTIMIDATION" as const }],
] as const) {
  const reconciled = reconcileRoleplayAbilityAuthoring({ ...invalidAbility, counter: true });
  assertEqual(
    reconciled.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    `${label} invalidation should clear Secure Willing Cooperation.`,
  );
  assertEqual(reconciled.counter, false, `${label} invalidation should clear Counter.`);
}

const editedStandWithMe = reconcileRoleplayAbilityAuthoring({
  ...standWithMe,
  name: "Keep Your Promise",
  narrativeTheme: "You calmly invoke the promise and the people who depend on it.",
  diceCount: 5,
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "MODERATE",
  restrictionText: "Only when the target has already made a relevant promise.",
});
assertEqual(
  editedStandWithMe.outcomeContractId,
  "SECURE_WILLING_COOPERATION",
  "Non-invalidating Appeal edits should retain the contract.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(editedStandWithMe),
  secureWillingCooperationDescriptors.STANDARD.replace("roll 3 dice", "roll 5 dice"),
  "Appeal Dice Count should only change the descriptor roll count.",
);
assert(
  !Object.hasOwn(standWithMe, "declaredAim") && !Object.hasOwn(standWithMe, "request"),
  "Declared Aim/request must remain runtime context rather than stored Ability state.",
);

const establishFalseBeliefOutcomes = {
  MINOR:
    "the target accepts one small and immediately plausible false premise as true for the current meaningful exchange and treats it as true when making relevant decisions",
  STANDARD:
    "the target genuinely accepts one plausible false premise relevant to the current situation as true for the rest of the current scene and treats it as true when making relevant decisions unless meaningful contradictory evidence resolves the belief",
  MAJOR:
    "the target genuinely accepts one central false premise shaping the current situation as true for the rest of the current scene and continues to treat it as true when making relevant decisions unless decisive contradictory evidence, direct experience, or narrative resolution ends the belief",
  LEGENDARY:
    "the target genuinely accepts one defining false premise whose consequences extend beyond the current scene as true and treats it as true when making relevant decisions until it is decisively disproved or narratively resolved",
} as const;

const establishFalseBeliefDescriptors = {
  MINOR:
    "Choose one target and roll 3 dice. On success, the target accepts one small and immediately plausible false premise as true for the current meaningful exchange and treats it as true when making relevant decisions.",
  STANDARD:
    "Choose one target and roll 3 dice. On success, the target genuinely accepts one plausible false premise relevant to the current situation as true for the rest of the current scene and treats it as true when making relevant decisions unless meaningful contradictory evidence resolves the belief.",
  MAJOR:
    "Choose one target and roll 3 dice. On success, the target genuinely accepts one central false premise shaping the current situation as true for the rest of the current scene and continues to treat it as true when making relevant decisions unless decisive contradictory evidence, direct experience, or narrative resolution ends the belief.",
  LEGENDARY:
    "Choose one target and roll 3 dice. On success, the target genuinely accepts one defining false premise whose consequences extend beyond the current scene as true and treats it as true when making relevant decisions until it is decisively disproved or narratively resolved.",
} as const;

const falseBeliefContract = getRoleplayOutcomeContract("ESTABLISH_FALSE_BELIEF");
assert(falseBeliefContract, "ESTABLISH_FALSE_BELIEF should exist.");
assertEqual(
  falseBeliefContract.name,
  "Establish False Belief",
  "False Belief contract name mismatch.",
);
assertEqual(falseBeliefContract.outcomeLane, "HINDER", "False Belief should be Hinder.");
assertEqual(falseBeliefContract.variants.length, 4, "False Belief needs four variants.");
for (const variant of falseBeliefContract.variants) {
  assertEqual(variant.authoring.intention, "DECEPTION", "False Belief Intention mismatch.");
  assertEqual(variant.authoring.methodId, "MISDIRECT", "False Belief Method mismatch.");
  assertEqual(variant.authoring.scope, "ONE_TARGET", "False Belief Scope mismatch.");
  assertEqual(variant.counterEligible, false, "False Belief must disallow Counter.");
  assertEqual(
    variant.privilegeCostKey,
    `ESTABLISH_FALSE_BELIEF_${variant.authoring.sceneImpact}`,
    `${variant.authoring.sceneImpact} false-belief privilege key mismatch.`,
  );
}

const nothingToSeeHere = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(14),
  name: "Nothing to See Here",
  narrativeTheme:
    "You behave with casual confidence, redirect attention toward a mundane explanation, and speak as though the situation is already understood and under control.",
  intention: "DECEPTION",
  methodId: "MISDIRECT",
  sceneImpact: "STANDARD",
  scope: "ONE_TARGET",
  diceCount: 3,
  outcomeContractId: "ESTABLISH_FALSE_BELIEF",
  counter: true,
});
assertEqual(
  nothingToSeeHere.narrativeTheme,
  "You behave with casual confidence, redirect attention toward a mundane explanation, and speak as though the situation is already understood and under control.",
  "Nothing to See Here Narrative Theme mismatch.",
);
assertEqual(
  getRoleplayAbilityMethodName(nothingToSeeHere),
  "Misdirect",
  "Misdirect name mismatch.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(nothingToSeeHere)
    .map((contract) => contract.id)
    .join(","),
  "ESTABLISH_FALSE_BELIEF",
  "Misdirect should match only Establish False Belief for this authoring.",
);
assertEqual(
  getRoleplayAbilityContractName(nothingToSeeHere),
  "Establish False Belief",
  "False Belief ability contract name mismatch.",
);
assertEqual(
  getRoleplayAbilityOutcomeLane(nothingToSeeHere),
  "HINDER",
  "False Belief lane mismatch.",
);
assertEqual(
  getRoleplayAbilitySuccessOutcome(nothingToSeeHere),
  establishFalseBeliefOutcomes.STANDARD,
  "Standard false-belief outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(nothingToSeeHere),
  establishFalseBeliefDescriptors.STANDARD,
  "Standard false-belief descriptor mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(nothingToSeeHere),
  false,
  "False Belief should be Counter-ineligible.",
);
assertEqual(
  nothingToSeeHere.counter,
  false,
  "False Belief reconciliation should force Counter off.",
);
assert(
  !getRoleplayAbilityWarnings(nothingToSeeHere).some((warning) =>
    warning.includes("Custom Method") || warning.includes("Custom Outcome")),
  "Standard Misdirect should not have Custom review warnings.",
);

for (const invalidAuthoring of [
  { intention: "PERSUASION" as const },
  { methodId: "APPEAL" as const },
  { scope: "SELF" as const },
  { scope: "SMALL_GROUP" as const },
  { scope: "LARGE_GROUP" as const },
  { scope: "FACTION_ARMY" as const },
]) {
  assert(
    !getCompatibleRoleplayOutcomeContracts({
      ...nothingToSeeHere,
      ...invalidAuthoring,
    }).some((contract) => contract.id === "ESTABLISH_FALSE_BELIEF"),
    `Establish False Belief should reject ${JSON.stringify(invalidAuthoring)}.`,
  );
}

let persistentFalseBelief = reconcileRoleplayAbilityAuthoring({
  ...nothingToSeeHere,
  sceneImpact: "MINOR",
  outcomeContractId: "ESTABLISH_FALSE_BELIEF",
});
for (const sceneImpact of ["STANDARD", "MAJOR", "LEGENDARY", "MINOR"] as const) {
  persistentFalseBelief = reconcileRoleplayAbilityAuthoring({
    ...persistentFalseBelief,
    sceneImpact,
    counter: true,
  });
  assertEqual(
    persistentFalseBelief.outcomeContractId,
    "ESTABLISH_FALSE_BELIEF",
    `${sceneImpact} should retain the false-belief family ID.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(persistentFalseBelief),
    establishFalseBeliefOutcomes[sceneImpact],
    `${sceneImpact} false-belief outcome mismatch.`,
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(persistentFalseBelief),
    establishFalseBeliefDescriptors[sceneImpact],
    `${sceneImpact} false-belief descriptor mismatch.`,
  );
  assertEqual(
    persistentFalseBelief.counter,
    false,
    `${sceneImpact} false belief should force Counter off.`,
  );
}

for (const [label, invalidAbility] of [
  ["Scope", { ...nothingToSeeHere, scope: "SMALL_GROUP" as const }],
  ["Method", { ...nothingToSeeHere, methodId: "APPEAL" as const }],
  ["Intention", { ...nothingToSeeHere, intention: "PERSUASION" as const }],
] as const) {
  const reconciled = reconcileRoleplayAbilityAuthoring({ ...invalidAbility, counter: true });
  assertEqual(
    reconciled.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    `${label} invalidation should clear Establish False Belief.`,
  );
  assertEqual(reconciled.counter, false, `${label} invalidation should clear Counter.`);
}

const editedNothingToSeeHere = reconcileRoleplayAbilityAuthoring({
  ...nothingToSeeHere,
  name: "Routine Maintenance",
  narrativeTheme: "You carry a toolbox and complain about the old plumbing.",
  diceCount: 5,
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "MODERATE",
  restrictionText: "Only when an ordinary explanation fits the surroundings.",
});
assertEqual(
  editedNothingToSeeHere.outcomeContractId,
  "ESTABLISH_FALSE_BELIEF",
  "Non-invalidating Misdirect edits should retain the contract.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(editedNothingToSeeHere),
  establishFalseBeliefDescriptors.STANDARD.replace("roll 3 dice", "roll 5 dice"),
  "Misdirect Dice Count should only change the descriptor roll count.",
);
for (const runtimePremiseField of [
  "declaredPremise",
  "premise",
  "falseBelief",
  "beliefText",
]) {
  assert(
    !Object.hasOwn(nothingToSeeHere, runtimePremiseField),
    `${runtimePremiseField} must remain runtime context rather than stored Ability state.`,
  );
}

const customMisdirectOutcomeText =
  "The target repeats the proposed cover story to every guard who arrives later";
const customMisdirectOutcome = normalizeRoleplayAbility(
  {
    name: "Keep the Story Going",
    narrativeTheme: "You provide a rehearsed cover story and supporting cues.",
    intention: "DECEPTION",
    methodId: "MISDIRECT",
    sceneImpact: "STANDARD",
    scope: "ONE_TARGET",
    diceCount: 3,
    outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
    customOutcomeLane: "HINDER",
    customOutcomeRequest: customMisdirectOutcomeText,
  },
  15,
);
assertEqual(
  customMisdirectOutcome.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  "Explicit Misdirect Custom Outcome must remain Custom Review.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(customMisdirectOutcome),
  `Choose one target and roll 3 dice. On success, ${customMisdirectOutcomeText}.`,
  "Misdirect Custom Outcome descriptor regression.",
);
assert(
  getRoleplayAbilityWarnings(customMisdirectOutcome).some((warning) =>
    warning.includes("Custom Outcome requires Game Director approval")),
  "Misdirect Custom Outcome approval warning should remain.",
);

const establishSharedResolveOutcomes = {
  MINOR:
    "the selected group steadies around one simple immediate course and sincerely pursues it through the current meaningful exchange despite ordinary hesitation, confusion, or pressure",
  STANDARD:
    "the selected group adopts one clear shared course as its immediate priority for the rest of the current scene and sincerely pursues it despite meaningful fear, confusion, disagreement, or pressure",
  MAJOR:
    "the selected group commits to one difficult shared course for the rest of the current scene and sincerely pursues it despite serious fear, division, personal cost, or danger unless decisive circumstances or narrative resolution make that course no longer coherent",
  LEGENDARY:
    "the selected group forms one defining shared resolve, pledge, or cause whose consequences extend beyond the current scene and sincerely upholds it until it is fulfilled or narratively resolved",
} as const;

const establishSharedResolveDescriptors = {
  MINOR:
    "Choose a small group of targets and roll 3 dice. On success, the selected group steadies around one simple immediate course and sincerely pursues it through the current meaningful exchange despite ordinary hesitation, confusion, or pressure.",
  STANDARD:
    "Choose a small group of targets and roll 3 dice. On success, the selected group adopts one clear shared course as its immediate priority for the rest of the current scene and sincerely pursues it despite meaningful fear, confusion, disagreement, or pressure.",
  MAJOR:
    "Choose a small group of targets and roll 3 dice. On success, the selected group commits to one difficult shared course for the rest of the current scene and sincerely pursues it despite serious fear, division, personal cost, or danger unless decisive circumstances or narrative resolution make that course no longer coherent.",
  LEGENDARY:
    "Choose a small group of targets and roll 3 dice. On success, the selected group forms one defining shared resolve, pledge, or cause whose consequences extend beyond the current scene and sincerely upholds it until it is fulfilled or narratively resolved.",
} as const;

const sharedResolveContract = getRoleplayOutcomeContract("ESTABLISH_SHARED_RESOLVE");
assert(sharedResolveContract, "ESTABLISH_SHARED_RESOLVE should exist.");
assertEqual(
  sharedResolveContract.name,
  "Establish Shared Resolve",
  "Shared Resolve contract name mismatch.",
);
assertEqual(sharedResolveContract.outcomeLane, "HELP", "Shared Resolve should be Help.");
assertEqual(sharedResolveContract.variants.length, 4, "Shared Resolve needs four variants.");
for (const variant of sharedResolveContract.variants) {
  assertEqual(variant.authoring.intention, "PERSUASION", "Shared Resolve Intention mismatch.");
  assertEqual(variant.authoring.methodId, "RALLY", "Shared Resolve Method mismatch.");
  assertEqual(variant.authoring.scope, "SMALL_GROUP", "Shared Resolve Scope mismatch.");
  assertEqual(variant.counterEligible, false, "Shared Resolve must disallow Counter.");
  assertEqual(
    variant.privilegeCostKey,
    `ESTABLISH_SHARED_RESOLVE_${variant.authoring.sceneImpact}`,
    `${variant.authoring.sceneImpact} shared-resolve privilege key mismatch.`,
  );
}

const holdFast = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(16),
  name: "Hold Fast",
  narrativeTheme:
    "You plant your feet, call the frightened group together, and remind them who depends on them and what must be done next.",
  intention: "PERSUASION",
  methodId: "RALLY",
  sceneImpact: "STANDARD",
  scope: "SMALL_GROUP",
  diceCount: 3,
  outcomeContractId: "ESTABLISH_SHARED_RESOLVE",
  counter: true,
});
assertEqual(holdFast.narrativeTheme,
  "You plant your feet, call the frightened group together, and remind them who depends on them and what must be done next.",
  "Hold Fast Narrative Theme mismatch.",
);
assertEqual(getRoleplayAbilityMethodName(holdFast), "Rally", "Rally name mismatch.");
assertEqual(
  getCompatibleRoleplayOutcomeContracts(holdFast)
    .map((contract) => contract.id)
    .join(","),
  "ESTABLISH_SHARED_RESOLVE",
  "Rally should match only Establish Shared Resolve for this authoring.",
);
assertEqual(
  getRoleplayAbilityContractName(holdFast),
  "Establish Shared Resolve",
  "Shared Resolve ability contract name mismatch.",
);
assertEqual(getRoleplayAbilityOutcomeLane(holdFast), "HELP", "Shared Resolve lane mismatch.");
assertEqual(
  getRoleplayAbilitySuccessOutcome(holdFast),
  establishSharedResolveOutcomes.STANDARD,
  "Standard shared-resolve outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(holdFast),
  establishSharedResolveDescriptors.STANDARD,
  "Standard shared-resolve descriptor mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(holdFast),
  false,
  "Shared Resolve should be Counter-ineligible.",
);
assertEqual(holdFast.counter, false, "Shared Resolve reconciliation should force Counter off.");
assert(
  !getRoleplayAbilityWarnings(holdFast).some((warning) =>
    warning.includes("Custom Method") || warning.includes("Custom Outcome")),
  "Standard Rally should not have Custom review warnings.",
);

for (const invalidAuthoring of [
  { intention: "DECEPTION" as const },
  { methodId: "APPEAL" as const },
  { scope: "SELF" as const },
  { scope: "ONE_TARGET" as const },
  { scope: "LARGE_GROUP" as const },
  { scope: "FACTION_ARMY" as const },
]) {
  assert(
    !getCompatibleRoleplayOutcomeContracts({
      ...holdFast,
      ...invalidAuthoring,
    }).some((contract) => contract.id === "ESTABLISH_SHARED_RESOLVE"),
    `Establish Shared Resolve should reject ${JSON.stringify(invalidAuthoring)}.`,
  );
}

let persistentSharedResolve = reconcileRoleplayAbilityAuthoring({
  ...holdFast,
  sceneImpact: "MINOR",
  outcomeContractId: "ESTABLISH_SHARED_RESOLVE",
});
for (const sceneImpact of ["STANDARD", "MAJOR", "LEGENDARY", "MINOR"] as const) {
  persistentSharedResolve = reconcileRoleplayAbilityAuthoring({
    ...persistentSharedResolve,
    sceneImpact,
    counter: true,
  });
  assertEqual(
    persistentSharedResolve.outcomeContractId,
    "ESTABLISH_SHARED_RESOLVE",
    `${sceneImpact} should retain the shared-resolve family ID.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(persistentSharedResolve),
    establishSharedResolveOutcomes[sceneImpact],
    `${sceneImpact} shared-resolve outcome mismatch.`,
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(persistentSharedResolve),
    establishSharedResolveDescriptors[sceneImpact],
    `${sceneImpact} shared-resolve descriptor mismatch.`,
  );
  assertEqual(
    persistentSharedResolve.counter,
    false,
    `${sceneImpact} shared resolve should force Counter off.`,
  );
}

for (const [label, invalidAbility] of [
  ["One Target Scope", { ...holdFast, scope: "ONE_TARGET" as const }],
  ["Large Group Scope", { ...holdFast, scope: "LARGE_GROUP" as const }],
  ["Faction / Army Scope", { ...holdFast, scope: "FACTION_ARMY" as const }],
  ["Method", { ...holdFast, methodId: "APPEAL" as const }],
  ["Intention", { ...holdFast, intention: "DECEPTION" as const }],
] as const) {
  const reconciled = reconcileRoleplayAbilityAuthoring({ ...invalidAbility, counter: true });
  assertEqual(
    reconciled.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    `${label} invalidation should clear Establish Shared Resolve.`,
  );
  assertEqual(reconciled.counter, false, `${label} invalidation should clear Counter.`);
}

const editedHoldFast = reconcileRoleplayAbilityAuthoring({
  ...holdFast,
  name: "Stand Together",
  narrativeTheme: "You call the group together around the people depending on them.",
  diceCount: 5,
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "MODERATE",
  restrictionText: "Only while the group shares an immediate danger.",
});
assertEqual(
  editedHoldFast.outcomeContractId,
  "ESTABLISH_SHARED_RESOLVE",
  "Non-invalidating Rally edits should retain the contract.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(editedHoldFast),
  establishSharedResolveDescriptors.STANDARD.replace("roll 3 dice", "roll 5 dice"),
  "Rally Dice Count should only change the descriptor roll count.",
);
for (const runtimeGroupField of [
  "declaredCourse",
  "sharedCourse",
  "groupMembers",
  "selectedMembers",
  "rallyTargetIds",
]) {
  assert(
    !Object.hasOwn(holdFast, runtimeGroupField),
    `${runtimeGroupField} must remain runtime context rather than stored Ability state.`,
  );
}

const customRallyOutcomeText =
  "The group coordinates all future decisions through the Ability user";
const customRallyOutcome = normalizeRoleplayAbility(
  {
    name: "Follow My Lead",
    narrativeTheme: "You call the group together and ask them to trust your judgement.",
    intention: "PERSUASION",
    methodId: "RALLY",
    sceneImpact: "STANDARD",
    scope: "SMALL_GROUP",
    diceCount: 3,
    outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
    customOutcomeLane: "HELP",
    customOutcomeRequest: customRallyOutcomeText,
  },
  17,
);
assertEqual(
  customRallyOutcome.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  "Explicit Rally Custom Outcome must remain Custom Review.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(customRallyOutcome),
  `Choose a small group of targets and roll 3 dice. On success, ${customRallyOutcomeText}.`,
  "Rally Custom Outcome descriptor regression.",
);
assert(
  getRoleplayAbilityWarnings(customRallyOutcome).some((warning) =>
    warning.includes("Custom Outcome requires Game Director approval")),
  "Rally Custom Outcome approval warning should remain.",
);

console.log("PASS roleplay outcome contract registry smoke");
console.log("PASS roleplay draw hostile attention contract smoke");
console.log("PASS structured roleplay method registry smoke");
console.log("PASS roleplay uncover concealed truth contract smoke");
console.log("PASS roleplay secure willing cooperation contract smoke");
console.log("PASS roleplay establish false belief contract smoke");
console.log("PASS roleplay establish shared resolve contract smoke");
