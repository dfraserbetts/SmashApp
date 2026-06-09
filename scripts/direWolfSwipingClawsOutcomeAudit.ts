import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { computeMonsterOutcomes, type CanonicalPowerContribution, type RadarAxes } from "../lib/calculators/monsterOutcomeCalculator";
import { applyCombatTuningToCalculatorConfig, normalizeCombatTuning, normalizeCombatTuningFlatValues } from "../lib/config/combatTuningShared";
import { DEFAULT_CHARACTER_POWER_SPEND_SCALAR, normalizeCharacterPowerSpendScalar } from "../lib/config/characterBuilderTuningShared";
import { normalizeOutcomeNormalizationValues, outcomeNormalizationValuesToCalculatorConfig } from "../lib/config/outcomeNormalizationShared";
import { normalizePowerTuningValues, type PowerTuningSnapshot } from "../lib/config/powerTuningShared";
import { adaptCampaignCharacterToCombatActor, adaptMonsterToCombatLabActor, itemTemplateToSummoningEquipmentItem } from "../lib/combat-lab/liveAdapters";
import { resolvePowerCosts } from "../lib/summoning/powerCostResolver";
import type { EffectPacket, MonsterTier, Power, RangeCategory } from "../lib/summoning/types";

type ActiveSetWithEntries = {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: Date;
  activatedAt: Date | null;
  entries: Array<{ configKey: string; value: number }>;
};

const POWER_INCLUDE = {
  rangeCategories: { orderBy: { rangeCategory: "asc" as const } },
  primaryDefenceGate: true,
  effectPackets: {
    orderBy: { packetIndex: "asc" as const },
    include: { localTargetingOverride: true },
  },
};

const ITEM_TEMPLATE_INCLUDE = {
  rangeCategories: { select: { rangeCategory: true } },
  meleeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  rangedDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  aoeDamageTypes: { select: { damageType: { select: { name: true, attackMode: true } } } },
  attackEffectsMelee: { select: { attackEffect: { select: { name: true } } } },
  attackEffectsRanged: { select: { attackEffect: { select: { name: true } } } },
  attackEffectsAoE: { select: { attackEffect: { select: { name: true } } } },
};

const AXES: Array<keyof RadarAxes> = [
  "physicalThreat",
  "mentalThreat",
  "physicalSurvivability",
  "mentalSurvivability",
  "manipulation",
  "synergy",
  "mobility",
  "presence",
];

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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

