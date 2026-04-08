export type MonsterTier = "MINION" | "SOLDIER" | "ELITE" | "BOSS";
export type MonsterSource = "CORE" | "CAMPAIGN";
export type MonsterTraitBand = "MINOR" | "STANDARD" | "MAJOR" | "BOSS";
export type MonsterAttackMode = "NATURAL";
export type LimitBreakTier = "PUSH" | "BREAK" | "TRANSCEND";
export type CoreAttribute =
  | "ATTACK"
  | "DEFENCE"
  | "FORTITUDE"
  | "INTELLECT"
  | "SUPPORT"
  | "BRAVERY";
export type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
export type AttributePlacement = "ATTACK" | "DEFENCE" | "TRAITS" | "GENERAL";
export type RangeCategory = "MELEE" | "RANGED" | "AOE";

export type PowerStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type DescriptorChassisType =
  | "IMMEDIATE"
  | "FIELD"
  | "ATTACHED"
  | "TRIGGER"
  | "RESERVE";
export type PacketHostility = "NON_HOSTILE" | "HOSTILE";
export type PowerIntention =
  | "ATTACK"
  | "DEFENCE"
  | "HEALING"
  | "CLEANSE"
  | "CONTROL"
  | "MOVEMENT"
  | "SUPPORT"
  | "AUGMENT"
  | "DEBUFF"
  | "SUMMONING"
  | "TRANSFORMATION";
export type PrimaryDefenceGateResult =
  | "NONE"
  | "DODGE"
  | "PROTECTION"
  | "DODGE_OR_PROTECTION"
  | "RESIST";
export type ProtectionChannel = "PHYSICAL" | "MENTAL";
export type ResolutionOrigin =
  | "CASTER"
  | "PRIMARY_TARGET"
  | "ATTACHED_HOST"
  | "FIELD_ORIGIN"
  | "PACKET_LOCAL";
export type HostileEntryPattern = "DIRECT" | "ON_ATTACH" | "ON_PAYLOAD";
export type GateResolutionSource = "INFERRED" | "EXPLICIT";
export type PowerLifespanType = "NONE" | "TURNS" | "PASSIVE";
export type ChargeType = "DELAYED_RELEASE" | "BUILD_POWER";
export type TriggerMethod = "ARM_AND_THEN_TARGET" | "TARGET_AND_THEN_ARM";
export type AttachedHostAnchorType = "TARGET" | "OBJECT" | "WEAPON" | "ARMOR" | "SELF" | "AREA";
export type EffectTimingType =
  | "ON_CAST"
  | "ON_HIT"
  | "ON_TRIGGER"
  | "ON_ATTACH"
  | "START_OF_TURN"
  | "END_OF_TURN"
  | "START_OF_TURN_WHILST_CHANNELLED"
  | "END_OF_TURN_WHILST_CHANNELLED"
  | "ON_RELEASE"
  | "ON_EXPIRY";
export type EffectDurationType = "INSTANT" | "TURNS" | "PASSIVE" | "UNTIL_TARGET_NEXT_TURN";
export type WoundChannel = "PHYSICAL" | "MENTAL";
export type EffectPacketApplyTo = "PRIMARY_TARGET" | "ALLIES" | "SELF";

export type EffectPacketDetails = Record<string, unknown>;

export type EffectPacketLocalTargetingOverride = {
  meleeTargets: number | null;
  rangedTargets: number | null;
  rangedDistanceFeet: number | null;
  aoeCenterRangeFeet: number | null;
  aoeCount: number | null;
  aoeShape: "SPHERE" | "CONE" | "LINE" | null;
  aoeSphereRadiusFeet: number | null;
  aoeConeLengthFeet: number | null;
  aoeLineWidthFeet: number | null;
  aoeLineLengthFeet: number | null;
};

export type EffectPacket = {
  id?: string;
  packetIndex?: number;
  sortOrder: number;
  hostility?: PacketHostility;
  intention: PowerIntention;
  type: PowerIntention;
  specific?: string | null;
  diceCount?: number;
  potency?: number;
  effectTimingType?: EffectTimingType;
  effectTimingTurns: number | null;
  effectDurationType?: EffectDurationType;
  effectDurationTurns: number | null;
  dealsWounds?: boolean;
  woundChannel?: WoundChannel | null;
  targetedAttribute?: CoreAttribute | null;
  applicationModeKey?: string | null;
  resolutionOrigin?: ResolutionOrigin;
  applyTo?: EffectPacketApplyTo | null;
  triggerConditionText?: string | null;
  detailsJson: EffectPacketDetails;
  localTargetingOverride?: EffectPacketLocalTargetingOverride | null;
};

