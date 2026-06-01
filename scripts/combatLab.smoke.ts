import { buildCombatLabSmokeScenarios } from "../lib/combat-lab/autoSimulator";
import { resolveCombatAction, resolveStartOfTurnEffects } from "../lib/combat-lab/actionResolver";
import {
  createCombatState,
  refreshActorResponses,
  tickActorCooldowns,
} from "../lib/combat-lab/combatState";
import type { Rng } from "../lib/combat-lab/dice";
import {
  DEFAULT_COMBAT_TUNING_VALUES,
  type ProtectionTuningValues,
} from "../lib/config/combatTuningShared";
import { defaultBuilderData, type CharacterBuilderData } from "../lib/characterBuilder/core";
import { buildCharacterDerivedCombatStats } from "../lib/characterBuilder/derivedStats";
import {
  adaptCampaignCharacterToCombatActor,
  type CombatLabHydrationWarning,
} from "../lib/combat-lab/liveAdapters";
import {
  adaptPowerToCombatActions,
  createFixtureActor,
  makeAttackActionsFromConfig,
  makeFixturePower,
} from "../lib/combat-lab/powerAdapter";
import { formatSuiteReport, runScenarioSuite } from "../lib/combat-lab/reporting";
import type { CombatAction, CombatActor } from "../lib/combat-lab/types";

type CombatLabCharacterRow = Parameters<typeof adaptCampaignCharacterToCombatActor>[0];
type CombatLabCharacterBackpackItem = NonNullable<CombatLabCharacterRow["backpackItems"]>[number];

function rngFrom(values: number[]): Rng {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0.99;
}

function fixtureActor(id: string, side: "players" | "monsters", overrides: Partial<CombatActor> = {}): CombatActor {
  return {
    ...createFixtureActor({
      id,
      side,
      name: id,
      role: "Fixture",
      physicalHp: 80,
      mentalHp: 80,
      physicalProtection: 0,
      mentalProtection: 0,
      dodgeValue: 6,
      dodgeDice: 1,
      physicalDefenceDice: 1,
      physicalDefenceBlock: 0,
      mentalDefenceDice: 1,
      mentalDefenceBlock: 0,
      attack: 8,
      guard: 8,
      fortitude: 8,
      intellect: 8,
      synergy: 8,
      bravery: 8,
      powers: [],
    }),
    ...overrides,
  };
}

function action(overrides: Partial<CombatAction> = {}): CombatAction {
  return {
    id: "test-action",
    name: "Test Action",
    sourceType: "fallback",
    kind: "attack",
    targetPolicy: "enemy",
    supported: true,
    unsupportedReasons: [],
    pool: "physical",
    rangeCategory: "MELEE",
    targetCount: 1,
    accuracyAttribute: "Attack",
    diceCount: 1,
    potency: 3,
    cooldownRounds: 0,
    ...overrides,
  };
}

function weightedSkillExpected(primary: number, secondary: number, modifier: number): number {
  const primaryHalf = Math.round(primary / 2);
  const secondaryHalf = Math.round(secondary / 2);
  const weightedHalf = (primaryHalf * 2 + secondaryHalf) / 3;
  const roundedRaw = Math.round((weightedHalf - 1) * 10) / 10;
  return Math.max(1, Math.ceil(roundedRaw) + modifier);
}

function makeCharacterBuilderData(overrides: Partial<CharacterBuilderData> = {}): CharacterBuilderData {
  return {
    ...defaultBuilderData(),
    attributes: {
      Attack: 6,
      Guard: 8,
      Fortitude: 10,
      Intellect: 10,
      Synergy: 12,
      Bravery: 6,
    },
    resistPoints: {
      Attack: 0,
      Guard: 0,
      Fortitude: 0,
      Intellect: 0,
      Synergy: 0,
      Bravery: 0,
    },
    equippedSlots: { torsoArmor: "equipped-armor" },
    powers: [],
    ...overrides,
  };
}

function makeBackpackRow(params: {
  id: string;
  name: string;
  type: string;
  ppv?: number | null;
  mpv?: number | null;
  globalAttributeModifiers?: Array<{ attribute: string; amount: number }>;
}): CombatLabCharacterBackpackItem {
  return {
    id: params.id,
    quantity: 1,
    partyInventoryItem: {
      itemTemplate: {
        id: `template-${params.id}`,
        name: params.name,
        type: params.type,
        size: null,
        armorLocation: params.type === "ARMOR" ? "TORSO" : null,
        itemLocation: null,
        ppv: params.ppv ?? null,
        mpv: params.mpv ?? null,
        generalDescription: null,
        rarity: "COMMON",
        level: 3,
        globalAttributeModifiers: params.globalAttributeModifiers ?? [],
      },
    },
  };
}

