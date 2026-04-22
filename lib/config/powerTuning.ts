import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/prisma/client";
import {
  canonicalizePowerTuningConfigKey,
  DEFAULT_POWER_TUNING_VALUES,
  POWER_TUNING_CONFIG_KEY_ORDER,
  normalizePowerTuningValues,
  type PowerTuningConfigStatus,
  type PowerTuningFlatValues,
  type PowerTuningSnapshot,
} from "@/lib/config/powerTuningShared";

const DEFAULT_SET_NAME = "Phase 6 Default v1";
const DEFAULT_SET_SLUG = "phase6-default-v1";

type PowerTuningSetWithEntries = NonNullable<
  Awaited<ReturnType<typeof fetchPowerTuningSetWithEntries>>
>;

export type PowerTuningSetListItem = {
  id: string;
  name: string;
  slug: string;
  status: PowerTuningConfigStatus;
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
  return slug || "power-tuning";
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
): PowerTuningFlatValues {
  const input: Record<string, unknown> = {};
  for (const entry of entries) {
    input[entry.configKey] = entry.value;
  }
  return normalizePowerTuningValues(input);
}

function toNotesFromEntries(
  entries: Array<{ configKey: string; notes: string | null }>,
): Record<string, string> {
  const notesByKey: Record<string, string> = {};
  for (const entry of entries) {
    const note = trimOptionalText(entry.notes);
    if (note) notesByKey[canonicalizePowerTuningConfigKey(entry.configKey)] = note;
  }
  return notesByKey;
}

function toSnapshot(set: PowerTuningSetWithEntries): PowerTuningSnapshot {
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
  status: PowerTuningConfigStatus;
  notes: string | null;
  updatedAt: Date;
  activatedAt: Date | null;
}): PowerTuningSetListItem {
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

function getStatusRank(status: PowerTuningConfigStatus): number {
  if (status === "ACTIVE") return 0;
  if (status === "DRAFT") return 1;
  return 2;
}

async function fetchPowerTuningSetWithEntries(id: string) {
  return prisma.powerTuningConfigSet.findUnique({
    where: { id },
    include: {
      entries: {
        orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }],
      },
    },
  });
}

async function fetchActivePowerTuningSetWithEntries() {
  return prisma.powerTuningConfigSet.findFirst({
    where: { status: "ACTIVE" },
    orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
    include: {
      entries: {
        orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }],
      },
    },
  });
}

async function requirePowerTuningSet(id: string): Promise<PowerTuningSetWithEntries> {
  const set = await fetchPowerTuningSetWithEntries(id);
  if (!set) throw new Error("POWER_TUNING_SET_NOT_FOUND");
  return set;
}

async function replacePowerTuningEntries(
  tx: Prisma.TransactionClient,
  setId: string,
  values: PowerTuningFlatValues,
  notesByKey: Record<string, string | undefined> = {},
) {
  await tx.powerTuningConfigEntry.deleteMany({
    where: { configSetId: setId },
  });

  await tx.powerTuningConfigEntry.createMany({
    data: POWER_TUNING_CONFIG_KEY_ORDER.map((configKey, index) => ({
      configSetId: setId,
      configKey,
      value: values[configKey],
      notes: trimOptionalText(notesByKey[configKey]),
      sortOrder: index,
    })),
  });

  await tx.powerTuningConfigSet.update({
    where: { id: setId },
    data: { updatedAt: new Date() },
  });
}

export async function getActivePowerTuningSet(): Promise<PowerTuningSnapshot | null> {
  const active = await fetchActivePowerTuningSetWithEntries();
  return active ? toSnapshot(active) : null;
}

export async function getPowerTuningSetById(id: string): Promise<PowerTuningSnapshot | null> {
  const set = await fetchPowerTuningSetWithEntries(id);
  return set ? toSnapshot(set) : null;
}

