import { execFileSync } from "node:child_process";

import { loadEnvConfig } from "@next/env";

type ForgeConfigRow = {
  id: number;
  selector1: string;
  selector2: string | null;
  value: number;
};

type ForgeStrengthCostRow = {
  id: number;
  selector1: string;
  selector2: string;
  selector3: string;
  value: number;
};

type ForgeDamageTypeCostRow = {
  id: number;
  selector1: string;
  selector2: string;
  selector3: string;
  value: number;
};

type AttackCostSample = {
  itemType: string;
  lane: string;
  strength: number;
  woundsPerSuccess: number;
  oneDamageTypeTotal: number | null;
  twoDamageTypeTotal: number | null;
  statCost: number | null;
  oneDamageTypeCost: number | null;
  twoDamageTypeCost: number | null;
};

type BudgetRow = {
  level: number;
  budgets: Record<string, number | null>;
};

type FitCell = {
  marker: "OK" | "WARN" | "NO";
  percent: number | null;
};

type FitRow = {
  level: number;
  rarity: string;
  budget: number | null;
  fits: Record<string, FitCell>;
};

const RARITIES = ["common", "uncommon", "rare", "legendary", "mythic"] as const;
const ITEM_TYPES = ["Weapon", "Shield"] as const;
const STRENGTH_TYPES = ["PhysicalStrength", "MentalStrength"] as const;
const STRENGTHS = [1, 2, 3, 4] as const;
const LEVELS = Array.from({ length: 20 }, (_, index) => index + 1);

function repoHead(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "UNKNOWN";
  }
}

function strengthLabel(strength: number): string {
  return `W/S${strength * 2}`;
}

function key(itemType: string, selector2: string, selector3: number | string): string {
  return `${itemType}::${selector2}::${selector3}`;
}

