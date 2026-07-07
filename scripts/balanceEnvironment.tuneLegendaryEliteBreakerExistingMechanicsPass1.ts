import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const BREAKER_VARIANT_NAME = "BALANCE_Legendary Elite Breaker Debuffer";
const LEVEL = 3;

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type PrismaClient = typeof import("../prisma/client")["prisma"];

const BREAKER_DEBUFFER_SPEC = {
  name: BREAKER_VARIANT_NAME,
  roleIntent:
    "Existing-mechanics anti-tank Legendary Elite 1v1 duel benchmark. Tests Guard debuff plus physical pressure without new anti-tank mechanics.",
  physicalHp: 30,
  mentalHp: 26,
  physicalProtection: 1,
  mentalProtection: 1,
  attackDie: "D8" as DiceSize,
  guardDie: "D8" as DiceSize,
  fortitudeDie: "D8" as DiceSize,
  intellectDie: "D6" as DiceSize,
  synergyDie: "D6" as DiceSize,
  braveryDie: "D6" as DiceSize,
  weaponSkillValue: 5,
  armorSkillValue: 2,
  calculatorArchetype: "STRIKER",
  attack: {
    name: "BALANCE_Legendary Elite Breaker Debuffer Role Strike",
    rawStrength: 2,
    displayedWoundsPerSuccess: 4,
    damageType: { name: "Crushing", mode: "PHYSICAL" as const },
  },
  debuff: {
    name: "BALANCE_Legendary Elite Breaker Debuffer Guard Debuff",
    diceCount: 4,
    potency: 2,
    cooldownTurns: 2,
    durationTurns: 2,
    targetAttribute: "GUARD" as const,
  },
} as const;

const SELECT_FIELDS = {
  id: true,
  name: true,
  level: true,
  tier: true,
  legendary: true,
  source: true,
  isReadOnly: true,
  campaignId: true,
  calculatorArchetype: true,
  physicalResilienceCurrent: true,
  physicalResilienceMax: true,
  mentalPerseveranceCurrent: true,
  mentalPerseveranceMax: true,
  physicalProtection: true,
  mentalProtection: true,
  naturalPhysicalProtection: true,
  naturalMentalProtection: true,
  attackMode: true,
  attackDie: true,
  attackModifier: true,
  guardDie: true,
  guardModifier: true,
  fortitudeDie: true,
  fortitudeModifier: true,
  intellectDie: true,
  intellectModifier: true,
  synergyDie: true,
  synergyModifier: true,
  braveryDie: true,
  braveryModifier: true,
  weaponSkillValue: true,
  weaponSkillModifier: true,
  armorSkillValue: true,
  armorSkillModifier: true,
  naturalAttack: {
    select: {
      attackName: true,
      attackConfig: true,
    },
  },
  attacks: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      sortOrder: true,
      attackMode: true,
      attackName: true,
      attackConfig: true,
    },
  },
  powers: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      sortOrder: true,
      name: true,
      status: true,
      cooldownTurns: true,
      rangeCategories: { select: { rangeCategory: true } },
      primaryDefenceGate: true,
      effectPackets: {
        orderBy: { packetIndex: "asc" as const },
        select: {
          packetIndex: true,
          hostility: true,
          intention: true,
          diceCount: true,
          potency: true,
          effectTimingType: true,
          effectDurationType: true,
          effectDurationTurns: true,
          targetedAttribute: true,
          applyTo: true,
          detailsJson: true,
        },
      },
    },
  },
  tags: {
    orderBy: { tag: "asc" as const },
    select: { tag: true },
  },
  customNotes: true,
} as const;

function attackConfig(): Prisma.InputJsonObject {
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: BREAKER_DEBUFFER_SPEC.attack.rawStrength,
      mentalStrength: 0,
      damageTypes: [BREAKER_DEBUFFER_SPEC.attack.damageType],
      attackEffects: [],
    },
  };
}

