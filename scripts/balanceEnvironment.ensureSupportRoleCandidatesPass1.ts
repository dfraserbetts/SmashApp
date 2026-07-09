import { loadEnvConfig } from "@next/env";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const CANDIDATE_PREFIX = "BALANCE_Support Candidate";
const LEVEL = 3;

type DiceSize = "D4" | "D6" | "D8" | "D10" | "D12";
type DamageMode = "PHYSICAL" | "MENTAL";
type PrismaClient = typeof import("../prisma/client")["prisma"];

type DamageTypeRef = {
  name: string;
  mode: DamageMode;
};

type ControlPowerSpec = {
  name: string;
  diceCount: number;
  potency: number;
  cooldownTurns: number;
  controlDurationTurns: number;
  resistAttribute: "ATTACK" | "GUARD" | "FORTITUDE" | "INTELLECT" | "SYNERGY" | "BRAVERY";
  damagePotency: number;
  damageChannel: "PHYSICAL" | "MENTAL";
  damageType: string;
};

type DebuffPowerSpec = {
  name: string;
  diceCount: number;
  potency: number;
  cooldownTurns: number;
  debuffDurationTurns: number;
  resistAttribute: "ATTACK" | "GUARD" | "FORTITUDE" | "INTELLECT" | "SYNERGY" | "BRAVERY";
  debuffAttribute: "ATTACK" | "GUARD" | "FORTITUDE" | "INTELLECT" | "SYNERGY" | "BRAVERY";
  damagePotency: number;
  damageChannel: "PHYSICAL" | "MENTAL";
  damageType: string;
};

type CandidateSpec = {
  name: string;
  roleIntent: string;
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
  armorSkillValue: number;
  attack: {
    name: string;
    physicalStrength: number;
    mentalStrength: number;
    displayedWoundsPerSuccess: number;
    damageType: DamageTypeRef;
  };
  powers?: {
    control?: ControlPowerSpec;
    debuff?: DebuffPowerSpec;
  };
};

const CANDIDATES: readonly CandidateSpec[] = [
  {
    name: "BALANCE_Support Candidate Pressure Striker",
    roleIntent:
      "Candidate Soldier support: punish party for ignoring support by raising enemy physical DPR through existing natural-attack mechanics.",
    calculatorArchetype: "STRIKER",
    physicalHp: 22,
    mentalHp: 18,
    physicalProtection: 1,
    mentalProtection: 1,
    attackDie: "D10",
    guardDie: "D6",
    fortitudeDie: "D8",
    intellectDie: "D4",
    synergyDie: "D6",
    braveryDie: "D6",
    weaponSkillValue: 4,
    armorSkillValue: 2,
    attack: {
      name: "BALANCE_Support Candidate Pressure Striker Raking Cut",
      physicalStrength: 2.5,
      mentalStrength: 0,
      displayedWoundsPerSuccess: 5,
      damageType: { name: "Slashing", mode: "PHYSICAL" },
    },
  },
  {
    name: "BALANCE_Support Candidate Guard Anchor",
    roleIntent:
      "Candidate Soldier support: create durable target-priority friction through sturdy stats and credible supported physical pressure, not taunt/bodyguard mechanics.",
    calculatorArchetype: "TANK",
    physicalHp: 34,
    mentalHp: 26,
    physicalProtection: 2,
    mentalProtection: 2,
    attackDie: "D10",
    guardDie: "D8",
    fortitudeDie: "D8",
    intellectDie: "D4",
    synergyDie: "D8",
    braveryDie: "D6",
    weaponSkillValue: 3,
    armorSkillValue: 3,
    attack: {
      name: "BALANCE_Support Candidate Guard Anchor Shield Bash",
      physicalStrength: 2,
      mentalStrength: 0,
      displayedWoundsPerSuccess: 4,
      damageType: { name: "Blunt", mode: "PHYSICAL" },
    },
  },
  {
    name: "BALANCE_Support Candidate Suppression Hexer",
    roleIntent:
      "Candidate Soldier support: disrupt party focus-fire using existing Control/Debuff primary packets and linked low mental damage riders.",
    calculatorArchetype: "CONTROL",
    physicalHp: 18,
    mentalHp: 24,
    physicalProtection: 1,
    mentalProtection: 1,
    attackDie: "D8",
    guardDie: "D6",
    fortitudeDie: "D6",
    intellectDie: "D8",
    synergyDie: "D6",
    braveryDie: "D8",
    weaponSkillValue: 3,
    armorSkillValue: 2,
    attack: {
      name: "BALANCE_Support Candidate Suppression Hexer Dread Bolt",
      physicalStrength: 0,
      mentalStrength: 1.5,
      displayedWoundsPerSuccess: 3,
      damageType: { name: "Fear", mode: "MENTAL" },
    },
    powers: {
      control: {
        name: "BALANCE_Support Candidate Suppression Hexer Mind Snare",
        diceCount: 3,
        potency: 1,
        cooldownTurns: 2,
        controlDurationTurns: 1,
        resistAttribute: "BRAVERY",
        damagePotency: 2,
        damageChannel: "MENTAL",
        damageType: "Psychic",
      },
      debuff: {
        name: "BALANCE_Support Candidate Suppression Hexer Mark Weakness",
        diceCount: 3,
        potency: 1,
        cooldownTurns: 2,
        debuffDurationTurns: 1,
        resistAttribute: "INTELLECT",
        debuffAttribute: "ATTACK",
        damagePotency: 2,
        damageChannel: "MENTAL",
        damageType: "Psychic",
      },
    },
  },
] as const;

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
  guardModifier: true,
  fortitudeDie: true,
  fortitudeModifier: true,
  intellectDie: true,
  intellectModifier: true,
  synergyDie: true,
  synergyModifier: true,
  braveryDie: true,
  braveryModifier: true,
  weaponSkillValue: true,
  weaponSkillModifier: true,
  armorSkillValue: true,
  armorSkillModifier: true,
  naturalAttack: { select: { attackName: true, attackConfig: true } },
  attacks: {
    orderBy: { sortOrder: "asc" as const },
    select: { sortOrder: true, attackMode: true, attackName: true, attackConfig: true },
  },
  powers: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      sortOrder: true,
      name: true,
      status: true,
      cooldownTurns: true,
      rangeCategories: { select: { rangeCategory: true } },
      primaryDefenceGate: {
        select: {
          sourcePacketIndex: true,
          gateResult: true,
          protectionChannel: true,
          resistAttribute: true,
          hostileEntryPattern: true,
          resolutionSource: true,
        },
      },
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

