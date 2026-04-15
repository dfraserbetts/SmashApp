import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/prisma/client";
import {
  COMBAT_TUNING_CONFIG_KEY_ORDER,
  DEFAULT_COMBAT_TUNING_VALUES,
  DEFAULT_PROTECTION_K,
  DEFAULT_PROTECTION_S,
  combatTuningValuesToFlat,
  normalizeCombatTuning,
  normalizeCombatTuningFlatValues,
  type CombatTuningConfigStatus,
  type CombatTuningFlatValues,
  type CombatTuningSnapshot,
  type ProtectionTuningValues,
} from "@/lib/config/combatTuningShared";

export { DEFAULT_PROTECTION_K, DEFAULT_PROTECTION_S };

const DEFAULT_SET_NAME = "Combat Tuning Default v1";
const DEFAULT_SET_SLUG = "combat-tuning-default-v1";

export type CombatTuningRow = ProtectionTuningValues & {
  id: string;
  updatedAt: Date;
};

type CombatTuningSetWithEntries = NonNullable<
  Awaited<ReturnType<typeof fetchCombatTuningSetWithEntries>>
>;

export type CombatTuningSetListItem = {
  id: string;
  name: string;
  slug: string;
  status: CombatTuningConfigStatus;
  notes: string | null;
  updatedAt: string;
  activatedAt: string | null;
};

function trimOptionalText(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || "combat-tuning";
}

function makeDraftSlug(baseSlug: string): string {
  const now = new Date();
  const timestamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  return `${slugify(baseSlug)}-draft-${timestamp}-${crypto.randomUUID().slice(0, 8)}`;
}

function toValuesFromEntries(
  entries: Array<{ configKey: string; value: number }>,
): CombatTuningFlatValues {
  const input: Record<string, unknown> = {};
  for (const entry of entries) {
    input[entry.configKey] = entry.value;
  }
  return normalizeCombatTuningFlatValues(input);
}

function toNotesFromEntries(
  entries: Array<{ configKey: string; notes: string | null }>,
): Record<string, string> {
  const notesByKey: Record<string, string> = {};
  for (const entry of entries) {
    const note = trimOptionalText(entry.notes);
    if (note) notesByKey[entry.configKey] = note;
  }
  return notesByKey;
}

function toSnapshot(set: CombatTuningSetWithEntries): CombatTuningSnapshot {
  return {
    setId: set.id,
    name: set.name,
    slug: set.slug,
    status: set.status,
    updatedAt: set.updatedAt.toISOString(),
    values: toValuesFromEntries(set.entries),
  };
}

function toListItem(set: {
  id: string;
  name: string;
  slug: string;
  status: CombatTuningConfigStatus;
  notes: string | null;
  updatedAt: Date;
  activatedAt: Date | null;
}): CombatTuningSetListItem {
  return {
    id: set.id,
    name: set.name,
    slug: set.slug,
    status: set.status,
    notes: set.notes,
    updatedAt: set.updatedAt.toISOString(),
    activatedAt: set.activatedAt?.toISOString() ?? null,
  };
}

function getStatusRank(status: CombatTuningConfigStatus): number {
  if (status === "ACTIVE") return 0;
  if (status === "DRAFT") return 1;
  return 2;
}

async function fetchCombatTuningSetWithEntries(id: string) {
  return prisma.combatTuningConfigSet.findUnique({
    where: { id },
    include: {
      entries: {
        orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }],
      },
    },
  });
}

async function fetchActiveCombatTuningSetWithEntries() {
  return prisma.combatTuningConfigSet.findFirst({
    where: { status: "ACTIVE" },
    orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
    include: {
      entries: {
        orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }],
      },
    },
  });
}

async function requireCombatTuningSet(id: string): Promise<CombatTuningSetWithEntries> {
  const set = await fetchCombatTuningSetWithEntries(id);
  if (!set) throw new Error("COMBAT_TUNING_SET_NOT_FOUND");
  return set;
}

