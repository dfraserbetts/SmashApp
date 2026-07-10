import { loadEnvConfig } from "@next/env";
import { execSync } from "node:child_process";

import {
  computeMonsterOutcomes,
  computeTraitAxisBonuses,
  type RadarAxes,
  type TraitAxisWeightDefinition,
} from "../lib/calculators/monsterOutcomeCalculator";
import type { CalculatorConfig, LevelCurvePoint } from "../lib/calculators/calculatorConfig";
import {
  applyCombatTuningToCalculatorConfig,
  normalizeCombatTuning,
  normalizeCombatTuningFlatValues,
} from "../lib/config/combatTuningShared";
import {
  normalizeOutcomeNormalizationValues,
  outcomeNormalizationValuesToCalculatorConfig,
} from "../lib/config/outcomeNormalizationShared";
import {
  normalizePowerTuningValues,
  type PowerTuningSnapshot,
} from "../lib/config/powerTuningShared";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";

type PrismaClientInstance = typeof import("../prisma/client")["prisma"];

const CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const CAMPAIGN_NAME = "Balance Environment";
const REMAINING_AXES = ["manipulation", "synergy", "mobility", "presence"] as const;
const NATURAL_ATTACK_RANGE_SCALAR_BY_DISTANCE: Record<number, number> = {
  0: 1,
  30: 1.05,
  60: 1.1,
  120: 1.18,
  200: 1.26,
};
const NATURAL_ATTACK_RANGE_MOBILITY_BONUS_BY_DISTANCE: Record<number, number> = {
  0: 0,
  30: 0.01,
  60: 0.02,
  120: 0.03,
  200: 0.04,
};
const NATURAL_ATTACK_RANGED_PRESENCE_SHARE_BY_DISTANCE: Record<number, number> = {
  30: 0.02,
  60: 0.04,
  120: 0.06,
  200: 0.08,
};
const NATURAL_ATTACK_RANGE_MOBILITY_CAP_SHARE = 0.2;
const NATURAL_ATTACK_RANGE_PRESENCE_CAP_SHARE = 0.5;

