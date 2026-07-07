import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const BREAKER_NAME = "BALANCE_Legendary Elite Breaker";
const LEVEL = 3;

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type PrismaClient = typeof import("../prisma/client")["prisma"];

const BREAKER_SPEC = {
  name: BREAKER_NAME,
  roleIntent: "Anti-tank / guard-break Legendary Elite 1v1 duel benchmark. Tests high physical-defence targets without changing the ordinary Duelist.",
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
    name: "BALANCE_Legendary Elite Breaker Role Guard-Break",
    rawStrength: 2,
    displayedWoundsPerSuccess: 4,
    damageType: { name: "Crushing", mode: "PHYSICAL" as const },
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
      physicalStrength: BREAKER_SPEC.attack.rawStrength,
      mentalStrength: 0,
      damageTypes: [BREAKER_SPEC.attack.damageType],
      attackEffects: [],
    },
  };
}

function customNotes() {
  return [
    "BALANCE_STATUS: Level 3 Legendary Elite anti-tank duel benchmark asset",
    "BALANCE_SOURCE: Balance Environment Legendary Elite anti-tank benchmark",
    "BALANCE_PHASE: BAL-LEGENDARY-ELITE-ANTITANK-001",
    `BALANCE_ROLE_INTENT: ${BREAKER_SPEC.roleIntent}`,
    "BALANCE_MECHANIC_NOTE: Current Combat Lab natural attacks have no supported pierce/guard-break flag; this asset approximates anti-tank pressure through supported dice/W/S shape.",
    "BALANCE_LEGENDARY_INTENT: Legendary is a modifier on ELITE tier here; this is not a normal Boss or final lore monster.",
    "BALANCE_NOTES: Named test asset only; used for 1v1 duel pressure evidence.",
  ].join("\n");
}

function monsterData(): Prisma.MonsterUncheckedCreateInput {
  return {
    name: BREAKER_SPEC.name,
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: LEVEL,
    tier: "ELITE",
    legendary: true,
    calculatorArchetype: BREAKER_SPEC.calculatorArchetype,
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
    physicalResilienceCurrent: BREAKER_SPEC.physicalHp,
    physicalResilienceMax: BREAKER_SPEC.physicalHp,
    mentalPerseveranceCurrent: BREAKER_SPEC.mentalHp,
    mentalPerseveranceMax: BREAKER_SPEC.mentalHp,
    physicalProtection: BREAKER_SPEC.physicalProtection,
    mentalProtection: BREAKER_SPEC.mentalProtection,
    naturalPhysicalProtection: BREAKER_SPEC.physicalProtection,
    naturalMentalProtection: BREAKER_SPEC.mentalProtection,
    attackDie: BREAKER_SPEC.attackDie,
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: BREAKER_SPEC.guardDie,
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: BREAKER_SPEC.fortitudeDie,
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: BREAKER_SPEC.intellectDie,
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: BREAKER_SPEC.synergyDie,
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: BREAKER_SPEC.braveryDie,
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: BREAKER_SPEC.weaponSkillValue,
    weaponSkillModifier: 0,
    armorSkillValue: BREAKER_SPEC.armorSkillValue,
    armorSkillModifier: 0,
  };
}

async function findBreaker(prisma: PrismaClient) {
  return prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name: BREAKER_NAME },
    select: SELECT_FIELDS,
  });
}

function summarize(row: Awaited<ReturnType<typeof findBreaker>>) {
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
    tags: row.tags.map((tag) => tag.tag),
    customNotes: row.customNotes,
  };
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

    const matches = await prisma.monster.findMany({
      where: { campaignId: BALANCE_CAMPAIGN_ID, name: BREAKER_NAME },
      select: { id: true, source: true, isReadOnly: true, campaignId: true, tier: true, legendary: true },
    });
    if (matches.length > 1) {
      throw new Error(`Refusing ${BREAKER_NAME}: found ${matches.length} matching Balance Environment rows.`);
    }
    const existing = matches[0] ?? null;
    if (existing && (existing.source !== "CAMPAIGN" || existing.isReadOnly || existing.campaignId !== BALANCE_CAMPAIGN_ID)) {
      throw new Error(`Refusing ${BREAKER_NAME}: existing row is protected or out of scope.`);
    }

    const before = await findBreaker(prisma);
    const config = attackConfig();
    const result = await prisma.$transaction(async (tx) => {
      const monster = existing
        ? await tx.monster.update({ where: { id: existing.id }, data: monsterData() })
        : await tx.monster.create({ data: monsterData() });

      await tx.monsterTag.deleteMany({ where: { monsterId: monster.id } });
      await tx.monsterTag.createMany({
        data: ["BALANCE", "LEGENDARY_ELITE_DUEL_BASELINE", "ANTI_TANK_BENCHMARK"].map((tag) => ({ monsterId: monster.id, tag })),
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
          attackName: BREAKER_SPEC.attack.name,
          attackConfig: config,
          equippedWeaponId: null,
        },
      });
      await tx.monsterNaturalAttack.upsert({
        where: { monsterId: monster.id },
        create: {
          monsterId: monster.id,
          attackName: BREAKER_SPEC.attack.name,
          attackConfig: config,
        },
        update: {
          attackName: BREAKER_SPEC.attack.name,
          attackConfig: config,
        },
      });

      return monster;
    });

    const after = await findBreaker(prisma);
    console.log("Balance Environment Legendary Elite anti-tank benchmark ensured.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log(`asset: ${BREAKER_NAME}`);
    console.log("DB mutation: scoped upsert for BALANCE_Legendary Elite Breaker only.");
    console.log("Current schema/runtime anti-tank note: no supported natural-attack pierce/guard-break flag was found; Breaker uses supported dice/W/S shape only.");
    console.log("No Duelist, Hexer, Dragon/Lich, player, Soldier, normal Elite, normal Boss, Minion, calibration, runtime, formula, scalar, tuning, UI, or docs values were changed by this script.");
    console.log(JSON.stringify({
      name: BREAKER_NAME,
      id: result.id,
      operation: before ? "updated" : "created",
      roleIntent: BREAKER_SPEC.roleIntent,
      authoredOffence: {
        attackName: BREAKER_SPEC.attack.name,
        dice: `${BREAKER_SPEC.weaponSkillValue}x${BREAKER_SPEC.attackDie}`,
        displayedWoundsPerSuccess: BREAKER_SPEC.attack.displayedWoundsPerSuccess,
        rawStrength: BREAKER_SPEC.attack.rawStrength,
        channel: BREAKER_SPEC.attack.damageType.mode.toLowerCase(),
        cooldown: 0,
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
