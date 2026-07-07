import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type PrismaClient = typeof import("../prisma/client")["prisma"];

type LegendaryEliteName = "BALANCE_Legendary Elite Duelist" | "BALANCE_Legendary Elite Hexer";
type DamageMode = "PHYSICAL" | "MENTAL";

type LegendaryEliteSpec = {
  name: LegendaryEliteName;
  roleIntent: string;
  physicalHp: number;
  mentalHp: number;
  physicalProtection: number;
  mentalProtection: number;
  attackDie: DiceSize;
  guardDie: DiceSize;
  fortitudeDie: DiceSize;
  intellectDie: DiceSize;
  synergyDie: DiceSize;
  braveryDie: DiceSize;
  weaponSkillValue: number;
  armorSkillValue: number;
  calculatorArchetype: string;
  attack: {
    name: string;
    rawStrength: number;
    displayedWoundsPerSuccess: number;
    damageType: {
      name: string;
      mode: DamageMode;
    };
  };
};

const LEGENDARY_ELITE_NAMES: readonly LegendaryEliteName[] = [
  "BALANCE_Legendary Elite Duelist",
  "BALANCE_Legendary Elite Hexer",
];

const SPECS: readonly LegendaryEliteSpec[] = [
  {
    name: "BALANCE_Legendary Elite Duelist",
    roleIntent: "Physical Legendary Elite 1v1 duel benchmark. Stronger than an ordinary Elite, below normal Boss encounter-anchor durability.",
    physicalHp: 32,
    mentalHp: 28,
    physicalProtection: 2,
    mentalProtection: 1,
    attackDie: "D10",
    guardDie: "D8",
    fortitudeDie: "D8",
    intellectDie: "D6",
    synergyDie: "D6",
    braveryDie: "D6",
    weaponSkillValue: 3,
    armorSkillValue: 2,
    calculatorArchetype: "STRIKER",
    attack: {
      name: "BALANCE_Legendary Elite Duelist Role Blade",
      rawStrength: 2,
      displayedWoundsPerSuccess: 4,
      damageType: { name: "Slashing", mode: "PHYSICAL" },
    },
  },
  {
    name: "BALANCE_Legendary Elite Hexer",
    roleIntent: "Mental/control Legendary Elite 1v1 duel benchmark. Tests mental defence and counterplay without using Boss-tier HP.",
    physicalHp: 28,
    mentalHp: 32,
    physicalProtection: 1,
    mentalProtection: 2,
    attackDie: "D10",
    guardDie: "D6",
    fortitudeDie: "D6",
    intellectDie: "D8",
    synergyDie: "D8",
    braveryDie: "D8",
    weaponSkillValue: 3,
    armorSkillValue: 2,
    calculatorArchetype: "CONTROL",
    attack: {
      name: "BALANCE_Legendary Elite Hexer Role Hex",
      rawStrength: 2,
      displayedWoundsPerSuccess: 4,
      damageType: { name: "Fear", mode: "MENTAL" },
    },
  },
];

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

function attackConfig(spec: LegendaryEliteSpec): Prisma.InputJsonObject {
  const mental = spec.attack.damageType.mode === "MENTAL";
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: mental ? 0 : spec.attack.rawStrength,
      mentalStrength: mental ? spec.attack.rawStrength : 0,
      damageTypes: [spec.attack.damageType],
      attackEffects: [],
    },
  };
}

function customNotes(spec: LegendaryEliteSpec) {
  return [
    "BALANCE_STATUS: Level 3 Legendary Elite duel baseline asset",
    "BALANCE_SOURCE: Balance Environment Legendary Elite duel baseline",
    "BALANCE_PHASE: BAL-LEGENDARY-ELITE-DUEL-001",
    `BALANCE_ROLE_INTENT: ${spec.roleIntent}`,
    "BALANCE_LEGENDARY_INTENT: Legendary is a modifier on ELITE tier here; this is not a normal Boss or final lore monster.",
    "BALANCE_NOTES: Named test asset only; used for 1v1 duel pressure evidence.",
  ].join("\n");
}

