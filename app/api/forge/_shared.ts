import {
  requireCampaignGameDirector,
  requireCampaignMemberRole,
} from "@/lib/campaign/access";
import {
  getSupabaseServer,
  requireUserId,
} from "@/lib/auth/server";

type CampaignAccess = {
  isAdmin: boolean;
  role: string | null;
};

export { getSupabaseServer, requireUserId };

export async function requireCampaignMember(campaignId: string, userId: string) {
  return requireCampaignMemberRole(campaignId, userId);
}

export async function requireCampaignAccess(campaignId: string, userId: string): Promise<CampaignAccess> {
  const access = await requireCampaignGameDirector(campaignId, userId);
  return { isAdmin: access.isAdmin, role: access.effectiveRole };
}

export async function requireCampaignDirectorOrAdmin(campaignId: string, userId: string) {
  const access = await requireCampaignGameDirector(campaignId, userId);
  return { isAdmin: access.isAdmin, role: access.effectiveRole };
}
