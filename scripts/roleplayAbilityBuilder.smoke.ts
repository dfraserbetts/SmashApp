import { readFileSync } from "node:fs";

import {
  ROLEPLAY_METHODS,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  ROLEPLAY_METHOD_UNSELECTED,
  ROLEPLAY_OUTCOME_CONTRACTS,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
  createDefaultRoleplayAbility,
  auditRoleplayStandardLibrary,
  enumerateRoleplayResolvedContractCells,
  getCompatibleRoleplayOutcomeContracts,
  getRoleplayAbilityContractName,
  getRoleplayAbilityMethodName,
  getRoleplayAbilityCounterEligibility,
  getRoleplayAbilityOutcomeLane,
  getRoleplayAbilitySuccessOutcome,
  getRoleplayAbilityWarnings,
  getRoleplayCompletedImpactsForContract,
  getRoleplayCompletedScopesForContract,
  getRoleplayMethodDefinition,
  getRoleplayMethodsForIntention,
  getRoleplayOutcomeContract,
  getRoleplayOutcomeContractsForMethod,
  normalizeRoleplayAbility,
  reconcileRoleplayAbilityAuthoring,
  reconcileRoleplayAbilityContract,
  renderRoleplayAbilityDescriptor,
  resolveRoleplayOutcomeContract,
  selectRoleplayAbilityOutcomeContract,
  selectRoleplayAbilitySceneImpact,
  selectRoleplayAbilityScope,
  type RoleplayAbility,
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
const hideImmediateDangerOutcome = "the target becomes hidden from the immediate danger";
const hideImmediateDangerDescriptor =
  "Choose one target and roll 3 dice. On success, the target becomes hidden from the immediate danger.";
const hideImmediateDangerSmallGroupOutcome =
  "every accepted member of the selected group becomes hidden from one declared immediate danger";
const hideImmediateDangerSmallGroupDescriptor =
  "Choose a small group of targets and roll 3 dice. On success, every accepted member of the selected group becomes hidden from one declared immediate danger.";
assertEqual(
  getCompatibleRoleplayOutcomeContracts(hideAuthoring).map((contract) => contract.id).join(","),
  "HIDE_FROM_IMMEDIATE_DANGER,SECURE_IMMEDIATE_SAFETY",
  "Both Rescue families should match completed Minor authoring.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts({ ...hideAuthoring, sceneImpact: "MAJOR" })
    .map((contract) => contract.id)
    .join(","),
  "HIDE_FROM_IMMEDIATE_DANGER,SECURE_IMMEDIATE_SAFETY",
  "Both Rescue families should match completed Major authoring.",
);

const hideContract = getRoleplayOutcomeContract("HIDE_FROM_IMMEDIATE_DANGER");
assert(hideContract, "HIDE_FROM_IMMEDIATE_DANGER should still exist.");
const hideCells = enumerateRoleplayResolvedContractCells(hideContract);
assertEqual(hideCells.length, 8, "Hide should contain all eight planned cells.");
assertEqual(
  hideCells.filter((cell) => cell.scope === "ONE_TARGET").length,
  4,
  "Hide should contain four One Target cells.",
);
assertEqual(
  hideCells.filter((cell) => cell.scope === "SMALL_GROUP").length,
  4,
  "Hide should contain four Small Group cells.",
);
const hideOneTargetVariant = hideCells.find(
  (cell) => cell.scope === "ONE_TARGET" && cell.sceneImpact === "MINOR",
);
const hideSmallGroupVariant = hideCells.find(
  (cell) => cell.scope === "SMALL_GROUP" && cell.sceneImpact === "MINOR",
);
assert(hideOneTargetVariant, "Hide One Target variant should exist.");
assert(hideSmallGroupVariant, "Hide Small Group variant should exist.");
assertEqual(
  hideOneTargetVariant.successOutcome,
  hideImmediateDangerOutcome,
  "Hide outcome must remain unchanged.",
);
assertEqual(
  hideOneTargetVariant.privilegeCostKey,
  "HIDE_FROM_IMMEDIATE_DANGER",
  "Hide privilege key must remain unchanged.",
);
assertEqual(hideOneTargetVariant.counterEligible, false, "Hide Counter must remain false.");
assertEqual(
  hideSmallGroupVariant.successOutcome,
  hideImmediateDangerSmallGroupOutcome,
  "Small Group Hide outcome mismatch.",
);
assertEqual(
  hideSmallGroupVariant.privilegeCostKey,
  "HIDE_FROM_IMMEDIATE_DANGER",
  "Small Group Hide privilege key mismatch.",
);
assertEqual(hideSmallGroupVariant.counterEligible, false, "Small Group Hide Counter must be false.");
assertEqual(hideContract.intention, "INTERVENTION", "Hide Intention mismatch.");
assertEqual(hideContract.methodId, "RESCUE", "Hide Method mismatch.");
assertEqual(
  getRoleplayCompletedImpactsForContract(hideContract, "ONE_TARGET").join("|"),
  "MINOR|STANDARD|MAJOR|LEGENDARY",
  "Hide One Target Impact coverage mismatch.",
);

const secureImmediateSafetyOutcome =
  "the target is secured from one declared immediate peril and is no longer directly threatened by it";
const secureImmediateSafetyDescriptor =
  "Choose one target and roll 3 dice. On success, the target is secured from one declared immediate peril and is no longer directly threatened by it.";
const secureImmediateSafetySmallGroupOutcome =
  "every accepted member of the selected group is secured from one declared immediate peril and is no longer directly threatened by it";
const secureImmediateSafetySmallGroupDescriptor =
  "Choose a small group of targets and roll 3 dice. On success, every accepted member of the selected group is secured from one declared immediate peril and is no longer directly threatened by it.";
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
  enumerateRoleplayResolvedContractCells(secureImmediateSafetyContract).length,
  8,
  "Secure Immediate Safety must have all eight planned cells.",
);
const secureImmediateSafetyCells = enumerateRoleplayResolvedContractCells(
  secureImmediateSafetyContract,
);
assertEqual(
  secureImmediateSafetyCells.filter((cell) => cell.scope === "ONE_TARGET").length,
  4,
  "Secure Immediate Safety needs four One Target cells.",
);
assertEqual(
  secureImmediateSafetyCells.filter((cell) => cell.scope === "SMALL_GROUP").length,
  4,
  "Secure Immediate Safety needs four Small Group cells.",
);
const secureImmediateSafetyVariant = secureImmediateSafetyCells.find(
  (cell) => cell.scope === "ONE_TARGET" && cell.sceneImpact === "STANDARD",
);
const secureImmediateSafetySmallGroupVariant = secureImmediateSafetyCells.find(
  (cell) => cell.scope === "SMALL_GROUP" && cell.sceneImpact === "STANDARD",
);
assert(secureImmediateSafetyVariant, "Secure Immediate Safety One Target variant should exist.");
assert(
  secureImmediateSafetySmallGroupVariant,
  "Secure Immediate Safety Small Group variant should exist.",
);
assertEqual(
  secureImmediateSafetyContract.intention,
  "INTERVENTION",
  "Secure Immediate Safety Intention mismatch.",
);
assertEqual(
  secureImmediateSafetyContract.methodId,
  "RESCUE",
  "Secure Immediate Safety Method mismatch.",
);
assertEqual(
  secureImmediateSafetyVariant.sceneImpact,
  "STANDARD",
  "Secure Immediate Safety Impact mismatch.",
);
assertEqual(
  secureImmediateSafetyVariant.scope,
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
assertEqual(
  secureImmediateSafetyContract.intention,
  "INTERVENTION",
  "Small Group Secure Immediate Safety Intention mismatch.",
);
assertEqual(
  secureImmediateSafetyContract.methodId,
  "RESCUE",
  "Small Group Secure Immediate Safety Method mismatch.",
);
assertEqual(
  secureImmediateSafetySmallGroupVariant.sceneImpact,
  "STANDARD",
  "Small Group Secure Immediate Safety Impact mismatch.",
);
assertEqual(
  secureImmediateSafetySmallGroupVariant.counterEligible,
  false,
  "Small Group Secure Immediate Safety must disallow Counter.",
);
assertEqual(
  secureImmediateSafetySmallGroupVariant.privilegeCostKey,
  "SECURE_IMMEDIATE_SAFETY",
  "Small Group Secure Immediate Safety privilege key mismatch.",
);
assertEqual(
  secureImmediateSafetySmallGroupVariant.successOutcome,
  secureImmediateSafetySmallGroupOutcome,
  "Small Group Secure Immediate Safety exact outcome mismatch.",
);

for (const scope of ["ONE_TARGET", "SMALL_GROUP"] as const) {
  for (const [sceneImpact, expectedIds] of [
    ["MINOR", "HIDE_FROM_IMMEDIATE_DANGER,SECURE_IMMEDIATE_SAFETY"],
    ["STANDARD", "HIDE_FROM_IMMEDIATE_DANGER,SECURE_IMMEDIATE_SAFETY"],
    ["MAJOR", "HIDE_FROM_IMMEDIATE_DANGER,SECURE_IMMEDIATE_SAFETY"],
    ["LEGENDARY", "HIDE_FROM_IMMEDIATE_DANGER,SECURE_IMMEDIATE_SAFETY"],
  ] as const) {
    assertEqual(
      getCompatibleRoleplayOutcomeContracts({ ...hideAuthoring, sceneImpact, scope })
        .map((contract) => contract.id)
        .join(","),
      expectedIds,
      `${sceneImpact} / ${scope} Rescue compatibility mismatch.`,
    );
  }
}
for (const scope of ["SELF", "LARGE_GROUP", "FACTION_ARMY"] as const) {
  for (const sceneImpact of ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"] as const) {
    assertEqual(
      getCompatibleRoleplayOutcomeContracts({ ...hideAuthoring, sceneImpact, scope }).length,
      0,
      `${sceneImpact} / ${scope} Rescue should expose no standard contract.`,
    );
  }
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
  "HIDE_FROM_IMMEDIATE_DANGER,SECURE_IMMEDIATE_SAFETY",
  "Standard Rescue should expose both completed Rescue families.",
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

const downStayQuiet = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(25),
  name: "Down, Stay Quiet",
  narrativeTheme:
    "You sweep the frightened civilians into one concealed pocket of the ruins and draw the danger's attention past them.",
  intention: "INTERVENTION",
  methodId: "RESCUE",
  sceneImpact: "MINOR",
  scope: "SMALL_GROUP",
  diceCount: 3,
  outcomeContractId: "HIDE_FROM_IMMEDIATE_DANGER",
  counter: true,
});
assertEqual(getRoleplayAbilityMethodName(downStayQuiet), "Rescue", "Small Group Hide Method mismatch.");
assertEqual(
  getCompatibleRoleplayOutcomeContracts(downStayQuiet).map((contract) => contract.id).join(","),
  "HIDE_FROM_IMMEDIATE_DANGER,SECURE_IMMEDIATE_SAFETY",
  "Minor Small Group Rescue should expose both completed Rescue families.",
);
assertEqual(getRoleplayAbilityOutcomeLane(downStayQuiet), "HELP", "Small Group Hide lane mismatch.");
assertEqual(
  getRoleplayAbilitySuccessOutcome(downStayQuiet),
  hideImmediateDangerSmallGroupOutcome,
  "Small Group Hide prototype outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(downStayQuiet),
  hideImmediateDangerSmallGroupDescriptor,
  "Small Group Hide descriptor mismatch.",
);
assertEqual(downStayQuiet.counter, false, "Small Group Hide should force Counter off.");
assert(
  !getRoleplayAbilityWarnings(downStayQuiet).some(
    (warning) => warning.includes("Custom Method") || warning.includes("Custom Outcome"),
  ),
  "Small Group Hide should not produce Custom warnings.",
);

const everyoneThrough = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(26),
  name: "Everyone Through",
  narrativeTheme:
    "You identify one coherent route through the collapsing district and coordinate the entire group through it before the peril closes.",
  intention: "INTERVENTION",
  methodId: "RESCUE",
  sceneImpact: "STANDARD",
  scope: "SMALL_GROUP",
  diceCount: 3,
  outcomeContractId: "SECURE_IMMEDIATE_SAFETY",
  counter: true,
});
assertEqual(getRoleplayAbilityMethodName(everyoneThrough), "Rescue", "Small Group Safety Method mismatch.");
assertEqual(
  getCompatibleRoleplayOutcomeContracts(everyoneThrough)
    .map((contract) => contract.id)
    .join(","),
  "HIDE_FROM_IMMEDIATE_DANGER,SECURE_IMMEDIATE_SAFETY",
  "Standard Small Group Rescue should expose both completed Rescue families.",
);
assertEqual(getRoleplayAbilityOutcomeLane(everyoneThrough), "HELP", "Small Group Safety lane mismatch.");
assertEqual(
  getRoleplayAbilitySuccessOutcome(everyoneThrough),
  secureImmediateSafetySmallGroupOutcome,
  "Small Group Safety prototype outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(everyoneThrough),
  secureImmediateSafetySmallGroupDescriptor,
  "Small Group Safety descriptor mismatch.",
);
assertEqual(everyoneThrough.counter, false, "Small Group Safety should force Counter off.");
assert(
  !getRoleplayAbilityWarnings(everyoneThrough).some(
    (warning) => warning.includes("Custom Method") || warning.includes("Custom Outcome"),
  ),
  "Small Group Safety should not produce Custom warnings.",
);

