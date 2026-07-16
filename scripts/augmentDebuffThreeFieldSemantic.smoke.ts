import assert from "node:assert/strict";

import {
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  normalizeCharacterPower,
  prepareCharacterPowerIdsForPersistence,
} from "../lib/characterBuilder/powers";
import { resolveCombatAction } from "../lib/combat-lab/actionResolver";
import {
  establishSemanticPassivesAtCombatStart,
  runCombatScenario,
} from "../lib/combat-lab/autoSimulator";
import {
  cancelSemanticPassive,
  createCombatState,
  getAttributeModifier,
  getAttributeModifierLaneBreakdown,
  isActionOnCooldown,
  getSemanticPassiveState,
  markDefeatedActors,
  removeStatusEffectById,
  tickActorCooldowns,
  tickTargetTurnEffects,
} from "../lib/combat-lab/combatState";
import type { Rng } from "../lib/combat-lab/dice";
import { adaptPowerToCombatActions, createFixtureActor } from "../lib/combat-lab/powerAdapter";
import type { CombatAction, CombatActor, CombatStatusEffect } from "../lib/combat-lab/types";
import { chooseTurnAction } from "../lib/combat-lab/targetingPolicies";
import {
  getCharacterBuilderThreeFieldAugmentDebuffPublicWriteError,
  getThreeFieldAugmentDebuffPublicWriteError,
  getThreeFieldAugmentDebuffReadDiagnostics,
  THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR,
  THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_ENABLED,
  validateThreeFieldAugmentDebuffPacket,
} from "../lib/powers/authoringRules";
import type { EffectPacket, Power, PowerIntention } from "../lib/summoning/types";

let assertionCount = 0;
function check(label: string, condition: unknown) {
  assert.ok(condition, label);
  assertionCount += 1;
  console.log(`PASS ${assertionCount.toString().padStart(2, "0")}: ${label}`);
}

function rngFrom(values: number[]): Rng {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}

function actor(id: string, side: "players" | "monsters"): CombatActor {
  return createFixtureActor({
    id,
    side,
    name: id,
    role: "Semantic fixture",
    physicalHp: 100,
    mentalHp: 100,
    physicalProtection: 0,
    mentalProtection: 0,
    dodgeValue: 0,
    dodgeDice: 1,
    physicalDefenceDice: 1,
    physicalDefenceBlock: 0,
    mentalDefenceDice: 1,
    mentalDefenceBlock: 0,
    attack: 0,
    guard: 0,
    fortitude: 0,
    intellect: 0,
    synergy: 0,
    bravery: 0,
    powers: [],
  });
}

function action(overrides: Partial<CombatAction>): CombatAction {
  return {
    id: "semantic-action",
    sourcePowerId: "power-a",
    sourcePacketId: "packet-a",
    sourceType: "power",
    name: "Semantic Action",
    kind: "buff",
    targetPolicy: "self",
    supported: true,
    unsupportedReasons: [],
    accuracyAttribute: "Attack",
    diceCount: 1,
    potency: 1,
    durationRounds: 4,
    durationKind: "turns",
    durationSource: "authored",
    modifier: {
      attribute: "Guard",
      amount: 3,
      modifierMagnitude: 3,
      semanticFormat: "augmentDebuffThreeFieldV1",
      durationRounds: 4,
    },
    cooldownRounds: 0,
    ...overrides,
  };
}

function status(overrides: Partial<CombatStatusEffect>): CombatStatusEffect {
  return {
    id: "status-a",
    semanticFormat: "augmentDebuffThreeFieldV1",
    effectFamily: "augment",
    sourceActorId: "source-a",
    sourcePowerId: "power-a",
    sourcePacketId: "packet-a",
    targetActorId: "target",
    kind: "buff",
    attribute: "Guard",
    amount: 0,
    stackCount: 4,
    modifierMagnitude: 3,
    remainingRounds: 4,
    ...overrides,
  };
}

function packet(intention: PowerIntention, modifier: number | null, targetedAttribute: unknown = "GUARD") {
  return {
    id: "packet-validation",
    intention,
    type: intention,
    modifier,
    potency: 1,
    effectDurationType: "UNTIL_TARGET_NEXT_TURN",
    effectDurationTurns: null,
    targetedAttribute,
    detailsJson: {},
  };
}

function adaptedPower(params: {
  id?: string;
  packetId?: string;
  name?: string;
  intention?: "AUGMENT" | "DEBUFF";
  modifier?: number | null;
  passive?: boolean;
} = {}) {
  const intention = params.intention ?? "AUGMENT";
  const effectPacket: EffectPacket = {
    ...createDefaultCharacterPowerPacket(intention, 0),
    id: params.packetId === undefined ? "packet-adapted" : params.packetId,
    intention,
    type: intention,
    targetedAttribute: "GUARD",
    modifier: params.modifier === undefined ? 3 : params.modifier,
    effectDurationType: params.passive ? "PASSIVE" : "UNTIL_TARGET_NEXT_TURN",
    effectDurationTurns: null,
    detailsJson: { statTarget: "GUARD" },
  };
  const power: Power = {
    ...createDefaultCharacterPower(0),
    id: params.id === undefined ? "power-adapted" : params.id,
    name: params.name ?? "Adapted semantic power",
    cooldownTurns: 1,
    cooldownReduction: 0,
    cooldownAuthority: {
      effectiveCooldownTurns: 1,
      source: "BUILTIN_DEFAULTS",
      tuningSetId: null,
      tuningUpdatedAt: null,
      storedCooldownTurns: 1,
      mismatch: false,
      warnings: [],
      basePowerValue: 0,
      cooldownLoad: 0,
    },
    effectPackets: [effectPacket],
    intentions: [effectPacket],
  };
  return adaptPowerToCombatActions(power, { cooldownAuthorityMode: "EXPLICIT_BUILTIN_PREVIEW" });
}

// Storage and normalization (1-7)
const legacyAdaptation = adaptedPower({ modifier: null });
check("Modifier null remains legacy", legacyAdaptation.actions[0]?.modifier?.semanticFormat === undefined);
check(
  "Modifier 1-5 normalizes for Augment and Debuff",
  ["AUGMENT", "DEBUFF"].every((intention) =>
    [1, 2, 3, 4, 5].every((modifier) =>
      validateThreeFieldAugmentDebuffPacket(packet(intention as PowerIntention, modifier)) === null,
    ),
  ),
);
check("Modifier 0 and 6 are rejected", [0, 6].every((value) => validateThreeFieldAugmentDebuffPacket(packet("AUGMENT", value)) !== null));
check("Non-integer Modifier is rejected", validateThreeFieldAugmentDebuffPacket(packet("DEBUFF", 2.5)) !== null);
check("Modifier on another intention is rejected", validateThreeFieldAugmentDebuffPacket(packet("ATTACK", 2)) !== null);
check(
  "detailsJson.modifier is rejected as a competing authority",
  validateThreeFieldAugmentDebuffPacket({ ...packet("AUGMENT", null), detailsJson: { modifier: 2 } }) !== null,
);
check("Unsupported target attributes are rejected", validateThreeFieldAugmentDebuffPacket(packet("DEBUFF", 2, "MOVEMENT")) !== null);

