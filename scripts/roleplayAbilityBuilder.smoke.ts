import {
  ROLEPLAY_METHODS,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  ROLEPLAY_METHOD_UNSELECTED,
  ROLEPLAY_OUTCOME_CONTRACTS,
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

const hideContract = getRoleplayOutcomeContract("HIDE_FROM_IMMEDIATE_DANGER");
assert(hideContract, "HIDE_FROM_IMMEDIATE_DANGER should still exist.");
assertEqual(hideContract.variants.length, 1, "Hide should retain exactly one variant.");
assertEqual(
  hideContract.variants[0].successOutcome,
  "the target becomes hidden from the immediate danger",
  "Hide outcome must remain unchanged.",
);
assertEqual(
  hideContract.variants[0].privilegeCostKey,
  "HIDE_FROM_IMMEDIATE_DANGER",
  "Hide privilege key must remain unchanged.",
);
assertEqual(hideContract.variants[0].counterEligible, false, "Hide Counter must remain false.");

const secureImmediateSafetyOutcome =
  "the target is secured from one declared immediate peril and is no longer directly threatened by it";
const secureImmediateSafetyDescriptor =
  "Choose one target and roll 3 dice. On success, the target is secured from one declared immediate peril and is no longer directly threatened by it.";
const secureImmediateSafetyContract = getRoleplayOutcomeContract("SECURE_IMMEDIATE_SAFETY");
assert(secureImmediateSafetyContract, "SECURE_IMMEDIATE_SAFETY should exist.");
assertEqual(
  secureImmediateSafetyContract.name,
  "Secure Immediate Safety",
  "Secure Immediate Safety name mismatch.",
);
assertEqual(
  secureImmediateSafetyContract.outcomeLane,
  "HELP",
  "Secure Immediate Safety should be Help.",
);
assertEqual(
  secureImmediateSafetyContract.variants.length,
  1,
  "Secure Immediate Safety must have exactly one variant.",
);
const secureImmediateSafetyVariant = secureImmediateSafetyContract.variants[0];
assertEqual(
  secureImmediateSafetyVariant.authoring.intention,
  "INTERVENTION",
  "Secure Immediate Safety Intention mismatch.",
);
assertEqual(
  secureImmediateSafetyVariant.authoring.methodId,
  "RESCUE",
  "Secure Immediate Safety Method mismatch.",
);
assertEqual(
  secureImmediateSafetyVariant.authoring.sceneImpact,
  "STANDARD",
  "Secure Immediate Safety Impact mismatch.",
);
assertEqual(
  secureImmediateSafetyVariant.authoring.scope,
  "ONE_TARGET",
  "Secure Immediate Safety Scope mismatch.",
);
assertEqual(
  secureImmediateSafetyVariant.counterEligible,
  false,
  "Secure Immediate Safety must disallow Counter.",
);
assertEqual(
  secureImmediateSafetyVariant.privilegeCostKey,
  "SECURE_IMMEDIATE_SAFETY",
  "Secure Immediate Safety privilege key mismatch.",
);
assertEqual(
  secureImmediateSafetyVariant.successOutcome,
  secureImmediateSafetyOutcome,
  "Secure Immediate Safety exact outcome mismatch.",
);

for (const [sceneImpact, expectedIds] of [
  ["MINOR", "HIDE_FROM_IMMEDIATE_DANGER"],
  ["STANDARD", "SECURE_IMMEDIATE_SAFETY"],
  ["MAJOR", ""],
  ["LEGENDARY", ""],
] as const) {
  assertEqual(
    getCompatibleRoleplayOutcomeContracts({ ...hideAuthoring, sceneImpact })
      .map((contract) => contract.id)
      .join(","),
    expectedIds,
    `${sceneImpact} Rescue compatibility mismatch.`,
  );
}

const iveGotYou = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(20),
  name: "I've Got You",
  narrativeTheme:
    "You identify the only coherent route to safety, reach the target at the decisive moment, and guide or pull them clear before the peril closes.",
  intention: "INTERVENTION",
  methodId: "RESCUE",
  sceneImpact: "STANDARD",
  scope: "ONE_TARGET",
  diceCount: 3,
  outcomeContractId: "SECURE_IMMEDIATE_SAFETY",
  counter: true,
});
assertEqual(getRoleplayAbilityMethodName(iveGotYou), "Rescue", "Rescue Method name mismatch.");
assertEqual(
  getCompatibleRoleplayOutcomeContracts(iveGotYou)
    .map((contract) => contract.id)
    .join(","),
  "SECURE_IMMEDIATE_SAFETY",
  "Standard Rescue should expose only Secure Immediate Safety.",
);
assertEqual(
  getRoleplayAbilityContractName(iveGotYou),
  "Secure Immediate Safety",
  "Selected Secure Immediate Safety name mismatch.",
);
assertEqual(
  getRoleplayAbilityOutcomeLane(iveGotYou),
  "HELP",
  "Secure Immediate Safety lane mismatch.",
);
assertEqual(
  getRoleplayAbilitySuccessOutcome(iveGotYou),
  secureImmediateSafetyOutcome,
  "Secure Immediate Safety prototype outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(iveGotYou),
  secureImmediateSafetyDescriptor,
  "Secure Immediate Safety descriptor mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(iveGotYou),
  false,
  "Secure Immediate Safety should be Counter-ineligible.",
);
assertEqual(iveGotYou.counter, false, "Secure Immediate Safety should force Counter off.");
assert(
  !getRoleplayAbilityWarnings(iveGotYou).some(
    (warning) => warning.includes("Custom Method") || warning.includes("Custom Outcome"),
  ),
  "Secure Immediate Safety should not produce Custom approval warnings.",
);

for (const invalidAuthoring of [
  { sceneImpact: "MINOR" as const },
  { sceneImpact: "MAJOR" as const },
  { sceneImpact: "LEGENDARY" as const },
  { scope: "SELF" as const },
  { scope: "SMALL_GROUP" as const },
  { scope: "LARGE_GROUP" as const },
  { scope: "FACTION_ARMY" as const },
  { methodId: "INTERRUPT" as const },
  { intention: "PERSUASION" as const },
]) {
  assert(
    !getCompatibleRoleplayOutcomeContracts({
      ...iveGotYou,
      ...invalidAuthoring,
    }).some((contract) => contract.id === "SECURE_IMMEDIATE_SAFETY"),
    `Secure Immediate Safety should reject ${JSON.stringify(invalidAuthoring)}.`,
  );
}

for (const [label, invalidAbility] of [
  ["Minor Impact", { ...iveGotYou, sceneImpact: "MINOR" as const }],
  ["Major Impact", { ...iveGotYou, sceneImpact: "MAJOR" as const }],
  ["Legendary Impact", { ...iveGotYou, sceneImpact: "LEGENDARY" as const }],
  ["Self Scope", { ...iveGotYou, scope: "SELF" as const }],
  ["Small Group Scope", { ...iveGotYou, scope: "SMALL_GROUP" as const }],
  ["Large Group Scope", { ...iveGotYou, scope: "LARGE_GROUP" as const }],
  ["Faction / Army Scope", { ...iveGotYou, scope: "FACTION_ARMY" as const }],
  ["Method", { ...iveGotYou, methodId: "INTERRUPT" as const }],
  ["Intention", { ...iveGotYou, intention: "PERSUASION" as const }],
] as const) {
  const reconciled = reconcileRoleplayAbilityAuthoring({ ...invalidAbility, counter: true });
  assertEqual(
    reconciled.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    `${label} should clear Secure Immediate Safety.`,
  );
  assertEqual(reconciled.counter, false, `${label} should clear Counter.`);
}

const editedImmediateSafety = reconcileRoleplayAbilityAuthoring({
  ...iveGotYou,
  name: "Safe, For Now",
  narrativeTheme: "You spot the safe opening and pull the target clear before it closes.",
  diceCount: 5,
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "MODERATE",
  restrictionTag: "while a coherent route remains",
  restrictionText: "Only while you can directly reach the endangered target.",
});
assertEqual(
  editedImmediateSafety.outcomeContractId,
  "SECURE_IMMEDIATE_SAFETY",
  "Non-invalidating edits should retain Secure Immediate Safety.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(editedImmediateSafety),
  secureImmediateSafetyDescriptor.replace("roll 3 dice", "roll 5 dice"),
  "Secure Immediate Safety Dice Count should only change the roll count.",
);

for (const runtimePerilField of [
  "declaredPeril",
  "immediatePeril",
  "rescuePeril",
  "selectedPeril",
  "perilText",
  "safetyTarget",
  "safePosition",
  "extractionPoint",
]) {
  assert(
    !Object.hasOwn(iveGotYou, runtimePerilField),
    `${runtimePerilField} must remain runtime context rather than stored Ability state.`,
  );
}

const customRescueOutcomeText =
  "The target and every nearby ally are carried to a destination chosen by the player";