function makeCharacterRow(params: {
  builderData: CharacterBuilderData;
  backpackItems: CombatLabCharacterRow["backpackItems"];
}): CombatLabCharacterRow {
  return {
    id: "synthetic-character",
    name: "Synthetic Character",
    level: 3,
    builderData: params.builderData,
    backpackItems: params.backpackItems,
  };
}

const scenarios = buildCombatLabSmokeScenarios();
const reports = scenarios.map(runScenarioSuite);

for (const report of reports) {
  console.log(formatSuiteReport(report));
  console.log("");
}

const requiredNames = [
  "4-player party vs 12 minions",
  "4-player party vs 7 soldiers",
  "4-player party vs 4 elites",
  "4-player party vs 1 boss",
];

for (const name of requiredNames) {
  if (!reports.some((report) => report.scenarioName === name)) {
    throw new Error(`Missing smoke scenario: ${name}`);
  }
}

const totalUnsupported = reports.reduce(
  (sum, report) => sum + report.unsupported.unsupportedPowerCount,
  0,
);

const unsupportedFixture = adaptPowerToCombatActions({
  ...makeFixturePower({
    id: "unsupported-trigger-fixture",
    name: "Trigger Fixture",
    intention: "ATTACK",
    diceCount: 2,
    potency: 2,
  }),
  descriptorChassis: "TRIGGER",
});
if (unsupportedFixture.unsupported.length === 0) {
  throw new Error("Unsupported trigger power fixture was not reported.");
}

const realAttackActions = makeAttackActionsFromConfig({
  idBase: "real-attack-fixture",
  sourceLabel: "Fixture Spear",
  sourceType: "equippedWeapon",
  diceCount: 3,
  attackConfig: {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: 2,
      mentalStrength: 0,
      damageTypes: [{ name: "Piercing", mode: "PHYSICAL" }],
      attackEffects: [],
    },
  },
});
if (realAttackActions.length === 0 || realAttackActions.some((action) => action.sourceType === "fallback")) {
  throw new Error("Real equipped attack fixture incorrectly used fallback.");
}

const fallbackReport = runScenarioSuite({
  name: "fixture fallback reporting",
  players: [
    createFixtureActor({
      id: "fallback-player",
      side: "players",
      name: "Fallback Player",
      role: "Fixture",
      physicalHp: 12,
      mentalHp: 12,
      physicalProtection: 0,
      mentalProtection: 0,
      dodgeValue: 8,
      attack: 3,
      guard: 3,
      fortitude: 3,
      intellect: 3,
      synergy: 3,
      bravery: 3,
      basicAttack: { diceCount: 2, potency: 1 },
      powers: [],
    }),
  ],
  monsters: [
    createFixtureActor({
      id: "fallback-monster",
      side: "monsters",
      name: "Fallback Monster",
      role: "Fixture",
      physicalHp: 8,
      mentalHp: 8,
      physicalProtection: 0,
      mentalProtection: 0,
      dodgeValue: 8,
      attack: 2,
      guard: 2,
      fortitude: 2,
      intellect: 2,
      synergy: 2,
      bravery: 2,
      basicAttack: { diceCount: 1, potency: 1 },
      powers: [],
    }),
  ],
  runs: 1,
  seed: 404,
});
if (fallbackReport.hydrationIntegrity.fallbackActionCount === 0) {
  throw new Error("Fallback fixture action was not reported in hydration integrity metrics.");
}

