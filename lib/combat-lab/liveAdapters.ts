import { normalizeBuilderData } from "@/lib/characterBuilder/core";
import type { CharacterBuilderData } from "@/lib/characterBuilder/core";
import type { ProtectionTuningValues } from "@/lib/config/combatTuningShared";
import type { PowerTuningSnapshot } from "@/lib/config/powerTuningShared";
import { signatureMovePointPool, summarizeCharacterPowers } from "@/lib/characterBuilder/powers";
import {
  buildAttackConfig,
  buildCharacterDerivedCombatStats,
  getEquippedEntries,
  type CharacterBuilderDerivedBackpackItem,
} from "@/lib/characterBuilder/derivedStats";
import {
  getArmorSkillDiceCountFromAttributes,
  getAttributeNumericValue,
  getDodgeValue,
  getWillpowerDiceCountFromAttributes,
} from "@/lib/summoning/attributes";
import type {
  CoreAttribute,
  EffectPacket,
  MonsterTier,
  MonsterNaturalAttackConfig,
  Power,
  RangeCategory,
} from "@/lib/summoning/types";
import {
  getHighestItemModifiers,
  getProtectionTotalsFromItems,
  type SummoningEquipmentItem,
} from "@/lib/summoning/equipment";
import {
  attachPowerCooldownAuthority,
  resolvePowerCooldownAuthority,
} from "@/lib/summoning/resolvePowerCooldownAuthority";

import type { CombatAction, CombatActor, CombatAttributeName, CombatDieSize } from "./types";
import {
  adaptPowerToCombatActions,
  makeAttackActionsFromConfig,
  makeBasicAttackAction,
} from "./powerAdapter";

type RawRangeCategory = { rangeCategory: string };
type DamageTypeRow = { damageType: { name: string; attackMode: string } };
type AttackEffectRow = { attackEffect: { name: string } };
type VrpEntryRow = {
  effectKind: "VULNERABILITY" | "RESISTANCE" | "PROTECTION";
  magnitude: number;
  damageType: { name: string };
};

export type CombatLabHydrationWarning = {
  actorId: string;
  actorName: string;
  field: string;
  message: string;
};

type ItemTemplateRow = {
  id: string;
  itemUrl?: string | null;
  name: string | null;
  rarity?: string | null;
  level?: number | null;
  generalDescription?: string | null;
  type: string | null;
  size: string | null;
  armorLocation: string | null;
  itemLocation?: string | null;
  ppv?: number | null;
  mpv?: number | null;
  globalAttributeModifiers?: unknown;
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
  physicalStrength?: number | null;
  mentalStrength?: number | null;
  meleePhysicalStrength?: number | null;
  meleeMentalStrength?: number | null;
  rangedPhysicalStrength?: number | null;
  rangedMentalStrength?: number | null;
  aoePhysicalStrength?: number | null;
  aoeMentalStrength?: number | null;
  rangeCategories?: RawRangeCategory[];
  meleeDamageTypes?: DamageTypeRow[];
  rangedDamageTypes?: DamageTypeRow[];
  aoeDamageTypes?: DamageTypeRow[];
  attackEffectsMelee?: AttackEffectRow[];
  attackEffectsRanged?: AttackEffectRow[];
  attackEffectsAoE?: AttackEffectRow[];
  vrpEntries?: VrpEntryRow[];
};

type CharacterBackpackItemRow = {
  id: string;
  quantity: number;
  partyInventoryItem: {
    itemTemplate: ItemTemplateRow;
  };
};

type CharacterRow = {
  id: string;
  name: string;
  level: number;
  builderData: unknown;
  backpackItems?: CharacterBackpackItemRow[];
};

type MonsterPowerRow = {
  id?: string;
  sortOrder: number;
  name: string;
  description: string | null;
  descriptorChassis?: Power["descriptorChassis"] | null;
  descriptorChassisConfig?: unknown;
  commitmentModifier?: Power["commitmentModifier"] | null;
  counterMode?: Power["counterMode"] | null;
  cooldownTurns: number;
  cooldownReduction: number;
  primaryDefenceGate?: Power["primaryDefenceGate"] | null;
  diceCount?: unknown;
  potency?: unknown;
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
  rangeCategories?: RawRangeCategory[];
  effectPackets?: unknown[];
};

type MonsterAttackRow = {
  id?: string;
  sortOrder: number;
  attackMode?: string;
  attackName: string | null;
  attackConfig: unknown;
  equippedWeaponId?: string | null;
};

type MonsterTraitRow = {
  trait?: { name?: string | null; effectText?: string | null } | null;
};

type MonsterRow = {
  id: string;
  name: string;
  level: number;
  tier: string;
  legendary?: boolean;
  physicalResilienceMax: number;
  mentalPerseveranceMax: number;
  physicalProtection: number;
  mentalProtection: number;
  naturalPhysicalProtection?: number;
  naturalMentalProtection?: number;
  attackDie: CombatDieSize;
  attackResistDie: number;
  attackModifier?: number;
  guardDie: CombatDieSize;
  guardResistDie: number;
  guardModifier?: number;
  fortitudeDie: CombatDieSize;
  fortitudeResistDie: number;
  fortitudeModifier?: number;
  intellectDie: CombatDieSize;
  intellectResistDie: number;
  intellectModifier?: number;
  synergyDie: CombatDieSize;
  synergyResistDie: number;
  synergyModifier?: number;
  braveryDie: CombatDieSize;
  braveryResistDie: number;
  braveryModifier?: number;
  weaponSkillValue?: number;
  weaponSkillModifier?: number;
  armorSkillValue?: number;
  armorSkillModifier?: number;
  powers: MonsterPowerRow[];
  naturalAttack?: { attackName: string; attackConfig: unknown } | null;
  attacks?: MonsterAttackRow[];
  traits?: MonsterTraitRow[];
  mainHandItemId?: string | null;
  offHandItemId?: string | null;
  smallItemId?: string | null;
  headArmorItemId?: string | null;
  shoulderArmorItemId?: string | null;
  torsoArmorItemId?: string | null;
  legsArmorItemId?: string | null;
  feetArmorItemId?: string | null;
  headItemId?: string | null;
  neckItemId?: string | null;
  armsItemId?: string | null;
  beltItemId?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function positiveModifier(value: unknown): number {
  return Math.max(0, Math.trunc(asNumber(value)));
}

function attributeNumber(data: CharacterBuilderData, attribute: CombatAttributeName): number {
  const value = data.attributes[attribute];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toDie(value: number): CombatDieSize {
  if (value >= 12) return "D12";
  if (value >= 10) return "D10";
  if (value >= 8) return "D8";
  if (value >= 6) return "D6";
  return "D4";
}

function readGlobalAttributeModifiers(value: unknown): Array<{ attribute?: string; amount?: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const attribute = typeof record.attribute === "string" ? record.attribute : "";
      const amount = asNumber(record.amount, Number.NaN);
      return attribute && Number.isFinite(amount) ? { attribute, amount } : null;
    })
    .filter((entry): entry is { attribute: string; amount: number } => Boolean(entry));
}