const customRescueOutcome = normalizeRoleplayAbility(
  {
    name: "Everyone Out",
    narrativeTheme: "You direct a broad evacuation through the surrounding danger.",
    intention: "INTERVENTION",
    methodId: "RESCUE",
    sceneImpact: "STANDARD",
    scope: "ONE_TARGET",
    diceCount: 3,
    outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
    customOutcomeLane: "HELP",
    customOutcomeRequest: customRescueOutcomeText,
  },
  21,
);
assertEqual(
  customRescueOutcome.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  "Explicit Rescue Custom Outcome must remain Custom Review.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(customRescueOutcome),
  `Choose one target and roll 3 dice. On success, ${customRescueOutcomeText}.`,
  "Rescue Custom Outcome descriptor regression.",
);
assert(
  getRoleplayAbilityWarnings(customRescueOutcome).some((warning) =>
    warning.includes("Custom Outcome requires Game Director approval"),
  ),
  "Rescue Custom Outcome approval warning should remain.",
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

const legacyExtractMethod = normalizeRoleplayAbility(
  {
    intention: "INTERVENTION",
    specific: "EXTRACT",
    description: "You pull a target out of immediate danger.",
  },
  22,
);
assertEqual(
  legacyExtractMethod.methodId,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  "Legacy EXTRACT must remain Custom Method review.",
);
assertEqual(
  legacyExtractMethod.customMethodName,
  "Extract",
  "Legacy EXTRACT should preserve its readable Method name.",
);
assertEqual(
  legacyExtractMethod.narrativeTheme,
  "You pull a target out of immediate danger.",
  "Legacy EXTRACT description should migrate to Narrative Theme.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(legacyExtractMethod).length,
  0,
  "Legacy EXTRACT must not match a standard Outcome Contract.",
);
assert(
  getRoleplayAbilityWarnings(legacyExtractMethod).includes(
    "Custom Method requires Game Director approval.",
  ),
  "Legacy EXTRACT should retain the Custom Method approval warning.",
);
for (const legacyField of ["specific", "description"]) {
  assert(
    !Object.hasOwn(legacyExtractMethod, legacyField),
    `Legacy EXTRACT must not retain ${legacyField}.`,
  );
}

assertEqual(
  ROLEPLAY_METHODS.map((method) => method.id).join(","),
  "APPEAL,RALLY,MISDIRECT,DISTRACT,RESCUE,INTERRUPT,CHALLENGE,OVERAWE,DISCERN_TRUTH",
  "The standard Method registry should contain exactly the nine approved IDs.",
);
assertEqual(ROLEPLAY_OUTCOME_CONTRACTS.length, 11, "The registry should contain eleven contracts.");
assertEqual(
  ROLEPLAY_OUTCOME_CONTRACTS.reduce((total, contract) => total + contract.variants.length, 0),
  40,
  "The registry should contain forty exact variants.",
);
assertEqual(
  getRoleplayMethodDefinition("EXTRACT"),
  null,
  "EXTRACT must not become a standard Method.",
);
assertEqual(
  getRoleplayMethodDefinition("SPOT_WEAKNESS"),
  null,
  "SPOT_WEAKNESS must not become a standard Method.",
);
for (const [methodId, intention] of [
  ["APPEAL", "PERSUASION"],
  ["RALLY", "PERSUASION"],
  ["MISDIRECT", "DECEPTION"],
  ["DISTRACT", "DECEPTION"],
  ["RESCUE", "INTERVENTION"],
  ["INTERRUPT", "INTERVENTION"],
  ["CHALLENGE", "INTIMIDATION"],
  ["OVERAWE", "INTIMIDATION"],
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
  "Does not automatically deceive anyone outside the selected Scope.",
  "Does not establish an unlimited collection of separate false claims.",
]) {
  assert(
    misdirectMethod.exclusions.includes(exclusion),
    `Misdirect exclusion missing: ${exclusion}`,
  );
}

const distractMethod = getRoleplayMethodDefinition("DISTRACT");
assert(distractMethod, "DISTRACT should exist in the Method registry.");
assertEqual(distractMethod.name, "Distract", "Distract Method name mismatch.");
assertEqual(distractMethod.intention, "DECEPTION", "Distract owning Intention mismatch.");
assertEqual(
  distractMethod.definition,
  "Divert a target's immediate attention away from one bounded subject or development by creating a plausible competing focus through spectacle, interruption, bait, urgency, noise, movement, performance, or another attention-capturing act.",
  "Distract Method definition mismatch.",
);
assertEqual(
  distractMethod.legalApproaches.join("|"),
  [
    "Create a sudden noise, spectacle, or commotion",
    "Engage the target in an absorbing conversation or performance",
    "Draw attention toward a real competing event",
    "Use an object, movement, or environmental feature as a temporary focus",
    "Exploit curiosity, urgency, pride, habit, or professional attention",
    "Make yourself conspicuous so another development is overlooked",
    "Occupy the target with a plausible immediate concern",
    "Redirect sight, hearing, scrutiny, or active monitoring",
  ].join("|"),
  "Distract legal approaches mismatch.",
);
for (const exclusion of [
  "Does not establish a false or materially misleading premise; that uses Misdirect.",
  "Does not make the target's current or next action fail.",
  "Does not make another character hidden or invisible.",
  "Does not guarantee that the action enabled by the distraction succeeds.",
]) {
  assert(distractMethod.exclusions.includes(exclusion), `Distract exclusion missing: ${exclusion}`);
}

const overaweMethod = getRoleplayMethodDefinition("OVERAWE");
assert(overaweMethod, "OVERAWE should exist in the Method registry.");
assertEqual(overaweMethod.name, "Overawe", "Overawe Method name mismatch.");
assertEqual(overaweMethod.intention, "INTIMIDATION", "Overawe owning Intention mismatch.");
assertEqual(
  overaweMethod.definition,
  "Intimidate through a credible threat, display of power, authority, reputation, certainty, omen, or consequence that makes continued opposition feel too dangerous or costly.",
  "Overawe Method definition mismatch.",
);
for (const exclusion of [
  "Does not rely on deliberate lies or concealed falsehoods.",
  "Does not create comprehension, fear, self-preservation, evaluative judgement, or agency where none exists.",
  "Does not force surrender, confession, cooperation, loyalty, or obedience unless an exact Outcome Contract explicitly grants a narrower result.",
  "Does not dictate the target's exact alternative action, movement, tactics, or use of resources.",
]) {
  assert(overaweMethod.exclusions.includes(exclusion), `Overawe exclusion missing: ${exclusion}`);
}

for (const [intention, expectedIds] of [
  ["PERSUASION", "APPEAL,RALLY"],
  ["DECEPTION", "MISDIRECT,DISTRACT"],
  ["INTERVENTION", "RESCUE,INTERRUPT"],
  ["INTIMIDATION", "CHALLENGE,OVERAWE"],
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
  ["DISTRACT", "DISTRACT", "DECEPTION"],
  ["RESCUE", "RESCUE", "INTERVENTION"],
  ["INTERRUPT", "INTERRUPT", "INTERVENTION"],
  ["CHALLENGE", "CHALLENGE", "INTIMIDATION"],
  ["OVERAWE", "OVERAWE", "INTIMIDATION"],
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

const legacyConfuseMethod = normalizeRoleplayAbility(
  {
    intention: "DECEPTION",
    specific: "CONFUSE",
    description: "You create a confusing impression that invites several interpretations.",
  },
  10,
);
assertEqual(
  legacyConfuseMethod.methodId,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  "Legacy CONFUSE must remain Custom Method review.",
);
assertEqual(
  legacyConfuseMethod.customMethodName,
  "Confuse",
  "Legacy CONFUSE should preserve its readable Method name.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(legacyConfuseMethod).length,
  0,
  "Legacy CONFUSE must not match a standard Outcome Contract.",
);
assert(
  getRoleplayAbilityWarnings(legacyConfuseMethod).includes(
    "Custom Method requires Game Director approval.",
  ),
  "Legacy CONFUSE should retain the Custom Method approval warning.",
);

const legacySpotWeaknessMethod = normalizeRoleplayAbility(
  {
    intention: "PERCEPTION",
    specific: "SPOT_WEAKNESS",
    description: "You study the target for an opening.",
  },
  10,
);
assertEqual(
  legacySpotWeaknessMethod.methodId,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  "Legacy SPOT_WEAKNESS must remain Custom Method review.",
);
assertEqual(
  legacySpotWeaknessMethod.customMethodName,
  "Spot Weakness",
  "Legacy SPOT_WEAKNESS should preserve its readable Method name.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(legacySpotWeaknessMethod).length,
  0,
  "Legacy SPOT_WEAKNESS must not match a standard Outcome Contract.",
);
assert(
  getRoleplayAbilityWarnings(legacySpotWeaknessMethod).includes(
    "Custom Method requires Game Director approval.",
  ),
  "Legacy SPOT_WEAKNESS should retain the Custom Method approval warning.",
);

const legacyThreatenMethod = normalizeRoleplayAbility(
  {
    intention: "INTIMIDATION",
    specific: "THREATEN",
    description: "You threaten the target with consequences.",
  },
  11,
);
assertEqual(
  legacyThreatenMethod.methodId,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  "Legacy THREATEN must remain Custom Method review.",
);
assertEqual(
  legacyThreatenMethod.customMethodName,
  "Threaten",
  "Legacy THREATEN should preserve its readable Method name.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(legacyThreatenMethod).length,
  0,
  "Legacy THREATEN must not match a standard Outcome Contract.",
);
assert(
  getRoleplayAbilityWarnings(legacyThreatenMethod).includes(
    "Custom Method requires Game Director approval.",
  ),
  "Legacy THREATEN should retain the Custom Method approval warning.",
);

const legacyBaitMethod = normalizeRoleplayAbility(
  {
    intention: "DECEPTION",
    specific: "BAIT",
    description: "You present a tempting focus to draw the target's attention.",
  },
  12,
);
assertEqual(
  legacyBaitMethod.methodId,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  "Legacy BAIT must remain Custom Method review.",
);
assertEqual(
  legacyBaitMethod.customMethodName,
  "Bait",
  "Legacy BAIT should preserve its readable Method name.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(legacyBaitMethod).length,
  0,
  "Legacy BAIT must not match a standard Outcome Contract.",
);
assert(
  getRoleplayAbilityWarnings(legacyBaitMethod).includes(
    "Custom Method requires Game Director approval.",
  ),
  "Legacy BAIT should retain the Custom Method approval warning.",
);

const legacyBreakResolveMethod = normalizeRoleplayAbility(
  {
    intention: "INTIMIDATION",
    specific: "BREAK_RESOLVE",
    description: "You make one opposed course feel too costly to continue.",
  },
  13,
);
assertEqual(
  legacyBreakResolveMethod.methodId,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  "Legacy BREAK_RESOLVE must remain Custom Method review.",
);
assertEqual(
  legacyBreakResolveMethod.customMethodName,
  "Break Resolve",
  "Legacy BREAK_RESOLVE should preserve its readable Method name.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(legacyBreakResolveMethod).length,
  0,
  "Legacy BREAK_RESOLVE must not match a standard Outcome Contract.",
);
assert(
  getRoleplayAbilityWarnings(legacyBreakResolveMethod).includes(
    "Custom Method requires Game Director approval.",
  ),
  "Legacy BREAK_RESOLVE should retain the Custom Method approval warning.",
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

const breakResolveOneTargetOutcomes = {
  MINOR:
    "the target breaks off one small immediate course of opposition for the current meaningful exchange; the target may choose another coherent response but does not pursue that course",
  STANDARD:
    "the target abandons one clear course of opposition for the rest of the current scene; the target may choose another coherent response but does not pursue that course",
  MAJOR:
    "the target abandons one central course of opposition for the rest of the current scene and does not resume it despite serious pressure, loyalty, personal cost, or command",
  LEGENDARY:
    "the target adopts an enduring refusal to pursue one defining course of opposition whose consequences extend beyond the current scene and maintains that refusal until it is narratively resolved",
} as const;

const breakResolveOneTargetDescriptors = {
  MINOR:
    "Choose one target and roll 3 dice. On success, the target breaks off one small immediate course of opposition for the current meaningful exchange; the target may choose another coherent response but does not pursue that course.",
  STANDARD:
    "Choose one target and roll 3 dice. On success, the target abandons one clear course of opposition for the rest of the current scene; the target may choose another coherent response but does not pursue that course.",
  MAJOR:
    "Choose one target and roll 3 dice. On success, the target abandons one central course of opposition for the rest of the current scene and does not resume it despite serious pressure, loyalty, personal cost, or command.",
  LEGENDARY:
    "Choose one target and roll 3 dice. On success, the target adopts an enduring refusal to pursue one defining course of opposition whose consequences extend beyond the current scene and maintains that refusal until it is narratively resolved.",
} as const;

const breakSharedResolveGroupOutcomes = {
  MINOR:
    "the selected group breaks off one small immediate shared course of opposition for the current meaningful exchange; each member may choose another coherent response but does not pursue that course",
  STANDARD:
    "the selected group abandons one clear shared course of opposition for the rest of the current scene; each member may choose another coherent response but does not pursue that course",
  MAJOR:
    "the selected group abandons one central shared course of opposition for the rest of the current scene and does not resume it despite serious pressure, loyalty, personal cost, or command",
  LEGENDARY:
    "the selected group adopts an enduring refusal to pursue one defining course of opposition whose consequences extend beyond the current scene and maintains that refusal until it is narratively resolved",
} as const;

const breakSharedResolveGroupDescriptors = {
  MINOR:
    "Choose a small group of targets and roll 3 dice. On success, the selected group breaks off one small immediate shared course of opposition for the current meaningful exchange; each member may choose another coherent response but does not pursue that course.",
  STANDARD:
    "Choose a small group of targets and roll 3 dice. On success, the selected group abandons one clear shared course of opposition for the rest of the current scene; each member may choose another coherent response but does not pursue that course.",
  MAJOR:
    "Choose a small group of targets and roll 3 dice. On success, the selected group abandons one central shared course of opposition for the rest of the current scene and does not resume it despite serious pressure, loyalty, personal cost, or command.",
  LEGENDARY:
    "Choose a small group of targets and roll 3 dice. On success, the selected group adopts an enduring refusal to pursue one defining course of opposition whose consequences extend beyond the current scene and maintains that refusal until it is narratively resolved.",
} as const;

const breakSharedResolveContract = getRoleplayOutcomeContract("BREAK_SHARED_RESOLVE");
assert(breakSharedResolveContract, "BREAK_SHARED_RESOLVE should exist.");
assertEqual(
  breakSharedResolveContract.name,
  "Break Resolve",
  "Break Resolve name mismatch.",
);
assertEqual(
  breakSharedResolveContract.outcomeLane,
  "HINDER",
  "Break Resolve should be Hinder.",
);
assertEqual(
  breakSharedResolveContract.variants.length,
  8,
  "Break Resolve needs exactly eight variants.",
);
assertEqual(
  breakSharedResolveContract.variants.filter(
    (variant) => variant.authoring.scope === "ONE_TARGET",
  ).length,
  4,
  "Break Resolve needs four One Target variants.",
);
assertEqual(
  breakSharedResolveContract.variants.filter(
    (variant) => variant.authoring.scope === "SMALL_GROUP",
  ).length,
  4,
  "Break Resolve needs four Small Group variants.",
);
for (const sceneImpact of ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"] as const) {
  for (const scope of ["ONE_TARGET", "SMALL_GROUP"] as const) {
    const variant = breakSharedResolveContract.variants.find(
      (candidate) =>
        candidate.authoring.sceneImpact === sceneImpact && candidate.authoring.scope === scope,
    );
    assert(variant, `${sceneImpact} / ${scope} Break Resolve variant should exist.`);
    assertEqual(
      variant.authoring.intention,
      "INTIMIDATION",
      `${sceneImpact} / ${scope} Intention mismatch.`,
    );
    assertEqual(
      variant.authoring.methodId,
      "OVERAWE",
      `${sceneImpact} / ${scope} Method mismatch.`,
    );
    assertEqual(
      variant.counterEligible,
      false,
      `${sceneImpact} / ${scope} must disallow Counter.`,
    );
    assertEqual(
      variant.privilegeCostKey,
      scope === "ONE_TARGET"
        ? `BREAK_SHARED_RESOLVE_ONE_TARGET_${sceneImpact}`
        : `BREAK_SHARED_RESOLVE_${sceneImpact}`,
      `${sceneImpact} / ${scope} privilege key mismatch.`,
    );
    assertEqual(
      variant.successOutcome,
      scope === "ONE_TARGET"
        ? breakResolveOneTargetOutcomes[sceneImpact]
        : breakSharedResolveGroupOutcomes[sceneImpact],
      `${sceneImpact} / ${scope} exact outcome mismatch.`,
    );
  }
}

for (const sceneImpact of ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"] as const) {
  for (const scope of ["ONE_TARGET", "SMALL_GROUP"] as const) {
    assertEqual(
      getCompatibleRoleplayOutcomeContracts({
        intention: "INTIMIDATION",
        methodId: "OVERAWE",
        sceneImpact,
        scope,
      })
        .map((contract) => contract.id)
        .join(","),
      "BREAK_SHARED_RESOLVE",
      `${sceneImpact} / ${scope} should expose only Break Resolve.`,
    );
  }
}

const standDown = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(18),
  name: "Stand Down",
  narrativeTheme:
    "You step close enough that the target understands your certainty, your capability, and exactly what continuing this course will cost them.",
  intention: "INTIMIDATION",
  methodId: "OVERAWE",
  sceneImpact: "STANDARD",
  scope: "ONE_TARGET",
  diceCount: 3,
  outcomeContractId: "BREAK_SHARED_RESOLVE",
  counter: true,
});
assertEqual(getRoleplayAbilityMethodName(standDown), "Overawe", "Break Resolve should use Overawe.");
assertEqual(
  getCompatibleRoleplayOutcomeContracts(standDown)
    .map((contract) => contract.id)
    .join(","),
  "BREAK_SHARED_RESOLVE",
  "Overawe / One Target should expose only Break Resolve.",
);
assertEqual(
  getRoleplayAbilityContractName(standDown),
  "Break Resolve",
  "Selected Break Resolve name mismatch.",
);
assertEqual(getRoleplayAbilityOutcomeLane(standDown), "HINDER", "Break Resolve lane mismatch.");
assertEqual(
  getRoleplayAbilitySuccessOutcome(standDown),
  breakResolveOneTargetOutcomes.STANDARD,
  "Break Resolve One Target Standard outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(standDown),
  breakResolveOneTargetDescriptors.STANDARD,
  "Break Resolve One Target Standard descriptor mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(standDown),
  false,
  "Break Resolve should not permit Counter.",
);
assertEqual(standDown.counter, false, "Break Resolve reconciliation should force Counter off.");
assert(
  !getRoleplayAbilityWarnings(standDown).some(
    (warning) => warning.includes("Custom Method") || warning.includes("Custom Outcome"),
  ),
  "Break Resolve should not produce Custom approval warnings.",
);

const youDoNotWantThisFight = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(18),
  name: "You Do Not Want This Fight",
  narrativeTheme:
    "You step into their path, let the weight of your reputation settle over the group, and describe exactly what continued resistance will cost them.",
  intention: "INTIMIDATION",
  methodId: "OVERAWE",
  sceneImpact: "STANDARD",
  scope: "SMALL_GROUP",
  diceCount: 3,
  outcomeContractId: "BREAK_SHARED_RESOLVE",
  counter: true,
});
assertEqual(
  getRoleplayAbilityMethodName(youDoNotWantThisFight),
  "Overawe",
  "Existing Small Group Break Resolve should use Overawe.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(youDoNotWantThisFight)
    .map((contract) => contract.id)
    .join(","),
  "BREAK_SHARED_RESOLVE",
  "Overawe / Small Group should expose only Break Resolve.",
);
assertEqual(
  getRoleplayAbilityContractName(youDoNotWantThisFight),
  "Break Resolve",
  "Selected Small Group Break Resolve name mismatch.",
);
assertEqual(
  getRoleplayAbilityOutcomeLane(youDoNotWantThisFight),
  "HINDER",
  "Small Group Break Resolve lane mismatch.",
);
assertEqual(
  getRoleplayAbilitySuccessOutcome(youDoNotWantThisFight),
  breakSharedResolveGroupOutcomes.STANDARD,
  "Existing Small Group Standard outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(youDoNotWantThisFight),
  breakSharedResolveGroupDescriptors.STANDARD,
  "Existing Small Group Standard descriptor mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(youDoNotWantThisFight),
  false,
  "Small Group Break Resolve should not permit Counter.",
);
assertEqual(
  youDoNotWantThisFight.counter,
  false,
  "Small Group Break Resolve reconciliation should force Counter off.",
);
assert(
  !getRoleplayAbilityWarnings(youDoNotWantThisFight).some(
    (warning) => warning.includes("Custom Method") || warning.includes("Custom Outcome"),
  ),
  "Small Group Break Resolve should not produce Custom approval warnings.",
);

