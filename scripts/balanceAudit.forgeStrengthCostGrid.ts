import { execFileSync } from "node:child_process";

import { loadEnvConfig } from "@next/env";

type ForgeStrengthCostRow = {
  id: number;
  selector1: string;
  selector2: string;
  selector3: string;
  value: number;
};

type ForgeConfigRow = {
  id: number;
  selector1: string;
  selector2: string | null;
  value: number;
};

type ForgeDamageTypeCostRow = {
  id: number;
  selector1: string;
  selector2: string;
  selector3: string;
  value: number;
};

type OutputRow = {
  itemType: string;
  strengthType: string;
  strength: number;
  displayedWoundsPerSuccess: number;
  statCost: number | null;
  oneDamageTypeCost: number | null;
  simpleOneDamageTypeTotal: number | null;
  rowId: number | null;
};

const LEVEL = 3;
const ITEM_TYPES = ["Weapon", "Shield"] as const;
const STRENGTH_TYPES = ["PhysicalStrength", "MentalStrength"] as const;
const STRENGTHS = [1, 2, 3, 4] as const;
const RARITIES = ["common", "uncommon", "rare", "legendary", "mythic"] as const;

function repoHead(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rowKey(itemType: string, strengthType: string, strength: number): string {
  return `${itemType}::${strengthType}::${strength}`;
}

function damageTypeKey(itemType: string): string {
  return `${itemType}::Melee::1`;
}

function buildOutputRows(params: {
  strengthRows: ForgeStrengthCostRow[];
  damageTypeRows: ForgeDamageTypeCostRow[];
}): OutputRow[] {
  const strengthByKey = new Map(
    params.strengthRows.map((row) => [
      rowKey(row.selector1, row.selector2, Number(row.selector3)),
      row,
    ]),
  );
  const damageTypeByKey = new Map(
    params.damageTypeRows.map((row) => [
      damageTypeKey(row.selector1),
      row,
    ]),
  );

  const rows: OutputRow[] = [];
  for (const itemType of ITEM_TYPES) {
    const damageTypeCost = damageTypeByKey.get(damageTypeKey(itemType));
    for (const strengthType of STRENGTH_TYPES) {
      for (const strength of STRENGTHS) {
        const row = strengthByKey.get(rowKey(itemType, strengthType, strength));
        const statCost = numberOrNull(row?.value);
        const oneDamageTypeCost = numberOrNull(damageTypeCost?.value);
        rows.push({
          itemType,
          strengthType,
          strength,
          displayedWoundsPerSuccess: strength * 2,
          statCost,
          oneDamageTypeCost,
          simpleOneDamageTypeTotal:
            statCost === null || oneDamageTypeCost === null
              ? null
              : statCost + oneDamageTypeCost,
          rowId: row?.id ?? null,
        });
      }
    }
  }
  return rows;
}

function buildBudgets(configRows: ForgeConfigRow[]) {
  return RARITIES.map((rarity) => {
    const row = configRows.find((entry) => entry.selector1 === rarity);
    return {
      rarity,
      scalar: row?.value ?? null,
      level3Fp: typeof row?.value === "number" ? row.value * LEVEL : null,
      rowId: row?.id ?? null,
    };
  });
}

function printHuman(payload: {
  repoHead: string;
  forgeRowCountChecked: number;
  damageTypeRowCountChecked: number;
  level: number;
  budgets: ReturnType<typeof buildBudgets>;
  rows: OutputRow[];
}) {
  console.log("Forge Strength Cost Grid");
  console.log(`Repo HEAD: ${payload.repoHead}`);
  console.log(`Rows checked: ${payload.forgeRowCountChecked} strength, ${payload.damageTypeRowCountChecked} damage-type`);
  console.log(`Level ${payload.level} FP budgets:`);
  for (const budget of payload.budgets) {
    console.log(`- ${budget.rarity}: scalar ${budget.scalar}, FP ${budget.level3Fp}`);
  }
  console.log("Simple one-damage-type total = Stat row value + Melee damage-type-count(1).");
  for (const row of payload.rows) {
    console.log(
      [
        row.itemType,
        row.strengthType,
        `Strength ${row.strength}`,
        `W/S ${row.displayedWoundsPerSuccess}`,
        `stat ${row.statCost}`,
        `damageType1 ${row.oneDamageTypeCost}`,
        `simpleTotal ${row.simpleOneDamageTypeTotal}`,
        `row ${row.rowId}`,
      ].join(" | "),
    );
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");
  const json = process.argv.includes("--json");

  try {
    const strengthRows = await prisma.$queryRaw<ForgeStrengthCostRow[]>`
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
        AND "selector3" IN ('1', '2', '3', '4')
      ORDER BY "selector1", "selector2", "selector3"
    `;
    const damageTypeRows = await prisma.$queryRaw<ForgeDamageTypeCostRow[]>`
      SELECT
        "id",
        "selector1",
        "selector2",
        "selector3",
        "value"
      FROM "ForgeCostEntry"
      WHERE "category"::text = 'DmgType_Count'
        AND "selector1" IN ('Weapon', 'Shield')
        AND "selector2" = 'Melee'
        AND "selector3" = '1'
      ORDER BY "selector1", "selector2", "selector3"
    `;
    const configRows = await prisma.$queryRaw<ForgeConfigRow[]>`
      SELECT
        "id",
        "selector1",
        "selector2",
        "value"
      FROM "ForgeConfigEntry"
      WHERE "category"::text = 'RARITY'
        AND "selector1" IN ('common', 'uncommon', 'rare', 'legendary', 'mythic')
      ORDER BY "selector1", "selector2"
    `;

    const payload = {
      repoHead: repoHead(),
      forgeRowCountChecked: strengthRows.length,
      damageTypeRowCountChecked: damageTypeRows.length,
      level: LEVEL,
      budgets: buildBudgets(configRows),
      rows: buildOutputRows({ strengthRows, damageTypeRows }),
    };

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      printHuman(payload);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
