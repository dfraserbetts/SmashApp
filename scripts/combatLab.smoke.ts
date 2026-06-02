import { buildCombatLabSmokeScenarios, runCombatScenario } from "../lib/combat-lab/autoSimulator";
import { resolveCombatAction, resolveStartOfTurnEffects } from "../lib/combat-lab/actionResolver";
import {
  createCombatState,
  createActorInstances,
  getActionCooldownRemaining,
  isActionOnCooldown,
  markDefeatedActors,
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
  adaptMonsterToCombatLabActor,
  itemTemplateToSummoningEquipmentItem,
  type CombatLabHydrationWarning,
} from "../lib/combat-lab/liveAdapters";
import {
  adaptPowerToCombatActions,
  createFixtureActor,
  makeAttackActionsFromConfig,
  makeFixturePower,
} from "../lib/combat-lab/powerAdapter";
import { calculateOutcomeSummary, formatSuiteReport, runScenarioSuite } from "../lib/combat-lab/reporting";
import { chooseTarget, chooseTurnAction } from "../lib/combat-lab/targetingPolicies";
import type { CombatAction, CombatActor, CombatState } from "../lib/combat-lab/types";

type CombatLabCharacterRow = Parameters<typeof adaptCampaignCharacterToCombatActor>[0];
type CombatLabCharacterBackpackItem = NonNullable<CombatLabCharacterRow["backpackItems"]>[number];
type CombatLabMonsterRow = Parameters<typeof adaptMonsterToCombatLabActor>[0];

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

function expectTranscriptLine(lines: string[], pattern: RegExp, label: string) {
  if (!lines.some((line) => pattern.test(line))) {
    throw new Error(`Transcript missing ${label}: ${lines.slice(0, 12).join(" | ")}`);
  }
}

function setCooldown(
  state: CombatState,
  actorId: string,
  actionId: string,
  remaining: number,
  options: Partial<CombatState["cooldowns"][string]> = {},
) {
  state.cooldowns[`${actorId}:${actionId}`] = {
    remaining,
    appliedRound: options.appliedRound ?? 0,
    appliedTurnActorId: options.appliedTurnActorId ?? null,
    appliedOnOwnerTurn: options.appliedOnOwnerTurn ?? false,
  };
}

