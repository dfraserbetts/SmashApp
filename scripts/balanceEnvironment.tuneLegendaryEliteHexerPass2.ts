import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const HEXER_NAME = "BALANCE_Legendary Elite Hexer";
const HEXER_ATTACK_NAME = "BALANCE_Legendary Elite Hexer Role Hex";

type PrismaClient = typeof import("../prisma/client")["prisma"];

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
  attackMode: true,
  attackDie: true,
  attackModifier: true,
  guardDie: true,
  fortitudeDie: true,
  intellectDie: true,
  synergyDie: true,
  braveryDie: true,
  weaponSkillValue: true,
  weaponSkillModifier: true,
  armorSkillValue: true,
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
} as const;

function hexerAttackConfig(): Prisma.InputJsonObject {
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: 0,
      mentalStrength: 1.5,
      damageTypes: [{ name: "Fear", mode: "MENTAL" }],
      attackEffects: [],
    },
  };
}

async function findHexer(prisma: PrismaClient) {
  return prisma.monster.findFirst({
    where: {
      campaignId: BALANCE_CAMPAIGN_ID,
      source: "CAMPAIGN",
      isReadOnly: false,
      name: HEXER_NAME,
    },
    select: SELECT_FIELDS,
  });
}

function summarize(row: Awaited<ReturnType<typeof findHexer>>) {
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
    hpUntouchedSnapshot: {
      physical: `${row.physicalResilienceCurrent}/${row.physicalResilienceMax}`,
      mental: `${row.mentalPerseveranceCurrent}/${row.mentalPerseveranceMax}`,
    },
    defenceUntouchedSnapshot: {
      physicalProtection: row.physicalProtection,
      mentalProtection: row.mentalProtection,
      naturalPhysicalProtection: row.naturalPhysicalProtection,
      naturalMentalProtection: row.naturalMentalProtection,
      guardDie: row.guardDie,
      fortitudeDie: row.fortitudeDie,
      intellectDie: row.intellectDie,
      synergyDie: row.synergyDie,
      braveryDie: row.braveryDie,
      armorSkillValue: row.armorSkillValue,
    },
    offence: {
      attackMode: row.attackMode,
      attackDie: row.attackDie,
      attackModifier: row.attackModifier,
      weaponSkillValue: row.weaponSkillValue,
      weaponSkillModifier: row.weaponSkillModifier,
      naturalAttack: row.naturalAttack,
      attacks: row.attacks,
    },
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
      where: { campaignId: BALANCE_CAMPAIGN_ID, name: HEXER_NAME },
      select: { id: true, name: true, tier: true, legendary: true, source: true, isReadOnly: true, campaignId: true },
    });
    if (matches.length !== 1) {
      throw new Error(`Refusing ${HEXER_NAME}: expected exactly one Balance Environment row, found ${matches.length}.`);
    }
    const match = matches[0];
    if (match.source !== "CAMPAIGN" || match.isReadOnly || match.campaignId !== BALANCE_CAMPAIGN_ID) {
      throw new Error(`Refusing ${HEXER_NAME}: row is read-only, non-campaign, or out of campaign scope.`);
    }
    if (match.tier !== "ELITE" || !match.legendary) {
      throw new Error(`Refusing ${HEXER_NAME}: expected tier ELITE and legendary true.`);
    }

    const accidentalLegendaryEliteRows = await prisma.monster.findMany({
      where: {
        campaignId: BALANCE_CAMPAIGN_ID,
        name: { startsWith: "BALANCE_Legendary Elite " },
        NOT: { name: HEXER_NAME },
      },
      select: { id: true, name: true },
    });
    const unapprovedLegendaryEliteRows = accidentalLegendaryEliteRows.filter(
      (row) => row.name !== "BALANCE_Legendary Elite Duelist",
    );
    if (unapprovedLegendaryEliteRows.length > 0) {
      throw new Error(
        `Refusing to proceed: found unapproved BALANCE_Legendary Elite rows: ${
          unapprovedLegendaryEliteRows.map((row) => `${row.name} (${row.id})`).join(", ")
        }.`,
      );
    }

    const before = await findHexer(prisma);
    const config = hexerAttackConfig();
    await prisma.$transaction(async (tx) => {
      await tx.monster.update({
        where: { id: match.id },
        data: {
          attackMode: "NATURAL_WEAPON",
          attackDie: "D10",
          attackModifier: 0,
          weaponSkillValue: 2,
          weaponSkillModifier: 0,
        },
      });
      await tx.monsterAttack.deleteMany({ where: { monsterId: match.id } });
      await tx.monsterAttack.create({
        data: {
          monsterId: match.id,
          sortOrder: 0,
          attackMode: "NATURAL",
          attackName: HEXER_ATTACK_NAME,
          attackConfig: config,
          equippedWeaponId: null,
        },
      });
      await tx.monsterNaturalAttack.upsert({
        where: { monsterId: match.id },
        create: {
          monsterId: match.id,
          attackName: HEXER_ATTACK_NAME,
          attackConfig: config,
        },
        update: {
          attackName: HEXER_ATTACK_NAME,
          attackConfig: config,
        },
      });
    });
    const after = await findHexer(prisma);

    console.log("Balance Environment Legendary Elite Hexer tuning pass 2 applied.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped offence update for BALANCE_Legendary Elite Hexer only.");
    console.log("Updated fields: Monster.attackMode, Monster.attackDie, Monster.attackModifier, Monster.weaponSkillValue, Monster.weaponSkillModifier, MonsterAttack row, MonsterNaturalAttack row.");
    console.log("Intended movement: 3xD10 mental W/S3 -> 2xD10 mental W/S3.");
    console.log("No Duelist, player, Soldier, normal Elite, normal Boss, Minion, Legendary Dragon/Lich, calibration, durability, protection, defence, runtime, formula, scalar, tuning, UI, or docs values were changed by this script.");
    console.log(JSON.stringify({
      name: HEXER_NAME,
      reason: "Pass 2 reduces Hexer mental pressure by lowering dice count from 3xD10 to 2xD10 while preserving D10 mental identity and W/S3.",
      fieldChanges: {
        attackDie: "D10",
        weaponSkillValue: 2,
        displayedWoundsPerSuccess: 3,
        rawStrength: 1.5,
        channel: "mental",
      },
      before: summarize(before),
      after: summarize(after),
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message ?? error.stack : String(error));
  process.exitCode = 1;
});
