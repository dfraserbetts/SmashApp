import { readFileSync } from "node:fs";
import Module from "node:module";

import { defaultBuilderData, type CharacterBuilderData } from "../lib/characterBuilder/core";
import { createDefaultCharacterPower } from "../lib/characterBuilder/powers";
import type {
  GovernanceCleanupClient,
  GovernedPowerIdentityRow,
} from "../lib/restrictions/governanceCleanupServer";

let checks = 0;

function check(condition: unknown, message: string): asserts condition {
  checks += 1;
  if (!condition) throw new Error(`Restriction deleted-Power governance smoke failed: ${message}`);
}

function equal<T>(actual: T, expected: T, message: string): void {
  check(Object.is(actual, expected), `${message} (expected ${String(expected)}, received ${String(actual)})`);
}

async function main(): Promise<void> {
const moduleWithResolver = Module as unknown as {
  _resolveFilename: (request: string, parent: unknown, isMain: boolean, options?: unknown) => string;
};
const originalResolveFilename = moduleWithResolver._resolveFilename;
moduleWithResolver._resolveFilename = function resolveServerOnly(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "server-only") return require.resolve("react");
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
const imported = await import("../lib/restrictions/governanceCleanupServer");
moduleWithResolver._resolveFilename = originalResolveFilename;
const cleanup = (
  (imported as unknown as { default?: typeof imported }).default ?? imported
);

function power(id: string, name: string) {
  return { ...createDefaultCharacterPower(0), id, name };
}

function builderData(overrides: Partial<CharacterBuilderData> = {}): CharacterBuilderData {
  return {
    ...defaultBuilderData(),
    powers: [power("power-live", "Live Power"), power("power-other", "Other Power")],
    signatureMove: power("signature-live", "Signature Move"),
    ...overrides,
  };
}

const liveData = builderData();
const liveLocators = cleanup.deriveLiveGovernedPowerLocators(liveData);
equal(liveLocators.length, 3, "only ordinary Powers and the Signature Move are governed cleanup locators");
check(liveLocators.some((entry) => entry.consumerType === "PLAYER_POWER" && entry.consumerId === "power-live"), "ordinary stable ID is live");
check(liveLocators.some((entry) => entry.consumerType === "SIGNATURE_MOVE" && entry.consumerId === "signature-live"), "Signature stable ID is live");
check(!JSON.stringify(liveLocators).includes("ROLEPLAY_ABILITY"), "Roleplay Ability is outside deletion cleanup scope");

const editedData = builderData({
  powers: [
    { ...liveData.powers[1], name: "Renamed and reordered", effectPackets: [] },
    { ...liveData.powers[0], name: "Renamed live Power", restriction: null },
  ],
});
equal(
  JSON.stringify(cleanup.deriveLiveGovernedPowerLocators(editedData)),
  JSON.stringify(liveLocators),
  "rename, reorder, packet edits, and Restriction removal preserve stable governance identity",
);

const allLifecycleRows: GovernedPowerIdentityRow[] = [
  "DRAFT",
  "PENDING_GD_APPROVAL",
  "APPROVED",
  "CHANGES_REQUESTED",
  "APPROVAL_STALE",
].map((lifecycle) => ({
  id: `orphan-${lifecycle}`,
  characterId: "character-1",
  consumerType: "PLAYER_POWER",
  consumerId: `deleted-${lifecycle}`,
}));
const identityRows: GovernedPowerIdentityRow[] = [
  ...allLifecycleRows,
  { id: "orphan-signature", characterId: "character-1", consumerType: "SIGNATURE_MOVE", consumerId: "deleted-signature" },
  { id: "live-power", characterId: "character-1", consumerType: "PLAYER_POWER", consumerId: "power-live" },
  { id: "live-other", characterId: "character-1", consumerType: "PLAYER_POWER", consumerId: "power-other" },
  { id: "live-signature", characterId: "character-1", consumerType: "SIGNATURE_MOVE", consumerId: "signature-live" },
  { id: "deleted-roleplay", characterId: "character-1", consumerType: "ROLEPLAY_ABILITY", consumerId: "roleplay-deleted" },
  { id: "monster", characterId: "character-1", consumerType: "MONSTER_POWER", consumerId: "monster-deleted" },
];
const identified = cleanup.identifyOrphanedGovernedPowerRows({
  rows: identityRows,
  builderDataByCharacterId: new Map([["character-1", liveData]]),
});
equal(identified.length, 6, "all five lifecycle fixtures plus deleted Signature are identified");
check(allLifecycleRows.every((row) => identified.some((entry) => entry.id === row.id)), "cleanup has no lifecycle exception");
check(identified.some((entry) => entry.id === "orphan-signature"), "deleted Signature governance is identified");
check(!identified.some((entry) => entry.id.startsWith("live-")), "all live Power governance is preserved");
check(!identified.some((entry) => entry.id === "deleted-roleplay"), "deleted Roleplay governance is preserved");
check(!identified.some((entry) => entry.id === "monster"), "Monster rows are outside player cleanup scope");

type FakeRow = GovernedPowerIdentityRow & { campaignId: string; eventIds: string[] };
let storedRows: FakeRow[] = identityRows.map((row) => ({
  ...row,
  campaignId: "campaign-1",
  eventIds: [`event-${row.id}`],
}));
let deleteManyCalls = 0;
const fakeClient = {
  campaignCharacter: {
    findMany: async () => [{ id: "character-1", builderData: liveData }],
  },
  playerRestrictionGovernance: {
    findMany: async (args: { where: { campaignId: string; characterId?: string } }) => storedRows
      .filter((row) => row.campaignId === args.where.campaignId)
      .filter((row) => !args.where.characterId || row.characterId === args.where.characterId)
      .filter((row) => row.consumerType === "PLAYER_POWER" || row.consumerType === "SIGNATURE_MOVE")
      .map(({ id, characterId, consumerType, consumerId }) => ({ id, characterId, consumerType, consumerId })),
    deleteMany: async (args: { where: { id: { in: string[] } } }) => {
      deleteManyCalls += 1;
      const ids = new Set(args.where.id.in);
      const before = storedRows.length;
      storedRows = storedRows.filter((row) => !ids.has(row.id));
      return { count: before - storedRows.length };
    },
  },
} as unknown as GovernanceCleanupClient;

const characterCleanup = await cleanup.deleteOrphanedGovernedPowerRowsForCharacter({
  client: fakeClient,
  campaignId: "campaign-1",
  characterId: "character-1",
  builderData: liveData,
});
equal(characterCleanup.governanceRowsDeleted, 6, "one-Character cleanup hard-deletes every orphaned scoped row");
equal(characterCleanup.orphanedPlayerPowerRows, 5, "ordinary deleted-Power count is deterministic");
equal(characterCleanup.orphanedSignatureMoveRows, 1, "deleted-Signature count is deterministic");
equal(deleteManyCalls, 1, "one-Character cleanup uses one deleteMany");
check(storedRows.some((row) => row.id === "deleted-roleplay"), "Roleplay governance and its events remain stored");
check(storedRows.some((row) => row.id === "live-power"), "another current Power remains stored");
check(!storedRows.some((row) => row.id === "orphan-PENDING_GD_APPROVAL"), "Pending orphan and cascaded event fixture disappear together");

const repeated = await cleanup.reconcileOrphanedGovernedPowerRowsForCampaign({
  client: fakeClient,
  campaignId: "campaign-1",
});
equal(repeated.orphanedRowsIdentified, 0, "campaign reconciliation is idempotent");
equal(repeated.governanceRowsDeleted, 0, "idempotent reconciliation performs no deletion");
equal(deleteManyCalls, 1, "empty reconciliation does not issue deleteMany");

const cleanupSource = readFileSync("lib/restrictions/governanceCleanupServer.ts", "utf8");
const builderRoute = readFileSync("app/api/campaigns/[id]/characters/[characterId]/builder/route.ts", "utf8");
const queueServer = readFileSync("lib/restrictions/governanceQueueServer.ts", "utf8");
const governanceServer = readFileSync("lib/restrictions/governanceServer.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260717120000_add_player_restriction_governance/migration.sql", "utf8");

check(cleanupSource.startsWith('import "server-only";'), "cleanup authority is server-only");
check(cleanupSource.includes('"PLAYER_POWER"') && cleanupSource.includes('"SIGNATURE_MOVE"'), "cleanup scope names both governed Power types");
check(!cleanupSource.includes("playerRestrictionReviewEvent"), "cleanup appends or deletes no lifecycle event directly");
check(!cleanupSource.includes("lifecycle"), "cleanup has no lifecycle transition or lifecycle filter");
const builderPersistence = builderRoute.slice(
  builderRoute.indexOf("const character = await prisma.$transaction(async (tx)"),
  builderRoute.indexOf("return NextResponse.json", builderRoute.indexOf("const character = await prisma.$transaction(async (tx)")),
);
check(builderRoute.includes("prisma.$transaction(async (tx)"), "Builder persistence uses a callback transaction");
check(builderRoute.includes("tx.campaignCharacter.update"), "Character update uses the same transaction client");
check(builderRoute.indexOf("synchronizeCharacterPowerCooldownCaches") < builderRoute.indexOf("prisma.$transaction(async (tx)"), "cleanup is unreachable until cooldown synchronization succeeds");
check(builderRoute.indexOf("validationErrors.length") < builderRoute.indexOf("prisma.$transaction(async (tx)"), "cleanup is unreachable until validation succeeds");
check(builderPersistence.indexOf("tx.campaignCharacter.update") < builderPersistence.indexOf("deleteOrphanedGovernedPowerRowsForCharacter"), "saved Builder data is persisted before cleanup");
check(builderPersistence.includes("builderData: synchronizedBuilderData"), "cleanup uses exact final synchronized Builder data");
check(!builderRoute.includes("playerRestrictionGovernance.create"), "Builder save creates no governance row");
const queueLoad = queueServer.slice(queueServer.indexOf("async function loadCampaignRestrictionQueueProjection"));
check(queueLoad.indexOf("requireCampaignGameDirector") < queueLoad.indexOf("prisma.$transaction(async (tx)"), "queue reconciliation follows GD authorization");
check(queueLoad.indexOf("reconcileOrphanedGovernedPowerRowsForCampaign") < queueLoad.indexOf("tx.campaign.findUnique"), "queue cleanup completes before queue projection");
check(queueServer.includes("counts: grouped.counts"), "queue counts are derived after cleanup");
check(!queueServer.includes("loadCharacterRestrictionGovernance("), "campaign reconciliation avoids per-Character governance calls");
const characterReadStart = governanceServer.indexOf("export async function loadCharacterRestrictionGovernance");
const characterReadEnd = governanceServer.indexOf("export async function loadPlayerRestrictionGovernanceRecord");
const characterRead = governanceServer.slice(characterReadStart, characterReadEnd);
check(characterRead.includes("prisma.$transaction(async (tx)"), "Character governance reconciliation and projection are atomic");
check(characterRead.indexOf("deleteOrphanedGovernedPowerRowsForCharacter") < characterRead.indexOf("playerRestrictionGovernance.findMany"), "Character cleanup precedes its returned governance query");
check(schema.includes("governance             PlayerRestrictionGovernance    @relation(fields: [governanceId], references: [id], onDelete: Cascade)"), "Prisma review-event relation retains cascade deletion");
check(migration.includes('REFERENCES "PlayerRestrictionGovernance"("id") ON DELETE CASCADE'), "deployed governance migration retains database cascade");

console.log(`Restriction deleted-Power governance smoke passed (${checks} checks).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
