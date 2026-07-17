import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireUserId } from "@/lib/auth/server";
import {
  getCampaignPermissions,
  requireCampaignAccess,
} from "@/lib/campaign/access";
import { getMemberIdentities, getMemberIdentityLabel } from "@/lib/campaign/memberIdentity";
import { getActivePowerTuningSet } from "@/lib/config/powerTuning";
import { ensureCharacterBuilderTuning } from "@/lib/config/characterBuilderTuning";
import {
  cleanBuilderTraits,
  normalizeBuilderData,
  sanitizeBuilderEquipment,
  validateBuilderData,
  type PlayerTraitDefinition,
} from "@/lib/characterBuilder/core";
import { summarizeEquipmentItem } from "@/lib/characterBuilder/equipment";
import {
  buildCharacterGrossBudgetReadiness,
  prepareCharacterPowerIdsForPersistence,
  signatureMovePointPool,
  summarizeCharacterPowerValidation,
  synchronizeCharacterPowerCooldownCaches,
} from "@/lib/characterBuilder/powers";
import { getCharacterBuilderThreeFieldAugmentDebuffPublicWriteError } from "@/lib/powers/authoringRules";
import { validateRawPlayerPowerRestrictionWrite } from "@/lib/restrictions/playerPowerEditorIntegration";
import { validateRawRoleplayAbilityRestrictionWrite } from "@/lib/restrictions/roleplayAbilityEditorIntegration";
import { deleteOrphanedGovernedPowerRowsForCharacter } from "@/lib/restrictions/governanceCleanupServer";
import {
  applyAutomaticExpectedTargetsToPower,
  applyAutomaticExpectedTargetsToPowers,
  type ExpectedTargetTeamContext,
} from "@/lib/powers/expectedTargetEstimation";
import { prisma } from "@/prisma/client";

const DEFAULT_CHARACTER_NAME = "UNNAMED";
const PARTY_STASH_TRANSFER_TARGET_ID = "__PARTY_STASH__";

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

function getVisibleAssignedPlayerLabel(args: {
  userId: string;
  playerName: string | null;
  email: string | null;
  canViewEmail: boolean;
}) {
  const playerName = args.playerName?.trim();
  if (playerName) {
    return args.canViewEmail && args.email ? `${playerName} (${args.email})` : playerName;
  }
  if (args.canViewEmail && args.email) return args.email;
  return `Player ${args.userId.slice(0, 8)}`;
}

