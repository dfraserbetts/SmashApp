import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const TARGET_BOSS_NAME = "BALANCE_Boss Behemoth";
const TARGET_ATTACK_NAME = "BALANCE_Boss Behemoth Crushing Slam";
const BEFORE_TARGETS = 1;
const AFTER_TARGETS = 2;
const BEFORE_PHYSICAL_STRENGTH: number[] = [4, 3.5];
const AFTER_PHYSICAL_STRENGTH = 3.5;

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
      id: true,
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

type BossRow = NonNullable<Awaited<ReturnType<typeof findBehemoth>>>;

function asObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected attackConfig to be a JSON object.");
  }
  return value;
}

function readMelee(config: Prisma.JsonValue | null | undefined) {
  const root = asObject(config);
  const melee = root.melee;
  if (!melee || typeof melee !== "object" || Array.isArray(melee)) {
    throw new Error("Expected attackConfig.melee to be a JSON object.");
  }
  return melee as Prisma.JsonObject;
}

function readTargets(config: Prisma.JsonValue | null | undefined): number {
  const targets = readMelee(config).targets;
  if (typeof targets !== "number") {
    throw new Error(`Expected numeric attackConfig.melee.targets, found ${String(targets)}.`);
  }
  return targets;
}

function withBehemothShape(
  config: Prisma.JsonValue | null | undefined,
  targets: number,
  physicalStrength: number,
): Prisma.InputJsonObject {
  const root = asObject(config);
  const melee = readMelee(config);
  return {
    ...root,
    melee: {
      ...melee,
      targets,
      physicalStrength,
    },
  };
}

function readPhysicalStrength(config: Prisma.JsonValue | null | undefined): number | undefined {
  const melee = readMelee(config);
  const value = melee.physicalStrength;
  return typeof value === "number" ? value : undefined;
}

function assertCurrentOffenceShape(row: BossRow) {
  if (row.campaignId !== BALANCE_CAMPAIGN_ID || row.source !== "CAMPAIGN" || row.isReadOnly) {
    throw new Error("Refusing Behemoth: row is read-only, non-campaign, or out of Balance Environment scope.");
  }
  if (row.tier !== "BOSS") throw new Error(`Refusing Behemoth: expected BOSS tier, found ${row.tier}.`);
  if (row.legendary) throw new Error("Refusing Behemoth: Legendary Boss assets are deferred to a separate pass.");
  if (row.attackMode !== "NATURAL_WEAPON") {
    throw new Error(`Refusing Behemoth: expected NATURAL_WEAPON attack mode, found ${row.attackMode}.`);
  }
  if (row.attackDie !== "D12" || row.weaponSkillValue !== 4 || row.attackModifier !== 0 || row.weaponSkillModifier !== 0) {
    throw new Error(
      `Refusing Behemoth: expected 4xD12 with zero modifiers, found ${row.weaponSkillValue}x${row.attackDie} attackModifier=${row.attackModifier} weaponSkillModifier=${row.weaponSkillModifier}.`,
    );
  }
  if (row.attacks.length !== 1) {
    throw new Error(`Refusing Behemoth: expected exactly one MonsterAttack row, found ${row.attacks.length}.`);
  }
  const [attack] = row.attacks;
  if (!attack || attack.sortOrder !== 0 || attack.attackName !== TARGET_ATTACK_NAME || attack.attackMode !== "NATURAL") {
    throw new Error("Refusing Behemoth: primary MonsterAttack row does not match the approved pass-1 attack shape.");
  }
  if (!row.naturalAttack || row.naturalAttack.attackName !== TARGET_ATTACK_NAME) {
    throw new Error("Refusing Behemoth: MonsterNaturalAttack row does not match the approved pass-1 attack shape.");
  }

  const naturalMelee = readMelee(row.naturalAttack.attackConfig);
  const attackMelee = readMelee(attack.attackConfig);
  for (const [label, melee] of [
    ["MonsterNaturalAttack", naturalMelee],
    ["MonsterAttack", attackMelee],
  ] as const) {
    if (melee.enabled !== true) throw new Error(`Refusing Behemoth: ${label}.melee.enabled is not true.`);
    if (typeof melee.physicalStrength !== "number" || !BEFORE_PHYSICAL_STRENGTH.includes(melee.physicalStrength)) {
      throw new Error(`Refusing Behemoth: ${label} strength is not physical 4 or 3.5.`);
    }
    if (melee.mentalStrength !== 0) {
      throw new Error(`Refusing Behemoth: ${label} mental strength is not 0.`);
    }
    const damageTypes = melee.damageTypes;
    if (!Array.isArray(damageTypes) || damageTypes.length !== 1) {
      throw new Error(`Refusing Behemoth: ${label} must have exactly one damage type.`);
    }
    const [damageType] = damageTypes;
    if (
      !damageType ||
      typeof damageType !== "object" ||
      Array.isArray(damageType) ||
      damageType.name !== "Blunt" ||
      damageType.mode !== "PHYSICAL"
    ) {
      throw new Error(`Refusing Behemoth: ${label} damage type must be physical Blunt.`);
    }
    const targets = melee.targets;
    if (targets !== BEFORE_TARGETS && targets !== AFTER_TARGETS) {
      throw new Error(`Refusing Behemoth: ${label}.melee.targets expected 1 or 2, found ${String(targets)}.`);
    }
  }
}

