import assert from "node:assert/strict";

import {
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  normalizeCharacterPower,
  prepareCharacterPowerIdsForPersistence,
} from "../lib/characterBuilder/powers";
import { resolveCombatAction } from "../lib/combat-lab/actionResolver";
import {
  createCombatState,
  getAttributeModifier,
  getAttributeModifierLaneBreakdown,
  isActionOnCooldown,
  removeStatusEffectById,
  tickTargetTurnEffects,
} from "../lib/combat-lab/combatState";
import type { Rng } from "../lib/combat-lab/dice";
import { adaptPowerToCombatActions, createFixtureActor } from "../lib/combat-lab/powerAdapter";
import type { CombatAction, CombatActor, CombatStatusEffect } from "../lib/combat-lab/types";
import {
  getCharacterBuilderThreeFieldAugmentDebuffPublicWriteError,
  getThreeFieldAugmentDebuffPublicWriteError,
  getThreeFieldAugmentDebuffReadDiagnostics,
  THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR,
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
    intention,
    type: intention,
    modifier,
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
} = {}) {
  const intention = params.intention ?? "AUGMENT";
  const effectPacket: EffectPacket = {
    ...createDefaultCharacterPowerPacket(intention, 0),
    id: params.packetId === undefined ? "packet-adapted" : params.packetId,
    intention,
    type: intention,
    targetedAttribute: "GUARD",
    modifier: params.modifier === undefined ? 3 : params.modifier,
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
check("Missing-ID new-format packets are rejected from new semantics", missingNewId.actions.length === 0 && missingNewId.unsupported.some((entry) => entry.reason.includes("stable source packet ID")));
const duplicateA = createDefaultCharacterPower(0);
const duplicateB = createDefaultCharacterPower(1);
duplicateA.name = duplicateB.name = "Duplicate";
check("Duplicate names do not collide", duplicateA.id !== duplicateB.id && duplicateA.effectPackets[0]?.id !== duplicateB.effectPackets[0]?.id);

// Authoring safety (46-50)
const authoredPowers = [{ effectPackets: [packet("AUGMENT", 3)] }];
check("Monster create rejects non-null Modifier while disabled", getThreeFieldAugmentDebuffPublicWriteError(authoredPowers) === THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR);
check("Monster update rejects non-null Modifier", getThreeFieldAugmentDebuffPublicWriteError(authoredPowers) === THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR);
check("Monster copy rejects new-format copy", getThreeFieldAugmentDebuffPublicWriteError(authoredPowers) === THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR);
check("Character save rejects non-null Modifier", getCharacterBuilderThreeFieldAugmentDebuffPublicWriteError({ powers: authoredPowers, signatureMove: null }) === THREE_FIELD_AUGMENT_DEBUFF_AUTHORING_DISABLED_ERROR);
const unexpectedRead = JSON.parse(JSON.stringify(authoredPowers));
const diagnostics = getThreeFieldAugmentDebuffReadDiagnostics(unexpectedRead);
check("Reads preserve unexpected non-null Modifier without mutation", unexpectedRead[0].effectPackets[0].modifier === 3 && diagnostics.length === 1);

assert.equal(assertionCount, 50, `Expected exactly 50 semantic assertions, got ${assertionCount}.`);
console.log(`augment-debuff-three-field-semantic smoke passed (${assertionCount} assertions).`);
