import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import type { EffectDurationType, Prisma } from "@prisma/client";
import { renderAttackActionLines } from "@/lib/summoning/render";
import type { MonsterNaturalAttackConfig, Power } from "@/lib/summoning/types";
import type { SummoningEquipmentItem } from "@/lib/summoning/equipment";
import { requireCampaignDirectorOrAdmin, requireUserId } from "../../../_shared";

const MONSTER_INCLUDE = {
  tags: { orderBy: { tag: "asc" as const } },
  traits: {
    orderBy: { sortOrder: "asc" as const },
    include: { trait: { select: { id: true, name: true, effectText: true } } },
  },
  attacks: { orderBy: { sortOrder: "asc" as const } },
  naturalAttack: true,
  powers: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      rangeCategories: { orderBy: { rangeCategory: "asc" as const } },
      primaryDefenceGate: true,
      tags: { orderBy: { tag: "asc" as const } },
      effectPackets: {
        orderBy: { packetIndex: "asc" as const },
        include: {
          localTargetingOverride: true,
        },
      },
    },
  },
};
const WEAPON_SOURCE_CAP = 3;
const WEAPON_SOURCE_CAP_ERROR =
  "A monster can have at most 3 weapon sources total (equipped + natural). Unequip a weapon source or remove a natural weapon.";

type EquipmentItemsById = Map<string, SummoningEquipmentItem>;

function normalizedSourceAttacks(source: {
  attacks: Array<{
    sortOrder: number;
    attackMode: "NATURAL" | "EQUIPPED";
    attackName: string | null;
    attackConfig: unknown;
  }>;
  naturalAttack: {
    attackName: string;
    attackConfig: unknown;
  } | null;
}) {
  const sourceAttacks = [...source.attacks]
    .filter((attack) => attack.attackMode === "NATURAL")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((attack, index) => ({
      sortOrder: index,
      attackMode: "NATURAL" as const,
      attackName: attack.attackName ?? "Natural Weapon",
      attackConfig: attack.attackConfig ?? {},
    }));

  if (sourceAttacks.length > 0) return sourceAttacks;

  if (source.naturalAttack) {
    return [
      {
        sortOrder: 0,
        attackMode: "NATURAL" as const,
        attackName: source.naturalAttack.attackName,
        attackConfig: source.naturalAttack.attackConfig,
      },
    ];
  }

  return [];
}

async function loadEquipmentItemsById(
  campaignId: string,
  handItemIds: Array<string | null | undefined>,
): Promise<EquipmentItemsById> {
  const ids = Array.from(new Set(handItemIds.filter(Boolean) as string[]));
  if (ids.length === 0) return new Map();

  const rows = await prisma.itemTemplate.findMany({
    where: {
      campaignId,
      id: { in: ids },
      type: { in: ["WEAPON", "SHIELD"] },
    },
    select: {
      id: true,
      name: true,
      type: true,
      size: true,
      armorLocation: true,
      ppv: true,
      mpv: true,
      globalAttributeModifiers: true,
      meleeTargets: true,
      meleePhysicalStrength: true,
      meleeMentalStrength: true,
      rangedTargets: true,
      rangedDistanceFeet: true,
      rangedPhysicalStrength: true,
      rangedMentalStrength: true,
      aoeCount: true,
      aoeCenterRangeFeet: true,
      aoeShape: true,
      aoeSphereRadiusFeet: true,
      aoeConeLengthFeet: true,
      aoeLineWidthFeet: true,
      aoeLineLengthFeet: true,
      aoePhysicalStrength: true,
      aoeMentalStrength: true,
      rangeCategories: { select: { rangeCategory: true } },
      meleeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
      rangedDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
      aoeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
      attackEffectsMelee: { select: { attackEffect: { select: { name: true } } } },
      attackEffectsRanged: { select: { attackEffect: { select: { name: true } } } },
      attackEffectsAoE: { select: { attackEffect: { select: { name: true } } } },
    },
  });

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        type: row.type,
        size: row.size,
        armorLocation: row.armorLocation,
        ppv: row.ppv,
        mpv: row.mpv,
        globalAttributeModifiers: Array.isArray(row.globalAttributeModifiers)
          ? (row.globalAttributeModifiers as Array<{ attribute?: string; amount?: number }>)
          : [],
        melee: {
          enabled: row.rangeCategories.some((r) => r.rangeCategory === "MELEE"),
          targets: row.meleeTargets ?? 1,
          physicalStrength: row.meleePhysicalStrength ?? 0,
          mentalStrength: row.meleeMentalStrength ?? 0,
          damageTypes: row.meleeDamageTypes.map((x) => ({
            name: x.damageType.name,
            mode: x.damageType.attackMode as "PHYSICAL" | "MENTAL",
          })),
          attackEffects: row.attackEffectsMelee.map((x) => x.attackEffect.name),
        },
        ranged: {
          enabled: row.rangeCategories.some((r) => r.rangeCategory === "RANGED"),
          targets: row.rangedTargets ?? 1,
          distance: row.rangedDistanceFeet ?? 0,
          physicalStrength: row.rangedPhysicalStrength ?? 0,
          mentalStrength: row.rangedMentalStrength ?? 0,
          damageTypes: row.rangedDamageTypes.map((x) => ({
            name: x.damageType.name,
            mode: x.damageType.attackMode as "PHYSICAL" | "MENTAL",
          })),
          attackEffects: row.attackEffectsRanged.map((x) => x.attackEffect.name),
        },
        aoe: {
          enabled: row.rangeCategories.some((r) => r.rangeCategory === "AOE"),
          count: row.aoeCount ?? 1,
          centerRange: row.aoeCenterRangeFeet ?? 0,
          shape: row.aoeShape ?? "SPHERE",
          sphereRadiusFeet: row.aoeSphereRadiusFeet ?? undefined,
          coneLengthFeet: row.aoeConeLengthFeet ?? undefined,
          lineWidthFeet: row.aoeLineWidthFeet ?? undefined,
          lineLengthFeet: row.aoeLineLengthFeet ?? undefined,
          physicalStrength: row.aoePhysicalStrength ?? 0,
          mentalStrength: row.aoeMentalStrength ?? 0,
          damageTypes: row.aoeDamageTypes.map((x) => ({
            name: x.damageType.name,
            mode: x.damageType.attackMode as "PHYSICAL" | "MENTAL",
          })),
          attackEffects: row.attackEffectsAoE.map((x) => x.attackEffect.name),
        },
      } satisfies SummoningEquipmentItem,
    ]),
  );
}

