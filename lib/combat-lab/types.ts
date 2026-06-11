import type {
  CoreAttribute,
  DescriptorChassisType,
  EffectPacket,
  Power,
} from "@/lib/summoning/types";

export type CombatSide = "players" | "monsters";
export type CombatPool = "physical" | "mental";
export type CombatTurnOrder = "playersFirst" | "monstersFirst" | "alternatingByRound" | "randomSeeded";
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
export type CombatActionLane = "combatStart" | "main" | "power" | "response" | "startOfTurn" | "endOfTurn";
export type CombatDurationKind = "instant" | "turns" | "passive";
export type CombatDurationSource = "authored" | "inheritedFromParent" | "defaulted";
export type CombatDefensivePoolType = "DODGE" | "PHYSICAL_BLOCK" | "MENTAL_BLOCK" | "RESIST";
export type CombatDefensivePoolSourceChassis = "IMMEDIATE" | "FIELD" | "ATTACHED" | "TRIGGER" | "RESERVE" | "UNKNOWN";
export type CombatDefensivePoolCommitmentModifier = "STANDARD" | "CHANNEL" | "CHARGE" | "UNKNOWN";
export type CombatDefensivePoolExpiryReason =
  | "empty"
  | "durationEnd"
  | "fieldExit"
  | "attachmentEnd"
  | "channelEnd"
  | "cleanse"
  | "defeatCleanup";
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
  damageTypes?: string[];
  accuracyAttribute: CombatAttributeName;
  contextualAccuracyAttributes?: {
    self?: CombatAttributeName;
    ally?: CombatAttributeName;
    enemy?: CombatAttributeName;
  };
  diceCount: number;
  potency: number;
  defenceMode?: "Block" | "Dodge" | "Resist";
  defenceResistedAttribute?: CoreAttribute | null;
  protection?: number;
  durationRounds?: number;
  modifier?: {
    attribute: CombatAttributeName;
    amount: number;
    durationRounds: number;
    modifiesRollResults?: boolean;
  };
  control?: {
    effect: "mainActionDenied";
    durationRounds: number;
  };
  resistAttribute?: CoreAttribute | null;
  secondaryActions?: CombatAction[];
  linkedToPrimary?: boolean;
  usesPrimaryAppliedSuccesses?: boolean;
  linkedScalingMode?: "primaryAppliedSuccesses" | "primaryWoundBands";
  primaryWoundsPerSuccess?: number;
  effectPerPrimarySuccess?: number;
  skipOwnRoll?: boolean;
  skipOwnDefenceGate?: boolean;
  recurring?: {
    kind: "healingOverTime" | "ongoingDamage";
    durationRounds: number;
  };
  damageApplicationTiming?: "immediate" | "startOfTurn" | "endOfTurn";
  durationKind?: CombatDurationKind;
  durationSource?: CombatDurationSource;
  passiveDuration?: boolean;
  passive?: boolean;
  runtimeCleanup?: boolean;
  counterMode?: boolean;
  cooldownActionId?: string;
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
  ignoredTraits?: string[];
  unsupportedCombatTraits?: string[];
  fallbackActions: string[];
};

export type CombatActor = {
  id: string;
  baseActorId?: string;
  instanceIndex?: number;
  displayGroupName?: string;
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
  dodgeDice?: number;
  physicalDefenceDice?: number;
  physicalBlockPerSuccess?: number;
  physicalDefenceBlock?: number;
  mentalDefenceDice?: number;
  mentalBlockPerSuccess?: number;
  mentalDefenceBlock?: number;
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
  damageLabel?: string;
  cleanupAttribute?: CombatAttributeName;
  cleanupUnitWounds?: number;
  initialAmount?: number;
  firstTickApplied?: boolean;
  cleanupAttempted?: boolean;
  sourceActionId?: string;
  sourceActionName?: string;
  sourceCooldownActionId?: string;
  durationKind?: CombatDurationKind;
  durationSource?: CombatDurationSource;
  passiveDuration?: boolean;
  modifiesRollResults?: boolean;
  positionalAbstraction?: string;
  remainingRounds: number;
};

