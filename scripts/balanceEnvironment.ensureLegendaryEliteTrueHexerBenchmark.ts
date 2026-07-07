import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const ASSET_NAME = "BALANCE_Legendary Elite True Hexer";
const LEVEL = 3;

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type PrismaClient = typeof import("../prisma/client")["prisma"];

const SPEC = {
  name: ASSET_NAME,
  roleIntent:
    "Diagnostic Legendary Elite control/debuff benchmark. Tests status pressure distinct from raw mental striker pressure.",
  physicalHp: 28,
  mentalHp: 32,
  physicalProtection: 0,
  mentalProtection: 0,
  attackDie: "D8" as DiceSize,
  guardDie: "D6" as DiceSize,
  fortitudeDie: "D6" as DiceSize,
  intellectDie: "D8" as DiceSize,
  synergyDie: "D6" as DiceSize,
  braveryDie: "D8" as DiceSize,
  weaponSkillValue: 2,
  armorSkillValue: 2,
  calculatorArchetype: "CONTROL",
  attack: {
    name: "BALANCE_Legendary Elite True Hexer Role Hex",
    rawStrength: 1,
    displayedWoundsPerSuccess: 2,
    damageType: { name: "Fear", mode: "MENTAL" as const },
  },
  mindBind: {
    name: "BALANCE_Legendary Elite True Hexer Mind Bind",
    diceCount: 3,
    potency: 1,
    cooldownTurns: 2,
    controlDurationTurns: 1,
    resistAttribute: "BRAVERY" as const,
    damagePotency: 2,
    damageChannel: "MENTAL" as const,
    damageType: "Psychic",
  },
  weakeningHex: {
    name: "BALANCE_Legendary Elite True Hexer Weakening Hex",
    diceCount: 3,
    potency: 1,
    cooldownTurns: 2,
    debuffDurationTurns: 1,
    resistAttribute: "INTELLECT" as const,
    debuffAttribute: "ATTACK" as const,
    damagePotency: 2,
    damageChannel: "MENTAL" as const,
    damageType: "Psychic",
  },
} as const;

function attackConfig(): Prisma.InputJsonObject {
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: 0,
      mentalStrength: SPEC.attack.rawStrength,
      damageTypes: [SPEC.attack.damageType],
      attackEffects: [],
    },
  };
}

function customNotes() {
  return [
    "BALANCE_STATUS: Level 3 Legendary Elite true control/debuff benchmark asset",
    "BALANCE_SOURCE: Balance Environment True Hexer benchmark pass 1",
    "BALANCE_PHASE: BAL-TRUE-HEXER-BENCHMARK-001",
    `BALANCE_ROLE_INTENT: ${SPEC.roleIntent}`,
    "BALANCE_MECHANIC_NOTE: Uses only supported Combat Lab mechanics: modest natural mental attack, Control primary, Debuff primary, and low linked mental damage riders.",
    "BALANCE_PACKET_NOTE: Legal structures only: Control+Attack and Debuff+Attack. No Control+Debuff+Damage triple packet is authored.",
    "BALANCE_RESTRICTION_NOTE: Does not introduce or rely on Pierce, Guard Break, Sunder, Crush, Expose, Overwhelm, True Strike, minimum damage, or ignore-defence mechanics.",
    "BALANCE_LEGENDARY_INTENT: Legendary is a modifier on ELITE tier here; this is not a normal Boss or final lore monster.",
    "BALANCE_NOTES: Named diagnostic asset only; used for 1v1 duel pressure evidence.",
  ].join("\n");
}

