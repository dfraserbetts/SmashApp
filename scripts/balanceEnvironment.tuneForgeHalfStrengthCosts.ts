import { loadEnvConfig } from "@next/env";

type CostRow = {
  id: number;
  selector1: string;
  selector2: string;
  selector3: string;
  value: number;
  notes: string | null;
};

type TargetRow = {
  selector1: string;
  selector2: string;
  selector3: string;
  value: number;
  lowerSelector3: string;
  lowerValue: number;
  upperSelector3: string;
  upperValue: number;
};

const TARGET_ITEM_TYPES = ["Weapon", "Shield"] as const;
const TARGET_STRENGTH_TYPES = ["PhysicalStrength", "MentalStrength"] as const;
const MIN_STRENGTH = 0;
const MAX_STRENGTH = 10;
const HALF_STEP_VALUES = Array.from({ length: MAX_STRENGTH * 2 }, (_, index) => (index + 1) / 2)
  .filter((value) => !Number.isInteger(value));

function selector(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function key(row: Pick<CostRow, "selector1" | "selector2" | "selector3">): string {
  return `${row.selector1}::${row.selector2}::${row.selector3}`;
}

function assertRowScope(rows: CostRow[]) {
  const badRows = rows.filter(
    (row) =>
      !TARGET_ITEM_TYPES.includes(row.selector1 as (typeof TARGET_ITEM_TYPES)[number]) ||
      !TARGET_STRENGTH_TYPES.includes(row.selector2 as (typeof TARGET_STRENGTH_TYPES)[number]) ||
      !Number.isFinite(Number(row.selector3)) ||
      Number(row.selector3) < MIN_STRENGTH ||
      Number(row.selector3) > MAX_STRENGTH,
  );
  if (badRows.length) {
    throw new Error(
      `Refusing out-of-scope ForgeCostEntry rows: ${badRows
        .map((row) => `${key(row)}#${row.id}`)
        .join(", ")}`,
    );
  }
}

function buildTargets(rows: CostRow[]): TargetRow[] {
  assertRowScope(rows);

  const rowsByKey = new Map(rows.map((row) => [key(row), row]));
  const targets: TargetRow[] = [];

  for (const selector1 of TARGET_ITEM_TYPES) {
    for (const selector2 of TARGET_STRENGTH_TYPES) {
      for (const halfStep of HALF_STEP_VALUES) {
        const lower = Math.floor(halfStep);
        const upper = Math.ceil(halfStep);
        if (lower < MIN_STRENGTH || upper > MAX_STRENGTH) continue;

        const upperRow = rowsByKey.get(`${selector1}::${selector2}::${selector(upper)}`);
        if (!upperRow) continue;

        if (lower === 0) {
          targets.push({
            selector1,
            selector2,
            selector3: selector(halfStep),
            value: upperRow.value / 2 - 0.5,
            lowerSelector3: "0",
            lowerValue: 0,
            upperSelector3: upperRow.selector3,
            upperValue: upperRow.value,
          });
          continue;
        }

        const lowerRow = rowsByKey.get(`${selector1}::${selector2}::${selector(lower)}`);
        if (!lowerRow) continue;

        const interpolated = (lowerRow.value + upperRow.value) / 2;
        targets.push({
          selector1,
          selector2,
          selector3: selector(halfStep),
          value: interpolated,
          lowerSelector3: lowerRow.selector3,
          lowerValue: lowerRow.value,
          upperSelector3: upperRow.selector3,
          upperValue: upperRow.value,
        });
      }
    }
  }

  return targets;
}

function printTargets(label: string, targets: TargetRow[]) {
  console.log(label);
  for (const target of targets) {
    console.log(
      [
        target.selector1,
        target.selector2,
        `Strength ${target.selector3}`,
        `value ${target.value}`,
        `between ${target.lowerSelector3}=${target.lowerValue} and ${target.upperSelector3}=${target.upperValue}`,
      ].join(" | "),
    );
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");

  try {
    const beforeRows = await prisma.$queryRaw<CostRow[]>`
      SELECT
        "id",
        "selector1",
        "selector2",
        "selector3",
        "value",
        "notes"
      FROM "ForgeCostEntry"
      WHERE "category"::text = 'Stat'
        AND "selector1" IN ('Weapon', 'Shield')
        AND "selector2" IN ('PhysicalStrength', 'MentalStrength')
        AND ("selector3")::numeric >= ${MIN_STRENGTH}
        AND ("selector3")::numeric <= ${MAX_STRENGTH}
      ORDER BY "selector1", "selector2", ("selector3")::numeric
    `;

    const targets = buildTargets(beforeRows);
    if (targets.length === 0) {
      throw new Error("No half-step targets could be derived from existing whole-strength rows.");
    }

    printTargets("Derived half-step targets:", targets);

    const existingHalfStepRows = beforeRows.filter((row) => !Number.isInteger(Number(row.selector3)));
    if (existingHalfStepRows.length) {
      console.log("Existing half-step rows before update:");
      for (const row of existingHalfStepRows) {
        console.log(`${key(row)} id ${row.id}: ${row.value}`);
      }
    } else {
      console.log("Existing half-step rows before update: none");
    }

    let rowsInserted = 0;
    let rowsUpdated = 0;
    let rowsAlreadyCorrect = 0;

    for (const target of targets) {
      const existing = beforeRows.find(
        (row) =>
          row.selector1 === target.selector1 &&
          row.selector2 === target.selector2 &&
          row.selector3 === target.selector3,
      );

      if (existing) {
        if (existing.value === target.value) {
          rowsAlreadyCorrect += 1;
          continue;
        }

        const updated = await prisma.$queryRaw<CostRow[]>`
          UPDATE "ForgeCostEntry"
          SET "value" = ${target.value},
              "notes" = ${"Half-step strength cost interpolated from adjacent whole-strength Forge Stat rows."}
          WHERE "id" = ${existing.id}
            AND "category"::text = 'Stat'
            AND "selector1" = ${target.selector1}
            AND "selector2" = ${target.selector2}
            AND "selector3" = ${target.selector3}
          RETURNING "id", "selector1", "selector2", "selector3", "value", "notes"
        `;
        if (updated.length !== 1) {
          throw new Error(`Expected one updated row for ${target.selector1}::${target.selector2}::${target.selector3}.`);
        }
        rowsUpdated += 1;
        continue;
      }

      const inserted = await prisma.$queryRaw<CostRow[]>`
        INSERT INTO "ForgeCostEntry" (
          "category",
          "selector1",
          "selector2",
          "selector3",
          "value",
          "notes"
        )
        VALUES (
          CAST('Stat' AS "ForgeCostCategory"),
          ${target.selector1},
          ${target.selector2},
          ${target.selector3},
          ${target.value},
          ${"Half-step strength cost interpolated from adjacent whole-strength Forge Stat rows."}
        )
        RETURNING "id", "selector1", "selector2", "selector3", "value", "notes"
      `;
      if (inserted.length !== 1) {
        throw new Error(`Expected one inserted row for ${target.selector1}::${target.selector2}::${target.selector3}.`);
      }
      rowsInserted += 1;
    }

    const afterRows = await prisma.$queryRaw<CostRow[]>`
      SELECT
        "id",
        "selector1",
        "selector2",
        "selector3",
        "value",
        "notes"
      FROM "ForgeCostEntry"
      WHERE "category"::text = 'Stat'
        AND "selector1" IN ('Weapon', 'Shield')
        AND "selector2" IN ('PhysicalStrength', 'MentalStrength')
        AND ("selector3")::numeric >= ${MIN_STRENGTH}
        AND ("selector3")::numeric <= ${MAX_STRENGTH}
      ORDER BY "selector1", "selector2", ("selector3")::numeric
    `;

    const afterTargets = buildTargets(afterRows);
    const missingOrWrong = afterTargets.filter((target) => {
      const row = afterRows.find(
        (candidate) =>
          candidate.selector1 === target.selector1 &&
          candidate.selector2 === target.selector2 &&
          candidate.selector3 === target.selector3,
      );
      return !row || row.value !== target.value;
    });

    if (missingOrWrong.length) {
      throw new Error(
        `Half-step verification failed: ${missingOrWrong
          .map((target) => `${target.selector1}::${target.selector2}::${target.selector3} expected ${target.value}`)
          .join(", ")}`,
      );
    }

    console.log(`rowsInserted: ${rowsInserted}`);
    console.log(`rowsUpdated: ${rowsUpdated}`);
    console.log(`rowsAlreadyCorrect: ${rowsAlreadyCorrect}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