// Application (8-13)
{
  const source = actor("source", "players");
  const target = actor("target", "monsters");
  const zeroState = createCombatState([source], [target], { captureTranscript: true });
  const zeroAction = action({ id: "augment-zero", cooldownRounds: 2, targetPolicy: "self" });
  resolveCombatAction({ state: zeroState, actor: source, action: zeroAction, target: source, rng: rngFrom([0]) });
  check("Augment zero successes creates no status", zeroState.statusEffects.length === 0 && isActionOnCooldown(zeroState, source.id, zeroAction.id));

  const augmentState = createCombatState([source], [target]);
  const augmentAction = action({ id: "augment-success", diceCount: 2, potency: 3, targetPolicy: "self" });
  const augmentMetrics = resolveCombatAction({ state: augmentState, actor: source, action: augmentAction, target: source, rng: rngFrom([0.99, 0.99]) });
  check("Augment stacks equal successes x Potency", augmentState.statusEffects[0]?.stackCount === augmentMetrics.rawSuccesses * 3 && augmentMetrics.rawSuccesses > 0);

  const debuffState = createCombatState([source], [target]);
  const debuffAction = action({ id: "debuff-net", kind: "debuff", targetPolicy: "enemy", resistAttribute: "FORTITUDE", diceCount: 6, potency: 2 });
  const debuffMetrics = resolveCombatAction({ state: debuffState, actor: source, action: debuffAction, target, rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0, 0, 0]) });
  check("Debuff stacks use target-local net successes", debuffState.statusEffects[0]?.stackCount === debuffMetrics.hostileSuccessesAfterResist * 2 && debuffMetrics.hostileSuccessesAfterResist > 0);

  const resistedState = createCombatState([source], [target]);
  const resistedAction = action({ id: "debuff-resisted", kind: "debuff", targetPolicy: "enemy", resistAttribute: "FORTITUDE", diceCount: 1 });
  resolveCombatAction({ state: resistedState, actor: source, action: resistedAction, target, rng: rngFrom([0.99, 0.99, 0.99, 0.99]) });
  check("Fully resisted Debuff creates no status", resistedState.statusEffects.length === 0);

  const linkedState = createCombatState([source], [target]);
  const linkedAction = action({
    id: "primary-linked",
    sourcePacketId: "packet-primary",
    targetPolicy: "self",
    diceCount: 2,
    potency: 1,
    secondaryActions: [action({
      id: "secondary-linked",
      sourcePacketId: "packet-linked",
      potency: 4,
      modifier: { attribute: "Attack", amount: 5, modifierMagnitude: 5, semanticFormat: "augmentDebuffThreeFieldV1", durationRounds: 4 },
      linkedToPrimary: true,
      usesPrimaryAppliedSuccesses: true,
      skipOwnRoll: true,
      skipOwnDefenceGate: true,
      cooldownRounds: 0,
    })],
  });
  const linkedMetrics = resolveCombatAction({ state: linkedState, actor: source, action: linkedAction, target: source, rng: rngFrom([0.99, 0.99]) });
  assert.ok(linkedMetrics.rawSuccesses > 0);
  const primaryStatus = linkedState.statusEffects.find((effect) => effect.sourcePacketId === "packet-primary");
  const linkedStatus = linkedState.statusEffects.find((effect) => effect.sourcePacketId === "packet-linked");
  check("Linked packet inherits applied successes", linkedStatus?.stackCount === (primaryStatus?.stackCount ?? 0) * 4);
  check("Linked Modifier is not multiplied", linkedStatus?.modifierMagnitude === 5 && getAttributeModifier(linkedState, source.id, "Attack") === 5);
}

