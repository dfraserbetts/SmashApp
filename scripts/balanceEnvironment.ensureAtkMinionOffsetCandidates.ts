import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type PrismaClient = typeof import("../prisma/client")["prisma"];
type DefencePackageName = "No_Defence" | "Light_Defence" | "Standard_Defence";

type DefencePackage = {
  label: DefencePackageName;
  physicalProtection: number;
  mentalProtection: number;
  guardDie: DiceSize;
  fortitudeDie: DiceSize;
  intellectDie: DiceSize;
  synergyDie: DiceSize;
  braveryDie: DiceSize;
  armorSkillValue: number;
};

type MinionSpec = {
  hp: number;
  defence: DefencePackage;
};

const DEFENCE_PACKAGES: DefencePackage[] = [
  {
    label: "No_Defence",
    physicalProtection: 0,
    mentalProtection: 0,
    guardDie: "D4",
    fortitudeDie: "D4",
    intellectDie: "D4",
    synergyDie: "D4",
    braveryDie: "D4",
    armorSkillValue: 1,
  },
  {
    label: "Light_Defence",
    physicalProtection: 1,
    mentalProtection: 1,
    guardDie: "D4",
    fortitudeDie: "D6",
    intellectDie: "D4",
    synergyDie: "D6",
    braveryDie: "D4",
    armorSkillValue: 2,
  },
  {
    label: "Standard_Defence",
    physicalProtection: 2,
    mentalProtection: 2,
    guardDie: "D6",
    fortitudeDie: "D8",
    intellectDie: "D4",
    synergyDie: "D8",
    braveryDie: "D6",
    armorSkillValue: 3,
  },
];

const CANDIDATES: MinionSpec[] = [4, 5, 6].flatMap((hp) =>
  DEFENCE_PACKAGES.map((defence) => ({ hp, defence })),
);

function candidateName(spec: MinionSpec) {
  return `BALANCE_OFFSET_L3_Minion_HP${spec.hp}_${spec.defence.label}`;
}

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

function customNotes(spec: MinionSpec) {
  return [
    "BALANCE_STATUS: Minion offset validation candidate",
    "BALANCE_SOURCE: Balance Environment Level 3 Minion offset validation",
    "BALANCE_PHASE: BAL-MINION-OFFSET-001",
    "BALANCE_ATTACK_BASELINE: BALANCE_ATK_L3_AttackString_4D8_W2",
    `BALANCE_MINION_HP: ${spec.hp}`,
    `BALANCE_DEFENCE_PACKAGE: ${spec.defence.label.replace(/_/g, " ")}`,
    "BALANCE_NOTES: Ruler/probe asset only; not a final monster archetype or doctrine lock.",
  ].join("\n");
}

function monsterData(spec: MinionSpec): Prisma.MonsterUncheckedCreateInput {
  return {
    name: candidateName(spec),
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: LEVEL,
    tier: "MINION",
    legendary: false,
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
    physicalResilienceCurrent: spec.hp,
    physicalResilienceMax: spec.hp,
    mentalPerseveranceCurrent: spec.hp,
    mentalPerseveranceMax: spec.hp,
    physicalProtection: spec.defence.physicalProtection,
    mentalProtection: spec.defence.mentalProtection,
    naturalPhysicalProtection: spec.defence.physicalProtection,
    naturalMentalProtection: spec.defence.mentalProtection,
    attackDie: "D4",
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: spec.defence.guardDie,
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: spec.defence.fortitudeDie,
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: spec.defence.intellectDie,
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: spec.defence.synergyDie,
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: spec.defence.braveryDie,
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: 1,
    weaponSkillModifier: 0,
    armorSkillValue: spec.defence.armorSkillValue,
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

async function upsertCandidate(prisma: PrismaClient, spec: MinionSpec) {
  const name = candidateName(spec);
  const before = await summarize(prisma, name);
  const existing = await prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name },
    select: { id: true },
  });
  const monster = existing
    ? await prisma.monster.update({ where: { id: existing.id }, data: monsterData(spec) })
    : await prisma.monster.create({ data: monsterData(spec) });

  await prisma.monsterTag.deleteMany({ where: { monsterId: monster.id } });
  await prisma.monsterTag.createMany({
    data: ["BALANCE", "MINION_OFFSET_VALIDATION"].map((tag) => ({ monsterId: monster.id, tag })),
    skipDuplicates: true,
  });
  await prisma.monsterNaturalAttack.deleteMany({ where: { monsterId: monster.id } });
  await prisma.monsterAttack.deleteMany({ where: { monsterId: monster.id } });
  await prisma.power.deleteMany({ where: { monsterId: monster.id } });
  await prisma.monsterTrait.deleteMany({ where: { monsterId: monster.id } });

  const after = await summarize(prisma, name);
  return {
    name,
    operation: before ? "updated" : "created",
    hp: spec.hp,
    defencePackage: spec.defence.label,
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
    for (const spec of CANDIDATES) results.push(await upsertCandidate(prisma, spec));

    console.log("Balance Environment Level 3 Minion offset candidates ensured.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped BALANCE_OFFSET_L3_Minion_HP* candidate upserts only.");
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
