import { loadEnvConfig } from "@next/env";

const POWER_TUNING_SET_ID = "cmo9w500h00001wwchd9mginh";
const POWER_TUNING_SET_NAME = "Augment Guard vs Bravery pass";
const CONFIG_KEY = "system.packetCount.addPacket2";
const BEFORE_VALUE = 2;
const AFTER_VALUE = 4;

async function main() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");

  try {
    const activeSet = await prisma.powerTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      select: { id: true, name: true, status: true },
    });

    if (!activeSet) {
      throw new Error("No ACTIVE PowerTuningConfigSet found.");
    }
    if (activeSet.id !== POWER_TUNING_SET_ID || activeSet.name !== POWER_TUNING_SET_NAME) {
      throw new Error(
        `Refusing tune: active set mismatch. Expected ${POWER_TUNING_SET_NAME} (${POWER_TUNING_SET_ID}), found ${activeSet.name} (${activeSet.id}).`,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const entries = await tx.powerTuningConfigEntry.findMany({
        where: { configSetId: POWER_TUNING_SET_ID, configKey: CONFIG_KEY },
        select: { id: true, configKey: true, value: true, sortOrder: true },
      });

      if (entries.length > 1) {
        throw new Error(
          `Refusing tune: expected at most one ${CONFIG_KEY} entry, found ${entries.length}.`,
        );
      }

      const entry = entries[0] ?? null;
      if (!entry) {
        const created = await tx.powerTuningConfigEntry.create({
          data: {
            configSetId: POWER_TUNING_SET_ID,
            configKey: CONFIG_KEY,
            value: AFTER_VALUE,
            notes:
              "Balance pass 1: raise second packet complexity cost from 2 to 4.",
            sortOrder: 0,
          },
          select: { id: true, configKey: true, value: true },
        });

        return {
          operation: "created",
          beforeValue: null,
          afterValue: created.value,
          rowsChanged: 1,
          entryId: created.id,
        };
      }

      if (entry.value === AFTER_VALUE) {
        return {
          operation: "already-current",
          beforeValue: entry.value,
          afterValue: entry.value,
          rowsChanged: 0,
          entryId: entry.id,
        };
      }

      if (entry.value !== BEFORE_VALUE) {
        throw new Error(
          `Refusing tune: expected ${CONFIG_KEY} current value ${BEFORE_VALUE} or ${AFTER_VALUE}, found ${entry.value}.`,
        );
      }

      const update = await tx.powerTuningConfigEntry.updateMany({
        where: {
          id: entry.id,
          configSetId: POWER_TUNING_SET_ID,
          configKey: CONFIG_KEY,
          value: BEFORE_VALUE,
        },
        data: { value: AFTER_VALUE },
      });

      if (update.count !== 1) {
        throw new Error(`Refusing tune: expected exactly one row update, got ${update.count}.`);
      }

      const after = await tx.powerTuningConfigEntry.findUniqueOrThrow({
        where: { id: entry.id },
        select: { id: true, value: true },
      });

      return {
        operation: "updated",
        beforeValue: entry.value,
        afterValue: after.value,
        rowsChanged: update.count,
        entryId: after.id,
      };
    });

    console.log("Power tuning packet-count pass 1 complete.");
    console.log(`configSetId: ${POWER_TUNING_SET_ID}`);
    console.log(`configSetName: ${POWER_TUNING_SET_NAME}`);
    console.log(`key: ${CONFIG_KEY}`);
    console.log(`operation: ${result.operation}`);
    console.log(`beforeValue: ${result.beforeValue}`);
    console.log(`afterValue: ${result.afterValue}`);
    console.log(`rowsChanged: ${result.rowsChanged}`);
    console.log(`entryId: ${result.entryId}`);
    console.log("DB mutation: scoped PowerTuningConfigEntry value update only.");
    console.log("No assets, campaigns, characters, monsters, powers, items, formulas, schemas, seeders, or runtime mechanics were touched by this script.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