// Semantic Passive activation lifecycle
{
  const semanticAdaptation = adaptedPower({ passive: true });
  const semanticPassive = semanticAdaptation.actions[0];
  check(
    "Semantic Passive hydration preserves economic cooldown and marks lifecycle behavior",
    semanticPassive?.passive === true &&
      semanticPassive.passiveDuration === true &&
      semanticPassive.durationKind === "passive" &&
      semanticPassive.cooldownRounds === 1,
  );
  const legacyPassive = adaptedPower({ modifier: null, passive: true }).actions[0];
  check(
    "Legacy Modifier-null Passive hydration remains an ordinary usable passive-duration action",
    legacyPassive?.passive !== true && legacyPassive?.passiveDuration === true && legacyPassive?.cooldownRounds === 1,
  );

  const passiveAction = action({
    id: "automatic-passive-augment",
    name: "Automatic Passive Augment",
    sourcePowerId: "automatic-passive-power",
    sourcePacketId: "automatic-passive-packet",
    targetPolicy: "self",
    accuracyAttribute: "Guard",
    diceCount: 1,
    potency: 10,
    durationRounds: 4,
    durationKind: "passive",
    passiveDuration: true,
    passive: true,
    cooldownRounds: 4,
  });
  const activePower = action({
    id: "retained-active-semantic-power",
    name: "Retained Active Semantic Power",
    kind: "debuff",
    targetPolicy: "enemy",
    accuracyAttribute: "Attack",
    passive: undefined,
    passiveDuration: false,
    durationKind: "turns",
    cooldownRounds: 0,
  });
  const mainAttack = action({
    id: "retained-main-attack",
    name: "Retained Main Attack",
    sourceType: "naturalAttack",
    kind: "attack",
    targetPolicy: "enemy",
    modifier: undefined,
    diceCount: 0,
    cooldownRounds: 0,
  });
  const source = actor("automatic-passive-source", "players");
  source.attributeDice.Guard = "D12";
  source.actions = [passiveAction, activePower, mainAttack];
  const target = actor("automatic-passive-target", "monsters");
  target.actions = [mainAttack];
  const state = createCombatState([source], [target], { captureTranscript: true });
  check(
    "Missing semantic Passive runtime state defaults to INACTIVE",
    getSemanticPassiveState(state, source.id, "automatic-passive-power")?.status === "INACTIVE",
  );
  let defaultStartRngCalls = 0;
  const defaultEstablishments = establishSemanticPassivesAtCombatStart(state, () => {
    defaultStartRngCalls += 1;
    return 0.99;
  });
  check(
    "INACTIVE semantic Passive does not establish or roll at combat start",
    defaultEstablishments.length === 0 && defaultStartRngCalls === 0 && state.statusEffects.length === 0,
  );
  state.actors[0].actions = [passiveAction, mainAttack];
  check(
    "INACTIVE ready semantic Passive is selectable only through Power Action",
    chooseTurnAction(state.actors[0], state, "main")?.id === mainAttack.id &&
      chooseTurnAction(state.actors[0], state, "power")?.id === passiveAction.id,
  );
  state.actors[0].actions = [passiveAction, activePower, mainAttack];

  const activation = resolveCombatAction({
    state,
    actor: state.actors[0],
    action: passiveAction,
    target: state.actors[0],
    rng: rngFrom([0.99]),
    lane: "power",
  });
  const activatedRuntime = getSemanticPassiveState(state, source.id, "automatic-passive-power");
  const established = state.statusEffects[0];
  check(
    "Successful Power Action activation stores original source successes and creates stacks",
    activation.rawSuccesses > 0 &&
      activatedRuntime?.status === "ACTIVE" &&
      activatedRuntime.activationSourceSuccesses === 2 &&
      established?.stackCount === 20,
  );
  check(
    "Successful Passive activation starts no cooldown and preserves responses",
    activatedRuntime?.cooldownRemaining === 0 &&
      !isActionOnCooldown(state, state.actors[0].id, passiveAction.id) &&
      state.responsesRemaining[state.actors[0].id] === 2,
  );
  check(
    "ACTIVE Passive is excluded while active non-Passive powers remain selectable",
    chooseTurnAction(state.actors[0], state, "power")?.id === activePower.id,
  );
  const stacksBeforeTick = established?.stackCount ?? 0;
  tickTargetTurnEffects(state, state.actors[0].id);
  check(
    "Passive stacks degrade locally without deactivating the source Power",
    state.statusEffects[0]?.stackCount === stacksBeforeTick - 1,
  );
  check(
    "Natural degradation leaves the source Passive ACTIVE",
    getSemanticPassiveState(state, source.id, "automatic-passive-power")?.status === "ACTIVE",
  );
  for (let turn = 0; turn < 4; turn += 1) tickTargetTurnEffects(state, state.actors[0].id);
  check(
    "Automatic Passive has no four-turn runtime expiry",
    state.statusEffects[0]?.remainingRounds === 4 && (state.statusEffects[0]?.stackCount ?? 0) > 0,
  );
  check(
    "Target-local cleanup removes only the status without deactivating or cooling the source Passive",
    Boolean(established) &&
      removeStatusEffectById(state, established.id) &&
      state.statusEffects.length === 0 &&
      getSemanticPassiveState(state, source.id, "automatic-passive-power")?.status === "ACTIVE" &&
      getSemanticPassiveState(state, source.id, "automatic-passive-power")?.cooldownRemaining === 0,
  );

  const failedSource = actor("failed-passive-source", "players");
  failedSource.actions = [{ ...passiveAction, id: "failed-passive", sourcePacketId: "failed-passive-packet", diceCount: 1 }];
  const failedTarget = actor("failed-passive-target", "monsters");
  const failedState = createCombatState([failedSource], [failedTarget]);
  const failedResolution = resolveCombatAction({
    state: failedState,
    actor: failedState.actors[0],
    action: failedState.actors[0].actions[0],
    target: failedState.actors[0],
    rng: rngFrom([0]),
    lane: "power",
  });
  check(
    "Failed activation remains INACTIVE, starts no cooldown, and creates no status",
    failedResolution.rawSuccesses === 0 &&
      getSemanticPassiveState(failedState, failedSource.id, "automatic-passive-power")?.status === "INACTIVE" &&
      getSemanticPassiveState(failedState, failedSource.id, "automatic-passive-power")?.cooldownRemaining === 0 &&
      failedState.statusEffects.length === 0,
  );
  let failedRetryRolls = 0;
  establishSemanticPassivesAtCombatStart(failedState, () => {
    failedRetryRolls += 1;
    return 0.99;
  });
  check(
    "Failed activation receives no free automatic retry but remains ready for a later Power Action",
    failedRetryRolls === 0 && chooseTurnAction(failedState.actors[0], failedState, "power")?.id === "failed-passive",
  );

  const multiPacketSource = actor("multi-packet-passive-source", "players");
  multiPacketSource.attributeDice.Guard = "D12";
  const siblingPassiveAction = {
    ...passiveAction,
    id: "automatic-passive-sibling",
    sourcePacketId: "automatic-passive-sibling-packet",
    modifier: { ...passiveAction.modifier!, attribute: "Bravery" as const },
  };
  multiPacketSource.actions = [passiveAction, siblingPassiveAction];
  const multiPacketState = createCombatState(
    [multiPacketSource],
    [actor("multi-packet-passive-target", "monsters")],
  );
  resolveCombatAction({
    state: multiPacketState,
    actor: multiPacketState.actors[0],
    action: multiPacketState.actors[0].actions[0],
    target: multiPacketState.actors[0],
    rng: rngFrom([0.99]),
    lane: "power",
  });
  check(
    "One Passive Power activation applies every root packet from the stored source result",
    multiPacketState.statusEffects.map((effect) => effect.sourcePacketId).sort().join(",") ===
      "automatic-passive-packet,automatic-passive-sibling-packet" &&
      multiPacketState.semanticPassiveTransitions.filter((transition) =>
        transition.type === "activationSucceeded").length === 1,
  );

  const defeatSource = actor("passive-defeat-source", "players");
  defeatSource.defeatModel = "NORMAL_MONSTER";
  defeatSource.attributeDice.Guard = "D12";
  defeatSource.actions = [passiveAction];
  const defeatTarget = actor("passive-defeat-target", "monsters");
  const defeatState = createCombatState([defeatSource], [defeatTarget], {
    semanticPassiveStates: [{
      actorId: defeatSource.id,
      powerId: "automatic-passive-power",
      status: "ACTIVE",
      activationSourceSuccesses: 2,
      cooldownRemaining: 0,
    }],
  });
  establishSemanticPassivesAtCombatStart(defeatState, rngFrom([0.99]));
  defeatState.actors[0].physicalHpCurrent = 0;
  markDefeatedActors(defeatState);
  check(
    "Source defeat removes automatically established semantic Passive status",
    defeatState.actors[0].defeated && defeatState.statusEffects.length === 0,
  );

  const legacySource = actor("legacy-removal-source", "players");
  const legacyRemovalAction = action({
    id: "legacy-removal-passive",
    modifier: { attribute: "Guard", amount: 2, durationRounds: 4 },
    durationKind: "passive",
    passiveDuration: true,
    passive: undefined,
    cooldownRounds: 3,
  });
  legacySource.actions = [legacyRemovalAction];
  const legacyRemovalState = createCombatState([legacySource], [actor("legacy-removal-target", "monsters")]);
  legacyRemovalState.statusEffects = [{
    id: "legacy-removal-status",
    sourceActorId: legacyRemovalState.actors[0].id,
    targetActorId: legacyRemovalState.actors[0].id,
    kind: "buff",
    attribute: "Guard",
    amount: 2,
    sourceActionId: legacyRemovalAction.id,
    sourceCooldownActionId: legacyRemovalAction.id,
    passiveDuration: true,
    remainingRounds: 4,
  }];
  removeStatusEffectById(legacyRemovalState, "legacy-removal-status");
  check(
    "Legacy Modifier-null Passive removal cooldown remains unchanged",
    isActionOnCooldown(legacyRemovalState, legacyRemovalState.actors[0].id, legacyRemovalAction.id),
  );
}

