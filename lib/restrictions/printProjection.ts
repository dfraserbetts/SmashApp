import type { CharacterBuilderData } from "@/lib/characterBuilder/core";
import type { CharacterPower } from "@/lib/characterBuilder/powers";
import type { RoleplayAbility } from "@/lib/characterBuilder/roleplayAbilities";
import type { PlayerRestrictionConsumer } from "@/lib/restrictions/governance";
import {
  buildPlayerRestrictionGovernanceEntryMap,
  getPlayerRestrictionGovernanceEntryKey,
  type CharacterRestrictionGovernanceReadModel,
  type PlayerRestrictionGovernanceReadEntry,
} from "@/lib/restrictions/governanceView";
import {
  resolvePlayerRestrictionConsumer,
  type PlayerRestrictionConsumerResolution,
} from "@/lib/restrictions/playerRestrictionConsumerResolver";

export const RESTRICTION_PRINT_PROJECTION_OMISSION_REASONS = [
  "DRAFT",
  "PENDING_GD_APPROVAL",
  "CHANGES_REQUESTED",
  "APPROVAL_STALE",
  "MISSING_GOVERNANCE",
  "APPROVAL_NOT_CURRENT",
  "FINGERPRINT_MISMATCH",
  "MALFORMED_RESTRICTION",
  "UNRESOLVED_LEGACY_REVIEW",
  "UNSUPPORTED_RESTRICTION",
  "GOVERNANCE_UNAVAILABLE",
] as const;

export type RestrictionPrintProjectionOmissionReason =
  (typeof RESTRICTION_PRINT_PROJECTION_OMISSION_REASONS)[number];

export const RESTRICTION_PRINT_PROJECTION_OMISSION_LABELS: Readonly<
  Record<RestrictionPrintProjectionOmissionReason, string>
> = Object.freeze({
  DRAFT: "Draft",
  PENDING_GD_APPROVAL: "Pending Game Director Approval",
  CHANGES_REQUESTED: "Changes Requested",
  APPROVAL_STALE: "Approval Stale",
  MISSING_GOVERNANCE: "Restriction governance is missing",
  APPROVAL_NOT_CURRENT: "Approval is not current",
  FINGERPRINT_MISMATCH: "Saved Restriction does not match its governance record",
  MALFORMED_RESTRICTION: "Malformed Restriction",
  UNRESOLVED_LEGACY_REVIEW: "Unresolved legacy Restriction review",
  UNSUPPORTED_RESTRICTION: "Unsupported Restriction",
  GOVERNANCE_UNAVAILABLE: "Restriction governance is unavailable",
});

export const RESTRICTION_PRINT_PROJECTION_CONSUMER_LABELS: Readonly<
  Record<PlayerRestrictionConsumer, string>
> = Object.freeze({
  PLAYER_POWER: "Power",
  SIGNATURE_MOVE: "Signature Move",
  ROLEPLAY_ABILITY: "Roleplay Ability",
});

export type RestrictionPrintProjectionGovernanceSource =
  | Readonly<{
      status: "AVAILABLE";
      model: CharacterRestrictionGovernanceReadModel;
    }>
  | Readonly<{
      status: "UNAVAILABLE";
      campaignId: string;
    }>;

export type RestrictionPrintProjectionOmission = Readonly<{
  consumerType: PlayerRestrictionConsumer;
  consumerId: string;
  consumerName: string;
  reasonCode: RestrictionPrintProjectionOmissionReason;
  reasonLabel: string;
}>;

export type RestrictionPrintProjectionWarningState =
  | "NONE"
  | "CONTENT_OMITTED"
  | "GOVERNANCE_UNAVAILABLE";

export type CharacterRestrictionPrintProjection = Readonly<{
  builderData: CharacterBuilderData;
  includedOrdinaryPowerIds: readonly string[];
  includedSignatureMoveId: string | null;
  includedRoleplayAbilityIds: readonly string[];
  omitted: readonly RestrictionPrintProjectionOmission[];
  governanceUnavailable: boolean;
  aggregateWarningState: RestrictionPrintProjectionWarningState;
}>;

