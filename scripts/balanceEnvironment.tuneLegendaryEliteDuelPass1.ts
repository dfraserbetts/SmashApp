import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type PrismaClient = typeof import("../prisma/client")["prisma"];
type LegendaryEliteName = "BALANCE_Legendary Elite Duelist" | "BALANCE_Legendary Elite Hexer";
type DamageMode = "PHYSICAL" | "MENTAL";

type TuneSpec = {
  name: LegendaryEliteName;
  reason: string;
  attackDie: DiceSize;
  weaponSkillValue: number;
  rawStrength: number;
  displayedWoundsPerSuccess: number;
  damageType: {
    name: string;
    mode: DamageMode;
  };
  attackName: string;
};

const TUNED_NAMES: readonly LegendaryEliteName[] = [
  "BALANCE_Legendary Elite Duelist",
  "BALANCE_Legendary Elite Hexer",
];

const SPECS: readonly TuneSpec[] = [
  {
    name: "BALANCE_Legendary Elite Duelist",
    reason: "Pass 1 shifts physical pressure from 3xD10 W/S4 to 4xD10 W/S3 for more reliability into ranged PCs and slightly less per-success spike.",
    attackName: "BALANCE_Legendary Elite Duelist Role Blade",
    attackDie: "D10",
    weaponSkillValue: 4,
    rawStrength: 1.5,
    displayedWoundsPerSuccess: 3,
    damageType: { name: "Slashing", mode: "PHYSICAL" },
  },
  {
    name: "BALANCE_Legendary Elite Hexer",
    reason: "Pass 1 reduces mental pressure from 3xD10 W/S4 to 3xD10 W/S3 while preserving the mental/control identity.",
    attackName: "BALANCE_Legendary Elite Hexer Role Hex",
    attackDie: "D10",
    weaponSkillValue: 3,
    rawStrength: 1.5,
    displayedWoundsPerSuccess: 3,
    damageType: { name: "Fear", mode: "MENTAL" },
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

function attackConfig(spec: TuneSpec): Prisma.InputJsonObject {
  const mental = spec.damageType.mode === "MENTAL";
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: mental ? 0 : spec.rawStrength,
      mentalStrength: mental ? spec.rawStrength : 0,
      damageTypes: [spec.damageType],
      attackEffects: [],
    },
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

async function findMonster(prisma: PrismaClient, name: LegendaryEliteName) {
  return prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name },
    select: SELECT_FIELDS,
  });
}

async function tuneMonster(prisma: PrismaClient, spec: TuneSpec) {
  const matches = await prisma.monster.findMany({
    where: { campaignId: BALANCE_CAMPAIGN_ID, name: spec.name },
    select: { id: true, name: true, tier: true, legendary: true, source: true, isReadOnly: true, campaignId: true },
  });
  if (matches.length !== 1) {
    throw new Error(`Refusing ${spec.name}: expected exactly one Balance Environment row, found ${matches.length}.`);
  }
  const match = matches[0];
  if (!TUNED_NAMES.includes(match.name as LegendaryEliteName)) {
    throw new Error(`Refusing unapproved Legendary Elite duel asset: ${match.name}.`);
  }
  if (match.source !== "CAMPAIGN" || match.isReadOnly || match.campaignId !== BALANCE_CAMPAIGN_ID) {
    throw new Error(`Refusing ${spec.name}: row is read-only, non-campaign, or out of campaign scope.`);
  }
  if (match.tier !== "ELITE" || !match.legendary) {
    throw new Error(`Refusing ${spec.name}: expected tier ELITE and legendary true.`);
  }

  const before = await findMonster(prisma, spec.name);
  const config = attackConfig(spec);
  await prisma.$transaction(async (tx) => {
    await tx.monster.update({
      where: { id: match.id },
      data: {
        attackMode: "NATURAL_WEAPON",
        attackDie: spec.attackDie,
        attackModifier: 0,
        weaponSkillValue: spec.weaponSkillValue,
        weaponSkillModifier: 0,
      },
    });
    await tx.monsterAttack.deleteMany({ where: { monsterId: match.id } });
    await tx.monsterAttack.create({
      data: {
        monsterId: match.id,
        sortOrder: 0,
        attackMode: "NATURAL",
        attackName: spec.attackName,
        attackConfig: config,
        equippedWeaponId: null,
      },
    });
    await tx.monsterNaturalAttack.upsert({
      where: { monsterId: match.id },
      create: {
        monsterId: match.id,
        attackName: spec.attackName,
        attackConfig: config,
      },
      update: {
        attackName: spec.attackName,
        attackConfig: config,
      },
    });
  });
  const after = await findMonster(prisma, spec.name);
  return {
    name: spec.name,
    reason: spec.reason,
    fieldChanges: {
      attackDie: spec.attackDie,
      weaponSkillValue: spec.weaponSkillValue,
      displayedWoundsPerSuccess: spec.displayedWoundsPerSuccess,
      rawStrength: spec.rawStrength,
      channel: spec.damageType.mode.toLowerCase(),
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
        NOT: { name: { in: [...TUNED_NAMES] } },
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
      results.push(await tuneMonster(prisma, spec));
    }

    console.log("Balance Environment Legendary Elite duel tuning pass 1 applied.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped offence updates for BALANCE_Legendary Elite Duelist and BALANCE_Legendary Elite Hexer only.");
    console.log("Updated fields: Monster.attackMode, Monster.attackDie, Monster.attackModifier, Monster.weaponSkillValue, Monster.weaponSkillModifier, MonsterAttack rows, MonsterNaturalAttack row.");
    console.log("No player, Soldier, normal Elite, normal Boss, Minion, Legendary Dragon/Lich, calibration, runtime, formula, scalar, tuning, UI, or docs values were changed by this script.");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message ?? error.stack : String(error));
  process.exitCode = 1;
});