let persistentBreakSharedResolve = reconcileRoleplayAbilityAuthoring({
  ...youDoNotWantThisFight,
  sceneImpact: "MINOR",
  outcomeContractId: "BREAK_SHARED_RESOLVE",
});
for (const sceneImpact of ["STANDARD", "MAJOR", "LEGENDARY", "MINOR"] as const) {
  persistentBreakSharedResolve = reconcileRoleplayAbilityAuthoring({
    ...persistentBreakSharedResolve,
    sceneImpact,
    counter: true,
  });
  assertEqual(
    persistentBreakSharedResolve.outcomeContractId,
    "BREAK_SHARED_RESOLVE",
    `${sceneImpact} should retain Small Group Break Resolve.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(persistentBreakSharedResolve),
    breakSharedResolveGroupOutcomes[sceneImpact],
    `${sceneImpact} Small Group Break Resolve outcome mismatch.`,
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(persistentBreakSharedResolve),
    breakSharedResolveGroupDescriptors[sceneImpact],
    `${sceneImpact} Small Group Break Resolve descriptor mismatch.`,
  );
  assertEqual(
    persistentBreakSharedResolve.counter,
    false,
    `${sceneImpact} Small Group Break Resolve should force Counter off.`,
  );
}

let persistentOneTargetBreakResolve = reconcileRoleplayAbilityAuthoring({
  ...standDown,
  sceneImpact: "MINOR",
  outcomeContractId: "BREAK_SHARED_RESOLVE",
});
for (const sceneImpact of ["STANDARD", "MAJOR", "LEGENDARY", "MINOR"] as const) {
  persistentOneTargetBreakResolve = reconcileRoleplayAbilityAuthoring({
    ...persistentOneTargetBreakResolve,
    sceneImpact,
    counter: true,
  });
  assertEqual(
    persistentOneTargetBreakResolve.outcomeContractId,
    "BREAK_SHARED_RESOLVE",
    `${sceneImpact} One Target should retain Break Resolve.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(persistentOneTargetBreakResolve),
    breakResolveOneTargetOutcomes[sceneImpact],
    `${sceneImpact} One Target Break Resolve outcome mismatch.`,
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(persistentOneTargetBreakResolve),
    breakResolveOneTargetDescriptors[sceneImpact],
    `${sceneImpact} One Target Break Resolve descriptor mismatch.`,
  );
  assertEqual(
    persistentOneTargetBreakResolve.counter,
    false,
    `${sceneImpact} One Target Break Resolve should force Counter off.`,
  );
}

