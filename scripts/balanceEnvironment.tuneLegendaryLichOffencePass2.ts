import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const TARGET_NAME = "BALANCE_Legendary Lich";
const TARGET_ATTACK_NAME = "BALANCE_Legendary Lich Necrotic Command";

type PrismaClient = typeof import("../prisma/client")["prisma"];

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
      id: true,
      sortOrder: true,
      attackMode: true,
      attackName: true,
      attackConfig: true,
      equippedWeaponId: true,
    },
  },
} as const;

type LichRow = NonNullable<Awaited<ReturnType<typeof findLich>>>;

function attackConfig(): Prisma.InputJsonObject {
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: 0,
      mentalStrength: 2.5,
      damageTypes: [{ name: "Necrotic", mode: "MENTAL" }],
      attackEffects: [],
    },
  };
}

function durabilitySnapshot(row: LichRow) {
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

function summarize(row: LichRow | null) {
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

function assertDurabilityUnchanged(before: LichRow, after: LichRow) {
  const beforeDurability = JSON.stringify(durabilitySnapshot(before));
  const afterDurability = JSON.stringify(durabilitySnapshot(after));
  if (beforeDurability !== afterDurability) {
    throw new Error("Refusing Lich pass 2: durability/protection/defence fields changed unexpectedly.");
  }
  if (before.tier !== after.tier || before.legendary !== after.legendary) {
    throw new Error("Refusing Lich pass 2: tier or legendary flag changed unexpectedly.");
  }
}

async function findLich(prisma: PrismaClient) {
  return prisma.monster.findFirst({
    where: {
      campaignId: BALANCE_CAMPAIGN_ID,
      source: "CAMPAIGN",
      isReadOnly: false,
      name: TARGET_NAME,
    },
    select: SELECT_FIELDS,
  });
}

function readMelee(config: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Expected attackConfig JSON object.");
  }
  const melee = config.melee;
  if (!melee || typeof melee !== "object" || Array.isArray(melee)) {
    throw new Error("Expected attackConfig.melee JSON object.");
  }
  return melee as Prisma.JsonObject;
}

function assertScopedLich(row: LichRow) {
  if (row.campaignId !== BALANCE_CAMPAIGN_ID || row.source !== "CAMPAIGN" || row.isReadOnly) {
    throw new Error("Refusing Lich pass 2: row is read-only, non-campaign, or out of Balance Environment scope.");
  }
  if (row.name !== TARGET_NAME) throw new Error(`Refusing Lich pass 2: expected ${TARGET_NAME}, found ${row.name}.`);
  if (row.tier !== "BOSS") throw new Error(`Refusing Lich pass 2: expected BOSS tier, found ${row.tier}.`);
  if (!row.legendary) throw new Error("Refusing Lich pass 2: expected legendary=true.");
}

function assertExpectedOffenceShape(row: LichRow) {
  if (row.attackMode !== "NATURAL_WEAPON") {
    throw new Error(`Refusing Lich pass 2: expected NATURAL_WEAPON, found ${row.attackMode}.`);
  }
  if (row.attackDie !== "D10" || row.weaponSkillValue !== 4 || row.attackModifier !== 0 || row.weaponSkillModifier !== 0) {
    throw new Error(
      `Refusing Lich pass 2: expected 4xD10 with zero modifiers, found ${row.weaponSkillValue}x${row.attackDie} attackModifier=${row.attackModifier} weaponSkillModifier=${row.weaponSkillModifier}.`,
    );
  }
  if (row.attacks.length !== 1) {
    throw new Error(`Refusing Lich pass 2: expected exactly one MonsterAttack row, found ${row.attacks.length}.`);
  }
  if (!row.naturalAttack) throw new Error("Refusing Lich pass 2: missing MonsterNaturalAttack row.");
  for (const [label, config] of [
    ["MonsterNaturalAttack", row.naturalAttack.attackConfig],
    ["MonsterAttack", row.attacks[0]?.attackConfig],
  ] as const) {
    const melee = readMelee(config);
    if (melee.enabled !== true) throw new Error(`Refusing Lich pass 2: ${label}.melee.enabled is not true.`);
    if (melee.targets !== 1) throw new Error(`Refusing Lich pass 2: ${label}.melee.targets expected 1, found ${String(melee.targets)}.`);
    if (melee.physicalStrength !== 0) {
      throw new Error(`Refusing Lich pass 2: ${label}.melee.physicalStrength expected 0, found ${String(melee.physicalStrength)}.`);
    }
    if (typeof melee.mentalStrength !== "number" || ![2, 2.5].includes(melee.mentalStrength)) {
      throw new Error(`Refusing Lich pass 2: ${label}.melee.mentalStrength expected 2 or 2.5, found ${String(melee.mentalStrength)}.`);
    }
    const damageTypes = melee.damageTypes;
    if (!Array.isArray(damageTypes) || damageTypes.length !== 1) {
      throw new Error(`Refusing Lich pass 2: ${label}.melee.damageTypes must contain exactly one type.`);
    }
    const damageType = damageTypes[0];
    if (
      !damageType ||
      typeof damageType !== "object" ||
      Array.isArray(damageType) ||
      damageType.name !== "Necrotic" ||
      damageType.mode !== "MENTAL"
    ) {
      throw new Error(`Refusing Lich pass 2: ${label}.melee.damageTypes must be mental Necrotic.`);
    }
  }
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
      where: { campaignId: BALANCE_CAMPAIGN_ID, name: TARGET_NAME },
      select: { id: true, name: true },
    });
    if (matches.length !== 1) {
      throw new Error(`Refusing Lich pass 2: expected exactly one scoped Lich row, found ${matches.length}.`);
    }

    const before = await findLich(prisma);
    if (!before) throw new Error("Refusing Lich pass 2: scoped Lich row was not found.");
    assertScopedLich(before);
    assertExpectedOffenceShape(before);

    const config = attackConfig();
    const primaryAttack = before.attacks[0];
    if (!primaryAttack) throw new Error("Refusing Lich pass 2: primary MonsterAttack row is missing.");

    await prisma.$transaction(async (tx) => {
      await tx.monster.update({
        where: { id: before.id },
        data: {
          attackMode: "NATURAL_WEAPON",
          attackDie: "D10",
          attackModifier: 0,
          weaponSkillValue: 4,
          weaponSkillModifier: 0,
        },
      });
      await tx.monsterAttack.update({
        where: { id: primaryAttack.id },
        data: {
          sortOrder: 0,
          attackMode: "NATURAL",
          attackName: TARGET_ATTACK_NAME,
          attackConfig: config,
          equippedWeaponId: null,
        },
      });
      await tx.monsterNaturalAttack.update({
        where: { monsterId: before.id },
        data: {
          attackName: TARGET_ATTACK_NAME,
          attackConfig: config,
        },
      });
    });

    const after = await findLich(prisma);
    if (!after) throw new Error("Scoped Lich row vanished after pass 2 update.");
    assertScopedLich(after);
    assertExpectedOffenceShape(after);
    assertDurabilityUnchanged(before, after);

    console.log("Balance Environment Legendary Lich offence pass 2 applied.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped offence-only update for BALANCE_Legendary Lich.");
    console.log("No Dragon, normal Boss, player, HP, durability, protection, defence, tier, legendary flag, runtime, formula, scalar, tuning, UI, docs, seeder, migration, or new-mechanic changes were made by this script.");
    console.log(
      JSON.stringify(
        {
          asset: TARGET_NAME,
          changedFields: [
            "Monster.attackMode",
            "Monster.attackDie",
            "Monster.attackModifier",
            "Monster.weaponSkillValue",
            "Monster.weaponSkillModifier",
            "MonsterAttack.attackName",
            "MonsterAttack.attackConfig",
            "MonsterNaturalAttack.attackName",
            "MonsterNaturalAttack.attackConfig",
          ],
          authoredOffence: {
            attackName: TARGET_ATTACK_NAME,
            dice: "4xD10",
            targets: 1,
            rawMentalStrength: 2.5,
            woundsPerSuccess: 5,
            channel: "mental",
            damageType: "Necrotic",
            cooldown: 0,
          },
          before: summarize(before),
          after: summarize(after),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