for (const [family, oneTarget, smallGroup, oneOutcome, groupOutcome, oneDescriptor, groupDescriptor] of [
  [
    "HIDE_FROM_IMMEDIATE_DANGER",
    reconcileRoleplayAbilityAuthoring({ ...downStayQuiet, scope: "ONE_TARGET" }),
    downStayQuiet,
    hideImmediateDangerOutcome,
    hideImmediateDangerSmallGroupOutcome,
    hideImmediateDangerDescriptor,
    hideImmediateDangerSmallGroupDescriptor,
  ],
  [
    "SECURE_IMMEDIATE_SAFETY",
    iveGotYou,
    everyoneThrough,
    secureImmediateSafetyOutcome,
    secureImmediateSafetySmallGroupOutcome,
    secureImmediateSafetyDescriptor,
    secureImmediateSafetySmallGroupDescriptor,
  ],
] as const) {
  const switchedToGroup = reconcileRoleplayAbilityAuthoring({
    ...oneTarget,
    scope: "SMALL_GROUP",
    counter: true,
  });
  const switchedBack = reconcileRoleplayAbilityAuthoring({
    ...switchedToGroup,
    scope: "ONE_TARGET",
    counter: true,
  });
  for (const [label, ability, outcome, descriptor] of [
    ["One Target", oneTarget, oneOutcome, oneDescriptor],
    ["Small Group", switchedToGroup, groupOutcome, groupDescriptor],
    ["One Target round-trip", switchedBack, oneOutcome, oneDescriptor],
  ] as const) {
    assertEqual(ability.outcomeContractId, family, `${label} should retain ${family}.`);
    assertEqual(getRoleplayAbilitySuccessOutcome(ability), outcome, `${label} outcome mismatch.`);
    assertEqual(renderRoleplayAbilityDescriptor(ability), descriptor, `${label} descriptor mismatch.`);
    assertEqual(ability.counter, false, `${label} should force Counter off.`);
  }
  assertEqual(smallGroup.outcomeContractId, family, `Initial Small Group should retain ${family}.`);
}

for (const [family, ability, invalidChanges] of [
  [
    "HIDE_FROM_IMMEDIATE_DANGER",
    downStayQuiet,
    [
      { scope: "SELF" as const },
      { scope: "LARGE_GROUP" as const },
      { scope: "FACTION_ARMY" as const },
      { methodId: "INTERRUPT" as const },
      { intention: "PERSUASION" as const },
    ],
  ],
  [
    "SECURE_IMMEDIATE_SAFETY",
    everyoneThrough,
    [
      { scope: "SELF" as const },
      { scope: "LARGE_GROUP" as const },
      { scope: "FACTION_ARMY" as const },
      { methodId: "INTERRUPT" as const },
      { intention: "PERSUASION" as const },
    ],
  ],
] as const) {
  for (const invalidChange of invalidChanges) {
    assert(
      !getCompatibleRoleplayOutcomeContracts({ ...ability, ...invalidChange }).some(
        (contract) => contract.id === family,
      ),
      `${family} should reject ${JSON.stringify(invalidChange)}.`,
    );
    const reconciled = reconcileRoleplayAbilityAuthoring({
      ...ability,
      ...invalidChange,
      counter: true,
    });
    assertEqual(
      reconciled.outcomeContractId,
      ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
      `${family} should clear for ${JSON.stringify(invalidChange)}.`,
    );
    assertEqual(reconciled.counter, false, `${family} invalidation should clear Counter.`);
  }
}

for (const [family, ability, expectedDescriptor] of [
  ["HIDE_FROM_IMMEDIATE_DANGER", downStayQuiet, hideImmediateDangerSmallGroupDescriptor],
  ["SECURE_IMMEDIATE_SAFETY", everyoneThrough, secureImmediateSafetySmallGroupDescriptor],
] as const) {
  const edited = reconcileRoleplayAbilityAuthoring({
    ...ability,
    name: `${ability.name} Revised`,
    narrativeTheme: `${ability.narrativeTheme} The whole group remains reachable.`,
    diceCount: 5,
    restrictionType: "CIRCUMSTANCE",
    restrictionBand: "MODERATE",
    restrictionTag: "while one coherent route or concealment remains",
    restrictionText: "Only while every accepted member shares the immediate situation.",
  });
  assertEqual(edited.outcomeContractId, family, `Non-authoring edits should retain ${family}.`);
  assertEqual(
    renderRoleplayAbilityDescriptor(edited),
    expectedDescriptor.replace("roll 3 dice", "roll 5 dice"),
    `${family} Dice Count should only change the roll count.`,
  );
}

for (const runtimeRescueField of [
  "declaredDanger",
  "declaredPeril",
  "immediateDanger",
  "immediatePeril",
  "rescuePeril",
  "selectedPeril",
  "perilText",
  "safetyTarget",
  "safePosition",
  "extractionPoint",
  "groupMembers",
  "selectedMembers",
  "rescuedGroup",
  "hiddenGroup",
  "rescueTargetIds",
  "groupRoute",
  "groupShelter",
  "memberSafety",
]) {
  assert(
    !Object.hasOwn(downStayQuiet, runtimeRescueField) &&
      !Object.hasOwn(everyoneThrough, runtimeRescueField),
    `${runtimeRescueField} must remain runtime context rather than stored Ability state.`,
  );
}