export type CombatDefensivePool = {
  id: string;
  sourceActorId: string;
  sourceActorName: string;
  sourceSide: CombatSide;
  sourceActionId: string;
  sourceActionName: string;
  sourcePowerId?: string | null;
  sourcePacketId?: string | null;
  protectedActorId: string;
  protectedActorName: string;
  poolType: CombatDefensivePoolType;
  woundChannel?: CombatPool | null;
  resistedAttribute?: CoreAttribute | null;
  remainingPoints: number;
  initialPoints: number;
  perTriggerCap: number;
  remainingRounds: number;
  durationKind: CombatDurationKind;
  sourceChassis: CombatDefensivePoolSourceChassis;
  sourceCommitmentModifier: CombatDefensivePoolCommitmentModifier;
  createdRound: number;
  createdTurnActorId?: string | null;
  reapplyKey: string;
};

export type CombatCooldownEntry = {
  remaining: number;
  appliedRound: number;
  appliedTurnActorId: string | null;
  appliedOnOwnerTurn: boolean;
};

export type CombatState = {
  round: number;
  actors: CombatActor[];
  cooldowns: Record<string, CombatCooldownEntry>;
  currentTurnActorId?: string | null;
  cooldownTrace: Record<string, CombatCooldownTrace>;
  counterCandidateDiagnostics: Record<string, CombatCounterCandidateDiagnostic>;
  counterUses: Record<string, number>;
  incomingActionsByTargetThisRound: Record<string, number>;
  statusEffects: CombatStatusEffect[];
  defensivePools: CombatDefensivePool[];
  captureTranscript: boolean;
  transcriptEvents: CombatTranscriptEvent[];
  transcriptLines: string[];
  transcriptTruncated: boolean;
  transcriptEventSeq: number;
  responsesRemaining: Record<string, number>;
  defenceDegradation: Record<
    string,
    {
      dodge: number;
      physical: number;
      mental: number;
    }
  >;
  log: CombatLogEntry[];
};

export type CombatCooldownTrace = {
  actorId: string;
  actorName: string;
  side: CombatSide;
  actionId: string;
  actionName: string;
  sourceType: CombatActionSourceType;
  isCounter: boolean;
  cooldownRounds: number;
  uses: number;
  attemptedUsesWhileOnCooldown: number;
  preventedByCooldown: number;
  cooldownApplied: number;
  cooldownTicks: number;
  availableTurns: number;
  unavailableTurns: number;
};

