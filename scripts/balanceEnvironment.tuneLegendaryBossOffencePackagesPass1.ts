import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type DamageMode = "PHYSICAL" | "MENTAL";
type LegendaryBossName = "BALANCE_Legendary Dragon" | "BALANCE_Legendary Lich";
type PrismaClient = typeof import("../prisma/client")["prisma"];

type OffenceSpec = {
  name: LegendaryBossName;
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

const APPROVED_LEGENDARY_BOSS_NAMES: readonly LegendaryBossName[] = [
  "BALANCE_Legendary Dragon",
  "BALANCE_Legendary Lich",
];

const SPECS: readonly OffenceSpec[] = [
  {
    name: "BALANCE_Legendary Dragon",
    attackName: "BALANCE_Legendary Dragon Rending Sweep",
    roleIntent: "First-pass Legendary Dragon physical multi-target pressure using existing natural attack mechanics.",
    attackDie: "D12",
    weaponSkillValue: 4,
    targets: 2,
    rawStrength: 2,
    damageType: { name: "Slashing", mode: "PHYSICAL" },
  },
  {
    name: "BALANCE_Legendary Lich",
    attackName: "BALANCE_Legendary Lich Necrotic Command",
    roleIntent: "First-pass Legendary Lich focused mental pressure using existing natural attack mechanics.",
    attackDie: "D10",
    weaponSkillValue: 4,
    targets: 1,
    rawStrength: 2,
    damageType: { name: "Necrotic", mode: "MENTAL" },
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
  guardModifier: true,
  fortitudeDie: true,
  fortitudeModifier: true,
  intellectDie: true,
  intellectModifier: true,
  synergyDie: true,
  synergyModifier: true,
  braveryDie: true,
  braveryModifier: true,
  armorSkillValue: true,
  armorSkillModifier: true,
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
  if (!APPROVED_LEGENDARY_BOSS_NAMES.includes(spec.name)) {
    throw new Error(`Internal script error: unapproved Legendary Boss spec ${spec.name}.`);
  }
}

function durabilitySnapshot(row: NonNullable<Awaited<ReturnType<typeof findLegendaryBoss>>>) {
  return {
    physicalHp: `${row.physicalResilienceCurrent}/${row.physicalResilienceMax}`,
    mentalHp: `${row.mentalPerseveranceCurrent}/${row.mentalPerseveranceMax}`,
    physicalProtection: row.physicalProtection,
    mentalProtection: row.mentalProtection,
    naturalPhysicalProtection: row.naturalPhysicalProtection,
    naturalMentalProtection: row.naturalMentalProtection,
    guardDie: row.guardDie,
    guardModifier: row.guardModifier,
    fortitudeDie: row.fortitudeDie,
    fortitudeModifier: row.fortitudeModifier,
    intellectDie: row.intellectDie,
    intellectModifier: row.intellectModifier,
    synergyDie: row.synergyDie,
    synergyModifier: row.synergyModifier,
    braveryDie: row.braveryDie,
    braveryModifier: row.braveryModifier,
    armorSkillValue: row.armorSkillValue,
    armorSkillModifier: row.armorSkillModifier,
  };
}

function summarize(row: Awaited<ReturnType<typeof findLegendaryBoss>>) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    campaignId: row.campaignId,
    source: row.source,
    isReadOnly: row.isReadOnly,
    tier: row.tier,
    legendary: row.legendary,
    durabilityUntouchedSnapshot: durabilitySnapshot(row),
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

function assertDurabilityUnchanged(
  before: NonNullable<Awaited<ReturnType<typeof findLegendaryBoss>>>,
  after: NonNullable<Awaited<ReturnType<typeof findLegendaryBoss>>>,
) {
  const beforeDurability = JSON.stringify(durabilitySnapshot(before));
  const afterDurability = JSON.stringify(durabilitySnapshot(after));
  if (beforeDurability !== afterDurability) {
    throw new Error(`Refusing ${before.name}: durability/protection/defence fields changed unexpectedly.`);
  }
  if (before.tier !== after.tier || before.legendary !== after.legendary) {
    throw new Error(`Refusing ${before.name}: tier or legendary flag changed unexpectedly.`);
  }
}

async function findLegendaryBoss(prisma: PrismaClient, name: LegendaryBossName) {
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

async function updateLegendaryBossOffence(prisma: PrismaClient, spec: OffenceSpec) {
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
  if (!match.legendary) {
    throw new Error(`Refusing ${spec.name}: expected legendary=true.`);
  }

  const before = await findLegendaryBoss(prisma, spec.name);
  if (!before) throw new Error(`Refusing ${spec.name}: scoped Legendary Boss row vanished before update.`);
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

  const after = await findLegendaryBoss(prisma, spec.name);
  if (!after) throw new Error(`Scoped Legendary Boss row vanished after updating ${spec.name}.`);
  assertDurabilityUnchanged(before, after);

  return {
    name: spec.name,
    roleIntent: spec.roleIntent,
    changedFields: [
      "Monster.attackMode",
      "Monster.attackDie",
      "Monster.attackModifier",
      "Monster.weaponSkillValue",
      "Monster.weaponSkillModifier",
      "MonsterAttack row",
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
      replacedPlaceholder: Boolean(
        before.naturalAttack?.attackName.match(/placeholder/i) ||
          before.attacks.some((attack) => attack.attackName?.match(/placeholder/i)),
      ),
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

    const accidentalRows = await prisma.monster.findMany({
      where: {
        campaignId: BALANCE_CAMPAIGN_ID,
        OR: [
          { name: { startsWith: "BALANCE_Boss " } },
          { name: { startsWith: "BALANCE_Legendary " } },
        ],
        NOT: { name: { in: [...APPROVED_LEGENDARY_BOSS_NAMES] } },
      },
      select: { id: true, name: true },
    });
    const unapprovedLegendaryBosses = accidentalRows.filter((row) =>
      row.name === "BALANCE_Boss Warlord" ||
      row.name === "BALANCE_Boss Hexlord" ||
      row.name === "BALANCE_Boss Behemoth" ||
      row.name.startsWith("BALANCE_Legendary Elite "),
    );
    if (unapprovedLegendaryBosses.length !== accidentalRows.length) {
      throw new Error(
        `Refusing to proceed: found unapproved Boss/Legendary rows in Balance Environment: ${accidentalRows
          .map((row) => `${row.name} (${row.id})`)
          .join(", ")}.`,
      );
    }

    const results = [];
    for (const spec of SPECS) {
      results.push(await updateLegendaryBossOffence(prisma, spec));
    }

    console.log("Balance Environment Legendary Boss offence packages pass 1 applied.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped offence-only updates for Dragon and Lich Legendary Boss assets.");
    console.log("No HP, durability, protection, defence, tier, legendary flag, normal Boss, player, runtime, formula, scalar, tuning, UI, docs, seeder, migration, or new-mechanic changes were made by this script.");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
