import "server-only";

import { prisma } from "@/prisma/client";
import { normalizeEmail } from "./profileCore";

export {
  normalizeEmail,
  upsertUserProfileFromAuthUser,
} from "./profileCore";
export type { AuthProfileUser } from "./profileCore";

export async function findUserProfileByEmail(email: unknown) {
  const emailNormalized = normalizeEmail(email);
  if (!emailNormalized) return null;

  return prisma.userProfile.findUnique({
    where: { emailNormalized },
  });
}
