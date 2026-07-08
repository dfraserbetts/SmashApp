import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type DamageMode = "PHYSICAL" | "MENTAL";
type BossName =
  | "BALANCE_Boss Warlord"
  | "BALANCE_Boss Hexlord"
  | "BALANCE_Boss Behemoth";
type PrismaClient = typeof import("../prisma/client")["prisma"];

type OffenceSpec = {
  name: BossName;
  attackName: string;
  roleIntent: string;
  attackDie: DiceSize;
  weaponSkillValue: number;
  targets: number;
  rawStrength: number;
  damageType: {
    name: string;
    mode: DamageMode;
  };
};

const APPROVED_BOSS_NAMES: readonly BossName[] = [
  "BALANCE_Boss Warlord",
  "BALANCE_Boss Hexlord",
  "BALANCE_Boss Behemoth",
];

const SPECS: readonly OffenceSpec[] = [
  {
    name: "BALANCE_Boss Warlord",
    attackName: "BALANCE_Boss Warlord Command Cleave",
    roleIntent: "Physical/martial supported Boss pressure; cleaves two nearby PCs using existing target-count mechanics.",
    attackDie: "D12",
    weaponSkillValue: 4,
    targets: 2,
    rawStrength: 3,
    damageType: { name: "Slashing", mode: "PHYSICAL" },
  },
  {
    name: "BALANCE_Boss Hexlord",
    attackName: "BALANCE_Boss Hexlord Mindbreak Hex",
    roleIntent: "Mental supported Boss pressure; spreads mental threat to two PCs without adding new mechanics.",
    attackDie: "D10",
    weaponSkillValue: 4,
    targets: 2,
    rawStrength: 2.5,
    damageType: { name: "Fear", mode: "MENTAL" },
  },
  {
    name: "BALANCE_Boss Behemoth",
    attackName: "BALANCE_Boss Behemoth Crushing Slam",
    roleIntent: "Heavy single-target physical Boss pressure; bigger payload without changing durability.",
    attackDie: "D12",
    weaponSkillValue: 4,
    targets: 1,
    rawStrength: 4,
    damageType: { name: "Blunt", mode: "PHYSICAL" },
  },
];

const SELECT_FIELDS = {
  id: true,
  name: true,
  campaignId: true,
  source: true,
  isReadOnly: true,
  tier: true,
  legendary: true,
  physicalResilienceCurrent: true,
  physicalResilienceMax: true,
  mentalPerseveranceCurrent: true,
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
  attackMode: true,
  attackDie: true,
  attackModifier: true,
  weaponSkillValue: true,
  weaponSkillModifier: true,
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
      equippedWeaponId: true,
    },
  },
} as const;

function attackConfig(spec: OffenceSpec): Prisma.InputJsonObject {
  const mental = spec.damageType.mode === "MENTAL";
  return {
    melee: {
      enabled: true,
      targets: spec.targets,
      physicalStrength: mental ? 0 : spec.rawStrength,
      mentalStrength: mental ? spec.rawStrength : 0,
      damageTypes: [spec.damageType],
      attackEffects: [],
    },
  };
}

function assertApprovedSpec(spec: OffenceSpec) {
  if (!APPROVED_BOSS_NAMES.includes(spec.name)) {
    throw new Error(`Internal script error: unapproved Boss spec ${spec.name}.`);
  }
}