const SAMPLE_NAMES = [
  "BALANCE_Minion Striker",
  "BALANCE_Physical Striker",
  "BALANCE_Durable Soldier",
  "BALANCE_Control Hexer",
  "BALANCE_Dodge Pressure Skirmisher",
  "BALANCE_Support Candidate Pressure Striker",
  "BALANCE_Support Candidate Guard Anchor",
  "BALANCE_Support Candidate Suppression Hexer",
  "BALANCE_Elite Vanguard",
  "BALANCE_Elite Hexer",
  "BALANCE_Legendary Elite Duelist",
  "BALANCE_Legendary Elite True Hexer",
  "BALANCE_Legendary Elite Breaker Controller Rotation",
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
type TuningSet = {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: Date;
  entries: Array<{ configKey: string; value: number }>;
};

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>) {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function tuningMetadata(set: TuningSet) {
  return {
    setId: set.id,
    name: set.name,
    slug: set.slug,
    status: set.status,
    updatedAt: set.updatedAt.toISOString(),
  };
}

function createEmptyAxisVector(): RadarAxes {
  return {
    physicalThreat: 0,
    mentalThreat: 0,
    physicalSurvivability: 0,
    mentalSurvivability: 0,
    manipulation: 0,
    synergy: 0,
    mobility: 0,
    presence: 0,
  };
}

function getCurvePointForLevel(curve: LevelCurvePoint[], level: number): LevelCurvePoint {
  const normalizedLevel = Math.max(1, Math.trunc(level || 1));
  return curve.find((point) => point.level === normalizedLevel) ?? curve[curve.length - 1];
}

function getAxisBudgetTargets(
  monster: Pick<MonsterRow, "level" | "tier" | "legendary">,
  config: CalculatorConfig,
): RadarAxes {
  const tierKey = monster.legendary ? "LEGENDARY" : monster.tier;
  const tierMultiplier = config.tierMultipliers[tierKey] ?? 1;
  return Object.fromEntries(
    Object.entries(config.scoringCurves).map(([axis, curve]) => [
      axis,
      getCurvePointForLevel(curve, monster.level).max * tierMultiplier,
    ]),
  ) as RadarAxes;
}

function addNaturalAttackRangeAxisBonus(
  bonuses: RadarAxes,
  attackConfigValue: unknown,
  axisBudgetTargets: RadarAxes,
) {
  const attackConfig = asRecord(attackConfigValue);
  const rangedConfig = asRecord(attackConfig.ranged);
  if (rangedConfig.enabled === true) {
    const distance = asNumber(rangedConfig.distance);
    if (NATURAL_ATTACK_RANGE_SCALAR_BY_DISTANCE[distance] !== undefined) {
      bonuses.mobility +=
        axisBudgetTargets.mobility *
        (NATURAL_ATTACK_RANGE_MOBILITY_BONUS_BY_DISTANCE[distance] ?? 0);
      bonuses.presence +=
        axisBudgetTargets.presence *
        (NATURAL_ATTACK_RANGED_PRESENCE_SHARE_BY_DISTANCE[distance] ?? 0);
    }
  }

  const aoeConfig = asRecord(attackConfig.aoe);
  if (aoeConfig.enabled !== true) return;
  const castRange = asNumber(aoeConfig.centerRange);
  const rangeScalar = NATURAL_ATTACK_RANGE_SCALAR_BY_DISTANCE[castRange];
  if (rangeScalar === undefined) return;
  bonuses.mobility +=
    axisBudgetTargets.mobility *
    (NATURAL_ATTACK_RANGE_MOBILITY_BONUS_BY_DISTANCE[castRange] ?? 0);
  const shape = String(aoeConfig.shape ?? "SPHERE").toUpperCase();
  let expectedTargets = 1;
  if (shape === "SPHERE") {
    expectedTargets =
      ({ 10: 3, 20: 6, 30: 9 } as Record<number, number>)[
        asNumber(aoeConfig.sphereRadiusFeet)
      ] ?? 1;
  } else if (shape === "CONE") {
    expectedTargets =
      ({ 15: 3, 30: 8, 60: 14 } as Record<number, number>)[
        asNumber(aoeConfig.coneLengthFeet)
      ] ?? 1;
  } else {
    const lineTargets: Record<number, Record<number, number>> = {
      5: { 30: 3, 60: 6, 90: 9, 120: 12 },
      10: { 30: 4, 60: 8, 90: 12, 120: 16 },
      15: { 30: 5, 60: 10, 90: 15, 120: 20 },
      20: { 30: 6, 60: 12, 90: 18, 120: 24 },
    };
    expectedTargets =
      lineTargets[asNumber(aoeConfig.lineWidthFeet)]?.[
        asNumber(aoeConfig.lineLengthFeet)
      ] ?? 1;
  }
  bonuses.presence +=
    axisBudgetTargets.presence * Math.max(0, expectedTargets - 1) * 0.035 * rangeScalar;
}

function naturalAttackRangeAxisBonuses(monster: MonsterRow, config: CalculatorConfig) {
  const bonuses = createEmptyAxisVector();
  const axisBudgetTargets = getAxisBudgetTargets(monster, config);
  for (const attack of monster.attacks) {
    addNaturalAttackRangeAxisBonus(bonuses, attack.attackConfig, axisBudgetTargets);
  }
  bonuses.mobility = Math.min(
    bonuses.mobility,
    axisBudgetTargets.mobility * NATURAL_ATTACK_RANGE_MOBILITY_CAP_SHARE,
  );
  bonuses.presence = Math.min(
    bonuses.presence,
    axisBudgetTargets.presence * NATURAL_ATTACK_RANGE_PRESENCE_CAP_SHARE,
  );
  return bonuses;
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

function traitDefinitions(monster: MonsterRow): TraitAxisWeightDefinition[] {
  return monster.traits.map(({ trait }) => ({
    band: trait.band,
    physicalThreatWeight: trait.physicalThreatWeight,
    mentalThreatWeight: trait.mentalThreatWeight,
    physicalSurvivabilityWeight: trait.physicalSurvivabilityWeight,
    mentalSurvivabilityWeight: trait.mentalSurvivabilityWeight,
    survivabilityWeight: trait.survivabilityWeight,
    manipulationWeight: trait.manipulationWeight,
    synergyWeight: trait.synergyWeight,
    mobilityWeight: trait.mobilityWeight,
    presenceWeight: trait.presenceWeight,
  }));
}

function axisRecord(value: unknown) {
  const record = asRecord(value);
  return Object.fromEntries(
    REMAINING_AXES.map((axis) => [axis, round(asNumber(record[axis]))]),
  ) as Record<(typeof REMAINING_AXES)[number], number>;
}

function summarizeMonster(
  monster: MonsterRow,
  tuning: Awaited<ReturnType<typeof loadActiveTuning>>,
) {
  const calculatorInput = buildCalculatorInput(monster);
  const powerCosts = resolvePowerCosts(
    calculatorInput.powers as unknown as Parameters<typeof resolvePowerCosts>[0],
    tuning.powerSnapshot,
    { level: monster.level, tier: monster.tier },
  );
  const traitAxisBonuses = computeTraitAxisBonuses(traitDefinitions(monster), monster.level);
  const naturalRangeAxisBonuses = naturalAttackRangeAxisBonuses(
    monster,
    tuning.calculatorConfig,
  );
  const outcome = computeMonsterOutcomes(
    calculatorInput as unknown as Parameters<typeof computeMonsterOutcomes>[0],
    tuning.calculatorConfig,
    {
      protectionTuning: tuning.combatValues,
      traitAxisBonuses,
      naturalAttackRangeAxisBonuses: naturalRangeAxisBonuses,
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
            (calculatorInput.powers.find(
              (authored) => authored.id === power.powerId || authored.name === power.name,
            ) ?? null) as unknown as Parameters<typeof resolvePowerCosts>[0][number] | null,
          derivedCooldownTurns: power.derivedCooldownTurns,
          derivedCooldownLoad: power.derivedCooldown.cooldownLoad,
          cooldownTurns: power.cooldownTurns,
          cooldownReduction: power.cooldownReduction,
        })),
        debug: powerCosts,
      },
    },
  );
  const debug = asRecord(outcome.debug);
  const nonPower = asRecord(asRecord(debug.nonPowerContribution).axisVector);
  const nonPowerSources = asRecord(asRecord(debug.nonPowerContribution).sources);
  const powerDebug = asRecord(debug.powerContribution);
  const perPowerAvailability = Array.isArray(powerDebug.perPowerAvailability)
    ? powerDebug.perPowerAvailability.map(asRecord)
    : [];
  const canonicalPower = asRecord(powerDebug.canonicalPowerAxisVector);
  const effectivePower = asRecord(powerDebug.effectivePowerAxisVector);
  const finalPre = asRecord(debug.finalPreNormalizationAxes);
  const normalization = asRecord(debug.normalizationBreakdown);
  const pressureAxisBaselineModel = asRecord(normalization.pressureAxisBaselineModel);
  const curvePoints = asRecord(normalization.curvePoints);
  const tierMultiplier = asNumber(normalization.tierMultiplier);

  const axes = Object.fromEntries(
    REMAINING_AXES.map((axis) => {
      const curve = asRecord(curvePoints[axis]);
      const final = round(outcome.radarAxes[axis]);
      const raw = round(asNumber(finalPre[axis]));
      const min = round(asNumber(curve.min));
      const max = round(asNumber(curve.max));
      const tierAdjustedMax = round(max * tierMultiplier);
      return [
        axis,
        {
          final,
          raw,
          nonPower: round(asNumber(nonPower[axis])),
          canonicalPower: round(asNumber(canonicalPower[axis])),
          effectivePower: round(asNumber(effectivePower[axis])),
          curve: { min, max, tierMultiplier, tierAdjustedMax },
          cappedAtZero: final === 0,
          cappedAtTen: final === 10,
        },
      ];
    }),
  );

  return {
    name: monster.name,
    id: monster.id,
    level: monster.level,
    tier: monster.tier,
    legendary: monster.legendary,
    equipmentIds: {
      mainHand: monster.mainHandItemId,
      offHand: monster.offHandItemId,
      smallItem: monster.smallItemId,
      headArmor: monster.headArmorItemId,
      shoulderArmor: monster.shoulderArmorItemId,
      torsoArmor: monster.torsoArmorItemId,
      legsArmor: monster.legsArmorItemId,
      feetArmor: monster.feetArmorItemId,
    },
    radarAxes: Object.fromEntries(
      Object.entries(outcome.radarAxes).map(([axis, value]) => [axis, round(value)]),
    ),
    rawPreNormalizationAxes: Object.fromEntries(
      Object.entries(finalPre).map(([axis, value]) => [axis, round(asNumber(value))]),
    ),
    axes,
    pressureAxisBaselineModel,
    contributors: {
      traits: monster.traits.map(({ trait }) => ({
        name: trait.name,
        band: trait.band,
        axisVector: axisRecord(
          computeTraitAxisBonuses(
            [traitDefinitions(monster)[monster.traits.findIndex((row) => row.trait.id === trait.id)]],
            monster.level,
          ),
        ),
      })),
      traitTotal: axisRecord(traitAxisBonuses),
      powers: powerCosts.powers.map((power) => ({
        name: power.name,
        derivedCooldownTurns: power.derivedCooldownTurns,
        canonicalAxisVector: axisRecord(power.breakdown.axisVector),
        effectiveAxisVector: axisRecord(
          perPowerAvailability.find(
            (row) =>
              (power.powerId != null && row.id === power.powerId) || row.name === power.name,
          )?.effectivePowerAxisVector,
        ),
        intentions:
          calculatorInput.powers
            .find((authored) => authored.id === power.powerId || authored.name === power.name)
            ?.intentions.map((packet) => packet.intention) ?? [],
      })),
      nonPowerPresenceBudget: round(asNumber(nonPowerSources.nonPowerPresenceBudget)),
      naturalAttackGreaterSuccess: axisRecord(nonPowerSources.naturalAttackGsAxisBonuses),
      naturalAttackRange: axisRecord(nonPowerSources.naturalAttackRangeAxisBonuses),
      equipment: axisRecord(nonPowerSources.equipmentModifierAxisBonuses),
      limitBreak: axisRecord(nonPowerSources.customLimitBreakAxisBonuses),
    },
  };
}