{
  const outcomes = calculateOutcomeSummary([
    ...Array.from({ length: 48 }, () => ({ winner: "players" as const, stoppedBy: "monstersDefeated" as const })),
    ...Array.from({ length: 24 }, () => ({ winner: "monsters" as const, stoppedBy: "playersDefeated" as const })),
    ...Array.from({ length: 14 }, () => ({ winner: "stalemate" as const, stoppedBy: "stalemate" as const })),
    ...Array.from({ length: 14 }, () => ({ winner: "stalemate" as const, stoppedBy: "maxRounds" as const })),
  ]);
  const total = outcomes.playerWinRate + outcomes.monsterWinRate + outcomes.stalemateRate;
  if (
    Math.abs(outcomes.playerWinRate - 0.48) > 0.0001 ||
    Math.abs(outcomes.monsterWinRate - 0.24) > 0.0001 ||
    Math.abs(outcomes.stalemateRate - 0.28) > 0.0001 ||
    Math.abs(total - 1) > 0.0001
  ) {
    throw new Error(`Outcome rates did not calculate direct stalemate share correctly: ${JSON.stringify(outcomes)}.`);
  }
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
  rangeCategories?: Array<{ rangeCategory: string }>;
  meleePhysicalStrength?: number | null;
  meleeMentalStrength?: number | null;
  attackEffectsMelee?: Array<{ attackEffect: { name: string } }>;
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
        rangeCategories: params.rangeCategories ?? [],
        meleePhysicalStrength: params.meleePhysicalStrength ?? null,
        meleeMentalStrength: params.meleeMentalStrength ?? null,
        attackEffectsMelee: params.attackEffectsMelee ?? [],
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

function makeMonsterRow(overrides: Partial<CombatLabMonsterRow> = {}): CombatLabMonsterRow {
  return {
    id: "synthetic-monster",
    name: "Synthetic Monster",
    level: 5,
    tier: "ELITE",
    legendary: false,
    physicalResilienceMax: 80,
    mentalPerseveranceMax: 80,
    physicalProtection: 10,
    mentalProtection: 0,
    naturalPhysicalProtection: 10,
    naturalMentalProtection: 0,
    attackDie: "D8",
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: "D8",
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D8",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D8",
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: "D8",
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: "D8",
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: 3,
    weaponSkillModifier: 0,
    armorSkillValue: 3,
    armorSkillModifier: 0,
    powers: [],
    naturalAttack: null,
    attacks: [],
    traits: [],
    mainHandItemId: null,
    offHandItemId: null,
    smallItemId: null,
    headArmorItemId: null,
    shoulderArmorItemId: null,
    torsoArmorItemId: null,
    legsArmorItemId: null,
    feetArmorItemId: null,
    headItemId: null,
    neckItemId: null,
    armsItemId: null,
    beltItemId: null,
    ...overrides,
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
  const monsterTuning = {
    ...DEFAULT_COMBAT_TUNING_VALUES,
    protectionK: 4,
    protectionS: 6,
  };
  const { actor } = adaptMonsterToCombatLabActor(makeMonsterRow(), new Map(), monsterTuning);
  if (
    actor.physicalDefenceDice !== 3 ||
    actor.physicalBlockPerSuccess !== 4 ||
    actor.attributeDice.Guard !== "D8"
  ) {
    throw new Error(
      `Monster physical defence hydration did not match Monster Block values: ${JSON.stringify({
        physicalDefenceDice: actor.physicalDefenceDice,
        physicalBlockPerSuccess: actor.physicalBlockPerSuccess,
        guardDie: actor.attributeDice.Guard,
      })}.`,
    );
  }
  if (!actor.hydration.warnings.some((warning) => /Physical Defence: 3 x D8, blocks 4\/success/i.test(warning))) {
    throw new Error("Monster defence summary was not reported in hydration output.");
  }
}

{
  const monsterTuning = {
    ...DEFAULT_COMBAT_TUNING_VALUES,
    protectionK: 4,
    protectionS: 6,
  };
  const shield = itemTemplateToSummoningEquipmentItem(makeBackpackRow({
    id: "ppv-confusion-shield",
    name: "PPV Confusion Shield",
    type: "SHIELD",
    ppv: 10,
  }).partyInventoryItem.itemTemplate);
  const { actor } = adaptMonsterToCombatLabActor(
    makeMonsterRow({
      physicalProtection: 999,
      naturalPhysicalProtection: 0,
      offHandItemId: shield.id,
    }),
    new Map([[shield.id, shield]]),
    monsterTuning,
  );
  if (actor.physicalDefenceDice !== 3 || actor.physicalBlockPerSuccess !== 4) {
    throw new Error("Monster defence hydration confused raw PPV/package value with final block-per-success.");
  }
}

{
  const monsterTuning = {
    ...DEFAULT_COMBAT_TUNING_VALUES,
    protectionK: 4,
    protectionS: 6,
  };
  const { actor: defender } = adaptMonsterToCombatLabActor(makeMonsterRow({
    id: "monster-defence-resolution-target",
    name: "Monster Defence Resolution Target",
  }), new Map(), monsterTuning);
  const attacker = fixtureActor("monster-defence-resolution-attacker", "players", {
    actions: [action({ id: "monster-defence-resolution-hit", diceCount: 5, potency: 4 })],
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: state.actors[0].actions[0],
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0.25, 0.4, 0.8]),
    lane: "main",
  });
  if (
    resolution.defenceStringBlocked !== 8 ||
    resolution.protectionPrevented !== 8 ||
    resolution.netWounds !== 12
  ) {
    throw new Error(`Monster physical defence blocked the wrong amount: ${JSON.stringify(resolution)}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Physical Defence blocked 8 of 20 physical wounds \(4 block per success\)/i, "monster physical block per success transcript");
}

{
  const defensiveShield = makeBackpackRow({
    id: "defensive-shield",
    name: "Defensive Only Shield",
    type: "SHIELD",
    ppv: 6,
    mpv: 3,
    globalAttributeModifiers: [{ attribute: "Armor Skill", amount: 1 }],
  });
  const { actor } = adaptCampaignCharacterToCombatActor(
    makeCharacterRow({
      builderData: makeCharacterBuilderData({ equippedSlots: { offHand: "defensive-shield" } }),
      backpackItems: [defensiveShield],
    }),
    DEFAULT_COMBAT_TUNING_VALUES,
  );
  if (actor.hydration.unsupportedEquipment.length !== 0) {
    throw new Error("Defensive-only shield was counted as unsupported combat equipment.");
  }
  if (!actor.hydration.warnings.some((warning) => warning.includes("contributes defence only; no attack generated"))) {
    throw new Error("Defensive-only shield did not report its info-only hydration note.");
  }
}

{
  const attackShield = makeBackpackRow({
    id: "attack-shield",
    name: "Attack Effect Shield",
    type: "SHIELD",
    ppv: 4,
    rangeCategories: [{ rangeCategory: "MELEE" }],
    meleePhysicalStrength: 1,
    attackEffectsMelee: [{ attackEffect: { name: "Knockdown" } }],
  });
  const { actor } = adaptCampaignCharacterToCombatActor(
    makeCharacterRow({
      builderData: makeCharacterBuilderData({ equippedSlots: { offHand: "attack-shield" } }),
      backpackItems: [attackShield],
    }),
    DEFAULT_COMBAT_TUNING_VALUES,
  );
  if (actor.hydration.unsupportedEquipment.length === 0) {
    throw new Error("Attack-intended shield with unresolved effects was not counted as unsupported equipment.");
  }
}

{
  const base = makeFixturePower({
    id: "open-vein-fixture",
    name: "Open Vein Fixture",
    intention: "ATTACK",
    diceCount: 4,
    potency: 2,
    cooldownTurns: 3,
    durationTurns: undefined,
  });
  const primary = base.effectPackets[0];
  const secondary = {
    ...primary,
    id: "open-vein-fixture-secondary",
    sortOrder: 1,
    packetIndex: 1,
    effectDurationType: "TURNS" as const,
    effectDurationTurns: 2,
  };
  const adapted = adaptPowerToCombatActions({
    ...base,
    effectPackets: [primary, secondary],
    intentions: [primary, secondary],
  });
  if (adapted.actions.length !== 1 || (adapted.actions[0].secondaryActions?.length ?? 0) !== 1) {
    throw new Error("Linked secondary attack packets were not nested under a single top-level power action.");
  }
  if (adapted.actions[0].cooldownRounds !== 3 || adapted.actions[0].secondaryActions?.[0]?.cooldownRounds !== 0) {
    throw new Error("Linked secondary cooldown handling did not keep cooldown on the top-level power only.");
  }
  if (
    !adapted.actions[0].secondaryActions?.[0]?.linkedToPrimary ||
    !adapted.actions[0].secondaryActions?.[0]?.usesPrimaryAppliedSuccesses ||
    !adapted.actions[0].secondaryActions?.[0]?.skipOwnRoll ||
    !adapted.actions[0].secondaryActions?.[0]?.skipOwnDefenceGate
  ) {
    throw new Error("Linked secondary packets were not marked as primary-success riders.");
  }
}

{
  const base = makeFixturePower({
    id: "staggering-style",
    name: "Staggering Strike",
    intention: "CONTROL",
    diceCount: 4,
    potency: 3,
    cooldownTurns: 2,
    statTarget: "Fortitude",
  });
  const primary = {
    ...base.effectPackets[0],
    intention: "CONTROL" as const,
    type: "CONTROL" as const,
    potency: 3,
    targetedAttribute: "FORTITUDE" as const,
    detailsJson: {
      controlMode: "Force no main action",
      controlTheme: "BODY_ENDURANCE",
      controlEffect: "Force No Main Action",
    },
  };
  const secondary = {
    ...primary,
    sortOrder: 1,
    packetIndex: 1,
    intention: "ATTACK" as const,
    type: "ATTACK" as const,
    diceCount: 1,
    potency: 2,
    dealsWounds: true,
    woundChannel: "PHYSICAL" as const,
    detailsJson: {
      attackMode: "PHYSICAL",
      damageTypes: ["Blunt"],
    },
  };
  const adapted = adaptPowerToCombatActions({
    ...base,
    primaryDefenceGate: {
      sourcePacketIndex: 0,
      gateResult: "RESIST",
      protectionChannel: null,
      resistAttribute: "FORTITUDE",
      hostileEntryPattern: "DIRECT",
      resolutionSource: "EXPLICIT",
    },
    effectPackets: [primary, secondary],
    intentions: [primary, secondary],
  });
  const primaryAction = adapted.actions[0];
  const secondaryAction = primaryAction?.secondaryActions?.[0];
  if (!primaryAction || !secondaryAction) {
    throw new Error(`Staggering-style linked power did not adapt: ${JSON.stringify(adapted)}.`);
  }
  if (secondaryAction.potency !== 4 || secondaryAction.effectPerPrimarySuccess !== 4) {
    throw new Error(`Linked secondary did not use rendered/effective wound value 4: ${JSON.stringify(secondaryAction)}.`);
  }
  const state = createCombatState(
    [fixtureActor("CL-L3-Bruiser", "players", { actions: [primaryAction], attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" } })],
    [fixtureActor("Ice Wolf", "monsters", { resist: { FORTITUDE: 0 }, physicalProtection: 0, dodgeDice: 99, physicalDefenceDice: 99, physicalBlockPerSuccess: 99 })],
    { captureTranscript: true },
  );
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: primaryAction,
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0, 0]),
    lane: "power",
  });
  if (resolution.hostileSuccessesBeforeResist !== 4 || resolution.hostileSuccessesAfterResist !== 3 || resolution.netWounds !== 12) {
    throw new Error(`Staggering-style linked secondary resolved incorrectly: ${JSON.stringify(resolution)}.`);
  }
  if (state.transcriptLines.some((line) => /Roll: .*Staggering Strike \(attack\)/i.test(line))) {
    throw new Error("Linked secondary made its own roll.");
  }
  const resistLines = state.transcriptLines.filter((line) => /Resist formula/i.test(line));
  if (resistLines.length !== 1) {
    throw new Error(`Linked secondary created an extra defence/resist gate: ${resistLines.join(" | ")}`);
  }
  expectTranscriptLine(state.transcriptLines, /Applied primary successes: 3/i, "staggering applied primary successes");
  expectTranscriptLine(state.transcriptLines, /Linked effect: Staggering Strike \(attack\) rides 3 applied primary successes\. No secondary roll is made/i, "staggering linked secondary no roll");
  expectTranscriptLine(state.transcriptLines, /Declared damage: 3 applied primary successes x 4 = 12 physical Blunt wounds/i, "staggering effective linked damage");
}

{
  const authoredCooldown = adaptPowerToCombatActions(makeFixturePower({
    id: "authored-cooldown-power",
    name: "Authored Cooldown Power",
    intention: "ATTACK",
    diceCount: 3,
    potency: 2,
    cooldownTurns: 3,
  }));
  if (authoredCooldown.actions[0]?.cooldownRounds !== 3 || authoredCooldown.warnings.length > 0) {
    throw new Error(`Authored cooldown was not preserved: ${JSON.stringify(authoredCooldown)}.`);
  }
}

{
  const reducedCooldown = adaptPowerToCombatActions(makeFixturePower({
    id: "reduced-cooldown-power",
    name: "Reduced Cooldown Power",
    intention: "ATTACK",
    diceCount: 3,
    potency: 2,
    cooldownTurns: 3,
    cooldownReduction: 1,
  }));
  if (reducedCooldown.actions[0]?.cooldownRounds !== 2) {
    throw new Error("Cooldown reduction was not applied through the shared effective cooldown helper.");
  }
}

{
  const missingCooldownPower = {
    ...makeFixturePower({
      id: "missing-cooldown-power",
      name: "Missing Cooldown Power",
      intention: "ATTACK",
      diceCount: 3,
      potency: 2,
    }),
    cooldownTurns: undefined as unknown as number,
  };
  const adapted = adaptPowerToCombatActions(missingCooldownPower);
  if (
    adapted.actions[0]?.cooldownRounds !== 1 ||
    !adapted.warnings.some((warning) => /Missing Cooldown Power.*fallback cooldown 1/i.test(warning))
  ) {
    throw new Error(`Missing cooldown fallback was not reported: ${JSON.stringify(adapted)}.`);
  }
}

{
  const counterPower = adaptPowerToCombatActions({
    ...makeFixturePower({
      id: "authored-counter-cooldown",
      name: "Authored Counter Cooldown",
      intention: "ATTACK",
      diceCount: 3,
      potency: 2,
      cooldownTurns: 2,
    }),
    counterMode: "YES",
  });
  if (counterPower.actions[0]?.cooldownRounds !== 2 || counterPower.actions[0]?.counterMode !== true) {
    throw new Error("Counter power did not preserve its authored cooldown.");
  }
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
  if (resolution.dodgeChosen !== 1 || resolution.dodgeRolls !== 1 || resolution.woundsAvoidedByDodge !== 4 || resolution.netWounds !== 0) {
    throw new Error("Dodge did not use Guard dice to fully avoid a matching attack.");
  }
}

{
  const attacker = fixtureActor("tank-policy-attacker", "players");
  const defender = fixtureActor("tank-policy-defender", "monsters", {
    dodgeDice: 1,
    physicalDefenceDice: 6,
    physicalBlockPerSuccess: 4,
  });
  const state = createCombatState([attacker], [defender]);
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ diceCount: 1, potency: 4 }),
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]),
  });
  if (resolution.physicalDefenceChosen !== 1 || resolution.dodgeChosen !== 0) {
    throw new Error("Monster-like high-physical-defence defender did not choose physical defence over dodge.");
  }
}

{
  const attacker = fixtureActor("fragile-policy-attacker", "players");
  const defender = fixtureActor("fragile-policy-defender", "monsters", {
    dodgeDice: 6,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 1,
  });
  const state = createCombatState([attacker], [defender]);
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ diceCount: 1, potency: 4 }),
    rng: rngFrom([0.99, 0.99, 0.99]),
  });
  if (resolution.dodgeChosen !== 1 || resolution.physicalDefenceChosen !== 0) {
    throw new Error("Monster-like high-dodge defender did not choose dodge over weak physical defence.");
  }
}

{
  const attacker = fixtureActor("degraded-policy-attacker", "players");
  const defender = fixtureActor("degraded-policy-defender", "monsters", {
    dodgeDice: 5,
    physicalDefenceDice: 3,
    physicalBlockPerSuccess: 2,
  });
  const fresh = createCombatState([attacker], [defender]);
  const first = resolveCombatAction({
    state: fresh,
    actor: fresh.actors[0],
    target: fresh.actors[1],
    action: action({ diceCount: 1, potency: 4 }),
    rng: rngFrom([0.99, 0.99, 0.99]),
  });
  const degraded = createCombatState([attacker], [defender]);
  degraded.defenceDegradation[degraded.actors[1].id] = { dodge: 4, physical: 0, mental: 0 };
  const second = resolveCombatAction({
    state: degraded,
    actor: degraded.actors[0],
    target: degraded.actors[1],
    action: action({ diceCount: 1, potency: 4 }),
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99]),
  });
  if (first.dodgeChosen !== 1 || second.physicalDefenceChosen !== 1) {
    throw new Error("Monster defence choice did not switch away from degraded dodge.");
  }
}

{
  const playerDefender = fixtureActor("symmetry-player-defender", "players", {
    dodgeDice: 1,
    physicalDefenceDice: 6,
    physicalBlockPerSuccess: 4,
  });
  const monsterDefender = fixtureActor("symmetry-monster-defender", "monsters", {
    dodgeDice: 1,
    physicalDefenceDice: 6,
    physicalBlockPerSuccess: 4,
  });
  const monsterAttacker = fixtureActor("symmetry-monster-attacker", "monsters");
  const playerAttacker = fixtureActor("symmetry-player-attacker", "players");

  const playerDefenceState = createCombatState([playerDefender], [monsterAttacker]);
  const playerDefence = resolveCombatAction({
    state: playerDefenceState,
    actor: playerDefenceState.actors[1],
    target: playerDefenceState.actors[0],
    action: action({ diceCount: 1, potency: 4 }),
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]),
  });

  const monsterDefenceState = createCombatState([playerAttacker], [monsterDefender]);
  const monsterDefence = resolveCombatAction({
    state: monsterDefenceState,
    actor: monsterDefenceState.actors[0],
    target: monsterDefenceState.actors[1],
    action: action({ diceCount: 1, potency: 4 }),
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]),
  });

  if (
    playerDefence.physicalDefenceChosen !== 1 ||
    monsterDefence.physicalDefenceChosen !== 1 ||
    playerDefence.dodgeChosen !== monsterDefence.dodgeChosen ||
    playerDefence.defenceStringBlocked !== monsterDefence.defenceStringBlocked
  ) {
    throw new Error("Player and monster defenders did not use the same best-defence decision path.");
  }
}

{
  const player = fixtureActor("side-metric-player", "players", {
    dodgeDice: 1,
    physicalDefenceDice: 6,
    physicalBlockPerSuccess: 4,
    actions: [action({ id: "side-metric-player-attack", diceCount: 1, potency: 1 })],
  });
  const monster = fixtureActor("side-metric-monster", "monsters", {
    dodgeDice: 20,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 1,
    actions: [action({ id: "side-metric-monster-attack", diceCount: 10, potency: 4 })],
  });
  const run = runCombatScenario({
    name: "side defence metric fixture",
    players: [player],
    monsters: [monster],
    runs: 1,
    seed: 707,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  if (
    run.metrics.dodgeChosen.monsters <= 0 ||
    run.metrics.physicalDefenceChosen.players <= 0 ||
    run.metrics.dodgeChosen.players !== 0 ||
    run.metrics.physicalDefenceChosen.monsters !== 0
  ) {
    throw new Error(`Defence choice metrics did not report player/monster side decisions separately: dodge ${JSON.stringify(run.metrics.dodgeChosen)}, physical ${JSON.stringify(run.metrics.physicalDefenceChosen)}.`);
  }
}

{
  const weapon = action({ id: "shield-policy-fallback", name: "Fallback Strike", sourceType: "equippedWeapon" });
  const mentalShield = action({
    id: "mental-shield-policy",
    name: "Mental Fortress",
    sourceType: "power",
    kind: "defence",
    targetPolicy: "self",
    pool: "mental",
    protection: 4,
    diceCount: 3,
  });
  const actor = fixtureActor("mental-shield-policy-actor", "players", { actions: [weapon, mentalShield] });
  const physicalEnemy = fixtureActor("physical-only-threat", "monsters", {
    actions: [action({ id: "physical-threat-hit", name: "Physical Threat Hit", pool: "physical" })],
  });
  const state = createCombatState([actor], [physicalEnemy]);
  if (chooseTurnAction(state.actors[0], state, "power")?.id === mentalShield.id) {
    throw new Error("Mental defence power was treated as useful against physical-only enemies.");
  }
}

{
  const physicalShield = action({
    id: "physical-shield-policy",
    name: "Body Ward",
    sourceType: "power",
    kind: "defence",
    targetPolicy: "self",
    pool: "physical",
    protection: 4,
    diceCount: 3,
  });
  const actor = fixtureActor("physical-shield-policy-actor", "players", { actions: [physicalShield] });
  const physicalEnemy = fixtureActor("physical-threat", "monsters", {
    actions: [action({ id: "physical-threat-hit", pool: "physical" })],
  });
  const state = createCombatState([actor], [physicalEnemy]);
  if (chooseTurnAction(state.actors[0], state, "power")?.id !== physicalShield.id) {
    throw new Error("Physical defence power was not useful against physical enemies.");
  }
}

{
  const mentalShield = action({
    id: "mental-threat-shield",
    name: "Mental Fortress",
    sourceType: "power",
    kind: "defence",
    targetPolicy: "self",
    pool: "mental",
    protection: 4,
    diceCount: 3,
  });
  const actor = fixtureActor("mental-threat-shield-actor", "players", { actions: [mentalShield] });
  const mentalEnemy = fixtureActor("mental-threat", "monsters", {
    actions: [action({ id: "mental-threat-hit", pool: "mental", accuracyAttribute: "Intellect" })],
  });
  const state = createCombatState([actor], [mentalEnemy]);
  if (chooseTurnAction(state.actors[0], state, "power")?.id !== mentalShield.id) {
    throw new Error("Mental defence power was not useful against mental enemies.");
  }
}

{
  const attacker = fixtureActor("guard-debuff-physical-attacker", "players");
  const defender = fixtureActor("guard-debuff-physical-defender", "monsters", {
    dodgeDice: 1,
    physicalDefenceDice: 6,
    physicalBlockPerSuccess: 3,
  });
  const state = createCombatState([attacker], [defender]);
  state.statusEffects.push({
    id: "guard-debuff-physical",
    sourceActorId: state.actors[0].id,
    targetActorId: state.actors[1].id,
    kind: "debuff",
    attribute: "Guard",
    amount: 2,
    remainingRounds: 2,
  });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ diceCount: 1, potency: 4 }),
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]),
  });
  if (resolution.physicalDefenceChosen !== 1 || resolution.debuffedDefenceRolls !== 1) {
    throw new Error("Guard debuff did not affect and report physical defence rolls.");
  }
}

{
  const attacker = fixtureActor("guard-debuff-dodge-attacker", "players");
  const defender = fixtureActor("guard-debuff-dodge-defender", "monsters", {
    dodgeDice: 4,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 0,
  });
  const state = createCombatState([attacker], [defender]);
  state.statusEffects.push({
    id: "guard-debuff-dodge",
    sourceActorId: state.actors[0].id,
    targetActorId: state.actors[1].id,
    kind: "debuff",
    attribute: "Guard",
    amount: 2,
    remainingRounds: 2,
  });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ diceCount: 1, potency: 4 }),
    rng: rngFrom([0.99, 0.99, 0.99, 0.99]),
  });
  if (resolution.dodgeChosen !== 1 || resolution.debuffedDefenceRolls !== 1) {
    throw new Error("Guard debuff did not affect and report dodge rolls.");
  }
}

{
  const attacker = fixtureActor("bravery-debuff-mental-attacker", "players");
  const defender = fixtureActor("bravery-debuff-mental-defender", "monsters", {
    dodgeDice: 1,
    mentalDefenceDice: 6,
    mentalBlockPerSuccess: 3,
    resist: { BRAVERY: 0 },
  });
  const mentalDefenceState = createCombatState([attacker], [defender]);
  mentalDefenceState.statusEffects.push({
    id: "bravery-debuff-mental-defence",
    sourceActorId: mentalDefenceState.actors[0].id,
    targetActorId: mentalDefenceState.actors[1].id,
    kind: "debuff",
    attribute: "Bravery",
    amount: 2,
    remainingRounds: 2,
  });
  const defenceResolution = resolveCombatAction({
    state: mentalDefenceState,
    actor: mentalDefenceState.actors[0],
    target: mentalDefenceState.actors[1],
    action: action({ pool: "mental", accuracyAttribute: "Intellect", diceCount: 1, potency: 4 }),
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]),
  });
  if (defenceResolution.mentalDefenceChosen !== 1 || defenceResolution.debuffedDefenceRolls !== 1) {
    throw new Error("Bravery debuff did not affect and report mental defence rolls.");
  }

  const resistState = createCombatState([attacker], [defender]);
  resistState.statusEffects.push({
    id: "bravery-debuff-resist",
    sourceActorId: resistState.actors[0].id,
    targetActorId: resistState.actors[1].id,
    kind: "debuff",
    attribute: "Bravery",
    amount: 2,
    remainingRounds: 2,
  });
  const resistResolution = resolveCombatAction({
    state: resistState,
    actor: resistState.actors[0],
    target: resistState.actors[1],
    action: action({ kind: "control", diceCount: 3, potency: 1, resistAttribute: "BRAVERY" }),
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0.99]),
  });
  if (resistResolution.resistRolls !== 1 || resistResolution.debuffedResistRolls !== 1) {
    throw new Error("Bravery debuff did not affect and report resist rolls.");
  }
}

{
  const attacker = fixtureActor("pool-mismatch-attacker", "players");
  const defender = fixtureActor("pool-mismatch-defender", "monsters", {
    dodgeDice: 1,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 0,
    physicalProtection: 0,
  });
  const state = createCombatState([attacker], [defender]);
  state.statusEffects.push({
    id: "mental-protection-only",
    sourceActorId: state.actors[1].id,
    targetActorId: state.actors[1].id,
    kind: "protection",
    pool: "mental",
    amount: 999,
    remainingRounds: 2,
  });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ pool: "physical", diceCount: 2, potency: 3 }),
    rng: rngFrom([0.99, 0.99, 0, 0]),
  });
  if (resolution.staticProtectionPrevented > 0 || resolution.netWounds <= 0) {
    throw new Error("Mental defence power incorrectly blocked physical wounds.");
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
  if (resolution.resistRolls !== 1 || resolution.hostileSuccessesCancelledByResist !== 1 || resolution.controlTurnsApplied !== 2) {
    throw new Error("Resist did not cancel hostile successes success-by-success.");
  }
}

{
  const weapon = action({ id: "lane-weapon", name: "Lane Weapon", sourceType: "equippedWeapon", diceCount: 2, potency: 1 });
  const mark = action({
    id: "lane-mark",
    name: "Mark da target!",
    sourceType: "power",
    kind: "debuff",
    targetPolicy: "enemy",
    diceCount: 1,
    potency: 1,
    modifier: { attribute: "Guard", amount: 1, durationRounds: 2 },
    cooldownRounds: 2,
  });
  const actor = fixtureActor("lane-actor", "players", { actions: [weapon, mark] });
  const state = createCombatState([actor], [fixtureActor("lane-target", "monsters")]);
  if (chooseTurnAction(state.actors[0], state, "main")?.id !== weapon.id) {
    throw new Error("Main action did not prefer weapon/natural attack.");
  }
  if (chooseTurnAction(state.actors[0], state, "power")?.id !== mark.id) {
    throw new Error("Power action did not choose ready debuff power.");
  }
  const run = runCombatScenario({
    name: "main plus power action fixture",
    players: [actor],
    monsters: [fixtureActor("lane-run-target", "monsters")],
    runs: 1,
    seed: 741,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  if (run.metrics.mainActionsUsed.players !== 1 || run.metrics.powerActionsUsed.players !== 1) {
    throw new Error("Actor with weapon and ready power did not use both main and power lanes.");
  }
}

{
  const weapon = action({ id: "fallback-weapon", name: "Fallback Weapon", sourceType: "naturalAttack" });
  const power = action({
    id: "cooling-power",
    name: "Cooling Power",
    sourceType: "power",
    kind: "attack",
    cooldownRounds: 2,
  });
  const actor = fixtureActor("cooldown-fallback-actor", "players", { actions: [weapon, power] });
  const state = createCombatState([actor], [fixtureActor("cooldown-fallback-target", "monsters")]);
  setCooldown(state, state.actors[0].id, power.id, 2);
  if (chooseTurnAction(state.actors[0], state, "power")?.id !== weapon.id) {
    throw new Error("Power lane did not fall back to second weapon/natural attack while power was cooling down.");
  }
}

{
  const weapon = action({ id: "waste-weapon", name: "Waste Weapon", sourceType: "equippedWeapon" });
  const cleanse = action({ id: "waste-cleanse", name: "Waste Cleanse", sourceType: "power", kind: "cleanse", targetPolicy: "ally" });
  const heal = action({ id: "waste-heal", name: "Waste Heal", sourceType: "power", kind: "healing", targetPolicy: "ally" });
  const actor = fixtureActor("waste-actor", "players", { actions: [weapon, cleanse, heal] });
  const state = createCombatState([actor], [fixtureActor("waste-target", "monsters")]);
  const chosen = chooseTurnAction(state.actors[0], state, "power");
  if (chosen?.id === cleanse.id || chosen?.id === heal.id) {
    throw new Error("Power lane used cleanse/heal when there was no removable effect or wounded ally.");
  }
}

{
  const players = Array.from({ length: 4 }, (_, index) =>
    fixtureActor(`spread-player-${index + 1}`, "players", {
      physicalHpMax: 999,
      mentalHpMax: 999,
      actionsPerTurn: 0,
      actions: [],
    }),
  );
  const minions = createActorInstances(
    fixtureActor("spread-minion", "monsters", {
      name: "Spread Minion",
      role: "Minion",
      actions: [action({ id: "spread-minion-attack", sourceType: "naturalAttack", diceCount: 3, potency: 1 })],
    }),
    12,
  );
  const run = runCombatScenario({
    name: "minion target spread fixture",
    players,
    monsters: minions,
    runs: 1,
    seed: 742,
    maxRounds: 1,
    turnOrder: "monstersFirst",
  });
  const attacksByPlayer = players.map(
    (player) => run.metrics.defensiveContributions[player.id]?.attacksDefended ?? 0,
  );
  if (attacksByPlayer.some((count) => count === 0) || Math.max(...attacksByPlayer) - Math.min(...attacksByPlayer) > 2) {
    throw new Error(`Minion attacks did not distribute across all defenders: ${attacksByPlayer.join(", ")}.`);
  }
}

{
  const mark = action({
    id: "gobbo-mark",
    name: "Mark da target!",
    sourceType: "power",
    kind: "debuff",
    targetPolicy: "enemy",
    diceCount: 1,
    potency: 1,
    modifier: { attribute: "Guard", amount: 1, durationRounds: 2 },
    cooldownRounds: 2,
  });
  const gobbos = createActorInstances(
    fixtureActor("gobbo-like", "monsters", {
      name: "Gobbo Scout",
      role: "Minion",
      actions: [
        action({ id: "gobbo-stab", name: "Gobbo Stab", sourceType: "naturalAttack", diceCount: 2, potency: 1 }),
        mark,
      ],
    }),
    4,
  );
  const report = runScenarioSuite({
    name: "gobbo mark power fixture",
    players: Array.from({ length: 4 }, (_, index) => fixtureActor(`gobbo-target-${index + 1}`, "players", { physicalHpMax: 999, mentalHpMax: 999, actionsPerTurn: 0, actions: [] })),
    monsters: gobbos,
    runs: 1,
    seed: 743,
    maxRounds: 1,
    turnOrder: "monstersFirst",
  });
  const markUses = report.cooldownTrace
    .filter((trace) => trace.actionName === "Mark da target!")
    .reduce((sum, trace) => sum + trace.uses, 0);
  if (markUses <= 0 || report.averageMechanics.powerActionsUsed.monsters <= 0) {
    throw new Error("Gobbo-like minions did not use ready Mark da target! power.");
  }
}

{
  const mark = action({
    id: "gobbo-mark-report",
    name: "Mark da target!",
    sourceType: "power",
    kind: "debuff",
    targetPolicy: "enemy",
    diceCount: 1,
    potency: 1,
    modifier: { attribute: "Guard", amount: 1, durationRounds: 2 },
    cooldownRounds: 2,
  });
  const player = fixtureActor("marked-player-defender", "players", {
    physicalHpMax: 999,
    mentalHpMax: 999,
    dodgeDice: 1,
    physicalDefenceDice: 5,
    physicalBlockPerSuccess: 3,
    actions: [],
  });
  const gobbo = fixtureActor("gobbo-mark-reporter", "monsters", {
    name: "Gobbo Mark Reporter",
    role: "Minion",
    actions: [
      action({ id: "gobbo-report-stab", name: "Gobbo Stab", sourceType: "naturalAttack", diceCount: 2, potency: 1 }),
      mark,
    ],
  });
  const report = runScenarioSuite({
    name: "gobbo mark defence debuff report fixture",
    players: [player],
    monsters: [gobbo],
    runs: 1,
    seed: 744,
    maxRounds: 2,
    turnOrder: "monstersFirst",
  });
  const markContribution = report.actorContributions
    .find((entry) => entry.actorId === gobbo.id)
    ?.actionContributions.find((entry) => entry.actionId === mark.id);
  if (!markContribution || markContribution.debuffApplications <= 0 || report.averageMechanics.debuffedDefenceRolls.players <= 0) {
    throw new Error("Mark da target! did not report both debuff application and affected player defence rolls.");
  }
}

{
  const state = createCombatState([fixtureActor("cooldown-a", "players")], [fixtureActor("cooldown-b", "monsters")]);
  setCooldown(state, "cooldown-a", "power", 2);
  setCooldown(state, "cooldown-b", "power", 2);
  tickActorCooldowns(state, "cooldown-a");
  if (state.cooldowns["cooldown-a:power"]?.remaining !== 1 || state.cooldowns["cooldown-b:power"]?.remaining !== 2) {
    throw new Error("Cooldowns ticked for a non-active actor.");
  }
}

{
  const coolingPower = action({
    id: "same-turn-cooldown-power",
    name: "Same Turn Cooldown Power",
    sourceType: "power",
    kind: "attack",
    diceCount: 1,
    potency: 1,
    cooldownRounds: 2,
  });
  const actor = fixtureActor("same-turn-cooldown-actor", "players", { actions: [coolingPower] });
  const target = fixtureActor("same-turn-cooldown-target", "monsters", {
    dodgeDice: 1,
    physicalProtection: 0,
  });
  const state = createCombatState([actor], [target], { captureTranscript: true });
  state.currentTurnActorId = state.actors[0].id;
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: coolingPower,
    rng: rngFrom([0.99, 0]),
    lane: "power",
  });
  tickActorCooldowns(state, state.actors[0].id);
  if (getActionCooldownRemaining(state, state.actors[0].id, coolingPower.id) !== 2) {
    throw new Error("Cooldown ticked on the same owner turn it was applied.");
  }
  expectTranscriptLine(state.transcriptLines, /Cooldown tick skipped: Same Turn Cooldown Power entered cooldown this turn/i, "same-turn cooldown skip");
  state.currentTurnActorId = state.actors[1].id;
  state.round += 1;
  tickActorCooldowns(state, state.actors[0].id);
  if (getActionCooldownRemaining(state, state.actors[0].id, coolingPower.id) !== 1) {
    throw new Error("Cooldown did not tick on the next eligible owner turn.");
  }
}

{
  const adapted = adaptPowerToCombatActions(makeFixturePower({
    id: "transcript-cooldown-three-power",
    name: "Transcript Cooldown Three",
    intention: "ATTACK",
    diceCount: 1,
    potency: 1,
    cooldownTurns: 3,
  }));
  const coolingPower = adapted.actions[0];
  if (!coolingPower) throw new Error("Cooldown transcript power did not adapt to a combat action.");
  const actor = fixtureActor("transcript-cooldown-three-actor", "players", { actions: [coolingPower] });
  const target = fixtureActor("transcript-cooldown-three-target", "monsters", {
    dodgeDice: 1,
    physicalProtection: 0,
  });
  const state = createCombatState([actor], [target], { captureTranscript: true });
  state.currentTurnActorId = state.actors[0].id;
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: coolingPower,
    rng: rngFrom([0.99, 0]),
    lane: "power",
  });
  tickActorCooldowns(state, state.actors[0].id);
  if (getActionCooldownRemaining(state, state.actors[0].id, coolingPower.id) !== 3) {
    throw new Error("Authored cooldown 3 ticked on the same turn it was applied.");
  }
  expectTranscriptLine(state.transcriptLines, /Cooldown: Transcript Cooldown Three enters cooldown 3/i, "authored cooldown transcript");
  expectTranscriptLine(state.transcriptLines, /Cooldown tick skipped: Transcript Cooldown Three entered cooldown this turn/i, "authored cooldown same-turn skip");
  for (const expected of [
    { round: 2, remaining: 2, line: /Cooldown tick: Transcript Cooldown Three 3 -> 2/i },
    { round: 3, remaining: 1, line: /Cooldown tick: Transcript Cooldown Three 2 -> 1/i },
    { round: 4, remaining: 0, line: /Cooldown tick: Transcript Cooldown Three 1 -> 0/i },
  ]) {
    state.round = expected.round;
    state.currentTurnActorId = state.actors[0].id;
    tickActorCooldowns(state, state.actors[0].id);
    if (getActionCooldownRemaining(state, state.actors[0].id, coolingPower.id) !== expected.remaining) {
      throw new Error(`Authored cooldown 3 did not count down to ${expected.remaining}.`);
    }
    expectTranscriptLine(state.transcriptLines, expected.line, `authored cooldown countdown ${expected.round}`);
  }
  expectTranscriptLine(state.transcriptLines, /Cooldown ready: Transcript Cooldown Three is ready next turn/i, "authored cooldown ready");
  const trace = state.cooldownTrace[`${state.actors[0].id}:${coolingPower.id}`];
  if (trace?.cooldownRounds !== 3) {
    throw new Error(`Cooldown trace did not preserve authored cooldown 3: ${JSON.stringify(trace)}.`);
  }
}

{
  const counterstrike = action({
    id: "owner-turn-response-counterstrike",
    name: "Owner Turn Response Counterstrike",
    kind: "attack",
    counterMode: true,
    targetPolicy: "enemy",
    diceCount: 2,
    potency: 2,
    cooldownRounds: 2,
  });
  const defender = fixtureActor("owner-turn-response-defender", "players", {
    physicalHpMax: 999,
    dodgeDice: 1,
    actions: [counterstrike],
  });
  const attacker = fixtureActor("owner-turn-response-attacker", "monsters", {
    physicalHpMax: 999,
    actions: [action({ id: "owner-turn-response-trigger", diceCount: 2, potency: 1 })],
  });
  const state = createCombatState([defender], [attacker], { captureTranscript: true });
  state.currentTurnActorId = state.actors[1].id;
  refreshActorResponses(state, state.actors[0].id);
  resolveCombatAction({
    state,
    actor: state.actors[1],
    target: state.actors[0],
    action: state.actors[1].actions[0],
    rng: rngFrom([0.99, 0, 0, 0.99, 0.99]),
  });
  tickActorCooldowns(state, state.actors[1].id);
  if (getActionCooldownRemaining(state, state.actors[0].id, counterstrike.id) !== 2) {
    throw new Error("Response cooldown ticked at the end of the attacker's turn.");
  }
  state.currentTurnActorId = state.actors[0].id;
  state.round += 1;
  refreshActorResponses(state, state.actors[0].id);
  if (state.responsesRemaining[state.actors[0].id] !== 2 || !isActionOnCooldown(state, state.actors[0].id, counterstrike.id)) {
    throw new Error("Response refresh bypassed counter cooldown.");
  }
  tickActorCooldowns(state, state.actors[0].id);
  if (getActionCooldownRemaining(state, state.actors[0].id, counterstrike.id) !== 1) {
    throw new Error("Response cooldown did not tick on the owner's next turn end.");
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
  const counterstrike = action({
    id: "cooldown-counterstrike",
    name: "Cooldown Counterstrike",
    kind: "attack",
    counterMode: true,
    targetPolicy: "enemy",
    diceCount: 4,
    potency: 2,
    cooldownRounds: 2,
  });
  const defender = fixtureActor("cooldown-counter-defender", "players", {
    physicalHpMax: 999,
    mentalHpMax: 999,
    dodgeDice: 1,
    actions: [counterstrike],
  });
  const attacker = fixtureActor("cooldown-counter-attacker", "monsters", {
    physicalHpMax: 999,
    mentalHpMax: 999,
    actions: [action({ id: "cooldown-trigger-attack", diceCount: 4, potency: 1 })],
  });
  const state = createCombatState([defender], [attacker]);
  refreshActorResponses(state, state.actors[0].id);
  resolveCombatAction({
    state,
    actor: state.actors[1],
    target: state.actors[0],
    action: state.actors[1].actions[0],
    rng: rngFrom([0.99, 0, 0.99, 0.99, 0.99, 0.99]),
  });
  state.round += 1;
  refreshActorResponses(state, state.actors[0].id);
  resolveCombatAction({
    state,
    actor: state.actors[1],
    target: state.actors[0],
    action: state.actors[1].actions[0],
    rng: rngFrom([0.99, 0, 0.99]),
  });
  tickActorCooldowns(state, state.actors[0].id);
  const trace = Object.values(state.cooldownTrace).find((entry) => entry.actionId === counterstrike.id);
  if (
    !trace ||
    trace.uses !== 1 ||
    trace.preventedByCooldown < 1 ||
    trace.cooldownApplied !== 1 ||
    trace.cooldownTicks !== 1 ||
    getActionCooldownRemaining(state, state.actors[0].id, counterstrike.id) !== 1
  ) {
    throw new Error(`Cooldown 2 counter was not enforced across incoming attacks: ${JSON.stringify(trace)}.`);
  }
}

{
  const counterstrike = action({
    id: "response-refresh-counterstrike",
    name: "Response Refresh Counterstrike",
    kind: "attack",
    counterMode: true,
    targetPolicy: "enemy",
    diceCount: 4,
    potency: 2,
    cooldownRounds: 2,
  });
  const defender = fixtureActor("response-refresh-defender", "monsters", {
    actions: [counterstrike],
  });
  const attacker = fixtureActor("response-refresh-attacker", "players", {
    actions: [action({ id: "response-refresh-trigger", diceCount: 4, potency: 1 })],
  });
  const state = createCombatState([attacker], [defender]);
  refreshActorResponses(state, state.actors[1].id);
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: state.actors[0].actions[0],
    rng: rngFrom([0.99, 0, 0.99, 0.99, 0.99]),
  });
  refreshActorResponses(state, state.actors[1].id);
  if (
    resolution.counterUses !== 1 ||
    state.responsesRemaining[state.actors[1].id] !== 2 ||
    !isActionOnCooldown(state, state.actors[1].id, counterstrike.id)
  ) {
    throw new Error("Refreshing Responses incorrectly refreshed or bypassed counter cooldown.");
  }
}

{
  const normalPower = action({
    id: "normal-cooldown-power",
    name: "Normal Cooldown Power",
    diceCount: 4,
    potency: 1,
    cooldownRounds: 2,
  });
  const counterPower = action({
    id: "counter-cooldown-power",
    name: "Counter Cooldown Power",
    kind: "attack",
    counterMode: true,
    targetPolicy: "enemy",
    diceCount: 4,
    potency: 1,
    cooldownRounds: 2,
  });
  const normalActor = fixtureActor("normal-cooldown-actor", "players", { actions: [normalPower] });
  const counterActor = fixtureActor("counter-cooldown-actor", "monsters", { actions: [counterPower] });
  const state = createCombatState([normalActor], [counterActor]);
  refreshActorResponses(state, state.actors[1].id);
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: state.actors[0].actions[0],
    rng: rngFrom([0.99, 0, 0.99]),
  });
  if (
    getActionCooldownRemaining(state, state.actors[0].id, normalPower.id) !== 2 ||
    getActionCooldownRemaining(state, state.actors[1].id, counterPower.id) !== 2
  ) {
    throw new Error("Normal and counter powers did not apply cooldown through the same remaining-value path.");
  }
  const normalTrace = state.cooldownTrace[`${state.actors[0].id}:${normalPower.id}`];
  const counterTrace = state.cooldownTrace[`${state.actors[1].id}:${counterPower.id}`];
  if (normalTrace?.cooldownApplied !== 1 || counterTrace?.cooldownApplied !== 1) {
    throw new Error("Normal and counter powers did not both record cooldown application.");
  }
}

{
  const counterstrike = action({
    id: "report-cooldown-counterstrike",
    name: "Report Cooldown Counterstrike",
    kind: "attack",
    counterMode: true,
    targetPolicy: "enemy",
    diceCount: 3,
    potency: 2,
    cooldownRounds: 2,
  });
  const report = runScenarioSuite({
    name: "cooldown trace report fixture",
    players: [
      fixtureActor("report-cooldown-defender", "players", {
        physicalHpMax: 999,
        mentalHpMax: 999,
        actions: [counterstrike],
      }),
    ],
    monsters: [
      fixtureActor("report-cooldown-attacker", "monsters", {
        physicalHpMax: 999,
        mentalHpMax: 999,
        actions: [action({ id: "report-cooldown-trigger", diceCount: 1, potency: 1 })],
      }),
    ],
    runs: 2,
    seed: 823,
    maxRounds: 2,
    turnOrder: "monstersFirst",
  });
  const trace = report.cooldownTrace.find((entry) => entry.actionId === counterstrike.id);
  if (!trace || trace.uses <= 0 || trace.cooldownTicks <= 0) {
    throw new Error("Cooldown trace was not exposed in the merged report.");
  }
}

{
  const baseMonster = fixtureActor("quantity-gobbo", "monsters", {
    name: "Gobbo Scout",
    hydration: {
      source: "campaignMonster",
      realData: true,
      warnings: [],
      unsupportedEquipment: [],
      unsupportedTraits: [],
      ignoredTraits: [],
      unsupportedCombatTraits: [],
      fallbackActions: [],
    },
  });
  const instances = createActorInstances(baseMonster, 3);
  if (
    instances.length !== 3 ||
    new Set(instances.map((actor) => actor.id)).size !== 3 ||
    instances[0]?.name !== "Gobbo Scout #1" ||
    instances[2]?.instanceIndex !== 3 ||
    instances.some((actor) => actor.baseActorId !== baseMonster.id || actor.displayGroupName !== "Gobbo Scout")
  ) {
    throw new Error("Monster quantity expansion did not create distinguishable runtime instances.");
  }
}

{
  const attacker = fixtureActor("quantity-attacker", "players", {
    actions: [action({ id: "quantity-hit", diceCount: 4, potency: 2 })],
  });
  const instances = createActorInstances(fixtureActor("quantity-target", "monsters", { name: "Gobbo Scout" }), 2);
  const state = createCombatState([attacker], instances);
  const firstMonster = state.actors.find((actor) => actor.id === instances[0]?.id);
  const secondMonster = state.actors.find((actor) => actor.id === instances[1]?.id);
  if (!firstMonster || !secondMonster) throw new Error("Quantity state did not include monster instances.");
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: firstMonster,
    action: state.actors[0].actions[0],
    rng: rngFrom([0.99, 0, 0.99]),
  });
  if (
    firstMonster.physicalHpCurrent >= firstMonster.physicalHpMax ||
    secondMonster.physicalHpCurrent !== secondMonster.physicalHpMax
  ) {
    throw new Error("Damaging one monster instance leaked state into another instance.");
  }
  firstMonster.physicalHpCurrent = 0;
  markDefeatedActors(state);
  if (!firstMonster.defeated || secondMonster.defeated) {
    throw new Error("Defeating one monster instance defeated another instance.");
  }
}

{
  const players = Array.from({ length: 4 }, (_, index) =>
    fixtureActor(`turn-player-${index + 1}`, "players", {
      actionsPerTurn: 0,
      actions: [],
      physicalHpMax: 999,
      mentalHpMax: 999,
    }),
  );
  const minions = createActorInstances(
    fixtureActor("turn-minion", "monsters", {
      name: "Turn Minion",
      actions: [action({ id: "turn-minion-attack", diceCount: 1, potency: 1 })],
    }),
    12,
  );
  const run = runCombatScenario({
    name: "4 players vs 12 quantity minions turn count",
    players,
    monsters: minions,
    runs: 1,
    seed: 771,
    maxRounds: 1,
    turnOrder: "alternatingByRound",
  });
  if (
    run.metrics.mainActionsUsed.monsters !== 12 ||
    run.metrics.powerActionsUsed.monsters !== 12 ||
    run.metrics.secondWeaponAttacksUsed.monsters !== 12
  ) {
    throw new Error(
      `Expected 12 monster turns with main plus fallback power-lane attacks, got main ${run.metrics.mainActionsUsed.monsters}, power ${run.metrics.powerActionsUsed.monsters}, second weapon ${run.metrics.secondWeaponAttacksUsed.monsters}.`,
    );
  }
}

{
  const player = fixtureActor("pressure-player", "players", {
    physicalHpMax: 999,
    mentalHpMax: 999,
    dodgeDice: 1,
    physicalDefenceDice: 3,
    physicalBlockPerSuccess: 1,
  });
  const minions = createActorInstances(
    fixtureActor("pressure-minion", "monsters", {
      actions: [action({ id: "pressure-attack", diceCount: 4, potency: 1 })],
    }),
    3,
  );
  const state = createCombatState([player], minions);
  const target = state.actors[0];
  for (const attacker of state.actors.filter((actor) => actor.side === "monsters")) {
    resolveCombatAction({
      state,
      actor: attacker,
      target,
      action: attacker.actions[0],
      rng: rngFrom([0.99, 0, 0.99]),
    });
  }
  const degradation = state.defenceDegradation[target.id];
  if (!degradation || degradation.dodge + degradation.physical + degradation.mental <= 1) {
    throw new Error("Multiple monster instances did not accumulate defender degradation pressure.");
  }
}

{
  const aoe = action({
    id: "quantity-aoe",
    name: "Quantity AOE",
    rangeCategory: "AOE",
    targetCount: 4,
    diceCount: 4,
    potency: 1,
  });
  const player = fixtureActor("quantity-aoe-player", "players", { actions: [aoe] });
  const minions = createActorInstances(fixtureActor("quantity-aoe-minion", "monsters", { name: "AOE Minion" }), 12);
  const state = createCombatState([player], minions);
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: aoe,
    rng: rngFrom([0.99, 0, 0.99]),
  });
  if (resolution.aoeActualTargets !== 2) {
    throw new Error(`Expected AOE against 12 minions with capacity 4 to hit 2 instances, got ${resolution.aoeActualTargets}.`);
  }
}

{
  const baseMonster = fixtureActor("report-quantity-minion", "monsters", {
    name: "Report Minion",
    hydration: {
      source: "campaignMonster",
      realData: true,
      warnings: [],
      unsupportedEquipment: [],
      unsupportedTraits: [],
      ignoredTraits: [],
      unsupportedCombatTraits: [],
      fallbackActions: [],
    },
  });
  const report = runScenarioSuite({
    name: "quantity report fixture",
    players: [fixtureActor("report-quantity-player", "players", { actionsPerTurn: 0, actions: [] })],
    monsters: createActorInstances(baseMonster, 3),
    runs: 1,
    seed: 833,
    maxRounds: 1,
    turnOrder: "monstersFirst",
  });
  const group = report.monsterGroupContributions.find((entry) => entry.baseActorId === baseMonster.id);
  if (
    report.hydrationIntegrity.realMonsterCount !== 1 ||
    report.hydrationIntegrity.monsterInstanceCount !== 3 ||
    !group ||
    group.quantity !== 3 ||
    group.survivors !== 3
  ) {
    throw new Error("Quantity report did not preserve base monster count, instance count, and grouped survivors.");
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
  if (resolution.aoeActionUses !== 1 || resolution.aoePotentialTargets !== 4 || resolution.aoeActualTargets !== 2) {
    throw new Error("AOE target abstraction did not apply 60% target capacity.");
  }
}

{
  const player = fixtureActor("aoe-solo-player", "players");
  const monster = fixtureActor("aoe-solo-monster", "monsters");
  const state = createCombatState([player], [monster]);
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ rangeCategory: "AOE", targetCount: 10 }),
    rng: rngFrom([0.99, 0]),
  });
  if (resolution.aoeActionUses !== 1 || resolution.aoePotentialTargets !== 10 || resolution.aoeActualTargets !== 1) {
    throw new Error("AOE target abstraction exceeded legal living targets in 1v1.");
  }
}

{
  const player = fixtureActor("aoe-report-player", "players", {
    actions: [action({ id: "aoe-report-action", rangeCategory: "AOE", targetCount: 10 })],
  });
  const monster = fixtureActor("aoe-report-monster", "monsters");
  const report = runScenarioSuite({
    name: "aoe reporting fixture",
    players: [player],
    monsters: [monster],
    runs: 2,
    seed: 611,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  if (report.averageMechanics.aoeActualTargets.players > 1 || report.averageMechanics.aoeActionUses.players <= 0) {
    throw new Error("AOE report did not keep actual target count per use capped by living targets.");
  }
}

{
  const support = createFixtureActor({
    id: "support-policy",
    side: "players",
    name: "CL-L3-Support Policy",
    role: "Campaign Character",
    physicalHp: 30,
    mentalHp: 30,
    physicalProtection: 0,
    mentalProtection: 0,
    dodgeValue: 8,
    attack: 2,
    guard: 2,
    fortitude: 2,
    intellect: 4,
    synergy: 6,
    bravery: 4,
    basicAttack: { diceCount: 1, potency: 1 },
    powers: [
      makeFixturePower({ id: "support-heal-policy", name: "Heal Policy", intention: "HEALING", diceCount: 3, potency: 2, applyTo: "ALLIES" }),
      makeFixturePower({ id: "support-buff-policy", name: "Buff Policy", intention: "AUGMENT", diceCount: 3, potency: 1, applyTo: "ALLIES", statTarget: "Attack", durationTurns: 2 }),
      makeFixturePower({ id: "support-debuff-policy", name: "Debuff Policy", intention: "DEBUFF", diceCount: 3, potency: 1, statTarget: "Guard", durationTurns: 2 }),
    ],
  });
  const ally = fixtureActor("support-ally", "players");
  const monster = fixtureActor("support-enemy", "monsters");
  const soloState = createCombatState([support], [monster]);
  const soloAction = chooseTurnAction(soloState.actors[0], soloState, "power");
  if (soloAction?.kind !== "debuff") {
    throw new Error("Solo support did not prefer a useful debuff before wasting an ally buff.");
  }
  soloState.actors[0].physicalHpCurrent = Math.floor(soloState.actors[0].physicalHpMax / 2);
  const soloHealAction = chooseTurnAction(soloState.actors[0], soloState, "power");
  const soloHealTarget = soloHealAction ? chooseTarget(soloState.actors[0], soloHealAction, soloState) : null;
  if (soloHealAction?.kind !== "healing" || soloHealTarget?.id !== soloState.actors[0].id) {
    throw new Error("Wounded solo support did not heal self before attacking.");
  }
  const partyState = createCombatState([support, ally], [monster]);
  const partyAction = chooseTurnAction(partyState.actors[0], partyState, "power");
  if (partyAction?.kind !== "buff") {
    throw new Error("Party support did not prefer a useful early ally buff.");
  }
  partyState.actors[1].physicalHpCurrent = Math.floor(partyState.actors[1].physicalHpMax / 2);
  const healAction = chooseTurnAction(partyState.actors[0], partyState, "power");
  const healTarget = healAction ? chooseTarget(partyState.actors[0], healAction, partyState) : null;
  if (healAction?.kind !== "healing" || healTarget?.id !== partyState.actors[1].id) {
    throw new Error("Support did not heal the most wounded ally.");
  }
}

{
  const player = fixtureActor("order-player", "players", {
    physicalHpMax: 999,
    mentalHpMax: 999,
    actions: [action({ id: "order-player-attack" })],
  });
  const monster = fixtureActor("order-monster", "monsters", {
    physicalHpMax: 999,
    mentalHpMax: 999,
    actions: [action({ id: "order-monster-attack" })],
  });
  const playersFirst = runCombatScenario({
    name: "turn order players first fixture",
    players: [player],
    monsters: [monster],
    runs: 1,
    seed: 919,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  const monstersFirst = runCombatScenario({
    name: "turn order monsters first fixture",
    players: [player],
    monsters: [monster],
    runs: 1,
    seed: 919,
    maxRounds: 1,
    turnOrder: "monstersFirst",
  });
  const alternating = runCombatScenario({
    name: "turn order alternating fixture",
    players: [player],
    monsters: [monster],
    runs: 1,
    seed: 919,
    maxRounds: 2,
    turnOrder: "alternatingByRound",
  });
  if (playersFirst.log[0]?.actorId !== "order-player" || monstersFirst.log[0]?.actorId !== "order-monster") {
    throw new Error("Configured first side did not act first.");
  }
  const roundTwoFirst = alternating.log.find((entry) => entry.round === 2);
  if (alternating.log[0]?.actorId !== "order-player" || roundTwoFirst?.actorId !== "order-monster") {
    throw new Error("Alternating turn order did not swap first side by round.");
  }
}

{
  const report = runScenarioSuite({
    name: "actor contribution fixture",
    players: [fixtureActor("contribution-player", "players", { actions: [action({ id: "contribution-player-attack" })] })],
    monsters: [fixtureActor("contribution-monster", "monsters", { actions: [action({ id: "contribution-monster-attack" })] })],
    runs: 2,
    seed: 808,
    maxRounds: 2,
  });
  if (report.actorContributions.length === 0 || !report.actorContributions.some((entry) => entry.topActionName)) {
    throw new Error("Actor contribution report did not record action usage.");
  }
}

{
  const hotAction = action({
    id: "multiheal-credit",
    name: "Multiheal Credit",
    kind: "healing",
    targetPolicy: "ally",
    diceCount: 4,
    potency: 2,
    recurring: { kind: "healingOverTime", durationRounds: 2 },
  });
  const healer = fixtureActor("hot-credit-healer", "players", {
    physicalHpMax: 50,
    mentalHpMax: 50,
    dodgeDice: 1,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 0,
    physicalProtection: 0,
    actions: [hotAction],
  });
  const attacker = fixtureActor("hot-credit-attacker", "monsters", {
    actions: [action({ id: "hot-credit-attack", diceCount: 5, potency: 3 })],
  });
  const report = runScenarioSuite({
    name: "healing over time actor contribution fixture",
    players: [healer],
    monsters: [attacker],
    runs: 3,
    seed: 819,
    maxRounds: 3,
    turnOrder: "monstersFirst",
  });
  const contribution = report.actorContributions.find((entry) => entry.actorId === healer.id);
  const actionContribution = contribution?.actionContributions.find((entry) => entry.actionId === hotAction.id);
  if (!actionContribution || actionContribution.healing <= 0 || actionContribution.healingTicks <= 0) {
    throw new Error("Healing-over-time ticks were not credited back to the source healing action contribution.");
  }
}

{
  const ongoingAction = action({
    id: "open-vein-credit",
    name: "Open Vein Credit",
    kind: "attack",
    targetPolicy: "enemy",
    diceCount: 5,
    potency: 1,
    recurring: { kind: "ongoingDamage", durationRounds: 2 },
  });
  const attacker = fixtureActor("ongoing-credit-attacker", "players", {
    actions: [ongoingAction],
  });
  const defender = fixtureActor("ongoing-credit-defender", "monsters", {
    physicalHpMax: 999,
    mentalHpMax: 999,
    dodgeDice: 1,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 0,
    physicalProtection: 0,
  });
  const report = runScenarioSuite({
    name: "ongoing damage actor contribution fixture",
    players: [attacker],
    monsters: [defender],
    runs: 3,
    seed: 820,
    maxRounds: 2,
    turnOrder: "playersFirst",
  });
  const contribution = report.actorContributions.find((entry) => entry.actorId === attacker.id);
  const actionContribution = contribution?.actionContributions.find((entry) => entry.actionId === ongoingAction.id);
  if (!actionContribution || actionContribution.ongoingDamageApplied <= 0 || actionContribution.ongoingDamageTicks <= 0) {
    throw new Error("Ongoing damage ticks were not credited back to the source attack action contribution.");
  }
}

{
  const fieldAction = action({
    id: "suppression-field-credit",
    name: "Suppression Field Credit",
    kind: "debuff",
    targetPolicy: "allEnemies",
    diceCount: 3,
    potency: 1,
    modifier: { attribute: "Attack", amount: 1, durationRounds: 2 },
  });
  const support = fixtureActor("field-credit-support", "players", {
    name: "Support Field Credit",
    role: "Campaign Character",
    actions: [fieldAction],
  });
  const defender = fixtureActor("field-credit-defender", "monsters", {
    physicalHpMax: 999,
    mentalHpMax: 999,
  });
  const report = runScenarioSuite({
    name: "field debuff actor contribution fixture",
    players: [support],
    monsters: [defender],
    runs: 3,
    seed: 821,
    maxRounds: 2,
    turnOrder: "playersFirst",
  });
  const contribution = report.actorContributions.find((entry) => entry.actorId === support.id);
  const actionContribution = contribution?.actionContributions.find((entry) => entry.actionId === fieldAction.id);
  if (!actionContribution || actionContribution.debuffApplications <= 0 || actionContribution.debuffUptime <= 0) {
    throw new Error("Field/debuff uptime was not credited back to the source debuff action contribution.");
  }
}

{
  const attacker = fixtureActor("outgoing-contribution-attacker", "players", {
    actions: [action({ id: "outgoing-hit", diceCount: 1, potency: 4 })],
  });
  const defender = fixtureActor("defensive-contribution-defender", "monsters", {
    dodgeDice: 1,
    physicalDefenceDice: 20,
    physicalBlockPerSuccess: 4,
    physicalProtection: 0,
    actions: [action({ id: "defender-fallback" })],
  });
  const report = runScenarioSuite({
    name: "defensive contribution fixture",
    players: [attacker],
    monsters: [defender],
    runs: 2,
    seed: 817,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  const outgoing = report.actorContributions.find((entry) => entry.actorId === attacker.id);
  const defensive = report.defensiveContributions.find((entry) => entry.actorId === defender.id);
  if (!outgoing || outgoing.mitigation !== 0 || !defensive || defensive.defenceStringBlocked <= 0) {
    throw new Error("Defender mitigation was not separated from attacker outgoing action contribution.");
  }
}

{
  const counterAttack = action({
    id: "counter-strike-credit",
    name: "Counter Strike Credit",
    kind: "attack",
    counterMode: true,
    targetPolicy: "enemy",
    diceCount: 4,
    potency: 2,
  });
  const attacker = fixtureActor("counter-credit-attacker", "players", {
    actions: [action({ id: "counter-trigger-attack", diceCount: 1, potency: 1 })],
  });
  const defender = fixtureActor("counter-credit-defender", "monsters", {
    actions: [counterAttack],
  });
  const report = runScenarioSuite({
    name: "counter defensive credit fixture",
    players: [attacker],
    monsters: [defender],
    runs: 2,
    seed: 818,
    maxRounds: 1,
    turnOrder: "monstersFirst",
  });
  const outgoing = report.actorContributions.find((entry) => entry.actorId === attacker.id);
  const defensive = report.defensiveContributions.find((entry) => entry.actorId === defender.id);
  if (!defensive || defensive.counterDamage <= 0 || (outgoing?.counterDamage ?? 0) !== 0) {
    throw new Error("Counter damage was not credited to the defending actor.");
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

{
  const attacker = fixtureActor("transcript-dodge-attacker", "players", {
    actions: [action({ id: "transcript-dodge-hit", name: "Transcript Strike", diceCount: 1, potency: 4 })],
  });
  const defender = fixtureActor("transcript-dodge-defender", "monsters", { dodgeDice: 2 });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: state.actors[0].actions[0],
    rng: rngFrom([0.99, 0.99, 0.99]),
    lane: "main",
  });
  expectTranscriptLine(state.transcriptLines, /Main Action: transcript-dodge-attacker uses Transcript Strike/i, "attack action line");
  expectTranscriptLine(state.transcriptLines, /raw results/i, "raw attack dice results");
  expectTranscriptLine(state.transcriptLines, /Dodge .*succeeded/i, "dodge result");
  expectTranscriptLine(state.transcriptLines, /Attack result: transcript-dodge-defender dodged/i, "dodged damage result");
}

{
  const attacker = fixtureActor("transcript-physical-attacker", "players", {
    actions: [action({ id: "transcript-physical-hit", name: "Physical Transcript Hit", diceCount: 1, potency: 4 })],
  });
  const defender = fixtureActor("transcript-physical-defender", "monsters", {
    dodgeDice: 1,
    physicalDefenceDice: 6,
    physicalBlockPerSuccess: 3,
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: state.actors[0].actions[0],
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]),
    lane: "main",
  });
  expectTranscriptLine(state.transcriptLines, /Defence choice: .*physical defence/i, "physical defence choice");
  expectTranscriptLine(state.transcriptLines, /Physical Defence blocked/i, "physical defence block amount");
  expectTranscriptLine(state.transcriptLines, /Attack result: .*suffers/i, "physical net wounds result");
}

{
  const attacker = fixtureActor("transcript-resist-attacker", "players", {
    actions: [action({ id: "transcript-control", name: "Transcript Control", kind: "control", diceCount: 3, potency: 1, resistAttribute: "FORTITUDE" })],
  });
  const defender = fixtureActor("transcript-resist-defender", "monsters", { resist: { FORTITUDE: 1 } });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: state.actors[0].actions[0],
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0, 0]),
    lane: "power",
  });
  expectTranscriptLine(state.transcriptLines, /Resist formula 3 \+ FORTITUDE resist value = 4 dice/i, "resist dice formula");
  expectTranscriptLine(state.transcriptLines, /cancelled .* hostile successes/i, "resist cancelled successes");
}

{
  const multiheal = action({
    id: "transcript-multiheal",
    name: "Multiheal",
    sourceType: "power",
    kind: "healing",
    targetPolicy: "ally",
    accuracyAttribute: "Synergy",
    diceCount: 3,
    potency: 4,
    cooldownRounds: 2,
    recurring: { kind: "healingOverTime", durationRounds: 3 },
  });
  const healer = fixtureActor("CL-L3-Support", "players", { actions: [multiheal] });
  const target = fixtureActor("CL-L3-Bruiser", "players");
  const state = createCombatState([healer, target], [], { captureTranscript: true });
  state.actors[1].physicalHpCurrent = Math.max(1, state.actors[1].physicalHpMax - 10);
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: state.actors[0].actions[0],
    rng: rngFrom([0.34, 0.62, 0.9]),
    lane: "power",
  });
  expectTranscriptLine(state.transcriptLines, /Power Action: CL-L3-Support uses Multiheal on CL-L3-Bruiser/i, "healing power action");
  expectTranscriptLine(state.transcriptLines, /Roll: .*3 x D8 using Synergy/i, "healing roll");
  expectTranscriptLine(state.transcriptLines, /Effect: Multiheal applies healing-over-time/i, "healing over time effect");
  expectTranscriptLine(state.transcriptLines, /Status created: Multiheal on CL-L3-Bruiser, 3 ticks remaining/i, "healing status created");
  expectTranscriptLine(state.transcriptLines, /Cooldown: Multiheal enters cooldown 2/i, "hydrated healing cooldown");
}

{
  const buff = action({
    id: "transcript-buff",
    name: "Transcript Buff",
    sourceType: "power",
    kind: "buff",
    targetPolicy: "ally",
    modifier: { attribute: "Guard", amount: 2, durationRounds: 3 },
  });
  const debuff = action({
    id: "transcript-debuff",
    name: "Transcript Debuff",
    sourceType: "power",
    kind: "debuff",
    targetPolicy: "enemy",
    modifier: { attribute: "Attack", amount: 1, durationRounds: 2 },
  });
  const actor = fixtureActor("transcript-buffer", "players", { actions: [buff, debuff] });
  const ally = fixtureActor("transcript-buff-ally", "players");
  const enemy = fixtureActor("transcript-debuff-enemy", "monsters");
  const state = createCombatState([actor, ally], [enemy], { captureTranscript: true });
  resolveCombatAction({ state, actor: state.actors[0], target: state.actors[1], action: buff, rng: rngFrom([0.99]), lane: "power" });
  resolveCombatAction({ state, actor: state.actors[0], target: state.actors[2], action: debuff, rng: rngFrom([0.99]), lane: "power" });
  expectTranscriptLine(state.transcriptLines, /Buff: Transcript Buff applies \+2 Guard/i, "buff transcript");
  expectTranscriptLine(state.transcriptLines, /Debuff: Transcript Debuff applies -1 Attack/i, "debuff transcript");
}

{
  const linkedSecondary = action({
    id: "linked-secondary-burn",
    name: "Linked Secondary Burn",
    sourceType: "power",
    kind: "attack",
    diceCount: 1,
    potency: 2,
    resistAttribute: "FORTITUDE",
    linkedToPrimary: true,
    usesPrimaryAppliedSuccesses: true,
    effectPerPrimarySuccess: 2,
    skipOwnRoll: true,
    skipOwnDefenceGate: true,
  });
  const primary = action({
    id: "linked-primary-control",
    name: "Linked Primary Control",
    sourceType: "power",
    kind: "control",
    diceCount: 1,
    potency: 1,
    resistAttribute: "FORTITUDE",
    secondaryActions: [linkedSecondary],
  });
  const actor = fixtureActor("linked-secondary-actor", "players", { actions: [primary] });
  const target = fixtureActor("linked-secondary-target", "monsters", {
    physicalHpMax: 999,
    physicalProtection: 99,
    dodgeDice: 12,
  });
  const state = createCombatState([actor], [target], { captureTranscript: true });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: primary,
    rng: rngFrom([0.99, 0, 0, 0, 0.99]),
    lane: "power",
  });
  const resistLines = state.transcriptLines.filter((line) => /Resist formula/i.test(line));
  if (resistLines.length !== 1 || resolution.netWounds <= 0) {
    throw new Error(`Linked secondary did not ride the primary gate: resist lines ${resistLines.length}, net wounds ${resolution.netWounds}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Linked effect: Linked Secondary Burn rides 1 applied primary successes/i, "linked secondary gate transcript");
}

{
  const linkedSecondary = action({
    id: "fully-resisted-secondary",
    name: "Fully Resisted Secondary",
    sourceType: "power",
    kind: "attack",
    diceCount: 1,
    potency: 2,
    resistAttribute: "FORTITUDE",
    linkedToPrimary: true,
    usesPrimaryAppliedSuccesses: true,
    effectPerPrimarySuccess: 2,
    skipOwnRoll: true,
    skipOwnDefenceGate: true,
  });
  const primary = action({
    id: "fully-resisted-primary",
    name: "Fully Resisted Primary",
    sourceType: "power",
    kind: "control",
    diceCount: 1,
    potency: 1,
    resistAttribute: "FORTITUDE",
    secondaryActions: [linkedSecondary],
  });
  const state = createCombatState(
    [fixtureActor("fully-resisted-actor", "players", { actions: [primary] })],
    [fixtureActor("fully-resisted-target", "monsters")],
    { captureTranscript: true },
  );
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: primary,
    rng: rngFrom([0.99, 0.99, 0.99, 0.99]),
    lane: "power",
  });
  if (resolution.netWounds > 0 || state.transcriptLines.some((line) => /Fully Resisted Secondary/i.test(line))) {
    throw new Error("Linked secondary resolved after the primary was fully resisted.");
  }
}

