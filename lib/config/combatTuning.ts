import "server-only";

import { prisma } from "@/prisma/client";
import {
  normalizeCombatTuning,
  DEFAULT_PROTECTION_K,
  DEFAULT_PROTECTION_S,
  type ProtectionTuningValues,
} from "@/lib/config/combatTuningShared";

export { DEFAULT_PROTECTION_K, DEFAULT_PROTECTION_S };

export type CombatTuningRow = ProtectionTuningValues & {
  id: string;
  updatedAt: Date;
};

function rowsEqual(a: ProtectionTuningValues, b: ProtectionTuningValues): boolean {
  return (
    a.protectionK === b.protectionK &&
    a.protectionS === b.protectionS &&
    a.attackWeight === b.attackWeight &&
    a.defenceWeight === b.defenceWeight &&
    a.fortitudeWeight === b.fortitudeWeight &&
    a.intellectWeight === b.intellectWeight &&
    a.supportWeight === b.supportWeight &&
    a.braveryWeight === b.braveryWeight &&
    a.minionTierMultiplier === b.minionTierMultiplier &&
    a.soldierTierMultiplier === b.soldierTierMultiplier &&
    a.eliteTierMultiplier === b.eliteTierMultiplier &&
    a.bossTierMultiplier === b.bossTierMultiplier &&
    a.expectedPhysicalResilienceAt1 === b.expectedPhysicalResilienceAt1 &&
    a.expectedPhysicalResiliencePerLevel === b.expectedPhysicalResiliencePerLevel &&
    a.expectedMentalPerseveranceAt1 === b.expectedMentalPerseveranceAt1 &&
    a.expectedMentalPerseverancePerLevel === b.expectedMentalPerseverancePerLevel &&
    a.expectedPoolMinionMultiplier === b.expectedPoolMinionMultiplier &&
    a.expectedPoolSoldierMultiplier === b.expectedPoolSoldierMultiplier &&
    a.expectedPoolEliteMultiplier === b.expectedPoolEliteMultiplier &&
    a.expectedPoolBossMultiplier === b.expectedPoolBossMultiplier &&
    a.poolWeakerSideWeight === b.poolWeakerSideWeight &&
    a.poolAverageWeight === b.poolAverageWeight &&
    a.poolBelowExpectedMaxPenaltyShare === b.poolBelowExpectedMaxPenaltyShare &&
    a.poolBelowExpectedScale === b.poolBelowExpectedScale &&
    a.poolAboveExpectedMaxBonusShare === b.poolAboveExpectedMaxBonusShare &&
    a.poolAboveExpectedScale === b.poolAboveExpectedScale
  );
}

