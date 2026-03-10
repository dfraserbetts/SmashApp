import "server-only";

import { prisma } from "@/prisma/client";
import {
  DEFAULT_PROTECTION_K,
  DEFAULT_PROTECTION_S,
  normalizeProtectionTuning,
  type ProtectionTuningValues,
} from "@/lib/config/combatTuningShared";

export { DEFAULT_PROTECTION_K, DEFAULT_PROTECTION_S };

export async function getProtectionTuning(): Promise<ProtectionTuningValues> {
  const row = await prisma.combatTuning.findFirst({
    orderBy: [{ updatedAt: "desc" }],
    select: { protectionK: true, protectionS: true },
  });

  return normalizeProtectionTuning(row?.protectionK, row?.protectionS);
}
