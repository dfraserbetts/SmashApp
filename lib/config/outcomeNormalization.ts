import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/prisma/client";
import {
  DEFAULT_OUTCOME_NORMALIZATION_VALUES,
  OUTCOME_NORMALIZATION_KEY_ORDER,
  normalizeOutcomeNormalizationValues,
  type OutcomeNormalizationConfigStatus,
  type OutcomeNormalizationFlatValues,
  type OutcomeNormalizationSnapshot,
} from "@/lib/config/outcomeNormalizationShared";

const DEFAULT_SET_NAME = "Outcome Normalization Default v1";
const DEFAULT_SET_SLUG = "outcome-normalization-default-v1";

type OutcomeNormalizationSetWithEntries = NonNullable<
  Awaited<ReturnType<typeof fetchOutcomeNormalizationSetWithEntries>>
>;

export type OutcomeNormalizationSetListItem = {
  id: string;
  name: string;
  slug: string;
  status: OutcomeNormalizationConfigStatus;
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
  return slug || "outcome-normalization";
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
): OutcomeNormalizationFlatValues {
  const input: Record<string, unknown> = {};
  for (const entry of entries) {
    input[entry.configKey] = entry.value;
  }
  return normalizeOutcomeNormalizationValues(input);
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

function toSnapshot(set: OutcomeNormalizationSetWithEntries): OutcomeNormalizationSnapshot {
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
  status: OutcomeNormalizationConfigStatus;
  notes: string | null;
  updatedAt: Date;
  activatedAt: Date | null;
}): OutcomeNormalizationSetListItem {
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

function getStatusRank(status: OutcomeNormalizationConfigStatus): number {
  if (status === "ACTIVE") return 0;
  if (status === "DRAFT") return 1;
  return 2;
}

async function fetchOutcomeNormalizationSetWithEntries(id: string) {
  return prisma.outcomeNormalizationConfigSet.findUnique({
    where: { id },
    include: {
      entries: {
        orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }],
      },
    },
  });
}

async function fetchActiveOutcomeNormalizationSetWithEntries() {
  return prisma.outcomeNormalizationConfigSet.findFirst({
    where: { status: "ACTIVE" },
    orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
    include: {
      entries: {
        orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }],
      },
    },
  });
}

async function requireOutcomeNormalizationSet(
  id: string,
): Promise<OutcomeNormalizationSetWithEntries> {
  const set = await fetchOutcomeNormalizationSetWithEntries(id);
  if (!set) throw new Error("OUTCOME_NORMALIZATION_SET_NOT_FOUND");
  return set;
}

async function replaceOutcomeNormalizationEntries(
  tx: Prisma.TransactionClient,
  setId: string,
  values: OutcomeNormalizationFlatValues,
  notesByKey: Record<string, string | undefined> = {},
) {
  await tx.outcomeNormalizationConfigEntry.deleteMany({
    where: { configSetId: setId },
  });

  await tx.outcomeNormalizationConfigEntry.createMany({
    data: OUTCOME_NORMALIZATION_KEY_ORDER.map((configKey, index) => ({
      configSetId: setId,
      configKey,
      value: values[configKey],
      notes: trimOptionalText(notesByKey[configKey]),
      sortOrder: index,
    })),
  });

  await tx.outcomeNormalizationConfigSet.update({
    where: { id: setId },
    data: { updatedAt: new Date() },
  });
}

export async function getActiveOutcomeNormalizationSet(): Promise<OutcomeNormalizationSnapshot | null> {
  const active = await fetchActiveOutcomeNormalizationSetWithEntries();
  return active ? toSnapshot(active) : null;
}

export async function getOutcomeNormalizationSetById(
  id: string,
): Promise<OutcomeNormalizationSnapshot | null> {
  const set = await fetchOutcomeNormalizationSetWithEntries(id);
  return set ? toSnapshot(set) : null;
}

