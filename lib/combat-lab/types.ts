import type {
  CoreAttribute,
  DescriptorChassisType,
  EffectPacket,
  Power,
} from "@/lib/summoning/types";

export type CombatSide = "players" | "monsters";
export type CombatPool = "physical" | "mental";
export type CombatAttributeName =
  | "Attack"
  | "Guard"
  | "Fortitude"
  | "Intellect"
  | "Synergy"
  | "Bravery";
export type CombatDieSize = "D4" | "D6" | "D8" | "D10" | "D12";
export type CombatActionKind = "attack" | "healing" | "buff" | "debuff" | "defence" | "control" | "movement" | "cleanse";
export type CombatTargetPolicy = "enemy" | "ally" | "self" | "allAllies" | "allEnemies";
export type CombatActionSourceType = "naturalAttack" | "equippedWeapon" | "power" | "fallback";
export type CombatActorRole =
  | "Glass Cannon"
  | "Bruiser"
  | "Tank"
  | "Support"
  | "Minion"
  | "Soldier"
  | "Elite"
  | "Boss"
  | string;

export type UnsupportedPowerReason = {
  powerId: string;
  powerName: string;
  reason: string;
  descriptorChassis?: DescriptorChassisType | null;
  packetIndex?: number | null;
  packetIntention?: string | null;
};

export type CombatAction = {
  id: string;
  sourcePowerId?: string | null;
  sourceType: CombatActionSourceType;
  name: string;
  kind: CombatActionKind;
  targetPolicy: CombatTargetPolicy;
  supported: boolean;
  unsupportedReasons: string[];
  pool?: CombatPool;
  rangeCategory?: "MELEE" | "RANGED" | "AOE" | null;
  targetCount?: number;
  damageTypeCount?: number;
  accuracyAttribute: CombatAttributeName;
  diceCount: number;
  potency: number;
  protection?: number;
  modifier?: {
    attribute: CombatAttributeName;
    amount: number;
    durationRounds: number;
  };
  resistAttribute?: CoreAttribute | null;
  secondaryActions?: CombatAction[];
  recurring?: {
    kind: "healingOverTime" | "ongoingDamage";
    durationRounds: number;
  };
  passive?: boolean;
  counterMode?: boolean;
  abstractionNotes?: string[];
  cooldownRounds: number;
  source?: {
    power?: Power;
    packet?: EffectPacket;
  };
};

export type CombatActorHydration = {
  source: "campaignCharacter" | "campaignMonster" | "fixture";
  realData: boolean;
  warnings: string[];
  unsupportedEquipment: string[];
  unsupportedTraits: string[];
  fallbackActions: string[];
};

export type CombatActor = {
  id: string;
  side: CombatSide;
  name: string;
  role: CombatActorRole;
  level: number;
  tier?: string | null;
  physicalHpCurrent: number;
  physicalHpMax: number;
  mentalHpCurrent: number;
  mentalHpMax: number;
  physicalProtection: number;
  mentalProtection: number;
  dodgeValue: number;
  attributes: Record<CombatAttributeName, number>;
  attributeDice: Record<CombatAttributeName, CombatDieSize>;
  resist: Partial<Record<CoreAttribute, number>>;
  actionsPerTurn: number;
  actions: CombatAction[];
  unsupportedPowers: UnsupportedPowerReason[];
  hydration: CombatActorHydration;
  defeated: boolean;
};

export type CombatStatusEffect = {
  id: string;
  sourceActorId: string;
  targetActorId: string;
  kind: "buff" | "debuff" | "protection" | "mainActionDenied" | "healingOverTime" | "ongoingDamage" | "field";
  attribute?: CombatAttributeName;
  amount: number;
  pool?: CombatPool;
  sourceActionName?: string;
  positionalAbstraction?: string;
  remainingRounds: number;
};

export type CombatState = {
  round: number;
  actors: CombatActor[];
  cooldowns: Record<string, number>;
  counterUses: Record<string, number>;
  statusEffects: CombatStatusEffect[];
  log: CombatLogEntry[];
};

export type CombatLogEntry = {
  round: number;
  actorId: string;
  actorName: string;
  actionId: string;
  actionName: string;
  targetId?: string;
  targetName?: string;
  message: string;
  metrics: Partial<CombatResolutionMetrics>;
};

export type CombatResolutionMetrics = {
  rawSuccesses: number;
  rawWounds: number;
  dodgeSuccesses: number;
  woundsAvoidedByDodge: number;
  protectionPrevented: number;
  resistCancelled: number;
  netWounds: number;
  healingDone: number;
  mitigationApplied: number;
  buffDebuffApplied: number;
  overkill: number;
  wastedActions: number;
  controlTurnsApplied: number;
  actionsDenied: number;
  forcedMovementApplied: number;
  buffApplications: number;
  buffUptime: number;
  buffedActions: number;
  debuffApplications: number;
  debuffUptime: number;
  debuffedActions: number;
  healingOverTimeApplied: number;
  ongoingDamageApplied: number;
  counterUses: number;
  counterDamage: number;
  counterMitigation: number;
  passiveDefenceContribution: number;
  positionalAbstractionsUsed: number;
};

export type CombatRunOptions = {
  maxRounds?: number;
  seed?: number;
  stalemateRounds?: number;
};

