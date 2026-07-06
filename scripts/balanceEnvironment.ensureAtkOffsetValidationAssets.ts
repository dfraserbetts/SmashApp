import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { MonsterTier, Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type PrismaClient = typeof import("../prisma/client")["prisma"];

type OffsetSpec = {
  name: string;
  tier: MonsterTier;
  physicalHp: number;
  mentalHp: number;
};

const STANDARD_DEFENCE = {
  physicalProtection: 2,
  mentalProtection: 2,
  guardDie: "D6" as DiceSize,
  fortitudeDie: "D8" as DiceSize,
  intellectDie: "D4" as DiceSize,
  synergyDie: "D8" as DiceSize,
  braveryDie: "D6" as DiceSize,
  armorSkillValue: 3,
};

const CANDIDATES: OffsetSpec[] = [
  { name: "BALANCE_OFFSET_L3_Minion_Standard_Defence", tier: "MINION", physicalHp: 6, mentalHp: 6 },
  { name: "BALANCE_OFFSET_L3_Soldier_Standard_Defence", tier: "SOLDIER", physicalHp: 10, mentalHp: 10 },
  { name: "BALANCE_OFFSET_L3_Elite_Standard_Defence", tier: "ELITE", physicalHp: 20, mentalHp: 20 },
  { name: "BALANCE_OFFSET_L3_Boss_Standard_Defence", tier: "BOSS", physicalHp: 64, mentalHp: 64 },
];

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

function customNotes(spec: OffsetSpec) {
  return [
    "BALANCE_STATUS: attack/defence offset validation candidate",
    "BALANCE_SOURCE: Balance Environment Level 3 offset validation",
    "BALANCE_PHASE: BAL-OFFSET-001",
    "BALANCE_ATTACK_BASELINE: BALANCE_ATK_L3_AttackString_4D8_W2",
    "BALANCE_DEFENCE_BASELINE: Standard Defence",
    `BALANCE_OFFSET_TIER: ${spec.tier}`,
    "BALANCE_NOTES: Ruler/probe asset only; not a final monster archetype or doctrine lock.",
  ].join("\n");
}

function monsterData(spec: OffsetSpec): Prisma.MonsterUncheckedCreateInput {
  return {
    name: spec.name,
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: LEVEL,
    tier: spec.tier,
    legendary: false,
    calculatorArchetype: "TANK",
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
    physicalProtection: STANDARD_DEFENCE.physicalProtection,
    mentalProtection: STANDARD_DEFENCE.mentalProtection,
    naturalPhysicalProtection: STANDARD_DEFENCE.physicalProtection,
    naturalMentalProtection: STANDARD_DEFENCE.mentalProtection,
    attackDie: "D4",
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: STANDARD_DEFENCE.guardDie,
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: STANDARD_DEFENCE.fortitudeDie,
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: STANDARD_DEFENCE.intellectDie,
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: STANDARD_DEFENCE.synergyDie,
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: STANDARD_DEFENCE.braveryDie,
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: 1,
    weaponSkillModifier: 0,
    armorSkillValue: STANDARD_DEFENCE.armorSkillValue,
    armorSkillModifier: 0,
  };
}

async function summarize(prisma: PrismaClient, name: string) {
  return prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name },
    select: {
      id: true,
      name: true,
      level: true,
      tier: true,
      physicalResilienceMax: true,
      mentalPerseveranceMax: true,
      physicalProtection: true,
      mentalProtection: true,
      naturalPhysicalProtection: true,
      naturalMentalProtection: true,
      guardDie: true,
      fortitudeDie: true,
      intellectDie: true,
      synergyDie: true,
      braveryDie: true,
      armorSkillValue: true,
    },
  });
}

async function upsertCandidate(prisma: PrismaClient, spec: OffsetSpec) {
  const before = await summarize(prisma, spec.name);
  const existing = await prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name: spec.name },
    select: { id: true },
  });
  const monster = existing
    ? await prisma.monster.update({ where: { id: existing.id }, data: monsterData(spec) })
    : await prisma.monster.create({ data: monsterData(spec) });

  await prisma.monsterTag.deleteMany({ where: { monsterId: monster.id } });
  await prisma.monsterTag.createMany({
    data: ["BALANCE", "OFFSET_VALIDATION"].map((tag) => ({ monsterId: monster.id, tag })),
    skipDuplicates: true,
  });
  await prisma.monsterNaturalAttack.deleteMany({ where: { monsterId: monster.id } });
  await prisma.monsterAttack.deleteMany({ where: { monsterId: monster.id } });
  await prisma.power.deleteMany({ where: { monsterId: monster.id } });
  await prisma.monsterTrait.deleteMany({ where: { monsterId: monster.id } });

  const after = await summarize(prisma, spec.name);
  return { name: spec.name, operation: before ? "updated" : "created", before, after };
}

async function main() {
  loadLocalEnv();
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

    const results = [];
    for (const spec of CANDIDATES) results.push(await upsertCandidate(prisma, spec));

    console.log("Balance Environment Level 3 attack/defence offset validation assets ensured.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped BALANCE_OFFSET_L3_* candidate upserts only.");
    console.log("Note: these are candidates, not final doctrine.");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
