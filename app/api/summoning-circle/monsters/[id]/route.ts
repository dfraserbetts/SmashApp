import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { Prisma, type EffectDurationType } from "@prisma/client";
import {
  isTwoHanded,
  isValidArmorItemForSlot,
  isValidHandItemForSlot,
  isValidItemAccessorySlot,
  type SummoningEquipmentItem,
} from "@/lib/summoning/equipment";
import { renderAttackActionLines } from "@/lib/summoning/render";
import type { MonsterNaturalAttackConfig, MonsterUpsertInput, Power } from "@/lib/summoning/types";
import { requireCampaignAccess, requireCampaignDirectorOrAdmin, requireUserId } from "../../_shared";
import { normalizeMonsterUpsertInput } from "@/lib/summoning/validation";

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

function getInternalErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta ? ` ${JSON.stringify(error.meta)}` : "";
    return `${fallback} (${error.code})${meta}`;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return `${fallback}: ${error.message}`;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}

type EquipmentItemsById = Map<string, SummoningEquipmentItem>;

async function validateCoreTraitDefinitions(
  traits: MonsterUpsertInput["traits"],
): Promise<string | null> {
  if (traits.length === 0) return null;
  const ids = Array.from(new Set(traits.map((trait) => trait.traitDefinitionId)));
  const rows = await prisma.monsterTraitDefinition.findMany({
    where: {
      id: { in: ids },
      source: "CORE",
      isEnabled: true,
    },
    select: { id: true },
  });
  if (rows.length !== ids.length) {
    return "One or more selected traits are invalid or disabled";
  }
  return null;
}

