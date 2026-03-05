import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@/prisma/client";

type CampaignAccess = {
  isAdmin: boolean;
  role: string | null;
};

export async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: unknown) {
          cookieStore.set({ name, value, ...(options as Record<string, unknown>) });
        },
        remove(name: string, options: unknown) {
          cookieStore.set({ name, value: "", ...(options as Record<string, unknown>) });
        },
      },
    },
  );
}

export async function requireUserId() {
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  return data.user.id;
}

async function getCampaignMemberRole(campaignId: string, userId: string): Promise<string | null> {
  const membership = await prisma.campaignUser.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

async function getIsAdmin(userId: string): Promise<boolean> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { isAdmin: true },
  });
  return Boolean(profile?.isAdmin);
}

export async function requireCampaignMember(campaignId: string, userId: string) {
  const role = await getCampaignMemberRole(campaignId, userId);
  if (!role) {
    throw new Error("FORBIDDEN");
  }
  return role;
}

export async function requireCampaignAccess(campaignId: string, userId: string): Promise<CampaignAccess> {
  // FORGE_ADMIN_OVERRIDE_AUTH
  // Admin override: GM has True Seeing.
  if (await getIsAdmin(userId)) {
    return { isAdmin: true, role: null };
  }

  const role = await getCampaignMemberRole(campaignId, userId);
  if (!role) {
    throw new Error("FORBIDDEN");
  }

  return { isAdmin: false, role };
}

export async function requireCampaignDirectorOrAdmin(campaignId: string, userId: string) {
  const access = await requireCampaignAccess(campaignId, userId);
  if (!access.isAdmin && access.role !== "GAME_DIRECTOR") {
    throw new Error("FORBIDDEN");
  }
  return access;
}
