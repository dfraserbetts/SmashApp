import { loadEnvConfig } from "@next/env";

import {
  computeMonsterOutcomes,
  dieSidesFromDieString,
  expectedTieredSuccesses,
  expectedTieredSuccessesPerDie,
  type RadarAxes,
} from "../lib/calculators/monsterOutcomeCalculator";
import { calculatorConfig } from "../lib/calculators/calculatorConfig";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import { strengthToTableWoundsPerSuccess } from "../lib/forge/outputProfile";

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];

const CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const CAMPAIGN_NAME = "Balance Environment";

const SAMPLE_NAMES = [
  "BALANCE_Physical Striker",
  "BALANCE_Durable Soldier",
  "BALANCE_Control Hexer",
  "BALANCE_Dodge Pressure Skirmisher",
  "BALANCE_Support Candidate Pressure Striker",
  "BALANCE_Support Candidate Guard Anchor",
  "BALANCE_Support Candidate Suppression Hexer",
  "BALANCE_Legendary Elite Duelist",
  "BALANCE_Legendary Elite Hexer",
  "BALANCE_Legendary Elite Breaker Controller Rotation",
  "BALANCE_Legendary Elite True Hexer",
  "BALANCE_Boss Warlord",
  "BALANCE_Boss Hexlord",
  "BALANCE_Boss Behemoth",
  "BALANCE_Legendary Dragon",
  "BALANCE_Legendary Lich",
] as const;

const POWER_INCLUDE = {
  rangeCategories: { orderBy: { rangeCategory: "asc" as const } },
  primaryDefenceGate: true,
  effectPackets: {
    orderBy: { packetIndex: "asc" as const },
    include: { localTargetingOverride: true },
  },
};

type MonsterRow = Awaited<ReturnType<typeof loadMonsters>>[number];

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function axis(value: Partial<RadarAxes> | null | undefined, key: keyof RadarAxes): number {
  return round(Number(value?.[key] ?? 0));
}

function rangeProfiles(config: unknown) {
  const record = asRecord(config);
  return (["melee", "ranged", "aoe"] as const).flatMap((range) => {
    const profile = asRecord(record[range]);
    if (profile.enabled !== true) return [];
    const physicalStrength = asNumber(profile.physicalStrength);
    const mentalStrength = asNumber(profile.mentalStrength);
    const targets =
      range === "aoe"
        ? Math.max(1, asNumber(profile.count, 1))
        : Math.max(1, asNumber(profile.targets, 1));
    const damageTypes = asArray(profile.damageTypes);
    const damageTypeLabels = damageTypes.map((entry) => {
      const damageType = asRecord(entry);
      return `${String(damageType.mode ?? "?")}:${String(damageType.name ?? "?")}`;
    });
    return [
      {
        range,
        physicalStrength,
        mentalStrength,
        physicalWoundsPerSuccess: strengthToTableWoundsPerSuccess(physicalStrength),
        mentalWoundsPerSuccess: strengthToTableWoundsPerSuccess(mentalStrength),
        targets,
        damageTypes: damageTypeLabels,
      },
    ];
  });
}

function attackSummaries(monster: MonsterRow) {
  const attacks = monster.attacks.length > 0
    ? monster.attacks
    : monster.naturalAttack
      ? [
          {
            attackName: monster.naturalAttack.attackName,
            attackMode: "NATURAL",
            attackConfig: monster.naturalAttack.attackConfig,
          },
        ]
      : [];
  return attacks.map((attack) => ({
    name: attack.attackName ?? "Natural Attack",
    mode: String(attack.attackMode),
    profiles: rangeProfiles(attack.attackConfig),
  }));
}

function powerSummaries(monster: MonsterRow) {
  return monster.powers.map((power) => ({
    name: power.name,
    cooldownTurns: power.cooldownTurns,
    rangeCategories: power.rangeCategories.map((range) => range.rangeCategory),
    packets: power.effectPackets.map((packet) => ({
      index: packet.packetIndex,
      intention: packet.intention,
      diceCount: packet.diceCount,
      potency: packet.potency,
      woundsPerSuccess: strengthToTableWoundsPerSuccess(packet.potency),
      woundChannel: packet.woundChannel,
      detailsJson: packet.detailsJson,
    })),
  }));
}

