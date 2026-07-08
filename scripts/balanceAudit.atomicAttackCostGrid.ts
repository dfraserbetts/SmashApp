import { loadEnvConfig } from "@next/env";
import type { PrismaClient } from "@prisma/client";

import {
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  normalizeCharacterPower,
  summarizeCharacterPowers,
  type CharacterPower,
} from "../lib/characterBuilder/powers";
import {
  normalizeCharacterPowerSpendScalar,
} from "../lib/config/characterBuilderTuningShared";
import { normalizePowerTuningValues, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";

const CHARACTER_BUILDER_TUNING_ID = "default";
const LEVEL = 3;

type PowerTuningEntry = {
  configKey: string;
  value: number;
};

type GridRow = {
  diceCount: number;
  potency: number;
  woundsPerSuccess: number;
  basePowerValue: number | null;
  spend: number | null;
  cooldownTurns: number | null;
  baseDerivedCooldownTurns: number | null;
  surcharge: number | null;
  warning: string;
  errors: string[];
};

function entriesToRecord(entries: PowerTuningEntry[]): Record<string, number> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstWarningLabel(warnings: string[]): string {
  if (warnings.length === 0) return "none";
  if (warnings.some((warning) => warning.includes("Burst warning"))) return "burstWarning";
  if (warnings.some((warning) => warning.includes("High offence pressure"))) return "watch";
  return warnings[0] ?? "warning";
}

function makeAtomicAttackPower(diceCount: number, potency: number): CharacterPower {
  const packet = {
    ...createDefaultCharacterPowerPacket("ATTACK", 0),
    diceCount,
    potency,
    effectTimingType: "ON_CAST" as const,
    effectDurationType: "INSTANT" as const,
    detailsJson: {
      attackMode: "PHYSICAL",
      damageTypes: ["Blunt"],
      rangeCategory: "MELEE",
      rangeValue: 1,
      rangeExtra: {},
    },
  };

  return normalizeCharacterPower(
    {
      ...createDefaultCharacterPower(0),
      name: `Atomic Attack X${diceCount} Y${potency}`,
      descriptorChassis: "IMMEDIATE",
      counterMode: "NO",
      commitmentModifier: "STANDARD",
      diceCount,
      potency,
      rangeCategories: ["MELEE"],
      meleeTargets: 1,
      rangedTargets: null,
      rangedDistanceFeet: null,
      aoeCenterRangeFeet: null,
      aoeCount: null,
      aoeShape: null,
      aoeSphereRadiusFeet: null,
      aoeConeLengthFeet: null,
      aoeLineWidthFeet: null,
      aoeLineLengthFeet: null,
      effectPackets: [packet],
      intentions: [packet],
    },
    0,
  );
}

async function loadActivePowerTuning(prisma: PrismaClient): Promise<{
  snapshot: PowerTuningSnapshot;
  source: { id: string; name: string; slug: string };
}> {
  const set = await prisma.powerTuningConfigSet.findFirst({
    where: { status: "ACTIVE" },
    orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
    include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
  });

  if (!set) {
    throw new Error("Missing ACTIVE PowerTuningConfigSet.");
  }

  return {
    snapshot: {
      setId: set.id,
      name: set.name,
      slug: set.slug,
      status: set.status,
      updatedAt: set.updatedAt.toISOString(),
      values: normalizePowerTuningValues(entriesToRecord(set.entries)),
    },
    source: { id: set.id, name: set.name, slug: set.slug },
  };
}

async function loadCharacterBuilderScalar(prisma: PrismaClient): Promise<{
  id: string;
  playerPowerSpendScalar: number;
  fallbackUsed: boolean;
}> {
  const row = await prisma.characterBuilderTuning.findUnique({
    where: { id: CHARACTER_BUILDER_TUNING_ID },
    select: { id: true, playerPowerSpendScalar: true },
  });

  return {
    id: row?.id ?? CHARACTER_BUILDER_TUNING_ID,
    playerPowerSpendScalar: normalizeCharacterPowerSpendScalar(row?.playerPowerSpendScalar),
    fallbackUsed: !row,
  };
}

function buildGridRows(params: {
  powers: CharacterPower[];
  tuningSnapshot: PowerTuningSnapshot;
  playerPowerSpendScalar: number;
}): GridRow[] {
  const summary = summarizeCharacterPowers({
    level: LEVEL,
    powers: params.powers,
    tuningSnapshot: params.tuningSnapshot,
    playerPowerSpendScalar: params.playerPowerSpendScalar,
  });
  const resolved = resolvePowerCosts(params.powers, params.tuningSnapshot, {
    level: LEVEL,
    tier: "SOLDIER",
  });

  return summary.powers.map((summaryRow, index): GridRow => {
    const power = params.powers[index];
    const packet = power?.effectPackets[0];
    const resolvedPower = resolved.powers[index];
    const packetCost = resolvedPower?.breakdown.packetCosts[0];
    const magnitude = asRecord(asRecord(packetCost?.debug).magnitude);
    const offencePressure = asRecord(magnitude.offencePressure);
    const appliedSurcharge = numberOrNull(offencePressure.appliedBasePowerValueSurcharge);
    const calculatedSurcharge = numberOrNull(offencePressure.basePowerValueSurcharge);
    const potency = packet?.potency ?? power?.potency ?? 0;

    return {
      diceCount: packet?.diceCount ?? power?.diceCount ?? 0,
      potency,
      woundsPerSuccess: potency * 2,
      basePowerValue: summaryRow.basePowerValue,
      spend: summaryRow.spend,
      cooldownTurns: summaryRow.derivedCooldownTurns,
      baseDerivedCooldownTurns: summaryRow.baseDerivedCooldownTurns,
      surcharge: appliedSurcharge ?? calculatedSurcharge,
      warning: firstWarningLabel(summaryRow.warnings),
      errors: summaryRow.errors,
    };
  });
}

function printHuman(payload: {
  powerTuning: { id: string; name: string; slug: string };
  characterBuilderTuning: { id: string; playerPowerSpendScalar: number; fallbackUsed: boolean };
  rows: GridRow[];
}) {
  console.log("Atomic Attack Cost Grid");
  console.log(`Level: ${LEVEL}`);
  console.log(`Power tuning: ${payload.powerTuning.name} (${payload.powerTuning.id})`);
  console.log(
    `Character Builder scalar: ${payload.characterBuilderTuning.playerPowerSpendScalar} (${payload.characterBuilderTuning.id}${payload.characterBuilderTuning.fallbackUsed ? ", fallback" : ""})`,
  );
  console.log("Shape: Immediate / No Counter / Standard / Attack / On Cast / Instant / Blunt / Melee / 1 target");
  for (const row of payload.rows) {
    console.log(
      [
        `X${row.diceCount}`,
        `Y${row.potency}`,
        `W/S ${row.woundsPerSuccess}`,
        `BPV ${row.basePowerValue}`,
        `spend ${row.spend}`,
        `CD ${row.cooldownTurns}`,
        `surcharge ${row.surcharge}`,
        `warning ${row.warning}`,
        `errors ${row.errors.length}`,
      ].join(" | "),
    );
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");
  const json = process.argv.includes("--json");

  try {
    const [powerTuning, characterBuilderTuning] = await Promise.all([
      loadActivePowerTuning(prisma),
      loadCharacterBuilderScalar(prisma),
    ]);
    const powers: CharacterPower[] = [];
    for (let diceCount = 1; diceCount <= 4; diceCount += 1) {
      for (let potency = 1; potency <= 4; potency += 1) {
        powers.push(makeAtomicAttackPower(diceCount, potency));
      }
    }
    const payload = {
      powerTuning: powerTuning.source,
      characterBuilderTuning,
      rows: buildGridRows({
        powers,
        tuningSnapshot: powerTuning.snapshot,
        playerPowerSpendScalar: characterBuilderTuning.playerPowerSpendScalar,
      }),
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
