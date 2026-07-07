import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type PrismaClient = typeof import("../prisma/client")["prisma"];
type RoleTier = "MINION" | "ELITE" | "BOSS";
type DamageMode = "PHYSICAL" | "MENTAL";

type ApprovedRoleName =
  | "BALANCE_Minion Grunt"
  | "BALANCE_Minion Hexling"
  | "BALANCE_Minion Skirmisher"
  | "BALANCE_Minion Wailer"
  | "BALANCE_Minion Striker"
  | "BALANCE_Elite Vanguard"
  | "BALANCE_Elite Hexer"
  | "BALANCE_Elite Skirmisher"
  | "BALANCE_Elite Wailer"
  | "BALANCE_Elite Striker"
  | "BALANCE_Boss Warlord"
  | "BALANCE_Boss Hexlord"
  | "BALANCE_Boss Behemoth";

type OffenceSpec = {
  name: ApprovedRoleName;
  tier: RoleTier;
  roleIntent: string;
  attackName: string;
  attackDie: DiceSize;
  weaponSkillValue: number;
  displayedWoundsPerSuccess: number;
  rawStrength: number;
  damageType: {
    name: string;
    mode: DamageMode;
  };
};

const APPROVED_NAMES: readonly ApprovedRoleName[] = [
  "BALANCE_Minion Grunt",
  "BALANCE_Minion Hexling",
  "BALANCE_Minion Skirmisher",
  "BALANCE_Minion Wailer",
  "BALANCE_Minion Striker",
  "BALANCE_Elite Vanguard",
  "BALANCE_Elite Hexer",
  "BALANCE_Elite Skirmisher",
  "BALANCE_Elite Wailer",
  "BALANCE_Elite Striker",
  "BALANCE_Boss Warlord",
  "BALANCE_Boss Hexlord",
  "BALANCE_Boss Behemoth",
];

