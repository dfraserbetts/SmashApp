import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { normalizeBuilderData, type CharacterBuilderData } from "@/lib/characterBuilder/core";
import {
  getCampaignPermissions,
  requireCampaignAccess,
  requireCampaignGameDirector,
  type CampaignAccess,
} from "@/lib/campaign/access";
import type { RestrictionIssue } from "@/lib/restrictions";
import {
  PLAYER_RESTRICTION_CONSUMERS,
  type PlayerRestrictionConsumer,
  type RestrictionTier,
} from "@/lib/restrictions/governance";
import { deleteOrphanedGovernedPowerRowsForCharacter } from "@/lib/restrictions/governanceCleanupServer";
import {
  derivePlayerRestrictionGovernanceReadFacts,
  planApproveRestriction,
  planRequestRestrictionChanges,
  planSubmitRestriction,
  type GovernanceLifecyclePlan,
  type GovernanceLifecycleWriteStep,
  type SelfApprovalPolicy,
} from "@/lib/restrictions/governanceLifecycle";
import {
  normalizePlayerRestrictionGovernanceRow,
  normalizePlayerRestrictionReviewEvent,
  type PlayerRestrictionGovernanceRowInput,
} from "@/lib/restrictions/governancePersistence";
import {
  resolvePlayerRestrictionConsumer,
  type PlayerRestrictionConsumerResolution,
} from "@/lib/restrictions/playerRestrictionConsumerResolver";
import type {
  CharacterRestrictionGovernanceReadModel,
  PlayerRestrictionGovernanceHistoryEntry,
  PlayerRestrictionGovernanceReadEntry,
} from "@/lib/restrictions/governanceView";
import { prisma } from "@/prisma/client";

export const PRODUCTION_SELF_APPROVAL_POLICY: SelfApprovalPolicy = "UNRESOLVED";

export class RestrictionGovernanceServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues: readonly RestrictionIssue[];

  constructor(
    code: string,
    message: string,
    status: number,
    issues: readonly RestrictionIssue[] = [],
  ) {
    super(message);
    this.name = "RestrictionGovernanceServiceError";
    this.code = code;
    this.status = status;
    this.issues = issues;
  }
}

export type StoredPlayerRestrictionGovernance = Prisma.PlayerRestrictionGovernanceGetPayload<{
  include: { events: true };
}>;

type StoredGovernance = StoredPlayerRestrictionGovernance;
type StoredGovernanceRow = Omit<StoredGovernance, "events">;

function serviceError(
  code: string,
  message: string,
  status: number,
  issues: readonly RestrictionIssue[] = [],
): never {
  throw new RestrictionGovernanceServiceError(code, message, status, issues);
}