function mapDamageTypes(rows: DamageTypeRow[] | undefined) {
  return (rows ?? []).map((row) => ({
    name: row.damageType.name,
    mode: row.damageType.attackMode === "MENTAL" ? "MENTAL" as const : "PHYSICAL" as const,
  }));
}

function mapAttackEffects(rows: AttackEffectRow[] | undefined) {
  return (rows ?? []).map((row) => row.attackEffect.name).filter(Boolean);
}

function mapVrpEntries(rows: VrpEntryRow[] | undefined) {
  return (rows ?? [])
    .map((row) => ({
      effectKind: row.effectKind,
      magnitude: Math.max(0, Math.trunc(Number(row.magnitude ?? 0))),
      damageType: row.damageType.name,
    }))
    .filter((row) => row.magnitude > 0 && row.damageType.trim().length > 0);
}

function vrpEntriesFromItems(items: Array<SummoningEquipmentItem | CharacterBuilderDerivedBackpackItem | null | undefined>) {
  return items
    .flatMap((item) => {
      if (!item) return [];
      return "itemTemplate" in item
        ? item.itemTemplate.vrpEntries ?? []
        : item.vrpEntries ?? [];
    })
    .map((entry) => ({
      effectKind: entry.effectKind,
      magnitude: Math.max(0, Math.trunc(Number(entry.magnitude ?? 0))),
      damageType: String(entry.damageType ?? "").trim(),
    }))
    .filter((entry) => entry.magnitude > 0 && entry.damageType.length > 0);
}

function toDerivedBackpackItem(row: CharacterBackpackItemRow): CharacterBuilderDerivedBackpackItem {
  const template = row.partyInventoryItem.itemTemplate;
  return {
    id: row.id,
    quantity: row.quantity,
    itemTemplate: {
      id: template.id,
      itemUrl: template.itemUrl,
      name: template.name,
      rarity: template.rarity,
      level: template.level,
      details: template.generalDescription,
      type: template.type,
      size: template.size,
      armorLocation: template.armorLocation,
      itemLocation: template.itemLocation,
      ppv: template.ppv,
      mpv: template.mpv,
      globalAttributeModifiers: readGlobalAttributeModifiers(template.globalAttributeModifiers),
      meleeTargets: template.meleeTargets,
      rangedTargets: template.rangedTargets,
      rangedDistanceFeet: template.rangedDistanceFeet,
      aoeCenterRangeFeet: template.aoeCenterRangeFeet,
      aoeCount: template.aoeCount,
      aoeShape: template.aoeShape,
      aoeSphereRadiusFeet: template.aoeSphereRadiusFeet,
      aoeConeLengthFeet: template.aoeConeLengthFeet,
      aoeLineWidthFeet: template.aoeLineWidthFeet,
      aoeLineLengthFeet: template.aoeLineLengthFeet,
      physicalStrength: template.physicalStrength,
      mentalStrength: template.mentalStrength,
      meleePhysicalStrength: template.meleePhysicalStrength,
      meleeMentalStrength: template.meleeMentalStrength,
      rangedPhysicalStrength: template.rangedPhysicalStrength,
      rangedMentalStrength: template.rangedMentalStrength,
      aoePhysicalStrength: template.aoePhysicalStrength,
      aoeMentalStrength: template.aoeMentalStrength,
      meleeDamageTypes: mapDamageTypes(template.meleeDamageTypes),
      rangedDamageTypes: mapDamageTypes(template.rangedDamageTypes),
      aoeDamageTypes: mapDamageTypes(template.aoeDamageTypes),
      attackEffectsMelee: mapAttackEffects(template.attackEffectsMelee),
      attackEffectsRanged: mapAttackEffects(template.attackEffectsRanged),
      attackEffectsAoE: mapAttackEffects(template.attackEffectsAoE),
      vrpEntries: mapVrpEntries(template.vrpEntries),
      descriptorSections: [],
    },
  };
}

function equipmentAttackConfig(item: SummoningEquipmentItem): MonsterNaturalAttackConfig {
  return {
    melee: item.melee,
    ranged: item.ranged,
    aoe: item.aoe,
  };
}

function profileHasAttackIntent(profile: MonsterNaturalAttackConfig["melee"] | MonsterNaturalAttackConfig["ranged"] | MonsterNaturalAttackConfig["aoe"]) {
  if (!profile) return false;
  return Boolean(profile.enabled) ||
    positiveModifier(profile.physicalStrength) > 0 ||
    positiveModifier(profile.mentalStrength) > 0 ||
    (profile.attackEffects?.length ?? 0) > 0;
}

function attackConfigHasIntent(config: MonsterNaturalAttackConfig | null | undefined) {
  return profileHasAttackIntent(config?.melee) ||
    profileHasAttackIntent(config?.ranged) ||
    profileHasAttackIntent(config?.aoe);
}

function itemContributesDefenceOnly(item: {
  ppv?: number | null;
  mpv?: number | null;
  globalAttributeModifiers?: Array<{ attribute?: string; amount?: number }> | unknown;
}) {
  const modifiers = readGlobalAttributeModifiers(item.globalAttributeModifiers);
  return asNumber(item.ppv) > 0 ||
    asNumber(item.mpv) > 0 ||
    modifiers.some((modifier) =>
      ["armor skill", "willpower", "dodge", "guard", "fortitude", "bravery"].includes(
        String(modifier.attribute ?? "").trim().toLowerCase(),
      ) && asNumber(modifier.amount) !== 0,
    );
}

function equipmentSlotLabel(slot: string) {
  return slot.endsWith("ItemId") ? slot.slice(0, -"ItemId".length) : slot;
}

function monsterEquippedItems(
  row: MonsterRow,
  equipmentById: Map<string, SummoningEquipmentItem>,
): Array<SummoningEquipmentItem | null> {
  const slotIds = [
    row.mainHandItemId ?? null,
    row.offHandItemId ?? null,
    row.smallItemId ?? null,
    row.headArmorItemId ?? null,
    row.shoulderArmorItemId ?? null,
    row.torsoArmorItemId ?? null,
    row.legsArmorItemId ?? null,
    row.feetArmorItemId ?? null,
    row.headItemId ?? null,
    row.neckItemId ?? null,
    row.armsItemId ?? null,
    row.beltItemId ?? null,
  ];
  return slotIds.map((id) => (id ? equipmentById.get(id) ?? null : null));
}