function buildCalculatorInput(monster: MonsterRow) {
  return {
    ...monster,
    attacks: monster.attacks.map((attack) => ({
      id: attack.id,
      attackMode: attack.attackMode,
      attackName: attack.attackName,
      attackConfig: attack.attackConfig,
    })),
    naturalAttack: monster.naturalAttack
      ? {
          attackName: monster.naturalAttack.attackName,
          attackConfig: monster.naturalAttack.attackConfig,
        }
      : null,
    powers: monster.powers.map((power) => ({
      ...power,
      rangeCategories: power.rangeCategories.map((range) => range.rangeCategory),
      intentions: power.effectPackets.map((packet) => ({
        ...packet,
        detailsJson: packet.detailsJson,
        localTargetingOverride: packet.localTargetingOverride,
      })),
    })),
  };
}

function summarizeMonster(monster: MonsterRow) {
  const calculatorInput = buildCalculatorInput(monster);
  const powerCosts = resolvePowerCosts(
    calculatorInput.powers as unknown as Parameters<typeof resolvePowerCosts>[0],
    undefined,
    {
    level: monster.level,
    tier: monster.tier,
    },
  );
  const outcome = computeMonsterOutcomes(
    calculatorInput as unknown as Parameters<typeof computeMonsterOutcomes>[0],
    calculatorConfig,
    {
    powerContribution: {
      axisVector: powerCosts.totals.axisVector,
      basePowerValue: powerCosts.totals.basePowerValue,
      powerCount: powerCosts.powers.length,
      powers: powerCosts.powers.map((power) => ({
        id: power.powerId ?? null,
        name: power.name,
        axisVector: power.breakdown.axisVector,
        basePowerValue: power.breakdown.basePowerValue,
        authoredPower:
          (calculatorInput.powers.find((authoredPower) => authoredPower.id === power.powerId) ??
            null) as unknown as Parameters<typeof resolvePowerCosts>[0][number] | null,
        derivedCooldownTurns: power.derivedCooldownTurns,
        cooldownTurns:
          calculatorInput.powers.find((authoredPower) => authoredPower.id === power.powerId)
            ?.cooldownTurns ?? null,
        cooldownReduction:
          calculatorInput.powers.find((authoredPower) => authoredPower.id === power.powerId)
            ?.cooldownReduction ?? null,
      })),
      debug: powerCosts,
    },
    },
  );
  const debug = asRecord(outcome.debug);
  const nonPower = asRecord(asRecord(debug.nonPowerContribution).axisVector);
  const powerDebug = asRecord(debug.powerContribution);
  const effectivePower = asRecord(powerDebug.effectivePowerAxisVector);
  const expectedAttackOutput = asRecord(powerDebug.expectedAttackOutput);
  const finalPreNormalizationAxes = asRecord(debug.finalPreNormalizationAxes);
  const normalization = asRecord(debug.normalizationBreakdown);
  const curvePoints = asRecord(normalization.curvePoints);
  const physicalThreatCurve = asRecord(curvePoints.physicalThreat);
  const mentalThreatCurve = asRecord(curvePoints.mentalThreat);
  const threatAxisBaselineModel = asRecord(normalization.threatAxisBaselineModel);
  const physicalThreatBaseline = asRecord(threatAxisBaselineModel.physicalThreat);
  const mentalThreatBaseline = asRecord(threatAxisBaselineModel.mentalThreat);

  return {
    name: monster.name,
    id: monster.id,
    level: monster.level,
    tier: monster.tier,
    legendary: monster.legendary,
    attackDie: monster.attackDie,
    attackDieSides: dieSidesFromDieString(monster.attackDie),
    weaponSkillValue: monster.weaponSkillValue,
    expectedSuccessesPerDie: round(expectedTieredSuccessesPerDie(dieSidesFromDieString(monster.attackDie)), 4),
    expectedAtWillSuccesses: round(
      expectedTieredSuccesses({
        dieSides: dieSidesFromDieString(monster.attackDie),
        diceCount: monster.weaponSkillValue,
      }),
      4,
    ),
    naturalAttacks: attackSummaries(monster),
    attackPowers: powerSummaries(monster),
    axis: {
      physicalThreat: axis(outcome.radarAxes, "physicalThreat"),
      mentalThreat: axis(outcome.radarAxes, "mentalThreat"),
      physicalSurvivability: axis(outcome.radarAxes, "physicalSurvivability"),
      mentalSurvivability: axis(outcome.radarAxes, "mentalSurvivability"),
      manipulation: axis(outcome.radarAxes, "manipulation"),
      presence: axis(outcome.radarAxes, "presence"),
    },
    raw: {
      nonPowerPhysicalThreat: round(asNumber(nonPower.physicalThreat)),
      nonPowerMentalThreat: round(asNumber(nonPower.mentalThreat)),
      effectivePowerPhysicalThreat: round(asNumber(effectivePower.physicalThreat)),
      effectivePowerMentalThreat: round(asNumber(effectivePower.mentalThreat)),
      expectedPowerAttackPhysicalThreat: round(
        asNumber(asRecord(expectedAttackOutput.axisVector).physicalThreat),
      ),
      expectedPowerAttackMentalThreat: round(
        asNumber(asRecord(expectedAttackOutput.axisVector).mentalThreat),
      ),
      finalPhysicalThreat: round(asNumber(finalPreNormalizationAxes.physicalThreat)),
      finalMentalThreat: round(asNumber(finalPreNormalizationAxes.mentalThreat)),
    },
    curve: {
      physicalThreat: {
        min: asNumber(physicalThreatCurve.min),
        max: asNumber(physicalThreatCurve.max),
      },
      mentalThreat: {
        min: asNumber(mentalThreatCurve.min),
        max: asNumber(mentalThreatCurve.max),
      },
    },
    threatBaseline: {
      physicalThreat: {
        baselineRaw: round(asNumber(physicalThreatBaseline.baselineRaw)),
        ratioToBaseline: round(asNumber(physicalThreatBaseline.ratioToBaseline), 3),
        finalScore: round(asNumber(physicalThreatBaseline.finalScore)),
        capped: Boolean(physicalThreatBaseline.capped),
      },
      mentalThreat: {
        baselineRaw: round(asNumber(mentalThreatBaseline.baselineRaw)),
        ratioToBaseline: round(asNumber(mentalThreatBaseline.ratioToBaseline), 3),
        finalScore: round(asNumber(mentalThreatBaseline.finalScore)),
        capped: Boolean(mentalThreatBaseline.capped),
      },
    },
    powerContributionSource: String(powerDebug.source ?? "unknown"),
    expectedAttackOutputSource: String(expectedAttackOutput.source ?? "unknown"),
  };
}