// Source-Power Cleanse, cancellation, and cooldown lifecycle
{
  const passive = action({
    id: "source-scope-passive",
    name: "Source Scope Passive",
    sourcePowerId: "source-scope-passive-power",
    sourcePacketId: "source-scope-passive-primary",
    targetPolicy: "self",
    accuracyAttribute: "Guard",
    diceCount: 1,
    potency: 2,
    durationKind: "passive",
    passiveDuration: true,
    passive: true,
    cooldownRounds: 4,
  });
  const owner = actor("source-scope-owner", "players");
  owner.attributeDice.Guard = "D12";
  owner.actions = [passive];
  const ally = actor("source-scope-ally", "players");
  const cleanser = actor("source-scope-cleanser", "monsters");
  cleanser.attributeDice.Intellect = "D12";
  const cleanse = action({
    id: "complete-source-cleanse",
    name: "Complete Source Cleanse",
    sourcePowerId: "cleanser-power",
    sourcePacketId: "cleanser-packet",
    kind: "cleanse",
    targetPolicy: "enemy",
    accuracyAttribute: "Intellect",
    modifier: undefined,
    diceCount: 1,
    targetSourcePowerId: passive.sourcePowerId,
    cooldownRounds: 0,
  });
  cleanser.actions = [cleanse];
  const state = createCombatState([owner, ally], [cleanser], {
    captureTranscript: true,
    semanticPassiveStates: [{
      actorId: owner.id,
      powerId: passive.sourcePowerId!,
      status: "ACTIVE",
      activationSourceSuccesses: 2,
      cooldownRemaining: 0,
    }],
  });
  state.statusEffects = [
    status({
      id: "source-scope-primary-status",
      sourceActorId: owner.id,
      sourcePowerId: passive.sourcePowerId!,
      sourcePacketId: passive.sourcePacketId!,
      targetActorId: owner.id,
    }),
    status({
      id: "source-scope-linked-status",
      sourceActorId: owner.id,
      sourcePowerId: passive.sourcePowerId!,
      sourcePacketId: "source-scope-passive-linked",
      targetActorId: ally.id,
    }),
  ];
  state.defensivePools = [{
    id: "source-scope-pool",
    sourceActorId: owner.id,
    sourceActorName: owner.name,
    sourceSide: owner.side,
    sourceActionId: passive.id,
    sourceActionName: passive.name,
    sourcePowerId: passive.sourcePowerId,
    sourcePacketId: passive.sourcePacketId,
    protectedActorId: ally.id,
    protectedActorName: ally.name,
    poolType: "DODGE",
    woundChannel: null,
    resistedAttribute: null,
    remainingPoints: 2,
    initialPoints: 2,
    perTriggerCap: 1,
    remainingRounds: 4,
    durationKind: "passive",
    sourceChassis: "UNKNOWN",
    sourceCommitmentModifier: "STANDARD",
    createdRound: 0,
    createdTurnActorId: null,
    reapplyKey: "source-scope-pool",
  }];

  const failed = resolveCombatAction({
    state,
    actor: state.actors[2],
    action: cleanse,
    target: state.actors[0],
    rng: rngFrom([0.6]),
    lane: "power",
  });
  check(
    "Source-Power Cleanse below the activation snapshot threshold fails and preserves every effect",
    failed.rawSuccesses === 1 &&
      getSemanticPassiveState(state, owner.id, passive.sourcePowerId!)?.status === "ACTIVE" &&
      getSemanticPassiveState(state, owner.id, passive.sourcePowerId!)?.activationSourceSuccesses === 2 &&
      state.statusEffects.length === 2 &&
      state.defensivePools.length === 1,
  );

  const succeeded = resolveCombatAction({
    state,
    actor: state.actors[2],
    action: cleanse,
    target: state.actors[0],
    rng: rngFrom([0.99]),
    lane: "power",
  });
  const cleansedRuntime = getSemanticPassiveState(state, owner.id, passive.sourcePowerId!);
  check(
    "Source-Power Cleanse meeting the snapshot removes all packets and pools and clears ACTIVE state",
    succeeded.rawSuccesses === 2 &&
      state.statusEffects.length === 0 &&
      state.defensivePools.length === 0 &&
      cleansedRuntime?.status === "INACTIVE" &&
      cleansedRuntime.activationSourceSuccesses === null,
  );
  check(
    "Complete Source-Power Cleanse applies the Passive cooldown exactly once",
    cleansedRuntime?.cooldownRemaining === 4 &&
      state.semanticPassiveTransitions.filter((transition) =>
        transition.actorId === owner.id &&
        transition.powerId === passive.sourcePowerId &&
        transition.type === "cooldownApplied").length === 1,
  );
  for (let turn = 0; turn < 4; turn += 1) tickActorCooldowns(state, owner.id);
  check(
    "Cooldown expiry leaves the Passive INACTIVE and ready without reactivating it",
    cleansedRuntime?.cooldownRemaining === 0 &&
      cleansedRuntime.status === "INACTIVE" &&
      state.statusEffects.length === 0 &&
      chooseTurnAction(state.actors[0], state, "power")?.id === passive.id,
  );
  resolveCombatAction({
    state,
    actor: state.actors[0],
    action: passive,
    target: state.actors[0],
    rng: rngFrom([0.99]),
    lane: "power",
  });
  check(
    "Reactivation after cooldown requires and records a new Power Action activation",
    getSemanticPassiveState(state, owner.id, passive.sourcePowerId!)?.status === "ACTIVE" &&
      state.transcriptEvents.some((event) =>
        event.type === "powerAction" && event.actorId === owner.id && event.actionId === passive.id),
  );

  const cancelOwner = actor("cancel-owner", "players");
  cancelOwner.actions = [{ ...passive, sourcePowerId: "cancel-passive-power" }];
  const cancelOther = actor("cancel-other", "monsters");
  const cancelState = createCombatState([cancelOwner], [cancelOther], {
    semanticPassiveStates: [{
      actorId: cancelOwner.id,
      powerId: "cancel-passive-power",
      status: "ACTIVE",
      activationSourceSuccesses: 2,
      cooldownRemaining: 0,
    }],
  });
  cancelState.statusEffects = [status({
    id: "cancel-status",
    sourceActorId: cancelOwner.id,
    sourcePowerId: "cancel-passive-power",
    targetActorId: cancelOwner.id,
  })];
  cancelState.currentTurnActorId = cancelOther.id;
  const rejectedCancellation = cancelSemanticPassive(cancelState, cancelOwner.id, "cancel-passive-power");
  cancelState.currentTurnActorId = cancelOwner.id;
  const actionsBeforeCancellation = cancelState.log.length;
  const responsesBeforeCancellation = cancelState.responsesRemaining[cancelOwner.id];
  const cancellation = cancelSemanticPassive(cancelState, cancelOwner.id, "cancel-passive-power");
  const cancelledRuntime = getSemanticPassiveState(cancelState, cancelOwner.id, "cancel-passive-power");
  check(
    "Voluntary cancellation is source-turn-only in combat and removes all source-Power effects",
    rejectedCancellation.reason === "notSourceTurn" &&
      cancellation.ok &&
      cancelState.statusEffects.length === 0 &&
      cancelledRuntime?.status === "INACTIVE" &&
      cancelledRuntime.activationSourceSuccesses === null,
  );
  check(
    "Voluntary cancellation consumes no action or Response and applies cooldown once",
    cancelState.log.length === actionsBeforeCancellation &&
      cancelState.responsesRemaining[cancelOwner.id] === responsesBeforeCancellation &&
      cancelledRuntime?.cooldownRemaining === 4 &&
      cancelState.semanticPassiveTransitions.filter((transition) =>
        transition.actorId === cancelOwner.id &&
        transition.powerId === "cancel-passive-power" &&
        transition.type === "cooldownApplied").length === 1,
  );
  check(
    "An already INACTIVE Passive cannot be cancelled again",
    cancelSemanticPassive(cancelState, cancelOwner.id, "cancel-passive-power").reason === "passiveInactive",
  );
}

