import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const ASSET_NAME = "BALANCE_Legendary Elite Breaker Controller Rotation";
const LEVEL = 3;

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type PrismaClient = typeof import("../prisma/client")["prisma"];

const SPEC = {
  name: ASSET_NAME,
  roleIntent:
    "Existing-mechanics anti-tank Legendary Elite benchmark. Tests a two-power Control+Damage and Debuff+Damage rotation.",
  physicalHp: 30,
  mentalHp: 26,
  physicalProtection: 1,
  mentalProtection: 1,
  attackDie: "D8" as DiceSize,
  guardDie: "D8" as DiceSize,
  fortitudeDie: "D8" as DiceSize,
  intellectDie: "D6" as DiceSize,
  synergyDie: "D6" as DiceSize,
  braveryDie: "D6" as DiceSize,
  weaponSkillValue: 4,
  armorSkillValue: 2,
  calculatorArchetype: "CONTROLLER",
  attack: {
    name: "BALANCE_Legendary Elite Breaker Controller Rotation Role Strike",
    rawStrength: 2,
    displayedWoundsPerSuccess: 4,
    damageType: { name: "Crushing", mode: "PHYSICAL" as const },
  },
  mindSpike: {
    name: "BALANCE_Legendary Elite Breaker Controller Rotation Mind Spike",
    diceCount: 3,
    potency: 1,
    cooldownTurns: 2,
    controlDurationTurns: 1,
    resistAttribute: "INTELLECT" as const,
    damagePotency: 4,
    damageChannel: "MENTAL" as const,
    damageType: "Psychic",
  },
  sappingHex: {
    name: "BALANCE_Legendary Elite Breaker Controller Rotation Sapping Hex",
    diceCount: 3,
    potency: 1,
    cooldownTurns: 2,
    debuffDurationTurns: 1,
    resistAttribute: "BRAVERY" as const,
    debuffAttribute: "ATTACK" as const,
    damagePotency: 3,
    damageChannel: "MENTAL" as const,
    damageType: "Psychic",
  },
} as const;

function attackConfig(): Prisma.InputJsonObject {
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: SPEC.attack.rawStrength,
      mentalStrength: 0,
      damageTypes: [SPEC.attack.damageType],
      attackEffects: [],
    },
  };
}

function customNotes() {
  return [
    "BALANCE_STATUS: Level 3 Legendary Elite existing-mechanics anti-tank two-power rotation benchmark asset",
    "BALANCE_SOURCE: Balance Environment Legendary Elite anti-tank existing-mechanics rotation pass 1",
    "BALANCE_PHASE: BAL-EXISTING-MECHANICS-ANTITANK-ROTATION-001",
    `BALANCE_ROLE_INTENT: ${SPEC.roleIntent}`,
    "BALANCE_MECHANIC_NOTE: Uses only supported Combat Lab mechanics: natural physical pressure, Control primary with linked mental damage, and Debuff primary with linked mental damage.",
    "BALANCE_PACKET_NOTE: Legal structures only: Control+Attack and Debuff+Attack. No triple-intention packet is authored.",
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
    guardDie: SPEC.guardDie,
    fortitudeDie: SPEC.fortitudeDie,
    intellectDie: SPEC.intellectDie,
    synergyDie: SPEC.synergyDie,
    braveryDie: SPEC.braveryDie,
    weaponSkillValue: SPEC.weaponSkillValue,
    armorSkillValue: SPEC.armorSkillValue,
  };
}

async function findRotation(prisma: PrismaClient) {
  return prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name: ASSET_NAME },
    select: {
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
      guardDie: true,
      fortitudeDie: true,
      intellectDie: true,
      synergyDie: true,
      braveryDie: true,
      weaponSkillValue: true,
      armorSkillValue: true,
      naturalAttack: { select: { attackName: true, attackConfig: true } },
      attacks: { orderBy: { sortOrder: "asc" }, select: { sortOrder: true, attackMode: true, attackName: true, attackConfig: true } },
      powers: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          name: true,
          status: true,
          cooldownTurns: true,
          rangeCategories: { select: { rangeCategory: true } },
          primaryDefenceGate: true,
          effectPackets: {
            orderBy: { packetIndex: "asc" },
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
      tags: { orderBy: { tag: "asc" }, select: { tag: true } },
      customNotes: true,
    },
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

async function ensureMindSpikePower(tx: Prisma.TransactionClient, monsterId: string) {
  const power = SPEC.mindSpike;
  await tx.power.create({
    data: {
      monster: { connect: { id: monsterId } },
      sourceType: "MONSTER_POWER",
      sortOrder: 0,
      name: power.name,
      description:
        "Existing-mechanics rotation test package. Primary Control is resisted by Intellect; linked secondary mental damage rides only when the primary succeeds.",
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
              applyTo: "PRIMARY_TARGET",
              theme: "existing-mechanics anti-tank Intellect control",
            },
          },
          {
            packetIndex: 1,
            hostility: "HOSTILE",
            intention: "ATTACK",
            specific: "Mental damage rider",
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
              theme: "linked mental damage rider; no secondary debuff packet",
            },
          },
        ],
      },
      tags: { create: [{ tag: "BALANCE" }, { tag: "ANTI_TANK_EXISTING_MECHANICS" }] },
    },
  });
}

