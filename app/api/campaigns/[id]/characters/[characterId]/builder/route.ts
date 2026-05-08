import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireUserId } from "@/lib/auth/server";
import {
  getCampaignPermissions,
  requireCampaignAccess,
} from "@/lib/campaign/access";
import { getMemberIdentities, getMemberIdentityLabel } from "@/lib/campaign/memberIdentity";
import {
  cleanBuilderTraits,
  normalizeBuilderData,
  sanitizeBuilderEquipment,
  validateBuilderData,
  type PlayerTraitDefinition,
} from "@/lib/characterBuilder/core";
import { summarizeEquipmentItem } from "@/lib/characterBuilder/equipment";
import { prisma } from "@/prisma/client";

const DEFAULT_CHARACTER_NAME = "UNNAMED";

type BuilderPayload = {
  name?: unknown;
  imageUrl?: unknown;
  age?: unknown;
  race?: unknown;
  description?: unknown;
  level?: unknown;
  builderData?: unknown;
};

function toErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (message === "FORBIDDEN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (message === "NOT_FOUND") {
    return NextResponse.json({ error: "Campaign or character not found" }, { status: 404 });
  }
  console.error("[CHARACTER_BUILDER]", error);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

function normalizeDisplayName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return DEFAULT_CHARACTER_NAME;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_CHARACTER_NAME;
}

function normalizeOptionalString(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeAge(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) {
    throw new Error("INVALID_AGE");
  }
  return trimmed;
}

function normalizeLevel(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) return 1;
  return numeric;
}

async function loadBuilderContext(campaignId: string, characterId: string, userId: string) {
  const access = await requireCampaignAccess(campaignId, userId);
  const [campaign, character] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true },
    }),
    prisma.campaignCharacter.findFirst({
      where: { id: characterId, campaignId },
      select: {
        id: true,
        campaignId: true,
        name: true,
        imageUrl: true,
        age: true,
        race: true,
        description: true,
        level: true,
        builderData: true,
        assignedUserId: true,
        archivedAt: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  if (!campaign || !character) return null;

  const permissions = getCampaignPermissions(access);
  const isAssignedActivePlayer =
    character.assignedUserId === userId && character.archivedAt === null;
  const canManage = permissions.canManageCampaignCharacters;
  const canOpenBuilder = canManage || isAssignedActivePlayer;
  if (!canOpenBuilder) {
    throw new Error("FORBIDDEN");
  }

  const identities = character.assignedUserId
    ? await getMemberIdentities([character.assignedUserId])
    : new Map();
  const assignedIdentity = character.assignedUserId
    ? identities.get(character.assignedUserId)
    : undefined;

  const [traitCatalog, backpackItems] = await Promise.all([
    loadBuilderTraitCatalog(),
    loadBuilderBackpackItems(campaignId, characterId),
  ]);
  const builderData = sanitizeBuilderEquipment(
    cleanBuilderTraits(normalizeBuilderData(character.builderData), traitCatalog),
    backpackItems,
  );

  return {
    campaign,
    character: {
      ...character,
      builderData,
    },
    access: {
      userId,
      role: access.effectiveRole,
      isAdmin: access.isAdmin,
      isOwner: access.isOwner,
      permissions,
    },
    canEdit: canManage || isAssignedActivePlayer,
    assignedPlayerLabel: getMemberIdentityLabel(assignedIdentity),
    traitCatalog,
    backpackItems,
  };
}

async function loadBuilderTraitCatalog(): Promise<PlayerTraitDefinition[]> {
  const rows = await prisma.playerTrait.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      descriptor: true,
      classification: true,
      pointValue: true,
      isActive: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    descriptor: row.descriptor,
    classification: row.classification,
    pointValue: row.pointValue,
    isActive: row.isActive,
  }));
}