const unsupportedReport = runScenarioSuite({
  name: "fixture unsupported power reporting",
  players: [
    createFixtureActor({
      id: "unsupported-player",
      side: "players",
      name: "Unsupported Player",
      role: "Fixture",
      physicalHp: 12,
      mentalHp: 12,
      physicalProtection: 0,
      mentalProtection: 0,
      dodgeValue: 8,
      attack: 3,
      guard: 3,
      fortitude: 3,
      intellect: 3,
      synergy: 3,
      bravery: 3,
      powers: [
        {
          ...makeFixturePower({
            id: "unsupported-report-fixture",
            name: "Unsupported Report Fixture",
            intention: "ATTACK",
            diceCount: 2,
            potency: 2,
          }),
          descriptorChassis: "TRIGGER",
        },
      ],
    }),
  ],
  monsters: [
    createFixtureActor({
      id: "unsupported-monster",
      side: "monsters",
      name: "Unsupported Monster",
      role: "Fixture",
      physicalHp: 8,
      mentalHp: 8,
      physicalProtection: 0,
      mentalProtection: 0,
      dodgeValue: 8,
      attack: 2,
      guard: 2,
      fortitude: 2,
      intellect: 2,
      synergy: 2,
      bravery: 2,
      basicAttack: { diceCount: 1, potency: 1 },
      powers: [],
    }),
  ],
  runs: 1,
  seed: 405,
});
if (unsupportedReport.hydrationIntegrity.unsupportedPowerCount === 0) {
  throw new Error("Unsupported power fixture was not reported in hydration integrity metrics.");
}