function summarize(row: BossRow) {
  const attack = row.attacks[0];
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
      naturalAttackTargets: readTargets(row.naturalAttack?.attackConfig),
      monsterAttackTargets: readTargets(attack?.attackConfig),
      naturalAttack: row.naturalAttack,
      attacks: row.attacks,
    },
  };
}

async function findBehemoth(prisma: PrismaClient) {
  return prisma.monster.findFirst({
    where: {
      campaignId: BALANCE_CAMPAIGN_ID,
      source: "CAMPAIGN",
      isReadOnly: false,
      name: TARGET_BOSS_NAME,
    },
    select: SELECT_FIELDS,
  });
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
      where: { campaignId: BALANCE_CAMPAIGN_ID, name: TARGET_BOSS_NAME },
      select: { id: true, name: true },
    });
    if (matches.length !== 1) {
      throw new Error(`Refusing Behemoth pass 2: expected exactly one scoped Behemoth row, found ${matches.length}.`);
    }

    const before = await findBehemoth(prisma);
    if (!before) throw new Error("Refusing Behemoth pass 2: scoped Behemoth row was not found.");
    assertCurrentOffenceShape(before);
    const primaryAttack = before.attacks[0];
    if (!primaryAttack) throw new Error("Refusing Behemoth pass 2: primary attack row is missing.");

    const naturalTargetsBefore = readTargets(before.naturalAttack?.attackConfig);
    const attackTargetsBefore = readTargets(primaryAttack.attackConfig);
    const naturalStrengthBefore = readPhysicalStrength(before.naturalAttack?.attackConfig);
    const attackStrengthBefore = readPhysicalStrength(primaryAttack.attackConfig);
    const naturalConfig = withBehemothShape(before.naturalAttack?.attackConfig, AFTER_TARGETS, AFTER_PHYSICAL_STRENGTH);
    const attackConfig = withBehemothShape(primaryAttack.attackConfig, AFTER_TARGETS, AFTER_PHYSICAL_STRENGTH);

    await prisma.$transaction(async (tx) => {
      await tx.monsterAttack.update({
        where: { id: primaryAttack.id },
        data: { attackConfig },
      });
      await tx.monsterNaturalAttack.update({
        where: { monsterId: before.id },
        data: { attackConfig: naturalConfig },
      });
    });

    const after = await findBehemoth(prisma);
    if (!after) throw new Error("Scoped Behemoth row vanished after update.");
    assertCurrentOffenceShape(after);
    const afterNaturalMelee = readMelee(after.naturalAttack?.attackConfig);
    const afterAttackMelee = readMelee(after.attacks[0]?.attackConfig);

    console.log("Balance Environment Boss offence packages pass 2 applied.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped Behemoth pass 2 offence shape adjustment (targets + physicalStrength).");
    console.log("No HP, durability, protection, defence, tier, legendary flag, player, runtime, formula, scalar, tuning, UI, docs, Warlord, Hexlord, Dragon/Lich, or new-mechanic changes were made by this script.");
    console.log(
      JSON.stringify(
        {
          asset: TARGET_BOSS_NAME,
          changedFields: [
            "MonsterAttack.attackConfig.melee.targets",
            "MonsterAttack.attackConfig.melee.physicalStrength",
            "MonsterNaturalAttack.attackConfig.melee.targets",
            "MonsterNaturalAttack.attackConfig.melee.physicalStrength",
          ],
          beforeTargets: {
            monsterAttack: attackTargetsBefore,
            monsterNaturalAttack: naturalTargetsBefore,
          },
          afterTargets: {
            monsterAttack: readTargets(after.attacks[0]?.attackConfig),
            monsterNaturalAttack: readTargets(after.naturalAttack?.attackConfig),
          },
          beforeStrengths: {
            monsterAttack: attackStrengthBefore,
            monsterNaturalAttack: naturalStrengthBefore,
          },
          afterStrengths: {
            monsterAttack: afterAttackMelee.physicalStrength,
            monsterNaturalAttack: afterNaturalMelee.physicalStrength,
          },
          unchangedOffence: {
            dice: `${after.weaponSkillValue}x${after.attackDie}`,
            rawStrength: AFTER_PHYSICAL_STRENGTH,
            woundsPerSuccess: 7,
            channel: "physical",
            damageType: "Blunt",
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
