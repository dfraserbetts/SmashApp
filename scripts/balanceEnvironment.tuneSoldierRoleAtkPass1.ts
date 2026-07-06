import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";

type SoldierRoleTuning = {
  name: string;
  rationale: string;
  physicalResilienceMax: number;
  mentalPerseveranceMax: number;
  physicalProtection: number;
  mentalProtection: number;
  naturalPhysicalProtection: number;
  naturalMentalProtection: number;
  guardDie: DiceSize;
  guardResistDie: number;
  guardModifier: number;
  fortitudeDie: DiceSize;
  fortitudeResistDie: number;
  fortitudeModifier: number;
  intellectDie: DiceSize;
  intellectResistDie: number;
  intellectModifier: number;
  synergyDie: DiceSize;
  synergyResistDie: number;
  synergyModifier: number;
  braveryDie: DiceSize;
  braveryResistDie: number;
  braveryModifier: number;
  armorSkillValue: number;
  armorSkillModifier: number;
};

const TUNING: SoldierRoleTuning[] = [
  {
    name: "BALANCE_Control Hexer",
    rationale: "Controller Soldier: low physical staying power, moderate mental resistance without pushing mental ATK beyond the Soldier band.",
    physicalResilienceMax: 12,
    mentalPerseveranceMax: 18,
    physicalProtection: 0,
    mentalProtection: 1,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 1,
    guardDie: "D4",
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D4",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D4",
    intellectResistDie: 2,
    intellectModifier: 0,
    synergyDie: "D8",
    synergyResistDie: 1,
    synergyModifier: 0,
    braveryDie: "D6",
    braveryResistDie: 1,
    braveryModifier: 0,
    armorSkillValue: 1,
    armorSkillModifier: 0,
  },
  {
    name: "BALANCE_Dodge Pressure Skirmisher",
    rationale: "Evasive Soldier: preserve Dodge identity while trimming mental HP so at least one lane lands near the Soldier target.",
    physicalResilienceMax: 24,
    mentalPerseveranceMax: 14,
    physicalProtection: 0,
    mentalProtection: 0,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 0,
    guardDie: "D8",
    guardResistDie: 1,
    guardModifier: 0,
    fortitudeDie: "D6",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D6",
    intellectResistDie: 1,
    intellectModifier: 0,
    synergyDie: "D4",
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: "D4",
    braveryResistDie: 0,
    braveryModifier: 0,
    armorSkillValue: 1,
    armorSkillModifier: 0,
  },
  {
    name: "BALANCE_Durable Soldier",
    rationale: "Durable Soldier: keep the physical durable identity but leave the mental lane inside the Soldier ATK band.",
    physicalResilienceMax: 22,
    mentalPerseveranceMax: 14,
    physicalProtection: 2,
    mentalProtection: 0,
    naturalPhysicalProtection: 2,
    naturalMentalProtection: 0,
    guardDie: "D6",
    guardResistDie: 1,
    guardModifier: 0,
    fortitudeDie: "D8",
    fortitudeResistDie: 1,
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
    armorSkillValue: 2,
    armorSkillModifier: 0,
  },
  {
    name: "BALANCE_Mental Wailer",
    rationale: "Mental Soldier: preserve mental-side resistance while lowering evasion and HP enough for the corrected medium ruler.",
    physicalResilienceMax: 12,
    mentalPerseveranceMax: 20,
    physicalProtection: 0,
    mentalProtection: 1,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 1,
    guardDie: "D4",
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: "D4",
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: "D4",
    intellectResistDie: 2,
    intellectModifier: 0,
    synergyDie: "D8",
    synergyResistDie: 1,
    synergyModifier: 0,
    braveryDie: "D6",
    braveryResistDie: 1,
    braveryModifier: 0,
    armorSkillValue: 1,
    armorSkillModifier: 0,
  },
  {
    name: "BALANCE_Physical Striker",
    rationale: "Offensive Soldier: keep it less durable than defensive Soldiers so its pressure comes from offense rather than survival.",
    physicalResilienceMax: 16,
    mentalPerseveranceMax: 12,
    physicalProtection: 0,
    mentalProtection: 0,
    naturalPhysicalProtection: 0,
    naturalMentalProtection: 0,
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
    armorSkillValue: 1,
    armorSkillModifier: 0,
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
  physicalResilienceCurrent: true,
  physicalResilienceMax: true,
  mentalPerseveranceCurrent: true,
  mentalPerseveranceMax: true,
  physicalProtection: true,
  mentalProtection: true,
  naturalPhysicalProtection: true,
  naturalMentalProtection: true,
  attackDie: true,
  attackResistDie: true,
  attackModifier: true,
  guardDie: true,
  guardResistDie: true,
  guardModifier: true,
  fortitudeDie: true,
  fortitudeResistDie: true,
  fortitudeModifier: true,
  intellectDie: true,
  intellectResistDie: true,
  intellectModifier: true,
  synergyDie: true,
  synergyResistDie: true,
  synergyModifier: true,
  braveryDie: true,
  braveryResistDie: true,
  braveryModifier: true,
  weaponSkillValue: true,
  weaponSkillModifier: true,
  armorSkillValue: true,
  armorSkillModifier: true,
} as const;

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

function summarize(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    tier: row.tier,
    legendary: row.legendary,
    source: row.source,
    isReadOnly: row.isReadOnly,
    physicalHp: `${row.physicalResilienceCurrent}/${row.physicalResilienceMax}`,
    mentalHp: `${row.mentalPerseveranceCurrent}/${row.mentalPerseveranceMax}`,
    protection: {
      physical: row.physicalProtection,
      mental: row.mentalProtection,
      naturalPhysical: row.naturalPhysicalProtection,
      naturalMental: row.naturalMentalProtection,
    },
    defensiveDice: {
      guard: row.guardDie,
      fortitude: row.fortitudeDie,
      intellect: row.intellectDie,
      synergy: row.synergyDie,
      bravery: row.braveryDie,
      armorSkill: row.armorSkillValue,
    },
    resistDice: {
      guard: row.guardResistDie,
      fortitude: row.fortitudeResistDie,
      intellect: row.intellectResistDie,
      synergy: row.synergyResistDie,
      bravery: row.braveryResistDie,
    },
    offensePreserved: {
      attackDie: row.attackDie,
      attackResistDie: row.attackResistDie,
      attackModifier: row.attackModifier,
      weaponSkillValue: row.weaponSkillValue,
      weaponSkillModifier: row.weaponSkillModifier,
    },
  };
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
    for (const tuning of TUNING) {
      const before = await prisma.monster.findFirst({
        where: {
          campaignId: BALANCE_CAMPAIGN_ID,
          name: tuning.name,
        },
        select: SELECT_FIELDS,
      });

      if (!before) throw new Error(`${tuning.name}: expected existing Balance Environment monster.`);
      if (before.level !== LEVEL) throw new Error(`${tuning.name}: expected level ${LEVEL}, found ${before.level}.`);
      if (before.tier !== "SOLDIER") throw new Error(`${tuning.name}: expected SOLDIER tier, found ${before.tier}.`);
      if (before.legendary) throw new Error(`${tuning.name}: expected non-legendary Soldier.`);
      if (before.source !== "CAMPAIGN" || before.isReadOnly || before.campaignId !== BALANCE_CAMPAIGN_ID) {
        throw new Error(`${tuning.name}: refusing to update non-mutable or out-of-campaign row.`);
      }

      const after = await prisma.monster.update({
        where: { id: before.id },
        data: {
          physicalResilienceCurrent: tuning.physicalResilienceMax,
          physicalResilienceMax: tuning.physicalResilienceMax,
          mentalPerseveranceCurrent: tuning.mentalPerseveranceMax,
          mentalPerseveranceMax: tuning.mentalPerseveranceMax,
          physicalProtection: tuning.physicalProtection,
          mentalProtection: tuning.mentalProtection,
          naturalPhysicalProtection: tuning.naturalPhysicalProtection,
          naturalMentalProtection: tuning.naturalMentalProtection,
          guardDie: tuning.guardDie,
          guardResistDie: tuning.guardResistDie,
          guardModifier: tuning.guardModifier,
          fortitudeDie: tuning.fortitudeDie,
          fortitudeResistDie: tuning.fortitudeResistDie,
          fortitudeModifier: tuning.fortitudeModifier,
          intellectDie: tuning.intellectDie,
          intellectResistDie: tuning.intellectResistDie,
          intellectModifier: tuning.intellectModifier,
          synergyDie: tuning.synergyDie,
          synergyResistDie: tuning.synergyResistDie,
          synergyModifier: tuning.synergyModifier,
          braveryDie: tuning.braveryDie,
          braveryResistDie: tuning.braveryResistDie,
          braveryModifier: tuning.braveryModifier,
          armorSkillValue: tuning.armorSkillValue,
          armorSkillModifier: tuning.armorSkillModifier,
        },
        select: SELECT_FIELDS,
      });

      results.push({
        name: tuning.name,
        rationale: tuning.rationale,
        before: summarize(before),
        after: summarize(after),
      });
    }

    console.log("Balance Environment Soldier role ATK tuning pass 1 complete.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped durability/defence updates for five BALANCE_* Soldier-role monsters only.");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