export type CombatCounterCandidateDiagnostic = {
  actorId: string;
  actorName: string;
  side: CombatSide;
  actionId: string;
  actionName: string;
  sourceType: CombatActionSourceType;
  considered: number;
  selected: number;
  skippedNormalDefenceBetter: number;
  skippedNoResponse: number;
  skippedCooldown: number;
  skippedUnsupported: number;
  skippedNonAvoidable: number;
  skippedNonApplicable: number;
  totalExpectedCounterPrevention: number;
  totalExpectedNormalPrevention: number;
  expectedSamples: number;
  lastReason?: string | null;
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

export type CombatRollSummary = {
  rollerId: string;
  rollerName: string;
  reason: string;
  attribute: CombatAttributeName | string;
  diceCount: number;
  dieSize: CombatDieSize;
  rawResults: number[];
  modifiedResults: number[];
  perDieSuccesses: number[];
  modifier: number;
  successes: number;
};

export type CombatTranscriptEventType =
  | "roundStart"
  | "turnStart"
  | "tacticalDecision"
  | "responsesRefresh"
  | "startOfTurnEffect"
  | "mainAction"
  | "powerAction"
  | "responseAction"
  | "attackRoll"
  | "healingRoll"
  | "buffRoll"
  | "debuffRoll"
  | "controlRoll"
  | "movementRoll"
  | "cleanseRoll"
  | "defenceChoice"
  | "defensivePool"
  | "dodgeRoll"
  | "physicalDefenceRoll"
  | "mentalDefenceRoll"
  | "resistRoll"
  | "counterDeclared"
  | "counterRoll"
  | "damageApplied"
  | "healingApplied"
  | "buffApplied"
  | "debuffApplied"
  | "statusCreated"
  | "statusTick"
  | "stackChanged"
  | "cooldownApplied"
  | "cooldownTicked"
  | "actionSkipped"
  | "actorDefeated"
  | "defeatCleanup"
  | "combatEnd"
  | "turnEnd"
  | "roundEnd";

export type CombatTranscriptEvent = {
  id: string;
  type: CombatTranscriptEventType;
  round: number;
  actorId?: string;
  actorName?: string;
  targetId?: string;
  targetName?: string;
  actionId?: string;
  actionName?: string;
  lane?: CombatActionLane;
  message: string;
  roll?: CombatRollSummary;
  details?: Record<string, string | number | boolean | null | undefined>;
};

export type CombatTranscript = {
  runIndex: number;
  scenarioName: string;
  truncated: boolean;
  events: CombatTranscriptEvent[];
  lines: string[];
};

export type CombatResolutionMetrics = {
  rawSuccesses: number;
  rawWounds: number;
  dodgeSuccesses: number;
  dodgeRolls: number;
  dodgeChosen: number;
  dodgeDegradationApplied: number;
  woundsAvoidedByDodge: number;
  physicalDefenceRolls: number;
  physicalDefenceChosen: number;
  physicalDefenceDegradationApplied: number;
  mentalDefenceRolls: number;
  mentalDefenceChosen: number;
  mentalDefenceDegradationApplied: number;
  defenceChoiceExpectedValue: number;
  degradedDefenceRolls: number;
  defenceStringBlocked: number;
  staticProtectionPrevented: number;
  protectionPrevented: number;
  resistCancelled: number;
  resistRolls: number;
  resistSuccesses: number;
  hostileSuccessesBeforeResist: number;
  hostileSuccessesAfterResist: number;
  hostileSuccessesCancelledByResist: number;
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
  buffedDefenceRolls: number;
  buffedResistRolls: number;
  debuffApplications: number;
  debuffUptime: number;
  debuffedActions: number;
  debuffedDefenceRolls: number;
  debuffedResistRolls: number;
  healingOverTimeApplied: number;
  healingTicks: number;
  ongoingDamageApplied: number;
  ongoingDamageUnitsApplied: number;
  ongoingDamageTicks: number;
  ongoingDamagePreventedOrCleansed: number;
  counterUses: number;
  counterChosen: number;
  counterDamage: number;
  counterMitigation: number;
  responsesUsed: number;
  responsesWastedOrUnavailable: number;
  passiveDefenceContribution: number;
  stacksApplied: number;
  stacksExpired: number;
  stacksCleansed: number;
  aoeActionUses: number;
  aoePotentialTargets: number;
  aoeActualTargets: number;
  positionalAbstractionsUsed: number;
  ongoingPressure: CombatOngoingPressureMetrics;
  defensivePools: CombatDefensivePoolMetrics;
};

export type CombatDefensivePoolSideTotals = {
  poolsCreated: number;
  generatedPoints: number;
  refreshReplaceEvents: number;
  committedPoints: number;
  spentPoints: number;
  wastedPoints: number;
  remainingAtExpiry: number;
  expiredEmpty: number;
  expiredDuration: number;
  expiredFieldExit: number;
  expiredAttachmentEnd: number;
  expiredChannelEnd: number;
  expiredCleanse: number;
  expiredDefeatCleanup: number;
  dodgeAvoids: number;
  blockWoundsPrevented: number;
  resistUnitsCancelled: number;
};

export type CombatDefensivePoolActionMetrics = CombatDefensivePoolSideTotals & {
  sourceActorId: string;
  sourceActorName: string;
  sourceSide: CombatSide;
  sourceActionId: string;
  sourceActionName: string;
  poolType: CombatDefensivePoolType;
};

export type CombatDefensivePoolMetrics = {
  bySourceSide: Record<CombatSide, CombatDefensivePoolSideTotals>;
  bySourceAction: Record<string, CombatDefensivePoolActionMetrics>;
};

export type CombatOngoingPressureSideTotals = {
  statusesCreated: number;
  storedTickTotal: number;
  storedTickMax: number;
  firstTicksApplied: number;
  firstTickDamageTotal: number;
  firstTickLethal: number;
  firstTickBeforeCleanup: number;
  ticksAppliedTotal: number;
  totalOngoingDamage: number;
  cleanupAttempts: number;
  cleanupSuccesses: number;
  cleanupUnitsRemoved: number;
  cleanupWoundsRemoved: number;
  cleanupRemainingTicksTotal: number;
  cleanupStoredTickRemovedTotal: number;
  cleanupPreventedWoundsEstimate: number;
};

export type CombatOngoingPressureActionMetrics = CombatOngoingPressureSideTotals & {
  sourceActorId: string;
  sourceActorName: string;
  sourceSide: CombatSide;
  sourceActionId: string;
  sourceActionName: string;
};

export type CombatOngoingPressureMetrics = {
  bySourceSide: Record<CombatSide, CombatOngoingPressureSideTotals>;
  bySourceAction: Record<string, CombatOngoingPressureActionMetrics>;
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
  survivorActorIds: Record<CombatSide, string[]>;
  winnerHealthRemainingPercent: number;
  metrics: CombatAggregateMetrics;
  firstRunTranscript?: CombatTranscript;
  unsupported: UnsupportedPowerSummary;
  log: CombatLogEntry[];
};

export type CombatStoppedByBreakdown = {
  playersDefeated: number;
  monstersDefeated: number;
  maxRounds: number;
  stalemate: number;
};

export type CombatAggregateMetrics = {
  damageDealt: Record<CombatSide, number>;
  healingDone: Record<CombatSide, number>;
  protectionPrevented: Record<CombatSide, number>;
  woundsAvoidedByDodge: Record<CombatSide, number>;
  dodgeRolls: Record<CombatSide, number>;
  dodgeChosen: Record<CombatSide, number>;
  dodgeDegradationApplied: Record<CombatSide, number>;
  physicalDefenceRolls: Record<CombatSide, number>;
  physicalDefenceChosen: Record<CombatSide, number>;
  physicalDefenceDegradationApplied: Record<CombatSide, number>;
  mentalDefenceRolls: Record<CombatSide, number>;
  mentalDefenceChosen: Record<CombatSide, number>;
  mentalDefenceDegradationApplied: Record<CombatSide, number>;
  defenceChoiceExpectedValue: Record<CombatSide, number>;
  degradedDefenceRolls: Record<CombatSide, number>;
  defenceStringBlocked: Record<CombatSide, number>;
  staticProtectionPrevented: Record<CombatSide, number>;
  resistCancelled: Record<CombatSide, number>;
  resistRolls: Record<CombatSide, number>;
  resistSuccesses: Record<CombatSide, number>;
  hostileSuccessesCancelledByResist: Record<CombatSide, number>;
  overkill: Record<CombatSide, number>;
  oneRoundDownEvents: Record<CombatSide, number>;
  actionsUsed: Record<CombatSide, number>;
  mainActionsUsed: Record<CombatSide, number>;
  powerActionsUsed: Record<CombatSide, number>;
  secondWeaponAttacksUsed: Record<CombatSide, number>;
  skippedPowerActions: Record<CombatSide, number>;
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
  buffedDefenceRolls: Record<CombatSide, number>;
  buffedResistRolls: Record<CombatSide, number>;
  debuffApplications: Record<CombatSide, number>;
  debuffUptime: Record<CombatSide, number>;
  debuffedActions: Record<CombatSide, number>;
  debuffedDefenceRolls: Record<CombatSide, number>;
  debuffedResistRolls: Record<CombatSide, number>;
  healingOverTimeApplied: Record<CombatSide, number>;
  healingTicks: Record<CombatSide, number>;
  ongoingDamageApplied: Record<CombatSide, number>;
  ongoingDamageUnitsApplied: Record<CombatSide, number>;
  ongoingDamageTicks: Record<CombatSide, number>;
  ongoingDamagePreventedOrCleansed: Record<CombatSide, number>;
  counterUses: Record<CombatSide, number>;
  counterChosen: Record<CombatSide, number>;
  counterDamage: Record<CombatSide, number>;
  counterMitigation: Record<CombatSide, number>;
  responsesUsed: Record<CombatSide, number>;
  responsesWastedOrUnavailable: Record<CombatSide, number>;
  passiveDefenceContribution: Record<CombatSide, number>;
  stacksApplied: Record<CombatSide, number>;
  stacksExpired: Record<CombatSide, number>;
  stacksCleansed: Record<CombatSide, number>;
  aoeActionUses: Record<CombatSide, number>;
  aoePotentialTargets: Record<CombatSide, number>;
  aoeActualTargets: Record<CombatSide, number>;
  positionalAbstractionsUsed: Record<CombatSide, number>;
  actorContributions: Record<string, CombatActorContribution>;
  defensiveContributions: Record<string, CombatDefensiveContribution>;
  cooldownTrace: Record<string, CombatCooldownTrace>;
  counterCandidateDiagnostics: Record<string, CombatCounterCandidateDiagnostic>;
  ongoingPressure: CombatOngoingPressureMetrics;
  defensivePools: CombatDefensivePoolMetrics;
};

export type CombatActionContribution = {
  actionId: string;
  actionName: string;
  sourcePowerId?: string | null;
  sourceType: CombatActionSourceType;
  kind: CombatActionKind;
  uses: number;
  damage: number;
  healing: number;
  healingOverTimeApplied: number;
  healingTicks: number;
  mitigation: number;
  counterUses: number;
  counterDamage: number;
  counterMitigation: number;
  buffApplications: number;
  buffUptime: number;
  debuffApplications: number;
  debuffUptime: number;
  controlTurnsApplied: number;
  actionsDenied: number;
  ongoingDamageApplied: number;
  ongoingDamageTicks: number;
  linkedActionCount: number;
};

export type CombatActorContribution = {
  actorId: string;
  actorName: string;
  baseActorId?: string;
  instanceIndex?: number;
  displayGroupName?: string;
  side: CombatSide;
  role: CombatActorRole;
  actionsUsed: number;
  damage: number;
  healing: number;
  healingOverTimeApplied: number;
  healingTicks: number;
  mitigation: number;
  counterUses: number;
  counterDamage: number;
  counterMitigation: number;
  buffApplications: number;
  buffUptime: number;
  debuffApplications: number;
  debuffUptime: number;
  controlTurnsApplied: number;
  actionsDenied: number;
  ongoingDamageApplied: number;
  ongoingDamageTicks: number;
  topActionName: string | null;
  actionContributions: CombatActionContribution[];
};

export type CombatOngoingPressureSideReport = {
  statusesCreated: number;
  storedTickAverage: number;
  storedTickMax: number;
  firstTicksApplied: number;
  firstTickDamageAverage: number;
  firstTickLethalCount: number;
  firstTickLethalRate: number;
  firstTickBeforeCleanup: number;
  cleanupAttempts: number;
  cleanupSuccesses: number;
  cleanupUnitsRemoved: number;
  cleanupWoundsRemoved: number;
  cleanupPreventedWoundsEstimate: number | null;
};

export type CombatOngoingPressureActionReport = {
  sourceActorId: string;
  sourceActorName: string;
  sourceSide: CombatSide;
  sourceActionId: string;
  sourceActionName: string;
  statusesCreated: number;
  averageStoredTick: number;
  maxStoredTick: number;
  firstTicksApplied: number;
  averageFirstTickDamage: number;
  firstTickLethalCount: number;
  firstTickLethalRate: number;
  ticksAppliedTotal: number;
  totalOngoingDamage: number;
  cleanupAttempts: number;
  cleanupSuccesses: number;
  cleanupUnitsRemoved: number;
  averageRemainingTicksAtCleanup: number;
  averageStoredTickRemoved: number;
  cleanupPreventedWoundsEstimate: number | null;
};

export type CombatOngoingPressureReport = {
  convention: string;
  bySourceSide: Record<CombatSide, CombatOngoingPressureSideReport>;
  bySourceAction: CombatOngoingPressureActionReport[];
};

export type CombatDefensivePoolSideReport = {
  poolsCreated: number;
  averageGeneratedPoints: number;
  committedPoints: number;
  spentPoints: number;
  wastedPoints: number;
  remainingAtExpiry: number;
  refreshReplaceEvents: number;
  expiredEmpty: number;
  expiredDuration: number;
  expiredFieldExit: number;
  expiredAttachmentEnd: number;
  expiredChannelEnd: number;
  expiredCleanse: number;
  expiredDefeatCleanup: number;
  dodgeAvoids: number;
  blockWoundsPrevented: number;
  resistUnitsCancelled: number;
};

export type CombatDefensivePoolActionReport = {
  sourceActorId: string;
  sourceActorName: string;
  sourceSide: CombatSide;
  sourceActionId: string;
  sourceActionName: string;
  poolType: CombatDefensivePoolType;
  poolsCreated: number;
  averageGeneratedPoints: number;
  committedPoints: number;
  spentPoints: number;
  wastedPoints: number;
  remainingAtExpiry: number;
  refreshReplaceEvents: number;
  expiredEmpty: number;
  expiredDuration: number;
  expiredCleanse: number;
  dodgeAvoids: number;
  blockWoundsPrevented: number;
  resistUnitsCancelled: number;
};

export type CombatDefensivePoolReport = {
  convention: string;
  unsupportedNotes: string[];
  bySourceSide: Record<CombatSide, CombatDefensivePoolSideReport>;
  bySourceAction: CombatDefensivePoolActionReport[];
};

export type CombatDefensiveContribution = {
  actorId: string;
  actorName: string;
  side: CombatSide;
  role: CombatActorRole;
  attacksDefended: number;
  woundsDodged: number;
  defenceStringBlocked: number;
  staticProtectionPrevented: number;
  buffedDefenceRolls: number;
  debuffedDefenceRolls: number;
  buffedResistRolls: number;
  debuffedResistRolls: number;
  counterUses: number;
  counterDamage: number;
  counterMitigation: number;
  responsesUsed: number;
  netDamageTaken: number;
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
  initialStatusEffects?: CombatStatusEffect[];
  runs: number;
  seed: number;
  maxRounds?: number;
  turnOrder?: CombatTurnOrder;
};

export type CombatSuiteReport = {
  scenarioName: string;
  runs: number;
  playerWinRate: number;
  monsterWinRate: number;
  stalemateRate: number;
  stoppedByBreakdown: CombatStoppedByBreakdown;
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
    dodgeRolls: Record<CombatSide, number>;
    dodgeChosen: Record<CombatSide, number>;
    dodgeDegradationApplied: Record<CombatSide, number>;
    physicalDefenceRolls: Record<CombatSide, number>;
    physicalDefenceChosen: Record<CombatSide, number>;
    physicalDefenceDegradationApplied: Record<CombatSide, number>;
    mentalDefenceRolls: Record<CombatSide, number>;
    mentalDefenceChosen: Record<CombatSide, number>;
    mentalDefenceDegradationApplied: Record<CombatSide, number>;
    defenceChoiceExpectedValue: Record<CombatSide, number>;
    defenceStringBlocked: Record<CombatSide, number>;
    staticProtectionPrevented: Record<CombatSide, number>;
    resistRolls: Record<CombatSide, number>;
    resistSuccesses: Record<CombatSide, number>;
    hostileSuccessesCancelledByResist: Record<CombatSide, number>;
    buffApplications: Record<CombatSide, number>;
    buffUptime: Record<CombatSide, number>;
    buffedActions: Record<CombatSide, number>;
    buffedDefenceRolls: Record<CombatSide, number>;
    buffedResistRolls: Record<CombatSide, number>;
    debuffApplications: Record<CombatSide, number>;
    debuffUptime: Record<CombatSide, number>;
    debuffedActions: Record<CombatSide, number>;
    debuffedDefenceRolls: Record<CombatSide, number>;
    debuffedResistRolls: Record<CombatSide, number>;
    healingOverTimeApplied: Record<CombatSide, number>;
    healingTicks: Record<CombatSide, number>;
    ongoingDamageApplied: Record<CombatSide, number>;
    ongoingDamageUnitsApplied: Record<CombatSide, number>;
    ongoingDamageTicks: Record<CombatSide, number>;
    ongoingDamagePreventedOrCleansed: Record<CombatSide, number>;
    counterUses: Record<CombatSide, number>;
    counterChosen: Record<CombatSide, number>;
    counterDamage: Record<CombatSide, number>;
    counterMitigation: Record<CombatSide, number>;
    responsesUsed: Record<CombatSide, number>;
    responsesWastedOrUnavailable: Record<CombatSide, number>;
    passiveDefenceContribution: Record<CombatSide, number>;
    stacksApplied: Record<CombatSide, number>;
    stacksExpired: Record<CombatSide, number>;
    stacksCleansed: Record<CombatSide, number>;
    aoeActionUses: Record<CombatSide, number>;
    aoePotentialTargets: Record<CombatSide, number>;
    aoeActualTargets: Record<CombatSide, number>;
    positionalAbstractionsUsed: Record<CombatSide, number>;
    mainActionsUsed: Record<CombatSide, number>;
    powerActionsUsed: Record<CombatSide, number>;
    secondWeaponAttacksUsed: Record<CombatSide, number>;
    skippedPowerActions: Record<CombatSide, number>;
  };
  roleContribution: CombatAggregateMetrics["roleContribution"];
  actorContributions: CombatActorContribution[];
  monsterGroupContributions: CombatMonsterGroupContribution[];
  defensiveContributions: CombatDefensiveContribution[];
  ongoingPressure: CombatOngoingPressureReport;
  defensivePools: CombatDefensivePoolReport;
  cooldownTrace: CombatCooldownTrace[];
  counterCandidateDiagnostics: CombatCounterCandidateDiagnostic[];
  firstRunTranscript?: CombatTranscript;
  unsupported: UnsupportedPowerSummary;
  hydrationIntegrity: CombatHydrationIntegrity;
  verdict: string;
};

export type CombatMonsterGroupContribution = {
  baseActorId: string;
  displayGroupName: string;
  quantity: number;
  survivors: number;
  defeated: number;
  actionsUsed: number;
  damage: number;
  healing: number;
  mitigation: number;
  controlTurnsApplied: number;
  ongoingDamageApplied: number;
  averageDamagePerInstance: number;
};

export type CombatHydrationIntegrity = {
  realCharacterCount: number;
  realMonsterCount: number;
  monsterInstanceCount: number;
  fallbackActionCount: number;
  unsupportedActionCount: number;
  unsupportedPowerCount: number;
  unsupportedEquipmentCount: number;
  unsupportedTraitCount: number;
  ignoredTraitCount: number;
  unsupportedCombatTraitCount: number;
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
    ignoredTraits: string[];
    unsupportedCombatTraits: string[];
    warnings: string[];
  }>;
};
