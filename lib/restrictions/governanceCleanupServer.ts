import "server-only";

import { Prisma } from "@prisma/client";

import {
  normalizeBuilderData,
  type CharacterBuilderData,
} from "@/lib/characterBuilder/core";

export const DELETED_POWER_GOVERNANCE_CONSUMER_TYPES = [
  "PLAYER_POWER",
  "SIGNATURE_MOVE",
] as const;

export type DeletedPowerGovernanceConsumerType =
  (typeof DELETED_POWER_GOVERNANCE_CONSUMER_TYPES)[number];

export type GovernedPowerLocator = Readonly<{
  consumerType: DeletedPowerGovernanceConsumerType;
  consumerId: string;
}>;

export type GovernedPowerIdentityRow = Readonly<{
  id: string;
  characterId: string;
  consumerType: string;
  consumerId: string;
}>;

export type DeletedPowerGovernanceCleanupResult = Readonly<{
  charactersScanned: number;
  governanceRowsScanned: number;
  livePowerLocators: number;
  orphanedRowsIdentified: number;
  orphanedPlayerPowerRows: number;
  orphanedSignatureMoveRows: number;
  governanceRowsDeleted: number;
}>;

export type GovernanceCleanupClient = Pick<
  Prisma.TransactionClient,
  "campaignCharacter" | "playerRestrictionGovernance"
>;

function stableIds(values: readonly (string | null | undefined)[]): readonly string[] {
  return Object.freeze(Array.from(new Set(
    values.map((value) => value?.trim() ?? "").filter(Boolean),
  )).sort());
}

export function deriveLiveGovernedPowerLocators(
  builderData: CharacterBuilderData,
): readonly GovernedPowerLocator[] {
  const playerPowerIds = stableIds(builderData.powers.map((power) => power.id));
  const signatureMoveIds = stableIds([builderData.signatureMove?.id]);
  return Object.freeze([
    ...playerPowerIds.map((consumerId) => Object.freeze({
      consumerType: "PLAYER_POWER" as const,
      consumerId,
    })),
    ...signatureMoveIds.map((consumerId) => Object.freeze({
      consumerType: "SIGNATURE_MOVE" as const,
      consumerId,
    })),
  ]);
}

export function identifyOrphanedGovernedPowerRows(params: {
  rows: readonly GovernedPowerIdentityRow[];
  builderDataByCharacterId: ReadonlyMap<string, CharacterBuilderData>;
}): readonly GovernedPowerIdentityRow[] {
  const liveKeysByCharacterId = new Map<string, ReadonlySet<string>>();
  for (const [characterId, builderData] of params.builderDataByCharacterId) {
    liveKeysByCharacterId.set(characterId, new Set(
      deriveLiveGovernedPowerLocators(builderData).map(
        (locator) => `${locator.consumerType}\u0000${locator.consumerId}`,
      ),
    ));
  }
  return Object.freeze(params.rows
    .filter((row) => (
      DELETED_POWER_GOVERNANCE_CONSUMER_TYPES as readonly string[]
    ).includes(row.consumerType))
    .filter((row) => !liveKeysByCharacterId.get(row.characterId)?.has(
      `${row.consumerType}\u0000${row.consumerId}`,
    ))
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id)));
}

function cleanupResult(params: {
  charactersScanned: number;
  rows: readonly GovernedPowerIdentityRow[];
  builderDataByCharacterId: ReadonlyMap<string, CharacterBuilderData>;
  orphanedRows: readonly GovernedPowerIdentityRow[];
  governanceRowsDeleted: number;
}): DeletedPowerGovernanceCleanupResult {
  const livePowerLocators = Array.from(params.builderDataByCharacterId.values())
    .reduce((total, builderData) => total + deriveLiveGovernedPowerLocators(builderData).length, 0);
  return Object.freeze({
    charactersScanned: params.charactersScanned,
    governanceRowsScanned: params.rows.length,
    livePowerLocators,
    orphanedRowsIdentified: params.orphanedRows.length,
    orphanedPlayerPowerRows: params.orphanedRows.filter(
      (row) => row.consumerType === "PLAYER_POWER",
    ).length,
    orphanedSignatureMoveRows: params.orphanedRows.filter(
      (row) => row.consumerType === "SIGNATURE_MOVE",
    ).length,
    governanceRowsDeleted: params.governanceRowsDeleted,
  });
}

async function deleteOrphanedRows(params: {
  client: GovernanceCleanupClient;
  campaignId: string;
  characterId?: string;
  rows: readonly GovernedPowerIdentityRow[];
  builderDataByCharacterId: ReadonlyMap<string, CharacterBuilderData>;
}): Promise<DeletedPowerGovernanceCleanupResult> {
  const orphanedRows = identifyOrphanedGovernedPowerRows({
    rows: params.rows,
    builderDataByCharacterId: params.builderDataByCharacterId,
  });
  const deleted = orphanedRows.length === 0
    ? { count: 0 }
    : await params.client.playerRestrictionGovernance.deleteMany({
        where: {
          id: { in: orphanedRows.map((row) => row.id) },
          campaignId: params.campaignId,
          ...(params.characterId ? { characterId: params.characterId } : {}),
          consumerType: { in: [...DELETED_POWER_GOVERNANCE_CONSUMER_TYPES] },
        },
      });
  return cleanupResult({
    charactersScanned: params.builderDataByCharacterId.size,
    rows: params.rows,
    builderDataByCharacterId: params.builderDataByCharacterId,
    orphanedRows,
    governanceRowsDeleted: deleted.count,
  });
}

export async function deleteOrphanedGovernedPowerRowsForCharacter(params: {
  client: GovernanceCleanupClient;
  campaignId: string;
  characterId: string;
  builderData: CharacterBuilderData;
}): Promise<DeletedPowerGovernanceCleanupResult> {
  const rows = await params.client.playerRestrictionGovernance.findMany({
    where: {
      campaignId: params.campaignId,
      characterId: params.characterId,
      consumerType: { in: [...DELETED_POWER_GOVERNANCE_CONSUMER_TYPES] },
    },
    select: { id: true, characterId: true, consumerType: true, consumerId: true },
    orderBy: [{ id: "asc" }],
  });
  return deleteOrphanedRows({
    ...params,
    rows,
    builderDataByCharacterId: new Map([[params.characterId, params.builderData]]),
  });
}

export async function reconcileOrphanedGovernedPowerRowsForCampaign(params: {
  client: GovernanceCleanupClient;
  campaignId: string;
}): Promise<DeletedPowerGovernanceCleanupResult> {
  const [characters, rows] = await Promise.all([
    params.client.campaignCharacter.findMany({
      where: { campaignId: params.campaignId },
      select: { id: true, builderData: true },
      orderBy: [{ id: "asc" }],
    }),
    params.client.playerRestrictionGovernance.findMany({
      where: {
        campaignId: params.campaignId,
        consumerType: { in: [...DELETED_POWER_GOVERNANCE_CONSUMER_TYPES] },
      },
      select: { id: true, characterId: true, consumerType: true, consumerId: true },
      orderBy: [{ id: "asc" }],
    }),
  ]);
  const builderDataByCharacterId = new Map(
    characters.map((character) => [character.id, normalizeBuilderData(character.builderData)]),
  );
  return deleteOrphanedRows({
    client: params.client,
    campaignId: params.campaignId,
    rows,
    builderDataByCharacterId,
  });
}