function getWeaponSourceAttackLines(
  item: SummoningEquipmentItem | null | undefined,
  weaponSkillValue: number,
): string[] {
  if (!item) return [];
  if (item.type !== "WEAPON" && item.type !== "SHIELD") return [];
  return renderAttackActionLines(
    {
      melee: item.melee,
      ranged: item.ranged,
      aoe: item.aoe,
    } as MonsterNaturalAttackConfig,
    weaponSkillValue,
    { applyWeaponSkillOverride: true },
  );
}

function validateWeaponSourceCap(
  sourceAttacks: Array<{ sortOrder: number; attackName: string | null; attackConfig: unknown }>,
  source: {
    mainHandItemId: string | null;
    offHandItemId: string | null;
    smallItemId: string | null;
    weaponSkillValue: number;
  },
  itemsById: EquipmentItemsById,
): string | null {
  const handIds = [source.mainHandItemId, source.offHandItemId, source.smallItemId];
  let equippedWeaponSourceCount = 0;
  for (const itemId of handIds) {
    if (!itemId) continue;
    const item = itemsById.get(itemId) ?? null;
    if (getWeaponSourceAttackLines(item, source.weaponSkillValue).length > 0) {
      equippedWeaponSourceCount += 1;
    }
  }

  const totalWeaponSources = equippedWeaponSourceCount + sourceAttacks.length;
  if (totalWeaponSources > WEAPON_SOURCE_CAP) {
    return WEAPON_SOURCE_CAP_ERROR;
  }
  return null;
}

type MonsterWithPowers = Prisma.MonsterGetPayload<{
  include: typeof MONSTER_INCLUDE;
}>;

function buildPowerRangeCategories(power: Power): Array<"MELEE" | "RANGED" | "AOE"> {
  const explicit = (power.rangeCategories ?? []).filter(
    (category): category is "MELEE" | "RANGED" | "AOE" =>
      category === "MELEE" || category === "RANGED" || category === "AOE",
  );
  return explicit;
}

function normalizeDescriptorChassis(
  value: unknown,
): Power["descriptorChassis"] {
  return value === "IMMEDIATE" ||
    value === "FIELD" ||
    value === "ATTACHED" ||
    value === "TRIGGER" ||
    value === "RESERVE"
    ? value
    : "IMMEDIATE";
}

function readCounterMode(
  power: Record<string, unknown>,
): NonNullable<Power["counterMode"]> {
  return power.counterMode === "YES" || power.counterMode === "NO"
    ? power.counterMode
    : power.responseRequired === true
      ? "YES"
      : "NO";
}