for (const sceneImpact of ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"] as const) {
  const oneTarget = reconcileRoleplayAbilityAuthoring({
    ...standDown,
    sceneImpact,
    scope: "ONE_TARGET",
    outcomeContractId: "BREAK_SHARED_RESOLVE",
    counter: true,
  });
  const smallGroup = reconcileRoleplayAbilityAuthoring({
    ...oneTarget,
    scope: "SMALL_GROUP",
    counter: true,
  });
  const oneTargetAgain = reconcileRoleplayAbilityAuthoring({
    ...smallGroup,
    scope: "ONE_TARGET",
    counter: true,
  });
  for (const [label, ability, outcome, descriptor] of [
    ["initial One Target", oneTarget, breakResolveOneTargetOutcomes[sceneImpact], breakResolveOneTargetDescriptors[sceneImpact]],
    ["Small Group", smallGroup, breakSharedResolveGroupOutcomes[sceneImpact], breakSharedResolveGroupDescriptors[sceneImpact]],
    ["restored One Target", oneTargetAgain, breakResolveOneTargetOutcomes[sceneImpact], breakResolveOneTargetDescriptors[sceneImpact]],
  ] as const) {
    assertEqual(
      ability.outcomeContractId,
      "BREAK_SHARED_RESOLVE",
      `${sceneImpact} ${label} scope switch should retain Break Resolve.`,
    );
    assertEqual(
      getRoleplayAbilitySuccessOutcome(ability),
      outcome,
      `${sceneImpact} ${label} scope switch outcome mismatch.`,
    );
    assertEqual(
      renderRoleplayAbilityDescriptor(ability),
      descriptor,
      `${sceneImpact} ${label} scope switch descriptor mismatch.`,
    );
    assertEqual(ability.counter, false, `${sceneImpact} ${label} should force Counter off.`);
  }
}

for (const invalidAuthoring of [
  { scope: "SELF" as const },
  { scope: "LARGE_GROUP" as const },
  { scope: "FACTION_ARMY" as const },
  { methodId: "CHALLENGE" as const },
  { intention: "PERSUASION" as const },
]) {
  assert(
    !getCompatibleRoleplayOutcomeContracts({
      ...youDoNotWantThisFight,
      ...invalidAuthoring,
    }).some((contract) => contract.id === "BREAK_SHARED_RESOLVE"),
    `Break Resolve should reject ${JSON.stringify(invalidAuthoring)}.`,
  );
}

for (const [label, invalidAbility] of [
  ["Self Scope", { ...youDoNotWantThisFight, scope: "SELF" as const }],
  ["Large Group Scope", { ...youDoNotWantThisFight, scope: "LARGE_GROUP" as const }],
  ["Faction / Army Scope", { ...youDoNotWantThisFight, scope: "FACTION_ARMY" as const }],
  ["Method", { ...youDoNotWantThisFight, methodId: "CHALLENGE" as const }],
  ["Intention", { ...youDoNotWantThisFight, intention: "PERSUASION" as const }],
] as const) {
  const reconciled = reconcileRoleplayAbilityAuthoring({ ...invalidAbility, counter: true });
  assertEqual(
    reconciled.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    `${label} should clear Break Resolve.`,
  );
  assertEqual(reconciled.counter, false, `${label} should clear Counter.`);
}

const editedBreakResolve = reconcileRoleplayAbilityAuthoring({
  ...standDown,
  name: "Enough",
  narrativeTheme: "You name the cost of continuing and let the target see your resolve.",
  diceCount: 5,
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "MODERATE",
  restrictionTag: "while the target can see you",
  restrictionText: "Only while the selected target can witness the warning.",
});
assertEqual(
  editedBreakResolve.outcomeContractId,
  "BREAK_SHARED_RESOLVE",
  "Non-invalidating edits should retain Break Resolve.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(editedBreakResolve),
  breakResolveOneTargetDescriptors.STANDARD.replace("roll 3 dice", "roll 5 dice"),
  "Break Resolve Dice Count should only change the roll count.",
);

for (const runtimeCourseField of [
  "declaredOpposedCourse",
  "opposedCourse",
  "brokenCourse",
  "groupOpposition",
  "selectedOpposition",
  "opposedCourseText",
  "intimidatedGroup",
  "intimidatedTarget",
  "targetOpposition",
]) {
  assert(
    !Object.hasOwn(standDown, runtimeCourseField) &&
      !Object.hasOwn(youDoNotWantThisFight, runtimeCourseField),
    `${runtimeCourseField} must remain runtime context rather than stored Ability state.`,
  );
}