async function loadActiveTuning(prisma: PrismaClientInstance) {
  const [powerSet, combatSet, outcomeSet] = await Promise.all([
    prisma.powerTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
    prisma.combatTuningConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
    prisma.outcomeNormalizationConfigSet.findFirst({
      where: { status: "ACTIVE" },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
    }),
  ]);
  if (!powerSet || !combatSet || !outcomeSet) {
    throw new Error("Missing ACTIVE Power, Combat, or Outcome Normalization tuning set.");
  }
  const powerSnapshot: PowerTuningSnapshot = {
    setId: powerSet.id,
    name: powerSet.name,
    slug: powerSet.slug,
    status: powerSet.status,
    updatedAt: powerSet.updatedAt.toISOString(),
    values: normalizePowerTuningValues(entriesToRecord(powerSet.entries)),
  };
  const combatValues = normalizeCombatTuning(
    normalizeCombatTuningFlatValues(entriesToRecord(combatSet.entries)),
  );
  const outcomeValues = normalizeOutcomeNormalizationValues(entriesToRecord(outcomeSet.entries));
  return {
    powerSnapshot,
    combatValues,
    calculatorConfig: applyCombatTuningToCalculatorConfig(
      outcomeNormalizationValuesToCalculatorConfig(outcomeValues),
      combatValues,
    ),
    metadata: {
      power: tuningMetadata(powerSet),
      combat: tuningMetadata(combatSet),
      outcomeNormalization: tuningMetadata(outcomeSet),
    },
  };
}