function finiteProtection(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : null;
}

function blockPerSuccess(params: {
  protection: number;
  dice: number;
  tuning: Pick<ProtectionTuningValues, "protectionK" | "protectionS">;
}) {
  if (params.protection <= 0) return 0;
  return Math.ceil(
    (params.protection / params.tuning.protectionK) *
      (1 + Math.max(1, params.dice) / params.tuning.protectionS),
  );
}

export function itemTemplateToSummoningEquipmentItem(template: ItemTemplateRow): SummoningEquipmentItem {
  const rangeCategories = template.rangeCategories ?? [];
  return {
    id: template.id,
    name: template.name ?? "(Unnamed item)",
    level: template.level ?? null,
    rarity: template.rarity ?? null,
    type: (template.type ?? "ITEM") as SummoningEquipmentItem["type"],
    size: template.size as SummoningEquipmentItem["size"],
    armorLocation: template.armorLocation as SummoningEquipmentItem["armorLocation"],
    itemLocation: template.itemLocation as SummoningEquipmentItem["itemLocation"],
    ppv: template.ppv ?? null,
    mpv: template.mpv ?? null,
    globalAttributeModifiers: readGlobalAttributeModifiers(template.globalAttributeModifiers),
    vrpEntries: mapVrpEntries(template.vrpEntries),
    melee: {
      enabled: rangeCategories.some((row) => row.rangeCategory === "MELEE"),
      targets: Math.max(1, Math.trunc(asNumber(template.meleeTargets, 1))),
      physicalStrength: asNumber(template.meleePhysicalStrength ?? template.physicalStrength),
      mentalStrength: asNumber(template.meleeMentalStrength ?? template.mentalStrength),
      damageTypes: mapDamageTypes(template.meleeDamageTypes),
      attackEffects: mapAttackEffects(template.attackEffectsMelee),
    },
    ranged: {
      enabled: rangeCategories.some((row) => row.rangeCategory === "RANGED"),
      targets: Math.max(1, Math.trunc(asNumber(template.rangedTargets, 1))),
      distance: Math.max(0, Math.trunc(asNumber(template.rangedDistanceFeet))),
      physicalStrength: asNumber(template.rangedPhysicalStrength ?? template.physicalStrength),
      mentalStrength: asNumber(template.rangedMentalStrength ?? template.mentalStrength),
      damageTypes: mapDamageTypes(template.rangedDamageTypes),
      attackEffects: mapAttackEffects(template.attackEffectsRanged),
    },
    aoe: {
      enabled: rangeCategories.some((row) => row.rangeCategory === "AOE"),
      count: Math.max(1, Math.trunc(asNumber(template.aoeCount, 1))),
      centerRange: Math.max(0, Math.trunc(asNumber(template.aoeCenterRangeFeet))),
      shape: template.aoeShape ?? "SPHERE",
      sphereRadiusFeet: Math.max(0, Math.trunc(asNumber(template.aoeSphereRadiusFeet))),
      coneLengthFeet: Math.max(0, Math.trunc(asNumber(template.aoeConeLengthFeet))),
      lineWidthFeet: Math.max(0, Math.trunc(asNumber(template.aoeLineWidthFeet))),
      lineLengthFeet: Math.max(0, Math.trunc(asNumber(template.aoeLineLengthFeet))),
      physicalStrength: asNumber(template.aoePhysicalStrength ?? template.physicalStrength),
      mentalStrength: asNumber(template.aoeMentalStrength ?? template.mentalStrength),
      damageTypes: mapDamageTypes(template.aoeDamageTypes),
      attackEffects: mapAttackEffects(template.attackEffectsAoE),
    },
  };
}

function makeWarning(actorId: string, actorName: string, field: string, message: string): CombatLabHydrationWarning {
  return { actorId, actorName, field, message };
}

