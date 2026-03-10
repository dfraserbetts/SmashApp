export type MonsterTier = "MINION" | "SOLDIER" | "ELITE" | "BOSS";
export type MonsterSource = "CORE" | "CAMPAIGN";
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

export type MonsterPowerDurationType = "INSTANT" | "TURNS" | "PASSIVE" | "UNTIL_TARGET_NEXT_TURN";
export type MonsterPowerDefenceRequirement = "PROTECTION" | "RESIST" | "NONE";
export type MonsterPowerIntentionType =
  | "ATTACK"
  | "DEFENCE"
  | "HEALING"
  | "CLEANSE"
  | "CONTROL"
  | "MOVEMENT"
  | "AUGMENT"
  | "DEBUFF"
  | "SUMMON"
  | "TRANSFORMATION";
export type MonsterPowerIntentionApplyTo = "PRIMARY_TARGET" | "SELF";

export type MonsterPowerIntentionDetails = Record<string, unknown> & {
  applyTo?: MonsterPowerIntentionApplyTo;
};

export type MonsterPowerIntention = {
  id?: string;
  sortOrder: number;
  type: MonsterPowerIntentionType;
  detailsJson: MonsterPowerIntentionDetails;
};

export type MonsterPower = {
  id?: string;
  sortOrder: number;
  name: string;
  description: string | null;
  diceCount: number;
  potency: number;
  durationType: MonsterPowerDurationType;
  durationTurns: number | null;
  defenceRequirement: MonsterPowerDefenceRequirement;
  cooldownTurns: number;
  cooldownReduction: number;
  responseRequired: boolean;
  intentions: MonsterPowerIntention[];
};

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
  powers: MonsterPower[];
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
  powers: MonsterPower[];
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
