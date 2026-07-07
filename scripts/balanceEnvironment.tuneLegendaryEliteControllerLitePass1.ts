import { loadEnvConfig } from "@next/env";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const ASSET_NAME = "BALANCE_Legendary Elite Breaker Controller Lite";
const POWER_NAME = "BALANCE_Legendary Elite Breaker Controller Lite Mind Spike";
const EXPECTED_PRIMARY_POTENCY = 1;
const EXPECTED_RIDER_BEFORE = 3;
const TARGET_RIDER_POTENCY = 4;

type PrismaClient = typeof import("../prisma/client")["prisma"];

async function loadControllerLite(prisma: PrismaClient) {
  return prisma.monster.findMany({
    where: { campaignId: BALANCE_CAMPAIGN_ID, name: ASSET_NAME },
    select: {
      id: true,
      name: true,
      campaignId: true,
      source: true,
      isReadOnly: true,
      tier: true,
      legendary: true,
      level: true,
      physicalResilienceMax: true,
      mentalPerseveranceMax: true,
      physicalProtection: true,
      mentalProtection: true,
      attackDie: true,
      guardDie: true,
      fortitudeDie: true,
      intellectDie: true,
      synergyDie: true,
      braveryDie: true,
      weaponSkillValue: true,
      armorSkillValue: true,
      naturalAttack: { select: { attackName: true, attackConfig: true } },
      powers: {
        where: { name: POWER_NAME },
        select: {
          id: true,
          name: true,
          cooldownTurns: true,
          primaryDefenceGate: true,
          effectPackets: {
            orderBy: { packetIndex: "asc" },
            select: {
              id: true,
              packetIndex: true,
              intention: true,
              diceCount: true,
              potency: true,
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
    },
  });
}

function assertScopedShape(rows: Awaited<ReturnType<typeof loadControllerLite>>) {
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one ${ASSET_NAME} in Balance Environment, found ${rows.length}.`);
  }
  const monster = rows[0];
  if (
    monster.campaignId !== BALANCE_CAMPAIGN_ID ||
    monster.source !== "CAMPAIGN" ||
    monster.isReadOnly ||
    monster.tier !== "ELITE" ||
    !monster.legendary ||
    monster.level !== 3
  ) {
    throw new Error("Refusing to tune: Controller Lite row is out of approved scope.");
  }
  if (monster.powers.length !== 1) {
    throw new Error(`Expected exactly one ${POWER_NAME}, found ${monster.powers.length}.`);
  }
  const power = monster.powers[0];
  const [primary, rider] = power.effectPackets;
  if (!primary || !rider || power.effectPackets.length !== 2) {
    throw new Error(`Expected ${POWER_NAME} to have exactly two packets.`);
  }
  if (
    primary.packetIndex !== 0 ||
    primary.intention !== "CONTROL" ||
    primary.diceCount !== 3 ||
    primary.potency !== EXPECTED_PRIMARY_POTENCY ||
    primary.effectDurationType !== "TURNS" ||
    primary.effectDurationTurns !== 1 ||
    primary.dealsWounds ||
    primary.woundChannel !== null ||
    primary.targetedAttribute !== "INTELLECT" ||
    primary.applyTo !== "PRIMARY_TARGET" ||
    primary.secondaryDependencyMode !== null
  ) {
    throw new Error("Refusing to tune: primary Control packet no longer matches the approved weak-gate shape.");
  }
  if (
    rider.packetIndex !== 1 ||
    rider.intention !== "ATTACK" ||
    rider.diceCount !== 0 ||
    rider.effectDurationType !== "INSTANT" ||
    rider.dealsWounds !== true ||
    rider.woundChannel !== "MENTAL" ||
    rider.targetedAttribute !== null ||
    rider.applyTo !== "PRIMARY_TARGET" ||
    rider.secondaryDependencyMode !== "LINKED_TO_PRIMARY"
  ) {
    throw new Error("Refusing to tune: linked mental damage rider no longer matches the approved shape.");
  }
  if (rider.potency !== EXPECTED_RIDER_BEFORE && rider.potency !== TARGET_RIDER_POTENCY) {
    throw new Error(`Refusing to tune: expected rider potency ${EXPECTED_RIDER_BEFORE} or ${TARGET_RIDER_POTENCY}, found ${rider.potency}.`);
  }
  return { monster, power, primary, rider };
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

    const beforeRows = await loadControllerLite(prisma);
    const before = assertScopedShape(beforeRows);
    const operation = before.rider.potency === TARGET_RIDER_POTENCY ? "unchanged" : "updated";

    if (operation === "updated") {
      await prisma.effectPacket.update({
        where: { id: before.rider.id },
        data: { potency: TARGET_RIDER_POTENCY },
      });
    }

    const afterRows = await loadControllerLite(prisma);
    const after = assertScopedShape(afterRows);

    console.log("Balance Environment Controller Lite linked rider tuning pass 1 applied.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log(`asset: ${ASSET_NAME}`);
    console.log(`operation: ${operation}`);
    console.log("DB mutation scope: one EffectPacket.potency field on the linked secondary mental damage rider only.");
    console.log("No primary Control dice/gate/resist/potency/duration/cooldown values were changed.");
    console.log("No natural attack, durability, protection, defence, player, other monster, calibration, runtime, formula, scalar, tuning, UI, or docs values were changed.");
    console.log("No Pierce, Guard Break, Sunder, Crush, Expose, Overwhelm, True Strike, minimum damage, secondary Debuff, or new mechanic was introduced.");
    console.log(JSON.stringify(
      {
        monsterId: after.monster.id,
        powerId: after.power.id,
        primaryControl: {
          packetId: after.primary.id,
          diceCount: after.primary.diceCount,
          potency: after.primary.potency,
          resistedBy: after.primary.targetedAttribute,
          durationTurns: after.primary.effectDurationTurns,
          cooldownTurns: after.power.cooldownTurns,
        },
        linkedMentalDamageRider: {
          packetId: after.rider.id,
          beforePotency: before.rider.potency,
          afterPotency: after.rider.potency,
          woundChannel: after.rider.woundChannel,
          secondaryDependencyMode: after.rider.secondaryDependencyMode,
          damageTypes: (after.rider.detailsJson as { damageTypes?: unknown })?.damageTypes ?? null,
        },
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