function mapPower(power: MonsterPowerRow): Power {
  const rangeCategories = Array.isArray(power.rangeCategories)
    ? power.rangeCategories
        .map((row) => row.rangeCategory)
        .filter((value): value is RangeCategory =>
          value === "MELEE" || value === "RANGED" || value === "AOE",
        )
    : [];
  const effectPackets = Array.isArray(power.effectPackets)
    ? power.effectPackets.map((packet, index): EffectPacket => {
        const raw = asRecord(packet);
        const rawLocalTargeting = raw.localTargetingOverride;
        const localTargeting = asRecord(rawLocalTargeting);
        const intention = String(raw.intention ?? raw.type ?? "ATTACK");
        const normalizedIntention =
          intention === "DEFENCE" ||
          intention === "HEALING" ||
          intention === "AUGMENT" ||
          intention === "DEBUFF" ||
          intention === "CLEANSE" ||
          intention === "CONTROL" ||
          intention === "MOVEMENT" ||
          intention === "SUPPORT" ||
          intention === "SUMMONING" ||
          intention === "TRANSFORMATION"
            ? intention
            : "ATTACK";
        const targetedAttributeRaw = String(raw.targetedAttribute ?? "").toUpperCase();
        const targetedAttribute = [
          "ATTACK",
          "GUARD",
          "FORTITUDE",
          "INTELLECT",
          "SYNERGY",
          "BRAVERY",
        ].includes(targetedAttributeRaw)
          ? (targetedAttributeRaw as CoreAttribute)
          : null;
        return {
          id: typeof raw.id === "string" ? raw.id : undefined,
          sortOrder: Number(raw.sortOrder ?? raw.packetIndex ?? index),
          packetIndex: Number(raw.packetIndex ?? index),
          hostility: raw.hostility === "NON_HOSTILE" ? "NON_HOSTILE" : "HOSTILE",
          intention: normalizedIntention,
          type: normalizedIntention,
          specific: typeof raw.specific === "string" ? raw.specific : null,
          diceCount: Number(raw.diceCount ?? 1),
          potency: Number(raw.potency ?? 1),
          modifier: typeof raw.modifier === "number" ? raw.modifier : null,
          effectTimingType:
            raw.effectTimingType === "ON_HIT" ||
            raw.effectTimingType === "ON_TRIGGER" ||
            raw.effectTimingType === "START_OF_TURN" ||
            raw.effectTimingType === "END_OF_TURN" ||
            raw.effectTimingType === "START_OF_TURN_WHILST_CHANNELLED" ||
            raw.effectTimingType === "END_OF_TURN_WHILST_CHANNELLED" ||
            raw.effectTimingType === "ON_CAST"
              ? raw.effectTimingType
              : "ON_CAST",
          effectTimingTurns: typeof raw.effectTimingTurns === "number" ? raw.effectTimingTurns : null,
          effectDurationType:
            raw.effectDurationType === "TURNS" ||
            raw.effectDurationType === "PASSIVE" ||
            raw.effectDurationType === "UNTIL_TARGET_NEXT_TURN"
              ? raw.effectDurationType
              : "INSTANT",
          effectDurationTurns: typeof raw.effectDurationTurns === "number" ? raw.effectDurationTurns : null,
          dealsWounds: Boolean(raw.dealsWounds ?? normalizedIntention === "ATTACK"),
          woundChannel:
            raw.woundChannel === "MENTAL" || raw.woundChannel === "PHYSICAL"
              ? raw.woundChannel
              : null,
          targetedAttribute,
          applicationModeKey: typeof raw.applicationModeKey === "string" ? raw.applicationModeKey : null,
          resolutionOrigin: "CASTER",
          applyTo: raw.applyTo === "ALLIES" || raw.applyTo === "SELF" ? raw.applyTo : "PRIMARY_TARGET",
          secondaryDependencyMode:
            raw.secondaryDependencyMode === "INDEPENDENT" ||
            raw.secondaryDependencyMode === "LINKED_TO_PRIMARY" ||
            raw.secondaryDependencyMode === "DEPENDENT_SEQUENTIAL" ||
            raw.secondaryDependencyMode === "TRIGGERED_CONDITIONAL"
              ? raw.secondaryDependencyMode
              : null,
          triggerConditionText:
            typeof raw.triggerConditionText === "string" ? raw.triggerConditionText : null,
          detailsJson: asRecord(raw.detailsJson),
          localTargetingOverride:
            rawLocalTargeting && typeof rawLocalTargeting === "object" && !Array.isArray(rawLocalTargeting)
              ? {
                  meleeTargets: nullableInteger(localTargeting.meleeTargets),
                  rangedTargets: nullableInteger(localTargeting.rangedTargets),
                  rangedDistanceFeet: nullableInteger(localTargeting.rangedDistanceFeet),
                  aoeCenterRangeFeet: nullableInteger(localTargeting.aoeCenterRangeFeet),
                  aoeCount: nullableInteger(localTargeting.aoeCount),
                  aoeShape:
                    localTargeting.aoeShape === "SPHERE" ||
                    localTargeting.aoeShape === "CONE" ||
                    localTargeting.aoeShape === "LINE"
                      ? localTargeting.aoeShape
                      : null,
                  aoeSphereRadiusFeet: nullableInteger(localTargeting.aoeSphereRadiusFeet),
                  aoeConeLengthFeet: nullableInteger(localTargeting.aoeConeLengthFeet),
                  aoeLineWidthFeet: nullableInteger(localTargeting.aoeLineWidthFeet),
                  aoeLineLengthFeet: nullableInteger(localTargeting.aoeLineLengthFeet),
                }
              : null,
        };
      })
    : [];
  return {
    id: power.id,
    sortOrder: power.sortOrder,
    name: power.name,
    description: power.description,
    descriptorChassis: power.descriptorChassis ?? "IMMEDIATE",
    descriptorChassisConfig: asRecord(power.descriptorChassisConfig),
    commitmentModifier: power.commitmentModifier ?? "STANDARD",
    counterMode: power.counterMode === "YES" ? "YES" : "NO",
    cooldownTurns: power.cooldownTurns,
    cooldownReduction: power.cooldownReduction,
    primaryDefenceGate: power.primaryDefenceGate ?? null,
    rangeCategories,
    meleeTargets: power.meleeTargets ?? null,
    rangedTargets: power.rangedTargets ?? null,
    rangedDistanceFeet: power.rangedDistanceFeet ?? null,
    aoeCenterRangeFeet: power.aoeCenterRangeFeet ?? null,
    aoeCount: power.aoeCount ?? null,
    aoeShape: power.aoeShape ?? null,
    aoeSphereRadiusFeet: power.aoeSphereRadiusFeet ?? null,
    aoeConeLengthFeet: power.aoeConeLengthFeet ?? null,
    aoeLineWidthFeet: power.aoeLineWidthFeet ?? null,
    aoeLineLengthFeet: power.aoeLineLengthFeet ?? null,
    effectPackets,
    intentions: effectPackets,
    diceCount: Number(power.diceCount ?? effectPackets[0]?.diceCount ?? 1),
    potency: Number(power.potency ?? effectPackets[0]?.potency ?? 1),
  };
}

function actionNames(actions: CombatAction[]) {
  return actions.map((action) => action.name);
}

function needsFallback(actions: CombatAction[]): boolean {
  return !actions.some((action) => action.kind === "attack" && action.supported);
}

function unsupportedActionWarnings(actor: { id: string; name: string }, actions: CombatAction[]) {
  return actions
    .filter((action) => !action.supported)
    .flatMap((action) =>
      action.unsupportedReasons.map((reason) =>
        makeWarning(actor.id, actor.name, `action:${action.id}`, `${action.name}: ${reason}`),
      ),
    );
}

function actionAbstractionWarnings(actor: { id: string; name: string }, actions: CombatAction[]) {
  return Array.from(new Set(actions.flatMap((action) => action.abstractionNotes ?? []))).map((message) =>
    makeWarning(actor.id, actor.name, "actionAbstraction", message),
  );
}

function monsterTierForPowerCost(value: string): MonsterTier | null {
  if (value === "MINION" || value === "SOLDIER" || value === "ELITE" || value === "BOSS") {
    return value;
  }
  return null;
}

function characterPowersWithDerivedCooldowns(params: {
  row: Pick<CharacterRow, "id" | "name">;
  level: number;
  builderData: CharacterBuilderData;
  powerTuning?: PowerTuningSnapshot | null;
  playerPowerSpendScalar?: number | null;
}): { powers: Power[]; warnings: CombatLabHydrationWarning[] } {
  if (!params.powerTuning) {
    throw new Error(`Active power tuning is required to hydrate gameplay powers for "${params.row.name}".`);
  }
  const budget = summarizeCharacterPowers({
    level: params.level,
    powers: params.builderData.powers,
    tuningSnapshot: params.powerTuning ?? null,
    playerPowerSpendScalar: params.playerPowerSpendScalar,
    cooldownAuthorityMode: "ACTIVE_CURRENT_BALANCE",
  });
  const warnings: CombatLabHydrationWarning[] = [];
  const powers = params.builderData.powers.map((power, index) => {
    const authority = budget.powers[index]?.cooldownAuthority;
    if (!authority?.ok) {
      throw new Error(authority?.message ?? `Power "${power.name}" cooldown authority was unresolved.`);
    }
    for (const message of authority.result.warnings) {
      warnings.push(makeWarning(params.row.id, params.row.name, `powerCooldown:${power.id ?? power.name ?? index}`, message));
    }
    return attachPowerCooldownAuthority(power, authority);
  });
  return { powers, warnings };
}