async function loadMonsters(prisma: PrismaClientInstance) {
  return prisma.monster.findMany({
    where: {
      campaignId: CAMPAIGN_ID,
      name: { in: [...SAMPLE_NAMES] },
    },
    orderBy: { name: "asc" },
    include: {
      naturalAttack: true,
      attacks: { orderBy: { sortOrder: "asc" } },
      traits: { include: { trait: true }, orderBy: { sortOrder: "asc" } },
      powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
    },
  });
}

function printHuman(payload: ReturnType<typeof buildPayload>) {
  console.log("Summoning Circle / Outcome Calculator axis reconciliation");
  console.log(`campaignId=${payload.provenance.campaignId}`);
  console.log(`campaignName=${payload.provenance.campaignName}`);
  console.log(`repoHead=${payload.provenance.repoHead}`);
  console.log(`gitStatus=${payload.provenance.gitStatus}`);
  console.log("mutation=none; databaseAccess=read-only");
  console.log(`samples=${payload.samples.length}`);
  console.log("");
  console.log("Calculator caveat: this helper uses computeMonsterOutcomes and resolvePowerCosts directly.");
  console.log("It does not reproduce editor-only natural attack effect/range axis side bonuses or equipped item axis bonuses.");
  console.log("");
  for (const sample of payload.samples) {
    console.log(
      [
        sample.name,
        `tier=${sample.tier}`,
        `legendary=${sample.legendary}`,
        `level=${sample.level}`,
        `attack=${sample.weaponSkillValue}x${sample.attackDie}`,
        `expectedSuccesses=${sample.expectedAtWillSuccesses}`,
        `axis PT/MT/PS/MS=${sample.axis.physicalThreat}/${sample.axis.mentalThreat}/${sample.axis.physicalSurvivability}/${sample.axis.mentalSurvivability}`,
        `rawThreat nonPower=${sample.raw.nonPowerPhysicalThreat}/${sample.raw.nonPowerMentalThreat}`,
        `power=${sample.raw.effectivePowerPhysicalThreat}/${sample.raw.effectivePowerMentalThreat}`,
        `baselineRatio PT/MT=${sample.threatBaseline.physicalThreat.ratioToBaseline}/${sample.threatBaseline.mentalThreat.ratioToBaseline}`,
        `curveMax PT/MT=${sample.curve.physicalThreat.max}/${sample.curve.mentalThreat.max}`,
      ].join(" | "),
    );
    for (const attack of sample.naturalAttacks) {
      console.log(`  attack: ${attack.name} (${attack.mode})`);
      for (const profile of attack.profiles) {
        console.log(
          `    ${profile.range} targets=${profile.targets} P=${profile.physicalStrength} W/S${profile.physicalWoundsPerSuccess} M=${profile.mentalStrength} W/S${profile.mentalWoundsPerSuccess} types=${profile.damageTypes.join(",") || "none"}`,
        );
      }
    }
    for (const power of sample.attackPowers) {
      console.log(
        `  power: ${power.name} cd=${power.cooldownTurns} ranges=${power.rangeCategories.join(",") || "none"}`,
      );
      for (const packet of power.packets) {
        console.log(
          `    packet ${packet.index} ${packet.intention} dice=${packet.diceCount} potency=${packet.potency} W/S${packet.woundsPerSuccess} channel=${packet.woundChannel ?? "none"}`,
        );
      }
    }
  }
}

