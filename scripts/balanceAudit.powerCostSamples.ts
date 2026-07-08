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

const CHARACTER_BUILDER_TUNING_ID = "default";

type PowerTuningEntry = {
  configKey: string;
  value: number;
};

type SampleRow = {
  name: string;
  basePowerValue: number | null;
  spend: number | null;
  cooldownTurns: number | null;
  errors: string[];
  warnings: string[];
};

function entriesToRecord(entries: PowerTuningEntry[]): Record<string, number> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function makeAttackPacket(params: {
  intention?: Parameters<typeof createDefaultCharacterPowerPacket>[0];
  index: number;
  diceCount: number;
  potency: number;
  detailsJson?: Record<string, unknown>;
}) {
  const intention = params.intention ?? "ATTACK";
  return {
    ...createDefaultCharacterPowerPacket(intention, params.index),
    diceCount: params.diceCount,
    potency: params.potency,
    detailsJson: {
      attackMode: "PHYSICAL",
      damageTypes: intention === "ATTACK" ? ["Slash"] : [],
      rangeCategory: "MELEE",
      rangeValue: 1,
      rangeExtra: {},
      ...params.detailsJson,
    },
  };
}

function makePower(name: string, packets: ReturnType<typeof makeAttackPacket>[]): CharacterPower {
  const firstPacket = packets[0];
  return normalizeCharacterPower(
    {
      ...createDefaultCharacterPower(0),
      name,
      diceCount: firstPacket?.diceCount ?? 1,
      potency: firstPacket?.potency ?? 1,
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
      effectPackets: packets,
      intentions: packets,
    },
    0,
  );
}

function makeAttackPower(name: string, diceCount: number, potency: number): CharacterPower {
  return makePower(name, [makeAttackPacket({ index: 0, diceCount, potency })]);
}

function makeSamples(): CharacterPower[] {
  return [
    makeAttackPower("W/S2 baseline", 4, 1),
    makeAttackPower("W/S4 heavy", 4, 2),
    makeAttackPower("W/S6 burst", 3, 3),
    makeAttackPower("W/S8 extreme", 3, 4),
    makePower("Control + W/S2 linked rider", [
      makeAttackPacket({
        intention: "CONTROL",
        index: 0,
        diceCount: 4,
        potency: 1,
        detailsJson: { controlMode: "Force no main action", controlTheme: "MIND_COGNITION" },
      }),
      makeAttackPacket({ index: 1, diceCount: 1, potency: 1 }),
    ]),
    makePower("Debuff + W/S2 linked rider", [
      makeAttackPacket({
        intention: "DEBUFF",
        index: 0,
        diceCount: 4,
        potency: 1,
        detailsJson: { statTarget: "Guard" },
      }),
      makeAttackPacket({ index: 1, diceCount: 1, potency: 1 }),
    ]),
    makePower("Control + Debuff + Damage triple packet", [
      makeAttackPacket({
        intention: "CONTROL",
        index: 0,
        diceCount: 4,
        potency: 1,
        detailsJson: { controlMode: "Force no main action", controlTheme: "MIND_COGNITION" },
      }),
      makeAttackPacket({
        intention: "DEBUFF",
        index: 1,
        diceCount: 1,
        potency: 1,
        detailsJson: { statTarget: "Guard" },
      }),
      makeAttackPacket({ index: 2, diceCount: 1, potency: 1 }),
    ]),
  ];
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

function printHuman(payload: {
  powerTuning: { id: string; name: string; slug: string };
  characterBuilderTuning: { id: string; playerPowerSpendScalar: number; fallbackUsed: boolean };
  samples: SampleRow[];
}) {
  console.log("Balance Audit Power Cost Samples");
  console.log(`Power tuning: ${payload.powerTuning.name} (${payload.powerTuning.id})`);
  console.log(
    `Character Builder scalar: ${payload.characterBuilderTuning.playerPowerSpendScalar} (${payload.characterBuilderTuning.id}${payload.characterBuilderTuning.fallbackUsed ? ", fallback" : ""})`,
  );
  for (const sample of payload.samples) {
    console.log(
      [
        sample.name,
        `BPV ${sample.basePowerValue}`,
        `spend ${sample.spend}`,
        `cooldown ${sample.cooldownTurns}`,
        `warnings ${sample.warnings.length}`,
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
    const summary = summarizeCharacterPowers({
      level: 3,
      powers: makeSamples(),
      tuningSnapshot: powerTuning.snapshot,
      playerPowerSpendScalar: characterBuilderTuning.playerPowerSpendScalar,
    });
    const payload = {
      powerTuning: powerTuning.source,
      characterBuilderTuning,
      samples: summary.powers.map((power): SampleRow => ({
        name: power.power.name,
        basePowerValue: power.basePowerValue,
        spend: power.spend,
        cooldownTurns: power.derivedCooldownTurns,
        errors: power.errors,
        warnings: power.warnings,
      })),
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

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
