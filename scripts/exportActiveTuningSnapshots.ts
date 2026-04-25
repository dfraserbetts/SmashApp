import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { normalizeCombatTuningFlatValues } from "../lib/config/combatTuningShared";
import { normalizeOutcomeNormalizationValues } from "../lib/config/outcomeNormalizationShared";
import { normalizePowerTuningValues } from "../lib/config/powerTuningShared";

type ActiveSetWithEntries = {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: Date;
  entries: Array<{
    configKey: string;
    value: number;
  }>;
};

type ExportedSnapshot = {
  setId: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: string;
  values: Record<string, number>;
};

const OUTPUT_PATHS = {
  power: "scripts/fixtures/tuning/active-power-tuning.json",
  combat: "scripts/fixtures/tuning/active-combat-tuning.json",
  outcome: "scripts/fixtures/tuning/active-outcome-normalization.json",
} as const;

function loadEnvFile(relativePath: string) {
  const absolutePath = join(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) return;

  for (const rawLine of readFileSync(absolutePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
}

function entriesToRecord(entries: ActiveSetWithEntries["entries"]): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function toSnapshot(
  set: ActiveSetWithEntries,
  normalize: (values: Record<string, unknown>) => Record<string, number>,
): ExportedSnapshot {
  return {
    setId: set.id,
    name: set.name,
    slug: set.slug,
    status: set.status,
    updatedAt: set.updatedAt.toISOString(),
    values: normalize(entriesToRecord(set.entries)),
  };
}

function writeSnapshot(path: string, snapshot: ExportedSnapshot) {
  const absolutePath = join(process.cwd(), path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

async function main() {
  loadLocalEnv();

  const { prisma } = await import("../prisma/client");

  try {
    const [powerSet, combatSet, outcomeSet] = await Promise.all([
      prisma.powerTuningConfigSet.findFirst({
        where: { status: "ACTIVE" },
        orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
        include: {
          entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] },
        },
      }),
      prisma.combatTuningConfigSet.findFirst({
        where: { status: "ACTIVE" },
        orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
        include: {
          entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] },
        },
      }),
      prisma.outcomeNormalizationConfigSet.findFirst({
        where: { status: "ACTIVE" },
        orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
        include: {
          entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] },
        },
      }),
    ]);

    const missingLayers: string[] = [];
    if (!powerSet) missingLayers.push("Power Tuning");
    if (!combatSet) missingLayers.push("Combat Tuning");
    if (!outcomeSet) missingLayers.push("Outcome Normalization");
    if (!powerSet || !combatSet || !outcomeSet) {
      throw new Error(`Missing ACTIVE tuning set(s): ${missingLayers.join(", ")}`);
    }

    const snapshots = [
      {
        layer: "Power Tuning",
        path: OUTPUT_PATHS.power,
        snapshot: toSnapshot(powerSet, normalizePowerTuningValues),
      },
      {
        layer: "Combat Tuning",
        path: OUTPUT_PATHS.combat,
        snapshot: toSnapshot(combatSet, normalizeCombatTuningFlatValues),
      },
      {
        layer: "Outcome Normalization",
        path: OUTPUT_PATHS.outcome,
        snapshot: toSnapshot(outcomeSet, normalizeOutcomeNormalizationValues),
      },
    ];

    for (const entry of snapshots) {
      writeSnapshot(entry.path, entry.snapshot);
      console.log(
        `Exported ${entry.layer}: ${entry.snapshot.name} -> ${entry.path}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