{
  const tuning: ProtectionTuningValues = DEFAULT_COMBAT_TUNING_VALUES;
  const equippedArmor = makeBackpackRow({
    id: "equipped-armor",
    name: "Equipped Formula Armor",
    type: "ARMOR",
    ppv: 8,
    mpv: 6,
    globalAttributeModifiers: [
      { attribute: "Dodge", amount: 2 },
      { attribute: "Armor Skill", amount: 3 },
      { attribute: "Willpower", amount: 2 },
    ],
  });
  const backpackOnlyArmor = makeBackpackRow({
    id: "backpack-only-armor",
    name: "Backpack Only Overcounter",
    type: "ARMOR",
    ppv: 99,
    mpv: 99,
    globalAttributeModifiers: [
      { attribute: "Dodge", amount: 99 },
      { attribute: "Armor Skill", amount: 99 },
      { attribute: "Willpower", amount: 99 },
    ],
  });
  const builderData = makeCharacterBuilderData();
  const derived = buildCharacterDerivedCombatStats({
    level: 3,
    builderData,
    backpackItems: [
      {
        id: "equipped-armor",
        quantity: 1,
        itemTemplate: {
          id: "template-equipped-armor",
          name: "Equipped Formula Armor",
          rarity: "COMMON",
          level: 3,
          details: null,
          type: "ARMOR",
          size: null,
          armorLocation: "TORSO",
          itemLocation: null,
          ppv: 8,
          mpv: 6,
          globalAttributeModifiers: [
            { attribute: "Dodge", amount: 2 },
            { attribute: "Armor Skill", amount: 3 },
            { attribute: "Willpower", amount: 2 },
          ],
          descriptorSections: [],
        },
      },
      {
        id: "backpack-only-armor",
        quantity: 1,
        itemTemplate: {
          id: "template-backpack-only-armor",
          name: "Backpack Only Overcounter",
          rarity: "COMMON",
          level: 3,
          details: null,
          type: "ARMOR",
          size: null,
          armorLocation: "TORSO",
          itemLocation: null,
          ppv: 99,
          mpv: 99,
          globalAttributeModifiers: [
            { attribute: "Dodge", amount: 99 },
            { attribute: "Armor Skill", amount: 99 },
            { attribute: "Willpower", amount: 99 },
          ],
          descriptorSections: [],
        },
      },
    ],
    protectionTuning: tuning,
  });
  const expectedDodgeValue = Math.max(1, Math.ceil(Math.ceil((10 * 2 + 8) / 2) + 3 - 8));
  const expectedDodgeDice = Math.max(0, Math.ceil(expectedDodgeValue / 6) + 2);
  const expectedArmorSkill = weightedSkillExpected(10, 8, 3);
  const expectedPhysicalBlock = Math.ceil((8 / tuning.protectionK) * (1 + expectedArmorSkill / tuning.protectionS));
  const expectedWillpower = weightedSkillExpected(12, 6, 2);
  const expectedMentalBlock = Math.ceil((6 / tuning.protectionK) * (1 + expectedWillpower / tuning.protectionS));
  if (derived.dodgeDice !== expectedDodgeDice) {
    throw new Error(`Character dodge formula mismatch: expected ${expectedDodgeDice}, got ${derived.dodgeDice}.`);
  }
  if (derived.armorSkill !== expectedArmorSkill || derived.physicalBlockPerSuccess !== expectedPhysicalBlock) {
    throw new Error("Character physical defence formula mismatch.");
  }
  if (derived.willpower !== expectedWillpower || derived.mentalBlockPerSuccess !== expectedMentalBlock) {
    throw new Error("Character mental defence formula mismatch.");
  }

  const noEquipmentDerived = buildCharacterDerivedCombatStats({
    level: 3,
    builderData: makeCharacterBuilderData({ equippedSlots: {} }),
    backpackItems: [
      {
        id: "backpack-only-armor",
        quantity: 1,
        itemTemplate: {
          id: "template-backpack-only-armor",
          name: "Backpack Only Overcounter",
          rarity: "COMMON",
          level: 3,
          details: null,
          type: "ARMOR",
          size: null,
          armorLocation: "TORSO",
          itemLocation: null,
          ppv: 99,
          mpv: 99,
          globalAttributeModifiers: [{ attribute: "Dodge", amount: 99 }],
          descriptorSections: [],
        },
      },
    ],
    protectionTuning: tuning,
  });
  const ppvOnlyDerived = buildCharacterDerivedCombatStats({
    level: 3,
    builderData,
    backpackItems: [
      {
        id: "equipped-armor",
        quantity: 1,
        itemTemplate: {
          id: "template-equipped-armor",
          name: "Equipped Formula Armor",
          rarity: "COMMON",
          level: 3,
          details: null,
          type: "ARMOR",
          size: null,
          armorLocation: "TORSO",
          itemLocation: null,
          ppv: 8,
          mpv: 6,
          globalAttributeModifiers: [],
          descriptorSections: [],
        },
      },
    ],
    protectionTuning: tuning,
  });
  if (ppvOnlyDerived.dodgeDice >= noEquipmentDerived.dodgeDice) {
    throw new Error("Equipped PPV did not reduce character dodge dice as expected.");
  }
  if (derived.dodgeDice !== ppvOnlyDerived.dodgeDice + 2) {
    throw new Error("Direct equipped Dodge modifier did not increase final character dodge dice.");
  }
  if (noEquipmentDerived.itemModifiers.dodgeModifier !== 0 || noEquipmentDerived.physicalProtection !== 0) {
    throw new Error("Backpack-only item contributed to character derived defence stats.");
  }

  const { actor, warnings } = adaptCampaignCharacterToCombatActor(
    makeCharacterRow({ builderData, backpackItems: [equippedArmor, backpackOnlyArmor] }),
    tuning,
  );
  const _warningCheck: CombatLabHydrationWarning[] = warnings;
  if (
    actor.dodgeDice !== expectedDodgeDice ||
    actor.physicalDefenceDice !== expectedArmorSkill ||
    actor.physicalBlockPerSuccess !== expectedPhysicalBlock ||
    actor.mentalDefenceDice !== expectedWillpower ||
    actor.mentalBlockPerSuccess !== expectedMentalBlock
  ) {
    throw new Error("Combat Lab character hydration did not preserve Character Builder defence formulas.");
  }
  if (actor.physicalProtection !== 0 || actor.mentalProtection !== 0) {
    throw new Error("Combat Lab character hydration collapsed structured defence strings into static protection.");
  }
  void _warningCheck;
}

{
  const attacker = fixtureActor("dodge-attacker", "players");
  const defender = fixtureActor("dodge-defender", "monsters", { dodgeDice: 2 });
  const state = createCombatState([attacker], [defender]);
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ diceCount: 1, potency: 4 }),
    rng: rngFrom([0.99, 0.99, 0.99]),
  });
  if (resolution.dodgeRolls !== 1 || resolution.woundsAvoidedByDodge !== 8 || resolution.netWounds !== 0) {
    throw new Error("Dodge did not use Guard dice to fully avoid a matching attack.");
  }
}

{
  const attacker = fixtureActor("degrade-attacker", "players");
  const defender = fixtureActor("degrade-defender", "monsters", { dodgeDice: 1 });
  const state = createCombatState([attacker], [defender]);
  const first = resolveCombatAction({ state, actor: state.actors[0], target: state.actors[1], action: action(), rng: rngFrom([0.99, 0]) });
  const second = resolveCombatAction({ state, actor: state.actors[0], target: state.actors[1], action: action(), rng: rngFrom([0.99, 0]) });
  if (first.dodgeDegradationApplied !== 0 || second.dodgeDegradationApplied !== 1) {
    throw new Error("Repeated defence rolls did not apply same-round degradation.");
  }
}

