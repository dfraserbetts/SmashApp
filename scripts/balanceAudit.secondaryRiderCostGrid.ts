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
  calculateCharacterPlayerPowerSpend,
  normalizeCharacterPowerSpendScalar,
} from "../lib/config/characterBuilderTuningShared";
import { normalizePowerTuningValues, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import type { EffectPacket, PowerIntention, SecondaryDependencyMode } from "../lib/summoning/types";

const CHARACTER_BUILDER_TUNING_ID = "default";
const LEVEL = 3;

const SECONDARY_PRICING_KEYS = [
  "system.packetCount.base",
  "system.packetCount.addPacket2",
  "system.packetCount.addPacket3",
  "system.packetCount.addPacket4plus",
  "system.secondaryContingency.packet2",
  "system.secondaryContingency.packet3plus",
  "system.synergy.latchToPayload",
  "system.synergy.resultScalingFollowThrough",
] as const;

type PowerTuningEntry = {
  configKey: string;
  value: number;
};

type GridRow = {
  id: number;
  name: string;
  packetCount: number;
  resolverBasePowerValue: number | null;
  resolverSpend: number | null;
  summarySpend: number | null;
  cooldownTurns: number | null;
  packetCountComplexityCost: number | null;
  crossPacketSynergyCost: number | null;
  packetContingencies: number[];
  errors: string[];
  warnings: string[];
};

function entriesToRecord(entries: PowerTuningEntry[]): Record<string, number> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function makePacket(params: {
  intention: PowerIntention;
  index: number;
  diceCount?: number;
  potency?: number;
  secondaryDependencyMode?: SecondaryDependencyMode | null;
  detailsJson?: Record<string, unknown>;
}): EffectPacket {
  const intention = params.intention;
  const base = createDefaultCharacterPowerPacket(intention, params.index);
  const attackDetails =
    intention === "ATTACK"
      ? {
          attackMode: "PHYSICAL",
          damageTypes: ["Blunt"],
        }
      : {};
  const controlDetails =
    intention === "CONTROL"
      ? {
          controlMode: "Force no main action",
          controlTheme: "MIND_COGNITION",
        }
      : {};
  const debuffDetails =
    intention === "DEBUFF"
      ? {
          statTarget: "Attack",
        }
      : {};

  return {
    ...base,
    diceCount: params.diceCount ?? 1,
    potency: params.potency ?? 1,
    effectTimingType: "ON_CAST",
    effectDurationType: intention === "ATTACK" ? "INSTANT" : "TURNS",
    effectDurationTurns: intention === "ATTACK" ? null : 1,
    secondaryDependencyMode: params.index === 0 ? null : params.secondaryDependencyMode ?? "LINKED_TO_PRIMARY",
    detailsJson: {
      ...attackDetails,
      ...controlDetails,
      ...debuffDetails,
      rangeCategory: "MELEE",
      rangeValue: 1,
      rangeExtra: {},
      ...params.detailsJson,
    },
  };
}

function makePower(name: string, packets: EffectPacket[]): CharacterPower {
  const primary = packets[0] ?? makePacket({ intention: "ATTACK", index: 0 });
  return normalizeCharacterPower(
    {
      ...createDefaultCharacterPower(0),
      name,
      descriptorChassis: "IMMEDIATE",
      counterMode: "NO",
      commitmentModifier: "STANDARD",
      diceCount: primary.diceCount,
      potency: primary.potency,
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

function makeAttackPower(name: string, diceCount: number): CharacterPower {
  return makePower(name, [
    makePacket({
      intention: "ATTACK",
      index: 0,
      diceCount,
      potency: 1,
    }),
  ]);
}

function makeSamples(): CharacterPower[] {
  return [
    makeAttackPower("Atomic Attack X1/Y1", 1),
    makeAttackPower("Atomic Attack X2/Y1", 2),
    makeAttackPower("Atomic Attack X3/Y1", 3),
    makeAttackPower("Atomic Attack X4/Y1", 4),
    makePower("Control primary only", [
      makePacket({ intention: "CONTROL", index: 0 }),
    ]),
    makePower("Debuff primary only", [
      makePacket({ intention: "DEBUFF", index: 0 }),
    ]),
    ...[1, 2, 3].map((diceCount) =>
      makePower(`Control primary + linked Attack rider X${diceCount}/Y1`, [
        makePacket({ intention: "CONTROL", index: 0 }),
        makePacket({ intention: "ATTACK", index: 1, diceCount, potency: 1 }),
      ]),
    ),
    ...[1, 2, 3].map((diceCount) =>
      makePower(`Debuff primary + linked Attack rider X${diceCount}/Y1`, [
        makePacket({ intention: "DEBUFF", index: 0 }),
        makePacket({ intention: "ATTACK", index: 1, diceCount, potency: 1 }),
      ]),
    ),
    makePower("Control primary + Debuff secondary", [
      makePacket({ intention: "CONTROL", index: 0 }),
      makePacket({ intention: "DEBUFF", index: 1 }),
    ]),
    ...[1, 2, 3].map((diceCount) =>
      makePower(`Control primary + Debuff secondary + linked Attack rider X${diceCount}/Y1`, [
        makePacket({ intention: "CONTROL", index: 0 }),
        makePacket({ intention: "DEBUFF", index: 1 }),
        makePacket({ intention: "ATTACK", index: 2, diceCount, potency: 1 }),
      ]),
    ),
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

  return params.powers.map((power, index): GridRow => {
    const resolvedPower = resolved.powers[index];
    const breakdown = resolvedPower?.breakdown;
    const summaryRow = summary.powers[index];
    const resolverBasePowerValue = numberOrNull(breakdown?.basePowerValue);
    return {
      id: index + 1,
      name: power.name,
      packetCount: power.effectPackets.length,
      resolverBasePowerValue,
      resolverSpend:
        resolverBasePowerValue === null
          ? null
          : calculateCharacterPlayerPowerSpend(resolverBasePowerValue, params.playerPowerSpendScalar),
      summarySpend: summaryRow?.spend ?? null,
      cooldownTurns: resolvedPower?.derivedCooldownTurns ?? null,
      packetCountComplexityCost: numberOrNull(breakdown?.packetCountComplexityCost),
      crossPacketSynergyCost: numberOrNull(breakdown?.crossPacketSynergyCost),
      packetContingencies:
        breakdown?.packetCosts.map((packet) => packet.contingencyMultiplier) ?? [],
      errors: summaryRow?.errors ?? [],
      warnings: summaryRow?.warnings ?? [],
    };
  });
}

function printHuman(payload: {
  powerTuning: { id: string; name: string; slug: string };
  characterBuilderTuning: { id: string; playerPowerSpendScalar: number; fallbackUsed: boolean };
  tuningValues: Record<string, number>;
  rows: GridRow[];
}) {
  console.log("Secondary Rider Cost Grid");
  console.log(`Level: ${LEVEL}`);
  console.log(`Power tuning: ${payload.powerTuning.name} (${payload.powerTuning.id})`);
  console.log(
    `Character Builder scalar: ${payload.characterBuilderTuning.playerPowerSpendScalar} (${payload.characterBuilderTuning.id}${payload.characterBuilderTuning.fallbackUsed ? ", fallback" : ""})`,
  );
  console.log("Tuning keys:");
  for (const key of SECONDARY_PRICING_KEYS) {
    console.log(`- ${key}: ${payload.tuningValues[key]}`);
  }
  console.log("Shape: Immediate / No Counter / Standard / On Cast / Blunt Attack rider / Melee / 1 target");
  for (const row of payload.rows) {
    console.log(
      [
        `${row.id}. ${row.name}`,
        `packets ${row.packetCount}`,
        `BPV ${row.resolverBasePowerValue}`,
        `spend ${row.resolverSpend}`,
        `summarySpend ${row.summarySpend}`,
        `CD ${row.cooldownTurns}`,
        `packetCount ${row.packetCountComplexityCost}`,
        `synergy ${row.crossPacketSynergyCost}`,
        `contingencies ${row.packetContingencies.join("/") || "none"}`,
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
    const powers = makeSamples();
    const tuningValues = Object.fromEntries(
      SECONDARY_PRICING_KEYS.map((key) => [key, powerTuning.snapshot.values[key]]),
    );
    const payload = {
      powerTuning: powerTuning.source,
      characterBuilderTuning,
      tuningValues,
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
