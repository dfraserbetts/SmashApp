import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;
const OFFICIAL_RULER = "BALANCE_ATK_L3_AttackString_4D8_W2";

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type PrismaClient = typeof import("../prisma/client")["prisma"];

type MinionRoleName =
  | "BALANCE_Minion Grunt"
  | "BALANCE_Minion Hexling"
  | "BALANCE_Minion Skirmisher"
  | "BALANCE_Minion Wailer"
  | "BALANCE_Minion Striker";

type DamageTypeRef = {
  name: string;
  mode: "PHYSICAL" | "MENTAL";
};

type MinionRoleSpec = {
  name: MinionRoleName;
  roleIntent: string;
  targetNotes: string;
  calculatorArchetype: string;
  physicalHp: number;
  mentalHp: number;
  physicalProtection: number;
  mentalProtection: number;
  attackDie: DiceSize;
  guardDie: DiceSize;
  fortitudeDie: DiceSize;
  intellectDie: DiceSize;
  synergyDie: DiceSize;
  braveryDie: DiceSize;
  weaponSkillValue: number;
  placeholderAttack: {
    name: string;
    strength: number;
    damageType: DamageTypeRef;
  };
};

const MINION_ROLE_NAMES: readonly MinionRoleName[] = [
  "BALANCE_Minion Grunt",
  "BALANCE_Minion Hexling",
  "BALANCE_Minion Skirmisher",
  "BALANCE_Minion Wailer",
  "BALANCE_Minion Striker",
];

const NO_DEFENCE = {
  physicalProtection: 0,
  mentalProtection: 0,
  guardDie: "D4" as DiceSize,
  fortitudeDie: "D4" as DiceSize,
  intellectDie: "D4" as DiceSize,
  synergyDie: "D4" as DiceSize,
  braveryDie: "D4" as DiceSize,
};

const LIGHT_DEFENCE = {
  physicalProtection: 1,
  mentalProtection: 1,
  guardDie: "D4" as DiceSize,
  fortitudeDie: "D6" as DiceSize,
  intellectDie: "D4" as DiceSize,
  synergyDie: "D6" as DiceSize,
  braveryDie: "D4" as DiceSize,
};