{
  const actor = fixtureActor("duplicate-denial-target", "players");
  const state = createCombatState([actor], [fixtureActor("duplicate-denial-source", "monsters")], { captureTranscript: true });
  state.statusEffects.push(
    {
      id: "duplicate-denial-a",
      sourceActorId: state.actors[1].id,
      targetActorId: state.actors[0].id,
      kind: "mainActionDenied",
      amount: 1,
      sourceActionId: "denial-a",
      sourceActionName: "Denial A",
      remainingRounds: 1,
    },
    {
      id: "duplicate-denial-b",
      sourceActorId: state.actors[1].id,
      targetActorId: state.actors[0].id,
      kind: "mainActionDenied",
      amount: 1,
      sourceActionId: "denial-b",
      sourceActionName: "Denial B",
      remainingRounds: 1,
    },
  );
  const resolution = resolveStartOfTurnEffects(state, state.actors[0]);
  const denialLines = state.transcriptLines.filter((line) => /main action is denied/i.test(line));
  if (resolution.actionsDenied !== 1 || denialLines.length !== 1) {
    throw new Error(`Duplicate main-action denial was not consolidated: actionsDenied ${resolution.actionsDenied}, lines ${denialLines.length}.`);
  }
  expectTranscriptLine(state.transcriptLines, /consolidated to one denied main action/i, "duplicate denial consolidation");
}