const SPECS: readonly OffenceSpec[] = [
  {
    name: "BALANCE_Minion Grunt",
    tier: "MINION",
    roleIntent: "Simple physical chip Minion. Should harass, not delete PCs one-on-one.",
    attackName: "BALANCE_Minion Grunt Role Strike",
    attackDie: "D6",
    weaponSkillValue: 2,
    displayedWoundsPerSuccess: 2,
    rawStrength: 1,
    damageType: { name: "Blunt", mode: "PHYSICAL" },
  },
  {
    name: "BALANCE_Minion Hexling",
    tier: "MINION",
    roleIntent: "Light mental/control Minion. Annoying chip, not lethal pressure.",
    attackName: "BALANCE_Minion Hexling Role Hex",
    attackDie: "D4",
    weaponSkillValue: 2,
    displayedWoundsPerSuccess: 2,
    rawStrength: 1,
    damageType: { name: "Fear", mode: "MENTAL" },
  },
  {
    name: "BALANCE_Minion Skirmisher",
    tier: "MINION",
    roleIntent: "Evasive/light physical pressure Minion.",
    attackName: "BALANCE_Minion Skirmisher Role Cut",
    attackDie: "D8",
    weaponSkillValue: 2,
    displayedWoundsPerSuccess: 2,
    rawStrength: 1,
    damageType: { name: "Slashing", mode: "PHYSICAL" },
  },
  {
    name: "BALANCE_Minion Wailer",
    tier: "MINION",
    roleIntent: "Mental-flavoured chip Minion.",
    attackName: "BALANCE_Minion Wailer Role Cry",
    attackDie: "D6",
    weaponSkillValue: 2,
    displayedWoundsPerSuccess: 2,
    rawStrength: 1,
    damageType: { name: "Psychic", mode: "MENTAL" },
  },
  {
    name: "BALANCE_Minion Striker",
    tier: "MINION",
    roleIntent: "Fragile higher-output Minion, still below Soldier deletion pressure.",
    attackName: "BALANCE_Minion Striker Role Claws",
    attackDie: "D8",
    weaponSkillValue: 2,
    displayedWoundsPerSuccess: 3,
    rawStrength: 1.5,
    damageType: { name: "Slashing", mode: "PHYSICAL" },
  },
  {
    name: "BALANCE_Elite Vanguard",
    tier: "ELITE",
    roleIntent: "Frontline bruiser Elite. Meaningful physical pressure, not highest spike.",
    attackName: "BALANCE_Elite Vanguard Role Strike",
    attackDie: "D8",
    weaponSkillValue: 3,
    displayedWoundsPerSuccess: 4,
    rawStrength: 2,
    damageType: { name: "Blunt", mode: "PHYSICAL" },
  },
  {
    name: "BALANCE_Elite Hexer",
    tier: "ELITE",
    roleIntent: "Mental/control Elite. Threatens fragile/support PCs through mental pressure.",
    attackName: "BALANCE_Elite Hexer Role Hex",
    attackDie: "D8",
    weaponSkillValue: 3,
    displayedWoundsPerSuccess: 4,
    rawStrength: 2,
    damageType: { name: "Fear", mode: "MENTAL" },
  },
  {
    name: "BALANCE_Elite Skirmisher",
    tier: "ELITE",
    roleIntent: "Fast/evasive Elite pressure. Many accurate lighter physical hits.",
    attackName: "BALANCE_Elite Skirmisher Role Flurry",
    attackDie: "D8",
    weaponSkillValue: 4,
    displayedWoundsPerSuccess: 3,
    rawStrength: 1.5,
    damageType: { name: "Slashing", mode: "PHYSICAL" },
  },
  {
    name: "BALANCE_Elite Wailer",
    tier: "ELITE",
    roleIntent: "Mental burst/chip Elite. Serious mental pressure without Boss-level payload.",
    attackName: "BALANCE_Elite Wailer Role Wail",
    attackDie: "D10",
    weaponSkillValue: 3,
    displayedWoundsPerSuccess: 4,
    rawStrength: 2,
    damageType: { name: "Psychic", mode: "MENTAL" },
  },
  {
    name: "BALANCE_Elite Striker",
    tier: "ELITE",
    roleIntent: "Offensive Elite. Clear physical damage benchmark for the tier.",
    attackName: "BALANCE_Elite Striker Role Claws",
    attackDie: "D10",
    weaponSkillValue: 3,
    displayedWoundsPerSuccess: 4,
    rawStrength: 2,
    damageType: { name: "Slashing", mode: "PHYSICAL" },
  },
  {
    name: "BALANCE_Boss Warlord",
    tier: "BOSS",
    roleIntent: "Serious supported physical Boss pressure.",
    attackName: "BALANCE_Boss Warlord Role Cleave",
    attackDie: "D10",
    weaponSkillValue: 4,
    displayedWoundsPerSuccess: 4,
    rawStrength: 2,
    damageType: { name: "Slashing", mode: "PHYSICAL" },
  },
  {
    name: "BALANCE_Boss Hexlord",
    tier: "BOSS",
    roleIntent: "Serious supported mental/control Boss pressure.",
    attackName: "BALANCE_Boss Hexlord Role Hexstorm",
    attackDie: "D10",
    weaponSkillValue: 4,
    displayedWoundsPerSuccess: 4,
    rawStrength: 2,
    damageType: { name: "Fear", mode: "MENTAL" },
  },
  {
    name: "BALANCE_Boss Behemoth",
    tier: "BOSS",
    roleIntent: "Heavy physical Boss hit. Big payload, lower dice count than Warlord.",
    attackName: "BALANCE_Boss Behemoth Role Slam",
    attackDie: "D12",
    weaponSkillValue: 3,
    displayedWoundsPerSuccess: 6,
    rawStrength: 3,
    damageType: { name: "Blunt", mode: "PHYSICAL" },
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
  weaponSkillValue: true,
  weaponSkillModifier: true,
  guardDie: true,
  fortitudeDie: true,
  intellectDie: true,
  synergyDie: true,
  braveryDie: true,
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

function attackConfig(spec: OffenceSpec): Prisma.InputJsonObject {
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

function summarizeOffence(row: Awaited<ReturnType<typeof findApprovedMonster>>) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    legendary: row.legendary,
    campaignId: row.campaignId,
    source: row.source,
    isReadOnly: row.isReadOnly,
    durabilityUntouchedSnapshot: {
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

function assertApprovedSpec(spec: OffenceSpec) {
  if (!APPROVED_NAMES.includes(spec.name)) throw new Error(`Internal script error: unapproved spec ${spec.name}.`);
  if (spec.name.startsWith("BALANCE_Minion ") && spec.tier !== "MINION") throw new Error(`Tier mismatch for ${spec.name}.`);
  if (spec.name.startsWith("BALANCE_Elite ") && spec.tier !== "ELITE") throw new Error(`Tier mismatch for ${spec.name}.`);
  if (spec.name.startsWith("BALANCE_Boss ") && spec.tier !== "BOSS") throw new Error(`Tier mismatch for ${spec.name}.`);
}

async function findApprovedMonster(prisma: PrismaClient, name: ApprovedRoleName) {
  return prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name },
    select: SELECT_FIELDS,
  });
}

async function updateOffencePackage(prisma: PrismaClient, spec: OffenceSpec) {
  assertApprovedSpec(spec);
  const matches = await prisma.monster.findMany({
    where: { campaignId: BALANCE_CAMPAIGN_ID, name: spec.name },
    select: { id: true, name: true, tier: true, legendary: true, source: true, isReadOnly: true, campaignId: true },
  });
  if (matches.length !== 1) {
    throw new Error(`Refusing ${spec.name}: expected exactly one Balance Environment row, found ${matches.length}.`);
  }
  const match = matches[0];
  if (match.source !== "CAMPAIGN" || match.isReadOnly || match.campaignId !== BALANCE_CAMPAIGN_ID) {
    throw new Error(`Refusing ${spec.name}: row is read-only, non-campaign, or out of campaign scope.`);
  }
  if (match.legendary) {
    throw new Error(`Refusing ${spec.name}: Legendary assets are out of scope for this pass.`);
  }
  if (match.tier !== spec.tier) {
    throw new Error(`Refusing ${spec.name}: expected tier ${spec.tier}, found ${match.tier}.`);
  }

  const before = await findApprovedMonster(prisma, spec.name);
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
  const after = await findApprovedMonster(prisma, spec.name);
  return {
    name: spec.name,
    tier: spec.tier,
    roleIntent: spec.roleIntent,
    authoredOffence: {
      attackName: spec.attackName,
      dice: `${spec.weaponSkillValue}x${spec.attackDie}`,
      displayedWoundsPerSuccess: spec.displayedWoundsPerSuccess,
      rawStrength: spec.rawStrength,
      channel: spec.damageType.mode.toLowerCase(),
      cooldown: 0,
      placeholderReplaced: before?.naturalAttack?.attackName
        ? /placeholder/i.test(before.naturalAttack.attackName)
        : before?.attacks.some((attack) => /placeholder/i.test(attack.attackName ?? "")) ?? false,
    },
    before: summarizeOffence(before),
    after: summarizeOffence(after),
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

    const approvedRows = await prisma.monster.findMany({
      where: { campaignId: BALANCE_CAMPAIGN_ID, name: { in: [...APPROVED_NAMES] } },
      select: { name: true },
    });
    const missing = APPROVED_NAMES.filter((name) => !approvedRows.some((row) => row.name === name));
    if (missing.length > 0) {
      throw new Error(`Refusing to proceed: missing approved Balance Environment assets: ${missing.join(", ")}.`);
    }

    const results = [];
    for (const spec of SPECS) {
      results.push(await updateOffencePackage(prisma, spec));
    }

    console.log("Balance Environment incoming offence role packages ensured.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped offence package updates for approved Minion, Elite, and normal Boss role assets only.");
    console.log("Updated fields: Monster.attackMode, Monster.attackDie, Monster.attackModifier, Monster.weaponSkillValue, Monster.weaponSkillModifier, MonsterAttack rows, MonsterNaturalAttack row.");
    console.log("No player, Soldier, Legendary, durability, protection, defence, calibration, non-Balance-Environment, runtime, formula, scalar, tuning, UI, or docs values were changed by this script.");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
