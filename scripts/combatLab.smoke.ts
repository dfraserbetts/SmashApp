import { buildCombatLabSmokeScenarios, runCombatScenario } from "../lib/combat-lab/autoSimulator";
import { resolveCombatAction, resolveStartOfTurnEffects } from "../lib/combat-lab/actionResolver";
import {
  createCombatState,
  createActorInstances,
  getActionCooldownRemaining,
  isActionOnCooldown,
  markDefeatedActors,
  removeStatusEffectById,
  refreshActorResponses,
  tickActorCooldowns,
  tickTargetTurnEffects,
} from "../lib/combat-lab/combatState";
import type { Rng } from "../lib/combat-lab/dice";
import {
  DEFAULT_COMBAT_TUNING_VALUES,
  type ProtectionTuningValues,
} from "../lib/config/combatTuningShared";
import { DEFAULT_POWER_TUNING_VALUES, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
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
import { chooseActionLaneOrder, chooseTarget, chooseTurnAction } from "../lib/combat-lab/targetingPolicies";
import type { CombatAction, CombatActor, CombatState } from "../lib/combat-lab/types";
import type { Power } from "../lib/summoning/types";

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

function runLinkedWoundBandFixture(prevention: number) {
  const secondary = action({
    id: "linked-wound-rider",
    name: "Linked Wound Rider",
    sourceType: "power",
    kind: "attack",
    targetPolicy: "enemy",
    diceCount: 1,
    potency: 6,
    recurring: { kind: "ongoingDamage", durationRounds: 2 },
    damageApplicationTiming: "startOfTurn",
    linkedToPrimary: true,
    usesPrimaryAppliedSuccesses: true,
    linkedScalingMode: "primaryWoundBands",
    primaryWoundsPerSuccess: 8,
    effectPerPrimarySuccess: 6,
    skipOwnRoll: true,
    skipOwnDefenceGate: true,
  });
  const primary = action({
    id: "linked-wound-primary",
    name: "Linked Wound Primary",
    sourceType: "power",
    kind: "attack",
    targetPolicy: "enemy",
    diceCount: 4,
    potency: 8,
    secondaryActions: [secondary],
  });
  const attacker = fixtureActor("linked-wound-attacker", "players", {
    attributeDice: { Attack: "D12", Guard: "D8", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
    actions: [primary],
  });
  const defender = fixtureActor("linked-wound-defender", "monsters", {
    physicalHpMax: 1000,
    physicalHpCurrent: 1000,
    physicalProtection: prevention,
    dodgeDice: 1,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 0,
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: primary,
    rng: rngFrom([0.1, 0.45, 0.45, 0.9, 0]),
    lane: "power",
  });
  return { state, resolution };
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

function monsterPowerRowFromFixture(
  power: ReturnType<typeof makeFixturePower>,
  overrides: Partial<CombatLabMonsterRow["powers"][number]> = {},
): CombatLabMonsterRow["powers"][number] {
  return {
    id: power.id,
    sortOrder: power.sortOrder,
    name: power.name,
    description: power.description,
    descriptorChassis: power.descriptorChassis,
    descriptorChassisConfig: power.descriptorChassisConfig,
    commitmentModifier: power.commitmentModifier,
    counterMode: power.counterMode,
    cooldownTurns: power.cooldownTurns,
    cooldownReduction: power.cooldownReduction,
    primaryDefenceGate: power.primaryDefenceGate ?? null,
    diceCount: power.diceCount,
    potency: power.potency,
    rangeCategories: (power.rangeCategories ?? []).map((rangeCategory) => ({ rangeCategory })),
    effectPackets: power.effectPackets,
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
if (realAttackActions[0]?.potency !== 4 || realAttackActions[0]?.damageTypes?.[0] !== "Piercing") {
  throw new Error(`Real equipped attack fixture did not use table-facing damage once: ${JSON.stringify(realAttackActions)}.`);
}

{
  const { actor, warnings } = adaptMonsterToCombatLabActor(
    makeMonsterRow({
      name: "Mindbreak Hydration Fixture",
      attackDie: "D12",
      weaponSkillValue: 1,
      physicalProtection: 0,
      mentalProtection: 0,
      naturalPhysicalProtection: 0,
      naturalMentalProtection: 0,
      naturalAttack: {
        attackName: "Mindbreak Gaze",
        attackConfig: {
          melee: {
            enabled: true,
            targets: 1,
            physicalStrength: 0,
            mentalStrength: 4,
            damageTypes: [{ name: "Holy", mode: "MENTAL" }],
            attackEffects: [],
          },
        },
      },
    }),
    new Map(),
    DEFAULT_COMBAT_TUNING_VALUES,
  );
  const mindbreak = actor.actions.find((candidate) => candidate.name === "Mindbreak Gaze melee mental attack");
  if (!mindbreak || mindbreak.potency !== 8 || mindbreak.damageTypes?.[0] !== "Holy") {
    throw new Error(`Mindbreak Gaze did not hydrate raw mental strength 4 to 8 Holy wounds per success: ${JSON.stringify(actor.actions)}.`);
  }
  if (!warnings.some((warning) => /raw mental strength 4 resolves to displayed 8 wounds per success/i.test(warning.message))) {
    throw new Error(`Mindbreak Gaze hydration warning was not surfaced: ${JSON.stringify(warnings)}.`);
  }
  const target = fixtureActor("mindbreak-target", "players", {
    mentalHpMax: 100,
    mentalHpCurrent: 100,
    dodgeDice: 0,
    physicalDefenceDice: 0,
    mentalDefenceDice: 0,
    mentalProtection: 0,
  });
  const state = createCombatState([target], [actor], { captureTranscript: true });
  resolveCombatAction({
    state,
    actor: state.actors[1],
    target: state.actors[0],
    action: mindbreak,
    rng: rngFrom([0.99]),
    lane: "main",
  });
  expectTranscriptLine(
    state.transcriptLines,
    /Declared damage: Mindbreak Gaze melee mental attack has 2 active successes x 8 = 16 mental Holy wounds before defence/i,
    "Mindbreak Gaze table-facing mental damage transcript",
  );
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
  const liveDodgeCounterPower = {
    ...makeFixturePower({
      id: "live-dodge-counter-power",
      name: "Sudden Dive",
      intention: "DEFENCE",
      diceCount: 3,
      potency: 4,
      cooldownTurns: 1,
    }),
    counterMode: "YES" as const,
    effectPackets: [
      {
        ...makeFixturePower({
          id: "live-dodge-counter-packet",
          name: "Sudden Dive",
          intention: "DEFENCE",
          diceCount: 3,
          potency: 4,
        }).effectPackets[0],
        applyTo: "SELF" as const,
        detailsJson: { defenceMode: "Dodge", attackMode: "PHYSICAL", rangeCategory: "SELF" },
      },
    ],
  };
  const { actor } = adaptMonsterToCombatLabActor(
    makeMonsterRow({
      powers: [monsterPowerRowFromFixture(liveDodgeCounterPower)],
    }),
    new Map(),
    monsterTuning,
  );
  const suddenDive = actor.actions.find((action) => action.name === "Sudden Dive");
  if (!suddenDive?.counterMode || suddenDive.defenceMode !== "Dodge") {
    throw new Error(`Live monster Dodge Counter did not preserve counterMode through hydration: ${JSON.stringify(suddenDive)}.`);
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
    adapted.actions[0].secondaryActions?.[0]?.linkedScalingMode !== "primaryWoundBands" ||
    adapted.actions[0].secondaryActions?.[0]?.primaryWoundsPerSuccess !== 4 ||
    !adapted.actions[0].secondaryActions?.[0]?.skipOwnRoll ||
    !adapted.actions[0].secondaryActions?.[0]?.skipOwnDefenceGate
  ) {
    throw new Error("Linked secondary packets were not marked as wound-band primary riders.");
  }
}

{
  const partial = runLinkedWoundBandFixture(29);
  const partialStatus = partial.state.statusEffects.find((effect) => effect.kind === "ongoingDamage");
  if (partial.resolution.netWounds !== 3 || !partialStatus || partialStatus.amount !== 6) {
    throw new Error(`Linked wound-band partial damage did not create one 6-wound rider tick: ${JSON.stringify({ resolution: partial.resolution, status: partialStatus })}.`);
  }
  expectTranscriptLine(partial.state.transcriptLines, /Linked effect: Linked Wound Rider rides 3 net primary wounds from Linked Wound Primary\. Applied wound bands: ceil\(3 \/ 8\) = 1/i, "partial linked wound-band transcript");
  expectTranscriptLine(partial.state.transcriptLines, /Ongoing declaration: Linked Wound Rider has 1 wound band x 6 = 6 physical wounds per tick/i, "partial linked wound-band ongoing declaration");

  const exact = runLinkedWoundBandFixture(24);
  const exactStatus = exact.state.statusEffects.find((effect) => effect.kind === "ongoingDamage");
  if (exact.resolution.netWounds !== 8 || !exactStatus || exactStatus.amount !== 6) {
    throw new Error(`Linked wound-band exact band did not create one rider unit: ${JSON.stringify({ resolution: exact.resolution, status: exactStatus })}.`);
  }

  const over = runLinkedWoundBandFixture(23);
  const overStatus = over.state.statusEffects.find((effect) => effect.kind === "ongoingDamage");
  if (over.resolution.netWounds !== 9 || !overStatus || overStatus.amount !== 12) {
    throw new Error(`Linked wound-band just-over band did not create two rider units: ${JSON.stringify({ resolution: over.resolution, status: overStatus })}.`);
  }

  const prevented = runLinkedWoundBandFixture(32);
  if (prevented.resolution.netWounds !== 0 || prevented.state.statusEffects.some((effect) => effect.kind === "ongoingDamage")) {
    throw new Error(`Fully prevented wound primary still created a linked ongoing status: ${JSON.stringify({ resolution: prevented.resolution, statuses: prevented.state.statusEffects })}.`);
  }
  expectTranscriptLine(prevented.state.transcriptLines, /Linked effect: Linked Wound Rider does not apply because Linked Wound Primary inflicted 0 net wounds/i, "fully prevented linked wound-band skip");
}

{
  const base = makeFixturePower({
    id: "open-vein-live-wound-band",
    name: "Open Vein",
    intention: "ATTACK",
    diceCount: 4,
    potency: 4,
    cooldownTurns: 2,
  });
  const primary = {
    ...base.effectPackets[0],
    potency: 4,
    dealsWounds: true,
    detailsJson: {
      attackMode: "PHYSICAL",
      damageTypes: ["Slashing"],
    },
  };
  const secondary = {
    ...primary,
    id: "open-vein-live-wound-band-secondary",
    sortOrder: 1,
    packetIndex: 1,
    potency: 3,
    effectDurationType: "TURNS" as const,
    effectTimingType: "START_OF_TURN" as const,
    effectDurationTurns: 2,
    detailsJson: {
      attackMode: "PHYSICAL",
      damageTypes: ["Necrotic"],
      secondaryScalingMode: "PRIMARY_WOUND_BANDS",
      woundsPerSuccess: 8,
    },
  };
  const adapted = adaptPowerToCombatActions({
    ...base,
    effectPackets: [primary, secondary],
    intentions: [primary, secondary],
  });
  const openVein = adapted.actions[0];
  if (!openVein || openVein.potency !== 8 || openVein.secondaryActions?.[0]?.effectPerPrimarySuccess !== 6) {
    throw new Error(`Open Vein live hydration did not preserve 8 primary/6 rider wound values: ${JSON.stringify(adapted)}.`);
  }
  const attacker = fixtureActor("open-vein-live-attacker", "players", {
    attributeDice: { Attack: "D12", Guard: "D8", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
    actions: [openVein],
  });
  const defender = fixtureActor("open-vein-live-defender", "monsters", {
    physicalHpMax: 1000,
    physicalHpCurrent: 1000,
    physicalProtection: 29,
    dodgeDice: 1,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 0,
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: openVein,
    rng: rngFrom([0.1, 0.45, 0.45, 0.9, 0]),
    lane: "power",
  });
  const status = state.statusEffects.find((effect) => effect.kind === "ongoingDamage");
  if (resolution.netWounds !== 3 || !status || status.amount !== 6 || status.cleanupUnitWounds !== 6 || status.damageLabel !== "physical Necrotic") {
    throw new Error(`Hydrated Open Vein did not scale linked rider by wound bands: ${JSON.stringify({ resolution, status, transcript: state.transcriptLines })}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Linked effect: Open Vein \(attack\) rides 3 net primary wounds from Open Vein\. Applied wound bands: ceil\(3 \/ 8\) = 1/i, "hydrated Open Vein wound-band transcript");
  expectTranscriptLine(state.transcriptLines, /Status created: Open Vein \(attack\) ongoing damage .* 6 physical Necrotic wounds per tick/i, "hydrated Open Vein status");
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
  const derivedCooldownTuning: PowerTuningSnapshot = {
    setId: "combat-lab-smoke-derived-cooldown",
    name: "Combat Lab Smoke Derived Cooldown",
    slug: "combat-lab-smoke-derived-cooldown",
    status: "ACTIVE",
    updatedAt: new Date(0).toISOString(),
    values: {
      ...DEFAULT_POWER_TUNING_VALUES,
      "cooldown.load.lightMax": 0,
      "cooldown.load.moderateMax": 0,
      "cooldown.load.heavyMax": 999,
    },
  };
  const power = makeFixturePower({
    id: "stale-character-derived-cooldown",
    name: "Stale Character Cooldown",
    intention: "ATTACK",
    diceCount: 3,
    potency: 2,
    cooldownTurns: 1,
  });
  const primaryPacket = {
    ...power.effectPackets[0],
    detailsJson: {
      ...power.effectPackets[0]?.detailsJson,
      attackMode: "PHYSICAL",
      damageTypes: ["Slashing"],
      rangeCategory: "MELEE",
      rangeValue: 1,
    },
  };
  const validCharacterPower = {
    ...power,
    effectPackets: [primaryPacket],
    intentions: [primaryPacket],
  };
  const { actor, warnings } = adaptCampaignCharacterToCombatActor(
    makeCharacterRow({
      builderData: makeCharacterBuilderData({ powers: [validCharacterPower] }),
      backpackItems: [],
    }),
    DEFAULT_COMBAT_TUNING_VALUES,
    derivedCooldownTuning,
  );
  const actionWithDerivedCooldown = actor.actions.find(
    (candidate) => candidate.name === power.name && candidate.cooldownRounds === 3,
  );
  if (!actionWithDerivedCooldown) {
    throw new Error(`Character power did not hydrate from derived display cooldown 3: ${JSON.stringify(actor.actions)}.`);
  }
  if (
    !warnings.some((warning) =>
      /stored cooldown 1 differs from Character Builder derived\/display cooldown 3; Combat Lab used 3/i.test(
        warning.message,
      ),
    )
  ) {
    throw new Error(
      `Character stale cooldown mismatch warning was not reported: ${JSON.stringify(warnings)}.`,
    );
  }
  const target = fixtureActor("character-derived-cooldown-target", "monsters", {
    dodgeDice: 1,
    physicalProtection: 0,
  });
  const state = createCombatState([actor], [target], { captureTranscript: true });
  state.currentTurnActorId = state.actors[0].id;
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: actionWithDerivedCooldown,
    rng: rngFrom([0.99, 0]),
    lane: "power",
  });
  if (getActionCooldownRemaining(state, state.actors[0].id, actionWithDerivedCooldown.id) !== 3) {
    throw new Error("Character power did not enter the Character Builder derived/display cooldown.");
  }
  expectTranscriptLine(state.transcriptLines, /Cooldown: Stale Character Cooldown enters cooldown 3/i, "derived character cooldown transcript");
}

{
  const base = makeFixturePower({
    id: "monster-authored-cooldown",
    name: "Monster Authored Cooldown",
    intention: "ATTACK",
    diceCount: 3,
    potency: 2,
    cooldownTurns: 2,
  });
  const { actor, warnings } = adaptMonsterToCombatLabActor(
    makeMonsterRow({
      powers: [monsterPowerRowFromFixture(base, { cooldownTurns: 2, cooldownReduction: 0 })],
    }),
    new Map(),
    DEFAULT_COMBAT_TUNING_VALUES,
  );
  const actionWithStoredCooldown = actor.actions.find(
    (candidate) => candidate.sourcePowerId === base.id && candidate.cooldownRounds === 2,
  );
  if (!actionWithStoredCooldown) {
    throw new Error(`Monster authored power cooldown was not preserved: ${JSON.stringify(actor.actions)}.`);
  }
  if (warnings.some((warning) => /stored cooldown/i.test(warning.message))) {
    throw new Error(`Stored monster cooldown path should not warn without derived tuning: ${JSON.stringify(warnings)}.`);
  }
}

{
  const derivedCooldownTwoTuning: PowerTuningSnapshot = {
    setId: "combat-lab-smoke-monster-derived-cooldown",
    name: "Combat Lab Smoke Monster Derived Cooldown",
    slug: "combat-lab-smoke-monster-derived-cooldown",
    status: "ACTIVE",
    updatedAt: new Date(0).toISOString(),
    values: {
      ...DEFAULT_POWER_TUNING_VALUES,
      "cooldown.load.lightMax": 0,
      "cooldown.load.moderateMax": 999,
      "cooldown.load.heavyMax": 1000,
    },
  };
  const base = makeFixturePower({
    id: "stale-monster-derived-cooldown",
    name: "Stale Monster Cooldown",
    intention: "ATTACK",
    diceCount: 3,
    potency: 2,
    cooldownTurns: 1,
  });
  const { actor, warnings } = adaptMonsterToCombatLabActor(
    makeMonsterRow({
      powers: [monsterPowerRowFromFixture(base, { cooldownTurns: 1, cooldownReduction: 0 })],
    }),
    new Map(),
    DEFAULT_COMBAT_TUNING_VALUES,
    derivedCooldownTwoTuning,
  );
  const actionWithDerivedCooldown = actor.actions.find(
    (candidate) => candidate.sourcePowerId === base.id && candidate.cooldownRounds === 2,
  );
  if (!actionWithDerivedCooldown) {
    throw new Error(`Monster power did not hydrate from Summoning Circle derived/display cooldown 2: ${JSON.stringify(actor.actions)}.`);
  }
  if (
    !warnings.some((warning) =>
      /stored cooldown 1 differs from Summoning Circle derived\/display cooldown 2; Combat Lab used 2/i.test(
        warning.message,
      ),
    )
  ) {
    throw new Error(
      `Monster stale cooldown mismatch warning was not reported: ${JSON.stringify(warnings)}.`,
    );
  }
  const target = fixtureActor("monster-derived-cooldown-target", "players", {
    dodgeDice: 1,
    physicalProtection: 0,
  });
  const state = createCombatState([target], [actor], { captureTranscript: true });
  state.currentTurnActorId = state.actors[1].id;
  resolveCombatAction({
    state,
    actor: state.actors[1],
    target: state.actors[0],
    action: actionWithDerivedCooldown,
    rng: rngFrom([0.99, 0]),
    lane: "power",
  });
  if (getActionCooldownRemaining(state, state.actors[1].id, actionWithDerivedCooldown.id) !== 2) {
    throw new Error("Monster power did not enter the Summoning Circle derived/display cooldown.");
  }
  expectTranscriptLine(state.transcriptLines, /Cooldown: Stale Monster Cooldown enters cooldown 2/i, "derived monster cooldown transcript");
}

{
  const missingCooldownBase = makeFixturePower({
    id: "missing-monster-cooldown",
    name: "Missing Monster Cooldown",
    intention: "ATTACK",
    diceCount: 3,
    potency: 2,
  });
  const { actor, warnings } = adaptMonsterToCombatLabActor(
    makeMonsterRow({
      powers: [
        monsterPowerRowFromFixture(missingCooldownBase, {
          cooldownTurns: undefined as unknown as number,
          cooldownReduction: 0,
        }),
      ],
    }),
    new Map(),
    DEFAULT_COMBAT_TUNING_VALUES,
  );
  const actionWithFallbackCooldown = actor.actions.find(
    (candidate) => candidate.sourcePowerId === missingCooldownBase.id && candidate.cooldownRounds === 1,
  );
  if (
    !actionWithFallbackCooldown ||
    !warnings.some((warning) => /Missing Monster Cooldown.*fallback cooldown 1/i.test(warning.message))
  ) {
    throw new Error(`Missing monster cooldown fallback was not reported: ${JSON.stringify({ actions: actor.actions, warnings })}.`);
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
  const hardeningPower = adaptPowerToCombatActions({
    ...makeFixturePower({
      id: "self-hardening-attribute",
      name: "Stone Skin",
      intention: "DEFENCE",
      diceCount: 3,
      potency: 4,
    }),
    effectPackets: [
      {
        ...makeFixturePower({
          id: "self-hardening-attribute-packet",
          name: "Stone Skin",
          intention: "DEFENCE",
          diceCount: 3,
          potency: 4,
        }).effectPackets[0],
        applyTo: "SELF" as const,
        effectDurationType: "PASSIVE" as const,
        detailsJson: { attackMode: "PHYSICAL" },
      },
    ],
  });
  if (hardeningPower.actions[0]?.accuracyAttribute !== "Fortitude") {
    throw new Error(`Self physical hardening defence should roll Fortitude, not Synergy: ${JSON.stringify(hardeningPower)}.`);
  }

  const forcefieldPower = adaptPowerToCombatActions({
    ...makeFixturePower({
      id: "self-forcefield-attribute",
      name: "Forcefield Guard",
      intention: "DEFENCE",
      diceCount: 3,
      potency: 4,
    }),
    effectPackets: [
      {
        ...makeFixturePower({
          id: "self-forcefield-attribute-packet",
          name: "Forcefield Guard",
          intention: "DEFENCE",
          diceCount: 3,
          potency: 4,
        }).effectPackets[0],
        applyTo: "SELF" as const,
        effectDurationType: "PASSIVE" as const,
        detailsJson: { attackMode: "PHYSICAL", defenceTheme: "forcefield" },
      },
    ],
  });
  if (forcefieldPower.actions[0]?.accuracyAttribute !== "Guard") {
    throw new Error(`Self forcefield/guard defence should roll Guard, not Synergy: ${JSON.stringify(forcefieldPower)}.`);
  }

  const interposeBase = makeFixturePower({
    id: "interpose-context-attribute",
    name: "Interpose Shield",
    intention: "DEFENCE",
    diceCount: 3,
    potency: 4,
    cooldownTurns: 2,
  });
  const interposePower = {
    ...interposeBase,
    counterMode: "YES" as const,
    effectPackets: [
      {
        ...interposeBase.effectPackets[0],
        applyTo: "PRIMARY_TARGET" as const,
        targetedAttribute: null,
        detailsJson: { attackMode: "PHYSICAL", rangeCategory: "MELEE", rangeValue: 1 },
      },
    ],
  };
  const interposeAdapted = adaptPowerToCombatActions(interposePower);
  const interpose = interposeAdapted.actions[0];
  if (
    !interpose ||
    interpose.targetPolicy !== "ally" ||
    interpose.accuracyAttribute !== "Synergy" ||
    interpose.contextualAccuracyAttributes?.self !== "Guard" ||
    interpose.contextualAccuracyAttributes?.ally !== "Synergy"
  ) {
    throw new Error(`Interpose-style ally-capable defence should default ally use to Synergy and self use to Guard: ${JSON.stringify(interposeAdapted)}.`);
  }

  const { actor: interposeHydratedActor } = adaptCampaignCharacterToCombatActor(
    makeCharacterRow({
      builderData: makeCharacterBuilderData({ powers: [interposePower] }),
      backpackItems: [],
    }),
    DEFAULT_COMBAT_TUNING_VALUES,
  );
  const hydratedInterpose = interposeHydratedActor.actions.find((candidate) => candidate.name === "Interpose Shield");
  if (
    !hydratedInterpose ||
    hydratedInterpose.targetPolicy !== "ally" ||
    hydratedInterpose.accuracyAttribute !== "Synergy" ||
    hydratedInterpose.contextualAccuracyAttributes?.self !== "Guard" ||
    hydratedInterpose.contextualAccuracyAttributes?.ally !== "Synergy"
  ) {
    throw new Error(`Character Builder Interpose-style defence did not preserve context-sensitive attributes: ${JSON.stringify(hydratedInterpose)}.`);
  }

  const interposeSelfState = createCombatState(
    [
      fixtureActor("interpose-tank", "players", {
        attributeDice: { Attack: "D8", Guard: "D12", Fortitude: "D8", Intellect: "D8", Synergy: "D4", Bravery: "D8" },
        actions: [interpose],
      }),
    ],
    [
      fixtureActor("interpose-attacker", "monsters", {
        actions: [action({ id: "interpose-trigger", name: "Swiping Claws", sourceType: "naturalAttack", diceCount: 1, potency: 10 })],
      }),
    ],
    { captureTranscript: true },
  );
  resolveCombatAction({
    state: interposeSelfState,
    actor: interposeSelfState.actors[1],
    target: interposeSelfState.actors[0],
    action: interposeSelfState.actors[1].actions[0],
    rng: rngFrom([0.99, 0.45, 0.45, 0.99]),
    lane: "main",
  });
  expectTranscriptLine(interposeSelfState.transcriptLines, /Counter declared: interpose-tank will use Interpose Shield against Swiping Claws/i, "Interpose self counter declaration");
  expectTranscriptLine(interposeSelfState.transcriptLines, /Roll: interpose-tank rolled 3 x D12 using Guard for Interpose Shield/i, "Interpose self Guard counter roll");
  if (interposeSelfState.transcriptLines.some((line) => /using Synergy for Interpose Shield/i.test(line))) {
    throw new Error(`Self Interpose Shield used Synergy instead of Guard: ${interposeSelfState.transcriptLines.join(" | ")}`);
  }
  const interposeCounterRoll = interposeSelfState.transcriptEvents.find(
    (event) => event.type === "counterRoll" && event.actionName === "Interpose Shield" && event.roll?.attribute === "Guard",
  );
  if (
    !interposeCounterRoll ||
    interposeCounterRoll.details?.protectedActorId !== interposeSelfState.actors[0].id ||
    interposeCounterRoll.details?.triggeringAttackerId !== interposeSelfState.actors[1].id
  ) {
    throw new Error(`Interpose self Counter did not carry protected/triggering actor context: ${JSON.stringify(interposeSelfState.transcriptEvents)}`);
  }

  const interposeSuiteReport = runScenarioSuite({
    name: "real-shaped Tank Interpose self Counter",
    players: [
      fixtureActor("suite-interpose-tank", "players", {
        name: "CL-L3-Tank",
        role: "Tank",
        attributeDice: { Attack: "D8", Guard: "D12", Fortitude: "D8", Intellect: "D8", Synergy: "D10", Bravery: "D8" },
        physicalHpMax: 100,
        mentalHpMax: 100,
        actions: [interpose],
      }),
    ],
    monsters: [
      fixtureActor("suite-dire-wolf", "monsters", {
        name: "Dire Wolf",
        role: "Elite",
        actions: [
          action({
            id: "suite-swiping-claws",
            name: "Swiping Claws",
            sourceType: "power",
            kind: "attack",
            targetPolicy: "enemy",
            diceCount: 4,
            potency: 8,
            cooldownRounds: 1,
          }),
        ],
      }),
    ],
    runs: 1,
    seed: 1401,
    maxRounds: 1,
    turnOrder: "monstersFirst",
  });
  const interposeSuiteLines = interposeSuiteReport.firstRunTranscript?.lines ?? [];
  expectTranscriptLine(interposeSuiteLines, /Counter declared: CL-L3-Tank will use Interpose Shield against Swiping Claws/i, "suite Interpose self counter declaration");
  expectTranscriptLine(interposeSuiteLines, /Roll: CL-L3-Tank rolled 3 x D12 using Guard for Interpose Shield/i, "suite Interpose self Guard roll");
  if (interposeSuiteLines.some((line) => /using Synergy for Interpose Shield/i.test(line))) {
    throw new Error(`Suite-shaped Tank Interpose path used Synergy: ${interposeSuiteLines.join(" | ")}`);
  }

  const interposeAllyState = createCombatState(
    [
      fixtureActor("interpose-protector", "players", {
        attributeDice: { Attack: "D8", Guard: "D12", Fortitude: "D8", Intellect: "D8", Synergy: "D6", Bravery: "D8" },
        actions: [interpose],
      }),
      fixtureActor("interpose-ally", "players"),
    ],
    [],
    { captureTranscript: true },
  );
  resolveCombatAction({
    state: interposeAllyState,
    actor: interposeAllyState.actors[0],
    target: interposeAllyState.actors[1],
    action: interpose,
    rng: rngFrom([0.99, 0.45, 0.45]),
    lane: "response",
  });
  expectTranscriptLine(interposeAllyState.transcriptLines, /Roll: interpose-protector rolled 3 x D6 using Synergy for Interpose Shield/i, "Interpose ally Synergy roll");

  const damageCounterAction = {
    ...action({
      id: "damage-counter-attribute",
      name: "Riposte",
      sourceType: "power",
      kind: "attack",
      targetPolicy: "enemy",
      counterMode: true,
      accuracyAttribute: "Attack",
      diceCount: 3,
      potency: 3,
      cooldownRounds: 1,
    }),
  };
  const damageCounterState = createCombatState(
    [
      fixtureActor("damage-counter-defender", "players", {
        attributeDice: { Attack: "D10", Guard: "D4", Fortitude: "D8", Intellect: "D8", Synergy: "D4", Bravery: "D8" },
        actions: [damageCounterAction],
      }),
    ],
    [
      fixtureActor("damage-counter-attacker", "monsters", {
        actions: [action({ id: "damage-counter-trigger", name: "Bite", sourceType: "naturalAttack", diceCount: 1, potency: 5 })],
      }),
    ],
    { captureTranscript: true },
  );
  resolveCombatAction({
    state: damageCounterState,
    actor: damageCounterState.actors[1],
    target: damageCounterState.actors[0],
    action: damageCounterState.actors[1].actions[0],
    rng: rngFrom([0.99, 0.45, 0.45, 0.99]),
    lane: "main",
  });
  expectTranscriptLine(damageCounterState.transcriptLines, /Roll: damage-counter-defender rolled 3 x D10 using Attack for Riposte/i, "damage counter Attack roll");

  const deflectPower = adaptPowerToCombatActions({
    ...makeFixturePower({
      id: "deflect-counter-attribute",
      name: "Deflect attack",
      intention: "DEFENCE",
      diceCount: 3,
      potency: 5,
      cooldownTurns: 2,
    }),
    counterMode: "YES",
    effectPackets: [
      {
        ...makeFixturePower({
          id: "deflect-counter-attribute-packet",
          name: "Deflect attack",
          intention: "DEFENCE",
          diceCount: 3,
          potency: 5,
        }).effectPackets[0],
        applyTo: "PRIMARY_TARGET" as const,
        detailsJson: { attackMode: "PHYSICAL", rangeCategory: "SELF" },
      },
    ],
  });
  const deflect = deflectPower.actions[0];
  if (!deflect || deflect.targetPolicy !== "self" || deflect.accuracyAttribute !== "Guard" || deflect.counterMode !== true) {
    throw new Error(`Deflect-style self Counter defence should target self and roll Guard, not Synergy: ${JSON.stringify(deflectPower)}.`);
  }

  const deflectState = createCombatState(
    [
      fixtureActor("deflect-defender", "players", {
        attributeDice: { Attack: "D8", Guard: "D6", Fortitude: "D8", Intellect: "D8", Synergy: "D12", Bravery: "D8" },
        actions: [deflect],
      }),
    ],
    [
      fixtureActor("deflect-attacker", "monsters", {
        actions: [action({ id: "deflect-trigger", name: "Tusk Club", sourceType: "naturalAttack", diceCount: 1, potency: 10 })],
      }),
    ],
    { captureTranscript: true },
  );
  const deflectResolution = resolveCombatAction({
    state: deflectState,
    actor: deflectState.actors[1],
    target: deflectState.actors[0],
    action: deflectState.actors[1].actions[0],
    rng: rngFrom([0.99, 0.45, 0.6, 0.7, 0]),
    lane: "main",
  });
  expectTranscriptLine(deflectState.transcriptLines, /Counter declared: deflect-defender will use Deflect attack against Tusk Club/i, "Deflect counter declaration");
  expectTranscriptLine(deflectState.transcriptLines, /Counter replacement: Deflect attack replaces normal Dodge, Physical Defence, Mental Defence, or Resist/i, "Deflect counter replacement");
  expectTranscriptLine(deflectState.transcriptLines, /Roll: deflect-defender rolled 3 x D6 using Guard for Deflect attack/i, "Deflect counter Guard roll");
  expectTranscriptLine(deflectState.transcriptLines, /Counter mitigation: deflect-defender's Deflect attack prevents/i, "Deflect counter mitigation");
  if (deflectResolution.counterMitigation <= 0 || deflectResolution.dodgeChosen !== 0 || deflectResolution.physicalDefenceChosen !== 0) {
    throw new Error(`Deflect counter should mitigate without stacking Dodge or normal physical defence: ${JSON.stringify(deflectResolution)}.`);
  }
  if (deflectState.transcriptLines.some((line) => /Defence choice: deflect-defender chooses|Dodge succeeded|Dodge failed|using Guard for physical defence/i.test(line))) {
    throw new Error(`Deflect counter stacked a normal active defence: ${deflectState.transcriptLines.join(" | ")}`);
  }
  if (deflectState.transcriptLines.some((line) => /Deflect attack: .*using Synergy|using Synergy for Deflect attack/i.test(line))) {
    throw new Error(`Deflect counter used Synergy instead of Guard: ${deflectState.transcriptLines.join(" | ")}`);
  }

  const dodgeCounterPower = adaptPowerToCombatActions({
    ...makeFixturePower({
      id: "dodge-counter-power",
      name: "Slip Aside",
      intention: "DEFENCE",
      diceCount: 3,
      potency: 1,
      cooldownTurns: 1,
    }),
    counterMode: "YES",
    effectPackets: [
      {
        ...makeFixturePower({
          id: "dodge-counter-packet",
          name: "Slip Aside",
          intention: "DEFENCE",
          diceCount: 3,
          potency: 1,
        }).effectPackets[0],
        applyTo: "SELF" as const,
        detailsJson: { defenceMode: "Dodge", attackMode: "PHYSICAL", defenceTheme: "dodge" },
      },
    ],
  });
  const dodgeCounter = dodgeCounterPower.actions[0];
  if (!dodgeCounter || dodgeCounter.defenceMode !== "Dodge" || dodgeCounter.protection !== undefined) {
    throw new Error(`Dodge defence packet should hydrate as Dodge, not Block/protection: ${JSON.stringify(dodgeCounterPower)}.`);
  }
  const dodgeCounterState = createCombatState(
    [
      fixtureActor("dodge-counter-defender", "players", {
        attributeDice: { Attack: "D8", Guard: "D12", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
        dodgeDice: 1,
        physicalDefenceDice: 1,
        physicalBlockPerSuccess: 0,
        actions: [dodgeCounter],
      }),
    ],
    [
      fixtureActor("dodge-counter-attacker", "monsters", {
        actions: [action({ id: "dodge-counter-trigger", name: "Claw Strike", sourceType: "naturalAttack", diceCount: 2, potency: 10 })],
      }),
    ],
    { captureTranscript: true },
  );
  const dodgeCounterResolution = resolveCombatAction({
    state: dodgeCounterState,
    actor: dodgeCounterState.actors[1],
    target: dodgeCounterState.actors[0],
    action: dodgeCounterState.actors[1].actions[0],
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99]),
    lane: "main",
  });
  expectTranscriptLine(dodgeCounterState.transcriptLines, /Dodge Counter: dodge-counter-defender's Slip Aside rolls 6 successes x 1 = 6 Dodge against 2 incoming successes; the attack is avoided/i, "Dodge counter avoidance");
  if (
    dodgeCounterResolution.woundsAvoidedByDodge <= 0 ||
    dodgeCounterResolution.netWounds !== 0 ||
    dodgeCounterResolution.physicalDefenceChosen !== 0 ||
    dodgeCounterState.transcriptLines.some((line) => /Defence choice: dodge-counter-defender chooses|using Guard for physical defence/i.test(line))
  ) {
    throw new Error(`Dodge counter should replace normal active defence and avoid the attack: ${JSON.stringify({ resolution: dodgeCounterResolution, transcript: dodgeCounterState.transcriptLines })}.`);
  }

  const monsterDodgeCounterState = createCombatState(
    [
      fixtureActor("monster-dodge-attacker", "players", {
        actions: [action({ id: "monster-dodge-trigger", name: "Heavy Axe", sourceType: "equippedWeapon", diceCount: 2, potency: 10 })],
      }),
    ],
    [
      fixtureActor("monster-dodge-defender", "monsters", {
        attributeDice: { Attack: "D8", Guard: "D12", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
        dodgeDice: 1,
        physicalDefenceDice: 1,
        physicalBlockPerSuccess: 0,
        actions: [dodgeCounter],
      }),
    ],
    { captureTranscript: true },
  );
  const monsterDodgeCounterResolution = resolveCombatAction({
    state: monsterDodgeCounterState,
    actor: monsterDodgeCounterState.actors[0],
    target: monsterDodgeCounterState.actors[1],
    action: monsterDodgeCounterState.actors[0].actions[0],
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99]),
    lane: "main",
  });
  expectTranscriptLine(monsterDodgeCounterState.transcriptLines, /Counter declared: monster-dodge-defender will use Slip Aside against Heavy Axe/i, "monster Dodge counter declaration");
  expectTranscriptLine(monsterDodgeCounterState.transcriptLines, /Dodge Counter: monster-dodge-defender's Slip Aside rolls 6 successes x 1 = 6 Dodge against 2 incoming successes; the attack is avoided/i, "monster Dodge counter avoidance");
  if (
    monsterDodgeCounterResolution.counterChosen !== 1 ||
    monsterDodgeCounterResolution.responsesUsed !== 1 ||
    monsterDodgeCounterResolution.woundsAvoidedByDodge <= 0 ||
    monsterDodgeCounterResolution.physicalDefenceChosen !== 0
  ) {
    throw new Error(`Monster Dodge Counter should be legal and chosen when its EV is competitive: ${JSON.stringify({ resolution: monsterDodgeCounterResolution, transcript: monsterDodgeCounterState.transcriptLines })}.`);
  }

  const monsterFailedDodgeCounterState = createCombatState(
    [
      fixtureActor("failed-monster-dodge-attacker", "players", {
        actions: [action({ id: "failed-monster-dodge-trigger", name: "Accurate Spear", sourceType: "equippedWeapon", diceCount: 2, potency: 5 })],
      }),
    ],
    [
      fixtureActor("failed-monster-dodge-defender", "monsters", {
        attributeDice: { Attack: "D8", Guard: "D12", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
        dodgeDice: 1,
        physicalDefenceDice: 1,
        physicalBlockPerSuccess: 0,
        actions: [dodgeCounter],
      }),
    ],
    { captureTranscript: true },
  );
  const monsterFailedDodgeCounterResolution = resolveCombatAction({
    state: monsterFailedDodgeCounterState,
    actor: monsterFailedDodgeCounterState.actors[0],
    target: monsterFailedDodgeCounterState.actors[1],
    action: monsterFailedDodgeCounterState.actors[0].actions[0],
    rng: rngFrom([0.01, 0.01, 0.01, 0.99, 0.99]),
    lane: "main",
  });
  expectTranscriptLine(monsterFailedDodgeCounterState.transcriptLines, /Dodge Counter: failed-monster-dodge-defender's Slip Aside rolls 0 successes x 1 = 0 Dodge against 2 incoming successes; the attack is not avoided/i, "failed monster Dodge counter");
  if (
    monsterFailedDodgeCounterResolution.counterChosen !== 1 ||
    monsterFailedDodgeCounterResolution.netWounds <= 0 ||
    monsterFailedDodgeCounterResolution.physicalDefenceChosen !== 0 ||
    monsterFailedDodgeCounterState.transcriptLines.some((line) => /Defence choice: failed-monster-dodge-defender chooses|using Guard for physical defence/i.test(line))
  ) {
    throw new Error(`Failed Dodge Counter should not stack normal active defence and should allow incoming damage: ${JSON.stringify({ resolution: monsterFailedDodgeCounterResolution, transcript: monsterFailedDodgeCounterState.transcriptLines })}.`);
  }

  const strongNormalDefenceState = createCombatState(
    [
      fixtureActor("strong-defence-attacker", "players", {
        actions: [action({ id: "strong-defence-trigger", name: "Low Pressure Cut", sourceType: "equippedWeapon", diceCount: 1, potency: 4 })],
      }),
    ],
    [
      fixtureActor("strong-defence-monster", "monsters", {
        attributeDice: { Attack: "D8", Guard: "D4", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
        dodgeDice: 1,
        physicalDefenceDice: 4,
        physicalBlockPerSuccess: 20,
        actions: [dodgeCounter],
      }),
    ],
    { captureTranscript: true },
  );
  const strongNormalDefenceResolution = resolveCombatAction({
    state: strongNormalDefenceState,
    actor: strongNormalDefenceState.actors[0],
    target: strongNormalDefenceState.actors[1],
    action: strongNormalDefenceState.actors[0].actions[0],
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99]),
    lane: "main",
  });
  expectTranscriptLine(strongNormalDefenceState.transcriptLines, /Counter skipped: strong-defence-monster keeps normal defence instead of Slip Aside/i, "Dodge counter skipped by EV");
  if (
    strongNormalDefenceResolution.counterChosen !== 0 ||
    strongNormalDefenceResolution.physicalDefenceChosen !== 1 ||
    !strongNormalDefenceState.counterCandidateDiagnostics[`${strongNormalDefenceState.actors[1].id}:${dodgeCounter.id}`] ||
    strongNormalDefenceState.counterCandidateDiagnostics[`${strongNormalDefenceState.actors[1].id}:${dodgeCounter.id}`]?.skippedNormalDefenceBetter !== 1 ||
    !strongNormalDefenceState.transcriptLines.some((line) => /Defence choice: strong-defence-monster chooses physical defence/i.test(line))
  ) {
    throw new Error(`Strong normal defence should be allowed to skip Dodge Counter: ${JSON.stringify({ resolution: strongNormalDefenceResolution, transcript: strongNormalDefenceState.transcriptLines })}.`);
  }

  const skippedCounterSuite = runScenarioSuite({
    name: "monster skipped Dodge Counter diagnostics",
    players: [
      fixtureActor("suite-strong-defence-attacker", "players", {
        actions: [action({ id: "suite-strong-defence-trigger", name: "Player Dagger", sourceType: "equippedWeapon", diceCount: 1, potency: 4 })],
      }),
    ],
    monsters: [
      fixtureActor("suite-strong-defence-monster", "monsters", {
        attributeDice: { Attack: "D8", Guard: "D4", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
        dodgeDice: 1,
        physicalDefenceDice: 4,
        physicalBlockPerSuccess: 20,
        actions: [dodgeCounter],
      }),
    ],
    runs: 1,
    seed: 1727,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  const skippedDiagnostic = skippedCounterSuite.counterCandidateDiagnostics.find(
    (entry) => entry.actionName === "Slip Aside" && entry.actorName === "suite-strong-defence-monster",
  );
  if (
    !skippedDiagnostic ||
    skippedDiagnostic.considered <= 0 ||
    skippedDiagnostic.selected !== 0 ||
    skippedDiagnostic.skippedNormalDefenceBetter <= 0 ||
    skippedDiagnostic.expectedSamples <= 0 ||
    skippedDiagnostic.totalExpectedNormalPrevention <= skippedDiagnostic.totalExpectedCounterPrevention
  ) {
    throw new Error(`Report-level skipped Dodge Counter diagnostics were not populated: ${JSON.stringify(skippedCounterSuite.counterCandidateDiagnostics)}.`);
  }

  const monsterCounterSuite = runScenarioSuite({
    name: "monster Dodge Counter metrics",
    players: [
      fixtureActor("suite-dodge-counter-attacker", "players", {
        actions: [action({ id: "suite-dodge-counter-trigger", name: "Player Axe", sourceType: "equippedWeapon", diceCount: 2, potency: 10 })],
      }),
    ],
    monsters: [
      fixtureActor("suite-dodge-counter-monster", "monsters", {
        attributeDice: { Attack: "D8", Guard: "D12", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
        dodgeDice: 1,
        physicalDefenceDice: 1,
        physicalBlockPerSuccess: 0,
        actions: [dodgeCounter],
      }),
    ],
    runs: 1,
    seed: 1728,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  if (
    monsterCounterSuite.averageMechanics.counterChosen.monsters <= 0 ||
    monsterCounterSuite.averageMechanics.counterUses.monsters <= 0 ||
    monsterCounterSuite.averageMechanics.responsesUsed.monsters <= 0 ||
    !monsterCounterSuite.counterCandidateDiagnostics.some(
      (entry) => entry.actionName === "Slip Aside" && entry.side === "monsters" && entry.selected > 0,
    )
  ) {
    throw new Error(`Monster Dodge Counter did not increment monster-side report metrics/diagnostics: ${JSON.stringify({ mechanics: monsterCounterSuite.averageMechanics, diagnostics: monsterCounterSuite.counterCandidateDiagnostics })}.`);
  }

  const resistCounterPower = adaptPowerToCombatActions({
    ...makeFixturePower({
      id: "resist-counter-power",
      name: "Steel Mind",
      intention: "DEFENCE",
      diceCount: 3,
      potency: 2,
      cooldownTurns: 1,
    }),
    counterMode: "YES",
    effectPackets: [
      {
        ...makeFixturePower({
          id: "resist-counter-packet",
          name: "Steel Mind",
          intention: "DEFENCE",
          diceCount: 3,
          potency: 2,
        }).effectPackets[0],
        applyTo: "SELF" as const,
        detailsJson: { defenceMode: "Resist", resistedAttribute: "BRAVERY", attackMode: "MENTAL" },
      },
    ],
  });
  const resistCounter = resistCounterPower.actions[0];
  if (!resistCounter || resistCounter.defenceMode !== "Resist" || resistCounter.defenceResistedAttribute !== "BRAVERY") {
    throw new Error(`Resist defence packet should hydrate resistedAttribute: ${JSON.stringify(resistCounterPower)}.`);
  }
  const resistCounterState = createCombatState(
    [
      fixtureActor("resist-counter-defender", "players", {
        attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D12" },
        resist: { BRAVERY: 0 },
        actions: [resistCounter],
      }),
    ],
    [
      fixtureActor("resist-counter-attacker", "monsters", {
        actions: [
          action({
            id: "resist-counter-trigger",
            name: "Dread Command",
            sourceType: "power",
            kind: "control",
            targetPolicy: "enemy",
            diceCount: 2,
            potency: 2,
            resistAttribute: "BRAVERY",
            cooldownRounds: 0,
          }),
        ],
      }),
    ],
    { captureTranscript: true },
  );
  const resistCounterResolution = resolveCombatAction({
    state: resistCounterState,
    actor: resistCounterState.actors[1],
    target: resistCounterState.actors[0],
    action: resistCounterState.actors[1].actions[0],
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99]),
    lane: "power",
  });
  expectTranscriptLine(resistCounterState.transcriptLines, /Resist Counter: resist-counter-defender's Steel Mind rolls 3 successes x 2 = 6 BRAVERY Resists; cancelled 2 of 2 hostile successes/i, "Resist counter cancellation");
  if (
    resistCounterResolution.hostileSuccessesCancelledByResist !== 2 ||
    resistCounterResolution.controlTurnsApplied !== 0 ||
    resistCounterState.statusEffects.some((effect) => effect.kind === "mainActionDenied")
  ) {
    throw new Error(`Resist counter should cancel matching hostile control successes: ${JSON.stringify({ resolution: resistCounterResolution, transcript: resistCounterState.transcriptLines })}.`);
  }

  const nonmatchingResistCounterState = createCombatState(
    [
      fixtureActor("nonmatching-resist-defender", "players", {
        actions: [resistCounter],
      }),
    ],
    [
      fixtureActor("nonmatching-resist-attacker", "monsters", {
        actions: [action({ id: "nonmatching-attack", name: "Sword Cut", sourceType: "naturalAttack", diceCount: 1, potency: 4 })],
      }),
    ],
    { captureTranscript: true },
  );
  resolveCombatAction({
    state: nonmatchingResistCounterState,
    actor: nonmatchingResistCounterState.actors[1],
    target: nonmatchingResistCounterState.actors[0],
    action: nonmatchingResistCounterState.actors[1].actions[0],
    rng: rngFrom([0.99, 0.99, 0.99]),
    lane: "main",
  });
  if (nonmatchingResistCounterState.transcriptLines.some((line) => /Counter declared: nonmatching-resist-defender will use Steel Mind/i.test(line))) {
    throw new Error(`Nonmatching Resist counter should not be tactically chosen against a plain physical attack: ${nonmatchingResistCounterState.transcriptLines.join(" | ")}`);
  }

  const authoredResistCleanupState = createCombatState(
    [
      fixtureActor("authored-resist-cleaner", "players", {
        attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D12" },
        actions: [resistCounter],
      }),
    ],
    [
      fixtureActor("authored-resist-source", "monsters"),
    ],
    { captureTranscript: true },
  );
  authoredResistCleanupState.statusEffects.push({
    id: "hostile-bravery-stack",
    sourceActorId: authoredResistCleanupState.actors[1].id,
    targetActorId: authoredResistCleanupState.actors[0].id,
    kind: "mainActionDenied",
    amount: 4,
    cleanupAttribute: "Bravery",
    sourceActionId: "fear-net",
    sourceActionName: "Fear Net",
    remainingRounds: 3,
  });
  const authoredResistCleanupResolution = resolveCombatAction({
    state: authoredResistCleanupState,
    actor: authoredResistCleanupState.actors[0],
    target: authoredResistCleanupState.actors[0],
    action: { ...resistCounter, counterMode: false, cooldownRounds: 0 },
    rng: rngFrom([0.99, 0.99, 0.99]),
    lane: "main",
  });
  expectTranscriptLine(authoredResistCleanupState.transcriptLines, /Resist: Steel Mind rolls 3 successes x 2 = 6 BRAVERY Resists against Fear Net/i, "normal authored Resist cleanup roll");
  if (
    authoredResistCleanupResolution.stacksCleansed !== 4 ||
    authoredResistCleanupState.statusEffects.some((effect) => effect.id === "hostile-bravery-stack")
  ) {
    throw new Error(`Normal-use authored Resist should clean matching hostile stacks: ${JSON.stringify({ resolution: authoredResistCleanupResolution, effects: authoredResistCleanupState.statusEffects, transcript: authoredResistCleanupState.transcriptLines })}.`);
  }

  const inconsistentExplicitDeflect = adaptPowerToCombatActions({
    ...makeFixturePower({
      id: "deflect-explicit-synergy",
      name: "Deflect explicit Synergy",
      intention: "DEFENCE",
      diceCount: 3,
      potency: 5,
      cooldownTurns: 2,
    }),
    counterMode: "YES",
    effectPackets: [
      {
        ...makeFixturePower({
          id: "deflect-explicit-synergy-packet",
          name: "Deflect explicit Synergy",
          intention: "DEFENCE",
          diceCount: 3,
          potency: 5,
        }).effectPackets[0],
        applyTo: "SELF" as const,
        targetedAttribute: "SYNERGY" as const,
        detailsJson: { attackMode: "PHYSICAL", defenceTheme: "deflect" },
      },
    ],
  });
  if (
    inconsistentExplicitDeflect.actions[0]?.accuracyAttribute !== "Guard" ||
    !inconsistentExplicitDeflect.warnings.some((warning) => /authored roll attribute Synergy.*used Guard/i.test(warning))
  ) {
    throw new Error(`Inconsistent self-defence authored Synergy should warn and resolve to Guard: ${JSON.stringify(inconsistentExplicitDeflect)}.`);
  }

  const allyDefence = adaptPowerToCombatActions(makeFixturePower({
    id: "ally-defence-attribute",
    name: "Cover Ally",
    intention: "DEFENCE",
    diceCount: 3,
    potency: 2,
    applyTo: "ALLIES",
    durationTurns: 1,
  }));
  if (allyDefence.actions[0]?.accuracyAttribute !== "Synergy") {
    throw new Error(`Ally-targeted defence should still roll Synergy: ${JSON.stringify(allyDefence)}.`);
  }

  const allyBuff = adaptPowerToCombatActions(makeFixturePower({
    id: "ally-buff-attribute",
    name: "Battle Coordination",
    intention: "AUGMENT",
    diceCount: 3,
    potency: 2,
    applyTo: "ALLIES",
    statTarget: "Attack",
    durationTurns: 2,
  }));
  if (allyBuff.actions[0]?.accuracyAttribute !== "Synergy") {
    throw new Error(`Ally-targeted buff should still roll Synergy: ${JSON.stringify(allyBuff)}.`);
  }

  const selfAttackBuff = adaptPowerToCombatActions(makeFixturePower({
    id: "self-attack-buff-attribute",
    name: "Killing Focus",
    intention: "AUGMENT",
    diceCount: 3,
    potency: 2,
    applyTo: "SELF",
    statTarget: "Attack",
    durationTurns: 2,
  }));
  if (selfAttackBuff.actions[0]?.accuracyAttribute !== "Attack") {
    throw new Error(`Self attack-amplification buff should roll Attack: ${JSON.stringify(selfAttackBuff)}.`);
  }

  const mentalResolve = adaptPowerToCombatActions({
    ...makeFixturePower({
      id: "self-mental-resolve-attribute",
      name: "Fearless Resolve",
      intention: "DEFENCE",
      pool: "mental",
      diceCount: 3,
      potency: 4,
    }),
    effectPackets: [
      {
        ...makeFixturePower({
          id: "self-mental-resolve-attribute-packet",
          name: "Fearless Resolve",
          intention: "DEFENCE",
          pool: "mental",
          diceCount: 3,
          potency: 4,
        }).effectPackets[0],
        applyTo: "SELF" as const,
        detailsJson: { attackMode: "MENTAL", defenceTheme: "resolve" },
      },
    ],
  });
  if (mentalResolve.actions[0]?.accuracyAttribute !== "Bravery") {
    throw new Error(`Self mental resolve defence should roll Bravery: ${JSON.stringify(mentalResolve)}.`);
  }

  const mentalFocus = adaptPowerToCombatActions({
    ...makeFixturePower({
      id: "self-mental-focus-attribute",
      name: "Focused Mind",
      intention: "DEFENCE",
      pool: "mental",
      diceCount: 3,
      potency: 4,
    }),
    effectPackets: [
      {
        ...makeFixturePower({
          id: "self-mental-focus-attribute-packet",
          name: "Focused Mind",
          intention: "DEFENCE",
          pool: "mental",
          diceCount: 3,
          potency: 4,
        }).effectPackets[0],
        applyTo: "SELF" as const,
        detailsJson: { attackMode: "MENTAL", defenceTheme: "focus" },
      },
    ],
  });
  if (mentalFocus.actions[0]?.accuracyAttribute !== "Intellect") {
    throw new Error(`Self cognitive/focus defence should roll Intellect: ${JSON.stringify(mentalFocus)}.`);
  }

  const damageCounter = adaptPowerToCombatActions({
    ...makeFixturePower({
      id: "damage-counter-attribute",
      name: "Counterstrike",
      intention: "ATTACK",
      diceCount: 3,
      potency: 2,
      cooldownTurns: 2,
    }),
    counterMode: "YES",
  });
  if (damageCounter.actions[0]?.accuracyAttribute !== "Attack") {
    throw new Error(`Damage Counter should still roll Attack: ${JSON.stringify(damageCounter)}.`);
  }
}

{
  const base = makeFixturePower({
    id: "iron-skin-fixture",
    name: "Iron Skin",
    intention: "DEFENCE",
    diceCount: 4,
    potency: 5,
    cooldownTurns: 4,
  });
  const primary = {
    ...base.effectPackets[0],
    intention: "DEFENCE" as const,
    type: "DEFENCE" as const,
    applyTo: "SELF" as const,
    diceCount: 4,
    potency: 5,
    effectDurationType: "PASSIVE" as const,
    effectDurationTurns: null,
    detailsJson: { attackMode: "PHYSICAL" },
  };
  const linkedGuard = {
    ...primary,
    id: "iron-skin-guard",
    sortOrder: 1,
    packetIndex: 1,
    intention: "AUGMENT" as const,
    type: "AUGMENT" as const,
    targetedAttribute: "GUARD" as const,
    potency: 5,
    effectDurationType: "INSTANT" as const,
    effectDurationTurns: null,
    detailsJson: { statTarget: "Guard" },
  };
  const adapted = adaptPowerToCombatActions({
    ...base,
    effectPackets: [primary, linkedGuard],
    intentions: [primary, linkedGuard],
    cooldownTurns: 4,
    cooldownReduction: 0,
    counterMode: "NO",
  });
  const ironSkin = adapted.actions[0];
  if (
    !ironSkin ||
    ironSkin.kind !== "defence" ||
    ironSkin.targetPolicy !== "self" ||
    ironSkin.pool !== "physical" ||
    ironSkin.protection !== 5 ||
    ironSkin.accuracyAttribute !== "Fortitude" ||
    ironSkin.passive ||
    ironSkin.cooldownRounds !== 4 ||
    ironSkin.durationRounds === undefined ||
    ironSkin.durationRounds < 20 ||
    ironSkin.durationKind !== "passive" ||
    ironSkin.durationSource !== "authored" ||
    ironSkin.passiveDuration !== true ||
    ironSkin.secondaryActions?.[0]?.durationKind !== "passive" ||
    ironSkin.secondaryActions?.[0]?.durationSource !== "inheritedFromParent" ||
    ironSkin.secondaryActions?.[0]?.passiveDuration !== true ||
    ironSkin.secondaryActions?.[0]?.name !== "Iron Skin (+Guard)"
  ) {
    throw new Error(`Iron Skin did not hydrate as a usable passive physical defence power: ${JSON.stringify(adapted)}.`);
  }

  const glassCannon = fixtureActor("CL-L3-Glass-Cannon", "players", {
    attributeDice: { Attack: "D12", Guard: "D8", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
    actions: [
      action({ id: "glass-cannon-burst", name: "Glass Cannon Burst", diceCount: 4, potency: 8 }),
      action({
        id: "counterstrike-fixture",
        name: "Counterstrike",
        sourceType: "power",
        kind: "attack",
        targetPolicy: "enemy",
        diceCount: 1,
        potency: 20,
        counterMode: true,
      }),
    ],
  });
  const wolf = fixtureActor("Wolf Berzerker", "monsters", {
    attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D10", Intellect: "D8", Synergy: "D4", Bravery: "D8" },
    physicalHpMax: 200,
    physicalHpCurrent: 200,
    physicalProtection: 0,
    mentalProtection: 0,
    dodgeDice: 0,
    physicalDefenceDice: 0,
    mentalDefenceDice: 0,
    actions: [
      ironSkin,
      action({ id: "wolf-claw-after-iron-skin", name: "Wolf Claw", sourceType: "naturalAttack", diceCount: 1, potency: 1 }),
    ],
  });
  const state = createCombatState([glassCannon], [wolf], { captureTranscript: true });
  if (chooseTurnAction(state.actors[1], state, "power")?.id !== ironSkin.id) {
    throw new Error("Iron Skin was not chosen as an early useful Power Action against physical burst.");
  }
  const laneOrder = chooseActionLaneOrder(state.actors[1], state, false);
  if (laneOrder.lanes.join(",") !== "power,main" || laneOrder.setupActionId !== ironSkin.id) {
    throw new Error(`Iron Skin was not prioritized before the main lane: ${JSON.stringify(laneOrder)}.`);
  }
  const ironResolution = resolveCombatAction({
    state,
    actor: state.actors[1],
    target: state.actors[1],
    action: ironSkin,
    rng: rngFrom([0.3, 0.3, 0.3, 0]),
    lane: "power",
  });
  const protection = state.statusEffects.find((effect) => effect.kind === "protection" && effect.sourceActionName === "Iron Skin");
  const guardBuff = state.statusEffects.find((effect) => effect.kind === "buff" && effect.sourceActionName === "Iron Skin (+Guard)");
  if (!protection || protection.amount !== 15 || protection.pool !== "physical" || ironResolution.mitigationApplied !== 15) {
    throw new Error(`Iron Skin did not create 3 x 5 passive physical blocking: ${JSON.stringify({ protection, ironResolution })}.`);
  }
  if (!guardBuff || guardBuff.attribute !== "Guard" || guardBuff.amount !== 15) {
    throw new Error(`Iron Skin linked +Guard rider did not scale by applied primary successes: ${JSON.stringify(state.statusEffects)}.`);
  }
  if (guardBuff.modifiesRollResults !== false || ironSkin.secondaryActions?.[0]?.modifier?.modifiesRollResults !== false) {
    throw new Error(`Iron Skin linked +Guard rider should be tracked as passive status, not a Guard dice modifier: ${JSON.stringify({ guardBuff, secondary: ironSkin.secondaryActions?.[0] })}.`);
  }
  if (getActionCooldownRemaining(state, state.actors[1].id, ironSkin.id) !== 0) {
    throw new Error("Passive-duration Iron Skin entered cooldown immediately on cast.");
  }
  if (chooseTurnAction(state.actors[1], state, "power")?.id === ironSkin.id) {
    throw new Error("Iron Skin was selected again while its active protection was already present.");
  }
  expectTranscriptLine(state.transcriptLines, /Roll: Wolf Berzerker rolled 4 x D10 using Fortitude for Iron Skin/i, "Iron Skin Fortitude roll transcript");
  expectTranscriptLine(state.transcriptLines, /Passive defence: Iron Skin grants Wolf Berzerker 3 x 5 = 15 passive physical wound blocking until it ends or is removed/i, "Iron Skin passive defence transcript");
  expectTranscriptLine(state.transcriptLines, /Buff\/status created: Iron Skin \(\+Guard\) grants 3 stacks of \+5 Guard .* until ended or removed/i, "Iron Skin linked Guard passive transcript");
  expectTranscriptLine(state.transcriptLines, /Iron Skin \(\+Guard\).*does not modify roll results/i, "Iron Skin linked Guard non-roll transcript");
  expectTranscriptLine(state.transcriptLines, /Status created: Iron Skin remains active until ended or removed/i, "Iron Skin passive status transcript");
  expectTranscriptLine(state.transcriptLines, /Status created: Iron Skin \(\+Guard\) remains active until ended or removed/i, "Iron Skin linked passive status transcript");
  if (state.transcriptLines.some((line) => /Iron Skin.*ticks remaining|Cooldown: Iron Skin enters cooldown|Cooldown tick skipped: Iron Skin/i.test(line))) {
    throw new Error(`Passive-duration Iron Skin produced timed/cooldown transcript lines: ${state.transcriptLines.join(" | ")}`);
  }
  tickTargetTurnEffects(state, state.actors[1].id);
  tickTargetTurnEffects(state, state.actors[1].id);
  if (
    !state.statusEffects.some((effect) => effect.id === protection.id && effect.passiveDuration) ||
    !state.statusEffects.some((effect) => effect.id === guardBuff.id && effect.passiveDuration)
  ) {
    throw new Error(`Passive-duration Iron Skin effects ticked down naturally: ${JSON.stringify(state.statusEffects)}.`);
  }

  const ironSkinRollState = createCombatState(
    [
      fixtureActor("iron-skin-roll-attacker", "players", {
        attributeDice: { Attack: "D10", Guard: "D8", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
        actions: [],
      }),
    ],
    [
      fixtureActor("iron-skin-roll-defender", "monsters", {
        physicalHpMax: 120,
        physicalHpCurrent: 120,
        physicalProtection: 0,
        dodgeDice: 1,
        physicalDefenceDice: 4,
        physicalBlockPerSuccess: 6,
        attributeDice: { Attack: "D8", Guard: "D10", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D10" },
      }),
    ],
    { captureTranscript: true },
  );
  ironSkinRollState.statusEffects.push(
    {
      id: "iron-skin-roll-protection",
      sourceActorId: "iron-skin-roll-defender",
      targetActorId: "iron-skin-roll-defender",
      kind: "protection",
      pool: "physical",
      amount: 10,
      sourceActionId: "iron-skin-roll",
      sourceActionName: "Iron Skin",
      passiveDuration: true,
      remainingRounds: 20,
    },
    {
      id: "iron-skin-roll-guard-rider",
      sourceActorId: "iron-skin-roll-defender",
      targetActorId: "iron-skin-roll-defender",
      kind: "buff",
      attribute: "Guard",
      amount: 10,
      sourceActionId: "iron-skin-roll-guard",
      sourceActionName: "Iron Skin (+Guard)",
      passiveDuration: true,
      modifiesRollResults: false,
      remainingRounds: 20,
    },
  );
  const ironSkinRollResolution = resolveCombatAction({
    state: ironSkinRollState,
    actor: ironSkinRollState.actors[0],
    target: ironSkinRollState.actors[1],
    action: action({ id: "iron-skin-physical-test", name: "Iron Skin Physical Test", diceCount: 1, potency: 20 }),
    rng: rngFrom([0.99, 0.45, 0.99, 0, 0.99]),
    lane: "main",
  });
  if (ironSkinRollResolution.defenceStringBlocked !== 30 || ironSkinRollResolution.staticProtectionPrevented !== 10) {
    throw new Error(`Iron Skin did not apply passive/static prevention after an unmodified physical defence roll: ${JSON.stringify(ironSkinRollResolution)}.`);
  }
  expectTranscriptLine(
    ironSkinRollState.transcriptLines,
    /raw results 5, 10, 1, 10; per-die successes 1, 2, 0, 2; total 5 successes\. Physical Defence blocked 30 of 40 physical wounds/i,
    "Iron Skin physical defence unmodified Guard roll",
  );
  expectTranscriptLine(
    ironSkinRollState.transcriptLines,
    /Passive\/static prevention: Iron Skin blocked 10 physical wounds/i,
    "Iron Skin named passive/static prevention",
  );
  if (ironSkinRollState.transcriptLines.some((line) => /physical defence.*modified results/i.test(line))) {
    throw new Error(`Iron Skin linked Guard rider incorrectly modified physical defence dice: ${ironSkinRollState.transcriptLines.join(" | ")}`);
  }

  const legitBuffState = createCombatState(
    [
      fixtureActor("legit-buff-attacker", "players", {
        attributeDice: { Attack: "D10", Guard: "D8", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
        actions: [],
      }),
    ],
    [
      fixtureActor("legit-buff-defender", "monsters", {
        mentalHpMax: 120,
        mentalHpCurrent: 120,
        dodgeDice: 1,
        mentalDefenceDice: 4,
        mentalBlockPerSuccess: 6,
        attributeDice: { Attack: "D8", Guard: "D10", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
      }),
    ],
    { captureTranscript: true },
  );
  legitBuffState.statusEffects.push({
    id: "legit-guard-buff",
    sourceActorId: "legit-buff-defender",
    targetActorId: "legit-buff-defender",
    kind: "buff",
    attribute: "Bravery",
    amount: 10,
    sourceActionId: "legit-bravery-buff",
    sourceActionName: "Legitimate Bravery Buff",
    remainingRounds: 2,
  });
  resolveCombatAction({
    state: legitBuffState,
    actor: legitBuffState.actors[0],
    target: legitBuffState.actors[1],
    action: action({ id: "legit-buff-mental-test", name: "Legit Buff Mental Test", pool: "mental", diceCount: 1, potency: 20 }),
    rng: rngFrom([0.99, 0.45, 0.99, 0, 0.99]),
    lane: "main",
  });
  expectTranscriptLine(
    legitBuffState.transcriptLines,
    /using Bravery for mental defence: raw results .* modified results .* per-die successes 2, 2, 2, 2; total 8 successes/i,
    "legitimate Bravery buff still modifies mental defence dice",
  );

  const mentalState = createCombatState(
    [
      fixtureActor("iron-skin-mental-attacker", "players", {
        attributeDice: { Attack: "D10", Guard: "D8", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
        actions: [],
      }),
    ],
    [
      fixtureActor("iron-skin-mental-defender", "monsters", {
        mentalHpMax: 120,
        mentalHpCurrent: 120,
        mentalDefenceDice: 1,
        mentalBlockPerSuccess: 0,
        attributeDice: { Attack: "D8", Guard: "D10", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D10" },
      }),
    ],
    { captureTranscript: true },
  );
  mentalState.statusEffects.push(
    {
      id: "iron-skin-mental-protection",
      sourceActorId: "iron-skin-mental-defender",
      targetActorId: "iron-skin-mental-defender",
      kind: "protection",
      pool: "physical",
      amount: 10,
      sourceActionId: "iron-skin-mental",
      sourceActionName: "Iron Skin",
      passiveDuration: true,
      remainingRounds: 20,
    },
    {
      id: "iron-skin-mental-guard-rider",
      sourceActorId: "iron-skin-mental-defender",
      targetActorId: "iron-skin-mental-defender",
      kind: "buff",
      attribute: "Guard",
      amount: 10,
      sourceActionId: "iron-skin-mental-guard",
      sourceActionName: "Iron Skin (+Guard)",
      passiveDuration: true,
      modifiesRollResults: false,
      remainingRounds: 20,
    },
  );
  const mentalResolution = resolveCombatAction({
    state: mentalState,
    actor: mentalState.actors[0],
    target: mentalState.actors[1],
    action: action({ id: "iron-skin-mental-test", name: "Iron Skin Mental Test", pool: "mental", diceCount: 1, potency: 20 }),
    rng: rngFrom([0.99, 0]),
    lane: "main",
  });
  if (mentalResolution.staticProtectionPrevented !== 0) {
    throw new Error(`Iron Skin physical passive/static prevention leaked into mental damage: ${JSON.stringify(mentalResolution)}.`);
  }
  if (mentalState.transcriptLines.some((line) => /dodge.*modified results|mental defence.*modified results|Passive\/static prevention: Iron Skin/i.test(line))) {
    throw new Error(`Iron Skin incorrectly affected mental defence/dodge/passive prevention: ${mentalState.transcriptLines.join(" | ")}`);
  }

  state.statusEffects = state.statusEffects.filter((effect) => effect.id !== guardBuff.id);

  const directHitResolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ id: "passive-block-direct-hit", name: "Passive Block Direct Hit", diceCount: 1, potency: 20 }),
    rng: rngFrom([0.99, 0]),
    lane: "main",
  });
  if (directHitResolution.staticProtectionPrevented < 15) {
    throw new Error(`Iron Skin passive/static block did not reduce later physical incoming damage: ${JSON.stringify(directHitResolution)}.`);
  }

  const counterResolution = resolveCombatAction({
    state,
    actor: state.actors[1],
    target: state.actors[0],
    action: action({ id: "wolf-trigger-counterstrike", name: "Wolf Trigger Counterstrike", sourceType: "naturalAttack", diceCount: 1, potency: 1 }),
    rng: rngFrom([0.99, 0.99, 0]),
    lane: "main",
  });
  if (counterResolution.staticProtectionPrevented < 15 || counterResolution.counterDamage !== 25) {
    throw new Error(`Iron Skin passive/static block did not reduce Counterstrike damage: ${JSON.stringify(counterResolution)}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Counter result: Wolf Berzerker suffers 25 physical wounds from Counterstrike\. Prevented 15 passive\/static/i, "Iron Skin counter prevention transcript");

  const removalState = createCombatState([glassCannon], [wolf], { captureTranscript: true });
  const removalResolution = resolveCombatAction({
    state: removalState,
    actor: removalState.actors[1],
    target: removalState.actors[1],
    action: ironSkin,
    rng: rngFrom([0.3, 0.3, 0.3, 0]),
    lane: "power",
  });
  const removalProtection = removalState.statusEffects.find((effect) => effect.kind === "protection" && effect.sourceActionName === "Iron Skin");
  if (!removalProtection || removalResolution.mitigationApplied !== 15) {
    throw new Error("Passive Iron Skin removal fixture did not create protection.");
  }
  if (!removeStatusEffectById(removalState, removalProtection.id)) {
    throw new Error("Passive Iron Skin removal fixture could not remove protection.");
  }
  if (removalState.statusEffects.some((effect) => effect.sourceActionName === "Iron Skin" || effect.sourceActionName === "Iron Skin (+Guard)")) {
    throw new Error(`Passive Iron Skin removal did not clear inherited linked statuses: ${JSON.stringify(removalState.statusEffects)}.`);
  }
  if (getActionCooldownRemaining(removalState, removalState.actors[1].id, ironSkin.id) !== 4) {
    throw new Error("Passive Iron Skin did not enter cooldown when removed while the source actor remained active.");
  }
  expectTranscriptLine(removalState.transcriptLines, /Cooldown: Iron Skin enters cooldown 4/i, "passive removal cooldown transcript");

  state.actors[1].physicalHpCurrent = 0;
  markDefeatedActors(state);
  if (state.statusEffects.some((effect) => effect.sourceActorId === state.actors[1].id || effect.targetActorId === state.actors[1].id)) {
    throw new Error("Defeat cleanup did not clear active Iron Skin protection/buff effects.");
  }

  const tacticalWolf = fixtureActor("Wolf Berzerker", "monsters", {
    attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D10", Intellect: "D8", Synergy: "D4", Bravery: "D8" },
    physicalHpMax: 200,
    physicalHpCurrent: 200,
    mentalHpMax: 200,
    mentalHpCurrent: 200,
    physicalProtection: 0,
    mentalProtection: 0,
    dodgeDice: 0,
    physicalDefenceDice: 0,
    mentalDefenceDice: 0,
    actions: [
      ironSkin,
      action({
        id: "mindbreak-gaze-fixture",
        name: "Mindbreak Gaze",
        sourceType: "naturalAttack",
        pool: "mental",
        diceCount: 1,
        potency: 8,
      }),
    ],
  });
  const tacticalRun = runCombatScenario({
    name: "Iron Skin tactical setup fixture",
    players: [glassCannon],
    monsters: [tacticalWolf],
    runs: 1,
    seed: 9603,
    maxRounds: 1,
    turnOrder: "monstersFirst",
  });
  const tacticalLines = tacticalRun.firstRunTranscript?.lines ?? [];
  const tacticalLineIndex = tacticalLines.findIndex((line) => /Tactical sequencing: Wolf Berzerker uses defensive Power Action before Main Action/i.test(line));
  const powerLineIndex = tacticalLines.findIndex((line) => /Power Action: Wolf Berzerker uses Iron Skin on Wolf Berzerker/i.test(line));
  const mainLineIndex = tacticalLines.findIndex((line) => /Main Action: Wolf Berzerker declares Mindbreak Gaze on CL-L3-Glass-Cannon/i.test(line));
  if (tacticalLineIndex < 0 || powerLineIndex < 0 || mainLineIndex < 0 || tacticalLineIndex > powerLineIndex || powerLineIndex > mainLineIndex) {
    throw new Error(`Tactical power-before-main transcript order was not preserved: ${JSON.stringify(tacticalLines)}`);
  }
  expectTranscriptLine(tacticalLines, /Roll: Wolf Berzerker rolled 4 x D10 using Fortitude for Iron Skin/i, "tactical Iron Skin Fortitude roll");
  expectTranscriptLine(tacticalLines, /Counter declared: CL-L3-Glass-Cannon will use Counterstrike against Mindbreak Gaze/i, "tactical counter declaration");
  expectTranscriptLine(tacticalLines, /Counter result: Wolf Berzerker suffers .* from Counterstrike\. Prevented [1-9]\d* passive\/static/i, "tactical Iron Skin same-turn counter prevention");
}

{
  const base = makeFixturePower({
    id: "timed-linked-status-fixture",
    name: "Timed Linked Guard",
    intention: "DEFENCE",
    diceCount: 1,
    potency: 1,
    cooldownTurns: 2,
  });
  const primary = {
    ...base.effectPackets[0],
    intention: "DEFENCE" as const,
    type: "DEFENCE" as const,
    applyTo: "SELF" as const,
    diceCount: 1,
    potency: 1,
    effectDurationType: "TURNS" as const,
    effectDurationTurns: 1,
    detailsJson: { attackMode: "PHYSICAL" },
  };
  const linkedGuard = {
    ...primary,
    id: "timed-linked-guard",
    sortOrder: 1,
    packetIndex: 1,
    intention: "AUGMENT" as const,
    type: "AUGMENT" as const,
    targetedAttribute: "GUARD" as const,
    potency: 2,
    effectDurationType: "TURNS" as const,
    effectDurationTurns: 1,
    detailsJson: { statTarget: "Guard" },
  };
  const adapted = adaptPowerToCombatActions({
    ...base,
    effectPackets: [primary, linkedGuard],
    intentions: [primary, linkedGuard],
    cooldownTurns: 2,
    cooldownReduction: 0,
  });
  const timedPower = adapted.actions[0];
  const timedLinked = timedPower?.secondaryActions?.[0];
  if (!timedPower || !timedLinked || timedLinked.passiveDuration || timedLinked.durationKind !== "turns") {
    throw new Error(`Explicit timed linked status incorrectly inherited passive duration: ${JSON.stringify(adapted)}.`);
  }
  const actor = fixtureActor("timed-linked-actor", "players", {
    actions: [timedPower],
    attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
  });
  const state = createCombatState([actor], [fixtureActor("timed-linked-target", "monsters")], { captureTranscript: true });
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[0],
    action: timedPower,
    rng: rngFrom([0.99, 0]),
    lane: "power",
  });
  const guardStatus = state.statusEffects.find((effect) => effect.sourceActionName === "Timed Linked Guard (+Guard)");
  if (!guardStatus || guardStatus.passiveDuration || guardStatus.remainingRounds !== 1) {
    throw new Error(`Explicit timed linked Guard status did not remain one-turn timed: ${JSON.stringify(state.statusEffects)}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Buff\/status created: Timed Linked Guard \(\+Guard\).* for 1 turns/i, "explicit timed linked status transcript");
  tickTargetTurnEffects(state, state.actors[0].id);
  if (state.statusEffects.some((effect) => effect.id === guardStatus.id)) {
    throw new Error("Explicit timed linked Guard status did not expire on target turn tick.");
  }
}

{
  const attacker = fixtureActor("dodge-attacker", "players");
  const defender = fixtureActor("dodge-defender", "monsters", { dodgeDice: 2 });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
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
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
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
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
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
  const attacker = fixtureActor("mental-no-dodge-attacker", "players");
  const defender = fixtureActor("mental-no-dodge-defender", "monsters", {
    dodgeDice: 12,
    mentalDefenceDice: 1,
    mentalBlockPerSuccess: 1,
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ id: "mental-no-dodge-hit", name: "Mental No Dodge Hit", pool: "mental", accuracyAttribute: "Intellect", diceCount: 1, potency: 4 }),
    rng: rngFrom([0.99, 0.99, 0.99]),
  });
  if (resolution.dodgeChosen !== 0 || resolution.dodgeRolls !== 0 || resolution.mentalDefenceChosen !== 1) {
    throw new Error(`Mental attack used an illegal dodge path: ${JSON.stringify(resolution)}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Defence choice: mental-no-dodge-defender chooses mental defence\. Expected prevention: mental defence/i, "mental attack legal defence choice");
  if (state.transcriptLines.some((line) => /Defence choice: .*chooses dodge|Expected prevention: dodge/i.test(line))) {
    throw new Error(`Mental attack transcript exposed dodge as a legal defence: ${state.transcriptLines.join(" | ")}`);
  }
}

{
  const attacker = fixtureActor("aoe-mental-no-dodge-attacker", "players");
  const defender = fixtureActor("aoe-mental-no-dodge-defender", "monsters", {
    dodgeDice: 12,
    mentalDefenceDice: 2,
    mentalBlockPerSuccess: 2,
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({
      id: "aoe-mental-no-dodge-hit",
      name: "AoE Mental No Dodge Hit",
      pool: "mental",
      accuracyAttribute: "Intellect",
      diceCount: 1,
      potency: 4,
      targetCount: 3,
    }),
    rng: rngFrom([0.99, 0.99, 0.99]),
  });
  if (resolution.dodgeChosen !== 0 || resolution.dodgeRolls !== 0 || resolution.mentalDefenceChosen !== 1) {
    throw new Error(`AoE mental attack used an illegal dodge path: ${JSON.stringify(resolution)}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Defence choice: aoe-mental-no-dodge-defender chooses mental defence\. Expected prevention: mental defence/i, "aoe mental attack legal defence choice");
  if (state.transcriptLines.some((line) => /Defence choice: .*chooses dodge|Expected prevention: dodge/i.test(line))) {
    throw new Error(`AoE mental attack transcript exposed dodge as a legal defence: ${state.transcriptLines.join(" | ")}`);
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
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
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
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
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
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
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
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
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
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: action({ kind: "control", diceCount: 3, potency: 1, resistAttribute: "FORTITUDE" }),
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0, 0]),
  });
  if (
    resolution.resistRolls !== 1 ||
    resolution.hostileSuccessesCancelledByResist !== 1 ||
    resolution.controlTurnsApplied !== 1 ||
    resolution.stacksApplied !== 2
  ) {
    throw new Error("Resist did not cancel hostile successes success-by-success.");
  }
}

{
  const attacker = fixtureActor("debuff-resist-attacker", "players");
  const defender = fixtureActor("debuff-resist-defender", "monsters", { resist: { ATTACK: 0 } });
  defender.attributeDice.Attack = "D8";
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  const debuff = action({
    id: "fully-resisted-debuff",
    name: "Fully Resisted Debuff",
    sourceType: "power",
    kind: "debuff",
    targetPolicy: "enemy",
    diceCount: 2,
    potency: 1,
    modifier: { attribute: "Attack", amount: 1, durationRounds: 2 },
    resistAttribute: "ATTACK",
  });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: debuff,
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99]),
    lane: "power",
  });
  if (
    resolution.resistRolls !== 1 ||
    resolution.hostileSuccessesAfterResist !== 0 ||
    resolution.debuffApplications !== 0 ||
    state.statusEffects.some((effect) => effect.kind === "debuff")
  ) {
    throw new Error(`Fully resisted debuff should not create a status: ${JSON.stringify({ resolution, statuses: state.statusEffects })}.`);
  }
  expectTranscriptLine(state.transcriptLines, /rolled .* using Attack for Fully Resisted Debuff resist/i, "debuff resist roll");
  expectTranscriptLine(state.transcriptLines, /Applied primary successes: 0/i, "fully resisted debuff applied successes");
  expectTranscriptLine(state.transcriptLines, /Debuff result: .* resists Fully Resisted Debuff; no debuff is applied/i, "fully resisted debuff result");
}

{
  const attacker = fixtureActor("debuff-partial-attacker", "players");
  const defender = fixtureActor("debuff-partial-defender", "monsters", { resist: { ATTACK: 0 } });
  defender.attributeDice.Attack = "D8";
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  const debuff = action({
    id: "partially-resisted-debuff",
    name: "Partially Resisted Debuff",
    sourceType: "power",
    kind: "debuff",
    targetPolicy: "enemy",
    diceCount: 4,
    potency: 2,
    modifier: { attribute: "Attack", amount: 2, durationRounds: 2 },
    resistAttribute: "ATTACK",
  });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: debuff,
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0, 0]),
    lane: "power",
  });
  const status = state.statusEffects.find((effect) => effect.kind === "debuff" && effect.sourceActionName === debuff.name);
  if (
    resolution.resistRolls !== 1 ||
    resolution.hostileSuccessesAfterResist !== 3 ||
    resolution.debuffApplications !== 1 ||
    !status ||
    status.attribute !== "Attack"
  ) {
    throw new Error(`Partially resisted debuff did not apply correctly: ${JSON.stringify({ resolution, status, statuses: state.statusEffects })}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Applied primary successes: 3/i, "partially resisted debuff applied successes");
  expectTranscriptLine(state.transcriptLines, /Debuff: Partially Resisted Debuff applies -2 Attack/i, "partially resisted debuff application");
}

{
  const attacker = fixtureActor("debuff-no-gate-attacker", "players");
  const defender = fixtureActor("debuff-no-gate-defender", "monsters");
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  const debuff = action({
    id: "ungated-debuff",
    name: "Ungated Debuff",
    sourceType: "power",
    kind: "debuff",
    targetPolicy: "enemy",
    diceCount: 2,
    potency: 1,
    modifier: { attribute: "Guard", amount: 1, durationRounds: 2 },
    resistAttribute: null,
  });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: debuff,
    rng: rngFrom([0.99, 0.99]),
    lane: "power",
  });
  if (
    resolution.resistRolls !== 0 ||
    resolution.debuffApplications !== 1 ||
    !state.statusEffects.some((effect) => effect.kind === "debuff" && effect.sourceActionName === debuff.name)
  ) {
    throw new Error(`Ungated debuff should apply from raw successes: ${JSON.stringify({ resolution, statuses: state.statusEffects })}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Applied primary successes: 2/i, "ungated debuff applied successes");
}

{
  const predatorsReadPower: Power = {
    id: "predators-read-fixture",
    sortOrder: 1,
    name: "Predators Read",
    description: "Weakens a targets ability to attack",
    descriptorChassis: "IMMEDIATE",
    descriptorChassisConfig: {},
    cooldownTurns: 1,
    cooldownReduction: 0,
    counterMode: "NO",
    commitmentModifier: "STANDARD",
    lifespanType: "NONE",
    lifespanTurns: null,
    rangeCategories: ["MELEE"],
    meleeTargets: 1,
    primaryDefenceGate: {
      sourcePacketIndex: 0,
      gateResult: "RESIST",
      protectionChannel: null,
      resistAttribute: "ATTACK",
      hostileEntryPattern: null,
      resolutionSource: "INFERRED",
    },
    effectPackets: [
      {
        sortOrder: 0,
        packetIndex: 0,
        hostility: "HOSTILE",
        intention: "DEBUFF",
        type: "DEBUFF",
        specific: "Attack",
        diceCount: 4,
        potency: 4,
        effectTimingType: "ON_CAST",
        effectTimingTurns: null,
        effectDurationType: "INSTANT",
        effectDurationTurns: null,
        dealsWounds: false,
        woundChannel: null,
        targetedAttribute: "ATTACK",
        applicationModeKey: null,
        resolutionOrigin: "CASTER",
        applyTo: "PRIMARY_TARGET",
        triggerConditionText: null,
        detailsJson: {
          statTarget: "Attack",
          rangeCategory: "MELEE",
          rangeValue: 1,
          rangeExtra: {},
          secondaryScalingMode: "PER_SUCCESS",
          woundsPerSuccess: null,
        },
      },
    ],
    intentions: [],
    diceCount: 4,
    potency: 4,
  };
  const adapted = adaptPowerToCombatActions(predatorsReadPower);
  const predatorsRead = adapted.actions[0];
  if (
    adapted.unsupported.length !== 0 ||
    !predatorsRead ||
    predatorsRead.kind !== "debuff" ||
    predatorsRead.accuracyAttribute !== "Attack" ||
    predatorsRead.resistAttribute !== "ATTACK" ||
    predatorsRead.modifier?.attribute !== "Attack"
  ) {
    throw new Error(`Predators Read fixture did not hydrate as a supported Attack-resisted debuff: ${JSON.stringify(adapted)}.`);
  }
  const attacker = fixtureActor("predators-read-wolf", "monsters", { name: "Wolf Berzerker", actions: [predatorsRead] });
  const defender = fixtureActor("predators-read-target", "players", { name: "CL-L3-Glass-Cannon", resist: { ATTACK: 0 } });
  defender.attributeDice.Attack = "D8";
  const state = createCombatState([defender], [attacker], { captureTranscript: true });
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[1],
    target: state.actors[0],
    action: predatorsRead,
    rng: rngFrom([0.99, 0.99, 0, 0, 0.99, 0, 0]),
    lane: "power",
  });
  if (resolution.resistRolls !== 1 || resolution.hostileSuccessesAfterResist !== 1 || resolution.debuffApplications !== 1) {
    throw new Error(`Predators Read fixture silently failed instead of resolving after Resist: ${JSON.stringify({ resolution, transcript: state.transcriptLines })}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Power Action: Wolf Berzerker uses Predators Read on CL-L3-Glass-Cannon/i, "Predators Read declaration");
  expectTranscriptLine(state.transcriptLines, /rolled .* using Attack for Predators Read resist/i, "Predators Read resist roll");
  expectTranscriptLine(state.transcriptLines, /Applied primary successes: 1/i, "Predators Read applied successes");
  expectTranscriptLine(state.transcriptLines, /Debuff: Predators Read applies -4 Attack/i, "Predators Read debuff applied");
}

{
  const unsupportedDebuffPower: Power = {
    id: "unsupported-debuff-shape",
    sortOrder: 0,
    name: "Unsupported Debuff Shape",
    description: null,
    descriptorChassis: "IMMEDIATE",
    descriptorChassisConfig: {},
    cooldownTurns: 1,
    cooldownReduction: 0,
    counterMode: "NO",
    commitmentModifier: "STANDARD",
    lifespanType: "NONE",
    lifespanTurns: null,
    rangeCategories: ["MELEE"],
    meleeTargets: 1,
    primaryDefenceGate: null,
    effectPackets: [
      {
        sortOrder: 0,
        packetIndex: 0,
        hostility: "HOSTILE",
        intention: "DEBUFF",
        type: "DEBUFF",
        diceCount: 2,
        potency: 1,
        effectTimingType: "ON_CAST",
        effectTimingTurns: null,
        effectDurationType: "TURNS",
        effectDurationTurns: 1,
        dealsWounds: false,
        woundChannel: null,
        targetedAttribute: null,
        applicationModeKey: null,
        resolutionOrigin: "CASTER",
        applyTo: "PRIMARY_TARGET",
        triggerConditionText: null,
        detailsJson: { rangeCategory: "MELEE" },
      },
    ],
    intentions: [],
    diceCount: 2,
    potency: 1,
  };
  const adapted = adaptPowerToCombatActions(unsupportedDebuffPower);
  if (
    adapted.actions.length !== 0 ||
    !adapted.unsupported.some((entry) => entry.reason.includes("Debuff packet does not identify a supported target attribute"))
  ) {
    throw new Error(`Unsupported debuff shape was not explicitly diagnosed: ${JSON.stringify(adapted)}.`);
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
  const laneOrder = chooseActionLaneOrder(state.actors[0], state, false);
  if (laneOrder.lanes.join(",") !== "main,power") {
    throw new Error(`Normal offensive actor should keep Main Action before Power Action: ${JSON.stringify(laneOrder)}.`);
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
  const openingCounter = action({
    id: "pre-first-turn-counterstrike",
    name: "Pre First Turn Counterstrike",
    kind: "attack",
    counterMode: true,
    targetPolicy: "enemy",
    diceCount: 1,
    potency: 3,
  });
  const defender = fixtureActor("pre-first-turn-defender", "players", {
    actions: [openingCounter],
  });
  const attacker = fixtureActor("pre-first-turn-attacker", "monsters", {
    actions: [action({ id: "pre-first-turn-trigger", name: "Pre First Turn Trigger", diceCount: 1, potency: 1 })],
  });
  const state = createCombatState([defender], [attacker], { captureTranscript: true });
  if (state.responsesRemaining[state.actors[0].id] !== 2 || state.responsesRemaining[state.actors[1].id] !== 2) {
    throw new Error(`Combatants did not begin combat with 2 responses: ${JSON.stringify(state.responsesRemaining)}.`);
  }
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[1],
    target: state.actors[0],
    action: state.actors[1].actions[0],
    rng: rngFrom([0.99, 0.99]),
    lane: "main",
  });
  if (
    resolution.counterChosen !== 1 ||
    resolution.responsesUsed !== 1 ||
    state.responsesRemaining[state.actors[0].id] !== 1 ||
    resolution.dodgeChosen !== 0 ||
    resolution.physicalDefenceChosen !== 0
  ) {
    throw new Error(`Actor attacked before first turn did not spend one opening response on its counter: ${JSON.stringify({ resolution, responses: state.responsesRemaining })}.`);
  }
  refreshActorResponses(state, state.actors[0].id);
  if (state.responsesRemaining[state.actors[0].id] !== 2) {
    throw new Error("Actor did not refresh back to 2 responses at the start of its own turn.");
  }
  expectTranscriptLine(state.transcriptLines, /Counter declared: pre-first-turn-defender will use Pre First Turn Counterstrike/i, "pre-first-turn counter declaration");
  expectTranscriptLine(state.transcriptLines, /Response spent: pre-first-turn-defender spends 1 response \(1 remaining\)/i, "pre-first-turn response spend");
  expectTranscriptLine(state.transcriptLines, /Responses: pre-first-turn-defender refreshes to 2 responses/i, "pre-first-turn owner refresh");
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
    id: "zero-success-counterstrike",
    name: "Zero Success Counterstrike",
    kind: "attack",
    counterMode: true,
    targetPolicy: "enemy",
    diceCount: 1,
    potency: 5,
  });
  const attacker = fixtureActor("zero-success-counter-attacker", "players", {
    physicalProtection: 2,
    dodgeDice: 20,
    physicalDefenceDice: 20,
    physicalBlockPerSuccess: 20,
    actions: [action({ id: "zero-success-trigger", name: "Zero Success Trigger", diceCount: 1, potency: 10 })],
  });
  const defender = fixtureActor("zero-success-counter-defender", "monsters", {
    physicalHpMax: 999,
    dodgeDice: 20,
    physicalDefenceDice: 20,
    physicalBlockPerSuccess: 20,
    actions: [counterstrike],
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  refreshActorResponses(state, state.actors[1].id);
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: state.actors[0].actions[0],
    rng: rngFrom([0.99, 0]),
    lane: "main",
  });
  if (resolution.counterDamage !== 3 || resolution.dodgeChosen !== 0 || resolution.physicalDefenceChosen !== 0) {
    throw new Error(`Attack-only counter did not fire before/independent of the incoming roll: ${JSON.stringify(resolution)}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Counter declared: zero-success-counter-defender will use Zero Success Counterstrike against Zero Success Trigger/i, "zero-success counter declaration");
  expectTranscriptLine(state.transcriptLines, /Counter tradeoff: Zero Success Counterstrike includes an Attack packet and no Defence packet/i, "zero-success attack-only tradeoff");
  expectTranscriptLine(state.transcriptLines, /Incoming result: zero-success-counter-defender suffers 0 physical wounds/i, "zero-success incoming result");
  expectTranscriptLine(state.transcriptLines, /Counter result: zero-success-counter-attacker suffers 3 physical wounds from Zero Success Counterstrike\. Prevented 2 passive\/static/i, "zero-success counter result");
  if (state.transcriptLines.some((line) => /Defence choice:|zero-success-counter-attacker rolled .*Dodge|zero-success-counter-attacker rolled .*physical defence/i.test(line))) {
    throw new Error(`Attack-only counter incorrectly used normal defence or granted active counter-defence: ${state.transcriptLines.join(" | ")}`);
  }
  const counterDeclarationIndex = state.transcriptLines.findIndex((line) => /Counter declared:/i.test(line));
  const incomingRollIndex = state.transcriptLines.findIndex((line) => /Roll: zero-success-counter-attacker rolled/i.test(line));
  if (counterDeclarationIndex < 0 || incomingRollIndex < 0 || counterDeclarationIndex > incomingRollIndex) {
    throw new Error(`Counter was not declared before the incoming roll: ${state.transcriptLines.join(" | ")}`);
  }
}

{
  const counterstrike = action({
    id: "defeated-counterstrike",
    name: "Defeated Counterstrike",
    kind: "attack",
    counterMode: true,
    targetPolicy: "enemy",
    diceCount: 1,
    potency: 5,
  });
  const attacker = fixtureActor("defeated-counter-attacker", "players", {
    physicalHpMax: 50,
    physicalHpCurrent: 50,
    actions: [action({ id: "defeating-trigger", name: "Defeating Trigger", diceCount: 1, potency: 20 })],
  });
  const defender = fixtureActor("defeated-counter-defender", "monsters", {
    physicalHpMax: 5,
    physicalHpCurrent: 5,
    dodgeDice: 1,
    actions: [counterstrike],
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  refreshActorResponses(state, state.actors[1].id);
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: state.actors[0].actions[0],
    rng: rngFrom([0.99, 0.99]),
    lane: "main",
  });
  if (resolution.counterDamage <= 0 || !state.actors[1].defeated || state.actors[0].physicalHpCurrent >= state.actors[0].physicalHpMax) {
    throw new Error(`Declared counter did not resolve after the countering actor was defeated: ${JSON.stringify({ resolution, actors: state.actors })}.`);
  }
  const incomingResultIndex = state.transcriptLines.findIndex((line) => /Incoming result:/i.test(line));
  const counterResultIndex = state.transcriptLines.findIndex((line) => /Counter result:/i.test(line));
  const defeatIndex = state.transcriptLines.findIndex((line) => /Defeat: defeated-counter-defender is defeated/i.test(line));
  if (incomingResultIndex < 0 || counterResultIndex < 0 || defeatIndex < 0 || incomingResultIndex > counterResultIndex || counterResultIndex > defeatIndex) {
    throw new Error(`Defeat was not processed after both incoming and counter results: ${state.transcriptLines.join(" | ")}`);
  }
}

{
  const hybridCounter = action({
    id: "hybrid-counter",
    name: "Hybrid Counter",
    kind: "attack",
    counterMode: true,
    targetPolicy: "enemy",
    diceCount: 1,
    potency: 5,
    secondaryActions: [
      action({
        id: "hybrid-counter-defence",
        name: "Hybrid Counter Defence",
        kind: "defence",
        targetPolicy: "self",
        pool: "mental",
        protection: 2,
        potency: 2,
      }),
    ],
  });
  const attacker = fixtureActor("hybrid-counter-attacker", "players", {
    actions: [action({ id: "hybrid-mental-trigger", name: "Hybrid Mental Trigger", pool: "mental", accuracyAttribute: "Intellect", diceCount: 1, potency: 6 })],
  });
  const defender = fixtureActor("hybrid-counter-defender", "monsters", {
    mentalDefenceDice: 1,
    mentalBlockPerSuccess: 0,
    actions: [hybridCounter],
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  refreshActorResponses(state, state.actors[1].id);
  const resolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: state.actors[0].actions[0],
    rng: rngFrom([0.99, 0.99]),
    lane: "main",
  });
  if (resolution.counterDamage <= 0 || resolution.counterMitigation <= 0) {
    throw new Error(`Hybrid counter did not both mitigate and attack: ${JSON.stringify(resolution)}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Counter tradeoff: Hybrid Counter uses its authored defensive packet instead of normal active defence/i, "hybrid counter defensive tradeoff");
  expectTranscriptLine(state.transcriptLines, /Counter mitigation: .* prevents 2 mental wounds/i, "hybrid counter mitigation");
  expectTranscriptLine(state.transcriptLines, /Counter result: hybrid-counter-attacker suffers/i, "hybrid counter attack");
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
  const power = makeFixturePower({
    id: "pure-start-turn-dot",
    name: "Pure Start Turn DoT",
    intention: "ATTACK",
    diceCount: 3,
    potency: 4,
    durationTurns: 2,
  });
  const startTurnPacket = {
    ...power.effectPackets[0],
    effectTimingType: "START_OF_TURN" as const,
    effectDurationType: "TURNS" as const,
    effectDurationTurns: 2,
  };
  const adapted = adaptPowerToCombatActions({
    ...power,
    effectPackets: [startTurnPacket],
    intentions: [startTurnPacket],
  });
  const dotAction = adapted.actions[0];
  if (!dotAction || dotAction.damageApplicationTiming !== "startOfTurn") {
    throw new Error(`START_OF_TURN damage packet was not adapted as pure ongoing damage: ${JSON.stringify(adapted)}.`);
  }
  const attacker = fixtureActor("pure-dot-attacker", "players", { actions: [dotAction] });
  const defender = fixtureActor("pure-dot-defender", "monsters", {
    physicalHpMax: 100,
    physicalHpCurrent: 100,
    dodgeDice: 1,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 0,
    physicalProtection: 0,
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: dotAction,
    rng: rngFrom([0.99, 0]),
    lane: "power",
  });
  const created = state.statusEffects.find((effect) => effect.kind === "ongoingDamage" && effect.sourceActionName === dotAction.name);
  if (!created || state.actors[1].physicalHpCurrent !== state.actors[1].physicalHpMax) {
    throw new Error(`Pure DoT dealt immediate damage or failed to create status: ${JSON.stringify({ hp: state.actors[1].physicalHpCurrent, created })}.`);
  }
  if (state.transcriptLines.some((line) => /Attack result: pure-dot-defender suffers/i.test(line))) {
    throw new Error(`Pure DoT transcript still reported immediate HP damage: ${state.transcriptLines.join(" | ")}`);
  }
  expectTranscriptLine(state.transcriptLines, /Status created: Pure Start Turn DoT ongoing damage/i, "pure DoT status creation");
  resolveStartOfTurnEffects(state, state.actors[1]);
  if (state.actors[1].physicalHpCurrent >= state.actors[1].physicalHpMax) {
    throw new Error("Pure DoT did not apply damage at target start of turn.");
  }
  expectTranscriptLine(state.transcriptLines, /Ticks remaining after this: 1/i, "pure DoT remaining tick wording");
}

{
  const dotAction = action({
    id: "dodged-pure-dot",
    name: "Dodged Pure DoT",
    kind: "attack",
    targetPolicy: "enemy",
    diceCount: 2,
    potency: 8,
    recurring: { kind: "ongoingDamage", durationRounds: 2 },
    damageApplicationTiming: "startOfTurn",
  });
  const attacker = fixtureActor("dodged-dot-attacker", "players", { actions: [dotAction] });
  const defender = fixtureActor("dodged-dot-defender", "monsters", {
    physicalHpMax: 100,
    physicalHpCurrent: 100,
    dodgeDice: 6,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 0,
    physicalProtection: 0,
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: dotAction,
    rng: rngFrom([0.99, 0.99]),
    lane: "power",
  });
  if (state.statusEffects.some((effect) => effect.kind === "ongoingDamage") || state.actors[1].physicalHpCurrent !== 100) {
    throw new Error("Dodged pure DoT created a status or immediate damage.");
  }
  expectTranscriptLine(state.transcriptLines, /Application result: dodged-dot-defender avoids Dodged Pure DoT; no ongoing damage status is created/i, "pure DoT dodge prevention");
}

{
  const dotAction = action({
    id: "failed-dodge-pure-dot",
    name: "Failed Dodge Pure DoT",
    kind: "attack",
    targetPolicy: "enemy",
    diceCount: 2,
    potency: 8,
    recurring: { kind: "ongoingDamage", durationRounds: 2 },
    damageApplicationTiming: "startOfTurn",
  });
  const attacker = fixtureActor("failed-dodge-dot-attacker", "players", { actions: [dotAction] });
  const defender = fixtureActor("failed-dodge-dot-defender", "monsters", {
    physicalHpMax: 100,
    physicalHpCurrent: 100,
    dodgeDice: 1,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 0,
    physicalProtection: 0,
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: dotAction,
    rng: rngFrom([0.99, 0.99, 0]),
    lane: "power",
  });
  const created = state.statusEffects.find((effect) => effect.kind === "ongoingDamage");
  if (!created || created.amount !== 16 || state.actors[1].physicalHpCurrent !== 100) {
    throw new Error(`Failed Dodge pure DoT did not store full potential 16 without immediate damage: ${JSON.stringify({ created, hp: state.actors[1].physicalHpCurrent })}.`);
  }
}

{
  const dotAction = action({
    id: "protected-pure-dot",
    name: "Protected Pure DoT",
    kind: "attack",
    targetPolicy: "enemy",
    diceCount: 2,
    potency: 8,
    recurring: { kind: "ongoingDamage", durationRounds: 2 },
    damageApplicationTiming: "startOfTurn",
  });
  const attacker = fixtureActor("protected-dot-attacker", "players", { actions: [dotAction] });
  const defender = fixtureActor("protected-dot-defender", "monsters", {
    physicalHpMax: 100,
    physicalHpCurrent: 100,
    dodgeDice: 1,
    physicalDefenceDice: 3,
    physicalBlockPerSuccess: 4,
    physicalProtection: 0,
    actions: [
      action({
        id: "protected-dot-counter",
        name: "Protected Dot Counter",
        kind: "defence",
        sourceType: "power",
        targetPolicy: "self",
        diceCount: 1,
        potency: 1,
        protection: 1,
        counterMode: true,
      }),
    ],
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  state.responsesRemaining[state.actors[1].id] = 2;
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: dotAction,
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0.99]),
    lane: "power",
  });
  const created = state.statusEffects.find((effect) => effect.kind === "ongoingDamage");
  if (!created || created.amount !== 15 || state.actors[1].physicalHpCurrent !== 100) {
    throw new Error(`Counter replacement did not reduce pure DoT stored payload from 16 to 15 without immediate damage: ${JSON.stringify({ created, hp: state.actors[1].physicalHpCurrent })}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Counter replacement: Protected Dot Counter replaces normal Dodge, Physical Defence, Mental Defence, or Resist/i, "pure DoT counter replacement transcript");
  expectTranscriptLine(state.transcriptLines, /Counter mitigation: protected-dot-defender's Protected Dot Counter prevents 1 physical wounds/i, "pure DoT counter mitigation transcript");
  expectTranscriptLine(state.transcriptLines, /Ongoing result: Protected Pure DoT stores 15 physical wounds per tick/i, "pure DoT stored net tick value");
  expectTranscriptLine(state.transcriptLines, /Declaration prevention .* reduced the stored tick value/i, "pure DoT protection reduction transcript");
  if (state.transcriptLines.some((line) => /Physical Defence blocked|Defence choice: protected-dot-defender chooses/i.test(line))) {
    throw new Error(`Pure DoT counter incorrectly stacked normal physical defence: ${state.transcriptLines.join(" | ")}`);
  }
  if (state.transcriptLines.some((line) => /Attack result: protected-dot-defender suffers/i.test(line))) {
    throw new Error(`Protected pure DoT still reported immediate HP damage: ${state.transcriptLines.join(" | ")}`);
  }
  resolveStartOfTurnEffects(state, state.actors[1]);
  const protectedPureDotHpAfterTick = Number(state.actors[1].physicalHpCurrent);
  if (protectedPureDotHpAfterTick !== 85) {
    throw new Error(`Stored pure DoT tick did not deal 15 damage at start of turn: ${protectedPureDotHpAfterTick}.`);
  }
}

{
  const dotAction = action({
    id: "fully-prevented-pure-dot",
    name: "Fully Prevented Pure DoT",
    kind: "attack",
    targetPolicy: "enemy",
    diceCount: 2,
    potency: 8,
    recurring: { kind: "ongoingDamage", durationRounds: 2 },
    damageApplicationTiming: "startOfTurn",
  });
  const attacker = fixtureActor("fully-prevented-dot-attacker", "players", { actions: [dotAction] });
  const defender = fixtureActor("fully-prevented-dot-defender", "monsters", {
    physicalHpMax: 100,
    physicalHpCurrent: 100,
    dodgeDice: 1,
    physicalDefenceDice: 4,
    physicalBlockPerSuccess: 4,
    physicalProtection: 0,
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: dotAction,
    rng: rngFrom([0.99, 0.99, 0.99, 0.99, 0.99, 0.99]),
    lane: "power",
  });
  if (state.statusEffects.some((effect) => effect.kind === "ongoingDamage") || state.actors[1].physicalHpCurrent !== 100) {
    throw new Error("Fully prevented pure DoT created a status or immediate damage.");
  }
  expectTranscriptLine(state.transcriptLines, /fully prevents Fully Prevented Pure DoT; no ongoing damage status is created/i, "fully prevented pure DoT transcript");
}

{
  const base = makeFixturePower({
    id: "live-swiping-claws-fixture",
    name: "Swiping Claws",
    intention: "ATTACK",
    diceCount: 4,
    potency: 4,
    cooldownTurns: 2,
    durationTurns: 2,
  });
  const startTurnPacket = {
    ...base.effectPackets[0],
    effectTimingType: "ON_CAST" as const,
    effectDurationType: "TURNS" as const,
    effectDurationTurns: 2,
    detailsJson: {
      ...base.effectPackets[0]?.detailsJson,
      attackMode: "PHYSICAL",
      damageTypes: ["Slashing"],
    },
  };
  const { actor } = adaptMonsterToCombatLabActor(
    makeMonsterRow({
      powers: [
        monsterPowerRowFromFixture(
          {
            ...base,
            effectPackets: [startTurnPacket],
            intentions: [startTurnPacket],
          },
          {
            cooldownTurns: 2,
            cooldownReduction: 0,
            effectPackets: [startTurnPacket],
          },
        ),
      ],
    }),
    new Map(),
    DEFAULT_COMBAT_TUNING_VALUES,
  );
  const swipingClaws = actor.actions.find((candidate) => candidate.name === "Swiping Claws");
  if (
    !swipingClaws ||
    swipingClaws.damageApplicationTiming !== "startOfTurn" ||
    swipingClaws.source?.packet?.effectTimingType !== "ON_CAST" ||
    swipingClaws.source?.packet?.effectDurationType !== "TURNS" ||
    swipingClaws.cooldownRounds !== 2
  ) {
    throw new Error(`Live monster Swiping Claws path did not hydrate as cooldown-2 pure DoT: ${JSON.stringify(actor.actions)}.`);
  }
  const target = fixtureActor("live-swiping-target", "players", {
    physicalHpMax: 100,
    physicalHpCurrent: 100,
    dodgeDice: 1,
    physicalDefenceDice: 3,
    physicalBlockPerSuccess: 3,
    physicalProtection: 0,
    actions: [
      action({
        id: "live-swiping-counter",
        name: "Live Swiping Counter",
        kind: "defence",
        sourceType: "power",
        targetPolicy: "self",
        diceCount: 1,
        potency: 3,
        protection: 3,
        counterMode: true,
      }),
    ],
  });
  const state = createCombatState([target], [actor], { captureTranscript: true });
  state.currentTurnActorId = state.actors[1].id;
  state.responsesRemaining[state.actors[0].id] = 2;
  resolveCombatAction({
    state,
    actor: state.actors[1],
    target: state.actors[0],
    action: swipingClaws,
    rng: rngFrom([0.4, 0.4, 0, 0, 0.4, 0.4, 0.4, 0.4]),
    lane: "power",
  });
  const created = state.statusEffects.find((effect) => effect.kind === "ongoingDamage");
  if (!created || created.amount !== 13 || created.cleanupUnitWounds !== 8 || created.damageLabel !== "physical Slashing" || state.actors[0].physicalHpCurrent !== 100) {
    throw new Error(`Live Swiping Claws path did not store 13 physical Slashing per tick without immediate damage: ${JSON.stringify({ action: swipingClaws, created, hp: state.actors[0].physicalHpCurrent })}.`);
  }
  if (getActionCooldownRemaining(state, state.actors[1].id, swipingClaws.id) !== 2) {
    throw new Error("Live Swiping Claws did not enter cooldown 2.");
  }
  expectTranscriptLine(state.transcriptLines, /Ongoing declaration: Swiping Claws has 2 active successes x 8 = 16 physical Slashing wounds per tick/i, "live Swiping Claws potential tick transcript");
  expectTranscriptLine(state.transcriptLines, /Counter replacement: Live Swiping Counter replaces normal Dodge, Physical Defence, Mental Defence, or Resist/i, "live Swiping Claws counter replacement transcript");
  expectTranscriptLine(state.transcriptLines, /Counter mitigation: .* prevents 3 physical wounds/i, "live Swiping Claws counter mitigation transcript");
  expectTranscriptLine(state.transcriptLines, /Ongoing result: Swiping Claws stores 13 physical Slashing wounds per tick.*Prevented 3/i, "live Swiping Claws stored tick transcript");
  expectTranscriptLine(state.transcriptLines, /Status created: Swiping Claws ongoing damage .* 13 physical Slashing wounds per tick/i, "live Swiping Claws status transcript");
  if (state.transcriptLines.some((line) => /Physical Defence blocked|Defence choice: live-swiping-target chooses/i.test(line))) {
    throw new Error(`Live Swiping Claws counter incorrectly stacked normal physical defence: ${state.transcriptLines.join(" | ")}`);
  }
  if (state.transcriptLines.some((line) => /Attack result: live-swiping-target suffers/i.test(line))) {
    throw new Error(`Live Swiping Claws still reported immediate HP damage: ${state.transcriptLines.join(" | ")}`);
  }
  resolveStartOfTurnEffects(state, state.actors[0]);
  const liveSwipingHpAfterTick = Number(state.actors[0].physicalHpCurrent);
  if (liveSwipingHpAfterTick !== 87) {
    throw new Error(`Live Swiping Claws start-turn tick did not deal stored value 13: ${liveSwipingHpAfterTick}.`);
  }
  expectTranscriptLine(state.transcriptLines, /Start of Turn: live-swiping-target suffers 13 physical Slashing wounds from Swiping Claws\. Ticks remaining after this: 1/i, "live Swiping Claws tick transcript");
}

{
  const defeatedActor = fixtureActor("defeated-start-turn-actor", "players", {
    physicalHpMax: 20,
    physicalHpCurrent: 20,
    actions: [
      action({ id: "defeated-cooldown-main", name: "Defeated Cooldown Main", cooldownRounds: 3 }),
      action({ id: "defeated-cooldown-power", name: "Defeated Cooldown Power", cooldownRounds: 2 }),
    ],
  });
  const source = fixtureActor("defeated-start-turn-source", "monsters");
  const state = createCombatState([defeatedActor], [source], { captureTranscript: true });
  setCooldown(state, state.actors[0].id, "defeated-cooldown-main", 2);
  setCooldown(state, state.actors[0].id, "defeated-cooldown-power", 1);
  state.responsesRemaining[state.actors[0].id] = 2;
  state.statusEffects.push(
    {
      id: "start-turn-defeat-dot",
      sourceActorId: state.actors[1].id,
      targetActorId: state.actors[0].id,
      kind: "ongoingDamage",
      amount: 25,
      pool: "physical",
      damageLabel: "physical Slashing",
      sourceActionId: "swiping-claws",
      sourceActionName: "Swiping Claws",
      remainingRounds: 1,
    },
    {
      id: "start-turn-defeat-denial",
      sourceActorId: state.actors[1].id,
      targetActorId: state.actors[0].id,
      kind: "mainActionDenied",
      amount: 1,
      sourceActionId: "staggering-strike",
      sourceActionName: "Staggering Strike",
      remainingRounds: 2,
    },
  );

  resolveStartOfTurnEffects(state, state.actors[0]);
  if (!state.actors[0].defeated) {
    throw new Error("Start-turn ongoing damage did not defeat the actor.");
  }
  if (Object.keys(state.cooldowns).some((key) => key.startsWith(`${state.actors[0].id}:`))) {
    throw new Error(`Defeated actor cooldowns were not cleared: ${JSON.stringify(state.cooldowns)}.`);
  }
  if (state.responsesRemaining[state.actors[0].id] !== undefined) {
    throw new Error("Defeated actor responses were not cleared.");
  }
  if (state.statusEffects.some((effect) => effect.targetActorId === state.actors[0].id)) {
    throw new Error(`Defeated actor target statuses were not cleared: ${JSON.stringify(state.statusEffects)}.`);
  }
  tickActorCooldowns(state, state.actors[0].id);
  refreshActorResponses(state, state.actors[0].id);
  if (state.transcriptLines.some((line) => /Cooldown tick:|Cooldown ready:/i.test(line))) {
    throw new Error(`Defeated actor produced cooldown tick/readiness transcript: ${state.transcriptLines.join(" | ")}`);
  }
  if (state.transcriptLines.some((line) => /Responses: defeated-start-turn-actor refreshes/i.test(line))) {
    throw new Error(`Defeated actor refreshed responses after cleanup: ${state.transcriptLines.join(" | ")}`);
  }
  expectTranscriptLine(state.transcriptLines, /Start of Turn: defeated-start-turn-actor suffers 25 physical Slashing wounds from Swiping Claws\. Ticks remaining after this: 0/i, "start-turn defeat tick transcript");
  expectTranscriptLine(state.transcriptLines, /Defeat: defeated-start-turn-actor is defeated/i, "start-turn defeat transcript");
  expectTranscriptLine(state.transcriptLines, /Defeat cleanup: defeated-start-turn-actor leaves active combat; cleared 2 cooldowns and 2 active statuses/i, "start-turn defeat cleanup transcript");
}

{
  const firstPlayer = fixtureActor("future-target-defeated", "players", {
    physicalHpMax: 10,
    physicalHpCurrent: 10,
  });
  const secondPlayer = fixtureActor("future-target-living", "players", {
    physicalHpMax: 50,
    physicalHpCurrent: 50,
  });
  const attackerAction = action({
    id: "future-target-killer",
    name: "Future Target Killer",
    diceCount: 1,
    potency: 20,
  });
  const attacker = fixtureActor("future-target-attacker", "monsters", { actions: [attackerAction] });
  const state = createCombatState([firstPlayer, secondPlayer], [attacker], { captureTranscript: true });
  resolveCombatAction({
    state,
    actor: state.actors[2],
    target: state.actors[0],
    action: attackerAction,
    rng: rngFrom([0.99, 0]),
    lane: "main",
  });
  if (!state.actors[0].defeated) {
    throw new Error("Immediate attack did not defeat the target for cleanup smoke.");
  }
  const nextTarget = chooseTarget(state.actors[2], attackerAction, state);
  if (!nextTarget || nextTarget.id !== state.actors[1].id) {
    throw new Error(`Defeated actor remained a legal future target: ${nextTarget?.id ?? "none"}.`);
  }
}

{
  const player = fixtureActor("sot-stop-player", "players", {
    actions: [action({ id: "sot-stop-player-extra", name: "Player Extra Turn", potency: 1 })],
  });
  const monster = fixtureActor("sot-stop-monster", "monsters", {
    physicalHpMax: 10,
    physicalHpCurrent: 10,
    actions: [action({ id: "sot-stop-monster-action", name: "Monster Should Not Act", potency: 1 })],
  });
  const result = runCombatScenario({
    name: "start-turn monster defeat stop",
    players: [player],
    monsters: [monster],
    initialStatusEffects: [{
      id: "sot-stop-monster-dot",
      sourceActorId: player.id,
      targetActorId: monster.id,
      kind: "ongoingDamage",
      amount: 12,
      pool: "physical",
      damageLabel: "physical Necrotic",
      sourceActionId: "open-vein",
      sourceActionName: "Open Vein",
      remainingRounds: 2,
    }],
    runs: 1,
    seed: 1201,
    maxRounds: 3,
    turnOrder: "monstersFirst",
  });
  const lines = result.firstRunTranscript?.lines ?? [];
  if (result.stoppedBy !== "monstersDefeated" || result.winner !== "players") {
    throw new Error(`Start-turn monster defeat did not stop as monstersDefeated: ${JSON.stringify({ stoppedBy: result.stoppedBy, winner: result.winner })}.`);
  }
  expectTranscriptLine(lines, /Start of Turn: sot-stop-monster suffers 12 physical Necrotic wounds from Open Vein/i, "start-turn monster defeat tick");
  expectTranscriptLine(lines, /Defeat cleanup: sot-stop-monster leaves active combat/i, "start-turn monster defeat cleanup");
  expectTranscriptLine(lines, /Combat ends: monsters defeated/i, "start-turn monster combat end");
  const combatEndIndex = lines.findIndex((line) => /Combat ends: monsters defeated/i.test(line));
  if (lines.some((line, index) => index > combatEndIndex && /Turn \d+: sot-stop-player begins/i.test(line))) {
    throw new Error(`Player received a turn after only monster was defeated: ${lines.join(" | ")}`);
  }
}

{
  const player = fixtureActor("sot-player-stop-player", "players", {
    physicalHpMax: 10,
    physicalHpCurrent: 10,
    actions: [action({ id: "sot-player-stop-action", name: "Player Should Not Act", potency: 1 })],
  });
  const monster = fixtureActor("sot-player-stop-monster", "monsters", {
    actions: [action({ id: "sot-player-stop-monster-extra", name: "Monster Extra Turn", potency: 1 })],
  });
  const result = runCombatScenario({
    name: "start-turn player defeat stop",
    players: [player],
    monsters: [monster],
    initialStatusEffects: [{
      id: "sot-stop-player-dot",
      sourceActorId: monster.id,
      targetActorId: player.id,
      kind: "ongoingDamage",
      amount: 12,
      pool: "physical",
      damageLabel: "physical Necrotic",
      sourceActionId: "open-vein",
      sourceActionName: "Open Vein",
      remainingRounds: 2,
    }],
    runs: 1,
    seed: 1202,
    maxRounds: 3,
    turnOrder: "playersFirst",
  });
  const lines = result.firstRunTranscript?.lines ?? [];
  if (result.stoppedBy !== "playersDefeated" || result.winner !== "monsters") {
    throw new Error(`Start-turn player defeat did not stop as playersDefeated: ${JSON.stringify({ stoppedBy: result.stoppedBy, winner: result.winner })}.`);
  }
  expectTranscriptLine(lines, /Combat ends: players defeated/i, "start-turn player combat end");
  const combatEndIndex = lines.findIndex((line) => /Combat ends: players defeated/i.test(line));
  if (lines.some((line, index) => index > combatEndIndex && /Turn \d+: sot-player-stop-monster begins/i.test(line))) {
    throw new Error(`Monster received a turn after only player was defeated: ${lines.join(" | ")}`);
  }
}

{
  const player = fixtureActor("immediate-stop-player", "players", {
    actions: [action({ id: "immediate-stop-killer", name: "Immediate Stop Killer", diceCount: 20, potency: 20 })],
  });
  const monster = fixtureActor("immediate-stop-monster", "monsters", {
    physicalHpMax: 5,
    physicalHpCurrent: 5,
    actions: [action({ id: "immediate-stop-monster-extra", name: "Monster Extra Turn", potency: 1 })],
  });
  const result = runCombatScenario({
    name: "immediate action side wipe stop",
    players: [player],
    monsters: [monster],
    runs: 1,
    seed: 1203,
    maxRounds: 3,
    turnOrder: "playersFirst",
  });
  const lines = result.firstRunTranscript?.lines ?? [];
  if (result.stoppedBy !== "monstersDefeated" || result.winner !== "players") {
    throw new Error(`Immediate side wipe did not stop as monstersDefeated: ${JSON.stringify({ stoppedBy: result.stoppedBy, winner: result.winner })}.`);
  }
  expectTranscriptLine(lines, /Combat ends: monsters defeated/i, "immediate side wipe combat end");
  const combatEndIndex = lines.findIndex((line) => /Combat ends: monsters defeated/i.test(line));
  if (lines.some((line, index) => index > combatEndIndex && /Turn \d+: immediate-stop-monster begins|Cooldown tick:/i.test(line))) {
    throw new Error(`Simulation continued after immediate side wipe: ${lines.join(" | ")}`);
  }
}

{
  const counter = action({
    id: "counter-stop-counterstrike",
    name: "Counter Stop Counterstrike",
    kind: "attack",
    counterMode: true,
    targetPolicy: "enemy",
    diceCount: 20,
    potency: 20,
  });
  const player = fixtureActor("counter-stop-player", "players", {
    physicalHpMax: 999,
    physicalHpCurrent: 999,
    actions: [counter],
  });
  const monster = fixtureActor("counter-stop-monster", "monsters", {
    physicalHpMax: 5,
    physicalHpCurrent: 5,
    actions: [action({ id: "counter-stop-trigger", name: "Counter Stop Trigger", diceCount: 1, potency: 1 })],
  });
  const result = runCombatScenario({
    name: "counter damage side wipe stop",
    players: [player],
    monsters: [monster],
    runs: 1,
    seed: 1204,
    maxRounds: 3,
    turnOrder: "monstersFirst",
  });
  const lines = result.firstRunTranscript?.lines ?? [];
  if (result.stoppedBy !== "monstersDefeated" || result.winner !== "players") {
    throw new Error(`Counter side wipe did not stop as monstersDefeated: ${JSON.stringify({ stoppedBy: result.stoppedBy, winner: result.winner })}.`);
  }
  const incomingResultIndex = lines.findIndex((line) => /Incoming result:/i.test(line));
  const counterResultIndex = lines.findIndex((line) => /Counter result:/i.test(line));
  const combatEndIndex = lines.findIndex((line) => /Combat ends: monsters defeated/i.test(line));
  if (incomingResultIndex < 0 || counterResultIndex < 0 || combatEndIndex < 0 || incomingResultIndex > counterResultIndex || counterResultIndex > combatEndIndex) {
    throw new Error(`Counter side wipe did not apply incoming and counter before combat end: ${lines.join(" | ")}`);
  }
  if (lines.some((line, index) => index > combatEndIndex && /Turn \d+: counter-stop-player begins|Cooldown tick:/i.test(line))) {
    throw new Error(`Simulation continued after counter side wipe: ${lines.join(" | ")}`);
  }
}

{
  const counter = action({
    id: "simul-stop-counterstrike",
    name: "Simultaneous Stop Counterstrike",
    kind: "attack",
    counterMode: true,
    targetPolicy: "enemy",
    diceCount: 20,
    potency: 20,
  });
  const player = fixtureActor("simul-stop-player", "players", {
    physicalHpMax: 5,
    physicalHpCurrent: 5,
    actions: [counter],
  });
  const monster = fixtureActor("simul-stop-monster", "monsters", {
    physicalHpMax: 5,
    physicalHpCurrent: 5,
    actions: [action({ id: "simul-stop-trigger", name: "Simultaneous Stop Trigger", diceCount: 20, potency: 20 })],
  });
  const result = runCombatScenario({
    name: "simultaneous side defeat stop",
    players: [player],
    monsters: [monster],
    runs: 1,
    seed: 1205,
    maxRounds: 3,
    turnOrder: "monstersFirst",
  });
  const lines = result.firstRunTranscript?.lines ?? [];
  if (result.stoppedBy !== "stalemate" || result.winner !== "stalemate") {
    throw new Error(`Simultaneous side defeat did not resolve as stalemate: ${JSON.stringify({ stoppedBy: result.stoppedBy, winner: result.winner })}.`);
  }
  const incomingResultIndex = lines.findIndex((line) => /Incoming result:/i.test(line));
  const counterResultIndex = lines.findIndex((line) => /Counter result:/i.test(line));
  const playerDefeatIndex = lines.findIndex((line) => /Defeat: simul-stop-player is defeated/i.test(line));
  const monsterDefeatIndex = lines.findIndex((line) => /Defeat: simul-stop-monster is defeated/i.test(line));
  const combatEndIndex = lines.findIndex((line) => /Combat ends: both sides defeated/i.test(line));
  if (
    incomingResultIndex < 0 ||
    counterResultIndex < 0 ||
    playerDefeatIndex < 0 ||
    monsterDefeatIndex < 0 ||
    combatEndIndex < 0 ||
    incomingResultIndex > counterResultIndex ||
    counterResultIndex > playerDefeatIndex ||
    counterResultIndex > monsterDefeatIndex ||
    playerDefeatIndex > combatEndIndex ||
    monsterDefeatIndex > combatEndIndex
  ) {
    throw new Error(`Simultaneous defeat did not apply both results and defeats before combat end: ${lines.join(" | ")}`);
  }
}

{
  const source = fixtureActor("source-defeat-owner", "players", {
    physicalHpMax: 10,
    physicalHpCurrent: 0,
  });
  const target = fixtureActor("source-defeat-target", "monsters");
  const state = createCombatState([source], [target], { captureTranscript: true });
  state.actors[0].physicalHpCurrent = 0;
  state.statusEffects.push({
    id: "source-owned-persistent-effect",
    sourceActorId: state.actors[0].id,
    targetActorId: state.actors[1].id,
    kind: "ongoingDamage",
    amount: 5,
    pool: "physical",
    sourceActionId: "source-owned-action",
    sourceActionName: "Source Owned Action",
    remainingRounds: 2,
  });
  markDefeatedActors(state);
  if (state.statusEffects.some((effect) => effect.sourceActorId === state.actors[0].id)) {
    throw new Error("Source-owned persistent effect remained after source defeat.");
  }
  expectTranscriptLine(state.transcriptLines, /Defeat cleanup: source-defeat-owner leaves active combat; cleared 0 cooldowns and 1 active status/i, "source-owned defeat cleanup transcript");
}

{
  const immediate = action({
    id: "explicit-immediate-damage",
    name: "Explicit Immediate Damage",
    kind: "attack",
    targetPolicy: "enemy",
    diceCount: 2,
    potency: 3,
    damageApplicationTiming: "immediate",
  });
  const attacker = fixtureActor("immediate-attacker", "players", { actions: [immediate] });
  const defender = fixtureActor("immediate-defender", "monsters", {
    physicalHpMax: 100,
    physicalHpCurrent: 100,
    dodgeDice: 1,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 0,
    physicalProtection: 0,
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: immediate,
    rng: rngFrom([0.99, 0]),
    lane: "power",
  });
  if (state.actors[1].physicalHpCurrent >= 100) {
    throw new Error("Explicit immediate damage no longer applied immediate HP damage.");
  }
  expectTranscriptLine(state.transcriptLines, /Attack result: immediate-defender suffers/i, "immediate damage still reports attack result");
}

{
  const primary = action({
    id: "both-immediate-primary",
    name: "Both Immediate Primary",
    kind: "attack",
    targetPolicy: "enemy",
    diceCount: 2,
    potency: 3,
    damageApplicationTiming: "immediate",
    secondaryActions: [
      action({
        id: "both-ongoing-secondary",
        name: "Both Immediate Primary (ongoing)",
        kind: "attack",
        targetPolicy: "enemy",
        diceCount: 2,
        potency: 2,
        recurring: { kind: "ongoingDamage", durationRounds: 2 },
        damageApplicationTiming: "startOfTurn",
        usesPrimaryAppliedSuccesses: true,
        skipOwnRoll: true,
        skipOwnDefenceGate: true,
      }),
    ],
  });
  const attacker = fixtureActor("both-attacker", "players", { actions: [primary] });
  const defender = fixtureActor("both-defender", "monsters", {
    physicalHpMax: 100,
    physicalHpCurrent: 100,
    dodgeDice: 1,
    physicalDefenceDice: 1,
    physicalBlockPerSuccess: 0,
    physicalProtection: 0,
  });
  const state = createCombatState([attacker], [defender], { captureTranscript: true });
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: primary,
    rng: rngFrom([0.99, 0]),
    lane: "power",
  });
  if (
    state.actors[1].physicalHpCurrent >= 100 ||
    !state.statusEffects.some((effect) => effect.kind === "ongoingDamage" && effect.sourceActionName === "Both Immediate Primary (ongoing)")
  ) {
    throw new Error("Power with explicit immediate and ongoing packets did not preserve both effects.");
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
  expectTranscriptLine(state.transcriptLines, /Main Action: transcript-dodge-attacker declares Transcript Strike/i, "attack action line");
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
  const denialLines = state.transcriptLines.filter((line) => /Force No Main Action/i.test(line));
  if (resolution.actionsDenied !== 1 || denialLines.length !== 1) {
    throw new Error(`Duplicate main-action denial was not consolidated: actionsDenied ${resolution.actionsDenied}, lines ${denialLines.length}.`);
  }
  expectTranscriptLine(state.transcriptLines, /consolidated to one denied main action/i, "duplicate denial consolidation");
}

{
  const power = action({
    id: "stack-lifecycle-power",
    name: "Stack Lifecycle Power",
    sourceType: "power",
    kind: "attack",
    targetPolicy: "enemy",
    diceCount: 1,
    potency: 1,
  });
  const deniedActor = fixtureActor("stack-lifecycle-target", "monsters", {
    physicalHpMax: 999,
    mentalHpMax: 999,
    actions: [power],
  });
  const sourceActor = fixtureActor("stack-lifecycle-source", "players");
  const state = createCombatState([sourceActor], [deniedActor], { captureTranscript: true });
  state.statusEffects.push({
    id: "stack-lifecycle-denial",
    sourceActorId: state.actors[0].id,
    targetActorId: state.actors[1].id,
    kind: "mainActionDenied",
    amount: 3,
    sourceActionId: "stack-lifecycle-denial-source",
    sourceActionName: "Staggering-Style Denial",
    remainingRounds: 1,
  });
  state.currentTurnActorId = state.actors[1].id;
  const startResolution = resolveStartOfTurnEffects(state, state.actors[1]);
  if (startResolution.actionsDenied !== 1) {
    throw new Error("Expected duration-1 Force No Main Action to deny exactly one target main action.");
  }
  expectTranscriptLine(
    state.transcriptLines,
    /Start of Turn: stack-lifecycle-target has 3 stacks of Force No Main Action from Staggering-Style Denial, 1 turn remaining/i,
    "duration-1 stack status start",
  );
  const selectedPower = chooseTurnAction(state.actors[1], state, "power");
  if (selectedPower?.id !== power.id) {
    throw new Error("Power lane was not available while Force No Main Action denied only the main lane.");
  }
  const expired = tickTargetTurnEffects(state, state.actors[1].id);
  if (expired !== 1 || state.statusEffects.some((effect) => effect.id === "stack-lifecycle-denial")) {
    throw new Error(`Duration-1 stack status did not expire after one affected turn: ${JSON.stringify(state.statusEffects)}.`);
  }
  expectTranscriptLine(
    state.transcriptLines,
    /End of Turn: Force No Main Action from Staggering-Style Denial expires; removed 3 remaining stacks/i,
    "duration expiry removes all remaining stacks",
  );
  const nextTurnResolution = resolveStartOfTurnEffects(state, state.actors[1]);
  if (nextTurnResolution.actionsDenied !== 0) {
    throw new Error("Expired Force No Main Action denied a later main action.");
  }
}

{
  const deniedActor = fixtureActor("high-intensity-stack-target", "monsters");
  const sourceActor = fixtureActor("high-intensity-stack-source", "players");
  const state = createCombatState([sourceActor], [deniedActor], { captureTranscript: true });
  state.statusEffects.push({
    id: "high-intensity-stack-denial",
    sourceActorId: state.actors[0].id,
    targetActorId: state.actors[1].id,
    kind: "mainActionDenied",
    amount: 15,
    sourceActionId: "high-intensity-stack-source-action",
    sourceActionName: "High Intensity Denial",
    remainingRounds: 1,
  });
  const startResolution = resolveStartOfTurnEffects(state, state.actors[1]);
  if (startResolution.actionsDenied !== 1) {
    throw new Error("High-intensity duration-1 stack status did not deny the active target turn.");
  }
  const expired = tickTargetTurnEffects(state, state.actors[1].id);
  if (expired !== 1 || state.statusEffects.some((effect) => effect.id === "high-intensity-stack-denial")) {
    throw new Error("High-intensity stacks treated amount as duration instead of expiring by duration.");
  }
  expectTranscriptLine(
    state.transcriptLines,
    /End of Turn: Force No Main Action from High Intensity Denial expires; removed 15 remaining stacks/i,
    "high-intensity duration expiry",
  );
}

{
  const cleanser = fixtureActor("stack-cleanser", "players", {
    actions: [
      action({
        id: "stack-cleanse",
        name: "Stack Cleanse",
        sourceType: "power",
        kind: "cleanse",
        targetPolicy: "ally",
        diceCount: 1,
        potency: 2,
      }),
    ],
  });
  const affected = fixtureActor("stack-cleanse-target", "players");
  const source = fixtureActor("stack-cleanse-source", "monsters");
  const state = createCombatState([cleanser, affected], [source], { captureTranscript: true });
  state.statusEffects.push({
    id: "stack-cleanse-denial",
    sourceActorId: state.actors[2].id,
    targetActorId: state.actors[1].id,
    kind: "mainActionDenied",
    amount: 5,
    sourceActionId: "stack-cleanse-source-action",
    sourceActionName: "Cleanse Test Denial",
    remainingRounds: 1,
  });
  const cleanseResolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[1],
    action: state.actors[0].actions[0],
    rng: rngFrom([0.99]),
    lane: "power",
  });
  const remainingEffect = state.statusEffects.find((effect) => effect.id === "stack-cleanse-denial");
  if (cleanseResolution.stacksCleansed !== 2 || remainingEffect?.amount !== 3 || remainingEffect.remainingRounds !== 1) {
    throw new Error(`Cleanse did not reduce stack amount while preserving duration: ${JSON.stringify({ cleanseResolution, remainingEffect })}.`);
  }
  tickTargetTurnEffects(state, state.actors[1].id);
  if (state.statusEffects.some((effect) => effect.id === "stack-cleanse-denial")) {
    throw new Error("Stack status remained after duration expiry following cleanup.");
  }
  expectTranscriptLine(
    state.transcriptLines,
    /End of Turn: Force No Main Action from Cleanse Test Denial expires; removed 3 remaining stacks/i,
    "expiry removes post-cleanse remaining stacks",
  );
}

{
  const cleanupPower = action({
    id: "post-cleanup-power",
    name: "Post Cleanup Power",
    sourceType: "power",
    kind: "attack",
    targetPolicy: "enemy",
    diceCount: 1,
    potency: 1,
  });
  const actor = fixtureActor("physical-cleanup-target", "players", {
    physicalHpMax: 60,
    physicalHpCurrent: 60,
    attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D10", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
    resist: { FORTITUDE: 2 },
    actions: [cleanupPower],
  });
  const source = fixtureActor("physical-cleanup-source", "monsters");
  const state = createCombatState([actor], [source], { captureTranscript: true });
  state.statusEffects.push({
    id: "physical-cleanup-dot",
    sourceActorId: state.actors[1].id,
    targetActorId: state.actors[0].id,
    kind: "ongoingDamage",
    amount: 16,
    pool: "physical",
    damageLabel: "physical Slashing",
    cleanupUnitWounds: 8,
    sourceActionId: "swiping-claws",
    sourceActionName: "Swiping Claws",
    remainingRounds: 2,
  });
  resolveStartOfTurnEffects(state, state.actors[0]);
  const cleanup = chooseTurnAction(state.actors[0], state, "main");
  if (!cleanup?.runtimeCleanup) {
    throw new Error(`Significant physical ongoing damage did not select Main Action cleanup: ${JSON.stringify(cleanup)}.`);
  }
  const cleanupResolution = resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[0],
    action: cleanup,
    rng: rngFrom([0.2, 0.3, 0.5, 0.6, 0.99]),
    lane: "main",
  });
  const remaining = state.statusEffects.find((effect) => effect.id === "physical-cleanup-dot");
  if (cleanupResolution.ongoingDamagePreventedOrCleansed !== 16 || cleanupResolution.stacksCleansed !== 0 || remaining) {
    throw new Error(`Physical ongoing cleanup did not remove one 8-wound unit per Fortitude success: ${JSON.stringify({ cleanupResolution, remaining })}.`);
  }
  if (chooseTurnAction(state.actors[0], state, "power")?.id !== cleanupPower.id) {
    throw new Error("Power Action was not available after Main Action cleanup.");
  }
  expectTranscriptLine(state.transcriptLines, /using Fortitude for clean up Swiping Claws/i, "physical cleanup Fortitude roll");
  expectTranscriptLine(state.transcriptLines, /Cleanup: physical-cleanup-target removes 5 ongoing units from Swiping Claws \(5 x 8 = 40\), reducing it from 16 to 0 physical Slashing wounds per tick/i, "physical cleanup unit removal");
  expectTranscriptLine(state.transcriptLines, /Cleanup: Swiping Claws ongoing damage is removed from physical-cleanup-target/i, "physical cleanup removed");
}

{
  const actor = fixtureActor("partial-unit-cleanup-target", "players", {
    physicalHpMax: 40,
    physicalHpCurrent: 40,
    attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D4", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
    actions: [action({ id: "partial-unit-attack", sourceType: "naturalAttack" })],
  });
  const source = fixtureActor("partial-unit-cleanup-source", "monsters");
  const state = createCombatState([actor], [source], { captureTranscript: true });
  state.statusEffects.push({
    id: "partial-unit-dot",
    sourceActorId: state.actors[1].id,
    targetActorId: state.actors[0].id,
    kind: "ongoingDamage",
    amount: 11,
    pool: "physical",
    damageLabel: "physical Slashing",
    cleanupUnitWounds: 8,
    sourceActionName: "Partially Prevented Bleed",
    remainingRounds: 2,
  });
  const cleanup = chooseTurnAction(state.actors[0], state, "main");
  if (!cleanup?.runtimeCleanup) throw new Error("Partial unit cleanup did not select universal cleanup.");
  const resolution = resolveCombatAction({ state, actor: state.actors[0], target: state.actors[0], action: cleanup, rng: rngFrom([0, 0, 0.99]), lane: "main" });
  const remaining = state.statusEffects.find((effect) => effect.id === "partial-unit-dot");
  if (resolution.ongoingDamagePreventedOrCleansed !== 8 || remaining?.amount !== 3) {
    throw new Error(`One cleanup success should reduce 11 by one 8-wound unit to 3: ${JSON.stringify({ resolution, remaining })}.`);
  }
  expectTranscriptLine(state.transcriptLines, /removes 1 ongoing unit from Partially Prevented Bleed \(1 x 8 = 8\), reducing it from 11 to 3/i, "partial unit cleanup");
}

{
  const actor = fixtureActor("partial-unit-full-cleanup-target", "players", {
    physicalHpMax: 40,
    physicalHpCurrent: 40,
    attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D10", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
    actions: [action({ id: "partial-unit-full-attack", sourceType: "naturalAttack" })],
  });
  const source = fixtureActor("partial-unit-full-cleanup-source", "monsters");
  const state = createCombatState([actor], [source], { captureTranscript: true });
  state.statusEffects.push({
    id: "partial-unit-full-dot",
    sourceActorId: state.actors[1].id,
    targetActorId: state.actors[0].id,
    kind: "ongoingDamage",
    amount: 11,
    pool: "physical",
    damageLabel: "physical Slashing",
    cleanupUnitWounds: 8,
    sourceActionName: "Partially Prevented Bleed",
    remainingRounds: 2,
  });
  const cleanup = chooseTurnAction(state.actors[0], state, "main");
  if (!cleanup?.runtimeCleanup) throw new Error("Partial full unit cleanup did not select universal cleanup.");
  const resolution = resolveCombatAction({ state, actor: state.actors[0], target: state.actors[0], action: cleanup, rng: rngFrom([0.99, 0, 0]), lane: "main" });
  if (resolution.ongoingDamagePreventedOrCleansed !== 11 || state.statusEffects.some((effect) => effect.id === "partial-unit-full-dot")) {
    throw new Error(`Two cleanup successes should remove 11 with 8-wound units: ${JSON.stringify({ resolution, statuses: state.statusEffects })}.`);
  }
}

{
  const actor = fixtureActor("open-vein-unit-cleanup-target", "players", {
    physicalHpMax: 40,
    physicalHpCurrent: 40,
    attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D4", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
    actions: [action({ id: "open-vein-unit-attack", sourceType: "naturalAttack" })],
  });
  const source = fixtureActor("open-vein-unit-cleanup-source", "monsters");
  const state = createCombatState([actor], [source], { captureTranscript: true });
  state.statusEffects.push({
    id: "open-vein-unit-dot",
    sourceActorId: state.actors[1].id,
    targetActorId: state.actors[0].id,
    kind: "ongoingDamage",
    amount: 12,
    pool: "physical",
    damageLabel: "physical Necrotic",
    cleanupUnitWounds: 6,
    sourceActionName: "Open Vein",
    remainingRounds: 2,
  });
  const cleanup = chooseTurnAction(state.actors[0], state, "main");
  if (!cleanup?.runtimeCleanup) throw new Error("Open Vein unit cleanup did not select universal cleanup.");
  const resolution = resolveCombatAction({ state, actor: state.actors[0], target: state.actors[0], action: cleanup, rng: rngFrom([0, 0, 0.99]), lane: "main" });
  const remaining = state.statusEffects.find((effect) => effect.id === "open-vein-unit-dot");
  if (resolution.ongoingDamagePreventedOrCleansed !== 6 || remaining?.amount !== 6) {
    throw new Error(`Open Vein-style cleanup should reduce 12 by one 6-wound unit: ${JSON.stringify({ resolution, remaining })}.`);
  }
}

{
  const actor = fixtureActor("open-vein-unit-full-cleanup-target", "players", {
    physicalHpMax: 40,
    physicalHpCurrent: 40,
    attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D10", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
    actions: [action({ id: "open-vein-unit-full-attack", sourceType: "naturalAttack" })],
  });
  const source = fixtureActor("open-vein-unit-full-cleanup-source", "monsters");
  const state = createCombatState([actor], [source], { captureTranscript: true });
  state.statusEffects.push({
    id: "open-vein-unit-full-dot",
    sourceActorId: state.actors[1].id,
    targetActorId: state.actors[0].id,
    kind: "ongoingDamage",
    amount: 12,
    pool: "physical",
    damageLabel: "physical Necrotic",
    cleanupUnitWounds: 6,
    sourceActionName: "Open Vein",
    remainingRounds: 2,
  });
  const cleanup = chooseTurnAction(state.actors[0], state, "main");
  if (!cleanup?.runtimeCleanup) throw new Error("Open Vein full unit cleanup did not select universal cleanup.");
  const resolution = resolveCombatAction({ state, actor: state.actors[0], target: state.actors[0], action: cleanup, rng: rngFrom([0.99, 0, 0]), lane: "main" });
  if (resolution.ongoingDamagePreventedOrCleansed !== 12 || state.statusEffects.some((effect) => effect.id === "open-vein-unit-full-dot")) {
    throw new Error(`Open Vein-style two-success cleanup should remove 12: ${JSON.stringify({ resolution, statuses: state.statusEffects })}.`);
  }
}

{
  const actor = fixtureActor("mental-cleanup-target", "players", {
    mentalHpMax: 40,
    mentalHpCurrent: 40,
    attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D8", Intellect: "D8", Synergy: "D8", Bravery: "D4" },
    actions: [action({ id: "mental-cleanup-attack", sourceType: "naturalAttack" })],
  });
  const source = fixtureActor("mental-cleanup-source", "monsters");
  const state = createCombatState([actor], [source], { captureTranscript: true });
  state.statusEffects.push({
    id: "mental-cleanup-dot",
    sourceActorId: state.actors[1].id,
    targetActorId: state.actors[0].id,
    kind: "ongoingDamage",
    amount: 10,
    pool: "mental",
    damageLabel: "mental Psychic",
    cleanupUnitWounds: 5,
    sourceActionName: "Mind Rot",
    remainingRounds: 2,
  });
  const cleanup = chooseTurnAction(state.actors[0], state, "main");
  if (!cleanup?.runtimeCleanup) {
    throw new Error("Significant mental ongoing damage did not select Main Action cleanup.");
  }
  resolveCombatAction({
    state,
    actor: state.actors[0],
    target: state.actors[0],
    action: cleanup,
    rng: rngFrom([0.99, 0.99, 0.99]),
    lane: "main",
  });
  const remaining = state.statusEffects.find((effect) => effect.id === "mental-cleanup-dot");
  if (remaining) {
    throw new Error(`Mental ongoing cleanup did not use Bravery Resist to remove 3 units of 5: ${JSON.stringify(remaining)}.`);
  }
  expectTranscriptLine(state.transcriptLines, /using Bravery for clean up Mind Rot/i, "mental cleanup Bravery roll");
}

{
  const actor = fixtureActor("full-cleanup-target", "players", {
    physicalHpMax: 10,
    physicalHpCurrent: 10,
    attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D4", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
    actions: [],
  });
  const source = fixtureActor("full-cleanup-source", "monsters");
  const state = createCombatState([actor], [source], { captureTranscript: true });
  state.statusEffects.push({
    id: "full-cleanup-dot",
    sourceActorId: state.actors[1].id,
    targetActorId: state.actors[0].id,
    kind: "ongoingDamage",
    amount: 3,
    pool: "physical",
    cleanupUnitWounds: 3,
    sourceActionName: "Small Bleed",
    remainingRounds: 2,
  });
  const cleanup = chooseTurnAction(state.actors[0], state, "main");
  if (!cleanup?.runtimeCleanup) throw new Error("Cleanup was not available without authored actions.");
  const resolution = resolveCombatAction({ state, actor: state.actors[0], target: state.actors[0], action: cleanup, rng: rngFrom([0.99, 0.99, 0.99]), lane: "main" });
  if (resolution.ongoingDamagePreventedOrCleansed !== 3 || state.statusEffects.some((effect) => effect.id === "full-cleanup-dot")) {
    throw new Error("Cleanup that reduced ongoing damage to 0 did not remove the status.");
  }
}

{
  const trivialActor = fixtureActor("trivial-cleanup-actor", "players", {
    physicalHpMax: 100,
    physicalHpCurrent: 100,
    actions: [action({ id: "trivial-normal-attack", name: "Trivial Normal Attack", sourceType: "naturalAttack" })],
  });
  const source = fixtureActor("trivial-cleanup-source", "monsters");
  const state = createCombatState([trivialActor], [source]);
  state.statusEffects.push({
    id: "trivial-dot",
    sourceActorId: state.actors[1].id,
    targetActorId: state.actors[0].id,
    kind: "ongoingDamage",
    amount: 1,
    pool: "physical",
    cleanupUnitWounds: 1,
    sourceActionName: "Trivial Scratch",
    remainingRounds: 2,
  });
  const chosen = chooseTurnAction(state.actors[0], state, "main");
  if (chosen?.runtimeCleanup || chosen?.id !== "trivial-normal-attack") {
    throw new Error(`Trivial ongoing damage should not override normal Main Action: ${JSON.stringify(chosen)}.`);
  }
}

{
  const deniedActor = fixtureActor("cleanup-denied-actor", "monsters", {
    physicalHpMax: 100,
    physicalHpCurrent: 100,
    actions: [action({ id: "cleanup-denied-power", name: "Cleanup Denied Power", sourceType: "power", kind: "attack" })],
  });
  const source = fixtureActor("cleanup-denied-source", "players");
  const run = runCombatScenario({
    name: "main action denied prevents cleanup",
    players: [source],
    monsters: [deniedActor],
    initialStatusEffects: [
      {
        id: "denied-cleanup-dot",
        sourceActorId: source.id,
        targetActorId: deniedActor.id,
        kind: "ongoingDamage",
        amount: 40,
        pool: "physical",
        cleanupUnitWounds: 8,
        sourceActionName: "Denied Bleed",
        remainingRounds: 2,
      },
      {
        id: "denied-cleanup-main",
        sourceActorId: source.id,
        targetActorId: deniedActor.id,
        kind: "mainActionDenied",
        amount: 1,
        sourceActionName: "No Main",
        remainingRounds: 1,
      },
    ],
    runs: 1,
    seed: 1301,
    maxRounds: 1,
    turnOrder: "monstersFirst",
  });
  const lines = run.firstRunTranscript?.lines ?? [];
  expectTranscriptLine(lines, /Main Action: denied by No Main/i, "main action denial blocks cleanup lane");
  if (lines.some((line) => /attempts to resist Denied Bleed/i.test(line))) {
    throw new Error("Actor used Main Action cleanup while main action was denied.");
  }
}

{
  const actor = fixtureActor("stack-runtime-cleanup-target", "players", {
    attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D4", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
    actions: [action({ id: "stack-runtime-normal", sourceType: "naturalAttack" })],
  });
  const source = fixtureActor("stack-runtime-cleanup-source", "monsters");
  const state = createCombatState([actor], [source], { captureTranscript: true });
  state.statusEffects.push({
    id: "stack-runtime-cleanup-debuff",
    sourceActorId: state.actors[1].id,
    targetActorId: state.actors[0].id,
    kind: "debuff",
    attribute: "Guard",
    cleanupAttribute: "Fortitude",
    amount: 5,
    sourceActionName: "Stacking Debuff",
    remainingRounds: 2,
  });
  const cleanup = chooseTurnAction(state.actors[0], state, "main");
  if (!cleanup?.runtimeCleanup) throw new Error("Stack cleanup did not select universal cleanup.");
  const resolution = resolveCombatAction({ state, actor: state.actors[0], target: state.actors[0], action: cleanup, rng: rngFrom([0.99, 0.99, 0.99]), lane: "main" });
  const remaining = state.statusEffects.find((effect) => effect.id === "stack-runtime-cleanup-debuff");
  if (resolution.stacksCleansed !== 3 || remaining?.amount !== 2 || remaining.remainingRounds !== 2) {
    throw new Error(`Stack cleanup did not reduce stack amount while preserving duration: ${JSON.stringify({ resolution, remaining })}.`);
  }
}

{
  const actor = fixtureActor("stack-runtime-remove-target", "players", {
    attributeDice: { Attack: "D8", Guard: "D8", Fortitude: "D4", Intellect: "D8", Synergy: "D8", Bravery: "D8" },
    actions: [],
  });
  const source = fixtureActor("stack-runtime-remove-source", "monsters");
  const state = createCombatState([actor], [source], { captureTranscript: true });
  state.statusEffects.push({
    id: "stack-runtime-remove-debuff",
    sourceActorId: state.actors[1].id,
    targetActorId: state.actors[0].id,
    kind: "debuff",
    attribute: "Guard",
    amount: 3,
    sourceActionName: "Removable Stack Debuff",
    remainingRounds: 2,
  });
  const cleanup = chooseTurnAction(state.actors[0], state, "main");
  if (!cleanup?.runtimeCleanup) throw new Error("Stack cleanup was not available without authored actions.");
  const resolution = resolveCombatAction({ state, actor: state.actors[0], target: state.actors[0], action: cleanup, rng: rngFrom([0.99, 0.99, 0.99]), lane: "main" });
  if (resolution.stacksCleansed !== 3 || state.statusEffects.some((effect) => effect.id === "stack-runtime-remove-debuff")) {
    throw new Error("Stack cleanup that reached 0 did not remove the status.");
  }
}

{
  const actor = fixtureActor("cleanup-defeated-before-act", "players", {
    physicalHpMax: 10,
    physicalHpCurrent: 10,
    actions: [action({ id: "defeated-before-cleanup-attack", sourceType: "naturalAttack" })],
  });
  const source = fixtureActor("cleanup-defeated-source", "monsters");
  const run = runCombatScenario({
    name: "defeated before cleanup fixture",
    players: [actor],
    monsters: [source],
    initialStatusEffects: [
      {
        id: "defeating-dot",
        sourceActorId: source.id,
        targetActorId: actor.id,
        kind: "ongoingDamage",
    amount: 20,
    pool: "physical",
    cleanupUnitWounds: 10,
    sourceActionName: "Fatal Bleed",
        remainingRounds: 2,
      },
    ],
    runs: 1,
    seed: 1302,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  const lines = run.firstRunTranscript?.lines ?? [];
  expectTranscriptLine(lines, /Start of Turn: cleanup-defeated-before-act suffers 20 physical wounds from Fatal Bleed/i, "fatal start-turn ongoing tick");
  if (lines.some((line) => /attempts to resist Fatal Bleed/i.test(line))) {
    throw new Error("Defeated actor attempted cleanup after start-of-turn defeat.");
  }
}

{
  const cleanse = action({
    id: "relevant-antitoxin",
    name: "AntiToxin",
    sourceType: "power",
    kind: "cleanse",
    targetPolicy: "ally",
    diceCount: 1,
    potency: 3,
  });
  const actor = fixtureActor("relevant-cleanser", "players", { actions: [cleanse] });
  const source = fixtureActor("relevant-cleanse-source", "monsters");
  const state = createCombatState([actor], [source]);
  state.statusEffects.push({
    id: "relevant-cleanse-dot",
    sourceActorId: state.actors[1].id,
    targetActorId: state.actors[0].id,
    kind: "ongoingDamage",
    amount: 12,
    pool: "physical",
    cleanupUnitWounds: 6,
    sourceActionName: "Relevant Poison",
    remainingRounds: 2,
  });
  if (chooseTurnAction(state.actors[0], state, "power")?.id !== cleanse.id) {
    throw new Error("Cleanse power was not selected when a removable hostile effect was present.");
  }
  const resolution = resolveCombatAction({ state, actor: state.actors[0], target: state.actors[0], action: cleanse, rng: rngFrom([0.99]), lane: "power" });
  if (resolution.ongoingDamagePreventedOrCleansed !== 12 || resolution.stacksCleansed !== 0) {
    throw new Error(`Cleanse power did not credit ongoing cleansed separately from stack cleansed: ${JSON.stringify(resolution)}.`);
  }
}

{
  const deniedActor = fixtureActor("long-duration-stack-target", "monsters");
  const sourceActor = fixtureActor("long-duration-stack-source", "players");
  const state = createCombatState([sourceActor], [deniedActor], { captureTranscript: true });
  state.statusEffects.push({
    id: "long-duration-stack-denial",
    sourceActorId: state.actors[0].id,
    targetActorId: state.actors[1].id,
    kind: "mainActionDenied",
    amount: 2,
    sourceActionId: "long-duration-stack-source-action",
    sourceActionName: "Long Duration Denial",
    remainingRounds: 2,
  });
  const firstStart = resolveStartOfTurnEffects(state, state.actors[1]);
  const firstExpired = tickTargetTurnEffects(state, state.actors[1].id);
  const afterFirst = state.statusEffects.find((effect) => effect.id === "long-duration-stack-denial");
  const secondStart = resolveStartOfTurnEffects(state, state.actors[1]);
  const secondExpired = tickTargetTurnEffects(state, state.actors[1].id);
  if (
    firstStart.actionsDenied !== 1 ||
    firstExpired !== 0 ||
    afterFirst?.amount !== 2 ||
    afterFirst.remainingRounds !== 1 ||
    secondStart.actionsDenied !== 1 ||
    secondExpired !== 1
  ) {
    throw new Error(`Long-duration stack status did not track duration separately from amount: ${JSON.stringify({ firstStart, firstExpired, afterFirst, secondStart, secondExpired })}.`);
  }
  expectTranscriptLine(
    state.transcriptLines,
    /duration ticks down from 2 to 1; 2 stacks remain active/i,
    "long-duration stack duration tick",
  );
}

{
  const laneController = fixtureActor("lane-controller", "players", {
    actions: [
      action({
        id: "lane-main-denial",
        name: "Lane Main Denial",
        sourceType: "power",
        kind: "control",
        targetPolicy: "enemy",
        diceCount: 1,
        potency: 1,
      }),
    ],
  });
  const deniedActor = fixtureActor("lane-denied-power-user", "monsters", {
    physicalHpMax: 999,
    mentalHpMax: 999,
    actions: [
      action({
        id: "lane-ready-power",
        name: "Lane Ready Power",
        sourceType: "power",
        kind: "attack",
        targetPolicy: "enemy",
        diceCount: 1,
        potency: 1,
      }),
    ],
  });
  const run = runCombatScenario({
    name: "main-action denial preserves power lane",
    players: [laneController],
    monsters: [deniedActor],
    runs: 1,
    seed: 1201,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  const lines = run.firstRunTranscript?.lines ?? [];
  expectTranscriptLine(lines, /Start of Turn: lane-denied-power-user has .* Force No Main Action from Lane Main Denial/i, "lane-specific denial start");
  expectTranscriptLine(lines, /Main Action: denied by Lane Main Denial/i, "main lane denied");
  expectTranscriptLine(lines, /Power Action: lane-denied-power-user declares Lane Ready Power/i, "power lane still runs");
  const mainDeniedIndex = lines.findIndex((line) => /Main Action: denied by Lane Main Denial/i.test(line));
  const powerActionIndex = lines.findIndex((line) => /Power Action: lane-denied-power-user declares Lane Ready Power/i.test(line));
  if (mainDeniedIndex < 0 || powerActionIndex <= mainDeniedIndex) {
    throw new Error(`Denied actor did not use power lane after main-lane denial: ${lines.join(" | ")}`);
  }
  if (run.metrics.mainActionsUsed.monsters !== 0 || run.metrics.powerActionsUsed.monsters !== 1) {
    throw new Error(
      `Main-action denial affected wrong lane: main ${run.metrics.mainActionsUsed.monsters}, power ${run.metrics.powerActionsUsed.monsters}.`,
    );
  }
}

{
  const laneController = fixtureActor("lane-skip-controller", "players", {
    actions: [
      action({
        id: "lane-skip-main-denial",
        name: "Lane Skip Main Denial",
        sourceType: "power",
        kind: "control",
        targetPolicy: "enemy",
        diceCount: 1,
        potency: 1,
      }),
    ],
  });
  const deniedActor = fixtureActor("lane-denied-no-power", "monsters", {
    physicalHpMax: 999,
    mentalHpMax: 999,
    actions: [],
  });
  const run = runCombatScenario({
    name: "main-action denial logs empty power lane",
    players: [laneController],
    monsters: [deniedActor],
    runs: 1,
    seed: 1202,
    maxRounds: 1,
    turnOrder: "playersFirst",
  });
  const lines = run.firstRunTranscript?.lines ?? [];
  expectTranscriptLine(lines, /Main Action: denied by Lane Skip Main Denial/i, "main lane denied before power skip");
  expectTranscriptLine(lines, /Power Action: skipped because no supported ready powers are hydrated for this actor/i, "power skip reason");
  if (run.metrics.skippedPowerActions.monsters !== 1) {
    throw new Error(`Skipped power action was not counted: ${run.metrics.skippedPowerActions.monsters}.`);
  }
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
  expectTranscriptLine(state.transcriptLines, /Counter declared: transcript-counter-defender will use Counterstrike against Trigger Hit/i, "counter declaration");
  expectTranscriptLine(state.transcriptLines, /Counter tradeoff: Counterstrike includes an Attack packet and no Defence packet/i, "attack-only counter tradeoff");
  expectTranscriptLine(state.transcriptLines, /Roll: transcript-counter-defender rolled .* for Counterstrike/i, "counter roll");
  expectTranscriptLine(state.transcriptLines, /Counter result: transcript-counter-attacker suffers/i, "counter result");
  expectTranscriptLine(state.transcriptLines, /Cooldown: Counterstrike enters cooldown 2/i, "counter cooldown applied");
  expectTranscriptLine(state.transcriptLines, /Cooldown tick: Counterstrike 2 -> 1/i, "counter cooldown tick");
  const counterDeclarationIndex = state.transcriptLines.findIndex((line) => /Counter declared:/i.test(line));
  const counterRollIndex = state.transcriptLines.findIndex((line) => /Roll: transcript-counter-defender rolled .* for Counterstrike/i.test(line));
  const incomingRollIndex = state.transcriptLines.findIndex((line) => /Roll: transcript-counter-attacker rolled/i.test(line));
  const incomingResultIndex = state.transcriptLines.findIndex((line) => /Incoming result:/i.test(line));
  const counterResultIndex = state.transcriptLines.findIndex((line) => /Counter result:/i.test(line));
  if (
    counterDeclarationIndex < 0 ||
    counterRollIndex < 0 ||
    incomingRollIndex < 0 ||
    incomingResultIndex < 0 ||
    counterResultIndex < 0 ||
    counterDeclarationIndex > incomingRollIndex ||
    counterRollIndex > incomingRollIndex ||
    incomingResultIndex > counterResultIndex
  ) {
    throw new Error(`Counter transcript order was incorrect: ${state.transcriptLines.join(" | ")}`);
  }
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
  expectTranscriptLine(report.firstRunTranscript.lines, /Combat start: first-run-transcript-player starts with 2 responses/i, "first run player combat-start responses");
  expectTranscriptLine(report.firstRunTranscript.lines, /Combat start: first-run-transcript-monster starts with 2 responses/i, "first run monster combat-start responses");
  const roundStartIndex = report.firstRunTranscript.lines.findIndex((line) => /Round 1 begins/i.test(line));
  const combatStartIndex = report.firstRunTranscript.lines.findIndex((line) => /Combat start:/i.test(line));
  const turnStartIndex = report.firstRunTranscript.lines.findIndex((line) => /Turn 1:/i.test(line));
  if (roundStartIndex < 0 || combatStartIndex < 0 || turnStartIndex < 0 || roundStartIndex > combatStartIndex || combatStartIndex > turnStartIndex) {
    throw new Error(`Combat-start response transcript ordering is wrong: ${report.firstRunTranscript.lines.slice(0, 8).join(" | ")}`);
  }
}

console.log(
  `combatLab.smoke.ts passed (${reports.length} fixture scenarios, unsupported fixture reasons: ${unsupportedFixture.unsupported.length}, suite unsupported powers: ${totalUnsupported}, fallback fixture actions: ${fallbackReport.hydrationIntegrity.fallbackActionCount})`,
);