export async function listPowerTuningSets(): Promise<PowerTuningSetListItem[]> {
  const sets = await prisma.powerTuningConfigSet.findMany({
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

export async function ensureSeedPowerTuningSet(): Promise<PowerTuningSnapshot> {
  const existingActive = await fetchActivePowerTuningSetWithEntries();
  if (existingActive) return toSnapshot(existingActive);

  const existingSeed = await prisma.powerTuningConfigSet.findUnique({
    where: { slug: DEFAULT_SET_SLUG },
    include: {
      entries: {
        orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }],
      },
    },
  });

  const setId = await prisma.$transaction(async (tx) => {
    if (existingSeed) {
      await replacePowerTuningEntries(
        tx,
        existingSeed.id,
        toValuesFromEntries(existingSeed.entries),
        toNotesFromEntries(existingSeed.entries),
      );
      await tx.powerTuningConfigSet.update({
        where: { id: existingSeed.id },
        data: {
          status: "ACTIVE",
          activatedAt: new Date(),
        },
      });
      return existingSeed.id;
    }

    const created = await tx.powerTuningConfigSet.create({
      data: {
        name: DEFAULT_SET_NAME,
        slug: DEFAULT_SET_SLUG,
        status: "ACTIVE",
        activatedAt: new Date(),
      },
      select: { id: true },
    });

    await replacePowerTuningEntries(tx, created.id, DEFAULT_POWER_TUNING_VALUES);
    return created.id;
  });

  return toSnapshot(await requirePowerTuningSet(setId));
}

export async function createDraftPowerTuningSetFromActive(params?: {
  name?: string;
  notes?: string;
}): Promise<PowerTuningSnapshot> {
  const activeSnapshot = await ensureSeedPowerTuningSet();
  const activeSet = await requirePowerTuningSet(activeSnapshot.setId);

  const createdId = await prisma.$transaction(async (tx) => {
    const created = await tx.powerTuningConfigSet.create({
      data: {
        name: trimOptionalText(params?.name) ?? `${activeSet.name} Draft`,
        slug: makeDraftSlug(activeSet.slug),
        status: "DRAFT",
        notes: trimOptionalText(params?.notes) ?? trimOptionalText(activeSet.notes),
      },
      select: { id: true },
    });

    await replacePowerTuningEntries(
      tx,
      created.id,
      toValuesFromEntries(activeSet.entries),
      toNotesFromEntries(activeSet.entries),
    );

    return created.id;
  });

  return toSnapshot(await requirePowerTuningSet(createdId));
}

export async function savePowerTuningSetValues(
  setId: string,
  values: Record<string, number>,
  notes?: Record<string, string>,
): Promise<PowerTuningSnapshot> {
  const set = await requirePowerTuningSet(setId);
  if (set.status !== "DRAFT") throw new Error("POWER_TUNING_SET_NOT_EDITABLE");

  const mergedValues = normalizePowerTuningValues({
    ...toValuesFromEntries(set.entries),
    ...values,
  });
  const mergedNotes = {
    ...toNotesFromEntries(set.entries),
    ...(notes ?? {}),
  };

  await prisma.$transaction(async (tx) => {
    await replacePowerTuningEntries(tx, setId, mergedValues, mergedNotes);
  });

  return toSnapshot(await requirePowerTuningSet(setId));
}

export async function activatePowerTuningSet(setId: string): Promise<PowerTuningSnapshot> {
  const set = await requirePowerTuningSet(setId);
  if (set.status !== "DRAFT") throw new Error("POWER_TUNING_SET_NOT_DRAFT");

  await prisma.$transaction(async (tx) => {
    await tx.powerTuningConfigSet.updateMany({
      where: { status: "ACTIVE" },
      data: {
        status: "DRAFT",
        activatedAt: null,
      },
    });
    await tx.powerTuningConfigSet.update({
      where: { id: setId },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
      },
    });
  });

  return toSnapshot(await requirePowerTuningSet(setId));
}

export async function archivePowerTuningSet(setId: string): Promise<PowerTuningSnapshot> {
  const set = await requirePowerTuningSet(setId);

  if (set.status === "ACTIVE") {
    const otherActive = await prisma.powerTuningConfigSet.findFirst({
      where: {
        status: "ACTIVE",
        id: { not: setId },
      },
      select: { id: true },
    });

    if (!otherActive) {
      throw new Error("POWER_TUNING_ACTIVE_ARCHIVE_REQUIRES_REPLACEMENT");
    }
  }

  if (set.status !== "ARCHIVED") {
    await prisma.powerTuningConfigSet.update({
      where: { id: setId },
      data: { status: "ARCHIVED" },
    });
  }

  return toSnapshot(await requirePowerTuningSet(setId));
}

export async function unarchivePowerTuningSet(setId: string): Promise<PowerTuningSnapshot> {
  const set = await requirePowerTuningSet(setId);
  if (set.status !== "ARCHIVED") throw new Error("POWER_TUNING_SET_NOT_ARCHIVED");

  await prisma.powerTuningConfigSet.update({
    where: { id: setId },
    data: {
      status: "DRAFT",
      activatedAt: null,
    },
  });

  return toSnapshot(await requirePowerTuningSet(setId));
}

export async function deleteArchivedPowerTuningSet(setId: string): Promise<void> {
  const set = await requirePowerTuningSet(setId);
  if (set.status !== "ARCHIVED") throw new Error("POWER_TUNING_SET_NOT_ARCHIVED");

  await prisma.$transaction(async (tx) => {
    await tx.powerTuningConfigEntry.deleteMany({
      where: { configSetId: setId },
    });
    await tx.powerTuningConfigSet.delete({
      where: { id: setId },
    });
  });
}
