import {
  requireCampaignAccess as requireSharedCampaignAccess,
  requireCampaignGameDirector,
  requireCampaignMemberRole,
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
  const access = await requireSharedCampaignAccess(campaignId, userId);
  return { isAdmin: access.isAdmin, role: access.effectiveRole };
}

export async function requireCampaignDirectorOrAdmin(campaignId: string, userId: string) {
  const access = await requireCampaignGameDirector(campaignId, userId);
  return { isAdmin: access.isAdmin, role: access.effectiveRole };
}

/*
Manual verification:
1) As admin not in campaign, load forge/summoning deep links under /campaign/[campaignId]/...
2) Confirm reads succeed (no 403) and save/update/delete actions still work.
3) Confirm non-admin non-member still receives 403.
*/