const customOveraweOutcomeText =
  "The target publicly confesses who ordered the current attack";
const customOveraweOutcome = normalizeRoleplayAbility(
  {
    name: "Tell Me Who Sent You",
    narrativeTheme: "You make clear that silence will cost the target more than honesty.",
    intention: "INTIMIDATION",
    methodId: "OVERAWE",
    sceneImpact: "STANDARD",
    scope: "ONE_TARGET",
    diceCount: 3,
    outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
    customOutcomeLane: "HINDER",
    customOutcomeRequest: customOveraweOutcomeText,
  },
  19,
);
assertEqual(
  customOveraweOutcome.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  "Explicit Overawe Custom Outcome must remain Custom Review.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(customOveraweOutcome),
  `Choose one target and roll 3 dice. On success, ${customOveraweOutcomeText}.`,
  "Overawe Custom Outcome descriptor regression.",
);
assert(
  getRoleplayAbilityWarnings(customOveraweOutcome).some((warning) =>
    warning.includes("Custom Outcome requires Game Director approval"),
  ),
  "Overawe Custom Outcome approval warning should remain.",
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
  "UNCOVER_CONCEALED_TRUTH,REVEAL_EXPLOITABLE_WEAKNESS",
  "Discern Truth should expose both standard contracts in registry order.",
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
    getCompatibleRoleplayOutcomeContracts(ability)
      .map((contract) => contract.id)
      .join(","),
    "UNCOVER_CONCEALED_TRUTH,REVEAL_EXPLOITABLE_WEAKNESS",
    `${sceneImpact} Discern Truth compatibility mismatch.`,
  );
  assertEqual(
    ability.outcomeContractId,
    "UNCOVER_CONCEALED_TRUTH",
    `${sceneImpact} should preserve the selected Uncover Concealed Truth family.`,
  );
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

const revealExploitableWeaknessOutcomes = {
  MINOR:
    "you identify one small immediately useful weakness, opening, or opportunity concerning the target for the current meaningful exchange; if no qualifying exploitable opportunity exists, you learn that none is presently accessible",
  STANDARD:
    "you identify one useful exploitable weakness, route, pattern, dependency, or leverage point concerning the target for the current situation; if no qualifying exploitable opportunity exists, you learn that none is presently accessible",
  MAJOR:
    "you reveal one central exploitable vulnerability or opportunity concerning the target that is shaping the current scene and can materially change how it is approached; if no qualifying exploitable opportunity exists, you learn that none is presently accessible",
  LEGENDARY:
    "you reveal one defining vulnerability, hidden route, dependency, or leverage point concerning the target whose significance extends beyond the current scene; if no qualifying exploitable opportunity exists, you learn that none is presently accessible",
} as const;

const revealExploitableWeaknessDescriptors = {
  MINOR:
    "Choose one target and roll 3 dice. On success, you identify one small immediately useful weakness, opening, or opportunity concerning the target for the current meaningful exchange; if no qualifying exploitable opportunity exists, you learn that none is presently accessible.",
  STANDARD:
    "Choose one target and roll 3 dice. On success, you identify one useful exploitable weakness, route, pattern, dependency, or leverage point concerning the target for the current situation; if no qualifying exploitable opportunity exists, you learn that none is presently accessible.",
  MAJOR:
    "Choose one target and roll 3 dice. On success, you reveal one central exploitable vulnerability or opportunity concerning the target that is shaping the current scene and can materially change how it is approached; if no qualifying exploitable opportunity exists, you learn that none is presently accessible.",
  LEGENDARY:
    "Choose one target and roll 3 dice. On success, you reveal one defining vulnerability, hidden route, dependency, or leverage point concerning the target whose significance extends beyond the current scene; if no qualifying exploitable opportunity exists, you learn that none is presently accessible.",
} as const;

const revealWeaknessContract = getRoleplayOutcomeContract("REVEAL_EXPLOITABLE_WEAKNESS");
assert(revealWeaknessContract, "REVEAL_EXPLOITABLE_WEAKNESS should exist.");
assertEqual(
  revealWeaknessContract.name,
  "Reveal Exploitable Weakness",
  "Reveal Exploitable Weakness name mismatch.",
);
assertEqual(
  revealWeaknessContract.outcomeLane,
  "HELP",
  "Reveal Exploitable Weakness should be Help.",
);
assertEqual(
  revealWeaknessContract.variants.length,
  4,
  "Reveal Exploitable Weakness needs four variants.",
);
for (const variant of revealWeaknessContract.variants) {
  const impact = variant.authoring.sceneImpact;
  assertEqual(variant.authoring.intention, "PERCEPTION", `${impact} Intention mismatch.`);
  assertEqual(variant.authoring.methodId, "DISCERN_TRUTH", `${impact} Method mismatch.`);
  assertEqual(variant.authoring.scope, "ONE_TARGET", `${impact} Scope mismatch.`);
  assertEqual(variant.counterEligible, false, `${impact} must disallow Counter.`);
  assertEqual(
    variant.privilegeCostKey,
    `REVEAL_EXPLOITABLE_WEAKNESS_${impact}`,
    `${impact} privilege key mismatch.`,
  );
  assertEqual(
    variant.successOutcome,
    revealExploitableWeaknessOutcomes[impact],
    `${impact} exact outcome mismatch.`,
  );
}

const thereThatsTheWeakPoint = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(13),
  name: "There—That's the Weak Point",
  narrativeTheme:
    "You study the target's movement, structure, and surroundings until an overlooked dependency or opening becomes clear.",
  intention: "PERCEPTION",
  methodId: "DISCERN_TRUTH",
  sceneImpact: "STANDARD",
  scope: "ONE_TARGET",
  diceCount: 3,
  outcomeContractId: "REVEAL_EXPLOITABLE_WEAKNESS",
  counter: true,
});
assertEqual(
  getRoleplayAbilityMethodName(thereThatsTheWeakPoint),
  "Discern Truth",
  "Reveal Exploitable Weakness should retain Discern Truth.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(thereThatsTheWeakPoint)
    .map((contract) => contract.id)
    .join(","),
  "UNCOVER_CONCEALED_TRUTH,REVEAL_EXPLOITABLE_WEAKNESS",
  "Reveal Exploitable Weakness should retain both compatible Perception families.",
);
assertEqual(
  getRoleplayAbilityContractName(thereThatsTheWeakPoint),
  "Reveal Exploitable Weakness",
  "Selected Reveal Exploitable Weakness name mismatch.",
);
assertEqual(
  getRoleplayAbilityOutcomeLane(thereThatsTheWeakPoint),
  "HELP",
  "Reveal Exploitable Weakness lane mismatch.",
);
assertEqual(
  getRoleplayAbilitySuccessOutcome(thereThatsTheWeakPoint),
  revealExploitableWeaknessOutcomes.STANDARD,
  "Reveal Exploitable Weakness Standard outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(thereThatsTheWeakPoint),
  revealExploitableWeaknessDescriptors.STANDARD,
  "Reveal Exploitable Weakness Standard descriptor mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(thereThatsTheWeakPoint),
  false,
  "Reveal Exploitable Weakness should not permit Counter.",
);
assertEqual(
  thereThatsTheWeakPoint.counter,
  false,
  "Reveal Exploitable Weakness reconciliation should force Counter off.",
);
assert(
  !getRoleplayAbilityWarnings(thereThatsTheWeakPoint).some(
    (warning) => warning.includes("Custom Method") || warning.includes("Custom Outcome"),
  ),
  "Reveal Exploitable Weakness should not produce Custom approval warnings.",
);