async function loadBuilderBackpackItems(campaignId: string, characterId: string) {
  const rows = await prisma.campaignCharacterBackpackItem.findMany({
    where: { campaignId, characterId },
    orderBy: { createdAt: "asc" },
    include: {
      partyInventoryItem: {
        include: {
          itemTemplate: {
            include: {
              meleeDamageTypes: { include: { damageType: true } },
              rangedDamageTypes: { include: { damageType: true } },
              aoeDamageTypes: { include: { damageType: true } },
              attackEffectsMelee: { include: { attackEffect: true } },
              attackEffectsRanged: { include: { attackEffect: true } },
              attackEffectsAoE: { include: { attackEffect: true } },
              weaponAttributes: { include: { weaponAttribute: true } },
              armorAttributes: { include: { armorAttribute: true } },
              shieldAttributes: { include: { shieldAttribute: true } },
              defEffects: { include: { defEffect: true } },
              wardingOptions: { include: { wardingOption: true } },
              sanctifiedOptions: { include: { sanctifiedOption: true } },
              vrpEntries: { include: { damageType: true } },
            },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const itemTemplate = row.partyInventoryItem.itemTemplate;
    const summary = summarizeEquipmentItem(itemTemplate);
    return {
      id: row.id,
      campaignId: row.campaignId,
      characterId: row.characterId,
      partyInventoryItemId: row.partyInventoryItemId,
      quantity: row.quantity,
      itemTemplate: {
        id: itemTemplate.id,
        name: itemTemplate.name,
        rarity: itemTemplate.rarity,
        level: itemTemplate.level,
        type: itemTemplate.type,
        size: itemTemplate.size,
        armorLocation: itemTemplate.armorLocation,
        itemLocation: itemTemplate.itemLocation,
        ppv: itemTemplate.ppv,
        mpv: itemTemplate.mpv,
        globalAttributeModifiers: itemTemplate.globalAttributeModifiers,
        meleeTargets: itemTemplate.meleeTargets,
        rangedTargets: itemTemplate.rangedTargets,
        rangedDistanceFeet: itemTemplate.rangedDistanceFeet,
        aoeCenterRangeFeet: itemTemplate.aoeCenterRangeFeet,
        aoeCount: itemTemplate.aoeCount,
        aoeShape: itemTemplate.aoeShape,
        aoeSphereRadiusFeet: itemTemplate.aoeSphereRadiusFeet,
        aoeConeLengthFeet: itemTemplate.aoeConeLengthFeet,
        aoeLineWidthFeet: itemTemplate.aoeLineWidthFeet,
        aoeLineLengthFeet: itemTemplate.aoeLineLengthFeet,
        physicalStrength: itemTemplate.physicalStrength,
        mentalStrength: itemTemplate.mentalStrength,
        meleePhysicalStrength: itemTemplate.meleePhysicalStrength,
        meleeMentalStrength: itemTemplate.meleeMentalStrength,
        rangedPhysicalStrength: itemTemplate.rangedPhysicalStrength,
        rangedMentalStrength: itemTemplate.rangedMentalStrength,
        aoePhysicalStrength: itemTemplate.aoePhysicalStrength,
        aoeMentalStrength: itemTemplate.aoeMentalStrength,
        meleeDamageTypes: itemTemplate.meleeDamageTypes.map((row) => ({
          name: row.damageType.name,
          mode: row.damageType.attackMode === "MENTAL" ? "MENTAL" : "PHYSICAL",
        })),
        rangedDamageTypes: itemTemplate.rangedDamageTypes.map((row) => ({
          name: row.damageType.name,
          mode: row.damageType.attackMode === "MENTAL" ? "MENTAL" : "PHYSICAL",
        })),
        aoeDamageTypes: itemTemplate.aoeDamageTypes.map((row) => ({
          name: row.damageType.name,
          mode: row.damageType.attackMode === "MENTAL" ? "MENTAL" : "PHYSICAL",
        })),
        attackEffectsMelee: itemTemplate.attackEffectsMelee.map(
          (row) => row.attackEffect.name,
        ),
        attackEffectsRanged: itemTemplate.attackEffectsRanged.map(
          (row) => row.attackEffect.name,
        ),
        attackEffectsAoE: itemTemplate.attackEffectsAoE.map((row) => row.attackEffect.name),
        generalDescription: itemTemplate.generalDescription,
        details: summary.details,
        descriptorSections: summary.descriptorSections,
        descriptorWarnings: summary.descriptorWarnings,
      },
    };
  });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; characterId: string }> },
) {
  try {
    const { id, characterId } = await context.params;
    const campaignId = String(id ?? "").trim();
    const targetCharacterId = String(characterId ?? "").trim();
    if (!campaignId || !targetCharacterId) {
      return NextResponse.json(
        { error: "Campaign id and character id are required" },
        { status: 400 },
      );
    }

    const userId = await requireUserId();
    const builderContext = await loadBuilderContext(campaignId, targetCharacterId, userId);
    if (!builderContext) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    return NextResponse.json(builderContext);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; characterId: string }> },
) {
  try {
    const { id, characterId } = await context.params;
    const campaignId = String(id ?? "").trim();
    const targetCharacterId = String(characterId ?? "").trim();
    if (!campaignId || !targetCharacterId) {
      return NextResponse.json(
        { error: "Campaign id and character id are required" },
        { status: 400 },
      );
    }

    const userId = await requireUserId();
    const builderContext = await loadBuilderContext(campaignId, targetCharacterId, userId);
    if (!builderContext) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (!builderContext.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as BuilderPayload;
    const name = normalizeDisplayName(body.name);
    const imageUrl = normalizeOptionalString(body.imageUrl, 500);
    let age: string | null | undefined;
    try {
      age = normalizeAge(body.age);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_AGE") {
        return NextResponse.json(
          { error: "Age must use digits only or be blank." },
          { status: 400 },
        );
      }
      throw error;
    }
    const race = normalizeOptionalString(body.race, 120);
    const description = normalizeOptionalString(body.description, 4000);
    const level = normalizeLevel(body.level);
    const [traitCatalog, backpackItems] = await Promise.all([
      loadBuilderTraitCatalog(),
      loadBuilderBackpackItems(campaignId, targetCharacterId),
    ]);
    const builderData = sanitizeBuilderEquipment(
      cleanBuilderTraits(normalizeBuilderData(body.builderData), traitCatalog),
      backpackItems,
    );
    const validationLevel = level ?? builderContext.character.level;
    const validationErrors = validateBuilderData(builderData, validationLevel, traitCatalog);
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors.join(" ") }, { status: 400 });
    }

    const data: {
      name?: string;
      imageUrl?: string | null;
      age?: string | null;
      race?: string | null;
      description?: string | null;
      level?: number;
      builderData?: Prisma.InputJsonValue;
    } = {};
    if (name !== undefined) data.name = name.slice(0, 120);
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (age !== undefined) data.age = age;
    if (race !== undefined) data.race = race;
    if (description !== undefined) data.description = description;
    if (level !== undefined) data.level = level;
    data.builderData = builderData;

    const character = await prisma.campaignCharacter.update({
      where: { id: targetCharacterId },
      data,
      select: {
        id: true,
        campaignId: true,
        name: true,
        imageUrl: true,
        age: true,
        race: true,
        description: true,
        level: true,
        builderData: true,
        assignedUserId: true,
        archivedAt: true,
        archiveReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      character: {
        ...character,
        builderData: normalizeBuilderData(character.builderData),
      },
      traitCatalog: await loadBuilderTraitCatalog(),
      backpackItems: await loadBuilderBackpackItems(campaignId, targetCharacterId),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
