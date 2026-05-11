import "server-only";

import { prisma } from "@/prisma/client";
import {
  DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  normalizeCharacterPowerSpendScalar,
  validateCharacterPowerSpendScalar,
  type CharacterBuilderTuningSnapshot,
} from "@/lib/config/characterBuilderTuningShared";

const SINGLETON_ID = "default";

function toSnapshot(row: { playerPowerSpendScalar: number; updatedAt: Date | null }): CharacterBuilderTuningSnapshot {
  return {
    playerPowerSpendScalar: normalizeCharacterPowerSpendScalar(row.playerPowerSpendScalar),
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

export async function ensureCharacterBuilderTuning(): Promise<CharacterBuilderTuningSnapshot> {
  const row = await prisma.characterBuilderTuning.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: {
      id: SINGLETON_ID,
      playerPowerSpendScalar: DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
    },
    select: {
      playerPowerSpendScalar: true,
      updatedAt: true,
    },
  });

  return toSnapshot(row);
}

export async function saveCharacterBuilderTuning(params: {
  playerPowerSpendScalar: unknown;
}): Promise<CharacterBuilderTuningSnapshot> {
  const validation = validateCharacterPowerSpendScalar(params.playerPowerSpendScalar);
  if (!validation.ok) throw new Error("INVALID_CHARACTER_POWER_SPEND_SCALAR");

  const row = await prisma.characterBuilderTuning.upsert({
    where: { id: SINGLETON_ID },
    update: {
      playerPowerSpendScalar: validation.value,
    },
    create: {
      id: SINGLETON_ID,
      playerPowerSpendScalar: validation.value,
    },
    select: {
      playerPowerSpendScalar: true,
      updatedAt: true,
    },
  });

  return toSnapshot(row);
}