export type CombatRunResult = {
  scenarioName: string;
  winner: CombatSide | "stalemate";
  rounds: number;
  stoppedBy: "playersDefeated" | "monstersDefeated" | "maxRounds" | "stalemate";
  survivors: Record<CombatSide, number>;
  winnerHealthRemainingPercent: number;
  metrics: CombatAggregateMetrics;
  unsupported: UnsupportedPowerSummary;
  log: CombatLogEntry[];
};

export type CombatAggregateMetrics = {
  damageDealt: Record<CombatSide, number>;
  healingDone: Record<CombatSide, number>;
  protectionPrevented: Record<CombatSide, number>;
  woundsAvoidedByDodge: Record<CombatSide, number>;
  resistCancelled: Record<CombatSide, number>;
  overkill: Record<CombatSide, number>;
  oneRoundDownEvents: Record<CombatSide, number>;
  actionsUsed: Record<CombatSide, number>;
  wastedActions: Record<CombatSide, number>;
  actorsDefeatedBeforeActing: Record<CombatSide, number>;
  activeEnemiesByRound: number[];
  roleContribution: Record<
    string,
    {
      damage: number;
      healing: number;
      mitigation: number;
      buffDebuff: number;
      actions: Record<CombatActionKind, number>;
    }
  >;
  controlTurnsApplied: Record<CombatSide, number>;
  actionsDenied: Record<CombatSide, number>;
  forcedMovementApplied: Record<CombatSide, number>;
  buffApplications: Record<CombatSide, number>;
  buffUptime: Record<CombatSide, number>;
  buffedActions: Record<CombatSide, number>;
  debuffApplications: Record<CombatSide, number>;
  debuffUptime: Record<CombatSide, number>;
  debuffedActions: Record<CombatSide, number>;
  healingOverTimeApplied: Record<CombatSide, number>;
  ongoingDamageApplied: Record<CombatSide, number>;
  counterUses: Record<CombatSide, number>;
  counterDamage: Record<CombatSide, number>;
  counterMitigation: Record<CombatSide, number>;
  passiveDefenceContribution: Record<CombatSide, number>;
  positionalAbstractionsUsed: Record<CombatSide, number>;
};

export type UnsupportedPowerSummary = {
  unsupportedPowerCount: number;
  unsupportedPowerNames: string[];
  unsupportedEffectCount: number;
  reasons: UnsupportedPowerReason[];
};

export type CombatScenario = {
  name: string;
  players: CombatActor[];
  monsters: CombatActor[];
  runs: number;
  seed: number;
  maxRounds?: number;
};

export type CombatSuiteReport = {
  scenarioName: string;
  runs: number;
  playerWinRate: number;
  monsterWinRate: number;
  stalemateRate: number;
  averageRounds: number;
  medianRounds: number;
  p10Rounds: number;
  p90Rounds: number;
  averageWinnerHealthRemainingPercent: number;
  averageDamagePerRound: Record<CombatSide, number>;
  averageDamageTakenPerRound: Record<CombatSide, number>;
  averageProtectionPrevented: Record<CombatSide, number>;
  averageDodgeAvoided: Record<CombatSide, number>;
  averageResistCancelled: Record<CombatSide, number>;
  averageOverkill: Record<CombatSide, number>;
  averageActionsUsed: Record<CombatSide, number>;
  averageWastedActions: Record<CombatSide, number>;
  averageMechanics: {
    controlTurnsApplied: Record<CombatSide, number>;
    actionsDenied: Record<CombatSide, number>;
    forcedMovementApplied: Record<CombatSide, number>;
    buffApplications: Record<CombatSide, number>;
    buffUptime: Record<CombatSide, number>;
    buffedActions: Record<CombatSide, number>;
    debuffApplications: Record<CombatSide, number>;
    debuffUptime: Record<CombatSide, number>;
    debuffedActions: Record<CombatSide, number>;
    healingOverTimeApplied: Record<CombatSide, number>;
    ongoingDamageApplied: Record<CombatSide, number>;
    counterUses: Record<CombatSide, number>;
    counterDamage: Record<CombatSide, number>;
    counterMitigation: Record<CombatSide, number>;
    passiveDefenceContribution: Record<CombatSide, number>;
    positionalAbstractionsUsed: Record<CombatSide, number>;
  };
  roleContribution: CombatAggregateMetrics["roleContribution"];
  unsupported: UnsupportedPowerSummary;
  hydrationIntegrity: CombatHydrationIntegrity;
  verdict: string;
};

export type CombatHydrationIntegrity = {
  realCharacterCount: number;
  realMonsterCount: number;
  fallbackActionCount: number;
  unsupportedActionCount: number;
  unsupportedPowerCount: number;
  unsupportedEquipmentCount: number;
  unsupportedTraitCount: number;
  hydrationWarnings: string[];
  actors: Array<{
    id: string;
    name: string;
    source: CombatActorHydration["source"];
    actionCount: number;
    actions: Array<{
      id: string;
      name: string;
      sourceType: CombatActionSourceType;
      supported: boolean;
      unsupportedReasons: string[];
      targetCount?: number;
      rangeCategory?: "MELEE" | "RANGED" | "AOE" | null;
    }>;
    fallbackActions: string[];
    unsupportedPowers: UnsupportedPowerReason[];
    unsupportedEquipment: string[];
    unsupportedTraits: string[];
    warnings: string[];
  }>;
};
