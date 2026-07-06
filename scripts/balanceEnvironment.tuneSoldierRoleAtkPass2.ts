import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;
const OFFICIAL_RULER = "BALANCE_ATK_L3_AttackString_4D8_W2";

type SoldierPass2Tuning = {
  name: "BALANCE_Durable Soldier" | "BALANCE_Dodge Pressure Skirmisher";
  rationale: string;
  data: {
    physicalResilienceCurrent?: number;
    physicalResilienceMax?: number;
    mentalPerseveranceCurrent?: number;
    mentalPerseveranceMax?: number;
  };
};

const TUNING: SoldierPass2Tuning[] = [
  {
    name: "BALANCE_Durable Soldier",
    rationale: "Raise mental durability from the pass-1 ~3.14 ATK result toward the durable Soldier 4-6 target while preserving physical durability.",
    data: {
      mentalPerseveranceCurrent: 20,
      mentalPerseveranceMax: 20,
    },
  },
  {
    name: "BALANCE_Dodge Pressure Skirmisher",
    rationale: "Trim physical durability from the pass-1 ~6.63 ATK result toward the evasive Soldier 5-6 soft ceiling while preserving mental durability and evasive identity.",
    data: {
      physicalResilienceCurrent: 20,
      physicalResilienceMax: 20,
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
        data: tuning.data,
        select: SELECT_FIELDS,
      });

      results.push({
        name: tuning.name,
        officialRuler: OFFICIAL_RULER,
        rationale: tuning.rationale,
        changedFields: tuning.data,
        before: summarize(before),
        after: summarize(after),
      });
    }

    console.log("Balance Environment Soldier role ATK tuning pass 2 complete.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log(`officialRoleComparisonRuler: ${OFFICIAL_RULER}`);
    console.log("DB mutation: scoped durability-only updates for BALANCE_Durable Soldier and BALANCE_Dodge Pressure Skirmisher.");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