type CandidateRow = Awaited<ReturnType<typeof findCandidate>>;

function candidateNames() {
  return CANDIDATES.map((candidate) => candidate.name);
}

function attackConfig(spec: CandidateSpec): Prisma.InputJsonObject {
  return {
    melee: {
      enabled: true,
      targets: 1,
      physicalStrength: spec.attack.physicalStrength,
      mentalStrength: spec.attack.mentalStrength,
      damageTypes: [spec.attack.damageType],
      attackEffects: [],
    },
  };
}

function monsterData(spec: CandidateSpec): Prisma.MonsterUncheckedCreateInput {
  return {
    name: spec.name,
    imageUrl: null,
    imagePosX: 50,
    imagePosY: 50,
    level: LEVEL,
    tier: "SOLDIER",
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
    customNotes: [
      "BALANCE_STATUS: Level 3 supported-Elite support-role candidate asset",
      "BALANCE_SOURCE: Balance Environment support-role candidates pass 1",
      "BALANCE_PHASE: SUPPORT-ROLE-CANDIDATES-PASS1-001",
      `BALANCE_ROLE_INTENT: ${spec.roleIntent}`,
      "BALANCE_MECHANIC_NOTE: Uses existing Combat Lab-supported natural attacks and, where present, existing Control/Debuff primary packets with linked low damage riders.",
      "BALANCE_RESTRICTION_NOTE: No taunt, bodyguard interception, forced targeting, Pierce, Guard Break, Sunder, Expose, True Strike, minimum damage, ignore-defence, new positioning, or new AOE mechanics.",
      "BALANCE_NOTES: Candidate asset only; not final production tuning.",
    ].join("\n"),
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
    armorSkillValue: spec.armorSkillValue,
    armorSkillModifier: 0,
  };
}

async function findCandidate(prisma: PrismaClient, name: string) {
  return prisma.monster.findFirst({
    where: { campaignId: BALANCE_CAMPAIGN_ID, source: "CAMPAIGN", isReadOnly: false, name },
    select: SELECT_FIELDS,
  });
}

async function assertScope(prisma: PrismaClient) {
  const names = candidateNames();
  for (const name of names) {
    if (!name.startsWith(CANDIDATE_PREFIX)) {
      throw new Error(`Refusing candidate name outside prefix: ${name}`);
    }
  }

  const matches = await prisma.monster.findMany({
    where: { campaignId: BALANCE_CAMPAIGN_ID, name: { in: names } },
    select: { id: true, name: true, source: true, isReadOnly: true, campaignId: true, tier: true, legendary: true },
  });
  for (const name of names) {
    const sameName = matches.filter((match) => match.name === name);
    if (sameName.length > 1) throw new Error(`Refusing ${name}: found ${sameName.length} matching rows.`);
    const existing = sameName[0];
    if (!existing) continue;
    if (
      existing.source !== "CAMPAIGN" ||
      existing.isReadOnly ||
      existing.campaignId !== BALANCE_CAMPAIGN_ID ||
      existing.tier !== "SOLDIER" ||
      existing.legendary
    ) {
      throw new Error(`Refusing ${name}: existing row is protected, out of scope, non-SOLDIER, or Legendary.`);
    }
  }

  const nonCandidateMatches = await prisma.monster.findMany({
    where: {
      campaignId: BALANCE_CAMPAIGN_ID,
      name: { in: names.filter((name) => !name.startsWith(CANDIDATE_PREFIX)) },
    },
    select: { id: true, name: true },
  });
  if (nonCandidateMatches.length > 0) {
    throw new Error(`Refusing unexpected non-candidate rows: ${nonCandidateMatches.map((row) => row.name).join(", ")}`);
  }
}

