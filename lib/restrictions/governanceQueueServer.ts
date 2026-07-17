import "server-only";

import { normalizeBuilderData, type CharacterBuilderData } from "@/lib/characterBuilder/core";
import type { CharacterPower } from "@/lib/characterBuilder/powers";
import {
  renderRoleplayAbilityDescriptor,
  type RoleplayAbility,
} from "@/lib/characterBuilder/roleplayAbilities";
import { requireCampaignGameDirector } from "@/lib/campaign/access";
import { getRestrictionReadOnlyModel } from "@/lib/restrictions/editorModel";
import {
  RESTRICTION_CONSUMER_LABELS,
  type PlayerRestrictionConsumer,
} from "@/lib/restrictions/governance";
import {
  buildCampaignRestrictionApprovalBlockers,
  groupCampaignRestrictionQueueItems,
  resolveRestrictionQueuePlayerLabel,
  type CampaignRestrictionQueueHistoryEntry,
  type CampaignRestrictionQueueItem,
  type CampaignRestrictionQueueReadModel,
  type CampaignRestrictionQueueSummary,
} from "@/lib/restrictions/governanceQueueView";
import {
  buildPersistedPlayerRestrictionGovernanceReadEntry,
  PRODUCTION_SELF_APPROVAL_POLICY,
} from "@/lib/restrictions/governanceServer";
import { reconcileOrphanedGovernedPowerRowsForCampaign } from "@/lib/restrictions/governanceCleanupServer";
import { getLatestPlayerFacingRestrictionReviewNote } from "@/lib/restrictions/governanceView";
import { renderPowerDescriptorLines } from "@/lib/summoning/render";
import { prisma } from "@/prisma/client";

type LiveConsumer = CharacterPower | RoleplayAbility | null;

function findLiveConsumer(
  builderData: CharacterBuilderData,
  consumerType: PlayerRestrictionConsumer,
  consumerId: string,
): LiveConsumer {
  if (consumerType === "PLAYER_POWER") {
    return builderData.powers.find((power) => power.id?.trim() === consumerId) ?? null;
  }
  if (consumerType === "SIGNATURE_MOVE") {
    return builderData.signatureMove?.id?.trim() === consumerId
      ? builderData.signatureMove
      : null;
  }
  return builderData.roleplayAbilities.find((ability) => ability.id.trim() === consumerId) ?? null;
}

function ordinaryDescriptorLines(
  builderData: CharacterBuilderData,
  consumerType: PlayerRestrictionConsumer,
  consumerId: string,
): readonly string[] {
  const consumer = findLiveConsumer(builderData, consumerType, consumerId);
  if (!consumer) return Object.freeze([]);
  if (consumerType === "ROLEPLAY_ABILITY") {
    return Object.freeze([renderRoleplayAbilityDescriptor(consumer as RoleplayAbility)]);
  }
  return Object.freeze(renderPowerDescriptorLines(consumer as CharacterPower));
}

function restrictionPresentation(
  definition: CampaignRestrictionQueueItem["submittedDefinition"] | null,
  consumerType: PlayerRestrictionConsumer,
) {
  if (!definition) {
    return Object.freeze({
      descriptor: null,
      authoringModeLabel: "No Restriction",
      evaluationLabel: "No evaluation capability applies.",
      validationLabel: "No semantic Restriction is currently saved.",
      diagnosticMessages: Object.freeze([] as string[]),
    });
  }
  const model = getRestrictionReadOnlyModel(definition, {
    consumerNoun: consumerType === "ROLEPLAY_ABILITY" ? "Ability" : "Power",
  });
  const errors = model.issues.filter((issue) => issue.severity === "error");
  const warnings = model.issues.filter((issue) => issue.severity === "warning");
  const validationLabel = model.status === "UNSUPPORTED_READ_ONLY"
    ? "Preserved but unsupported by the current Restriction registry."
    : errors.length > 0
      ? "The submitted snapshot has registry validation errors."
      : warnings.length > 0
        ? "Valid with registry warnings."
        : "Valid in the current Restriction registry.";
  return Object.freeze({
    descriptor: model.descriptor ?? "No Restriction descriptor is available.",
    authoringModeLabel: model.authoringModeLabel,
    evaluationLabel: model.evaluationLabel ?? "Unavailable in the current Restriction registry.",
    validationLabel,
    diagnosticMessages: Object.freeze(model.issues.map((issue) => issue.message)),
  });
}