export async function listOutcomeNormalizationSets(): Promise<OutcomeNormalizationSetListItem[]> {
  const sets = await prisma.outcomeNormalizationConfigSet.findMany({
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

export async function ensureSeedOutcomeNormalizationSet(): Promise<OutcomeNormalizationSnapshot> {
  const existingActive = await fetchActiveOutcomeNormalizationSetWithEntries();
  if (existingActive) return toSnapshot(existingActive);

  const existingSeed = await prisma.outcomeNormalizationConfigSet.findUnique({
    where: { slug: DEFAULT_SET_SLUG },
    include: {
      entries: {
        orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }],
      },
    },
  });

  const setId = await prisma.$transaction(async (tx) => {
    if (existingSeed) {
      await replaceOutcomeNormalizationEntries(
        tx,
        existingSeed.id,
        toValuesFromEntries(existingSeed.entries),
        toNotesFromEntries(existingSeed.entries),
      );
      await tx.outcomeNormalizationConfigSet.update({
        where: { id: existingSeed.id },
        data: {
          status: "ACTIVE",
          activatedAt: new Date(),
        },
      });
      return existingSeed.id;
    }

    const created = await tx.outcomeNormalizationConfigSet.create({
      data: {
        name: DEFAULT_SET_NAME,
        slug: DEFAULT_SET_SLUG,
        status: "ACTIVE",
        activatedAt: new Date(),
      },
      select: { id: true },
    });

    await replaceOutcomeNormalizationEntries(tx, created.id, DEFAULT_OUTCOME_NORMALIZATION_VALUES);
    return created.id;
  });

  return toSnapshot(await requireOutcomeNormalizationSet(setId));
}

export async function createDraftOutcomeNormalizationSetFromActive(params?: {
  name?: string;
  notes?: string;
}): Promise<OutcomeNormalizationSnapshot> {
  const activeSnapshot = await ensureSeedOutcomeNormalizationSet();
  const activeSet = await requireOutcomeNormalizationSet(activeSnapshot.setId);

  const createdId = await prisma.$transaction(async (tx) => {
    const created = await tx.outcomeNormalizationConfigSet.create({
      data: {
        name: trimOptionalText(params?.name) ?? `${activeSet.name} Draft`,
        slug: makeDraftSlug(activeSet.slug),
        status: "DRAFT",
        notes: trimOptionalText(params?.notes) ?? trimOptionalText(activeSet.notes),
      },
      select: { id: true },
    });

    await replaceOutcomeNormalizationEntries(
      tx,
      created.id,
      toValuesFromEntries(activeSet.entries),
      toNotesFromEntries(activeSet.entries),
    );

    return created.id;
  });

  return toSnapshot(await requireOutcomeNormalizationSet(createdId));
}

export async function saveOutcomeNormalizationSetValues(
  setId: string,
  values: Record<string, number>,
  notes?: Record<string, string>,
): Promise<OutcomeNormalizationSnapshot> {
  const set = await requireOutcomeNormalizationSet(setId);
  if (set.status !== "DRAFT") throw new Error("OUTCOME_NORMALIZATION_SET_NOT_EDITABLE");

  const mergedValues = normalizeOutcomeNormalizationValues({
    ...toValuesFromEntries(set.entries),
    ...values,
  });
  const mergedNotes = {
    ...toNotesFromEntries(set.entries),
    ...(notes ?? {}),
  };

  await prisma.$transaction(async (tx) => {
    await replaceOutcomeNormalizationEntries(tx, setId, mergedValues, mergedNotes);
  });

  return toSnapshot(await requireOutcomeNormalizationSet(setId));
}

export async function activateOutcomeNormalizationSet(
  setId: string,
): Promise<OutcomeNormalizationSnapshot> {
  const set = await requireOutcomeNormalizationSet(setId);
  if (set.status !== "DRAFT") throw new Error("OUTCOME_NORMALIZATION_SET_NOT_DRAFT");

  await prisma.$transaction(async (tx) => {
    await tx.outcomeNormalizationConfigSet.updateMany({
      where: { status: "ACTIVE" },
      data: {
        status: "DRAFT",
        activatedAt: null,
      },
    });
    await tx.outcomeNormalizationConfigSet.update({
      where: { id: setId },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
      },
    });
  });

  return toSnapshot(await requireOutcomeNormalizationSet(setId));
}

export async function archiveOutcomeNormalizationSet(
  setId: string,
): Promise<OutcomeNormalizationSnapshot> {
  const set = await requireOutcomeNormalizationSet(setId);

  if (set.status === "ACTIVE") {
    const otherActive = await prisma.outcomeNormalizationConfigSet.findFirst({
      where: {
        status: "ACTIVE",
        id: { not: setId },
      },
      select: { id: true },
    });

    if (!otherActive) {
      throw new Error("OUTCOME_NORMALIZATION_ACTIVE_ARCHIVE_REQUIRES_REPLACEMENT");
    }
  }

  if (set.status !== "ARCHIVED") {
    await prisma.outcomeNormalizationConfigSet.update({
      where: { id: setId },
      data: { status: "ARCHIVED" },
    });
  }

  return toSnapshot(await requireOutcomeNormalizationSet(setId));
}

export async function unarchiveOutcomeNormalizationSet(
  setId: string,
): Promise<OutcomeNormalizationSnapshot> {
  const set = await requireOutcomeNormalizationSet(setId);
  if (set.status !== "ARCHIVED") throw new Error("OUTCOME_NORMALIZATION_SET_NOT_ARCHIVED");

  await prisma.outcomeNormalizationConfigSet.update({
    where: { id: setId },
    data: {
      status: "DRAFT",
      activatedAt: null,
    },
  });

  return toSnapshot(await requireOutcomeNormalizationSet(setId));
}

export async function deleteArchivedOutcomeNormalizationSet(setId: string): Promise<void> {
  const set = await requireOutcomeNormalizationSet(setId);
  if (set.status !== "ARCHIVED") throw new Error("OUTCOME_NORMALIZATION_SET_NOT_ARCHIVED");

  await prisma.$transaction(async (tx) => {
    await tx.outcomeNormalizationConfigEntry.deleteMany({
      where: { configSetId: setId },
    });
    await tx.outcomeNormalizationConfigSet.delete({
      where: { id: setId },
    });
  });
}