function readCommitmentModifier(
  power: Record<string, unknown>,
): NonNullable<Power["commitmentModifier"]> {
  return power.commitmentModifier === "CHANNEL" ||
    power.commitmentModifier === "CHARGE" ||
    power.commitmentModifier === "STANDARD"
    ? power.commitmentModifier
    : "STANDARD";
}

function normalizeChargeType(
  value: unknown,
): Power["chargeType"] {
  return value === "BUILD_POWER" || value === "DELAYED_RELEASE"
    ? value
    : null;
}

function normalizeTriggerMethod(
  value: unknown,
): Power["triggerMethod"] {
  return value === "TARGET_AND_THEN_ARM" || value === "ARM_AND_THEN_TARGET"
    ? value
    : null;
}

function normalizeAttachedHostAnchorType(
  value: unknown,
): Power["attachedHostAnchorType"] {
  return value === "TARGET" ||
    value === "OBJECT" ||
    value === "WEAPON" ||
    value === "ARMOR" ||
    value === "SELF" ||
    value === "AREA"
    ? value
    : null;
}

function readLegacyAttachedHostAnchorType(
  descriptorChassisConfig: Record<string, unknown>,
): Power["attachedHostAnchorType"] {
  const normalized = String(descriptorChassisConfig.anchorText ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (
    normalized === "target" ||
    normalized === "the target" ||
    normalized === "marked target" ||
    normalized === "the marked target" ||
    normalized === "chosen target" ||
    normalized === "the chosen target" ||
    normalized === "host" ||
    normalized === "the host"
  ) {
    return "TARGET";
  }
  if (normalized === "object" || normalized === "the object") return "OBJECT";
  if (
    normalized === "weapon" ||
    normalized === "the weapon" ||
    normalized === "your weapon" ||
    normalized === "bound weapon" ||
    normalized === "the bound weapon"
  ) {
    return "WEAPON";
  }
  if (
    normalized === "armor" ||
    normalized === "armour" ||
    normalized === "the armor" ||
    normalized === "the armour" ||
    normalized === "your armor" ||
    normalized === "your armour"
  ) {
    return "ARMOR";
  }
  if (normalized === "self" || normalized === "yourself") return "SELF";
  if (normalized === "area" || normalized === "the area") return "AREA";
  return null;
}

function normalizeEffectPacketApplyTo(
  value: unknown,
): "PRIMARY_TARGET" | "ALLIES" | "SELF" | null {
  return value === "ALLIES" || value === "SELF" || value === "PRIMARY_TARGET"
    ? value
    : null;
}

function readPacketApplyTo(
  effectPacket: Pick<Power["effectPackets"][number], "applyTo" | "detailsJson">,
): "PRIMARY_TARGET" | "ALLIES" | "SELF" {
  const details =
    effectPacket.detailsJson && typeof effectPacket.detailsJson === "object" && !Array.isArray(effectPacket.detailsJson)
      ? (effectPacket.detailsJson as Record<string, unknown>)
      : {};
  return normalizeEffectPacketApplyTo(effectPacket.applyTo ?? details.applyTo) ?? "PRIMARY_TARGET";
}

function readPacketTriggerConditionText(
  effectPacket: Pick<Power["effectPackets"][number], "triggerConditionText" | "detailsJson">,
): string | null {
  const details =
    effectPacket.detailsJson && typeof effectPacket.detailsJson === "object" && !Array.isArray(effectPacket.detailsJson)
      ? (effectPacket.detailsJson as Record<string, unknown>)
      : {};
  const value =
    effectPacket.triggerConditionText ?? details.triggerConditionText ?? details.effectTriggerText;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sanitizeDescriptorChassisConfig(
  value: unknown,
): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const config = { ...(value as Record<string, unknown>) };
  delete config.fieldInteractionText;
  delete config.chargeType;
  delete config.chargeTurns;
  delete config.chargeBonusDicePerTurn;
  delete config.triggerMethod;
  delete config.anchorText;
  delete config.payloadTriggerText;
  return config as Prisma.InputJsonValue;
}

function sanitizeEffectPacketDetails(
  value: unknown,
): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const details = { ...(value as Record<string, unknown>) };
  delete details.applyTo;
  delete details.triggerConditionText;
  delete details.effectTriggerText;
  return details as Prisma.InputJsonValue;
}

