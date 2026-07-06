import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;
const SOLDIER_HP = 10;

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type PrismaClient = typeof import("../prisma/client")["prisma"];

type DefenceSpec = {
  name: string;
  label: string;
  physicalProtection: number;
  mentalProtection: number;
  guardDie: DiceSize;
  fortitudeDie: DiceSize;
  intellectDie: DiceSize;
  synergyDie: DiceSize;
  braveryDie: DiceSize;
  armorSkillValue: number;
  notes: string;
};

const CANDIDATES: DefenceSpec[] = [
  {
    name: "BALANCE_DEF_L3_Soldier_No_Defence",
    label: "No Defence",
    physicalProtection: 0,
    mentalProtection: 0,
    guardDie: "D4",
    fortitudeDie: "D4",
    intellectDie: "D4",
    synergyDie: "D4",
    braveryDie: "D4",
    armorSkillValue: 1,
    notes: "HP-only Soldier baseline with minimum defence attributes.",
  },
  {
    name: "BALANCE_DEF_L3_Soldier_Light_Defence",
    label: "Light Defence",
    physicalProtection: 1,
    mentalProtection: 1,
    guardDie: "D4",
    fortitudeDie: "D6",
    intellectDie: "D4",
    synergyDie: "D6",
    braveryDie: "D4",
    armorSkillValue: 2,
    notes: "Small symmetric protection with modest physical and mental defence attributes.",
  },
  {
    name: "BALANCE_DEF_L3_Soldier_Standard_Defence",
    label: "Standard Defence",
    physicalProtection: 2,
    mentalProtection: 2,
    guardDie: "D6",
    fortitudeDie: "D8",
    intellectDie: "D4",
    synergyDie: "D8",
    braveryDie: "D6",
    armorSkillValue: 3,
    notes: "Candidate typical Level 3 Soldier mitigation package.",
  },
  {
    name: "BALANCE_DEF_L3_Soldier_Heavy_Defence",
    label: "Heavy Defence",
    physicalProtection: 3,
    mentalProtection: 3,
    guardDie: "D8",
    fortitudeDie: "D10",
    intellectDie: "D4",
    synergyDie: "D10",
    braveryDie: "D8",
    armorSkillValue: 4,
    notes: "Strong symmetric protection and defence attributes; expected above typical.",
  },
  {
    name: "BALANCE_DEF_L3_Soldier_Physical_Biased",
    label: "Physical Biased",
    physicalProtection: 3,
    mentalProtection: 1,
    guardDie: "D6",
    fortitudeDie: "D10",
    intellectDie: "D4",
    synergyDie: "D6",
    braveryDie: "D4",
    armorSkillValue: 4,
    notes: "Physical mitigation emphasis with weaker mental lane.",
  },
  {
    name: "BALANCE_DEF_L3_Soldier_Mental_Biased",
    label: "Mental Biased",
    physicalProtection: 1,
    mentalProtection: 3,
    guardDie: "D4",
    fortitudeDie: "D6",
    intellectDie: "D4",
    synergyDie: "D10",
    braveryDie: "D8",
    armorSkillValue: 2,
    notes: "Mental mitigation emphasis with weaker physical lane.",
  },
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

function customNotes(spec: DefenceSpec) {
  return [
    "BALANCE_STATUS: defence string calibration candidate",
    "BALANCE_SOURCE: Balance Environment Level 3 defence string calibration",
    "BALANCE_PHASE: BAL-DEFENCE-STRING-001",
    `BALANCE_DEFENCE_STRING: ${spec.label}`,
    `BALANCE_NOTES: ${spec.notes}`,
    "Ruler/probe asset only; not a final monster archetype or doctrine lock.",
  ].join("\n");
}

function monsterData(spec: DefenceSpec): Prisma.MonsterUncheckedCreateInput {
  return {
    name: spec.name,
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: LEVEL,
    tier: "SOLDIER",
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
    physicalResilienceCurrent: SOLDIER_HP,
    physicalResilienceMax: SOLDIER_HP,
    mentalPerseveranceCurrent: SOLDIER_HP,
    mentalPerseveranceMax: SOLDIER_HP,
    physicalProtection: spec.physicalProtection,
    mentalProtection: spec.mentalProtection,
    naturalPhysicalProtection: spec.physicalProtection,
    naturalMentalProtection: spec.mentalProtection,
    attackDie: "D4",
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
    weaponSkillValue: 1,
    weaponSkillModifier: 0,
    armorSkillValue: spec.armorSkillValue,
    armorSkillModifier: 0,
  };
}

async function summarize(prisma: PrismaClient, name: string) {
  const monster = await prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name },
    select: {
      id: true,
      name: true,
      level: true,
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
  return monster;
}

async function upsertCandidate(prisma: PrismaClient, spec: DefenceSpec) {
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
    data: ["BALANCE", "DEFENCE_STRING_CALIBRATION"].map((tag) => ({ monsterId: monster.id, tag })),
    skipDuplicates: true,
  });
  await prisma.monsterNaturalAttack.deleteMany({ where: { monsterId: monster.id } });
  await prisma.monsterAttack.deleteMany({ where: { monsterId: monster.id } });
  await prisma.power.deleteMany({ where: { monsterId: monster.id } });
  await prisma.monsterTrait.deleteMany({ where: { monsterId: monster.id } });

  const after = await summarize(prisma, spec.name);
  return {
    name: spec.name,
    label: spec.label,
    operation: before ? "updated" : "created",
    before,
    after,
  };
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
    for (const spec of CANDIDATES) {
      results.push(await upsertCandidate(prisma, spec));
    }

    console.log("Balance Environment Level 3 Soldier defence-string candidates ensured.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped BALANCE_DEF_L3_* candidate upserts only.");
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