function snapshotFromSet<TValues extends Record<string, number>>(
  set: ActiveSetWithEntries | null,
  normalize: (values: Record<string, unknown>) => TValues,
) {
  if (!set) return null;
  return {
    setId: set.id,
    name: set.name,
    slug: set.slug,
    status: set.status,
    updatedAt: set.updatedAt.toISOString(),
    activatedAt: set.activatedAt?.toISOString() ?? null,
    values: normalize(entriesToRecord(set.entries)),
    source: "live-db-active-set" as const,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function mapPower(power: {
  id?: string;
  sortOrder: number;
  name: string;
  description: string | null;
  descriptorChassis?: Power["descriptorChassis"] | null;
  descriptorChassisConfig?: unknown;
  commitmentModifier?: Power["commitmentModifier"] | null;
  counterMode?: Power["counterMode"] | null;
  cooldownTurns: number;
  cooldownReduction: number;
  primaryDefenceGate?: Power["primaryDefenceGate"] | null;
  rangeCategories?: Array<{ rangeCategory: string }>;
  effectPackets?: unknown[];
  diceCount?: unknown;
  potency?: unknown;
}): Power {
  const rangeCategories = Array.isArray(power.rangeCategories)
    ? power.rangeCategories
        .map((row) => row.rangeCategory)
        .filter((value): value is RangeCategory => value === "MELEE" || value === "RANGED" || value === "AOE")
    : [];
  const effectPackets = Array.isArray(power.effectPackets)
    ? power.effectPackets.map((packet, index): EffectPacket => {
        const raw = asRecord(packet);
        return {
          id: typeof raw.id === "string" ? raw.id : undefined,
          sortOrder: Number(raw.sortOrder ?? raw.packetIndex ?? index),
          packetIndex: Number(raw.packetIndex ?? index),
          hostility: raw.hostility === "NON_HOSTILE" ? "NON_HOSTILE" : "HOSTILE",
          intention: String(raw.intention ?? raw.type ?? "ATTACK") as EffectPacket["intention"],
          type: String(raw.intention ?? raw.type ?? "ATTACK") as EffectPacket["type"],
          specific: typeof raw.specific === "string" ? raw.specific : null,
          diceCount: Number(raw.diceCount ?? 1),
          potency: Number(raw.potency ?? 1),
          effectTimingType: raw.effectTimingType as EffectPacket["effectTimingType"],
          effectTimingTurns: typeof raw.effectTimingTurns === "number" ? raw.effectTimingTurns : null,
          effectDurationType: raw.effectDurationType as EffectPacket["effectDurationType"],
          effectDurationTurns: typeof raw.effectDurationTurns === "number" ? raw.effectDurationTurns : null,
          dealsWounds: Boolean(raw.dealsWounds),
          woundChannel: raw.woundChannel === "MENTAL" || raw.woundChannel === "PHYSICAL" ? raw.woundChannel : null,
          targetedAttribute: raw.targetedAttribute as EffectPacket["targetedAttribute"],
          applicationModeKey: typeof raw.applicationModeKey === "string" ? raw.applicationModeKey : null,
          resolutionOrigin: "CASTER",
          applyTo: raw.applyTo === "ALLIES" || raw.applyTo === "SELF" ? raw.applyTo : "PRIMARY_TARGET",
          triggerConditionText: typeof raw.triggerConditionText === "string" ? raw.triggerConditionText : null,
          detailsJson: asRecord(raw.detailsJson),
          localTargetingOverride: null,
        };
      })
    : [];

  return {
    id: power.id,
    sortOrder: power.sortOrder,
    name: power.name,
    description: power.description,
    descriptorChassis: power.descriptorChassis ?? "IMMEDIATE",
    descriptorChassisConfig: asRecord(power.descriptorChassisConfig),
    commitmentModifier: power.commitmentModifier ?? "STANDARD",
    counterMode: power.counterMode === "YES" ? "YES" : "NO",
    cooldownTurns: power.cooldownTurns,
    cooldownReduction: power.cooldownReduction,
    primaryDefenceGate: power.primaryDefenceGate ?? null,
    rangeCategories,
    effectPackets,
    intentions: effectPackets,
    diceCount: Number(power.diceCount ?? effectPackets[0]?.diceCount ?? 1),
    potency: Number(power.potency ?? effectPackets[0]?.potency ?? 1),
  };
}

function round(value: unknown, places = 2): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** places;
  return Math.round(number * factor) / factor;
}

function roundedAxes(value: Partial<RadarAxes> | null | undefined): RadarAxes {
  return Object.fromEntries(AXES.map((axis) => [axis, round(value?.[axis] ?? 0)])) as RadarAxes;
}

function dieSides(die: unknown): number {
  const match = String(die ?? "").match(/\d+/);
  return match ? Number(match[0]) : 10;
}

function perDieSuccessDistribution(sides: number) {
  const zero = Math.min(3, sides) / sides;
  const one = Math.max(0, Math.min(9, sides) - 3) / sides;
  const two = Math.max(0, sides - 9) / sides;
  return { zero, one, two };
}

function totalSuccessDistribution(diceCount: number, sides: number) {
  let distribution = new Map<number, number>([[0, 1]]);
  const perDie = perDieSuccessDistribution(sides);
  for (let die = 0; die < diceCount; die += 1) {
    const next = new Map<number, number>();
    for (const [successes, probability] of distribution.entries()) {
      next.set(successes, (next.get(successes) ?? 0) + probability * perDie.zero);
      next.set(successes + 1, (next.get(successes + 1) ?? 0) + probability * perDie.one);
      next.set(successes + 2, (next.get(successes + 2) ?? 0) + probability * perDie.two);
    }
    distribution = next;
  }
  return [...distribution.entries()].sort((left, right) => left[0] - right[0]);
}

function percentile(distribution: Array<[number, number]>, quantile: number): number {
  let cumulative = 0;
  for (const [successes, probability] of distribution) {
    cumulative += probability;
    if (cumulative >= quantile) return successes;
  }
  return distribution[distribution.length - 1]?.[0] ?? 0;
}

async function main() {
  loadLocalEnv();
  const prismaModule = await import("../prisma/client");
  const prismaExport = prismaModule as unknown as {
    prisma?: typeof prismaModule.prisma;
    default?: { prisma?: typeof prismaModule.prisma };
  };
  const prisma = prismaExport.prisma ?? prismaExport.default?.prisma;
  if (!prisma) throw new Error("Prisma client export was not found.");

  try {
    const [powerSet, combatSet, outcomeSet, characterBuilderTuning] = await Promise.all([
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
      prisma.characterBuilderTuning.findUnique({ where: { id: "default" } }),
    ]);

    const powerSnapshot = snapshotFromSet(powerSet, normalizePowerTuningValues);
    const combatSnapshot = snapshotFromSet(combatSet, normalizeCombatTuningFlatValues);
    const outcomeSnapshot = snapshotFromSet(outcomeSet, normalizeOutcomeNormalizationValues);
    if (!powerSnapshot || !combatSnapshot || !outcomeSnapshot) {
      throw new Error("Missing one or more ACTIVE tuning sets; audit intentionally does not seed or mutate tuning.");
    }

    const combatValues = normalizeCombatTuning(combatSnapshot.values);
    const runtimeCalculatorConfig = applyCombatTuningToCalculatorConfig(
      outcomeNormalizationValuesToCalculatorConfig(outcomeSnapshot.values),
      combatValues,
    );

    const direWolf = await prisma.monster.findFirst({
      where: { name: "Dire Wolf", source: "CAMPAIGN", isReadOnly: false },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        naturalAttack: true,
        attacks: { orderBy: { sortOrder: "asc" } },
        traits: { orderBy: { sortOrder: "asc" }, include: { trait: true } },
        powers: { orderBy: { sortOrder: "asc" }, include: POWER_INCLUDE },
      },
    });
    if (!direWolf) throw new Error("Dire Wolf campaign monster not found.");
    if (!direWolf.campaignId) throw new Error("Dire Wolf has no campaignId; audit expects a campaign monster.");
    const campaignId = direWolf.campaignId;
    const typedPowerSnapshot = powerSnapshot as unknown as PowerTuningSnapshot;

    const itemIds = Array.from(
      new Set(
        [
          direWolf.mainHandItemId,
          direWolf.offHandItemId,
          direWolf.smallItemId,
          direWolf.headArmorItemId,
          direWolf.shoulderArmorItemId,
          direWolf.torsoArmorItemId,
          direWolf.legsArmorItemId,
          direWolf.feetArmorItemId,
          direWolf.headItemId,
          direWolf.neckItemId,
          direWolf.armsItemId,
          direWolf.beltItemId,
        ].filter(Boolean) as string[],
      ),
    );
    const itemRows =
      itemIds.length > 0
        ? await prisma.itemTemplate.findMany({
            where: { campaignId, id: { in: itemIds } },
            include: ITEM_TEMPLATE_INCLUDE,
          })
        : [];
    const equipmentById = new Map(itemRows.map((item) => [item.id, itemTemplateToSummoningEquipmentItem(item)]));

    const swipingClawsSource = direWolf.powers.find((power) => power.name === "Swiping Claws");
    if (!swipingClawsSource) throw new Error("Swiping Claws not found on Dire Wolf.");

    const powers = direWolf.powers.map(mapPower);
    const swipingClaws = powers.find((power) => power.name === "Swiping Claws");
    if (!swipingClaws) throw new Error("Swiping Claws failed to map into Power shape.");
    const resolvedPowerCosts = resolvePowerCosts(powers, powerSnapshot, {
      level: direWolf.level,
      tier: direWolf.tier as MonsterTier,
    });
    const swipingCost = resolvedPowerCosts.powers.find((power) => power.name === "Swiping Claws");
    if (!swipingCost) throw new Error("Swiping Claws cost row not found.");

    const powerContribution: CanonicalPowerContribution = {
      axisVector: resolvedPowerCosts.totals.axisVector,
      basePowerValue: resolvedPowerCosts.totals.basePowerValue,
      powerCount: resolvedPowerCosts.powers.length,
      powers: resolvedPowerCosts.powers.map((power) => ({
        id: power.powerId ?? null,
        name: power.name,
        axisVector: power.breakdown.axisVector,
        basePowerValue: power.breakdown.basePowerValue,
        derivedCooldownTurns: power.derivedCooldownTurns,
        derivedCooldownLoad: power.derivedCooldown.cooldownLoad,
        cooldownTurns: power.cooldownTurns,
        cooldownReduction: power.cooldownReduction,
      })),
      debug: resolvedPowerCosts,
    };
    const outcome = computeMonsterOutcomes(direWolf as unknown as Parameters<typeof computeMonsterOutcomes>[0], runtimeCalculatorConfig, {
      protectionTuning: combatValues,
      powerContribution,
    });

    const combatActor = adaptMonsterToCombatLabActor(direWolf, equipmentById, combatValues, typedPowerSnapshot).actor;
    const combatSwiping = combatActor.actions.find((action) => action.name === "Swiping Claws");

    const sameCampaignCharacters = await prisma.campaignCharacter.findMany({
      where: {
        campaignId,
        archivedAt: null,
        name: { in: ["CL-L3-Tank", "CL-L3-Support"] },
      },
      include: {
        backpackItems: {
          include: {
            partyInventoryItem: {
              include: {
                itemTemplate: { include: ITEM_TEMPLATE_INCLUDE },
              },
            },
          },
        },
      },
    });
    const adaptedCharacters = sameCampaignCharacters.map((character) =>
      adaptCampaignCharacterToCombatActor(character, combatValues, typedPowerSnapshot),
    );

    const packet = swipingClaws.effectPackets[0];
    const details = asRecord(packet?.detailsJson);
    const diceCount = Number(packet?.diceCount ?? swipingClaws.diceCount ?? 0);
    const sides = dieSides(direWolf.attackDie);
    const successDistribution = totalSuccessDistribution(diceCount, sides);
    const expectedSuccesses = diceCount * (perDieSuccessDistribution(sides).one + 2 * perDieSuccessDistribution(sides).two);
    const sourceWoundsPerSuccess = Number(details.woundsPerSuccess ?? packet?.potency ?? swipingClaws.potency ?? 0);
    const combatLabWoundsPerSuccess = Number(
      combatSwiping?.effectPerPrimarySuccess ?? combatSwiping?.potency ?? sourceWoundsPerSuccess,
    );
    const p50 = percentile(successDistribution, 0.5);
    const p75 = percentile(successDistribution, 0.75);
    const p90 = percentile(successDistribution, 0.9);
    const p95 = percentile(successDistribution, 0.95);
    const maxSuccesses = Math.max(...successDistribution.map(([successes]) => successes));
    const tickCount = Math.max(1, Number(packet?.effectDurationTurns ?? 1));
    const firstTickBeforeCleanup =
      combatSwiping?.damageApplicationTiming === "startOfTurn" && packet?.effectDurationType === "TURNS";

    const debug = outcome.debug ?? {};
    const powerDebug = asRecord(debug.powerContribution);
    const normalizationDebug = asRecord(asRecord(debug.normalizationBreakdown));
    const swipingCostDebug = asRecord(swipingCost.breakdown.debug);
    const runtimeOngoingDebug = asRecord(swipingCostDebug.runtimeOngoingDamageBreakdown);
    const runtimeOngoingPacketDebug = (
      (runtimeOngoingDebug.packetDebug as Array<Record<string, unknown>> | undefined) ?? []
    ).find((entry) => Number(entry.packetIndex ?? 0) === Number(packet?.packetIndex ?? 0));
    const packetMagnitudeDebug = asRecord(swipingCost.breakdown.packetCosts[0]?.debug).magnitude;

    const report = {
      audit: {
        generatedAt: new Date().toISOString(),
        command: "npx --yes tsx scripts/direWolfSwipingClawsOutcomeAudit.ts",
        mode: "read-only; no tuning values saved or mutated",
      },
      activeTuningSourceTruth: {
        powerTuning: {
          setId: powerSnapshot.setId,
          name: powerSnapshot.name,
          status: powerSnapshot.status,
          source: powerSnapshot.source,
          updatedAt: powerSnapshot.updatedAt,
        },
        combatTuning: {
          setId: combatSnapshot.setId,
          name: combatSnapshot.name,
          status: combatSnapshot.status,
          source: combatSnapshot.source,
          updatedAt: combatSnapshot.updatedAt,
        },
        outcomeNormalization: {
          setId: outcomeSnapshot.setId,
          name: outcomeSnapshot.name,
          status: outcomeSnapshot.status,
          source: outcomeSnapshot.source,
          updatedAt: outcomeSnapshot.updatedAt,
        },
        characterBuilderTuning: characterBuilderTuning
          ? {
              source: "live-db-row",
              playerPowerSpendScalar: normalizeCharacterPowerSpendScalar(characterBuilderTuning.playerPowerSpendScalar),
              updatedAt: characterBuilderTuning.updatedAt.toISOString(),
            }
          : {
              source: "fallback-default-no-db-row",
              playerPowerSpendScalar: DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
              updatedAt: null,
            },
      },
      direWolfSource: {
        id: direWolf.id,
        campaignId: direWolf.campaignId,
        name: direWolf.name,
        level: direWolf.level,
        tier: direWolf.tier,
        calculatorArchetype: direWolf.calculatorArchetype,
        pools: {
          physicalResilienceMax: direWolf.physicalResilienceMax,
          mentalPerseveranceMax: direWolf.mentalPerseveranceMax,
        },
        attackAndDefence: {
          attackDie: direWolf.attackDie,
          attackModifier: direWolf.attackModifier,
          weaponSkillValue: direWolf.weaponSkillValue,
          weaponSkillModifier: direWolf.weaponSkillModifier,
          guardDie: direWolf.guardDie,
          armorSkillValue: direWolf.armorSkillValue,
          armorSkillModifier: direWolf.armorSkillModifier,
          physicalProtection: direWolf.physicalProtection,
          naturalPhysicalProtection: direWolf.naturalPhysicalProtection,
          mentalProtection: direWolf.mentalProtection,
          naturalMentalProtection: direWolf.naturalMentalProtection,
        },
        selectedPowers: direWolf.powers.map((power) => ({
          id: power.id,
          name: power.name,
          counterMode: power.counterMode,
          cooldownTurns: power.cooldownTurns,
          cooldownReduction: power.cooldownReduction,
        })),
      },
      swipingClaws: {
        source: {
          id: swipingClawsSource.id,
          name: swipingClawsSource.name,
          descriptorChassis: swipingClawsSource.descriptorChassis,
          counterMode: swipingClawsSource.counterMode,
          cooldownTurns: swipingClawsSource.cooldownTurns,
          cooldownReduction: swipingClawsSource.cooldownReduction,
          rangeCategories: swipingClawsSource.rangeCategories,
          primaryDefenceGate: swipingClawsSource.primaryDefenceGate,
          effectPackets: swipingClawsSource.effectPackets.map((effectPacket) => ({
            id: effectPacket.id,
            packetIndex: effectPacket.packetIndex,
            intention: effectPacket.intention,
            diceCount: effectPacket.diceCount,
            potency: effectPacket.potency,
            effectTimingType: effectPacket.effectTimingType,
            effectDurationType: effectPacket.effectDurationType,
            effectDurationTurns: effectPacket.effectDurationTurns,
            dealsWounds: effectPacket.dealsWounds,
            woundChannel: effectPacket.woundChannel,
            applyTo: effectPacket.applyTo,
            detailsJson: effectPacket.detailsJson,
          })),
        },
        powerCostResolver: {
          basePowerValue: swipingCost.breakdown.basePowerValue,
          runtimeOngoingDamageCost: swipingCost.breakdown.runtimeOngoingDamageCost,
          derivedCooldownTurns: swipingCost.derivedCooldownTurns,
          derivedCooldownLoad: round(swipingCost.derivedCooldown.cooldownLoad, 4),
          canonicalAxisVector: roundedAxes(swipingCost.breakdown.axisVector),
          packetCosts: swipingCost.breakdown.packetCosts,
          attackWoundsValuation: packetMagnitudeDebug,
          runtimeEquivalentOngoingDamage: runtimeOngoingPacketDebug ?? null,
          debug: swipingCost.breakdown.debug,
        },
        combatLabHydratedAction: combatSwiping
          ? {
              id: combatSwiping.id,
              kind: combatSwiping.kind,
              pool: combatSwiping.pool,
              diceCount: combatSwiping.diceCount,
              potency: combatSwiping.potency,
              effectPerPrimarySuccess: combatSwiping.effectPerPrimarySuccess,
              cooldownRounds: combatSwiping.cooldownRounds,
              recurring: combatSwiping.recurring,
              damageApplicationTiming: combatSwiping.damageApplicationTiming,
              durationKind: combatSwiping.durationKind,
              rangeCategory: combatSwiping.rangeCategory,
              targetPolicy: combatSwiping.targetPolicy,
              supported: combatSwiping.supported,
              unsupportedReasons: combatSwiping.unsupportedReasons,
            }
          : null,
      },
      tableFacingExpectation: {
        rollAttribute: combatSwiping?.accuracyAttribute ?? "Attack",
        dieSize: direWolf.attackDie,
        diceCount,
        perDieSuccessDistribution: perDieSuccessDistribution(sides),
        expectedSuccesses: round(expectedSuccesses, 4),
        percentileSuccesses: { p50, p75, p90, p95, max: maxSuccesses },
        sourceResolverWoundsPerSuccess: sourceWoundsPerSuccess,
        combatLabHydratedWoundsPerSuccess: combatLabWoundsPerSuccess,
        resolverEffectiveWoundsPerSuccess:
          Number(asRecord(runtimeOngoingPacketDebug).effectiveWoundsPerSuccess) ||
          Number(asRecord(packetMagnitudeDebug).effectiveTableFacingWoundsPerSuccess) ||
          null,
        woundsPerSuccessMismatch:
          sourceWoundsPerSuccess !== combatLabWoundsPerSuccess
            ? "Authored source potency differs from table-facing effectiveAttackWoundsPerSuccess; resolver diagnostics should now price the table-facing value."
            : null,
        woundsPerTickBeforeMitigationUsingCombatLabValue: {
          expected: round(expectedSuccesses * combatLabWoundsPerSuccess, 2),
          p50: p50 * combatLabWoundsPerSuccess,
          p75: p75 * combatLabWoundsPerSuccess,
          p90: p90 * combatLabWoundsPerSuccess,
          p95: p95 * combatLabWoundsPerSuccess,
          max: maxSuccesses * combatLabWoundsPerSuccess,
        },
        woundsPerTickBeforeMitigationUsingSourceResolverValue: {
          expected: round(expectedSuccesses * sourceWoundsPerSuccess, 2),
          p50: p50 * sourceWoundsPerSuccess,
          p75: p75 * sourceWoundsPerSuccess,
          p90: p90 * sourceWoundsPerSuccess,
          p95: p95 * sourceWoundsPerSuccess,
          max: maxSuccesses * sourceWoundsPerSuccess,
        },
        tickCount,
        cooldown: {
          stored: swipingClaws.cooldownTurns,
          derived: swipingCost.derivedCooldownTurns,
          combatLabHydrated: combatSwiping?.cooldownRounds ?? null,
        },
        totalBeforeMitigationAcrossTicks: {
          expected: round(expectedSuccesses * combatLabWoundsPerSuccess * tickCount, 2),
          p75: p75 * combatLabWoundsPerSuccess * tickCount,
          p90: p90 * combatLabWoundsPerSuccess * tickCount,
          p95: p95 * combatLabWoundsPerSuccess * tickCount,
          max: maxSuccesses * combatLabWoundsPerSuccess * tickCount,
        },
        firstTickBeforeCleanup,
        cleanupActionTax: firstTickBeforeCleanup
          ? "If the target survives the start-of-turn tick, cleanup costs its Main Action; Power Action remains available."
          : "No start-of-turn pre-cleanup tick detected.",
        sameCampaignCharacterFirstTickRisk: adaptedCharacters.map((entry) => ({
          id: entry.actor.id,
          name: entry.actor.name,
          physicalHpMax: entry.actor.physicalHpMax,
          expectedTickKillsBeforeMitigation: expectedSuccesses * combatLabWoundsPerSuccess >= entry.actor.physicalHpMax,
          p75TickKillsBeforeMitigation: p75 * combatLabWoundsPerSuccess >= entry.actor.physicalHpMax,
          p90TickKillsBeforeMitigation: p90 * combatLabWoundsPerSuccess >= entry.actor.physicalHpMax,
          p95TickKillsBeforeMitigation: p95 * combatLabWoundsPerSuccess >= entry.actor.physicalHpMax,
          maxTickKillsBeforeMitigation: maxSuccesses * combatLabWoundsPerSuccess >= entry.actor.physicalHpMax,
        })),
      },
      outcomeCalculator: {
        totalBasePowerValue: resolvedPowerCosts.totals.basePowerValue,
        canonicalPowerAxisVector: roundedAxes(resolvedPowerCosts.totals.axisVector),
        effectivePowerAxisVector: roundedAxes(powerDebug.effectivePowerAxisVector as Partial<RadarAxes>),
        swipingClawsEffectivePowerRow: (powerDebug.perPowerAvailability as Array<Record<string, unknown>> | undefined)?.find(
          (row) => row.name === "Swiping Claws",
        ),
        nonPowerContribution: roundedAxes(asRecord(asRecord(debug.nonPowerContribution).axisVector) as Partial<RadarAxes>),
        finalPreNormalizationAxes: roundedAxes(asRecord(debug.finalPreNormalizationAxes) as Partial<RadarAxes>),
        finalNormalizedRadarAxes: roundedAxes(outcome.radarAxes),
        normalization: {
          level: normalizationDebug.level,
          tierKey: normalizationDebug.tierKey,
          tierMultiplier: normalizationDebug.tierMultiplier,
          displayCurvePoints: normalizationDebug.displayCurvePoints,
          rawAxisBudgetTargets: normalizationDebug.rawAxisBudgetTargets,
        },
      },
      auditDiagnosis: {
        mismatchLocation: [
          "Source authoring stores Swiping Claws as ON_CAST + TURNS with potency 4, while Combat Lab/render semantics hydrate it as start-of-turn ongoing damage with 8 wounds per success.",
          "Power Tuning attack magnitude should now use the same table-facing effectiveAttackWoundsPerSuccess value surfaced by render/Combat Lab.",
          "Runtime-equivalent ongoing damage diagnostics should now fire for ATTACK + ON_CAST + TURNS packets.",
          "Power Tuning now exposes first-tick-before-cleanup danger and cleanup action tax seams.",
          "Outcome Calculator uses the canonical/effective power axis vector and level/tier normalization; it does not simulate stored DoT spike percentiles.",
          "Combat Tuning and Character Builder Tuning are not the primary Swiping Claws valuation layer.",
        ],
        recommendation:
          "Do not tune values yet. First compare this resolver-side diagnostic against the live Combat Lab transcript and only then tune the new Power Tuning seams if the resulting pressure is too high or too low.",
      },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