function monsterData(): Prisma.MonsterUncheckedCreateInput {
  return {
    name: SPEC.name,
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: LEVEL,
    tier: "ELITE",
    legendary: true,
    calculatorArchetype: SPEC.calculatorArchetype,
    source: "CAMPAIGN",
    isReadOnly: false,
    campaignId: BALANCE_CAMPAIGN_ID,
    attackMode: "NATURAL_WEAPON",
    customNotes: customNotes(),
    physicalResilienceCurrent: SPEC.physicalHp,
    physicalResilienceMax: SPEC.physicalHp,
    mentalPerseveranceCurrent: SPEC.mentalHp,
    mentalPerseveranceMax: SPEC.mentalHp,
    physicalProtection: SPEC.physicalProtection,
    mentalProtection: SPEC.mentalProtection,
    naturalPhysicalProtection: SPEC.physicalProtection,
    naturalMentalProtection: SPEC.mentalProtection,
    attackDie: SPEC.attackDie,
    attackModifier: 0,
    guardDie: SPEC.guardDie,
    fortitudeDie: SPEC.fortitudeDie,
    intellectDie: SPEC.intellectDie,
    synergyDie: SPEC.synergyDie,
    braveryDie: SPEC.braveryDie,
    weaponSkillValue: SPEC.weaponSkillValue,
    weaponSkillModifier: 0,
    armorSkillValue: SPEC.armorSkillValue,
  };
}

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
  attackModifier: true,
  guardDie: true,
  fortitudeDie: true,
  intellectDie: true,
  synergyDie: true,
  braveryDie: true,
  weaponSkillValue: true,
  weaponSkillModifier: true,
  armorSkillValue: true,
  naturalAttack: { select: { attackName: true, attackConfig: true } },
  attacks: {
    orderBy: { sortOrder: "asc" as const },
    select: { sortOrder: true, attackMode: true, attackName: true, attackConfig: true },
  },
  powers: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      sortOrder: true,
      name: true,
      status: true,
      cooldownTurns: true,
      rangeCategories: { select: { rangeCategory: true } },
      primaryDefenceGate: true,
      effectPackets: {
        orderBy: { packetIndex: "asc" as const },
        select: {
          packetIndex: true,
          hostility: true,
          intention: true,
          diceCount: true,
          potency: true,
          effectTimingType: true,
          effectDurationType: true,
          effectDurationTurns: true,
          dealsWounds: true,
          woundChannel: true,
          targetedAttribute: true,
          applyTo: true,
          secondaryDependencyMode: true,
          detailsJson: true,
        },
      },
    },
  },
  tags: { orderBy: { tag: "asc" as const }, select: { tag: true } },
  customNotes: true,
} as const;

async function findTrueHexer(prisma: PrismaClient) {
  return prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name: ASSET_NAME },
    select: SELECT_FIELDS,
  });
}

async function assertNoProtectedOrDuplicateRows(prisma: PrismaClient) {
  const matches = await prisma.monster.findMany({
    where: { campaignId: BALANCE_CAMPAIGN_ID, name: ASSET_NAME },
    select: { id: true, name: true, source: true, isReadOnly: true, campaignId: true, tier: true, legendary: true },
  });
  if (matches.length > 1) {
    throw new Error(`Refusing ${ASSET_NAME}: found ${matches.length} matching Balance Environment rows.`);
  }
  const existing = matches[0] ?? null;
  if (!existing) return null;
  if (
    existing.source !== "CAMPAIGN" ||
    existing.isReadOnly ||
    existing.campaignId !== BALANCE_CAMPAIGN_ID ||
    existing.tier !== "ELITE" ||
    !existing.legendary
  ) {
    throw new Error(`Refusing ${ASSET_NAME}: existing row is protected, out of scope, non-ELITE, or non-Legendary.`);
  }
  return existing;
}

async function ensureMindBindPower(tx: Prisma.TransactionClient, monsterId: string) {
  const power = SPEC.mindBind;
  await tx.power.create({
    data: {
      monster: { connect: { id: monsterId } },
      sourceType: "MONSTER_POWER",
      sortOrder: 0,
      name: power.name,
      description:
        "True Hexer benchmark package. Primary Control is resisted by Bravery; linked low mental damage rides only when the primary succeeds.",
      cooldownTurns: power.cooldownTurns,
      meleeTargets: 1,
      rangeCategories: { create: [{ rangeCategory: "MELEE" }] },
      primaryDefenceGate: {
        create: {
          sourcePacketIndex: 0,
          gateResult: "RESIST",
          protectionChannel: null,
          resistAttribute: power.resistAttribute,
          hostileEntryPattern: null,
          resolutionSource: "EXPLICIT",
        },
      },
      effectPackets: {
        create: [
          {
            packetIndex: 0,
            hostility: "HOSTILE",
            intention: "CONTROL",
            specific: "Mind cognition control",
            diceCount: power.diceCount,
            potency: power.potency,
            effectTimingType: "ON_CAST",
            effectTimingTurns: null,
            effectDurationType: "TURNS",
            effectDurationTurns: power.controlDurationTurns,
            dealsWounds: false,
            woundChannel: null,
            targetedAttribute: power.resistAttribute,
            applicationModeKey: null,
            resolutionOrigin: "CASTER",
            applyTo: "PRIMARY_TARGET",
            secondaryDependencyMode: null,
            triggerConditionText: null,
            detailsJson: {
              rangeCategory: "MELEE",
              controlMode: "Force no main action",
              controlTheme: "MIND_COGNITION",
              resistAttribute: power.resistAttribute,
              applyTo: "PRIMARY_TARGET",
              theme: "true Hexer Bravery-resisted control",
            },
          },
          {
            packetIndex: 1,
            hostility: "HOSTILE",
            intention: "ATTACK",
            specific: "Low mental damage rider",
            diceCount: 0,
            potency: power.damagePotency,
            effectTimingType: "ON_CAST",
            effectTimingTurns: null,
            effectDurationType: "INSTANT",
            effectDurationTurns: null,
            dealsWounds: true,
            woundChannel: power.damageChannel,
            targetedAttribute: null,
            applicationModeKey: null,
            resolutionOrigin: "CASTER",
            applyTo: "PRIMARY_TARGET",
            secondaryDependencyMode: "LINKED_TO_PRIMARY",
            triggerConditionText: null,
            detailsJson: {
              rangeCategory: "MELEE",
              attackMode: power.damageChannel,
              damageTypes: [power.damageType],
              applyTo: "PRIMARY_TARGET",
              theme: "low linked mental damage rider; no secondary debuff packet",
            },
          },
        ],
      },
      tags: { create: [{ tag: "BALANCE" }, { tag: "TRUE_HEXER_CONTROL_BENCHMARK" }] },
    },
  });
}

