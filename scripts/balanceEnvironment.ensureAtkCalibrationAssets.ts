import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;

type PrismaClient = typeof import("../prisma/client").prisma;

type CalibrationMonsterSpec = {
  name: string;
  tier: "MINION" | "SOLDIER" | "ELITE" | "BOSS";
  legendary: boolean;
  role: string;
  physicalHp: number;
  mentalHp: number;
  attackDie: "D4" | "D6" | "D8" | "D10" | "D12";
  guardDie: "D4" | "D6" | "D8" | "D10" | "D12";
  fortitudeDie: "D4" | "D6" | "D8" | "D10" | "D12";
  intellectDie: "D4" | "D6" | "D8" | "D10" | "D12";
  synergyDie: "D4" | "D6" | "D8" | "D10" | "D12";
  braveryDie: "D4" | "D6" | "D8" | "D10" | "D12";
  weaponSkillValue: number;
  armorSkillValue: number;
  naturalAttack: {
    attackName: string;
    attackConfig: Prisma.InputJsonValue;
  } | null;
};

type MonsterSummary = {
  id: string;
  name: string;
  tier: string;
  legendary: boolean;
  physicalHp: number;
  mentalHp: number;
  attackDie: string;
  weaponSkillValue: number;
  naturalAttack: {
    attackName: string;
    attackConfig: unknown;
  } | null;
};

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = join(process.cwd(), fileName);
    if (!existsSync(filePath)) continue;
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function mediumMentalAttackConfig(): Prisma.InputJsonObject {
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: 0,
      mentalStrength: 1,
      damageTypes: [{ name: "Psychic", mode: "MENTAL" }],
      attackEffects: [],
    },
  };
}

function customNotes(role: string) {
  return [
    "BALANCE_STATUS: ATK calibration asset",
    "BALANCE_SOURCE: Balance Environment ATK calibration",
    "BALANCE_PHASE: BAL-ATK-005",
    `BALANCE_ROLE: ${role}`,
    "BALANCE_NOTES: Clean ruler asset for attacks-to-kill calibration, not a final authored encounter asset.",
  ].join("\n");
}

const SPECS: CalibrationMonsterSpec[] = [
  {
    name: "BALANCE_ATK_Medium_Attacker",
    tier: "MINION",
    legendary: false,
    role: "Official Medium Strength Attack V0 probe: 3 x D8, 2 wounds per success, one attack per turn.",
    physicalHp: 999,
    mentalHp: 999,
    attackDie: "D8",
    guardDie: "D4",
    fortitudeDie: "D4",
    intellectDie: "D4",
    synergyDie: "D4",
    braveryDie: "D4",
    weaponSkillValue: 3,
    armorSkillValue: 1,
    naturalAttack: {
      attackName: "Medium Strength Attack V0",
      attackConfig: mediumMentalAttackConfig(),
    },
  },
  {
    name: "BALANCE_ATK_Minion_Target",
    tier: "MINION",
    legendary: false,
    role: "Clean Minion target for 1-2 Medium Strength Attacks.",
    physicalHp: 999,
    mentalHp: 6,
    attackDie: "D4",
    guardDie: "D4",
    fortitudeDie: "D4",
    intellectDie: "D4",
    synergyDie: "D4",
    braveryDie: "D4",
    weaponSkillValue: 1,
    armorSkillValue: 1,
    naturalAttack: null,
  },
  {
    name: "BALANCE_ATK_Soldier_Target",
    tier: "SOLDIER",
    legendary: false,
    role: "Clean Soldier target for 2-3 Medium Strength Attacks.",
    physicalHp: 999,
    mentalHp: 10,
    attackDie: "D4",
    guardDie: "D4",
    fortitudeDie: "D4",
    intellectDie: "D4",
    synergyDie: "D4",
    braveryDie: "D4",
    weaponSkillValue: 1,
    armorSkillValue: 1,
    naturalAttack: null,
  },
  {
    name: "BALANCE_ATK_Elite_Target",
    tier: "ELITE",
    legendary: false,
    role: "Clean Elite target for 4-6 Medium Strength Attacks.",
    physicalHp: 999,
    mentalHp: 20,
    attackDie: "D4",
    guardDie: "D4",
    fortitudeDie: "D4",
    intellectDie: "D4",
    synergyDie: "D4",
    braveryDie: "D4",
    weaponSkillValue: 1,
    armorSkillValue: 1,
    naturalAttack: null,
  },
  {
    name: "BALANCE_ATK_Boss_Target",
    tier: "BOSS",
    legendary: false,
    role: "Clean Boss target for 16+ Medium Strength Attacks.",
    physicalHp: 999,
    mentalHp: 64,
    attackDie: "D4",
    guardDie: "D4",
    fortitudeDie: "D4",
    intellectDie: "D4",
    synergyDie: "D4",
    braveryDie: "D4",
    weaponSkillValue: 1,
    armorSkillValue: 1,
    naturalAttack: null,
  },
];