for (const [sceneImpact, customOutcomeRequest] of [
  ["MINOR", "The selected group becomes hidden from every danger in the scene"],
  ["STANDARD", "The selected group is carried to separate destinations chosen by the player"],
] as const) {
  const customRescueOutcome = normalizeRoleplayAbility(
    {
      name: "Everyone Out",
      narrativeTheme: "You direct a broad evacuation through the surrounding danger.",
      intention: "INTERVENTION",
      methodId: "RESCUE",
      sceneImpact,
      scope: "SMALL_GROUP",
      diceCount: 3,
      outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
      customOutcomeLane: "HELP",
      customOutcomeRequest,
    },
    27,
  );
  assertEqual(
    customRescueOutcome.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
    `Explicit ${sceneImpact} / Small Group Rescue Custom Outcome must remain Custom Review.`,
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(customRescueOutcome),
    `Choose a small group of targets and roll 3 dice. On success, ${customOutcomeRequest}.`,
    `${sceneImpact} / Small Group Rescue Custom Outcome descriptor regression.`,
  );
  assert(
    getRoleplayAbilityWarnings(customRescueOutcome).some((warning) =>
      warning.includes("Custom Outcome requires Game Director approval"),
    ),
    `${sceneImpact} / Small Group Rescue Custom Outcome warning should remain.`,
  );
}

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
  "DENY_IMMINENT_HOSTILE_ACT",
  "Changing Deny Impact should retain the contract.",
);
assertEqual(invalidatedDeny.counter, true, "Every Deny Impact should retain Counter.");

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
  "APPEAL,RALLY,STEEL_YOURSELF,MISDIRECT,DISTRACT,RESCUE,INTERRUPT,CHALLENGE,OVERAWE,DISCERN_TRUTH,TRACK",
  "The standard Method registry should contain exactly the eleven approved IDs.",
);
assertEqual(ROLEPLAY_OUTCOME_CONTRACTS.length, 13, "The registry should contain thirteen contracts.");
assertEqual(
  ROLEPLAY_OUTCOME_CONTRACTS.reduce(
    (total, contract) => total + enumerateRoleplayResolvedContractCells(contract).length,
    0,
  ),
  80,
  "The registry should contain all eighty planned cells.",
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
  ["STEEL_YOURSELF", "PERSUASION"],
  ["MISDIRECT", "DECEPTION"],
  ["DISTRACT", "DECEPTION"],
  ["RESCUE", "INTERVENTION"],
  ["INTERRUPT", "INTERVENTION"],
  ["CHALLENGE", "INTIMIDATION"],
  ["OVERAWE", "INTIMIDATION"],
  ["DISCERN_TRUTH", "PERCEPTION"],
  ["TRACK", "PERCEPTION"],
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

const steelYourselfMethod = getRoleplayMethodDefinition("STEEL_YOURSELF");
assert(steelYourselfMethod, "STEEL_YOURSELF should exist in the Method registry.");
assertEqual(steelYourselfMethod.name, "Steel Yourself", "Steel Yourself name mismatch.");
assertEqual(
  steelYourselfMethod.intention,
  "PERSUASION",
  "Steel Yourself owning Intention mismatch.",
);
assertEqual(
  steelYourselfMethod.definition,
  "Strengthen your own resolve by deliberately invoking a personal purpose, value, promise, duty, identity, hope, memory, training, ritual, or acceptance of the stakes.",
  "Steel Yourself definition mismatch.",
);
assertEqual(
  steelYourselfMethod.legalApproaches.join("|"),
  [
    "Recall a person, promise, oath, value, or cause that matters",
    "Focus on one clear immediate purpose",
    "Repeat a mantra, prayer, ritual, or trained mental discipline",
    "Acknowledge fear, pain, exhaustion, or doubt without surrendering the chosen course",
    "Reframe hardship as a chosen cost or sacrifice",
    "Anchor yourself in identity, duty, hope, love, or responsibility",
    "Accept the stakes and consciously choose to continue",
    "Draw strength from a previous hardship, failure, victory, or lesson",
  ].join("|"),
  "Steel Yourself legal approaches mismatch.",
);
for (const exclusion of [
  "Does not target or bind another character; use Appeal or Rally for others.",
  "Does not rely on deliberate self-deception or a false premise.",
  "Does not remove Fear, Control stacks, conditions, fields, attachments, active powers, Injury, or another quantified effect.",
  "Does not restore Health, resources, disabled Attributes, or spent abilities.",
  "Does not grant an additional action, Response, measured movement, bonus, penalty immunity, or another quantified Power output.",
  "Does not make high Difficulty or Legendary Impact legalise an impossible, incoherent, or overbroad course.",
]) {
  assert(
    steelYourselfMethod.exclusions.includes(exclusion),
    `Steel Yourself exclusion missing: ${exclusion}`,
  );
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
  ["PERSUASION", "APPEAL,RALLY,STEEL_YOURSELF"],
  ["DECEPTION", "MISDIRECT,DISTRACT"],
  ["INTERVENTION", "RESCUE,INTERRUPT"],
  ["INTIMIDATION", "CHALLENGE,OVERAWE"],
  ["PERCEPTION", "DISCERN_TRUTH,TRACK"],
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
  ["STEEL_YOURSELF", "STEEL_YOURSELF", "PERSUASION"],
  ["MISDIRECT", "MISDIRECT", "DECEPTION"],
  ["DISTRACT", "DISTRACT", "DECEPTION"],
  ["RESCUE", "RESCUE", "INTERVENTION"],
  ["INTERRUPT", "INTERRUPT", "INTERVENTION"],
  ["CHALLENGE", "CHALLENGE", "INTIMIDATION"],
  ["OVERAWE", "OVERAWE", "INTIMIDATION"],
  ["DISCERN_TRUTH", "DISCERN_TRUTH", "PERCEPTION"],
  ["TRACK", "TRACK", "PERCEPTION"],
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
  enumerateRoleplayResolvedContractCells(breakSharedResolveContract).length,
  8,
  "Break Resolve needs exactly eight completed cells.",
);
const breakSharedResolveCells = enumerateRoleplayResolvedContractCells(
  breakSharedResolveContract,
);
assertEqual(
  breakSharedResolveCells.filter((cell) => cell.scope === "ONE_TARGET").length,
  4,
  "Break Resolve needs four One Target variants.",
);
assertEqual(
  breakSharedResolveCells.filter((cell) => cell.scope === "SMALL_GROUP").length,
  4,
  "Break Resolve needs four Small Group variants.",
);
for (const sceneImpact of ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"] as const) {
  for (const scope of ["ONE_TARGET", "SMALL_GROUP"] as const) {
    const variant = breakSharedResolveCells.find(
      (candidate) =>
        candidate.sceneImpact === sceneImpact && candidate.scope === scope,
    );
    assert(variant, `${sceneImpact} / ${scope} Break Resolve variant should exist.`);
    assertEqual(
      breakSharedResolveContract.intention,
      "INTIMIDATION",
      `${sceneImpact} / ${scope} Intention mismatch.`,
    );
    assertEqual(
      breakSharedResolveContract.methodId,
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
      "BREAK_SHARED_RESOLVE",
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
const uncoverCells = enumerateRoleplayResolvedContractCells(uncoverContract);
assertEqual(uncoverCells.length, 4, "Uncover Concealed Truth needs four completed cells.");
assert(
  uncoverContract.exclusions.includes(
    "Does not permit the Game Director to answer an accepted specific subject of investigation with an unrelated truth.",
  ),
  "Uncover Concealed Truth accepted-subject exclusion is missing.",
);
for (const cell of uncoverCells) {
  assertEqual(uncoverContract.intention, "PERCEPTION", "Contract Intention mismatch.");
  assertEqual(uncoverContract.methodId, "DISCERN_TRUTH", "Contract Method mismatch.");
  assertEqual(cell.scope, "ONE_TARGET", "Cell Scope mismatch.");
  assertEqual(cell.counterEligible, false, "Every cell must disallow Counter.");
  assertEqual(
    cell.privilegeCostKey,
    "UNCOVER_CONCEALED_TRUTH",
    `${cell.sceneImpact} privilege key mismatch.`,
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
  enumerateRoleplayResolvedContractCells(revealWeaknessContract).length,
  4,
  "Reveal Exploitable Weakness needs four completed cells.",
);
for (const cell of enumerateRoleplayResolvedContractCells(revealWeaknessContract)) {
  const impact = cell.sceneImpact;
  assertEqual(revealWeaknessContract.intention, "PERCEPTION", `${impact} Intention mismatch.`);
  assertEqual(revealWeaknessContract.methodId, "DISCERN_TRUTH", `${impact} Method mismatch.`);
  assertEqual(cell.scope, "ONE_TARGET", `${impact} Scope mismatch.`);
  assertEqual(cell.counterEligible, false, `${impact} must disallow Counter.`);
  assertEqual(
    cell.privilegeCostKey,
    "REVEAL_EXPLOITABLE_WEAKNESS",
    `${impact} privilege key mismatch.`,
  );
  assertEqual(
    cell.successOutcome,
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
const cooperationCells = enumerateRoleplayResolvedContractCells(cooperationContract);
assertEqual(cooperationCells.length, 8, "Cooperation needs all eight planned cells.");
for (const cell of cooperationCells) {
  assertEqual(cooperationContract.intention, "PERSUASION", "Cooperation Intention mismatch.");
  assertEqual(cooperationContract.methodId, "APPEAL", "Cooperation Method mismatch.");
  assert(
    cell.scope === "ONE_TARGET" || cell.scope === "SMALL_GROUP",
    "Cooperation Scope mismatch.",
  );
  assertEqual(cell.counterEligible, false, "Cooperation must disallow Counter.");
  assertEqual(
    cell.privilegeCostKey,
    "SECURE_WILLING_COOPERATION",
    `${cell.sceneImpact} cooperation privilege key mismatch.`,
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
  ["Scope", { ...standWithMe, scope: "SELF" as const }],
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
const falseBeliefCells = enumerateRoleplayResolvedContractCells(falseBeliefContract);
assertEqual(falseBeliefCells.length, 8, "False Belief needs eight completed cells.");
assertEqual(
  falseBeliefCells.filter((cell) => cell.scope === "ONE_TARGET").length,
  4,
  "False Belief needs four One Target variants.",
);
assertEqual(
  falseBeliefCells.filter((cell) => cell.scope === "SMALL_GROUP").length,
  4,
  "False Belief needs four Small Group variants.",
);
for (const sceneImpact of ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"] as const) {
  for (const scope of ["ONE_TARGET", "SMALL_GROUP"] as const) {
    const variant = falseBeliefCells.find(
      (candidate) =>
        candidate.sceneImpact === sceneImpact && candidate.scope === scope,
    );
    assert(variant, `${sceneImpact} / ${scope} false-belief variant should exist.`);
    assertEqual(falseBeliefContract.intention, "DECEPTION", "False Belief Intention mismatch.");
    assertEqual(falseBeliefContract.methodId, "MISDIRECT", "False Belief Method mismatch.");
    assertEqual(variant.counterEligible, false, "False Belief must disallow Counter.");
    assertEqual(
      variant.privilegeCostKey,
      "ESTABLISH_FALSE_BELIEF",
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
const divertImmediateAttentionSmallGroupOutcome =
  "every accepted member of the selected group has their active attention diverted for the current meaningful exchange, creating a brief opening for one declared small immediate action or development to proceed without deliberate observation or interference from any accepted member";
const divertImmediateAttentionSmallGroupDescriptor =
  "Choose a small group of targets and roll 3 dice. On success, every accepted member of the selected group has their active attention diverted for the current meaningful exchange, creating a brief opening for one declared small immediate action or development to proceed without deliberate observation or interference from any accepted member.";
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
  enumerateRoleplayResolvedContractCells(divertImmediateAttentionContract).length,
  8,
  "Divert Immediate Attention must have all eight planned cells.",
);
const divertImmediateAttentionCells = enumerateRoleplayResolvedContractCells(
  divertImmediateAttentionContract,
);
assertEqual(
  divertImmediateAttentionCells.filter((cell) => cell.scope === "ONE_TARGET").length,
  4,
  "Divert Immediate Attention needs four One Target cells.",
);
assertEqual(
  divertImmediateAttentionCells.filter((cell) => cell.scope === "SMALL_GROUP").length,
  4,
  "Divert Immediate Attention needs four Small Group cells.",
);
for (const scope of ["ONE_TARGET", "SMALL_GROUP"] as const) {
  const variant = divertImmediateAttentionCells.find(
    (candidate) => candidate.scope === scope && candidate.sceneImpact === "MINOR",
  );
  assert(variant, `${scope} Divert Immediate Attention variant should exist.`);
  assertEqual(divertImmediateAttentionContract.intention, "DECEPTION", `${scope} Intention mismatch.`);
  assertEqual(divertImmediateAttentionContract.methodId, "DISTRACT", `${scope} Method mismatch.`);
  assertEqual(variant.sceneImpact, "MINOR", `${scope} Impact mismatch.`);
  assertEqual(variant.counterEligible, false, `${scope} must disallow Counter.`);
  assertEqual(
    variant.privilegeCostKey,
    "DIVERT_IMMEDIATE_ATTENTION",
    `${scope} privilege key mismatch.`,
  );
  assertEqual(
    variant.successOutcome,
    scope === "ONE_TARGET"
      ? divertImmediateAttentionOutcome
      : divertImmediateAttentionSmallGroupOutcome,
    `${scope} exact outcome mismatch.`,
  );
}

const distractAuthoring = {
  intention: "DECEPTION" as const,
  methodId: "DISTRACT" as const,
  sceneImpact: "MINOR" as const,
  scope: "ONE_TARGET" as const,
};
for (const scope of ["ONE_TARGET", "SMALL_GROUP"] as const) {
  for (const [sceneImpact, expectedIds] of [
    ["MINOR", "DIVERT_IMMEDIATE_ATTENTION"],
    ["STANDARD", "DIVERT_IMMEDIATE_ATTENTION"],
    ["MAJOR", "DIVERT_IMMEDIATE_ATTENTION"],
    ["LEGENDARY", "DIVERT_IMMEDIATE_ATTENTION"],
  ] as const) {
    assertEqual(
      getCompatibleRoleplayOutcomeContracts({ ...distractAuthoring, sceneImpact, scope })
        .map((contract) => contract.id)
        .join(","),
      expectedIds,
      `${sceneImpact} / ${scope} Distract compatibility mismatch.`,
    );
  }
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

const allEyesOnMe = reconcileRoleplayAbilityAuthoring({
  ...createDefaultRoleplayAbility(24),
  name: "All Eyes on Me",
  narrativeTheme:
    "You create one spectacular, urgent commotion that captures the entire patrol's focus just long enough for one overlooked development to unfold.",
  intention: "DECEPTION",
  methodId: "DISTRACT",
  sceneImpact: "MINOR",
  scope: "SMALL_GROUP",
  diceCount: 3,
  outcomeContractId: "DIVERT_IMMEDIATE_ATTENTION",
  counter: true,
});
assertEqual(
  getRoleplayAbilityMethodName(allEyesOnMe),
  "Distract",
  "Small Group Divert Immediate Attention should use Distract.",
);
assertEqual(
  getCompatibleRoleplayOutcomeContracts(allEyesOnMe)
    .map((contract) => contract.id)
    .join(","),
  "DIVERT_IMMEDIATE_ATTENTION",
  "Minor Small Group Distract should expose only Divert Immediate Attention.",
);
assertEqual(
  getRoleplayAbilityContractName(allEyesOnMe),
  "Divert Immediate Attention",
  "Small Group Divert Immediate Attention name mismatch.",
);
assertEqual(
  getRoleplayAbilityOutcomeLane(allEyesOnMe),
  "HINDER",
  "Small Group Divert Immediate Attention lane mismatch.",
);
assertEqual(
  getRoleplayAbilitySuccessOutcome(allEyesOnMe),
  divertImmediateAttentionSmallGroupOutcome,
  "Small Group Divert Immediate Attention outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(allEyesOnMe),
  divertImmediateAttentionSmallGroupDescriptor,
  "Small Group Divert Immediate Attention descriptor mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(allEyesOnMe),
  false,
  "Small Group Divert Immediate Attention should be Counter-ineligible.",
);
assertEqual(
  allEyesOnMe.counter,
  false,
  "Small Group Divert Immediate Attention should force Counter off.",
);
assert(
  !getRoleplayAbilityWarnings(allEyesOnMe).some(
    (warning) => warning.includes("Custom Method") || warning.includes("Custom Outcome"),
  ),
  "Small Group Divert Immediate Attention should not produce Custom warnings.",
);

const switchedToSmallGroup = reconcileRoleplayAbilityAuthoring({
  ...lookOverHere,
  scope: "SMALL_GROUP",
  counter: true,
});
const switchedBackToOneTarget = reconcileRoleplayAbilityAuthoring({
  ...switchedToSmallGroup,
  scope: "ONE_TARGET",
  counter: true,
});
for (const [label, ability, outcome, descriptor] of [
  [
    "Small Group",
    switchedToSmallGroup,
    divertImmediateAttentionSmallGroupOutcome,
    divertImmediateAttentionSmallGroupDescriptor,
  ],
  [
    "One Target",
    switchedBackToOneTarget,
    divertImmediateAttentionOutcome,
    divertImmediateAttentionDescriptor,
  ],
] as const) {
  assertEqual(
    ability.outcomeContractId,
    "DIVERT_IMMEDIATE_ATTENTION",
    `${label} switch should retain Divert Immediate Attention.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(ability),
    outcome,
    `${label} switch outcome mismatch.`,
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(ability),
    descriptor,
    `${label} switch descriptor mismatch.`,
  );
  assertEqual(ability.counter, false, `${label} switch should force Counter off.`);
}

for (const invalidAuthoring of [
  { scope: "SELF" as const },
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
  ["Self Scope", { ...lookOverHere, scope: "SELF" as const }],
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

const editedAllEyesOnMe = reconcileRoleplayAbilityAuthoring({
  ...allEyesOnMe,
  name: "Just One Moment",
  narrativeTheme: "You seize the patrol's focus with an urgent, absorbing interruption.",
  diceCount: 5,
  restrictionType: "CIRCUMSTANCE",
  restrictionBand: "MODERATE",
  restrictionTag: "while a plausible competing focus exists",
  restrictionText: "Only while every accepted member is actively monitoring the development.",
});
assertEqual(
  editedAllEyesOnMe.outcomeContractId,
  "DIVERT_IMMEDIATE_ATTENTION",
  "Non-invalidating edits should retain Divert Immediate Attention.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(editedAllEyesOnMe),
  divertImmediateAttentionSmallGroupDescriptor.replace("roll 3 dice", "roll 5 dice"),
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
  "groupMembers",
  "selectedMembers",
  "distractedGroup",
  "distractionTargetIds",
  "memberAttention",
]) {
  assert(
    !Object.hasOwn(lookOverHere, runtimeOpeningField) &&
      !Object.hasOwn(allEyesOnMe, runtimeOpeningField),
    `${runtimeOpeningField} must remain runtime context rather than stored Ability state.`,
  );
}

const customDistractOutcomeText =
  "Every patrol member ignores every action by the party for the rest of the current scene";
const customDistractOutcome = normalizeRoleplayAbility(
  {
    name: "Keep Them Occupied",
    narrativeTheme: "You sustain an elaborate performance intended to monopolise attention.",
    intention: "DECEPTION",
    methodId: "DISTRACT",
    sceneImpact: "MINOR",
    scope: "SMALL_GROUP",
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
  `Choose a small group of targets and roll 3 dice. On success, ${customDistractOutcomeText}.`,
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
const sharedResolveCells = enumerateRoleplayResolvedContractCells(sharedResolveContract);
assertEqual(sharedResolveCells.length, 4, "Shared Resolve needs four completed cells.");
for (const cell of sharedResolveCells) {
  assertEqual(sharedResolveContract.intention, "PERSUASION", "Shared Resolve Intention mismatch.");
  assertEqual(sharedResolveContract.methodId, "RALLY", "Shared Resolve Method mismatch.");
  assertEqual(cell.scope, "SMALL_GROUP", "Shared Resolve Scope mismatch.");
  assertEqual(cell.counterEligible, false, "Shared Resolve must disallow Counter.");
  assertEqual(
    cell.privilegeCostKey,
    "ESTABLISH_SHARED_RESOLVE",
    `${cell.sceneImpact} shared-resolve privilege key mismatch.`,
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

type LegacyDescriptorRegression = {
  contractId: RoleplayAbility["outcomeContractId"];
  scope: RoleplayAbility["scope"];
  sceneImpact: RoleplayAbility["sceneImpact"];
  successOutcome: string;
  descriptor: string;
  counterEligible: boolean;
};

const legacyDescriptorRegressions: LegacyDescriptorRegression[] = [
  {
    contractId: "HIDE_FROM_IMMEDIATE_DANGER",
    scope: "ONE_TARGET",
    sceneImpact: "MINOR",
    successOutcome: hideImmediateDangerOutcome,
    descriptor: hideImmediateDangerDescriptor,
    counterEligible: false,
  },
  {
    contractId: "HIDE_FROM_IMMEDIATE_DANGER",
    scope: "SMALL_GROUP",
    sceneImpact: "MINOR",
    successOutcome: hideImmediateDangerSmallGroupOutcome,
    descriptor: hideImmediateDangerSmallGroupDescriptor,
    counterEligible: false,
  },
  {
    contractId: "SECURE_IMMEDIATE_SAFETY",
    scope: "ONE_TARGET",
    sceneImpact: "STANDARD",
    successOutcome: secureImmediateSafetyOutcome,
    descriptor: secureImmediateSafetyDescriptor,
    counterEligible: false,
  },
  {
    contractId: "SECURE_IMMEDIATE_SAFETY",
    scope: "SMALL_GROUP",
    sceneImpact: "STANDARD",
    successOutcome: secureImmediateSafetySmallGroupOutcome,
    descriptor: secureImmediateSafetySmallGroupDescriptor,
    counterEligible: false,
  },
  {
    contractId: "DENY_IMMINENT_HOSTILE_ACT",
    scope: "ONE_TARGET",
    sceneImpact: "MAJOR",
    successOutcome: "the target's current or next hostile action fails",
    descriptor:
      "Choose one target and roll 3 dice. On success, the target's current or next hostile action fails.",
    counterEligible: true,
  },
];

const regressionImpacts = ["MINOR", "STANDARD", "MAJOR", "LEGENDARY"] as const;
for (const sceneImpact of regressionImpacts) {
  legacyDescriptorRegressions.push({
    contractId: "DRAW_HOSTILE_ATTENTION",
    scope: "ONE_TARGET",
    sceneImpact,
    successOutcome: drawHostileAttentionOutcomes[sceneImpact],
    descriptor: drawHostileAttentionDescriptors[sceneImpact],
    counterEligible: false,
  });
  legacyDescriptorRegressions.push({
    contractId: "BREAK_SHARED_RESOLVE",
    scope: "ONE_TARGET",
    sceneImpact,
    successOutcome: breakResolveOneTargetOutcomes[sceneImpact],
    descriptor: breakResolveOneTargetDescriptors[sceneImpact],
    counterEligible: false,
  });
  legacyDescriptorRegressions.push({
    contractId: "BREAK_SHARED_RESOLVE",
    scope: "SMALL_GROUP",
    sceneImpact,
    successOutcome: breakSharedResolveGroupOutcomes[sceneImpact],
    descriptor: breakSharedResolveGroupDescriptors[sceneImpact],
    counterEligible: false,
  });
  legacyDescriptorRegressions.push({
    contractId: "UNCOVER_CONCEALED_TRUTH",
    scope: "ONE_TARGET",
    sceneImpact,
    successOutcome: uncoverConcealedTruthOutcomes[sceneImpact],
    descriptor: uncoverConcealedTruthDescriptors[sceneImpact],
    counterEligible: false,
  });
  legacyDescriptorRegressions.push({
    contractId: "REVEAL_EXPLOITABLE_WEAKNESS",
    scope: "ONE_TARGET",
    sceneImpact,
    successOutcome: revealExploitableWeaknessOutcomes[sceneImpact],
    descriptor: revealExploitableWeaknessDescriptors[sceneImpact],
    counterEligible: false,
  });
  legacyDescriptorRegressions.push({
    contractId: "SECURE_WILLING_COOPERATION",
    scope: "ONE_TARGET",
    sceneImpact,
    successOutcome: secureWillingCooperationOutcomes[sceneImpact],
    descriptor: secureWillingCooperationDescriptors[sceneImpact],
    counterEligible: false,
  });
  legacyDescriptorRegressions.push({
    contractId: "ESTABLISH_SHARED_RESOLVE",
    scope: "SMALL_GROUP",
    sceneImpact,
    successOutcome: establishSharedResolveOutcomes[sceneImpact],
    descriptor: establishSharedResolveDescriptors[sceneImpact],
    counterEligible: false,
  });
  legacyDescriptorRegressions.push({
    contractId: "ESTABLISH_FALSE_BELIEF",
    scope: "ONE_TARGET",
    sceneImpact,
    successOutcome: establishFalseBeliefOneTargetOutcomes[sceneImpact],
    descriptor: establishFalseBeliefOneTargetDescriptors[sceneImpact],
    counterEligible: false,
  });
  legacyDescriptorRegressions.push({
    contractId: "ESTABLISH_FALSE_BELIEF",
    scope: "SMALL_GROUP",
    sceneImpact,
    successOutcome: establishFalseBeliefSmallGroupOutcomes[sceneImpact],
    descriptor: establishFalseBeliefSmallGroupDescriptors[sceneImpact],
    counterEligible: false,
  });
}
legacyDescriptorRegressions.push(
  {
    contractId: "DIVERT_IMMEDIATE_ATTENTION",
    scope: "ONE_TARGET",
    sceneImpact: "MINOR",
    successOutcome: divertImmediateAttentionOutcome,
    descriptor: divertImmediateAttentionDescriptor,
    counterEligible: false,
  },
  {
    contractId: "DIVERT_IMMEDIATE_ATTENTION",
    scope: "SMALL_GROUP",
    sceneImpact: "MINOR",
    successOutcome: divertImmediateAttentionSmallGroupOutcome,
    descriptor: divertImmediateAttentionSmallGroupDescriptor,
    counterEligible: false,
  },
);

assertEqual(
  legacyDescriptorRegressions.length,
  43,
  "The legacy descriptor regression table must preserve all pre-completion cells.",
);

const completionOutcomeRegressions: Array<
  Omit<LegacyDescriptorRegression, "descriptor" | "counterEligible">
> = [
  {
    contractId: "HIDE_FROM_IMMEDIATE_DANGER",
    scope: "ONE_TARGET",
    sceneImpact: "STANDARD",
    successOutcome:
      "the target becomes hidden from the immediate danger for the rest of the current scene unless an identifiable change defeats that concealment",
  },
  {
    contractId: "HIDE_FROM_IMMEDIATE_DANGER",
    scope: "ONE_TARGET",
    sceneImpact: "MAJOR",
    successOutcome:
      "the target becomes securely hidden from the immediate danger for the rest of the current scene and remains concealed despite active searching, ordinary suspicion, or serious pressure unless decisive circumstances defeat the concealment",
  },
  {
    contractId: "HIDE_FROM_IMMEDIATE_DANGER",
    scope: "ONE_TARGET",
    sceneImpact: "LEGENDARY",
    successOutcome:
      "the target becomes hidden from the immediate danger through a defining concealment whose protection extends beyond the current scene until it is decisively exposed or narratively resolved",
  },
  {
    contractId: "HIDE_FROM_IMMEDIATE_DANGER",
    scope: "SMALL_GROUP",
    sceneImpact: "STANDARD",
    successOutcome:
      "every accepted member of the selected group becomes hidden from one declared immediate danger for the rest of the current scene unless an identifiable change defeats that concealment",
  },
  {
    contractId: "HIDE_FROM_IMMEDIATE_DANGER",
    scope: "SMALL_GROUP",
    sceneImpact: "MAJOR",
    successOutcome:
      "every accepted member of the selected group becomes securely hidden from one declared immediate danger for the rest of the current scene and remains concealed despite active searching, ordinary suspicion, or serious pressure unless decisive circumstances defeat the concealment",
  },
  {
    contractId: "HIDE_FROM_IMMEDIATE_DANGER",
    scope: "SMALL_GROUP",
    sceneImpact: "LEGENDARY",
    successOutcome:
      "every accepted member of the selected group becomes hidden from one declared immediate danger through a defining concealment whose protection extends beyond the current scene until it is decisively exposed or narratively resolved",
  },
  {
    contractId: "SECURE_IMMEDIATE_SAFETY",
    scope: "ONE_TARGET",
    sceneImpact: "MINOR",
    successOutcome:
      "the target is secured from one small immediate peril for the current meaningful exchange and is no longer directly threatened by it during that exchange",
  },
  {
    contractId: "SECURE_IMMEDIATE_SAFETY",
    scope: "ONE_TARGET",
    sceneImpact: "MAJOR",
    successOutcome:
      "the target is secured from one central immediate peril for the rest of the current scene and remains outside its direct threat despite serious pressure or worsening conditions unless a decisive change defeats the safe state",
  },
  {
    contractId: "SECURE_IMMEDIATE_SAFETY",
    scope: "ONE_TARGET",
    sceneImpact: "LEGENDARY",
    successOutcome:
      "the target is secured from one defining peril through an enduring safe state whose protection extends beyond the current scene until it is decisively breached or narratively resolved",
  },
  {
    contractId: "SECURE_IMMEDIATE_SAFETY",
    scope: "SMALL_GROUP",
    sceneImpact: "MINOR",
    successOutcome:
      "every accepted member of the selected group is secured from one small immediate peril for the current meaningful exchange and is no longer directly threatened by it during that exchange",
  },
  {
    contractId: "SECURE_IMMEDIATE_SAFETY",
    scope: "SMALL_GROUP",
    sceneImpact: "MAJOR",
    successOutcome:
      "every accepted member of the selected group is secured from one central immediate peril for the rest of the current scene and remains outside its direct threat despite serious pressure or worsening conditions unless a decisive change defeats the safe state",
  },
  {
    contractId: "SECURE_IMMEDIATE_SAFETY",
    scope: "SMALL_GROUP",
    sceneImpact: "LEGENDARY",
    successOutcome:
      "every accepted member of the selected group is secured from one defining peril through an enduring safe state whose protection extends beyond the current scene until it is decisively breached or narratively resolved",
  },
  {
    contractId: "DENY_IMMINENT_HOSTILE_ACT",
    scope: "ONE_TARGET",
    sceneImpact: "MINOR",
    successOutcome:
      "one small immediate hostile act the target is about to take is spoiled before it resolves",
  },
  {
    contractId: "DENY_IMMINENT_HOSTILE_ACT",
    scope: "ONE_TARGET",
    sceneImpact: "STANDARD",
    successOutcome: "the target's current hostile action fails before it resolves",
  },
  {
    contractId: "DENY_IMMINENT_HOSTILE_ACT",
    scope: "ONE_TARGET",
    sceneImpact: "LEGENDARY",
    successOutcome:
      "the target's defining current or next hostile action fails before it resolves, preventing the defining consequence that action would otherwise establish",
  },
  {
    contractId: "SECURE_WILLING_COOPERATION",
    scope: "SMALL_GROUP",
    sceneImpact: "MINOR",
    successOutcome:
      "every accepted member of the selected group willingly complies with one small immediate request requiring negligible sacrifice, risk, or commitment",
  },
  {
    contractId: "SECURE_WILLING_COOPERATION",
    scope: "SMALL_GROUP",
    sceneImpact: "STANDARD",
    successOutcome:
      "every accepted member of the selected group willingly agrees to and sincerely carries out one meaningful request involving inconvenience, social cost, or modest personal risk",
  },
  {
    contractId: "SECURE_WILLING_COOPERATION",
    scope: "SMALL_GROUP",
    sceneImpact: "MAJOR",
    successOutcome:
      "every accepted member of the selected group willingly commits to and sincerely pursues one difficult request involving substantial effort, personal cost, reputational danger, or physical risk",
  },
  {
    contractId: "SECURE_WILLING_COOPERATION",
    scope: "SMALL_GROUP",
    sceneImpact: "LEGENDARY",
    successOutcome:
      "every accepted member of the selected group willingly makes one defining commitment, alliance, or promise whose consequences extend beyond the current scene and sincerely upholds it until it is fulfilled or narratively resolved",
  },
  {
    contractId: "DIVERT_IMMEDIATE_ATTENTION",
    scope: "ONE_TARGET",
    sceneImpact: "STANDARD",
    successOutcome:
      "the target's active attention is diverted long enough for one declared meaningful action or development relevant to the current scene to proceed without that target's deliberate observation or interference",
  },
  {
    contractId: "DIVERT_IMMEDIATE_ATTENTION",
    scope: "ONE_TARGET",
    sceneImpact: "MAJOR",
    successOutcome:
      "the target's active attention is diverted despite serious vigilance, pressure, or competing priorities, long enough for one declared central action or development capable of changing the current scene to proceed without that target's deliberate observation or interference",
  },
  {
    contractId: "DIVERT_IMMEDIATE_ATTENTION",
    scope: "ONE_TARGET",
    sceneImpact: "LEGENDARY",
    successOutcome:
      "the target's active attention is diverted through a defining diversion, long enough for one declared defining action or development whose consequences extend beyond the current scene to proceed without that target's deliberate observation or interference",
  },
  {
    contractId: "DIVERT_IMMEDIATE_ATTENTION",
    scope: "SMALL_GROUP",
    sceneImpact: "STANDARD",
    successOutcome:
      "every accepted member of the selected group has their active attention diverted long enough for one declared meaningful action or development relevant to the current scene to proceed without deliberate observation or interference from any accepted member",
  },
  {
    contractId: "DIVERT_IMMEDIATE_ATTENTION",
    scope: "SMALL_GROUP",
    sceneImpact: "MAJOR",
    successOutcome:
      "every accepted member of the selected group has their active attention diverted despite serious vigilance, pressure, or competing priorities, long enough for one declared central action or development capable of changing the current scene to proceed without deliberate observation or interference from any accepted member",
  },
  {
    contractId: "DIVERT_IMMEDIATE_ATTENTION",
    scope: "SMALL_GROUP",
    sceneImpact: "LEGENDARY",
    successOutcome:
      "every accepted member of the selected group has their active attention diverted through a defining diversion, long enough for one declared defining action or development whose consequences extend beyond the current scene to proceed without deliberate observation or interference from any accepted member",
  },
];

const completionDescriptorRegressions: LegacyDescriptorRegression[] =
  completionOutcomeRegressions.map((regression) => ({
    ...regression,
    descriptor: `${
      regression.scope === "ONE_TARGET"
        ? "Choose one target and roll 3 dice."
        : "Choose a small group of targets and roll 3 dice."
    } On success, ${regression.successOutcome}.`,
    counterEligible: regression.contractId === "DENY_IMMINENT_HOSTILE_ACT",
  }));

assertEqual(
  completionDescriptorRegressions.length,
  25,
  "The completion regression table must cover exactly the newly completed cells.",
);

const standardLibrarySource = readFileSync(
  "lib/characterBuilder/roleplayAbilities.ts",
  "utf8",
);
assert(
  ROLEPLAY_OUTCOME_CONTRACTS.every((contract) => !Object.hasOwn(contract, "variants")),
  "Standard contracts must not own exact variant tuples.",
);
assert(
  !standardLibrarySource.includes("RoleplayOutcomeContractVariant"),
  "The retired RoleplayOutcomeContractVariant type must remain absent.",
);
assert(
  !standardLibrarySource.includes("getRoleplayOutcomeContractVariant"),
  "The retired exact-variant lookup helper must remain absent.",
);

const libraryAudit = auditRoleplayStandardLibrary();
assertEqual(libraryAudit.plannedCellCount, 80, "Planned standard-library cell count drifted.");
assertEqual(libraryAudit.completedCellCount, 80, "Completed standard-library cell count drifted.");
assertEqual(libraryAudit.missingCellCount, 0, "Missing standard-library cell count drifted.");
assertEqual(
  new Set(libraryAudit.privilegeKeys).size,
  13,
  "Each contract family must own one unique privilege cost key.",
);
assert(
  ROLEPLAY_OUTCOME_CONTRACTS.every(
    (contract) => contract.privilegeCostKey === contract.id,
  ),
  "Privilege cost keys must identify their contract family rather than a resolved cell.",
);
assertEqual(libraryAudit.structuralErrors.length, 0, "The standard library has structural errors.");
assertEqual(
  libraryAudit.unresolvedTemplateTokens.length,
  0,
  "Completed cells must not contain unresolved template tokens.",
);
assertEqual(
  libraryAudit.missingScopeTokenFragments.length,
  0,
  "Every supported Scope must own its required token fragment.",
);

const expectedMissingCells = {
  HIDE_FROM_IMMEDIATE_DANGER: 0,
  SECURE_IMMEDIATE_SAFETY: 0,
  DENY_IMMINENT_HOSTILE_ACT: 0,
  DRAW_HOSTILE_ATTENTION: 0,
  BREAK_SHARED_RESOLVE: 0,
  UNCOVER_CONCEALED_TRUTH: 0,
  REVEAL_EXPLOITABLE_WEAKNESS: 0,
  TRACE_QUARRY: 0,
  SECURE_WILLING_COOPERATION: 0,
  ESTABLISH_SHARED_RESOLVE: 0,
  SUSTAIN_PERSONAL_RESOLVE: 0,
  ESTABLISH_FALSE_BELIEF: 0,
  DIVERT_IMMEDIATE_ATTENTION: 0,
} as const;
const expectedOutcomeLanes = {
  HIDE_FROM_IMMEDIATE_DANGER: "HELP",
  SECURE_IMMEDIATE_SAFETY: "HELP",
  DENY_IMMINENT_HOSTILE_ACT: "HINDER",
  DRAW_HOSTILE_ATTENTION: "HINDER",
  BREAK_SHARED_RESOLVE: "HINDER",
  UNCOVER_CONCEALED_TRUTH: "HELP",
  REVEAL_EXPLOITABLE_WEAKNESS: "HELP",
  TRACE_QUARRY: "HELP",
  SECURE_WILLING_COOPERATION: "HELP",
  ESTABLISH_SHARED_RESOLVE: "HELP",
  SUSTAIN_PERSONAL_RESOLVE: "HELP",
  ESTABLISH_FALSE_BELIEF: "HINDER",
  DIVERT_IMMEDIATE_ATTENTION: "HINDER",
} as const;
for (const [contractId, expectedCount] of Object.entries(expectedMissingCells)) {
  assertEqual(
    libraryAudit.missingCellsByContract[
      contractId as keyof typeof libraryAudit.missingCellsByContract
    ].length,
    expectedCount,
    `${contractId} missing-cell count drifted.`,
  );
}

assertEqual(
  getRoleplayOutcomeContractsForMethod("INTERVENTION", "RESCUE")
    .map((contract) => contract.id)
    .join("|"),
  "HIDE_FROM_IMMEDIATE_DANGER|SECURE_IMMEDIATE_SAFETY",
  "Outcome Contract options should filter by method ownership only.",
);
assertEqual(
  getRoleplayOutcomeContractsForMethod("PERCEPTION", "DISCERN_TRUTH")
    .map((contract) => contract.id)
    .join("|"),
  "UNCOVER_CONCEALED_TRUTH|REVEAL_EXPLOITABLE_WEAKNESS",
  "Discern Truth should expose both owned contract families before Scope selection.",
);

const compositionalCooperationContract = getRoleplayOutcomeContract(
  "SECURE_WILLING_COOPERATION",
);
assert(compositionalCooperationContract, "Secure Willing Cooperation contract missing.");
assertEqual(
  getRoleplayCompletedScopesForContract(compositionalCooperationContract).join("|"),
  "ONE_TARGET|SMALL_GROUP",
  "Both completed cooperation Scopes must be selectable.",
);
assertEqual(
  getRoleplayCompletedImpactsForContract(
    compositionalCooperationContract,
    "SMALL_GROUP",
  ).join("|"),
  "MINOR|STANDARD|MAJOR|LEGENDARY",
  "Small Group cooperation must expose every Scene Impact.",
);
assert(
  resolveRoleplayOutcomeContract(compositionalCooperationContract, {
    intention: compositionalCooperationContract.intention,
    methodId: compositionalCooperationContract.methodId,
    scope: "SMALL_GROUP",
    sceneImpact: "MINOR",
  }),
  "Completed Small Group cooperation must resolve.",
);

const selectedCooperation = selectRoleplayAbilityOutcomeContract(
  {
    ...createDefaultRoleplayAbility(90),
    intention: compositionalCooperationContract.intention,
    methodId: compositionalCooperationContract.methodId,
    scope: "SMALL_GROUP",
    sceneImpact: "LEGENDARY",
  },
  compositionalCooperationContract.id,
);
assertEqual(selectedCooperation.scope, "SMALL_GROUP", "Contract selection should preserve a completed Scope.");
assertEqual(
  selectedCooperation.sceneImpact,
  "LEGENDARY",
  "Contract selection should preserve a completed Scene Impact when possible.",
);
assertEqual(
  selectRoleplayAbilityScope(selectedCooperation, "SMALL_GROUP").scope,
  "SMALL_GROUP",
  "Selecting a completed Scope should retain the family and Scope.",
);

const compositionalHideContract = getRoleplayOutcomeContract("HIDE_FROM_IMMEDIATE_DANGER");
assert(compositionalHideContract, "Hide from Immediate Danger contract missing.");
const selectedHide = selectRoleplayAbilityOutcomeContract(
  {
    ...createDefaultRoleplayAbility(91),
    intention: compositionalHideContract.intention,
    methodId: compositionalHideContract.methodId,
    scope: "FACTION_ARMY",
    sceneImpact: "MAJOR",
  },
  compositionalHideContract.id,
);
assertEqual(selectedHide.scope, "ONE_TARGET", "Hide should fall back to a completed Scope.");
assertEqual(selectedHide.sceneImpact, "MAJOR", "Hide should preserve its completed Impact.");
assertEqual(
  selectRoleplayAbilitySceneImpact(selectedHide, "STANDARD").sceneImpact,
  "STANDARD",
  "Selecting a completed Scene Impact should retain the family.",
);

const enumeratedCells = ROLEPLAY_OUTCOME_CONTRACTS.flatMap((contract) =>
  enumerateRoleplayResolvedContractCells(contract),
);
assertEqual(enumeratedCells.length, 80, "Every planned standard-library cell must resolve.");
for (const [index, regression] of legacyDescriptorRegressions.entries()) {
  const contract = getRoleplayOutcomeContract(regression.contractId);
  assert(contract, `Regression contract ${regression.contractId} missing.`);
  const resolved = resolveRoleplayOutcomeContract(contract, {
    intention: contract.intention,
    methodId: contract.methodId,
    scope: regression.scope,
    sceneImpact: regression.sceneImpact,
  });
  assert(resolved, `${regression.contractId}/${regression.scope}/${regression.sceneImpact} did not resolve.`);
  assertEqual(resolved.successOutcome, regression.successOutcome, "Composed success outcome drifted.");
  assertEqual(resolved.counterEligible, regression.counterEligible, "Counter eligibility drifted.");
  assertEqual(resolved.privilegeCostKey, contract.id, "Resolved cell should inherit its family key.");

  const ability = reconcileRoleplayAbilityAuthoring({
    ...createDefaultRoleplayAbility(100 + index),
    name: "Descriptor Regression",
    narrativeTheme: "Regression coverage",
    intention: contract.intention,
    methodId: contract.methodId,
    scope: regression.scope,
    sceneImpact: regression.sceneImpact,
    diceCount: 3,
    outcomeContractId: contract.id,
    counter: true,
  });
  assertEqual(ability.outcomeContractId, contract.id, "Completed contract cell was cleared.");
  assertEqual(
    getRoleplayAbilityOutcomeLane(ability),
    expectedOutcomeLanes[contract.id],
    "Legacy Outcome Lane drifted.",
  );
  assertEqual(getRoleplayAbilitySuccessOutcome(ability), regression.successOutcome, "Ability outcome drifted.");
  assertEqual(renderRoleplayAbilityDescriptor(ability), regression.descriptor, "Legacy descriptor drifted.");
  assertEqual(ability.counter, regression.counterEligible, "Stored Counter state drifted.");

  const normalized = normalizeRoleplayAbility(ability, index);
  assertEqual(normalized.outcomeContractId, contract.id, "Normalization cleared a completed cell.");
  assertEqual(renderRoleplayAbilityDescriptor(normalized), regression.descriptor, "Normalized descriptor drifted.");
  for (const generatedField of [
    "successOutcome",
    "generatedDescriptor",
    "scopeTokens",
    "impactFragments",
    "resolvedCells",
    "privilegeCostKey",
    "coverageStatus",
  ]) {
    assert(
      !Object.hasOwn(normalized, generatedField),
      `${generatedField} must not be persisted in Roleplay Ability state.`,
    );
  }
}

for (const contract of ROLEPLAY_OUTCOME_CONTRACTS) {
  assertEqual(
    getRoleplayCompletedScopesForContract(contract).join("|"),
    contract.supportedScopes.join("|"),
    `${contract.id} must expose every supported Scope.`,
  );
  for (const scope of contract.supportedScopes) {
    assertEqual(
      getRoleplayCompletedImpactsForContract(contract, scope).join("|"),
      regressionImpacts.join("|"),
      `${contract.id}/${scope} must expose all four Impacts.`,
    );

    let switchedImpact = selectRoleplayAbilityOutcomeContract(
      {
        ...createDefaultRoleplayAbility(200),
        intention: contract.intention,
        methodId: contract.methodId,
        scope,
        sceneImpact: "MINOR",
      },
      contract.id,
    );
    for (const sceneImpact of regressionImpacts) {
      switchedImpact = selectRoleplayAbilitySceneImpact(switchedImpact, sceneImpact);
      assertEqual(
        switchedImpact.outcomeContractId,
        contract.id,
        `${contract.id}/${scope}/${sceneImpact} Impact switching cleared the family.`,
      );
      assertEqual(
        switchedImpact.sceneImpact,
        sceneImpact,
        `${contract.id}/${scope}/${sceneImpact} Impact switching failed.`,
      );
    }
  }

  if (contract.supportedScopes.length > 1) {
    const firstScope = contract.supportedScopes[0];
    const secondScope = contract.supportedScopes[1];
    assert(secondScope, `${contract.id} expected a second supported Scope.`);
    let switchedScope = selectRoleplayAbilityOutcomeContract(
      {
        ...createDefaultRoleplayAbility(201),
        intention: contract.intention,
        methodId: contract.methodId,
        scope: firstScope,
        sceneImpact: "MINOR",
      },
      contract.id,
    );
    switchedScope = selectRoleplayAbilityScope(switchedScope, secondScope);
    assertEqual(
      switchedScope.outcomeContractId,
      contract.id,
      `${contract.id} Scope switching cleared the family.`,
    );
    assertEqual(switchedScope.scope, secondScope, `${contract.id} Scope switching failed.`);
    switchedScope = selectRoleplayAbilityScope(switchedScope, firstScope);
    assertEqual(
      switchedScope.outcomeContractId,
      contract.id,
      `${contract.id} reverse Scope switching cleared the family.`,
    );
  }

  const validAbility = selectRoleplayAbilityOutcomeContract(
    {
      ...createDefaultRoleplayAbility(202),
      intention: contract.intention,
      methodId: contract.methodId,
      scope: contract.supportedScopes[0],
      sceneImpact: "MINOR",
    },
    contract.id,
  );
  const unsupportedScope: RoleplayAbility["scope"] = contract.supportedScopes.some(
    (scope) => scope === "SELF",
  )
    ? "ONE_TARGET"
    : "SELF";
  for (const [label, invalidAbility] of [
    ["Scope", { ...validAbility, scope: unsupportedScope }],
    [
      "Method",
      {
        ...validAbility,
        methodId: (contract.methodId === "APPEAL"
          ? "RALLY"
          : "APPEAL") as RoleplayAbility["methodId"],
      },
    ],
    [
      "Intention",
      {
        ...validAbility,
        intention: (contract.intention === "DECEPTION"
          ? "PERSUASION"
          : "DECEPTION") as RoleplayAbility["intention"],
      },
    ],
  ] as const) {
    const invalidated = reconcileRoleplayAbilityAuthoring({
      ...invalidAbility,
      counter: true,
    });
    assertEqual(
      invalidated.outcomeContractId,
      ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
      `${contract.id} unsupported ${label} should clear the family.`,
    );
    assertEqual(
      invalidated.counter,
      false,
      `${contract.id} unsupported ${label} should clear Counter.`,
    );
  }
}

for (const [index, regression] of completionDescriptorRegressions.entries()) {
  const contract = getRoleplayOutcomeContract(regression.contractId);
  assert(contract, `Completion contract ${regression.contractId} missing.`);
  const resolved = resolveRoleplayOutcomeContract(contract, {
    intention: contract.intention,
    methodId: contract.methodId,
    scope: regression.scope,
    sceneImpact: regression.sceneImpact,
  });
  assert(
    resolved,
    `${regression.contractId}/${regression.scope}/${regression.sceneImpact} did not resolve.`,
  );
  assertEqual(
    resolved.successOutcome,
    regression.successOutcome,
    "New completion success outcome drifted.",
  );
  assertEqual(
    resolved.counterEligible,
    regression.counterEligible,
    "New completion Counter eligibility drifted.",
  );

  const ability = reconcileRoleplayAbilityAuthoring({
    ...createDefaultRoleplayAbility(300 + index),
    name: "Complete Cell Regression",
    narrativeTheme: "Completion coverage",
    intention: contract.intention,
    methodId: contract.methodId,
    scope: regression.scope,
    sceneImpact: regression.sceneImpact,
    diceCount: 3,
    outcomeContractId: contract.id,
    counter: true,
  });
  const descriptor = renderRoleplayAbilityDescriptor(ability);
  assertEqual(ability.outcomeContractId, contract.id, "New completed cell was cleared.");
  assertEqual(
    getRoleplayAbilitySuccessOutcome(ability),
    regression.successOutcome,
    "New Ability success outcome drifted.",
  );
  assertEqual(descriptor, regression.descriptor, "New completed descriptor drifted.");
  assert(descriptor.endsWith("."), "New completed descriptor must end with a period.");
  assert(!descriptor.endsWith(".."), "New completed descriptor must have one final period.");
  assertEqual(
    ability.counter,
    regression.counterEligible,
    "New completed cell stored an invalid Counter state.",
  );

  const edited = reconcileRoleplayAbilityAuthoring({
    ...ability,
    name: "Edited Complete Cell",
    narrativeTheme: "Edited completion coverage",
    diceCount: 5,
    restrictionType: "CIRCUMSTANCE",
    restrictionBand: "MODERATE",
    restrictionText: "Only when the declared fictional requirement is met.",
  });
  assertEqual(
    edited.outcomeContractId,
    contract.id,
    "Name, Theme, Dice, or restriction edits cleared a completed family.",
  );

  const normalized = normalizeRoleplayAbility(ability, 300 + index);
  assertEqual(
    normalized.outcomeContractId,
    contract.id,
    "Normalization cleared a newly completed family.",
  );
  assertEqual(
    renderRoleplayAbilityDescriptor(normalized),
    regression.descriptor,
    "Normalization changed a newly completed descriptor.",
  );

  const legacyNormalized = normalizeRoleplayAbility(
    {
      name: "Legacy Complete Cell",
      description: "Legacy completion migration",
      intention: contract.intention,
      methodId: contract.methodId,
      scope: regression.scope,
      sceneImpact: regression.sceneImpact,
      diceCount: 3,
      successOutcome: regression.successOutcome,
      outcomeLane: expectedOutcomeLanes[contract.id],
    },
    400 + index,
  );
  assertEqual(
    legacyNormalized.outcomeContractId,
    contract.id,
    "Legacy normalization inferred the wrong contract family.",
  );

  for (const generatedField of [
    "successOutcome",
    "generatedDescriptor",
    "scopeTokens",
    "impactFragments",
    "resolvedCells",
    "privilegeCostKey",
    "coverageStatus",
  ]) {
    assert(
      !Object.hasOwn(normalized, generatedField),
      `${generatedField} must not be persisted for newly completed cells.`,
    );
  }
}

assertEqual(
  ROLEPLAY_OUTCOME_CONTRACTS.map((contract) => contract.id).join("|"),
  [
    "HIDE_FROM_IMMEDIATE_DANGER",
    "SECURE_IMMEDIATE_SAFETY",
    "DENY_IMMINENT_HOSTILE_ACT",
    "DRAW_HOSTILE_ATTENTION",
    "BREAK_SHARED_RESOLVE",
    "UNCOVER_CONCEALED_TRUTH",
    "REVEAL_EXPLOITABLE_WEAKNESS",
    "TRACE_QUARRY",
    "SECURE_WILLING_COOPERATION",
    "ESTABLISH_SHARED_RESOLVE",
    "SUSTAIN_PERSONAL_RESOLVE",
    "ESTABLISH_FALSE_BELIEF",
    "DIVERT_IMMEDIATE_ATTENTION",
  ].join("|"),
  "Outcome Contract family order mismatch.",
);

const personalResolveOutcomes = {
  MINOR:
    "you steady yourself around one small immediate personal course and sincerely pursue it through the current meaningful exchange despite ordinary fear, doubt, discomfort, or hesitation",
  STANDARD:
    "you commit yourself to one clear personal course for the rest of the current scene and sincerely pursue it despite meaningful fear, exhaustion, doubt, temptation, or pressure",
  MAJOR:
    "you hold to one difficult personal course for the rest of the current scene and sincerely pursue it despite serious fear, exhaustion, personal cost, temptation, or danger unless decisive circumstances or narrative resolution make that course no longer coherent",
  LEGENDARY:
    "you form one defining personal resolve, oath, or purpose whose consequences extend beyond the current scene and sincerely uphold it until it is fulfilled or narratively resolved",
} as const;
const personalResolveDescriptors = {
  MINOR:
    "Roll 3 dice. On success, you steady yourself around one small immediate personal course and sincerely pursue it through the current meaningful exchange despite ordinary fear, doubt, discomfort, or hesitation.",
  STANDARD:
    "Roll 3 dice. On success, you commit yourself to one clear personal course for the rest of the current scene and sincerely pursue it despite meaningful fear, exhaustion, doubt, temptation, or pressure.",
  MAJOR:
    "Roll 3 dice. On success, you hold to one difficult personal course for the rest of the current scene and sincerely pursue it despite serious fear, exhaustion, personal cost, temptation, or danger unless decisive circumstances or narrative resolution make that course no longer coherent.",
  LEGENDARY:
    "Roll 3 dice. On success, you form one defining personal resolve, oath, or purpose whose consequences extend beyond the current scene and sincerely uphold it until it is fulfilled or narratively resolved.",
} as const;

const personalResolveContract = getRoleplayOutcomeContract("SUSTAIN_PERSONAL_RESOLVE");
assert(personalResolveContract, "SUSTAIN_PERSONAL_RESOLVE should exist.");
assertEqual(
  personalResolveContract.name,
  "Sustain Personal Resolve",
  "Sustain Personal Resolve name mismatch.",
);
assertEqual(personalResolveContract.outcomeLane, "HELP", "Personal Resolve should be Help.");
assertEqual(
  personalResolveContract.intention,
  "PERSUASION",
  "Personal Resolve Intention mismatch.",
);
assertEqual(
  personalResolveContract.methodId,
  "STEEL_YOURSELF",
  "Personal Resolve Method mismatch.",
);
assertEqual(
  personalResolveContract.supportedScopes.join("|"),
  "SELF",
  "Personal Resolve must be Self only.",
);
assertEqual(
  personalResolveContract.privilegeCostKey,
  "SUSTAIN_PERSONAL_RESOLVE",
  "Personal Resolve family privilege key mismatch.",
);
assertEqual(
  getRoleplayOutcomeContractsForMethod("PERSUASION", "STEEL_YOURSELF")
    .map((contract) => contract.id)
    .join("|"),
  "SUSTAIN_PERSONAL_RESOLVE",
  "Steel Yourself should expose only Sustain Personal Resolve.",
);

const personalResolveCells = enumerateRoleplayResolvedContractCells(personalResolveContract);
assertEqual(personalResolveCells.length, 4, "Personal Resolve needs four completed cells.");
for (const sceneImpact of regressionImpacts) {
  const cell = personalResolveCells.find(
    (candidate) => candidate.sceneImpact === sceneImpact,
  );
  assert(cell, `Personal Resolve ${sceneImpact} cell missing.`);
  assertEqual(cell.scope, "SELF", `${sceneImpact} Personal Resolve Scope mismatch.`);
  assertEqual(
    cell.successOutcome,
    personalResolveOutcomes[sceneImpact],
    `${sceneImpact} Personal Resolve outcome mismatch.`,
  );
  assertEqual(
    cell.counterEligible,
    false,
    `${sceneImpact} Personal Resolve must be Counter-ineligible.`,
  );
}

let oneMoreStep = selectRoleplayAbilityOutcomeContract(
  {
    ...createDefaultRoleplayAbility(500),
    name: "One More Step",
    narrativeTheme:
      "You remember the people depending on you, accept the fear and exhaustion without denying them, and choose to take the next step toward the promise you made.",
    intention: "PERSUASION",
    methodId: "STEEL_YOURSELF",
    sceneImpact: "MAJOR",
    scope: "ONE_TARGET",
    diceCount: 3,
    counter: true,
  },
  "SUSTAIN_PERSONAL_RESOLVE",
);
assertEqual(
  oneMoreStep.outcomeContractId,
  "SUSTAIN_PERSONAL_RESOLVE",
  "Selecting Personal Resolve should retain the family.",
);
assertEqual(oneMoreStep.scope, "SELF", "Contract selection should fall back to Self.");
assertEqual(getRoleplayAbilityMethodName(oneMoreStep), "Steel Yourself", "Method name mismatch.");
assertEqual(
  getRoleplayAbilityContractName(oneMoreStep),
  "Sustain Personal Resolve",
  "Contract name mismatch.",
);
assertEqual(getRoleplayAbilityOutcomeLane(oneMoreStep), "HELP", "Personal Resolve lane mismatch.");
assertEqual(
  getRoleplayAbilitySuccessOutcome(oneMoreStep),
  personalResolveOutcomes.MAJOR,
  "One More Step outcome mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(oneMoreStep),
  personalResolveDescriptors.MAJOR,
  "One More Step descriptor mismatch.",
);
assertEqual(
  getRoleplayAbilityCounterEligibility(oneMoreStep),
  false,
  "Personal Resolve must not permit Counter.",
);
assertEqual(oneMoreStep.counter, false, "Personal Resolve should force Counter off.");

for (const sceneImpact of regressionImpacts) {
  oneMoreStep = selectRoleplayAbilitySceneImpact(oneMoreStep, sceneImpact);
  assertEqual(
    oneMoreStep.outcomeContractId,
    "SUSTAIN_PERSONAL_RESOLVE",
    `${sceneImpact} switching should retain Personal Resolve.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(oneMoreStep),
    personalResolveOutcomes[sceneImpact],
    `${sceneImpact} switched outcome mismatch.`,
  );
  const descriptor = renderRoleplayAbilityDescriptor(oneMoreStep);
  assertEqual(
    descriptor,
    personalResolveDescriptors[sceneImpact],
    `${sceneImpact} Personal Resolve descriptor mismatch.`,
  );
  assert(descriptor.startsWith("Roll 3 dice."), `${sceneImpact} Self descriptor prefix mismatch.`);
  assert(!descriptor.includes("Choose"), `${sceneImpact} Self descriptor must have no Choose clause.`);
  assertEqual(oneMoreStep.counter, false, `${sceneImpact} should force Counter off.`);
}

for (const requestedScope of [
  "ONE_TARGET",
  "SMALL_GROUP",
  "LARGE_GROUP",
  "FACTION_ARMY",
] as const) {
  const rawInvalid = reconcileRoleplayAbilityAuthoring({
    ...oneMoreStep,
    scope: requestedScope,
    counter: true,
  });
  assertEqual(
    rawInvalid.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    `${requestedScope} raw Personal Resolve authoring should clear the family.`,
  );
  assertEqual(rawInvalid.counter, false, `${requestedScope} invalidation should clear Counter.`);

  const selectedScope = selectRoleplayAbilityScope(oneMoreStep, requestedScope);
  assertEqual(
    selectedScope.outcomeContractId,
    "SUSTAIN_PERSONAL_RESOLVE",
    `${requestedScope} UI Scope selection should retain Personal Resolve.`,
  );
  assertEqual(
    selectedScope.scope,
    "SELF",
    `${requestedScope} UI Scope selection should fall back to Self.`,
  );
}

const fiveDicePersonalResolve = reconcileRoleplayAbilityAuthoring({
  ...oneMoreStep,
  diceCount: 5,
});
assertEqual(
  fiveDicePersonalResolve.outcomeContractId,
  "SUSTAIN_PERSONAL_RESOLVE",
  "Dice Count edit should retain Personal Resolve.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(fiveDicePersonalResolve),
  personalResolveDescriptors.LEGENDARY.replace("Roll 3 dice", "Roll 5 dice"),
  "Dice 3 to 5 should change only the roll count.",
);

for (const restrictionType of [
  "NONE",
  "TARGET_ELIGIBILITY",
  "CIRCUMSTANCE",
  "OATH_BEHAVIOUR",
  "SCENE_STATE",
  "RESOURCE_STATE",
] as const) {
  const edited = reconcileRoleplayAbilityAuthoring({
    ...oneMoreStep,
    name: "Still One More Step",
    narrativeTheme: "You deliberately reaffirm the one accepted personal course.",
    diceCount: 5,
    restrictionType,
    restrictionBand: restrictionType === "NONE" ? "NONE_COSMETIC" : "MODERATE",
    restrictionTag: restrictionType === "TARGET_ELIGIBILITY" ? "yourself" : "",
    restrictionText: restrictionType === "NONE" ? "" : "Only while the declared test applies.",
  });
  assertEqual(
    edited.outcomeContractId,
    "SUSTAIN_PERSONAL_RESOLVE",
    `${restrictionType} and non-authoring edits should retain Personal Resolve.`,
  );
}

const legacySteelYourself = normalizeRoleplayAbility(
  {
    name: "Legacy One More Step",
    description: "You invoke one promise and continue.",
    intention: "PERSUASION",
    specific: "STEEL_YOURSELF",
    sceneImpact: "MAJOR",
    scope: "SELF",
    diceCount: 3,
    successOutcome: personalResolveOutcomes.MAJOR,
  },
  501,
);
assertEqual(
  legacySteelYourself.methodId,
  "STEEL_YOURSELF",
  "Legacy STEEL_YOURSELF should migrate to the standard Method.",
);
assertEqual(
  legacySteelYourself.outcomeContractId,
  "SUSTAIN_PERSONAL_RESOLVE",
  "Matching legacy Personal Resolve outcome should migrate to its family.",
);

for (const [specific, readableName] of [
  ["INSPIRE", "Inspire"],
  ["MOTIVATE", "Motivate"],
] as const) {
  const ambiguousLegacy = normalizeRoleplayAbility(
    {
      intention: "PERSUASION",
      specific,
      description: `Legacy ${readableName} Theme`,
    },
    502,
  );
  assertEqual(
    ambiguousLegacy.methodId,
    ROLEPLAY_METHOD_CUSTOM_REVIEW,
    `${specific} must remain Custom Method review.`,
  );
  assertEqual(
    ambiguousLegacy.customMethodName,
    readableName,
    `${specific} readable Custom Method name mismatch.`,
  );
}

const customPersonalResolveText =
  "You ignore every Injury and mechanical restriction until the mission succeeds";
const customPersonalResolve = normalizeRoleplayAbility(
  {
    name: "Nothing Can Stop Me",
    narrativeTheme: "You demand an outcome beyond sincere personal resolve.",
    intention: "PERSUASION",
    methodId: "STEEL_YOURSELF",
    sceneImpact: "LEGENDARY",
    scope: "SELF",
    diceCount: 3,
    outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
    customOutcomeLane: "HELP",
    customOutcomeRequest: customPersonalResolveText,
  },
  503,
);
assertEqual(
  customPersonalResolve.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  "Explicit Steel Yourself Custom Outcome must remain Custom Review.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(customPersonalResolve),
  `Roll 3 dice. On success, ${customPersonalResolveText}.`,
  "Steel Yourself Custom Outcome descriptor regression.",
);

for (const runtimePersonalResolveField of [
  "declaredPersonalCourse",
  "personalCourse",
  "chosenCourse",
  "resolveCourse",
  "selfResolve",
  "personalResolve",
  "resolveText",
  "adversity",
  "motivatingMemory",
  "sustainingPurpose",
]) {
  assert(
    !Object.hasOwn(oneMoreStep, runtimePersonalResolveField) &&
      !Object.hasOwn(legacySteelYourself, runtimePersonalResolveField),
    `${runtimePersonalResolveField} must remain runtime-only state.`,
  );
}

const trackDefinition =
  "Locate or follow a missing, concealed, or moving subject by interpreting physical traces, disturbed environments, witness reports, behavioural patterns, magical signatures, spiritual impressions, or another coherent sign of passage.";
const trackApproaches = [
  "Follow footprints, tracks, blood, debris, scent, or other physical traces",
  "Read disturbed terrain, architecture, vegetation, dust, water, or weather",
  "Connect reliable sightings, testimony, reports, or known movements",
  "Infer direction and timing from wear, displacement, decay, or environmental change",
  "Recognise a recurring magical, spiritual, psychic, technological, or supernatural signature supported by the Narrative Theme",
  "Distinguish genuine signs from false trails or unrelated disturbance",
  "Predict a likely route from the quarry's established habits, needs, destination, or constraints",
  "Maintain pursuit as the trail moves through different environments",
] as const;
const trackMethod = getRoleplayMethodDefinition("TRACK");
assert(trackMethod, "TRACK should exist in the Method registry.");
assertEqual(trackMethod.name, "Track", "Track Method name mismatch.");
assertEqual(trackMethod.intention, "PERCEPTION", "Track owning Intention mismatch.");
assertEqual(trackMethod.definition, trackDefinition, "Track exact definition mismatch.");
assertEqual(
  trackMethod.legalApproaches.join("|"),
  trackApproaches.join("|"),
  "Track exact legal approaches mismatch.",
);
for (const exclusion of [
  "Does not reveal unrelated secrets merely because the quarry is being tracked.",
  "Does not identify an exploitable weakness; that uses Reveal Exploitable Weakness.",
  "Does not establish a concealed truth unrelated to the quarry's trail, passage, route, or location; that uses Uncover Concealed Truth.",
  "Does not grant omniscience or automatic knowledge of an exact current location.",
  "Does not guarantee reaching, catching, intercepting, confronting, or defeating the quarry.",
  "Does not grant an action, Response, measured movement, speed, travel time, or transportation.",
  "Does not bypass a mechanical effect that explicitly makes the quarry impossible to track.",
  "Does not affect or mechanically alter the quarry.",
  "Does not convert Small Group into Large Group, Faction / Army, or a diffuse population.",
  "Does not allow high Difficulty or Legendary Impact to legalise an impossible, incoherent, or inaccessible pursuit.",
]) {
  assert(trackMethod.exclusions.includes(exclusion), `Track exclusion missing: ${exclusion}`);
}
assertEqual(
  getRoleplayMethodsForIntention("PERCEPTION").map((method) => method.id).join(","),
  "DISCERN_TRUTH,TRACK",
  "Perception Method filtering should expose Discern Truth then Track.",
);

const traceQuarryOutcomes = {
  ONE_TARGET: {
    MINOR:
      "you identify one recent accessible sign of the selected target's passage and the immediate direction or next nearby trace it indicates for the current meaningful exchange",
    STANDARD:
      "you establish a reliable trail left by the selected target and can follow it through the current scene unless an identifiable change genuinely breaks or obscures that trail",
    MAJOR:
      "you establish and maintain a reliable trail to the selected target through the current scene despite serious concealment, false trails, difficult terrain, or deliberate evasion unless decisive circumstances make continued tracking impossible or incoherent",
    LEGENDARY:
      "you uncover a defining trail, route, or signature leading toward the selected target whose significance extends beyond the current scene and can continue following it until the quarry is reached or the pursuit is narratively resolved",
  },
  SMALL_GROUP: {
    MINOR:
      "you identify one recent accessible sign of the selected group's passage and the immediate direction or next nearby trace it indicates for the current meaningful exchange",
    STANDARD:
      "you establish a reliable trail left by the selected group and can follow it through the current scene unless an identifiable change genuinely breaks or obscures that trail",
    MAJOR:
      "you establish and maintain a reliable trail to the selected group through the current scene despite serious concealment, false trails, difficult terrain, or deliberate evasion unless decisive circumstances make continued tracking impossible or incoherent",
    LEGENDARY:
      "you uncover a defining trail, route, or signature leading toward the selected group whose significance extends beyond the current scene and can continue following it until the quarry is reached or the pursuit is narratively resolved",
  },
} as const;
const traceQuarryDescriptors = {
  ONE_TARGET: {
    MINOR: `Choose one target and roll 3 dice. On success, ${traceQuarryOutcomes.ONE_TARGET.MINOR}.`,
    STANDARD: `Choose one target and roll 3 dice. On success, ${traceQuarryOutcomes.ONE_TARGET.STANDARD}.`,
    MAJOR: `Choose one target and roll 3 dice. On success, ${traceQuarryOutcomes.ONE_TARGET.MAJOR}.`,
    LEGENDARY: `Choose one target and roll 3 dice. On success, ${traceQuarryOutcomes.ONE_TARGET.LEGENDARY}.`,
  },
  SMALL_GROUP: {
    MINOR: `Choose a small group of targets and roll 3 dice. On success, ${traceQuarryOutcomes.SMALL_GROUP.MINOR}.`,
    STANDARD: `Choose a small group of targets and roll 3 dice. On success, ${traceQuarryOutcomes.SMALL_GROUP.STANDARD}.`,
    MAJOR: `Choose a small group of targets and roll 3 dice. On success, ${traceQuarryOutcomes.SMALL_GROUP.MAJOR}.`,
    LEGENDARY: `Choose a small group of targets and roll 3 dice. On success, ${traceQuarryOutcomes.SMALL_GROUP.LEGENDARY}.`,
  },
} as const;

const traceQuarryContract = getRoleplayOutcomeContract("TRACE_QUARRY");
assert(traceQuarryContract, "TRACE_QUARRY should exist.");
assertEqual(traceQuarryContract.name, "Trace Quarry", "Trace Quarry name mismatch.");
assertEqual(traceQuarryContract.outcomeLane, "HELP", "Trace Quarry should be Help.");
assertEqual(traceQuarryContract.intention, "PERCEPTION", "Trace Quarry Intention mismatch.");
assertEqual(traceQuarryContract.methodId, "TRACK", "Trace Quarry Method mismatch.");
assertEqual(
  traceQuarryContract.supportedScopes.join("|"),
  "ONE_TARGET|SMALL_GROUP",
  "Trace Quarry supported Scope order mismatch.",
);
assertEqual(
  traceQuarryContract.privilegeCostKey,
  "TRACE_QUARRY",
  "Trace Quarry family privilege key mismatch.",
);
assertEqual(
  getRoleplayOutcomeContractsForMethod("PERCEPTION", "TRACK")
    .map((contract) => contract.id)
    .join("|"),
  "TRACE_QUARRY",
  "Track should expose only Trace Quarry.",
);
assertEqual(
  traceQuarryContract.scopeTokens.ONE_TARGET?.quarryReference,
  "the selected target",
  "One Target quarryReference mismatch.",
);
assertEqual(
  traceQuarryContract.scopeTokens.ONE_TARGET?.quarryPossessive,
  "the selected target's",
  "One Target quarryPossessive mismatch.",
);
assertEqual(
  traceQuarryContract.scopeTokens.SMALL_GROUP?.quarryReference,
  "the selected group",
  "Small Group quarryReference mismatch.",
);
assertEqual(
  traceQuarryContract.scopeTokens.SMALL_GROUP?.quarryPossessive,
  "the selected group's",
  "Small Group quarryPossessive mismatch.",
);

const traceQuarryCells = enumerateRoleplayResolvedContractCells(traceQuarryContract);
assertEqual(traceQuarryCells.length, 8, "Trace Quarry needs eight completed cells.");
for (const scope of ["ONE_TARGET", "SMALL_GROUP"] as const) {
  for (const sceneImpact of regressionImpacts) {
    const expectedFragment = {
      MINOR:
        "you identify one recent accessible sign of {{quarryPossessive}} passage and the immediate direction or next nearby trace it indicates for the current meaningful exchange",
      STANDARD:
        "you establish a reliable trail left by {{quarryReference}} and can follow it through the current scene unless an identifiable change genuinely breaks or obscures that trail",
      MAJOR:
        "you establish and maintain a reliable trail to {{quarryReference}} through the current scene despite serious concealment, false trails, difficult terrain, or deliberate evasion unless decisive circumstances make continued tracking impossible or incoherent",
      LEGENDARY:
        "you uncover a defining trail, route, or signature leading toward {{quarryReference}} whose significance extends beyond the current scene and can continue following it until the quarry is reached or the pursuit is narratively resolved",
    }[sceneImpact];
    assertEqual(
      traceQuarryContract.impactFragments[sceneImpact],
      expectedFragment,
      `${sceneImpact} exact Trace Quarry fragment mismatch.`,
    );
    const cell = traceQuarryCells.find(
      (candidate) => candidate.scope === scope && candidate.sceneImpact === sceneImpact,
    );
    assert(cell, `${scope}/${sceneImpact} Trace Quarry cell missing.`);
    assertEqual(
      cell.successOutcome,
      traceQuarryOutcomes[scope][sceneImpact],
      `${scope}/${sceneImpact} Trace Quarry outcome mismatch.`,
    );
    assertEqual(cell.counterEligible, false, `${scope}/${sceneImpact} must reject Counter.`);
    const ability = reconcileRoleplayAbilityAuthoring({
      ...createDefaultRoleplayAbility(600),
      intention: "PERCEPTION",
      methodId: "TRACK",
      scope,
      sceneImpact,
      diceCount: 3,
      outcomeContractId: "TRACE_QUARRY",
      counter: true,
    });
    assertEqual(ability.outcomeContractId, "TRACE_QUARRY", "Trace Quarry cell was cleared.");
    assertEqual(ability.counter, false, "Trace Quarry should force stored Counter off.");
    assertEqual(getRoleplayAbilityOutcomeLane(ability), "HELP", "Trace Quarry lane drifted.");
    assertEqual(
      getRoleplayAbilitySuccessOutcome(ability),
      traceQuarryOutcomes[scope][sceneImpact],
      `${scope}/${sceneImpact} generated outcome mismatch.`,
    );
    assertEqual(
      renderRoleplayAbilityDescriptor(ability),
      traceQuarryDescriptors[scope][sceneImpact],
      `${scope}/${sceneImpact} 3-dice descriptor mismatch.`,
    );
  }
}

let trailIsStillWarm = selectRoleplayAbilityOutcomeContract(
  {
    ...createDefaultRoleplayAbility(601),
    name: "The Trail Is Still Warm",
    narrativeTheme:
      "You read the broken stems, disturbed soil, fading scent, and hurried choices left behind, separating the quarry's true passage from the noise around it.",
    intention: "PERCEPTION",
    methodId: "TRACK",
    sceneImpact: "MAJOR",
    scope: "SELF",
    diceCount: 3,
    counter: true,
  },
  "TRACE_QUARRY",
);
assertEqual(trailIsStillWarm.scope, "ONE_TARGET", "Trace Quarry should fall back from Self to One Target.");
assertEqual(trailIsStillWarm.outcomeContractId, "TRACE_QUARRY", "Trace Quarry selection failed.");
assertEqual(getRoleplayAbilityMethodName(trailIsStillWarm), "Track", "Track display name mismatch.");
assertEqual(
  getRoleplayAbilityContractName(trailIsStillWarm),
  "Trace Quarry",
  "Trace Quarry display name mismatch.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(trailIsStillWarm),
  traceQuarryDescriptors.ONE_TARGET.MAJOR,
  "The Trail Is Still Warm descriptor mismatch.",
);
assertEqual(trailIsStillWarm.counter, false, "Prototype Counter request must be forced false.");

trailIsStillWarm = selectRoleplayAbilityScope(trailIsStillWarm, "SMALL_GROUP");
assertEqual(trailIsStillWarm.scope, "SMALL_GROUP", "Trace Quarry should switch to Small Group.");
assertEqual(trailIsStillWarm.outcomeContractId, "TRACE_QUARRY", "Small Group switch cleared family.");
trailIsStillWarm = selectRoleplayAbilityScope(trailIsStillWarm, "ONE_TARGET");
assertEqual(trailIsStillWarm.scope, "ONE_TARGET", "Trace Quarry should switch back to One Target.");
assertEqual(trailIsStillWarm.outcomeContractId, "TRACE_QUARRY", "One Target switch cleared family.");
for (const sceneImpact of regressionImpacts) {
  trailIsStillWarm = selectRoleplayAbilitySceneImpact(trailIsStillWarm, sceneImpact);
  assertEqual(
    trailIsStillWarm.outcomeContractId,
    "TRACE_QUARRY",
    `${sceneImpact} switch cleared Trace Quarry.`,
  );
  assertEqual(
    getRoleplayAbilitySuccessOutcome(trailIsStillWarm),
    traceQuarryOutcomes.ONE_TARGET[sceneImpact],
    `${sceneImpact} switched Trace Quarry outcome mismatch.`,
  );
}

for (const requestedScope of ["SELF", "LARGE_GROUP", "FACTION_ARMY"] as const) {
  const invalidated = reconcileRoleplayAbilityAuthoring({
    ...trailIsStillWarm,
    scope: requestedScope,
    counter: true,
  });
  assertEqual(
    invalidated.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    `${requestedScope} raw Trace Quarry authoring should clear the family.`,
  );
  assertEqual(invalidated.counter, false, `${requestedScope} invalidation should clear Counter.`);
}
for (const incompatible of [
  { intention: "PERCEPTION" as const, methodId: "DISCERN_TRUTH" as const },
  { intention: "PERSUASION" as const, methodId: "APPEAL" as const },
]) {
  const invalidated = reconcileRoleplayAbilityAuthoring({
    ...trailIsStillWarm,
    ...incompatible,
    counter: true,
  });
  assertEqual(
    invalidated.outcomeContractId,
    ROLEPLAY_OUTCOME_CONTRACT_UNSELECTED,
    "Incompatible Method or Intention should clear Trace Quarry.",
  );
  assertEqual(invalidated.counter, false, "Incompatible authoring should clear Counter.");
}

for (const restrictionType of [
  "NONE",
  "TARGET_ELIGIBILITY",
  "CIRCUMSTANCE",
  "OATH_BEHAVIOUR",
  "SCENE_STATE",
  "RESOURCE_STATE",
] as const) {
  const edited = reconcileRoleplayAbilityAuthoring({
    ...trailIsStillWarm,
    name: "The Trail Remains Warm",
    narrativeTheme: "You interpret one accessible coherent sign of passage.",
    diceCount: 5,
    restrictionType,
    restrictionBand: restrictionType === "NONE" ? "NONE_COSMETIC" : "MODERATE",
    restrictionTag: restrictionType === "TARGET_ELIGIBILITY" ? "one marked quarry" : "",
    restrictionText: restrictionType === "NONE" ? "" : "Only while the declared limit applies.",
  });
  assertEqual(
    edited.outcomeContractId,
    "TRACE_QUARRY",
    `${restrictionType} and non-authoring edits should retain Trace Quarry.`,
  );
}
const fiveDiceTrace = reconcileRoleplayAbilityAuthoring({
  ...trailIsStillWarm,
  sceneImpact: "MAJOR",
  diceCount: 5,
});
assertEqual(
  renderRoleplayAbilityDescriptor(fiveDiceTrace),
  traceQuarryDescriptors.ONE_TARGET.MAJOR.replace("roll 3 dice", "roll 5 dice"),
  "Trace Quarry Dice 3 to 5 should change only the roll count.",
);

const legacyTrack = normalizeRoleplayAbility(
  {
    name: "Legacy Trail",
    description: "You read the quarry's passage.",
    intention: "PERCEPTION",
    specific: "TRACK",
    sceneImpact: "MAJOR",
    scope: "ONE_TARGET",
    diceCount: 3,
    successOutcome: traceQuarryOutcomes.ONE_TARGET.MAJOR,
    counter: true,
  },
  602,
);
assertEqual(legacyTrack.methodId, "TRACK", "Legacy Perception TRACK should migrate to Track.");
assertEqual(
  legacyTrack.outcomeContractId,
  "TRACE_QUARRY",
  "Matching legacy quarry outcome should migrate to Trace Quarry.",
);
assertEqual(legacyTrack.counter, false, "Legacy Trace Quarry must force Counter off.");

const explicitCustomTrack = normalizeRoleplayAbility(
  {
    intention: "PERCEPTION",
    methodId: ROLEPLAY_METHOD_CUSTOM_REVIEW,
    customMethodName: "Track",
    customMethodRequest: "A deliberately explicit Custom Track Method.",
  },
  603,
);
assertEqual(
  explicitCustomTrack.methodId,
  ROLEPLAY_METHOD_CUSTOM_REVIEW,
  "Explicit stored Custom Track must remain Custom.",
);
for (const specific of [
  "SEARCH",
  "INVESTIGATE",
  "SENSE_DANGER",
  "READ_INTENT",
  "HUNT",
  "LOCATE",
] as const) {
  const ambiguousTrack = normalizeRoleplayAbility(
    { intention: "PERCEPTION", specific, description: `Legacy ${specific} theme.` },
    604,
  );
  assertEqual(
    ambiguousTrack.methodId,
    ROLEPLAY_METHOD_CUSTOM_REVIEW,
    `${specific} must remain Custom instead of migrating to Track.`,
  );
}
const customTraceOutcomeText = "You instantly arrive beside and capture the quarry";
const explicitCustomTrace = normalizeRoleplayAbility(
  {
    intention: "PERCEPTION",
    methodId: "TRACK",
    sceneImpact: "LEGENDARY",
    scope: "ONE_TARGET",
    diceCount: 3,
    outcomeContractId: ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
    customOutcomeLane: "HELP",
    customOutcomeRequest: customTraceOutcomeText,
  },
  605,
);
assertEqual(
  explicitCustomTrace.outcomeContractId,
  ROLEPLAY_OUTCOME_CONTRACT_CUSTOM_REVIEW,
  "Explicit Track Custom Outcome must remain Custom.",
);
assertEqual(
  renderRoleplayAbilityDescriptor(explicitCustomTrace),
  `Choose one target and roll 3 dice. On success, ${customTraceOutcomeText}.`,
  "Explicit Track Custom Outcome descriptor regression.",
);

for (const runtimeTrackingField of [
  "declaredQuarry",
  "quarry",
  "quarryId",
  "quarryMembers",
  "trackingTarget",
  "trackingTargetIds",
  "startingConnection",
  "trail",
  "trailText",
  "trace",
  "traceText",
  "lastKnownLocation",
  "trackingObjective",
  "trackingRoute",
  "currentDirection",
  "quarrySignature",
  "pursuitState",
]) {
  assert(
    !Object.hasOwn(trailIsStillWarm, runtimeTrackingField) &&
      !Object.hasOwn(legacyTrack, runtimeTrackingField),
    `${runtimeTrackingField} must remain runtime-only state.`,
  );
}
assertEqual(
  legacyDescriptorRegressions.length +
    completionDescriptorRegressions.length +
    personalResolveCells.length,
  72,
  "All seventy-two pre-Track outcomes and descriptors must remain under exact regression coverage.",
);
assertEqual(libraryAudit.plannedCellCount, 80, "Track audit planned total mismatch.");
assertEqual(libraryAudit.completedCellCount, 80, "Track audit completed total mismatch.");
assertEqual(libraryAudit.missingCellCount, 0, "Track audit missing total mismatch.");

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
console.log("PASS roleplay compositional standard library smoke");
console.log("PASS roleplay complete standard library smoke");
console.log("PASS roleplay personal resolve self standard library smoke");
console.log("PASS roleplay quarry tracking standard library smoke");