async function replaceCombatTuningEntries(
  tx: Prisma.TransactionClient,
  setId: string,
  values: CombatTuningFlatValues,
  notesByKey: Record<string, string | undefined> = {},
) {
  await tx.combatTuningConfigEntry.deleteMany({
    where: { configSetId: setId },
  });

  await tx.combatTuningConfigEntry.createMany({
    data: COMBAT_TUNING_CONFIG_KEY_ORDER.map((configKey, index) => ({
      configSetId: setId,
      configKey,
      value: values[configKey],
      notes: trimOptionalText(notesByKey[configKey]),
      sortOrder: index,
    })),
  });

  await tx.combatTuningConfigSet.update({
    where: { id: setId },
    data: { updatedAt: new Date() },
  });
}

export async function getLatestCombatTuningRow(): Promise<CombatTuningRow | null> {
  const row = await prisma.combatTuning.findFirst({
    orderBy: [{ updatedAt: "desc" }],
  });
  return row ? { ...normalizeCombatTuning(row), id: row.id, updatedAt: row.updatedAt } : null;
}

export async function getActiveCombatTuningSet(): Promise<CombatTuningSnapshot | null> {
  const active = await fetchActiveCombatTuningSetWithEntries();
  return active ? toSnapshot(active) : null;
}

export async function getCombatTuningSetById(id: string): Promise<CombatTuningSnapshot | null> {
  const set = await fetchCombatTuningSetWithEntries(id);
  return set ? toSnapshot(set) : null;
}

export async function listCombatTuningSets(): Promise<CombatTuningSetListItem[]> {
  const sets = await prisma.combatTuningConfigSet.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      notes: true,
      updatedAt: true,
      activatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return sets
    .slice()
    .sort((a, b) => {
      const statusDelta = getStatusRank(a.status) - getStatusRank(b.status);
      if (statusDelta !== 0) return statusDelta;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .map(toListItem);
}

export async function ensureSeedCombatTuningSet(): Promise<CombatTuningSnapshot> {
  const existingActive = await fetchActiveCombatTuningSetWithEntries();
  if (existingActive) return toSnapshot(existingActive);

  const existingSeed = await prisma.combatTuningConfigSet.findUnique({
    where: { slug: DEFAULT_SET_SLUG },
    include: {
      entries: {
        orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }],
      },
    },
  });
  const latestLegacyRow = await getLatestCombatTuningRow();
  const seedValues = latestLegacyRow
    ? combatTuningValuesToFlat(normalizeCombatTuning(latestLegacyRow))
    : combatTuningValuesToFlat(DEFAULT_COMBAT_TUNING_VALUES);

  const setId = await prisma.$transaction(async (tx) => {
    if (existingSeed) {
      await replaceCombatTuningEntries(
        tx,
        existingSeed.id,
        toValuesFromEntries(existingSeed.entries),
        toNotesFromEntries(existingSeed.entries),
      );
      await tx.combatTuningConfigSet.update({
        where: { id: existingSeed.id },
        data: {
          status: "ACTIVE",
          activatedAt: new Date(),
        },
      });
      return existingSeed.id;
    }

    const created = await tx.combatTuningConfigSet.create({
      data: {
        name: DEFAULT_SET_NAME,
        slug: DEFAULT_SET_SLUG,
        status: "ACTIVE",
        notes: "Seeded from the latest legacy CombatTuning row.",
        activatedAt: new Date(),
      },
      select: { id: true },
    });

    await replaceCombatTuningEntries(tx, created.id, seedValues);
    return created.id;
  });

  return toSnapshot(await requireCombatTuningSet(setId));
}

export async function ensureCombatTuningRow(): Promise<CombatTuningRow> {
  const snapshot = await ensureSeedCombatTuningSet();
  return {
    ...normalizeCombatTuning(snapshot.values),
    id: snapshot.setId,
    updatedAt: new Date(snapshot.updatedAt),
  };
}

export async function createDraftCombatTuningSetFromActive(params?: {
  name?: string;
  notes?: string;
}): Promise<CombatTuningSnapshot> {
  const activeSnapshot = await ensureSeedCombatTuningSet();
  const activeSet = await requireCombatTuningSet(activeSnapshot.setId);

  const createdId = await prisma.$transaction(async (tx) => {
    const created = await tx.combatTuningConfigSet.create({
      data: {
        name: trimOptionalText(params?.name) ?? `${activeSet.name} Draft`,
        slug: makeDraftSlug(activeSet.slug),
        status: "DRAFT",
        notes: trimOptionalText(params?.notes) ?? trimOptionalText(activeSet.notes),
      },
      select: { id: true },
    });

    await replaceCombatTuningEntries(
      tx,
      created.id,
      toValuesFromEntries(activeSet.entries),
      toNotesFromEntries(activeSet.entries),
    );

    return created.id;
  });

  return toSnapshot(await requireCombatTuningSet(createdId));
}

