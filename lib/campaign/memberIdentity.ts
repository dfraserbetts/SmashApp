import { createClient } from "@supabase/supabase-js";
import { normalizeEmail, upsertUserProfileFromAuthUser } from "@/lib/auth/profile";
import { prisma } from "@/prisma/client";

type MemberIdentity = {
  userId: string;
  email: string | null;
};

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function getMemberIdentities(userIds: string[]): Promise<Map<string, MemberIdentity>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const identities = new Map<string, MemberIdentity>(
    uniqueUserIds.map((userId) => [userId, { userId, email: null }]),
  );

  const profiles = await prisma.userProfile.findMany({
    where: { userId: { in: uniqueUserIds } },
    select: { userId: true, email: true },
  });

  for (const profile of profiles) {
    if (profile.email) {
      identities.set(profile.userId, {
        userId: profile.userId,
        email: profile.email,
      });
    }
  }

  const missingEmailUserIds = uniqueUserIds.filter(
    (userId) => !identities.get(userId)?.email,
  );
  if (missingEmailUserIds.length === 0) return identities;

  const supabase = getServiceSupabase();
  if (!supabase) return identities;

  await Promise.all(
    missingEmailUserIds.map(async (userId) => {
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error) return;
      const email = data.user?.email ?? null;
      identities.set(userId, {
        userId,
        email,
      });

      if (normalizeEmail(email)) {
        await upsertUserProfileFromAuthUser({ id: userId, email }).catch(() => {});
      }
    }),
  );

  return identities;
}

export function getMemberIdentityLabel(identity: MemberIdentity | undefined): string {
  return identity?.email ?? identity?.userId ?? "";
}