function customNotes() {
  return [
    "BALANCE_STATUS: Level 3 Legendary Elite existing-mechanics anti-tank duel benchmark asset",
    "BALANCE_SOURCE: Balance Environment Legendary Elite anti-tank existing-mechanics test",
    "BALANCE_PHASE: BAL-EXISTING-MECHANICS-ANTITANK-001",
    `BALANCE_ROLE_INTENT: ${BREAKER_DEBUFFER_SPEC.roleIntent}`,
    "BALANCE_MECHANIC_NOTE: Uses only supported Combat Lab mechanics: natural physical pressure plus a hostile Guard-targeting Debuff power with a Guard Resist gate.",
    "BALANCE_RESTRICTION_NOTE: Does not introduce or rely on Pierce, Guard Break, Sunder, Crush, Expose, Overwhelm, True Strike, minimum damage, or ignore-defence mechanics.",
    "BALANCE_LEGENDARY_INTENT: Legendary is a modifier on ELITE tier here; this is not a normal Boss or final lore monster.",
    "BALANCE_NOTES: Named test asset only; used for 1v1 duel pressure evidence.",
  ].join("\n");
}

function monsterData(): Prisma.MonsterUncheckedCreateInput {
  return {
    name: BREAKER_DEBUFFER_SPEC.name,
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: LEVEL,
    tier: "ELITE",
    legendary: true,
    calculatorArchetype: BREAKER_DEBUFFER_SPEC.calculatorArchetype,
    source: "CAMPAIGN",
    isReadOnly: false,
    campaignId: BALANCE_CAMPAIGN_ID,
    attackMode: "NATURAL_WEAPON",
    equippedWeaponId: null,
    mainHandItemId: null,
    offHandItemId: null,
    smallItemId: null,
    headArmorItemId: null,
    shoulderArmorItemId: null,
    torsoArmorItemId: null,
    legsArmorItemId: null,
    feetArmorItemId: null,
    headItemId: null,
    neckItemId: null,
    armsItemId: null,
    beltItemId: null,
    customNotes: customNotes(),
    limitBreakName: null,
    limitBreakTier: null,
    limitBreakTriggerText: null,
    limitBreakAttribute: null,
    limitBreakThresholdSuccesses: null,
    limitBreakCostText: null,
    limitBreakEffectText: null,
    limitBreak2Name: null,
    limitBreak2Tier: null,
    limitBreak2TriggerText: null,
    limitBreak2Attribute: null,
    limitBreak2ThresholdSuccesses: null,
    limitBreak2CostText: null,
    limitBreak2EffectText: null,
    physicalResilienceCurrent: BREAKER_DEBUFFER_SPEC.physicalHp,
    physicalResilienceMax: BREAKER_DEBUFFER_SPEC.physicalHp,
    mentalPerseveranceCurrent: BREAKER_DEBUFFER_SPEC.mentalHp,
    mentalPerseveranceMax: BREAKER_DEBUFFER_SPEC.mentalHp,
    physicalProtection: BREAKER_DEBUFFER_SPEC.physicalProtection,
    mentalProtection: BREAKER_DEBUFFER_SPEC.mentalProtection,
    naturalPhysicalProtection: BREAKER_DEBUFFER_SPEC.physicalProtection,
    naturalMentalProtection: BREAKER_DEBUFFER_SPEC.mentalProtection,
    attackDie: BREAKER_DEBUFFER_SPEC.attackDie,
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: BREAKER_DEBUFFER_SPEC.guardDie,
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: BREAKER_DEBUFFER_SPEC.fortitudeDie,
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: BREAKER_DEBUFFER_SPEC.intellectDie,
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: BREAKER_DEBUFFER_SPEC.synergyDie,
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: BREAKER_DEBUFFER_SPEC.braveryDie,
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: BREAKER_DEBUFFER_SPEC.weaponSkillValue,
    weaponSkillModifier: 0,
    armorSkillValue: BREAKER_DEBUFFER_SPEC.armorSkillValue,
    armorSkillModifier: 0,
  };
}

async function findVariant(prisma: PrismaClient) {
  return prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name: BREAKER_VARIANT_NAME },
    select: SELECT_FIELDS,
  });
}