function buildPayload(params: {
  repoHead: string;
  gitStatus: string;
  samples: ReturnType<typeof summarizeMonster>[];
}) {
  return {
    title: "Summoning Circle / Outcome Calculator axis reconciliation",
    provenance: {
      campaignId: CAMPAIGN_ID,
      campaignName: CAMPAIGN_NAME,
      repoHead: params.repoHead,
      gitStatus: params.gitStatus,
      databaseAccess: "read-only",
      mutation: "none",
    },
    caveat:
      "Uses computeMonsterOutcomes and resolvePowerCosts directly; editor-only natural attack effect/range side bonuses and equipped item axis bonuses are not reproduced.",
    samples: params.samples,
  };
}

async function main() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");
  const { execSync } = await import("node:child_process");
  const json = process.argv.includes("--json");
  const repoHead = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const gitStatus = execSync("git status --short --untracked-files=all", {
    encoding: "utf8",
  }).trim() || "clean";

  try {
    const rows = await loadMonsters(prisma);
    const foundNames = new Set(rows.map((row) => row.name));
    const missing = SAMPLE_NAMES.filter((name) => !foundNames.has(name));
    const payload = buildPayload({
      repoHead,
      gitStatus,
      samples: rows.map(summarizeMonster),
    });
    if (json) {
      console.log(JSON.stringify({ ...payload, missingSamples: missing }, null, 2));
    } else {
      printHuman(payload);
      if (missing.length > 0) console.log(`Missing samples: ${missing.join(", ")}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