async function summarize(prisma: PrismaClient, name: string): Promise<MonsterSummary | null> {
  const monster = await prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name },
    include: { naturalAttack: true },
  });
  if (!monster) return null;
  return {
    id: monster.id,
    name: monster.name,
    tier: monster.tier,
    legendary: monster.legendary,
    physicalHp: monster.physicalResilienceMax,
    mentalHp: monster.mentalPerseveranceMax,
    attackDie: monster.attackDie,
    weaponSkillValue: monster.weaponSkillValue,
    naturalAttack: monster.naturalAttack
      ? {
          attackName: monster.naturalAttack.attackName,
          attackConfig: monster.naturalAttack.attackConfig,
        }
      : null,
  };
}

function monsterData(spec: CalibrationMonsterSpec): Prisma.MonsterUncheckedCreateInput {
  return {
    name: spec.name,
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: LEVEL,
    tier: spec.tier,
    legendary: spec.legendary,
    calculatorArchetype: "BALANCED",
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
    customNotes: customNotes(spec.role),
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
    physicalProtection: 0,
    mentalProtection: 0,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 0,
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

async function upsertSpec(prisma: PrismaClient, spec: CalibrationMonsterSpec) {
  const before = await summarize(prisma, spec.name);
  const existing = await prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name: spec.name },
    select: { id: true },
  });

  const monster = existing
    ? await prisma.monster.update({
        where: { id: existing.id },
        data: monsterData(spec),
      })
    : await prisma.monster.create({
        data: monsterData(spec),
      });

  await prisma.monsterTag.deleteMany({ where: { monsterId: monster.id } });
  await prisma.monsterTag.createMany({
    data: ["BALANCE", "ATK_CALIBRATION"].map((tag) => ({ monsterId: monster.id, tag })),
    skipDuplicates: true,
  });
  await prisma.monsterAttack.deleteMany({ where: { monsterId: monster.id } });
  await prisma.power.deleteMany({ where: { monsterId: monster.id } });
  await prisma.monsterTrait.deleteMany({ where: { monsterId: monster.id } });

  if (spec.naturalAttack) {
    await prisma.monsterNaturalAttack.upsert({
      where: { monsterId: monster.id },
      create: {
        monsterId: monster.id,
        attackName: spec.naturalAttack.attackName,
        attackConfig: spec.naturalAttack.attackConfig,
      },
      update: {
        attackName: spec.naturalAttack.attackName,
        attackConfig: spec.naturalAttack.attackConfig,
      },
    });
  } else {
    await prisma.monsterNaturalAttack.deleteMany({ where: { monsterId: monster.id } });
  }

  const after = await summarize(prisma, spec.name);
  return { name: spec.name, operation: before ? "updated" : "created", before, after };
}

async function main() {
  loadLocalEnv();
  const prismaModule = await import("../prisma/client");
  const prisma = prismaModule.prisma;
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: BALANCE_CAMPAIGN_ID },
      select: { id: true, name: true },
    });
    if (!campaign) throw new Error(`Campaign ${BALANCE_CAMPAIGN_ID} was not found.`);
    if (campaign.name !== BALANCE_CAMPAIGN_NAME) {
      throw new Error(`Campaign name mismatch: expected ${BALANCE_CAMPAIGN_NAME}, found ${campaign.name}.`);
    }

    const results = [];
    for (const spec of SPECS) {
      results.push(await upsertSpec(prisma, spec));
    }

    console.log("Balance Environment ATK calibration asset ensure complete.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped BALANCE_ATK_* monster upserts only.");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