function damageKey(itemType: string, damageTypeCount: 1 | 2): string {
  return `${itemType}::Melee::${damageTypeCount}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function fitCell(cost: number | null, budget: number | null): FitCell {
  if (cost === null || budget === null || budget <= 0) {
    return { marker: "NO", percent: null };
  }
  const percent = round((cost / budget) * 100);
  if (cost > budget) return { marker: "NO", percent };
  if (percent >= 75) return { marker: "WARN", percent };
  return { marker: "OK", percent };
}

function displayFit(cell: FitCell): string {
  const marker =
    cell.marker === "OK"
      ? "OK"
      : cell.marker === "WARN"
        ? "WARN"
        : "NO";
  return cell.percent === null ? marker : `${marker} ${cell.percent}%`;
}

function buildBudgetRows(configRows: ForgeConfigRow[]): BudgetRow[] {
  const scalarByRarity = new Map(configRows.map((row) => [row.selector1, row.value]));
  return LEVELS.map((level) => ({
    level,
    budgets: Object.fromEntries(
      RARITIES.map((rarity) => {
        const scalar = scalarByRarity.get(rarity);
        return [rarity, typeof scalar === "number" ? level * scalar : null];
      }),
    ),
  }));
}

function buildAttackCostSamples(params: {
  strengthRows: ForgeStrengthCostRow[];
  damageTypeRows: ForgeDamageTypeCostRow[];
}): AttackCostSample[] {
  const strengthByKey = new Map(
    params.strengthRows.map((row) => [key(row.selector1, row.selector2, row.selector3), row]),
  );
  const damageByKey = new Map(
    params.damageTypeRows.map((row) => [damageKey(row.selector1, Number(row.selector3) === 2 ? 2 : 1), row]),
  );
  const rows: AttackCostSample[] = [];
  for (const itemType of ITEM_TYPES) {
    const oneDamageTypeCost = damageByKey.get(damageKey(itemType, 1))?.value ?? null;
    const twoDamageTypeCost = damageByKey.get(damageKey(itemType, 2))?.value ?? null;
    for (const lane of STRENGTH_TYPES) {
      for (const strength of STRENGTHS) {
        const statCost = strengthByKey.get(key(itemType, lane, strength))?.value ?? null;
        rows.push({
          itemType,
          lane,
          strength,
          woundsPerSuccess: strength * 2,
          oneDamageTypeTotal:
            statCost === null || oneDamageTypeCost === null ? null : statCost + oneDamageTypeCost,
          twoDamageTypeTotal:
            statCost === null || twoDamageTypeCost === null ? null : statCost + twoDamageTypeCost,
          statCost,
          oneDamageTypeCost,
          twoDamageTypeCost,
        });
      }
    }
  }
  return rows;
}

function representativeCosts(samples: AttackCostSample[]): Record<string, number | null> {
  const weaponPhysical = samples.filter(
    (sample) => sample.itemType === "Weapon" && sample.lane === "PhysicalStrength",
  );
  return Object.fromEntries(
    STRENGTHS.map((strength) => [
      strengthLabel(strength),
      weaponPhysical.find((sample) => sample.strength === strength)?.oneDamageTypeTotal ?? null,
    ]),
  );
}

function buildFitRows(params: {
  budgetRows: BudgetRow[];
  representativeCosts: Record<string, number | null>;
}): FitRow[] {
  const rows: FitRow[] = [];
  for (const budgetRow of params.budgetRows) {
    for (const rarity of RARITIES) {
      const budget = budgetRow.budgets[rarity] ?? null;
      rows.push({
        level: budgetRow.level,
        rarity,
        budget,
        fits: Object.fromEntries(
          Object.entries(params.representativeCosts).map(([label, cost]) => [
            label,
            fitCell(cost, budget),
          ]),
        ),
      });
    }
  }
  return rows;
}

function printHuman(payload: {
  repoHead: string;
  budgetSource: string;
  strengthCostSource: string;
  configRowCount: number;
  strengthRowCount: number;
  damageTypeRowCount: number;
  budgets: BudgetRow[];
  samples: AttackCostSample[];
  fitRows: FitRow[];
}) {
  console.log("Forge FP Budget Curve");
  console.log(`Repo HEAD: ${payload.repoHead}`);
  console.log(`Budget source: ${payload.budgetSource}`);
  console.log(`Strength cost source: ${payload.strengthCostSource}`);
  console.log(
    `Rows checked: ${payload.configRowCount} ForgeConfigEntry rarity rows, ${payload.strengthRowCount} strength rows, ${payload.damageTypeRowCount} damage-type rows`,
  );
  console.log("");
  console.log("FP Budgets");
  console.log(["Level", ...RARITIES].join(" | "));
  for (const row of payload.budgets) {
    console.log([row.level, ...RARITIES.map((rarity) => row.budgets[rarity] ?? "missing")].join(" | "));
  }
  console.log("");
  console.log("Current simple one-damage-type attack costs");
  for (const sample of payload.samples) {
    console.log(
      [
        sample.itemType,
        sample.lane,
        `Strength ${sample.strength}`,
        `W/S${sample.woundsPerSuccess}`,
        `1-type ${sample.oneDamageTypeTotal}`,
        `2-type ${sample.twoDamageTypeTotal}`,
      ].join(" | "),
    );
  }
  console.log("");
  console.log("Fit Matrix - representative simple Weapon Physical one-damage-type costs");
  console.log("Legend: OK fits under 75%; WARN fits but consumes >=75%; NO does not fit.");
  console.log(["Level", "Rarity", "Budget", "W/S2", "W/S4", "W/S6", "W/S8"].join(" | "));
  for (const row of payload.fitRows) {
    console.log(
      [
        row.level,
        row.rarity,
        row.budget ?? "missing",
        displayFit(row.fits["W/S2"]),
        displayFit(row.fits["W/S4"]),
        displayFit(row.fits["W/S6"]),
        displayFit(row.fits["W/S8"]),
      ].join(" | "),
    );
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");
  const json = process.argv.includes("--json");
  try {
    const configRows = await prisma.$queryRaw<ForgeConfigRow[]>`
      SELECT "id", "selector1", "selector2", "value"
      FROM "ForgeConfigEntry"
      WHERE "category"::text = 'RARITY'
      ORDER BY "selector1", "selector2"
    `;
    const strengthRows = await prisma.$queryRaw<ForgeStrengthCostRow[]>`
      SELECT "id", "selector1", "selector2", "selector3", "value"
      FROM "ForgeCostEntry"
      WHERE "category"::text = 'Stat'
        AND "selector1" IN ('Weapon', 'Shield')
        AND "selector2" IN ('PhysicalStrength', 'MentalStrength')
        AND "selector3" IN ('1', '2', '3', '4')
      ORDER BY "selector1", "selector2", "selector3"
    `;
    const damageTypeRows = await prisma.$queryRaw<ForgeDamageTypeCostRow[]>`
      SELECT "id", "selector1", "selector2", "selector3", "value"
      FROM "ForgeCostEntry"
      WHERE "category"::text = 'DmgType_Count'
        AND "selector1" IN ('Weapon', 'Shield')
        AND "selector2" = 'Melee'
        AND "selector3" IN ('1', '2')
      ORDER BY "selector1", "selector2", "selector3"
    `;
    const budgets = buildBudgetRows(configRows);
    const samples = buildAttackCostSamples({ strengthRows, damageTypeRows });
    const representative = representativeCosts(samples);
    const fitRows = buildFitRows({ budgetRows: budgets, representativeCosts: representative });
    const payload = {
      repoHead: repoHead(),
      budgetSource: "ForgeConfigEntry category=RARITY; ForgeCreate calculates total FP as item level x rarity scalar.",
      strengthCostSource: "ForgeCostEntry category=Stat plus DmgType_Count; output W/S is strength x 2.",
      configRowCount: configRows.length,
      strengthRowCount: strengthRows.length,
      damageTypeRowCount: damageTypeRows.length,
      budgets,
      samples,
      fitRows,
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