function summarize(row: Awaited<ReturnType<typeof findBoss>>) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    campaignId: row.campaignId,
    source: row.source,
    isReadOnly: row.isReadOnly,
    tier: row.tier,
    legendary: row.legendary,
    durabilitySnapshot: {
      physicalHp: `${row.physicalResilienceCurrent}/${row.physicalResilienceMax}`,
      mentalHp: `${row.mentalPerseveranceCurrent}/${row.mentalPerseveranceMax}`,
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

async function findBoss(prisma: PrismaClient, name: BossName) {
  return prisma.monster.findFirst({
    where: {
      campaignId: BALANCE_CAMPAIGN_ID,
      source: "CAMPAIGN",
      isReadOnly: false,
      name,
    },
    select: SELECT_FIELDS,
  });
}

async function updateBossOffence(prisma: PrismaClient, spec: OffenceSpec) {
  assertApprovedSpec(spec);
  const matches = await prisma.monster.findMany({
    where: { campaignId: BALANCE_CAMPAIGN_ID, name: spec.name },
    select: {
      id: true,
      name: true,
      campaignId: true,
      source: true,
      isReadOnly: true,
      tier: true,
      legendary: true,
    },
  });
  if (matches.length !== 1) {
    throw new Error(`Refusing ${spec.name}: expected exactly one Balance Environment row, found ${matches.length}.`);
  }
  const match = matches[0];
  if (match.campaignId !== BALANCE_CAMPAIGN_ID || match.source !== "CAMPAIGN" || match.isReadOnly) {
    throw new Error(`Refusing ${spec.name}: row is read-only, non-campaign, or out of Balance Environment scope.`);
  }
  if (match.tier !== "BOSS") {
    throw new Error(`Refusing ${spec.name}: expected BOSS tier, found ${match.tier}.`);
  }
  if (match.legendary) {
    throw new Error(`Refusing ${spec.name}: Legendary assets are deferred to a separate pass.`);
  }

  const before = await findBoss(prisma, spec.name);
  if (!before) throw new Error(`Refusing ${spec.name}: scoped Boss row vanished before update.`);
  const config = attackConfig(spec);
  const existingPrimaryAttack = await prisma.monsterAttack.findFirst({
    where: { monsterId: match.id, sortOrder: 0 },
    select: { id: true },
  });

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

    await tx.monsterAttack.deleteMany({
      where: {
        monsterId: match.id,
        NOT: { id: existingPrimaryAttack?.id ?? "__missing_primary_attack__" },
      },
    });
    if (existingPrimaryAttack) {
      await tx.monsterAttack.update({
        where: { id: existingPrimaryAttack.id },
        data: {
          sortOrder: 0,
          attackMode: "NATURAL",
          attackName: spec.attackName,
          attackConfig: config,
          equippedWeaponId: null,
        },
      });
    } else {
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
    }
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

  const after = await findBoss(prisma, spec.name);
  return {
    name: spec.name,
    roleIntent: spec.roleIntent,
    changedFields: [
      "Monster.attackMode",
      "Monster.attackDie",
      "Monster.attackModifier",
      "Monster.weaponSkillValue",
      "Monster.weaponSkillModifier",
      "MonsterAttack rows",
      "MonsterNaturalAttack row",
    ],
    authoredOffence: {
      attackName: spec.attackName,
      dice: `${spec.weaponSkillValue}x${spec.attackDie}`,
      targets: spec.targets,
      rawStrength: spec.rawStrength,
      woundsPerSuccess: spec.rawStrength * 2,
      channel: spec.damageType.mode.toLowerCase(),
      damageType: spec.damageType.name,
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

    const unexpected = await prisma.monster.findMany({
      where: {
        campaignId: BALANCE_CAMPAIGN_ID,
        name: { startsWith: "BALANCE_Boss " },
        NOT: { name: { in: [...APPROVED_BOSS_NAMES] } },
      },
      select: { id: true, name: true },
    });
    if (unexpected.length > 0) {
      throw new Error(
        `Refusing to proceed: unapproved BALANCE_Boss rows found: ${unexpected
          .map((row) => `${row.name} (${row.id})`)
          .join(", ")}.`,
      );
    }

    const results = [];
    for (const spec of SPECS) {
      results.push(await updateBossOffence(prisma, spec));
    }

    console.log("Balance Environment Boss offence packages pass 1 applied.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped offence-only updates for three approved normal Boss assets.");
    console.log("No HP, durability, protection, defence, tier, legendary flag, player, runtime, formula, scalar, tuning, UI, docs, or new-mechanic changes were made by this script.");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