function characterSignatureMoveWithDerivedCooldown(params: {
  row: Pick<CharacterRow, "id" | "name">;
  level: number;
  builderData: CharacterBuilderData;
  powerTuning?: PowerTuningSnapshot | null;
  playerPowerSpendScalar?: number | null;
}): { powers: Power[]; warnings: CombatLabHydrationWarning[]; present: boolean } {
  const signatureMove = params.builderData.signatureMove;
  if (!signatureMove) return { powers: [], warnings: [], present: false };
  if (!params.powerTuning) {
    throw new Error(`Active power tuning is required to hydrate the signature move for "${params.row.name}".`);
  }

  const sourceName = signatureMove.name.trim() || "Unnamed Signature Move";
  const hasThreeFieldPacket = signatureMove.effectPackets.some(
    (packet) => packet.modifier !== null && packet.modifier !== undefined,
  );
  const sourceId = signatureMove.id ?? (hasThreeFieldPacket ? undefined : `${params.row.id}:signatureMove`);
  const labelledPower: Power = {
    ...signatureMove,
    ...(sourceId ? { id: sourceId } : { id: undefined }),
    sortOrder: 0,
    name: `Signature Move: ${sourceName}`,
  };
  const budget = summarizeCharacterPowers({
    level: params.level,
    powers: [labelledPower],
    tuningSnapshot: params.powerTuning ?? null,
    playerPowerSpendScalar: params.playerPowerSpendScalar,
    powerPool: signatureMovePointPool(params.level),
    powerPoolKind: "signature",
    offencePressureMode: "reviewOnly",
    cooldownAuthorityMode: "ACTIVE_CURRENT_BALANCE",
  });
  const warnings: CombatLabHydrationWarning[] = [];
  const authority = budget.powers[0]?.cooldownAuthority;
  if (!authority?.ok) throw new Error(authority?.message ?? `Signature Move "${sourceName}" cooldown authority was unresolved.`);
  for (const message of authority.result.warnings) {
    warnings.push(makeWarning(params.row.id, params.row.name, `signatureMoveCooldown:${signatureMove.id ?? signatureMove.name ?? "signatureMove"}`, message));
  }

  return {
    powers: [attachPowerCooldownAuthority(labelledPower, authority)],
    warnings,
    present: true,
  };
}

function markSignatureMoveAction(action: CombatAction): CombatAction {
  const nextId = `signatureMove:${action.id}`;
  return {
    ...action,
    id: nextId,
    sourceType: "signatureMove",
    sourcePowerId: action.sourcePowerId ? `signatureMove:${action.sourcePowerId}` : action.sourcePowerId,
    cooldownActionId: action.cooldownActionId ? `signatureMove:${action.cooldownActionId}` : nextId,
    secondaryActions: action.secondaryActions?.map(markSignatureMoveAction),
  };
}

function monsterPowersWithDerivedCooldowns(params: {
  row: Pick<MonsterRow, "id" | "name" | "level" | "tier">;
  powers: MonsterPowerRow[];
  powerTuning?: PowerTuningSnapshot | null;
}): { powers: Power[]; warnings: CombatLabHydrationWarning[] } {
  const powers = params.powers.map(mapPower);
  if (!params.powerTuning) {
    throw new Error(`Active power tuning is required to hydrate gameplay powers for "${params.row.name}".`);
  }
  const warnings: CombatLabHydrationWarning[] = [];
  const hydratedPowers = powers.map((power, index) => {
    const authority = resolvePowerCooldownAuthority({
      power,
      mode: "ACTIVE_CURRENT_BALANCE",
      tuningSnapshot: params.powerTuning,
      context: { level: params.row.level, tier: monsterTierForPowerCost(params.row.tier) },
    });
    if (!authority.ok) throw new Error(authority.message);
    for (const message of authority.result.warnings) {
      warnings.push(makeWarning(params.row.id, params.row.name, `powerCooldown:${power.id ?? power.name ?? index}`, message));
    }
    return attachPowerCooldownAuthority(power, authority);
  });

  return { powers: hydratedPowers, warnings };
}

function textLooksCombatMechanical(value: string | null | undefined): boolean {
  const text = (value ?? "").toLowerCase();
  return /\b(attack|damage|wound|dice|die|protection|dodge|resist|heal|turn|action|cooldown|physical|mental|buff|debuff|control)\b/.test(text);
}

