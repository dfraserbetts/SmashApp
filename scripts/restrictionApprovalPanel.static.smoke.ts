import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let checks = 0;

function check(condition: unknown, message: string): asserts condition {
  checks += 1;
  if (!condition) throw new Error(`Check ${checks} failed: ${message}`);
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const view = source("lib/restrictions/governanceQueueView.ts");
const server = source("lib/restrictions/governanceQueueServer.ts");
const governanceServer = source("lib/restrictions/governanceServer.ts");
const route = source("app/api/campaigns/[id]/restriction-governance/route.ts");
const nav = source("app/components/CampaignNav.tsx");
const page = source("app/campaign/[id]/approvals/page.tsx");
const panel = source("app/components/restrictions/CampaignRestrictionApprovalPanel.tsx");

check(!view.includes("server-only"), "queue view contract is not server-only");
check(!view.includes("@prisma/client"), "queue view contract does not import Prisma");
check(!view.includes("react"), "queue view contract does not import React");
check(!view.includes("window."), "queue view contract has no browser globals");
check(view.includes("groupCampaignRestrictionQueueItems"), "queue grouping helper exists");
check(view.includes("resolveRestrictionQueuePlayerLabel"), "privacy-safe player-label helper exists");
check(view.includes("getCampaignRestrictionApprovalEligibility"), "approval eligibility helper exists");
check(view.includes("canRequestCampaignRestrictionChanges"), "Request Changes note helper exists");
check(view.includes('"PENDING"'), "Pending filter exists");
check(view.includes('"CHANGES_REQUESTED"'), "Changes Requested filter exists");
check(view.includes('"APPROVAL_STALE"'), "Approval Stale filter exists");
check(view.includes('"RECENTLY_APPROVED"'), "Recently Approved filter exists");
check(view.includes("recentApprovedLimit = 25"), "Recently Approved defaults to a bounded 25 items");
check(!view.includes("email"), "queue contract has no email field");
check(!view.includes("actorUserId"), "queue contract has no raw actor ID field");
check(!view.includes("submittedByUserId"), "queue contract has no submitter ID field");
check(!view.includes("reviewedByUserId"), "queue contract has no reviewer ID field");

check(server.startsWith('import "server-only";'), "campaign queue service is server-only");
check(server.includes("requireCampaignGameDirector"), "queue service requires GD/admin campaign authority");
check(server.includes("playerRestrictionGovernance"), "queue service loads campaign governance rows");
check(server.includes("character: {"), "queue service loads Character context in the bounded campaign projection");
check(server.includes("members: {"), "queue service loads playerName membership context in the bounded projection");
check(server.includes("events: { orderBy:"), "queue service loads deterministically ordered immutable history");
check(server.includes("builderDataByCharacterId"), "queue service caches normalized builderData per Character");
check(!server.includes("loadCharacterRestrictionGovernance"), "queue service does not perform one Character service call per Character");
check(!server.includes("getMemberIdentities"), "queue service does not load email identities");
check(!server.includes("planApproveRestriction"), "queue service does not duplicate approval transitions");
check(!server.includes("planRequestRestrictionChanges"), "queue service does not duplicate Request Changes transitions");
check(server.includes("buildPersistedPlayerRestrictionGovernanceReadEntry"), "queue service reuses the B2/C1 read authority");
check(governanceServer.includes("export function buildPersistedPlayerRestrictionGovernanceReadEntry"), "governance server exposes a narrow shared projection helper");
check(server.includes("renderPowerDescriptorLines"), "Power and Signature ordinary descriptors reuse the shared renderer");
check(server.includes("renderRoleplayAbilityDescriptor"), "Roleplay ordinary descriptors reuse the shared renderer");
check(server.includes("getRestrictionReadOnlyModel"), "immutable and current Restriction descriptors reuse the read-only model");
check(server.includes("PRODUCTION_SELF_APPROVAL_POLICY"), "queue blocker mirrors the unresolved production self-policy seam");
check(server.includes("requestChangesAvailable"), "queue returns authoritative Request Changes availability");
check(!server.includes("resolvePlayerPowerDrawbackEconomics"), "queue service activates no economics");
check(!server.includes("restrictionDiscountPercent"), "queue service does not mutate discount placeholders");

check(route.includes("export async function GET"), "campaign queue route provides GET");
check(!route.includes("export async function POST"), "campaign queue route adds no POST transition");
check(route.includes('searchParams.get("summary") === "1"'), "queue route supports summary mode");
check(route.includes("loadCampaignRestrictionGovernanceSummary"), "summary mode delegates to the queue service");
check(route.includes("loadCampaignRestrictionGovernanceQueue"), "full mode delegates to the queue service");
check(route.includes("requireUserId"), "queue route requires authentication");

check(nav.includes("canManageCampaign"), "CampaignNav reuses current management authority");
check(nav.includes("/approvals"), "CampaignNav exposes the Approvals destination");
check(nav.includes("restriction-governance?summary=1"), "CampaignNav uses the server-authoritative queue summary");
check(nav.includes("pendingApprovalCount > 0"), "CampaignNav displays the Pending count only above zero");
check(nav.includes("`Approvals (${pendingApprovalCount})`"), "CampaignNav formats Approvals (N)");
check(nav.includes("if (!campaignId || !canManageCampaign)"), "ordinary players do not fetch the summary");
check(nav.includes("setPendingApprovalCount(null)"), "summary failure does not fabricate zero or break navigation");

check(page.includes("Restriction Approvals"), "approval page has the required heading");
check(page.includes("CampaignNav"), "approval page uses CampaignNav");
check(page.includes("/restriction-governance`"), "approval page loads the dedicated queue endpoint");
check(page.includes('router.push("/login")'), "approval page redirects unauthenticated users to login");
check(page.includes("Only a campaign Game Director or administrator"), "approval page has a clear 403 state");
check(page.includes("Campaign not found."), "approval page has a clear 404 state");
check(page.includes("Existing queue data has been preserved"), "refresh failure preserves existing queue data");
check(page.includes("expectedSubmissionRevision: item.submissionRevision"), "actions send the authoritative current revision");
check(page.includes("selectedTier: draft.selectedTier"), "approval sends the selected tier");
check(page.includes("notes: draft.notes.trim()"), "actions send trimmed player-facing notes");
check(!page.includes("semanticSnapshot"), "client actions send no semantic snapshot");
check(!page.includes("semanticFingerprint"), "client actions send no fingerprint");
check(!page.includes("reviewerIdentity"), "client actions send no reviewer identity");
check(!page.includes("reviewedByUserId"), "client actions send no reviewer user ID");
check(page.includes('routeSuffix = action === "APPROVE" ? "approve" : "request-changes"'), "page reuses the existing authenticated action routes");
check(page.includes("res.status === 409"), "revision conflict is detected");
check(page.includes("await loadQueue(true)"), "successful and conflicting actions refetch the queue");
check(!page.includes("retry"), "the page does not automatically retry a conflicted action");
check(page.includes("SELF_APPROVAL_POLICY_UNRESOLVED"), "self-policy server conflict receives dedicated handling");
check(page.includes("self-approval policy has not yet been decided"), "self-policy explanation is exact and non-doctrinal");
check(page.includes('setActiveFilter(action === "APPROVE" ? "RECENTLY_APPROVED" : "CHANGES_REQUESTED")'), "successful actions move to the matching read-only view");
check(page.includes("restriction-governance-queue-updated"), "successful queue loads refresh the navigation count");
check(!page.includes("resolvePlayerPowerDrawbackEconomics"), "approval page activates no economics");

check(panel.includes("Proposed Restriction"), "panel shows the immutable proposed descriptor");
check(panel.includes("Ability Context"), "panel shows ordinary Ability context");
check(panel.includes("Current Saved Restriction"), "panel shows the current saved descriptor when relevant");
check(panel.includes("Restriction Tier"), "panel has an explicit tier selector label");
check(panel.includes("Select a Restriction Tier…"), "tier selector has the mandatory default choice");
check(panel.includes("Notes to Player"), "panel has the player-facing Notes field");
check(panel.includes("Request Changes"), "panel uses the required Request Changes label");
check(panel.includes("Approve and Apply Tier"), "panel uses the required approval label");
check(panel.includes("approvalEligibility.canApprove"), "approval remains disabled until all client eligibility checks pass");
check(panel.includes("Request Changes requires a nonblank Note to Player"), "blank notes visibly disable Request Changes");
check(panel.includes("Economic credit is not active yet"), "panel includes the exact economics-inactive notice");
check(panel.includes("does not currently change Power spend or cooldown"), "panel states approval does not change spend or cooldown");
check(panel.includes("Oath Limitation qualification"), "panel includes the Oath qualification warning");
check(panel.includes("No numeric Oath credit is active"), "panel does not imply a numeric Oath rate");
check(!panel.includes("40%"), "panel does not encode the candidate Oath rate");
check(panel.includes("Immutable review history"), "panel exposes compact immutable history");
check(panel.includes("Consumer no longer exists on the Character"), "panel explains orphaned consumers");
check(panel.includes("preserved but unsupported by the current Restriction registry"), "panel explains safe unsupported proposals");
check(panel.includes("saved Restriction has changed since submission"), "panel explains submitted/live mismatch");
check(panel.includes("Character archived — approval is unavailable"), "panel explains actual archived approval behavior");
check(!panel.includes("actorUserId"), "panel displays no raw actor ID");
check(!panel.includes("submittedByUserId"), "panel displays no submitter ID");
check(!panel.includes("email"), "panel displays no email");
check(!panel.includes("Net BPV"), "panel displays no Net BPV");
check(!panel.includes("Player Point"), "panel displays no Player Point credit");
check(!panel.includes("resolvePlayerPowerDrawbackEconomics"), "panel invokes no economic resolver");

console.log(`Restriction approval panel static smoke passed (${checks} checks).`);
