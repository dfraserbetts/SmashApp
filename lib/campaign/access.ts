import type { CampaignRole } from "@prisma/client";

import { prisma } from "@/prisma/client";

export type CampaignAccess = {
  campaignId: string;
  userId: string;
  isAdmin: boolean;
  isOwner: boolean;
  role: CampaignRole | null;
  effectiveRole: CampaignRole | null;
  canManagePartyStash: boolean;
};

export type CampaignPermissionSet = {
  canViewCampaign: boolean;
  canManageCampaign: boolean;
  canUsePlayerCampaignTools: boolean;
  canManageCampaignCharacters: boolean;
  canManageCampaignInventory: boolean;
  canManagePartyStash: boolean;
};

export function getCampaignPermissions(access: CampaignAccess | null): CampaignPermissionSet {
  const canViewCampaign = Boolean(access?.isAdmin || access?.effectiveRole);
  const canManageCampaign = Boolean(access?.isAdmin || access?.effectiveRole === "GAME_DIRECTOR");
  const canManagePartyStash = Boolean(canManageCampaign || access?.canManagePartyStash);

  return {
    canViewCampaign,
    canManageCampaign,
    canUsePlayerCampaignTools: canViewCampaign,
    canManageCampaignCharacters: canManageCampaign,
    canManageCampaignInventory: canManageCampaign,
    canManagePartyStash,
  };
}

export function canViewCampaign(access: CampaignAccess | null): boolean {
  return getCampaignPermissions(access).canViewCampaign;
}

export function canManageCampaign(access: CampaignAccess | null): boolean {
  return getCampaignPermissions(access).canManageCampaign;
}

export function canUsePlayerCampaignTools(access: CampaignAccess | null): boolean {
  return getCampaignPermissions(access).canUsePlayerCampaignTools;
}

export function canManageCampaignCharacters(access: CampaignAccess | null): boolean {
  return getCampaignPermissions(access).canManageCampaignCharacters;
}

export function canManageCampaignInventory(access: CampaignAccess | null): boolean {
  return getCampaignPermissions(access).canManageCampaignInventory;
}

export function canManagePartyStash(access: CampaignAccess | null): boolean {
  return getCampaignPermissions(access).canManagePartyStash;
}

export async function getCampaignMembership(
  campaignId: string,
  userId: string,
): Promise<CampaignAccess | null> {
  const [campaign, membership, profile] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { ownerUserId: true },
    }),
    prisma.campaignUser.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
      select: { role: true, canManagePartyStash: true },
    }),
    prisma.userProfile.findUnique({
      where: { userId },
      select: { isAdmin: true },
    }),
  ]);

  if (!campaign) return null;

  const isAdmin = Boolean(profile?.isAdmin);
  const isOwner = campaign.ownerUserId === userId;
  const role = membership?.role ?? null;
  const effectiveRole: CampaignRole | null = isOwner ? "GAME_DIRECTOR" : role;
  const canManagePartyStashFlag = Boolean(membership?.canManagePartyStash && role);

  return {
    campaignId,
    userId,
    isAdmin,
    isOwner,
    role,
    effectiveRole,
    canManagePartyStash: canManagePartyStashFlag,
  };
}

export async function requireCampaignAccess(
  campaignId: string,
  userId: string,
): Promise<CampaignAccess> {
  const access = await getCampaignMembership(campaignId, userId);
  if (!access) {
    throw new Error("NOT_FOUND");
  }
  if (!canViewCampaign(access)) {
    throw new Error("FORBIDDEN");
  }
  return access;
}

export async function requireCampaignGameDirector(
  campaignId: string,
  userId: string,
): Promise<CampaignAccess> {
  const access = await requireCampaignAccess(campaignId, userId);
  if (!canManageCampaign(access)) {
    throw new Error("FORBIDDEN");
  }
  return access;
}

export async function requireCampaignMemberRole(
  campaignId: string,
  userId: string,
): Promise<CampaignRole> {
  const access = await requireCampaignAccess(campaignId, userId);
  if (!access.effectiveRole) {
    throw new Error("FORBIDDEN");
  }
  return access.effectiveRole;
}