export function adaptCampaignCharacterToCombatActor(
  row: CharacterRow,
  protectionTuning?: ProtectionTuningValues,
  powerTuning?: PowerTuningSnapshot | null,
  playerPowerSpendScalar?: number | null,
): { actor: CombatActor; warnings: CombatLabHydrationWarning[] } {
  const warnings: CombatLabHydrationWarning[] = [];
  const unsupportedEquipment: string[] = [];
  const unsupportedTraits: string[] = [];
  const ignoredTraits: string[] = [];
  const unsupportedCombatTraits: string[] = [];
  const builderData = normalizeBuilderData(row.builderData);
  const backpackItems = (row.backpackItems ?? []).map(toDerivedBackpackItem);
  const equippedEntries = getEquippedEntries(builderData, backpackItems);
  const equippedBackpackItems = equippedEntries.map((entry) => entry.backpackItem);
  const level = Math.max(1, Math.trunc(row.level || 1));
  const derived = buildCharacterDerivedCombatStats({ level, builderData, backpackItems, protectionTuning });
  const modifiers = derived.itemModifiers;
  const attack = attributeNumber(builderData, "Attack") + positiveModifier(modifiers.attackModifier);
  const guard = attributeNumber(builderData, "Guard") + positiveModifier(modifiers.guardModifier);
  const fortitude = attributeNumber(builderData, "Fortitude") + positiveModifier(modifiers.fortitudeModifier);
  const intellect = attributeNumber(builderData, "Intellect") + positiveModifier(modifiers.intellectModifier);
  const synergy = attributeNumber(builderData, "Synergy") + positiveModifier(modifiers.synergyModifier);
  const bravery = attributeNumber(builderData, "Bravery") + positiveModifier(modifiers.braveryModifier);

  const characterPowerHydration = characterPowersWithDerivedCooldowns({
    row,
    level,
    builderData,
    powerTuning,
    playerPowerSpendScalar,
  });
  const signatureMoveHydration = characterSignatureMoveWithDerivedCooldown({
    row,
    level,
    builderData,
    powerTuning,
    playerPowerSpendScalar,
  });
  warnings.push(...characterPowerHydration.warnings);
  warnings.push(...signatureMoveHydration.warnings);
  const adaptedPowers = characterPowerHydration.powers.map((power) => adaptPowerToCombatActions(power));
  const adaptedSignatureMoves = signatureMoveHydration.powers.map((power) => adaptPowerToCombatActions(power));
  const powerActions = adaptedPowers.flatMap((entry) => entry.actions);
  const signatureMoveActions = adaptedSignatureMoves.flatMap((entry) => entry.actions).map(markSignatureMoveAction);
  warnings.push(
    ...adaptedPowers.flatMap((entry) =>
      entry.warnings.map((message) => makeWarning(row.id, row.name, "powerDomain", message)),
    ),
    ...adaptedSignatureMoves.flatMap((entry) =>
      entry.warnings.map((message) => makeWarning(row.id, row.name, "signatureMoveDomain", message)),
    ),
    ...adaptedSignatureMoves.flatMap((entry) =>
      entry.unsupported.map((reason) =>
        makeWarning(
          row.id,
          row.name,
          "signatureMoveUnsupported",
          `Signature Move "${reason.powerName}" is not supported by Combat Lab V1: ${reason.reason}`,
        ),
      ),
    ),
    ...Array.from(new Set(powerActions.flatMap((action) => action.abstractionNotes ?? []))).map((message) =>
      makeWarning(row.id, row.name, "powerAbstraction", message),
    ),
    ...Array.from(new Set(signatureMoveActions.flatMap((action) => action.abstractionNotes ?? []))).map((message) =>
      makeWarning(row.id, row.name, "signatureMoveAbstraction", message),
    ),
  );
  const equipmentActions = equippedEntries.flatMap(({ slot, backpackItem }) => {
    const type = backpackItem.itemTemplate.type;
    if (type !== "WEAPON" && type !== "SHIELD") return [];
    const label = `${slot}: ${backpackItem.itemTemplate.name ?? "Equipped item"}`;
    const attackConfig = buildAttackConfig(backpackItem);
    const actions = makeAttackActionsFromConfig({
      idBase: `${row.id}:equipment:${slot}:${backpackItem.id}`,
      sourceLabel: label,
      sourceType: "equippedWeapon",
      attackConfig,
      diceCount: derived.weaponSkill,
    });
    if (actions.length === 0 || actions.every((action) => !action.supported)) {
      const defensiveOnlyShield =
        type === "SHIELD" &&
        !attackConfigHasIntent(attackConfig) &&
        itemContributesDefenceOnly(backpackItem.itemTemplate);
      const message = defensiveOnlyShield
        ? `${label} contributes defence only; no attack generated.`
        : `${label} is equipped but has no supported attack strength for Combat Lab V1.`;
      if (!defensiveOnlyShield) {
        unsupportedEquipment.push(message);
      }
      warnings.push(makeWarning(row.id, row.name, `equipment:${slot}`, message));
    }
    const effects = [
      ...(backpackItem.itemTemplate.attackEffectsMelee ?? []),
      ...(backpackItem.itemTemplate.attackEffectsRanged ?? []),
      ...(backpackItem.itemTemplate.attackEffectsAoE ?? []),
    ];
    if (effects.length > 0) {
      const message = `${label} attack effects are listed but not mechanically resolved by Combat Lab V1: ${effects.join(", ")}.`;
      unsupportedEquipment.push(message);
      warnings.push(makeWarning(row.id, row.name, `equipmentEffects:${slot}`, message));
    }
    return actions;
  });

  const fallbackActions = needsFallback([...equipmentActions, ...powerActions, ...signatureMoveActions])
    ? [
        makeBasicAttackAction({
          id: "character-fallback-basic-attack",
          name: "Fallback Character Attack",
          diceCount: Math.max(1, Math.ceil(attack / 3)),
          potency: Math.max(1, Math.ceil(level / 3)),
        }),
      ]
    : [];
  if (fallbackActions.length > 0) {
    warnings.push(
      makeWarning(
        row.id,
        row.name,
        "fallbackAction",
        signatureMoveHydration.present
          ? "No real equipped, power, or Signature Move attack could be derived; Combat Lab V1 uses a fallback basic attack."
          : "No real equipped or power attack could be derived; Combat Lab V1 uses a fallback basic attack.",
      ),
    );
  }

  if (builderData.selectedTraitKeys.length > 0) {
    const message = "Character traits/characteristics are tracked as authored identity and ignored by Combat Lab V1 unless a combat mechanic is explicitly hydratable.";
    ignoredTraits.push(...builderData.selectedTraitKeys.map((key) => `${key}: ${message}`));
    warnings.push(makeWarning(row.id, row.name, "selectedTraitKeys", message));
  }
  warnings.push(...unsupportedActionWarnings(row, equipmentActions));
  warnings.push(...actionAbstractionWarnings(row, equipmentActions));

  const actions = [...equipmentActions, ...fallbackActions, ...powerActions, ...signatureMoveActions];
  const attributeDice = {
    Attack: toDie(attack),
    Guard: toDie(guard),
    Fortitude: toDie(fortitude),
    Intellect: toDie(intellect),
    Synergy: toDie(synergy),
    Bravery: toDie(bravery),
  };

  return {
    actor: {
      id: row.id,
      side: "players",
      name: row.name,
      role: "Campaign Character",
      level,
      tier: null,
      physicalHpCurrent: derived.physicalHealth,
      physicalHpMax: derived.physicalHealth,
      mentalHpCurrent: derived.mentalHealth,
      mentalHpMax: derived.mentalHealth,
      physicalProtection: 0,
      mentalProtection: 0,
      dodgeValue: derived.dodgeValue,
      dodgeDice: derived.dodgeDice,
      physicalDefenceDice: derived.armorSkill,
      physicalBlockPerSuccess: derived.physicalBlockPerSuccess,
      mentalDefenceDice: derived.willpower,
      mentalBlockPerSuccess: derived.mentalBlockPerSuccess,
      attributes: { Attack: attack, Guard: guard, Fortitude: fortitude, Intellect: intellect, Synergy: synergy, Bravery: bravery },
      attributeDice,
      resist: {
        ATTACK: builderData.resistPoints.Attack,
        GUARD: builderData.resistPoints.Guard,
        FORTITUDE: builderData.resistPoints.Fortitude,
        INTELLECT: builderData.resistPoints.Intellect,
        SYNERGY: builderData.resistPoints.Synergy,
        BRAVERY: builderData.resistPoints.Bravery,
      },
      actionsPerTurn: 1,
      actions,
      vrp: vrpEntriesFromItems(equippedBackpackItems),
      defeatModel: "PLAYER_CHARACTER",
      physicalMajorInjuries: 0,
      mentalMajorInjuries: 0,
      physicalMinorInjuries: 0,
      mentalMinorInjuries: 0,
      physicalInjuryResolvedAtZero: false,
      mentalInjuryResolvedAtZero: false,
      physicalPendingInjuryOverflow: null,
      mentalPendingInjuryOverflow: null,
      unsupportedPowers: [
        ...adaptedPowers.flatMap((entry) => entry.unsupported),
        ...adaptedSignatureMoves.flatMap((entry) => entry.unsupported),
      ],
      hydration: {
        source: "campaignCharacter",
        realData: true,
        warnings: warnings.map((warning) => warning.message),
        unsupportedEquipment,
        unsupportedTraits,
        ignoredTraits,
        unsupportedCombatTraits,
        fallbackActions: actionNames(fallbackActions),
      },
      defeated: false,
    },
    warnings,
  };
}