const MINION_ROLES: readonly MinionRoleSpec[] = [
  {
    name: "BALANCE_Minion Grunt",
    roleIntent: "Standard Minion. Baseline quick-to-kill role asset.",
    targetNotes: "Initial target: 1-2 Medium Strength Attacks in both channels.",
    calculatorArchetype: "BALANCED",
    physicalHp: 5,
    mentalHp: 5,
    ...LIGHT_DEFENCE,
    attackDie: "D4",
    weaponSkillValue: 1,
    placeholderAttack: {
      name: "BALANCE_Minion Grunt Placeholder Strike",
      strength: 1,
      damageType: { name: "Blunt", mode: "PHYSICAL" },
    },
  },
  {
    name: "BALANCE_Minion Hexling",
    roleIntent: "Weak control Minion. Not tanky.",
    targetNotes: "Initial target: 1-2 both channels, lower side acceptable.",
    calculatorArchetype: "CONTROL",
    physicalHp: 4,
    mentalHp: 4,
    ...NO_DEFENCE,
    attackDie: "D4",
    weaponSkillValue: 1,
    placeholderAttack: {
      name: "BALANCE_Minion Hexling Placeholder Hex",
      strength: 1,
      damageType: { name: "Fear", mode: "MENTAL" },
    },
  },
  {
    name: "BALANCE_Minion Skirmisher",
    roleIntent: "Evasive Minion. Slightly tougher through evasion, not Soldier-like.",
    targetNotes: "Initial target: 1-2 both channels; evasive side may sit near upper edge but not above 2.",
    calculatorArchetype: "SKIRMISHER",
    physicalHp: 5,
    mentalHp: 5,
    physicalProtection: 0,
    mentalProtection: 0,
    guardDie: "D6",
    fortitudeDie: "D4",
    intellectDie: "D8",
    synergyDie: "D4",
    braveryDie: "D4",
    attackDie: "D4",
    weaponSkillValue: 1,
    placeholderAttack: {
      name: "BALANCE_Minion Skirmisher Placeholder Cut",
      strength: 1,
      damageType: { name: "Slashing", mode: "PHYSICAL" },
    },
  },
  {
    name: "BALANCE_Minion Wailer",
    roleIntent: "Mental-flavoured Minion. Mild mental bias only.",
    targetNotes: "Initial target: 1-2 both channels; mental side can be upper edge but not Soldier-like.",
    calculatorArchetype: "CONTROL",
    physicalHp: 5,
    mentalHp: 5,
    physicalProtection: 1,
    mentalProtection: 1,
    guardDie: "D4",
    fortitudeDie: "D6",
    intellectDie: "D4",
    synergyDie: "D6",
    braveryDie: "D6",
    attackDie: "D4",
    weaponSkillValue: 1,
    placeholderAttack: {
      name: "BALANCE_Minion Wailer Placeholder Cry",
      strength: 1,
      damageType: { name: "Psychic", mode: "MENTAL" },
    },
  },
  {
    name: "BALANCE_Minion Striker",
    roleIntent: "Offensive Minion. Slightly fragile for Minion tier.",
    targetNotes: "Initial target: 1-2 both channels, probably slightly fragile.",
    calculatorArchetype: "STRIKER",
    physicalHp: 4,
    mentalHp: 4,
    ...NO_DEFENCE,
    attackDie: "D6",
    weaponSkillValue: 2,
    placeholderAttack: {
      name: "BALANCE_Minion Striker Placeholder Claws",
      strength: 1,
      damageType: { name: "Slashing", mode: "PHYSICAL" },
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
  calculatorArchetype: true,
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
  tags: {
    orderBy: { tag: "asc" as const },
    select: { tag: true },
  },
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

function customNotes(spec: MinionRoleSpec) {
  return [
    "BALANCE_STATUS: Level 3 Minion role ATK baseline asset",
    "BALANCE_SOURCE: Balance Environment Level 3 Minion role baseline",
    "BALANCE_PHASE: BAL-MINION-ASSETS-001",
    `BALANCE_ROLE_INTENT: ${spec.roleIntent}`,
    `BALANCE_ROLE_TARGET: ${spec.targetNotes}`,
    `BALANCE_ATTACK_BASELINE: ${OFFICIAL_RULER}`,
    "BALANCE_NOTES: Named test asset only; not final lore, final encounter design, or doctrine lock.",
  ].join("\n");
}

function placeholderAttackConfig(spec: MinionRoleSpec): Prisma.InputJsonObject {
  const mental = spec.placeholderAttack.damageType.mode === "MENTAL";
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: mental ? 0 : spec.placeholderAttack.strength,
      mentalStrength: mental ? spec.placeholderAttack.strength : 0,
      damageTypes: [spec.placeholderAttack.damageType],
      attackEffects: [],
    },
  };
}

function monsterData(spec: MinionRoleSpec): Prisma.MonsterUncheckedCreateInput {
  return {
    name: spec.name,
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: LEVEL,
    tier: "MINION",
    legendary: false,
    calculatorArchetype: spec.calculatorArchetype,
    source: "CAMPAIGN",
    isReadOnly: false,
    campaignId: BALANCE_CAMPAIGN_ID,
    attackMode: "NATURAL_WEAPON",
    equippedWeaponId: null,
    mainHandItemId: null,
    offHandItemId: null,
    smallItemId: null,
    headArmorItemId: null,
    shoulderArmorItemId: null,
    torsoArmorItemId: null,
    legsArmorItemId: null,
    feetArmorItemId: null,
    headItemId: null,
    neckItemId: null,
    armsItemId: null,
    beltItemId: null,
    customNotes: customNotes(spec),
    limitBreakName: null,
    limitBreakTier: null,
    limitBreakTriggerText: null,
    limitBreakAttribute: null,
    limitBreakThresholdSuccesses: null,
    limitBreakCostText: null,
    limitBreakEffectText: null,
    limitBreak2Name: null,
    limitBreak2Tier: null,
    limitBreak2TriggerText: null,
    limitBreak2Attribute: null,
    limitBreak2ThresholdSuccesses: null,
    limitBreak2CostText: null,
    limitBreak2EffectText: null,
    physicalResilienceCurrent: spec.physicalHp,
    physicalResilienceMax: spec.physicalHp,
    mentalPerseveranceCurrent: spec.mentalHp,
    mentalPerseveranceMax: spec.mentalHp,
    physicalProtection: spec.physicalProtection,
    mentalProtection: spec.mentalProtection,
    naturalPhysicalProtection: spec.physicalProtection,
    naturalMentalProtection: spec.mentalProtection,
    attackDie: spec.attackDie,
    attackResistDie: 0,
    attackModifier: 0,
    guardDie: spec.guardDie,
    guardResistDie: 0,
    guardModifier: 0,
    fortitudeDie: spec.fortitudeDie,
    fortitudeResistDie: 0,
    fortitudeModifier: 0,
    intellectDie: spec.intellectDie,
    intellectResistDie: 0,
    intellectModifier: 0,
    synergyDie: spec.synergyDie,
    synergyResistDie: 0,
    synergyModifier: 0,
    braveryDie: spec.braveryDie,
    braveryResistDie: 0,
    braveryModifier: 0,
    weaponSkillValue: spec.weaponSkillValue,
    weaponSkillModifier: 0,
    armorSkillValue: 1,
    armorSkillModifier: 0,
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
    calculatorArchetype: row.calculatorArchetype,
    physicalHp: `${row.physicalResilienceCurrent}/${row.physicalResilienceMax}`,
    mentalHp: `${row.mentalPerseveranceCurrent}/${row.mentalPerseveranceMax}`,
    protection: {
      physical: row.physicalProtection,
      mental: row.mentalProtection,
      naturalPhysical: row.naturalPhysicalProtection,
      naturalMental: row.naturalMentalProtection,
    },
    attributes: {
      attack: row.attackDie,
      guard: row.guardDie,
      fortitude: row.fortitudeDie,
      intellect: row.intellectDie,
      synergy: row.synergyDie,
      bravery: row.braveryDie,
    },
    diceCounts: {
      weaponSkillValue: row.weaponSkillValue,
      armorSkillValue: row.armorSkillValue,
    },
    naturalAttack: row.naturalAttack,
    attacks: row.attacks,
    tags: row.tags.map((tag) => tag.tag),
  };
}

async function findMonster(prisma: PrismaClient, name: MinionRoleName) {
  return prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name },
    select: SELECT_FIELDS,
  });
}