{
  const attacker = fixtureActor("resist-attacker", "players");
  const defender = fixtureActor("resist-defender", "monsters", { resist: { FORTITUDE: 0 } });
  defender.attributeDice.Fortitude = "D4";
  const state = createCombatState([attacker], [defender]);
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ kind: "control", diceCount: 3, potency: 1, resistAttribute: "FORTITUDE" }),
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0, 0]),
  });
  if (resolution.resistRolls !== 1 || resolution.hostileSuccessesCancelledByResist !== 1 || resolution.controlTurnsApplied !== 1) {
    throw new Error("Resist did not cancel hostile successes success-by-success.");
  }
}

{
  const state = createCombatState([fixtureActor("cooldown-a", "players")], [fixtureActor("cooldown-b", "monsters")]);
  state.cooldowns["cooldown-a:power"] = 2;
  state.cooldowns["cooldown-b:power"] = 2;
  tickActorCooldowns(state, "cooldown-a");
  if (state.cooldowns["cooldown-a:power"] !== 1 || state.cooldowns["cooldown-b:power"] !== 2) {
    throw new Error("Cooldowns ticked for a non-active actor.");
  }
}

{
  const counterOne = action({ id: "counter-one", name: "Counter One", kind: "defence", counterMode: true, targetPolicy: "self", protection: 2 });
  const counterTwo = action({ id: "counter-two", name: "Counter Two", kind: "defence", counterMode: true, targetPolicy: "self", protection: 2 });
  const attacker = fixtureActor("response-attacker", "players");
  const defender = fixtureActor("response-defender", "monsters", { actions: [counterOne, counterTwo] });
  const state = createCombatState([attacker], [defender]);
  state.responsesRemaining[state.actors[1].id] = 1;
  const first = resolveCombatAction({ state, actor: state.actors[0], target: state.actors[1], action: action(), rng: rngFrom([0.99, 0, 0.99]) });
  const second = resolveCombatAction({ state, actor: state.actors[0], target: state.actors[1], action: action(), rng: rngFrom([0.99, 0]) });
  if (first.responsesUsed !== 1 || second.responsesWastedOrUnavailable !== 1) {
    throw new Error("Counter defences did not consume the Response economy.");
  }
}

{
  const player = fixtureActor("aoe-player", "players");
  const monsters = Array.from({ length: 4 }, (_, index) => fixtureActor(`aoe-monster-${index}`, "monsters"));
  const state = createCombatState([player], monsters);
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ rangeCategory: "AOE", targetCount: 4 }),
    rng: rngFrom([0.99, 0, 0.99, 0]),
  });
  if (resolution.aoePotentialTargets !== 4 || resolution.aoeActualTargets !== 2) {
    throw new Error("AOE target abstraction did not apply 60% target capacity.");
  }
}

{
  const attacker = fixtureActor("ongoing-attacker", "players");
  const defender = fixtureActor("ongoing-defender", "monsters", { dodgeDice: 1 });
  const state = createCombatState([attacker], [defender]);
  const applied = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ recurring: { kind: "ongoingDamage", durationRounds: 2 } }),
    rng: rngFrom([0.99, 0]),
  });
  const ticked = resolveStartOfTurnEffects(state, state.actors[1]);
  if (applied.ongoingDamageUnitsApplied <= 0 || ticked.ongoingDamageTicks !== 1) {
    throw new Error("Ongoing damage did not apply as units and tick on target turn.");
  }
}

{
  const healer = fixtureActor("response-refresh", "players");
  const state = createCombatState([healer], [fixtureActor("refresh-monster", "monsters")]);
  refreshActorResponses(state, state.actors[0].id);
  if (state.responsesRemaining[state.actors[0].id] !== 2) {
    throw new Error("Actor Responses did not refresh to 2 at turn start.");
  }
}

console.log(
  `combatLab.smoke.ts passed (${reports.length} fixture scenarios, unsupported fixture reasons: ${unsupportedFixture.unsupported.length}, suite unsupported powers: ${totalUnsupported}, fallback fixture actions: ${fallbackReport.hydrationIntegrity.fallbackActionCount})`,
);