export type PrimaryDefenceGate = {
  sourcePacketIndex: number;
  gateResult: PrimaryDefenceGateResult;
  protectionChannel: ProtectionChannel | null;
  resistAttribute: CoreAttribute | null;
  hostileEntryPattern: HostileEntryPattern | null;
  resolutionSource: GateResolutionSource;
};

export type Power = {
  id?: string;
  sortOrder: number;
  name: string;
  description: string | null;
  schemaVersion?: number;
  rulesVersion?: string;
  contentRevision?: number;
  previewRendererVersion?: number;
  status?: PowerStatus;
  descriptorChassis?: DescriptorChassisType;
  descriptorChassisConfig?: Record<string, unknown>;
  chargeType?: ChargeType | null;
  chargeTurns?: number | null;
  chargeBonusDicePerTurn?: number | null;
  cooldownTurns: number;
  cooldownReduction: number;
  counterMode?: "NO" | "YES";
  commitmentModifier?: "STANDARD" | "CHANNEL" | "CHARGE";
  triggerMethod?: TriggerMethod | null;
  attachedHostAnchorType?: AttachedHostAnchorType | null;
  lifespanType?: PowerLifespanType;
  lifespanTurns?: number | null;
  previewSummaryOverride?: string | null;
  rangeCategories?: RangeCategory[];
  meleeTargets?: number | null;
  rangedTargets?: number | null;
  rangedDistanceFeet?: number | null;
  aoeCenterRangeFeet?: number | null;
  aoeCount?: number | null;
  aoeShape?: "SPHERE" | "CONE" | "LINE" | null;
  aoeSphereRadiusFeet?: number | null;
  aoeConeLengthFeet?: number | null;
  aoeLineWidthFeet?: number | null;
  aoeLineLengthFeet?: number | null;
  primaryDefenceGate?: PrimaryDefenceGate | null;
  effectPackets: EffectPacket[];
  intentions: EffectPacket[];
  // Summoning Circle keeps these convenience fields while the first implementation
  // surface still authors mostly single-pattern powers.
  diceCount: number;
  potency: number;
  effectDurationType?: EffectDurationType;
  effectDurationTurns?: number | null;
  durationType?: EffectDurationType;
  durationTurns?: number | null;
  defenceRequirement?: PrimaryDefenceGateResult;
};

export type MonsterPowerDurationType = EffectDurationType;
export type MonsterPowerDefenceRequirement = PrimaryDefenceGateResult;
export type MonsterPowerIntentionType = PowerIntention;
export type MonsterPowerIntentionApplyTo = EffectPacketApplyTo;
export type MonsterPowerIntentionDetails = EffectPacketDetails;
export type MonsterPowerIntention = EffectPacket;
export type MonsterPower = Power;

export type MonsterTraitSelection = {
  id?: string;
  sortOrder: number;
  traitDefinitionId: string;
  name?: string | null;
  effectText?: string | null;
};

export type MonsterTraitDefinitionSummary = {
  id: string;
  name: string;
  effectText: string | null;
  band: MonsterTraitBand;
  physicalThreatWeight: number;
  mentalThreatWeight: number;
  survivabilityWeight: number;
  manipulationWeight: number;
  synergyWeight: number;
  mobilityWeight: number;
  presenceWeight: number;
};

export type MonsterNaturalAttackConfig = {
  melee?: {
    enabled: boolean;
    targets: number;
    physicalStrength: number;
    mentalStrength: number;
    damageTypes: Array<{ name: string; mode: "PHYSICAL" | "MENTAL" }>;
    attackEffects: string[];
  };
  ranged?: {
    enabled: boolean;
    targets: number;
    distance: number;
    physicalStrength: number;
    mentalStrength: number;
    damageTypes: Array<{ name: string; mode: "PHYSICAL" | "MENTAL" }>;
    attackEffects: string[];
  };
  aoe?: {
    enabled: boolean;
    count: number;
    centerRange: number;
    shape: "SPHERE" | "CONE" | "LINE";
    sphereRadiusFeet?: number;
    coneLengthFeet?: number;
    lineWidthFeet?: number;
    lineLengthFeet?: number;
    physicalStrength: number;
    mentalStrength: number;
    damageTypes: Array<{ name: string; mode: "PHYSICAL" | "MENTAL" }>;
    attackEffects: string[];
  };
};