async function loadEquipmentItemsById(
  campaignId: string,
  data: Pick<
    MonsterUpsertInput,
    | "mainHandItemId"
    | "offHandItemId"
    | "smallItemId"
    | "headArmorItemId"
    | "shoulderArmorItemId"
    | "torsoArmorItemId"
    | "legsArmorItemId"
    | "feetArmorItemId"
    | "headItemId"
    | "neckItemId"
    | "armsItemId"
    | "beltItemId"
  >,
): Promise<EquipmentItemsById> {
  const ids = Array.from(
    new Set(
      [
        data.mainHandItemId,
        data.offHandItemId,
        data.smallItemId,
        data.headArmorItemId,
        data.shoulderArmorItemId,
        data.torsoArmorItemId,
        data.legsArmorItemId,
        data.feetArmorItemId,
        data.headItemId,
        data.neckItemId,
        data.armsItemId,
        data.beltItemId,
      ].filter(Boolean) as string[],
    ),
  );

  if (ids.length === 0) return new Map();

  const rows = await prisma.itemTemplate.findMany({
    where: {
      campaignId,
      id: { in: ids },
      type: { in: ["WEAPON", "SHIELD", "ARMOR", "ITEM"] },
    },
    select: {
      id: true,
      name: true,
      type: true,
      size: true,
      armorLocation: true,
      itemLocation: true,
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
        itemLocation: row.itemLocation,
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
  data: Pick<
    MonsterUpsertInput,
    "mainHandItemId" | "offHandItemId" | "smallItemId" | "attacks" | "weaponSkillValue"
  >,
  itemsById: EquipmentItemsById,
): string | null {
  const handIds = [data.mainHandItemId, data.offHandItemId, data.smallItemId];
  let equippedWeaponSourceCount = 0;
  for (const itemId of handIds) {
    if (!itemId) continue;
    const item = itemsById.get(itemId) ?? null;
    if (getWeaponSourceAttackLines(item, data.weaponSkillValue).length > 0) {
      equippedWeaponSourceCount += 1;
    }
  }
  const totalWeaponSources = equippedWeaponSourceCount + data.attacks.length;
  if (totalWeaponSources > WEAPON_SOURCE_CAP) {
    return WEAPON_SOURCE_CAP_ERROR;
  }
  return null;
}

function validateEquipmentSlots(
  data: Pick<
    MonsterUpsertInput,
    | "mainHandItemId"
    | "offHandItemId"
    | "smallItemId"
    | "headArmorItemId"
    | "shoulderArmorItemId"
    | "torsoArmorItemId"
    | "legsArmorItemId"
    | "feetArmorItemId"
    | "headItemId"
    | "neckItemId"
    | "armsItemId"
    | "beltItemId"
  >,
  itemsById: EquipmentItemsById,
): string | null {
  const main = data.mainHandItemId ? itemsById.get(data.mainHandItemId) ?? null : null;
  const off = data.offHandItemId ? itemsById.get(data.offHandItemId) ?? null : null;
  const small = data.smallItemId ? itemsById.get(data.smallItemId) ?? null : null;
  const headArmor = data.headArmorItemId ? itemsById.get(data.headArmorItemId) ?? null : null;
  const shoulderArmor = data.shoulderArmorItemId ? itemsById.get(data.shoulderArmorItemId) ?? null : null;
  const torsoArmor = data.torsoArmorItemId ? itemsById.get(data.torsoArmorItemId) ?? null : null;
  const legsArmor = data.legsArmorItemId ? itemsById.get(data.legsArmorItemId) ?? null : null;
  const feetArmor = data.feetArmorItemId ? itemsById.get(data.feetArmorItemId) ?? null : null;
  const head = data.headItemId ? itemsById.get(data.headItemId) ?? null : null;
  const neck = data.neckItemId ? itemsById.get(data.neckItemId) ?? null : null;
  const arms = data.armsItemId ? itemsById.get(data.armsItemId) ?? null : null;
  const belt = data.beltItemId ? itemsById.get(data.beltItemId) ?? null : null;

  if (data.mainHandItemId && !main) return "Invalid mainHandItemId for campaign";
  if (data.offHandItemId && !off) return "Invalid offHandItemId for campaign";
  if (data.smallItemId && !small) return "Invalid smallItemId for campaign";
  if (data.headArmorItemId && !headArmor) return "Invalid headArmorItemId for campaign";
  if (data.shoulderArmorItemId && !shoulderArmor) return "Invalid shoulderArmorItemId for campaign";
  if (data.torsoArmorItemId && !torsoArmor) return "Invalid torsoArmorItemId for campaign";
  if (data.legsArmorItemId && !legsArmor) return "Invalid legsArmorItemId for campaign";
  if (data.feetArmorItemId && !feetArmor) return "Invalid feetArmorItemId for campaign";
  if (data.headItemId && !head) return "Invalid headItemId for campaign";
  if (data.neckItemId && !neck) return "Invalid neckItemId for campaign";
  if (data.armsItemId && !arms) return "Invalid armsItemId for campaign";
  if (data.beltItemId && !belt) return "Invalid beltItemId for campaign";

  if (main && !isValidHandItemForSlot("mainHandItemId", main)) {
    return "Main Hand item must be one-handed or two-handed weapon/shield";
  }
  if (off && !isValidHandItemForSlot("offHandItemId", off)) {
    return "Off Hand item must be one-handed weapon/shield";
  }
  if (small && !isValidHandItemForSlot("smallItemId", small)) {
    return "Small Slot item must be small weapon/shield";
  }
  if (isTwoHanded(main) && off) {
    return "Off Hand cannot be equipped while Main Hand has a two-handed item";
  }

  if (headArmor && !isValidArmorItemForSlot("headArmorItemId", headArmor)) {
    return "Head Armor slot item must have HEAD armor location";
  }
  if (shoulderArmor && !isValidArmorItemForSlot("shoulderArmorItemId", shoulderArmor)) {
    return "Shoulder Armor slot item must have SHOULDERS armor location";
  }
  if (torsoArmor && !isValidArmorItemForSlot("torsoArmorItemId", torsoArmor)) {
    return "Torso Armor slot item must have TORSO armor location";
  }
  if (legsArmor && !isValidArmorItemForSlot("legsArmorItemId", legsArmor)) {
    return "Legs Armor slot item must have LEGS armor location";
  }
  if (feetArmor && !isValidArmorItemForSlot("feetArmorItemId", feetArmor)) {
    return "Feet Armor slot item must have FEET armor location";
  }
  if (head && !isValidItemAccessorySlot("headItemId", head)) {
    return "Head Item slot item must have HEAD item location";
  }
  if (neck && !isValidItemAccessorySlot("neckItemId", neck)) {
    return "Neck Item slot item must have NECK item location";
  }
  if (arms && !isValidItemAccessorySlot("armsItemId", arms)) {
    return "Arms Item slot item must have ARMS item location";
  }
  if (belt && !isValidItemAccessorySlot("beltItemId", belt)) {
    return "Belt Item slot item must have BELT item location";
  }

  return null;
}

function toNaturalAttackField(
  attacks: Array<{
    sortOrder: number;
    attackName: string | null;
    attackConfig: unknown;
  }>,
) {
  const first = [...attacks].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (!first) {
    return null;
  }

  return {
    attackName: first.attackName ?? "Natural Weapon",
    attackConfig: (first.attackConfig ?? {}) as Prisma.InputJsonValue,
  };
}

type MonsterWithPowers = Prisma.MonsterGetPayload<{
  include: typeof MONSTER_INCLUDE;
}>;

function getPowerRangeCategory(power: Pick<
  Power,
  | "rangeCategories"
  | "meleeTargets"
  | "rangedTargets"
  | "rangedDistanceFeet"
  | "aoeCenterRangeFeet"
  | "aoeCount"
  | "aoeShape"
  | "aoeSphereRadiusFeet"
  | "aoeConeLengthFeet"
  | "aoeLineWidthFeet"
  | "aoeLineLengthFeet"
>): "SELF" | "MELEE" | "RANGED" | "AOE" {
  if (power.rangeCategories?.includes("AOE")) return "AOE";
  if (power.rangeCategories?.includes("RANGED")) return "RANGED";
  if (power.rangeCategories?.includes("MELEE")) return "MELEE";
  return "SELF";
}

function buildPrimaryPacketRangeDetails(power: Pick<
  Power,
  | "rangeCategories"
  | "meleeTargets"
  | "rangedTargets"
  | "rangedDistanceFeet"
  | "aoeCenterRangeFeet"
  | "aoeCount"
  | "aoeShape"
  | "aoeSphereRadiusFeet"
  | "aoeConeLengthFeet"
  | "aoeLineWidthFeet"
  | "aoeLineLengthFeet"
>): Record<string, unknown> {
  const rangeCategory = getPowerRangeCategory(power);
  if (rangeCategory === "SELF") {
    return {
      rangeCategory: "SELF",
      rangeValue: null,
      rangeExtra: {},
    };
  }
  if (rangeCategory === "MELEE") {
    return {
      rangeCategory: "MELEE",
      rangeValue: power.meleeTargets ?? 1,
      rangeExtra: {},
    };
  }
  if (rangeCategory === "RANGED") {
    return {
      rangeCategory: "RANGED",
      rangeValue: power.rangedDistanceFeet ?? 30,
      rangeExtra: {
        targets: power.rangedTargets ?? 1,
      },
    };
  }
  return {
    rangeCategory: "AOE",
    rangeValue: power.aoeCenterRangeFeet ?? 0,
    rangeExtra: {
      count: power.aoeCount ?? 1,
      shape: power.aoeShape ?? "SPHERE",
      sphereRadiusFeet: power.aoeSphereRadiusFeet ?? undefined,
      coneLengthFeet: power.aoeConeLengthFeet ?? undefined,
      lineWidthFeet: power.aoeLineWidthFeet ?? undefined,
      lineLengthFeet: power.aoeLineLengthFeet ?? undefined,
    },
  };
}

function buildPowerRangeCategories(power: Power): Array<"MELEE" | "RANGED" | "AOE"> {
  const effectPackets = Array.isArray(power.effectPackets)
    ? power.effectPackets
    : Array.isArray(power.intentions)
      ? power.intentions
      : [];
  const explicit = (power.rangeCategories ?? []).filter(
    (category): category is "MELEE" | "RANGED" | "AOE" =>
      category === "MELEE" || category === "RANGED" || category === "AOE",
  );
  if (explicit.length > 0) return explicit;

  const primaryDetails = (effectPackets[0]?.detailsJson ?? {}) as Record<string, unknown>;
  const rangeCategory = String(primaryDetails.rangeCategory ?? "").trim().toUpperCase();
  if (rangeCategory === "MELEE" || rangeCategory === "RANGED" || rangeCategory === "AOE") {
    return [rangeCategory];
  }
  return [];
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
    descriptorChassisConfig: (power.descriptorChassisConfig ?? {}) as Prisma.InputJsonValue,
    counterMode: power.counterMode ?? "NO",
    commitmentModifier: power.commitmentModifier ?? "STANDARD",
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
      create: effectPackets.map((effectPacket, packetIndex) => ({
        packetIndex: effectPacket.packetIndex ?? effectPacket.sortOrder ?? packetIndex,
        hostility: effectPacket.hostility ?? "NON_HOSTILE",
        intention: effectPacket.intention ?? effectPacket.type ?? "ATTACK",
        specific: effectPacket.specific ?? null,
        diceCount: effectPacket.diceCount ?? power.diceCount,
        potency: effectPacket.potency ?? power.potency,
        effectTimingType: effectPacket.effectTimingType ?? "ON_CAST",
        effectTimingTurns: effectPacket.effectTimingTurns ?? null,
        effectDurationType: (effectPacket.effectDurationType ?? effectDurationType) as EffectDurationType,
        effectDurationTurns:
          (effectPacket.effectDurationType ?? effectDurationType) === "TURNS"
            ? (effectPacket.effectDurationTurns ?? power.effectDurationTurns ?? power.durationTurns ?? null)
            : null,
        dealsWounds: effectPacket.dealsWounds ?? false,
        woundChannel: effectPacket.woundChannel ?? null,
        targetedAttribute: effectPacket.targetedAttribute ?? null,
        applicationModeKey: effectPacket.applicationModeKey ?? null,
        resolutionOrigin: effectPacket.resolutionOrigin ?? "CASTER",
        detailsJson: effectPacket.detailsJson as Prisma.InputJsonValue,
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
      })),
    },
  };
}

function serializePower(
  power: MonsterWithPowers["powers"][number],
): Power {
  const rawPower = power as unknown as Record<string, unknown>;
  const primaryPacket = power.effectPackets[0];
  const effectDurationType = (primaryPacket?.effectDurationType ?? "INSTANT") as Power["effectDurationType"];
  const effectDurationTurns =
    effectDurationType === "TURNS" ? (primaryPacket?.effectDurationTurns ?? 1) : null;
  const baseRangeDetails = buildPrimaryPacketRangeDetails({
    rangeCategories: power.rangeCategories.map((row) => row.rangeCategory),
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
  });

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
    descriptorChassisConfig:
      power.descriptorChassisConfig && typeof power.descriptorChassisConfig === "object"
        ? (power.descriptorChassisConfig as Record<string, unknown>)
        : {},
    cooldownTurns: power.cooldownTurns,
    cooldownReduction: power.cooldownReduction,
    counterMode: readCounterMode(rawPower),
    commitmentModifier: readCommitmentModifier(rawPower),
    lifespanType: power.lifespanType,
    lifespanTurns: power.lifespanTurns,
    previewSummaryOverride: power.previewSummaryOverride,
    rangeCategories: power.rangeCategories.map((row) => row.rangeCategory),
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
    effectPackets: power.effectPackets.map((effectPacket) => ({
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
      detailsJson:
        effectPacket.packetIndex === 0
          ? { ...(effectPacket.detailsJson as Record<string, unknown>), ...baseRangeDetails }
          : ((effectPacket.detailsJson as Record<string, unknown>) ?? {}),
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
    })),
    intentions: power.effectPackets.map((effectPacket) => ({
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
      detailsJson:
        effectPacket.packetIndex === 0
          ? { ...(effectPacket.detailsJson as Record<string, unknown>), ...baseRangeDetails }
          : ((effectPacket.detailsJson as Record<string, unknown>) ?? {}),
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
    })),
    diceCount: primaryPacket?.diceCount ?? 1,
    potency: primaryPacket?.potency ?? 1,
    effectDurationType,
    effectDurationTurns,
    durationType: effectDurationType,
    durationTurns: effectDurationTurns,
    defenceRequirement: power.primaryDefenceGate?.gateResult ?? "NONE",
  };
}

