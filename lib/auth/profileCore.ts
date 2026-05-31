import { prisma } from "@/prisma/client";

export type AuthProfileUser = {
  id: string;
  email?: string | null;
};

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export async function upsertUserProfileFromAuthUser(user: AuthProfileUser) {
  const email = typeof user.email === "string" ? user.email.trim() : null;
  const emailNormalized = normalizeEmail(email);

  if (!emailNormalized) {
    const existing = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: {
        userId: true,
        email: true,
        emailNormalized: true,
      },
    });

    if (existing) return existing;

    return prisma.userProfile.create({
      data: { userId: user.id },
      select: {
        userId: true,
        email: true,
        emailNormalized: true,
      },
    });
  }

  return prisma.userProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      email,
      emailNormalized,
    },
    update: {
      email,
      emailNormalized,
    },
    select: {
      userId: true,
      email: true,
      emailNormalized: true,
    },
  });
}