function summarize(row: Awaited<ReturnType<typeof findVariant>>) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    tier: row.tier,
    legendary: row.legendary,
    source: row.source,
    isReadOnly: row.isReadOnly,
    campaignId: row.campaignId,
    calculatorArchetype: row.calculatorArchetype,
    hp: {
      physical: `${row.physicalResilienceCurrent}/${row.physicalResilienceMax}`,
      mental: `${row.mentalPerseveranceCurrent}/${row.mentalPerseveranceMax}`,
    },
    protection: {
      physical: row.physicalProtection,
      mental: row.mentalProtection,
      naturalPhysical: row.naturalPhysicalProtection,
      naturalMental: row.naturalMentalProtection,
    },
    attributes: {
      attack: row.attackDie,
      guard: row.guardDie,
      fortitude: row.fortitudeDie,
      intellect: row.intellectDie,
      synergy: row.synergyDie,
      bravery: row.braveryDie,
    },
    diceCounts: {
      weaponSkillValue: row.weaponSkillValue,
      armorSkillValue: row.armorSkillValue,
    },
    naturalAttack: row.naturalAttack,
    attacks: row.attacks,
    powers: row.powers,
    tags: row.tags.map((tag) => tag.tag),
    customNotes: row.customNotes,
  };
}

async function assertNoProtectedOrDuplicateRows(prisma: PrismaClient) {
  const matches = await prisma.monster.findMany({
    where: { campaignId: BALANCE_CAMPAIGN_ID, name: BREAKER_VARIANT_NAME },
    select: { id: true, name: true, source: true, isReadOnly: true, campaignId: true, tier: true, legendary: true },
  });
  if (matches.length > 1) {
    throw new Error(`Refusing ${BREAKER_VARIANT_NAME}: found ${matches.length} matching Balance Environment rows.`);
  }
  const existing = matches[0] ?? null;
  if (!existing) return null;
  if (
    existing.source !== "CAMPAIGN" ||
    existing.isReadOnly ||
    existing.campaignId !== BALANCE_CAMPAIGN_ID ||
    existing.tier !== "ELITE" ||
    !existing.legendary
  ) {
    throw new Error(`Refusing ${BREAKER_VARIANT_NAME}: existing row is protected, out of scope, non-ELITE, or non-Legendary.`);
  }
  return existing;
}

async function ensureDebufferPower(tx: Prisma.TransactionClient, monsterId: string) {
  const debuff = BREAKER_DEBUFFER_SPEC.debuff;
  await tx.power.create({
    data: {
      monster: { connect: { id: monsterId } },
      sourceType: "MONSTER_POWER",
      sortOrder: 0,
      name: debuff.name,
      description:
        "Existing-mechanics Guard debuff test power. Rolls Attack, is resisted by Guard, and applies a temporary Guard penalty when successful.",
      schemaVersion: 1,
      rulesVersion: "v1",
      contentRevision: 1,
      previewRendererVersion: 1,
      status: "ACTIVE",
      descriptorChassis: "IMMEDIATE",
      descriptorChassisConfig: {},
      counterMode: "NO",
      commitmentModifier: "STANDARD",
      cooldownTurns: debuff.cooldownTurns,
      cooldownReduction: 0,
      lifespanType: "NONE",
      meleeTargets: 1,
      rangeCategories: {
        create: [{ rangeCategory: "MELEE" }],
      },
      primaryDefenceGate: {
        create: {
          sourcePacketIndex: 0,
          gateResult: "RESIST",
          protectionChannel: null,
          resistAttribute: debuff.targetAttribute,
          hostileEntryPattern: null,
          resolutionSource: "EXPLICIT",
        },
      },
      effectPackets: {
        create: [
          {
            packetIndex: 0,
            hostility: "HOSTILE",
            intention: "DEBUFF",
            specific: "Guard",
            diceCount: debuff.diceCount,
            potency: debuff.potency,
            effectTimingType: "ON_CAST",
            effectTimingTurns: null,
            effectDurationType: "TURNS",
            effectDurationTurns: debuff.durationTurns,
            dealsWounds: false,
            woundChannel: null,
            targetedAttribute: debuff.targetAttribute,
            applicationModeKey: null,
            resolutionOrigin: "CASTER",
            applyTo: "PRIMARY_TARGET",
            secondaryDependencyMode: null,
            triggerConditionText: null,
            detailsJson: {
              rangeCategory: "MELEE",
              statTarget: debuff.targetAttribute,
              applyTo: "PRIMARY_TARGET",
              theme: "existing-mechanics anti-tank Guard debuff",
            },
          },
        ],
      },
      tags: {
        create: [{ tag: "BALANCE" }, { tag: "ANTI_TANK_EXISTING_MECHANICS" }],
      },
    },
  });
}