function newestActivityAt(params: {
  submittedAt: string | null;
  reviewedAt: string | null;
  updatedAt: Date;
  history: readonly CampaignRestrictionQueueHistoryEntry[];
}): string {
  const historyAt = params.history.at(-1)?.createdAt ?? null;
  return historyAt ?? params.reviewedAt ?? params.submittedAt ?? params.updatedAt.toISOString();
}

async function loadCampaignRestrictionQueueProjection(params: {
  campaignId: string;
  actorUserId: string;
}): Promise<CampaignRestrictionQueueReadModel> {
  await requireCampaignGameDirector(params.campaignId, params.actorUserId);
  return prisma.$transaction(async (tx) => {
    await reconcileOrphanedGovernedPowerRowsForCampaign({
      client: tx,
      campaignId: params.campaignId,
    });
    const campaign = await tx.campaign.findUnique({
    where: { id: params.campaignId },
    select: {
      id: true,
      name: true,
      ownerUserId: true,
      members: {
        select: { userId: true, playerName: true },
      },
      playerRestrictionGovernance: {
        where: {
          lifecycle: {
            in: [
              "PENDING_GD_APPROVAL",
              "APPROVED",
              "CHANGES_REQUESTED",
              "APPROVAL_STALE",
            ],
          },
        },
        orderBy: [{ id: "asc" }],
        include: {
          events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          character: {
            select: {
              id: true,
              name: true,
              assignedUserId: true,
              archivedAt: true,
              builderData: true,
            },
          },
        },
      },
    },
  });
    if (!campaign) throw new Error("NOT_FOUND");

    const membershipByUserId = new Map(
      campaign.members.map((member) => [member.userId, member]),
    );
    const builderDataByCharacterId = new Map<string, CharacterBuilderData>();
    const items: CampaignRestrictionQueueItem[] = [];

    for (const row of campaign.playerRestrictionGovernance) {
    let builderData = builderDataByCharacterId.get(row.characterId);
    if (!builderData) {
      builderData = normalizeBuilderData(row.character.builderData);
      builderDataByCharacterId.set(row.characterId, builderData);
    }
    const entry = buildPersistedPlayerRestrictionGovernanceReadEntry({
      builderData,
      campaignId: campaign.id,
      stored: row,
    });
    if (!entry.governanceId || !entry.submittedDefinition || !entry.submittedSnapshotStatus) {
      continue;
    }
    const submitted = restrictionPresentation(entry.submittedDefinition, entry.consumerType);
    const current = restrictionPresentation(entry.currentSemanticRestriction, entry.consumerType);
    const history: CampaignRestrictionQueueHistoryEntry[] = entry.history.map((event) => Object.freeze({
      id: event.id,
      action: event.action,
      createdAt: event.createdAt,
      submissionRevision: event.submissionRevision,
      selectedTier: event.selectedTier,
      notes: event.notes,
    }));
    const assignedMembership = row.character.assignedUserId
      ? membershipByUserId.get(row.character.assignedUserId)
      : null;
    const approvalBlockers = buildCampaignRestrictionApprovalBlockers({
      governanceId: entry.governanceId,
      storedLifecycle: entry.storedLifecycle,
      effectiveLifecycle: entry.effectiveLifecycle,
      consumerPresence: entry.consumerPresence,
      submittedProposalMatchesLiveDefinition: entry.submittedProposalMatchesLiveDefinition,
      submittedSnapshotStatus: entry.submittedSnapshotStatus,
      characterArchived: row.character.archivedAt !== null,
      selfApprovalPolicyUnresolved:
        PRODUCTION_SELF_APPROVAL_POLICY === "UNRESOLVED" &&
        entry.submittedByUserId === params.actorUserId,
    });

    items.push(Object.freeze({
      governanceId: entry.governanceId,
      campaignId: campaign.id,
      characterId: row.character.id,
      characterName: row.character.name.trim() || "UNNAMED",
      assignedPlayerLabel: resolveRestrictionQueuePlayerLabel({
        playerName: assignedMembership?.playerName,
        assignedUserId: row.character.assignedUserId,
        campaignOwnerUserId: campaign.ownerUserId,
      }),
      characterArchived: row.character.archivedAt !== null,
      consumerType: entry.consumerType,
      consumerId: entry.consumerId,
      consumerName: entry.consumerName ?? `Former ${RESTRICTION_CONSUMER_LABELS[entry.consumerType]}`,
      consumerPresence: entry.consumerPresence,
      ordinaryDescriptorLines: ordinaryDescriptorLines(
        builderData,
        entry.consumerType,
        entry.consumerId,
      ),
      submittedDefinition: entry.submittedDefinition,
      submittedDescriptor: submitted.descriptor ?? "No Restriction descriptor is available.",
      submittedAuthoringModeLabel: submitted.authoringModeLabel,
      submittedEvaluationLabel: submitted.evaluationLabel,
      submittedValidationLabel: submitted.validationLabel,
      submittedSnapshotStatus: entry.submittedSnapshotStatus,
      submittedDiagnosticMessages: submitted.diagnosticMessages,
      currentSavedDefinition: entry.currentSemanticRestriction,
      currentSavedDescriptor: current.descriptor,
      submittedProposalMatchesLiveDefinition: entry.submittedProposalMatchesLiveDefinition,
      approvedProposalMatchesLiveDefinition: entry.approvedProposalMatchesLiveDefinition,
      storedLifecycle: entry.storedLifecycle ?? entry.effectiveLifecycle,
      effectiveLifecycle: entry.effectiveLifecycle,
      approvalCurrent: entry.approvalCurrent,
      selectedTier: entry.selectedTier,
      submissionRevision: entry.submissionRevision,
      submittedAt: entry.submittedAt,
      reviewedAt: entry.reviewedAt,
      latestPlayerFacingNote: getLatestPlayerFacingRestrictionReviewNote(entry),
      history: Object.freeze(history),
      approvalBlockers,
      requestChangesAvailable:
        entry.storedLifecycle === "PENDING_GD_APPROVAL" && Boolean(entry.governanceId),
      characterBuilderUrl:
        `/campaign/${encodeURIComponent(campaign.id)}/characters/${encodeURIComponent(row.character.id)}/builder`,
      activityAt: newestActivityAt({
        submittedAt: entry.submittedAt,
        reviewedAt: entry.reviewedAt,
        updatedAt: row.updatedAt,
        history,
      }),
    }));
  }

    const grouped = groupCampaignRestrictionQueueItems(items);
    return Object.freeze({
      campaign: Object.freeze({ id: campaign.id, name: campaign.name }),
      access: Object.freeze({ canManageCampaign: true as const }),
      groups: grouped.groups,
      counts: grouped.counts,
    });
  });
}

export async function loadCampaignRestrictionGovernanceQueue(params: {
  campaignId: string;
  actorUserId: string;
}): Promise<CampaignRestrictionQueueReadModel> {
  return loadCampaignRestrictionQueueProjection(params);
}

export async function loadCampaignRestrictionGovernanceSummary(params: {
  campaignId: string;
  actorUserId: string;
}): Promise<CampaignRestrictionQueueSummary> {
  const queue = await loadCampaignRestrictionQueueProjection(params);
  return Object.freeze({ counts: queue.counts });
}