async function upsertMinionRole(prisma: PrismaClient, spec: MinionRoleSpec) {
  const matches = await prisma.monster.findMany({
    where: { campaignId: BALANCE_CAMPAIGN_ID, name: spec.name },
    select: { id: true, source: true, isReadOnly: true, campaignId: true },
  });
  if (matches.length > 1) {
    throw new Error(`Refusing ${spec.name}: found ${matches.length} matching rows in Balance Environment.`);
  }
  const existing = matches[0] ?? null;
  if (existing && (existing.source !== "CAMPAIGN" || existing.isReadOnly || existing.campaignId !== BALANCE_CAMPAIGN_ID)) {
    throw new Error(`Refusing ${spec.name}: existing row is protected or out of scope.`);
  }

  const before = await findMonster(prisma, spec.name);
  const attackConfig = placeholderAttackConfig(spec);
  const result = await prisma.$transaction(async (tx) => {
    const monster = existing
      ? await tx.monster.update({ where: { id: existing.id }, data: monsterData(spec) })
      : await tx.monster.create({ data: monsterData(spec) });

    await tx.monsterTag.deleteMany({ where: { monsterId: monster.id } });
    await tx.monsterTag.createMany({
      data: ["BALANCE", "MINION_ROLE_BASELINE"].map((tag) => ({ monsterId: monster.id, tag })),
      skipDuplicates: true,
    });
    await tx.monsterTrait.deleteMany({ where: { monsterId: monster.id } });
    await tx.power.deleteMany({ where: { monsterId: monster.id } });
    await tx.monsterAttack.deleteMany({ where: { monsterId: monster.id } });
    await tx.monsterAttack.create({
      data: {
        monsterId: monster.id,
        sortOrder: 0,
        attackMode: "NATURAL",
        attackName: spec.placeholderAttack.name,
        attackConfig,
        equippedWeaponId: null,
      },
    });
    await tx.monsterNaturalAttack.upsert({
      where: { monsterId: monster.id },
      create: {
        monsterId: monster.id,
        attackName: spec.placeholderAttack.name,
        attackConfig,
      },
      update: {
        attackName: spec.placeholderAttack.name,
        attackConfig,
      },
    });

    return monster;
  });

  const after = await findMonster(prisma, spec.name);
  return {
    name: spec.name,
    id: result.id,
    operation: before ? "updated" : "created",
    roleIntent: spec.roleIntent,
    targetNotes: spec.targetNotes,
    placeholderAttack: {
      name: spec.placeholderAttack.name,
      purpose: "Minimal compatibility attack only; target offense is disabled in attacks-to-kill probes.",
      config: attackConfig,
    },
    before: summarize(before),
    after: summarize(after),
  };
}

async function main() {
  loadLocalEnv();
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

    const accidentalNames = await prisma.monster.findMany({
      where: {
        campaignId: BALANCE_CAMPAIGN_ID,
        name: { startsWith: "BALANCE_Minion " },
        NOT: { name: { in: [...MINION_ROLE_NAMES] } },
      },
      select: { id: true, name: true },
    });
    if (accidentalNames.length > 0) {
      throw new Error(
        `Refusing to proceed: found unapproved BALANCE_Minion rows in Balance Environment: ${
          accidentalNames.map((row) => `${row.name} (${row.id})`).join(", ")
        }.`,
      );
    }

    const results = [];
    for (const spec of MINION_ROLES) {
      results.push(await upsertMinionRole(prisma, spec));
    }

    console.log("Balance Environment Level 3 Minion role assets ensured.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log(`officialRoleComparisonRuler: ${OFFICIAL_RULER}`);
    console.log("DB mutation: scoped upserts for five approved BALANCE_Minion_* role assets only.");
    console.log("No Soldier, Elite, Boss, calibration, non-Balance-Environment, formula, scalar, or tuning values were changed by this script.");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
