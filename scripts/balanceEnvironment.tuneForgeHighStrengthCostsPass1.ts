import { loadEnvConfig } from "@next/env";

type TargetRow = {
  id: number;
  selector1: string;
  selector2: string;
  selector3: string;
  value: number;
};

type UpdatedRow = TargetRow & {
  oldValue: number;
  newValue: number;
};

const TARGET_ITEM_TYPES = ["Weapon", "Shield"] as const;
const TARGET_STRENGTH_TYPES = ["PhysicalStrength", "MentalStrength"] as const;
const TARGET_STRENGTHS = ["3", "4"] as const;
const EXPECTED_OLD_BY_STRENGTH: Record<string, number> = {
  "3": 9,
  "4": 14,
};
const TARGET_NEW_BY_STRENGTH: Record<string, number> = {
  "3": 12,
  "4": 18,
};

function targetKey(row: Pick<TargetRow, "selector1" | "selector2" | "selector3">): string {
  return `${row.selector1}::${row.selector2}::${row.selector3}`;
}

function expectedKeys(): string[] {
  const keys: string[] = [];
  for (const selector1 of TARGET_ITEM_TYPES) {
    for (const selector2 of TARGET_STRENGTH_TYPES) {
      for (const selector3 of TARGET_STRENGTHS) {
        keys.push(`${selector1}::${selector2}::${selector3}`);
      }
    }
  }
  return keys;
}

function assertTargetRows(rows: TargetRow[]) {
  const expected = expectedKeys();
  const seen = new Map<string, TargetRow[]>();
  for (const row of rows) {
    const key = targetKey(row);
    seen.set(key, [...(seen.get(key) ?? []), row]);
  }

  const missing = expected.filter((key) => !seen.has(key));
  if (missing.length) {
    throw new Error(`Missing target ForgeCostEntry rows: ${missing.join(", ")}`);
  }

  const duplicates = Array.from(seen.entries()).filter(([, matches]) => matches.length !== 1);
  if (duplicates.length) {
    throw new Error(
      `Ambiguous duplicate target rows: ${duplicates
        .map(([key, matches]) => `${key}(${matches.length})`)
        .join(", ")}`,
    );
  }

  const unexpected = rows.filter((row) => !expected.includes(targetKey(row)));
  if (unexpected.length) {
    throw new Error(
      `Unexpected target query rows: ${unexpected.map((row) => `${targetKey(row)}#${row.id}`).join(", ")}`,
    );
  }

  const badValues = rows.filter((row) => {
    const expectedOld = EXPECTED_OLD_BY_STRENGTH[row.selector3];
    const targetNew = TARGET_NEW_BY_STRENGTH[row.selector3];
    return row.value !== expectedOld && row.value !== targetNew;
  });
  if (badValues.length) {
    throw new Error(
      `Refusing unexpected current values: ${badValues
        .map((row) => `${targetKey(row)}=${row.value}`)
        .join(", ")}`,
    );
  }
}

function printRows(label: string, rows: TargetRow[]) {
  console.log(label);
  for (const row of rows) {
    console.log(
      [
        `id ${row.id}`,
        row.selector1,
        row.selector2,
        `Strength ${row.selector3}`,
        `value ${row.value}`,
      ].join(" | "),
    );
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");

  try {
    const beforeRows = await prisma.$queryRaw<TargetRow[]>`
      SELECT
        "id",
        "selector1",
        "selector2",
        "selector3",
        "value"
      FROM "ForgeCostEntry"
      WHERE "category"::text = 'Stat'
        AND "selector1" IN ('Weapon', 'Shield')
        AND "selector2" IN ('PhysicalStrength', 'MentalStrength')
        AND "selector3" IN ('3', '4')
      ORDER BY "selector1", "selector2", "selector3"
    `;
    assertTargetRows(beforeRows);
    printRows("Before:", beforeRows);

    const changedRows: UpdatedRow[] = [];
    for (const row of beforeRows) {
      const expectedOld = EXPECTED_OLD_BY_STRENGTH[row.selector3];
      const targetNew = TARGET_NEW_BY_STRENGTH[row.selector3];
      if (row.value === targetNew) continue;
      if (row.value !== expectedOld) {
        throw new Error(`Refusing ${targetKey(row)} unexpected value ${row.value}.`);
      }
      const updated = await prisma.$queryRaw<TargetRow[]>`
        UPDATE "ForgeCostEntry"
        SET "value" = ${targetNew}
        WHERE "id" = ${row.id}
          AND "category"::text = 'Stat'
          AND "selector1" = ${row.selector1}
          AND "selector2" = ${row.selector2}
          AND "selector3" = ${row.selector3}
          AND "value" = ${expectedOld}
        RETURNING "id", "selector1", "selector2", "selector3", "value"
      `;
      if (updated.length !== 1) {
        throw new Error(`Expected one updated row for ${targetKey(row)}, got ${updated.length}.`);
      }
      changedRows.push({ ...updated[0], oldValue: expectedOld, newValue: targetNew });
    }

    const afterRows = await prisma.$queryRaw<TargetRow[]>`
      SELECT
        "id",
        "selector1",
        "selector2",
        "selector3",
        "value"
      FROM "ForgeCostEntry"
      WHERE "category"::text = 'Stat'
        AND "selector1" IN ('Weapon', 'Shield')
        AND "selector2" IN ('PhysicalStrength', 'MentalStrength')
        AND "selector3" IN ('3', '4')
      ORDER BY "selector1", "selector2", "selector3"
    `;
    assertTargetRows(afterRows);
    printRows("After:", afterRows);

    console.log(`rowsChanged: ${changedRows.length}`);
    if (changedRows.length) {
      console.log("Changed rows:");
      for (const row of changedRows) {
        console.log(`${targetKey(row)} id ${row.id}: ${row.oldValue} -> ${row.newValue}`);
      }
    } else {
      console.log("No rows changed; target rows were already tuned.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