function monsterData(spec: LegendaryEliteSpec): Prisma.MonsterUncheckedCreateInput {
  return {
    name: spec.name,
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: LEVEL,
    tier: "ELITE",
    legendary: true,
    calculatorArchetype: spec.calculatorArchetype,
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
    customNotes: customNotes(spec),
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
    physicalResilienceCurrent: spec.physicalHp,
    physicalResilienceMax: spec.physicalHp,
    mentalPerseveranceCurrent: spec.mentalHp,
    mentalPerseveranceMax: spec.mentalHp,
    physicalProtection: spec.physicalProtection,
    mentalProtection: spec.mentalProtection,
    naturalPhysicalProtection: spec.physicalProtection,
    naturalMentalProtection: spec.mentalProtection,
    attackDie: spec.attackDie,
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: spec.guardDie,
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: spec.fortitudeDie,
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: spec.intellectDie,
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: spec.synergyDie,
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: spec.braveryDie,
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: spec.weaponSkillValue,
    weaponSkillModifier: 0,
    armorSkillValue: spec.armorSkillValue,
    armorSkillModifier: 0,
  };
}

function summarize(row: Awaited<ReturnType<typeof findMonster>>) {
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

async function findMonster(prisma: PrismaClient, name: LegendaryEliteName) {
  return prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name },
    select: SELECT_FIELDS,
  });
}

async function upsertLegendaryElite(prisma: PrismaClient, spec: LegendaryEliteSpec) {
  const matches = await prisma.monster.findMany({
    where: { campaignId: BALANCE_CAMPAIGN_ID, name: spec.name },
    select: { id: true, source: true, isReadOnly: true, campaignId: true, tier: true, legendary: true },
  });
  if (matches.length > 1) {
    throw new Error(`Refusing ${spec.name}: found ${matches.length} matching Balance Environment rows.`);
  }
  const existing = matches[0] ?? null;
  if (existing && (existing.source !== "CAMPAIGN" || existing.isReadOnly || existing.campaignId !== BALANCE_CAMPAIGN_ID)) {
    throw new Error(`Refusing ${spec.name}: existing row is protected or out of scope.`);
  }

  const before = await findMonster(prisma, spec.name);
  const config = attackConfig(spec);
  const result = await prisma.$transaction(async (tx) => {
    const monster = existing
      ? await tx.monster.update({ where: { id: existing.id }, data: monsterData(spec) })
      : await tx.monster.create({ data: monsterData(spec) });

    await tx.monsterTag.deleteMany({ where: { monsterId: monster.id } });
    await tx.monsterTag.createMany({
      data: ["BALANCE", "LEGENDARY_ELITE_DUEL_BASELINE"].map((tag) => ({ monsterId: monster.id, tag })),
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
        attackName: spec.attack.name,
        attackConfig: config,
        equippedWeaponId: null,
      },
    });
    await tx.monsterNaturalAttack.upsert({
      where: { monsterId: monster.id },
      create: {
        monsterId: monster.id,
        attackName: spec.attack.name,
        attackConfig: config,
      },
      update: {
        attackName: spec.attack.name,
        attackConfig: config,
      },
    });

    return monster;
  });

  const after = await findMonster(prisma, spec.name);
  return {
    name: spec.name,
    id: result.id,
    operation: before ? "updated" : "created",
    roleIntent: spec.roleIntent,
    authoredOffence: {
      attackName: spec.attack.name,
      dice: `${spec.weaponSkillValue}x${spec.attackDie}`,
      displayedWoundsPerSuccess: spec.attack.displayedWoundsPerSuccess,
      rawStrength: spec.attack.rawStrength,
      channel: spec.attack.damageType.mode.toLowerCase(),
      cooldown: 0,
    },
    before: summarize(before),
    after: summarize(after),
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

    const accidentalLegendaryEliteRows = await prisma.monster.findMany({
      where: {
        campaignId: BALANCE_CAMPAIGN_ID,
        name: { startsWith: "BALANCE_Legendary Elite " },
        NOT: { name: { in: [...LEGENDARY_ELITE_NAMES] } },
      },
      select: { id: true, name: true },
    });
    if (accidentalLegendaryEliteRows.length > 0) {
      throw new Error(
        `Refusing to proceed: found unapproved BALANCE_Legendary Elite rows: ${
          accidentalLegendaryEliteRows.map((row) => `${row.name} (${row.id})`).join(", ")
        }.`,
      );
    }

    const results = [];
    for (const spec of SPECS) {
      results.push(await upsertLegendaryElite(prisma, spec));
    }

    console.log("Balance Environment Legendary Elite duel baseline assets ensured.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped upserts for BALANCE_Legendary Elite Duelist and BALANCE_Legendary Elite Hexer only.");
    console.log("No player, Soldier, normal Elite, normal Boss, Minion, Legendary Dragon/Lich, calibration, runtime, formula, scalar, tuning, UI, or docs values were changed by this script.");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