function serializeMonster(monster: MonsterWithPowers) {
  return {
    ...monster,
    powers: monster.powers.map(serializePower),
  };
}

export async function GET(
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
    await requireCampaignAccess(campaignId, userId);

    const monster = await prisma.monster.findFirst({
      where: {
        id,
        OR: [{ source: "CORE" }, { source: "CAMPAIGN", campaignId }],
      },
      include: MONSTER_INCLUDE,
    });

    if (!monster) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(serializeMonster(monster));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load monster";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[SUMMONING_MONSTER_GET]", error);
    const debugMessage = getInternalErrorMessage(error, "Failed to load monster");
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Failed to load monster" : debugMessage },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = normalizeMonsterUpsertInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const userId = await requireUserId();
    await requireCampaignDirectorOrAdmin(campaignId, userId);

    const existing = await prisma.monster.findUnique({
      where: { id },
      select: {
        id: true,
        source: true,
        isReadOnly: true,
        campaignId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.source === "CORE" || existing.isReadOnly) {
      return NextResponse.json({ error: "Core monsters are read-only; copy first" }, { status: 403 });
    }

    if (existing.campaignId !== campaignId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = parsed.data;
    const traitError = await validateCoreTraitDefinitions(data.traits);
    if (traitError) {
      return NextResponse.json({ error: traitError }, { status: 400 });
    }

    if (data.attacks.length > 3) {
      return NextResponse.json({ error: "A monster can have at most 3 attacks" }, { status: 400 });
    }
    const equipmentItemsById = await loadEquipmentItemsById(campaignId, data);
    const equipmentError = validateEquipmentSlots(data, equipmentItemsById);
    if (equipmentError) {
      return NextResponse.json({ error: equipmentError }, { status: 400 });
    }
    const weaponSourceError = validateWeaponSourceCap(data, equipmentItemsById);
    if (weaponSourceError) {
      return NextResponse.json({ error: weaponSourceError }, { status: 400 });
    }
    const naturalAttack = toNaturalAttackField(data.attacks);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.monster.update({
        where: { id },
        data: {
          name: data.name,
          imageUrl: data.imageUrl,
          imagePosX: data.imagePosX,
          imagePosY: data.imagePosY,
          level: data.level,
          tier: data.tier,
          legendary: data.legendary,
          attackMode: "NATURAL_WEAPON",
          equippedWeaponId: null,
          // SC_SEPARATE_ARMOR_AND_ITEM_PERSIST_V2
          mainHandItemId: data.mainHandItemId,
          offHandItemId: data.offHandItemId,
          smallItemId: data.smallItemId,
          headArmorItemId: data.headArmorItemId,
          shoulderArmorItemId: data.shoulderArmorItemId,
          torsoArmorItemId: data.torsoArmorItemId,
          legsArmorItemId: data.legsArmorItemId,
          feetArmorItemId: data.feetArmorItemId,
          headItemId: data.headItemId,
          neckItemId: data.neckItemId,
          armsItemId: data.armsItemId,
          beltItemId: data.beltItemId,
          customNotes: data.customNotes,
          limitBreakName: data.limitBreakName,
          limitBreakTier: data.limitBreakTier,
          limitBreakTriggerText: data.limitBreakTriggerText,
          limitBreakAttribute: data.limitBreakAttribute,
          limitBreakThresholdSuccesses: data.limitBreakThresholdSuccesses,
          limitBreakCostText: data.limitBreakCostText,
          limitBreakEffectText: data.limitBreakEffectText,
          limitBreak2Name: data.limitBreak2Name,
          limitBreak2Tier: data.limitBreak2Tier,
          limitBreak2TriggerText: data.limitBreak2TriggerText,
          limitBreak2Attribute: data.limitBreak2Attribute,
          limitBreak2ThresholdSuccesses: data.limitBreak2ThresholdSuccesses,
          limitBreak2CostText: data.limitBreak2CostText,
          limitBreak2EffectText: data.limitBreak2EffectText,
          physicalResilienceCurrent: data.physicalResilienceCurrent,
          physicalResilienceMax: data.physicalResilienceMax,
          mentalPerseveranceCurrent: data.mentalPerseveranceCurrent,
          mentalPerseveranceMax: data.mentalPerseveranceMax,
          physicalProtection: data.physicalProtection,
          mentalProtection: data.mentalProtection,
          naturalPhysicalProtection: data.naturalPhysicalProtection,
          naturalMentalProtection: data.naturalMentalProtection,
          attackDie: data.attackDie,
          attackResistDie: data.attackResistDie,
          attackModifier: data.attackModifier,
          defenceDie: data.defenceDie,
          defenceResistDie: data.defenceResistDie,
          defenceModifier: data.defenceModifier,
          fortitudeDie: data.fortitudeDie,
          fortitudeResistDie: data.fortitudeResistDie,
          fortitudeModifier: data.fortitudeModifier,
          intellectDie: data.intellectDie,
          intellectResistDie: data.intellectResistDie,
          intellectModifier: data.intellectModifier,
          supportDie: data.supportDie,
          supportResistDie: data.supportResistDie,
          supportModifier: data.supportModifier,
          braveryDie: data.braveryDie,
          braveryResistDie: data.braveryResistDie,
          braveryModifier: data.braveryModifier,
          weaponSkillValue: data.weaponSkillValue,
          weaponSkillModifier: data.weaponSkillModifier,
          armorSkillValue: data.armorSkillValue,
          armorSkillModifier: data.armorSkillModifier,
        },
      });

      await tx.monsterTag.deleteMany({ where: { monsterId: id } });
      await tx.monsterTrait.deleteMany({ where: { monsterId: id } });
      await tx.power.deleteMany({ where: { monsterId: id } });
      await tx.monsterAttack.deleteMany({ where: { monsterId: id } });
      await tx.monsterNaturalAttack.deleteMany({ where: { monsterId: id } });

      if (data.tags.length > 0) {
        await tx.monsterTag.createMany({
          data: data.tags.map((tag) => ({ monsterId: id, tag })),
        });
      }

      if (data.traits.length > 0) {
        await tx.monsterTrait.createMany({
          data: data.traits.map((trait, index) => ({
            monsterId: id,
            sortOrder: index,
            traitDefinitionId: trait.traitDefinitionId,
          })),
        });
      }

      if (data.attacks.length > 0) {
        await tx.monsterAttack.createMany({
          data: data.attacks.map((attack) => ({
            monsterId: id,
            sortOrder: attack.sortOrder,
            attackMode: "NATURAL",
            attackName: attack.attackName ?? "Natural Weapon",
            attackConfig: attack.attackConfig as Prisma.InputJsonValue,
            equippedWeaponId: null,
          })),
        });
      }

      if (naturalAttack) {
        await tx.monsterNaturalAttack.create({
          data: {
            monsterId: id,
            attackName: naturalAttack.attackName,
            attackConfig: naturalAttack.attackConfig,
          },
        });
      }

      for (const power of data.powers) {
        await tx.power.create({
          data: {
            monsterId: id,
            ...buildPowerCreateData(power),
          },
        });
      }

      const fresh = await tx.monster.findUnique({
        where: { id },
        include: MONSTER_INCLUDE,
      });

      if (!fresh) throw new Error("Not found");
      return serializeMonster(fresh);
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update monster";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "Not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[SUMMONING_MONSTER_PUT]", error);
    const debugMessage = getInternalErrorMessage(error, "Failed to update monster");
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Failed to update monster" : debugMessage },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    const existing = await prisma.monster.findUnique({
      where: { id },
      select: { source: true, isReadOnly: true, campaignId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.source === "CORE" || existing.isReadOnly) {
      return NextResponse.json({ error: "Core monsters are read-only" }, { status: 403 });
    }
    if (existing.campaignId !== campaignId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.monster.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete monster";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[SUMMONING_MONSTER_DELETE]", error);
    return NextResponse.json({ error: "Failed to delete monster" }, { status: 500 });
  }
}