export async function getLatestCombatTuningRow(): Promise<CombatTuningRow | null> {
  const rows = await prisma.$queryRaw<CombatTuningRow[]>`
    SELECT
      "id",
      "protectionK",
      "protectionS",
      "attackWeight",
      "defenceWeight",
      "fortitudeWeight",
      "intellectWeight",
      "supportWeight",
      "braveryWeight",
      "minionTierMultiplier",
      "soldierTierMultiplier",
      "eliteTierMultiplier",
      "bossTierMultiplier",
      "expectedPhysicalResilienceAt1",
      "expectedPhysicalResiliencePerLevel",
      "expectedMentalPerseveranceAt1",
      "expectedMentalPerseverancePerLevel",
      "expectedPoolMinionMultiplier",
      "expectedPoolSoldierMultiplier",
      "expectedPoolEliteMultiplier",
      "expectedPoolBossMultiplier",
      "poolWeakerSideWeight",
      "poolAverageWeight",
      "poolBelowExpectedMaxPenaltyShare",
      "poolBelowExpectedScale",
      "poolAboveExpectedMaxBonusShare",
      "poolAboveExpectedScale",
      "updatedAt"
    FROM "CombatTuning"
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function ensureCombatTuningRow(): Promise<CombatTuningRow> {
  const existing = await getLatestCombatTuningRow();
  const normalized = normalizeCombatTuning(existing);

  if (existing) {
    if (rowsEqual(existing, normalized)) return existing;

    const rows = await prisma.$queryRaw<CombatTuningRow[]>`
      UPDATE "CombatTuning"
      SET
        "protectionK" = ${normalized.protectionK},
        "protectionS" = ${normalized.protectionS},
        "attackWeight" = ${normalized.attackWeight},
        "defenceWeight" = ${normalized.defenceWeight},
        "fortitudeWeight" = ${normalized.fortitudeWeight},
        "intellectWeight" = ${normalized.intellectWeight},
        "supportWeight" = ${normalized.supportWeight},
        "braveryWeight" = ${normalized.braveryWeight},
        "minionTierMultiplier" = ${normalized.minionTierMultiplier},
        "soldierTierMultiplier" = ${normalized.soldierTierMultiplier},
        "eliteTierMultiplier" = ${normalized.eliteTierMultiplier},
        "bossTierMultiplier" = ${normalized.bossTierMultiplier},
        "expectedPhysicalResilienceAt1" = ${normalized.expectedPhysicalResilienceAt1},
        "expectedPhysicalResiliencePerLevel" = ${normalized.expectedPhysicalResiliencePerLevel},
        "expectedMentalPerseveranceAt1" = ${normalized.expectedMentalPerseveranceAt1},
        "expectedMentalPerseverancePerLevel" = ${normalized.expectedMentalPerseverancePerLevel},
        "expectedPoolMinionMultiplier" = ${normalized.expectedPoolMinionMultiplier},
        "expectedPoolSoldierMultiplier" = ${normalized.expectedPoolSoldierMultiplier},
        "expectedPoolEliteMultiplier" = ${normalized.expectedPoolEliteMultiplier},
        "expectedPoolBossMultiplier" = ${normalized.expectedPoolBossMultiplier},
        "poolWeakerSideWeight" = ${normalized.poolWeakerSideWeight},
        "poolAverageWeight" = ${normalized.poolAverageWeight},
        "poolBelowExpectedMaxPenaltyShare" = ${normalized.poolBelowExpectedMaxPenaltyShare},
        "poolBelowExpectedScale" = ${normalized.poolBelowExpectedScale},
        "poolAboveExpectedMaxBonusShare" = ${normalized.poolAboveExpectedMaxBonusShare},
        "poolAboveExpectedScale" = ${normalized.poolAboveExpectedScale},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${existing.id}
      RETURNING
        "id",
        "protectionK",
        "protectionS",
        "attackWeight",
        "defenceWeight",
        "fortitudeWeight",
        "intellectWeight",
        "supportWeight",
        "braveryWeight",
        "minionTierMultiplier",
        "soldierTierMultiplier",
        "eliteTierMultiplier",
        "bossTierMultiplier",
        "expectedPhysicalResilienceAt1",
        "expectedPhysicalResiliencePerLevel",
        "expectedMentalPerseveranceAt1",
        "expectedMentalPerseverancePerLevel",
        "expectedPoolMinionMultiplier",
        "expectedPoolSoldierMultiplier",
        "expectedPoolEliteMultiplier",
        "expectedPoolBossMultiplier",
        "poolWeakerSideWeight",
        "poolAverageWeight",
        "poolBelowExpectedMaxPenaltyShare",
        "poolBelowExpectedScale",
        "poolAboveExpectedMaxBonusShare",
        "poolAboveExpectedScale",
        "updatedAt"
    `;

    return rows[0];
  }

  const id = crypto.randomUUID();
  const rows = await prisma.$queryRaw<CombatTuningRow[]>`
    INSERT INTO "CombatTuning" (
      "id",
      "protectionK",
      "protectionS",
      "attackWeight",
      "defenceWeight",
      "fortitudeWeight",
      "intellectWeight",
      "supportWeight",
      "braveryWeight",
      "minionTierMultiplier",
      "soldierTierMultiplier",
      "eliteTierMultiplier",
      "bossTierMultiplier",
      "expectedPhysicalResilienceAt1",
      "expectedPhysicalResiliencePerLevel",
      "expectedMentalPerseveranceAt1",
      "expectedMentalPerseverancePerLevel",
      "expectedPoolMinionMultiplier",
      "expectedPoolSoldierMultiplier",
      "expectedPoolEliteMultiplier",
      "expectedPoolBossMultiplier",
      "poolWeakerSideWeight",
      "poolAverageWeight",
      "poolBelowExpectedMaxPenaltyShare",
      "poolBelowExpectedScale",
      "poolAboveExpectedMaxBonusShare",
      "poolAboveExpectedScale"
    )
    VALUES (
      ${id},
      ${normalized.protectionK},
      ${normalized.protectionS},
      ${normalized.attackWeight},
      ${normalized.defenceWeight},
      ${normalized.fortitudeWeight},
      ${normalized.intellectWeight},
      ${normalized.supportWeight},
      ${normalized.braveryWeight},
      ${normalized.minionTierMultiplier},
      ${normalized.soldierTierMultiplier},
      ${normalized.eliteTierMultiplier},
      ${normalized.bossTierMultiplier},
      ${normalized.expectedPhysicalResilienceAt1},
      ${normalized.expectedPhysicalResiliencePerLevel},
      ${normalized.expectedMentalPerseveranceAt1},
      ${normalized.expectedMentalPerseverancePerLevel},
      ${normalized.expectedPoolMinionMultiplier},
      ${normalized.expectedPoolSoldierMultiplier},
      ${normalized.expectedPoolEliteMultiplier},
      ${normalized.expectedPoolBossMultiplier},
      ${normalized.poolWeakerSideWeight},
      ${normalized.poolAverageWeight},
      ${normalized.poolBelowExpectedMaxPenaltyShare},
      ${normalized.poolBelowExpectedScale},
      ${normalized.poolAboveExpectedMaxBonusShare},
      ${normalized.poolAboveExpectedScale}
    )
    RETURNING
      "id",
      "protectionK",
      "protectionS",
      "attackWeight",
      "defenceWeight",
      "fortitudeWeight",
      "intellectWeight",
      "supportWeight",
      "braveryWeight",
      "minionTierMultiplier",
      "soldierTierMultiplier",
      "eliteTierMultiplier",
      "bossTierMultiplier",
      "expectedPhysicalResilienceAt1",
      "expectedPhysicalResiliencePerLevel",
      "expectedMentalPerseveranceAt1",
      "expectedMentalPerseverancePerLevel",
      "expectedPoolMinionMultiplier",
      "expectedPoolSoldierMultiplier",
      "expectedPoolEliteMultiplier",
      "expectedPoolBossMultiplier",
      "poolWeakerSideWeight",
      "poolAverageWeight",
      "poolBelowExpectedMaxPenaltyShare",
      "poolBelowExpectedScale",
      "poolAboveExpectedMaxBonusShare",
      "poolAboveExpectedScale",
      "updatedAt"
  `;

  return rows[0];
}

export async function saveCombatTuning(
  values: ProtectionTuningValues,
): Promise<CombatTuningRow> {
  const existing = await getLatestCombatTuningRow();

  if (existing) {
    const rows = await prisma.$queryRaw<CombatTuningRow[]>`
      UPDATE "CombatTuning"
      SET
        "protectionK" = ${values.protectionK},
        "protectionS" = ${values.protectionS},
        "attackWeight" = ${values.attackWeight},
        "defenceWeight" = ${values.defenceWeight},
        "fortitudeWeight" = ${values.fortitudeWeight},
        "intellectWeight" = ${values.intellectWeight},
        "supportWeight" = ${values.supportWeight},
        "braveryWeight" = ${values.braveryWeight},
        "minionTierMultiplier" = ${values.minionTierMultiplier},
        "soldierTierMultiplier" = ${values.soldierTierMultiplier},
        "eliteTierMultiplier" = ${values.eliteTierMultiplier},
        "bossTierMultiplier" = ${values.bossTierMultiplier},
        "expectedPhysicalResilienceAt1" = ${values.expectedPhysicalResilienceAt1},
        "expectedPhysicalResiliencePerLevel" = ${values.expectedPhysicalResiliencePerLevel},
        "expectedMentalPerseveranceAt1" = ${values.expectedMentalPerseveranceAt1},
        "expectedMentalPerseverancePerLevel" = ${values.expectedMentalPerseverancePerLevel},
        "expectedPoolMinionMultiplier" = ${values.expectedPoolMinionMultiplier},
        "expectedPoolSoldierMultiplier" = ${values.expectedPoolSoldierMultiplier},
        "expectedPoolEliteMultiplier" = ${values.expectedPoolEliteMultiplier},
        "expectedPoolBossMultiplier" = ${values.expectedPoolBossMultiplier},
        "poolWeakerSideWeight" = ${values.poolWeakerSideWeight},
        "poolAverageWeight" = ${values.poolAverageWeight},
        "poolBelowExpectedMaxPenaltyShare" = ${values.poolBelowExpectedMaxPenaltyShare},
        "poolBelowExpectedScale" = ${values.poolBelowExpectedScale},
        "poolAboveExpectedMaxBonusShare" = ${values.poolAboveExpectedMaxBonusShare},
        "poolAboveExpectedScale" = ${values.poolAboveExpectedScale},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${existing.id}
      RETURNING
        "id",
        "protectionK",
        "protectionS",
        "attackWeight",
        "defenceWeight",
        "fortitudeWeight",
        "intellectWeight",
        "supportWeight",
        "braveryWeight",
        "minionTierMultiplier",
        "soldierTierMultiplier",
        "eliteTierMultiplier",
        "bossTierMultiplier",
        "expectedPhysicalResilienceAt1",
        "expectedPhysicalResiliencePerLevel",
        "expectedMentalPerseveranceAt1",
        "expectedMentalPerseverancePerLevel",
        "expectedPoolMinionMultiplier",
        "expectedPoolSoldierMultiplier",
        "expectedPoolEliteMultiplier",
        "expectedPoolBossMultiplier",
        "poolWeakerSideWeight",
        "poolAverageWeight",
        "poolBelowExpectedMaxPenaltyShare",
        "poolBelowExpectedScale",
        "poolAboveExpectedMaxBonusShare",
        "poolAboveExpectedScale",
        "updatedAt"
    `;

    return rows[0];
  }

  const id = crypto.randomUUID();
  const rows = await prisma.$queryRaw<CombatTuningRow[]>`
    INSERT INTO "CombatTuning" (
      "id",
      "protectionK",
      "protectionS",
      "attackWeight",
      "defenceWeight",
      "fortitudeWeight",
      "intellectWeight",
      "supportWeight",
      "braveryWeight",
      "minionTierMultiplier",
      "soldierTierMultiplier",
      "eliteTierMultiplier",
      "bossTierMultiplier",
      "expectedPhysicalResilienceAt1",
      "expectedPhysicalResiliencePerLevel",
      "expectedMentalPerseveranceAt1",
      "expectedMentalPerseverancePerLevel",
      "expectedPoolMinionMultiplier",
      "expectedPoolSoldierMultiplier",
      "expectedPoolEliteMultiplier",
      "expectedPoolBossMultiplier",
      "poolWeakerSideWeight",
      "poolAverageWeight",
      "poolBelowExpectedMaxPenaltyShare",
      "poolBelowExpectedScale",
      "poolAboveExpectedMaxBonusShare",
      "poolAboveExpectedScale"
    )
    VALUES (
      ${id},
      ${values.protectionK},
      ${values.protectionS},
      ${values.attackWeight},
      ${values.defenceWeight},
      ${values.fortitudeWeight},
      ${values.intellectWeight},
      ${values.supportWeight},
      ${values.braveryWeight},
      ${values.minionTierMultiplier},
      ${values.soldierTierMultiplier},
      ${values.eliteTierMultiplier},
      ${values.bossTierMultiplier},
      ${values.expectedPhysicalResilienceAt1},
      ${values.expectedPhysicalResiliencePerLevel},
      ${values.expectedMentalPerseveranceAt1},
      ${values.expectedMentalPerseverancePerLevel},
      ${values.expectedPoolMinionMultiplier},
      ${values.expectedPoolSoldierMultiplier},
      ${values.expectedPoolEliteMultiplier},
      ${values.expectedPoolBossMultiplier},
      ${values.poolWeakerSideWeight},
      ${values.poolAverageWeight},
      ${values.poolBelowExpectedMaxPenaltyShare},
      ${values.poolBelowExpectedScale},
      ${values.poolAboveExpectedMaxBonusShare},
      ${values.poolAboveExpectedScale}
    )
    RETURNING
      "id",
      "protectionK",
      "protectionS",
      "attackWeight",
      "defenceWeight",
      "fortitudeWeight",
      "intellectWeight",
      "supportWeight",
      "braveryWeight",
      "minionTierMultiplier",
      "soldierTierMultiplier",
      "eliteTierMultiplier",
      "bossTierMultiplier",
      "expectedPhysicalResilienceAt1",
      "expectedPhysicalResiliencePerLevel",
      "expectedMentalPerseveranceAt1",
      "expectedMentalPerseverancePerLevel",
      "expectedPoolMinionMultiplier",
      "expectedPoolSoldierMultiplier",
      "expectedPoolEliteMultiplier",
      "expectedPoolBossMultiplier",
      "poolWeakerSideWeight",
      "poolAverageWeight",
      "poolBelowExpectedMaxPenaltyShare",
      "poolBelowExpectedScale",
      "poolAboveExpectedMaxBonusShare",
      "poolAboveExpectedScale",
      "updatedAt"
  `;

  return rows[0];
}

export async function getProtectionTuning(): Promise<ProtectionTuningValues> {
  const row = await getLatestCombatTuningRow();
  return normalizeCombatTuning(row);
}