function getTransferPlayerLabel(playerName: string | null | undefined) {
  const trimmed = playerName?.trim();
  return trimmed || "Player";
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

  const [identities, assignedMembership] = character.assignedUserId
    ? await Promise.all([
        getMemberIdentities([character.assignedUserId]),
        prisma.campaignUser.findUnique({
          where: {
            campaignId_userId: {
              campaignId,
              userId: character.assignedUserId,
            },
          },
          select: { playerName: true },
        }),
      ])
    : ([new Map(), null] as const);
  const assignedIdentity = character.assignedUserId
    ? identities.get(character.assignedUserId)
    : undefined;

  const [traitCatalog, backpackItems, transferTargets, powerTuning, characterBuilderTuning] = await Promise.all([
    loadBuilderTraitCatalog(),
    loadBuilderBackpackItems(campaignId, characterId),
    loadBackpackTransferTargets(campaignId, characterId),
    getActivePowerTuningSet(),
    ensureCharacterBuilderTuning(),
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
    assignedPlayerLabel: character.assignedUserId
      ? getVisibleAssignedPlayerLabel({
          userId: character.assignedUserId,
          playerName: assignedMembership?.playerName ?? null,
          email: assignedIdentity?.email ?? null,
          canViewEmail: canManage,
        })
      : getMemberIdentityLabel(assignedIdentity),
    traitCatalog,
    backpackItems,
    transferTargets,
    powerTuning,
    characterBuilderTuning,
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
        itemUrl: itemTemplate.itemUrl,
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

async function loadBackpackTransferTargets(campaignId: string, sourceCharacterId: string) {
  const characters = await prisma.campaignCharacter.findMany({
    where: {
      campaignId,
      archivedAt: null,
      id: { not: sourceCharacterId },
    },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      assignedUserId: true,
    },
  });
  const assignedUserIds = Array.from(
    new Set(characters.map((character) => character.assignedUserId).filter(Boolean)),
  ) as string[];
  const memberships =
    assignedUserIds.length > 0
      ? await prisma.campaignUser.findMany({
          where: { campaignId, userId: { in: assignedUserIds } },
          select: { userId: true, playerName: true },
        })
      : [];
  const membershipByUserId = new Map(memberships.map((row) => [row.userId, row]));

  const characterTargets = characters.map((character) => {
    const characterName = character.name?.trim() || "(Unnamed character)";
    const assignedPlayerLabel = character.assignedUserId
      ? getTransferPlayerLabel(membershipByUserId.get(character.assignedUserId)?.playerName)
      : "Unassigned";
    return {
      characterId: character.id,
      characterName,
      assignedPlayerLabel,
      label: `${characterName} - ${assignedPlayerLabel}`,
    };
  });
  return [
    {
      characterId: PARTY_STASH_TRANSFER_TARGET_ID,
      characterName: "Party Stash",
      assignedPlayerLabel: "Unassigned",
      label: "Party Stash",
    },
    ...characterTargets,
  ];
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
    const authoringError = getCharacterBuilderThreeFieldAugmentDebuffPublicWriteError(body.builderData);
    if (authoringError) {
      return NextResponse.json({ error: authoringError }, { status: 400 });
    }
    const restrictionWriteIssue = validateRawPlayerPowerRestrictionWrite(
      body.builderData,
      campaignId,
    );
    if (restrictionWriteIssue) {
      return NextResponse.json(
        {
          error: restrictionWriteIssue.clientMessage,
          code: restrictionWriteIssue.code,
        },
        { status: 400 },
      );
    }
    const roleplayRestrictionWriteIssue = validateRawRoleplayAbilityRestrictionWrite(
      body.builderData,
      campaignId,
    );
    if (roleplayRestrictionWriteIssue) {
      return NextResponse.json(
        {
          error: roleplayRestrictionWriteIssue.clientMessage,
          code: roleplayRestrictionWriteIssue.code,
        },
        { status: 400 },
      );
    }
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
    const { traitCatalog, backpackItems, powerTuning, characterBuilderTuning } = builderContext;
    if (!powerTuning) {
      return NextResponse.json(
        { error: "Active power tuning is required before character powers can be saved." },
        { status: 503 },
      );
    }
    const normalizedBuilderData = sanitizeBuilderEquipment(
      cleanBuilderTraits(normalizeBuilderData(body.builderData), traitCatalog),
      backpackItems,
    );
    const expectedTargetTeamContext: ExpectedTargetTeamContext = {
      source: "ACTUAL_TEAM_CONTEXT",
      totalTeamSize:
        1 + builderContext.transferTargets.filter(
          (target) => target.characterId !== PARTY_STASH_TRANSFER_TARGET_ID,
        ).length,
    };
    const builderDataWithAutomaticExpectedTargets = {
      ...normalizedBuilderData,
      powers: applyAutomaticExpectedTargetsToPowers(
        normalizedBuilderData.powers,
        expectedTargetTeamContext,
      ),
      signatureMove: normalizedBuilderData.signatureMove
        ? applyAutomaticExpectedTargetsToPower(
            normalizedBuilderData.signatureMove,
            expectedTargetTeamContext,
          )
        : null,
    };
    const preparedPowerIds = prepareCharacterPowerIdsForPersistence({
      powers: builderDataWithAutomaticExpectedTargets.powers,
      signatureMove: builderDataWithAutomaticExpectedTargets.signatureMove,
    });
    const builderData = {
      ...builderDataWithAutomaticExpectedTargets,
      powers: preparedPowerIds.powers,
      signatureMove: preparedPowerIds.signatureMove,
    };
    const validationLevel = level ?? builderContext.character.level;
    const normalPowerValidation = summarizeCharacterPowerValidation({
      level: validationLevel,
      powers: builderData.powers,
      tuningSnapshot: powerTuning,
      playerPowerSpendScalar: characterBuilderTuning.playerPowerSpendScalar,
      expectedTargetTeamContext,
    });
    const signatureMoveValidation = summarizeCharacterPowerValidation({
      level: validationLevel,
      powers: builderData.signatureMove ? [builderData.signatureMove] : [],
      tuningSnapshot: powerTuning,
      playerPowerSpendScalar: characterBuilderTuning.playerPowerSpendScalar,
      powerPool: signatureMovePointPool(validationLevel),
      powerPoolKind: "signature",
      powerLabel: "Signature Move",
      poolDescription: "Character Level x 20",
      offencePressureMode: "reviewOnly",
      expectedTargetTeamContext,
    });
    const validationErrors = [
      ...validateBuilderData(builderData, validationLevel, traitCatalog),
      ...normalPowerValidation.saveBlockingErrors,
      ...signatureMoveValidation.saveBlockingErrors,
    ];
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors.join(" ") }, { status: 400 });
    }
    const synchronizedPowers = synchronizeCharacterPowerCooldownCaches({
      level: validationLevel,
      powers: builderData.powers,
      signatureMove: builderData.signatureMove,
      tuningSnapshot: powerTuning,
      playerPowerSpendScalar: characterBuilderTuning.playerPowerSpendScalar,
      expectedTargetTeamContext,
    });
    if (!synchronizedPowers.ok) {
      return NextResponse.json(
        { error: synchronizedPowers.message },
        { status: synchronizedPowers.errorCode === "ACTIVE_TUNING_REQUIRED" ? 503 : 400 },
      );
    }
    const synchronizedBuilderData = {
      ...builderData,
      powers: synchronizedPowers.powers,
      signatureMove: synchronizedPowers.signatureMove,
    };
    const grossBudgetReadiness = buildCharacterGrossBudgetReadiness({
      normal: normalPowerValidation.summary,
      signature: signatureMoveValidation.summary,
    });

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
    data.builderData = JSON.parse(JSON.stringify(synchronizedBuilderData)) as Prisma.InputJsonValue;

    const character = await prisma.$transaction(async (tx) => {
      const savedCharacter = await tx.campaignCharacter.update({
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
      await deleteOrphanedGovernedPowerRowsForCharacter({
        client: tx,
        campaignId,
        characterId: savedCharacter.id,
        builderData: synchronizedBuilderData,
      });
      return savedCharacter;
    });

    return NextResponse.json({
      ok: true,
      character: {
        ...character,
        builderData: normalizeBuilderData(character.builderData),
      },
      traitCatalog: await loadBuilderTraitCatalog(),
      backpackItems: await loadBuilderBackpackItems(campaignId, targetCharacterId),
      powerTuning,
      characterBuilderTuning,
      grossBudgetReadiness,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