export async function saveCombatTuningSetValues(
  setId: string,
  values: Record<string, number>,
  notes?: Record<string, string>,
): Promise<CombatTuningSnapshot> {
  const set = await requireCombatTuningSet(setId);
  if (set.status !== "DRAFT") throw new Error("COMBAT_TUNING_SET_NOT_EDITABLE");

  const mergedValues = normalizeCombatTuningFlatValues({
    ...toValuesFromEntries(set.entries),
    ...values,
  });
  const mergedNotes = {
    ...toNotesFromEntries(set.entries),
    ...(notes ?? {}),
  };

  await prisma.$transaction(async (tx) => {
    await replaceCombatTuningEntries(tx, setId, mergedValues, mergedNotes);
  });

  return toSnapshot(await requireCombatTuningSet(setId));
}

export async function activateCombatTuningSet(setId: string): Promise<CombatTuningSnapshot> {
  const set = await requireCombatTuningSet(setId);
  if (set.status !== "DRAFT") throw new Error("COMBAT_TUNING_SET_NOT_DRAFT");

  await prisma.$transaction(async (tx) => {
    await tx.combatTuningConfigSet.updateMany({
      where: { status: "ACTIVE" },
      data: {
        status: "DRAFT",
        activatedAt: null,
      },
    });
    await tx.combatTuningConfigSet.update({
      where: { id: setId },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
      },
    });
  });

  return toSnapshot(await requireCombatTuningSet(setId));
}

export async function archiveCombatTuningSet(setId: string): Promise<CombatTuningSnapshot> {
  const set = await requireCombatTuningSet(setId);

  if (set.status === "ACTIVE") {
    const otherActive = await prisma.combatTuningConfigSet.findFirst({
      where: {
        status: "ACTIVE",
        id: { not: setId },
      },
      select: { id: true },
    });

    if (!otherActive) {
      throw new Error("COMBAT_TUNING_ACTIVE_ARCHIVE_REQUIRES_REPLACEMENT");
    }
  }

  if (set.status !== "ARCHIVED") {
    await prisma.combatTuningConfigSet.update({
      where: { id: setId },
      data: { status: "ARCHIVED" },
    });
  }

  return toSnapshot(await requireCombatTuningSet(setId));
}

export async function unarchiveCombatTuningSet(setId: string): Promise<CombatTuningSnapshot> {
  const set = await requireCombatTuningSet(setId);
  if (set.status !== "ARCHIVED") throw new Error("COMBAT_TUNING_SET_NOT_ARCHIVED");

  await prisma.combatTuningConfigSet.update({
    where: { id: setId },
    data: {
      status: "DRAFT",
      activatedAt: null,
    },
  });

  return toSnapshot(await requireCombatTuningSet(setId));
}

export async function deleteArchivedCombatTuningSet(setId: string): Promise<void> {
  const set = await requireCombatTuningSet(setId);
  if (set.status !== "ARCHIVED") throw new Error("COMBAT_TUNING_SET_NOT_ARCHIVED");

  await prisma.$transaction(async (tx) => {
    await tx.combatTuningConfigEntry.deleteMany({
      where: { configSetId: setId },
    });
    await tx.combatTuningConfigSet.delete({
      where: { id: setId },
    });
  });
}

export async function saveCombatTuning(
  values: ProtectionTuningValues,
): Promise<CombatTuningRow> {
  const activeSnapshot = await ensureSeedCombatTuningSet();
  const activeSet = await requireCombatTuningSet(activeSnapshot.setId);

  await prisma.$transaction(async (tx) => {
    await replaceCombatTuningEntries(
      tx,
      activeSet.id,
      combatTuningValuesToFlat(normalizeCombatTuning(values)),
      toNotesFromEntries(activeSet.entries),
    );
  });

  return ensureCombatTuningRow();
}

export async function getProtectionTuning(): Promise<ProtectionTuningValues> {
  const activeSnapshot = await ensureSeedCombatTuningSet();
  return normalizeCombatTuning(activeSnapshot.values);
}