let persistentRevealWeakness = reconcileRoleplayAbilityAuthoring({
  ...thereThatsTheWeakPoint,
  sceneImpact: "MINOR",
  outcomeContractId: "REVEAL_EXPLOITABLE_WEAKNESS",
});
for (const sceneImpact of ["STANDARD", "MAJOR", "LEGENDARY", "MINOR"] as const) {
  persistentRevealWeakness = reconcileRoleplayAbilityAuthoring({
    ...persistentRevealWeakness,
    sceneImpact,
    counter: true,
  });
  assertEqual(
    persistentRevealWeakness.outcomeContractId,
    "REVEAL_EXPLOITABLE_WEAKNESS",
    `${sceneImpact} should retain Reveal Exploitable Weakness.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(persistentRevealWeakness),
    revealExploitableWeaknessOutcomes[sceneImpact],
    `${sceneImpact} Reveal Exploitable Weakness outcome mismatch.`,
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(persistentRevealWeakness),
    revealExploitableWeaknessDescriptors[sceneImpact],
    `${sceneImpact} Reveal Exploitable Weakness descriptor mismatch.`,
  );
  assertEqual(persistentRevealWeakness.counter, false, `${sceneImpact} should force Counter off.`);
}

for (const [label, invalidAbility] of [
  ["Self Scope", { ...thereThatsTheWeakPoint, scope: "SELF" as const }],
  ["Small Group Scope", { ...thereThatsTheWeakPoint, scope: "SMALL_GROUP" as const }],
  ["Large Group Scope", { ...thereThatsTheWeakPoint, scope: "LARGE_GROUP" as const }],
  ["Faction / Army Scope", { ...thereThatsTheWeakPoint, scope: "FACTION_ARMY" as const }],
  ["Method", { ...thereThatsTheWeakPoint, methodId: "APPEAL" as const }],
  ["Intention", { ...thereThatsTheWeakPoint, intention: "PERSUASION" as const }],
] as const) {
  const reconciled = reconcileRoleplayAbilityAuthoring({ ...invalidAbility, counter: true });
  assertEqual(
    reconciled.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    `${label} should clear Reveal Exploitable Weakness.`,
  );
  assertEqual(reconciled.counter, false, `${label} should clear Counter.`);
}

const editedRevealWeakness = reconcileRoleplayAbilityAuthoring({
  ...thereThatsTheWeakPoint,
  name: "The Hidden Hinge",
  narrativeTheme: "You follow stress, rhythm, and dependency until the useful opening appears.",
  diceCount: 5,
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "MODERATE",
  restrictionTag: "while the target is active",
  restrictionText: "Only after observing the target in operation.",
});
assertEqual(
  editedRevealWeakness.outcomeContractId,
  "REVEAL_EXPLOITABLE_WEAKNESS",
  "Non-invalidating edits should retain Reveal Exploitable Weakness.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(editedRevealWeakness),
  revealExploitableWeaknessDescriptors.STANDARD.replace("roll 3 dice", "roll 5 dice"),
  "Reveal Exploitable Weakness Dice Count should only change the roll count.",
);

for (const runtimeWeaknessField of [
  "subjectType",
  "investigationSubject",
  "targetSubject",
  "declaredObjective",
  "weaknessText",
  "revealedWeakness",
  "exploitableWeakness",
  "opportunityText",
]) {
  assert(
    !Object.hasOwn(thereThatsTheWeakPoint, runtimeWeaknessField),
    `${runtimeWeaknessField} must remain runtime context rather than stored Ability state.`,
  );
}

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

const establishFalseBeliefOneTargetOutcomes = {
  MINOR:
    "the target accepts one small and immediately plausible false premise as true for the current meaningful exchange and treats it as true when making relevant decisions",
  STANDARD:
    "the target genuinely accepts one plausible false premise relevant to the current situation as true for the rest of the current scene and treats it as true when making relevant decisions unless meaningful contradictory evidence resolves the belief",
  MAJOR:
    "the target genuinely accepts one central false premise shaping the current situation as true for the rest of the current scene and continues to treat it as true when making relevant decisions unless decisive contradictory evidence, direct experience, or narrative resolution ends the belief",
  LEGENDARY:
    "the target genuinely accepts one defining false premise whose consequences extend beyond the current scene as true and treats it as true when making relevant decisions until it is decisively disproved or narratively resolved",
} as const;

const establishFalseBeliefOneTargetDescriptors = {
  MINOR:
    "Choose one target and roll 3 dice. On success, the target accepts one small and immediately plausible false premise as true for the current meaningful exchange and treats it as true when making relevant decisions.",
  STANDARD:
    "Choose one target and roll 3 dice. On success, the target genuinely accepts one plausible false premise relevant to the current situation as true for the rest of the current scene and treats it as true when making relevant decisions unless meaningful contradictory evidence resolves the belief.",
  MAJOR:
    "Choose one target and roll 3 dice. On success, the target genuinely accepts one central false premise shaping the current situation as true for the rest of the current scene and continues to treat it as true when making relevant decisions unless decisive contradictory evidence, direct experience, or narrative resolution ends the belief.",
  LEGENDARY:
    "Choose one target and roll 3 dice. On success, the target genuinely accepts one defining false premise whose consequences extend beyond the current scene as true and treats it as true when making relevant decisions until it is decisively disproved or narratively resolved.",
} as const;

const establishFalseBeliefSmallGroupOutcomes = {
  MINOR:
    "every accepted member of the selected group accepts one small and immediately plausible false premise as true for the current meaningful exchange and treats it as true when making relevant decisions",
  STANDARD:
    "every accepted member of the selected group genuinely accepts one plausible false premise relevant to the current situation as true for the rest of the current scene and treats it as true when making relevant decisions unless meaningful contradictory evidence resolves that member's belief",
  MAJOR:
    "every accepted member of the selected group genuinely accepts one central false premise shaping the current situation as true for the rest of the current scene and continues to treat it as true when making relevant decisions unless decisive contradictory evidence, direct experience, or narrative resolution ends that member's belief",
  LEGENDARY:
    "every accepted member of the selected group genuinely accepts one defining false premise whose consequences extend beyond the current scene as true and treats it as true when making relevant decisions until it is decisively disproved or narratively resolved for that member",
} as const;

const establishFalseBeliefSmallGroupDescriptors = {
  MINOR:
    "Choose a small group of targets and roll 3 dice. On success, every accepted member of the selected group accepts one small and immediately plausible false premise as true for the current meaningful exchange and treats it as true when making relevant decisions.",
  STANDARD:
    "Choose a small group of targets and roll 3 dice. On success, every accepted member of the selected group genuinely accepts one plausible false premise relevant to the current situation as true for the rest of the current scene and treats it as true when making relevant decisions unless meaningful contradictory evidence resolves that member's belief.",
  MAJOR:
    "Choose a small group of targets and roll 3 dice. On success, every accepted member of the selected group genuinely accepts one central false premise shaping the current situation as true for the rest of the current scene and continues to treat it as true when making relevant decisions unless decisive contradictory evidence, direct experience, or narrative resolution ends that member's belief.",
  LEGENDARY:
    "Choose a small group of targets and roll 3 dice. On success, every accepted member of the selected group genuinely accepts one defining false premise whose consequences extend beyond the current scene as true and treats it as true when making relevant decisions until it is decisively disproved or narratively resolved for that member.",
} as const;

const falseBeliefContract = getRoleplayOutcomeContract("ESTABLISH_FALSE_BELIEF");
assert(falseBeliefContract, "ESTABLISH_FALSE_BELIEF should exist.");
assertEqual(
  falseBeliefContract.name,
  "Establish False Belief",
  "False Belief contract name mismatch.",
);
assertEqual(falseBeliefContract.outcomeLane, "HINDER", "False Belief should be Hinder.");
assertEqual(falseBeliefContract.variants.length, 8, "False Belief needs eight variants.");
assertEqual(
  falseBeliefContract.variants.filter((variant) => variant.authoring.scope === "ONE_TARGET")
    .length,
  4,
  "False Belief needs four One Target variants.",
);
assertEqual(
  falseBeliefContract.variants.filter((variant) => variant.authoring.scope === "SMALL_GROUP")
    .length,
  4,
  "False Belief needs four Small Group variants.",
);
for (const sceneImpact of ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"] as const) {
  for (const scope of ["ONE_TARGET", "SMALL_GROUP"] as const) {
    const variant = falseBeliefContract.variants.find(
      (candidate) =>
        candidate.authoring.sceneImpact === sceneImpact && candidate.authoring.scope === scope,
    );
    assert(variant, `${sceneImpact} / ${scope} false-belief variant should exist.`);
    assertEqual(variant.authoring.intention, "DECEPTION", "False Belief Intention mismatch.");
    assertEqual(variant.authoring.methodId, "MISDIRECT", "False Belief Method mismatch.");
    assertEqual(variant.counterEligible, false, "False Belief must disallow Counter.");
    assertEqual(
      variant.privilegeCostKey,
      scope === "ONE_TARGET"
        ? `ESTABLISH_FALSE_BELIEF_${sceneImpact}`
        : `ESTABLISH_FALSE_BELIEF_SMALL_GROUP_${sceneImpact}`,
      `${sceneImpact} / ${scope} false-belief privilege key mismatch.`,
    );
    assertEqual(
      variant.successOutcome,
      scope === "ONE_TARGET"
        ? establishFalseBeliefOneTargetOutcomes[sceneImpact]
        : establishFalseBeliefSmallGroupOutcomes[sceneImpact],
      `${sceneImpact} / ${scope} false-belief outcome mismatch.`,
    );
  }
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
  establishFalseBeliefOneTargetOutcomes.STANDARD,
  "Standard false-belief outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(nothingToSeeHere),
  establishFalseBeliefOneTargetDescriptors.STANDARD,
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

for (const sceneImpact of ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"] as const) {
  for (const scope of ["ONE_TARGET", "SMALL_GROUP"] as const) {
    assertEqual(
      getCompatibleRoleplayOutcomeContracts({
        intention: "DECEPTION",
        methodId: "MISDIRECT",
        sceneImpact,
        scope,
      })
        .map((contract) => contract.id)
        .join(","),
      "ESTABLISH_FALSE_BELIEF",
      `${sceneImpact} / ${scope} should expose only Establish False Belief.`,
    );
  }
}

const theOrdersHaveChanged = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(15),
  name: "The Orders Have Changed",
  narrativeTheme:
    "You present the same forged urgency, selective evidence, and confident explanation to the entire patrol so that one false conclusion appears to fit everything they can currently see.",
  intention: "DECEPTION",
  methodId: "MISDIRECT",
  sceneImpact: "STANDARD",
  scope: "SMALL_GROUP",
  diceCount: 3,
  outcomeContractId: "ESTABLISH_FALSE_BELIEF",
  counter: true,
});
assertEqual(
  getRoleplayAbilityMethodName(theOrdersHaveChanged),
  "Misdirect",
  "Small Group False Belief should use Misdirect.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(theOrdersHaveChanged)
    .map((contract) => contract.id)
    .join(","),
  "ESTABLISH_FALSE_BELIEF",
  "Small Group Misdirect should expose only Establish False Belief.",
);
assertEqual(
  getRoleplayAbilityContractName(theOrdersHaveChanged),
  "Establish False Belief",
  "Small Group False Belief contract name mismatch.",
);
assertEqual(
  getRoleplayAbilityOutcomeLane(theOrdersHaveChanged),
  "HINDER",
  "Small Group False Belief lane mismatch.",
);
assertEqual(
  getRoleplayAbilitySuccessOutcome(theOrdersHaveChanged),
  establishFalseBeliefSmallGroupOutcomes.STANDARD,
  "Small Group Standard false-belief outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(theOrdersHaveChanged),
  establishFalseBeliefSmallGroupDescriptors.STANDARD,
  "Small Group Standard false-belief descriptor mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(theOrdersHaveChanged),
  false,
  "Small Group False Belief should be Counter-ineligible.",
);
assertEqual(
  theOrdersHaveChanged.counter,
  false,
  "Small Group False Belief reconciliation should force Counter off.",
);
assert(
  !getRoleplayAbilityWarnings(theOrdersHaveChanged).some(
    (warning) => warning.includes("Custom Method") || warning.includes("Custom Outcome"),
  ),
  "Small Group Misdirect should not have Custom review warnings.",
);

for (const invalidAuthoring of [
  { intention: "PERSUASION" as const },
  { methodId: "DISTRACT" as const },
  { scope: "SELF" as const },
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
    getCompatibleRoleplayOutcomeContracts(persistentFalseBelief)
      .map((contract) => contract.id)
      .join(","),
    "ESTABLISH_FALSE_BELIEF",
    `${sceneImpact} Misdirect compatibility should remain unchanged.`,
  );
  assertEqual(
    persistentFalseBelief.outcomeContractId,
    "ESTABLISH_FALSE_BELIEF",
    `${sceneImpact} should retain the false-belief family ID.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(persistentFalseBelief),
    establishFalseBeliefOneTargetOutcomes[sceneImpact],
    `${sceneImpact} false-belief outcome mismatch.`,
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(persistentFalseBelief),
    establishFalseBeliefOneTargetDescriptors[sceneImpact],
    `${sceneImpact} false-belief descriptor mismatch.`,
  );
  assertEqual(
    persistentFalseBelief.counter,
    false,
    `${sceneImpact} false belief should force Counter off.`,
  );
}