function buildPowerCreateData(power: Power) {
  const effectPackets = Array.isArray(power.effectPackets)
    ? power.effectPackets
    : Array.isArray(power.intentions)
      ? power.intentions
      : [];
  const effectDurationType = power.effectDurationType ?? power.durationType ?? "INSTANT";
  return {
    sortOrder: power.sortOrder,
    sourceType: "MONSTER_POWER" as const,
    name: power.name,
    description: power.description,
    schemaVersion: power.schemaVersion ?? 1,
    rulesVersion: power.rulesVersion ?? "v1",
    contentRevision: power.contentRevision ?? 1,
    previewRendererVersion: power.previewRendererVersion ?? 1,
    status: power.status ?? "ACTIVE",
    descriptorChassis: normalizeDescriptorChassis(power.descriptorChassis),
    descriptorChassisConfig: sanitizeDescriptorChassisConfig(power.descriptorChassisConfig),
    chargeType:
      power.commitmentModifier === "CHARGE" ? normalizeChargeType(power.chargeType) : null,
    chargeTurns:
      power.commitmentModifier === "CHARGE" ? (power.chargeTurns ?? null) : null,
    chargeBonusDicePerTurn:
      power.commitmentModifier === "CHARGE" && power.chargeType === "BUILD_POWER"
        ? (power.chargeBonusDicePerTurn ?? null)
        : null,
    counterMode: power.counterMode ?? "NO",
    commitmentModifier: power.commitmentModifier ?? "STANDARD",
    triggerMethod:
      normalizeDescriptorChassis(power.descriptorChassis) === "TRIGGER"
        ? normalizeTriggerMethod(power.triggerMethod)
        : null,
    attachedHostAnchorType:
      normalizeDescriptorChassis(power.descriptorChassis) === "ATTACHED"
        ? normalizeAttachedHostAnchorType(power.attachedHostAnchorType)
        : null,
    cooldownTurns: power.cooldownTurns,
    cooldownReduction: power.cooldownReduction,
    lifespanType: power.lifespanType ?? "NONE",
    lifespanTurns: power.lifespanTurns ?? null,
    previewSummaryOverride: power.previewSummaryOverride ?? null,
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
    rangeCategories: {
      create: buildPowerRangeCategories(power).map((rangeCategory) => ({ rangeCategory })),
    },
    primaryDefenceGate: power.primaryDefenceGate
      ? {
          create: {
            // Keep sourcePacketIndex 0-based for now to match packetIndex and the
            // current editor bridge until a dedicated UI pass can safely move it.
            sourcePacketIndex: power.primaryDefenceGate.sourcePacketIndex,
            gateResult: power.primaryDefenceGate.gateResult,
            protectionChannel: power.primaryDefenceGate.protectionChannel,
            resistAttribute: power.primaryDefenceGate.resistAttribute,
            hostileEntryPattern: power.primaryDefenceGate.hostileEntryPattern,
            resolutionSource: power.primaryDefenceGate.resolutionSource,
          },
        }
      : undefined,
    effectPackets: {
      create: effectPackets.map((effectPacket, packetIndex) => {
        const normalizedDurationType = (effectPacket.effectDurationType ?? effectDurationType) as EffectDurationType;
        return {
          packetIndex: effectPacket.packetIndex ?? effectPacket.sortOrder ?? packetIndex,
          hostility: effectPacket.hostility ?? "NON_HOSTILE",
          intention: effectPacket.intention ?? effectPacket.type ?? "ATTACK",
          specific: effectPacket.specific ?? null,
          diceCount: effectPacket.diceCount ?? power.diceCount,
          potency: effectPacket.potency ?? power.potency,
          effectTimingType: effectPacket.effectTimingType ?? "ON_CAST",
          effectTimingTurns: effectPacket.effectTimingTurns ?? null,
          effectDurationType: normalizedDurationType,
          effectDurationTurns:
            normalizedDurationType === "TURNS"
              ? (effectPacket.effectDurationTurns ?? power.effectDurationTurns ?? power.durationTurns ?? null)
              : null,
          dealsWounds: effectPacket.dealsWounds ?? false,
          woundChannel: effectPacket.woundChannel ?? null,
          targetedAttribute: effectPacket.targetedAttribute ?? null,
          applicationModeKey: effectPacket.applicationModeKey ?? null,
          resolutionOrigin: effectPacket.resolutionOrigin ?? "CASTER",
          applyTo: readPacketApplyTo(effectPacket),
          triggerConditionText: readPacketTriggerConditionText(effectPacket),
          detailsJson: sanitizeEffectPacketDetails(effectPacket.detailsJson),
          localTargetingOverride: effectPacket.localTargetingOverride
            ? {
                create: {
                  meleeTargets: effectPacket.localTargetingOverride.meleeTargets,
                  rangedTargets: effectPacket.localTargetingOverride.rangedTargets,
                  rangedDistanceFeet: effectPacket.localTargetingOverride.rangedDistanceFeet,
                  aoeCenterRangeFeet: effectPacket.localTargetingOverride.aoeCenterRangeFeet,
                  aoeCount: effectPacket.localTargetingOverride.aoeCount,
                  aoeShape: effectPacket.localTargetingOverride.aoeShape,
                  aoeSphereRadiusFeet: effectPacket.localTargetingOverride.aoeSphereRadiusFeet,
                  aoeConeLengthFeet: effectPacket.localTargetingOverride.aoeConeLengthFeet,
                  aoeLineWidthFeet: effectPacket.localTargetingOverride.aoeLineWidthFeet,
                  aoeLineLengthFeet: effectPacket.localTargetingOverride.aoeLineLengthFeet,
                },
              }
            : undefined,
        };
      }),
    },
  };
}