function rawGovernanceRow(row: StoredGovernanceRow): PlayerRestrictionGovernanceRowInput {
  return {
    id: row.id,
    campaignId: row.campaignId,
    characterId: row.characterId,
    consumerType: row.consumerType,
    consumerId: row.consumerId,
    lifecycle: row.lifecycle,
    submissionRevision: row.submissionRevision,
    submittedFingerprint: row.submittedFingerprint,
    submittedDefinitionJson: row.submittedDefinitionJson,
    submittedByUserId: row.submittedByUserId,
    submittedAt: row.submittedAt,
    approvedFingerprint: row.approvedFingerprint,
    selectedTier: row.selectedTier,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeHistory(row: StoredGovernance): PlayerRestrictionGovernanceHistoryEntry[] {
  return row.events.map((event) => {
    const normalized = normalizePlayerRestrictionReviewEvent({
      id: event.id,
      governanceId: event.governanceId,
      campaignId: row.campaignId,
      action: event.action,
      fromLifecycle: event.fromLifecycle,
      toLifecycle: event.toLifecycle,
      submissionRevision: event.submissionRevision,
      semanticFingerprint: event.semanticFingerprint,
      semanticDefinitionJson: event.semanticDefinitionJson,
      selectedTier: event.selectedTier,
      actorUserId: event.actorUserId,
      notes: event.notes,
      createdAt: event.createdAt,
    });
    if (!normalized.value) {
      serviceError(
        "INVALID_PERSISTED_REVIEW_EVENT",
        "A persisted review event failed its invariant checks.",
        500,
        normalized.issues,
      );
    }
    return Object.freeze({
      id: normalized.value.id,
      action: normalized.value.action,
      fromLifecycle: normalized.value.fromLifecycle,
      toLifecycle: normalized.value.toLifecycle,
      submissionRevision: normalized.value.submissionRevision,
      semanticFingerprint: normalized.value.semanticFingerprint,
      semanticDefinition: normalized.value.semanticDefinition,
      semanticSnapshotStatus: normalized.value.semanticSnapshotStatus,
      selectedTier: normalized.value.selectedTier,
      actorUserId: normalized.value.actorUserId,
      notes: normalized.value.notes,
      createdAt: normalized.value.createdAt,
    });
  });
}

function readEntry(
  builderData: CharacterBuilderData,
  campaignId: string,
  locator: Readonly<{
    consumerType: PlayerRestrictionConsumer;
    consumerId: string;
  }>,
  stored: StoredGovernance | null,
): PlayerRestrictionGovernanceReadEntry | null {
  const live = resolvePlayerRestrictionConsumer(builderData, {
    campaignId,
    consumerType: locator.consumerType,
    consumerId: locator.consumerId,
  });
  const facts = derivePlayerRestrictionGovernanceReadFacts({
    live,
    currentRow: stored ? rawGovernanceRow(stored) : null,
  });
  if (!facts) return null;
  const current = facts.currentRow;

  return Object.freeze({
    governanceId: current?.id ?? null,
    synthetic: facts.synthetic,
    consumerType: locator.consumerType,
    consumerId: locator.consumerId,
    consumerName: live.consumerName,
    consumerIndex: live.consumerIndex,
    consumerPresence: live.consumerPresence,
    semanticStatus: live.semanticStatus,
    currentSemanticRestriction: live.semanticRestriction,
    currentFingerprint: live.currentFingerprint,
    submittedDefinition: current?.submittedDefinition ?? null,
    submittedSnapshotStatus: current?.submittedSnapshotStatus ?? null,
    submittedFingerprint: current?.submittedFingerprint ?? null,
    approvedFingerprint: current?.approvedFingerprint ?? null,
    submittedProposalMatchesLiveDefinition: facts.submittedProposalMatchesLiveDefinition,
    approvedProposalMatchesLiveDefinition: facts.approvedProposalMatchesLiveDefinition,
    storedLifecycle: facts.storedLifecycle,
    effectiveLifecycle: facts.effectiveLifecycle,
    approvalCurrent: facts.approvalCurrent,
    selectedTier: current?.selectedTier ?? null,
    submissionRevision: current?.submissionRevision ?? 0,
    submittedByUserId: current?.submittedByUserId ?? null,
    submittedAt: current?.submittedAt ?? null,
    reviewedByUserId: current?.reviewedByUserId ?? null,
    reviewedAt: current?.reviewedAt ?? null,
    history: Object.freeze(stored ? normalizeHistory(stored) : []),
    diagnosticIssues: facts.issues,
  });
}

export function buildPersistedPlayerRestrictionGovernanceReadEntry(params: {
  builderData: CharacterBuilderData;
  campaignId: string;
  stored: StoredPlayerRestrictionGovernance;
}): PlayerRestrictionGovernanceReadEntry {
  const entry = readEntry(params.builderData, params.campaignId, {
    consumerType: params.stored.consumerType,
    consumerId: params.stored.consumerId,
  }, params.stored);
  if (!entry) {
    serviceError(
      "GOVERNANCE_READ_FAILED",
      "A persisted governance record could not be projected into the read model.",
      500,
    );
  }
  return entry;
}

function entrySortKey(entry: PlayerRestrictionGovernanceReadEntry): string {
  const consumerOrder = PLAYER_RESTRICTION_CONSUMERS.indexOf(entry.consumerType);
  const index = entry.consumerIndex == null
    ? "999999"
    : String(entry.consumerIndex).padStart(6, "0");
  return `${consumerOrder}:${index}:${entry.consumerId}`;
}

function allLiveLocators(builderData: CharacterBuilderData): Array<{
  consumerType: PlayerRestrictionConsumer;
  consumerId: string;
}> {
  const locators = [
    ...builderData.powers.map((power) => ({
      consumerType: "PLAYER_POWER" as const,
      consumerId: power.id?.trim() ?? "",
    })),
    ...(builderData.signatureMove
      ? [{
          consumerType: "SIGNATURE_MOVE" as const,
          consumerId: builderData.signatureMove.id?.trim() ?? "",
        }]
      : []),
    ...builderData.roleplayAbilities.map((ability) => ({
      consumerType: "ROLEPLAY_ABILITY" as const,
      consumerId: ability.id.trim(),
    })),
  ].filter((locator) => locator.consumerId);
  const seen = new Set<string>();
  return locators.filter((locator) => {
    const key = `${locator.consumerType}\u0000${locator.consumerId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCharacterReadModel(
  campaignId: string,
  characterId: string,
  builderDataValue: unknown,
  rows: readonly StoredGovernance[],
): CharacterRestrictionGovernanceReadModel {
  const builderData = normalizeBuilderData(builderDataValue);
  const entries: PlayerRestrictionGovernanceReadEntry[] = [];
  const persistedKeys = new Set<string>();
  for (const row of rows) {
    persistedKeys.add(`${row.consumerType}\u0000${row.consumerId}`);
    const entry = readEntry(builderData, campaignId, {
      consumerType: row.consumerType,
      consumerId: row.consumerId,
    }, row);
    if (entry) entries.push(entry);
  }
  for (const locator of allLiveLocators(builderData)) {
    if (persistedKeys.has(`${locator.consumerType}\u0000${locator.consumerId}`)) continue;
    const entry = readEntry(builderData, campaignId, locator, null);
    if (entry) entries.push(entry);
  }
  entries.sort((left, right) => entrySortKey(left).localeCompare(entrySortKey(right)));
  return Object.freeze({
    campaignId,
    characterId,
    governance: Object.freeze(entries),
  });
}

function canReadCharacter(access: CampaignAccess, character: {
  assignedUserId: string | null;
  archivedAt: Date | null;
}): boolean {
  return getCampaignPermissions(access).canManageCampaignCharacters ||
    (character.assignedUserId === access.userId && character.archivedAt === null);
}

async function loadTransactionalAccess(
  tx: Prisma.TransactionClient,
  campaignId: string,
  userId: string,
): Promise<CampaignAccess> {
  const [campaign, membership, profile] = await Promise.all([
    tx.campaign.findUnique({ where: { id: campaignId }, select: { ownerUserId: true } }),
    tx.campaignUser.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
      select: { role: true, canManagePartyStash: true },
    }),
    tx.userProfile.findUnique({ where: { userId }, select: { isAdmin: true } }),
  ]);
  if (!campaign) serviceError("CAMPAIGN_NOT_FOUND", "Campaign not found.", 404);
  const isAdmin = Boolean(profile?.isAdmin);
  const isOwner = campaign.ownerUserId === userId;
  const role = membership?.role ?? null;
  const effectiveRole = isOwner ? "GAME_DIRECTOR" as const : role;
  const access: CampaignAccess = {
    campaignId,
    userId,
    isAdmin,
    isOwner,
    role,
    effectiveRole,
    canManagePartyStash: Boolean(membership?.canManagePartyStash && role),
  };
  if (!getCampaignPermissions(access).canViewCampaign) {
    serviceError("FORBIDDEN", "You cannot access this campaign.", 403);
  }
  return access;
}

function resolveForWrite(
  builderDataValue: unknown,
  campaignId: string,
  consumerType: PlayerRestrictionConsumer,
  consumerId: string,
): PlayerRestrictionConsumerResolution {
  const resolved = resolvePlayerRestrictionConsumer(normalizeBuilderData(builderDataValue), {
    campaignId,
    consumerType,
    consumerId,
  });
  if (resolved.consumerPresence === "ABSENT") {
    serviceError(
      resolved.issues[0]?.code ?? "PLAYER_RESTRICTION_CONSUMER_ABSENT",
      resolved.issues[0]?.message ?? "The live consumer was not found.",
      404,
      resolved.issues,
    );
  }
  if (resolved.consumerPresence === "DUPLICATE") {
    serviceError(
      "DUPLICATE_PLAYER_RESTRICTION_CONSUMER_ID",
      "The live character contains duplicate stable consumer IDs.",
      409,
      resolved.issues,
    );
  }
  if (resolved.semanticStatus === "NONE") {
    serviceError(
      "MISSING_SEMANTIC_RESTRICTION",
      "The live consumer has no semantic Restriction to submit or review.",
      409,
      resolved.issues,
    );
  }
  if (resolved.semanticStatus === "UNRESOLVED_LEGACY_REVIEW") {
    serviceError(
      "UNRESOLVED_LEGACY_RESTRICTION_REVIEW",
      "The live Restriction still requires legacy migration review.",
      409,
      resolved.issues,
    );
  }
  if (!resolved.normalizedSnapshot) {
    const crossCampaign = resolved.issues.some((entry) => entry.code === "CROSS_CAMPAIGN_REFERENCE");
    serviceError(
      crossCampaign ? "CROSS_CAMPAIGN_REFERENCE" : "MALFORMED_SEMANTIC_RESTRICTION",
      crossCampaign
        ? "The Restriction contains a reference owned by another campaign."
        : "The live semantic Restriction is malformed.",
      400,
      resolved.issues,
    );
  }
  return resolved;
}

function planStatus(code: string): number {
  if (
    code.includes("REVISION") ||
    code.includes("LIFECYCLE") ||
    code.includes("PENDING") ||
    code.includes("APPROVAL") ||
    code.includes("UNSUPPORTED") ||
    code.includes("IMMUTABLE") ||
    code.includes("DOES_NOT_MATCH")
  ) return 409;
  return 400;
}

function requireValidPlan(plan: GovernanceLifecyclePlan): void {
  if (plan.ok) return;
  const first = plan.issues.find((entry) => entry.severity === "error") ?? plan.issues[0];
  serviceError(
    first?.code ?? "INVALID_GOVERNANCE_TRANSITION",
    first?.message ?? "The governance transition is invalid.",
    planStatus(first?.code ?? ""),
    plan.issues,
  );
}

function rowWriteData(row: PlayerRestrictionGovernanceRowInput) {
  return {
    campaignId: row.campaignId,
    characterId: row.characterId,
    consumerType: row.consumerType,
    consumerId: row.consumerId,
    lifecycle: row.lifecycle,
    submissionRevision: row.submissionRevision,
    submittedFingerprint: row.submittedFingerprint,
    submittedDefinitionJson: row.submittedDefinitionJson === null
      ? Prisma.DbNull
      : row.submittedDefinitionJson,
    submittedByUserId: row.submittedByUserId,
    submittedAt: row.submittedAt ? new Date(row.submittedAt) : null,
    approvedFingerprint: row.approvedFingerprint,
    selectedTier: row.selectedTier,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt) : null,
    updatedAt: new Date(row.updatedAt),
  };
}

async function writePlanStep(
  tx: Prisma.TransactionClient,
  step: GovernanceLifecycleWriteStep,
): Promise<void> {
  const rowValidation = normalizePlayerRestrictionGovernanceRow(step.row);
  const eventValidation = normalizePlayerRestrictionReviewEvent(step.event);
  if (!rowValidation.value || !eventValidation.value) {
    serviceError(
      "INVALID_GOVERNANCE_WRITE_SHAPE",
      "The planned governance write failed persistence validation.",
      500,
      [...rowValidation.issues, ...eventValidation.issues],
    );
  }

  if (step.operation === "CREATE") {
    await tx.playerRestrictionGovernance.create({
      data: {
        id: step.row.id,
        ...rowWriteData(step.row),
        createdAt: new Date(step.row.createdAt),
      },
    });
  } else {
    const updated = await tx.playerRestrictionGovernance.updateMany({
      where: {
        id: step.row.id,
        campaignId: step.row.campaignId,
        lifecycle: step.expectedLifecycle!,
        submissionRevision: step.expectedSubmissionRevision,
      },
      data: rowWriteData(step.row),
    });
    if (updated.count !== 1) {
      serviceError(
        "GOVERNANCE_CONCURRENCY_CONFLICT",
        "The governance record changed before this action completed.",
        409,
      );
    }
  }

  await tx.playerRestrictionReviewEvent.create({
    data: {
      id: eventValidation.value.id,
      governanceId: eventValidation.value.governanceId,
      action: eventValidation.value.action,
      fromLifecycle: eventValidation.value.fromLifecycle,
      toLifecycle: eventValidation.value.toLifecycle,
      submissionRevision: eventValidation.value.submissionRevision,
      semanticFingerprint: eventValidation.value.semanticFingerprint,
      semanticDefinitionJson: eventValidation.value.semanticDefinitionJson,
      selectedTier: eventValidation.value.selectedTier,
      actorUserId: eventValidation.value.actorUserId,
      notes: eventValidation.value.notes,
      createdAt: new Date(eventValidation.value.createdAt),
    },
  });
}

async function executePlan(
  tx: Prisma.TransactionClient,
  plan: GovernanceLifecyclePlan,
): Promise<void> {
  requireValidPlan(plan);
  for (const step of plan.steps) await writePlanStep(tx, step);
}

async function loadWrittenEntry(
  tx: Prisma.TransactionClient,
  campaignId: string,
  governanceId: string,
): Promise<PlayerRestrictionGovernanceReadEntry> {
  const row = await tx.playerRestrictionGovernance.findFirst({
    where: { id: governanceId, campaignId },
    include: { events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  if (!row) serviceError("GOVERNANCE_NOT_FOUND", "Governance record not found.", 404);
  const character = await tx.campaignCharacter.findFirst({
    where: { id: row.characterId, campaignId },
    select: { builderData: true },
  });
  if (!character) serviceError("CHARACTER_NOT_FOUND", "Character not found.", 404);
  const entry = readEntry(normalizeBuilderData(character.builderData), campaignId, {
    consumerType: row.consumerType,
    consumerId: row.consumerId,
  }, row);
  if (!entry) serviceError("GOVERNANCE_READ_FAILED", "Governance read model could not be created.", 500);
  return entry;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function loadCharacterRestrictionGovernance(params: {
  campaignId: string;
  characterId: string;
  actorUserId: string;
}): Promise<CharacterRestrictionGovernanceReadModel> {
  const access = await requireCampaignAccess(params.campaignId, params.actorUserId);
  return prisma.$transaction(async (tx) => {
    const character = await tx.campaignCharacter.findFirst({
      where: { id: params.characterId, campaignId: params.campaignId },
      select: {
        id: true,
        assignedUserId: true,
        archivedAt: true,
        builderData: true,
      },
    });
    if (!character) serviceError("CHARACTER_NOT_FOUND", "Character not found.", 404);
    if (!canReadCharacter(access, character)) {
      serviceError("FORBIDDEN", "You cannot inspect this Character's Restriction governance.", 403);
    }
    const builderData = normalizeBuilderData(character.builderData);
    await deleteOrphanedGovernedPowerRowsForCharacter({
      client: tx,
      campaignId: params.campaignId,
      characterId: character.id,
      builderData,
    });
    const restrictionGovernance = await tx.playerRestrictionGovernance.findMany({
      where: { characterId: character.id, campaignId: params.campaignId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });
    return buildCharacterReadModel(
      params.campaignId,
      character.id,
      builderData,
      restrictionGovernance,
    );
  });
}

export async function loadPlayerRestrictionGovernanceRecord(params: {
  campaignId: string;
  governanceId: string;
  actorUserId: string;
}): Promise<PlayerRestrictionGovernanceReadEntry> {
  const access = await requireCampaignAccess(params.campaignId, params.actorUserId);
  const row = await prisma.playerRestrictionGovernance.findFirst({
    where: { id: params.governanceId, campaignId: params.campaignId },
    include: { events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  if (!row) serviceError("GOVERNANCE_NOT_FOUND", "Governance record not found.", 404);
  const character = await prisma.campaignCharacter.findFirst({
    where: { id: row.characterId, campaignId: params.campaignId },
    select: { assignedUserId: true, archivedAt: true, builderData: true },
  });
  if (!character) serviceError("CHARACTER_NOT_FOUND", "Character not found.", 404);
  if (!canReadCharacter(access, character)) serviceError("FORBIDDEN", "You cannot inspect this governance record.", 403);
  const entry = readEntry(normalizeBuilderData(character.builderData), params.campaignId, {
    consumerType: row.consumerType,
    consumerId: row.consumerId,
  }, row);
  if (!entry) serviceError("GOVERNANCE_READ_FAILED", "Governance read model could not be created.", 500);
  return entry;
}

export async function submitCurrentPlayerRestriction(params: {
  campaignId: string;
  characterId: string;
  consumerType: PlayerRestrictionConsumer;
  consumerId: string;
  expectedSubmissionRevision: number;
  actorUserId: string;
}): Promise<PlayerRestrictionGovernanceReadEntry> {
  await requireCampaignAccess(params.campaignId, params.actorUserId);
  try {
    return await prisma.$transaction(async (tx) => {
      const access = await loadTransactionalAccess(tx, params.campaignId, params.actorUserId);
      const current = await tx.playerRestrictionGovernance.findUnique({
        where: {
          characterId_consumerType_consumerId: {
            characterId: params.characterId,
            consumerType: params.consumerType,
            consumerId: params.consumerId,
          },
        },
      });
      const character = await tx.campaignCharacter.findFirst({
        where: { id: params.characterId, campaignId: params.campaignId },
        select: { id: true, assignedUserId: true, archivedAt: true, builderData: true },
      });
      if (!character) serviceError("CHARACTER_NOT_FOUND", "Character not found.", 404);
      if (character.archivedAt) serviceError("CHARACTER_ARCHIVED", "Archived Characters cannot submit Restrictions.", 409);
      const canManage = getCampaignPermissions(access).canManageCampaignCharacters;
      if (!canManage && character.assignedUserId !== params.actorUserId) {
        serviceError("FORBIDDEN", "Only the assigned active player or a campaign manager may submit this Restriction.", 403);
      }
      const live = resolveForWrite(
        character.builderData,
        params.campaignId,
        params.consumerType,
        params.consumerId,
      );
      const actionAt = new Date();
      const governanceId = current?.id ?? randomUUID();
      const transition = planSubmitRestriction({
        currentRow: current ? rawGovernanceRow(current) : null,
        expectedSubmissionRevision: params.expectedSubmissionRevision,
        actorUserId: params.actorUserId,
        actionAt,
        governanceId,
        locator: {
          campaignId: params.campaignId,
          characterId: params.characterId,
          consumerType: params.consumerType,
          consumerId: params.consumerId,
        },
        liveSnapshot: live.normalizedSnapshot!,
        eventIds: [randomUUID(), randomUUID()],
      });
      await executePlan(tx, transition);
      return loadWrittenEntry(tx, params.campaignId, governanceId);
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      serviceError(
        "GOVERNANCE_CONCURRENCY_CONFLICT",
        "Another submission created this governance record first.",
        409,
      );
    }
    throw error;
  }
}

export async function approvePlayerRestriction(params: {
  campaignId: string;
  governanceId: string;
  expectedSubmissionRevision: number;
  selectedTier: RestrictionTier | null;
  notes?: string | null;
  actorUserId: string;
  selfApprovalPolicy?: SelfApprovalPolicy;
}): Promise<PlayerRestrictionGovernanceReadEntry> {
  await requireCampaignGameDirector(params.campaignId, params.actorUserId);
  return prisma.$transaction(async (tx) => {
    const access = await loadTransactionalAccess(tx, params.campaignId, params.actorUserId);
    if (!getCampaignPermissions(access).canManageCampaignCharacters) {
      serviceError("FORBIDDEN", "Only a campaign Game Director or administrator may approve Restrictions.", 403);
    }
    const current = await tx.playerRestrictionGovernance.findFirst({
      where: { id: params.governanceId, campaignId: params.campaignId },
    });
    if (!current) serviceError("GOVERNANCE_NOT_FOUND", "Governance record not found.", 404);
    const character = await tx.campaignCharacter.findFirst({
      where: { id: current.characterId, campaignId: params.campaignId },
      select: { id: true, archivedAt: true, builderData: true },
    });
    if (!character) serviceError("CHARACTER_NOT_FOUND", "Character not found.", 404);
    if (character.archivedAt) serviceError("CHARACTER_ARCHIVED", "Archived Characters cannot receive Restriction approval.", 409);
    const live = resolveForWrite(
      character.builderData,
      params.campaignId,
      current.consumerType,
      current.consumerId,
    );
    const transition = planApproveRestriction({
      currentRow: rawGovernanceRow(current),
      expectedSubmissionRevision: params.expectedSubmissionRevision,
      actorUserId: params.actorUserId,
      actionAt: new Date(),
      liveSnapshot: live.normalizedSnapshot!,
      selectedTier: params.selectedTier,
      notes: params.notes,
      selfApprovalPolicy: params.selfApprovalPolicy ?? PRODUCTION_SELF_APPROVAL_POLICY,
      eventId: randomUUID(),
    });
    await executePlan(tx, transition);
    return loadWrittenEntry(tx, params.campaignId, current.id);
  });
}

export async function requestPlayerRestrictionChanges(params: {
  campaignId: string;
  governanceId: string;
  expectedSubmissionRevision: number;
  notes: string | null;
  actorUserId: string;
}): Promise<PlayerRestrictionGovernanceReadEntry> {
  await requireCampaignGameDirector(params.campaignId, params.actorUserId);
  return prisma.$transaction(async (tx) => {
    const access = await loadTransactionalAccess(tx, params.campaignId, params.actorUserId);
    if (!getCampaignPermissions(access).canManageCampaignCharacters) {
      serviceError("FORBIDDEN", "Only a campaign Game Director or administrator may request changes.", 403);
    }
    const current = await tx.playerRestrictionGovernance.findFirst({
      where: { id: params.governanceId, campaignId: params.campaignId },
    });
    if (!current) serviceError("GOVERNANCE_NOT_FOUND", "Governance record not found.", 404);
    const character = await tx.campaignCharacter.findFirst({
      where: { id: current.characterId, campaignId: params.campaignId },
      select: { id: true },
    });
    if (!character) serviceError("CHARACTER_NOT_FOUND", "Character not found.", 404);
    const transition = planRequestRestrictionChanges({
      currentRow: rawGovernanceRow(current),
      expectedSubmissionRevision: params.expectedSubmissionRevision,
      actorUserId: params.actorUserId,
      actionAt: new Date(),
      notes: params.notes,
      eventId: randomUUID(),
    });
    await executePlan(tx, transition);
    return loadWrittenEntry(tx, params.campaignId, current.id);
  });
}

export function isPlayerRestrictionConsumerInput(
  value: unknown,
): value is PlayerRestrictionConsumer {
  return typeof value === "string" &&
    (PLAYER_RESTRICTION_CONSUMERS as readonly string[]).includes(value);
}