async function ensureControlPower(tx: Prisma.TransactionClient, monsterId: string, power: ControlPowerSpec) {
  await tx.power.create({
    data: {
      monster: { connect: { id: monsterId } },
      sourceType: "MONSTER_POWER",
      sortOrder: 0,
      name: power.name,
      description:
        "Support candidate package. Primary Control is resisted by Bravery; linked low mental damage rides only when the primary succeeds.",
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
              theme: "support candidate Bravery-resisted control",
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
              theme: "low linked mental damage rider; no new mechanic",
            },
          },
        ],
      },
      tags: { create: [{ tag: "BALANCE" }, { tag: "SUPPORT_CANDIDATE_PASS1" }] },
    },
  });
}

async function ensureDebuffPower(tx: Prisma.TransactionClient, monsterId: string, power: DebuffPowerSpec) {
  await tx.power.create({
    data: {
      monster: { connect: { id: monsterId } },
      sourceType: "MONSTER_POWER",
      sortOrder: 1,
      name: power.name,
      description:
        "Support candidate package. Primary Attack debuff is resisted by Intellect; linked low mental damage rides only when the primary succeeds.",
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
              theme: "support candidate Intellect-resisted Attack debuff",
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
              theme: "low linked mental damage rider; no new mechanic",
            },
          },
        ],
      },
      tags: { create: [{ tag: "BALANCE" }, { tag: "SUPPORT_CANDIDATE_PASS1" }] },
    },
  });
}

async function ensureCandidate(tx: Prisma.TransactionClient, spec: CandidateSpec, existingId: string | null) {
  const monster = existingId
    ? await tx.monster.update({ where: { id: existingId }, data: monsterData(spec) })
    : await tx.monster.create({ data: monsterData(spec) });
  const config = attackConfig(spec);

  await tx.monsterTag.deleteMany({ where: { monsterId: monster.id } });
  await tx.monsterTag.createMany({
    data: ["BALANCE", "SUPPORT_CANDIDATE_PASS1"].map((tag) => ({ monsterId: monster.id, tag })),
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
      attackName: spec.attack.name,
      attackConfig: config,
      equippedWeaponId: null,
    },
  });
  await tx.monsterNaturalAttack.upsert({
    where: { monsterId: monster.id },
    create: { monsterId: monster.id, attackName: spec.attack.name, attackConfig: config },
    update: { attackName: spec.attack.name, attackConfig: config },
  });

  if (spec.powers?.control) await ensureControlPower(tx, monster.id, spec.powers.control);
  if (spec.powers?.debuff) await ensureDebuffPower(tx, monster.id, spec.powers.debuff);

  return monster;
}

function summarize(row: CandidateRow) {
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
    hp: {
      physical: `${row.physicalResilienceCurrent}/${row.physicalResilienceMax}`,
      mental: `${row.mentalPerseveranceCurrent}/${row.mentalPerseveranceMax}`,
    },
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
      weaponSkillValue: row.weaponSkillValue,
      armorSkillValue: row.armorSkillValue,
    },
    naturalAttack: row.naturalAttack,
    attacks: row.attacks,
    powers: row.powers,
    tags: row.tags.map((tag) => tag.tag),
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

    await assertScope(prisma);
    const beforeRows = new Map<string, CandidateRow>();
    for (const candidate of CANDIDATES) beforeRows.set(candidate.name, await findCandidate(prisma, candidate.name));

    const operations = await prisma.$transaction(async (tx) => {
      const results: Array<{ name: string; id: string; operation: "created" | "updated" }> = [];
      for (const candidate of CANDIDATES) {
        const before = beforeRows.get(candidate.name) ?? null;
        const monster = await ensureCandidate(tx, candidate, before?.id ?? null);
        results.push({ name: candidate.name, id: monster.id, operation: before ? "updated" : "created" });
      }
      return results;
    });

    const afterRows = new Map<string, CandidateRow>();
    for (const candidate of CANDIDATES) afterRows.set(candidate.name, await findCandidate(prisma, candidate.name));

    console.log("Balance Environment support-role candidates pass 1 ensured.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped create/update for BALANCE_Support Candidate* rows only.");
    console.log("No existing Physical Striker, Durable Soldier, Control Hexer, Dodge Pressure Skirmisher, Legendary Elite, Boss, player, calibration, runtime, formula, scalar, tuning, UI, docs, seeder, or migration values were changed by this script.");
    console.log("No taunt, bodyguard interception, forced targeting, Pierce, Guard Break, Sunder, Expose, True Strike, minimum damage, ignore-defence, new positioning, or new AOE mechanics were introduced.");
    console.log(JSON.stringify(
      {
        operations,
        before: Object.fromEntries([...beforeRows.entries()].map(([name, row]) => [name, summarize(row)])),
        after: Object.fromEntries([...afterRows.entries()].map(([name, row]) => [name, summarize(row)])),
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