async function main() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../prisma/client");
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: BALANCE_CAMPAIGN_ID },
      select: { id: true, name: true },
    });
    if (!campaign) throw new Error(`Campaign ${BALANCE_CAMPAIGN_ID} was not found.`);
    if (campaign.name !== BALANCE_CAMPAIGN_NAME) {
      throw new Error(`Campaign name mismatch: expected ${BALANCE_CAMPAIGN_NAME}, found ${campaign.name}.`);
    }

    const existing = await assertNoProtectedOrDuplicateRows(prisma);
    const before = await findVariant(prisma);
    const config = attackConfig();
    const result = await prisma.$transaction(async (tx) => {
      const monster = existing
        ? await tx.monster.update({ where: { id: existing.id }, data: monsterData() })
        : await tx.monster.create({ data: monsterData() });

      await tx.monsterTag.deleteMany({ where: { monsterId: monster.id } });
      await tx.monsterTag.createMany({
        data: ["BALANCE", "LEGENDARY_ELITE_DUEL_BASELINE", "ANTI_TANK_EXISTING_MECHANICS"].map((tag) => ({ monsterId: monster.id, tag })),
        skipDuplicates: true,
      });
      await tx.monsterTrait.deleteMany({ where: { monsterId: monster.id } });
      await tx.power.deleteMany({ where: { monsterId: monster.id } });
      await tx.monsterAttack.deleteMany({ where: { monsterId: monster.id } });
      await tx.monsterAttack.create({
        data: {
          monsterId: monster.id,
          sortOrder: 0,
          attackMode: "NATURAL",
          attackName: BREAKER_DEBUFFER_SPEC.attack.name,
          attackConfig: config,
          equippedWeaponId: null,
        },
      });
      await tx.monsterNaturalAttack.upsert({
        where: { monsterId: monster.id },
        create: {
          monsterId: monster.id,
          attackName: BREAKER_DEBUFFER_SPEC.attack.name,
          attackConfig: config,
        },
        update: {
          attackName: BREAKER_DEBUFFER_SPEC.attack.name,
          attackConfig: config,
        },
      });
      await ensureDebufferPower(tx, monster.id);

      return monster;
    });

    const after = await findVariant(prisma);
    console.log("Balance Environment Legendary Elite existing-mechanics anti-tank variant ensured.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log(`asset: ${BREAKER_VARIANT_NAME}`);
    console.log("DB mutation: scoped upsert for BALANCE_Legendary Elite Breaker Debuffer only.");
    console.log("Existing mechanics only: natural physical pressure plus hostile Guard Debuff power with explicit Guard Resist gate.");
    console.log("No Pierce, Guard Break, Sunder, Crush, Expose, Overwhelm, True Strike, minimum damage, or ignore-defence mechanic was introduced.");
    console.log("No Duelist, Hexer, Stoneguard, Hawkshot, Ranger, Arcane Sage, Dragon/Lich, Minion/Soldier/Elite/Boss role, calibration, runtime, formula, scalar, tuning, UI, or docs values were changed by this script.");
    console.log(JSON.stringify({
      name: BREAKER_VARIANT_NAME,
      id: result.id,
      operation: before ? "updated" : "created",
      roleIntent: BREAKER_DEBUFFER_SPEC.roleIntent,
      authoredOffence: {
        attackName: BREAKER_DEBUFFER_SPEC.attack.name,
        dice: `${BREAKER_DEBUFFER_SPEC.weaponSkillValue}x${BREAKER_DEBUFFER_SPEC.attackDie}`,
        displayedWoundsPerSuccess: BREAKER_DEBUFFER_SPEC.attack.displayedWoundsPerSuccess,
        rawStrength: BREAKER_DEBUFFER_SPEC.attack.rawStrength,
        channel: BREAKER_DEBUFFER_SPEC.attack.damageType.mode.toLowerCase(),
        cooldown: 0,
      },
      debuff: {
        name: BREAKER_DEBUFFER_SPEC.debuff.name,
        dice: `${BREAKER_DEBUFFER_SPEC.debuff.diceCount}x${BREAKER_DEBUFFER_SPEC.attackDie}`,
        resistedBy: BREAKER_DEBUFFER_SPEC.debuff.targetAttribute,
        modifier: `-${BREAKER_DEBUFFER_SPEC.debuff.potency} Guard`,
        durationTurns: BREAKER_DEBUFFER_SPEC.debuff.durationTurns,
        cooldownTurns: BREAKER_DEBUFFER_SPEC.debuff.cooldownTurns,
      },
      before: summarize(before),
      after: summarize(after),
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
