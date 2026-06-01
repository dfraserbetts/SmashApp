import {
  requireCampaignGameDirector,
  requireCampaignMemberRole,
  requireCampaignOwner,
} from "@/lib/campaign/access";
import {
  getSupabaseServer,
  requireUserId,
} from "@/lib/auth/server";

export { getSupabaseServer, requireUserId };

export async function requireCampaignMember(campaignId: string, userId: string) {
  return requireCampaignMemberRole(campaignId, userId);
}

export async function requireCampaignAccess(campaignId: string, userId: string) {
  const access = await requireCampaignGameDirector(campaignId, userId);
  return { isAdmin: access.isAdmin, role: access.effectiveRole };
}

export async function requireCampaignDirectorOrAdmin(campaignId: string, userId: string) {
  const access = await requireCampaignGameDirector(campaignId, userId);
  return { isAdmin: access.isAdmin, role: access.effectiveRole };
}

export async function requireCampaignOwnerAccess(campaignId: string, userId: string) {
  const access = await requireCampaignOwner(campaignId, userId);
  return { isAdmin: access.isAdmin, role: access.effectiveRole };
}

/*
Manual verification:
1) As admin not in campaign, load forge/summoning deep links under /campaign/[campaignId]/...
2) Confirm reads/saves succeed (no 403) and owner-only delete actions still work for owners.
3) Confirm normal Players and non-members receive 403 for campaign-bound routes.
*/
