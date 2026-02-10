export type MonsterTier = "MINION" | "SOLDIER" | "ELITE" | "BOSS";
export type MonsterSource = "CORE" | "CAMPAIGN";
export type MonsterAttackMode = "NATURAL";
export type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";

export type MonsterPowerDurationType = "INSTANT" | "TURNS" | "PASSIVE";
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

export type MonsterPowerIntention = {
  id?: string;
  sortOrder: number;
  type: MonsterPowerIntentionType;
  detailsJson: Record<string, unknown>;
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
  headItemId: string | null;
  shoulderItemId: string | null;
  torsoItemId: string | null;
  legsItemId: string | null;
  feetItemId: string | null;
  customNotes: string | null;
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