async function ensureSappingHexPower(tx: Prisma.TransactionClient, monsterId: string) {
  const power = SPEC.sappingHex;
  await tx.power.create({
    data: {
      monster: { connect: { id: monsterId } },
      sourceType: "MONSTER_POWER",
      sortOrder: 1,
      name: power.name,
      description:
        "Existing-mechanics rotation test package. Primary Attack debuff is resisted by Bravery; linked secondary mental damage rides only when the primary succeeds.",
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
              theme: "existing-mechanics anti-tank Bravery-resisted Attack debuff",
            },
          },
          {
            packetIndex: 1,
            hostility: "HOSTILE",
            intention: "ATTACK",
            specific: "Mental damage rider",
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
              theme: "linked mental damage rider; no secondary control packet",
            },
          },
        ],
      },
      tags: { create: [{ tag: "BALANCE" }, { tag: "ANTI_TANK_EXISTING_MECHANICS" }] },
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
    const before = await findRotation(prisma);
    const config = attackConfig();
    const result = await prisma.$transaction(async (tx) => {
      const monster = existing
        ? await tx.monster.update({ where: { id: existing.id }, data: monsterData() })
        : await tx.monster.create({ data: monsterData() });

      await tx.monsterTag.deleteMany({ where: { monsterId: monster.id } });
      await tx.monsterTag.createMany({
        data: ["BALANCE", "LEGENDARY_ELITE_DUEL_BASELINE", "ANTI_TANK_EXISTING_MECHANICS", "ANTI_TANK_ROTATION"].map((tag) => ({ monsterId: monster.id, tag })),
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
      await ensureMindSpikePower(tx, monster.id);
      await ensureSappingHexPower(tx, monster.id);

      return monster;
    });

    const after = await findRotation(prisma);
    console.log("Balance Environment Legendary Elite existing-mechanics anti-tank Controller Rotation ensured.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log(`asset: ${ASSET_NAME}`);
    console.log("DB mutation: scoped upsert for BALANCE_Legendary Elite Breaker Controller Rotation only.");
    console.log("Existing mechanics only: natural physical pressure, legal Control primary plus linked mental damage rider, and legal Debuff primary plus linked mental damage rider.");
    console.log("No Control+Debuff+Damage triple packet is authored.");
    console.log("No Guard Debuff resisted by Guard is authored.");
    console.log("No Pierce, Guard Break, Sunder, Crush, Expose, Overwhelm, True Strike, minimum damage, or ignore-defence mechanic was introduced.");
    console.log("No Breaker, Breaker Debuffer, Breaker Controller, Controller Lite, Duelist, Hexer, Stoneguard, Hawkshot, Ranger, Arcane Sage, Dragon/Lich, Minion/Soldier/Elite/Boss role, calibration, runtime, formula, scalar, tuning, UI, or docs values were changed by this script.");
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
          channel: "physical",
          cooldown: 0,
        },
        powers: [
          {
            name: SPEC.mindSpike.name,
            primaryPacket: {
              intention: "CONTROL",
              dice: `${SPEC.mindSpike.diceCount}x${SPEC.attackDie}`,
              resistedBy: SPEC.mindSpike.resistAttribute,
              effect: "Force No Main Action",
              potency: SPEC.mindSpike.potency,
              durationTurns: SPEC.mindSpike.controlDurationTurns,
              storedCooldownTurns: SPEC.mindSpike.cooldownTurns,
            },
            secondaryPacket: {
              intention: "ATTACK",
              dependencyMode: "LINKED_TO_PRIMARY",
              channel: "mental",
              woundsPerPrimarySuccess: SPEC.mindSpike.damagePotency,
              damageType: SPEC.mindSpike.damageType,
            },
          },
          {
            name: SPEC.sappingHex.name,
            primaryPacket: {
              intention: "DEBUFF",
              dice: `${SPEC.sappingHex.diceCount}x${SPEC.attackDie}`,
              resistedBy: SPEC.sappingHex.resistAttribute,
              debuffTarget: SPEC.sappingHex.debuffAttribute,
              potency: SPEC.sappingHex.potency,
              durationTurns: SPEC.sappingHex.debuffDurationTurns,
              storedCooldownTurns: SPEC.sappingHex.cooldownTurns,
            },
            secondaryPacket: {
              intention: "ATTACK",
              dependencyMode: "LINKED_TO_PRIMARY",
              channel: "mental",
              woundsPerPrimarySuccess: SPEC.sappingHex.damagePotency,
              damageType: SPEC.sappingHex.damageType,
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