type GovernedConsumer = Readonly<{
  consumerType: PlayerRestrictionConsumer;
  consumerId: string;
  consumerName: string;
  value: CharacterPower | RoleplayAbility;
}>;

function immutableClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => immutableClone(entry))) as T;
  }
  if (value && typeof value === "object") {
    const clone = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        immutableClone(entry),
      ]),
    );
    return Object.freeze(clone) as T;
  }
  return value;
}

function consumerName(
  consumerType: PlayerRestrictionConsumer,
  name: string | null | undefined,
  index: number,
): string {
  const savedName = name?.trim();
  if (savedName) return savedName;
  if (consumerType === "SIGNATURE_MOVE") return "Signature Move";
  if (consumerType === "ROLEPLAY_ABILITY") return `Roleplay Ability ${index + 1}`;
  return `Power ${index + 1}`;
}

function consumers(builderData: CharacterBuilderData): readonly GovernedConsumer[] {
  return Object.freeze([
    ...builderData.powers.map((power, index) => Object.freeze({
      consumerType: "PLAYER_POWER" as const,
      consumerId: power.id?.trim() ?? "",
      consumerName: consumerName("PLAYER_POWER", power.name, index),
      value: power,
    })),
    ...(builderData.signatureMove
      ? [Object.freeze({
          consumerType: "SIGNATURE_MOVE" as const,
          consumerId: builderData.signatureMove.id?.trim() ?? "",
          consumerName: consumerName("SIGNATURE_MOVE", builderData.signatureMove.name, 0),
          value: builderData.signatureMove,
        })]
      : []),
    ...builderData.roleplayAbilities.map((ability, index) => Object.freeze({
      consumerType: "ROLEPLAY_ABILITY" as const,
      consumerId: ability.id.trim(),
      consumerName: consumerName("ROLEPLAY_ABILITY", ability.name, index),
      value: ability,
    })),
  ]);
}

function semanticOmissionReason(
  resolution: PlayerRestrictionConsumerResolution,
): RestrictionPrintProjectionOmissionReason | null {
  if (resolution.semanticStatus === "MALFORMED") return "MALFORMED_RESTRICTION";
  if (resolution.semanticStatus === "UNRESOLVED_LEGACY_REVIEW") {
    return "UNRESOLVED_LEGACY_REVIEW";
  }
  if (resolution.semanticStatus === "UNSUPPORTED") return "UNSUPPORTED_RESTRICTION";
  return null;
}

function governanceOmissionReason(params: {
  resolution: PlayerRestrictionConsumerResolution;
  entry: PlayerRestrictionGovernanceReadEntry | null;
}): RestrictionPrintProjectionOmissionReason | null {
  const { resolution, entry } = params;
  if (!entry || entry.consumerPresence !== "PRESENT") return "MISSING_GOVERNANCE";
  if (entry.semanticStatus === "MALFORMED") return "MALFORMED_RESTRICTION";
  if (entry.semanticStatus === "UNRESOLVED_LEGACY_REVIEW") {
    return "UNRESOLVED_LEGACY_REVIEW";
  }
  if (entry.semanticStatus === "UNSUPPORTED") return "UNSUPPORTED_RESTRICTION";
  if (
    entry.currentFingerprint !== resolution.currentFingerprint ||
    entry.currentSemanticRestriction === null
  ) {
    return "FINGERPRINT_MISMATCH";
  }
  if (entry.effectiveLifecycle === "DRAFT") return "DRAFT";
  if (entry.effectiveLifecycle === "PENDING_GD_APPROVAL") return "PENDING_GD_APPROVAL";
  if (entry.effectiveLifecycle === "CHANGES_REQUESTED") return "CHANGES_REQUESTED";
  if (entry.effectiveLifecycle === "APPROVAL_STALE") return "APPROVAL_STALE";
  if (!entry.approvalCurrent || !entry.approvedFingerprint) return "APPROVAL_NOT_CURRENT";
  if (entry.approvedFingerprint !== resolution.currentFingerprint) {
    return entry.storedLifecycle === "APPROVED"
      ? "APPROVAL_STALE"
      : "FINGERPRINT_MISMATCH";
  }
  return null;
}

