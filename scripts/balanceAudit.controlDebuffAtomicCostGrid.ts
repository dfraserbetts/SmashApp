import { loadEnvConfig } from "@next/env";
import type { PrismaClient } from "@prisma/client";

import {
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  getCharacterPowerPrimaryDefenceLabel,
  normalizeCharacterPower,
  signatureMovePointPool,
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

type PowerTuningEntry = {
  configKey: string;
  value: number;
};

type SampleRow = {
  id: number;
  name: string;
  basePowerValue: number | null;
  spend: number | null;
  summarySpend: number | null;
  normalCooldownTurns: number | null;
  signatureCooldownTurns: number | null;
  primaryDefenceLabel: string;
  packetCountComplexityCost: number | null;
  packetContingencies: number[];
  packetSpecificCosts: Array<{ packetIndex: number; intention: string | null; cost: number | null; tuningKey: string | null }>;
  componentBreakdown: {
    sharedContextCost: number | null;
    packetIdentityCost: number | null;
    packetMagnitudeCost: number | null;
    packetTimingCost: number | null;
    packetDurationCost: number | null;
    packetRecipientCost: number | null;
    packetSpecificCost: number | null;
    packetCountComplexityCost: number | null;
    crossPacketSynergyCost: number | null;
  };
  errors: string[];
  warnings: string[];
  serializedPower: CharacterPower;
};

function entriesToRecord(entries: PowerTuningEntry[]): Record<string, number> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayOrEmpty(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function makePacket(params: {
  intention: PowerIntention;
  index: number;
  diceCount?: number;
  potency?: number;
  effectDurationType?: "INSTANT" | "TURNS";
  effectDurationTurns?: number | null;
  secondaryDependencyMode?: SecondaryDependencyMode | null;
  detailsJson?: Record<string, unknown>;
}): EffectPacket {
  const base = createDefaultCharacterPowerPacket(params.intention, params.index);
  const attackDetails =
    params.intention === "ATTACK"
      ? {
          attackMode: "PHYSICAL",
          damageTypes: ["Blunt"],
        }
      : {};

  return {
    ...base,
    diceCount: params.diceCount ?? 1,
    potency: params.potency ?? 1,
    effectTimingType: "ON_CAST",
    effectDurationType: params.effectDurationType ?? "INSTANT",
    effectDurationTurns: params.effectDurationTurns ?? null,
    secondaryDependencyMode:
      params.index === 0 ? null : params.secondaryDependencyMode ?? "LINKED_TO_PRIMARY",
    detailsJson: {
      ...attackDetails,
      rangeCategory: "MELEE",
      rangeValue: 1,
      rangeExtra: {},
      ...params.detailsJson,
    },
  };
}

function controlPacket(index: number, controlMode: string, controlTheme: string): EffectPacket {
  return makePacket({
    intention: "CONTROL",
    index,
    detailsJson: {
      controlMode,
      controlTheme,
    },
  });
}

function helperExpectedControlPacket(index: number): EffectPacket {
  return controlPacket(index, "Force specific main action", "BODY_ENDURANCE");
}

function uiObservedControlPacket(index: number): EffectPacket {
  return controlPacket(index, "Force move", "BODY_ENDURANCE");
}

function uiDebuffPacket(index: number): EffectPacket {
  return makePacket({
    intention: "DEBUFF",
    index,
    detailsJson: {
      statTarget: "Attack",
    },
  });
}

function attackRiderPacket(index: number): EffectPacket {
  return makePacket({
    intention: "ATTACK",
    index,
    diceCount: 1,
    potency: 1,
  });
}

function previousHelperControlPacket(index: number): EffectPacket {
  return makePacket({
    intention: "CONTROL",
    index,
    effectDurationType: "TURNS",
    effectDurationTurns: 1,
    detailsJson: {
      controlMode: "Force no main action",
      controlTheme: "MIND_COGNITION",
    },
  });
}

function previousHelperDebuffPacket(index: number): EffectPacket {
  return makePacket({
    intention: "DEBUFF",
    index,
    effectDurationType: "TURNS",
    effectDurationTurns: 1,
    detailsJson: {
      statTarget: "Attack",
    },
  });
}

function makePower(name: string, packets: EffectPacket[]): CharacterPower {
  const primary = packets[0] ?? attackRiderPacket(0);
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

function makeSamples(): CharacterPower[] {
  return [
    makePower("UI Control screenshot shape only", [helperExpectedControlPacket(0)]),
    makePower("Actual UI-tested Control cost shape", [uiObservedControlPacket(0)]),
    makePower("UI Debuff screenshot shape only", [uiDebuffPacket(0)]),
    makePower("UI Control screenshot shape + Attack X1/Y1 rider", [
      helperExpectedControlPacket(0),
      attackRiderPacket(1),
    ]),
    makePower("Actual UI-tested Control cost shape + Attack X1/Y1 rider", [
      uiObservedControlPacket(0),
      attackRiderPacket(1),
    ]),
    makePower("UI Debuff screenshot shape + Attack X1/Y1 rider", [
      uiDebuffPacket(0),
      attackRiderPacket(1),
    ]),
    makePower("UI Control screenshot shape + UI Debuff screenshot shape", [
      helperExpectedControlPacket(0),
      uiDebuffPacket(1),
    ]),
    makePower("Actual UI-tested Control cost shape + UI Debuff screenshot shape", [
      uiObservedControlPacket(0),
      uiDebuffPacket(1),
    ]),
    makePower("UI Control screenshot shape + UI Debuff screenshot shape + Attack X1/Y1 rider", [
      helperExpectedControlPacket(0),
      uiDebuffPacket(1),
      attackRiderPacket(2),
    ]),
    makePower("Actual UI-tested Control cost shape + UI Debuff screenshot shape + Attack X1/Y1 rider", [
      uiObservedControlPacket(0),
      uiDebuffPacket(1),
      attackRiderPacket(2),
    ]),
    makePower("Previous helper Control only shape", [previousHelperControlPacket(0)]),
    makePower("Previous helper Debuff only shape", [previousHelperDebuffPacket(0)]),
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

function buildRows(params: {
  powers: CharacterPower[];
  tuningSnapshot: PowerTuningSnapshot;
  playerPowerSpendScalar: number;
}): SampleRow[] {
  const normalSummary = summarizeCharacterPowers({
    level: LEVEL,
    powers: params.powers,
    tuningSnapshot: params.tuningSnapshot,
    playerPowerSpendScalar: params.playerPowerSpendScalar,
  });
  const signatureSummary = summarizeCharacterPowers({
    level: LEVEL,
    powers: params.powers,
    tuningSnapshot: params.tuningSnapshot,
    playerPowerSpendScalar: params.playerPowerSpendScalar,
    powerPool: signatureMovePointPool(LEVEL),
    powerPoolKind: "signature",
  });
  const resolved = resolvePowerCosts(params.powers, params.tuningSnapshot, {
    level: LEVEL,
    tier: "SOLDIER",
  });

  return params.powers.map((power, index): SampleRow => {
    const resolvedPower = resolved.powers[index];
    const breakdown = resolvedPower?.breakdown;
    const basePowerValue = numberOrNull(breakdown?.basePowerValue);
    const normalSummaryRow = normalSummary.powers[index];
    const signatureSummaryRow = signatureSummary.powers[index];
    const primaryPacketCost = breakdown?.packetCosts[0] ?? null;
    return {
      id: index + 1,
      name: power.name,
      basePowerValue,
      spend:
        basePowerValue === null
          ? null
          : calculateCharacterPlayerPowerSpend(basePowerValue, params.playerPowerSpendScalar),
      summarySpend: normalSummaryRow?.spend ?? null,
      normalCooldownTurns: normalSummaryRow?.derivedCooldownTurns ?? null,
      signatureCooldownTurns: signatureSummaryRow?.derivedCooldownTurns ?? null,
      primaryDefenceLabel: getCharacterPowerPrimaryDefenceLabel(power),
      packetCountComplexityCost: numberOrNull(breakdown?.packetCountComplexityCost),
      packetContingencies:
        breakdown?.packetCosts.map((packet) => packet.contingencyMultiplier) ?? [],
      packetSpecificCosts:
        breakdown?.packetCosts.map((packet) => ({
          packetIndex: packet.packetIndex,
          intention: packet.intention ?? null,
          cost: numberOrNull(packet.packetSpecificCost),
          tuningKey:
            stringArrayOrEmpty(packet.debug.chosenTuningKeys).find(
              (key) => key.startsWith("packet.controlMode.") || key.startsWith("packet.debuffStat."),
            ) ?? "",
        })) ?? [],
      componentBreakdown: {
        sharedContextCost: numberOrNull(breakdown?.sharedContextCost),
        packetIdentityCost: numberOrNull(primaryPacketCost?.packetIdentityCost),
        packetMagnitudeCost: numberOrNull(primaryPacketCost?.packetMagnitudeCost),
        packetTimingCost: numberOrNull(primaryPacketCost?.packetTimingCost),
        packetDurationCost: numberOrNull(primaryPacketCost?.packetDurationCost),
        packetRecipientCost: numberOrNull(primaryPacketCost?.packetRecipientCost),
        packetSpecificCost: numberOrNull(primaryPacketCost?.packetSpecificCost),
        packetCountComplexityCost: numberOrNull(breakdown?.packetCountComplexityCost),
        crossPacketSynergyCost: numberOrNull(breakdown?.crossPacketSynergyCost),
      },
      errors: normalSummaryRow?.errors ?? [],
      warnings: normalSummaryRow?.warnings ?? [],
      serializedPower: power,
    };
  });
}

function printHuman(payload: {
  powerTuning: { id: string; name: string; slug: string };
  characterBuilderTuning: { id: string; playerPowerSpendScalar: number; fallbackUsed: boolean };
  rows: SampleRow[];
}) {
  console.log("Control/Debuff Atomic Cost Grid");
  console.log(`Level: ${LEVEL}`);
  console.log(`Power tuning: ${payload.powerTuning.name} (${payload.powerTuning.id})`);
  console.log(
    `Character Builder scalar: ${payload.characterBuilderTuning.playerPowerSpendScalar} (${payload.characterBuilderTuning.id}${payload.characterBuilderTuning.fallbackUsed ? ", fallback" : ""})`,
  );
  console.log("UI screenshot shapes: Immediate / No Counter / Standard / On Cast / Instant / Melee / 1 target");
  for (const row of payload.rows) {
    console.log(
      [
        `${row.id}. ${row.name}`,
        `BPV ${row.basePowerValue}`,
        `spend ${row.spend}`,
        `summarySpend ${row.summarySpend}`,
        `normalCD ${row.normalCooldownTurns}`,
        `signatureCD ${row.signatureCooldownTurns}`,
        `defence ${row.primaryDefenceLabel}`,
        `packetCount ${row.packetCountComplexityCost}`,
        `components shared:${row.componentBreakdown.sharedContextCost} identity:${row.componentBreakdown.packetIdentityCost} magnitude:${row.componentBreakdown.packetMagnitudeCost} timing:${row.componentBreakdown.packetTimingCost} duration:${row.componentBreakdown.packetDurationCost} recipient:${row.componentBreakdown.packetRecipientCost} specific:${row.componentBreakdown.packetSpecificCost} packets:${row.componentBreakdown.packetCountComplexityCost} synergy:${row.componentBreakdown.crossPacketSynergyCost}`,
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
    const rows = buildRows({
      powers: makeSamples(),
      tuningSnapshot: powerTuning.snapshot,
      playerPowerSpendScalar: characterBuilderTuning.playerPowerSpendScalar,
    });
    const payload = {
      powerTuning: powerTuning.source,
      characterBuilderTuning,
      rows,
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