export type MonsterAttack = {
  id?: string;
  sortOrder: number;
  attackMode: MonsterAttackMode;
  attackName: string | null;
  attackConfig: MonsterNaturalAttackConfig | null;
};

export type MonsterRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  imageUrl: string | null;
  imagePosX: number;
  imagePosY: number;
  level: number;
  tier: MonsterTier;
  legendary: boolean;
  source: MonsterSource;
  isReadOnly: boolean;
  campaignId: string | null;
  attacks: MonsterAttack[];
  mainHandItemId: string | null;
  offHandItemId: string | null;
  smallItemId: string | null;
  headArmorItemId: string | null;
  shoulderArmorItemId: string | null;
  torsoArmorItemId: string | null;
  legsArmorItemId: string | null;
  feetArmorItemId: string | null;
  headItemId: string | null;
  neckItemId: string | null;
  armsItemId: string | null;
  beltItemId: string | null;
  customNotes: string | null;
  limitBreakName: string | null;
  limitBreakTier: LimitBreakTier | null;
  limitBreakTriggerText: string | null;
  limitBreakAttribute: CoreAttribute | null;
  limitBreakThresholdSuccesses: number | null;
  limitBreakCostText: string | null;
  limitBreakEffectText: string | null;
  limitBreak2Name: string | null;
  limitBreak2Tier: LimitBreakTier | null;
  limitBreak2TriggerText: string | null;
  limitBreak2Attribute: CoreAttribute | null;
  limitBreak2ThresholdSuccesses: number | null;
  limitBreak2CostText: string | null;
  limitBreak2EffectText: string | null;
  physicalResilienceCurrent: number;
  physicalResilienceMax: number;
  mentalPerseveranceCurrent: number;
  mentalPerseveranceMax: number;
  physicalProtection: number;
  mentalProtection: number;
  naturalPhysicalProtection: number;
  naturalMentalProtection: number;
  attackDie: DiceSize;
  attackResistDie: number;
  attackModifier: number;
  defenceDie: DiceSize;
  defenceResistDie: number;
  defenceModifier: number;
  fortitudeDie: DiceSize;
  fortitudeResistDie: number;
  fortitudeModifier: number;
  intellectDie: DiceSize;
  intellectResistDie: number;
  intellectModifier: number;
  supportDie: DiceSize;
  supportResistDie: number;
  supportModifier: number;
  braveryDie: DiceSize;
  braveryResistDie: number;
  braveryModifier: number;
  weaponSkillValue: number;
  weaponSkillModifier: number;
  armorSkillValue: number;
  armorSkillModifier: number;
  tags: Array<{ id: string; tag: string }>;
  traits: MonsterTraitSelection[];
  naturalAttack?: {
    id: string;
    attackName: string;
    attackConfig: MonsterNaturalAttackConfig;
  } | null;
  powers: Power[];
};

export type MonsterUpsertInput = Omit<
  MonsterRecord,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "source"
  | "isReadOnly"
  | "campaignId"
  | "tags"
  | "traits"
  | "powers"
  | "attacks"
  | "naturalAttack"
> & {
  tags: string[];
  traits: MonsterTraitSelection[];
  attacks: MonsterAttack[];
  naturalAttack: {
    attackName: string;
    attackConfig: MonsterNaturalAttackConfig;
  } | null;
  powers: Power[];
};

export type MonsterSummary = Pick<
  MonsterRecord,
  | "id"
  | "name"
  | "level"
  | "tier"
  | "legendary"
  | "source"
  | "isReadOnly"
  | "campaignId"
  | "updatedAt"
>;

export const CORE_ATTRIBUTE_ORDER = [
  "Attack",
  "Defence",
  "Fortitude",
  "Intellect",
  "Support",
  "Bravery",
] as const;

export const DICE_SIZES: DiceSize[] = ["D4", "D6", "D8", "D10", "D12"];
