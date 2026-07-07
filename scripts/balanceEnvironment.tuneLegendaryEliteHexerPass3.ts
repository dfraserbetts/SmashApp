import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

import { strengthToTableWoundsPerSuccess } from "../lib/forge/outputProfile";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const HEXER_NAME = "BALANCE_Legendary Elite Hexer";
const HEXER_ATTACK_NAME = "BALANCE_Legendary Elite Hexer Role Hex";
const BEFORE_RAW_MENTAL_STRENGTH = 1.5;
const AFTER_RAW_MENTAL_STRENGTH = 1;

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cloneJsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(asRecord(value))) as Prisma.InputJsonObject;
}

function meleeConfig(config: unknown): Record<string, unknown> {
  return asRecord(asRecord(config).melee);
}

function rawMentalStrength(config: unknown): number {
  const value = Number(meleeConfig(config).mentalStrength ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function rawPhysicalStrength(config: unknown): number {
  const value = Number(meleeConfig(config).physicalStrength ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function damageTypes(config: unknown): unknown[] {
  const value = meleeConfig(config).damageTypes;
  return Array.isArray(value) ? value : [];
}

function hasFearMentalDamageType(config: unknown): boolean {
  return damageTypes(config).some((entry) => {
    const record = asRecord(entry);
    return record.name === "Fear" && record.mode === "MENTAL";
  });
}

function displayedWoundsPerSuccess(config: unknown): number {
  return strengthToTableWoundsPerSuccess(rawMentalStrength(config));
}

function tuneConfig(config: unknown): Prisma.InputJsonObject {
  const next = cloneJsonObject(config) as Record<string, unknown>;
  const melee = asRecord(next.melee);
  melee.mentalStrength = AFTER_RAW_MENTAL_STRENGTH;
  next.melee = melee;
  return next as Prisma.InputJsonObject;
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

function validateHexerScope(row: Awaited<ReturnType<typeof findHexer>>) {
  if (!row) throw new Error(`${HEXER_NAME} was not found in ${BALANCE_CAMPAIGN_NAME}.`);
  if (row.campaignId !== BALANCE_CAMPAIGN_ID || row.source !== "CAMPAIGN" || row.isReadOnly) {
    throw new Error(`Refusing ${HEXER_NAME}: row is read-only, non-campaign, or out of campaign scope.`);
  }
  if (row.tier !== "ELITE" || !row.legendary) {
    throw new Error(`Refusing ${HEXER_NAME}: expected tier ELITE and legendary true.`);
  }
  if (row.attackMode !== "NATURAL_WEAPON" || row.attackDie !== "D10" || row.weaponSkillValue !== 2) {
    throw new Error(
      `Refusing ${HEXER_NAME}: expected current pass-2 attack identity NATURAL_WEAPON, D10, weaponSkillValue 2.`,
    );
  }
  if (!row.naturalAttack) throw new Error(`Refusing ${HEXER_NAME}: missing MonsterNaturalAttack row.`);
  if (row.naturalAttack.attackName !== HEXER_ATTACK_NAME) {
    throw new Error(`Refusing ${HEXER_NAME}: natural attack name was ${row.naturalAttack.attackName}.`);
  }
  if (row.attacks.length !== 1) {
    throw new Error(`Refusing ${HEXER_NAME}: expected exactly one MonsterAttack row, found ${row.attacks.length}.`);
  }
  const attack = row.attacks[0];
  if (attack.attackMode !== "NATURAL" || attack.attackName !== HEXER_ATTACK_NAME || attack.equippedWeaponId !== null) {
    throw new Error(`Refusing ${HEXER_NAME}: MonsterAttack row is not the expected natural Role Hex row.`);
  }

  for (const [label, config] of [
    ["MonsterNaturalAttack", row.naturalAttack.attackConfig],
    ["MonsterAttack", attack.attackConfig],
  ] as const) {
    const melee = meleeConfig(config);
    if (melee.enabled !== true || rawPhysicalStrength(config) !== 0 || !hasFearMentalDamageType(config)) {
      throw new Error(`Refusing ${HEXER_NAME}: ${label} attack config is not the expected mental Fear melee profile.`);
    }
    const currentStrength = rawMentalStrength(config);
    if (currentStrength !== BEFORE_RAW_MENTAL_STRENGTH && currentStrength !== AFTER_RAW_MENTAL_STRENGTH) {
      throw new Error(
        `Refusing ${HEXER_NAME}: ${label} raw mental strength ${currentStrength} is neither pass-2 ${BEFORE_RAW_MENTAL_STRENGTH} nor idempotent pass-3 ${AFTER_RAW_MENTAL_STRENGTH}.`,
      );
    }
  }
}

function summarize(row: Awaited<ReturnType<typeof findHexer>>) {
  if (!row) return null;
  const attack = row.attacks[0] ?? null;
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
      naturalAttack: row.naturalAttack
        ? {
            id: row.naturalAttack.id,
            attackName: row.naturalAttack.attackName,
            rawMentalStrength: rawMentalStrength(row.naturalAttack.attackConfig),
            displayedWoundsPerSuccess: displayedWoundsPerSuccess(row.naturalAttack.attackConfig),
            attackConfig: row.naturalAttack.attackConfig,
          }
        : null,
      attackRow: attack
        ? {
            id: attack.id,
            sortOrder: attack.sortOrder,
            attackMode: attack.attackMode,
            attackName: attack.attackName,
            equippedWeaponId: attack.equippedWeaponId,
            rawMentalStrength: rawMentalStrength(attack.attackConfig),
            displayedWoundsPerSuccess: displayedWoundsPerSuccess(attack.attackConfig),
            attackConfig: attack.attackConfig,
          }
        : null,
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

    const before = await findHexer(prisma);
    validateHexerScope(before);
    if (!before?.naturalAttack || before.attacks.length !== 1) {
      throw new Error(`Refusing ${HEXER_NAME}: missing natural attack or attack row after scope validation.`);
    }

    const nextNaturalAttackConfig = tuneConfig(before.naturalAttack.attackConfig);
    const nextAttackConfig = tuneConfig(before.attacks[0].attackConfig);
    await prisma.$transaction(async (tx) => {
      await tx.monsterNaturalAttack.update({
        where: { monsterId: before.id },
        data: { attackConfig: nextNaturalAttackConfig },
      });
      await tx.monsterAttack.update({
        where: { id: before.attacks[0].id },
        data: { attackConfig: nextAttackConfig },
      });
    });
    const after = await findHexer(prisma);
    validateHexerScope(after);

    console.log("Balance Environment Legendary Elite Hexer tuning pass 3 applied.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped Role Hex damage payload update for BALANCE_Legendary Elite Hexer only.");
    console.log("Updated fields: MonsterNaturalAttack.attackConfig.melee.mentalStrength and MonsterAttack.attackConfig.melee.mentalStrength.");
    console.log("Intended movement: 2xD10 mental W/S3 -> 2xD10 mental W/S2.");
    console.log("No tier, legendary status, HP, durability, protection, defence, dice count, die size, cooldown, runtime, formula, scalar, tuning, UI, docs, or other assets were changed by this script.");
    console.log(JSON.stringify({
      name: HEXER_NAME,
      reason: "Pass 3 reduces current Hexer mental striker payload from raw 1.5/displayed W/S3 to raw 1/displayed W/S2 while preserving 2xD10 cadence.",
      fieldChanges: {
        rawMentalStrengthBefore: rawMentalStrength(before.naturalAttack.attackConfig),
        rawMentalStrengthAfter: after?.naturalAttack ? rawMentalStrength(after.naturalAttack.attackConfig) : null,
        displayedWoundsPerSuccessBefore: displayedWoundsPerSuccess(before.naturalAttack.attackConfig),
        displayedWoundsPerSuccessAfter: after?.naturalAttack ? displayedWoundsPerSuccess(after.naturalAttack.attackConfig) : null,
        attackDie: "unchanged D10",
        weaponSkillValue: "unchanged 2",
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
