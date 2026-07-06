import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type PrismaClient = typeof import("../prisma/client")["prisma"];

type CandidateSpec = {
  name: string;
  diceCount: number;
  die: DiceSize;
  woundsPerSuccess: number;
};

const CANDIDATES: CandidateSpec[] = [
  { name: "BALANCE_ATK_L3_AttackString_3D8_W2", diceCount: 3, die: "D8", woundsPerSuccess: 2 },
  { name: "BALANCE_ATK_L3_AttackString_3D8_W3", diceCount: 3, die: "D8", woundsPerSuccess: 3 },
  { name: "BALANCE_ATK_L3_AttackString_3D8_W4", diceCount: 3, die: "D8", woundsPerSuccess: 4 },
  { name: "BALANCE_ATK_L3_AttackString_4D8_W2", diceCount: 4, die: "D8", woundsPerSuccess: 2 },
  { name: "BALANCE_ATK_L3_AttackString_4D8_W3", diceCount: 4, die: "D8", woundsPerSuccess: 3 },
  { name: "BALANCE_ATK_L3_AttackString_4D10_W3", diceCount: 4, die: "D10", woundsPerSuccess: 3 },
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

function customNotes(spec: CandidateSpec) {
  return [
    "BALANCE_STATUS: attack string calibration candidate",
    "BALANCE_SOURCE: Balance Environment Level 3 attack string calibration",
    "BALANCE_PHASE: BAL-ATTACK-STRING-001",
    `BALANCE_ATTACK_STRING: ${spec.diceCount}${spec.die}_W${spec.woundsPerSuccess}`,
    "BALANCE_NOTES: Ruler/probe asset only; not a final character, monster archetype, or doctrine lock.",
  ].join("\n");
}

function attackConfig(spec: CandidateSpec): Prisma.InputJsonObject {
  const rawStrength = spec.woundsPerSuccess / 2;
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: rawStrength,
      mentalStrength: rawStrength,
      damageTypes: [
        { name: "Strike", mode: "PHYSICAL" },
        { name: "Psychic", mode: "MENTAL" },
      ],
      attackEffects: [],
    },
  };
}

function monsterData(spec: CandidateSpec): Prisma.MonsterUncheckedCreateInput {
  return {
    name: spec.name,
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
    physicalResilienceCurrent: 999,
    physicalResilienceMax: 999,
    mentalPerseveranceCurrent: 999,
    mentalPerseveranceMax: 999,
    physicalProtection: 0,
    mentalProtection: 0,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 0,
    attackDie: spec.die,
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: "D4",
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D4",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D4",
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: "D4",
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: "D4",
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: spec.diceCount,
    weaponSkillModifier: 0,
    armorSkillValue: 1,
    armorSkillModifier: 0,
  };
}

async function summarize(prisma: PrismaClient, name: string) {
  const monster = await prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name },
    include: { naturalAttack: true },
  });
  if (!monster) return null;
  return {
    id: monster.id,
    name: monster.name,
    level: monster.level,
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

async function upsertCandidate(prisma: PrismaClient, spec: CandidateSpec) {
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
    data: ["BALANCE", "ATK_ATTACK_STRING_CALIBRATION"].map((tag) => ({ monsterId: monster.id, tag })),
    skipDuplicates: true,
  });
  await prisma.monsterAttack.deleteMany({ where: { monsterId: monster.id } });
  await prisma.power.deleteMany({ where: { monsterId: monster.id } });
  await prisma.monsterTrait.deleteMany({ where: { monsterId: monster.id } });
  await prisma.monsterNaturalAttack.upsert({
    where: { monsterId: monster.id },
    create: {
      monsterId: monster.id,
      attackName: spec.name.replace("BALANCE_ATK_L3_AttackString_", "L3 Attack String "),
      attackConfig: attackConfig(spec),
    },
    update: {
      attackName: spec.name.replace("BALANCE_ATK_L3_AttackString_", "L3 Attack String "),
      attackConfig: attackConfig(spec),
    },
  });

  const after = await summarize(prisma, spec.name);
  return {
    name: spec.name,
    operation: before ? "updated" : "created",
    diceCount: spec.diceCount,
    die: spec.die,
    woundsPerSuccess: spec.woundsPerSuccess,
    rawStrength: spec.woundsPerSuccess / 2,
    physicalAttackExists: true,
    mentalAttackExists: true,
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

    console.log("Balance Environment Level 3 attack-string candidates ensured.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped BALANCE_ATK_L3_AttackString_* candidate upserts only.");
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