async function loadMonsters(prisma: PrismaClientInstance) {
  return prisma.monster.findMany({
    where: { campaignId: CAMPAIGN_ID, name: { in: [...SAMPLE_NAMES] } },
    orderBy: { name: "asc" },
    include: {
      naturalAttack: true,
      attacks: { orderBy: { sortOrder: "asc" } },
      traits: { include: { trait: true }, orderBy: { sortOrder: "asc" } },
      powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
    },
  });
}

function printHuman(payload: Awaited<ReturnType<typeof buildPayload>>) {
  console.log(payload.title);
  console.log(`campaignId=${payload.provenance.campaignId}`);
  console.log(`campaignName=${payload.provenance.campaignName}`);
  console.log(`repoHead=${payload.provenance.repoHead}`);
  console.log(`gitStatus=${payload.provenance.gitStatus}`);
  console.log("databaseAccess=read-only; mutation=none");
  console.log(`samples=${payload.samples.length}; missing=${payload.missingSamples.join(",") || "none"}`);
  console.log(`caveat=${payload.caveat}`);
  console.log("");
  console.log("Name | tier/L | Manipulation final/raw | Synergy final/raw | Mobility final/raw | Presence final/raw");
  for (const sample of payload.samples) {
    const axes = sample.axes as Record<string, { final: number; raw: number }>;
    console.log(
      `${sample.name} | ${sample.tier}${sample.legendary ? "+LEG" : ""}/L${sample.level} | ${axes.manipulation.final}/${axes.manipulation.raw} | ${axes.synergy.final}/${axes.synergy.raw} | ${axes.mobility.final}/${axes.mobility.raw} | ${axes.presence.final}/${axes.presence.raw}`,
    );
    for (const power of sample.contributors.powers) {
      console.log(
        `  power=${power.name} cd=${power.derivedCooldownTurns} intentions=${power.intentions.join("+") || "none"} canonical=${JSON.stringify(power.canonicalAxisVector)}`,
      );
    }
    for (const trait of sample.contributors.traits) {
      console.log(`  trait=${trait.name} band=${trait.band} axes=${JSON.stringify(trait.axisVector)}`);
    }
    const pressure = sample.pressureAxisBaselineModel;
    console.log(
      `  pressureModel=${pressure.policy ?? "missing"} mode=${pressure.mode ?? "missing"} baseline=${pressure.baselinePackageId ?? "none"} meaningfulActions=${pressure.meaningfulActionCount ?? 0} actualProxy=${round(asNumber(pressure.rawActualPressureProxy))} baselineProxy=${round(asNumber(pressure.rawBaselinePressureProxy))} ratio=${round(asNumber(pressure.ratioToBaseline))} uncapped=${round(asNumber(pressure.uncappedScore))} final=${round(asNumber(pressure.finalScore))} capped=${Boolean(pressure.capped)}`,
    );
    console.log(`  pressureComponents=${JSON.stringify(pressure.components ?? {})}`);
    console.log(
      `  pressureSignatures=${JSON.stringify(pressure.deduplicatedFunctionalSignatures ?? [])}`,
    );
    const warnings = Array.isArray(pressure.unsupportedPackageWarnings)
      ? pressure.unsupportedPackageWarnings
      : [];
    if (warnings.length > 0) console.log(`  pressureWarnings=${JSON.stringify(warnings)}`);
    console.log(
      `  responseBurden=${pressure.responseBurdenOmissionReason ?? "included"} traitEquipment=${JSON.stringify(pressure.traitEquipmentContribution ?? {})}`,
    );
  }
}

async function buildPayload() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");
  try {
    const [tuning, monsters] = await Promise.all([loadActiveTuning(prisma), loadMonsters(prisma)]);
    const found = new Set(monsters.map((monster) => monster.name));
    return {
      title: "Summoning Circle remaining-axis reconciliation",
      provenance: {
        campaignId: CAMPAIGN_ID,
        campaignName: CAMPAIGN_NAME,
        repoHead: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
        gitStatus:
          execSync("git status --short --untracked-files=all", { encoding: "utf8" }).trim() ||
          "clean",
        activeTuning: tuning.metadata,
      },
      caveat:
        "Uses production Outcome Calculator and power/trait resolvers plus the current editor natural-range adapter. Equipment and named greater-success effect side bonuses remain zero because their UI-local builders are not reusable outside the editor; sampled assets are reported with their current authored equipment IDs for review.",
      missingSamples: SAMPLE_NAMES.filter((name) => !found.has(name)),
      samples: monsters.map((monster) => summarizeMonster(monster, tuning)),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const payload = await buildPayload();
  if (process.argv.includes("--json")) console.log(JSON.stringify(payload, null, 2));
  else printHuman(payload);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