// Passive Debuff and linked semantics
{
  const linkedDebuff = action({
    id: "passive-linked-debuff",
    name: "Passive Linked Debuff",
    sourcePowerId: "passive-debuff-power",
    sourcePacketId: "passive-linked-packet",
    kind: "debuff",
    targetPolicy: "enemy",
    accuracyAttribute: "Attack",
    potency: 2,
    durationRounds: 4,
    durationKind: "passive",
    passiveDuration: true,
    modifier: {
      attribute: "Bravery",
      amount: 2,
      modifierMagnitude: 2,
      semanticFormat: "augmentDebuffThreeFieldV1",
      durationRounds: 4,
    },
    linkedToPrimary: true,
    usesPrimaryAppliedSuccesses: true,
    skipOwnRoll: true,
    skipOwnDefenceGate: true,
    cooldownRounds: 0,
  });
  const passiveDebuff = action({
    id: "automatic-passive-debuff",
    name: "Automatic Passive Debuff",
    sourcePowerId: "passive-debuff-power",
    sourcePacketId: "passive-debuff-packet",
    kind: "debuff",
    targetPolicy: "enemy",
    accuracyAttribute: "Attack",
    diceCount: 1,
    potency: 3,
    resistAttribute: "FORTITUDE",
    durationRounds: 4,
    durationKind: "passive",
    passiveDuration: true,
    passive: true,
    cooldownRounds: 5,
    secondaryActions: [linkedDebuff],
  });
  const source = actor("passive-debuff-source", "players");
  source.attributeDice.Attack = "D12";
  source.actions = [passiveDebuff];
  const counter = action({
    id: "passive-debuff-counter",
    name: "Passive Debuff Counter",
    kind: "attack",
    targetPolicy: "enemy",
    modifier: undefined,
    counterMode: true,
    cooldownRounds: 2,
  });
  const target = actor("passive-debuff-target", "monsters");
  target.attributeDice.Fortitude = "D4";
  target.actions = [counter];
  const state = createCombatState([source], [target], {
    captureTranscript: true,
    semanticPassiveStates: [{
      actorId: source.id,
      powerId: "passive-debuff-power",
      status: "ACTIVE",
      activationSourceSuccesses: 2,
      cooldownRemaining: 0,
    }],
  });
  let rngCalls = 0;
  const [establishment] = establishSemanticPassivesAtCombatStart(state, () => {
    rngCalls += 1;
    return 0;
  });
  const primary = state.statusEffects.find((effect) => effect.sourcePacketId === "passive-debuff-packet");
  const linked = state.statusEffects.find((effect) => effect.sourcePacketId === "passive-linked-packet");
  check(
    "Passive Debuff establishes with normal hostile Resist behavior",
    establishment?.resolution.resistRolls === 1 &&
      establishment.resolution.hostileSuccessesAfterResist > 0 &&
      primary?.kind === "debuff",
  );
  check(
    "Passive linked packet inherits target-local successes without another roll or resistance gate",
    rngCalls === 3 &&
      establishment?.resolution.resistRolls === 1 &&
      linked?.stackCount === establishment.resolution.hostileSuccessesAfterResist * linkedDebuff.potency,
  );
  check(
    "Passive linked packet retains its own Potency and Modifier",
    linked?.modifierMagnitude === 2 && linked.stackCount === (primary?.stackCount ?? 0) / passiveDebuff.potency * linkedDebuff.potency,
  );
  check(
    "Combat-start Passive Debuff reuses its snapshot without a source reroll or Response",
    state.responsesRemaining[state.actors[1].id] === 2 &&
      !isActionOnCooldown(state, state.actors[1].id, counter.id) &&
      establishment?.resolution.responsesUsed === 0 &&
      getSemanticPassiveState(state, source.id, passiveDebuff.sourcePowerId!)?.activationSourceSuccesses === 2 &&
      state.transcriptEvents.some((event) =>
        event.actorId === source.id &&
        event.actionId === passiveDebuff.id &&
        event.details?.sourceRerolled === false),
  );
}