let persistentSmallGroupFalseBelief = reconcileRoleplayAbilityAuthoring({
  ...theOrdersHaveChanged,
  sceneImpact: "MINOR",
  outcomeContractId: "ESTABLISH_FALSE_BELIEF",
});
for (const sceneImpact of ["STANDARD", "MAJOR", "LEGENDARY", "MINOR"] as const) {
  persistentSmallGroupFalseBelief = reconcileRoleplayAbilityAuthoring({
    ...persistentSmallGroupFalseBelief,
    sceneImpact,
    counter: true,
  });
  assertEqual(
    persistentSmallGroupFalseBelief.outcomeContractId,
    "ESTABLISH_FALSE_BELIEF",
    `${sceneImpact} Small Group should retain the false-belief family ID.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(persistentSmallGroupFalseBelief),
    establishFalseBeliefSmallGroupOutcomes[sceneImpact],
    `${sceneImpact} Small Group false-belief outcome mismatch.`,
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(persistentSmallGroupFalseBelief),
    establishFalseBeliefSmallGroupDescriptors[sceneImpact],
    `${sceneImpact} Small Group false-belief descriptor mismatch.`,
  );
  assertEqual(
    persistentSmallGroupFalseBelief.counter,
    false,
    `${sceneImpact} Small Group false belief should force Counter off.`,
  );
}

for (const sceneImpact of ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"] as const) {
  const oneTarget = reconcileRoleplayAbilityAuthoring({
    ...nothingToSeeHere,
    sceneImpact,
    scope: "ONE_TARGET",
    outcomeContractId: "ESTABLISH_FALSE_BELIEF",
    counter: true,
  });
  const smallGroup = reconcileRoleplayAbilityAuthoring({
    ...oneTarget,
    scope: "SMALL_GROUP",
    counter: true,
  });
  const oneTargetAgain = reconcileRoleplayAbilityAuthoring({
    ...smallGroup,
    scope: "ONE_TARGET",
    counter: true,
  });
  for (const [label, ability, outcome, descriptor] of [
    [
      "initial One Target",
      oneTarget,
      establishFalseBeliefOneTargetOutcomes[sceneImpact],
      establishFalseBeliefOneTargetDescriptors[sceneImpact],
    ],
    [
      "Small Group",
      smallGroup,
      establishFalseBeliefSmallGroupOutcomes[sceneImpact],
      establishFalseBeliefSmallGroupDescriptors[sceneImpact],
    ],
    [
      "restored One Target",
      oneTargetAgain,
      establishFalseBeliefOneTargetOutcomes[sceneImpact],
      establishFalseBeliefOneTargetDescriptors[sceneImpact],
    ],
  ] as const) {
    assertEqual(
      ability.outcomeContractId,
      "ESTABLISH_FALSE_BELIEF",
      `${sceneImpact} ${label} switch should retain Establish False Belief.`,
    );
    assertEqual(
      getRoleplayAbilitySuccessOutcome(ability),
      outcome,
      `${sceneImpact} ${label} switch outcome mismatch.`,
    );
    assertEqual(
      renderRoleplayAbilityDescriptor(ability),
      descriptor,
      `${sceneImpact} ${label} switch descriptor mismatch.`,
    );
    assertEqual(ability.counter, false, `${sceneImpact} ${label} should force Counter off.`);
  }
}

for (const [label, invalidAbility] of [
  ["Self Scope", { ...nothingToSeeHere, scope: "SELF" as const }],
  ["Large Group Scope", { ...nothingToSeeHere, scope: "LARGE_GROUP" as const }],
  ["Faction / Army Scope", { ...nothingToSeeHere, scope: "FACTION_ARMY" as const }],
  ["Method", { ...nothingToSeeHere, methodId: "DISTRACT" as const }],
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

const editedFalseBeliefGroup = reconcileRoleplayAbilityAuthoring({
  ...theOrdersHaveChanged,
  name: "Routine Maintenance",
  narrativeTheme: "You carry matching work orders and explain the same mundane fault to the patrol.",
  diceCount: 5,
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "MODERATE",
  restrictionTag: "while the patrol can inspect the work orders",
  restrictionText: "Only when an ordinary explanation fits the surroundings.",
});
assertEqual(
  editedFalseBeliefGroup.outcomeContractId,
  "ESTABLISH_FALSE_BELIEF",
  "Non-invalidating Misdirect edits should retain the contract.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(editedFalseBeliefGroup),
  establishFalseBeliefSmallGroupDescriptors.STANDARD.replace("roll 3 dice", "roll 5 dice"),
  "Misdirect Dice Count should only change the descriptor roll count.",
);
for (const runtimePremiseField of [
  "declaredPremise",
  "premise",
  "falseBelief",
  "beliefText",
  "groupPremise",
  "sharedPremise",
  "groupMembers",
  "selectedMembers",
  "deceivedGroup",
  "beliefTargetIds",
  "memberBeliefs",
]) {
  assert(
    !Object.hasOwn(nothingToSeeHere, runtimePremiseField) &&
      !Object.hasOwn(theOrdersHaveChanged, runtimePremiseField),
    `${runtimePremiseField} must remain runtime context rather than stored Ability state.`,
  );
}

const customMisdirectOutcomeText =
  "Every patrol member repeats the proposed cover story to every guard who arrives later";
const customMisdirectOutcome = normalizeRoleplayAbility(
  {
    name: "Keep the Story Going",
    narrativeTheme: "You provide the patrol with one rehearsed cover story and supporting cues.",
    intention: "DECEPTION",
    methodId: "MISDIRECT",
    sceneImpact: "STANDARD",
    scope: "SMALL_GROUP",
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
  `Choose a small group of targets and roll 3 dice. On success, ${customMisdirectOutcomeText}.`,
  "Misdirect Custom Outcome descriptor regression.",
);
assert(
  getRoleplayAbilityWarnings(customMisdirectOutcome).some((warning) =>
    warning.includes("Custom Outcome requires Game Director approval")),
  "Misdirect Custom Outcome approval warning should remain.",
);

const divertImmediateAttentionOutcome =
  "the target's active attention is diverted for the current meaningful exchange, creating a brief opening for one declared small immediate action or development to proceed without that target's deliberate observation or interference";
const divertImmediateAttentionDescriptor =
  "Choose one target and roll 3 dice. On success, the target's active attention is diverted for the current meaningful exchange, creating a brief opening for one declared small immediate action or development to proceed without that target's deliberate observation or interference.";
const divertImmediateAttentionContract = getRoleplayOutcomeContract(
  "DIVERT_IMMEDIATE_ATTENTION",
);
assert(divertImmediateAttentionContract, "DIVERT_IMMEDIATE_ATTENTION should exist.");
assertEqual(
  divertImmediateAttentionContract.name,
  "Divert Immediate Attention",
  "Divert Immediate Attention name mismatch.",
);
assertEqual(
  divertImmediateAttentionContract.outcomeLane,
  "HINDER",
  "Divert Immediate Attention should be Hinder.",
);
assertEqual(
  divertImmediateAttentionContract.variants.length,
  1,
  "Divert Immediate Attention must have exactly one variant.",
);
const divertImmediateAttentionVariant = divertImmediateAttentionContract.variants[0];
assertEqual(
  divertImmediateAttentionVariant.authoring.intention,
  "DECEPTION",
  "Divert Immediate Attention Intention mismatch.",
);
assertEqual(
  divertImmediateAttentionVariant.authoring.methodId,
  "DISTRACT",
  "Divert Immediate Attention Method mismatch.",
);
assertEqual(
  divertImmediateAttentionVariant.authoring.sceneImpact,
  "MINOR",
  "Divert Immediate Attention Impact mismatch.",
);
assertEqual(
  divertImmediateAttentionVariant.authoring.scope,
  "ONE_TARGET",
  "Divert Immediate Attention Scope mismatch.",
);
assertEqual(
  divertImmediateAttentionVariant.counterEligible,
  false,
  "Divert Immediate Attention must disallow Counter.",
);
assertEqual(
  divertImmediateAttentionVariant.privilegeCostKey,
  "DIVERT_IMMEDIATE_ATTENTION",
  "Divert Immediate Attention privilege key mismatch.",
);
assertEqual(
  divertImmediateAttentionVariant.successOutcome,
  divertImmediateAttentionOutcome,
  "Divert Immediate Attention exact outcome mismatch.",
);

const distractAuthoring = {
  intention: "DECEPTION" as const,
  methodId: "DISTRACT" as const,
  sceneImpact: "MINOR" as const,
  scope: "ONE_TARGET" as const,
};
for (const [sceneImpact, expectedIds] of [
  ["MINOR", "DIVERT_IMMEDIATE_ATTENTION"],
  ["STANDARD", ""],
  ["MAJOR", ""],
  ["LEGENDARY", ""],
] as const) {
  assertEqual(
    getCompatibleRoleplayOutcomeContracts({ ...distractAuthoring, sceneImpact })
      .map((contract) => contract.id)
      .join(","),
    expectedIds,
    `${sceneImpact} Distract compatibility mismatch.`,
  );
}

const lookOverHere = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(23),
  name: "Look Over Here",
  narrativeTheme:
    "You create a sudden absorbing commotion and hold the target's focus just long enough for one overlooked development to unfold.",
  ...distractAuthoring,
  diceCount: 3,
  outcomeContractId: "DIVERT_IMMEDIATE_ATTENTION",
  counter: true,
});
assertEqual(
  getRoleplayAbilityMethodName(lookOverHere),
  "Distract",
  "Divert Immediate Attention should use Distract.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(lookOverHere)
    .map((contract) => contract.id)
    .join(","),
  "DIVERT_IMMEDIATE_ATTENTION",
  "Minor Distract should expose only Divert Immediate Attention.",
);
assertEqual(
  getRoleplayAbilityContractName(lookOverHere),
  "Divert Immediate Attention",
  "Selected Divert Immediate Attention name mismatch.",
);
assertEqual(
  getRoleplayAbilityOutcomeLane(lookOverHere),
  "HINDER",
  "Divert Immediate Attention lane mismatch.",
);
assertEqual(
  getRoleplayAbilitySuccessOutcome(lookOverHere),
  divertImmediateAttentionOutcome,
  "Divert Immediate Attention prototype outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(lookOverHere),
  divertImmediateAttentionDescriptor,
  "Divert Immediate Attention descriptor mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(lookOverHere),
  false,
  "Divert Immediate Attention should be Counter-ineligible.",
);
assertEqual(lookOverHere.counter, false, "Divert Immediate Attention should force Counter off.");
assert(
  !getRoleplayAbilityWarnings(lookOverHere).some(
    (warning) => warning.includes("Custom Method") || warning.includes("Custom Outcome"),
  ),
  "Divert Immediate Attention should not produce Custom approval warnings.",
);

for (const invalidAuthoring of [
  { sceneImpact: "STANDARD" as const },
  { sceneImpact: "MAJOR" as const },
  { sceneImpact: "LEGENDARY" as const },
  { scope: "SELF" as const },
  { scope: "SMALL_GROUP" as const },
  { scope: "LARGE_GROUP" as const },
  { scope: "FACTION_ARMY" as const },
  { methodId: "MISDIRECT" as const },
  { intention: "PERSUASION" as const },
]) {
  assert(
    !getCompatibleRoleplayOutcomeContracts({
      ...lookOverHere,
      ...invalidAuthoring,
    }).some((contract) => contract.id === "DIVERT_IMMEDIATE_ATTENTION"),
    `Divert Immediate Attention should reject ${JSON.stringify(invalidAuthoring)}.`,
  );
}

for (const [label, invalidAbility] of [
  ["Standard Impact", { ...lookOverHere, sceneImpact: "STANDARD" as const }],
  ["Major Impact", { ...lookOverHere, sceneImpact: "MAJOR" as const }],
  ["Legendary Impact", { ...lookOverHere, sceneImpact: "LEGENDARY" as const }],
  ["Self Scope", { ...lookOverHere, scope: "SELF" as const }],
  ["Small Group Scope", { ...lookOverHere, scope: "SMALL_GROUP" as const }],
  ["Large Group Scope", { ...lookOverHere, scope: "LARGE_GROUP" as const }],
  ["Faction / Army Scope", { ...lookOverHere, scope: "FACTION_ARMY" as const }],
  ["Method", { ...lookOverHere, methodId: "MISDIRECT" as const }],
  ["Intention", { ...lookOverHere, intention: "PERSUASION" as const }],
] as const) {
  const reconciled = reconcileRoleplayAbilityAuthoring({ ...invalidAbility, counter: true });
  assertEqual(
    reconciled.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    `${label} should clear Divert Immediate Attention.`,
  );
  assertEqual(reconciled.counter, false, `${label} should clear Counter.`);
}

const editedLookOverHere = reconcileRoleplayAbilityAuthoring({
  ...lookOverHere,
  name: "Just One Moment",
  narrativeTheme: "You seize the target's focus with an urgent, absorbing interruption.",
  diceCount: 5,
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "MODERATE",
  restrictionTag: "while a plausible competing focus exists",
  restrictionText: "Only while the target is actively monitoring the declared development.",
});
assertEqual(
  editedLookOverHere.outcomeContractId,
  "DIVERT_IMMEDIATE_ATTENTION",
  "Non-invalidating edits should retain Divert Immediate Attention.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(editedLookOverHere),
  divertImmediateAttentionDescriptor.replace("roll 3 dice", "roll 5 dice"),
  "Divert Immediate Attention Dice Count should only change the roll count.",
);

for (const runtimeOpeningField of [
  "declaredOpening",
  "openingAction",
  "openingDevelopment",
  "divertedFrom",
  "attentionSubject",
  "protectedSubject",
  "competingFocus",
  "distractionTarget",
  "openingText",
]) {
  assert(
    !Object.hasOwn(lookOverHere, runtimeOpeningField),
    `${runtimeOpeningField} must remain runtime context rather than stored Ability state.`,
  );
}

const customDistractOutcomeText =
  "The target ignores every action by the party for the rest of the current scene";
const customDistractOutcome = normalizeRoleplayAbility(
  {
    name: "Keep Them Occupied",
    narrativeTheme: "You sustain an elaborate performance intended to monopolise attention.",
    intention: "DECEPTION",
    methodId: "DISTRACT",
    sceneImpact: "MINOR",
    scope: "ONE_TARGET",
    diceCount: 3,
    outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
    customOutcomeLane: "HINDER",
    customOutcomeRequest: customDistractOutcomeText,
  },
  24,
);
assertEqual(
  customDistractOutcome.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  "Explicit Distract Custom Outcome must remain Custom Review.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(customDistractOutcome),
  `Choose one target and roll 3 dice. On success, ${customDistractOutcomeText}.`,
  "Distract Custom Outcome descriptor regression.",
);
assert(
  getRoleplayAbilityWarnings(customDistractOutcome).some((warning) =>
    warning.includes("Custom Outcome requires Game Director approval"),
  ),
  "Distract Custom Outcome approval warning should remain.",
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
console.log("PASS roleplay secure immediate safety contract smoke");
console.log("PASS roleplay draw hostile attention contract smoke");
console.log("PASS roleplay break shared resolve contract smoke");
console.log("PASS structured roleplay method registry smoke");
console.log("PASS roleplay uncover concealed truth contract smoke");
console.log("PASS roleplay reveal exploitable weakness contract smoke");
console.log("PASS roleplay secure willing cooperation contract smoke");
console.log("PASS roleplay establish false belief contract smoke");
console.log("PASS roleplay divert immediate attention contract smoke");
console.log("PASS roleplay establish shared resolve contract smoke");