function serializePower(
  power: MonsterWithPowers["powers"][number],
): Power {
  const rawPower = power as unknown as Record<string, unknown>;
  const rawDescriptorChassisConfig =
    power.descriptorChassisConfig && typeof power.descriptorChassisConfig === "object" && !Array.isArray(power.descriptorChassisConfig)
      ? (power.descriptorChassisConfig as Record<string, unknown>)
      : {};
  const rangeCategories = power.rangeCategories.map((row) => row.rangeCategory);
  const baseRangeDetails = {
    rangeCategory: rangeCategories.includes("AOE")
      ? "AOE"
      : rangeCategories.includes("RANGED")
        ? "RANGED"
        : rangeCategories.includes("MELEE")
          ? "MELEE"
          : "SELF",
    rangeValue: rangeCategories.includes("AOE")
      ? power.aoeCenterRangeFeet ?? 0
      : rangeCategories.includes("RANGED")
        ? power.rangedDistanceFeet ?? 30
        : rangeCategories.includes("MELEE")
          ? power.meleeTargets ?? 1
          : null,
    rangeExtra: rangeCategories.includes("AOE")
      ? {
          count: power.aoeCount ?? 1,
          shape: power.aoeShape ?? "SPHERE",
          sphereRadiusFeet: power.aoeSphereRadiusFeet ?? undefined,
          coneLengthFeet: power.aoeConeLengthFeet ?? undefined,
          lineWidthFeet: power.aoeLineWidthFeet ?? undefined,
          lineLengthFeet: power.aoeLineLengthFeet ?? undefined,
        }
      : rangeCategories.includes("RANGED")
        ? {
            targets: power.rangedTargets ?? 1,
          }
        : {},
  };
  return {
    id: power.id,
    sortOrder: power.sortOrder,
    name: power.name,
    description: power.description,
    schemaVersion: power.schemaVersion,
    rulesVersion: power.rulesVersion,
    contentRevision: power.contentRevision,
    previewRendererVersion: power.previewRendererVersion,
    status: power.status,
    descriptorChassis: normalizeDescriptorChassis(power.descriptorChassis),
    descriptorChassisConfig: sanitizeDescriptorChassisConfig(power.descriptorChassisConfig) as Record<
      string,
      unknown
    >,
    chargeType: normalizeChargeType((power as { chargeType?: unknown }).chargeType ?? rawDescriptorChassisConfig.chargeType),
    chargeTurns:
      typeof (power as { chargeTurns?: unknown }).chargeTurns === "number"
        ? ((power as { chargeTurns?: number }).chargeTurns ?? null)
        : typeof rawDescriptorChassisConfig.chargeTurns === "number"
          ? (rawDescriptorChassisConfig.chargeTurns as number)
          : null,
    chargeBonusDicePerTurn:
      typeof (power as { chargeBonusDicePerTurn?: unknown }).chargeBonusDicePerTurn === "number"
        ? ((power as { chargeBonusDicePerTurn?: number }).chargeBonusDicePerTurn ?? null)
        : typeof rawDescriptorChassisConfig.chargeBonusDicePerTurn === "number"
          ? (rawDescriptorChassisConfig.chargeBonusDicePerTurn as number)
          : null,
    cooldownTurns: power.cooldownTurns,
    cooldownReduction: power.cooldownReduction,
    counterMode: readCounterMode(rawPower),
    commitmentModifier: readCommitmentModifier(rawPower),
    triggerMethod: normalizeTriggerMethod(
      (power as { triggerMethod?: unknown }).triggerMethod ?? rawDescriptorChassisConfig.triggerMethod,
    ),
    attachedHostAnchorType:
      normalizeAttachedHostAnchorType(
        (power as { attachedHostAnchorType?: unknown }).attachedHostAnchorType,
      ) ?? readLegacyAttachedHostAnchorType(rawDescriptorChassisConfig),
    lifespanType: power.lifespanType,
    lifespanTurns: power.lifespanTurns,
    previewSummaryOverride: power.previewSummaryOverride,
    rangeCategories,
    meleeTargets: power.meleeTargets,
    rangedTargets: power.rangedTargets,
    rangedDistanceFeet: power.rangedDistanceFeet,
    aoeCenterRangeFeet: power.aoeCenterRangeFeet,
    aoeCount: power.aoeCount,
    aoeShape: power.aoeShape,
    aoeSphereRadiusFeet: power.aoeSphereRadiusFeet,
    aoeConeLengthFeet: power.aoeConeLengthFeet,
    aoeLineWidthFeet: power.aoeLineWidthFeet,
    aoeLineLengthFeet: power.aoeLineLengthFeet,
    primaryDefenceGate: power.primaryDefenceGate
      ? {
          sourcePacketIndex: power.primaryDefenceGate.sourcePacketIndex,
          gateResult: power.primaryDefenceGate.gateResult,
          protectionChannel: power.primaryDefenceGate.protectionChannel,
          resistAttribute: power.primaryDefenceGate.resistAttribute,
          hostileEntryPattern: power.primaryDefenceGate.hostileEntryPattern,
          resolutionSource: power.primaryDefenceGate.resolutionSource,
        }
      : null,
    effectPackets: power.effectPackets.map((effectPacket) => {
      const rawDetails =
        effectPacket.detailsJson && typeof effectPacket.detailsJson === "object" && !Array.isArray(effectPacket.detailsJson)
          ? (effectPacket.detailsJson as Record<string, unknown>)
          : {};
      return {
        id: effectPacket.id,
        packetIndex: effectPacket.packetIndex,
        sortOrder: effectPacket.packetIndex,
        hostility: effectPacket.hostility,
        intention: effectPacket.intention,
        type: effectPacket.intention,
        specific: effectPacket.specific,
        diceCount: effectPacket.diceCount,
        potency: effectPacket.potency,
        effectTimingType: effectPacket.effectTimingType,
        effectTimingTurns: effectPacket.effectTimingTurns,
        effectDurationType: effectPacket.effectDurationType,
        effectDurationTurns: effectPacket.effectDurationTurns,
        dealsWounds: effectPacket.dealsWounds,
        woundChannel: effectPacket.woundChannel,
        targetedAttribute: effectPacket.targetedAttribute,
        applicationModeKey: effectPacket.applicationModeKey,
        resolutionOrigin: effectPacket.resolutionOrigin,
        applyTo: normalizeEffectPacketApplyTo(
          (effectPacket as { applyTo?: unknown }).applyTo ?? rawDetails.applyTo,
        ) ?? "PRIMARY_TARGET",
        triggerConditionText: readPacketTriggerConditionText(
          effectPacket as unknown as Pick<Power["effectPackets"][number], "triggerConditionText" | "detailsJson">,
        ),
        detailsJson:
          effectPacket.packetIndex === 0
            ? {
                ...(sanitizeEffectPacketDetails(rawDetails) as Record<string, unknown>),
                ...baseRangeDetails,
              }
            : ((sanitizeEffectPacketDetails(rawDetails) as Record<string, unknown>) ?? {}),
        localTargetingOverride: effectPacket.localTargetingOverride
          ? {
              meleeTargets: effectPacket.localTargetingOverride.meleeTargets,
              rangedTargets: effectPacket.localTargetingOverride.rangedTargets,
              rangedDistanceFeet: effectPacket.localTargetingOverride.rangedDistanceFeet,
              aoeCenterRangeFeet: effectPacket.localTargetingOverride.aoeCenterRangeFeet,
              aoeCount: effectPacket.localTargetingOverride.aoeCount,
              aoeShape: effectPacket.localTargetingOverride.aoeShape,
              aoeSphereRadiusFeet: effectPacket.localTargetingOverride.aoeSphereRadiusFeet,
              aoeConeLengthFeet: effectPacket.localTargetingOverride.aoeConeLengthFeet,
              aoeLineWidthFeet: effectPacket.localTargetingOverride.aoeLineWidthFeet,
              aoeLineLengthFeet: effectPacket.localTargetingOverride.aoeLineLengthFeet,
            }
          : null,
      };
    }),
    intentions: power.effectPackets.map((effectPacket) => {
      const rawDetails =
        effectPacket.detailsJson && typeof effectPacket.detailsJson === "object" && !Array.isArray(effectPacket.detailsJson)
          ? (effectPacket.detailsJson as Record<string, unknown>)
          : {};
      return {
        id: effectPacket.id,
        packetIndex: effectPacket.packetIndex,
        sortOrder: effectPacket.packetIndex,
        hostility: effectPacket.hostility,
        intention: effectPacket.intention,
        type: effectPacket.intention,
        specific: effectPacket.specific,
        diceCount: effectPacket.diceCount,
        potency: effectPacket.potency,
        effectTimingType: effectPacket.effectTimingType,
        effectTimingTurns: effectPacket.effectTimingTurns,
        effectDurationType: effectPacket.effectDurationType,
        effectDurationTurns: effectPacket.effectDurationTurns,
        dealsWounds: effectPacket.dealsWounds,
        woundChannel: effectPacket.woundChannel,
        targetedAttribute: effectPacket.targetedAttribute,
        applicationModeKey: effectPacket.applicationModeKey,
        resolutionOrigin: effectPacket.resolutionOrigin,
        applyTo: normalizeEffectPacketApplyTo(
          (effectPacket as { applyTo?: unknown }).applyTo ?? rawDetails.applyTo,
        ) ?? "PRIMARY_TARGET",
        triggerConditionText: readPacketTriggerConditionText(
          effectPacket as unknown as Pick<Power["effectPackets"][number], "triggerConditionText" | "detailsJson">,
        ),
        detailsJson:
          effectPacket.packetIndex === 0
            ? {
                ...(sanitizeEffectPacketDetails(rawDetails) as Record<string, unknown>),
                ...baseRangeDetails,
              }
            : ((sanitizeEffectPacketDetails(rawDetails) as Record<string, unknown>) ?? {}),
        localTargetingOverride: effectPacket.localTargetingOverride
          ? {
              meleeTargets: effectPacket.localTargetingOverride.meleeTargets,
              rangedTargets: effectPacket.localTargetingOverride.rangedTargets,
              rangedDistanceFeet: effectPacket.localTargetingOverride.rangedDistanceFeet,
              aoeCenterRangeFeet: effectPacket.localTargetingOverride.aoeCenterRangeFeet,
              aoeCount: effectPacket.localTargetingOverride.aoeCount,
              aoeShape: effectPacket.localTargetingOverride.aoeShape,
              aoeSphereRadiusFeet: effectPacket.localTargetingOverride.aoeSphereRadiusFeet,
              aoeConeLengthFeet: effectPacket.localTargetingOverride.aoeConeLengthFeet,
              aoeLineWidthFeet: effectPacket.localTargetingOverride.aoeLineWidthFeet,
              aoeLineLengthFeet: effectPacket.localTargetingOverride.aoeLineLengthFeet,
            }
          : null,
      };
    }),
    diceCount: power.effectPackets[0]?.diceCount ?? 1,
    potency: power.effectPackets[0]?.potency ?? 1,
    effectDurationType: (power.effectPackets[0]?.effectDurationType ?? "INSTANT") as Power["effectDurationType"],
    effectDurationTurns:
      power.effectPackets[0]?.effectDurationType === "TURNS"
        ? (power.effectPackets[0]?.effectDurationTurns ?? 1)
        : null,
    durationType: (power.effectPackets[0]?.effectDurationType ?? "INSTANT") as Power["effectDurationType"],
    durationTurns:
      power.effectPackets[0]?.effectDurationType === "TURNS"
        ? (power.effectPackets[0]?.effectDurationTurns ?? 1)
        : null,
    defenceRequirement: power.primaryDefenceGate?.gateResult ?? "NONE",
  };
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  try {
    const userId = await requireUserId();
    await requireCampaignDirectorOrAdmin(campaignId, userId);

    const source = await prisma.monster.findFirst({
      where: {
        id,
        OR: [{ source: "CORE" }, { source: "CAMPAIGN", campaignId }],
      },
      include: MONSTER_INCLUDE,
    });

    if (!source) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const sourceAttacks = normalizedSourceAttacks(source);
    const equipmentItemsById = await loadEquipmentItemsById(campaignId, [
      source.mainHandItemId,
      source.offHandItemId,
      source.smallItemId,
    ]);
    const sourceCapError = validateWeaponSourceCap(
      sourceAttacks,
      {
        mainHandItemId: source.mainHandItemId,
        offHandItemId: source.offHandItemId,
        smallItemId: source.smallItemId,
        weaponSkillValue: source.weaponSkillValue,
      },
      equipmentItemsById,
    );
    if (sourceCapError) {
      return NextResponse.json({ error: sourceCapError }, { status: 400 });
    }
    const naturalAttack = sourceAttacks[0]
      ? {
          attackName: sourceAttacks[0].attackName ?? "Natural Weapon",
          attackConfig: (sourceAttacks[0].attackConfig ?? {}) as Prisma.InputJsonValue,
        }
      : null;

    const created = await prisma.monster.create({
      data: {
        name: `${source.name} (Copy)`,
        imageUrl: source.imageUrl,
        imagePosX: source.imagePosX,
        imagePosY: source.imagePosY,
        level: source.level,
        tier: source.tier,
        legendary: source.legendary,
        source: "CAMPAIGN",
        isReadOnly: false,
        Campaign: {
          connect: { id: campaignId },
        },
        attackMode: "NATURAL_WEAPON",
        equippedWeaponId: null,
        mainHandItemId: source.mainHandItemId,
        offHandItemId: source.offHandItemId,
        smallItemId: source.smallItemId,
        headArmorItemId: source.headArmorItemId,
        shoulderArmorItemId: source.shoulderArmorItemId,
        torsoArmorItemId: source.torsoArmorItemId,
        legsArmorItemId: source.legsArmorItemId,
        feetArmorItemId: source.feetArmorItemId,
        headItemId: source.headItemId,
        neckItemId: source.neckItemId,
        armsItemId: source.armsItemId,
        beltItemId: source.beltItemId,
        customNotes: source.customNotes,
        limitBreakName: source.limitBreakName,
        limitBreakTier: source.limitBreakTier,
        limitBreakTriggerText: source.limitBreakTriggerText,
        limitBreakAttribute: source.limitBreakAttribute,
        limitBreakThresholdSuccesses: source.limitBreakThresholdSuccesses,
        limitBreakCostText: source.limitBreakCostText,
        limitBreakEffectText: source.limitBreakEffectText,
        physicalResilienceCurrent: source.physicalResilienceCurrent,
        physicalResilienceMax: source.physicalResilienceMax,
        mentalPerseveranceCurrent: source.mentalPerseveranceCurrent,
        mentalPerseveranceMax: source.mentalPerseveranceMax,
        physicalProtection: source.physicalProtection,
        mentalProtection: source.mentalProtection,
        attackDie: source.attackDie,
        attackResistDie: source.attackResistDie,
        attackModifier: source.attackModifier,
        defenceDie: source.defenceDie,
        defenceResistDie: source.defenceResistDie,
        defenceModifier: source.defenceModifier,
        fortitudeDie: source.fortitudeDie,
        fortitudeResistDie: source.fortitudeResistDie,
        fortitudeModifier: source.fortitudeModifier,
        intellectDie: source.intellectDie,
        intellectResistDie: source.intellectResistDie,
        intellectModifier: source.intellectModifier,
        supportDie: source.supportDie,
        supportResistDie: source.supportResistDie,
        supportModifier: source.supportModifier,
        braveryDie: source.braveryDie,
        braveryResistDie: source.braveryResistDie,
        braveryModifier: source.braveryModifier,
        weaponSkillValue: source.weaponSkillValue,
        weaponSkillModifier: source.weaponSkillModifier,
        armorSkillValue: source.armorSkillValue,
        armorSkillModifier: source.armorSkillModifier,
        tags: {
          create: source.tags.map((tag) => ({ tag: tag.tag })),
        },
        traits: {
          create: source.traits.map((trait) => ({
            sortOrder: trait.sortOrder,
            traitDefinitionId: trait.traitDefinitionId,
          })),
        },
        attacks: {
          create: sourceAttacks.map((attack) => ({
            sortOrder: attack.sortOrder,
            attackMode: "NATURAL",
            attackName: attack.attackName ?? "Natural Weapon",
            attackConfig: attack.attackConfig as Prisma.InputJsonValue,
            equippedWeaponId: null,
          })),
        },
        naturalAttack: naturalAttack
          ? {
              create: {
                attackName: naturalAttack.attackName,
                attackConfig: naturalAttack.attackConfig,
              },
            }
          : undefined,
        powers: {
          create: source.powers.map((power) => buildPowerCreateData(serializePower(power))),
        },
      },
      include: MONSTER_INCLUDE,
    });

    return NextResponse.json({
      ...created,
      powers: created.powers.map(serializePower),
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to copy monster";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[SUMMONING_MONSTER_COPY]", error);
    return NextResponse.json({ error: "Failed to copy monster" }, { status: 500 });
  }
}