{
  const counter = action({
    id: "transcript-counterstrike",
    name: "Counterstrike",
    sourceType: "power",
    kind: "attack",
    targetPolicy: "enemy",
    counterMode: true,
    diceCount: 2,
    potency: 3,
    cooldownRounds: 2,
  });
  const attacker = fixtureActor("transcript-counter-attacker", "players", {
    actions: [action({ id: "transcript-counter-trigger", name: "Trigger Hit", diceCount: 1, potency: 2 })],
  });
  const defender = fixtureActor("transcript-counter-defender", "monsters", {
    physicalHpMax: 999,
    dodgeDice: 1,
    actions: [counter],
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  refreshActorResponses(state, state.actors[1].id);
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: state.actors[0].actions[0],
    rng: rngFrom([0.99, 0, 0.99, 0.99]),
    lane: "main",
  });
  tickActorCooldowns(state, state.actors[1].id);
  expectTranscriptLine(state.transcriptLines, /Response spent/i, "response spend");
  expectTranscriptLine(state.transcriptLines, /Response: transcript-counter-defender uses Counterstrike/i, "counter response");
  expectTranscriptLine(state.transcriptLines, /Cooldown: Counterstrike enters cooldown 2/i, "counter cooldown applied");
  expectTranscriptLine(state.transcriptLines, /Cooldown tick: Counterstrike 2 -> 1/i, "counter cooldown tick");
}

{
  const report = runScenarioSuite({
    name: "first run transcript fixture",
    players: [fixtureActor("first-run-transcript-player", "players", { actions: [action({ id: "first-run-transcript-attack" })] })],
    monsters: [fixtureActor("first-run-transcript-monster", "monsters", { actions: [action({ id: "first-run-transcript-monster-attack" })] })],
    runs: 3,
    seed: 909,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  if (!report.firstRunTranscript || report.firstRunTranscript.runIndex !== 0 || report.firstRunTranscript.lines.length === 0) {
    throw new Error("Multi-run scenario did not expose exactly one first-run transcript.");
  }
  expectTranscriptLine(report.firstRunTranscript.lines, /Round 1 begins/i, "first run transcript round start");
}

console.log(
  `combatLab.smoke.ts passed (${reports.length} fixture scenarios, unsupported fixture reasons: ${unsupportedFixture.unsupported.length}, suite unsupported powers: ${totalUnsupported}, fallback fixture actions: ${fallbackReport.hydrationIntegrity.fallbackActionCount})`,
);