export function adaptMonsterToCombatLabActor(
  row: MonsterRow,
  equipmentById = new Map<string, SummoningEquipmentItem>(),
  protectionTuning: ProtectionTuningValues,
  powerTuning?: PowerTuningSnapshot | null,
): { actor: CombatActor; warnings: CombatLabHydrationWarning[] } {
  const warnings: CombatLabHydrationWarning[] = [];
  const unsupportedEquipment: string[] = [];
  const unsupportedTraits: string[] = [];
  const ignoredTraits: string[] = [];
  const unsupportedCombatTraits: string[] = [];
  const monsterPowerHydration = monsterPowersWithDerivedCooldowns({
    row,
    powers: row.powers,
    powerTuning,
  });
  warnings.push(...monsterPowerHydration.warnings);
  const adaptedPowers = monsterPowerHydration.powers.map((power) => adaptPowerToCombatActions(power));
  const powerActions = adaptedPowers.flatMap((entry) => entry.actions);
  warnings.push(
    ...adaptedPowers.flatMap((entry) =>
      entry.warnings.map((message) => makeWarning(row.id, row.name, "powerDomain", message)),
    ),
    ...Array.from(new Set(powerActions.flatMap((action) => action.abstractionNotes ?? []))).map((message) =>
      makeWarning(row.id, row.name, "powerAbstraction", message),
    ),
  );
  const equippedItems = monsterEquippedItems(row, equipmentById);
  const itemModifiers = getHighestItemModifiers(equippedItems);
  const itemProtection = getProtectionTotalsFromItems(equippedItems);
  const weaponSkill = Math.max(
    1,
    Math.trunc(asNumber(row.weaponSkillValue, 1) + asNumber(row.weaponSkillModifier) + Math.max(0, itemModifiers.weaponSkillModifier ?? 0)),
  );

  const attackRows =
    Array.isArray(row.attacks) && row.attacks.length > 0
      ? row.attacks
      : row.naturalAttack
        ? [{ sortOrder: 0, attackName: row.naturalAttack.attackName, attackConfig: row.naturalAttack.attackConfig }]
        : [];
  const naturalAttackActions = attackRows.flatMap((attack, index) => {
    const label = attack.attackName?.trim() || `Natural Attack ${index + 1}`;
    const actions = makeAttackActionsFromConfig({
      idBase: `${row.id}:natural:${attack.id ?? index}`,
      sourceLabel: label,
      sourceType: "naturalAttack",
      attackConfig: attack.attackConfig as MonsterNaturalAttackConfig,
      diceCount: weaponSkill,
    });
    if (actions.length === 0 || actions.every((action) => !action.supported)) {
      warnings.push(
        makeWarning(row.id, row.name, `naturalAttack:${index}`, `${label} has no supported attack profile.`),
      );
    }
    return actions;
  });

  const equippedWeaponActions = [
    ["mainHandItemId", row.mainHandItemId],
    ["offHandItemId", row.offHandItemId],
    ["smallItemId", row.smallItemId],
  ].flatMap(([slot, itemId]) => {
    if (!itemId) return [];
    const item = equipmentById.get(itemId);
    if (!item) {
      const message = `${slot} references item ${itemId}, but Combat Lab could not hydrate that item.`;
      unsupportedEquipment.push(message);
      warnings.push(makeWarning(row.id, row.name, String(slot), message));
      return [];
    }
    if (item.type !== "WEAPON" && item.type !== "SHIELD") return [];
    const slotLabel = equipmentSlotLabel(String(slot));
    const label = `${slotLabel}: ${item.name}`;
    const attackConfig = equipmentAttackConfig(item);
    const actions = makeAttackActionsFromConfig({
      idBase: `${row.id}:equipment:${slotLabel}:${item.id}`,
      sourceLabel: label,
      sourceType: "equippedWeapon",
      attackConfig,
      diceCount: weaponSkill,
    });
    if (actions.length === 0 || actions.every((action) => !action.supported)) {
      const defensiveOnlyShield =
        item.type === "SHIELD" &&
        !attackConfigHasIntent(attackConfig) &&
        itemContributesDefenceOnly(item);
      const message = defensiveOnlyShield
        ? `${label} contributes defence only; no attack generated.`
        : `${label} is equipped but has no supported attack strength for Combat Lab V1.`;
      if (!defensiveOnlyShield) {
        unsupportedEquipment.push(message);
      }
      warnings.push(makeWarning(row.id, row.name, `equipment:${slotLabel}`, message));
    }
    const effects = [
      ...(item.melee?.attackEffects ?? []),
      ...(item.ranged?.attackEffects ?? []),
      ...(item.aoe?.attackEffects ?? []),
    ];
    if (effects.length > 0) {
      const message = `${label} attack effects are listed but not mechanically resolved by Combat Lab V1: ${effects.join(", ")}.`;
      unsupportedEquipment.push(message);
      warnings.push(makeWarning(row.id, row.name, `equipmentEffects:${slot}`, message));
    }
    return actions;
  });

  const fallbackActions = needsFallback([...naturalAttackActions, ...equippedWeaponActions, ...powerActions])
    ? [
        makeBasicAttackAction({
          id: "monster-fallback-basic-attack",
          name: "Fallback Monster Attack",
          diceCount: Math.max(1, Math.ceil(getAttributeNumericValue(row.attackDie) / 3)),
          potency: Math.max(1, Math.ceil(row.level / 3)),
        }),
      ]
    : [];
  if (fallbackActions.length > 0) {
    warnings.push(
      makeWarning(
        row.id,
        row.name,
        "fallbackAction",
        "No real natural, equipped, or power attack could be derived; Combat Lab V1 uses a fallback basic attack.",
      ),
    );
  }

  for (const trait of row.traits ?? []) {
    const name = trait.trait?.name?.trim();
    if (!name) continue;
    const effectText = trait.trait?.effectText ?? "";
    if (textLooksCombatMechanical(effectText)) {
      const message = `${name}: monster combat trait mechanics are reported but not applied by Combat Lab V1.`;
      unsupportedTraits.push(message);
      unsupportedCombatTraits.push(message);
    } else {
      ignoredTraits.push(`${name}: trait/characteristic has no detected combat mechanics and is ignored by Combat Lab V1.`);
    }
  }
  if (unsupportedCombatTraits.length > 0) {
    warnings.push(makeWarning(row.id, row.name, "traits", "Monster trait mechanics are reported but not applied by Combat Lab V1."));
  }
  warnings.push(...unsupportedActionWarnings(row, [...naturalAttackActions, ...equippedWeaponActions]));
  warnings.push(...actionAbstractionWarnings(row, [...naturalAttackActions, ...equippedWeaponActions]));

  const attack = getAttributeNumericValue(row.attackDie) + asNumber(row.attackModifier);
  const guard = getAttributeNumericValue(row.guardDie) + asNumber(row.guardModifier);
  const fortitude = getAttributeNumericValue(row.fortitudeDie) + asNumber(row.fortitudeModifier);
  const intellect = getAttributeNumericValue(row.intellectDie) + asNumber(row.intellectModifier);
  const synergy = getAttributeNumericValue(row.synergyDie) + asNumber(row.synergyModifier);
  const bravery = getAttributeNumericValue(row.braveryDie) + asNumber(row.braveryModifier);
  const actions = [...naturalAttackActions, ...equippedWeaponActions, ...fallbackActions, ...powerActions];
  const naturalPhysicalProtection =
    finiteProtection(row.naturalPhysicalProtection) ??
    (itemProtection.physicalProtection > 0 ? 0 : Math.max(0, row.physicalProtection));
  const naturalMentalProtection =
    finiteProtection(row.naturalMentalProtection) ??
    (itemProtection.mentalProtection > 0 ? 0 : Math.max(0, row.mentalProtection));
  const totalPhysicalProtection = naturalPhysicalProtection + itemProtection.physicalProtection;
  const totalMentalProtection = naturalMentalProtection + itemProtection.mentalProtection;
  const dodgeValue = Math.max(
    0,
    getDodgeValue(
      row.guardDie,
      row.intellectDie,
      row.level,
      totalPhysicalProtection,
      protectionTuning,
    ),
  );
  const dodgeDice = Math.max(0, Math.ceil(dodgeValue / 6) + Math.max(0, Math.trunc(itemModifiers.dodgeModifier ?? 0)));
  const baseArmorSkill = getArmorSkillDiceCountFromAttributes(row.guardDie, row.fortitudeDie, protectionTuning);
  const armorSkill = Math.max(
    1,
    Math.trunc(
      baseArmorSkill +
        Math.max(0, Math.trunc(itemModifiers.armorSkillModifier ?? 0)),
    ),
  );
  const mentalDefenceDice = Math.max(
    1,
    getWillpowerDiceCountFromAttributes(row.synergyDie, row.braveryDie, protectionTuning) +
      Math.max(0, Math.trunc(itemModifiers.willpowerModifier ?? 0)),
  );
  const physicalBlockPerSuccess = blockPerSuccess({
    protection: totalPhysicalProtection,
    dice: armorSkill,
    tuning: protectionTuning,
  });
  const mentalBlockPerSuccess = blockPerSuccess({
    protection: totalMentalProtection,
    dice: mentalDefenceDice,
    tuning: protectionTuning,
  });
  warnings.push(
    makeWarning(
      row.id,
      row.name,
      "defenceSummary",
      `Physical Defence: ${armorSkill} x ${row.guardDie}, blocks ${physicalBlockPerSuccess}/success. Mental Defence: ${mentalDefenceDice} x ${row.braveryDie}, blocks ${mentalBlockPerSuccess}/success.`,
    ),
  );

  return {
    actor: {
      id: row.id,
      side: "monsters",
      name: row.name,
      role: row.tier[0] + row.tier.slice(1).toLowerCase(),
      level: row.level,
      tier: row.tier,
      physicalHpCurrent: row.physicalResilienceMax,
      physicalHpMax: row.physicalResilienceMax,
      mentalHpCurrent: row.mentalPerseveranceMax,
      mentalHpMax: row.mentalPerseveranceMax,
      physicalProtection: 0,
      mentalProtection: 0,
      dodgeValue,
      dodgeDice,
      physicalDefenceDice: armorSkill,
      physicalBlockPerSuccess,
      mentalDefenceDice,
      mentalBlockPerSuccess,
      attributes: { Attack: attack, Guard: guard, Fortitude: fortitude, Intellect: intellect, Synergy: synergy, Bravery: bravery },
      attributeDice: {
        Attack: row.attackDie,
        Guard: row.guardDie,
        Fortitude: row.fortitudeDie,
        Intellect: row.intellectDie,
        Synergy: row.synergyDie,
        Bravery: row.braveryDie,
      },
      resist: {
        ATTACK: row.attackResistDie,
        GUARD: row.guardResistDie,
        FORTITUDE: row.fortitudeResistDie,
        INTELLECT: row.intellectResistDie,
        SYNERGY: row.synergyResistDie,
        BRAVERY: row.braveryResistDie,
      },
      actionsPerTurn: row.tier === "BOSS" ? 2 : 1,
      actions,
      vrp: vrpEntriesFromItems(equippedItems),
      defeatModel: row.legendary ? "LEGENDARY_MONSTER" : "NORMAL_MONSTER",
      physicalMajorInjuries: 0,
      mentalMajorInjuries: 0,
      physicalMinorInjuries: 0,
      mentalMinorInjuries: 0,
      physicalInjuryResolvedAtZero: false,
      mentalInjuryResolvedAtZero: false,
      physicalPendingInjuryOverflow: null,
      mentalPendingInjuryOverflow: null,
      unsupportedPowers: adaptedPowers.flatMap((entry) => entry.unsupported),
      hydration: {
        source: "campaignMonster",
        realData: true,
        warnings: warnings.map((warning) => warning.message),
        unsupportedEquipment,
        unsupportedTraits,
        ignoredTraits,
        unsupportedCombatTraits,
        fallbackActions: actionNames(fallbackActions),
      },
      defeated: false,
    },
    warnings,
  };
}