function omission(
  consumer: GovernedConsumer,
  reasonCode: RestrictionPrintProjectionOmissionReason,
): RestrictionPrintProjectionOmission {
  return Object.freeze({
    consumerType: consumer.consumerType,
    consumerId: consumer.consumerId,
    consumerName: consumer.consumerName,
    reasonCode,
    reasonLabel: RESTRICTION_PRINT_PROJECTION_OMISSION_LABELS[reasonCode],
  });
}

export function projectCharacterRestrictionPrintData(params: {
  builderData: CharacterBuilderData;
  governance: RestrictionPrintProjectionGovernanceSource;
}): CharacterRestrictionPrintProjection {
  const governanceUnavailable = params.governance.status === "UNAVAILABLE";
  const campaignId = params.governance.status === "AVAILABLE"
    ? params.governance.model.campaignId
    : params.governance.campaignId;
  const entryMap = params.governance.status === "AVAILABLE"
    ? buildPlayerRestrictionGovernanceEntryMap(params.governance.model)
    : new Map<string, PlayerRestrictionGovernanceReadEntry>();
  const includedPowerIds: string[] = [];
  let includedSignatureMoveId: string | null = null;
  const includedRoleplayIds: string[] = [];
  const omitted: RestrictionPrintProjectionOmission[] = [];

  for (const consumer of consumers(params.builderData)) {
    const resolution = resolvePlayerRestrictionConsumer(params.builderData, {
      campaignId,
      consumerType: consumer.consumerType,
      consumerId: consumer.consumerId,
    });
    let reason = semanticOmissionReason(resolution);
    if (!reason && resolution.semanticStatus !== "NONE") {
      reason = governanceUnavailable
        ? "GOVERNANCE_UNAVAILABLE"
        : governanceOmissionReason({
            resolution,
            entry: entryMap.get(getPlayerRestrictionGovernanceEntryKey(
              consumer.consumerType,
              consumer.consumerId,
            )) ?? null,
          });
    }
    if (reason) {
      omitted.push(omission(consumer, reason));
      continue;
    }
    if (consumer.consumerType === "PLAYER_POWER") includedPowerIds.push(consumer.consumerId);
    if (consumer.consumerType === "SIGNATURE_MOVE") includedSignatureMoveId = consumer.consumerId;
    if (consumer.consumerType === "ROLEPLAY_ABILITY") includedRoleplayIds.push(consumer.consumerId);
  }

  const includedPowerIdSet = new Set(includedPowerIds);
  const includedRoleplayIdSet = new Set(includedRoleplayIds);
  const projected = immutableClone({
    ...params.builderData,
    powers: params.builderData.powers.filter(
      (power) => includedPowerIdSet.has(power.id?.trim() ?? ""),
    ),
    signatureMove: params.builderData.signatureMove &&
      includedSignatureMoveId === (params.builderData.signatureMove.id?.trim() ?? "")
      ? params.builderData.signatureMove
      : null,
    roleplayAbilities: params.builderData.roleplayAbilities.filter(
      (ability) => includedRoleplayIdSet.has(ability.id.trim()),
    ),
  });
  const aggregateWarningState: RestrictionPrintProjectionWarningState = governanceUnavailable
    ? "GOVERNANCE_UNAVAILABLE"
    : omitted.length > 0
      ? "CONTENT_OMITTED"
      : "NONE";

  return Object.freeze({
    builderData: projected,
    includedOrdinaryPowerIds: Object.freeze(includedPowerIds),
    includedSignatureMoveId,
    includedRoleplayAbilityIds: Object.freeze(includedRoleplayIds),
    omitted: Object.freeze(omitted),
    governanceUnavailable,
    aggregateWarningState,
  });
}
