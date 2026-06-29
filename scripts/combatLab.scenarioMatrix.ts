import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  adaptCampaignCharacterToCombatActor,
  adaptMonsterToCombatLabActor,
  itemTemplateToSummoningEquipmentItem,
} from "../lib/combat-lab/liveAdapters";
import { createFixtureActor } from "../lib/combat-lab/powerAdapter";
import { createActorInstances } from "../lib/combat-lab/combatState";
import { runScenarioSuite } from "../lib/combat-lab/reporting";
import { normalizeCombatTuning, normalizeCombatTuningFlatValues } from "../lib/config/combatTuningShared";
import { normalizeOutcomeNormalizationValues } from "../lib/config/outcomeNormalizationShared";
import { normalizePowerTuningValues, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import type { CoreAttribute } from "../lib/summoning/types";
import type {
  CombatAction,
  CombatActor,
  CombatCounterCandidateDiagnostic,
  CombatCooldownTrace,
  CombatScenario,
  CombatSuiteReport,
} from "../lib/combat-lab/types";

type CliOptions = {
  list: boolean;
  help: boolean;
  scenarios: string[];
  preset: string | null;
  runs: number;
  seed: number;
  json: boolean;
  out: string | null;
  includeTranscript: boolean;
};

type TuningSnapshot = {
  setId: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: string;
  values: Record<string, number>;
};

type ScenarioDefinition = DbScenarioDefinition | SyntheticScenarioDefinition;
type ScenarioLayer = "B";
type CanaryMetadata = {
  canaryId: string;
  canaryLayer: ScenarioLayer;
  purpose: string;
  baselineScenarioName: string;
  poolScenarioName: string;
  poolType: string;
  expectedMechanic: string;
  unsupportedNotes: string[];
};
type BaseScenarioMetadata = {
  name: string;
  aliases: string[];
};
type DbScenarioDefinition = BaseScenarioMetadata & {
  kind: "db";
  characterNames: string[];
  monsterName: string;
  monsterQuantity: number;
};
type SyntheticScenarioDefinition = BaseScenarioMetadata & {
  kind: "synthetic";
  canary: CanaryMetadata;
  scenarioBuilder: (options: Pick<CliOptions, "runs" | "seed">) => CombatScenario;
};

type PrismaClientLike = typeof import("../prisma/client").prisma;
type CharacterRow = Parameters<typeof adaptCampaignCharacterToCombatActor>[0];
type MonsterRow = Parameters<typeof adaptMonsterToCombatLabActor>[0];

type BuiltScenario = {
  definition: ScenarioDefinition;
  scenario: CombatScenario;
  hydrationWarnings: string[];
};

type SyntheticActorDescriptor = {
  id: string;
  side: CombatActor["side"];
  name: string;
  role: string;
  actions?: CombatAction[];
  resist?: Partial<Record<CoreAttribute, number>>;
  physicalHp?: number;
  mentalHp?: number;
  physicalProtection?: number;
  mentalProtection?: number;
  dodgeValue?: number;
  dodgeDice?: number;
  physicalDefenceDice?: number;
  physicalBlockPerSuccess?: number;
  physicalDefenceBlock?: number;
  mentalDefenceDice?: number;
  mentalBlockPerSuccess?: number;
  mentalDefenceBlock?: number;
  attack?: number;
  guard?: number;
  fortitude?: number;
  intellect?: number;
  synergy?: number;
  bravery?: number;
  attributes?: Partial<Record<string, number>>;
};

type SyntheticAttackOptions = {
  name?: string;
  accuracyAttribute?: CombatAction["accuracyAttribute"];
  diceCount?: number;
  potency?: number;
  pool?: "physical" | "mental";
  durationRounds?: number;
  cooldownRounds?: number;
  linkedToPrimary?: boolean;
  damageApplicationTiming?: CombatAction["damageApplicationTiming"];
  recurring?: CombatAction["recurring"];
};

type SyntheticDefenceOptions = Omit<SyntheticAttackOptions, "damageApplicationTiming" | "recurring"> & {
  name?: string;
  targetPolicy?: CombatAction["targetPolicy"];
  defenceMode?: CombatAction["defenceMode"];
  defenceResistedAttribute?: CombatAction["defenceResistedAttribute"];
  protection?: number;
  durationKind?: CombatAction["durationKind"];
  passiveDuration?: boolean;
  counterMode?: boolean;
};

type SyntheticDebuffOptions = Omit<SyntheticAttackOptions, "damageApplicationTiming" | "recurring"> & {
  name?: string;
  targetPolicy?: CombatAction["targetPolicy"];
  resistAttribute?: CoreAttribute | null;
  modifier?: CombatAction["modifier"];
  counterMode?: boolean;
};

function syntheticFixtureActor(params: SyntheticActorDescriptor): CombatActor {
  const actor = createFixtureActor({
    id: params.id,
    side: params.side,
    name: params.name,
    role: params.role,
    physicalHp: params.physicalHp ?? 80,
    mentalHp: params.mentalHp ?? 80,
    physicalProtection: params.physicalProtection ?? 0,
    mentalProtection: params.mentalProtection ?? 0,
    dodgeValue: params.dodgeValue ?? 6,
    attack: params.attack ?? 8,
    guard: params.guard ?? 8,
    fortitude: params.fortitude ?? 8,
    intellect: params.intellect ?? 8,
    synergy: params.synergy ?? 8,
    bravery: params.bravery ?? 8,
    dodgeDice: params.dodgeDice ?? 1,
    physicalDefenceDice: params.physicalDefenceDice ?? 1,
    physicalBlockPerSuccess: params.physicalBlockPerSuccess ?? params.physicalDefenceBlock ?? 0,
    physicalDefenceBlock: params.physicalDefenceBlock ?? 0,
    mentalDefenceDice: params.mentalDefenceDice ?? 1,
    mentalBlockPerSuccess: params.mentalBlockPerSuccess ?? params.mentalDefenceBlock ?? 0,
    mentalDefenceBlock: params.mentalDefenceBlock ?? 0,
    powers: [],
  });
  return {
    ...actor,
    resist: params.resist ?? actor.resist,
    actions: params.actions ?? actor.actions,
  };
}

function makeAttackAction(id: string, params: SyntheticAttackOptions = {}): CombatAction {
  return {
    id,
    name: params.name ?? id,
    sourceType: "power",
    kind: "attack",
    targetPolicy: "enemy",
    supported: true,
    unsupportedReasons: [],
    pool: params.pool ?? "physical",
    rangeCategory: "MELEE",
    targetCount: 1,
    accuracyAttribute: params.accuracyAttribute ?? "Attack",
    diceCount: params.diceCount ?? 1,
    potency: params.potency ?? 3,
    cooldownRounds: params.cooldownRounds ?? 0,
    durationRounds: params.durationRounds,
    damageApplicationTiming: params.damageApplicationTiming ?? "immediate",
    recurring: params.recurring,
  };
}

function makeDefenceAction(id: string, params: SyntheticDefenceOptions = {}): CombatAction {
  return {
    id,
    name: params.name ?? id,
    sourceType: "power",
    kind: "defence",
    targetPolicy: params.targetPolicy ?? "self",
    supported: true,
    unsupportedReasons: [],
    pool: params.pool ?? "physical",
    rangeCategory: "MELEE",
    targetCount: 1,
    accuracyAttribute: params.accuracyAttribute ?? "Synergy",
    diceCount: params.diceCount ?? 1,
    potency: params.potency ?? 3,
    defenceMode: params.defenceMode ?? "Block",
    defenceResistedAttribute: params.defenceResistedAttribute,
    protection: params.protection,
    durationKind: params.durationKind,
    durationRounds: params.durationRounds,
    passiveDuration: params.passiveDuration,
    cooldownRounds: params.cooldownRounds ?? 0,
    counterMode: params.counterMode,
    ...(params.durationKind === "turns" || params.durationRounds
      ? { durationSource: "authored" }
      : {}),
  };
}

function makeDebuffAction(id: string, params: SyntheticDebuffOptions = {}): CombatAction {
  return {
    id,
    name: params.name ?? id,
    sourceType: "power",
    kind: "debuff",
    targetPolicy: params.targetPolicy ?? "enemy",
    supported: true,
    unsupportedReasons: [],
    pool: "physical",
    rangeCategory: "MELEE",
    targetCount: 1,
    accuracyAttribute: params.accuracyAttribute ?? "Attack",
    diceCount: params.diceCount ?? 1,
    potency: params.potency ?? 1,
    cooldownRounds: params.cooldownRounds ?? 0,
    resistAttribute: params.resistAttribute,
    modifier: params.modifier,
    counterMode: params.counterMode,
  };
}

type MatrixPayload = {
  provenance: {
    commitSha: string;
    gitStatusShort: string;
    cleanWorktree: boolean;
    command: string;
    method: "direct-runtime-script";
    browserInspected: false;
    generatedAt: string;
    runCount: number;
    seed: number;
    seedPolicy: string;
    selectedScenarios: string[];
    actorMonsterNames: Array<{ scenarioName: string; players: string[]; monsters: string[] }>;
    activeTuningNames: {
      powerTuning: string;
      combatTuning: string;
      outcomeNormalization: string;
    };
    temporaryOverrides: [];
    dataMutation: false;
    sourceMutation: false;
    tuningMutation: false;
    validationSmokeStatus: string | null;
  };
  options: {
    runs: number;
    seed: number;
    json: boolean;
    out: string | null;
    includeTranscript: boolean;
  };
  scenarios: ScenarioMatrixRow[];
  warnings: string[];
  unsupportedNotes: string[];
};

type ScenarioMatrixRow = {
  scenarioName: string;
  canaryMetadata?: CanaryMetadata;
  playerSide: string;
  monsterSide: string;
  playerWinPercent: number;
  monsterWinPercent: number;
  stalematePercent: number;
  averageRounds: number;
  playerDamagePerRound: number;
  monsterDamagePerRound: number;
  runCount: number;
  seed: number;
  activeTuningNames: MatrixPayload["provenance"]["activeTuningNames"];
  unsupportedNotesCount: number;
  unsupportedPowerNames: string[];
  verdict: string;
  actionUseCounts: Array<{
    actorName: string;
    side: string;
    actionName: string;
    uses: number;
    damage: number;
    healing: number;
    mitigation: number;
    counterUses: number;
    ongoingDamageApplied: number;
  }>;
  cooldowns: Array<Pick<
    CombatCooldownTrace,
    "actorName" | "side" | "actionName" | "isCounter" | "cooldownRounds" | "uses" | "preventedByCooldown" | "attemptedUsesWhileOnCooldown" | "availableTurns" | "unavailableTurns"
  >>;
  defensiveChoiceSummary: {
    dodgeChosen: { players: number; monsters: number };
    physicalDefenceChosen: { players: number; monsters: number };
    mentalDefenceChosen: { players: number; monsters: number };
    dodgeDegradationApplied: { players: number; monsters: number };
    physicalDefenceDegradationApplied: { players: number; monsters: number };
    mentalDefenceDegradationApplied: { players: number; monsters: number };
    defenceStringBlocked: { players: number; monsters: number };
  };
  counterCandidateDiagnostics: Array<Pick<
    CombatCounterCandidateDiagnostic,
    "actorName" | "side" | "actionName" | "considered" | "selected" | "skippedNormalDefenceBetter" | "skippedNoResponse" | "skippedCooldown" | "skippedUnsupported" | "skippedNonAvoidable" | "skippedNonApplicable" | "lastReason"
  >>;
  ongoingPressureSummary: CombatSuiteReport["ongoingPressure"];
  defensivePoolSummary: CombatSuiteReport["defensivePools"];
  transcriptAnomalyCount: number | null;
  firstRunTranscript?: CombatSuiteReport["firstRunTranscript"];
};

const SCENARIOS: ScenarioDefinition[] = [
  {
    name: "Bruiser vs Dire Wolf",
    aliases: ["bruiser", "cl-l3-bruiser", "bruiser-vs-dire-wolf"],
    kind: "db",
    characterNames: ["CL-L3-Bruiser", "Bruiser"],
    monsterName: "Dire Wolf",
    monsterQuantity: 1,
  },
  {
    name: "Tank vs Dire Wolf",
    aliases: ["tank", "cl-l3-tank", "tank-vs-dire-wolf"],
    kind: "db",
    characterNames: ["CL-L3-Tank", "Tank"],
    monsterName: "Dire Wolf",
    monsterQuantity: 1,
  },
  {
    name: "Support vs Dire Wolf",
    aliases: ["support", "cl-l3-support", "support-vs-dire-wolf"],
    kind: "db",
    characterNames: ["CL-L3-Support", "Support"],
    monsterName: "Dire Wolf",
    monsterQuantity: 1,
  },
  {
    name: "B1 Dodge Baseline",
    aliases: ["b1-baseline", "b1-dodge-baseline", "b1-baseline-dodge"],
    kind: "synthetic",
    canary: {
      canaryId: "B1_DURATION_DODGE_POOL_SURVIVABILITY",
      canaryLayer: "B",
      purpose: "Baseline for Dodge Pool survivability delta.",
      baselineScenarioName: "B1 Dodge Baseline",
      poolScenarioName: "B1 Dodge Pool",
      poolType: "DODGE",
      expectedMechanic: "Duration Dodge Pool should absorb part of repeated physical attacks and improve survival via committed pool points.",
      unsupportedNotes: [],
    },
    scenarioBuilder: (options) => ({
      name: "B1 Dodge Baseline",
      players: [syntheticFixtureActor({
        id: "b1-defender",
        side: "players",
        name: "B1 Dodge Defender",
        role: "Tank",
        dodgeValue: 10,
        dodgeDice: 1,
        attack: 6,
        guard: 6,
        fortitude: 8,
        intellect: 8,
        synergy: 8,
        bravery: 7,
        physicalDefenceDice: 1,
        physicalBlockPerSuccess: 0,
      })],
      monsters: [syntheticFixtureActor({
        id: "b1-attacker",
        side: "monsters",
        name: "B1 Dodge Attacker",
        role: "Bruiser",
        actions: [makeAttackAction("b1-claw-strike", {
          accuracyAttribute: "Attack",
          diceCount: 2,
          potency: 4,
          pool: "physical",
        })],
        dodgeValue: 4,
        attack: 11,
        guard: 7,
        fortitude: 8,
        intellect: 8,
        synergy: 9,
        bravery: 7,
      })],
      runs: options.runs,
      seed: options.seed,
      maxRounds: 20,
      turnOrder: "alternatingByRound",
    }),
  } as SyntheticScenarioDefinition,
  {
    name: "B1 Dodge Pool",
    aliases: ["b1-pool", "b1-dodge-pool", "b1-defense-pool", "b1-dodge-with-pool"],
    kind: "synthetic",
    canary: {
      canaryId: "B1_DURATION_DODGE_POOL_SURVIVABILITY",
      canaryLayer: "B",
      purpose: "Duration Dodge Pool survivability delta.",
      baselineScenarioName: "B1 Dodge Baseline",
      poolScenarioName: "B1 Dodge Pool",
      poolType: "DODGE",
      expectedMechanic: "Duration Dodge Pool should be created, committed before roll, and improve survivability versus repeated attacks.",
      unsupportedNotes: [],
    },
    scenarioBuilder: (options) => {
      const defender = syntheticFixtureActor({
        id: "b1-defender-pool",
        side: "players",
        name: "B1 Dodge Defender",
        role: "Tank",
        actions: [
          makeDefenceAction("b1-dodge-pool", {
            name: "B1 Dodge Pool",
            targetPolicy: "self",
            defenceMode: "Dodge",
            accuracyAttribute: "Synergy",
            diceCount: 2,
            potency: 2,
            durationKind: "turns",
            durationRounds: 2,
          }),
        ],
        dodgeValue: 10,
        dodgeDice: 1,
        attack: 6,
        guard: 6,
        fortitude: 8,
        intellect: 8,
        synergy: 8,
        bravery: 7,
        physicalDefenceDice: 1,
        physicalBlockPerSuccess: 0,
      });
      return {
        name: "B1 Dodge Pool",
        players: [defender],
        monsters: [syntheticFixtureActor({
          id: "b1-attacker",
          side: "monsters",
          name: "B1 Dodge Attacker",
          role: "Bruiser",
          actions: [makeAttackAction("b1-claw-strike", {
            accuracyAttribute: "Attack",
            diceCount: 2,
            potency: 4,
            pool: "physical",
          })],
          dodgeValue: 4,
          attack: 11,
          guard: 7,
          fortitude: 8,
          intellect: 8,
          synergy: 9,
          bravery: 7,
        })],
        runs: options.runs,
        seed: options.seed,
        maxRounds: 20,
        turnOrder: "alternatingByRound",
      };
    },
  } as SyntheticScenarioDefinition,
  {
    name: "B2 Block Baseline",
    aliases: ["b2-baseline", "b2-block-baseline", "b2-physical-block-baseline"],
    kind: "synthetic",
    canary: {
      canaryId: "B2_PHYSICAL_BLOCK_POOL_SURVIVABILITY",
      canaryLayer: "B",
      purpose: "Baseline for Physical Block Pool survivability delta.",
      baselineScenarioName: "B2 Block Baseline",
      poolScenarioName: "B2 Physical Block Pool",
      poolType: "PHYSICAL_BLOCK",
      expectedMechanic: "Physical Block Pool should directly prevent physical wounds when available.",
      unsupportedNotes: [],
    },
    scenarioBuilder: (options) => ({
      name: "B2 Block Baseline",
      players: [syntheticFixtureActor({
        id: "b2-defender",
        side: "players",
        name: "B2 Block Defender",
        role: "Tank",
        actions: [makeAttackAction("b2-physical-pressure", { accuracyAttribute: "Attack", diceCount: 2, potency: 4, pool: "physical" })],
        dodgeValue: 6,
        attack: 8,
        guard: 6,
        fortitude: 9,
        intellect: 8,
        synergy: 8,
        bravery: 7,
        physicalDefenceDice: 1,
        physicalBlockPerSuccess: 0,
      })],
      monsters: [syntheticFixtureActor({
        id: "b2-attacker",
        side: "monsters",
        name: "B2 Block Attacker",
        role: "Bruiser",
        actions: [makeAttackAction("b2-physical-charge", { accuracyAttribute: "Attack", diceCount: 2, potency: 4, pool: "physical" })],
      })],
      runs: options.runs,
      seed: options.seed,
      maxRounds: 20,
      turnOrder: "alternatingByRound",
    }),
  },
  {
    name: "B2 Physical Block Pool",
    aliases: ["b2-pool", "b2-block-pool", "b2-physical-block", "b2-block-with-pool"],
    kind: "synthetic",
    canary: {
      canaryId: "B2_PHYSICAL_BLOCK_POOL_SURVIVABILITY",
      canaryLayer: "B",
      purpose: "Physical Block Pool survivability delta.",
      baselineScenarioName: "B2 Block Baseline",
      poolScenarioName: "B2 Physical Block Pool",
      poolType: "PHYSICAL_BLOCK",
      expectedMechanic: "Physical Block Pool should be committed before normal block to reduce physical wounds.",
      unsupportedNotes: [],
    },
    scenarioBuilder: (options) => ({
      name: "B2 Physical Block Pool",
      players: [syntheticFixtureActor({
        id: "b2-defender-pool",
        side: "players",
        name: "B2 Block Defender",
        role: "Tank",
        actions: [
          makeDefenceAction("b2-physical-block-pool", {
            name: "B2 Physical Block Pool",
            targetPolicy: "self",
            defenceMode: "Block",
            pool: "physical",
            accuracyAttribute: "Synergy",
            diceCount: 1,
            potency: 4,
            durationKind: "turns",
            durationRounds: 2,
            cooldownRounds: 2,
            protection: 0,
          }),
          makeAttackAction("b2-physical-pressure", { accuracyAttribute: "Attack", diceCount: 2, potency: 4, pool: "physical" }),
        ],
        dodgeValue: 6,
        attack: 8,
        guard: 6,
        fortitude: 9,
        intellect: 8,
        synergy: 8,
        bravery: 7,
        physicalDefenceDice: 1,
        physicalBlockPerSuccess: 0,
      })],
      monsters: [syntheticFixtureActor({
        id: "b2-attacker",
        side: "monsters",
        name: "B2 Block Attacker",
        role: "Bruiser",
        actions: [makeAttackAction("b2-physical-charge", { accuracyAttribute: "Attack", diceCount: 2, potency: 3, pool: "physical" })],
      })],
      runs: options.runs,
      seed: options.seed,
      maxRounds: 20,
      turnOrder: "alternatingByRound",
    }),
  },
  {
    name: "B3 Mental Block Baseline",
    aliases: ["b3-baseline", "b3-mental-block-baseline", "b3-mental-baseline"],
    kind: "synthetic",
    canary: {
      canaryId: "B3_MENTAL_BLOCK_POOL_SURVIVABILITY",
      canaryLayer: "B",
      purpose: "Baseline for Mental Block Pool survivability delta.",
      baselineScenarioName: "B3 Mental Block Baseline",
      poolScenarioName: "B3 Mental Block Pool",
      poolType: "MENTAL_BLOCK",
      expectedMechanic: "Mental pressure should be partially prevented only by Mental Block Pool and leave physical unaffected.",
      unsupportedNotes: [],
    },
    scenarioBuilder: (options) => ({
      name: "B3 Mental Block Baseline",
      players: [syntheticFixtureActor({
        id: "b3-defender",
        side: "players",
        name: "B3 Mental Defender",
        role: "Support",
        actions: [makeAttackAction("b3-mental-pressure", { accuracyAttribute: "Attack", diceCount: 2, potency: 3, pool: "mental" })],
        dodgeValue: 6,
        attack: 8,
        guard: 6,
        fortitude: 9,
        intellect: 8,
        synergy: 8,
        bravery: 7,
        physicalDefenceDice: 1,
        mentalDefenceDice: 1,
        mentalBlockPerSuccess: 0,
      })],
      monsters: [syntheticFixtureActor({
        id: "b3-attacker",
        side: "monsters",
        name: "B3 Mental Attacker",
        role: "Bruiser",
        actions: [makeAttackAction("b3-mental-strike", { accuracyAttribute: "Attack", diceCount: 2, potency: 3, pool: "mental" })],
      })],
      runs: options.runs,
      seed: options.seed,
      maxRounds: 20,
      turnOrder: "alternatingByRound",
    }),
  },
  {
    name: "B3 Mental Block Pool",
    aliases: ["b3-pool", "b3-mental-block-pool", "b3-mental-pool"],
    kind: "synthetic",
    canary: {
      canaryId: "B3_MENTAL_BLOCK_POOL_SURVIVABILITY",
      canaryLayer: "B",
      purpose: "Mental Block Pool survivability delta.",
      baselineScenarioName: "B3 Mental Block Baseline",
      poolScenarioName: "B3 Mental Block Pool",
      poolType: "MENTAL_BLOCK",
      expectedMechanic: "Mental Block Pool should prevent matching-lane mental wounds after attack pool generation.",
      unsupportedNotes: [],
    },
    scenarioBuilder: (options) => ({
      name: "B3 Mental Block Pool",
      players: [syntheticFixtureActor({
        id: "b3-defender-pool",
        side: "players",
        name: "B3 Mental Defender",
        role: "Support",
        actions: [
          makeDefenceAction("b3-mental-block-pool", {
            name: "B3 Mental Block Pool",
            targetPolicy: "self",
            defenceMode: "Block",
            pool: "mental",
            accuracyAttribute: "Synergy",
            diceCount: 1,
            potency: 4,
            durationKind: "turns",
            durationRounds: 2,
            cooldownRounds: 2,
            protection: 0,
          }),
          makeAttackAction("b3-mental-pressure", { accuracyAttribute: "Attack", diceCount: 2, potency: 3, pool: "mental" }),
        ],
        dodgeValue: 6,
        attack: 8,
        guard: 6,
        fortitude: 9,
        intellect: 8,
        synergy: 8,
        bravery: 7,
        physicalDefenceDice: 1,
        mentalDefenceDice: 1,
        mentalBlockPerSuccess: 0,
      })],
      monsters: [syntheticFixtureActor({
        id: "b3-attacker",
        side: "monsters",
        name: "B3 Mental Attacker",
        role: "Bruiser",
        actions: [makeAttackAction("b3-mental-strike", { accuracyAttribute: "Attack", diceCount: 2, potency: 3, pool: "mental" })],
      })],
      runs: options.runs,
      seed: options.seed,
      maxRounds: 20,
      turnOrder: "alternatingByRound",
    }),
  },
  {
    name: "B4 Resist Baseline",
    aliases: ["b4-baseline", "b4-resist-baseline", "b4-hostile-baseline"],
    kind: "synthetic",
    canary: {
      canaryId: "B4_RESIST_POOL_CONTROL_PREVENTION",
      canaryLayer: "B",
      purpose: "Baseline for Resist Pool control/debuff prevention delta.",
      baselineScenarioName: "B4 Resist Baseline",
      poolScenarioName: "B4 Resist Pool",
      poolType: "RESIST",
      expectedMechanic: "Resist Pool should cancel matching-lane hostile effects only.",
      unsupportedNotes: ["Layer B Resist canary uses ATTACK lane matching against hostile debuff packets."],
    },
    scenarioBuilder: (options) => ({
      name: "B4 Resist Baseline",
      players: [syntheticFixtureActor({
        id: "b4-defender",
        side: "players",
        name: "B4 Resistant Defender",
        role: "Support",
        resist: { ATTACK: 0 },
        actions: [makeAttackAction("b4-attack-pressure", { accuracyAttribute: "Attack", diceCount: 2, potency: 2, pool: "physical" })],
        dodgeValue: 8,
        attack: 7,
        guard: 8,
        fortitude: 8,
        intellect: 8,
        synergy: 8,
        bravery: 8,
      })],
      monsters: [syntheticFixtureActor({
        id: "b4-attacker",
        side: "monsters",
        name: "B4 Debuff Attacker",
        role: "Bruiser",
        actions: [
          makeDebuffAction("b4-hostile-pressure", {
            accuracyAttribute: "Attack",
            diceCount: 2,
            potency: 4,
            resistAttribute: "ATTACK",
            modifier: { attribute: "Attack", amount: 1, durationRounds: 2, modifiesRollResults: false },
          }),
        ],
      })],
      runs: options.runs,
      seed: options.seed,
      maxRounds: 20,
      turnOrder: "alternatingByRound",
    }),
  },
  {
    name: "B4 Resist Pool",
    aliases: ["b4-pool", "b4-resist-pool", "b4-hostile-pool"],
    kind: "synthetic",
    canary: {
      canaryId: "B4_RESIST_POOL_CONTROL_PREVENTION",
      canaryLayer: "B",
      purpose: "Resist Pool control/debuff prevention delta.",
      baselineScenarioName: "B4 Resist Baseline",
      poolScenarioName: "B4 Resist Pool",
      poolType: "RESIST",
      expectedMechanic: "Resist Pool should spend against matching ATTACK hostile units and reduce hostile success retention.",
      unsupportedNotes: ["Layer B Resist canary uses ATTACK lane matching against hostile debuff packets."],
    },
    scenarioBuilder: (options) => ({
      name: "B4 Resist Pool",
      players: [syntheticFixtureActor({
        id: "b4-defender-pool",
        side: "players",
        name: "B4 Resistant Defender",
        role: "Support",
        resist: { ATTACK: 0 },
        actions: [
          makeDefenceAction("b4-resist-pool", {
            name: "B4 Resist Pool",
            targetPolicy: "self",
            defenceMode: "Resist",
            defenceResistedAttribute: "ATTACK",
            accuracyAttribute: "Synergy",
            diceCount: 1,
            potency: 2,
            durationKind: "turns",
            durationRounds: 2,
          }),
          makeAttackAction("b4-attack-pressure", { accuracyAttribute: "Attack", diceCount: 2, potency: 2, pool: "physical" }),
        ],
        dodgeValue: 8,
        attack: 7,
        guard: 8,
        fortitude: 8,
        intellect: 8,
        synergy: 8,
        bravery: 8,
      })],
      monsters: [syntheticFixtureActor({
        id: "b4-attacker",
        side: "monsters",
        name: "B4 Debuff Attacker",
        role: "Bruiser",
        resist: {},
        actions: [
          makeDebuffAction("b4-hostile-pressure", {
            accuracyAttribute: "Attack",
            diceCount: 2,
            potency: 4,
            resistAttribute: "ATTACK",
            modifier: { attribute: "Attack", amount: 1, durationRounds: 2, modifiesRollResults: false },
          }),
        ],
      })],
      runs: options.runs,
      seed: options.seed,
      maxRounds: 20,
      turnOrder: "alternatingByRound",
    }),
  },
];

const PRESETS: Record<string, string[]> = {
  "dire-wolf-core": SCENARIOS.slice(0, 3).map((scenario) => scenario.name),
  "defensive-pool-core": SCENARIOS.slice(3).map((scenario) => scenario.name),
};

const POWER_INCLUDE = {
  rangeCategories: { orderBy: { rangeCategory: "asc" as const } },
  primaryDefenceGate: true,
  effectPackets: {
    orderBy: { packetIndex: "asc" as const },
    include: { localTargetingOverride: true },
  },
};

const ITEM_TEMPLATE_INCLUDE = {
  rangeCategories: { select: { rangeCategory: true } },
  meleeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  rangedDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  aoeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  attackEffectsMelee: { select: { attackEffect: { select: { name: true } } } },
  attackEffectsRanged: { select: { attackEffect: { select: { name: true } } } },
  attackEffectsAoE: { select: { attackEffect: { select: { name: true } } } },
  vrpEntries: { select: { effectKind: true, magnitude: true, damageType: { select: { name: true } } } },
};

function usage() {
  return [
    "Combat Lab scenario matrix runner",
    "",
    "Usage:",
    "  npx --yes tsx scripts/combatLab.scenarioMatrix.ts --list",
    "  npx --yes tsx scripts/combatLab.scenarioMatrix.ts --preset dire-wolf-core --runs 500 --seed 4242",
    "  npx --yes tsx scripts/combatLab.scenarioMatrix.ts --scenario \"Bruiser vs Dire Wolf\" --runs 500 --seed 4242",
    "  npx --yes tsx scripts/combatLab.scenarioMatrix.ts --preset dire-wolf-core --runs 1000 --seed 4242 --json",
    "  npx --yes tsx scripts/combatLab.scenarioMatrix.ts --preset dire-wolf-core --runs 1000 --seed 4242 --out tmp/combat-lab-matrix.json",
    "",
    "Flags:",
    "  --list",
    "  --scenario <name>       Repeatable. Friendly aliases are accepted.",
    "  --preset <name>         Supported: dire-wolf-core, defensive-pool-core",
    "  --runs <number>         Default: 500",
    "  --seed <number>         Default: 4242",
    "  --json                  Print valid JSON only",
    "  --out <path>            Write full JSON payload to path",
    "  --include-transcript    Include first-run transcript in JSON output",
    "  --help",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    list: false,
    help: false,
    scenarios: [],
    preset: null,
    runs: 500,
    seed: 4242,
    json: false,
    out: null,
    includeTranscript: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list") {
      options.list = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--scenario") {
      const value = argv[++index];
      if (!value) throw new Error("--scenario requires a name");
      options.scenarios.push(value);
    } else if (arg === "--preset") {
      const value = argv[++index];
      if (!value) throw new Error("--preset requires a name");
      options.preset = value;
    } else if (arg === "--runs") {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1) throw new Error("--runs must be a positive integer");
      options.runs = value;
    } else if (arg === "--seed") {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 0) throw new Error("--seed must be a non-negative integer");
      options.seed = value;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--out") {
      const value = argv[++index];
      if (!value) throw new Error("--out requires a path");
      options.out = value;
    } else if (arg === "--include-transcript") {
      options.includeTranscript = true;
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  return options;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function resolveScenarioName(name: string): ScenarioDefinition | null {
  const normalized = normalizeName(name);
  return SCENARIOS.find(
    (scenario) =>
      normalizeName(scenario.name) === normalized ||
      scenario.aliases.some((alias) => normalizeName(alias) === normalized),
  ) ?? null;
}

function selectedScenarioDefinitions(options: CliOptions): ScenarioDefinition[] {
  const names: string[] = [];
  if (options.preset) {
    const preset = PRESETS[options.preset];
    if (!preset) throw new Error(`Unknown preset "${options.preset}". Use --list to see supported presets.`);
    names.push(...preset);
  }
  names.push(...options.scenarios);
  if (names.length === 0) throw new Error("No scenarios selected. Use --preset or --scenario.");

  const definitions: ScenarioDefinition[] = [];
  for (const name of names) {
    const definition = resolveScenarioName(name);
    if (!definition) throw new Error(`Unknown scenario "${name}". Use --list to see supported scenarios.`);
    if (!definitions.some((entry) => entry.name === definition.name)) definitions.push(definition);
  }
  return definitions;
}

function loadEnvFile(relativePath: string) {
  const absolutePath = join(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) return;

  for (const rawLine of readFileSync(absolutePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
}

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) return "UNKNOWN";
  return result.stdout.trim();
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function toTuningSnapshot(
  set: {
    id: string;
    name: string;
    slug: string;
    status: string;
    updatedAt: Date;
    entries: Array<{ configKey: string; value: number }>;
  },
  normalize: (values: Record<string, unknown>) => Record<string, number>,
): TuningSnapshot {
  return {
    setId: set.id,
    name: set.name,
    slug: set.slug,
    status: set.status,
    updatedAt: set.updatedAt.toISOString(),
    values: normalize(entriesToRecord(set.entries)),
  };
}

function pct(value: number): number {
  return round(value * 100, 1);
}

function round(value: number, places = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function actorNames(actors: CombatActor[]): string[] {
  return actors.map((actor) => actor.displayGroupName ?? actor.name);
}

function summarizeActions(report: CombatSuiteReport): ScenarioMatrixRow["actionUseCounts"] {
  return report.actorContributions
    .flatMap((actor) =>
      actor.actionContributions.map((action) => ({
        actorName: actor.actorName,
        side: actor.side,
        actionName: action.actionName,
        uses: round(action.uses),
        damage: round(action.damage),
        healing: round(action.healing + action.healingOverTimeApplied + action.healingTicks),
        mitigation: round(action.mitigation + action.counterMitigation),
        counterUses: round(action.counterUses),
        ongoingDamageApplied: round(action.ongoingDamageApplied),
      })),
    )
    .filter((entry) =>
      entry.uses > 0 ||
      entry.damage > 0 ||
      entry.healing > 0 ||
      entry.mitigation > 0 ||
      entry.counterUses > 0 ||
      entry.ongoingDamageApplied > 0,
    )
    .sort((left, right) =>
      right.uses - left.uses ||
      right.damage - left.damage ||
      left.actorName.localeCompare(right.actorName) ||
      left.actionName.localeCompare(right.actionName),
    )
    .slice(0, 20);
}

function summarizeCooldowns(report: CombatSuiteReport): ScenarioMatrixRow["cooldowns"] {
  return report.cooldownTrace
    .filter((entry) =>
      entry.uses > 0 ||
      entry.preventedByCooldown > 0 ||
      entry.attemptedUsesWhileOnCooldown > 0 ||
      entry.availableTurns > 0 ||
      entry.unavailableTurns > 0,
    )
    .map((entry) => ({
      actorName: entry.actorName,
      side: entry.side,
      actionName: entry.actionName,
      isCounter: entry.isCounter,
      cooldownRounds: entry.cooldownRounds,
      uses: round(entry.uses),
      preventedByCooldown: round(entry.preventedByCooldown),
      attemptedUsesWhileOnCooldown: round(entry.attemptedUsesWhileOnCooldown),
      availableTurns: round(entry.availableTurns),
      unavailableTurns: round(entry.unavailableTurns),
    }))
    .slice(0, 20);
}

function summarizeCounters(report: CombatSuiteReport): ScenarioMatrixRow["counterCandidateDiagnostics"] {
  return report.counterCandidateDiagnostics
    .filter((entry) => entry.considered > 0 || entry.selected > 0)
    .map((entry) => ({
      actorName: entry.actorName,
      side: entry.side,
      actionName: entry.actionName,
      considered: round(entry.considered),
      selected: round(entry.selected),
      skippedNormalDefenceBetter: round(entry.skippedNormalDefenceBetter),
      skippedNoResponse: round(entry.skippedNoResponse),
      skippedCooldown: round(entry.skippedCooldown),
      skippedUnsupported: round(entry.skippedUnsupported),
      skippedNonAvoidable: round(entry.skippedNonAvoidable),
      skippedNonApplicable: round(entry.skippedNonApplicable),
      lastReason: entry.lastReason,
    }))
    .slice(0, 20);
}

function transcriptAnomalyCount(report: CombatSuiteReport): number {
  const lines = report.firstRunTranscript?.lines ?? [];
  return lines.filter((line) => /\bNaN\b|undefined|\[object Object\]/i.test(line)).length;
}

function scenarioToRow(
  built: BuiltScenario,
  report: CombatSuiteReport,
  options: CliOptions,
  activeTuningNames: MatrixPayload["provenance"]["activeTuningNames"],
): ScenarioMatrixRow {
  const row: ScenarioMatrixRow = {
    scenarioName: report.scenarioName,
    canaryMetadata: built.definition.kind === "synthetic" ? built.definition.canary : undefined,
    playerSide: actorNames(built.scenario.players).join(", "),
    monsterSide: actorNames(built.scenario.monsters).join(", "),
    playerWinPercent: pct(report.playerWinRate),
    monsterWinPercent: pct(report.monsterWinRate),
    stalematePercent: pct(report.stalemateRate),
    averageRounds: round(report.averageRounds),
    playerDamagePerRound: round(report.averageDamagePerRound.players),
    monsterDamagePerRound: round(report.averageDamagePerRound.monsters),
    runCount: report.runs,
    seed: built.scenario.seed,
    activeTuningNames,
    unsupportedNotesCount: report.unsupported.unsupportedEffectCount + report.hydrationIntegrity.hydrationWarnings.length,
    unsupportedPowerNames: report.unsupported.unsupportedPowerNames,
    verdict: report.verdict,
    actionUseCounts: summarizeActions(report),
    cooldowns: summarizeCooldowns(report),
    defensiveChoiceSummary: {
      dodgeChosen: {
        players: round(report.averageMechanics.dodgeChosen.players),
        monsters: round(report.averageMechanics.dodgeChosen.monsters),
      },
      physicalDefenceChosen: {
        players: round(report.averageMechanics.physicalDefenceChosen.players),
        monsters: round(report.averageMechanics.physicalDefenceChosen.monsters),
      },
      mentalDefenceChosen: {
        players: round(report.averageMechanics.mentalDefenceChosen.players),
        monsters: round(report.averageMechanics.mentalDefenceChosen.monsters),
      },
      dodgeDegradationApplied: {
        players: round(report.averageMechanics.dodgeDegradationApplied.players),
        monsters: round(report.averageMechanics.dodgeDegradationApplied.monsters),
      },
      physicalDefenceDegradationApplied: {
        players: round(report.averageMechanics.physicalDefenceDegradationApplied.players),
        monsters: round(report.averageMechanics.physicalDefenceDegradationApplied.monsters),
      },
      mentalDefenceDegradationApplied: {
        players: round(report.averageMechanics.mentalDefenceDegradationApplied.players),
        monsters: round(report.averageMechanics.mentalDefenceDegradationApplied.monsters),
      },
      defenceStringBlocked: {
        players: round(report.averageMechanics.defenceStringBlocked.players),
        monsters: round(report.averageMechanics.defenceStringBlocked.monsters),
      },
    },
    counterCandidateDiagnostics: summarizeCounters(report),
    ongoingPressureSummary: report.ongoingPressure,
    defensivePoolSummary: report.defensivePools,
    transcriptAnomalyCount: options.includeTranscript ? transcriptAnomalyCount(report) : null,
  };
  if (options.includeTranscript) row.firstRunTranscript = report.firstRunTranscript;
  return row;
}

async function loadActiveTuning(prisma: PrismaClientLike) {
  const [powerSet, combatSet, outcomeSet] = await Promise.all([
    prisma.powerTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
    prisma.combatTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
    prisma.outcomeNormalizationConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
  ]);
  const missing = [
    !powerSet ? "Power Tuning" : null,
    !combatSet ? "Combat Tuning" : null,
    !outcomeSet ? "Outcome Normalization" : null,
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Missing ACTIVE tuning set(s): ${missing.join(", ")}. Runner does not seed tuning because it is read-only.`);
  }
  const powerSnapshot = toTuningSnapshot(powerSet!, normalizePowerTuningValues) as PowerTuningSnapshot;
  const combatSnapshot = toTuningSnapshot(combatSet!, normalizeCombatTuningFlatValues);
  const outcomeSnapshot = toTuningSnapshot(outcomeSet!, normalizeOutcomeNormalizationValues);
  return {
    powerSnapshot,
    combatSnapshot,
    outcomeSnapshot,
    combatValues: normalizeCombatTuning(combatSnapshot.values),
  };
}

function findByPreferredName<T extends { name: string }>(rows: T[], names: string[]): T | null {
  for (const name of names) {
    const exact = rows.find((row) => row.name === name);
    if (exact) return exact;
  }
  const normalizedNames = names.map(normalizeName);
  return rows.find((row) => normalizedNames.includes(normalizeName(row.name))) ?? null;
}

async function buildScenarios(
  prisma: PrismaClientLike,
  definitions: ScenarioDefinition[],
  options: CliOptions,
  tuning: Awaited<ReturnType<typeof loadActiveTuning>>,
): Promise<BuiltScenario[]> {
  const syntheticDefinitions = definitions.filter((definition): definition is SyntheticScenarioDefinition =>
    definition.kind === "synthetic",
  );
  const dbDefinitions = definitions.filter((definition): definition is DbScenarioDefinition =>
    definition.kind === "db",
  );

  const syntheticBuilt: BuiltScenario[] = syntheticDefinitions.map((definition) => ({
    definition,
    hydrationWarnings: [],
    scenario: definition.scenarioBuilder({ runs: options.runs, seed: options.seed }),
  }));

  if (dbDefinitions.length === 0) {
    return syntheticBuilt;
  }

  const monsterNames = Array.from(new Set(dbDefinitions.map((definition) => definition.monsterName)));
  const primaryMonsterName = monsterNames[0];
  if (!primaryMonsterName) throw new Error("No monster names selected.");

  const anchorMonster = await prisma.monster.findFirst({
    where: { name: primaryMonsterName, source: "CAMPAIGN", isReadOnly: false },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      naturalAttack: true,
      attacks: { orderBy: { sortOrder: "asc" } },
      traits: { orderBy: { sortOrder: "asc" }, include: { trait: { select: { name: true, effectText: true } } } },
      powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
    },
  });
  if (!anchorMonster?.campaignId) throw new Error(`${primaryMonsterName} campaign monster not found.`);

  const [monsters, characters] = await Promise.all([
    prisma.monster.findMany({
      where: { campaignId: anchorMonster.campaignId, name: { in: monsterNames }, source: "CAMPAIGN", isReadOnly: false },
      include: {
        naturalAttack: true,
        attacks: { orderBy: { sortOrder: "asc" } },
        traits: { orderBy: { sortOrder: "asc" }, include: { trait: { select: { name: true, effectText: true } } },
        },
        powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
      },
    }),
    prisma.campaignCharacter.findMany({
      where: {
        campaignId: anchorMonster.campaignId,
        archivedAt: null,
      },
      include: {
        backpackItems: {
          include: {
            partyInventoryItem: {
              include: {
                itemTemplate: {
                  include: ITEM_TEMPLATE_INCLUDE,
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const monsterItemIds = Array.from(
    new Set(
      monsters.flatMap((monster) => {
        return [
          monster.mainHandItemId,
          monster.offHandItemId,
          monster.smallItemId,
          monster.headArmorItemId,
          monster.shoulderArmorItemId,
          monster.torsoArmorItemId,
          monster.legsArmorItemId,
          monster.feetArmorItemId,
          monster.headItemId,
          monster.neckItemId,
          monster.armsItemId,
          monster.beltItemId,
        ];
      }).filter(Boolean) as string[],
    ),
  );
  const itemRows = monsterItemIds.length > 0
    ? await prisma.itemTemplate.findMany({
        where: { campaignId: anchorMonster.campaignId, id: { in: monsterItemIds } },
        include: ITEM_TEMPLATE_INCLUDE,
      })
    : [];
  const monsterEquipmentById = new Map(
    itemRows.map((item) => [item.id, itemTemplateToSummoningEquipmentItem(item)]),
  );

  const dbBuilt = dbDefinitions.map((definition) => {
    const character = findByPreferredName(characters as CharacterRow[], definition.characterNames);
    if (!character) {
      throw new Error(
        `Scenario "${definition.name}" could not find character. Tried: ${definition.characterNames.join(", ")}.`,
      );
    }
    const monster = findByPreferredName(monsters as MonsterRow[], [definition.monsterName]);
    if (!monster) throw new Error(`Scenario "${definition.name}" could not find monster "${definition.monsterName}".`);

    const adaptedCharacter = adaptCampaignCharacterToCombatActor(character, tuning.combatValues, tuning.powerSnapshot);
    const adaptedMonster = adaptMonsterToCombatLabActor(
      monster,
      monsterEquipmentById,
      tuning.combatValues,
      tuning.powerSnapshot,
    );
    const monsterInstances = createActorInstances(adaptedMonster.actor, definition.monsterQuantity);
    return {
      definition,
      hydrationWarnings: [...adaptedCharacter.warnings, ...adaptedMonster.warnings].map((warning) =>
        typeof warning === "string" ? warning : JSON.stringify(warning),
      ),
      scenario: {
        name: definition.name,
        players: [adaptedCharacter.actor],
        monsters: monsterInstances,
        runs: options.runs,
        seed: options.seed,
        maxRounds: 20,
        turnOrder: "alternatingByRound" as const,
      },
    };
  });

  return definitions.map((definition) => {
    const existing = definition.kind === "synthetic"
      ? syntheticBuilt.find((entry) => entry.definition.name === definition.name)
      : dbBuilt.find((entry) => entry.definition.name === definition.name);
    if (!existing) throw new Error(`Failed to build scenario "${definition.name}".`);
    return existing;
  });
}

function printList() {
  console.log("Scenarios:");
  for (const scenario of SCENARIOS) {
    console.log(`- ${scenario.name}`);
    console.log(`  aliases: ${scenario.aliases.join(", ")}`);
  }
  console.log("");
  console.log("Presets:");
  for (const [preset, scenarios] of Object.entries(PRESETS)) {
    console.log(`- ${preset}: ${scenarios.join(", ")}`);
  }
}

function printHumanSummary(payload: MatrixPayload) {
  console.log("Combat Lab Scenario Matrix");
  console.log(`Commit: ${payload.provenance.commitSha}`);
  console.log(`Worktree: ${payload.provenance.cleanWorktree ? "clean" : "dirty"}`);
  console.log(
    `Tuning: Power "${payload.provenance.activeTuningNames.powerTuning}", Combat "${payload.provenance.activeTuningNames.combatTuning}", Outcome "${payload.provenance.activeTuningNames.outcomeNormalization}"`,
  );
  console.log(`Runs: ${payload.options.runs}, Seed: ${payload.options.seed}, Method: ${payload.provenance.method}`);
  console.log("");
  console.log([
    "Scenario",
    "Players",
    "Monsters",
    "P Win",
    "M Win",
    "Stale",
    "Rounds",
    "P DPR",
    "M DPR",
    "Unsupported",
  ].join(" | "));
  console.log([
    "---",
    "---",
    "---",
    "---:",
    "---:",
    "---:",
    "---:",
    "---:",
    "---:",
    "---:",
  ].join(" | "));
  for (const scenario of payload.scenarios) {
    console.log([
      scenario.scenarioName,
      scenario.playerSide,
      scenario.monsterSide,
      `${scenario.playerWinPercent}%`,
      `${scenario.monsterWinPercent}%`,
      `${scenario.stalematePercent}%`,
      scenario.averageRounds,
      scenario.playerDamagePerRound,
      scenario.monsterDamagePerRound,
      scenario.unsupportedNotesCount,
    ].join(" | "));
  }
  if (payload.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of payload.warnings) console.log(`- ${warning}`);
  }
  if (payload.unsupportedNotes.length > 0) {
    console.log("");
    console.log("Unsupported Notes:");
    for (const note of payload.unsupportedNotes) console.log(`- ${note}`);
  }

  const canaryGroups = new Map<string, { metadata: ScenarioMatrixRow["canaryMetadata"]; baselineName: string; poolName: string }>();
  for (const scenario of payload.scenarios) {
    if (!scenario.canaryMetadata) continue;
    const metadata = scenario.canaryMetadata;
    canaryGroups.set(metadata.canaryId, {
      metadata,
      baselineName: metadata.baselineScenarioName,
      poolName: metadata.poolScenarioName,
    });
  }

  if (canaryGroups.size > 0) {
    const scenarioByName = new Map(payload.scenarios.map((scenario) => [scenario.scenarioName, scenario]));
    const bySourceSideMetric = (report: CombatSuiteReport["defensivePools"]) => ({
      poolsCreated: report.bySourceSide.players.poolsCreated + report.bySourceSide.monsters.poolsCreated,
      generatedPoints: report.bySourceSide.players.averageGeneratedPoints + report.bySourceSide.monsters.averageGeneratedPoints,
      committedPoints: report.bySourceSide.players.committedPoints + report.bySourceSide.monsters.committedPoints,
      spentPoints: report.bySourceSide.players.spentPoints + report.bySourceSide.monsters.spentPoints,
      wastedPoints: report.bySourceSide.players.wastedPoints + report.bySourceSide.monsters.wastedPoints,
      remainingAtExpiry: report.bySourceSide.players.remainingAtExpiry + report.bySourceSide.monsters.remainingAtExpiry,
      refreshReplaceEvents:
        report.bySourceSide.players.refreshReplaceEvents + report.bySourceSide.monsters.refreshReplaceEvents,
      dodgeAvoids: report.bySourceSide.players.dodgeAvoids + report.bySourceSide.monsters.dodgeAvoids,
      blockWoundsPrevented:
        report.bySourceSide.players.blockWoundsPrevented + report.bySourceSide.monsters.blockWoundsPrevented,
      resistUnitsCancelled:
        report.bySourceSide.players.resistUnitsCancelled + report.bySourceSide.monsters.resistUnitsCancelled,
    });
    const delta = (after: number, before: number, precision = 1) =>
      `${after >= before ? "+" : ""}${round((after - before) * 10 ** precision) / 10 ** precision}`;

    console.log("");
    console.log("Canary Deltas:");
    for (const [canaryId, group] of canaryGroups) {
      const baseline = scenarioByName.get(group.baselineName);
      const pool = scenarioByName.get(group.poolName);
      if (!baseline || !pool) {
        console.log(`- ${canaryId}: baseline/pool pairing incomplete`);
        continue;
      }
      const baseDefense = bySourceSideMetric(baseline.defensivePoolSummary);
      const poolDefense = bySourceSideMetric(pool.defensivePoolSummary);
      console.log(`${group.metadata?.canaryLayer ? `${group.metadata.canaryLayer}: ` : ""}${canaryId}`);
      console.log(`  Mechanic: ${group.metadata?.expectedMechanic ?? "unknown"}`);
      console.log(
        `  Delta: P Win ${delta(pool.playerWinPercent, baseline.playerWinPercent)} | M Win ${delta(
          pool.monsterWinPercent,
          baseline.monsterWinPercent,
        )} | Rounds ${delta(pool.averageRounds, baseline.averageRounds)} | P DPR ${delta(
          pool.playerDamagePerRound,
          baseline.playerDamagePerRound,
        )} | M DPR ${delta(pool.monsterDamagePerRound, baseline.monsterDamagePerRound)}`,
      );
      console.log(
        `  Defensive Pools: created ${delta(poolDefense.poolsCreated, baseDefense.poolsCreated)} | committed ${delta(
          poolDefense.committedPoints,
          baseDefense.committedPoints,
        )} | spent ${delta(poolDefense.spentPoints, baseDefense.spentPoints)} | wasted ${delta(
          poolDefense.wastedPoints,
          baseDefense.wastedPoints,
        )} | remain ${delta(poolDefense.remainingAtExpiry, baseDefense.remainingAtExpiry)} | refresh ${delta(
          poolDefense.refreshReplaceEvents,
          baseDefense.refreshReplaceEvents,
        )}`,
      );
      console.log(
        `  Defensive Effects: dodgeAvoids ${delta(poolDefense.dodgeAvoids, baseDefense.dodgeAvoids)} | blockWoundsPrevented ${delta(
          poolDefense.blockWoundsPrevented,
          baseDefense.blockWoundsPrevented,
        )} | resistUnitsCancelled ${delta(
          poolDefense.resistUnitsCancelled,
          baseDefense.resistUnitsCancelled,
        )}`,
      );
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.list) {
    if (options.json) {
      console.log(JSON.stringify({ scenarios: SCENARIOS, presets: PRESETS }, null, 2));
    } else {
      printList();
    }
    return;
  }

  const definitions = selectedScenarioDefinitions(options);
  loadLocalEnv();
  const prismaModule = await import("../prisma/client");
  const prismaExport = prismaModule as unknown as {
    prisma?: typeof prismaModule.prisma;
    default?: { prisma?: typeof prismaModule.prisma };
  };
  const prisma = prismaExport.prisma ?? prismaExport.default?.prisma;
  if (!prisma) throw new Error("Prisma client export was not found.");

  try {
    const tuning = await loadActiveTuning(prisma);
    const builtScenarios = await buildScenarios(prisma, definitions, options, tuning);
    const activeTuningNames = {
      powerTuning: tuning.powerSnapshot.name,
      combatTuning: tuning.combatSnapshot.name,
      outcomeNormalization: tuning.outcomeSnapshot.name,
    };
    const scenarioRows = builtScenarios.map((built) =>
      scenarioToRow(built, runScenarioSuite(built.scenario), options, activeTuningNames),
    );
    const unsupportedNotes = Array.from(
      new Set([
        ...builtScenarios.flatMap((scenario) => scenario.hydrationWarnings),
        ...scenarioRows.flatMap((scenario) => scenario.defensivePoolSummary.unsupportedNotes),
        ...scenarioRows.flatMap((scenario) => scenario.unsupportedPowerNames.map((name) => `Unsupported power: ${name}`)),
      ]),
    );
    const gitStatusShort = runGit(["status", "--short"]);
    const command = process.argv.map((arg) => JSON.stringify(arg)).join(" ");
    const payload: MatrixPayload = {
      provenance: {
        commitSha: runGit(["rev-parse", "HEAD"]),
        gitStatusShort,
        cleanWorktree: gitStatusShort.length === 0,
        command,
        method: "direct-runtime-script",
        browserInspected: false,
        generatedAt: new Date().toISOString(),
        runCount: options.runs,
        seed: options.seed,
        seedPolicy: `scenario seed ${options.seed}; run index adds the committed Combat Lab runtime offset`,
        selectedScenarios: scenarioRows.map((row) => row.scenarioName),
        actorMonsterNames: builtScenarios.map((built) => ({
          scenarioName: built.scenario.name,
          players: actorNames(built.scenario.players),
          monsters: actorNames(built.scenario.monsters),
        })),
        activeTuningNames,
        temporaryOverrides: [],
        dataMutation: false,
        sourceMutation: false,
        tuningMutation: false,
        validationSmokeStatus: null,
      },
      options: {
        runs: options.runs,
        seed: options.seed,
        json: options.json,
        out: options.out,
        includeTranscript: options.includeTranscript,
      },
      scenarios: scenarioRows,
      warnings: [],
      unsupportedNotes,
    };

    if (options.out) {
      const outPath = resolve(process.cwd(), options.out);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    }

    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      printHumanSummary(payload);
      if (options.out) console.log(`\nWrote JSON: ${options.out}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