// Automated simulation lifecycle
{
  const passive = action({
    id: "auto-sim-passive",
    name: "Auto Sim Passive",
    sourcePowerId: "auto-sim-passive-power",
    sourcePacketId: "auto-sim-passive-packet",
    targetPolicy: "self",
    accuracyAttribute: "Guard",
    diceCount: 20,
    potency: 2,
    durationKind: "passive",
    passiveDuration: true,
    passive: true,
    cooldownRounds: 4,
  });
  const main = action({
    id: "auto-sim-main",
    name: "Auto Sim Main",
    sourceType: "naturalAttack",
    kind: "attack",
    targetPolicy: "enemy",
    modifier: undefined,
    diceCount: 0,
    cooldownRounds: 0,
  });
  const active = action({
    id: "auto-sim-active",
    name: "Auto Sim Active",
    kind: "debuff",
    targetPolicy: "enemy",
    diceCount: 0,
    potency: 1,
    cooldownRounds: 0,
  });
  const source = actor("auto-sim-source", "players");
  source.actions = [passive, active, main];
  const target = actor("auto-sim-target", "monsters");
  target.actions = [main];
  const result = runCombatScenario({
    name: "semantic Passive prepared-active lifecycle",
    players: [source],
    monsters: [target],
    runs: 1,
    seed: 17,
    maxRounds: 1,
    turnOrder: "playersFirst",
    semanticPassiveStates: [{
      actorId: source.id,
      powerId: "auto-sim-passive-power",
      status: "ACTIVE",
      activationSourceSuccesses: 2,
      cooldownRemaining: 0,
    }],
  });
  const events = result.firstRunTranscript?.events ?? [];
  const passiveIndex = events.findIndex((event) => event.actionId === passive.id && event.lane === "combatStart");
  const firstTurnIndex = events.findIndex((event) => event.type === "turnStart");
  check(
    "Automated simulation establishes an explicit ACTIVE semantic Passive before the first ordinary turn",
    passiveIndex >= 0 && firstTurnIndex >= 0 && passiveIndex < firstTurnIndex,
  );
  check(
    "Automated simulation never selects semantic Passive into Main, Power, or Response lanes",
    !events.some((event) =>
      event.actionId === passive.id &&
      (event.lane === "main" || event.lane === "power" || event.lane === "response")),
  );
  const playerMainEvents = events.filter(
    (event) => event.actorId === source.id && event.type === "mainAction",
  ).length;
  const playerPowerEvents = events.filter(
    (event) => event.actorId === source.id && event.type === "powerAction",
  ).length;
  check(
    "Automatic establishment does not inflate ordinary action-capacity diagnostics",
    result.metrics.actionsUsed.players === playerMainEvents + playerPowerEvents &&
      result.metrics.mainActionsUsed.players === playerMainEvents &&
      result.metrics.powerActionsUsed.players === playerPowerEvents &&
      !result.metrics.cooldownTrace[`${source.id}:${passive.id}`],
  );

  const inactiveSource = actor("auto-sim-inactive-source", "players");
  inactiveSource.actions = [passive, main];
  const inactiveTarget = actor("auto-sim-inactive-target", "monsters");
  inactiveTarget.actions = [main];
  const inactiveResult = runCombatScenario({
    name: "semantic Passive inactive activation lifecycle",
    players: [inactiveSource],
    monsters: [inactiveTarget],
    runs: 1,
    seed: 17,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  check(
    "Automated INACTIVE activation consumes a Power Action and stores its successful snapshot",
    inactiveResult.metrics.powerActionsUsed.players === 1 &&
      inactiveResult.semanticPassiveRuntime.transitions.some((transition) =>
        transition.actorId === inactiveSource.id &&
        transition.powerId === passive.sourcePowerId &&
        transition.type === "activationSucceeded" &&
        (transition.activationSourceSuccesses ?? 0) > 0) &&
      inactiveResult.semanticPassiveRuntime.finalStates.some((runtime) =>
        runtime.actorId === inactiveSource.id &&
        runtime.powerId === passive.sourcePowerId &&
        runtime.status === "ACTIVE" &&
        (runtime.activationSourceSuccesses ?? 0) > 0),
  );

  const failedPassive = { ...passive, id: "auto-sim-failed-passive", diceCount: 0 };
  const failedSource = actor("auto-sim-failed-source", "players");
  failedSource.actions = [failedPassive, main];
  const failedTarget = actor("auto-sim-failed-target", "monsters");
  failedTarget.actions = [main];
  const failedResult = runCombatScenario({
    name: "semantic Passive failed activation lifecycle",
    players: [failedSource],
    monsters: [failedTarget],
    runs: 1,
    seed: 17,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  check(
    "Automated failed activation still consumes its Power Action without cooldown or free establishment",
    failedResult.metrics.powerActionsUsed.players === 1 &&
      failedResult.semanticPassiveRuntime.transitions.filter((transition) =>
        transition.actorId === failedSource.id &&
        transition.powerId === passive.sourcePowerId &&
        transition.type === "activationFailed").length === 1 &&
      failedResult.semanticPassiveRuntime.finalStates.some((runtime) =>
        runtime.actorId === failedSource.id &&
        runtime.powerId === passive.sourcePowerId &&
        runtime.status === "INACTIVE" &&
        runtime.cooldownRemaining === 0) &&
      !failedResult.firstRunTranscript?.events.some((event) =>
        event.actionId === failedPassive.id && event.lane === "combatStart"),
  );
}

// Status state (14-19)
{
  const target = actor("target", "players");
  const source = actor("source-a", "monsters");
  const state = createCombatState([target], [source]);
  state.statusEffects = [status({ stackCount: 8, modifierMagnitude: 3 })];
  check("stackCount and modifierMagnitude remain independent", state.statusEffects[0].stackCount === 8 && getAttributeModifier(state, target.id, "Guard") === 3);
  tickTargetTurnEffects(state, target.id);
  check("Partial stack loss leaves full Modifier", state.statusEffects[0].stackCount === 7 && getAttributeModifier(state, target.id, "Guard") === 3);
  state.statusEffects = [status({ stackCount: 1, remainingRounds: 4 })];
  tickTargetTurnEffects(state, target.id);
  check("Final-stack loss removes the status", state.statusEffects.length === 0);
  state.statusEffects = [status({ stackCount: 10, remainingRounds: 1 })];
  tickTargetTurnEffects(state, target.id);
  check("Finite duration is a hard maximum", state.statusEffects.length === 0);
  state.statusEffects = [status({ stackCount: 2, remainingRounds: 99, passiveDuration: true, durationKind: "passive" })];
  tickTargetTurnEffects(state, target.id);
  check("Passive duration does not tick", state.statusEffects[0]?.remainingRounds === 99);
  check("Passive stacks still degrade", state.statusEffects[0]?.stackCount === 1);
}

// Reapplication (20-25)
{
  const source = actor("source", "players");
  const target = actor("target", "monsters");
  const semantic = action({ id: "reapply", sourcePowerId: "power-r", sourcePacketId: "packet-r", targetPolicy: "self", diceCount: 1, potency: 2 });
  const identityState = createCombatState([source], [target]);
  resolveCombatAction({ state: identityState, actor: source, action: semantic, target: source, rng: rngFrom([0.99]) });
  const existing = identityState.statusEffects[0];
  existing.stackCount = 20;
  existing.remainingRounds = 1;
  resolveCombatAction({ state: identityState, actor: source, action: semantic, target: source, rng: rngFrom([0.99]) });
  check("Same-source weaker success keeps current higher stacks", existing.stackCount === 20);

  existing.stackCount = 1;
  resolveCombatAction({ state: identityState, actor: source, action: semantic, target: source, rng: rngFrom([0.99]) });
  check("Same-source stronger success raises stacks", (existing.stackCount ?? 0) > 1);
  check("Successful reapplication refreshes duration", existing.remainingRounds === 4);

  existing.remainingRounds = 2;
  const stacksBeforeFailure = existing.stackCount;
  resolveCombatAction({ state: identityState, actor: source, action: semantic, target: source, rng: rngFrom([0]) });
  check("Failed reapplication does not refresh duration", existing.remainingRounds === 2 && existing.stackCount === stacksBeforeFailure);
  check("No duplicate same-source record is created", identityState.statusEffects.length === 1);

  const otherSource = actor("source-other", "players");
  identityState.actors.push(otherSource);
  resolveCombatAction({ state: identityState, actor: otherSource, action: semantic, target: otherSource, rng: rngFrom([0.99]) });
  check("Separate sources coexist", identityState.statusEffects.length === 2);
}

// Cleanup (26-29)
{
  const cleaner = actor("cleaner", "players");
  const target = actor("target", "players");
  const enemy = actor("enemy", "monsters");
  const cleanse = action({ id: "cleanse", kind: "cleanse", targetPolicy: "ally", modifier: undefined, diceCount: 1, potency: 1 });
  const state = createCombatState([cleaner, target], [enemy]);
  state.statusEffects = [status({ id: "selected", effectFamily: "debuff", kind: "debuff", sourceActorId: enemy.id, targetActorId: target.id, stackCount: 3, modifierMagnitude: 2 })];
  const cleanupMetrics = resolveCombatAction({ state, actor: cleaner, action: { ...cleanse, targetStatusId: "selected" }, target, rng: rngFrom([0.6]) });
  check("One cleanup unit removes one stack", cleanupMetrics.rawSuccesses === 1 && state.statusEffects[0]?.stackCount === 2);

  state.statusEffects = [
    status({ id: "explicit-low", effectFamily: "debuff", kind: "debuff", sourceActorId: enemy.id, targetActorId: target.id, stackCount: 3, modifierMagnitude: 1 }),
    status({ id: "fallback-high", effectFamily: "debuff", kind: "debuff", sourceActorId: enemy.id, targetActorId: target.id, stackCount: 3, modifierMagnitude: 5, sourcePacketId: "packet-high" }),
  ];
  resolveCombatAction({ state, actor: cleaner, action: { ...cleanse, id: "cleanse-explicit", targetStatusId: "explicit-low" }, target, rng: rngFrom([0.6]) });
  check("Explicit status selection is respected", state.statusEffects.find((effect) => effect.id === "explicit-low")?.stackCount === 2 && state.statusEffects.find((effect) => effect.id === "fallback-high")?.stackCount === 3);

  resolveCombatAction({ state, actor: cleaner, action: { ...cleanse, id: "cleanse-fallback", targetStatusId: null }, target, rng: rngFrom([0.6]) });
  check("Deterministic cleanup fallback is respected", state.statusEffects.find((effect) => effect.id === "fallback-high")?.stackCount === 2);

  state.statusEffects = [{ id: "legacy-debuff", sourceActorId: enemy.id, targetActorId: target.id, kind: "debuff", attribute: "Guard", amount: 3, remainingRounds: 4 }];
  resolveCombatAction({ state, actor: cleaner, action: { ...cleanse, id: "cleanse-legacy" }, target, rng: rngFrom([0.6]) });
  check("Legacy cleanup remains unchanged", state.statusEffects[0]?.amount === 2 && state.statusEffects[0]?.stackCount === undefined);
}

// Automated cleanup candidate recognition
{
  const cleaner = actor("auto-cleaner", "players");
  const ally = actor("auto-ally", "players");
  const enemy = actor("auto-enemy", "monsters");
  const state = createCombatState([cleaner, ally], [enemy]);
  state.statusEffects = [status({
    id: "auto-harmful-semantic",
    effectFamily: "debuff",
    kind: "debuff",
    sourceActorId: enemy.id,
    targetActorId: cleaner.id,
    amount: 0,
    stackCount: 3,
    modifierMagnitude: 3,
  })];
  check(
    "Automated cleanup recognizes harmful semantic amount-zero status",
    chooseTurnAction(cleaner, state, "main")?.runtimeCleanup === true,
  );

  const ineligibleStatuses: CombatStatusEffect[] = [
    status({ id: "beneficial", effectFamily: "augment", kind: "buff", sourceActorId: enemy.id, targetActorId: cleaner.id }),
    status({ id: "expired", effectFamily: "debuff", kind: "debuff", sourceActorId: enemy.id, targetActorId: cleaner.id, remainingRounds: 0 }),
    status({ id: "no-stacks", effectFamily: "debuff", kind: "debuff", sourceActorId: enemy.id, targetActorId: cleaner.id, stackCount: 0 }),
    status({ id: "no-modifier", effectFamily: "debuff", kind: "debuff", sourceActorId: enemy.id, targetActorId: cleaner.id, modifierMagnitude: 0 }),
    status({ id: "friendly-source", effectFamily: "debuff", kind: "debuff", sourceActorId: ally.id, targetActorId: cleaner.id }),
    { id: "unrelated-dot", sourceActorId: enemy.id, targetActorId: cleaner.id, kind: "ongoingDamage", amount: 0, remainingRounds: 4 },
  ];
  check(
    "Automated cleanup rejects beneficial, expired, neutral, friendly, and unrelated amount-zero statuses",
    ineligibleStatuses.every((candidate) => {
      state.statusEffects = [candidate];
      return chooseTurnAction(cleaner, state, "main") === null;
    }),
  );
}

// Aggregation (30-36)
{
  const target = actor("target", "players");
  const source = actor("source-a", "monsters");
  const state = createCombatState([target], [source]);
  const set = (...effects: CombatStatusEffect[]) => { state.statusEffects = effects; };
  set(status({ id: "p3a", modifierMagnitude: 3 }), status({ id: "p3b", modifierMagnitude: 3, sourcePacketId: "p3b" }));
  check("+3 and +3 clamp to +5", getAttributeModifier(state, target.id, "Guard") === 5);
  set(status({ id: "p5", modifierMagnitude: 5 }), status({ id: "n3", kind: "debuff", effectFamily: "debuff", modifierMagnitude: 3, sourcePacketId: "n3" }));
  check("+5 and -3 produce +2", getAttributeModifier(state, target.id, "Guard") === 2);
  set(status({ id: "p5", modifierMagnitude: 5 }), status({ id: "p4", modifierMagnitude: 4, sourcePacketId: "p4" }), status({ id: "n5", kind: "debuff", effectFamily: "debuff", modifierMagnitude: 5, sourcePacketId: "n5" }));
  check("+5, +4, and -5 produce +4", getAttributeModifier(state, target.id, "Guard") === 4);
  set(status({ id: "n4a", kind: "debuff", effectFamily: "debuff", modifierMagnitude: 4 }), status({ id: "n4b", kind: "debuff", effectFamily: "debuff", modifierMagnitude: 4, sourcePacketId: "n4b" }));
  check("-4 and -4 clamp to -5", getAttributeModifier(state, target.id, "Guard") === -5);
  set(status({ id: "p4a", modifierMagnitude: 4 }), status({ id: "p4b", modifierMagnitude: 4, sourcePacketId: "p4b" }), status({ id: "p4c", modifierMagnitude: 4, sourcePacketId: "p4c" }));
  removeStatusEffectById(state, "p4a");
  const afterOne = getAttributeModifier(state, target.id, "Guard");
  removeStatusEffectById(state, "p4b");
  check("Hidden excess is revealed after source removal", afterOne === 5 && getAttributeModifier(state, target.id, "Guard") === 4);
  set({ id: "legacy", sourceActorId: "legacy-source", targetActorId: target.id, kind: "buff", attribute: "Guard", amount: 8, remainingRounds: 4 });
  check("Legacy aggregation remains unchanged", getAttributeModifier(state, target.id, "Guard") === 8);
  set({ id: "legacy", sourceActorId: "legacy-source", targetActorId: target.id, kind: "buff", attribute: "Guard", amount: 8, remainingRounds: 4 }, status({ id: "new-negative", kind: "debuff", effectFamily: "debuff", modifierMagnitude: 3 }));
  const mixed = getAttributeModifierLaneBreakdown(state, target.id, "Guard");
  check("Mixed-lane transitional behavior follows compatibility rule", mixed.effectiveTotal === 5 && mixed.diagnostics.includes("MIXED_LEGACY_THREE_FIELD_MODIFIER_LANES"));
}

// Identity (37-45)
const created = createDefaultCharacterPower(0);
check("New Character powers receive stable IDs", typeof created.id === "string" && created.id.length > 0);
check("New packets receive independent stable IDs", typeof created.effectPackets[0]?.id === "string" && created.effectPackets[0]?.id !== created.id);
const normalized = normalizeCharacterPower(created, 0);
const prepared = prepareCharacterPowerIdsForPersistence({ powers: [normalized], signatureMove: null });
const loaded = normalizeCharacterPower(JSON.parse(JSON.stringify(prepared.powers[0])), 0);
check("Ordinary IDs survive normalize save load and hydration", loaded.id === created.id && loaded.effectPackets[0]?.id === created.effectPackets[0]?.id && adaptedPower({ id: loaded.id, packetId: loaded.effectPackets[0]?.id }).actions.length === 1);
const signature = createDefaultCharacterPower(0);
const preparedSignature = prepareCharacterPowerIdsForPersistence({ powers: [], signatureMove: normalizeCharacterPower(signature, 0) }).signatureMove;
const loadedSignature = normalizeCharacterPower(JSON.parse(JSON.stringify(preparedSignature)), 0);
check("Signature IDs survive normalize save load and hydration", loadedSignature.id === signature.id && loadedSignature.effectPackets[0]?.id === signature.effectPackets[0]?.id);
const secondPacket = createDefaultCharacterPowerPacket("AUGMENT", 1);
const reordered = normalizeCharacterPower({ ...created, effectPackets: [secondPacket, created.effectPackets[0]] }, 0);
check("Reorder preserves packet identity", reordered.effectPackets[0]?.id === secondPacket.id && reordered.effectPackets[1]?.id === created.effectPackets[0]?.id);
const renamed = normalizeCharacterPower({ ...created, name: "Renamed" }, 0);
check("Rename preserves power identity", renamed.id === created.id);
check("Missing-ID legacy packets retain fallback only in legacy mode", adaptedPower({ id: "legacy-power", packetId: "", modifier: null }).actions.length === 1);
const missingNewId = adaptedPower({ id: "new-power", packetId: "", modifier: 3 });
check("Missing-ID new-format packets are rejected from new semantics", missingNewId.actions.length === 0 && missingNewId.unsupported.some((entry) => entry.reason.includes("stable packet ID")));
const duplicateA = createDefaultCharacterPower(0);
const duplicateB = createDefaultCharacterPower(1);
duplicateA.name = duplicateB.name = "Duplicate";
check("Duplicate names do not collide", duplicateA.id !== duplicateB.id && duplicateA.effectPackets[0]?.id !== duplicateB.effectPackets[0]?.id);

// Authoring safety (46-50)
const authoredPowers = [{ id: "power-authored", effectPackets: [packet("AUGMENT", 3)] }];
const expectedWriteError = THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_ENABLED
  ? null
  : THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR;
check("Monster create follows the public authoring gate", getThreeFieldAugmentDebuffPublicWriteError(authoredPowers) === expectedWriteError);
check("Monster update follows the public authoring gate", getThreeFieldAugmentDebuffPublicWriteError(authoredPowers) === expectedWriteError);
check("Monster copy follows the public authoring gate", getThreeFieldAugmentDebuffPublicWriteError(authoredPowers) === expectedWriteError);
check("Character save follows the public authoring gate", getCharacterBuilderThreeFieldAugmentDebuffPublicWriteError({ powers: authoredPowers, signatureMove: null }) === expectedWriteError);
const unexpectedRead = JSON.parse(JSON.stringify(authoredPowers));
const diagnostics = getThreeFieldAugmentDebuffReadDiagnostics(unexpectedRead);
check("Reads preserve unexpected non-null Modifier without mutation", unexpectedRead[0].effectPackets[0].modifier === 3 && diagnostics.length === 1);

const unsupportedTimingPower = (effectTimingType: "END_OF_TURN" | "ON_EXPIRY") => ({
  id: `power-${effectTimingType.toLowerCase()}`,
  descriptorChassis: "IMMEDIATE",
  effectPackets: [{
    ...packet("DEBUFF", 3),
    id: `packet-${effectTimingType.toLowerCase()}`,
    effectTimingType,
    effectDurationType: "TURNS",
    effectDurationTurns: 4,
  }],
});
check(
  "Semantic END_OF_TURN save fails closed without rewriting",
  getThreeFieldAugmentDebuffPublicWriteError([unsupportedTimingPower("END_OF_TURN")])?.includes("SEMANTIC_RUNTIME_UNSUPPORTED_TIMING") === true,
);
check(
  "Semantic ON_EXPIRY save fails closed without rewriting",
  getThreeFieldAugmentDebuffPublicWriteError([unsupportedTimingPower("ON_EXPIRY")])?.includes("SEMANTIC_RUNTIME_UNSUPPORTED_TIMING") === true,
);
check(
  "Attached and triggered semantic saves fail closed",
  (["ATTACHED", "TRIGGER"] as const).every((descriptorChassis) =>
    getThreeFieldAugmentDebuffPublicWriteError([{
      id: `power-${descriptorChassis.toLowerCase()}`,
      descriptorChassis,
      effectPackets: [{
        ...packet("AUGMENT", 2),
        id: `packet-${descriptorChassis.toLowerCase()}`,
        effectTimingType: descriptorChassis === "ATTACHED" ? "ON_ATTACH" : "ON_TRIGGER",
      }],
    }])?.includes("SEMANTIC_RUNTIME_UNSUPPORTED_CHASSIS") === true),
);
check(
  "Linked semantic secondary depending on unsupported delayed primary fails closed",
  getThreeFieldAugmentDebuffPublicWriteError([{
    id: "power-delayed-linked-secondary",
    descriptorChassis: "IMMEDIATE",
    effectPackets: [
      { ...packet("ATTACK", null), id: "packet-delayed-primary", effectTimingType: "END_OF_TURN", effectDurationType: "TURNS", effectDurationTurns: 4 },
      { ...packet("AUGMENT", 2), id: "packet-linked-secondary", effectTimingType: "ON_CAST", secondaryDependencyMode: "LINKED_TO_PRIMARY" },
    ],
  }])?.includes("linked semantic packet depends on runtime-unsupported Packet 1") === true,
);
const legacyUnsupported = unsupportedTimingPower("END_OF_TURN");
legacyUnsupported.effectPackets[0].modifier = null;
const legacyUnsupportedBefore = JSON.stringify(legacyUnsupported);
check(
  "Legacy Modifier-null unsupported timing remains savable and unchanged",
  getThreeFieldAugmentDebuffPublicWriteError([legacyUnsupported]) === null &&
    JSON.stringify(legacyUnsupported) === legacyUnsupportedBefore,
);
const rejectedWithStableIds = unsupportedTimingPower("ON_EXPIRY");
const rejectedIdsBefore = [rejectedWithStableIds.id, rejectedWithStableIds.effectPackets[0].id];
getCharacterBuilderThreeFieldAugmentDebuffPublicWriteError({
  powers: [],
  signatureMove: rejectedWithStableIds,
});
check(
  "Rejected Signature save preserves stable power and packet IDs",
  rejectedWithStableIds.id === rejectedIdsBefore[0] &&
    rejectedWithStableIds.effectPackets[0].id === rejectedIdsBefore[1],
);

assert.equal(assertionCount, 92, `Expected exactly 92 semantic assertions, got ${assertionCount}.`);
console.log(`augment-debuff-three-field-semantic smoke passed (${assertionCount} assertions).`);