async function ensureWeakeningHexPower(tx: Prisma.TransactionClient, monsterId: string) {
  const power = SPEC.weakeningHex;
  await tx.power.create({
    data: {
      monster: { connect: { id: monsterId } },
      sourceType: "MONSTER_POWER",
      sortOrder: 1,
      name: power.name,
      description:
        "True Hexer benchmark package. Primary Attack debuff is resisted by Intellect; linked low mental damage rides only when the primary succeeds.",
      cooldownTurns: power.cooldownTurns,
      meleeTargets: 1,
      rangeCategories: { create: [{ rangeCategory: "MELEE" }] },
      primaryDefenceGate: {
        create: {
          sourcePacketIndex: 0,
          gateResult: "RESIST",
          protectionChannel: null,
          resistAttribute: power.resistAttribute,
          hostileEntryPattern: null,
          resolutionSource: "EXPLICIT",
        },
      },
      effectPackets: {
        create: [
          {
            packetIndex: 0,
            hostility: "HOSTILE",
            intention: "DEBUFF",
            specific: "Attack",
            diceCount: power.diceCount,
            potency: power.potency,
            effectTimingType: "ON_CAST",
            effectTimingTurns: null,
            effectDurationType: "TURNS",
            effectDurationTurns: power.debuffDurationTurns,
            dealsWounds: false,
            woundChannel: null,
            targetedAttribute: power.debuffAttribute,
            applicationModeKey: null,
            resolutionOrigin: "CASTER",
            applyTo: "PRIMARY_TARGET",
            secondaryDependencyMode: null,
            triggerConditionText: null,
            detailsJson: {
              rangeCategory: "MELEE",
              statTarget: "Attack",
              resistAttribute: power.resistAttribute,
              applyTo: "PRIMARY_TARGET",
              theme: "true Hexer Intellect-resisted Attack debuff",
            },
          },
          {
            packetIndex: 1,
            hostility: "HOSTILE",
            intention: "ATTACK",
            specific: "Low mental damage rider",
            diceCount: 0,
            potency: power.damagePotency,
            effectTimingType: "ON_CAST",
            effectTimingTurns: null,
            effectDurationType: "INSTANT",
            effectDurationTurns: null,
            dealsWounds: true,
            woundChannel: power.damageChannel,
            targetedAttribute: null,
            applicationModeKey: null,
            resolutionOrigin: "CASTER",
            applyTo: "PRIMARY_TARGET",
            secondaryDependencyMode: "LINKED_TO_PRIMARY",
            triggerConditionText: null,
            detailsJson: {
              rangeCategory: "MELEE",
              attackMode: power.damageChannel,
              damageTypes: [power.damageType],
              applyTo: "PRIMARY_TARGET",
              theme: "low linked mental damage rider; no secondary control packet",
            },
          },
        ],
      },
      tags: { create: [{ tag: "BALANCE" }, { tag: "TRUE_HEXER_CONTROL_BENCHMARK" }] },
    },
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

    const existing = await assertNoProtectedOrDuplicateRows(prisma);
    const before = await findTrueHexer(prisma);
    const config = attackConfig();
    const result = await prisma.$transaction(async (tx) => {
      const monster = existing
        ? await tx.monster.update({ where: { id: existing.id }, data: monsterData() })
        : await tx.monster.create({ data: monsterData() });

      await tx.monsterTag.deleteMany({ where: { monsterId: monster.id } });
      await tx.monsterTag.createMany({
        data: ["BALANCE", "LEGENDARY_ELITE_DUEL_BASELINE", "TRUE_HEXER_CONTROL_BENCHMARK"].map((tag) => ({
          monsterId: monster.id,
          tag,
        })),
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
          attackName: SPEC.attack.name,
          attackConfig: config,
          equippedWeaponId: null,
        },
      });
      await tx.monsterNaturalAttack.upsert({
        where: { monsterId: monster.id },
        create: { monsterId: monster.id, attackName: SPEC.attack.name, attackConfig: config },
        update: { attackName: SPEC.attack.name, attackConfig: config },
      });
      await ensureMindBindPower(tx, monster.id);
      await ensureWeakeningHexPower(tx, monster.id);

      return monster;
    });

    const after = await findTrueHexer(prisma);
    console.log("Balance Environment Legendary Elite True Hexer benchmark ensured.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log(`asset: ${ASSET_NAME}`);
    console.log("DB mutation: scoped upsert for BALANCE_Legendary Elite True Hexer only.");
    console.log("Existing mechanics only: modest natural mental attack, legal Control primary plus low linked mental damage rider, and legal Debuff primary plus low linked mental damage rider.");
    console.log("No Control+Debuff+Damage triple packet is authored.");
    console.log("No Guard-targeting Debuff is authored.");
    console.log("No Pierce, Guard Break, Sunder, Crush, Expose, Overwhelm, True Strike, minimum damage, or ignore-defence mechanic was introduced.");
    console.log("No current Hexer, Duelist, Rotation, Breaker, player, Soldier, normal Elite, normal Boss, Minion, Legendary Dragon/Lich, calibration, runtime, formula, scalar, tuning, UI, or docs values were changed by this script.");
    console.log(JSON.stringify(
      {
        name: ASSET_NAME,
        id: result.id,
        operation: before ? "updated" : "created",
        roleIntent: SPEC.roleIntent,
        authoredOffence: {
          attackName: SPEC.attack.name,
          dice: `${SPEC.weaponSkillValue}x${SPEC.attackDie}`,
          displayedWoundsPerSuccess: SPEC.attack.displayedWoundsPerSuccess,
          rawStrength: SPEC.attack.rawStrength,
          channel: "mental",
          cooldown: 0,
        },
        powers: [
          {
            name: SPEC.mindBind.name,
            primaryPacket: {
              intention: "CONTROL",
              dice: `${SPEC.mindBind.diceCount}x${SPEC.attackDie}`,
              resistedBy: SPEC.mindBind.resistAttribute,
              effect: "Force No Main Action",
              potency: SPEC.mindBind.potency,
              durationTurns: SPEC.mindBind.controlDurationTurns,
              storedCooldownTurns: SPEC.mindBind.cooldownTurns,
            },
            secondaryPacket: {
              intention: "ATTACK",
              dependencyMode: "LINKED_TO_PRIMARY",
              channel: "mental",
              woundsPerPrimarySuccess: SPEC.mindBind.damagePotency,
              damageType: SPEC.mindBind.damageType,
            },
          },
          {
            name: SPEC.weakeningHex.name,
            primaryPacket: {
              intention: "DEBUFF",
              dice: `${SPEC.weakeningHex.diceCount}x${SPEC.attackDie}`,
              resistedBy: SPEC.weakeningHex.resistAttribute,
              debuffTarget: SPEC.weakeningHex.debuffAttribute,
              potency: SPEC.weakeningHex.potency,
              durationTurns: SPEC.weakeningHex.debuffDurationTurns,
              storedCooldownTurns: SPEC.weakeningHex.cooldownTurns,
            },
            secondaryPacket: {
              intention: "ATTACK",
              dependencyMode: "LINKED_TO_PRIMARY",
              channel: "mental",
              woundsPerPrimarySuccess: SPEC.weakeningHex.damagePotency,
              damageType: SPEC.weakeningHex.damageType,
            },
          },
        ],
        before,
        after,
      },
      null,
      2,
    ));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
