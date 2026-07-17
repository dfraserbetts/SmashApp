import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
function check(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  checks += 1;
}
function count(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

const serverPath = "lib/restrictions/governanceServer.ts";
const lifecyclePath = "lib/restrictions/governanceLifecycle.ts";
const resolverPath = "lib/restrictions/playerRestrictionConsumerResolver.ts";
const characterRoutePath =
  "app/api/campaigns/[id]/characters/[characterId]/restriction-governance/route.ts";
const approveRoutePath =
  "app/api/campaigns/[id]/restriction-governance/[governanceId]/approve/route.ts";
const requestChangesRoutePath =
  "app/api/campaigns/[id]/restriction-governance/[governanceId]/request-changes/route.ts";
const builderRoutePath = "app/api/campaigns/[id]/characters/[characterId]/builder/route.ts";

const server = readFileSync(serverPath, "utf8");
const lifecycle = readFileSync(lifecyclePath, "utf8");
const resolver = readFileSync(resolverPath, "utf8");
const characterRoute = readFileSync(characterRoutePath, "utf8");
const approveRoute = readFileSync(approveRoutePath, "utf8");
const requestChangesRoute = readFileSync(requestChangesRoutePath, "utf8");
const builderRoute = readFileSync(builderRoutePath, "utf8");

// Server-only centralization and thin authenticated routes.
check(/^import "server-only";/u.test(server), "Lifecycle service must be server-only.");
for (const [path, source] of [
  [characterRoutePath, characterRoute],
  [approveRoutePath, approveRoute],
  [requestChangesRoutePath, requestChangesRoute],
] as const) {
  check(source.includes("requireUserId"), `${path} authenticates with the current helper.`);
  check(source.includes("await requireUserId()"), `${path} derives actor identity on the server.`);
  check(!/from ["']@\/prisma\/client["']|\bprisma\.|\$transaction/u.test(source), `${path} contains no Prisma transaction logic.`);
  check(source.includes("RestrictionGovernanceServiceError"), `${path} returns stable service errors.`);
  check(source.includes("code:"), `${path} returns a stable response code.`);
  check(source.includes("request.json().catch"), `${path} parses JSON defensively.`);
  check(!/submittedByUserId|reviewedByUserId|actorUserId\?:|semanticDefinitionJson|submittedFingerprint|approvedFingerprint/u.test(source), `${path} accepts no client-manufactured provenance or semantic snapshot.`);
}
check(characterRoute.includes("loadCharacterRestrictionGovernance"), "GET delegates to the centralized read service.");
check(characterRoute.includes("submitCurrentPlayerRestriction"), "POST delegates to the centralized submit service.");
check(approveRoute.includes("approvePlayerRestriction"), "Approve route delegates to centralized service.");
check(requestChangesRoute.includes("requestPlayerRestrictionChanges"), "Request Changes route delegates to centralized service.");
check(characterRoute.includes("export async function GET"), "Character governance route exposes GET.");
check(characterRoute.includes("export async function POST"), "Character governance route exposes POST.");
check(approveRoute.includes("export async function POST"), "Approve action is explicit POST.");
check(requestChangesRoute.includes("export async function POST"), "Request Changes action is explicit POST.");

// Authorization is repeated inside transaction-sensitive service operations.
check(server.includes("requireCampaignAccess(params.campaignId, params.actorUserId)"), "Submission/read performs current campaign access preflight.");
check(count(server, /requireCampaignGameDirector\(params\.campaignId, params\.actorUserId\)/gu) === 2, "Approve and Request Changes require current GD/admin helper authority.");
check(server.includes("character.assignedUserId !== params.actorUserId"), "Submission permits the assigned active player.");
check(server.includes("canManageCampaignCharacters"), "Submission and review recognize campaign management authority.");
check(server.includes("character.archivedAt"), "Write service rechecks archived Character state.");
check(server.includes("loadTransactionalAccess"), "Write service rechecks access inside transactions.");
check(server.includes("campaignId: params.campaignId"), "Every action scopes persistence by route campaign.");

// Transactionality, immutable events, and optimistic concurrency.
check(count(server, /prisma\.\$transaction\(async \(tx\)/gu) === 4, "All three lifecycle writes and the cleanup-aware Character read use callback transactions.");
check(server.includes("normalizePlayerRestrictionGovernanceRow(step.row)"), "Every proposed current row is revalidated before write.");
check(server.includes("normalizePlayerRestrictionReviewEvent(step.event)"), "Every proposed immutable event is revalidated before write.");
check(server.includes("playerRestrictionReviewEvent.create"), "Actions append review events.");
check(!/playerRestrictionReviewEvent\.(?:update|updateMany|upsert|delete)/u.test(server), "Review events remain append-only.");
check(server.includes("playerRestrictionGovernance.updateMany"), "Existing rows use conditional update semantics.");
check(server.includes("updated.count !== 1"), "A lost conditional update becomes a conflict.");
check(server.includes("submissionRevision: step.expectedSubmissionRevision"), "Conditional updates require the expected revision.");
check(server.includes("lifecycle: step.expectedLifecycle"), "Conditional updates require the expected lifecycle.");
check(server.includes('error.code === "P2002"'), "Concurrent first submissions handle unique-locator conflicts.");
check(server.includes("GOVERNANCE_CONCURRENCY_CONFLICT"), "Concurrency failure uses a stable conflict code.");
check(count(characterRoute + approveRoute + requestChangesRoute, /EXPECTED_SUBMISSION_REVISION_REQUIRED/gu) === 3, "Every write route requires expected submission revision.");
check(lifecycle.includes('operation: current ? "UPDATE" : "CREATE"'), "First submit and resubmit have distinct persistence operations.");
check(lifecycle.includes('action: "APPROVAL_STALE"'), "Stale-and-resubmit plans an immutable stale event.");
check(lifecycle.includes('action: "SUBMITTED"'), "Submission plans an immutable Submitted event.");
check(lifecycle.includes('action: "APPROVED"'), "Approval plans an immutable Approved event.");
check(lifecycle.includes('action: "CHANGES_REQUESTED"'), "Request Changes plans an immutable event.");

// Live semantics, pending immutability, unsupported safety, and read-currentness.
check(server.includes("normalizeBuilderData(builderDataValue)"), "Server loads normalized saved CharacterBuilderData.");
check(server.includes("resolvePlayerRestrictionConsumer"), "Server resolves exact live consumer semantics.");
check(resolver.includes("normalizePlayerRestrictionSnapshot"), "Resolver reuses persistence normalization and fingerprinting.");
check(resolver.includes("DUPLICATE_PLAYER_RESTRICTION_CONSUMER_ID"), "Resolver rejects duplicate stable IDs.");
check(resolver.includes("PLAYER_RESTRICTION_CONSUMER_TYPE_MISMATCH"), "Resolver detects type mismatch.");
check(resolver.includes("UNRESOLVED_LEGACY_RESTRICTION_REVIEW"), "Resolver preserves unresolved legacy review.");
check(lifecycle.includes("PENDING_PROPOSAL_IMMUTABLE"), "Pending proposal cannot be overwritten.");
check(lifecycle.includes("UNSUPPORTED_RESTRICTION_CANNOT_BE_APPROVED"), "Safe unsupported definitions cannot be approved.");
check(lifecycle.includes("LIVE_RESTRICTION_DOES_NOT_MATCH_SUBMISSION"), "Approval checks live fingerprint against submitted fingerprint.");
check(server.includes('PRODUCTION_SELF_APPROVAL_POLICY: SelfApprovalPolicy = "UNRESOLVED"'), "Production self-approval policy remains explicitly unresolved.");
check(lifecycle.includes("SELF_APPROVAL_POLICY_UNRESOLVED"), "Same-submitter review returns a stable unresolved-policy conflict.");
check(server.includes("derivePlayerRestrictionGovernanceReadFacts"), "Server delegates currentness to pure read facts.");
check(lifecycle.includes('effectiveLifecycle: RestrictionLifecycleState'), "Read facts derive an effective lifecycle.");
check(lifecycle.includes('? "APPROVAL_STALE"'), "Approved fingerprint mismatch derives effective Stale.");
check(lifecycle.includes(': "DRAFT"'), "Missing governance can derive synthetic Draft.");
check(server.includes("submittedProposalMatchesLiveDefinition"), "Pending/live match is exposed.");
check(server.includes("approvedProposalMatchesLiveDefinition"), "Approved/live match is exposed.");
check(server.includes("orderBy: [{ createdAt: \"asc\" }, { id: \"asc\" }]"), "History ordering is deterministic.");
check(server.includes("if (!stored && !live.normalizedSnapshot)") || lifecycle.includes("!params.currentRow && !params.live.normalizedSnapshot"), "Unrestricted content creates no synthetic row.");
check(server.includes("consumerPresence"), "Orphaned/deleted consumer presence is retained in read response.");
check(!/\bemail\b/iu.test(server), "Governance read service exposes no email addresses.");

// Explicit exclusions and existing Builder boundary.
for (const [path, source] of [
  [serverPath, server],
  [lifecyclePath, lifecycle],
  [resolverPath, resolver],
] as const) {
  check(!/restrictions\/economics|resolvePlayerPowerDrawbackEconomics|drawbackTuning|restrictionDiscountPercent/iu.test(source), `${path} imports or applies no economics.`);
  check(!/MONSTER_POWER|MonsterRestriction/iu.test(source), `${path} contains no Monster governance path.`);
  check(!/Activation Cost|Backlash|Spark|Blaze|Combat Lab/iu.test(source), `${path} contains no deferred runtime mechanics.`);
}
check(!builderRoute.includes("governanceServer"), "Character Builder PATCH route has no lifecycle integration.");
check(!builderRoute.includes("PlayerRestrictionGovernance"), "Ordinary Builder save creates no governance rows.");

console.log(`Restriction governance server static smoke passed (${checks} checks).`);
